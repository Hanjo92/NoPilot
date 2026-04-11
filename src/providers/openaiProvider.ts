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
import { buildCompletionPrompt, buildCommitMessagePrompt } from './prompts';

/**
 * Provider for OpenAI API (GPT, Codex, etc.)
 * Auth: OPENAI_API_KEY env variable or SecretStorage API key.
 */
export class OpenAIProvider implements AIProvider {
  private client: OpenAI | undefined;

  private _info: ProviderInfo = {
    id: 'openai',
    name: 'OpenAI',
    icon: '💚',
    description: 'OpenAI GPT API',
    status: 'needs-key',
    currentModel: '',
    availableModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o4-mini'],
    requiresApiKey: true,
    hasApiKey: false,
  };

  constructor(private readonly authService: AuthService) {
    const config = vscode.workspace.getConfiguration('nopilot.openai');
    this._info.currentModel = config.get('model', 'gpt-4o-mini');
  }

  get info(): ProviderInfo {
    return { ...this._info };
  }

  async isAvailable(): Promise<boolean> {
    // 1. Environment variable
    const envKey = process.env.OPENAI_API_KEY;
    if (envKey) {
      this.client = new OpenAI({ apiKey: envKey });
      this._info.hasApiKey = true;
      this._info.status = 'ready';
      return true;
    }

    // 2. Stored API key
    const apiKey = await this.authService.getApiKey('openai');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      this._info.hasApiKey = true;
      this._info.status = 'ready';
      return true;
    }

    this._info.hasApiKey = false;
    this._info.status = 'needs-key';
    return false;
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
      const response = await this.client!.chat.completions.create(
        {
          model: this._info.currentModel,
          max_tokens: request.maxTokens || 512,
          temperature: 0.2,
          stop: request.stopSequences,
          messages: [{ role: 'user', content: prompt }],
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
      throw new Error('OpenAI API key not configured. Use "NoPilot: Set API Key" to set it.');
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
