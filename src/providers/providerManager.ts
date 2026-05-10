import * as vscode from 'vscode';
import {
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  CommitMessageRequest,
  ProviderId,
  ProviderInfo,
} from '../types';
import { AuthService } from '../services/authService';
import { UsageTracker } from '../services/usageTracker';
import { VscodeLmProvider } from './vscodeLmProvider';
import { AnthropicProvider } from './anthropicProvider';
import { OpenAIProvider } from './openaiProvider';
import { GeminiProvider } from './geminiProvider';
import { OllamaProvider } from './ollamaProvider';
import {
  promptAndSaveProviderApiKey,
  refreshProviderClient,
} from './providerCredentials';
import { applyModelSelection } from './modelSelection';

/**
 * Represents a selectable model entry in the unified Quick Pick.
 * Can be backed by either a vscode.lm model or a direct API provider.
 */
interface ModelEntry {
  /** Provider ID to route through */
  providerId: ProviderId;
  /** Model key (for vscode-lm: "vendor/family", for direct: model name) */
  modelKey: string;
  /** Display label */
  label: string;
  /** Description (model name, source) */
  description: string;
  /** Detail line (status) */
  detail: string;
  /** Icon */
  icon: string;
  /** Is this model ready to use without extra setup? */
  ready: boolean;
}

/**
 * Manages all AI providers — creation, switching, and delegation.
 * The Quick Pick shows a UNIFIED model list: vscode.lm discovered models
 * appear alongside direct API providers, so users see "GPT-4o (via Codex)"
 * instead of having to know about the vscode-lm abstraction.
 */
export class ProviderManager implements vscode.Disposable {
  private providers: Map<ProviderId, AIProvider> = new Map();
  private activeProviderId: ProviderId;
  private activeModelKey: string = '';

  private readonly _onDidChangeProvider = new vscode.EventEmitter<ProviderId>();
  readonly onDidChangeProvider = this._onDidChangeProvider.event;

  constructor(
    private readonly authService: AuthService,
    private readonly usageTracker: UsageTracker
  ) {
    // Read active provider from settings
    const config = vscode.workspace.getConfiguration('nopilot');
    this.activeProviderId = config.get<ProviderId>('provider', 'vscode-lm');
    this.activeModelKey = config.get<string>('model', '');

    // Create all providers
    this.providers.set('vscode-lm', new VscodeLmProvider());
    this.providers.set('anthropic', new AnthropicProvider(authService));
    this.providers.set('openai', new OpenAIProvider(authService));
    this.providers.set('gemini', new GeminiProvider(authService));
    this.providers.set('ollama', new OllamaProvider());
  }

  /** Initialize all providers (check availability) */
  async initialize(): Promise<void> {
    const checks = Array.from(this.providers.values()).map((p) =>
      p.isAvailable().catch(() => false)
    );
    await Promise.all(checks);
  }

  /** Get the currently active provider */
  getActiveProvider(): AIProvider {
    const provider = this.providers.get(this.activeProviderId);
    if (!provider) {
      throw new Error(`Provider "${this.activeProviderId}" not found`);
    }
    return provider;
  }

  /** Get the active provider ID */
  getActiveProviderId(): ProviderId {
    return this.activeProviderId;
  }

  /** Get the friendly name of the currently active model */
  getActiveDisplayName(): string {
    if (this.activeProviderId === 'vscode-lm') {
      const vscodeLm = this.providers.get('vscode-lm') as VscodeLmProvider;
      const discovered = vscodeLm.getDiscoveredModels();
      const match = discovered.find((m) => m.key === this.activeModelKey);
      if (match) {
        return match.label;
      }
    }
    const provider = this.providers.get(this.activeProviderId);
    if (provider) {
      return `${provider.info.icon} ${provider.info.name}`;
    }
    return this.activeProviderId;
  }

