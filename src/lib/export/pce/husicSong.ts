/**
 * Furnace PC Engine song -> HuSIC song data (BouKiCHi/HuSIC, vendored in third-party/husic).
 *
 * The driver ROM (public/pce/player.pce, built by tools/build-pce-player.sh) is used as is; this module writes
 * the song tables HuSIC reads through `_sound_dat` ($4400, bank 3) and the per-channel track streams in the
 * banks after the driver, then pads the HuCard. Track bytes are HuSIC commands (the MML compiler hmckc's
 * output format), not register writes: the driver keeps doing notes, envelopes, pan and noise itself.
 */
import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import type { FurnaceInstrument, FurnaceMacro } from '../../import/formats/furnace/FurnaceInstrumentParser';
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';
import { Lossy } from '../md/mdsSong';
import { expandProcMacro } from '../nes/famistudioSong';

/** dataBank/dataStart/dataEnd: free tail of the HuC data bank (MPR3, $6000-$7FFF), measured by tools/build-pce-player.sh. */
export interface HusicLayout { soundDat: number; songEnd: number; ll0: number; constBank: number; firstFreeBank: number; dataBank: number; dataStart: number; dataEnd: number }
export interface HusicSong { rom: Uint8Array; lossy: string[]; frames: number; loopFrame: number }

export const PCE_SYSTEM_ID = 0x05;
const CHANNELS = 6, FRAME_HZ = 60, BANK = 0x2000, WINDOW = 0x4000, MAX_ROWS = 20000, PSG_CLOCK = 3579545;
const MACRO_VOL = 0, MACRO_ARP = 1, MACRO_DUTY = 2, MACRO_WAVE = 3, MACRO_PITCH = 4, NONE = 0xff;
const FREQ_TABLE = 0x19; // `_freq` sits right after LL0's two strings in the const bank
const NOISE_FREQ = [4, 13, 15, 18, 21, 23, 25, 27, 29, 31, 0, 2]; // Furnace pce.cpp noiseFreq (old noise layout)
// HuSIC track commands (hmckc output / hus.c SEQ_xx)
const SLUR = 0xe9, PORTA = 0xeb, PAN = 0xf0, WAVE = 0xf1, NOISE = 0xf2, WAIT = 0xf4, NOTE_ENV = 0xf7, REST = 0xfc, VOLUME = 0xfd, WAVE_ENV = 0xfe, JUMP = 0xee;
const HANDLED = new Set([0x00, 0x03, 0x08, 0x09, 0x0a, 0x0b, 0x0d, 0x0f, 0x10, 0x11, 0xec, 0xed]);

interface Frames { vals: number[]; loop: number }
// glide: a slurred note (no envelope reset, no key-on volume); with port, the driver then slides by port per frame.
interface Ev { frame: number; kind: 'note' | 'off' | 'cont' | 'mark'; cmds: number[]; note?: number; vol?: number; glide?: { port?: [number, number] } }

/** Furnace macro (tick rate `hz`) as per-frame values at the driver's 60 Hz, loop index or -1 (hold the last value). */
function macroFrames(raw: FurnaceMacro, version: number, hz: number, lossy: Lossy, what: string): Frames | undefined {
  const m = expandProcMacro(raw, version);
  if (m.length <= 0) return undefined;
  if (m.release !== NONE && m.release < m.length) lossy.add(`${what} macro release point (played through)`);
  const sp = Math.max(1, m.speed);
  const ticks: number[] = new Array<number>(m.delay).fill(m.data[0]);
  for (let i = 0; i < m.length; i++) for (let k = 0; k < sp; k++) ticks.push(m.data[i]);
  const toF = (t: number) => Math.round((t * FRAME_HZ) / hz);
  const n = Math.max(1, toF(ticks.length));
  const vals = Array.from({ length: n }, (_, f) => ticks[Math.min(ticks.length - 1, Math.floor((f * hz) / FRAME_HZ))]);
  const loop = m.loop !== NONE && m.loop < m.length ? Math.min(n - 1, toF(m.delay + m.loop * sp)) : -1;
  return { vals, loop };
}

