import type * as vscode from 'vscode';
import type { ProviderId, ProviderUsageSnapshot } from '../types';

const USAGE_STORAGE_KEY = 'nopilot.providerUsage';

const PROVIDER_IDS: ProviderId[] = [
  'vscode-lm',
  'anthropic',
  'openai',
  'gemini',
  'ollama',
];

function createEmptyCounts(): Record<ProviderId, number> {
  return {
    'vscode-lm': 0,
    anthropic: 0,
    openai: 0,
    gemini: 0,
    ollama: 0,
  };
}

function normalizeStoredCounts(
  value: unknown
): Record<ProviderId, number> {
  const counts = createEmptyCounts();

  if (!value || typeof value !== 'object') {
    return counts;
  }

  for (const providerId of PROVIDER_IDS) {
    const nextValue = (value as Record<string, unknown>)[providerId];
    counts[providerId] =
      typeof nextValue === 'number' && Number.isFinite(nextValue) && nextValue > 0
        ? Math.floor(nextValue)
        : 0;
  }

  return counts;
}

function createSnapshot(
  providerCounts: Record<ProviderId, number>
): ProviderUsageSnapshot {
  let totalRequests = 0;
  let mostUsedProviderId: ProviderId | undefined;
  let mostUsedCount = 0;

  for (const providerId of PROVIDER_IDS) {
    const count = providerCounts[providerId] ?? 0;
    totalRequests += count;

    if (count > mostUsedCount) {
      mostUsedProviderId = providerId;
      mostUsedCount = count;
    }
  }

  return {
    providerCounts,
    totalRequests,
    mostUsedProviderId,
    mostUsedCount,
  };
}

export class UsageTracker implements vscode.Disposable {
  private snapshot: ProviderUsageSnapshot;
  private readonly listeners = new Set<(snapshot: ProviderUsageSnapshot) => void>();
  readonly onDidChangeUsage: vscode.Event<ProviderUsageSnapshot> = (
    listener: (e: ProviderUsageSnapshot) => unknown,
    thisArg?: unknown
  ) => {
    const wrappedListener = (snapshot: ProviderUsageSnapshot) => {
      listener.call(thisArg, snapshot);
    };
    this.listeners.add(wrappedListener);
    return {
      dispose: () => {
        this.listeners.delete(wrappedListener);
      },
    };
  };
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: vscode.Memento) {
    const storedCounts = normalizeStoredCounts(storage.get(USAGE_STORAGE_KEY));
    this.snapshot = createSnapshot(storedCounts);
  }

  recordRequest(providerId: ProviderId): void {
    const nextCounts = {
      ...this.snapshot.providerCounts,
      [providerId]: (this.snapshot.providerCounts[providerId] ?? 0) + 1,
    };

    this.snapshot = createSnapshot(nextCounts);
    const emittedSnapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(emittedSnapshot);
    }

    const countsToPersist = { ...nextCounts };
    this.persistQueue = this.persistQueue
      .then(() => this.storage.update(USAGE_STORAGE_KEY, countsToPersist))
      .catch(() => undefined);
  }

  getSnapshot(): ProviderUsageSnapshot {
    return {
      ...this.snapshot,
      providerCounts: { ...this.snapshot.providerCounts },
    };
  }

  getCount(providerId: ProviderId): number {
    return this.snapshot.providerCounts[providerId] ?? 0;
  }

  async flush(): Promise<void> {
    await this.persistQueue;
  }

  dispose(): void {
    this.listeners.clear();
  }
}
