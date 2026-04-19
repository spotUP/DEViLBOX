/**
 * CommunitySynthFactory - Creates community/custom synth instances.
 * Includes TB303, WASM synths, MAME hardware synths, and other specialized engines.
 * Extracted from InstrumentFactory.ts
 */

import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';
import {
  DEFAULT_SYNARE,
  DEFAULT_SAM,
  DEFAULT_PINK_TROMBONE,
  DEFAULT_DECTALK,
  VOWEL_FORMANTS,
  DEFAULT_FORMANT_SYNTH,
  DEFAULT_WOBBLE_BASS,
  DEFAULT_DRUMKIT,
  DEFAULT_WAVETABLE,
  DEFAULT_SPACE_LASER,
  DEFAULT_DUB_SIREN,
  DEFAULT_TB303,
} from '@/types/instrument';
import { WavetableSynth } from '../WavetableSynth';
import { DrumKitSynth } from '../DrumKitSynth';
import { DubSirenSynth } from '../dub/DubSirenSynth';
import { SpaceLaserSynth } from '../SpaceLaserSynth';
import { SynareSynth } from '../SynareSynth';
import { SAMSynth } from '../sam/SAMSynth';
import { PinkTromboneSynth } from '../pinktrombone/PinkTromboneSynth';
import { DECtalkSynth } from '../dectalk/DECtalkSynth';
import { V2Synth } from '../v2/V2Synth';
import { V2SpeechSynth } from '../v2/V2SpeechSynth';
import { DB303Synth } from '../db303/DB303Synth';
import { BuzzmachineGenerator } from '../buzzmachines/BuzzmachineGenerator';
import { BuzzmachineType } from '../buzzmachines/BuzzmachineEngine';
import { MdaEPianoSynth } from '../mda-epiano/MdaEPianoSynth';
import { MdaJX10Synth } from '../mda-jx10/MdaJX10Synth';
import { MdaDX10Synth } from '../mda-dx10/MdaDX10Synth';
import { AMSynthSynth } from '../amsynth/AMSynthSynth';
import { RaffoSynthEngine } from '../raffo/RaffoSynth';
import { CalfMonoSynthImpl } from '../calf-mono/CalfMonoSynth';
import { SetBfreeSynthImpl } from '../setbfree/SetBfreeSynth';
import { SynthV1SynthImpl } from '../synthv1/SynthV1Synth';
import { TalNoizeMakerSynthImpl } from '../tal-noizemaker/TalNoizeMakerSynth';
import { AeolusSynthImpl } from '../aeolus/AeolusSynth';
import { MoniqueSynthEngine } from '../monique/MoniqueSynth';
import { VL1SynthEngine } from '../vl1/VL1Synth';
import { FluidSynthSynthImpl } from '../fluidsynth/FluidSynthSynth';
import { SfizzSynthImpl as SfizzEngine } from '../sfizz/SfizzSynth';
import { ZynAddSubFXSynthImpl } from '../zynaddsubfx/ZynAddSubFXSynth';
import { CZ101Synth } from '../cz101/CZ101Synth';
import { CEM3394Synth } from '../cem3394/CEM3394Synth';
import { SCSPSynth } from '../scsp/SCSPSynth';
import { VFXSynth } from '../vfx/VFXSynth';
import { D50Synth } from '../d50/D50Synth';
import { RdPianoSynth } from '../rdpiano/RdPianoSynth';
import { MU2000Synth } from '../mu2000/MU2000Synth';
import { WAMSynth } from '../wam/WAMSynth';
import { WAM_SYNTH_URLS } from '@/constants/wamPlugins';
// MAME Hardware Synths
import { ASCSynth } from '../asc/ASCSynth';
import { AstrocadeSynth } from '../astrocade/AstrocadeSynth';
import { C352Synth } from '../c352/C352Synth';
import { ES5503Synth } from '../es5503/ES5503Synth';
import { ICS2115Synth } from '../ics2115/ICS2115Synth';
import { K054539Synth } from '../k054539/K054539Synth';
import { MEA8000Synth } from '../mea8000/MEA8000Synth';
import { RF5C400Synth } from '../rf5c400/RF5C400Synth';
import { SN76477Synth } from '../sn76477/SN76477Synth';
import { SNKWaveSynth } from '../snkwave/SNKWaveSynth';
import { SP0250Synth } from '../sp0250/SP0250Synth';
import { TMS36XXSynth } from '../tms36xx/TMS36XXSynth';
import { TMS5220Synth } from '../tms5220/TMS5220Synth';
import { TR707Synth } from '../tr707/TR707Synth';
import { UPD931Synth } from '../upd931/UPD931Synth';
import { UPD933Synth } from '../upd933/UPD933Synth';
import { VotraxSynth } from '../votrax/VotraxSynth';
import { YMF271Synth } from '../ymf271/YMF271Synth';
import { YMOPQSynth } from '../ymopq/YMOPQSynth';
import { VASynthSynth } from '../vasynth/VASynthSynth';
import { CMISynth } from '../cmi/CMISynth';
import { FZSynth } from '../fz/FZSynth';
import { PS1SPUSynth } from '../ps1spu/PS1SPUSynth';
import { ZSG2Synth } from '../zsg2/ZSG2Synth';
import { KS0164Synth } from '../ks0164/KS0164Synth';
import { SWP00Synth } from '../swp00/SWP00Synth';
import { SWP20Synth } from '../swp20/SWP20Synth';
import { RolandGPSynth } from '../rolandgp/RolandGPSynth';
import { S14001ASynth } from '../s14001a/S14001ASynth';
import { VLM5030Synth } from '../vlm5030/VLM5030Synth';
import { HC55516Synth } from '../hc55516/HC55516Synth';
import { ModularSynth } from '../modular/ModularSynth';
import { DEFAULT_MODULAR_PATCH } from '@/types/modular';
import { getNormalizedVolume } from './volumeNormalization';

