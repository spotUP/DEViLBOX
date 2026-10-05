/**
 * StoneTrackerParser.ts - StoneTracker (Amiga, .spm song + .sps sample bank).
 *
 * Playback is StoneTrackerEngine (stonetracker-wasm: the authors'
 * StonePlayer_Hard.bin on Musashi's 68020 with a Paula and CIA-B); this
 * parser draws the grid and carries both files. Layout from the authors'
 * includes (StonePlayer.I / StonePlayer_lib.h) and the player's own reader
 * (StonePlayer_Hard.bin $1E5C, $1730), recorded in
 * thoughts/shared/research/2026-10-05_stonetracker-replayer.md:
 *
 * - Module: 'SPM', version, name[31], flags, NbSong, NbPattern, NbPatternCTRL,
 *   PatternLength, private long, then NbSong + NbPattern + NbPatternCTRL long
 *   offsets (songs, track patterns, CTRL patterns).
 * - Song: name[31], BPM, NbVoice, CtrlList, NbPosition, then one list of
 *   NbPosition pattern numbers per track (plus one for the CTRL track).
 * - A pattern is ONE track. Words: byte 0 bit 7 ends the row; $7F nn = this
 *   row and nn more are empty; byte 0 < 37 = note (1-36) + sample in byte 1;
 *   byte 0 >= 37 = effect (byte 0 - 37) with byte 1 as its parameter. Up to
 *   seven effects per row (eight on the CTRL track).
 * - Note n is the period table's entry n - 1 with finetune 0 at 856 = C-1, so
 *   StoneTracker note n is DEViLBOX note n + 12.
 *
 * The grid shows song 1 (the song the engine plays): one grid pattern per
 * distinct combination of track patterns, notes and samples, and the first two
 * ProTracker-compatible effects of each row (00-0D and 0F as they are,
 * 10-1E as Exy). The other effects stay in the file, which the engine plays
 * whole.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';

const NOTE_OFFSET = 12;
const MAX_NOTE = 36;
const FIRST_EFFECT = 37;

const ascii = (bytes: Uint8Array, at: number, text: string): boolean => {
  if (bytes.length < at + text.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[at + i] !== text.charCodeAt(i)) return false;
  return true;
};
const u16 = (b: Uint8Array, at: number): number => (b[at] << 8) | b[at + 1];
const u32 = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const text = (b: Uint8Array, at: number, len: number): string => {
  let s = '';
  for (let i = 0; i < len && at + i < b.length; i++) {
    const c = b[at + i];
    if (c === 0) break;
    s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ' ';
  }
  return s.trim();
};

/** StoneTracker song: 'SPM' magic. */
export function isStoneTrackerFormat(bytes: Uint8Array): boolean { return ascii(bytes, 0, 'SPM') && bytes.length >= 52; }

/** StoneTracker sample bank: 'SPS' magic. */
export function isStoneTrackerSampleBank(bytes: Uint8Array): boolean { return ascii(bytes, 0, 'SPS') && bytes.length >= 6; }

export interface StoneTrackerRow {
  note: number;      // 1-36, 0 none
  sample: number;    // 1-255, 0 none
  effects: Array<{ cmd: number; param: number }>;
}

/** One track pattern decoded to `rows` rows, exactly as the player reads it. */
export function decodeStoneTrackerPattern(bytes: Uint8Array, offset: number, rows: number): StoneTrackerRow[] {
  const out: StoneTrackerRow[] = [];
  let p = offset;
  while (out.length < rows && p + 1 < bytes.length) {
    const row: StoneTrackerRow = { note: 0, sample: 0, effects: [] };
    let empty = 0;
    for (;;) {
      if (p + 1 >= bytes.length) break;
      const b0 = bytes[p], b1 = bytes[p + 1];
      p += 2;
      const code = b0 & 0x7f;
      if (code === 0x7f) empty = b1;
      else if (code < FIRST_EFFECT) {
        if (code > 0 && code <= MAX_NOTE) row.note = code;
        if (b1) row.sample = b1;
      } else {
        row.effects.push({ cmd: code - FIRST_EFFECT, param: b1 });
      }
      if (b0 & 0x80) break;
    }
    out.push(row);
    for (let i = 0; i < empty && out.length < rows; i++) out.push({ note: 0, sample: 0, effects: [] });
  }
  while (out.length < rows) out.push({ note: 0, sample: 0, effects: [] });
  return out;
}

