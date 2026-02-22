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
  const dbPatterns: Array<{ rows: number; channels: number; data: Uint8Array }> = [];

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
          const data = buf.slice(poff, poff + dataBytes);
          poff += dataBytes;
          dbPatterns.push({ rows, channels: chans, data });
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
