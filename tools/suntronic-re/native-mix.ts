/**
 * native-mix.ts — SunTronic Phase 4 Gate B: OFFLINE whole-song native renderer.
 *
 * Drives the byte-exact `SunTronicPlayer` timeline (period/outVolume/active
 * instrument per 1024-sample bucket) through the `renderSynthTick` timbre
 * generator + a Paula wavetable resampler, one mono buffer per voice, then mixes
 * Paula 0+3 -> L / 1+2 -> R (the same stereo law the UADE oracle uses).
 *
 * This is the measure-first deliverable: no worklet/engine/registry yet. The
 * output is compared voice-by-voice against the Gate A UADE oracle
 * (`audio-oracle.ts`) so the fidelity report quantifies exactly which timbres are
 * already right and which need Gate C (synth types 1/4/5/6) or Gate D (sampled).
 *
 * KNOWN APPROXIMATIONS (documented, not hidden — Gate D/E close these):
 *  - Timbre buffer is regenerated on the emulated 882.759-sample VBLANK grid
 *    (~50 Hz chip frame), matching how MEGAEFFECTS rewrites each voice's play
 *    buffer per frame. (Superseded the earlier once-per-1024-bucket regen, which
 *    froze swept timbres — type-2 splice with a moving D1=arp, type-6 resonator.)
 *  - Type-B (sampled) instruments are `instrOff = -1` in the player (the
 *    sequencer leaves them null) -> those voices render silent here. Gate D.
 *  - RESIDUAL phase drift on SWEPT timbres (ballblaser type-2, arp=[32,33,34,…]):
 *    the moving splice content-shifts every frame, and the interaction of that
 *    shift with the continuous Paula read pointer is only bit-exact under a
 *    cycle-accurate Paula-DMA/buffer-swap model (the deferred Gate-2 scheduler
 *    port). Measured via `voiceFidelity` best-lag correlation; the drift exceeds
 *    the 640-sample search window in some windows for low-pitched swept voices.
 *    STATIC-arp type-2 (gliders) and the byte-exact timbre kernels are unaffected
 *    — the kernel math is proven byte-exact in sunTronicSynthVoice.test.ts.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  parseSunTronicV13Score,
  type SunSynthInstrument,
} from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import {
  renderSynthTick,
  createVoiceState,
  createPrng,
  type SunSynthVoiceState,
} from '../../src/engine/suntronic/SunTronicSynthVoice';
import { PAULA_CLOCK_PAL } from '../../src/engine/suntronic/SunTronicVoiceRenderer';
import { CORPUS_DIR } from './suntronicLib';
import { renderUADEPerVoice, peak, writeMonoWav } from './audio-oracle';

const BUCKET = 1024; // audioTick samples per player tick (calibrated at 44100)
const MAX_VOLUME = 0x40;
// Emulated PAL vblank period in samples (1024*25/29 = 882.759). The MEGAEFFECTS
// synth engine regenerates every voice's play buffer ONCE per vblank (~50 Hz),
// NOT once per 1024 output bucket — for a swept-arp timbre (type-2 splice whose
// D1=arp slides, type-6 whose resonator sweeps) the buffer content changes every
// frame, so regen must ride the vblank grid or the timbre freezes and beats
// against the real sweep. This is the same 882.759 clock the player's
// double-position schedule is built on (SunTronicPlayer.tick).
const VBLANK = (1024 * 25) / 29;

/** Per-voice diagnostic summary for the fidelity report. */
export interface VoiceInfo {
  /** most-active instrument's record offset (-1 = idle/sampled). */
  dominantOff: number;
  /** that instrument's synthType, or -1 if none / sampled. */
  synthType: number;
  /** fraction of buckets the voice was active (flags==0x01). */
  activeFrac: number;
  /** true when the voice produced no audio (empty wave / sampled / idle). */
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

/** Per-voice mutable render state (timbre gen + resampler phase). */
interface VoiceRender {
  state: SunSynthVoiceState;
  phase: number;     // float index into the current frame buffer
  lastInstrOff: number;
}

/**
 * Render `name` (a corpus .src) to a native per-voice mix by driving the
 * byte-exact player timeline. Fixed 44100 Hz / 1024-sample buckets so the tick
 * schedule matches the golden timeline the player is locked to.
 */
export function renderSunTronicNative(
  name: string,
  opts: { seconds?: number } = {},
): NativeMix {
  const sampleRate = 44100;
  const seconds = opts.seconds ?? 10;
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const player = new SunTronicPlayer(score);

  const byOff = new Map<number, SunSynthInstrument>();
  for (const inst of score.synthInstruments) byOff.set(inst.recordOff, inst);

  const totalSamples = Math.floor(seconds * sampleRate);
  const buckets = Math.ceil(totalSamples / BUCKET);
  const ch: Float32Array[] = [0, 1, 2, 3].map(() => new Float32Array(totalSamples));

  const prng = createPrng(); // shared PRNG (workspace rndnum) across voices
  const vr: VoiceRender[] = [0, 1, 2, 3].map(() => ({
    state: createVoiceState(),
    phase: 0,
    lastInstrOff: -1,
  }));
  const offCount: Array<Map<number, number>> = [0, 1, 2, 3].map(() => new Map());
  const activeCount = [0, 0, 0, 0];

  // Current play buffer per voice (rewritten on each vblank while the voice is
  // active — Paula keeps streaming the last buffer written).
  const curBuf: Array<Int8Array | null> = [null, null, null, null];
  // Absolute sample index of the next vblank (free-running chip frame clock).
  let nextVblank = VBLANK;

  for (let b = 0; b < buckets; b++) {
    const tick = player.tick();
    const base = b * BUCKET;
    const n = Math.min(BUCKET, totalSamples - base);

    // Per-voice per-bucket sequencer state (constant across the bucket — the
    // byte-exact golden clock resolves note/period/volume at bucket granularity).
    const vActive = [false, false, false, false];
    const vInst: Array<SunSynthInstrument | undefined> = [undefined, undefined, undefined, undefined];
    const vInc = [0, 0, 0, 0];
    const vGain = [0, 0, 0, 0];
    for (let v = 0; v < 4; v++) {
      const vd = tick.voices[v];
      const active = (vd.flags & 0xff) === 0x01;
      const inst = vd.instrOff >= 0 ? byOff.get(vd.instrOff) : undefined;
      const r = vr[v];
      if (active) activeCount[v]++;
      offCount[v].set(vd.instrOff, (offCount[v].get(vd.instrOff) ?? 0) + 1);

      // Note-on / instrument change: restart the timbre feedback + arp (matches
      // GETNEXTNOTE clearing the voice's play buffer + latch on a retrigger).
      if (vd.instrOff !== r.lastInstrOff) {
        r.state = createVoiceState();
        r.phase = 0;
        r.lastInstrOff = vd.instrOff;
        curBuf[v] = null; // force regen on the next sample
      }

      vActive[v] = active && !!inst && vd.period > 0;
      vInst[v] = inst;
      vInc[v] = vd.period > 0 ? PAULA_CLOCK_PAL / vd.period / sampleRate : 0;
      vGain[v] = Math.min(1, (vd.outVolume & 0xff) / MAX_VOLUME);
    }

    // Sample-outer loop so the shared vblank grid crosses at the right absolute
    // sample for every voice at once (one chip frame clock, four play buffers).
    for (let i = 0; i < n; i++) {
      const gs = base + i;
      const vblankNow = gs >= nextVblank;
      if (vblankNow) nextVblank += VBLANK;
      for (let v = 0; v < 4; v++) {
        if (!vActive[v]) continue;
        const r = vr[v];
        // Regenerate the play buffer on each vblank (advances arp) — and lazily
        // on the very first active sample after a note-on.
        if (vblankNow || curBuf[v] === null) {
          curBuf[v] = renderSynthTick(vInst[v]!, r.state, prng);
        }
        const buf = curBuf[v]!;
        const byteLen = buf.length;
        if (byteLen <= 0) continue;
        let phase = r.phase;
        const idx = Math.floor(phase) % byteLen;
        ch[v][gs] = (buf[idx] / 128) * vGain[v];
        phase += vInc[v];
        if (phase >= byteLen) phase -= byteLen * Math.floor(phase / byteLen);
        r.phase = phase;
      }
    }
  }

  // Paula stereo law (matches entry.c / the oracle): ch0+ch3 -> L, ch1+ch2 -> R.
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    left[i] = (ch[0][i] + ch[3][i]) * 0.5;
    right[i] = (ch[1][i] + ch[2][i]) * 0.5;
  }

