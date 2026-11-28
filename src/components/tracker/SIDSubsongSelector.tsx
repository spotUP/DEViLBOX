/**
 * SIDSubsongSelector — SID chip badge, subsong dropdown, and info button.
 * Displayed when a .sid file is loaded. Shows info button for all SID files,
 * subsong dropdown only when there are multiple subsongs.
 */

import React, { useState } from 'react';
import { useFormatStore } from '@stores';
import { Cpu, Info } from 'lucide-react';
import { switchSubsong } from '@/lib/tracker/subsongSwitch';
import { SIDInfoModal } from '@components/dialogs/SIDInfoModal';
import { CustomSelect } from '@components/common/CustomSelect';

export const SIDSubsongSelector: React.FC = React.memo(() => {
  const sidMetadata = useFormatStore((state) => state.sidMetadata);
  const [showInfo, setShowInfo] = useState(false);

  // The one subsong switch (lib/tracker/subsongSwitch), shared with the FT2 toolbar.
  const handleSubsongChange = (newIdx: number) => { void switchSubsong(newIdx); };

  if (!sidMetadata) return null;

  const chipBadge = sidMetadata.chipModel !== 'Unknown' ? sidMetadata.chipModel : 'SID';

  return (
    <>
      <div className="flex items-center gap-1.5 px-2">
        <Cpu size={12} className="text-accent-primary shrink-0" />
        <span className="text-[10px] text-accent-primary/70 font-mono">{chipBadge}</span>
        {sidMetadata.subsongs > 1 && (
          <CustomSelect
            value={String(sidMetadata.currentSubsong)}
            onChange={(v) => handleSubsongChange(Number(v))}
            options={Array.from({ length: sidMetadata.subsongs }, (_, i) => ({
              value: String(i),
              label: `Sub ${i + 1}`,
            }))}
            className="text-[10px] bg-dark-bgSecondary border border-accent-primary/40 rounded px-1.5 py-0.5 text-text-primary min-w-[80px]"
          />
        )}
        <button
          onClick={() => setShowInfo(true)}
          className="p-0.5 text-accent-primary/60 hover:text-accent-primary transition-colors rounded"
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
