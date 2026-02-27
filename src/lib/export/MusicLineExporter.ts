/**
 * MusicLineExporter.ts — Export TrackerSong / instruments as native MusicLine Editor (.ml / .mli) files.
 *
 * Binary format verified 1:1 against Reference Code/musicline-vasm/Mline116.asm:
 *   SaveModule     @ lines 6980–7520
 *   SaveExternInst @ ~8300
 *
 * Module file layout:
 *   "MLEDMODL"(8) + extraHeaderSize(u32BE = 0) + chunks(VERS→TUNE→PART×N→INST×I→SMPL×I)
 *
 * Chunk format: id[4] + u32BE(chunkSize) + chunkData
 *   TUNE: chunkSize = 40 (fixed header only); channel sizes + data written sequentially after
 *   SMPL: chunkSize = 50 + pcmLen; 6-byte extra header written BEFORE chunkData but NOT counted
 *   INST: chunkSize = 206 (exact INST struct size)
 *   PART: chunkSize = 2 + compressedLen (2-byte partNum + RLE data)
 *
 * Standalone instrument file layout:
 *   "MLED"(4) + "INST"(4) + extraHeaderSize(u32BE = 0) + chunks(VERS→INST→SMPL)
 */

import type { TrackerSong, Pattern } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types/instrument';

// ── Sequential binary writer ───────────────────────────────────────────────

class ByteWriter {
  private buf: number[] = [];

  writeU8(v: number): void { this.buf.push(v & 0xFF); }

  writeU16BE(v: number): void {
    this.buf.push((v >> 8) & 0xFF, v & 0xFF);
  }

  writeU32BE(v: number): void {
    this.buf.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF);
  }

  /** Write a signed 16-bit big-endian value (handles negative numbers). */
  writeI16BE(v: number): void {
    const u = v < 0 ? v + 65536 : v;
    this.buf.push((u >> 8) & 0xFF, u & 0xFF);
  }

  /** Write exactly `len` bytes from `s` (padded with zeros). */
  writeStr(s: string, len: number): void {
    for (let i = 0; i < len; i++) this.buf.push(i < s.length ? (s.charCodeAt(i) & 0xFF) : 0);
  }

  /** Write a 4-character chunk ID string. */
  writeChunkId(id: string): void {
    for (let i = 0; i < 4; i++) this.buf.push(id.charCodeAt(i) & 0xFF);
  }

  writeZeros(n: number): void { for (let i = 0; i < n; i++) this.buf.push(0); }
  writeBytes(data: Uint8Array): void { for (const b of data) this.buf.push(b); }

  get length(): number { return this.buf.length; }
  build(): Uint8Array { return new Uint8Array(this.buf); }
}

// ── PCM extraction ─────────────────────────────────────────────────────────

/**
 * Extract 8-bit signed PCM from a sampler InstrumentConfig.
 *
 * The parser stores PCM as a 16-bit WAV (pcm8ToWAV: s8 * 256 → s16) in
 * `sample.audioBuffer` or as a base64 data URL in `sample.url`.
 * To recover the original bytes: read S16LE, arithmetic-right-shift 8 → S8.
 *
 * Returns at least 2 silent bytes if no sample data is available.
 */
function extractPcm(inst: InstrumentConfig): Uint8Array {
  const sample = inst.sample;
  if (!sample) return new Uint8Array(2);

  let wavBuf: ArrayBuffer | null = null;

  if (sample.audioBuffer instanceof ArrayBuffer && sample.audioBuffer.byteLength > 44) {
    wavBuf = sample.audioBuffer;
  } else if (typeof sample.url === 'string' && sample.url.startsWith('data:')) {
    const b64 = sample.url.split(',')[1];
    if (b64) {
      try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        wavBuf = bytes.buffer;
      } catch {
        // atob can throw on malformed base64; fall through to silence
      }
    }
  }

  if (!wavBuf || wavBuf.byteLength <= 44) return new Uint8Array(2);

  const view = new DataView(wavBuf);
  const numSamples = (wavBuf.byteLength - 44) >> 1; // 16-bit mono → N samples
  const out = new Uint8Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    // pcm8ToWAV: s16 = s8 * 256  →  s8 = s16 >> 8  (arithmetic shift preserves sign bit pattern)
    const s16 = view.getInt16(44 + i * 2, true);
    out[i] = (s16 >> 8) & 0xFF;
  }
  return out;
}

