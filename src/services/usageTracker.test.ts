import assert from 'node:assert/strict';
import test from 'node:test';
import { UsageTracker } from './usageTracker';

function createStorage(initialValue?: unknown) {
  const data = new Map<string, unknown>();
  if (initialValue !== undefined) {
    data.set('nopilot.providerUsage', initialValue);
  }

  return {
    data,
    storage: {
      get<T>(key: string): T | undefined {
        return data.get(key) as T | undefined;
      },
      async update(key: string, value: unknown): Promise<void> {
        data.set(key, value);
      },
    },
  };
}

test('UsageTracker restores stored counts and calculates totals', () => {
  const { storage } = createStorage({
    openai: 4,
    ollama: 2,
  });
  const tracker = new UsageTracker(storage as any);

  const snapshot = tracker.getSnapshot();

  assert.equal(snapshot.providerCounts.openai, 4);
  assert.equal(snapshot.providerCounts.ollama, 2);
  assert.equal(snapshot.providerCounts.gemini, 0);
  assert.equal(snapshot.totalRequests, 6);
  assert.equal(snapshot.mostUsedProviderId, 'openai');
  assert.equal(snapshot.mostUsedCount, 4);
});

test('UsageTracker records requests and emits updated snapshots', async () => {
  const { data, storage } = createStorage();
  const tracker = new UsageTracker(storage as any);
  const events = [] as Array<ReturnType<typeof tracker.getSnapshot>>;

  tracker.onDidChangeUsage((snapshot: ReturnType<typeof tracker.getSnapshot>) => {
    events.push(snapshot);
  });

  tracker.recordRequest('anthropic');
  tracker.recordRequest('anthropic');
  tracker.recordRequest('ollama');
  await tracker.flush();

  const snapshot = tracker.getSnapshot();

  assert.equal(snapshot.providerCounts.anthropic, 2);
  assert.equal(snapshot.providerCounts.ollama, 1);
  assert.equal(snapshot.totalRequests, 3);
  assert.equal(snapshot.mostUsedProviderId, 'anthropic');
  assert.equal(snapshot.mostUsedCount, 2);
  assert.equal(events.length, 3);
  assert.deepEqual(data.get('nopilot.providerUsage'), {
    'vscode-lm': 0,
    anthropic: 2,
    openai: 0,
    gemini: 0,
    ollama: 1,
  });
});
