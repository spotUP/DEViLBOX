/**
 * Miscellaneous synth registrations (lazy-loaded)
 *
 * Covers: DubSiren, SpaceLaser, V2/V2Speech, Sam, Synare,
 * CZ101, CEM3394, SCSP, VFX, D50, MAMEDOC, MAMERSA, MAMESWP30,
 * SuperSaw, PolySynth, Organ, DrumMachine, ChipSynth, PWMSynth,
 * StringMachine, FormantSynth, WobbleBass, DrumKit, ChiptuneModule, Wavetable
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { DubSirenSynth } from '../../dub/DubSirenSynth';
import { SpaceLaserSynth } from '../../SpaceLaserSynth';
import { V2Synth } from '../../v2/V2Synth';
import { V2SpeechSynth } from '../../v2/V2SpeechSynth';
import { SAMSynth } from '../../sam/SAMSynth';
import { DECtalkSynth } from '../../dectalk/DECtalkSynth';
import { SynareSynth } from '../../SynareSynth';
import { CZ101Synth } from '../../cz101/CZ101Synth';
import { applyChipParameters } from './mame';
import { CEM3394Synth } from '../../cem3394/CEM3394Synth';
import { SCSPSynth } from '../../scsp/SCSPSynth';
import { VFXSynth } from '../../vfx/VFXSynth';
import { D50Synth } from '../../d50/D50Synth';
import { RdPianoSynth } from '../../rdpiano/RdPianoSynth';
import { MU2000Synth } from '../../mu2000/MU2000Synth';
import { ES5503Synth } from '../../es5503/ES5503Synth';
import { DrumKitSynth } from '../../DrumKitSynth';
import { WavetableSynth } from '../../WavetableSynth';
import {
  OscBassSynth, CrushBassSynth, SonarPingSynth, RadioRiserSynth, SubSwellSynth,
} from '../../dub/DubDerivedSynths';
import {
  DEFAULT_DUB_SIREN, DEFAULT_SPACE_LASER, DEFAULT_SAM, DEFAULT_DECTALK, DEFAULT_SYNARE,
  DEFAULT_DRUMKIT,
  DEFAULT_OSC_BASS, DEFAULT_CRUSH_BASS, DEFAULT_SONAR_PING, DEFAULT_RADIO_RISER, DEFAULT_SUB_SWELL,
} from '@/types/instrument';

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
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'DECtalk',
    name: 'DECtalk Speech',
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 16,
    create: (config) => {
      const synth = new DECtalkSynth(config.dectalk || DEFAULT_DECTALK);
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
      // The chosen preset and knob values, as the editor shows them
      applyChipParameters(synth, config);
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, note, time) => {
      // Polyphonic: release the voice that plays this note (the time alone cannot name one)
      (synth as unknown as CZ101Synth).triggerRelease(note, time);
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
    create: () => {
      const synth = new CEM3394Synth();
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
    create: () => {
      const synth = new SCSPSynth();
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
    create: () => {
      const synth = new VFXSynth();
      void synth.init();
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
    create: () => {
      const synth = new VFXSynth();
      void synth.init();
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
    create: () => {
      const synth = new D50Synth();
      void synth.init();
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
    volumeOffsetDb: 62,  // Same as MAMEES5503: ES5503Synth native output is very quiet
    create: (config) => {
      // Route to ES5503Synth: same ES5503 DOC chip via dedicated worklet (ES5503.wasm),
      // which works reliably. MAMESynth({type:'doc'}) via MAMEChips.wasm had no audio.
      const synth = new ES5503Synth();
      synth.output.gain.value = Math.pow(10, ((config.volume ?? -12) + 62) / 20);
      return synth as unknown as Tone.ToneAudioNode;
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
    create: () => {
      const synth = new MU2000Synth();
      void synth.init();
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
      });
      return synth;
    },
  },
];

// ── Dub-derived standalone synths ────────────────────────────────────────────
// Extracted from DubBus.startXxx(...) so these voices are pickable as
// normal instruments on any channel, routed through that channel's
// insert-effect chain. Same DSP as the dub-bus versions, different output.

const dubDerivedDescs: SynthDescriptor[] = [
  {
    id: 'OscBass',
    name: 'Osc Bass',
    category: 'native',
    loadMode: 'lazy',
    volumeOffsetDb: 6,
    create: (config) => {
      const synth = new OscBassSynth(config.oscBass || DEFAULT_OSC_BASS);
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(_note, time);
      return true;
    },
  },
  {
    id: 'CrushBass',
    name: 'Crush Bass',
    category: 'native',
    loadMode: 'lazy',
    volumeOffsetDb: 6,
    create: (config) => {
      const synth = new CrushBassSynth(config.crushBass || DEFAULT_CRUSH_BASS);
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(_note, time);
      return true;
    },
  },
  {
    id: 'SonarPing',
    name: 'Sonar Ping',
    category: 'native',
    loadMode: 'lazy',
    volumeOffsetDb: 4,
    create: (config) => {
      const synth = new SonarPingSynth(config.sonarPing || DEFAULT_SONAR_PING);
      return synth as unknown as Tone.ToneAudioNode;
    },
    // Trigger-only voice: no meaningful release, but we still answer
    // true so the note-off path doesn't fall through to a default.
    onTriggerRelease: () => true,
  },
  {
    id: 'RadioRiser',
    name: 'Radio Riser',
    category: 'native',
    loadMode: 'lazy',
    volumeOffsetDb: 6,
    create: (config) => {
      const synth = new RadioRiserSynth(config.radioRiser || DEFAULT_RADIO_RISER);
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: () => true,
  },
  {
    id: 'SubSwell',
    name: 'Sub Swell',
    category: 'native',
    loadMode: 'lazy',
    volumeOffsetDb: 6,
    create: (config) => {
      const synth = new SubSwellSynth(config.subSwell || DEFAULT_SUB_SWELL);
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: () => true,
  },
];

// ── Register all ─────────────────────────────────────────────────────────────

SynthRegistry.register(speechAndSpecialDescs);
SynthRegistry.register(juceWasmDescs);
SynthRegistry.register(mameComplexDescs);
SynthRegistry.register(specialDescs);
SynthRegistry.register(dubDerivedDescs);
