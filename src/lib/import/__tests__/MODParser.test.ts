/**
 * MODParser Tests
 * Tests for native MOD binary parser
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseMOD, periodToNote, isMODFormat, parseMODFile } from '../formats/MODParser';

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

      // MODNote.effect is a number (the effect nibble), effectParam is the parameter byte
      expect(result.patterns[0][0][0].effect).toBe(0xA);
      expect(result.patterns[0][0][0].effectParam).toBe(0x0F);
      expect(result.patterns[0][1][0].effect).toBe(0x3);
      expect(result.patterns[0][1][0].effectParam).toBe(0x20);
      expect(result.patterns[0][2][0].effect).toBe(0xC);
      expect(result.patterns[0][2][0].effectParam).toBe(0x40);
      expect(result.patterns[0][3][0].effect).toBe(0xE);
      expect(result.patterns[0][3][0].effectParam).toBe(0xD2);
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
      // Pattern order table has 128 entries; compare only the first songLength
      expect(result.metadata.modData?.patternOrderTable.slice(0, 4)).toEqual([0, 2, 1, 0]);
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

/** Write a big-endian uint16 into a Uint8Array */
function writeUint16BE(view: Uint8Array, offset: number, value: number): void {
  view[offset] = (value >> 8) & 0xFF;
  view[offset + 1] = value & 0xFF;
}

function createMinimalMOD(options: {
  title?: string;
  formatTag?: string;
  patternCount?: number;
} = {}): ArrayBuffer {
  const { title = 'Test Module', formatTag = 'M.K.', patternCount = 1 } = options;

  // Channel count from format tag
  const FORMAT_MAP: Record<string, number> = { 'M.K.': 4, 'FLT4': 4, 'FLT8': 8, '6CHN': 6, '8CHN': 8 };
  const channelCount = FORMAT_MAP[formatTag] ?? 4;

  const headerSize = 20 + 31 * 30 + 1 + 1 + 128 + 4; // = 1084
  const patternSize = patternCount * 64 * channelCount * 4;
  const buffer = new ArrayBuffer(headerSize + patternSize);
  const view = new Uint8Array(buffer);

  // Title (20 bytes)
  for (let i = 0; i < 20 && i < title.length; i++) {
    view[i] = title.charCodeAt(i);
  }

  let offset = 20 + 31 * 30;

  // Song length
  view[offset++] = patternCount;
  // Restart position
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
  // 1084 header + 1024 bytes of pattern data so parser doesn't throw OOB
  const buffer = new ArrayBuffer(1084 + 1024);
  const view = new Uint8Array(buffer);
  // Write invalid (unknown) format tag — results in 4-channel default
  view[1080] = 'X'.charCodeAt(0);
  view[1081] = 'X'.charCodeAt(0);
  view[1082] = 'X'.charCodeAt(0);
  view[1083] = 'X'.charCodeAt(0);
  // Song length = 1, order table entry 0 = pattern 0
  view[20 + 31 * 30] = 1; // songLength
  return buffer;
}

interface SampleOptions {
  name?: string;
  length?: number; // in bytes (will be halved to words for header)
  finetune?: number;
  volume?: number;
  loopStart?: number; // in samples (halved to words for header)
  loopLength?: number; // in samples (halved to words for header)
  pcmData?: Int8Array;
}

