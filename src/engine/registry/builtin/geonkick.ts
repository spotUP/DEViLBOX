/**
 * Geonkick — Quamplex percussion synthesizer (WASM port).
 *
 * Wraps the singleton GeonkickEngine via GeonkickSynth so the registry
 * can hand the same instance back to every channel that targets the
 * 'Geonkick' synth type. The MVP build is single-instrument
 * (GEONKICK_SINGLE) — a future expansion to the 16-piece kit will
 * unwrap that flag.
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { GeonkickSynth } from '../../geonkick/GeonkickSynth';

const geonkickDesc: SynthDescriptor = {
  id: 'Geonkick',
  name: 'Geonkick',
  category: 'wasm',
  loadMode: 'eager',
  sharedInstance: true,
  useSynthBus: true,
  controlsComponent: 'GeonkickControls',
  create: (config) => {
    return new GeonkickSynth(config.geonkick);
  },
  onTriggerAttack: (synth, note, time, velocity) => {
    (synth as GeonkickSynth).triggerAttack(note, time, velocity);
    return true;
  },
  onTriggerRelease: (synth, note, time) => {
    (synth as GeonkickSynth).triggerRelease(note, time);
    return true;
  },
};

SynthRegistry.register(geonkickDesc);
