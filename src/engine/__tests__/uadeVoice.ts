/**
 * The song side of a keyboard-preview comparison for formats UADE plays: the
 * module run through UADE's own eagleplayer with every Paula channel but one
 * muted (audio.c: bit set = channel audible), rendered mono at 48 kHz, plus
 * the channel's own Paula period and volume registers once per 50 Hz tick
 * (get_channel_snapshot: period, volume, dma, loop pointer per channel).
 */
import { loadUADEModule, refreshHeap, type UADEModule } from '../../../tools/uade-audit/uadeRenderCore';

interface MutableUade extends UADEModule { _uade_wasm_mute_channels(mask: number): void }

export interface UadeVoice {
  pcm: Float32Array;
  /** Paula AUDxPER and AUDxVOL of the channel after each 20 ms tick. */
  period: number[];
  volume: number[];
}

export async function uadeVoice(data: Uint8Array, hint: string, channel: number, seconds: number, rate = 48000): Promise<UadeVoice> {
  const mod = (await loadUADEModule(false)) as MutableUade;
  if (mod._uade_wasm_init(rate) !== 0) throw new Error('uade init failed');
  const ptr = mod._malloc(data.byteLength);
  refreshHeap(mod);
  mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(hint.length * 4 + 1);
  mod.stringToUTF8(hint, hp, hint.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('UADE refused the module');
  mod._uade_wasm_mute_channels(1 << channel);
  const total = Math.ceil(seconds * rate);
  const CH = 960;
  const pL = mod._malloc(CH * 4), pR = mod._malloc(CH * 4), snapPtr = mod._malloc(64);
  const pcm = new Float32Array(total);
  const period: number[] = [], volume: number[] = [];
  for (let f = 0; f < total; f += CH) {
    if (mod._uade_wasm_render(pL, pR, CH) <= 0) break;
    refreshHeap(mod);
    pcm.set(new Float32Array(mod.HEAPU8.buffer, pL, Math.min(CH, total - f)), f);
    mod._uade_wasm_get_channel_snapshot(snapPtr);
    refreshHeap(mod);
    const snap = new Uint32Array(mod.HEAPU8.buffer, snapPtr, 16);
    period.push(snap[channel * 4]); volume.push(snap[channel * 4 + 1]);
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  return { pcm, period, volume };
}
