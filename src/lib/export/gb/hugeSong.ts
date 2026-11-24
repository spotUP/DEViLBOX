/**
 * Game Boy native player, hUGEDriver route (plan 2026-11-17-gameboy-native-player, Phase 2h-5h):
 * Furnace GB song -> hUGEDriver song data, patched into the dev-time assembled player ROM
 * (`public/gb/huge-player.gb`, built by `tools/build-gb-player.sh`).
 *
 * hUGEDriver is a note driver, not a register stream, so the conversion is lossy. Every Furnace
 * item that does not survive is counted in `lossy` (shown to the user and listed in the plan).
 *
 * Song layout (third-party/hugedriver/hUGEDriver.asm, `hUGE_init`): descriptor
 * `db tempo; dw order_cnt, order1..4, duty_instruments, wave_instruments, noise_instruments, routines, waves, order_banks`,
 * all pointers absolute. Patterns are 64 rows x 3 bytes (`dn` macro of hUGE.inc). The blob is the ROM image from
 * file offset $2000: bank 0 tail, then bank 1, 2, ... ($4000-$7FFF each, MBC5); `order_banks` (vendored driver)
 * names the bank each order's four patterns live in.
 */
import type { FurnaceModule, FurnaceWavetable } from '../../import/formats/FurnaceSongParser';
import type { FurnaceInstrument, FurnaceMacro } from '../../import/formats/furnace/FurnaceInstrumentParser';
import type { FurnacePatternCell } from '../../import/formats/furnace/FurnacePatternParser';
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';
import { nesScreenText, nesScrollText } from '../nes/nesCartridge';

export interface HugePlayerMeta {
  songAddress: number; songOffset: number; songCapacity: number; tickAddress: number; sourceHash: string;
  /** ScreenText block in huge-player.asm: timer TMA byte, title (11), author (17), scroller text (256). */
  rateOffset: number; titleOffset: number; authorOffset: number; scrollOffset: number;
}

/** Player screen text and tick rate the exporter patches into the ROM. */
export interface HugeScreen { title: string; author: string; /** Timer TMA at 4096 Hz for the song tick rate; 0 = one tick per VBlank. */ timerTma: number }

export interface HugeSong {
  blob: Uint8Array;
  /** One line per lossy Furnace item with its count, e.g. "effect 08 (panning): 12 cells". */
  lossy: string[];
  /** hUGE orders after splitting Furnace orders into 64-row chunks. */
  orders: number;
  screen: HugeScreen;
}

const ROWS = 64;
const NO_NOTE = 90;
/** Song address in huge-player.gb (MBC5, song from $2000); the gbHugeSong test checks it against huge-player.json. */
export const HUGE_SONG_BASE = 0x2000;
const BASE = HUGE_SONG_BASE;
/** hUGE note 0 is C_3 in hUGE naming = 65.4 Hz = Furnace C-2 (flat value 24). */
const NOTE_OFFSET = 24;
const VBLANK_HZ = 59.7275;
const NOISE_SHORT = 1000;
/** Start-volume instrument variants: key = Furnace index + NOISE_SHORT (short noise) + VOL_STEP * (volume + 1). */
const VOL_STEP = 2000;
const MACRO_VOL = 0, MACRO_ARP = 1, MACRO_DUTY = 2, MACRO_WAVE = 3, MACRO_PAN = 12;
const MACRO_NAMES: Record<number, string> = { 4: 'pitch', 5: 'ex1', 6: 'ex2', 7: 'ex3', 13: 'pan right', 14: 'phase reset' };
const FX_NAMES: Record<number, string> = { 0x08: 'panning', 0x10: 'wave select', 0x11: 'noise length', 0x13: 'sweep time', 0x14: 'sweep direction', 0xe1: 'note slide up', 0xe2: 'note slide down', 0xe5: 'finetune', 0xff: 'stop song' };

type Kind = 'duty' | 'wave' | 'noise';
const KIND: Kind[] = ['duty', 'duty', 'wave', 'noise'];

/** One `dn note, instr, effect` cell (hUGE.inc). On table rows `instr` is the jump field. */
function dn(note: number, instr: number, effect: number): [number, number, number] {
  return [note | ((instr & 0x10) << 3), ((instr << 4) & 0xff) | ((effect >> 8) & 0x0f), effect & 0xff];
}

class Lossy {
  private counts = new Map<string, number>();
  add(item: string, n = 1): void { this.counts.set(item, (this.counts.get(item) ?? 0) + n); }
  list(): string[] { return [...this.counts].map(([k, n]) => `${k}: ${n}`); }
}

function macro(ins: FurnaceInstrument, code: number): FurnaceMacro | undefined {
  return ins.macros.find((m) => m.code === code && m.length > 0);
}

