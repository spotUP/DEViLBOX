/**
 * PxtoneParser.ts -- PxTone Collage (.ptcop / .pttune) format parser
 *
 * PxTone Collage is a music creation tool by Studio Pixel (Daisuke Amaya),
 * known for the Cave Story soundtrack. Files use "PTTUNE" or "PTCOLLAGE"
 * magic signatures.
 *
 * Since PxTone playback is handled entirely by the WASM engine
 * (suppressNotes = true), the TrackerSong returned here is a minimal shell
 * with one empty pattern. The WASM engine handles all actual audio rendering.
 *
 * Binary format (v5 / modern):
 *   [16-byte version string]
 *   [4-byte exe_ver + padding]  (v3x and later only; x1x/x2x omit this)
 *   Then blocks: [8-byte tag][4-byte payload-size][payload-size bytes]
 *
 * Tags we parse (modern v3x/v4x/v5 format):
 *   "textNAME" → song name:  [4 nameLen][nameLen bytes]
 *   "matePCM " / "matePTV " / "matePTN " / "mateOGGV" → count instruments
 *   "assiWOIC" → voice name: struct[2 idx][2 pad][16 name]  (payloadSize=20)
 *   "assiUNIT" → unit name:  struct[2 idx][2 pad][16 name]  (payloadSize=20)
 *   "num UNIT" → unit count: struct[2 num][2 pad]           (payloadSize=4)
 *   "pxtoneND" → end marker
 *
 * Tags we parse (x1x / PTCOLLAGE-050227 format):
 *   "PROJECT=" → song name: first 16 bytes of payload (_x1x_PROJECT.x1x_name)
 *   "matePCM=" → instrument count (x1x uses '=' suffix, not space)
 *   "UNIT====" → unit name: first 16 bytes of payload (_x1x_UNIT.name)
 *   "END=====" → end marker
 *
 * Note: .pttune (b_tune=true) files omit assiWOIC/assiUNIT blocks — no names.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Check if a buffer looks like a PxTone Collage file.
 * PxTone files start with "PTTUNE" (6 bytes) or "PTCOLLAGE" (9 bytes).
 */
export function isPxtoneFormat(data: ArrayBuffer): boolean {
  if (data.byteLength < 9) return false;

  const bytes = new Uint8Array(data, 0, 9);

  // Check for "PTTUNE" (0x50 0x54 0x54 0x55 0x4E 0x45)
  if (
    bytes[0] === 0x50 && // P
    bytes[1] === 0x54 && // T
    bytes[2] === 0x54 && // T
    bytes[3] === 0x55 && // U
    bytes[4] === 0x4E && // N
    bytes[5] === 0x45    // E
  ) {
    return true;
  }

  // Check for "PTCOLLAGE" (0x50 0x54 0x43 0x4F 0x4C 0x4C 0x41 0x47 0x45)
  if (
    bytes[0] === 0x50 && // P
    bytes[1] === 0x54 && // T
    bytes[2] === 0x43 && // C
    bytes[3] === 0x4F && // O
    bytes[4] === 0x4C && // L
    bytes[5] === 0x4C && // L
    bytes[6] === 0x41 && // A
    bytes[7] === 0x47 && // G
    bytes[8] === 0x45    // E
  ) {
    return true;
  }

  return false;
}

// ── Binary metadata extraction ────────────────────────────────────────────────

const BLOCK_TAG_SIZE = 8;
const PXTONE_MAX_NAME = 16; // pxtnMAX_TUNEWOICENAME / pxtnMAX_TUNEUNITNAME

/** Decode a fixed-length C-string field (null-terminates at first 0x00). */
function decodeCString(bytes: Uint8Array, offset: number, maxLen: number, dec: TextDecoder): string {
  const end = offset + maxLen;
  let len = 0;
  while (offset + len < end && bytes[offset + len] !== 0) len++;
  return dec.decode(bytes.subarray(offset, offset + len)).trim();
}

// Version strings that do NOT have the extra 4-byte exe_ver+padding header.
// These are the x1x and x2x formats only.
const VERSIONS_NO_EXE_HDR = ['PTCOLLAGE-050', 'PTTUNE--20050'];

interface PxtoneMeta {
  songName: string;
  instrumentNames: string[];  // indexed by woice index (empty string if unnamed)
  unitNames: string[];        // indexed by unit index
  unitCount: number;
}

