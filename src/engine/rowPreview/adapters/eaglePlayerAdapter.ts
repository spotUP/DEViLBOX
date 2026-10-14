/**
 * The row preview's view of the EaglePlayer runner: a private eagleplayer-wasm instance (a second module in the
 * row-preview worker, or the Node one in tests) behind RowRenderAdapter. It makes the same ep_wasm_* calls as
 * public/eagleplayer/EaglePlayer.worklet.js: load the player and the module (companions first), start the subsong,
 * render the stereo mix with the four Paula voice buffers.
 *
 * Position is the runner's player tick count, the quantity the playhead follow maps (GridFollow.followTicks). The
 * runner reports it after a render call, so a chunk is rendered in small slices and the count read after each: the
 * first frame of a row is known to one slice (SLICE_FRAMES). The render does not depend on the call size (measured:
 * 1, 16 and 128 frames give the same samples, thoughts/shared/plans/2026-10-14-engine-row-preview.md U0).
 */
import { CHUNK_ENDED, type PlayerPosition, type RowChunk } from '../rowClip';
import type { RowRenderAdapter } from '../rowPreviewStream';
import { eaglePlayerFormat, eaglePlayerModuleName, eaglePlayerUrl } from '../../eagleplayer/eaglePlayerFormats';

/** The slice of the eagleplayer-wasm module the adapter calls. */
export interface EaglePlayerWasm {
  _ep_wasm_init(rate: number): number;
  _ep_wasm_stop(): void;
  _ep_wasm_clear_files(): void;
  _ep_wasm_add_file(name: number, data: number, len: number): number;
  _ep_wasm_load(player: number, playerLen: number, mod: number, modLen: number, name: number, subsong: number, options: number): number;
  _ep_wasm_render_voices(out: number, voices: number, n: number, stride: number): number;
  _ep_wasm_set_voice_mask(mask: number): void;
  _ep_wasm_set_subsong(n: number): void;
  _ep_wasm_subsong_min(): number;
  _ep_wasm_subsong_max(): number;
  _ep_wasm_subsong_current(): number;
  _ep_wasm_player_ticks(): number;
  _ep_wasm_song_ended(): number;
  _ep_wasm_log(): number;
  _malloc(n: number): number;
  _free(p: number): void;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  UTF8ToString(p: number): string;
}

/** The arguments EaglePlayer's registry descriptor loads with (wasmEngineRegistry getLoadArgs). */
export type EaglePlayerLoadArgs = [formatId?: string, fileName?: string, subsong?: number, companions?: Map<string, ArrayBuffer>];

/** Frames per render call while a chunk is read tick by tick. */
export const SLICE_FRAMES = 8;
/** Frames per call while running silently to a row. */
const ADVANCE_FRAMES = 4096;
const VOICES = 4;

export class EaglePlayerRowAdapter implements RowRenderAdapter {
  readonly sampleRate: number;
  private readonly m: EaglePlayerWasm;
  private readonly fetchPlayer: (url: string) => Promise<ArrayBuffer>;
  private readonly baseUrl: string;
  private readonly players = new Map<string, Uint8Array>();
  private readonly outPtr: number;
  private readonly voicePtr: number;
  private module: Uint8Array | null = null;
  private args: EaglePlayerLoadArgs = [];
  private appliedMask = -1;
  /** Ticks after each slice of the chunk rendered last, and the frame that chunk starts at. */
  private sliceTicks: number[] = [];
  private chunkStart = 0;
  private rendered = 0;

  constructor(m: EaglePlayerWasm, sampleRate: number, fetchPlayer: (url: string) => Promise<ArrayBuffer>, baseUrl = '/') {
    this.m = m;
    this.sampleRate = sampleRate;
    this.fetchPlayer = fetchPlayer;
    this.baseUrl = baseUrl;
    this.outPtr = m._malloc(ADVANCE_FRAMES * 2 * 4);
    this.voicePtr = m._malloc(ADVANCE_FRAMES * VOICES * 4);
  }

  /** Fetch the eagleplayer binary of the format the module is for (once per format). */
  async prepare(args: unknown[]): Promise<void> {
    const fmt = eaglePlayerFormat((args as EaglePlayerLoadArgs)[0]);
    if (!fmt || this.players.has(fmt.id)) return;
    this.players.set(fmt.id, new Uint8Array(await this.fetchPlayer(eaglePlayerUrl(fmt, this.baseUrl))));
  }

  open(data: Uint8Array, args: unknown[]): void {
    this.module = data;
    this.args = args as EaglePlayerLoadArgs;
    this.restart();
  }