// ── PART raw data (1536 bytes) builder ────────────────────────────────────

/**
 * Convert a single-voice DEViLBOX Pattern to a 1536-byte raw PART buffer.
 * Reverses buildPattern() + mapMLEffect() from MusicLineParser.ts.
 *
 * Row layout (12 bytes): [note, instr, eff0Num, eff0Par, eff1Num, eff1Par, 0,0,0,0,0,0]
 * Note encoding: mlNote = cell.note + 12  (parser stored cell.note = mlNote - 12)
 */
function buildPartRawData(pattern: Pattern): Uint8Array {
  const raw = new Uint8Array(128 * 12); // zero-init
  const ch = pattern.channels[0];
  if (!ch?.rows) return raw;

  const rowCount = Math.min(128, ch.rows.length);
  for (let row = 0; row < rowCount; row++) {
    const cell = ch.rows[row];
    if (!cell) continue;
    const base = row * 12;

    if (cell.note > 0) raw[base] = Math.min(255, cell.note + 12); // XM → ML note
    if (cell.instrument > 0) raw[base + 1] = cell.instrument & 0xFF;

    const fx0 = unmapMLEffect(cell.effTyp ?? 0, cell.eff ?? 0);
    raw[base + 2] = fx0.effectNum;
    raw[base + 3] = fx0.effectPar;

    const fx1 = unmapMLEffect(cell.effTyp2 ?? 0, cell.eff2 ?? 0);
    raw[base + 4] = fx1.effectNum;
    raw[base + 5] = fx1.effectPar;
    // bytes 6-11: zero (no extra effect words stored)
  }
  return raw;
}

/** Reverse of mapMLEffect() in MusicLineParser.ts. */
function unmapMLEffect(effTyp: number, eff: number): { effectNum: number; effectPar: number } {
  switch (effTyp) {
    case 0x01: return { effectNum: 1, effectPar: eff };
    case 0x02: return { effectNum: 2, effectPar: eff };
    case 0x0C: return { effectNum: 3, effectPar: eff };
    case 0x0A: {
      const hi = (eff >> 4) & 0x0F;
      const lo = eff & 0x0F;
      if (hi > 0) return { effectNum: 4, effectPar: hi };
      if (lo > 0) return { effectNum: 5, effectPar: lo };
      return { effectNum: 0, effectPar: 0 };
    }
    case 0x0B: return { effectNum: 6, effectPar: 0 };
    default:   return { effectNum: 0, effectPar: 0 };
  }
}

// ── PART RLE compressor ────────────────────────────────────────────────────

/**
 * Compress a 1536-byte raw PART buffer to MusicLine RLE format.
 * Reverses decompressPart() from MusicLineParser.ts.
 *
 * Algorithm (from SavePart @ Mline116.asm):
 *   Trim trailing empty rows.
 *   For each non-trailing row:
 *     1 ctrl byte: bit N = column N has non-zero data
 *     For each of 6 columns: if bit N set, write 2 bytes
 *   End marker: 0xFF
 */