function extractPxtoneMeta(data: ArrayBuffer): PxtoneMeta {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  const dec = new TextDecoder('utf-8', { fatal: false });

  const meta: PxtoneMeta = {
    songName: '',
    instrumentNames: [],
    unitNames: [],
    unitCount: 0,
  };

  if (data.byteLength < 16) return meta;

  // 1. Read 16-byte version string
  const versionStr = dec.decode(bytes.subarray(0, 16));
  let pos = 16;

  // 2. Skip exe_ver + padding (4 bytes) for v3x/v4x/v5 formats
  const noExeHdr = VERSIONS_NO_EXE_HDR.some(prefix => versionStr.startsWith(prefix));
  if (!noExeHdr) {
    pos += 4; // uint16 exe_ver + uint16 dummy
  }

  // 3. Parse blocks: [8-byte tag][4-byte size][size-byte payload]
  while (pos + BLOCK_TAG_SIZE + 4 <= data.byteLength) {
    const tag = dec.decode(bytes.subarray(pos, pos + BLOCK_TAG_SIZE));
    pos += BLOCK_TAG_SIZE;

    const payloadSize = view.getUint32(pos, /* littleEndian */ true);
    pos += 4;

    const payloadStart = pos;

    if (tag === 'pxtoneND' || tag === 'END=====') break; // end of file

    if (payloadStart + payloadSize > data.byteLength) break; // truncated

    switch (tag) {
      // ── Modern format (v3x/v4x/v5) ─────────────────────────────────────────
      case 'textNAME': {
        // payload = name bytes directly (payloadSize IS the name length)
        meta.songName = dec.decode(bytes.subarray(payloadStart, payloadStart + payloadSize))
          .replace(/\0/g, '').trim();
        break;
      }

      case 'matePCM ':
      case 'matePTV ':
      case 'matePTN ':
      case 'mateOGGV': {
        // Each mate block represents one voice/instrument (added in order)
        meta.instrumentNames.push(''); // name filled by assiWOIC if present
        break;
      }

      // ── x1x format (PTCOLLAGE-050227) ──────────────────────────────────────
      case 'PROJECT=': {
        // payload = _x1x_PROJECT: char name[16] + float tempo + uint16 * 3
        // Song name is first 16 bytes of the payload (null-terminated)
        if (payloadSize >= 16) {
          meta.songName = decodeCString(bytes, payloadStart, 16, dec);
        }
        break;
      }

      case 'matePCM=': {
        // x1x voice/instrument (same as modern matePCM but different tag suffix)
        meta.instrumentNames.push('');
        break;
      }

      case 'UNIT====': {
        // payload = _x1x_UNIT: char name[16] + uint16 type + uint16 group
        // Unit names are stored here directly (x1x has no assiUNIT blocks)
        if (payloadSize >= 16) {
          const name = decodeCString(bytes, payloadStart, 16, dec);
          meta.unitNames.push(name);
          meta.unitCount++;
        }
        break;
      }

      case 'assiWOIC': {
        // payload = _ASSIST_WOICE struct: [2 woice_index][2 pad][16 name]
        // payloadSize = sizeof(_ASSIST_WOICE) = 20
        if (payloadSize >= 20) {
          const woiceIndex = view.getUint16(payloadStart, true);
          const name = decodeCString(bytes, payloadStart + 4, PXTONE_MAX_NAME, dec);
          while (meta.instrumentNames.length <= woiceIndex) meta.instrumentNames.push('');
          meta.instrumentNames[woiceIndex] = name;
        }
        break;
      }

      case 'assiUNIT': {
        // payload = _ASSIST_UNIT struct: [2 unit_index][2 pad][16 name]
        // payloadSize = sizeof(_ASSIST_UNIT) = 20
        if (payloadSize >= 20) {
          const unitIndex = view.getUint16(payloadStart, true);
          const name = decodeCString(bytes, payloadStart + 4, PXTONE_MAX_NAME, dec);
          while (meta.unitNames.length <= unitIndex) meta.unitNames.push('');
          meta.unitNames[unitIndex] = name;
        }
        break;
      }

      case 'num UNIT': {
        // payload = _NUM_UNIT struct: [2 num][2 pad]
        // payloadSize = sizeof(_NUM_UNIT) = 4
        if (payloadSize >= 4) {
          meta.unitCount = view.getInt16(payloadStart, true);
        }
        break;
      }
    }

    pos = payloadStart + payloadSize;
  }

  return meta;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a PxTone Collage file into a TrackerSong.
 *
 * Extracts song name, instrument names, and channel names from the binary.
 * The WASM engine handles all actual playback -- this provides the
 * TrackerSong shell the UI/store layer expects.
 */
export async function parsePxtoneFile(
  fileName: string,
  data: ArrayBuffer,
): Promise<TrackerSong> {
  if (!isPxtoneFormat(data)) {
    throw new Error('Invalid PxTone file: unrecognized magic bytes');
  }

  const meta = extractPxtoneMeta(data);

  const numChannels = Math.max(1, meta.unitCount || 4);
  const numRows = 64;
  const baseName = meta.songName || fileName.replace(/\.[^.]+$/, '');

  const emptyRows = Array.from({ length: numRows }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: numRows,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: meta.unitNames[ch] || `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'PxTone' as const,
      sourceFile: fileName,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: meta.instrumentNames.length,
    },
  };

  // In x1x format, instruments and units are 1:1 — use unit names as instrument names
  // when assiWOIC names are absent (empty strings from instrument scanning)
  const resolvedInstrNames = meta.instrumentNames.map((name, i) =>
    name || meta.unitNames[i] || `Instrument ${i + 1}`
  );

  const instruments: InstrumentConfig[] = resolvedInstrNames.length > 0
    ? resolvedInstrNames.map((name, i) => ({
        id: i + 1,
        name,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig))
    : [{
        id: 1, name: 'Sample 1', type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig];

  return {
    name: `${baseName} [PxTone]`,
    format: 'PxTone' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    pxtoneFileData: data.slice(0),
  };
}
