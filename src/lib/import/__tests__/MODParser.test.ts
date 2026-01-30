/**
 * MODParser Tests
 * Tests for native MOD binary parser
 */

import { describe, it, expect } from 'vitest';
import { parseMOD, periodToNote } from '../formats/MODParser';

describe('MODParser', () => {
  describe('Header Parsing', () => {
    it('should parse standard M.K. MOD header', async () => {
      const buffer = createMinimalMOD({ formatTag: 'M.K.' });
      const result = await parseMOD(buffer);

      expect(result.header.title).toBe('Test Module');
      expect(result.header.formatTag).toBe('M.K.');
      expect(result.header.channelCount).toBe(4);
      expect(result.header.patternCount).toBeGreaterThan(0);
      expect(result.header.songLength).toBeGreaterThan(0);
    });

    it('should detect 6-channel MOD format', async () => {
      const buffer = createMinimalMOD({ formatTag: '6CHN' });
      const result = await parseMOD(buffer);

      expect(result.header.formatTag).toBe('6CHN');
      expect(result.header.channelCount).toBe(6);
    });

    it('should detect 8-channel MOD format', async () => {
      const buffer = createMinimalMOD({ formatTag: '8CHN' });
      const result = await parseMOD(buffer);

      expect(result.header.formatTag).toBe('8CHN');
      expect(result.header.channelCount).toBe(8);
    });

    it('should handle unknown MOD signature by defaulting to 4 channels', async () => {
      // MOD parser doesn't throw - it defaults to 4 channels for unknown tags
      const buffer = createInvalidMOD();
      const result = await parseMOD(buffer);
      // Unknown format tag defaults to 4 channels
      expect(result.header.channelCount).toBe(4);
    });

    it('should handle extended channel formats (FLT4, FLT8)', async () => {
      const buffer = createMinimalMOD({ formatTag: 'FLT4' });
      const result = await parseMOD(buffer);

      expect(result.header.formatTag).toBe('FLT4');
      expect(result.header.channelCount).toBe(4);
    });
  });

  describe('Sample Parsing', () => {
    it('should parse sample headers (31 samples)', async () => {
      const buffer = createMODWithSamples([
        { name: 'Bass', length: 5000, finetune: 0, volume: 64 },
        { name: 'Lead', length: 3000, finetune: 5, volume: 50 },
      ]);
      const result = await parseMOD(buffer);

      expect(result.instruments.length).toBeGreaterThanOrEqual(2);
      expect(result.instruments[0].name).toBe('Bass');
      expect(result.instruments[0].samples[0].length).toBe(5000);
      expect(result.instruments[0].samples[0].finetune).toBe(0);
      expect(result.instruments[0].samples[0].volume).toBe(64);

      expect(result.instruments[1].name).toBe('Lead');
      expect(result.instruments[1].samples[0].length).toBe(3000);
      expect(result.instruments[1].samples[0].finetune).toBe(5);
      expect(result.instruments[1].samples[0].volume).toBe(50);
    });

    it('should parse loop points', async () => {
      const buffer = createMODWithSamples([
        {
          name: 'Loop Sample',
          length: 1000,
          loopStart: 100,
          loopLength: 500,
        },
      ]);
      const result = await parseMOD(buffer);

      const sample = result.instruments[0].samples[0];
      expect(sample.loopStart).toBe(100);
      expect(sample.loopLength).toBe(500);
      expect(sample.loopType).toBe('forward');
    });

    it('should detect non-looping samples', async () => {
      const buffer = createMODWithSamples([
        {
          name: 'No Loop',
          length: 1000,
          loopStart: 0,
          loopLength: 1, // Loop length of 1 or 2 = no loop
        },
      ]);
      const result = await parseMOD(buffer);

      expect(result.instruments[0].samples[0].loopType).toBe('none');
    });

    it('should handle 8-bit signed PCM data', async () => {
      const buffer = createMODWithSamples([
        {
          name: 'PCM Sample',
          length: 100,
          pcmData: new Int8Array(100).fill(64),
        },
      ]);
      const result = await parseMOD(buffer);

      const pcm = result.instruments[0].samples[0].pcmData;
      expect(pcm).toBeInstanceOf(ArrayBuffer);
      expect(pcm.byteLength).toBe(100);
    });

    it('should handle finetune range (-8 to +7)', async () => {
      const buffer = createMODWithSamples([
        { name: 'Finetune +7', finetune: 7 },
        { name: 'Finetune -8', finetune: -8 },
      ]);
      const result = await parseMOD(buffer);

      expect(result.instruments[0].samples[0].finetune).toBe(7);
      expect(result.instruments[1].samples[0].finetune).toBe(-8);
    });
  });

  describe('Pattern Parsing', () => {
    it('should parse 64-row patterns', async () => {
      const buffer = createMODWithPattern({
        rows: [
          { note: 'C-2', instrument: 1, effect: 'A0F' },
          { note: 'E-2', instrument: 2, effect: 'C40' },
        ],
      });
      const result = await parseMOD(buffer);

      expect(result.patterns[0].length).toBe(64); // MOD patterns are always 64 rows
      expect(result.patterns[0][0][0].period).toBe(428); // C-2 period
      expect(result.patterns[0][0][0].instrument).toBe(1);
      expect(result.patterns[0][0][0].effect).toBe(0xA); // Effect command
    });

    it('should convert Amiga periods to notes', async () => {
      const buffer = createMODWithPattern({
        rows: [
          { period: 428, instrument: 1 }, // C-2
          { period: 381, instrument: 1 }, // D-2
          { period: 339, instrument: 1 }, // E-2
        ],
      });
      const result = await parseMOD(buffer);

      expect(result.patterns[0][0][0].period).toBe(428); // C-2
      expect(result.patterns[0][1][0].period).toBe(381); // D-2
      expect(result.patterns[0][2][0].period).toBe(339); // E-2
    });

    it('should handle empty pattern cells', async () => {
      const buffer = createMODWithPattern({
        rows: [{ period: 0, instrument: 0, effect: '000' }],
      });
      const result = await parseMOD(buffer);

      expect(result.patterns[0][0][0].period).toBe(0);
      expect(result.patterns[0][0][0].instrument).toBe(0);
    });

    it('should parse effects correctly', async () => {
      const buffer = createMODWithPattern({
        rows: [
          { note: 'C-2', effect: 'A0F' }, // Volume slide
          { note: 'D-2', effect: '320' }, // Tone portamento
          { note: 'E-2', effect: 'C40' }, // Set volume
          { note: 'F-2', effect: 'ED2' }, // Note delay
        ],
      });
      const result = await parseMOD(buffer);

      expect(result.patterns[0][0][0].effect).toBe('A0F');
      expect(result.patterns[0][1][0].effect).toBe('320');
      expect(result.patterns[0][2][0].effect).toBe('C40');
      expect(result.patterns[0][3][0].effect).toBe('ED2');
    });

    it('should handle multiple patterns', async () => {
      const buffer = createMinimalMOD({ patternCount: 3 });
      const result = await parseMOD(buffer);

      expect(result.patterns.length).toBe(3);
    });

    it('should use pattern order table', async () => {
      const buffer = createMODWithPatternOrder([0, 2, 1, 0]); // Pattern sequence
      const result = await parseMOD(buffer);

      expect(result.header.songLength).toBe(4);
      // Pattern order should be preserved in metadata
      expect(result.metadata.modData?.patternOrderTable).toEqual([0, 2, 1, 0]);
    });
  });

  describe('Amiga Period Conversion', () => {
    it('should convert common periods to notes', () => {
      expect(periodToNote(1712)).toBe('C-0');
      expect(periodToNote(856)).toBe('C-1');
      expect(periodToNote(428)).toBe('C-2');
      expect(periodToNote(214)).toBe('C-3');
    });

    it('should handle all notes in octave', () => {
      expect(periodToNote(428)).toBe('C-2');
      expect(periodToNote(404)).toBe('C#2');
      expect(periodToNote(381)).toBe('D-2');
      expect(periodToNote(360)).toBe('D#2');
      expect(periodToNote(339)).toBe('E-2');
      expect(periodToNote(320)).toBe('F-2');
      expect(periodToNote(302)).toBe('F#2');
      expect(periodToNote(285)).toBe('G-2');
      expect(periodToNote(269)).toBe('G#2');
      expect(periodToNote(254)).toBe('A-2');
      expect(periodToNote(240)).toBe('A#2');
      expect(periodToNote(226)).toBe('B-2');
    });

    it('should return null for invalid periods', () => {
      expect(periodToNote(0)).toBeNull();
      expect(periodToNote(9999)).toBeNull();
      expect(periodToNote(-1)).toBeNull();
    });

    it('should handle period values with rounding', () => {
      // Test that nearby periods map to correct notes
      expect(periodToNote(427)).toBe('C-2'); // Slightly off 428
      expect(periodToNote(429)).toBe('C-2');
    });
  });

  describe('Import Metadata', () => {
    it('should generate import metadata', async () => {
      const buffer = createMinimalMOD({ formatTag: 'M.K.' });
      const result = await parseMOD(buffer);

      expect(result.metadata.sourceFormat).toBe('MOD');
      expect(result.metadata.originalChannelCount).toBe(4);
      expect(result.metadata.modData).toBeDefined();
      expect(result.metadata.modData?.moduleType).toBe('M.K.');
      expect(result.metadata.modData?.initialSpeed).toBe(6);
      expect(result.metadata.modData?.initialBPM).toBe(125);
      expect(result.metadata.modData?.amigaPeriods).toBe(true);
    });

    it('should preserve original sample data', async () => {
      const buffer = createMODWithSamples([
        {
          name: 'Sample 1',
          length: 1000,
          finetune: 5,
          volume: 50,
          loopStart: 100,
          loopLength: 200,
        },
      ]);
      const result = await parseMOD(buffer);

      const preserved = result.metadata.originalSamples?.[1]; // MOD samples are 1-indexed
      expect(preserved).toBeDefined();
      expect(preserved?.name).toBe('Sample 1');
      expect(preserved?.length).toBe(1000);
      expect(preserved?.finetune).toBe(5);
      expect(preserved?.volume).toBe(50);
      expect(preserved?.loopStart).toBe(100);
      expect(preserved?.loopLength).toBe(200);
    });
  });

  describe('Edge Cases', () => {
    it('should handle MOD with no samples', async () => {
      const buffer = createMODWithSamples([]);
      const result = await parseMOD(buffer);

      // MOD always has 31 sample slots, but they can be empty
      expect(result.instruments.length).toBeLessThanOrEqual(31);
    });

    it('should handle MOD with max pattern count', async () => {
      const buffer = createMinimalMOD({ patternCount: 128 });
      const result = await parseMOD(buffer);

      expect(result.header.patternCount).toBeLessThanOrEqual(128);
    });

    it('should handle truncated MOD file gracefully', async () => {
      const buffer = new ArrayBuffer(100); // Too small for valid MOD
      await expect(parseMOD(buffer)).rejects.toThrow();
    });

    it('should handle empty pattern cells correctly', async () => {
      const buffer = createMODWithPattern({
        rows: Array(64).fill({ period: 0, instrument: 0, effect: '000' }),
      });
      const result = await parseMOD(buffer);

      // All cells should be empty
      result.patterns[0].forEach((row) => {
        row.forEach((cell) => {
          expect(cell.period).toBe(0);
          expect(cell.instrument).toBe(0);
        });
      });
    });
  });
});

