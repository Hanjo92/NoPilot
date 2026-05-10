import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSettingsWebviewState } from './settingsPanelState';
const OLLAMA_INFO = {
  id: 'ollama' as const,
  name: 'Ollama',
  icon: '🦙',
  description: 'local',
  status: 'ready' as const,
  currentModel: 'qwen2.5-coder:7b',
  availableModels: ['qwen2.5-coder:7b'],
  requiresApiKey: false,
  hasApiKey: true,
};

test('buildSettingsWebviewState returns provider info and settings without mutating provider state', async () => {
  const providers = [{ ...OLLAMA_INFO }];

  const state = await buildSettingsWebviewState({
    getAllProviderInfos: () => providers,
    getActiveProviderId: () => 'ollama',
    getProviderRequestCount: () => 6,
    getSetting: <T>(key: string, defaultValue: T): T => {
      const values: Record<string, unknown> = {
        'inline.enabled': true,
        'inline.qualityProfile': 'rich',
        'inline.pauseWhenCopilotActive': true,
        'inline.debounceMs': 300,
        'inline.maxPrefixLines': 50,
        'inline.maxSuffixLines': 20,
        'ollama.endpoint': 'http://127.0.0.1:11434',
        'ollama.remoteMode': 'forced-on',
        'commitMessage.language': 'en',
        'commitMessage.format': 'conventional',
      };

      return (values[key] as T | undefined) ?? defaultValue;
    },
  });

  assert.equal(state.activeProviderId, 'ollama');
  assert.equal(state.settings.ollamaEndpoint, 'http://127.0.0.1:11434');
  assert.equal(state.settings.ollamaRemoteMode, 'forced-on');
  assert.equal(state.settings.qualityProfile, 'rich');
  assert.deepEqual(state.providers[0].availableModels, ['qwen2.5-coder:7b']);
  assert.equal(state.providers[0].requestCount, 6);
  assert.equal(state.providers[0].isMostUsed, true);
  assert.equal(state.usage.currentProviderRequests, 6);
  assert.equal(state.usage.totalRequests, 6);
  assert.equal(state.usage.mostUsedProvider?.providerId, 'ollama');
});

test('buildSettingsWebviewState uses the manifest-aligned debounce default when unset', async () => {
  const state = await buildSettingsWebviewState({
    getAllProviderInfos: () => [{ ...OLLAMA_INFO }],
    getActiveProviderId: () => 'ollama',
    getProviderRequestCount: () => 0,
    getSetting: <T>(_key: string, defaultValue: T): T => defaultValue,
  });

  assert.equal(state.settings.debounceMs, 500);
});

test('buildSettingsWebviewState leaves most-used provider empty when there is no usage yet', async () => {
  const state = await buildSettingsWebviewState({
    getAllProviderInfos: () => [{ ...OLLAMA_INFO }],
    getActiveProviderId: () => 'ollama',
    getProviderRequestCount: () => 0,
    getSetting: <T>(_key: string, defaultValue: T): T => defaultValue,
  });

  assert.equal(state.usage.currentProviderRequests, 0);
  assert.equal(state.usage.totalRequests, 0);
  assert.equal(state.usage.mostUsedProvider, undefined);
  assert.equal(state.providers[0].isMostUsed, false);
});