/** Per-tick table (arp in the note column, volume or duty in the effect column), max 32 rows. */
function buildTable(ins: FurnaceInstrument, kind: Kind, lossy: Lossy, waveNo: (w: number) => number, synth?: number[]): number[] | undefined {
  const arp = macro(ins, MACRO_ARP);
  const vol = kind === 'wave' ? undefined : macro(ins, MACRO_VOL);
  const duty = kind === 'duty' ? macro(ins, MACRO_DUTY) : undefined;
  // Wave channel: wave macro -> table 9 (driver wave select + retrigger, as gb.cpp keys on after a
  // wave change); volume macro -> table C on gbVolMap steps. Pan macro -> table 8 (per-channel NR51).
  // A wave synth arrives as per-tick hUGE wave slots; it replaces the wave macro (gb.cpp lets the synth own wave RAM).
  const synthM: FurnaceMacro | undefined = synth && synth.length > 1
    ? { code: MACRO_WAVE, length: synth.length, loop: -1, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: synth } : undefined;
  const waveM = synthM ?? (kind === 'wave' && (macro(ins, MACRO_WAVE)?.length ?? 0) > 1 ? macro(ins, MACRO_WAVE) : undefined);
  const wvol = kind === 'wave' ? macro(ins, MACRO_VOL) : undefined;
  const pan = macro(ins, MACRO_PAN);
  // Duty beside a volume macro rides in effect C's param: bit 6 = duty changed, bits 5-4 = duty
  // (driver fx_table_volume). Noise duty (NR43 mode) has no such path.
  const dutyCol = vol && duty && kind === 'duty' ? duty : undefined;
  const fx = vol ?? duty ?? waveM ?? wvol ?? pan;
  if (wvol && fx !== wvol) lossy.add('wave channel volume macro beside a wave macro');
  if (pan && fx !== pan) lossy.add('pan macro beside another macro (one table effect column)');
  for (const m of ins.macros) if (MACRO_NAMES[m.code] && m.length > 0) lossy.add(`${MACRO_NAMES[m.code]} macro`);
  const used = [arp, fx, dutyCol].filter((m): m is FurnaceMacro => !!m);
  if (used.length === 0 || (used.every((m) => m.length === 1) && !arp && fx !== pan && fx !== wvol)) return undefined;
  for (const m of used) if (m.delay > 0) lossy.add('macro delay');
  // Per-tick values from Furnace's DivMacroStruct::doMacro (sequence type): speed, release hold,
  // loop. Both macros step together until their joint state repeats; that repeat is the table loop.
  type St = { pos: number; delay: number; has: boolean; val: number };
  const step = (m: FurnaceMacro, s: St): St => {
    if (s.delay > 0) return { ...s, delay: s.delay - 1 };
    const len = m.length, loopP = m.loop < 0 ? 255 : m.loop, rel = m.release < 0 ? 255 : m.release;
    const n: St = { ...s, delay: Math.max(1, m.speed) - 1 };
    if (!n.has) return n;
    n.val = m.data[n.pos++];
    if (n.pos > rel) n.pos = loopP < len && loopP < rel ? loopP : n.pos - 1;
    if (n.pos >= len) {
      if (loopP < len && (loopP >= rel || rel >= len)) n.pos = loopP;
      else n.has = false;
    }
    return n;
  };
  const key = (s: St | undefined) => (s ? `${s.pos},${s.delay},${s.has ? 1 : 0},${s.has ? '' : s.val}` : '');
  const simulate = (dc: FurnaceMacro | undefined) => {
    let sa: St | undefined = arp && { pos: 0, delay: 0, has: true, val: 0 };
    let sf: St | undefined = fx && { pos: 0, delay: 0, has: true, val: 0 };
    let sd: St | undefined = dc && { pos: 0, delay: 0, has: true, val: 0 };
    const arpRows: number[] = [], fxRows: number[] = [], dutyRows: number[] = [];
    const seen = new Map<string, number>();
    let loop = -1;
    for (let t = 0; t < 160; t++) {
      const k = `${key(sa)}|${key(sf)}|${key(sd)}`;
      const hit = seen.get(k);
      if (hit !== undefined) { loop = hit; break; }
      seen.set(k, t);
      if (sa && arp) { sa = step(arp, sa); arpRows.push(sa.val); }
      if (sf && fx) { sf = step(fx, sf); fxRows.push(sf.val); }
      if (sd && dc) { sd = step(dc, sd); dutyRows.push(sd.val); }
    }
    return { arpRows, fxRows, dutyRows, loop, len: Math.max(arpRows.length, fxRows.length, dutyRows.length) };
  };
  const sim = simulate(dutyCol);
  const { arpRows, fxRows, dutyRows } = sim;
  let { loop, len } = sim;
  // Value at tick t of the true per-tick sequence (past the end it loops, or holds the last value).
  const at = (rows: number[], t: number) => rows.length === 0 ? 0
    : t < rows.length ? rows[t] : sim.loop >= 0 ? rows[sim.loop + ((t - sim.loop) % (rows.length - sim.loop))] : rows[rows.length - 1];
  if (loop < 0 || len > 31) {
    // Table holds 31 rows + the loop row: keep the first 31 ticks exact, then loop back to the row whose
    // continuation matches the true sequence on the most ticks (arp + volume weigh over duty).
    let best = 30, bestScore = -1, exact = false;
    for (let j = 0; j < 31; j++) {
      let score = 0, ok = true;
      for (let t = 0; t < 96; t++) {
        const a = 31 + t, b = j + (t % (31 - j));
        const hit = (at(arpRows, a) === at(arpRows, b) ? 2 : 0) + (at(fxRows, a) === at(fxRows, b) ? 2 : 0) + (at(dutyRows, a) === at(dutyRows, b) ? 1 : 0);
        if (hit < 5) ok = false;
        score += hit;
      }
      if (score > bestScore) { bestScore = score; best = j; exact = ok; }
    }
    if (!exact) lossy.add('macro table loop approximated past 31 rows');
    len = 31; loop = best;
  }
  const out: number[] = [];
  let prevFx = waveM && fx === waveM ? waveM.data[0] : -1, prevDuty = -1; // the instrument already loads wave data[0]
  // Extra row `len` is itself one tick. With a loop it replays the loop row and jumps on to the row
  // after it, so the loop period stays len - loop ticks and row 0 (the driver's key-on row, where
  // the volume latches with a retrigger) never runs again. Without a loop it holds the last values.
  for (let r = 0; r <= len; r++) {
    const extra = r === len;
    const looped = extra && loop >= 0;
    const i = looped ? loop : Math.min(r, len - 1);
    let note = NO_NOTE;
    if (arp) {
      const a = at(arpRows, i);
      // Furnace calcArp: fixed when bit 30 differs from the sign bit
      if ((a < 0) !== !!(a & 0x40000000)) { lossy.add('fixed-note arpeggio macro'); } else note = Math.max(0, Math.min(71, 36 + (a | 0)));
    }
    let effect = 0;
    if (fx && (!extra || looped)) {
      const v = at(fxRows, i);
      const d = dutyCol ? at(dutyRows, i) & 3 : -1;
      if (v !== prevFx || d !== prevDuty) {
        effect = fx === vol ? 0xc00 | (d !== prevDuty ? 0x40 | (d << 4) : 0) | (v & 15)
          : fx === duty ? 0x900 | ((v & 3) << 6)
          : fx === waveM ? 0x900 | (synthM ? v : waveNo(v))
          : fx === wvol ? 0xc00 | waveVol(v)
          : 0x800 | (v & 2 ? 0x10 : 0) | (v & 1);
      }
      prevFx = v;
      prevDuty = d;
    }
    // hUGE jump field = target row + 1; row len + 1 does not exist, so loop = len - 1 jumps to itself.
    const jump = extra ? (looped ? Math.min(loop + 1, len) + 1 : len + 1) : 0;
    out.push(...dn(note, jump, effect));
  }
  return out;
}

