import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { extractInstrumentsFromHvl } from '../formats/HivelyParser';

const HVL_DIR = resolve(import.meta.dirname, '../../../../Reference Music/HivelyTracker');

function firstHvlFile(): string {
  const entries = readdirSync(HVL_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const sub = resolve(HVL_DIR, entry.name);
      const files = readdirSync(sub).filter(f => /\.(hvl|ahx)$/i.test(f));
      if (files.length) return resolve(sub, files[0]);
    } else if (/\.(hvl|ahx)$/i.test(entry.name)) {
      return resolve(HVL_DIR, entry.name);
    }
  }
  throw new Error(`No HVL/AHX files found in ${HVL_DIR}`);
}

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('extractInstrumentsFromHvl', () => {
  it('returns non-empty instrument array from a real HVL file', () => {
    const buf = loadBuf(firstHvlFile());
    const instruments = extractInstrumentsFromHvl(buf);
    expect(instruments.length).toBeGreaterThan(0);
  });

  it('each entry has a config with envelope and performanceList', () => {
    const buf = loadBuf(firstHvlFile());
    const instruments = extractInstrumentsFromHvl(buf);
    for (const { config } of instruments) {
      expect(config.envelope).toBeDefined();
      expect(config.performanceList).toBeDefined();
      expect(Array.isArray(config.performanceList.entries)).toBe(true);
    }
  });

  it('name is a string (may be empty)', () => {
    const buf = loadBuf(firstHvlFile());
    const instruments = extractInstrumentsFromHvl(buf);
    for (const { name } of instruments) {
      expect(typeof name).toBe('string');
    }
  });

  it('throws on garbage buffer', () => {
    expect(() => extractInstrumentsFromHvl(new ArrayBuffer(20))).toThrow();
  });
});
