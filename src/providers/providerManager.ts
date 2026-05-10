import * as vscode from 'vscode';
import {
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  CommitMessageRequest,
  ProviderId,
  ProviderInfo,
  ProviderUsageSummary,
} from '../types';
import { AuthService } from '../services/authService';
import { logError } from '../utils/logger';
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
import { getProviderModelConfigKey } from './providerConfig';

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
  private static readonly USAGE_PERSIST_DEBOUNCE_MS = 250;
  private static readonly SESSION_USAGE_PROVIDER_IDS: ProviderId[] = [
    'vscode-lm',
    'anthropic',
    'openai',
    'gemini',
    'ollama',
  ];
  private static readonly USAGE_STORAGE_KEY = 'providerUsageCounts';

  private providers: Map<ProviderId, AIProvider> = new Map();
  private activeProviderId: ProviderId;
  private activeModelKey: string = '';
  private usagePersistTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly usageCounts: Record<ProviderId, number> = {
    'vscode-lm': 0,
    anthropic: 0,
    openai: 0,
    gemini: 0,
    ollama: 0,
  };

  private readonly _onDidChangeProvider = new vscode.EventEmitter<ProviderId>();
  readonly onDidChangeProvider = this._onDidChangeProvider.event;
  private readonly _onDidChangeProviderState = new vscode.EventEmitter<ProviderId>();
  readonly onDidChangeProviderState = this._onDidChangeProviderState.event;
  private readonly _onDidChangeUsage = new vscode.EventEmitter<ProviderId>();
  readonly onDidChangeUsage = this._onDidChangeUsage.event;

  constructor(
    private readonly authService: AuthService,
    private readonly usageState?: vscode.Memento
  ) {
    // Read active provider from settings
    const config = vscode.workspace.getConfiguration('nopilot');
    this.activeProviderId = config.get<ProviderId>('provider', 'vscode-lm');
    this.activeModelKey = config.get<string>(
      getProviderModelConfigKey(this.activeProviderId),
      ''
    );

    // Create all providers
    this.providers.set('vscode-lm', new VscodeLmProvider());
    this.providers.set('anthropic', new AnthropicProvider(authService));
    this.providers.set('openai', new OpenAIProvider(authService));
    this.providers.set('gemini', new GeminiProvider(authService));
    this.providers.set('ollama', new OllamaProvider());

    const storedUsageCounts = this.usageState?.get<Partial<Record<ProviderId, number>>>(
      ProviderManager.USAGE_STORAGE_KEY
    );
    this.hydrateUsageCounts(storedUsageCounts);
  }

  /** Initialize all providers (check availability) */
  async initialize(): Promise<void> {
    const checks = Array.from(this.providers.values()).map((p) =>
      p.isAvailable().catch(() => false)
    );
    await Promise.all(checks);

    const activeProvider = this.providers.get(this.activeProviderId);
    if (activeProvider) {
      this.activeModelKey = this.resolveSelectedModelKey(
        activeProvider,
        this.activeModelKey || activeProvider.info.currentModel
      );

      if (this.activeModelKey !== activeProvider.info.currentModel) {
        applyModelSelection(activeProvider, this.activeModelKey);
      }
    }
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
      return this.activeModelKey || 'VS Code LM';
    }
    const provider = this.providers.get(this.activeProviderId);
    if (provider) {
      return `${provider.info.icon} ${provider.info.currentModel || provider.info.name}`;
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
    let isAvailable = await provider.isAvailable();
    let info = provider.info;

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

      isAvailable = await provider.isAvailable();
      info = provider.info;
    }

    if (!isAvailable && !(info.requiresApiKey && !info.hasApiKey)) {
      return;
    }

    const selectedModelKey = this.resolveSelectedModelKey(provider, modelKey);
    this.activeProviderId = providerId;
    this.activeModelKey = selectedModelKey;

    // Update the live provider state, not the info snapshot copy
    applyModelSelection(provider, selectedModelKey);

    // Save to settings
    const config = vscode.workspace.getConfiguration('nopilot');
    await config.update('provider', providerId, vscode.ConfigurationTarget.Global);
    await config.update(
      getProviderModelConfigKey(providerId),
      selectedModelKey,
      vscode.ConfigurationTarget.Global
    );

    this._onDidChangeProvider.fire(providerId);
  }

  /** Legacy: switch provider (keeps current model) */
  async switchProvider(id: ProviderId): Promise<void> {
    const provider = this.providers.get(id);
    const config = vscode.workspace.getConfiguration('nopilot');
    const modelKey = config.get<string>(
      getProviderModelConfigKey(id),
      provider?.info.currentModel || ''
    );
    await this.switchTo(id, modelKey);
  }

  /** Retry activation of the provider currently configured in settings. */
  async reconcileConfiguredProvider(): Promise<void> {
    const configuredProvider = vscode.workspace
      .getConfiguration('nopilot')
      .get<ProviderId>('provider', 'vscode-lm');

    if (configuredProvider !== this.activeProviderId) {
      await this.switchProvider(configuredProvider);
    }
  }

  /** Update the model for a specific provider */
  async updateModel(providerId: ProviderId, model: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (provider) {
      const selectedModelKey = this.resolveSelectedModelKey(provider, model);
      applyModelSelection(provider, selectedModelKey);

      await vscode.workspace
        .getConfiguration('nopilot')
        .update(
          getProviderModelConfigKey(providerId),
          selectedModelKey,
          vscode.ConfigurationTarget.Global
        );

      await refreshProviderClient(provider);
      const resolvedModelKey = this.resolveSelectedModelKey(
        provider,
        selectedModelKey
      );

      if (resolvedModelKey !== provider.info.currentModel) {
        applyModelSelection(provider, resolvedModelKey);
      }

      if (resolvedModelKey !== selectedModelKey) {
        await vscode.workspace
          .getConfiguration('nopilot')
          .update(
            getProviderModelConfigKey(providerId),
            resolvedModelKey,
            vscode.ConfigurationTarget.Global
          );
      }

      // If this is the active provider, update the active model key too
      if (providerId === this.activeProviderId) {
        this.activeModelKey = resolvedModelKey;
        this._onDidChangeProvider.fire(providerId);
      }

      this._onDidChangeProviderState.fire(providerId);
    }
  }

  /** Resync provider-derived model state and emit provider change events without refreshing the client. */
  async syncProviderState(providerId: ProviderId): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return;
    }

    let resolvedModelKey = provider.info.currentModel;

    if (provider.info.availableModels.length > 0) {
      const config = vscode.workspace.getConfiguration('nopilot');
      const configuredModel = config.get<string>(
        getProviderModelConfigKey(providerId),
        ''
      );

      resolvedModelKey = this.resolveSelectedModelKey(provider, configuredModel);

      if (resolvedModelKey !== provider.info.currentModel) {
        applyModelSelection(provider, resolvedModelKey);
      }

      if (configuredModel !== resolvedModelKey) {
        await config.update(
          getProviderModelConfigKey(providerId),
          resolvedModelKey,
          vscode.ConfigurationTarget.Global
        );
      }
    }

    if (providerId === this.activeProviderId) {
      this.activeModelKey = resolvedModelKey;
      this._onDidChangeProvider.fire(providerId);
    }

    this._onDidChangeProviderState.fire(providerId);
  }

  /** Refresh a provider after non-model settings change and resync its live model state */
  async refreshProviderState(providerId: ProviderId): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return;
    }

    await refreshProviderClient(provider);
    await this.syncProviderState(providerId);
  }

  private resolveSelectedModelKey(provider: AIProvider, requestedModel: string): string {
    const availableModels = provider.info.availableModels;

    if (!requestedModel) {
      return provider.info.currentModel || availableModels[0] || '';
    }

    if (availableModels.length === 0 || availableModels.includes(requestedModel)) {
      return requestedModel;
    }

    return provider.info.currentModel || availableModels[0] || '';
  }

  /** Get info for all providers */
  getAllProviderInfos(): ProviderInfo[] {
    return Array.from(this.providers.values()).map((p) => p.info);
  }

  /** Get a specific provider by ID */
  getProvider(id: ProviderId): AIProvider | undefined {
    return this.providers.get(id);
  }

  /** Get the current session request count for a provider */
  getProviderRequestCount(providerId: ProviderId): number {
    return this.usageCounts[providerId] || 0;
  }

  /** Get total usage across all providers for the current session */
  getTotalRequestCount(): number {
    return ProviderManager.SESSION_USAGE_PROVIDER_IDS.reduce(
      (total, providerId) => total + this.getProviderRequestCount(providerId),
      0
    );
  }

  /** Get the most-used provider for the current session */
  getMostUsedProviderUsage(): ProviderUsageSummary | undefined {
    let mostUsedProvider: ProviderUsageSummary | undefined;

    for (const providerId of ProviderManager.SESSION_USAGE_PROVIDER_IDS) {
      const requestCount = this.getProviderRequestCount(providerId);
      const provider = this.providers.get(providerId);

      if (!provider || requestCount <= 0) {
        continue;
      }

      if (!mostUsedProvider || requestCount > mostUsedProvider.requestCount) {
        mostUsedProvider = {
          providerId,
          providerName: provider.info.name,
          providerIcon: provider.info.icon,
          requestCount,
        };
      }
    }

    return mostUsedProvider;
  }

  private formatRequestCount(requestCount: number): string {
    return `${requestCount} request${requestCount === 1 ? '' : 's'}`;
  }

  private formatProviderRequestCount(providerId: ProviderId): string {
    return this.formatRequestCount(this.getProviderRequestCount(providerId));
  }

  private getProviderUsageSummaryLabel(): string {
    const mostUsedProvider = this.getMostUsedProviderUsage();
    const totalUsageLabel = this.formatRequestCount(this.getTotalRequestCount());

    return mostUsedProvider
      ? `Most used: ${mostUsedProvider.providerIcon} ${mostUsedProvider.providerName} (${this.formatProviderRequestCount(mostUsedProvider.providerId)}) · Total: ${totalUsageLabel}`
      : `Most used: none yet · Total: ${totalUsageLabel}`;
  }

  private hydrateUsageCounts(
    storedUsageCounts?: Partial<Record<ProviderId, number>>
  ): void {
    for (const providerId of ProviderManager.SESSION_USAGE_PROVIDER_IDS) {
      const usageCount = storedUsageCounts?.[providerId];
      this.usageCounts[providerId] =
        Number.isFinite(usageCount) && usageCount > 0
          ? Math.floor(usageCount)
          : 0;
    }
  }

  private async flushPersistedUsageCounts(): Promise<void> {
    if (!this.usageState) {
      return;
    }

    await this.usageState
      .update(ProviderManager.USAGE_STORAGE_KEY, { ...this.usageCounts })
      .catch((error) => {
        logError('Provider usage persistence failed', error);
      });
  }

  private persistUsageCounts(): void {
    if (!this.usageState) {
      return;
    }

    if (this.usagePersistTimer) {
      clearTimeout(this.usagePersistTimer);
    }

    this.usagePersistTimer = setTimeout(() => {
      this.usagePersistTimer = undefined;
      void this.flushPersistedUsageCounts();
    }, ProviderManager.USAGE_PERSIST_DEBOUNCE_MS);
  }

  private recordProviderRequest(providerId: ProviderId): void {
    this.usageCounts[providerId] = this.getProviderRequestCount(providerId) + 1;
    this.persistUsageCounts();
    this._onDidChangeUsage.fire(providerId);
  }

  /** Delegate: inline completion */
  async complete(
    request: CompletionRequest,
    token: vscode.CancellationToken
  ): Promise<CompletionResponse> {
    const provider = this.getActiveProvider();
    this.recordProviderRequest(provider.info.id);
    return provider.complete(request, token);
  }

  /** Delegate: commit message generation */
  async generateCommitMessage(
    request: CommitMessageRequest,
    token: vscode.CancellationToken
  ): Promise<string> {
    const provider = this.getActiveProvider();
    this.recordProviderRequest(provider.info.id);
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
      const usageLabel = this.formatProviderRequestCount('vscode-lm');

      entries.push({
        providerId: 'vscode-lm',
        modelKey: model.key,
        label: `${icon} ${model.name || model.family}`,
        description: `via ${model.vendor} · ${usageLabel}`,
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
      const usageLabel = this.formatProviderRequestCount(pid);

      if (info.status === 'unavailable') {
        entries.push({
          providerId: pid,
          modelKey: '',
          label: `${info.icon} ${info.name}`,
          description: `Direct API · ${usageLabel}`,
          detail: '$(warning) Unavailable',
          icon: info.icon,
          ready: false,
        });
        continue;
      }

      const availableModels = info.availableModels.length > 0
        ? info.availableModels
        : [info.currentModel].filter(Boolean);

      if (availableModels.length === 0) {
        const statusLabel = info.status === 'needs-key'
          ? '$(key) API key needed'
          : '$(warning) Unavailable';

        entries.push({
          providerId: pid,
          modelKey: '',
          label: `${info.icon} ${info.name}`,
          description: `Direct API · ${usageLabel}`,
          detail: statusLabel,
          icon: info.icon,
          ready: false,
        });
        continue;
      }

      for (const model of availableModels) {
        const isActiveModel = isActive && this.activeModelKey === model;
        const statusLabel = isActiveModel
          ? '$(check) Active'
          : info.status === 'ready'
            ? '$(key) Ready (API key)'
            : info.status === 'needs-key'
              ? '$(key) API key needed'
              : '$(warning) Unavailable';

        entries.push({
          providerId: pid,
          modelKey: model,
          label: `${info.icon} ${model}`,
          description: `via ${info.name} Direct API · ${usageLabel}`,
          detail: statusLabel,
          icon: info.icon,
          ready: info.status === 'ready',
        });
      }
    }

    return entries;
  }

  /** Show Quick Pick to switch providers */
  async showProviderQuickPick(): Promise<void> {
    interface ProviderQuickPickItem extends vscode.QuickPickItem {
      providerId?: ProviderId;
      modelKey?: string;
      action?: 'settings';
    }

    const items: ProviderQuickPickItem[] = this.buildModelEntries().map((entry) => ({
      label: entry.label,
      description: entry.description,
      detail: entry.detail,
      providerId: entry.providerId,
      modelKey: entry.modelKey,
    }));

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
      title: 'NoPilot: Select AI Model',
      placeHolder: `Choose your AI provider or model · ${this.getProviderUsageSummaryLabel()}`,
    });

    if (!selected) {
      return;
    }

    if (selected.action === 'settings') {
      await vscode.commands.executeCommand('nopilot.openSettings');
      return;
    }

    if (selected.providerId && !selected.modelKey) {
      const provider = this.providers.get(selected.providerId);
      const providerName = provider?.info.name || selected.providerId;
      void vscode.window.showWarningMessage(
        `NoPilot: ${providerName} is currently unavailable`
      );
      return;
    }

    if (selected.providerId && selected.modelKey) {
      await this.switchTo(selected.providerId, selected.modelKey);
    }
  }

  dispose(): void {
    if (this.usagePersistTimer) {
      clearTimeout(this.usagePersistTimer);
      this.usagePersistTimer = undefined;
      void this.flushPersistedUsageCounts();
    }

    for (const provider of this.providers.values()) {
      provider.dispose();
    }
    this.providers.clear();
    this._onDidChangeProvider.dispose();
    this._onDidChangeProviderState.dispose();
    this._onDidChangeUsage.dispose();
  }
}
