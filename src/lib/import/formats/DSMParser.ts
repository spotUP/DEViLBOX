/**
 * DSMParser.ts — DSIK Sound Module (.dsm) parser
 *
 * Handles two fundamentally different formats that share the .dsm extension:
 *
 * Format A — DSIK RIFF DSMF
 *   Magic: "RIFF" + size + "DSMF" at bytes 0–11, OR "DSMF" at byte 0.
 *   RIFF chunk layout: "SONG" chunk holds the song header, "PATT" chunks hold
 *   patterns (64 rows, compressed), "INST" chunks hold sample headers + PCM.
 *   Little-endian throughout.
 *
 * Format B — Dynamic Studio DSm
 *   Magic: "DSm\x1A" at byte 0, version byte 0x20 at byte 4.
 *   Fixed sequential layout: file header → channel panning → order list →
 *   track names → sample headers → patterns (fixed 4 bytes/cell) → sample PCM.
 *   Little-endian throughout.
 *
 * Reference: OpenMPT soundlib/Load_dsm.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

function readMagic(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(v.getUint8(off + i));
  }
  return s;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROWS_PER_PATTERN = 64;
const NOTE_MIN         = 1;    // XM note 1 = C-0

// ── MOD2XMFineTune ────────────────────────────────────────────────────────────
// Maps a MOD finetune nibble (0–15, where 8–15 are negative: -8..–1) to
// an XM finetune byte (signed, units = 1/128 semitone).
//   nibble 0–7  → XM finetune = nibble * 16
//   nibble 8–15 → XM finetune = (nibble - 16) * 16  (negative range)

function mod2xmFineTune(nibble: number): number {
  const n = nibble & 0x0F;
  return (n < 8 ? n : n - 16) * 16;
}

// ── ConvertModCommand (S3M/DSM → XM effTyp/eff) ───────────────────────────────
// DSM RIFF uses MOD/S3M command numbering (1-based letter offsets).
// Returns { effTyp, eff } using XM/MOD effect codes (0x01=portaUp, etc.).

interface EffectPair { effTyp: number; eff: number; volCmd?: number; vol?: number }

function convertModCommand(command: number, param: number): EffectPair {
  // DSM RIFF command field is the MOD letter offset: 0=none, 1=Arpeggio(0), ...
  // Per OpenMPT: ConvertModCommand maps identically to MOD effect codes.
  // Effect 0 in the data means "no effect"; command 1 = MOD effect 0 (arpeggio).
  // We pass through directly — the replayer understands XM/MOD effect codes.
  // command byte is already the raw mod command value (0x00 = nothing).
  switch (command) {
    case 0x00: return { effTyp: 0x00, eff: param };          // Arpeggio (or no effect if param=0)
    case 0x01: return { effTyp: 0x01, eff: param };          // Portamento up
    case 0x02: return { effTyp: 0x02, eff: param };          // Portamento down
    case 0x03: return { effTyp: 0x03, eff: param };          // Tone portamento
    case 0x04: return { effTyp: 0x04, eff: param };          // Vibrato
    case 0x05: return { effTyp: 0x05, eff: param };          // Tone porta + vol slide
    case 0x06: return { effTyp: 0x06, eff: param };          // Vibrato + vol slide
    case 0x07: return { effTyp: 0x07, eff: param };          // Tremolo
    case 0x08: return { effTyp: 0x08, eff: param };          // Set panning (0-255)
    case 0x09: return { effTyp: 0x09, eff: param };          // Sample offset
    case 0x0A: return { effTyp: 0x0A, eff: param };          // Volume slide
    case 0x0B: return { effTyp: 0x0B, eff: param };          // Position jump
    case 0x0C: return { effTyp: 0x0C, eff: Math.min(param, 64) }; // Set volume
    case 0x0D: return { effTyp: 0x0D, eff: param };          // Pattern break
    case 0x0E: return { effTyp: 0x0E, eff: param };          // Extended effect
    case 0x0F: return { effTyp: 0x0F, eff: param };          // Set speed/tempo
    default:   return { effTyp: 0x00, eff: 0 };              // Unknown — clear
  }
}

// ── 16-bit PCM → WAV ArrayBuffer ─────────────────────────────────────────────
// Creates a standard 16-bit signed LE PCM WAV from a raw Int16Array.

function pcm16ToWAV(samples: Int16Array, rate: number): ArrayBuffer {
  const numSamples = samples.length;
  const dataSize   = numSamples * 2;
  const fileSize   = 44 + dataSize;
  const buf        = new ArrayBuffer(fileSize);
  const view       = new DataView(buf);

  const ws = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  ws(0,  'RIFF');
  view.setUint32(4,  fileSize - 8, true);
  ws(8,  'WAVE');
  ws(12, 'fmt ');
  view.setUint32(16, 16,       true);   // chunk size
  view.setUint16(20, 1,        true);   // PCM
  view.setUint16(22, 1,        true);   // mono
  view.setUint32(24, rate,     true);   // sample rate
  view.setUint32(28, rate * 2, true);   // byte rate
  view.setUint16(32, 2,        true);   // block align
  view.setUint16(34, 16,       true);   // bit depth
  ws(36, 'data');
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(off, samples[i], true);
    off += 2;
  }

  return buf;
}

// ── createSamplerInstrument16 ─────────────────────────────────────────────────
// Variant of createSamplerInstrument for 16-bit signed LE PCM samples.

function createSamplerInstrument16(
  id: number,
  name: string,
  pcm: Int16Array,
  volume: number,
  sampleRate: number,
  loopStart: number,
  loopEnd: number,
): InstrumentConfig {
  const hasLoop  = loopEnd > loopStart && loopEnd > 2;
  const wavBuf   = pcm16ToWAV(pcm, sampleRate);
  const wavBytes = new Uint8Array(wavBuf);

  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < wavBytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...Array.from(wavBytes.subarray(i, Math.min(i + CHUNK, wavBytes.length))),
    );
  }
  const dataUrl = `data:audio/wav;base64,${btoa(binary)}`;

  return {
    id,
    name: name.replace(/\0/g, '').trim() || `Sample ${id}`,
    type:      'sample'  as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: volume > 0 ? 20 * Math.log10(volume / 64) : -60,
    pan: 0,
    sample: {
      audioBuffer: wavBuf,
      url: dataUrl,
      baseNote: 'C3',
      detune: 0,
      loop:     hasLoop,
      loopType: hasLoop ? 'forward' as const : 'off' as const,
      loopStart,
      loopEnd: loopEnd > 0 ? loopEnd : pcm.length,
      sampleRate,
      reverse: false,
      playbackRate: 1.0,
    },
    metadata: {
      modPlayback: {
        usePeriodPlayback: true,
        periodMultiplier: 3546895,
        finetune: 0,
        defaultVolume: volume,
      },
    },
  } as InstrumentConfig;
}

// ── buildEmptyInstrument ──────────────────────────────────────────────────────

function buildEmptyInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name: name || `Sample ${id}`,
    type:      'sample'  as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: -60,
    pan: 0,
  } as unknown as InstrumentConfig;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if buffer is either a DSIK RIFF DSMF or a Dynamic Studio DSm file.
 */
