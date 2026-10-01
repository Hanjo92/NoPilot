import * as vscode from 'vscode';
import { ProviderManager } from '../providers/providerManager';
import type { ChatPanelMode, CompletionRequest } from '../types';
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
import { EditReview } from '../agent/editReview';
import { EditTarget, responseEdit } from '../agent/editSafety';
import { CancelledError, cancellable, checkCancellation } from '../agent/cancellation';
import { runAgent } from '../agent/runner';
import { createWorkspaceTools, selectAgentScope } from '../agent/vscodeAgentHost';

interface ChatViewMessage {
  command: 'requestState' | 'clearChat' | 'refreshConnection' | 'cancelRequest';
}

interface SubmitChatMessage {
  command: 'submitChat';
  prompt: string;
}

interface SetChatModeMessage {
  command: 'setChatMode';
  mode: ChatPanelMode;
}

interface ApplyResponseMessage {
  command: 'applyResponse';
  messageId: string;
  mode: 'insert' | 'replace';
}

type IncomingChatViewMessage =
  | ChatViewMessage
  | SubmitChatMessage
  | SetChatModeMessage
  | ApplyResponseMessage;

interface ChatViewState {
  chatMode: ChatPanelMode;
  panelTitle: string;
  modeLead: string;
  modeLabel: string;
  modeDescription: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
  composerLabel: string;
  composerPlaceholder: string;
  composerHint: string;
  sendButtonLabel: string;
  pendingButtonLabel: string;
  providerLabel: string;
  providerDescription: string;
  contextLabel: string;
  contextDescription: string;
  messages: ChatTranscriptEntry[];
  isPending: boolean;
  isRefreshing: boolean;
  errorMessage?: string;
}

type ChatModePresentation = Omit<
  ChatViewState,
  | 'providerLabel'
  | 'providerDescription'
  | 'contextLabel'
  | 'contextDescription'
  | 'messages'
  | 'isPending'
  | 'isRefreshing'
  | 'errorMessage'
>;

export class NoPilotChatViewProvider implements vscode.Disposable {
  static readonly panelType = 'nopilot.chatPanel';
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly panelDisposables: vscode.Disposable[] = [];
  private readonly messages: ChatTranscriptEntry[] = [];
  private chatMode: ChatPanelMode = 'agent';
  private isPending = false;
  private isRefreshing = false;
  private errorMessage: string | undefined;
  private requestSequence = 0;
  private readonly targets = new Map<string, EditTarget>();
  private cancellation: vscode.CancellationTokenSource | undefined;

