import type { ProviderId } from '../types';

export function getProviderModelConfigKey(providerId: ProviderId): string {
  return providerId === 'vscode-lm' ? 'model' : `${providerId}.model`;
}

export function getProviderModelSettingScope(providerId: ProviderId): string {
  return providerId === 'vscode-lm'
    ? 'nopilot.model'
    : `nopilot.${providerId}.model`;
}