export function isDSMFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const v = new DataView(buffer);

  // DSIK RIFF DSMF: "RIFF" + size + "DSMF"
  if (
    readMagic(v, 0, 4) === 'RIFF' &&
    readMagic(v, 8, 4) === 'DSMF'
  ) return true;

  // DSIK RIFF DSMF alternative: "DSMF" at byte 0
  if (readMagic(v, 0, 4) === 'DSMF') return true;

  // Dynamic Studio DSm: "DSm\x1A" + version 0x20
  if (buffer.byteLength >= 5) {
    const magic = readMagic(v, 0, 4);
    if (magic === 'DSm\x1A' && u8(v, 4) === 0x20) return true;
  }

  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// RIFF DSMF helpers
// ────────────────────────────────────────────────────────────────────────────

interface DSMSongHeader {
  songName:     string;
  fileVersion:  number;
  flags:        number;
  restartPos:   number;
  numOrders:    number;
  numSamples:   number;
  numPatterns:  number;
  numChannels:  number;
  globalVol:    number;
  masterVol:    number;
  speed:        number;
  bpm:          number;
  panPos:       number[];   // 16 entries, 0–0x80
  orders:       number[];   // 128 entries
}

function readDSMSongHeader(v: DataView, off: number, chunkSize: number): DSMSongHeader {
  const end = off + chunkSize;

  const songName    = readString(v, off,      28);
  const fileVersion = chunkSize > 29  ? u16le(v, off + 28) : 0;
  const flags       = chunkSize > 31  ? u16le(v, off + 30) : 0;
  // orderPos at +32 (ignored per spec)
  const restartPos  = chunkSize > 35  ? u16le(v, off + 34) : 0;
  const numOrders   = chunkSize > 37  ? u16le(v, off + 36) : 0;
  const numSamples  = chunkSize > 39  ? u16le(v, off + 38) : 0;
  const numPatterns = chunkSize > 41  ? u16le(v, off + 40) : 0;
  const numChannels = chunkSize > 43  ? u16le(v, off + 42) : 1;
  const globalVol   = chunkSize > 44  ? u8(v,    off + 44) : 64;
  const masterVol   = chunkSize > 45  ? u8(v,    off + 45) : 128;
  const speed       = chunkSize > 46  ? u8(v,    off + 46) : 6;
  const bpm         = chunkSize > 47  ? u8(v,    off + 47) : 125;

  const panPos: number[] = [];
  for (let i = 0; i < 16; i++) {
    const panOff = off + 48 + i;
    panPos.push(panOff < end ? u8(v, panOff) : 0x40);
  }

  const orders: number[] = [];
  for (let i = 0; i < 128; i++) {
    const ordOff = off + 64 + i;
    orders.push(ordOff < end ? u8(v, ordOff) : 0xFF);
  }

  return {
    songName, fileVersion, flags, restartPos,
    numOrders, numSamples, numPatterns, numChannels,
    globalVol, masterVol, speed, bpm, panPos, orders,
  };
}

