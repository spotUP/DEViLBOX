// Furnace SNES song -> Terrific Audio Driver (TAD) project parts: MML text, sample files and
// project `brr_samples` entries. A format writer only: no playback, no compiling (that is the
// vendored tad-compiler, tadCompilerWasm.ts). Anything TAD cannot express becomes a warning.
import type { FurnaceNativeData, FurnaceModuleSample, FurnaceRow } from '@/types/tracker';
import type { FurnaceSNESConfig } from '@/types/instrument/furnace';
import { createWavFile } from '@/lib/import/InstrumentConverter';
import type { FurnaceWavetable } from '@/lib/import/formats/FurnaceSongParser';

/** Furnace system id of the SNES chip (DivSystem). */
export const FURNACE_SNES_CHIP_ID = 26;

/** What the writer needs from one Furnace instrument (callers map the store or parser shape). */
export interface TadInstrumentInput {
  name: string;
  snes?: FurnaceSNESConfig;
  /** Furnace sample index played by this instrument, -1 = none. Furnace default 0 when absent. */
  initSample?: number;
  useNoteMap?: boolean;
  /** Furnace amiga.noteMap, 120 entries: note -> sample `map` played at note `freq`. */
  noteMap?: { freq: number; map: number }[];
  /** Wavetable mode: the instrument plays a wavetable instead of a sample. */
  useWave?: boolean;
  /** Furnace amiga.waveLen: wavetable length minus 1. */
  waveLen?: number;
  /** Furnace macros by code (MACRO_NAMES); constant volume, wave and special macros are carried. loop/release 255 = none. */
  macros?: { code?: number; data: ArrayLike<number>; loop?: number; release?: number; speed?: number; delay?: number; mode?: number }[];
}

/** Furnace macro `code` as one constant value, or undefined when absent or not constant. */
function constantMacro(inst: TadInstrumentInput | undefined, code: number): number | undefined {
  const d = inst?.macros?.find((m) => m.code === code && m.data.length > 0)?.data;
  return d && Array.from(d).every((v) => v === d[0]) ? d[0] : undefined;
}

/**
 * Arp macro (code 1) as Furnace plays it (snes.cpp:118-125, macroInt: delay ticks, then each value for `speed` ticks,
 * then the last value holds): offsets per Furnace tick before the hold, and the held offset.
 * undefined = no arp macro; null = the macro loops, has a release point or uses fixed notes (not carried).
 */
function arpMacro(inst: TadInstrumentInput | undefined): { steps: number[]; hold: number } | null | undefined {
  const m = inst?.macros?.find((x) => x.code === 1 && x.data.length > 0);
  if (!m) return undefined;
  const d = Array.from(m.data);
  if (d.some((v) => ((v & 0x40000000) !== 0) !== (v < 0))) return null; // calcArp: bit 30 flipped against the sign = fixed note
  const hold = d[d.length - 1];
  if (!m.delay && d.every((v) => v === hold)) return { steps: [], hold };
  if ((m.loop ?? 255) < d.length || (m.release ?? 255) < d.length) return null;
  const steps = [...Array<number>(m.delay ?? 0).fill(0), ...d.flatMap((v) => Array<number>(Math.max(1, m.speed ?? 1)).fill(v))];
  while (steps.length && steps[steps.length - 1] === hold) steps.pop();
  return { steps, hold };
}

/** Constant absolute pitch macro (code 4, snes.cpp:136-144: pitch2 = val) or undefined; relative mode keeps sliding. */
function pitchMacro(inst: TadInstrumentInput | undefined): number | undefined {
  const m = inst?.macros?.find((x) => x.code === 4 && x.data.length > 0);
  return m && !m.mode ? constantMacro(inst, 4) : undefined;
}

export interface TadSongInput {
  native: FurnaceNativeData;
  subsong: number;
  /** Indexed by Furnace instrument index. */
  instruments: TadInstrumentInput[];
  /** Indexed by Furnace sample index. */
  samples: FurnaceModuleSample[];
  /** Indexed by Furnace wavetable index. */
  wavetables?: FurnaceWavetable[];
  title: string;
  /** Largest echo delay in Furnace steps (16 ms, 2048 bytes of Audio-RAM each); the builder lowers it until the song fits. */
  echoDelayCap?: number;
}

export interface TadSampleFile {
  /** TAD sample name, referenced by MML `@` lines. */
  name: string;
  /** Path relative to the project file. */
  path: string;
  data: Uint8Array;
  /** One `brr_samples` entry of the project JSON. */
  entry: Record<string, unknown>;
}

export interface TadSongResult {
  mml: string;
  samples: TadSampleFile[];
  warnings: string[];
}

const NOTE_OFF = 253;
const NOTE_RELEASE = 254;
const NOTE_NAMES = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];
/** Furnace row note value of TAD note 0 (c0); Furnace C-4 = 108, TAD c4 = 48. */
const FURNACE_NOTE_OFFSET = 60;
const ROW_GUARD = 100_000;
const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

interface LinearRow { pos: number; row: number; ticks: number; noise: number }

/** First SNES channel index in the song and the SNES channel count. */
function snesChannels(native: FurnaceNativeData): { first: number; count: number; chip: number } | null {
  let first = 0;
  for (let i = 0; i < native.chipIds.length; i++) {
    const n = native.systemChans?.[i] ?? 8;
    if (native.chipIds[i] === FURNACE_SNES_CHIP_ID) return { first, count: Math.min(n, 8), chip: i };
    first += n;
  }
  return null;
}

/** Furnace SNES chip flags (key=value lines), snes.cpp:1108-1130 setFlags. */
function snesEchoFlags(raw: string | undefined) {
  const kv = new Map<string, string>();
  for (const line of (raw ?? '').split('\n')) { const i = line.indexOf('='); if (i > 0) kv.set(line.slice(0, i), line.slice(i + 1).trim()); }
  const int = (k: string, d: number) => { const v = parseInt(kv.get(k) ?? '', 10); return Number.isFinite(v) ? v : d; };
  const i8 = (v: number) => { const b = v & 0xff; return b > 127 ? b - 256 : b; }; // snes.cpp rWrite takes the low byte
  return {
    on: kv.get('echo') === 'true',
    volL: i8(int('echoVolL', 127)), volR: i8(int('echoVolR', 127)),
    delay: int('echoDelay', 0) & 15,
    feedback: i8(int('echoFeedback', 0)),
    fir: [127, 0, 0, 0, 0, 0, 0, 0].map((d, i) => i8(int(`echoFilter${i}`, d))),
    mask: int('echoMask', 0),
  };
}

export function writeTadSong(input: TadSongInput): TadSongResult {
  return writeTad(input, false);
}

/** Prefix of a Furnace subsong name that marks it as a TAD sound effect (`sfx:<name>`). */
export const TAD_SFX_PREFIX = 'sfx:';

/** TAD sound effect name of a subsong, or null when the subsong is music. */
export function tadSfxName(subsongName: string | undefined): string | null {
  if (!subsongName?.startsWith(TAD_SFX_PREFIX)) return null;
  const name = subsongName.slice(TAD_SFX_PREFIX.length).trim().replace(/[^A-Za-z0-9_]+/g, '_');
  return name || null;
}

