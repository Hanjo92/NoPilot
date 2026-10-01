export interface Cancellation {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

export class CancelledError extends Error {
  constructor() { super('Cancelled. No further actions will run.'); }
}

export function checkCancellation(token: Cancellation): void {
  if (token.isCancellationRequested) { throw new CancelledError(); }
}

/** Stop awaiting providers/dialogs that do not implement cancellation themselves. */
export function cancellable<T>(operation: PromiseLike<T>, token: Cancellation, timeoutMs = 120_000): Promise<T> {
  checkCancellation(token);
  return new Promise<T>((resolve, reject) => {
    const listener = token.onCancellationRequested(() => finish(new CancelledError()));
    const timer = setTimeout(() => finish(new Error('Operation timed out. Start a new request to retry.')), timeoutMs);
    function finish(error?: Error, value?: T) {
      clearTimeout(timer);
      listener.dispose();
      if (error) { reject(error); } else { resolve(value as T); }
    }
    Promise.resolve(operation).then(value => finish(undefined, value), error => finish(error));
    if (token.isCancellationRequested) { finish(new CancelledError()); }
  });
}
