/**
 * GameMusicParser.ts - console game music played by game-music-emu
 *
 * NSF/NSFE (NES), GBS (Game Boy), HES (PC Engine), KSS (MSX), SPC (SNES),
 * VGM/VGZ (Sega SN76489 / YM2413 / YM2612) and GYM (Mega Drive) are the
 * game's own sound program, or a register log, for a console's CPU and sound
 * chips. There is no pattern data and nothing to edit: GmeEngine
 * (game-music-emu in wasm) plays the whole file and the song opens in the
 * scope view, like SNDH, SAP and AY (owner, 2026-10-05). The parser reads the
 * header only - title, author, track count - and returns one empty pattern
 * with a channel per emulated voice, so the mixer's mute and solo reach the
 * voices (bit N of the engine's mute mask = channel N).
 *
 * The earlier parsers rebuilt approximate notes from register writes onto
 * Furnace instruments (NSF, VGM) or opened an empty stub with no playback
 * (GBS, HES, KSS, SPC); GYM was not opened at all.
 *
 * VGM files for chips game-music-emu does not emulate (YM2151, OPL, ...)
 * stay on VGMParser: `isGmeVgm` is the routing decision.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { emptyPattern } from './Sc68Parser';

export type GameMusicType = 'NSF' | 'NSFE' | 'GBS' | 'HES' | 'KSS' | 'SPC' | 'VGM' | 'GYM';

function ascii(b: Uint8Array, off: number, tag: string): boolean {
  if (off + tag.length > b.length) return false;
  for (let i = 0; i < tag.length; i++) if (b[off + i] !== tag.charCodeAt(i)) return false;
  return true;
}

function text(b: Uint8Array, off: number, max: number): string {
  let s = '';
  for (let i = off; i < Math.min(off + max, b.length) && b[i] !== 0; i++) s += String.fromCharCode(b[i]);
  return s.trim();
}

const u32 = (b: Uint8Array, off: number): number =>
  off + 4 <= b.length ? (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0 : 0;

/**
 * The file type from its header, as game-music-emu identifies it
 * (gme_identify_header). A GYM without the GYMX header is a bare register
 * stream with no magic; only the `.gym` extension identifies it.
 */
export function gameMusicType(buffer: ArrayBuffer, filename = ''): GameMusicType | null {
  const b = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 0x30));
  if (ascii(b, 0, 'NESM\x1a')) return 'NSF';
  if (ascii(b, 0, 'NSFE')) return 'NSFE';
  if (ascii(b, 0, 'GBS')) return 'GBS';
  if (ascii(b, 0, 'HESM')) return 'HES';
  if (ascii(b, 0, 'KSCC') || ascii(b, 0, 'KSSX')) return 'KSS';
  if (ascii(b, 0, 'SNES-SPC700 Sound File Data')) return 'SPC';
  if (ascii(b, 0, 'Vgm ')) return 'VGM';
  if (ascii(b, 0, 'GYMX') || /\.gym$/i.test(filename)) return 'GYM';
  return null;
}

// VGM header clock fields of chips game-music-emu does not emulate (VGM 1.71).
// game-music-emu plays SN76489 (0x0C), YM2413 (0x10) and YM2612 (0x2C).
const VGM_OTHER_CLOCKS = [
  0x30, 0x38, 0x40, 0x44, 0x48, 0x4C, 0x50, 0x54, 0x58, 0x5C, 0x60, 0x64, 0x68, 0x6C, 0x70, 0x74,
  0x80, 0x84, 0x88, 0x8C, 0x90, 0x98, 0x9C, 0xA0, 0xA4, 0xA8, 0xAC, 0xB0, 0xB4, 0xB8,
  0xC0, 0xC4, 0xC8, 0xCC, 0xD0, 0xD8, 0xDC, 0xE0,
];

function vgmDataStart(b: Uint8Array): number {
  const version = u32(b, 0x08);
  const rel = version >= 0x150 ? u32(b, 0x34) : 0;
  return rel ? 0x34 + rel : 0x40;
}