/** NRx1 / length bits as Furnace's gb.cpp writes them: length counter only when soundLen < 64. */
function lengthBits(ins: FurnaceInstrument): { len: number; enable: boolean } {
  const s = ins.gb?.soundLen ?? 64;
  return { len: s < 64 ? 63 - (s & 63) : 0, enable: s < 64 };
}

function envelope(ins: FurnaceInstrument, lossy: Lossy): number {
  const gb = ins.gb;
  if (!gb) return 0xf0;
  if (gb.hwSeqLen > 0) lossy.add('hardware sequence');
  if (gb.softEnv) {
    const v = macro(ins, MACRO_VOL)?.data[0] ?? 15;
    return ((v & 15) << 4) | 8; // gb.cpp soft envelope: envDir 1, envLen 0
  }
  return ((gb.envVol & 15) << 4) | (gb.envDir ? 8 : 0) | (gb.envLen & 7);
}

/** Furnace DivWaveSynth::changeWave1 levels: 32 steps scaled to height 15 by the file's wave max. */
function waveLevels(w: FurnaceWavetable | undefined): number[] {
  const out: number[] = [];
  for (let i = 0; i < 32; i++) {
    const v = !w || w.height < 1 ? 0 : Math.trunc(((w.data[Math.floor((i * w.width) / 32)] ?? 0) * 15) / w.height);
    out.push(Math.max(0, Math.min(15, v)));
  }
  return out;
}

/** 32 levels -> 16 wave RAM bytes, with gb.cpp invertWave (chip flag, default on). */
function packWave(levels: number[], invert: boolean): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < 32; i += 2) bytes.push((((invert ? 15 : 0) ^ levels[i]) << 4) | ((invert ? 15 : 0) ^ levels[i + 1]));
  return bytes;
}

/**
 * Furnace wave synth (instrument WS tab), as DivWaveSynth::tick renders it on a GB note: per-tick
 * wave levels from key-on until the output stops changing. Only effects that settle are rendered;
 * the rest return undefined (lossy).
 */
