/**
 * ActivisionProExporter.ts — Export TrackerSong as Activision Pro (.avp) format
 *
 * Reconstructs a valid Activision Pro (Martin Walker) binary from TrackerSong data.
 * The format has no fixed header magic -- identification is via M68k opcode scanning.
 * This exporter synthesizes minimal 68k code stubs that match the parser's heuristic
 * patterns, followed by the data sections (sub-songs, position lists, tracks,
 * instruments, sample offsets, and PCM sample data).
 *
 * Binary layout produced:
 *   [0x00..0x03]  68k MOVEM.L instruction: 0x48 0xe7 0xfc 0xfe (init pattern)
 *   [0x04..]      68k code stubs containing all patterns the parser scans for:
 *                   - subSongListOffset discovery (0xe9 0x41 0x70 0x00 0x41 0xfa)
 *                   - BSR to play function (0x61 0x00)
 *                   - positionListsOffset (0x7a 0x00 ... 0x49 0xfa)
 *                   - play function (0x2c 0x7c ... 0x4a 0x29)
 *                   - instrumentsOffset (0x4b 0xfa), globalOffset (0x43 0xfa)
 *                   - speedVariation, trackOffsets, tracks, parseTrackVersion,
 *                     instrumentFormatVersion, sampleStartOffsets, sampleData,
 *                     envelope/vibrato stubs
 *   [subSongList]  Sub-song entries: 4 x u16 position list offsets + 8 speed bytes
 *   [posLists]     Position lists: per-channel track indices, 0xff terminated
 *   [instruments]  Instrument definitions: 16 bytes each (version 2 format)
 *   [trackOffsets] Track offset table: u16 per track (relative to tracksBase)
 *   [tracksBase]   Track data: variable-length byte streams, 0xff terminated
 *   [sampleOffsets] Sample start offset table: 28 x u32 BE
 *   [sampleData]   Sample data: inline headers (6 bytes) + 8-bit signed PCM
 *
 * Uses instrumentFormatVersion=2, parseTrackVersion=1, speedVariationVersion=1,
 * haveSeparateSampleInfo=false (embedded sample headers).
 *
 * Reference: ActivisionProParser.ts (import), ActivisionProEncoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

const MAX_SAMPLES = 27;
const AVP_REF_XM = 37;
const AVP_REF_IDX = 60;
const AVP_PERIODS_LEN = 85;

// ── Helpers ────────────────────────────────────────────────────────────────

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val & 0xFFFF, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val >>> 0, false);
}

function writeI16BE(view: DataView, off: number, val: number): void {
  view.setInt16(off, val, false);
}

/**
 * Encode a TrackerCell's note + instrument into a single AVP track byte.
 * Bits 7..6 = instrument (0-3), bits 5..0 = note index into AVP_PERIODS.
 */
function encodeAvpNoteByte(xmNote: number, instrument: number): number {
  let noteIdx = 0;
  if (xmNote > 0 && xmNote <= 96) {
    noteIdx = xmNote - AVP_REF_XM + AVP_REF_IDX;
    noteIdx = Math.max(0, Math.min(AVP_PERIODS_LEN - 1, noteIdx));
  }
  const instrField = (instrument & 0x03) << 6;
  return instrField | (noteIdx & 0x3F);
}

// ── Main export function ───────────────────────────────────────────────────

