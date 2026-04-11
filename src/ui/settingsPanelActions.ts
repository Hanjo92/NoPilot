import type { AIProvider, WebviewMessage } from '../types';
import {
  removeProviderApiKey,
  promptAndSaveProviderApiKey,
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
  sendState: () => Promise<void>;
}

export async function handleSettingsPanelMessage(
  message: WebviewMessage,
  actions: SettingsPanelActions
): Promise<void> {
  switch (message.command) {
    case 'requestState':
      await actions.sendState();
      return;

    case 'switchProvider':
      await actions.switchProvider(message.providerId);
      await actions.sendState();
      return;

    case 'setApiKey': {
      const didSave = await promptAndSaveProviderApiKey(
        message.providerId,
        actions.getProvider(message.providerId),
        actions
      );
      if (didSave) {
        await actions.sendState();
      }
      return;
    }

    case 'removeApiKey': {
      await removeProviderApiKey(
        message.providerId,
        actions.getProvider(message.providerId),
        actions
      );
      await actions.sendState();
      return;
    }

    case 'updateModel':
      await actions.updateModel(message.providerId, message.model);
      await actions.sendState();
      return;

    case 'updateSetting':
      await actions.updateSetting(message.key, message.value);
      await actions.sendState();
      return;

    case 'openExternal':
      await actions.openExternal(message.url);
      return;
  }
}
