/**
 * SunTronicNativeRender.ts — browser-safe SunTronic native render core.
 *
 * The pure (fs-free) STREAMING Paula render extracted from tools/suntronic-re/
 * native-mix.ts so the OFFLINE oracle tool and the BROWSER runtime engine share
 * ONE synth path — single source of truth for the timbre-regen grid, the
 * sampled-DMA loop, and the 0+3/1+2 stereo law. `native-mix.ts` keeps the fs
 * loaders + UADE fidelity report and re-imports this module; the Gate B.2 worklet
 * engine's main-thread pump drives `SunTronicNativeRenderer.renderInto` to
 * produce finished 44100 Hz stereo chunks (the worklet only ring-buffers +
 * sample-rate-converts to the context rate — it never re-synthesizes, so there
 * is no second copy of the Paula/timbre math to drift).
 *
 * Drives the byte-exact `SunTronicPlayer` timeline (period/outVolume/active
 * instrument per 1024-sample bucket) through `renderSynthTick` (synth timbre)
 * and a Paula wavetable resampler (sampled voices stream companion PCM off
 * "chip RAM"), one mono voice at a time, mixing 0+3 -> L / 1+2 -> R.
 *
 * The render clock is FIXED at 44100 Hz / 1024-sample buckets because the
 * player's double-position golden schedule is calibrated there; the worklet
 * converts 44100 -> ctx.sampleRate. Do NOT re-clock the player to the context
 * rate — that detunes the whole song (the golden timeline is 44100-locked).
 *
 * KNOWN APPROXIMATIONS (documented, not hidden — Gate E closes these):
 *  - Synth timbre buffer is regenerated on the emulated 882.759-sample VBLANK
 *    grid (~50 Hz chip frame), matching MEGAEFFECTS rewriting each voice's play
 *    buffer per frame (swept type-2 splice / type-6 resonator need this).
 *  - Sampled (type-B) voices stream the whole companion PCM at the EFFECTS period
 *    with loop [loopStart, +loopLen] words (one-shot when loopLenWords<=1); no
 *    per-vblank regen — the PCM IS the voice buffer, like Paula DMA off chip RAM.
 *  - RESIDUAL phase drift on SWEPT timbres is only bit-exact under a
 *    cycle-accurate Paula-DMA model (deferred Gate-2 scheduler port). The kernel
 *    math is proven byte-exact in sunTronicSynthVoice.test.ts.
 */

import {
  type SunSynthInstrument,
  type SunV13Score,
} from '../../lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from './SunTronicPlayer';
import {
  renderSynthTick,
  createVoiceState,
  createPrng,
  type SunSynthVoiceState,
} from './SunTronicSynthVoice';
import { PAULA_CLOCK_PAL } from './SunTronicVoiceRenderer';

/** The fixed native render rate — the golden timeline is calibrated here. */
export const NATIVE_SAMPLE_RATE = 44100;
const MAX_VOLUME = 0x40;
// Emulated PAL vblank period in samples (1024*25/29 = 882.759). MEGAEFFECTS
// regenerates every voice's play buffer ONCE per vblank (~50 Hz), NOT once per
// 1024 output bucket — for a swept-arp timbre (type-2 splice whose D1=arp
// slides, type-6 whose resonator sweeps) the buffer content changes every frame,
// so regen must ride the vblank grid or the timbre freezes. Same 882.759 clock
// the player's double-position schedule is built on (SunTronicPlayer.tick).
const VBLANK = (1024 * 25) / 29;

/** Per-voice diagnostic summary for the fidelity report. */
export interface VoiceInfo {
  /** most-active instrument's record offset (-1 = idle, -2-slot = sampled). */
  dominantOff: number;
  /** that instrument's synthType, or -1 if none / sampled. */
  synthType: number;
  /** fraction of buckets the voice was active (flags bit7 clear). */
  activeFrac: number;
  /** true when the voice produced no audio (empty wave / sampled absent / idle). */
  silent: boolean;
}

