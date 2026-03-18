/**
 * WantedTeamDaveLoweParser.ts — Parser for Amiga formats ripped/converted by Wanted Team
 * into their "Dave Lowe-like" binary format for EaglePlayer.
 *
 * Covers four formats, all sharing the same AmigaDOS hunk header layout:
 *   - SOPROL (Sound Programming Language)  — ".spl" extension, prefix "spl.*"
 *   - Riff Raff (PAL Developments)        — ".riff" extension, prefix "riff.*"
 *   - Howie Davies (PAL Developments)     — ".hd" extension, prefix "hd.*"
 *   - Beathoven Synthesizer               — ".bss" extension, prefix "bss.*"
 *
 * Detection:
 *   bytes 0-3:   0x000003F3  (AmigaDOS HUNK_HEADER)
 *   bytes 0x20-0x21: 0x70FF  (MOVEQ #-1,D0)
 *   bytes 0x22-0x23: 0x4E75  (RTS)
 *   bytes 0x24+:  format ID string (see KNOWN_IDS below)
 *
 * Header structure (all big-endian, offsets from file start):
 *   0x00  HUNK_HEADER magic
 *   0x20  MOVEQ+RTS (2×word)
 *   0x24  format ID string (8 or 12 bytes depending on format)
 *   id_end+1 … end: size fields, subsong count, data pointers
 *   After the pointer block: null-terminated song title, then composer, then credits
 *
 * All four formats are compiled 68k binaries with player+music fused.
 * Pattern data is not extractable without deep binary reverse engineering.
 * This parser creates a metadata stub with correct title/format/instruments;
 * audio is always delegated to UADE classic streaming.
 *
 * References:
 *   docs/formats/Replayers/eagleplayers/SOPROL/EP_SOPROL.readme
 *   docs/formats/Replayers/eagleplayers/Riff Raff/EP_RiffRaff.readme
 *   docs/formats/Replayers/eagleplayers/Howie Davies/EP_HowieDavies.readme
 *   docs/formats/Replayers/eagleplayers/Beathoven Synthesizer/EP_BeathovenSS.readme
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}
function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── Format registry ───────────────────────────────────────────────────────────

interface WantedTeamFormatInfo {
  /** Human-readable format name. */
  name: string;
  /** Number of placeholder instruments to create. */
  instrCount: number;
  /** Prefix to strip from filename when deriving module name. */
  prefix: string;
}

const KNOWN_IDS: Record<string, WantedTeamFormatInfo> = {
  '!SOPROL!':     { name: 'SOPROL (Sound Programming Language)', instrCount: 8, prefix: 'spl.' },
  'RIFFRAFF':     { name: 'Riff Raff',                          instrCount: 4, prefix: 'riff.' },
  'H.DAVIES':     { name: 'Howie Davies',                       instrCount: 4, prefix: 'hd.' },
  'BEATHOVEN109': { name: 'Beathoven Synthesizer',              instrCount: 8, prefix: 'bss.' },
};

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Attempt to read the format ID string at byte 0x24 and match against KNOWN_IDS.
 * Returns the ID string on match, or null if the file is not a Wanted Team Dave Lowe module.
 */
function getFormatId(buf: Uint8Array): string | null {
  if (buf.length < 0x40) return null;
  // AmigaDOS HUNK_HEADER
  if (u32BE(buf, 0) !== 0x000003F3) return null;
  // MOVEQ #-1,D0 followed by RTS
  if (u16BE(buf, 0x20) !== 0x70FF) return null;
  if (u16BE(buf, 0x22) !== 0x4E75) return null;

  for (const id of Object.keys(KNOWN_IDS)) {
    if (0x24 + id.length > buf.length) continue;
    let match = true;
    for (let i = 0; i < id.length; i++) {
      if (buf[0x24 + i] !== id.charCodeAt(i)) { match = false; break; }
    }
    if (match) return id;
  }
  return null;
}

/**
 * Return true if the buffer is a Wanted Team Dave Lowe-derived module.
 */
export function isWantedTeamDaveLoweFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return getFormatId(buf) !== null;
}

// ── Title extraction ──────────────────────────────────────────────────────────

/**
 * Scan the header area (0x40 … 0x200) for the first null-terminated printable ASCII string.
 * Returns the first match (length ≥ 4), stripped of leading "./" path prefixes.
 */
