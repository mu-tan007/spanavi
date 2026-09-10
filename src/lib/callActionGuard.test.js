import { describe, expect, it, vi } from 'vitest';
import { createCallActionGuard } from './callActionGuard';

describe('calling screen action guard', () => {
  it('suppresses a second status while the first save is pending, then allows the next action', async () => {
    const guard = createCallActionGuard();
    let finish;
    const save = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const first = guard.run(save);
    const second = vi.fn();
    await guard.run(second);
    expect(second).not.toHaveBeenCalled();
    finish(); await first;
    await guard.run(second);
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('unlocks after a rejected or synchronously throwing save', async () => {
    const guard = createCallActionGuard();
    await expect(guard.run(() => { throw Error('save'); })).rejects.toThrow('save');
    expect(guard.busy).toBe(false);
    await expect(guard.run(() => Promise.reject(Error('network')))).rejects.toThrow('network');
    expect(await guard.run(() => 'retry')).toBe('retry');
  });
});
