/**
 * The row preview's view of UADE: a private UADE instance (a second module in the row-preview worker, or the Node one in
 * tests) behind RowRenderAdapter. It makes the calls public/uade/UADE.worklet.js makes to play a song with the scan skipped:
 * companions into the filesystem, load, the first-audible-subsong probe when no subsong was pinned, set_subsong, then
 * `_uade_wasm_render` with the four Paula channel buffers read after every call (the capture is a FIFO; reading it with
 * every call keeps it in step with the mix, as the worklet does with the scope on).
 *
 * Position is one of UADE's tick counters (UadeRowClock): the count is read after a render call, so a chunk is rendered in
 * small slices and the count read after each - the first frame of a row is known to one slice (SLICE_FRAMES). UADE's output
 * does not depend on the size of the render call (measured 1 / 16 / 128 frames: identical samples; thoughts/shared/plans/
 * 2026-10-14-engine-row-preview.md U0).
 *
 * Mask: bits 0-3 are the voices audible (`uade_wasm_mute_channels`), bits 8-11 the voices taken out of the stereo mix but
 * kept in their buffers (`uade_wasm_isolate_channels`, an effect-isolation slot): the playing instance holds both.
 */
import { CHUNK_ENDED, type PlayerPosition, type RowChunk } from '../rowClip';
import { sameLoad, type RowRenderAdapter } from '../rowPreviewStream';
import type { UadeWasm } from '../../uade/uadeWasmInstance';
import { addUadeCompanion } from '../../uade/uadeWasmInstance';
import { uadeMaskAudible, uadeMaskIsolated, type UadeLoadArgs, type UadeRowClock } from '../../uade/uadeLoadArgs';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';

/** What a UADE row opens with: the load arguments, then the clock the grid is named in. */
export type UadeRowArgs = [...UadeLoadArgs, clock: UadeRowClock];

/** Frames per render call while a chunk is read tick by tick. */
export const SLICE_FRAMES = 8;
/** Size of the scratch buffers. */
const BIG = 4096;
/**
 * Frames per call while running silently to a row. The emulator produces audio in bursts and the channel capture is a
 * FIFO of 8192 frames (audio.c): a call big enough to pull several bursts through it overflows the FIFO, which then drops its
 * older half and the voices fall out of step with the mix (measured at 4096 on batmanreturns.dsr; 256 keeps one burst).
 */
const ADVANCE_FRAMES = 256;
const PROBE_SECONDS = 3;
const PROBE_THRESHOLD = 0.005;
const PROBE_CHUNK = 1024;

export class UadeRowAdapter implements RowRenderAdapter {
  readonly sampleRate: number;
  private w: UadeWasm;
  private bufL = 0;
  private bufR = 0;
  private bufC: number[] = [];
  private readonly newWasm: (() => Promise<UadeWasm>) | undefined;
  /** The module and arguments the instance is open on (a different song gets a clean instance). */
  private openedWith: { data: Uint8Array; args: unknown[] } | null = null;
  private bytes: Uint8Array | null = null;
  private hint = '';
  private clock: UadeRowClock = { kind: 'frames' };
  private companionNames: string[] = [];
  /** The subsong playback starts on (the pinned one, or the probe's pick). */
  private subsong = 0;
  /** Something has been loaded or rendered since the instance was made: the next load goes through a reset (the worklet's rule). */
  private dirty = false;
  private appliedMask = -1;
  private sliceTicks: number[] = [];
  private chunkStart = 0;
  private rendered = 0;

  /**
   * @param newWasm makes a clean instance. A reset reuses the instance's memory and leaves some of the song before in it
   *   (measured: Suntronic-ko, played after other songs on one instance, differed from itself on a clean one), so a song that
   *   is not the one already open gets a new instance, as the DJ render worker does for each render; a restart of the same
   *   song resets in place (measured identical to a clean instance). Without it the one instance is reset for every song.
   */
  constructor(w: UadeWasm, sampleRate: number, newWasm?: () => Promise<UadeWasm>) {
    this.w = w;
    this.sampleRate = sampleRate;
    this.newWasm = newWasm;
    this.allocate();
  }

  private allocate(): void {
    const w = this.w;
    this.bufL = w._malloc(BIG * 4);
    this.bufR = w._malloc(BIG * 4);
    this.bufC = [0, 1, 2, 3].map(() => w._malloc(BIG * 4));
    this.dirty = false;
    this.appliedMask = -1;
  }

