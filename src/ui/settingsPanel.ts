import * as vscode from 'vscode';
import { ProviderManager } from '../providers/providerManager';
import { AuthService } from '../services/authService';
import { ProviderId, WebviewMessage, WebviewState } from '../types';

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
    private readonly extensionUri: vscode.Uri,
    private readonly providerManager: ProviderManager,
    private readonly authService: AuthService
  ) {
    this.panel = panel;

    // Set the webview HTML content
    this.panel.webview.html = this.getHtmlForWebview();

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
      extensionUri,
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
        debounceMs: config.get('inline.debounceMs', 300),
        maxPrefixLines: config.get('inline.maxPrefixLines', 50),
        maxSuffixLines: config.get('inline.maxSuffixLines', 20),
        commitLanguage: config.get('commitMessage.language', 'en'),
        commitFormat: config.get('commitMessage.format', 'conventional'),
      },
    };

    this.panel.webview.postMessage({ command: 'updateState', state });
  }

  /** Handle messages from the webview */
  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.command) {
      case 'requestState':
        await this.sendStateToWebview();
        break;

      case 'switchProvider':
        await this.providerManager.switchProvider(message.providerId);
        await this.sendStateToWebview();
        break;

      case 'setApiKey': {
        const provider = this.providerManager.getProvider(message.providerId);
        if (provider) {
          const key = await this.authService.promptForApiKey(provider.info.name);
          if (key) {
            await this.authService.setApiKey(message.providerId, key);
            if ('refreshClient' in provider) {
              await (provider as { refreshClient(): Promise<void> }).refreshClient();
            }
            await this.sendStateToWebview();
          }
        }
        break;
      }

      case 'removeApiKey':
        await this.authService.removeApiKey(message.providerId);
        {
          const prov = this.providerManager.getProvider(message.providerId);
          if (prov && 'refreshClient' in prov) {
            await (prov as { refreshClient(): Promise<void> }).refreshClient();
          }
        }
        await this.sendStateToWebview();
        break;

      case 'updateModel':
        await this.providerManager.updateModel(message.providerId, message.model);
        await this.sendStateToWebview();
        break;

      case 'updateSetting': {
        const config = vscode.workspace.getConfiguration('nopilot');
        await config.update(message.key, message.value, vscode.ConfigurationTarget.Global);
        await this.sendStateToWebview();
        break;
      }

      case 'openExternal':
        vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;
    }
  }

  /** Generate the webview HTML with inline styles and scripts */
  private getHtmlForWebview(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>NoPilot Settings</title>
  <style nonce="${nonce}">
    :root {
      --card-bg: var(--vscode-editor-background);
      --card-border: var(--vscode-widget-border, var(--vscode-editorGroup-border));
      --card-hover: var(--vscode-list-hoverBackground);
      --active-border: var(--vscode-focusBorder);
      --badge-bg: var(--vscode-badge-background);
      --badge-fg: var(--vscode-badge-foreground);
      --danger: var(--vscode-errorForeground);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      padding: 20px 32px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.6;
    }

    h1 {
      font-size: 1.5em;
      font-weight: 600;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    h1 .icon { font-size: 1.3em; }

    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 24px;
      font-size: 0.9em;
    }

    h2 {
      font-size: 1.1em;
      font-weight: 600;
      margin: 28px 0 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* ── Provider Cards Grid ── */
    .provider-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }

    .provider-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
      position: relative;
    }

    .provider-card:hover {
      border-color: var(--vscode-focusBorder);
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .provider-card.active {
      border-color: var(--active-border);
      border-width: 2px;
      padding: 15px; /* compensate for thicker border */
    }

    .provider-card .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .provider-card .card-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 1.05em;
    }

    .provider-card .card-icon {
      font-size: 1.4em;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.75em;
      font-weight: 600;
    }

    .badge.active {
      background: var(--badge-bg);
      color: var(--badge-fg);
    }

    .badge.needs-key {
      background: var(--vscode-editorWarning-foreground);
      color: var(--vscode-editor-background);
      opacity: 0.9;
    }

    .badge.unavailable {
      opacity: 0.5;
    }

    .provider-card .card-desc {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      margin-bottom: 12px;
    }

    .provider-card .card-model {
      font-size: 0.85em;
      margin-bottom: 8px;
    }

    .provider-card .card-model label {
      color: var(--vscode-descriptionForeground);
    }

    .provider-card select {
      width: 100%;
      padding: 4px 8px;
      margin-top: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--card-border));
      border-radius: 4px;
      font-family: inherit;
      font-size: inherit;
      outline: none;
    }

    .provider-card select:focus {
      border-color: var(--vscode-focusBorder);
    }

    .card-actions {
      display: flex;
      gap: 6px;
      margin-top: 10px;
    }

    /* ── Buttons ── */
    button {
      padding: 5px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.85em;
      font-weight: 500;
      transition: opacity 0.15s;
    }

    button:hover { opacity: 0.85; }

    button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.danger {
      background: transparent;
      color: var(--danger);
      border: 1px solid var(--danger);
      opacity: 0.7;
    }

    button.danger:hover { opacity: 1; }

    /* ── Settings Section ── */
    .settings-section {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px 20px;
      margin-top: 12px;
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--card-border);
    }

    .setting-row:last-child { border-bottom: none; }

    .setting-label {
      display: flex;
      flex-direction: column;
    }

    .setting-label .label-text { font-weight: 500; }
    .setting-label .label-desc {
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
    }

    .setting-control {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .setting-control input[type="number"] {
      width: 70px;
      padding: 4px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--card-border));
      border-radius: 4px;
      font-family: inherit;
      text-align: center;
    }

    .setting-control select {
      padding: 4px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--card-border));
      border-radius: 4px;
      font-family: inherit;
    }

    /* Toggle switch */
    .toggle {
      position: relative;
      width: 40px;
      height: 22px;
    }

    .toggle input { opacity: 0; width: 0; height: 0; }

    .toggle .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--card-border));
      border-radius: 22px;
      transition: 0.2s;
    }

    .toggle .slider:before {
      position: absolute;
      content: "";
      height: 16px; width: 16px;
      left: 2px; bottom: 2px;
      background: var(--vscode-foreground);
      border-radius: 50%;
      transition: 0.2s;
    }

    .toggle input:checked + .slider {
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-background);
    }

    .toggle input:checked + .slider:before {
      transform: translateX(18px);
      background: var(--vscode-button-foreground);
    }

    /* ── Footer ── */
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid var(--card-border);
      color: var(--vscode-descriptionForeground);
      font-size: 0.8em;
      text-align: center;
    }

    .footer a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }

    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1><span class="icon">⚡</span> NoPilot Settings</h1>
  <p class="subtitle">Configure your AI providers and extension settings</p>

  <h2>🔌 Providers</h2>
  <div class="provider-grid" id="providerGrid">
    <!-- Dynamically populated -->
  </div>

  <h2>⚙ Inline Completion</h2>
  <div class="settings-section" id="inlineSettings">
    <!-- Dynamically populated -->
  </div>

  <h2>💬 Commit Messages</h2>
  <div class="settings-section" id="commitSettings">
    <!-- Dynamically populated -->
  </div>

  <div class="footer">
    NoPilot v0.1.0 — Replace Copilot with your preferred AI provider
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentState = null;

    // ── Receive messages from extension ──
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'updateState') {
        currentState = message.state;
        render(currentState);
      }
    });

    // ── Request initial state ──
    vscode.postMessage({ command: 'requestState' });

    // ── Render ──
    function render(state) {
      renderProviders(state.providers, state.activeProviderId);
      renderInlineSettings(state.settings);
      renderCommitSettings(state.settings);
    }

    function renderProviders(providers, activeId) {
      const grid = document.getElementById('providerGrid');
      grid.innerHTML = providers.map(p => {
        const isActive = p.id === activeId;
        const statusBadge = isActive
          ? '<span class="badge active">✓ Active</span>'
          : p.status === 'needs-key'
            ? '<span class="badge needs-key">🔑 Key needed</span>'
            : p.status === 'unavailable'
              ? '<span class="badge unavailable">Unavailable</span>'
              : '<span class="badge">Ready</span>';

        const modelSelect = p.availableModels.length > 0
          ? '<select onchange="updateModel(\\'' + p.id + '\\', this.value)">'
            + p.availableModels.map(m =>
                '<option value="' + m + '"' + (m === p.currentModel ? ' selected' : '') + '>' + m + '</option>'
              ).join('')
            + '</select>'
          : '<span style="opacity:0.5">' + (p.currentModel || 'Auto-detect') + '</span>';

        let actions = '';
        if (!isActive && (p.status === 'ready' || !p.requiresApiKey)) {
          actions += '<button class="primary" onclick="switchProvider(\\'' + p.id + '\\')">Activate</button>';
        }
        if (p.requiresApiKey) {
          if (p.hasApiKey) {
            actions += '<button class="secondary" onclick="setApiKey(\\'' + p.id + '\\')">Change Key</button>';
            actions += '<button class="danger" onclick="removeApiKey(\\'' + p.id + '\\')">Remove</button>';
          } else {
            actions += '<button class="primary" onclick="setApiKey(\\'' + p.id + '\\')">Set API Key</button>';
          }
        }

        return '<div class="provider-card' + (isActive ? ' active' : '') + '">'
          + '<div class="card-header">'
          + '  <div class="card-title"><span class="card-icon">' + p.icon + '</span> ' + p.name + '</div>'
          + '  ' + statusBadge
          + '</div>'
          + '<div class="card-desc">' + p.description + '</div>'
          + '<div class="card-model">'
          + '  <label>Model</label>'
          + '  ' + modelSelect
          + '</div>'
          + '<div class="card-actions">' + actions + '</div>'
          + '</div>';
      }).join('');
    }

    function renderInlineSettings(settings) {
      const container = document.getElementById('inlineSettings');
      container.innerHTML = ''
        + settingRow('Enabled', 'Enable inline code suggestions',
            toggleSwitch('inline.enabled', settings.inlineEnabled))
        + settingRow('Debounce', 'Delay before requesting completion (ms)',
            numberInput('inline.debounceMs', settings.debounceMs, 100, 2000))
        + settingRow('Prefix Lines', 'Lines of code before cursor for context',
            numberInput('inline.maxPrefixLines', settings.maxPrefixLines, 5, 200))
        + settingRow('Suffix Lines', 'Lines of code after cursor for context',
            numberInput('inline.maxSuffixLines', settings.maxSuffixLines, 0, 100));
    }

    function renderCommitSettings(settings) {
      const container = document.getElementById('commitSettings');
      container.innerHTML = ''
        + settingRow('Language', 'Commit message language',
            selectInput('commitMessage.language', settings.commitLanguage, [
              { value: 'en', label: 'English' },
              { value: 'ko', label: '한국어' },
              { value: 'ja', label: '日本語' },
              { value: 'zh', label: '中文' },
              { value: 'es', label: 'Español' },
              { value: 'fr', label: 'Français' },
              { value: 'de', label: 'Deutsch' },
            ]))
        + settingRow('Format', 'Commit message format',
            selectInput('commitMessage.format', settings.commitFormat, [
              { value: 'conventional', label: 'Conventional Commits' },
              { value: 'simple', label: 'Simple' },
            ]));
    }

    // ── UI Helpers ──
    function settingRow(label, desc, control) {
      return '<div class="setting-row">'
        + '<div class="setting-label">'
        + '  <span class="label-text">' + label + '</span>'
        + '  <span class="label-desc">' + desc + '</span>'
        + '</div>'
        + '<div class="setting-control">' + control + '</div>'
        + '</div>';
    }

    function toggleSwitch(key, checked) {
      return '<label class="toggle">'
        + '<input type="checkbox"' + (checked ? ' checked' : '')
        + ' onchange="updateSetting(\\'' + key + '\\', this.checked)">'
        + '<span class="slider"></span></label>';
    }

    function numberInput(key, value, min, max) {
      return '<input type="number" value="' + value + '" min="' + min + '" max="' + max + '"'
        + ' onchange="updateSetting(\\'' + key + '\\', parseInt(this.value))">';
    }

    function selectInput(key, value, options) {
      return '<select onchange="updateSetting(\\'' + key + '\\', this.value)">'
        + options.map(o =>
            '<option value="' + o.value + '"' + (o.value === value ? ' selected' : '') + '>'
            + o.label + '</option>'
          ).join('')
        + '</select>';
    }

    // ── Actions → Extension ──
    function switchProvider(id)  { vscode.postMessage({ command: 'switchProvider', providerId: id }); }
    function setApiKey(id)       { vscode.postMessage({ command: 'setApiKey', providerId: id }); }
    function removeApiKey(id)    { vscode.postMessage({ command: 'removeApiKey', providerId: id }); }
    function updateModel(id, m)  { vscode.postMessage({ command: 'updateModel', providerId: id, model: m }); }
    function updateSetting(k, v) { vscode.postMessage({ command: 'updateSetting', key: k, value: v }); }
  </script>
</body>
</html>`;
  }

  dispose(): void {
    SettingsPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

/** Generate a random nonce for CSP */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
