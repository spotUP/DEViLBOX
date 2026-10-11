/**
 * Tracker-native intelligence (plan sections 25-27): the module's own
 * structure kept next to the rendered-audio analysis. Order positions,
 * pattern boundaries in seconds, time-varying channel roles, instrument
 * usage, density timelines and semantic mix events.
 *
 * Channel identity comes from the Dub Deck's own sources
 * (songChannelIdentity.resolveSongChannelRoles: ChannelNaming's
 * instrument-aware song-wide classifier, the SongRoleTimeline over the
 * arrangement, promoted by runtime audio evidence when the song is the
 * editor's) - one source of truth, no parallel classifier. Roles are read
 * per order position from the timeline, never treated as permanent (plan
 * section 26); a channel silent in a position is silent there.
 *
 * Pure over a TrackerSong.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types/tracker';
import { songUsesAmigaPeriods } from '@/lib/amiga/periodNotes';
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';
import { resolveSongChannelRoles } from '@/engine/dub/songChannelIdentity';
import { getRolesAtPosition } from '@/bridge/analysis/SongRoleTimeline';
import type {
  ActivityTimeline, InstrumentFamily, MusicalFunction, Register, RhythmicRole,
  TrackerChannelSegment, TrackerMixAnalysis, TrackerMixEvent, TrackerOrderPosition,
} from './types';

const HOP_SEC = 0.25;

/** Seconds per row from speed and BPM, as the replayer does it (speed ticks of 2.5/BPM s). */
export function rowSeconds(speed: number, bpm: number): number {
  const s = speed > 0 ? speed : 6;
  const b = bpm > 0 ? bpm : 125;
  return s * (2.5 / b);
}

/**
 * Flow commands in the normalised effect numbering every importer writes (the
 * S3M / IT parsers map A / T to Fxx, B to Bxx, C to Dxx) and the one numbering
 * TrackerReplayer dispatches, for every format, in all eight effect columns.
 */
const EFF_POSITION_JUMP = 0x0b;
const EFF_PATTERN_BREAK = 0x0d;
const EFF_SPEED_TEMPO = 0x0f;

function cellEffects(cell: TrackerCell): Array<[number, number]> {
  return [
    [cell.effTyp ?? 0, cell.eff ?? 0], [cell.effTyp2 ?? 0, cell.eff2 ?? 0],
    [cell.effTyp3 ?? 0, cell.eff3 ?? 0], [cell.effTyp4 ?? 0, cell.eff4 ?? 0],
    [cell.effTyp5 ?? 0, cell.eff5 ?? 0], [cell.effTyp6 ?? 0, cell.eff6 ?? 0],
    [cell.effTyp7 ?? 0, cell.eff7 ?? 0], [cell.effTyp8 ?? 0, cell.eff8 ?? 0],
  ];
}

export interface OrderWalk {
  /** Positions in play order (a forward Bxx skips some; a song loop ends the walk). */
  positions: TrackerOrderPosition[];
  /** Per played position, the start time of each played row: index i = pattern row startRow + i. */
  rowTimes: number[][];
  /** Seconds spent at each speed / tick-tempo pair. */
  tempoSeconds: Array<{ speed: number; bpm: number; seconds: number }>;
  /** Fxx speed / tempo commands met on the walk. */
  tempoCommands: number;
}

/**
 * Walk the order list as the replayer plays it and time every played row:
 * Fxx speed / tempo, Dxx pattern break (BCD on Amiga-period formats, as the
 * replayer reads it), Bxx position jump (a backward jump is the song loop
 * and ends the walk), F00 stop. Pattern loops (E6x) and pattern delay (EEx)
 * are not followed; a walk that misses them disagrees with the render and
 * the caller's agreement check rejects it.
 */