/**
 * One `sfx:<name>` subsong as one block of the TAD sound effect file (`=== name === mml`).
 * TAD plays a sound effect on one channel at a fixed 125 ticks per second, once: the first SNES
 * channel with notes is kept, rows are rescaled to 125 Hz, the order list plays once.
 */
export function writeTadSfx(input: TadSongInput): TadSongResult & { name: string } {
  const name = tadSfxName(input.native.subsongs[input.subsong]?.name) ?? `sfx${input.subsong}`;
  const r = writeTad(input, true);
  return { ...r, name, mml: r.mml && `=== ${name} === mml\n${r.mml}` };
}

/** TAD sound effect tick rate (docs/sound-effects.md: fixed tempo). */
const SFX_TICK_HZ = 125;

function writeTad(input: TadSongInput, sfx: boolean): TadSongResult {
  const { native, instruments, samples } = input;
  const sub = native.subsongs[input.subsong];
  const warnings: string[] = [];
  const snes = snesChannels(native);
  if (!sub || !snes) return { mml: '', samples: [], warnings: ['The song has no SNES chip.'] };
  const nCh = sub.channels.length;
  const cell = (ch: number, pos: number, row: number): FurnaceRow | undefined =>
    sub.channels[ch]?.patterns.get(sub.orders[ch]?.[pos] ?? -1)?.rows[row];

  // Dropped things, aggregated: key -> count and first place.
  const dropped = new Map<string, { n: number; at: string }>();
  const drop = (what: string, at: string) => {
    const d = dropped.get(what);
    if (d) d.n++; else dropped.set(what, { n: 1, at });
  };
  const echo = snesEchoFlags(native.chipFlags?.[snes.chip]);
  const cap = input.echoDelayCap ?? 15;
  if (!sfx && echo.on && echo.delay > cap) warnings.push(`Echo delay ${echo.delay * 16} ms lowered to ${cap * 16} ms so the echo buffer fits in the 64 KiB of Audio-RAM.`);
  echo.delay = Math.min(echo.delay, cap);
  const echoInit = { ...echo }; // header values; `echo` tracks 1Axx/1Bxx while channels are written
  let maxDelay = echo.delay; // Furnace 19xx values seen, for #MaxEchoLength
  const where = (ch: number, r: LinearRow) => `channel ${ch + 1}, order ${hex2(r.pos)} row ${hex2(r.row)}`;

  // Pass 1: play the order list once, following speeds, jumps and breaks, until a row repeats.
  const rate = sub.hz * (sub.virtualTempoN || 1) / (sub.virtualTempoD || 1);
  const k = Math.max(1, Math.ceil(8000 / rate / 256));
  const timerExact = 8000 / (rate * k);
  let timer = Math.round(timerExact);
  if (sfx) timer = 64;
  else if (timer < 64) {
    warnings.push(`Tick rate ${rate.toFixed(2)} Hz is faster than TAD allows (125 Hz); the song plays slower.`);
    timer = 64;
  }
  if (sfx && rate > SFX_TICK_HZ) warnings.push(`Tick rate ${rate.toFixed(2)} Hz is faster than TAD sound effects (125 Hz); short rows merge.`);
  if (!sfx && Math.abs(timer - timerExact) / timerExact > 0.005) {
    warnings.push(`Tempo differs by ${((timer / timerExact - 1) * 100).toFixed(1)}% (TAD timer ${timer}).`);
  }

  let speeds = sub.speedPattern?.length ? [...sub.speedPattern] : [sub.speed1, sub.speed2];
  let speedIdx = 0;
  const rows: LinearRow[] = [];
  const visited = new Map<string, number>();
  let loopRow: number | null = null;
  let pos = 0, row = 0, noise = 0;
  while (rows.length < ROW_GUARD) {
    visited.set(`${pos}:${row}`, rows.length);
    let jump: number | null = null, brk: number | null = null, stop = false;
    for (let ch = 0; ch < nCh; ch++) {
      for (const e of cell(ch, pos, row)?.effects ?? []) {
        // playback.cpp:645-668: 0Fxx sets speed 2 of a two-speed song (no grooves), else speed 1; 09xx sets
        // speed 1 without grooves, else picks the groove. Speed changes keep the alternation index.
        const grooves = native.grooves ?? [];
        if (e.cmd === 0x0f && e.val > 0) { speeds = [...speeds]; speeds[speeds.length === 2 && !grooves.length ? 1 : 0] = e.val; }
        else if (e.cmd === 0x09) {
          if (!grooves.length) { if (e.val > 0) { speeds = [...speeds]; speeds[0] = e.val; } }
          else { const g = grooves[e.val]; if (g?.len) { speeds = g.val.slice(0, g.len); speedIdx = 0; } }
        }
        else if (e.cmd === 0x1d) noise = e.val & 31; // snes.cpp:541 one noise clock for the whole chip
        else if (e.cmd === 0x0b) jump = e.val;
        else if (e.cmd === 0x0d) brk = e.val;
        else if (e.cmd === 0xff) stop = true;
      }
    }
    rows.push({ pos, row, ticks: (speeds[speedIdx++ % speeds.length] || 1) * k, noise });
    if (stop) break;
    if (jump !== null || brk !== null) { pos = jump ?? pos + 1; row = brk ?? 0; }
    else if (++row >= sub.patLen) { pos++; row = 0; }
    if (pos >= sub.ordersLen) { if (sfx) break; pos = 0; }
    if (row >= sub.patLen) row = 0;
    const seen = visited.get(`${pos}:${row}`);
    if (seen !== undefined) { if (!sfx) loopRow = seen; break; }
  }
  if (rows.length >= ROW_GUARD) warnings.push('The song did not loop within 100000 rows; it is cut there.');
  if (sfx) {
    // Rescale row lengths to 125 Hz; accumulate so rounding does not drift.
    let acc = 0, prev = 0;
    for (const r of rows) { acc += r.ticks / k * SFX_TICK_HZ / rate; const t = Math.round(acc); r.ticks = t - prev; prev = t; }
  }

  // Notes on channels of other chips cannot play.
  for (let ch = 0; ch < nCh; ch++) {
    if (ch >= snes.first && ch < snes.first + snes.count) continue;
    for (const r of rows) {
      const c = cell(ch, r.pos, r.row);
      if (c && c.note >= 0 && c.note < 180) { drop(`notes on non-SNES channel ${ch + 1}`, where(ch, r)); }
    }
  }

  // Pass 2: one MML line set per SNES channel.
  // TAD instrument id per (Furnace instrument, sound): a note map plays several samples.
  const tadIns = new Map<string, number>();
  // Semitone range (TAD note id, C0 = 0) each sample plays.
  const sampleOctaves = new Map<string, [number, number]>();
  const widen = (smp: string, p: number) => { const r2 = sampleOctaves.get(smp); sampleOctaves.set(smp, r2 ? [Math.min(r2[0], p), Math.max(r2[1], p)] : [p, p]); };
  const tuningHz = native.tuning ?? 440;
  /** Playable TAD note range of a sample; null when its data is missing (no limit known). */
  // Sample name `s<sample>` or `w<length>[_<wave>]` to its number (sample index or wave length).
  const smpNum = (smp: string) => Number(smp.slice(1).split('_')[0]);
  const playable = (smp: string): [number, number] | null => {
    const n = smpNum(smp);
    if (smp[0] === 'w') return tadNoteRange(32000 / n);
    return samples[n] ? tadNoteRange(sampleTuningHz(samples[n], tuningHz)) : null;
  };
  const wavetables = input.wavetables ?? [];
  // TAD sample name an instrument plays: `s<sample>` or `w<length>` (wavetable 0; Furnace starts
  // every channel on wave 0 and 10xx wave changes are dropped effects).
  // Note map: Furnace plays sample noteMap[note].map at note noteMap[note].freq (DivInstrumentAmiga,
  // 180 entries indexed by engine note = row note + 60).
  const soundOf = (inst: TadInstrumentInput | undefined, note: number): { smp: string; note: number } | null => {
    if (!inst) return null;
    // Native rows hold octave*12+semitone (C-0 = 0); the engine, and so the note map, counts from C-(-5) (C-0 = 60).
    note += FURNACE_NOTE_OFFSET;
    if (inst.useWave) {
      // shortcut: wave = constant wave macro or 0; Furnace keeps the channel's last wave, and 10xx / changing wave macros are dropped.
      const wi = constantMacro(inst, 3) ?? 0;
      const len = Math.max(16, ((inst.waveLen ?? 31) + 1) & ~15);
      return wavetables[wi] ? { smp: wi ? `w${len}_${wi}` : `w${len}`, note } : null;
    }
    let s = inst.initSample ?? 0;
    if (inst.useNoteMap && inst.noteMap) {
      const m = inst.noteMap[Math.max(0, Math.min(179, note))];
      s = m?.map ?? -1;
      note = m?.freq ?? note;
    }
    return s >= 0 && samples[s] ? { smp: `s${s}`, note } : null;
  };
  const outside = (smp: string, tad: number) => { const r = playable(smp); return !!r && (tad < r[0] || tad > r[1]); };
  const insWarned = new Set<number>();
  const channelMml: string[] = [];
  let sfxChannel = -1;
  for (let c = 0; c < snes.count; c++) {
    const ch = snes.first + c;
    // echoMask: Furnace starts these channels with echo on (snes.cpp:914).
    const out: string[] = ['V254', ...(!sfx && echo.on && (echo.mask >> c) & 1 ? ['E1'] : [])];
    let ins = 0, curIns = -1, vol = 127, panL = 127, panR = 127, lastP = 64, oct = -1, lastV = 'V254', slid = false;
    // snes.cpp:115-117 outVol = vol * volMacro / 127; a constant volume macro scales V.
    // Pan law, snes.cpp:642-653: each side is outVol * pan / 127 (centre = both full); TAD splits V by p, so
    // V carries panL + panR and p their ratio. Constant panning macros (codes 12/13) override 08xx / 80xx.
    const panOf = () => [constantMacro(instruments[ins], 12) ?? panL, constantMacro(instruments[ins], 13) ?? panR].map((v) => v & 127);
    const panP = () => { const [l, r] = panOf(); return l + r ? Math.round(128 * r / (l + r)) : lastP; };
    const volScale = () => { const [l, r] = panOf(); return Math.min(127, constantMacro(instruments[ins], 0) ?? 127) / 127 * (l + r) / 254; };
    const volV = () => `V${Math.min(255, Math.round(vol * 2 * volScale()))}`;
    // pre: arp macro steps played (slurred) before the note's held pitch; ticks in TAD ticks.
    type Pending = { tok: string; ticks: number; pre?: { p: number; ticks: number }[]; sl?: { a: number; b: number; smp: string; plain: string; oct: number; reg: (p: number, smp: string) => number } };
    let pending: Pending = { tok: 'r', ticks: 0 };
    let carry = 0;
    let sounding = false, curNote = 'r';
    let hasNotes = false;
    // Effect state of this channel (Furnace effects that TAD holds as channel state).
    let curSmp = '', curPitch = -1, echoOn = !sfx && echo.on && ((echo.mask >> c) & 1) === 1, pmOn = false, vib = '0', det = '', fine = 0, inv = 'i0', noiseOn = false, vibWant: { d: number; q: number } | null = null, volSlide = 0, lastEnv = '';
    let env: { mode: number; gain: number; adsr: number[] } | null = null;
    const pitchName = (p: number) => NOTE_NAMES[p % 12];
    // Furnace ticks to TAD ticks (rows are k Furnace-tick multiples; sound effects run at 125 Hz).
    const tickScale = sfx ? SFX_TICK_HZ / rate : k;
    const linear = Number(native.compatFlags?.linearPitch ?? 1) !== 0;
    // cont: the note keeps sounding past this boundary. TAD has no tie after a command, so the
    // note is slurred (`&`) into a repeat of itself.
    const flush = (cont = false) => {
      const slur = cont && sounding;
      // tad-wasm compiler mml/command_parser.rs:1717 (KEY_OFF_TICK_DELAY = 1, bytecode.rs:35): an unslurred note needs
      // more than 1 tick, so a 1-tick note is slurred into what follows (no key-off).
      // A rest needs 2 ticks (tad-wasm compiler mml/command_parser.rs invalid tick count, 2..=65535): a lone 1-tick
      // rest is folded into the length of the next token, which then starts 1 tick early.
      if (pending.ticks > 0 && carry) { pending.ticks += carry; carry = 0; }
      // 'w': a sustain-mode release (snes.cpp:250-253, no KOFF on note off) rings on without key-off. Before the next
      // key-on the channel still needs a key-off, else the next note is slurred onto the released one: end with `r%2`.
      if (pending.tok === 'w') {
        if (cont) { if (pending.ticks > 0) out.push(`w%${pending.ticks}`); pending.ticks = 0; return; }
        if (pending.ticks >= 4) { out.push(`w%${pending.ticks - 2}`); pending.ticks = 2; }
        pending.tok = 'r';
      }
      if (pending.tok === 'r' && pending.ticks === 1 && !slur) {
        warnings.push(`Song channel ${ch + 1}: 1-tick rest folded into the next note (the driver needs 2 ticks).`);
        carry = 1; pending = { tok: 'r', ticks: 0 }; return;
      }
      if (pending.pre && pending.ticks > 1) {
        // Arp macro steps slur into the held pitch (Furnace changes the frequency only, no new key-on).
        let o = oct;
        for (const st of pending.pre) {
          const t = Math.min(st.ticks, pending.ticks - 1);
          if (t <= 0) break;
          if (Math.floor(st.p / 12) !== o) { o = Math.floor(st.p / 12); out.push(`o${o}`); }
          out.push(`${pitchName(st.p)}%${t} &`);
          pending.ticks -= t;
        }
        if (o !== oct) out.push(`o${oct}`);
      }
      pending.pre = undefined;
      const short = !slur && pending.ticks === 1 && pending.tok !== 'r';
      if (short) warnings.push(`Song channel ${ch + 1}: 1-tick note slurred (the driver needs 2 ticks for a key-off note).`);
      // A slide token spans the merged rows, so its portamento velocity is checked here with the real tick count.
      // Compiler channel_bc_generator.rs:760-775: velocity = round(register delta / (ticks - 1)), allowed 1..=255 (bytecode.rs:617, errors.rs:1171).
      if (pending.sl && pending.ticks > 0) {
        const { a, b, smp, plain, oct: o2, reg } = pending.sl;
        const delta = Math.abs(reg(b, smp) - reg(a, smp));
        if (delta && (pending.ticks < 2 || Math.round(delta / pending.ticks) < 1 || Math.round(delta / (pending.ticks - 1)) > 255)) {
          warnings.push(`Song channel ${ch + 1}: pitch slide over ${pending.ticks} ticks dropped (TAD portamento velocity outside 1..255).`);
          pending.tok = plain; oct = o2;
        }
      }
      if (pending.ticks > 0) out.push(`${pending.tok}%${pending.ticks}${slur || short ? ' &' : ''}`);
      pending = { tok: slur ? curNote : 'r', ticks: 0 };
    };
    rows.forEach((r, i) => {
      const at = where(ch, r);
      const cl = cell(ch, r.pos, r.row);
      if (i === loopRow) {
        flush(true); out.push('L');
        // The loop point joins two instrument states, so the compiler narrows the note range to the overlap of both
        // (bytecode.rs:1768 InstrumentState::Multiple); naming the instrument again keeps the full range.
        if (curIns >= 0) out.push(`@${curIns}`);
      }
      let delayUsed = 0, cutAt = 0;
      if (cl) {
        if (cl.ins >= 0) { ins = cl.ins; env = null; lastEnv = ''; }
        const cmds: string[] = [];
        // Constant special (ex1) macro, snes.cpp:152-172: bit 2 echo, bit 4 pitch modulation.
        const ex1 = cl.ins >= 0 ? constantMacro(instruments[ins], 5) : undefined;
        if (ex1 !== undefined) {
          if (!sfx && echo.on && ((ex1 & 2) !== 0) !== echoOn) { echoOn = (ex1 & 2) !== 0; cmds.push(echoOn ? 'E1' : 'E0'); }
          if (((ex1 & 4) !== 0) !== pmOn) { pmOn = (ex1 & 4) !== 0; cmds.push(pmOn ? 'PM' : 'PM0'); }
        }
        if (cl.vol >= 0) volSlide = 0;
        if (cl.vol >= 0) vol = cl.vol;
        const ef = new Map<number, number>();
        for (const e of cl.effects) if (e.cmd >= 0) ef.set(e.cmd, e.val);
        let envFx = false, panFx = false;
        for (const e of cl.effects) {
          if (e.cmd < 0 || [0x09, 0x0b, 0x0d, 0x0f, 0xff].includes(e.cmd)) continue;
          if (e.cmd === 0x80 || e.cmd === 0x08) { [panL, panR] = panSplit(e.cmd, e.val); panFx = true; }
          else if (e.cmd === 0x12) { if ((e.val !== 0) !== echoOn) { echoOn = e.val !== 0; cmds.push(echoOn ? 'E1' : 'E0'); } }
          else if (!sfx && echo.on && ((e.cmd >= 0x19 && e.cmd <= 0x1c) || (e.cmd >= 0x30 && e.cmd <= 0x37))) {
            // Furnace sysDef.cpp:1212-1224 -> TAD \edl \evol \efb \ftap (mml-syntax.md:621-661). Furnace ignores them while echo is off (snes.cpp:566).
            const sv = e.val > 127 ? e.val - 256 : e.val;
            if (e.cmd === 0x19) { const d = e.val & 15; if (d > cap) drop('effect 19xx echo delay above the Audio-RAM budget (lowered)', at); maxDelay = Math.max(maxDelay, Math.min(d, cap)); cmds.push(`\\edl ${Math.min(d, cap) * 16}`); }
            else if (e.cmd === 0x1a || e.cmd === 0x1b) {
              if (sv < 0) drop('effect 1Axx/1Bxx negative (inverted) echo volume clamped to 0', at);
              const v = Math.max(0, sv);
              if (e.cmd === 0x1a) echo.volL = v; else echo.volR = v;
              cmds.push(`\\evol ${Math.max(0, echo.volL)},${Math.max(0, echo.volR)}`);
            }
            else if (e.cmd === 0x1c) cmds.push(`\\efb ${sv}`);
            else cmds.push(`\\ftap ${e.cmd - 0x30},${sv}`);
          }
          else if (e.cmd === 0x13) {
            if (sfx || c < 1 || c > 5) drop('effect 13xx (pitch modulation only on song channels B-F)', at);
            else if ((e.val !== 0) !== pmOn) { pmOn = e.val !== 0; cmds.push(pmOn ? 'PM' : 'PM0'); }
          }
          else if (e.cmd === 0x11) noiseOn = e.val !== 0; // snes.cpp:495; TAD N plays noise in place of the next notes
          else if (e.cmd === 0x1d) { /* noise frequency: read from the row walk */ }
          else if (e.cmd === 0x14) {
            // snes.cpp:503 invertL = x, invertR = y. TAD L/R act in surround mode only; M (both) in mono/stereo.
            const l = (e.val >> 4) !== 0, r = (e.val & 15) !== 0;
            const want = l && r ? 'iB' : l ? 'iL' : r ? 'iR' : 'i0';
            if (want !== inv) { inv = want; cmds.push(want); }
            if (l !== r) warnings.push(`${at}: effect 14xy inverts one side only; TAD does that in surround mode only.`);
          }
          else if (e.cmd === 0x15 || e.cmd === 0x16 || (e.cmd >= 0x20 && e.cmd <= 0x23)) envFx = true;
          else if (e.cmd === 0x04) {
            // Furnace vibrato: x = rate (64 steps per cycle), y = depth (15 = one semitone). TAD MP is a sawtooth.
            const x = e.val >> 4, y = e.val & 15;
            vibWant = x && y ? { d: Math.round(y * 100 / 15), q: Math.max(1, Math.min(255, Math.round(16 / x))) } : null; // emitted with the next note, depth clamped to that note's pitch
          }
          else if (e.cmd === 0xe5 && linear) {
            // playback.cpp:1458 pitch = val - 0x80 (1/128 semitone, linear pitch); TAD detune only applies on play-note.
            fine = e.val - 0x80;
            if (!(cl.note >= 0 && cl.note < 180)) drop('effect E5xx without a note (applies from the next note)', at);
          }
          else if (e.cmd === 0x0a) volSlide = (e.val >> 4) - (e.val & 15) || 0;
          else if ([0x00, 0x01, 0x02, 0x03, 0xec, 0xed].includes(e.cmd)) { /* applied with the note below */ }
          else drop(`effect ${hex2(e.cmd)}xx`, at);
        }
        if (panP() !== lastP) { lastP = panP(); cmds.push(`p${lastP}`); }
        // After a slide the driver volume is unknown: a written volume always lands.
        if ((cl.vol >= 0 && slid) || ((cl.vol >= 0 || cl.ins >= 0 || panFx) && volV() !== lastV)) { lastV = volV(); slid = false; cmds.push(lastV); }
        if (envFx) {
          const s = instruments[ins]?.snes;
          env ??= {
            mode: !s ? 1 : s.useEnv ? 0 : ({ 0: 1, 4: 2, 5: 3, 6: 4, 7: 5 } as Record<number, number>)[Number(s.gainMode)] ?? 1,
            gain: s?.gain ?? 127,
            adsr: s ? [s.a & 15, s.d & 7, s.s & 7, (s.sus ? s.d2 ?? 0 : s.r) & 31] : [15, 0, 7, 0], // sustain mode: d2 while held (snes.cpp:657-660)
          };
          const v15 = ef.get(0x15), v16 = ef.get(0x16);
          if (v15 !== undefined) { if (v15 <= 5) env.mode = v15; else drop('effect 15xx (gain mode above 5)', at); }
          if (v16 !== undefined) env.gain = v16;
          const lim = [15, 7, 7, 31];
          [0x20, 0x21, 0x22, 0x23].forEach((cmd, j) => { const v = ef.get(cmd); if (v !== undefined) env!.adsr[j] = v & lim[j]; });
          const touched = v15 !== undefined || [0x20, 0x21, 0x22, 0x23].some((cmd) => ef.has(cmd));
          const g = env.mode === 0
            ? (touched ? `A ${env.adsr.join(',')}` : '')
            : (v15 !== undefined || v16 !== undefined) ? `G${'FDEIB'[env.mode - 1]}${env.gain & (env.mode === 1 ? 127 : 31)}` : '';
          if (g && g !== lastEnv) { lastEnv = g; cmds.push(g); }
        }
        if (volSlide) {
          const d = Math.max(1, Math.min(255, Math.round(Math.abs(volSlide) * r.ticks / tickScale / 2 * volScale())));
          slid = true;
          cmds.push(`Vs${volSlide > 0 ? '+' : '-'}${d},${r.ticks}`);
        }
        // Pitch effects: Furnace slide speed is xx * pitchSlideSpeed (default 4) units per tick, 128 per semitone.
        const slideMul = Number(native.compatFlags?.pitchSlideSpeed ?? 4);
        const semis = (speed: number, ticks: number) => Math.trunc(speed * slideMul * ticks / tickScale / 128);
        const clampP = (p: number) => Math.max(0, Math.min(95, p));
        const delay = Math.round((ef.get(0xed) ?? 0) * tickScale);
        const cut = Math.round((ef.get(0xec) ?? 0) * tickScale);
        const s03 = ef.get(0x03) ?? 0, s01 = ef.get(0x01) ?? 0, s02 = ef.get(0x02) ?? 0, arp = ef.get(0x00) ?? 0;
        cutAt = cut > 0 ? Math.max(cut, 2) : 0; // a key-off note needs 2 ticks
        const left = Math.max(1, r.ticks - (delay < r.ticks ? delay : 0));
        // Pitch token replacing the plain note: slide `{..}` or broken chord `{{..}}`, or null.
        // start = pitch the token starts from (-1: previous slurred note), returns the token and end pitch.
        // Portamento velocity as the compiler computes it (command_compiler/channel_bc_generator.rs:760-775): round(register delta / slide ticks),
        // slide ticks = row ticks - 1 (the key-off tick), must be 1..=255 (bytecode.rs:617 PortamentoVelocity, errors.rs:1171). Register: pitch_table.rs:146-157.
        const pitchReg = (p: number, smp = curSmp) => {
          const hz = smp[0] === 'w' ? 32000 / smpNum(smp) : samples[smpNum(smp)] ? sampleTuningHz(samples[smpNum(smp)], tuningHz) : 0;
          return hz ? 4096 * 2 ** ((p - Math.round(Math.log2(hz / 440) * 12e6 + 57e6) / 1e6) / 12) : 0;
        };
        const pitchFx = (start: number, newPitch: number): { tok: string; end: number; first: number } | null => {
          const from = start >= 0 ? start : newPitch;
          if (s03 > 0 && start >= 0 && newPitch >= 0 && newPitch !== start) {
            const d = Math.min(Math.abs(newPitch - start), semis(s03, left));
            const end = start + Math.sign(newPitch - start) * d;
            return d && left <= 8 * d && Math.min(start, newPitch) >= 12 ? { tok: 'slide', end, first: start } : null;
          }
          const sp = s01 > 0 ? s01 : s02 > 0 ? -s02 : 0;
          if (sp && from >= 0) {
            const end = clampP(from + (sp > 0 ? 1 : -1) * semis(Math.abs(sp), left));
            return end !== from && left <= 8 * Math.abs(end - from) && Math.min(from, end) >= 12 ? { tok: 'slide', end, first: from } : null; // slower slides give TAD portamento speed 0
          }
          if (arp && from >= 0 && tickScale === 1) return { tok: 'arp', end: from, first: from };
          return null;
        };
        const fxToken = (fx: { tok: string; end: number; first: number }, keepFirst: boolean): string => {
          if (fx.tok === 'arp') {
            const ps = [fx.first, clampP(fx.first + (arp >> 4)), clampP(fx.first + (arp & 15))];
            let o = oct, s = '';
            for (const p of ps) { if (Math.floor(p / 12) !== o) { o = Math.floor(p / 12); s += `o${o} `; } s += `${pitchName(p)} `; }
            for (const p of ps) widen(curSmp, p);
            oct = -1; // the chord ends on an unknown octave
            curNote = `o${Math.floor(fx.first / 12)} ${pitchName(fx.first)}`;
            curPitch = fx.first;
            return `{{${s.trim()}}}`;
          }
          const o2 = Math.floor(fx.end / 12);
          widen(curSmp, fx.end);
          let t = keepFirst ? `${pitchName(fx.first)} ` : '';
          if (o2 !== oct) { if (keepFirst) t += `o${o2} `; else out.push(`o${o2}`); }
          oct = o2;
          curNote = pitchName(fx.end);
          curPitch = fx.end;
          const plain = keepFirst ? `${Math.floor(fx.first / 12) !== o2 ? `o${Math.floor(fx.first / 12)} ` : ''}${pitchName(fx.first)}` : pitchName(fx.end);
          pending.sl = { a: fx.first, b: fx.end, smp: curSmp, plain, oct: keepFirst ? Math.floor(fx.first / 12) : o2, reg: pitchReg };
          return `{${t}${pitchName(fx.end)}}`;
        };
        const isNote = cl.note >= 0 && cl.note < 180;
        const isOff = cl.note === NOTE_OFF || cl.note === NOTE_RELEASE;
        const legato = isNote && s03 > 0 && sounding && curPitch >= 0;
        const legatoFx = legato ? pitchFx(curPitch, (() => { const n = soundOf(instruments[ins], cl.note)?.note; return n === undefined ? -1 : clampP(n - FURNACE_NOTE_OFFSET); })()) : null;
        if (legato) {
          // 03xx: glide from the sounding note to the new one, no new key-on.
          flush(true); out.push(...cmds);
          if (legatoFx) pending.tok = fxToken(legatoFx, false);
        } else if (isNote) {
          const sound = soundOf(instruments[ins], cl.note);
          const am = arpMacro(instruments[ins]);
          const tad = (sound?.note ?? 0) - FURNACE_NOTE_OFFSET + (am?.hold ?? 0);
          if (!sound) {
            if (!insWarned.has(ins)) { insWarned.add(ins); warnings.push(`Instrument ${ins} has no sample or wavetable for some notes; those notes are rests.`); }
            flush(); out.push(...cmds); sounding = false; pending = { tok: 'r', ticks: 0 };
          } else if (tad < 0 || tad > 95 || outside(sound.smp, tad)) {
            drop(`notes outside the pitch range of sample ${sound.smp} (instrument ${ins})`, `${at}, note ${NOTE_NAMES[((tad % 12) + 12) % 12]}${Math.floor(tad / 12)}`);
            flush(); out.push(...cmds); sounding = false; pending = { tok: 'r', ticks: 0 };
          } else {
            if (delay > 0 && delay < r.ticks) { pending.ticks += delay; delayUsed = delay; } // EDxx: the old note rings on
            flush();
            curSmp = sound.smp;
            // MP depth: compiler channel_bc_generator.rs:146-190 - round(reg * (2^(cents/1200) - 2^-(cents/1200)) / (2 * quarter wavelength)) must be <= 255.
            let want = 'MP0';
            if (vibWant) {
              const reg = pitchReg(tad);
              let d = vibWant.d;
              while (reg && d > 0 && Math.round(reg * (2 ** (d / 1200) - 2 ** (-d / 1200)) / (2 * vibWant.q)) > 255) d--;
              if (d < vibWant.d) warnings.push(`${at}: vibrato depth ${vibWant.d} cents reduced to ${d} (pitch offset per tick too large).`);
              if (d > 0) want = `MP${d},${vibWant.q}`;
            }
            if (want !== vib) { vib = want; cmds.push(want); }
            // snes.cpp:136-144 + engine.cpp calcFreq: a constant pitch macro plus E5xx is a fixed offset, 1/128 semitone (linear) or raw VxPITCH.
            const pm = (pitchMacro(instruments[ins]) ?? 0) + fine;
            const dv = linear ? Math.max(-1200, Math.min(1200, Math.round(pm * 100 / 128))) : Math.max(-16383, Math.min(16383, pm));
            const wantDet = `${linear ? 'MD' : 'D'}${dv > 0 ? '+' : ''}${dv}`; // TAD needs the sign (mml-syntax.md:562-568), except 0
            if (wantDet !== det && (det || pm)) cmds.push(wantDet);
            det = wantDet;
            const key = `${ins} ${sound.smp}`;
            const id = tadIns.get(key) ?? tadIns.size;
            tadIns.set(key, id);
            if (id !== curIns) { curIns = id; out.push(`@${id}`); }
            out.push(...cmds);
            const o = Math.floor(tad / 12);
            if (o !== oct) { oct = o; out.push(`o${o}`); }
            const smp = sound.smp;
            widen(smp, tad);
            curNote = NOTE_NAMES[tad % 12];
            curPitch = tad;
            pending = { tok: curNote, ticks: 0 };
            sounding = true;
            hasNotes = true;
            const fx = pitchFx(-1, tad);
            if (fx) pending.tok = fxToken(fx, true);
            if (noiseOn) {
              // Noise ignores the note pitch (snes.cpp:278 FLG noise clock); arp and slides have nothing to move.
              if (fx) drop('pitch effects on noise notes', at);
              curNote = pending.tok = `N${r.noise},`;
            }
            else if (am === null) drop(`arp macros that loop, release or use fixed notes (instrument ${ins})`, at);
            else if (am?.steps.length) {
              const pre = am.steps.map((o) => tad - am.hold + o);
              if (fx) drop(`arp macro steps under a pitch effect (instrument ${ins})`, at);
              else if (!Number.isInteger(tickScale)) drop(`arp macro steps in sound effects (instrument ${ins})`, at);
              else if (pre.some((p) => p < 0 || p > 95 || outside(smp, p))) drop(`arp macro steps outside the pitch range of sample ${smp} (instrument ${ins})`, at);
              else {
                for (const p of pre) widen(smp, p);
                pending.pre = pre.reduce<{ p: number; ticks: number }[]>((a, p) => {
                  const last = a[a.length - 1];
                  if (last?.p === p) last.ticks += tickScale; else a.push({ p, ticks: tickScale });
                  return a;
                }, []);
              }
            }
          }
        } else if (isOff && sounding && instruments[ins]?.snes?.sus) {
          // Sustain mode (snes.cpp:655-676): note off sends no KOFF; the release is GAIN decrease (sus 1, 2) or the
          // ADSR sustain rate switched to r (sus 3). The note is slurred into a wait with that release envelope.
          const si = instruments[ins]!.snes!;
          flush(true); out.push(...cmds);
          if (si.useEnv) {
            out.push(si.sus === 1 ? `GDT${si.r & 31}` : si.sus === 2 ? `GET${si.r & 31}` : `A ${si.a & 15},${si.d & 7},${si.s & 7},${si.r & 31}`);
            if (si.sus === 3) { curIns = -1; lastEnv = ''; } // the next note names the instrument again, restoring d2
          }
          sounding = false; curPitch = -1; pending = { tok: 'w', ticks: 0 };
        } else if (isOff || cmds.length || (sounding && curPitch >= 0 && (s01 || s02 || arp))) {
          flush(!isOff);
          out.push(...cmds);
          if (isOff) { sounding = false; curPitch = -1; pending = { tok: 'r', ticks: 0 }; }
          else if (sounding && curPitch >= 0) {
            const fx = pitchFx(curPitch, curPitch);
            if (fx) pending.tok = fxToken(fx, false);
          }
        }
      }
      // ECxx: the note is cut inside the row.
      if (cutAt > delayUsed && cutAt < r.ticks && sounding) {
        pending.ticks += cutAt - delayUsed;
        flush(); sounding = false; curPitch = -1; pending = { tok: 'r', ticks: 0 };
        pending.ticks += r.ticks - cutAt;
        return;
      }
      pending.ticks += r.ticks - delayUsed;
    });
    flush();
    if (!hasNotes) continue;
    if (sfx) {
      if (sfxChannel >= 0) { warnings.push(`Sound effects play on one channel: channel ${ch + 1} dropped (kept channel ${sfxChannel + 1}).`); continue; }
      sfxChannel = ch;
    }
    const letter = sfx ? 'A' : 'ABCDEFGH'[c];
    for (let i = 0; i < out.length; i += 24) channelMml.push(`${letter} ${out.slice(i, i + 24).join(' ')}`);
  }
  if (loopRow === null && !sfx) warnings.push('The song stops (FFxx) and does not loop.');

  // Instruments and samples.
  const insLines: string[] = [];
  const sampleFiles = new Map<string, TadSampleFile>();
  const tuning = native.tuning ?? 440;
  const macroWarned = new Set<number>();
  for (const [key, id] of tadIns) {
    const [iStr, smp] = key.split(' ');
    const i = Number(iStr);
    const inst = instruments[i];
    const dropped = (inst.macros ?? []).filter((m) => m.data.length > 0 && !macroCarried(inst, m.code ?? -1)).map((m) => MACRO_NAMES[m.code ?? -1] ?? `macro ${m.code}`);
    if (dropped.length && !macroWarned.has(i)) { macroWarned.add(i); warnings.push(`Instrument ${i} (${inst.name}): ${dropped.join(', ')} macro${dropped.length > 1 ? 's' : ''} dropped.`); }
    insLines.push(`@${id} ${smp} ${envelope(inst, warnings, i)}`);
    if (!sampleFiles.has(smp)) {
      const octaves = sampleOctaves.get(smp) ?? [48, 48];
      const [n, wi = 0] = smp.slice(1).split('_').map(Number);
      const f = smp[0] === 'w' ? waveFile(wavetables[wi], n, octaves, smp) : sampleFile(samples[n], n, tuning, octaves, warnings);
      if (f) sampleFiles.set(smp, f);
    }
  }

  for (const [what, d] of dropped) warnings.push(`Dropped ${what}: ${d.n}x, first at ${d.at}.`);

  if (sfx) {
    const block = channelMml.length ? [...insLines, '', ...channelMml, ''].join('\n') : '';
    if (!block) warnings.push('The sound effect has no notes on an SNES channel.');
    return { mml: block, samples: [...sampleFiles.values()], warnings: [...new Set(warnings)] };
  }
  // Header: Furnace echo flags -> TAD (mml-syntax.md:51-77). Furnace only runs echo when the flag is on (snes.cpp:836).
  const echoHeader: string[] = [];
  if (echoInit.on) {
    const sum = echoInit.fir.reduce((a, b) => a + Math.abs(b), 0);
    const inv = echoInit.volL < 0 && echoInit.volR < 0;
    echoHeader.push(
      `#EchoLength ${echoInit.delay * 16}`,
      ...(maxDelay > echoInit.delay ? [`#MaxEchoLength ${maxDelay * 16}`] : []),
      `#FirFilter ${echoInit.fir.join(' ')}`,
      ...(sum > 128 ? ['#DisableFirFilterLimit'] : []),
      `#EchoFeedback ${echoInit.feedback}`,
      `#EchoVolume ${Math.abs(echoInit.volL)} ${Math.abs(echoInit.volR)}`,
      ...(inv ? ['#EchoInvert both'] : []),
    );
    if (sum > 128) warnings.push(`FIR filter absolute sum ${sum} exceeds 128; the compiler's limit is disabled and the echo may overflow.`);
    if ((echoInit.volL < 0) !== (echoInit.volR < 0)) warnings.push('Echo volume has one negative side; TAD cannot invert one side here, so it is made positive.');
  }
  const mml = [
    `#Title ${input.title.replace(/[\r\n]/g, ' ')}`,
    `#Timer ${timer}`,
    ...echoHeader,
    '',
    ...insLines,
    '',
    ...channelMml,
    '',
  ].join('\n');
  return { mml, samples: [...sampleFiles.values()], warnings: [...new Set(warnings)] };
}

