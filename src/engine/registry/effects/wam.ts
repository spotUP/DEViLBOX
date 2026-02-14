/**
 * WAM 2.0 effect registrations — lazy loaded
 *
 * 11 Web Audio Module 2.0 effects loaded from external URLs.
 */

import type { EffectConfig } from '@typedefs/instrument';
import type { EffectDescriptor } from '../EffectDescriptor';
import { EffectRegistry } from '../EffectRegistry';

/** Helper: create a WAM effect descriptor */
function wamEffect(id: string, name: string, group: string): EffectDescriptor {
  return {
    id, name, category: 'wam', group, loadMode: 'lazy',
    create: async (c: EffectConfig) => {
      const { WAM_EFFECT_URLS } = await import('@/constants/wamPlugins');
      const { WAMEffectNode } = await import('@engine/wam/WAMEffectNode');
      const wamUrl = WAM_EFFECT_URLS[c.type];
      if (!wamUrl) {
        const Tone = await import('tone');
        console.warn(`[EffectRegistry] No WAM URL for effect: ${c.type}`);
        return new Tone.Gain(1);
      }
      const wamNode = new WAMEffectNode({ moduleUrl: wamUrl, wet: c.wet / 100 });
      await wamNode.ensureInitialized();
      return wamNode;
    },
    getDefaultParameters: () => ({}),
  };
}

EffectRegistry.register([
  // Distortion
  wamEffect('WAMBigMuff', 'Big Muff Pi', 'Distortion'),
  wamEffect('WAMTS9', 'TS-9 Overdrive', 'Distortion'),
  wamEffect('WAMDistoMachine', 'Disto Machine', 'Distortion'),
  wamEffect('WAMQuadraFuzz', 'QuadraFuzz', 'Distortion'),
  wamEffect('WAMVoxAmp', 'Vox Amp 30', 'Distortion'),
  // Modulation
  wamEffect('WAMStonePhaser', 'Stone Phaser', 'Modulation'),
  // Reverb & Delay
  wamEffect('WAMPingPongDelay', 'Ping Pong Delay', 'Reverb & Delay'),
  wamEffect('WAMFaustDelay', 'Faust Delay', 'Reverb & Delay'),
  // Pitch
  wamEffect('WAMPitchShifter', 'Csound Pitch Shifter', 'Pitch'),
  // EQ & Stereo
  wamEffect('WAMGraphicEQ', 'Graphic Equalizer', 'EQ & Stereo'),
  // Multi-FX
  wamEffect('WAMPedalboard', 'Pedalboard', 'Multi-FX'),
]);
