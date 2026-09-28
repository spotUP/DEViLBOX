/**
 * useOscilloscopeStore - State management for channel oscilloscope data
 *
 * Receives Int16Array waveform data from FurnaceDispatchEngine and makes
 * it available to the ChannelOscilloscope visualizer component.
 */

import { create } from 'zustand';
import { pushChannelAudio, resetChannelAudioTap } from '@/bridge/analysis/ChannelAudioTap';

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

  /**
   * Update oscilloscope data for all channels. With `frame` (the running
   * sample index of the chunk's first sample) the chunk is every sample the
   * engine rendered since its previous one, and it also feeds the contiguous
   * per-channel audio tap the runtime role classifiers read. Without it the
   * chunk is a display snapshot only.
   */
  updateChannelData: (channels: (Int16Array | null)[], frame?: number, sampleRate?: number) => void;
  /** Set the number of channels, platform, and optional channel names */
  setChipInfo: (numChannels: number, platformType: number, channelNames?: string[]) => void;
  /** Clear all data */
  clear: () => void;
}

export const useOscilloscopeStore = create<OscilloscopeState>((set) => ({
  channelData: [],
  numChannels: 0,
  platformType: 0,
  channelNames: [],
  isActive: false,

  updateChannelData: (channels, frame, sampleRate) => {
    if (frame !== undefined) pushChannelAudio(channels, frame, sampleRate ?? 48000);
    set({
      // The scopes draw the most recent DISPLAY_SAMPLES, whatever the chunk size.
      channelData: channels.map((c) => (c && c.length > DISPLAY_SAMPLES ? c.subarray(c.length - DISPLAY_SAMPLES) : c)),
      isActive: true,
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
    });
  },
}));
