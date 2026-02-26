/**
 * UAXParser.ts — Unreal Audio Package (.uax) sound ripper
 *
 * UAX files are Unreal Engine package files containing sound objects.
 * This parser extracts audio samples from the package into a TrackerSong
 * with one sample per instrument slot and an empty 64-row pattern.
 *
 * Unreal Package File Format:
 *   Header (36 bytes):
 *     magic[4]         — 0xC1 0x83 0x2A 0x9E
 *     packageVersion(uint16le)
 *     licenseMode(uint16le)
 *     flags(uint32le)
 *     nameCount(uint32le)   — number of entries in the name table
 *     nameOffset(uint32le)  — file offset of the name table
 *     exportCount(uint32le) — number of entries in the export table
 *     exportOffset(uint32le)— file offset of the export table
 *     importCount(uint32le) — number of entries in the import table
 *     importOffset(uint32le)— file offset of the import table
 *
 * Validity constraints (from UMXTools.cpp FileHeader::IsValid):
 *   - magic == 0xC1 0x83 0x2A 0x9E
 *   - nameOffset >= 36 (>= sizeof(FileHeader))
 *   - exportOffset >= 36
 *   - importOffset >= 36
 *   - nameCount > 0 && nameCount <= UINT32_MAX/5
 *   - exportCount > 0 && exportCount <= UINT32_MAX/8
 *   - importCount > 0 && importCount <= UINT32_MAX/4
 *
 * Detection: probe the name table for the string "sound" (case-insensitive).
 * This matches what OpenMPT's UMX::FindNameTableEntry does.
 *
 * Compressed Index integers (ReadIndex):
 *   Variable-length encoding, similar to MIDI but signed.
 *   Byte 0: bit7=sign, bit6=continue, bits5-0=value[5:0]
 *   Remaining bytes: bit7=continue, bits6-0=value
 *
 * Name Table Entry (packageVersion >= 64):
 *   ReadIndex() length, then zero-terminated string, then uint32 flags
 * Name Table Entry (packageVersion < 64):
 *   Zero-terminated string, then uint32 flags
 *
 * Import Table Entry (per packageVersion):
 *   ReadIndex() class-package, ReadIndex() class-name,
 *   if version>=60: uint32 package; else ReadIndex() package,
 *   ReadIndex() object-name → returns as object-name index
 *
 * Export Table Entry (per packageVersion):
 *   ReadIndex() ~objClass (bitwise NOT gives index into import table → class name)
 *   ReadIndex() obj-parent
 *   if version>=60: uint32 package; else ReadIndex()
 *   ReadIndex() obj-name
 *   uint32 flags
 *   ReadIndex() obj-size
 *   ReadIndex() obj-offset
 *
 *   Then at obj-offset in file (per version):
 *     version<40: skip 8 bytes
 *     version<60: skip 16 bytes
 *     ReadIndex() property-name (skip)
 *     version>=120: ReadIndex() + skip 8 bytes (UT2003)
 *     version>=100: skip 4 + ReadIndex() + skip 4 (AAO)
 *     version>=62: ReadIndex() + skip 4 (UT)
 *     else: ReadIndex() (old Unreal)
 *     ReadIndex() data-size → read that many bytes = the sound data
 *
 * The sound data extracted is a raw WAV, VOC, or other audio format
 * embedded directly in the package. We attempt to use it as a WAV blob.
 *
 * Reference: OpenMPT soundlib/Load_uax.cpp and soundlib/UMXTools.cpp
 * Reference: https://wiki.beyondunreal.com/Legacy:Package_File_Format
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

// ── Constants ──────────────────────────────────────────────────────────────

const FILE_HEADER_SIZE = 36;
const MAGIC = [0xC1, 0x83, 0x2A, 0x9E] as const;

// Max sane table sizes to prevent runaway parsing
const MAX_NAME_COUNT   = Math.floor(0xFFFFFFFF / 5);
const MAX_EXPORT_COUNT = Math.floor(0xFFFFFFFF / 8);
const MAX_IMPORT_COUNT = Math.floor(0xFFFFFFFF / 4);

// Max samples we will extract (matches OpenMPT's CanAddMoreSamples limit)
const MAX_SAMPLES = 240;

// ── Unreal Package reader ──────────────────────────────────────────────────

interface UMXFileHeader {
  packageVersion: number;
  nameCount:      number;
  nameOffset:     number;
  exportCount:    number;
  exportOffset:   number;
  importCount:    number;
  importOffset:   number;
}

/** Validate and parse the 36-byte UMX file header. Returns null if invalid. */
function readFileHeader(v: DataView): UMXFileHeader | null {
  if (v.byteLength < FILE_HEADER_SIZE) return null;

  // Check magic
  if (u8(v, 0) !== MAGIC[0] || u8(v, 1) !== MAGIC[1] ||
      u8(v, 2) !== MAGIC[2] || u8(v, 3) !== MAGIC[3]) {
    return null;
  }

  const packageVersion = u16le(v, 4);
  // licenseMode at offset 6 (ignored)
  // flags at offset 8 (ignored)
  const nameCount   = u32le(v, 12);
  const nameOffset  = u32le(v, 16);
  const exportCount = u32le(v, 20);
  const exportOffset= u32le(v, 24);
  const importCount = u32le(v, 28);
  const importOffset= u32le(v, 32);

  // Validate offsets and counts (mirrors FileHeader::IsValid)
  if (nameOffset   < FILE_HEADER_SIZE) return null;
  if (exportOffset < FILE_HEADER_SIZE) return null;
  if (importOffset < FILE_HEADER_SIZE) return null;
  if (nameCount   === 0 || nameCount   > MAX_NAME_COUNT)   return null;
  if (exportCount === 0 || exportCount > MAX_EXPORT_COUNT) return null;
  if (importCount === 0 || importCount > MAX_IMPORT_COUNT) return null;

  // Additional overflow checks (mirrors IsValid overflow guards)
  if (nameOffset   > 0xFFFFFFFF - nameCount   * 5) return null;
  if (exportOffset > 0xFFFFFFFF - exportCount * 8) return null;
  if (importOffset > 0xFFFFFFFF - importCount * 4) return null;

  return { packageVersion, nameCount, nameOffset, exportCount, exportOffset, importCount, importOffset };
}

