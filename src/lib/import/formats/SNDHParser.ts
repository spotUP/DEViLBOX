/**
 * SNDHParser.ts - Atari ST SNDH (.snd / .sndh, raw or ICE!-packed)
 *
 * An SNDH file is the tune's own 68000 player code with a tag header; there
 * is no pattern data and nothing to edit. PsgplayEngine plays the whole file
 * (PSG play: 68000 + YM2149 + MFP timers + STE DMA sound), and the song opens
 * in the Atari ST scope view (editor mode 'sc68'), the view every uneditable
 * logged format uses (owner, 2026-10-05). The parser reads the tag header
 * only: an earlier version ran the emulator on the main thread for 30 s of
 * music at load (up to ~3 s) to draw a register grid nobody could edit.
 *
 * SC68 containers ('SC68 Music-file') are not SNDH; Sc68Parser takes them.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { getNativeFormatExtendedMetadata } from '../NativeFormatMetadata';
import { emptyPattern } from './Sc68Parser';

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

/**
 * Parse an SNDH file. `subsong` is 0-based (the import's convention); -1 or
 * out of range plays the file's default subtune (track 0 to PSG play).
 */
export async function parseSNDHFile(buffer: ArrayBuffer, filename = 'song.snd', subsong = -1): Promise<TrackerSong> {
  if (!isSNDHFormat(buffer)) throw new Error(`${filename}: not an SNDH file`);
  // Tags sit in the plain header; an ICE!-packed file shows its name until played.
  const meta = getNativeFormatExtendedMetadata('sndh', buffer);
  const subtunes = meta?.subsongCount ?? 1;
  const track = subsong >= 0 && subsong < subtunes ? subsong + 1 : 0;

  const instruments: InstrumentConfig[] = ['YM A', 'YM B', 'YM C'].map((name, i): InstrumentConfig => ({
    id: i + 1, name, type: 'synth', synthType: 'PsgplaySynth', effects: [], volume: 0, pan: 0,
  }));
  const pattern = emptyPattern(3, 64); // channels YM A, B, C

  const base = meta?.title || filename.replace(/\.(snd|sndh)$/i, '');
  const sub = subtunes > 1 ? ` (${track || 1}/${subtunes})` : '';
  return {
    name: base + sub + (meta?.composer ? ` — ${meta.composer}` : ''),
    format: 'SNDH' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 3,
    initialSpeed: 6,
    initialBPM: 125,
    sndhFileData: buffer.slice(0),
    sndhSubtune: track,
  };
}