  constructor(
    private readonly providerManager: ProviderManager,
    private readonly editReview: EditReview
  ) {
    this.disposables.push(
      this.providerManager.onDidChangeProvider(() => { this.cancellation?.cancel(); this.postState(); }),
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
        void this.handleMessage(message).catch(error => {
          this.errorMessage = error instanceof Error ? error.message : String(error);
          this.postState();
        });
      }),
      panel.onDidDispose(() => {
        this.cancellation?.cancel();
        if (this.panel === panel) {
          this.panel = undefined;
        }
        this.disposePanelDisposables();
      })
    );

    this.postState();
  }

  dispose(): void {
    this.cancellation?.cancel();
    this.cancellation?.dispose();
    this.targets.clear();
    const panel = this.panel;
    this.panel = undefined;
    this.disposePanelDisposables();
    panel?.dispose();
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private async handleMessage(message: IncomingChatViewMessage): Promise<void> {
    if (!message || typeof message !== 'object') { return; }
    switch (message.command) {
      case 'cancelRequest':
        this.cancellation?.cancel();
        return;
      case 'requestState':
        this.postState();
        return;
      case 'clearChat':
        if (this.isPending) {
          return;
        }
        this.messages.length = 0;
        this.targets.clear();
        this.errorMessage = undefined;
        this.postState();
        return;
      case 'refreshConnection':
        await this.refreshConnection();
        return;
      case 'setChatMode':
        if (this.isPending || (message.mode !== 'ask' && message.mode !== 'agent') || message.mode === this.chatMode) {
          return;
        }
        this.chatMode = message.mode;
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

  private async refreshConnection(): Promise<void> {
    if (this.isRefreshing || this.isPending) {
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
    if (typeof prompt !== 'string' || prompt.length > 16000) { return; }
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || this.isPending) { return; }
    const requestId = ++this.requestSequence;
    const messageId = `assistant-${requestId}`;
    const mode = this.chatMode;
    const editor = vscode.window.activeTextEditor;
    // Capture the target before the first await. Applying never consults activeTextEditor.
    if (mode === 'ask' && editor && editor.document.getText().length <= 1_000_000) {
      const document = editor.document;
      this.targets.set(messageId, {
        uri: document.uri.toString(), version: document.version, text: document.getText(),
        start: document.offsetAt(editor.selection.start), end: document.offsetAt(editor.selection.end),
        cursor: document.offsetAt(editor.selection.active),
      });
      while (this.targets.size > 20) { this.targets.delete(this.targets.keys().next().value!); }
    }
    this.errorMessage = undefined;
    this.isPending = true;
    const cancellation = new vscode.CancellationTokenSource();
    this.cancellation = cancellation;
    const token = cancellation.token;
    const providerId = this.providerManager.getActiveProviderId();
    const model = this.providerManager.getActiveProvider().info.currentModel;
    const assertProvider = () => {
      checkCancellation(token);
      if (providerId !== this.providerManager.getActiveProviderId()
        || model !== this.providerManager.getActiveProvider().info.currentModel) {
        throw new Error('Provider or model changed. Start a new request.');
      }
    };
    this.messages.push({ id: `user-${requestId}`, role: 'user', content: trimmedPrompt, mode });
    this.messages.push({ id: messageId, role: 'assistant', content: 'Working on it...', pending: true, mode });
    this.postState();
    const log: string[] = [];
    try {
      let content: string;
      if (mode === 'agent') {
        const scope = await selectAgentScope(token);
        const tools = createWorkspaceTools(scope, this.editReview, token);
        let task = trimmedPrompt;
        if (editor?.document.uri.scheme === 'file') {
          try {
            const relative = scope.relative(editor.document.uri.fsPath);
            await scope.resolve(relative);
            task += `\nActive file at request time: ${relative}`;
          } catch { /* An outside/unsupported editor is not included in Agent context. */ }
        }
        content = await runAgent(task, scope.root.split('/').pop() ?? 'workspace', {
          complete: async agentProtocolPrompt => {
            assertProvider();
            const response = await this.providerManager.complete({
              mode: 'chat', chatMode: 'agent', chatPrompt: trimmedPrompt, agentProtocolPrompt,
              prefix: '', suffix: '', language: 'plaintext', filename: 'workspace', maxTokens: 4096,
            }, token);
            assertProvider();
            return response.text;
          },
          execute: action => { assertProvider(); return tools.execute(action); },
          progress: message => {
            log.push(message);
            const entry = this.messages.find(entry => entry.id === messageId);
            if (entry) { entry.content = log.join('\n').slice(-12000); }
            this.postState();
          },
        }, token);
      } else {
        const request = this.buildChatRequest(trimmedPrompt, editor);
        assertProvider();
        const response = await cancellable(this.providerManager.complete(request, token), token);
        assertProvider();
        content = normalizeAssistantResponseContent(response.text) ?? 'No response returned.';
      }
      checkCancellation(token);
      this.replacePendingAssistantMessage(requestId, log.length ? `${log.join('\n').slice(-12000)}\n\n${content}` : content);
      const entry = this.messages.find(entry => entry.id === messageId)!;
      entry.canApply = mode === 'ask' && this.targets.has(messageId);
    } catch (error) {
      const cancelled = error instanceof CancelledError || token.isCancellationRequested;
      this.replacePendingAssistantMessage(requestId,
        `${log.join('\n').slice(-12000)}${log.length ? '\n\n' : ''}${cancelled ? 'Cancelled. Previously approved changes remain; no further actions will run.' : 'Request stopped. Previously approved changes remain.'}`);
      this.targets.delete(messageId);
      if (!cancelled) {
        this.errorMessage = error instanceof Error ? error.message : String(error);
        logError('NoPilot chat panel request failed', error);
      }
    } finally {
      if (this.cancellation === cancellation) { this.cancellation = undefined; }
      cancellation.cancel();
      cancellation.dispose();
      this.isPending = false;
      this.postState();
    }
  }

  private async applyResponse(message: ApplyResponseMessage): Promise<void> {
    if (this.isPending || (message.mode !== 'insert' && message.mode !== 'replace')) { return; }
    const chatMessage = this.messages.find(entry => entry.id === message.messageId);
    const target = this.targets.get(message.messageId);
    if (!chatMessage?.canApply || chatMessage.pending || !target) {
      throw new Error('No original edit target is available. Send a fresh Ask request.');
    }
    const cleanedContent = normalizeChatResponseForApply(chatMessage.content);
    if (!cleanedContent) { throw new Error('NoPilot Chat could not find any content to apply'); }
    const proposal = responseEdit(target, cleanedContent, message.mode);
    const cancellation = new vscode.CancellationTokenSource();
    this.cancellation = cancellation;
    this.isPending = true;
    this.errorMessage = undefined;
    this.postState();
    try {
      const applied = await this.editReview.apply([proposal], cancellation.token,
        `Apply this response to the original ${message.mode === 'replace' ? 'selection' : 'cursor'} captured when you sent the request. Current editor and selection are ignored.`);
      if (applied) { chatMessage.canApply = false; this.targets.delete(message.messageId); }
    } catch (error) {
      if (!cancellation.token.isCancellationRequested) {
        this.errorMessage = error instanceof Error ? error.message : String(error);
      }
    } finally {
      this.cancellation = undefined;
      cancellation.cancel();
      cancellation.dispose();
      this.isPending = false;
      this.postState();
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
      ...this.messages[pendingIndex],
      pending: false,
      id: `assistant-${requestId}`,
      role: 'assistant',
      content,
    };
  }

  private buildChatRequest(prompt: string, editor: vscode.TextEditor | undefined): CompletionRequest {
    const history = buildChatRequestHistory(this.messages.filter(entry => entry.mode === 'ask'));

    if (!editor) {
      return {
        mode: 'chat',
        prefix: '',
        suffix: '',
        language: 'plaintext',
        filename: 'untitled',
        chatPrompt: prompt,
        chatMode: this.chatMode,
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
      chatMode: this.chatMode,
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
    const modePresentation = getChatModePresentation(this.chatMode);

    if (!editor) {
      return {
        ...modePresentation,
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
      ...modePresentation,
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

function getChatModePresentation(mode: ChatPanelMode): ChatModePresentation {
  if (mode === 'ask') {
    return {
      chatMode: mode,
      panelTitle: 'Ask Mode',
      modeLead: 'Ask focused questions about the current file, selection, or implementation detail.',
      modeLabel: 'Ask',
      modeDescription: 'Answer-first mode for explanations, reviews, and targeted guidance.',
      emptyStateTitle: 'Ask mode is ready.',
      emptyStateDescription: 'Use the current editor context to explain code, review a function, or request a focused snippet.',
      composerLabel: 'Question',
      composerPlaceholder: 'Ask NoPilot to explain, review, or suggest a focused change using the current editor context.',
      composerHint: 'Enter to send. Shift+Enter for a new line.',
      sendButtonLabel: 'Send',
      pendingButtonLabel: 'Thinking...',
    };
  }

  return {
    chatMode: mode,
    panelTitle: 'Agent Mode',
    modeLead: 'Read and search this workspace, review proposed edits, and approve verification runs.',
    modeLabel: 'Agent',
    modeDescription: 'Existing-file edits require diff review and approval. Verification commands require separate approval.',
    emptyStateTitle: 'Agent mode is ready.',
    emptyStateDescription: 'Inspect files, propose a change, and verify it with your approval. Maximum 12 steps per run.',
    composerLabel: 'Request',
    composerPlaceholder: 'Ask NoPilot Agent to inspect the current file, plan edits, or draft code using the active workspace context.',
    composerHint: 'Enter to run. Shift+Enter for a new line.',
    sendButtonLabel: 'Run Agent',
    pendingButtonLabel: 'Planning...',
  };
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
