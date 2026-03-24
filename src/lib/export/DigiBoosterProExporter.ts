/**
 * DigiBoosterProExporter.ts — Export TrackerSong as DigiBooster Pro (.dbm) format
 *
 * Produces a valid DBM0 file with IFF-style chunks:
 *   Header (8 bytes): "DBM0" + version(2) + reserved(2)
 *   NAME — song name
 *   INFO — numInstruments, numSamples, numSongs, numPatterns, numChannels
 *   SONG — order list (song name[44] + numOrders + order entries)
 *   INST — instrument headers (50 bytes each)
 *   PATT — packed pattern data (mask-based compression)
 *   SMPL — sample PCM data (big-endian signed)
 *
 * Pattern packing matches the DBM format exactly:
 *   0x00 = end of row
 *   ch (1-based), mask byte, then fields per mask bits
 *
 * Note encoding: key-off → 0x1F; else ((semi/12) << 4) | (semi % 12)
 *   where semi = xmNote - 13
 *
 * Reference: DigiBoosterProParser.ts (import) and DigiBoosterProEncoder.ts (chip RAM encoder)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeStr(buf: Uint8Array, offset: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[offset + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

function iffChunk(id: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(8 + data.length);
  for (let i = 0; i < 4; i++) result[i] = id.charCodeAt(i) & 0xFF;
  const view = new DataView(result.buffer);
  view.setUint32(4, data.length, false);
  result.set(data, 8);
  return result;
}

// ── XM effect → DBM effect reverse mapping ──────────────────────────────────

const XM_TO_DBM: Map<number, number> = new Map([
  [0x00, 0],   // Arpeggio
  [0x01, 1],   // Portamento Up
  [0x02, 2],   // Portamento Down
  [0x03, 3],   // Tone Portamento
  [0x04, 4],   // Vibrato
  [0x05, 5],   // Tone Porta + Vol Slide
  [0x06, 6],   // Vibrato + Vol Slide
  [0x07, 7],   // Tremolo
  [0x08, 8],   // Set Panning
  [0x09, 9],   // Sample Offset
  [0x0A, 10],  // Volume Slide
  [0x0B, 11],  // Position Jump
  [0x0C, 12],  // Set Volume
  [0x0D, 13],  // Pattern Break
  [0x0E, 14],  // Extended (Exx)
  [0x0F, 15],  // Set Tempo/Speed
  [0x10, 16],  // Global Volume
  [0x11, 17],  // Global Vol Slide
  [0x14, 20],  // Key Off
  [0x15, 21],  // Set Envelope Position
  [0x19, 25],  // Panning Slide
]);

function reverseDBMEffect(effTyp: number, eff: number): { cmd: number; param: number } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };

  const dbmCmd = XM_TO_DBM.get(effTyp);
  if (dbmCmd === undefined) return { cmd: 0, param: 0 };

  let param = eff;

  switch (dbmCmd) {
    case 13: // Pattern break: decimal → packed BCD
      param = ((Math.floor(eff / 10) & 0x0F) << 4) | (eff % 10);
      break;
    case 16: // Global volume: XM 0-128 → DBM 0-64
      param = Math.min(64, Math.floor(eff / 2));
      break;
    default:
      break;
  }

  return { cmd: dbmCmd, param };
}

// ── Note encoding ────────────────────────────────────────────────────────────

/**
 * Convert XM note to DBM raw note byte.
 * Parser: ((rawNote >> 4) * 12) + (rawNote & 0x0F) + 13
 * Reverse: semi = xmNote - 13; rawNote = (floor(semi/12) << 4) | (semi % 12)
 */
function xmNoteToDBM(xmNote: number): number {
  if (xmNote === 97) return 0x1F; // key-off
  if (xmNote <= 0) return 0;
  const semi = xmNote - 13;
  if (semi < 0 || semi >= 120) return 0;
  const octave = Math.floor(semi / 12);
  const noteInOctave = semi % 12;
  return (octave << 4) | noteInOctave;
}

// ── Pattern packer ───────────────────────────────────────────────────────────

/**
 * Pack all channels of one pattern into the DBM packed format.
 * Row-interleaved: for each row, emit all non-empty channel events, then 0x00 (end of row).
 */