export function timeOrderPositions(song: TrackerSong): OrderWalk {
  const positions: TrackerOrderPosition[] = [];
  const rowTimes: number[][] = [];
  const spent = new Map<string, { speed: number; bpm: number; seconds: number }>();
  let tempoCommands = 0;
  let speed = song.initialSpeed > 0 ? song.initialSpeed : 6;
  let bpm = song.initialBPM > 0 ? song.initialBPM : 125;
  const bcdBreaks = songUsesAmigaPeriods(song.format);
  let t = 0;
  const length = Math.max(0, Math.min(song.songLength || song.songPositions.length, song.songPositions.length));
  const visited = new Set<string>();
  let pos = 0;
  let startRow = 0;
  let stop = false;
  while (!stop && pos < length) {
    const key = `${pos}:${startRow}`;
    if (visited.has(key)) break;
    visited.add(key);
    const patternIndex = song.songPositions[pos];
    const pattern = song.patterns[patternIndex];
    const rows = pattern?.channels[0]?.rows.length ?? pattern?.length ?? 64;
    if (startRow >= rows) startRow = 0;
    const start = t;
    const times: number[] = [];
    let nextPos = pos + 1;
    let nextRow = 0;
    for (let r = startRow; r < rows; r++) {
      let jump: number | null = null;
      let brk: number | null = null;
      if (pattern) {
        for (const ch of pattern.channels) {
          const cell = ch.rows[r];
          if (!cell) continue;
          for (const [typ, v] of cellEffects(cell)) {
            if (typ === EFF_SPEED_TEMPO) {
              if (v === 0) stop = true;
              else { tempoCommands++; if (v < 0x20) speed = v; else bpm = v; }
            } else if (typ === EFF_POSITION_JUMP) {
              jump = v;
            } else if (typ === EFF_PATTERN_BREAK) {
              brk = bcdBreaks ? (v >> 4) * 10 + (v & 0x0f) : v;
            }
          }
        }
      }
      if (stop) break; // F00: the song stops at this row
      const dt = rowSeconds(speed, bpm);
      times.push(t);
      t += dt;
      const k = `${speed}/${bpm}`;
      const e = spent.get(k);
      if (e) e.seconds += dt; else spent.set(k, { speed, bpm, seconds: dt });
      if (jump !== null || brk !== null) {
        if (jump !== null) {
          if (jump <= pos) stop = true; // song loop
          nextPos = jump;
        }
        nextRow = brk ?? 0;
        break;
      }
    }
    if (times.length > 0) {
      rowTimes.push(times);
      positions.push({ index: pos, patternIndex, start, end: t, rows: times.length, startRow });
    }
    pos = nextPos;
    startRow = nextRow;
  }
  return { positions, rowTimes, tempoSeconds: [...spent.values()], tempoCommands };
}

const ROLE_FAMILY: Record<ChannelRole, InstrumentFamily> = {
  bass: 'bass', lead: 'lead', chord: 'chords', percussion: 'drums', arpeggio: 'arpeggio', pad: 'pad',
  empty: 'unknown', skank: 'chords', fx: 'fx',
};
const ROLE_FUNCTION: Record<ChannelRole, MusicalFunction> = {
  bass: 'bass', lead: 'melody', chord: 'harmony', percussion: 'rhythm', arpeggio: 'harmony', pad: 'texture',
  empty: 'silence', skank: 'harmony', fx: 'texture',
};
const ROLE_RHYTHMIC: Record<ChannelRole, RhythmicRole> = {
  bass: 'sustained', lead: 'sustained', chord: 'sustained', percussion: 'perc', arpeggio: 'arpeggiated',
  pad: 'sustained', empty: 'none', skank: 'perc', fx: 'none',
};
const ROLE_IMPORTANCE: Record<ChannelRole, number> = {
  bass: 0.9, lead: 0.8, chord: 0.6, percussion: 0.9, arpeggio: 0.5, pad: 0.4, empty: 0, skank: 0.5, fx: 0.3,
};

function registerOf(avgPitch: number): Register {
  if (avgPitch < 25) return 'sub';
  if (avgPitch < 37) return 'low';
  if (avgPitch < 61) return 'mid';
  return 'high';
}

function percRole(pattern: Pattern, channel: number): RhythmicRole {
  const rows = pattern.channels[channel]?.rows ?? [];
  const total = rows.length || 1;
  let onBeat = 0, offBeat = 0, notes = 0;
  rows.forEach((cell, r) => {
    if (cell && cell.note >= 1 && cell.note <= 96) {
      notes++;
      if (r % 8 === 0) onBeat++; else if (r % 4 === 0) offBeat++;
    }
  });
  if (notes === 0) return 'none';
  if (notes / total > 0.4) return 'hat';
  if (onBeat >= offBeat && onBeat > 0) return 'kick';
  if (offBeat > 0) return 'snare';
  return 'perc';
}

function noteCount(pattern: Pattern, channel: number, fromRow: number, toRow: number): number {
  const rows = pattern.channels[channel]?.rows ?? [];
  let n = 0;
  for (let r = fromRow; r < Math.min(rows.length, toRow); r++) {
    const c = rows[r];
    if (c && c.note >= 1 && c.note <= 96) n++;
  }
  return n;
}

function patternSignature(pattern: Pattern): string {
  return pattern.channels.map((ch) => ch.rows.map((c) => (c ? `${c.note}:${c.instrument}` : '')).join(',')).join('|');
}

