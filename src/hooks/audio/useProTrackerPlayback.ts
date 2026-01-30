/**
 * useProTrackerPlayback - Hook for ProTracker-accurate MOD playback
 *
 * Uses the tick-based ProTrackerReplayer for 1:1 Amiga-accurate playback.
 * This bypasses the PatternScheduler for MOD files.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import {
  getProTrackerReplayer,
  convertToPTModule,
  type PTModule,
  type PTSample,
} from '@/engine/ProTrackerPlayer';
import type { Pattern } from '@/types';
import type { InstrumentConfig } from '@/types/instrument';

interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentRow: number;
  currentPattern: number;
  currentPosition: number;
  speed: number;
  bpm: number;
}

interface UseProTrackerPlaybackOptions {
  onRowChange?: (row: number, pattern: number, position: number) => void;
  onSongEnd?: () => void;
}

/**
 * Convert DEViLBOX Pattern to PTCell format for the replayer
 */
function convertPatternToPTCells(pattern: Pattern): import('@/engine/ProTrackerPlayer').PTCell[][] {
  const rows: import('@/engine/ProTrackerPlayer').PTCell[][] = [];

  for (let row = 0; row < pattern.length; row++) {
    const rowData: import('@/engine/ProTrackerPlayer').PTCell[] = [];

    for (let ch = 0; ch < pattern.channels.length; ch++) {
      const cell = pattern.channels[ch].rows[row];

      // Convert cell to PTCell format
      let note = 0; // Period value
      let sample = 0;
      let effect = 0;
      let param = 0;

      // Handle note (XM numeric format or string)
      if (typeof cell.note === 'number' && cell.note > 0 && cell.note < 97) {
        // XM note to period: XM note 1 = C-0, note 49 = C-4
        // ProTracker period table starts at C-1 (note index 0)
        // XM note 13 = C-1 (period 856), XM note 25 = C-2 (period 428)
        const noteIndex = cell.note - 1; // 0-95
        if (noteIndex >= 12 && noteIndex < 48) {
          // Notes in ProTracker range (C-1 to B-3)
          const ptNoteIndex = noteIndex - 12; // 0-35
          // Get period from table (finetune 0)
          const periodTableFT0 = [
            856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
            428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
            214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
          ];
          note = periodTableFT0[ptNoteIndex] || 0;
        }
      } else if (typeof cell.note === 'string' && cell.note !== '...' && cell.note !== '===') {
        // String format note (e.g., "C-4", "C#3")
        note = noteStringToPeriod(cell.note);
      }

      // Handle instrument -> sample
      if (cell.instrument && cell.instrument > 0) {
        sample = cell.instrument;
      }

      // Handle effect (XM format: effTyp + eff)
      if (cell.effTyp !== undefined && cell.effTyp !== 0) {
        effect = cell.effTyp;
        param = cell.eff ?? 0;
      } else if (cell.effect && cell.effect !== '...') {
        // String format effect (e.g., "C40", "F06")
        const parsed = parseEffectString(cell.effect);
        effect = parsed.effect;
        param = parsed.param;
      }

      rowData.push({ note, sample, effect, param });
    }

    rows.push(rowData);
  }

  return rows;
}

/**
 * Convert note string to Amiga period
 */
