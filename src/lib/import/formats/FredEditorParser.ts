/**
 * FredEditorParser.ts -- Fred Editor (.fred) Amiga format parser
 *
 * Fred Editor is a 4-channel Amiga tracker with multiple subsongs, ADSR envelopes,
 * arpeggio tables, vibrato, portamento, and synth/pulse/blending sample types.
 *
 * Binary format detected by scanning for 68k assembly patterns:
 *   - 0x4efa (jmp) at 16-byte intervals in the first 16 bytes
 *   - 0x123a/0xb001 and 0x214a/0x47fa sequences in the first 1024 bytes
 *
 * The song is decoded from the module's own structures (FredEditorModule.ts:
 * track lists, pattern command streams, instrument records - reversed from
 * the replayer every .fred file carries) and the grid is each voice's walk
 * through its track list on one line timeline (fredEditorGrid.ts). Audio:
 * FredReplayer2 (fredReplayerFileData). Grid edits re-encode the module
 * (applyFredGridEdits) and the engine swaps it in (fredModuleEdits.ts).
 * Research: thoughts/shared/research/2026-10-06_fred-editor-format.md
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData } from '@/types';
import type { InstrumentConfig, FredConfig, UADEChipRamInfo } from '@/types/instrument';
import { createSamplerInstrument } from './AmigaUtils';
import { decodeFredModule, fredSections, FRED_INSTRUMENT_SIZE } from './FredEditorModule';
import { FRED_ROWS_PER_PATTERN, fredCellEffectColumns, fredLineToCell, walkFredSong } from './fredEditorGrid';

// ── Utility: read big-endian values from a DataView ─────────────────────────

function readUint32(view: DataView, off: number): number {
  return view.getUint32(off, false);
}

function readInt16(view: DataView, off: number): number {
  return view.getInt16(off, false);
}

function readUint16(view: DataView, off: number): number {
  return view.getUint16(off, false);
}

function readUint8(view: DataView, off: number): number {
  return view.getUint8(off);
}

function readInt8(view: DataView, off: number): number {
  const v = view.getUint8(off);
  return v < 128 ? v : v - 256;
}

// ── FE sample definition ────────────────────────────────────────────────────

interface FESample {
  pointer: number;
  loopPtr: number;     // signed short - loop offset within sample
  length: number;      // in bytes (already <<1)
  relative: number;    // relative tuning (period multiplier / 1024)

  vibratoDelay: number;
  vibratoSpeed: number;
  vibratoDepth: number;

  envelopeVol: number;
  attackSpeed: number;
  attackVol: number;
  decaySpeed: number;
  decayVol: number;
  sustainTime: number;
  releaseSpeed: number;
  releaseVol: number;

  arpeggio: Int8Array;      // 16 signed bytes
  arpeggioLimit: number;
  arpeggioSpeed: number;

  type: number;             // 0=regular, 1=PWM/pulse, 2=wavetable blending
  synchro: number;

  pulseRateNeg: number;
  pulseRatePos: number;
  pulseSpeed: number;
  pulsePosL: number;
  pulsePosH: number;
  pulseDelay: number;
  pulseCounter: number;

  blendRate: number;
  blendDelay: number;
  blendCounter: number;
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Check if a buffer is a Fred Editor format file.
 * Detection: scan first 16 bytes at 4-byte intervals for 0x4efa (jmp instruction),
 * then search within first 1024 bytes for 0x123a/0xb001 and 0x214a/0x47fa patterns.
 */
