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
const CHANNELS = 6, FRAME_HZ = 60, BANK = 0x2000, WINDOW = 0x4000, MAX_ROWS = 20000, PSG_CLOCK = 3579545, XPCM_HZ = 6991.29, XPCM_MAX = BANK * 2;
const MACRO_VOL = 0, MACRO_ARP = 1, MACRO_DUTY = 2, MACRO_WAVE = 3, MACRO_PITCH = 4, MACRO_PANL = 12, MACRO_PANR = 13, NONE = 0xff, INS_AMIGA = 4; // INS_AMIGA = DIV_INS_AMIGA
const FREQ_TABLE = 0x2d; // `_freq` sits after LL0's strings (25 bytes) and the 20-byte author field in the const bank; asserted below
const NOISE_FREQ = [4, 13, 15, 18, 21, 23, 25, 27, 29, 31, 0, 2]; // Furnace pce.cpp noiseFreq (old noise layout)
// HuSIC track commands (hmckc output / hus.c SEQ_xx)
const XPCM = 0xef, SLUR = 0xe9, PORTA = 0xeb, PAN = 0xf0, WAVE = 0xf1, NOISE = 0xf2, WAIT = 0xf4, NOTE_ENV = 0xf7, PITCH_ENV = 0xf8, REST = 0xfc, VOLUME = 0xfd, WAVE_ENV = 0xfe, PAN_ENV = 0xe6, JUMP = 0xee;
const HANDLED = new Set([0x00, 0x01, 0x02, 0x03, 0x04, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0x08, 0x09, 0x0a, 0x0b, 0x0d, 0x0f, 0x10, 0x11, 0x80, 0xec, 0xed, 0xff]);

interface Frames { vals: number[]; loop: number }
// glide: a slurred note (no envelope reset, no key-on volume); with port, the driver then slides by port per frame.
// owner: a mid-note segment (noise mode switched by the duty macro) of this note; dropped when another note or off comes first.
interface Ev { frame: number; kind: 'note' | 'off' | 'cont' | 'mark'; cmds: number[]; note?: number; dda?: boolean; vol?: number; glide?: { port?: [number, number] }; owner?: Ev }

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
  /** Note / pitch envelope: HuSIC adds each byte to the current value (bit 7 = down; $FF is the end mark, so -127
   * cannot be stored), so absolute offsets become deltas. `wrap`: the target register wraps at this size (noise). */
  note(f: Frames, wrap = 0): number {
    const w = (x: number) => (wrap ? ((((x % wrap) + wrap + wrap / 2 - 1) % wrap) - wrap / 2 + 1) : x);
    const enc = (d: number) => { const x = w(d); return x < 0 ? 0x80 | Math.min(126, -x) : Math.min(127, x); };
    const a = f.vals, last = a.length - 1;
    const bytes = a.map((v, i) => enc(v - (i ? a[i - 1] : 0)));
    bytes.push(0xff);
    const lp = bytes.length;
    if (f.loop >= 0) bytes.push(enc(a[f.loop] - a[last]), ...a.slice(f.loop + 1).map((v, i) => enc(v - a[f.loop + i])), 0xff);
    else bytes.push(0, 0xff);
    return this.add(bytes, lp);
  }
}

/** Furnace calcArp: bit 30 marks a fixed note (set on a positive value, clear on a negative one); else note + arp. */
export const arpNv = (nv: number, v: number): number =>
  v >= 0 && v & 0x40000000 ? v & ~0x40000000 : v < 0 && !(v & 0x40000000) ? v | 0x40000000 : nv + v;

/** Furnace calcArp: the arp value is a fixed note (not an offset from the played note). */
export const arpIsFixed = (v: number): boolean => arpNv(0, v) !== v;

/** Furnace 80xx (linear 00 left .. FF right) as the PCE pan register: convertPanLinearToSplit(v, 8, 255), high nibbles. */
export const linearPan = (v: number): number => (Math.min(255, Math.floor(((255 - v) * 510) / 255)) & 0xf0) | (Math.min(255, Math.floor((v * 510) / 255)) >> 4);

