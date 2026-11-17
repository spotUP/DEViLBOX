/**
 * ZX Spectrum 128K song data for public/zx/quadtone.bin (QuadTone player, see quadtone.asm): a per-tick capture
 * of Furnace's ZX Spectrum Beeper (QuadTone engine) register pool -> a record stream spread over the 128K banks,
 * plus the drum hits pre-rendered as 1-bit data stored after the player code.
 *
 * Source of the capture: tools/furnace-audit/render-devilbox.ts --regpool (the Furnace WASM engine itself, so no
 * Furnace logic is re-implemented here). Each frame holds the 17 register bytes, the drum sample and its bit
 * position in effect for one tick, and the tick rate.
 * Timing: every record is placed on the Z80 T-state timeline so each tick ends where Furnace's tick ends (no drift).
 * The tone loop stops while a record is read, so frequencies are raised by the measured share of that time.
 */

import { parseChipFlags } from '@/lib/furnace/snesDsp';

/** Must match quadtone.asm and the 128K CPU clock; the test checks public/zx/quadtone.json. */
export const QUADTONE_CLOCK = 3546900;
/** Effective round / drum byte length: 320 T counted, plus ULA contention on the 8 OUT (#FE), measured in MAME (see quadtone.asm). */
export const QUADTONE_ITER_T = 325;
export const QUADTONE_DRUM_BYTE_T = 325;
/** Furnace adds each voice's frequency once per 320 chip cycles; the player once per QUADTONE_ITER_T Z80 T. */
const FURNACE_ROUND_T = 320;
export const QUADTONE_BANK_SIZE = 16384;
/** Furnace chip clock (zxbeeperquadtone.cpp setFlags): clockSel 1 = ZX Spectrum, otherwise NTSC. */
export const QUADTONE_FURNACE_CLOCK = [3579545, 3546895];

// Record costs in T-states, hand counted in quadtone.asm (header comment).
const REC_T = 31 + 34 + 80; // record head + bar change bits + four unchanged voices
// The screen slice (screen.inc `slice`) runs before every tone run.
// shortcut: QUADTONE_SLICE_T is the measured average (MAME port trace); the slice length varies a little per task.
export const QUADTONE_SLICE_T = 1700;
const VOICE_CHANGED_T = 125;
const NO_DRUM_T = 46;
const DRUM_T = 106;
const TONE_RUN_T = 51 + 16 + 17 + 16 + 13 + 4 + QUADTONE_SLICE_T; // + save stream pointer, call slice, reload
const NO_TONE_T = 25;
const NEXT_BANK_T = 153 + 41;
const MAX_COUNT = 255;

const OP_ADD = 0xC6; // add a,n
const OP_SUB = 0xD6; // sub n
const OUT_A = 0x79; // out (c),a
const OUT_0 = 0x71; // out (c),0

export interface QuadToneFrame { regs: number[]; sample: number; pos: number; hz: number }
/** chipFlags: Furnace's flag string ("clockSel=1\n"), as render-devilbox.ts and the dispatch engine give it. */
export interface QuadToneCapture { chipFlags?: string; frames: QuadToneFrame[]; samples: number[][] }

/** One voice as the player holds it: frequency word and the three self-modified opcode bytes. */
export interface QuadToneVoice { freq: number; op: number; operand: number; slot0: number }

export interface QuadToneData {
  banks: Uint8Array[];
  /** Drum bits, appended after the player code (loadAddress + dataOffset). */
  drums: Uint8Array;
  records: number;
  seconds: number;
  drumHits: number;
  /** Frequency factor applied for the tone loop pauses (record reads, drum pieces), about 1.004. */
  pauseFactor: number;
  /** Largest gap between a tick's Furnace end and its Z80 end, in T-states. */
  maxTickErrorT: number;
  warnings: string[];
}

