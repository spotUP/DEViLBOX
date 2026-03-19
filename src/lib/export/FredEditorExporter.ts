/**
 * FredEditorExporter.ts — Export TrackerSong as Fred Editor (.fred) format
 *
 * Reconstructs a valid Fred Editor binary from TrackerSong data by rebuilding
 * the 68k code header, sample definitions, pattern byte streams, track tables,
 * song metadata, and PCM sample data.
 *
 * Fred Editor binary layout:
 *   - 68k code preamble (jmp instructions + code patterns for dataPtr/basePtr)
 *   - Song metadata at dataPtr+0x895 (song count, speeds)
 *   - Track table at dataPtr+0xb0e (4 x uint16 offsets per song)
 *   - Track data (uint16 pattern offsets per channel position)
 *   - Pattern byte stream (variable-length encoded channel data)
 *   - Sample definitions (64 bytes each)
 *   - PCM sample data (8-bit signed)
 *
 * Reference: FredEditorParser.ts (import) and FredEditorEncoder.ts (pattern encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { fredEditorEncoder } from '@/engine/uade/encoders/FredEditorEncoder';

export interface FredEditorExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val, false);
}

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val, false);
}

function writeI16BE(view: DataView, off: number, val: number): void {
  view.setInt16(off, val, false);
}

// ── Main export function ───────────────────────────────────────────────────

export async function exportFredEditor(
  song: TrackerSong
): Promise<FredEditorExportResult> {
  const warnings: string[] = [];
  const numChannels = 4;

  // ── 1. Encode pattern byte streams ─────────────────────────────────────
  // For each (trackerPattern, channel) pair, encode using the Fred Editor
  // variable-length encoder. De-duplicate identical streams.

  const encodedPatterns: Uint8Array[] = [];
  const patternKeyToIdx = new Map<string, number>();
  // Map (songPatIdx, ch) -> index into encodedPatterns
  const patMap: number[][] = [];

  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    const chIndices: number[] = [];

    for (let ch = 0; ch < numChannels; ch++) {
      const rows = pat.channels[ch]?.rows ?? [];
      const encoded = fredEditorEncoder.encodePattern(rows, ch);

      // De-duplicate by content
      const key = Array.from(encoded).join(',');
      let idx = patternKeyToIdx.get(key);
      if (idx === undefined) {
        idx = encodedPatterns.length;
        patternKeyToIdx.set(key, idx);
        encodedPatterns.push(encoded);
      }
      chIndices.push(idx);
    }
    patMap.push(chIndices);
  }

  // Build the combined pattern byte stream and record offsets
  const patternOffsets: number[] = []; // offset within pattern stream per encoded pattern
  let patternStreamSize = 0;
  for (const enc of encodedPatterns) {
    patternOffsets.push(patternStreamSize);
    patternStreamSize += enc.length;
  }

  // ── 2. Build track data ────────────────────────────────────────────────
  // Track data: for each song position, 4 uint16 values (pattern stream offsets).
  // Track table: sequential uint16 start offsets into the track data area.
  // We only export one subsong (subsong 0).

  const songLen = song.songPositions.length;
  // Track data: songLen entries per channel, each uint16
  // Track table: 4 uint16 entries (one start offset per channel)
  const trackDataEntries: number[][] = [[], [], [], []]; // per channel

  for (let pos = 0; pos < songLen; pos++) {
    const songPatIdx = song.songPositions[pos] ?? 0;
    const mapping = patMap[songPatIdx];
    for (let ch = 0; ch < numChannels; ch++) {
      const encIdx = mapping ? mapping[ch] : 0;
      trackDataEntries[ch].push(patternOffsets[encIdx] ?? 0);
    }
  }

  // Track table: 4 uint16 offsets pointing into the track data area
  // Channel 0 starts at offset 0, channel 1 at songLen*2, etc.
  // But actually the track table entries are byte offsets within the track data area
  // (which follows the track table in the file).
  // From the parser: trackTablePos is the offset into the track table itself,
  // and startOff = readUint16 at that position is a byte offset into the full
  // tracks area (tracksBase). The track data entries start after the track table.

  // Track table: 4 entries for our single subsong, giving byte offset into
  // the tracks area (which includes the table itself).
  // Track table is numSongs * 4 * 2 bytes = 8 bytes for 1 subsong.
  const trackTableSize = 1 * numChannels * 2; // 8 bytes
  const trackTableOffsets: number[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    // Byte offset within the tracks area to where channel ch's data starts
    trackTableOffsets.push(trackTableSize + ch * songLen * 2);
  }

  // Total track data size = table + all channel entries
  const trackDataSize = trackTableSize + numChannels * songLen * 2;

  // ── 3. Extract sample data from instruments ────────────────────────────

  interface SampleDef {
    pcmData: Uint8Array;
    loopPtr: number;      // signed int16 - loop offset
    length: number;       // in bytes (will be >>1 for storage)
    relative: number;     // relative tuning

    vibratoDelay: number;
    vibratoSpeed: number;
    vibratoDepth: number;

    envelopeVol: number;
    attackSpeed: number;
    attackVol: number;
    decaySpeed: number;
    decayVol: number;
    sustainTime: number;
    releaseSpeed: number;
    releaseVol: number;

    arpeggio: number[];   // 16 signed bytes
    arpeggioLimit: number;
    arpeggioSpeed: number;

    type: number;         // 0=regular, 1=PWM, 2=blend
    synchro: number;

    pulseRateNeg: number;
    pulseRatePos: number;
    pulseSpeed: number;
    pulsePosL: number;
    pulsePosH: number;
    pulseDelay: number;
    pulseCounter: number;

    blendRate: number;
    blendDelay: number;
    blendCounter: number;
  }

  const sampleDefs: SampleDef[] = [];

  for (let i = 0; i < song.instruments.length; i++) {
    const inst = song.instruments[i];
    const fred = inst.fred;

    if (fred) {
      // PWM synth instrument — reconstruct from FredConfig
      sampleDefs.push({
        pcmData: new Uint8Array(0),
        loopPtr: 0,
        length: 0,
        relative: fred.relative ?? 1024,
        vibratoDelay: fred.vibratoDelay ?? 0,
        vibratoSpeed: fred.vibratoSpeed ?? 0,
        vibratoDepth: fred.vibratoDepth ?? 0,
        envelopeVol: fred.envelopeVol ?? 64,
        attackSpeed: fred.attackSpeed ?? 0,
        attackVol: fred.attackVol ?? 64,
        decaySpeed: fred.decaySpeed ?? 0,
        decayVol: fred.decayVol ?? 0,
        sustainTime: fred.sustainTime ?? 0,
        releaseSpeed: fred.releaseSpeed ?? 0,
        releaseVol: fred.releaseVol ?? 0,
        arpeggio: fred.arpeggio ?? new Array(16).fill(0),
        arpeggioLimit: fred.arpeggioLimit ?? 0,
        arpeggioSpeed: fred.arpeggioSpeed ?? 0,
        type: 1, // PWM
        synchro: 0,
        pulseRateNeg: fred.pulseRateNeg ?? 0,
        pulseRatePos: fred.pulseRatePos ?? 0,
        pulseSpeed: fred.pulseSpeed ?? 0,
        pulsePosL: fred.pulsePosL ?? 0,
        pulsePosH: fred.pulsePosH ?? 0,
        pulseDelay: fred.pulseDelay ?? 0,
        pulseCounter: 0,
        blendRate: 0,
        blendDelay: 0,
        blendCounter: 0,
      });
    } else if (inst.sample?.audioBuffer) {
      // PCM sample instrument
      const wav = new DataView(inst.sample.audioBuffer);
      let dataLen = 0;
      let dataOffset = 44; // default WAV header size

      // Find the "data" chunk in the WAV
      if (wav.byteLength >= 44) {
        dataLen = wav.getUint32(40, true);
        dataOffset = 44;
      }

      const frames = Math.floor(dataLen / 2);
      const pcm = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        if (dataOffset + j * 2 + 1 < wav.byteLength) {
          const s16 = wav.getInt16(dataOffset + j * 2, true);
          pcm[j] = (s16 >> 8) & 0xFF; // 16-bit to 8-bit signed
        }
      }

      // Loop points
      const loopStart = inst.sample?.loopStart ?? 0;
      const loopEnd = inst.sample?.loopEnd ?? 0;
      const loopPtr = (loopEnd > loopStart && loopStart > 0) ? loopStart : 0;

      sampleDefs.push({
        pcmData: pcm,
        loopPtr,
        length: pcm.length,
        relative: 1024, // default tuning
        vibratoDelay: 0,
        vibratoSpeed: 0,
        vibratoDepth: 0,
        envelopeVol: 64,
        attackSpeed: 1,
        attackVol: 64,
        decaySpeed: 0,
        decayVol: 0,
        sustainTime: 0,
        releaseSpeed: 0,
        releaseVol: 0,
        arpeggio: new Array(16).fill(0),
        arpeggioLimit: 0,
        arpeggioSpeed: 0,
        type: 0, // regular PCM
        synchro: 0,
        pulseRateNeg: 0,
        pulseRatePos: 0,
        pulseSpeed: 0,
        pulsePosL: 0,
        pulsePosH: 0,
        pulseDelay: 0,
        pulseCounter: 0,
        blendRate: 0,
        blendDelay: 0,
        blendCounter: 0,
      });
    } else {
      // Placeholder/empty instrument
      sampleDefs.push({
        pcmData: new Uint8Array(0),
        loopPtr: 0,
        length: 0,
        relative: 1024,
        vibratoDelay: 0,
        vibratoSpeed: 0,
        vibratoDepth: 0,
        envelopeVol: 0,
        attackSpeed: 0,
        attackVol: 0,
        decaySpeed: 0,
        decayVol: 0,
        sustainTime: 0,
        releaseSpeed: 0,
        releaseVol: 0,
        arpeggio: new Array(16).fill(0),
        arpeggioLimit: 0,
        arpeggioSpeed: 0,
        type: 0,
        synchro: 0,
        pulseRateNeg: 0,
        pulseRatePos: 0,
        pulseSpeed: 0,
        pulsePosL: 0,
        pulsePosH: 0,
        pulseDelay: 0,
        pulseCounter: 0,
        blendRate: 0,
        blendDelay: 0,
        blendCounter: 0,
      });
      if (i < song.instruments.length) {
        warnings.push(`Instrument ${i + 1} "${inst.name}" has no sample data; exported as empty.`);
      }
    }
  }

  if (sampleDefs.length === 0) {
    warnings.push('No instruments found; file will have no samples.');
  }

  // ── 4. Calculate layout and sizes ──────────────────────────────────────
  //
  // We construct a minimal Fred Editor file with this structure:
  //
  //   [0x00]  68k preamble: 4 x jmp (0x4efa) instructions = 16 bytes
  //   [0x10]  68k code stub with 0x123a/0xb001 pattern (for dataPtr detection)
  //   [0x20]  68k code stub with 0x214a/0x47fa pattern (for basePtr detection)
  //   [0x30]  Padding to align to dataPtr reference
  //
  //   [dataPtr + 0x895]  Song count (1 byte)
  //   [dataPtr + 0x897]  Song speeds (1 byte per song)
  //   [dataPtr + 0x8a2]  Sample data offset (uint32) — relative to basePtr
  //   [dataPtr + 0x8a6]  Pattern data offset (uint32) — relative to basePtr
  //   [dataPtr + 0xb0e]  Track table + track data
  //
  //   [basePtr + patternDataOffset]  Pattern byte streams
  //   [basePtr + sampleDataOffset]   Sample definitions (64 bytes each)
  //   [after sample defs]            PCM sample data

  // We'll use a simple layout where dataPtr and basePtr are at known positions.
  // The 68k preamble + code stubs take about 48 bytes.
  // We need dataPtr such that dataPtr + 0xb0e + trackDataSize fits before
  // the pattern data. Let's place:
  //   - Preamble at 0x00 (16 bytes of jmp instructions)
  //   - Code stubs at 0x10 (for dataPtr detection) and 0x1c (for basePtr detection)
  //   - dataPtr = 0x30 (a small offset; all song metadata lives at dataPtr+0x895 etc.)
  //   - basePtr = 0x30 (same as dataPtr for simplicity, since offsets are independent)

  const dataPtr = 0x30;
  const basePtr = 0x30;

  // Metadata area starts at dataPtr + 0x895
  const metadataStart = dataPtr + 0x895;
  // Track table starts at dataPtr + 0xb0e
  const tracksBase = dataPtr + 0xb0e;

  // Pattern data starts after track data
  const patternDataFileStart = tracksBase + trackDataSize;
  const patternDataOffset = patternDataFileStart - basePtr; // relative to basePtr

  // Sample definitions start after pattern data
  const sampleDefsFileStart = patternDataFileStart + patternStreamSize;
  const sampleDataOffset = sampleDefsFileStart - basePtr; // relative to basePtr

  // PCM data starts after sample definitions
  const sampleDefsSize = sampleDefs.length * 64;
  const pcmDataFileStart = sampleDefsFileStart + sampleDefsSize;

  // Total PCM data size
  let totalPcmSize = 0;
  for (const sd of sampleDefs) {
    totalPcmSize += sd.pcmData.length;
  }

  // Total file size
  const totalSize = pcmDataFileStart + totalPcmSize;

  // ── 5. Assemble the binary ──────────────────────────────────────────────

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // --- 5a. Write 68k preamble: 4 jmp instructions ---
  for (let i = 0; i < 4; i++) {
    writeU16BE(view, i * 4, 0x4efa);     // jmp opcode
    writeU16BE(view, i * 4 + 2, 0x0000); // displacement (unused, just needs to exist)
  }

  // --- 5b. Write 68k code stub for dataPtr detection ---
  // At offset 0x10: 0x123a, displacement, 0xb001
  // Parser calculates: dataPtr = (pos + 2 + displacement) - 0x895
  // We want dataPtr = 0x30, pos = 0x10
  // So: 0x30 = (0x10 + 2 + displacement) - 0x895
  // displacement = 0x30 + 0x895 - 0x12 = 0x8b3
  const dataPtrDisplacement = dataPtr + 0x895 - (0x10 + 2);
  writeU16BE(view, 0x10, 0x123a);
  writeU16BE(view, 0x12, dataPtrDisplacement & 0xFFFF);
  writeU16BE(view, 0x14, 0xb001);

  // --- 5c. Write 68k code stub for basePtr detection ---
  // At offset 0x1c: 0x214a, 0x0000, 0x47fa, displacement (signed int16)
  // Parser: basePtr = pos + 6 + displacement, where pos = offset of 0x214a
  // We want basePtr = 0x30, pos = 0x1c
  // So: 0x30 = 0x1c + 6 + displacement → displacement = 0x30 - 0x22 = 0x0e
  const basePtrDisplacement = basePtr - (0x1c + 6);
  writeU16BE(view, 0x1c, 0x214a);
  writeU16BE(view, 0x1e, 0x0000); // padding (skipped by parser)
  writeU16BE(view, 0x20, 0x47fa);
  writeI16BE(view, 0x22, basePtrDisplacement);

  // --- 5d. Write song metadata ---
  // Song count at dataPtr + 0x895
  const numSongs = 1;
  output[metadataStart] = numSongs - 1; // stored as (count - 1)

  // Speed at dataPtr + 0x897 + songIndex
  const speed = song.initialSpeed ?? 6;
  output[dataPtr + 0x897] = speed & 0xFF;

  // --- 5e. Write sample/pattern offsets at dataPtr + 0x8a2 ---
  writeU32BE(view, dataPtr + 0x8a2, sampleDataOffset);
  writeU32BE(view, dataPtr + 0x8a6, patternDataOffset);

  // --- 5f. Write track table and track data at tracksBase ---
  let tOff = tracksBase;

  // Track table: 4 uint16 start offsets
  for (let ch = 0; ch < numChannels; ch++) {
    writeU16BE(view, tOff, trackTableOffsets[ch]);
    tOff += 2;
  }

  // Track data: per channel, songLen uint16 entries (pattern stream offsets)
  for (let ch = 0; ch < numChannels; ch++) {
    for (let pos = 0; pos < songLen; pos++) {
      writeU16BE(view, tOff, trackDataEntries[ch][pos]);
      tOff += 2;
    }
  }

  // --- 5g. Write pattern byte streams ---
  let pOff = patternDataFileStart;
  for (const enc of encodedPatterns) {
    output.set(enc, pOff);
    pOff += enc.length;
  }

  // --- 5h. Write sample definitions (64 bytes each) ---
  let sOff = sampleDefsFileStart;
  // In the original format, sample.pointer is relative to basePtr and
  // points to PCM data. We need: basePtr + pointer = pcmDataFileStart + accumulated offset
  // So pointer = pcmDataFileStart + accum - basePtr
  let pcmAccum = 0;

  for (let i = 0; i < sampleDefs.length; i++) {
    const sd = sampleDefs[i];

    // Pointer to PCM data (relative to basePtr, adjusted during parse)
    // In the original file, sample pointers point to PCM data relative to basePtr.
    // Parser: absolute = basePtr + pointer, then subtracts pcmBase.
    // We need pointer such that basePtr + pointer = pcmDataFileStart + pcmAccum
    const pointer = sd.pcmData.length > 0
      ? (pcmDataFileStart + pcmAccum - basePtr)
      : 0;

    writeU32BE(view, sOff, pointer);               // +0: pointer
    writeI16BE(view, sOff + 4, sd.loopPtr);         // +4: loopPtr (signed)
    writeU16BE(view, sOff + 6, sd.length >> 1);     // +6: length in words
    writeU16BE(view, sOff + 8, sd.relative);        // +8: relative tuning

    output[sOff + 10] = sd.vibratoDelay & 0xFF;     // +10
    output[sOff + 11] = 0;                           // +11: padding
    output[sOff + 12] = sd.vibratoSpeed & 0xFF;     // +12
    output[sOff + 13] = sd.vibratoDepth & 0xFF;     // +13

    output[sOff + 14] = sd.envelopeVol & 0xFF;      // +14
    output[sOff + 15] = sd.attackSpeed & 0xFF;       // +15
    output[sOff + 16] = sd.attackVol & 0xFF;         // +16
    output[sOff + 17] = sd.decaySpeed & 0xFF;        // +17
    output[sOff + 18] = sd.decayVol & 0xFF;          // +18
    output[sOff + 19] = sd.sustainTime & 0xFF;       // +19
    output[sOff + 20] = sd.releaseSpeed & 0xFF;      // +20
    output[sOff + 21] = sd.releaseVol & 0xFF;        // +21

    // 16 bytes of arpeggio data (signed)
    for (let a = 0; a < 16; a++) {
      const arpVal = (sd.arpeggio[a] ?? 0) & 0xFF;
      output[sOff + 22 + a] = arpVal;
    }

    output[sOff + 38] = sd.arpeggioSpeed & 0xFF;    // +38
    output[sOff + 39] = sd.type & 0xFF;              // +39 (signed in parser but stored as byte)
    output[sOff + 40] = sd.pulseRateNeg & 0xFF;     // +40 (signed)
    output[sOff + 41] = sd.pulseRatePos & 0xFF;     // +41
    output[sOff + 42] = sd.pulseSpeed & 0xFF;        // +42
    output[sOff + 43] = sd.pulsePosL & 0xFF;         // +43
    output[sOff + 44] = sd.pulsePosH & 0xFF;         // +44
    output[sOff + 45] = sd.pulseDelay & 0xFF;        // +45
    output[sOff + 46] = sd.synchro & 0xFF;            // +46
    output[sOff + 47] = sd.blendRate & 0xFF;          // +47
    output[sOff + 48] = sd.blendDelay & 0xFF;         // +48
    output[sOff + 49] = sd.pulseCounter & 0xFF;       // +49
    output[sOff + 50] = sd.blendCounter & 0xFF;       // +50
    output[sOff + 51] = sd.arpeggioLimit & 0xFF;      // +51

    // Bytes 52-63: padding (already zero)

    sOff += 64;
    pcmAccum += sd.pcmData.length;
  }

  // --- 5i. Write PCM sample data ---
  let pcmOff = pcmDataFileStart;
  for (const sd of sampleDefs) {
    if (sd.pcmData.length > 0) {
      output.set(sd.pcmData, pcmOff);
      pcmOff += sd.pcmData.length;
    }
  }

  // ── 6. Return result ──────────────────────────────────────────────────
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  const blob = new Blob([output.buffer], { type: 'application/octet-stream' });

  return {
    data: blob,
    filename: `${baseName}.fred`,
    warnings,
  };
}
