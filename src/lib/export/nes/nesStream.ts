/**
 * NES native player stream: encoder and reference decoder (TypeScript decoder is a TEST ORACLE for the 6502 player,
 * not a playback path). Input is a NesCapture (nesCapture.ts); output is three region streams (NTSC, PAL, Dendy).
 *
 * Region stream:   u8 subsongCount | per subsong (7 bytes): u24 offset (from region start), u16 tick rate in 0.01 Hz,
 *                  u16 IRQ period in CPU cycles (0 = the song rate is the console frame rate, tick on NMI; see nesIrqPeriod) |
 *                  subsong streams (each aligned to bankSize when bankSize > 0).
 * Subsong stream:  dictionary, then tick records. Offsets inside a subsong (loop, bank n) are from its first byte.
 *   Dictionary:    u8 n | n x u16 entry offset (from dictionary start) | entries, each u8 length + tick record bytes.
 *   Tick header H: 0x00 empty tick | 0x01..0x7f chip mask (bit i = CHIP_ORDER[i]) followed by one chip block per set bit
 *                  | 0x80 END | 0x81 LOOP u24 | 0x82 EVENTS (prefix, a tick header follows) | 0x83 SET_BANK u8 (continue at
 *                  bank*bankSize) | 0xC0..0xFD dictionary entry H-0xC0 | 0xFE REPEAT u8 n empty ticks | 0xFF dictionary entry u8.
 *   Chip block:    items until 0xFF. Item h<0x80: write reg index h, value. 0x80 idx len vals: ascending run
 *                  (FDS wave RAM, N163 wave RAM, VRC7 patch). 0x81 idx len vals: same register len times (FDS $4088 table).
 *                  Writes keep capture order; order across chips is not kept (chips are independent).
 *   Events prefix: 0x82 u8 count, entries in capture order: byte0 = kind<<3 | chip (kind 0 timed PCM write, 1 control),
 *                  u16 offset (worklet samples from the tick start), then PCM: reg index, value | control: control|channel<<4,
 *                  u16 value. These are the sample-rate ($4011, VRC6 digital) and DAC/DPCM-bank bookkeeping events.
 *   Raw block:     0x84 chip a b u16 len, then len bytes written back to back to one register ($4011 nes, $9000 vrc6, $5011 mmc5)
 *                  by a cycle-counted loop of NES_RAW_FIXED + 5a + 7b CPU cycles per sample. Tick prefix (a tick header follows).
 *                  The player freezes everything else while it runs; blocks never cross a bank.
 *   Register index: nes addr-$4000, vrc6 (bank-$9)*4+(addr&3) over $9000/$A000/$B000, mmc5 addr-$5000, fds addr-$4040;
 *                  vrc7, n163, s5b store the register number itself. The player maps those to ports: VRC7 $9010 (reg) /
 *                  $9030 (data), N163 $F800 (address) / $4800 (data), 5B $C000 (reg) / $E000 (data).
 */
import { NES_CONTROL, type NesCapture, type NesChip, type NesEvent } from './nesCapture';

export const CHIP_ORDER: readonly NesChip[] = ['nes', 'vrc6', 'vrc7', 'fds', 'mmc5', 'n163', 's5b'];
export const NES_OP = { END: 0x80, LOOP: 0x81, EVENTS: 0x82, SET_BANK: 0x83, RAW: 0x84, DICT_BASE: 0xC0, REPEAT: 0xFE, DICT_LONG: 0xFF } as const;
export const NES_REGIONS = ['ntsc', 'pal', 'dendy'] as const;
export type NesRegion = typeof NES_REGIONS[number];
/** CPU clock (Hz) and frame rate (Hz) per console region. */
export const NES_REGION_TIMING: Record<NesRegion, { cpuHz: number; frameHz: number }> = {
  ntsc: { cpuHz: 1789772.7, frameHz: 60.0988 },
  pal: { cpuHz: 1662607, frameHz: 50.007 },
  dendy: { cpuHz: 1773447.5, frameHz: 50.007 },
};
/** Songs within this fraction of the frame rate tick on NMI (Furnace's 60/50 Hz is the console frame rate). */
const NMI_TOLERANCE = 0.005;
/** 0 = tick on NMI; else the cycle IRQ period (CPU cycles per tick) that reproduces the song rate in this region. */
export function nesIrqPeriod(region: NesRegion, rateHz: number): number {
  const { cpuHz, frameHz } = NES_REGION_TIMING[region];
  if (Math.abs(rateHz - frameHz) / frameHz <= NMI_TOLERANCE) return 0;
  const p = Math.round(cpuHz / rateHz);
  if (p < 1 || p > 0xffff) throw new Error(`nesStream: song rate ${rateHz} Hz is outside what a 16 bit cycle IRQ reaches in region ${region}`);
  return p;
}

