/**
 * FCParser.ts — Future Composer 1.3 / 1.4 format parser
 *
 * Future Composer is a 4-channel Amiga tracker using wavetable/macro-based synthesis.
 * Two variants:
 *   FC 1.3: magic "FC13" — preset wavetables only
 *   FC 1.4: magic "FC14" — adds 80 custom wavetable slots
 *
 * File layout:
 *   [4]  magic: "FC13" or "FC14"
 *   [4]  seqLen     — total bytes of sequence block
 *   [4]  patPtr     — file offset to patterns
 *   [4]  patLen     — total bytes of pattern block
 *   [4]  freqMacroPtr
 *   [4]  freqMacroLen
 *   [4]  volMacroPtr
 *   [4]  volMacroLen
 *   [4]  samplePtr  — file offset to sample PCM
 *   [4]  wavePtr (FC14) or sampleLen (FC13)
 *   [60] 10× sample defs: u16 len, u16 loopStart, u16 loopLen (big-endian, in words)
 *   [80] FC14 only: 80 wavetable length bytes
 *   […]  sequences: seqLen/13 × 13 bytes each
 *   [at patPtr]       patterns: patLen/64 × 64 bytes each (32 rows × 2 bytes)
 *   [at freqMacroPtr] freq macros: freqMacroLen/64 × 64 bytes each
 *   [at volMacroPtr]  vol macros:  volMacroLen/64  × 64 bytes each
 *   [at samplePtr]    sample PCM: 8-bit signed, sample[i].len*2 bytes each
 *   [at wavePtr]      FC14 wavetables: 8-bit signed, waveLen[i]*2 bytes each
 *
 * Reference: furnace-master/src/engine/fileOps/fc.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

/**
 * Map an FC note (1-72) to an XM-style note number (13-84).
 * FC note 1 = Amiga C-1 = XM note 13 (C-1).
 * FC note 0 = empty, FC note 0x49 = note off.
 */
function fcNoteToXM(fcNote: number, transpose: number): number {
  if (fcNote === 0) return 0;
  if (fcNote === 0x49) return 97; // note off
  const xm = fcNote + transpose + 12;
  return Math.max(1, Math.min(96, xm));
}

/**
 * Scan a freq macro for the first sample reference (0xe2 or 0xe4 opcode followed
 * by a value < 10 = sample index).  Returns -1 if none found.
 */
function findSampleInFreqMacro(fm: Uint8Array, freqMacros: Uint8Array[]): number {
  for (let j = 0; j < 64; j++) {
    if (fm[j] === 0xe1) break;
    if (fm[j] === 0xe7) {
      // redirect to another freq macro
      if (j + 1 < 64) {
        const redirect = fm[j + 1];
        if (redirect < freqMacros.length) return findSampleInFreqMacro(freqMacros[redirect], freqMacros);
      }
      break;
    }
    if (fm[j] === 0xe2 || fm[j] === 0xe4) {
      if (j + 1 < 64) {
        const waveOrSample = fm[j + 1];
        if (waveOrSample < 10) return waveOrSample;
      }
    }
  }
  return -1;
}