export function analyzeTrackerSong(song: TrackerSong, renderedDurationSec?: number): TrackerMixAnalysis {
  const { positions, rowTimes } = timeOrderPositions(song);
  const durationSec = renderedDurationSec && renderedDurationSec > 0 ? renderedDurationSec : (positions[positions.length - 1]?.end ?? 0);
  // The rendered duration is the truth; scale the timing walk onto it so
  // events land on the audio the deck plays.
  const walkEnd = positions[positions.length - 1]?.end ?? 0;
  const scale = walkEnd > 0 && renderedDurationSec && renderedDurationSec > 0 ? renderedDurationSec / walkEnd : 1;
  const T = (t: number) => t * scale;

  const hops = Math.max(1, Math.ceil(durationSec / HOP_SEC));
  const mk = (): number[] => new Array(hops).fill(0);
  const density = mk(), bassTl = mk(), drumTl = mk(), melodyTl = mk();

  const segments: TrackerChannelSegment[] = [];
  const events: TrackerMixEvent[] = [];
  const instrumentUsage = new Map<number, { firstTime: number; lastTime: number; notes: number }>();
  const patternBoundaries: number[] = [];
  const silences: Array<{ start: number; end: number }> = [];
  const repeated: Array<{ start: number; end: number; repeatOf: number }> = [];
  const structural: number[] = [];
  const seenSignatures = new Map<string, number>();

  const numChannels = song.numChannels || (song.patterns[0]?.channels.length ?? 0);
  const identity = resolveSongChannelRoles({
    patterns: song.patterns,
    patternOrder: positions.map((p) => p.patternIndex),
    instruments: Array.isArray(song.instruments) ? song.instruments : [],
  });
  let prevRoles: Array<ChannelRole | null> = new Array(numChannels).fill(null);
  let prevDensity = -1;
  let prevSignature = '';

  positions.forEach((pos, p) => {
    const pattern = song.patterns[pos.patternIndex];
    const start = T(pos.start);
    const end = T(pos.end);
    patternBoundaries.push(start);
    if (!pattern) return;
    // Roles at this position from the Dub Deck's timeline (instrument types
    // over the arrangement), the song-wide role beneath; empty here = empty.
    const atPosition = identity.timeline ? getRolesAtPosition(identity.timeline, p, 0, 0.3) : [];
    const analyses = pattern.channels.map((ch, idx) => {
      const notes: number[] = [];
      // Only the rows the song plays here (a Dxx truncates, a Dxx before can start mid-pattern).
      const playedRows = (ch?.rows ?? []).slice(pos.startRow, pos.startRow + pos.rows);
      for (const cell of playedRows) if (cell && cell.note >= 1 && cell.note <= 96) notes.push(cell.note);
      const rowsHere = playedRows.length || 1;
      const role: ChannelRole = notes.length === 0 ? 'empty' : (atPosition[idx] ?? identity.roles[idx] ?? identity.baseRoles[idx] ?? 'empty');
      return { role, noteCount: notes.length, density: notes.length / rowsHere, avgPitch: notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : 0 };
    });
    const rows = pos.rows || 1;
    const rowsPerBeat = 4;
    const sig = patternSignature(pattern);
    const seenAt = seenSignatures.get(sig);
    if (seenAt !== undefined) {
      repeated.push({ start, end, repeatOf: seenAt });
      events.push({ kind: 'REPEATED_PHRASE', time: start, orderPosition: p, row: 0, confidence: 0.9 });
    } else {
      seenSignatures.set(sig, start);
    }
    if (p > 0) {
      events.push({ kind: 'PATTERN_CHANGE', time: start, orderPosition: p, row: 0, confidence: 1 });
      if (sig !== prevSignature && seenAt === undefined) structural.push(start);
    }
    prevSignature = sig;

    // Channel segments, one per channel per order position.
    let total = 0;
    analyses.forEach((a, ch) => {
      const role = a.role;
      const notes = a.noteCount;
      total += notes;
      const seg: TrackerChannelSegment = {
        channel: ch, start, end,
        instrumentFamily: ROLE_FAMILY[role],
        musicalFunction: ROLE_FUNCTION[role],
        rhythmicRole: role === 'percussion' ? percRole(pattern, ch) : ROLE_RHYTHMIC[role],
        register: registerOf(a.avgPitch),
        importance: ROLE_IMPORTANCE[role] * (0.5 + 0.5 * Math.min(1, a.density * 4)),
        density: Math.min(1, a.density * 4),
        confidence: role === 'empty' ? 1 : 0.6 + 0.3 * Math.min(1, notes / 8),
      };
      segments.push(seg);
      const prev = prevRoles[ch];
      if (prev !== role) {
        if (role === 'percussion' && prev !== 'percussion') events.push({ kind: 'DRUM_ENTRY', time: start, orderPosition: p, row: 0, channel: ch, confidence: 0.8 });
        if (role === 'bass') events.push({ kind: 'BASS_ENTRY', time: start, orderPosition: p, row: 0, channel: ch, confidence: 0.8 });
        if (prev === 'bass' && role !== 'bass') events.push({ kind: 'BASS_EXIT', time: start, orderPosition: p, row: 0, channel: ch, confidence: 0.8 });
        if (role === 'lead' || role === 'arpeggio') events.push({ kind: 'MELODY_ENTRY', time: start, orderPosition: p, row: 0, channel: ch, confidence: 0.7 });
        if (prev === 'empty' || prev === null) { if (role !== 'empty') events.push({ kind: 'INSTRUMENT_ENTRY', time: start, orderPosition: p, row: 0, channel: ch, confidence: 0.7 }); }
        else if (role === 'empty') events.push({ kind: 'INSTRUMENT_EXIT', time: start, orderPosition: p, row: 0, channel: ch, confidence: 0.7 });
      }
      // Timelines and instrument usage from the cells.
      const chRows = pattern.channels[ch]?.rows ?? [];
      for (let r = 0; r < chRows.length; r++) {
        const cell = chRows[r];
        if (!cell || cell.note < 1 || cell.note > 96) continue;
        const played = rowTimes[p]?.[r - pos.startRow];
        if (played === undefined) continue; // a row the song never reaches (before a Dxx target, after a break)
        const t = T(played);
        const h = Math.min(hops - 1, Math.floor(t / HOP_SEC));
        density[h] += 1;
        if (role === 'bass') bassTl[h] += 1;
        if (role === 'percussion') drumTl[h] += 1;
        if (role === 'lead' || role === 'arpeggio' || role === 'chord') melodyTl[h] += 1;
        const inst = cell.instrument ?? 0;
        if (inst > 0) {
          const u = instrumentUsage.get(inst);
          if (u) { u.lastTime = t; u.notes++; } else instrumentUsage.set(inst, { firstTime: t, lastTime: t, notes: 1 });
        }
      }
      // Fill: a percussion channel much busier in the last 4 rows than before.
      if (role === 'percussion' && rows >= 16) {
        const endRow = pos.startRow + rows;
        const tail = noteCount(pattern, ch, endRow - 4, endRow);
        const body = noteCount(pattern, ch, pos.startRow, endRow - 4) / Math.max(1, (rows - 4) / 4);
        if (tail >= 3 && tail > body * 2) {
          events.push({ kind: 'FILL', time: T(rowTimes[p]?.[rows - 4] ?? pos.end), orderPosition: p, row: endRow - 4, channel: ch, confidence: 0.7 });
        }
      }
    });
    prevRoles = analyses.map((a) => a.role);

    // Density steps, breaks and drops between order positions.
    const d = total / (rows * Math.max(1, numChannels));
    if (prevDensity >= 0) {
      if (d > prevDensity * 1.5 + 0.02) {
        events.push({ kind: 'DENSITY_INCREASE', time: start, orderPosition: p, row: 0, confidence: 0.8 });
        const drums = analyses.some((a) => a.role === 'percussion');
        const bassOn = analyses.some((a) => a.role === 'bass');
        if (drums && bassOn && d > prevDensity * 2) events.push({ kind: 'DROP', time: start, orderPosition: p, row: 0, confidence: 0.6 });
      } else if (d < prevDensity * 0.6) {
        events.push({ kind: 'DENSITY_DECREASE', time: start, orderPosition: p, row: 0, confidence: 0.8 });
        const noDrums = !analyses.some((a) => a.role === 'percussion');
        if (noDrums) events.push({ kind: 'BREAK', time: start, orderPosition: p, row: 0, confidence: 0.6 });
      }
    }
    prevDensity = d;
    if (total === 0) {
      silences.push({ start, end });
      events.push({ kind: 'SILENCE', time: start, orderPosition: p, row: 0, confidence: 1 });
    }
    void rowsPerBeat;
  });

  const norm = (v: number[]): ActivityTimeline => {
    const mx = Math.max(...v, 1e-9);
    return { hopSec: HOP_SEC, values: v.map((x) => Math.min(1, x / mx)), confidence: 0.9 };
  };

  events.sort((a, b) => a.time - b.time);
  return {
    orderPositions: positions.map((p) => ({ ...p, start: T(p.start), end: T(p.end) })),
    patternBoundaries,
    channelSegments: segments,
    events,
    noteDensity: norm(density),
    bassActivity: norm(bassTl),
    drumActivity: norm(drumTl),
    melodyActivity: norm(melodyTl),
    instrumentUsage: [...instrumentUsage.entries()].map(([instrument, u]) => ({ instrument, ...u })).sort((a, b) => a.instrument - b.instrument),
    sampleUsage: [...instrumentUsage.keys()].sort((a, b) => a - b),
    repeatedPhrases: repeated,
    silences,
    structuralTransitions: structural,
    durationSec,
    confidence: positions.length > 0 && numChannels > 0 ? 0.85 : 0,
  };
}
