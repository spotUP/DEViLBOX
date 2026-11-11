/**
 * A bridge call that arrives while the boot restore is running must act on the
 * restored song, not on the "Untitled" placeholder the restore replaces
 * (2026-11-11 findings: writes before restore). dispatchBridgeCall holds every
 * call on whenBootRestoreDone(); the restore itself no longer waits for the
 * start dialog, so the hold is short and always ends (apply, nothing stored,
 * or failure all call endBootRestore).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { dispatchBridgeCall } from '../../../bridge/MCPBridge';
import { useTrackerStore } from '@stores/useTrackerStore';
import { beginBootRestore, endBootRestore, resetBootRestoreForTest } from '../bootRestore';

const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };
const noteAt = (): number | undefined => useTrackerStore.getState().patterns[0].channels[0].rows[0].note;

describe('bridge calls wait for the boot restore', () => {
  beforeEach(() => resetBootRestoreForTest());

  it('a write dispatched before the restore lands in the restored song, not the placeholder', async () => {
    beginBootRestore();
    const call = dispatchBridgeCall('set_cell', { channel: 0, row: 0, note: 'C-4' });
    let answered = false;
    void call.then(() => { answered = true; });
    await flush();
    expect(answered).toBe(false);
    expect(noteAt() ?? 0).toBe(0); // placeholder untouched

    // The restore replaces the placeholder song.
    const restored = structuredClone(useTrackerStore.getState().patterns);
    restored[0].name = 'RESTORED';
    useTrackerStore.getState().loadPatterns(restored);
    endBootRestore();

    expect((await call).ok).toBe(true);
    expect(useTrackerStore.getState().patterns[0].name).toBe('RESTORED');
    expect(noteAt()).toBeGreaterThan(0); // the write survived the restore
  });

  it('is not blocked forever: it resolves when boot finds nothing to restore', async () => {
    beginBootRestore();
    const call = dispatchBridgeCall('get_modal_state', {});
    endBootRestore(); // finally(endBootRestore) runs for nothing-to-restore too
    expect((await call).ok).toBe(true);
  });

  it('is not blocked forever: it resolves when the restore fails', async () => {
    beginBootRestore();
    const call = dispatchBridgeCall('get_modal_state', {});
    await Promise.reject(new Error('restore failed')).catch(() => undefined).finally(endBootRestore);
    expect((await call).ok).toBe(true);
  });
});
