/**
 * AYParser.ts — ZX Spectrum .ay (Project AY "ZXAY" container, EMUL payload)
 *
 * Playback is aylet (third-party/aylet-0.5, GPL-2) compiled to wasm: the song
 * carries the whole file as `ayFileData` and `AyletEngine` runs the tune's
 * own Z80 code with a real AY. The grid is a VIEW of that: the same wasm
 * runs the tune for 300 frames (AyletWasmExtractor), the AY registers after
 * each frame become one 3-channel pattern. One Z80, so the grid shows what
 * plays.
 *
 * Layout (Project AY / DeliAY, Patrik Rak; Amiga origin, so every word is
 * big-endian and every pointer a signed 16-bit offset RELATIVE TO ITS OWN
 * POSITION) - verified against the corpus in
 * thoughts/shared/research/2026-10-04_ay-strc-amad.md:
 *
 *   Header        +0 'ZXAY'  +4 TypeID 'EMUL'|'STRC'|'AMAD'  +8 FileVersion
 *                 +9 PlayerVersion  +10 PSpecialPlayer  +12 PAuthor  +14 PMisc
 *                 +16 NumOfSongs-1  +17 FirstSong  +18 PSongsStructure
 *   SongStructure +0 PSongName  +2 PSongData                 (4 bytes a song)
 *   SongData      +0..3 ChanA ChanB ChanC Noise  +4 SongLength  +6 FadeLength
 *                 +8 HiReg  +9 LoReg  +10 PPoints  +12 PAddresses
 *   Points        Stack, Init, Interrupt (u16 each)
 *   Addresses     { Address u16, Length u16, POffset } ... until Address == 0
 *
 * Until 2026-10-04 this file read the song data at the wrong offsets, so the
 * Z80 never ran and every .ay / .emul showed an empty stub grid (ledger F15).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';
import { extractAYRegisterFrames } from './AyletWasmExtractor';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(numCh: number): Pattern {
  return {
    id: 'p0', name: 'Pattern 1', length: 16,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `AY ${String.fromCharCode(65 + i)}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: 16 }, emptyCell),
    })),
  };
}

/** Resolve a signed big-endian pointer at `ptrOff`, relative to its own position; -1 when it points outside the file or is 0. */
function relPtr(buf: Uint8Array, ptrOff: number): number {
  if (ptrOff < 0 || ptrOff + 2 > buf.length) return -1;
  const dv  = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rel = dv.getInt16(ptrOff, false);
  if (rel === 0) return -1;
  const abs = ptrOff + rel;
  return abs < 0 || abs >= buf.length ? -1 : abs;
}

/** Read a null-terminated string through a relative pointer at `ptrOff`. */
function readRelStr(buf: Uint8Array, ptrOff: number): string {
  const abs = relPtr(buf, ptrOff);
  if (abs < 0) return '';
  let s = '', i = abs;
  while (i < buf.length && buf[i] !== 0) s += String.fromCharCode(buf[i++]);
  return s.trim();
}

// ── AY chip emulation ────────────────────────────────────────────────────────

/** ZX Spectrum PAL AY clock frequency */
const AY_CLOCK = 1773400;

/** Convert a 12-bit AY tone period to a MIDI note number (1–96), or 0 if out of range. */
function ayPeriodToNote(period: number): number {
  if (period <= 0) return 0;
  const freq = AY_CLOCK / (16 * period);
  if (freq < 20 || freq > 20000) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}

const OFF_NUM_SONGS = 16;
const OFF_FIRST_SONG = 17;
const OFF_SONGS = 18;

/** The name of song `songIndex` (SongStructure.PSongName), '' when absent. */
function songName(buf: Uint8Array, songIndex: number): string {
  const songs = relPtr(buf, OFF_SONGS);
  if (songs < 0) return '';
  const off = songs + songIndex * 4;
  return off + 4 <= buf.length ? readRelStr(buf, off) : '';
}

// ── Frames → Pattern ─────────────────────────────────────────────────────────

const MAX_ROWS = 256;

/**
 * Convert AY register frame snapshots to a tracker pattern.
 * Mirrors YMParser.ts::framesToPattern, using ZX Spectrum AY clock.
 */