// ── Compressed index reader ────────────────────────────────────────────────

/** Read a variable-length signed Unreal index from the buffer at position pos.
 *  Returns [value, newPos]. Returns [0, pos] if out of bounds. */
function readIndex(bytes: Uint8Array, pos: number): [number, number] {
  if (pos >= bytes.length) return [0, pos];

  const b0      = bytes[pos++];
  const isSigned = (b0 & 0x80) !== 0;
  let   value    = b0 & 0x3F;
  let   shift    = 6;

  if (b0 & 0x40) {
    // More bytes follow
    let cont = true;
    while (cont && shift < 32 && pos < bytes.length) {
      const b = bytes[pos++];
      cont    = (b & 0x80) !== 0;
      value  |= (b & 0x7F) << shift;
      shift  += 7;
    }
  }

  const result = isSigned
    ? (value <= 0x7FFFFFFF ? -value : -0x80000000)
    : value;

  return [result, pos];
}

// ── Name table ────────────────────────────────────────────────────────────

/** Read a single name table entry. Returns [name_lowercase, nextPos]. */
function readNameEntry(bytes: Uint8Array, pos: number, packageVersion: number): [string, number] {
  if (packageVersion >= 64) {
    // Length prefix (ReadIndex)
    const [length, p2] = readIndex(bytes, pos);
    pos = p2;
    if (length <= 0) {
      // Skip to null terminator
      while (pos < bytes.length && bytes[pos] !== 0) pos++;
      if (pos < bytes.length) pos++; // skip null
      pos += 4; // flags
      return ['', pos];
    }
  }

  // Zero-terminated string, lowercased
  const chars: string[] = [];
  while (pos < bytes.length && bytes[pos] !== 0) {
    let c = bytes[pos++];
    if (c >= 65 && c <= 90) c += 32; // to lowercase
    chars.push(String.fromCharCode(c));
  }
  if (pos < bytes.length) pos++; // skip null terminator

  pos += 4; // Object flags (uint32)

  return [chars.join(''), pos];
}

