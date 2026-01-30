/**
 * usePatternPlayback - Real-time tick-based pattern playback
 *
 * Uses TrackerReplayer for ALL playback - same architecture as Amiga hardware:
 * - CIA timer fires every tick (2.5 / BPM seconds)
 * - Tick 0: read row data, trigger notes
 * - Ticks 1+: process continuous effects
 */

import { useEffect, useCallback as _useCallback, useRef } from 'react';
import { useTrackerStore, useTransportStore, useInstrumentStore, useAutomationStore, useAudioStore } from '@stores';
import { useLiveModeStore as _useLiveModeStore } from '@stores/useLiveModeStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer, type TrackerFormat } from '@engine/TrackerReplayer';

export const usePatternPlayback = () => {
  const { patterns, currentPatternIndex, setCurrentPattern, patternOrder, currentPositionIndex, setCurrentPosition } = useTrackerStore();
  const { isPlaying, isLooping: _isLooping, bpm, setCurrentRow, setCurrentRowThrottled } = useTransportStore();
  const { instruments } = useInstrumentStore();
  const { automation: _automation } = useAutomationStore();
  const { masterEffects } = useAudioStore();

  const actualPatternIndex = patternOrder[currentPositionIndex] ?? currentPatternIndex;
  const pattern = patterns[actualPatternIndex];
  const engine = getToneEngine();
  const replayer = getTrackerReplayer();

  // Track if we've started playback
  const hasStartedRef = useRef(false);

  // Sync BPM changes to engine (for visualization, metronome, etc.)
  useEffect(() => {
    engine.setBPM(bpm);
  }, [bpm]);

  // Sync master effects
  useEffect(() => {
    engine.rebuildMasterEffects(masterEffects);
  }, [masterEffects]);

  // Sync channel settings when pattern changes
  useEffect(() => {
    if (pattern) {
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
    if (isPlaying && pattern && !hasStartedRef.current) {
      hasStartedRef.current = true;

      // Determine format from metadata or default to XM
      const format = (pattern.importMetadata?.sourceFormat ?? 'XM') as TrackerFormat;
      const modData = pattern.importMetadata?.modData;

      console.log(`[Playback] Starting real-time playback (${format})`);
      console.log(`[Playback] ${patterns.length} patterns, ${patternOrder.length} positions, ${pattern.channels.length} channels`);

      // Load song into TrackerReplayer
      replayer.loadSong({
        name: pattern.importMetadata?.sourceFile ?? pattern.name ?? 'Untitled',
        format,
        patterns,
        instruments,
        songPositions: patternOrder,
        songLength: modData?.songLength ?? patternOrder.length,
        restartPosition: modData?.restartPosition ?? 0,
        numChannels: pattern.channels.length,
        initialSpeed: modData?.initialSpeed ?? 6,
        initialBPM: modData?.initialBPM ?? bpm,
      });

      // Set callbacks for UI updates
      replayer.onRowChange = (row, patternNum, position) => {
        setCurrentRowThrottled(row, patterns[patternNum]?.length ?? 64);
        if (row === 0) {
          setCurrentPattern(patternNum);
          setCurrentPosition(position);
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
        replayer.stop();
        replayer.onRowChange = null;
        replayer.onSongEnd = null;
      }
    };
  }, [isPlaying, pattern, instruments, patternOrder, patterns, bpm, setCurrentPattern, setCurrentPosition, setCurrentRow, setCurrentRowThrottled]);

  return {
    isPlaying,
  };
};
