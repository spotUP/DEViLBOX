/**
 * Game Boy native player, hUGEDriver route (plan 2026-11-17-gameboy-native-player, Phase 2h-5h):
 * Furnace GB song -> hUGEDriver song data, patched into the dev-time assembled player ROM
 * (`public/gb/huge-player.gb`, built by `tools/build-gb-player.sh`).
 *
 * hUGEDriver is a note driver, not a register stream, so the conversion is lossy. Every Furnace
 * item that does not survive is counted in `lossy` (shown to the user and listed in the plan).
 *
 * Song layout (third-party/hugedriver/hUGEDriver.asm, `hUGE_init`): descriptor
 * `db tempo; dw order_cnt, order1..4, duty_instruments, wave_instruments, noise_instruments, routines, waves`,
 * all pointers absolute in bank 1 ($4000). Patterns are 64 rows x 3 bytes (`dn` macro of hUGE.inc).
 */
import type { FurnaceModule, FurnaceWavetable } from '../../import/formats/FurnaceSongParser';
import type { FurnaceInstrument, FurnaceMacro } from '../../import/formats/furnace/FurnaceInstrumentParser';
import type { FurnacePatternCell } from '../../import/formats/furnace/FurnacePatternParser';
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';

export interface HugePlayerMeta { songAddress: number; songOffset: number; songCapacity: number; tickAddress: number; sourceHash: string }

export interface HugeSong {
  blob: Uint8Array;
  /** One line per lossy Furnace item with its count, e.g. "effect 08 (panning): 12 cells". */
  lossy: string[];
  /** hUGE orders after splitting Furnace orders into 64-row chunks. */
  orders: number;
}

