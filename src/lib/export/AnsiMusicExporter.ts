/**
 * AnsiMusicExporter - a song as an .ANS file with one ANSI music block.
 *
 * Inverse of AnsiMusicParser: channel 0 of the song order becomes one BASIC
 * PLAY string after `ESC [ M F`, terminated by SO (0x0E). ANSI music is one
 * voice, so only channel 0 is written; notes on other channels are reported in
 * `warnings`.
 *
 * Timing. A row lasts `speed` ticks at `bpm`; a quarter note lasts 60 / T s.
 * With R rows per whole note, T = bpm x 96 / (speed x R) (the parser's
 * relation read backwards). R is the power of two from 1..64 whose T is an
 * integer in 32..255, finest first; else the R whose T rounds closest. A note
 * that lasts n rows is written as its binary parts (n = 4 + 1 gives L4 then
 * L16 at R = 16) under ML (legato), so the parts join into one tone and a gap
 * only comes from a rest. Fxx changes (speed < 32, BPM >= 32) become T.
 *
 * Pitch: tracker note 1..84 is O0 C..O6 B (semitone = note - 1), the parser's
 * mapping. Note-off (97) starts a rest. A note outside 1..84 cannot be written
 * in PLAY and fails the export.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

export interface AnsiMusicExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

const ESC = 0x1b;
const SO = 0x0e;
const NOTE_OFF = 97;
const SET_TEMPO = 0x0f;
const MIN_T = 32;
const MAX_T = 255;
const ROWS_PER_WHOLE = [1, 2, 4, 8, 16, 32, 64];
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** One held pitch (semi >= 0) or rest (semi -1) lasting `rows` rows, with the T in force at its start. */
interface Span {
  semi: number;
  rows: number;
  tempo: number;
}

const exactT = (bpm: number, speed: number, r: number): number => (bpm * 96) / (speed * r);

/** Rows per whole note for the song's start timing: exact T in range first, else the closest. */
export function ansiRowsPerWhole(bpm: number, speed: number): number {
  for (let i = ROWS_PER_WHOLE.length - 1; i >= 0; i--) {
    const t = exactT(bpm, speed, ROWS_PER_WHOLE[i]);
    if (Number.isInteger(t) && t >= MIN_T && t <= MAX_T) return ROWS_PER_WHOLE[i];
  }
  let best = 16;
  let bestErr = Infinity;
  for (const r of ROWS_PER_WHOLE) {
    const t = exactT(bpm, speed, r);
    const clamped = Math.max(MIN_T, Math.min(MAX_T, Math.round(t)));
    const err = Math.abs(clamped - t) / t;
    if (err < bestErr) {
      bestErr = err;
      best = r;
    }
  }
  return best;
}

const tempoFor = (bpm: number, speed: number, r: number): number =>
  Math.max(MIN_T, Math.min(MAX_T, Math.round(exactT(bpm, speed, r))));

/** Channel 0 along the order as spans; throws on a note PLAY cannot hold. */
function spans(song: TrackerSong, r: number, warnings: string[]): Span[] {
  let speed = song.initialSpeed;
  let bpm = song.initialBPM;
  const out: Span[] = [];
  let cur: Span = { semi: -1, rows: 0, tempo: tempoFor(bpm, speed, r) };
  let otherChannelNotes = 0;
  for (let pos = 0; pos < song.songLength; pos++) {
    const pat = song.patterns[song.songPositions[pos]];
    if (!pat) continue;
    const rows = pat.channels[0]?.rows ?? [];
    for (let ch = 1; ch < pat.channels.length; ch++) {
      for (const c of pat.channels[ch].rows) if (c.note > 0) otherChannelNotes++;
    }
    for (let i = 0; i < pat.length; i++) {
      const c = rows[i];
      let tempoChanged = false;
      if (c && c.effTyp === SET_TEMPO && c.eff > 0) {
        if (c.eff < 32) speed = c.eff;
        else bpm = c.eff;
        tempoChanged = true;
      }
      const note = c?.note ?? 0;
      if (note > 0 && note !== NOTE_OFF && (note < 1 || note > 84)) {
        throw new Error(`ANSI music holds notes O0 C to O6 B only; position ${pos} row ${i} has note ${note}`);
      }
      const startsSpan = tempoChanged || (note > 0 && (note === NOTE_OFF ? cur.semi >= 0 : true));
      if (startsSpan) {
        if (cur.rows > 0) out.push(cur);
        const semi = note === NOTE_OFF ? -1 : note > 0 ? note - 1 : cur.semi;
        cur = { semi, rows: 0, tempo: tempoFor(bpm, speed, r) };
      }
      cur.rows++;
    }
  }
  if (cur.rows > 0) out.push(cur);
  if (otherChannelNotes > 0) {
    warnings.push(`ANSI music has one voice: ${otherChannelNotes} notes on channels 2 and up were not written.`);
  }
  return out;
}

/** n rows at R rows per whole note as PLAY lengths (1..64), longest first. */
function lengths(n: number, r: number): number[] {
  const out: number[] = [];
  let left = n;
  while (left >= r) {
    out.push(1);
    left -= r;
  }
  for (let part = r / 2; part >= 1; part /= 2) {
    if (left >= part) {
      out.push(r / part);
      left -= part;
    }
  }
  return out;
}

/** The PLAY string (without intro or terminator) for a song. */
export function ansiPlayString(song: TrackerSong, warnings: string[] = []): string {
  const r = ansiRowsPerWhole(song.initialBPM, song.initialSpeed);
  const all = spans(song, r, warnings);
  let tempo = all[0]?.tempo ?? tempoFor(song.initialBPM, song.initialSpeed, r);
  let octave = -1;
  const parts: string[] = [`T${tempo}`, 'ML'];
  for (const s of all) {
    if (s.tempo !== tempo) {
      parts.push(`T${s.tempo}`);
      tempo = s.tempo;
    }
    if (s.semi >= 0 && Math.floor(s.semi / 12) !== octave) {
      octave = Math.floor(s.semi / 12);
      parts.push(`O${octave}`);
    }
    const word = s.semi < 0 ? 'P' : NAMES[s.semi % 12];
    for (const l of lengths(s.rows, r)) parts.push(`${word}${l}`);
  }
  return parts.join('');
}

export function exportAnsiMusic(song: TrackerSong): AnsiMusicExportResult {
  const warnings: string[] = [];
  const play = ansiPlayString(song, warnings);
  const bytes = new Uint8Array(4 + play.length + 1);
  bytes.set([ESC, 0x5b, 0x4d, 0x46], 0); // ESC [ M F: music, foreground
  for (let i = 0; i < play.length; i++) bytes[4 + i] = play.charCodeAt(i);
  bytes[bytes.length - 1] = SO;
  const base = (song.name || 'song').replace(/\s*\[\d+\/\d+\]$/, '').replace(/[^\w\- ]+/g, '_');
  return { data: new Blob([bytes], { type: 'application/octet-stream' }), filename: `${base}.ans`, warnings };
}