export interface NativeMix {
  /** per-Paula-voice mono float PCM (index 0..3). */
  ch: [Float32Array, Float32Array, Float32Array, Float32Array];
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  frames: number;
  info: [VoiceInfo, VoiceInfo, VoiceInfo, VoiceInfo];
}

/** Optional per-voice destination for whole-song / oscilloscope callers. */
export interface RenderChannels {
  ch: [Float32Array, Float32Array, Float32Array, Float32Array];
}

/** Per-voice mutable render state (timbre gen + resampler phase). */
interface VoiceRender {
  state: SunSynthVoiceState;
  phase: number;     // float index into the current frame buffer
  lastInstrOff: number;
  lastSlot: number;  // sampled slot of the current note (-1 = synth/idle)
}

/**
 * Stateful streaming Paula renderer. Construct once per song, then call
 * `renderInto` repeatedly — each call advances the player timeline, the vblank
 * regen grid, and every voice's resampler phase by exactly `left.length`
 * samples at 44100 Hz. The whole-song `renderSunTronicMix` below is a single
 * full-length call; the worklet pump issues many short calls with lookahead.
 */
export class SunTronicNativeRenderer {
  private readonly player: SunTronicPlayer;
  private readonly slotPcm: (Int8Array | null)[];
  private readonly byOff = new Map<number, SunSynthInstrument>();
  private readonly prng = createPrng(); // shared workspace rndnum across voices
  private readonly vr: VoiceRender[];

  // Absolute sample position (44100 grid) — drives the vblank clock. The player
  // is stepped once per vblank (pos=0 fires the first step: nextVblank starts 0).
  private pos = 0;
  private nextVblank = 0;
  private buckets = 0; // count of vblank steps (== player stepAll calls)
  private readonly offCount: Array<Map<number, number>>;
  private readonly activeCount = [0, 0, 0, 0];

  // Current-bucket derived voice state (refreshed at every 1024-sample boundary).
  private readonly vActive = [false, false, false, false];
  private readonly vInst: Array<SunSynthInstrument | undefined> = [undefined, undefined, undefined, undefined];
  private readonly vInc = [0, 0, 0, 0];
  private readonly vGain = [0, 0, 0, 0];
  private readonly vSamPcm: Array<Int8Array | null> = [null, null, null, null];
  private readonly vSamByteLen = [0, 0, 0, 0];
  private readonly vLoopStartBytes = [0, 0, 0, 0];
  private readonly vLoopLenBytes = [0, 0, 0, 0]; // <=2 (one word) = one-shot
  // Current play buffer per synth voice (rewritten each vblank; Paula keeps
  // streaming the last buffer written).
  private readonly curBuf: Array<Int8Array | null> = [null, null, null, null];

  constructor(score: SunV13Score, slotPcm: (Int8Array | null)[]) {
    this.slotPcm = slotPcm;
    this.player = new SunTronicPlayer(score, { sampleData: slotPcm });
    for (const inst of score.synthInstruments) this.byOff.set(inst.recordOff, inst);
    this.vr = [0, 1, 2, 3].map(() => ({
      state: createVoiceState(),
      phase: 0,
      lastInstrOff: -1,
      lastSlot: -1,
    }));
    this.offCount = [0, 1, 2, 3].map(() => new Map());
  }