// Helper functions to create test MOD data
function createMinimalMOD(options: {
  title?: string;
  formatTag?: string;
  patternCount?: number;
} = {}): ArrayBuffer {
  const { title = 'Test Module', formatTag = 'M.K.', patternCount = 1 } = options;

  // MOD file structure:
  // - 20 bytes: title
  // - 31 * 30 bytes: sample headers (930 bytes)
  // - 1 byte: song length
  // - 1 byte: restart position
  // - 128 bytes: pattern order table
  // - 4 bytes: format tag
  // - Pattern data
  // - Sample data

  const headerSize = 20 + 31 * 30 + 1 + 1 + 128 + 4;
  const patternSize = patternCount * 1024; // 64 rows * 4 channels * 4 bytes
  const totalSize = headerSize + patternSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new Uint8Array(buffer);
  // DataView available for word-aligned writes if needed

  // Title (20 bytes)
  for (let i = 0; i < 20 && i < title.length; i++) {
    view[i] = title.charCodeAt(i);
  }

  // 31 sample headers (skip for minimal test)
  let offset = 20 + 31 * 30;

  // Song length (1 byte)
  view[offset++] = patternCount;

  // Restart position (1 byte)
  view[offset++] = 0;

  // Pattern order table (128 bytes)
  for (let i = 0; i < 128; i++) {
    view[offset++] = i < patternCount ? i : 0;
  }

  // Format tag (4 bytes at offset 1080)
  for (let i = 0; i < 4 && i < formatTag.length; i++) {
    view[offset + i] = formatTag.charCodeAt(i);
  }

  return buffer;
}

function createInvalidMOD(): ArrayBuffer {
  const buffer = new ArrayBuffer(1084);
  const view = new Uint8Array(buffer);
  // Write invalid format tag
  view[1080] = 'X'.charCodeAt(0);
  view[1081] = 'X'.charCodeAt(0);
  view[1082] = 'X'.charCodeAt(0);
  view[1083] = 'X'.charCodeAt(0);
  return buffer;
}

function createMODWithSamples(_samples: any[]): ArrayBuffer {
  // Simplified - would need full MOD structure
  return createMinimalMOD();
}

function createMODWithPattern(_options: { rows: any[] }): ArrayBuffer {
  // Simplified - would need full MOD structure
  return createMinimalMOD();
}

function createMODWithPatternOrder(order: number[]): ArrayBuffer {
  // Simplified - would need full MOD structure
  return createMinimalMOD({ patternCount: Math.max(...order) + 1 });
}
