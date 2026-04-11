import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';
import {
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  CommitMessageRequest,
  ProviderInfo,
} from '../types';
import { AuthService } from '../services/authService';
import { buildCompletionPrompt, buildCommitMessagePrompt } from './prompts';

/**
 * Provider for Anthropic Claude API.
 * Auth: SecretStorage API key.
 */
export class AnthropicProvider implements AIProvider {
  private client: Anthropic | undefined;

  private _info: ProviderInfo = {
    id: 'anthropic',
    name: 'Claude',
    icon: '🤖',
    description: 'Anthropic Claude API',
    status: 'needs-key',
    currentModel: '',
    availableModels: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-haiku-20241022',
    ],
    requiresApiKey: true,
    hasApiKey: false,
  };

  constructor(private readonly authService: AuthService) {
    const config = vscode.workspace.getConfiguration('nopilot.anthropic');
    this._info.currentModel = config.get('model', 'claude-sonnet-4-20250514');
  }

  get info(): ProviderInfo {
    return { ...this._info };
  }

  async isAvailable(): Promise<boolean> {
    const hasKey = await this.authService.hasApiKey('anthropic');
    this._info.hasApiKey = hasKey;
    this._info.status = hasKey ? 'ready' : 'needs-key';
    if (hasKey && !this.client) {
      const apiKey = await this.authService.getApiKey('anthropic');
      if (apiKey) {
        this.client = new Anthropic({ apiKey });
      }
    }
    return hasKey;
  }

  setCurrentModel(model: string): void {
    this._info.currentModel = model;
  }

  async complete(
    request: CompletionRequest,
    token: vscode.CancellationToken
  ): Promise<CompletionResponse> {
    await this.ensureClient();
    const prompt = buildCompletionPrompt(request);
    const abortController = new AbortController();
    const disposable = token.onCancellationRequested(() => abortController.abort());

    try {
      const response = await this.client!.messages.create(
        {
          model: this._info.currentModel,
          max_tokens: request.maxTokens || 256,
          temperature: 0.2,
          stop_sequences: request.stopSequences,
          system: 'You are an AI code completion assistant.',
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: abortController.signal }
      );
      const textBlock = response.content.find((b) => b.type === 'text');
      return { text: textBlock ? textBlock.text.trim() : '' };
    } finally {
      disposable.dispose();
    }
  }

  async generateCommitMessage(
    request: CommitMessageRequest,
    token: vscode.CancellationToken
  ): Promise<string> {
    await this.ensureClient();
    const prompt = buildCommitMessagePrompt(request);
    const abortController = new AbortController();
    const disposable = token.onCancellationRequested(() => abortController.abort());

    try {
      const response = await this.client!.messages.create(
        {
          model: this._info.currentModel,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: abortController.signal }
      );
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock ? textBlock.text.trim() : '';
    } finally {
      disposable.dispose();
    }
  }

  private async ensureClient(): Promise<void> {
    if (!this.client) {
      const apiKey = await this.authService.getApiKey('anthropic');
      if (apiKey) {
        this.client = new Anthropic({ apiKey });
      }
    }
    if (!this.client) {
      throw new Error('Anthropic API key not configured. Use "NoPilot: Set API Key" to set it.');
    }
  }

  async refreshClient(): Promise<void> {
    this.client = undefined;
    await this.isAvailable();
  }

  dispose(): void {
    this.client = undefined;
  }
}