function noteStringToPeriod(note: string): number {
  const noteMap: { [key: string]: number } = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
  };

  // Parse note string (e.g., "C-4", "C#3", "D-2")
  const match = note.match(/^([A-G][#b]?)-?(\d)$/);
  if (!match) return 0;

  const noteName = match[1];
  const octave = parseInt(match[2], 10);

  const noteIndex = noteMap[noteName];
  if (noteIndex === undefined) return 0;

  // Calculate absolute note index
  // Octave 1 = notes 0-11, Octave 2 = notes 12-23, Octave 3 = notes 24-35
  const absIndex = (octave - 1) * 12 + noteIndex;

  if (absIndex < 0 || absIndex > 35) return 0;

  // Period table (finetune 0)
  const periodTable = [
    856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
    428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
    214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
  ];

  return periodTable[absIndex];
}

/**
 * Parse effect string to effect number and param
 */
function parseEffectString(effect: string): { effect: number; param: number } {
  if (!effect || effect.length < 3) return { effect: 0, param: 0 };

  const effectChar = effect[0].toUpperCase();
  const paramHex = effect.substring(1);

  // Effect character to number
  const effectNum = effectChar >= 'A' ? effectChar.charCodeAt(0) - 55 : parseInt(effectChar, 16);
  const param = parseInt(paramHex, 16) || 0;

  return { effect: effectNum, param };
}

/**
 * Convert InstrumentConfig to PTSample format
 */
function convertInstrumentToSample(instrument: InstrumentConfig): PTSample | null {
  if (instrument.synthType !== 'Sampler' || !instrument.sample) {
    return null;
  }

  const sample = instrument.sample;

  return {
    name: instrument.name,
    length: sample.audioBuffer ? new Float32Array(sample.audioBuffer).length : 0,
    finetune: instrument.metadata?.modPlayback?.finetune ?? 0,
    volume: Math.round(((instrument.volume ?? -12) + 60) / 60 * 64), // dB to 0-64
    loopStart: sample.loopStart ?? 0,
    loopLength: sample.loop ? ((sample.loopEnd ?? 0) - (sample.loopStart ?? 0)) : 2,
    audioBuffer: sample.audioBuffer ? createAudioBufferFromArrayBuffer(sample.audioBuffer, sample.sampleRate ?? 8363) : null,
    blobUrl: sample.url ?? null,
  };
}

/**
 * Create AudioBuffer from ArrayBuffer
 */
function createAudioBufferFromArrayBuffer(arrayBuffer: ArrayBuffer, sampleRate: number): AudioBuffer {
  const float32 = new Float32Array(arrayBuffer);
  const audioContext = Tone.getContext().rawContext;
  const audioBuffer = audioContext.createBuffer(1, float32.length, sampleRate);
  audioBuffer.copyToChannel(float32, 0);
  return audioBuffer;
}

/**
 * Hook for ProTracker-accurate playback
 */
export function useProTrackerPlayback(options: UseProTrackerPlaybackOptions = {}) {
  const [state, setState] = useState<PlaybackState>({
    isPlaying: false,
    isPaused: false,
    currentRow: 0,
    currentPattern: 0,
    currentPosition: 0,
    speed: 6,
    bpm: 125,
  });

  const replayerRef = useRef(getProTrackerReplayer());
  const moduleRef = useRef<PTModule | null>(null);

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

    return () => {
      replayer.onRowChange = null;
      replayer.onSongEnd = null;
    };
  }, [options.onRowChange, options.onSongEnd]);

  /**
   * Load a MOD file for playback
   */
  const loadMOD = useCallback((
    patterns: Pattern[],
    instruments: InstrumentConfig[],
    songPositions: number[],
    songLength: number,
    title: string = 'Untitled',
    restartPos: number = 0,
    initialSpeed: number = 6,
    initialBPM: number = 125
  ) => {
    const replayer = replayerRef.current;

    // Convert patterns to MODNote format
    const modPatterns = patterns.map(p => convertPatternToPTCells(p));

    // Convert instruments to PTSample format
    const samples: PTSample[] = [];
    for (let i = 0; i < 31; i++) {
      const instrument = instruments.find(inst => inst.id === i + 1);
      if (instrument) {
        const sample = convertInstrumentToSample(instrument);
        if (sample) {
          samples.push(sample);
          continue;
        }
      }
      // Empty sample placeholder
      samples.push({
        name: '',
        length: 0,
        finetune: 0,
        volume: 0,
        loopStart: 0,
        loopLength: 2,
        audioBuffer: null,
        blobUrl: null,
      });
    }

    // Determine channel count from first pattern
    const numChannels = patterns[0]?.channels.length ?? 4;

    // Create PTModule
    const module = convertToPTModule(
      title,
      modPatterns,
      samples,
      songLength,
      restartPos,
      songPositions,
      numChannels
    );

    moduleRef.current = module;
    replayer.loadModule(module);

    // Set initial speed/BPM (these will be overridden by Fxx in pattern if present)
    setState(prev => ({
      ...prev,
      speed: initialSpeed,
      bpm: initialBPM,
    }));

    console.log(`[useProTrackerPlayback] Loaded MOD: ${title}, ${numChannels} channels, ${patterns.length} patterns, ${songLength} positions`);
  }, []);

  /**
   * Start playback
   */
  const play = useCallback(async () => {
    await Tone.start();
    const replayer = replayerRef.current;
    replayer.play();
    setState(prev => ({ ...prev, isPlaying: true, isPaused: false }));
  }, []);

  /**
   * Stop playback
   */
  const stop = useCallback(() => {
    const replayer = replayerRef.current;
    replayer.stop();
    setState(prev => ({
      ...prev,
      isPlaying: false,
      isPaused: false,
      currentRow: 0,
      currentPosition: 0,
    }));
  }, []);

  /**
   * Pause playback
   */
  const pause = useCallback(() => {
    const replayer = replayerRef.current;
    replayer.pause();
    setState(prev => ({ ...prev, isPlaying: false, isPaused: true }));
  }, []);

  /**
   * Resume playback
   */
  const resume = useCallback(() => {
    const replayer = replayerRef.current;
    replayer.resume();
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      replayerRef.current.stop();
    };
  }, []);

  return {
    ...state,
    loadMOD,
    play,
    stop,
    pause,
    resume,
    togglePlayback,
  };
}

export default useProTrackerPlayback;
