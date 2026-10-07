/**
 * useOscilloscopeStore - State management for channel oscilloscope data
 *
 * Receives Int16Array waveform data from FurnaceDispatchEngine and makes
 * it available to the ChannelOscilloscope visualizer component.
 */

import { create } from 'zustand';
import { pushChannelAudio, resetChannelAudioTap } from '@/bridge/analysis/ChannelAudioTap';

/** A frame older than this is no data (same rule as getRealtimeChannelLevels). */
export const SCOPE_FRAME_MAX_AGE_MS = 100;

/**
 * Frames are dropped for this long after a song unload: the outgoing engine
 * can still have messages in flight when the unload runs, and the 40 engines
 * that feed updateChannelData cannot tell the store which song they belong to.
 */
export const SCOPE_UNLOAD_FENCE_MS = 100;

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Samples per channel the scopes draw. */
const DISPLAY_SAMPLES = 256;

interface OscilloscopeState {
  /** Per-channel waveform data (256 samples each, Int16 range -32768..32767) */
  channelData: (Int16Array | null)[];
  /** Number of active channels */
  numChannels: number;
  /** Platform type currently active */
  platformType: number;
  /** Semantic channel names (e.g. "PU1", "NOI", "Paula 0") */
  channelNames: string[];
  /** Whether oscilloscope is receiving data */
  isActive: boolean;
  /** When the last accepted frame arrived (ms, performance clock); 0 = none. */
  lastFrameAt: number;
  /** Song generation the store accepts frames from (see songLifecycle). */
  generation: number;
  /** Frames are dropped until this time (ms, performance clock). */
  fenceUntil: number;

  /**
   * Update oscilloscope data for all channels. With `frame` (the running
   * sample index of the chunk's first sample) the chunk is every sample the
   * engine rendered since its previous one, and it also feeds the contiguous
   * per-channel audio tap the runtime role classifiers read. Without it the
   * chunk is a display snapshot only. `generation` (optional) is the song
   * generation the engine started under: an older one is a late frame from an
   * unloaded song and is dropped, as is anything inside the unload fence.
   */
  updateChannelData: (channels: (Int16Array | null)[], frame?: number, sampleRate?: number, generation?: number) => void;
  /** A song was unloaded: clear, adopt its generation, fence late frames. */
  unload: (generation: number) => void;
  /** Set the number of channels, platform, and optional channel names */
  setChipInfo: (numChannels: number, platformType: number, channelNames?: string[]) => void;
  /** Clear all data */
  clear: () => void;
}

export const useOscilloscopeStore = create<OscilloscopeState>((set, get) => ({
  channelData: [],
  numChannels: 0,
  platformType: 0,
  channelNames: [],
  isActive: false,
  lastFrameAt: 0,
  generation: 0,
  fenceUntil: 0,

  updateChannelData: (channels, frame, sampleRate, generation) => {
    const st = get();
    if (generation !== undefined && generation < st.generation) return;
    const now = nowMs();
    if (now < st.fenceUntil) return;
    if (frame !== undefined) pushChannelAudio(channels, frame, sampleRate ?? 48000);
    set({
      // The scopes draw the most recent DISPLAY_SAMPLES, whatever the chunk size.
      channelData: channels.map((c) => (c && c.length > DISPLAY_SAMPLES ? c.subarray(c.length - DISPLAY_SAMPLES) : c)),
      isActive: true,
      lastFrameAt: now,
    });
  },

  unload: (generation) => {
    resetChannelAudioTap();
    set({
      channelData: [],
      numChannels: 0,
      platformType: 0,
      channelNames: [],
      isActive: false,
      lastFrameAt: 0,
      generation,
      fenceUntil: nowMs() + SCOPE_UNLOAD_FENCE_MS,
    });
  },

  setChipInfo: (numChannels, platformType, channelNames) => set({
    numChannels,
    platformType,
    channelNames: channelNames ?? Array.from({ length: numChannels }, (_, i) => `CH${i + 1}`),
    channelData: new Array(numChannels).fill(null),
  }),

  clear: () => {
    resetChannelAudioTap();
    set({
      channelData: [],
      numChannels: 0,
      platformType: 0,
      channelNames: [],
      isActive: false,
      lastFrameAt: 0,
    });
  },
}));

/**
 * The channel waveforms the scopes and meters may draw right now, or null:
 * the store is inactive, or its last frame is older than 100 ms (the feed
 * stopped - an unloaded or paused engine must not leave the meters frozen on
 * its last frame). THE reader for every meter / scope; pure over the store.
 */
export function liveScopeFrame(
  state: Pick<OscilloscopeState, 'isActive' | 'channelData' | 'lastFrameAt'> = useOscilloscopeStore.getState(),
  now: number = nowMs(),
): (Int16Array | null)[] | null {
  if (!state.isActive) return null;
  if (now - state.lastFrameAt > SCOPE_FRAME_MAX_AGE_MS) return null;
  return state.channelData;
}
