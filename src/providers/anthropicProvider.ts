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
import { buildCommitMessagePrompt } from './prompts';
import { buildInlineCompletionConfig } from './inlineStrategies';
import {
  getDirectProviderDefaultModel,
  getDirectProviderFallbackModels,
  refreshAnthropicModelCatalog,
  resolveDirectProviderModelState,
} from './directProviderModels';

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
    availableModels: getDirectProviderFallbackModels('anthropic'),
    requiresApiKey: true,
    hasApiKey: false,
  };

  constructor(private readonly authService: AuthService) {
    const config = vscode.workspace.getConfiguration('nopilot.anthropic');
    this._info.currentModel = config.get(
      'model',
      getDirectProviderDefaultModel('anthropic')
    );
    this.applyModelState();
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
        await this.refreshAvailableModels(apiKey);
        this.client = new Anthropic({ apiKey });
      }
    }
    return hasKey;
  }

  setCurrentModel(model: string): void {
    this._info.currentModel = model;
  }

  private applyModelState(liveModels?: string[]): void {
    const nextState = resolveDirectProviderModelState({
      providerId: 'anthropic',
      currentModel: this._info.currentModel,
      liveModels,
    });

    this._info.availableModels = nextState.availableModels;
    this._info.currentModel = nextState.currentModel;
  }

  private async refreshAvailableModels(apiKey: string): Promise<void> {
    try {
      this.applyModelState(await refreshAnthropicModelCatalog(apiKey));
    } catch {
      this.applyModelState();
    }
  }

  async complete(
    request: CompletionRequest,
    token: vscode.CancellationToken
  ): Promise<CompletionResponse> {
    await this.ensureClient();
    const inlineConfig = buildInlineCompletionConfig(this._info.id, request);
    const abortController = new AbortController();
    const disposable = token.onCancellationRequested(() => abortController.abort());

    try {
      const response = await this.client!.messages.create(
        {
          model: this._info.currentModel,
          max_tokens: inlineConfig.maxTokens,
          temperature: 0.2,
          stop_sequences: inlineConfig.stopSequences,
          system: 'You are an AI code completion assistant.',
          messages: [{ role: 'user', content: inlineConfig.prompt }],
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
