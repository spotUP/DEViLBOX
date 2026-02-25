/**
 * parseModuleToSong - Shared module file → TrackerSong converter
 *
 * Used by both the main tracker view (App.tsx) and the DJ file browser.
 * Handles all supported formats: MOD, XM, IT, S3M, Furnace, DefleMask, MIDI,
 * HivelyTracker/AHX, Oktalyzer, OctaMED, DigiBooster, Future Composer, and
 * 130+ exotic Amiga formats via UADE catch-all.
 * Returns a self-contained TrackerSong ready for a TrackerReplayer.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, InstrumentConfig } from '@/types';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';
import { useSettingsStore, type FormatEnginePreferences } from '@/stores/useSettingsStore';
import { isAudioFile } from '@/lib/audioFileUtils';

/** Get current format engine preferences (non-reactive, snapshot read) */
function getFormatEngine(): FormatEnginePreferences {
  return useSettingsStore.getState().formatEngine;
}

/** Check if a filename matches Future Composer extensions */
function isFCFormat(filename: string): boolean {
  return /\.(fc|fc2|fc3|fc4|fc13|fc14|sfc|smod|bfc|bsi)$/.test(filename);
}

/**
 * Parse a tracker module file and return a TrackerSong.
 * Handles .fur, .dmf, .mod, .xm, .it, .s3m, .mid, .hvl, .ahx, .okt, .med,
 * .digi, .fc/.fc14 and many more exotic Amiga formats via UADE.
 *
 * Format engine preferences (Settings → Format Engine) control which parser
 * is used for formats supported by multiple engines (MOD, HVL, MED, FC, etc.).
 */