export type NesTickEvent =
  | { kind: 'pcm'; chip: NesChip; offset: number; addr: number; value: number }
  | { kind: 'control'; chip: NesChip; offset: number; control: number; channel: number; value: number };
/** One cycle-counted sample block: `period` CPU cycles per sample, bytes written to the chip's sample register. */
export interface NesRawBlock { chip: NesChip; period: number; data: number[] }
export interface NesTick { writes: Partial<Record<NesChip, Array<[number, number]>>>; events: NesTickEvent[]; raws?: NesRawBlock[] }
/** CPU cycles per sample of the player's raw loop besides its two delay loops (5a + 7b). Measured in Mesen2 (see plan Phase 7). */
export const NES_RAW_FIXED = 30;
/** Raw loop sample register per chip (address, event register index). */
export const NES_RAW_REG: Partial<Record<NesChip, number>> = { nes: 0x4011, vrc6: 0x9000, mmc5: 0x5011 };
const RAW_MIN = 16;
function rawDelay(period: number): { a: number; b: number } {
  const n = period - NES_RAW_FIXED;
  for (let b = 1; b <= 255; b++) { const r = n - 7 * b; if (r >= 5 && r % 5 === 0 && r / 5 <= 255) return { a: r / 5, b }; }
  throw new Error(`nesStream: sample period ${period} cycles is outside the raw loop range`);
}
export interface NesEncodeOptions { loopTick?: number; bankSize?: number; region?: NesRegion }
export interface NesDecoded { tickRateCentiHz: number; irqPeriod: number; ticks: NesTick[]; loopTick?: number }

function regIndex(chip: NesChip, a: number): number {
  let i = -1;
  switch (chip) {
    case 'nes': i = a - 0x4000; if (i > 0x17) i = -1; break;
    case 'vrc6': { const b = (a >> 12) - 9; if (b >= 0 && b <= 2 && (a & 0xffc) === 0) i = b * 4 + (a & 3); break; }
    case 'mmc5': i = a - 0x5000; if (i > 0x15) i = -1; break;
    case 'fds': i = a - 0x4040; if (i > 0x4a) i = -1; break;
    default: i = a;
  }
  if (i < 0 || i > 0x7f) throw new Error(`nesStream: ${chip} address 0x${a.toString(16)} outside the chip register range`);
  return i;
}
function regAddr(chip: NesChip, i: number): number {
  switch (chip) {
    case 'nes': return 0x4000 + i;
    case 'vrc6': return 0x9000 + (i >> 2) * 0x1000 + (i & 3);
    case 'mmc5': return 0x5000 + i;
    case 'fds': return 0x4040 + i;
    default: return i;
  }
}

/** Pull runs of evenly spaced pcm writes out of the capture as raw blocks (placed at the run's first tick). */
function extractRaw(cap: NesCapture, cpuHz: number): { events: NesEvent[]; raws: Array<{ tick: number; block: NesRawBlock }> } {
  const taken = new Set<NesEvent>();
  const raws: Array<{ tick: number; block: NesRawBlock }> = [];
  for (const chip of Object.keys(NES_RAW_REG) as NesChip[]) {
    const pcm = cap.events.filter((e) => e.kind === 'pcm' && e.chip === chip && e.addr === NES_RAW_REG[chip]);
    for (let i = 0; i < pcm.length;) {
      let j = i + 1;
      const g0 = j < pcm.length ? pcm[j].sample - pcm[i].sample : 0;
      while (j < pcm.length && g0 > 0 && Math.abs(pcm[j].sample - pcm[j - 1].sample - g0) <= 1) j++;
      if (j - i >= RAW_MIN) {
        const period = Math.round(cpuHz * (pcm[j - 1].sample - pcm[i].sample) / ((j - i - 1) * cap.sampleRate));
        const tick = Math.max(0, Math.floor(pcm[i].sample * cap.tickRateHz / cap.sampleRate));
        raws.push({ tick, block: { chip, period, data: pcm.slice(i, j).map((e) => (e as { value: number }).value & 255) } });
        for (let k = i; k < j; k++) taken.add(pcm[k]);
        i = j;
      } else i++;
    }
  }
  return { events: cap.events.filter((e) => !taken.has(e)), raws };
}

