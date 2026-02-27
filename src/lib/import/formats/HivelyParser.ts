/**
 * HivelyParser.ts - Pure TypeScript binary parser for .hvl/.ahx files
 *
 * Parses the binary format byte-by-byte, following hvl_reset() and hvl_load_ahx()
 * in replay.c as the source of truth. No WASM needed at import time.
 *
 * Returns a TrackerSong ready for the TrackerReplayer.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type {
  Pattern,
  TrackerCell,
  InstrumentConfig,
  HivelyNativeData,
  HivelyNativeTrack,
  HivelyNativePosition,
  HivelyConfig,
} from '@/types';

// ── HVL Internal Types ──────────────────────────────────────────────────────

export interface HivelyEnvelope {
  aFrames: number;
  aVolume: number;
  dFrames: number;
  dVolume: number;
  sFrames: number;
  rFrames: number;
  rVolume: number;
}

export interface HivelyPerfEntry {
  note: number;
  waveform: number;
  fixed: boolean;
  fx: [number, number];
  fxParam: [number, number];
}

export interface HivelyInstrument {
  name: string;
  volume: number;
  waveLength: number;
  filterLowerLimit: number;
  filterUpperLimit: number;
  filterSpeed: number;
  squareLowerLimit: number;
  squareUpperLimit: number;
  squareSpeed: number;
  vibratoDelay: number;
  vibratoSpeed: number;
  vibratoDepth: number;
  hardCutRelease: boolean;
  hardCutReleaseFrames: number;
  envelope: HivelyEnvelope;
  performanceList: {
    speed: number;
    length: number;
    entries: HivelyPerfEntry[];
  };
}

export interface HivelyStep {
  note: number;
  instrument: number;
  fx: number;
  fxParam: number;
  fxb: number;
  fxbParam: number;
}

export interface HivelyPosition {
  track: number[];
  transpose: number[];
}

export interface HivelyModule {
  name: string;
  format: 'HVL' | 'AHX';
  version: number;
  channels: number;
  trackLength: number;
  numTracks: number;
  numInstruments: number;
  numSubsongs: number;
  numPositions: number;
  restartPosition: number;
  speedMultiplier: number;
  defaultTempo: number;
  stereoMode: number;
  mixGain: number;
  positions: HivelyPosition[];
  tracks: HivelyStep[][];
  instruments: HivelyInstrument[];
  subsongs: number[];
}

// ── Text Decoder ─────────────────────────────────────────────────────────────

const textDecoder = new TextDecoder('iso-8859-1');

function readString(buf: Uint8Array, offset: number, maxLen: number): string {
  let end = offset;
  while (end < offset + maxLen && end < buf.length && buf[end] !== 0) end++;
  return textDecoder.decode(buf.subarray(offset, end));
}

// ── AHX Parser ───────────────────────────────────────────────────────────────

function parseAHX(buf: Uint8Array): HivelyModule {
  const version = buf[3];
  const posn = ((buf[6] & 0x0f) << 8) | buf[7];
  const insn = buf[12];
  const ssn = buf[13];
  const trkl = buf[10];
  const trkn = buf[11];
  const channels = 4; // AHX is always 4 channels
  const speedMultiplier = ((buf[6] >> 5) & 3) + 1;
  const restartPosition = Math.min((buf[8] << 8) | buf[9], posn > 0 ? posn - 1 : 0);

  // Validation
  if (posn > 1000 || trkl > 64 || insn > 64) {
    throw new Error(`Invalid AHX file: posn=${posn}, trkl=${trkl}, insn=${insn}`);
  }

  // Default gain table (from replay.c)
  const defgain = [71, 72, 76, 85, 100];
  const defstereo = 2; // Default stereo mode
  const mixGain = (defgain[defstereo] * 256) / 100;

  // Name offset
  const nameOffset = (buf[4] << 8) | buf[5];
  const name = readString(buf, nameOffset, 128);
  let nptr = nameOffset + name.length + 1;

  let bptr = 14;

  // Subsongs
  const subsongs: number[] = [];
  for (let i = 0; i < ssn; i++) {
    let ss = (buf[bptr] << 8) | buf[bptr + 1];
    if (ss >= posn) ss = 0;
    subsongs.push(ss);
    bptr += 2;
  }

  // Positions
  const positions: HivelyPosition[] = [];
  for (let i = 0; i < posn; i++) {
    const track: number[] = [];
    const transpose: number[] = [];
    for (let j = 0; j < channels; j++) {
      track.push(buf[bptr++]);
      // Signed byte
      transpose.push(buf[bptr] > 127 ? buf[bptr] - 256 : buf[bptr]);
      bptr++;
    }
    positions.push({ track, transpose });
  }

  // Tracks
  const hasBlankTrack0 = (buf[6] & 0x80) === 0x80;
  const tracks: HivelyStep[][] = [];

  for (let i = 0; i <= trkn; i++) {
    const steps: HivelyStep[] = [];
    if (hasBlankTrack0 && i === 0) {
      for (let j = 0; j < trkl; j++) {
        steps.push({ note: 0, instrument: 0, fx: 0, fxParam: 0, fxb: 0, fxbParam: 0 });
      }
      tracks.push(steps);
      continue;
    }

    for (let j = 0; j < trkl; j++) {
      // AHX: 3 bytes per step, bit-packed
      const note = (buf[bptr] >> 2) & 0x3f;
      const instrument = ((buf[bptr] & 0x3) << 4) | (buf[bptr + 1] >> 4);
      const fx = buf[bptr + 1] & 0xf;
      const fxParam = buf[bptr + 2];
      steps.push({ note, instrument, fx, fxParam, fxb: 0, fxbParam: 0 });
      bptr += 3;
    }
    tracks.push(steps);
  }

  // Instruments
  const instruments: HivelyInstrument[] = [];
  for (let i = 1; i <= insn; i++) {
    const insName = nptr < buf.length ? readString(buf, nptr, 128) : '';
    nptr += insName.length + 1;

    const volume = buf[bptr];
    const filterSpeed = ((buf[bptr + 1] >> 3) & 0x1f) | ((buf[bptr + 12] >> 2) & 0x20);
    const waveLength = buf[bptr + 1] & 0x07;

    const envelope: HivelyEnvelope = {
      aFrames: buf[bptr + 2],
      aVolume: buf[bptr + 3],
      dFrames: buf[bptr + 4],
      dVolume: buf[bptr + 5],
      sFrames: buf[bptr + 6],
      rFrames: buf[bptr + 7],
      rVolume: buf[bptr + 8],
    };

    const filterLowerLimit = buf[bptr + 12] & 0x7f;
    const vibratoDelay = buf[bptr + 13];
    const hardCutReleaseFrames = (buf[bptr + 14] >> 4) & 0x07;
    const hardCutRelease = (buf[bptr + 14] & 0x80) !== 0;
    const vibratoDepth = buf[bptr + 14] & 0x0f;
    const vibratoSpeed = buf[bptr + 15];
    const squareLowerLimit = buf[bptr + 16];
    const squareUpperLimit = buf[bptr + 17];
    const squareSpeed = buf[bptr + 18];
    const filterUpperLimit = buf[bptr + 19] & 0x3f;
    const plistSpeed = buf[bptr + 20];
    const plistLength = buf[bptr + 21];

    bptr += 22;

    // Performance list entries (4 bytes per entry in AHX)
    const entries: HivelyPerfEntry[] = [];
    for (let j = 0; j < plistLength; j++) {
      let k = (buf[bptr] >> 5) & 7;
      if (k === 6) k = 12;
      if (k === 7) k = 15;
      let l = (buf[bptr] >> 2) & 7;
      if (l === 6) l = 12;
      if (l === 7) l = 15;

      const waveform = ((buf[bptr] << 1) & 6) | (buf[bptr + 1] >> 7);
      const fixed = ((buf[bptr + 1] >> 6) & 1) !== 0;
      const note = buf[bptr + 1] & 0x3f;
      const fxParam0 = buf[bptr + 2];
      const fxParam1 = buf[bptr + 3];

      // Strip toggle-filter commands for version 0 (pre-filters) — 1:1 with replay.c
      let fp0 = fxParam0;
      let fp1 = fxParam1;
      if (version === 0 && l === 4 && (fxParam0 & 0xf0) !== 0) fp0 &= 0x0f;
      if (version === 0 && k === 4 && (fxParam1 & 0xf0) !== 0) fp1 &= 0x0f;

      entries.push({
        note,
        waveform,
        fixed,
        fx: [l, k],
        fxParam: [fp0, fp1],
      });
      bptr += 4;
    }

    instruments.push({
      name: insName,
      volume,
      waveLength,
      filterLowerLimit,
      filterUpperLimit,
      filterSpeed,
      squareLowerLimit,
      squareUpperLimit,
      squareSpeed,
      vibratoDelay,
      vibratoSpeed,
      vibratoDepth,
      hardCutRelease,
      hardCutReleaseFrames,
      envelope,
      performanceList: { speed: plistSpeed, length: plistLength, entries },
    });
  }

  return {
    name,
    format: 'AHX',
    version,
    channels,
    trackLength: trkl,
    numTracks: trkn,
    numInstruments: insn,
    numSubsongs: ssn,
    numPositions: posn,
    restartPosition,
    speedMultiplier,
    defaultTempo: 6, // AHX default
    stereoMode: defstereo,
    mixGain,
    positions,
    tracks,
    instruments,
    subsongs,
  };
}

// ── HVL Parser ───────────────────────────────────────────────────────────────

function parseHVL(buf: Uint8Array): HivelyModule {
  const version = buf[3];
  const posn = ((buf[6] & 0x0f) << 8) | buf[7];
  const insn = buf[12];
  const ssn = buf[13];
  const chnn = (buf[8] >> 2) + 4;
  const trkl = buf[10];
  const trkn = buf[11];
  const speedMultiplier = ((buf[6] >> 5) & 3) + 1;
  const restartPosition = Math.min(((buf[8] & 3) << 8) | buf[9], posn > 0 ? posn - 1 : 0);
  const mixGain = (buf[14] << 8) / 100;
  const stereoMode = buf[15];

  // Validation
  if (posn > 1000 || trkl > 64 || insn > 64) {
    throw new Error(`Invalid HVL file: posn=${posn}, trkl=${trkl}, insn=${insn}`);
  }

  // Name offset
  const nameOffset = (buf[4] << 8) | buf[5];
  const name = readString(buf, nameOffset, 128);
  let nptr = nameOffset + name.length + 1;

  let bptr = 16;

  // Subsongs
  const subsongs: number[] = [];
  for (let i = 0; i < ssn; i++) {
    subsongs.push((buf[bptr] << 8) | buf[bptr + 1]);
    bptr += 2;
  }

  // Positions
  const positions: HivelyPosition[] = [];
  for (let i = 0; i < posn; i++) {
    const track: number[] = [];
    const transpose: number[] = [];
    for (let j = 0; j < chnn; j++) {
      track.push(buf[bptr++]);
      transpose.push(buf[bptr] > 127 ? buf[bptr] - 256 : buf[bptr]);
      bptr++;
    }
    positions.push({ track, transpose });
  }

  // Tracks — HVL uses variable-length encoding (0x3f = empty step = 1 byte, otherwise 5 bytes)
  const hasBlankTrack0 = (buf[6] & 0x80) === 0x80;
  const tracks: HivelyStep[][] = [];

  for (let i = 0; i <= trkn; i++) {
    const steps: HivelyStep[] = [];
    if (hasBlankTrack0 && i === 0) {
      for (let j = 0; j < trkl; j++) {
        steps.push({ note: 0, instrument: 0, fx: 0, fxParam: 0, fxb: 0, fxbParam: 0 });
      }
      tracks.push(steps);
      continue;
    }

    for (let j = 0; j < trkl; j++) {
      if (buf[bptr] === 0x3f) {
        // Empty step (compressed)
        steps.push({ note: 0, instrument: 0, fx: 0, fxParam: 0, fxb: 0, fxbParam: 0 });
        bptr++;
        continue;
      }

      const note = buf[bptr];
      const instrument = buf[bptr + 1];
      const fx = buf[bptr + 2] >> 4;
      const fxParam = buf[bptr + 3];
      const fxb = buf[bptr + 2] & 0xf;
      const fxbParam = buf[bptr + 4];
      steps.push({ note, instrument, fx, fxParam, fxb, fxbParam });
      bptr += 5;
    }
    tracks.push(steps);
  }

  // Instruments — 22 bytes header + 5 bytes per plist entry
  const instruments: HivelyInstrument[] = [];
  for (let i = 1; i <= insn; i++) {
    const insName = nptr < buf.length ? readString(buf, nptr, 128) : '';
    nptr += insName.length + 1;

    const volume = buf[bptr];
    const filterSpeed = ((buf[bptr + 1] >> 3) & 0x1f) | ((buf[bptr + 12] >> 2) & 0x20);
    const waveLength = buf[bptr + 1] & 0x07;

    const envelope: HivelyEnvelope = {
      aFrames: buf[bptr + 2],
      aVolume: buf[bptr + 3],
      dFrames: buf[bptr + 4],
      dVolume: buf[bptr + 5],
      sFrames: buf[bptr + 6],
      rFrames: buf[bptr + 7],
      rVolume: buf[bptr + 8],
    };

    const filterLowerLimit = buf[bptr + 12] & 0x7f;
    const vibratoDelay = buf[bptr + 13];
    const hardCutReleaseFrames = (buf[bptr + 14] >> 4) & 0x07;
    const hardCutRelease = (buf[bptr + 14] & 0x80) !== 0;
    const vibratoDepth = buf[bptr + 14] & 0x0f;
    const vibratoSpeed = buf[bptr + 15];
    const squareLowerLimit = buf[bptr + 16];
    const squareUpperLimit = buf[bptr + 17];
    const squareSpeed = buf[bptr + 18];
    const filterUpperLimit = buf[bptr + 19] & 0x3f;
    const plistSpeed = buf[bptr + 20];
    const plistLength = buf[bptr + 21];

    bptr += 22;

    // Performance list entries (5 bytes per entry in HVL)
    const entries: HivelyPerfEntry[] = [];
    for (let j = 0; j < plistLength; j++) {
      const fx0 = buf[bptr] & 0xf;
      const fx1 = (buf[bptr + 1] >> 3) & 0xf;
      const waveform = buf[bptr + 1] & 7;
      const fixed = ((buf[bptr + 2] >> 6) & 1) !== 0;
      const note = buf[bptr + 2] & 0x3f;
      const fxParam0 = buf[bptr + 3];
      const fxParam1 = buf[bptr + 4];

      entries.push({
        note,
        waveform,
        fixed,
        fx: [fx0, fx1],
        fxParam: [fxParam0, fxParam1],
      });
      bptr += 5;
    }

    instruments.push({
      name: insName,
      volume,
      waveLength,
      filterLowerLimit,
      filterUpperLimit,
      filterSpeed,
      squareLowerLimit,
      squareUpperLimit,
      squareSpeed,
      vibratoDelay,
      vibratoSpeed,
      vibratoDepth,
      hardCutRelease,
      hardCutReleaseFrames,
      envelope,
      performanceList: { speed: plistSpeed, length: plistLength, entries },
    });
  }

  return {
    name,
    format: 'HVL',
    version,
    channels: chnn,
    trackLength: trkl,
    numTracks: trkn,
    numInstruments: insn,
    numSubsongs: ssn,
    numPositions: posn,
    restartPosition,
    speedMultiplier,
    defaultTempo: 6,
    stereoMode,
    mixGain,
    positions,
    tracks,
    instruments,
    subsongs,
  };
}

// ── Public Parse API ─────────────────────────────────────────────────────────

export function parseHivelyBinary(buffer: ArrayBuffer): HivelyModule {
  const buf = new Uint8Array(buffer);
  if (buf.length < 16) throw new Error('File too small for HVL/AHX format');

  // Detect format by magic bytes
  if (buf[0] === 0x54 && buf[1] === 0x48 && buf[2] === 0x58 && buf[3] < 3) {
    // "THX" = AHX format
    return parseAHX(buf);
  }
  if (buf[0] === 0x48 && buf[1] === 0x56 && buf[2] === 0x4c && buf[3] <= 1) {
    // "HVL" = HVL format
    return parseHVL(buf);
  }

  throw new Error('Not a valid HVL or AHX file (bad magic bytes)');
}

// ── Convert HivelyModule → TrackerSong ───────────────────────────────────────

/**
 * HVL effect → XM-compatible effect mapping.
 *
 * Most effects map directly. HVL-specific ones (Filter Override, Square Offset)
 * are preserved via flag1/flag2 columns.
 */
