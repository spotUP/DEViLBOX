import { useFormatStore } from '@stores';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';
import { writeGoatTrackerSng } from '../../import/formats/GoatTrackerSid';
import { liveFurnaceModule } from '../liveFurModule';
import { buildC64Prg } from './c64Prg';
import { furnaceToGoatTracker } from './goatSong';

/** One SID chip and nothing else: the GT2 playroutine drives one 6581/8580. */
export function c64PrgExportAvailable(chipIds: readonly number[] | undefined): boolean {
  const ids = chipIds ?? [];
  return ids.length === 1 && (ids[0] === FurnaceDispatchPlatform.C64_6581 || ids[0] === FurnaceDispatchPlatform.C64_8580);
}

interface GTModule {
  cwrap: (n: string, r: string | null, a: string[]) => (...a: number[]) => number;
  _malloc: (n: number) => number;
  _free: (p: number) => void;
  HEAPU8: Uint8Array;
}

/** Commodore 64 program: the live song as GoatTracker 2 song data, relocated by GTUltra's packer (same path as tools/c64-rom-save.ts). */
export async function exportC64Prg(): Promise<{ prg: Uint8Array; warnings: string[] }> {
  const st = useFormatStore.getState();
  if (!c64PrgExportAvailable(st.furnaceNative?.chipIds)) throw new Error('This song is not a single-SID (Commodore 64) song.');
  const base = import.meta.env.BASE_URL || '/';
  const [jsText, wasmBinary, live] = await Promise.all([
    fetch(`${base}gtultra/GTUltra.js`).then((r) => r.text()),
    fetch(`${base}gtultra/GTUltra.wasm`).then((r) => r.arrayBuffer()),
    liveFurnaceModule(),
  ]);
  const g = furnaceToGoatTracker(live.module, live.subsong);
  const sng = writeGoatTrackerSng(g.song, g.settings);
  const factory = new Function(`${jsText}; return createGTUltra;`)() as (o: object) => Promise<GTModule>;
  const w = await factory({ wasmBinary, print: () => {}, printErr: () => {} });
  w.cwrap('gt_init', null, ['number', 'number'])(44100, 0);
  const p = w._malloc(sng.length);
  w.HEAPU8.set(sng, p);
  const ok = w.cwrap('gt_load_sng', 'number', ['number', 'number'])(p, sng.length);
  w._free(p);
  if (!ok) throw new Error('GoatTracker refused the converted song.');
  const MAX = 65536, o = w._malloc(MAX);
  const n = w.cwrap('gt_export_prg', 'number', ['number', 'number'])(o, MAX);
  const player = w.HEAPU8.slice(o, o + n);
  w._free(o);
  if (!n) throw new Error('GoatTracker relocator failed (song too large for the C64?).');
  const prg = buildC64Prg(player, live.module.name, live.module.author, undefined, { hz: g.hz, ntsc: g.settings.ntsc });
  return { prg, warnings: [...live.warnings, ...g.lossy.map((l) => `Not carried to GoatTracker: ${l}`)] };
}