  async prepare(args: unknown[], data: Uint8Array): Promise<void> {
    if (!this.newWasm || !this.openedWith || sameLoad(this.openedWith, { data, args })) return;
    this.w = await this.newWasm();
    this.allocate();
    this.openedWith = null;
  }

  open(data: Uint8Array, args: unknown[]): void {
    const [fileName, subsong, pin, companions, clock] = args as UadeRowArgs;
    const w = this.w;
    this.bytes = data;
    this.openedWith = { data: data.slice(), args };
    this.clock = clock ?? { kind: 'frames' };
    const hint = uadePlayerHint(fileName);
    this.hint = hint.includes('/') ? hint.split('/').pop()! : hint;
    this.resetInstance();
    for (const name of this.companionNames) this.unlink(name);
    this.companionNames = [];
    for (const [name, buf] of companions ?? []) {
      if (addUadeCompanion(w, name, buf, 'RowPreview')) this.companionNames.push(name);
    }
    this.subsong = subsong ?? 0;
    if (this.loadModule() !== 0) throw new Error(`UADE could not play ${this.hint}`);
    const min = w._uade_wasm_get_subsong_min(), max = w._uade_wasm_get_subsong_max(), count = w._uade_wasm_get_subsong_count();
    // No subsong asked for and several on offer: the first one that is audible within a few seconds (the worklet's rule).
    if (this.subsong === 0 && count > 1 && !pin) {
      const audible = this.firstAudibleSubsong(min, max);
      if (audible !== null && audible !== min) this.subsong = audible;
      w._uade_wasm_stop();
      this.loadModule();
    }
    this.start();
  }

  restart(): void {
    this.resetInstance();
    this.loadModule();
    this.start();
  }

  advanceSilent(frame: number, mask: number): number {
    const w = this.w;
    this.applyMask(mask);
    let done = 0;
    while (done < frame) {
      const n = Math.min(ADVANCE_FRAMES, frame - done);
      if (w._uade_wasm_render(this.bufL, this.bufR, n) <= 0) break;
      // The capture FIFO is read with every call so it stays in step with the mix.
      w._uade_wasm_read_channel_samples(this.bufC[0]!, this.bufC[1]!, this.bufC[2]!, this.bufC[3]!, n);
      done += n;
    }
    this.rendered = done;
    return done;
  }

  renderChunk(frames: number, mask: number): RowChunk {
    const w = this.w;
    this.applyMask(mask);
    const stereo = new Float32Array(frames * 2);
    const voices = [0, 1, 2, 3].map(() => new Float32Array(frames));
    this.sliceTicks = [];
    this.chunkStart = this.rendered;
    let done = 0;
    let ended = false;
    while (done < frames) {
      const n = Math.min(SLICE_FRAMES, frames - done);
      const r = w._uade_wasm_render(this.bufL, this.bufR, n);
      if (r < 0) throw new Error('UADE render failed');
      const heap = w.HEAPF32;
      const l = this.bufL >> 2, rr = this.bufR >> 2;
      for (let i = 0; i < n; i++) { stereo[(done + i) * 2] = heap[l + i]!; stereo[(done + i) * 2 + 1] = heap[rr + i]!; }
      const got = w._uade_wasm_read_channel_samples(this.bufC[0]!, this.bufC[1]!, this.bufC[2]!, this.bufC[3]!, n);
      for (let v = 0; v < 4; v++) {
        const at = this.bufC[v]! >> 2;
        voices[v]!.set(heap.subarray(at, at + Math.min(got, n)), done);
      }
      done += n;
      this.sliceTicks.push(this.readClock());
      if (r === 0) { ended = true; break; }
    }
    this.rendered += done;
    return { frames: done, stereo, voices, pans: null, flags: ended ? CHUNK_ENDED : 0 };
  }

  /** The emulator produces ahead of what render() hands out, so the mask goes in before the run, not at the chunk. */
  private applyMask(mask: number): void {
    if (mask === this.appliedMask) return;
    this.w._uade_wasm_mute_channels(uadeMaskAudible(mask));
    this.w._uade_wasm_isolate_channels(uadeMaskIsolated(mask));
    this.appliedMask = mask;
  }

