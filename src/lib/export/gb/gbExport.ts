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
  const song = furnaceToHuge(m, st.furnaceActiveSubsong);
  return { rom: buildHugeRom(new Uint8Array(player), meta, song.blob), warnings: song.lossy.map((l) => `Not carried to hUGEDriver: ${l}`) };
}
