import { useFormatStore } from '@stores';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';
import { liveFurnaceModule } from '../liveFurModule';
import { banjoSystemsSupported, furnaceToBanjo, type BanjoLayout } from './banjoSong';
import { buildSmsRom } from './smsRom';

export function smsRomExportAvailable(chipIds: readonly number[] | undefined): boolean {
  return banjoSystemsSupported((chipIds ?? []).map((c) => (c === FurnaceDispatchPlatform.SMS ? 0x03 : -1)));
}

/** Master System / Game Gear ROM: the live song as Banjo song data in the prebuilt player (same path as tools/sms-rom-check.ts). */
export async function exportSmsRom(gameGear: boolean): Promise<{ rom: Uint8Array; warnings: string[] }> {
  const st = useFormatStore.getState();
  if (!smsRomExportAvailable(st.furnaceNative?.chipIds)) throw new Error('This song is not a Master System (SN76489-only) song.');
  const [player, layout, live] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}sms/player.sms`).then((r) => r.arrayBuffer()),
    fetch(`${import.meta.env.BASE_URL}sms/player.json`).then((r) => r.json() as Promise<BanjoLayout>),
    liveFurnaceModule(),
  ]);
  const song = furnaceToBanjo(live.module, live.subsong, layout);
  return {
    rom: buildSmsRom(new Uint8Array(player), layout, song, gameGear),
    warnings: song.lossy.map((l) => `Not carried to Banjo: ${l}`),
  };
}