const GAIN_PREFIX: Record<number, string> = { 4: 'D', 5: 'E', 6: 'I', 7: 'B' };

// Furnace macro codes the SNES platform reads (snes.cpp:112-200).
const MACRO_NAMES: Record<number, string> = { 0: 'volume', 1: 'arpeggio', 2: 'noise frequency', 3: 'wave', 4: 'pitch', 5: 'special', 6: 'gain', 12: 'panning left', 13: 'panning right', 14: 'phase reset' };
// Constant macro values that change nothing (no arp, no pitch offset).
const NO_OP_MACRO: Record<number, number> = { 1: 0, 4: 0 };

/** 08xy / 80xx to Furnace SNES panL/panR 0-127: playback.cpp:966-978 (8-bit split, convertPanLinearToSplit), snes.cpp:443 (>>1). */
export function panSplit(cmd: number, v: number): [number, number] {
  const [l, r] = cmd === 0x08 ? [(v >> 4) | (v & 0xf0), (v & 15) | ((v & 15) << 4)] : [Math.min(255, (255 - v) * 2), Math.min(255, v * 2)];
  return [l >> 1, r >> 1];
}
/** Macros the writer carries as a constant: volume scales V, special sets echo/pitch mod, wave picks the wavetable. */
function macroCarried(inst: TadInstrumentInput, code: number): boolean {
  if (code === 1) return arpMacro(inst) !== null;
  const v = constantMacro(inst, code);
  if (v === undefined) return false;
  if (code === 0 || code === 3 || code === 12 || code === 13) return true;
  if (code === 5) return (v & (16 | 8 | 1)) === 0; // invert and noise have no TAD command
  if (code === 4) return pitchMacro(inst) !== undefined;
  return NO_OP_MACRO[code] === v;
}

