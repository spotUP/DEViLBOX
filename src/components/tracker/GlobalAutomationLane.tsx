/**
 * GlobalAutomationLane — Pattern-level automation row for bus-wide and
 * song-level parameters (dub.echoWet, dub.hpfCutoff, global.bpm,
 * global.masterVolume, etc.). Renders above the channel lanes in the
 * pattern editor.
 *
 * Implementation: thin wrapper around `AutomationLane` with
 * `channelIndex={-1}` as the sentinel. `useChannelAutomationParams(-1)`
 * returns only the global + dub param subset so the picker doesn't
 * confuse users by listing synth-specific params that can't go on a
 * pattern-level lane.
 *
 * Curves created here live in `useAutomationStore.curves[]` with
 * `channelIndex = -1`, round-trip through `.dbx` with the same
 * `automationCurves` field as per-channel curves, and play back via
 * `AutomationPlayer.processPatternRow`'s global-pseudo-channel loop.
 */

import React from 'react';
import { AutomationLane } from './AutomationLane';

interface GlobalAutomationLaneProps {
  patternId: string;
  patternLength: number;
  rowHeight?: number;
  compact?: boolean;
  onAutomationChange?: () => void;
}

export const GlobalAutomationLane: React.FC<GlobalAutomationLaneProps> = ({
  patternId,
  patternLength,
  rowHeight,
  compact,
  onAutomationChange,
}) => {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1 border-b border-accent-highlight/40 bg-accent-highlight/5"
      title="Global lane — bus-wide dub params + song-level BPM / master volume. Curves drawn here affect playback regardless of which channel you're on."
    >
      <span className="flex-shrink-0 text-[9px] font-mono font-bold text-accent-highlight uppercase tracking-wider px-1">
        ⬢ GLOBAL FX
      </span>
      <div className="flex-1 min-w-0">
        <AutomationLane
          patternId={patternId}
          channelIndex={-1}
          patternLength={patternLength}
          rowHeight={rowHeight}
          compact={compact}
          onAutomationChange={onAutomationChange}
        />
      </div>
    </div>
  );
};
