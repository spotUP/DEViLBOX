/**
 * Demoscene synth registrations (lazy-loaded)
 *
 * WaveSabre (Falcon/Slaughter/Adultery), Oidos (additive), Tunefish 4 (subtractive)
 * These are standalone WASM synths extracted from demoscene Renoise (.xrns) projects.
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { WaveSabreSynth } from '../../wavesabre/WaveSabreSynth';
import { OidosSynth } from '../../oidos/OidosSynth';
import { TunefishSynth } from '../../tunefish/TunefishSynth';

function applyVolumeAfterInit(synth: { ensureInitialized: () => Promise<void>; output?: { gain: { value: number } } }, volDb: number): void {
  synth.ensureInitialized().then(() => {
    if (synth.output) synth.output.gain.value = Math.pow(10, volDb / 20);
  }).catch((err: unknown) => {
    console.error('[demoscene-sdk] Init failed:', err);
  });
}

const descs: SynthDescriptor[] = [
  {
    id: 'WaveSabreSynth',
    name: 'WaveSabre Falcon',
    category: 'wasm',
    loadMode: 'lazy',
    useSynthBus: true,
    create: (config) => {
      let wsType: 'falcon' | 'slaughter' | 'adultery' = 'falcon';
      if (config.xrns?.synthType?.includes('adultery')) wsType = 'adultery';
      else if (config.xrns?.synthType?.includes('slaughter')) wsType = 'slaughter';
      const synth = new WaveSabreSynth(wsType);
      const volDb = config.volume ?? -12;
      let chunkApplied = false;
      if (config.xrns?.parameterChunk) {
        chunkApplied = synth.setChunk(config.xrns.parameterChunk);
      }
      if (!chunkApplied && config.xrns?.parameters) {
        for (let i = 0; i < config.xrns.parameters.length; i++) {
          synth.setParameter?.(i, config.xrns.parameters[i]);
        }
      }
      applyVolumeAfterInit(synth, volDb);
      return synth;
    },
  },
  {
    id: 'OidosSynth',
    name: 'Oidos Additive',
    category: 'wasm',
    loadMode: 'lazy',
    useSynthBus: true,
    create: (config) => {
      const synth = new OidosSynth();
      if (config.xrns?.parameters) {
        for (let i = 0; i < config.xrns.parameters.length; i++) {
          synth.setParameter?.(i, config.xrns.parameters[i]);
        }
      }
      applyVolumeAfterInit(synth, config.volume ?? -12);
      return synth;
    },
  },
  {
    id: 'TunefishSynth',
    name: 'Tunefish 4',
    category: 'wasm',
    loadMode: 'lazy',
    useSynthBus: true,
    create: (config) => {
      const synth = new TunefishSynth();
      if (config.xrns?.parameters) {
        synth.setParameters(config.xrns.parameters);
      }
      applyVolumeAfterInit(synth, config.volume ?? -12);
      return synth;
    },
  },
];

for (const desc of descs) SynthRegistry.register(desc);
