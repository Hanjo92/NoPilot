import * as vscode from 'vscode';

// ─── Completion ───

export interface CompletionRequest {
  /** Code before the cursor */
  prefix: string;
  /** Code after the cursor */
  suffix: string;
  /** VS Code language ID (e.g. 'typescript', 'python') */
  language: string;
  /** File basename */
  filename: string;
  /** Extra context from open files or file headers */
  additionalContext?: string;
  /** If provided, this is an Inline Chat replacement request, not FIM */
  instruction?: string;
  /** The code block the user selected to be replaced */
  selection?: string;
  /** Stop tokens for limiting generation */
  stopSequences?: string[];
  /** Max tokens to generate */
  maxTokens?: number;
}

export interface CompletionResponse {
  /** The suggested code text */
  text: string;
}

// ─── Commit Message ───

export interface CommitMessageRequest {
  /** Git diff content */
  diff: string;
  /** Message language (e.g. 'en', 'ko') */
  language: string;
  /** Message format */
  format: 'conventional' | 'simple';
}

// ─── Provider ───

export type ProviderId = 'vscode-lm' | 'anthropic' | 'openai' | 'gemini' | 'ollama';

export type ProviderStatus = 'ready' | 'needs-key' | 'unavailable';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  icon: string;
  description: string;
  status: ProviderStatus;
  currentModel: string;
  availableModels: string[];
  requiresApiKey: boolean;
  hasApiKey: boolean;
}

export interface AIProvider {
  readonly info: ProviderInfo;

  /** Check if the provider is available and ready to use */
  isAvailable(): Promise<boolean>;

  /** Update the provider's active model in live runtime state */
  setCurrentModel(model: string): void;

  /** Generate inline code completion */
  complete(
    request: CompletionRequest,
    token: vscode.CancellationToken
  ): Promise<CompletionResponse>;

  /** Generate a commit message from a git diff */
  generateCommitMessage(
    request: CommitMessageRequest,
    token: vscode.CancellationToken
  ): Promise<string>;

  /** Clean up resources */
  dispose(): void;
}

// ─── Webview Messages ───

export type WebviewMessage =
  | { command: 'requestState' }
  | { command: 'switchProvider'; providerId: ProviderId }
  | { command: 'setApiKey'; providerId: ProviderId }
  | { command: 'removeApiKey'; providerId: ProviderId }
  | { command: 'updateModel'; providerId: ProviderId; model: string }
  | { command: 'updateSetting'; key: string; value: unknown }
  | { command: 'openExternal'; url: string };

export interface WebviewState {
  providers: ProviderInfo[];
  activeProviderId: ProviderId;
  settings: {
    inlineEnabled: boolean;
    pauseWhenCopilotActive: boolean;
    debounceMs: number;
    maxPrefixLines: number;
    maxSuffixLines: number;
    ollamaEndpoint: string;
    commitLanguage: string;
    commitFormat: string;
  };
}
