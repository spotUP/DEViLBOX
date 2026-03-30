#!/usr/bin/env npx tsx
/**
 * paula-capture.ts — Capture Paula writes from a Dave Lowe WASM module
 *
 * Usage: npx tsx tools/paula-capture.ts <file.dl> [--ticks N] [--speed S]
 *
 * Loads the module, enables capture, renders N ticks (default: 3000 = ~60s at 50Hz),
 * then dumps captured note events as JSON.
 *
 * Output: { events: [{tick, channel, period, volume}...], patterns: [...] }
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// ── Amiga period → note name mapping ─────────────────────────────────────

const PERIOD_TABLE = [
  // Octave 1 (C-1 to B-1)
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  // Octave 2 (C-2 to B-2)
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  // Octave 3 (C-3 to B-3)
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function periodToNoteName(period: number): string {
  if (period === 0) return '---';
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < PERIOD_TABLE.length; i++) {
    const d = Math.abs(PERIOD_TABLE[i] - period);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  const oct = Math.floor(best / 12) + 1;
  const note = best % 12;
  return `${NOTE_NAMES[note]}${oct}`;
}

function periodToXMNote(period: number): number {
  if (period === 0) return 0;
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < PERIOD_TABLE.length; i++) {
    const d = Math.abs(PERIOD_TABLE[i] - period);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best + 13; // XM note: C-1 = 13
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx tsx tools/paula-capture.ts <file.dl> [--ticks N] [--speed S]');
    process.exit(1);
  }

  const filePath = resolve(args[0]);
  let maxTicks = 3000;
  let speed = 6; // ProTracker default: 6 ticks per row

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--ticks' && args[i + 1]) maxTicks = parseInt(args[++i]);
    if (args[i] === '--speed' && args[i + 1]) speed = parseInt(args[++i]);
  }

  console.error(`Loading ${filePath}...`);
  const fileData = readFileSync(filePath);

  // Load WASM module
  const wasmPath = resolve(__dirname, '../davelowe-wasm/public/davelowe/DaveLowe.js');
  const createDaveLowe = require(wasmPath);
  const wasm = await createDaveLowe({
    // Node.js: provide locateFile for .wasm
    locateFile: (path: string) => resolve(__dirname, '../davelowe-wasm/public/davelowe/', path),
  });

  // Init player
  const SAMPLE_RATE = 28150;
  wasm._player_init(SAMPLE_RATE);

  // player_load does malloc+memcpy internally, so ccall 'array' temp allocation is fine.
  // But the module may need hunk header stripping — Dave Lowe files are AmigaDOS executables.
  // The code section starts after the hunk header at offset 0x20 in this file.
  // Let's try the raw file first, then stripped if that fails.
  let ok = 0;
  try {
    ok = wasm.ccall('player_load', 'number', ['array', 'number'], [fileData, fileData.length]);
    console.error(`Load result: ${ok}`);
  } catch (e: any) {
    console.error(`Load threw: ${e.message}`);
    ok = 0;
  }
  if (!ok) {
    console.error('Failed to load module');
    process.exit(1);
  }

  // Start capture
  wasm._player_capture_start();

  // Render enough audio to play through maxTicks
  // At 50Hz interrupt rate, each tick = SAMPLE_RATE/50 = 563 samples
  const samplesPerTick = Math.floor(SAMPLE_RATE / 50);
  const totalSamples = maxTicks * samplesPerTick;
  const CHUNK = 4096;
  const bufPtr = wasm._malloc(CHUNK * 8); // float32 stereo = 8 bytes per frame

  let rendered = 0;
  while (rendered < totalSamples) {
    const frames = Math.min(CHUNK, totalSamples - rendered);
    wasm._player_render(bufPtr, frames);
    rendered += frames;
  }
  wasm._free(bufPtr);

  // Stop capture and read results
  wasm._player_capture_stop();
  const count = wasm._player_capture_count();
  const capPtr = wasm._player_capture_buffer();

  console.error(`Captured ${count} events over ${maxTicks} ticks`);

  // Read capture buffer: each event = 8 bytes: tick(u32) period(u16) volume(u8) channel(u8)
  interface NoteEvent {
    tick: number;
    channel: number;
    period: number;
    volume: number;
    note: string;
  }

  const events: NoteEvent[] = [];
  for (let i = 0; i < count; i++) {
    const base = capPtr + i * 8;
    const tick = wasm.getValue(base, 'i32') >>> 0;
    const period = wasm.getValue(base + 4, 'i16') & 0xFFFF;
    const volume = wasm.getValue(base + 6, 'i8') & 0xFF;
    const channel = wasm.getValue(base + 7, 'i8') & 0xFF;
    events.push({ tick, channel, period, volume, note: periodToNoteName(period) });
  }

  // ── Convert events to pattern rows ───────────────────────────────────
  // Group events by row (tick / speed), 4 channels

  const maxRow = Math.max(...events.map(e => Math.floor(e.tick / speed)), 0);
  const ROWS_PER_PATTERN = 64;
  const numPatterns = Math.ceil((maxRow + 1) / ROWS_PER_PATTERN);

  const patterns: Array<{
    id: number;
    rows: Array<Array<{ note: number; instrument: number; volume: number; period: number }>>;
  }> = [];

  for (let p = 0; p < numPatterns; p++) {
    const rows: Array<Array<{ note: number; instrument: number; volume: number; period: number }>> = [];
    for (let r = 0; r < ROWS_PER_PATTERN; r++) {
      const row: Array<{ note: number; instrument: number; volume: number; period: number }> = [];
      for (let ch = 0; ch < 4; ch++) {
        row.push({ note: 0, instrument: 0, volume: 0, period: 0 });
      }
      rows.push(row);
    }
    patterns.push({ id: p, rows });
  }

  // Fill in events
  for (const ev of events) {
    const row = Math.floor(ev.tick / speed);
    const patIdx = Math.floor(row / ROWS_PER_PATTERN);
    const rowIdx = row % ROWS_PER_PATTERN;
    if (patIdx < patterns.length) {
      const cell = patterns[patIdx].rows[rowIdx][ev.channel];
      if (ev.period > 0) {
        cell.note = periodToXMNote(ev.period);
        cell.period = ev.period;
      }
      cell.volume = ev.volume;
      cell.instrument = 1; // Dave Lowe modules don't have instrument numbers in events
    }
  }

  // ── Output ──────────────────────────────────────────────────────────
  const result = {
    file: filePath,
    totalTicks: maxTicks,
    speed,
    eventCount: count,
    patternCount: numPatterns,
    events: events.slice(0, 200), // first 200 for inspection
    patterns,
  };

  console.log(JSON.stringify(result, null, 2));

  // Also print a text visualization
  console.error('\n── Pattern 0 (first 32 rows) ──');
  if (patterns.length > 0) {
    for (let r = 0; r < Math.min(32, ROWS_PER_PATTERN); r++) {
      const row = patterns[0].rows[r];
      const cells = row.map(c =>
        c.note ? `${periodToNoteName(c.period)} ${String(c.volume).padStart(2)}` : '--- --'
      );
      console.error(`${String(r).padStart(2, '0')} | ${cells.join(' | ')} |`);
    }
  }

  wasm._player_stop();
}

main().catch(e => { console.error(e); process.exit(1); });
