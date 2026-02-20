/**
 * Serato Metadata Reader
 *
 * Reads Serato-specific metadata from ID3v2 GEOB frames in audio files:
 * - Serato Markers2: cue points, loops, color info (base64-encoded binary)
 * - Serato Autotags: analyzed BPM, gain
 * - Serato BeatGrid: beat markers for beatgrid display
 *
 * Reference: https://github.com/Holzhaus/serato-tags (reverse-engineered format docs)
 * All byte offsets verified against Holzhaus documentation (2024).
 */

import { extractGEOBFrames } from './id3Parser';

// ============================================================================
// TYPES
// ============================================================================

export interface SeratoCuePoint {
  index: number;           // 0-7 (hot cue slots)
  position: number;        // milliseconds from start
  color: string;           // hex color (#RRGGBB)
  name: string;
}

export interface SeratoLoop {
  index: number;
  startPosition: number;   // ms
  endPosition: number;     // ms
  color: string;
  name: string;
  locked: boolean;
}

export interface SeratoBeatMarker {
  position: number;        // seconds from start
  beatsUntilNextMarker: number;
  bpm: number;             // for terminal marker: stored BPM. For non-terminal: derived from spacing.
}

export interface SeratoMetadata {
  bpm: number | null;
  gain: number | null;      // auto gain dB
  key: string | null;       // musical key (from database, not autotags)
  cuePoints: SeratoCuePoint[];
  loops: SeratoLoop[];
  beatGrid: SeratoBeatMarker[];
}

// Default Serato cue point colors (when color is #000000)
const DEFAULT_CUE_COLORS = [
  '#CC0000', '#CC8800', '#CCCC00', '#00CC00',
  '#00CCCC', '#0000CC', '#CC00CC', '#CC0088',
];

// ============================================================================
// SERATO MARKERS2 PARSER
// ============================================================================

/**
 * Parse Serato Markers2 data.
 *
 * Encoding: 2-byte raw header (0x01 0x01), then base64-encoded payload.
 * Base64 payload decodes to: 2-byte header (0x01 0x01), then entries, then null terminator.
 *
 * Each entry: type string (null-terminated ASCII), 4-byte BE length, then payload.
 *
 * CUE payload (>= 0x0D bytes):
 *   [00] reserved=0x00, [01] index uint8, [02..05] position uint32 ms,
 *   [06] reserved=0x00, [07..09] RGB color, [0A..0B] reserved=0x0000,
 *   [0C+] name (null-terminated UTF-8)
 *
 * LOOP payload (>= 0x15 bytes):
 *   [00] reserved=0x00, [01] index uint8, [02..05] start uint32 ms,
 *   [06..09] end uint32 ms, [0A..0D] reserved=0xFFFFFFFF,
 *   [0E..11] ARGB color (4 bytes), [12..14] reserved=0x000000,
 *   [15] locked uint8 boolean, [16+] name (null-terminated UTF-8)
 */
