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
 *  - Type-B (sampled) voices (Gate D): the player now resolves the 0x1c record
 *    (sampleSlot/length/loop) AND runs the SHARED EFFECTS (period/vol). The
 *    companion PCM (instr/* sidecar, raw signed-8-bit) is streamed through the
 *    Paula resampler at the EFFECTS period with loop [loopStart, +loopLen] words
 *    (one-shot when loopLenWords<=1). No per-vblank regen — the whole PCM is the
 *    voice buffer, exactly like Paula DMA off chip RAM.
 *  - RESIDUAL phase drift on SWEPT timbres (ballblaser type-2, arp=[32,33,34,…]):
 *    the moving splice content-shifts every frame, and the interaction of that
 *    shift with the continuous Paula read pointer is only bit-exact under a
 *    cycle-accurate Paula-DMA/buffer-swap model (the deferred Gate-2 scheduler
 *    port). Measured via `voiceFidelity` best-lag correlation; the drift exceeds
 *    the 640-sample search window in some windows for low-pitched swept voices.
 *    STATIC-arp type-2 (gliders) and the byte-exact timbre kernels are unaffected
 *    — the kernel math is proven byte-exact in sunTronicSynthVoice.test.ts.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import {
  renderSunTronicMix,
  type NativeMix,
  type VoiceInfo,
} from '../../src/engine/suntronic/SunTronicNativeRender';
import { CORPUS_DIR, INSTR_DIR } from './suntronicLib';
import { renderUADEPerVoice, peak, writeMonoWav } from './audio-oracle';

// Re-export the shared render types so existing tool consumers keep importing
// them from here (the render core is now src/engine/suntronic/SunTronicNativeRender).
export type { NativeMix, VoiceInfo };

/**
 * Resolve the companion PCM for each sampled slot, in `instrumentNames` order.
 * Slot N -> instrumentNames[N] -> instr/<name> sidecar (raw signed-8-bit Amiga
 * PCM, whole file = sample). Missing sidecar -> null (voice runs EFFECTS but
 * renders silent, exactly the "companion absent" contract the player enforces).
 */
function loadSlotPcm(names: string[]): (Int8Array | null)[] {
  return names.map((n) => {
    const p = join(INSTR_DIR, n);
    if (!existsSync(p)) return null;
    return new Int8Array(readFileSync(p));
  });
}

/**
 * Render `name` (a corpus .src) to a native per-voice mix by driving the
 * byte-exact player timeline through the shared render core. fs wrapper: read
 * corpus + companion sidecars, then delegate to `renderSunTronicMix`.
 */
export function renderSunTronicNative(
  name: string,
  opts: { seconds?: number } = {},
): NativeMix {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const slotPcm = loadSlotPcm(score.instrumentNames);
  return renderSunTronicMix(score, slotPcm, { seconds: opts.seconds ?? 10 });
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
      const tag = inf.dominantOff <= -2
        ? `SAMPLED slot${-2 - inf.dominantOff}`
        : inf.dominantOff < 0
          ? 'idle'
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