  const info = [0, 1, 2, 3].map((v): VoiceInfo => {
    let dom = -1, domN = -1;
    for (const [off, cnt] of offCount[v]) if (off >= 0 && cnt > domN) { dom = off; domN = cnt; }
    let silent = true;
    for (let i = 0; i < totalSamples; i++) if (ch[v][i] !== 0) { silent = false; break; }
    return {
      dominantOff: dom,
      synthType: dom >= 0 ? (byOff.get(dom)?.synthType ?? -1) : -1,
      activeFrac: buckets > 0 ? activeCount[v] / buckets : 0,
      silent,
    };
  }) as NativeMix['info'];

  return {
    ch: ch as NativeMix['ch'],
    left,
    right,
    sampleRate,
    frames: totalSamples,
    info,
  };
}

/** Best-lag normalized cross-correlation of `a[off..off+win)` against `b`. */
function windowBestLag(
  a: Float32Array,
  b: Float32Array,
  off: number,
  win: number,
  maxLag: number,
): number {
  let best = -2;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sab = 0, sa = 0, sb = 0;
    for (let i = 0; i < win; i++) {
      const av = a[off + i] ?? 0;
      const bv = b[off + i + lag] ?? 0;
      sab += av * bv; sa += av * av; sb += bv * bv;
    }
    const d = Math.sqrt(sa * sb);
    if (d > 0) { const c = sab / d; if (c > best) best = c; }
  }
  return best;
}

