#!/usr/bin/env npx tsx
/**
 * binary-inspector.ts — Amiga Binary Structure Analysis Tool
 *
 * Helps reverse-engineer unknown Amiga music formats by providing:
 *   - Hex dump (16 bytes/row, with ASCII column)
 *   - Printable string scanner (ASCII runs ≥ 4 chars with offsets)
 *   - Instrument table detector (repeating fixed-stride patterns)
 *   - Amiga-specific fingerprints (ProTracker, HUNK, Amiga periods, etc.)
 *   - Big-endian u16/u32 value display at offset ranges
 *
 * Usage:
 *   npx tsx scripts/binary-inspector.ts <file> [options]
 *   npx tsx scripts/binary-inspector.ts <file> --hex [--offset 0x100] [--length 256]
 *   npx tsx scripts/binary-inspector.ts <file> --strings
 *   npx tsx scripts/binary-inspector.ts <file> --tables
 *   npx tsx scripts/binary-inspector.ts <file> --amiga
 *   npx tsx scripts/binary-inspector.ts <file> --words --offset 0 --length 64
 *   npx tsx scripts/binary-inspector.ts <file> --all
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── CLI parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  printUsage();
  process.exit(0);
}

const filePath = resolve(args[0]);

function flagVal(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function hasFlag(...flags: string[]): boolean {
  return flags.some(f => args.includes(f));
}

function parseNum(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  return s.startsWith('0x') || s.startsWith('0X')
    ? parseInt(s, 16)
    : parseInt(s, 10);
}

const showHex    = hasFlag('--hex', '--all', '-a');
const showStr    = hasFlag('--strings', '--all', '-a');
const showTables = hasFlag('--tables', '--all', '-a');
const showAmiga  = hasFlag('--amiga', '--all', '-a');
const showWords  = hasFlag('--words', '--all', '-a');
const showAll    = hasFlag('--all', '-a');

// If no mode flags, default to --all
const anyMode = showHex || showStr || showTables || showAmiga || showWords;

const offsetArg = parseNum(flagVal('--offset'));
const lengthArg = parseNum(flagVal('--length'));

// ── Load file ─────────────────────────────────────────────────────────────────

let buf: Buffer;
try {
  buf = readFileSync(filePath);
} catch {
  console.error(`❌ Cannot read file: ${filePath}`);
  process.exit(1);
}

const data = new Uint8Array(buf);
const fileSize = data.length;

console.log(`\n📁 File: ${filePath}`);
console.log(`   Size: ${fileSize} bytes (0x${fileSize.toString(16).toUpperCase()})\n`);

// ── Hex dump ──────────────────────────────────────────────────────────────────

function hexDump(offset: number, length: number) {
  const end = Math.min(offset + length, fileSize);
  console.log(`── Hex Dump [0x${hex4(offset)}..0x${hex4(end - 1)}] ──────────────────────────────────`);
  for (let i = offset; i < end; i += 16) {
    const row = data.slice(i, Math.min(i + 16, end));
    const hexPart = Array.from(row).map(b => hex2(b)).join(' ').padEnd(48);
    const ascPart = Array.from(row).map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.').join('');
    console.log(`  ${hex6(i)}  ${hexPart}  |${ascPart}|`);
  }
  console.log();
}

// ── String scanner ────────────────────────────────────────────────────────────

function scanStrings(minLen = 4) {
  console.log(`── Printable Strings (≥${minLen} chars) ──────────────────────────────────────────`);
  let count = 0;
  let start = -1;
  let current = '';

  function flush(end: number) {
    if (current.length >= minLen) {
      console.log(`  0x${hex6(start)}  ${JSON.stringify(current)}`);
      count++;
    }
    start = -1;
    current = '';
  }

  for (let i = 0; i < fileSize; i++) {
    const b = data[i];
    if (b >= 0x20 && b < 0x7f) {
      if (start === -1) start = i;
      current += String.fromCharCode(b);
    } else {
      if (current.length > 0) flush(i);
    }
  }
  if (current.length > 0) flush(fileSize);

  if (count === 0) console.log('  (no printable strings found)');
  console.log(`\n  Total: ${count} strings\n`);
}

// ── Instrument table detector ─────────────────────────────────────────────────

const AMIGA_STRIDES = [16, 22, 24, 30, 32, 40, 64, 128];
const MIN_REPETITIONS = 4;

interface TableHit {
  offset: number;
  stride: number;
  count: number;
  score: number;
}

function detectInstrumentTables() {
  console.log('── Potential Instrument Tables (fixed-stride repeating patterns) ─────────────');

  const hits: TableHit[] = [];

  for (const stride of AMIGA_STRIDES) {
    // Scan for stride-aligned regions with low entropy variation (likely structs)
    for (let base = 0; base + stride * MIN_REPETITIONS <= fileSize; base++) {
      // Quick check: do at least MIN_REPETITIONS consecutive stride-aligned blocks
      // look structurally similar? (i.e., byte at position 0 within each block is
      // often a length/type byte with values in a plausible range)
      let repetitions = 1;
      let prev = base;
      let similar = 0;

      while (prev + stride < fileSize) {
        const next = prev + stride;
        // Heuristic: compare first 4 bytes pattern (at least 1 byte must match)
        let matches = 0;
        for (let k = 0; k < Math.min(4, stride); k++) {
          if (Math.abs(data[prev + k] - data[next + k]) <= 2) matches++;
        }
        if (matches >= 2) {
          similar++;
          prev = next;
          repetitions++;
          if (repetitions >= 32) break; // cap search
        } else {
          break;
        }
      }

      if (repetitions >= MIN_REPETITIONS) {
        // Avoid reporting overlapping hits (keep highest-count for same region)
        const score = repetitions * stride;
        const existing = hits.find(h => Math.abs(h.offset - base) < stride * 2 && h.stride === stride);
        if (existing) {
          if (score > existing.score) {
            existing.offset = base;
            existing.count = repetitions;
            existing.score = score;
          }
        } else {
          hits.push({ offset: base, stride, count: repetitions, score });
        }
        // Skip past this block to avoid explosion
        base += stride * Math.max(repetitions - 1, 1) - 1;
      }
    }
  }

  // Sort by score descending
  hits.sort((a, b) => b.score - a.score);

  if (hits.length === 0) {
    console.log('  (no repeating fixed-stride patterns detected)\n');
    return;
  }

  console.log('  Offset    Stride  Count  Notes');
  console.log('  ────────  ──────  ─────  ──────────────────────────────');
  for (const h of hits.slice(0, 20)) {
    const note = strideNote(h.stride);
    console.log(`  0x${hex6(h.offset)}  ${String(h.stride).padStart(6)}  ${String(h.count).padStart(5)}  ${note}`);
  }
  console.log();
}

function strideNote(stride: number): string {
  const notes: Record<number, string> = {
    16: 'possible: simple instrument header (name + 2 params)',
    22: 'classic ProTracker sample header (name[22] + length + finetune + vol + loop)',
    24: 'common 24-byte instrument struct',
    30: 'SoundMon / SidMon-style instrument',
    32: 'FutureComposer instrument or wave block',
    40: 'extended instrument struct with envelope',
    64: 'large instrument struct or waveform table',
    128: 'wavetable or macro block',
  };
  return notes[stride] ?? `stride-${stride} pattern`;
}

// ── Amiga fingerprints ────────────────────────────────────────────────────────

// Standard Amiga ProTracker periods for octave 1-3
const AMIGA_PERIODS = new Set([
  // Octave 0 (very low)
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 906,
  // Octave 1
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  // Octave 2
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  // Octave 3
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
]);

// Common Amiga magic bytes
const MAGIC_PATTERNS: Array<{ name: string; offset: number; bytes: number[] }> = [
  { name: 'ProTracker M.K.',   offset: 1080, bytes: [0x4D, 0x2E, 0x4B, 0x2E] },
  { name: 'ProTracker M!K!',   offset: 1080, bytes: [0x4D, 0x21, 0x4B, 0x21] },
  { name: 'ProTracker 4CHN',   offset: 1080, bytes: [0x34, 0x43, 0x48, 0x4E] },
  { name: 'ProTracker 6CHN',   offset: 1080, bytes: [0x36, 0x43, 0x48, 0x4E] },
  { name: 'ProTracker 8CHN',   offset: 1080, bytes: [0x38, 0x43, 0x48, 0x4E] },
  { name: 'FC13 magic',        offset: 0,    bytes: [0x46, 0x43, 0x31, 0x33] },
  { name: 'FC14 magic',        offset: 0,    bytes: [0x46, 0x43, 0x31, 0x34] },
  { name: 'SMOD magic',        offset: 0,    bytes: [0x53, 0x4D, 0x4F, 0x44] },
  { name: 'HUNK_HEADER',       offset: 0,    bytes: [0x00, 0x00, 0x03, 0xF3] },
  { name: 'HUNK_UNIT',         offset: 0,    bytes: [0x00, 0x00, 0x03, 0xE7] },
  { name: 'MDAT (TFMX)',       offset: 0,    bytes: [0x6D, 0x64, 0x61, 0x74] },
  { name: 'TFMX magic',        offset: 0,    bytes: [0x54, 0x46, 0x4D, 0x58] },
  { name: 'RJP magic (SNG.)',  offset: 0,    bytes: [0x53, 0x4E, 0x47, 0x2E] },
  { name: 'SoundMon BP2 magic', offset: 0,   bytes: [0x42, 0x50, 0x32, 0x21] },
  { name: 'SoundMon BP3 magic', offset: 0,   bytes: [0x42, 0x50, 0x33, 0x21] },
  { name: 'IFF FORM',          offset: 0,    bytes: [0x46, 0x4F, 0x52, 0x4D] },
  { name: 'IFF 8SVX',          offset: 8,    bytes: [0x38, 0x53, 0x56, 0x58] },
];

function detectAmigaFingerprints() {
  console.log('── Amiga Fingerprints ───────────────────────────────────────────────────────');

  // Magic bytes
  console.log('  Magic patterns:');
  let found = 0;
  for (const pat of MAGIC_PATTERNS) {
    if (pat.offset + pat.bytes.length > fileSize) continue;
    let match = true;
    for (let i = 0; i < pat.bytes.length; i++) {
      if (data[pat.offset + i] !== pat.bytes[i]) { match = false; break; }
    }
    if (match) {
      console.log(`    ✅ ${pat.name} at offset 0x${hex6(pat.offset)}`);
      found++;
    }
  }
  if (found === 0) console.log('    (no known magic patterns found)');

  // Big-endian u16 Amiga period scan
  console.log('\n  Amiga period values (big-endian u16):');
  const periodOffsets: number[] = [];
  for (let i = 0; i < fileSize - 1; i++) {
    const val = (data[i] << 8) | data[i + 1];
    if (AMIGA_PERIODS.has(val)) {
      periodOffsets.push(i);
    }
  }
  if (periodOffsets.length === 0) {
    console.log('    (no Amiga period values found)');
  } else {
    const shown = periodOffsets.slice(0, 16);
    const vals = shown.map(o => `0x${hex6(o)}=${(data[o] << 8) | data[o + 1]}`).join(', ');
    console.log(`    Found ${periodOffsets.length} period values. First ${shown.length}: ${vals}`);
    if (periodOffsets.length > 16) {
      console.log(`    ... and ${periodOffsets.length - 16} more`);
    }
  }

  // Check for potential Amiga sample rate hint (3546895 / period = Hz, Paula clock)
  console.log('\n  First 16 bytes (big-endian u32 candidates):');
  for (let i = 0; i < Math.min(16, fileSize - 3); i += 4) {
    const val = (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3];
    console.log(`    +0x${hex2(i)}: 0x${val.toString(16).padStart(8, '0').toUpperCase()} = ${val}`);
  }
  console.log();
}

// ── Big-endian word/dword display ─────────────────────────────────────────────

function showWordTable(offset: number, length: number) {
  const end = Math.min(offset + length, fileSize);
  console.log(`── Big-Endian Values [0x${hex4(offset)}..0x${hex4(end - 1)}] ─────────────────────────────`);
  console.log('  Offset    u8   u16(BE)  u32(BE)       i16(BE)  Ascii');
  console.log('  ────────  ───  ───────  ────────────  ───────  ─────');
  for (let i = offset; i < end; i += 2) {
    if (i + 1 >= fileSize) break;
    const u8 = data[i];
    const u16 = (data[i] << 8) | data[i + 1];
    const i16 = u16 >= 0x8000 ? u16 - 0x10000 : u16;
    let u32 = 0;
    let u32str = '    N/A    ';
    if (i + 3 < fileSize) {
      u32 = (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3];
      u32str = String(u32 >>> 0).padStart(11);
    }
    const asc = [data[i], data[i + 1]]
      .map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')
      .join('');
    console.log(
      `  0x${hex6(i)}  ${String(u8).padStart(3)}  ${String(u16).padStart(5)} (0x${hex4(u16)})  ${u32str}  ${String(i16).padStart(6)}   ${asc}`
    );
  }
  console.log();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hex2(n: number): string { return n.toString(16).padStart(2, '0').toUpperCase(); }
function hex4(n: number): string { return n.toString(16).padStart(4, '0').toUpperCase(); }
function hex6(n: number): string { return n.toString(16).padStart(6, '0').toUpperCase(); }

function printUsage() {
  console.log(`
binary-inspector.ts — Amiga binary structure analysis tool

Usage:
  npx tsx scripts/binary-inspector.ts <file> [options]

Options:
  --hex               Hex dump (use with --offset, --length)
  --strings           Find all printable ASCII strings ≥ 4 chars
  --tables            Detect repeating fixed-stride patterns (instrument tables)
  --amiga             Amiga-specific fingerprints (magic bytes, periods, u32s)
  --words             Big-endian u16/u32 table (use with --offset, --length)
  --all, -a           Run all analyses
  --offset <n>        Hex dump / words start offset (hex: 0x100 or decimal)
  --length <n>        Hex dump / words byte count (default: 256)

Examples:
  npx tsx scripts/binary-inspector.ts "Reference Music/Jeroen Tel/jt.cybernoid" --all
  npx tsx scripts/binary-inspector.ts somefile.jt --hex --offset 0x40 --length 128
  npx tsx scripts/binary-inspector.ts somefile.jt --strings
  npx tsx scripts/binary-inspector.ts somefile.jt --words --offset 0 --length 64
`);
}

// ── Run selected analyses ─────────────────────────────────────────────────────

const hexOffset = offsetArg ?? 0;
const hexLength = lengthArg ?? 256;

if (!anyMode || showAll || showHex)    hexDump(hexOffset, hexLength);
if (!anyMode || showAll || showStr)    scanStrings();
if (!anyMode || showAll || showTables) detectInstrumentTables();
if (!anyMode || showAll || showAmiga)  detectAmigaFingerprints();
if (!anyMode || showAll || showWords)  showWordTable(hexOffset, hexLength);