/**
 * True when a (decompressed) VGM uses only chips game-music-emu emulates:
 * SN76489, YM2413 and YM2612 (Master System, Game Gear, Mega Drive, ...).
 */
export function isGmeVgm(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  if (!ascii(b, 0, 'Vgm ')) return false;
  const version = u32(b, 0x08);
  const end = vgmDataStart(b);
  const clock = (off: number): number => (off + 4 <= end ? u32(b, off) & 0x3FFFFFFF : 0);
  const known = clock(0x0C) || clock(0x10) || (version >= 0x110 ? clock(0x2C) : 0);
  if (!known) return false;
  if (version < 0x110) return true; // 1.00/1.01: SN76489 and one FM clock only
  return VGM_OTHER_CLOCKS.every((off) => clock(off) === 0);
}

/** The sound chips a game-music-emu VGM drives, from its header clocks, e.g. 'YM2612 + SN76489'. */
export function vgmChips(buffer: ArrayBuffer): string {
  const b = new Uint8Array(buffer);
  const v110 = u32(b, 0x08) >= 0x110;
  const chips: string[] = [];
  if (v110 && u32(b, 0x2C) & 0x3FFFFFFF) chips.push('YM2612');
  if (u32(b, 0x10) & 0x3FFFFFFF) chips.push(v110 ? 'YM2413' : 'FM');
  if (u32(b, 0x0C) & 0x3FFFFFFF) chips.push('SN76489');
  return chips.join(' + ');
}

interface Header { title: string; author: string; game: string; tracks: number; voices: string[] }

const NES_APU = ['Square 1', 'Square 2', 'Triangle', 'Noise', 'DMC'];

/** NES expansion voices in game-music-emu's order (Nsf_Emu::init_sound). */
function nesVoices(chipFlags: number): string[] {
  const v = [...NES_APU];
  if (chipFlags & 0x01) v.push('VRC6 Saw', 'VRC6 Square 1', 'VRC6 Square 2');
  if (chipFlags & 0x10) for (let i = 1; i <= 8; i++) v.push(`Namco Wave ${i}`);
  if (chipFlags & 0x20) v.push('Sunsoft Square 1', 'Sunsoft Square 2', 'Sunsoft Square 3');
  if (chipFlags & 0x04) v.push('FDS Wave');
  if (chipFlags & 0x08) v.push('MMC5 Square 1', 'MMC5 Square 2', 'MMC5 PCM');
  if (chipFlags & 0x02) for (let i = 1; i <= 6; i++) v.push(`VRC7 FM ${i}`);
  return v;
}

const FM_VOICES = ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'PCM', 'PSG'];

function utf16(b: Uint8Array, off: number): { s: string; next: number } {
  let s = '';
  let i = off;
  for (; i + 1 < b.length; i += 2) {
    const c = b[i] | (b[i + 1] << 8);
    if (c === 0) { i += 2; break; }
    s += String.fromCharCode(c);
  }
  return { s, next: i };
}

function nsfeHeader(b: Uint8Array): Header {
  const h: Header = { title: '', author: '', game: '', tracks: 1, voices: [...NES_APU] };
  for (let off = 4; off + 8 <= b.length;) {
    const size = u32(b, off);
    const id = text(b, off + 4, 4);
    const body = off + 8;
    if (id === 'INFO') {
      h.voices = nesVoices(b[body + 7] ?? 0);
      h.tracks = Math.max(1, b[body + 8] ?? 1);
    } else if (id === 'auth') {
      // game, artist, copyright, ripper: NUL-terminated strings
      const strs: string[] = [];
      for (let p = body; p < body + size && strs.length < 2;) {
        const s = text(b, p, body + size - p);
        strs.push(s);
        p += s.length + 1;
      }
      [h.game = '', h.author = ''] = strs;
    } else if (id === 'NEND') break;
    off = body + size;
  }
  return h;
}

