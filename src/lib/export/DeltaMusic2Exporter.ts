/**
 * DeltaMusic2Exporter.ts — Export TrackerSong as Delta Music 2.0 (.dm2) format
 *
 * Produces a valid DM2 binary with the standard file layout:
 *   0x000 – 0x877  Player code (zeroed stub — UADE replayer handles playback)
 *   0x878 – 0x9A3  Internal channel structures (zeroed)
 *   0x9A4 – 0xAE1  Sound-effect channel structures (zeroed)
 *   0xAE2 – 0xB8B  Period table (85 × uint16 BE)
 *   0xB8C – 0xBC5  Internal global variables (zeroed except startSpeed at 0xBBB)
 *   0xBC6 – 0xBC9  ID: ".FNL"
 *   0xBCA – 0xFC9  Arpeggios (64 × 16 bytes = 1024 bytes)
 *   0xFCA – 0xFD9  Track loop positions + track lengths (4 × [loopPos u16, len u16])
 *   0xFDA –        Track 1..4 data (variable; 2-byte pairs = [block_num, transpose])
 *   +               Block data length (u32 BE) + block data (64 bytes/block)
 *   +               Instrument offset table (128 × u16 BE) + instrument data
 *   +               Waveform data length (u32 BE) + waveform data (256 bytes/waveform)
 *   +               64 unknown bytes
 *   +               8 sample offsets (u32 BE each) + sample PCM data
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Standard DM2 period table (85 entries, index 0 = no note) ────────────
const DM2_PERIODS: number[] = [
  0, 6848, 6464, 6096, 5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840, 3616,
  3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1808,
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 904,
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 452, 428, 404,
  381, 360, 339, 320, 302, 285, 269, 254, 240, 226, 214, 202, 190, 180,
  170, 160, 151, 143, 135, 127, 120, 113, 113, 113, 113, 113, 113, 113,
  113, 113, 113, 113, 113, 113,
];

// ── Header offsets ───────────────────────────────────────────────────────
const PERIOD_TABLE_OFFSET = 0xAE2;
const START_SPEED_OFFSET  = 0xBBB;
const MAGIC_OFFSET        = 0xBC6;
const TRACK_HEADER_OFFSET = 0xFCA;
const TRACK_DATA_OFFSET   = 0xFDA;

const FIXED_HEADER_SIZE = TRACK_DATA_OFFSET; // 0xFDA = 4058 bytes

// ── Helpers ──────────────────────────────────────────────────────────────

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val & 0xFFFF, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val >>> 0, false);
}

function writeS8(arr: Uint8Array, off: number, val: number): void {
  arr[off] = val & 0xFF;
}

/**
 * Extract 8-bit signed PCM from a WAV audioBuffer (16-bit LE PCM → 8-bit signed).
 * Returns null if the buffer doesn't look like a valid WAV.
 */
function extractPCMFromWav(audioBuffer: ArrayBuffer): Int8Array | null {
  if (audioBuffer.byteLength < 44) return null;
  const wav = new DataView(audioBuffer);
  // Find data chunk size at offset 40 (standard WAV)
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const pcm = new Int8Array(frames);
  for (let j = 0; j < frames; j++) {
    const s16 = wav.getInt16(44 + j * 2, true);
    pcm[j] = s16 >> 8; // 16-bit → 8-bit signed
  }
  return pcm;
}

// ── Block deduplication ─────────────────────────────────────────────────

interface DM2Block {
  data: Uint8Array; // 64 bytes = 16 rows × 4 bytes
}

/** Serialize one channel of a pattern (16 rows) into a 64-byte DM2 block. */
function buildBlock(
  song: TrackerSong,
  patternIndex: number,
  channel: number,
): Uint8Array {
  const block = new Uint8Array(64);
  const pattern = song.patterns[patternIndex];
  if (!pattern) return block;

  const ch = pattern.channels[channel];
  if (!ch) return block;

  for (let row = 0; row < 16; row++) {
    const cell = ch.rows[row];
    if (!cell) continue;

    const off = row * 4;
    const note = cell.note ?? 0;

    // Byte 0: note (XM note = DM2 note index directly, 0 = no note)
    block[off] = (note > 0 && note <= 96) ? note : 0;

    // Byte 1: instrument (1-based → 0-based)
    const instr = cell.instrument ?? 0;
    block[off + 1] = instr > 0 ? (instr - 1) & 0xFF : 0;

    // Bytes 2-3: effect + param (reverse XM → DM2 mapping)
    const effTyp = cell.effTyp ?? 0;
    const eff = cell.eff ?? 0;
    const vol = cell.volume ?? 0;

    let dm2Eff = 0;
    let dm2Param = 0;

    // Volume column → DM2 effect 0x06
    if (vol >= 0x10 && vol <= 0x50) {
      const xmVol = vol - 0x10; // 0-64
      dm2Eff = 0x06;
      dm2Param = Math.round(xmVol / 64 * 63) & 0x3F;
    } else {
      switch (effTyp) {
        case 0x0F: // Set speed → DM2 0x01
          dm2Eff = 0x01;
          dm2Param = eff & 0x0F;
          break;
        case 0x01: // Portamento up → DM2 0x03
          dm2Eff = 0x03;
          dm2Param = eff;
          break;
        case 0x02: // Portamento down → DM2 0x04
          dm2Eff = 0x04;
          dm2Param = eff;
          break;
        case 0x03: // Tone portamento → DM2 0x05
          dm2Eff = 0x05;
          dm2Param = eff;
          break;
        case 0x10: // Global volume → DM2 0x07
          dm2Eff = 0x07;
          dm2Param = Math.round(Math.min(64, eff) / 64 * 63) & 0x3F;
          break;
        case 0x00: // Arpeggio → DM2 0x08
          if (eff !== 0) {
            dm2Eff = 0x08;
            dm2Param = eff & 0x3F;
          }
          break;
      }
    }

    block[off + 2] = dm2Eff & 0xFF;
    block[off + 3] = dm2Param & 0xFF;
  }

  return block;
}