export async function parseModuleToSong(file: File, subsong = 0, preScannedMeta?: UADEMetadata): Promise<TrackerSong> {
  const filename = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  const prefs = getFormatEngine();

  // ── Regular Audio ─────────────────────────────────────────────────────────
  // If it's a regular audio file (MP3, WAV, etc.), it shouldn't be here.
  // The DJ UI should handle it via DeckAudioPlayer directly.
  if (isAudioFile(file.name)) {
    throw new Error(`Cannot parse ${file.name} as a tracker module: it is a regular audio file.`);
  }

  // ── MIDI ──────────────────────────────────────────────────────────────────
  if (filename.endsWith('.mid') || filename.endsWith('.midi')) {
    return parseMIDIFile(file);
  }

  // ── HivelyTracker / AHX ─────────────────────────────────────────────────
  if (filename.endsWith('.hvl') || filename.endsWith('.ahx')) {
    if (prefs.hvl === 'uade') {
      const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
      return parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
    const { parseHivelyFile } = await import('@lib/import/formats/HivelyParser');
    return parseHivelyFile(buffer, file.name);
  }

  // ── Furnace / DefleMask ─────────────────────────────────────────────────
  if (filename.endsWith('.fur') || filename.endsWith('.dmf')) {
    return parseFurnaceFile(buffer, file.name);
  }

  // ── Oktalyzer ────────────────────────────────────────────────────────────
  if (filename.endsWith('.okt')) {
    if (prefs.okt === 'uade') {
      const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
      return parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
    const { parseOktalyzerFile } = await import('@lib/import/formats/OktalyzerParser');
    return parseOktalyzerFile(buffer, file.name);
  }

  // ── OctaMED / MED ────────────────────────────────────────────────────────
  if (filename.endsWith('.med') || filename.endsWith('.mmd0') || filename.endsWith('.mmd1')
    || filename.endsWith('.mmd2') || filename.endsWith('.mmd3')) {
    if (prefs.med === 'uade') {
      const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
      return parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
    const { parseMEDFile } = await import('@lib/import/formats/MEDParser');
    return parseMEDFile(buffer, file.name);
  }

  // ── DigiBooster ──────────────────────────────────────────────────────────
  if (filename.endsWith('.digi')) {
    if (prefs.digi === 'uade') {
      const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
      return parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
    const { parseDigiBoosterFile } = await import('@lib/import/formats/DigiBoosterParser');
    return parseDigiBoosterFile(buffer, file.name);
  }

  // ── Future Composer ──────────────────────────────────────────────────────
  // FCParser handles FC 1.3 (magic "FC13"/"SMOD") and FC 1.4 (magic "FC14").
  // Future Composer 2 and other FC variants have different magic bytes and
  // fall through to UADE automatically when the native parser rejects them.
  if (isFCFormat(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.fc === 'native') {
      try {
        const { parseFCFile } = await import('@lib/import/formats/FCParser');
        return parseFCFile(buffer, file.name);
      } catch (err) {
        // FC2 / unknown FC variant — native parser doesn't support it, use UADE
        console.warn(`[FCParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── SoundMon (Brian Postma) ─────────────────────────────────────────────
  if (/\.(bp|bp3|sndmon)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.soundmon === 'native') {
      try {
        const { parseSoundMonFile } = await import('@lib/import/formats/SoundMonParser');
        return parseSoundMonFile(buffer, file.name);
      } catch (err) {
        console.warn(`[SoundMonParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── SidMon II ─────────────────────────────────────────────────────────────
  if (/\.(sid2|smn)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.sidmon2 === 'native') {
      try {
        const { parseSidMon2File } = await import('@lib/import/formats/SidMon2Parser');
        return parseSidMon2File(buffer, file.name);
      } catch (err) {
        console.warn(`[SidMon2Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Fred Editor ───────────────────────────────────────────────────────────
  if (/\.fred$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.fred === 'native') {
      try {
        const { parseFredEditorFile } = await import('@lib/import/formats/FredEditorParser');
        return parseFredEditorFile(buffer, file.name);
      } catch (err) {
        console.warn(`[FredEditorParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Sound-FX ──────────────────────────────────────────────────────────────
  if (/\.(sfx|sfx13)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.soundfx === 'native') {
      try {
        const { parseSoundFXFile } = await import('@lib/import/formats/SoundFXParser');
        return parseSoundFXFile(buffer, file.name);
      } catch (err) {
        console.warn(`[SoundFXParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Digital Mugician ──────────────────────────────────────────────────────
  if (/\.(dmu|dmu2|mug|mug2)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.mugician === 'native') {
      try {
        const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
        return parseDigitalMugicianFile(buffer, file.name);
      } catch (err) {
        console.warn(`[DigitalMugicianParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── UADE catch-all: 130+ exotic Amiga formats ───────────────────────────
  // Check extension list first, then fall back to UADE for unknown formats
  // (UADE also detects many formats by magic bytes, not just extension)
  const { isUADEFormat, parseUADEFile } = await import('@lib/import/formats/UADEParser');
  if (isUADEFormat(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    return await parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── MOD, XM, IT, S3M, and other tracker formats ────────────────────────
  // MOD files can be routed to UADE for authentic Amiga playback
  if (filename.endsWith('.mod') && prefs.mod === 'uade') {
    return await parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  try {
    return await parseTrackerModule(buffer, file.name);
  } catch {
    // If libopenmpt fails, try UADE as last resort (magic byte detection)
    return await parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }
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

  // Store module-level wavetables/samples on the dispatch engine singleton.
  // This data is used by FurnaceDispatchSynth.setupDefaultInstrument() to upload
  // real wavetable/sample data instead of test data when chips are created.
  // Must be awaited so the data is available before synths initialize.
  if (result.wavetables.length > 0 || result.samples.length > 0) {
    const { FurnaceDispatchEngine } = await import('@engine/furnace-dispatch/FurnaceDispatchEngine');
    const engine = FurnaceDispatchEngine.getInstance();
    engine.setModuleWavetables(result.wavetables.length > 0 ? result.wavetables : null);
    engine.setModuleSamples(result.samples.length > 0 ? result.samples : null);
  }

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
    furnaceWavetables: result.wavetables.length > 0 ? result.wavetables : undefined,
    furnaceSamples: result.samples.length > 0 ? result.samples : undefined,
    furnaceNative: result.furnaceNative,
  };
}

// ─── MOD / XM / IT / S3M / etc. ──────────────────────────────────────────────

async function parseTrackerModule(buffer: ArrayBuffer, fileName: string): Promise<TrackerSong> {
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
