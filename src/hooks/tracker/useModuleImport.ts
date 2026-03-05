/**
 * useModuleImport — Custom hook encapsulating all module/file import logic.
 *
 * Extracted from TrackerView.tsx.  Returns three handlers:
 *   - handleModuleImport  (MOD/XM/IT/S3M/FUR/DMF/etc.)
 *   - handleTD3Import     (TD-3 pattern files)
 *   - handleSunVoxImport  (SunVox patches & songs)
 */

import { useCallback } from 'react';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, useUIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { computeSongDBHash, lookupSongDB } from '@lib/songdb';
import { convertModule, convertXMModule, convertMODModule } from '@lib/import/ModuleConverter';
import type { XMNote } from '@lib/import/formats/XMParser';
import type { MODNote } from '@lib/import/formats/MODParser';
import { convertToInstrument } from '@lib/import/InstrumentConverter';
import { extractSamples, canExtractSamples } from '@lib/import/SampleExtractor';
import { encodeWav } from '@lib/import/WavEncoder';
import { getToneEngine } from '@engine/ToneEngine';
import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import { notify } from '@stores/useNotificationStore';
import { type TrackerSong } from '@engine/TrackerReplayer';
import { clearExplicitlySaved } from '@hooks/useProjectPersistence';
import { parseSIDHeader } from '@lib/sid/SIDHeaderParser';
import type { ModuleInfo } from '@lib/import/ModuleLoader';
import type { ImportOptions } from '@components/dialogs/ImportModuleDialog';
import type { SunVoxConfig } from '@/types/instrument/exotic';
import { createInstrumentsForModule, getChannelMetadataFromFurnace } from '@components/tracker/trackerImportHelpers';

