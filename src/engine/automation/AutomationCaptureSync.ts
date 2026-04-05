/**
 * AutomationCaptureSync — bridges register capture data into the
 * existing useAutomationStore curves so they render as standard
 * per-channel automation lanes in the pattern editor.
 *
 * Called periodically during playback via setInterval in TrackerReplayer.
 */

import { getAutomationCapture } from './AutomationCapture';
import { useAutomationStore } from '../../stores/useAutomationStore';

/** Track the last synced tick per paramId to avoid re-writing old entries */
const lastSyncedTick = new Map<string, number>();

/**
 * Parse a register paramId to extract the channel index.
 * Format: "sid.CHIP.VOICE.param" → voice (0-2, offset by chip*3)
 *         "paula.CH.param" → ch (0-3)
 *         "fur.CH.param" → ch
 *         "ym.CH.param" → ch (0-2)
 */
function channelFromParamId(paramId: string): number {
  const parts = paramId.split('.');
  if (parts[0] === 'sid' && parts.length >= 4) {
    const chip = parseInt(parts[1], 10);
    const voice = parseInt(parts[2], 10);
    if (!isNaN(chip) && !isNaN(voice)) return chip * 3 + voice;
    // Global params (filter, global) → map to voice 0 of that chip
    return chip * 3;
  }
  if (parts[0] === 'paula' && parts.length >= 3) {
    return parseInt(parts[1], 10) || 0;
  }
  if (parts[0] === 'fur' && parts.length >= 3) {
    return parseInt(parts[1], 10) || 0;
  }
  if (parts[0] === 'ym' && parts.length >= 3) {
    return parseInt(parts[1], 10) || 0;
  }
  return 0;
}

/**
 * Sync captured register data into the automation store.
 * @param patternId — current pattern ID
 * @param speed — ticks per row (from song speed)
 * @param firstTick — tick offset for the start of the current pattern
 * @param patternLength — number of rows in the current pattern
 */
export function syncCaptureToStore(
  patternId: string,
  speed: number,
  firstTick: number,
  patternLength: number,
): void {
  const capture = getAutomationCapture();
  const activeParams = capture.getActiveParams();
  if (activeParams.length === 0) return;

  const store = useAutomationStore.getState();
  // Only sync params that the user has activated as lane parameters
  const activeLaneParams = new Set<string>();
  for (const [, lane] of store.channelLanes) {
    if (lane.showLane && lane.activeParameter) activeLaneParams.add(lane.activeParameter);
    if (lane.activeParameters) {
      for (const p of lane.activeParameters) activeLaneParams.add(p);
    }
  }

  for (const paramId of activeParams) {
    // Only sync params the user is viewing
    if (!activeLaneParams.has(paramId)) continue;

    const lastTick = lastSyncedTick.get(paramId) ?? -1;
    const entries = capture.getAll(paramId);
    const channelIndex = channelFromParamId(paramId);

    for (const entry of entries) {
      if (entry.tick <= lastTick) continue;

      // Convert tick to row
      const row = Math.floor((entry.tick - firstTick) / Math.max(1, speed));
      if (row < 0 || row >= patternLength) continue;

      store.recordPoint(patternId, channelIndex, paramId, row, entry.value);
      lastSyncedTick.set(paramId, entry.tick);
    }
  }
}

/** Reset sync state (call on song load or stop) */
export function resetCaptureSync(): void {
  lastSyncedTick.clear();
}
