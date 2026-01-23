/**
 * usePatternPlayback - Real-time tick-based pattern playback
 *
 * Uses TrackerReplayer for ALL playback - same architecture as Amiga hardware:
 * - CIA timer fires every tick (2.5 / BPM seconds)
 * - Tick 0: read row data, trigger notes
 * - Ticks 1+: process continuous effects
 */

import { useEffect, useRef } from 'react';
import { useTrackerStore, useTransportStore, useInstrumentStore, useAudioStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer, type TrackerFormat } from '@engine/TrackerReplayer';

// Destructure setSpeed for use in callbacks (avoids stale closure issues)
const getSetSpeed = () => useTransportStore.getState().setSpeed;

export const usePatternPlayback = () => {
  const { patterns, currentPatternIndex, setCurrentPattern, patternOrder, currentPositionIndex, setCurrentPosition } = useTrackerStore();
  const { isPlaying, bpm, setCurrentRow, setCurrentRowThrottled } = useTransportStore();
  const { instruments } = useInstrumentStore();
  const { masterEffects } = useAudioStore();

  const actualPatternIndex = patternOrder[currentPositionIndex] ?? currentPatternIndex;
  const pattern = patterns[actualPatternIndex];
  const engine = getToneEngine();
  const replayer = getTrackerReplayer();

  // Track if we've started playback
  const hasStartedRef = useRef(false);

  // Track last pattern/position/speed to avoid unnecessary state updates
  const lastPatternRef = useRef(-1);
  const lastPositionRef = useRef(-1);
  const lastSpeedRef = useRef(-1);

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


      // Start playback asynchronously after preloading instruments
      const startPlayback = async () => {
        // Preload all instruments into ToneEngine
        await engine.preloadInstruments(instruments);

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

        // Sync initial speed from replayer
        getSetSpeed()(replayer.getSpeed());

        // Set callbacks for UI updates
        replayer.onRowChange = (row, patternNum, position) => {
          setCurrentRowThrottled(row, patterns[patternNum]?.length ?? 64);
          // Sync speed only when it changes (Fxx command)
          const currentSpeed = replayer.getSpeed();
          if (currentSpeed !== lastSpeedRef.current) {
            lastSpeedRef.current = currentSpeed;
            getSetSpeed()(currentSpeed);
          }
          // Only update pattern/position when they actually change (avoid unnecessary re-renders)
          if (patternNum !== lastPatternRef.current) {
            lastPatternRef.current = patternNum;
            setCurrentPattern(patternNum);
          }
          if (position !== lastPositionRef.current) {
            lastPositionRef.current = position;
            setCurrentPosition(position);
          }
        };

        replayer.onSongEnd = () => {
          // Could trigger stop or loop behavior here
        };

        // Start real-time playback
        await replayer.play();
      };

      startPlayback().catch((err) => {
        console.error('Failed to start playback:', err);
      });

    } else if (!isPlaying && hasStartedRef.current) {
      // Stop playback
      hasStartedRef.current = false;
      lastPatternRef.current = -1;
      lastPositionRef.current = -1;
      lastSpeedRef.current = -1;
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
