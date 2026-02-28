/**
 * SuperCollider scripted synth registration
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import { DEFAULT_SUPERCOLLIDER } from '@typedefs/instrument';
import { SuperColliderSynth } from '../../sc/SuperColliderSynth';

SynthRegistry.register({
  id: 'SuperCollider',
  name: 'SuperCollider',
  category: 'wasm',
  loadMode: 'eager',
  useSynthBus: true,
  volumeOffsetDb: 0,
  controlsComponent: 'SuperColliderEditor',
  create: (config) => {
    const sc = config.superCollider ?? DEFAULT_SUPERCOLLIDER;
    const audioCtx = Tone.getContext().rawContext as AudioContext;
    return new SuperColliderSynth(sc, audioCtx);
  },
});
