import type { OllamaRemoteMode } from '../types';
import { normalizeOllamaEndpoint } from './ollamaModels';

const DEFAULT_REMOTE_MODE_TRACKER_LIMIT = 5;
const LATENCY_WINDOW_SIZE = 3;
const LATENCY_WARNING_THRESHOLD_MS = 1500;
const LATENCY_WARNING_COUNT = 2;
const FAILURE_THRESHOLD = 2;
const TRACKER_MIN_LIMIT = 0;

export type OllamaRemoteModeReason =
  | 'forced-on'
  | 'forced-off'
  | 'endpoint'
  | 'latency'
  | 'failure'
  | 'local'
  | 'invalid-endpoint';

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

type OllamaEndpointKind = 'invalid' | 'local' | 'remote';

export function normalizeOllamaRemoteMode(value: unknown): OllamaRemoteMode {
  return value === 'forced-on' || value === 'forced-off' || value === 'auto'
    ? value
    : 'auto';
}

function isLoopbackIpv4Address(hostname: string): boolean {
  return (
    hostname === 'localhost'
    || hostname === '0.0.0.0'
    || hostname === '127.0.0.1'
    || /^127\./.test(hostname)
  );
}

function isLoopbackIpv6Address(hostname: string): boolean {
  if (hostname === '::1') {
    return true;
  }

  if (!hostname.startsWith('::ffff:')) {
    return false;
  }

  const mapped = hostname.slice('::ffff:'.length);
  if (mapped.startsWith('[') && mapped.endsWith(']')) {
    return false;
  }

  if (mapped.includes('.')) {
    return isLoopbackIpv4Address(mapped);
  }

  return mapped === '7f00:1' || mapped === '7f00:0001';
}

function getOllamaEndpointKind(endpoint: string): OllamaEndpointKind {
  try {
    const url = new URL(normalizeOllamaEndpoint(endpoint));
    const rawHostname = url.hostname.toLowerCase();
    const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']')
      ? rawHostname.slice(1, -1)
      : rawHostname;
    return isLoopbackIpv4Address(hostname) || isLoopbackIpv6Address(hostname)
      ? 'local'
      : 'remote';
  } catch {
    return 'invalid';
  }
}

export function isLocalOllamaEndpoint(endpoint: string): boolean {
  return getOllamaEndpointKind(endpoint) === 'local';
}

function hasRepeatedSlowResponses(durations: number[]): boolean {
  return (
    durations
      .slice(-LATENCY_WINDOW_SIZE)
      .filter((duration) => duration >= LATENCY_WARNING_THRESHOLD_MS).length
    >= LATENCY_WARNING_COUNT
  );
}

function normalizeTrackerLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return TRACKER_MIN_LIMIT;
  }

  if (limit < TRACKER_MIN_LIMIT) {
    return TRACKER_MIN_LIMIT;
  }

  return Math.floor(limit);
}

export function resolveOllamaRemoteMode(
  input: ResolveOllamaRemoteModeInput
): ResolvedOllamaRemoteMode {
  const setting = normalizeOllamaRemoteMode(input.setting);
  const endpointKind = getOllamaEndpointKind(input.endpoint);

  if (setting === 'forced-on') {
    return { enabled: true, reason: 'forced-on' };
  }

  if (setting === 'forced-off') {
    return { enabled: false, reason: 'forced-off' };
  }

  if (endpointKind === 'invalid') {
    return { enabled: false, reason: 'invalid-endpoint' };
  }

  if (endpointKind === 'remote') {
    return { enabled: true, reason: 'endpoint' };
  }

  if (hasRepeatedSlowResponses(input.recentDurationsMs)) {
    return { enabled: true, reason: 'latency' };
  }

  if (input.recentFailureCount >= FAILURE_THRESHOLD) {
    return { enabled: true, reason: 'failure' };
  }

  return { enabled: false, reason: 'local' };
}

export function createOllamaRemoteModeTracker(limit = DEFAULT_REMOTE_MODE_TRACKER_LIMIT): {
  recordSuccess(durationMs: number): void;
  recordFailure(): void;
  snapshot(): { recentDurationsMs: number[]; recentFailureCount: number };
} {
  const recentDurationsMs: number[] = [];
  const normalizedLimit = normalizeTrackerLimit(limit);
  let recentFailureCount = 0;

  return {
    recordSuccess(durationMs: number): void {
      recentDurationsMs.push(durationMs);
      while (recentDurationsMs.length > normalizedLimit) {
        recentDurationsMs.shift();
      }
      recentFailureCount = Math.max(TRACKER_MIN_LIMIT, recentFailureCount - 1);
    },
    recordFailure(): void {
      recentFailureCount = Math.min(normalizedLimit, recentFailureCount + 1);
    },
    snapshot() {
      return {
        recentDurationsMs: [...recentDurationsMs],
        recentFailureCount,
      };
    },
  };
}