function mapHvlEffect(hvlFx: number, hvlParam: number): { effTyp: number; eff: number; flag1?: number; flag2?: number; volume?: number } {
  switch (hvlFx) {
    case 0x0: // Position Jump HI — stored as metadata, or map to 0 (arpeggio) if param=0
      if (hvlParam === 0) return { effTyp: 0, eff: 0 };
      // Position Jump HI nibble — combine with 0xB if it appears
      return { effTyp: 0, eff: 0 }; // Arpeggio if no high bits
    case 0x1: return { effTyp: 0x01, eff: hvlParam }; // Portamento Up
    case 0x2: return { effTyp: 0x02, eff: hvlParam }; // Portamento Down
    case 0x3: return { effTyp: 0x03, eff: hvlParam }; // Tone Portamento
    case 0x4: return { effTyp: 0, eff: 0, flag1: hvlParam }; // Filter Override → flag1
    case 0x5: return { effTyp: 0x05, eff: hvlParam }; // Tone Port + Volume Slide
    case 0x6: return { effTyp: 0, eff: 0 }; // Not used in HVL
    case 0x7: // Pan — HVL uses 0-255 range, XM Panning 0x08 uses same
      return { effTyp: 0x08, eff: hvlParam };
    case 0x8: return { effTyp: 0, eff: 0 }; // Not used
    case 0x9: return { effTyp: 0, eff: 0, flag2: hvlParam }; // Square Offset → flag2
    case 0xA: return { effTyp: 0x0A, eff: hvlParam }; // Volume Slide
    case 0xB: return { effTyp: 0x0B, eff: hvlParam }; // Position Jump
    case 0xC: return { effTyp: 0, eff: 0, volume: hvlParam }; // Set Volume → volume column
    case 0xD: return { effTyp: 0x0D, eff: hvlParam }; // Pattern Break
    case 0xE: return { effTyp: 0x0E, eff: hvlParam }; // Extended effects (sub-effects map 1:1)
    case 0xF: return { effTyp: 0x0F, eff: hvlParam }; // Set Speed
    default: return { effTyp: 0, eff: 0 };
  }
}

