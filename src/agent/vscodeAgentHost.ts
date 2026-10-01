import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { Cancellation, cancellable, checkCancellation } from './cancellation';
import { assertUnchanged, DocumentSnapshot } from './editSafety';
import { EditReview, snapshot } from './editReview';
import { VerificationScript } from './protocol';
import { executeVerification, verificationPlan } from './verification';
import { isWithinRoot, WorkspaceScope } from './workspaceScope';
import { WorkspaceTools } from './workspaceTools';
import { ToolResult } from './runner';

export async function selectAgentScope(token: Cancellation): Promise<WorkspaceScope> {
  if (!vscode.workspace.isTrusted) { throw new Error('Agent mode requires a trusted workspace.'); }
  const folders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
  if (!folders.length) { throw new Error('Open a local workspace folder to run Agent mode.'); }
  const folder = folders.length === 1 ? folders[0] : await cancellable(vscode.window.showQuickPick(
    folders.map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { title: 'Choose the one workspace folder this Agent run may access' }
  ), token).then(item => item?.folder);
  checkCancellation(token);
  if (!folder) { throw new Error('No workspace folder selected.'); }
  return WorkspaceScope.create(folder.uri.fsPath);
}

export interface VerificationApproval {
  confirm(message: string, options: vscode.MessageOptions, action: string): Thenable<string | undefined>;
}
const defaultApproval: VerificationApproval = {
  confirm: (message, options, action) => vscode.window.showWarningMessage(message, options, action),
};

async function openScopedDocument(absolute: string): Promise<vscode.TextDocument> {
  // VS Code can hold distinct buffers for aliases of the same physical file. Never overwrite one through another URI.
  for (const document of vscode.workspace.textDocuments) {
    if (document.uri.scheme !== 'file' || document.uri.fsPath === absolute) { continue; }
    const real = await fs.realpath(document.uri.fsPath).catch(() => undefined);
    if (real === absolute) {
      throw new Error(`This file is already open through another path. Close that editor and reopen ${absolute} before running Agent.`);
    }
  }
  return vscode.workspace.openTextDocument(vscode.Uri.file(absolute));
}

async function dirtyWorkspaceDocuments(scope: WorkspaceScope): Promise<vscode.TextDocument[]> {
  const documents: vscode.TextDocument[] = [];
  for (const document of vscode.workspace.textDocuments) {
    if (!document.isDirty || document.uri.scheme !== 'file') { continue; }
    const real = await fs.realpath(document.uri.fsPath).catch(() => document.uri.fsPath);
    if (isWithinRoot(scope.root, real)) { documents.push(document); }
  }
  return documents;
}

export function createWorkspaceTools(scope: WorkspaceScope, review: EditReview, token: Cancellation, approval = defaultApproval): WorkspaceTools {
  return new WorkspaceTools(scope, {
    read: async absolute => snapshot(await openScopedDocument(absolute)),
    review: (edits, summary, validate) => review.apply(edits, token, summary, async () => {
      await validate();
      for (const edit of edits) { await openScopedDocument(vscode.Uri.parse(edit.before.uri).fsPath); }
    }),
    verify: (script, applied) => verify(scope, script, applied, token, approval),
  }, token);
}

async function verify(scope: WorkspaceScope, script: VerificationScript, applied: ReadonlyMap<string, DocumentSnapshot>, token: Cancellation, approval: VerificationApproval): Promise<ToolResult> {
  checkCancellation(token);
  if (!vscode.workspace.isTrusted) { throw new Error('Workspace trust was revoked.'); }
  const packagePath = await scope.resolve('package.json');
  if (process.platform === 'win32') { throw new Error('Command verification is currently supported on macOS/Linux only.'); }
  const packageDocument = await openScopedDocument(packagePath);
  const packageBefore = snapshot(packageDocument);
  const plan = verificationPlan(scope.root, packageBefore.text, script);
  const dirty = await dirtyWorkspaceDocuments(scope);
  for (const document of dirty) {
    const approved = applied.get(document.uri.toString());
    if (!approved) { throw new Error(`Save your existing edits before verification: ${document.uri.fsPath}`); }
    assertUnchanged(approved, snapshot(document));
  }
  const choice = await cancellable(approval.confirm(
    `Run npm ${script} in ${scope.root}?`,
    { modal: true, detail: `Command: npm --ignore-scripts run ${script}\nScript: ${plan.body}\n\n${dirty.length ? `Save these approved buffers first:\n${dirty.map(d => d.uri.fsPath).join('\n')}\n\n` : ''}This executes project code with your user permissions. It can write/delete files, launch programs, and access the network. It is not sandboxed. npm pre/post hooks are disabled. Output (up to 16,000 characters) will be sent to the selected model. Timeout: 120 seconds.` },
    'Approve Save and Run'
  ), token, 600_000);
  checkCancellation(token);
  if (choice !== 'Approve Save and Run') { return { text: 'Verification approval declined. No command ran. Agent stopped.', stop: true }; }
  if (!vscode.workspace.isTrusted) { throw new Error('Workspace trust was revoked.'); }
  assertUnchanged(packageBefore, snapshot(packageDocument));
  // Revalidate every dirty buffer before the first save to preserve user edits made during review.
  for (const document of dirty) { assertUnchanged(applied.get(document.uri.toString())!, snapshot(document)); }
  for (const document of dirty) {
    checkCancellation(token);
    await scope.resolve(scope.relative(document.uri.fsPath));
    assertUnchanged(applied.get(document.uri.toString())!, snapshot(document));
    if (!await document.save()) { throw new Error(`Could not save ${document.uri.fsPath}. No command ran.`); }
  }
  if ((await dirtyWorkspaceDocuments(scope)).length) {
    throw new Error('Workspace buffers changed while approving/saving. No command ran.');
  }
  if (await fs.readFile(await scope.resolve('package.json'), 'utf8') !== plan.packageText) {
    throw new Error('package.json changed while approving/saving. No command ran; request approval again.');
  }
  checkCancellation(token);
  const result = await executeVerification(plan, token);
  const changedBuffers = (await dirtyWorkspaceDocuments(scope)).length;
  return { text: result + (changedBuffers ? '\nWorkspace buffers changed during verification. This result does not validate the current unsaved changes.' : '') };
}