function envelope(inst: TadInstrumentInput, warnings: string[], i: number): string {
  const s = inst.snes;
  if (!s) return 'gain F127';
  // Sustain mode: the held note decays at d2; r is the release, emitted at note off (snes.cpp:657-676).
  if (s.useEnv) return `adsr ${s.a & 15} ${s.d & 7} ${s.s & 7} ${(s.sus ? s.d2 ?? 0 : s.r) & 31}`;
  const mode = Number(s.gainMode);
  if (mode === 0) return `gain F${s.gain & 127}`;
  const prefix = GAIN_PREFIX[mode];
  if (prefix) return `gain ${prefix}${s.gain & 31}`;
  warnings.push(`Instrument ${i} (${inst.name}): gain mode ${s.gainMode} unknown; using full volume.`);
  return 'gain F127';
}

function toInt16(s: FurnaceModuleSample): Int16Array {
  const n = s.samples ?? s.data.length;
  if (s.data instanceof Int16Array) return s.data.subarray(0, n);
  const out = new Int16Array(n);
  if (s.depth === 8) for (let i = 0; i < n; i++) out[i] = (s.data[i] << 24) >> 16; // signed 8-bit
  else for (let i = 0; i < n; i++) out[i] = (s.data[2 * i] | (s.data[2 * i + 1] << 8)) << 16 >> 16; // 16-bit LE bytes
  return out;
}

