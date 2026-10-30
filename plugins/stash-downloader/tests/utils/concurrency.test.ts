import { describe, it, expect } from 'vitest';
import { createConcurrencyLimiter } from '@/utils/concurrency';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('createConcurrencyLimiter', () => {
  it('never runs more than the limit at once and runs everything', async () => {
    const limit = createConcurrencyLimiter(3);
    let running = 0;
    let peak = 0;
    const gates = Array.from({ length: 8 }, () => deferred());
    const done: number[] = [];

    const tasks = gates.map((g, i) =>
      limit(async () => {
        running++;
        peak = Math.max(peak, running);
        await g.promise;
        running--;
        done.push(i);
        return i;
      })
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(running).toBe(3);

    for (const g of gates) {
      g.resolve();
      await Promise.resolve();
    }
    const results = await Promise.all(tasks);

    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
    expect(done).toHaveLength(8);
  });

  it('starts waiting tasks in FIFO order', async () => {
    const limit = createConcurrencyLimiter(1);
    const order: number[] = [];
    const gate = deferred();
    const first = limit(async () => { await gate.promise; order.push(0); });
    const rest = [1, 2, 3].map((n) => limit(async () => { order.push(n); }));
    gate.resolve();
    await Promise.all([first, ...rest]);
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it('propagates rejections without blocking the queue', async () => {
    const limit = createConcurrencyLimiter(1);
    const failing = limit(async () => { throw new Error('boom'); });
    const next = limit(async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
