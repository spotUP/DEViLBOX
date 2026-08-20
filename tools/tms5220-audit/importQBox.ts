/**
 * importQBox.ts — import authentic TI LPC recordings (ti_lpc README strings) as
 * TMS5220Frame[] and emit src/generated/tms5220Recordings.ts.
 *
 * Bitstream facts (from MAME tms5220.cpp / tms5110r.hxx):
 * - TMC0281/TMS5100/TMS5110: E(4) R(1) P(5) K(5,5,4,4,4,4,4,3,3,3)
 * - TMS5200/TMS5220:          E(4) R(1) P(6) K(same)   <- 6-bit pitch
 *
 * Pitch is an INDEX into a chip-specific period table. Our emulator is a
 * TMC0281 (5-bit, 32-entry patent pitch table), so 6-bit frames must have
 * their pitch re-indexed to the nearest 5-bit period. Energy and K indices
 * pass through unchanged — the emulator maps them through its own tables.
 *
 * Verified by regression: COLOR/YOUR SCORE (tms5100) decode frame-for-frame
 * identical to the same words in our VSM ROMs.
 *
 * Usage:
 *   npx tsx tools/tms5220-audit/importQBox.ts [out.ts]
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { QBOX_RECORDINGS } from './qboxStrings';
import { parseLPCFramesFromPosition, type LPCFrame } from '../../src/engine/speech/VSMROMParser';
import type { TMS5220Frame } from '../../src/engine/speech/tms5220PhonemeMap';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');

// TMC0281 pitch periods (32 entries, 5-bit index) — TI_0280_2801_PATENT_PITCH.
// Must match pitch_table[] in mame-wasm/tms5220/TMS5220Synth.cpp.
const PITCH_TABLE_5BIT = [
  0, 41, 43, 45, 47, 49, 51, 53,
  55, 58, 60, 63, 66, 70, 73, 76,
  79, 83, 87, 90, 94, 99, 103, 107,
  112, 118, 123, 129, 134, 140, 147, 153,
];

// TMS5220 pitch periods (64 entries, 6-bit index) — TI_5220_PITCH.
const PITCH_TABLE_6BIT = [
  0, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37,
  38, 39, 40, 41, 42, 44, 46, 48,
  50, 52, 53, 56, 58, 60, 62, 65,
  68, 70, 72, 76, 78, 80, 84, 86,
  91, 94, 98, 101, 105, 109, 114, 118,
  122, 127, 132, 137, 142, 148, 153, 159,
];

/** Map a 6-bit pitch index to the nearest 5-bit index by period value. */
export function pitch6To5(pitch6: number): number {
  if (pitch6 === 0) return 0; // unvoiced
  const period = PITCH_TABLE_6BIT[Math.min(pitch6, 63)];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < 32; i++) {
    const diff = Math.abs(PITCH_TABLE_5BIT[i] - period);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

function parseHex(hex: string): Uint8Array {
  const bytes = hex
    .replace(/0x/gi, '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => parseInt(s, 16));
  return Uint8Array.from(bytes);
}

/**
 * Convert parsed LPC frames to TMS5220Frame[] (the synth/pack format).
 * pitchBits selects the pitch field width of the source stream; 6-bit
 * streams are re-indexed to the TMC0281 5-bit table. Each frame is 25 ms
 * (one MAME frame), matching the authentic recording timing.
 */
export function lpcFramesToTMS5220(frames: LPCFrame[], pitchBits: 5 | 6): TMS5220Frame[] {
  return frames.map(f => ({
    k: f.repeat ? [] : f.k,
    energy: f.energy,
    pitch: pitchBits === 6 ? pitch6To5(f.pitch) : f.pitch,
    unvoiced: f.unvoiced,
    durationMs: 25,
  }));
}

/**
 * Cross-check a tms5100/5110 recording against the same word in the VSM ROMs.
 * Returns the frame diff count, or null if the word isn't in the ROM.
 */
export function diffVsRom(
  frames: LPCFrame[],
): { romFrames: LPCFrame[]; diffs: number } | null {
  const rom = Buffer.concat([
    readFileSync(join(ROOT, 'public/roms/snspell/tmc0351n2l.vsm')),
    readFileSync(join(ROOT, 'public/roms/snspell/tmc0352n2l.vsm')),
  ]);

  // Reuse the directory parser to find the recording's byte address.
  // It's the same file the app ships; the address table is self-describing.
  // Simple search: scan byte-aligned positions for the first frame matching
  // the recording's first two frames (energy+pitch). Good enough for a
  // regression check on words we already know exist (COLOR, YOUR SCORE).
  const want = frames.slice(0, 2);
  if (want.length < 2) return null;

  for (let addr = 0; addr < rom.length - 8; addr++) {
    const cand = parseLPCFramesFromPosition(rom, addr * 8);
    if (cand.length >= 2 && framesMatch(cand, want, 2)) {
      const diffs = countFrameDiffs(cand, frames);
      return { romFrames: cand, diffs };
    }
  }
  return null;
}

function framesMatch(a: LPCFrame[], b: LPCFrame[], count: number): boolean {
  for (let i = 0; i < count; i++) {
    if (a[i].energy !== b[i].energy || a[i].pitch !== b[i].pitch || a[i].repeat !== b[i].repeat) {
      return false;
    }
  }
  return true;
}

function countFrameDiffs(a: LPCFrame[], b: LPCFrame[]): number {
  const n = Math.min(a.length, b.length);
  let diffs = 0;
  for (let i = 0; i < n; i++) {
    const ka = JSON.stringify(a[i]);
    const kb = JSON.stringify(b[i]);
    if (ka !== kb) diffs++;
  }
  return diffs + Math.abs(a.length - b.length);
}

function emitModule(recordings: Array<{ label: string; chip: string; frames: TMS5220Frame[] }>): string {
  const lines: string[] = [];
  lines.push(`/**
 * tms5220Recordings.ts — GENERATED by tools/tms5220-audit/importQBox.ts.
 * DO NOT EDIT. Authentic TI LPC recordings (ti_lpc/QBoxPro) imported as
 * TMS5220Frame[]; 6-bit-pitch (TMS5200/5220) streams re-indexed to the
 * TMC0281 5-bit pitch table.
 */
import type { TMS5220Frame } from '../engine/speech/tms5220PhonemeMap';

export interface ImportedRecording {
  word: string;
  chip: string;
  frames: TMS5220Frame[];
}

export const IMPORTED_RECORDINGS: ImportedRecording[] = [`);
  for (const r of recordings) {
    lines.push(`  {
    word: ${JSON.stringify(r.label)},
    chip: ${JSON.stringify(r.chip)},
    frames: [`);
    for (const f of r.frames) {
      lines.push(
        `      { k: ${JSON.stringify(f.k)}, energy: ${f.energy}, pitch: ${f.pitch}, unvoiced: ${f.unvoiced}, durationMs: ${f.durationMs} },`,
      );
    }
    lines.push('    ],');
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');
  lines.push(`export const IMPORTED_RECORDING_WORDS: string[] = [`);
  for (const r of recordings) {
    lines.push(`  ${JSON.stringify(r.label)},`);
  }
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}

const CHIP_PITCH_BITS: Record<string, 5 | 6> = {
  tms5100: 5,
  tms5110: 5,
  tms5200: 6,
  tms5220: 6,
};

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const outPath = process.argv[2] ?? join(ROOT, 'src/generated/tms5220Recordings.ts');

  const results: string[] = [];
  const imported: Array<{ label: string; chip: string; frames: TMS5220Frame[] }> = [];

  for (const rec of QBOX_RECORDINGS) {
    const data = parseHex(rec.hex);
    const pitchBits = CHIP_PITCH_BITS[rec.chip] ?? 5;
    const frames = parseLPCFramesFromPosition(data, 0, pitchBits);

    let line = `${rec.label.padEnd(16)} ${rec.chip.padEnd(10)} frames=${String(frames.length).padStart(3)} bytes=${data.length}`;

    if (frames.length < 3) {
      line += '  SKIPPED (too few frames)';
      results.push(line);
      continue;
    }

    if (rec.chip === 'tms5100' || rec.chip === 'tms5110') {
      const romCheck = diffVsRom(frames);
      if (romCheck) {
        line += `  romMatch: diffs=${romCheck.diffs}/${romCheck.romFrames.length}`;
      }
    }

    imported.push({ label: rec.label, chip: rec.chip, frames: lpcFramesToTMS5220(frames, pitchBits) });
    results.push(line);
  }

  writeFileSync(outPath, emitModule(imported));
  console.log(results.join('\n'));
  console.log(`\nwrote ${outPath} (${imported.length} recordings)`);
}