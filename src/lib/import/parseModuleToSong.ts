/**
 * parseModuleToSong - Shared module file → TrackerSong converter
 *
 * Used by both the main tracker view (App.tsx) and the DJ file browser.
 * Handles all supported formats: MOD, XM, IT, S3M, Furnace, DefleMask, MIDI.
 * Returns a self-contained TrackerSong ready for a TrackerReplayer.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, InstrumentConfig } from '@/types';

/**
 * Parse a tracker module file and return a TrackerSong.
 * Handles .fur, .dmf, .mod, .xm, .it, .s3m, .mid, and other libopenmpt formats.
 */
export async function parseModuleToSong(file: File): Promise<TrackerSong> {
  const filename = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  // ── MIDI ──────────────────────────────────────────────────────────────────
  if (filename.endsWith('.mid') || filename.endsWith('.midi')) {
    return parseMIDIFile(file);
  }

  // ── Furnace / DefleMask ─────────────────────────────────────────────────
  if (filename.endsWith('.fur') || filename.endsWith('.dmf')) {
    return parseFurnaceFile(buffer, file.name);
  }

  // ── MOD, XM, IT, S3M, and other tracker formats ────────────────────────
  return parseTrackerModule(buffer, file.name);
}

// ─── MIDI ────────────────────────────────────────────────────────────────────

async function parseMIDIFile(file: File): Promise<TrackerSong> {
  const { importMIDIFile } = await import('@lib/import/MIDIImporter');
  const result = await importMIDIFile(file, { quantize: 1, mergeChannels: false, velocityToVolume: true, defaultPatternLength: 64 });

  const order = result.patterns.map((_, i) => i);
  return {
    name: result.metadata.name,
    format: 'XM' as TrackerFormat,
    patterns: result.patterns,
    instruments: result.instruments,
    songPositions: order,
    songLength: order.length,
    restartPosition: 0,
    numChannels: result.patterns[0]?.channels?.length || 1,
    initialSpeed: 6,
    initialBPM: result.bpm,
  };
}

// ─── Furnace / DefleMask ──────────────────────────────────────────────────────

async function parseFurnaceFile(buffer: ArrayBuffer, _fileName: string): Promise<TrackerSong> {
  const { parseFurnaceSong, convertFurnaceToDevilbox } = await import('@lib/import/formats/FurnaceSongParser');
  const { convertToInstrument } = await import('@lib/import/InstrumentConverter');

  const module = await parseFurnaceSong(buffer);
  const result = convertFurnaceToDevilbox(module);

  const instruments = result.instruments
    .map((inst, idx) => convertToInstrument(inst, idx + 1, 'FUR'))
    .flat()
    .map((inst, i) => ({ ...inst, id: i + 1 })) as InstrumentConfig[];

  const patternOrder = result.metadata.modData?.patternOrderTable || [];
  const patterns = result.patterns;
  const patLen = patterns[0]?.length || 64;
  const numChannels = patterns[0]?.[0]?.length || 4;

  interface FurnaceCell { note?: number; instrument?: number; volume?: number; effectType?: number; effectParam?: number; effectType2?: number; effectParam2?: number }
  const convertedPatterns: Pattern[] = patterns.map((pat: FurnaceCell[][], idx: number) => ({
    id: `pattern-${idx}`,
    name: `Pattern ${idx}`,
    length: patLen,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: pat.map((row: FurnaceCell[]) => {
        const cell = row[ch] || {};
        return {
          note: cell.note || 0,
          instrument: cell.instrument || 0,
          volume: cell.volume || 0,
          effTyp: cell.effectType || 0,
          eff: cell.effectParam || 0,
          effTyp2: cell.effectType2 || 0,
          eff2: cell.effectParam2 || 0,
        };
      }),
    })),
  }));

  const furnaceData = result.metadata.furnaceData;
  return {
    name: result.metadata.sourceFile.replace(/\.[^/.]+$/, ''),
    format: 'XM' as TrackerFormat,
    patterns: convertedPatterns,
    instruments,
    songPositions: patternOrder.length > 0 ? patternOrder : convertedPatterns.map((_, i) => i),
    songLength: patternOrder.length || convertedPatterns.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: result.metadata.modData?.initialSpeed ?? 6,
    initialBPM: result.metadata.modData?.initialBPM ?? 125,
    speed2: furnaceData?.speed2,
    hz: furnaceData?.hz,
    virtualTempoN: furnaceData?.virtualTempoN,
    virtualTempoD: furnaceData?.virtualTempoD,
    compatFlags: furnaceData?.compatFlags as Record<string, unknown> | undefined,
    grooves: furnaceData?.grooves,
  };
}

