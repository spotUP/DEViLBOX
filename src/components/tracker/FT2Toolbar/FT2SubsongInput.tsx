/**
 * The subsong in the FT2 toolbar, drawn like its neighbours (Position,
 * Speed, Song Length): an FT2NumericInput, 1-based, through the one subsong
 * switch (lib/tracker/subsongSwitch). Hidden when the song has one subsong.
 */
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFormatStore } from '@stores/useFormatStore';
import { subsongStatus, switchSubsong } from '@/lib/tracker/subsongSwitch';
import { useDebouncedCommit } from '@hooks/useDebouncedCommit';
import { FT2NumericInput } from './FT2NumericInput';

export interface FT2SubsongInputProps { label?: string; className?: string }

/**
 * A switch reopens and rescans the song: step presses only show the number; the switch runs once the user stops.
 * 400 ms was shorter than the gap between deliberate single clicks, so every click rescanned (owner report,
 * 2026-11-13); 1200 ms covers click-by-click stepping and still answers soon after the last click.
 */
export const SUBSONG_SWITCH_SETTLE_MS = 1200;

const commitSubsong = (oneBased: number) => void switchSubsong(oneBased - 1);

export const FT2SubsongInput: React.FC<FT2SubsongInputProps> = React.memo(({ label = 'Subsong', className = '' }) => {
  const status = useFormatStore(useShallow((s) => subsongStatus(s)));
  const [shown, change] = useDebouncedCommit((status?.current ?? 0) + 1, commitSubsong, SUBSONG_SWITCH_SETTLE_MS);
  if (!status || status.count <= 1) return null;
  return (
    <div className={className}>
      <FT2NumericInput
        label={label}
        value={shown}
        onChange={change}
        min={1}
        max={status.count}
        showMax
      />
    </div>
  );
});

FT2SubsongInput.displayName = 'FT2SubsongInput';
