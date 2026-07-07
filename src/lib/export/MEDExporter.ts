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

/**
 * Inverse of MEDParser.mapMEDEffect for MMD0 export: (effTyp, eff) → [medCmd, param].
 *
 * MED's forward mapping is lossy/many-to-one (several MED commands collapse to the same
 * XM effTyp), so a perfect inverse is impossible. This inverts the unambiguous cases —
 * which round-trip byte-exactly through MEDParser — and picks the MED command whose
 * decode reproduces the XM effect for the rest. Commands whose forward decode is
 * genuinely ambiguous (0x0C volume BCD/hex, 0x0F tempo conversion) are best-effort.
 */
function mapXMEffectToMED(effTyp: number, eff: number): [number, number] {
  switch (effTyp) {
    case 0x00: return [0x0, eff];          // arpeggio / none
    case 0x01: return [0x1, eff];          // portamento up
    case 0x02: return [0x2, eff];          // portamento down
    case 0x03: return [0x3, eff];          // tone portamento
    case 0x04: {                            // vibrato — MED depth is doubled on decode
      const depth = Math.min(((eff & 0x0F) + 1) >> 1, 0x0F);
      return [0x4, (eff & 0xF0) | depth];
    }
    case 0x05: return [0x5, eff];          // tone porta + vol slide
    case 0x06: return [0x6, eff];          // vibrato + vol slide
    case 0x07: return [0x7, eff];          // tremolo
    case 0x08: return [0x8, eff];          // set panning
    case 0x09: return [0x19, eff];         // sample offset (MED 0x19, not 0x09)
    case 0x0A: return [0xA, eff];          // volume slide
    case 0x0B: return [0xB, eff];          // position jump
    case 0x0C: return [0xC, Math.min(eff, 64)]; // set volume (hex; volHex-dependent on decode)
    case 0x0D: return [0x1D, eff];         // pattern break (MED 0x1D = hex param)
    case 0x0E: return [0xE, eff];          // extended
    case 0x0F: return [0xF, eff];          // speed/tempo (lossy — decode reconverts)
    default:   return [0x0, 0];
  }
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

  // Each MMD0 block: 2-byte header (u8 numtracks, u8 numlines-1) + numlines * nChannels * 3
  const blockSizes = song.patterns.map(p => {
    const lines = p.length;
    return 2 + lines * nChannels * 3;
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
  // MMD0 note transpose: MEDParser reads note = rawNote + 24 (noteBaseTranspose) +
  // playTranspose. We write playTranspose = 0, so the inverse is rawNote = note - 24
  // (a 1-based 6-bit note index; 0 = no note).
  const NOTE_BASE_TRANSPOSE = 24;
  let bpos = blockDataOff;
  for (const pattern of song.patterns) {
    const nLines = pattern.length;
    // MMD0 block header: u8 numtracks, u8 numlines-1; cell data follows at +2.
    view.setUint8(bpos, nChannels);
    view.setUint8(bpos + 1, Math.max(0, nLines - 1) & 0xFF);
    bpos += 2;

    for (let row = 0; row < nLines; row++) {
      for (let ch = 0; ch < nChannels; ch++) {
        const cell = pattern.channels[ch]?.rows[row];
        const noteVal = cell?.note ?? 0;
        const inst    = (cell?.instrument ?? 0) & 0x3F;
        const [cmd, param] = mapXMEffectToMED(cell?.effTyp ?? 0, cell?.eff ?? 0);

        // rawNote: 6-bit 1-based note index (0 = no note). note 97 (cut) has no MMD0
        // encoding — emit no note.
        let rawNote = 0;
        if (noteVal > 0 && noteVal < 97) {
          const r = noteVal - NOTE_BASE_TRANSPOSE;
          rawNote = (r >= 1 && r <= 0x3F) ? r : 0;
        }

        // MMD0 cell (3 bytes), inverse of MEDParser:
        //   byte0[5:0] = rawNote; byte0[7] = inst bit4; byte0[6] = inst bit5
        //   byte1[7:4] = inst[3:0]; byte1[3:0] = command; byte2 = param
        output[bpos]     = (rawNote & 0x3F) | (((inst >> 4) & 1) << 7) | (((inst >> 5) & 1) << 6);
        output[bpos + 1] = ((inst & 0x0F) << 4) | (cmd & 0x0F);
        output[bpos + 2] = param & 0xFF;
        bpos += 3;
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
