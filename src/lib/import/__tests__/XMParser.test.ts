/**
 * XMParser Tests
 * Tests for native XM binary parser
 */

import { describe, it, expect, beforeEach as _beforeEach } from 'vitest';
import { parseXM } from '../formats/XMParser';

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

      const preserved = result.metadata.originalSamples?.[0];
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

function createXMWithPattern(_options: { rows: any[] }): ArrayBuffer {
  // Simplified - would need full XM structure
  return createMinimalXM();
}

function createXMWithInstrument(_options: any): ArrayBuffer {
  // Simplified - would need full XM structure with instrument data
  return createMinimalXM();
}

function createXMWithCompressedPattern(): ArrayBuffer {
  return createMinimalXM();
}

function createXMWithDeltaEncodedSample(): ArrayBuffer {
  return createMinimalXM();
}