function packPattern(
  channels: Array<{ rows: Array<{ note: number; instrument: number; effTyp: number; eff: number; effTyp2?: number; eff2?: number }> }>,
  numRows: number,
  numChannels: number,
): Uint8Array {
  const buf: number[] = [];

  for (let row = 0; row < numRows; row++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const cell = channels[ch]?.rows[row];
      if (!cell) continue;

      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      const effTyp2 = cell.effTyp2 ?? 0;
      const eff2 = cell.eff2 ?? 0;

      const hasNote = note !== 0;
      const hasInstr = instr !== 0;
      const fx1 = reverseDBMEffect(effTyp, eff);
      const fx2 = reverseDBMEffect(effTyp2, eff2);
      const hasFx1 = fx1.cmd !== 0 || fx1.param !== 0;
      const hasFx2 = fx2.cmd !== 0 || fx2.param !== 0;

      // Skip completely empty cells
      if (!hasNote && !hasInstr && !hasFx1 && !hasFx2) continue;

      // Channel number (1-based)
      buf.push(ch + 1);

      // Build mask
      let mask = 0;
      if (hasNote) mask |= 0x01;
      if (hasInstr) mask |= 0x02;
      if (hasFx2) {
        mask |= 0x04; // c2
        mask |= 0x08; // p2
      }
      if (hasFx1) {
        mask |= 0x10; // c1
        mask |= 0x20; // p1
      }
      buf.push(mask);

      // Emit fields in the read order: note, instr, c2, p2, c1, p1
      if (mask & 0x01) buf.push(xmNoteToDBM(note));
      if (mask & 0x02) buf.push(instr & 0xFF);
      if (mask & 0x04) buf.push(fx2.cmd & 0xFF);
      if (mask & 0x08) buf.push(fx2.param & 0xFF);
      if (mask & 0x10) buf.push(fx1.cmd & 0xFF);
      if (mask & 0x20) buf.push(fx1.param & 0xFF);
    }

    // End of row
    buf.push(0x00);
  }

  return new Uint8Array(buf);
}

// ── Sample extraction ────────────────────────────────────────────────────────

interface SampleData {
  frames: number;
  bits: number;       // 8 or 16
  pcmBE: Uint8Array;  // big-endian signed PCM
  sampleRate: number;
  loopStart: number;
  loopLength: number;
  flags: number;      // 0x01=loop, 0x02=pingpong
}

/**
 * Extract PCM sample data from an instrument's audioBuffer (WAV format).
 * Converts little-endian WAV PCM to big-endian signed for DBM.
 */
function extractSampleData(
  inst: { name?: string; sample?: { audioBuffer?: ArrayBuffer; sampleRate?: number; loop?: boolean; loopType?: string; loopStart?: number; loopEnd?: number } },
): SampleData | null {
  if (!inst.sample?.audioBuffer) return null;

  const wav = new DataView(inst.sample.audioBuffer);
  // Minimal WAV parsing: data chunk at offset 40-43 (size), 44+ (PCM)
  if (inst.sample.audioBuffer.byteLength < 46) return null;

  const bitsPerSample = wav.getUint16(34, true);
  const dataLen = wav.getUint32(40, true);
  const sampleRate = inst.sample.sampleRate ?? wav.getUint32(24, true);

  if (bitsPerSample === 16) {
    const frames = Math.floor(dataLen / 2);
    // Convert LE 16-bit signed → BE 16-bit signed
    const pcmBE = new Uint8Array(frames * 2);
    const beView = new DataView(pcmBE.buffer);
    for (let i = 0; i < frames; i++) {
      const s16 = wav.getInt16(44 + i * 2, true);
      beView.setInt16(i * 2, s16, false); // big-endian
    }

    const hasLoop = inst.sample.loop === true;
    const loopStart = inst.sample.loopStart ?? 0;
    const loopEnd = inst.sample.loopEnd ?? frames;
    const loopLength = hasLoop ? Math.max(0, loopEnd - loopStart) : 0;
    let flags = 0;
    if (hasLoop) {
      flags |= 0x01;
      if (inst.sample.loopType === 'pingpong') flags |= 0x02;
    }

    return { frames, bits: 16, pcmBE, sampleRate, loopStart, loopLength, flags };
  } else {
    // 8-bit: dataLen = number of frames
    const frames = dataLen;
    // Convert unsigned 8-bit WAV → signed 8-bit for DBM
    const pcmBE = new Uint8Array(frames);
    for (let i = 0; i < frames; i++) {
      const u8 = wav.getUint8(44 + i);
      pcmBE[i] = (u8 - 128) & 0xFF; // unsigned → signed
    }

    const hasLoop = inst.sample.loop === true;
    const loopStart = inst.sample.loopStart ?? 0;
    const loopEnd = inst.sample.loopEnd ?? frames;
    const loopLength = hasLoop ? Math.max(0, loopEnd - loopStart) : 0;
    let flags = 0;
    if (hasLoop) {
      flags |= 0x01;
      if (inst.sample.loopType === 'pingpong') flags |= 0x02;
    }

    return { frames, bits: 8, pcmBE, sampleRate, loopStart, loopLength, flags };
  }
}

