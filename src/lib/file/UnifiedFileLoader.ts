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
import { useFormatStore } from '@/stores/useFormatStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useAudioStore } from '@/stores/useAudioStore';
import { getToneEngine } from '@/engine/ToneEngine';
import { notify } from '@/stores/useNotificationStore';
import { isSupportedFormat, detectFormat } from '@/lib/import/FormatRegistry';
import { isSupportedModule, type ModuleInfo } from '@/lib/import/ModuleLoader';
import type { ImportOptions } from '@/components/dialogs/ImportModuleDialog';
import type { UADEMetadata } from '@engine/uade/UADEEngine';
import type { SunVoxSongMeta, SunVoxPatternData } from '@/engine/sunvox/SunVoxEngine';
import { checkModlandFile } from '@/lib/modland/ModlandDetector';
import { useModlandContributionModal } from '@/stores/useModlandContributionModal';
import { parseSIDHeader } from '@/lib/sid/SIDHeaderParser';
import { computeSongDBHash, lookupSongDB } from '@/lib/songdb';

import { clearExplicitlySaved } from '@hooks/useProjectPersistence';

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
  /** Companion files (e.g. Sonix .ss/.instr) for multi-file formats */
  companionFiles?: Map<string, ArrayBuffer>;
  /** TD-3: if true, clear existing patterns before importing */
  replacePatterns?: boolean;
}

export type FileLoadResult =
  | { success: true; message: string }
  | { success: false; error: string }
  | { success: 'pending-confirmation'; file: File }
  | { success: 'pending-import'; file: File };

// ─── Unified Tracker Module Import ─────────────────────────────────────────
// THE single import function for all tracker modules (MOD/XM/IT/S3M/FUR/DMF/
// Amiga/UADE/etc.). Called by ImportModuleDialog's onImport callback from both
// DOM and Pixi views. All other import paths are dead — this is the one.

