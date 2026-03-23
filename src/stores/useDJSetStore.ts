/**
 * useDJSetStore — State management for DJ set recording, playback, and mic.
 */

import { create } from 'zustand';
import type { DJSetMetadata } from '@/engine/dj/recording/DJSetFormat';

interface DJSetState {
  // Recording
  isRecording: boolean;
  recordingStartTime: number;
  recordingDuration: number;

  // Playback
  isPlayingSet: boolean;
  currentSetId: string | null;
  playbackProgress: number;
  playbackElapsed: number;
  preloadProgress: number;

  // Mic
  micEnabled: boolean;
  micGain: number;
  micRecording: boolean;

  // Browse
  setList: DJSetMetadata[];
  selectedSetId: string | null;
}

interface DJSetActions {
  setRecording: (recording: boolean) => void;
  setRecordingStartTime: (time: number) => void;
  setRecordingDuration: (ms: number) => void;
  setPlayingSet: (playing: boolean) => void;
  setCurrentSetId: (id: string | null) => void;
  setPlaybackProgress: (progress: number) => void;
  setPlaybackElapsed: (ms: number) => void;
  setPreloadProgress: (progress: number) => void;
  setMicEnabled: (enabled: boolean) => void;
  setMicGain: (gain: number) => void;
  setMicRecording: (recording: boolean) => void;
  setSetList: (list: DJSetMetadata[]) => void;
  setSelectedSetId: (id: string | null) => void;
  reset: () => void;
}

const initialState: DJSetState = {
  isRecording: false,
  recordingStartTime: 0,
  recordingDuration: 0,
  isPlayingSet: false,
  currentSetId: null,
  playbackProgress: 0,
  playbackElapsed: 0,
  preloadProgress: 0,
  micEnabled: false,
  micGain: 0.8,
  micRecording: false,
  setList: [],
  selectedSetId: null,
};

export const useDJSetStore = create<DJSetState & DJSetActions>()((set) => ({
  ...initialState,

  setRecording: (recording) => set({ isRecording: recording }),
  setRecordingStartTime: (time) => set({ recordingStartTime: time }),
  setRecordingDuration: (ms) => set({ recordingDuration: ms }),
  setPlayingSet: (playing) => set({ isPlayingSet: playing }),
  setCurrentSetId: (id) => set({ currentSetId: id }),
  setPlaybackProgress: (progress) => set({ playbackProgress: progress }),
  setPlaybackElapsed: (ms) => set({ playbackElapsed: ms }),
  setPreloadProgress: (progress) => set({ preloadProgress: progress }),
  setMicEnabled: (enabled) => set({ micEnabled: enabled }),
  setMicGain: (gain) => set({ micGain: gain }),
  setMicRecording: (recording) => set({ micRecording: recording }),
  setSetList: (list) => set({ setList: list }),
  setSelectedSetId: (id) => set({ selectedSetId: id }),
  reset: () => set(initialState),
}));
