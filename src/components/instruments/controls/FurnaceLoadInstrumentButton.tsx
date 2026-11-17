/**
 * FurnaceLoadInstrumentButton - the Furnace editor's "Load Instrument" control. Opens the in-app browser at
 * the chip's bundled folder (SYNTH_PATCH_DIRS), From Disk reaches the OS picker. A .fui is parsed by the
 * instrument store; every other Furnace instrument format (.dmp .tfi .vgi .opni .y12 .opli .sbi .wopl .bnk
 * .wopn .s3i .eif .ff .gyb .opm .fti .bti) is read by Furnace's own instrumentFromFile (WASM) and arrives as a
 * .fui. The first instrument replaces the one being edited; a bank's others become new instruments.
 */
import React from 'react';
import type { SynthType } from '@typedefs/instrument';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { instrumentsFromFileWasm } from '@lib/import/wasm/FurnaceFileOps';
import { notify } from '@stores/useNotificationStore';
import { PatchLoadButton } from './PatchLoadButton';

export interface FurnaceLoadInstrumentButtonProps {
  synthType: SynthType;
  instrumentId: number;
}

export const FurnaceLoadInstrumentButton: React.FC<FurnaceLoadInstrumentButtonProps> = ({ synthType, instrumentId }) => (
  <PatchLoadButton
    synthType={synthType}
    label="Load Instrument"
    onLoad={async (buffer, fileName) => {
      const store = useInstrumentStore.getState();
      if (fileName.toLowerCase().endsWith('.fui')) { store.loadFurnaceInstrument(buffer, instrumentId); return; }
      try {
        const [first, ...rest] = await instrumentsFromFileWasm(buffer, fileName);
        store.loadFurnaceInstrument(first.fui.slice().buffer, instrumentId);
        rest.forEach((ins) => useInstrumentStore.getState().loadFurnaceInstrument(ins.fui.slice().buffer));
      } catch (e) {
        notify.error(`Could not load ${fileName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }}
  />
);
