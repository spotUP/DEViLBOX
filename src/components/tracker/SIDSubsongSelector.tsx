/**
 * SIDSubsongSelector — Dropdown for switching between C64 SID subsongs.
 * Displayed when a .sid file with multiple subsongs is loaded.
 * Calls C64SIDEngine.setSubsong() to switch subsongs during playback.
 */

import React, { useCallback } from 'react';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { Cpu } from 'lucide-react';
import { notify } from '@stores/useNotificationStore';

export const SIDSubsongSelector: React.FC = React.memo(() => {
  const { sidMetadata, setSidMetadata } = useTrackerStore(
    useShallow((state) => ({
      sidMetadata: state.sidMetadata,
      setSidMetadata: state.setSidMetadata,
    }))
  );

  const handleSubsongChange = useCallback(
    async (newIdx: number) => {
      if (!sidMetadata || newIdx === sidMetadata.currentSubsong) return;

      // Access the C64SIDEngine via TrackerReplayer
      try {
        const { getTrackerReplayer } = await import('@engine/TrackerReplayer');
        const engine = getTrackerReplayer().getC64SIDEngine();
        if (engine) {
          engine.setSubsong(newIdx);
          setSidMetadata({ ...sidMetadata, currentSubsong: newIdx });
          notify.success(`SID Subsong ${newIdx + 1}/${sidMetadata.subsongs}`);
        }
      } catch {
        notify.error('Failed to switch SID subsong');
      }
    },
    [sidMetadata, setSidMetadata]
  );

  if (!sidMetadata || sidMetadata.subsongs <= 1) return null;

  const chipBadge = sidMetadata.chipModel !== 'Unknown' ? sidMetadata.chipModel : 'SID';

  return (
    <div className="flex items-center gap-1.5 px-2">
      <Cpu size={12} className="text-blue-400 shrink-0" />
      <span className="text-[10px] text-blue-300/70 font-mono">{chipBadge}</span>
      <select
        value={sidMetadata.currentSubsong}
        onChange={(e) => handleSubsongChange(Number(e.target.value))}
        className="text-[10px] bg-dark-bgSecondary border border-blue-800/40 rounded px-1.5 py-0.5 text-text-primary min-w-[80px]"
      >
        {Array.from({ length: sidMetadata.subsongs }, (_, i) => (
          <option key={i} value={i}>
            Sub {i + 1}{i === sidMetadata.currentSubsong ? ' ●' : ''}
          </option>
        ))}
      </select>
    </div>
  );
});

SIDSubsongSelector.displayName = 'SIDSubsongSelector';
