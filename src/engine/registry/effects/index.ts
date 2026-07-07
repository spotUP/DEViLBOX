/**
 * Effect registrations — imported eagerly at startup.
 *
 * Eager: Tone.js + custom effects, WASM effects
 * Lazy: Buzzmachine, WAM, Neural effects (loaded on first use)
 */

import { EffectRegistry } from '../EffectRegistry';

// ── Eager registrations ───────────────────────────────────────────────────
import './tonejs';
import './wasm';
import './tumult';
import './tapesimulator';

// ── Lazy: WAM 2.0 effects (11 effects) ───────────────────────────────────
EffectRegistry.registerLazy(
  [
    'WAMBigMuff', 'WAMTS9', 'WAMDistoMachine', 'WAMQuadraFuzz', 'WAMVoxAmp',
    'WAMStonePhaser', 'WAMPingPongDelay', 'WAMFaustDelay', 'WAMPitchShifter',
    'WAMGraphicEQ', 'WAMPedalboard',
  ],
  () => import('./wam').then(() => {}),
);

// ── Lazy: Neural effects ─────────────────────────────────────────────────
EffectRegistry.registerLazy(
  ['Neural'],
  () => import('./neural').then(() => {}),
);

// ── Lazy: Buzzmachine effects (22 effects) — loads the buzz WASM engine on first use ──
EffectRegistry.registerLazy(
  [
    'ArguruDistortion', 'ElakSVF', 'ElakDist2', 'JeskolaDistortion', 'GeonikOverdrive',
    'GraueSoftSat', 'WhiteNoiseStereoDist', 'CyanPhaseNotch', 'QZfilter', 'FSMPhilta',
    'JeskolaDelay', 'JeskolaCrossDelay', 'JeskolaFreeverb', 'FSMPanzerDelay', 'FSMChorus',
    'FSMChorus2', 'WhiteNoiseWhiteChorus', 'BigyoFrequencyShifter', 'GeonikCompressor',
    'LdSLimit', 'OomekExciter', 'DedaCodeStereoGain',
  ],
  () => import('./buzzmachine').then(() => {}),
);