export function parseFCFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== 'FC13' && magic !== 'FC14') {
    throw new Error(`Not a Future Composer file: magic="${magic}"`);
  }
  const isFC14 = magic === 'FC14';

  // ── Header fields ─────────────────────────────────────────────────────────
  let off = 4;
  const seqLen       = u32BE(buf, off);  off += 4;
  const patPtr       = u32BE(buf, off);  off += 4;
  const patLen       = u32BE(buf, off);  off += 4;
  const freqMacroPtr = u32BE(buf, off);  off += 4;
  const freqMacroLen = u32BE(buf, off);  off += 4;
  const volMacroPtr  = u32BE(buf, off);  off += 4;
  const volMacroLen  = u32BE(buf, off);  off += 4;
  const samplePtr    = u32BE(buf, off);  off += 4;
  const wavePtr      = isFC14 ? u32BE(buf, off) : 0;
  off += 4;

  // ── 10 sample definitions (6 bytes each: len, loopStart, loopLen — u16 BE) ──
  const sampleDefs: Array<{ len: number; loopStart: number; loopLen: number }> = [];
  for (let i = 0; i < 10; i++) {
    sampleDefs.push({
      len:       u16BE(buf, off),
      loopStart: u16BE(buf, off + 2),
      loopLen:   u16BE(buf, off + 4),
    });
    off += 6;
  }

  // ── FC14: 80 wavetable lengths (one byte each) ────────────────────────────
  const waveLengths: number[] = [];
  if (isFC14) {
    for (let i = 0; i < 80; i++) waveLengths.push(buf[off++]);
  }

  // ── Sequences (13 bytes each, seqLen/13 entries) ──────────────────────────
  const numSeqs = Math.floor(seqLen / 13);
  const sequences: Array<{
    pat:       [number, number, number, number];
    transpose: [number, number, number, number];
    offsetIns: [number, number, number, number];
    speed:     number;
  }> = [];

  for (let i = 0; i < numSeqs; i++) {
    sequences.push({
      pat:       [buf[off],      buf[off + 3],  buf[off + 6],  buf[off + 9]] as [number, number, number, number],
      transpose: [s8(buf[off + 1]), s8(buf[off + 4]), s8(buf[off + 7]), s8(buf[off + 10])] as [number, number, number, number],
      offsetIns: [s8(buf[off + 2]), s8(buf[off + 5]), s8(buf[off + 8]), s8(buf[off + 11])] as [number, number, number, number],
      speed:     buf[off + 12],
    });
    off += 13;
  }

  // ── Patterns (64 bytes each = 32 rows × 2 bytes: note + val) ─────────────
  const numFCPatterns = Math.floor(patLen / 64);
  const fcPatterns: Array<{ note: Uint8Array; val: Uint8Array }> = [];
  for (let i = 0; i < numFCPatterns; i++) {
    const base = patPtr + i * 64;
    const note = new Uint8Array(32);
    const val  = new Uint8Array(32);
    for (let row = 0; row < 32; row++) {
      note[row] = buf[base + row * 2];
      val[row]  = buf[base + row * 2 + 1];
    }
    fcPatterns.push({ note, val });
  }

  // ── Freq macros (64 bytes each) ───────────────────────────────────────────
  const numFreqMacros = Math.floor(freqMacroLen / 64);
  const freqMacros: Uint8Array[] = [];
  for (let i = 0; i < numFreqMacros; i++) {
    freqMacros.push(buf.slice(freqMacroPtr + i * 64, freqMacroPtr + i * 64 + 64));
  }

  // ── Vol macros (64 bytes each) ────────────────────────────────────────────
  const numVolMacros = Math.floor(volMacroLen / 64);
  const volMacros: Uint8Array[] = [];
  for (let i = 0; i < numVolMacros; i++) {
    volMacros.push(buf.slice(volMacroPtr + i * 64, volMacroPtr + i * 64 + 64));
  }

  // ── Sample PCM data (8-bit signed, len*2 bytes per sample) ───────────────
  const samplePCMs: Uint8Array[] = [];
  let sampleReadOff = samplePtr;
  for (let i = 0; i < 10; i++) {
    const byteLen = sampleDefs[i].len * 2;
    if (byteLen > 0 && sampleReadOff + byteLen <= buf.length) {
      samplePCMs.push(buf.slice(sampleReadOff, sampleReadOff + byteLen));
    } else {
      samplePCMs.push(new Uint8Array(0));
    }
    sampleReadOff += byteLen;
  }

  // ── Build instruments ─────────────────────────────────────────────────────
  // One instrument per vol macro (up to 64), each linked to a PCM sample
  // if its freq macro references one; otherwise a placeholder.
  const instruments: InstrumentConfig[] = [];

  const numInstruments = numVolMacros > 0 ? Math.min(numVolMacros, 64) : 10;

  for (let i = 0; i < numInstruments; i++) {
    const name = `Instrument ${i + 1}`;

    if (numVolMacros > 0 && i < numVolMacros) {
      // Find which sample this vol macro uses via its freq macro
      const vm = volMacros[i];
      const freqMacroIdx = vm[1]; // byte 1 = freq macro index
      let sampleIdx = -1;
      if (freqMacroIdx < freqMacros.length) {
        sampleIdx = findSampleInFreqMacro(freqMacros[freqMacroIdx], freqMacros);
      }

      if (sampleIdx >= 0 && sampleIdx < 10 && sampleDefs[sampleIdx].len > 0) {
        const def = sampleDefs[sampleIdx];
        // loopStart and loopLen are in words; convert to sample frames (1 word = 2 bytes of 8-bit PCM)
        const loopStart = def.loopLen > 1 ? def.loopStart * 2 : 0;
        const loopEnd   = def.loopLen > 1 ? (def.loopStart + def.loopLen) * 2 : 0;
        instruments.push(createSamplerInstrument(i + 1, name, samplePCMs[sampleIdx], 64, 8287, loopStart, loopEnd));
      } else {
        // Wavetable-based or empty — placeholder synth
        instruments.push({
          id: i + 1,
          name,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: -6,
          pan: 0,
        } as InstrumentConfig);
      }
    } else {
      // Fallback: use sample slot directly (when no vol macros)
      const idx = i;
      if (idx < 10 && sampleDefs[idx].len > 0) {
        const def = sampleDefs[idx];
        const loopStart = def.loopLen > 1 ? def.loopStart * 2 : 0;
        const loopEnd   = def.loopLen > 1 ? (def.loopStart + def.loopLen) * 2 : 0;
        instruments.push(createSamplerInstrument(i + 1, `Sample ${i + 1}`, samplePCMs[idx], 64, 8287, loopStart, loopEnd));
      } else {
        instruments.push({
          id: i + 1,
          name: `Sample ${i + 1}`,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: -6,
          pan: 0,
        } as InstrumentConfig);
      }
    }
  }

  // ── Build TrackerSong patterns ────────────────────────────────────────────
  // One TrackerPattern per FC sequence entry (song order entry).
  // Each sequence entry references up to 4 FC patterns (one per channel).
  const trackerPatterns: Pattern[] = sequences.map((seq, seqIdx) => {
    const channels: ChannelData[] = Array.from({ length: 4 }, (_, ch) => {
      const patIdx = seq.pat[ch];
      const fcPat  = patIdx < fcPatterns.length ? fcPatterns[patIdx] : null;
      const rows: TrackerCell[] = [];
      let ignoreNext = false;

      for (let row = 0; row < 32; row++) {
        const fcNote = fcPat ? fcPat.note[row] : 0;
        const fcVal  = fcPat ? fcPat.val[row]  : 0;

        let xmNote    = 0;
        let instrument = 0;
        let effTyp    = 0;
        let eff       = 0;

        if (ignoreNext) {
          ignoreNext = false;
        } else {
          // ── Note ────────────────────────────────────────────────────────
          if (fcNote > 0 && fcNote < 0x49) {
            xmNote = fcNoteToXM(fcNote, seq.transpose[ch]);
          } else if (fcNote === 0x49) {
            xmNote = 97; // note off
          }

          // ── Val ─────────────────────────────────────────────────────────
          if (fcVal === 0xf0) {
            xmNote = 97; // explicit note off
          } else if (fcVal & 0x80) {
            // Pitch slide command
            if (fcVal & 0x40) {
              // Stop slide: emit portamento down to 0
              effTyp = 0x02;
              eff    = 0;
            } else {
              // Start slide: next byte has direction + magnitude
              if (row < 31 && fcPat) {
                const nextVal = fcPat.val[row + 1];
                if (nextVal & 0x20) {
                  effTyp = 0x02; // portamento down
                  eff    = nextVal & 0x1f;
                } else {
                  effTyp = 0x01; // portamento up
                  eff    = nextVal & 0x1f;
                }
                ignoreNext = true;
              }
            }
          } else if (fcVal > 0 && fcVal < 0x80) {
            // Instrument selection (0-based vol-macro index + offsetIns → 1-based)
            instrument = ((fcVal + seq.offsetIns[ch]) & 0x3f) + 1;
          } else if (fcVal === 0 && xmNote > 0 && xmNote < 97) {
            // Note without explicit instrument: use channel's offsetIns
            instrument = (seq.offsetIns[ch] & 0x3f) + 1;
          }
        }

        // Speed effect on first row of channel 3 only (one per sequence)
        if (ch === 3 && row === 0 && seq.speed > 0 && effTyp === 0) {
          effTyp = 0x0f;
          eff    = seq.speed;
        }

        rows.push({ note: xmNote, instrument, volume: 0, effTyp, eff });
      }

      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch % 2 === 0 ? -25 : 25,
        instrumentId: null,
        color: null,
        rows,
      };
    });

    return {
      id: `pattern-${seqIdx}`,
      name: `Pattern ${seqIdx}`,
      length: 32,
      channels,
      importMetadata: {
        sourceFormat: 'FC' as TrackerFormat,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numFCPatterns,
        originalInstrumentCount: numVolMacros || 10,
      },
    };
  });

  // Fallback: at least one empty pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 32,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch % 2 === 0 ? -25 : 25,
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 32 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 })),
      })),
      importMetadata: {
        sourceFormat: 'FC' as TrackerFormat,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  return {
    name: moduleName,
    format: 'FC' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 3,
    initialBPM: 125,
    linearPeriods: false,
  };
}