/** Bucket the capture into driver ticks (tick = floor(sample * tickRate / sampleRate)). Shared by encoder and tests. */
export function nesCaptureToTicks(cap: NesCapture, region?: NesRegion): NesTick[] {
  const ticks: NesTick[] = [];
  const at = (t: number) => { while (ticks.length <= t) ticks.push({ writes: {}, events: [] }); return ticks[t]; };
  const { events, raws } = region ? extractRaw(cap, NES_REGION_TIMING[region].cpuHz) : { events: cap.events, raws: [] };
  for (const r of raws) (at(r.tick).raws ??= []).push(r.block);
  for (const e of events) {
    const t = Math.max(0, Math.floor(e.sample * cap.tickRateHz / cap.sampleRate));
    const offset = Math.max(0, e.sample - Math.ceil(t * cap.sampleRate / cap.tickRateHz));
    if (offset > 0xffff) throw new Error('nesStream: event offset exceeds 16 bits');
    const tk = at(t);
    if (e.kind === 'write') (tk.writes[e.chip] ??= []).push([e.addr, e.value]);
    else if (e.kind === 'pcm') tk.events.push({ kind: 'pcm', chip: e.chip, offset, addr: e.addr, value: e.value });
    else tk.events.push({ kind: 'control', chip: e.chip, offset, control: e.control, channel: e.channel, value: e.value });
  }
  return ticks;
}

function chipBlock(chip: NesChip, writes: ReadonlyArray<[number, number]>): number[] {
  const w = writes.map(([a, v]) => [regIndex(chip, a), v & 0xff]);
  const out: number[] = [];
  for (let i = 0; i < w.length;) {
    let up = 1, same = 1;
    while (i + up < w.length && up < 255 && w[i + up][0] === w[i][0] + up) up++;
    while (i + same < w.length && same < 255 && w[i + same][0] === w[i][0]) same++;
    const len = Math.max(up, same);
    if (len >= 4) {
      out.push(up >= same ? 0x80 : 0x81, w[i][0], len);
      for (let k = 0; k < len; k++) out.push(w[i + k][1]);
      i += len;
    } else { out.push(w[i][0], w[i][1]); i++; }
  }
  out.push(0xff);
  return out;
}

function tickRecord(t: NesTick): number[] {
  let mask = 0;
  const body: number[] = [];
  CHIP_ORDER.forEach((c, bit) => {
    const w = t.writes[c];
    if (w && w.length) { mask |= 1 << bit; body.push(...chipBlock(c, w)); }
  });
  return mask ? [mask, ...body] : [];
}

/** Raw blocks of one tick as separate prefixes, each cut to `room` data bytes (a bank minus its header). */
function rawChunks(t: NesTick, room: number): number[][] {
  const out: number[][] = [];
  for (const r of t.raws ?? []) {
    const { a, b } = rawDelay(r.period);
    for (let o = 0; o < r.data.length; o += room) {
      const d = r.data.slice(o, o + room);
      out.push([NES_OP.RAW, CHIP_ORDER.indexOf(r.chip), a, b, d.length & 255, d.length >> 8, ...d]);
    }
  }
  return out;
}

function eventBytes(evs: readonly NesTickEvent[]): number[] {
  if (!evs.length) return [];
  if (evs.length > 255) throw new Error('nesStream: more than 255 events in one tick');
  const out = [NES_OP.EVENTS, evs.length];
  for (const e of evs) {
    const c = CHIP_ORDER.indexOf(e.chip);
    if (e.kind === 'pcm') out.push(c, e.offset & 255, e.offset >> 8, regIndex(e.chip, e.addr), e.value & 255);
    else {
      if (e.control > 15 || e.channel > 15 || e.value < 0 || e.value > 0xffff) throw new Error('nesStream: control event out of range');
      out.push(8 | c, e.offset & 255, e.offset >> 8, e.control | e.channel << 4, e.value & 255, e.value >> 8);
    }
  }
  return out;
}

/** Static frame dictionary: records repeated often enough to beat their own table cost, most used first (short refs). */
function buildDictionary(records: ReadonlyArray<number[]>): number[][] {
  const count = new Map<string, { rec: number[]; n: number }>();
  for (const r of records) if (r.length > 2 && r.length < 256) { const k = r.join(','); const e = count.get(k); if (e) e.n++; else count.set(k, { rec: r, n: 1 }); }
  return [...count.values()]
    .filter((e) => e.n * (e.rec.length - 2) > e.rec.length + 3)
    .sort((a, b) => b.n * b.rec.length - a.n * a.rec.length)
    .slice(0, 255).sort((a, b) => b.n - a.n).map((e) => e.rec);
}

