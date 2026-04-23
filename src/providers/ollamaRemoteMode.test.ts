import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOllamaRemoteModeTracker,
  isLocalOllamaEndpoint,
  normalizeOllamaRemoteMode,
  resolveOllamaRemoteMode,
} from './ollamaRemoteMode';

test('normalizeOllamaRemoteMode accepts only supported values', () => {
  assert.equal(normalizeOllamaRemoteMode('auto'), 'auto');
  assert.equal(normalizeOllamaRemoteMode('forced-on'), 'forced-on');
  assert.equal(normalizeOllamaRemoteMode('forced-off'), 'forced-off');
  assert.equal(normalizeOllamaRemoteMode('unexpected'), 'auto');
  assert.equal(normalizeOllamaRemoteMode(undefined), 'auto');
});

test('isLocalOllamaEndpoint detects local endpoints', () => {
  assert.equal(isLocalOllamaEndpoint('http://localhost:11434'), true);
  assert.equal(isLocalOllamaEndpoint('0.0.0.0:11434'), true);
  assert.equal(isLocalOllamaEndpoint('http://127.0.0.2:11434'), true);
  assert.equal(isLocalOllamaEndpoint('127.1:11434'), true);
  assert.equal(isLocalOllamaEndpoint('http://[::ffff:127.0.0.1]:11434'), true);
  assert.equal(isLocalOllamaEndpoint('127.0.0.1:11434'), true);
  assert.equal(isLocalOllamaEndpoint('http://[::1]:11434'), true);
  assert.equal(isLocalOllamaEndpoint('http://192.168.0.10:11434'), false);
  assert.equal(isLocalOllamaEndpoint('https://ollama.example.com'), false);
});

test('resolveOllamaRemoteMode respects forced overrides before heuristics', () => {
  assert.deepEqual(resolveOllamaRemoteMode({
    setting: 'forced-on',
    endpoint: 'http://localhost:11434',
    recentDurationsMs: [],
    recentFailureCount: 0,
  }), { enabled: true, reason: 'forced-on' });

  assert.deepEqual(resolveOllamaRemoteMode({
    setting: 'forced-off',
    endpoint: 'http://192.168.0.10:11434',
    recentDurationsMs: [2500, 2600],
    recentFailureCount: 2,
  }), { enabled: false, reason: 'forced-off' });
});

test('resolveOllamaRemoteMode detects remote endpoint and slow local behavior', () => {
  assert.deepEqual(resolveOllamaRemoteMode({
    setting: 'auto',
    endpoint: 'http://192.168.0.10:11434',
    recentDurationsMs: [],
    recentFailureCount: 0,
  }), { enabled: true, reason: 'endpoint' });

  assert.deepEqual(resolveOllamaRemoteMode({
    setting: 'auto',
    endpoint: 'http://localhost:11434',
    recentDurationsMs: [1600, 1800],
    recentFailureCount: 0,
  }), { enabled: true, reason: 'latency' });

  assert.deepEqual(resolveOllamaRemoteMode({
    setting: 'auto',
    endpoint: 'http://localhost:11434',
    recentDurationsMs: [200],
    recentFailureCount: 0,
  }), { enabled: false, reason: 'local' });

  assert.deepEqual(resolveOllamaRemoteMode({
    setting: 'auto',
    endpoint: 'not a valid endpoint',
    recentDurationsMs: [2000, 2100],
    recentFailureCount: 4,
  }), { enabled: false, reason: 'invalid-endpoint' });
});

test('createOllamaRemoteModeTracker keeps rolling latency and failure signals', () => {
  const tracker = createOllamaRemoteModeTracker(3);

  tracker.recordSuccess(100);
  tracker.recordSuccess(1700);
  tracker.recordSuccess(1800);
  tracker.recordSuccess(1900);
  tracker.recordFailure();

  assert.deepEqual(tracker.snapshot(), {
    recentDurationsMs: [1700, 1800, 1900],
    recentFailureCount: 1,
  });
});

test('createOllamaRemoteModeTracker normalizes non-positive limits', () => {
  const tracker = createOllamaRemoteModeTracker(-1);

  tracker.recordSuccess(1000);
  tracker.recordSuccess(2000);
  tracker.recordFailure();
  tracker.recordFailure();

  assert.deepEqual(tracker.snapshot(), {
    recentDurationsMs: [],
    recentFailureCount: 0,
  });
});
