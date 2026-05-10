import assert from 'node:assert/strict';
import test from 'node:test';
import type { AIProvider, ProviderId, ProviderUsageSnapshot } from '../types';
import { buildSettingsWebviewState } from './settingsPanelState';

class FakeOllamaProvider implements AIProvider {
  readonly info = {
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

  refreshCalls = 0;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  setCurrentModel(model: string): void {
    this.info.currentModel = model;
  }

  async complete(): Promise<{ text: string }> {
    return { text: '' };
  }

  async generateCommitMessage(): Promise<string> {
    return '';
  }

  async refreshClient(): Promise<void> {
    this.refreshCalls += 1;
  }

  dispose(): void {}
}

test('buildSettingsWebviewState refreshes Ollama before returning provider info', async () => {
  const ollama = new FakeOllamaProvider();
  const usage: ProviderUsageSnapshot = {
    providerCounts: {
      'vscode-lm': 0,
      anthropic: 0,
      openai: 3,
      gemini: 0,
      ollama: 7,
    },
    totalRequests: 10,
    mostUsedProviderId: 'ollama',
    mostUsedCount: 7,
  };

  const state = await buildSettingsWebviewState({
    getProvider: (providerId: ProviderId) => (providerId === 'ollama' ? ollama : undefined),
    getAllProviderInfos: () => [ollama.info],
    getActiveProviderId: () => 'ollama',
    getUsageSnapshot: () => usage,
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

  assert.equal(ollama.refreshCalls, 1);
  assert.equal(state.activeProviderId, 'ollama');
  assert.equal(state.settings.ollamaEndpoint, 'http://127.0.0.1:11434');
  assert.equal(state.settings.ollamaRemoteMode, 'forced-on');
  assert.equal(state.settings.qualityProfile, 'rich');
  assert.equal(state.usage.activeProviderCount, 7);
  assert.equal(state.usage.mostUsedProviderName, 'Ollama');
  assert.equal(state.usage.totalRequests, 10);
  assert.deepEqual(state.providers[0].availableModels, ['qwen2.5-coder:7b']);
});

test('buildSettingsWebviewState can skip Ollama refresh for lightweight UI updates', async () => {
  const ollama = new FakeOllamaProvider();

  const state = await buildSettingsWebviewState({
    getProvider: (providerId: ProviderId) => (providerId === 'ollama' ? ollama : undefined),
    getAllProviderInfos: () => [ollama.info],
    getActiveProviderId: () => 'ollama',
    getUsageSnapshot: () => ({
      providerCounts: {
        'vscode-lm': 0,
        anthropic: 0,
        openai: 0,
        gemini: 0,
        ollama: 1,
      },
      totalRequests: 1,
      mostUsedProviderId: 'ollama',
      mostUsedCount: 1,
    }),
    getSetting: <T>(_key: string, defaultValue: T): T => defaultValue,
  }, { refreshOllamaModels: false });

  assert.equal(ollama.refreshCalls, 0);
  assert.equal(state.usage.activeProviderCount, 1);
});