function waveSynthFrames(ins: FurnaceInstrument, waves: FurnaceWavetable[], lossy: Lossy): number[][] | undefined {
  const ws = (ins as { fm?: { ws?: { enabled: boolean; wave1: number; wave2: number; rateDivider: number; effect: number; speed: number; param1: number } } }).fm?.ws;
  if (!ws?.enabled) return undefined;
  if (ws.effect !== 0x82) { lossy.add(`wave synth effect ${ws.effect}`); return undefined; }
  // DIV_WS_FADE: each full pass (speed + 1 steps) writes wave1 + ((wave2 - wave1) * stage) >> 9, stage += 1 + param1 per wrap.
  const w1 = waveLevels(waves[ws.wave1]), w2 = waveLevels(waves[ws.wave2]);
  const out = [...w1];
  const frames: number[][] = [];
  let pos = 0, stage = 0, div = 0;
  for (let t = 0; t < 64; t++) {
    if (--div <= 0) {
      for (let i = 0; i <= ws.speed; i++) {
        out[pos] = w1[pos] + (((w2[pos] - w1[pos]) * stage) >> 9);
        if (++pos >= 32) { pos = 0; stage = Math.min(512, stage + 1 + ws.param1); }
      }
      div = ws.rateDivider;
    }
    frames.push([...out]);
    if (stage >= 512 && pos === 0 && frames.length > 1 && frames[frames.length - 2].join() === out.join()) break;
  }
  return frames;
}

/** CH3 volume 0-15 -> the hUGE C value whose driver quantisation (>=10, >=5, >0) lands on Furnace's gbVolMap step. */
function waveVol(v: number): number {
  return v >= 12 ? 15 : v >= 8 ? 9 : v >= 4 ? 4 : 0;
}

/** Furnace effect -> hUGE effect word, or undefined when it has no hUGE equivalent. */
function mapEffect(type: number, value: number, kind: Kind, jumpTarget: (order: number) => number, waveNo: (w: number) => number): number | undefined {
  const v = value & 0xff;
  switch (type) {
    case 0x00: return v === 0 ? undefined : v;
    case 0x01: return 0x100 | v;
    case 0x02: return 0x200 | v;
    case 0x03: return v === 0 ? undefined : 0x300 | v; // 0300 = portamento off: the note plays normally
    case 0x04: return 0x400 | v;
    case 0x0a: return 0xa00 | v;
    case 0x0b: { const t = jumpTarget(v); return t < 255 ? 0xb00 | (t + 1) : undefined; } // hUGE stores order + 1 in one byte
    case 0x0d: return 0xd00 | (Math.min(v, ROWS - 1) + 1); // hUGE stores row + 1
    case 0x09: case 0x0f: return 0xf00 | v;
    case 0xec: return 0xe00 | v;
    case 0xed: return 0x700 | v;
    case 0x12: return kind === 'duty' ? 0x900 | ((v & 3) << 6) : undefined;
    // gb.cpp: pan = (x ? left : 0) | (y ? right : 0), none -> both; driver fx_set_pan merges it per channel.
    case 0x08: return 0x800 | (((v >> 4 ? 0x10 : 0) | (v & 15 ? 1 : 0)) || 0x11);
    // 80xx linear pan: convertPanLinearToSplit(x, 8, 255) gives left > 0 unless x = FF, right > 0 unless x = 00
    case 0x80: return 0x800 | (v < 0xff ? 0x10 : 0) | (v > 0 ? 1 : 0);
    case 0x10: return kind === 'wave' ? 0x900 | waveNo(v) : undefined;
    default: return undefined;
  }
}

export function furnaceToHuge(m: FurnaceModule, subsong = 0): HugeSong {
  // Pass 1 without start-volume variants counts the plain instruments; the variants then get only the slots left over,
  // so they can never push a plain instrument past hUGE's 15 slots (that plays instrument 0, a wrong sound).
  const base = convert(m, subsong, { duty: 0, wave: 0, noise: 0 });
  const room: Record<Kind, number> = { duty: 15 - base.used.duty, wave: 15 - base.used.wave, noise: 15 - base.used.noise };
  return convert(m, subsong, room).song;
}

