/**
 * Tumult effect registration.
 * 1:1 port of Tumult HISE noise/ambience generator.
 * DSP: noise.cpp + svf_*.cpp + hardSoftClipper.h (Faust/SNEX compiled sources)
 */

import type { EffectConfig } from '@typedefs/instrument';
import { EffectRegistry } from '../EffectRegistry';

EffectRegistry.register({
  id: 'Tumult',
  name: 'Tumult',
  category: 'wasm',
  group: 'Texture',
  loadMode: 'eager',

  create: async (c: EffectConfig) => {
    const { TumultEffect } = await import('@engine/effects/TumultEffect');
    const p = c.parameters;
    return new TumultEffect({
      noiseGain:       Number(p.noiseGain       ?? -10.0),
      mix:             Number(p.mix             ?? 0.5),
      noiseMode:       Number(p.noiseMode       ?? 0),
      sourceMode:      Number(p.sourceMode      ?? 0),
      switchBranch:    Number(p.switchBranch    ?? 0),
      duckThreshold:   Number(p.duckThreshold   ?? -20.0),
      duckAttack:      Number(p.duckAttack      ?? 0),
      duckRelease:     Number(p.duckRelease     ?? 15.0),
      followThreshold: Number(p.followThreshold ?? -20.0),
      followAttack:    Number(p.followAttack    ?? 0),
      followRelease:   Number(p.followRelease   ?? 15.0),
      followAmount:    Number(p.followAmount    ?? 0.104),
      clipAmount:      Number(p.clipAmount      ?? 0.497),
      hpEnable:        Number(p.hpEnable        ?? 0),
      hpFreq:          Number(p.hpFreq          ?? 888.5),
      hpQ:             Number(p.hpQ             ?? 0.7),
      peak1Enable:     Number(p.peak1Enable     ?? 0),
      peak1Type:       Number(p.peak1Type       ?? 0),
      peak1Freq:       Number(p.peak1Freq       ?? 20),
      peak1Gain:       Number(p.peak1Gain       ?? -0.19),
      peak1Q:          Number(p.peak1Q          ?? 0.7),
      peak2Enable:     Number(p.peak2Enable     ?? 0),
      peak2Freq:       Number(p.peak2Freq       ?? 600),
      peak2Gain:       Number(p.peak2Gain       ?? 1.0),
      peak2Q:          Number(p.peak2Q          ?? 1.0),
      peak3Enable:     Number(p.peak3Enable     ?? 0),
      peak3Type:       Number(p.peak3Type       ?? 1),
      peak3Freq:       Number(p.peak3Freq       ?? 2500),
      peak3Gain:       Number(p.peak3Gain       ?? 1.0),
      peak3Q:          Number(p.peak3Q          ?? 1.0),
      lpEnable:        Number(p.lpEnable        ?? 0),
      lpFreq:          Number(p.lpFreq          ?? 8500),
      lpQ:             Number(p.lpQ             ?? 0.7),
      sampleIndex:     Number(p.sampleIndex     ?? 0),
      playerStart:     Number(p.playerStart     ?? 0),
      playerEnd:       Number(p.playerEnd       ?? 1),
      playerFade:      Number(p.playerFade      ?? 0.01),
      playerGain:      Number(p.playerGain      ?? 0),
      wet: c.wet / 100,
    });
  },

  getDefaultParameters: () => ({
    noiseGain: -10.0, mix: 0.5, noiseMode: 0, sourceMode: 0, switchBranch: 0,
    duckThreshold: -20.0, duckAttack: 0, duckRelease: 15.0,
    followThreshold: -20.0, followAttack: 0, followRelease: 15.0, followAmount: 0.104,
    clipAmount: 0.497,
    hpEnable: 0, hpFreq: 888.5, hpQ: 0.7,
    peak1Enable: 0, peak1Type: 0, peak1Freq: 20, peak1Gain: -0.19, peak1Q: 0.7,
    peak2Enable: 0, peak2Freq: 600, peak2Gain: 1.0, peak2Q: 1.0,
    peak3Enable: 0, peak3Type: 1, peak3Freq: 2500, peak3Gain: 1.0, peak3Q: 1.0,
    lpEnable: 0, lpFreq: 8500, lpQ: 0.7,
    sampleIndex: 0, playerStart: 0, playerEnd: 1, playerFade: 0.01, playerGain: 0,
  }),
});
