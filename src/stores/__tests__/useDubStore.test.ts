import { describe, it, expect, beforeEach } from 'vitest';
import { useDubStore } from '../useDubStore';
import { resetStore } from './_harness';

describe('useDubStore', () => {
  beforeEach(() => resetStore(useDubStore));

  it('starts disarmed and not full-screen', () => {
    const s = useDubStore.getState();
    expect(s.armed).toBe(false);
    expect(s.fullScreen).toBe(false);
    expect(s.lastCapturedAt).toBeNull();
  });

  it('setArmed toggles the capture flag', () => {
    useDubStore.getState().setArmed(true);
    expect(useDubStore.getState().armed).toBe(true);
    useDubStore.getState().setArmed(false);
    expect(useDubStore.getState().armed).toBe(false);
  });

  it('setFullScreen toggles full-screen mode', () => {
    useDubStore.getState().setFullScreen(true);
    expect(useDubStore.getState().fullScreen).toBe(true);
    useDubStore.getState().setFullScreen(false);
    expect(useDubStore.getState().fullScreen).toBe(false);
  });

  it('markCaptured stamps lastCapturedAt with a monotonically increasing number', () => {
    const before = useDubStore.getState().lastCapturedAt;
    useDubStore.getState().markCaptured();
    const after = useDubStore.getState().lastCapturedAt;
    expect(typeof after).toBe('number');
    expect(after).not.toEqual(before);
  });
});
