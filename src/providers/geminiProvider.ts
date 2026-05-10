import * as vscode from 'vscode';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
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
  refreshGeminiModelCatalog,
  resolveDirectProviderModelState,
} from './directProviderModels';

/**
 * Provider for Google Gemini API.
 * Directly calls the Gemini API using an API key from SecretStorage.
 */
export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI | undefined;
  private model: GenerativeModel | undefined;

  private _info: ProviderInfo = {
    id: 'gemini',
    name: 'Gemini',
    icon: '💎',
    description: 'Google Gemini API',
    status: 'needs-key',
    currentModel: '',
    availableModels: getDirectProviderFallbackModels('gemini'),
    requiresApiKey: true,
    hasApiKey: false,
  };

  constructor(private readonly authService: AuthService) {
    const config = vscode.workspace.getConfiguration('nopilot.gemini');
    this._info.currentModel = config.get(
      'model',
      getDirectProviderDefaultModel('gemini')
    );
    this.applyModelState();
  }

  get info(): ProviderInfo {
    return { ...this._info };
  }

  async isAvailable(): Promise<boolean> {
    const hasKey = await this.authService.hasApiKey('gemini');
    this._info.hasApiKey = hasKey;
    this._info.status = hasKey ? 'ready' : 'needs-key';
    if (!hasKey) {
      this.genAI = undefined;
      this.model = undefined;
      const fallbackModels = getDirectProviderFallbackModels('gemini');
      if (!fallbackModels.includes(this._info.currentModel)) {
        this._info.currentModel = getDirectProviderDefaultModel('gemini');
      }
      this.applyModelState();
      return false;
    }

    await this.initClient();
    return true;
  }

  private async initClient(): Promise<void> {
    const apiKey = await this.authService.getApiKey('gemini');
    if (apiKey) {
      await this.refreshAvailableModels(apiKey);
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: this._info.currentModel });
    }
  }

  private applyModelState(liveModels?: string[]): void {
    const nextState = resolveDirectProviderModelState({
      providerId: 'gemini',
      currentModel: this._info.currentModel,
      liveModels,
    });

    this._info.availableModels = nextState.availableModels;
    this._info.currentModel = nextState.currentModel;
  }

  private async refreshAvailableModels(apiKey: string): Promise<void> {
    try {
      this.applyModelState(await refreshGeminiModelCatalog(apiKey));
    } catch {
      this.applyModelState();
    }
  }

  setCurrentModel(model: string): void {
    this._info.currentModel = model;
    if (this.genAI) {
      this.model = this.genAI.getGenerativeModel({ model });
    }
  }

  async complete(
    request: CompletionRequest,
    token: vscode.CancellationToken
  ): Promise<CompletionResponse> {
    await this.ensureClient();
    const inlineConfig = buildInlineCompletionConfig(this._info.id, request);

    // Gemini SDK doesn't support AbortController directly
    // so we check cancellation before and after the call
    if (token.isCancellationRequested) {
      return { text: '' };
    }

    const result = await this.model!.generateContent({
      contents: [{ role: 'user', parts: [{ text: inlineConfig.prompt }] }],
      generationConfig: {
        stopSequences: inlineConfig.stopSequences,
        maxOutputTokens: inlineConfig.maxTokens,
      }
    });
    const response = result.response;

    if (token.isCancellationRequested) {
      return { text: '' };
    }

    return { text: response.text().trim() };
  }

  async generateCommitMessage(
    request: CommitMessageRequest,
    token: vscode.CancellationToken
  ): Promise<string> {
    await this.ensureClient();

    const prompt = buildCommitMessagePrompt(request);

    if (token.isCancellationRequested) {
      return '';
    }

    const result = await this.model!.generateContent(prompt);
    const response = result.response;

    return response.text().trim();
  }

  private async ensureClient(): Promise<void> {
    if (!this.model) {
      await this.initClient();
    }
    if (!this.model) {
      throw new Error('Gemini API key not configured. Use "NoPilot: Set API Key" to set it.');
    }
  }

  async refreshClient(): Promise<void> {
    this.genAI = undefined;
    this.model = undefined;
    await this.initClient();
    await this.isAvailable();
  }

  dispose(): void {
    this.genAI = undefined;
    this.model = undefined;
  }
}
