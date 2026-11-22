import { useFormatStore } from '@stores';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';
import { liveFurnaceModule } from '../liveFurModule';
import { furnaceToHusic, husicSystemsSupported, PCE_SYSTEM_ID, type HusicLayout } from './husicSong';

export function pceRomExportAvailable(chipIds: readonly number[] | undefined): boolean {
  return husicSystemsSupported((chipIds ?? []).map((c) => (c === FurnaceDispatchPlatform.PCE ? PCE_SYSTEM_ID : -1)));
}

/** PC Engine HuCard: the live song as HuSIC song data in the prebuilt driver (same path as tools/pce-rom-check.ts). */
export async function exportPceRom(): Promise<{ rom: Uint8Array; warnings: string[] }> {
  const st = useFormatStore.getState();
  if (!pceRomExportAvailable(st.furnaceNative?.chipIds)) throw new Error('This song is not a PC Engine (HuC6280-only) song.');
  const [player, layout, live] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}pce/player.pce`).then((r) => r.arrayBuffer()),
    fetch(`${import.meta.env.BASE_URL}pce/player.json`).then((r) => r.json() as Promise<HusicLayout>),
    liveFurnaceModule(),
  ]);
  const song = furnaceToHusic(live.module, live.subsong, new Uint8Array(player), layout);
  return { rom: song.rom, warnings: song.lossy.map((l) => `Not carried to HuSIC: ${l}`) };
}
