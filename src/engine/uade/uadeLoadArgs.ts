/**
 * What UADE is loaded with for a song, and the clock its grid follows: pure functions of the song, in a leaf module so the
 * engine registry (which imports no engine) and the row-preview worker can read them.
 *
 * UADEEngine.loadTune used to read these from the format store; the song carries the same fields (liveTrackerSong), so the
 * registry hands them to loadTune as arguments and the row preview opens its private player on exactly the same load.
 */
import type { TrackerSong } from '../TrackerReplayer';

/** The song fields that decide a UADE load. */
export type UadeLoadSong = Pick<TrackerSong, 'uadeEditableFileName' | 'uadeEditableSubsongs' | 'uadeEditableCurrentSubsong' | 'fileSubsongs' | 'uadeCompanionFiles'>;

/** [filenameHint, subsong (UADE's number), pinSubsong, companions] - UADEEngine.loadTune's arguments. */
export type UadeLoadArgs = [fileName: string, subsong: number, pinSubsong: boolean, companions: Map<string, ArrayBuffer> | undefined];

/**
 * The load arguments. A grid decoded per subsong (uadeEditableSubsongs.orders) shows one subsong: UADE plays exactly that
 * one, never the first-audible probe's pick; its UADE number counts from the player's lowest (`first`; Hippel ST's is 1). A
 * command-stream file whose parser drew one tune (fileSubsongs, e.g. Rob Hubbard) is played on that tune too.
 */
export function uadeEditableLoadArgs(song: UadeLoadSong): UadeLoadArgs {
  const first = song.uadeEditableSubsongs?.first ?? 0;
  const tune = song.fileSubsongs;
  const subsong = tune ? first + tune.current : first + (song.uadeEditableCurrentSubsong ?? 0);
  return [song.uadeEditableFileName || 'module.mod', subsong, !!song.uadeEditableSubsongs?.orders || !!tune, song.uadeCompanionFiles ?? undefined];
}

/**
 * The counter a row is named in. 'player': the player-interrupt count (CIA-A Timer B) of a parser-decoded grid, row 0 on
 * the first interrupt. 'cia': the CIA-A Timer A count of a scanned grid, counted from `firstTick`. 'frames': a song whose
 * grid carries no UADE clock (an opaque player; a TFMX timing table): the playhead keeps time itself, so a row is a stretch
 * of the song's output frames.
 */
export type UadeRowClock = { kind: 'player' } | { kind: 'cia'; firstTick: number } | { kind: 'frames' };

export function uadeRowClock(song: Pick<TrackerSong, 'uadePlayerTickGrid' | 'uadeFirstTick' | 'tfmxTimingTable' | 'uadeEditableFileData'>): UadeRowClock {
  // The opaque player (no editable data) and a TFMX timing table keep the playhead on the output frame count.
  if (!song.uadeEditableFileData) return { kind: 'frames' };
  if (song.tfmxTimingTable && song.tfmxTimingTable.length > 0) return { kind: 'frames' };
  if (song.uadePlayerTickGrid === true) return { kind: 'player' };
  if (song.uadeFirstTick != null) return { kind: 'cia', firstTick: song.uadeFirstTick };
  return { kind: 'frames' };
}

/** One TFMX jiffy is a 50 Hz vertical blank. */
const JIFFIES_PER_SECOND = 50;

/**
 * The opaque UADE player (UADESynth: no editable data, a grid UADE's scan drew) keeps its playhead on the output frame count:
 * a fixed row length of 6 ticks at 125 BPM in 44.1 kHz frames, whatever the sample rate (usePatternPlayback). A row is that
 * many frames; a pattern is `patterns[0].length` rows.
 */
export const OPAQUE_UADE_FRAMES_PER_ROW = Math.round(44100 * 2.5 * 6 / 125);

type FrameSong = Pick<TrackerSong, 'tfmxTimingTable' | 'songPositions' | 'patterns' | 'initialSpeed' | 'initialBPM'>;