export function encodeNesSubsong(cap: NesCapture, opts: NesEncodeOptions = {}): Uint8Array {
  const ticks = nesCaptureToTicks(cap, opts.region);
  const records = ticks.map(tickRecord);
  const dict = buildDictionary(records);
  const dictIndex = new Map(dict.map((r, i) => [r.join(','), i]));
  const out: number[] = [dict.length];
  let off = 1 + 2 * dict.length;
  for (const r of dict) { out.push(off & 255, off >> 8); off += 1 + r.length; }
  for (const r of dict) out.push(r.length, ...r);
  const bank = opts.bankSize ?? 0;
  if (bank && out.length > bank - 16) throw new Error('nesStream: dictionary does not fit one bank');
  let loopPos = -1, pendingLoop = false, run = 0;
  const emit = (bytes: number[]) => {
    if (bank) {
      if (bytes.length > bank - 8) throw new Error('nesStream: tick record larger than a bank');
      if (out.length % bank + bytes.length + 8 > bank) {
        out.push(NES_OP.SET_BANK, Math.floor(out.length / bank) + 1);
        while (out.length % bank) out.push(0);
      }
    }
    if (pendingLoop) { loopPos = out.length; pendingLoop = false; }
    out.push(...bytes);
  };
  const flush = () => { while (run > 0) { const n = Math.min(run, 255); emit(n === 1 ? [0] : [NES_OP.REPEAT, n]); run -= n; } };
  ticks.forEach((t, i) => {
    if (i === opts.loopTick) { flush(); pendingLoop = true; }
    const ev = eventBytes(t.events), rec = records[i];
    const chunks = rawChunks(t, (bank || 65536) - 8 - 16);
    if (!ev.length && !rec.length && !chunks.length) { run++; return; }
    flush();
    for (const c of chunks) emit(c);
    const d = dictIndex.get(rec.join(','));
    const body = d === undefined ? (rec.length ? rec : [0]) : d < 62 ? [NES_OP.DICT_BASE + d] : [NES_OP.DICT_LONG, d];
    emit([...ev, ...body]);
  });
  flush();
  if (opts.loopTick !== undefined && opts.loopTick >= ticks.length) throw new Error('nesStream: loopTick beyond the last tick');
  if (loopPos >= 0) emit([NES_OP.LOOP, loopPos & 255, (loopPos >> 8) & 255, loopPos >> 16]); else emit([NES_OP.END]);
  return Uint8Array.from(out);
}

export interface NesSubsongInput { ntsc: NesCapture; pal?: NesCapture; dendy?: NesCapture; loopTick?: number }

/** Three region streams plus the subsong table (a missing region falls back to the NTSC capture). */
export function encodeNesStreams(subsongs: readonly NesSubsongInput[], bankSize = 0): Record<NesRegion, Uint8Array> {
  const res = {} as Record<NesRegion, Uint8Array>;
  for (const r of NES_REGIONS) {
    const streams = subsongs.map((s) => ({ cap: s[r] ?? s.ntsc, data: encodeNesSubsong(s[r] ?? s.ntsc, { loopTick: s.loopTick, bankSize, region: r }) }));
    const out: number[] = [streams.length];
    if (streams.length > 36) throw new Error('nesStream: the player table holds at most 36 subsongs');
    let off = 1 + streams.length * 7;
    if (bankSize) off = Math.ceil(off / bankSize) * bankSize;
    const starts = streams.map((s) => { const o = off; off += s.data.length; if (bankSize) off = Math.ceil(off / bankSize) * bankSize; return o; });
    streams.forEach((s, i) => { const c = Math.round(s.cap.tickRateHz * 100); const p = nesIrqPeriod(r, s.cap.tickRateHz); out.push(starts[i] & 255, (starts[i] >> 8) & 255, starts[i] >> 16, c & 255, c >> 8, p & 255, p >> 8); });
    const buf = new Uint8Array(off);
    buf.set(out);
    streams.forEach((s, i) => buf.set(s.data, starts[i]));
    res[r] = buf;
  }
  return res;
}

