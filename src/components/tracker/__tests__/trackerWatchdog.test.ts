import { describe, it, expect } from 'vitest';
import { nextWorkerStartState as next } from '../trackerWatchdog';

/**
 * Reported 2026-11-25 (and 2026-09-21): after a hard reload under load the
 * dialog "Pattern editor failed to start (worker never loaded after 12 s)"
 * appeared for a worker that was only slow to load (Vite cold transform on a
 * busy machine). A clock is not a failure signal while the module loads.
 */
describe('pattern editor worker start', () => {
  it('a worker still loading after any deadline is starting, not failed', () => {
    expect(next('loading', 'deadline')).toBe('loading');
  });

  it('fails on a real signal: error event, messageerror or error reply', () => {
    expect(next('loading', 'error')).toBe('failed');
    expect(next('booted', 'error')).toBe('failed');
  });

  it('a loaded worker whose GL init outlives the grace is a stall', () => {
    expect(next(next('loading', 'booting'), 'deadline')).toBe('failed');
  });

  it('ready ends the start, and nothing later undoes it', () => {
    expect(next('loading', 'ready')).toBe('ready');
    expect(next('booted', 'ready')).toBe('ready');
    expect(next('ready', 'deadline')).toBe('ready');
    expect(next('ready', 'error')).toBe('ready');
    expect(next('failed', 'ready')).toBe('failed');
  });
});
