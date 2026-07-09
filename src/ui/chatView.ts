import * as vscode from 'vscode';
import { ProviderManager } from '../providers/providerManager';
import type { CompletionRequest } from '../types';
import { logError } from '../utils/logger';
import { getChatViewBody } from './chatViewBody';
import {
  buildChatRequestHistory,
  ChatTranscriptEntry,
  normalizeAssistantResponseContent,
  normalizeChatResponseForApply,
} from './chatViewModel';
import { getChatViewScript } from './chatViewScript';
import { getChatViewStyles } from './chatViewStyles';

interface ChatViewMessage {
  command: 'requestState' | 'clearChat' | 'refreshConnection';
}

interface SubmitChatMessage {
  command: 'submitChat';
  prompt: string;
}

interface ApplyResponseMessage {
  command: 'applyResponse';
  messageId: string;
  mode: 'insert' | 'replace';
}

type IncomingChatViewMessage =
  | ChatViewMessage
  | SubmitChatMessage
  | ApplyResponseMessage;

interface ChatViewState {
  providerLabel: string;
  providerDescription: string;
  contextLabel: string;
  contextDescription: string;
  messages: ChatTranscriptEntry[];
  isPending: boolean;
  isRefreshing: boolean;
  errorMessage?: string;
}

export class NoPilotChatViewProvider implements vscode.Disposable {
  static readonly panelType = 'nopilot.chatPanel';
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly panelDisposables: vscode.Disposable[] = [];
  private readonly messages: ChatTranscriptEntry[] = [];
  private isPending = false;
  private isRefreshing = false;
  private errorMessage: string | undefined;
  private requestSequence = 0;