/**
 * Wavetable as a looped BRR sample, byte for byte what Furnace writes to SNES sample RAM
 * (snes.cpp updateWave): range 11, filter 0, 4-bit wave value - 8, loop over the whole wave.
 */
function waveFile(w: FurnaceWavetable, len: number, octaves: [number, number], name: string): TadSampleFile {
  // Furnace DivWaveSynth::changeWave1: nearest-index stretch to len, scale to 0..15.
  const value = (k: number) => {
    if (w.height < 1 || w.data.length < 1) return 0;
    const v = Math.trunc(w.data[Math.trunc(k * w.data.length / len)] * 15 / w.height);
    return (Math.min(15, Math.max(0, v)) - 8) & 15;
  };
  const data = new Uint8Array(len / 16 * 9);
  for (let b = 0; b < len / 16; b++) {
    data[b * 9] = 0xb0;
    for (let j = 0; j < 8; j++) data[b * 9 + 1 + j] = (value(b * 16 + j * 2) << 4) | value(b * 16 + j * 2 + 1);
  }
  data[data.length - 9] = 0xb3;
  const path = `samples/${name}.brr`;
  // One wave period is one note cycle (Furnace wavePitchTable scales with the wave length), so the
  // wave played at 32 kHz sounds 32000/len Hz. Unverified by ear; check in the P4 owner test.
  const pitches = { type: 'notes', frequency: 32000 / len, first_note: String(octaves[0]), last_note: String(octaves[1]) };
  return {
    name, path, data,
    entry: { name, source: { type: 'brr', source: path, loop_point: 0 }, ignore_gaussian_overflow: false, pitches, envelope: 'gain F127' },
  };
}

