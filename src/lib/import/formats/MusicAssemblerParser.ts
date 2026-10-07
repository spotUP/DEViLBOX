/**
 * MusicAssemblerParser.ts — Music Assembler native parser
 *
 * Music Assembler is a 4-channel Amiga tracker format. It has no magic bytes;
 * instead it is identified by scanning M68k 68000 player bytecode for known
 * assembler instruction sequences.
 *
 * Reference: NostalgicPlayer MusicAssemblerWorker.cs (authoritative loader/replayer)
 *
 * Identification (TestModule):
 *   bytes[0]=0x60, bytes[1]=0x00, bytes[4]=0x60, bytes[5]=0x00,
 *   bytes[8]=0x60, bytes[9]=0x00, bytes[12]=0x48, bytes[13]=0xe7
 *   + ExtractInfoFromInitFunction succeeds
 *   + ExtractInfoFromPlayFunction succeeds
 *
 * Offset extraction (mirrors ExtractInfoFromInitFunction + ExtractInfoFromPlayFunction):
 *   startOfInit = s16(bytes[2..3]) + 2
 *   CMPI.W (0xb0 0x7c) → subSongCount from next 2 bytes
 *   LEA.L pc-rel1 (0x49 0xfa) → subSongSpeedOffset = s16(disp) + index + 2
 *   LEA.L pc-rel2 (0x49 0xfb) → subSongPositionListOffset = s8(byte3) + index + 2
 *   startOfPlay = 0x0c
 *   LEA.L (0x43 0xfa) → moduleStartOffset = s16(disp) + index + 2
 *   ADDA.L (0xd3 0xfa) → instrumentInfoOffsetOffset = s16(disp) + index + 2
 *   ADDA.L (0xd5 0xfa) → sampleInfoOffsetOffset = s16(disp) + index + 6
 *   BSR.B (0x61) → index = s8(byte1) + index + 2, then scan for ADDA.L (0xdb 0xfa)
 *   → tracksOffsetOffset = s16(disp) + index + 2
 *
 * Channel map: [0, 3, 1, 2] (non-linear Amiga LRRL assignment)
 *
 * Period table: 48 entries (4 octaves x 12 notes), index 0 = 1712 = note 1 (periodNotes naming).
 *
 * The grid is the player's walk (maWalk.ts, held to the original 68k player in UADE by
 * musicAssemblerWalkMatchesPlayer.test.ts) drawn by maGrid.ts; the module's tables are read by maModule.ts.
 *
 * Position list: 2 bytes per entry. Terminated by TrackNumber 0xff or 0xfe.
 *   byte0 = TrackNumber
 *   byte1 encodes: val = (byte1 << 4) & 0xffff
 *     transpose     = (val >> 8) & 0xff
 *     repeatRaw     = (val & 0xff) >> 1
 *     repeatCounter = s8(repeatRaw)
 *
 * Track encoding: variable-length, 2–4 bytes per event. Terminated by 0xff.
 *   if (b0 & 0x80):
 *     if (b0 & 0x40): read b1, b2. if (b2 & 0x80): read b3.  → 3 or 4 bytes
 *     else: (just b0, done for this event)                     → 1 byte
 *   else:
 *     read b1. if (b1 & 0x80): read b2.                        → 2 or 3 bytes
 *
 * Sample info: 24 bytes per sample
 *   offset(s32BE) + length(u16BE) + loopLength(u16BE) + name(16 bytes)
 *   Length and loopLength are in words (multiply by 2 for bytes).
 *   length <= 128 words → synthesis (no PCM); length > 128 words → PCM sample.
 *   Loop: loopStart = (length - loopLength) * 2, loopLength * 2 bytes.
 *
 * Instrument info: 16 bytes per instrument (12 fields + 4 pad)
 *   SampleNumber(1), Attack(1), Decay_Sustain(1), VibratoDelay(1),
 *   Release(1), VibratoSpeed(1), VibratoLevel(1), Arpeggio(1),
 *   FxArp_SpdLp(1), Hold(1), Key_WaveRate(1), WaveLevel_Speed(1),
 *   pad(4)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { TrackerCell, InstrumentConfig } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { musicAssemblerEncoder } from '@/engine/uade/encoders/MusicAssemblerEncoder';
import { createSamplerInstrument } from './AmigaUtils';
import { isMusicAssemblerModule, loadMaModule, MA_PAL_CLOCK } from './maModule';
import { walkMusicAssembler } from './maWalk';
import { buildMaGridFromWalk } from './maGrid';

/** PAL sample rate at Amiga C-3 (period 214): 3546895 / (2 × 214) ≈ 8287 Hz. */
const PCM_BASE_RATE = Math.round(MA_PAL_CLOCK / (2 * 214)); // 8287 Hz

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` appears to be a Music Assembler module.
 * Checks M68k player code signature, then attempts full offset extraction.
 */
export function isMusicAssemblerFormat(bytes: Uint8Array): boolean {
  return isMusicAssemblerModule(bytes);
}

// ── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a Music Assembler (.ma) module into a TrackerSong.
 * Returns null if the file is not valid or cannot be parsed.
 */
export function parseMusicAssemblerFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return parseMusicAssembler(bytes, filename);
  } catch {
    return null;
  }
}

function parseMusicAssembler(bytes: Uint8Array, filename: string): TrackerSong | null {
  const m = loadMaModule(bytes);
  if (!m) return null;

  const { samples, subSongs, tracks, numberOfTracks, tracksStartOffset, trackOffsetTable } = m;
  const numberOfInstruments = m.instruments.length;
  const numberOfSamples = samples.length;

  // ── Build InstrumentConfigs ─────────────────────────────────────────────
  const instrumentConfigs: InstrumentConfig[] = [];

  for (let i = 0; i < numberOfInstruments; i++) {
    const instr   = m.instruments[i];
    const instrId = i + 1;
    const sIdx    = instr.sampleNumber;

    if (sIdx >= numberOfSamples || samples[sIdx].dataOffset < 0) {
      // No sample data — placeholder
      instrumentConfigs.push({
        id:         instrId,
        name:       '',
        type:       'synth' as const,
        synthType:  'MusicAssemblerSynth' as const,
        effects:    [],
        volume:     0,
        pan:        0,
        oscillator: { type: 'sawtooth' as const, detune: 0, octave: 0 },
      } as InstrumentConfig);
      continue;
    }

    const si = samples[sIdx];

    if (si.lengthWords > 1 && si.lengthWords <= 128) {
      // Synthesis wavetable — no real PCM; create synth placeholder
      instrumentConfigs.push({
        id:         instrId,
        name:       si.name || '',
        type:       'synth' as const,
        synthType:  'MusicAssemblerSynth' as const,
        effects:    [],
        volume:     0,
        pan:        0,
        oscillator: { type: 'sawtooth' as const, detune: 0, octave: 0 },
      } as InstrumentConfig);
    } else if (si.lengthWords > 128) {
      // PCM sample
      const lengthBytes = si.lengthWords * 2;
      const dataOff     = si.dataOffset;

      if (dataOff + lengthBytes > bytes.length) {
        instrumentConfigs.push({
          id:         instrId,
          name:       si.name || '',
          type:       'synth' as const,
          synthType:  'MusicAssemblerSynth' as const,
          effects:    [],
          volume:     0,
          pan:        0,
          oscillator: { type: 'sawtooth' as const, detune: 0, octave: 0 },
        } as InstrumentConfig);
        continue;
      }

      const pcm = bytes.slice(dataOff, dataOff + lengthBytes);

      // Loop: loopStart = (lengthWords - loopLengthWords) * 2 bytes from start
      let loopStart = 0;
      let loopEnd   = 0;
      if (si.loopLengthWords !== 0) {
        loopStart = (si.lengthWords - si.loopLengthWords) * 2;
        loopEnd   = loopStart + si.loopLengthWords * 2;
      }

      instrumentConfigs.push(
        createSamplerInstrument(instrId, si.name || '', pcm, 64, PCM_BASE_RATE, loopStart, loopEnd)
      );
    } else {
      // Length == 0 or 1 → empty
      instrumentConfigs.push({
        id:         instrId,
        name:       si.name || '',
        type:       'synth' as const,
        synthType:  'MusicAssemblerSynth' as const,
        effects:    [],
        volume:     0,
        pan:        0,
        oscillator: { type: 'sawtooth' as const, detune: 0, octave: 0 },
      } as InstrumentConfig);
    }
  }

  // ── The grid: the player's walk of sub-song 0, or none ───────────────────
  const primarySong = subSongs[0];
  const walk = walkMusicAssembler(m, 0);
  let grid = walk ? buildMaGridFromWalk(walk, m) : null;
  let unmatched: string | undefined;
  if (!walk) unmatched = 'the module has no sub-song to walk';
  else if (walk.stop === 'ended') { unmatched = walk.endReason ?? 'the player ends the song on an event it cannot read'; grid = null; }

  let patterns = grid?.patterns;
  let songPositions = grid?.songPositions;
  if (!patterns || !songPositions) {
    // No guessed grid: the song opens in the scope view (gridUnmatchedReason) over an empty pattern.
    console.warn(`[MusicAssemblerParser] ${filename}: no grid - ${unmatched}`);
    patterns = [{
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 64,
      channels: Array.from({ length: 4 }, (_, chIdx) => ({
        id: `channel-${chIdx}`,
        name: `Channel ${chIdx + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100,
        pan: chIdx === 0 || chIdx === 2 ? -50 : 50,
        instrumentId: null, color: null,
        rows: Array.from({ length: 64 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } as TrackerCell)),
      })),
    }];
    songPositions = [0];
  }
  patterns = patterns.map((pat) => ({
    ...pat,
    importMetadata: {
      sourceFormat: 'MusicAssembler' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: patterns!.length,
      originalInstrumentCount: numberOfInstruments,
    },
  }));

  const baseName = filename.replace(/\.[^/.]+$/, '');

  // ── Build uadeVariableLayout: the tracks, byte-exact ───────────────────────
  // Each file-level track is a variable-length byte stream. Per-byte carrier rows
  // (cutoff=1, period=byte) let the encoder reproduce each track verbatim; the grid
  // above is the walk, which does not map pattern by pattern onto tracks (trackMap
  // is empty: edits are written by maGridEdits.ts from what each cell was drawn from).
  const filePatternAddrs: number[] = [];
  const filePatternSizes: number[] = [];
  const blockRows: TrackerCell[][] = [];
  for (let i = 0; i < numberOfTracks; i++) {
    const trackOff = tracksStartOffset + trackOffsetTable[i];
    filePatternAddrs.push(trackOff >= 0 ? trackOff : 0);
    const trk = tracks[i];
    filePatternSizes.push(trk ? trk.length : 0);
    const cells: TrackerCell[] = [];
    if (trk) {
      for (let b = 0; b < trk.length; b++) {
        cells.push({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          cutoff: 1, period: trk[b] & 0xFF,
        });
      }
    }
    blockRows.push(cells);
  }

  const trackMap: number[][] = patterns.map(() => []);

  const uadeVariableLayout: UADEVariablePatternLayout = {
    formatId: 'musicAssembler',
    numChannels: 4,
    numFilePatterns: numberOfTracks,
    rowsPerPattern: tracks.map((t) => Math.max(t ? t.length : 0, 1)),
    moduleSize: bytes.length,
    encoder: musicAssemblerEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap,
    blockRows,
  };

  return {
    name:            baseName,
    format:          'XM' as TrackerFormat,
    patterns,
    instruments:     instrumentConfigs,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: grid ? grid.layout.restartPosition : 0,
    numChannels:     4,
    initialSpeed:    walk ? walk.speed : (primarySong.startSpeed || 6),
    initialBPM:      125,
    maFileData:      new Uint8Array(bytes).buffer.slice(0) as ArrayBuffer,
    uadeVariableLayout,
    ...(grid ? {} : { gridUnmatchedReason: unmatched ?? 'the grid was not matched to the player' }),
  };
}
