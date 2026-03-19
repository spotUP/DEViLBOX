/**
 * DeltaMusic1Exporter.ts -- Export TrackerSong as Delta Music 1.0 (.dm1) format
 *
 * Reconstructs the native DM1 binary from a TrackerSong. The format uses
 * wavetable-based synthesis and optional PCM sample instruments, with 4 independent
 * channel tracks referencing shared 16-row blocks.
 *
 * File layout (all big-endian):
 *   0x000        Magic: "ALL " (4 bytes)
 *   0x004        Track lengths: 4 x uint32 BE (bytes; each entry = 2 bytes)
 *   0x014        Block section length: uint32 BE (bytes; each block = 64 bytes)
 *   0x018        Instrument lengths: 20 x uint32 BE (bytes each)
 *   0x068        Track data: 4 x trackLength[i] bytes
 *   +            Block data: blockLength bytes (16 rows x 4 bytes per block)
 *   +            Instrument data: up to 20 instruments, variable size per slot
 *
 * Reference: DeltaMusic1Parser.ts (authoritative parser)
 * Reference: DeltaMusic1Encoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { DeltaMusic1Config } from '@/types';

// -- Constants ---------------------------------------------------------------

const MAX_INSTRUMENTS = 20;
const MAX_CHANNELS = 4;
const ROWS_PER_BLOCK = 16;
const BYTES_PER_CELL = 4;
const BYTES_PER_BLOCK = ROWS_PER_BLOCK * BYTES_PER_CELL; // 64
const HEADER_SIZE = 104; // 4 magic + 4*4 track + 4 block + 20*4 instr lengths

// -- Export result type ------------------------------------------------------

export interface DeltaMusic1ExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// -- Utility -----------------------------------------------------------------

/**
 * Convert XM note (1-96) to DM1 note index (1-83).
 * Parser does: DM1 note -> DM1_PERIODS[note] -> periodToNoteIndex -> amigaNoteToXM (adds 36)
 * Reverse: xmNote - 36 = amiga note index, which maps directly to DM1 period table index + 1
 * because DM1_PERIODS[1..72] matches AMIGA_PERIODS[0..71].
 */
function xmNoteToDM1(xmNote: number): number {
  if (xmNote <= 0 || xmNote === 97) return 0;
  // Parser: dm1NoteToXM does note -> DM1_PERIODS[note] -> periodToNoteIndex -> +36
  // periodToNoteIndex finds closest match in AMIGA_PERIODS (0-based index)
  // amigaNoteToXM adds 36 to that index
  // Reverse: xmNote - 36 = amigaIdx (0-based), DM1 note = amigaIdx + 1
  const amigaIdx = xmNote - 36;
  if (amigaIdx < 0) return 0;
  const dm1Note = amigaIdx + 1;
  return Math.min(83, Math.max(1, dm1Note));
}

/**
 * Reverse-map XM effect type to DM1 effect type.
 * Parser maps: DM1 0x01->XM 0x0F, 0x02->0x01, 0x03->0x02, 0x09->0x03, 0x0A->0x0C
 */
function xmEffectToDM1(effTyp: number, eff: number): [number, number] {
  switch (effTyp) {
    case 0x0f: // XM Fxx (set speed) -> DM1 0x01
      return [0x01, eff];
    case 0x01: // XM portamento up -> DM1 0x02 (SlideUp)
      return [0x02, eff];
    case 0x02: // XM portamento down -> DM1 0x03 (SlideDown)
      return [0x03, eff];
    case 0x03: // XM tone portamento -> DM1 0x09 (SetPortamento)
      return [0x09, eff];
    case 0x0c: // XM set volume -> DM1 0x0A (SetVolume)
      return [0x0a, Math.min(64, eff)];
    default:
      return [0x00, 0x00];
  }
}

// -- Block deduplication -----------------------------------------------------

interface DM1Block {
  rows: Array<{
    instrument: number; // 0-based
    note: number;       // DM1 note index (0=none, 1-83)
    effect: number;
    effectArg: number;
  }>;
}

/** Serialize a block to a comparable string for deduplication */
function blockKey(block: DM1Block): string {
  return block.rows.map(r => `${r.instrument}:${r.note}:${r.effect}:${r.effectArg}`).join('|');
}

// -- Main exporter -----------------------------------------------------------

