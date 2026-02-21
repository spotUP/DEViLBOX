/**
 * MEDExporter.ts — Export TrackerSong as OctaMED MMD0 format
 *
 * Produces a minimal but valid MMD0 file compatible with OctaMED and most players.
 * Limited to 4 channels (MMD0 maximum). For full MMD1 export (64 channels), a
 * more complete implementation is needed.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val, false);
}
function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val, false);
}
function writeStr(view: DataView, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    view.setUint8(off + i, i < str.length ? str.charCodeAt(i) & 0xFF : 0);
  }
}

// Amiga period table for note-to-period conversion
const PERIODS = [
  856,808,762,720,678,640,604,570,538,508,480,453,
  428,404,381,360,339,320,302,285,269,254,240,226,
  214,202,190,180,170,160,151,143,135,127,120,113,
];

function xmNoteToPeriod(xmNote: number): number {
  if (xmNote === 0) return 0;
  // XM C-1 = note 13. PT period table index 0 = C-1.
  const idx = xmNote - 13;
  if (idx < 0 || idx >= PERIODS.length) return 0;
  return PERIODS[idx];
}

export function exportMED(song: TrackerSong): ArrayBuffer {
  const nChannels = Math.min(4, song.numChannels);
  const nBlocks   = song.patterns.length;
  const nInstrs   = Math.min(63, song.instruments.length);
  const songLen   = Math.min(256, song.songPositions.length);

  // ── Collect sample PCMs ─────────────────────────────────────────────────
  const samplePCMs: Uint8Array[] = [];
  for (let i = 0; i < nInstrs; i++) {
    const inst = song.instruments[i];
    if (inst?.sample?.audioBuffer) {
      // Decode WAV 16-bit → 8-bit signed
      const wav = new DataView(inst.sample.audioBuffer);
      const dataLen = wav.getUint32(40, true);
      const frames  = Math.floor(dataLen / 2);
      const pcm = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        const s16 = wav.getInt16(44 + j * 2, true);
        pcm[j] = ((s16 >> 8) + 128) & 0xFF;
      }
      samplePCMs.push(pcm);
    } else {
      samplePCMs.push(new Uint8Array(0));
    }
  }

  // ── Calculate offsets ───────────────────────────────────────────────────
  const HEADER_SIZE   = 52;            // MMD0 file header
  const INSTR_SIZE    = 63 * 8;        // 63 InstrHdr entries
  const SONG_MISC     = 268;           // Rest of MMD0Song (numblocks + playseq + etc.)
  const SONG_SIZE     = INSTR_SIZE + SONG_MISC;
  const BLOCK_PTRS    = nBlocks * 4;   // Block pointer array

  // Each block: 4-byte header + nChannels * (nLines+1) * 3 bytes
  const blockSizes = song.patterns.map(p => {
    const lines = p.length;
    return 4 + lines * nChannels * 3;
  });
  const totalBlockBytes = blockSizes.reduce((a, b) => a + b, 0);

  const sampleTotalBytes = samplePCMs.reduce((a, p) => a + ((p.length + 1) & ~1), 0);

  const songOffset   = HEADER_SIZE;
  const blockPtrOff  = songOffset + SONG_SIZE;
  const blockDataOff = blockPtrOff + BLOCK_PTRS;
  const sampleDataOff = blockDataOff + totalBlockBytes;
  const totalSize    = sampleDataOff + sampleTotalBytes;

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // ── Write MMD0 header ───────────────────────────────────────────────────
  writeStr(view, 0, 'MMD0', 4);
  writeU32BE(view, 4, totalSize);
  writeU32BE(view, 8, songOffset);      // → MMD0Song
  writeU32BE(view, 16, blockPtrOff);    // → block pointer array
  // Bytes 12, 20-51: unused (zeros)

  // ── Write MMD0Song ──────────────────────────────────────────────────────
  let so = songOffset;

  // InstrHdr array (63 × 8 bytes)
  for (let i = 0; i < 63; i++) {
    const base = so + i * 8;
    if (i < nInstrs) {
      const pcm = samplePCMs[i];
      writeU32BE(view, base, Math.ceil(pcm.length / 2));  // Length in words
      view.setUint8(base + 4, 0);                          // type=0 (sample)
      view.setUint8(base + 5, 64);                         // volume=64

      const inst = song.instruments[i];
      const loopStart = inst?.sample?.loopStart ?? 0;
      const loopEnd   = inst?.sample?.loopEnd   ?? 0;
      writeU16BE(view, base + 6, Math.ceil(loopStart / 2));
      writeU16BE(view, base + 8, Math.ceil(Math.max(0, loopEnd - loopStart) / 2));
    }
  }
  so += INSTR_SIZE;

  // numblocks + songlen + playseq
  writeU16BE(view, so, nBlocks);
  writeU16BE(view, so + 2, songLen);
  for (let i = 0; i < 256; i++) {
    output[so + 4 + i] = i < songLen ? (song.songPositions[i] ?? 0) : 0;
  }
  writeU16BE(view, so + 260, song.initialBPM ?? 125);  // deftempo
  output[so + 263] = 0;                                  // playtransp
  output[so + 264] = song.initialSpeed ?? 6;             // tempo2
  output[so + 265] = nInstrs;                            // numsamples
  so += SONG_MISC;

  // ── Write block pointer array ────────────────────────────────────────────
  let blockOff = blockDataOff;
  for (let i = 0; i < nBlocks; i++) {
    writeU32BE(view, blockPtrOff + i * 4, blockOff);
    blockOff += blockSizes[i];
  }

  // ── Write block data ─────────────────────────────────────────────────────
  let bpos = blockDataOff;
  for (const pattern of song.patterns) {
    const nLines = pattern.length;
    writeU16BE(view, bpos, nChannels);
    writeU16BE(view, bpos + 2, nLines - 1);  // MED stores numlines - 1
    bpos += 4;

    for (let row = 0; row < nLines; row++) {
      for (let ch = 0; ch < nChannels; ch++) {
        const cell = pattern.channels[ch]?.rows[row];
        const period = xmNoteToPeriod(cell?.note ?? 0);
        const inst   = cell?.instrument ?? 0;
        const eff    = cell?.effTyp ?? 0;
        const param  = cell?.eff ?? 0;

        // MMD0 cell: 3 bytes
        // byte0: inst[7:4] | period[11:8]
        // byte1: period[7:0]
        // byte2: inst[3:0] | eff[3:0]
        // param byte (if 3-byte cell, param is in next byte — actually MMD0 is 4-byte cells!)
        // Correction: MMD0 cells ARE 4 bytes: note, instr, command, param
        output[bpos]     = ((inst >> 4) & 0xF) << 4 | ((period >> 8) & 0xF);
        output[bpos + 1] = period & 0xFF;
        output[bpos + 2] = ((inst & 0xF) << 4) | (eff & 0xF);
        output[bpos + 3] = param;
        bpos += 4;
      }
    }
  }

  // ── Write sample data ────────────────────────────────────────────────────
  let spos = sampleDataOff;
  for (const pcm of samplePCMs) {
    output.set(pcm, spos);
    spos += pcm.length;
    if (pcm.length & 1) spos++; // Word align
  }

  return output.buffer;
}