  /**
   * Refresh the per-voice state from one physical PAL-vblank player step. Called
   * on the 882.759-sample vblank grid (NOT the 1024 audio bucket) so Paula period
   * ($20) + vibrato ($24) updates — and therefore the resampler increment vInc —
   * land at vblank granularity, matching UADE. The old 1024-bucket refresh ran a
   * stale period for up to ~142 samples/bucket → whole-song sample-phase drift.
   */
  private deriveVblank(): void {
    const tick = this.player.stepVblank();
    this.buckets++;
    for (let v = 0; v < 4; v++) {
      const vd = tick.voices[v];
      // Voice is playing when $14 bit7 is clear: 0x01 = synth active, 0x00 =
      // sampled active (GNN8 clears $14 on load); 0xff/0xfe (bit7) = note-off.
      const active = (vd.flags & 0x80) === 0;
      const inst = vd.instrOff >= 0 ? this.byOff.get(vd.instrOff) : undefined;
      const sampled = vd.sampleSlot >= 0;
      const pcm = sampled ? (this.slotPcm[vd.sampleSlot] ?? null) : null;
      const r = this.vr[v];
      if (active) this.activeCount[v]++;
      // Diagnostic "dominant instrument": synth record offset, or a synthetic
      // negative id for a sampled slot so the report attributes the voice.
      const domKey = sampled ? -2 - vd.sampleSlot : vd.instrOff;
      this.offCount[v].set(domKey, (this.offCount[v].get(domKey) ?? 0) + 1);

      // Note-on / instrument change: restart the timbre feedback + arp (matches
      // GETNEXTNOTE clearing the play buffer + latch on a retrigger). Sampled
      // voices carry instrOff=-1, so key the retrigger on the slot too.
      if (vd.instrOff !== r.lastInstrOff || vd.sampleSlot !== r.lastSlot) {
        r.state = createVoiceState();
        r.phase = 0;
        r.lastInstrOff = vd.instrOff;
        r.lastSlot = vd.sampleSlot;
        this.curBuf[v] = null; // force regen on the next sample
      }

      this.vInc[v] = vd.period > 0 ? PAULA_CLOCK_PAL / vd.period / NATIVE_SAMPLE_RATE : 0;
      this.vGain[v] = Math.min(1, (vd.outVolume & 0xff) / MAX_VOLUME);

      if (sampled) {
        // Paula streams the whole PCM once, then loops [loopStart, +loopLen].
        const byteLen = pcm ? Math.min(vd.sampleLenWords * 2, pcm.length) : 0;
        this.vSamPcm[v] = pcm;
        this.vSamByteLen[v] = byteLen;
        this.vLoopStartBytes[v] = vd.loopStartWords * 2;
        this.vLoopLenBytes[v] = vd.loopLenWords * 2;
        this.vActive[v] = active && !!pcm && byteLen > 0 && vd.period > 0;
      } else {
        this.vInst[v] = inst;
        this.vSamPcm[v] = null;
        this.vActive[v] = active && !!inst && vd.period > 0;
      }
    }
  }

