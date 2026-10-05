/**
 * SubsongSelector - Dropdown for switching between Furnace subsongs.
 * Displayed when a .fur file with multiple subsongs is loaded.
 * Reads pre-converted subsong data from useTrackerStore.furnaceSubsongs.
 */

import React from 'react';
import { useFormatStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { Music2 } from 'lucide-react';
import { switchSubsong } from '@/lib/tracker/subsongSwitch';
import { CustomSelect } from '@components/common/CustomSelect';

export const SubsongSelector: React.FC = React.memo(() => {
  const { furnaceSubsongs, furnaceActiveSubsong } = useFormatStore(
    useShallow((state) => ({
      furnaceSubsongs: state.furnaceSubsongs,
      furnaceActiveSubsong: state.furnaceActiveSubsong,
    }))
  );

  // The one subsong switch (lib/tracker/subsongSwitch), shared with the FT2 toolbar.
  const handleSubsongChange = (newIdx: number) => { void switchSubsong(newIdx); };

  if (!furnaceSubsongs || furnaceSubsongs.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-dark-border">
      <Music2 size={14} className="shrink-0 text-accent-primary" />
      <span className="text-[10px] text-text-secondary font-medium">SUBSONG:</span>
      <CustomSelect
        value={String(furnaceActiveSubsong)}
        onChange={(v) => handleSubsongChange(Number(v))}
        options={furnaceSubsongs.map((sub, idx) => ({
          value: String(idx),
          label: `${idx + 1}. ${sub.name || `Subsong ${idx + 1}`}`,
        }))}
        className="px-2 py-1 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer"
        title="Select subsong (Furnace multi-song module)"
      />
      <span className="text-[10px] text-text-muted">
        ({furnaceActiveSubsong + 1}/{furnaceSubsongs.length})
      </span>
    </div>
  );
});

SubsongSelector.displayName = 'SubsongSelector';
