/**
 * Auto Dub personas — each is a "dub legend" voicing applied as:
 *   - weight multipliers over the base rule table (emphasises signature moves)
 *   - default intensity (Tubby = punchy mid, Perry = chaotic high, Jammy = sparse)
 *   - optional per-move param overrides (e.g. Scientist longer throw lengths)
 *   - optional hard budget cap (Jammy clamps to 1 move/bar for minimalism)
 *   - optional variance (Perry injects randomness into bar-phase gates)
 *   - matching bus character preset (applied when the user confirms in UI;
 *     Auto Dub itself does NOT silently clobber the user's bus settings)
 *
 * Weight multiplier defaults to 1.0 when a move isn't listed — so a persona
 * only needs to enumerate moves it wants to emphasise or suppress. Applied
 * as `baseWeight * persona.weights[moveId] ?? 1.0`.
 */

import type { AutoDubPersonaId } from '@/stores/useDubStore';
import type { DubBusSettings } from '@/types/dub';

export interface AutoDubPersona {
  id: AutoDubPersonaId;
  label: string;
  description: string;
  /** Suggested bus character preset. `null` for Custom. UI can offer to
   *  apply this on persona change; we don't auto-apply on enable. */
  suggestedCharacterPreset: DubBusSettings['characterPreset'] | null;
  /** Baseline intensity when the user first selects this persona. */
  intensityDefault: number;
  /** Per-move weight multipliers. Unlisted moves default to 1.0. */
  weights: Record<string, number>;
  /** Hard ceiling on moves-per-bar, overriding the intensity-derived budget. */
  budgetCap?: number;
  /** 0..1 — persona-local randomness. Higher = looser bar-edge gating,
   *  more "wrong-timing" fires. Perry = 0.35, Tubby = 0 (precise). */
  variance?: number;
  /** Per-move param overrides applied at fire time. Merged OVER the move's
   *  defaults but UNDER caller-supplied params. */
  paramOverrides?: Record<string, Record<string, number>>;
  /** Move that best represents this persona when auditioning — fired once
   *  on click of the audition button so the user can hear the character
   *  without enabling Auto Dub. */
  signatureMove: string;
  /**
   * Note-density bias. Range -1..+1, default 0 (neutral).
   *   > 0 → persona fires MORE during dense passages (Scientist's builds
   *     come alive when notes are piling up)
   *   < 0 → persona fires MORE during sparse passages (Jammy's downbeat
   *     hits land best when the pattern breathes)
   *   = 0 → density has no effect (Tubby, Perry, Custom)
   * Effect is clamped to a 0.25× … 1.75× weight multiplier so extremes
   * don't zero-out or bloom any rule to dominance. See computeDensityByRole
   * + the density-mult logic in chooseMove.
   */
  densityBias?: number;
}

