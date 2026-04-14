/**
 * useTourStore — State management for the guided tour.
 *
 * Tracks whether the tour is active, current step, subtitle text,
 * and provides control methods (start/stop/pause/next/prev).
 */

import { create } from 'zustand';

export interface TourState {
  isActive: boolean;
  isPaused: boolean;
  currentStep: number;
  totalSteps: number;
  subtitle: string;
  stepId: string;
  /** Progress 0-1 */
  progress: number;
  /** Whether DECtalk is currently speaking */
  isSpeaking: boolean;
  /** Whether pre-rendering is in progress */
  isPreRendering: boolean;
  preRenderProgress: number;

  // Actions
  startTour: (totalSteps: number) => void;
  stopTour: () => void;
  pauseTour: () => void;
  resumeTour: () => void;
  setStep: (step: number, stepId: string, subtitle: string) => void;
  setSpeaking: (speaking: boolean) => void;
  setPreRendering: (rendering: boolean, progress?: number) => void;
}

export const useTourStore = create<TourState>((set) => ({
  isActive: false,
  isPaused: false,
  currentStep: 0,
  totalSteps: 0,
  subtitle: '',
  stepId: '',
  progress: 0,
  isSpeaking: false,
  isPreRendering: false,
  preRenderProgress: 0,

  startTour: (totalSteps) =>
    set({
      isActive: true,
      isPaused: false,
      currentStep: 0,
      totalSteps,
      subtitle: '',
      stepId: '',
      progress: 0,
      isSpeaking: false,
      isPreRendering: false,
      preRenderProgress: 0,
    }),

  stopTour: () =>
    set({
      isActive: false,
      isPaused: false,
      currentStep: 0,
      subtitle: '',
      stepId: '',
      progress: 0,
      isSpeaking: false,
      isPreRendering: false,
      preRenderProgress: 0,
    }),

  pauseTour: () => set({ isPaused: true }),
  resumeTour: () => set({ isPaused: false }),

  setStep: (step, stepId, subtitle) =>
    set((s) => ({
      currentStep: step,
      stepId,
      subtitle,
      progress: s.totalSteps > 0 ? step / s.totalSteps : 0,
    })),

  setSpeaking: (speaking) => set({ isSpeaking: speaking }),

  setPreRendering: (rendering, progress) =>
    set({
      isPreRendering: rendering,
      ...(progress !== undefined ? { preRenderProgress: progress } : {}),
    }),
}));
