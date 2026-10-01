import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { Cancellation, cancellable, checkCancellation } from './cancellation';
import { assertUnchanged, DocumentSnapshot, ProposedEdit, reviewAndApply } from './editSafety';

export function snapshot(document: vscode.TextDocument): DocumentSnapshot {
  return { uri: document.uri.toString(), version: document.version, text: document.getText() };
}

export interface ReviewDialogs {
  confirm(message: string, options: vscode.MessageOptions, action: string): Thenable<string | undefined>;
}

/** Immutable virtual documents keep the displayed proposal identical to the approved edit. */
export class EditReview implements vscode.Disposable {
  private readonly contents = new Map<string, string>();
  private readonly registration: vscode.Disposable;
  private readonly reviewId = randomUUID();
  private sequence = 0;
  private busy = false;
  constructor(private readonly dialogs: ReviewDialogs = { confirm: (message, options, action) => vscode.window.showWarningMessage(message, options, action) }) {
    this.registration = vscode.workspace.registerTextDocumentContentProvider('nopilot-review', {
      provideTextDocumentContent: uri => this.contents.get(uri.toString()) ?? '',
    });
  }
  dispose(): void { this.registration.dispose(); this.contents.clear(); }

  async apply(edits: readonly ProposedEdit[], token: Cancellation, summary: string, validateScope?: () => Promise<void>): Promise<boolean> {
    if (this.busy) { throw new Error('Another change review is already open.'); }
    if (!vscode.workspace.isTrusted) { throw new Error('Trust this workspace before applying changes.'); }
    this.busy = true;
    const documents = new Map<string, vscode.TextDocument>();
    const reviewUris: vscode.Uri[] = [];
    try {
      return await reviewAndApply(edits, {
        read: async uri => {
          await validateScope?.();
          const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
          documents.set(uri, document);
          return snapshot(document);
        },
        approve: async proposed => {
          for (const edit of proposed) {
            checkCancellation(token);
            const id = ++this.sequence;
            const before = vscode.Uri.parse(`nopilot-review:/${this.reviewId}/change-${id}/before`);
            const after = vscode.Uri.parse(`nopilot-review:/${this.reviewId}/change-${id}/after`);
            reviewUris.push(before, after);
            this.contents.set(before.toString(), edit.before.text);
            this.contents.set(after.toString(), edit.after);
            await vscode.commands.executeCommand('vscode.diff', before, after, `NoPilot: ${edit.label}`, { preview: false });
            checkCancellation(token);
            const choice = await cancellable(this.dialogs.confirm(
              `Review the open diff (${reviewUris.length / 2}/${proposed.length}): ${edit.label}. ${summary}`,
              { modal: false, detail: `${summary}\n\nThe diff shows the captured original document and proposed content. Continue after reviewing it; nothing is applied yet.` },
              'Reviewed — Continue'
            ), token, 600_000);
            if (choice !== 'Reviewed — Continue') { return false; }
          }
          const choice = await cancellable(this.dialogs.confirm(
            `Apply ${proposed.length} reviewed file change(s)?`,
            { modal: true, detail: `${proposed.map(e => e.label).join('\n')}\n\nChanges go to editor buffers. VS Code Auto Save may save them; NoPilot does not run a command here. Changed original documents will be rejected. Use editor Undo to revert.` },
            'Apply Changes'
          ), token, 600_000);
          return choice === 'Apply Changes';
        },
        apply: async proposed => {
          checkCancellation(token);
          if (!vscode.workspace.isTrusted) { throw new Error('Workspace trust was revoked.'); }
          const edit = new vscode.WorkspaceEdit();
          for (const proposal of proposed) {
            const document = documents.get(proposal.before.uri)!;
            assertUnchanged(proposal.before, snapshot(document));
            edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), proposal.after);
          }
          return vscode.workspace.applyEdit(edit);
        },
      }, token);
    } finally {
      this.busy = false;
      // Existing diff tabs retain their opened text documents. Release the provider's backing strings.
      for (const uri of reviewUris) { this.contents.delete(uri.toString()); }
    }
  }
}
