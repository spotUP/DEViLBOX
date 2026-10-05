/**
 * The scope view's subsong control for the whole-song engines (game-music-emu,
 * ASAP, SNDH): previous / next and a list of the file's subsongs, named
 * where the file names them. Reads the engine's own report (format store
 * `nativeSubsongs`); hidden for a file with one subsong.
 */
import React from 'react';
import { CustomSelect } from '@components/common/CustomSelect';
import { useFormatStore } from '@stores/useFormatStore';
import { subsongLabel } from '@/lib/tracker/nativeSubsongs';
import { switchSubsong } from '@/lib/tracker/subsongSwitch';
import { SubsongStepButtons } from './SubsongStepButtons';

export const NativeSubsongControl: React.FC = React.memo(() => {
  const subsongs = useFormatStore((s) => s.nativeSubsongs);
  if (!subsongs || subsongs.count <= 1) return null;
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <SubsongStepButtons showCount={false} />
      <CustomSelect
        value={String(subsongs.current)}
        onChange={(v) => void switchSubsong(Number(v))}
        options={Array.from({ length: subsongs.count }, (_, i) => ({ value: String(i), label: subsongLabel(subsongs, i) }))}
        className="px-2 py-0.5 text-[10px] font-mono bg-dark-bgTertiary text-text-primary border border-dark-borderLight rounded"
        title="Select subsong"
      />
      <span className="text-[10px] font-mono text-text-muted">{subsongs.current + 1}/{subsongs.count}</span>
    </div>
  );
});

NativeSubsongControl.displayName = 'NativeSubsongControl';
