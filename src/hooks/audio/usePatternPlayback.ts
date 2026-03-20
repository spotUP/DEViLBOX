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
import { useArrangementStore } from '@stores/useArrangementStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer, type TrackerFormat } from '@engine/TrackerReplayer';
import { resolveArrangement } from '@lib/arrangement/resolveArrangement';
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
  const { channelTrackTables, channelSpeeds, channelGrooves, hivelyNative, hivelyFileData, hivelyMeta, musiclineFileData, c64SidFileData, jamCrackerFileData, futurePlayerFileData, preTrackerFileData, maFileData, hippelFileData, sonixFileData, pxtoneFileData, organyaFileData, eupFileData, ixsFileData, psycleFileData, sc68FileData, zxtuneFileData, pumaTrackerFileData, steveTurnerFileData, artOfNoiseFileData, bdFileData, sd2FileData, symphonieFileData, uadeEditableFileData, libopenmptFileData, furnaceNative, furnaceActiveSubsong } = useFormatStore(useShallow((s) => ({
    channelTrackTables: s.channelTrackTables,
    channelSpeeds: s.channelSpeeds,
    channelGrooves: s.channelGrooves,
    hivelyNative: s.hivelyNative,
    hivelyFileData: s.hivelyFileData,
    hivelyMeta: s.hivelyMeta,
    musiclineFileData: s.musiclineFileData,
    c64SidFileData: s.c64SidFileData,
    jamCrackerFileData: s.jamCrackerFileData,
    futurePlayerFileData: s.futurePlayerFileData,
    preTrackerFileData: s.preTrackerFileData,
    maFileData: s.maFileData,
    hippelFileData: s.hippelFileData,
    sonixFileData: s.sonixFileData,
    pxtoneFileData: s.pxtoneFileData,
    organyaFileData: s.organyaFileData,
    eupFileData: s.eupFileData,
    ixsFileData: s.ixsFileData,
    psycleFileData: s.psycleFileData,
    sc68FileData: s.sc68FileData,
    zxtuneFileData: s.zxtuneFileData,
    pumaTrackerFileData: s.pumaTrackerFileData,
    steveTurnerFileData: s.steveTurnerFileData,
    artOfNoiseFileData: s.artOfNoiseFileData,
    bdFileData: s.bdFileData,
    sd2FileData: s.sd2FileData,
    symphonieFileData: s.symphonieFileData,
    uadeEditableFileData: s.uadeEditableFileData,
    libopenmptFileData: s.libopenmptFileData,
    furnaceNative: s.furnaceNative,
    furnaceActiveSubsong: s.furnaceActiveSubsong,
  })));
  const linearPeriods = useEditorStore((s) => s.linearPeriods);
  const { isPlaying, isLooping, bpm, speed: transportSpeed, setCurrentRow, setCurrentRowThrottled } = useTransportStore(useShallow((s) => ({
    isPlaying: s.isPlaying,
    isLooping: s.isLooping,
    bpm: s.bpm,
    speed: s.speed,
    setCurrentRow: s.setCurrentRow,
    setCurrentRowThrottled: s.setCurrentRowThrottled,
  })));
  const { instruments } = useInstrumentStore(useShallow((s) => ({ instruments: s.instruments })));
  const { masterEffects } = useAudioStore(useShallow((s) => ({ masterEffects: s.masterEffects })));
  const isArrangementMode = useArrangementStore((state) => state.isArrangementMode);
  const loopStart = useArrangementStore((state) => state.view.loopStart);
  const loopEnd = useArrangementStore((state) => state.view.loopEnd);

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
  const bpmRef = useRef(bpm);
  useEffect(() => {
    patternRef.current = pattern;
    patternsRef.current = patterns;
    bpmRef.current = bpm;
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
  // Also includes arrangement loop bounds so a loop region change triggers a reload.
  const patternStructureKey = useMemo(() => {
    if (!pattern) return '';
    const loopBoundsKey = (isArrangementMode && isLooping && loopStart != null && loopEnd != null)
      ? `:loop:${loopStart}-${loopEnd}`
      : '';
    return `${patterns.length}:${pattern.channels.length}:${pattern.length}:${pattern.importMetadata?.sourceFormat ?? ''}${loopBoundsKey}`;
  }, [patterns.length, pattern?.channels.length, pattern?.length, pattern?.importMetadata?.sourceFormat, isArrangementMode, isLooping, loopStart, loopEnd]);

  // Track if we've started playback
  const hasStartedRef = useRef(false);
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
  const masterEffectsKey = useMemo(
    () => masterEffects.map(e => `${e.id}:${e.enabled}:${e.type}`).join('|'),
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
      const arrangement = useArrangementStore.getState();

      // Determine if we need to reload.
      // Use the replayerAdvancedRef flag to detect natural position advances.
      // The old approach (comparing replayer.getCurrentPosition() with store position)
      // failed because the replayer's 100ms lookahead scheduling meant it was often
      // 1+ positions ahead of the store when React re-rendered, causing false reloads.
      const wasReplayerAdvanced = replayerAdvancedRef.current > 0;
      replayerAdvancedRef.current = 0;

      const isNaturalAdvancement = hasStartedRef.current &&
                                   replayer.isPlaying() &&
                                   wasReplayerAdvanced;

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
          console.log('[Playback] Starting UADE playback (opaque song player)');
          // Find the UADESynth instrument instance and trigger playback directly.
          // Must await engine readiness — setInstrument() is fire-and-forget during preload.
          const engine = getToneEngine();
          const uadeInst = instrumentsRef.current.find(i => i.synthType === 'UADESynth');
          if (uadeInst) {
            const key = engine.getInstrumentKey(uadeInst.id, -1);
            let synth = engine.instruments.get(key);
            // If the synth isn't in the map yet (preload race), create it now
            if (!synth) {
              console.log('[Playback] UADESynth not cached, creating via getInstrument');
              synth = engine.getInstrument(uadeInst.id, uadeInst) ?? undefined;
            }
            if (synth && 'getEngine' in synth) {
              const uadeEngine = (synth as { getEngine: () => UADEEngine }).getEngine();
              uadeEngine.ready().then(() => {
                console.log('[Playback] UADE engine ready, starting playback');
                uadeEngine.play();

                // Subscribe to channel data for playback position tracking.
                // Pattern data is pre-populated at import time via scan — we just
                // need to advance the row/pattern cursor as the song plays.
                // Use totalFrames to compute position matching the scan's fixed row rate.
                uadeChannelUnsubRef.current?.();
                const framesPerRow = Math.round(44100 * 2.5 * 6 / 125); // ~5292 at standard Amiga rate
                uadeChannelUnsubRef.current = uadeEngine.onChannelData((_channels, totalFrames) => {
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

      if (!hasStartedRef.current || needsReload) {
        hasStartedRef.current = true;

        if (needsReload) {
          console.log(`[Playback] Reloading: replayerPos=${replayer.getCurrentPosition()}, storePos=${currentPositionIndexRef.current}`);
        }
        const modData = pattern.importMetadata?.modData;

        console.log(`[Playback] ${needsReload ? 'Reloading' : 'Starting'} real-time playback (${format}), arrangement=${arrangement.isArrangementMode}`);

        let effectivePatterns = patterns;
        let effectiveSongPositions: number[];
        let effectiveSongLength: number;
        // For per-channel formats (MusicLine etc.), each PART pattern has only 1 channel,
        // but the song has N channels (one per track table). Use the track table count.
        let effectiveNumChannels = (channelTrackTables && channelTrackTables.length > 0)
          ? channelTrackTables.length
          : pattern.channels.length;

        if (arrangement.isArrangementMode && arrangement.clips.length > 0) {
          // --- Arrangement Mode ---
          // When looping with a loop region set, pass bounds to resolveArrangement
          // so only the loop region's clips are included and the audio loops within it.
          const useLoopBounds = isLooping &&
            arrangement.view.loopStart != null &&
            arrangement.view.loopEnd != null;
          const resolved = resolveArrangement(
            arrangement.clips,
            arrangement.tracks,
            patterns,
            modData?.initialSpeed ?? transportSpeed,
            useLoopBounds ? arrangement.view.loopStart! : undefined,
            useLoopBounds ? arrangement.view.loopEnd! : undefined,
          );

          effectivePatterns = resolved.virtualPatterns;
          effectiveSongPositions = resolved.songPositions;
          effectiveSongLength = resolved.songPositions.length;
          effectiveNumChannels = resolved.virtualPatterns[0]?.channels?.length ?? pattern.channels.length;
        } else {
          // --- Legacy Pattern Order Mode ---
          const loopPatternOrder = isLooping ? [currentPatternIndex] : patternOrder;
          effectiveSongPositions = loopPatternOrder;
          effectiveSongLength = isLooping ? 1 : (modData?.songLength ?? patternOrder.length);
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
          restartPosition: 0,
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
          // JamCracker raw binary (required for JamCrackerEngine WASM)
          jamCrackerFileData: jamCrackerFileData ?? undefined,
          futurePlayerFileData: futurePlayerFileData ?? undefined,
          preTrackerFileData: preTrackerFileData ?? undefined,
          maFileData: maFileData ?? undefined,
          hippelFileData: hippelFileData ?? undefined,
          sonixFileData: sonixFileData ?? undefined,
          pxtoneFileData: pxtoneFileData ?? undefined,
          organyaFileData: organyaFileData ?? undefined,
          eupFileData: eupFileData ?? undefined,
          ixsFileData: ixsFileData ?? undefined,
          psycleFileData: psycleFileData ?? undefined,
          sc68FileData: sc68FileData ?? undefined,
          zxtuneFileData: zxtuneFileData ?? undefined,
          pumaTrackerFileData: pumaTrackerFileData ?? undefined,
          steveTurnerFileData: steveTurnerFileData ?? undefined,
          artOfNoiseFileData: artOfNoiseFileData ?? undefined,
          bdFileData: bdFileData ?? undefined,
          sd2FileData: sd2FileData ?? undefined,
          symphonieFileData: symphonieFileData ?? undefined,
          uadeEditableFileData: uadeEditableFileData ?? undefined,
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

        replayer.onRowChange = (row, patternNum, position) => {
          // During playback, the pattern editor RAF loop reads position directly
          // from getStateAtTime() — no React store updates needed for row scrolling.
          // Only update React stores on pattern/position jumps (infrequent).
          if (row === 0 && (patternNum !== lastPatternNum || position !== lastPosition)) {
            lastPatternNum = patternNum;
            lastPosition = position;
            replayerAdvancedRef.current++;
            // Use setTimeout(0) instead of queueMicrotask: microtasks drain before
            // the next macrotask (setInterval), so React re-renders from Zustand
            // store updates would block the scheduler's next interval callback.
            // setTimeout(0) defers to the macrotask queue, letting the scheduler
            // fire on time even when React work is heavy at pattern boundaries.
            setTimeout(() => {
              // startTransition: marks these store updates as non-urgent so React
              // doesn't block higher-priority work (WASM postMessage processing,
              // Pixi RAF callbacks) to run them immediately.
              startTransition(() => {
                setCurrentPattern(patternNum, true);
                setCurrentPosition(position, true);
                // Update global row and status bar only on pattern boundaries
                const currentPatterns = patternsRef.current;
                setCurrentRowThrottled(row, currentPatterns[patternNum]?.length ?? 64, true);
              });
              const globalRow = position * 64 + row;
              useTransportStore.getState().setCurrentGlobalRow(globalRow);
              if (arrangement.isArrangementMode) {
                useArrangementStore.getState().setPlaybackRow(globalRow);
              }
            }, 0);
          }
        };

        replayer.onChannelRowChange = (channelRows) => {
          useTransportStore.getState().setCurrentRowPerChannel(channelRows);
        };

        replayer.onSongEnd = () => {
          console.log('[Playback] Song ended');
        };

        // Start or resume real-time playback
        // Always call play() - initial start OR after reload
        replayer.play().catch((err) => {
          console.error('Failed to start playback:', err);
        });
      }
    } else if (!isPlaying && hasStartedRef.current) {
      // Stop playback — keep current position (don't reset row/position)
      console.log('[Playback] Stopping playback');
      hasStartedRef.current = false;

      // UADE: stop the song player and clean up channel subscription
      uadeChannelUnsubRef.current?.();
      uadeChannelUnsubRef.current = null;
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
      if (!isPlaying && hasStartedRef.current) {
        replayerRef.current.stop();
        replayerRef.current.onRowChange = null;
        replayerRef.current.onSongEnd = null;
      }
    };
  }, [isPlaying, isLooping, loopTargetKey, patternStructureKey, patternOrder, setCurrentPattern, setCurrentPosition, setCurrentRow, setCurrentRowThrottled, isArrangementMode, loopStart, loopEnd]);

  return {
    isPlaying,
  };
};
