import { describe, it, expect, beforeEach } from 'vitest';
import { useDubStore } from '../useDubStore';
import { resetStore } from './_harness';

describe('useDubStore', () => {
  beforeEach(() => resetStore(useDubStore));

  it('starts disarmed with the strip collapsed', () => {
    const s = useDubStore.getState();
    expect(s.armed).toBe(false);
    expect(s.stripCollapsed).toBe(true);
    expect(s.lastCapturedAt).toBeNull();
  });

  it('setArmed toggles the capture flag', () => {
    useDubStore.getState().setArmed(true);
    expect(useDubStore.getState().armed).toBe(true);
    useDubStore.getState().setArmed(false);
    expect(useDubStore.getState().armed).toBe(false);
  });

  it('setStripCollapsed / toggleStripCollapsed control the strip body', () => {
    useDubStore.getState().setStripCollapsed(false);
    expect(useDubStore.getState().stripCollapsed).toBe(false);
    useDubStore.getState().toggleStripCollapsed();
    expect(useDubStore.getState().stripCollapsed).toBe(true);
  });

  it('markCaptured stamps lastCapturedAt with a monotonically increasing number', () => {
    const before = useDubStore.getState().lastCapturedAt;
    useDubStore.getState().markCaptured();
    const after = useDubStore.getState().lastCapturedAt;
    expect(typeof after).toBe('number');
    expect(after).not.toEqual(before);
  });
});