/** Pin pattern per compare result: [slot 0, slot 1] for c = 0 (phase >= duty) and c = 1 (phase < duty). */
function pins(vol: number, c: number): [boolean, boolean] {
  const out = (vol + c) & 0xFF;
  return [(out & 0x10) !== 0, (out & 0x08) !== 0];
}

/** Player voice for one Furnace voice's volume and duty registers (freq filled in by the caller). */
export function quadToneVoiceMode(vol: number, duty: number, warnings?: string[]): Omit<QuadToneVoice, 'freq'> {
  const [a0, a1] = pins(vol, 0);
  const [b0, b1] = pins(vol, 1);
  let op = OP_SUB; let operand = 0; // slot 1 always low
  if (!a1 && b1) operand = duty; // high while phase < duty
  else if (a1 && !b1) { op = OP_ADD; operand = (256 - duty) & 0xFF; } // high while phase >= duty
  else if (a1 && b1) warnings?.push(`Volume register ${vol} holds the pin high; the player keeps it low (silent either way)`);
  const slot1 = (c: number) => (op === OP_ADD ? c === 0 && operand !== 0 : op === OP_SUB && c === 1 && operand !== 0);
  let slot0 = OUT_0;
  if (a0 || b0) {
    if (a0 === slot1(0) && b0 === slot1(1)) slot0 = OUT_A;
    else warnings?.push(`Volume register ${vol} needs a slot pattern the player cannot make; slot 0 stays low`);
  }
  return { op, operand, slot0 };
}

/**
 * Pre-render one drum hit (sample bits, channel 5 period in chip T-states) as pin bits at one bit per 40 Z80 T,
 * stepping exactly like acquire(): curSamplePeriod starts at 0 on note-on and grows 40 per output step.
 */
export function renderQuadToneDrum(bits: readonly number[], period: number, furnaceClock: number): Uint8Array {
  const out: number[] = [];
  let pos = 0; let cur = 0; let pin = 0; let h = 0; // Furnace output step
  const furnacePin: number[] = [];
  while (pos < bits.length && pos < 32768 * 8) {
    while (cur >= period && pos < bits.length) { pin = bits[pos++] ? 1 : 0; cur -= period; }
    furnacePin.push(pin);
    cur += 40; h++;
  }
  // Resample Furnace's 40-chip-T grid onto the player's bit grid (QUADTONE_DRUM_BYTE_T / 8 effective Z80 T per bit).
  const ratio = (40 / furnaceClock) / (QUADTONE_DRUM_BYTE_T / 8 / QUADTONE_CLOCK);
  const steps = Math.ceil(h * ratio);
  for (let j = 0; j < steps; j++) out.push(furnacePin[Math.min(h - 1, Math.floor(j / ratio))]);
  const bytes = new Uint8Array(Math.ceil(out.length / 8));
  out.forEach((b, j) => { if (b) bytes[j >> 3] |= 0x80 >> (j & 7); });
  if (out.length & 7) { const last = out[out.length - 1]; for (let j = out.length; j < bytes.length * 8; j++) if (last) bytes[j >> 3] |= 0x80 >> (j & 7); }
  return bytes;
}

/** FurnaceDispatchPlatform.SFX_BEEPER_QUADTONE: the platformType of the worklet's QuadTone snapshot batches. */
export const QUADTONE_PLATFORM = 51;

/**
 * Worklet snapshot batches (FurnaceDispatch.worklet.js drainRegWrites) -> encoder frames: pairs [i, reg i] for the
 * register pool, then 0x100 = drum sample, 0x101 = its bit position, 0x102 = tick rate.
 */
export function quadToneFramesFromBatches(batches: ReadonlyArray<{ platformType: number; pairs: ArrayLike<number> }>): QuadToneFrame[] {
  const frames: QuadToneFrame[] = [];
  for (const b of batches) {
    if (b.platformType !== QUADTONE_PLATFORM) continue;
    const f: QuadToneFrame = { regs: [], sample: -1, pos: 0, hz: 0 };
    for (let i = 0; i + 1 < b.pairs.length; i += 2) {
      const a = b.pairs[i]; const v = b.pairs[i + 1];
      if (a === 0x100) f.sample = v; else if (a === 0x101) f.pos = v; else if (a === 0x102) f.hz = v; else f.regs[a] = v;
    }
    frames.push(f);
  }
  return frames;
}

