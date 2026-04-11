import assert from 'node:assert/strict';
import test from 'node:test';
import type { AIProvider } from '../types';
import {
  removeProviderApiKey,
  promptAndSaveProviderApiKey,
  refreshProviderClient,
} from './providerCredentials';

class FakeProvider implements AIProvider {
  readonly info = {
    id: 'openai' as const,
    name: 'OpenAI',
    icon: 'x',
    description: 'provider',
    status: 'ready' as const,
    currentModel: 'gpt-4o-mini',
    availableModels: ['gpt-4o-mini'],
    requiresApiKey: true,
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

test('refreshProviderClient refreshes providers that expose refreshClient', async () => {
  const provider = new FakeProvider();

  await refreshProviderClient(provider);

  assert.equal(provider.refreshCalls, 1);
});

test('promptAndSaveProviderApiKey stores the key and refreshes the provider', async () => {
  const provider = new FakeProvider();
  const stored: Array<{ providerId: string; key: string }> = [];

  const saved = await promptAndSaveProviderApiKey('openai', provider, {
    promptForApiKey: async (providerName) => {
      assert.equal(providerName, 'OpenAI');
      return 'secret-key';
    },
    setApiKey: async (providerId, key) => {
      stored.push({ providerId, key });
    },
  });

  assert.equal(saved, true);
  assert.deepEqual(stored, [{ providerId: 'openai', key: 'secret-key' }]);
  assert.equal(provider.refreshCalls, 1);
});

test('promptAndSaveProviderApiKey returns false when the user cancels', async () => {
  const provider = new FakeProvider();

  const saved = await promptAndSaveProviderApiKey('openai', provider, {
    promptForApiKey: async () => undefined,
    setApiKey: async () => {
      throw new Error('should not store');
    },
  });

  assert.equal(saved, false);
  assert.equal(provider.refreshCalls, 0);
});

test('removeProviderApiKey removes the key and refreshes the provider', async () => {
  const provider = new FakeProvider();
  const removed: string[] = [];

  await removeProviderApiKey('openai', provider, {
    removeApiKey: async (providerId) => {
      removed.push(providerId);
    },
  });

  assert.deepEqual(removed, ['openai']);
  assert.equal(provider.refreshCalls, 1);
});
