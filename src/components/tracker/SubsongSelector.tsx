/**
 * SubsongSelector - Dropdown for switching between Furnace subsongs.
 * Displayed when a .fur file with multiple subsongs is loaded.
 * Reads pre-converted subsong data from useTrackerStore.furnaceSubsongs.
 */

import React, { useCallback } from 'react';
import { useTrackerStore, useTransportStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { Music2 } from 'lucide-react';
import { notify } from '@stores/useNotificationStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';

export const SubsongSelector: React.FC = React.memo(() => {
  const { loadPatterns, setPatternOrder, furnaceSubsongs, furnaceActiveSubsong, setFurnaceActiveSubsong } = useTrackerStore(
    useShallow((state) => ({
      loadPatterns: state.loadPatterns,
      setPatternOrder: state.setPatternOrder,
      furnaceSubsongs: state.furnaceSubsongs,
      furnaceActiveSubsong: state.furnaceActiveSubsong,
      setFurnaceActiveSubsong: state.setFurnaceActiveSubsong,
    }))
  );

  const { setBPM, setSpeed } = useTransportStore(
    useShallow((state) => ({
      setBPM: state.setBPM,
      setSpeed: state.setSpeed,
    }))
  );

  const handleSubsongChange = useCallback(
    (newIdx: number) => {
      if (!furnaceSubsongs || newIdx === furnaceActiveSubsong) return;
      const sub = furnaceSubsongs[newIdx];
      if (!sub) return;

      loadPatterns(sub.patterns);
      setPatternOrder(sub.songPositions);
      setBPM(sub.initialBPM);
      setSpeed(sub.initialSpeed);
      // Apply Furnace speed alternation — speed2 is subsong-specific
      getTrackerReplayer().setSpeed2(
        sub.speed2 !== undefined && sub.speed2 !== sub.initialSpeed ? sub.speed2 : null
      );
      setFurnaceActiveSubsong(newIdx);
      notify.success(`Switched to: ${sub.name || `Subsong ${newIdx + 1}`}`);
    },
    [furnaceSubsongs, furnaceActiveSubsong, loadPatterns, setPatternOrder, setBPM, setSpeed, setFurnaceActiveSubsong]
  );

  if (!furnaceSubsongs || furnaceSubsongs.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-dark-border">
      <Music2 size={14} className="shrink-0 text-accent-primary" />
      <span className="text-[10px] text-text-secondary font-medium">SUBSONG:</span>
      <select
        value={furnaceActiveSubsong}
        onChange={(e) => handleSubsongChange(Number(e.target.value))}
        className="px-2 py-1 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer outline-none"
        title="Select subsong (Furnace multi-song module)"
      >
        {furnaceSubsongs.map((sub, idx) => (
          <option key={idx} value={idx}>
            {idx + 1}. {sub.name || `Subsong ${idx + 1}`}
          </option>
        ))}
      </select>
      <span className="text-[10px] text-text-muted">
        ({furnaceActiveSubsong + 1}/{furnaceSubsongs.length})
      </span>
    </div>
  );
});

SubsongSelector.displayName = 'SubsongSelector';