export function createTB303(config: InstrumentConfig): DB303Synth {
  const tb303Config = config.tb303 || { ...DEFAULT_TB303 };
  // Apply normalized volume boost for TB303
  const normalizedVolume = getNormalizedVolume('TB303', config.volume);

  console.log('[InstrumentFactory] Creating DB303 synth with config:', JSON.stringify({
    filter: tb303Config.filter,
    filterEnvelope: tb303Config.filterEnvelope,
    oscillator: tb303Config.oscillator,
    accent: tb303Config.accent,
    volume: normalizedVolume,
  }, null, 2));
  return createDB303(tb303Config, normalizedVolume);
}

export function createWAM(config: InstrumentConfig): WAMSynth {
  const wamConfig = config.wam || { moduleUrl: '', pluginState: null };
  const synth = new WAMSynth(wamConfig);

  // WAMs usually have their own internal gain — set the native GainNode level
  synth.output.gain.value = Tone.dbToGain(config.volume ?? -12);

  return synth;
}

export function createNamedWAM(config: InstrumentConfig): WAMSynth {
  const url = WAM_SYNTH_URLS[config.synthType];
  if (!url) {
    console.warn(`[InstrumentFactory] No URL found for WAM synth type: ${config.synthType}`);
    return createWAM(config);
  }
  const wamConfig = { ...config.wam, moduleUrl: url, pluginState: config.wam?.pluginState ?? null };
  const synth = new WAMSynth(wamConfig);
  synth.output.gain.value = Tone.dbToGain(config.volume ?? -12);
  return synth;
}

export function createDB303(tb: NonNullable<InstrumentConfig['tb303']>, volume?: number): DB303Synth {
  const synth = new DB303Synth();

  // Apply all parameters via the synth's canonical applyConfig method.
  // All config values are 0-1 normalized.
  synth.applyConfig(tb);

  // Apply instrument-level dB normalization via the output GainNode
  if (volume !== undefined) {
    synth.output.gain.value = Tone.dbToGain(volume);
  }

  return synth;
}

export function createBuzzGenerator(
  machineType: BuzzmachineType,
  synthType: string,
  config: InstrumentConfig
): BuzzmachineGenerator {
  const synth = new BuzzmachineGenerator(machineType);
  const normalizedVolume = getNormalizedVolume(synthType, config.volume);
  synth.output.gain.value = Tone.dbToGain(normalizedVolume);
  return synth;
}

export function createBuzz3o3(config: InstrumentConfig): BuzzmachineGenerator {
  // Use Devil Fish WASM for full Devil Fish feature support
  const synth = new BuzzmachineGenerator(BuzzmachineType.OOMEK_AGGRESSOR_DF);

  // Apply TB303 config if present
  if (config.tb303) {
    const tb = config.tb303;

    // Core 303 parameters
    synth.setCutoff(tb.filter.cutoff);
    synth.setResonance(tb.filter.resonance);
    synth.setEnvMod(tb.filterEnvelope.envMod);
    synth.setDecay(tb.filterEnvelope.decay);
    synth.setAccentAmount(tb.accent.amount);
    synth.setWaveform(tb.oscillator.type);

    if (tb.tuning !== undefined) {
      synth.setTuning(tb.tuning);
    }

    // External effects (overdrive via effects chain)
    if (tb.overdrive) {
      synth.setOverdrive(tb.overdrive.amount);
    }

    // Devil Fish mods (now native in WASM for Buzz3o3)
    if (tb.devilFish) {
      const df = tb.devilFish;
      if (df.enabled) {
        synth.enableDevilFish(true, {
          overdrive: tb.overdrive?.amount,
          muffler: df.muffler as 'off' | 'dark' | 'mid' | 'bright',
        });
      }
      if (df.muffler) {
        synth.setMuffler(df.muffler);
      }
      if (df.highResonance) {
        synth.setHighResonanceEnabled(df.highResonance);
      }
      if (df.filterTracking !== undefined) {
        synth.setFilterTracking(df.filterTracking);
      }
      // New Devil Fish WASM parameters
      if (df.normalDecay !== undefined) {
        synth.setNormalDecay(df.normalDecay);
      }
      if (df.accentDecay !== undefined) {
        synth.setAccentDecay(df.accentDecay);
      }
      if (df.vegDecay !== undefined) {
        synth.setVegDecay(df.vegDecay);
      }
      if (df.vegSustain !== undefined) {
        synth.setVegSustain(df.vegSustain);
      }
      if (df.softAttack !== undefined) {
        synth.setSoftAttack(df.softAttack);
      }
      if (df.sweepSpeed !== undefined) {
        synth.setSweepSpeed(df.sweepSpeed);
      }
      if (df.filterFmDepth !== undefined) {
        synth.setFilterFM(df.filterFmDepth);
      }
    }
  }

  // Apply normalized volume (always, even without tb303 config)
  const normalizedVolume = getNormalizedVolume('Buzz3o3', config.volume);
  synth.output.gain.value = Tone.dbToGain(normalizedVolume);

  return synth;
}

export function createWavetable(config: InstrumentConfig): WavetableSynth {
  // Deep-merge with DEFAULT_WAVETABLE so old saves missing nested fields
  // (e.g. `unison`) don't crash the WavetableVoice constructor.
  const raw = config.wavetable;
  const wavetableConfig = raw ? {
    ...DEFAULT_WAVETABLE,
    ...raw,
    unison: { ...DEFAULT_WAVETABLE.unison, ...(raw.unison ?? {}) },
    envelope: { ...DEFAULT_WAVETABLE.envelope, ...(raw.envelope ?? {}) },
    filter: { ...DEFAULT_WAVETABLE.filter, ...(raw.filter ?? {}) },
    filterEnvelope: { ...DEFAULT_WAVETABLE.filterEnvelope, ...(raw.filterEnvelope ?? {}) },
  } : DEFAULT_WAVETABLE;
  const synth = new WavetableSynth(wavetableConfig);
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('Wavetable', config.volume));
  return synth;
}

