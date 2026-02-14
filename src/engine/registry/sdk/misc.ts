/**
 * Miscellaneous synth registrations (lazy-loaded)
 *
 * Covers: DubSiren, SpaceLaser, V2/V2Speech, Sam, Synare, Dexed, OBXd,
 * CZ101, CEM3394, SCSP, VFX, D50, MAMEDOC, MAMERSA, MAMESWP30,
 * SuperSaw, PolySynth, Organ, DrumMachine, ChipSynth, PWMSynth,
 * StringMachine, FormantSynth, WobbleBass, DrumKit, ChiptuneModule, Wavetable
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { DubSirenSynth } from '../../DubSirenSynth';
import { SpaceLaserSynth } from '../../SpaceLaserSynth';
import { V2Synth } from '../../v2/V2Synth';
import { V2SpeechSynth } from '../../v2/V2SpeechSynth';
import { SAMSynth } from '../../sam/SAMSynth';
import { SynareSynth } from '../../SynareSynth';
import { DexedSynth } from '../../dexed/DexedSynth';
import { OBXdSynth } from '../../obxd/OBXdSynth';
import { CZ101Synth } from '../../cz101/CZ101Synth';
import { CEM3394Synth } from '../../cem3394/CEM3394Synth';
import { SCSPSynth } from '../../scsp/SCSPSynth';
import { VFXSynth } from '../../vfx/VFXSynth';
import { D50Synth } from '../../d50/D50Synth';
import { RdPianoSynth } from '../../rdpiano/RdPianoSynth';
import { MU2000Synth } from '../../mu2000/MU2000Synth';
import { MAMESynth } from '../../MAMESynth';
import { DrumKitSynth } from '../../DrumKitSynth';
import { WavetableSynth } from '../../WavetableSynth';
import {
  DEFAULT_DUB_SIREN, DEFAULT_SPACE_LASER, DEFAULT_SAM, DEFAULT_SYNARE,
  DEFAULT_DRUMKIT,
} from '@/types/instrument';

const VOLUME_OFFSETS: Record<string, number> = {
  DubSiren: 13, SpaceLaser: 24, V2: 0, V2Speech: 0, Sam: 16, Synare: 7,
  Dexed: 41, OBXd: 9, CZ101: 0, CEM3394: 19, SCSP: 15,
  MAMEVFX: 0, VFX: 0, D50: 0, MAMEDOC: 0, MAMERSA: 0, MAMESWP30: 0,
  DrumKit: 0, Wavetable: 5, SuperSaw: 9, PolySynth: 8, Organ: 3,
  DrumMachine: 18, ChipSynth: 5, PWMSynth: 9, StringMachine: 11,
  FormantSynth: 9, WobbleBass: 13, ChiptuneModule: -6,
};

function getNormalizedVolume(synthType: string, configVolume: number | undefined): number {
  return (configVolume ?? -12) + (VOLUME_OFFSETS[synthType] ?? 0);
}

// ── Speech / Special WASM synths ─────────────────────────────────────────────

const speechAndSpecialDescs: SynthDescriptor[] = [
  {
    id: 'DubSiren',
    name: 'Dub Siren',
    category: 'native',
    loadMode: 'lazy',
    volumeOffsetDb: 13,
    create: (config) => {
      const synth = new DubSirenSynth(config.dubSiren || DEFAULT_DUB_SIREN);
      synth.volume.value = getNormalizedVolume('DubSiren', config.volume);
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'SpaceLaser',
    name: 'Space Laser',
    category: 'native',
    loadMode: 'lazy',
    volumeOffsetDb: 24,
    create: (config) => {
      const synth = new SpaceLaserSynth(config.spaceLaser || DEFAULT_SPACE_LASER);
      synth.volume.value = getNormalizedVolume('SpaceLaser', config.volume);
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'V2',
    name: 'Farbrausch V2',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new V2Synth(config.v2 || undefined);
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('V2', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'V2Speech',
    name: 'V2 Speech',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new V2SpeechSynth(config.v2Speech || undefined);
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('V2', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'Sam',
    name: 'SAM Speech',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 16,
    create: (config) => {
      const synth = new SAMSynth(config.sam || DEFAULT_SAM);
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('Sam', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'Synare',
    name: 'Synare 3',
    category: 'native',
    loadMode: 'lazy',
    volumeOffsetDb: 7,
    create: (config) => {
      const synth = new SynareSynth(config.synare || DEFAULT_SYNARE);
      synth.volume.value = getNormalizedVolume('Synare', config.volume);
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
];

// ── JUCE WASM synths ─────────────────────────────────────────────────────────

const juceWasmDescs: SynthDescriptor[] = [
  {
    id: 'Dexed',
    name: 'Yamaha DX7 (Dexed)',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 41,
    create: (config) => {
      const synth = new DexedSynth(config.dexed as any || {});
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('Dexed', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'OBXd',
    name: 'Oberheim OB-X',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 9,
    create: (config) => {
      const synth = new OBXdSynth(config.obxd as any || {});
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('OBXd', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'CZ101',
    name: 'Casio CZ-101',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new CZ101Synth();
      void synth.init();
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('CZ101', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'CEM3394',
    name: 'Curtis CEM3394',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 19,
    create: (config) => {
      const synth = new CEM3394Synth();
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('CEM3394', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'SCSP',
    name: 'Sega Saturn SCSP',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 15,
    create: (config) => {
      const synth = new SCSPSynth();
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('SCSP', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
];

// ── MAME-based complex synths ────────────────────────────────────────────────

const mameComplexDescs: SynthDescriptor[] = [
  {
    id: 'MAMEVFX',
    name: 'Ensoniq VFX',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new VFXSynth();
      void synth.init();
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEVFX', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => { (synth as any).triggerRelease(time); return true; },
  },
  {
    id: 'VFX',
    name: 'Ensoniq VFX',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new VFXSynth();
      void synth.init();
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMEVFX', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => { (synth as any).triggerRelease(time); return true; },
  },
  {
    id: 'D50',
    name: 'Roland D-50',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new D50Synth();
      void synth.init();
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMERSA', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => { (synth as any).triggerRelease(time); return true; },
  },
  {
    id: 'MAMEDOC',
    name: 'Ensoniq ESQ-1 (DOC)',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: () => {
      return new MAMESynth({ type: 'doc' }) as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => { (synth as any).triggerRelease(time); return true; },
  },
  {
    id: 'MAMERSA',
    name: 'Roland SA Digital Piano',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new RdPianoSynth(config.rdpiano || {});
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMERSA', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => { (synth as any).triggerRelease(time); return true; },
  },
  {
    id: 'MAMESWP30',
    name: 'Yamaha MU-2000',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new MU2000Synth();
      void synth.init();
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume('MAMESWP30', config.volume));
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => { (synth as any).triggerRelease(time); return true; },
  },
];

// ── Multi-sample / special ───────────────────────────────────────────────────

const specialDescs: SynthDescriptor[] = [
  {
    id: 'DrumKit',
    name: 'Drum Kit',
    category: 'native',
    loadMode: 'lazy',
    volumeOffsetDb: 0,
    controlsComponent: 'DrumKitControls',
    create: (config) => {
      const kitConfig = config.drumKit || DEFAULT_DRUMKIT;
      const synth = new DrumKitSynth(kitConfig);
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'Wavetable',
    name: 'Wavetable',
    category: 'native',
    loadMode: 'lazy',
    volumeOffsetDb: 5,
    create: (config) => {
      const synth = new WavetableSynth(config as any);
      return synth;
    },
  },
  {
    id: 'ChiptuneModule',
    name: 'Chiptune Module',
    category: 'native',
    loadMode: 'lazy',
    volumeOffsetDb: -6,
    create: (config) => {
      // Fallback to basic synth — full implementation requires libopenmpt WASM
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: (config.oscillator?.type || 'sawtooth') as Tone.ToneOscillatorType } as Partial<Tone.OmniOscillatorOptions>,
        volume: getNormalizedVolume('ChiptuneModule', config.volume),
      });
      return synth;
    },
  },
];

// ── Register all ─────────────────────────────────────────────────────────────

SynthRegistry.register(speechAndSpecialDescs);
SynthRegistry.register(juceWasmDescs);
SynthRegistry.register(mameComplexDescs);
SynthRegistry.register(specialDescs);