function compressPart(raw: Uint8Array): Uint8Array {
  // Find last non-empty row
  let lastRow = -1;
  outer:
  for (let row = 127; row >= 0; row--) {
    const base = row * 12;
    for (let b = 0; b < 12; b++) {
      if (raw[base + b] !== 0) { lastRow = row; break outer; }
    }
  }

  const w = new ByteWriter();
  for (let row = 0; row <= lastRow; row++) {
    const base = row * 12;
    let ctrl = 0;
    for (let col = 0; col < 6; col++) {
      const cb = base + col * 2;
      if (raw[cb] !== 0 || raw[cb + 1] !== 0) ctrl |= (1 << col);
    }
    w.writeU8(ctrl);
    for (let col = 0; col < 6; col++) {
      if (ctrl & (1 << col)) {
        w.writeU8(raw[base + col * 2]);
        w.writeU8(raw[base + col * 2 + 1]);
      }
    }
  }
  w.writeU8(0xFF); // end marker (bit7=1)
  return w.build();
}

// ── Channel track table serializer ────────────────────────────────────────

/**
 * Serialize a channel's part-number sequence to chnl_Data bytes.
 *
 * Play-part entry (2 bytes):
 *   byte0 = partNum & 0xFF
 *   byte1 = ((partNum >> 8) & 0x03) << 6 | 0x10   (high bits + no-transpose)
 * End command (2 bytes): [0x00, 0x60]   (CHNL_CMD_FLAG|CHNL_CMD_END = 0x20|0x40)
 */
function buildChnlData(partNums: number[]): Uint8Array {
  const w = new ByteWriter();
  for (const pn of partNums) {
    w.writeU8(pn & 0xFF);
    w.writeU8(((pn >> 8) & 0x03) << 6 | 0x10); // high bits[7:6] + no-transpose[4:0]=0x10
  }
  w.writeU8(0x00); // END: byte0 = 0
  w.writeU8(0x60); // END: byte1 = 0x60 = CHNL_CMD_FLAG(0x20) | CHNL_CMD_END(0x40)
  return w.build();
}

// ── Volume helper ─────────────────────────────────────────────────────────

/** Get ML-compatible volume (0-64) from an InstrumentConfig. */
function getInstVolumeML(inst: InstrumentConfig): number {
  const dv = inst.metadata?.modPlayback?.defaultVolume;
  if (typeof dv === 'number' && dv >= 0) return Math.min(64, Math.round(dv));
  const linear = Math.round(Math.pow(10, inst.volume / 20) * 64);
  return Math.max(0, Math.min(64, linear));
}

// ── INST chunk data builder (206 bytes) ───────────────────────────────────

/**
 * Build the 206-byte INST chunk data for one instrument.
 *
 * Layout (from inst_SIZE=206 struct in Mline116.asm):
 *   title[32] + smplNumber[1] + smplType[1] + smplPointer[4] + smplLength[2] +
 *   smplRepPointer[4] + smplRepLength[2] + fineTune[2] + semiTone[2] +
 *   smplStart[2] + smplEnd[2] + smplRepStart[2] + smplRepLen[2] + volume[2] +
 *   transpose[1] + slideSpeed[1] + effects1[1] + effects2[1]   (= 64 bytes)
 *   + ADSR/Vibrato/Tremolo/Arpeggio/Transform/Phase/Mix/Resonance/Filter/Loop (= 142 bytes)
 *   Total = 206 bytes.
 *
 * All Amiga runtime pointers (smplPointer, smplRepPointer) are written as 0.
 *
 * @param smplIdx  0-based SMPL index this instrument references
 * @param pcmLen   byte length of the PCM data (for smplLength in words)
 */
