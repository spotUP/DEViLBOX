/**
 * Factory that wraps IO808Synth in a Tone.js-compatible instrument interface
 * for use by ToneEngine and InstrumentFactory.
 */
import * as Tone from 'tone';
import { IO808Synth, type IO808DrumType, type IO808Params } from './IO808Synth';
import type { InstrumentConfig } from '../../types/instrument';
import { getNormalizedVolume } from '../factories/volumeNormalization';
import type { DrumType } from '../../types/instrument/drums';
import { resolveIO808Note } from '../drumNoteMap';

/**
 * Map DrumType + optional io808Type override → IO808DrumType
 */
function resolveIO808Type(config: InstrumentConfig): IO808DrumType {
  // Explicit io808Type in parameters takes priority
  const explicit = config.parameters?.io808Type as IO808DrumType | undefined;
  if (explicit) return explicit;

  // Fall back to drumMachine.drumType
  const drumType: DrumType = config.drumMachine?.drumType || 'kick';
  switch (drumType) {
    case 'kick':    return 'kick';
    case 'snare':   return 'snare';
    case 'clap':    return 'clap';
    case 'hihat':   return 'closedHat';
    case 'rimshot': return 'rimshot';
    case 'clave':   return 'clave';
    case 'cowbell': return 'cowbell';
    case 'cymbal':  return 'cymbal';
    case 'maracas': return 'maracas';
    case 'tom':     return 'tomMid';
    case 'conga':   return 'congaMid';
    default:        return 'kick';
  }
}

/**
 * Extract IO808Params from the per-drum-type config in drumMachine.
 * Maps our DrumMachineConfig fields → io-808 param names (level comes from velocity at trigger time).
 */
function extractIO808Params(config: InstrumentConfig): Partial<IO808Params> {
  const dm = config.drumMachine;
  if (!dm) return {};

  const params: Partial<IO808Params> = {};
  const drumType = dm.drumType;

  // Map per-drum params to IO808 params
  switch (drumType) {
    case 'kick':
      if (dm.kick) {
        params.tone = dm.kick.tone;
        params.decay = dm.kick.decay !== undefined ? Math.min(100, dm.kick.decay / 5) : undefined;
      }
      break;
    case 'snare':
      if (dm.snare) {
        params.tone = dm.snare.tone;
        params.snappy = dm.snare.snappy;
      }
      break;
    case 'hihat':
      if (dm.hihat) {
        params.decay = dm.hihat.decay !== undefined ? Math.min(100, dm.hihat.decay / 10) : undefined;
      }
      break;
    case 'cymbal':
      if (dm.cymbal) {
        params.tone = dm.cymbal.tone;
        params.decay = dm.cymbal.decay !== undefined ? Math.min(100, dm.cymbal.decay / 70) : undefined;
      }
      break;
    case 'tom':
    case 'conga':
      if (dm.conga) {
        params.tuning = dm.conga.tuning;
      } else if (dm.tom) {
        params.tone = dm.tom.tone;
      }
      break;
  }

  return params;
}

/**
 * Create a ToneEngine-compatible instrument backed by the IO808 synth engine.
 */
export function createIO808Instrument(config: InstrumentConfig): Tone.ToneAudioNode {
  const audioCtx = Tone.getContext().rawContext as AudioContext;
  const volumeDb = getNormalizedVolume('DrumMachine', config.volume);

  // Tone.Gain as bridge — its .input IS a native GainNode that IO808 can connect to
  const bridgeGain = new Tone.Gain(1);

  // Tone.Volume for dB-based volume control expected by ToneEngine
  const volumeNode = new Tone.Volume(volumeDb);

  // Bridge: Tone.Gain → Tone.Volume (Tone-to-Tone connect works fine)
  bridgeGain.connect(volumeNode);

  // Create IO808 synth targeting the raw GainNode inside the Tone.Gain bridge
  const io808 = new IO808Synth(audioCtx, bridgeGain.input);

  // Resolve the configured drum type (used as fallback and for pitch mode)
  const defaultDrumType = resolveIO808Type(config);

  // Note mode: 'kit' = note name picks drum, 'pitch' = note controls tuning
  const noteMode = config.drumMachine?.noteMode ?? 'kit';

  // Extract default params from config (level comes from velocity at trigger time)
  const baseParams = extractIO808Params(config);

  /** Trigger helper — resolves note to drum type + tune offset */
  const triggerDrum = (note: string, time: number, velocity: number) => {
    const { drumType, tuneOffset } = resolveIO808Note(note, noteMode, defaultDrumType);
    const level = velocity * 100;
    const params: IO808Params = { level, ...baseParams };
    if (tuneOffset !== 0) {
      // Apply tune offset — clamp to 0-100 range
      const baseTune = params.tuning ?? 50;
      params.tuning = Math.max(0, Math.min(100, baseTune + tuneOffset));
    }
    io808.trigger(drumType, time, params);
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
    applyConfig: () => { /* IO808 params are per-trigger, nothing to update live */ },
    volume: volumeNode.volume,
  } as unknown as Tone.ToneAudioNode;
}
