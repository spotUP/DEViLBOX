/**
 * SynthesisParser.ts — Synthesis native parser
 *
 * Synthesis is a 4-channel Amiga wavetable/sample tracker. Two variants:
 *   Synth4.0 — standard format (magic "Synth4.0" at offset 0)
 *   Synth4.2 — extended format with prefixed player (magic "Synth4.2" at offset 0x1f0e)
 *
 * Reference: NostalgicPlayer SynthesisWorker.cs (authoritative loader/replayer)
 *
 * File layout (all offsets relative to startOffset):
 *   +0x00  "Synth4.0" or "Synth4.2" (8 bytes)
 *   +0x08  NOP u16BE, NOR u16BE, skip 4, NOS u8, NOW u8, NOI u8, NSS u8, EG u8, ADSR u8, noise u8
 *   +0x13  skip 13 bytes
 *   +0x20  module name (28 bytes)
 *   +0x3C  text / comment (140 bytes)
 *   +0xC8  sample info: NOS × 28 bytes [1 unknown + 27 name]
 *   +0xC8 + NOS*28  sample lengths: NOS × uint32 BE
 *   +    EG tables: EG × 128 bytes
 *   +    ADSR tables: ADSR × 256 bytes
 *   +    instruments: NOI × 28 bytes
 *   +    arpeggio tables: 16 × 16 bytes
 *   +    sub-songs: NSS × 14 bytes [skip4, speed1, rowsPerTrack1, firstPos2, lastPos2, restart2, skip2]
 *   +    extra 14-byte sub-song entry (skipped)
 *   +    waveforms: NOW × 256 bytes (8-bit signed)
 *   +    positions: NOP × 16 bytes [4 voices × (startTrackRow u16BE + soundTranspose s8 + noteTranspose s8)]
 *   +    track rows: (NOR + 64) × 4 bytes [note u8, instrument u8, (arpHi|effect) u8, effectArg u8]
 *   +    sample PCM data: NOS × sampleLength bytes (8-bit signed)
 *
 * Note mapping:
 *   Period table: 109 entries (index 0 = no note; indices 1–108 valid).
 *   Index 49 = 856 (Amiga C-3 / XM C-3 = note 37).
 *   xmNote = 37 + (synthNoteIdx - 49)
 *
 * Loop logic (from NostalgicPlayer Samples property):
 *   repeatLength == 0  → full loop (loop from 0 for waveformLength bytes)
 *   repeatLength == 2  → no loop
 *   else               → loop from waveformLength for repeatLength bytes
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ─────────────────────────────────────────────────────────────

/** PAL Amiga clock frequency (Hz) */
const PAL_CLOCK = 3546895;

/**
 * Synthesis period table — 109 entries.
 * Index 0 = no note (0). Indices 1–108 are valid periods.
 * Index 49 = 856 = XM C-3 reference period.
 * Copied verbatim from NostalgicPlayer Synthesis/Tables.cs.
 */
const _SYN_PERIODS: number[] = [
      0,
  13696, 12928, 12192, 11520, 10848, 10240,  9664,  9120,  8608,  8128,  7680,  7248,
   6848,  6464,  6096,  5760,  5424,  5120,  4832,  4560,  4304,  4064,  3840,  3624,
   3424,  3232,  3048,  2880,  2712,  2560,  2416,  2280,  2152,  2032,  1920,  1812,
   1712,  1616,  1524,  1440,  1356,  1280,  1208,  1140,  1076,  1016,   960,   906,
    856,   808,   762,   720,   678,   640,   604,   570,   538,   508,   480,   453,
    428,   404,   381,   360,   339,   320,   302,   285,   269,   254,   240,   226,
    214,   202,   190,   180,   170,   160,   151,   143,   135,   127,   120,   113,
    107,   101,    95,    90,    85,    80,    75,    71,    67,    63,    60,    56,
     53,    50,    47,    45,    42,    40,    37,    35,    33,    31,    30,    28,
];

/**
 * Index in SYN_PERIODS corresponding to XM note 37 (C-3, period 856).
 * All synth notes map relative to this anchor.
 */
const SYN_REFERENCE_IDX = 49; // SYN_PERIODS[49] = 856

/**
 * XM note number corresponding to SYN_REFERENCE_IDX (Amiga C-3 = XM C-3).
 */
