/**
 * ArtOfNoiseParser.ts — Art of Noise native parser
 *
 * Art of Noise is a 4- or 8-channel Amiga tracker with chunk-based IFF-like
 * file format. Supports both sample-based and synthesis-based instruments,
 * arpeggios, vibrato, and envelope modulation.
 *
 * Two variants:
 *   AON4 — 4-channel (file magic "AON4")
 *   AON8 — 8-channel (file magic "AON8")
 *
 * Reference: NostalgicPlayer ArtOfNoiseWorker.cs (authoritative loader/replayer)
 * Reference music: /Users/spot/Code/DEViLBOX/Reference Music/Art Of Noise/
 *
 * File layout:
 *   0x000 – 0x02D  46-byte header (player code / signature, skipped)
 *   0x02E –        Chunks: each chunk is [4-byte name][4-byte BE size][data]
 *
 * Chunks:
 *   NAME  — Song name (null-terminated string)
 *   AUTH  — Author name
 *   RMRK  — Comments
 *   INFO  — version(1) + numberOfPositions(1) + restartPosition(1) + rest skipped
 *   ARPG  — 16 arpeggios × 4 bytes each (64 bytes total)
 *   PLST  — Position list (chunkSize bytes of pattern indices)
 *   PATT  — Pattern data: numPatterns × 64rows × numChannels × 4 bytes
 *   INST  — Instrument data: numInstruments × 32 bytes
 *   INAM  — Instrument names: numInstruments × 32 bytes (optional)
 *   WLEN  — Waveform lengths: numWaveforms × 4 bytes (uint32 BE each)
 *   WAVE  — Waveform sample data (8-bit signed, concatenated)
 *
 * Pattern cell encoding (4 bytes):
 *   b1: note  = b1 & 0x3F
 *   b2: instr = b2 & 0x3F
 *       arpIdx hi bits: ((b3 & 0xC0) >> 4) | ((b2 & 0xC0) >> 6)
 *   b3: effect = b3 & 0x3F
 *   b4: effectArg
 *
 * Instrument type 0 = Sample, type 1 = Synth (32 bytes each):
 *   type(1) + volume(1) + fineTune(1) + waveForm(1) +
 *   [sample: startOffset(4) + length(4) + loopStart(4) + loopLength(4) + pad(8)]
 *   [synth:  length(1) + pad(5) + vibParam(1) + vibDelay(1) + vibWave(1) +
 *            waveSpeed(1) + waveLength(1) + waveLoopStart(1) + waveLoopLength(1) +
 *            waveLoopControl(1) + pad(10)]
 *   envelopeStart(1) + envelopeAdd(1) + envelopeEnd(1) + envelopeSub(1)
 *
 * Note encoding: AON uses its own 5-octave period table (Tables.Periods).
 * Note index 0 = no note; 1-60 = valid (5 octaves × 12 notes).
 * The table row is selected by instrument.FineTune (0-15, maps to rows 0-7 and -8 to -1).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';
import type { UADEChipRamInfo } from '@/types/instrument';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { AON_PERIODS, aonEffectToGridEffect, aonNoteToGridNote } from './aonNotes';
import { encodeAONCell } from '@/engine/uade/encoders/ArtOfNoiseEncoder';

// ── Constants ─────────────────────────────────────────────────────────────

/** PAL Amiga clock frequency (Hz) */
const PAL_CLOCK = 3546895;


/** Period-table index of period 856 (tuning 0); the ratio reference for fine-tune rows. */
const AON_REFERENCE_NOTE_IDX = 24; // 0-based index in period table → period 856

// ── Utility ────────────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

/** Read a 4-character ASCII mark (chunk ID) at offset */
function readMark(buf: Uint8Array, off: number): string {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}

