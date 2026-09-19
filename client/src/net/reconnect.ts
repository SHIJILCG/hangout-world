export async function retryReconnect<T>(
  connect: () => Promise<T>,
  signal: AbortSignal,
  attempts = 6,
  delayMs = 500,
  releaseLateResult: (value: T) => void = () => {},
): Promise<T> {
  let lastError: unknown = new Error('Disconnected');
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal.aborted) throw new Error('Reconnection cancelled');
    try {
      return await new Promise<T>((resolve, reject) => {
        let finished = false;
        const finish = () => {
          finished = true;
          clearTimeout(timeout);
          signal.removeEventListener('abort', abort);
        };
        const abort = () => { finish(); reject(new Error('Reconnection cancelled')); };
        const timeout = setTimeout(() => {
          finish();
          reject(new Error('Reconnection attempt timed out'));
        }, 1500);
        signal.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(connect).then((value) => {
          if (finished) { releaseLateResult(value); return; }
          finish();
          resolve(value);
        }, (error: unknown) => {
          if (finished) return;
          finish();
          reject(error);
        });
      });
    }
    catch (error) { lastError = error; }
    if (signal.aborted) throw new Error('Reconnection cancelled');
    if (attempt < attempts - 1) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new Error('Reconnection cancelled'));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort);
          resolve();
        }, delayMs);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not reconnect to the game server');
}
