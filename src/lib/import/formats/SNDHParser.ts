/**
 * SNDHParser.ts - Atari ST SNDH (.snd / .sndh, raw or ICE!-packed)
 *
 * An SNDH file is the tune's own 68000 player code with a tag header; there
 * is no pattern data. PsgplayEngine plays the whole file (PSG play: 68000 +
 * YM2149 + MFP timers + STE DMA sound). The grid is a view drawn from the YM
 * registers the same psgplay wasm sees while it runs the chosen subtune
 * (PsgplayWasmExtractor), one row per 1/50 s, so it scrolls with the music.
 * The run happens at load on the main thread and the 68000 emulation costs
 * up to ~1/10 of real time on heavy players, so only the first GRID_SECONDS
 * are drawn; the grid still spans the TIME tag's length, the rest empty, so
 * the playhead stays where the music is.
 * The tags (title, composer, year, '##' subtune count, TIME) are read by
 * PSG play's sndh.c from the decrunched file.
 *
 * SC68 containers ('SC68 Music-file') are not SNDH; Sc68Parser takes them.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import { extractSNDHRegisterFrames } from './PsgplayWasmExtractor';
import { ATARI_ST_YM_CLOCK, ymFramesToPatterns } from './ymRegisterGrid';

function ascii(b: Uint8Array, off: number, tag: string): boolean {
  if (off + tag.length > b.length) return false;
  for (let i = 0; i < tag.length; i++) if (b[off + i] !== tag.charCodeAt(i)) return false;
  return true;
}

/** SNDH: 'SNDH' at offset 12 (after the init/exit/play branches), or an ICE!-packed file. */
export function isSNDHFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength));
  return ascii(b, 12, 'SNDH') || ascii(b, 0, 'ICE!');
}

/** Seconds of the subtune drawn into the grid at load. */
const GRID_SECONDS = 30;
/** Longest grid (rows of 1/50 s) a TIME tag can ask for: ten minutes. */
const MAX_GRID_ROWS = 10 * 60 * 50;

/**
 * Parse an SNDH file. `subsong` is 0-based (the import's convention); -1 or
 * out of range plays the file's default subtune.
 */
export async function parseSNDHFile(buffer: ArrayBuffer, filename = 'song.snd', subsong = -1): Promise<TrackerSong> {
  if (!isSNDHFormat(buffer)) throw new Error(`${filename}: not an SNDH file`);
  const track = subsong >= 0 ? subsong + 1 : 0;

  const x = await extractSNDHRegisterFrames(buffer, track, GRID_SECONDS * 50);
  const totalRows = x.seconds > 0 ? Math.min(MAX_GRID_ROWS, Math.ceil(x.seconds * 50)) : x.frames.length;
  const patterns: Pattern[] = ymFramesToPatterns(x.frames, { clock: ATARI_ST_YM_CLOCK, channelPrefix: 'YM', totalRows });

  const instruments: InstrumentConfig[] = ['YM A', 'YM B', 'YM C'].map((name, i): InstrumentConfig => ({
    id: i + 1, name, type: 'synth', synthType: 'PsgplaySynth', effects: [], volume: 0, pan: 0,
  }));

  const base = x.title || filename.replace(/\.(snd|sndh)$/i, '');
  const sub = x.subtunes > 1 ? ` (${x.track}/${x.subtunes})` : '';
  return {
    name: base + sub + (x.composer ? ` — ${x.composer}` : ''),
    format: 'SNDH' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: 3,
    // 50 rows a second: one row per register frame.
    initialSpeed: 1,
    initialBPM: 125,
    sndhFileData: buffer.slice(0),
    sndhSubtune: x.track,
  };
}
