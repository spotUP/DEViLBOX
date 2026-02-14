/**
 * SDK synth lazy-loader registrations
 *
 * Each category is loaded as a separate chunk on first use.
 * The lazy loader calls `import('./category')` which imports the module,
 * runs its top-level code (importing synth classes + calling SynthRegistry.register),
 * and the synths become available.
 */

import { SynthRegistry } from '../SynthRegistry';

// ── MAME chip synths (21 synths) ─────────────────────────────────────────────
SynthRegistry.registerLazy(
  [
    'MAMEAICA', 'MAMEASC', 'MAMEAstrocade', 'MAMEC352', 'MAMEES5503',
    'MAMEICS2115', 'MAMEK054539', 'MAMEMEA8000', 'MAMERF5C400',
    'MAMESN76477', 'MAMESNKWave', 'MAMESP0250', 'MAMETMS36XX',
    'MAMETMS5220', 'MAMETR707', 'MAMEUPD931', 'MAMEUPD933',
    'MAMEVotrax', 'MAMEYMF271', 'MAMEYMOPQ', 'MAMEVASynth',
  ],
  () => import('./mame').then(() => {}),
);

// ── Buzzmachine generators (13 synths) ───────────────────────────────────────
SynthRegistry.registerLazy(
  [
    'BuzzDTMF', 'BuzzFreqBomb', 'BuzzKick', 'BuzzKickXP', 'BuzzNoise',
    'BuzzTrilok', 'Buzz4FM2F', 'BuzzDynamite6', 'BuzzM3', 'BuzzM4',
    'Buzz3o3', 'Buzz3o3DF', 'Buzzmachine',
  ],
  () => import('./buzzmachines').then(() => {}),
);

// ── VSTBridge synths ─────────────────────────────────────────────────────────
SynthRegistry.registerLazy(
  [
    'DexedBridge', 'Vital', 'Odin2', 'Surge', 'TonewheelOrgan',
    'Melodica', 'Monique', 'Helm', 'Sorcer', 'Amsynth', 'OBXf', 'Open303',
  ],
  () => import('./vstbridge').then(() => {}),
);

// ── WAM synths ───────────────────────────────────────────────────────────────
SynthRegistry.registerLazy(
  ['WAM', 'WAMOBXd', 'WAMSynth101', 'WAMTinySynth', 'WAMFaustFlute'],
  () => import('./wam').then(() => {}),
);

// ── Misc synths (speech, JUCE WASM, special) ─────────────────────────────────
SynthRegistry.registerLazy(
  [
    'DubSiren', 'SpaceLaser', 'V2', 'V2Speech', 'Sam', 'Synare',
    'Dexed', 'OBXd', 'CZ101', 'CEM3394', 'SCSP',
    'MAMEVFX', 'VFX', 'D50', 'MAMEDOC', 'MAMERSA', 'MAMESWP30',
    'DrumKit', 'Wavetable', 'ChiptuneModule',
  ],
  () => import('./misc').then(() => {}),
);