/** Reference decoder (what the 6502 player does). Decodes the whole subsong up to END/LOOP. */
export function decodeNesStream(region: Uint8Array, subsong: number, bankSize = 0): NesDecoded {
  const e = 1 + subsong * 7;
  const base = region[e] | region[e + 1] << 8 | region[e + 2] << 16;
  const tickRateCentiHz = region[e + 3] | region[e + 4] << 8;
  const irqPeriod = region[e + 5] | region[e + 6] << 8;
  const s = region.subarray(base);
  const nDict = s[0];
  const entry = (i: number) => { const o = s[1 + 2 * i] | s[2 + 2 * i] << 8; return s.subarray(o + 1, o + 1 + s[o]); };
  const ticks: NesTick[] = [];
  const tickAt = new Map<number, number>();
  const readRecord = (b: Uint8Array, q: number, t: NesTick) => {
    const mask = b[q++];
    CHIP_ORDER.forEach((c, bit) => {
      if (!(mask >> bit & 1)) return;
      const w: Array<[number, number]> = [];
      for (;;) {
        const h = b[q++];
        if (h === 0xff) break;
        if (h < 0x80) { w.push([regAddr(c, h), b[q++]]); continue; }
        const idx = b[q++], len = b[q++];
        for (let k = 0; k < len; k++) w.push([regAddr(c, h === 0x80 ? idx + k : idx), b[q++]]);
      }
      t.writes[c] = w;
    });
    return q;
  };
  let p = 1 + 2 * nDict;
  for (let i = 0; i < nDict; i++) p += 1 + s[p];
  let t: NesTick = { writes: {}, events: [] };
  let fresh = true; // no events prefix read for the tick being built
  for (;;) {
    if (fresh) tickAt.set(p, ticks.length);
    const h = s[p++];
    if (h === NES_OP.END || h === NES_OP.LOOP) {
      if (h === NES_OP.LOOP) { const target = s[p] | s[p + 1] << 8 | s[p + 2] << 16; return { tickRateCentiHz, irqPeriod, ticks, loopTick: tickAt.get(target) }; }
      return { tickRateCentiHz, irqPeriod, ticks };
    }
    if (h === NES_OP.SET_BANK) { p = s[p] * bankSize; continue; }
    if (h === NES_OP.EVENTS) {
      const n = s[p++];
      for (let i = 0; i < n; i++) {
        const b0 = s[p++], chip = CHIP_ORDER[b0 & 7], offset = s[p] | s[p + 1] << 8; p += 2;
        if (b0 >> 3 === 0) { t.events.push({ kind: 'pcm', chip, offset, addr: regAddr(chip, s[p]), value: s[p + 1] }); p += 2; }
        else { t.events.push({ kind: 'control', chip, offset, control: s[p] & 15, channel: s[p] >> 4, value: s[p + 1] | s[p + 2] << 8 }); p += 3; }
      }
      fresh = false;
      continue;
    }
    if (h === NES_OP.RAW) {
      const chip = CHIP_ORDER[s[p]], a = s[p + 1], b = s[p + 2], len = s[p + 3] | s[p + 4] << 8;
      (t.raws ??= []).push({ chip, period: NES_RAW_FIXED + 5 * a + 7 * b, data: Array.from(s.subarray(p + 5, p + 5 + len)) });
      p += 5 + len;
      continue;
    }
    if (h === NES_OP.REPEAT) { const n = s[p++]; for (let i = 0; i < n; i++) ticks.push({ writes: {}, events: [] }); continue; }
    if (h >= NES_OP.DICT_BASE) readRecord(entry(h === NES_OP.DICT_LONG ? s[p++] : h - NES_OP.DICT_BASE), 0, t);
    else if (h !== 0) p = readRecord(s, p - 1, t);
    ticks.push(t);
    t = { writes: {}, events: [] };
    fresh = true;
  }
}

/** Raw vs encoded bytes per chip (chip encoded alone, so its own tick framing is included). Raw: 3 per write/PCM, 5 per control. */
export function nesSizeReport(cap: NesCapture): Array<{ chip: NesChip; raw: number; encoded: number }> {
  const rows = [];
  for (const chip of CHIP_ORDER) {
    const events = cap.events.filter((e: NesEvent) => e.chip === chip);
    if (!events.length) continue;
    const raw = events.reduce((n, e) => n + (e.kind === 'control' ? 5 : 3), 0);
    rows.push({ chip, raw, encoded: encodeNesSubsong({ ...cap, events }).length });
  }
  return rows;
}

export { NES_CONTROL };
