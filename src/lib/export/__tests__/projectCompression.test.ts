/**
 * Regression tests for project file compression (DVBZ format)
 * and NanoExporter LZMA compression.
 *
 * Guards:
 * - DVBZ compress/decompress round-trip
 * - Backward compatibility with raw JSON input
 * - NanoExporter LZMA round-trip
 * - Compression actually reduces size
 */

import { describe, it, expect } from 'vitest';
import { compressProject, decompressProject, isCompressedProject } from '@/lib/projectCompression';
import { NanoExporter } from '@/lib/export/NanoExporter';
import type { Pattern, TrackerCell } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';

// ── DVBZ Project Compression ───────────────────────────────────────────────

describe('projectCompression — DVBZ format', () => {
  const sampleProject = {
    format: 'devilbox-song',
    version: '1.0.0',
    bpm: 140,
    patterns: [{ id: 0, length: 64, channels: [] }],
    instruments: [{ id: 1, name: 'Bass', synthType: 'TB303' }],
  };

  it('round-trips JSON through compress/decompress', () => {
    const json = JSON.stringify(sampleProject);
    const compressed = compressProject(json);
    const decompressed = decompressProject(compressed);
    expect(decompressed).toBe(json);
  });

  it('compressed output starts with DVBZ magic', () => {
    const compressed = compressProject('{}');
    const bytes = new Uint8Array(compressed);
    expect(bytes[0]).toBe(0x44); // D
    expect(bytes[1]).toBe(0x56); // V
    expect(bytes[2]).toBe(0x42); // B
    expect(bytes[3]).toBe(0x5A); // Z
    expect(bytes[4]).toBe(1);    // version
  });

  it('stores uncompressed size in header', () => {
    const json = JSON.stringify(sampleProject);
    const compressed = compressProject(json);
    const view = new DataView(compressed);
    const storedSize = view.getUint32(5, true);
    const encoder = new TextEncoder();
    expect(storedSize).toBe(encoder.encode(json).length);
  });

  it('compressed output is smaller than raw JSON', () => {
    const json = JSON.stringify(sampleProject);
    const compressed = compressProject(json);
    expect(compressed.byteLength).toBeLessThan(new TextEncoder().encode(json).length);
  });

  it('isCompressedProject detects DVBZ format', () => {
    const compressed = compressProject('{}');
    expect(isCompressedProject(compressed)).toBe(true);
  });

  it('isCompressedProject rejects raw JSON', () => {
    const raw = new TextEncoder().encode('{"format":"devilbox-song"}');
    expect(isCompressedProject(raw.buffer)).toBe(false);
  });

  it('decompressProject handles raw JSON (backward compat)', () => {
    const json = '{"format":"devilbox-song","bpm":120}';
    const raw = new TextEncoder().encode(json);
    const result = decompressProject(raw.buffer);
    expect(result).toBe(json);
    expect(JSON.parse(result).bpm).toBe(120);
  });

  it('handles empty JSON object', () => {
    const json = '{}';
    const compressed = compressProject(json);
    expect(decompressProject(compressed)).toBe(json);
  });

  it('handles large project data', () => {
    const large = { data: 'x'.repeat(100000), nested: Array(1000).fill({ a: 1, b: 2 }) };
    const json = JSON.stringify(large);
    const compressed = compressProject(json);
    expect(decompressProject(compressed)).toBe(json);
    // Should achieve meaningful compression on repetitive data
    expect(compressed.byteLength).toBeLessThan(json.length / 2);
  });

  it('handles unicode content', () => {
    const json = JSON.stringify({ name: '🎵 Tëst Sóng 日本語', author: 'Ünïcödë' });
    const compressed = compressProject(json);
    expect(decompressProject(compressed)).toBe(json);
  });
});

// ── NanoExporter LZMA Compression ──────────────────────────────────────────

function makeTestCell(note = 0, instrument = 0, volume = 0, effTyp = 0, eff = 0): TrackerCell {
  return { note, instrument, volume, effTyp, eff, effTyp2: 0, eff2: 0 };
}

function makeTestPattern(numChannels: number, numRows: number): Pattern {
  const channels = Array.from({ length: numChannels }, () => ({
    rows: Array.from({ length: numRows }, (_, i) =>
      i % 4 === 0 ? makeTestCell(48 + (i % 12), 1, 64, 0, 0) : makeTestCell()
    ),
  }));
  return { id: 0, length: numRows, channels } as unknown as Pattern;
}

function makeTestInstrument(id: number): InstrumentConfig {
  return {
    id,
    name: `Inst ${id}`,
    synthType: 'Synth',
    volume: -6,
    pan: 0,
  } as InstrumentConfig;
}

describe('NanoExporter — LZMA compression', () => {
  const instruments = [makeTestInstrument(1), makeTestInstrument(2)];
  const patterns = [makeTestPattern(4, 64)];
  const patternOrder = [0];

  it('exportCompressed produces version 2 header', () => {
    const compressed = NanoExporter.exportCompressed(instruments, patterns, patternOrder, 140, 6);
    expect(compressed[0]).toBe(0xDB);
    expect(compressed[1]).toBe(0x58);
    expect(compressed[2]).toBe(0x4E);
    expect(compressed[3]).toBe(0x21);
    expect(compressed[4]).toBe(2); // version 2 = LZMA
  });

  it('stores uncompressed size in header', () => {
    const raw = NanoExporter.export(instruments, patterns, patternOrder, 140, 6);
    const compressed = NanoExporter.exportCompressed(instruments, patterns, patternOrder, 140, 6);
    const view = new DataView(compressed.buffer, compressed.byteOffset);
    const storedSize = view.getUint32(5, true);
    expect(storedSize).toBe(raw.length);
  });

  it('LZMA compressed is smaller than raw', () => {
    const raw = NanoExporter.export(instruments, patterns, patternOrder, 140, 6);
    const compressed = NanoExporter.exportCompressed(instruments, patterns, patternOrder, 140, 6);
    expect(compressed.length).toBeLessThan(raw.length);
  });

  it('round-trips through compress/decompress', () => {
    const raw = NanoExporter.export(instruments, patterns, patternOrder, 140, 6);
    const compressed = NanoExporter.exportCompressed(instruments, patterns, patternOrder, 140, 6);
    const decompressed = NanoExporter.decompress(compressed);

    // Verify the decompressed payload matches raw v1 data
    expect(decompressed.length).toBe(raw.length);
    for (let i = 0; i < raw.length; i++) {
      expect(decompressed[i]).toBe(raw[i]);
    }
  });

  it('decompress passes through v1 uncompressed data', () => {
    const raw = NanoExporter.export(instruments, patterns, patternOrder, 140, 6);
    const passthrough = NanoExporter.decompress(raw);
    expect(passthrough).toBe(raw); // Same reference — no copy
  });

  it('decompress rejects invalid magic', () => {
    const bad = new Uint8Array([0x00, 0x00, 0x00, 0x00, 1, 0, 0, 0, 0]);
    expect(() => NanoExporter.decompress(bad)).toThrow('bad magic');
  });

  it('decompress rejects unsupported version', () => {
    const bad = new Uint8Array([0xDB, 0x58, 0x4E, 0x21, 99, 0, 0, 0, 0]);
    expect(() => NanoExporter.decompress(bad)).toThrow('Unsupported Nano version');
  });
});
