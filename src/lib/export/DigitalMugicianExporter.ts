/**
 * DigitalMugicianExporter.ts — Export TrackerSong as Digital Mugician V1 (.dmu) format
 *
 * Digital Mugician binary layout (all big-endian):
 *   [0..23]     magic: " MUGICIAN/SOFTEYES 1990 " (24 bytes)
 *   [24..25]    u16  arpeggioFlag (1 = arpeggios appended at end)
 *   [26..27]    u16  waveDataLen (totalPatternRows >> 6, i.e. number of 64-row patterns)
 *   [28..59]    8 x u32  songTrackCounts (numSteps / 4 per sub-song)
 *   [60..63]    u32  sampleCount (number of instruments, 1-based)
 *   [64..67]    u32  wavetableCount (wavetableBytes >> 7)
 *   [68..71]    u32  instrHeaderCount (number of 32-byte PCM sample headers)
 *   [72..75]    u32  instrDataSize (total PCM audio bytes)
 *
 *   [76..203]   8 songs x 16 bytes each (loop, loopStep, speed, length, title[12])
 *
 *   [204..]     Track data: per song, songTrackCounts[i]*4 steps x 2 bytes (pattern, transpose)
 *   [...]       Instrument definitions: sampleCount x 16 bytes each
 *   [...]       Wavetable data: wavetableCount x 128 bytes each
 *   [...]       PCM sample headers: instrHeaderCount x 32 bytes each (V2 only)
 *   [...]       Pattern data: totalPatternRows x 4 bytes each
 *   [...]       PCM audio data (V2 only)
 *   [...]       Arpeggio data (256 bytes, if arpeggioFlag == 1)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

const MAGIC_V1 = ' MUGICIAN/SOFTEYES 1990 ';

// First 57 entries of DM_PERIODS (finetune 0 group) for reverse lookup
const DM_PERIODS_FT0: readonly number[] = [
  3220,3040,2869,2708,2556,2412,2277,2149,2029,1915,1807,1706,
  1610,1520,1434,1354,1278,1206,1139,1075,1014, 957, 904, 853,
   805, 760, 717, 677, 639, 603, 569, 537, 507, 479, 452, 426,
   403, 380, 359, 338, 319, 302, 285, 269, 254, 239, 226, 213,
   201, 190, 179, 169, 160, 151, 142, 134, 127,
];

/** XM note (1-96) to DM period table index (0-56). Parser uses xmNote = bestIdx + 1. */
function xmNoteToDMIndex(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const idx = xmNote - 1;
  return Math.max(0, Math.min(DM_PERIODS_FT0.length - 1, idx));
}

/** Encode a single pattern cell to 4 DM bytes (matches DigitalMugicianEncoder logic). */
function encodeDMCell(
  note: number,
  instrument: number,
  effTyp: number,
  eff: number,
): Uint8Array {
  const out = new Uint8Array(4);

  // Byte 0: DM note index
  if (note > 0 && note <= 96) {
    out[0] = xmNoteToDMIndex(note);
  }

  // Byte 1: sample (6-bit, 0=none)
  out[1] = instrument & 0x3F;

  // Byte 2: effect byte
  // effect=64 → no effect, effect=68 → set speed, effect=69 → filter on,
  // effect=70 → filter off, effect=74 → tone portamento
  if (effTyp === 0) {
    out[2] = 64; // no effect
  } else if (effTyp === 0x0F && eff > 0 && eff <= 15) {
    out[2] = 68; // set speed (val1=6 → 6+62=68)
  } else if (effTyp === 0x0E && eff === 0x01) {
    out[2] = 69; // LED filter on (val1=7 → 7+62=69)
  } else if (effTyp === 0x0E && eff === 0x00) {
    out[2] = 70; // LED filter off (val1=8 → 8+62=70)
  } else if (effTyp === 0x03) {
    out[2] = 74; // tone portamento (val1=12 → 12+62=74)
  } else if (effTyp === 0x01) {
    // Portamento up — DM encodes this as effect < 64 (portamento target)
    // with positive param. Use effect=0 as generic portamento indicator.
    out[2] = 0;
  } else if (effTyp === 0x02) {
    // Portamento down — same, effect < 64 with negative param
    out[2] = 0;
  } else {
    out[2] = 64; // fallback: no effect
  }

  // Byte 3: effect parameter (signed int8)
  if (effTyp === 0x01) {
    out[3] = Math.min(eff, 127) & 0xFF;
  } else if (effTyp === 0x02) {
    out[3] = (-(Math.min(eff, 127))) & 0xFF;
  } else if (effTyp === 0x0F) {
    out[3] = eff & 0xFF;
  } else if (effTyp === 0x03) {
    out[3] = eff & 0xFF;
  } else {
    out[3] = 0;
  }

  return out;
}

