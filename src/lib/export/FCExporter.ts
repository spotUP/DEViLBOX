/**
 * FCExporter.ts — Export TrackerSong as Future Composer 1.4 (FC14) format
 *
 * Produces a minimal valid FC14 file. Only sample-based instruments are exported;
 * synth instruments are silenced.  The output is a 4-channel module.
 *
 * FC14 layout:
 *   "FC14" magic (4 bytes)
 *   seqLen     u32 BE  (total bytes of sequence block)
 *   patPtr     u32 BE  (file offset to patterns)
 *   patLen     u32 BE  (total bytes of pattern block)
 *   freqMacroPtr u32 BE
 *   freqMacroLen u32 BE
 *   volMacroPtr  u32 BE
 *   volMacroLen  u32 BE
 *   samplePtr  u32 BE  (file offset to sample PCM)
 *   wavePtr    u32 BE  (file offset to wavetable data, unused here)
 *   10× sample defs (u16 BE len, loopStart, loopLen — in words)
 *   80× wavetable lengths (u8, all 0 = use preset waveforms)
 *   Sequence block (sequences × 13 bytes each)
 *   Pattern block  (patterns × 64 bytes each)
 *   Freq macro block (instruments × 64 bytes each)
 *   Vol macro block  (instruments × 64 bytes each)
 *   Sample PCM (raw 8-bit signed, 2× len bytes each)
 *   Wavetable data (empty — wavePtr points to start of this zero-length region)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val, false);
}

/** XM note (1-96) → FC note (1-72).  XM C-1=13, FC C-1=1. */
function xmNoteToFC(xmNote: number): number {
  if (xmNote === 0) return 0;
  if (xmNote === 97) return 0x49; // note off
  const fc = xmNote - 12;
  return (fc < 1 || fc > 72) ? 0 : fc;
}

