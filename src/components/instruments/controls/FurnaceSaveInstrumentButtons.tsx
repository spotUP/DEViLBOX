/**
 * FurnaceSaveInstrumentButtons - "Save as .fui", "Save as .dmp" and "Save All Instruments" beside Load Instrument.
 * The bytes come from Furnace's own C++ (furnaceInstrumentFile); this component only picks the instruments and
 * hands the files to the browser. Save All writes one zip of .fui files (jszip is already a dependency).
 */
import React from 'react';
import * as FileSaver from 'file-saver';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { notify } from '@stores/useNotificationStore';
import { Button } from '@components/ui/Button';
import { furnaceInstrumentFile } from '@lib/export/furnaceInstrumentFiles';

export interface FurnaceSaveInstrumentButtonsProps {
  instrumentId: number;
}

const fileSafe = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Instrument';

/** Saves one store instrument as Furnace .fui or .dmp; errors go to a toast. */
export async function saveFurnaceInstrumentFile(instrumentId: number, ext: 'fui' | 'dmp'): Promise<void> {
  const inst = useInstrumentStore.getState().instruments.find((i) => i.id === instrumentId);
  if (!inst?.furnace) return;
  try {
    const file = await furnaceInstrumentFile(inst.name, inst.furnace);
    const bytes = ext === 'fui' ? file.fui : file.dmp;
    if (!bytes) { notify.error(`${inst.name} has no .dmp form: Furnace writes .dmp only for instrument types the format can hold`); return; }
    FileSaver.saveAs(new Blob([bytes.slice().buffer]), `${fileSafe(inst.name)}.${ext}`);
  } catch (e) {
    notify.error(`Could not save ${inst.name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export const FurnaceSaveInstrumentButtons: React.FC<FurnaceSaveInstrumentButtonsProps> = ({ instrumentId }) => {
  const saveOne = (ext: 'fui' | 'dmp'): Promise<void> => saveFurnaceInstrumentFile(instrumentId, ext);

  const saveAll = async (): Promise<void> => {
    const all = useInstrumentStore.getState().instruments.filter((i) => i.synthType === 'Furnace' && i.furnace);
    if (all.length === 0) return;
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const used = new Set<string>();
      for (const inst of all) {
        const file = await furnaceInstrumentFile(inst.name, inst.furnace!);
        let base = `${String(inst.id).padStart(2, '0')} ${fileSafe(inst.name)}`;
        while (used.has(base)) base += '_';
        used.add(base);
        zip.file(`${base}.fui`, file.fui);
      }
      FileSaver.saveAs(await zip.generateAsync({ type: 'blob' }), 'furnace-instruments.zip');
    } catch (e) {
      notify.error(`Could not save all instruments: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => void saveOne('fui')}>Save as .fui</Button>
      <Button size="sm" onClick={() => void saveOne('dmp')}>Save as .dmp</Button>
      <Button size="sm" onClick={() => void saveAll()}>Save All Instruments</Button>
    </>
  );
};
