import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeTextEditScheduler } from './node-text-edit-scheduler';

describe('NodeTextEditScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('commits continuous input once after the user pauses', () => {
    const scheduler = new NodeTextEditScheduler();
    const commits: string[] = [];

    scheduler.schedule(() => commits.push('c1'));
    vi.advanceTimersByTime(200);
    scheduler.schedule(() => commits.push('c2'));
    vi.advanceTimersByTime(349);
    expect(commits).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(commits).toEqual(['c2']);
  });

  it('cancels a pending commit when the node editor leaves the current context', () => {
    const scheduler = new NodeTextEditScheduler();
    const commit = vi.fn();

    scheduler.schedule(commit);
    scheduler.cancel();
    vi.advanceTimersByTime(500);

    expect(commit).not.toHaveBeenCalled();
  });

  it('flushes the last edit before a context switch', () => {
    const scheduler = new NodeTextEditScheduler();
    const commit = vi.fn();

    scheduler.schedule(commit);
    scheduler.flush();
    vi.advanceTimersByTime(500);

    expect(commit).toHaveBeenCalledOnce();
  });
});