function createMODWithSamples(samples: SampleOptions[]): ArrayBuffer {
  const formatTag = 'M.K.';
  const channelCount = 4;
  const patternCount = 1;
  const headerSize = 1084;
  const patternSize = patternCount * 64 * channelCount * 4;

  // Compute total sample data size (default 2 bytes per sample when not specified)
  const sampleBytes = samples.map(s => (s.length ?? 2));
  const totalSampleSize = sampleBytes.reduce((a, b) => a + b, 0);

  const buffer = new ArrayBuffer(headerSize + patternSize + totalSampleSize);
  const view = new Uint8Array(buffer);

  // Title
  const title = 'Test Module';
  for (let i = 0; i < title.length; i++) view[i] = title.charCodeAt(i);

  let offset = 20;

  // 31 sample headers (30 bytes each)
  for (let i = 0; i < 31; i++) {
    if (i < samples.length) {
      const s = samples[i];
      const name = s.name ?? '';
      for (let j = 0; j < 22 && j < name.length; j++) view[offset + j] = name.charCodeAt(j);
      // length in words (big-endian)
      // Default to 2 bytes (1 word) so the parser doesn't skip the sample
      const lengthWords = Math.floor((s.length ?? 2) / 2);
      writeUint16BE(view, offset + 22, lengthWords);
      // finetune: -8 to 7, stored as 0-15
      const ft = s.finetune ?? 0;
      view[offset + 24] = ft < 0 ? ft + 16 : ft;
      // volume
      view[offset + 25] = s.volume ?? 64;
      // loopStart in words
      writeUint16BE(view, offset + 26, Math.floor((s.loopStart ?? 0) / 2));
      // loopLength in words (1 = no loop per convention; default 1)
      const ll = s.loopLength ?? 1;
      writeUint16BE(view, offset + 28, Math.floor(ll / 2) || 1);
    }
    offset += 30;
  }

  // Song length (1) + restart (0)
  view[offset++] = patternCount;
  view[offset++] = 0;

  // Pattern order table
  for (let i = 0; i < 128; i++) view[offset++] = i < patternCount ? i : 0;

  // Format tag
  for (let i = 0; i < 4; i++) view[offset + i] = formatTag.charCodeAt(i);

  // Pattern data (zeros = empty cells) at offset 1084
  // Sample data follows
  let sampleOffset = headerSize + patternSize;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const len = s.length ?? 0;
    if (s.pcmData) {
      for (let j = 0; j < len; j++) view[sampleOffset + j] = s.pcmData[j] & 0xFF;
    }
    sampleOffset += len;
  }

  return buffer;
}

/** Note name to Amiga period */
const NOTE_TO_PERIOD: Record<string, number> = {
  'C-2': 428, 'C#2': 404, 'D-2': 381, 'D#2': 360,
  'E-2': 339, 'F-2': 320, 'F#2': 302, 'G-2': 285,
  'G#2': 269, 'A-2': 254, 'A#2': 240, 'B-2': 226,
  'C-3': 214, 'C#3': 202, 'D-3': 190,
};

interface RowOptions {
  note?: string;
  period?: number;
  instrument?: number;
  effect?: string; // e.g. 'A0F'
}

function createMODWithPattern(options: { rows: RowOptions[] }): ArrayBuffer {
  const formatTag = 'M.K.';
  const channelCount = 4;
  const patternCount = 1;
  const headerSize = 1084;
  const patternSize = 64 * channelCount * 4;

  const buffer = new ArrayBuffer(headerSize + patternSize);
  const view = new Uint8Array(buffer);

  // Title
  const title = 'Test Module';
  for (let i = 0; i < title.length; i++) view[i] = title.charCodeAt(i);

  let offset = 20 + 31 * 30;
  view[offset++] = patternCount;
  view[offset++] = 0;
  for (let i = 0; i < 128; i++) view[offset++] = i < patternCount ? i : 0;
  for (let i = 0; i < 4; i++) view[offset + i] = formatTag.charCodeAt(i);

  // Write pattern cells
  const patBase = headerSize;
  for (let row = 0; row < Math.min(options.rows.length, 64); row++) {
    const r = options.rows[row];
    const period = r.period ?? (r.note ? (NOTE_TO_PERIOD[r.note] ?? 0) : 0);
    const inst = r.instrument ?? 0;
    // Parse effect string like 'A0F' → effect=0xA, param=0x0F
    let eff = 0, param = 0;
    if (r.effect && r.effect.length >= 3) {
      eff = parseInt(r.effect[0], 16);
      param = parseInt(r.effect.slice(1), 16);
    }

    // Channel 0 of row
    const cellOffset = patBase + (row * channelCount + 0) * 4;
    view[cellOffset]     = ((inst & 0xF0)) | ((period >> 8) & 0x0F);
    view[cellOffset + 1] = period & 0xFF;
    view[cellOffset + 2] = ((inst & 0x0F) << 4) | (eff & 0x0F);
    view[cellOffset + 3] = param & 0xFF;
  }

  return buffer;
}

