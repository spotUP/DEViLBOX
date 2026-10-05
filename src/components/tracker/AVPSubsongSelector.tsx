/**
 * AVPSubsongSelector — subsong dropdown for ActivisionPro (.avp) files
 * that contain multiple subsongs.
 */

import React from 'react';
import { useFormatStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { Music2 } from 'lucide-react';
import { switchSubsong } from '@/lib/tracker/subsongSwitch';
import { CustomSelect } from '@components/common/CustomSelect';

export const AVPSubsongSelector: React.FC = React.memo(() => {
  const { subsongCount, currentSubsong } = useFormatStore(
    useShallow((state) => ({
      subsongCount: state.activisionProSubsongCount,
      currentSubsong: state.activisionProCurrentSubsong,
    }))
  );

  // The one subsong switch (lib/tracker/subsongSwitch), shared with the FT2 toolbar.
  const handleSubsongChange = (newIdx: number) => { void switchSubsong(newIdx); };

  if (subsongCount <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-dark-border">
      <Music2 size={14} className="shrink-0 text-accent-primary" />
      <span className="text-[10px] text-text-secondary font-medium">SUBSONG:</span>
      <CustomSelect
        value={String(currentSubsong)}
        onChange={(v) => handleSubsongChange(Number(v))}
        options={Array.from({ length: subsongCount }, (_, i) => ({
          value: String(i),
          label: `${i + 1}. Subsong ${i + 1}`,
        }))}
        className="px-2 py-1 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer"
        title="Select subsong"
      />
      <span className="text-[10px] text-text-muted">
        ({currentSubsong + 1}/{subsongCount})
      </span>
    </div>
  );
});

AVPSubsongSelector.displayName = 'AVPSubsongSelector';
