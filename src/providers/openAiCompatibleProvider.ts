import * as vscode from 'vscode';
import OpenAI from 'openai';
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
  refreshOpenAICompatibleModelCatalog,
  resolveDirectProviderModelState,
} from './directProviderModels';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export class OpenAiCompatibleProvider implements AIProvider {
  private client: OpenAI | undefined;
  private baseUrl: string;

  private _info: ProviderInfo = {
    id: 'openai-compatible',
    name: 'OpenAI-Compatible',
    icon: '🧩',
    description: 'Custom OpenAI-compatible API endpoint',
    status: 'unavailable',
    currentModel: '',
    availableModels: getDirectProviderFallbackModels('openai-compatible'),
    requiresApiKey: true,
    hasApiKey: false,
  };

  constructor(private readonly authService: AuthService) {
    const config = vscode.workspace.getConfiguration('nopilot.openaiCompatible');
    this.baseUrl = normalizeBaseUrl(config.get('baseUrl', ''));
    this._info.currentModel = config.get(
      'model',
      getDirectProviderDefaultModel('openai-compatible')
    );
    this.applyModelState();
  }

  get info(): ProviderInfo {
    return { ...this._info };
  }

  async isAvailable(): Promise<boolean> {
    this.baseUrl = normalizeBaseUrl(
      vscode.workspace.getConfiguration('nopilot.openaiCompatible').get('baseUrl', '')
    );

    if (!this.baseUrl) {
      this.client = undefined;
      this._info.hasApiKey = false;
      this._info.status = 'unavailable';
      this.applyModelState();
      return false;
    }

    const apiKey = await this.authService.getApiKey('openai-compatible');
    if (!apiKey) {
      this.client = undefined;
      this._info.hasApiKey = false;
      this._info.status = 'needs-key';
      this.applyModelState();
      return false;
    }

    this.client = new OpenAI({ apiKey, baseURL: this.baseUrl });
    await this.refreshAvailableModels(apiKey);
    this._info.hasApiKey = true;
    this._info.status = 'ready';
    return true;
  }

  setCurrentModel(model: string): void {
    this._info.currentModel = model;
  }

  private applyModelState(liveModels?: string[]): void {
    const nextState = resolveDirectProviderModelState({
      providerId: 'openai-compatible',
      currentModel: this._info.currentModel,
      liveModels,
    });

    this._info.availableModels = nextState.availableModels;
    this._info.currentModel = nextState.currentModel;
  }

  private async refreshAvailableModels(apiKey: string): Promise<void> {
    try {
      this.applyModelState(
        await refreshOpenAICompatibleModelCatalog(apiKey, this.baseUrl)
      );
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
      const response = await this.client!.chat.completions.create(
        {
          model: this._info.currentModel,
          max_tokens: inlineConfig.maxTokens,
          temperature: 0.2,
          stop: inlineConfig.stopSequences,
          messages: [{ role: 'user', content: inlineConfig.prompt }],
        },
        { signal: abortController.signal }
      );
      return { text: (response.choices[0]?.message?.content || '').trim() };
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
      const response = await this.client!.chat.completions.create(
        {
          model: this._info.currentModel,
          max_tokens: 1024,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: abortController.signal }
      );
      return response.choices[0]?.message?.content?.trim() || '';
    } finally {
      disposable.dispose();
    }
  }

  private async ensureClient(): Promise<void> {
    if (!this.client) {
      await this.isAvailable();
    }
    if (!this.client) {
      throw new Error(
        'OpenAI-compatible API is not configured. Set a base URL and API key first.'
      );
    }
  }

  async refreshClient(): Promise<void> {
    this.client = undefined;
    this.baseUrl = normalizeBaseUrl(
      vscode.workspace.getConfiguration('nopilot.openaiCompatible').get('baseUrl', '')
    );
    this._info.currentModel = vscode.workspace
      .getConfiguration('nopilot.openaiCompatible')
      .get('model', this._info.currentModel || getDirectProviderDefaultModel('openai-compatible'));
    await this.isAvailable();
  }

  dispose(): void {
    this.client = undefined;
  }
}