function writeString(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0x20;
  }
}

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val & 0xFFFF, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val >>> 0, false);
}

function writeS8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

export async function exportDigitalMugician(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const numChannels = 4;

  // -- Collect instrument data -----------------------------------------------
  // Map TrackerSong instrument IDs back to DM sample indices (1-based).
  // We build a list of DM instruments from song.instruments.
  const instruments = song.instruments;
  const sampleCount = instruments.length; // number of instruments (1-based in file)

  // Build instrument ID -> DM sample index (1-based) map
  const instrIdToSampleIdx = new Map<number, number>();
  for (let i = 0; i < instruments.length; i++) {
    instrIdToSampleIdx.set(instruments[i].id, i + 1);
  }

  // Extract wavetable data and PCM data from instruments
  const wavetables: Uint8Array[] = []; // each 128 bytes
  const wavetableIndexMap = new Map<number, number>(); // wave index -> wavetables array index
  const pcmSamples: Array<{
    data: Uint8Array;
    loopOffset: number;
    repeat: number;
    name: string;
    waveIndex: number; // assigned wave index >= 32
  }> = [];

  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i];
    const digMug = inst.digMug;

    if (digMug?.waveformData && digMug.waveformData.length > 0) {
      // Wavetable instrument
      const waveIdx = digMug.wavetable?.[0] ?? wavetables.length;
      if (!wavetableIndexMap.has(waveIdx)) {
        wavetableIndexMap.set(waveIdx, wavetables.length);
        // Pad to 128 bytes
        const waveData = new Uint8Array(128);
        const srcLen = Math.min(digMug.waveformData.length, 128);
        waveData.set(digMug.waveformData.subarray(0, srcLen));
        wavetables.push(waveData);
      }
    } else if (digMug?.pcmData && digMug.pcmData.length > 0) {
      // PCM instrument
      const pcmData = digMug.pcmData instanceof Uint8Array
        ? digMug.pcmData
        : new Uint8Array(digMug.pcmData);
      pcmSamples.push({
        data: pcmData,
        loopOffset: digMug.loopStart ?? 0,
        repeat: digMug.loopLength ?? 0,
        name: inst.name?.substring(0, 12) ?? '',
        waveIndex: 32 + pcmSamples.length, // assigned later
      });
    }
  }

  // Ensure at least one wavetable exists (even if empty)
  if (wavetables.length === 0 && pcmSamples.length === 0) {
    wavetables.push(new Uint8Array(128));
  }

  // Count unique wavetables (max index + 1)
  let maxWaveIndex = 0;
  for (const [idx] of wavetableIndexMap) {
    if (idx >= maxWaveIndex) maxWaveIndex = idx + 1;
  }
  // If no wavetable instruments, we still need one slot
  if (maxWaveIndex === 0) maxWaveIndex = wavetables.length;
  const wavetableCount = maxWaveIndex; // number of 128-byte wavetable entries
  const wavetableBytes = wavetableCount * 128;

  const instrHeaderCount = pcmSamples.length; // 32-byte headers for PCM samples

  // Check if we have arpeggios
  let hasArpeggios = false;
  const arpeggioData = new Uint8Array(256);
  let arpWritePos = 0;

  for (const inst of instruments) {
    const digMug = inst.digMug;
    if (digMug?.arpTable && digMug.arpTable.some(v => v !== 0)) {
      hasArpeggios = true;
      // Write this instrument's arpeggio entries
      for (let a = 0; a < 8 && arpWritePos < 256; a++) {
        arpeggioData[arpWritePos++] = (digMug.arpTable[a] ?? 0) & 0xFF;
      }
    }
  }

  // -- Build DM pattern pool -------------------------------------------------
  // DM stores patterns as a flat pool of single-channel 64-row blocks (4 bytes/row).
  // Each TrackerSong pattern channel becomes one DM sub-pattern.
  // We deduplicate identical channel data.

  const patternPool: Uint8Array[] = []; // each entry is 64*4 = 256 bytes
  const patternHash = new Map<string, number>(); // hash -> pool index

  // Map: (trackerPatternIdx, channel) -> DM pattern pool index
  const channelPatternMap: number[][] = [];

  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    const channelIndices: number[] = [];

    for (let ch = 0; ch < numChannels; ch++) {
      const rows = pat.channels[ch]?.rows ?? [];
      const block = new Uint8Array(64 * 4);

      for (let row = 0; row < 64; row++) {
        const cell = rows[row];
        const xmNote = cell?.note ?? 0;
        // Convert instrument ID back to DM sample index
        const instId = cell?.instrument ?? 0;
        const sampleIdx = instId > 0 ? (instrIdToSampleIdx.get(instId) ?? 0) : 0;
        const effTyp = cell?.effTyp ?? 0;
        const eff = cell?.eff ?? 0;

        const encoded = encodeDMCell(xmNote, sampleIdx, effTyp, eff);
        block.set(encoded, row * 4);
      }

      // Deduplicate
      const hashKey = Array.from(block).join(',');
      let poolIdx = patternHash.get(hashKey);
      if (poolIdx === undefined) {
        poolIdx = patternPool.length;
        patternHash.set(hashKey, poolIdx);
        patternPool.push(block);
      }
      channelIndices.push(poolIdx);
    }

    channelPatternMap.push(channelIndices);
  }

  const totalPatternRows = patternPool.length * 64;
  const waveDataLen = patternPool.length; // totalPatternRows >> 6

  // -- Build song track sequence ---------------------------------------------
  // Each song position becomes 4 track steps (one per channel).
  // Each step: pattern index (u8) + transpose (s8).
  const songLen = song.songPositions.length;
  const numSteps = songLen * 4;

  interface TrackStep { pattern: number; transpose: number }
  const trackSteps: TrackStep[] = [];

  for (let i = 0; i < songLen; i++) {
    const patIdx = song.songPositions[i] ?? 0;
    const chMap = channelPatternMap[patIdx];
    if (!chMap) {
      // Fallback: reference pattern 0
      for (let ch = 0; ch < 4; ch++) {
        trackSteps.push({ pattern: 0, transpose: 0 });
      }
    } else {
      for (let ch = 0; ch < 4; ch++) {
        trackSteps.push({ pattern: chMap[ch] ?? 0, transpose: 0 });
      }
    }
  }

  const songTrackCount = songLen; // numSteps / 4

  // -- Build instrument definitions (16 bytes each) --------------------------
  const instrDefs: Uint8Array[] = [];
  let pcmSampleCounter = 0;

  for (let i = 0; i < sampleCount; i++) {
    const inst = instruments[i];
    const digMug = inst.digMug;
    const def = new Uint8Array(16);

    if (digMug) {
      // wave index
      if (digMug.pcmData && digMug.pcmData.length > 0) {
        def[0] = 32 + pcmSampleCounter; // PCM wave index (>=32)
        pcmSampleCounter++;
      } else {
        def[0] = digMug.wavetable?.[0] ?? 0;
      }

      // waveLen (stored as value >> 1)
      const waveLen = digMug.waveformData ? Math.min(digMug.waveformData.length, 128) : 128;
      def[1] = waveLen >> 1;

      def[2] = Math.min(64, digMug.volume ?? 64); // volume
      def[3] = 0; // volumeSpeed
      def[4] = 0; // arpeggio index (we simplify: point to 0)

      // Try to find arpeggio offset for this instrument
      if (digMug.arpTable && digMug.arpTable.some(v => v !== 0)) {
        // Find where this instrument's arpeggios were written
        let arpSearchPos = 0;
        for (let j = 0; j < i; j++) {
          const prevDig = instruments[j].digMug;
          if (prevDig?.arpTable && prevDig.arpTable.some(v => v !== 0)) {
            arpSearchPos += 8;
          }
        }
        def[4] = arpSearchPos & 0xFF;
      }

      def[5] = 0; // pitch
      def[6] = 0; // effectStep
      def[7] = 0; // pitchDelay

      // finetune (stored as value >> 6)
      def[8] = 0; // finetune >> 6 = 0

      def[9] = 0;  // pitchLoop
      def[10] = digMug.arpSpeed ?? 0; // pitchSpeed
      def[11] = 0; // effect
      def[12] = 0; // source1
      def[13] = 0; // source2
      def[14] = 0; // effectSpeed
      def[15] = 0; // volumeLoop
    }

    instrDefs.push(def);
  }

  // -- Calculate PCM data size -----------------------------------------------
  let instrDataSize = 0;
  for (const pcm of pcmSamples) {
    instrDataSize += pcm.data.length;
    // Ensure even length
    if (pcm.data.length & 1) instrDataSize++;
  }

  // -- Calculate total file size ---------------------------------------------
  const headerSize = 76; // magic(24) + arpeggioFlag(2) + waveDataLen(2) + 8*u32(32) + sampleCount(4) + wavetableCount(4) + instrHeaderCount(4) + instrDataSize(4)
  const songsBlockSize = 8 * 16; // 8 songs x 16 bytes
  const trackDataSize = numSteps * 2; // 2 bytes per step
  const instrDefSize = sampleCount * 16;
  const instrHeaderSize = instrHeaderCount * 32; // 32-byte PCM headers
  const patternDataSize = totalPatternRows * 4;
  const arpeggioSize = hasArpeggios ? 256 : 0;

  const totalSize = headerSize + songsBlockSize + trackDataSize + instrDefSize +
    wavetableBytes + instrHeaderSize + patternDataSize + instrDataSize + arpeggioSize;

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let pos = 0;

  // -- Magic string ----------------------------------------------------------
  writeString(output, 0, MAGIC_V1, 24);
  pos = 24;

  // -- Header fields ---------------------------------------------------------
  writeU16BE(view, pos, hasArpeggios ? 1 : 0); pos += 2; // arpeggioFlag
  writeU16BE(view, pos, waveDataLen);          pos += 2; // waveDataLen (patternPool.length)

  // 8 x u32 songTrackCounts (only song 0 has data, rest are 0)
  writeU32BE(view, pos, songTrackCount); pos += 4;
  for (let i = 1; i < 8; i++) {
    writeU32BE(view, pos, 0); pos += 4;
  }

  writeU32BE(view, pos, sampleCount); pos += 4;        // sampleCount
  writeU32BE(view, pos, wavetableCount); pos += 4;      // wavetableCount
  writeU32BE(view, pos, instrHeaderCount); pos += 4;    // instrHeaderCount
  writeU32BE(view, pos, instrDataSize); pos += 4;       // instrDataSize
  // pos should be 76

  // -- Song headers (8 songs x 16 bytes) -------------------------------------
  // Song 0: active song
  const songSpeed = song.initialSpeed ?? 6;
  const songLength = songLen * 4; // length in steps (already <<2 in the format)
  const restartPos = song.restartPosition ?? 0;
  const hasLoop = restartPos > 0 ? 1 : 0;
  const loopStep = restartPos * 4; // already <<2

  output[pos] = hasLoop;             // loop flag
  output[pos + 1] = loopStep & 0xFF; // loopStep (already <<2)
  output[pos + 2] = songSpeed & 0x0F;
  output[pos + 3] = songLength & 0xFF; // length (already <<2)
  writeString(output, pos + 4, song.name ?? 'Untitled', 12);
  pos += 16;

  // Songs 1-7: empty
  for (let i = 1; i < 8; i++) {
    output[pos] = 0;     // loop
    output[pos + 1] = 0; // loopStep
    output[pos + 2] = 6; // speed
    output[pos + 3] = 0; // length
    writeString(output, pos + 4, '', 12);
    pos += 16;
  }
  // pos should be 76 + 128 = 204

  // -- Track data (song 0 only) ----------------------------------------------
  for (const step of trackSteps) {
    output[pos] = step.pattern & 0xFF; // pattern index (NOT <<6, raw index)
    writeS8(output, pos + 1, step.transpose);
    pos += 2;
  }

  // -- Instrument definitions (16 bytes each) --------------------------------
  for (const def of instrDefs) {
    output.set(def, pos);
    pos += 16;
  }

  // -- Wavetable data (128 bytes each) ---------------------------------------
  // Write wavetables at their original indices
  const wavetableBlock = new Uint8Array(wavetableBytes);
  for (const [origIdx, arrIdx] of wavetableIndexMap) {
    const offset = origIdx * 128;
    if (offset + 128 <= wavetableBlock.length) {
      wavetableBlock.set(wavetables[arrIdx], offset);
    }
  }
  // If no wavetable map entries, just write whatever wavetables we have sequentially
  if (wavetableIndexMap.size === 0) {
    for (let i = 0; i < wavetables.length && i * 128 < wavetableBytes; i++) {
      wavetableBlock.set(wavetables[i], i * 128);
    }
  }
  output.set(wavetableBlock, pos);
  pos += wavetableBytes;

  // -- PCM sample headers (32 bytes each, for V2 instruments) ----------------
  // Only written if instrHeaderCount > 0
  let pcmOffset = 0; // running offset into PCM audio data block
  for (const pcm of pcmSamples) {
    const headerOff = pos;
    const dataLen = pcm.data.length + (pcm.data.length & 1); // even-aligned

    writeU32BE(view, headerOff, pcmOffset);                    // ptrStart (relative)
    writeU32BE(view, headerOff + 4, pcmOffset + dataLen);      // ptrEnd
    // loopPtr: 0 = no loop, otherwise ptrStart + loopOffset
    if (pcm.repeat > 0) {
      writeU32BE(view, headerOff + 8, pcmOffset + pcm.loopOffset);
    } else {
      writeU32BE(view, headerOff + 8, 0);
    }
    // name (12 bytes)
    writeString(output, headerOff + 12, pcm.name, 12);
    // remaining 8 bytes of 32-byte header: zeros (padding)

    pcmOffset += dataLen;
    pos += 32;
  }

  // -- Pattern data (4 bytes per row, flat pool) -----------------------------
  for (const block of patternPool) {
    output.set(block, pos);
    pos += block.length;
  }

  // -- PCM audio data --------------------------------------------------------
  for (const pcm of pcmSamples) {
    output.set(pcm.data, pos);
    pos += pcm.data.length;
    // Pad to even
    if (pcm.data.length & 1) {
      output[pos] = 0;
      pos++;
    }
  }

  // -- Arpeggio data (256 bytes, if flag set) --------------------------------
  if (hasArpeggios) {
    output.set(arpeggioData, pos);
    pos += 256;
  }

  // -- Warnings --------------------------------------------------------------
  if (song.numChannels > 4) {
    warnings.push(`Digital Mugician supports 4 channels; ${song.numChannels - 4} channels were dropped.`);
  }
  if (sampleCount > 63) {
    warnings.push(`Digital Mugician supports up to 63 instruments; ${sampleCount - 63} were dropped.`);
  }
  if (songLen > 255) {
    warnings.push('Song length exceeds 255 positions; truncated.');
  }
  if (patternPool.length > 255) {
    warnings.push(`Pattern pool exceeds 255 entries (${patternPool.length}); file may not load correctly.`);
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName}.dmu`,
    warnings,
  };
}
