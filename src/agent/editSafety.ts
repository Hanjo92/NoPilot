import { Cancellation, checkCancellation } from './cancellation';

export interface DocumentSnapshot {
  uri: string;
  version: number;
  text: string;
}
export interface EditTarget extends DocumentSnapshot {
  start: number;
  end: number;
  cursor: number;
}
export interface ProposedEdit {
  before: DocumentSnapshot;
  after: string;
  label: string;
}

export function assertUnchanged(before: DocumentSnapshot, current: DocumentSnapshot): void {
  if (before.uri !== current.uri || before.version !== current.version || before.text !== current.text) {
    throw new Error('The original document changed or was reopened. Request a fresh response before applying edits.');
  }
}

export function responseEdit(target: EditTarget, content: string, mode: 'insert' | 'replace'): ProposedEdit {
  if (![target.start, target.end, target.cursor].every(n => Number.isInteger(n) && n >= 0 && n <= target.text.length)
    || target.start > target.end) { throw new Error('Invalid original selection.'); }
  if (mode === 'replace' && target.start === target.end) { throw new Error('The original request had no selection to replace.'); }
  if (!content.trim()) { throw new Error('No content to apply.'); }
  const start = mode === 'replace' ? target.start : target.cursor;
  const end = mode === 'replace' ? target.end : target.cursor;
  return { before: target, after: target.text.slice(0, start) + content + target.text.slice(end), label: target.uri };
}

export function exactPatch(before: DocumentSnapshot, oldText: string, newText: string, label: string): ProposedEdit {
  if (!oldText || oldText === newText) { throw new Error('Patch must replace non-empty text with a different value.'); }
  const start = before.text.indexOf(oldText);
  if (start < 0 || before.text.indexOf(oldText, start + 1) >= 0) {
    throw new Error('Patch text must match exactly once. Read the file and include more surrounding context.');
  }
  return { before, after: before.text.slice(0, start) + newText + before.text.slice(start + oldText.length), label };
}

export interface EditReviewHost {
  read(uri: string): Promise<DocumentSnapshot>;
  approve(edits: readonly ProposedEdit[], token: Cancellation): Promise<boolean>;
  /** Recheck live document versions synchronously before dispatching one atomic edit. */
  apply(edits: readonly ProposedEdit[]): Promise<boolean>;
}

export async function reviewAndApply(edits: readonly ProposedEdit[], host: EditReviewHost, token: Cancellation): Promise<boolean> {
  if (!edits.length || new Set(edits.map(e => e.before.uri)).size !== edits.length) {
    throw new Error('A change set must contain unique files.');
  }
  const validate = async () => {
    checkCancellation(token);
    for (const edit of edits) {
      assertUnchanged(edit.before, await host.read(edit.before.uri));
      checkCancellation(token);
    }
  };
  await validate();
  if (!await host.approve(edits, token)) { return false; }
  await validate();
  checkCancellation(token);
  if (!await host.apply(edits)) { throw new Error('VS Code rejected the change set. No successful apply was recorded.'); }
  return true;
}
