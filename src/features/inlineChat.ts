import * as vscode from 'vscode';
import { ProviderManager } from '../providers/providerManager';
import { CompletionRequest } from '../types';
import { log, logError } from '../utils/logger';
import { stripMarkdownCodeFences } from './inlineText';

export async function handleInlineChat(providerManager: ProviderManager) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active text editor for NoPilot Inline Chat');
    return;
  }

  const instruction = await vscode.window.showInputBox({
    prompt: 'NoPilot: How should the selected code be modified?',
    placeHolder: 'e.g. Make this async, Refactor to LINQ, Add logging...'
  });

  if (!instruction) {
    return; // Cancelled
  }

  const document = editor.document;
  const selection = editor.selection;

  // If no selection, select the current line
  let targetRange: vscode.Range = selection;
  if (selection.isEmpty) {
    targetRange = document.lineAt(selection.start.line).range;
  }

  const selectionText = document.getText(targetRange);

  // Extract limits to prevent huge payloads
  const prefixStartLine = Math.max(0, targetRange.start.line - 50);
  const prefixRange = new vscode.Range(new vscode.Position(prefixStartLine, 0), targetRange.start);
  const prefix = document.getText(prefixRange);

  const suffixEndLine = Math.min(document.lineCount - 1, targetRange.end.line + 50);
  const suffixRange = new vscode.Range(targetRange.end, document.lineAt(suffixEndLine).range.end);
  const suffix = document.getText(suffixRange);

  const request: CompletionRequest = {
    prefix,
    suffix,
    selection: selectionText,
    instruction,
    language: document.languageId,
    filename: document.fileName.split(/[/\\]/).pop() || 'unknown',
    maxTokens: selectionText.length > 300 ? 1500 : 500
  };

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'NoPilot: Generating modification...',
      cancellable: true
    },
    async (progress, token) => {
      try {
        const response = await providerManager.complete(request, token);

        if (token.isCancellationRequested || !response.text) {
          return;
        }

        const cleaned = stripMarkdownCodeFences(response.text);

        const success = await editor.edit((editBuilder) => {
          editBuilder.replace(targetRange, cleaned);
        });

        if (success) {
            log(`Inline Chat replaced code successfully.`);
        }
      } catch (error) {
         logError('Inline Chat Failed', error);
         vscode.window.showErrorMessage('NoPilot Inline Chat failed to generate code.');
      }
    }
  );
}