// ─── MOD / XM / IT / S3M / etc. ──────────────────────────────────────────────

async function parseTrackerModule(buffer: ArrayBuffer, fileName: string): Promise<TrackerSong> {
  const { loadModuleFile } = await import('@lib/import/ModuleLoader');
  const { convertModule, convertXMModule, convertMODModule } = await import('@lib/import/ModuleConverter');
  const { convertToInstrument } = await import('@lib/import/InstrumentConverter');

  const moduleInfo = await loadModuleFile(new File([buffer], fileName));
  if (!moduleInfo) throw new Error(`Failed to load ${fileName}`);

  let result;
  let instruments: InstrumentConfig[] = [];

  if (moduleInfo.nativeData?.patterns) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { format, patterns: nativePatterns, importMetadata, instruments: nativeInstruments } = moduleInfo.nativeData;
    const channelCount = importMetadata.originalChannelCount;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instrumentNames = nativeInstruments?.map((i: any) => i.name) || [];

    if (format === 'XM') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = convertXMModule(nativePatterns as any, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
    } else if (format === 'MOD') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = convertMODModule(nativePatterns as any, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
    } else if (moduleInfo.metadata.song) {
      result = convertModule(moduleInfo.metadata.song);
    }

    if (nativeInstruments) {
      for (let i = 0; i < nativeInstruments.length; i++) {
        // Use original 1-based slot index as instrument ID so pattern data
        // references (which use original module slot numbers) match correctly.
        // Empty slots return [] and are skipped, but non-empty ones keep their slot ID.
        const slotId = i + 1;
        const converted = convertToInstrument(nativeInstruments[i], slotId, format);
        instruments.push(...converted);
      }
    }
  } else if (moduleInfo.metadata.song) {
    result = convertModule(moduleInfo.metadata.song);
  }

  if (!result) throw new Error(`Failed to convert ${fileName}`);

  // Create basic synth instruments if none from native parser
  if (instruments.length === 0) {
    instruments = createFallbackInstruments(result.patterns, result.instrumentNames || []);
  }

  const modData = result.metadata?.modData;
  const order = result.order?.length ? result.order : result.patterns.map((_, i) => i);
  const format: TrackerFormat = (result.metadata?.sourceFormat as TrackerFormat) || 'XM';

  return {
    name: moduleInfo.metadata.title || fileName.replace(/\.[^/.]+$/, ''),
    format,
    patterns: result.patterns,
    instruments,
    songPositions: order,
    songLength: modData?.songLength ?? order.length,
    restartPosition: 0,
    numChannels: result.channelCount || result.patterns[0]?.channels?.length || 4,
    initialSpeed: modData?.initialSpeed ?? 6,
    initialBPM: modData?.initialBPM ?? 125,
  };
}

// ─── Fallback instrument creation ─────────────────────────────────────────────

function createFallbackInstruments(patterns: Pattern[], instrumentNames: string[]): InstrumentConfig[] {
  const usedInstruments = new Set<number>();
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (cell.instrument !== null && cell.instrument > 0) {
          usedInstruments.add(cell.instrument);
        }
      }
    }
  }

  const oscTypes: Array<'sine' | 'square' | 'sawtooth' | 'triangle'> = ['sawtooth', 'square', 'triangle', 'sine'];
  const instruments: InstrumentConfig[] = [];

  for (const instNum of Array.from(usedInstruments).sort((a, b) => a - b)) {
    instruments.push({
      id: instNum,
      name: instrumentNames[instNum - 1] || `Instrument ${instNum}`,
      type: 'synth',
      synthType: 'Synth',
      effects: [],
      volume: -6,
      pan: 0,
      oscillator: { type: oscTypes[(instNum - 1) % oscTypes.length], detune: 0, octave: 0 },
    } as InstrumentConfig);
  }

  return instruments;
}