/** Envelope list for one `_sound_dat` table pair, deduplicated; each item is bytes ending in $FF plus its loop offset. */
class EnvTable {
  items: Array<{ bytes: number[]; lp: number }> = [];
  private keys = new Map<string, number>();
  add(bytes: number[], lp: number): number {
    const k = `${bytes.join(',')}@${lp}`;
    let i = this.keys.get(k);
    if (i === undefined) { i = this.items.length; this.items.push({ bytes, lp }); this.keys.set(k, i); }
    return i;
  }
  /** Level-style envelope (volume, wave index): values, then $FF; the loop jumps to the loop frame or holds the last value. */
  level(f: Frames): number { return this.add([...f.vals, 0xff], f.loop >= 0 ? f.loop : f.vals.length - 1); }
  /** Note envelope: HuSIC adds each byte to the current note (bit 7 = down), so absolute offsets become deltas. */
  note(f: Frames): number {
    const enc = (x: number) => (x < 0 ? 0x80 | Math.min(127, -x) : Math.min(127, x));
    const a = f.vals, last = a.length - 1;
    const bytes = a.map((v, i) => enc(v - (i ? a[i - 1] : 0)));
    bytes.push(0xff);
    const lp = bytes.length;
    if (f.loop >= 0) bytes.push(enc(a[f.loop] - a[last]), ...a.slice(f.loop + 1).map((v, i) => enc(v - a[f.loop + i])), 0xff);
    else bytes.push(0, 0xff);
    return this.add(bytes, lp);
  }
}

function macroOf(ins: FurnaceInstrument | undefined, code: number): FurnaceMacro | undefined {
  return ins?.macros?.find((x) => x.code === code && x.length > 0);
}

export function husicSystemsSupported(sys: readonly number[]): boolean {
  return sys.length === 1 && sys[0] === PCE_SYSTEM_ID;
}

