/**
 * ToneJSSynthFactory - Creates Tone.js built-in synth instances.
 * Extracted from InstrumentFactory.ts
 */

import * as Tone from 'tone';
import type { InstrumentConfig, PitchEnvelopeConfig } from '@typedefs/instrument';
import {
  DEFAULT_SUPERSAW,
  DEFAULT_POLYSYNTH,
  DEFAULT_ORGAN,
  DEFAULT_DRUM_MACHINE,
  DEFAULT_CHIP_SYNTH,
  DEFAULT_PWM_SYNTH,
  DEFAULT_STRING_MACHINE,
} from '@/types/instrument';
import { ArpeggioEngine } from '../ArpeggioEngine';
import { getNormalizedVolume } from './volumeNormalization';


/**
 * Dispatch to the appropriate Tone.js synth creator.
 * Returns null if synthType is not a Tone.js type.
 */
export function createToneJSSynth(config: InstrumentConfig): Tone.ToneAudioNode | null {
  switch (config.synthType) {
    case 'Synth': return createSynth(config);
    case 'MonoSynth': return createMonoSynth(config);
    case 'DuoSynth': return createDuoSynth(config);
    case 'FMSynth': return createFMSynth(config);
    case 'AMSynth': return createAMSynth(config);
    case 'PluckSynth': return createPluckSynth(config);
    case 'MetalSynth': return createMetalSynth(config);
    case 'MembraneSynth': return createMembraneSynth(config);
    case 'NoiseSynth': return createNoiseSynth(config);
    case 'Sampler': {
      const hasMODMetadata = config.metadata?.modPlayback?.usePeriodPlayback;
      if (hasMODMetadata) {
        return createPlayer(config);
      }
      return createSampler(config);
    }
    case 'Player': return createPlayer(config);
    case 'GranularSynth': return createGranularSynth(config);
    case 'SuperSaw': return createSuperSaw(config);
    case 'PolySynth': return createPolySynth(config);
    case 'Organ': return createOrgan(config);
    case 'DrumMachine': return createDrumMachine(config);
    case 'ChipSynth': return createChipSynth(config);
    case 'PWMSynth': return createPWMSynth(config);
    case 'StringMachine': return createStringMachine(config);
    case 'ChiptuneModule': return createSynth(config);
    default: return null;
  }
}


export function createSynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: {
      type: (config.oscillator?.type || 'sawtooth') as Tone.ToneOscillatorType,
    } as Partial<Tone.OmniOscillatorOptions>,
    envelope: {
      attack: (config.envelope?.attack ?? 10) / 1000,
      decay: (config.envelope?.decay ?? 200) / 1000,
      sustain: (config.envelope?.sustain ?? 50) / 100,
      release: (config.envelope?.release ?? 1000) / 1000,
    },
    volume: getNormalizedVolume('Synth', config.volume),
  });
  if (config.oscillator?.detune) {
    synth.set({ detune: config.oscillator.detune });
  }

  // Setup pitch envelope if enabled
  const pitchEnv = config.pitchEnvelope;
  const hasPitchEnv = pitchEnv?.enabled && pitchEnv.amount !== 0;

  // If no pitch envelope, return wrapped synth with voice leak prevention
  if (!hasPitchEnv) {
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        // Release any existing voice for this note first to prevent voice leak
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        // Release any existing voice for this note first to prevent voice leak
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => {
        synth.triggerRelease(note, time);
      },
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => synth.connect(dest),
      disconnect: () => synth.disconnect(),
      dispose: () => synth.dispose(),
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  // Wrap synth to add pitch envelope support
  return {
    triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
      const t = time ?? Tone.now();
      // Release any existing voice for this note first to prevent voice leak
      try { synth.triggerRelease(note, t); } catch { /* ignore */ }
      applyPitchEnvelope(synth, pitchEnv!, t, duration);
      synth.triggerAttackRelease(note, duration, t, velocity);
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      const t = time ?? Tone.now();
      // Release any existing voice for this note first to prevent voice leak
      try { synth.triggerRelease(note, t); } catch { /* ignore */ }
      triggerPitchEnvelopeAttack(synth, pitchEnv!, t);
      synth.triggerAttack(note, t, velocity);
    },
    triggerRelease: (note: string, time?: number) => {
      const t = time ?? Tone.now();
      triggerPitchEnvelopeRelease(synth, pitchEnv!, t);
      synth.triggerRelease(note, t);
    },
    releaseAll: () => {
      synth.set({ detune: 0 });
      synth.releaseAll();
    },
    connect: (dest: Tone.InputNode) => synth.connect(dest),
    disconnect: () => synth.disconnect(),
    dispose: () => synth.dispose(),
    volume: synth.volume,
  } as unknown as Tone.ToneAudioNode;
}

export function createMonoSynth(config: InstrumentConfig): Tone.MonoSynth {
  // Build base config first
  const monoConfig: Record<string, unknown> = {
    oscillator: {
      type: (config.oscillator?.type || 'sawtooth') as Tone.ToneOscillatorType,
      detune: config.oscillator?.detune || 0,
    },
    envelope: {
      attack: (config.envelope?.attack ?? 10) / 1000,
      decay: (config.envelope?.decay ?? 200) / 1000,
      sustain: (config.envelope?.sustain ?? 50) / 100,
      release: (config.envelope?.release ?? 1000) / 1000,
    },
    volume: getNormalizedVolume('MonoSynth', config.volume),
  };

  // Only add filter if all required properties exist (don't pass undefined)
  if (config.filter && config.filter.type && config.filter.frequency) {
    monoConfig.filter = {
      type: config.filter.type,
      frequency: config.filter.frequency,
      Q: config.filter.Q ?? 1,
      rolloff: config.filter.rolloff ?? -12,
    };
  }

  // Only add filterEnvelope if all required properties exist (don't pass undefined)
  if (config.filterEnvelope &&
      config.filterEnvelope.baseFrequency !== undefined &&
      config.filterEnvelope.attack !== undefined) {
    monoConfig.filterEnvelope = {
      baseFrequency: config.filterEnvelope.baseFrequency,
      octaves: config.filterEnvelope.octaves ?? 3,
      attack: config.filterEnvelope.attack / 1000,
      decay: (config.filterEnvelope.decay ?? 200) / 1000,
      sustain: (config.filterEnvelope.sustain ?? 50) / 100,
      release: (config.filterEnvelope.release ?? 1000) / 1000,
    };
  }

  return new Tone.MonoSynth(monoConfig as unknown as Tone.MonoSynthOptions);
}

export function createDuoSynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const oscType = (config.oscillator?.type || 'sawtooth') as Tone.ToneOscillatorType;
  const synth = new Tone.DuoSynth({
    voice0: {
      oscillator: {
        type: oscType,
      } as Partial<Tone.OmniOscillatorOptions>,
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
    },
    voice1: {
      oscillator: {
        type: oscType,
      } as Partial<Tone.OmniOscillatorOptions>,
      envelope: {
        attack: (config.envelope?.attack ?? 10) / 1000,
        decay: (config.envelope?.decay ?? 200) / 1000,
        sustain: (config.envelope?.sustain ?? 50) / 100,
        release: (config.envelope?.release ?? 1000) / 1000,
      },
    },
    vibratoAmount: config.oscillator?.detune ? config.oscillator.detune / 100 : 0.5,
    vibratoRate: 5,
    volume: getNormalizedVolume('DuoSynth', config.volume),
  });
  // DuoSynth is monophonic (2 oscillators per single voice) but can still get stuck
  // if triggered rapidly before release completes. Wrap to force release before attack.
  return {
    triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
      try { synth.triggerRelease(time); } catch { /* ignore */ }
      synth.triggerAttackRelease(note, duration, time, velocity);
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      try { synth.triggerRelease(time); } catch { /* ignore */ }
      synth.triggerAttack(note, time, velocity);
    },
    triggerRelease: (time?: number) => synth.triggerRelease(time),
    releaseAll: () => { try { synth.triggerRelease(); } catch { /* ignore */ } },
    connect: (dest: Tone.InputNode) => synth.connect(dest),
    disconnect: () => synth.disconnect(),
    dispose: () => synth.dispose(),
    volume: synth.volume,
  } as unknown as Tone.ToneAudioNode;
}

export function createFMSynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    oscillator: {
      type: config.oscillator?.type || 'sine',
    } as Partial<Tone.OmniOscillatorOptions>,
    envelope: {
      attack: (config.envelope?.attack ?? 10) / 1000,
      decay: (config.envelope?.decay ?? 200) / 1000,
      sustain: (config.envelope?.sustain ?? 50) / 100,
      release: (config.envelope?.release ?? 1000) / 1000,
    },
    modulationIndex: 10,
    volume: getNormalizedVolume('FMSynth', config.volume),
  });
  // Wrap to prevent voice leak on rapid retrigger
  return {
    triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
      try { synth.triggerRelease(note, time); } catch { /* ignore */ }
      synth.triggerAttackRelease(note, duration, time, velocity);
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      try { synth.triggerRelease(note, time); } catch { /* ignore */ }
      synth.triggerAttack(note, time, velocity);
    },
    triggerRelease: (note: string, time?: number) => synth.triggerRelease(note, time),
    releaseAll: () => synth.releaseAll(),
    connect: (dest: Tone.InputNode) => synth.connect(dest),
    disconnect: () => synth.disconnect(),
    dispose: () => synth.dispose(),
    volume: synth.volume,
  } as unknown as Tone.ToneAudioNode;
}