  /** The worklet's load(): stop, init, the companion files, then the player and the module. */
  restart(): void {
    const m = this.m;
    const [formatId, fileName, subsongIndex, companions] = this.args;
    const fmt = eaglePlayerFormat(formatId);
    const player = fmt && this.players.get(fmt.id);
    if (!fmt || !player || !this.module) throw new Error(`EaglePlayerRowAdapter: format ${formatId} is not prepared`);
    m._ep_wasm_stop();
    m._ep_wasm_init(Math.round(this.sampleRate));
    m._ep_wasm_clear_files();
    for (const [name, bytes] of companions ?? []) {
      const n = this.cstr(name);
      const p = this.heap(new Uint8Array(bytes));
      if (n && p) m._ep_wasm_add_file(n, p, bytes.byteLength);
      if (n) m._free(n);
      if (p) m._free(p);
    }
    const modPtr = this.heap(this.module);
    const playerPtr = this.heap(player);
    const namePtr = this.cstr(eaglePlayerModuleName(fmt, fileName || fmt.id));
    const optPtr = fmt.options ? this.cstr(fmt.options) : 0;
    const r = m._ep_wasm_load(playerPtr, player.length, modPtr, this.module.length, namePtr, -1, optPtr);
    m._free(modPtr); m._free(playerPtr); m._free(namePtr);
    if (optPtr) m._free(optPtr);
    if (r !== 0) throw new Error(`ep_wasm_load failed with code ${r}: ${m.UTF8ToString(m._ep_wasm_log())}`);
    // A subsong other than the player's default (the store's start field): the worklet's startSubsong().
    const count = m._ep_wasm_subsong_max() - m._ep_wasm_subsong_min() + 1;
    if (typeof subsongIndex === 'number' && subsongIndex >= 0 && subsongIndex < count && subsongIndex !== m._ep_wasm_subsong_current() - m._ep_wasm_subsong_min()) {
      m._ep_wasm_set_subsong(m._ep_wasm_subsong_min() + subsongIndex);
    }
    this.appliedMask = -1;
    this.sliceTicks = [];
    this.chunkStart = 0;
    this.rendered = 0;
  }

  advanceSilent(frame: number, mask: number): number {
    const m = this.m;
    this.applyMask(mask);
    let done = 0;
    while (done < frame) {
      const n = Math.min(ADVANCE_FRAMES, frame - done);
      const r = m._ep_wasm_render_voices(this.outPtr, this.voicePtr, n, ADVANCE_FRAMES);
      if (r <= 0) break;
      done += r;
    }
    this.rendered = done;
    return done;
  }

  renderChunk(frames: number, mask: number): RowChunk {
    const m = this.m;
    this.applyMask(mask);
    const stereo = new Float32Array(frames * 2);
    const voices = Array.from({ length: VOICES }, () => new Float32Array(frames));
    this.sliceTicks = [];
    this.chunkStart = this.rendered;
    let done = 0;
    let ended = false;
    while (done < frames) {
      const n = Math.min(SLICE_FRAMES, frames - done);
      const r = m._ep_wasm_render_voices(this.outPtr, this.voicePtr, n, ADVANCE_FRAMES);
      if (r <= 0) { ended = true; break; }
      const heap = m.HEAPF32;
      stereo.set(heap.subarray(this.outPtr >> 2, (this.outPtr >> 2) + r * 2), done * 2);
      for (let v = 0; v < VOICES; v++) {
        const at = (this.voicePtr >> 2) + v * ADVANCE_FRAMES;
        voices[v]!.set(heap.subarray(at, at + r), done);
      }
      done += r;
      this.sliceTicks.push(m._ep_wasm_player_ticks() >>> 0);
    }
    if (m._ep_wasm_song_ended()) ended = true;
    this.rendered += done;
    return { frames: done, stereo, voices, pans: null, flags: ended ? CHUNK_ENDED : 0 };
  }

  private applyMask(mask: number): void {
    if (mask === this.appliedMask) return;
    this.m._ep_wasm_set_voice_mask(mask >>> 0);
    this.appliedMask = mask;
  }

  positionAt(frame: number): PlayerPosition | null {
    const i = Math.floor((frame - this.chunkStart) / SLICE_FRAMES);
    const ticks = this.sliceTicks[Math.max(0, Math.min(i, this.sliceTicks.length - 1))];
    return ticks === undefined ? null : { order: 0, pattern: 0, row: 0, tick: ticks, speed: 1 };
  }

  private heap(bytes: Uint8Array): number {
    const p = this.m._malloc(bytes.length || 1);
    if (p) this.m.HEAPU8.set(bytes, p);
    return p;
  }

  private cstr(s: string): number {
    const b = new TextEncoder().encode(s);
    const p = this.m._malloc(b.length + 1);
    if (!p) return 0;
    this.m.HEAPU8.set(b, p);
    this.m.HEAPU8[p + b.length] = 0;
    return p;
  }
}

/** An adapter over a freshly loaded eagleplayer-wasm module (the row-preview worker's own instance, not the worklet's). */
export function createEaglePlayerRowAdapter(m: EaglePlayerWasm, sampleRate: number, fetchPlayer: (url: string) => Promise<ArrayBuffer>, baseUrl = '/'): EaglePlayerRowAdapter {
  return new EaglePlayerRowAdapter(m, sampleRate, fetchPlayer, baseUrl);
}
