/**
 * useSpeechActivityStore — tracks whether any speech synth is currently playing.
 *
 * Speech synths (SAM, V2Speech, DECtalk) call speechStart/speechStop when they
 * begin/end playback. The VJ KraftwerkHead scene reads activeSpeechCount to
 * gate mouth animation.
 */

import { create } from 'zustand';

interface SpeechActivityState {
  /** Number of active speech synth voices (>0 = speech is playing) */
  activeSpeechCount: number;
  /** Called by speech synths when playback starts */
  speechStart: () => void;
  /** Called by speech synths when playback ends */
  speechStop: () => void;
}

export const useSpeechActivityStore = create<SpeechActivityState>((set) => ({
  activeSpeechCount: 0,
  speechStart: () => set((s) => ({ activeSpeechCount: s.activeSpeechCount + 1 })),
  speechStop: () => set((s) => ({ activeSpeechCount: Math.max(0, s.activeSpeechCount - 1) })),
}));
