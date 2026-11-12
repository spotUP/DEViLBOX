/**
 * Derive the sequencer's native song data (`FurnaceNativeData`) from a song composed in the tracker.
 *
 * Pure data conversion, no engine: the song is written as a Furnace module by the existing
 * exporter, read back by the existing parser and turned into native data by the existing
 * builder. The three steps are the ones a real `.fur` import takes, so a composed song reaches
 * the C++ sequencer through the same data shape as an imported one.
 */
import { exportFurnaceModule, type FurnaceModuleSong } from './FurnaceModuleExporter';
import { parseFurnaceSong, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import { collectIns2Uploads, type Ins2Upload } from '@/engine/furnace-dispatch/ins2Uploads';
import type { FurnaceNativeData } from '@/types/tracker';
import { NEO_GEO_SYNTH_TYPE } from './FurnaceModuleExporter';

export interface DerivedFurnaceNative {
  native: FurnaceNativeData;
  /** INS2 blobs by dispatch slot (= native instrument index), as `collectIns2Uploads` returns them. */
  ins2: Ins2Upload[];
  /**
   * Store instrument id of each native instrument index. The file holds only the Neo Geo voices,
   * in song order, so native index + 1 equals the store id only when those ids are 1..n.
   */
  instrumentIds: number[];
  /** Exporter notes: what was left out on purpose. */
  warnings: string[];
}

export async function deriveFurnaceNativeFromSong(song: FurnaceModuleSong): Promise<DerivedFurnaceNative> {
  const { bytes, warnings } = exportFurnaceModule(song);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const module = await parseFurnaceSong(buffer);
  const native = buildFurnaceNativeData(module);
  const ins2 = collectIns2Uploads(module.instruments as unknown as Parameters<typeof collectIns2Uploads>[0]);
  const instrumentIds = song.instruments
    .filter((i) => i.synthType === NEO_GEO_SYNTH_TYPE && i.furnace)
    .map((i) => i.id);
  return { native, ins2, instrumentIds, warnings };
}
