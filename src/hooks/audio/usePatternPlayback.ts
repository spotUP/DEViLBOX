/**
 * usePatternPlayback - Real-time tick-based pattern playback
 *
 * Uses TrackerReplayer for ALL playback - same architecture as Amiga hardware:
 * - CIA timer fires every tick (2.5 / BPM seconds)
 * - Tick 0: read row data, trigger notes
 * - Ticks 1+: process continuous effects
 */

import { useEffect, useMemo, useRef } from 'react';
import { useTrackerStore, useTransportStore, useInstrumentStore, useAutomationStore, useAudioStore } from '@stores';
import { useArrangementStore } from '@stores/useArrangementStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer, type TrackerFormat } from '@engine/TrackerReplayer';
import { resolveArrangement } from '@lib/arrangement/resolveArrangement';

export const usePatternPlayback = () => {
  const { patterns, currentPatternIndex, setCurrentPattern, patternOrder, currentPositionIndex, setCurrentPosition } = useTrackerStore();
  const { isPlaying, isLooping, bpm, setCurrentRow, setCurrentRowThrottled } = useTransportStore();
  const { instruments } = useInstrumentStore();
  useAutomationStore();
  const { masterEffects } = useAudioStore();

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

  // Track if we've started playback
  const hasStartedRef = useRef(false);

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

  // Handle playback start/stop
  useEffect(() => {
    const replayer = replayerRef.current;
    
    // IF we are playing and the song structure changed, we need to RELOAD the song in the replayer
    // otherwise it won't know about the new patterns (like B/D animation helpers)
    if (isPlaying && pattern) {
      const arrangement = useArrangementStore.getState();
      
      // Determine if we need to reload. 
      // We ignore reloads if we are already playing and the replayer position 
      // matches the store position (meaning it was a natural advancement).
      const isNaturalAdvancement = hasStartedRef.current && 
                                   replayer.isPlaying() && 
                                   replayer.getCurrentPosition() === currentPositionIndexRef.current;
      
      const needsReload = hasStartedRef.current && !isNaturalAdvancement;

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

        // Ensure WASM synths (Furnace, TB303, etc.) are fully initialized before loading song
        // and starting playback. This prevents 'triggerAttack blocked: ready=false' errors.
        getToneEngine().ensureWASMSynthsReady(instruments).catch(err => {
          console.error('[Playback] Failed to ensure WASM synths ready:', err);
        });

        // Load song into TrackerReplayer
        replayer.loadSong({
          name: pattern.importMetadata?.sourceFile ?? pattern.name ?? 'Untitled',
          format,
          patterns: effectivePatterns,
          instruments,
          songPositions: effectiveSongPositions,
          songLength: effectiveSongLength,
          restartPosition: 0,
          numChannels: effectiveNumChannels,
          initialSpeed: modData?.initialSpeed ?? 6,
          initialBPM: modData?.initialBPM ?? bpm,
        });

        if (needsReload) {
          // Restore position after reload
          // If the position is out of bounds (e.g. pattern order shrunk), seekTo handles clamping
          replayer.seekTo(currentSongPos, currentRow);
        }

        // Set callbacks for UI updates
        let lastPatternNum = -1;
        let lastPosition = -1;

        replayer.onRowChange = (row, patternNum, position) => {
          // If row is 0 or position changed, it's a jump or pattern start.
          // Update immediately to prevent "ghost" frames from old position.
          const isJump = row === 0 || position !== lastPosition;
          setCurrentRowThrottled(row, effectivePatterns[patternNum]?.length ?? 64, isJump);

          if (arrangement.isArrangementMode) {
            const globalRow = position * 64 + row;
            useArrangementStore.getState().setPlaybackRow(globalRow);
            useTransportStore.getState().setCurrentGlobalRow(globalRow);
          }

          if (row === 0 && (patternNum !== lastPatternNum || position !== lastPosition)) {
            lastPatternNum = patternNum;
            lastPosition = position;
            queueMicrotask(() => {
              setCurrentPattern(patternNum);
              setCurrentPosition(position);
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
      // Stop playback
      console.log('[Playback] Stopping playback');
      hasStartedRef.current = false;
      replayer.stop();
      replayer.onRowChange = null;
      replayer.onSongEnd = null;
      setCurrentRow(0);
    }

    return () => {
      if (!isPlaying && hasStartedRef.current) {
        replayerRef.current.stop();
        replayerRef.current.onRowChange = null;
        replayerRef.current.onSongEnd = null;
      }
    };
  }, [isPlaying, isLooping, pattern, instruments, patternOrder, patterns, bpm, setCurrentPattern, setCurrentPosition, setCurrentRow, setCurrentRowThrottled]);

  return {
    isPlaying,
  };
};
