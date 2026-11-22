/**
 * The live Furnace song as a parsed module, for the ROM exports (GB, NES, MD): one source for all three.
 *
 * saveFurFileWasm() writes whatever song the file-ops WASM last loaded; after a project restore or reload that is a blank
 * default, which exported as an empty, silent ROM. A single-chip GB or NES song is therefore written from the editor
 * (liveTrackerSong -> exportFurnaceModule, same writer as the Furnace Module export) and parsed back. Other chip sets
 * still read the WASM module, refused when its chip list differs from the editor's.
 * shortcut: the editor writer holds no wavetables or sample chips, so GB wave and NES DPCM data are not in that module.
 */
import { useFormatStore } from '@stores';
import { FurnaceDispatchPlatform } from '../../engine/furnace-dispatch/platforms';
import { useProjectStore } from '@/stores/useProjectStore';
import { liveTrackerSong } from '@/lib/song/liveSong';
import { parseFurnaceSong, type FurnaceModule } from '../import/formats/FurnaceSongParser';
import { saveFurFileWasm } from '../import/wasm/FurnaceFileOps';
import { furnaceSettingsForExport } from './furnaceSongSettings';
import { exportFurnaceModule, type FurnaceModuleSong } from './FurnaceModuleExporter';

type Chip = NonNullable<FurnaceModuleSong['chip']>;
const CHIPS = new Map<number, Chip>([
  [FurnaceDispatchPlatform.GB, { id: 0x04, channels: 4, synthType: 'FurnaceGB', volMax: () => 15, chipFlags: '', name: 'Game Boy' }],
  [FurnaceDispatchPlatform.NES, { id: 0x06, channels: 5, synthType: 'FurnaceNES', volMax: () => 15, chipFlags: '', name: 'NES (Ricoh 2A03)' }],
]);

export interface LiveFurModule { module: FurnaceModule; subsong: number; warnings: string[] }

export async function liveFurnaceModule(): Promise<LiveFurModule> {
  const st = useFormatStore.getState();
  const live = st.furnaceNative?.chipIds ?? [];
  const chip = live.length === 1 ? CHIPS.get(live[0]) : undefined;
  if (chip) {
    const song = liveTrackerSong();
    const res = exportFurnaceModule({ ...song, chip, ...furnaceSettingsForExport(useProjectStore.getState().metadata) });
    const u8 = res.bytes;
    return { module: await parseFurnaceSong(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer), subsong: 0, warnings: res.warnings };
  }
  const fur = await saveFurFileWasm();
  const module = await parseFurnaceSong(fur instanceof ArrayBuffer ? fur : new Uint8Array(fur).buffer);
  if (module.systems.length !== live.length || module.systems.some((id, i) => id !== live[i])) {
    throw new Error('The Furnace engine holds a different song than the editor (project restored without its .fur). Re-import the .fur file, then export again.');
  }
  return { module, subsong: st.furnaceActiveSubsong, warnings: [] };
}