  /** Switch to a provider + model combination */
  async switchTo(providerId: ProviderId, modelKey: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider "${providerId}" not found`);
    }

    // Re-check availability (probes auth sessions from installed extensions)
    await provider.isAvailable();
    const info = provider.info;

    // Only prompt for API key if provider truly has no auth source
    if (info.requiresApiKey && !info.hasApiKey) {
      const didSave = await promptAndSaveProviderApiKey(
        providerId,
        provider,
        this.authService
      );
      if (!didSave) {
        return; // User cancelled
      }
    }

    this.activeProviderId = providerId;
    this.activeModelKey = modelKey;

    // Update the live provider state, not the info snapshot copy
    applyModelSelection(provider, modelKey);

    // Save to settings
    const config = vscode.workspace.getConfiguration('nopilot');
    await config.update('provider', providerId, vscode.ConfigurationTarget.Global);
    await config.update('model', modelKey, vscode.ConfigurationTarget.Global);

    this._onDidChangeProvider.fire(providerId);
  }

  /** Legacy: switch provider (keeps current model) */
  async switchProvider(id: ProviderId): Promise<void> {
    const provider = this.providers.get(id);
    const modelKey = provider?.info.currentModel || '';
    await this.switchTo(id, modelKey);
  }

  /** Update the model for a specific provider */
  async updateModel(providerId: ProviderId, model: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (provider) {
      applyModelSelection(provider, model);

      const configKey = providerId === 'vscode-lm' ? 'model' : `${providerId}.model`;
      await vscode.workspace
        .getConfiguration('nopilot')
        .update(configKey, model, vscode.ConfigurationTarget.Global);

      await refreshProviderClient(provider);

      // If this is the active provider, update the active model key too
      if (providerId === this.activeProviderId) {
        this.activeModelKey = model;
        this._onDidChangeProvider.fire(providerId);
      }
    }
  }

  /** Get info for all providers */
  getAllProviderInfos(): ProviderInfo[] {
    return Array.from(this.providers.values()).map((p) => p.info);
  }

  /** Get a specific provider by ID */
  getProvider(id: ProviderId): AIProvider | undefined {
    return this.providers.get(id);
  }

  /** Delegate: inline completion */
  async complete(
    request: CompletionRequest,
    token: vscode.CancellationToken
  ): Promise<CompletionResponse> {
    const provider = this.getActiveProvider();
    this.usageTracker.recordRequest(provider.info.id);
    return provider.complete(request, token);
  }

  /** Delegate: commit message generation */
  async generateCommitMessage(
    request: CommitMessageRequest,
    token: vscode.CancellationToken
  ): Promise<string> {
    const provider = this.getActiveProvider();
    this.usageTracker.recordRequest(provider.info.id);
    return provider.generateCommitMessage(request, token);
  }

  /**
   * Build a unified list of all selectable models from all sources:
   * - Models discovered via vscode.lm (Codex, Copilot, BYOK, etc.)
   * - Direct API providers (Anthropic, OpenAI, Gemini, Ollama)
   */
  private buildModelEntries(): ModelEntry[] {
    const entries: ModelEntry[] = [];

    // ── 1. vscode.lm discovered models (highest priority — no key needed!) ──
    const vscodeLm = this.providers.get('vscode-lm') as VscodeLmProvider;
    const discovered = vscodeLm.getDiscoveredModels();

    for (const model of discovered) {
      const icon = VscodeLmProvider.getVendorIcon(model.vendor);
      const isActive =
        this.activeProviderId === 'vscode-lm' && this.activeModelKey === model.key;

      entries.push({
        providerId: 'vscode-lm',
        modelKey: model.key,
        label: `${icon} ${model.name || model.family}`,
        description: `via ${model.vendor}`,
        detail: isActive ? '$(check) Active' : '$(plug) Ready — no API key needed',
        icon,
        ready: true,
      });
    }

    // ── 2. Direct API providers ──
    const directProviders: ProviderId[] = ['anthropic', 'openai', 'gemini', 'ollama'];

    for (const pid of directProviders) {
      const provider = this.providers.get(pid);
      if (!provider) { continue; }

      const info = provider.info;
      const isActive = this.activeProviderId === pid;

      // Skip if the same vendor's models are already available via vscode.lm
      // (to avoid duplicates like "GPT-4o via Codex" AND "GPT-4o via API key")
      // But still show them as a "Direct API" option
      const statusLabel = isActive
        ? '$(check) Active'
        : info.status === 'ready'
          ? '$(key) Ready (API key)'
          : info.status === 'needs-key'
            ? '$(key) API key needed'
            : '$(warning) Unavailable';

      entries.push({
        providerId: pid,
        modelKey: info.currentModel,
        label: `${info.icon} ${info.name}`,
        description: `${info.currentModel} — Direct API`,
        detail: statusLabel,
        icon: info.icon,
        ready: info.status === 'ready',
      });
    }

    return entries;
  }

  /** Show Quick Pick to switch providers */
  async showProviderQuickPick(): Promise<void> {
    const infos = this.getAllProviderInfos();

    interface ProviderQuickPickItem extends vscode.QuickPickItem {
      providerId?: ProviderId;
      action?: 'settings';
    }

    const items: ProviderQuickPickItem[] = infos.map((info) => {
      const isActive = info.id === this.activeProviderId;
      return {
        label: `${info.icon} ${info.name}`,
        description: info.currentModel || '',
        detail: isActive
          ? '$(check) Active'
          : info.status === 'ready'
            ? `$(plug) Ready — ${info.description}`
            : info.status === 'needs-key'
              ? '$(key) API key needed'
              : '$(warning) Unavailable',
        providerId: info.id,
      };
    });

    items.push({
      label: '',
      kind: vscode.QuickPickItemKind.Separator,
    });

    items.push({
      label: '$(gear) Open Full Settings...',
      description: '',
      action: 'settings',
    });

    const selected = await vscode.window.showQuickPick(items, {
      title: 'NoPilot: Select AI Provider',
      placeHolder: 'Choose your AI provider',
    });

    if (!selected) {
      return;
    }

    if (selected.action === 'settings') {
      await vscode.commands.executeCommand('nopilot.openSettings');
      return;
    }

    if (selected.providerId) {
      await this.switchProvider(selected.providerId);
    }
  }

  dispose(): void {
    for (const provider of this.providers.values()) {
      provider.dispose();
    }
    this.providers.clear();
    this._onDidChangeProvider.dispose();
  }
}
