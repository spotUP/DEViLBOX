/**
 * XMParser Tests
 * Tests for native XM binary parser
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseXM, isXMFormat, parseXMFile } from '../formats/XMParser';

describe('XMParser', () => {
  describe('Header Parsing', () => {
    it('should parse XM header correctly', async () => {
      // Create minimal valid XM file
      const buffer = createMinimalXM();
      const result = await parseXM(buffer);

      expect(result.header).toBeDefined();
      expect(result.header.moduleName).toBe('Test Module');
      expect(result.header.trackerName).toBe('DEViLBOX');
      expect(result.header.channelCount).toBe(4);
      expect(result.header.patternCount).toBe(1);
      expect(result.header.instrumentCount).toBe(1);
    });

    it('should reject invalid XM signature', async () => {
      const buffer = new ArrayBuffer(100);
      const view = new Uint8Array(buffer);
      // Write invalid signature
      const invalidSig = 'Invalid Header: ';
      for (let i = 0; i < invalidSig.length; i++) {
        view[i] = invalidSig.charCodeAt(i);
      }

      await expect(parseXM(buffer)).rejects.toThrow('Invalid XM file: incorrect header signature');
    });

    it('should handle XM files with tracker version info', async () => {
      const buffer = createMinimalXM({ version: 0x0104 });
      const result = await parseXM(buffer);

      expect(result.header.trackerName).toBeDefined(); // Check header was parsed
    });
  });

  describe('Pattern Parsing', () => {
    it('should parse pattern with notes', async () => {
      const buffer = createXMWithPattern({
        rows: [
          { note: 49, instrument: 1, volume: 0x40, effect: 'A0F' }, // C-4, inst 1, vol 64, vol slide
        ],
      });
      const result = await parseXM(buffer);

      expect(result.patterns[0][0][0].note).toBe(49); // C-4
      expect(result.patterns[0][0][0].instrument).toBe(1);
      expect(result.patterns[0][0][0].volume).toBe(0x40);
      expect(result.patterns[0][0][0].effectType).toBe(0xA); // Effect command
    });

    it('should handle empty rows', async () => {
      const buffer = createXMWithPattern({ rows: [] });
      const result = await parseXM(buffer);

      // Should have 64 rows (default pattern length)
      expect(result.patterns[0].length).toBe(64);
      // First row should be empty
      expect(result.patterns[0][0][0].note).toBe(0);
    });

    it('should decompress bit-flag pattern data', async () => {
      // XM patterns use bit-flag compression
      const buffer = createXMWithCompressedPattern();
      const result = await parseXM(buffer);

      expect(result.patterns[0].length).toBeGreaterThan(0);
    });
  });

  describe('Instrument Parsing', () => {
    it('should parse instrument with samples', async () => {
      const buffer = createXMWithInstrument({
        name: 'Test Sample',
        sampleCount: 1,
        samples: [
          {
            length: 1000,
            loopStart: 0,
            loopLength: 100,
            volume: 64,
            finetune: 0,
            loopType: 'forward',
            panning: 128,
            relativeNote: 0,
            bitDepth: 8,
          },
        ],
      });
      const result = await parseXM(buffer);

      expect(result.instruments[0].name).toBe('Test Sample');
      expect(result.instruments[0].samples.length).toBe(1);
      expect(result.instruments[0].samples[0].length).toBe(1000);
      expect(result.instruments[0].samples[0].loopType).toBe('forward');
    });

    it('should parse volume envelope', async () => {
      const buffer = createXMWithInstrument({
        name: 'Envelope Test',
        volumeEnvelope: {
          enabled: true,
          points: [
            { tick: 0, value: 0 },
            { tick: 10, value: 64 },
            { tick: 50, value: 32 },
            { tick: 100, value: 0 },
          ],
          sustainPoint: 2,
          loopStartPoint: null,
          loopEndPoint: null,
        },
      });
      const result = await parseXM(buffer);

      const env = result.instruments[0]?.volumeEnvelope;
      expect(env?.enabled).toBe(true);
      expect(env?.points.length).toBe(4);
      expect(env?.points[1]).toEqual({ tick: 10, value: 64 });
      expect(env?.sustainPoint).toBe(2);
    });

    it('should parse auto-vibrato settings', async () => {
      const buffer = createXMWithInstrument({
        name: 'Vibrato Test',
        autoVibrato: {
          type: 'sine',
          sweep: 10,
          depth: 8,
          rate: 4,
        },
      });
      const result = await parseXM(buffer);

      const vibrato = result.instruments[0]?.autoVibrato;
      expect(vibrato?.type).toBe('sine');
      expect(vibrato?.depth).toBe(8);
      expect(vibrato?.rate).toBe(4);
    });

    it('should handle delta-encoded samples', async () => {
      const buffer = createXMWithDeltaEncodedSample();
      const result = await parseXM(buffer);

      // Delta encoding should be decoded to PCM
      const sample = result.instruments[0].samples[0];
      expect(sample.pcmData).toBeInstanceOf(ArrayBuffer);
      expect(sample.pcmData.byteLength).toBeGreaterThan(0);
    });

    it('should handle 16-bit samples', async () => {
      const buffer = createXMWithInstrument({
        name: '16-bit Sample',
        samples: [
          {
            length: 1000,
            bitDepth: 16,
            loopType: 'none',
            volume: 64,
            panning: 128,
          },
        ],
      });
      const result = await parseXM(buffer);

      expect(result.instruments[0].samples[0].bitDepth).toBe(16);
    });
  });

  describe('Import Metadata', () => {
    it('should generate import metadata', async () => {
      const buffer = createMinimalXM();
      const result = await parseXM(buffer);

      expect(result.metadata.sourceFormat).toBe('XM');
      expect(result.metadata.originalChannelCount).toBe(4);
      expect(result.metadata.originalPatternCount).toBe(1);
      expect(result.metadata.originalInstrumentCount).toBe(1);
      expect(result.metadata.modData).toBeDefined();
      expect(result.metadata.modData?.initialSpeed).toBe(6);
      expect(result.metadata.modData?.initialBPM).toBe(125);
    });

    it('should preserve original sample data in metadata', async () => {
      const buffer = createXMWithInstrument({
        name: 'Sample 1',
        samples: [
          {
            length: 500,
            bitDepth: 8,
            volume: 50,
            loopType: 'forward',
            loopStart: 0,
            loopLength: 100,
          },
        ],
      });
      const result = await parseXM(buffer);

      // XM samples get id = instrument index + 1 (1-indexed), so first instrument → key 1
      const preserved = result.metadata.originalSamples?.[1];
      expect(preserved).toBeDefined();
      expect(preserved?.name).toBe('Sample 1');
      expect(preserved?.length).toBe(500);
      expect(preserved?.bitDepth).toBe(8);
    });
  });

  describe('Edge Cases', () => {
    it('should handle XM with no instruments', async () => {
      const buffer = createMinimalXM({ instrumentCount: 0 });
      const result = await parseXM(buffer);

      expect(result.instruments.length).toBe(0);
    });

    it('should handle XM with max channels (32)', async () => {
      const buffer = createMinimalXM({ channelCount: 32 });
      const result = await parseXM(buffer);

      expect(result.header.channelCount).toBe(32);
    });

    it('should handle XM with max patterns (256)', async () => {
      const buffer = createMinimalXM({ patternCount: 256 });
      const result = await parseXM(buffer);

      expect(result.header.patternCount).toBe(256);
    });

    it('should handle truncated XM file gracefully', async () => {
      const buffer = new ArrayBuffer(50); // Too small for valid XM
      const view = new Uint8Array(buffer);
      const sig = 'Extended Module: ';
      for (let i = 0; i < sig.length; i++) {
        view[i] = sig.charCodeAt(i);
      }

      await expect(parseXM(buffer)).rejects.toThrow();
    });
  });
});

// Helper functions to create test XM data
function createMinimalXM(options: {
  moduleName?: string;
  version?: number;
  channelCount?: number;
  patternCount?: number;
  instrumentCount?: number;
} = {}): ArrayBuffer {
  // Create a minimal valid XM file structure
  const {
    moduleName = 'Test Module',
    version = 0x0104,
    channelCount = 4,
    patternCount = 1,
    instrumentCount = 1,
  } = options;

  // Calculate sizes
  // XM header: 60 bytes base + 276 bytes extended header (incl. pattern order) = 336 bytes
  const headerSize = 336;
  const patternHeaderSize = 9;
  const patternDataSize = channelCount * 64; // 1 byte per cell (empty flag 0x80)
  const patternTotalSize = patternHeaderSize + patternDataSize;
  const instrumentSize = 29; // Minimal instrument header with 0 samples

  const totalSize = headerSize + (patternTotalSize * patternCount) + (instrumentSize * instrumentCount);
  const buffer = new ArrayBuffer(totalSize);
  const view = new Uint8Array(buffer);
  const dataView = new DataView(buffer);

  // Write "Extended Module: " signature
  const sig = 'Extended Module: ';
  for (let i = 0; i < sig.length; i++) {
    view[i] = sig.charCodeAt(i);
  }

  // Module name (20 bytes at offset 17)
  for (let i = 0; i < 20 && i < moduleName.length; i++) {
    view[17 + i] = moduleName.charCodeAt(i);
  }

  // 0x1A at offset 37
  view[37] = 0x1A;

  // Tracker name (20 bytes at offset 38)
  const trackerName = 'DEViLBOX';
  for (let i = 0; i < trackerName.length; i++) {
    view[38 + i] = trackerName.charCodeAt(i);
  }

  // Version (2 bytes at offset 58)
  dataView.setUint16(58, version, true);

  // Header size (4 bytes at offset 60) - 276 bytes from offset 60 to end of pattern order
  dataView.setUint32(60, 276, true);

  // Song length (2 bytes at offset 64)
  dataView.setUint16(64, 1, true);

  // Restart position (2 bytes at offset 66)
  dataView.setUint16(66, 0, true);

  // Channel count (2 bytes at offset 68)
  dataView.setUint16(68, channelCount, true);

  // Pattern count (2 bytes at offset 70)
  dataView.setUint16(70, patternCount, true);

  // Instrument count (2 bytes at offset 72)
  dataView.setUint16(72, instrumentCount, true);

  // Flags (2 bytes at offset 74) - 1 = linear frequency table
  dataView.setUint16(74, 1, true);

  // Default tempo (2 bytes at offset 76)
  dataView.setUint16(76, 6, true);

  // Default BPM (2 bytes at offset 78)
  dataView.setUint16(78, 125, true);

  // Pattern order table (256 bytes starting at offset 80)
  for (let i = 0; i < 256; i++) {
    view[80 + i] = i < patternCount ? i : 0;
  }

  // Patterns start after header (offset = 60 + headerSize = 60 + 276 = 336)
  let offset = 336;
  for (let p = 0; p < patternCount; p++) {
    // Pattern header length (4 bytes)
    dataView.setUint32(offset, patternHeaderSize, true);
    // Packing type (1 byte) - 0 = default
    dataView.setUint8(offset + 4, 0);
    // Number of rows (2 bytes)
    dataView.setUint16(offset + 5, 64, true);
    // Packed pattern data size (2 bytes)
    dataView.setUint16(offset + 7, patternDataSize, true);

    // Pattern data - all cells are 0x80 (empty note flag)
    for (let i = 0; i < patternDataSize; i++) {
      view[offset + patternHeaderSize + i] = 0x80;
    }
    offset += patternTotalSize;
  }

  // Instruments
  for (let i = 0; i < instrumentCount; i++) {
    // Instrument header size (4 bytes)
    dataView.setUint32(offset, instrumentSize, true);
    // Instrument name (22 bytes at offset + 4)
    const instName = `Instrument ${i + 1}`;
    for (let j = 0; j < Math.min(instName.length, 22); j++) {
      view[offset + 4 + j] = instName.charCodeAt(j);
    }
    // Instrument type (1 byte at offset + 26)
    view[offset + 26] = 0;
    // Number of samples (2 bytes at offset + 27)
    dataView.setUint16(offset + 27, 0, true);
    offset += instrumentSize;
  }

  return buffer;
}

interface XMRowOptions {
  note?: number;
  instrument?: number;
  volume?: number;
  effect?: string; // e.g. 'A0F'
}

function createXMWithPattern(options: { rows: XMRowOptions[] }): ArrayBuffer {
  const channelCount = 4;
  const rowCount = 64;

  // Build uncompressed pattern data: 5 bytes per cell per row
  // Row 0 = provided rows[0] (channel 0), all other cells are empty 5-byte sequences
  const cellsPerRow = channelCount;
  const patternData = new Uint8Array(rowCount * cellsPerRow * 5);

  for (let row = 0; row < Math.min(options.rows.length, rowCount); row++) {
    const r = options.rows[row];
    let eff = 0, param = 0;
    if (r.effect && r.effect.length >= 3) {
      eff = parseInt(r.effect[0], 16);
      param = parseInt(r.effect.slice(1), 16);
    }
    const base = (row * cellsPerRow + 0) * 5;
    patternData[base]     = r.note ?? 0;
    patternData[base + 1] = r.instrument ?? 0;
    patternData[base + 2] = r.volume ?? 0;
    patternData[base + 3] = eff;
    patternData[base + 4] = param;
  }

  const headerSize = 336; // 60 + 276
  const patHeaderSize = 9;
  const instrumentSize = 29;

  const buffer = new ArrayBuffer(headerSize + patHeaderSize + patternData.length + instrumentSize);
  const view = new Uint8Array(buffer);
  const dv = new DataView(buffer);

  // Copy minimal XM header
  const minXM = createMinimalXM({ patternCount: 0, instrumentCount: 1 });
  const minView = new Uint8Array(minXM);
  // Copy just the 336-byte header portion
  for (let i = 0; i < 336; i++) view[i] = minView[i];

  // Pattern count = 1
  dv.setUint16(70, 1, true);

  // Write pattern header at offset 336
  let off = 336;
  dv.setUint32(off, patHeaderSize, true);     // headerLength
  view[off + 4] = 0;                          // packingType
  dv.setUint16(off + 5, rowCount, true);      // rowCount
  dv.setUint16(off + 7, patternData.length, true); // packedDataSize
  off += patHeaderSize;

  // Write pattern data
  for (let i = 0; i < patternData.length; i++) view[off + i] = patternData[i];
  off += patternData.length;

  // Minimal instrument (0 samples)
  dv.setUint32(off, instrumentSize, true);
  const instName = 'Instrument 1';
  for (let i = 0; i < instName.length; i++) view[off + 4 + i] = instName.charCodeAt(i);

  return buffer;
}

interface XMSampleOptions {
  length?: number;
  loopStart?: number;
  loopLength?: number;
  volume?: number;
  finetune?: number;
  loopType?: 'none' | 'forward' | 'pingpong';
  panning?: number;
  relativeNote?: number;
  bitDepth?: 8 | 16;
  name?: string;
}

interface XMInstrumentOptions {
  name?: string;
  sampleCount?: number;
  samples?: XMSampleOptions[];
  volumeEnvelope?: {
    enabled: boolean;
    points: Array<{ tick: number; value: number }>;
    sustainPoint: number | null;
    loopStartPoint: number | null;
    loopEndPoint: number | null;
  };
  autoVibrato?: {
    type: 'sine' | 'square' | 'rampDown' | 'rampUp';
    sweep: number;
    depth: number;
    rate: number;
  };
}

function createXMWithInstrument(options: XMInstrumentOptions): ArrayBuffer {
  const instName = options.name ?? 'Test Instrument';
  const explicitSamples = options.samples ?? [];
  const volEnv = options.volumeEnvelope;
  const vib = options.autoVibrato;

  // XM parser only reads envelope/vibrato when sampleCount > 0, so force at least
  // 1 sample when caller requests envelope or vibrato data without explicit samples.
  const needSampleBlock = volEnv !== undefined || vib !== undefined || explicitSamples.length > 0;
  const sampleCount = options.sampleCount ?? (needSampleBlock ? Math.max(1, explicitSamples.length) : 0);
  const samples: XMSampleOptions[] = explicitSamples.length > 0 ? explicitSamples
    : sampleCount > 0 ? [{ length: 0 }]
    : [];

  // XM instrument header layout (when sampleCount > 0):
  // offset 0:  headerSize uint32 = 263 (points to start of sample headers)
  // offset 4:  name 22 bytes
  // offset 26: type uint8
  // offset 27: sampleCount uint16
  // offset 29: sampleHeaderSize uint32 = 40
  // offset 33: sampleMap 96 bytes
  // offset 129: vol env points 48 bytes (12 × {uint16 tick, uint16 value})
  // offset 177: pan env points 48 bytes
  // offset 225: numVolPoints uint8  ← readEnvelope reads offset+48 for this
  // offset 226: volSustainPoint uint8
  // offset 227: vibratoType uint8
  // offset 228: vibratoSweep uint8
  // offset 229: vibratoDepth uint8
  // offset 230: vibratoRate uint8
  // offset 231: fadeout uint16
  // offset 233: reserved 22 bytes
  // offset 255: numPanPoints uint8 — NOT USED (parser reads from offset 177+48=225)
  // offset 256: panSustainPoint uint8
  // Total instrument header = 263 bytes, then 40-byte sample headers follow

  const instHeaderSize = sampleCount > 0 ? 263 : 29;
  const sampleHeaderSize = 40;

  // Compute per-sample data sizes
  const sampleDataSizes = samples.map(s => s.length ?? 0);
  const totalSampleData = sampleDataSizes.reduce((a, b) => a + b, 0);

  const instTotalSize = instHeaderSize + sampleCount * sampleHeaderSize + totalSampleData;
  const xmHeaderSize = 336;
  // 1 minimal pattern
  const patDataSize = 4 * 64; // 4 channels × 64 rows × 1-byte compressed empty
  const patTotalSize = 9 + patDataSize;

  const totalSize = xmHeaderSize + patTotalSize + instTotalSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new Uint8Array(buffer);
  const dv = new DataView(buffer);

  // Copy minimal XM header base (we'll overwrite some fields)
  const minXM = createMinimalXM({ patternCount: 1, instrumentCount: 0 });
  const minView = new Uint8Array(minXM);
  for (let i = 0; i < 336; i++) view[i] = minView[i];

  // Set instrumentCount = 1
  dv.setUint16(72, 1, true);

  // Pattern (copy from minimal XM starting at 336)
  const minPatStart = 336;
  for (let i = 0; i < patTotalSize; i++) view[xmHeaderSize + i] = minView[minPatStart + i];

  // Instrument header starts at xmHeaderSize + patTotalSize
  let off = xmHeaderSize + patTotalSize;
  const instBase = off;

  dv.setUint32(off, instHeaderSize, true); // headerSize
  off += 4;
  for (let i = 0; i < 22 && i < instName.length; i++) view[off + i] = instName.charCodeAt(i);
  off += 22;
  view[off++] = 0; // type
  dv.setUint16(off, sampleCount, true); off += 2;

  if (sampleCount > 0) {
    dv.setUint32(off, sampleHeaderSize, true); off += 4; // sampleHeaderSize
    // sampleMap: 96 bytes (all zeros → all notes use sample 0)
    off += 96;

    // Volume envelope points at instBase+129
    if (volEnv) {
      const envBase = instBase + 129;
      for (let i = 0; i < Math.min(volEnv.points.length, 12); i++) {
        dv.setUint16(envBase + i * 4, volEnv.points[i].tick, true);
        dv.setUint16(envBase + i * 4 + 2, volEnv.points[i].value, true);
      }
      // numVolPoints is read from instBase+129+48 = instBase+177
      view[instBase + 177] = volEnv.points.length;
      view[instBase + 178] = volEnv.sustainPoint ?? 0;
    }

    // Pan envelope: instBase+177 (48 bytes). numPanPoints read from instBase+177+48=instBase+225
    // volumeType read from instBase+225 — bit0=1 enables vol envelope
    if (volEnv?.enabled) {
      view[instBase + 225] = 1; // volumeType bit0
    }

    // Vibrato settings at instBase+227..230
    if (vib) {
      const vibTypes = ['sine', 'square', 'rampDown', 'rampUp'];
      view[instBase + 227] = vibTypes.indexOf(vib.type);
      view[instBase + 228] = vib.sweep;
      view[instBase + 229] = vib.depth;
      view[instBase + 230] = vib.rate;
    }

    // Align to instHeaderSize
    off = instBase + instHeaderSize;

    // Sample headers
    for (let i = 0; i < sampleCount; i++) {
      const s = samples[i] ?? {};
      const loopTypeBits = s.loopType === 'forward' ? 1 : s.loopType === 'pingpong' ? 2 : 0;
      const is16Bit = s.bitDepth === 16;
      const byteLen = s.length ?? 0;

      dv.setUint32(off, byteLen, true);          // length in bytes
      dv.setUint32(off + 4, s.loopStart ?? 0, true);
      dv.setUint32(off + 8, s.loopLength ?? 0, true);
      view[off + 12] = s.volume ?? 64;
      view[off + 13] = s.finetune ?? 0;
      view[off + 14] = loopTypeBits | (is16Bit ? 0x10 : 0);
      view[off + 15] = s.panning ?? 128;
      view[off + 16] = s.relativeNote ?? 0;
      const sName = s.name ?? instName;
      for (let j = 0; j < 22 && j < sName.length; j++) view[off + 18 + j] = sName.charCodeAt(j);
      off += sampleHeaderSize;
    }

    // Sample data (delta-encoded zeros = silence)
    for (let i = 0; i < sampleCount; i++) {
      const len = samples[i]?.length ?? 0;
      // All zeros → PCM is all-zero after delta decode
      off += len;
    }
  }

  return buffer;
}

function createXMWithCompressedPattern(): ArrayBuffer {
  return createMinimalXM();
}

function createXMWithDeltaEncodedSample(): ArrayBuffer {
  return createXMWithInstrument({
    name: 'Delta Sample',
    samples: [{ length: 10, bitDepth: 8 }],
  });
}

// ── Integration tests against real XM files ───────────────────────────────────

const MODLAND = resolve(import.meta.dirname, '../../../../server/data/modland-cache/files');
const BIOHAZARD = resolve(MODLAND, 'pub__modules__Fasttracker 2__Loonie__biohazard.xm');
const CLOUDBERRY = resolve(MODLAND, 'pub__modules__Fasttracker 2__Boo__coop-Loonie__cloudberry fields.xm');

function loadXMFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isXMFormat', () => {
  it('detects valid XM by Extended Module magic', () => {
    const ab = loadXMFile(BIOHAZARD);
    expect(isXMFormat(ab)).toBe(true);
  });

  it('rejects non-XM data', () => {
    const buf = new Uint8Array(64).fill(0);
    expect(isXMFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 17 bytes', () => {
    const buf = new Uint8Array(10).fill(0x45);
    expect(isXMFormat(buf.buffer)).toBe(false);
  });
});

describe('parseXMFile — biohazard.xm (Loonie)', () => {
  it('parses without throwing', async () => {
    const ab = loadXMFile(BIOHAZARD);
    await expect(parseXMFile(ab, 'biohazard.xm')).resolves.toBeDefined();
  });

  it('returns correct format and metadata', async () => {
    const ab = loadXMFile(BIOHAZARD);
    const song = await parseXMFile(ab, 'biohazard.xm');
    expect(song.format).toBe('XM');
    expect(song.name.length).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
    expect(song.numChannels).toBeGreaterThan(0);
    expect(typeof song.linearPeriods).toBe('boolean');
  });

  it('has a valid song order list', async () => {
    const ab = loadXMFile(BIOHAZARD);
    const song = await parseXMFile(ab, 'biohazard.xm');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has instruments with PCM sample data', async () => {
    const ab = loadXMFile(BIOHAZARD);
    const song = await parseXMFile(ab, 'biohazard.xm');
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    expect(withPcm.length).toBeGreaterThan(0);
    let totalPcm = 0;
    for (const inst of withPcm) totalPcm += inst.sample!.audioBuffer!.byteLength;
    console.log(`biohazard: ${withPcm.length} sampled, ${(totalPcm / 1024).toFixed(0)} KB PCM`);
  });

  it('has patterns with note data', async () => {
    const ab = loadXMFile(BIOHAZARD);
    const song = await parseXMFile(ab, 'biohazard.xm');
    expect(song.patterns.length).toBeGreaterThan(0);
    const nonEmpty = song.patterns.some(p =>
      p.channels.some(ch => ch.rows.some(r => r.note > 0))
    );
    expect(nonEmpty).toBe(true);
  });
});

describe('parseXMFile — cloudberry fields.xm (Boo/Loonie)', () => {
  it('parses without throwing', async () => {
    const ab = loadXMFile(CLOUDBERRY);
    await expect(parseXMFile(ab, 'cloudberry fields.xm')).resolves.toBeDefined();
  });

  it('has instruments with PCM sample data', async () => {
    const ab = loadXMFile(CLOUDBERRY);
    const song = await parseXMFile(ab, 'cloudberry fields.xm');
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    expect(withPcm.length).toBeGreaterThan(0);
    let totalPcm = 0;
    for (const inst of withPcm) totalPcm += inst.sample!.audioBuffer!.byteLength;
    expect(totalPcm).toBeGreaterThan(0);
    console.log(`cloudberry: ${withPcm.length} sampled, ${(totalPcm / 1024).toFixed(0)} KB PCM`);
  });
});
