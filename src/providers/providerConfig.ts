import type { ProviderId } from '../types';

function getProviderConfigPrefix(providerId: ProviderId): string {
  return providerId === 'openai-compatible' ? 'openaiCompatible' : providerId;
}

export function getProviderModelConfigKey(providerId: ProviderId): string {
  return providerId === 'vscode-lm' ? 'model' : `${getProviderConfigPrefix(providerId)}.model`;
}

export function getProviderModelSettingScope(providerId: ProviderId): string {
  return providerId === 'vscode-lm'
    ? 'nopilot.model'
    : `nopilot.${getProviderConfigPrefix(providerId)}.model`;
}