export function createAMSynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new Tone.PolySynth(Tone.AMSynth, {
    oscillator: {
      type: config.oscillator?.type || 'sine',
    } as Partial<Tone.OmniOscillatorOptions>,
    envelope: {
      attack: (config.envelope?.attack ?? 10) / 1000,
      decay: (config.envelope?.decay ?? 200) / 1000,
      sustain: (config.envelope?.sustain ?? 50) / 100,
      release: (config.envelope?.release ?? 1000) / 1000,
    },
    volume: getNormalizedVolume('AMSynth', config.volume),
  });
  // Wrap to prevent voice leak on rapid retrigger
  return {
    triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
      try { synth.triggerRelease(note, time); } catch { /* ignore */ }
      synth.triggerAttackRelease(note, duration, time, velocity);
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      try { synth.triggerRelease(note, time); } catch { /* ignore */ }
      synth.triggerAttack(note, time, velocity);
    },
    triggerRelease: (note: string, time?: number) => synth.triggerRelease(note, time),
    releaseAll: () => synth.releaseAll(),
    connect: (dest: Tone.InputNode) => synth.connect(dest),
    disconnect: () => synth.disconnect(),
    dispose: () => synth.dispose(),
    volume: synth.volume,
  } as unknown as Tone.ToneAudioNode;
}

export function createPluckSynth(config: InstrumentConfig): Tone.ToneAudioNode {
  // PluckSynth (Karplus-Strong) — use directly, NOT wrapped in PolySynth.
  // PolySynth(PluckSynth) fails because PluckSynth doesn't expose the standard
  // frequency/envelope interface that PolySynth expects from its voice type.
  const synth = new Tone.PluckSynth({
    attackNoise: 1,
    dampening: 3000,
    resonance: 0.96,
  });
  synth.volume.value = getNormalizedVolume('PluckSynth', config.volume);

  return {
    triggerAttack: (note: string | number, time?: number) =>
      synth.triggerAttack(note as string, time),
    triggerRelease: (_note?: string | number, time?: number) =>
      synth.triggerRelease(time),
    triggerAttackRelease: (note: string | number, _duration: number, time?: number) =>
      synth.triggerAttack(note as string, time),
    releaseAll: () => {},
    connect: (dest: Tone.InputNode) => synth.connect(dest),
    disconnect: () => synth.disconnect(),
    dispose: () => synth.dispose(),
    volume: synth.volume,
  } as unknown as Tone.ToneAudioNode;
}

export function createMetalSynth(config: InstrumentConfig): Tone.MetalSynth {
  return new Tone.MetalSynth({
    envelope: {
      attack: (config.envelope?.attack ?? 1) / 1000,
      decay: (config.envelope?.decay ?? 100) / 1000,
      release: (config.envelope?.release ?? 100) / 1000,
    },
    volume: getNormalizedVolume('MetalSynth', config.volume),
  });
}

export function createMembraneSynth(config: InstrumentConfig): Tone.MembraneSynth {
  return new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 10,
    oscillator: {
      type: config.oscillator?.type || 'sine',
    } as Partial<Tone.OmniOscillatorOptions>,
    envelope: {
      attack: (config.envelope?.attack ?? 1) / 1000,
      decay: (config.envelope?.decay ?? 400) / 1000,
      sustain: 0.01,
      release: (config.envelope?.release ?? 100) / 1000,
    },
    volume: getNormalizedVolume('MembraneSynth', config.volume),
  });
}

export function createNoiseSynth(config: InstrumentConfig): Tone.NoiseSynth {
  return new Tone.NoiseSynth({
    noise: {
      type: 'white',
    },
    envelope: {
      attack: (config.envelope?.attack ?? 10) / 1000,
      decay: (config.envelope?.decay ?? 200) / 1000,
      sustain: (config.envelope?.sustain ?? 50) / 100,
      release: (config.envelope?.release ?? 1000) / 1000,
    },
    volume: getNormalizedVolume('NoiseSynth', config.volume),
  });
}

export function createSampler(config: InstrumentConfig): Tone.Sampler {
  // Priority 1: Check for multi-sample map (Pro Bake)
  if (config.sample?.multiMap && Object.keys(config.sample.multiMap).length > 0) {
    console.log(`[InstrumentFactory] Creating Multi-Sampler for ${config.name} with ${Object.keys(config.sample.multiMap).length} samples`);
    return new Tone.Sampler({
      urls: config.sample.multiMap,
      volume: getNormalizedVolume('Sampler', config.volume),
    });
  }

  // Priority 2: Check for sample URL from parameters (Legacy/Upload)
  const params = config.parameters as Record<string, string | number> | undefined;
  const sampleUrl = params?.sampleUrl as string | undefined || config.sample?.url;
  const baseNote = config.sample?.baseNote || 'C4';

  // CRITICAL: Check if this is a MOD/XM instrument loaded from localStorage
  if (!sampleUrl && config.metadata?.importedFrom) {
    console.error(
      `[InstrumentFactory] CRITICAL: MOD/XM instrument "${config.name}" has no audio data!`,
      'This happens when instruments are loaded from localStorage.',
      'AudioBuffers and blob URLs cannot be serialized to JSON.',
      'Solution: Re-import the MOD/XM file to restore audio.'
    );
  }

  if (sampleUrl) {
    console.log(`[InstrumentFactory] Creating Sampler with sample URL:`, {
      instrumentId: config.id,
      baseNote,
      hasUrl: !!sampleUrl,
      urlPreview: String(sampleUrl).substring(0, 50) + '...',
    });

    // Map sample to its actual base note
    const urls: { [note: string]: string } = {};
    urls[baseNote] = sampleUrl as string;

    return new Tone.Sampler({
      urls,
      volume: getNormalizedVolume('Sampler', config.volume),
    });
  }

  // No sample loaded - create empty sampler
  console.warn(`[InstrumentFactory] Creating empty Sampler (no sample URL provided)`);
  return new Tone.Sampler({
    volume: getNormalizedVolume('Sampler', config.volume),
  });
}

export function createPlayer(config: InstrumentConfig): Tone.Player {
  // Get sample URL from parameters (base64 data URL from user upload)
  const pp = config.parameters as Record<string, string | number> | undefined;
  const sampleUrl = pp?.sampleUrl as string | undefined;
  const reverseMode = pp?.reverseMode || 'forward';

  if (sampleUrl) {
    const player = new Tone.Player({
      url: sampleUrl as string,
      volume: getNormalizedVolume('Player', config.volume),
      reverse: reverseMode === 'reverse',
    });
    return player;
  }

  // No sample loaded - create empty player
  return new Tone.Player({
    volume: getNormalizedVolume('Player', config.volume),
  });
}

export function createGranularSynth(config: InstrumentConfig): Tone.GrainPlayer {
  // Get sample URL and granular config
  const sampleUrl = config.granular?.sampleUrl || (config.parameters as Record<string, string> | undefined)?.sampleUrl;
  const granularConfig = config.granular;

  if (sampleUrl) {
    const grainPlayer = new Tone.GrainPlayer({
      url: sampleUrl as string,
      grainSize: (granularConfig?.grainSize || 100) / 1000, // ms to seconds
      overlap: (granularConfig?.grainOverlap || 50) / 100, // percentage to ratio
      playbackRate: granularConfig?.playbackRate || 1,
      detune: granularConfig?.detune || 0,
      reverse: granularConfig?.reverse || false,
      loop: true,
      loopStart: 0,
      loopEnd: 0, // 0 = end of buffer
      volume: getNormalizedVolume('GranularSynth', config.volume),
    });
    return grainPlayer;
  }

  // No sample loaded - create with placeholder
  return new Tone.GrainPlayer({
    grainSize: 0.1,
    overlap: 0.5,
    playbackRate: 1,
    loop: true,
    volume: getNormalizedVolume('GranularSynth', config.volume),
  });
}

export function createSuperSaw(config: InstrumentConfig): Tone.ToneAudioNode {
  const ssConfig = config.superSaw || DEFAULT_SUPERSAW;
  const detuneSpread = ssConfig.detune;

  // Create a PolySynth with sawtooth and add unison effect via chorus
  const synth = new Tone.PolySynth(Tone.Synth, {

    oscillator: {
      type: 'sawtooth',
    },
    envelope: {
      attack: (ssConfig.envelope?.attack || 10) / 1000,
      decay: (ssConfig.envelope?.decay || 100) / 1000,
      sustain: (ssConfig.envelope?.sustain ?? 80) / 100,
      release: (ssConfig.envelope?.release || 300) / 1000,
    },
    volume: getNormalizedVolume('SuperSaw', config.volume),
  });

  // Apply filter
  const filter = new Tone.Filter({
    type: ssConfig.filter.type,
    frequency: ssConfig.filter.cutoff,
    Q: ssConfig.filter.resonance / 10,
    rolloff: -24,
  });

  // Add chorus for the supersaw detuning effect (simulates multiple detuned oscillators)
  const chorus = new Tone.Chorus({
    frequency: 4,
    delayTime: 2.5,
    depth: Math.min(1, detuneSpread / 50), // Map 0-100 to 0-2, capped at 1
    wet: 0.8,
  });
  chorus.start();

  // Connect synth -> filter -> chorus
  synth.connect(filter);
  filter.connect(chorus);

  // Setup pitch envelope if enabled
  const pitchEnv = config.pitchEnvelope;
  const hasPitchEnv = pitchEnv?.enabled && pitchEnv.amount !== 0;

  // Return a wrapper object
  return {
    triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
      const t = time ?? Tone.now();
      // Release any existing voice for this note first to prevent voice leak
      try { synth.triggerRelease(note, t); } catch { /* ignore */ }
      if (hasPitchEnv) {
        applyPitchEnvelope(synth, pitchEnv!, t, duration);
      }
      synth.triggerAttackRelease(note, duration, t, velocity);
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      const t = time ?? Tone.now();
      // Release any existing voice for this note first to prevent voice leak
      try { synth.triggerRelease(note, t); } catch { /* ignore */ }
      if (hasPitchEnv) {
        triggerPitchEnvelopeAttack(synth, pitchEnv!, t);
      }
      synth.triggerAttack(note, t, velocity);
    },
    triggerRelease: (note: string, time?: number) => {
      const t = time ?? Tone.now();
      if (hasPitchEnv) {
        triggerPitchEnvelopeRelease(synth, pitchEnv!, t);
      }
      synth.triggerRelease(note, t);
    },
    releaseAll: () => {
      synth.set({ detune: 0 }); // Reset pitch on release all
      synth.releaseAll();
    },
    connect: (dest: Tone.InputNode) => chorus.connect(dest),
    disconnect: () => chorus.disconnect(),
    dispose: () => {
      synth.dispose();
      filter.dispose();
      chorus.dispose();
    },
    applyConfig: (newConfig: Record<string, unknown>) => {
      const ssc = newConfig || DEFAULT_SUPERSAW;
      const env = ssc.envelope as Record<string, number>;
      const flt = ssc.filter as Record<string, number & string>;
      synth.set({
        envelope: {
          attack: (env.attack || 10) / 1000,
          decay: (env.decay || 100) / 1000,
          sustain: (env.sustain || 80) / 100,
          release: (env.release || 300) / 1000,
        }
      });
      filter.set({
        type: flt.type,
        frequency: flt.cutoff,
        Q: flt.resonance / 10,
      });
      chorus.set({
        depth: Math.min(1, (ssc.detune as number) / 50),
      });
    },
    volume: synth.volume,
  } as unknown as Tone.ToneAudioNode;
}

