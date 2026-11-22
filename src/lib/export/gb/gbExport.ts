import { useFormatStore } from '@stores';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';
import { saveFurFileWasm } from '../../import/wasm/FurnaceFileOps';
import { parseFurnaceSong } from '../../import/formats/FurnaceSongParser';
import { buildHugeRom, furnaceToHuge, type HugePlayerMeta } from './hugeSong';

export function gbRomExportAvailable(chipIds: readonly number[] | undefined): boolean {
  return (chipIds ?? []).includes(FurnaceDispatchPlatform.GB);
}

/** Game Boy cartridge: the live song as hUGEDriver song data in the prebuilt 32 KB player ROM (same path as tools/gb-rom-check.ts). */
export async function exportGbRom(): Promise<{ rom: Uint8Array; warnings: string[] }> {
  const st = useFormatStore.getState();
  if (!gbRomExportAvailable(st.furnaceNative?.chipIds)) throw new Error('This song has no Game Boy channels.');
  const base = import.meta.env.BASE_URL;
  const [player, meta, fur] = await Promise.all([
    fetch(`${base}gb/huge-player.gb`).then((r) => r.arrayBuffer()),
    fetch(`${base}gb/huge-player.json`).then((r) => r.json() as Promise<HugePlayerMeta>),
    saveFurFileWasm(),
  ]);
  const m = await parseFurnaceSong(fur instanceof ArrayBuffer ? fur : new Uint8Array(fur).buffer);
  // saveFurFileWasm writes whatever song the file-ops WASM last loaded; after a project restore or reload that is a blank default,
  // which exported as an empty (silent) cartridge. Refuse it instead.
  const live = st.furnaceNative?.chipIds ?? [];
  if (m.systems.length !== live.length || m.systems.some((id, i) => id !== live[i])) {
    throw new Error('The Furnace engine holds a different song than the editor (project restored without its .fur). Re-import the .fur file, then export again.');
  }
  const song = furnaceToHuge(m, st.furnaceActiveSubsong);
  return { rom: buildHugeRom(new Uint8Array(player), meta, song.blob), warnings: song.lossy.map((l) => `Not carried to hUGEDriver: ${l}`) };
}
