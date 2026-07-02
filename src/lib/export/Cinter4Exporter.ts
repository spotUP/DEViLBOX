/**
 * Cinter4Exporter.ts — encode a ProTracker module into Cinter 4 songdata
 *
 * A faithful 1:1 port of askeksa/Cinter's convert/CinterConvert.py. Given a
 * ProTracker MOD whose Cinter instruments carry their parameters in the sample
 * names, this produces the exact songdata binary the Amiga player consumes —
 * byte-identical to running CinterConvert.py on the same module. The Amiga
 * regenerates the instrument PCM at runtime from the stored parameters, so the
 * export is what makes a DEViLBOX-authored Cinter song importable into a demo.
 *
 * Validated byte-exact against CinterConvert.py on the bundled example modules.
 *
 * Reference: convert/CinterConvert.py (the *behaviour under Python 3*, which is
 * what current releases run — notably the trailing-silence trim there is a no-op
 * because it compares bytes to a str literal).
 */

import { cinter4ParamsToWords, type Cinter4Version } from '../import/formats/cinter4Params';

// ── Parsed module model ──────────────────────────────────────────────────────

export interface ModTrackRow {
  period: number;
  inst: number;
  cmd: number;
  arg: number;
  note: number | null; // periodtable index, or null when no note
}

export interface ModInstrument {
  name: string;
  version: Cinter4Version | null; // null = empty name
  length: number;     // in words
  finetune: number;
  volume: number;
  repoffset: number;
  replen: number;
  samples: Uint8Array; // length*2 bytes
}

export interface ParsedMod {
  name: string;
  instruments: (ModInstrument | null)[]; // index 1..31 populated, [0] = null
  songlength: number;
  positions: number[]; // 128 entries
  patterns: ModTrackRow[][][]; // [pattern][row 0..63][track 0..3]
}

export interface Cinter4ExportResult {
  songdata: Uint8Array;
  rawSamples: Uint8Array; // concatenated raw-instrument PCM (the second output file)
  errors: string[];
  noteIdCount: number;
  musicTicks: number;
}

// ── Constants (from CinterConvert.py) ────────────────────────────────────────

const PERIOD_TABLE = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

// Notes from a cell can be out of the 0..35 range (period above 856 → negative
// note). CinterConvert.py relies on Python's negative list-indexing wrap there
// (periodtable[-24] === periodtable[12]); JS would give undefined. Replicate it
// so the song-walk matches byte-exactly.
const periodAt = (note: number): number =>
  PERIOD_TABLE[note < 0 ? PERIOD_TABLE.length + note : note];

const VIBRATO_TABLE = [
  0, 24, 49, 74, 97, 120, 141, 161, 180, 197, 212, 224, 235, 244, 250, 253,
  255, 253, 250, 244, 235, 224, 212, 197, 180, 161, 141, 120, 97, 74, 49, 24,
];

// ── MOD parsing ──────────────────────────────────────────────────────────────