export function createPolySynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const psConfig = config.polySynth || DEFAULT_POLYSYNTH;

  // Select voice type
  let VoiceClass: typeof Tone.Synth | typeof Tone.FMSynth | typeof Tone.AMSynth = Tone.Synth;
  if (psConfig.voiceType === 'FMSynth') VoiceClass = Tone.FMSynth;
  else if (psConfig.voiceType === 'AMSynth') VoiceClass = Tone.AMSynth;

  const synth = new Tone.PolySynth(VoiceClass as any, {
    oscillator: {
      type: psConfig.oscillator?.type || 'sawtooth',
    } as Partial<Tone.OmniOscillatorOptions>,
    envelope: {
      attack: (psConfig.envelope?.attack || 50) / 1000,
      decay: (psConfig.envelope?.decay || 200) / 1000,
      sustain: (psConfig.envelope?.sustain ?? 70) / 100,
      release: (psConfig.envelope?.release || 500) / 1000,
    },
    volume: getNormalizedVolume('PolySynth', config.volume),
  });
  synth.maxPolyphony = psConfig.voiceCount;

  // Setup pitch envelope if enabled
  const pitchEnv = config.pitchEnvelope;
  const hasPitchEnv = pitchEnv?.enabled && pitchEnv.amount !== 0;

  // If no pitch envelope, return wrapped synth with voice leak prevention
  if (!hasPitchEnv) {
    return {
      triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      triggerAttack: (note: string, time?: number, velocity?: number) => {
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttack(note, time, velocity);
      },
      triggerRelease: (note: string, time?: number) => synth.triggerRelease(note, time),
      releaseAll: () => synth.releaseAll(),
      connect: (dest: Tone.InputNode) => synth.connect(dest),
      disconnect: () => synth.disconnect(),
      dispose: () => synth.dispose(),
      volume: synth.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  // Wrap synth to add pitch envelope support
  return {
    triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
      const t = time ?? Tone.now();
      try { synth.triggerRelease(note, t); } catch { /* ignore */ }
      applyPitchEnvelope(synth, pitchEnv!, t, duration);
      synth.triggerAttackRelease(note, duration, t, velocity);
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      const t = time ?? Tone.now();
      try { synth.triggerRelease(note, t); } catch { /* ignore */ }
      triggerPitchEnvelopeAttack(synth, pitchEnv!, t);
      synth.triggerAttack(note, t, velocity);
    },
    triggerRelease: (note: string, time?: number) => {
      const t = time ?? Tone.now();
      triggerPitchEnvelopeRelease(synth, pitchEnv!, t);
      synth.triggerRelease(note, t);
    },
    releaseAll: () => {
      synth.set({ detune: 0 });
      synth.releaseAll();
    },
    connect: (dest: Tone.InputNode) => synth.connect(dest),
    disconnect: () => synth.disconnect(),
    dispose: () => synth.dispose(),
    volume: synth.volume,
  } as unknown as Tone.ToneAudioNode;
}

export function createOrgan(config: InstrumentConfig): Tone.ToneAudioNode {
  const orgConfig = config.organ || DEFAULT_ORGAN;
  const drawbars = orgConfig.drawbars || DEFAULT_ORGAN.drawbars;
  const output = new Tone.Gain(1);

  // Create polyphonic sine synth for organ tone
  const synth = new Tone.PolySynth(Tone.Synth, {

    oscillator: {
      type: 'custom',
      partials: [
        drawbars[0] / 8, // sub
        drawbars[1] / 8, // fundamental
        drawbars[2] / 8, // 3rd
        drawbars[3] / 8, // 4th
        drawbars[4] / 8, // 5th
        drawbars[5] / 8, // 6th
        drawbars[6] / 8, // 7th
        drawbars[7] / 8, // 8th
        drawbars[8] / 8, // 9th
      ]
    } as any,
    envelope: {
      attack: 0.005, // Fast attack for organ click
      decay: 0.1,
      sustain: 1.0,  // Organ sustains fully
      release: 0.1,
    },
    volume: getNormalizedVolume('Organ', config.volume),
  });
  synth.maxPolyphony = 32;

  // Add Leslie/rotary effect
  let rotary: Tone.Tremolo | null = null;
  if (orgConfig.rotary?.enabled) {
    rotary = new Tone.Tremolo({
      frequency: orgConfig.rotary.speed === 'fast' ? 6 : 1,
      depth: 0.3,
      wet: 0.5,
    });
    rotary.start();
    synth.connect(rotary);
    rotary.connect(output);
  } else {
    synth.connect(output);
  }

  return {
    triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
      // Release any existing voice for this note first to prevent voice leak
      try { synth.triggerRelease(note, time); } catch { /* ignore */ }
      synth.triggerAttackRelease(note, duration, time, velocity);
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      // Release any existing voice for this note first to prevent voice leak
      try { synth.triggerRelease(note, time); } catch { /* ignore */ }
      synth.triggerAttack(note, time, velocity);
    },
    triggerRelease: (note: string, time?: number) => {
      synth.triggerRelease(note, time);
    },
    releaseAll: () => synth.releaseAll(),
    connect: (dest: Tone.InputNode) => output.connect(dest),
    disconnect: () => output.disconnect(),
    dispose: () => {
      synth.dispose();
      rotary?.dispose();
      output.dispose();
    },
    applyConfig: (newConfig: Record<string, unknown>) => {
      const oc = newConfig || DEFAULT_ORGAN;
      const db = oc.drawbars as number[];
      synth.set({
        oscillator: {
          partials: [
            (db[0] || 0) / 8,
            (db[1] || 0) / 8,
            (db[2] || 0) / 8,
            (db[3] || 0) / 8,
            (db[4] || 0) / 8,
            (db[5] || 0) / 8,
            (db[6] || 0) / 8,
            (db[7] || 0) / 8,
            (db[8] || 0) / 8,
          ]
        }
      });
      if (rotary) {
        rotary.frequency.rampTo((oc.rotary as Record<string, string>)?.speed === 'fast' ? 6 : 1, 0.1);
      }
    },
    volume: synth.volume,
  } as unknown as Tone.ToneAudioNode;
}

