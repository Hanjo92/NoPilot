import * as vscode from 'vscode';
import {
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  CommitMessageRequest,
  ProviderInfo,
} from '../types';
import { buildCommitMessagePrompt } from './prompts';
import { buildInlineCompletionConfig } from './inlineStrategies';

/** Detailed info about a model discovered via vscode.lm */
export interface DiscoveredModel {
  /** Display label, e.g. "GPT-4o (via Codex)" */
  label: string;
  /** The vscode.lm selector key: "vendor/family" */
  key: string;
  /** Vendor name, e.g. "copilot", "openai" */
  vendor: string;
  /** Model family, e.g. "gpt-4o", "claude-3.5-sonnet" */
  family: string;
  /** Full model ID from vscode.lm */
  id: string;
  /** Human-readable name */
  name: string;
}

/**
 * Provider that routes through VS Code's Language Model API.
 * Automatically discovers models registered by other extensions
 * (Copilot, Codex, BYOK models, AI Toolkit, etc.)
 *
 * This is the KEY integration point: if a user has logged into
 * Codex, Copilot, or any extension that registers models,
 * those models appear here WITHOUT needing separate API keys.
 */
export class VscodeLmProvider implements AIProvider {
  private _info: ProviderInfo = {
    id: 'vscode-lm',
    name: 'VS Code LM',
    icon: '🔮',
    description: 'Auto-detect models from installed extensions',
    status: 'unavailable',
    currentModel: '',
    availableModels: [],
    requiresApiKey: false,
    hasApiKey: true,
  };

  /** Cached discovered models with detailed info */
  private discoveredModels: DiscoveredModel[] = [];

  get info(): ProviderInfo {
    return { ...this._info };
  }

  /** Get detailed info about all discovered models */
  getDiscoveredModels(): DiscoveredModel[] {
    return [...this.discoveredModels];
  }

  private clearDiscoveredModels(): void {
    this.discoveredModels = [];
    this._info.availableModels = [];
    this._info.currentModel = '';
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (typeof vscode.lm === 'undefined') {
        this.clearDiscoveredModels();
        this._info.status = 'unavailable';
        return false;
      }
      const models = await vscode.lm.selectChatModels();

      this.discoveredModels = models.map((m) => ({
        label: this.buildModelLabel(m.vendor, m.family, m.name),
        key: `${m.vendor}/${m.family}`,
        vendor: m.vendor,
        family: m.family,
        id: m.id,
        name: m.name,
      }));

      this._info.availableModels = this.discoveredModels.map((m) => m.key);

      if (models.length > 0) {
        this._info.status = 'ready';
        if (!this._info.currentModel) {
          this._info.currentModel = this._info.availableModels[0];
        }
        return true;
      }
      this.clearDiscoveredModels();
      this._info.status = 'unavailable';
      return false;
    } catch {
      this.clearDiscoveredModels();
      this._info.status = 'unavailable';
      return false;
    }
  }

  setCurrentModel(model: string): void {
    this._info.currentModel = model;
  }

  /** Build a human-readable label for a discovered model */
  private buildModelLabel(vendor: string, family: string, name: string): string {
    // Map known vendors to friendly names
    const vendorLabels: Record<string, string> = {
      copilot: 'Copilot',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      'azure-openai': 'Azure OpenAI',
    };

    const vendorName = vendorLabels[vendor] || vendor;
    // Use the model name if unique, otherwise family
    const modelName = name || family;
    return `${modelName} (via ${vendorName})`;
  }

  /** Get icon for a vendor */
  static getVendorIcon(vendor: string): string {
    const icons: Record<string, string> = {
      copilot: '🤖',
      openai: '💚',
      anthropic: '🟠',
      google: '💎',
      'azure-openai': '☁️',
    };
    return icons[vendor] || '🔮';
  }

  async complete(
    request: CompletionRequest,
    token: vscode.CancellationToken
  ): Promise<CompletionResponse> {
    const models = await vscode.lm.selectChatModels();
    if (models.length === 0) {
      throw new Error('No language models available via VS Code LM API');
    }

    // Try to match user-configured model, otherwise use first available
    const targetModel = this._info.currentModel;
    const model =
      models.find((m) => `${m.vendor}/${m.family}` === targetModel) || models[0];
    const inlineConfig = buildInlineCompletionConfig(this._info.id, request);

    const messages = [
      vscode.LanguageModelChatMessage.User(inlineConfig.prompt)
    ];

    const response = await model.sendRequest(messages, {}, token);

    let result = '';
    for await (const fragment of response.text) {
      result += fragment;
    }

    return { text: result.trim() };
  }

  async generateCommitMessage(
    request: CommitMessageRequest,
    token: vscode.CancellationToken
  ): Promise<string> {
    const models = await vscode.lm.selectChatModels();
    if (models.length === 0) {
      throw new Error('No language models available via VS Code LM API');
    }

    const targetModel = this._info.currentModel;
    const model =
      models.find((m) => `${m.vendor}/${m.family}` === targetModel) || models[0];

    const prompt = buildCommitMessagePrompt(request);
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    const response = await model.sendRequest(messages, {}, token);

    let result = '';
    for await (const fragment of response.text) {
      result += fragment;
    }

    return result.trim();
  }

  dispose(): void {
    // Nothing to clean up
  }
}
