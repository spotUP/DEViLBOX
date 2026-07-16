/**
 * probe-resampler-phase.ts — Gate-E 2a DECISIVE PROBE (throwaway).
 *
 * Question the resampler-phase port hinges on: is the residual synth-voice drift
 * explained by applying the TRUE per-vblank period at the TRUE sub-bucket offset
 * (with a per-song vblank phase φ_v), or is sub-bucket period application lossy
 * even in phase?
 *
 * Method: drive the byte-exact player on the RAW 882.759-sample vblank grid
 * (player.stepVblankOnce — one stepAll per vblank, the same 29 steps / 25 buckets
 * the shipped double-position tick() emits, but placed at true vblank offsets) and
 * re-synthesize each voice: at each vblank, regen the synth timbre buffer (advances
 * arp) and resample it forward to the next vblank at inc = clock/period/44100. Sweep
 * the INITIAL vblank phase φ_v ∈ {0 … 992 step 32}; for each φ report
 * voiceFidelity(maxLag 640) per synth voice against the UADE oracle.
 *
 * Discriminator (plan 2a):
 *   - some φ per song lifts the hard synth voices to >= 0.90 at maxLag 640 ->
 *     mechanism = φ_v alignment. Build 2b.
 *   - NO φ reaches 0.90 -> sub-bucket application itself is lossy; the fix shape
 *     changes (interpolate period, or step at true CIA cycles). Reassess.
 *
 * The current SHIPPED renderer applies ONE flat period per 1024 bucket (the final
 * snapshot), so its baseline fidelity is the control — printed alongside.
 *
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-resampler-phase.ts [song ...]
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR, INSTR_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import {
  renderSynthTick,
  createVoiceState,
  createPrng,
  type SunSynthVoiceState,
} from '../../src/engine/suntronic/SunTronicSynthVoice';
import { PAULA_CLOCK_PAL } from '../../src/engine/suntronic/SunTronicVoiceRenderer';
import { renderSunTronicNative, voiceFidelity } from './native-mix';
import { renderUADEPerVoice, peak } from './audio-oracle';

const SR = 44100;
const VBLANK = (1024 * 25) / 29; // 882.759
const MAX_VOL = 0x40;

function loadSlotPcm(names: string[]): (Int8Array | null)[] {
  return names.map((n) => {
    const p = join(INSTR_DIR, n);
    return existsSync(p) ? new Int8Array(readFileSync(p)) : null;
  });
}

function paula(byte: number, vol: number): number { return (byte * vol) / 32768; }

interface VR {
  state: SunSynthVoiceState; phase: number; buf: Int8Array | null; pending: Int8Array | null;
  inc: number; gain: number; active: boolean; lastOff: number; lastSlot: number;
  samPcm: Int8Array | null; samByteLen: number; loopStart: number; loopLen: number;
}

/**
 * Render the 4 voices on the raw vblank grid with initial phase φ_v, applying each
 * vblank's period from its sample offset.
 */