export function createDrumMachine(config: InstrumentConfig): Tone.ToneAudioNode {
  const dmConfig = config.drumMachine || DEFAULT_DRUM_MACHINE;
  const is808 = dmConfig.machineType === '808';

  switch (dmConfig.drumType) {
    case 'kick': {
      // 808 vs 909 kick defaults - significantly different character
      const kickDefaults808 = {
        pitch: 48,          // 808: lower base frequency
        pitchDecay: 50,
        tone: 40,
        toneDecay: 30,
        decay: 200,         // 808: slightly shorter default
        drive: 60,          // 808: more saturation
        envAmount: 2.0,     // 808: less pitch sweep
        envDuration: 110,   // 808: longer pitch envelope
        filterFreq: 250,    // 808: much lower filter (warm/boomy)
      };
      const kickDefaults909 = {
        pitch: 80,          // 909: higher, punchier
        pitchDecay: 50,
        tone: 50,
        toneDecay: 20,
        decay: 300,
        drive: 50,
        envAmount: 2.5,     // 909: more aggressive pitch sweep
        envDuration: 50,    // 909: shorter, snappier
        filterFreq: 3000,   // 909: bright/punchy
      };
      const kickConfig = {
        ...(is808 ? kickDefaults808 : kickDefaults909),
        ...dmConfig.kick
      };

      // TR-909 kick: sine oscillator with pitch envelope and saturation
      // Using MembraneSynth as base for pitch envelope capability
      const synth = new Tone.MembraneSynth({
        // pitchDecay controls how fast pitch drops - use envDuration
        pitchDecay: kickConfig.envDuration / 1000,
        // octaves controls pitch envelope depth - derive from envAmount
        // envAmount 2.5 means start at freq*2.5, so ~1.3 octaves above base
        octaves: Math.log2(kickConfig.envAmount) * 2,
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.001,
          decay: kickConfig.decay / 1000,
          sustain: 0,
          release: 0.1,
        },
        volume: getNormalizedVolume('DrumMachine', config.volume),
      });

      // Add saturation via waveshaper if drive > 0
      let output: Tone.ToneAudioNode = synth;
      let saturation: Tone.Distortion | null = null;
      let filter: Tone.Filter | null = null;

      if (kickConfig.drive > 0) {
        saturation = new Tone.Distortion({
          distortion: (kickConfig.drive / 100) * 0.5, // Scale to reasonable range
          oversample: '2x',
          wet: 1,
        });
      }

      // Add lowpass filter (909: 3000Hz)
      filter = new Tone.Filter({
        type: 'lowpass',
        frequency: kickConfig.filterFreq,
        Q: 1,
        rolloff: -24,
      });

      // Connect chain: synth -> saturation (if any) -> filter
      if (saturation) {
        synth.connect(saturation);
        saturation.connect(filter);
      } else {
        synth.connect(filter);
      }
      output = filter;

      // Use fixed 909 frequency (80Hz) regardless of note
      const baseNote = Tone.Frequency(kickConfig.pitch, 'hz').toNote();

      return {
        triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
          synth.triggerAttackRelease(baseNote, duration, time, velocity);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          synth.triggerAttack(baseNote, time, velocity);
        },
        triggerRelease: (_note: string, time?: number) => {
          synth.triggerRelease(time);
        },
        releaseAll: () => { try { synth.triggerRelease(); } catch { /* ignore */ } },
        connect: (dest: Tone.InputNode) => output.connect(dest),
        disconnect: () => output.disconnect(),
        dispose: () => {
          synth.dispose();
          saturation?.dispose();
          filter?.dispose();
        },
        applyConfig: (newConfig: Record<string, unknown>) => {
          const dmc = newConfig || DEFAULT_DRUM_MACHINE;
          const kc = dmc.kick as Record<string, number> | undefined;
          if (!kc) return;

          synth.set({
            pitchDecay: kc.envDuration / 1000,
            octaves: Math.log2(kc.envAmount) * 2,
            envelope: {
              decay: kc.decay / 1000,
            }
          });
          if (saturation) {
            saturation.distortion = (kc.drive / 100) * 0.5;
          }
          if (filter) {
            filter.frequency.rampTo(kc.filterFreq, 0.1);
          }
        },
        volume: synth.volume,
      } as unknown as Tone.ToneAudioNode;
    }

    case 'snare': {
      // 808 vs 909 snare defaults
      const snareDefaults808 = {
        pitch: 238,           // 808: lower frequency body
        tone: 35,             // 808: more body-focused
        toneDecay: 200,       // 808: longer noise decay
        snappy: 55,           // 808: less harsh noise
        decay: 150,           // 808: slightly longer body
        envAmount: 2.5,       // 808: less aggressive pitch sweep
        envDuration: 25,      // 808: medium pitch envelope
        filterType: 'lowpass' as const, // 808: lowpass for warmth
        filterFreq: 2500,     // 808: warmer filter
      };
      const snareDefaults909 = {
        pitch: 220,           // 909: slightly higher
        tone: 25,
        toneDecay: 250,       // 909: longer
        snappy: 70,           // 909: sharper noise
        decay: 100,           // 909: snappier body
        envAmount: 4.0,       // 909: aggressive pitch sweep
        envDuration: 10,      // 909: very fast pitch drop
        filterType: 'notch' as const, // 909: characteristic notch
        filterFreq: 1000,
      };
      const snareConfig = {
        ...(is808 ? snareDefaults808 : snareDefaults909),
        ...dmConfig.snare
      };

      // Snare: pitched body with pitch envelope + filtered noise
      const body = new Tone.MembraneSynth({
        pitchDecay: snareConfig.envDuration / 1000, // 909: 10ms fast pitch drop
        octaves: Math.log2(snareConfig.envAmount) * 2, // 909: 4x = ~2 octaves
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.001,
          decay: snareConfig.decay / 1000,
          sustain: 0,
          release: 0.1,
        },
        volume: getNormalizedVolume('DrumMachine', config.volume),
      });

      // Noise component for snare "snap"
      const noise = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: {
          attack: 0.001,
          decay: snareConfig.toneDecay / 1000, // 909: 250ms
          sustain: 0,
          release: 0.05,
        },
        volume: (getNormalizedVolume('DrumMachine', config.volume)) + (snareConfig.snappy / 15 - 3),
      });

      // 909 uses notch filter at 1000Hz on snare
      const filter = new Tone.Filter({
        type: snareConfig.filterType,
        frequency: snareConfig.filterFreq,
        Q: 2,
      });

      const output = new Tone.Gain(1);
      body.connect(output);
      noise.connect(filter);
      filter.connect(output);

      // Use fixed 909 frequency
      const baseNote = Tone.Frequency(snareConfig.pitch, 'hz').toNote();

      return {
        triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
          body.triggerAttackRelease(baseNote, duration, time, velocity);
          noise.triggerAttackRelease(duration, time, velocity);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          body.triggerAttack(baseNote, time, velocity);
          noise.triggerAttack(time, velocity);
        },
        triggerRelease: (_note: string, time?: number) => {
          body.triggerRelease(time);
          noise.triggerRelease(time);
        },
        releaseAll: () => {
          try { body.triggerRelease(); } catch { /* ignore */ }
          try { noise.triggerRelease(); } catch { /* ignore */ }
        },
        connect: (dest: Tone.InputNode) => output.connect(dest),
        disconnect: () => output.disconnect(),
        dispose: () => {
          body.dispose();
          noise.dispose();
          filter.dispose();
          output.dispose();
        },
        applyConfig: (newConfig: Record<string, unknown>) => {
          const dmc = newConfig || DEFAULT_DRUM_MACHINE;
          const sc = dmc.snare as Record<string, number & string> | undefined;
          if (!sc) return;

          body.set({
            pitchDecay: sc.envDuration / 1000,
            octaves: Math.log2(sc.envAmount) * 2,
            envelope: {
              decay: sc.decay / 1000,
            }
          });
          noise.set({
            envelope: {
              decay: sc.toneDecay / 1000,
            },
            volume: (getNormalizedVolume('DrumMachine', config.volume)) + (sc.snappy / 15 - 3),
          });
          filter.set({
            type: sc.filterType,
            frequency: sc.filterFreq,
          });
        },
        volume: body.volume,
      } as unknown as Tone.ToneAudioNode;
    }

    case 'hihat': {
      // 808 vs 909 hihat defaults - 808 uses 6-square metallic, 909 samples
      const hhDefaults808 = { tone: 40, decay: 80, metallic: 70 };   // 808: warmer, more metallic
      const hhDefaults909 = { tone: 50, decay: 100, metallic: 50 }; // 909: crisper
      const hhConfig = { ...(is808 ? hhDefaults808 : hhDefaults909), ...dmConfig.hihat };
      // Hi-hat: metal synth approximation
      const metalSynth = new Tone.MetalSynth({
        envelope: {
          attack: 0.001,
          decay: hhConfig.decay / 1000,
          release: is808 ? 0.02 : 0.01,
        },
        harmonicity: 5.1,
        modulationIndex: 32 + hhConfig.metallic / 3,
        resonance: 4000 + hhConfig.tone * 40,
        octaves: 1.5,
        volume: getNormalizedVolume('DrumMachine', config.volume),
      });
      metalSynth.frequency.value = is808 ? 180 + hhConfig.tone * 1.5 : 200 + hhConfig.tone * 2;
      return metalSynth;
    }

    case 'clap': {
      // 808 vs 909 clap defaults
      const clapDefaults808 = {
        tone: 45,              // 808: slightly darker
        decay: 120,            // 808: longer reverby tail
        toneDecay: 350,        // 808: longer noise envelope
        spread: 15,            // 808: wider spread for room effect
        filterFreqs: [700, 1000] as [number, number], // 808: lower filter freqs
        modulatorFreq: 30,
      };
      const clapDefaults909 = {
        tone: 55,              // 909: brighter
        decay: 80,             // 909: snappier
        toneDecay: 250,
        spread: 10,            // 909: tighter spread
        filterFreqs: [900, 1200] as [number, number],
        modulatorFreq: 40,
      };
      const clapConfig = {
        ...(is808 ? clapDefaults808 : clapDefaults909),
        ...dmConfig.clap
      };

      // Clap: Multiple delayed noise bursts with filtering
      // Creates the "clap" effect by triggering noise at slightly
      // offset times creating a richer, more realistic clap
      const output = new Tone.Gain(1);

      // Create noise source for the sustained clap tail
      const noise = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: {
          attack: 0.001,
          decay: clapConfig.decay / 1000,
          sustain: 0,
          release: 0.05,
        },
        volume: getNormalizedVolume('DrumMachine', config.volume),
      });

      // Serial bandpass filters (909: highpass 900Hz -> bandpass 1200Hz)
      const filter1 = new Tone.Filter({
        type: 'highpass',
        frequency: clapConfig.filterFreqs[0],
        Q: 1.2,
      });
      const filter2 = new Tone.Filter({
        type: 'bandpass',
        frequency: clapConfig.filterFreqs[1],
        Q: 0.7,
      });

      // Tone filter for the initial burst character (909: 2200Hz bandpass)
      const toneFilter = new Tone.Filter({
        type: 'bandpass',
        frequency: 1000 + clapConfig.tone * 24, // Scale 0-100 to ~1000-3400Hz
        Q: 2,
      });

      noise.connect(toneFilter);
      toneFilter.connect(filter1);
      filter1.connect(filter2);
      filter2.connect(output);

      // Create additional noise bursts for the "spread" effect
      // In hardware this is done with delay lines; we simulate with timed triggers
      const burstNoises: Tone.NoiseSynth[] = [];
      const numBursts = 4;
      for (let i = 0; i < numBursts; i++) {
        const burstNoise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: (clapConfig.toneDecay / 1000) / (i + 1), // Each burst shorter
            sustain: 0,
            release: 0.02,
          },
          volume: getNormalizedVolume('DrumMachine', config.volume) - (i * 3), // Each burst quieter
        });
        burstNoise.connect(toneFilter);
        burstNoises.push(burstNoise);
      }

      return {
        triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
          const t = time ?? Tone.now();
          const spreadMs = clapConfig.spread / 1000;
          // Trigger the delayed bursts
          burstNoises.forEach((burst, i) => {
            const burstTime = t + (i * spreadMs);
            const burstVel = (velocity ?? 1) * (1 - i * 0.15);
            burst.triggerAttackRelease(duration / (i + 1), burstTime, burstVel);
          });
          // Main sustain comes last
          noise.triggerAttackRelease(duration, t + (numBursts * spreadMs), velocity);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          const t = time ?? Tone.now();
          const spreadMs = clapConfig.spread / 1000;
          burstNoises.forEach((burst, i) => {
            burst.triggerAttack(t + (i * spreadMs), (velocity ?? 1) * (1 - i * 0.15));
          });
          noise.triggerAttack(t + (numBursts * spreadMs), velocity);
        },
        triggerRelease: (_note: string, time?: number) => {
          noise.triggerRelease(time);
          burstNoises.forEach(burst => burst.triggerRelease(time));
        },
        releaseAll: () => {
          try { noise.triggerRelease(); } catch { /* ignore */ }
          burstNoises.forEach(burst => {
            try { burst.triggerRelease(); } catch { /* ignore */ }
          });
        },
        connect: (dest: Tone.InputNode) => output.connect(dest),
        disconnect: () => output.disconnect(),
        dispose: () => {
          noise.dispose();
          burstNoises.forEach(burst => burst.dispose());
          filter1.dispose();
          filter2.dispose();
          toneFilter.dispose();
          output.dispose();
        },
        applyConfig: (newConfig: Record<string, unknown>) => {
          const dmc = newConfig || DEFAULT_DRUM_MACHINE;
          const cc = dmc.clap as Record<string, any> | undefined;
          if (!cc) return;

          noise.set({
            envelope: {
              decay: cc.decay / 1000,
            }
          });
          filter1.frequency.rampTo(cc.filterFreqs[0], 0.1);
          filter2.frequency.rampTo(cc.filterFreqs[1], 0.1);
          toneFilter.frequency.rampTo(1000 + cc.tone * 24, 0.1);

          burstNoises.forEach((burst, i) => {
            burst.set({
              envelope: {
                decay: (cc.toneDecay / 1000) / (i + 1),
              }
            });
          });
        },
        volume: noise.volume,
      } as unknown as Tone.ToneAudioNode;
    }

    case 'tom': {
      // 808 vs 909 tom defaults
      const tomDefaults808 = {
        pitch: 160,            // 808: slightly lower
        decay: 300,            // 808: longer decay
        tone: 2,               // 808: pure sine, minimal noise
        toneDecay: 50,
        envAmount: 1.5,        // 808: gentler pitch sweep
        envDuration: 150,      // 808: longer envelope
      };
      const tomDefaults909 = {
        pitch: 200,            // 909: punchier
        decay: 200,
        tone: 5,               // 909: slight noise
        toneDecay: 100,
        envAmount: 2.0,        // 909: more aggressive
        envDuration: 100,
      };
      const tomConfig = {
        ...(is808 ? tomDefaults808 : tomDefaults909),
        ...dmConfig.tom
      };

      // Tom: pitched sine with pitch envelope
      const synth = new Tone.MembraneSynth({
        pitchDecay: tomConfig.envDuration / 1000,
        octaves: Math.log2(tomConfig.envAmount) * 2,
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.001,
          decay: tomConfig.decay / 1000,
          sustain: 0,
          release: 0.1,
        },
        volume: getNormalizedVolume('DrumMachine', config.volume),
      });

      // Small amount of noise for attack character
      const noise = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: {
          attack: 0.001,
          decay: tomConfig.toneDecay / 1000,
          sustain: 0,
          release: 0.02,
        },
        volume: (getNormalizedVolume('DrumMachine', config.volume)) - 20 + (tomConfig.tone / 5), // Very subtle noise
      });

      const output = new Tone.Gain(1);
      synth.connect(output);
      noise.connect(output);

      const baseNote = Tone.Frequency(tomConfig.pitch, 'hz').toNote();

      return {
        triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
          synth.triggerAttackRelease(baseNote, duration, time, velocity);
          noise.triggerAttackRelease(duration * 0.3, time, velocity);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          synth.triggerAttack(baseNote, time, velocity);
          noise.triggerAttack(time, velocity);
        },
        triggerRelease: (_note: string, time?: number) => {
          synth.triggerRelease(time);
          noise.triggerRelease(time);
        },
        releaseAll: () => {
          try { synth.triggerRelease(); } catch { /* ignore */ }
          try { noise.triggerRelease(); } catch { /* ignore */ }
        },
        connect: (dest: Tone.InputNode) => output.connect(dest),
        disconnect: () => output.disconnect(),
        dispose: () => {
          synth.dispose();
          noise.dispose();
          output.dispose();
        },
        applyConfig: (newConfig: Record<string, unknown>) => {
          const dmc = newConfig || DEFAULT_DRUM_MACHINE;
          const tc = dmc.tom as Record<string, number> | undefined;
          if (!tc) return;

          synth.set({
            pitchDecay: tc.envDuration / 1000,
            octaves: Math.log2(tc.envAmount) * 2,
            envelope: {
              decay: tc.decay / 1000,
            }
          });
          noise.set({
            envelope: {
              decay: tc.toneDecay / 1000,
            },
            volume: (getNormalizedVolume('DrumMachine', config.volume)) - 20 + (tc.tone / 5),
          });
        },
        volume: synth.volume,
      } as unknown as Tone.ToneAudioNode;
    }

    case 'rimshot': {
      // 808 vs 909 rimshot defaults
      const rimDefaults808 = {
        decay: 45,             // 808: slightly longer decay
        filterFreqs: [280, 450, 850] as [number, number, number], // 808: lower freqs
        filterQ: 8.0,          // 808: slightly less resonant
        saturation: 2.0,       // 808: less aggressive
      };
      const rimDefaults909 = {
        decay: 30,             // 909: snappier
        filterFreqs: [220, 500, 950] as [number, number, number],
        filterQ: 10.5,         // 909: very resonant "ping"
        saturation: 3.0,       // 909: more aggressive
      };
      const rimConfig = {
        ...(is808 ? rimDefaults808 : rimDefaults909),
        ...dmConfig.rimshot
      };

      // Rimshot: Parallel resonant bandpass filters with saturation
      // The high Q creates the characteristic "ping"
      // Uses a short noise impulse to excite the resonant filters

      // Create noise burst as impulse source
      const noise = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: {
          attack: 0.001,
          decay: rimConfig.decay / 1000,
          sustain: 0,
          release: 0.01,
        },
        volume: getNormalizedVolume('DrumMachine', config.volume),
      });

      // Three parallel resonant bandpass filters (909 characteristic)
      const filter1 = new Tone.Filter({
        type: 'bandpass',
        frequency: rimConfig.filterFreqs[0],
        Q: rimConfig.filterQ,
      });
      const filter2 = new Tone.Filter({
        type: 'bandpass',
        frequency: rimConfig.filterFreqs[1],
        Q: rimConfig.filterQ,
      });
      const filter3 = new Tone.Filter({
        type: 'bandpass',
        frequency: rimConfig.filterFreqs[2],
        Q: rimConfig.filterQ,
      });

      // Mix the parallel filters
      const filterMix = new Tone.Gain(1);
      noise.connect(filter1);
      noise.connect(filter2);
      noise.connect(filter3);
      filter1.connect(filterMix);
      filter2.connect(filterMix);
      filter3.connect(filterMix);

      // Saturation for the punchy 909 rimshot character
      const saturation = new Tone.Distortion({
        distortion: (rimConfig.saturation / 5) * 0.8, // Scale saturation
        oversample: '2x',
        wet: 1,
      });

      // Highpass to remove mud
      const highpass = new Tone.Filter({
        type: 'highpass',
        frequency: 100,
        Q: 0.5,
      });

      filterMix.connect(saturation);
      saturation.connect(highpass);

      return {
        triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
          noise.triggerAttackRelease(duration, time, velocity);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          noise.triggerAttack(time, velocity);
        },
        triggerRelease: (_note: string, time?: number) => {
          noise.triggerRelease(time);
        },
        releaseAll: () => {
          try { noise.triggerRelease(); } catch { /* ignore */ }
        },
        connect: (dest: Tone.InputNode) => highpass.connect(dest),
        disconnect: () => highpass.disconnect(),
        dispose: () => {
          noise.dispose();
          filter1.dispose();
          filter2.dispose();
          filter3.dispose();
          filterMix.dispose();
          saturation.dispose();
          highpass.dispose();
        },
        applyConfig: (newConfig: Record<string, unknown>) => {
          const dmc = newConfig || DEFAULT_DRUM_MACHINE;
          const rc = dmc.rimshot as Record<string, any> | undefined;
          if (!rc) return;

          noise.set({
            envelope: {
              decay: rc.decay / 1000,
            }
          });
          filter1.frequency.rampTo(rc.filterFreqs[0], 0.1);
          filter2.frequency.rampTo(rc.filterFreqs[1], 0.1);
          filter3.frequency.rampTo(rc.filterFreqs[2], 0.1);
          filter1.Q.value = rc.filterQ;
          filter2.Q.value = rc.filterQ;
          filter3.Q.value = rc.filterQ;
          saturation.distortion = (rc.saturation / 5) * 0.8;
        },
        volume: noise.volume,
      } as unknown as Tone.ToneAudioNode;
    }

    // =========================================================================
    // TR-808 SPECIFIC DRUM TYPES
    // Based on io-808 web emulator - 100% synthesized (no samples)
    // =========================================================================

    case 'conga': {
      // TR-808 Conga: Pure sine oscillator (higher pitched than tom, no noise)
      const congaConfig = {
        pitch: 310,           // Mid conga default
        decay: 180,           // 808: 180ms
        tuning: 50,           // 0-100% pitch interpolation
        ...dmConfig.conga
      };

      // 808 congas are pure sine - no noise component like toms
      const synth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.001,
          decay: congaConfig.decay / 1000,
          sustain: 0,
          release: 0.1,
        },
        volume: getNormalizedVolume('DrumMachine', config.volume),
      });

      // Lowpass filter for warmth
      const filter = new Tone.Filter({
        type: 'lowpass',
        frequency: 10000,
        Q: 1,
      });

      synth.connect(filter);
      const baseNote = Tone.Frequency(congaConfig.pitch, 'hz').toNote();

      return {
        triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
          synth.triggerAttackRelease(baseNote, duration, time, velocity);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          synth.triggerAttack(baseNote, time, velocity);
        },
        triggerRelease: (_note: string, time?: number) => {
          synth.triggerRelease(time);
        },
        releaseAll: () => {
          try { synth.triggerRelease(); } catch { /* ignore */ }
        },
        connect: (dest: Tone.InputNode) => filter.connect(dest),
        disconnect: () => filter.disconnect(),
        dispose: () => {
          synth.dispose();
          filter.dispose();
        },
        applyConfig: (newConfig: Record<string, unknown>) => {
          const dmc = newConfig || DEFAULT_DRUM_MACHINE;
          const cc = dmc.conga as Record<string, number> | undefined;
          if (!cc) return;

          synth.set({
            envelope: {
              decay: cc.decay / 1000,
            }
          });
        },
        volume: synth.volume,
      } as unknown as Tone.ToneAudioNode;
    }

    case 'cowbell': {
      // TR-808 Cowbell: Dual square oscillators at 540Hz and 800Hz through bandpass
      // Dual envelope: short attack + longer exponential tail
      const cowbellConfig = {
        decay: 400,           // 808: 15ms short + 400ms tail
        filterFreq: 2640,     // 808: 2640Hz bandpass center
        ...dmConfig.cowbell
      };

      // Two square oscillators at fixed 808 frequencies
      const osc1 = new Tone.Oscillator({
        type: 'square',
        frequency: 540,
        volume: -6,
      });
      const osc2 = new Tone.Oscillator({
        type: 'square',
        frequency: 800,
        volume: -6,
      });

      // Short envelope for attack transient
      const shortVCA = new Tone.Gain(0);
      // Long envelope for sustaining tail
      const longVCA = new Tone.Gain(0);

      // Bandpass filter for cowbell character
      const filter = new Tone.Filter({
        type: 'bandpass',
        frequency: cowbellConfig.filterFreq,
        Q: 1,
      });

      // Mix oscillators
      const oscMix = new Tone.Gain(0.3);
      osc1.connect(oscMix);
      osc2.connect(oscMix);

      // Split to short and long VCAs
      oscMix.connect(shortVCA);
      oscMix.connect(longVCA);

      // Output mix — apply volume normalization (dB → linear)
      const normDb = getNormalizedVolume('DrumMachine', config.volume);
      const output = new Tone.Gain(Math.pow(10, normDb / 20));
      shortVCA.connect(filter);
      longVCA.connect(filter);
      filter.connect(output);

      // Start oscillators
      osc1.start();
      osc2.start();

      return {
        triggerAttackRelease: (_note: string, _duration: number, time?: number, velocity?: number) => {
          const t = time ?? Tone.now();
          const vel = velocity ?? 1;
          // Short attack envelope: 0 -> 0.375 over 2ms, then decay to 0 over 15ms
          shortVCA.gain.cancelScheduledValues(t);
          shortVCA.gain.setValueAtTime(0, t);
          shortVCA.gain.linearRampToValueAtTime(0.375 * vel, t + 0.002);
          shortVCA.gain.linearRampToValueAtTime(0, t + 0.017);
          // Long tail envelope: 0 -> 0.125 over 2ms, exponential decay over cowbell decay
          longVCA.gain.cancelScheduledValues(t);
          longVCA.gain.setValueAtTime(0.001, t + 0.015);
          longVCA.gain.exponentialRampToValueAtTime(0.125 * vel, t + 0.017);
          longVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.017 + cowbellConfig.decay / 1000);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          const t = time ?? Tone.now();
          const vel = velocity ?? 1;
          shortVCA.gain.cancelScheduledValues(t);
          shortVCA.gain.setValueAtTime(0, t);
          shortVCA.gain.linearRampToValueAtTime(0.375 * vel, t + 0.002);
          shortVCA.gain.linearRampToValueAtTime(0, t + 0.017);
          longVCA.gain.cancelScheduledValues(t);
          longVCA.gain.setValueAtTime(0.001, t + 0.015);
          longVCA.gain.exponentialRampToValueAtTime(0.125 * vel, t + 0.017);
          longVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.017 + cowbellConfig.decay / 1000);
        },
        triggerRelease: () => {
          // Cowbell doesn't respond to release - it's a one-shot
        },
        releaseAll: () => {
          // One-shot, nothing to release
        },
        connect: (dest: Tone.InputNode) => output.connect(dest),
        disconnect: () => output.disconnect(),
        dispose: () => {
          osc1.stop();
          osc2.stop();
          osc1.dispose();
          osc2.dispose();
          shortVCA.dispose();
          longVCA.dispose();
          oscMix.dispose();
          filter.dispose();
          output.dispose();
        },
        applyConfig: (newConfig: Record<string, unknown>) => {
          const dmc = newConfig || DEFAULT_DRUM_MACHINE;
          const cc = dmc.cowbell as Record<string, number> | undefined;
          if (!cc) return;

          filter.frequency.rampTo(cc.filterFreq, 0.1);
        },
        volume: output.gain,
      } as unknown as Tone.ToneAudioNode;
    }

    case 'clave': {
      // TR-808 Clave: Triangle (2450Hz) + Sine (1750Hz) through bandpass + distortion
      // Creates woody "click" character
      const claveConfig = {
        decay: 40,            // 808: 40ms
        pitch: 2450,          // 808: 2450Hz triangle
        pitchSecondary: 1750, // 808: 1750Hz sine
        filterFreq: 2450,     // 808: 2450Hz bandpass
        ...dmConfig.clave
      };

      // Primary triangle oscillator
      const osc1 = new Tone.Oscillator({
        type: 'triangle',
        frequency: claveConfig.pitch,
        volume: -6,
      });
      // Secondary sine oscillator
      const osc2 = new Tone.Oscillator({
        type: 'sine',
        frequency: claveConfig.pitchSecondary,
        volume: -8,
      });

      // VCAs for envelope
      const vca1 = new Tone.Gain(0);
      const vca2 = new Tone.Gain(0);

      // Bandpass filter
      const filter = new Tone.Filter({
        type: 'bandpass',
        frequency: claveConfig.filterFreq,
        Q: 5,
      });

      // Distortion for punch (808 "swing VCA" - half-wave rectifier + soft clip)
      const distortion = new Tone.Distortion({
        distortion: 0.5,
        oversample: '2x',
        wet: 1,
      });

      // Output — apply volume normalization (dB → linear)
      const normDb = getNormalizedVolume('DrumMachine', config.volume);
      const output = new Tone.Gain(Math.pow(10, normDb / 20));

      osc1.connect(vca1);
      osc2.connect(vca2);
      vca1.connect(filter);
      vca2.connect(filter);
      filter.connect(distortion);
      distortion.connect(output);

      osc1.start();
      osc2.start();

      return {
        triggerAttackRelease: (_note: string, _duration: number, time?: number, velocity?: number) => {
          const t = time ?? Tone.now();
          const vel = velocity ?? 1;
          // Fast exponential decay
          vca1.gain.cancelScheduledValues(t);
          vca1.gain.setValueAtTime(0.7 * vel, t);
          vca1.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
          vca2.gain.cancelScheduledValues(t);
          vca2.gain.setValueAtTime(0.5 * vel, t);
          vca2.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          const t = time ?? Tone.now();
          const vel = velocity ?? 1;
          vca1.gain.cancelScheduledValues(t);
          vca1.gain.setValueAtTime(0.7 * vel, t);
          vca1.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
          vca2.gain.cancelScheduledValues(t);
          vca2.gain.setValueAtTime(0.5 * vel, t);
          vca2.gain.exponentialRampToValueAtTime(0.001, t + claveConfig.decay / 1000);
        },
        triggerRelease: () => { /* one-shot */ },
        releaseAll: () => { /* one-shot */ },
        connect: (dest: Tone.InputNode) => output.connect(dest),
        disconnect: () => output.disconnect(),
        dispose: () => {
          osc1.stop();
          osc2.stop();
          osc1.dispose();
          osc2.dispose();
          vca1.dispose();
          vca2.dispose();
          filter.dispose();
          distortion.dispose();
          output.dispose();
        },
        applyConfig: (newConfig: Record<string, unknown>) => {
          const dmc = newConfig || DEFAULT_DRUM_MACHINE;
          const cc = dmc.clave as Record<string, number> | undefined;
          if (!cc) return;

          filter.frequency.rampTo(cc.filterFreq, 0.1);
        },
        volume: output.gain,
      } as unknown as Tone.ToneAudioNode;
    }

    case 'maracas': {
      // TR-808 Maracas: White noise through highpass filter (5kHz)
      // Very short decay for "shake" character
      const maracasConfig = {
        decay: 30,            // 808: 30ms (quick shake)
        filterFreq: 5000,     // 808: 5000Hz highpass
        ...dmConfig.maracas
      };

      const noise = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: {
          attack: 0.001,
          decay: maracasConfig.decay / 1000,
          sustain: 0,
          release: 0.01,
        },
        volume: getNormalizedVolume('DrumMachine', config.volume),
      });

      // Highpass filter removes low frequencies, keeps bright rattle
      const filter = new Tone.Filter({
        type: 'highpass',
        frequency: maracasConfig.filterFreq,
        Q: 1,
      });

      noise.connect(filter);

      return {
        triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
          noise.triggerAttackRelease(duration, time, velocity);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          noise.triggerAttack(time, velocity);
        },
        triggerRelease: (_note: string, time?: number) => {
          noise.triggerRelease(time);
        },
        releaseAll: () => {
          try { noise.triggerRelease(); } catch { /* ignore */ }
        },
        connect: (dest: Tone.InputNode) => filter.connect(dest),
        disconnect: () => filter.disconnect(),
        dispose: () => {
          noise.dispose();
          filter.dispose();
        },
        applyConfig: (newConfig: Record<string, unknown>) => {
          const dmc = newConfig || DEFAULT_DRUM_MACHINE;
          const mc = dmc.maracas as Record<string, number> | undefined;
          if (!mc) return;

          noise.set({
            envelope: {
              decay: mc.decay / 1000,
            }
          });
          filter.frequency.rampTo(mc.filterFreq, 0.1);
        },
        volume: noise.volume,
      } as unknown as Tone.ToneAudioNode;
    }

    case 'cymbal': {
      // TR-808 Cymbal: Same 6-oscillator bank as hi-hat but with 3-band processing
      // Complex multi-band filtering with separate envelopes per band
      const cymbalConfig = {
        tone: 50,             // Low/high band balance
        decay: 2000,          // 808: variable from 700-6800ms for low band
        ...dmConfig.cymbal
      };

      // 808 metallic oscillator bank - 6 square waves at inharmonic frequencies
      const oscFreqs = [263, 400, 421, 474, 587, 845];
      const oscillators: Tone.Oscillator[] = [];
      const oscMix = new Tone.Gain(0.3);

      for (const freq of oscFreqs) {
        const osc = new Tone.Oscillator({
          type: 'square',
          frequency: freq,
          volume: -10,
        });
        osc.connect(oscMix);
        osc.start();
        oscillators.push(osc);
      }

      // 3-band filtering with separate VCAs
      // Low band: 5kHz bandpass, long decay
      const lowFilter = new Tone.Filter({ type: 'bandpass', frequency: 5000, Q: 1 });
      const lowVCA = new Tone.Gain(0);
      // Mid band: 10kHz bandpass, medium decay
      const midFilter = new Tone.Filter({ type: 'bandpass', frequency: 10000, Q: 1 });
      const midVCA = new Tone.Gain(0);
      // High band: 8kHz highpass, short decay
      const highFilter = new Tone.Filter({ type: 'highpass', frequency: 8000, Q: 1 });
      const highVCA = new Tone.Gain(0);

      oscMix.connect(lowFilter);
      oscMix.connect(midFilter);
      oscMix.connect(highFilter);

      lowFilter.connect(lowVCA);
      midFilter.connect(midVCA);
      highFilter.connect(highVCA);

      // Output — apply volume normalization (dB → linear)
      const normDb = getNormalizedVolume('DrumMachine', config.volume);
      const output = new Tone.Gain(Math.pow(10, normDb / 20));
      lowVCA.connect(output);
      midVCA.connect(output);
      highVCA.connect(output);

      // Calculate envelope amounts based on tone parameter
      const lowEnvAmt = 0.666 - (cymbalConfig.tone / 100) * 0.666;
      const midEnvAmt = 0.333;
      const highEnvAmt = 0.666 - (1 - cymbalConfig.tone / 100) * 0.666;

      return {
        triggerAttackRelease: (_note: string, _duration: number, time?: number, velocity?: number) => {
          const t = time ?? Tone.now();
          const vel = velocity ?? 1;
          // Low band: longest decay (variable based on config)
          lowVCA.gain.cancelScheduledValues(t);
          lowVCA.gain.setValueAtTime(0.001, t);
          lowVCA.gain.exponentialRampToValueAtTime(lowEnvAmt * vel, t + 0.01);
          lowVCA.gain.exponentialRampToValueAtTime(0.001, t + cymbalConfig.decay / 1000);
          // Mid band: medium decay (400ms)
          midVCA.gain.cancelScheduledValues(t);
          midVCA.gain.setValueAtTime(0.001, t);
          midVCA.gain.exponentialRampToValueAtTime(midEnvAmt * vel, t + 0.01);
          midVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
          // High band: short decay (150ms)
          highVCA.gain.cancelScheduledValues(t);
          highVCA.gain.setValueAtTime(0.001, t);
          highVCA.gain.exponentialRampToValueAtTime(highEnvAmt * vel, t + 0.01);
          highVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        },
        triggerAttack: (_note: string, time?: number, velocity?: number) => {
          const t = time ?? Tone.now();
          const vel = velocity ?? 1;
          lowVCA.gain.cancelScheduledValues(t);
          lowVCA.gain.setValueAtTime(0.001, t);
          lowVCA.gain.exponentialRampToValueAtTime(lowEnvAmt * vel, t + 0.01);
          lowVCA.gain.exponentialRampToValueAtTime(0.001, t + cymbalConfig.decay / 1000);
          midVCA.gain.cancelScheduledValues(t);
          midVCA.gain.setValueAtTime(0.001, t);
          midVCA.gain.exponentialRampToValueAtTime(midEnvAmt * vel, t + 0.01);
          midVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
          highVCA.gain.cancelScheduledValues(t);
          highVCA.gain.setValueAtTime(0.001, t);
          highVCA.gain.exponentialRampToValueAtTime(highEnvAmt * vel, t + 0.01);
          highVCA.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        },
        triggerRelease: () => { /* one-shot */ },
        releaseAll: () => { /* one-shot */ },
        connect: (dest: Tone.InputNode) => output.connect(dest),
        disconnect: () => output.disconnect(),
        dispose: () => {
          oscillators.forEach(osc => {
            osc.stop();
            osc.dispose();
          });
          oscMix.dispose();
          lowFilter.dispose();
          midFilter.dispose();
          highFilter.dispose();
          lowVCA.dispose();
          midVCA.dispose();
          highVCA.dispose();
          output.dispose();
        },
        applyConfig: () => {
          // Cymbal parameters primarily affect triggerAttack, but we can store them
          // or update relevant static params here if needed.
          // For now, since most logic is in trigger, we just ensure it doesn't crash.
        },
        volume: output.gain,
      } as unknown as Tone.ToneAudioNode;
    }

    default:
      // Default to 808/909-style kick
      return new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 3,
        envelope: {
          attack: 0.001,
          decay: 0.3,
          sustain: 0,
          release: 0.1,
        },
        volume: getNormalizedVolume('DrumMachine', config.volume),
      });
  }
}