interface DSMSampleHeader {
  filename:   string;
  flags:      number;  // 0x01=loop, 0x02=signedPCM, 0x04=16bit, 0x40=deltaPCM
  volume:     number;  // 0–64
  length:     number;  // bytes
  loopStart:  number;
  loopEnd:    number;
  sampleRate: number;
  sampleName: string;
}

// DSMSampleHeader is exactly 64 bytes:
//   +0   filename[13]
//   +13  flags (uint16LE)
//   +15  volume (uint8)
//   +16  length (uint32LE)
//   +20  loopStart (uint32LE)
//   +24  loopEnd (uint32LE)
//   +28  dataPtr (uint32LE, ignored)
//   +32  sampleRate (uint32LE)
//   +36  sampleName[28]
const DSM_SAMPLE_HEADER_SIZE = 64;

function readDSMSampleHeader(v: DataView, off: number): DSMSampleHeader {
  return {
    filename:   readString(v, off,      13),
    flags:      u16le(v, off + 13),
    volume:     u8(v,    off + 15),
    length:     u32le(v, off + 16),
    loopStart:  u32le(v, off + 20),
    loopEnd:    u32le(v, off + 24),
    // dataPtr at +28 — ignored
    sampleRate: u32le(v, off + 32),
    sampleName: readString(v, off + 36, 28),
  };
}

// ── parseRiffDSMF ──────────────────────────────────────────────────────────

