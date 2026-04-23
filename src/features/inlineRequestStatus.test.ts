import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIdleInlineRequestStatus,
  getInlineRequestStatusMessage,
} from './inlineRequestStatus';

test('createIdleInlineRequestStatus returns quiet idle state', () => {
  assert.deepEqual(createIdleInlineRequestStatus(), { kind: 'idle' });
});

test('getInlineRequestStatusMessage returns practical remote Ollama copy', () => {
  assert.equal(
    getInlineRequestStatusMessage({
      kind: 'waiting',
      providerId: 'ollama',
      providerName: 'Ollama',
      model: 'qwen2.5-coder:7b',
    }),
    'Requesting from remote Ollama...'
  );

  assert.equal(getInlineRequestStatusMessage({ kind: 'slow' }), 'Slow response from model');
  assert.equal(getInlineRequestStatusMessage({ kind: 'cancelled' }), 'Request cancelled');
  assert.equal(
    getInlineRequestStatusMessage({ kind: 'connection-problem' }),
    'Connection problem'
  );
  assert.equal(getInlineRequestStatusMessage({ kind: 'idle' }), '');
});