export function createChipSynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const chipConfig = config.chipSynth || DEFAULT_CHIP_SYNTH;
  const arpeggioConfig = chipConfig.arpeggio;

  // Create base oscillator based on channel type
  // Note: 'pulse' channels use 'square' since Tone.Synth doesn't support pulse width
  let oscillatorType: 'square' | 'triangle' = 'square';
  if (chipConfig.channel === 'triangle') {
    oscillatorType = 'triangle';
  }

  if (chipConfig.channel === 'noise') {
    // Noise channel uses NoiseSynth
    const noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: {
        attack: (chipConfig.envelope?.attack || 5) / 1000,
        decay: (chipConfig.envelope?.decay || 100) / 1000,
        sustain: (chipConfig.envelope?.sustain ?? 0) / 100,
        release: (chipConfig.envelope?.release || 50) / 1000,
      },
      volume: getNormalizedVolume('ChipSynth', config.volume),
    });

    // Add bit crusher for 8-bit sound
    // wet=0: SAC's AudioWorkletNode wet path is non-functional; dry path passes audio directly.
    const bitCrusher = new Tone.BitCrusher(chipConfig.bitDepth);
    bitCrusher.wet.value = 0;
    noise.connect(bitCrusher);

    return {
      triggerAttackRelease: (_note: string, duration: number, time?: number, velocity?: number) => {
        noise.triggerAttackRelease(duration, time, velocity);
      },
      triggerAttack: (_note: string, time?: number, velocity?: number) => {
        noise.triggerAttack(time, velocity);
      },
      triggerRelease: (_note: string, time?: number) => {
        noise.triggerRelease(time);
      },
      releaseAll: () => {
        // NoiseSynth doesn't have releaseAll, just release current note
        try { noise.triggerRelease(); } catch { /* ignore */ }
      },
      connect: (dest: Tone.InputNode) => bitCrusher.connect(dest),
      disconnect: () => bitCrusher.disconnect(),
      dispose: () => {
        noise.dispose();
        bitCrusher.dispose();
      },
      applyConfig: (newConfig: Record<string, unknown>) => {
        const csc = newConfig || DEFAULT_CHIP_SYNTH;
        const env = csc.envelope as Record<string, number>;
        noise.set({
          envelope: {
            attack: env.attack / 1000,
            decay: env.decay / 1000,
            sustain: env.sustain / 100,
            release: env.release / 1000,
          }
        });
        (bitCrusher as any).bits = csc.bitDepth;
      },
      volume: noise.volume,
    } as unknown as Tone.ToneAudioNode;
  }

  // Square/Triangle channels
  const synth = new Tone.PolySynth(Tone.Synth, {

    oscillator: {
      type: oscillatorType,
    },
    envelope: {
      attack: chipConfig.envelope.attack / 1000,
      decay: chipConfig.envelope.decay / 1000,
      sustain: chipConfig.envelope.sustain / 100,
      release: chipConfig.envelope.release / 1000,
    },
    volume: getNormalizedVolume('ChipSynth', config.volume),
  });

  // Add bit crusher for 8-bit character
  // wet=0: SAC's AudioWorkletNode wet path is non-functional; dry path passes audio directly.
  const bitCrusher = new Tone.BitCrusher(chipConfig.bitDepth);
  bitCrusher.wet.value = 0;
  synth.connect(bitCrusher);

  // Create ArpeggioEngine only if arpeggio is ENABLED (not just configured)
  let arpeggioEngine: InstanceType<typeof ArpeggioEngine> | null = null;
  let lastArpNote: string | null = null;

  if (arpeggioConfig?.enabled) {
    arpeggioEngine = new ArpeggioEngine({
      config: arpeggioConfig,
      onNoteOn: (note: string, velocity: number, duration: number) => {
        // Release last arpeggio note before playing new one
        if (lastArpNote) {
          synth.triggerRelease(lastArpNote);
        }
        synth.triggerAttackRelease(note, duration, undefined, velocity);
        lastArpNote = note;
      },
      onNoteOff: (note: string) => {
        synth.triggerRelease(note);
        if (lastArpNote === note) {
          lastArpNote = null;
        }
      },
    });
  }

  // Wrapper object with arpeggio support
  const chipSynthWrapper = {
    triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
      if (arpeggioEngine && arpeggioConfig?.enabled) {
        // Start arpeggiator instead of direct note
        arpeggioEngine.start(note, velocity ?? 1);
        // Schedule stop after duration
        if (duration && typeof duration === 'number') {
          const stopTime = (time ?? Tone.now()) + duration;
          Tone.getTransport().scheduleOnce(() => {
            arpeggioEngine.stop(note);
          }, stopTime);
        }
      } else {
        // Release any existing voice for this note first to prevent voice leak
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttackRelease(note, duration, time, velocity);
      }
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      if (arpeggioEngine && arpeggioConfig?.enabled) {
        arpeggioEngine.start(note, velocity ?? 1);
      } else {
        // Release any existing voice for this note first to prevent voice leak
        try { synth.triggerRelease(note, time); } catch { /* ignore */ }
        synth.triggerAttack(note, time, velocity);
      }
    },
    triggerRelease: (note: string, time?: number) => {
      if (arpeggioEngine && arpeggioConfig?.enabled) {
        arpeggioEngine.stop(note);
      } else {
        synth.triggerRelease(note, time);
      }
    },
    releaseAll: () => {
      if (arpeggioEngine) {
        arpeggioEngine.stopAll();
      }
      synth.releaseAll();
      lastArpNote = null;
    },
    connect: (dest: Tone.InputNode) => bitCrusher.connect(dest),
    disconnect: () => bitCrusher.disconnect(),
    dispose: () => {
      if (arpeggioEngine) {
        arpeggioEngine.dispose();
      }
      synth.dispose();
      bitCrusher.dispose();
    },
    applyConfig: (newConfig: Record<string, unknown>) => {
      const csc = newConfig || DEFAULT_CHIP_SYNTH;
      const env = csc.envelope as Record<string, number>;
      synth.set({
        envelope: {
          attack: env.attack / 1000,
          decay: env.decay / 1000,
          sustain: env.sustain / 100,
          release: env.release / 1000,
        }
      });
      (bitCrusher as any).bits = csc.bitDepth;
    },
    volume: synth.volume,
    // Expose methods for real-time arpeggio updates
    updateArpeggio: (newConfig: typeof arpeggioConfig) => {
      if (arpeggioEngine && newConfig) {
        arpeggioEngine.updateConfig(newConfig);
      }
    },
    getArpeggioEngine: () => arpeggioEngine,
    getCurrentArpeggioStep: () => arpeggioEngine?.getCurrentStep() ?? 0,
    isArpeggioPlaying: () => arpeggioEngine?.getIsPlaying() ?? false,
  };

  return chipSynthWrapper as unknown as Tone.ToneAudioNode;
}

