import { useAutomationStore } from '@/stores/useAutomationStore';

/**
 * Convert pattern.dubLane.events[] to automation store curves.
 * Called on project load to migrate old dub lane event data (schema ≤21) to the
 * new automation-curve format. After migration, dubLane.events is cleared so the
 * same events are not migrated again on the next save/load cycle.
 *
 * Each DubEvent becomes a curve on (patternId, channelIndex):
 *   - Trigger (no durationRows): spike on/off at row / row+0.05
 *   - Hold (durationRows > 0): value=1 at row, value=0 at row+durationRows
 *   - No channelId (global): channelIndex=-1 sentinel
 */
export function migrateDubLaneEvents(pattern: { id: string; dubLane?: { events: unknown[] } }): void {
  const lane = (pattern as { dubLane?: { events: Array<{
    id: string;
    moveId: string;
    channelId?: number;
    row: number;
    durationRows?: number;
    params: Record<string, number>;
  }> } }).dubLane;
  if (!lane || !lane.events || lane.events.length === 0) return;

  const store = useAutomationStore.getState();

  for (const event of lane.events) {
    if (event.row == null) continue;
    const channelIndex: number = event.channelId ?? -1;
    const param = `dub.${event.moveId}`;

    // Find or create the curve for this pattern / channel / parameter
    const existing = store.getCurvesForPattern(pattern.id, channelIndex).find(c => c.parameter === param);
    let curveId = existing?.id ?? '';
    if (!curveId) {
      curveId = store.addCurve(pattern.id, channelIndex, param);
      if (curveId) store.updateCurve(curveId, { mode: 'steps' });
    }
    if (!curveId) continue;

    store.addPoint(curveId, event.row, 1);
    if (typeof event.durationRows === 'number' && event.durationRows > 0) {
      // Hold: release point at end of hold
      store.addPoint(curveId, event.row + event.durationRows, 0);
    } else {
      // Trigger: near-instant spike — reset to 0 just after fire row
      store.addPoint(curveId, event.row + 0.05, 0);
    }
  }

  lane.events = [];
}