/** Drum sample bits as the chip plays them: bit = data8 > 0 (zxbeeperquadtone.cpp acquire); depth 0 = 1-bit PCM, LSB first. */
export function quadToneSampleBits(smp: { data: ArrayLike<number>; depth: number; samples?: number }): number[] {
  const count = smp.depth === 0 ? (smp.samples ?? smp.data.length * 8) : smp.data.length;
  const bits: number[] = [];
  for (let j = 0; j < count; j++) {
    const v = smp.depth === 16 ? smp.data[j] >> 8 : smp.depth === 0 ? ((smp.data[j >> 3] >> (j & 7)) & 1) * 2 - 1 : (smp.data[j] << 24) >> 24;
    bits.push(v > 0 ? 1 : 0);
  }
  return bits;
}

export function encodeQuadTone(cap: QuadToneCapture, drumAddress: number): QuadToneData {
  const warnings: string[] = [];
  const furnaceClock = QUADTONE_FURNACE_CLOCK[parseChipFlags(cap.chipFlags).get('clockSel') === '1' ? 1 : 0];
  const frames = cap.frames;
  if (frames.length === 0) throw new Error('The QuadTone capture has no ticks.');

  // Drum hits: one pre-render per (sample, rate) key.
  const drumParts: Uint8Array[] = []; const drumKeys = new Map<string, { offset: number; length: number }>();
  let drumLen = 0;
  const drumOf = (sample: number, reg16: number) => {
    const key = `${sample}:${reg16}`;
    let d = drumKeys.get(key);
    if (!d) {
      const bits = cap.samples[sample];
      if (!bits) throw new Error(`The capture plays drum sample ${sample}, which it does not contain.`);
      const data = renderQuadToneDrum(bits, ((reg16 + 2) & 0xFF || 256) * 13, furnaceClock);
      d = { offset: drumLen, length: data.length };
      drumKeys.set(key, d); drumParts.push(data); drumLen += data.length;
    }
    return d;
  };

  // Pass 1: place records on the Z80 timeline. Voice word choice does not change any cost, so freqs come later.
  type Rec = { voices: Array<Omit<QuadToneVoice, 'freq'> & { word: number } | null>; drum?: { ptr: number; bytes: number }; rounds: number; t: number };
  const recs: Rec[] = [];
  const prev = [0, 1, 2, 3].map(() => ({ word: 0, op: OP_SUB, operand: 0, slot0: OUT_0 }));
  let z = 0; let target = 0; let toneT = 0; let roundsT = 0; let hits = 0; let maxErr = 0;
  let hit: { startZ: number; offset: number; length: number } | null = null;
  for (const f of frames) {
    const tickT = QUADTONE_CLOCK / (f.hz || 60);
    const start = target; target += tickT;
    if (f.sample >= 0 && f.pos === 0) { const d = drumOf(f.sample, f.regs[16]); hit = { startZ: start, offset: d.offset, length: d.length }; hits++; }
    if (f.sample < 0) hit = null;
    const drumEndZ = hit ? hit.startZ + hit.length * QUADTONE_DRUM_BYTE_T : start;
    toneT += tickT - Math.min(tickT, Math.max(0, drumEndZ - start));
    let voices: Rec['voices'] = [0, 1, 2, 3].map((v) => {
      const b = v * 4;
      const m = { word: (f.regs[1 + b] << 8) | f.regs[b], ...quadToneVoiceMode(f.regs[3 + b], f.regs[2 + b], warnings) };
      const p = prev[v];
      if (m.word === p.word && m.op === p.op && m.operand === p.operand && m.slot0 === p.slot0) return null;
      prev[v] = m; return m;
    });
    for (;;) {
      const changed = voices.filter(Boolean).length;
      const head = REC_T + VOICE_CHANGED_T * changed;
      let drum: Rec['drum'];
      let cost = head;
      if (hit) {
        const b0 = Math.max(0, Math.round((z + head + DRUM_T - hit.startZ) / QUADTONE_DRUM_BYTE_T));
        const room = Math.floor((target - z - head - DRUM_T - NO_TONE_T) / QUADTONE_DRUM_BYTE_T);
        const n = Math.min(MAX_COUNT, hit.length - b0, room);
        if (n > 0) { drum = { ptr: drumAddress + hit.offset + b0, bytes: n }; cost += DRUM_T + n * QUADTONE_DRUM_BYTE_T; }
      }
      if (!drum) cost += NO_DRUM_T;
      const left = target - z - cost - TONE_RUN_T;
      const rounds = Math.max(0, Math.min(MAX_COUNT, Math.round(left / QUADTONE_ITER_T)));
      cost += rounds ? TONE_RUN_T + rounds * QUADTONE_ITER_T : NO_TONE_T;
      recs.push({ voices, drum, rounds, t: start / QUADTONE_CLOCK });
      z += cost; roundsT += rounds * QUADTONE_ITER_T;
      voices = [null, null, null, null];
      // Another record only when a count hit its cap and the tick still has time for it.
      if (target - z < QUADTONE_ITER_T + REC_T + NO_DRUM_T + TONE_RUN_T) break;
      if (rounds < MAX_COUNT && !(drum && drum.bytes === MAX_COUNT)) break;
    }
    maxErr = Math.max(maxErr, Math.abs(target - z));
  }
  if (drumLen > 0xFFFF - drumAddress) throw new Error(`The drum hits need ${drumLen} bytes; the player has no room for them.`);
  const pauseFactor = roundsT > 0 ? toneT / roundsT : 1;
  const scale = furnaceClock / QUADTONE_CLOCK * (QUADTONE_ITER_T / FURNACE_ROUND_T) * pauseFactor;

  // Pass 2: bytes. Records never cross a bank end; #80 moves to the next bank, #81 loops.
  const banks: Uint8Array[] = []; let cur: number[] = [];
  const flush = () => { banks.push(Uint8Array.from(cur)); cur = []; };
  let wordWarned = false;
  let second = 0;
  for (const r of recs) {
    const bytes: number[] = [];
    // #82 = one more second of song for the clock (about 80 T, inside the timing slack).
    for (; r.t >= second + 1; second++) bytes.push(0x82);
    const head = bytes.length;
    bytes.push(0);
    r.voices.forEach((v, i) => {
      if (!v) return;
      let w = Math.round(v.word * scale);
      if (w > 0xFFFF) { w = 0xFFFF; if (!wordWarned) warnings.push('A frequency above the player range was lowered'); wordWarned = true; }
      bytes[head] |= 1 << i;
      bytes.push(w & 0xFF, w >> 8, v.op, v.operand, v.slot0);
    });
    if (r.drum) { bytes[head] |= 0x10; bytes.push(r.drum.ptr & 0xFF, r.drum.ptr >> 8, r.drum.bytes); }
    bytes.push(r.rounds);
    if (cur.length + bytes.length + 1 > QUADTONE_BANK_SIZE) { cur.push(0x80); flush(); z += NEXT_BANK_T; }
    cur.push(...bytes);
  }
  cur.push(0x81); flush();
  const drums = new Uint8Array(drumLen);
  let o = 0; for (const p of drumParts) { drums.set(p, o); o += p.length; }
  return {
    banks, drums, records: recs.length, seconds: target / QUADTONE_CLOCK, drumHits: hits, pauseFactor,
    maxTickErrorT: Math.round(maxErr), warnings: [...new Set(warnings)],
  };
}
