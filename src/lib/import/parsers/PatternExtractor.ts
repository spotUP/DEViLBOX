/**
 * PatternExtractor — shared pattern/instrument extraction logic
 *
 * Contains parseTrackerModule (MOD/XM/IT/S3M via libopenmpt) and fallback
 * instrument creation. Also manages module-level state for pattern hashing.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, InstrumentConfig } from '@/types';
import type { ModuleMetadata } from '@/lib/import/ModuleLoader';
import { extractPatternsFromLibOpenMPT, hashPatterns } from '@/lib/modland/PatternHasher';

// Store the last computed pattern hash and metadata for access by UnifiedFileLoader
let lastPatternHash: string | null = null;
let lastLibOpenMPTMetadata: ModuleMetadata | null = null;

/** Get the pattern hash from the last parsed module (if available) */
export function getLastPatternHash(): string | null {
  return lastPatternHash;
}

/** Get the libopenmpt metadata from the last parsed module (for hash computation) */
export function getLastLibOpenMPTMetadata(): ModuleMetadata | null {
  return lastLibOpenMPTMetadata;
}

export async function parseTrackerModule(buffer: ArrayBuffer, fileName: string): Promise<TrackerSong> {
  // Clear any Furnace module data from previous imports
  import('@engine/furnace-dispatch/FurnaceDispatchEngine').then(({ FurnaceDispatchEngine }) => {
    const engine = FurnaceDispatchEngine.getInstance();
    engine.setModuleWavetables(null);
    engine.setModuleSamples(null);
  }).catch(() => { /* dispatch engine not available — OK for non-Furnace files */ });

  const { loadModuleFile } = await import('@lib/import/ModuleLoader');
  const { convertModule, convertXMModule, convertMODModule } = await import('@lib/import/ModuleConverter');
  const { convertToInstrument } = await import('@lib/import/InstrumentConverter');

  const moduleInfo = await loadModuleFile(new File([buffer], fileName));
  if (!moduleInfo) throw new Error(`Failed to load ${fileName}`);

  // Store libopenmpt metadata for pattern hash computation by UnifiedFileLoader
  lastLibOpenMPTMetadata = moduleInfo.metadata;

  // Compute pattern hash if we have libopenmpt pattern data
  if (moduleInfo.metadata.song) {
    try {
      const patternData = extractPatternsFromLibOpenMPT(moduleInfo.metadata.song);
      const hashBigInt = hashPatterns(patternData);
      lastPatternHash = hashBigInt.toString();
      console.log('[parseModuleToSong] Computed pattern hash:', lastPatternHash);
    } catch (error) {
      console.warn('[parseModuleToSong] Failed to compute pattern hash:', error);
      lastPatternHash = null;
    }
  } else {
    lastPatternHash = null;
  }

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
        // Use the parsed instrument's original slot ID (not array index) so pattern
        // data references match correctly. The MOD/XM parsers skip empty slots, so
        // nativeInstruments[i] may not correspond to slot i+1.
        const slotId = nativeInstruments[i].id;
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

  // Extract XM linear/amiga frequency mode from pattern metadata
  // XM flag bit 0: 1 = linear periods (most XMs), 0 = amiga periods
  const xmFreqType = result.patterns[0]?.importMetadata?.xmData?.frequencyType;
  const linearPeriods = format === 'XM' ? (xmFreqType === 'linear' || xmFreqType === undefined) : false;

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
    linearPeriods,
    // Stamp the raw buffer so downstream wiring can route audio through
    // LibopenmptEngine. Without this, `.mod`/`.xm`/`.it`/`.s3m` imports
    // left the format store's `libopenmptFileData` as null — LibopenmptEngine
    // never got instantiated → `getActiveIsolationEngine()` returned null →
    // every per-channel dub send was a silent no-op. Every other path in
    // AmigaFormatParsers stamps this field; the common-format path did not.
    libopenmptFileData: buffer.slice(0),
  };
}

export function createFallbackInstruments(patterns: Pattern[], instrumentNames: string[]): InstrumentConfig[] {
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