/** Read the full name table. Returns array of lowercased name strings. */
function readNameTable(bytes: Uint8Array, hdr: UMXFileHeader): string[] {
  const names: string[] = [];
  let pos = hdr.nameOffset;
  const limit = Math.min(hdr.nameCount, 65536); // safety cap

  for (let i = 0; i < limit && pos < bytes.length; i++) {
    const [name, nextPos] = readNameEntry(bytes, pos, hdr.packageVersion);
    names.push(name);
    pos = nextPos;
  }

  return names;
}

/** Check if the name table contains "sound". Returns true if found. */
function findNameEntry(bytes: Uint8Array, hdr: UMXFileHeader, target: string): boolean {
  let pos = hdr.nameOffset;
  const limit = Math.min(hdr.nameCount, 65536);

  for (let i = 0; i < limit && pos < bytes.length; i++) {
    if (hdr.packageVersion >= 64) {
      const [length, p2] = readIndex(bytes, pos);
      pos = p2;
      if (length <= 0) {
        while (pos < bytes.length && bytes[pos] !== 0) pos++;
        if (pos < bytes.length) pos++;
        pos += 4;
        continue;
      }
    }

    // Match character by character
    let matchPos  = 0;
    let match     = true;
    const nameStart = pos;

    while (pos < bytes.length && bytes[pos] !== 0) {
      let c = bytes[pos++];
      if (c >= 65 && c <= 90) c += 32; // lowercase
      if (matchPos < target.length) {
        if (String.fromCharCode(c) !== target[matchPos]) match = false;
      } else {
        match = false;
      }
      matchPos++;
    }

    if (matchPos !== target.length) match = false;
    if (pos < bytes.length) pos++; // skip null
    pos += 4; // flags

    if (match) return true;
    void nameStart;
  }

  return false;
}

// ── Import table ──────────────────────────────────────────────────────────

/** Read the import table and return object-name indices (into names array). */
function readImportTable(bytes: Uint8Array, hdr: UMXFileHeader, names: string[]): number[] {
  const classes: number[] = [];
  let pos = hdr.importOffset;
  const limit = Math.min(hdr.exportCount, MAX_IMPORT_COUNT);

  for (let i = 0; i < limit && pos < bytes.length; i++) {
    // ReadIndex: class-package (discard)
    const [, p1] = readIndex(bytes, pos);
    // ReadIndex: class-name (discard)
    const [, p2] = readIndex(bytes, p1);
    let p3 = p2;

    if (hdr.packageVersion >= 60) {
      p3 += 4; // uint32 package
    } else {
      const [, p3_] = readIndex(bytes, p2);
      p3 = p3_;
    }

    // ReadIndex: object-name → index into names array
    const [objName, p4] = readIndex(bytes, p3);
    pos = p4;

    if (objName >= 0 && objName < names.length) {
      classes.push(objName);
    }
  }

  return classes;
}

// ── Sound data extraction from export table entry ─────────────────────────

interface ExtractedSound {
  name:    string;
  data:    Uint8Array;  // raw audio bytes
}

/**
 * Parse one export table entry and extract the embedded sound data.
 * Returns null if not a "sound" class or any parse error.
 */
