import { Cancellation, checkCancellation } from './cancellation';
import { DocumentSnapshot, ProposedEdit, assertUnchanged, exactPatch } from './editSafety';
import { AgentAction, VerificationScript } from './protocol';
import { ToolResult } from './runner';
import { MAX_FILE_BYTES, WorkspaceScope } from './workspaceScope';

export interface WorkspaceToolHost {
  read(absolutePath: string): Promise<DocumentSnapshot>;
  review(edits: readonly ProposedEdit[], summary: string, validateScope: () => Promise<void>): Promise<boolean>;
  verify(script: VerificationScript, applied: ReadonlyMap<string, DocumentSnapshot>): Promise<ToolResult>;
}

export class WorkspaceTools {
  private readonly reads = new Map<string, DocumentSnapshot>();
  private readonly applied = new Map<string, DocumentSnapshot>();
  constructor(private readonly scope: WorkspaceScope, private readonly host: WorkspaceToolHost, private readonly token: Cancellation) {}

  private async read(relative: string): Promise<DocumentSnapshot> {
    checkCancellation(this.token);
    const absolute = await this.scope.resolve(relative);
    const document = await this.host.read(absolute);
    await this.scope.resolve(relative);
    if (document.text.length > MAX_FILE_BYTES || document.text.includes('\0') || document.text.includes('\ufffd')) {
      throw new Error('Only small UTF-8 text files are supported.');
    }
    checkCancellation(this.token);
    return document;
  }

  async execute(action: Exclude<AgentAction, { kind: 'done' }>): Promise<ToolResult> {
    checkCancellation(this.token);
    switch (action.kind) {
      case 'list': return { text: JSON.stringify(await this.scope.list(action.query, this.token)) };
      case 'read': {
        const document = await this.read(action.path);
        this.reads.set(action.path, document);
        return { text: JSON.stringify({ path: action.path, version: document.version, content: document.text }) };
      }
      case 'search': {
        const listing = await this.scope.list('', this.token);
        const matches: { path: string; line: number; text: string }[] = [];
        let skipped = 0;
        let scanned = 0;
        for (const path of listing.paths.slice(0, 100)) {
          checkCancellation(this.token);
          try {
            const document = await this.read(path);
            scanned++;
            const lines = document.text.split('\n');
            for (let i = 0; i < lines.length && matches.length < 30; i++) {
              if (lines[i].includes(action.query)) { matches.push({ path, line: i + 1, text: lines[i].slice(0, 300) }); }
            }
          } catch { checkCancellation(this.token); skipped++; }
          if (matches.length >= 30) { break; }
        }
        return { text: JSON.stringify({ matches, scanned, skipped, truncated: listing.truncated || listing.paths.length > 100 || matches.length >= 30 }) };
      }
      case 'patch': {
        const edits: ProposedEdit[] = [];
        for (const edit of action.edits) {
          const before = this.reads.get(edit.path);
          if (!before) { throw new Error(`Read ${edit.path} before proposing a patch.`); }
          assertUnchanged(before, await this.read(edit.path));
          edits.push(exactPatch(before, edit.oldText, edit.newText, edit.path));
        }
        const validate = async () => {
          for (const edit of action.edits) { await this.scope.resolve(edit.path); }
        };
        checkCancellation(this.token);
        const applied = await this.host.review(edits, action.summary, validate);
        checkCancellation(this.token);
        if (!applied) { return { text: 'Change approval declined. Run stopped; no changes from this proposal were applied.', stop: true }; }
        for (const edit of action.edits) {
          this.reads.delete(edit.path);
          const current = await this.read(edit.path);
          if (current.text !== edits.find(proposal => proposal.label === edit.path)!.after) {
            throw new Error(`Applied ${edit.path}, but its content changed immediately afterwards. Review the current buffer; it will not be automatically saved.`);
          }
          this.applied.set(current.uri, current);
        }
        return { text: `Applied to editor buffers (NoPilot did not save; VS Code Auto Save may save): ${action.edits.map(e => e.path).join(', ')}. Read again before further edits. Verification requires a separate save/run approval.` };
      }
      case 'verify': {
        const result = await this.host.verify(action.script, this.applied);
        // Commands may change any file. Every later patch requires a new read.
        this.reads.clear();
        return result;
      }
    }
  }
}