/**
 * Convert a parsed HivelyModule to a TrackerSong for the TrackerReplayer.
 * Flattens the per-channel pattern matrix into combined patterns.
 */
export function convertHivelyToTrackerSong(mod: HivelyModule, fileName: string): TrackerSong {
  const numChannels = mod.channels;
  const trackLength = mod.trackLength;

  // ── Flatten per-channel pattern matrix into combined patterns ──
  // Each position gets one combined pattern. Each channel's track is looked up
  // by index, transposed, and written into the combined pattern.

  const patterns: Pattern[] = [];

  for (let posIdx = 0; posIdx < mod.numPositions; posIdx++) {
    const pos = mod.positions[posIdx];

    const channels = Array.from({ length: numChannels }, (_, ch) => {
      const trackIdx = pos.track[ch];
      const transpose = pos.transpose[ch];
      const track = mod.tracks[trackIdx];

      const rows: TrackerCell[] = [];
      for (let row = 0; row < trackLength; row++) {
        const step = track?.[row] ?? { note: 0, instrument: 0, fx: 0, fxParam: 0, fxb: 0, fxbParam: 0 };

        // Apply transpose to note (skip empty notes where note=0)
        let xmNote = 0;
        if (step.note > 0 && step.note <= 60) {
          // HVL note 1-60 → XM note (semitone-based)
          // HVL note 1 = C-0, XM note 1 = C-0
          xmNote = step.note + transpose;
          if (xmNote < 1) xmNote = 1;
          if (xmNote > 96) xmNote = 96;
        }

        // Map primary effect
        const fx1 = mapHvlEffect(step.fx, step.fxParam);
        // Map secondary effect
        const fx2 = mapHvlEffect(step.fxb, step.fxbParam);

        const cell: TrackerCell = {
          note: xmNote,
          instrument: step.instrument,
          volume: fx1.volume ?? fx2.volume ?? 0,
          effTyp: fx1.effTyp,
          eff: fx1.eff,
          effTyp2: fx2.effTyp,
          eff2: fx2.eff,
        };

        // Preserve HVL-specific effects in flag columns
        if (fx1.flag1 !== undefined) cell.flag1 = fx1.flag1;
        if (fx1.flag2 !== undefined) cell.flag2 = fx1.flag2;
        if (fx2.flag1 !== undefined && cell.flag1 === undefined) cell.flag1 = fx2.flag1;
        if (fx2.flag2 !== undefined && cell.flag2 === undefined) cell.flag2 = fx2.flag2;

        rows.push(cell);
      }

      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
        rows,
      };
    });

    patterns.push({
      id: `pattern-${posIdx}`,
      name: `Position ${posIdx}`,
      length: trackLength,
      channels,
      importMetadata: {
        sourceFormat: mod.format,
        sourceFile: fileName,
        importedAt: new Date().toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: mod.numPositions,
        originalInstrumentCount: mod.numInstruments,
      },
    });
  }

  // ── Convert instruments ──
  const instruments: InstrumentConfig[] = mod.instruments.map((ins, idx) => ({
    id: idx + 1,
    name: ins.name || `Instrument ${idx + 1}`,
    type: 'synth' as const,
    synthType: 'HivelySynth' as const,
    effects: [],
    volume: -6,
    pan: 0,
    hively: {
      volume: ins.volume,
      waveLength: ins.waveLength,
      filterLowerLimit: ins.filterLowerLimit,
      filterUpperLimit: ins.filterUpperLimit,
      filterSpeed: ins.filterSpeed,
      squareLowerLimit: ins.squareLowerLimit,
      squareUpperLimit: ins.squareUpperLimit,
      squareSpeed: ins.squareSpeed,
      vibratoDelay: ins.vibratoDelay,
      vibratoSpeed: ins.vibratoSpeed,
      vibratoDepth: ins.vibratoDepth,
      hardCutRelease: ins.hardCutRelease,
      hardCutReleaseFrames: ins.hardCutReleaseFrames,
      envelope: { ...ins.envelope },
      performanceList: {
        speed: ins.performanceList.speed,
        entries: ins.performanceList.entries.map(e => ({
          note: e.note,
          waveform: e.waveform,
          fixed: e.fixed,
          fx: [...e.fx] as [number, number],
          fxParam: [...e.fxParam] as [number, number],
        })),
      },
    },
  })) as InstrumentConfig[];

  // ── Build song order (sequential: 0, 1, 2, ...) ──
  const songPositions = Array.from({ length: mod.numPositions }, (_, i) => i);

  // ── Determine format-specific settings ──
  const format: TrackerFormat = mod.format as TrackerFormat;

  // Build native HivelyTracker data for format-specific editor
  const hivelyNative = buildHivelyNativeData(mod);

  return {
    name: mod.name || fileName.replace(/\.[^/.]+$/, ''),
    format,
    patterns,
    instruments,
    songPositions,
    songLength: mod.numPositions,
    restartPosition: mod.restartPosition,
    numChannels,
    initialSpeed: mod.defaultTempo,
    initialBPM: 125 * mod.speedMultiplier,
    linearPeriods: false, // HVL/AHX always use Amiga periods
    hivelyMeta: {
      stereoMode: mod.stereoMode,
      mixGain: mod.mixGain,
      speedMultiplier: mod.speedMultiplier,
      version: mod.version,
    },
    hivelyNative,
  };
}

