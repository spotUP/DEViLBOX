/**
 * DigiBoosterParser.ts — DigiBooster Pro format parser (.digi)
 *
 * DigiBooster Pro is an 8-channel Amiga tracker with an extended effect set.
 * It uses a MOD-like binary structure with a "DIGI" header.
 *
 * DigiBooster 1.x uses the "DBMX" magic. DigiBooster 2+ (Pro) uses "DBM0".
 *
 * File structure:
 *   4-byte magic: "DBMX" or "DBM0"
 *   Then IFF-style chunks (not padded):
 *     INFO — General info (channels, patterns, songs, instruments, samples)
 *     NAME — Module name (44 bytes)
 *     SONG — Song structures (positions, name, length)
 *     INST — Instrument definitions
 *     PATT — Pattern data
 *     SMPL — Sample data
 *     VENV — Volume envelopes (DBM0 only)
 *     PENV — Panning envelopes (DBM0 only)
 *
 * Reference:
 *   - DigiBooster Pro file format documentation
 *   - https://wiki.multimedia.cx/index.php/DigiBooster
 *   - OpenMPT DBM loader (Load_dbm.cpp)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeDigiBoosterCell } from '@/engine/uade/encoders/DigiBoosterEncoder';
import { createSamplerInstrument } from './AmigaUtils';

const TEXT_DECODER = new TextDecoder('iso-8859-1');

function str4(buf: Uint8Array, off: number): string {
  return TEXT_DECODER.decode(buf.subarray(off, off + 4));
}
function readStr(buf: Uint8Array, off: number, len: number): string {
  let end = off;
  while (end < off + len && buf[end] !== 0) end++;
  return TEXT_DECODER.decode(buf.subarray(off, end)).trim();
}
function u16(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}
function u32(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

export function parseDigiBoosterFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const magic = str4(buf, 0);

  // Try original DigiBooster 1.x format first ("DIGI Booster module\0")
  if (magic === 'DIGI' && buf.length >= 1572) {
    const hdr = readStr(buf, 0, 20);
    if (hdr.startsWith('DIGI Booster module')) {
      return parseOriginalDigiBooster(buf, filename);
    }
  }

  if (magic !== 'DBMX' && magic !== 'DBM0') {
    throw new Error(`Not a DigiBooster file: magic="${magic}"`);
  }

  // ── Parse IFF-style chunks ────────────────────────────────────────────────
  let offset = 4;  // Skip magic
  if (magic === 'DBM0') {
    // DBM0 has version byte at offset 4
    offset = 12; // Skip "DBM0" + 8 header bytes
  }

  let numChannels = 8;
  let numPatterns = 0;
  let numInstruments = 0;
  let numSamples = 0;
  let numSongs = 1;
  let moduleName = filename.replace(/\.[^/.]+$/, '');
  const songPositions: number[] = [];
  let songLength = 0;
  let speed = 6;
  let bpm = 125;

  interface DBInstrument {
    name: string;
    sampleNum: number;  // 1-based, 0=none
    volume: number;
    finetune: number;
    loopStart: number;
    loopEnd: number;
    flags: number;
  }

  interface DBSample {
    name: string;
    length: number;
    loopStart: number;
    loopEnd: number;
    volume: number;
    finetune: number;
    bits: number;  // 8 or 16
    pcm: Uint8Array | null;
  }

  const dbInstruments: DBInstrument[] = [];
  const dbSamples: DBSample[] = [];
  const dbPatterns: Array<{ rows: number; channels: number; data: Uint8Array; fileDataOffset: number }> = [];

  while (offset + 8 < buf.length) {
    const chunkId = str4(buf, offset);
    const chunkSize = u32(buf, offset + 4);
    const dataStart = offset + 8;
    offset += 8 + chunkSize;

    switch (chunkId) {
      case 'INFO': {
        // 8 bytes: instruments(2) + samples(2) + songs(2) + patterns(2) + channels(2) (DBM0)
        // or just channels(2) for DBMX
        if (magic === 'DBM0') {
          numInstruments = u16(buf, dataStart);
          numSamples     = u16(buf, dataStart + 2);
          numSongs       = u16(buf, dataStart + 4);
          numPatterns    = u16(buf, dataStart + 6);
          numChannels    = u16(buf, dataStart + 8);
        } else {
          numChannels    = u16(buf, dataStart);
          numPatterns    = u16(buf, dataStart + 2);
          numInstruments = u16(buf, dataStart + 4);
          numSamples     = u16(buf, dataStart + 6);
        }
        break;
      }

      case 'NAME': {
        moduleName = readStr(buf, dataStart, Math.min(chunkSize, 44));
        break;
      }

      case 'SONG': {
        // One or more song structures
        // Each: name[44], length(2), positions[128×2]
        let soff = dataStart;
        for (let s = 0; s < numSongs && soff + 46 <= dataStart + chunkSize; s++) {
          // songName at soff, 44 bytes (skipped)
          const len = u16(buf, soff + 44);
          if (s === 0) {
            songLength = len;
            for (let i = 0; i < len && i < 128; i++) {
              songPositions.push(u16(buf, soff + 46 + i * 2));
            }
          }
          soff += 46 + 128 * 2;
        }
        break;
      }

      case 'INST': {
        // DBM0: 50 bytes per instrument
        // DBMX: 28 bytes per instrument
        const instrSize = magic === 'DBM0' ? 50 : 28;
        for (let i = 0; i < numInstruments; i++) {
          const base = dataStart + i * instrSize;
          if (base + instrSize > buf.length) break;
          const name = readStr(buf, base, 30);
          const sampleIdx = u16(buf, base + 30);
          const volume = buf[base + 32];
          const flags = u16(buf, base + 33);
          const finetune = (buf[base + 35] < 128) ? buf[base + 35] : buf[base + 35] - 256;
          const loopStart = u32(buf, base + 36);
          const loopEnd   = u32(buf, base + 40);
          dbInstruments.push({ name, sampleNum: sampleIdx, volume, finetune, loopStart, loopEnd, flags });
        }
        break;
      }

      case 'SMPL': {
        // Sample headers: each is 50 bytes (DBM0) or 24 bytes (DBMX)
        // Followed by actual PCM data
        // In DBM0: headers first, then PCM lumped together
        let soff = dataStart;
        for (let i = 0; i < numSamples; i++) {
          if (soff + 4 > dataStart + chunkSize) break;
          const name = readStr(buf, soff, 30);
          const length = u32(buf, soff + 30);
          const loopStart = u32(buf, soff + 34);
          const loopEnd   = u32(buf, soff + 38);
          const volume    = buf[soff + 42];
          const flags     = u16(buf, soff + 43);
          const bits      = (flags & 1) ? 16 : 8;
          soff += 50;

          // PCM data follows the header block
          const byteLen = length * (bits === 16 ? 2 : 1);
          const pcmSlice = buf.slice(soff, soff + byteLen);
          soff += byteLen;

          dbSamples.push({
            name,
            length,
            loopStart,
            loopEnd,
            volume: volume || 64,
            finetune: 0,
            bits,
            pcm: pcmSlice,
          });
        }
        break;
      }

      case 'PATT': {
        // Pattern header: rows(2) + channels(2)
        // Cell format (4 bytes): note(1) + inst(1) + effect(1) + param(1)
        let poff = dataStart;
        while (poff + 4 < dataStart + chunkSize) {
          const rows = u16(buf, poff);
          const chans = u16(buf, poff + 2);
          poff += 4;
          const dataBytes = rows * chans * 4;
          const patDataOff = poff;
          const data = buf.slice(poff, poff + dataBytes);
          poff += dataBytes;
          dbPatterns.push({ rows, channels: chans, data, fileDataOffset: patDataOff });
          if (dbPatterns.length >= numPatterns) break;
        }
        break;
      }
    }
  }

  // ── Build instruments ────────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = dbInstruments.map((instr, i) => {
    const sampleIdx = instr.sampleNum - 1; // Convert to 0-based
    if (sampleIdx < 0 || sampleIdx >= dbSamples.length) {
      return {
        id: i + 1,
        name: instr.name || `Instrument ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: -6,
        pan: 0,
      } as InstrumentConfig;
    }

    const samp = dbSamples[sampleIdx];
    let pcm8: Uint8Array;

    if (samp.pcm === null || samp.pcm.length === 0) {
      pcm8 = new Uint8Array(0);
    } else if (samp.bits === 16) {
      // Convert 16-bit → 8-bit
      const frames = Math.floor(samp.pcm.length / 2);
      pcm8 = new Uint8Array(frames);
      const view = new DataView(samp.pcm.buffer, samp.pcm.byteOffset);
      for (let j = 0; j < frames; j++) {
        const s16 = view.getInt16(j * 2, false);  // Big-endian
        pcm8[j] = ((s16 >> 8) + 128) & 0xFF;
      }
    } else {
      pcm8 = samp.pcm;
    }

    return createSamplerInstrument(
      i + 1,
      instr.name || samp.name || `Sample ${i + 1}`,
      pcm8,
      samp.volume,
      8287,
      samp.loopStart,
      samp.loopEnd
    );
  });

  // ── Build patterns ────────────────────────────────────────────────────────
  const trackerPatterns: Pattern[] = dbPatterns.map((pat, patIdx) => {
    const channels: ChannelData[] = Array.from({ length: pat.channels }, (_, ch) => {
      const rows: TrackerCell[] = [];

      for (let row = 0; row < pat.rows; row++) {
        const base = (row * pat.channels + ch) * 4;
        const rawNote = pat.data[base];
        const inst    = pat.data[base + 1];
        const eff     = pat.data[base + 2];
        const param   = pat.data[base + 3];

        // DBM notes: 0=none, 1=C-0 (lowest), up to 96
        const xmNote  = rawNote > 0 ? rawNote + 12 : 0;

        const { effTyp, effParam } = mapDBMEffect(eff, param);
        rows.push({ note: xmNote, instrument: inst, volume: 0, effTyp, eff: effParam, effTyp2: 0, eff2: 0 });
      }

      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch % 2 === 0 ? -25 : 25,
        instrumentId: null,
        color: null,
        rows,
      };
    });

    return {
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: pat.rows,
      channels,
      importMetadata: {
        sourceFormat: 'DIGI',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: pat.channels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numInstruments,
      },
    };
  });

  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'digiBooster',
    patternDataFileOffset: 0, // overridden by getCellFileOffset
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels,
    numPatterns: trackerPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeDigiBoosterCell,
    decodeCell: (bytes: Uint8Array): TrackerCell => {
      // Inverse of encodeDigiBoosterCell — matches parser's cell decode
      // Byte 0: raw note (0=none, 1-96 → xmNote = raw + 12)
      const rawNote = bytes[0];
      const note = rawNote > 0 ? rawNote + 12 : 0;

      // Byte 1: instrument (stored directly, no offset)
      const instrument = bytes[1];

      // Byte 2-3: effect type + param (ProTracker compatible, 1:1 mapping)
      const effTyp = bytes[2];
      const eff = bytes[3];

      return { note, instrument, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 };
    },
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      const pat = dbPatterns[pattern];
      if (!pat) return 0;
      return pat.fileDataOffset + (row * pat.channels + channel) * 4;
    },
  };

  return {
    name: moduleName,
    format: 'DIGI' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions: songPositions.length > 0 ? songPositions : [0],
    songLength: songLength || 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: bpm,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout,
  };
}

function mapDBMEffect(cmd: number, param: number): { effTyp: number; effParam: number } {
  // DigiBooster uses same effect numbers as ProTracker for 0x0-0xF
  switch (cmd) {
    case 0x00: return { effTyp: 0x00, effParam: param };   // Arpeggio
    case 0x01: return { effTyp: 0x01, effParam: param };   // Portamento up
    case 0x02: return { effTyp: 0x02, effParam: param };   // Portamento down
    case 0x03: return { effTyp: 0x03, effParam: param };   // Tone portamento
    case 0x04: return { effTyp: 0x04, effParam: param };   // Vibrato
    case 0x05: return { effTyp: 0x05, effParam: param };   // Tone porta + vol slide
    case 0x06: return { effTyp: 0x06, effParam: param };   // Vibrato + vol slide
    case 0x07: return { effTyp: 0x07, effParam: param };   // Tremolo
    case 0x08: return { effTyp: 0x08, effParam: param };   // Set panning
    case 0x09: return { effTyp: 0x09, effParam: param };   // Sample offset
    case 0x0A: return { effTyp: 0x0A, effParam: param };   // Volume slide
    case 0x0B: return { effTyp: 0x0B, effParam: param };   // Position jump
    case 0x0C: return { effTyp: 0x0C, effParam: param };   // Set volume
    case 0x0D: return { effTyp: 0x0D, effParam: param };   // Pattern break
    case 0x0E: return { effTyp: 0x0E, effParam: param };   // Extended
    case 0x0F: return { effTyp: 0x0F, effParam: param };   // Set speed/tempo
    // DigiBooster extended effects 0x10-0x1F
    case 0x10: return { effTyp: 0x10, effParam: param };   // Set global volume
    case 0x11: return { effTyp: 0x11, effParam: param };   // Global volume slide
    default:   return { effTyp: 0, effParam: 0 };
  }
}

// ── Original DigiBooster 1.x parser ──────────────────────────────────────────
//
// Format: "DIGI Booster module\0" (20 bytes magic)
// Reference: NostalgicPlayer DigiBooster player + Multimedia.cx wiki
//
// Header layout:
//   0-19:  magic "DIGI Booster module\0"
//   20-23: version string ("V1.7")
//   24:    version byte (0x17 = v1.7)
//   25:    channels (1-8)
//   26:    packed flag (0=unpacked, 1=packed patterns)
//   46:    maxPattern (numPatterns = value + 1)
//   47:    songLength (value + 1)
//   48-175: orders[128]
//   176-299: sampleLengths[31] (u32 BE)
//   300-423: loopStarts[31] (u32 BE)
//   424-547: loopLengths[31] (u32 BE)
//   548-578: volumes[31] (u8)
//   579-609: fineTunes[31] (s8)
//   610-641: songName[32]
//   642-1571: sampleNames[31][30]
//   1572+: pattern data, then sample data

import { periodToNoteIndex } from './AmigaUtils';

function parseOriginalDigiBooster(buf: Uint8Array, filename: string): TrackerSong {
  const numChannels = buf[25] || 4;
  const packed = buf[26] !== 0;
  const numPatterns = (buf[46] & 0xff) + 1;
  const songLength = (buf[47] & 0xff) + 1;
  const versionByte = buf[24];

  // Orders
  const songPositions: number[] = [];
  for (let i = 0; i < songLength; i++) {
    songPositions.push(buf[48 + i]);
  }

  // Sample metadata (31 samples, all u32 BE)
  interface DigiSample {
    length: number;
    loopStart: number;
    loopLength: number;
    volume: number;
    fineTune: number;
    name: string;
  }
  const samples: DigiSample[] = [];
  for (let i = 0; i < 31; i++) {
    const length = u32(buf, 176 + i * 4);
    let loopStart = u32(buf, 300 + i * 4);
    let loopLength = u32(buf, 424 + i * 4);
    const volume = Math.min(64, buf[548 + i]);
    // FineTune: cleared for versions 0x10-0x13
    let fineTune = (buf[579 + i] << 24) >> 24; // sign-extend
    if (versionByte >= 0x10 && versionByte <= 0x13) fineTune = 0;

    // Validate loops
    if (loopStart > length || loopLength === 0) {
      loopStart = 0;
      loopLength = 0;
    } else if (loopStart + loopLength > length) {
      loopLength = length - loopStart;
    }

    const name = readStr(buf, 642 + i * 30, 30);
    samples.push({ length, loopStart, loopLength, volume, fineTune, name });
  }

  const songName = readStr(buf, 610, 32);

  // Pattern data starts at offset 1572
  let off = 1572;
  const trackerPatterns: Pattern[] = [];

  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    const rows = 64;
    // Each pattern: numChannels channels × 64 rows × 4 bytes
    // Unpacked: channels are interleaved (ch0-row0, ch1-row0, ..., ch0-row1, ...)
    //   Actually: channels 0-3 first (64 rows each), then channels 4-7

    const cells: Array<Array<{ period: number; sample: number; effect: number; param: number }>> = [];
    for (let ch = 0; ch < numChannels; ch++) cells.push([]);

    if (!packed) {
      // Unpacked: all channels sequentially, each channel has 64 rows × 4 bytes
      for (let ch = 0; ch < numChannels; ch++) {
        for (let row = 0; row < rows; row++) {
          if (off + 4 > buf.length) {
            cells[ch].push({ period: 0, sample: 0, effect: 0, param: 0 });
            continue;
          }
          const data = u32(buf, off); off += 4;
          const period = (data >>> 16) & 0x0fff;
          const sample = ((data >>> 24) & 0xf0) | ((data >>> 12) & 0x0f);
          const effect = (data >>> 8) & 0x0f;
          const param = data & 0xff;
          cells[ch].push({ period, sample, effect, param });
        }
      }
    } else {
      // Packed: u16 BE patternLength, then 64-byte bitmask, then variable data
      if (off + 2 > buf.length) break;
      const patLen = u16(buf, off); off += 2;
      const patEnd = off + patLen;

      // 64-byte bitmask: one byte per row, bits 7..0 = channels 0..7
      const bitmask: number[] = [];
      for (let row = 0; row < rows; row++) {
        bitmask.push(off < buf.length ? buf[off++] : 0);
      }

      // Initialize empty cells
      for (let ch = 0; ch < numChannels; ch++) {
        for (let row = 0; row < rows; row++) {
          cells[ch].push({ period: 0, sample: 0, effect: 0, param: 0 });
        }
      }

      // Read packed data
      for (let row = 0; row < rows; row++) {
        const mask = bitmask[row];
        for (let ch = 0; ch < numChannels; ch++) {
          const bit = 7 - ch; // bit 7 = ch0, bit 6 = ch1, etc.
          if (mask & (1 << bit)) {
            if (off + 4 > buf.length) continue;
            const data = u32(buf, off); off += 4;
            const period = (data >>> 16) & 0x0fff;
            const sample = ((data >>> 24) & 0xf0) | ((data >>> 12) & 0x0f);
            const effect = (data >>> 8) & 0x0f;
            const param = data & 0xff;
            cells[ch][row] = { period, sample, effect, param };
          }
        }
      }

      // Advance to end of pattern data
      off = Math.max(off, patEnd);
    }

    // Convert to TrackerSong pattern format
    const channels: ChannelData[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const channelCells: TrackerCell[] = cells[ch].map(c => {
        let note = 0;
        if (c.period > 0) {
          const noteIdx = periodToNoteIndex(c.period);
          note = noteIdx >= 0 ? noteIdx + 1 : 0;
        }
        const mapped = mapDBMEffect(c.effect, c.param);
        return {
          note,
          instrument: c.sample,
          volume: 0,
          effTyp: mapped.effTyp,
          eff: mapped.effParam,
          effTyp2: 0,
          eff2: 0,
        };
      });
      channels.push({
        id: `ch-${ch}`,
        name: `Ch ${ch + 1}`,
        rows: channelCells,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
      });
    }

    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: rows,
      channels,
      importMetadata: {
        sourceFormat: 'DIGI',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: 31,
      },
    });
  }

  // Sample data follows patterns
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < 31; i++) {
    const s = samples[i];
    const id = i + 1;
    if (s.length === 0) {
      instruments.push({
        id,
        name: s.name || `Sample ${id}`,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -6,
        pan: 0,
      } as unknown as InstrumentConfig);
      continue;
    }

    // Read PCM data (8-bit signed)
    const pcmLen = Math.min(s.length, buf.length - off);
    if (pcmLen <= 0) {
      instruments.push({
        id,
        name: s.name || `Sample ${id}`,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -6,
        pan: 0,
      } as unknown as InstrumentConfig);
      continue;
    }

    const pcm = new Uint8Array(pcmLen);
    for (let j = 0; j < pcmLen; j++) pcm[j] = buf[off + j];
    off += s.length;

    const hasLoop = s.loopLength > 2;
    const loopEnd = hasLoop ? s.loopStart + s.loopLength : 0;
    const inst = createSamplerInstrument(id, s.name || `Sample ${id}`, pcm, s.volume, 8287, s.loopStart, loopEnd);
    instruments.push(inst);
  }

  return {
    name: songName || filename.replace(/\.[^/.]+$/, ''),
    format: 'DIGI' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions,
    songLength,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