export function createPWMSynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const pwmConfig = config.pwmSynth || DEFAULT_PWM_SYNTH;

  // Use square wave (Tone.Synth doesn't support true pulse width control)
  const synth = new Tone.PolySynth(Tone.Synth, {

    oscillator: {
      type: 'square',
    },
    envelope: {
      attack: (pwmConfig.envelope?.attack || 10) / 1000,
      decay: (pwmConfig.envelope?.decay || 200) / 1000,
      sustain: (pwmConfig.envelope?.sustain ?? 70) / 100,
      release: (pwmConfig.envelope?.release || 300) / 1000,
    },
    volume: getNormalizedVolume('PWMSynth', config.volume),
  });
  synth.maxPolyphony = 32;

  // Add filter
  const filter = new Tone.Filter({
    type: pwmConfig.filter.type,
    frequency: pwmConfig.filter.cutoff,
    Q: pwmConfig.filter.resonance / 10,
    rolloff: -24,
  });

  // Add chorus to simulate PWM modulation effect (richer than vibrato)
  const chorus = new Tone.Chorus({
    frequency: pwmConfig.pwmRate,
    delayTime: 2,
    depth: pwmConfig.pwmDepth / 100,
    wet: 0.6,
  });
  chorus.start();

  synth.connect(filter);
  filter.connect(chorus);

  return {
    triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
      try { synth.triggerRelease(note, time); } catch { /* ignore */ }
      synth.triggerAttackRelease(note, duration, time, velocity);
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      try { synth.triggerRelease(note, time); } catch { /* ignore */ }
      synth.triggerAttack(note, time, velocity);
    },
    triggerRelease: (note: string, time?: number) => {
      synth.triggerRelease(note, time);
    },
    releaseAll: () => synth.releaseAll(),
    connect: (dest: Tone.InputNode) => chorus.connect(dest),
    disconnect: () => chorus.disconnect(),
    dispose: () => {
      synth.dispose();
      filter.dispose();
      chorus.dispose();
    },
    applyConfig: (newConfig: Record<string, unknown>) => {
      const pc = newConfig || DEFAULT_PWM_SYNTH;
      const env = pc.envelope as Record<string, number>;
      const flt = pc.filter as Record<string, number & string>;
      synth.set({
        envelope: {
          attack: env.attack / 1000,
          decay: env.decay / 1000,
          sustain: env.sustain / 100,
          release: env.release / 1000,
        }
      });
      filter.set({
        type: flt.type,
        frequency: flt.cutoff,
        Q: flt.resonance / 10,
      });
      chorus.set({
        frequency: pc.pwmRate as number,
        depth: (pc.pwmDepth as number) / 100,
      });
    },
    volume: synth.volume,
  } as unknown as Tone.ToneAudioNode;
}

