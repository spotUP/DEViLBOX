/**
 * usePatternPlayback - Real-time tick-based pattern playback
 *
 * Uses TrackerReplayer for ALL playback - same architecture as Amiga hardware:
 * - CIA timer fires every tick (2.5 / BPM seconds)
 * - Tick 0: read row data, trigger notes
 * - Ticks 1+: process continuous effects
 */

import { useEffect, useRef } from 'react';
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

  // Sync master effects
  useEffect(() => {
    engineRef.current.rebuildMasterEffects(masterEffects);
  }, [masterEffects]);

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
    if (isPlaying && pattern && !hasStartedRef.current) {
      hasStartedRef.current = true;

      // Check arrangement mode
      const arrangement = useArrangementStore.getState();

      // Determine format from metadata or default to XM
      const format = (pattern.importMetadata?.sourceFormat ?? 'XM') as TrackerFormat;
      const modData = pattern.importMetadata?.modData;

      console.log(`[Playback] Starting real-time playback (${format}), arrangement=${arrangement.isArrangementMode}`);
      console.log(`[Playback] ${patterns.length} patterns, ${patternOrder.length} positions, ${pattern.channels.length} channels`);

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

        console.log(`[Playback] Arrangement resolved: ${resolved.totalRows} rows, ${effectiveSongLength} chunks, ${effectiveNumChannels} channels`);
      } else {
        // --- Legacy Pattern Order Mode ---
        const loopPatternOrder = isLooping ? [currentPatternIndex] : patternOrder;
        effectiveSongPositions = loopPatternOrder;
        effectiveSongLength = isLooping ? 1 : (modData?.songLength ?? patternOrder.length);
      }

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

      // Set callbacks for UI updates
      // PERF: Track last values to avoid redundant store updates
      let lastPatternNum = -1;
      let lastPosition = -1;

      replayer.onRowChange = (row, patternNum, position) => {
        setCurrentRowThrottled(row, effectivePatterns[patternNum]?.length ?? 64);

        // Update arrangement global row for timeline playhead
        if (arrangement.isArrangementMode) {
          const globalRow = position * 64 + row; // Approximate: chunk * CHUNK_SIZE + row
          useArrangementStore.getState().setPlaybackRow(globalRow);
          useTransportStore.getState().setCurrentGlobalRow(globalRow);
        }

        // Only update pattern/position if they actually changed (avoids redundant renders)
        if (row === 0 && (patternNum !== lastPatternNum || position !== lastPosition)) {
          lastPatternNum = patternNum;
          lastPosition = position;
          // Batch these updates in a microtask to avoid blocking the audio callback
          queueMicrotask(() => {
            setCurrentPattern(patternNum);
            setCurrentPosition(position);
          });
        }
      };

      replayer.onSongEnd = () => {
        console.log('[Playback] Song ended');
        // Could trigger stop or loop behavior here
      };

      // Start real-time playback
      replayer.play().catch((err) => {
        console.error('Failed to start playback:', err);
      });

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
  }, [isPlaying, isLooping, pattern, instruments, patternOrder, patterns, bpm, currentPatternIndex, setCurrentPattern, setCurrentPosition, setCurrentRow, setCurrentRowThrottled]);

  return {
    isPlaying,
  };
};
