/**
 * PxtoneExporter.ts - write a PxTone song back to .ptcop/.pttune.
 *
 * The event list (song.pxtoneEvents, carrying the grid's edits) goes into the wasm next to the file's
 * woices/units and pxtnService::write serialises it. The output uses the current file layout, so it is
 * semantically equal to the source, not byte-identical (pxtoneWriteRoundTrip.test.ts).
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { getPxtoneWasm, writePxtone } from '@lib/import/formats/PxtoneWasmGrid';

export interface PxtoneExportResult { data: Blob; filename: string; warnings: string[] }

export async function exportPxtone(song: TrackerSong): Promise<PxtoneExportResult> {
  if (!song.pxtoneFileData || !song.pxtoneEvents) throw new Error('PxTone export needs the file the song was loaded from');
  const bytes = writePxtone(await getPxtoneWasm(), song.pxtoneFileData, song.pxtoneEvents);
  const isTune = new TextDecoder().decode(new Uint8Array(song.pxtoneFileData, 0, 6)) === 'PTTUNE';
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
    filename: `${base}.${isTune ? 'pttune' : 'ptcop'}`,
    warnings: [],
  };
}
