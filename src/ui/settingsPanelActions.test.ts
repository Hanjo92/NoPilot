import assert from 'node:assert/strict';
import test from 'node:test';
import type { AIProvider } from '../types';
import { handleSettingsPanelMessage } from './settingsPanelActions';

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

function createActions(overrides: Partial<Parameters<typeof handleSettingsPanelMessage>[1]> = {}) {
  const provider = new FakeProvider();
  const calls = {
    sendState: 0,
    switchProvider: [] as string[],
    updateModel: [] as Array<{ providerId: string; model: string }>,
    prompts: [] as string[],
    setApiKeys: [] as Array<{ providerId: string; key: string }>,
    removeApiKeys: [] as string[],
    updateSettings: [] as Array<{ key: string; value: unknown }>,
    openExternal: [] as string[],
  };

  const actions = {
    getProvider: () => provider,
    switchProvider: async (providerId: string) => {
      calls.switchProvider.push(providerId);
    },
    updateModel: async (providerId: string, model: string) => {
      calls.updateModel.push({ providerId, model });
    },
    promptForApiKey: async (providerName: string) => {
      calls.prompts.push(providerName);
      return 'secret-key';
    },
    setApiKey: async (providerId: string, key: string) => {
      calls.setApiKeys.push({ providerId, key });
    },
    removeApiKey: async (providerId: string) => {
      calls.removeApiKeys.push(providerId);
    },
    updateSetting: async (key: string, value: unknown) => {
      calls.updateSettings.push({ key, value });
    },
    openExternal: async (url: string) => {
      calls.openExternal.push(url);
    },
    sendState: async () => {
      calls.sendState += 1;
    },
    ...overrides,
  };

  return { provider, calls, actions };
}

test('handleSettingsPanelMessage sends state for requestState', async () => {
  const { calls, actions } = createActions();

  await handleSettingsPanelMessage({ command: 'requestState' }, actions);

  assert.equal(calls.sendState, 1);
});

test('handleSettingsPanelMessage stores API key, refreshes provider, and sends state', async () => {
  const { provider, calls, actions } = createActions();

  await handleSettingsPanelMessage(
    { command: 'setApiKey', providerId: 'openai' },
    actions
  );

  assert.deepEqual(calls.prompts, ['OpenAI']);
  assert.deepEqual(calls.setApiKeys, [{ providerId: 'openai', key: 'secret-key' }]);
  assert.equal(provider.refreshCalls, 1);
  assert.equal(calls.sendState, 1);
});

test('handleSettingsPanelMessage skips API key update when prompt is cancelled', async () => {
  const { provider, calls, actions } = createActions({
    promptForApiKey: async () => undefined,
  });

  await handleSettingsPanelMessage(
    { command: 'setApiKey', providerId: 'openai' },
    actions
  );

  assert.deepEqual(calls.setApiKeys, []);
  assert.equal(provider.refreshCalls, 0);
  assert.equal(calls.sendState, 0);
});

test('handleSettingsPanelMessage removes API key, refreshes provider, and sends state', async () => {
  const { provider, calls, actions } = createActions();

  await handleSettingsPanelMessage(
    { command: 'removeApiKey', providerId: 'openai' },
    actions
  );

  assert.deepEqual(calls.removeApiKeys, ['openai']);
  assert.equal(provider.refreshCalls, 1);
  assert.equal(calls.sendState, 1);
});

test('handleSettingsPanelMessage updates settings and forwards external links', async () => {
  const { calls, actions } = createActions();

  await handleSettingsPanelMessage(
    { command: 'updateSetting', key: 'inline.enabled', value: false },
    actions
  );
  await handleSettingsPanelMessage(
    { command: 'openExternal', url: 'https://example.com' },
    actions
  );

  assert.deepEqual(calls.updateSettings, [{ key: 'inline.enabled', value: false }]);
  assert.deepEqual(calls.openExternal, ['https://example.com']);
  assert.equal(calls.sendState, 1);
});