/**
 * Windowed timbre fidelity: median best-lag correlation over sliding windows,
 * ignoring near-silent windows. This is the RIGHT metric for whole-song native
 * vs oracle — a single global lag is meaningless because the native resampler
 * and UADE's Paula slowly drift in phase (hundreds of samples over seconds) even
 * when the per-frame WAVEFORM is byte-correct. Per-window best-lag isolates
 * "is the timbre right" from "does the absolute phase track".
 */
export function voiceFidelity(
  native: Float32Array,
  oracle: Float32Array,
  opts: { win?: number; hop?: number; maxLag?: number } = {},
): { median: number; windows: number } {
  const win = opts.win ?? 4096;
  const hop = opts.hop ?? 11025;
  const maxLag = opts.maxLag ?? 640;
  const corrs: number[] = [];
  const n = Math.min(native.length, oracle.length);
  for (let off = maxLag; off + win + maxLag < n; off += hop) {
    // require both signals to carry energy in this window
    let eo = 0, en = 0;
    for (let i = 0; i < win; i++) { eo += oracle[off + i] * oracle[off + i]; en += native[off + i] * native[off + i]; }
    if (Math.sqrt(eo / win) < 0.003 || Math.sqrt(en / win) < 0.003) continue;
    corrs.push(windowBestLag(native, oracle, off, win, maxLag));
  }
  if (corrs.length === 0) return { median: 0, windows: 0 };
  corrs.sort((x, y) => x - y);
  return { median: corrs[corrs.length >> 1], windows: corrs.length };
}

// ── CLI: fidelity report vs the Gate A oracle ─────────────────────────────────
async function main(): Promise<void> {
  const outDir = process.env.SCRATCH ?? '/tmp';
  const seconds = 10;
  for (const name of ['gliders.src', 'ballblaser.src', 'analgestic2.src']) {
    const stem = name.replace('.src', '');
    const native = renderSunTronicNative(name, { seconds });
    const oracle = await renderUADEPerVoice(name, { seconds });
    console.log(`\n=== ${name} — native vs UADE oracle (windowed timbre fidelity) ===`);
    for (let v = 0; v < 4; v++) {
      const nv = native.ch[v];
      const ov = oracle.ch[v];
      const fid = voiceFidelity(nv, ov);
      const inf = native.info[v];
      const tag = inf.dominantOff < 0
        ? 'SAMPLED/idle (Gate D)'
        : `off${inf.dominantOff} synthType${inf.synthType}`;
      const flag = inf.silent && peak(ov) > 0.01 ? '  <-- NATIVE SILENT (wave unresolved)' : '';
      console.log(
        `  voice ${v}: fidelity=${fid.median.toFixed(3)} (${fid.windows} win)` +
        ` ${tag} active=${(inf.activeFrac * 100).toFixed(0)}%` +
        ` nPeak=${peak(nv).toFixed(3)} oPeak=${peak(ov).toFixed(3)}${flag}`,
      );
      writeMonoWav(join(outDir, `native-${stem}-v${v}.wav`), nv, native.sampleRate);
    }
    console.log(`  native voice wavs -> ${outDir}/native-${stem}-v{0..3}.wav`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
