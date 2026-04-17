import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDirectProviderDefaultModel,
  getDirectProviderFallbackModels,
  refreshAnthropicModelCatalog,
  refreshGeminiModelCatalog,
  refreshOpenAIModelCatalog,
  resolveDirectProviderModelState,
} from './directProviderModels';

test('curated fallbacks prefer current production defaults', () => {
  assert.equal(getDirectProviderDefaultModel('openai'), 'gpt-5-mini');
  assert.equal(getDirectProviderDefaultModel('anthropic'), 'claude-sonnet-4-20250514');
  assert.equal(getDirectProviderDefaultModel('gemini'), 'gemini-2.5-flash');

  assert.deepEqual(
    getDirectProviderFallbackModels('openai').slice(0, 4),
    ['gpt-5-mini', 'gpt-5', 'gpt-5-nano', 'gpt-4.1']
  );
  assert.deepEqual(
    getDirectProviderFallbackModels('anthropic').slice(0, 3),
    ['claude-sonnet-4-20250514', 'claude-opus-4-1-20250805', 'claude-opus-4-20250514']
  );
  assert.deepEqual(
    getDirectProviderFallbackModels('gemini').slice(0, 3),
    ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite']
  );
});

test('refreshOpenAIModelCatalog filters non-text and snapshot-like models', async () => {
  const models = await refreshOpenAIModelCatalog(
    'secret-key',
    async (url: string, init?: RequestInit) => {
      assert.equal(url, 'https://api.openai.com/v1/models');
      assert.equal(init?.method, 'GET');
      assert.equal(
        (init?.headers as Record<string, string>)?.Authorization,
        'Bearer secret-key'
      );

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({
          data: [
            { id: 'gpt-5' },
            { id: 'gpt-5-mini' },
            { id: 'gpt-5-mini-2026-02-02' },
            { id: 'gpt-4.1-mini' },
            { id: 'gpt-4o-mini' },
            { id: 'o4-mini' },
            { id: 'gpt-image-1.5' },
            { id: 'gpt-audio' },
            { id: 'gpt-realtime-mini' },
            { id: 'text-embedding-3-large' },
            { id: 'omni-moderation' },
            { id: 'chatgpt-5' },
          ],
        }),
      };
    }
  );

  assert.deepEqual(models, [
    'gpt-5-mini',
    'gpt-5',
    'gpt-4.1-mini',
    'gpt-4o-mini',
    'o4-mini',
  ]);
});

test('refreshAnthropicModelCatalog keeps Claude API models in preferred order', async () => {
  const models = await refreshAnthropicModelCatalog(
    'secret-key',
    async (url: string, init?: RequestInit) => {
      assert.equal(url, 'https://api.anthropic.com/v1/models');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['x-api-key'], 'secret-key');
      assert.equal(headers['anthropic-version'], '2023-06-01');

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({
          data: [
            { id: 'claude-opus-4-20250514' },
            { id: 'claude-sonnet-4-20250514' },
            { id: 'claude-3-5-haiku-20241022' },
            { id: 'claude-opus-4-1-20250805' },
            { id: 'not-a-claude-model' },
          ],
        }),
      };
    }
  );

  assert.deepEqual(models, [
    'claude-sonnet-4-20250514',
    'claude-opus-4-1-20250805',
    'claude-opus-4-20250514',
    'claude-3-5-haiku-20241022',
  ]);
});

test('refreshGeminiModelCatalog keeps generateContent-capable text models only', async () => {
  const models = await refreshGeminiModelCatalog(
    'secret-key',
    async (url: string) => {
      assert.equal(
        url,
        'https://generativelanguage.googleapis.com/v1beta/models?key=secret-key&pageSize=200'
      );

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({
          models: [
            {
              name: 'models/gemini-2.5-pro',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-2.5-flash',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-2.5-flash-lite',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-2.5-pro-preview-tts',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-live-2.5-flash-preview',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/embedding-001',
              supportedGenerationMethods: ['embedContent'],
            },
            {
              name: 'models/gemini-2.0-flash',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        }),
      };
    }
  );

  assert.deepEqual(models, [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
  ]);
});

test('resolveDirectProviderModelState keeps fallbacks when live refresh fails or returns empty', () => {
  const fallbackState = resolveDirectProviderModelState({
    providerId: 'openai',
    currentModel: '',
    liveModels: [],
  });

  assert.deepEqual(
    fallbackState.availableModels.slice(0, 3),
    ['gpt-5-mini', 'gpt-5', 'gpt-5-nano']
  );
  assert.equal(fallbackState.currentModel, 'gpt-5-mini');

  const preservedState = resolveDirectProviderModelState({
    providerId: 'openai',
    currentModel: 'gpt-4.1-mini',
    liveModels: ['gpt-5', 'gpt-4.1-mini'],
  });

  assert.deepEqual(preservedState.availableModels, ['gpt-5', 'gpt-4.1-mini']);
  assert.equal(preservedState.currentModel, 'gpt-4.1-mini');
});
