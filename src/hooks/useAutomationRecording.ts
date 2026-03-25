/**
 * useAutomationRecording - Wires ManualOverrideManager to automation store for knob recording
 *
 * When record mode is active and playback is running, knob movements are captured
 * as automation points at the current playback position.
 */

import { useEffect } from 'react';
import { useAutomationStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { useTrackerStore } from '@stores';
import { getManualOverrideManager } from '@/engine/ManualOverrideManager';

/**
 * Hook that connects ManualOverrideManager's record callback to the automation store.
 * Mount this once at the app level (e.g., in the main tracker component).
 */
export function useAutomationRecording(): void {
  const recordMode = useAutomationStore((s) => s.recordMode);

  useEffect(() => {
    if (!recordMode) {
      // Clear callback when recording is off
      getManualOverrideManager().setRecordCallback(null);
      return;
    }

    // Set callback that fires on every knob override
    getManualOverrideManager().setRecordCallback((parameter: string, value: number) => {
      const transportState = useTransportStore.getState();
      if (!transportState.isPlaying) return;

      const row = transportState.currentRow;
      const patternIndex = transportState.currentPatternIndex;

      // Get current pattern ID
      const { patterns } = useTrackerStore.getState();
      const pattern = patterns[patternIndex];
      if (!pattern) return;

      const patternId = pattern.id;

      // Determine which channel this parameter belongs to
      // For now, record to all channels that have an instrument with this parameter
      // A more targeted approach would require knowing which instrument the knob belongs to
      for (let channelIndex = 0; channelIndex < pattern.channels.length; channelIndex++) {
        const channel = pattern.channels[channelIndex];
        if (channel.instrumentId === null) continue;

        // Record the point
        useAutomationStore.getState().recordPoint(
          patternId,
          channelIndex,
          parameter,
          row,
          value,
        );

        // Only record to the first matching channel (most knob panels control one instrument)
        break;
      }
    });

    return () => {
      getManualOverrideManager().setRecordCallback(null);
    };
  }, [recordMode]);
}
