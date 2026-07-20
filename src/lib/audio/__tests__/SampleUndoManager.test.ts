import { describe, it, expect } from 'vitest';
import {
  SampleUndoManager,
  DEFAULT_UNDO_MAX_BYTES,
  type UndoState,
} from '../SampleUndoManager';

/**
 * Bug: the sample editor hard-freezes the browser and loses all unsaved work
 * when cutting/copy-pasting big chunks of large samples.
 *
 * Root cause: SampleUndoManager capped history by ENTRY COUNT (20) only, never
 * by bytes. Each edit clones the entire AudioBuffer; undo/redo push another full
 * clone onto the opposite stack. For a large sample (tens of MB per snapshot),
 * 20–40 retained clones sum to 1–2.5 GB in the renderer heap → tab OOM-crash →
 * all unsaved project work lost.
 *
 * Fix: byte-budget the retained snapshots (evict oldest until under a heap
 * budget), always keeping at least one undo snapshot.
 *
 * These tests model only what the byte budget needs — a fake "buffer" carrying
 * length + numberOfChannels (the Float32 backing-store size); no real
 * AudioBuffer / Web Audio is required.
 */

// A fake AudioBuffer-shaped object: byte cost = length * channels * 4.
function fakeState(bytes: number, label = 'op'): UndoState {
  const channels = 2;
  const length = Math.round(bytes / (channels * 4));
  return {
    // Only length + numberOfChannels are read by the manager's byte accounting.
    buffer: { length, numberOfChannels: channels } as unknown as AudioBuffer,
    label,
    loopStart: 0,
    loopEnd: 1,
    loopType: 'off',
  };
}

const MB = 1024 * 1024;

describe('SampleUndoManager byte budget (hard-freeze / data-loss fix)', () => {
  it('caps retained snapshots at the byte budget instead of only 20 entries', () => {
    // 64 MB per snapshot, 128 MB budget → at most ~2 fit; without a byte cap the
    // old code would retain all 20 (= 1.28 GB), which is the OOM crash.
    const mgr = new SampleUndoManager(20, 128 * MB);
    for (let i = 0; i < 20; i++) mgr.pushState(fakeState(64 * MB, `edit-${i}`));

    expect(mgr.getRetainedBytes()).toBeLessThanOrEqual(128 * MB);
    // Proves it did NOT keep all 20 full clones.
    expect(mgr.getStackSizes().undo).toBeLessThan(20);
  });

  it('evicts oldest history first (keeps the most recent edits undoable)', () => {
    const mgr = new SampleUndoManager(20, 128 * MB);
    for (let i = 0; i < 20; i++) mgr.pushState(fakeState(64 * MB, `edit-${i}`));

    // The newest edit must survive; the oldest must have been evicted.
    expect(mgr.getUndoLabel()).toBe('edit-19');
  });

  it('always keeps at least one undo snapshot even if it exceeds the budget', () => {
    // A single snapshot bigger than the whole budget must still be undoable —
    // we cannot shrink below one snapshot, but one is bounded (no crash).
    const mgr = new SampleUndoManager(20, 16 * MB);
    mgr.pushState(fakeState(200 * MB, 'huge'));

    expect(mgr.canUndo()).toBe(true);
    expect(mgr.getStackSizes().undo).toBe(1);
  });

  it('keeps redo growth bounded by the same budget', () => {
    // Fill undo, then repeatedly undo — each undo pushes a fresh full clone onto
    // the redo stack. Combined retained bytes must stay within budget.
    const mgr = new SampleUndoManager(20, 128 * MB);
    for (let i = 0; i < 8; i++) mgr.pushState(fakeState(64 * MB, `edit-${i}`));
    for (let i = 0; i < 8; i++) {
      const prev = mgr.undo(fakeState(64 * MB, 'current'));
      if (!prev) break;
    }

    expect(mgr.getRetainedBytes()).toBeLessThanOrEqual(128 * MB);
  });

  it('exposes a sane default heap budget', () => {
    expect(DEFAULT_UNDO_MAX_BYTES).toBe(256 * 1024 * 1024);
    const mgr = new SampleUndoManager();
    // Default budget admits several tens-of-MB snapshots but not unbounded ones.
    for (let i = 0; i < 30; i++) mgr.pushState(fakeState(64 * MB, `edit-${i}`));
    expect(mgr.getRetainedBytes()).toBeLessThanOrEqual(DEFAULT_UNDO_MAX_BYTES);
  });
});
