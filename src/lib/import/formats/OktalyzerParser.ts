/**
 * OktalyzerParser.ts — IFF-based Oktalyzer (.okt) format parser
 *
 * Oktalyzer is an 8-channel Amiga tracker that uses IFF (Interchange File Format)
 * for its file structure. It was popular on the Amiga in the early 1990s.
 *
 * File structure: FORM/OKTA IFF container with chunks:
 *   CMOD — 4 words: channel pair modes (0=stereo, 1=mono-left, 2=mono-right)
 *   SAMP — Sample headers (32 bytes each): name[20], length[4], loopStart[4], loopEnd[4], pad[2], volume[2]
 *   SPEE — Tempo (word)
 *   SLEN — Song length (word)
 *   PLEN — Pattern count (word)
 *   PATT — Song sequence (SLEN bytes)
 *   PBOD — Pattern body (one per pattern): 4 bytes per row-channel: note, sample, cmd, data
 *   SBOD — Sample PCM data (one chunk per sample, 8-bit signed)
 *
 * Reference: https://wiki.multimedia.cx/index.php/Oktalyzer
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { amigaNoteToXM, createSamplerInstrument } from './AmigaUtils';

const TEXT_DECODER = new TextDecoder('iso-8859-1');

function readStr(buf: Uint8Array, offset: number, len: number): string {
  let end = offset;
  while (end < offset + len && buf[end] !== 0) end++;
  return TEXT_DECODER.decode(buf.subarray(offset, end));
}

function readU16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function readU32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

interface OKTSample {
  name: string;
  length: number;
  loopStart: number;
  loopEnd: number;
  volume: number;
  pcm: Uint8Array | null;
}

interface OKTPattern {
  rows: number;
  channels: number;
  cells: number[][];   // [row][ch] → [note, sample, cmd, data]
}

export function parseOktalyzerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  // Verify FORM/OKTA header
  const formId = TEXT_DECODER.decode(buf.subarray(0, 4));
  const typeId = TEXT_DECODER.decode(buf.subarray(8, 12));
  if (formId !== 'FORM' || typeId !== 'OKTA') {
    throw new Error(`Not a valid Oktalyzer file (expected FORM/OKTA, got ${formId}/${typeId})`);
  }

  let offset = 12;
  const fileSize = buf.byteLength;

  // ── Parse IFF chunks ─────────────────────────────────────────────────────
  let channelModes: number[] = [0, 0, 0, 0];
  const samples: OKTSample[] = [];
  let speed = 6;
  let songLength = 0;
  let patternCount = 0;
  const sequence: number[] = [];
  const patterns: OKTPattern[] = [];
  const samplePcmQueue: Uint8Array[] = [];

  while (offset + 8 <= fileSize) {
    const chunkId = TEXT_DECODER.decode(buf.subarray(offset, offset + 4));
    const chunkSize = readU32BE(buf, offset + 4);
    const dataStart = offset + 8;
    offset += 8 + chunkSize;
    if (chunkSize & 1) offset++; // IFF chunks are word-aligned

    switch (chunkId) {
      case 'CMOD': {
        // 4 words: modes for channel pairs
        for (let i = 0; i < 4 && i * 2 + 1 < chunkSize; i++) {
          channelModes[i] = readU16BE(buf, dataStart + i * 2);
        }
        break;
      }

      case 'SAMP': {
        // 32 bytes per sample
        const sampCount = Math.floor(chunkSize / 32);
        for (let i = 0; i < sampCount; i++) {
          const base = dataStart + i * 32;
          const name = readStr(buf, base, 20);
          const length = readU32BE(buf, base + 20);
          const loopStart = readU32BE(buf, base + 24);
          const loopEnd = readU32BE(buf, base + 28);
          const volume = readU16BE(buf, base + 30);
          samples.push({ name, length, loopStart, loopEnd, volume, pcm: null });
        }
        break;
      }

      case 'SPEE': {
        speed = readU16BE(buf, dataStart);
        break;
      }

      case 'SLEN': {
        songLength = readU16BE(buf, dataStart);
        break;
      }

      case 'PLEN': {
        patternCount = readU16BE(buf, dataStart);
        break;
      }

      case 'PATT': {
        // Song sequence: songLength bytes
        for (let i = 0; i < songLength && i < chunkSize; i++) {
          sequence.push(buf[dataStart + i]);
        }
        break;
      }

      case 'PBOD': {
        // Pattern body: 2-byte numRows, then rows * 8 channels * 4 bytes
        const numRows = readU16BE(buf, dataStart);
        const numChans = 8; // Oktalyzer always has 8 channels
        const cells: number[][] = [];

        for (let row = 0; row < numRows; row++) {
          const rowCells: number[] = [];
          for (let ch = 0; ch < numChans; ch++) {
            const cellBase = dataStart + 2 + row * numChans * 4 + ch * 4;
            const note = buf[cellBase];
            const sample = buf[cellBase + 1];
            const cmd = buf[cellBase + 2];
            const data = buf[cellBase + 3];
            rowCells.push(note, sample, cmd, data);
          }
          cells.push(rowCells);
        }

        patterns.push({ rows: numRows, channels: numChans, cells });
        break;
      }

      case 'SBOD': {
        // Sample PCM data — raw 8-bit signed, one chunk per sample
        samplePcmQueue.push(buf.slice(dataStart, dataStart + chunkSize));
        break;
      }

      default:
        break;
    }
  }

  // Assign PCM data to samples (in order)
  for (let i = 0; i < samples.length && i < samplePcmQueue.length; i++) {
    samples[i].pcm = samplePcmQueue[i];
  }

  // ── Build instruments ────────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = samples.map((samp, i) => {
    const pcm = samp.pcm ?? new Uint8Array(samp.length);
    return createSamplerInstrument(
      i + 1,
      samp.name,
      pcm,
      samp.volume,
      8287,          // Amiga C-3 sample rate (Paula standard)
      samp.loopStart,
      samp.loopEnd
    );
  });

  // ── Build patterns ───────────────────────────────────────────────────────
  const trackerPatterns: Pattern[] = patterns.map((pat, patIdx) => {
    const channels: ChannelData[] = Array.from({ length: pat.channels }, (_, ch) => {
      const rows: TrackerCell[] = pat.cells.map(rowCells => {
        const base = ch * 4;
        const rawNote = rowCells[base];
        const sampleNum = rowCells[base + 1];
        const cmd = rowCells[base + 2];
        const data = rowCells[base + 3];

        // Map Oktalyzer effect commands to XM effects
        const { effTyp, eff } = mapOKTEffect(cmd, data);

        return {
          note: amigaNoteToXM(rawNote),
          instrument: sampleNum,
          volume: 0,
          effTyp,
          eff,
        };
      });

      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch < 4 ? -25 : 25,  // LRRL LRRL panning like ProTracker
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
        sourceFormat: 'OKT' as TrackerFormat,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: pat.channels,
        originalPatternCount: patternCount,
        originalInstrumentCount: samples.length,
      },
    };
  });

  // Build song order
  const songPositions = sequence.slice(0, songLength);

  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: 'OKT' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions: songPositions.length > 0 ? songPositions : [0],
    songLength: songPositions.length || 1,
    restartPosition: 0,
    numChannels: 8,
    initialSpeed: speed,
    initialBPM: 125,
    linearPeriods: false,
  };
}

/** Map Oktalyzer effect commands to XM-compatible effect codes */
function mapOKTEffect(cmd: number, data: number): { effTyp: number; eff: number } {
  switch (cmd) {
    case 0:  return { effTyp: 0, eff: 0 };           // No effect
    case 1:  return { effTyp: 0x0F, eff: data };      // Set speed
    case 2:  return { effTyp: 0x0B, eff: data };      // Position jump
    case 10: return { effTyp: 0x0C, eff: data };      // Set volume
    case 11: return { effTyp: 0x01, eff: data };      // Portamento up
    case 12: return { effTyp: 0x02, eff: data };      // Portamento down
    case 13: return { effTyp: 0x03, eff: data };      // Tone portamento
    case 17: return { effTyp: 0x0A, eff: data };      // Volume slide
    case 30: return { effTyp: 0x0E, eff: (0xC << 4) | (data & 0xF) }; // Cut note (EC)
    default: return { effTyp: 0, eff: 0 };
  }
}