/**
 * Build HivelyNativeData from parsed module for the format-specific editor.
 * Preserves reusable track pool and position-level transpose.
 */
function buildHivelyNativeData(mod: HivelyModule): HivelyNativeData {
  // Convert tracks: mod.tracks is HivelyStep[][] (array of track arrays)
  const tracks: HivelyNativeTrack[] = mod.tracks.map((steps, id) => ({
    id,
    steps: steps.map(step => ({
      note: step.note,
      instrument: step.instrument,
      fx: step.fx,
      fxParam: step.fxParam,
      fxb: step.fxb,
      fxbParam: step.fxbParam,
    })),
  }));

  // Convert positions: mod.positions is HivelyPosition[]
  const positions: HivelyNativePosition[] = mod.positions.map(pos => ({
    track: [...pos.track],
    transpose: [...pos.transpose],
  }));

  return {
    channels: mod.channels,
    trackLength: mod.trackLength,
    tracks,
    positions,
    tempo: mod.defaultTempo,
    speedMultiplier: mod.speedMultiplier,
  };
}

/**
 * Parse a .hvl or .ahx file and return a TrackerSong.
 */
export function parseHivelyFile(buffer: ArrayBuffer, fileName: string): TrackerSong {
  const mod = parseHivelyBinary(buffer);
  const song = convertHivelyToTrackerSong(mod, fileName);
  // Preserve raw binary so HivelyEngine WASM can load the full tune for playback
  song.hivelyFileData = buffer.slice(0);
  return song;
}