export function exportFC(song: TrackerSong): ArrayBuffer {
  const nChannels = 4; // FC is always 4-channel
  const nInstrs   = Math.min(10, song.instruments.length); // FC has 10 sample slots

  // ── Collect sample PCMs ─────────────────────────────────────────────────
  // Decode WAV audioBuffer back to 8-bit signed PCM for up to 10 sample slots.
  const samplePCMs: Uint8Array[] = [];
  const sampleDefs: Array<{ len: number; loopStart: number; loopLen: number }> = [];

  for (let i = 0; i < 10; i++) {
    if (i < nInstrs) {
      const inst = song.instruments[i];
      if (inst?.sample?.audioBuffer) {
        const wav = new DataView(inst.sample.audioBuffer);
        const dataLen = wav.getUint32(40, true);
        const frames  = Math.floor(dataLen / 2);
        const pcm = new Uint8Array(frames);
        for (let j = 0; j < frames; j++) {
          const s16 = wav.getInt16(44 + j * 2, true);
          // Convert 16-bit signed → 8-bit signed (via shift)
          pcm[j] = ((s16 >> 8) + 128) & 0xFF; // unsigned representation of signed
          // Actually FC stores raw signed bytes; convert to signed byte:
          // value = s16 >> 8 (range -128..127)
          // stored as 8-bit two's complement = same bit pattern as (s16>>8) & 0xFF
          pcm[j] = (s16 >> 8) & 0xFF;
        }
        samplePCMs.push(pcm);

        // loopStart and loopLen in words (2 bytes each)
        const loopStart = inst.sample?.loopStart ?? 0;
        const loopEnd   = inst.sample?.loopEnd   ?? 0;
        const loopLen   = loopEnd > loopStart ? Math.ceil((loopEnd - loopStart) / 2) : 0;
        sampleDefs.push({
          len:       Math.ceil(frames / 2), // len in words
          loopStart: Math.ceil(loopStart / 2),
          loopLen:   loopLen,
        });
      } else {
        samplePCMs.push(new Uint8Array(0));
        sampleDefs.push({ len: 0, loopStart: 0, loopLen: 0 });
      }
    } else {
      samplePCMs.push(new Uint8Array(0));
      sampleDefs.push({ len: 0, loopStart: 0, loopLen: 0 });
    }
  }

  // ── Build unique FC patterns ─────────────────────────────────────────────
  // We produce one FC pattern per TrackerSong pattern channel combo.
  // Since we output 4 channels and each FC sequence references 4 patterns,
  // we create one unique FC pattern per (song_pattern × channel) pair.
  // This gives up to nPatterns × 4 FC patterns.

  const nSongPatterns = song.patterns.length;
  const songLen = Math.min(128, song.songPositions.length);

  // FC patterns: 32 rows × 2 bytes (note, val)
  interface FCPattern { note: Uint8Array; val: Uint8Array }
  const fcPatterns: FCPattern[] = [];

  // Map (songPatternIdx, ch) → fcPatternIdx
  const patMap = new Map<string, number>();

  for (let p = 0; p < nSongPatterns; p++) {
    const pat = song.patterns[p];
    for (let ch = 0; ch < nChannels; ch++) {
      const key = `${p}:${ch}`;
      const fcIdx = fcPatterns.length;
      patMap.set(key, fcIdx);

      const note = new Uint8Array(32);
      const val  = new Uint8Array(32);

      for (let row = 0; row < 32; row++) {
        const cell = pat.channels[ch]?.rows[row];
        const xmNote = cell?.note ?? 0;
        const inst   = cell?.instrument ?? 0;

        if (xmNote === 97) {
          note[row] = 0xf0; // note off goes in val field actually — but convention varies
          val[row]  = 0xf0;
        } else {
          note[row] = xmNoteToFC(xmNote);
          // Instrument: 1-based → 0-based FC, capped at 9 (sample index)
          val[row] = inst > 0 ? Math.min(9, inst - 1) : 0;
        }
      }

      fcPatterns.push({ note, val });
    }
  }

  // ── Build sequences ───────────────────────────────────────────────────────
  // One FC sequence per song position entry.
  const sequences: Array<{
    pat: [number, number, number, number];
    transpose: [number, number, number, number];
    offsetIns: [number, number, number, number];
    speed: number;
  }> = [];

  for (let i = 0; i < songLen; i++) {
    const songPatIdx = song.songPositions[i] ?? 0;
    sequences.push({
      pat: [
        patMap.get(`${songPatIdx}:0`) ?? 0,
        patMap.get(`${songPatIdx}:1`) ?? 0,
        patMap.get(`${songPatIdx}:2`) ?? 0,
        patMap.get(`${songPatIdx}:3`) ?? 0,
      ] as [number, number, number, number],
      transpose: [0, 0, 0, 0] as [number, number, number, number],
      offsetIns: [0, 0, 0, 0] as [number, number, number, number],
      speed: i === 0 ? (song.initialSpeed ?? 3) : 0,
    });
  }

  // ── Build vol macros (one per sample slot, simple sustain) ───────────────
  // Vol macro byte layout: [speed, freqMacro, vibSpeed, vibDepth, vibDelay, vol…, 0xe0, loopPos]
  const volMacros: Uint8Array[] = [];
  const freqMacros: Uint8Array[] = [];

  for (let i = 0; i < nInstrs; i++) {
    // Freq macro: just select sample i directly via 0xe2 command
    const fm = new Uint8Array(64).fill(0);
    fm[0] = 0xe2;        // "set waveform/sample" opcode
    fm[1] = i;           // sample index (0-9)
    fm[2] = 0xe0;        // loop
    fm[3] = 0;           // loop back to position 0
    freqMacros.push(fm);

    // Vol macro: constant volume 64, no envelope
    const vm = new Uint8Array(64).fill(0);
    vm[0] = 1;           // seqSpeed = 1
    vm[1] = i;           // freqMacro = same index
    vm[2] = 0;           // vibSpeed
    vm[3] = 0;           // vibDepth
    vm[4] = 0;           // vibDelay
    vm[5] = 64;          // initial volume value
    vm[6] = 0xe8;        // sustain command
    vm[7] = 0;           // sustain for 0 ticks (hold)
    vm[8] = 0xe1;        // end
    volMacros.push(vm);
  }

  // ── Calculate block sizes & offsets ──────────────────────────────────────
  const MAGIC_SIZE   = 4;
  const HEADER_SIZE  = 9 * 4;           // 9 u32 fields
  const SAMPLE_DEFS  = 10 * 6;          // 10 × (len u16 + loopStart u16 + loopLen u16)
  const WAVE_LENS    = 80;              // 80 wavetable length bytes (all 0)
  const FIXED_HEADER = MAGIC_SIZE + HEADER_SIZE + SAMPLE_DEFS + WAVE_LENS;

  const seqBlockLen      = sequences.length * 13;
  const patBlockLen      = fcPatterns.length * 64;
  const freqMacroBlock   = freqMacros.length * 64;
  const volMacroBlock    = volMacros.length * 64;
  const totalSampleBytes = samplePCMs.reduce((s, p) => s + p.length, 0);

  const seqOffset        = FIXED_HEADER;
  const patPtrValue      = seqOffset + seqBlockLen;
  const freqMacroPtrVal  = patPtrValue + patBlockLen;
  const volMacroPtrVal   = freqMacroPtrVal + freqMacroBlock;
  const samplePtrValue   = volMacroPtrVal + volMacroBlock;
  const wavePtrValue     = samplePtrValue + totalSampleBytes;

  const totalSize = wavePtrValue; // no wavetable data

  const output = new Uint8Array(totalSize);
  const view   = new DataView(output.buffer);

  // ── Magic ─────────────────────────────────────────────────────────────────
  output[0] = 0x46; output[1] = 0x43; output[2] = 0x31; output[3] = 0x34; // "FC14"

  // ── Header fields ─────────────────────────────────────────────────────────
  let h = 4;
  writeU32BE(view, h, seqBlockLen);      h += 4; // seqLen
  writeU32BE(view, h, patPtrValue);      h += 4; // patPtr
  writeU32BE(view, h, patBlockLen);      h += 4; // patLen
  writeU32BE(view, h, freqMacroPtrVal); h += 4; // freqMacroPtr
  writeU32BE(view, h, freqMacroBlock);  h += 4; // freqMacroLen
  writeU32BE(view, h, volMacroPtrVal);  h += 4; // volMacroPtr
  writeU32BE(view, h, volMacroBlock);   h += 4; // volMacroLen
  writeU32BE(view, h, samplePtrValue);  h += 4; // samplePtr
  writeU32BE(view, h, wavePtrValue);    h += 4; // wavePtr

  // ── Sample definitions ────────────────────────────────────────────────────
  for (let i = 0; i < 10; i++) {
    writeU16BE(view, h, sampleDefs[i].len);       h += 2;
    writeU16BE(view, h, sampleDefs[i].loopStart); h += 2;
    writeU16BE(view, h, sampleDefs[i].loopLen);   h += 2;
  }

  // ── Wavetable lengths (all 0 = use preset waveforms) ─────────────────────
  h += 80; // already zero-filled

  // ── Sequence block ────────────────────────────────────────────────────────
  for (const seq of sequences) {
    for (let ch = 0; ch < 4; ch++) {
      output[h++] = seq.pat[ch] & 0xFF;
      output[h++] = seq.transpose[ch] & 0xFF;
      output[h++] = seq.offsetIns[ch] & 0xFF;
    }
    output[h++] = seq.speed;
  }

  // ── Pattern block ─────────────────────────────────────────────────────────
  for (const fp of fcPatterns) {
    for (let row = 0; row < 32; row++) {
      output[h++] = fp.note[row];
      output[h++] = fp.val[row];
    }
  }

  // ── Freq macro block ──────────────────────────────────────────────────────
  for (const fm of freqMacros) {
    output.set(fm, h);
    h += 64;
  }

  // ── Vol macro block ───────────────────────────────────────────────────────
  for (const vm of volMacros) {
    output.set(vm, h);
    h += 64;
  }

  // ── Sample PCM ────────────────────────────────────────────────────────────
  for (const pcm of samplePCMs) {
    output.set(pcm, h);
    h += pcm.length;
  }

  return output.buffer;
}
