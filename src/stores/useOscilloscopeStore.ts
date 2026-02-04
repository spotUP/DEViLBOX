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
  /** Whether oscilloscope is receiving data */
  isActive: boolean;

  /** Update oscilloscope data for all channels */
  updateChannelData: (channels: (Int16Array | null)[]) => void;
  /** Set the number of channels and platform */
  setChipInfo: (numChannels: number, platformType: number) => void;
  /** Clear all data */
  clear: () => void;
}

export const useOscilloscopeStore = create<OscilloscopeState>((set) => ({
  channelData: [],
  numChannels: 0,
  platformType: 0,
  isActive: false,

  updateChannelData: (channels) => set({
    channelData: channels,
    isActive: true,
  }),

  setChipInfo: (numChannels, platformType) => set({
    numChannels,
    platformType,
    channelData: new Array(numChannels).fill(null),
  }),

  clear: () => set({
    channelData: [],
    numChannels: 0,
    platformType: 0,
    isActive: false,
  }),
}));