/**
 * StringMachine - Vintage ensemble strings (Solina-style)
 */
export function createStringMachine(config: InstrumentConfig): Tone.ToneAudioNode {
  const strConfig = config.stringMachine || DEFAULT_STRING_MACHINE;

  // Create polyphonic sawtooth synth
  const synth = new Tone.PolySynth(Tone.Synth, {

    oscillator: {
      type: 'sawtooth',
    },
    envelope: {
      attack: (strConfig.attack || 100) / 1000,
      decay: 0.2,
      sustain: 0.9,
      release: (strConfig.release || 500) / 1000,
    },
    volume: getNormalizedVolume('StringMachine', config.volume),
  });
  synth.maxPolyphony = 32;

  // Rich chorus effect for ensemble character
  const chorus = new Tone.Chorus({
    frequency: strConfig.ensemble.rate,
    delayTime: 3.5,
    depth: strConfig.ensemble.depth / 100,
    wet: 0.8,
  });
  chorus.start();

  // Low-pass filter for warmth
  const filter = new Tone.Filter({
    type: 'lowpass',
    frequency: 2000 + (strConfig.brightness * 80),
    Q: 0.5,
    rolloff: -12,
  });

  synth.connect(filter);
  filter.connect(chorus);

  return {
    triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
      try { synth.triggerRelease(note, time); } catch { /* ignore */ }
      synth.triggerAttackRelease(note, duration, time, velocity);
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      try { synth.triggerRelease(note, time); } catch { /* ignore */ }
      synth.triggerAttack(note, time, velocity);
    },
    triggerRelease: (note: string, time?: number) => {
      synth.triggerRelease(note, time);
    },
    releaseAll: () => synth.releaseAll(),
    connect: (dest: Tone.InputNode) => chorus.connect(dest),
    disconnect: () => chorus.disconnect(),
    dispose: () => {
      synth.dispose();
      chorus.dispose();
      filter.dispose();
    },
    applyConfig: (newConfig: Record<string, unknown>) => {
      const sc = newConfig || DEFAULT_STRING_MACHINE;
      const ens = sc.ensemble as Record<string, number>;
      synth.set({
        envelope: {
          attack: (sc.attack as number) / 1000,
          release: (sc.release as number) / 1000,
        }
      });
      chorus.set({
        frequency: ens.rate,
        depth: ens.depth / 100,
      });
      filter.frequency.rampTo(2000 + ((sc.brightness as number) * 80), 0.1);
    },
    volume: synth.volume,
  } as unknown as Tone.ToneAudioNode;
}

