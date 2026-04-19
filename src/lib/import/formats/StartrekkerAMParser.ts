/**
 * StartrekkerAMParser.ts — StarTrekker AM format parser
 *
 * StarTrekker AM is a two-file format:
 *   - .mod or .adsc file: standard ProTracker MOD (FLT4/FLT8 signature)
 *   - .nt companion file: AM synthesis instrument definitions
 *     Header: "ST1.2 ModuleINFO" (16 bytes) + 8 bytes padding = 24 bytes
 *     Then up to 31 instruments × 120 bytes each.
 *     Instrument with "AM" magic (0x414D at offset 0) = AM synthesis instrument.
 *
 * Audio playback: StartrekkerAMEngine WASM (C port of StarTrekker_v1.2_AM.s)
 * This parser extracts: metadata, full instrument list, pattern data for display.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { StartrekkerAMConfig } from '@/types/instrument/exotic';
import { createSamplerInstrument } from './AmigaUtils';

const NT_MAGIC_V12 = 'ST1.2 ModuleINFO';
const NT_MAGIC_V13 = 'ST1.3 ModuleINFO';
const AM_MAGIC = 0x414D;  // "AM"

function r16(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function rs16(buf: Uint8Array, off: number): number {
  const v = r16(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function parseNTInstrument(ntBuf: Uint8Array, instrIndex: number): StartrekkerAMConfig | null {
  const base = 24 + instrIndex * 120;
  if (base + 36 > ntBuf.length) return null;
  if (r16(ntBuf, base) !== AM_MAGIC) return null;
  return {
    waveform: r16(ntBuf, base + 26) & 0x03,
    basePeriod: r16(ntBuf, base + 6),
    attackTarget: rs16(ntBuf, base + 8),
    attackRate: rs16(ntBuf, base + 10),
    attack2Target: rs16(ntBuf, base + 12),
    attack2Rate: rs16(ntBuf, base + 14),
    decayTarget: rs16(ntBuf, base + 16),
    decayRate: rs16(ntBuf, base + 18),
    sustainCount: r16(ntBuf, base + 20),
    releaseRate: rs16(ntBuf, base + 24),
    vibFreqStep: r16(ntBuf, base + 28),
    vibAmplitude: rs16(ntBuf, base + 30),
    periodShift: r16(ntBuf, base + 34),
  };
}

// ProTracker period table for note lookup
const PERIOD_TABLE = [
  856,808,762,720,678,640,604,570,538,508,480,453,
  428,404,381,360,339,320,302,285,269,254,240,226,
  214,202,190,180,170,160,151,143,135,127,120,113,
];

function periodToNote(period: number): number {
  if (period === 0) return 0;
  // Find closest period in table; note number = index + 1 (1-based)
  let best = 0;
  let bestDist = 99999;
  for (let i = 0; i < PERIOD_TABLE.length; i++) {
    const dist = Math.abs(PERIOD_TABLE[i] - period);
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best + 1;  // 1-based note
}

/** Verify NT file has the correct 16-byte header.
 *  StarTrekker AM ships in multiple revisions — v1.2 and v1.3 differ only in
 *  the version byte and the modland archive contains both. Both use the same
 *  24-byte prefix layout + 120-byte instrument records, so we accept either. */
export function isStartrekkerNT(data: ArrayBuffer | Uint8Array): boolean {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (buf.length < 24) return false;
  const hdr = String.fromCharCode(...buf.slice(0, 16));
  return hdr === NT_MAGIC_V12 || hdr === NT_MAGIC_V13;
}

/**
 * Parse a StarTrekker AM module.
 *
 * @param modBuffer  The .mod/.adsc file
 * @param filename   Original filename (used for title extraction)
 * @param ntBuffer   Optional NT companion file (if already loaded)
 */
