import type { OllamaRemoteMode } from '../types';
import { normalizeOllamaEndpoint } from './ollamaModels';

export type OllamaRemoteModeReason =
  | 'forced-on'
  | 'forced-off'
  | 'endpoint'
  | 'latency'
  | 'failure'
  | 'local';

export interface ResolvedOllamaRemoteMode {
  enabled: boolean;
  reason: OllamaRemoteModeReason;
}

interface ResolveOllamaRemoteModeInput {
  setting: unknown;
  endpoint: string;
  recentDurationsMs: number[];
  recentFailureCount: number;
}

export function normalizeOllamaRemoteMode(value: unknown): OllamaRemoteMode {
  return value === 'forced-on' || value === 'forced-off' || value === 'auto'
    ? value
    : 'auto';
}

export function isLocalOllamaEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(normalizeOllamaEndpoint(endpoint));
    const hostname = url.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function hasRepeatedSlowResponses(durations: number[]): boolean {
  return durations.slice(-3).filter((duration) => duration >= 1500).length >= 2;
}

export function resolveOllamaRemoteMode(
  input: ResolveOllamaRemoteModeInput
): ResolvedOllamaRemoteMode {
  const setting = normalizeOllamaRemoteMode(input.setting);

  if (setting === 'forced-on') {
    return { enabled: true, reason: 'forced-on' };
  }

  if (setting === 'forced-off') {
    return { enabled: false, reason: 'forced-off' };
  }

  if (!isLocalOllamaEndpoint(input.endpoint)) {
    return { enabled: true, reason: 'endpoint' };
  }

  if (hasRepeatedSlowResponses(input.recentDurationsMs)) {
    return { enabled: true, reason: 'latency' };
  }

  if (input.recentFailureCount >= 2) {
    return { enabled: true, reason: 'failure' };
  }

  return { enabled: false, reason: 'local' };
}

export function createOllamaRemoteModeTracker(limit = 5): {
  recordSuccess(durationMs: number): void;
  recordFailure(): void;
  snapshot(): { recentDurationsMs: number[]; recentFailureCount: number };
} {
  const recentDurationsMs: number[] = [];
  let recentFailureCount = 0;

  return {
    recordSuccess(durationMs: number): void {
      recentDurationsMs.push(durationMs);
      while (recentDurationsMs.length > limit) {
        recentDurationsMs.shift();
      }
      recentFailureCount = Math.max(0, recentFailureCount - 1);
    },
    recordFailure(): void {
      recentFailureCount = Math.min(limit, recentFailureCount + 1);
    },
    snapshot() {
      return {
        recentDurationsMs: [...recentDurationsMs],
        recentFailureCount,
      };
    },
  };
}