/**
 * FormantSynth - Vowel synthesis using parallel bandpass filters
 */

export function applyPitchEnvelope(
  synth: Tone.PolySynth | { set: (options: { detune: number }) => void },
  pitchEnv: PitchEnvelopeConfig,
  time: number,
  duration: number
): void {
  const startCents = pitchEnv.amount * 100; // Convert semitones to cents
  const sustainCents = (pitchEnv.sustain / 100) * startCents;
  const attackTime = pitchEnv.attack / 1000;
  const releaseTime = pitchEnv.release / 1000;

  // Cast to access detune param
  const s = synth as { set?: (options: { detune: number }) => void };
  if (!s.set) return;

  // Start at initial offset
  s.set({ detune: startCents });

  // Attack phase: stay at start pitch (or ramp if attack > 0)
  if (attackTime > 0) {
    // For pitch envelope, attack means staying at the offset
    // The actual envelope starts after attack
  }

  // Decay to sustain level
  const decayStart = time + attackTime;
  setTimeout(() => {
    if (s.set) s.set({ detune: sustainCents });
  }, (decayStart - Tone.now()) * 1000);

  // Release back to 0 after note duration
  const releaseStart = time + duration;
  setTimeout(() => {
    if (s.set) s.set({ detune: 0 });
  }, (releaseStart - Tone.now()) * 1000 + releaseTime * 1000);
}

/**
 * Trigger pitch envelope attack phase
 * Sets initial pitch offset and schedules decay to sustain
 */
export function triggerPitchEnvelopeAttack(
  synth: Tone.PolySynth | { set: (options: { detune: number }) => void },
  pitchEnv: PitchEnvelopeConfig,
  time: number
): void {
  const startCents = pitchEnv.amount * 100; // Convert semitones to cents
  const sustainCents = (pitchEnv.sustain / 100) * startCents;
  const attackTime = pitchEnv.attack / 1000;
  const decayTime = pitchEnv.decay / 1000;

  const s = synth as { set?: (options: { detune: number }) => void };
  if (!s.set) return;

  // Start at initial pitch offset
  s.set({ detune: startCents });

  // Schedule decay to sustain level relative to the scheduled time
  const delayMs = Math.max(0, (time - Tone.now() + attackTime + decayTime) * 1000);
  setTimeout(() => {
    if (s.set) s.set({ detune: sustainCents });
  }, delayMs);
}

export function triggerPitchEnvelopeRelease(
  synth: Tone.PolySynth | { set: (options: { detune: number }) => void },
  pitchEnv: PitchEnvelopeConfig,
  time: number
): void {
  const releaseTime = pitchEnv.release / 1000;
  const s = synth as { set?: (options: { detune: number }) => void };
  if (!s.set) return;

  // Ramp back to 0 over release time, scheduled relative to the note release time
  const delayMs = Math.max(0, (time - Tone.now() + releaseTime) * 1000);
  setTimeout(() => {
    if (s.set) s.set({ detune: 0 });
  }, delayMs);
}

