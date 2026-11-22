import { useFormatStore } from '@stores';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';
import { liveFurnaceModule } from '../liveFurModule';
import { furnaceToMds, mdsSystemsSupported } from './mdsSong';
import { buildMdRom } from './mdRom';

// chipIds hold dispatch platform values; map back to the file ids the converter checks (same predicate as furnaceToMds).
const ENUM_TO_FILE_ID = new Map<number, number>([
  [FurnaceDispatchPlatform.GENESIS, 0x02],
  [FurnaceDispatchPlatform.YM2612, 0x83],
  [FurnaceDispatchPlatform.GENESIS_EXT, 0x42],
  [FurnaceDispatchPlatform.YM2612_EXT, 0xa0],
  [FurnaceDispatchPlatform.SMS, 0x03],
]);

export function mdRomExportAvailable(chipIds: readonly number[] | undefined): boolean {
  const sys = (chipIds ?? []).map((c) => ENUM_TO_FILE_ID.get(c) ?? -1);
  return mdsSystemsSupported(sys);
}

/** Mega Drive ROM: the live song as an MDSDRV sequence in the prebuilt player (same path as tools/md-rom-check.ts). */
export async function exportMdRom(): Promise<{ rom: Uint8Array; warnings: string[] }> {
  const st = useFormatStore.getState();
  if (!mdRomExportAvailable(st.furnaceNative?.chipIds)) throw new Error('This song has no Mega Drive (YM2612 + SN76489) channels.');
  const [player, live] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}md/player.bin`).then((r) => r.arrayBuffer()),
    liveFurnaceModule(),
  ]);
  const song = furnaceToMds(live.module, live.subsong);
  return { rom: buildMdRom(new Uint8Array(player), song.seq, song.pcm), warnings: song.lossy.map((l) => `Not carried to MDSDRV: ${l}`) };
}
