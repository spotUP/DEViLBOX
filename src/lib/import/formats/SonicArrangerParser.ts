/**
 * SonicArrangerParser.ts -- Sonic Arranger (.sa) Amiga format parser
 *
 * Sonic Arranger is a 4-channel Amiga tracker by Carsten Schlote et al., 1991-95.
 * Magic: "SOARV1.0" at offset 0 (uncompressed); "@OARV1.0" = lh-compressed (rejected).
 *
 * Format reference: NostalgicPlayer/Source/Agents/Players/SonicArranger/SonicArrangerWorker.cs
 * UADE player source: uade-3.05/amigasrc/players/wanted_team/Sonic_Arranger/Sonic Arranger_v1.asm
 *
 * Chunk layout (sequential, no size fields in most chunks):
 *   [SOARV1.0] magic (8 bytes)
 *   [STBL] uint32 count + count × 12-byte sub-song descriptors
 *   [OVTB] uint32 count + count × 16-byte position entries (4 channels × 4 bytes)
 *   [NTBL] uint32 count + count × 4-byte track row entries
 *   [INST] uint32 count + count × 152-byte instrument descriptors
 *   [SD8B] int32 count + count × 38-byte sample info (skipped) +
 *          count × uint32 byte-lengths + PCM data (signed int8)
 *   [SYWT] uint32 count + count × 128-byte signed waveforms
 *   [SYAR] uint32 count + count × 128-byte ADSR tables
 *   [SYAF] uint32 count + count × 128-byte AMF tables
 *
 * Instrument struct (152 bytes):
 *   +0   uint16 type       (0=Sample, 1=Synth)
 *   +2   uint16 waveformNumber  (sample index for type=Sample)
 *   +4   uint16 waveformLength  (one-shot length in words)
 *   +6   uint16 repeatLength    (loop length in words; 0=loop all, 1=no loop)
 *   +8   skip 8 bytes
 *   +16  uint16 volume     (0-64)
 *   +18  int16  fineTuning
 *   +20  uint16 portamentoSpeed
 *   +22  uint16 vibratoDelay
 *   +24  uint16 vibratoSpeed
 *   +26  uint16 vibratoLevel
 *   +28  uint16 amfNumber + amfDelay + amfLength + amfRepeat (8 bytes)
 *   +36  uint16 adsrNumber + adsrDelay + adsrLength + adsrRepeat + sustainPoint + sustainDelay (12 bytes)
 *   +48  skip 16 bytes
 *   +64  uint16 effectArg1 + effect + effectArg2 + effectArg3 + effectDelay (10 bytes)
 *   +74  3 × { uint8 length, uint8 repeat, int8[14] values } = 48 bytes
 *   +122 char[30] name
 *   = 152 bytes total
 *
 * Track row (4 bytes):
 *   byte 0: note  (0=empty, 1-108 = period table index 1-based)
 *   byte 1: instrument (1-based, 0=none)
 *   byte 2: bits7-6=DisableSoundTranspose/NoteTranspose, bits5-4=arpeggioTable, bits3-0=effect
 *   byte 3: effect argument
 *
 * Note → XM note conversion:
 *   SA period table entry 49 (1-based) = 856 = C-1 = DEViLBOX XM 13
 *   Formula: xmNote = saNote - 36   (valid for saNote 37..108 → XM 1..72)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// -- Binary helpers -----------------------------------------------------------

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function i8(v: DataView, off: number): number  { return v.getInt8(off); }
function u16(v: DataView, off: number): number { return v.getUint16(off, false); }
function u32(v: DataView, off: number): number { return v.getUint32(off, false); }
function i32(v: DataView, off: number): number { return v.getInt32(off, false); }

function readMark(v: DataView, off: number): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += String.fromCharCode(v.getUint8(off + i));
  return s;
}

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

// -- SA note → XM note --------------------------------------------------------
// Period table (1-based): index 49 = 856 = C-1 = DEViLBOX XM 13
// xmNote = saNote - 36  (valid for saNote >= 37; below that → 0)

function saNote2XM(note: number): number {
  if (note === 0) return 0;
  const xm = note - 36;
  return xm >= 1 ? xm : 0;
}

// -- Sub-song info ------------------------------------------------------------

interface SASong {
  startSpeed:      number;  // ticks per row
  rowsPerTrack:    number;
  firstPosition:   number;
  lastPosition:    number;
  restartPosition: number;
  tempo:           number;  // Hz value → BPM = tempo * 125 / 50
}

// -- Instrument info ----------------------------------------------------------

interface SAInstrument {
  isSynth:        boolean;
  waveformNumber: number;   // index into sampleData[] (type=Sample) or waveformData[] (Synth)
  waveformLength: number;   // one-shot length in words → *2 bytes
  repeatLength:   number;   // loop length in words → *2 bytes (0=all, 1=no loop)
  volume:         number;   // 0-64
  name:           string;
}

// -- Track row ----------------------------------------------------------------

interface SARow {
  note:    number;    // 0=empty, 1-108 = period index
  instr:   number;   // 1-based instrument, 0=none
  disableSoundTranspose: boolean;
  disableNoteTranspose:  boolean;
  arpeggioTable:         number;  // 0-2 (SA arpeggio table selector, not used in XM mapping)
  effect:  number;   // 0x0-0xF
  effArg:  number;   // 0-255
}

// -- Position entry -----------------------------------------------------------

interface SAPosition {
  startTrackRow:  number;   // index into trackLines[]
  soundTranspose: number;   // signed int8
  noteTranspose:  number;   // signed int8
}

// -- Format detection ---------------------------------------------------------

/**
 * Returns true if the buffer starts with "SOARV1.0" (uncompressed Sonic Arranger).
 * "@OARV1.0" (lh-compressed) is rejected — UADE handles it natively.
 */
