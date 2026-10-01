import { Cancellation } from './cancellation';

export function cancellationSource() {
  let cancelled = false;
  const listeners = new Set<() => void>();
  const token: Cancellation = {
    get isCancellationRequested() { return cancelled; },
    onCancellationRequested(listener) { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; },
  };
  return { token, cancel: () => { cancelled = true; for (const listener of [...listeners]) { listener(); } } };
}