  constructor(
    private readonly providerManager: ProviderManager
  ) {
    this.disposables.push(
      this.providerManager.onDidChangeProvider(() => this.postState()),
      this.providerManager.onDidChangeProviderState(() => this.postState()),
      vscode.window.onDidChangeActiveTextEditor(() => this.postState()),
      vscode.window.onDidChangeTextEditorSelection(() => this.postState())
    );
  }

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.postState();
      return;
    }

    this.disposePanelDisposables();
    this.panel = vscode.window.createWebviewPanel(
      NoPilotChatViewProvider.panelType,
      'NoPilot Chat',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    const panel = this.panel;
    panel.webview.html = this.getHtml();

    this.panelDisposables.push(
      panel.webview.onDidReceiveMessage((message: IncomingChatViewMessage) => {
        void this.handleMessage(message);
      }),
      panel.onDidDispose(() => {
        if (this.panel === panel) {
          this.panel = undefined;
        }
        this.disposePanelDisposables();
      })
    );

    this.postState();
  }

  dispose(): void {
    const panel = this.panel;
    this.panel = undefined;
    this.disposePanelDisposables();
    panel?.dispose();
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private async handleMessage(message: IncomingChatViewMessage): Promise<void> {
    switch (message.command) {
      case 'requestState':
        this.postState();
        return;
      case 'clearChat':
        if (this.isPending) {
          return;
        }
        this.messages.length = 0;
        this.errorMessage = undefined;
        this.postState();
        return;
      case 'refreshConnection':
        await this.refreshConnection();
        return;
      case 'applyResponse':
        await this.applyResponse(message);
        return;
      case 'submitChat':
        await this.submitChat(message.prompt);
        return;
      default:
        return;
    }
  }

  private async refreshConnection(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;
    this.errorMessage = undefined;
    this.postState();

    try {
      await this.providerManager.refreshProviderState(this.providerManager.getActiveProviderId());
      await this.providerManager.reconcileConfiguredProvider();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      logError('NoPilot chat panel connection refresh failed', error);
    } finally {
      this.isRefreshing = false;
      this.postState();
    }
  }

  private async submitChat(prompt: string): Promise<void> {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || this.isPending) {
      return;
    }

    const requestId = ++this.requestSequence;
    this.errorMessage = undefined;
    this.isPending = true;
    this.messages.push({
      id: `user-${requestId}`,
      role: 'user',
      content: trimmedPrompt,
    });
    this.messages.push({
      id: `assistant-${requestId}`,
      role: 'assistant',
      content: 'Working on it...',
      pending: true,
    });
    this.postState();

    try {
      const response = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: 'NoPilot Chat',
        },
        async (_, token) => {
          const request = this.buildChatRequest(trimmedPrompt);
          return this.providerManager.complete(request, token);
        }
      );

      this.replacePendingAssistantMessage(
        requestId,
        normalizeAssistantResponseContent(response.text) ?? 'No response returned.'
      );
    } catch (error) {
      this.replacePendingAssistantMessage(
        requestId,
        'The request failed before a response was returned.'
      );
      this.errorMessage =
        error instanceof Error ? error.message : String(error);
      logError('NoPilot chat panel request failed', error);
    } finally {
      this.isPending = false;
      this.postState();
    }
  }

  private async applyResponse(message: ApplyResponseMessage): Promise<void> {
    const chatMessage = this.messages.find((entry) => entry.id === message.messageId);
    if (!chatMessage || chatMessage.role !== 'assistant' || chatMessage.pending) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showErrorMessage('No active text editor for NoPilot Chat');
      return;
    }

    const selection = editor.selection;
    if (message.mode === 'replace' && selection.isEmpty) {
      void vscode.window.showErrorMessage('Select code before using Replace Selection in NoPilot Chat');
      return;
    }

    const cleanedContent = normalizeChatResponseForApply(chatMessage.content);
    if (!cleanedContent) {
      void vscode.window.showErrorMessage('NoPilot Chat could not find any content to apply');
      return;
    }

    const targetRange = message.mode === 'replace' && !selection.isEmpty
      ? selection
      : new vscode.Range(selection.active, selection.active);

    const didEdit = await editor.edit((editBuilder) => {
      if (message.mode === 'replace' && !selection.isEmpty) {
        editBuilder.replace(targetRange, cleanedContent);
        return;
      }

      editBuilder.insert(selection.active, cleanedContent);
    });

    if (!didEdit) {
      void vscode.window.showErrorMessage('NoPilot Chat could not apply the response to the editor');
    }
  }

  private replacePendingAssistantMessage(requestId: number, content: string): void {
    const pendingIndex = this.messages.findIndex((message) => message.id === `assistant-${requestId}`);
    if (pendingIndex < 0) {
      this.messages.push({
        id: `assistant-${requestId}`,
        role: 'assistant',
        content,
      });
      return;
    }

    this.messages[pendingIndex] = {
      id: `assistant-${requestId}`,
      role: 'assistant',
      content,
    };
  }

  private buildChatRequest(prompt: string): CompletionRequest {
    const editor = vscode.window.activeTextEditor;
    const history = buildChatRequestHistory(this.messages);

    if (!editor) {
      return {
        mode: 'chat',
        prefix: '',
        suffix: '',
        language: 'plaintext',
        filename: 'untitled',
        chatPrompt: prompt,
        chatHistory: history,
        maxTokens: 1200,
      };
    }

    const document = editor.document;
    const selection = editor.selection;
    const selectionText = selection.isEmpty ? '' : document.getText(selection);
    const contextStart = selection.isEmpty ? selection.active : selection.start;
    const contextEnd = selection.isEmpty ? selection.active : selection.end;
    const prefixStartLine = Math.max(0, contextStart.line - 40);
    const suffixEndLine = Math.min(document.lineCount - 1, contextEnd.line + 40);
    const prefixRange = new vscode.Range(new vscode.Position(prefixStartLine, 0), contextStart);
    const suffixRange = new vscode.Range(contextEnd, document.lineAt(suffixEndLine).range.end);

    return {
      mode: 'chat',
      prefix: document.getText(prefixRange),
      suffix: document.getText(suffixRange),
      selection: selectionText,
      language: document.languageId,
      filename: document.fileName.split(/[/\\]/).pop() || 'untitled',
      chatPrompt: prompt,
      chatHistory: history,
      maxTokens: 1200,
    };
  }

  private postState(): void {
    const panel = this.panel;
    if (!panel) {
      return;
    }

    try {
      void panel.webview.postMessage({
        command: 'updateState',
        state: this.buildState(),
      }).then(undefined, (error) => {
        if (this.panel === panel) {
          this.panel = undefined;
          this.disposePanelDisposables();
        }
        logError('NoPilot chat panel state update failed', error);
      });
    } catch (error) {
      if (this.panel === panel) {
        this.panel = undefined;
        this.disposePanelDisposables();
      }
      logError('NoPilot chat panel state update failed', error);
    }
  }

  private buildState(): ChatViewState {
    const activeProvider = this.providerManager.getActiveProvider();
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      return {
        providerLabel: this.providerManager.getActiveDisplayName(),
        providerDescription: activeProvider.info.description,
        contextLabel: 'No active editor',
        contextDescription: 'Open a file to give the chat panel current-code context.',
        messages: [...this.messages],
        isPending: this.isPending,
        isRefreshing: this.isRefreshing,
        errorMessage: this.errorMessage,
      };
    }

    const document = editor.document;
    const selection = editor.selection;
    const selectionDescription = selection.isEmpty
      ? 'No selection. The prompt will use the current cursor neighborhood.'
      : `Selection length: ${document.getText(selection).length} characters.`;

    return {
      providerLabel: this.providerManager.getActiveDisplayName(),
      providerDescription: activeProvider.info.description,
      contextLabel: `${document.fileName.split(/[/\\]/).pop() || 'untitled'} · ${document.languageId}`,
      contextDescription: selectionDescription,
      messages: [...this.messages],
      isPending: this.isPending,
      isRefreshing: this.isRefreshing,
      errorMessage: this.errorMessage,
    };
  }

  private getHtml(): string {
    const nonce = createNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>NoPilot Chat</title>
  <style nonce="${nonce}">
${indentBlock(getChatViewStyles())}
  </style>
</head>
<body>
${indentBlock(getChatViewBody(), 2)}

  <script nonce="${nonce}">
${indentBlock(getChatViewScript())}
  </script>
</body>
</html>`;
  }

  private disposePanelDisposables(): void {
    const disposables = this.panelDisposables.splice(0);
    disposables.forEach((disposable) => disposable.dispose());
  }
}

function indentBlock(text: string, indent = 4): string {
  const prefix = ' '.repeat(indent);
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function createNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
