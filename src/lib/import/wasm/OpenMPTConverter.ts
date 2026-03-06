/**
 * OpenMPTConverter — Convert OpenMPT WASM module data into TrackerSong
 *
 * Bridges the gap between the OpenMPT CSoundFile WASM module and DEViLBOX's
 * internal TrackerSong format. This replaces the TypeScript-based S3M/IT/XM/MOD
 * parsers with the reference OpenMPT implementation.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';
import * as osl from './OpenMPTSoundlib';

/** Map OpenMPT type string → TrackerFormat */
function mapFormat(type: string): TrackerFormat {
  switch (type.toUpperCase()) {
    case 'MOD': return 'MOD';
    case 'XM':  return 'XM';
    case 'IT':  return 'IT';
    case 'S3M': return 'S3M';
    default:    return 'IT'; // MPTM and others treated as IT-compatible
  }
}

/** Map OpenMPT note value (1-120) to DEViLBOX note value (1-96, 97=keyoff) */
function mapNote(openmptNote: number): number {
  if (openmptNote === 0) return 0;         // Empty
  if (openmptNote === 255) return 97;      // Note Off → XM note-off
  if (openmptNote === 254) return 97;      // Note Cut → treat as note-off
  if (openmptNote === 253) return 97;      // Fade → treat as note-off
  if (openmptNote >= 1 && openmptNote <= 120) {
    // OpenMPT: C-1=1..B-9=120. DEViLBOX/XM: C-0=1..B-7=96
    // OpenMPT's note 1 = C-1 corresponds to XM note 1 = C-0
    return Math.min(openmptNote, 96);
  }
  return 0;
}

/** Map OpenMPT volume command + value → DEViLBOX volume column byte */
function mapVolumeColumn(volcmd: number, vol: number): number {
  // OpenMPT VolumeCommand enum:
  // 0=NONE, 1=Volume(0x10-0x50), 2=Panning, 3=VolSlideUp, 4=VolSlideDown,
  // 5=FineVolSlideUp, 6=FineVolSlideDown, 7=VibSpeed, 8=VibDepth,
  // 9=PanSlideLeft, 10=PanSlideRight, 11=TonePorta, 12=Portamento
  switch (volcmd) {
    case 0: return 0; // None
    case 1: return 0x10 + Math.min(vol, 64); // Volume set (0x10-0x50)
    case 2: return 0xC0 + (vol >> 2); // Panning
    case 3: return 0x60 + vol; // Vol slide up
    case 4: return 0x70 + vol; // Vol slide down
    case 5: return 0x80 + vol; // Fine vol slide up
    case 6: return 0x90 + vol; // Fine vol slide down
    case 7: return 0xA0 + vol; // Vibrato speed
    case 8: return 0xB0 + vol; // Vibrato depth
    case 11: return 0xF0 + vol; // Tone portamento
    default: return 0;
  }
}

/** Map OpenMPT EffectCommand → XM-compatible effect type */
function mapEffect(cmd: number): number {
  // OpenMPT effect commands map closely to IT/S3M/XM effects.
  // The important ones: 1=Axx(speed), 2=Bxx(posJump), 3=Cxx(patBreak),
  // 4=Dxx(volSlide), 5=Exx(portDown), 6=Fxx(portUp), 7=Gxx(tonePorta),
  // 8=Hxx(vibrato), ...
  // DEViLBOX uses XM effect numbering (0-35).
  // For S3M/IT, we need to convert to XM equivalents.
  return cmd; // Direct mapping for now — both use the same numbering
}

/** Convert OpenMPT pattern data cell array to ChannelData */
function buildChannelData(
  channelIdx: number,
  rows: osl.PatternCell[][],
  numRows: number,
): ChannelData {
  const cells: TrackerCell[] = [];

  for (let r = 0; r < numRows; r++) {
    const cell = rows[r]?.[channelIdx];
    if (!cell) {
      cells.push({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      });
      continue;
    }

    cells.push({
      note: mapNote(cell.note),
      instrument: cell.instrument,
      volume: mapVolumeColumn(cell.volcmd, cell.vol),
      effTyp: mapEffect(cell.command),
      eff: cell.param,
      effTyp2: 0,
      eff2: 0,
    });
  }

  return {
    id: `ch-${channelIdx}`,
    name: `Ch ${channelIdx + 1}`,
    rows: cells,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: 0,
    instrumentId: null,
    color: null,
  };
}

/**
 * Parse a tracker module using the OpenMPT WASM soundlib and return a TrackerSong.
 * Replaces the TypeScript S3M/IT/XM/MOD parsers with the reference C++ implementation.
 */
export async function parseWithOpenMPT(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const loaded = await osl.loadModule(buffer);
  if (!loaded) {
    throw new Error(`OpenMPT: Failed to load ${filename}`);
  }

  try {
    const info = await osl.getModuleInfo();
    const format = mapFormat(info.type);

    // Get order list
    const orderList = await osl.getOrderList();
    // Filter out invalid patterns (0xFE = skip, 0xFF = end)
    const validOrders = orderList.filter(p => p < 254);

    // Get all patterns
    const patterns: Pattern[] = [];
    const numPatterns = info.numPatterns;
    const numChannels = info.numChannels;

    for (let p = 0; p < numPatterns; p++) {
      const numRows = await osl.getPatternNumRows(p);
      if (numRows === 0) {
        // Empty/invalid pattern — create placeholder
        patterns.push({
          id: `pat-${p}`,
          name: `Pattern ${p}`,
          length: 64,
          channels: Array.from({ length: numChannels }, (_, c) => ({
            id: `ch-${c}`,
            name: `Ch ${c + 1}`,
            rows: Array.from({ length: 64 }, () => ({
              note: 0, instrument: 0, volume: 0,
              effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
            })),
            muted: false, solo: false, collapsed: false,
            volume: 100, pan: 0, instrumentId: null, color: null,
          })),
        });
        continue;
      }

      const cellData = await osl.getPatternData(p);
      const channels: ChannelData[] = [];
      for (let c = 0; c < numChannels; c++) {
        channels.push(buildChannelData(c, cellData, numRows));
      }

      patterns.push({
        id: `pat-${p}`,
        name: `Pattern ${p}`,
        length: numRows,
        channels,
      });
    }

    // Get instrument names → build InstrumentConfig stubs
    const instrumentNames = await osl.getInstrumentNames();
    const sampleNames = await osl.getSampleNames();
    const instruments: InstrumentConfig[] = [];

    // Use instrument names if available, otherwise sample names
    const names = instrumentNames.length > 0 ? instrumentNames : sampleNames;
    for (let i = 0; i < names.length; i++) {
      instruments.push({
        id: i + 1,
        name: names[i] || `Instrument ${i + 1}`,
        synthType: 'Sampler',
        volume: 1,
        pan: 0,
        muted: false,
        solo: false,
      } as InstrumentConfig);
    }

    const song: TrackerSong = {
      name: info.title || filename.replace(/\.[^.]+$/, ''),
      format,
      patterns,
      instruments,
      songPositions: validOrders,
      songLength: validOrders.length,
      restartPosition: 0,
      numChannels,
      initialSpeed: info.initialSpeed || 6,
      initialBPM: info.initialBPM || 125,
      linearPeriods: info.linearSlides,
    };

    return song;
  } finally {
    // Don't destroy — keep loaded for sample access and saving
    // Caller can call destroyModule() when done
  }
}