export function createFormantSynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const fmtConfig = config.formantSynth || DEFAULT_FORMANT_SYNTH;
  const formants = VOWEL_FORMANTS[fmtConfig.vowel] || VOWEL_FORMANTS['A'];

  // Create source oscillator
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: {
      type: fmtConfig.oscillator?.type || 'sawtooth',
    } as Partial<Tone.OmniOscillatorOptions>,
    envelope: {
      attack: (fmtConfig.envelope?.attack || 10) / 1000,
      decay: (fmtConfig.envelope?.decay || 200) / 1000,
      sustain: (fmtConfig.envelope?.sustain ?? 70) / 100,
      release: (fmtConfig.envelope?.release || 300) / 1000,
    },
    volume: getNormalizedVolume('FormantSynth', config.volume),
  });
  synth.maxPolyphony = 32;

  // Create 3 parallel bandpass filters for formants with lower Q for more output
  const f1 = new Tone.Filter({
    type: 'bandpass',
    frequency: formants.f1,
    Q: 3,
  });
  const f2 = new Tone.Filter({
    type: 'bandpass',
    frequency: formants.f2,
    Q: 3,
  });
  const f3 = new Tone.Filter({
    type: 'bandpass',
    frequency: formants.f3,
    Q: 3,
  });

  // Mix formants together with boost
  const output = new Tone.Gain(2);

  synth.connect(f1);
  synth.connect(f2);
  synth.connect(f3);
  f1.connect(output);
  f2.connect(output);
  f3.connect(output);

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
    connect: (dest: Tone.InputNode) => output.connect(dest),
    disconnect: () => output.disconnect(),
    dispose: () => {
      synth.dispose();
      f1.dispose();
      f2.dispose();
      f3.dispose();
      output.dispose();
    },
    applyConfig: (newConfig: Record<string, unknown>) => {
      const fc = newConfig || DEFAULT_FORMANT_SYNTH;
      const env = fc.envelope as Record<string, number>;
      const fmts = VOWEL_FORMANTS[fc.vowel as keyof typeof VOWEL_FORMANTS];

      synth.set({
        envelope: {
          attack: env.attack / 1000,
          decay: env.decay / 1000,
          sustain: env.sustain / 100,
          release: env.release / 1000,
        }
      });
      f1.frequency.rampTo(fmts.f1, 0.1);
      f2.frequency.rampTo(fmts.f2, 0.1);
      f3.frequency.rampTo(fmts.f3, 0.1);
    },
    volume: synth.volume,
  } as unknown as Tone.ToneAudioNode;
}

/**
 * WobbleBass - Dedicated bass synth for dubstep, DnB, jungle
 * Features: dual oscillators, FM, Reese detuning, wobble LFO, distortion, formant growl
 */

