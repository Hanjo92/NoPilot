import type {
  InlineQualityProfile,
  ProviderInfo,
  ProviderUsageSummary,
  ProviderWebviewInfo,
  WebviewState,
} from '../types';

interface SettingsPanelStateSource {
  getAllProviderInfos: () => ProviderInfo[];
  getActiveProviderId: () => ProviderInfo['id'];
  getProviderRequestCount: (providerId: ProviderInfo['id']) => number;
  getSetting: <T>(key: string, defaultValue: T) => T;
}

function getMostUsedProvider(providers: ProviderWebviewInfo[]): ProviderUsageSummary | undefined {
  let mostUsedProvider: ProviderWebviewInfo | undefined;

  for (const provider of providers) {
    if (provider.requestCount <= 0) {
      continue;
    }

    if (!mostUsedProvider || provider.requestCount > mostUsedProvider.requestCount) {
      mostUsedProvider = provider;
    }
  }

  if (!mostUsedProvider) {
    return undefined;
  }

  return {
    providerId: mostUsedProvider.id,
    providerName: mostUsedProvider.name,
    providerIcon: mostUsedProvider.icon,
    requestCount: mostUsedProvider.requestCount,
  };
}

export async function buildSettingsWebviewState(
  source: SettingsPanelStateSource
): Promise<WebviewState> {
  const activeProviderId = source.getActiveProviderId();
  const providers = source.getAllProviderInfos().map((provider) => ({
    ...provider,
    requestCount: source.getProviderRequestCount(provider.id),
    isMostUsed: false,
  }));
  const mostUsedProvider = getMostUsedProvider(providers);
  const providersWithUsageFlags = providers.map((provider) => ({
    ...provider,
    isMostUsed: mostUsedProvider?.providerId === provider.id,
  }));
  const currentProviderRequests =
    providersWithUsageFlags.find((provider) => provider.id === activeProviderId)?.requestCount || 0;
  const totalRequests = providersWithUsageFlags.reduce(
    (total, provider) => total + provider.requestCount,
    0
  );

  return {
    providers: providersWithUsageFlags,
    activeProviderId,
    usage: {
      currentProviderRequests,
      totalRequests,
      mostUsedProvider,
    },
    settings: {
      inlineEnabled: source.getSetting('inline.enabled', true),
      qualityProfile: source.getSetting<InlineQualityProfile>('inline.qualityProfile', 'balanced'),
      pauseWhenCopilotActive: source.getSetting('inline.pauseWhenCopilotActive', true),
      debounceMs: source.getSetting('inline.debounceMs', 500),
      maxPrefixLines: source.getSetting('inline.maxPrefixLines', 50),
      maxSuffixLines: source.getSetting('inline.maxSuffixLines', 20),
      ollamaEndpoint: source.getSetting('ollama.endpoint', 'http://localhost:11434'),
      ollamaRemoteMode: source.getSetting('ollama.remoteMode', 'auto'),
      commitLanguage: source.getSetting('commitMessage.language', 'en'),
      commitFormat: source.getSetting('commitMessage.format', 'conventional'),
    },
  };
}