export function furnaceToHusic(m: FurnaceModule, subsong: number, player: Uint8Array, layout: HusicLayout): HusicSong {
  if (!husicSystemsSupported(m.systems)) {
    throw new Error(`HuSIC export needs a PC Engine song (one HuC6280); systems are ${m.systems.map((x) => x.toString(16)).join(',')}`);
  }
  const lossy = new Lossy();
  const s = m.subsongs[subsong];
  const tb1 = (s.timeBase ?? 0) + 1;
  const hz = s.hz > 0 ? s.hz : 60;
  const flag = (k: string) => Number((m.compatFlags as Record<string, unknown> | undefined)?.[k] ?? 0) > 0;
  const linear = flag('linearPitch'), slideMul = Number((m.compatFlags as Record<string, unknown> | undefined)?.pitchSlideSpeed ?? 4) || 4;
  const newVol = flag('newVolumeScaling'), ceilVol = flag('ceilVolumeScaling'), properNoise = flag('properNoiseLayout');
  const cellAt = (ch: number, o: number, r: number) => m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o] ?? 0}`)?.rows[r];
  const fxOf = (ch: number, o: number, r: number) =>
    (cellAt(ch, o, r)?.effects ?? []).filter((e) => e.type >= 0).map((e) => ({ type: e.type, value: e.value < 0 ? 0 : e.value }));

  // 1. Linear row order with Furnace's speed / jump rules, until a row repeats (the loop point).
  const rows: Array<{ o: number; r: number; tick: number; ticks: number }> = [];
  const seen = new Map<number, number>();
  let o = 0, r = 0, tick = 0, speedIdx = 0, sp1 = s.speed1, sp2 = s.speed2, loopRow = 0;
  const groove = s.speedPattern && s.speedPattern.length > 2 ? s.speedPattern : undefined;
  if (s.speedPattern?.length && !groove) { sp1 = s.speedPattern[0]; sp2 = s.speedPattern[1] ?? s.speedPattern[0]; }
  for (;;) {
    const key = o * 4096 + r;
    const again = seen.get(key);
    if (again !== undefined) { loopRow = again; break; }
    if (rows.length >= MAX_ROWS) { lossy.add(`song past ${MAX_ROWS} rows cut, loops to the start`); break; }
    seen.set(key, rows.length);
    let jump = -1, brk = -1;
    for (let ch = 0; ch < CHANNELS; ch++) for (const { type: t, value: v } of fxOf(ch, o, r)) {
      if (t === 0x09 && v) sp1 = v; else if (t === 0x0f && v) sp2 = v; else if (t === 0x0b) jump = v; else if (t === 0x0d) brk = v;
    }
    const ticks = Math.max(1, (groove ? groove[speedIdx % groove.length] : speedIdx % 2 ? sp2 : sp1) * tb1);
    rows.push({ o, r, tick, ticks });
    tick += ticks; speedIdx++;
    if (jump >= 0 || brk >= 0) { o = jump >= 0 ? jump : o + 1; r = brk >= 0 ? brk : 0; }
    else if (++r >= s.patLen) { r = 0; o++; }
    if (o >= s.ordersLen) o = 0;
    if (r >= s.patLen) r = 0;
  }
  const frameOf = (t: number) => Math.round((t * FRAME_HZ) / hz);
  const endFrame = frameOf(tick), loopFrame = frameOf(rows[loopRow]?.tick ?? 0);
  if (Math.abs(hz - FRAME_HZ) > 0.01) lossy.add(`tick rate ${hz} Hz quantized to 60 Hz frames`);

  // 2. Pitch: the driver's note byte (octave << 4 | semitone) whose period is closest to Furnace's.
  // HuSIC _set_note: period = _freq[(note + 3) & 15] >> (note >> 4), so byte $00 = 3420 = 32.7 Hz.
  // Furnace calcBaseFreq: tuning/16 * 2^((nv + 3) / 12), i.e. flat value 45 = A-4 = tuning (nv 0 = byte $00).
  const cb = layout.constBank * BANK + (layout.ll0 - WINDOW);
  const freq = Array.from({ length: 16 }, (_, i) => player[cb + FREQ_TABLE + 2 * i] | (player[cb + FREQ_TABLE + 2 * i + 1] << 8));
  const tuning = m.tuning || 440;
  const noteByte = (nv: number): number => {
    const want = PSG_CLOCK / 32 / (tuning * Math.pow(2, (nv - 45) / 12));
    let best = 0, err = Infinity;
    for (let oct = 0; oct < 8; oct++) for (let semi = 0; semi < 12; semi++) {
      const p = freq[(semi + 3) & 15] >> oct;
      const e = p > 0 ? Math.abs(Math.log(p / want)) : Infinity;
      if (e < err) { err = e; best = (oct << 4) | semi; }
    }
    if (err > Math.log(2) / 24) lossy.add('note outside the driver range (nearest kept)');
    return best;
  };

  // 3. Envelopes and instrument setup.
  const volEnv = new EnvTable(), noteEnv = new EnvTable(), waveEnv = new EnvTable();
  const scale = (x: number, y: number) => (newVol ? Math.max(0, Math.min(31, x + y - 31)) : ceilVol ? Math.ceil((x * y) / 31) : Math.floor((x * y) / 31));
  const insFrames = new Map<string, Frames | undefined>();
  const framesOf = (insIdx: number, code: number, what: string) => {
    const k = `${insIdx}_${code}`;
    if (!insFrames.has(k)) {
      const mac = macroOf(m.instruments[insIdx], code);
      insFrames.set(k, mac ? macroFrames(mac, m.version, hz, lossy, what) : undefined);
    }
    return insFrames.get(k);
  };
  const volCode = (insIdx: number, chanVol: number): number => {
    const f = framesOf(insIdx, MACRO_VOL, 'volume');
    if (!f) return 0x80 | chanVol;
    const i = volEnv.level({ vals: f.vals.map((v) => scale(chanVol, Math.max(0, Math.min(31, v)))), loop: f.loop });
    if (i >= 0x80) { lossy.add('more than 128 volume envelopes (fixed volume used)'); return 0x80 | chanVol; }
    return i;
  };
  const arpFrames = (insIdx: number, arpFx: number): Frames | undefined => {
    if (arpFx) {
      if (framesOf(insIdx, MACRO_ARP, 'arpeggio')) lossy.add('arpeggio effect over an arpeggio macro (effect kept)');
      const ticks = [0, arpFx >> 4, arpFx & 15];
      const n = Math.max(3, Math.round((3 * FRAME_HZ) / hz));
      return { vals: Array.from({ length: n }, (_, f) => ticks[Math.floor((f * 3) / n)]), loop: 0 };
    }
    const f = framesOf(insIdx, MACRO_ARP, 'arpeggio');
    if (f && f.vals.some((v) => (v & 0x40000000) !== 0)) { lossy.add('fixed-note arpeggio macro'); return undefined; }
    return f;
  };

  // 4. Per-channel events on the 60 Hz frame grid.
  const tracks: Ev[][] = [];
  for (let ch = 0; ch < CHANNELS; ch++) {
    const evs: Ev[] = [{ frame: 0, kind: 'off', cmds: [] }];
    if (loopFrame > 0) evs.push({ frame: loopFrame, kind: 'mark', cmds: [] });
    let ins = -1, chanVol = 31, arpFx = 0, waveFx = 0, noiseFx = false;
    // Furnace volume slide (0Axy, playback.cpp): volume is kept << 8, volSpeed = x*64 up / -y*64 down per tick.
    let volFine = 31 << 8, volSpeed = 0;
    // Tone portamento (03xx): Furnace slides baseFreq by speed per tick (linear pitch: speed*pitchSlideSpeed / 128
    // semitone; else period units). The driver gets a slurred note with a constant $EB period step, then a slurred
    // target note on arrival.
    let porta = 0, curNv = -1, toneOn = false, snap: Ev | undefined, glideFrom = 0, glideTo = 0, glideStart = 0;
    const period = (nb: number) => freq[((nb & 15) + 3) & 15] >> (nb >> 4);
    const dropSnap = (frame: number) => {
      if (!snap || frame >= snap.frame) { snap = undefined; return; }
      evs.splice(evs.indexOf(snap), 1);
      curNv = glideFrom + ((glideTo - glideFrom) * (frame - glideStart)) / Math.max(1, snap.frame - glideStart);
      snap = undefined;
    };
    for (const row of rows) {
      const cell = cellAt(ch, row.o, row.r);
      let delay = 0, cut = -1;
      const cmds: number[] = [];
      let volChanged = false;
      for (const { type: t, value: v } of fxOf(ch, row.o, row.r)) {
        if (t === 0x08) cmds.push(PAN, v);
        else if (t === 0x10) { waveFx = v; if (!framesOf(Math.max(0, ins), MACRO_WAVE, 'wave')) cmds.push(WAVE, v); }
        else if (t === 0x11) { if (ch >= 4) noiseFx = v > 0; else lossy.add('noise effect on channels 1-4'); }
        else if (t === 0x00) arpFx = v;
        else if (t === 0x03) porta = v;
        else if (t === 0x0a) volSpeed = !v ? 0 : v & 15 ? -(v & 15) * 64 : (v >> 4) * 64;
        else if (t === 0xed) delay = Math.min(v, row.ticks - 1);
        else if (t === 0xec) cut = v;
        else if (!HANDLED.has(t)) lossy.add(`effect ${t.toString(16).toUpperCase().padStart(2, '0')}xx`);
      }
      if (cell && cell.instrument !== -1) ins = cell.instrument;
      if (cell && cell.volume !== -1) { chanVol = Math.min(31, cell.volume); volFine = chanVol << 8; volChanged = true; }
      const at = frameOf(row.tick + delay);
      const nv = cell ? convertFurnaceNoteValue(cell) : -1;
      if (nv >= 0 && nv < 253) dropSnap(at);
      if (nv >= 0 && nv < 253 && porta && toneOn && curNv >= 0 && !(ch >= 4 && noiseFx)) {
        const from = Math.round(curNv), p0 = period(noteByte(from)), p1 = period(noteByte(nv));
        const ticks = Math.max(1, Math.ceil(linear ? (Math.abs(nv - curNv) * 128) / (porta * slideMul) : Math.abs(p1 - p0) / porta));
        const fa = frameOf(row.tick + delay + ticks);
        const d = (p1 - p0) / Math.max(1, fa - at), hi = Math.trunc(d), lo = Math.min(127, Math.round(Math.abs(d - hi) * 128));
        evs.push({ frame: at, kind: 'note', cmds: [...cmds], note: noteByte(from), glide: { port: [hi & 0xff, lo | (d < 0 ? 0x80 : 0)] } });
        snap = { frame: fa, kind: 'note', cmds: [], note: noteByte(nv), glide: {} };
        evs.push(snap);
        glideFrom = curNv; glideTo = nv; glideStart = at; curNv = nv;
      } else if (nv >= 0 && nv < 253) {
        curNv = nv; toneOn = !(ch >= 4 && noiseFx);
        const insIdx = Math.max(0, ins);
        if (framesOf(insIdx, MACRO_PITCH, 'pitch')) lossy.add('pitch macro');
        const wf = framesOf(insIdx, MACRO_WAVE, 'wave');
        const wave = wf && new Set(wf.vals).size > 1 ? -1 - waveEnv.level(wf) : wf ? wf.vals[0] : waveFx;
        const af = arpFrames(insIdx, arpFx);
        const df = ch >= 4 ? framesOf(insIdx, MACRO_DUTY, 'noise') : undefined;
        if (df && new Set(df.vals).size > 1) lossy.add('noise mode changing inside a duty macro (first value kept)');
        const noise = ch >= 4 && (noiseFx || (df ? df.vals[0] > 0 : false));
        const note = noise ? (properNoise ? nv & 31 : NOISE_FREQ[((nv % 12) + 12) % 12]) : noteByte(nv);
        evs.push({ frame: at, kind: 'note', cmds: [...cmds, NOISE, noise ? 1 : 0, ...(wave < 0 ? [WAVE_ENV, -1 - wave] : [WAVE, wave]),
          NOTE_ENV, af ? noteEnv.note(af) : 0xff], note, vol: volCode(insIdx, chanVol) });
      } else if (nv === 253) { dropSnap(at); toneOn = false; evs.push({ frame: at, kind: 'off', cmds }); }
      else if (cmds.length || volChanged) evs.push({ frame: at, kind: 'cont', cmds, vol: volChanged ? volCode(Math.max(0, ins), chanVol) : undefined });
      if (nv === 254 || nv === 255) lossy.add('note release (keeps sounding)');
      if (cut >= 0 && cut < row.ticks) { dropSnap(frameOf(row.tick + cut)); toneOn = false; }
      if (cut >= 0 && cut < row.ticks) evs.push({ frame: frameOf(row.tick + cut), kind: 'off', cmds: [] });
      if (volSpeed) {
        if (framesOf(Math.max(0, ins), MACRO_VOL, 'volume')) lossy.add('volume slide over a volume macro');
        else for (let k = 0; k < row.ticks; k++) {
          volFine = Math.max(0, Math.min(31 << 8, volFine + volSpeed));
          if (volFine >> 8 !== chanVol) { chanVol = volFine >> 8; evs.push({ frame: frameOf(row.tick + k), kind: 'cont', cmds: [], vol: 0x80 | chanVol }); }
        }
      }
    }
    tracks.push(evs.filter((e) => e.frame < endFrame).sort((a, b) => a.frame - b.frame));
  }

  // 5. Track bytes; a command never straddles a bank, each bank ends with a jump to the next.
  const banks: number[][] = [[]];
  const here = () => ({ bank: layout.firstFreeBank + banks.length - 1, addr: WINDOW + banks[banks.length - 1].length });
  const unit = (b: number[]) => {
    let cur = banks[banks.length - 1];
    if (cur.length + b.length + 4 > BANK) { cur.push(JUMP, layout.firstFreeBank + banks.length, WINDOW & 0xff, WINDOW >> 8); cur = []; banks.push(cur); }
    cur.push(...b);
  };
  const chunks = (first: number[], cont: number, len: number) => {
    unit([...first, Math.min(255, len)]);
    for (let left = len - 255; left > 0; left -= 255) unit([cont, Math.min(255, left)]);
  };
  const starts: Array<{ bank: number; addr: number }> = [], loops: Array<{ bank: number; addr: number }> = [];
  for (const evs of tracks) {
    // Same-frame events merge: commands in order, the last note / off decides.
    const merged: Ev[] = [];
    for (const e of evs) {
      const p = merged[merged.length - 1];
      if (p && p.frame === e.frame) {
        p.cmds.push(...e.cmds);
        if (e.kind === 'note' || e.kind === 'off') { p.kind = e.kind; p.note = e.note; p.vol = e.vol; p.glide = e.glide; }
        else if (e.vol !== undefined && p.kind !== 'off') p.vol = e.vol;
        if (e.kind === 'mark') p.cmds.push(-1);
        if (p.kind === 'mark') p.kind = 'cont';
      } else merged.push({ ...e, cmds: e.kind === 'mark' ? [-1, ...e.cmds] : [...e.cmds], kind: e.kind === 'mark' ? 'cont' : e.kind });
    }
    unit([]);
    starts.push(here());
    let loopAt = starts[starts.length - 1], sounding = false, curVol = -1;
    const state = new Map<number, number>(); // last value per command, so unchanged setup is not re-sent
    merged.forEach((e, i) => {
      const len = (merged[i + 1]?.frame ?? endFrame) - e.frame;
      const out: number[] = [];
      for (let k = 0; k < e.cmds.length; k++) {
        const c = e.cmds[k];
        if (c === -1) { if (out.length) unit(out.splice(0)); unit([]); loopAt = here(); state.clear(); curVol = -1; continue; }
        const v = e.cmds[++k];
        if (state.get(c) !== v || c === PAN) { out.push(c, v); state.set(c, v); }
      }
      if (out.length) unit(out);
      if (e.kind === 'note') {
        if (e.vol !== undefined && e.vol !== curVol) { unit([VOLUME, e.vol]); curVol = e.vol; }
        if (e.glide) unit([...(e.glide.port ? [PORTA, ...e.glide.port] : []), SLUR]);
        chunks([e.note ?? 0], WAIT, len);
        sounding = true;
      } else if (e.kind === 'off' || !sounding) {
        sounding = false;
        chunks([REST], REST, len);
      } else {
        if (e.vol !== undefined && e.vol !== curVol) { unit([VOLUME, e.vol]); curVol = e.vol; }
        chunks([WAIT], WAIT, len);
      }
    });
    loops.push(loopAt);
    unit([JUMP, loopAt.bank, loopAt.addr & 0xff, loopAt.addr >> 8]);
  }

  // 6. Tables: `_sound_dat` header + song tables in the const bank (MPR2, $4400-$5FFF); what does not fit there
  // goes to the free tail of the data bank, which the driver keeps mapped at MPR3 ($6000-$7FFF) while it reads envelopes.
  const regions = [
    { start: layout.soundDat, end: layout.songEnd, rom: layout.constBank * BANK + (layout.soundDat - WINDOW), bytes: [] as number[] },
    { start: layout.dataStart, end: layout.dataEnd, rom: layout.dataBank * BANK + (layout.dataStart - 0x6000), bytes: [] as number[] },
  ];
  const alloc = (bytes: number[]) => {
    const r = regions.find((g) => g.start + g.bytes.length + bytes.length <= g.end);
    if (!r) throw new Error(`HuSIC export: song tables need ${regions.reduce((s, g) => s + g.bytes.length, 0) + bytes.length} bytes, ${regions.reduce((s, g) => s + g.end - g.start, 0)} fit in the driver banks`);
    const at = r.start + r.bytes.length; r.bytes.push(...bytes); return at;
  };
  const put16 = (at: number, v: number) => {
    const r = regions.find((g) => at >= g.start && at < g.start + g.bytes.length)!;
    r.bytes[at - r.start] = v & 0xff; r.bytes[at - r.start + 1] = (v >> 8) & 0xff;
  };
  const w16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const header = alloc(new Array<number>(0x24).fill(0));
  const ptrs = new Array<number>(16).fill(0);
  const songAddr = alloc([0, 0]);
  ptrs[0] = alloc(starts.flatMap((p) => w16(p.addr))); put16(songAddr, ptrs[0]);
  ptrs[7] = alloc(starts.map((p) => p.bank));
  ptrs[1] = alloc(loops.flatMap((p) => w16(p.addr)));
  ptrs[8] = alloc(loops.map((p) => p.bank));
  ptrs[15] = songAddr;
  const table = (t: EnvTable, at: number) => {
    ptrs[at] = alloc(new Array<number>(t.items.length * 2).fill(0));
    ptrs[at + 1] = alloc(new Array<number>(t.items.length * 2).fill(0));
    t.items.forEach((it, i) => { const body = alloc(it.bytes); put16(ptrs[at] + 2 * i, body); put16(ptrs[at + 1] + 2 * i, body + it.lp); });
  };
  table(volEnv, 2); table(noteEnv, 9); table(waveEnv, 11);
  ptrs[4] = ptrs[5] = ptrs[6] = ptrs[13] = ptrs[14] = alloc([0, 0]); // pitch / LFO / multi envelopes: unused
  const waves = m.wavetables.length ? m.wavetables : [{ width: 32, height: 32, data: Array.from({ length: 32 }, (_, i) => (i < 16 ? i * 2 : 62 - i * 2)) }];
  if (!m.wavetables.length) lossy.add('song has no wavetables (triangle used)');
  const waveTable = alloc(new Array<number>(waves.length * 2).fill(0));
  waves.forEach((w, i) => {
    const n = Math.max(1, w.width || w.data.length), top = Math.max(1, (w.height || 32) - 1);
    put16(waveTable + 2 * i, alloc(Array.from({ length: 32 }, (_, k) => Math.max(0, Math.min(31, Math.round(((w.data[Math.floor((k * n) / 32)] ?? 0) * 31) / top))))));
  });
  ptrs.forEach((p, i) => put16(header + 2 * i, p));
  put16(header + 0x20, waveTable); put16(header + 0x22, ptrs[4]);

  // 7. HuCard: driver, tables, tracks; power-of-two size of at least 128 KB.
  const used = layout.firstFreeBank + banks.length;
  let size = 16 * BANK;
  while (size < used * BANK) size *= 2;
  if (size > 0x100000) throw new Error('HuSIC export: song data does not fit in a 1 MB HuCard');
  const rom = new Uint8Array(size);
  rom.set(player.subarray(0, Math.min(player.length, layout.firstFreeBank * BANK)));
  regions.forEach((g) => rom.set(g.bytes, g.rom));
  banks.forEach((b, i) => rom.set(b, (layout.firstFreeBank + i) * BANK));
  const text = (str: string, at: number, max: number) => {
    const t = [...(str || '')].map((c) => (c >= ' ' && c <= '~' ? c.charCodeAt(0) : 0x3f)).slice(0, max);
    rom.fill(0, cb + at, cb + at + max + 1);
    rom.set(t, cb + at);
  };
  text(m.name, 0, 12); // LL0+0 and LL0+13 are the two strings the player screen prints
  text(m.author, 13, 11);
  return { rom, lossy: lossy.list(), frames: endFrame, loopFrame };
}