/** Check if two 64-byte blocks are identical. */
function blocksEqual(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < 64; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ── Main Export ──────────────────────────────────────────────────────────

export async function exportDeltaMusic2(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  const nChannels = 4;
  const numPatterns = song.patterns.length;
  const songLen = Math.min(256, song.songPositions.length || numPatterns);

  // ── Build unique blocks and track entries ──────────────────────────────
  // Each song position maps to one TrackerSong pattern (which has 4 channels).
  // Each channel at each position references a DM2 "block" (16 rows × 4 bytes).
  // We deduplicate identical blocks.
  const uniqueBlocks: DM2Block[] = [];
  // trackEntries[ch] = array of { blockNumber, transpose } for each song position
  const trackEntries: Array<Array<{ blockNumber: number; transpose: number }>> = [
    [], [], [], [],
  ];

  for (let pos = 0; pos < songLen; pos++) {
    const patIdx = song.songPositions[pos] ?? pos;

    for (let ch = 0; ch < nChannels; ch++) {
      const blockData = buildBlock(song, patIdx, ch);

      // Find existing identical block
      let blockNum = -1;
      for (let b = 0; b < uniqueBlocks.length; b++) {
        if (blocksEqual(uniqueBlocks[b].data, blockData)) {
          blockNum = b;
          break;
        }
      }

      if (blockNum < 0) {
        blockNum = uniqueBlocks.length;
        uniqueBlocks.push({ data: blockData });
      }

      if (blockNum > 255) {
        warnings.push(`Block count exceeds 255; channel ${ch + 1} position ${pos} may be incorrect.`);
        blockNum = 255;
      }

      trackEntries[ch].push({ blockNumber: blockNum, transpose: 0 });
    }
  }

  // ── Build instrument data ─────────────────────────────────────────────
  const maxInstruments = Math.min(128, song.instruments.length);

  // Collect PCM sample data grouped by sample slot (up to 8 slots)
  interface SampleSlot {
    pcm: Int8Array;
  }
  const sampleSlots: (SampleSlot | null)[] = new Array(8).fill(null);
  let nextSampleSlot = 0;

  // Build per-instrument 88-byte headers
  const instrumentHeaders: Uint8Array[] = [];
  const instrSampleSlotMap: number[] = []; // instrument index → sample slot

  for (let i = 0; i < maxInstruments; i++) {
    const inst = song.instruments[i];
    const header = new Uint8Array(88);
    const hv = new DataView(header.buffer);

    const dm2 = inst?.deltaMusic2;

    // Determine if this is a sample instrument
    const hasSample = inst?.sample?.audioBuffer && inst.sample.audioBuffer.byteLength > 44;
    const isSample = dm2?.isSample ?? !!hasSample;

    let sampleSlotIdx = 0;
    let sampleLenWords = 0;
    let repeatStartBytes = 0;
    let repeatLenWords = 0;

    if (isSample && hasSample) {
      // Extract PCM from WAV
      const pcm = extractPCMFromWav(inst.sample!.audioBuffer!);
      if (pcm && pcm.length > 0) {
        // Assign a sample slot
        sampleSlotIdx = nextSampleSlot < 8 ? nextSampleSlot++ : 7;
        sampleSlots[sampleSlotIdx] = { pcm };

        sampleLenWords = Math.floor(pcm.length / 2);

        // Loop points
        const loopStart = inst.sample!.loopStart ?? 0;
        const loopEnd = inst.sample!.loopEnd ?? 0;
        if (loopEnd > loopStart && inst.sample!.loop) {
          repeatStartBytes = loopStart;
          repeatLenWords = Math.floor((loopEnd - loopStart) / 2);
        }
      }
    } else if (!isSample && dm2) {
      // Synth instrument: sampleLength from table waveform size
      sampleLenWords = 128; // 256 bytes / 2 = typical DM2 waveform
    }

    instrSampleSlotMap.push(sampleSlotIdx);

    // Bytes 0-1: sampleLength in words
    hv.setUint16(0, sampleLenWords, false);
    // Bytes 2-3: repeatStart in bytes (raw)
    hv.setUint16(2, repeatStartBytes, false);
    // Bytes 4-5: repeatLength in words
    hv.setUint16(4, repeatLenWords, false);

    // Volume table: 5 × 3 bytes at offset 6
    if (dm2?.volTable) {
      for (let v = 0; v < 5; v++) {
        const entry = dm2.volTable[v];
        if (entry) {
          header[6 + v * 3]     = entry.speed & 0xFF;
          header[6 + v * 3 + 1] = entry.level & 0xFF;
          header[6 + v * 3 + 2] = entry.sustain & 0xFF;
        }
      }
    }

    // Vibrato table: 5 × 3 bytes at offset 21
    if (dm2?.vibTable) {
      for (let v = 0; v < 5; v++) {
        const entry = dm2.vibTable[v];
        if (entry) {
          header[21 + v * 3]     = entry.speed & 0xFF;
          header[21 + v * 3 + 1] = entry.delay & 0xFF;
          header[21 + v * 3 + 2] = entry.sustain & 0xFF;
        }
      }
    }

    // Pitch bend: uint16 BE at offset 36
    hv.setUint16(36, (dm2?.pitchBend ?? 0) & 0xFFFF, false);

    // isSample flag: byte at offset 38 (0xFF = sample, 0x00 = synth)
    header[38] = isSample ? 0xFF : 0x00;

    // sampleNumber: byte at offset 39 (low 3 bits)
    header[39] = sampleSlotIdx & 0x07;

    // Waveform sequence table: 48 bytes at offset 40
    if (dm2?.table) {
      const tbl = dm2.table;
      for (let t = 0; t < 48; t++) {
        header[40 + t] = t < tbl.length ? tbl[t] : 0xFF;
      }
    } else {
      // Fill with 0xFF (loop-back / empty)
      for (let t = 40; t < 88; t++) {
        header[t] = 0xFF;
      }
    }

    instrumentHeaders.push(header);
  }

  if (maxInstruments === 0) {
    warnings.push('No instruments found; output may not play correctly.');
  }

  // ── Build waveform data ───────────────────────────────────────────────
  // For synth instruments we need waveform data. Extract from sample audioBuffers
  // of synth-type instruments (stored at SYNTH_BASE_RATE = 2072 Hz).
  const waveforms: Uint8Array[] = [];
  // Collect unique waveform indices from all instrument tables
  const waveformMap = new Map<number, Uint8Array>(); // waveform index → 256-byte data

  for (let i = 0; i < maxInstruments; i++) {
    const inst = song.instruments[i];
    const dm2 = inst?.deltaMusic2;
    if (!dm2 || dm2.isSample) continue;

    // If this synth instrument has sample data, use it as the waveform
    if (inst?.sample?.audioBuffer) {
      const pcm = extractPCMFromWav(inst.sample.audioBuffer);
      if (pcm) {
        // The table lists waveform indices; the first non-0xFF entry is the initial waveform
        for (let t = 0; t < 48; t++) {
          const wIdx = dm2.table[t];
          if (wIdx === 0xFF) break; // loop-back marker
          if (!waveformMap.has(wIdx)) {
            // Use the PCM data as the waveform (truncated/padded to 256 bytes)
            const wave = new Uint8Array(256);
            for (let j = 0; j < 256; j++) {
              wave[j] = j < pcm.length ? (pcm[j] & 0xFF) : 0;
            }
            waveformMap.set(wIdx, wave);
          }
        }
      }
    }
  }

  // Sort waveforms by index, fill gaps with empty waveforms
  if (waveformMap.size > 0) {
    const maxWaveIdx = Math.max(...waveformMap.keys());
    for (let w = 0; w <= maxWaveIdx; w++) {
      waveforms.push(waveformMap.get(w) ?? new Uint8Array(256));
    }
  }

  // ── Calculate sizes ───────────────────────────────────────────────────

  // Track data: 4 channels × songLen entries × 2 bytes each
  const trackDataSize = nChannels * songLen * 2;

  // Block data: numBlocks × 64 bytes
  const blockDataSize = uniqueBlocks.length * 64;

  // Instrument offset table: 128 × uint16 = 256 bytes
  const instrOffsetTableSize = 256;

  // Instrument data: maxInstruments × 88 bytes
  const instrDataSize = maxInstruments * 88;

  // Waveform data: numWaveforms × 256 bytes
  const waveformDataSize = waveforms.length * 256;

  // 64 unknown bytes
  const unknownBytes = 64;

  // Sample offset table: 8 × uint32 = 32 bytes
  const sampleOffsetTableSize = 32;

  // Sample PCM data
  let totalSamplePCMSize = 0;
  const samplePCMOffsets: number[] = new Array(8).fill(0);
  for (let s = 0; s < 8; s++) {
    samplePCMOffsets[s] = totalSamplePCMSize;
    if (sampleSlots[s]) {
      totalSamplePCMSize += sampleSlots[s]!.pcm.length;
    }
  }

  const totalSize =
    FIXED_HEADER_SIZE +
    trackDataSize +
    4 + blockDataSize +         // u32 blockDataLen + block data
    instrOffsetTableSize +
    instrDataSize +
    4 + waveformDataSize +      // u32 waveformDataLen + waveform data
    unknownBytes +
    sampleOffsetTableSize +
    totalSamplePCMSize;

  // ── Write output ──────────────────────────────────────────────────────

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // ── Fixed header region (0x000 – 0xFD9) ──────────────────────────────

  // Period table at 0xAE2 (85 × uint16 BE)
  for (let i = 0; i < 85; i++) {
    writeU16BE(view, PERIOD_TABLE_OFFSET + i * 2, DM2_PERIODS[i]);
  }

  // Start speed at 0xBBB
  const speed = Math.max(1, Math.min(15, song.initialSpeed ?? 3));
  output[START_SPEED_OFFSET] = speed & 0xFF;

  // ".FNL" magic at 0xBC6
  output[MAGIC_OFFSET]     = 0x2E; // '.'
  output[MAGIC_OFFSET + 1] = 0x46; // 'F'
  output[MAGIC_OFFSET + 2] = 0x4E; // 'N'
  output[MAGIC_OFFSET + 3] = 0x4C; // 'L'

  // Arpeggios at 0xBCA (64 × 16 bytes) — leave zeroed (no arpeggio data preserved)

  // Track header at 0xFCA: 4 × [loopPos u16, trackByteLen u16]
  for (let ch = 0; ch < 4; ch++) {
    const entryCount = trackEntries[ch].length;
    writeU16BE(view, TRACK_HEADER_OFFSET + ch * 4, 0); // loopPosition = 0
    writeU16BE(view, TRACK_HEADER_OFFSET + ch * 4 + 2, entryCount * 2); // byte length
  }

  // ── Track data at 0xFDA ───────────────────────────────────────────────

  let off = TRACK_DATA_OFFSET;
  for (let ch = 0; ch < 4; ch++) {
    for (const entry of trackEntries[ch]) {
      output[off]     = entry.blockNumber & 0xFF;
      writeS8(output, off + 1, entry.transpose);
      off += 2;
    }
  }

  // ── Block data length + block data ────────────────────────────────────

  writeU32BE(view, off, blockDataSize);
  off += 4;

  for (const block of uniqueBlocks) {
    output.set(block.data, off);
    off += 64;
  }

  // ── Instrument offset table (128 × uint16 BE) ────────────────────────
  // offsets[0] is implicit 0 (not stored); offsets[1..127] stored.
  // Last entry = breakOffset = total instrument data size.
  const breakOffset = maxInstruments * 88;

  for (let i = 1; i <= 127; i++) {
    if (i < maxInstruments) {
      writeU16BE(view, off + (i - 1) * 2, i * 88);
    } else {
      // All remaining point to breakOffset
      writeU16BE(view, off + (i - 1) * 2, breakOffset);
    }
  }
  off += 256;

  // ── Instrument data ───────────────────────────────────────────────────

  for (let i = 0; i < maxInstruments; i++) {
    output.set(instrumentHeaders[i], off);
    off += 88;
  }

  // ── Waveform data length + waveform data ──────────────────────────────

  writeU32BE(view, off, waveformDataSize);
  off += 4;

  for (const wave of waveforms) {
    output.set(wave, off);
    off += 256;
  }

  // ── 64 unknown bytes (zeroed) ─────────────────────────────────────────
  off += 64;

  // ── 8 sample offsets (uint32 BE each) ─────────────────────────────────

  for (let s = 0; s < 8; s++) {
    writeU32BE(view, off + s * 4, samplePCMOffsets[s]);
  }
  off += 32;

  // ── Sample PCM data ───────────────────────────────────────────────────

  for (let s = 0; s < 8; s++) {
    const slot = sampleSlots[s];
    if (slot) {
      for (let j = 0; j < slot.pcm.length; j++) {
        output[off + j] = slot.pcm[j] & 0xFF;
      }
      off += slot.pcm.length;
    }
  }

  // ── Return result ─────────────────────────────────────────────────────

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '_');
  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName}.dm2`,
    warnings,
  };
}
