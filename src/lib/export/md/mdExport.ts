import { useFormatStore } from '@stores';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';
import { saveFurFileWasm } from '../../import/wasm/FurnaceFileOps';
import { parseFurnaceSong } from '../../import/formats/FurnaceSongParser';
import { furnaceToMds } from './mdsSong';
import { buildMdRom } from './mdRom';

export function mdRomExportAvailable(chipIds: readonly number[] | undefined): boolean {
  const ids = chipIds ?? [];
  return ids.includes(FurnaceDispatchPlatform.GENESIS) || ids.includes(FurnaceDispatchPlatform.GENESIS_EXT);
}

/** Mega Drive ROM: the live song as an MDSDRV sequence in the prebuilt player (same path as tools/md-rom-check.ts). */
export async function exportMdRom(): Promise<{ rom: Uint8Array; warnings: string[] }> {
  const st = useFormatStore.getState();
  if (!mdRomExportAvailable(st.furnaceNative?.chipIds)) throw new Error('This song has no Mega Drive (YM2612 + SN76489) channels.');
  const [player, fur] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}md/player.bin`).then((r) => r.arrayBuffer()),
    saveFurFileWasm(),
  ]);
  const m = await parseFurnaceSong(fur instanceof ArrayBuffer ? fur : new Uint8Array(fur).buffer);
  const song = furnaceToMds(m, st.furnaceActiveSubsong);
  return { rom: buildMdRom(new Uint8Array(player), song.seq, song.pcm), warnings: song.lossy.map((l) => `Not carried to MDSDRV: ${l}`) };
}