function extractTitle(buf: Uint8Array): string {
  const end = Math.min(0x200, buf.length);
  for (let off = 0x40; off < end; off++) {
    const c = buf[off];
    if (c < 0x20 || c >= 0x7F) continue; // not printable

    // Measure string length
    let len = 0;
    while (off + len < end && buf[off + len] >= 0x20 && buf[off + len] < 0x7F) len++;

    // Require at least 4 printable chars followed by NUL (or end of scan area)
    if (len >= 4 && (off + len >= end || buf[off + len] === 0)) {
      let title = String.fromCharCode(...buf.slice(off, off + len)).trim();
      // Strip leading "./" path prefixes inserted by some SOPROL ripper outputs
      title = title.replace(/^\.\/+/, '').trim();
      if (title.length >= 2) return title;
    }
  }
  return '';
}

// ── SOPROL instrument names ───────────────────────────────────────────────────

/**
 * For SOPROL modules, scan the binary for null-terminated ".sh" sample-file entries
 * and return up to instrCount names. Falls back to "Waveform N" names when not found.
 */
function extractSOPROLNames(buf: Uint8Array, instrCount: number): string[] {
  const names: string[] = [];
  // SOPROL stores sample names like "slapbass.sh\0" in a fixed-width table
  // located after the header strings (typically around 0x280–0x400 for 8 instruments).
  // Scan for strings ending in ".sh\0".
  const end = Math.min(0x800, buf.length);
  for (let off = 0x100; off < end - 4; off++) {
    // Look for ".sh\0" suffix
    if (buf[off] === 0x2E && buf[off + 1] === 0x73 && buf[off + 2] === 0x68 && buf[off + 3] === 0) {
      // Walk backwards to find the start of the name
      let start = off - 1;
      while (start > 0 && buf[start - 1] >= 0x21 && buf[start - 1] < 0x7F) start--;
      const nameLen = off - start;
      if (nameLen >= 2) {
        const stem = String.fromCharCode(...buf.slice(start, off));
        // Strip trailing spaces (the names are right-padded in the table)
        names.push(stem.replace(/\s+$/, ''));
        if (names.length >= instrCount) break;
      }
    }
  }
  // Pad with generic names if not enough found
  while (names.length < instrCount) {
    names.push(`Waveform ${names.length + 1}`);
  }
  return names.slice(0, instrCount);
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Wanted Team Dave Lowe-derived module into a TrackerSong.
 *
 * Creates a metadata stub with correct title/format name and placeholder instruments.
 * All four covered formats (SOPROL, Riff Raff, Howie Davies, Beathoven Synthesizer)
 * are compiled 68k binaries; actual audio is always delegated to UADE classic streaming.
 *
 * @param buffer   Raw file bytes
 * @param filename Original filename (used to derive module name and strip prefix)
 */
export function parseWantedTeamDaveLoweFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const id = getFormatId(buf);
  if (id === null) throw new Error('Not a Wanted Team Dave Lowe module');

  const info = KNOWN_IDS[id]!;
  const NUM_CHANNELS = 4;

  // ── Module name ─────────────────────────────────────────────────────────────
  const baseName   = filename.split('/').pop() ?? filename;
  let moduleName   = baseName.replace(new RegExp(`^${info.prefix}`, 'i'), '');
  // Also strip known prefix variants (upper/lower)
  for (const ext of ['.spl', '.riff', '.hd', '.bss']) {
    moduleName = moduleName.replace(new RegExp(`${ext}$`, 'i'), '');
  }
  const titleFromHeader = extractTitle(buf);
  const songTitle = titleFromHeader || moduleName || baseName;

  // ── Instruments ─────────────────────────────────────────────────────────────
  const instrNames = id === '!SOPROL!'
    ? extractSOPROLNames(buf, info.instrCount)
    : Array.from({ length: info.instrCount }, (_, i) => `Waveform ${i + 1}`);

  const instruments: InstrumentConfig[] = instrNames.map((name, i) => ({
    id:        i + 1,
    name,
    type:      'synth' as const,
    synthType: 'Synth' as const,
    effects:   [],
    volume:    0,
    pan:       0,
  } as InstrumentConfig));

  // ── Single placeholder pattern ───────────────────────────────────────────────
  const ROWS = 64;
  const emptyRow = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

  const pattern = {
    id:     'pattern-0',
    name:   'Pattern 0',
    length: ROWS,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color:        null,
      rows:         Array.from({ length: ROWS }, emptyRow),
    })),
    importMetadata: {
      sourceFormat:            'MOD' as const,
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    NUM_CHANNELS,
      originalPatternCount:    1,
      originalInstrumentCount: info.instrCount,
    },
  };

  return {
    name:            `${songTitle} [${info.name}]`,
    format:          'MOD' as TrackerFormat,
    patterns:        [pattern],
    instruments,
    songPositions:   [0],
    songLength:      1,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