export async function importTrackerModule(
  info: ModuleInfo,
  options: ImportOptions,
): Promise<void> {
  clearExplicitlySaved();

  let format = info.metadata.type;
  
  // Determine if libopenmpt should be used based on format, not dialog options.
  // nativeOnly formats (XRNS, Furnace, chip-dump, etc.) can't use libopenmpt.
  const filename = info.file?.name || '';
  const fmt = detectFormat(filename);
  const useLibopenmpt = options.useLibopenmpt && !fmt?.nativeOnly;
  console.log('[UnifiedFileLoader] importTrackerModule:', filename, 'nativeOnly:', fmt?.nativeOnly, 'useLibopenmpt:', useLibopenmpt);

  // Fire-and-forget SongDB metadata lookup (non-blocking)
  const buf = info.arrayBuffer ?? (info.file ? await info.file.arrayBuffer() : null);
  if (buf) {
    lookupSongDB(computeSongDBHash(buf)).then(result => {
      useFormatStore.getState().setSongDBInfo(result ? {
        authors: result.authors, publishers: result.publishers,
        album: result.album, year: result.year, format: result.format,
        duration_ms: result.subsongs[0]?.duration_ms ?? 0,
      } : null);
    });
    const sidInfo = parseSIDHeader(new Uint8Array(buf));
    useFormatStore.getState().setSidMetadata(sidInfo ? {
      format: sidInfo.format, version: sidInfo.version,
      title: sidInfo.title, author: sidInfo.author, copyright: sidInfo.copyright,
      chipModel: sidInfo.chipModel, clockSpeed: sidInfo.clockSpeed,
      subsongs: sidInfo.subsongs, defaultSubsong: sidInfo.defaultSubsong,
      currentSubsong: options.subsong ?? sidInfo.defaultSubsong,
      secondSID: sidInfo.secondSID, thirdSID: sidInfo.thirdSID,
    } : null);
  } else {
    useFormatStore.getState().setSongDBInfo(null);
    useFormatStore.getState().setSidMetadata(null);
  }

  // Full state reset
  const { loadPatterns, setPatternOrder, setCurrentPattern } = useTrackerStore.getState();
  const { loadInstruments, reset: resetInstruments } = useInstrumentStore.getState();
  const { setBPM, setSpeed, stop, reset: resetTransport } = useTransportStore.getState();
  const { setMetadata } = useProjectStore.getState();
  const { reset: resetAutomation } = useAutomationStore.getState();
  const { setOriginalModuleData, applyEditorMode } = useFormatStore.getState();
  const engine = getToneEngine();

  stop();
  engine.releaseAll();
  resetAutomation();
  resetTransport();
  resetInstruments();
  engine.disposeAllInstruments();

  // ── Try OpenMPT WASM soundlib for PC tracker formats ──
  const isOpenMPTFormat = /^(MOD|XM|IT|S3M)$/i.test(format) || /\.(mod|xm|it|s3m|mptm|mo3|med|mmd[0-3]|okt|okta)$/i.test(info.file?.name || '');
  if (info.arrayBuffer && isOpenMPTFormat) {
    try {
      const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
      const song = await parseWithOpenMPT(info.arrayBuffer, info.file?.name || 'module');
      console.log(`[Import] OpenMPT parsed: ${song.patterns.length} patterns, ${song.instruments.length} instruments, format=${song.format}`);
      loadInstruments(song.instruments);
      loadPatterns(song.patterns);
      setCurrentPattern(0);
      if (song.songPositions.length > 0) setPatternOrder(song.songPositions);
      setOriginalModuleData(null);
      setBPM(song.initialBPM);
      setSpeed(song.initialSpeed);
      setMetadata({ name: song.name, author: '', description: `Imported from ${info.file?.name || 'module'}` });
      applyEditorMode({
        linearPeriods: song.linearPeriods,
        libopenmptFileData: useLibopenmpt ? info.arrayBuffer : undefined,
      });
      const samplerCount = song.instruments.filter(i => i.synthType === 'Sampler').length;
      if (samplerCount > 0) {
        await engine.preloadInstruments(song.instruments);
      }
      notify.success(`Imported "${song.name}" — ${song.patterns.length} patterns, ${song.instruments.length} instruments`);
      if (info.file) checkModlandFileWithPatternHash(info.file, null);
      return;
    } catch (err) {
      console.warn('[Import] OpenMPT WASM parse failed, falling back:', err);
    }
  }

  // ── Native TS parser data (XM/MOD/FUR/DMF from ModuleLoader) ──
  if (info.nativeData) {
    const { convertXMModule, convertMODModule } = await import('@lib/import/ModuleConverter');
    const { convertToInstrument } = await import('@lib/import/InstrumentConverter');
    const { format: nativeFormat, importMetadata, instruments: parsedInstruments, patterns } = info.nativeData;
    format = nativeFormat;

    // Warn if an OpenMPT-compatible format fell through to the old TS parser
    if (isOpenMPTFormat) {
      console.warn(`[Import] WARNING: ${format} file using OLD native TS parser instead of OpenMPT WASM!`);
      notify.warning(`OLD IMPORT PATH: "${info.file?.name || 'module'}" used legacy ${format} parser instead of OpenMPT. Report this!`);
    }

    console.log(`[Import] Using native ${format} parser: ${parsedInstruments.length} instruments, ${patterns.length} patterns`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    if (format === 'XM') {
      result = convertXMModule(
        patterns as any, importMetadata.originalChannelCount,
        importMetadata, parsedInstruments.map(i => i.name),
        useLibopenmpt ? info.arrayBuffer : undefined,
      );
    } else if (format === 'MOD') {
      result = convertMODModule(
        patterns as any, importMetadata.originalChannelCount,
        importMetadata, parsedInstruments.map(i => i.name),
        useLibopenmpt ? info.arrayBuffer : undefined,
      );
    } else if (format === 'FUR' || format === 'DMF') {
      const { getChannelMetadataFromFurnace } = await import('@components/tracker/trackerImportHelpers');
      const patternOrder = importMetadata.modData?.patternOrderTable || [];
      const patLen = patterns[0]?.length || 64;
      const numChannels = importMetadata.originalChannelCount || (patterns[0]?.[0] as unknown[] | undefined)?.length || 4;
      const furnaceData = importMetadata.furnaceData;
      const channelMetadata = (furnaceData?.systems && furnaceData?.systemChans)
        ? getChannelMetadataFromFurnace(furnaceData.systems, furnaceData.systemChans, numChannels, furnaceData.channelShortNames, furnaceData.effectColumns)
        : null;
      result = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patterns: (patterns as any[]).map((pat: any[][], idx: number) => ({
          id: `pattern-${idx}`, name: `Pattern ${idx}`, length: patLen, importMetadata,
          channels: Array.from({ length: numChannels }, (_, ch) => {
            const meta = channelMetadata?.[ch];
            return {
              id: `channel-${ch}`, name: meta?.name || `Channel ${ch + 1}`,
              shortName: meta?.shortName, muted: false, solo: false, collapsed: false,
              volume: 100, pan: 0, instrumentId: null, color: meta?.color || null,
              channelMeta: meta?.channelMeta,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              rows: pat.map((row: any[]) => {
                const cell = row[ch] || {};
                return {
                  note: cell.note || 0, instrument: cell.instrument || 0,
                  volume: cell.volume || 0, effTyp: cell.effectType || 0,
                  eff: cell.effectParam || 0, effTyp2: cell.effectType2 || 0,
                  eff2: cell.effectParam2 || 0,
                  effects: cell.effects?.map((e: { type: number; param: number }) => ({ type: e.type, param: e.param })),
                };
              }),
            };
          }),
        })),
        order: patternOrder.length > 0 ? patternOrder : [0],
        instrumentNames: parsedInstruments.map(i => i.name),
      };
    } else if (format === 'XRNS') {
      // XRNS patterns are already in the correct format from XRNSParser
      const patternOrder = importMetadata.modData?.patternOrderTable || [];
      const patLen = patterns[0]?.length || 64;
      const numChannels = importMetadata.originalChannelCount || (patterns[0]?.[0] as unknown[] | undefined)?.length || 4;
      
      console.log('[Import] XRNS conversion:', {
        patternCount: patterns.length,
        patLen,
        numChannels,
        patternOrder: patternOrder.slice(0, 10),
        firstPatternRows: patterns[0]?.length,
        firstRowCells: (patterns[0]?.[0] as unknown[])?.length,
      });
      
      // Debug: Sample first pattern's data structure
      if (patterns[0]) {
        const firstPat = patterns[0] as unknown[][];
        console.log('[Import] XRNS Pattern 0 sample:', {
          rowCount: firstPat.length,
          row0: firstPat[0],
          row0Type: typeof firstPat[0],
          row0IsArray: Array.isArray(firstPat[0]),
        });
        // Find first non-empty cell
        for (let row = 0; row < Math.min(64, firstPat.length); row++) {
          const rowData = firstPat[row] as { note?: number }[];
          if (Array.isArray(rowData)) {
            for (let ch = 0; ch < rowData.length; ch++) {
              const cell = rowData[ch];
              if (cell?.note && cell.note > 0) {
                console.log(`[Import] XRNS first note found: row=${row} ch=${ch}`, cell);
                break;
              }
            }
          }
        }
      }
      
      result = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patterns: (patterns as any[]).map((pat: any[][], idx: number) => ({
          id: `pattern-${idx}`, name: `Pattern ${idx}`, length: pat.length || patLen, importMetadata,
          channels: Array.from({ length: numChannels }, (_, ch) => ({
            id: `channel-${ch}`, name: `Track ${ch + 1}`,
            muted: false, solo: false, collapsed: false,
            volume: 100, pan: 0, instrumentId: null, color: null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rows: pat.map((row: any[]) => {
              const cell = row[ch] || {};
              return {
                note: cell.note || 0, instrument: cell.instrument || 0,
                volume: cell.volume || 0, effTyp: cell.effTyp || 0,
                eff: cell.eff || 0, effTyp2: 0, eff2: 0,
              };
            }),
          })),
        })),
        order: patternOrder.length > 0 ? patternOrder : [0],
        instrumentNames: parsedInstruments.map(i => i.name),
      };
      
      // Debug: Check if any patterns have notes
      let totalNotes = 0;
      result.patterns.forEach((p: any, pIdx: number) => {
        let patNotes = 0;
        p.channels.forEach((c: any) => {
          c.rows.forEach((r: any) => {
            if (r.note > 0) {
              totalNotes++;
              patNotes++;
            }
          });
        });
        if (pIdx < 5) {
          console.log(`[Import] XRNS Pattern ${pIdx}: ${patNotes} notes, ${p.channels.length} channels, ${p.channels[0]?.rows?.length} rows`);
        }
      });
      console.log('[Import] XRNS total notes in converted patterns:', totalNotes);
    } else {
      result = convertMODModule(
        patterns as any, importMetadata.originalChannelCount,
        importMetadata, parsedInstruments.map(i => i.name),
        useLibopenmpt ? info.arrayBuffer : undefined,
      );
    }

    if (!result.patterns.length) {
      notify.error(`Module "${info.metadata.title}" contains no patterns to import.`);
      return;
    }

    const instruments: InstrumentConfig[] = [];
    let nextId = 1;
    for (const parsed of parsedInstruments) {
      // Debug: log what we're passing to convertToInstrument
      if (parsed.xrnsSynth) {
        console.log(`[Import] Converting XRNS instrument ${nextId}: hasChunk=${!!parsed.xrnsSynth.parameterChunk} chunkLen=${parsed.xrnsSynth.parameterChunk?.length ?? 0}`);
      }
      const converted = convertToInstrument(parsed, nextId, format as any);
      // Debug: log what we got back
      for (const inst of converted) {
        if (inst.xrns) {
          console.log(`[Import] Converted instrument ${inst.id}: synthType=${inst.synthType} xrns.hasChunk=${!!inst.xrns.parameterChunk}`);
        }
      }
      instruments.push(...converted);
      nextId += converted.length;
    }

    loadInstruments(instruments);
    loadPatterns(result.patterns);
    setCurrentPattern(0);
    if (result.order?.length > 0) setPatternOrder(result.order);
    if (result.originalModuleData) setOriginalModuleData(result.originalModuleData);
    else setOriginalModuleData(null);
    setMetadata({ name: info.metadata.title, author: '', description: `Imported from ${info.file?.name || 'module'} (${format})` });
    setBPM(importMetadata.modData?.initialBPM || 125);
    setSpeed(importMetadata.modData?.initialSpeed || 6);

    const xmFreqType = importMetadata?.xmData?.frequencyType;
    const linearPeriods = format === 'XM' ? (xmFreqType === 'linear' || xmFreqType === undefined) : false;
    applyEditorMode({
      linearPeriods,
      furnaceNative: info.nativeData.furnaceNative,
      libopenmptFileData: useLibopenmpt ? info.arrayBuffer : undefined,
    });

    const samplerCount = instruments.filter(i => i.synthType === 'Sampler').length;
    const wasmSynthCount = instruments.filter(i => 
      i.synthType === 'WaveSabreSynth' || 
      i.synthType === 'OidosSynth' || 
      i.synthType === 'TunefishSynth'
    ).length;
    if (samplerCount > 0 || wasmSynthCount > 0) await engine.preloadInstruments(instruments);
    notify.success(`Imported "${info.metadata.title}" — ${result.patterns.length} patterns, ${instruments.length} instruments`);
    if (info.file) checkModlandFileWithPatternHash(info.file, null);
    return;
  }

  // ── UADE / exotic Amiga / parseModuleToSong path ──
  // Also route here when metadata.song exists but has no pattern data.
  // CRITICAL: formats with a nativeParser MUST use parseModuleToSong so their
  // native parser runs and assigns the correct synthType to instruments (e.g.
  // SymphonieSynth, FCSynth). Without this, libopenmpt metadata.song causes
  // the fallback path below to create generic 'Synth' instruments instead.
  const songHasPatterns = (info.metadata.song?.patterns?.length ?? 0) > 0;
  const hasNativeParser = !!fmt?.nativeParser;
  // nativeOnly formats (PxTone, Organya, chip-dump etc.) must always go through
  // parseModuleToSong even if the server returned libopenmpt-parsed metadata.
  const isNativeOnly = !!fmt?.nativeOnly;
  if (!info.metadata.song || !songHasPatterns || hasNativeParser || isNativeOnly) {
    if (hasNativeParser) console.log(`[UnifiedFileLoader] Format has nativeParser — using parseModuleToSong for ${filename}`);
    if (isNativeOnly && !hasNativeParser) console.log(`[UnifiedFileLoader] nativeOnly format — using parseModuleToSong for ${filename}`);
    if (!info.file) {
      notify.error('File reference lost — cannot import');
      return;
    }
    const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
    const song = await parseModuleToSong(info.file, options.subsong ?? 0, options.uadeMetadata, options.midiOptions, options.companionFiles);
    loadInstruments(song.instruments);
    loadPatterns(song.patterns);
    setCurrentPattern(0);
    if (song.songPositions.length > 0) setPatternOrder(song.songPositions);
    // Store BPM/speed metadata so usePatternPlayback can read them via modData
    setOriginalModuleData({
      base64: '',
      format: (song.format || 'UNKNOWN') as 'MOD' | 'XM' | 'IT' | 'S3M' | 'UNKNOWN',
      initialBPM: song.initialBPM,
      initialSpeed: song.initialSpeed,
      songLength: song.songLength,
    } as any);
    setBPM(song.initialBPM);
    setSpeed(song.initialSpeed);
    setMetadata({ name: song.name, author: '', description: `Imported from ${info.file?.name || 'module'}` });
    applyEditorMode(song);
    if (song.c64SidFileData && useFormatStore.getState().editorMode === 'goattracker') {
      const gtStore = (await import('@/stores/useGTUltraStore')).useGTUltraStore.getState();
      const parts = song.name.split(' — ');
      gtStore.setSongName(parts[0] || song.name);
      if (parts[1]) gtStore.setSongAuthor(parts[1]);
      gtStore.setSidCount(song.numChannels > 3 ? 2 : 1);
    }
    const samplerCount = song.instruments.filter(i => i.synthType === 'Sampler').length;
    if (samplerCount > 0) await engine.preloadInstruments(song.instruments);
    notify.success(`Imported "${song.name}" — ${song.patterns.length} patterns, ${song.instruments.length} instruments`);
    if (info.file) checkModlandFileWithPatternHash(info.file, null);
    return;
  }

  // ── Fallback: libopenmpt metadata-based import ──
  const { convertModule } = await import('@lib/import/ModuleConverter');
  const { extractSamples, canExtractSamples } = await import('@lib/import/SampleExtractor');
  const { encodeWav } = await import('@lib/import/WavEncoder');
  const { createInstrumentsForModule } = await import('@components/tracker/trackerImportHelpers');

  const result = convertModule(info.metadata.song);
  if (!result.patterns.length) {
    // convertModule produced no patterns — fall back to parseModuleToSong
    if (info.file) {
      console.warn('[Import] convertModule produced no patterns, trying parseModuleToSong');
      const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
      const song = await parseModuleToSong(info.file, options.subsong ?? 0, options.uadeMetadata, options.midiOptions, options.companionFiles);
      loadInstruments(song.instruments);
      loadPatterns(song.patterns);
      setCurrentPattern(0);
      if (song.songPositions.length > 0) setPatternOrder(song.songPositions);
      setOriginalModuleData(null);
      setBPM(song.initialBPM);
      setSpeed(song.initialSpeed);
      setMetadata({ name: song.name, author: '', description: `Imported from ${info.file?.name || 'module'}` });
      applyEditorMode(song);
      const samplerCount = song.instruments.filter(i => i.synthType === 'Sampler').length;
      if (samplerCount > 0) await engine.preloadInstruments(song.instruments);
      notify.success(`Imported "${song.name}" — ${song.patterns.length} patterns, ${song.instruments.length} instruments`);
      if (info.file) checkModlandFileWithPatternHash(info.file, null);
      return;
    }
    notify.error(`Module "${info.metadata.title}" contains no patterns to import.`);
    return;
  }

  let sampleUrls: Map<number, string> | undefined;
  if (info.file && canExtractSamples(info.file.name)) {
    try {
      const extraction = await extractSamples(info.file);
      sampleUrls = new Map();
      for (let i = 0; i < extraction.samples.length; i++) {
        const sample = extraction.samples[i];
        if (sample.pcmData.length > 0) sampleUrls.set(i + 1, encodeWav(sample));
      }
    } catch (err) {
      console.warn('[Import] Could not extract samples:', err);
    }
  }

  const instruments = createInstrumentsForModule(result.patterns, result.instrumentNames, sampleUrls);
  loadInstruments(instruments);
  loadPatterns(result.patterns);
  setCurrentPattern(0);
  if (result.order?.length > 0) setPatternOrder(result.order);
  setMetadata({ name: info.metadata.title, author: '', description: `Imported from ${info.file?.name || 'module'}` });
  setBPM(125);

  const samplerCount = instruments.filter(i => i.synthType === 'Sampler').length;
  if (samplerCount > 0) await engine.preloadInstruments(instruments);
  notify.success(`Imported "${info.metadata.title}" — ${result.patterns.length} patterns, ${instruments.length} instruments`);
  if (info.file) checkModlandFileWithPatternHash(info.file, null);
}