export function isFredEditorFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 1024) return false;

  const view = new DataView(buffer);

  // Check for jmp (0x4efa) at 4-byte intervals in the first 16 bytes
  // The FEPlayer reads at positions 0, 4, 8, 12 (incrementing by 4 from 16-bit read + skip 2)
  let hasJmp = true;
  for (let pos = 0; pos < 16; pos += 4) {
    const value = view.getUint16(pos, false);
    if (value !== 0x4efa) {
      hasJmp = false;
      break;
    }
  }
  if (!hasJmp) return false;

  // Search for 68k code patterns: 0x123a/0xb001 or 0x214a/0x47fa
  let foundDataPtr = false;
  let foundBasePtr = false;
  let pos = 16;

  while (pos < 1024 && pos + 6 <= buffer.byteLength) {
    const value = view.getUint16(pos, false);

    if (value === 0x123a) {
      // move.b $x,d1 -- check for cmp.b d1,d0 at pos+4
      if (pos + 4 < buffer.byteLength) {
        const next = view.getUint16(pos + 4, false);
        if (next === 0xb001) {
          foundDataPtr = true;
        }
      }
    } else if (value === 0x214a) {
      // move.l a2,(a0) -- check for lea $x,a3 at pos+4
      if (pos + 4 < buffer.byteLength) {
        const next = view.getUint16(pos + 4, false);
        if (next === 0x47fa) {
          foundBasePtr = true;
        }
      }
    }

    if (foundDataPtr && foundBasePtr) return true;
    pos += 2;
  }

  // The loader only requires basePtr (version check). dataPtr is also needed for
  // actual parsing, but for detection we require at least the basePtr pattern.
  return foundBasePtr;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/** One 64-byte instrument record (Lab2_InsStr) as the replayer reads it. */
function readSample(rec: Uint8Array): FESample {
  const view = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
  const arpeggio = new Int8Array(16);
  for (let i = 0; i < 16; i++) arpeggio[i] = readInt8(view, 22 + i);
  return {
    pointer: readUint32(view, 0),
    loopPtr: readInt16(view, 4),
    length: readUint16(view, 6) << 1,
    relative: readUint16(view, 8),
    vibratoDelay: readUint8(view, 10),
    vibratoSpeed: readUint8(view, 12),
    vibratoDepth: readUint8(view, 13),
    envelopeVol: readUint8(view, 14),
    attackSpeed: readUint8(view, 15),
    attackVol: readUint8(view, 16),
    decaySpeed: readUint8(view, 17),
    decayVol: readUint8(view, 18),
    sustainTime: readUint8(view, 19),
    releaseSpeed: readUint8(view, 20),
    releaseVol: readUint8(view, 21),
    arpeggio,
    arpeggioSpeed: readUint8(view, 38),
    type: readInt8(view, 39),
    pulseRateNeg: readInt8(view, 40),
    pulseRatePos: readUint8(view, 41),
    pulseSpeed: readUint8(view, 42),
    pulsePosL: readUint8(view, 43),
    pulsePosH: readUint8(view, 44),
    pulseDelay: readUint8(view, 45),
    synchro: readUint8(view, 46),
    blendRate: readUint8(view, 47),
    blendDelay: readUint8(view, 48),
    pulseCounter: readUint8(view, 49),
    blendCounter: readUint8(view, 50),
    arpeggioLimit: readUint8(view, 51),
  };
}

function fredConfigOf(sample: FESample): FredConfig {
  return {
    envelopeVol:   sample.envelopeVol,
    attackSpeed:   sample.attackSpeed,
    attackVol:     sample.attackVol,
    decaySpeed:    sample.decaySpeed,
    decayVol:      sample.decayVol,
    sustainTime:   sample.sustainTime,
    releaseSpeed:  sample.releaseSpeed,
    releaseVol:    sample.releaseVol,
    vibratoDelay:  sample.vibratoDelay,
    vibratoSpeed:  sample.vibratoSpeed,
    vibratoDepth:  sample.vibratoDepth,
    arpeggio:      Array.from(sample.arpeggio),
    arpeggioLimit: sample.arpeggioLimit,
    arpeggioSpeed: sample.arpeggioSpeed,
    pulseRateNeg:  sample.pulseRateNeg,
    pulseRatePos:  sample.pulseRatePos,
    pulseSpeed:    sample.pulseSpeed,
    pulsePosL:     sample.pulsePosL,
    pulsePosH:     sample.pulsePosH,
    pulseDelay:    sample.pulseDelay,
    relative:      sample.relative,
  };
}

/**
 * Parse a Fred Editor (.fred) file into a TrackerSong: the grid of subsong
 * `subsong` decoded from the module (see the file header), the instrument
 * records as instruments.
 */
