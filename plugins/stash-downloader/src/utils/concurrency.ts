/**
 * Concurrency helpers
 */

/**
 * Create a limiter that runs at most `maxConcurrent` async tasks at once.
 * Extra tasks wait in FIFO order. A task's rejection is passed to its caller
 * and never blocks the queue.
 */
export function createConcurrencyLimiter(maxConcurrent: number): <T>(task: () => Promise<T>) => Promise<T> {
  const limit = Math.max(1, Math.floor(maxConcurrent));
  let active = 0;
  const waiting: Array<() => void> = [];

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < limit) {
      active++;
    } else {
      // A finishing task hands its slot straight to us, so `active` stays counted
      await new Promise<void>((resolve) => waiting.push(resolve));
    }

    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) {
        next();
      } else {
        active--;
      }
    }
  };
}