/**
 * Check Modland with optional pattern hash (from parseModuleToSong)
 * This is called AFTER module parsing so we have the pattern hash available
 */
async function checkModlandFileWithPatternHash(file: File, patternHash: string | null): Promise<void> {
  try {
    const result = await checkModlandFile(file, null); // We don't have libopenmpt meta at this point
    
    // If not found, show contribution modal
    if (!result.found && result.hash && isSongFormat(file.name.toLowerCase())) {
      const { showModal } = useModlandContributionModal.getState();
      showModal(file.name, result.hash);
      console.log('🆕 Unknown module detected (hash: ' + result.hash + ', pattern hash: ' + (patternHash || 'unavailable') + ') - showing contribution modal');
    } else if (result.found && patternHash) {
      // Found in Modland — query for remixes/variations using pattern hash
      try {
        const { findPatternMatches } = await import('@/lib/modlandApi');
        const matches = await findPatternMatches(parseInt(patternHash, 16) || 0);
        if (matches && matches.length > 1) {
          notify.info(`Found ${matches.length - 1} remix${matches.length > 2 ? 'es' : ''} with matching patterns`);
        }
      } catch {
        // Pattern match endpoint may not be deployed yet — silently ignore
      }
    }
  } catch (error) {
    console.debug('[Modland] Hash check failed:', error);
  }
}

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
    // === V2M FILES — handle before isSongFormat check ===
    // V2M has its own player and shouldn't go through the ImportModuleDialog
    if (filename.endsWith('.v2m')) {
      return await loadV2MFile(file);
    }

    // === SONG FORMATS (replace project) ===
    if (isSongFormat(filename)) {
      // TD-3 pattern files need replace/append choice from user
      if ((filename.endsWith('.sqs') || filename.endsWith('.seq')) && options.replacePatterns === undefined) {
        const { useUIStore } = await import('@stores/useUIStore');
        useUIStore.getState().setPendingTD3File(file);
        return { success: 'pending-confirmation', file };
      }

      // GoatTracker .sng files can be detected by magic bytes and always bypass
      // the confirmation dialog — they route directly to the GTUltra engine.
      if (filename.endsWith('.sng')) {
        const { isGoatTrackerSong } = await import('../import/formats/GoatTrackerDetect');
        const buf = await file.arrayBuffer();
        if (isGoatTrackerSong(buf)) {
          return await loadSongFile(file, options);
        }
      }
      // .sunvox files bypass the confirmation dialog — they use their own
      // SunVox engine loading path in loadSongFile, not importTrackerModule.
      if (filename.endsWith('.sunvox')) {
        return await loadSongFile(file, options);
      }
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
    isSupportedFormat(filename)
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
  // Loading an external song — prevent auto-save from overwriting user's saved project
  clearExplicitlySaved();

  const { loadPatterns, setPatternOrder, setCurrentPattern, reset: resetTracker } = useTrackerStore.getState();
  const { applyEditorMode } = useFormatStore.getState();
  const { loadInstruments, addInstrument, reset: resetInstruments } = useInstrumentStore.getState();
  const { setBPM, setGrooveTemplate, reset: resetTransport, isPlaying, stop: stopTransport } = useTransportStore.getState();
  const { setMetadata } = useProjectStore.getState();
  const { reset: resetAutomation } = useAutomationStore.getState();
  const engine = getToneEngine();

  const filename = file.name.toLowerCase();

  // === GoatTracker .sng — detect BEFORE state reset ===
  // GT songs bypass the classic tracker pipeline entirely.  We must detect them
  // before the full state reset below, otherwise instruments are cleared and
  // React flushes a black pattern editor during the async gap.
  if (filename.endsWith('.sng')) {
    const { isGoatTrackerSong } = await import('../import/formats/GoatTrackerDetect');
    const gtBuf = await file.arrayBuffer();
    if (isGoatTrackerSong(gtBuf)) {
      console.log('[UnifiedFileLoader] GoatTracker .sng detected — routing to GTUltra engine');
      // Stop playback but do NOT reset instruments/patterns — GT has its own state
      if (isPlaying) stopTransport();
      engine.releaseAll();

      const { useGTUltraStore } = await import('@/stores/useGTUltraStore');
      const gtStore = useGTUltraStore.getState();

      const songBytes = new Uint8Array(gtBuf);
      if (gtStore.engine) {
        gtStore.engine.loadSong(gtBuf);
        gtStore.setSongName(file.name.replace(/\.sng$/i, ''));
        // Refresh song info which triggers pattern data loading via onSongInfo callback
        gtStore.refreshSongInfo();
        gtStore.refreshAllOrders();
        gtStore.refreshAllInstruments();
        gtStore.refreshAllTables();
      } else {
        gtStore.setPendingSongData(songBytes);
        gtStore.setSongName(file.name.replace(/\.sng$/i, ''));
      }

      // Switch to GoatTracker editor mode
      applyEditorMode({ goatTrackerData: songBytes });

      // Ensure tracker view is visible
      const { useUIStore } = await import('@stores/useUIStore');
      const uiState = useUIStore.getState();
      uiState.setActiveView('tracker');
      uiState.setTrackerViewMode('tracker');


      return {
        success: true,
        message: `Loaded GoatTracker song: ${file.name}`,
      };
    }
  }

  // Pre-read binary formats before the reset so there is no `await` between
  // resetInstruments() and the subsequent loadPatterns/createInstrument calls.
  // Without this, React flushes after the reset and renders an empty (black) scene.
  let preReadBuffer: ArrayBuffer | null = null;
  let preSunVoxModules: Array<{ name: string; id: number; synthData: ArrayBuffer }> | null = null;
  let preSunVoxPatterns: SunVoxPatternData[] | null = null;
  let preSunVoxMeta: SunVoxSongMeta | null = null;
  let preSunVoxGraph: import('@/engine/sunvox/SunVoxEngine').SunVoxModuleGraphEntry[] | null = null;

  if (filename.endsWith('.sunvox')) {
    preReadBuffer = await file.arrayBuffer();

    // Wait for any in-flight shared song load to finish — the worklet processes
    // messages sequentially, so a pending loadSong blocks new createHandle calls.
    // Then reset shared WASM handle from any previous .sunvox song.
    try {
      const { awaitPendingSharedSongLoad, resetSharedSunVoxHandle } = await import('@/engine/sunvox-modular/SunVoxModularSynth');
      await awaitPendingSharedSongLoad();
      resetSharedSunVoxHandle();
    } catch { /* not loaded yet */ }

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
      // The extraction handle is DONATED to the shared song handle instead of
      // being destroyed, avoiding the create/destroy/create cycle which corrupts
      // WASM internal state for some songs.
      const doExtract = async () => {
        const sampleRate = getDevilboxAudioContext().sampleRate;
        const extractHandle = await svEngine.createHandle(sampleRate);
        console.log('[SunVox] extract handle', extractHandle, '— loading song…');
        let extractOk = false;
        try {
          // loadSong internally slices the buffer before transfer — preReadBuffer stays intact.
          preSunVoxMeta = await svEngine.loadSong(extractHandle, preReadBuffer!);
          console.log('[SunVox] song loaded — fetching module list and patterns…');
          const [modules, patterns] = await Promise.all([
            svEngine.getModules(extractHandle),
            svEngine.getPatterns(extractHandle),
          ]);
          preSunVoxPatterns = patterns;
          // getModuleGraph extracts full module types, inputs, outputs, controls
          try {
            preSunVoxGraph = await Promise.race([
              svEngine.getModuleGraph(extractHandle),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getModuleGraph timed out')), 10000)),
            ]);
            console.log('[SunVox] module graph:', preSunVoxGraph?.length, 'entries',
              preSunVoxGraph?.slice(0, 3).map(m => `${m.id}:${m.typeName}:${m.name}`));
          } catch (graphErr) {
            console.warn('[SunVox] Module graph extraction failed:', graphErr);
            preSunVoxGraph = null;
          }
          // Module id=0 is always the "Output" bus — skip it.
          // We only need id/name for channel labelling (no patch extraction needed
          // since audio is driven by the song-mode SunVoxSynth, not per-module synths).
          const synthModules = modules.filter((m) => m.id > 0);
          console.log('[SunVox] modules:', synthModules.map((m) => `${m.id}:${m.name}`));
          console.log('[SunVox] patterns:', patterns.length);
          if (synthModules.length > 0) {
            preSunVoxModules = synthModules.map((mod) => ({
              name: mod.name,
              id: mod.id,
              synthData: new ArrayBuffer(0), // unused — audio from song-mode synth
            }));
          }
          extractOk = true;
        } finally {
          if (extractOk) {
            // Donate the handle — _loadSongShared will reuse it instead of
            // creating a new one (avoids WASM state corruption on handle reuse).
            const { donatePreloadedHandle } = await import('@/engine/sunvox-modular/SunVoxModularSynth');
            donatePreloadedHandle(extractHandle);
            console.log('[SunVox] donated handle', extractHandle, 'for shared playback');
          } else {
            svEngine.destroyHandle(extractHandle);
          }
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

  // TD-3 append mode: skip full reset — the TD-3 handler manages patterns itself
  const isTD3Append = (filename.endsWith('.sqs') || filename.endsWith('.seq')) && options.replacePatterns === false;

  if (!options.preserveInstruments && !isTD3Append) {
    resetAutomation();
    resetTransport();
    resetTracker();
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

    // Filter out empty TD3 patterns (all rests / no notes) — the TD-3 often
    // stores unused initialization patterns at the start of the file.
    const nonEmptyTD3Patterns = td3File.patterns.filter(
      p => p.steps.some(s => s.note !== null)
    );

    if (nonEmptyTD3Patterns.length === 0) {
      return { success: false, error: 'All TD-3 patterns are empty (no notes)' };
    }

    const importedPatterns = nonEmptyTD3Patterns.map((td3Pattern, idx) => {
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

    // Set song metadata when loading as a new song
    if (options.replacePatterns) {
      const songName = file.name.replace(/\.(sqs|seq)$/i, '') || 'TD-3 Patterns';
      setMetadata({
        name: songName,
        author: 'TD-3 Import',
        description: `Imported from ${td3File.name} v${td3File.version}`,
      });
      // Set BPM from first pattern if available
      const firstTempo = td3File.patterns[0]?.tempo;
      if (firstTempo && firstTempo > 0) setBPM(firstTempo);
    }

    return {
      success: true,
      message: `Imported ${importedPatterns.length} TD-3 pattern(s)${
        td3File.patterns.length > importedPatterns.length
          ? ` (${td3File.patterns.length - importedPatterns.length} empty skipped)`
          : ''
      }`
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
      const { sunvoxSubGraphForGenerator, findGeneratorModules } = await import('@/engine/sunvox-modular/graphToConfig');
      const graph = preSunVoxGraph ?? [];

      // Identify generator modules → one instrument each
      const generators = findGeneratorModules(graph);
      // Build SunVox module ID → instrument index (1-based) mapping
      const svModToInstrIdx = new Map<number, number>();

      if (generators.length > 0) {
        for (let g = 0; g < generators.length; g++) {
          const gen = generators[g];
          const subGraph = sunvoxSubGraphForGenerator(graph, gen.id);
          useInstrumentStore.getState().createInstrument({
            name: gen.name || `SV Module ${gen.id}`,
            synthType: 'SunVoxModular' as const,
            sunvoxModular: subGraph,
            sunvox: {
              patchData: preReadBuffer!,
              patchName: name,
              isSong: true,
              noteTargetModuleId: gen.id,
              controlValues: {} as Record<string, number>,
            },
          });
          const insts = useInstrumentStore.getState().instruments;
          svModToInstrIdx.set(gen.id, insts[insts.length - 1].id);
        }
      } else {
        // No generators found — create one song-mode instrument
        useInstrumentStore.getState().createInstrument({
          name,
          synthType: 'SunVoxModular' as const,
          sunvoxModular: { modules: [], connections: [], polyphony: 1, viewMode: 'canvas' as const, backend: 'sunvox' as const },
          sunvox: { patchData: preReadBuffer!, patchName: name, isSong: true, controlValues: {} as Record<string, number> },
        });
      }

      // Select first instrument
      const allInsts = useInstrumentStore.getState().instruments;
      if (allInsts.length > 0) {
        useInstrumentStore.getState().setCurrentInstrument(allInsts[0].id);
      }

      // Build moduleId → name map for channel labelling
      const moduleNameMap = new Map<number, string>(extractedModules.map(m => [m.id, m.name]));

      // Set BPM from metadata if available
      const meta = preSunVoxMeta as SunVoxSongMeta | null;
      const bpm = meta?.bpm;
      if (bpm && bpm > 0) useTransportStore.getState().setBPM(bpm);

      // --- Build DEViLBOX patterns from real SunVox pattern data ---
      // SunVox uses a 2D timeline: patterns at (x, y) where x=time position,
      // y=track offset. Patterns at the same x play simultaneously (different voices).
      const svPatterns = preSunVoxPatterns as SunVoxPatternData[] | null;
      if (svPatterns) {
        const xGroups = new Map<number, number>();
        for (const p of svPatterns) { xGroups.set(p.x, (xGroups.get(p.x) ?? 0) + 1); }
        console.log('[SunVox] pattern layout:', svPatterns.length, 'patterns,',
          xGroups.size, 'unique x positions, tracks per pattern:',
          svPatterns.slice(0, 10).map(p => `pat${p.patIndex} "${p.patName}" x=${p.x} y=${p.y} ${p.tracks}t/${p.lines}l clone=${p.cloneOf}`));
      }
      const channelColors = [
        '#facc15', '#34d399', '#60a5fa', '#f472b6', '#a78bfa',
        '#fb923c', '#38bdf8', '#4ade80', '#e879f9', '#fbbf24',
      ];

      let patternsToLoad;
      if (svPatterns && svPatterns.length > 0) {
        // ── SunVox timeline linearization ──
        // SunVox patterns are placed on a 2D timeline at (x, y). At any time position,
        // ALL patterns whose range [x, x+lines) covers that position play simultaneously.
        // We linearize this into sequential tracker patterns by finding "change points"
        // where the set of active patterns changes.

        // Collect all change points (where any pattern starts or ends)
        const changePoints = new Set<number>();
        for (const p of svPatterns) {
          changePoints.add(p.x);
          changePoints.add(p.x + p.lines);
        }
        const sortedPoints = [...changePoints].sort((a, b) => a - b);

        // Helper: convert a SunVox event to a tracker row
        const eventToRow = (ev: { note: number; vel: number; module: number; ctl: number; ctlVal: number } | undefined, fallbackInstrId: number) => {
          if (!ev || (ev.note === 0 && ev.vel === 0 && ev.module < 0 && ev.ctl === 0)) return { ...emptyRow };
          const volume = ev.vel === 0 ? 0 : Math.max(1, Math.round(ev.vel * 64 / 129));
          const evInstrId = ev.module >= 1 ? (svModToInstrIdx.get(ev.module) ?? fallbackInstrId) : fallbackInstrId;
          const note = ev.note === 128 ? 97 : (ev.note >= 129 ? 0 : ev.note);
          const ee = ev.ctl & 0xFF;
          const cc = (ev.ctl >> 8) & 0xFF;
          return { note, instrument: evInstrId, volume, effTyp: ee, eff: ee > 0 ? ev.ctlVal : 0, effTyp2: cc, eff2: cc > 0 ? ev.ctlVal : 0 };
        };

        // Build tracker patterns for each timeline segment
        patternsToLoad = [];
        for (let s = 0; s < sortedPoints.length - 1; s++) {
          const segStart = sortedPoints[s];
          const segEnd = sortedPoints[s + 1];
          const segLen = segEnd - segStart;
          if (segLen <= 0) continue;

          // Find all active patterns during this segment
          const active = svPatterns.filter(p => p.x < segEnd && p.x + p.lines > segStart);
          if (active.length === 0) continue;

          // Build channels from all active pattern tracks
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const channels: any[] = [];
          for (const svPat of active) {
            const patOffset = segStart - svPat.x; // where we are within this pattern

            for (let t = 0; t < svPat.tracks; t++) {
              // Find dominant module for channel naming
              const modCounts = new Map<number, number>();
              for (let l = 0; l < svPat.lines; l++) {
                const ev = svPat.notes[t]?.[l];
                if (ev && ev.module >= 1) modCounts.set(ev.module, (modCounts.get(ev.module) ?? 0) + 1);
              }
              let dominantMod = -1, maxCnt = 0;
              for (const [id, cnt] of modCounts) { if (cnt > maxCnt) { maxCnt = cnt; dominantMod = id; } }
              const chName = dominantMod >= 0 ? (moduleNameMap.get(dominantMod) ?? `Track ${channels.length + 1}`) : `Track ${channels.length + 1}`;
              const instrId = dominantMod >= 0 ? (svModToInstrIdx.get(dominantMod) ?? 1) : 1;

              const rows = Array.from({ length: segLen }, (_, l) => {
                const patLine = patOffset + l;
                if (patLine < 0 || patLine >= svPat.lines) return { ...emptyRow };
                return eventToRow(svPat.notes[t]?.[patLine], instrId);
              });
              channels.push({
                id: `ch-svox-${Date.now()}-${s}-${channels.length}`,
                name: chName, muted: false, solo: false, collapsed: false,
                volume: 100, pan: 0, instrumentId: instrId,
                color: channelColors[channels.length % channelColors.length], rows,
              });
            }
          }

          if (channels.length > 0) {
            // Name from first active pattern, or segment position
            const patName = active[0].patName || `Seg ${segStart}`;
            patternsToLoad.push({
              id: `svpat-${Date.now()}-${s}`,
              name: patName,
              length: segLen,
              channels,
            });
          }
        }
        console.log('[SunVox] linearized timeline:', patternsToLoad.length, 'segments from', svPatterns.length, 'patterns',
          'channels:', patternsToLoad.slice(0, 5).map(p => `${p.name}:${p.channels.length}ch/${p.length}l`));
      } else {
        // Fallback: single pattern with one channel per generator
        const now = Date.now();
        const channels = generators.map((gen, idx) => {
          const instrId = svModToInstrIdx.get(gen.id) ?? 1;
          const rows = Array.from({ length: PATTERN_LEN }, (_, i) =>
            i === 0 ? { note: 49, instrument: instrId, volume: 64, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } : { ...emptyRow }
          );
          return { id: `ch-svox-${now}-${idx}`, name: gen.name, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: instrId, color: channelColors[idx % channelColors.length], rows };
        });
        patternsToLoad = [{ id: `svox-${Date.now()}`, name, length: PATTERN_LEN, channels }];
      }

      loadPatterns(patternsToLoad);
      setCurrentPattern(0);
      setPatternOrder(patternsToLoad.map((_, i) => i));
      setMetadata({ name, author: '', description: `Imported from ${file.name} (${generators.length} instruments, ${extractedModules.length} modules)` });
      applyEditorMode({});
      return { success: true, message: `Loaded SunVox: ${name} — ${generators.length} instruments, ${patternsToLoad.length} pattern(s)` };
    }

    // Fallback: song mode — load the whole project as a single instrument.
    const buffer = preReadBuffer!;
    useInstrumentStore.getState().createInstrument({
      name,
      synthType: 'SunVoxModular' as const,
      sunvoxModular: { modules: [], connections: [], polyphony: 1, viewMode: 'canvas' as const, backend: 'sunvox' as const },
      sunvox: {
        patchData: buffer,
        patchName: name,
        isSong: true,
        controlValues: {} as Record<string, number>,
      },
    });
    const instruments = useInstrumentStore.getState().instruments;
    const newInstrument = instruments[instruments.length - 1];
    useInstrumentStore.getState().setCurrentInstrument(newInstrument.id);
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
    // Create enough pattern order positions to cover ~10 minutes of playback.
    setPatternOrder([0, 0, 0, 0, 0]);
    setMetadata({ name, author: '', description: `Imported from ${file.name}` });
    // Reset to classic editor mode — clears stale musicline/furnace/hively state
    // from any previously-loaded file (otherwise the wrong viewer renders).
    applyEditorMode({});
    return { success: true, message: `Loaded SunVox project: ${name}` };
  }

  // (GoatTracker .sng is handled above, before the state reset, to avoid
  //  clearing instruments/patterns during the async gap.)

  // === All other tracker/module formats → show import dialog ===
  if (isSupportedModule(filename)) {
    return { success: 'pending-import', file };
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
  try {
    const { getDevilboxAudioContext } = await import('@/utils/audio-context');
    const audioCtx = getDevilboxAudioContext();
    const arrayBuf = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));

    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 22);
    const newId = useInstrumentStore.getState().createInstrument({
      name,
      synthType: 'Sampler',
      sample: {
        audioBuffer: arrayBuf,
        url: '',
        baseNote: 'C4',
        detune: 0,
        loop: false,
        loopStart: 0,
        loopEnd: audioBuffer.length,
        reverse: false,
        playbackRate: 1,
        sampleRate: audioBuffer.sampleRate,
      },
    });

    useInstrumentStore.getState().setCurrentInstrument(newId);
    notify.success(`Created sample instrument: ${name}`);

    return {
      success: true,
      message: `Imported audio sample as instrument ${newId}: ${name}`
    };
  } catch (error) {
    notify.info(`Audio sample: ${file.name} — Could not auto-import. Open instrument editor to add manually.`);
    return {
      success: true,
      message: `Recognized audio sample: ${file.name} (manual import required)`
    };
  }
}

/**
 * Load a V2M (Farbrausch V2 Synthesizer Music) file.
 * V2M can be loaded as editable patterns or played directly.
 */
async function loadV2MFile(file: File, mode: 'edit' | 'play' = 'edit'): Promise<FileLoadResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    if (mode === 'play') {
      // Playback-only mode using pre-rendered player
      const { getV2MPlayer } = await import('@/lib/import/V2MPlayer');
      const player = getV2MPlayer();
      await player.play(arrayBuffer);
      
      notify.success(`Playing V2M: ${file.name}`);
      return {
        success: true,
        message: `Playing V2M: ${file.name}`
      };
    }
    
    // Import as editable song
    const { importV2M, getV2MSummary } = await import('@/lib/import/V2MToPattern');
    
    // Get summary first for logging
    const summary = getV2MSummary(arrayBuffer);
    console.log('[V2M Import]', summary);
    
    // Import to DEViLBOX format
    const result = importV2M(arrayBuffer, {
      rowsPerPattern: 64,
      bpm: 120,
      speed: 6,
      createInstruments: true,
    });
    
    // Update song state using existing stores
    const { loadPatterns, setPatternOrder, setCurrentPattern } = useTrackerStore.getState();
    const { setBPM } = useTransportStore.getState();
    const { setMetadata } = useProjectStore.getState();
    const { addInstrument } = useInstrumentStore.getState();
    
    // Set song metadata
    setMetadata({ name: file.name.replace(/\.v2m$/i, '') });
    setBPM(result.bpm);
    
    // Load patterns
    loadPatterns(result.patterns);
    
    // Set pattern order
    const patternIds = result.patterns.map((_p, i) => i);
    setPatternOrder(patternIds);
    setCurrentPattern(0);
    
    // Add instruments
    for (const inst of result.instruments) {
      addInstrument(inst);
    }
    
    notify.success(`Imported V2M: ${result.patterns.length} patterns, ${result.instruments.length} instruments`);
    
    return {
      success: true,
      message: `Imported ${file.name}: ${result.patterns.length} patterns, ${result.instruments.length} instruments`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    notify.error(`Failed to load V2M: ${errorMessage}`);
    return { success: false, error: `Failed to load V2M: ${errorMessage}` };
  }
}

