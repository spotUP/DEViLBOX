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
  hasMacros?: boolean;
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

interface LinearRow { pos: number; row: number; ticks: number }

/** First SNES channel index in the song and the SNES channel count. */
function snesChannels(native: FurnaceNativeData): { first: number; count: number } | null {
  let first = 0;
  for (let i = 0; i < native.chipIds.length; i++) {
    const n = native.systemChans?.[i] ?? 8;
    if (native.chipIds[i] === FURNACE_SNES_CHIP_ID) return { first, count: Math.min(n, 8) };
    first += n;
  }
  return null;
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
  let pos = 0, row = 0;
  while (rows.length < ROW_GUARD) {
    visited.set(`${pos}:${row}`, rows.length);
    let jump: number | null = null, brk: number | null = null, stop = false;
    for (let ch = 0; ch < nCh; ch++) {
      for (const e of cell(ch, pos, row)?.effects ?? []) {
        if (e.cmd === 0x0f && e.val > 0) { speeds = [e.val]; speedIdx = 0; }
        else if (e.cmd === 0x09) {
          const g = native.grooves?.[e.val];
          if (g?.len) { speeds = g.val.slice(0, g.len); speedIdx = 0; }
        }
        else if (e.cmd === 0x0b) jump = e.val;
        else if (e.cmd === 0x0d) brk = e.val;
        else if (e.cmd === 0xff) stop = true;
      }
    }
    rows.push({ pos, row, ticks: (speeds[speedIdx++ % speeds.length] || 1) * k });
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
  const sampleOctaves = new Map<string, [number, number]>();
  const wavetables = input.wavetables ?? [];
  // TAD sample name an instrument plays: `s<sample>` or `w<length>` (wavetable 0; Furnace starts
  // every channel on wave 0 and 10xx wave changes are dropped effects).
  // Note map: Furnace plays sample noteMap[note].map at note noteMap[note].freq (DivInstrumentAmiga,
  // 180 entries indexed by Furnace note = row note value).
  const soundOf = (inst: TadInstrumentInput | undefined, note: number): { smp: string; note: number } | null => {
    if (!inst) return null;
    if (inst.useWave) return wavetables[0] ? { smp: `w${Math.max(16, ((inst.waveLen ?? 31) + 1) & ~15)}`, note } : null;
    let s = inst.initSample ?? 0;
    if (inst.useNoteMap && inst.noteMap) {
      const m = inst.noteMap[Math.max(0, Math.min(179, note))];
      s = m?.map ?? -1;
      note = m?.freq ?? note;
    }
    return s >= 0 && samples[s] ? { smp: `s${s}`, note } : null;
  };
  const insWarned = new Set<number>();
  const channelMml: string[] = [];
  let sfxChannel = -1;
  for (let c = 0; c < snes.count; c++) {
    const ch = snes.first + c;
    const out: string[] = ['V254'];
    let ins = 0, curIns = -1, vol = 127, pan = 64, oct = -1;
    let pending: { tok: string; ticks: number } = { tok: 'r', ticks: 0 };
    let sounding = false, curNote = 'r';
    let hasNotes = false;
    // cont: the note keeps sounding past this boundary. TAD has no tie after a command, so the
    // note is slurred (`&`) into a repeat of itself.
    const flush = (cont = false) => {
      const slur = cont && sounding;
      if (pending.ticks > 0) out.push(`${pending.tok}%${pending.ticks}${slur ? ' &' : ''}`);
      pending = { tok: slur ? curNote : 'r', ticks: 0 };
    };
    rows.forEach((r, i) => {
      const at = where(ch, r);
      const cl = cell(ch, r.pos, r.row);
      if (i === loopRow) { flush(true); out.push('L'); }
      if (cl) {
        if (cl.ins >= 0) ins = cl.ins;
        const cmds: string[] = [];
        if (cl.vol >= 0 && cl.vol !== vol) { vol = cl.vol; cmds.push(`V${Math.min(255, vol * 2)}`); }
        for (const e of cl.effects) {
          if (e.cmd < 0 || [0x09, 0x0b, 0x0d, 0x0f, 0xff].includes(e.cmd)) continue;
          let p: number | null = null;
          if (e.cmd === 0x80) p = Math.round(e.val * 128 / 255);
          else if (e.cmd === 0x08) p = Math.round(64 + ((e.val & 15) - (e.val >> 4)) * 64 / 15);
          else drop(`effect ${hex2(e.cmd)}xx`, at);
          if (p !== null && p !== pan) { pan = p; cmds.push(`p${pan}`); }
        }
        const isNote = cl.note >= 0 && cl.note < 180;
        const isOff = cl.note === NOTE_OFF || cl.note === NOTE_RELEASE;
        if (isNote) {
          const sound = soundOf(instruments[ins], cl.note);
          const tad = (sound?.note ?? 0) - FURNACE_NOTE_OFFSET;
          if (!sound) {
            if (!insWarned.has(ins)) { insWarned.add(ins); warnings.push(`Instrument ${ins} has no sample or wavetable for some notes; those notes are rests.`); }
            flush(); out.push(...cmds); sounding = false; pending = { tok: 'r', ticks: 0 };
          } else if (tad < 0 || tad > 95) {
            drop('notes outside TAD octaves 0-7', at);
            flush(); out.push(...cmds); sounding = false; pending = { tok: 'r', ticks: 0 };
          } else {
            flush();
            const key = `${ins} ${sound.smp}`;
            const id = tadIns.get(key) ?? tadIns.size;
            tadIns.set(key, id);
            if (id !== curIns) { curIns = id; out.push(`@${id}`); }
            out.push(...cmds);
            const o = Math.floor(tad / 12);
            if (o !== oct) { oct = o; out.push(`o${o}`); }
            const smp = sound.smp;
            const range = sampleOctaves.get(smp);
            sampleOctaves.set(smp, range ? [Math.min(range[0], o), Math.max(range[1], o)] : [o, o]);
            curNote = NOTE_NAMES[tad % 12];
            pending = { tok: curNote, ticks: 0 };
            sounding = true;
            hasNotes = true;
          }
        } else if (isOff || cmds.length) {
          flush(!isOff);
          out.push(...cmds);
          if (isOff) { sounding = false; pending = { tok: 'r', ticks: 0 }; }
        }
      }
      pending.ticks += r.ticks;
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
    if (inst.hasMacros && !macroWarned.has(i)) { macroWarned.add(i); warnings.push(`Instrument ${i} (${inst.name}): macros dropped.`); }
    insLines.push(`@${id} ${smp} ${envelope(inst, warnings, i)}`);
    if (!sampleFiles.has(smp)) {
      const octaves = sampleOctaves.get(smp) ?? [4, 4];
      const n = Number(smp.slice(1));
      const f = smp[0] === 'w' ? waveFile(wavetables[0], n, octaves) : sampleFile(samples[n], n, tuning, octaves, warnings);
      if (f) sampleFiles.set(smp, f);
    }
  }

  for (const [what, d] of dropped) warnings.push(`Dropped ${what}: ${d.n}x, first at ${d.at}.`);

  if (sfx) {
    const block = channelMml.length ? [...insLines, '', ...channelMml, ''].join('\n') : '';
    if (!block) warnings.push('The sound effect has no notes on an SNES channel.');
    return { mml: block, samples: [...sampleFiles.values()], warnings: [...new Set(warnings)] };
  }
  const mml = [
    `#Title ${input.title.replace(/[\r\n]/g, ' ')}`,
    `#Timer ${timer}`,
    '',
    ...insLines,
    '',
    ...channelMml,
    '',
  ].join('\n');
  return { mml, samples: [...sampleFiles.values()], warnings: [...new Set(warnings)] };
}

const GAIN_PREFIX: Record<number, string> = { 4: 'D', 5: 'E', 6: 'I', 7: 'B' };

function envelope(inst: TadInstrumentInput, warnings: string[], i: number): string {
  const s = inst.snes;
  if (!s) return 'gain F127';
  if (s.sus) warnings.push(`Instrument ${i} (${inst.name}): sustain mode ${s.sus} dropped.`);
  if (s.useEnv) return `adsr ${s.a & 15} ${s.d & 7} ${s.s & 7} ${s.r & 31}`;
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
function waveFile(w: FurnaceWavetable, len: number, octaves: [number, number]): TadSampleFile {
  const name = `w${len}`;
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
  const pitches = { type: 'octave', frequency: 32000 / len, first_octave: octaves[0], last_octave: octaves[1] };
  return {
    name, path, data,
    entry: { name, source: { type: 'brr', source: path, loop_point: 0 }, ignore_gaussian_overflow: false, pitches, envelope: 'gain F127' },
  };
}

function sampleFile(
  s: FurnaceModuleSample, idx: number, tuning: number, octaves: [number, number], warnings: string[],
): TadSampleFile | null {
  const name = `s${idx}`;
  const label = `Sample ${idx} (${s.name})`;
  // A sample played at c4Rate sounds C-4; TAD wants the frequency of the sample played at 32 kHz.
  const frequency = (tuning * 2 ** (-9 / 12)) * 32000 / (s.rate || 32000);
  const pitches = { type: 'octave', frequency, first_octave: octaves[0], last_octave: octaves[1] };
  const looped = s.loopStart >= 0 && s.loopEnd > s.loopStart;
  if (looped && s.loopMode !== 0) warnings.push(`${label}: ${s.loopMode === 1 ? 'backward' : 'ping-pong'} loop plays forward.`);
  const entry = (path: string, source: Record<string, unknown>) => ({
    name, source: { ...source, source: path }, ignore_gaussian_overflow: false, pitches, envelope: 'gain F127',
  });

  if (s.depth === 9) {
    const path = `samples/${name}.brr`;
    const raw = s.data instanceof Uint8Array ? s.data : new Uint8Array(s.data.buffer, s.data.byteOffset, s.data.byteLength);
    const data = raw.slice(0, raw.length - (raw.length % 9));
    if (!data.length) { warnings.push(`${label}: empty BRR sample; its notes are silent.`); return null; }
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
    return null;
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

/**
 * One sample list from the songs and sound effects of one Furnace file: same name = same sample,
 * octave range widened to cover every user (TAD rejects notes outside a sample's octaves).
 */
export function mergeTadSamples(lists: TadSampleFile[][]): TadSampleFile[] {
  const out = new Map<string, TadSampleFile>();
  for (const f of lists.flat()) {
    const have = out.get(f.name);
    if (!have) { out.set(f.name, f); continue; }
    const a = have.entry.pitches as { first_octave: number; last_octave: number };
    const b = f.entry.pitches as { first_octave: number; last_octave: number };
    const pitches = { ...a, first_octave: Math.min(a.first_octave, b.first_octave), last_octave: Math.max(a.last_octave, b.last_octave) };
    out.set(f.name, { ...have, entry: { ...have.entry, pitches } });
  }
  return [...out.values()];
}

/** TAD sound effect file name in the project (holds every `writeTadSfx` block). */
export const TAD_SFX_FILE = 'sound-effects.txt';

/** Project JSON for one song, its sound effects (export order) and samples (P3 merges several songs). */
export function tadProjectJson(songName: string, songFile: string, samples: TadSampleFile[], sfxNames: string[] = []): string {
  return JSON.stringify({
    _about: { file_type: 'Terrific Audio Driver project file', version: '0.4.2' },
    brr_samples: samples.map((s) => s.entry),
    songs: [{ name: songName, source: songFile }],
    ...(sfxNames.length ? { default_sfx_flags: { one_channel: true, interruptible: true }, sound_effect_file: TAD_SFX_FILE } : {}),
    sound_effects: sfxNames,
  }, null, 2);
}