export function useModuleImport() {
  const {
    loadPatterns,
    setPatternOrder,
    setOriginalModuleData,
  } = useTrackerStore(useShallow((s) => ({
    loadPatterns: s.loadPatterns,
    setPatternOrder: s.setPatternOrder,
    setOriginalModuleData: s.setOriginalModuleData,
  })));

  const { loadInstruments } = useInstrumentStore(useShallow(s => ({ loadInstruments: s.loadInstruments })));
  const { setMetadata } = useProjectStore(useShallow(s => ({ setMetadata: s.setMetadata })));
  const {
    setBPM,
    setSpeed,
    stop,
  } = useTransportStore(useShallow((s) => ({
    setBPM: s.setBPM,
    setSpeed: s.setSpeed,
    stop: s.stop,
  })));

  // ── TD-3 pattern import ──────────────────────────────────────────────────
  const handleTD3Import = useCallback(async (file: File, replacePatterns: boolean) => {
    const { loadFile } = await import('@lib/file/UnifiedFileLoader');
    const result = await loadFile(file, { requireConfirmation: false, replacePatterns });
    if (result.success === true) notify.success(result.message);
    else if (result.success === false) notify.error(result.error);
  }, []);

  // ── SunVox import ────────────────────────────────────────────────────────
  const handleSunVoxImport = useCallback(async (name: string, config: SunVoxConfig) => {
    const file = useUIStore.getState().pendingSunVoxFile;
    useUIStore.getState().setPendingSunVoxFile(null);
    try {
      if (config.isSong && file) {
        const { loadFile } = await import('@lib/file/UnifiedFileLoader');
        const result = await loadFile(file, { requireConfirmation: false });
        if (result.success === true) notify.success(result.message);
        else if (result.success === false) notify.error(result.error);
      } else {
        useInstrumentStore.getState().createInstrument({ name, synthType: 'SunVoxSynth', sunvox: config });
        notify.success(`Imported SunVox patch: ${name}`);
      }
    } catch (err) {
      notify.error('Failed to import SunVox file');
      console.error('[TrackerView] SunVox import failed:', err);
    }
  }, []);

  // ── Module import (MOD / XM / IT / S3M / FUR / DMF / etc.) ──────────────
  const handleModuleImport = useCallback(async (info: ModuleInfo, options: ImportOptions) => {
    // Loading an external module — prevent auto-save from overwriting user's saved project
    clearExplicitlySaved();

    const { useLibopenmpt } = options;
    let format = info.metadata.type;

    // Fire-and-forget SongDB metadata lookup (non-blocking)
    const buf = info.arrayBuffer ?? (info.file ? await info.file.arrayBuffer() : null);
    if (buf) {
      lookupSongDB(computeSongDBHash(buf)).then(result => {
        useTrackerStore.getState().setSongDBInfo(result ? {
          authors: result.authors,
          publishers: result.publishers,
          album: result.album,
          year: result.year,
          format: result.format,
          duration_ms: result.subsongs[0]?.duration_ms ?? 0,
        } : null);
      });
      // Extract C64 SID header metadata if applicable
      const sidInfo = parseSIDHeader(new Uint8Array(buf));
      useTrackerStore.getState().setSidMetadata(sidInfo ? {
        format: sidInfo.format, version: sidInfo.version,
        title: sidInfo.title, author: sidInfo.author, copyright: sidInfo.copyright,
        chipModel: sidInfo.chipModel, clockSpeed: sidInfo.clockSpeed,
        subsongs: sidInfo.subsongs, defaultSubsong: sidInfo.defaultSubsong,
        currentSubsong: options.subsong ?? sidInfo.defaultSubsong,
        secondSID: sidInfo.secondSID, thirdSID: sidInfo.thirdSID,
      } : null);
    } else {
      useTrackerStore.getState().setSongDBInfo(null);
      useTrackerStore.getState().setSidMetadata(null);
    }

    // Always clean up engine state before import
    getToneEngine().releaseAll();

    // Check if native parser data is available (XM/MOD)
    if (info.nativeData) {
      const { format: nativeFormat, importMetadata, instruments: parsedInstruments, patterns } = info.nativeData;
      format = nativeFormat;

      console.log(`[Import] Using native ${format} parser`);
      console.log(`[Import] ${parsedInstruments.length} instruments, ${patterns.length} patterns`);
      console.log(`[Import] libopenmpt playback mode: ${useLibopenmpt ? 'enabled' : 'disabled'}`);

      let result;
      if (format === 'XM') {
        result = convertXMModule(
          patterns as XMNote[][][],
          importMetadata.originalChannelCount,
          importMetadata,
          parsedInstruments.map(i => i.name),
          useLibopenmpt ? info.arrayBuffer : undefined
        );
      } else if (format === 'MOD') {
        result = convertMODModule(
          patterns as MODNote[][][],
          importMetadata.originalChannelCount,
          importMetadata,
          parsedInstruments.map(i => i.name),
          useLibopenmpt ? info.arrayBuffer : undefined
        );
      } else if (format === 'FUR' || format === 'DMF') {
        const patternOrder = importMetadata.modData?.patternOrderTable || [];
        const patLen = patterns[0]?.length || 64;
        const numChannels = importMetadata.originalChannelCount || (patterns[0]?.[0] as unknown[] | undefined)?.length || 4;
        console.log(`[Import] ${format} pattern structure: ${patterns.length} patterns, ${patLen} rows, ${numChannels} channels`);

        const furnaceData = importMetadata.furnaceData;
        const channelMetadata = (furnaceData?.systems && furnaceData?.systemChans)
          ? getChannelMetadataFromFurnace(
              furnaceData.systems,
              furnaceData.systemChans,
              numChannels,
              furnaceData.channelShortNames,
              furnaceData.effectColumns
            )
          : null;
        
        if (channelMetadata) {
          console.log(`[Import] Applied system preset: ${furnaceData?.systemName}, systems: [${furnaceData?.systems?.map((s: number) => '0x' + s.toString(16)).join(', ')}]`);
        }

        result = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          patterns: (patterns as any[]).map((pat: any[][], idx: number) => ({
            id: `pattern-${idx}`,
            name: `Pattern ${idx}`,
            length: patLen,
            importMetadata,
            channels: Array.from({ length: numChannels }, (_, ch) => {
              const meta = channelMetadata?.[ch];
              return {
                id: `channel-${ch}`,
                name: meta?.name || `Channel ${ch + 1}`,
                shortName: meta?.shortName,
                muted: false,
                solo: false,
                collapsed: false,
                volume: 100,
                pan: 0,
                instrumentId: null,
                color: meta?.color || null,
                channelMeta: meta?.channelMeta,
                rows: pat.map((row: any[]) => {
                  const cell = row[ch] || {};
                  return {
                    note: cell.note || 0,
                    instrument: cell.instrument || 0,
                    volume: cell.volume || 0,
                    effTyp: cell.effectType || 0,
                    eff: cell.effectParam || 0,
                    effTyp2: cell.effectType2 || 0,
                    eff2: cell.effectParam2 || 0,
                    effects: cell.effects?.map((e: { type: number; param: number }) => ({ 
                      type: e.type, 
                      param: e.param 
                    })),
                  };
                }),
              };
            }),
          })),
          order: patternOrder.length > 0 ? patternOrder : [0],
          instrumentNames: parsedInstruments.map(i => i.name),
        };
        console.log(`[Import] ${format} patterns converted:`, result.patterns.length, 'patterns, first pattern has', result.patterns[0]?.channels?.length, 'channels');
      } else {
        result = convertMODModule(
          patterns as MODNote[][][],
          importMetadata.originalChannelCount,
          importMetadata,
          parsedInstruments.map(i => i.name),
          useLibopenmpt ? info.arrayBuffer : undefined
        );
      }

      if (result.patterns.length === 0) {
        notify.error(`Module "${info.metadata.title}" contains no patterns to import.`);
        return;
      }

      const instruments: InstrumentConfig[] = [];
      let nextId = 1;
      for (let i = 0; i < parsedInstruments.length; i++) {
        const converted = convertToInstrument(parsedInstruments[i], nextId, format as any);
        instruments.push(...converted);
        nextId += converted.length;
      }

      stop();

      // Ensure audio context is running
      try {
        const context = Tone.getContext();
        const rawContext = (context as any).rawContext || (context as any)._context;
        if (rawContext && rawContext.state !== 'running') {
          await context.resume();
          let attempts = 0;
          while (rawContext.state !== 'running' && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
          }
          console.log('[Import] Audio context resumed, state:', rawContext.state, 'after', attempts * 50, 'ms');
        }
      } catch (err) {
        console.warn('[Import] Failed to resume audio context:', err);
      }

      loadInstruments(instruments);
      loadPatterns(result.patterns);

      console.log('[Import] result.order:', result.order);
      if (result.order && result.order.length > 0) {
        setPatternOrder(result.order);
        console.log('[Import] Pattern order set:', result.order.length, 'positions, first 10:', result.order.slice(0, 10));
      } else {
        console.warn('[Import] No pattern order found in result!');
      }

      if (result.originalModuleData) {
        setOriginalModuleData(result.originalModuleData);
        console.log('[Import] Original module data stored for libopenmpt playback');
      } else {
        setOriginalModuleData(null);
      }

      setMetadata({
        name: info.metadata.title,
        author: '',
        description: `Imported from ${info.file?.name || 'module'} (${format})`,
      });

      setBPM(importMetadata.modData?.initialBPM || 125);
      setSpeed(importMetadata.modData?.initialSpeed || 6);

      const samplerCount = instruments.filter(i => i.synthType === 'Sampler').length;
      console.log('Imported module:', info.metadata.title, {
        format,
        patterns: result.patterns.length,
        channels: importMetadata.originalChannelCount,
        instruments: instruments.length,
        samplers: samplerCount,
      });

      if (samplerCount > 0) {
        console.log('[Import] Preloading samples...');
        await getToneEngine().preloadInstruments(instruments);
        console.log('[Import] Samples ready for playback');
      }

      notify.success(`Imported "${info.metadata.title}" - ${result.patterns.length} patterns, ${instruments.length} instruments`);

      const xmFreqType = importMetadata?.xmData?.frequencyType;
      const linearPeriods = format === 'XM' ? (xmFreqType === 'linear' || xmFreqType === undefined) : false;
      useTrackerStore.getState().applyEditorMode({ linearPeriods });

      return;
    }

    // UADE / exotic Amiga path
    if (!info.metadata.song) {
      if (!info.file) {
        notify.error('File reference lost — cannot import');
        return;
      }
      const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
      let song: TrackerSong;
      try {
        song = await parseModuleToSong(info.file, options.subsong ?? 0, options.uadeMetadata, options.midiOptions, options.companionFiles);
      } catch (err) {
        notify.error(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return;
      }
      stop();
      loadInstruments(song.instruments);
      loadPatterns(song.patterns);
      if (song.songPositions.length > 0) setPatternOrder(song.songPositions);
      setOriginalModuleData(null);
      setBPM(song.initialBPM);
      setSpeed(song.initialSpeed);
      setMetadata({ name: song.name, author: '', description: `Imported from ${info.file?.name || 'module'}` });
      useTrackerStore.getState().applyEditorMode(song);
      // For SID files using GT Ultra view, populate GT Ultra store with metadata
      if (song.c64SidFileData && useTrackerStore.getState().editorMode === 'goattracker') {
        const gtStore = (await import('@/stores/useGTUltraStore')).useGTUltraStore.getState();
        const parts = song.name.split(' — ');
        gtStore.setSongName(parts[0] || song.name);
        if (parts[1]) gtStore.setSongAuthor(parts[1]);
        gtStore.setSidCount(song.numChannels > 3 ? 2 : 1);
      }
      const samplerCount = song.instruments.filter(i => i.synthType === 'Sampler').length;
      if (samplerCount > 0) {
        await getToneEngine().preloadInstruments(song.instruments);
      }
      notify.success(`Imported "${song.name}" — ${song.patterns.length} patterns, ${song.instruments.length} instruments`);
      return;
    }

    // Fallback to libopenmpt path
    console.log('[Import] Using libopenmpt fallback');

    const result = convertModule(info.metadata.song);

    if (result.patterns.length === 0) {
      notify.error(`Module "${info.metadata.title}" contains no patterns to import.`);
      return;
    }

    let sampleUrls: Map<number, string> | undefined;
    if (info.file && canExtractSamples(info.file.name)) {
      try {
        console.log('[Import] Extracting samples from module...');
        const extraction = await extractSamples(info.file);
        sampleUrls = new Map();

        for (let i = 0; i < extraction.samples.length; i++) {
          const sample = extraction.samples[i];
          if (sample.pcmData.length > 0) {
            const wavUrl = encodeWav(sample);
            sampleUrls.set(i + 1, wavUrl);
            console.log(`[Import] Sample ${i + 1}: ${sample.name} (${sample.pcmData.length} samples)`);
          }
        }
        console.log(`[Import] Extracted ${sampleUrls.size} samples`);
      } catch (err) {
        console.warn('[Import] Could not extract samples, using synth fallback:', err);
      }
    }

    const instruments = createInstrumentsForModule(
      result.patterns,
      result.instrumentNames,
      sampleUrls
    );

    loadInstruments(instruments);
    loadPatterns(result.patterns);

    if (result.order && result.order.length > 0) {
      setPatternOrder(result.order);
      console.log('[Import] Pattern order set:', result.order.length, 'positions');
    }

    setMetadata({
      name: info.metadata.title,
      author: '',
      description: `Imported from ${info.file?.name || 'module'}`,
    });

    setBPM(125);

    const samplerCount = instruments.filter(i => i.synthType === 'Sampler').length;
    console.log('Imported module:', info.metadata.title, {
      format,
      patterns: result.patterns.length,
      channels: result.channelCount,
      instruments: instruments.length,
      samplers: samplerCount,
    });

    if (samplerCount > 0) {
      console.log('[Import] Preloading samples...');
      await getToneEngine().preloadInstruments(instruments);
      console.log('[Import] Samples ready for playback');
    }

    notify.success(`Imported "${info.metadata.title}" - ${result.patterns.length} patterns, ${instruments.length} instruments`);
  }, [loadInstruments, loadPatterns, setMetadata, setBPM, setSpeed, setPatternOrder, setOriginalModuleData, stop]);

  return { handleModuleImport, handleTD3Import, handleSunVoxImport };
}