/**
 * Grid row (`songPos`, `row`) of a UADE song whose grid carries no UADE clock, as output frames from the song's start - the
 * stretch the playhead shows that row for.
 *
 * - TFMX timing table: the row's first entry to the next entry of another row, at the song's own 50 Hz jiffies (the follow
 *   converts with a fixed 882 frames per jiffy, right at 44.1 kHz only; the music itself runs 50 jiffies a second).
 * - `opaque` (UADESynth, no editable data): OPAQUE_UADE_FRAMES_PER_ROW frames a row, `patterns[0].length` rows a pattern.
 * - Otherwise the replayer's scheduler keeps time: `speed` ticks of 2.5 / bpm seconds per row, from row 0 of the first
 *   position, positions in the song's order.
 */
export function uadeRowFrames(song: FrameSong, songPos: number, row: number, sampleRate: number, opaque: boolean): { from: number; to: number } {
  const table = song.tfmxTimingTable;
  if (table && table.length > 0) {
    const framesPerJiffy = sampleRate / JIFFIES_PER_SECOND;
    const i = table.findIndex((e) => e.patternIndex === songPos && e.row === row);
    // A row the table never names is no row the playhead shows: the song never reaches it (the stream answers 'missed').
    if (i < 0) return { from: Infinity, to: Infinity };
    let j = i + 1;
    while (j < table.length && table[j]!.patternIndex === songPos && table[j]!.row === row) j++;
    const from = Math.round(table[i]!.cumulativeJiffies * framesPerJiffy);
    const to = j < table.length ? Math.round(table[j]!.cumulativeJiffies * framesPerJiffy) : from + Math.round(framesPerJiffy);
    return { from, to };
  }
  if (opaque) {
    const global = songPos * (song.patterns[0]?.length ?? 64) + row;
    return { from: global * OPAQUE_UADE_FRAMES_PER_ROW, to: (global + 1) * OPAQUE_UADE_FRAMES_PER_ROW };
  }
  const lengths = song.songPositions.map((p) => Math.max(1, song.patterns[p]?.length ?? 64));
  const pos = Math.max(0, Math.min(songPos, lengths.length - 1));
  let rows = 0;
  for (let p = 0; p < pos; p++) rows += lengths[p]!;
  rows += Math.max(0, Math.min(row, (lengths[pos] ?? 1) - 1));
  const framesPerRow = (sampleRate * 2.5 * Math.max(1, song.initialSpeed || 6)) / Math.max(1, song.initialBPM || 125);
  return { from: Math.round(rows * framesPerRow), to: Math.round((rows + 1) * framesPerRow) };
}

/**
 * What the opaque player (UADESynth) is loaded with: the instrument's module, name and subsong, the song's companions
 * (UADESynth.setInstrument -> UADEEngine.loadForPlayback, nothing pinned). Null when the song has no such instrument.
 */
export function uadeClassicLoad(song: Pick<TrackerSong, 'instruments' | 'uadeCompanionFiles'>): { data: ArrayBuffer; args: UadeLoadArgs } | null {
  const inst = song.instruments?.find((i) => i.synthType === 'UADESynth' && i.uade?.fileData);
  const cfg = inst?.uade;
  if (!cfg) return null;
  return { data: cfg.fileData, args: [cfg.filename, cfg.currentSubsong ?? 0, false, song.uadeCompanionFiles ?? undefined] };
}

/**
 * The mask a UADE row clip is rendered with. Bits 0-3: the Paula voices audible (`uade_wasm_mute_channels`: a muted voice is
 * silent in the mix and in its buffer). Bits 8-11: voices taken out of the stereo mix but kept in their buffers
 * (`uade_wasm_isolate_channels`, an effect-isolation slot) - the playing instance holds both.
 */
export const uadeMaskAudible = (mask: number): number => mask & 0xF;
export const uadeMaskIsolated = (mask: number): number => (mask >>> 8) & 0xF;
export const uadeMask = (audible: number, isolated: number): number => ((isolated & 0xF) << 8) | (audible & 0xF);