// ── Main exporter ────────────────────────────────────────────────────────────

export async function exportDigiBoosterPro(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const numChannels = song.numChannels;
  const numPatterns = song.patterns.length;
  const numInstruments = Math.min(255, song.instruments.length);
  const songLen = Math.min(256, song.songPositions.length);
  const chunks: Uint8Array[] = [];

  // ── DBM0 file header (8 bytes) ────────────────────────────────────────────
  const header = new Uint8Array(8);
  header[0] = 0x44; // D
  header[1] = 0x42; // B
  header[2] = 0x4D; // M
  header[3] = 0x30; // 0
  header[4] = 2;    // tracker version major
  header[5] = 0;    // tracker version minor
  header[6] = 0;    // reserved
  header[7] = 0;    // reserved
  chunks.push(header);

  // ── NAME chunk ─────────────────────────────────────────────────────────────
  const songName = song.name ?? 'Untitled';
  const nameBytes = new Uint8Array(songName.length);
  writeStr(nameBytes, 0, songName, songName.length);
  chunks.push(iffChunk('NAME', nameBytes));

  // ── Extract sample data for all instruments ────────────────────────────────
  const sampleDatas: (SampleData | null)[] = [];
  let _numSamplesWithData = 0;
  for (let i = 0; i < numInstruments; i++) {
    const sd = extractSampleData(song.instruments[i]);
    sampleDatas.push(sd);
    if (sd) _numSamplesWithData++;
  }
  // numSamples = numInstruments (1:1 mapping, matching parser convention)
  const numSamples = numInstruments;

  // ── INFO chunk (10 bytes) ──────────────────────────────────────────────────
  const info = new Uint8Array(10);
  const infoView = new DataView(info.buffer);
  infoView.setUint16(0, numInstruments, false);
  infoView.setUint16(2, numSamples, false);
  infoView.setUint16(4, 1, false); // numSongs = 1
  infoView.setUint16(6, numPatterns, false);
  infoView.setUint16(8, numChannels, false);
  chunks.push(iffChunk('INFO', info));

  // ── SONG chunk ─────────────────────────────────────────────────────────────
  // name[44] + uint16BE numOrders + numOrders * uint16BE
  const songChunkSize = 44 + 2 + songLen * 2;
  const songData = new Uint8Array(songChunkSize);
  const songView = new DataView(songData.buffer);
  writeStr(songData, 0, songName, 44);
  songView.setUint16(44, songLen, false);
  for (let i = 0; i < songLen; i++) {
    const pos = song.songPositions[i] ?? 0;
    songView.setUint16(46 + i * 2, pos, false);
  }
  chunks.push(iffChunk('SONG', songData));

  // ── INST chunk (50 bytes per instrument) ───────────────────────────────────
  const instData = new Uint8Array(numInstruments * 50);
  const instView = new DataView(instData.buffer);
  for (let i = 0; i < numInstruments; i++) {
    const inst = song.instruments[i];
    const base = i * 50;
    const instName = inst?.name ?? '';
    writeStr(instData, base, instName, 30);

    // sample index (1-based, 0 = no sample)
    const sd = sampleDatas[i];
    instView.setUint16(base + 30, sd ? i + 1 : 0, false);

    // volume: recover from modPlayback defaultVolume, or 64
    const vol = inst?.metadata?.modPlayback?.defaultVolume ?? 64;
    instView.setUint16(base + 32, Math.min(64, vol), false);

    // sampleRate (C5 base rate): reverse the parser's adjustment
    // Parser: sampleRate = round((raw * 8303) / 8363)
    // Reverse: raw = round((sampleRate * 8363) / 8303)
    const sampleRate = sd?.sampleRate ?? inst?.sample?.sampleRate ?? 8287;
    const rawRate = Math.round((sampleRate * 8363) / 8303);
    instView.setUint32(base + 34, rawRate, false);

    // Loop params
    const loopStart = sd?.loopStart ?? 0;
    const loopLength = sd?.loopLength ?? 0;
    instView.setUint32(base + 38, loopStart, false);
    instView.setUint32(base + 42, loopLength, false);

    // Panning: default to Amiga LRRL based on instrument index
    const panPos = i % 4;
    const pan = (panPos === 0 || panPos === 3) ? -50 : 50;
    instView.setInt16(base + 46, pan, false);

    // Flags
    const flags = sd?.flags ?? 0;
    instView.setUint16(base + 48, flags, false);
  }
  chunks.push(iffChunk('INST', instData));

  // ── PATT chunk ─────────────────────────────────────────────────────────────
  // Each pattern: uint16BE numRows + uint32BE packedSize + packed data
  const patternParts: Uint8Array[] = [];
  let unmappedEffects = 0;

  for (let p = 0; p < numPatterns; p++) {
    const pattern = song.patterns[p];
    const numRows = pattern.length;

    // Check for unmappable effects
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = pattern.channels[ch]?.rows;
      if (!rows) continue;
      for (let r = 0; r < numRows; r++) {
        const cell = rows[r];
        if (cell.effTyp && !XM_TO_DBM.has(cell.effTyp)) unmappedEffects++;
        if (cell.effTyp2 && !XM_TO_DBM.has(cell.effTyp2)) unmappedEffects++;
      }
    }

    const packed = packPattern(pattern.channels, numRows, numChannels);

    // Header: 2 bytes numRows + 4 bytes packedSize + packed data
    const patPart = new Uint8Array(6 + packed.length);
    const patPartView = new DataView(patPart.buffer);
    patPartView.setUint16(0, numRows, false);
    patPartView.setUint32(2, packed.length, false);
    patPart.set(packed, 6);
    patternParts.push(patPart);
  }

  if (unmappedEffects > 0) {
    warnings.push(`${unmappedEffects} effect(s) could not be mapped to DBM format and were dropped.`);
  }

  // Combine all pattern parts into one PATT chunk
  const pattTotalSize = patternParts.reduce((s, p) => s + p.length, 0);
  const pattData = new Uint8Array(pattTotalSize);
  let pattPos = 0;
  for (const pp of patternParts) {
    pattData.set(pp, pattPos);
    pattPos += pp.length;
  }
  chunks.push(iffChunk('PATT', pattData));

  // ── SMPL chunk ─────────────────────────────────────────────────────────────
  // Per sample: uint32BE flags + uint32BE length (frames) + PCM data
  const smplParts: Uint8Array[] = [];
  for (let i = 0; i < numSamples; i++) {
    const sd = sampleDatas[i];
    if (!sd || sd.frames === 0) {
      // Empty sample: 8 bytes (flags=0, length=0)
      const empty = new Uint8Array(8);
      smplParts.push(empty);
      continue;
    }

    const entrySize = 8 + sd.pcmBE.length;
    const entry = new Uint8Array(entrySize);
    const entryView = new DataView(entry.buffer);

    // flags: bit 0 = 8-bit, bit 1 = 16-bit
    const flagBits = sd.bits === 16 ? 2 : 1;
    entryView.setUint32(0, flagBits, false);
    entryView.setUint32(4, sd.frames, false);
    entry.set(sd.pcmBE, 8);
    smplParts.push(entry);
  }

  const smplTotalSize = smplParts.reduce((s, p) => s + p.length, 0);
  const smplData = new Uint8Array(smplTotalSize);
  let smplPos = 0;
  for (const sp of smplParts) {
    smplData.set(sp, smplPos);
    smplPos += sp.length;
  }
  chunks.push(iffChunk('SMPL', smplData));

  // ── Assemble final file ────────────────────────────────────────────────────
  const totalSize = chunks.reduce((s, c) => s + c.length, 0);
  const output = new Uint8Array(totalSize);
  let pos = 0;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.length;
  }

  // Derive filename
  const baseName = (song.name ?? 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled';
  const filename = `${baseName}.dbm`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