/** One silent looping BRR block: the instrument lines that name the sample still compile, its notes make no sound. */
function silentSample(name: string, pitches: Record<string, unknown>): TadSampleFile {
  const path = `samples/${name}.brr`;
  const data = new Uint8Array(9);
  data[0] = 0xb3; // range 11, filter 0, loop + end
  return { name, path, data, entry: { name, source: { type: 'brr', source: path, loop_point: 0 }, ignore_gaussian_overflow: true, pitches, envelope: 'gain F127' } };
}

function sampleFile(
  s: FurnaceModuleSample, idx: number, tuning: number, octaves: [number, number], warnings: string[],
): TadSampleFile | null {
  const name = `s${idx}`;
  const label = `Sample ${idx} (${s.name})`;
  // A sample played at c4Rate sounds C-4; TAD wants the frequency of the sample played at 32 kHz.
  const frequency = sampleTuningHz(s, tuning);
  const pitches = { type: 'notes', frequency, first_note: String(octaves[0]), last_note: String(octaves[1]) };
  const looped = s.loopStart >= 0 && s.loopEnd > s.loopStart;
  if (looped && s.loopMode !== 0) warnings.push(`${label}: ${s.loopMode === 1 ? 'backward' : 'ping-pong'} loop plays forward.`);
  // BRR data is the Furnace author's own encoding for the same hardware: the compiler's gaussian overflow check
  // (samples.rs:216) would refuse it, so it is exported as authored. Wave files stay checked.
  const entry = (path: string, source: Record<string, unknown>) => ({
    name, source: { ...source, source: path }, ignore_gaussian_overflow: source.type === 'brr', pitches, envelope: 'gain F127',
  });

  if (s.depth === 9) {
    const path = `samples/${name}.brr`;
    const raw = s.data instanceof Uint8Array ? s.data : new Uint8Array(s.data.buffer, s.data.byteOffset, s.data.byteLength);
    const data = raw.slice(0, raw.length - (raw.length % 9));
    if (!data.length) { warnings.push(`${label}: empty BRR sample; its notes are silent.`); return silentSample(name, pitches); }
    // Furnace stores BRR without END/LOOP flags (it sets them on upload); TAD wants them in the file.
    for (let b = 0; b < data.length; b += 9) data[b] &= 0xfc;
    data[data.length - 9] |= looped ? 3 : 1;
    const source: Record<string, unknown> = { type: 'brr' };
    if (looped) {
      source.loop_point = s.loopStart - (s.loopStart % 16);
      if (s.loopStart % 16) warnings.push(`${label}: BRR loop start ${s.loopStart} moved to block start ${source.loop_point}.`);
    }
    return { name, path, data, entry: entry(path, source) };
  }
  if (s.depth !== 8 && s.depth !== 16) {
    warnings.push(`${label}: sample depth ${s.depth} cannot be exported; its notes are silent.`);
    return silentSample(name, pitches);
  }

  const pcm = toInt16(s);
  // TAD needs the loop start and the length on 16-sample BRR blocks: pad the start with silence.
  // shortcut: loop length is cut down to a multiple of 16 (pitch of the loop drifts); resample the loop to fix.
  const pre = looped ? (16 - (s.loopStart % 16)) % 16 : 0;
  let body: Int16Array;
  let loopPoint: number | undefined;
  if (looped) {
    const len = s.loopEnd - s.loopStart;
    const len16 = len - (len % 16);
    if (len16 === 0) {
      warnings.push(`${label}: loop shorter than 16 samples; exported without loop.`);
      body = pcm;
    } else {
      if (len16 !== len) warnings.push(`${label}: loop length ${len} cut to ${len16} (TAD loops are 16-sample blocks).`);
      body = pcm.subarray(0, s.loopStart + len16);
      loopPoint = pre + s.loopStart;
    }
  } else body = pcm;
  const total = Math.ceil((pre + body.length) / 16) * 16 || 16;
  const padded = new Int16Array(total);
  padded.set(body, pre);
  const path = `samples/${name}.wav`;
  const source: Record<string, unknown> = { type: 'wav' };
  if (loopPoint !== undefined) source.loop_point = loopPoint;
  const data = new Uint8Array(createWavFile(padded, Math.round(s.rate || 32000)));
  return { name, path, data, entry: entry(path, source) };
}

