/**
 * The subsong in the FT2 toolbar, drawn like its neighbours (Position,
 * Speed, Song Length): an FT2NumericInput, 1-based, through the one subsong
 * switch (lib/tracker/subsongSwitch). Hidden when the song has one subsong.
 */
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFormatStore } from '@stores/useFormatStore';
import { subsongStatus, switchSubsong } from '@/lib/tracker/subsongSwitch';
import { FT2NumericInput } from './FT2NumericInput';

export interface FT2SubsongInputProps { label?: string; className?: string }

export const FT2SubsongInput: React.FC<FT2SubsongInputProps> = React.memo(({ label = 'Subsong', className = '' }) => {
  const status = useFormatStore(useShallow((s) => subsongStatus(s)));
  if (!status || status.count <= 1) return null;
  return (
    <div className={className}>
      <FT2NumericInput
        label={label}
        value={status.current + 1}
        onChange={(v) => void switchSubsong(v - 1)}
        min={1}
        max={status.count}
      />
    </div>
  );
});

FT2SubsongInput.displayName = 'FT2SubsongInput';
