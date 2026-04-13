import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchAvailableCompletionModels,
  normalizeOllamaEndpoint,
  readOllamaErrorMessage,
} from './ollamaModels';

test('normalizeOllamaEndpoint prefixes http when the scheme is omitted', () => {
  assert.equal(
    normalizeOllamaEndpoint('100.94.92.118:11434'),
    'http://100.94.92.118:11434'
  );
});

test('fetchAvailableCompletionModels filters obvious embedding model names without extra lookups', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  const models = await fetchAvailableCompletionModels(
    'http://localhost:11434',
    async (url, init) => {
      requests.push({ url, init });

      if (url.endsWith('/api/tags')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => JSON.stringify({
            models: [
              { name: 'qwen2.5-coder:7b' },
              { name: 'nomic-embed-text:latest' },
            ],
          }),
        };
      }

      const body = JSON.parse(String(init?.body)) as { model: string };
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({
          capabilities:
            body.model === 'qwen2.5-coder:7b' ? ['completion'] : ['embedding'],
        }),
      };
    }
  );

  assert.deepEqual(models, ['qwen2.5-coder:7b']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, 'http://localhost:11434/api/tags');
});

test('fetchAvailableCompletionModels accepts endpoints without a scheme', async () => {
  const requests: string[] = [];

  await fetchAvailableCompletionModels(
    '100.94.92.118:11434',
    async (url) => {
      requests.push(url);

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({
          models: [],
        }),
      };
    }
  );

  assert.deepEqual(requests, ['http://100.94.92.118:11434/api/tags']);
});

test('fetchAvailableCompletionModels filters known embedding families without extra lookups', async () => {
  const requests: string[] = [];

  const models = await fetchAvailableCompletionModels(
    'http://localhost:11434',
    async (url) => {
      requests.push(url);

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({
          models: [
            {
              name: 'mxbai-embed-large:latest',
              details: { family: 'bert', families: ['bert'] },
            },
            {
              name: 'qwen2.5-coder:14b',
              details: { family: 'qwen2', families: ['qwen2'] },
            },
            {
              name: 'nomic-embed-text:latest',
              details: { family: 'nomic-bert', families: ['nomic-bert'] },
            },
          ],
        }),
      };
    }
  );

  assert.deepEqual(models, ['qwen2.5-coder:14b']);
  assert.deepEqual(requests, ['http://localhost:11434/api/tags']);
});

test('fetchAvailableCompletionModels keeps models when capability lookup is unavailable', async () => {
  const models = await fetchAvailableCompletionModels(
    'http://localhost:11434',
    async (url) => {
      if (url.endsWith('/api/tags')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => JSON.stringify({
            models: [{ name: 'deepseek-coder:6.7b' }],
          }),
        };
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '',
      };
    }
  );

  assert.deepEqual(models, ['deepseek-coder:6.7b']);
});

test('fetchAvailableCompletionModels falls back to capability lookup for ambiguous models', async () => {
  const requests: string[] = [];

  const models = await fetchAvailableCompletionModels(
    'http://localhost:11434',
    async (url, init) => {
      requests.push(url);

      if (url.endsWith('/api/tags')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => JSON.stringify({
            models: [
              { name: 'alpha:latest' },
              { name: 'beta:latest' },
            ],
          }),
        };
      }

      const body = JSON.parse(String(init?.body)) as { model: string };
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({
          capabilities: body.model === 'alpha:latest' ? ['completion'] : ['embedding'],
        }),
      };
    }
  );

  assert.deepEqual(models, ['alpha:latest']);
  assert.deepEqual(requests, [
    'http://localhost:11434/api/tags',
    'http://localhost:11434/api/show',
    'http://localhost:11434/api/show',
  ]);
});

test('readOllamaErrorMessage prefers the API error field', async () => {
  const message = await readOllamaErrorMessage({
    status: 400,
    statusText: 'Bad Request',
    text: async () => JSON.stringify({
      error: 'model "nomic-embed-text:latest" does not support generate',
    }),
  });

  assert.equal(
    message,
    'model "nomic-embed-text:latest" does not support generate'
  );
});