function buildInstData(inst: InstrumentConfig, smplIdx: number, pcmLen: number): Uint8Array {
  const vol = getInstVolumeML(inst);
  const smplLenWords = Math.floor(pcmLen / 2);
  const loop = inst.sample?.loop ?? false;
  const loopStart = inst.sample?.loopStart ?? 0;
  const loopEnd = inst.sample?.loopEnd ?? 0;
  const loopStartWords = Math.floor(loopStart / 2);
  const loopLenWords = (loop && loopEnd > loopStart) ? Math.floor((loopEnd - loopStart) / 2) : 0;
  const smplType = inst.metadata?.mlSynthConfig?.waveformType ?? 0;

  const w = new ByteWriter();
  w.writeStr(inst.name ?? '', 32);  // title[32]
  w.writeU8(smplIdx);               // smplNumber[1] (0-based SMPL index)
  w.writeU8(smplType);              // smplType[1]   (0=PCM; 1-5=waveform loop size)
  w.writeU32BE(0);                  // smplPointer[4]    (Amiga RAM — write 0)
  w.writeU16BE(smplLenWords);       // smplLength[2]     (total sample length in words)
  w.writeU32BE(0);                  // smplRepPointer[4] (Amiga RAM — write 0)
  w.writeU16BE(loopLenWords);       // smplRepLength[2]  (loop length in words)
  w.writeI16BE(0);                  // fineTune[2]       (signed)
  w.writeI16BE(0);                  // semiTone[2]       (signed)
  w.writeU16BE(0);                  // smplStart[2]      (sample start in words)
  w.writeU16BE(smplLenWords);       // smplEnd[2]        (sample end in words)
  w.writeU16BE(loopStartWords);     // smplRepStart[2]   (loop start in words)
  w.writeU16BE(loopLenWords);       // smplRepLen[2]     (loop length in words)
  w.writeU16BE(vol);                // volume[2]         (0-64)
  w.writeU8(0);                     // transpose[1]
  w.writeU8(0);                     // slideSpeed[1]
  w.writeU8(0);                     // effects1[1]
  w.writeU8(0);                     // effects2[1]
  // +64: ADSR(24)+Vibrato(12)+Tremolo(12)+Arpeggio(4)+Transform(18)+Phase(14)+
  //      Mix(14)+Resonance(14)+Filter(14)+Loop(16) = 142 bytes (all zeros)
  w.writeZeros(142);
  return w.build(); // exactly 206 bytes
}

// ── SMPL extra header + metadata builder (56 bytes) ───────────────────────

/**
 * Build the SMPL chunk's 6-byte extra header + 50-byte metadata block.
 *
 * CRITICAL: The 6 extra bytes are NOT counted in the declared SMPL chunkSize.
 * On disk the layout is:
 *   "SMPL" + u32BE(chunkSize = 50 + pcmLen)        ← standard chunk header
 *   rawDataSize(u32BE) + deltaCmd(u8) + pad(u8)    ← 6 bytes extra (NOT in chunkSize)
 *   title(32)+padByte(1)+type(1)+ptr(4)+len(2)+    ← 50 bytes meta (IN chunkSize)
 *   repPtr(4)+repLen(2)+fineTune(2)+semiTone(2)
 *   PCM data (pcmLen bytes, IN chunkSize)
 *
 * This function returns the 56 combined bytes (6 extra + 50 meta).
 * The caller appends them AFTER writing "SMPL" + u32BE(50+pcmLen).
 */
function buildSmplExtraAndMeta(inst: InstrumentConfig, pcmLen: number): Uint8Array {
  const smplLenWords = Math.floor(pcmLen / 2);
  const loop = inst.sample?.loop ?? false;
  const loopStart = inst.sample?.loopStart ?? 0;
  const loopEnd = inst.sample?.loopEnd ?? 0;
  const loopLenWords = (loop && loopEnd > loopStart) ? Math.floor((loopEnd - loopStart) / 2) : 0;
  const smplType = inst.metadata?.mlSynthConfig?.waveformType ?? 0;

  const w = new ByteWriter();

  // 6-byte extra header (NOT in chunkSize)
  w.writeU32BE(pcmLen); // rawDataSize = pcmLen (writing uncompressed, so raw == stored)
  w.writeU8(0);         // deltaCommand = 0 (unused for raw PCM)
  w.writeU8(0);         // pad

  // 50-byte smpl metadata (IN chunkSize)
  w.writeStr(inst.name ?? '', 32); // title[32]
  w.writeU8(0);                    // padByte[1]
  w.writeU8(smplType);             // type[1] (smplType, matches INST)
  w.writeU32BE(0);                 // smplPointer[4] (Amiga RAM)
  w.writeU16BE(smplLenWords);      // smplLength[2]
  w.writeU32BE(0);                 // repPointer[4]  (Amiga RAM)
  w.writeU16BE(loopLenWords);      // repLength[2]
  w.writeI16BE(0);                 // fineTune[2]
  w.writeI16BE(0);                 // semiTone[2]

  return w.build(); // exactly 56 bytes
}

