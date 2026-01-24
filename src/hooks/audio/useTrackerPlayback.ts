/**
 * useTrackerPlayback - Real-time tick-based playback for all tracker formats
 *
 * This hook uses TrackerReplayer for accurate playback of MOD, XM, IT, S3M files.
 * It replaces the old pre-scheduled PatternScheduler approach with real-time
 * tick processing like the original hardware.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import {
  getTrackerReplayer,
  type TrackerSong,
  type TrackerFormat,
} from '@/engine/TrackerReplayer';
import type { Pattern } from '@/types';
import type { InstrumentConfig } from '@/types/instrument';

interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentRow: number;
  currentPattern: number;
  currentPosition: number;
  currentTick: number;
  speed: number;
  bpm: number;
}

interface UseTrackerPlaybackOptions {
  onRowChange?: (row: number, pattern: number, position: number) => void;
  onSongEnd?: () => void;
  onTickProcess?: (tick: number, row: number) => void;
}

/**
 * Hook for real-time tracker playback
 */
export function useTrackerPlayback(options: UseTrackerPlaybackOptions = {}) {
  const [state, setState] = useState<PlaybackState>({
    isPlaying: false,
    isPaused: false,
    currentRow: 0,
    currentPattern: 0,
    currentPosition: 0,
    currentTick: 0,
    speed: 6,
    bpm: 125,
  });

  const replayerRef = useRef(getTrackerReplayer());

  // Set up callbacks
  useEffect(() => {
    const replayer = replayerRef.current;

    replayer.onRowChange = (row, pattern, position) => {
      setState(prev => ({
        ...prev,
        currentRow: row,
        currentPattern: pattern,
        currentPosition: position,
        speed: replayer.getSpeed(),
        bpm: replayer.getBPM(),
      }));

      options.onRowChange?.(row, pattern, position);
    };

    replayer.onSongEnd = () => {
      options.onSongEnd?.();
    };

    // PERF: Don't update React state on every tick - it blocks audio scheduling!
    // currentTick is not used in any UI components, so we only call the optional callback
    replayer.onTickProcess = (tick, row) => {
      options.onTickProcess?.(tick, row);
    };

    return () => {
      replayer.onRowChange = null;
      replayer.onSongEnd = null;
      replayer.onTickProcess = null;
    };
  }, [options.onRowChange, options.onSongEnd, options.onTickProcess]);

  /**
   * Load patterns and instruments for playback
   */
  const loadSong = useCallback((
    patterns: Pattern[],
    instruments: InstrumentConfig[],
    songPositions: number[],
    options: {
      name?: string;
      format?: TrackerFormat;
      songLength?: number;
      restartPosition?: number;
      initialSpeed?: number;
      initialBPM?: number;
    } = {}
  ) => {
    const replayer = replayerRef.current;

    const song: TrackerSong = {
      name: options.name ?? 'Untitled',
      format: options.format ?? 'MOD',
      patterns,
      instruments,
      songPositions,
      songLength: options.songLength ?? songPositions.length,
      restartPosition: options.restartPosition ?? 0,
      numChannels: patterns[0]?.channels.length ?? 4,
      initialSpeed: options.initialSpeed ?? 6,
      initialBPM: options.initialBPM ?? 125,
    };

    replayer.loadSong(song);

    setState(prev => ({
      ...prev,
      speed: song.initialSpeed,
      bpm: song.initialBPM,
      currentRow: 0,
      currentPosition: 0,
      currentPattern: songPositions[0] ?? 0,
      currentTick: 0,
    }));

    console.log(`[useTrackerPlayback] Loaded: ${song.name}, ${song.numChannels}ch, ${patterns.length} patterns`);
  }, []);

  /**
   * Start playback
   */
  const play = useCallback(async () => {
    await Tone.start();
    await replayerRef.current.play();
    setState(prev => ({ ...prev, isPlaying: true, isPaused: false }));
  }, []);

  /**
   * Stop playback
   */
  const stop = useCallback(() => {
    replayerRef.current.stop();
    setState(prev => ({
      ...prev,
      isPlaying: false,
      isPaused: false,
      currentRow: 0,
      currentPosition: 0,
      currentTick: 0,
    }));
  }, []);

  /**
   * Pause playback
   */
  const pause = useCallback(() => {
    replayerRef.current.pause();
    setState(prev => ({ ...prev, isPlaying: false, isPaused: true }));
  }, []);

  /**
   * Resume playback
   */
  const resume = useCallback(() => {
    replayerRef.current.resume();
    setState(prev => ({ ...prev, isPlaying: true, isPaused: false }));
  }, []);

  /**
   * Toggle play/pause
   */
  const togglePlayback = useCallback(async () => {
    if (state.isPlaying) {
      pause();
    } else if (state.isPaused) {
      resume();
    } else {
      await play();
    }
  }, [state.isPlaying, state.isPaused, play, pause, resume]);

  // Cleanup
  useEffect(() => {
    return () => {
      replayerRef.current.stop();
    };
  }, []);

  return {
    ...state,
    loadSong,
    play,
    stop,
    pause,
    resume,
    togglePlayback,
  };
}

export default useTrackerPlayback;
