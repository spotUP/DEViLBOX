/**
 * The "dev server is down" banner appeared while the server was up: under a
 * load average of 100+ one check took longer than its 3 s timeout, and a
 * timeout counted as down. Only a failed connection means down now.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDevServerStatus } from '../useDevServerStatus';

describe('dev server status', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('a slow answer (timed-out check) does not report the server down', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_u: string, init: { signal: AbortSignal }) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })));
    const { result } = renderHook(() => useDevServerStatus(5000));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(result.current).toBe(false);
  });

  it('a refused connection still reports the server down', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const { result } = renderHook(() => useDevServerStatus(5000));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current).toBe(true);
  });
});