export function parseMod(bytes: Uint8Array): ParsedMod {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = (off: number, len: number): string => {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[off + i]);
    return s.replace(/\0+$/, '');
  };

  let off = 0;
  const name = latin1(0, 20); off += 20;

  const instruments: (ModInstrument | null)[] = [null];
  for (let i = 1; i < 32; i++) {
    const iname = latin1(off, 22); off += 22;
    const version: Cinter4Version | null =
      iname.length === 0 ? null : (/[0-9]/.test(iname[0]) ? 4 : 3);
    const length    = view.getUint16(off, false); off += 2;
    const finetune  = bytes[off]; off += 1;
    const volume    = bytes[off]; off += 1;
    const repoffset = view.getUint16(off, false); off += 2;
    const replen    = view.getUint16(off, false); off += 2;
    instruments.push({ name: iname, version, length, finetune, volume, repoffset, replen, samples: new Uint8Array(0) });
  }

  const songlength = bytes[off]; off += 1;
  off += 1; // restart byte (unused)
  const positions: number[] = [];
  for (let i = 0; i < 128; i++) positions.push(bytes[off + i]);
  off += 128;
  off += 4; // 'M.K.' tag

  const numPatterns = Math.max(...positions) + 1;
  const patterns: ModTrackRow[][][] = [];
  for (let p = 0; p < numPatterns; p++) {
    const pat: ModTrackRow[][] = [];
    for (let r = 0; r < 64; r++) {
      const rowArr: ModTrackRow[] = [];
      for (let t = 0; t < 4; t++) {
        const i4 = view.getUint16(off, false);
        const b0 = bytes[off + 2];
        const arg = bytes[off + 3];
        off += 4;
        const period = i4 & 0x0fff;
        const inst = (b0 >> 4) | ((i4 & 0xf000) >> 8);
        const cmd = b0 & 0x0f;
        const note = period > 0 ? Math.round(Math.log2(856.0 / period) * 12.0) : null;
        rowArr.push({ period, inst, cmd, arg, note });
      }
      pat.push(rowArr);
    }
    patterns.push(pat);
  }

  for (let i = 1; i < 32; i++) {
    const inst = instruments[i]!;
    inst.samples = bytes.subarray(off, off + inst.length * 2);
    off += inst.length * 2;
  }

  return { name, instruments, songlength, positions, patterns };
}

// ── Instrument parameter parsing from sample name (CinterConvert param()) ─────

const parseParam = (s: string): number => {
  if (s === '') throw new Error('empty');
  if (s.toUpperCase() === 'X'.repeat(s.length)) return Math.pow(10, s.length);
  if (!/^[0-9]+$/.test(s)) throw new Error('nan');
  return parseInt(s, 10);
};

const parseInstParams = (name: string): number[] | null => {
  try {
    const p: number[] = [];
    for (let pi = 0; pi < 8; pi++) p.push(parseParam(name.slice(pi * 2 + 1, pi * 2 + 3)));
    for (let pi = 0; pi < 4; pi++) p.push(parseParam(name.slice(pi + 17, pi + 18)));
    return p;
  } catch {
    return null;
  }
};

// ── Main conversion ──────────────────────────────────────────────────────────