export const AUTO_DUB_PERSONAS: Record<AutoDubPersonaId, AutoDubPersona> = {
  custom: {
    id: 'custom',
    label: 'Custom',
    description: 'Flat weights, no bias. User-tuned.',
    suggestedCharacterPreset: null,
    intensityDefault: 0.5,
    weights: {},
    signatureMove: 'echoThrow',
  },

  tubby: {
    id: 'tubby',
    label: 'King Tubby',
    description: 'Echo throws on snares, bass-channel mutes on bar edges, Altec Big-Knob HPF sweeps. Punchy, precise.',
    suggestedCharacterPreset: 'tubby',
    intensityDefault: 0.55,
    weights: {
      hpfRise:           2.0,   // research: Tubby's PRIMARY move — stepping the Altec filter up
      echoThrow:         1.5,
      channelMute:       1.5,
      filterDrop:        1.0,   // secondary — LPF drops less common than HPF rises
      tubbyScream:       1.8,
      snareCrack:        1.3,
      radioRiser:        1.1,
      delayPreset380:    1.6,   // 380ms — THE Tubby chord delay timing
      delayTimeThrow:    1.3,   // pitch whoosh on phrase changes
      masterDrop:        1.2,   // dramatic dry mute with echo tail
      tapeWobble:        1.4,   // RE-201 tape wow/flutter — Tubby's mechanical character
      combSweep:         1.6,   // research: Tubby's liquid comb-sweep on drums is THE signature
      tapeStop:          0.5,
      backwardReverb:    0.2,
      reverseEcho:       0.3,
      dubSiren:          0.6,
      echoBuildUp:       0.8,
      springKick:        0.4,   // occasional spring kicks, not primary
      springSlam:        0.5,
    },
    variance: 0.0,
    signatureMove: 'hpfRise',   // updated — this is the Big Knob gesture
  },

  scientist: {
    id: 'scientist',
    label: 'Scientist',
    description: 'Longer echo tails, delay feedback swells, precise mid-scoop drops. Cleaner than Tubby.',
    suggestedCharacterPreset: 'scientist',
    intensityDefault: 0.6,
    weights: {
      echoBuildUp:       1.8,
      springSlam:        1.6,
      filterDrop:        1.2,
      echoThrow:         1.3,
      subSwell:          1.2,
      delayPresetQuarter:1.2,   // grid-locked quarter-note echo
      delayTimeThrow:    1.1,
      masterDrop:        1.0,
      dubSiren:          0.5,
      tapeStop:          0.8,
      tubbyScream:       0.4,
    },
    paramOverrides: {
      echoThrow:   { throwBeats: 4, feedbackBoost: 0.25 },
      echoBuildUp: { feedback: 0.85 },
    },
    variance: 0.05,
    signatureMove: 'echoBuildUp',
    // Scientist's sprawl belongs on dense passages — builds, delay swells,
    // and mid-scoop drops sound weak over a sparse pattern and epic over
    // a busy one.
    densityBias: 0.5,
  },

  perry: {
    id: 'perry',
    label: 'Lee "Scratch" Perry',
    description: 'Chaos: kickable spring crashes, phaser + reverse echo, room sounds as percussion. High variance.',
    suggestedCharacterPreset: 'perry',
    intensityDefault: 0.7,
    weights: {
      springKick:        2.2,   // research: Perry physically kicked the spring tank — this IS the Perry move
      springSlam:        1.8,   // spring crashes are Perry's primary texture
      reverseEcho:       1.8,
      backwardReverb:    1.6,
      dubSiren:          1.5,
      channelThrow:      1.5,
      sonarPing:         1.5,
      tubbyScream:       1.1,
      tapeWobble:        1.3,   // Perry's 7.5 ips tape wow/flutter
      combSweep:         0.8,
      masterDrop:        1.0,
      delayTimeThrow:    1.2,   // pitch whoosh on phrase turns
      echoThrow:         0.8,
      tapeStop:          0.5,
      snareCrack:        0.9,
      filterDrop:        0.6,
      voltageStarve:     0.8,   // tape degradation — Perry's 7.5 ips stacked character
      ringMod:           0.6,   // metallic room-noise character
    },
    variance: 0.35,
    signatureMove: 'springKick',  // the definitive Perry gesture
  },

  madProfessor: {
    id: 'madProfessor',
    label: 'Mad Professor',
    description: 'Hi-fi, wide. Long reverb swells, ghost reverb tails, PCM-70 lushness. Polished, unhurried.',
    suggestedCharacterPreset: 'madProfessor',
    intensityDefault: 0.5,
    weights: {
      ghostReverb:       2.0,   // research: Mad Prof's signature — lush long reverb decay
      madProfPingPong:   1.8,   // research: Ariwa SDE-3000 L/R asymmetric stereo
      stereoDoubler:     1.4,   // secondary width
      subSwell:          1.6,
      echoBuildUp:       1.4,   // builds toward a dense swell, patient timing
      echoThrow:         1.2,
      springSlam:        1.0,
      masterDrop:        1.2,   // dramatic PCM-70 reverb-only moment
      delayPresetDotted: 1.3,   // dotted 8th is very typical Ariwa timing
      delayTimeThrow:    1.0,
      filterDrop:        0.7,
      tapeStop:          0.3,
      tubbyScream:       0.3,
      reverseEcho:       0.5,
      dubSiren:          0.4,
      subHarmonic:       1.0,   // sub presence — key Mad Prof texture
    },
    paramOverrides: {
      echoThrow:   { throwBeats: 6, feedbackBoost: 0.1 },  // long Ariwa echo tail
      ghostReverb: {},
    },
    variance: 0.05,
    signatureMove: 'ghostReverb',  // the defining Mad Professor texture
    densityBias: 0.3,  // slightly favors dense passages like Scientist, but less extreme
  },

  jammy: {
    id: 'jammy',
    label: 'Prince Jammy',
    description: 'Minimalist digital. One move per bar, precise downbeats, tapeStop phrase edges.',
    suggestedCharacterPreset: 'gatedFlanger',
    intensityDefault: 0.35,
    budgetCap: 1,
    weights: {
      tapeStop:          1.8,
      filterDrop:        1.2,
      channelMute:       1.4,
      subHarmonic:       1.2,
      masterDrop:        1.3,   // Jammy's classic digital downbeat cut
      delayPreset380:    1.0,   // precise 380ms grid snaps
      echoThrow:         0.6,
      dubSiren:          0.3,
      tubbyScream:       0.3,
      reverseEcho:       0.3,
    },
    variance: 0.0,
    signatureMove: 'tapeStop',
    // Jammy's minimalism lands best on sparse passages — a downbeat
    // tapeStop in a busy bar disappears, but in a breathy one it punches
    // through.
    densityBias: -0.6,
  },
};

export function getPersona(id: AutoDubPersonaId): AutoDubPersona {
  return AUTO_DUB_PERSONAS[id] ?? AUTO_DUB_PERSONAS.custom;
}
