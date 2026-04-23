import type { InlineRequestStatus } from '../types';

export function createIdleInlineRequestStatus(): InlineRequestStatus {
  return { kind: 'idle' };
}

export function getInlineRequestStatusMessage(status: InlineRequestStatus): string {
  if (status.message) {
    return status.message;
  }

  switch (status.kind) {
    case 'waiting':
      return status.providerId === 'ollama'
        ? 'Requesting from remote Ollama...'
        : 'Requesting inline suggestion...';
    case 'slow':
      return 'Slow response from model';
    case 'cancelled':
      return 'Request cancelled';
    case 'connection-problem':
      return 'Connection problem';
    case 'idle':
    default:
      return '';
  }
}
