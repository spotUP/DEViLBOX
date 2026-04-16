/**
 * DJ Environment — full snapshot of DJ app state saved with playlists.
 *
 * Captures everything the DJ has tweaked: crossfader curve, volumes, Auto DJ config,
 * master effects, drumpad programs/mappings/preferences. Restored when loading a playlist.
 *
 * Audio samples are NOT included (too large) — only pad configuration/parameters.
 */

import type { EffectConfig } from './instrument/effects';
import type { DrumPad, MIDIMapping, PadBank, MpcResampleConfig } from './drumpad';

// ── Version ──────────────────────────────────────────────────────────────────

export const DJ_ENV_VERSION = 1;

// ── Serializable drumpad types (no AudioBuffer) ─────────────────────────────

/** DrumPad with audio samples stripped out (not JSON-serializable) */
export type SerializableDrumPad = Omit<DrumPad, 'sample' | 'layers'> & {
  sampleName: string | null;
  layerNames: string[];
};

/** DrumProgram with serializable pads */
export interface SerializableDrumProgram {
  id: string;
  name: string;
  pads: SerializableDrumPad[];
  masterLevel: number;
  masterTune: number;
  mpcResample?: MpcResampleConfig;
}

// ── Main environment interface ───────────────────────────────────────────────

export interface DJEnvironment {
  /** Schema version for forward compatibility */
  version: number;

  // ── DJ Store settings ────────────────────────────────────────────────

  /** Crossfader curve shape */
  crossfaderCurve: 'linear' | 'cut' | 'smooth';
  /** Reverse crossfader direction */
  hamsterSwitch: boolean;
  /** Master output volume 0-1.5 */
  masterVolume: number;
  /** Booth/monitor output 0-1.5 */
  boothVolume: number;
  /** Session monitor output 0-1.5 */
  sessionMonitorVolume: number;
  /** Headphone cue/mix blend 0-1 */
  cueMix: number;
  /** Headphone output volume 0-1.5 */
  cueVolume: number;
  /** Jog wheel sensitivity multiplier 0.5-2.0 */
  jogWheelSensitivity: number;
  /** Deck visualization mode */
  deckViewMode: 'visualizer' | 'vinyl' | '3d';
  /** Third deck enabled */
  thirdDeckActive: boolean;

  // ── Auto DJ config ───────────────────────────────────────────────────

  /** Transition length in bars */
  autoDJTransitionBars: number;
  /** Shuffle mode */
  autoDJShuffle: boolean;
  /** Apply frequency filter during transitions */
  autoDJWithFilter: boolean;

  // ── Master effects ───────────────────────────────────────────────────

  /** Master FX chain (reverb, delay, etc.) */
  masterEffects: EffectConfig[];

  // ── Drumpad state ────────────────────────────────────────────────────

  drumpad: {
    currentProgramId: string;
    programs: Record<string, SerializableDrumProgram>;
    midiMappings: Record<string, MIDIMapping>;
    preferences: {
      defaultProgram: string;
      velocitySensitivity: number;
      padColors: Record<number, string>;
      showAdvanced: boolean;
    };
    busLevels: Record<string, number>;
    noteRepeatEnabled: boolean;
    noteRepeatRate: string;
    currentBank: PadBank;
  };
}
