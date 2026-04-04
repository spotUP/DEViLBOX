/**
 * AutomationCaptureSync — bridges register capture data into the
 * existing useAutomationStore curves so they render as standard
 * per-channel automation lanes in the pattern editor.
 *
 * Call `syncCaptureToStore()` periodically during playback (e.g. in a RAF loop
 * or setInterval). It reads new entries from AutomationCapture and writes them
 * as automation curve points via `recordPoint()`.
 */

import { getAutomationCapture } from './AutomationCapture';
import { useAutomationStore } from '../../stores/useAutomationStore';

/** Track the last synced tick per paramId to avoid re-writing old entries */
const lastSyncedTick = new Map<string, number>();

/**
 * Sync captured register data into the automation store.
 * @param patternId — current pattern ID
 * @param tickToRow — function to convert a tick number to a pattern row
 * @param channelForParam — function to map a paramId to a channel index (or -1 to skip)
 */
export function syncCaptureToStore(
  patternId: string,
  tickToRow: (tick: number) => number,
  channelForParam: (paramId: string) => number,
): void {
  const capture = getAutomationCapture();
  const activeParams = capture.getActiveParams();
  const store = useAutomationStore.getState();

  for (const paramId of activeParams) {
    const lastTick = lastSyncedTick.get(paramId) ?? -1;
    const entries = capture.getAll(paramId);

    for (const entry of entries) {
      if (entry.tick <= lastTick) continue;

      const row = tickToRow(entry.tick);
      const channelIndex = channelForParam(paramId);
      if (channelIndex < 0) continue;

      store.recordPoint(patternId, channelIndex, paramId, row, entry.value);
      lastSyncedTick.set(paramId, entry.tick);
    }
  }
}

/** Reset sync state (call on song load) */
export function resetCaptureSync(): void {
  lastSyncedTick.clear();
}