export function isSonicArrangerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const v = new DataView(buffer);
  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(v.getUint8(i));
  return magic === 'SOARV1.0';
}

// -- Main parser --------------------------------------------------------------

/**
 * Parse a Sonic Arranger (.sa) file into a TrackerSong.
 */
export async function parseSonicArrangerFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const v     = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (buffer.byteLength < 16) throw new Error('SonicArranger: file too small');

  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(v.getUint8(i));
  if (magic !== 'SOARV1.0') throw new Error(`SonicArranger: bad magic "${magic}"`);

  let pos = 8;  // cursor after magic

  // ── STBL — sub-song table ──────────────────────────────────────────────────
  if (readMark(v, pos) !== 'STBL') throw new Error('SonicArranger: missing STBL chunk');
  pos += 4;

  const numSubSongs = u32(v, pos); pos += 4;
  const subSongs: SASong[] = [];
  for (let i = 0; i < numSubSongs; i++) {
    const ss: SASong = {
      startSpeed:      u16(v, pos),
      rowsPerTrack:    u16(v, pos + 2),
      firstPosition:   u16(v, pos + 4),
      lastPosition:    u16(v, pos + 6),
      restartPosition: u16(v, pos + 8),
      tempo:           u16(v, pos + 10),
    };
    pos += 12;
    // Skip invalid sub-songs (0xFFFF markers used internally)
    if (ss.lastPosition !== 0xFFFF && ss.restartPosition !== 0xFFFF) {
      subSongs.push(ss);
    }
  }

  // Use first valid sub-song
  const song: SASong = subSongs[0] ?? {
    startSpeed: 6, rowsPerTrack: 64, firstPosition: 0, lastPosition: 0,
    restartPosition: 0, tempo: 50,
  };

  // ── OVTB — position/order table ────────────────────────────────────────────
  if (readMark(v, pos) !== 'OVTB') throw new Error('SonicArranger: missing OVTB chunk');
  pos += 4;

  const numPositions = u32(v, pos); pos += 4;
  // positions[posIdx][ch] → SAPosition
  const positions: SAPosition[][] = [];
  for (let p = 0; p < numPositions; p++) {
    const chans: SAPosition[] = [];
    for (let ch = 0; ch < 4; ch++) {
      chans.push({
        startTrackRow:  u16(v, pos),
        soundTranspose: i8(v, pos + 2),
        noteTranspose:  i8(v, pos + 3),
      });
      pos += 4;
    }
    positions.push(chans);
  }

  // ── NTBL — track rows ──────────────────────────────────────────────────────
  if (readMark(v, pos) !== 'NTBL') throw new Error('SonicArranger: missing NTBL chunk');
  pos += 4;

  const numTrackRows = u32(v, pos); pos += 4;
  const trackLines: SARow[] = [];
  for (let i = 0; i < numTrackRows; i++) {
    const b0 = u8(v, pos);
    const b1 = u8(v, pos + 1);
    const b2 = u8(v, pos + 2);
    const b3 = u8(v, pos + 3);
    trackLines.push({
      note:                    b0,
      instr:                   b1,
      disableSoundTranspose:   (b2 & 0x80) !== 0,
      disableNoteTranspose:    (b2 & 0x40) !== 0,
      arpeggioTable:           (b2 & 0x30) >> 4,
      effect:                  b2 & 0x0F,
      effArg:                  b3,
    });
    pos += 4;
  }

  // ── INST — instruments ─────────────────────────────────────────────────────
  if (readMark(v, pos) !== 'INST') throw new Error('SonicArranger: missing INST chunk');
  pos += 4;

  const numInstruments = u32(v, pos); pos += 4;
  const saInstruments: SAInstrument[] = [];
  for (let i = 0; i < numInstruments; i++) {
    const base = pos;
    const isSynth       = u16(v, base)     !== 0;
    const waveformNumber = u16(v, base + 2);
    const waveformLength = u16(v, base + 4);
    const repeatLength   = u16(v, base + 6);
    // +8: skip 8 bytes
    const volume = u16(v, base + 16) & 0xFF;  // effective 0-255, but SA uses 0-64
    // +18: fineTuning, +20: portamentoSpeed, etc. — not needed for static import
    // Name at +122, 30 bytes
    const name = readString(v, base + 122, 30) || `Instrument ${i + 1}`;

    saInstruments.push({
      isSynth,
      waveformNumber,
      waveformLength,
      repeatLength,
      volume: Math.min(volume, 64),
      name,
    });
    pos += 152;
  }

  // ── SD8B — sample data ─────────────────────────────────────────────────────
  if (readMark(v, pos) !== 'SD8B') throw new Error('SonicArranger: missing SD8B chunk');
  pos += 4;

  const numSamples = i32(v, pos); pos += 4;

  const samplePCM: (Uint8Array | null)[] = [];

  if (numSamples > 0) {
    // Skip sample info header: 38 bytes per sample
    // (4 words = 8 bytes: sampleLen/loopStart/loopLen/??? + 30 bytes name)
    pos += numSamples * 38;

    // Read per-sample byte-lengths
    const sampleLengths: number[] = [];
    for (let i = 0; i < numSamples; i++) {
      sampleLengths.push(u32(v, pos)); pos += 4;
    }

    // Read signed int8 PCM data for each sample
    for (let i = 0; i < numSamples; i++) {
      const len = sampleLengths[i];
      if (len > 0 && pos + len <= buffer.byteLength) {
        // SA samples are signed int8 (no conversion needed)
        samplePCM.push(bytes.slice(pos, pos + len));
        pos += len;
      } else {
        samplePCM.push(null);
        pos += len;
      }
    }
  }

  // ── SYWT — waveform data (for synth instruments) ───────────────────────────
  // Each waveform: 128 signed int8 bytes
  const waveformData: (Uint8Array | null)[] = [];
  if (pos + 4 <= buffer.byteLength && readMark(v, pos) === 'SYWT') {
    pos += 4;
    const numWaveforms = u32(v, pos); pos += 4;
    for (let i = 0; i < numWaveforms; i++) {
      if (pos + 128 <= buffer.byteLength) {
        waveformData.push(bytes.slice(pos, pos + 128));
        pos += 128;
      } else {
        waveformData.push(null);
        pos += 128;
      }
    }
  }

  // Remaining chunks (SYAR, SYAF) are not needed for static instrument import

  // ── Build InstrumentConfig list ─────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < numInstruments; i++) {
    const inst = saInstruments[i];
    const id   = i + 1;

    if (!inst.isSynth) {
      // PCM sample instrument
      const pcm = inst.waveformNumber < samplePCM.length ? samplePCM[inst.waveformNumber] : null;

      if (!pcm || pcm.length === 0) {
        instruments.push({
          id, name: inst.name,
          type: 'sample' as const, synthType: 'Sampler' as const,
          effects: [], volume: -60, pan: 0,
        } as unknown as InstrumentConfig);
      } else {
        // Loop logic (from NostalgicPlayer Samples property):
        //   repeatLength == 1: no loop
        //   repeatLength == 0: loop entire sample (LoopStart=0, LoopEnd=pcm.length)
        //   else: LoopStart = waveformLength*2, LoopEnd = waveformLength*2 + repeatLength*2
        let loopStart = 0, loopEnd = 0;
        if (inst.repeatLength !== 1 && inst.waveformLength !== 0) {
          if (inst.repeatLength === 0) {
            loopStart = 0;
            loopEnd   = pcm.length;
          } else {
            loopStart = inst.waveformLength * 2;
            loopEnd   = inst.waveformLength * 2 + inst.repeatLength * 2;
            loopEnd   = Math.min(loopEnd, pcm.length);
          }
        }

        instruments.push(
          createSamplerInstrument(id, inst.name, pcm, inst.volume, 8287, loopStart, loopEnd),
        );
      }
    } else {
      // Synth instrument — use first waveform (waveformNumber) as approximation
      const wf = inst.waveformNumber < waveformData.length ? waveformData[inst.waveformNumber] : null;

      if (!wf || wf.length === 0) {
        instruments.push({
          id, name: inst.name,
          type: 'synth' as const, synthType: 'Sampler' as const,
          effects: [], volume: -60, pan: 0,
        } as unknown as InstrumentConfig);
      } else {
        // Use the 128-byte waveform as a single-cycle oscillator (loop entire wave)
        instruments.push(
          createSamplerInstrument(id, inst.name, wf, inst.volume, 8287, 0, wf.length),
        );
      }
    }
  }

  // ── Effect mapping: SA → XM ──────────────────────────────────────────────
  // SA Effect enum (nibble 0x0-0xF):
  //   0=Arpeggio, 1=SetSlideSpeed, 2=RestartAdsr, 4=SetVibrato, 5=Sync,
  //   6=SetMasterVolume, 7=SetPortamento, 8=SkipPortamento, 9=SetTrackLen,
  //   A=VolumeSlide, B=PositionJump, C=SetVolume, D=TrackBreak, E=SetFilter, F=SetSpeed

  function saEffectToXM(eff: number, arg: number): { effTyp: number; eff: number; volCol: number } {
    let effTyp = 0, effVal = 0, volCol = 0;
    switch (eff) {
      case 0x0:  // Arpeggio
        if (arg !== 0) { effTyp = 0x00; effVal = arg; }
        break;
      case 0x1:  // SetSlideSpeed — portamento up (positive) or down (negative arg nibble)
        if (arg & 0xF0) { effTyp = 0x02; effVal = arg >> 4; }   // portamento down
        else if (arg & 0x0F) { effTyp = 0x01; effVal = arg & 0x0F; } // portamento up
        break;
      case 0x4:  // SetVibrato → XM 4xy
        effTyp = 0x04; effVal = arg;
        break;
      case 0x6:  // SetMasterVolume → XM Gxx (global volume)
        effTyp = 0x10; effVal = Math.min(arg, 64);
        break;
      case 0x7:  // SetPortamento → XM 3xx (portamento to note)
        effTyp = 0x03; effVal = arg;
        break;
      case 0xA:  // VolumeSlide → XM Axy
        effTyp = 0x0A; effVal = arg;
        break;
      case 0xB:  // PositionJump → XM Bxx
        effTyp = 0x0B; effVal = arg;
        break;
      case 0xC:  // SetVolume → volume column
        volCol = 0x10 + Math.min(arg, 64);
        break;
      case 0xD:  // TrackBreak → XM Dxx (pattern break)
        effTyp = 0x0D; effVal = 0;
        break;
      case 0xE:  // SetFilter → XM E0x
        effTyp = 0x0E; effVal = arg & 0x01;
        break;
      case 0xF:  // SetSpeed → XM Fxx
        effTyp = 0x0F; effVal = arg;
        break;
      // 2=RestartAdsr, 5=Sync, 8=SkipPortamento, 9=SetTrackLen → no XM equivalent
      default: break;
    }
    return { effTyp, eff: effVal, volCol };
  }

  // ── Build patterns ──────────────────────────────────────────────────────────
  // Each position in the order list becomes one Pattern.
  // The song order is positions[firstPosition..lastPosition] (inclusive).

  const rowsPerTrack = Math.max(1, song.rowsPerTrack);
  const PANNING = [-50, 50, 50, -50] as const;  // Amiga LRRL

  // We build a pattern for EVERY position in positions[], then build the song order
  const builtPatterns: Pattern[] = [];

  for (let pidx = 0; pidx < positions.length; pidx++) {
    const posEntry = positions[pidx];

    const channels: ChannelData[] = Array.from({ length: 4 }, (_, ch) => {
      const posCh   = posEntry[ch];
      const rowBase = posCh.startTrackRow;
      const noteTranspose = posCh.noteTranspose;

      const rows: TrackerCell[] = [];

      for (let row = 0; row < rowsPerTrack; row++) {
        const tlidx = rowBase + row;
        const tl    = tlidx < trackLines.length ? trackLines[tlidx] : null;

        if (!tl || (tl.note === 0 && tl.instr === 0 && tl.effect === 0 && tl.effArg === 0)) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        // Note: apply NoteTranspose unless disabled
        let xmNote = saNote2XM(tl.note);
        if (xmNote > 0 && !tl.disableNoteTranspose && noteTranspose !== 0) {
          xmNote = Math.max(1, Math.min(96, xmNote + noteTranspose));
        }

        const instrNum = tl.instr > 0 ? tl.instr : 0;

        const { effTyp, eff, volCol } = saEffectToXM(tl.effect, tl.effArg);

        rows.push({
          note:       xmNote,
          instrument: instrNum,
          volume:     volCol,
          effTyp,
          eff,
          effTyp2: 0,
          eff2:    0,
        });
      }

      return {
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          PANNING[ch],
        instrumentId: null,
        color:        null,
        rows,
      };
    });

    builtPatterns.push({
      id:       `pattern-${pidx}`,
      name:     `Pattern ${pidx}`,
      length:   rowsPerTrack,
      channels,
      importMetadata: {
        sourceFormat:          'SonicArranger',
        sourceFile:            filename,
        importedAt:            new Date().toISOString(),
        originalChannelCount:  4,
        originalPatternCount:  positions.length,
        originalInstrumentCount: numInstruments,
      },
    });
  }

  // Fallback: at least one empty pattern
  if (builtPatterns.length === 0) {
    builtPatterns.push({
      id: 'pattern-0', name: 'Pattern 0', length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: PANNING[ch], instrumentId: null, color: null,
        rows: Array.from({ length: 64 }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'SonicArranger', sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4, originalPatternCount: 0, originalInstrumentCount: 0,
      },
    });
  }

  // ── Song order ──────────────────────────────────────────────────────────────
  // Use firstPosition..lastPosition from sub-song 0 (inclusive)
  const first = Math.min(song.firstPosition, builtPatterns.length - 1);
  const last  = Math.min(song.lastPosition,  builtPatterns.length - 1);

  const songPositions: number[] = [];
  for (let p = first; p <= last; p++) songPositions.push(p);
  if (songPositions.length === 0) songPositions.push(0);

  // ── Tempo/BPM ───────────────────────────────────────────────────────────────
  // SA Tempo = Hz value. BPM = tempo * 125 / 50 (from UADE ASM: mulu #125 / divu #50)
  const initialBPM = song.tempo > 0
    ? Math.max(32, Math.min(255, Math.round(song.tempo * 125 / 50)))
    : 125;

  const restartPos = Math.min(
    Math.max(0, song.restartPosition - first),
    songPositions.length - 1,
  );

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            moduleName,
    format:          'MOD' as TrackerFormat,
    patterns:        builtPatterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: restartPos,
    numChannels:     4,
    initialSpeed:    Math.max(1, song.startSpeed),
    initialBPM,
    linearPeriods:   false,
  };
}