/** The XM-numbered effect a StoneTracker effect shows as, or null if it has none. */
function gridEffect(cmd: number, param: number): { typ: number; val: number } | null {
  if (cmd <= 0x0d || cmd === 0x0f) return { typ: cmd, val: param };          // ProTracker 0-D, F
  if (cmd >= 0x10 && cmd <= 0x1e) return { typ: 0x0e, val: ((cmd & 0x0f) << 4) | (param & 0x0f) };  // 1x0y = Exy
  return null;   // 0E Set Note, 20-33: StoneTracker's own
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

function toCell(row: StoneTrackerRow | undefined, used: Set<number>): TrackerCell {
  const cell = emptyCell();
  if (!row) return cell;
  if (row.note) cell.note = row.note + NOTE_OFFSET;
  if (row.sample) { cell.instrument = row.sample; used.add(row.sample); }
  const shown = row.effects.map((e) => gridEffect(e.cmd, e.param)).filter((e): e is { typ: number; val: number } => e !== null);
  if (shown[0]) { cell.effTyp = shown[0].typ; cell.eff = shown[0].val; }
  if (shown[1]) { cell.effTyp2 = shown[1].typ; cell.eff2 = shown[1].val; }
  return cell;
}

/**
 * Parse an SPM song. `sampleBank` is the SPS file beside it; the engine needs
 * it to play, so a song without one is refused with the file it wants.
 */
export function parseStoneTrackerFile(buffer: ArrayBuffer | Uint8Array, filename = 'song.spm', sampleBank?: ArrayBuffer | Uint8Array): TrackerSong {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (!isStoneTrackerFormat(bytes)) throw new Error(`${filename}: not a StoneTracker SPM song`);
  const bank = sampleBank ? (sampleBank instanceof Uint8Array ? sampleBank : new Uint8Array(sampleBank)) : undefined;
  if (!bank || !isStoneTrackerSampleBank(bank)) {
    throw new Error(`${filename}: a StoneTracker song plays from its sample bank - add SPS.<tune> (or <tune>.sps) beside it`);
  }

  const nbSong = u16(bytes, 36), nbPattern = u16(bytes, 38), nbCtrl = u16(bytes, 40);
  const patternLength = Math.max(1, u16(bytes, 42));
  const tableEnd = 48 + 4 * (nbSong + nbPattern + nbCtrl);
  if (nbSong < 1 || tableEnd > bytes.length) throw new Error(`${filename}: StoneTracker song table runs past the file`);
  const offsets = (first: number, count: number): number[] => Array.from({ length: count }, (_, i) => u32(bytes, 48 + 4 * (first + i)));
  const songOffsets = offsets(0, nbSong);
  const patternOffsets = offsets(nbSong, nbPattern);
  const ctrlOffsets = offsets(nbSong + nbPattern, nbCtrl);

  // Song 1 - the song StoneTrackerEngine starts (spSetPlayerPos(1, 0, 0)).
  const s = songOffsets[0];
  if (s + 36 > bytes.length) throw new Error(`${filename}: StoneTracker song header runs past the file`);
  const songName = text(bytes, s, 31);
  const bpm = bytes[s + 31] || 125;
  const voices = Math.max(1, Math.min(8, bytes[s + 32]));
  const hasCtrl = bytes[s + 33] !== 0;
  const positions = u16(bytes, s + 34);
  const listAt = (track: number, pos: number): number => u16(bytes, s + 36 + 2 * (track * positions + pos));

  const decoded = new Map<string, StoneTrackerRow[]>();
  const patternRows = (ctrl: boolean, index: number): StoneTrackerRow[] | undefined => {
    const table = ctrl ? ctrlOffsets : patternOffsets;
    if (index >= table.length || table[index] >= bytes.length) return undefined;
    const key = `${ctrl ? 'c' : 't'}${index}`;
    let rows = decoded.get(key);
    if (!rows) { rows = decodeStoneTrackerPattern(bytes, table[index], patternLength); decoded.set(key, rows); }
    return rows;
  };

  const channelCount = voices + (hasCtrl ? 1 : 0);
  const gridIndex = new Map<string, number>();
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const usedSamples = new Set<number>();
  for (let pos = 0; pos < positions; pos++) {
    const tracks = Array.from({ length: voices }, (_, t) => listAt(t, pos));
    const ctrl = hasCtrl ? listAt(voices, pos) : -1;
    const key = `${tracks.join(',')}|${ctrl}`;
    let index = gridIndex.get(key);
    if (index === undefined) {
      const channels = Array.from({ length: channelCount }, (_, ch): ChannelData => {
        const isCtrl = ch === voices;
        const rows = isCtrl ? patternRows(true, ctrl) : patternRows(false, tracks[ch]);
        return {
          id: `ch${ch}`, name: isCtrl ? 'FX' : `Track ${ch + 1}`, muted: false, solo: false, collapsed: false,
          volume: 100, pan: 0, instrumentId: null, color: null,
          rows: Array.from({ length: patternLength }, (_, r) => toCell(rows?.[r], usedSamples)),
        };
      });
      index = patterns.length;
      gridIndex.set(key, index);
      patterns.push({ id: `p${index}`, name: `Position ${pos}`, length: patternLength, channels });
    }
    songPositions.push(index);
  }

  // Instruments: the bank's sample headers (name[8], ..., volume).
  const nbSamples = bank[5];
  const instruments: InstrumentConfig[] = [...usedSamples].sort((a, b) => a - b).map((id) => {
    const at = 6 + (id - 1) * 32;
    const name = id <= nbSamples ? text(bank, at, 8) : '';
    return {
      id, name: name || `Sample ${id}`,
      type: 'synth' as const, synthType: 'StoneTrackerSynth' as const, effects: [] as [], volume: 0, pan: 0,
    };
  });

  const copy = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const moduleName = text(bytes, 4, 31);
  return {
    name: moduleName || songName || filename.replace(/^spm\.|\.spm$/i, ''),
    format: 'StoneTracker' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: channelCount,
    // The player starts at speed 6 (spInitPlayer) and the song's BPM.
    initialSpeed: 6,
    initialBPM: bpm,
    stoneTrackerFileData: copy(bytes),
    stoneTrackerSampleData: copy(bank),
  };
}
