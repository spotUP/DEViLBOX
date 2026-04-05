/**
 * SongCleanupAnalyzer — pure analysis functions for detecting unused/redundant song data.
 *
 * All functions are side-effect-free and return plain data structures.
 */

import type { Pattern } from '../../types/tracker';
import type { InstrumentConfig } from '../../types/instrument';

// ── Public types ────────────────────────────────────────────────────────────

export interface UnusedInstrument {
  index: number; // 1-based instrument number
  name: string;
}

export interface UnusedPattern {
  index: number;
  rowCount: number;
}

export interface LoopTailEntry {
  instrumentIndex: number; // 1-based
  name: string;
  tailBytes: number;
}

export interface DuplicateGroup {
  hash: string;
  instrumentIndices: number[]; // 1-based
  names: string[];
}

export interface CleanupReport {
  unusedInstruments: UnusedInstrument[];
  unusedPatterns: UnusedPattern[];
  loopTails: LoopTailEntry[];
  duplicates: DuplicateGroup[];
  totalReclaimableBytes: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * FNV-1a 32-bit hash of sample data, sampling every 64th value for speed.
 * Returns a hex string.
 */
function hashSampleData(buffer: ArrayBuffer): string {
  const data = new Int16Array(buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 64) {
    h ^= data[i] & 0xffff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Include exact length so buffers that differ only in size don't collide.
  h ^= data.length;
  h = Math.imul(h, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

// ── Core analysis functions ──────────────────────────────────────────────────

/**
 * Scan all patterns → channels → rows and collect every instrument index > 0.
 * Checks all four note columns (instrument, instrument2, instrument3, instrument4).
 */
function findUsedInstruments(patterns: Pattern[]): Set<number> {
  const used = new Set<number>();
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (cell.instrument > 0) used.add(cell.instrument);
        if (cell.instrument2 != null && cell.instrument2 > 0) used.add(cell.instrument2);
        if (cell.instrument3 != null && cell.instrument3 > 0) used.add(cell.instrument3);
        if (cell.instrument4 != null && cell.instrument4 > 0) used.add(cell.instrument4);
      }
    }
  }
  return used;
}

/**
 * Return patterns whose index does not appear in patternOrder.
 * Pattern 0 is never considered unused.
 */
function findUnusedPatterns(patterns: Pattern[], patternOrder: number[]): UnusedPattern[] {
  const ordered = new Set(patternOrder);
  const unused: UnusedPattern[] = [];
  for (let i = 1; i < patterns.length; i++) {
    if (!ordered.has(i)) {
      unused.push({ index: i, rowCount: patterns[i].length });
    }
  }
  return unused;
}

/**
 * For each instrument that has a looped sample, compute how many bytes of audio
 * data lie after the loop end point (the "tail" that will never be heard after
 * the first play-through).
 *
 * tailBytes = (totalFrames - loopEndFrame) * 2  (16-bit PCM → 2 bytes per frame)
 */
function findLoopTails(instruments: InstrumentConfig[]): LoopTailEntry[] {
  const tails: LoopTailEntry[] = [];
  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i];
    const s = inst.sample;
    if (!s) continue;
    if (!s.loop) continue;
    if (s.loopType === 'off') continue;
    if (!s.audioBuffer || s.audioBuffer.byteLength === 0) continue;

    // loopEnd is a sample frame index.
    // Total frames = byteLength / 2 (Int16 samples).
    const totalFrames = s.audioBuffer.byteLength / 2;
    const loopEndFrame = s.loopEnd;
    if (loopEndFrame <= 0 || loopEndFrame >= totalFrames) continue;

    const tailFrames = totalFrames - loopEndFrame;
    const tailBytes = tailFrames * 2;
    tails.push({
      instrumentIndex: inst.id, // id is 1-based (XM convention)
      name: inst.name,
      tailBytes,
    });
  }
  return tails;
}

/**
 * Group instruments by sample content hash. Return groups where >1 instrument
 * shares the same sample data (duplicates).
 */
function findDuplicates(instruments: InstrumentConfig[]): DuplicateGroup[] {
  const byHash = new Map<string, { indices: number[]; names: string[] }>();

  for (const inst of instruments) {
    const s = inst.sample;
    if (!s?.audioBuffer || s.audioBuffer.byteLength === 0) continue;

    const hash = hashSampleData(s.audioBuffer);
    let group = byHash.get(hash);
    if (!group) {
      group = { indices: [], names: [] };
      byHash.set(hash, group);
    }
    group.indices.push(inst.id);
    group.names.push(inst.name);
  }

  const result: DuplicateGroup[] = [];
  for (const [hash, { indices, names }] of byHash) {
    if (indices.length > 1) {
      result.push({ hash, instrumentIndices: indices, names });
    }
  }
  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function analyzeSongForCleanup(
  patterns: Pattern[],
  patternOrder: number[],
  instruments: InstrumentConfig[],
): CleanupReport {
  const usedInstruments = findUsedInstruments(patterns);

  // Unused instruments — 1-based id, skip id=0 if present.
  const unusedInstruments: UnusedInstrument[] = instruments
    .filter((inst) => inst.id > 0 && !usedInstruments.has(inst.id))
    .map((inst) => ({ index: inst.id, name: inst.name }));

  const unusedPatterns = findUnusedPatterns(patterns, patternOrder);
  const loopTails = findLoopTails(instruments);
  const duplicates = findDuplicates(instruments);

  // Reclaimable bytes:
  //   • Unused instrument sample buffers
  //   • Loop tails
  //   • Duplicate copies (keep one, count the rest)
  let totalReclaimableBytes = 0;

  for (const unused of unusedInstruments) {
    const inst = instruments.find((ins) => ins.id === unused.index);
    if (inst?.sample?.audioBuffer) {
      totalReclaimableBytes += inst.sample.audioBuffer.byteLength;
    }
  }

  for (const tail of loopTails) {
    totalReclaimableBytes += tail.tailBytes;
  }

  for (const group of duplicates) {
    // Each extra copy beyond the first is reclaimable.
    const firstInst = instruments.find((ins) => ins.id === group.instrumentIndices[0]);
    if (firstInst?.sample?.audioBuffer) {
      const copyBytes = firstInst.sample.audioBuffer.byteLength;
      totalReclaimableBytes += copyBytes * (group.instrumentIndices.length - 1);
    }
  }

  return {
    unusedInstruments,
    unusedPatterns,
    loopTails,
    duplicates,
    totalReclaimableBytes,
  };
}
