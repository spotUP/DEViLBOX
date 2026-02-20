/**
 * usePatternPlayback - Real-time tick-based pattern playback
 *
 * Uses TrackerReplayer for ALL playback - same architecture as Amiga hardware:
 * - CIA timer fires every tick (2.5 / BPM seconds)
 * - Tick 0: read row data, trigger notes
 * - Ticks 1+: process continuous effects
 */

import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTrackerStore, useTransportStore, useInstrumentStore, useAudioStore, useSettingsStore } from '@stores';
import { useArrangementStore } from '@stores/useArrangementStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer, type TrackerFormat } from '@engine/TrackerReplayer';
import { resolveArrangement } from '@lib/arrangement/resolveArrangement';

export const usePatternPlayback = () => {
  const { patterns, currentPatternIndex, setCurrentPattern, patternOrder, currentPositionIndex, setCurrentPosition } = useTrackerStore(useShallow((s) => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
    setCurrentPattern: s.setCurrentPattern,
    patternOrder: s.patternOrder,
    currentPositionIndex: s.currentPositionIndex,
    setCurrentPosition: s.setCurrentPosition,
  })));
  const { isPlaying, isLooping, bpm, setCurrentRow, setCurrentRowThrottled } = useTransportStore(useShallow((s) => ({
    isPlaying: s.isPlaying,
    isLooping: s.isLooping,
    bpm: s.bpm,
    setCurrentRow: s.setCurrentRow,
    setCurrentRowThrottled: s.setCurrentRowThrottled,
  })));
  const { instruments } = useInstrumentStore();
  const { masterEffects } = useAudioStore();
  const isArrangementMode = useArrangementStore((state) => state.isArrangementMode);

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
  const patternStructureKey = useMemo(() => {
    if (!pattern) return '';
    return `${patterns.length}:${pattern.channels.length}:${pattern.length}:${pattern.importMetadata?.sourceFormat ?? ''}`;
  }, [patterns.length, pattern?.channels.length, pattern?.length, pattern?.importMetadata?.sourceFormat]);

  // Track if we've started playback
  const hasStartedRef = useRef(false);

  // Flag to distinguish replayer-driven position changes from user-driven ones.
  // Without this, the replayer's 100ms lookahead scheduling means its getCurrentPosition()
  // can be ahead of the store's currentPositionIndex when React re-renders. This causes
  // isNaturalAdvancement to fail, triggering a full song reload at every pattern boundary,
  // which resets the scheduler timeline and creates ~100ms cumulative drift per pattern.
  const replayerAdvancedRef = useRef(false);

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
      const wasReplayerAdvanced = replayerAdvancedRef.current;
      replayerAdvancedRef.current = false;

      const isNaturalAdvancement = hasStartedRef.current &&
                                   replayer.isPlaying() &&
                                   wasReplayerAdvanced;

      const needsReload = hasStartedRef.current && !isNaturalAdvancement;
      const format = (pattern.importMetadata?.sourceFormat as TrackerFormat) || 'XM';

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
        let effectiveNumChannels = pattern.channels.length;

        if (arrangement.isArrangementMode && arrangement.clips.length > 0) {
          // --- Arrangement Mode ---
          const resolved = resolveArrangement(
            arrangement.clips,
            arrangement.tracks,
            patterns,
            modData?.initialSpeed ?? 6,
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
          initialSpeed: modData?.initialSpeed ?? 6,
          initialBPM: modData?.initialBPM ?? bpmRef.current,
          // Furnace-specific timing data (only set for .fur imports)
          speed2: furnaceData?.speed2,
          hz: furnaceData?.hz,
          virtualTempoN: furnaceData?.virtualTempoN,
          virtualTempoD: furnaceData?.virtualTempoD,
          compatFlags: furnaceData?.compatFlags as any,
          grooves: furnaceData?.grooves,
        });

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
          // If row is 0 or position changed, it's a jump or pattern start.
          // Update immediately to prevent "ghost" frames from old position.
          const isJump = row === 0 || position !== lastPosition;
          // Read from ref so pattern lengths stay current after hot-swaps
          const currentPatterns = patternsRef.current;
          setCurrentRowThrottled(row, currentPatterns[patternNum]?.length ?? 64, isJump);

          if (arrangement.isArrangementMode) {
            const globalRow = position * 64 + row;
            useArrangementStore.getState().setPlaybackRow(globalRow);
            useTransportStore.getState().setCurrentGlobalRow(globalRow);
          }

          if (row === 0 && (patternNum !== lastPatternNum || position !== lastPosition)) {
            lastPatternNum = patternNum;
            lastPosition = position;
            // Mark as replayer-driven BEFORE the state update so the useEffect
            // knows this position change came from natural playback advancement,
            // not a user action. This prevents false reloads at pattern boundaries.
            replayerAdvancedRef.current = true;
            queueMicrotask(() => {
              setCurrentPattern(patternNum, true);
              setCurrentPosition(position, true);
            });
          }
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
  }, [isPlaying, isLooping, loopTargetKey, patternStructureKey, patternOrder, setCurrentPattern, setCurrentPosition, setCurrentRow, setCurrentRowThrottled, isArrangementMode]);

  return {
    isPlaying,
  };
};
