/**
 * useOscilloscopeStore - State management for channel oscilloscope data
 *
 * Receives Int16Array waveform data from FurnaceDispatchEngine and makes
 * it available to the ChannelOscilloscope visualizer component.
 */

import { create } from 'zustand';

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

  /** Update oscilloscope data for all channels */
  updateChannelData: (channels: (Int16Array | null)[]) => void;
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

  updateChannelData: (channels) => set({
    channelData: channels,
    isActive: true,
  }),

  setChipInfo: (numChannels, platformType, channelNames) => set({
    numChannels,
    platformType,
    channelNames: channelNames ?? Array.from({ length: numChannels }, (_, i) => `CH${i + 1}`),
    channelData: new Array(numChannels).fill(null),
  }),

  clear: () => set({
    channelData: [],
    numChannels: 0,
    platformType: 0,
    channelNames: [],
    isActive: false,
  }),
}));
