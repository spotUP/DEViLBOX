/**
 * ArrangementAutomationPlayer - Applies timeline automation during arrangement playback
 *
 * Reads TimelineAutomationLane data from the arrangement store and applies
 * interpolated values to synth parameters at each row during playback.
 *
 * Works alongside AutomationPlayer (pattern-level automation):
 * - AutomationPlayer handles per-pattern curves
 * - ArrangementAutomationPlayer handles timeline-level lanes that span patterns
 * - Timeline lanes take precedence over pattern curves when both exist
 */

import { useArrangementStore } from '@stores/useArrangementStore';
import { useTrackerStore } from '@stores';
import { interpolateTimelineAutomation } from '@typedefs/arrangement';
import type { TimelineAutomationLane } from '@typedefs/arrangement';
import { getManualOverrideManager } from './ManualOverrideManager';
import { getToneEngine } from './ToneEngine';
import { isDevilboxSynth } from '@typedefs/synth';

/**
 * Process all arrangement automation lanes at a given global row position.
 * Called from the playback loop when in arrangement mode.
 */
export function processArrangementAutomation(globalRow: number): void {
  const { automationLanes, tracks } = useArrangementStore.getState();

  if (automationLanes.length === 0) return;

  const overrideManager = getManualOverrideManager();
  const engine = getToneEngine();

  for (const lane of automationLanes) {
    if (!lane.enabled || lane.points.length === 0) continue;

    // Interpolate value at this row
    const value = interpolateTimelineAutomation(lane.points, globalRow);
    if (value === null) continue;

    // Check for manual override
    const shortName = lane.parameter.includes('.') ? lane.parameter.split('.').pop()! : lane.parameter;
    if (overrideManager.isOverridden(shortName)) continue;

    // Resolve track → channel → instrument
    const track = tracks.find(t => t.id === lane.trackId);
    if (!track) continue;

    // Track index maps to channel index in the pattern
    const channelIndex = track.index;

    // Get the instrument for this channel
    const { patterns, currentPatternIndex } = useTrackerStore.getState();
    const pattern = patterns[currentPatternIndex];
    if (!pattern || channelIndex >= pattern.channels.length) continue;

    const channel = pattern.channels[channelIndex];
    const instrumentId = channel.instrumentId;
    if (instrumentId === null) continue;

    // Find the synth instance
    let instrument = engine.instruments.get((instrumentId << 16) | (channelIndex & 0xFFFF));
    if (!instrument) {
      instrument = engine.instruments.get((instrumentId << 16) | 0xFFFF);
    }
    if (!instrument) continue;

    // Apply value
    try {
      if (isDevilboxSynth(instrument) && instrument.set) {
        instrument.set(shortName, value);
      } else if (typeof (instrument as unknown as Record<string, unknown>).set === 'function') {
        (instrument as unknown as { set: (p: string, v: number) => void }).set(shortName, value);
      }
    } catch {
      // Silently ignore automation apply errors during playback
    }
  }
}

/**
 * Get all active arrangement automation lanes for a given track.
 * Useful for UI display.
 */
export function getArrangementAutomationForTrack(trackId: string): TimelineAutomationLane[] {
  const { automationLanes } = useArrangementStore.getState();
  return automationLanes.filter(l => l.trackId === trackId && l.enabled);
}

/**
 * Check if arrangement mode has any automation data.
 */
export function hasArrangementAutomation(): boolean {
  const { automationLanes, isArrangementMode } = useArrangementStore.getState();
  return isArrangementMode && automationLanes.some(l => l.enabled && l.points.length > 0);
}