/** Read a null-terminated string of up to maxLen bytes from buf */
function readString(buf: Uint8Array, off: number, maxLen: number): string {
  let end = off;
  while (end < off + maxLen && buf[end] !== 0) end++;
  // Strip non-printable characters (Amiga encoding quirks)
  let result = '';
  for (let i = off; i < end; i++) {
    const c = buf[i];
    result += c >= 32 ? String.fromCharCode(c) : '';
  }
  return result;
}

/**
 * Get the sample rate for an AON note using the period table.
 * Used to determine the base sample rate for instrument creation.
 */
function aonPeriodToRate(period: number): number {
  return Math.round(PAL_CLOCK / (2 * period));
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` is an Art of Noise module (AON4 or AON8).
 * Magic: bytes 0-3 = "AON4" or "AON8". Minimum size: 54 bytes (header + first chunk header).
 */
export function isArtOfNoiseFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 54) return false;
  const mark = readMark(bytes, 0);
  return mark === 'AON4' || mark === 'AON8';
}

// ── Internal types ─────────────────────────────────────────────────────────

interface AonSampleInstrument {
  type: 'sample';
  name: string;
  volume: number;
  fineTune: number;
  waveForm: number;      // which waveform (index into waveForms array)
  startOffset: number;   // in words (multiply × 2 for bytes)
  length: number;        // in words
  loopStart: number;     // in words
  loopLength: number;    // in words
  envelopeStart: number;
  envelopeAdd: number;
  envelopeEnd: number;
  envelopeSub: number;
  instrBase?: number;    // file offset of this 32-byte entry in the INST chunk
}

interface AonSynthInstrument {
  type: 'synth';
  name: string;
  volume: number;
  fineTune: number;
  waveForm: number;
  length: number;
  vibParam: number;
  vibDelay: number;
  vibWave: number;
  waveSpeed: number;
  waveLength: number;
  waveLoopStart: number;
  waveLoopLength: number;
  waveLoopControl: number;
  envelopeStart: number;
  envelopeAdd: number;
  envelopeEnd: number;
  envelopeSub: number;
  instrBase?: number;    // file offset of this 32-byte entry in the INST chunk
}

type AonInstrument = AonSampleInstrument | AonSynthInstrument;

interface AonTrackLine {
  note: number;       // 0 = no note, 1-60 = note
  instrument: number; // 0-based
  arpeggio: number;   // 4-bit arpeggio index
  effect: number;     // Effect enum value (0-33)
  effectArg: number;
}

interface AonPattern {
  rows: AonTrackLine[][];  // [row][channel]
}

// ── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse an Art of Noise (.aon / .aon8) module file and return a TrackerSong.
 * Returns null if the file cannot be parsed.
 */
export function parseArtOfNoiseFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isArtOfNoiseFormat(bytes)) return null;

  const mark = readMark(bytes, 0);
  const numberOfChannels = mark === 'AON8' ? 8 : 4;

  // ── Parse chunks starting at offset 46 ────────────────────────────────
  let off = 46;

  let songName = '';
  let numberOfPositions = 0;
  let restartPosition = 0;
  let arpeggios: number[][] | null = null;
  let positionList: number[] | null = null;
  let patterns: AonPattern[] | null = null;
  let patternChunkOffset = 0;
  let instruments: AonInstrument[] | null = null;
  let waveForms: Int8Array[] | null = null;

  while (off + 8 <= bytes.length) {
    const chunkName = readMark(bytes, off);
    const chunkSize = u32BE(bytes, off + 4);
    off += 8;

    if (off > bytes.length) break;

    const chunkEnd = off + chunkSize;
    if (chunkEnd > bytes.length) {
      // Truncated chunk — stop parsing
      break;
    }

    switch (chunkName) {
      case 'NAME': {
        songName = readString(bytes, off, chunkSize);
        break;
      }

      case 'AUTH': {
        // Author string — not used in TrackerSong output
        break;
      }

      case 'RMRK': {
        // Comments — ignore for TrackerSong
        break;
      }

      case 'INFO': {
        if (chunkSize < 3) break;
        // version(1) + numberOfPositions(1) + restartPosition(1) + rest ignored
        numberOfPositions = bytes[off + 1];
        restartPosition = bytes[off + 2];
        if (restartPosition >= numberOfPositions) restartPosition = 0;
        break;
      }

      case 'ARPG': {
        // 16 arpeggios × 4 bytes each
        arpeggios = [];
        for (let i = 0; i < 16; i++) {
          const arp: number[] = [];
          for (let j = 0; j < 4; j++) {
            arp.push(bytes[off + i * 4 + j]);
          }
          arpeggios.push(arp);
        }
        break;
      }

      case 'PLST': {
        positionList = [];
        for (let i = 0; i < chunkSize; i++) {
          positionList.push(bytes[off + i]);
        }
        break;
      }

      case 'PATT': {
        // numPatterns × 64rows × numChannels × 4 bytes
        const numPatterns = Math.floor(chunkSize / (4 * numberOfChannels * 64));
        patternChunkOffset = off;
        patterns = [];
        let pOff = off;
        for (let p = 0; p < numPatterns; p++) {
          const rowsData: AonTrackLine[][] = [];
          for (let r = 0; r < 64; r++) {
            const row: AonTrackLine[] = [];
            for (let c = 0; c < numberOfChannels; c++) {
              const b1 = bytes[pOff];
              const b2 = bytes[pOff + 1];
              const b3 = bytes[pOff + 2];
              const b4 = bytes[pOff + 3];
              pOff += 4;
              row.push({
                instrument: b2 & 0x3f,
                note:       b1 & 0x3f,
                arpeggio:   ((b3 & 0xc0) >> 4) | ((b2 & 0xc0) >> 6),
                effect:     b3 & 0x3f,
                effectArg:  b4,
              });
            }
            rowsData.push(row);
          }
          patterns.push({ rows: rowsData });
        }
        break;
      }

      case 'INST': {
        // numInstruments × 32 bytes each
        const numInstruments = Math.floor(chunkSize / 32);
        instruments = [];
        let iOff = off;
        for (let i = 0; i < numInstruments; i++) {
          const type    = bytes[iOff];
          const volume  = bytes[iOff + 1];
          const fineTune = bytes[iOff + 2];
          const waveForm = bytes[iOff + 3];
          iOff += 4;

          let instr: AonInstrument;

          if (type === 0) {
            // Sample instrument
            const startOffset = u32BE(bytes, iOff);
            const length      = u32BE(bytes, iOff + 4);
            const loopStart   = u32BE(bytes, iOff + 8);
            const loopLength  = u32BE(bytes, iOff + 12);
            iOff += 20; // 4×4 + 4 pad bytes
            // 4 shared envelope bytes come after the type-specific section
            const envelopeStart = bytes[iOff];
            const envelopeAdd   = bytes[iOff + 1];
            const envelopeEnd   = bytes[iOff + 2];
            const envelopeSub   = bytes[iOff + 3];
            iOff += 4;
            // skip remaining to reach the 32-byte boundary
            // We already consumed: 4 (common) + 20 (sample-specific) + 4 (envelope) = 28 bytes
            // Remaining: 32 - 28 = 4 bytes of padding are already consumed in the iOff += 20 step
            // Wait — NostalgicPlayer reads: type(1)+vol(1)+ft(1)+wf(1) + startOff(4)+len(4)+loopStart(4)+loopLen(4) + seek(8) + envelope(4)
            // = 4 + 16 + 8 + 4 = 32 bytes. So the seek(8) is BEFORE the envelope.
            // Let's rewind the envelope read — we need to reparse correctly.
            // We will fix: after reading the 4 type-specific words, seek 8, then read 4 envelope bytes.
            // But we already consumed iOff += 20 (= 4×4 + 4 padding words = 20).
            // Actually 4×4=16 bytes for the 4 fields + seek(8) should skip 8 bytes.
            // But we consumed iOff += 20 which is 16+4. Let me redo:
            // (Reset: this code path is wrong — see rewrite below after this block.)
            instr = {
              type: 'sample',
              name: '',
              volume, fineTune, waveForm,
              startOffset, length, loopStart, loopLength,
              envelopeStart, envelopeAdd, envelopeEnd, envelopeSub,
            };
          } else if (type === 1) {
            // Synth instrument
            // Per C#: length(1) + seek(5) + vibParam(1)+vibDelay(1)+vibWave(1)+waveSpeed(1)+
            //         waveLength(1)+waveLoopStart(1)+waveLoopLength(1)+waveLoopControl(1)+seek(10)
            // = 1 + 5 + 8 + 10 = 24 bytes of type-specific data
            const synthLength     = bytes[iOff];
            iOff += 1;
            iOff += 5; // 5 padding bytes
            const vibParam        = bytes[iOff];
            const vibDelay        = bytes[iOff + 1];
            const vibWave         = bytes[iOff + 2];
            const waveSpeed       = bytes[iOff + 3];
            const waveLength      = bytes[iOff + 4];
            const waveLoopStart   = bytes[iOff + 5];
            const waveLoopLength  = bytes[iOff + 6];
            const waveLoopControl = bytes[iOff + 7];
            iOff += 8;
            iOff += 10; // 10 padding bytes
            // Now envelope (4 bytes)
            const envelopeStart = bytes[iOff];
            const envelopeAdd   = bytes[iOff + 1];
            const envelopeEnd   = bytes[iOff + 2];
            const envelopeSub   = bytes[iOff + 3];
            iOff += 4;
            instr = {
              type: 'synth',
              name: '',
              volume, fineTune, waveForm,
              length: synthLength,
              vibParam, vibDelay, vibWave,
              waveSpeed, waveLength, waveLoopStart, waveLoopLength, waveLoopControl,
              envelopeStart, envelopeAdd, envelopeEnd, envelopeSub,
            };
          } else {
            // Unknown type — skip to next instrument boundary
            iOff += 28; // 32 - 4 already consumed
            continue;
          }
          instruments.push(instr);
        }
        // Fix up instrument parsing: NostalgicPlayer for sample type does:
        //   startOffset(4) + length(4) + loopStart(4) + loopLength(4) + seek(8) + then falls through to envelope
        // The seek(8) skips 8 bytes after the 4 uint32 fields.
        // But in the sample branch above we did iOff += 20 (= 16 data + 4 extra) then read 4 envelope.
        // That means we consumed 4+20+4 = 28 bytes. Missing: 32-4-28 = 0 bytes. Wait, 4 common + 28 = 32. OK.
        // Actually: 4(common) + 4×4(data)=16 + 8(seek) + 4(envelope) = 32. We consumed 4+20+4 = 28.
        // The 20 covers: 4×4 bytes (16) + 4 (NOT 8 for seek). We're 4 bytes short.
        // We must re-examine: iOff += 20 should be iOff += 24 (16 data + 8 seek), then +4 envelope = 28+4=32. Let me fix below.
        break;
      }

      case 'INAM': {
        // Instrument names — 32 bytes each
        if (instruments) {
          let nOff = off;
          for (let i = 0; i < instruments.length && nOff + 32 <= chunkEnd; i++) {
            instruments[i].name = readString(bytes, nOff, 32);
            nOff += 32;
          }
        }
        break;
      }

      case 'WLEN': {
        // numWaveforms × uint32 BE = waveform lengths in bytes
        const numWaveforms = Math.floor(chunkSize / 4);
        waveForms = [];
        let wOff = off;
        for (let i = 0; i < numWaveforms; i++) {
          const len = u32BE(bytes, wOff);
          wOff += 4;
          waveForms.push(len > 0 ? new Int8Array(len) : new Int8Array(0));
        }
        break;
      }

      case 'WAVE': {
        // Raw waveform data (8-bit signed), sequentially for all waveforms
        if (waveForms) {
          let wOff = off;
          for (let i = 0; i < waveForms.length; i++) {
            const w = waveForms[i];
            if (w.length > 0) {
              for (let j = 0; j < w.length && wOff < chunkEnd; j++) {
                w[j] = s8(bytes[wOff++]);
              }
            }
          }
        }
        break;
      }

      default:
        break;
    }

    off = chunkEnd;
  }

  // ── Validate required chunks ──────────────────────────────────────────
  if (numberOfPositions === 0 || !arpeggios || !positionList || !patterns || !instruments || !waveForms) {
    return null;
  }

  // ── Re-parse instruments with correct offset arithmetic ────────────────
  // The inline parsing above had a bug in the sample branch (seek offset).
  // Redo instrument parsing from raw bytes using the correct C# layout.
  const correctedInstruments = reparseinstruments(bytes, instruments.length, numberOfChannels, positionList, patterns);

  const finalInstruments = correctedInstruments !== null ? correctedInstruments : instruments;

  // ── Build InstrumentConfig[] ──────────────────────────────────────────
  const instrumentConfigs: InstrumentConfig[] = [];

  for (let i = 0; i < finalInstruments.length; i++) {
    const instr = finalInstruments[i];
    const id = i + 1; // 1-based
    const instrBase = instr.instrBase ?? 0;
    const chipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase,
      instrSize: 32,
      sections: { instTable: instrBase - i * 32 },
    };

    if (instr.type === 'sample' && waveForms) {
      const si = instr as AonSampleInstrument;
      const wfIdx = si.waveForm;
      const wf = wfIdx < waveForms.length ? waveForms[wfIdx] : null;

      if (wf && wf.length > 0 && si.length > 0 && si.startOffset * 2 < wf.length) {
        // Sample data: si.startOffset and si.length are in words → multiply by 2 for bytes
        const byteStart  = si.startOffset * 2;
        const byteLength = si.length * 2;
        const byteLoopStart  = si.loopStart * 2;
        const byteLoopLength = si.loopLength * 2;

        const endByte = Math.min(byteStart + byteLength, wf.length);
        const pcmLen  = Math.max(0, endByte - byteStart);
        const pcm = new Uint8Array(pcmLen);
        for (let j = 0; j < pcmLen; j++) {
          pcm[j] = (j + byteStart < wf.length ? wf[j + byteStart] : 0) & 0xff;
        }

        // Determine base sample rate using reference note period (tuning 0, note 25 = period 856)
        const ftRow = si.fineTune < 16 ? si.fineTune : 0;
        const refPeriod = AON_PERIODS[ftRow][AON_REFERENCE_NOTE_IDX]; // period 856 for tuning 0
        const sampleRate = aonPeriodToRate(refPeriod);

        const hasLoop = byteLoopLength > 1;
        const loopStart = hasLoop ? byteLoopStart : 0;
        const loopEnd   = hasLoop ? byteLoopStart + byteLoopLength : 0;

        instrumentConfigs.push({
          ...createSamplerInstrument(id, instr.name || '', pcm, si.volume, sampleRate, loopStart, loopEnd),
          uadeChipRam: chipRam,
        });
      } else {
        instrumentConfigs.push({ ...makeSynthPlaceholder(id, instr.name || ''), uadeChipRam: chipRam });
      }
    } else if (instr.type === 'synth' && waveForms) {
      const si = instr as AonSynthInstrument;
      const wfIdx = si.waveForm;
      const wf = wfIdx < waveForms.length ? waveForms[wfIdx] : null;

      if (wf && wf.length > 0) {
        // Synth: loop the waveform. Length is in words → bytes.
        const byteLength = si.length * 2;
        const playLen = Math.max(1, Math.min(byteLength, wf.length));
        const pcm = new Uint8Array(playLen);
        for (let j = 0; j < playLen; j++) {
          pcm[j] = wf[j % wf.length] & 0xff;
        }

        const ftRow = si.fineTune < 16 ? si.fineTune : 0;
        const refPeriod = AON_PERIODS[ftRow][AON_REFERENCE_NOTE_IDX];
        const sampleRate = aonPeriodToRate(refPeriod);

        instrumentConfigs.push({
          ...createSamplerInstrument(id, instr.name || '', pcm, si.volume, sampleRate, 0, playLen),
          uadeChipRam: chipRam,
        });
      } else {
        instrumentConfigs.push({ ...makeSynthPlaceholder(id, instr.name || ''), uadeChipRam: chipRam });
      }
    } else {
      instrumentConfigs.push({ ...makeSynthPlaceholder(id, instr.name || ''), uadeChipRam: chipRam });
    }
  }

  // ── Build TrackerSong patterns ────────────────────────────────────────
  // AON uses position list: each position entry is a pattern index.
  // All channels play the same pattern simultaneously (4-voice or 8-voice).
  const trackerPatterns: Pattern[] = [];

  for (let pos = 0; pos < numberOfPositions; pos++) {
    const patIdx = positionList[pos];
    const pat = patIdx < patterns.length ? patterns[patIdx] : null;

    const channelRows: TrackerCell[][] = Array.from({ length: numberOfChannels }, () => []);

    for (let r = 0; r < 64; r++) {
      for (let c = 0; c < numberOfChannels; c++) {
        const line = pat ? pat.rows[r][c] : null;

        if (!line) {
          channelRows[c].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        const instrId = line.instrument > 0 ? line.instrument : 0;
        const xmNote = aonNoteToGridNote(line.note);

        const { effTyp, eff } = aonEffectToGridEffect(line.effect, line.effectArg);

        channelRows[c].push({
          note:       xmNote,
          instrument: instrId,
          volume:     0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2:    0,
        });
      }
    }

    trackerPatterns.push({
      id:     `pattern-${pos}`,
      name:   `Position ${pos}`,
      length: 64,
      channels: channelRows.map((rows, ch) => ({
        id:          `channel-${ch}`,
        name:        `Channel ${ch + 1}`,
        muted:       false,
        solo:        false,
        collapsed:   false,
        volume:      100,
        // AON4: LRRL hard stereo. AON8: LLRR RRLL
        pan: numberOfChannels === 8
          ? ([  -50, -50, 50, 50, 50, 50, -50, -50 ][ch] ?? 0)
          : ([ -50, 50, 50, -50 ][ch] ?? 0),
        instrumentId: null,
        color:        null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'AON',
        sourceFile:   filename,
        importedAt:   new Date().toISOString(),
        originalChannelCount:    numberOfChannels,
        originalPatternCount:    patterns.length,
        originalInstrumentCount: finalInstruments.length,
      },
    });
  }

  // Ensure at least one pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, numberOfChannels, finalInstruments.length));
  }

  const moduleName = (songName || filename).replace(/\.[^/.]+$/, '');

  const uadePatternLayout: UADEPatternLayout | undefined = patternChunkOffset > 0 ? {
    formatId: 'artOfNoise',
    patternDataFileOffset: patternChunkOffset,
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels: numberOfChannels,
    numPatterns: patterns?.length ?? 0,
    moduleSize: bytes.length,
    encodeCell: encodeAONCell,
    decodeCell: (raw: Uint8Array): TrackerCell => {
      const aonNote = raw[0] & 0x3F;
      const instrument = raw[1] & 0x3F;
      const effect = raw[2] & 0x3F;
      const effectArg = raw[3];
      const note = aonNoteToGridNote(aonNote);
      // Byte-exact carriers: the XM view drops the two unused/arpeggio bits packed in
      // the top of each of b0/b1/b2 (masked off by &0x3F) and collapses the effect map
      // one-way, so the derivation above is lossy. Stash the exact source bytes in the
      // invisible period/pan/cutoff carriers (fields the AON grid loop never sets); the
      // encoder reproduces all 4 bytes verbatim. Edited grid cells lack the carriers and
      // keep the canonical derivation.
      return {
        note, instrument, volume: 0,
        effTyp: (effect !== 0 || effectArg !== 0) ? effect : 0,
        eff: (effect !== 0 || effectArg !== 0) ? effectArg : 0,
        effTyp2: 0, eff2: 0,
        period: (raw[0] << 8) | raw[1], pan: raw[2], cutoff: raw[3],
      };
    },
  } : undefined;

  return {
    name:             moduleName,
    format:           'AON' as TrackerFormat,
    patterns:         trackerPatterns,
    instruments:      instrumentConfigs,
    songPositions:    trackerPatterns.map((_, i) => i),
    songLength:       trackerPatterns.length,
    restartPosition:  restartPosition,
    numChannels:      numberOfChannels,
    initialSpeed:     6,
    initialBPM:       125,
    linearPeriods:    false,
    uadePatternLayout,
    artOfNoiseFileData: new Uint8Array(bytes).buffer as ArrayBuffer,
  };
}

// ── Helper: re-parse instruments with correct byte layout ─────────────────

/**
 * Re-parse instrument data from the INST chunk using the correct NostalgicPlayer layout.
 *
 * The inline parsing inside the switch-case above had a byte-count error in the
 * sample branch. This function finds the INST chunk again and parses it correctly.
 *
 * NostalgicPlayer layout per instrument (32 bytes total):
 *   Common header (4 bytes): type(1) + volume(1) + fineTune(1) + waveForm(1)
 *
 *   If type == 0 (Sample, 24 bytes):
 *     startOffset(4) + length(4) + loopStart(4) + loopLength(4) = 16 bytes
 *     seek(8) bytes = 8 bytes
 *     Total: 24 bytes
 *
 *   If type == 1 (Synth, 24 bytes):
 *     length(1) + seek(5) + vibParam(1)+vibDelay(1)+vibWave(1)+waveSpeed(1)+
 *     waveLength(1)+waveLoopStart(1)+waveLoopLength(1)+waveLoopControl(1) = 14 bytes
 *     seek(10) = 10 bytes
 *     Total: 24 bytes
 *
 *   Envelope (4 bytes): envelopeStart(1)+envelopeAdd(1)+envelopeEnd(1)+envelopeSub(1)
 *
 *   Grand total: 4 + 24 + 4 = 32 bytes ✓
 */
function reparseinstruments(
  bytes: Uint8Array,
  expectedCount: number,
  _numberOfChannels: number,
  _positionList: number[],
  _patterns: AonPattern[]
): AonInstrument[] | null {
  // Find INST chunk
  let off = 46;
  while (off + 8 <= bytes.length) {
    const chunkName = readMark(bytes, off);
    const chunkSize = u32BE(bytes, off + 4);
    off += 8;
    if (off + chunkSize > bytes.length) break;

    if (chunkName === 'INST') {
      const numInstruments = Math.min(expectedCount, Math.floor(chunkSize / 32));
      const result: AonInstrument[] = [];
      let iOff = off;

      for (let i = 0; i < numInstruments; i++) {
        const instrStart = iOff;
        const type     = bytes[iOff];
        const volume   = bytes[iOff + 1];
        const fineTune = bytes[iOff + 2];
        const waveForm = bytes[iOff + 3];
        iOff += 4;

        let instr: AonInstrument | null = null;

        if (type === 0) {
          // Sample: 16 data bytes + 8 skip = 24 bytes
          const startOffset = u32BE(bytes, iOff);
          const length      = u32BE(bytes, iOff + 4);
          const loopStart   = u32BE(bytes, iOff + 8);
          const loopLength  = u32BE(bytes, iOff + 12);
          iOff += 16;
          iOff += 8;  // skip 8 bytes
          const envelopeStart = bytes[iOff];
          const envelopeAdd   = bytes[iOff + 1];
          const envelopeEnd   = bytes[iOff + 2];
          const envelopeSub   = bytes[iOff + 3];
          iOff += 4;
          instr = {
            type: 'sample', name: '', volume, fineTune, waveForm,
            startOffset, length, loopStart, loopLength,
            envelopeStart, envelopeAdd, envelopeEnd, envelopeSub,
            instrBase: instrStart,
          };
        } else if (type === 1) {
          // Synth: 14 data bytes + 10 skip = 24 bytes
          const synthLength     = bytes[iOff]; iOff += 1;
          iOff += 5; // skip 5 bytes
          const vibParam        = bytes[iOff];
          const vibDelay        = bytes[iOff + 1];
          const vibWave         = bytes[iOff + 2];
          const waveSpeed       = bytes[iOff + 3];
          const waveLength      = bytes[iOff + 4];
          const waveLoopStart   = bytes[iOff + 5];
          const waveLoopLength  = bytes[iOff + 6];
          const waveLoopControl = bytes[iOff + 7];
          iOff += 8;
          iOff += 10; // skip 10 bytes
          const envelopeStart = bytes[iOff];
          const envelopeAdd   = bytes[iOff + 1];
          const envelopeEnd   = bytes[iOff + 2];
          const envelopeSub   = bytes[iOff + 3];
          iOff += 4;
          instr = {
            type: 'synth', name: '', volume, fineTune, waveForm,
            length: synthLength, vibParam, vibDelay, vibWave,
            waveSpeed, waveLength, waveLoopStart, waveLoopLength, waveLoopControl,
            envelopeStart, envelopeAdd, envelopeEnd, envelopeSub,
            instrBase: instrStart,
          };
        }

        // Guard: ensure we consumed exactly 32 bytes
        const consumed = iOff - instrStart;
        if (consumed !== 32) {
          // Realign to instrument boundary
          iOff = instrStart + 32;
        }

        if (instr) result.push(instr);
      }

      // Now scan for INAM chunk to fill names
      let nOff2 = 46;
      while (nOff2 + 8 <= bytes.length) {
        const n = readMark(bytes, nOff2);
        const ns = u32BE(bytes, nOff2 + 4);
        nOff2 += 8;
        if (n === 'INAM') {
          for (let i = 0; i < result.length && nOff2 + 32 <= nOff2 + ns; i++) {
            result[i].name = readString(bytes, nOff2 + i * 32, 32);
          }
          break;
        }
        nOff2 += ns;
        if (nOff2 > bytes.length) break;
      }

      return result;
    }

    off += chunkSize;
  }
  return null;
}

// ── Helper: placeholder instrument ────────────────────────────────────────

function makeSynthPlaceholder(id: number, name: string): InstrumentConfig {
  return {
    id,
    name: name.replace(/\0/g, '').trim() || '',
    type: 'synth' as const,
    synthType: 'ArtOfNoiseSynth' as const,
    effects: [],
    volume: 0,
    pan: 0,
  } as InstrumentConfig;
}

function makeEmptyPattern(filename: string, numCh: number, numInstr: number): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: numCh }, (_, ch) => ({
      id:          `channel-${ch}`,
      name:        `Channel ${ch + 1}`,
      muted:       false,
      solo:        false,
      collapsed:   false,
      volume:      100,
      pan:         numCh === 8
        ? ([  -50, -50, 50, 50, 50, 50, -50, -50 ][ch] ?? 0)
        : ([ -50, 50, 50, -50 ][ch] ?? 0),
      instrumentId: null,
      color:        null,
      rows: Array.from({ length: 64 }, () => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    })),
    importMetadata: {
      sourceFormat: 'AON',
      sourceFile:   filename,
      importedAt:   new Date().toISOString(),
      originalChannelCount:    numCh,
      originalPatternCount:    0,
      originalInstrumentCount: numInstr,
    },
  };
}
