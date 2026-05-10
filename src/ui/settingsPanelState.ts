import type {
  AIProvider,
  InlineQualityProfile,
  ProviderUsageSnapshot,
  ProviderId,
  ProviderInfo,
  WebviewState,
} from '../types';
import { refreshProviderClient } from '../providers/providerCredentials';

interface SettingsPanelStateSource {
  getProvider: (providerId: ProviderId) => AIProvider | undefined;
  getAllProviderInfos: () => ProviderInfo[];
  getActiveProviderId: () => ProviderId;
  getUsageSnapshot: () => ProviderUsageSnapshot;
  getSetting: <T>(key: string, defaultValue: T) => T;
}

export async function buildSettingsWebviewState(
  source: SettingsPanelStateSource,
  options: {
    refreshOllamaModels?: boolean;
  } = {}
): Promise<WebviewState> {
  if (options.refreshOllamaModels ?? true) {
    await refreshProviderClient(source.getProvider('ollama'));
  }
  const providers = source.getAllProviderInfos();
  const activeProviderId = source.getActiveProviderId();
  const usage = source.getUsageSnapshot();
  const mostUsedProvider = usage.mostUsedProviderId
    ? providers.find((provider) => provider.id === usage.mostUsedProviderId)
    : undefined;

  return {
    providers,
    activeProviderId,
    usage: {
      ...usage,
      activeProviderCount: usage.providerCounts[activeProviderId] ?? 0,
      mostUsedProviderName: mostUsedProvider?.name ?? 'None yet',
    },
    settings: {
      inlineEnabled: source.getSetting('inline.enabled', true),
      qualityProfile: source.getSetting<InlineQualityProfile>('inline.qualityProfile', 'balanced'),
      pauseWhenCopilotActive: source.getSetting('inline.pauseWhenCopilotActive', true),
      debounceMs: source.getSetting('inline.debounceMs', 300),
      maxPrefixLines: source.getSetting('inline.maxPrefixLines', 50),
      maxSuffixLines: source.getSetting('inline.maxSuffixLines', 20),
      ollamaEndpoint: source.getSetting('ollama.endpoint', 'http://localhost:11434'),
      ollamaRemoteMode: source.getSetting('ollama.remoteMode', 'auto'),
      commitLanguage: source.getSetting('commitMessage.language', 'en'),
      commitFormat: source.getSetting('commitMessage.format', 'conventional'),
    },
  };
}
