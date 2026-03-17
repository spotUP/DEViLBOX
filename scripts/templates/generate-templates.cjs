#!/usr/bin/env node
/**
 * generate-templates.js — Build minimal valid binary template files for
 * exotic Amiga tracker formats. These are loaded by the New Song Wizard
 * when creating a new song in a specific format.
 *
 * Each template has generous capacity (many patterns/instruments, all empty)
 * so the user can compose freely via chip RAM patching.
 *
 * Output: public/templates/<format>.<ext>
 *
 * Usage: node scripts/templates/generate-templates.js
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../../public/templates');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────────────

function writeU8(buf, off, val) { buf[off] = val & 0xFF; }
function writeU16BE(buf, off, val) { buf[off] = (val >> 8) & 0xFF; buf[off + 1] = val & 0xFF; }
function writeU32BE(buf, off, val) {
  buf[off] = (val >>> 24) & 0xFF; buf[off + 1] = (val >>> 16) & 0xFF;
  buf[off + 2] = (val >>> 8) & 0xFF; buf[off + 3] = val & 0xFF;
}
function writeString(buf, off, str, len) {
  for (let i = 0; i < len; i++) buf[off + i] = i < str.length ? str.charCodeAt(i) : 0;
}
function writeS8(buf, off, val) { buf[off] = val < 0 ? val + 256 : val & 0xFF; }

// ── 1. ProTracker MOD Template ─────────────────────────────────────────────
// 4 channels, 64 patterns (all empty), 1 order entry, 31 instrument slots
// Standard M.K. format
function generateMOD() {
  const NUM_PATTERNS = 64;
  const ROWS_PER_PATTERN = 64;
  const CHANNELS = 4;
  const CELL_SIZE = 4;
  const patternSize = ROWS_PER_PATTERN * CHANNELS * CELL_SIZE; // 1024

  // Header: 20 (name) + 31*30 (instruments) + 1 (songLength) + 1 (restart) + 128 (order) + 4 (magic)
  const headerSize = 20 + 31 * 30 + 1 + 1 + 128 + 4; // 1084
  const totalSize = headerSize + NUM_PATTERNS * patternSize;
  const buf = new Uint8Array(totalSize);

  // Song name
  writeString(buf, 0, 'DEViLBOX Template', 20);

  // 31 instrument slots (all empty — name + length=0 + finetune=0 + vol=64 + loop=0 + replen=1)
  for (let i = 0; i < 31; i++) {
    const off = 20 + i * 30;
    writeString(buf, off, '', 22);     // name
    writeU16BE(buf, off + 22, 0);      // length (words)
    writeU8(buf, off + 24, 0);         // finetune
    writeU8(buf, off + 25, 64);        // volume
    writeU16BE(buf, off + 26, 0);      // loop start (words)
    writeU16BE(buf, off + 28, 1);      // loop length (words) — must be ≥1
  }

  // Song length = 1 (one order entry)
  const songLenOff = 20 + 31 * 30;
  writeU8(buf, songLenOff, 1);
  writeU8(buf, songLenOff + 1, 0); // restart position

  // Order table: all zeros (pattern 0 for position 0, rest unused)
  // Already zero-filled

  // Magic: "M.K." at offset 1080
  writeString(buf, songLenOff + 2 + 128, 'M.K.', 4);

  // Pattern data: all zeros (empty cells)
  // Already zero-filled

  fs.writeFileSync(path.join(OUT_DIR, 'protracker.mod'), buf);
  console.log(`  protracker.mod: ${buf.length} bytes, ${NUM_PATTERNS} patterns`);
}

// ── 2. JamCracker Template ─────────────────────────────────────────────────
// Magic "BeEp" + instrument table + pattern table + song table + pattern data
// 4 channels, 8 bytes/cell, variable rows per pattern
function generateJamCracker() {
  const NUM_INSTRUMENTS = 32;
  const NUM_PATTERNS = 64;
  const ROWS_PER_PATTERN = 64;
  const CHANNELS = 4;
  const CELL_SIZE = 8;

  // Header layout:
  //   0x00: "BeEp" (4 bytes)
  //   0x04: numInstruments (u16BE)
  //   0x06: instrument table (numInstruments * 40 bytes each)
  //   then: numPatterns (u16BE)
  //   then: pattern table (numPatterns * 6 bytes: rows(u16), offset(u32))
  //   then: songLength (u16BE)
  //   then: song table (songLength * 2 bytes: pattern index u16)
  //   then: pattern data

  const instrTableSize = NUM_INSTRUMENTS * 40;
  const patTableSize = NUM_PATTERNS * 6;
  const songLength = 1;
  const songTableSize = songLength * 2;

  const headerSize = 4 + 2 + instrTableSize + 2 + patTableSize + 2 + songTableSize;
  const patDataSize = NUM_PATTERNS * ROWS_PER_PATTERN * CHANNELS * CELL_SIZE;
  const totalSize = headerSize + patDataSize;
  const buf = new Uint8Array(totalSize);
  let pos = 0;

  // Magic
  writeString(buf, pos, 'BeEp', 4); pos += 4;

  // Number of instruments
  writeU16BE(buf, pos, NUM_INSTRUMENTS); pos += 2;

  // Instrument table (40 bytes each)
  for (let i = 0; i < NUM_INSTRUMENTS; i++) {
    const off = pos + i * 40;
    writeString(buf, off, i === 0 ? 'Default' : '', 31); // name (31 bytes)
    // flags(1) + length(u32) + loopStart(u32) unused for empty instruments
    // Already zero-filled
  }
  pos += instrTableSize;

  // Number of patterns
  writeU16BE(buf, pos, NUM_PATTERNS); pos += 2;

  // Pattern table (6 bytes each: rows(u16BE), offset(u32BE))
  const patDataStart = headerSize;
  for (let i = 0; i < NUM_PATTERNS; i++) {
    const off = pos + i * 6;
    writeU16BE(buf, off, ROWS_PER_PATTERN); // rows
    const patOffset = i * ROWS_PER_PATTERN * CHANNELS * CELL_SIZE;
    writeU32BE(buf, off + 2, patDataStart + patOffset); // absolute file offset
  }
  pos += patTableSize;

  // Song length
  writeU16BE(buf, pos, songLength); pos += 2;

  // Song table (pattern indices)
  writeU16BE(buf, pos, 0); // position 0 → pattern 0
  pos += songTableSize;

  // Pattern data: all zeros (empty cells)
  // Already zero-filled

  fs.writeFileSync(path.join(OUT_DIR, 'jamcracker.jam'), buf);
  console.log(`  jamcracker.jam: ${buf.length} bytes, ${NUM_PATTERNS} patterns`);
}

// ── 3. SoundMon Template ───────────────────────────────────────────────────
// SoundMon v2 ("BPSM"): 3 bytes/cell, 4 channels, 48-row patterns
// Header: magic(4) + songLength(u16) + numPatterns(u16) + instruments(15*32)
function generateSoundMon() {
  const MAGIC = 'BPSM'; // SoundMon v2
  const NUM_PATTERNS = 32;
  const NUM_INSTRUMENTS = 15;
  const ROWS_PER_PATTERN = 48;
  const CHANNELS = 4;
  const CELL_SIZE = 3;

  // SoundMon v2 layout (from SoundMonParser.ts):
  //   0x00: "BPSM" (4 bytes)
  //   0x1C: songLength (u16BE) at offset 28
  //   0x1E: numPatterns at offset 30 (u16BE - actually stored differently)
  // Actually, let me check the exact layout...
  // SoundMon v2 uses SoundTracker-like layout with "BPSM" marker

  // Simplified: create a valid SoundMon v1.0 file ("V.2" magic variant)
  // Header: songName(26) + [0x1A] reserved(5) + magic(4) = 35 bytes
  // Then 15 instruments × 32 bytes = 480 bytes
  // Then voltable(64 bytes) + song positions(128) + pattern count(u16) + pattern data

  const instrSize = NUM_INSTRUMENTS * 32;
  const volTableSize = 64;
  const songPosSize = 128; // 128 bytes for song positions
  const patDataSize = NUM_PATTERNS * ROWS_PER_PATTERN * CHANNELS * CELL_SIZE;

  // Actually this format is complex. Let me use a simpler approach:
  // Generate a minimal valid SoundMon v2 file that UADE can load.

  // SoundMon v2 file structure (from parser analysis):
  //   Offset 0: Song name (26 bytes)
  //   Offset 26: 0x1A (terminator)
  //   Offset 27: unused (1 byte)
  //   Offset 28: "V.2" or "BPSM" (4 bytes)
  //   Offset 32: 15 instruments × 32 bytes
  //   Offset 512: Step table (4 positions × numSteps × 4 channels)
  //   ... then arpeggio tables, then pattern data

  // This is too format-specific and error-prone without a running parser to verify.
  // Skip SoundMon template for now — it needs more research.
  console.log('  soundmon: SKIPPED (complex format, needs parser-guided construction)');
}

// ── 4. SidMon II Template ──────────────────────────────────────────────────
// Very complex format with variable-length patterns. Template approach is ideal.
// Minimal valid file: magic + header offsets + empty track + 1 pointer + 1 empty pattern row
function generateSidMon2() {
  // SidMon II file structure (from SidMon2Parser.ts):
  //   0x00: header with section lengths at specific offsets
  //   0x3A: "SIDMON II - THE MIDI VERSION" magic at offset 58
  //   0x5A: start of track data (offset 90)
  //
  // Section lengths (at header offsets):
  //   offset 0:  u32 trackDataLen (in entries, not bytes)
  //   offset 4:  u32 numInstruments
  //   offset 8:  u32 waveDataLen
  //   offset 12: u32 arpeggioLen
  //   offset 16: u32 vibratoLen
  //   offset 20: u32 numSamples (sampleCount)
  //   offset 24: u32 speed
  //   offset 28: u32 length (song length - 1)
  //   ... more offsets

  // Build minimal SidMon II file
  const MAGIC = 'SIDMON II - THE MIDI VERSION';
  const MAGIC_OFF = 58;
  const TRACK_DATA_OFF = 90;

  const songLength = 1;     // 1 song step
  const trackEntries = 4;   // 4 channels × 1 step
  const numInstruments = 2;  // instrument 0 (empty) + instrument 1 (default)
  const numPatterns = 2;     // pattern 0 (default) + pattern 1 (silent)

  // Track data: 3 passes × trackEntries bytes
  const trackDataSize = trackEntries * 3;
  // Instruments: numInstruments × 32 bytes
  const instrSize = numInstruments * 32;
  // Wave data: minimal (just 2 entries)
  const waveDataLen = 2;
  // Arpeggio: 8 bytes (1 arpeggio)
  const arpeggioLen = 8;
  // Vibrato: 0
  const vibratoLen = 0;
  // Pattern pointers: numPatterns × 2 bytes
  const patPtrSize = numPatterns * 2;
  // Pattern data: minimal (1 empty row per pattern = 1 byte each: value=0 effect=0 param=0 = 3 bytes)
  const patDataLen = 6; // 2 patterns × 3 bytes each
  // Samples: 0 (no PCM data)
  const numSamples = 0;

  // Total size
  const totalSize = TRACK_DATA_OFF + trackDataSize + instrSize + waveDataLen * 2 +
    arpeggioLen + vibratoLen + numSamples * 64 + patPtrSize + 4 + patDataLen;

  const buf = new Uint8Array(totalSize + 64); // padding
  let pos = 0;

  // Header offsets
  writeU32BE(buf, 0, trackEntries);       // trackDataLen
  writeU32BE(buf, 4, numInstruments);     // numInstruments
  writeU32BE(buf, 8, waveDataLen);        // waveDataLen
  writeU32BE(buf, 12, arpeggioLen);       // arpeggioLen
  writeU32BE(buf, 16, vibratoLen);        // vibratoLen
  writeU32BE(buf, 20, numSamples);        // numSamples
  writeU32BE(buf, 24, 6);                 // speed
  writeU32BE(buf, 28, songLength - 1);    // length (song length - 1)
  // Offsets 32-49: more section lengths (zeros = safe defaults)
  writeU32BE(buf, 50, patDataLen);        // pattern data length

  // Magic at offset 58
  writeString(buf, MAGIC_OFF, MAGIC, 28);

  // Track data at offset 90: 3 interleaved passes
  pos = TRACK_DATA_OFF;
  // Pass 1: pattern numbers (all 0)
  for (let i = 0; i < trackEntries; i++) writeU8(buf, pos++, 0);
  // Pass 2: transposes (all 0)
  for (let i = 0; i < trackEntries; i++) writeS8(buf, pos++, 0);
  // Pass 3: sound transposes (all 0)
  for (let i = 0; i < trackEntries; i++) writeS8(buf, pos++, 0);

  // Instruments (32 bytes each)
  for (let i = 0; i < numInstruments; i++) {
    // All zeros = valid empty instrument
    pos += 32;
  }

  // Wave data (2 bytes × waveDataLen)
  for (let i = 0; i < waveDataLen; i++) {
    writeU16BE(buf, pos, 0); pos += 2;
  }

  // Arpeggio data
  for (let i = 0; i < arpeggioLen; i++) writeU8(buf, pos++, 0);

  // Vibrato data (none)

  // Sample metadata (none)

  // Pattern pointer table (numPatterns × u16)
  const patPtrStart = pos;
  writeU16BE(buf, pos, 0); pos += 2;     // pattern 0 at byte offset 0
  writeU16BE(buf, pos, 3); pos += 2;     // pattern 1 at byte offset 3

  // Pattern data length (u32)
  writeU32BE(buf, pos, patDataLen); pos += 4;

  // Pattern data: each pattern = one empty row (value=0, effect=0x00, param=0x00)
  // Row with value=0: means "no note, effect + param follow" = 3 bytes
  writeU8(buf, pos++, 0);   // value = 0 (no note)
  writeU8(buf, pos++, 0);   // effect = 0
  writeU8(buf, pos++, 0);   // param = 0

  writeU8(buf, pos++, 0);   // pattern 1: value = 0
  writeU8(buf, pos++, 0);   // effect = 0
  writeU8(buf, pos++, 0);   // param = 0

  // Trim to actual size
  const finalBuf = buf.slice(0, pos);
  fs.writeFileSync(path.join(OUT_DIR, 'sidmon2.sd2'), finalBuf);
  console.log(`  sidmon2.sd2: ${finalBuf.length} bytes (minimal template)`);
}

// ── 5. PumaTracker Template ────────────────────────────────────────────────
// Header(80) + orders + "patt" delimited patterns + "inst" delimited instruments + samples
function generatePumaTracker() {
  const NUM_PATTERNS = 32;
  const NUM_ORDERS = 1;
  const NUM_INSTRUMENTS = 1;
  const NUM_ROWS = 32;
  const HEADER_SIZE = 80;
  const ORDER_ENTRY_SIZE = 14;

  // Each empty pattern: "patt" + one RLE entry (32 empty rows = one entry [0,0,0,32])
  const emptyPatternData = [
    0x70, 0x61, 0x74, 0x74,  // "patt"
    0x00, 0x00, 0x00, NUM_ROWS  // noteX2=0, instrEffect=0, param=0, runLen=32
  ];

  // Terminating "patt" marker
  const pattTerminator = [0x70, 0x61, 0x74, 0x74];

  // Minimal instrument: "inst" + vol script + "insf" + freq script + terminator "inst"
  const emptyInstrument = [
    0x69, 0x6E, 0x73, 0x74,  // "inst"
    0x40, 0x00,               // vol script: C0 (set vol 0) + END (0x00)
    0x69, 0x6E, 0x73, 0x66,  // "insf"
    0x00,                     // freq script: END
  ];
  const instTerminator = [0x69, 0x6E, 0x73, 0x74]; // "inst"

  const orderSize = NUM_ORDERS * ORDER_ENTRY_SIZE;
  const patSize = NUM_PATTERNS * emptyPatternData.length + pattTerminator.length;
  const instSize = NUM_INSTRUMENTS * emptyInstrument.length + instTerminator.length;

  const totalSize = HEADER_SIZE + orderSize + patSize + instSize;
  const buf = new Uint8Array(totalSize);
  let pos = 0;

  // Header (80 bytes)
  writeString(buf, 0, 'DEViLBOX', 12); // songName
  writeU16BE(buf, 12, NUM_ORDERS - 1); // lastOrder
  writeU16BE(buf, 14, NUM_PATTERNS);   // numPatterns
  writeU16BE(buf, 16, NUM_INSTRUMENTS); // numInstruments
  writeU16BE(buf, 18, 0);              // must be 0
  // sampleOffsets[10] + sampleLengths[10] = 60 bytes (all zeros = no PCM samples)
  pos = HEADER_SIZE;

  // Order list: 1 entry, all channels reference pattern 0
  for (let ord = 0; ord < NUM_ORDERS; ord++) {
    for (let ch = 0; ch < 4; ch++) {
      writeU8(buf, pos, 0);    // pattern index
      writeS8(buf, pos + 1, 0); // instrument transpose
      writeS8(buf, pos + 2, 0); // note transpose
      pos += 3;
    }
    writeU8(buf, pos, 6);  // speed
    writeU8(buf, pos + 1, 0); // zero byte
    pos += 2;
  }

  // Pattern data
  for (let p = 0; p < NUM_PATTERNS; p++) {
    for (const b of emptyPatternData) buf[pos++] = b;
  }
  for (const b of pattTerminator) buf[pos++] = b;

  // Instrument data
  for (let i = 0; i < NUM_INSTRUMENTS; i++) {
    for (const b of emptyInstrument) buf[pos++] = b;
  }
  for (const b of instTerminator) buf[pos++] = b;

  const finalBuf = buf.slice(0, pos);
  fs.writeFileSync(path.join(OUT_DIR, 'pumatracker.puma'), finalBuf);
  console.log(`  pumatracker.puma: ${finalBuf.length} bytes, ${NUM_PATTERNS} patterns`);
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log('Generating template files...');
generateMOD();
generateJamCracker();
generateSoundMon();
generateSidMon2();
generatePumaTracker();
console.log(`\nTemplates written to: ${OUT_DIR}`);
