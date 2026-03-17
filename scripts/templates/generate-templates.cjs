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
  // MOD only needs patterns that are referenced — start with just 1
  const NUM_PATTERNS = 1;
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
  const NUM_PATTERNS = 1;  // only emit patterns referenced in song table
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

// ── 3. SoundMon V2 Template ────────────────────────────────────────────────
// Binary layout (from SoundMonParser.ts):
//   [0..25]   26-byte title
//   [26..28]  "V.2" magic (3 bytes)
//   [29]      nTables (synth table count)
//   [30..31]  songLength (u16BE, number of sequence steps)
//   [32..511] 15 instruments × 32 bytes
//   [512..]   Track table: songLength × 4 channels × 4 bytes
//   [..]      Pattern data: (higherPattern) × 16 rows × 3 bytes/cell
//   [..]      Synth tables: nTables × 64 bytes
//   [..]      Sample PCM data
//
// Pattern 0 = empty (not stored in file). Track table references pattern
// indices; 0 means "empty block". Pattern data starts at pattern 1.
function generateSoundMon() {
  const SONG_LENGTH = 1;   // 1 sequence step
  const NUM_PATTERNS = 1;  // 1 stored pattern block (index 1; 0 = empty)
  const N_TABLES = 1;      // 1 synth table (default waveform)

  // --- Header (32 bytes) ---
  const headerSize = 32;
  // 15 instruments × 32 bytes
  const instrSize = 15 * 32;
  // Track table: songLength × 4 channels × 4 bytes
  const trackTableSize = SONG_LENGTH * 4 * 4;
  // Pattern data: NUM_PATTERNS × 16 rows × 3 bytes
  const patDataSize = NUM_PATTERNS * 16 * 3;
  // Synth tables: nTables × 64 bytes
  const synthTableSize = N_TABLES * 64;

  const totalSize = headerSize + instrSize + trackTableSize + patDataSize + synthTableSize;
  const buf = new Uint8Array(totalSize);

  // Title
  writeString(buf, 0, 'DEViLBOX Template', 26);
  // Magic "V.2" at offset 26
  writeString(buf, 26, 'V.2', 3);
  buf[29] = N_TABLES;  // nTables
  writeU16BE(buf, 30, SONG_LENGTH);

  // --- 15 Instruments (32 bytes each) ---
  // Instrument 1: default synth (0xFF marker)
  const inst1Off = headerSize + 0 * 32;
  buf[inst1Off] = 0xFF;       // synth marker
  buf[inst1Off + 1] = 0;      // waveform table index
  buf[inst1Off + 2] = 32;     // waveform table length (words) → 64 bytes
  buf[inst1Off + 5] = 0;      // ADSR table index
  buf[inst1Off + 6] = 16;     // ADSR table length (words) → 32 bytes
  // Remaining bytes = 0 (LFO, EG, etc.)
  // Instruments 2-15: all zeros (empty sample instruments with length=0)

  // --- Track Table ---
  // 1 step × 4 channels × 4 bytes [patternIdx(u16BE), soundTranspose(s8), noteTranspose(s8)]
  // Channel 0 references pattern 1, others reference pattern 0 (empty)
  const trackOff = headerSize + instrSize;
  writeU16BE(buf, trackOff + 0, 1);  // Ch0 → pattern 1
  writeS8(buf, trackOff + 2, 0);     // sound transpose
  writeS8(buf, trackOff + 3, 0);     // note transpose
  // Ch1-3 → pattern 0 (empty) — already zeros

  // --- Pattern Data ---
  // Pattern 1: 16 rows × 3 bytes, all empty (note=0, instr|eff=0, param=0)
  // Already zero-filled

  // --- Synth Table 0: Square wave ---
  const synthOff = headerSize + instrSize + trackTableSize + patDataSize;
  // 64 bytes: simple square wave (32 high + 32 low)
  for (let i = 0; i < 32; i++) buf[synthOff + i] = 127;      // positive half
  for (let i = 32; i < 64; i++) buf[synthOff + i] = 128 & 0xFF; // negative half (-128 as u8)

  fs.writeFileSync(path.join(OUT_DIR, 'soundmon.bp'), buf);
  console.log(`  soundmon.bp: ${buf.length} bytes, ${NUM_PATTERNS} pattern blocks, ${N_TABLES} synth tables`);
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

// ── 6. HippelCoSo Template ─────────────────────────────────────────────────
// Header: "COSO" + 7 section offsets (32 bytes)
// Then: freq seqs, vol seqs, patterns, tracks, songs, headers/sampleinfo, samples
function generateHippelCoSo() {
  // Minimal valid HippelCoSo: 1 song, 1 track row, 1 pattern, 1 volume sequence, 1 freq sequence
  const parts = [];

  // Header: "COSO" + 7 u32BE offsets (filled later)
  const header = new Uint8Array(32);
  writeString(header, 0, 'COSO', 4);
  parts.push(header);

  // We'll build sections and compute offsets after
  const BASE = 32;

  // Freq sequences: pointer table + data
  // 1 freq seq at index 0: just a single 0xE0 (end/loop) marker
  const frqPtrTable = new Uint8Array(2); // 1 entry × u16BE
  writeU16BE(frqPtrTable, 0, 2); // data starts 2 bytes after this table
  const frqData = new Uint8Array(2);
  frqData[0] = 0; // pitch offset 0 (no pitch change)
  frqData[1] = 0xE1 & 0xFF; // end marker (225 unsigned = -31 signed)
  // Actually looking at parser: freq sequence is just raw s8 values with special negative codes
  // Let's use a simple end marker: -32 (0xE0) = loop to start
  frqData[1] = 0xE0; // loop marker = -32

  const frqSeqs = new Uint8Array(frqPtrTable.length + frqData.length);
  frqSeqs.set(frqPtrTable, 0);
  frqSeqs.set(frqData, frqPtrTable.length);

  // Volume sequences: pointer table + data
  // 1 vol seq at index 0: speed=1, freqSeq=0, vibSpeed=0, vibDepth=0, vibDelay=0, then vol=64, end
  const volPtrTable = new Uint8Array(2);
  writeU16BE(volPtrTable, 0, 2); // data starts 2 bytes after this table
  const volData = new Uint8Array(7);
  volData[0] = 1;    // speed
  volData[1] = 0;    // freq seq index (s8)
  volData[2] = 0;    // vibrato speed
  volData[3] = 0;    // vibrato depth
  volData[4] = 0;    // vibrato delay
  volData[5] = 64;   // volume value
  volData[6] = 0xE1; // end marker (-31 as u8)

  const volSeqs = new Uint8Array(volPtrTable.length + volData.length);
  volSeqs.set(volPtrTable, 0);
  volSeqs.set(volData, volPtrTable.length);

  // Pattern data: 1 pattern pointer + data
  // Pattern 0: just an end marker (-1 = 0xFF)
  const patPtrTable = new Uint8Array(2);
  writeU16BE(patPtrTable, 0, 2); // data starts 2 bytes after
  const patData = new Uint8Array(1);
  patData[0] = 0xFF; // -1 = end of pattern (next track step)

  const patterns = new Uint8Array(patPtrTable.length + patData.length);
  patterns.set(patPtrTable, 0);
  patterns.set(patData, patPtrTable.length);

  // Tracks: 1 track row = 4 channels × 3 bytes (patIdx, transpose, volTranspose)
  const tracks = new Uint8Array(12);
  for (let ch = 0; ch < 4; ch++) {
    tracks[ch * 3 + 0] = 0;  // pattern 0
    tracks[ch * 3 + 1] = 0;  // transpose
    tracks[ch * 3 + 2] = 0;  // vol transpose
  }

  // Songs: 1 song definition = 6 bytes (firstTrack, lastTrack, speed)
  const songs = new Uint8Array(6);
  writeU16BE(songs, 0, 0);   // first track index
  writeU16BE(songs, 2, 0);   // last track index (same = 1 step)
  writeU16BE(songs, 4, 6);   // speed

  // Headers/sampleinfo: empty (no samples)
  const headers = new Uint8Array(0);
  // Samples: empty
  const samples = new Uint8Array(0);

  // Compute offsets
  let off = BASE;
  const frqOff = off; off += frqSeqs.length;
  const volOff = off; off += volSeqs.length;
  const patOff = off; off += patterns.length;
  const trkOff = off; off += tracks.length;
  const sngOff = off; off += songs.length;
  const hdrOff = off; off += headers.length;
  const smpOff = off; off += samples.length;

  // Write offsets to header
  writeU32BE(header, 4, frqOff);
  writeU32BE(header, 8, volOff);
  writeU32BE(header, 12, patOff);
  writeU32BE(header, 16, trkOff);
  writeU32BE(header, 20, sngOff);
  writeU32BE(header, 24, hdrOff);
  writeU32BE(header, 28, smpOff);

  // Assemble final buffer
  const totalSize = off;
  const buf = new Uint8Array(totalSize);
  buf.set(header, 0);
  buf.set(frqSeqs, frqOff);
  buf.set(volSeqs, volOff);
  buf.set(patterns, patOff);
  buf.set(tracks, trkOff);
  buf.set(songs, sngOff);

  fs.writeFileSync(path.join(OUT_DIR, 'hippelcoso.coso'), buf);
  console.log(`  hippelcoso.coso: ${buf.length} bytes`);
}

// ── 7. Future Composer 1.4 Template ────────────────────────────────────────
// Header: "FC14" + lengths/offsets + 10 sample defs + sequences + patterns + macros
function generateFutureComposer() {
  // Build sections, then compute offsets
  const HEADER_SIZE = 40; // 4 (magic) + 8×4 (lengths/offsets) + 4 (wavePtr)

  // 10 sample definitions (6 bytes each = 60 bytes)
  const sampleDefs = new Uint8Array(60); // all zeros = no samples

  // 80 waveform lengths (FC14 only)
  const waveLens = new Uint8Array(80); // all zeros

  // 1 sequence (13 bytes): all channels → pattern 0, speed 6
  const seqData = new Uint8Array(13);
  // Channels 0-3: pattern=0, transpose=0, instrument=0
  // Already zeros
  seqData[12] = 6; // speed

  // 1 pattern (64 bytes = 32 rows × 2 bytes): all empty
  const patData = new Uint8Array(64);

  // 1 frequency macro (64 bytes): just end marker
  const freqMacro = new Uint8Array(64);
  freqMacro[0] = 0xE1; // end marker

  // 1 volume macro (64 bytes): speed=1, sustain=0, vib=0,0,0, then vol=64, end
  const volMacro = new Uint8Array(64);
  volMacro[0] = 1;    // speed
  volMacro[1] = 0;    // sustain
  volMacro[2] = 0;    // vibrato speed
  volMacro[3] = 0;    // vibrato depth
  volMacro[4] = 0;    // vibrato delay
  volMacro[5] = 40;   // volume (40/64)
  volMacro[6] = 0xE1; // end marker

  // Compute offsets
  const dataStart = HEADER_SIZE + sampleDefs.length + waveLens.length;
  const seqOff = dataStart;
  const patOff = seqOff + seqData.length;
  const freqOff = patOff + patData.length;
  const volOff = freqOff + freqMacro.length;
  const smpOff = volOff + volMacro.length;

  const totalSize = smpOff; // no sample PCM data
  const buf = new Uint8Array(totalSize);
  let pos = 0;

  // Magic
  writeString(buf, 0, 'FC14', 4); pos = 4;

  // Section lengths/offsets
  writeU32BE(buf, 4, seqData.length);     // seqLen
  writeU32BE(buf, 8, patOff);             // patPtr
  writeU32BE(buf, 12, patData.length);    // patLen
  writeU32BE(buf, 16, freqOff);           // freqMacroPtr
  writeU32BE(buf, 20, freqMacro.length);  // freqMacroLen
  writeU32BE(buf, 24, volOff);            // volMacroPtr
  writeU32BE(buf, 28, volMacro.length);   // volMacroLen
  writeU32BE(buf, 32, smpOff);           // samplePtr
  writeU32BE(buf, 36, smpOff);           // wavePtr (FC14, = samplePtr when no waves)

  // Sample definitions
  buf.set(sampleDefs, HEADER_SIZE);
  // Waveform lengths (FC14)
  buf.set(waveLens, HEADER_SIZE + sampleDefs.length);

  // Sequence data
  buf.set(seqData, seqOff);
  // Pattern data
  buf.set(patData, patOff);
  // Freq macro
  buf.set(freqMacro, freqOff);
  // Vol macro
  buf.set(volMacro, volOff);

  fs.writeFileSync(path.join(OUT_DIR, 'futurecomposer.fc'), buf);
  console.log(`  futurecomposer.fc: ${buf.length} bytes`);
}

// ── 8. OctaMED MMD0 Template ───────────────────────────────────────────────
// Header: "MMD0" + song struct (788 bytes) + block pointers + blocks + sample pointers
function generateOctaMED() {
  // MMD0 header: 36 bytes (9 × u32BE fields)
  // MMD0Song: 788 bytes (504 instrs + 2 numBlocks + 2 songLen + 256 playseq + 2 tempo + ...)
  const HEADER_SIZE = 36;
  const SONG_SIZE = 788;

  // Block: 2 bytes header (numTracks, numLines) + cell data
  const NUM_TRACKS = 4;
  const NUM_LINES = 64;  // 0-based → 63
  const CELL_SIZE = 3;   // MMD0 = 3 bytes/cell
  const blockHeaderSize = 2;
  const blockDataSize = NUM_TRACKS * NUM_LINES * CELL_SIZE;
  const blockSize = blockHeaderSize + blockDataSize;

  // Layout
  const songOff = HEADER_SIZE;
  const blockArrOff = songOff + SONG_SIZE;
  const blockPtrSize = 4; // 1 block pointer
  const blockOff = blockArrOff + blockPtrSize;
  const sampleArrOff = blockOff + blockSize;
  const samplePtrSize = 4; // 1 null pointer (no samples)
  const totalSize = sampleArrOff + samplePtrSize;

  const buf = new Uint8Array(totalSize);

  // Header
  writeString(buf, 0, 'MMD0', 4);
  writeU32BE(buf, 4, totalSize);        // modLength
  writeU32BE(buf, 8, songOff);          // songOffset
  writeU32BE(buf, 12, 0);               // playerSettings1
  writeU32BE(buf, 16, blockArrOff);     // blockArrOffset
  writeU32BE(buf, 20, 0);               // flags
  writeU32BE(buf, 24, sampleArrOff);    // sampleArrOffset
  writeU32BE(buf, 28, 0);               // reserved2
  writeU32BE(buf, 32, 0);               // expDataOffset (no expansion)

  // MMD0Song at songOff
  let pos = songOff;

  // 63 instrument headers (8 bytes each = 504 bytes)
  for (let i = 0; i < 63; i++) {
    const iOff = pos + i * 8;
    writeU16BE(buf, iOff + 0, 0);  // loopStart
    writeU16BE(buf, iOff + 2, 0);  // loopLen
    writeU8(buf, iOff + 4, 0);     // MIDI channel
    writeU8(buf, iOff + 5, 0);     // MIDI preset
    writeU8(buf, iOff + 6, 64);    // volume
    writeS8(buf, iOff + 7, 0);     // transpose
  }
  pos += 504;

  writeU16BE(buf, pos, 1);     // numBlocks = 1
  pos += 2;
  writeU16BE(buf, pos, 1);     // songLength = 1
  pos += 2;

  // playseq[256]: pattern 0 at position 0, rest zeros
  buf[pos] = 0; // position 0 → block 0
  pos += 256;

  writeU16BE(buf, pos, 125);   // default tempo (BPM)
  pos += 2;
  writeS8(buf, pos, 0);        // playtransp
  pos += 1;
  writeU8(buf, pos, 0);        // flags
  pos += 1;
  writeU8(buf, pos, 0x20);     // flags2 (bit 5 = BPM mode)
  pos += 1;
  writeU8(buf, pos, 6);        // tempo2 (speed = ticks per line)
  pos += 1;

  // trkvol[16] = all 64
  for (let i = 0; i < 16; i++) writeU8(buf, pos + i, 64);
  pos += 16;

  writeU8(buf, pos, 64);       // masterVol
  pos += 1;
  writeU8(buf, pos, 0);        // numSamples
  pos += 1;

  // Block pointer array
  writeU32BE(buf, blockArrOff, blockOff);

  // Block 0: header + empty cells
  writeU8(buf, blockOff, NUM_TRACKS);
  writeU8(buf, blockOff + 1, NUM_LINES - 1); // lines = count - 1
  // Cell data: all zeros (empty)

  // Sample pointer array: 1 null pointer
  writeU32BE(buf, sampleArrOff, 0);

  fs.writeFileSync(path.join(OUT_DIR, 'octamed.mmd0'), buf);
  console.log(`  octamed.mmd0: ${buf.length} bytes, 4 channels, ${NUM_LINES} rows`);
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log('Generating template files...');
generateMOD();
generateJamCracker();
generateSoundMon();
generateSidMon2();
generatePumaTracker();
generateHippelCoSo();
generateFutureComposer();
generateOctaMED();
console.log(`\nTemplates written to: ${OUT_DIR}`);