function readHeader(type: GameMusicType, b: Uint8Array): Header {
  switch (type) {
    case 'NSF':
      return { game: text(b, 0x0E, 32), title: '', author: text(b, 0x2E, 32), tracks: Math.max(1, b[6]), voices: nesVoices(b[0x7B]) };
    case 'NSFE':
      return nsfeHeader(b);
    case 'GBS':
      return { game: text(b, 0x10, 32), title: '', author: text(b, 0x30, 32), tracks: Math.max(1, b[4]), voices: ['Square 1', 'Square 2', 'Wave', 'Noise'] };
    case 'HES':
      // No tags and no track count: game-music-emu offers 256 tracks.
      return { game: '', title: '', author: '', tracks: 256, voices: ['Wave 1', 'Wave 2', 'Wave 3', 'Wave 4', 'Wave 5', 'Wave 6'] };
    case 'KSS':
      return { game: '', title: '', author: '', tracks: 256, voices: ['PSG 1', 'PSG 2', 'PSG 3', 'SCC 1', 'SCC 2', 'SCC 3', 'SCC 4', 'SCC 5'] };
    case 'SPC':
      // ID666 text tags (binary-tag files carry the same strings at these offsets).
      return {
        title: text(b, 0x2E, 32), game: text(b, 0x4E, 32), author: text(b, 0xB1, 32), tracks: 1,
        voices: Array.from({ length: 8 }, (_, i) => `DSP ${i + 1}`),
      };
    case 'VGM': {
      const gd3 = u32(b, 0x14) ? 0x14 + u32(b, 0x14) : 0;
      const h: Header = { title: '', author: '', game: '', tracks: 1, voices: [] };
      if (gd3 && ascii(b, gd3, 'Gd3 ')) {
        const s: string[] = [];
        for (let p = gd3 + 12; s.length < 7;) { const r = utf16(b, p); s.push(r.s); p = r.next; }
        h.title = s[0]; h.game = s[2]; h.author = s[6] ?? '';
      }
      const fm = (u32(b, 0x10) & 0x3FFFFFFF) || (u32(b, 0x08) >= 0x110 && (u32(b, 0x2C) & 0x3FFFFFFF));
      h.voices = fm ? FM_VOICES : ['Square 1', 'Square 2', 'Square 3', 'Noise'];
      return h;
    }
    case 'GYM':
      return ascii(b, 0, 'GYMX')
        ? { title: text(b, 0x04, 32), game: text(b, 0x24, 32), author: '', tracks: 1, voices: FM_VOICES }
        : { title: '', game: '', author: '', tracks: 1, voices: FM_VOICES };
  }
}

/**
 * Parse a game-music file. `subsong` is the 0-based track game-music-emu
 * starts; out of range starts track 0.
 */
export async function parseGameMusicFile(buffer: ArrayBuffer, filename = 'song', subsong = 0): Promise<TrackerSong> {
  const type = gameMusicType(buffer, filename);
  if (!type) throw new Error(`${filename}: not a game-music-emu file`);
  if (type === 'VGM' && !isGmeVgm(buffer)) throw new Error(`${filename}: VGM chips game-music-emu does not emulate`);
  const h = readHeader(type, new Uint8Array(buffer));
  const track = subsong >= 0 && subsong < h.tracks ? subsong : 0;

  const instruments: InstrumentConfig[] = h.voices.map((name, i): InstrumentConfig => ({
    id: i + 1, name, type: 'synth', synthType: 'GmeSynth', effects: [], volume: 0, pan: 0,
  }));
  const pattern = emptyPattern(h.voices.length, 64);
  pattern.channels.forEach((ch, i) => { ch.name = h.voices[i]; });

  const base = h.title || h.game || filename.replace(/\.[^.]+$/, '');
  const game = h.title && h.game ? ` (${h.game})` : '';
  const sub = h.tracks > 1 ? ` [${track + 1}/${h.tracks}]` : '';
  return {
    name: base + game + sub + (h.author ? ` — ${h.author}` : ''),
    format: (type === 'NSFE' ? 'NSF' : type) as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: h.voices.length,
    initialSpeed: 6,
    initialBPM: 125,
    gmeFileData: buffer.slice(0),
    gmeTrack: track,
  };
}
