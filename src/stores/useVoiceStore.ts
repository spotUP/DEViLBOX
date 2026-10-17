/**
 * Voice to Notes state: the single source of truth for the modal, the setup
 * wizard and the MCP voice handler. Components render what is here and call
 * the actions; no take, training or finetune state lives in a component.
 *
 * Takes keep their raw 22050 Hz audio so the waveform can be drawn and a take
 * can be re-analysed with different finetune settings. The eight newest takes
 * are kept (MAX_TAKES).
 */

import { create } from 'zustand';
import { PITCH_SAMPLE_RATE } from '@/lib/voice/pitchNotes';
import type { F0Track } from '@/lib/voice/pitchTrack';
import { DEFAULT_SEGMENT_SETTINGS, type SegmentSettings } from '@/lib/voice/segmentNotes';
import type { DrumClass, DrumHit } from '@/lib/voice/drumHits';
import {
  loadSamples,
  loadTrainingResult,
  saveSamples,
  saveTrainingResult,
  type TrainingResult,
  type TrainingSample,
} from '@/lib/voice/drumModel';
import type { DrumMap } from '@/lib/voice/drumToNotes';
import type { ScaleName } from '@/lib/voice/scaleSnap';
import { getStoredLatencyMs } from '@/lib/voice/latencyCalibration';

export const MAX_TAKES = 8;

export type VoiceMode = 'melody' | 'drums';

/** Which detected effects the writer may emit. */
export interface VoiceEffectToggles {
  volume: boolean;
  slides: boolean;
  vibrato: boolean;
  arpeggio: boolean;
  flams: boolean;
}

export interface Finetune extends SegmentSettings {
  transpose: number;
  swing: number;
  minLengthRows: number;
  latencyNudgeMs: number;
  keySnapOn: boolean;
  /** Pitch class 0..11, 0 = C */
  keyTonic: number;
  keyScale: ScaleName;
  /** 0 = keep the heard timing, 1 = snap fully to the row grid. */
  strength: number;
  /** Offsets within this many rows of the grid snap regardless of strength. */
  toleranceRows: number;
  effects: VoiceEffectToggles;
}

export const DEFAULT_FINETUNE: Finetune = {
  ...DEFAULT_SEGMENT_SETTINGS,
  transpose: 0,
  swing: 0,
  minLengthRows: 1,
  latencyNudgeMs: 0,
  keySnapOn: false,
  keyTonic: 0,
  keyScale: 'major',
  strength: 1,
  toleranceRows: 0.1,
  effects: { volume: true, slides: true, vibrato: true, arpeggio: true, flams: true },
};

export interface VoiceTake {
  id: number;
  mode: VoiceMode;
  audio: Float32Array;
  sampleRate: number;
  seconds: number;
  recordedAt: number;
  /** Pitch track of the take (melody takes); the notes are segmented from it. */
  track: F0Track | null;
  /** Detected hits (drum takes). */
  hits: DrumHit[];
}

export interface TrainingTake {
  drum: DrumClass;
  audio: Float32Array;
  hits: DrumHit[];
}

export interface VoiceState {
  mode: VoiceMode;
  fine: Finetune;
  /** The take being shown and committed. */
  take: VoiceTake | null;
  /** Newest first, at most MAX_TAKES. */
  takes: VoiceTake[];
  samples: TrainingSample[];
  training: TrainingResult | null;
  /** Null until the panel resolves a default from the song's instruments. */
  drumMap: DrumMap | null;
  /** The last wizard training take, kept so the wizard can draw and retake it. */
  trainingTake: TrainingTake | null;
  deviceId: string;
  channelIndex: number;
  startRow: number;
  calibratedMs: number;

  setMode: (mode: VoiceMode) => void;
  patchFine: (patch: Partial<Finetune>) => void;
  /** Adds a take as the newest and makes it current. */
  addTake: (take: Omit<VoiceTake, 'id' | 'recordedAt' | 'sampleRate' | 'seconds'> & { recordedAt?: number }) => VoiceTake;
  /** Makes an earlier take current again. */
  useTake: (id: number) => void;
  clearTake: () => void;
  setSamples: (samples: TrainingSample[]) => void;
  setTraining: (training: TrainingResult | null) => void;
  setDrumMap: (map: DrumMap | null) => void;
  setTrainingTake: (take: TrainingTake | null) => void;
  setDeviceId: (deviceId: string) => void;
  setChannelIndex: (channelIndex: number) => void;
  setStartRow: (startRow: number) => void;
  setCalibratedMs: (ms: number) => void;
  /** Back to a fresh session (tests and "Clear training"). Re-reads persisted training. */
  reset: () => void;
}

let nextTakeId = 1;

function freshState(): Omit<VoiceState, keyof VoiceActions> {
  return {
    mode: 'melody',
    fine: DEFAULT_FINETUNE,
    take: null,
    takes: [],
    samples: loadSamples(),
    training: loadTrainingResult(),
    drumMap: null,
    trainingTake: null,
    deviceId: '',
    channelIndex: 0,
    startRow: 0,
    calibratedMs: getStoredLatencyMs(''),
  };
}

type VoiceActions = Pick<
  VoiceState,
  | 'setMode'
  | 'patchFine'
  | 'addTake'
  | 'useTake'
  | 'clearTake'
  | 'setSamples'
  | 'setTraining'
  | 'setDrumMap'
  | 'setTrainingTake'
  | 'setDeviceId'
  | 'setChannelIndex'
  | 'setStartRow'
  | 'setCalibratedMs'
  | 'reset'
>;

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  ...freshState(),

  setMode: (mode) => set({ mode, take: null }),
  patchFine: (patch) => set({ fine: { ...get().fine, ...patch } }),

  addTake: (partial) => {
    const take: VoiceTake = {
      ...partial,
      id: nextTakeId++,
      sampleRate: PITCH_SAMPLE_RATE,
      seconds: partial.audio.length / PITCH_SAMPLE_RATE,
      recordedAt: partial.recordedAt ?? Date.now(),
    };
    set({ take, takes: [take, ...get().takes].slice(0, MAX_TAKES) });
    return take;
  },

  useTake: (id) => {
    const take = get().takes.find((t) => t.id === id);
    if (take) set({ take, mode: take.mode });
  },

  clearTake: () => set({ take: null }),

  setSamples: (samples) => {
    saveSamples(samples);
    set({ samples });
  },

  setTraining: (training) => {
    saveTrainingResult(training);
    set({ training });
  },

  setDrumMap: (drumMap) => set({ drumMap }),
  setTrainingTake: (trainingTake) => set({ trainingTake }),
  setDeviceId: (deviceId) => set({ deviceId, calibratedMs: getStoredLatencyMs(deviceId) }),
  setChannelIndex: (channelIndex) => set({ channelIndex }),
  setStartRow: (startRow) => set({ startRow }),
  setCalibratedMs: (calibratedMs) => set({ calibratedMs }),

  reset: () => set(freshState()),
}));
