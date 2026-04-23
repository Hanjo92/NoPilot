import * as vscode from 'vscode';
import { AuthService } from './services/authService';
import { GitService } from './services/gitService';
import { ProviderManager } from './providers/providerManager';
import { NoPilotInlineCompletionProvider } from './features/inlineCompletionProvider';
import { CommitMessageGenerator } from './features/commitMessageGenerator';
import { SettingsPanel } from './ui/settingsPanel';
import { handleInlineChat } from './features/inlineChat';
import { promptAndSaveProviderApiKey } from './providers/providerCredentials';
import { log, getOutputChannel } from './utils/logger';
import { getNoPilotStatusBarPresentation } from './ui/statusBarPresentation';

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('Activating extension...');
  context.subscriptions.push(getOutputChannel());

  // ── Services ──
  const authService = new AuthService(context.secrets);
  const gitService = new GitService();
  await gitService.initialize();

  // ── Provider Manager ──
  const providerManager = new ProviderManager(authService);
  await providerManager.initialize();
  context.subscriptions.push(providerManager);

  // Log provider states
  const infos = providerManager.getAllProviderInfos();
  for (const info of infos) {
    log(`Provider ${info.icon} ${info.name}: ${info.status} | model: ${info.currentModel} | ${info.description}`);
  }
  log(`Active provider: ${providerManager.getActiveProviderId()}`);

  // ── Features ──
  const inlineProvider = new NoPilotInlineCompletionProvider(providerManager);
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      inlineProvider
    )
  );
  context.subscriptions.push(inlineProvider);

  const commitGenerator = new CommitMessageGenerator(providerManager, gitService);

  // ── Status Bar ──
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'nopilot.switchProvider';
  const refreshStatusBar = () => updateStatusBar(providerManager, inlineProvider);
  refreshStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Update status bar when provider changes
  providerManager.onDidChangeProvider(refreshStatusBar);
  context.subscriptions.push(
    inlineProvider.onDidChangeRequestStatus(() => refreshStatusBar())
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => refreshStatusBar())
  );

  // ── Commands ──

  // Inline Chat
  context.subscriptions.push(
    vscode.commands.registerCommand('nopilot.inlineChat', () => {
      handleInlineChat(providerManager);
    })
  );

  // Open settings panel
  context.subscriptions.push(
    vscode.commands.registerCommand('nopilot.openSettings', () => {
      SettingsPanel.createOrShow(context.extensionUri, providerManager, authService);
    })
  );

  // Switch provider (Quick Pick)
  context.subscriptions.push(
    vscode.commands.registerCommand('nopilot.switchProvider', () => {
      providerManager.showProviderQuickPick();
    })
  );

  // Generate commit message
  context.subscriptions.push(
    vscode.commands.registerCommand('nopilot.generateCommitMessage', () => {
      commitGenerator.generate();
    })
  );

  // Toggle inline suggestions
  context.subscriptions.push(
    vscode.commands.registerCommand('nopilot.toggleInline', () => {
      inlineProvider.toggle();
      const state = inlineProvider.isEnabled() ? 'enabled' : 'disabled';
      vscode.window.showInformationMessage(`NoPilot: Inline suggestions ${state}`);
      refreshStatusBar();
    })
  );

  // Set API key
  context.subscriptions.push(
    vscode.commands.registerCommand('nopilot.setApiKey', async () => {
      const providers = providerManager
        .getAllProviderInfos()
        .filter((p) => p.requiresApiKey);

      if (providers.length === 0) {
        vscode.window.showInformationMessage('No providers require API keys');
        return;
      }

      const selected = await vscode.window.showQuickPick(
        providers.map((p) => ({
          label: `${p.icon} ${p.name}`,
          description: p.hasApiKey ? '(key configured)' : '(no key)',
          id: p.id,
        })),
        { title: 'Select provider to set API key' }
      );

      if (selected) {
        const provider = providerManager.getProvider(selected.id as any);
        const didSave = await promptAndSaveProviderApiKey(
          selected.id,
          provider,
          authService
        );

        if (didSave && provider) {
          vscode.window.showInformationMessage(
            `NoPilot: ${provider.info.name} API key saved`
          );
          refreshStatusBar();
        }
      }
    })
  );

  // ── Config Change Listener ──
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('nopilot.provider')) {
        const newProvider = vscode.workspace
          .getConfiguration('nopilot')
          .get<string>('provider', 'vscode-lm');
        providerManager.switchProvider(newProvider as any);
      }

      if (
        e.affectsConfiguration('nopilot.inline') ||
        e.affectsConfiguration('github.copilot.enable') ||
        e.affectsConfiguration('editor.inlineSuggest.enabled')
      ) {
        refreshStatusBar();
      }
    })
  );

  console.log('[NoPilot] Extension activated successfully');
}

/** Update the status bar item with current provider info */
function updateStatusBar(
  providerManager: ProviderManager,
  inlineProvider?: NoPilotInlineCompletionProvider
): void {
  const displayName = providerManager.getActiveDisplayName();
  const active = providerManager.getActiveProvider();
  const info = active.info;
  const presentation = getNoPilotStatusBarPresentation({
    displayName,
    providerName: info.name,
    model: info.currentModel,
    inlineEnabled: inlineProvider?.isEnabled() ?? true,
    pausedForCopilot: inlineProvider?.isPausedForCopilot() ?? false,
    requestStatus: inlineProvider?.getRequestStatus(),
  });

  statusBarItem.text = presentation.text;
  statusBarItem.tooltip = presentation.tooltip;
}

export function deactivate(): void {
  console.log('[NoPilot] Extension deactivated');
}
