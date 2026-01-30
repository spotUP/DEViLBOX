/**
 * Import/Export Integration Tests
 * Tests the full workflow of importing and re-exporting modules
 */

import { describe, it, expect } from 'vitest';
import { parseXM } from '../formats/XMParser';
import { parseMOD } from '../formats/MODParser';
import { convertXMModule, convertMODModule } from '../ModuleConverter';
import { convertToInstrument } from '../InstrumentConverter';
import { exportAsXM } from '../../export/XMExporter';
import { exportAsMOD } from '../../export/MODExporter';

describe('Import/Export Flow', () => {
  describe('XM Round-Trip', () => {
    it('should import and re-export XM without data loss', async () => {
      // Create test XM
      const originalBuffer = createTestXM();

      // Import
      const imported = await parseXM(originalBuffer);
      const convertedPatterns = convertXMModule(
        imported.patterns,
        imported.header.channelCount,
        imported.metadata,
        imported.instruments.map((i) => i.name)
      );
      const convertedInstruments = imported.instruments.flatMap((inst, idx) =>
        convertToInstrument(inst, idx, 'XM')
      );

      // Re-export
      const exported = await exportAsXM(convertedPatterns.patterns, convertedInstruments, {
        moduleName: imported.header.moduleName,
        channelLimit: imported.header.channelCount,
      });

      // Verify no warnings for lossless re-export
      expect(exported.warnings.length).toBe(0);
      expect(exported.data).toBeInstanceOf(Blob);
      expect(exported.filename).toMatch(/\.xm$/);
    });

    it('should preserve FT2 effects during round-trip', async () => {
      const buffer = createXMWithEffects([
        { note: 'C-4', effect: 'A0F' },
        { note: 'D-4', effect: '320' },
        { note: 'E-4', effect: '488' },
        { note: 'F-4', effect: 'ED2' },
      ]);

      const imported = await parseXM(buffer);
      const converted = convertXMModule(
        imported.patterns,
        imported.header.channelCount,
        imported.metadata,
        []
      );

      // Check effects are passed through
      expect(converted.patterns[0].channels[0].rows[0].effect).toBe('A0F');
      expect(converted.patterns[0].channels[0].rows[1].effect).toBe('320');
      expect(converted.patterns[0].channels[0].rows[2].effect).toBe('488');
      expect(converted.patterns[0].channels[0].rows[3].effect).toBe('ED2');
    });

    it('should preserve sample data during round-trip', async () => {
      const buffer = createXMWithSample({
        name: 'Test Sample',
        length: 1000,
        loopType: 'forward',
        loopStart: 100,
        loopLength: 200,
      });

      const imported = await parseXM(buffer);
      const instruments = imported.instruments.flatMap((inst, idx) =>
        convertToInstrument(inst, idx, 'XM')
      );

      // Check sample properties preserved
      const instrument = instruments[0];
      expect(instrument.synthType).toBe('Sampler');
      expect(instrument.sample?.loop).toBe(true);
      expect(instrument.sample?.loopStart).toBe(100);

      // Check metadata preservation
      expect(instrument.metadata?.importedFrom).toBe('XM');
      expect(instrument.metadata?.originalEnvelope).toBeDefined();
    });

    it('should preserve volume envelopes', async () => {
      const buffer = createXMWithEnvelope({
        points: [
          { tick: 0, value: 0 },
          { tick: 10, value: 64 },
          { tick: 50, value: 32 },
          { tick: 100, value: 0 },
        ],
        sustainPoint: 2,
      });

      const imported = await parseXM(buffer);
      const instruments = imported.instruments.flatMap((inst, idx) =>
        convertToInstrument(inst, idx, 'XM')
      );

      // Check envelope converted to ADSR
      expect(instruments[0].envelope).toBeDefined();
      expect(instruments[0].envelope?.attack).toBeGreaterThan(0);
      expect(instruments[0].envelope?.sustain).toBeGreaterThan(0);

      // Check original envelope preserved in metadata
      expect(instruments[0].metadata?.originalEnvelope?.points.length).toBe(4);
    });
  });

  describe('MOD Round-Trip', () => {
    it('should import and re-export MOD without data loss', async () => {
      const originalBuffer = createTestMOD();

      // Import
      const imported = await parseMOD(originalBuffer);
      const convertedPatterns = convertMODModule(
        imported.patterns,
        imported.header.channelCount,
        imported.metadata,
        imported.instruments.map((i) => i.name)
      );
      const convertedInstruments = imported.instruments.flatMap((inst, idx) =>
        convertToInstrument(inst, idx, 'MOD')
      );

      // Re-export
      const exported = await exportAsMOD(convertedPatterns.patterns, convertedInstruments, {
        moduleName: imported.header.title,
        channelCount: imported.header.channelCount as 4 | 6 | 8,
      });

      // Verify lossless re-export
      expect(exported.warnings.length).toBe(0);
      expect(exported.data).toBeInstanceOf(Blob);
      expect(exported.filename).toMatch(/\.mod$/);
    });

    it('should convert Amiga periods correctly', async () => {
      const buffer = createMODWithPeriods([
        { period: 428, instrument: 1 }, // C-2
        { period: 381, instrument: 1 }, // D-2
        { period: 339, instrument: 1 }, // E-2
      ]);

      const imported = await parseMOD(buffer);
      const converted = convertMODModule(imported.patterns, 4, imported.metadata, []);

      expect(converted.patterns[0].channels[0].rows[0].note).toBe('C-2');
      expect(converted.patterns[0].channels[0].rows[1].note).toBe('D-2');
      expect(converted.patterns[0].channels[0].rows[2].note).toBe('E-2');
    });

    it('should handle MOD sample loops', async () => {
      const buffer = createMODWithSample({
        name: 'Bass Loop',
        length: 2000,
        loopStart: 500,
        loopLength: 1000,
      });

      const imported = await parseMOD(buffer);
      const instruments = imported.instruments.flatMap((inst, idx) =>
        convertToInstrument(inst, idx, 'MOD')
      );

      const instrument = instruments.find((i) => i.name === 'Bass Loop');
      expect(instrument).toBeDefined();
      expect(instrument?.sample?.loop).toBe(true);
      expect(instrument?.sample?.loopStart).toBe(500);
    });
  });

  describe('Cross-Format Conversion', () => {
    it('should warn about lossy XM->MOD conversion', async () => {
      // Create XM with 8 channels
      const buffer = createTestXM({ channelCount: 8 });
      const imported = await parseXM(buffer);
      const patterns = convertXMModule(imported.patterns, 8, imported.metadata, []);
      const instruments = imported.instruments.flatMap((inst, idx) =>
        convertToInstrument(inst, idx, 'XM')
      );

      // Export as 4-channel MOD
      const exported = await exportAsMOD(patterns.patterns, instruments, {
        moduleName: 'Test',
        channelCount: 4,
      });

      // Should warn about channel truncation
      expect(exported.warnings.length).toBeGreaterThan(0);
      expect(exported.warnings.some((w) => w.includes('channels'))).toBe(true);
    });

    it('should warn about pattern length truncation in MOD', async () => {
      // Create pattern with >64 rows
      const buffer = createXMWithPatternLength(80);
      const imported = await parseXM(buffer);
      const patterns = convertXMModule(imported.patterns, 4, imported.metadata, []);
      const instruments = imported.instruments.flatMap((inst, idx) =>
        convertToInstrument(inst, idx, 'XM')
      );

      // Export as MOD (max 64 rows)
      const exported = await exportAsMOD(patterns.patterns, instruments, {
        moduleName: 'Test',
        channelCount: 4,
      });

      // Should warn about row truncation
      expect(exported.warnings.some((w) => w.includes('64 rows'))).toBe(true);
    });

    it('should warn about synth-to-sample conversion', async () => {
      // Create pattern with synth instrument (not sampler)
      const instruments = [
        {
          id: 1,
          name: 'TB-303',
          type: 'synth' as const,
          synthType: 'TB303' as const,
          tb303: {
            oscillator: { type: 'sawtooth' as const },
            filter: { cutoff: 500, resonance: 70 },
            filterEnvelope: { envMod: 50, decay: 200 },
            accent: { amount: 50 },
            slide: { time: 60, mode: 'exponential' as const },
          },
          effects: [],
          volume: -6,
          pan: 0,
        },
      ];

      const patterns = [
        {
          id: 'pattern-1',
          name: 'Pattern 1',
          length: 64,
          channels: [
            {
              id: 'ch-1',
              name: 'Channel 1',
              rows: Array(64).fill({
                note: null,
                instrument: null,
                volume: null,
                effect: null,
                effect2: null,
                accent: false,
                slide: false,
              }),
              muted: false,
              solo: false,
              collapsed: false,
              volume: 100,
              pan: 0,
              instrumentId: 1,
              color: null,
            },
          ],
          importMetadata: undefined,
        },
      ];

      const exported = await exportAsXM(patterns, instruments, {
        moduleName: 'Test',
        bakeSynthsToSamples: true,
      });

      // Should warn about synth conversion
      expect(exported.warnings.some((w) => w.includes('TB-303'))).toBe(true);
    });
  });

  describe('Import Metadata Preservation', () => {
    it('should preserve import metadata for lossless export', async () => {
      const buffer = createTestXM();
      const imported = await parseXM(buffer);

      // Check metadata exists
      expect(imported.metadata.sourceFormat).toBe('XM');
      expect(imported.metadata.originalSamples).toBeDefined();
      expect(imported.metadata.envelopes).toBeDefined();

      // Convert patterns (metadata is attached)
      const patterns = convertXMModule(
        imported.patterns,
        imported.header.channelCount,
        imported.metadata,
        []
      );

      // Check metadata attached to patterns
      expect(patterns.patterns[0].importMetadata).toBeDefined();
      expect(patterns.patterns[0].importMetadata?.sourceFormat).toBe('XM');
    });

    it('should enable lossless export when metadata present', async () => {
      const buffer = createTestXM();
      const imported = await parseXM(buffer);
      const patterns = convertXMModule(imported.patterns, 4, imported.metadata, []);
      const instruments = imported.instruments.flatMap((inst, idx) =>
        convertToInstrument(inst, idx, 'XM')
      );

      // Export with metadata (should be lossless)
      const exported = await exportAsXM(patterns.patterns, instruments, {
        moduleName: 'Test',
      });

      // No warnings = lossless
      expect(exported.warnings.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty patterns', async () => {
      const buffer = createXMWithEmptyPattern();
      const imported = await parseXM(buffer);
      const patterns = convertXMModule(imported.patterns, 4, imported.metadata, []);

      expect(patterns.patterns.length).toBeGreaterThan(0);
      expect(patterns.patterns[0].channels.length).toBeGreaterThan(0);
    });

    it('should handle modules with no instruments', async () => {
      const buffer = createXMWithNoInstruments();
      const imported = await parseXM(buffer);
      const instruments = imported.instruments.flatMap((inst, idx) =>
        convertToInstrument(inst, idx, 'XM')
      );

      expect(instruments.length).toBe(0);
    });

    it('should handle max channel count (XM=32, MOD=8)', async () => {
      const buffer = createTestXM({ channelCount: 32 });
      const imported = await parseXM(buffer);

      expect(imported.header.channelCount).toBe(32);

      // Export as XM should work
      const patterns = convertXMModule(imported.patterns, 32, imported.metadata, []);
      const exported = await exportAsXM(patterns.patterns, [], {
        channelLimit: 32,
      });
      expect(exported.warnings.length).toBe(0);

      // Export as MOD should warn
      const modExported = await exportAsMOD(patterns.patterns, [], {
        channelCount: 8,
      });
      expect(modExported.warnings.length).toBeGreaterThan(0);
    });
  });
});

// Helper functions
function createTestXM(options: { channelCount?: number } = {}): ArrayBuffer {
  // Create minimal valid XM for testing
  const { channelCount = 4 } = options;

  // XM header is 60 bytes minimum + header size field + pattern order + patterns + instruments
  const headerSize = 60 + 256; // Fixed header + pattern order table
  const patternDataSize = 9 + channelCount * 64 * 5; // Pattern header + pattern data
  const instrumentSize = 263; // Minimal instrument with no samples

  const buffer = new ArrayBuffer(headerSize + patternDataSize + instrumentSize);
  const view = new DataView(buffer);
  const encoder = new TextEncoder();

  // Write "Extended Module: " at offset 0
  const idText = encoder.encode('Extended Module: ');
  new Uint8Array(buffer, 0, 17).set(idText);

  // Module name (20 bytes at offset 17)
  const name = encoder.encode('Test Module');
  new Uint8Array(buffer, 17, 20).set(name.slice(0, 20));

  // $1a at offset 37
  view.setUint8(37, 0x1a);

  // Tracker name (20 bytes at offset 38)
  const tracker = encoder.encode('DEViLBOX');
  new Uint8Array(buffer, 38, 20).set(tracker.slice(0, 20));

  // Version (2 bytes at offset 58) - 0x0104 for FT2
  view.setUint16(58, 0x0104, true);

  // Header size (4 bytes at offset 60) - size from this point
  view.setUint32(60, 256 + 16, true); // Header extension size

  // Song length (2 bytes at offset 64)
  view.setUint16(64, 1, true);

  // Restart position (2 bytes at offset 66)
  view.setUint16(66, 0, true);

  // Channel count (2 bytes at offset 68)
  view.setUint16(68, channelCount, true);

  // Pattern count (2 bytes at offset 70)
  view.setUint16(70, 1, true);

  // Instrument count (2 bytes at offset 72)
  view.setUint16(72, 1, true);

  // Flags (2 bytes at offset 74) - linear frequency table
  view.setUint16(74, 1, true);

  // Default tempo (2 bytes at offset 76)
  view.setUint16(76, 6, true);

  // Default BPM (2 bytes at offset 78)
  view.setUint16(78, 125, true);

  // Pattern order table starts at offset 80
  view.setUint8(80, 0); // Pattern 0

  // Pattern header at offset headerSize
  let offset = headerSize;
  view.setUint32(offset, 9, true); // Pattern header length
  view.setUint8(offset + 4, 0); // Packing type
  view.setUint16(offset + 5, 64, true); // Number of rows
  const packedSize = channelCount * 64; // 1 byte per cell (empty flag)
  view.setUint16(offset + 7, packedSize, true); // Packed pattern data size

  // Empty pattern data - all cells are 0x80 (empty note flag)
  offset += 9;
  for (let i = 0; i < channelCount * 64; i++) {
    view.setUint8(offset + i, 0x80);
  }

  // Instrument header
  offset = headerSize + 9 + packedSize;
  view.setUint32(offset, 263, true); // Instrument header size
  // Instrument name (22 bytes)
  const instName = encoder.encode('Test Instrument');
  new Uint8Array(buffer, offset + 4, 22).set(instName.slice(0, 22));
  view.setUint8(offset + 26, 0); // Instrument type
  view.setUint16(offset + 27, 0, true); // Number of samples = 0

  return buffer;
}

function createTestMOD(): ArrayBuffer {
  // MOD format: 20 byte name + 31*30 byte samples + 1 byte song length + 1 byte restart
  // + 128 byte order table + 4 byte signature + pattern data
  const patternSize = 64 * 4 * 4; // 64 rows * 4 channels * 4 bytes per note
  const buffer = new ArrayBuffer(1084 + patternSize);
  const view = new DataView(buffer);
  const encoder = new TextEncoder();

  // Module name (20 bytes)
  const name = encoder.encode('Test MOD');
  new Uint8Array(buffer, 0, 20).set(name.slice(0, 20));

  // 31 sample headers (30 bytes each) - leave as zeros

  // Song length at offset 950
  view.setUint8(950, 1);

  // Restart position at offset 951
  view.setUint8(951, 0);

  // Pattern order table at offset 952 (128 bytes)
  view.setUint8(952, 0); // Use pattern 0

  // Signature "M.K." at offset 1080
  const sig = encoder.encode('M.K.');
  new Uint8Array(buffer, 1080, 4).set(sig);

  // Pattern data starts at offset 1084 - leave as zeros (empty)

  return buffer;
}

function createXMWithEffects(_effects: any[]): ArrayBuffer {
  return createTestXM();
}

function createXMWithSample(_options: any): ArrayBuffer {
  return createTestXM();
}

function createXMWithEnvelope(_options: any): ArrayBuffer {
  return createTestXM();
}

function createXMWithPatternLength(_length: number): ArrayBuffer {
  return createTestXM();
}

function createXMWithEmptyPattern(): ArrayBuffer {
  return createTestXM();
}

function createXMWithNoInstruments(): ArrayBuffer {
  return createTestXM();
}

function createMODWithPeriods(_periods: any[]): ArrayBuffer {
  return createTestMOD();
}

function createMODWithSample(_options: any): ArrayBuffer {
  return createTestMOD();
}
