import * as vscode from 'vscode';
import { ProviderManager } from '../providers/providerManager';
import { AuthService } from '../services/authService';
import { WebviewMessage, WebviewState } from '../types';
import { handleSettingsPanelMessage } from './settingsPanelActions';
import { createNonce, getSettingsWebviewHtml } from './settingsWebview';

/**
 * Manages the Webview-based settings panel.
 * Provides a rich UI for provider management, API key configuration,
 * and settings adjustment.
 */
export class SettingsPanel {
  public static currentPanel: SettingsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

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
      (message: WebviewMessage) => this.handleMessage(message),
      null,
      this.disposables
    );

    // Clean up on dispose
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Update webview when provider changes
    this.disposables.push(
      this.providerManager.onDidChangeProvider(() => this.sendStateToWebview())
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
      SettingsPanel.currentPanel.sendStateToWebview();
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
    SettingsPanel.currentPanel.sendStateToWebview();

    return SettingsPanel.currentPanel;
  }

  /** Send current state to the webview */
  private async sendStateToWebview(): Promise<void> {
    const config = vscode.workspace.getConfiguration('nopilot');

    const state: WebviewState = {
      providers: this.providerManager.getAllProviderInfos(),
      activeProviderId: this.providerManager.getActiveProviderId(),
      settings: {
        inlineEnabled: config.get('inline.enabled', true),
        pauseWhenCopilotActive: config.get('inline.pauseWhenCopilotActive', true),
        debounceMs: config.get('inline.debounceMs', 300),
        maxPrefixLines: config.get('inline.maxPrefixLines', 50),
        maxSuffixLines: config.get('inline.maxSuffixLines', 20),
        ollamaEndpoint: config.get('ollama.endpoint', 'http://localhost:11434'),
        commitLanguage: config.get('commitMessage.language', 'en'),
        commitFormat: config.get('commitMessage.format', 'conventional'),
      },
    };

    this.panel.webview.postMessage({ command: 'updateState', state });
  }

  /** Handle messages from the webview */
  private async handleMessage(message: WebviewMessage): Promise<void> {
    await handleSettingsPanelMessage(message, {
      getProvider: (providerId) => this.providerManager.getProvider(providerId as any),
      switchProvider: (providerId) => this.providerManager.switchProvider(providerId as any),
      updateModel: (providerId, model) =>
        this.providerManager.updateModel(providerId as any, model),
      promptForApiKey: (providerName) => this.authService.promptForApiKey(providerName),
      setApiKey: (providerId, key) => this.authService.setApiKey(providerId, key),
      removeApiKey: (providerId) => this.authService.removeApiKey(providerId),
      updateSetting: async (key, value) => {
        const config = vscode.workspace.getConfiguration('nopilot');
        await config.update(key, value, vscode.ConfigurationTarget.Global);
      },
      openExternal: async (url) => {
        await vscode.env.openExternal(vscode.Uri.parse(url));
      },
      sendState: () => this.sendStateToWebview(),
    });
  }

  dispose(): void {
    SettingsPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