/** Frequency of a sample played at 32 kHz; a sample played at c4Rate sounds C-4. */
function sampleTuningHz(s: FurnaceModuleSample, tuning: number): number {
  return (tuning * 2 ** (-9 / 12)) * 32000 / (s.rate || 32000);
}

/** Playable TAD note ids for a tuning frequency (mirrors tad-wasm compiler pitch_table.rs note_pitches). */
export function tadNoteRange(freq: number): [number, number] {
  const mst = Math.round(Math.log2(freq / 440) * 12e6 + 57e6);
  const semis = Math.floor(mst / 1e6);
  const maxInc = Math.floor((Math.floor(Math.log2(0x3fff / 0x1000) * 12e6) + (mst % 1e6)) / 1e6);
  return [Math.max(0, semis - 95), Math.min(95, semis + maxInc)];
}

type NotePitches = { first_note: string; last_note: string };
/** Same sample used twice: note range widened to cover both. */
export function widenTadPitches(a: unknown, b: unknown): Record<string, unknown> {
  const x = a as NotePitches, y = b as NotePitches;
  return { ...x, first_note: String(Math.min(+x.first_note, +y.first_note)), last_note: String(Math.max(+x.last_note, +y.last_note)) };
}

/**
 * One sample list from the songs and sound effects of one Furnace file: same name = same sample,
 * octave range widened to cover every user (TAD rejects notes outside a sample's octaves).
 */
export function mergeTadSamples(lists: TadSampleFile[][]): TadSampleFile[] {
  const out = new Map<string, TadSampleFile>();
  for (const f of lists.flat()) {
    const have = out.get(f.name);
    if (!have) { out.set(f.name, f); continue; }
    const pitches = widenTadPitches(have.entry.pitches, f.entry.pitches);
    out.set(f.name, { ...have, entry: { ...have.entry, pitches } });
  }
  return [...out.values()];
}

/** TAD sound effect file name in the project (holds every `writeTadSfx` block). */
export const TAD_SFX_FILE = 'sound-effects.txt';
