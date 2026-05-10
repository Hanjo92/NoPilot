import * as vscode from 'vscode';
import { AuthService } from './services/authService';
import { GitService } from './services/gitService';
import { ProviderManager } from './providers/providerManager';
import { NoPilotInlineCompletionProvider } from './features/inlineCompletionProvider';
import { CommitMessageGenerator } from './features/commitMessageGenerator';
import { SettingsPanel } from './ui/settingsPanel';
import { handleInlineChat } from './features/inlineChat';
import { promptAndSaveProviderApiKey } from './providers/providerCredentials';
import { getProviderModelConfigKey, getProviderModelSettingScope } from './providers/providerConfig';
import type { ProviderId } from './types';
import { log, logError, getOutputChannel } from './utils/logger';
import { getNoPilotStatusBarPresentation } from './ui/statusBarPresentation';

let statusBarItem: vscode.StatusBarItem;
const PROVIDER_IDS: ProviderId[] = ['vscode-lm', 'anthropic', 'openai', 'gemini', 'ollama'];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('Activating extension...');
  context.subscriptions.push(getOutputChannel());

  // ── Services ──
  const authService = new AuthService(context.secrets);
  const gitService = new GitService();
  await gitService.initialize();

  // ── Provider Manager ──
  const providerManager = new ProviderManager(authService, context.globalState);
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
  providerManager.onDidChangeUsage(refreshStatusBar);
  context.subscriptions.push(
    inlineProvider.onDidChangeRequestStatus(() => refreshStatusBar())
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => refreshStatusBar())
  );
  context.subscriptions.push(
    authService.onDidChange((event) => {
      const providerId = authService.getProviderIdForSecretKey(event.key);
      if (!providerId) {
        return;
      }

      if (authService.consumeLocalSecretChange(event.key)) {
        return;
      }

      void (async () => {
        try {
          await providerManager.refreshProviderState(providerId);
          await providerManager.reconcileConfiguredProvider();
        } catch (error) {
          logError('Secret change sync failed', error);
        }
      })();
    })
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
          await providerManager.syncProviderState(selected.id as ProviderId);
          await providerManager.reconcileConfiguredProvider();
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
      void (async () => {
        try {
          if (e.affectsConfiguration('nopilot.ollama.endpoint')) {
            await providerManager.refreshProviderState('ollama');
          }

          if (
            (e.affectsConfiguration('nopilot.provider') ||
              e.affectsConfiguration('nopilot.ollama.endpoint'))
          ) {
            await providerManager.reconcileConfiguredProvider();
          }

          for (const providerId of PROVIDER_IDS) {
            if (!e.affectsConfiguration(getProviderModelSettingScope(providerId))) {
              continue;
            }

            const configuredModel = vscode.workspace
              .getConfiguration('nopilot')
              .get<string>(getProviderModelConfigKey(providerId), '');
            const provider = providerManager.getProvider(providerId);

            if (provider && configuredModel !== provider.info.currentModel) {
              await providerManager.updateModel(providerId, configuredModel);
            }
          }

          if (
            e.affectsConfiguration('nopilot.inline') ||
            e.affectsConfiguration('nopilot.ollama.endpoint') ||
            e.affectsConfiguration('nopilot.ollama.remoteMode') ||
            e.affectsConfiguration('github.copilot.enable') ||
            e.affectsConfiguration('editor.inlineSuggest.enabled')
          ) {
            refreshStatusBar();
          }
        } catch (error) {
          logError('Configuration change sync failed', error);
        }
      })();
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
  const requestStatus = inlineProvider?.getRequestStatus();
  const activeRequestStatus = requestStatus?.providerId === info.id
    ? requestStatus
    : undefined;
  const mostUsedProvider = providerManager.getMostUsedProviderUsage();
  const presentation = getNoPilotStatusBarPresentation({
    displayName,
    providerName: info.name,
    model: info.currentModel,
    currentProviderRequests: providerManager.getProviderRequestCount(info.id),
    mostUsedProvider: mostUsedProvider
      ? {
          providerName: mostUsedProvider.providerName,
          requestCount: mostUsedProvider.requestCount,
        }
      : undefined,
    inlineEnabled: inlineProvider?.isEnabled() ?? true,
    pausedForCopilot: inlineProvider?.isPausedForCopilot() ?? false,
    requestStatus: activeRequestStatus,
  });

  statusBarItem.text = presentation.text;
  statusBarItem.tooltip = presentation.tooltip;
}

export function deactivate(): void {
  console.log('[NoPilot] Extension deactivated');
}