function renderVblankGrid(
  score: ReturnType<typeof parseSunTronicV13Score>,
  slotPcm: (Int8Array | null)[],
  phi: number,
  total: number,
  wrapLatch: boolean,
): Float32Array[] {
  const player = new SunTronicPlayer(score, { sampleData: slotPcm });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byOff = new Map<number, any>();
  for (const inst of score.synthInstruments) byOff.set(inst.recordOff, inst);
  const prng = createPrng();
  const out = [0, 1, 2, 3].map(() => new Float32Array(total));
  const vr: VR[] = [0, 1, 2, 3].map(() => ({
    state: createVoiceState(), phase: 0, buf: null, pending: null, inc: 0, gain: 0, active: false,
    lastOff: -1, lastSlot: -1, samPcm: null, samByteLen: 0, loopStart: 0, loopLen: 0,
  }));

  let nextFire = phi;
  for (let i = 0; i < total; i++) {
    if (i >= nextFire || i === 0) {
      const tick = player.stepVblankOnce();
      nextFire += VBLANK;
      for (let v = 0; v < 4; v++) {
        const vd = tick.voices[v];
        const r = vr[v];
        const active = (vd.flags & 0x80) === 0;
        const inst = vd.instrOff >= 0 ? byOff.get(vd.instrOff) : undefined;
        const sampled = vd.sampleSlot >= 0;
        const pcm = sampled ? (slotPcm[vd.sampleSlot] ?? null) : null;
        if (vd.instrOff !== r.lastOff || vd.sampleSlot !== r.lastSlot) {
          r.state = createVoiceState(); r.phase = 0; r.buf = null; r.pending = null;
          r.lastOff = vd.instrOff; r.lastSlot = vd.sampleSlot;
        }
        r.inc = vd.period > 0 ? PAULA_CLOCK_PAL / vd.period / SR : 0;
        r.gain = Math.min(MAX_VOL, vd.outVolume & 0xff);
        if (sampled) {
          const byteLen = pcm ? Math.min(vd.sampleLenWords * 2, pcm.length) : 0;
          r.samPcm = pcm; r.samByteLen = byteLen;
          r.loopStart = vd.loopStartWords * 2; r.loopLen = vd.loopLenWords * 2;
          r.active = active && !!pcm && byteLen > 0 && vd.period > 0;
        } else {
          r.samPcm = null;
          r.active = active && !!inst && vd.period > 0;
          if (inst) {
            const fresh = renderSynthTick(inst, r.state, prng);
            // wrapLatch: real Paula finishes the current DMA buffer, latching the
            // new content only at the loop boundary. Stash as pending; the sample
            // loop swaps it in when phase wraps. Non-latch: swap immediately.
            if (wrapLatch && r.buf) r.pending = fresh; else { r.buf = fresh; r.pending = null; }
          }
        }
      }
    }
    for (let v = 0; v < 4; v++) {
      const r = vr[v];
      if (!r.active) continue;
      if (r.samPcm) {
        let ph = r.phase;
        if (ph >= r.samByteLen) {
          if (r.loopLen > 2) {
            const eff = Math.min(r.loopLen, r.samByteLen - r.loopStart);
            if (eff <= 0) continue;
            ph = r.loopStart + ((ph - r.loopStart) % eff);
          } else continue;
        }
        out[v][i] = paula(r.samPcm[Math.floor(ph)], r.gain);
        r.phase = ph + r.inc;
      } else {
        const buf = r.buf; if (!buf || buf.length <= 0) continue;
        let ph = r.phase;
        out[v][i] = paula(buf[Math.floor(ph) % buf.length], r.gain);
        ph += r.inc;
        if (ph >= buf.length) {
          ph -= buf.length * Math.floor(ph / buf.length);
          // loop boundary: latch the pending regen buffer (Paula DMA wrap-latch).
          if (r.pending) { r.buf = r.pending; r.pending = null; }
        }
        r.phase = ph;
      }
    }
  }
  return out;
}

async function main(): Promise<void> {
  const songs = process.argv.slice(2);
  if (!songs.length) songs.push('ballblaser.src', 'analgestic2.src');
  const seconds = 8;
  const total = seconds * SR;

  for (const name of songs) {
    console.log(`\n=== ${name} — Gate-E 2a vblank-grid φ sweep (maxLag 640) ===`);
    const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
    const score = parseSunTronicV13Score(data);
    const slotPcm = loadSlotPcm(score.instrumentNames);
    const oracle = await renderUADEPerVoice(name, { seconds });

    // Control: shipped flat-per-bucket renderer.
    const base = renderSunTronicNative(name, { seconds });
    const synthV: number[] = [];
    for (let v = 0; v < 4; v++) {
      const inf = base.info[v];
      if (inf.dominantOff >= 0 && peak(oracle.ch[v]) > 0.01 && peak(base.ch[v]) > 0.01) synthV.push(v);
    }
    const baseFid = synthV.map((v) => voiceFidelity(base.ch[v], oracle.ch[v], { maxLag: 640 }).median);
    console.log(`  synth voices: ${synthV.join(',') || '(none)'}`);
    console.log(`  SHIPPED (flat/bucket): ${synthV.map((v, k) => `v${v}=${baseFid[k].toFixed(2)}`).join(' ')}`);

    // φ was shown inert in the first pass; test the wrap-latch hypothesis at a few
    // φ, non-latch vs latch, to see if the Paula DMA wrap-latch lifts fidelity.
    for (const phi of [0, 352, 640]) {
      for (const latch of [false, true]) {
        const grid = renderVblankGrid(score, slotPcm, phi, total, latch);
        const parts = synthV.map((v) => `v${v}=${voiceFidelity(grid[v], oracle.ch[v], { maxLag: 640 }).median.toFixed(2)}`);
        console.log(`  φ=${String(phi).padStart(4)} ${latch ? 'WRAP-LATCH' : 'immediate '}: ${parts.join(' ')}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
