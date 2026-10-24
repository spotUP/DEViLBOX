/**
 * FurnaceLoadInstrumentButton - the Furnace editor's "Load Instrument" control. Opens the in-app browser at
 * the chip's bundled folder (SYNTH_PATCH_DIRS), From Disk reaches the OS picker; the picked .fui or .dmp is
 * parsed by the instrument store and replaces the Furnace config of the instrument being edited.
 */
import React from 'react';
import type { SynthType } from '@typedefs/instrument';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { PatchLoadButton } from './PatchLoadButton';

export interface FurnaceLoadInstrumentButtonProps {
  synthType: SynthType;
  instrumentId: number;
}

export const FurnaceLoadInstrumentButton: React.FC<FurnaceLoadInstrumentButtonProps> = ({ synthType, instrumentId }) => (
  <PatchLoadButton
    synthType={synthType}
    label="Load Instrument"
    onLoad={(buffer, fileName) => {
      const store = useInstrumentStore.getState();
      if (fileName.toLowerCase().endsWith('.dmp')) store.loadDefleMaskInstrument(buffer, instrumentId);
      else store.loadFurnaceInstrument(buffer, instrumentId);
    }}
  />
);
