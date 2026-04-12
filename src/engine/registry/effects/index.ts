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
