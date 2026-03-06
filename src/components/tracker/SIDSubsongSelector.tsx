/**
 * SIDSubsongSelector — SID chip badge, subsong dropdown, and info button.
 * Displayed when a .sid file is loaded. Shows info button for all SID files,
 * subsong dropdown only when there are multiple subsongs.
 */

import React, { useCallback, useState } from 'react';
import { useFormatStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { Cpu, Info } from 'lucide-react';
import { notify } from '@stores/useNotificationStore';
import { SIDInfoModal } from '@components/dialogs/SIDInfoModal';

export const SIDSubsongSelector: React.FC = React.memo(() => {
  const { sidMetadata, setSidMetadata } = useFormatStore(
    useShallow((state) => ({
      sidMetadata: state.sidMetadata,
      setSidMetadata: state.setSidMetadata,
    }))
  );
  const [showInfo, setShowInfo] = useState(false);

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

  if (!sidMetadata) return null;

  const chipBadge = sidMetadata.chipModel !== 'Unknown' ? sidMetadata.chipModel : 'SID';

  return (
    <>
      <div className="flex items-center gap-1.5 px-2">
        <Cpu size={12} className="text-blue-400 shrink-0" />
        <span className="text-[10px] text-blue-300/70 font-mono">{chipBadge}</span>
        {sidMetadata.subsongs > 1 && (
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
        )}
        <button
          onClick={() => setShowInfo(true)}
          className="p-0.5 text-blue-400/60 hover:text-blue-300 transition-colors rounded"
          title="SID file info"
        >
          <Info size={13} />
        </button>
      </div>
      {showInfo && <SIDInfoModal onClose={() => setShowInfo(false)} />}
    </>
  );
});

SIDSubsongSelector.displayName = 'SIDSubsongSelector';
