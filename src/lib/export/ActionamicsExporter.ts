/**
 * ActionamicsExporter.ts — Export TrackerSong as Actionamics Sound Tool (.act) format
 *
 * Reconstructs the binary format documented in ActionamicsParser.ts.
 *
 * File layout:
 *   Offset 0: uint16 BE tempo (BPM)
 *   Offset 2: uint32 BE x 15 section lengths
 *   Offset 62: "ACTIONAMICS SOUND TOOL" (22 bytes)
 *   Then sections in order: moduleInfo, positions, trackNumbers, instrTranspose,
 *   noteTranspose, instruments, sampleNumberList, arpeggioList, frequencyList,
 *   (2 skipped), subSongs, (1 skipped), sampleHeaders, trackOffsets+trackData,
 *   sample PCM data
 *
 * Reference: ActionamicsParser.ts (parser), ActionamicsEncoder.ts (track encoder)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { actionamicsEncoder } from '@/engine/uade/encoders/ActionamicsEncoder';

// ── Constants ──────────────────────────────────────────────────────────────

const SIGNATURE = 'ACTIONAMICS SOUND TOOL';
const ROWS_PER_PATTERN = 64;
const NUM_CHANNELS = 4;
const INSTRUMENT_RECORD_SIZE = 32;
const SAMPLE_HEADER_SIZE = 64;

// ── Helpers ────────────────────────────────────────────────────────────────

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val & 0xFFFF, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val >>> 0, false);
}

function writeString(arr: Uint8Array, off: number, str: string, maxLen: number): void {
  for (let i = 0; i < maxLen; i++) {
    arr[off + i] = i < str.length ? str.charCodeAt(i) & 0x7F : 0;
  }
}

/**
 * Extract 8-bit signed PCM from an InstrumentConfig's sample audioBuffer (WAV).
 * Returns null if no sample data available.
 */
function extractPCM(inst: TrackerSong['instruments'][0]): Int8Array | null {
  if (!inst?.sample?.audioBuffer) return null;
  try {
    const wav = new DataView(inst.sample.audioBuffer);
    const dataLen = wav.getUint32(40, true);
    const frames = Math.floor(dataLen / 2);
    if (frames <= 0) return null;
    const pcm = new Int8Array(frames);
    for (let j = 0; j < frames; j++) {
      const s16 = wav.getInt16(44 + j * 2, true);
      pcm[j] = s16 >> 8; // 16-bit to 8-bit signed
    }
    return pcm;
  } catch {
    return null;
  }
}

// ── Main export ────────────────────────────────────────────────────────────