function parseRiffDSMF(v: DataView, bytes: Uint8Array, filename: string): TrackerSong {
  const fileLen = v.byteLength;

  // Determine start of RIFF chunk stream.
  // RIFF DSMF: bytes 0–11 consumed (RIFF + size + DSMF), then chunks start at 12.
  // DSMF at 0 alternative: skip the first 4-byte magic, then 4 NUL/RIFF bytes +
  // 4-byte size + 4-byte tag = next 12 bytes → chunks start at 12 as well.
  let chunkCursor = 12;

  // Find and read the mandatory SONG chunk first.
  // Per OpenMPT: simplified loader — expects SONG to be the first chunk.
  if (chunkCursor + 8 > fileLen) {
    throw new Error('DSMParser(RIFF): file too small for SONG chunk header');
  }

  const songChunkMagic = readMagic(v, chunkCursor, 4);
  if (songChunkMagic !== 'SONG') {
    throw new Error(`DSMParser(RIFF): expected SONG chunk, found "${songChunkMagic}"`);
  }
  const songChunkSize = u32le(v, chunkCursor + 4);
  chunkCursor += 8;

  const songHeader = readDSMSongHeader(v, chunkCursor, songChunkSize);
  chunkCursor += songChunkSize;

  if (
    songHeader.numOrders   > 128 ||
    songHeader.numChannels  > 16 ||
    songHeader.numPatterns > 256 ||
    songHeader.restartPos  > 128
  ) {
    throw new Error('DSMParser(RIFF): invalid song header values');
  }

  const numChannels = Math.max(songHeader.numChannels, 1);

  // Build order list (stop at 0xFF)
  const orderList: number[] = [];
  for (let i = 0; i < songHeader.numOrders; i++) {
    const ord = songHeader.orders[i];
    if (ord === 0xFF) break;
    if (ord !== 0xFE) orderList.push(ord);
    // 0xFE = loop marker — skip (restart position already captured)
  }

  // Channel panning: panPos[i] 0–0x80 → 0–256 (multiply by 2)
  const channelPan: number[] = [];
  for (let i = 0; i < numChannels; i++) {
    const raw = songHeader.panPos[i];
    channelPan.push(raw <= 0x80 ? raw * 2 : 128);
  }

  // Global volume: 0–64 → 0–256; if 0 → max
  const globalVol = Math.min(songHeader.globalVol, 64) * 4 || 256;

  // Parse remaining chunks: PATT and INST
  const patterns:    Pattern[]          = [];
  const instruments: InstrumentConfig[] = [];

  while (chunkCursor + 8 <= fileLen) {
    const chunkMagic = readMagic(v, chunkCursor, 4);
    const chunkSize  = u32le(v, chunkCursor + 4);
    const dataStart  = chunkCursor + 8;
    chunkCursor     += 8 + chunkSize;

    if (dataStart + chunkSize > fileLen) break; // truncated

    if (chunkMagic === 'PATT') {
      // ── Pattern chunk (64 rows, compressed) ──────────────────────────────
      const patIdx = patterns.length;
      const channels: ChannelData[] = Array.from(
        { length: numChannels },
        (_, ch): ChannelData => ({
          id:           `channel-${ch}`,
          name:         `Channel ${ch + 1}`,
          muted:        false,
          solo:         false,
          collapsed:    false,
          volume:       100,
          pan:          ((channelPan[ch] ?? 128) - 128),  // convert 0-256 → -128..128
          instrumentId: null,
          color:        null,
          rows:         Array.from({ length: ROWS_PER_PATTERN }, (): TrackerCell => ({
            note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          })),
        }),
      );

      // Skip first 2 bytes (padding/size info, not needed)
      let cur = dataStart + 2;
      let row = 0;

      while (cur < dataStart + chunkSize && row < ROWS_PER_PATTERN) {
        const flag = u8(v, cur++);
        if (flag === 0) {
          row++;
          continue;
        }

        const chn = flag & 0x0F;
        const cell: TrackerCell = chn < numChannels
          ? channels[chn].rows[row]!
          : { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

        if (flag & 0x80) {
          // Note byte
          const noteRaw = u8(v, cur++);
          if (noteRaw > 0 && noteRaw <= 12 * 9) {
            cell.note = noteRaw + 11 + NOTE_MIN;  // note + 12 (NOTE_MIN=1)
          } else if (noteRaw > 0) {
            cell.note = noteRaw; // out of range, pass through
          }
        }
        if (flag & 0x40) {
          cell.instrument = u8(v, cur++);
        }
        if (flag & 0x20) {
          // Volume column: 0–64
          cell.volume    = Math.min(u8(v, cur++), 64);
        }
        if (flag & 0x10) {
          const command  = u8(v, cur++);
          const param    = u8(v, cur++);
          const { effTyp, eff } = convertModCommand(command, param);
          cell.effTyp    = effTyp;
          cell.eff       = eff;
        }
      }

      patterns.push({
        id:      `pattern-${patIdx}`,
        name:    `Pattern ${patIdx}`,
        length:  ROWS_PER_PATTERN,
        channels,
        importMetadata: {
          sourceFormat:            'DSM',
          sourceFile:              filename,
          importedAt:              new Date().toISOString(),
          originalChannelCount:    numChannels,
          originalPatternCount:    songHeader.numPatterns,
          originalInstrumentCount: songHeader.numSamples,
        },
      });

    } else if (chunkMagic === 'INST') {
      // ── Sample chunk ──────────────────────────────────────────────────────
      const smpIdx    = instruments.length + 1;

      if (dataStart + DSM_SAMPLE_HEADER_SIZE > fileLen) {
        instruments.push(buildEmptyInstrument(smpIdx, `Sample ${smpIdx}`));
        continue;
      }

      const hdr       = readDSMSampleHeader(v, dataStart);
      const pcmStart  = dataStart + DSM_SAMPLE_HEADER_SIZE;
      const pcmLen    = Math.min(hdr.length, dataStart + chunkSize - pcmStart);
      const volume    = Math.min(hdr.volume, 64);
      const smpName   = hdr.sampleName || hdr.filename || `Sample ${smpIdx}`;

      const loopActive = (hdr.flags & 0x01) !== 0;
      const is16Bit    = (hdr.flags & 0x04) !== 0;
      const isDelta    = (hdr.flags & 0x40) !== 0;
      const isSigned   = (hdr.flags & 0x02) !== 0;

      const loopStart  = loopActive ? hdr.loopStart : 0;
      const loopEnd    = loopActive ? hdr.loopEnd   : 0;
      const sampleRate = hdr.sampleRate || 8363;

      if (pcmLen <= 0 || pcmStart + pcmLen > fileLen) {
        instruments.push(buildEmptyInstrument(smpIdx, smpName));
        continue;
      }

      if (is16Bit) {
        // 16-bit sample: read as pairs of bytes, little-endian signed
        const numFrames = Math.floor(pcmLen / 2);
        const pcm16     = new Int16Array(numFrames);
        for (let i = 0; i < numFrames; i++) {
          pcm16[i] = v.getInt16(pcmStart + i * 2, true);
        }
        instruments.push(
          createSamplerInstrument16(smpIdx, smpName, pcm16, volume, sampleRate, loopStart, loopEnd),
        );
      } else {
        // 8-bit sample
        let raw = bytes.slice(pcmStart, pcmStart + pcmLen);

        if (isDelta) {
          // Delta PCM: running sum, unsigned bytes → signed
          const out = new Uint8Array(pcmLen);
          let acc = 0;
          for (let i = 0; i < pcmLen; i++) {
            acc = (acc + raw[i]) & 0xFF;
            out[i] = acc;
          }
          raw = out;
          // After delta decode the result is unsigned — convert to signed:
          // XOR 0x80 to flip sign bit
          const signed8 = new Uint8Array(pcmLen);
          for (let i = 0; i < pcmLen; i++) signed8[i] = raw[i] ^ 0x80;
          raw = signed8;
          instruments.push(
            createSamplerInstrument(smpIdx, smpName, raw, volume, sampleRate, loopStart, loopEnd),
          );
        } else if (isSigned) {
          // Signed PCM: pass through directly
          instruments.push(
            createSamplerInstrument(smpIdx, smpName, raw, volume, sampleRate, loopStart, loopEnd),
          );
        } else {
          // Unsigned PCM: XOR 0x80 to convert to signed
          const signed8 = new Uint8Array(pcmLen);
          for (let i = 0; i < pcmLen; i++) signed8[i] = raw[i] ^ 0x80;
          instruments.push(
            createSamplerInstrument(smpIdx, smpName, signed8, volume, sampleRate, loopStart, loopEnd),
          );
        }
      }
    }
    // Other chunks (e.g. "TITL") are silently ignored.
  }

  // Pad instruments to match declared count if needed
  while (instruments.length < songHeader.numSamples) {
    const id = instruments.length + 1;
    instruments.push(buildEmptyInstrument(id, `Sample ${id}`));
  }

  const restartPos = Math.min(songHeader.restartPos, Math.max(0, orderList.length - 1));

  return {
    name:            songHeader.songName || filename.replace(/\.[^/.]+$/, ''),
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   orderList,
    songLength:      orderList.length,
    restartPosition: restartPos,
    numChannels,
    initialSpeed:    songHeader.speed  || 6,
    initialBPM:      songHeader.bpm    || 125,
    linearPeriods:   false,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Dynamic Studio DSm helpers
// ────────────────────────────────────────────────────────────────────────────

interface DSmFileHeader {
  title:           string;
  artist:          string;
  numChannels:     number;
  numSamples:      number;
  numOrders:       number;
  packInformation: number;
  globalVol:       number;
}

// DSmFileHeader is exactly 64 bytes:
//   +0   magic[4] = "DSm\x1A"
//   +4   version (uint8)
//   +5   title[20]
//   +25  artist[20]
//   +45  numChannels (uint8)
//   +46  numSamples (uint8)
//   +47  numOrders (uint8)
//   +48  packInformation (uint8)
//   +49  globalVol (uint8, 0–100)
//   +50  padding[14]
const DSm_FILE_HEADER_SIZE = 64;

function readDSmFileHeader(v: DataView): DSmFileHeader {
  return {
    title:           readString(v, 5,  20),
    artist:          readString(v, 25, 20),
    numChannels:     u8(v, 45),
    numSamples:      u8(v, 46),
    numOrders:       u8(v, 47),
    packInformation: u8(v, 48),
    globalVol:       u8(v, 49),
  };
}

interface DSmSampleHeader {
  name:       string;
  type:       number;    // 0 = 8-bit, 16 = 16-bit
  length:     number;    // in words → bytes = length * 2
  finetune:   number;    // nibble 0–15 for MOD2XMFineTune
  volume:     number;    // 0–64
  loopStart:  number;    // bytes
  loopLength: number;    // bytes; > 2 = active loop
}

// DSmSampleHeader is exactly 32 bytes:
//   +0   name[22]
//   +22  type (uint8)
//   +23  length (uint16LE, words)
//   +25  finetune (uint8)
//   +26  volume (uint8, 0–64)
//   +27  loopStart (uint16LE, bytes)
//   +29  loopLength (uint16LE, bytes)
//   +31  padding (uint8)
const DSm_SAMPLE_HEADER_SIZE = 32;

function readDSmSampleHeader(v: DataView, off: number): DSmSampleHeader {
  return {
    name:       readString(v, off,      22),
    type:       u8(v,       off + 22),
    length:     u16le(v,    off + 23),
    finetune:   u8(v,       off + 25),
    volume:     u8(v,       off + 26),
    loopStart:  u16le(v,    off + 27),
    loopLength: u16le(v,    off + 29),
  };
}

// ── parseDynamicStudioDSm ────────────────────────────────────────────────────

function parseDynamicStudioDSm(v: DataView, bytes: Uint8Array, filename: string): TrackerSong {
  const fileLen = v.byteLength;

  const hdr = readDSmFileHeader(v);
  const {
    numChannels: rawNumChannels, numSamples, numOrders, globalVol,
  } = hdr;

  if (
    rawNumChannels < 1 || rawNumChannels > 16 ||
    numSamples === 0   ||
    numOrders  === 0
  ) {
    throw new Error('DSMParser(DSm): invalid file header values');
  }

  const numChannels = rawNumChannels;

  // Cursor starts right after the 64-byte file header
  let cur = DSm_FILE_HEADER_SIZE;

  // ── Channel panning ────────────────────────────────────────────────────────
  // numChannels bytes: (value & 0x0F) * 0x11  → 0–255 panning
  const channelPan: number[] = [];
  for (let i = 0; i < numChannels; i++) {
    if (cur >= fileLen) channelPan.push(128);
    else channelPan.push((u8(v, cur++) & 0x0F) * 0x11);
  }

  // ── Order list ─────────────────────────────────────────────────────────────
  const orderList: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    if (cur >= fileLen) break;
    orderList.push(u8(v, cur++));
  }

  // Determine number of patterns from max pattern index in order list
  let maxPatIdx = 0;
  for (const p of orderList) {
    if (p > maxPatIdx) maxPatIdx = p;
  }
  const numPatterns = maxPatIdx + 1;

  // ── Track names ────────────────────────────────────────────────────────────
  // numPatterns × numChannels × 8 bytes
  // Only the first pattern's channel names are used; the rest are skipped.
  const channelNames: string[] = [];
  const trackNamesTotal = numPatterns * numChannels * 8;

  if (cur + trackNamesTotal > fileLen) {
    throw new Error('DSMParser(DSm): file truncated at track names');
  }

  for (let ch = 0; ch < numChannels; ch++) {
    channelNames.push(readString(v, cur + ch * 8, 8) || `Channel ${ch + 1}`);
  }
  cur += trackNamesTotal;

  // ── Sample headers ─────────────────────────────────────────────────────────
  if (cur + numSamples * DSm_SAMPLE_HEADER_SIZE > fileLen) {
    throw new Error('DSMParser(DSm): file truncated at sample headers');
  }

  const sampleHeaders: DSmSampleHeader[] = [];
  for (let i = 0; i < numSamples; i++) {
    sampleHeaders.push(readDSmSampleHeader(v, cur));
    cur += DSm_SAMPLE_HEADER_SIZE;
  }

  // ── Patterns ───────────────────────────────────────────────────────────────
  // numPatterns × numChannels × 64 rows × 4 bytes/cell (fixed layout)
  const patternDataSize = numPatterns * numChannels * ROWS_PER_PATTERN * 4;
  if (cur + patternDataSize > fileLen) {
    throw new Error('DSMParser(DSm): file truncated at pattern data');
  }

  const patterns: Pattern[] = [];

  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    const channels: ChannelData[] = Array.from(
      { length: numChannels },
      (_, ch): ChannelData => ({
        id:           `channel-${ch}`,
        name:         channelNames[ch] ?? `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          ((channelPan[ch] ?? 128) - 128),  // 0-255 → -128..127
        instrumentId: null,
        color:        null,
        rows:         [],
      }),
    );

    // Data is ordered: all channels row 0, all channels row 1, …
    // i.e. row-major by rows, channel within each row
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cellOff = cur + (patIdx * numChannels * ROWS_PER_PATTERN + row * numChannels + ch) * 4;

        const d0 = u8(v, cellOff);     // instrument
        const d1 = u8(v, cellOff + 1); // note_encoded
        const d2 = u8(v, cellOff + 2); // effect
        const d3 = u8(v, cellOff + 3); // param

        // Note: d1 > 0 && d1 <= 84*2 → XM note = (d1 >> 1) + NOTE_MIN + 35 = (d1>>1) + 36
        const note = (d1 > 0 && d1 <= 84 * 2) ? (d1 >> 1) + NOTE_MIN + 35 : 0;

        let effTyp = 0;
        let eff    = d3;
        let volCmd = 0;
        let vol    = 0;

        if (d2 === 0x08) {
          // Special panning command
          switch (d3 & 0xF0) {
            case 0x00:   // 4-bit panning → CMD_MODCMDEX (0x0E) with 0x80 nibble
              effTyp = 0x0E;
              eff    = d3 | 0x80;
              break;
            case 0x10:   // Volume slide up
              effTyp = 0x0A;
              eff    = (d3 & 0x0F) << 4;
              break;
            case 0x20:   // CMD_MODCMDEX fine vol slide up
              effTyp = 0x0E;
              eff    = d3 | 0xA0;
              break;
            case 0x30:   // CMD_MODCMDEX fine porta up
            case 0x40:   // CMD_MODCMDEX fine porta down
              effTyp = 0x0E;
              eff    = d3 - 0x20;
              break;
            default:
              effTyp = 0;
              eff    = 0;
              break;
          }
        } else if (d2 === 0x13) {
          // 3D Simulate — map to CMD_PANNING8 (0x08) with complex calculation
          effTyp       = 0x08;
          let param    = (d3 & 0x7F) * 2;
          if      (d3 <= 0x40) param += 0x80;           // Front → Right
          else if (d3 <  0x80) param  = 0x180 - param;  // Right → Back
          else if (d3 <  0xC0) param  = 0x80 - param;   // Back → Left
          else                 param -= 0x80;            // Left → Front
          eff = Math.min(255, Math.max(0, param));
        } else if ((d2 & 0xF0) === 0x20) {
          // Offset + volume column
          effTyp = 0x09;
          eff    = d3;
          volCmd = 0x01;                 // VOLCMD_VOLUME
          vol    = (d2 & 0x0F) * 4 + 4;
        } else if (d2 <= 0x0F || d2 === 0x11 || d2 === 0x12) {
          // 0x11 and 0x12 support full 5-octave range, map to 0x01 and 0x02
          const mappedCmd = (d2 === 0x11 || d2 === 0x12) ? (d2 - 0x10) : d2;
          const result    = convertModCommand(mappedCmd, d3);
          effTyp = result.effTyp;
          eff    = result.eff;
        }

        const cell: TrackerCell = {
          note,
          instrument: d0,
          volume:     volCmd !== 0 ? vol : 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2:    0,
        };

        channels[ch].rows.push(cell);
      }
    }

    patterns.push({
      id:      `pattern-${patIdx}`,
      name:    `Pattern ${patIdx}`,
      length:  ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'DSM',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numSamples,
      },
    });
  }

  cur += patternDataSize;

  // ── Sample PCM data ────────────────────────────────────────────────────────
  // Signed 8/16-bit LE PCM data, sequential after patterns.

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < numSamples; i++) {
    const sh       = sampleHeaders[i]!;
    const smpIdx   = i + 1;
    const smpName  = sh.name || `Sample ${smpIdx}`;
    const volume   = Math.min(sh.volume, 64);
    const is16Bit  = sh.type === 16;
    const byteLen  = sh.length * 2;              // length field is in words → bytes

    const loopActive = sh.loopLength > 2;
    const loopStart  = loopActive ? sh.loopStart  : 0;
    const loopEnd    = loopActive ? sh.loopStart + sh.loopLength : 0;

    // DSm uses a fixed C5 speed of 8363 Hz (MOD default)
    // The finetune nibble adjusts tuning via MOD2XMFineTune
    const sampleRate = 8363;
    const finetune   = mod2xmFineTune(sh.finetune);

    if (byteLen <= 0 || cur + byteLen > fileLen) {
      instruments.push(buildEmptyInstrument(smpIdx, smpName));
      cur += Math.max(0, Math.min(byteLen, fileLen - cur));
      continue;
    }

    if (is16Bit) {
      const numFrames = byteLen / 2;
      const pcm16     = new Int16Array(numFrames);
      for (let j = 0; j < numFrames; j++) {
        pcm16[j] = v.getInt16(cur + j * 2, true);
      }
      const inst = createSamplerInstrument16(smpIdx, smpName, pcm16, volume, sampleRate, loopStart, loopEnd);
      // Store finetune in metadata for playback
      if (inst.metadata?.modPlayback) {
        inst.metadata.modPlayback.finetune = finetune;
      }
      instruments.push(inst);
    } else {
      // 8-bit signed PCM
      const raw  = bytes.slice(cur, cur + byteLen);
      const inst = createSamplerInstrument(smpIdx, smpName, raw, volume, sampleRate, loopStart, loopEnd);
      if (inst.metadata?.modPlayback) {
        inst.metadata.modPlayback.finetune = finetune;
      }
      instruments.push(inst);
    }

    cur += byteLen;
  }

  // Global volume: 0–100 → scale to 0–256
  const globalVolScaled = Math.round(globalVol * 256 / 100);

  return {
    name:            hdr.title || filename.replace(/\.[^/.]+$/, ''),
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   orderList,
    songLength:      orderList.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
    // Store global volume in compatFlags for replayer awareness
    compatFlags: {
      globalVolume: globalVolScaled,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse a .dsm file (DSIK RIFF DSMF or Dynamic Studio DSm) into a TrackerSong.
 *
 * @throws If the file fails format detection or is fatally malformed.
 */
export async function parseDSMFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isDSMFormat(buffer)) {
    throw new Error('DSMParser: file does not match DSIK RIFF DSMF or Dynamic Studio DSm format');
  }

  const v     = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Try RIFF DSMF first
  const magic0 = readMagic(v, 0, 4);
  if (magic0 === 'RIFF' || magic0 === 'DSMF') {
    return parseRiffDSMF(v, bytes, filename);
  }

  // Dynamic Studio DSm
  return parseDynamicStudioDSm(v, bytes, filename);
}