export async function exportActivisionPro(
  song: TrackerSong
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const numChannels = 4;

  if (song.numChannels > 4) {
    warnings.push(`Activision Pro supports 4 channels; ${song.numChannels - 4} channels were dropped.`);
  }

  // ── 1. Extract sample PCM data from instruments ─────────────────────────

  interface AvpSampleData {
    pcm: Uint8Array;
    length: number;    // in words
    loopStart: number; // in words
    loopLength: number; // in words
  }

  const sampleSlots: AvpSampleData[] = [];
  // Map instrument ID (1-based) to sample slot index
  const instrToSampleIdx = new Map<number, number>();

  for (let i = 0; i < song.instruments.length && sampleSlots.length < MAX_SAMPLES; i++) {
    const inst = song.instruments[i];
    const slotIdx = sampleSlots.length;
    instrToSampleIdx.set(inst.id, slotIdx);

    if (inst.sample?.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      if (wav.byteLength >= 44) {
        const dataLen = wav.getUint32(40, true);
        const frames = Math.floor(dataLen / 2);
        const pcm = new Uint8Array(frames);
        for (let j = 0; j < frames; j++) {
          if (44 + j * 2 + 1 < wav.byteLength) {
            const s16 = wav.getInt16(44 + j * 2, true);
            pcm[j] = (s16 >> 8) & 0xFF;
          }
        }

        const loopStart = inst.sample?.loopStart ?? 0;
        const loopEnd = inst.sample?.loopEnd ?? 0;
        const hasLoop = loopEnd > loopStart;

        sampleSlots.push({
          pcm,
          length: Math.floor(frames / 2),
          loopStart: hasLoop ? Math.floor(loopStart / 2) : 0,
          loopLength: hasLoop ? Math.max(1, Math.floor((loopEnd - loopStart) / 2)) : 1,
        });
      } else {
        sampleSlots.push({ pcm: new Uint8Array(0), length: 0, loopStart: 0, loopLength: 1 });
      }
    } else {
      sampleSlots.push({ pcm: new Uint8Array(0), length: 0, loopStart: 0, loopLength: 1 });
    }
  }

  // Pad to MAX_SAMPLES
  while (sampleSlots.length < MAX_SAMPLES) {
    sampleSlots.push({ pcm: new Uint8Array(0), length: 0, loopStart: 0, loopLength: 1 });
  }

  // ── 2. Build track data ──────────────────────────────────────────────────
  // Using parseTrackVersion=1: each event is 2 bytes:
  //   byte 0 = note byte (if high bit set, followed by 1 extra effect byte + row byte)
  //   For simplicity we emit only note bytes without effects (high bit clear).
  //   Format: [noteByte, rowByte(unused=0x00)] per row, terminated by 0xFF.
  //
  // Actually re-examining the parser for v1:
  //   - dat = data[pos++]  (first byte)
  //   - if dat == 0xFF: break (end of track)
  //   - if (dat & 0x80): pos++ (skip extra byte)
  //   - noteByte = data[pos++] (second byte = the row's note+instrument)
  //
  // So each event in v1 is: [control_byte, note_byte], 2 bytes per row.
  // control_byte with bit7 clear = no extra data. We use 0x00 as control.

  const encodedTracks: Uint8Array[] = [];
  // Map: (trackerPatternIdx, channel) -> track index
  const trackKeyToIdx = new Map<string, number>();

  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = pat.channels[ch]?.rows ?? [];
      const rowCount = Math.min(64, rows.length);

      // Encode rows
      const bytes: number[] = [];
      for (let r = 0; r < rowCount; r++) {
        const cell = rows[r];
        const xmNote = cell?.note ?? 0;
        const instId = cell?.instrument ?? 0;

        // Look up sample index for instrument
        const sampleIdx = instId > 0 ? (instrToSampleIdx.get(instId) ?? 0) : 0;

        const controlByte = 0x00; // no effects, high bit clear
        const noteByte = encodeAvpNoteByte(xmNote, sampleIdx);

        bytes.push(controlByte);
        bytes.push(noteByte);
      }
      bytes.push(0xFF); // end marker

      const trackData = new Uint8Array(bytes);

      // Deduplicate
      const key = Array.from(trackData).join(',');
      let idx = trackKeyToIdx.get(key);
      if (idx === undefined) {
        idx = encodedTracks.length;
        trackKeyToIdx.set(key, idx);
        encodedTracks.push(trackData);
      }

      // Store mapping (p, ch) -> position list will reference these
      // We need a separate per-(p,ch) lookup
      const mapKey = `${p}:${ch}`;
      if (!trackKeyToIdx.has(mapKey + '#ref')) {
        trackKeyToIdx.set(mapKey + '#ref', idx);
      }
    }
  }

  // Build track-index lookup: (patternIdx, channel) -> unique track index
  const getTrackIdx = (patIdx: number, ch: number): number => {
    const rows = song.patterns[patIdx]?.channels[ch]?.rows ?? [];
    const rowCount = Math.min(64, rows.length);
    const bytes: number[] = [];
    for (let r = 0; r < rowCount; r++) {
      const cell = rows[r];
      const xmNote = cell?.note ?? 0;
      const instId = cell?.instrument ?? 0;
      const sampleIdx = instId > 0 ? (instrToSampleIdx.get(instId) ?? 0) : 0;
      bytes.push(0x00);
      bytes.push(encodeAvpNoteByte(xmNote, sampleIdx));
    }
    bytes.push(0xFF);
    const key = Array.from(bytes).join(',');
    return trackKeyToIdx.get(key) ?? 0;
  };

  // ── 3. Build position lists ──────────────────────────────────────────────
  // Each channel has a position list: sequence of track indices, terminated by 0xFF.
  // Position list entries: byte values 0x00-0x3F (with bit 6 set) are track indices.
  // Actually from the parser:
  //   if (dat & 0x40) == 0: dat + extra_byte (skip pair)
  //   if dat >= 0xFD: dat + extra_byte (skip pair)
  //   else: dat is a track position entry
  //   0xFE or 0xFF: end
  //
  // So for a plain track index, we need (dat & 0x40) != 0 and dat < 0xFD.
  // That means valid track indices have bit 6 set: range 0x40-0xFC.
  // The track number IS the byte value itself (getPositionTrackNumber returns dat directly).
  //
  // Wait, re-reading countPositions and getPositionTrackNumber more carefully:
  //   dat >= 0xFD or (dat & 0x40) == 0  → skip (it's a command with extra byte)
  //   else → it's a track position, trackNum = dat
  //
  // So track indices must have bit 6 set AND be < 0xFD. Range: 0x40 - 0xFC.
  // Track numbers are 0x40-0xFC meaning tracks 64-252.
  //
  // But wait, in the parser when building patterns, it calls:
  //   getPositionTrackNumber returns dat (the raw byte), and then
  //   tracks[trackNum] is accessed. The tracks array is built from trackOffsets
  //   which is indexed 0..numberOfTracks-1.
  //
  // So trackNum can be 0x40+ which would index into the tracks array at index 64+.
  // This means the tracks array needs to be at least that large.
  //
  // Actually, looking more carefully at the parser: track numbers from position lists
  // are used directly as indices into the tracks[] array. So if we have, say, 10 unique
  // tracks, we'd put them at indices 0x40..0x49 in the trackOffsets table, and the
  // position list would reference 0x40..0x49.
  //
  // We need to ensure our track indices have bit 6 set. Let's use base index 0x40.

  const TRACK_BASE = 0x40; // minimum track index with bit 6 set
  const maxTrackIdx = TRACK_BASE + encodedTracks.length - 1;

  if (maxTrackIdx >= 0xFD) {
    warnings.push(`Too many unique tracks (${encodedTracks.length}); max is ${0xFD - TRACK_BASE}. Extra tracks will be lost.`);
  }

  // Build position lists for each channel
  const positionLists: Uint8Array[] = [];
  const songLen = song.songPositions.length;

  for (let ch = 0; ch < numChannels; ch++) {
    const entries: number[] = [];
    for (let i = 0; i < songLen; i++) {
      const songPatIdx = song.songPositions[i] ?? 0;
      if (songPatIdx >= song.patterns.length) continue;
      const trackIdx = getTrackIdx(songPatIdx, ch);
      const posListByte = TRACK_BASE + Math.min(trackIdx, 0xFD - TRACK_BASE - 1);
      entries.push(posListByte);
    }
    entries.push(0xFF); // end marker
    positionLists.push(new Uint8Array(entries));
  }

  // ── 4. Build instrument definitions (16 bytes each, version 2) ──────────
  // Version 2 layout:
  //   [0]  sampleNumber
  //   [1]  volume
  //   [2]  enabledEffectFlags
  //   [3]  padding
  //   [4]  portamentoAdd
  //   [5]  padding
  //   [6]  padding
  //   [7]  stopResetEffectDelay
  //   [8]  sampleNumber2
  //   [9..12] arpeggioTable (4 signed bytes)
  //   [13] fixedOrTransposedNote
  //   [14] vibratoNumber
  //   [15] vibratoDelay

  const numInstruments = Math.min(song.instruments.length, 255);
  const instrDefs: Uint8Array[] = [];

  for (let i = 0; i < numInstruments; i++) {
    const inst = song.instruments[i];
    const def = new Uint8Array(16);
    const sampleIdx = instrToSampleIdx.get(inst.id) ?? 0;

    def[0] = sampleIdx & 0xFF;   // sampleNumber
    def[1] = Math.min(64, inst.volume ?? 64); // volume
    def[2] = 0;                   // enabledEffectFlags
    def[3] = 0;                   // padding
    def[4] = 0;                   // portamentoAdd
    def[5] = 0;                   // padding
    def[6] = 0;                   // padding
    def[7] = 0;                   // stopResetEffectDelay
    def[8] = sampleIdx & 0xFF;   // sampleNumber2
    def[9] = 0;                   // arpeggio[0]
    def[10] = 0;                  // arpeggio[1]
    def[11] = 0;                  // arpeggio[2]
    def[12] = 0;                  // arpeggio[3]
    def[13] = 0;                  // fixedOrTransposedNote
    def[14] = 0;                  // vibratoNumber
    def[15] = 0;                  // vibratoDelay

    instrDefs.push(def);
  }

  // Ensure at least 1 instrument
  if (instrDefs.length === 0) {
    instrDefs.push(new Uint8Array(16));
    warnings.push('No instruments found; exported with one empty instrument.');
  }

  // ── 5. Build sub-song list ───────────────────────────────────────────────
  // Each sub-song: 4 x u16 position list offsets (relative to positionListsBase) + 8 speed bytes.
  // We export one sub-song.

  // Position list offsets are relative to positionListsBase (the start of all position lists).
  let posListTotalSize = 0;
  const posListOffsets: number[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    posListOffsets.push(posListTotalSize);
    posListTotalSize += positionLists[ch].length;
  }

  const speedVariation = new Int8Array(8); // all zeros = no speed variation
  const subSongEntrySize = 16; // 4 x u16 + 8 bytes
  const subSongCount = 1;

  // ── 6. Build sample data section ─────────────────────────────────────────
  // haveSeparateSampleInfo=false: each sample chunk has 6-byte header + PCM data.
  // Sample start offsets: (MAX_SAMPLES + 1) x u32 BE (running offset into sample data area).

  const sampleChunks: Uint8Array[] = [];
  const sampleStartOffsets: number[] = [];
  let sampleAccum = 0;

  for (let i = 0; i < MAX_SAMPLES; i++) {
    sampleStartOffsets.push(sampleAccum);
    const s = sampleSlots[i];
    if (s.pcm.length === 0 && s.length === 0) {
      // Empty sample, no chunk
      sampleChunks.push(new Uint8Array(0));
      continue;
    }

    // 6-byte header: length(u16), loopStart(u16), loopLength(u16)
    const headerSize = 6;
    const chunkSize = headerSize + s.pcm.length;
    const chunk = new Uint8Array(chunkSize);
    const chunkView = new DataView(chunk.buffer);
    chunkView.setUint16(0, s.length & 0xFFFF, false);
    chunkView.setUint16(2, s.loopStart & 0xFFFF, false);
    chunkView.setUint16(4, s.loopLength & 0xFFFF, false);
    chunk.set(s.pcm, 6);

    sampleChunks.push(chunk);
    sampleAccum += chunkSize;
  }
  sampleStartOffsets.push(sampleAccum); // sentinel entry (MAX_SAMPLES + 1 entries)

  const sampleOffsetsTableSize = (MAX_SAMPLES + 1) * 4;
  const totalSampleDataSize = sampleAccum;

  // ── 7. Build track offsets table and concatenated track data ──────────────
  // The track offsets table has numberOfTracks entries (u16 signed offsets relative to tracksBase).
  // We need enough entries to cover index TRACK_BASE + encodedTracks.length.
  const numberOfTracks = TRACK_BASE + encodedTracks.length;
  const trackOffsetsTableSize = numberOfTracks * 2;

  // Concatenate all track data
  let trackDataTotalSize = 0;
  const trackDataOffsets: number[] = [];
  for (const td of encodedTracks) {
    trackDataOffsets.push(trackDataTotalSize);
    trackDataTotalSize += td.length;
  }

  // ── 8. Calculate file layout and synthesize 68k code stubs ───────────────
  //
  // The parser scans the first 4096 bytes for specific M68k opcode patterns.
  // We need to place code stubs that satisfy ALL checks in extractPlayerInfo().
  //
  // We'll build the code section as a flat byte array with carefully placed patterns.
  // The data sections follow after the code.

  // Data section layout (after code stub):
  const CODE_SIZE = 512; // reserve 512 bytes for 68k code stubs (fits within 4096 scan limit)

  const subSongListPos = CODE_SIZE;
  const posListsPos = subSongListPos + subSongCount * subSongEntrySize;
  const instrumentsPos = posListsPos + posListTotalSize;
  const trackOffsetsPos = instrumentsPos + instrDefs.length * 16;
  const tracksPos = trackOffsetsPos + trackOffsetsTableSize;
  const sampleStartOffsetsPos = tracksPos + trackDataTotalSize;
  const sampleDataPos = sampleStartOffsetsPos + sampleOffsetsTableSize;

  const totalFileSize = sampleDataPos + totalSampleDataSize;

  const output = new Uint8Array(totalFileSize);
  const view = new DataView(output.buffer);

  // ── 8a. Synthesize 68k code stubs ────────────────────────────────────────
  //
  // We need to satisfy the following sequence of pattern checks from extractPlayerInfo():
  //
  // 1. Find 0x48 0xe7 0xfc 0xfe (MOVEM.L, init function start)
  // 2. Find 0xe9 0x41 0x70 0x00 0x41 0xfa followed by s16 displacement to subSongListOffset
  // 3. Find 0x61 0x00 (BSR) followed by s16 displacement to play function location
  // 4. At play target: 0x7a 0x00 ... 0x49 0xfa followed by s16 displacement to positionListsOffset
  // 5. Find 0x2c 0x7c ... 0x4a 0x29 (play function marker)
  // 6. Before that: 0x4b 0xfa + instrumentsOffset, 0x43 0xfa + globalOffset
  // 7. Speed variation: 0x53 0x69 ... 0x67 followed by version-1 pattern (0x70 0x03)
  // 8. Track offsets: 0x7a 0x00 0x1a 0x31 ... 0xda 0x45 0x49 0xfa + trackOffsetsOffset
  // 9. Tracks: 0x3a 0x34 ... 0x49 0xfa + tracksOffset
  // 10. Parse track version detection: 0x18 0x31 ... 0x42 0x31 ... 0x08 0x31 (version 1)
  // 11. Instrument format version: 0x31 0x85 ... version 2 pattern
  // 12. Sample offsets: 0xe5 0x45 0x45 0xfa + sampleStartOffsetsOffset
  // 13. Sample data: 0x45 0xfa + sampleDataOffset (at offset +10/+11 from e5 45)
  // 14. No separate sample info (skip that check)
  // 15. Vibrato: 0x6b 0x00 ... 0x4a 0x31 then 0xda 0x45 then 0x9b 0x70 then version 1 (0x53 0x31)

  let pos = 0;

  // (1) Init function: MOVEM.L
  output[pos++] = 0x48; output[pos++] = 0xe7;
  output[pos++] = 0xfc; output[pos++] = 0xfe;

  // (2) subSongListOffset discovery pattern
  // 0xe9 0x41 0x70 0x00 0x41 0xfa [s16 displacement]
  // displacement = subSongListPos - (pos + 6)   (where pos+6 is the location of the displacement field)
  output[pos++] = 0xe9; output[pos++] = 0x41;
  output[pos++] = 0x70; output[pos++] = 0x00;
  output[pos++] = 0x41; output[pos++] = 0xfa;
  const subSongDisp = subSongListPos - pos;
  writeI16BE(view, pos, subSongDisp); pos += 2;

  // (3) BSR: 0x61 0x00 [s16 displacement to play function BSR target]
  // The BSR target = pos + 2 + displacement. We want the BSR target to be the
  // location where we place the 0x7a 0x00 ... 0x49 0xfa pattern.
  output[pos++] = 0x61; output[pos++] = 0x00;
  // We'll fill in the BSR displacement after we know the target location
  const bsrDispOffset = pos;
  pos += 2; // placeholder for BSR displacement

  // (4) BSR target: 0x7a 0x00 ... 0x49 0xfa [s16 displacement to positionListsOffset]
  // Parser checks: bytes[index] == 0x7a, bytes[index+1] == 0x00,
  //                bytes[index+6] == 0x49, bytes[index+7] == 0xfa
  const bsrTarget = pos;
  // Fill BSR displacement: target = bsrDispOffset + displacement
  // displacement = bsrTarget - bsrDispOffset
  writeI16BE(view, bsrDispOffset, bsrTarget - bsrDispOffset);

  output[pos++] = 0x7a; output[pos++] = 0x00;
  // 4 bytes of padding (indices 2-5)
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x49; output[pos++] = 0xfa;
  const posListDisp = posListsPos - pos;
  writeI16BE(view, pos, posListDisp); pos += 2;

  // (6) instrumentsOffset and globalOffset: placed BEFORE the play function marker.
  // Parser walks backwards from 0x2c 0x7c pattern looking for 0x4b 0xfa and 0x43 0xfa.

  // globalOffset: 0x43 0xfa [s16]
  output[pos++] = 0x43; output[pos++] = 0xfa;
  // globalOffset value = pos + displacement (points somewhere valid; not critical for data)
  writeI16BE(view, pos, 0); pos += 2;

  // instrumentsOffset: 0x4b 0xfa [s16]
  output[pos++] = 0x4b; output[pos++] = 0xfa;
  const instrDisp = instrumentsPos - pos;
  writeI16BE(view, pos, instrDisp); pos += 2;

  // (5) Play function marker: 0x2c 0x7c [4 bytes] 0x4a 0x29
  output[pos++] = 0x2c; output[pos++] = 0x7c;
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x4a; output[pos++] = 0x29;

  // (7) Speed variation: 0x53 0x69 [2 bytes] 0x67 [1 byte] then version 1: 0x70 0x03
  output[pos++] = 0x53; output[pos++] = 0x69;
  output[pos++] = 0x00; output[pos++] = 0x00; // 2 padding bytes
  output[pos++] = 0x67;                         // BEQ
  output[pos++] = 0x00;                         // displacement
  output[pos++] = 0x70; output[pos++] = 0x03;  // MOVEQ #3,D0 → speedVariationVersion=1

  // (8) trackOffsetsOffset pattern:
  // 0x7a 0x00 0x1a 0x31 [2 bytes] 0xda 0x45 0x49 0xfa [s16 displacement]
  output[pos++] = 0x7a; output[pos++] = 0x00;
  output[pos++] = 0x1a; output[pos++] = 0x31;
  output[pos++] = 0x00; output[pos++] = 0x00; // 2 padding bytes
  output[pos++] = 0xda; output[pos++] = 0x45;
  output[pos++] = 0x49; output[pos++] = 0xfa;
  const trackOffsetsDisp = trackOffsetsPos - pos;
  writeI16BE(view, pos, trackOffsetsDisp); pos += 2;

  // (9) tracksOffset pattern: 0x3a 0x34 [2 bytes] 0x49 0xfa [s16 displacement]
  output[pos++] = 0x3a; output[pos++] = 0x34;
  output[pos++] = 0x00; output[pos++] = 0x00; // 2 padding bytes
  output[pos++] = 0x49; output[pos++] = 0xfa;
  const tracksDisp = tracksPos - pos;
  writeI16BE(view, pos, tracksDisp); pos += 2;

  // (10) Parse track version detection:
  // First: find 0x18 0x31 (parser scans for this)
  output[pos++] = 0x18; output[pos++] = 0x31;
  // 4 bytes padding (parser does pos += 6 from the 0x18 0x31 match)
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;

  // Then: find 0x42 0x31 (parser scans for this)
  output[pos++] = 0x42; output[pos++] = 0x31;
  // Parser does pos += 8 from the 0x42 0x31 match
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;

  // parseTrackVersion=1: 0x08 0x31
  output[pos++] = 0x08; output[pos++] = 0x31;

  // (10 cont) Find 0x31 0x85 (parser scans for this after parseTrackVersion detection)
  output[pos++] = 0x31; output[pos++] = 0x85;
  // Parser does pos += 4 from 0x31 0x85 match
  output[pos++] = 0x00; output[pos++] = 0x00;

  // (11) Instrument format version 2 pattern:
  // Check at current pos:
  //   bytes[pos] == 0x11, bytes[pos+1] == 0xb5, bytes[pos+2] == 0x50, bytes[pos+3] == 0x01
  //   bytes[pos+6] == 0x13, bytes[pos+7] == 0xb5, bytes[pos+8] == 0x50, bytes[pos+9] == 0x02
  //   bytes[pos+12] == 0x13, bytes[pos+13] == 0xb5, bytes[pos+14] == 0x50, bytes[pos+15] == 0x07
  //   bytes[pos+18] == 0x13, bytes[pos+19] == 0xb5, bytes[pos+20] == 0x50, bytes[pos+21] == 0x0f
  output[pos++] = 0x11; output[pos++] = 0xb5; output[pos++] = 0x50; output[pos++] = 0x01; // +0..3
  output[pos++] = 0x00; output[pos++] = 0x00;                                               // +4..5 padding
  output[pos++] = 0x13; output[pos++] = 0xb5; output[pos++] = 0x50; output[pos++] = 0x02; // +6..9
  output[pos++] = 0x00; output[pos++] = 0x00;                                               // +10..11 padding
  output[pos++] = 0x13; output[pos++] = 0xb5; output[pos++] = 0x50; output[pos++] = 0x07; // +12..15
  output[pos++] = 0x00; output[pos++] = 0x00;                                               // +16..17 padding
  output[pos++] = 0x13; output[pos++] = 0xb5; output[pos++] = 0x50; output[pos++] = 0x0f; // +18..21

  // (12) Sample offsets pattern: 0xe5 0x45 0x45 0xfa [s16] ... (10 bytes gap) ... 0x45 0xfa [s16]
  // Parser at this point:
  //   sampleStartOffsetsOffset = s16BE(bytes, index + 4) + index + 4
  //   then checks bytes[index+10] == 0x45, bytes[index+11] == 0xfa
  //   sampleDataOffset = s16BE(bytes, index + 12) + index + 12
  //   then index += 14

  output[pos++] = 0xe5; output[pos++] = 0x45;
  output[pos++] = 0x45; output[pos++] = 0xfa;
  const sampleOffsetsDisp = sampleStartOffsetsPos - pos;
  writeI16BE(view, pos, sampleOffsetsDisp); pos += 2;

  // Bytes at +6..+9: padding
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;

  // Bytes at +10..+11: 0x45 0xfa
  output[pos++] = 0x45; output[pos++] = 0xfa;
  const sampleDataDisp = sampleDataPos - pos;
  writeI16BE(view, pos, sampleDataDisp); pos += 2;

  // (13) No haveSeparateSampleInfo: parser checks bytes at index+12 == 0xca and
  //      bytes at index+13 == 0xfc. We must NOT match that to get haveSeparateSampleInfo=false.
  // The parser's "index" after step 12 is at the +14 position. It checks:
  //   bytes[index + 12] == 0xca && bytes[index + 13] == 0xfc
  // where index is the position AFTER the 0xe5 0x45 block (index += 14).
  // So we need bytes at (e5_45_pos + 14 + 12) and (e5_45_pos + 14 + 13) to NOT be 0xca/0xfc.
  // Since we're writing zeros for padding, this is already satisfied.

  // (15) Vibrato pattern: 0x6b 0x00 [2 bytes] 0x4a 0x31
  output[pos++] = 0x6b; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00; // 2 padding
  output[pos++] = 0x4a; output[pos++] = 0x31;

  // Parser does index += 10 from the 0x6b 0x00 match
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;

  // Then finds 0xda 0x45
  output[pos++] = 0xda; output[pos++] = 0x45;

  // Then finds 0x9b 0x70
  output[pos++] = 0x9b; output[pos++] = 0x70;

  // Vibrato version 1: bytes[pos+4] == 0x53 && bytes[pos+5] == 0x31
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x53; output[pos++] = 0x31;

  // No envelope: parser checks for 0x6b and 0x4a 0x31 at index+4..+7.
  // We skip that by not placing another 0x6b 0x00 pattern after the vibrato section.
  // Parser sets haveEnvelope = false by default, only sets true if pattern matches.
  // After vibrato section, parser does index += 10 and checks bytes[index+4] == 0x6b.
  // We pad with zeros to avoid matching.
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;
  output[pos++] = 0x00; output[pos++] = 0x00;

  // Pad to CODE_SIZE
  // pos should be < CODE_SIZE at this point
  if (pos > CODE_SIZE) {
    warnings.push(`Code stub exceeded ${CODE_SIZE} bytes (${pos} bytes). File may not parse correctly.`);
  }
  pos = CODE_SIZE;

  // ── 9. Write data sections ───────────────────────────────────────────────

  // Sub-song list at subSongListPos
  pos = subSongListPos;
  // 4 x u16 position list offsets + 8 speed variation bytes
  for (let ch = 0; ch < numChannels; ch++) {
    writeU16BE(view, pos, posListOffsets[ch]);
    pos += 2;
  }
  for (let i = 0; i < 8; i++) {
    output[pos++] = speedVariation[i] & 0xFF;
  }

  // Position lists at posListsPos
  pos = posListsPos;
  for (let ch = 0; ch < numChannels; ch++) {
    output.set(positionLists[ch], pos);
    pos += positionLists[ch].length;
  }

  // Instruments at instrumentsPos
  pos = instrumentsPos;
  for (const def of instrDefs) {
    output.set(def, pos);
    pos += 16;
  }

  // Track offsets table at trackOffsetsPos
  // Entries 0..(TRACK_BASE-1) are unused (-1 = 0xFFFF as s16)
  pos = trackOffsetsPos;
  for (let i = 0; i < numberOfTracks; i++) {
    if (i >= TRACK_BASE && i - TRACK_BASE < encodedTracks.length) {
      const trackRelOffset = trackDataOffsets[i - TRACK_BASE];
      writeI16BE(view, pos, trackRelOffset);
    } else {
      writeI16BE(view, pos, -1); // unused slot
    }
    pos += 2;
  }

  // Track data at tracksPos
  pos = tracksPos;
  for (const td of encodedTracks) {
    output.set(td, pos);
    pos += td.length;
  }

  // Sample start offsets table at sampleStartOffsetsPos
  pos = sampleStartOffsetsPos;
  for (let i = 0; i <= MAX_SAMPLES; i++) {
    writeU32BE(view, pos, sampleStartOffsets[i]);
    pos += 4;
  }

  // Sample data at sampleDataPos
  pos = sampleDataPos;
  for (const chunk of sampleChunks) {
    if (chunk.length > 0) {
      output.set(chunk, pos);
      pos += chunk.length;
    }
  }

  // ── 10. Return result ────────────────────────────────────────────────────

  if (song.instruments.length > MAX_SAMPLES) {
    warnings.push(`Activision Pro supports ${MAX_SAMPLES} samples; ${song.instruments.length - MAX_SAMPLES} instruments were dropped.`);
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName}.avp`,
    warnings,
  };
}
