/**
 * useFluidSynthPresetNames - the preset names one bank of the shared
 * FluidSynth host resolves to, read from the loaded SoundFonts.
 *
 * Holds a host reference while mounted and re-reads the bank whenever a
 * SoundFont lands (the GM font stacks on default.sf2 after the editor opens).
 * Returns null until the first answer.
 */

import { useEffect, useState } from 'react';
import { FluidSynthHost } from '@/engine/fluidsynth/FluidSynthHost';

export function useFluidSynthPresetNames(bank: number): string[] | null {
  const [read, setRead] = useState<{ bank: number; names: string[] } | null>(null);

  useEffect(() => {
    const host = FluidSynthHost.acquire();
    let live = true;
    const load = () => { void host.presetNames(bank).then((names) => { if (live) setRead({ bank, names }); }); };
    load();
    const off = host.onMessage((data) => { if (data.type === 'sf2Loaded') load(); });
    return () => {
      live = false;
      off();
      host.release();
    };
  }, [bank]);

  // A bank change shows nothing until that bank's answer, never the old bank's names.
  return read?.bank === bank ? read.names : null;
}