  positionAt(frame: number): PlayerPosition | null {
    if (this.clock.kind === 'frames') return null;
    const i = Math.floor((frame - this.chunkStart) / SLICE_FRAMES);
    const raw = this.sliceTicks[Math.max(0, Math.min(i, this.sliceTicks.length - 1))];
    if (raw === undefined) return null;
    return { order: 0, pattern: 0, row: 0, tick: this.rowTick(raw), speed: 1 };
  }

  // -- clocks ---------------------------------------------------------------------------------------------------

  private readClock(): number {
    const w = this.w;
    return (this.clock.kind === 'player' ? w._uade_wasm_get_player_tick_count() : w._uade_wasm_get_tick_count()) >>> 0;
  }

  /** The count as the grid names it: the follow's `playerTickGridPosition(ticks)` is `tickGridPosition(ticks - 1)`; the CIA's is `tickCount - firstTick`. -1: the clock has not started. */
  private rowTick(raw: number): number {
    if (raw <= 0) return -1;
    return this.clock.kind === 'cia' ? raw - this.clock.firstTick : raw - 1;
  }

  // -- the worklet's load sequence -------------------------------------------------------------------------------

  private resetInstance(): void {
    const w = this.w;
    if (this.dirty) {
      w._uade_wasm_stop();
      if (w._uade_wasm_full_reset() !== 0) throw new Error('UADE full reset failed');
    }
    this.dirty = true;
    this.appliedMask = -1;
    this.sliceTicks = [];
    this.chunkStart = 0;
    this.rendered = 0;
  }

  private loadModule(): number {
    const w = this.w;
    if (!this.bytes) throw new Error('UadeRowAdapter: no module');
    // The channel capture is a FIFO that a load or reset does not empty: what the render before left in it would come out
    // as the first samples of the voices, ahead of the new song's own. Emptied before the load, so the audio the load itself
    // produces (which the stereo pipe holds too) stays in step with the mix.
    while (w._uade_wasm_read_channel_samples(this.bufC[0]!, this.bufC[1]!, this.bufC[2]!, this.bufC[3]!, BIG) > 0) { /* drained */ }
    const ptr = w._malloc(this.bytes.length || 1);
    w.HEAPU8.set(this.bytes, ptr);
    const hintLen = this.hint.length * 3 + 1;
    const hintPtr = w._malloc(hintLen);
    w.stringToUTF8(this.hint, hintPtr, hintLen);
    const ret = w._uade_wasm_load(ptr, this.bytes.length, hintPtr);
    w._free(ptr);
    w._free(hintPtr);
    return ret;
  }

  /** After a load: the song plays to its end once (the preview never needs the loop), on the chosen subsong, from an empty channel capture. */
  private start(): void {
    const w = this.w;
    w._uade_wasm_set_looping(0);
    if (this.subsong > 0) w._uade_wasm_set_subsong(this.subsong);
  }

  /** The first subsong in [min, max] (at most 16 tried) whose first PROBE_SECONDS render audio, or null: the worklet's _firstAudibleSubsong. */
  private firstAudibleSubsong(min: number, max: number): number | null {
    const w = this.w;
    const last = Math.min(max, min + 15);
    for (let s = min; s <= last; s++) {
      w._uade_wasm_stop();
      if (this.loadModule() !== 0) return null;
      w._uade_wasm_set_looping(0);
      if (s > 0) w._uade_wasm_set_subsong(s);
      const maxFrames = this.sampleRate * PROBE_SECONDS;
      for (let done = 0; done < maxFrames; done += PROBE_CHUNK) {
        if (w._uade_wasm_render(this.bufL, this.bufR, PROBE_CHUNK) <= 0) break;
        const heap = w.HEAPF32.subarray(this.bufL >> 2, (this.bufL >> 2) + PROBE_CHUNK);
        for (let i = 0; i < PROBE_CHUNK; i++) if (heap[i]! > PROBE_THRESHOLD || heap[i]! < -PROBE_THRESHOLD) return s;
      }
    }
    return null;
  }

  private unlink(name: string): void {
    const fs = (this.w as unknown as { FS?: { unlink(p: string): void } }).FS;
    try { fs?.unlink('/uade/' + name); } catch { /* already gone */ }
  }
}

/** An adapter over a freshly instantiated UADE module (the row-preview worker's own instance, not the worklet's). */
export function createUadeRowAdapter(w: UadeWasm, sampleRate: number, newWasm?: () => Promise<UadeWasm>): UadeRowAdapter {
  return new UadeRowAdapter(w, sampleRate, newWasm);
}
