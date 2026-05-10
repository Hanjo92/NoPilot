import * as vscode from 'vscode';
import { ProviderManager } from '../providers/providerManager';
import { AuthService } from '../services/authService';
import { WebviewMessage } from '../types';
import { handleSettingsPanelMessage } from './settingsPanelActions';
import { buildSettingsWebviewState } from './settingsPanelState';
import { createNonce, getSettingsWebviewHtml } from './settingsWebview';
import { log, logError } from '../utils/logger';

/**
 * Manages the Webview-based settings panel.
 * Provides a rich UI for provider management, API key configuration,
 * and settings adjustment.
 */
export class SettingsPanel {
  public static currentPanel: SettingsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private stateRequestVersion = 0;
  private isRefreshingProviderStateForWebview = false;
  private isDisposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly providerManager: ProviderManager,
    private readonly authService: AuthService
  ) {
    this.panel = panel;

    // Set the webview HTML content
    this.panel.webview.html = getSettingsWebviewHtml(createNonce());

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        void this.handleMessage(message);
      },
      null,
      this.disposables
    );

    // Clean up on dispose
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Update webview when provider changes
    this.disposables.push(
      this.providerManager.onDidChangeProvider(() => {
        if (!this.isRefreshingProviderStateForWebview) {
          this.requestStateRefresh();
        }
      }),
      this.providerManager.onDidChangeUsage(() => {
        this.requestStateRefresh();
      }),
      this.providerManager.onDidChangeProviderState(() => {
        if (!this.isRefreshingProviderStateForWebview) {
          this.requestStateRefresh();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('nopilot')) {
          this.requestStateRefresh();
        }
      })
    );
  }

  /** Create or show the settings panel */
  static createOrShow(
    extensionUri: vscode.Uri,
    providerManager: ProviderManager,
    authService: AuthService
  ): SettingsPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel already exists, show it
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.panel.reveal(column);
      SettingsPanel.currentPanel.requestStateRefresh();
      return SettingsPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'nopilotSettings',
      'NoPilot Settings',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'ui', 'webview')],
      }
    );

    SettingsPanel.currentPanel = new SettingsPanel(
      panel,
      providerManager,
      authService
    );

    // Send initial state
    SettingsPanel.currentPanel.requestStateRefresh();

    return SettingsPanel.currentPanel;
  }

  private requestStateRefresh(): void {
    void this.sendStateToWebview().catch((error) => {
      logError('SettingsPanel state refresh failed', error);
    });
  }

  /** Send current state to the webview */
  private async sendStateToWebview(): Promise<void> {
    const requestVersion = ++this.stateRequestVersion;
    const config = vscode.workspace.getConfiguration('nopilot');
    const ollamaConfig = vscode.workspace.getConfiguration('nopilot.ollama');

    this.isRefreshingProviderStateForWebview = true;
    try {
      await this.providerManager.refreshProviderState('ollama');
    } finally {
      this.isRefreshingProviderStateForWebview = false;
    }

    const state = await buildSettingsWebviewState({
      getAllProviderInfos: () => this.providerManager.getAllProviderInfos(),
      getActiveProviderId: () => this.providerManager.getActiveProviderId(),
      getProviderRequestCount: (providerId) =>
        this.providerManager.getProviderRequestCount(providerId),
      getSetting: <T>(key: string, defaultValue: T) => {
        if (key === 'ollama.endpoint') {
          return ollamaConfig.get('endpoint', defaultValue);
        }

        if (key === 'ollama.remoteMode') {
          return ollamaConfig.get('remoteMode', defaultValue);
        }

        return config.get(key, defaultValue);
      },
    });

    if (this.isDisposed || requestVersion !== this.stateRequestVersion) {
      return;
    }

    const ollama = state.providers.find((provider) => provider.id === 'ollama');
    log(
      `SettingsPanel state sent | endpoint: ${state.settings.ollamaEndpoint} | ollama status: ${ollama?.status ?? 'missing'} | models: ${ollama?.availableModels.length ?? 0}`
    );

    this.panel.webview.postMessage({ command: 'updateState', state });
  }

  /** Handle messages from the webview */
  private async handleMessage(message: WebviewMessage): Promise<void> {
    log(`SettingsPanel received command=${message.command}`);

    try {
      await handleSettingsPanelMessage(message, {
        getProvider: (providerId) => this.providerManager.getProvider(providerId as any),
        switchProvider: (providerId) => this.providerManager.switchProvider(providerId as any),
        syncProviderState: (providerId) => this.providerManager.syncProviderState(providerId as any),
        reconcileConfiguredProvider: () => this.providerManager.reconcileConfiguredProvider(),
        updateModel: (providerId, model) =>
          this.providerManager.updateModel(providerId as any, model),
        promptForApiKey: (providerName) => this.authService.promptForApiKey(providerName),
        setApiKey: (providerId, key) => this.authService.setApiKey(providerId, key),
        removeApiKey: (providerId) => this.authService.removeApiKey(providerId),
        updateSetting: async (key, value) => {
          if (key === 'ollama.endpoint' || key === 'ollama.remoteMode') {
            const ollamaConfig = vscode.workspace.getConfiguration('nopilot.ollama');
            const settingName = key === 'ollama.endpoint' ? 'endpoint' : 'remoteMode';
            await ollamaConfig.update(
              settingName,
              String(value),
              vscode.ConfigurationTarget.Global
            );
            return;
          }

          const config = vscode.workspace.getConfiguration('nopilot');
          await config.update(key, value, vscode.ConfigurationTarget.Global);
        },
        openExternal: async (url) => {
          await vscode.env.openExternal(vscode.Uri.parse(url));
        },
        sendState: () => this.sendStateToWebview(),
        debugLog: (logMessage) => log(logMessage),
      });
    } catch (error) {
      if (message.command === 'refreshOllama') {
        void this.panel.webview.postMessage({ command: 'resetOllamaRefreshPending' });
      }

      logError(`SettingsPanel command failed (${message.command})`, error);
      void vscode.window.showErrorMessage(
        `NoPilot settings action failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  dispose(): void {
    this.isDisposed = true;
    SettingsPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
