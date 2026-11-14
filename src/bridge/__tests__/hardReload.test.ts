import { describe, it, expect, vi } from 'vitest';
import { scheduleHardReload } from '../hardReload';
import { resolveTransportRow } from '@/lib/dub/transportRow';

describe('hard_reload', () => {
  it('replies first, reloads after the delay, and flags the unload prompt off', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const win = { location: { reload }, setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) };
    const r = scheduleHardReload(win);
    expect(r.ok).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    expect((win as { __devilboxHardReload?: boolean }).__devilboxHardReload).toBe(true);
    vi.advanceTimersByTime(150);
    expect(reload).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('playback global row', () => {
  it('adds the live row to the pattern-start row', () => {
    expect(resolveTransportRow(128, 17)).toBe(145);
  });
});
