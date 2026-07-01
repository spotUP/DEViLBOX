/**
 * Cinter4 synth registration — makes Cinter4Synth a first-class playable voice.
 *
 * Params live in config.parameters (readCinter4InstrumentParams); the voice
 * renders its PCM from them. `.cinter4` song replay is unaffected — it runs
 * through the WASM replayer with note-suppression, so this voice is never
 * triggered during song playback (see Cinter4Synth docs).
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { Cinter4Synth } from '../../cinter4/Cinter4Synth';

const cinter4Desc: SynthDescriptor = {
  id: 'Cinter4Synth',
  name: 'Cinter4 Amiga Synthesizer',
  category: 'native',
  loadMode: 'eager',
  useSynthBus: true,
  controlsComponent: 'Cinter4Controls',
  create: (config) => {
    const synth = new Cinter4Synth(config);
    synth.output.gain.value = Tone.dbToGain(config.volume ?? -12);
    return synth;
  },
  onTriggerAttack: (synth, note, time, velocity) => {
    (synth as Cinter4Synth).triggerAttack(note, time, velocity);
    return true;
  },
  onTriggerRelease: (synth, note, time) => {
    (synth as Cinter4Synth).triggerRelease(note, time);
    return true;
  },
};

SynthRegistry.register(cinter4Desc);