export async function exportActionamics(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  const numPatterns = song.patterns.length;
  const songLen = Math.min(256, song.songPositions.length);
  const numInstruments = Math.min(255, song.instruments.length);

  // ── Encode tracks ──────────────────────────────────────────────────────
  // Each TrackerSong pattern has 4 channels. Each channel becomes a separate
  // track in the Actionamics file. We deduplicate identical encoded tracks.
  const encodedTracks: Uint8Array[] = [];
  // trackIndex[patIdx][ch] = index into encodedTracks
  const trackIndex: number[][] = [];
  const trackMap = new Map<string, number>();

  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    const chIndices: number[] = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows = pat.channels[ch]?.rows ?? [];
      // Pad/trim to ROWS_PER_PATTERN
      const paddedRows = Array.from({ length: ROWS_PER_PATTERN }, (_, i) => rows[i] ?? {
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      });
      const encoded = actionamicsEncoder.encodePattern(paddedRows, ch);
      const key = Array.from(encoded).join(',');
      let idx = trackMap.get(key);
      if (idx === undefined) {
        idx = encodedTracks.length;
        trackMap.set(key, idx);
        encodedTracks.push(encoded);
      }
      chIndices.push(idx);
    }
    trackIndex.push(chIndices);
  }

  const numTracks = encodedTracks.length;

  // ── Build position lists ───────────────────────────────────────────────
  // positions[ch][posIdx] = { trackNumber, noteTranspose, instrumentTranspose }
  const numPositions = songLen;
  const trackNumbers = new Uint8Array(NUM_CHANNELS * numPositions);
  const noteTransposes = new Uint8Array(NUM_CHANNELS * numPositions);
  const instrTransposes = new Uint8Array(NUM_CHANNELS * numPositions);

  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    const patIdx = song.songPositions[posIdx] ?? 0;
    const indices = trackIndex[patIdx] ?? [0, 0, 0, 0];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      trackNumbers[ch * numPositions + posIdx] = indices[ch] & 0xFF;
      noteTransposes[ch * numPositions + posIdx] = 0; // no transpose
      instrTransposes[ch * numPositions + posIdx] = 0;
    }
  }

  const positionBlockSize = NUM_CHANNELS * numPositions; // one byte per entry
  const trackNumberLength = positionBlockSize;
  const instrTransposeLength = positionBlockSize;
  const noteTransposeLength = positionBlockSize;

  // ── Instruments ────────────────────────────────────────────────────────
  // Build minimal instrument records. Each instrument maps 1:1 to its sample.
  const instrumentBlock = new Uint8Array(numInstruments * INSTRUMENT_RECORD_SIZE);
  // Each instrument has sampleNumberListNumber pointing to its own list entry
  // (which returns the sample index).

  // Build sampleNumberList: one entry per instrument, each entry is 16 bytes.
  // Entry i: first byte = i (sample index, 0-based), rest = 0.
  const sampleNumberListEntries = numInstruments;
  const sampleNumberListBlock = new Uint8Array(sampleNumberListEntries * 16);
  for (let i = 0; i < sampleNumberListEntries; i++) {
    sampleNumberListBlock[i * 16] = i; // sample number (0-based)
  }

  for (let i = 0; i < numInstruments; i++) {
    const off = i * INSTRUMENT_RECORD_SIZE;
    // sampleNumberList: number=i, valuesCount=1, startDelta=0, counterEnd=0
    instrumentBlock[off + 0] = i;  // sampleNumberListNumber
    instrumentBlock[off + 1] = 1;  // sampleNumberListValuesCount
    instrumentBlock[off + 2] = 0;  // sampleNumberListStartDelta
    instrumentBlock[off + 3] = 0;  // sampleNumberListCounterEnd
    // arpeggioList: number=0, valuesCount=0, startDelta=0, counterEnd=0
    instrumentBlock[off + 4] = 0;
    instrumentBlock[off + 5] = 0;
    instrumentBlock[off + 6] = 0;
    instrumentBlock[off + 7] = 0;
    // frequencyList: number=0, valuesCount=0, startDelta=0, counterEnd=0
    instrumentBlock[off + 8] = 0;
    instrumentBlock[off + 9] = 0;
    instrumentBlock[off + 10] = 0;
    instrumentBlock[off + 11] = 0;
    // portamentoIncrement=0, portamentoDelay=0, noteTranspose=0, pad=0
    instrumentBlock[off + 12] = 0;
    instrumentBlock[off + 13] = 0;
    instrumentBlock[off + 14] = 0;
    instrumentBlock[off + 15] = 0;
    // ADSR: attackEnd=64, attackSpeed=1, decayEnd=64, decaySpeed=0, sustainDelay=0, releaseEnd=0, releaseSpeed=0
    instrumentBlock[off + 16] = 64; // attackEndVolume
    instrumentBlock[off + 17] = 1;  // attackSpeed
    instrumentBlock[off + 18] = 64; // decayEndVolume
    instrumentBlock[off + 19] = 0;  // decaySpeed
    instrumentBlock[off + 20] = 0;  // sustainDelay
    instrumentBlock[off + 21] = 0;  // releaseEndVolume
    instrumentBlock[off + 22] = 0;  // releaseSpeed
    // pad (9 bytes) — already zero
  }

  // ── Arpeggio & frequency lists (minimal: 1 empty entry each) ──────────
  const arpeggioListBlock = new Uint8Array(16); // 1 entry x 16 bytes, all zero
  const frequencyListBlock = new Uint8Array(16); // 1 entry x 16 bytes, all zero

  // ── Sub-songs ──────────────────────────────────────────────────────────
  const subSongBlock = new Uint8Array(4);
  subSongBlock[0] = 0;                                         // startPosition
  subSongBlock[1] = Math.max(0, numPositions - 1) & 0xFF;     // endPosition
  subSongBlock[2] = 0;                                         // loopPosition
  subSongBlock[3] = (song.initialSpeed ?? 6) & 0xFF;          // speed

  // ── Sample headers & PCM ───────────────────────────────────────────────
  const samplePCMs: Int8Array[] = [];
  const sampleHeaderBlock = new Uint8Array(numInstruments * SAMPLE_HEADER_SIZE);

  for (let i = 0; i < numInstruments; i++) {
    const inst = song.instruments[i];
    const pcm = extractPCM(inst);
    const hdrOff = i * SAMPLE_HEADER_SIZE;

    if (pcm && pcm.length > 0) {
      const lengthWords = Math.ceil(pcm.length / 2);
      const loopStart = inst.sample?.loopStart ?? 0;
      const loopEnd = inst.sample?.loopEnd ?? 0;
      const hasLoop = loopEnd > loopStart;
      const loopStartWords = hasLoop ? Math.floor(loopStart / 2) : 0;
      const loopLenWords = hasLoop ? Math.max(1, Math.ceil((loopEnd - loopStart) / 2)) : 1;

      // 4 bytes pointer (skip, write 0)
      // length (uint16 BE) in words
      const hdrView = new DataView(sampleHeaderBlock.buffer, sampleHeaderBlock.byteOffset);
      hdrView.setUint16(hdrOff + 4, lengthWords, false);
      hdrView.setUint16(hdrOff + 6, loopStartWords, false);
      hdrView.setUint16(hdrOff + 8, loopLenWords, false);
      // effectStartPosition, effectLength, effectSpeed, effectMode, etc. — leave as 0
      // name at offset 32 within header (32 bytes)
      const name = inst.name || `Sample ${i + 1}`;
      writeString(sampleHeaderBlock, hdrOff + 32, name, 32);

      // Ensure PCM length is even (Amiga requirement)
      const evenLen = lengthWords * 2;
      const paddedPCM = new Int8Array(evenLen);
      paddedPCM.set(pcm.subarray(0, Math.min(pcm.length, evenLen)));
      samplePCMs.push(paddedPCM);
    } else {
      // Empty sample: length=0, loopLength=1 (standard)
      const hdrView = new DataView(sampleHeaderBlock.buffer, sampleHeaderBlock.byteOffset);
      hdrView.setUint16(hdrOff + 8, 1, false); // loopLength = 1
      const name = inst?.name || `Sample ${i + 1}`;
      writeString(sampleHeaderBlock, hdrOff + 32, name, 32);
      samplePCMs.push(new Int8Array(0));
      warnings.push(`Instrument ${i + 1} "${name}" has no sample data.`);
    }
  }

  // ── Track offset table + track data ────────────────────────────────────
  // Offset table: (numTracks + 1) uint16 BE entries (last is sentinel)
  const trackOffsetTableSize = (numTracks + 1) * 2;
  let trackDataTotalSize = 0;
  for (const t of encodedTracks) trackDataTotalSize += t.length;

  const trackBlock = new Uint8Array(trackOffsetTableSize + trackDataTotalSize);
  const trackBlockView = new DataView(trackBlock.buffer, trackBlock.byteOffset);

  let trackDataOffset = 0;
  for (let i = 0; i < numTracks; i++) {
    trackBlockView.setUint16(i * 2, trackDataOffset, false);
    trackDataOffset += encodedTracks[i].length;
  }
  // Sentinel
  trackBlockView.setUint16(numTracks * 2, trackDataOffset, false);

  // Write track data after offset table
  let tOff = trackOffsetTableSize;
  for (const t of encodedTracks) {
    trackBlock.set(t, tOff);
    tOff += t.length;
  }

  // ── Compute section lengths ────────────────────────────────────────────
  // Section layout (from parser):
  //   [0] = signature (22 bytes = "ACTIONAMICS SOUND TOOL")
  //   [1] = moduleInfo (4 bytes = uint32 totalLength)
  //   [2] = trackNumberLength (= positionBlockSize)
  //   [3] = instrumentTransposeLength (= positionBlockSize)
  //   [4] = noteTransposeLength (= positionBlockSize)
  //   [5] = instruments (numInstruments * 32)
  //   [6] = sampleNumberList (entries * 16)
  //   [7] = arpeggioList (entries * 16)
  //   [8] = frequencyList (entries * 16)
  //   [9] = 0 (skipped)
  //  [10] = 0 (skipped)
  //  [11] = subSongs (count * 4)
  //  [12] = 0 (skipped)
  //  [13] = sampleHeaders (numInstruments * 64)
  //  [14] = trackOffsetTable size (numTracks+1)*2 — track data follows after
  const sectionLengths: number[] = [
    SIGNATURE.length,                                    // [0] signature
    4,                                                   // [1] moduleInfo (totalLength u32)
    trackNumberLength,                                   // [2]
    instrTransposeLength,                                // [3]
    noteTransposeLength,                                 // [4]
    numInstruments * INSTRUMENT_RECORD_SIZE,             // [5]
    sampleNumberListEntries * 16,                        // [6]
    arpeggioListBlock.length,                            // [7]
    frequencyListBlock.length,                           // [8]
    0,                                                   // [9] skipped
    0,                                                   // [10] skipped
    subSongBlock.length,                                 // [11]
    0,                                                   // [12] skipped
    numInstruments * SAMPLE_HEADER_SIZE,                 // [13]
    trackOffsetTableSize,                                // [14]
  ];

  // ── Compute total file size ────────────────────────────────────────────
  const headerSize = 2 + 15 * 4; // tempo (2) + 15 section lengths (60) = 62
  let bodySize = 0;
  for (const sl of sectionLengths) bodySize += sl;
  // Track data follows after the offset table (section 14 only covers the offset table)
  bodySize += trackDataTotalSize;
  // Sample PCM data at end
  const totalSampleBytes = samplePCMs.reduce((acc, p) => acc + p.length, 0);
  const totalLength = headerSize + bodySize + totalSampleBytes;

  // ── Build file ─────────────────────────────────────────────────────────
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);

  // Tempo
  writeU16BE(view, 0, song.initialBPM ?? 125);

  // Section lengths
  for (let i = 0; i < 15; i++) {
    writeU32BE(view, 2 + i * 4, sectionLengths[i]);
  }

  let cursor = headerSize; // 62

  // Section 0: Signature
  writeString(output, cursor, SIGNATURE, SIGNATURE.length);
  cursor += sectionLengths[0];

  // Section 1: Module info (totalLength)
  writeU32BE(view, cursor, totalLength);
  cursor += sectionLengths[1];

  // Section 2: Track numbers
  output.set(trackNumbers, cursor);
  cursor += sectionLengths[2];

  // Section 3: Instrument transposes
  output.set(instrTransposes, cursor);
  cursor += sectionLengths[3];

  // Section 4: Note transposes
  output.set(noteTransposes, cursor);
  cursor += sectionLengths[4];

  // Section 5: Instruments
  output.set(instrumentBlock, cursor);
  cursor += sectionLengths[5];

  // Section 6: Sample number list
  output.set(sampleNumberListBlock, cursor);
  cursor += sectionLengths[6];

  // Section 7: Arpeggio list
  output.set(arpeggioListBlock, cursor);
  cursor += sectionLengths[7];

  // Section 8: Frequency list
  output.set(frequencyListBlock, cursor);
  cursor += sectionLengths[8];

  // Section 9, 10: skipped (0 length)
  cursor += sectionLengths[9] + sectionLengths[10];

  // Section 11: Sub-songs
  output.set(subSongBlock, cursor);
  cursor += sectionLengths[11];

  // Section 12: skipped (0 length)
  cursor += sectionLengths[12];

  // Section 13: Sample headers
  output.set(sampleHeaderBlock, cursor);
  cursor += sectionLengths[13];

  // Section 14: Track offset table + track data
  output.set(trackBlock, cursor);
  cursor += trackBlock.length;

  // Sample PCM data
  for (const pcm of samplePCMs) {
    // Write as unsigned bytes (Int8 stored as Uint8 two's complement)
    for (let j = 0; j < pcm.length; j++) {
      output[cursor + j] = pcm[j] & 0xFF;
    }
    cursor += pcm.length;
  }

  // ── Result ─────────────────────────────────────────────────────────────
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName}.act`,
    warnings,
  };
}
