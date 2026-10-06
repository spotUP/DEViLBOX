/**
 * Preparing song after song does not pile a message listener onto the UADE
 * worklet port per song.
 *
 * Owner, 2026-10-06: the app slows down the more songs are loaded.
 * reinitIfNeeded() added a port listener and removed it only when the worklet
 * answered 'ready'; when no reinit was needed it never does.
 */
import { describe, it, expect } from 'vitest';
import { UADEEngine } from '../UADEEngine';

function fakeEngine() {
  const listeners = new Set<unknown>();
  const port = {
    addEventListener: (_t: string, h: unknown) => listeners.add(h),
    removeEventListener: (_t: string, h: unknown) => listeners.delete(h),
    postMessage: () => {},
  };
  const self = { _initPromise: Promise.resolve(), workletNode: { port }, _onInitProgress: null };
  return { self, listeners };
}

describe('UADEEngine.reinitIfNeeded', () => {
  it('leaves no port listener behind when the worklet needed no reinit', async () => {
    const { self, listeners } = fakeEngine();
    for (let i = 0; i < 5; i++) await UADEEngine.prototype.reinitIfNeeded.call(self);
    expect(listeners.size).toBe(0);
  });

  it('resolves and detaches when the worklet answers ready', async () => {
    const { self, listeners } = fakeEngine();
    const p = UADEEngine.prototype.reinitIfNeeded.call(self);
    await Promise.resolve(); await Promise.resolve();
    [...listeners].forEach((h) => (h as (e: unknown) => void)({ data: { type: 'ready' } }));
    await p;
    expect(listeners.size).toBe(0);
  });
});