function parseMarkers2(rawData: Uint8Array): { cuePoints: SeratoCuePoint[]; loops: SeratoLoop[] } {
  const cuePoints: SeratoCuePoint[] = [];
  const loops: SeratoLoop[] = [];

  let data: Uint8Array;

  // The GEOB payload starts with a 2-byte header (0x01 0x01), then base64-encoded data.
  // Some implementations store raw binary; detect and handle both.
  if (rawData.length >= 2 && rawData[0] === 0x01 && rawData[1] === 0x01) {
    // Check if the rest looks like base64 (ASCII printable) or raw binary
    const thirdByte = rawData.length > 2 ? rawData[2] : 0;
    if (thirdByte >= 0x20 && thirdByte <= 0x7E) {
      // Looks like base64 after the header
      try {
        const b64str = new TextDecoder('ascii').decode(rawData.subarray(2));
        // Fix invalid base64 length: pad with 'A' if length % 4 === 1
        let clean = b64str.replace(/[\r\n\s]/g, '');
        if (clean.length % 4 === 1) clean += 'A';
        const binary = atob(clean);
        data = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
      } catch {
        data = rawData;
      }
    } else {
      // Raw binary
      data = rawData;
    }
  } else {
    // Try pure base64
    try {
      const b64str = new TextDecoder('ascii').decode(rawData);
      let clean = b64str.replace(/[\r\n\s]/g, '');
      if (clean.length % 4 === 1) clean += 'A';
      const binary = atob(clean);
      data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
    } catch {
      data = rawData;
    }
  }

  // The decoded data starts with 0x01 0x01 header
  let pos = 0;
  if (data.length >= 2 && data[0] === 0x01 && data[1] === 0x01) {
    pos = 2;
  }

  while (pos < data.length) {
    // Skip null padding bytes between entries
    while (pos < data.length && data[pos] === 0x00) pos++;
    if (pos >= data.length) break;

    // Read entry type string (null-terminated ASCII)
    let typeEnd = pos;
    while (typeEnd < data.length && data[typeEnd] !== 0x00) typeEnd++;
    if (typeEnd >= data.length) break;
    const entryType = new TextDecoder('ascii').decode(data.subarray(pos, typeEnd));
    pos = typeEnd + 1; // skip null terminator

    if (pos + 4 > data.length) break;

    // Read entry payload length (4 bytes BE uint32)
    const entryLen = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
    pos += 4;

    if (entryLen === 0 || pos + entryLen > data.length) break;

    const d = data.subarray(pos, pos + entryLen);

    if (entryType === 'CUE' && entryLen >= 0x0D) {
      // [00] reserved, [01] index, [02..05] position, [06] reserved, [07..09] RGB, [0A..0B] reserved, [0C+] name
      const index = d[0x01];
      const position = (d[0x02] << 24) | (d[0x03] << 16) | (d[0x04] << 8) | d[0x05];
      const r = d[0x07];
      const g = d[0x08];
      const b = d[0x09];
      const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

      let nameEnd = 0x0C;
      while (nameEnd < d.length && d[nameEnd] !== 0) nameEnd++;
      const name = nameEnd > 0x0C
        ? new TextDecoder('utf-8').decode(d.subarray(0x0C, nameEnd))
        : '';

      cuePoints.push({
        index,
        position,
        color: color === '#000000' ? (DEFAULT_CUE_COLORS[index] ?? '#CC0000') : color,
        name,
      });
    } else if (entryType === 'LOOP' && entryLen >= 0x15) {
      // [00] reserved, [01] index, [02..05] start, [06..09] end,
      // [0A..0D] reserved(0xFFFFFFFF), [0E..11] ARGB color,
      // [12..14] reserved, [15] locked, [16+] name
      const index = d[0x01];
      const startPosition = (d[0x02] << 24) | (d[0x03] << 16) | (d[0x04] << 8) | d[0x05];
      const endPosition = (d[0x06] << 24) | (d[0x07] << 16) | (d[0x08] << 8) | d[0x09];
      // ARGB: [0E]=alpha, [0F]=R, [10]=G, [11]=B
      const cr = d[0x0F];
      const cg = d[0x10];
      const cb = d[0x11];
      const color = `#${cr.toString(16).padStart(2, '0')}${cg.toString(16).padStart(2, '0')}${cb.toString(16).padStart(2, '0')}`;
      const locked = d[0x15] !== 0;

      let nameEnd = 0x16;
      while (nameEnd < d.length && d[nameEnd] !== 0) nameEnd++;
      const name = nameEnd > 0x16
        ? new TextDecoder('utf-8').decode(d.subarray(0x16, nameEnd))
        : '';

      loops.push({ index, startPosition, endPosition, color, name, locked });
    }
    // Skip COLOR, BPMLOCK, FLIP entries (not needed for DJ display)

    pos += entryLen;
  }

  return { cuePoints, loops };
}

// ============================================================================
// SERATO AUTOTAGS PARSER
// ============================================================================

/**
 * Parse Serato Autotags data.
 *
 * Format (22 bytes total):
 *   [00..01] header: 0x01 0x01
 *   [02..08] BPM string, null-terminated (e.g. "115.00\0")
 *   [09..0F] Auto Gain string, null-terminated (e.g. "-3.257\0")
 *   [10..15] Gain dB string, null-terminated (e.g. "0.000\0")
 *
 * Note: Autotags does NOT contain musical key. Key comes from
 * the database V2 file (tkey tag) or Serato Markers_ tag.
 */
