import type { AIProvider, ProviderId, ProviderInfo, WebviewState } from '../types';
import { refreshProviderClient } from '../providers/providerCredentials';

interface SettingsPanelStateSource {
  getProvider: (providerId: ProviderId) => AIProvider | undefined;
  getAllProviderInfos: () => ProviderInfo[];
  getActiveProviderId: () => ProviderId;
  getSetting: <T>(key: string, defaultValue: T) => T;
}

export async function buildSettingsWebviewState(
  source: SettingsPanelStateSource
): Promise<WebviewState> {
  await refreshProviderClient(source.getProvider('ollama'));

  return {
    providers: source.getAllProviderInfos(),
    activeProviderId: source.getActiveProviderId(),
    settings: {
      inlineEnabled: source.getSetting('inline.enabled', true),
      pauseWhenCopilotActive: source.getSetting('inline.pauseWhenCopilotActive', true),
      debounceMs: source.getSetting('inline.debounceMs', 300),
      maxPrefixLines: source.getSetting('inline.maxPrefixLines', 50),
      maxSuffixLines: source.getSetting('inline.maxSuffixLines', 20),
      ollamaEndpoint: source.getSetting('ollama.endpoint', 'http://localhost:11434'),
      commitLanguage: source.getSetting('commitMessage.language', 'en'),
      commitFormat: source.getSetting('commitMessage.format', 'conventional'),
    },
  };
}