export function encodeCinter4FromMod(modBytes: Uint8Array): Cinter4ExportResult {
  const module = parseMod(modBytes);
  const errors: string[] = [];
  const reported = new Set<string>();
  const error = (msg: string, p: number, t: number, r: number) => {
    const key = `${msg}|${p}|${t}|${r}`;
    if (!reported.has(key)) { reported.add(key); errors.push(`${msg} in pattern ${p} track ${t} row ${r}`); }
  };

  const instParams: (number[] | null)[] = [null];
  for (let i = 1; i < 32; i++) instParams.push(parseInstParams(module.instruments[i]!.name));

  // Per-track running state
  const volumedata: number[][] = [[], [], [], []];
  const notedata: number[][]   = [[], [], [], []];
  const perioddata: number[][] = [[], [], [], []];
  const offsetdata: number[][] = [[], [], [], []];
  const posdata: [number, number][] = [];
  let vblank = 0;

  let musicspeed = 6;
  const inst = [0, 0, 0, 0];
  const period = [0, 0, 0, 0];
  const volume = [0, 0, 0, 0];
  const portamentoTarget = [0, 0, 0, 0];
  const portamentoSpeed = [0, 0, 0, 0];
  const vibratoSpeed = [0, 0, 0, 0];
  const vibratoDepth = [0, 0, 0, 0];
  const vibratoPhase = [0, 0, 0, 0];
  const vibratoOngoing = [false, false, false, false];
  const tremoloSpeed = [0, 0, 0, 0];
  const tremoloDepth = [0, 0, 0, 0];
  const tremoloPhase = [0, 0, 0, 0];
  const tremoloOngoing = [false, false, false, false];
  const offsetValue = [0, 0, 0, 0];

  const states = new Map<string, number>();
  let startrow = 0;
  let restart = 0;
  let stopped = false;
  let looped = false;
  let skip = false;
  let pos = 0;

  while (!stopped && !looped) {
    const p = module.positions[pos];
    const pat = module.patterns[p];
    let nextPos = pos + 1;

    for (let r = startrow; r < 64; r++) {
      if (skip) { skip = false; continue; }

      const stateKey = JSON.stringify([pos, r, musicspeed, inst, period, volume,
        portamentoTarget, portamentoSpeed, vibratoSpeed, vibratoDepth, vibratoPhase, vibratoOngoing,
        tremoloSpeed, tremoloDepth, tremoloPhase, tremoloOngoing, offsetValue]);
      if (states.has(stateKey)) { restart = states.get(stateKey)!; looped = true; break; }
      states.set(stateKey, vblank);

      // Decode the row: expand E-commands to 0xE0|subcmd, split arg nibbles.
      const row = pat[r].map((tr, t) => {
        const cmd = tr.cmd === 0xe ? (0xe0 | (tr.arg >> 4)) : tr.cmd;
        return { t, tr, cmd, arg1: tr.arg >> 4, arg2: tr.arg & 0xf };
      });

      for (const { t, cmd } of row) {
        if ([0xe0, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xef].includes(cmd)) {
          error(`Unsupported command ${cmd.toString(16).toUpperCase()}`, p, t, r);
        }
      }

      // Speed / break / pattern-delay
      let patternbreak = false;
      startrow = 0;
      let patterndelay = 0;
      for (const { t, tr, cmd, arg1, arg2 } of row) {
        if (cmd === 0xf) {
          if (tr.arg !== 0) {
            if (tr.arg < 0x20) musicspeed = tr.arg;
            else if (tr.arg !== 125) error('Tempo set', p, t, r);
          } else stopped = true;
        }
        if (cmd === 0xd) {
          patternbreak = true;
          startrow = arg1 * 10 + arg2;
          if (startrow > 63) { error('Break to position outside pattern', p, t, r); startrow = 0; }
        }
        if (cmd === 0xb) { patternbreak = true; nextPos = tr.arg; }
        if (cmd === 0xee) patterndelay = arg2;
      }
      let speed = musicspeed * (patterndelay + 1);
      if (patterndelay > 0 && patternbreak) skip = true;
      if (stopped) { speed = 1; patternbreak = true; restart = vblank + 1; }

      for (const { t, tr, cmd, arg1, arg2 } of row) {
        // Vibrato/tremolo phase reset
        if (tr.note !== null && cmd !== 0x3 && cmd !== 0x5) { vibratoPhase[t] = 0; tremoloPhase[t] = 0; }

        // Volume data
        if (tr.inst !== 0) volume[t] = module.instruments[tr.inst]!.volume;
        if (cmd === 0xc) volume[t] = tr.arg;
        if (cmd === 0xec && arg2 < speed && arg2 < musicspeed) {
          for (let i = 0; i < arg2; i++) volumedata[t].push(volume[t]);
          for (let i = 0; i < speed - arg2; i++) volumedata[t].push(0);
          volume[t] = 0;
        } else if (cmd === 0x5 || cmd === 0x6 || cmd === 0xa) {
          const slide = arg1 ? arg1 : -arg2;
          for (let i = 0; i < speed; i++) volumedata[t].push(Math.max(0, Math.min(volume[t] + i * slide, 64)));
          volume[t] = volumedata[t][volumedata[t].length - 1];
        } else if (cmd === 0x7) {
          if (arg1 !== 0) tremoloSpeed[t] = arg1;
          if (arg2 !== 0) tremoloDepth[t] = arg2;
          for (let i = 0; i < speed; i++) {
            let amount = (VIBRATO_TABLE[tremoloPhase[t] & 0x1f] * tremoloDepth[t]) >> 6;
            if (tremoloPhase[t] & 0x20) amount = -amount;
            if (i > 0) { tremoloPhase[t] += tremoloSpeed[t]; tremoloPhase[t] &= 0x3f; }
            else if (!tremoloOngoing[t]) amount = 0;
            volumedata[t].push(Math.max(0, Math.min(volume[t] + amount, 64)));
          }
        } else {
          if (cmd === 0xea) volume[t] = Math.min(volume[t] + arg2, 64);
          if (cmd === 0xeb) volume[t] = Math.max(0, volume[t] - arg2);
          for (let i = 0; i < speed; i++) volumedata[t].push(volume[t]);
        }

        // Note trigger data
        if (tr.inst !== 0) {
          if (tr.inst !== inst[t] && (cmd === 0x3 || cmd === 0x5)) error('Instrument change on toneportamento', p, t, r);
          inst[t] = tr.inst;
        }
        if (inst[t] === 0) {
          if (tr.note !== null || (cmd === 0xe9 && arg2 !== 0)) error('Note with no instrument', p, t, r);
          for (let i = 0; i < speed; i++) notedata[t].push(0);
        } else if (cmd === 0xe9 && arg2 !== 0) {
          for (let i = 0; i < speed; i++) notedata[t].push((i % arg2) === 0 ? inst[t] : 0);
        } else if (tr.note !== null && cmd === 0xed) {
          if (arg2 < speed && arg2 < musicspeed) {
            for (let i = 0; i < arg2; i++) notedata[t].push(0);
            notedata[t].push(inst[t]);
            for (let i = 0; i < speed - arg2 - 1; i++) notedata[t].push(0);
          } else for (let i = 0; i < speed; i++) notedata[t].push(0);
        } else if (tr.note !== null && cmd !== 0x3 && cmd !== 0x5) {
          notedata[t].push(inst[t]);
          for (let i = 0; i < speed - 1; i++) notedata[t].push(0);
        } else {
          for (let i = 0; i < speed; i++) notedata[t].push(0);
        }

        // Offset data
        if (cmd === 0x9) {
          if (tr.arg !== 0) offsetValue[t] = tr.arg;
          else if (offsetValue[t] === 0) error('No previous offset', p, t, r);
          let offset = offsetValue[t];
          if (inst[t] !== 0 && tr.note !== null && offset * 128 >= module.instruments[inst[t]]!.length) {
            error('Offset beyond end of sample', p, t, r);
            offset = Math.floor((module.instruments[inst[t]]!.length - 1) / 128);
          }
          offsetdata[t].push(offset);
          for (let i = 0; i < speed - 1; i++) offsetdata[t].push(0);
        } else {
          for (let i = 0; i < speed; i++) offsetdata[t].push(0);
        }

        // Period data
        if (tr.note !== null && cmd !== 0x3 && cmd !== 0x5 && cmd !== 0xed) {
          if (cmd === 0xe1 || cmd === 0xe2) error('Fineslide on note', p, t, r);
          period[t] = periodAt(tr.note);
        }
        if (cmd === 0x0 && tr.arg !== 0) {
          // Arpeggio
          if (period[t] === 0) { error('Arpeggio with no base note', p, t, r); period[t] = PERIOD_TABLE[0]; }
          let baseNote = -1;
          for (let i = 0; i < PERIOD_TABLE.length; i++) if (PERIOD_TABLE[i] <= period[t]) { baseNote = i; break; }
          if (PERIOD_TABLE[baseNote] !== period[t]) error('Arpeggio with invalid base pitch (after slide)', p, t, r);
          const arpnotes = [baseNote, baseNote + arg1, baseNote + arg2];
          for (const a of [1, 2]) {
            if (arpnotes[a] >= PERIOD_TABLE.length) { error('Arpeggio note above B-3', p, t, r); arpnotes[a] = PERIOD_TABLE.length - 1; }
          }
          for (let i = 0; i < speed; i++) perioddata[t].push(PERIOD_TABLE[arpnotes[(i % musicspeed) % 3]]);
        } else if (cmd === 0x1 || cmd === 0x2) {
          // Portamento up/down
          if (period[t] === 0) { error('Portamento with no source', p, t, r); period[t] = PERIOD_TABLE[0]; }
          const slide = cmd === 0x1 ? -tr.arg : tr.arg;
          for (let i = 0; i < speed; i++) perioddata[t].push(Math.max(PERIOD_TABLE[PERIOD_TABLE.length - 1], Math.min(period[t] + i * slide, PERIOD_TABLE[0])));
          period[t] = perioddata[t][perioddata[t].length - 1];
        } else if (cmd === 0x3 || cmd === 0x5) {
          // Toneportamento
          if (tr.note !== null) portamentoTarget[t] = periodAt(tr.note);
          if (cmd === 0x3 && tr.arg !== 0) portamentoSpeed[t] = tr.arg;
          if (period[t] === 0) { error('Toneportamento with no source', p, t, r); period[t] = PERIOD_TABLE[0]; }
          if (portamentoTarget[t] === 0) { error('Toneportamento with no target', p, t, r); portamentoTarget[t] = period[t]; }
          if (portamentoSpeed[t] === 0) error('Toneportamento with no speed', p, t, r);
          perioddata[t].push(period[t]);
          for (let i = 0; i < speed - 1; i++) {
            if (portamentoTarget[t] > period[t]) period[t] = Math.min(period[t] + portamentoSpeed[t], portamentoTarget[t]);
            else period[t] = Math.max(period[t] - portamentoSpeed[t], portamentoTarget[t]);
            perioddata[t].push(period[t]);
          }
        } else if (cmd === 0x4 || cmd === 0x6) {
          // Vibrato
          if (cmd === 0x4) {
            if (arg1 !== 0) vibratoSpeed[t] = arg1;
            if (arg2 !== 0) vibratoDepth[t] = arg2;
          }
          for (let i = 0; i < speed; i++) {
            let amount = (VIBRATO_TABLE[vibratoPhase[t] & 0x1f] * vibratoDepth[t]) >> 7;
            if (vibratoPhase[t] & 0x20) amount = -amount;
            if (i > 0) { vibratoPhase[t] += vibratoSpeed[t]; vibratoPhase[t] &= 0x3f; }
            else if (!vibratoOngoing[t]) amount = 0;
            perioddata[t].push(period[t] + amount);
          }
        } else if (tr.note !== null && cmd === 0xed) {
          // Notedelay
          if (arg2 < speed && arg2 < musicspeed) {
            for (let i = 0; i < arg2; i++) perioddata[t].push(period[t]);
            for (let i = 0; i < speed - arg2; i++) perioddata[t].push(periodAt(tr.note));
          } else for (let i = 0; i < speed; i++) perioddata[t].push(period[t]);
          period[t] = periodAt(tr.note);
        } else {
          if (cmd === 0xe1 && tr.note === null) period[t] = Math.max(period[t] - arg2, PERIOD_TABLE[PERIOD_TABLE.length - 1]);
          if (cmd === 0xe2 && tr.note === null) period[t] = Math.min(period[t] + arg2, PERIOD_TABLE[0]);
          for (let i = 0; i < speed; i++) perioddata[t].push(period[t]);
        }

        vibratoOngoing[t] = cmd === 0x4 || cmd === 0x6;
        tremoloOngoing[t] = cmd === 0x7;
      }

      for (let i = 0; i < speed; i++) posdata.push([p, r]);
      vblank += speed;

      if (patternbreak) break;
    }

    pos = nextPos;
    if (pos >= module.songlength) pos = 0;
  }

  // ── Note ranges and per-instrument note counts ──
  const minmaxNote = new Map<string, [number, number]>();
  const instCounts = new Array<number>(32).fill(0);
  for (let track = 0; track < 4; track++) {
    for (let i = 0; i < notedata[track].length; i++) {
      const instN = notedata[track][i];
      if (instN !== 0) {
        instCounts[instN]++;
        const note = PERIOD_TABLE.indexOf(perioddata[track][i]);
        const key = `${instN},${offsetdata[track][i]}`;
        const cur = minmaxNote.get(key);
        if (cur) minmaxNote.set(key, [Math.min(cur[0], note), Math.max(cur[1], note)]);
        else minmaxNote.set(key, [note, note]);
      }
    }
  }

  // ── Used-instrument list (raw first by descending index, then by note count) ──
  const instList: number[] = [];
  for (let i = 0; i < 32; i++) if (instCounts[i] !== 0) instList.push(i);
  instList.sort((a, b) => {
    const ka = instParams[a] === null ? 99999 - a : instCounts[a];
    const kb = instParams[b] === null ? 99999 - b : instCounts[b];
    return kb - ka; // reverse=True
  });

  // ── Note-ID mapping table ──
  let noteId = 0;
  const noteIds = new Map<string, number>();
  const noteRangeList: [number, number, number][] = []; // [noteMin, range, offset]
  const noteIdStart = [0];
  for (const instN of instList) {
    if (!minmaxNote.has(`${instN},0`)) minmaxNote.set(`${instN},0`, [0, 0]);
    for (let offset = 0; offset < 256; offset++) {
      const mm = minmaxNote.get(`${instN},${offset}`);
      if (mm) {
        const [noteMin, noteMax] = mm;
        noteRangeList.push([noteMin, noteMax, offset]);
        for (let n = noteMin; n <= noteMax; n++) { noteIds.set(`${instN},${offset},${n}`, noteId); noteId++; }
      }
    }
    noteIdStart.push(noteId);
  }
  if (noteId > 512) errors.push('More than 512 different note IDs!');

  // ── Export note words per track ──
  const VOLUME_SHIFT = 9;
  const NOTE_ABS_MASK = 0x80;
  const trackData: number[][] = [[], [], [], []];
  for (let track = 0; track < 4; track++) {
    let initial = true;
    let pvol = 0;
    let pper = 0;
    let pdper = 0;
    for (let i = 0; i < notedata[track].length; i++) {
      let vol = volumedata[track][i];
      const per = perioddata[track][i];
      const instN = notedata[track][i];
      const offset = offsetdata[track][i];
      if (vol === 64) vol = 63;
      let data: number;
      if (instN !== 0) {
        const note = PERIOD_TABLE.indexOf(per);
        data = 0x8000 | (noteIds.get(`${instN},${offset},${note}`)! << 0) | (vol << VOLUME_SHIFT);
        initial = false;
        pdper = 0;
      } else if (initial) {
        data = 0;
      } else {
        let dper = (per - pper) & 511;
        const dvol = (vol - pvol) & 63;
        if (per !== pper && dper !== pdper && PERIOD_TABLE.includes(per)) {
          const note = PERIOD_TABLE.indexOf(per);
          data = ((NOTE_ABS_MASK | note) << 0) | (dvol << VOLUME_SHIFT);
          pdper = 0;
        } else {
          let perAdj = per;
          if (per - pper < -256 || per - pper > 255) {
            // Slide value out of range — clamp (matches CinterConvert error path)
            perAdj = per > pper ? pper + 255 : pper - 256;
            dper = (perAdj - pper) & 511;
          }
          if ((((dper >> 7) ^ (dper >> 6)) & 1) === 1) {
            dper = perAdj < pper ? 512 - 64 : 63;
          }
          data = (dper << 0) | (dvol << VOLUME_SHIFT);
          pdper = dper;
        }
      }
      trackData[track].push(data);
      pvol = vol;
      pper = per;
    }
    if (stopped) trackData[track].push(0);
  }

  // ── Trim identical trailing rows shared by all tracks ──
  while (restart > 0 && [0, 1, 2, 3].every((t) => trackData[t][restart - 1] === trackData[t][trackData[t].length - 1])) {
    for (let t = 0; t < 4; t++) trackData[t].pop();
    restart -= 1;
  }

  // ── Pack notes_data: tracks in order [3,2,1,0], big-endian words ──
  const musiclength = trackData[0].length;
  const notesBytes: number[] = [];
  for (const track of [3, 2, 1, 0]) {
    for (const w of trackData[track]) { notesBytes.push((w >> 8) & 0xff, w & 0xff); }
  }

  // ── Note-range data ──
  const noteRangeBytes: number[] = [];
  for (const [noteMin, noteMax, offset] of noteRangeList) {
    noteRangeBytes.push(noteMin & 0xff, (noteMax - noteMin + 1) & 0xff);
    const off128 = (offset * 128) & 0xffff;
    noteRangeBytes.push((off128 >> 8) & 0xff, off128 & 0xff);
  }
  const loopWord = ((restart - musiclength + 1) * 2) & 0xffff;
  noteRangeBytes.push((loopWord >> 8) & 0xff, loopWord & 0xff);

  // ── Instrument parameter records ──
  const instData: number[][] = [];
  const rawInstruments: number[] = [];
  for (let idx = 0; idx < instList.length; idx++) {
    const i = instList[idx];
    const minst = module.instruments[i]!;
    const params = instParams[i];

    // Length / replength (Python-3 behaviour: trailing-silence trim is a no-op)
    let length = minst.length;
    if (length < 1) { errors.push(`Empty instrument ${i}`); length = 1; }
    let replen: number;
    if (minst.repoffset === 0 && (minst.replen === 0 || minst.replen === 1)) {
      replen = 0;
    } else {
      length = Math.min(length, minst.repoffset + minst.replen);
      replen = length - minst.repoffset;
    }
    minst.length = length;

    if (params !== null) {
      const w = cinter4ParamsToWords(params, minst.version ?? 4);
      instData.push([length, replen, w.mpitch, w.mod, w.bpitch, w.attack, w.dist, w.decay, w.mpitchdecay, w.moddecay, w.bpitchdecay]);
    } else {
      instData.push([length, replen]);
      rawInstruments.push(i);
    }
  }

  // ── Assemble insts_data ──
  const instsBytes: number[] = [];
  const pushWordSigned = (arr: number[], v: number) => { arr.push((v >> 8) & 0xff, v & 0xff); };
  if (rawInstruments.length > 0) {
    pushWordSigned(instsBytes, (-rawInstruments.length) & 0xffff);
    for (let k = 0; k < rawInstruments.length; k++) for (const w of instData[k]) pushWordSigned(instsBytes, w);
  }
  pushWordSigned(instsBytes, (instList.length - rawInstruments.length - 1) & 0xffff);
  for (let k = rawInstruments.length; k < instData.length; k++) for (const w of instData[k]) pushWordSigned(instsBytes, w);

  // ── Final songdata ──
  const out: number[] = [];
  out.push(...instsBytes);
  const trackSizeWord = (notesBytes.length / 4) & 0xffff; // = len(notes_data)//4
  out.push((trackSizeWord >> 8) & 0xff, trackSizeWord & 0xff);
  out.push((noteRangeBytes.length >> 8) & 0xff, noteRangeBytes.length & 0xff);
  out.push(...noteRangeBytes);
  out.push(...notesBytes);

  // ── Raw sample blob ──
  const rawParts: Uint8Array[] = [];
  for (const i of rawInstruments) {
    const minst = module.instruments[i]!;
    rawParts.push(minst.samples.subarray(0, minst.length * 2));
  }
  let rawLen = 0;
  for (const part of rawParts) rawLen += part.length;
  const rawSamples = new Uint8Array(rawLen);
  let ro = 0;
  for (const part of rawParts) { rawSamples.set(part, ro); ro += part.length; }

  return {
    songdata: new Uint8Array(out),
    rawSamples,
    errors,
    noteIdCount: noteId,
    musicTicks: musiclength,
  };
}