const XM_REFERENCE_NOTE = 37;

/**
 * PAL sample rate at the reference period (856): 3546895 / (2 × 856) ≈ 2072 Hz.
 * Synth waveforms are stored at this rate so that note index maps 1:1 to XM notes.
 */
const SYNTH_BASE_RATE = Math.round(PAL_CLOCK / (2 * 856)); // 2072 Hz

// ── Utility ────────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

/** Convert Amiga Synthesis note index → XM note number (0 = no note). */
function synNoteToXM(n: number): number {
  if (n === 0) return 0;
  return XM_REFERENCE_NOTE + (n - SYN_REFERENCE_IDX);
}

/** Decode a null-terminated ASCII/Latin-1 string from buf[off..off+len). */
function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` appears to be a Synthesis module.
 * Checks "Synth4.0" at offset 0 or "Synth4.2" at offset 0x1f0e.
 */
export function isSynthesisFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 204) return false;

  // Synth4.0 at offset 0
  if (
    bytes[0] === 0x53 && bytes[1] === 0x79 && bytes[2] === 0x6e && bytes[3] === 0x74 &&
    bytes[4] === 0x68 && bytes[5] === 0x34 && bytes[6] === 0x2e && bytes[7] === 0x30
  ) return true;

  // Synth4.2 at offset 0x1f0e
  if (bytes.length < 0x1f0e + 204) return false;
  if (
    bytes[0x1f0e + 0] === 0x53 && bytes[0x1f0e + 1] === 0x79 && bytes[0x1f0e + 2] === 0x6e &&
    bytes[0x1f0e + 3] === 0x74 && bytes[0x1f0e + 4] === 0x68 && bytes[0x1f0e + 5] === 0x34 &&
    bytes[0x1f0e + 6] === 0x2e && bytes[0x1f0e + 7] === 0x32
  ) return true;

  return false;
}

// ── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a Synthesis (.syn) module into a TrackerSong.
 * Returns null if the file is not valid or cannot be parsed.
 */
export function parseSynthesisFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return parseSynthesis(bytes, filename);
  } catch {
    return null;
  }
}

function parseSynthesis(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isSynthesisFormat(bytes)) return null;

  // Determine startOffset: Synth4.0 → 0, Synth4.2 → 0x1f0e
  const startOffset = (bytes[0] === 0x53) ? 0 : 0x1f0e;

  let off = startOffset + 8; // skip magic

  // ── Header ──────────────────────────────────────────────────────────────
  const NOP  = u16BE(bytes, off);     off += 2; // number of positions
  const NOR  = u16BE(bytes, off);     off += 2; // number of track rows
  off += 4;                                      // skip 4 bytes
  const NOS  = bytes[off++];                     // number of samples
  const NOW  = bytes[off++];                     // number of waveforms
  const NOI  = bytes[off++];                     // number of instruments
  const NSS  = bytes[off++];                     // number of sub-songs (actual count; loop NSS times, NOT NSS+1)
  const NOE  = bytes[off++];                     // number of EG tables
  const NOADSR = bytes[off++];                   // number of ADSR tables
  off += 1;                                      // noise length (unused)

  // After the 11 count bytes, skip 13 bytes of padding before name
  off += 13;

  const moduleName = readString(bytes, off, 28); off += 28;
  off += 140; // skip text/comment

  // ── Sample info: NOS × 28 bytes [1 unknown + 27 name] ───────────────────
  const sampleNames: string[] = [];
  for (let i = 0; i < NOS; i++) {
    off += 1; // unknown byte
    sampleNames.push(readString(bytes, off, 27));
    off += 27;
  }

  // Sample lengths: NOS × uint32 BE
  const sampleLengths: number[] = [];
  for (let i = 0; i < NOS; i++) {
    sampleLengths.push(u32BE(bytes, off)); off += 4;
  }

  // ── EG tables: NOE × 128 bytes ─────────────────────────────────────────
  // (not needed for static import — skip)
  off += NOE * 128;

  // ── ADSR tables: NOADSR × 256 bytes ────────────────────────────────────
  off += NOADSR * 256;

  // ── Instruments: NOI × 28 bytes ─────────────────────────────────────────
  // Fields (in order from SynthesisWorker.cs LoadInstrumentInfo):
  //   WaveformNumber(1), SynthesisEnabled(1), WaveformLength(2), RepeatLength(2),
  //   Volume(1), PortamentoSpeed(1s), AdsrEnabled(1), AdsrTableNumber(1),
  //   AdsrTableLength(2), skip(1), ArpeggioStart(1), ArpeggioLength(1),
  //   ArpeggioRepeatLength(1), Effect(1), EffectArg1(1), EffectArg2(1),
  //   EffectArg3(1), VibratoDelay(1), VibratoSpeed(1), VibratoLevel(1),
  //   EgcOffset(1), EgcMode(1), EgcTableNumber(1), EgcTableLength(2)
  //   = 1+1+2+2+1+1+1+1+2+1+1+1+1+1+1+1+1+1+1+1+1+1+1+2 = 28 bytes ✓
  interface SynInstrument {
    waveformNumber: number;
    synthesisEnabled: boolean;
    waveformLength: number;
    repeatLength: number;
    volume: number;
  }
  const instruments: SynInstrument[] = [];
  for (let i = 0; i < NOI; i++) {
    const waveformNumber    = bytes[off++];
    const synthesisEnabled  = bytes[off++] !== 0;
    const waveformLength    = u16BE(bytes, off); off += 2;
    const repeatLength      = u16BE(bytes, off); off += 2;
    const volume            = bytes[off++];
    off += 1; // portamento speed
    off += 1; // adsrEnabled
    off += 1; // adsrTableNumber
    off += 2; // adsrTableLength
    off += 1; // skip (padding after adsrTableLength)
    off += 1; // arpeggioStart
    off += 1; // arpeggioLength
    off += 1; // arpeggioRepeatLength
    off += 1; // effect
    off += 1; // effectArg1
    off += 1; // effectArg2
    off += 1; // effectArg3
    off += 1; // vibratoDelay
    off += 1; // vibratoSpeed
    off += 1; // vibratoLevel
    off += 1; // egcOffset
    off += 1; // egcMode
    off += 1; // egcTableNumber
    off += 2; // egcTableLength
    instruments.push({ waveformNumber, synthesisEnabled, waveformLength, repeatLength, volume });
  }

  // ── Arpeggio tables: 16 × 16 bytes ─────────────────────────────────────
  off += 16 * 16;

  // ── Sub-songs: NSS × 14 bytes ──────────────────────────────────────────
  // Note from SynthesisWorker.cs: `subSongs = new SongInfo[numberOfSubSongs]`
  // where numberOfSubSongs = NSS (loop i = 0..NSS-1, i.e. NSS iterations).
  // Then after the loop: `moduleStream.Seek(14, SeekOrigin.Current)` — extra skip.
  interface SynSongInfo {
    startSpeed: number;
    rowsPerTrack: number;
    firstPosition: number;
    lastPosition: number;
    restartPosition: number;
  }
  const subSongs: SynSongInfo[] = [];
  for (let i = 0; i < NSS; i++) {
    off += 4; // skip 4
    const startSpeed      = bytes[off++];
    const rowsPerTrack    = bytes[off++];
    const firstPosition   = u16BE(bytes, off); off += 2;
    const lastPosition    = u16BE(bytes, off); off += 2;
    const restartPosition = u16BE(bytes, off); off += 2;
    off += 2; // skip 2
    subSongs.push({ startSpeed, rowsPerTrack, firstPosition, lastPosition, restartPosition });
  }
  off += 14; // extra sub-song entry always present

  // ── Waveforms: NOW × 256 bytes (8-bit signed) ───────────────────────────
  const waveformData: Uint8Array[] = [];
  for (let i = 0; i < NOW; i++) {
    waveformData.push(bytes.slice(off, off + 256));
    off += 256;
  }

  // ── Positions: NOP × 16 bytes ──────────────────────────────────────────
  // 4 voices × 4 bytes: startTrackRow(u16BE) + soundTranspose(s8) + noteTranspose(s8)
  interface SynPosition {
    startTrackRow: number;
    soundTranspose: number;
    noteTranspose: number;
  }
  const positions: SynPosition[][] = [];
  for (let p = 0; p < NOP; p++) {
    const voices: SynPosition[] = [];
    for (let v = 0; v < 4; v++) {
      const startTrackRow  = u16BE(bytes, off); off += 2;
      const soundTranspose = s8(bytes[off++]);
      const noteTranspose  = s8(bytes[off++]);
      voices.push({ startTrackRow, soundTranspose, noteTranspose });
    }
    positions.push(voices);
  }

  // ── Track rows: (NOR + 64) × 4 bytes ───────────────────────────────────
  // byte1: note, byte2: instrument, byte3: (arpHi<<4)|effect, byte4: effectArg
  const totalRows = NOR + 64;
  interface SynTrackLine {
    note: number;
    instrument: number;
    arpeggio: number;
    effect: number;
    effectArg: number;
  }
  const trackLines: SynTrackLine[] = [];
  for (let i = 0; i < totalRows; i++) {
    const b1 = bytes[off++];
    const b2 = bytes[off++];
    const b3 = bytes[off++];
    const b4 = bytes[off++];
    trackLines.push({
      note:       b1,
      instrument: b2,
      arpeggio:   (b3 & 0xf0) >> 4,
      effect:     b3 & 0x0f,
      effectArg:  b4,
    });
  }

  // ── Sample PCM data: NOS × sampleLength bytes ────────────────────────────
  const samplePCM: Uint8Array[] = [];
  for (let i = 0; i < NOS; i++) {
    const len = sampleLengths[i];
    samplePCM.push(len > 0 ? bytes.slice(off, off + len) : new Uint8Array(0));
    off += len;
  }

  // ── Build InstrumentConfigs ─────────────────────────────────────────────
  // Use sub-song 0 as the primary song (first valid sub-song)
  const song = subSongs[0];
  if (!song) return null;

  const instrumentConfigs: InstrumentConfig[] = [];

  for (let i = 0; i < NOI; i++) {
    const instr = instruments[i];
    const instrId = i + 1;

    if (!instr.synthesisEnabled) {
      // PCM sample instrument
      const sampleIdx = instr.waveformNumber; // for non-synth: waveformNumber = sample index
      if (sampleIdx < NOS && samplePCM[sampleIdx].length > 0) {
        const pcm = samplePCM[sampleIdx];
        const vol = instr.volume;

        // Determine loop points from waveformLength / repeatLength
        // Lengths stored as word counts (×2 for bytes), or just byte counts?
        // NostalgicPlayer: sample.Length is already in bytes (Read_B_UINT32).
        // WaveformLength and RepeatLength are ushort (word counts? bytes?).
        // From Samples property: loopStart = 0, loopLength = sampleInfo.LoopLength.
        // RepeatLength == 0 → full-length loop, RepeatLength == 2 → no loop.
        const wl = instr.waveformLength; // pre-loop length in bytes (one-shot part)
        const rl = instr.repeatLength;   // loop length in bytes

        let loopStart = 0;
        let loopEnd   = 0;
        const sampleRate = Math.round(PAL_CLOCK / (2 * 856)); // C-3 rate

        if (rl === 0) {
          // Full loop
          loopStart = 0;
          loopEnd   = pcm.length;
        } else if (rl === 2) {
          // No loop
          loopStart = 0;
          loopEnd   = 0;
        } else {
          // Loop from wl for rl bytes
          loopStart = wl;
          loopEnd   = wl + rl;
        }

        instrumentConfigs.push(
          createSamplerInstrument(instrId, sampleNames[sampleIdx] || `Sample ${sampleIdx}`, pcm, vol, sampleRate, loopStart, loopEnd)
        );
      } else {
        // Empty / missing sample — create a placeholder synth instrument
        instrumentConfigs.push({
          id: instrId,
          name: `Instrument ${instrId}`,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: 0,
          pan: 0,
          oscillator: { type: 'sawtooth' as const, detune: 0, octave: 0 },
        } as InstrumentConfig);
      }
    } else {
      // Synthesis waveform instrument
      const waveIdx = instr.waveformNumber;
      if (waveIdx < NOW) {
        const waveBytes = waveformData[waveIdx];
        const wl = instr.waveformLength;
        const rl = instr.repeatLength;
        const vol = instr.volume;

        let loopStart = 0;
        let loopEnd   = 0;

        if (rl === 0) {
          loopStart = 0;
          loopEnd   = waveBytes.length;
        } else if (rl === 2) {
          loopStart = 0;
          loopEnd   = 0;
        } else {
          loopStart = wl;
          loopEnd   = wl + rl;
        }

        instrumentConfigs.push(
          createSamplerInstrument(instrId, `Waveform ${waveIdx}`, waveBytes, vol, SYNTH_BASE_RATE, loopStart, loopEnd)
        );
      } else {
        instrumentConfigs.push({
          id: instrId,
          name: `Instrument ${instrId}`,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: 0,
          pan: 0,
          oscillator: { type: 'sawtooth' as const, detune: 0, octave: 0 },
        } as InstrumentConfig);
      }
    }
  }

  // ── Build patterns from positions ──────────────────────────────────────
  // Each position entry defines the starting track row for each of 4 voices.
  // The track plays rowsPerTrack rows. We build one pattern per position.
  const rowsPerTrack = song.rowsPerTrack || 16;
  const _numPositions = song.lastPosition - song.firstPosition + 1;
  const firstPos     = song.firstPosition;

  const patterns: Pattern[] = [];

  // Hard-coded Amiga stereo panning (LRRL): channels 0,3 = left; 1,2 = right
  const CHANNEL_PAN: number[] = [-50, 50, 50, -50];

  for (let posIdx = 0; posIdx < NOP; posIdx++) {
    const posVoices = positions[posIdx];
    const cells: TrackerCell[][] = Array.from({ length: rowsPerTrack }, () =>
      Array.from({ length: 4 }, () => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      } as TrackerCell))
    );

    for (let v = 0; v < 4; v++) {
      const posVoice = posVoices[v];
      let trackRow   = posVoice.startTrackRow;

      for (let row = 0; row < rowsPerTrack; row++) {
        if (trackRow >= trackLines.length) break;
        const tl = trackLines[trackRow++];

        let xmNote = 0;
        let instrNum = 0;
        let effTyp = 0;
        let eff = 0;

        // Note: apply noteTranspose to note index
        if (tl.note !== 0) {
          const rawNote = tl.note + s8(posVoice.noteTranspose);
          const clamped = Math.max(1, Math.min(108, rawNote));
          xmNote = synNoteToXM(clamped);
        }

        // Instrument: apply soundTranspose to select the instrument
        if (tl.instrument !== 0) {
          instrNum = tl.instrument + s8(posVoice.soundTranspose);
          if (instrNum < 1) instrNum = 1;
          if (instrNum > NOI) instrNum = NOI;
        }

        // Map Synthesis effects to XM effects (best-effort)
        switch (tl.effect) {
          case 0x1: // Slide (portamento)
            effTyp = 0x03; eff = tl.effectArg; break;
          case 0x8: // SetSpeed
            effTyp = 0x0F; eff = tl.effectArg; break;
          case 0xF: // SetVolume
            effTyp = 0x0C; eff = Math.min(0x40, tl.effectArg); break;
          case 0x7: // SetFilter — no direct XM equivalent, skip
            break;
          default:
            break;
        }

        cells[row][v] = {
          note:       xmNote,
          instrument: instrNum,
          volume:     0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2:    0,
        };
      }
    }

    patterns.push({
      id: `pattern-${posIdx}`,
      name: `Pattern ${posIdx}`,
      length: rowsPerTrack,
      channels: Array.from({ length: 4 }, (_, chIdx) => ({
        id:           `channel-${chIdx}`,
        name:         `Channel ${chIdx + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          CHANNEL_PAN[chIdx],
        instrumentId: null,
        color:        null,
        rows:         cells.map(row => row[chIdx]),
      })),
      importMetadata: {
        sourceFormat:            'Synthesis' as const,
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    4,
        originalPatternCount:    NOP,
        originalInstrumentCount: NOI,
      },
    });
  }

  // ── Song order ─────────────────────────────────────────────────────────
  const songPositions: number[] = [];
  for (let p = firstPos; p <= song.lastPosition && p < NOP; p++) {
    songPositions.push(p);
  }
  if (songPositions.length === 0) {
    for (let p = 0; p < NOP; p++) songPositions.push(p);
  }

  const baseName = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            moduleName || baseName,
    format:          'XM' as TrackerFormat,
    patterns,
    instruments:     instrumentConfigs,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: song.restartPosition < songPositions.length ? song.restartPosition : 0,
    numChannels:     4,
    initialSpeed:    song.startSpeed || 6,
    initialBPM:      125,
  };
}
