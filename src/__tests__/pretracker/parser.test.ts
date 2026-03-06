/**
 * PreTrackerParser unit tests
 * Tests metadata extraction from PreTracker module files
 */

import { describe, it, expect } from 'vitest';
import {
  isPreTrackerFormat,
  parsePreTrackerFile,
  parsePreTrackerData,
} from '@/lib/import/PreTrackerParser';

describe('PreTrackerParser', () => {
  /**
   * Create a minimal PreTracker test file in memory
   * Structure: "PRT" + version byte + song title (20 bytes) + padding
   */
  function createMinimalPreTrackerBuffer(): ArrayBuffer {
    const buf = new Uint8Array(1024);
    // Write magic bytes
    buf[0] = 0x50; // 'P'
    buf[1] = 0x52; // 'R'
    buf[2] = 0x54; // 'T'
    buf[3] = 0x1b; // Version 1.x

    // Write song title at offset 4
    const title = 'Test Module';
    for (let i = 0; i < title.length; i++) {
      buf[4 + i] = title.charCodeAt(i);
    }

    return buf.buffer;
  }

  describe('isPreTrackerFormat', () => {
    it('should recognize valid PreTracker files by magic bytes', () => {
      const buffer = createMinimalPreTrackerBuffer();
      expect(isPreTrackerFormat(buffer)).toBe(true);
    });

    it('should reject buffers without PRT magic', () => {
      const buf = new Uint8Array(64);
      buf[0] = 0x50; // 'P'
      buf[1] = 0x52; // 'R'
      // Missing 'T'
      expect(isPreTrackerFormat(buf.buffer)).toBe(false);
    });

    it('should reject empty buffers', () => {
      const buf = new ArrayBuffer(0);
      expect(isPreTrackerFormat(buf)).toBe(false);
    });

    it('should reject buffers smaller than magic bytes', () => {
      const buf = new Uint8Array(2);
      buf[0] = 0x50;
      buf[1] = 0x52;
      expect(isPreTrackerFormat(buf.buffer)).toBe(false);
    });
  });

  describe('parsePreTrackerFile', () => {
    it('should parse a valid PreTracker file', () => {
      const buffer = createMinimalPreTrackerBuffer();
      const song = parsePreTrackerFile(buffer, 'test.prt');

      expect(song.format).toBe('MOD');
      expect(song.numChannels).toBe(4);
      expect(song.songLength).toBe(1);
      expect(song.initialBPM).toBe(125);
      expect(song.initialSpeed).toBe(6);
    });

    it('should extract song title from buffer', () => {
      const buffer = createMinimalPreTrackerBuffer();
      const song = parsePreTrackerFile(buffer, 'test.prt');

      expect(song.name).toContain('Test Module');
    });

    it('should create 4 channels with correct properties', () => {
      const buffer = createMinimalPreTrackerBuffer();
      const song = parsePreTrackerFile(buffer, 'test.prt');

      expect(song.patterns.length).toBeGreaterThan(0);
      const pattern = song.patterns[0];
      expect(pattern.channels.length).toBe(4);

      // Check channel properties
      pattern.channels.forEach((ch, idx) => {
        expect(ch.id).toBe(`channel-${idx}`);
        expect(ch.muted).toBe(false);
        expect(ch.solo).toBe(false);
        expect(ch.volume).toBe(100);
        expect(ch.rows.length).toBe(64); // Default pattern length
      });
    });

    it('should create pattern with 64 rows by default', () => {
      const buffer = createMinimalPreTrackerBuffer();
      const song = parsePreTrackerFile(buffer, 'test.prt');

      const pattern = song.patterns[0];
      expect(pattern.length).toBe(64);
      expect(pattern.channels[0].rows.length).toBe(64);
    });

    it('should create empty pattern rows', () => {
      const buffer = createMinimalPreTrackerBuffer();
      const song = parsePreTrackerFile(buffer, 'test.prt');

      const pattern = song.patterns[0];
      const firstRow = pattern.channels[0].rows[0];

      expect(firstRow.note).toBe(0);
      expect(firstRow.instrument).toBe(0);
      expect(firstRow.volume).toBe(0);
      expect(firstRow.effTyp).toBe(0);
      expect(firstRow.eff).toBe(0);
      expect(firstRow.effTyp2).toBe(0);
      expect(firstRow.eff2).toBe(0);
    });

    it('should create at least one instrument', () => {
      const buffer = createMinimalPreTrackerBuffer();
      const song = parsePreTrackerFile(buffer, 'test.prt');

      expect(song.instruments.length).toBeGreaterThan(0);
      expect(song.instruments[0].type).toBe('sample');
      expect(song.instruments[0].synthType).toBe('Sampler');
    });

    it('should use filename as fallback for missing title', () => {
      const buf = new Uint8Array(1024);
      // Write only magic (no title)
      buf[0] = 0x50;
      buf[1] = 0x52;
      buf[2] = 0x54;
      buf[3] = 0x1b;

      const song = parsePreTrackerFile(buf.buffer, 'my-module.prt');
      expect(song.name).toContain('my-module');
    });

    it('should reject invalid PreTracker files', () => {
      const buf = new Uint8Array(64);
      buf[0] = 0x4d; // 'M' (start of MOD magic)
      buf[1] = 0x2e;
      buf[2] = 0x4b;

      expect(() => parsePreTrackerFile(buf.buffer, 'test.mod')).toThrow(
        'not a valid PreTracker file',
      );
    });

    it('should set Amiga periods (linearPeriods=false)', () => {
      const buffer = createMinimalPreTrackerBuffer();
      const song = parsePreTrackerFile(buffer, 'test.prt');

      expect(song.linearPeriods).toBe(false);
    });

    it('should store import metadata', () => {
      const buffer = createMinimalPreTrackerBuffer();
      const song = parsePreTrackerFile(buffer, 'test.prt');

      const metadata = song.patterns[0].importMetadata;
      expect(metadata).toBeDefined();
      expect(metadata!.sourceFormat).toBe('PreTracker');
      expect(metadata!.sourceFile).toBe('test.prt');
      expect(metadata!.originalChannelCount).toBe(4);
      expect(metadata!.importedAt).toBeDefined();
    });
  });

  describe('parsePreTrackerData', () => {
    it('should be an async wrapper around parsePreTrackerFile', async () => {
      const buffer = createMinimalPreTrackerBuffer();
      const song = await parsePreTrackerData(buffer, 'test.prt');

      expect(song.format).toBe('MOD');
      expect(song.numChannels).toBe(4);
    });

    it('should propagate errors from parsePreTrackerFile', async () => {
      const buf = new Uint8Array(64);
      buf[0] = 0x4d;

      await expect(parsePreTrackerData(buf.buffer, 'test.prt')).rejects.toThrow(
        'not a valid PreTracker file',
      );
    });
  });
});