function createMODWithPatternOrder(order: number[]): ArrayBuffer {
  const formatTag = 'M.K.';
  const channelCount = 4;
  const patternCount = Math.max(...order) + 1;
  const headerSize = 1084;
  const patternSize = patternCount * 64 * channelCount * 4;

  const buffer = new ArrayBuffer(headerSize + patternSize);
  const view = new Uint8Array(buffer);

  const title = 'Test Module';
  for (let i = 0; i < title.length; i++) view[i] = title.charCodeAt(i);

  let offset = 20 + 31 * 30;
  view[offset++] = order.length; // songLength = number of entries in order
  view[offset++] = 0;

  // Pattern order table (128 bytes)
  for (let i = 0; i < 128; i++) {
    view[offset++] = i < order.length ? order[i] : 0;
  }

  for (let i = 0; i < 4; i++) view[offset + i] = formatTag.charCodeAt(i);

  return buffer;
}

// ── Integration tests against real MOD files ──────────────────────────────────

const MODLAND = resolve(import.meta.dirname, '../../../../server/data/modland-cache/files');
const AXEL_MOD = resolve(MODLAND, 'pub__modules__Protracker__Axel__axel goes funkey!.mod');
const SUPERNOVA = resolve(MODLAND, 'pub__modules__Fasttracker__Radix__supernova.mod');

function loadMODFile(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isMODFormat', () => {
  it('detects valid MOD by format tag at offset 1080', () => {
    const ab = loadMODFile(AXEL_MOD);
    expect(isMODFormat(ab)).toBe(true);
  });

  it('rejects non-MOD data (all zeros)', () => {
    const buf = new Uint8Array(2000).fill(0);
    expect(isMODFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer shorter than 1084 bytes', () => {
    const buf = new Uint8Array(500).fill(0);
    expect(isMODFormat(buf.buffer)).toBe(false);
  });
});

describe('parseMODFile — axel goes funkey!.mod (Axel)', () => {
  it('parses without throwing', async () => {
    const ab = loadMODFile(AXEL_MOD);
    await expect(parseMODFile(ab, 'axel goes funkey!.mod')).resolves.toBeDefined();
  });

  it('returns correct format and metadata', async () => {
    const ab = loadMODFile(AXEL_MOD);
    const song = await parseMODFile(ab, 'axel goes funkey!.mod');
    expect(song.format).toBe('MOD');
    expect(song.name.length).toBeGreaterThan(0);
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
    expect(song.numChannels).toBeGreaterThan(0);
    expect(song.linearPeriods).toBe(false);
  });

  it('has a valid song order list', async () => {
    const ab = loadMODFile(AXEL_MOD);
    const song = await parseMODFile(ab, 'axel goes funkey!.mod');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has instruments with PCM sample data', async () => {
    const ab = loadMODFile(AXEL_MOD);
    const song = await parseMODFile(ab, 'axel goes funkey!.mod');
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    expect(withPcm.length).toBeGreaterThan(0);
    let totalPcm = 0;
    for (const inst of withPcm) totalPcm += inst.sample!.audioBuffer!.byteLength;
    console.log(`axel: ${withPcm.length} sampled, ${(totalPcm / 1024).toFixed(0)} KB PCM`);
  });

  it('has patterns with note data', async () => {
    const ab = loadMODFile(AXEL_MOD);
    const song = await parseMODFile(ab, 'axel goes funkey!.mod');
    expect(song.patterns.length).toBeGreaterThan(0);
    const nonEmpty = song.patterns.some(p =>
      p.channels.some(ch => ch.rows.some(r => r.note > 0))
    );
    expect(nonEmpty).toBe(true);
  });
});

describe('parseMODFile — supernova.mod (Radix)', () => {
  it('parses without throwing', async () => {
    const ab = loadMODFile(SUPERNOVA);
    await expect(parseMODFile(ab, 'supernova.mod')).resolves.toBeDefined();
  });

  it('has instruments with PCM sample data', async () => {
    const ab = loadMODFile(SUPERNOVA);
    const song = await parseMODFile(ab, 'supernova.mod');
    const withPcm = song.instruments.filter(
      i => i.type === 'sample' && (i.sample?.audioBuffer?.byteLength ?? 0) > 0
    );
    expect(withPcm.length).toBeGreaterThan(0);
    let totalPcm = 0;
    for (const inst of withPcm) totalPcm += inst.sample!.audioBuffer!.byteLength;
    expect(totalPcm).toBeGreaterThan(0);
    console.log(`supernova: ${withPcm.length} sampled, ${(totalPcm / 1024).toFixed(0)} KB PCM`);
  });
});
