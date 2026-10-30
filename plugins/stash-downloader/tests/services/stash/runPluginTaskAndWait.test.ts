import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StashGraphQLService } from '@/services/stash/StashGraphQLService';

type JobStatus = 'READY' | 'RUNNING' | 'FINISHED' | 'FAILED' | 'CANCELLED' | 'STOPPING';
type FindJobResult = Awaited<ReturnType<StashGraphQLService['findJob']>>;

const MIN = 60 * 1000;

function job(status: JobStatus): FindJobResult {
  return { id: 'job-1', status, description: 'Download Video' };
}

describe('StashGraphQLService.runPluginTaskAndWait (stall mode)', () => {
  let service: StashGraphQLService;
  let findJobImpl: () => FindJobResult;
  let stopJob: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new StashGraphQLService();
    vi.spyOn(service, 'runPluginTask').mockResolvedValue('job-1');
    vi.spyOn(service, 'findJob').mockImplementation(async () => findJobImpl());
    stopJob = vi.fn().mockResolvedValue(true);
    vi.spyOn(service, 'stopJob').mockImplementation(stopJob);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function start(getLastActivityAt: () => number) {
    return service.runPluginTaskAndWait('plugin', 'Download Video', {}, {
      pollIntervalMs: 1000,
      stallTimeoutMs: 5 * MIN,
      maxWaitMs: 6 * 60 * MIN,
      getLastActivityAt,
    });
  }

  it('does not stop a healthy download that runs past 10 minutes', async () => {
    findJobImpl = () => job('RUNNING');
    // Progress every poll
    const promise = start(() => Date.now());

    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(stopJob).not.toHaveBeenCalled();

    findJobImpl = () => job('FINISHED');
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toEqual({ success: true, jobId: 'job-1' });
    expect(stopJob).not.toHaveBeenCalled();
  });

  it('stops the job after no activity for longer than the stall timeout', async () => {
    findJobImpl = () => job('RUNNING');
    const activityAt = Date.now();
    const promise = start(() => activityAt);

    await vi.advanceTimersByTimeAsync(4 * MIN);
    expect(stopJob).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2 * MIN);
    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/stalled/);
    expect(stopJob).toHaveBeenCalledWith('job-1');
  });

  it('does not count time spent READY (queued) toward the stall timeout', async () => {
    findJobImpl = () => job('READY');
    const activityAt = Date.now();
    const promise = start(() => activityAt);

    // Queued behind another job for 30 minutes with no activity
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(stopJob).not.toHaveBeenCalled();

    // Starts running: stall clock starts now, not at task start
    findJobImpl = () => job('RUNNING');
    await vi.advanceTimersByTimeAsync(4 * MIN);
    expect(stopJob).not.toHaveBeenCalled();

    findJobImpl = () => job('FINISHED');
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toEqual({ success: true, jobId: 'job-1' });
  });

  it('tolerates transient findJob request failures', async () => {
    let calls = 0;
    findJobImpl = () => {
      calls++;
      // Three failed requests in a row, then the job finishes
      if (calls <= 3) return undefined;
      return job('FINISHED');
    };
    const promise = start(() => Date.now());

    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toEqual({ success: true, jobId: 'job-1' });
    expect(stopJob).not.toHaveBeenCalled();
  });

  it('gives up without stopping the job after repeated request failures', async () => {
    findJobImpl = () => undefined;
    const promise = start(() => Date.now());

    await vi.advanceTimersByTimeAsync(10000);
    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Lost connection/);
    expect(stopJob).not.toHaveBeenCalled();
  });

  it('keeps the wall-clock timeout when stall mode is not enabled', async () => {
    findJobImpl = () => job('RUNNING');
    const promise = service.runPluginTaskAndWait('plugin', 'Extract Metadata', {}, {
      pollIntervalMs: 500,
      maxWaitMs: 60000,
    });

    await vi.advanceTimersByTimeAsync(61000);
    const result = await promise;
    expect(result).toEqual({ success: false, error: 'Job timed out', jobId: 'job-1' });
    expect(stopJob).toHaveBeenCalledWith('job-1');
  });
});
