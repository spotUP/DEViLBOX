/**
 * UnifiedFileLoader.ts
 * 
 * Single source of truth for loading ALL file formats in DEViLBOX.
 * Used by both file dialog (FileBrowser) and drag-and-drop (GlobalDragDropHandler).
 * 
 * Eliminates code duplication and ensures consistent behavior across load methods.
 */

import type { InstrumentConfig } from '@/types/instrument';
import type { Pattern } from '@/types';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useAudioStore } from '@/stores/useAudioStore';
import { getToneEngine } from '@/engine/ToneEngine';
import { notify } from '@/stores/useNotificationStore';
import { isSupportedModule } from '@/lib/import/ModuleLoader';
import type { UADEMetadata } from '@engine/uade/UADEEngine';

export interface FileLoadOptions {
  /** Whether to show confirmation dialog before replacing project (song formats only) */
  requireConfirmation?: boolean;
  /** Whether to preserve existing instruments (for additive imports like TD-3 in some UX flows) */
  preserveInstruments?: boolean;
  /** 0-based subsong index for multi-subsong formats (passed to parseModuleToSong) */
  subsong?: number;
  /** Pre-scanned UADE metadata — avoids a redundant scan when the dialog already ran one */
  uadeMetadata?: UADEMetadata;
  /** MIDI-specific import settings (quantize, mergeChannels, etc.) */
  midiOptions?: {
    quantize?: number;
    mergeChannels?: boolean;
    velocityToVolume?: boolean;
    defaultPatternLength?: number;
  };
  /** TD-3: if true, clear existing patterns before importing */
  replacePatterns?: boolean;
}

export type FileLoadResult = 
  | { success: true; message: string }
  | { success: false; error: string }
  | { success: 'pending-confirmation'; file: File };

/**
 * Load any supported file format.
 * Handles state reset, format detection, parsing, and store updates.
 */
export async function loadFile(
  file: File,
  options: FileLoadOptions = {}
): Promise<FileLoadResult> {
  const filename = file.name.toLowerCase();
  
  try {
    // === SONG FORMATS (replace project) ===
    if (isSongFormat(filename)) {
      if (options.requireConfirmation) {
        return { success: 'pending-confirmation', file };
      }
      return await loadSongFile(file, options);
    }

    // === NON-SONG FORMATS (additive/modify) ===
    
    // .dbi - DEViLBOX instrument
    if (filename.endsWith('.dbi')) {
      return await loadInstrumentFile(file);
    }

    // .sunsynth - SunVox patch → show instrument import dialog
    if (filename.endsWith('.sunsynth')) {
      const { useUIStore } = await import('@stores/useUIStore');
      useUIStore.getState().setPendingSunVoxFile(file);
      return { success: true, message: '' };
    }

    // .xml - DB303 preset or pattern
    if (filename.endsWith('.xml')) {
      return await loadXMLFile(file);
    }

    // Audio samples (.wav, .mp3, etc.)
    if (isAudioFile(filename)) {
      return await loadAudioSample(file);
    }

    return { success: false, error: `Unsupported file format: ${file.name}` };

  } catch (error) {
    console.error('[UnifiedFileLoader] Failed to load file:', error);
    return { success: false, error: `Failed to load ${file.name}: ${error}` };
  }
}

/**
 * Check if a file is a "song format" that replaces the entire project.
 */
function isSongFormat(filename: string): boolean {
  return (
    filename.endsWith('.dbx') ||
    filename.endsWith('.mid') ||
    filename.endsWith('.midi') ||
    filename.endsWith('.sqs') ||
    filename.endsWith('.seq') ||
    filename.endsWith('.sunvox') ||
    isSupportedModule(filename)
  );
}

/**
 * Check if a file is an audio sample.
 */
function isAudioFile(filename: string): boolean {
  return /\.(wav|mp3|ogg|flac|aiff?|m4a|iff|8svx)$/i.test(filename);
}

/**
 * Load a song file (replaces entire project).
 */