/**
 * Parse a .ahi standalone instrument file (THXI = AHX format, HVLI = HVL format).
 * Returns the HivelyConfig and instrument name.
 */
export function parseAhiFile(buffer: ArrayBuffer): { config: HivelyConfig; name: string } {
  const buf = new Uint8Array(buffer);
  if (buf.length < 26) throw new Error('Invalid .ahi file: too short');

  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== 'THXI' && magic !== 'HVLI') {
    throw new Error(`Invalid .ahi magic: "${magic}"`);
  }
  const isAHX = magic === 'THXI';

  // Instrument header at bytes 4–25 (same bit layout as in HVL/AHX song files)
  const b = 4; // base offset
  const volume           = buf[b + 0];
  const filterSpeed      = ((buf[b + 1] >> 3) & 0x1f) | ((buf[b + 12] >> 2) & 0x20);
  const waveLength       = buf[b + 1] & 0x07;
  const envelope = {
    aFrames: buf[b + 2], aVolume: buf[b + 3],
    dFrames: buf[b + 4], dVolume: buf[b + 5],
    sFrames: buf[b + 6], rFrames: buf[b + 7], rVolume: buf[b + 8],
  };
  const filterLowerLimit      = buf[b + 12] & 0x7f;
  const vibratoDelay          = buf[b + 13];
  const hardCutRelease        = (buf[b + 14] & 0x80) !== 0;
  const hardCutReleaseFrames  = (buf[b + 14] >> 4) & 0x07;
  const vibratoDepth          = buf[b + 14] & 0x0f;
  const vibratoSpeed          = buf[b + 15];
  const squareLowerLimit      = buf[b + 16];
  const squareUpperLimit      = buf[b + 17];
  const squareSpeed           = buf[b + 18];
  const filterUpperLimit      = buf[b + 19] & 0x3f;
  const plistSpeed            = buf[b + 20];
  const plistLength           = buf[b + 21];

  let off = 26; // after 4-byte magic + 22-byte header
  const plistEntrySize = isAHX ? 4 : 5;

  if (buf.length < off + plistLength * plistEntrySize) {
    throw new Error('Invalid .ahi file: truncated plist data');
  }

  const entries: HivelyConfig['performanceList']['entries'] = [];
  for (let j = 0; j < plistLength; j++) {
    if (isAHX) {
      let fx1 = (buf[off] >> 5) & 7;
      if (fx1 === 6) fx1 = 12;
      if (fx1 === 7) fx1 = 15;
      let fx0 = (buf[off] >> 2) & 7;
      if (fx0 === 6) fx0 = 12;
      if (fx0 === 7) fx0 = 15;
      const waveform = ((buf[off] << 1) & 6) | (buf[off + 1] >> 7);
      const fixed = ((buf[off + 1] >> 6) & 1) !== 0;
      const note = buf[off + 1] & 0x3f;
      entries.push({ note, waveform, fixed, fx: [fx0, fx1], fxParam: [buf[off + 2], buf[off + 3]] });
      off += 4;
    } else {
      const fx0 = buf[off] & 0x0f;
      const fx1 = (buf[off + 1] >> 3) & 0x0f;
      const waveform = buf[off + 1] & 0x07;
      const fixed = ((buf[off + 2] >> 6) & 1) !== 0;
      const note = buf[off + 2] & 0x3f;
      entries.push({ note, waveform, fixed, fx: [fx0, fx1], fxParam: [buf[off + 3], buf[off + 4]] });
      off += 5;
    }
  }

  // Null-terminated name at end
  let nameEnd = off;
  while (nameEnd < buf.length && buf[nameEnd] !== 0) nameEnd++;
  const name = new TextDecoder().decode(buf.slice(off, nameEnd));

  return {
    name,
    config: {
      volume, waveLength, filterSpeed,
      filterLowerLimit, filterUpperLimit,
      squareLowerLimit, squareUpperLimit, squareSpeed,
      vibratoDelay, vibratoSpeed, vibratoDepth,
      hardCutRelease, hardCutReleaseFrames,
      envelope,
      performanceList: { speed: plistSpeed, entries },
    },
  };
}
