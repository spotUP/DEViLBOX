/**
 * useDJSetStore — State management for DJ set recording, playback, and mic.
 */

import { create } from 'zustand';
import { DJSetPlayer } from '../engine/dj/recording/DJSetPlayer';
import { getDJSet, listDJSets, deleteDJSet, incrementPlayCount, downloadBlob } from '../lib/djSetApi';
import type { DJSet } from '../engine/dj/recording/DJSetFormat';
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
  error: string | null;
  total: number;
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

  // Async actions
  fetchSets: (options?: { mine?: boolean; limit?: number; offset?: number }) => Promise<void>;
  playSet: (id: string) => Promise<void>;
  stopSetPlayback: () => void;
  deleteSet: (id: string) => Promise<void>;
}

let _activePlayer: DJSetPlayer | null = null;

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
  error: null,
  total: 0,
};

export const useDJSetStore = create<DJSetState & DJSetActions>()((set, get) => ({
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

  // ── Async actions ───────────────────────────────────────────────────────

  fetchSets: async (options?: { mine?: boolean; limit?: number; offset?: number }) => {
    try {
      const { sets, total } = await listDJSets(options);
      set({ setList: sets as DJSetMetadata[], total, error: null });
    } catch (err) {
      set({ error: `Failed to load sets: ${(err as Error).message}` });
    }
  },

  playSet: async (id: string) => {
    const state = get();
    if (state.isRecording || state.isPlayingSet) return;

    set({ isPlayingSet: true, currentSetId: id, preloadProgress: 0, error: null });

    try {
      const djSet: DJSet = await getDJSet(id);
      const requiredTracks = DJSetPlayer.getRequiredTracks(djSet);
      const preloadedTracks = new Map<string, { song: unknown; buffer?: ArrayBuffer }>();
      let loaded = 0;

      for (const track of requiredTracks) {
        const source = track.source;
        let arrayBuffer: ArrayBuffer;

        if (source.type === 'embedded') {
          arrayBuffer = await downloadBlob(source.blobId);
        } else if (source.type === 'modland') {
          const resp = await fetch(`https://modland.com/pub/modules/${source.fullPath}`);
          if (!resp.ok) throw new Error(`Modland fetch failed: ${source.fullPath}`);
          arrayBuffer = await resp.arrayBuffer();
        } else if (source.type === 'hvsc') {
          const resp = await fetch(`https://hvsc.c64.org/${source.path}`);
          if (!resp.ok) throw new Error(`HVSC fetch failed: ${source.path}`);
          arrayBuffer = await resp.arrayBuffer();
        } else {
          throw new Error(`Cannot load track with source type: ${source.type}`);
        }

        const key = JSON.stringify(source);
        preloadedTracks.set(key, { song: null, buffer: arrayBuffer });
        loaded++;
        set({ preloadProgress: loaded / requiredTracks.length });
      }

      _activePlayer = new DJSetPlayer();
      _activePlayer.onProgress = (elapsed: number, total: number) => {
        set({
          playbackElapsed: elapsed,
          playbackProgress: total > 0 ? elapsed / total : 0,
        });
      };
      _activePlayer.onComplete = () => {
        get().stopSetPlayback();
        incrementPlayCount(id).catch(() => {});
      };

      await _activePlayer.startPlayback(djSet, preloadedTracks);

      if (djSet.micAudioId) {
        try {
          const micBytes = await downloadBlob(djSet.micAudioId);
          const audioCtx = new AudioContext();
          const micBuffer = await audioCtx.decodeAudioData(micBytes);
          const { getDJEngine } = await import('../engine/dj/DJEngine');
          const samplerInput = getDJEngine().mixer.samplerInput;
          await _activePlayer.startMicAudio(micBuffer, samplerInput);
        } catch (micErr) {
          console.warn('[DJSetStore] Failed to load mic audio:', micErr);
        }
      }
    } catch (err) {
      set({
        isPlayingSet: false,
        currentSetId: null,
        preloadProgress: 0,
        error: `Failed to play set: ${(err as Error).message}`,
      });
      _activePlayer = null;
    }
  },

  stopSetPlayback: () => {
    if (_activePlayer) {
      _activePlayer.stopPlayback();
      _activePlayer = null;
    }
    set({
      isPlayingSet: false,
      currentSetId: null,
      playbackProgress: 0,
      playbackElapsed: 0,
      preloadProgress: 0,
    });
  },

  deleteSet: async (id: string) => {
    if (get().currentSetId === id) get().stopSetPlayback();

    try {
      await deleteDJSet(id);
      set({ setList: get().setList.filter((s) => s.id !== id) });
    } catch (err) {
      set({ error: `Failed to delete set: ${(err as Error).message}` });
    }
  },
}));