const ROWS = 64;
const NO_NOTE = 90;
/** Song address in huge-player.gb (tiny 32 KiB link, song at $2000-$7FFF); the gbHugeSong test checks it against huge-player.json. */
export const HUGE_SONG_BASE = 0x2000;
const BASE = HUGE_SONG_BASE;
/** hUGE note 0 is C_3 in hUGE naming = 65.4 Hz = Furnace C-2 (flat value 24). */
const NOTE_OFFSET = 24;
const VBLANK_HZ = 59.7275;
const MACRO_VOL = 0, MACRO_ARP = 1, MACRO_DUTY = 2, MACRO_WAVE = 3;
const MACRO_NAMES: Record<number, string> = { 4: 'pitch', 5: 'ex1', 6: 'ex2', 7: 'ex3', 12: 'pan left', 13: 'pan right', 14: 'phase reset' };
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
function buildTable(ins: FurnaceInstrument, kind: Kind, lossy: Lossy): number[] | undefined {
  const arp = macro(ins, MACRO_ARP);
  const vol = kind === 'wave' ? undefined : macro(ins, MACRO_VOL);
  const duty = kind === 'duty' ? macro(ins, MACRO_DUTY) : undefined;
  const fx = vol ?? duty;
  if (vol && duty && duty.length > 1) lossy.add('duty macro beside a volume macro (one table effect column)');
  if (kind === 'wave' && macro(ins, MACRO_VOL)) lossy.add('wave channel volume macro');
  if (kind === 'wave' && (macro(ins, MACRO_WAVE)?.length ?? 0) > 1) lossy.add('wave macro (wave changes per tick)');
  for (const m of ins.macros) if (MACRO_NAMES[m.code] && m.length > 0) lossy.add(`${MACRO_NAMES[m.code]} macro`);
  const used = [arp, fx].filter((m): m is FurnaceMacro => !!m);
  if (used.length === 0 || (used.every((m) => m.length === 1) && !arp)) return undefined;
  for (const m of used) if (m.delay > 0) lossy.add('macro delay');
  // Expand macro speed (ticks per step) into rows.
  const expand = (m: FurnaceMacro | undefined) => (m ? m.data.slice(0, m.length).flatMap((v) => Array(Math.max(1, m.speed)).fill(v) as number[]) : []);
  const loopOf = (m: FurnaceMacro | undefined) => (m && m.loop < m.length && m.loop !== 255 ? m.loop * Math.max(1, m.speed) : -1);
  const arpRows = expand(arp), fxRows = expand(fx);
  let len = Math.max(arpRows.length, fxRows.length);
  // Loop point: the longer macro's loop wins (the shorter one holds its last value).
  const longer = arpRows.length >= fxRows.length ? arp : fx;
  let loop = loopOf(longer);
  if (len > 31) { lossy.add('macro longer than 31 table rows'); len = 31; if (loop >= len) loop = -1; }
  const out: number[] = [];
  let prevFx = -1;
  // Extra row `len` is itself one tick. With a loop it replays the loop row and jumps on to the row
  // after it, so the loop period stays len - loop ticks and row 0 (the driver's key-on row, where
  // the volume latches with a retrigger) never runs again. Without a loop it holds the last values.
  for (let r = 0; r <= len; r++) {
    const extra = r === len;
    const looped = extra && loop >= 0;
    const i = looped ? loop : Math.min(r, len - 1);
    let note = NO_NOTE;
    if (arp) {
      const a = arpRows[Math.min(i, arpRows.length - 1)];
      if (a & 0x40000000) { lossy.add('fixed-note arpeggio macro'); } else note = Math.max(0, Math.min(71, 36 + (a | 0)));
    }
    let effect = 0;
    if (fx && (!extra || looped)) {
      const v = fxRows[Math.min(i, fxRows.length - 1)];
      if (v !== prevFx) effect = fx === vol ? 0xc00 | (v & 15) : 0x900 | ((v & 3) << 6);
      prevFx = v;
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

function waveTo4bit(w: FurnaceWavetable): number[] {
  const out: number[] = [];
  const max = Math.max(1, w.height - 1);
  for (let i = 0; i < 32; i++) {
    const v = w.data[Math.floor((i * w.width) / 32)] ?? 0;
    out.push(Math.max(0, Math.min(15, Math.round((v * 15) / max))));
  }
  const bytes: number[] = [];
  for (let i = 0; i < 32; i += 2) bytes.push((out[i] << 4) | out[i + 1]);
  return bytes;
}

/** Furnace effect -> hUGE effect word, or undefined when it has no hUGE equivalent. */
function mapEffect(type: number, value: number, kind: Kind, jumpTarget: (order: number) => number): number | undefined {
  const v = value & 0xff;
  switch (type) {
    case 0x00: return v === 0 ? undefined : v;
    case 0x01: return 0x100 | v;
    case 0x02: return 0x200 | v;
    case 0x03: return 0x300 | v;
    case 0x04: return 0x400 | v;
    case 0x0a: return 0xa00 | v;
    case 0x0b: return 0xb00 | (jumpTarget(v) + 1); // hUGE stores order + 1
    case 0x0d: return 0xd00 | (Math.min(v, ROWS - 1) + 1); // hUGE stores row + 1
    case 0x09: case 0x0f: return 0xf00 | v;
    case 0xec: return 0xe00 | v;
    case 0xed: return 0x700 | v;
    case 0x12: return kind === 'duty' ? 0x900 | ((v & 3) << 6) : undefined;
    default: return undefined;
  }
}

export function furnaceToHuge(m: FurnaceModule, subsong = 0): HugeSong {
  const lossy = new Lossy();
  const s = m.subsongs[subsong];
  if (!s) throw new Error(`subsong ${subsong} missing`);
  if (Math.abs(s.hz - VBLANK_HZ) > 0.5) lossy.add(`tick rate ${s.hz} Hz played at ${VBLANK_HZ} Hz VBlank`);
  if (s.speed2 !== s.speed1) lossy.add(`speed 2 (${s.speed2}) and groove: played at speed 1 (${s.speed1})`);
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
  const insNo = (kind: Kind, i: number): number => {
    const map = insMap[kind];
    if (!map.has(i)) { if (map.size >= 15) { lossy.add(`${kind} instruments past 15`); return 0; } map.set(i, map.size + 1); }
    return map.get(i)!;
  };

  // Pass 2: cells, 64-row chunks, deduplicated per pattern bytes.
  const patterns: number[][] = [];
  const patKey = new Map<string, number>();
  const orderLists: number[][] = [[], [], [], []];
  for (let o = 0; o < s.ordersLen; o++) {
    for (let c0 = 0; c0 < orderLen[o]; c0 += ROWS) {
      const rows = Math.min(ROWS, orderLen[o] - c0);
      const chunk: number[][] = [[], [], [], []];
      const fxFree: boolean[][] = [[], [], [], []];
      for (let ch = 0; ch < 4; ch++) {
        const kind = KIND[ch];
        for (let r = 0; r < ROWS; r++) {
          const cell = r < rows ? cellAt(ch, o, c0 + r) : undefined;
          let note = NO_NOTE, instr = 0, effect = -1;
          if (cell) {
            const nv = convertFurnaceNoteValue(cell);
            if (nv === 253 || nv === 254) effect = 0xe00; // note off / release -> note cut now
            else if (nv === 255) lossy.add('macro release');
            else if (nv >= 0) {
              const hn = nv - NOTE_OFFSET;
              if (hn < 0 || hn > 71) lossy.add('note outside hUGE range C-2..B-7 (clamped)');
              note = Math.max(0, Math.min(71, hn));
            }
            if (cell.instrument >= 0 && note !== NO_NOTE) instr = insNo(kind, cell.instrument);
            const fxs = cell.effects.filter((e) => e.type >= 0);
            for (const e of fxs) {
              const h = mapEffect(e.type, e.value, kind, (ord) => orderStart[ord] ?? 0);
              if (h === undefined) { if (!(e.type === 0 && (e.value & 0xff) === 0)) lossy.add(`effect ${e.type.toString(16).padStart(2, '0').toUpperCase()}${FX_NAMES[e.type] ? ` (${FX_NAMES[e.type]})` : ''}`); continue; }
              if (effect < 0) effect = h; else lossy.add('second effect in one cell (hUGE has one effect column)');
            }
            if (cell.volume >= 0) {
              if (kind === 'wave') lossy.add('wave channel volume column');
              else if (effect < 0) effect = 0xc00 | (cell.volume & 15);
              else lossy.add('volume column beside an effect');
            }
          }
          fxFree[ch].push(effect < 0);
          chunk[ch].push(...dn(note, instr, Math.max(0, effect)));
        }
      }
      if (rows < ROWS) {
        const last = rows - 1;
        const ch = [0, 1, 2, 3].find((c) => fxFree[c][last]);
        if (ch === undefined) lossy.add('short pattern end with every effect slot used (plays to row 64)');
        else { chunk[ch][last * 3 + 1] = (chunk[ch][last * 3 + 1] & 0xf0) | 0x0d; chunk[ch][last * 3 + 2] = 0x01; } // D01 = break to row 0
      }
      for (let ch = 0; ch < 4; ch++) {
        const key = chunk[ch].join(',');
        let idx = patKey.get(key);
        if (idx === undefined) { idx = patterns.length; patterns.push(chunk[ch]); patKey.set(key, idx); }
        orderLists[ch].push(idx);
      }
    }
  }
  if (hOrders * 2 > 255) throw new Error(`song has ${hOrders} hUGE orders; hUGEDriver holds at most 127`);

  // Instruments and tables.
  const tables: number[][] = [];
  const instrBytes: Record<Kind, number[][]> = { duty: [], wave: [], noise: [] };
  const waveIdx = new Map<number, number>();
  const waveNo = (w: number): number => {
    if (!waveIdx.has(w)) { if (waveIdx.size >= 16) { lossy.add('wavetables past 16'); return 0; } waveIdx.set(w, waveIdx.size); }
    return waveIdx.get(w)!;
  };
  const tableRefs: Array<{ kind: Kind; slot: number; table: number }> = [];
  for (const kind of ['duty', 'wave', 'noise'] as Kind[]) {
    for (const [fi, hi] of insMap[kind]) {
      const ins = m.instruments[fi];
      if (!ins) continue;
      const { len, enable } = lengthBits(ins);
      const high = 0x80 | (enable ? 0x40 : 0);
      const table = buildTable(ins, kind, lossy);
      if (table) tableRefs.push({ kind, slot: hi - 1, table: tables.push(table) - 1 });
      const duty0 = macro(ins, MACRO_DUTY)?.data[0] ?? 2;
      if (kind === 'duty') instrBytes.duty[hi - 1] = [0x00, ((duty0 & 3) << 6) | len, envelope(ins, lossy), 0, 0, high];
      else if (kind === 'wave') instrBytes.wave[hi - 1] = [len, 0x20, waveNo(macro(ins, MACRO_WAVE)?.data[0] ?? 0), 0, 0, high];
      else instrBytes.noise[hi - 1] = [envelope(ins, lossy), 0, 0, (duty0 & 1 ? 0x80 : 0) | (enable ? 0x40 : 0) | (len & 0x3f), 0, 0];
    }
  }

  // Layout.
  const out: number[] = [];
  const w16 = (at: number, v: number) => { out[at] = v & 0xff; out[at + 1] = (v >> 8) & 0xff; };
  out.length = 21;
  out.fill(0);
  out[0] = Math.max(1, s.speed1);
  const here = () => BASE + out.length;
  w16(1, here()); out.push(hOrders * 2);
  const orderAt: number[] = [];
  for (let ch = 0; ch < 4; ch++) { w16(3 + ch * 2, here()); orderAt.push(out.length); out.push(...new Array(hOrders * 2).fill(0)); }
  const insAt: Record<Kind, number> = { duty: 0, wave: 0, noise: 0 };
  (['duty', 'wave', 'noise'] as Kind[]).forEach((kind, k) => {
    w16(11 + k * 2, here()); insAt[kind] = out.length;
    for (let i = 0; i < 15; i++) out.push(...(instrBytes[kind][i] ?? [0, 0, 0, 0, 0, 0]));
  });
  // Routines: never emitted (effect 6); all 16 point at one `ret`.
  w16(17, here());
  const retAddr = here() + 32;
  for (let i = 0; i < 16; i++) out.push(retAddr & 0xff, retAddr >> 8);
  out.push(0xc9);
  w16(19, here());
  const waveList = [...waveIdx.keys()];
  for (let i = 0; i < Math.max(1, waveList.length); i++) out.push(...(m.wavetables[waveList[i]] ? waveTo4bit(m.wavetables[waveList[i]]) : new Array(16).fill(0)));
  for (const t of tableRefs) {
    const at = insAt[t.kind] + t.slot * 6 + (t.kind === 'noise' ? 1 : 3);
    w16(at, here()); out.push(...tables[t.table]);
  }
  const patAt = patterns.map((p) => { const a = here(); out.push(...p); return a; });
  for (let ch = 0; ch < 4; ch++) orderLists[ch].forEach((p, i) => w16(orderAt[ch] + i * 2, patAt[p]));
  if (out.length > 0x6000) throw new Error(`song data ${out.length} bytes exceeds the 24 KiB song area`); // shortcut: no MBC banking, add it when a real song needs more
  return { blob: Uint8Array.from(out), lossy: lossy.list(), orders: hOrders };
}

/** Patch the song into the player ROM and recompute the global checksum (header checksum is unchanged). */
export function buildHugeRom(player: Uint8Array, meta: HugePlayerMeta, blob: Uint8Array): Uint8Array {
  if (blob.length > meta.songCapacity) throw new Error(`song ${blob.length} bytes exceeds ${meta.songCapacity}`);
  const rom = player.slice();
  rom.fill(0xff, meta.songOffset, meta.songOffset + meta.songCapacity);
  rom.set(blob, meta.songOffset);
  let sum = 0;
  for (let i = 0; i < rom.length; i++) if (i !== 0x14e && i !== 0x14f) sum += rom[i];
  rom[0x14e] = (sum >> 8) & 0xff;
  rom[0x14f] = sum & 0xff;
  return rom;
}
