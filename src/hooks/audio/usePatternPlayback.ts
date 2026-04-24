/**
 * usePatternPlayback - Real-time tick-based pattern playback
 *
 * Uses TrackerReplayer for ALL playback - same architecture as Amiga hardware:
 * - CIA timer fires every tick (2.5 / BPM seconds)
 * - Tick 0: read row data, trigger notes
 * - Ticks 1+: process continuous effects
 */

import { useEffect, useMemo, useRef, startTransition } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTrackerStore, useTransportStore, useInstrumentStore, useAudioStore, useSettingsStore , useFormatStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { getToneEngine } from '@engine/ToneEngine';
import { setFormatPlaybackRow, setFormatPlaybackPlaying } from '@engine/FormatPlaybackState';
import { getTrackerReplayer, type TrackerFormat } from '@engine/TrackerReplayer';
import { getTrackerScratchController } from '@engine/TrackerScratchController';
import type { UADEEngine } from '@engine/uade/UADEEngine';

export const usePatternPlayback = () => {
  const { patterns, currentPatternIndex, setCurrentPattern, patternOrder, currentPositionIndex, setCurrentPosition, } = useTrackerStore(useShallow((s) => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
    setCurrentPattern: s.setCurrentPattern,
    patternOrder: s.patternOrder,
    currentPositionIndex: s.currentPositionIndex,
    setCurrentPosition: s.setCurrentPosition,
    })));
  const { channelTrackTables, channelSpeeds, channelGrooves, hivelyNative, hivelyFileData, hivelyMeta, musiclineFileData, c64SidFileData, c64MemPatches, cheeseCutterFileData, jamCrackerFileData, futurePlayerFileData, preTrackerFileData, maFileData, hippelFileData, sonixFileData, pxtoneFileData, organyaFileData, sawteethFileData, eupFileData, ixsFileData, psycleFileData, sc68FileData, zxtuneFileData, pumaTrackerFileData, steveTurnerFileData, sidmon1WasmFileData, fredEditorWasmFileData, artOfNoiseFileData, fmplayerFileData, qsfFileData, bdFileData, sd2FileData, symphonieFileData, v2mFileData, sonicArrangerFileData, soundMonFileData, digMugFileData, davidWhittakerFileData, soundControlFileData, deltaMusic1FileData, deltaMusic2FileData, soundFxFileData, gmcFileData, voodooFileData, fredReplayerFileData, oktalyzerFileData, futureComposerFileData, quadraComposerFileData, ronKlarenFileData, actionamicsFileData, activisionProFileData, synthesisFileData, dssFileData, soundFactoryFileData, faceTheMusicFileData, klysFileData, uadeEditableFileData, uadePatternLayout, adplugFileData, adplugFileName, adplugTicksPerRow, libopenmptFileData, tfmxFileData, tfmxSmplData, furnaceNative, furnaceActiveSubsong, tfmxTimingTable } = useFormatStore(useShallow((s) => ({
    channelTrackTables: s.channelTrackTables,
    channelSpeeds: s.channelSpeeds,
    channelGrooves: s.channelGrooves,
    hivelyNative: s.hivelyNative,
    hivelyFileData: s.hivelyFileData,
    hivelyMeta: s.hivelyMeta,
    musiclineFileData: s.musiclineFileData,
    c64SidFileData: s.c64SidFileData,
    c64MemPatches: s.c64MemPatches,
    cheeseCutterFileData: s.cheeseCutterFileData,
    jamCrackerFileData: s.jamCrackerFileData,
    futurePlayerFileData: s.futurePlayerFileData,
    preTrackerFileData: s.preTrackerFileData,
    maFileData: s.maFileData,
    hippelFileData: s.hippelFileData,
    sonixFileData: s.sonixFileData,
    pxtoneFileData: s.pxtoneFileData,
    organyaFileData: s.organyaFileData,
    sawteethFileData: s.sawteethFileData,
    eupFileData: s.eupFileData,
    ixsFileData: s.ixsFileData,
    psycleFileData: s.psycleFileData,
    sc68FileData: s.sc68FileData,
    zxtuneFileData: s.zxtuneFileData,
    pumaTrackerFileData: s.pumaTrackerFileData,
    steveTurnerFileData: s.steveTurnerFileData,
    sidmon1WasmFileData: s.sidmon1WasmFileData,
    fredEditorWasmFileData: s.fredEditorWasmFileData,
    artOfNoiseFileData: s.artOfNoiseFileData,
    fmplayerFileData: s.fmplayerFileData,
    qsfFileData: s.qsfFileData,
    bdFileData: s.bdFileData,
    sd2FileData: s.sd2FileData,
    symphonieFileData: s.symphonieFileData,
    v2mFileData: s.v2mFileData,
    sonicArrangerFileData: s.sonicArrangerFileData,
    soundMonFileData: s.soundMonFileData,
    digMugFileData: s.digMugFileData,
    davidWhittakerFileData: s.davidWhittakerFileData,
    soundControlFileData: s.soundControlFileData,
    deltaMusic1FileData: s.deltaMusic1FileData,
    deltaMusic2FileData: s.deltaMusic2FileData,
    soundFxFileData: s.soundFxFileData,
    gmcFileData: s.gmcFileData,
    voodooFileData: s.voodooFileData,
    fredReplayerFileData: s.fredReplayerFileData,
    oktalyzerFileData: s.oktalyzerFileData,
    futureComposerFileData: s.futureComposerFileData,
    quadraComposerFileData: s.quadraComposerFileData,
    ronKlarenFileData: s.ronKlarenFileData,
    actionamicsFileData: s.actionamicsFileData,
    activisionProFileData: s.activisionProFileData,
    synthesisFileData: s.synthesisFileData,
    dssFileData: s.dssFileData,
    soundFactoryFileData: s.soundFactoryFileData,
    faceTheMusicFileData: s.faceTheMusicFileData,
    klysFileData: s.klysFileData,
    uadeEditableFileData: s.uadeEditableFileData,
    uadePatternLayout: s.uadePatternLayout,
    adplugFileData: s.adplugFileData,
    adplugFileName: s.adplugFileName,
    adplugTicksPerRow: s.adplugTicksPerRow,
    tfmxFileData: s.tfmxFileData,
    tfmxSmplData: s.tfmxSmplData,
    libopenmptFileData: s.libopenmptFileData,
    furnaceNative: s.furnaceNative,
    furnaceActiveSubsong: s.furnaceActiveSubsong,
    tfmxTimingTable: s.tfmxTimingTable,
  })));
  const linearPeriods = useEditorStore((s) => s.linearPeriods);
  const { isPlaying, isLooping, bpm, speed: transportSpeed, setCurrentRowThrottled } = useTransportStore(useShallow((s) => ({
    isPlaying: s.isPlaying,
    isLooping: s.isLooping,
    bpm: s.bpm,
    speed: s.speed,
    // setCurrentRow removed — accessed via getState() where needed
    setCurrentRowThrottled: s.setCurrentRowThrottled,
  })));
  const { instruments, instrumentLoadVersion } = useInstrumentStore(useShallow((s) => ({ instruments: s.instruments, instrumentLoadVersion: s.instrumentLoadVersion })));
  const { masterEffects } = useAudioStore(useShallow((s) => ({ masterEffects: s.masterEffects })));
  // Pattern depends on currentPatternIndex and currentPositionIndex.
  // We use refs for these to prevent the main playback loop from restarting 
  // every time the UI position updates.
  const currentPositionIndexRef = useRef(currentPositionIndex);
  useEffect(() => {
    currentPositionIndexRef.current = currentPositionIndex;
  }, [currentPositionIndex]);

  const currentPatternIndexRef = useRef(currentPatternIndex);
  useEffect(() => {
    currentPatternIndexRef.current = currentPatternIndex;
  }, [currentPatternIndex]);

  const actualPatternIndex = patternOrder[currentPositionIndex] ?? currentPatternIndex;
  const pattern = patterns[actualPatternIndex];
  const engineRef = useRef(getToneEngine());
  const replayerRef = useRef(getTrackerReplayer());
  // Keep refs up to date via effect (not during render)
  useEffect(() => {
    engineRef.current = getToneEngine();
    replayerRef.current = getTrackerReplayer();
  });

  // Refs for pattern data — always current, used inside effects that shouldn't
  // re-trigger on every cell edit (transpose, fill, humanize, etc.)
  const patternRef = useRef(pattern);
  const patternsRef = useRef(patterns);
  const patternOrderRef = useRef(patternOrder);
  const bpmRef = useRef(bpm);
  const tfmxTimingTableRef = useRef(tfmxTimingTable);
  useEffect(() => {
    patternRef.current = pattern;
    patternsRef.current = patterns;
    patternOrderRef.current = patternOrder;
    bpmRef.current = bpm;
    tfmxTimingTableRef.current = tfmxTimingTable;
  });

  // Ref for instruments — prevents the main playback effect from restarting
  // on every instrument knob change (which would cause full song reloads)
  const instrumentsRef = useRef(instruments);
  useEffect(() => {
    instrumentsRef.current = instruments;
  }, [instruments]);

  // Structural fingerprint — changes only when the pattern structure changes
  // (add/remove channels, change length, different module format), NOT on cell
  // content edits. This prevents the heavy stop/loadSong/play cycle on every edit.
  // Stable key for pattern order — only changes when the order content changes,
  // not on every unrelated Immer mutation that produces a new array reference.
  const patternOrderKey = useMemo(() => patternOrder.join(','), [patternOrder]);

  const patternStructureKey = useMemo(() => {
    if (!pattern) return '';
    return `${patterns.length}:${pattern.channels.length}:${pattern.length}:${pattern.importMetadata?.sourceFormat ?? ''}:${patternOrderKey}:v${instrumentLoadVersion}`;
  }, [patterns.length, pattern?.channels.length, pattern?.length, pattern?.importMetadata?.sourceFormat, patternOrderKey, instrumentLoadVersion]);

  // Track if we've started playback
  const hasStartedRef = useRef(false);
  /** Track whether MusicLine song was loaded into the replayer — persists across stop/play.
   *  Reset when musiclineFileData changes (new song loaded). */
  const mlLoadedRef = useRef(false);
  const prevMlFileDataRef = useRef(musiclineFileData);
  if (musiclineFileData !== prevMlFileDataRef.current) {
    prevMlFileDataRef.current = musiclineFileData;
    mlLoadedRef.current = false;
  }
  // UADE live channel data subscription cleanup
  const uadeChannelUnsubRef = useRef<(() => void) | null>(null);
  // UADE live row counter (increments on note triggers during playback)
  const uadeLiveRowRef = useRef(0);

  // Counter to distinguish replayer-driven position changes from user-driven ones.
  // Was boolean; changed to counter to handle high-BPM songs where multiple patterns
  // advance within one 250ms scheduler batch (each onRowChange increments; effect resets
  // to 0). With a boolean, the second effect run would see false → needsReload = true
  // → replayer stops and restarts → audible gap.
  const replayerAdvancedRef = useRef(0);

  // Sync BPM changes to engine (for visualization, metronome, etc.)
  useEffect(() => {
    engineRef.current.setBPM(bpm);
  }, [bpm]);

  // Sync master effects — only rebuild when the list structure changes
  // (add/remove/enable/disable/reorder), NOT on parameter or wet changes.
  // Parameter updates are handled by updateMasterEffectParams in the store.
  // Note: selectedChannels is included so that toggling channel routing
  // triggers a rebuild (channel-targeted effects are routed via WASM isolation).
  const masterEffectsKey = useMemo(
    () => masterEffects.map(e => `${e.id}:${e.enabled}:${e.type}:${(e.selectedChannels || []).join(',')}`).join('|'),
    [masterEffects]
  );
  useEffect(() => {
    engineRef.current.rebuildMasterEffects(masterEffects);
  }, [masterEffectsKey]);

  // Sync channel settings when pattern changes
  useEffect(() => {
    if (pattern) {
      const engine = engineRef.current;
      pattern.channels.forEach((channel, idx) => {
        const volumeDb = channel.volume > 0 ? -60 + (channel.volume / 100) * 60 : -Infinity;
        engine.setChannelVolume(idx, volumeDb);
        engine.setChannelPan(idx, channel.pan);
      });
      engine.updateMuteStates(pattern.channels.map(ch => ({ muted: ch.muted, solo: ch.solo })));
    }
  }, [pattern]);

  // Hot-swap pattern data into running replayer on any content change.
  // The scheduler reads this.song.patterns on every tick, so updating the
  // reference is enough — no stop/reload/play cycle needed. This makes
  // transpose, cell edits, fills, and humanize take effect immediately.
  useEffect(() => {
    const replayer = replayerRef.current;
    if (replayer.isPlaying()) {
      replayer.updatePatterns(patterns);
    }
  }, [patterns]);

  // Hot-swap instrument list into the replayer when instruments change.
  // Without this, instruments added/modified after loadSong are invisible to
  // the replayer's instrumentMap, causing notes on those instruments to be silent.
  // Works both during playback AND while stopped (so the next play() is current).
  useEffect(() => {
    const replayer = replayerRef.current;
    replayer.updateInstruments(instruments);
  }, [instruments]);

  // When in loop mode, track which pattern is being looped so that position
  // changes (clicking position buttons) trigger a reload with the new pattern.
  // In song mode this is -1 so it doesn't interfere with patternStructureKey.
  const loopTargetKey = isLooping ? currentPatternIndex : -1;

  // Handle playback start/stop and structural changes (channel count, format, etc.)
  // NOTE: uses patternStructureKey instead of pattern/patterns to avoid full reloads
  // on cell content edits. Content changes are handled by the hot-swap effect above.
  useEffect(() => {
    const replayer = replayerRef.current;
    const pattern = patternRef.current;
    const patterns = patternsRef.current;

    // IF we are playing and the song structure changed, we need to RELOAD the song in the replayer
    // otherwise it won't know about the new patterns (like B/D animation helpers)
    if (isPlaying && pattern) {
      // Determine if we need to reload.
      // Use the replayerAdvancedRef flag to detect natural position advances.
      // The old approach (comparing replayer.getCurrentPosition() with store position)
      // failed because the replayer's 100ms lookahead scheduling meant it was often
      // 1+ positions ahead of the store when React re-rendered, causing false reloads.
      const wasReplayerAdvanced = replayerAdvancedRef.current > 0;
      replayerAdvancedRef.current = 0;

      // Phase 5.3: when a WASM engine drives playback, the TS scheduler is
      // skipped entirely, so replayerAdvancedRef never increments. Treat all
      // re-renders during WASM-backed playback as natural (no reload needed).
      const isNaturalAdvancement = hasStartedRef.current &&
                                   replayer.isPlaying() &&
                                   (wasReplayerAdvanced || replayer.isSuppressNotes);

      const needsReload = hasStartedRef.current && !isNaturalAdvancement;

      // Per-channel formats (MusicLine etc.) have no importMetadata.sourceFormat on their
      // single-voice PART patterns. Fall back to 'MOD' (Amiga period math) not 'XM'.
      const format = (pattern.importMetadata?.sourceFormat as TrackerFormat)
        || (channelTrackTables && channelTrackTables.length > 0 ? 'MOD' : 'XM');

      // ── UADE: opaque song player — bypass TrackerReplayer entirely ──────
      if (format === 'UADE') {
        if (!hasStartedRef.current) {
          hasStartedRef.current = true;
          uadeLiveRowRef.current = 0;
          if ((window as any).PLAYBACK_DEBUG) console.log('[Playback] Starting UADE playback (opaque song player)');
          // Find the UADESynth instrument instance and trigger playback directly.
          // Must await engine readiness — setInstrument() is fire-and-forget during preload.
          const engine = getToneEngine();
          const uadeInst = instrumentsRef.current.find(i => i.synthType === 'UADESynth');
          if (uadeInst) {
            const key = engine.getInstrumentKey(uadeInst.id, -1);
            let synth = engine.instruments.get(key);
            // If the synth isn't in the map yet (preload race), create it now
            if (!synth) {
              if ((window as any).PLAYBACK_DEBUG) console.log('[Playback] UADESynth not cached, creating via getInstrument');
              synth = engine.getInstrument(uadeInst.id, uadeInst) ?? undefined;
            }
            if (synth && 'getEngine' in synth) {
              const uadeEngine = (synth as { getEngine: () => UADEEngine }).getEngine();
              uadeEngine.ready().then(() => {
                if ((window as any).PLAYBACK_DEBUG) console.log('[Playback] UADE engine ready, starting playback');
                uadeEngine.play();

                // Subscribe to channel data for playback position tracking.
                // Pattern data is pre-populated at import time via scan — we just
                // need to advance the row/pattern cursor as the song plays.
                // Use totalFrames to compute position matching the scan's fixed row rate.
                uadeChannelUnsubRef.current?.();
                const framesPerRow = Math.round(44100 * 2.5 * 6 / 125); // ~5292 at standard Amiga rate
                uadeChannelUnsubRef.current = uadeEngine.onChannelData((_channels, totalFrames) => {
                  // TFMX: use timing table for position sync instead of fixed framesPerRow
                  const tt = tfmxTimingTableRef.current;
                  if (tt && tt.length > 0) {
                    // Convert totalFrames to jiffies (PAL Amiga VBlank = 50 Hz = 882 samples at 44100)
                    const jiffies = Math.floor(totalFrames / 882);

                    // Binary search the timing table for current position
                    let lo = 0, hi = tt.length - 1;
                    while (lo < hi) {
                      const mid = (lo + hi + 1) >> 1;
                      if (tt[mid].cumulativeJiffies <= jiffies) lo = mid;
                      else hi = mid - 1;
                    }

                    const entry = tt[lo];
                    const patternIdx = entry.patternIndex;
                    const rowInPattern = entry.row;

                    const store = useTrackerStore.getState();
                    if (patternIdx !== store.currentPositionIndex && patternIdx < store.patternOrder.length) {
                      startTransition(() => {
                        setCurrentPosition(patternIdx, true);
                        setCurrentPattern(store.patternOrder[patternIdx] ?? patternIdx, true);
                      });
                    }
                    setCurrentRowThrottled(rowInPattern, store.patterns[store.patternOrder[patternIdx] ?? patternIdx]?.length ?? 64, true);
                    // Drive FormatPlaybackState so PatternEditorCanvas RAF loop scrolls in format mode
                    setFormatPlaybackRow(rowInPattern);
                    setFormatPlaybackPlaying(true);
                    return; // Skip standard framesPerRow calculation
                  }

                  const globalRow = Math.floor(totalFrames / framesPerRow);
                  const store = useTrackerStore.getState();
                  const pLen = store.patterns[0]?.length ?? 64;
                  const patternIdx = Math.floor(globalRow / pLen);
                  const rowInPattern = globalRow % pLen;

                  // Update pattern position if needed
                  if (patternIdx !== store.currentPositionIndex && patternIdx < store.patternOrder.length) {
                    startTransition(() => {
                      setCurrentPosition(patternIdx, true);
                      setCurrentPattern(store.patternOrder[patternIdx] ?? patternIdx, true);
                    });
                  }

                  setCurrentRowThrottled(rowInPattern, pLen, true);
                });
              }).catch(err => {
                console.error('[Playback] UADE engine ready failed:', err);
              });
            } else {
              console.warn('[Playback] UADESynth not found or missing getEngine (key=' + key + ', synth=' + synth + ')');
            }
          } else {
            console.warn('[Playback] No UADESynth instrument config found in store');
          }
        }
        return;
      }

      // ── JamCracker: opaque WASM player — bypass TrackerReplayer reload loop ─
      // JamCracker uses its own WASM engine for playback. The replayer's internal
      // scheduler runs but suppressNotes=true, so replayer.isPlaying() returns
      // false → needsReload=true on EVERY effect re-fire → infinite loadSong/play
      // cycle that restarts the engine from position 0. Fix: start once via
      // loadSong+play, then ALWAYS return early. Position is tracked via
      // useWasmPositionStore, wired in startNativeEngines.
      if (format === 'JamCracker' && jamCrackerFileData) {
        if (!hasStartedRef.current) {
          hasStartedRef.current = true;
          // Build the song config and start the engine via the normal path
          // (loadSong → replayer.play → startNativeEngines → JamCracker loadTune+play)
          const modData = pattern.importMetadata?.modData;
          replayer.loadSong({
            name: pattern.importMetadata?.sourceFile ?? pattern.name ?? 'Untitled',
            format,
            patterns,
            instruments: instrumentsRef.current,
            songPositions: patternOrderRef.current,
            songLength: modData?.songLength ?? patternOrderRef.current.length,
            restartPosition: modData?.restartPosition ?? 0,
            numChannels: pattern.channels.length,
            initialSpeed: modData?.initialSpeed ?? transportSpeed,
            initialBPM: modData?.initialBPM ?? bpmRef.current,
            linearPeriods,
            jamCrackerFileData,
          });
          getTrackerScratchController().notifyPlaybackStarted();
          replayer.play().catch((err) => {
            console.error('Failed to start JamCracker playback:', err);
          });
        }
        return;
      }

      // ── MusicLine: opaque WASM player — bypass reload loop ──────────────
      // Same pattern as JamCracker: MusicLineEngine handles playback via WASM.
      // The replayer advances positions internally, changing the pattern key,
      // which would trigger needsReload=true and restart the engine.
      // Only bypass when isPlaying — when stopped, fall through to the stop handler
      // so hasStartedRef resets and the next play works.
      if (isPlaying && musiclineFileData && channelTrackTables && channelTrackTables.length > 0) {
        if (!hasStartedRef.current) {
          hasStartedRef.current = true;
          // Only loadSong on very first play — it calls stop() internally which
          // kills any running engine. On replay, just call play() which triggers
          // startNativeEngines (that handles loadSong at the engine level).
          if (!mlLoadedRef.current) {
            mlLoadedRef.current = true;
            const modData = pattern.importMetadata?.modData;
            replayer.loadSong({
              name: pattern.importMetadata?.sourceFile ?? pattern.name ?? 'Untitled',
              format,
              patterns,
              instruments: instrumentsRef.current,
              songPositions: patternOrderRef.current,
              songLength: modData?.songLength ?? patternOrderRef.current.length,
              restartPosition: modData?.restartPosition ?? 0,
              numChannels: pattern.channels.length,
              initialSpeed: modData?.initialSpeed ?? transportSpeed,
              initialBPM: modData?.initialBPM ?? bpmRef.current,
              linearPeriods,
              channelTrackTables: channelTrackTables ?? undefined,
              musiclineFileData,
            });
          }
          getTrackerScratchController().notifyPlaybackStarted();
          replayer.play().catch((err) => {
            console.error('Failed to start MusicLine playback:', err);
          });
        }
        return;
      }

      // Skip reload if forcePosition was just called — the replayer already seeked.
      // But only skip if we've already loaded a song (hasStartedRef.current).
      // If the replayer hasn't started yet, we MUST proceed to loadSong even if
      // forcePosition was called (e.g. play button calls forcePosition before the
      // effect fires for a newly loaded song).
      if (replayer.skipNextReload) {
        replayer.skipNextReload = false;
        if (hasStartedRef.current) {
          return;
        }
      }

      if (!hasStartedRef.current || needsReload) {
        hasStartedRef.current = true;

        if (needsReload) {
          if ((window as any).PLAYBACK_DEBUG) console.log(`[Playback] Reloading: replayerPos=${replayer.getCurrentPosition()}, storePos=${currentPositionIndexRef.current}`);
        }
        const modData = pattern.importMetadata?.modData;

        if ((window as any).PLAYBACK_DEBUG) console.log(`[Playback] ${needsReload ? 'Reloading' : 'Starting'} real-time playback (${format})`);

        let effectivePatterns = patterns;
        let effectiveSongPositions: number[];
        let effectiveSongLength: number;
        // For per-channel formats (MusicLine etc.), each PART pattern has only 1 channel,
        // but the song has N channels (one per track table). Use the track table count.
        let effectiveNumChannels = (channelTrackTables && channelTrackTables.length > 0)
          ? channelTrackTables.length
          : pattern.channels.length;

        {
          // --- Pattern Order Mode ---
          const currentOrder = patternOrderRef.current;
          const loopPatternOrder = isLooping ? [currentPatternIndex] : currentOrder;
          effectiveSongPositions = loopPatternOrder;
          effectiveSongLength = isLooping ? 1 : (modData?.songLength ?? currentOrder.length);
        }

        // Save current replayer state if reloading
        const currentSongPos = replayer.getCurrentPosition();
        const currentRow = replayer.getCurrentRow();

        // NOTE: WASM synth readiness is awaited inside replayer.play() via
        // engine.ensureWASMSynthsReady(). No need for a duplicate fire-and-forget call here.

        // Load song into TrackerReplayer
        const furnaceData = pattern.importMetadata?.furnaceData;
        replayer.loadSong({
          name: pattern.importMetadata?.sourceFile ?? pattern.name ?? 'Untitled',
          format,
          patterns: effectivePatterns,
          instruments: instrumentsRef.current,
          songPositions: effectiveSongPositions,
          songLength: effectiveSongLength,
          restartPosition: modData?.restartPosition ?? 0,
          numChannels: effectiveNumChannels,
          initialSpeed: modData?.initialSpeed ?? transportSpeed,
          initialBPM: modData?.initialBPM ?? bpmRef.current,
          // Period frequency mode (set by XM, IT, FTM, XTracker, etc. parsers)
          linearPeriods,
          // Per-channel track tables (MusicLine Editor and similar formats)
          channelTrackTables: channelTrackTables ?? undefined,
          channelSpeeds: channelSpeeds ?? undefined,
          channelGrooves: channelGrooves ?? undefined,
          // Hively/AHX native data (required for WASM replayer)
          hivelyNative: hivelyNative ?? undefined,
          hivelyFileData: hivelyFileData ?? undefined,
          hivelyMeta: hivelyMeta ?? undefined,
          // MusicLine Editor raw binary (required for MusicLineEngine WASM)
          musiclineFileData: musiclineFileData ?? undefined,
          // C64 SID raw binary (required for C64SIDEngine)
          c64SidFileData: c64SidFileData ?? undefined,
          c64MemPatches: c64MemPatches ?? undefined,
          cheeseCutterFileData: cheeseCutterFileData ?? undefined,
          // JamCracker raw binary (required for JamCrackerEngine WASM)
          jamCrackerFileData: jamCrackerFileData ?? undefined,
          futurePlayerFileData: futurePlayerFileData ?? undefined,
          preTrackerFileData: preTrackerFileData ?? undefined,
          maFileData: maFileData ?? undefined,
          hippelFileData: hippelFileData ?? undefined,
          sonixFileData: sonixFileData ?? undefined,
          pxtoneFileData: pxtoneFileData ?? undefined,
          organyaFileData: organyaFileData ?? undefined,
          sawteethFileData: sawteethFileData ?? undefined,
          eupFileData: eupFileData ?? undefined,
          ixsFileData: ixsFileData ?? undefined,
          psycleFileData: psycleFileData ?? undefined,
          sc68FileData: sc68FileData ?? undefined,
          zxtuneFileData: zxtuneFileData ?? undefined,
          pumaTrackerFileData: pumaTrackerFileData ?? undefined,
          steveTurnerFileData: steveTurnerFileData ?? undefined,
          sidmon1WasmFileData: sidmon1WasmFileData ?? undefined,
          fredEditorWasmFileData: fredEditorWasmFileData ?? undefined,
          artOfNoiseFileData: artOfNoiseFileData ?? undefined,
          fmplayerFileData: fmplayerFileData ?? undefined,
          qsfFileData: qsfFileData ?? undefined,
          bdFileData: bdFileData ?? undefined,
          sd2FileData: sd2FileData ?? undefined,
          symphonieFileData: symphonieFileData ?? undefined,
          sonicArrangerFileData: sonicArrangerFileData ?? undefined,
          soundMonFileData: soundMonFileData ?? undefined,
          digMugFileData: digMugFileData ?? undefined,
          davidWhittakerFileData: davidWhittakerFileData ?? undefined,
          soundControlFileData: soundControlFileData ?? undefined,
          deltaMusic1FileData: deltaMusic1FileData ?? undefined,
          deltaMusic2FileData: deltaMusic2FileData ?? undefined,
          soundFxFileData: soundFxFileData ?? undefined,
          gmcFileData: gmcFileData ?? undefined,
          voodooFileData: voodooFileData ?? undefined,
          fredReplayerFileData: fredReplayerFileData ?? undefined,
          oktalyzerFileData: oktalyzerFileData ?? undefined,
          futureComposerFileData: futureComposerFileData ?? undefined,
          quadraComposerFileData: quadraComposerFileData ?? undefined,
          ronKlarenFileData: ronKlarenFileData ?? undefined,
          actionamicsFileData: actionamicsFileData ?? undefined,
          activisionProFileData: activisionProFileData ?? undefined,
          synthesisFileData: synthesisFileData ?? undefined,
          dssFileData: dssFileData ?? undefined,
          soundFactoryFileData: soundFactoryFileData ?? undefined,
          faceTheMusicFileData: faceTheMusicFileData ?? undefined,
          klysFileData: klysFileData ?? undefined,
          uadeEditableFileData: uadeEditableFileData ?? undefined,
          uadePatternLayout: uadePatternLayout ?? undefined,
          v2mFileData: v2mFileData ?? undefined,
          adplugFileData: adplugFileData ?? undefined,
          adplugFileName: adplugFileName ?? undefined,
          adplugTicksPerRow: adplugTicksPerRow ?? undefined,
          tfmxFileData: tfmxFileData ?? undefined,
          tfmxSmplData: tfmxSmplData ?? undefined,
          libopenmptFileData: libopenmptFileData ?? undefined,
          // Furnace-specific timing data (only set for .fur imports)
          speed2: furnaceData?.speed2,
          hz: furnaceData?.hz,
          virtualTempoN: furnaceData?.virtualTempoN,
          virtualTempoD: furnaceData?.virtualTempoD,
          compatFlags: furnaceData?.compatFlags as any,
          grooves: furnaceData?.grooves,
          // Furnace native data (required for WASM sequencer bypass)
          furnaceNative: furnaceNative ?? undefined,
          furnaceActiveSubsong: furnaceActiveSubsong ?? undefined,
          // TFMX timing table for position sync
          tfmxTimingTable: tfmxTimingTableRef.current ?? undefined,
        });

        // Apply Furnace compat flags, chip flags, and tuning to the dispatch engine
        const hasCompatFlags = furnaceData?.compatFlags && Object.keys(furnaceData.compatFlags).length > 0;
        const hasChipFlags = furnaceData?.chipFlags && furnaceData.chipFlags.some(f => f && f.length > 0);
        const hasTuning = furnaceData?.tuning !== undefined;
        if (hasCompatFlags || hasChipFlags || hasTuning) {
          import('@engine/furnace-dispatch/FurnaceDispatchEngine').then(({ FurnaceDispatchEngine }) => {
            const engine = FurnaceDispatchEngine.getInstance();

            if (hasCompatFlags) {
              const cf = furnaceData!.compatFlags as Record<string, unknown>;
              if (cf._packed && cf._dispatchFlags) {
                // WASM-parsed: send raw dispatch compat flag bytes to ALL chips
                engine.setCompatFlagsRaw(cf._dispatchFlags as Uint8Array);
              } else {
                // TS-parsed: send named flags (legacy path)
                engine.setCompatFlags(furnaceData!.compatFlags as any);
              }
            }

            // Apply per-chip flags (clock selection, chip model, etc.)
            if (hasChipFlags) {
              for (let i = 0; i < furnaceData!.chipFlags!.length; i++) {
                const flagStr = furnaceData!.chipFlags![i];
                if (flagStr && flagStr.length > 0) {
                  const chipId = furnaceNative?.chipIds?.[i];
                  engine.setChipFlags(flagStr, chipId);
                }
              }
            }

            // Apply tuning (A-4 frequency)
            if (hasTuning) {
              engine.setTuning(furnaceData!.tuning!);
            }
          });
        }

        // Apply stored stereo separation (overrides format default from loadSong)
        replayer.setStereoSeparation(useSettingsStore.getState().stereoSeparation);

        if (needsReload) {
          if (isLooping) {
            // Loop-mode position change: the song is always a 1-entry list,
            // so start the new pattern from the top.
            replayer.seekTo(0, 0);
          } else {
            // Restore position after structural reload in song mode.
            // If the position is out of bounds (e.g. pattern order shrunk), seekTo handles clamping.
            replayer.seekTo(currentSongPos, currentRow);
          }
        } else {
          // Initial start: seek to the current cursor position so playback
          // begins where the user is looking, not from the top of the song.
          const startPos = currentPositionIndexRef.current;
          const startRow = useTransportStore.getState().currentRow;
          if (startPos > 0 || startRow > 0) {
            replayer.seekTo(startPos, startRow);
          }
        }

        // Set callbacks for UI updates
        let lastPatternNum = -1;
        let lastPosition = -1;

        // Format-mode views (HivelyView, etc.) read currentRow from the transport
        // store and don't use getStateAtTime(), so they need every-row updates.
        const isFormatEngine = !!hivelyNative || !!musiclineFileData;

        replayer.onRowChange = (row, patternNum, position) => {
          // Format engines: update currentRow on every row (throttled to 50Hz)
          if (isFormatEngine) {
            const currentPatterns = patternsRef.current;
            setCurrentRowThrottled(row, currentPatterns[patternNum]?.length ?? 64, true);
          }

          // During playback, the standard pattern editor RAF loop reads position
          // directly from getStateAtTime() — no React store updates needed for
          // row scrolling. Only update React stores on pattern/position jumps.
          if (patternNum !== lastPatternNum || position !== lastPosition) {
            lastPatternNum = patternNum;
            lastPosition = position;
            replayerAdvancedRef.current++;
            setTimeout(() => {
              startTransition(() => {
                setCurrentPattern(patternNum, true);
                setCurrentPosition(position, true);
                if (!isFormatEngine) {
                  const currentPatterns = patternsRef.current;
                  setCurrentRowThrottled(row, currentPatterns[patternNum]?.length ?? 64, true);
                }
              });
              const globalRow = position * 64 + row;
              useTransportStore.getState().setCurrentGlobalRow(globalRow);
            }, 0);
          }
        };

        replayer.onChannelRowChange = (channelRows) => {
          useTransportStore.getState().setCurrentRowPerChannel(channelRows);
        };

        replayer.onSongEnd = () => {
          if ((window as any).PLAYBACK_DEBUG) console.log('[Playback] Song ended');
        };

        // Start or resume real-time playback
        // Always call play() - initial start OR after reload
        getTrackerScratchController().notifyPlaybackStarted();
        replayer.play().then(() => {
          // Re-sync mute/solo after play — loadSong() resets channelMuteMask to 0xFFFF.
          // Without this, channels muted before stop would play again after restart.
          import('@stores/useMixerStore').then(({ useMixerStore }) => {
            useMixerStore.getState().reapplyAllMutes();
          }).catch(() => {});
        }).catch((err) => {
          console.error('Failed to start playback:', err);
        });
      }
    } else if (!isPlaying && hasStartedRef.current) {
      // Skip stop if forcePosition is active — it just seeked, don't interrupt
      if (replayerRef.current.skipNextReload) {
        replayerRef.current.skipNextReload = false;
        return;
      }

      // JamCracker: reset hasStartedRef so the next play triggers a fresh
      // loadSong+play. The async play() race that previously caused unwanted
      // restarts is now handled by the generation counter in useTransportStore.
      if (jamCrackerFileData) {
        hasStartedRef.current = false;
        setFormatPlaybackPlaying(false);
        return;
      }

      // MusicLine: same pattern as JamCracker — reset immediately and return.
      // Without this, the generic stop path's replayer.stop() + async cleanup
      // can cause the effect to re-fire with isPlaying=true, restarting the engine.
      if (musiclineFileData && channelTrackTables && channelTrackTables.length > 0) {
        hasStartedRef.current = false;
        return;
      }

      // Stop playback — keep current position (don't reset row/position)
      if ((window as any).PLAYBACK_DEBUG) console.log('[Playback] Stopping playback');
      hasStartedRef.current = false;

      // UADE: stop the song player and clean up channel subscription
      uadeChannelUnsubRef.current?.();
      uadeChannelUnsubRef.current = null;
      setFormatPlaybackPlaying(false);
      const uadeInst = instrumentsRef.current.find(i => i.synthType === 'UADESynth');
      if (uadeInst) {
        const engine = getToneEngine();
        const key = engine.getInstrumentKey(uadeInst.id, -1);
        const synth = engine.instruments.get(key);
        if (synth && 'triggerRelease' in synth) {
          (synth as { triggerRelease: () => void }).triggerRelease();
        }
      }

      replayer.stop();
      replayer.onRowChange = null;
      replayer.onSongEnd = null;
    }

    return () => {
      // Don't stop during forcePosition seek
      if (replayerRef.current.skipNextReload) return;
      // Don't stop JamCracker from cleanup — user's stop handler manages lifecycle
      if (jamCrackerFileData) return;
      if (!isPlaying && hasStartedRef.current) {
        replayerRef.current.stop();
        replayerRef.current.onRowChange = null;
        replayerRef.current.onSongEnd = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- store actions are stable refs;
  // patternOrder tracked via patternOrderKey in patternStructureKey + ref
  }, [isPlaying, isLooping, loopTargetKey, patternStructureKey]);

  return {
    isPlaying,
  };
};