function framesToPattern(frames: Uint8Array[]): Pattern {
  const step = Math.max(1, Math.ceil(frames.length / MAX_ROWS));
  const rows = Math.min(MAX_ROWS, Math.ceil(frames.length / step));

  const pat: Pattern = {
    id: 'p0', name: 'Pattern 1', length: rows,
    channels: Array.from({ length: 3 }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `AY ${String.fromCharCode(65 + i)}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };

  const lastNote = [0, 0, 0];
  const lastVol  = [-1, -1, -1];

  for (let row = 0; row < rows; row++) {
    const f     = frames[Math.min(row * step, frames.length - 1)];
    const mixer = f[7] ?? 0xFF;

    for (let ch = 0; ch < 3; ch++) {
      const periodLo = f[ch * 2]      ?? 0;
      const periodHi = (f[ch * 2 + 1] ?? 0) & 0x0F;
      const period   = (periodHi << 8) | periodLo;
      const vol      = (f[8 + ch]     ?? 0) & 0x0F;
      const toneOn   = !((mixer >> ch) & 1); // bit 0 = tone A enable (0 = enabled)

      const note = (toneOn && vol > 0 && period > 0) ? ayPeriodToNote(period) : 0;
      const cell = pat.channels[ch].rows[row];

      if (note !== lastNote[ch]) {
        cell.note = note > 0 ? note : (lastNote[ch] > 0 ? 97 : 0);
        if (note > 0) cell.instrument = 1;
        lastNote[ch] = note;
      }
      if (vol !== lastVol[ch]) {
        cell.volume = vol > 0 ? Math.round((vol / 15) * 64) : 0;
        lastVol[ch] = vol;
      }
    }
  }

  return pat;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** The ZXAY container's TypeID ('EMUL', 'STRC', 'AMAD', ...), or null when the file is not a ZXAY container. */
export function ayContainerType(buffer: ArrayBuffer): string | null {
  const b = new Uint8Array(buffer);
  if (b.length < 8) return null;
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'ZXAY') return null;
  return String.fromCharCode(b[4], b[5], b[6], b[7]);
}

export function isAYFormat(buffer: ArrayBuffer): boolean {
  return ayContainerType(buffer) === 'EMUL';
}

/** True for the ZXAY payloads that need a host-side replayer (STRC, AMAD). */
export function isAYStructuredFormat(buffer: ArrayBuffer): boolean {
  const t = ayContainerType(buffer);
  return t === 'STRC' || t === 'AMAD';
}

/**
 * STRC and AMAD are ZXAY files whose song data is NOT a Z80 program: it is
 * a structure for a replayer that lived in the host (DeliAY on the Amiga,
 * AY_Emul on Windows). No player in reach implements those replayers -
 * aylet, ayfly, libayemu, ZXTune and deadbeef all play EMUL only - so the
 * refusal says exactly that instead of "Unsupported file format".
 * See thoughts/shared/research/2026-10-04_ay-strc-amad.md.
 */
export async function parseAYStructuredFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  const type = ayContainerType(buffer);
  const kind = type === 'AMAD' ? 'AMAD (Amadeus)' : type === 'STRC' ? 'STRC (structure)' : type ?? 'unknown';
  throw new Error(
    `${filename}: ZXAY ${kind} payload. The song is data for a replayer that lived in DeliAY / AY_Emul, ` +
    `not Z80 code, and no available player implements it; only ZXAY EMUL files play (via aylet).`,
  );
}

export async function parseAYFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  if (!isAYFormat(buffer)) throw new Error('Not a valid AY file');
  const buf = new Uint8Array(buffer);

  const numSongs  = (buf[OFF_NUM_SONGS] ?? 0) + 1;
  const firstSong = Math.min(buf[OFF_FIRST_SONG] ?? 0, numSongs - 1);

  const author = readRelStr(buf, 12);
  const misc   = readRelStr(buf, 14);

  const instruments: InstrumentConfig[] = Array.from({ length: 3 }, (_, i) => ({
    id: i + 1,
    name: `AY ${String.fromCharCode(65 + i)}`,
    type: 'synth' as const,
    synthType: 'AyletSynth' as const,
    effects: [] as [],
    volume: 0,
    pan: 0,
  }));

  // The grid: aylet runs the tune for 300 frames and the registers after
  // each frame become the pattern. A file aylet cannot run still loads with
  // an empty grid, and the console says why.
  let pattern: Pattern;
  try {
    const { frames } = await extractAYRegisterFrames(buffer, firstSong, 300);
    pattern = framesToPattern(frames);
  } catch (err) {
    console.warn(`[AYParser] ${filename}: aylet could not run the tune for the grid, showing an empty grid:`, err);
    pattern = emptyPattern(3);
  }

  const name = songName(buf, firstSong) || misc || filename.replace(/\.(ay|emul)$/i, '');

  return {
    name: name + (author ? ` — ${author}` : ''),
    format: 'AY' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 3,
    initialSpeed: 6,
    initialBPM: 125,
    ayFileData: buffer.slice(0),
  };
}
