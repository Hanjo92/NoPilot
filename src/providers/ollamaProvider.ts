import * as vscode from 'vscode';
import {
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  CommitMessageRequest,
  ProviderInfo,
} from '../types';
import { buildCompletionPrompt, buildCommitMessagePrompt } from './prompts';

/**
 * Provider for local Ollama server.
 * No API key required — uses fetch() to call the local HTTP endpoint.
 */
export class OllamaProvider implements AIProvider {
  private _info: ProviderInfo = {
    id: 'ollama',
    name: 'Ollama',
    icon: '🦙',
    description: 'Local Ollama server',
    status: 'unavailable',
    currentModel: '',
    availableModels: [],
    requiresApiKey: false,
    hasApiKey: true,
  };

  private endpoint: string;

  constructor() {
    const config = vscode.workspace.getConfiguration('nopilot.ollama');
    this.endpoint = config.get('endpoint', 'http://localhost:11434');
    this._info.currentModel = config.get('model', 'codellama');
  }

  get info(): ProviderInfo {
    return { ...this._info };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        const data = (await response.json()) as { models?: Array<{ name: string }> };
        this._info.availableModels = (data.models || []).map((m) => m.name);
        this._info.status = 'ready';

        // Set current model to first available if not configured
        if (
          !this._info.currentModel ||
          !this._info.availableModels.includes(this._info.currentModel)
        ) {
          this._info.currentModel =
            this._info.availableModels.find((m) => m.includes('codellama')) ||
            this._info.availableModels[0] ||
            'codellama';
        }

        return true;
      }
      this._info.status = 'unavailable';
      return false;
    } catch {
      this._info.status = 'unavailable';
      return false;
    }
  }

  setCurrentModel(model: string): void {
    this._info.currentModel = model;
  }

  async refreshClient(): Promise<void> {
    const config = vscode.workspace.getConfiguration('nopilot.ollama');
    this.endpoint = config.get('endpoint', 'http://localhost:11434');
    this._info.currentModel = config.get('model', this._info.currentModel || 'codellama');
    await this.isAvailable();
  }

  async complete(
    request: CompletionRequest,
    token: vscode.CancellationToken
  ): Promise<CompletionResponse> {
    const prompt = buildCompletionPrompt(request);

    const abortController = new AbortController();
    const disposable = token.onCancellationRequested(() => abortController.abort());

    try {
      const response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this._info.currentModel,
          prompt,
          stream: false,
          options: {
            num_predict: request.maxTokens || 512,
            temperature: 0.2,
          },
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = (await response.json()) as { response: string };
      return { text: data.response.trim() };
    } finally {
      disposable.dispose();
    }
  }

  async generateCommitMessage(
    request: CommitMessageRequest,
    token: vscode.CancellationToken
  ): Promise<string> {
    const prompt = buildCommitMessagePrompt(request);

    const abortController = new AbortController();
    const disposable = token.onCancellationRequested(() => abortController.abort());

    try {
      const response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this._info.currentModel,
          prompt,
          stream: false,
          options: {
            num_predict: 1024,
            temperature: 0.3,
          },
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = (await response.json()) as { response: string };
      return data.response.trim();
    } finally {
      disposable.dispose();
    }
  }

  dispose(): void {
    // Nothing to clean up
  }
}