export function createWobbleBass(config: InstrumentConfig): Tone.ToneAudioNode {
  const wbConfig = config.wobbleBass || DEFAULT_WOBBLE_BASS;

  // === OSCILLATOR SECTION ===
  // Create dual oscillators with unison
  const voiceCount = Math.max(1, wbConfig.unison.voices);
  const detuneSpread = wbConfig.unison.detune;

  // Main oscillator 1 (with unison)
  const osc1 = new Tone.PolySynth(Tone.Synth, {
    oscillator: {
      type: wbConfig.osc1.type,
    } as Partial<Tone.OmniOscillatorOptions>,
    envelope: {
      attack: wbConfig.envelope.attack / 1000,
      decay: wbConfig.envelope.decay / 1000,
      sustain: wbConfig.envelope.sustain / 100,
      release: wbConfig.envelope.release / 1000,
    },
    volume: -6 + (wbConfig.osc1.level / 100) * 6 - 6,
  });
  osc1.maxPolyphony = 32;

  // Main oscillator 2 (slightly detuned for Reese)
  const osc2 = new Tone.PolySynth(Tone.Synth, {
    oscillator: {
      type: wbConfig.osc2.type,
    } as Partial<Tone.OmniOscillatorOptions>,
    envelope: {
      attack: wbConfig.envelope.attack / 1000,
      decay: wbConfig.envelope.decay / 1000,
      sustain: wbConfig.envelope.sustain / 100,
      release: wbConfig.envelope.release / 1000,
    },
    volume: -6 + (wbConfig.osc2.level / 100) * 6 - 6,
  });
  osc2.maxPolyphony = 32;

  // Set octave offsets via detune (1200 cents = 1 octave)
  osc1.set({ detune: wbConfig.osc1.octave * 1200 + wbConfig.osc1.detune });
  osc2.set({ detune: wbConfig.osc2.octave * 1200 + wbConfig.osc2.detune });

  // Sub oscillator (clean sine for solid low end)
  let subOsc: Tone.PolySynth | null = null;
  if (wbConfig.sub.enabled) {
    subOsc = new Tone.PolySynth(Tone.Synth, {

      oscillator: { type: 'sine' },
      envelope: {
        attack: wbConfig.envelope.attack / 1000,
        decay: wbConfig.envelope.decay / 1000,
        sustain: wbConfig.envelope.sustain / 100,
        release: wbConfig.envelope.release / 1000,
      },
      volume: -12 + (wbConfig.sub.level / 100) * 12 - 6,
    });
    subOsc.maxPolyphony = 32;
    subOsc.set({ detune: wbConfig.sub.octave * 1200 });
  }

  // === UNISON SPREAD ===
  // Create additional detuned voices for thickness
  const unisonVoices: Tone.PolySynth[] = [];
  const unisonPanners: Tone.Panner[] = [];
  if (voiceCount > 1) {
    for (let i = 1; i < Math.min(voiceCount, 8); i++) {
      const detuneAmount = ((i / voiceCount) - 0.5) * detuneSpread * 2;
      const panAmount = ((i / voiceCount) - 0.5) * (wbConfig.unison.stereoSpread / 50);

      const voice = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: wbConfig.osc1.type } as Partial<Tone.OmniOscillatorOptions>,
        envelope: {
          attack: wbConfig.envelope.attack / 1000,
          decay: wbConfig.envelope.decay / 1000,
          sustain: wbConfig.envelope.sustain / 100,
          release: wbConfig.envelope.release / 1000,
        },
        volume: -12 - (voiceCount * 1.5),
      });
      voice.maxPolyphony = 32;
      voice.set({ detune: wbConfig.osc1.octave * 1200 + detuneAmount });

      const panner = new Tone.Panner(panAmount);
      voice.connect(panner);
      unisonVoices.push(voice);
      unisonPanners.push(panner);
    }
  }

  // === FM SECTION ===
  // Optional FM modulation between oscillators
  let fmSynth: Tone.PolySynth | null = null;
  if (wbConfig.fm.enabled && wbConfig.fm.amount > 0) {
    fmSynth = new Tone.PolySynth(Tone.FMSynth, {

      modulationIndex: wbConfig.fm.amount / 10,
      harmonicity: wbConfig.fm.ratio,
      envelope: {
        attack: wbConfig.envelope.attack / 1000,
        decay: wbConfig.envelope.decay / 1000,
        sustain: wbConfig.envelope.sustain / 100,
        release: wbConfig.envelope.release / 1000,
      },
      volume: -6,
    });
    fmSynth.maxPolyphony = 32;
    fmSynth.set({ detune: wbConfig.osc1.octave * 1200 });
  }

  // === MIXER ===
  const oscMixer = new Tone.Gain(1);

  // === FILTER SECTION ===
  const filter = new Tone.Filter({
    type: wbConfig.filter.type,
    frequency: wbConfig.filter.cutoff,
    Q: wbConfig.filter.resonance / 10,
    rolloff: wbConfig.filter.rolloff,
  });

  // Filter drive/saturation
  let filterDrive: Tone.Distortion | null = null;
  if (wbConfig.filter.drive > 0) {
    filterDrive = new Tone.Distortion({
      distortion: wbConfig.filter.drive / 100,
      oversample: '2x',
    });
  }

  // === FILTER ENVELOPE ===
  const filterEnvAmount = wbConfig.filterEnvelope.amount / 100;
  const filterBaseFreq = wbConfig.filter.cutoff;
  const filterEnvOctaves = Math.abs(filterEnvAmount) * 4; // Max 4 octaves sweep

  // Use FrequencyEnvelope for filter envelope modulation
  const filterEnv = new Tone.FrequencyEnvelope({
    baseFrequency: filterBaseFreq,
    octaves: filterEnvOctaves,
    attack: wbConfig.filterEnvelope.attack / 1000,
    decay: wbConfig.filterEnvelope.decay / 1000,
    sustain: wbConfig.filterEnvelope.sustain / 100,
    release: wbConfig.filterEnvelope.release / 1000,
  });

  // Connect filter envelope to filter frequency (only if LFO not taking over)
  if (!wbConfig.wobbleLFO.enabled || wbConfig.filterEnvelope.amount > 0) {
    filterEnv.connect(filter.frequency);
  }

  // === WOBBLE LFO ===
  let wobbleLFO: Tone.LFO | null = null;

  if (wbConfig.wobbleLFO.enabled) {
    // Calculate LFO rate from sync value
    let lfoRate = wbConfig.wobbleLFO.rate;
    if (wbConfig.wobbleLFO.sync !== 'free') {
      // Convert sync division to rate based on current BPM
      const bpm = Tone.getTransport().bpm.value || 120;
      const syncMap: Record<string, number> = {
        '1/1': 1,
        '1/2': 2,
        '1/2T': 3,
        '1/2D': 1.5,
        '1/4': 4,
        '1/4T': 6,
        '1/4D': 3,
        '1/8': 8,
        '1/8T': 12,
        '1/8D': 6,
        '1/16': 16,
        '1/16T': 24,
        '1/16D': 12,
        '1/32': 32,
        '1/32T': 48,
      };
      const divisor = syncMap[wbConfig.wobbleLFO.sync] || 4;
      lfoRate = (bpm / 60) * (divisor / 4);
    }

    // Map shape to Tone.js type
    const shapeMap: Record<string, Tone.ToneOscillatorType> = {
      'sine': 'sine',
      'triangle': 'triangle',
      'saw': 'sawtooth',
      'square': 'square',
      'sample_hold': 'square', // Closest approximation
    };

    // Calculate filter modulation range based on amount
    const filterModRange = filterBaseFreq * 4; // 4 octaves max range
    const minFreq = Math.max(20, filterBaseFreq * 0.1);
    const maxFreq = Math.min(20000, filterBaseFreq + (filterModRange * (wbConfig.wobbleLFO.amount / 100)));

    wobbleLFO = new Tone.LFO({
      frequency: lfoRate,
      type: shapeMap[wbConfig.wobbleLFO.shape] || 'sine',
      min: minFreq,
      max: maxFreq,
      phase: wbConfig.wobbleLFO.phase,
    });

    wobbleLFO.connect(filter.frequency);
    wobbleLFO.start();
  }

  // === DISTORTION SECTION ===
  let distortion: Tone.ToneAudioNode | null = null;
  if (wbConfig.distortion.enabled) {
    switch (wbConfig.distortion.type) {
      case 'soft':
        distortion = new Tone.Distortion({
          distortion: wbConfig.distortion.drive / 100,
          oversample: '2x',
        });
        break;
      case 'hard':
        distortion = new Tone.Chebyshev({
          order: Math.floor(1 + (wbConfig.distortion.drive / 100) * 50),
        });
        break;
      case 'fuzz':
        distortion = new Tone.Distortion({
          distortion: 0.5 + (wbConfig.distortion.drive / 200),
          oversample: '4x',
        });
        break;
      case 'bitcrush':
        distortion = new Tone.BitCrusher({
          bits: Math.max(2, 12 - Math.floor(wbConfig.distortion.drive / 10)),
        });
        break;
    }
  }

  // Post-distortion tone control
  const toneFilter = new Tone.Filter({
    type: 'lowpass',
    frequency: 500 + (wbConfig.distortion.tone / 100) * 15000,
    Q: 0.5,
  });

  // === FORMANT SECTION (for growl) ===
  let formantFilters: Tone.Filter[] = [];
  let formantMixer: Tone.Gain | null = null;
  if (wbConfig.formant.enabled) {
    const formants = VOWEL_FORMANTS[wbConfig.formant.vowel];
    formantFilters = [
      new Tone.Filter({ type: 'bandpass', frequency: formants.f1, Q: 5 }),
      new Tone.Filter({ type: 'bandpass', frequency: formants.f2, Q: 5 }),
      new Tone.Filter({ type: 'bandpass', frequency: formants.f3, Q: 5 }),
    ];
    formantMixer = new Tone.Gain(0.5);
  }

  // === OUTPUT ===
  const output = new Tone.Gain(1);
  output.gain.value = Math.pow(10, getNormalizedVolume('WobbleBass', config.volume) / 20);

  // === SIGNAL CHAIN ===
  // Route oscillators through mixer
  osc1.connect(oscMixer);
  osc2.connect(oscMixer);
  if (subOsc) subOsc.connect(oscMixer);
  if (fmSynth) fmSynth.connect(oscMixer);
  // Connect unison panners (voices already connected to their panners)
  unisonPanners.forEach(p => p.connect(oscMixer));

  // Route through filter chain
  if (filterDrive) {
    oscMixer.connect(filterDrive);
    filterDrive.connect(filter);
  } else {
    oscMixer.connect(filter);
  }

  // Route through effects
  let currentNode: Tone.ToneAudioNode = filter;

  if (distortion) {
    currentNode.connect(distortion);
    currentNode = distortion;
  }

  currentNode.connect(toneFilter);
  currentNode = toneFilter;

  // Add formant parallel path if enabled
  if (formantMixer && formantFilters.length > 0) {
    formantFilters.forEach(f => {
      currentNode.connect(f);
      f.connect(formantMixer!);
    });
    formantMixer.connect(output);
    currentNode.connect(output); // Mix dry + formant
  } else {
    currentNode.connect(output);
  }

  // Store active notes for release
  const activeNotes = new Set<string>();

  return {
    triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => {
      const t = time ?? Tone.now();
      const v = velocity ?? 0.8;

      // Release any existing voice for this note first to prevent voice leak
      try { osc1.triggerRelease(note, t); } catch { /* ignore */ }
      try { osc2.triggerRelease(note, t); } catch { /* ignore */ }
      try { if (subOsc) subOsc.triggerRelease(note, t); } catch { /* ignore */ }
      try { if (fmSynth) fmSynth.triggerRelease(note, t); } catch { /* ignore */ }
      try { unisonVoices.forEach(voice => voice.triggerRelease(note, t)); } catch { /* ignore */ }

      // Reset LFO phase on retrigger
      if (wbConfig.wobbleLFO.retrigger && wobbleLFO) {
        wobbleLFO.phase = wbConfig.wobbleLFO.phase;
      }

      // Trigger filter envelope
      filterEnv.triggerAttack(t);

      // Trigger all oscillators
      osc1.triggerAttackRelease(note, duration, t, v);
      osc2.triggerAttackRelease(note, duration, t, v);
      if (subOsc) subOsc.triggerAttackRelease(note, duration, t, v);
      if (fmSynth) fmSynth.triggerAttackRelease(note, duration, t, v);
      unisonVoices.forEach(voice => voice.triggerAttackRelease(note, duration, t, v * 0.6));
    },
    triggerAttack: (note: string, time?: number, velocity?: number) => {
      const t = time ?? Tone.now();
      const v = velocity ?? 0.8;
      activeNotes.add(note);

      // Release any existing voice for this note first to prevent voice leak
      try { osc1.triggerRelease(note, t); } catch { /* ignore */ }
      try { osc2.triggerRelease(note, t); } catch { /* ignore */ }
      try { if (subOsc) subOsc.triggerRelease(note, t); } catch { /* ignore */ }
      try { if (fmSynth) fmSynth.triggerRelease(note, t); } catch { /* ignore */ }
      try { unisonVoices.forEach(voice => voice.triggerRelease(note, t)); } catch { /* ignore */ }

      // Reset LFO phase on retrigger
      if (wbConfig.wobbleLFO.retrigger && wobbleLFO) {
        wobbleLFO.phase = wbConfig.wobbleLFO.phase;
      }

      // Trigger filter envelope
      filterEnv.triggerAttack(t);

      osc1.triggerAttack(note, t, v);
      osc2.triggerAttack(note, t, v);
      if (subOsc) subOsc.triggerAttack(note, t, v);
      if (fmSynth) fmSynth.triggerAttack(note, t, v);
      unisonVoices.forEach(voice => voice.triggerAttack(note, t, v * 0.6));
    },
    triggerRelease: (note: string, time?: number) => {
      const t = time ?? Tone.now();
      activeNotes.delete(note);

      filterEnv.triggerRelease(t);

      osc1.triggerRelease(note, t);
      osc2.triggerRelease(note, t);
      if (subOsc) subOsc.triggerRelease(note, t);
      if (fmSynth) fmSynth.triggerRelease(note, t);
      unisonVoices.forEach(voice => voice.triggerRelease(note, t));
    },
    releaseAll: () => {
      osc1.releaseAll();
      osc2.releaseAll();
      if (subOsc) subOsc.releaseAll();
      if (fmSynth) fmSynth.releaseAll();
      unisonVoices.forEach(voice => voice.releaseAll());
      activeNotes.clear();
    },
    connect: (dest: Tone.InputNode) => output.connect(dest),
    disconnect: () => output.disconnect(),
    dispose: () => {
      osc1.dispose();
      osc2.dispose();
      if (subOsc) subOsc.dispose();
      if (fmSynth) fmSynth.dispose();
      unisonVoices.forEach(v => v.dispose());
      unisonPanners.forEach(p => p.dispose());
      oscMixer.dispose();
      filter.dispose();
      if (filterDrive) filterDrive.dispose();
      filterEnv.dispose();
      if (wobbleLFO) wobbleLFO.dispose();
      if (distortion) distortion.dispose();
      toneFilter.dispose();
      formantFilters.forEach(f => f.dispose());
      if (formantMixer) formantMixer.dispose();
      output.dispose();
    },
    applyConfig: (newConfig: Record<string, unknown>) => {
      const wbc = newConfig || DEFAULT_WOBBLE_BASS;
      const wbcEnv = (wbc.envelope || {}) as Record<string, number>;
      const wbcOsc1 = (wbc.osc1 || {}) as Record<string, number>;
      const wbcOsc2 = (wbc.osc2 || {}) as Record<string, number>;
      const wbcSub = (wbc.sub || {}) as Record<string, number>;
      const wbcFilter = (wbc.filter || {}) as Record<string, unknown>;
      const wbcLFO = (wbc.wobbleLFO || {}) as Record<string, number>;
      
      // Update Envelopes
      const envParams = {
        attack: (wbcEnv.attack || 10) / 1000,
        decay: (wbcEnv.decay || 200) / 1000,
        sustain: (wbcEnv.sustain ?? 70) / 100,
        release: (wbcEnv.release || 300) / 1000,
      };
      osc1.set({ envelope: envParams });
      osc2.set({ envelope: envParams });
      if (subOsc) subOsc.set({ envelope: envParams });
      if (fmSynth) fmSynth.set({ envelope: envParams });
      unisonVoices.forEach(v => v.set({ envelope: envParams }));

      // Update Osc Levels & Tuning
      osc1.volume.rampTo(-6 + (wbcOsc1.level / 100) * 6 - 6, 0.1);
      osc2.volume.rampTo(-6 + (wbcOsc2.level / 100) * 6 - 6, 0.1);
      osc1.set({ detune: wbcOsc1.octave * 1200 + wbcOsc1.detune });
      osc2.set({ detune: wbcOsc2.octave * 1200 + wbcOsc2.detune });
      
      if (subOsc) {
        subOsc.volume.rampTo(-12 + (wbcSub.level / 100) * 12 - 6, 0.1);
        subOsc.set({ detune: wbcSub.octave * 1200 });
      }

      // Update Filter
      filter.set({
        type: wbcFilter.type as Tone.FilterOptions['type'],
        frequency: Number(wbcFilter.cutoff) || 500,
        Q: Number(wbcFilter.resonance) / 10,
      });

      // Update LFO
      if (wobbleLFO) {
        wobbleLFO.frequency.rampTo(wbcLFO.rate || 1, 0.1);
      }
    },
    volume: osc1.volume,

    // Expose LFO for external control
    wobbleLFO,
    filter,
  } as unknown as Tone.ToneAudioNode;
}