export function parseStartrekkerAMFile(
  modBuffer: ArrayBuffer,
  filename: string,
  ntBuffer?: ArrayBuffer | null,
): TrackerSong {
  const modBuf = new Uint8Array(modBuffer);

  // Extract MOD title (first 20 bytes, ASCII)
  let title = '';
  for (let i = 0; i < 20; i++) {
    const c = modBuf[i];
    if (c === 0) break;
    if (c >= 32 && c < 127) title += String.fromCharCode(c);
  }
  title = title.trim();
  if (!title) {
    const baseName = filename.split('/').pop() ?? filename;
    title = baseName.replace(/\.(adsc|mod)$/i, '');
  }

  // Parse NT instrument info if available
  const ntBuf = ntBuffer && ntBuffer.byteLength >= 24 ? new Uint8Array(ntBuffer) : null;

  // Count patterns to find where sample data starts
  let maxPat = 0;
  if (modBuf.length >= 0x3B8 + 128) {
    for (let i = 0; i < 128; i++) {
      if (modBuf[0x3B8 + i] > maxPat) maxPat = modBuf[0x3B8 + i];
    }
  }
  const numPatternsForSamples = maxPat + 1;
  const sampleDataStart = 0x43C + numPatternsForSamples * 1024;

  // Build sample start offset table (cumulative sum of sample lengths)
  const sampleStarts: number[] = [];
  let sampleOff = sampleDataStart;
  for (let i = 0; i < 31; i++) {
    sampleStarts.push(sampleOff);
    const dataBase = 0x14 + i * 30 + 22;  // skip 22-byte name
    if (dataBase + 2 <= modBuf.length) {
      sampleOff += r16(modBuf, dataBase) * 2;  // length in words → bytes
    }
  }

  // Build instrument list from MOD header (31 instruments)
  const instruments: InstrumentConfig[] = [];
  const AMIGA_SAMPLE_RATE = 8287;  // ~C-3 at period 428: 3546895 / 428 ≈ 8287 Hz

  for (let i = 0; i < 31; i++) {
    const hdrBase = 0x14 + i * 30;
    if (hdrBase + 30 > modBuf.length) break;

    // Read 22-byte instrument name
    let name = '';
    for (let j = 0; j < 22; j++) {
      const c = modBuf[hdrBase + j];
      if (c >= 32 && c < 127) name += String.fromCharCode(c);
      else if (c === 0 && name.length > 0) break;
    }
    name = name.trim();

    // Read sample data fields (offset 22 within header)
    const dataBase = hdrBase + 22;
    const sampleLen = r16(modBuf, dataBase);     // length in words
    const volume = modBuf[dataBase + 3];          // volume byte (0-64)
    const loopStart = r16(modBuf, dataBase + 4);  // loop start in words
    const loopLen = r16(modBuf, dataBase + 6);    // loop length in words

    // Check if this is an AM instrument in the NT file
    let isAM = false;
    let wfName = '';
    if (ntBuf) {
      const ntBase = 24 + (i + 1) * 120;  // 1-indexed in NT file
      if (ntBase + 2 <= ntBuf.length) {
        const magic = r16(ntBuf, ntBase);
        if (magic === AM_MAGIC) {
          isAM = true;
          const wfNum = ntBase + 26 < ntBuf.length ? r16(ntBuf, ntBase + 26) & 0x03 : 0;
          wfName = ['Sine', 'Sawtooth', 'Square', 'Noise'][wfNum] ?? 'Sine';
        }
      }
    }

    // Skip instruments with no name and no sample data
    if (!name && sampleLen === 0 && !isAM) continue;

    if (!name) {
      name = isAM ? `AM ${wfName} ${i + 1}` : `Sample ${i + 1}`;
    }

    if (isAM) {
      // AM synthesis instrument — use the AM controls editor
      const amConfig = ntBuf ? parseNTInstrument(ntBuf, i + 1) : undefined;
      instruments.push({
        id: i + 1,
        name: `AM ${wfName} ${i + 1}`,
        type: 'synth' as const,
        synthType: 'StartrekkerAMSynth' as const,
        effects: [],
        volume: 100,
        pan: 0,
        ...(amConfig ? { startrekkerAM: amConfig } : {}),
      });
    } else {
      // PCM sample instrument — extract sample data and use the sample editor
      const sampleBytes = sampleLen * 2;
      const start = sampleStarts[i];
      const end = Math.min(start + sampleBytes, modBuf.length);
      const pcm = modBuf.subarray(start, end);

      if (pcm.length > 0) {
        const loopStartBytes = loopStart * 2;
        const loopEndBytes = loopLen > 1 ? (loopStart + loopLen) * 2 : 0;
        const inst = createSamplerInstrument(
          i + 1, name, new Uint8Array(pcm), volume, AMIGA_SAMPLE_RATE,
          loopStartBytes, loopEndBytes,
        );
        instruments.push(inst);
      } else {
        instruments.push({
          id: i + 1,
          name,
          type: 'sample' as const,
          synthType: 'Sampler' as const,
          effects: [],
          volume: Math.min(volume, 64) * 100 / 64,
          pan: 0,
        });
      }
    }
  }

  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'Song Preview',
      type: 'synth' as const,
      synthType: 'StartrekkerAMSynth' as const,
      effects: [],
      volume: 100,
      pan: 0,
    });
  }

  // Count patterns from the MOD order table
  let numPatterns = 1;
  if (modBuf.length >= 0x3B8 + 128) {
    let maxPat = 0;
    for (let i = 0; i < 128; i++) {
      if (modBuf[0x3B8 + i] > maxPat) maxPat = modBuf[0x3B8 + i];
    }
    numPatterns = maxPat + 1;
  }

  // Parse actual pattern data from the MOD file
  // Pattern data starts at 0x43C, each pattern = 64 rows × 4 channels × 4 bytes = 1024 bytes
  const patternDataStart = 0x43C;
  const patterns = Array.from({ length: numPatterns }, (_, pi) => {
    const patBase = patternDataStart + pi * 1024;
    const channels = Array.from({ length: 4 }, (_, ch) => {
      const rows = Array.from({ length: 64 }, (__, row) => {
        const cellOff = patBase + row * 16 + ch * 4;
        if (cellOff + 4 > modBuf.length) {
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }
        const b0 = modBuf[cellOff];
        const b1 = modBuf[cellOff + 1];
        const b2 = modBuf[cellOff + 2];
        const b3 = modBuf[cellOff + 3];

        // Standard ProTracker cell format
        const period = ((b0 & 0x0F) << 8) | b1;
        const instr = (b0 & 0xF0) | (b2 >> 4);
        const effCmd = b2 & 0x0F;
        const effParam = b3;

        const note = periodToNote(period);

        return {
          note,
          instrument: instr,
          volume: 0,
          effTyp: effCmd,
          eff: effParam,
          effTyp2: 0,
          eff2: 0,
        };
      });
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows,
      };
    });
    return {
      id: `pattern-${pi}`,
      name: `Pattern ${pi}`,
      length: 64,
      channels,
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: instruments.length,
      },
    };
  });

  // Song order table
  const songLen = modBuf.length >= 0x3B7 ? modBuf[0x3B6] : 1;
  const songPositions: number[] = [];
  for (let i = 0; i < Math.min(songLen, 128); i++) {
    songPositions.push(modBuf[0x3B8 + i] ?? 0);
  }
  if (songPositions.length === 0) songPositions.push(0);

  const song: TrackerSong = {
    name: `${title} [StarTrekker AM]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: modBuf.length >= 0x3B8 ? (modBuf[0x3B7] ?? 0) : 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: modBuffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    startrekkerAMFileData: modBuffer.slice(0),
    startrekkerAMNtData: ntBuffer ? ntBuffer.slice(0) : undefined,
  };

  return song;
}