export async function parseFredEditorFile(
  buffer: ArrayBuffer,
  filename: string,
  moduleBase = 0,
  subsong = 0,
): Promise<TrackerSong> {
  const bytes = new Uint8Array(buffer);
  const module = decodeFredModule(bytes);
  const { dataPtr, base, blockTrk, patStart, structStart } = fredSections(bytes);
  const song = Math.min(Math.max(0, subsong), module.songs - 1);

  // ── Instruments: the 64-byte records; sample data at Base + InsAdr ──────
  const instruments: InstrumentConfig[] = [];
  module.instruments.forEach((rec, i) => {
    const sample = readSample(rec);
    const instId = i + 1;
    const name = `Sample ${instId}`;
    const instrFileOffset = structStart + i * FRED_INSTRUMENT_SIZE;
    const chipRam: UADEChipRamInfo = {
      moduleBase,
      moduleSize: buffer.byteLength,
      instrBase: moduleBase + instrFileOffset,
      instrSize: FRED_INSTRUMENT_SIZE,
      sections: {
        dataBase:    moduleBase + dataPtr,
        fileBase:    moduleBase + base,
        sampleDefs:  moduleBase + structStart,
        patternData: moduleBase + patStart,
        trackData:   moduleBase + blockTrk,
      },
    };
    const start = sample.pointer ? base + sample.pointer : -1;
    const pcm = start >= 0 && sample.length > 0 && start + sample.length <= bytes.length
      ? bytes.slice(start, start + sample.length) : null;

    let instr: InstrumentConfig;
    if (sample.type === 1) {
      // PWM synth instrument — FredSynth
      instr = {
        id: instId, name: `${name} (PWM)`, type: 'synth' as const, synthType: 'FredSynth' as const,
        fred: fredConfigOf(sample), effects: [], volume: -6, pan: 0,
      } as unknown as InstrumentConfig;
    } else if (sample.type === 2) {
      // Wavetable blend — Sampler approximation with the PCM data if available
      instr = pcm
        ? createSamplerInstrument(instId, `${name} (Blend)`, pcm, Math.min(64, sample.envelopeVol || 64), 8287, 0, 0)
        : makePlaceholderInstrument(instId, `${name} (Blend)`);
    } else if (sample.type === 0 && pcm) {
      const loop = sample.loopPtr > 0;
      instr = createSamplerInstrument(instId, name, pcm, Math.min(64, sample.envelopeVol || 64), 8287,
        loop ? sample.loopPtr : 0, loop ? sample.length : 0);
      // Instrument-level vibrato / arpeggio / envelope live on the record; keep them on the config.
      instr.fred = fredConfigOf(sample);
    } else {
      instr = makePlaceholderInstrument(instId, name);
    }
    instr.uadeChipRam = chipRam;
    instruments.push(instr);
  });
  if (instruments.length === 0) instruments.push(makePlaceholderInstrument(1, 'Default'));

  // ── Grid: every voice's line on one timeline, cut into 64-row patterns ──
  const walk = walkFredSong(module, song);
  const numPatterns = Math.max(1, Math.ceil(walk.lines / FRED_ROWS_PER_PATTERN));
  const patterns: Pattern[] = [];
  for (let p = 0; p < numPatterns; p++) {
    const first = p * FRED_ROWS_PER_PATTERN;
    const length = Math.max(1, Math.min(FRED_ROWS_PER_PATTERN, walk.lines - first));
    const channels: ChannelData[] = walk.voices.map((refs, ch) => {
      const rows = Array.from({ length }, (_, r) => {
        const ref = refs[first + r];
        return fredLineToCell(ref ? module.patterns[ref.pattern].lines[ref.line] : undefined);
      });
      const effectCols = Math.max(...rows.map(fredCellEffectColumns));
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50, // Amiga LRRL hard stereo
        instrumentId: null,
        color: null,
        rows,
        ...(effectCols > 2 ? { channelMeta: { importedFromMOD: false, effectCols } } : {}),
      };
    });
    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length,
      channels,
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: module.patterns.length,
        originalInstrumentCount: module.instruments.length,
      },
    });
  }

  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: 4,
    // One line = TempoCur ticks of the 50 Hz play call (125 BPM = 50 ticks/s).
    initialSpeed: module.tempos[song] || 6,
    initialBPM: 125,
    linearPeriods: false,
    // WASM engine playback (replaces UADE)
    fredReplayerFileData: buffer.slice(0) as ArrayBuffer,
  };
}

// ── Helper functions ────────────────────────────────────────────────────────

function makePlaceholderInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name,
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: -6,
    pan: 0,
  } as InstrumentConfig;
}