  /**
   * Render the next `left.length` samples (44100 Hz) into `left`/`right`. When
   * `chans` is supplied, also write the four pre-mix mono voice buffers (for the
   * whole-song fidelity report + the oscilloscope) at the same offset.
   */
  renderInto(left: Float32Array, right: Float32Array, chans?: RenderChannels): void {
    const count = left.length;
    const ch = chans?.ch;
    for (let i = 0; i < count; i++) {
      // Single clock: step the player + refresh period/volume/instrument state
      // on the vblank grid, then regen synth timbre for the same step below.
      const vblankNow = this.pos >= this.nextVblank;
      if (vblankNow) {
        this.nextVblank += VBLANK;
        this.deriveVblank();
      }

      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      for (let v = 0; v < 4; v++) {
        if (!this.vActive[v]) continue;
        const r = this.vr[v];
        let sample = 0;

        const pcm = this.vSamPcm[v];
        if (pcm) {
          // ── Sampled (type-B): stream the whole PCM off "chip RAM", loop the
          //    [loopStart,+loopLen] region (one-shot when loopLen<=one word).
          const byteLen = this.vSamByteLen[v];
          let phase = r.phase;
          if (phase >= byteLen) {
            const loopLen = this.vLoopLenBytes[v];
            if (loopLen > 2) {
              const loopStart = this.vLoopStartBytes[v];
              // A compiled player can emit a loop descriptor whose region
              // [loopStart, loopStart+loopLen) runs PAST the DMA'd sample bytes
              // (byteLen already clamps sampleLenWords*2 to pcm.length). Paula
              // only ever reads the bytes it actually has, so wrap within the
              // AVAILABLE region [loopStart, byteLen) — an un-clamped modulo can
              // leave idx == pcm.length, and `pcm[pcm.length]` is `undefined`,
              // whose /128 is NaN. One NaN sample poisons the worklet ring for
              // good (silent-forever on a later loop). Clamp the effective loop.
              const effLoopLen = Math.min(loopLen, byteLen - loopStart);
              if (effLoopLen <= 0) continue; // degenerate loop region -> silent
              phase = loopStart + ((phase - loopStart) % effLoopLen);
            } else {
              continue; // one-shot exhausted -> silent
            }
          }
          const idx = Math.floor(phase);
          sample = (pcm[idx] / 128) * this.vGain[v];
          r.phase = phase + this.vInc[v];
        } else {
          // ── Synth (type-A): regenerate the play buffer on each vblank (advances
          //    arp) — and lazily on the first active sample after a note-on.
          if (vblankNow || this.curBuf[v] === null) {
            this.curBuf[v] = renderSynthTick(this.vInst[v]!, r.state, this.prng);
          }
          const buf = this.curBuf[v]!;
          const byteLen = buf.length;
          if (byteLen <= 0) continue;
          let phase = r.phase;
          const idx = Math.floor(phase) % byteLen;
          sample = (buf[idx] / 128) * this.vGain[v];
          phase += this.vInc[v];
          if (phase >= byteLen) phase -= byteLen * Math.floor(phase / byteLen);
          r.phase = phase;
        }

        if (v === 0) s0 = sample; else if (v === 1) s1 = sample;
        else if (v === 2) s2 = sample; else s3 = sample;
        if (ch) ch[v][this.pos] = sample;
      }

      // Paula stereo law (matches entry.c / the oracle): ch0+ch3 -> L, ch1+ch2 -> R.
      const g = i; // write at the chunk-local index; ch[] uses absolute pos above
      left[g] = (s0 + s3) * 0.5;
      right[g] = (s1 + s2) * 0.5;
      this.pos++;
    }
  }

  /** Per-voice diagnostic summary (activeFrac + dominant instrument). */
  getInfo(): [VoiceInfo, VoiceInfo, VoiceInfo, VoiceInfo] {
    return [0, 1, 2, 3].map((v): VoiceInfo => {
      let dom = -1, domN = -1;
      for (const [off, cnt] of this.offCount[v]) if (off !== -1 && cnt > domN) { dom = off; domN = cnt; }
      return {
        dominantOff: dom,
        synthType: dom >= 0 ? (this.byOff.get(dom)?.synthType ?? -1) : -1,
        activeFrac: this.buckets > 0 ? this.activeCount[v] / this.buckets : 0,
        silent: true, // whole-song caller overwrites from the ch scan
      };
    }) as [VoiceInfo, VoiceInfo, VoiceInfo, VoiceInfo];
  }
}

/**
 * Whole-song convenience wrapper over the streaming renderer — one full-length
 * `renderInto`, producing per-voice ch[] + stereo + the fidelity-report info.
 * Pure (no fs / no oracle); native-mix.ts supplies the fs-loaded score + PCM.
 */
export function renderSunTronicMix(
  score: SunV13Score,
  slotPcm: (Int8Array | null)[],
  opts: { seconds?: number } = {},
): NativeMix {
  const sampleRate = NATIVE_SAMPLE_RATE;
  const seconds = opts.seconds ?? 10;
  const totalSamples = Math.floor(seconds * sampleRate);
  const ch = [0, 1, 2, 3].map(() => new Float32Array(totalSamples)) as NativeMix['ch'];
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const renderer = new SunTronicNativeRenderer(score, slotPcm);
  renderer.renderInto(left, right, { ch });

  const info = renderer.getInfo();
  for (let v = 0; v < 4; v++) {
    let silent = true;
    for (let i = 0; i < totalSamples; i++) if (ch[v][i] !== 0) { silent = false; break; }
    info[v].silent = silent;
  }

  return { ch, left, right, sampleRate, frames: totalSamples, info };
}