// ── VERS chunk builder ─────────────────────────────────────────────────────

/** Build a VERS chunk (6 bytes data: version(u16BE) + versionString[4]). */
function buildVersChunk(): Uint8Array {
  const w = new ByteWriter();
  w.writeChunkId('VERS');
  w.writeU32BE(6);       // chunkSize = 6
  w.writeU16BE(1116);    // version number (= MusicLine 1.16)
  w.writeStr('116 ', 4); // version string (4 bytes)
  return w.build();
}

// ── Part number extraction ─────────────────────────────────────────────────

/** Extract original MusicLine part number from pattern ID "part-N" → N. */
function getPartNum(pattern: Pattern): number {
  const m = pattern.id.match(/^part-(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

// ── Public export functions ────────────────────────────────────────────────

/**
 * Export a TrackerSong as a native MusicLine Editor module file (.ml).
 *
 * Best results with songs originally imported from .ml files (patterns have
 * "part-N" IDs, song.channelTrackTables populated).  Non-ML songs are written
 * best-effort: channel 0's songPositions become its track table; other channels
 * get empty track tables.
 *
 * @returns Uint8Array of the complete binary .ml file
 */
export function exportMusicLineFile(song: TrackerSong): Uint8Array {
  const w = new ByteWriter();
  const numChannels = Math.max(1, Math.min(8, song.numChannels));

  // ── File magic: "MLEDMODL" + extraHeaderSize(0) ──
  w.writeChunkId('MLED');
  w.writeChunkId('MODL');
  w.writeU32BE(0); // extra header size = 0 (no extra header bytes follow)

  // ── VERS chunk ──
  w.writeBytes(buildVersChunk());

  // ── Determine per-channel part sequences ──
  // Convert patternIndex → partNumber via "part-N" pattern IDs.
  const patterns = song.patterns;
  const toPartNum = (idx: number): number =>
    (idx >= 0 && idx < patterns.length) ? getPartNum(patterns[idx]) : 0;

  let channelPartSeqs: number[][];
  if (song.channelTrackTables && song.channelTrackTables.length > 0) {
    channelPartSeqs = song.channelTrackTables.map(table => table.map(toPartNum));
    // Pad to numChannels if needed
    while (channelPartSeqs.length < numChannels) channelPartSeqs.push([]);
  } else {
    // Non-ML song: channel 0 uses global songPositions, rest empty
    channelPartSeqs = [
      song.songPositions.map(toPartNum),
      ...Array.from({ length: numChannels - 1 }, () => [] as number[]),
    ];
  }

  // Build chnl_Data bytes for each channel
  const channelData = channelPartSeqs.map(seq => buildChnlData(seq));

  // ── TUNE chunk ──
  // chunkSize = 40 (fixed header only, as per tune_LOADSIZE).
  // Channel size table + chnl_Data are written sequentially AFTER but OUTSIDE chunkSize.
  // The loader reads TUNE sequentially and ignores the declared chunkSize.
  const bpm = Math.max(32, Math.min(255, Math.round(song.initialBPM)));
  const speed = Math.max(1, Math.min(255, song.initialSpeed));
  const groove = song.channelGrooves?.[0] ?? 0;
  const playMode = numChannels > 4 ? 1 : 0; // 0=4ch, 1=8ch

  w.writeChunkId('TUNE');
  w.writeU32BE(40); // chunkSize = tune_LOADSIZE = 40 (fixed header only)
  // Fixed header (40 bytes):
  w.writeStr(song.name ?? '', 32); // title[32]
  w.writeU16BE(bpm);               // tempo[2]
  w.writeU8(speed);                // speed[1]
  w.writeU8(groove);               // groove[1] (0 = no groove)
  w.writeU16BE(64);                // masterVolume[2] (0-64; use max)
  w.writeU8(playMode);             // playMode[1]
  w.writeU8(numChannels);          // numChannels[1]
  // Channel size table (numChannels × u32BE), outside chunkSize:
  for (let ch = 0; ch < numChannels; ch++) {
    w.writeU32BE(channelData[ch].length);
  }
  // Per-channel chnl_Data, outside chunkSize:
  for (let ch = 0; ch < numChannels; ch++) {
    w.writeBytes(channelData[ch]);
  }

  // ── PART chunks ──
  for (const pattern of patterns) {
    const partNum = getPartNum(pattern);
    const raw = buildPartRawData(pattern);
    const compressed = compressPart(raw);
    w.writeChunkId('PART');
    w.writeU32BE(2 + compressed.length); // chunkSize = 2-byte partNum + compressed data
    w.writeU16BE(partNum);
    w.writeBytes(compressed);
  }

  // ── INST + SMPL chunk pairs, one per instrument ──
  for (let i = 0; i < song.instruments.length; i++) {
    const inst = song.instruments[i];
    const pcm = extractPcm(inst);
    // Ensure even byte count (MusicLine addresses samples in words)
    const evenPcm = pcm.length % 2 === 0 ? pcm : pcm.subarray(0, pcm.length - 1);
    const pcmLen = evenPcm.length;

    // INST chunk (206 bytes)
    const instData = buildInstData(inst, i, pcmLen); // smplIdx = i (0-based)
    w.writeChunkId('INST');
    w.writeU32BE(instData.length);
    w.writeBytes(instData);

    // SMPL chunk: chunkSize = 50 (meta) + pcmLen; 6-byte extra header NOT in chunkSize
    const smplExtraMeta = buildSmplExtraAndMeta(inst, pcmLen); // 56 bytes
    w.writeChunkId('SMPL');
    w.writeU32BE(50 + pcmLen); // chunkSize (50 meta + PCM, does NOT include 6-byte extra)
    w.writeBytes(smplExtraMeta); // 6 extra bytes + 50 meta bytes
    w.writeBytes(evenPcm);       // PCM data
  }

  return w.build();
}

/**
 * Export a single InstrumentConfig as a standalone MusicLine instrument file (.mli).
 *
 * Instrument file layout (from SaveExternInst @ Mline116.asm):
 *   "MLED"(4) + "INST"(4) + extraHeaderSize(u32BE=0) + VERS + INST + SMPL
 *
 * @returns Uint8Array of the complete binary .mli file
 */
export function exportMusicLineInstrument(inst: InstrumentConfig): Uint8Array {
  const w = new ByteWriter();
  const pcm = extractPcm(inst);
  const evenPcm = pcm.length % 2 === 0 ? pcm : pcm.subarray(0, pcm.length - 1);
  const pcmLen = evenPcm.length;

  // Magic: "MLED" + "INST" + extraHeaderSize(0)
  w.writeChunkId('MLED');
  w.writeChunkId('INST');
  w.writeU32BE(0); // extra header size = 0

  // VERS chunk
  w.writeBytes(buildVersChunk());

  // INST chunk
  const instData = buildInstData(inst, 0, pcmLen); // smplIdx = 0 (only one SMPL follows)
  w.writeChunkId('INST');
  w.writeU32BE(instData.length);
  w.writeBytes(instData);

  // SMPL chunk
  const smplExtraMeta = buildSmplExtraAndMeta(inst, pcmLen);
  w.writeChunkId('SMPL');
  w.writeU32BE(50 + pcmLen);
  w.writeBytes(smplExtraMeta);
  w.writeBytes(evenPcm);

  return w.build();
}