function parseAutotags(data: Uint8Array): { bpm: number | null; gain: number | null } {
  // Skip 2-byte header if present
  let start = 0;
  if (data.length >= 2 && data[0] === 0x01 && data[1] === 0x01) {
    start = 2;
  }

  const str = new TextDecoder('ascii').decode(data.subarray(start));
  const parts = str.split('\0').filter(Boolean);

  const bpm = parts[0] ? parseFloat(parts[0]) : null;
  const gain = parts[1] ? parseFloat(parts[1]) : null;
  // parts[2] is "Gain dB" (secondary gain), not key

  return {
    bpm: bpm !== null && !isNaN(bpm) ? Math.round(bpm * 100) / 100 : null,
    gain: gain !== null && !isNaN(gain) ? Math.round(gain * 1000) / 1000 : null,
  };
}

// ============================================================================
// SERATO BEATGRID PARSER
// ============================================================================

/**
 * Parse Serato BeatGrid data.
 *
 * Format:
 *   [00..01] header: 0x01 0x00
 *   [02..05] marker count: uint32 BE (total markers including terminal)
 *   Followed by (count - 1) non-terminal markers, then 1 terminal marker.
 *
 * Non-terminal marker (8 bytes):
 *   [00..03] position: float32 BE (seconds)
 *   [04..07] beats until next marker: uint32 BE
 *
 * Terminal marker (8 bytes, always last):
 *   [00..03] position: float32 BE (seconds)
 *   [04..07] BPM: float32 BE
 *
 * Footer: 1 byte (unknown purpose)
 */
function parseBeatGrid(data: Uint8Array): SeratoBeatMarker[] {
  if (data.length < 14) return []; // minimum: 6 header + 8 terminal marker

  // Ensure we have a proper DataView aligned to the data
  const aligned = new ArrayBuffer(data.length);
  new Uint8Array(aligned).set(data);
  const view = new DataView(aligned);

  const markers: SeratoBeatMarker[] = [];

  // Header: 2 bytes + 4-byte marker count
  const markerCount = view.getUint32(2, false);
  if (markerCount === 0) return [];

  let pos = 6;
  const nonTerminalCount = markerCount - 1; // last one is terminal

  // Non-terminal markers
  for (let i = 0; i < nonTerminalCount && pos + 8 <= data.length; i++) {
    const position = view.getFloat32(pos, false);
    const beatsUntilNext = view.getUint32(pos + 4, false);
    pos += 8;

    markers.push({ position, beatsUntilNextMarker: beatsUntilNext, bpm: 0 });
  }

  // Terminal marker (float32 position + float32 BPM)
  if (pos + 8 <= data.length) {
    const position = view.getFloat32(pos, false);
    const bpm = view.getFloat32(pos + 4, false);
    pos += 8;

    markers.push({ position, beatsUntilNextMarker: 0, bpm });

    // Derive BPM for non-terminal markers
    for (let i = 0; i < markers.length - 1; i++) {
      const current = markers[i];
      const next = markers[i + 1];
      if (current.beatsUntilNextMarker > 0) {
        const timeBetween = next.position - current.position;
        if (timeBetween > 0) {
          current.bpm = Math.round((current.beatsUntilNextMarker / timeBetween) * 60 * 100) / 100;
        }
      }
    }
  }

  return markers;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Read all Serato metadata from an audio file's ID3v2 tags.
 * Works with MP3 files that have been analyzed by Serato DJ Pro/Lite.
 */
export function readSeratoMetadata(buffer: ArrayBuffer): SeratoMetadata {
  const result: SeratoMetadata = {
    bpm: null,
    gain: null,
    key: null,
    cuePoints: [],
    loops: [],
    beatGrid: [],
  };

  const frames = extractGEOBFrames(buffer);
  if (frames.size === 0) return result;

  // Parse Serato Autotags (BPM, gain — no key in autotags)
  const autotags = frames.get('Serato Autotags');
  if (autotags) {
    const parsed = parseAutotags(autotags.data);
    result.bpm = parsed.bpm;
    result.gain = parsed.gain;
  }

  // Parse Serato Markers2 (cue points, loops)
  const markers2 = frames.get('Serato Markers2');
  if (markers2) {
    const parsed = parseMarkers2(markers2.data);
    result.cuePoints = parsed.cuePoints;
    result.loops = parsed.loops;
  }

  // Parse Serato BeatGrid
  const beatgrid = frames.get('Serato BeatGrid');
  if (beatgrid) {
    result.beatGrid = parseBeatGrid(beatgrid.data);
  }

  return result;
}