async function loadSongFile(file: File, options: FileLoadOptions): Promise<FileLoadResult> {
  const { loadPatterns, setPatternOrder, setCurrentPattern, applyEditorMode } = useTrackerStore.getState();
  const { loadInstruments, addInstrument, reset: resetInstruments } = useInstrumentStore.getState();
  const { setBPM, setSpeed, setGrooveTemplate, reset: resetTransport, isPlaying, stop: stopTransport } = useTransportStore.getState();
  const { setMetadata } = useProjectStore.getState();
  const { reset: resetAutomation } = useAutomationStore.getState();
  const engine = getToneEngine();

  const filename = file.name.toLowerCase();

  // Pre-read binary formats before the reset so there is no `await` between
  // resetInstruments() and the subsequent loadPatterns/createInstrument calls.
  // Without this, React flushes after the reset and renders an empty (black) scene.
  let preReadBuffer: ArrayBuffer | null = null;
  let preSunVoxModules: Array<{ name: string; id: number; synthData: ArrayBuffer }> | null = null;

  if (filename.endsWith('.sunvox')) {
    preReadBuffer = await file.arrayBuffer();

    // Try to extract individual modules before the reset so we can create
    // one SunVoxSynth instrument per module (synth mode) instead of loading
    // the whole project as a single song-mode instrument.
    // Wrapped in Promise.race with a 6-second timeout: if the worklet is slow
    // to init or any step hangs, we fall through to song mode rather than
    // blocking the entire load indefinitely.
    try {
      const { SunVoxEngine } = await import('@/engine/sunvox/SunVoxEngine');
      const { getDevilboxAudioContext } = await import('@/utils/audio-context');
      const svEngine = SunVoxEngine.getInstance();

      // Phase 1: wait for WASM to initialise — separate timeout so a slow first-load
      // doesn't eat into the extraction budget.
      console.log('[SunVox] waiting for engine ready…');
      await Promise.race([
        svEngine.ready(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SunVox WASM init timed out')), 20000)
        ),
      ]);
      console.log('[SunVox] engine ready');

      // Phase 2: extraction — timed separately from init.
      const doExtract = async () => {
        const sampleRate = getDevilboxAudioContext().sampleRate;
        const tempHandle = await svEngine.createHandle(sampleRate);
        console.log('[SunVox] temp handle', tempHandle, '— loading song…');
        try {
          // loadSong internally slices the buffer before transfer — preReadBuffer stays intact.
          await svEngine.loadSong(tempHandle, preReadBuffer!);
          console.log('[SunVox] song loaded — fetching module list…');
          const modules = await svEngine.getModules(tempHandle);
          // Module id=0 is always the "Output" bus — skip it.
          const synthModules = modules.filter((m) => m.id > 0);
          console.log('[SunVox] modules:', synthModules.map((m) => `${m.id}:${m.name}`));
          if (synthModules.length > 0) {
            preSunVoxModules = await Promise.all(
              synthModules.map(async (mod) => {
                console.log('[SunVox] saving synth for module', mod.id, mod.name);
                const synthData = await svEngine.saveSynth(tempHandle, mod.id);
                return { name: mod.name, id: mod.id, synthData };
              })
            );
          }
        } finally {
          svEngine.destroyHandle(tempHandle);
        }
      };

      await Promise.race([
        doExtract(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('module extraction timed out')), 10000)
        ),
      ]);
    } catch (err) {
      console.warn('[UnifiedFileLoader] SunVox module extraction failed, falling back to song mode:', err);
      preSunVoxModules = null;
    }
  }

  // === FULL STATE RESET (unless preserveInstruments) ===
  if (isPlaying) stopTransport();
  engine.releaseAll();

  if (!options.preserveInstruments) {
    resetAutomation();
    resetTransport();
    resetInstruments();
    engine.disposeAllInstruments();
  }

  // === .dbx - DEViLBOX project ===
  if (filename.endsWith('.dbx')) {
    const text = await file.text();
    const songData = JSON.parse(text);

    const { needsMigration, migrateProject } = await import('@/lib/migration');
    let patterns = songData.patterns;
    let instruments = songData.instruments;

    if (needsMigration(patterns, instruments)) {
      const migrated = migrateProject(patterns, instruments);
      patterns = migrated.patterns;
      instruments = migrated.instruments;
    }

    loadPatterns(patterns);

    if (songData.sequence && Array.isArray(songData.sequence)) {
      const patternIdToIndex = new Map(patterns.map((p: Pattern, i: number) => [p.id, i]));
      const order = songData.sequence
        .map((patternId: string) => patternIdToIndex.get(patternId))
        .filter((index: number | undefined): index is number => index !== undefined);
      if (order.length > 0) setPatternOrder(order);
    }

    if (instruments) loadInstruments(instruments);
    if (songData.masterEffects) useAudioStore.getState().setMasterEffects(songData.masterEffects);
    setBPM(songData.bpm);
    setMetadata(songData.metadata);
    setGrooveTemplate(songData.grooveTemplateId || 'straight');
    // Reset to classic editor mode — clears stale native state from any
    // previously-loaded musicline/furnace/hively file.
    applyEditorMode({});

    return {
      success: true,
      message: `Loaded: ${songData.metadata?.name || file.name}`
    };
  }

  // === .mid/.midi - MIDI file ===
  if (filename.endsWith('.mid') || filename.endsWith('.midi')) {
    const { importMIDIFile } = await import('@lib/import/MIDIImporter');
    const result = await importMIDIFile(file, {
      quantize: options.midiOptions?.quantize ?? 1,
      mergeChannels: options.midiOptions?.mergeChannels ?? false,
      velocityToVolume: options.midiOptions?.velocityToVolume ?? true,
      defaultPatternLength: options.midiOptions?.defaultPatternLength ?? 64,
    });

    if (result.patterns.length === 0) {
      return { success: false, error: 'No patterns found in MIDI file' };
    }

    loadPatterns(result.patterns);
    if (result.instruments.length > 0) {
      loadInstruments(result.instruments);
    }
    setPatternOrder(result.patterns.map((_: unknown, i: number) => i));
    setCurrentPattern(0);
    setBPM(result.bpm);
    setMetadata({
      name: result.metadata.name,
      author: '',
      description: `Imported from ${file.name} (${result.metadata.tracks} tracks)`,
    });

    return {
      success: true,
      message: `Imported: ${result.metadata.name} — ${result.instruments.length} instrument(s), BPM: ${result.bpm}`
    };
  }

  // === .sqs/.seq - TD-3 pattern files ===
  if (filename.endsWith('.sqs') || filename.endsWith('.seq')) {
    const { parseTD3File } = await import('@lib/import/TD3PatternLoader');
    const { td3StepsToTrackerCells } = await import('@/midi/sysex/TD3PatternTranslator');
    const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');

    const td3File = await parseTD3File(await file.arrayBuffer());
    if (td3File.patterns.length === 0) {
      return { success: false, error: 'No patterns found in TD-3 file' };
    }

    // Find or create TB-303 instrument
    let tb303Instrument: InstrumentConfig;
    if (options.preserveInstruments) {
      const existing = useInstrumentStore.getState().instruments.find(i => i.synthType === 'TB303');
      if (existing) {
        tb303Instrument = existing;
      } else {
        tb303Instrument = createDefaultTB303Instrument();
        addInstrument(tb303Instrument);
      }
    } else {
      tb303Instrument = createDefaultTB303Instrument();
      addInstrument(tb303Instrument);
    }

    // Convert to tracker patterns
    const currentInstruments = useInstrumentStore.getState().instruments;
    const instrumentIndex = currentInstruments.findIndex(i => i.id === tb303Instrument.id) + 1;

    const importedPatterns = td3File.patterns.map((td3Pattern, idx) => {
      const cells = td3StepsToTrackerCells(td3Pattern.steps, 2);
      const patternLength = td3Pattern.length || 16;
      return {
        id: `td3-${Date.now()}-${idx}`,
        name: td3Pattern.name || `TD-3 Pattern ${idx + 1}`,
        length: patternLength,
        channels: [{
          id: `ch-${tb303Instrument.id}-${idx}`,
          name: 'TB-303',
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: 0,
          instrumentId: tb303Instrument.id,
          color: '#ec4899',
          rows: cells.slice(0, patternLength).map(cell => ({
            ...cell,
            instrument: cell.note ? instrumentIndex : 0
          }))
        }]
      };
    });

    const existingPatterns = options.replacePatterns ? [] : useTrackerStore.getState().patterns;
    const allPatterns = [...existingPatterns, ...importedPatterns];
    loadPatterns(allPatterns);
    setCurrentPattern(existingPatterns.length);
    setPatternOrder(allPatterns.map((_, i) => i));

    return {
      success: true,
      message: `Imported ${importedPatterns.length} TD-3 pattern(s)`
    };
  }

  // === .sunvox - SunVox project (replace project) ===
  if (filename.endsWith('.sunvox')) {
    // preReadBuffer was populated before the reset — no await here, preventing
    // React from flushing an empty scene between reset and data load.
    const name = file.name.replace(/\.sunvox$/i, '');
    const PATTERN_LEN = 256;
    const emptyRow = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    // TypeScript can't track mutations of let-bindings inside async closures,
    // so it infers preSunVoxModules as null here. The cast restores the real type.
    type SvoxModule = { name: string; id: number; synthData: ArrayBuffer };
    const extractedModules = preSunVoxModules as SvoxModule[] | null;

    if (extractedModules && extractedModules.length > 0) {
      // Module decomposition mode: one SunVoxSynth (synth mode) per module,
      // one tracker channel per module, each with a trigger note at row 0.
      const now = Date.now();
      const channels = extractedModules.map((mod, idx) => {
        useInstrumentStore.getState().createInstrument({
          name: mod.name,
          synthType: 'SunVoxSynth' as const,
          sunvox: {
            patchData: mod.synthData,
            patchName: mod.name,
            isSong: false,
            controlValues: {} as Record<string, number>,
          },
        });
        const instruments = useInstrumentStore.getState().instruments;
        const instrumentIndex = instruments.length; // 1-based tracker index
        const newInstrument = instruments[instruments.length - 1];
        const rows = Array.from({ length: PATTERN_LEN }, (_, i) =>
          i === 0
            ? { note: 49, instrument: instrumentIndex, volume: 64, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }
            : { ...emptyRow }
        );
        return {
          id: `ch-svox-${now}-${idx}`,
          name: mod.name,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: 0,
          instrumentId: newInstrument.id,
          color: '#facc15',
          rows,
        };
      });

      const pattern = {
        id: `svox-${Date.now()}`,
        name,
        length: PATTERN_LEN,
        channels,
      };
      loadPatterns([pattern]);
      setCurrentPattern(0);
      setPatternOrder([0]);
      setMetadata({ name, author: '', description: `Imported from ${file.name} (${extractedModules.length} modules)` });
      applyEditorMode({});
      return { success: true, message: `Loaded SunVox project: ${name} — ${extractedModules.length} module(s)` };
    }

    // Fallback: song mode — load the whole project as a single instrument.
    const buffer = preReadBuffer!;
    useInstrumentStore.getState().createInstrument({
      name,
      synthType: 'SunVoxSynth' as const,
      sunvox: {
        patchData: buffer,
        patchName: name,
        isSong: true,
        controlValues: {} as Record<string, number>,
      },
    });
    const instruments = useInstrumentStore.getState().instruments;
    const newInstrument = instruments[instruments.length - 1];
    const instrumentIndex = instruments.length; // 1-based tracker index
    const rows = Array.from({ length: PATTERN_LEN }, (_, i) =>
      i === 0
        ? { note: 49, instrument: instrumentIndex, volume: 64, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }
        : { ...emptyRow }
    );
    const pattern = {
      id: `svox-${Date.now()}`,
      name,
      length: PATTERN_LEN,
      channels: [{
        id: `ch-svox-${Date.now()}`,
        name: 'SunVox',
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: newInstrument.id,
        color: '#facc15',
        rows,
      }],
    };
    loadPatterns([pattern]);
    setCurrentPattern(0);
    setPatternOrder([0]);
    setMetadata({ name, author: '', description: `Imported from ${file.name}` });
    // Reset to classic editor mode — clears stale musicline/furnace/hively state
    // from any previously-loaded file (otherwise the wrong viewer renders).
    applyEditorMode({});
    return { success: true, message: `Loaded SunVox project: ${name}` };
  }

  // === All other tracker/module formats ===
  if (isSupportedModule(filename)) {
    const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
    const song = await parseModuleToSong(file, options.subsong ?? 0, options.uadeMetadata);

    loadInstruments(song.instruments);
    loadPatterns(song.patterns);
    setCurrentPattern(0);
    if (song.songPositions.length > 0) setPatternOrder(song.songPositions);
    setBPM(song.initialBPM);
    if (song.initialSpeed !== 6) setSpeed(song.initialSpeed);
    setMetadata({
      name: song.name,
      author: '',
      description: `Imported from ${file.name}`,
    });

    // Set editor mode based on native data availability
    applyEditorMode(song);

    return {
      success: true,
      message: `Imported ${file.name}: ${song.patterns.length} patterns, ${song.instruments.length} instruments`
    };
  }

  return { success: false, error: `Unsupported song format: ${file.name}` };
}

