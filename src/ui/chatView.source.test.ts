import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readChatViewSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/ui/chatView.ts'),
    'utf8'
  );
}

test('chat view provider keeps transcript state, editor context, and apply actions wired', () => {
  const source = readChatViewSource();

  assert.match(source, /export class NoPilotChatViewProvider implements vscode\.WebviewViewProvider, vscode\.Disposable/);
  assert.match(source, /static readonly viewType = 'nopilot\.chatView';/);
  assert.match(source, /private readonly messages: ChatTranscriptEntry\[\] = \[\];/);
  assert.match(source, /this\.providerManager\.onDidChangeProvider\(\(\) => this\.postState\(\)\)/);
  assert.match(source, /vscode\.window\.onDidChangeTextEditorSelection\(\(\) => this\.postState\(\)\)/);
  assert.match(source, /await vscode\.commands\.executeCommand\('workbench\.view\.extension\.nopilot'\);/);
  assert.match(source, /view\.webview\.onDidReceiveMessage\(\(message: IncomingChatViewMessage\) => \{/);
  assert.match(source, /case 'submitChat':/);
  assert.match(source, /case 'applyResponse':/);
  assert.match(source, /chatPrompt: prompt,/);
  assert.match(source, /chatHistory: history\.slice\(0, -1\),/);
  assert.match(source, /extractFirstMarkdownCodeBlock\(chatMessage\.content\)/);
  assert.match(source, /stripMarkdownCodeFences\(chatMessage\.content\)/);
  assert.match(source, /Select code before using Replace Selection in NoPilot Chat/);
  assert.match(source, /Selection length: \$\{document\.getText\(selection\)\.length\} characters\./);
  assert.match(source, /Open a file to give the chat panel current-code context\./);
});
