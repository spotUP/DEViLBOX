/**
 * SuperCollider scripted synth registration
 *
 * Registers the SuperCollider descriptor for UI routing.
 * Actual instance construction is handled by InstrumentFactory (needs AudioContext).
 */

import { SynthRegistry } from '../SynthRegistry';
import { DEFAULT_SUPERCOLLIDER } from '@typedefs/instrument';

SynthRegistry.register({
  id: 'SuperCollider',
  name: 'SuperCollider',
  category: 'wasm',
  loadMode: 'eager',
  useSynthBus: true,
  volumeOffsetDb: 0,
  controlsComponent: 'SuperColliderEditor',
  // create is never invoked for SuperCollider — InstrumentFactory constructs instances
  // directly because they require an AudioContext parameter.
  create: (_config) => {
    void DEFAULT_SUPERCOLLIDER;
    throw new Error(
      '[SuperColliderRegistry] Use InstrumentFactory to create SuperCollider instances.',
    );
  },
});