/**
 * Load a .dbi instrument file.
 */
async function loadInstrumentFile(file: File): Promise<FileLoadResult> {
  try {
    // Import and add to project
    const { importInstrument } = await import('@/lib/export/exporters');
    const result = await importInstrument(file);
    const instrument = result?.instrument;

    if (!instrument) {
      return { success: false, error: 'Invalid instrument file' };
    }

    useInstrumentStore.getState().addInstrument(instrument);

    return {
      success: true,
      message: `Imported instrument: ${instrument.name}`
    };
  } catch (error) {
    return { success: false, error: `Failed to load instrument: ${error}` };
  }
}

/**
 * Load a .xml file (DB303 preset or pattern).
 */
async function loadXMLFile(file: File): Promise<FileLoadResult> {
  try {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');

    // Check if it's a DB303 preset or pattern
    if (xmlDoc.querySelector('open303preset')) {
      return await loadDB303Preset(xmlDoc);
    }

    if (xmlDoc.querySelector('db303pattern')) {
      return await loadDB303Pattern(xmlDoc, file.name);
    }

    return { success: false, error: 'Unrecognized XML format' };
  } catch (error) {
    return { success: false, error: `Failed to parse XML: ${error}` };
  }
}

/**
 * Load a DB303 preset from XML.
 */
