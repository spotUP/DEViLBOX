/**
 * Factory that wraps TR909Synth in a Tone.js-compatible instrument interface
 * for use by ToneEngine and InstrumentFactory.
 *
 * Follows the exact same pattern as createIO808Instrument.ts.
 */
import * as Tone from 'tone';
import { TR909Synth, type TR909DrumType, type TR909Params } from './TR909Synth';
import type { InstrumentConfig } from '../../types/instrument';
import { getNormalizedVolume } from '../factories/volumeNormalization';
import type { DrumType } from '../../types/instrument/drums';
import { resolveTR909Note } from '../drumNoteMap';

/**
 * Map DrumType + optional tr909Type override → TR909DrumType
 */
function resolveTR909Type(config: InstrumentConfig): TR909DrumType {
  const explicit = config.parameters?.tr909Type as TR909DrumType | undefined;
  if (explicit) return explicit;

  const drumType: DrumType = config.drumMachine?.drumType || 'kick';
  switch (drumType) {
    case 'kick':    return 'kick';
    case 'snare':   return 'snare';
    case 'clap':    return 'clap';
    case 'hihat':   return 'closedHat';
    case 'rimshot': return 'rimshot';
    case 'cymbal':  return 'crash';
    case 'tom':     return 'tomMid';
    default:        return 'kick';
  }
}

/**
 * Extract TR909Params from the per-drum-type config in drumMachine.
 * Level comes from velocity at trigger time.
 */
function extractTR909Params(config: InstrumentConfig): Partial<TR909Params> {
  const dm = config.drumMachine;
  if (!dm) return {};

  const params: Partial<TR909Params> = {};
  const drumType = dm.drumType;

  switch (drumType) {
    case 'kick':
      if (dm.kick) {
        params.tune = dm.kick.tone;
        params.decay = dm.kick.decay !== undefined ? Math.min(100, dm.kick.decay / 5) : undefined;
        params.attack = dm.kick.drive;
      }
      break;
    case 'snare':
      if (dm.snare) {
        params.tune = dm.snare.tone;
        params.snappy = dm.snare.snappy;
        params.tone = dm.snare.toneDecay !== undefined ? Math.min(100, dm.snare.toneDecay) : undefined;
      }
      break;
    case 'hihat':
      if (dm.hihat) {
        params.decay = dm.hihat.decay !== undefined ? Math.min(100, dm.hihat.decay / 10) : undefined;
      }
      break;
    case 'tom':
      if (dm.tom) {
        params.tune = dm.tom.tone;
        params.decay = dm.tom.decay !== undefined ? Math.min(100, dm.tom.decay / 5) : undefined;
      }
      break;
    case 'cymbal':
      if (dm.cymbal) {
        params.tune = dm.cymbal.tone;
      }
      break;
  }

  return params;
}

/**
 * Create a ToneEngine-compatible instrument backed by the TR909 synth engine.
 */
export function createTR909Instrument(config: InstrumentConfig): Tone.ToneAudioNode {
  const audioCtx = Tone.getContext().rawContext as AudioContext;
  const volumeDb = getNormalizedVolume('DrumMachine', config.volume);

  // Tone.Gain as bridge — its .input IS a native GainNode that TR909 can connect to
  const bridgeGain = new Tone.Gain(1);

  // Tone.Volume for dB-based volume control expected by ToneEngine
  const volumeNode = new Tone.Volume(volumeDb);

  // Bridge: Tone.Gain → Tone.Volume
  bridgeGain.connect(volumeNode);

  // Create TR909 synth targeting the raw GainNode inside the Tone.Gain bridge
  const tr909 = new TR909Synth(audioCtx, bridgeGain.input);

  // Resolve the configured drum type (used as fallback and for pitch mode)
  const defaultDrumType = resolveTR909Type(config);

  // Note mode: 'kit' = note name picks drum, 'pitch' = note controls tuning
  const noteMode = config.drumMachine?.noteMode ?? 'kit';

  // Extract default params from config
  const baseParams = extractTR909Params(config);

  // TR909Synth constructor auto-starts shared resource loading

  /** Trigger helper — resolves note to drum type + tune offset */
  const triggerDrum = (note: string, time: number, velocity: number) => {
    const { drumType, tuneOffset } = resolveTR909Note(note, noteMode, defaultDrumType);
    const level = velocity * 100;
    const params: TR909Params = { level, ...baseParams };
    if (tuneOffset !== 0) {
      const baseTune = params.tune ?? 50;
      params.tune = Math.max(0, Math.min(100, baseTune + tuneOffset));
    }
    tr909.trigger(drumType, time, params);
  };

  return {
    triggerAttackRelease: (note: string, _duration: number, time?: number, velocity?: number) => {
      triggerDrum(note, time ?? Tone.now(), velocity ?? 1);
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      triggerDrum(note, time ?? Tone.now(), velocity ?? 1);
    },
    triggerRelease: () => { /* drums are fire-and-forget */ },
    releaseAll: () => { /* nothing to release */ },
    connect: (dest: Tone.InputNode) => volumeNode.connect(dest),
    disconnect: () => volumeNode.disconnect(),
    dispose: () => {
      volumeNode.dispose();
      bridgeGain.dispose();
    },
    applyConfig: () => { /* TR909 params are per-trigger, nothing to update live */ },
    volume: volumeNode.volume,
  } as unknown as Tone.ToneAudioNode;
}
