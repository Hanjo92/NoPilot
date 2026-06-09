import * as vscode from 'vscode';
import { ProviderManager } from '../providers/providerManager';
import type {
  ChatConversationMessage,
  CompletionRequest,
} from '../types';
import {
  extractFirstMarkdownCodeBlock,
  stripMarkdownCodeFences,
} from '../features/inlineText';
import { logError } from '../utils/logger';
import { getChatViewBody } from './chatViewBody';
import { getChatViewScript } from './chatViewScript';
import { getChatViewStyles } from './chatViewStyles';

interface ChatViewMessage {
  command: 'requestState' | 'clearChat';
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

interface ChatTranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

interface ChatViewState {
  providerLabel: string;
  providerDescription: string;
  contextLabel: string;
  contextDescription: string;
  messages: ChatTranscriptEntry[];
  isPending: boolean;
  errorMessage?: string;
}

export class NoPilotChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'nopilot.chatView';
  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly messages: ChatTranscriptEntry[] = [];
  private isPending = false;
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

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
    };
    view.webview.html = this.getHtml();

    this.disposables.push(
      view.webview.onDidReceiveMessage((message: IncomingChatViewMessage) => {
        void this.handleMessage(message);
      })
    );

    this.postState();
  }

  async show(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.nopilot');
    this.view?.show?.(true);
    this.postState();
  }

  dispose(): void {
    this.view = undefined;
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
        response.text.trim() || 'No response returned.'
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

    const cleanedContent = (
      extractFirstMarkdownCodeBlock(chatMessage.content) ??
      stripMarkdownCodeFences(chatMessage.content)
    ).trim();
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
    const history = this.messages
      .filter((message) => !message.pending)
      .slice(-10)
      .map<ChatConversationMessage>((message) => ({
        role: message.role,
        content: message.content,
      }));

    if (!editor) {
      return {
        mode: 'chat',
        prefix: '',
        suffix: '',
        language: 'plaintext',
        filename: 'untitled',
        chatPrompt: prompt,
        chatHistory: history.slice(0, -1),
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
      chatHistory: history.slice(0, -1),
      maxTokens: 1200,
    };
  }

  private postState(): void {
    if (!this.view) {
      return;
    }

    void this.view.webview.postMessage({
      command: 'updateState',
      state: this.buildState(),
    });
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