async function loadDB303Preset(xmlDoc: Document): Promise<FileLoadResult> {
  const { parseDb303Preset } = await import('@/lib/import/Db303PresetConverter');
  const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');

  const preset = parseDb303Preset(xmlDoc.documentElement.outerHTML);

  // Find or create TB-303 instrument
  let tb303 = useInstrumentStore.getState().instruments.find(i => i.synthType === 'TB303');
  if (!tb303) {
    tb303 = createDefaultTB303Instrument();
    useInstrumentStore.getState().addInstrument(tb303);
  }

  // Apply preset
  const updatedConfig = { ...tb303, tb303: { ...tb303.tb303, ...preset } };
  useInstrumentStore.getState().updateInstrument(tb303.id, updatedConfig);

  return {
    success: true,
    message: `Applied DB303 preset to ${tb303.name}`
  };
}

/**
 * Load a DB303 pattern from XML.
 */
async function loadDB303Pattern(xmlDoc: Document, filename: string): Promise<FileLoadResult> {
  const { parseDb303Pattern } = await import('@/lib/import/Db303PatternConverter');
  const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');

  const result = parseDb303Pattern(xmlDoc.documentElement.outerHTML, filename, 1);
  const pattern = result.pattern;
  const tempo = result.tempo;

  // Find or create TB-303 instrument
  let tb303 = useInstrumentStore.getState().instruments.find(i => i.synthType === 'TB303');
  if (!tb303) {
    tb303 = createDefaultTB303Instrument();
    useInstrumentStore.getState().addInstrument(tb303);
  }

  // Update pattern with correct instrument ID
  pattern.channels[0].instrumentId = tb303.id;

  // Append pattern to project
  const { loadPatterns, setPatternOrder, setCurrentPattern } = useTrackerStore.getState();
  const existingPatterns = useTrackerStore.getState().patterns;
  loadPatterns([...existingPatterns, pattern]);
  setCurrentPattern(existingPatterns.length);

  // Set pattern order to loop only the imported pattern
  setPatternOrder([existingPatterns.length]);

  // Apply tempo if present
  if (tempo !== undefined) {
    useTransportStore.getState().setBPM(tempo);
  }

  return {
    success: true,
    message: `Imported DB303 pattern: ${pattern.name}`
  };
}

/**
 * Load an audio sample file.
 */
async function loadAudioSample(file: File): Promise<FileLoadResult> {
  // TODO: Auto-create sample instrument
  // For now, just show a notification
  notify.info(`Audio sample: ${file.name} — Auto-import coming soon. Open instrument editor to add manually.`);
  
  return {
    success: true,
    message: `Recognized audio sample: ${file.name} (manual import required)`
  };
}

