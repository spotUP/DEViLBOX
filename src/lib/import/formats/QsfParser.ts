/**
 * QsfParser.ts -- QSF (Capcom QSound) format detection and parser
 *
 * QSF is a subset of the PSF (Portable Sound Format) family, version byte 0x41.
 * It encapsulates Z80 program code + QSound sample ROM data for Capcom CPS1/CPS2
 * arcade sound hardware emulation (Street Fighter II, Marvel vs Capcom, etc.).
 *
 * The raw binary is stored in qsfFileData for the QsfEngine WASM player.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData } from '@/types';
import type { InstrumentConfig } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(numCh: number, rows: number): Pattern {
  return {
    id: 'p0', name: 'Pattern 1', length: rows,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `QSound ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

/** Parse PSF time tag "mm:ss.ms" or plain milliseconds string */
function parseTimeTag(value: string): number {
  const colonIdx = value.indexOf(':');
  if (colonIdx >= 0) {
    const minutes = parseInt(value.substring(0, colonIdx), 10) || 0;
    const rest = value.substring(colonIdx + 1);
    const dotIdx = rest.indexOf('.');
    let seconds = 0, millis = 0;
    if (dotIdx >= 0) {
      seconds = parseInt(rest.substring(0, dotIdx), 10) || 0;
      let frac = rest.substring(dotIdx + 1).substring(0, 3);
      while (frac.length < 3) frac += '0';
      millis = parseInt(frac, 10) || 0;
    } else {
      seconds = parseInt(rest, 10) || 0;
    }
    return minutes * 60000 + seconds * 1000 + millis;
  }
  return parseInt(value, 10) || 0;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Detect QSF format by checking:
 * 1. PSF magic bytes "PSF" at offset 0
 * 2. Version byte 0x41 at offset 3
 * 3. File extension .qsf or .miniqsf
 */
export function isQsfFormat(filename: string, buffer: ArrayBuffer): boolean {
  const data = new Uint8Array(buffer);

  // Check PSF magic "PSF" at offset 0 + version 0x41 at offset 3
  if (data.length >= 4 && data[0] === 0x50 && data[1] === 0x53 && data[2] === 0x46 && data[3] === 0x41) {
    return true;
  }

  // Fallback: extension check
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'qsf' || ext === 'miniqsf') {
    // Verify at least the PSF magic
    if (data.length >= 3 && data[0] === 0x50 && data[1] === 0x53 && data[2] === 0x46) {
      return true;
    }
  }

  return false;
}

// ── PSF tag parser ────────────────────────────────────────────────────────────

interface PsfTags {
  title: string;
  artist: string;
  game: string;
  year: string;
  length: number;  // milliseconds
  fade: number;    // milliseconds
}

function parsePsfTags(data: Uint8Array): PsfTags {
  const tags: PsfTags = { title: '', artist: '', game: '', year: '', length: 0, fade: 0 };

  // PSF header: "PSF" (3) + version (1) + reserved_size (4) + compressed_size (4) + crc32 (4)
  if (data.length < 16) return tags;

  const reservedSize = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
  const compressedSize = data[8] | (data[9] << 8) | (data[10] << 16) | (data[11] << 24);

  // Tags start after: header (16) + reserved (reservedSize) + compressed (compressedSize)
  const tagOffset = 16 + reservedSize + compressedSize;
  if (tagOffset + 5 > data.length) return tags;

  // Check for "[TAG]" marker
  const tagMarker = String.fromCharCode(data[tagOffset], data[tagOffset + 1],
    data[tagOffset + 2], data[tagOffset + 3], data[tagOffset + 4]);
  if (tagMarker !== '[TAG]') return tags;

  // Parse key=value pairs separated by newlines
  const tagData = new TextDecoder('utf-8').decode(data.subarray(tagOffset + 5));
  const lines = tagData.split('\n');
  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;
    const key = line.substring(0, eqIdx).trim().toLowerCase();
    const value = line.substring(eqIdx + 1).trim();
    switch (key) {
      case 'title': tags.title = value; break;
      case 'artist': tags.artist = value; break;
      case 'game': tags.game = value; break;
      case 'year': tags.year = value; break;
      case 'length': tags.length = parseTimeTag(value); break;
      case 'fade': tags.fade = parseTimeTag(value); break;
    }
  }

  return tags;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseQsfFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const data = new Uint8Array(buffer);
  const tags = parsePsfTags(data);

  const baseName = filename.replace(/\.[^.]+$/, '');
  const title = tags.title || tags.game || baseName;

  // QSound hardware has 16 channels but we present a simple stereo view
  const numChannels = 2;
  const pattern = emptyPattern(numChannels, 64);
  pattern.channels[0].name = 'QSound L';
  pattern.channels[1].name = 'QSound R';

  const qsfInst: InstrumentConfig = {
    id: 1, name: 'QSound', type: 'synth', synthType: 'QsfSynth',
    effects: [], volume: 0, pan: 0,
  };

  return {
    name: title,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments: [qsfInst],
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    qsfFileData: buffer.slice(0),
  };
}