export function macroOf(ins: FurnaceInstrument | undefined, code: number): FurnaceMacro | undefined {
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
  const delayBehavior = Number((m.compatFlags as Record<string, unknown> | undefined)?.delayBehavior ?? 2);
  const flag = (k: string) => Number((m.compatFlags as Record<string, unknown> | undefined)?.[k] ?? 0) > 0;
  const resetAtTarget = flag('targetResetsSlides');
  const linear = flag('linearPitch'), slideMul = Number((m.compatFlags as Record<string, unknown> | undefined)?.pitchSlideSpeed ?? 4) || 4;
  const newVol = flag('newVolumeScaling'), ceilVol = flag('ceilVolumeScaling'), properNoise = flag('properNoiseLayout');
  const cellAt = (ch: number, o: number, r: number) => m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o] ?? 0}`)?.rows[r];
  const fxOf = (ch: number, o: number, r: number) =>
    (cellAt(ch, o, r)?.effects ?? []).filter((e) => e.type >= 0).map((e) => ({ type: e.type, value: e.value < 0 ? 0 : e.value }));

  // 1. Linear row order with Furnace's speed / jump rules, until a row repeats (the loop point).
  const rows: Array<{ o: number; r: number; tick: number; ticks: number; speed: number }> = [];
  const seen = new Map<number, number>();
  let stopped = false, o = 0, r = 0, tick = 0, speedIdx = 0, sp1 = s.speed1, sp2 = s.speed2, loopRow = 0;
  // Virtual tempo (FDxx / FExx): Furnace adds N to an accumulator each engine tick and counts one row tick per D in it, so a row
  // of L row ticks lasts until the engine tick that brings the count to L. Effects inside a row (EDxx, ECxx, macros) stay on engine ticks.
  // Engine tick 0 already adds N once: its first row tick starts row 0, the rest count toward row 0.
  let vtN = s.virtualTempo > 0 ? s.virtualTempo : 150, vtD = s.virtualTempoD > 0 ? s.virtualTempoD : 150, acc = vtN - vtD, credit = 0;
  while (acc >= vtD) { acc -= vtD; credit++; }
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
      else if (t === 0xfd && v) vtN = v; else if (t === 0xfe && v) vtD = v; else if (t === 0xff) stopped = true;
    }
    const rowTicks = Math.max(1, (groove ? groove[speedIdx % groove.length] : speedIdx % 2 ? sp2 : sp1) * tb1);
    const start = tick;
    while (credit < rowTicks) { tick++; acc += vtN; while (acc >= vtD) { acc -= vtD; credit++; } }
    credit -= rowTicks;
    // shortcut: rows shorter than one engine tick (N > D * speed) keep one tick each; such songs drift.
    if (tick === start) tick++;
    rows.push({ o, r, tick: start, ticks: tick - start, speed: rowTicks });
    speedIdx++;
    // FFxx: Furnace stops when this row's ticks run out (playback.cpp shallStopSched); the tracks then loop on one silent frame.
    if (stopped) break;
    if (jump >= 0 || brk >= 0) { o = jump >= 0 ? jump : o + 1; r = brk >= 0 ? brk : 0; }
    else if (++r >= s.patLen) { r = 0; o++; }
    if (o >= s.ordersLen) o = 0;
    if (r >= s.patLen) r = 0;
  }
  const frameOf = (t: number) => Math.round((t * FRAME_HZ) / hz);
  const endFrame = frameOf(tick) + (stopped ? 1 : 0), loopFrame = stopped ? frameOf(tick) : frameOf(rows[loopRow]?.tick ?? 0);
  if (Math.abs(hz - FRAME_HZ) > 0.01) lossy.add(`tick rate ${hz} Hz quantized to 60 Hz frames`);

  // 2. Pitch: the driver's note byte (octave << 4 | semitone) whose period is closest to Furnace's.
  // HuSIC _set_note: period = _freq[(note + 3) & 15] >> (note >> 4), so byte $00 = 3420 = 32.7 Hz.
  // Furnace calcBaseFreq: tuning/16 * 2^((nv + 3) / 12), i.e. flat value 45 = A-4 = tuning (nv 0 = byte $00).
  const cb = layout.constBank * BANK + (layout.ll0 - WINDOW);
  const freq = Array.from({ length: 16 }, (_, i) => player[cb + FREQ_TABLE + 2 * i] | (player[cb + FREQ_TABLE + 2 * i + 1] << 8));
  if (freq[0] !== 4068) throw new Error('HuSIC player: _freq table not at LL0+' + FREQ_TABLE + '; update FREQ_TABLE after changing the LL0 strings');
  const tuning = m.tuning || 440;
  // low: also bytes $0D-$0F, _freq[0..2] >> 0 = A-0..B-0 below byte $00. Only for a plain key-on note: the note env
  // (drv_noteenv) steps note_data as octave << 4 | semitone 0-11 and cannot reach or leave them.
  const noteByte = (nv: number, low = false): number => {
    const want = PSG_CLOCK / 32 / (tuning * Math.pow(2, (nv - 45) / 12));
    let best = 0, err = Infinity;
    for (let oct = 0; oct < 8; oct++) for (let semi = 0; semi < (low && !oct ? 16 : 12); semi++) {
      const p = freq[(semi + 3) & 15] >> oct;
      const e = p > 0 ? Math.abs(Math.log(p / want)) : Infinity;
      if (e < err) { err = e; best = (oct << 4) | semi; }
    }
    if (err > Math.log(2) / 24) lossy.add('note outside the driver range (nearest kept)');
    return best;
  };

  // 3. Envelopes and instrument setup.
  const volEnv = new EnvTable(), noteEnv = new EnvTable(), waveEnv = new EnvTable(), pitchEnv = new EnvTable(), panEnv = new EnvTable();
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
  // elapsed: frames since the note started. A volume column change on a held note rescales the macro where it is
  // running (Furnace keeps the macro position), it does not restart it.
  // XPCM samples (Furnace DDA): the driver's timer IRQ streams 4-bit packed nibbles at 6991 Hz from one 8 KB bank per sample, indexed
  // by the note byte. One table entry per (sample, playback rate).
  const xpcm: Uint8Array[] = [], xpcmKeys = new Map<string, number>();
  const isSampleIns = (fi: FurnaceInstrument | undefined) => !!fi && (fi.type === INS_AMIGA || !!fi.amiga?.useSample);
  const xpcmIndex = (insIdx: number, nv: number): number => {
    const fi = m.instruments[insIdx];
    if (!isSampleIns(fi)) return -1;
    const a = fi.amiga, abs = Math.max(0, Math.min(119, nv + 60));
    const nm = a?.useNoteMap ? a.noteMap?.[abs] : undefined;
    const smp = m.samples[nm ? nm.map : (a?.initSample ?? -1)];
    if (!smp || smp.length < 2) return -1;
    const rate = (smp.c4Rate || smp.compatRate || 8363) * 2 ** (((nm ? nm.freq : abs) - 60) / 12);
    const step = rate / XPCM_HZ, n = Math.max(2, Math.min(XPCM_MAX, Math.round(smp.length / step)) & ~1);
    const key = `${nm ? nm.map : a?.initSample}:${n}`;
    const known = xpcmKeys.get(key);
    if (known !== undefined) return known;
    if (xpcm.length >= 0xe0) { lossy.add('more than 224 sample/pitch pairs (sample played as a wavetable tone)'); return -1; }
    if (Math.round(smp.length / step) > XPCM_MAX) lossy.add('sample longer than one 8 KB bank (cut at 2.3 s)');
    if (smp.loop) lossy.add('looping sample played once');
    const d = smp.data, scale = d instanceof Int16Array ? 32768 : 128, bias = d instanceof Uint8Array ? 128 : 0;
    const nib = (i: number) => {
      const from = Math.floor(i * step), to = Math.max(from + 1, Math.floor((i + 1) * step));
      let sum = 0;
      for (let k = from; k < to; k++) sum += ((d[Math.min(k, d.length - 1)] - bias) / scale);
      return Math.max(0, Math.min(15, Math.round(((sum / (to - from)) + 1) * 7.5)));
    };
    const bytes = new Uint8Array(n >> 1);
    for (let i = 0; i < n; i += 2) bytes[i >> 1] = (nib(i) << 4) | nib(i + 1); // high nibble plays first
    xpcmKeys.set(key, xpcm.length); xpcm.push(bytes);
    return xpcm.length - 1;
  };
  // Pan macros (Furnace pce.cpp: panL = high nibble, panR = low nibble of the pan register, a missing side stays full).
  // Driver multi-envelope item: count, loop count, then one raw pan byte per frame; count 0 after the loop = hold the last byte.
  const anyPan = m.instruments.some((i) => macroOf(i, MACRO_PANL) || macroOf(i, MACRO_PANR));
  const panEnvOf = (insIdx: number): number => {
    const l = framesOf(insIdx, MACRO_PANL, 'pan'), r = framesOf(insIdx, MACRO_PANR, 'pan');
    if (!l && !r) return 0xff;
    const n = Math.max(l?.vals.length ?? 0, r?.vals.length ?? 0);
    const loops = [l, r].filter((x): x is Frames => !!x).map((x) => x.loop);
    const lp = loops.every((x) => x >= 0) ? Math.min(...loops) : -1;
    if (l && r && l.vals.length !== r.vals.length && lp >= 0) lossy.add('pan left and right macros of different lengths looping (loop kept at the earlier point)');
    const lc = lp >= 0 ? n - lp : 0;
    const vals = Array.from({ length: n }, (_, i) => (((l ? frameAt(l, i) : 15) & 15) << 4) | ((r ? frameAt(r, i) : 15) & 15));
    return envIdx(panEnv.add([n & 0xff, n >> 8, lc & 0xff, lc >> 8, ...vals], 4 + (lp >= 0 ? lp : n)), 'pan');
  };
  const volCode = (insIdx: number, chanVol: number, elapsed = 0): number => {
    const f0 = framesOf(insIdx, MACRO_VOL, 'volume');
    if (!f0) return 0x80 | chanVol;
    const f = shiftFrames(f0, elapsed);
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
    return framesOf(insIdx, MACRO_ARP, 'arpeggio');
  };
  const noiseReg = (n: number) => (properNoise ? n & 31 : NOISE_FREQ[((n % 12) + 12) % 12]);
  const envIdx = (i: number, what: string) => { if (i < 0xff) return i; lossy.add(`more than 255 ${what} envelopes (envelope dropped)`); return 0xff; };
  // Furnace's PCE period for a (fractional) note value; calcBaseFreq, tuning at value 45.
  const furPeriod = (nv: number) => PSG_CLOCK / 32 / (tuning * Math.pow(2, (nv - 45) / 12));
  const frameAt = (f: Frames, i: number) => f.vals[i < f.vals.length ? i : f.loop >= 0 ? f.loop + ((i - f.loop) % (f.vals.length - f.loop)) : f.vals.length - 1];
  /** The macro as seen from frame f0 on (a segment that starts mid-note). */
  const shiftFrames = (f: Frames, f0: number): Frames => {
    if (!f0) return f;
    if (f.loop < 0) return { vals: f0 < f.vals.length ? f.vals.slice(f0) : [f.vals[f.vals.length - 1]], loop: -1 };
    if (f0 <= f.loop) return { vals: f.vals.slice(f0), loop: f.loop - f0 };
    const ph = f.loop + ((f0 - f.loop) % (f.vals.length - f.loop));
    return { vals: [...f.vals.slice(ph), ...f.vals.slice(f.loop, ph)], loop: 0 };
  };
  // Pitch env as raw signed bytes per frame (the caller picks delta or absolute meaning); the tail is cut to its
  // shortest repeating period, which the driver loops ($FF jumps to the loop pointer).
  /** Shortest repeating tail of a per-frame sequence (keys compared as strings): frames [start, start + p) loop. */
  const tailOf = (v: readonly (number | string)[]) => {
    const n = v.length;
    let best = { start: n - 1, p: 1 };
    for (let p = 1; p <= Math.min(128, n >> 1); p++) {
      let st = n - p;
      while (st > 0 && v[st - 1] === v[st - 1 + p]) st--;
      if (n - st >= 2 * p && st + p < best.start + best.p) best = { start: st, p };
    }
    return best;
  };
  const bakePitch = (v: number[], tail = tailOf(v)): number => {
    if (v.some((x) => Math.abs(x) > 126)) lossy.add('pitch move past the driver pitch envelope step (clamped)');
    const enc = (x: number) => (x < 0 ? 0x80 | Math.min(126, -x) : Math.min(126, x));
    return envIdx(pitchEnv.add([...v.slice(0, tail.start + tail.p).map(enc), 0xff], tail.start), 'pitch');
  };

  // 4. Per-channel events on the 60 Hz frame grid.
  const tracks: Ev[][] = [];
  for (let ch = 0; ch < CHANNELS; ch++) {
    const evs: Ev[] = [{ frame: 0, kind: 'off', cmds: [] }];
    if (loopFrame > 0) evs.push({ frame: loopFrame, kind: 'mark', cmds: [] });
    if (stopped) evs.push({ frame: loopFrame, kind: 'off', cmds: [] });
    let ins = -1, chanVol = 31, noteFrame = 0, arpFx = 0, waveFx = 0, noiseFx = false;
    // Furnace volume slide (0Axy, playback.cpp): volume is kept << 8, volSpeed = x*64 up / -y*64 down per tick.
    let volFine = 31 << 8, volSpeed = 0;
    // Tone portamento (03xx): Furnace slides baseFreq by speed per tick (linear pitch: speed*pitchSlideSpeed / 128
    // semitone; else period units). The driver gets a slurred note with a constant $EB period step, then a slurred
    // target note on arrival.
    // Pitch effects in Furnace pitch units (linear: 1/128 semitone; else period units), + = higher, one value per tick:
    // 01/02 slides and E1/E2 note slides (baseFreq, reset by a new note), 04 vibrato (sine, E4 fine), E5 pitch.
    // Baked per note into a $F8 pitch env after the row pass.
    const rawT: number[] = [];
    const pend: Array<{ ev: Ev; tick: number; f0: number; nv: number; af?: Frames; pf?: Frames; rel: boolean; noise: boolean; arpOn: boolean }> = [];
    let slide = 0, slideTo: number | undefined, e12 = 0, slid = 0, vibDepth = 0, vibRate = 0, vibFine = 15, vibPos = 0, pitchFx = 0, slideNv = 0;
    const pmul = linear ? slideMul : 1;
    const toRaw = (semis: number) => (linear ? semis * 128 : furPeriod(slideNv) - furPeriod(slideNv + semis));
    let porta = 0, curNv = -1, toneOn = false, snap: Ev | undefined, glideFrom = 0, glideTo = 0, glideStart = 0;
    // Furnace (playback.cpp, targetResetsSlides): reaching the 03xx target clears portaSpeed, so later notes key on again.
    let portaDone = -1;
    // Furnace runs 01/02/03 only once the channel has been used (keyOn || keyOff); a slide set before the first note waits.
    // nv is Furnace's note minus 60. A linear channel starts at Furnace note 60 (SharedChannel baseFreq 0x1e00), i.e. nv 0.
    // shortcut: non-linear channels start at baseFreq 0 in Furnace but are modelled from nv 0 here; fix if a song needs it.
    let used = false;
    const period = (nb: number) => freq[((nb & 15) + 3) & 15] >> (nb >> 4);
    const dropSnap = (frame: number) => {
      if (!snap || frame >= snap.frame) { snap = undefined; return; }
      evs.splice(evs.indexOf(snap), 1);
      curNv = glideFrom + ((glideTo - glideFrom) * (frame - glideStart)) / Math.max(1, snap.frame - glideStart);
      snap = undefined;
    };
    for (const row of rows) {
      const cell = cellAt(ch, row.o, row.r);
      let delay = 0, cut = -1, noteTick = -1;
      const cmds: number[] = [];
      let volChanged = false, slideSet = false, e12Semis = 0, e12Speed = 0, portaSet = false;
      for (const { type: t, value: v } of fxOf(ch, row.o, row.r)) {
        if (t === 0x08) cmds.push(PAN, v);
        else if (t === 0x80) cmds.push(PAN, linearPan(v));
        else if (t === 0x10) { waveFx = v; if (!framesOf(Math.max(0, ins), MACRO_WAVE, 'wave')) cmds.push(WAVE, v); }
        else if (t === 0x11) { if (ch >= 4) noiseFx = v > 0; else lossy.add('noise effect on channels 1-4'); }
        else if (t === 0x00) arpFx = v;
        else if (t === 0x03) { porta = v; portaSet = true; portaDone = -1; }
        else if (t === 0x01 || t === 0x02) { slide = (t === 0x01 ? 1 : -1) * v * pmul; slideTo = undefined; slideSet = true; }
        else if (t === 0x04) { vibDepth = v & 15; vibRate = v >> 4; }
        else if (t === 0xe3) { if (v) lossy.add('vibrato shape other than sine'); }
        else if (t === 0xe4) vibFine = v;
        else if (t === 0xe5) pitchFx = v - 0x80;
        else if ((t === 0xe1 || t === 0xe2) && v & 15) { e12Semis = (t === 0xe1 ? 1 : -1) * (v & 15); e12Speed = (v >> 4) * 4; }
        else if (t === 0x0a) volSpeed = !v ? 0 : v & 15 ? -(v & 15) * 64 : (v >> 4) * 64;
        // EDxx counts engine ticks; Furnace tests it against the row speed (row ticks), not the row's engine length (playback.cpp delayBehavior).
        // shortcut: a lax delay past the row end is held at the next row start; split the note across rows if a song needs more.
        else if (t === 0xed && (delayBehavior === 2 || (delayBehavior === 1 ? v <= row.speed : v < row.speed))) delay = Math.min(v, row.ticks);
        else if (t === 0xec) cut = v;
        else if (!HANDLED.has(t)) lossy.add(`effect ${t.toString(16).toUpperCase().padStart(2, '0')}xx`);
      }
      if (cell && cell.instrument !== -1) ins = cell.instrument;
      if (cell && cell.volume !== -1) { chanVol = Math.min(31, cell.volume); volFine = chanVol << 8; volChanged = true; }
      const at = frameOf(row.tick + delay);
      const nv = cell ? convertFurnaceNoteValue(cell) : -1;
      if (nv >= 0 && nv < 253) dropSnap(at);
      if (!portaSet && portaDone >= 0 && at >= portaDone) { porta = 0; portaDone = -1; }
      if (nv >= 0 && nv < 253 && porta && toneOn && curNv >= 0 && !(ch >= 4 && (noiseFx || framesOf(Math.max(0, ins), MACRO_DUTY, 'noise')?.vals.some((v) => v > 0)))) {
        const from = Math.round(curNv), p0 = period(noteByte(from)), p1 = period(noteByte(nv));
        const ticks = Math.max(1, Math.ceil(linear ? (Math.abs(nv - curNv) * 128) / (porta * slideMul) : Math.abs(p1 - p0) / porta));
        const fa = frameOf(row.tick + delay + ticks);
        const d = (p1 - p0) / Math.max(1, fa - at), hi = Math.trunc(d), lo = Math.min(127, Math.round(Math.abs(d - hi) * 128));
        evs.push({ frame: at, kind: 'note', cmds: [...cmds, PITCH_ENV, 0xff], note: noteByte(from), glide: { port: [hi & 0xff, lo | (d < 0 ? 0x80 : 0)] } });
        snap = { frame: fa, kind: 'note', cmds: [], note: noteByte(nv), glide: {} };
        evs.push(snap);
        glideFrom = curNv; glideTo = nv; glideStart = at; curNv = nv;
        if (resetAtTarget) portaDone = fa;
      } else if (nv >= 0 && nv < 253 && xpcmIndex(Math.max(0, ins), nv) >= 0) {
        // Furnace pce.cpp: an Amiga-type or useSample instrument plays its sample through DDA; the driver streams it as XPCM ($EF 01).
        curNv = nv; toneOn = false; noteFrame = at; noteTick = delay;
        evs.push({ frame: at, kind: 'note', cmds, note: xpcmIndex(Math.max(0, ins), nv), dda: true, vol: volCode(Math.max(0, ins), chanVol) });
      } else if (nv >= 0 && nv < 253) {
        curNv = nv; toneOn = !(ch >= 4 && noiseFx); noteFrame = at;
        const insIdx = Math.max(0, ins);
        if (isSampleIns(m.instruments[insIdx])) lossy.add('sample instrument without a usable sample played as a wavetable tone');
        const wf = framesOf(insIdx, MACRO_WAVE, 'wave');
        const wave = wf && new Set(wf.vals).size > 1 ? -1 - waveEnv.level(wf) : wf ? wf.vals[0] : waveFx;
        const af0 = arpFrames(insIdx, arpFx);
        const df = ch >= 4 && !noiseFx ? framesOf(insIdx, MACRO_DUTY, 'noise') : undefined;
        const pf = framesOf(insIdx, MACRO_PITCH, 'pitch'), rel = !!macroOf(m.instruments[insIdx], MACRO_PITCH)?.mode;
        // Noise mode per frame (duty macro on channels 5-6). Each switch is a slurred note (volume envelope runs on) that
        // sets the mode and restarts the arp / pitch envelopes at that frame of the macro.
        const noiseAt = (f: number) => ch >= 4 && (noiseFx || (df ? frameAt(df, f) > 0 : false));
        const segEnd = df && new Set(df.vals).size > 1 ? (df.loop >= 0 ? 64 : df.vals.length) : 1;
        if (df && df.loop >= 0 && new Set(df.vals.slice(df.loop)).size > 1) lossy.add('looping noise mode switch in a duty macro (stops after 64 frames)');
        let owner: Ev | undefined;
        for (let f0 = 0; f0 < segEnd; f0++) {
          const noise = noiseAt(f0);
          if (f0 && noise === noiseAt(f0 - 1)) continue;
          const af = af0 && shiftFrames(af0, f0);
          // Arp as note offsets per frame (fixed notes resolved against this note). Noise: the driver's note env does not
          // reach the noise register, its pitch env does (drv_pitchenv adds to noise_freq), so arp goes there as register deltas.
          const nvs = af ? af.vals.map((v) => arpNv(nv, v)) : [nv];
          const arpOn = nvs.some((x) => x !== nv);
          const note = noise ? noiseReg(nvs[0]) : noteByte(nv, !arpOn);
          const ne = arpOn && !noise ? envIdx(noteEnv.note({ vals: nvs.map((x) => x - nv), loop: af!.loop }), 'note') : 0xff;
          // envCmds must stay last: the pending-note code patches NOTE_ENV / PITCH_ENV values by position from the end
          const envCmds = [NOISE, noise ? 1 : 0, NOTE_ENV, ne, PITCH_ENV, 0xff];
          const ev: Ev = f0
            ? { frame: frameOf(row.tick + delay) + f0, kind: 'note', cmds: envCmds, note, glide: {}, owner }
            : { frame: at, kind: 'note', cmds: [...cmds, ...(wave < 0 ? [WAVE_ENV, -1 - wave] : [WAVE, wave]), ...(anyPan && panEnvOf(insIdx) !== 0xff ? [PAN_ENV, panEnvOf(insIdx)] : []), ...envCmds], note, vol: volCode(insIdx, chanVol) };
          owner ??= ev;
          evs.push(ev);
          pend.push({ ev, tick: row.tick + delay, f0, nv, af: arpOn ? af0 : undefined, pf, rel, noise, arpOn });
        }
        noteTick = delay;
      } else if (nv === 253) { dropSnap(at); toneOn = false; evs.push({ frame: at, kind: 'off', cmds }); }
      else if (cmds.length || volChanged) evs.push({ frame: at, kind: 'cont', cmds, vol: volChanged ? volCode(Math.max(0, ins), chanVol, Math.max(0, at - noteFrame)) : undefined });
      // Furnace keeps an 01/02 slide (portaSpeed) running into later notes (each restarts from its own pitch); only an
      // E1/E2 note slide, whose target belongs to the old note, ends with a new note here.
      if (noteTick >= 0 && !slideSet && slideTo !== undefined) slide = 0;
      if (nv >= 0 && nv <= 253) used = true;
      for (let k = 0; k < row.ticks; k++) {
        if (k === noteTick) { slid = 0; e12 = 0; slideNv = nv; slideTo = undefined; if (!flag('continuousVibrato')) vibPos = 0; }
        if (k === Math.max(0, noteTick) && e12Semis) {
          e12 += e12Semis;
          slideTo = toRaw(e12); slide = Math.sign(slideTo - slid) * e12Speed * pmul;
        }
        if (used) slid += slide;
        if (used && slideTo !== undefined && (slide > 0 ? slid >= slideTo : slid <= slideTo)) { slid = slideTo; slide = 0; }
        // 02xx slides toward Furnace note 0 (portaNote 0, nv -60); reaching it stops the slide for good when targetResetsSlides.
        // shortcut: 01xx has no ceiling here (Furnace stops at the system's top note); add one if a song slides that far.
        else if (used && slideTo === undefined && slide < 0 && slid <= toRaw(-60 - slideNv)) { slid = toRaw(-60 - slideNv); if (resetAtTarget) slide = 0; }
        if (vibDepth) vibPos = (vibPos + vibRate) & 63;
        const tab = Math.trunc(127 * Math.sin((vibPos / 64) * 2 * Math.PI));
        rawT[row.tick + k] = slid + pitchFx + Math.trunc(((vibDepth * tab * vibFine) >> 4) / 15);
      }
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
    const sorted = evs.filter((e) => e.frame < endFrame).sort((a, b) => a.frame - b.frame)
      .filter((e, i, a) => !e.owner || !a.some((x, j) => j < i && !x.owner && x !== e.owner && x.frame > e.owner!.frame && (x.kind === 'note' || x.kind === 'off')));
    for (const p of pend) {
      const next = sorted.find((e) => e.frame > p.ev.frame && (e.kind === 'note' || e.kind === 'off'));
      const n = Math.min(600, Math.max(1, (next ? next.frame : endFrame) - p.ev.frame));
      let p2 = 0;
      const offs: number[] = [], tgt: number[] = [];
      let moves = false;
      // f counts from the note's key-on; a segment (f0 > 0) bakes only its own frames.
      for (let f = 0; f < p.f0 + n; f++) {
        if (p.pf) {
          if (!p.rel) p2 = frameAt(p.pf, f);
          else if (f < p.pf.vals.length || p.pf.loop >= 0) p2 += frameAt(p.pf, f) * (hz / FRAME_HZ);
        }
        if (f < p.f0) continue;
        const a = p.af ? arpNv(p.nv, frameAt(p.af, f)) : p.nv;
        if (p.noise) { offs.push(noiseReg(a + Math.round(p2)) - p.ev.note!); if (offs[offs.length - 1]) moves = true; continue; }
        const r = rawT[Math.min(rawT.length - 1, p.tick + Math.floor((f * hz) / FRAME_HZ))] + p2;
        if (r) moves = true;
        const want = linear ? furPeriod(a + r / 128) : furPeriod(a) - r;
        tgt.push(want);
        offs.push(Math.round(want - period(p.arpOn ? noteByte(a) : p.ev.note!)));
      }
      if (!moves) continue;
      // Without a note env seq_freq / noise_freq carry over, so bytes are deltas; with one set_note resets seq_freq
      // every frame before the pitch env runs, so bytes are absolute offsets.
      const w = (x: number) => (p.noise ? ((((x % 32) + 47) % 32) - 15) : x);
      const bytes = p.arpOn && !p.noise ? offs : offs.map((v, i) => w(v - (i ? offs[i - 1] : 0)));
      if (!p.noise && bytes.some((x) => Math.abs(x) > 126)) {
        // A pitch env byte moves the period by at most 126 per frame (drv_pitchenv), less than a semitone at low notes,
        // so a fast drop (kick pitch macro, wide slide) is split: a note env carries the nearest driver note per frame
        // (drv_noteenv steps note_data in semitones, set_note resets seq_freq) and the pitch env the absolute residual.
        const semi = (nb: number) => (nb >> 4) * 12 + (nb & 15);
        const nearest = tgt.map((t) => {
          let best = 0, err = Infinity;
          for (let s2 = 0; s2 < 96; s2++) {
            const nb = ((s2 / 12) << 4) | s2 % 12, e = Math.abs(t - period(nb));
            if (e < err) { err = e; best = nb; }
          }
          return best;
        });
        if ((p.ev.note! & 15) > 11) p.ev.note = noteByte(p.nv); // the note env needs a regular base byte
        const base = semi(p.ev.note!);
        const notes = nearest.map((nb) => semi(nb) - base), res = nearest.map((nb, i) => Math.round(tgt[i] - period(nb)));
        const tail = tailOf(notes.map((x, i) => `${x},${res[i]}`));
        const cut = tail.start + tail.p;
        p.ev.cmds[p.ev.cmds.length - 3] = envIdx(noteEnv.note({ vals: notes.slice(0, cut), loop: tail.start }), 'note');
        p.ev.cmds[p.ev.cmds.length - 1] = bakePitch(res, tail);
        continue;
      }
      p.ev.cmds[p.ev.cmds.length - 1] = bakePitch(bytes);
    }
    tracks.push(sorted);
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
        if (e.kind === 'note' || e.kind === 'off') { p.kind = e.kind; p.note = e.note; p.dda = e.dda; p.vol = e.vol; p.glide = e.glide; }
        else if (e.vol !== undefined && p.kind !== 'off') p.vol = e.vol;
        if (e.kind === 'mark') p.cmds.push(-1);
        if (p.kind === 'mark') p.kind = 'cont';
      } else merged.push({ ...e, cmds: e.kind === 'mark' ? [-1, ...e.cmds] : [...e.cmds], kind: e.kind === 'mark' ? 'cont' : e.kind });
    }
    unit([]);
    starts.push(here());
    let loopAt = starts[starts.length - 1], sounding = false, curVol = -1, xpcmOn = false;
    const state = new Map<number, number>(); // last value per command, so unchanged setup is not re-sent
    merged.forEach((e, i) => {
      const len = (merged[i + 1]?.frame ?? endFrame) - e.frame;
      const out: number[] = [];
      for (let k = 0; k < e.cmds.length; k++) {
        const c = e.cmds[k];
        if (c === -1) { if (out.length) unit(out.splice(0)); unit([]); loopAt = here(); state.clear(); curVol = -1; if (merged.some((x) => x.dda)) unit([XPCM, 0]); xpcmOn = false; continue; }
        const v = e.cmds[++k];
        if (state.get(c) !== v || c === PAN || c === PAN_ENV) { out.push(c, v); state.set(c, v); }
      }
      if (e.kind === 'note' && !!e.dda !== xpcmOn) { unit([XPCM, e.dda ? 1 : 0]); xpcmOn = !!e.dda; }
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
  table(volEnv, 2); table(noteEnv, 9); table(waveEnv, 11); table(pitchEnv, 4); table(panEnv, 13);
  ptrs[6] = alloc([0, 0]); // LFO: unused
  const waves = m.wavetables.length ? m.wavetables : [{ width: 32, height: 32, data: Array.from({ length: 32 }, (_, i) => (i < 16 ? i * 2 : 62 - i * 2)) }];
  if (!m.wavetables.length) lossy.add('song has no wavetables (triangle used)');
  const waveTable = alloc(new Array<number>(waves.length * 2).fill(0));
  waves.forEach((w, i) => {
    const n = Math.max(1, w.width || w.data.length), top = Math.max(1, w.height || 31); // Furnace height = maximum sample value (31 on PCE)
    put16(waveTable + 2 * i, alloc(Array.from({ length: 32 }, (_, k) => Math.max(0, Math.min(31, Math.round(((w.data[Math.floor((k * n) / 32)] ?? 0) * 31) / top))))));
  });
  ptrs.forEach((p, i) => put16(header + 2 * i, p));
  // XPCM table: addr16, len16 (bytes), bank8, padded to 8 bytes. Each sample sits at the start of its own bank after the track banks.
  const xpcmTable = xpcm.length ? alloc(xpcm.flatMap((b, i) => [...w16(WINDOW + 0x2000), ...w16(b.length), layout.firstFreeBank + banks.length + i, 0, 0, 0])) : ptrs[4];
  put16(header + 0x20, waveTable); put16(header + 0x22, xpcmTable);

  // 7. HuCard: driver, tables, tracks; power-of-two size of at least 128 KB.
  const used = layout.firstFreeBank + banks.length + xpcm.length;
  let size = 16 * BANK;
  while (size < used * BANK) size *= 2;
  if (size > 0x100000) throw new Error('HuSIC export: song data does not fit in a 1 MB HuCard');
  const rom = new Uint8Array(size);
  rom.set(player.subarray(0, Math.min(player.length, layout.firstFreeBank * BANK)));
  regions.forEach((g) => rom.set(g.bytes, g.rom));
  banks.forEach((b, i) => rom.set(b, (layout.firstFreeBank + i) * BANK));
  xpcm.forEach((b, i) => rom.set(b, (layout.firstFreeBank + banks.length + i) * BANK));
  const text = (str: string, at: number, max: number) => {
    const t = [...(str || '')].map((c) => (c >= ' ' && c <= '~' ? c.charCodeAt(0) : 0x3f)).slice(0, max);
    rom.fill(0, cb + at, cb + at + max + 1);
    rom.set(t, cb + at);
  };
  text(m.name, 0, 12); // LL0+0 and LL0+25 (19 chars + NUL, reserved after the 'SELECT SONG' string) are the two strings the player screen prints
  text(m.author, 25, 19);
  return { rom, lossy: lossy.list(), frames: endFrame, loopFrame };
}