/**
 * Reverse an AudioBuffer by copying samples in reverse order
 */
// @ts-ignore unused but kept for potential future use
export function _reverseAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const audioContext = Tone.getContext().rawContext;
  const reversed = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = reversed.getChannelData(ch);
    for (let i = 0; i < src.length; i++) {
      dst[i] = src[src.length - 1 - i];
    }
  }
  return reversed;
}

export function createDrumKit(config: InstrumentConfig): DrumKitSynth {
  const dkConfig = config.drumKit || DEFAULT_DRUMKIT;
  return new DrumKitSynth(dkConfig);
}

export function createDubSiren(config: InstrumentConfig): Tone.ToneAudioNode {
  const dubSirenConfig = config.dubSiren || DEFAULT_DUB_SIREN;
  const synth = new DubSirenSynth(dubSirenConfig);
  
  // Apply initial volume
  synth.volume.value = getNormalizedVolume('DubSiren', config.volume);

  return synth as unknown as Tone.ToneAudioNode;
}

export function createSpaceLaser(config: InstrumentConfig): Tone.ToneAudioNode {
  const spaceLaserConfig = config.spaceLaser || DEFAULT_SPACE_LASER;
  const synth = new SpaceLaserSynth(spaceLaserConfig);

  synth.volume.value = getNormalizedVolume('SpaceLaser', config.volume);
  
  return synth as unknown as Tone.ToneAudioNode;
}

