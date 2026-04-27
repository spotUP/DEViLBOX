// Move-id → Tailwind bg-color class. New moves add entries here.
// Grouped by family so related moves land on similar hues:
//   primary / primary/70 → echo family
//   highlight / highlight/70 → dub stabs, one-shot delay accents
//   secondary / secondary/70 → filters, tape stop (sweep-style)
//   warning / warning/70 → siren, wobble (modulation)
//   success / success/70 → spring, toast (resonant tails)
//   error / error/70 → mute, drop, transport stop (destructive)
//   text-primary → snare / ping / click family
//   accent-primary/40 → sub / bass family (deep low end)
export const MOVE_COLOR: Record<string, string> = {
  // ── Phase 1 moves ──
  echoThrow: 'bg-accent-primary',
  dubStab: 'bg-accent-highlight',
  hpfRise: 'bg-accent-primary',
  madProfPingPong: 'bg-accent-highlight',
  filterDrop: 'bg-accent-secondary',
  dubSiren: 'bg-accent-warning',
  springSlam: 'bg-accent-success',
  channelMute: 'bg-accent-error',
  channelThrow: 'bg-accent-primary/70',
  delayTimeThrow: 'bg-accent-highlight/70',
  tapeWobble: 'bg-accent-warning/70',
  masterDrop: 'bg-accent-error/70',
  snareCrack: 'bg-text-primary',
  tapeStop: 'bg-accent-secondary/70',
  backwardReverb: 'bg-accent-highlight',
  toast: 'bg-accent-success/70',
  transportTapeStop: 'bg-accent-error',
  // ── PR #42 moves — grouped by family ──
  reverseEcho:       'bg-accent-primary/50',    // echo family, darker
  echoBuildUp:       'bg-accent-primary/40',    // echo family, deep build
  delayPreset380:    'bg-accent-highlight/50',  // delay accent
  delayPresetDotted: 'bg-accent-highlight/40',  // delay accent, darker
  tubbyScream:       'bg-accent-warning/50',    // modulated scream → warning fam
  stereoDoubler:     'bg-accent-primary/30',    // wide echo tint
  sonarPing:         'bg-text-primary/70',      // ping family
  radioRiser:        'bg-accent-warning/40',    // sweep-riser → warning fam
  subSwell:          'bg-accent-secondary/50',  // low sweep
  oscBass:           'bg-accent-secondary/40',  // bass family, deeper
  crushBass:         'bg-accent-error/50',      // destructive bass crush
  subHarmonic:       'bg-accent-secondary/30',  // sub family, deepest
  eqSweep:           'bg-accent-highlight/40',  // sweepable EQ — highlight accent
  springKick:        'bg-accent-warning/50',    // explosive spring tank kick
  delayPresetQuarter:  'bg-accent-primary/25',  // delay preset family
  delayPreset8th:      'bg-accent-primary/25',
  delayPresetTriplet:  'bg-accent-primary/25',
  delayPreset16th:     'bg-accent-primary/25',
  delayPresetDoubler:  'bg-accent-primary/25',
  ghostReverb:         'bg-accent-highlight/30', // spectral wet-only ghost
  voltageStarve:       'bg-accent-error/30',     // lo-fi degradation
  ringMod:             'bg-accent-secondary/40', // metallic ring mod
  combSweep:           'bg-accent-secondary/80', // liquid comb sweep — same family as sweep controls
  versionDrop:         'bg-accent-error',         // full melodic drop — same as channelMute (dramatic)
  skankEchoThrow:      'bg-accent-highlight/60',  // floating offbeat echo — highlight family, semi-transparent
  riddimSection:       'bg-accent-error/70',      // bass+drums breakdown — dramatic drop, lighter than full versionDrop
};

// Hold-kind moves have a meaningful durationRows. Keep in sync with the
// kind table in parameterRouter.ts (any edit there needs a matching entry here).
export const HOLD_KINDS = new Set([
  // Phase 1 holds
  'channelMute', 'filterDrop', 'dubSiren', 'tapeWobble', 'masterDrop', 'toast',
  // PR #42 holds (moves that return a disposer)
  'tubbyScream', 'stereoDoubler', 'oscBass', 'crushBass', 'subHarmonic',
  'eqSweep', 'ghostReverb', 'voltageStarve', 'ringMod',
  // New moves
  'hpfRise', 'madProfPingPong', 'combSweep', 'tapeStop', 'transportTapeStop',
  'versionDrop',
  'skankEchoThrow',
  'riddimSection',
]);