function convert(m: FurnaceModule, subsong: number, room: Record<Kind, number>): { song: HugeSong; used: Record<Kind, number> } {
  const lossy = new Lossy();
  const s = m.subsongs[subsong];
  if (!s) throw new Error(`subsong ${subsong} missing`);
  // Tick rate: VBlank when it is the Furnace GB default, else the timer at 4096 / (256 - TMA) Hz (16-4096 Hz).
  const timerTma = Math.abs(s.hz - VBLANK_HZ) <= 0.5 ? 0 : 256 - Math.min(255, Math.max(1, Math.round(4096 / s.hz)));
  if (timerTma && Math.abs(4096 / (256 - timerTma) - s.hz) > 0.5) lossy.add(`tick rate ${s.hz} Hz played at ${(4096 / (256 - timerTma)).toFixed(2)} Hz`);
  const speeds = s.speedPattern?.length ? s.speedPattern : [s.speed1, s.speed2];
  if (speeds.length > 2) lossy.add(`speed pattern of ${speeds.length} steps (first two kept)`);
  const speedAlt = speeds[1] !== undefined && speeds[1] !== speeds[0] ? Math.min(255, Math.max(1, speeds[1])) : 0;
  if (m.subsongs.length > 1) lossy.add('other subsongs (only one exported)');
  const cellAt = (ch: number, o: number, r: number): FurnacePatternCell | undefined => m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o]}`)?.rows[r];

  // Pass 1: order lengths (a 0B/0D in any channel ends the order) and hUGE order starts.
  const orderLen: number[] = [];
  for (let o = 0; o < s.ordersLen; o++) {
    let len = s.patLen;
    for (let r = 0; r < s.patLen && len === s.patLen; r++) {
      for (let ch = 0; ch < 4; ch++) if (cellAt(ch, o, r)?.effects.some((e) => e.type === 0x0b || e.type === 0x0d)) len = r + 1;
    }
    orderLen.push(len);
  }
  const orderStart: number[] = [];
  let hOrders = 0;
  for (const len of orderLen) { orderStart.push(hOrders); hOrders += Math.ceil(len / ROWS); }

  // Instruments per kind, in order of first use (hUGE numbers 1-15).
  const insMap: Record<Kind, Map<number, number>> = { duty: new Map(), wave: new Map(), noise: new Map() };
  const variants: Record<Kind, number> = { duty: 0, wave: 0, noise: 0 };
  const insNo = (kind: Kind, i: number, plain = i): number => {
    const map = insMap[kind];
    if (!map.has(i) && i >= VOL_STEP) {
      if (variants[kind] >= room[kind]) { lossy.add('volume column beside an effect (no free instrument slot for a start-volume variant)'); return insNo(kind, plain); }
      variants[kind]++;
    }
    if (!map.has(i)) { if (map.size >= 15) { lossy.add(`${kind} instruments past 15`); return 0; } map.set(i, map.size + 1); }
    return map.get(i)!;
  };

  const gbChip = m.systems.indexOf(0x04);
  const invert = !/invertWave=(false|0)\b/.test(m.chipFlags?.[Math.max(0, gbChip)] ?? '');
  // hUGE wave slots, deduplicated by wave RAM bytes (file wavetables and wave synth frames share them).
  const waveSlots: number[][] = [];
  const waveKey = new Map<string, number>();
  const waveSlot = (bytes: number[]): number => {
    const k = bytes.join();
    if (waveKey.has(k)) return waveKey.get(k)!;
    if (waveSlots.length < 16) { waveKey.set(k, waveSlots.push(bytes) - 1); return waveSlots.length - 1; }
    // All 16 slots taken: play the closest wave (sum of nibble distances).
    lossy.add('wavetables past 16 (closest slot played)');
    const dist = (w: number[]) => w.reduce((d, x, i) => d + Math.abs((x >> 4) - (bytes[i] >> 4)) + Math.abs((x & 15) - (bytes[i] & 15)), 0);
    return waveSlots.reduce((best, w, i) => (dist(w) < dist(waveSlots[best]) ? i : best), 0);
  };
  const waveNo = (w: number): number => waveSlot(packWave(waveLevels(m.wavetables[w]), invert));

  // Pass 2: cells, 64-row chunks, deduplicated per pattern bytes.
  const patterns: number[][] = [];
  const patKey = new Map<string, number>();
  const orderLists: number[][] = [[], [], [], []];
  const lastIns = [-1, -1, -1, -1];
  // Noise width (Furnace chan.duty, NR43 bit 3): set by 11xx, kept across notes, set by a duty macro on note start.
  // hUGE has no such effect, so a noise instrument is exported once per width (key = Furnace index + NOISE_SHORT).
  const noiseDuty = [0, 0, 0, 0];
  const lastNote = [-1, -1, -1, -1]; // hUGE note per channel, for E1xy / E2xy targets
  let sweep = 0; // Furnace chan[0].sweep (NR10 shadow): 13xx sets time and shift, 14xx the direction bit
  const fine = [0x80, 0x80, 0x80, 0x80]; // E5xx per channel: one that keeps the current pitch is a no-op
  for (let o = 0; o < s.ordersLen; o++) {
    for (let c0 = 0; c0 < orderLen[o]; c0 += ROWS) {
      const rows = Math.min(ROWS, orderLen[o] - c0);
      const chunk: number[][] = [[], [], [], []];
      const fxFree: boolean[][] = [[], [], [], []];
      const spill: Array<{ r: number; ch: number; lr: number }> = [];
      for (let ch = 0; ch < 4; ch++) {
        const kind = KIND[ch];
        for (let r = 0; r < ROWS; r++) {
          const cell = r < rows ? cellAt(ch, o, c0 + r) : undefined;
          let note = NO_NOTE, instr = 0, effect = -1, baseKey = -1, plainRepeat = false;
          if (cell) {
            const nv = convertFurnaceNoteValue(cell);
            if (nv === 253 || nv === 254) effect = 0xe00; // note off / release -> note cut now
            else if (nv === 255) lossy.add('macro release');
            else if (nv >= 0) {
              // Noise: gb.cpp NR43 = noiseTable[note - 60] and hUGE get_note_poly(n) equals noiseTable[n + 5],
              // so the noise note sits 19 semitones above the tone mapping.
              const hn = nv - NOTE_OFFSET + (kind === 'noise' ? 19 : 0);
              if (hn < 0 || hn > 71) lossy.add('note outside hUGE range C-2..B-7 (clamped)');
              note = Math.max(0, Math.min(71, hn));
            }
            // E1xy / E2xy (playback.cpp): porta to note +- y at speed x*4, the 03xx units -> hUGE 3xx with that note.
            // With a note in the same row Furnace plays the note first and slides on from it; hUGE cannot (one note, one effect).
            const slide = cell.effects.find((e) => (e.type === 0xe1 || e.type === 0xe2) && (e.value & 0xf0) && (e.value & 0x0f));
            if (slide && kind !== 'noise') {
              if (note !== NO_NOTE || lastNote[ch] < 0) lossy.add('E1xy/E2xy note slide on a row with a note');
              else { note = Math.max(0, Math.min(71, lastNote[ch] + (slide.type === 0xe1 ? 1 : -1) * (slide.value & 15))); effect = 0x300 | ((slide.value >> 4) * 4); }
            }
            if (note !== NO_NOTE) lastNote[ch] = note;
            // Furnace keeps duty (12xx) and the channel volume when the same instrument plays again; a hUGE instrument
            // reload resets both, so a repeat of a macro-less instrument plays as instrument 0 (no reload).
            const ci = cell.instrument >= 0 || kind !== 'duty' ? cell.instrument : lastIns[ch];
            if (kind === 'noise') {
              const dm = ci >= 0 && note !== NO_NOTE ? macro(m.instruments[ci], MACRO_DUTY) : undefined;
              if (dm) noiseDuty[ch] = dm.data[0];
              for (const e of cell.effects) if (e.type === 0x11) noiseDuty[ch] = e.value & 0xff;
            }
            if (ci >= 0 && note !== NO_NOTE) {
              const plain = !m.instruments[ci]?.macros.some((x) => x.length > 0);
              baseKey = kind === 'noise' && noiseDuty[ch] ? ci + NOISE_SHORT : ci;
              plainRepeat = kind === 'duty' && plain && ci === lastIns[ch];
              instr = plainRepeat ? 0 : insNo(kind, baseKey);
              lastIns[ch] = ci;
            }
            const fxs = cell.effects.filter((e) => e.type >= 0 && e !== slide);
            let pan = -1;
            for (const e of fxs) {
              if (e.type === 0x11 && kind === 'noise') continue; // handled as the noise width above
              if (e.type === 0xe5) { const same = (e.value & 0xff) === fine[ch]; fine[ch] = e.value & 0xff; if (same) continue; }
              // gb.cpp GB_SWEEP_TIME / GB_SWEEP_DIR (channel 1 only) write NR10 at once; hUGE 6xy runs the NR10 routine below with C = xy.
              let h: number | undefined;
              if ((e.type === 0x13 || e.type === 0x14) && ch === 0) {
                sweep = e.type === 0x13 ? (sweep & 8) | (e.value & 0x77) : (sweep & 0xf7) | (e.value & 1 ? 8 : 0);
                h = 0x600 | sweep;
              } else h = mapEffect(e.type, e.value, kind, (ord) => orderStart[ord] ?? 0, waveNo);
              if (h === undefined) { if (!((e.type === 0 || e.type === 3) && (e.value & 0xff) === 0)) lossy.add(`effect ${e.type.toString(16).padStart(2, '0').toUpperCase()}${FX_NAMES[e.type] ? ` (${FX_NAMES[e.type]})` : ''}`); continue; }
              if ((h & 0xf00) === 0x800) pan = h;
              else if (effect < 0) effect = h; else lossy.add('second effect in one cell (hUGE has one effect column)');
            }
            if (cell.volume >= 0) {
              if (effect < 0) effect = 0xc00 | (kind === 'wave' ? waveVol(cell.volume & 15) : cell.volume & 15);
              else if (baseKey >= 0 && !macro(m.instruments[ci], MACRO_VOL) && (effect & 0xf00) !== 0x300) {
                // A note's volume rides in a start-volume variant of its instrument, which frees the Cxy slot for the effect.
                // A repeat of a macro-less duty instrument kept Furnace's 12xx duty; the reload resets it.
                if (plainRepeat) lossy.add('volume column beside an effect on an instrument repeat (duty reset)');
                instr = insNo(kind, baseKey + VOL_STEP * ((kind === 'wave' ? waveVol(cell.volume & 15) : cell.volume & 15) + 1), baseKey);
              } else lossy.add('volume column beside an effect');
            }
            // A pan in a busy cell moves to a free slot of the row as a channel-pair pan (driver fx_set_pan param bit 7).
            if (pan >= 0) { if (effect < 0) effect = pan; else spill.push({ r, ch, lr: (pan & 0x10 ? 2 : 0) | (pan & 1) }); }
          }
          if (cell && cell.instrument < 0 && (effect & 0xf00) === 0x300) instr = 0; // portamento keeps the old instrument, no reload
          fxFree[ch].push(effect < 0);
          chunk[ch].push(...dn(note, instr, Math.max(0, effect)));
        }
      }
      if (rows < ROWS) {
        const last = rows - 1;
        const ch = [0, 1, 2, 3].find((c) => fxFree[c][last]);
        if (ch === undefined) lossy.add('short pattern end with every effect slot used (plays to row 64)');
        else { chunk[ch][last * 3 + 1] = (chunk[ch][last * 3 + 1] & 0xf0) | 0x0d; chunk[ch][last * 3 + 2] = 0x01; fxFree[ch][last] = false; } // D01 = break to row 0
      }
      // Pair param: bit 7 set, bit 6 = pair (CH1+2 / CH3+4), bits 5-4 = changed channels, bits 3-2 / 1-0 = L/R of each.
      const pairs = new Map<number, number>();
      for (const { r, ch, lr } of spill) {
        const k = r * 2 + (ch >> 1), second = ch & 1;
        pairs.set(k, (pairs.get(k) ?? 0x80 | ((ch >> 1) << 6)) | (0x10 << second) | (lr << (second ? 0 : 2)));
      }
      for (const [k, param] of pairs) {
        const r = k >> 1, ch = [0, 1, 2, 3].find((c) => fxFree[c][r]);
        if (ch === undefined) { lossy.add('pan beside another effect with every effect slot of the row used'); continue; }
        chunk[ch][r * 3 + 1] = (chunk[ch][r * 3 + 1] & 0xf0) | 0x08; chunk[ch][r * 3 + 2] = param; fxFree[ch][r] = false;
      }
      for (let ch = 0; ch < 4; ch++) {
        const key = chunk[ch].join(',');
        let idx = patKey.get(key);
        if (idx === undefined) { idx = patterns.length; patterns.push(chunk[ch]); patKey.set(key, idx); }
        orderLists[ch].push(idx);
      }
    }
  }
  // The vendored hUGEDriver keeps order_cnt and current_order as 16-bit offsets; only Bxx targets stay below 255.

  // Instruments and tables.
  const tables: number[][] = [];
  const instrBytes: Record<Kind, number[][]> = { duty: [], wave: [], noise: [] };
  const tableRefs: Array<{ kind: Kind; slot: number; table: number }> = [];
  for (const kind of ['duty', 'wave', 'noise'] as Kind[]) {
    for (const [key, hi] of insMap[kind]) {
      const fi = key % NOISE_SHORT, short = key % VOL_STEP >= NOISE_SHORT;
      const startVol = key >= VOL_STEP ? Math.floor(key / VOL_STEP) - 1 : -1;
      const ins = m.instruments[fi];
      if (!ins) continue;
      const { len, enable } = lengthBits(ins);
      const high = 0x80 | (enable ? 0x40 : 0);
      const synth = kind === 'wave' ? waveSynthFrames(ins, m.wavetables, lossy)?.map((f) => waveSlot(packWave(f, invert))) : undefined;
      const table = buildTable(ins, kind, lossy, waveNo, synth);
      if (table) tableRefs.push({ kind, slot: hi - 1, table: tables.push(table) - 1 });
      const duty0 = macro(ins, MACRO_DUTY)?.data[0] ?? 2;
      if (kind === 'duty') instrBytes.duty[hi - 1] = [0x00, ((duty0 & 3) << 6) | len, startVol >= 0 ? (startVol << 4) | (envelope(ins, lossy) & 15) : envelope(ins, lossy), 0, 0, high];
      else if (kind === 'wave') instrBytes.wave[hi - 1] = [len, startVol < 0 ? 0x20 : startVol >= 10 ? 0x20 : startVol >= 5 ? 0x40 : startVol > 0 ? 0x60 : 0, synth?.[0] ?? waveNo(macro(ins, MACRO_WAVE)?.data[0] ?? 0), 0, 0, high];
      else instrBytes.noise[hi - 1] = [startVol >= 0 ? (startVol << 4) | (envelope(ins, lossy) & 15) : envelope(ins, lossy), 0, 0, (short ? 0x80 : 0) | (enable ? 0x40 : 0) | (len & 0x3f), 0, 0];
    }
  }

  // Layout.
  const out: number[] = [];
  const w16 = (at: number, v: number) => { out[at] = v & 0xff; out[at + 1] = (v >> 8) & 0xff; };
  out.length = 24; // 23 descriptor bytes + the alternate speed
  out.fill(0);
  out[0] = Math.max(1, speeds[0]);
  out[23] = speedAlt;
  const here = () => BASE + out.length;
  w16(1, here()); out.push((hOrders * 2) & 0xff, (hOrders * 2) >> 8);
  const orderAt: number[] = [];
  for (let ch = 0; ch < 4; ch++) { w16(3 + ch * 2, here()); orderAt.push(out.length); out.push(...new Array(hOrders * 2).fill(0)); }
  w16(21, here());
  const bankAt = out.length;
  out.push(...new Array(hOrders * 2).fill(0));
  const insAt: Record<Kind, number> = { duty: 0, wave: 0, noise: 0 };
  (['duty', 'wave', 'noise'] as Kind[]).forEach((kind, k) => {
    w16(11 + k * 2, here()); insAt[kind] = out.length;
    for (let i = 0; i < 15; i++) out.push(...(instrBytes[kind][i] ?? [0, 0, 0, 0, 0, 0]));
  });
  // Routines: effect 6xy picks routine y, but C holds the whole xy byte, so all 16 share one routine that
  // writes C to NR10 on tick 0 (ret nz; ld a,c; ldh [$10],a; ret). Sweep effects 13/14 use it.
  w16(17, here());
  const retAddr = here() + 32;
  for (let i = 0; i < 16; i++) out.push(retAddr & 0xff, retAddr >> 8);
  out.push(0xc0, 0x79, 0xe0, 0x10, 0xc9);
  w16(19, here());
  for (let i = 0; i < Math.max(1, waveSlots.length); i++) out.push(...(waveSlots[i] ?? new Array(16).fill(0)));
  for (const t of tableRefs) {
    const at = insAt[t.kind] + t.slot * 6 + (t.kind === 'noise' ? 1 : 3);
    w16(at, here()); out.push(...tables[t.table]);
  }
  // Patterns: contiguous up to $7FFF with bank 1; when an order's patterns do not fit, the next bank opens at
  // $4000. A pattern wholly below $4000 is seen from every bank; one in an older bank is copied again.
  const commonEnd = here();
  const PAT = ROWS * 3;
  let bank = 1;
  const winEnd = () => (bank + 1) * 0x4000 - BASE; // blob length where the current bank's window ends
  const placed = new Map<number, { at: number; bank: number }>();
  const seen = (p: number) => { const x = placed.get(p); return x && (x.at + PAT <= 0x4000 || x.bank === bank) ? x.at : undefined; };
  for (let o = 0; o < hOrders; o++) {
    const ps = orderLists.map((l) => l[o]);
    const need = () => [...new Set(ps.filter((p) => seen(p) === undefined))];
    if (out.length + need().length * PAT > winEnd()) {
      out.push(...new Array(winEnd() - out.length).fill(0xff));
      bank++;
      if (bank > 255) throw new Error('song needs more than 255 ROM banks (4 MiB)');
    }
    for (const p of need()) { placed.set(p, { at: BASE + out.length - (bank - 1) * 0x4000, bank }); out.push(...patterns[p]); }
    ps.forEach((p, ch) => w16(orderAt[ch] + o * 2, seen(p)!));
    out[bankAt + o * 2] = bank;
  }
  if (bank > 1 && commonEnd > 0x4000) throw new Error(`song tables ${commonEnd - BASE} bytes exceed the 8 KiB bank 0 area a banked song needs`);
  return { song: { blob: Uint8Array.from(out), lossy: lossy.list(), orders: hOrders, screen: { title: m.name, author: m.author, timerTma } }, used: { duty: insMap.duty.size, wave: insMap.wave.size, noise: insMap.noise.size } };
}

/** Patch the song into the player ROM (grown to the banks the song needs, MBC5 ROM size byte) and recompute both checksums. */
export function buildHugeRom(player: Uint8Array, meta: HugePlayerMeta, blob: Uint8Array, screen: HugeScreen): Uint8Array {
  let size = player.length;
  while (size < meta.songOffset + blob.length) size *= 2;
  const rom = new Uint8Array(size).fill(0xff);
  rom.set(player);
  rom.fill(0xff, meta.songOffset, meta.songOffset + meta.songCapacity);
  rom.set(blob, meta.songOffset);
  rom[0x148] = Math.log2(size / 0x8000);
  let hsum = 0;
  for (let i = 0x134; i <= 0x14c; i++) hsum = (hsum - rom[i] - 1) & 0xff;
  rom[0x14d] = hsum;
  rom[meta.rateOffset] = screen.timerTma;
  rom.set(nesScreenText(screen.title, 11), meta.titleOffset);
  rom.set(nesScreenText(screen.author, 17), meta.authorOffset);
  rom.set(nesScrollText(screen.title, { author: screen.author }, 256), meta.scrollOffset);
  let sum = 0;
  for (let i = 0; i < rom.length; i++) if (i !== 0x14e && i !== 0x14f) sum += rom[i];
  rom[0x14e] = (sum >> 8) & 0xff;
  rom[0x14f] = sum & 0xff;
  return rom;
}