export function createV2(config: InstrumentConfig): Tone.ToneAudioNode {
  // Check if V2 Speech mode is enabled - use V2SpeechSynth for singing/talking
  if (config.v2Speech || config.synthType === 'V2Speech') {
    const synth = new V2SpeechSynth(config.v2Speech || undefined);

    synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('V2', config.volume));

    return synth as unknown as Tone.ToneAudioNode;
  }

  // Regular V2 synth mode - pass V2 config for initial patch parameters
  const synth = new V2Synth(config.v2 || undefined);

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('V2', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

export function createSam(config: InstrumentConfig): Tone.ToneAudioNode {
  const samConfig = config.sam || DEFAULT_SAM;
  const synth = new SAMSynth(samConfig);

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('Sam', config.volume));
  
  return synth as unknown as Tone.ToneAudioNode;
}

export function createPinkTrombone(config: InstrumentConfig): Tone.ToneAudioNode {
  const ptConfig = config.pinkTrombone || DEFAULT_PINK_TROMBONE;
  const synth = new PinkTromboneSynth(ptConfig);

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('PinkTrombone', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

export function createDECtalk(config: InstrumentConfig): Tone.ToneAudioNode {
  const dtConfig = config.dectalk || DEFAULT_DECTALK;
  const synth = new DECtalkSynth(dtConfig);

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('DECtalk', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

export function createSynare(config: InstrumentConfig): Tone.ToneAudioNode {
  const synareConfig = config.synare || DEFAULT_SYNARE;
  const synth = new SynareSynth(synareConfig);

  synth.volume.value = getNormalizedVolume('Synare', config.volume);

  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create MDA ePiano (Fender Rhodes)
 * 32-voice sample-based Rhodes piano with tremolo, autopan, overdrive
 */
export function createMdaEPiano(config: InstrumentConfig): Tone.ToneAudioNode {
  const epianoConfig = config.mdaEPiano || {};
  const synth = new MdaEPianoSynth(epianoConfig);

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MdaEPiano', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create MDA JX-10 Polysynth (Roland JX-8P inspired)
 * 8-voice dual-oscillator subtractive synth with state-variable filter
 */
export function createMdaJX10(config: InstrumentConfig): Tone.ToneAudioNode {
  const jx10Config = config.mdaJX10 || {};
  const synth = new MdaJX10Synth(jx10Config);

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MdaJX10', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create MDA DX10 FM Synth (2-operator FM)
 * 8-voice polyphonic FM synth with carrier/modulator envelopes
 */
export function createMdaDX10(config: InstrumentConfig): Tone.ToneAudioNode {
  const dx10Config = config.mdaDX10 || {};
  const synth = new MdaDX10Synth(dx10Config);

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MdaDX10', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create Amsynth (Analog Modelling Synthesizer, real WASM engine)
 * Dual-oscillator subtractive with multi-mode filter, reverb, distortion
 */
export function createAmsynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const amsynthConfig = config.amsynth || {};
  const synth = new AMSynthSynth(amsynthConfig);

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('Amsynth', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create Raffo Synth (Minimoog clone)
 * Monophonic 4-oscillator subtractive with glide
 */
export function createRaffoSynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const raffoConfig = config.raffo || {};
  const synth = new RaffoSynthEngine(raffoConfig);

  const nativePatch = (config as unknown as Record<string, unknown>).raffoNativePatch;
  if (typeof nativePatch === 'string') {
    synth.loadNativePreset(nativePatch);
  }

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('RaffoSynth', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

export function createCalfMono(config: InstrumentConfig): Tone.ToneAudioNode {
  const calfConfig = config.calfMono || {};
  const synth = new CalfMonoSynthImpl();
  void synth.init();
  synth.applyConfig(calfConfig);
  const nativePatch = (config as unknown as Record<string, unknown>).calfMonoNativePatch;
  if (typeof nativePatch === 'string') {
    synth.loadNativePreset(nativePatch);
  }
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('CalfMono', config.volume));
  return synth as unknown as Tone.ToneAudioNode;
}

export function createSetBfree(config: InstrumentConfig): Tone.ToneAudioNode {
  const bfreeConfig = config.setbfree || {};
  const synth = new SetBfreeSynthImpl();
  void synth.init();
  synth.applyConfig(bfreeConfig);

  // Check for native patch preset (complete organ registration from upstream default.pgm)
  const nativePresetName = (config as unknown as Record<string, unknown>).setbfreeNativePatch;
  if (typeof nativePresetName === 'string') {
    synth.loadNativePreset(nativePresetName);
  }

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('SetBfree', config.volume));
  return synth as unknown as Tone.ToneAudioNode;
}

export function createSynthV1(config: InstrumentConfig): Tone.ToneAudioNode {
  const sv1Config = config.synthv1 || {};
  const synth = new SynthV1SynthImpl();
  void synth.init();
  synth.applyConfig(sv1Config);
  const nativePatch = (config as unknown as Record<string, unknown>).synthv1NativePatch;
  if (typeof nativePatch === 'string') {
    synth.loadNativePreset(nativePatch);
  }
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('SynthV1', config.volume));
  return synth as unknown as Tone.ToneAudioNode;
}

export function createTalNoizeMaker(config: InstrumentConfig): Tone.ToneAudioNode {
  const talConfig = config.talNoizeMaker || {};
  const synth = new TalNoizeMakerSynthImpl();
  void synth.init();
  synth.applyConfig(talConfig);

  // Check for native patch preset (complete engine state from upstream ProgramChunk.h)
  const nativePresetName = (config as unknown as Record<string, unknown>).talNativePatch;
  if (typeof nativePresetName === 'string') {
    synth.loadNativePreset(nativePresetName);
  } else {
    // Load first native preset as default — WASM init state is silent without a patch
    synth.loadNativePreset('! Startup Juno Osc TAL');
  }

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('TalNoizeMaker', config.volume));
  return synth as unknown as Tone.ToneAudioNode;
}

export function createAeolus(config: InstrumentConfig): Tone.ToneAudioNode {
  const aeolusConfig = config.aeolus || {};
  const synth = new AeolusSynthImpl();
  void synth.init();
  synth.applyConfig(aeolusConfig);
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('Aeolus', config.volume));
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMonique(config: InstrumentConfig): Tone.ToneAudioNode {
  const moniqueConfig = config.monique || {};
  const synth = new MoniqueSynthEngine(moniqueConfig);
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('Monique', config.volume));
  return synth as unknown as Tone.ToneAudioNode;
}

export function createVL1(config: InstrumentConfig): Tone.ToneAudioNode {
  const vl1Config = config.vl1 || {};
  const synth = new VL1SynthEngine(vl1Config);
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('VL1', config.volume));
  return synth as unknown as Tone.ToneAudioNode;
}

export function createFluidSynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const fsConfig = config.fluidsynth || {};
  const synth = new FluidSynthSynthImpl();
  void synth.init();
  synth.applyConfig(fsConfig);
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('FluidSynth', config.volume));
  return synth as unknown as Tone.ToneAudioNode;
}

export function createSfizz(config: InstrumentConfig): Tone.ToneAudioNode {
  const sfizzConfig = config.sfizz || {};
  const synth = new SfizzEngine();
  void synth.init();
  synth.applyConfig(sfizzConfig);
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('Sfizz', config.volume));
  return synth as unknown as Tone.ToneAudioNode;
}

export function createZynAddSubFX(config: InstrumentConfig): Tone.ToneAudioNode {
  const zasfxConfig = config.zynaddsubfx || {};
  const synth = new ZynAddSubFXSynthImpl();
  void synth.init();
  // Check for native XML preset (loaded by ZynAddSubFX's own XML parser)
  const xmlPresetName = (config as unknown as Record<string, unknown>).zynaddsubfxXmlPreset;
  if (typeof xmlPresetName === 'string') {
    synth.setPreset(xmlPresetName);
  } else {
    synth.applyConfig(zasfxConfig);
  }
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('ZynAddSubFX', config.volume));
  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create CZ-101 Phase Distortion Synthesizer
 * 8-voice Phase Distortion synthesis with DCO/DCW/DCA envelopes
 */

export function createCZ101(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new CZ101Synth();
  void synth.init();

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('CZ101', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create CEM3394 Analog Synthesizer Voice
 * 8-voice analog synthesis with VCO, VCF, VCA (Prophet VS, Matrix-6, ESQ-1)
 */

export function createCEM3394(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new CEM3394Synth();

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('CEM3394', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create Sega Saturn SCSP (YMF292-F) Sound Processor
 * 32-voice synthesis with ADSR, LFO, and FM capabilities
 */

export function createSCSP(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new SCSPSynth();

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('SCSP', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create Ensoniq VFX (ES5506) Wavetable Synthesizer
 * 32-voice wavetable synthesis with resonant filters
 */

export function createVFX(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new VFXSynth();
  synth.init().then(() => {
    if (synth.getStatus().romLoaded) {
      import('../../stores/useInstrumentStore').then(({ useInstrumentStore }) => {
        const store = useInstrumentStore.getState();
        const inst = store.instruments.find((i) => i.id === config.id);
        if (inst) {
          store.updateInstrument(config.id, {
            mame: { ...(inst.mame ?? {}), romsLoaded: true },
          });
        }
      }).catch(() => {});
    }
  }).catch(() => {});

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEVFX', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create Roland D-50 Linear Arithmetic Synthesizer
 * 16-voice LA synthesis (PCM attacks + digital sustain)
 */

export function createD50(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new D50Synth();
  void synth.init();

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMERSA', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create Roland SA-synthesis Digital Piano (RdPiano WASM)
 * Cycle-accurate MKS-20 / MK-80 emulation with SpaceD chorus
 */

export function createRdPiano(config: InstrumentConfig): Tone.ToneAudioNode {
  const rdpianoConfig = config.rdpiano || {};
  const synth = new RdPianoSynth(rdpianoConfig);

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMERSA', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

/**
 * Create Yamaha MU-2000 (SWP30) Wavetable Synthesizer
 * 64-voice GM2/XG compatible wavetable synthesis
 */

export function createMU2000(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new MU2000Synth();
  void synth.init();

  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMESWP30', config.volume));

  return synth as unknown as Tone.ToneAudioNode;
}

// ─── Buzz3o3DF (Devil Fish variant) ───────────────────────────────


export function createBuzz3o3DF(config: InstrumentConfig): BuzzmachineGenerator {
  const synth = new BuzzmachineGenerator(BuzzmachineType.OOMEK_AGGRESSOR_DF);

  if (config.tb303) {
    const tb = config.tb303;
    synth.setCutoff(tb.filter.cutoff);
    synth.setResonance(tb.filter.resonance);
    synth.setEnvMod(tb.filterEnvelope.envMod);
    synth.setDecay(tb.filterEnvelope.decay);
    synth.setAccentAmount(tb.accent.amount);
    synth.setWaveform(tb.oscillator.type);
    if (tb.tuning !== undefined) synth.setTuning(tb.tuning);
    if (tb.overdrive) synth.setOverdrive(tb.overdrive.amount);

    if (tb.devilFish) {
      const df = tb.devilFish;
      if (df.enabled) {
        synth.enableDevilFish(true, {
          overdrive: tb.overdrive?.amount,
          muffler: df.muffler as 'off' | 'dark' | 'mid' | 'bright',
        });
      }
      if (df.muffler) synth.setMuffler(df.muffler);
      if (df.highResonance) synth.setHighResonanceEnabled(df.highResonance);
      if (df.filterTracking !== undefined) synth.setFilterTracking(df.filterTracking);
      if (df.normalDecay !== undefined) synth.setNormalDecay(df.normalDecay);
      if (df.accentDecay !== undefined) synth.setAccentDecay(df.accentDecay);
      if (df.vegDecay !== undefined) synth.setVegDecay(df.vegDecay);
      if (df.vegSustain !== undefined) synth.setVegSustain(df.vegSustain);
      if (df.softAttack !== undefined) synth.setSoftAttack(df.softAttack);
      if (df.sweepSpeed !== undefined) synth.setSweepSpeed(df.sweepSpeed);
      if (df.filterFmDepth !== undefined) synth.setFilterFM(df.filterFmDepth);
    }
  }

  // Apply normalized volume (always, even without tb303 config)
  const normalizedVolume = getNormalizedVolume('Buzz3o3DF', config.volume);
  synth.output.gain.value = Tone.dbToGain(normalizedVolume);

  return synth;
}

// ─── MAME Hardware-Accurate Synths ────────────────────────────────

/** Apply config.parameters to a MAME chip synth via setParam/loadPreset */

export function applyChipParameters(synth: { setParam: (key: string, value: number) => void; loadPreset?: (index: number) => void }, config: InstrumentConfig): void {
  const params = config.parameters;
  if (!params) return;
  // If _program is set, load built-in WASM preset first (not all chips support it)
  if (typeof params._program === 'number' && typeof synth.loadPreset === 'function') {
    synth.loadPreset(params._program);
  }
  // Apply individual parameter overrides
  for (const [key, value] of Object.entries(params)) {
    if (key === '_program' || typeof value !== 'number') continue;
    synth.setParam(key, value);
  }
}


export function createMAMEASC(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new ASCSynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEASC', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEAstrocade(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new AstrocadeSynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEAstrocade', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEC352(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new C352Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEC352', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEES5503(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new ES5503Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEES5503', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEICS2115(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new ICS2115Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEICS2115', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEK054539(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new K054539Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEK054539', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEMEA8000(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new MEA8000Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEMEA8000', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMERF5C400(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new RF5C400Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMERF5C400', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMESN76477(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new SN76477Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMESN76477', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMESNKWave(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new SNKWaveSynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMESNKWave', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMESP0250(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new SP0250Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMESP0250', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMETMS36XX(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new TMS36XXSynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMETMS36XX', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMETMS5220(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new TMS5220Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMETMS5220', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMETR707(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new TR707Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMETR707', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEUPD931(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new UPD931Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEUPD931', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEUPD933(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new UPD933Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEUPD933', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEVotrax(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new VotraxSynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEVotrax', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEYMF271(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new YMF271Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEYMF271', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEYMOPQ(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new YMOPQSynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEYMOPQ', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEVASynth(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new VASynthSynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEVASynth', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMECMI(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new CMISynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMECMI', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEFZPCM(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new FZSynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEFZPCM', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEPS1SPU(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new PS1SPUSynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEPS1SPU', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEZSG2(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new ZSG2Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEZSG2', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEKS0164(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new KS0164Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEKS0164', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMESWP00(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new SWP00Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMESWP00', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMESWP20(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new SWP20Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMESWP20', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMERolandGP(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new RolandGPSynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMERolandGP', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMES14001A(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new S14001ASynth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMES14001A', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEVLM5030(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new VLM5030Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEVLM5030', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createMAMEHC55516(config: InstrumentConfig): Tone.ToneAudioNode {
  const synth = new HC55516Synth();
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEHC55516', config.volume));
  applyChipParameters(synth, config);
  return synth as unknown as Tone.ToneAudioNode;
}

export function createModularSynth(config: InstrumentConfig): DevilboxSynth {
  const patchConfig = config.modularSynth || DEFAULT_MODULAR_PATCH;
  const synth = new ModularSynth(patchConfig);
  synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('ModularSynth', config.volume));
  return synth;
}

