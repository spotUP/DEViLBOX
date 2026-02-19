/**
 * TapeSimulator effect registration.
 * Port of The Kiss of Shame tape deck emulator by Hollance.
 * DSP: InputSaturation + Shame (wow/flutter) + HurricaneSandy LP + PinkNoise hiss + Head Bump
 */

import type { EffectConfig } from '@typedefs/instrument';
import { EffectRegistry } from '../EffectRegistry';

EffectRegistry.register({
  id: 'TapeSimulator',
  name: 'Tape Simulator',
  category: 'wasm',
  group: 'Texture',
  loadMode: 'eager',

  create: async (c: EffectConfig) => {
    const { TapeSimulatorEffect } = await import('@engine/effects/TapeSimulatorEffect');
    const p = c.parameters;
    return new TapeSimulatorEffect({
      drive:     Number(p.drive     ?? 30) / 100,
      character: Number(p.character ?? 40) / 100,
      bias:      Number(p.bias      ?? 40) / 100,
      shame:     Number(p.shame     ?? 20) / 100,
      hiss:      Number(p.hiss      ?? 20) / 100,
      speed:     Number(p.speed     ?? 0),     // 0|1 integer, not 0-100 range
      wet:       c.wet / 100,
    });
  },

  getDefaultParameters: () => ({
    drive: 30, character: 40, bias: 40, shame: 20, hiss: 20, speed: 0,
  }),
});
