import type { AIProvider, WebviewMessage } from '../types';
import { normalizeOllamaEndpoint } from '../providers/ollamaModels';
import {
  removeProviderApiKey,
  promptAndSaveProviderApiKey,
  refreshProviderClient,
} from '../providers/providerCredentials';

export interface SettingsPanelActions {
  getProvider: (providerId: string) => AIProvider | undefined;
  switchProvider: (providerId: string) => Promise<void>;
  updateModel: (providerId: string, model: string) => Promise<void>;
  promptForApiKey: (providerName: string) => Promise<string | undefined>;
  setApiKey: (providerId: string, key: string) => Promise<void>;
  removeApiKey: (providerId: string) => Promise<void>;
  updateSetting: (key: string, value: unknown) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  sendState: (options?: { refreshOllamaModels?: boolean }) => Promise<void>;
  debugLog?: (message: string) => void;
}

export async function handleSettingsPanelMessage(
  message: WebviewMessage,
  actions: SettingsPanelActions
): Promise<void> {
  switch (message.command) {
    case 'requestState':
      await actions.sendState({ refreshOllamaModels: true });
      return;

    case 'switchProvider':
      await actions.switchProvider(message.providerId);
      await actions.sendState({ refreshOllamaModels: false });
      return;

    case 'setApiKey': {
      const didSave = await promptAndSaveProviderApiKey(
        message.providerId,
        actions.getProvider(message.providerId),
        actions
      );
      if (didSave) {
        await actions.sendState({ refreshOllamaModels: false });
      }
      return;
    }

    case 'removeApiKey': {
      await removeProviderApiKey(
        message.providerId,
        actions.getProvider(message.providerId),
        actions
      );
      await actions.sendState({ refreshOllamaModels: false });
      return;
    }

    case 'updateModel':
      await actions.updateModel(message.providerId, message.model);
      await actions.sendState({ refreshOllamaModels: false });
      return;

    case 'updateSetting':
      if (message.key === 'ollama.endpoint') {
        actions.debugLog?.(
          `SettingsPanel updateSetting requested | ollama.endpoint=${String(message.value ?? '')}`
        );
      }
      await actions.updateSetting(
        message.key,
        message.key === 'ollama.endpoint'
          ? normalizeOllamaEndpoint(String(message.value ?? ''))
          : message.value
      );
      if (message.key === 'ollama.endpoint') {
        await refreshProviderClient(actions.getProvider('ollama'));
      }
      await actions.sendState({ refreshOllamaModels: false });
      return;

    case 'refreshOllama': {
      const endpoint = normalizeOllamaEndpoint(message.endpoint);
      actions.debugLog?.(`SettingsPanel refreshOllama requested | endpoint=${endpoint}`);
      await actions.updateSetting('ollama.endpoint', endpoint);
      await refreshProviderClient(actions.getProvider('ollama'));
      actions.debugLog?.(`SettingsPanel refreshOllama completed | endpoint=${endpoint}`);
      await actions.sendState({ refreshOllamaModels: false });
      return;
    }

    case 'openExternal':
      await actions.openExternal(message.url);
      return;
  }
}
