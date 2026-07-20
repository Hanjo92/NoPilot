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

function assertAppearsInOrder(source: string, snippets: string[]): void {
  let cursor = -1;

  for (const snippet of snippets) {
    const nextIndex = source.indexOf(snippet, cursor + 1);
    assert.ok(nextIndex > cursor, `Expected snippet to appear after previous snippet: ${snippet}`);
    cursor = nextIndex;
  }
}

test('chat view provider keeps transcript state, editor context, and apply actions wired', () => {
  const source = readChatViewSource();

  assert.match(source, /export class NoPilotChatViewProvider implements vscode\.Disposable/);
  assert.match(source, /import type \{ ChatPanelMode, CompletionRequest \} from '\.\.\/types';/);
  assert.match(source, /static readonly panelType = 'nopilot\.chatPanel';/);
  assert.doesNotMatch(source, /WebviewViewProvider/);
  assert.doesNotMatch(source, /resolveWebviewView/);
  assert.match(source, /vscode\.window\.createWebviewPanel\(\s*NoPilotChatViewProvider\.panelType,/);
  assert.match(source, /retainContextWhenHidden: true/);
  assert.match(source, /import \{\s*buildChatRequestHistory,\s*ChatTranscriptEntry,\s*normalizeAssistantResponseContent,\s*normalizeChatResponseForApply,\s*\} from '\.\/chatViewModel';/);
  assert.match(source, /private readonly messages: ChatTranscriptEntry\[\] = \[\];/);
  assert.match(source, /private readonly panelDisposables: vscode\.Disposable\[\] = \[\];/);
  assert.match(source, /private chatMode: ChatPanelMode = 'agent';/);
  assert.match(source, /this\.providerManager\.onDidChangeProvider\(\(\) => this\.postState\(\)\)/);
  assert.match(source, /vscode\.window\.onDidChangeTextEditorSelection\(\(\) => this\.postState\(\)\)/);
  assert.match(source, /panel\.webview\.onDidReceiveMessage\(\(message: IncomingChatViewMessage\) => \{/);
  assert.match(source, /panel\.onDidDispose\(\(\) => \{/);
  assert.match(source, /if \(this\.panel === panel\) \{\s*this\.panel = undefined;\s*\}/);
  assert.match(source, /this\.disposePanelDisposables\(\);/);
  assert.match(source, /private disposePanelDisposables\(\): void \{/);
  assert.match(source, /case 'refreshConnection':/);
  assert.match(source, /case 'setChatMode':/);
  assert.match(source, /await this\.refreshConnection\(\);/);
  assert.match(source, /await this\.providerManager\.refreshProviderState\(this\.providerManager\.getActiveProviderId\(\)\);/);
  assert.match(source, /logError\('NoPilot chat panel state update failed', error\);/);
  assert.match(source, /case 'submitChat':/);
  assert.match(source, /case 'applyResponse':/);
  assert.match(source, /chatPrompt: prompt,/);
  assert.match(source, /chatMode: this\.chatMode,/);
  assert.match(source, /normalizeAssistantResponseContent\(response\.text\) \?\? 'No response returned\.'/);
  assert.match(source, /const history = buildChatRequestHistory\(this\.messages\);/);
  assert.match(source, /chatHistory: history,/);
  assert.match(source, /const workspaceContext = buildAgentWorkspaceContext\(editor\);/);
  assert.match(source, /workspaceContext,/);
  assert.match(source, /workspaceContext: buildAgentWorkspaceContext\(undefined\),/);
  assert.match(source, /const cleanedContent = normalizeChatResponseForApply\(chatMessage\.content\);/);
  assert.match(source, /NoPilot Chat could not find any content to apply/);
  assert.match(source, /Select code before using Replace Selection in NoPilot Chat/);
  assert.match(source, /Selection length: \$\{document\.getText\(selection\)\.length\} characters\./);
  assert.match(source, /Open a file to give the chat panel current-code context\./);
  assert.match(source, /function getChatModePresentation\(mode: ChatPanelMode\): ChatModePresentation/);
  assert.match(source, /function buildAgentWorkspaceContext\(editor: vscode\.TextEditor \| undefined\)/);
});

test('chat panel show creates the standalone panel before wiring state updates', () => {
  const source = readChatViewSource();

  assertAppearsInOrder(source, [
    'this.panel = vscode.window.createWebviewPanel(',
    'panel.webview.html = this.getHtml();',
    'panel.webview.onDidReceiveMessage((message: IncomingChatViewMessage) => {',
    'this.postState();',
  ]);
});