function readExportTableEntry(
  bytes: Uint8Array,
  pos: number,
  hdr: UMXFileHeader,
  classes: number[],
  names: string[],
): { sound: ExtractedSound | null; nextPos: number } {
  const startPos = pos;

  // ReadIndex: ~objClass (bitwise NOT to get class index)
  const [rawObjClass, p1] = readIndex(bytes, pos);
  pos = p1;
  const objClass = (~rawObjClass) >>> 0;  // bitwise NOT, keep as uint32

  // ReadIndex: object parent (discard)
  const [, p2] = readIndex(bytes, pos);
  pos = p2;

  // Package / group
  if (hdr.packageVersion >= 60) {
    pos += 4; // uint32
  } else {
    const [, p3] = readIndex(bytes, pos);
    pos = p3;
  }

  // ReadIndex: object name index
  const [objName, p4] = readIndex(bytes, pos);
  pos = p4;

  // uint32: object flags (discard)
  if (pos + 4 > bytes.length) return { sound: null, nextPos: pos };
  pos += 4;

  // ReadIndex: object size
  const [objSize, p5] = readIndex(bytes, pos);
  pos = p5;

  // ReadIndex: object offset
  const [objOffset, p6] = readIndex(bytes, pos);
  pos = p6;

  const nextPos = pos;  // Position after this export entry

  // Filter: must be a "sound" class
  if (objClass >= classes.length) return { sound: null, nextPos };
  const classNameIdx = classes[objClass];
  if (classNameIdx < 0 || classNameIdx >= names.length) return { sound: null, nextPos };
  if (names[classNameIdx] !== 'sound') return { sound: null, nextPos };

  // Validate object location in file
  if (objSize <= 0 || objOffset <= FILE_HEADER_SIZE) return { sound: null, nextPos };
  if (objOffset >= bytes.length) return { sound: null, nextPos };

  // Navigate to the object data in the file
  let dpos = objOffset;

  // Per-version preamble before properties (from UMXTools.cpp ReadExportTableEntry)
  if (hdr.packageVersion < 40) {
    dpos += 8;  // 8 zero bytes
  }
  if (hdr.packageVersion < 60) {
    dpos += 16; // 81 00 00 00 00 00 FF FF FF FF FF FF FF FF 00 00
  }

  // ReadIndex: property name (we skip it — just advance past)
  const [, dp1] = readIndex(bytes, dpos);
  dpos = dp1;

  // Per-version additional fields
  if (hdr.packageVersion >= 120) {
    // UT2003 packages
    const [, dp2] = readIndex(bytes, dpos);
    dpos = dp2 + 8;
  } else if (hdr.packageVersion >= 100) {
    // AAO packages
    dpos += 4;
    const [, dp2] = readIndex(bytes, dpos);
    dpos = dp2 + 4;
  } else if (hdr.packageVersion >= 62) {
    // UT packages
    const [, dp2] = readIndex(bytes, dpos);
    dpos = dp2 + 4;
  } else {
    // Old Unreal packages
    const [, dp2] = readIndex(bytes, dpos);
    dpos = dp2;
  }

  if (dpos >= bytes.length) return { sound: null, nextPos };

  // ReadIndex: the actual sound data size
  const [dataSize, dp3] = readIndex(bytes, dpos);
  dpos = dp3;

  if (dataSize <= 0) return { sound: null, nextPos };
  if (dpos + dataSize > bytes.length) return { sound: null, nextPos };

  const data = bytes.subarray(dpos, dpos + dataSize);

  // Get the object name string
  const nameStr = (objName >= 0 && objName < names.length) ? names[objName] : `sound_${startPos}`;

  return {
    sound: { name: nameStr, data },
    nextPos,
  };
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Returns true if the buffer looks like a UAX (Unreal Audio Package) file.
 * Checks magic, header validity, and presence of "sound" in the name table.
 */
export function isUAXFormat(bytes: Uint8Array): boolean {
  if (bytes.length < FILE_HEADER_SIZE) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const hdr = readFileHeader(v);
  if (!hdr) return false;

  // Must contain "sound" in the name table (the fast heuristic OpenMPT uses)
  return findNameEntry(bytes, hdr, 'sound');
}

// ── WAV detection / wrapping ───────────────────────────────────────────────

/** Check if data starts with a RIFF/WAVE header */
function isWAV(data: Uint8Array): boolean {
  if (data.length < 12) return false;
  return data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && // RIFF
         data[8] === 0x57 && data[9] === 0x41 && data[10] === 0x56 && data[11] === 0x45;  // WAVE
}

/**
 * Create an InstrumentConfig from extracted Unreal sound data.
 * The data is typically a WAV blob (possibly with Unreal-specific headers already stripped).
 */
function createSoundInstrument(id: number, name: string, data: Uint8Array): InstrumentConfig {
  // Convert to a data URL so it survives save/reload
  let wavData: Uint8Array;

  if (isWAV(data)) {
    wavData = data;
  } else {
    // Not a recognizable WAV — still try it as raw data via a WAV wrapper
    // Many Unreal sound objects are raw PCM; we wrap them as 8-bit mono 22050 Hz
    const rate = 22050;
    const numSamples = data.length;
    const dataSize = numSamples;
    const fileSize = 44 + dataSize;
    const buf = new ArrayBuffer(fileSize);
    const dv  = new DataView(buf);

    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    dv.setUint32(4, fileSize - 8, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    dv.setUint32(16, 16, true);    // chunk size
    dv.setUint16(20, 1, true);     // PCM
    dv.setUint16(22, 1, true);     // mono
    dv.setUint32(24, rate, true);  // sample rate
    dv.setUint32(28, rate, true);  // byte rate
    dv.setUint16(32, 1, true);     // block align
    dv.setUint16(34, 8, true);     // 8-bit
    writeStr(36, 'data');
    dv.setUint32(40, dataSize, true);

    const out = new Uint8Array(buf);
    for (let i = 0; i < numSamples; i++) {
      out[44 + i] = data[i];
    }

    wavData = out;
  }

  // Encode to base64 data URL
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < wavData.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...Array.from(wavData.subarray(i, Math.min(i + CHUNK, wavData.length)))
    );
  }
  const dataUrl = `data:audio/wav;base64,${btoa(binary)}`;

  return {
    id,
    name:      name || `Sound ${id}`,
    type:      'sample' as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    0,
    pan:       0,
    sample: {
      audioBuffer: wavData.buffer,
      url:         dataUrl,
      baseNote:    'C3',
      detune:      0,
      loop:        false,
      loopType:    'off' as const,
      loopStart:   0,
      loopEnd:     0,
      sampleRate:  22050,
      reverse:     false,
      playbackRate: 1.0,
    },
  } as InstrumentConfig;
}

// ── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a UAX (Unreal Audio Package) file into a TrackerSong.
 * Extracts all sound objects as instruments with an empty 64-row pattern.
 * Returns null on any parse failure (never throws).
 */
export function parseUAXFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return _parse(bytes, filename);
  } catch {
    return null;
  }
}

function _parse(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isUAXFormat(bytes)) return null;

  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hdr = readFileHeader(v);
  if (!hdr) return null;

  // Read name and import tables
  const names   = readNameTable(bytes, hdr);
  if (names.length === 0) return null;

  const classes = readImportTable(bytes, hdr, names);

  // Extract sounds from export table
  const sounds: ExtractedSound[] = [];
  let pos = hdr.exportOffset;

  for (let i = 0; i < hdr.exportCount && pos < bytes.length && sounds.length < MAX_SAMPLES; i++) {
    const { sound, nextPos } = readExportTableEntry(bytes, pos, hdr, classes, names);
    pos = nextPos;
    if (sound && sound.data.length > 0) {
      sounds.push(sound);
    }
  }

  if (sounds.length === 0) return null;

  // Build instruments from extracted sounds
  const instruments: InstrumentConfig[] = sounds.map((s, i) =>
    createSoundInstrument(i + 1, s.name, s.data)
  );

  // Build a single empty 64-row pattern (matches OpenMPT: Patterns.Insert(0, 64))
  const NUM_CHANNELS = 4;
  const ROWS = 64;

  const emptyCell = (): TrackerCell => ({
    note: 0, instrument: 0, volume: 0,
    effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  });

  const channels: ChannelData[] = Array.from({ length: NUM_CHANNELS }, (_, chn) => ({
    id:           `uax-ch${chn}`,
    name:         `Channel ${chn + 1}`,
    muted:        false,
    solo:         false,
    collapsed:    false,
    volume:       100,
    pan:          0,
    instrumentId: null,
    color:        null,
    rows:         Array.from({ length: ROWS }, emptyCell),
  }));

  const pattern: Pattern = {
    id:       'uax-pattern-0',
    name:     'Pattern 0',
    length:   ROWS,
    channels,
    importMetadata: {
      sourceFormat:            'uax',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    NUM_CHANNELS,
      originalPatternCount:    1,
      originalInstrumentCount: sounds.length,
    },
  };

  const songName = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            songName,
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