export async function exportDeltaMusic1(
  song: TrackerSong,
): Promise<DeltaMusic1ExportResult> {
  const warnings: string[] = [];

  // -- Collect instruments ---------------------------------------------------
  // DM1 supports up to 20 instruments. Pattern data uses 0-based instrument indices.
  const instCount = Math.min(MAX_INSTRUMENTS, song.instruments.length);
  if (song.instruments.length > MAX_INSTRUMENTS) {
    warnings.push(`DM1 supports max ${MAX_INSTRUMENTS} instruments; ${song.instruments.length - MAX_INSTRUMENTS} will be dropped.`);
  }

  // Pre-build instrument binary data for each slot
  interface InstrSlot {
    headerBytes: Uint8Array;
    sampleData: Uint8Array;
    totalLength: number; // headerBytes.length + sampleData.length
  }
  const instrumentSlots: InstrSlot[] = [];

  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    if (i >= instCount) {
      // Empty slot
      instrumentSlots.push({ headerBytes: new Uint8Array(0), sampleData: new Uint8Array(0), totalLength: 0 });
      continue;
    }

    const inst = song.instruments[i];
    const dm1Cfg: DeltaMusic1Config | undefined = inst.deltaMusic1;
    const isSample = dm1Cfg?.isSample ?? !!inst.sample?.audioBuffer;

    // Get sample data (PCM bytes) if available
    let sampleBytes = new Uint8Array(0);
    let sampleLenWords = 0;
    let repeatStartWords = 0;
    let repeatLenWords = 0;

    if (inst.sample?.audioBuffer) {
      // Decode WAV to 8-bit signed PCM
      const wav = new DataView(inst.sample.audioBuffer);
      // Find data chunk size (assume standard WAV: data at offset 40, size at 40, PCM at 44)
      const dataLen = wav.getUint32(40, true);
      const frames = Math.floor(dataLen / 2);
      sampleBytes = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        const s16 = wav.getInt16(44 + j * 2, true);
        sampleBytes[j] = (s16 >> 8) & 0xff;
      }
      sampleLenWords = Math.ceil(frames / 2);

      const loopStart = inst.sample?.loopStart ?? 0;
      const loopEnd = inst.sample?.loopEnd ?? 0;
      if (loopEnd > loopStart) {
        repeatStartWords = Math.floor(loopStart / 2);
        repeatLenWords = Math.ceil((loopEnd - loopStart) / 2);
      }
    } else if (!isSample && dm1Cfg?.table) {
      // Synth instrument: generate waveform data from table
      // For synth instruments, the sample data is the wavetable memory.
      // We need at least enough bytes to cover the waveform references.
      // Each waveform is 32 bytes; find the max waveform index in the table.
      let maxWaveIdx = 0;
      for (const entry of dm1Cfg.table) {
        if (entry === 0xff) break;
        if (entry < 0x80 && entry > maxWaveIdx) maxWaveIdx = entry;
      }
      const neededBytes = (maxWaveIdx + 1) * 32;
      // Create silent waveform data (we can't reconstruct the originals without source)
      sampleBytes = new Uint8Array(neededBytes);
      sampleLenWords = Math.ceil(neededBytes / 2);
      if (sampleLenWords === 0) sampleLenWords = 16; // minimum
      if (sampleBytes.length === 0) sampleBytes = new Uint8Array(sampleLenWords * 2);
      repeatStartWords = 0;
      repeatLenWords = sampleLenWords;
    }

    // If no sample data and no config, this is an empty slot
    if (sampleLenWords === 0 && !dm1Cfg) {
      instrumentSlots.push({ headerBytes: new Uint8Array(0), sampleData: new Uint8Array(0), totalLength: 0 });
      continue;
    }

    // Ensure sampleLenWords is non-zero if we have config
    if (sampleLenWords === 0 && dm1Cfg) {
      sampleLenWords = 16;
      sampleBytes = new Uint8Array(sampleLenWords * 2);
      repeatStartWords = 0;
      repeatLenWords = sampleLenWords;
    }

    // Build the instrument header
    const headerSize = isSample ? 30 : 78;
    const header = new Uint8Array(headerSize);

    const volume = dm1Cfg?.volume ?? 64;
    const attackStep = dm1Cfg?.attackStep ?? 0;
    const attackDelay = dm1Cfg?.attackDelay ?? 0;
    const decayStep = dm1Cfg?.decayStep ?? 0;
    const decayDelay = dm1Cfg?.decayDelay ?? 0;
    const sustain = dm1Cfg?.sustain ?? 0;
    const releaseStep = dm1Cfg?.releaseStep ?? 0;
    const releaseDelay = dm1Cfg?.releaseDelay ?? 0;
    const vibratoWait = dm1Cfg?.vibratoWait ?? 0;
    const vibratoStep = dm1Cfg?.vibratoStep ?? 0;
    const vibratoLength = dm1Cfg?.vibratoLength ?? 0;
    const bendRate = dm1Cfg?.bendRate ?? 0;
    const portamento = dm1Cfg?.portamento ?? 0;
    const tableDelay = dm1Cfg?.tableDelay ?? 0;
    const arpeggio = dm1Cfg?.arpeggio ?? [0, 0, 0, 0, 0, 0, 0, 0];

    header[0] = attackStep & 0xff;
    header[1] = attackDelay & 0xff;
    header[2] = decayStep & 0xff;
    header[3] = decayDelay & 0xff;
    // sustain is uint16 BE at offset 4-5
    header[4] = (sustain >> 8) & 0xff;
    header[5] = sustain & 0xff;
    header[6] = releaseStep & 0xff;
    header[7] = releaseDelay & 0xff;
    header[8] = volume & 0xff;
    header[9] = vibratoWait & 0xff;
    header[10] = vibratoStep & 0xff;
    header[11] = vibratoLength & 0xff;
    // bendRate is signed int8
    header[12] = bendRate & 0xff;
    header[13] = portamento & 0xff;
    header[14] = isSample ? 1 : 0;
    header[15] = tableDelay & 0xff;
    // arpeggio bytes 16-23
    for (let a = 0; a < 8; a++) {
      header[16 + a] = (arpeggio[a] ?? 0) & 0xff;
    }
    // sampleLength in words, uint16 BE at 24-25
    header[24] = (sampleLenWords >> 8) & 0xff;
    header[25] = sampleLenWords & 0xff;
    // repeatStart in words, uint16 BE at 26-27
    header[26] = (repeatStartWords >> 8) & 0xff;
    header[27] = repeatStartWords & 0xff;
    // repeatLength in words, uint16 BE at 28-29
    header[28] = (repeatLenWords >> 8) & 0xff;
    header[29] = repeatLenWords & 0xff;

    // Synth table (48 bytes) at offset 30-77 if !isSample
    if (!isSample) {
      const table = dm1Cfg?.table ?? [];
      for (let t = 0; t < 48; t++) {
        header[30 + t] = (table[t] ?? 0) & 0xff;
      }
    }

    instrumentSlots.push({
      headerBytes: header,
      sampleData: sampleBytes,
      totalLength: header.length + sampleBytes.length,
    });
  }

  // -- Build blocks from pattern data ----------------------------------------
  // DM1 uses 16-row blocks shared across all channels. Each song position
  // references one block per channel (with a transpose value).
  // We create one block per (songPosition, channel) and deduplicate.

  const allBlocks: DM1Block[] = [];
  const blockMap = new Map<string, number>(); // key -> block index

  // Track entries per channel: [blockIndex, transpose][]
  // For simplicity, transpose is always 0 (we encode absolute notes in the blocks)
  const trackEntries: Array<Array<{ blockNum: number; transpose: number }>> = [[], [], [], []];

  const songLen = song.songPositions.length;
  if (songLen === 0) {
    warnings.push('Song has no positions; exporting empty module.');
  }

  for (let pos = 0; pos < songLen; pos++) {
    const patIdx = song.songPositions[pos] ?? 0;
    const pat = song.patterns[patIdx];
    if (!pat) {
      // Missing pattern -- add empty block references
      for (let ch = 0; ch < MAX_CHANNELS; ch++) {
        const emptyBlock: DM1Block = {
          rows: Array.from({ length: ROWS_PER_BLOCK }, () => ({
            instrument: 0, note: 0, effect: 0, effectArg: 0,
          })),
        };
        const key = blockKey(emptyBlock);
        if (!blockMap.has(key)) {
          blockMap.set(key, allBlocks.length);
          allBlocks.push(emptyBlock);
        }
        trackEntries[ch].push({ blockNum: blockMap.get(key)!, transpose: 0 });
      }
      continue;
    }

    for (let ch = 0; ch < MAX_CHANNELS; ch++) {
      const channel = pat.channels[ch];
      const block: DM1Block = {
        rows: Array.from({ length: ROWS_PER_BLOCK }, (_, row) => {
          const cell = channel?.rows[row];
          if (!cell) return { instrument: 0, note: 0, effect: 0, effectArg: 0 };

          const xmNote = cell.note ?? 0;
          const dm1Note = xmNoteToDM1(xmNote);

          // Instrument: DEViLBOX 1-based -> DM1 0-based
          const instrId = cell.instrument ?? 0;
          const dm1Instr = instrId > 0 ? (instrId - 1) & 0xff : 0;

          // Effects
          const [effType, effArg] = xmEffectToDM1(cell.effTyp ?? 0, cell.eff ?? 0);

          return {
            instrument: dm1Note > 0 ? dm1Instr : 0,
            note: dm1Note,
            effect: effType,
            effectArg: effArg,
          };
        }),
      };

      const key = blockKey(block);
      if (!blockMap.has(key)) {
        blockMap.set(key, allBlocks.length);
        allBlocks.push(block);
      }
      trackEntries[ch].push({ blockNum: blockMap.get(key)!, transpose: 0 });
    }
  }

  // Ensure at least one block exists
  if (allBlocks.length === 0) {
    allBlocks.push({
      rows: Array.from({ length: ROWS_PER_BLOCK }, () => ({
        instrument: 0, note: 0, effect: 0, effectArg: 0,
      })),
    });
    for (let ch = 0; ch < MAX_CHANNELS; ch++) {
      trackEntries[ch].push({ blockNum: 0, transpose: 0 });
    }
  }

  if (allBlocks.length > 255) {
    warnings.push(`DM1 block index is 8-bit; ${allBlocks.length} blocks may cause issues.`);
  }

  // -- Build track data with loop-back marker --------------------------------
  // Each track entry = 2 bytes: [blockNum: uint8, transpose: int8]
  // End marker: [0xFF, 0xFF] followed by [jumpHigh, jumpLow] encoding loop target
  // Jump target = ((jumpHigh << 8) | jumpLow) & 0x7FF

  const trackBuffers: Uint8Array[] = [];
  for (let ch = 0; ch < MAX_CHANNELS; ch++) {
    const entries = trackEntries[ch];
    // entries + end marker (2 bytes) + loop target (2 bytes)
    const buf = new Uint8Array((entries.length + 2) * 2);
    let off = 0;
    for (const entry of entries) {
      buf[off++] = entry.blockNum & 0xff;
      buf[off++] = entry.transpose & 0xff; // signed, stored as uint8
    }
    // End marker: 0xFF, 0xFF (blockNumber=0xFF, transpose=-1 as uint8)
    buf[off++] = 0xff;
    buf[off++] = 0xff;
    // Loop back to position 0 (or restartPosition if set)
    const loopTarget = (song.restartPosition ?? 0) & 0x7ff;
    buf[off++] = (loopTarget >> 8) & 0xff;
    buf[off++] = loopTarget & 0xff;

    trackBuffers.push(buf);
  }

  // -- Calculate sizes -------------------------------------------------------
  const trackLengths = trackBuffers.map(b => b.length);
  const blockSectionLength = allBlocks.length * BYTES_PER_BLOCK;
  const instrumentLengths = instrumentSlots.map(s => s.totalLength);

  const totalTrackBytes = trackLengths.reduce((a, b) => a + b, 0);
  const totalInstrBytes = instrumentLengths.reduce((a, b) => a + b, 0);
  const totalSize = HEADER_SIZE + totalTrackBytes + blockSectionLength + totalInstrBytes;

  // -- Assemble the binary ---------------------------------------------------
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let off = 0;

  // Magic "ALL "
  output[0] = 0x41; output[1] = 0x4c; output[2] = 0x4c; output[3] = 0x20;
  off = 4;

  // Track lengths (4 x uint32 BE)
  for (let ch = 0; ch < 4; ch++) {
    view.setUint32(off, trackLengths[ch], false);
    off += 4;
  }

  // Block section length (uint32 BE)
  view.setUint32(off, blockSectionLength, false);
  off += 4;

  // Instrument lengths (20 x uint32 BE)
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    view.setUint32(off, instrumentLengths[i], false);
    off += 4;
  }

  // -- Track data ------------------------------------------------------------
  for (let ch = 0; ch < 4; ch++) {
    output.set(trackBuffers[ch], off);
    off += trackBuffers[ch].length;
  }

  // -- Block data ------------------------------------------------------------
  for (const block of allBlocks) {
    for (let row = 0; row < ROWS_PER_BLOCK; row++) {
      const r = block.rows[row];
      output[off++] = r.instrument & 0xff;
      output[off++] = r.note & 0xff;
      output[off++] = r.effect & 0xff;
      output[off++] = r.effectArg & 0xff;
    }
  }

  // -- Instrument data -------------------------------------------------------
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const slot = instrumentSlots[i];
    if (slot.totalLength === 0) continue;
    output.set(slot.headerBytes, off);
    off += slot.headerBytes.length;
    output.set(slot.sampleData, off);
    off += slot.sampleData.length;
  }

  // -- Build result ----------------------------------------------------------
  const baseName = song.name || 'untitled';
  const filename = baseName.endsWith('.dm1') ? baseName : `${baseName}.dm1`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
