import type { AIProvider } from '../types';

type RefreshableProvider = AIProvider & {
  refreshClient: () => Promise<void>;
};

interface ProviderCredentialActions {
  promptForApiKey: (providerName: string) => Promise<string | undefined>;
  setApiKey: (providerId: string, key: string) => Promise<void>;
}

interface ProviderCredentialRemovalActions {
  removeApiKey: (providerId: string) => Promise<void>;
}

function hasRefreshClient(provider: AIProvider | undefined): provider is RefreshableProvider {
  return Boolean(provider && 'refreshClient' in provider && typeof provider.refreshClient === 'function');
}

export async function refreshProviderClient(provider: AIProvider | undefined): Promise<void> {
  if (hasRefreshClient(provider)) {
    await provider.refreshClient();
  }
}

export async function promptAndSaveProviderApiKey(
  providerId: string,
  provider: AIProvider | undefined,
  actions: ProviderCredentialActions
): Promise<boolean> {
  if (!provider) {
    return false;
  }

  const key = await actions.promptForApiKey(provider.info.name);
  if (!key) {
    return false;
  }

  await actions.setApiKey(providerId, key);
  await refreshProviderClient(provider);
  return true;
}

export async function removeProviderApiKey(
  providerId: string,
  provider: AIProvider | undefined,
  actions: ProviderCredentialRemovalActions
): Promise<void> {
  await actions.removeApiKey(providerId);
  await refreshProviderClient(provider);
}
