/**
 * Auto Dub personas — each is a "dub legend" voicing applied as:
 *   - weight multipliers over the base rule table (emphasises signature moves)
 *   - default intensity (Tubby = punchy mid, Perry = chaotic high, Jammy = sparse)
 *   - optional per-move param overrides (e.g. Scientist longer throw lengths)
 *   - optional hard budget cap (Jammy clamps to 1 move/bar for minimalism)
 *   - optional variance (Perry injects randomness into bar-phase gates)
 *   - matching bus character preset (applied when the user confirms in UI;
 *     Auto Dub itself does NOT silently clobber the user's bus settings)
 *   - phraseArcShape: controls the 16-bar intensity envelope
 *   - minBarsBetweenFires: global rest between any two AutoDub gestures
 *
 * Weight multiplier defaults to 1.0 when a move isn't listed — so a persona
 * only needs to enumerate moves it wants to emphasise or suppress. Applied
 * as `baseWeight * persona.weights[moveId] ?? 1.0`.
 */

import type { AutoDubPersonaId } from '@/stores/useDubStore';
import type { DubBusSettings } from '@/types/dub';
import type { PhraseArcShape } from './AutoDub';

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
  /** 16-bar intensity arc shape. Controls how firing probability rises and falls
   *  over the phrase cycle — giving each persona a characteristic phrasing feel. */
  phraseArcShape?: PhraseArcShape;
  /** Minimum bars between any two AutoDub fires. Enforces "breathing room"
   *  so moves don't stack on every tick. Persona-specific: Perry = 0.25,
   *  Jammy = 3.0. Default 1.0 when not set. */
  minBarsBetweenFires?: number;
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
    phraseArcShape: 'standard',
    minBarsBetweenFires: 1.0,
  },

  tubby: {
    id: 'tubby',
    label: 'King Tubby',
    description: 'Echo throws on snares, bass-channel mutes on bar edges, Altec Big-Knob HPF sweeps, sonar pings on transitions. Deliberate and precise.',
    suggestedCharacterPreset: 'tubby',
    intensityDefault: 0.55,
    phraseArcShape: 'standard',     // gradual build, sustained peak, gentle decay
    minBarsBetweenFires: 1.5,       // deliberate — waits between each move
    weights: {
      hpfRise:           2.0,   // research: Tubby's PRIMARY move — stepping the Altec filter up
      tubbyScream:       1.8,
      delayPreset380:    1.7,   // 380ms — THE Tubby canonical chord delay
      combSweep:         1.6,   // liquid comb sweep on drums is THE Tubby signature
      echoThrow:         1.5,
      channelMute:       1.5,
      sonarPing:         1.6,   // sonar transition pings — very Tubby
      springSlam:        1.3,   // spring slams (raised from 0.5)
      versionDrop:       1.4,   // classic "drop the band" technique
      tapeWobble:        1.4,   // RE-201 tape wow/flutter
      delayTimeThrow:    1.3,   // pitch whoosh on phrase changes
      masterDrop:        1.2,
      filterDrop:        1.1,
      snareCrack:        1.3,
      radioRiser:        1.2,   // transition filler — Tubby used these
      ghostReverb:       0.7,   // occasional
      echoBuildUp:       0.8,
      springKick:        0.4,   // not primary for Tubby
      tapeStop:          0.5,
      backwardReverb:    0.2,
      reverseEcho:       0.3,
      dubSiren:          0.6,
      ringMod:           0.1,   // NOT a Tubby technique
      voltageStarve:     0.2,
      madProfPingPong:   0.3,
    },
    paramOverrides: {
      echoThrow:   { throwBeats: 0.5, feedbackBoost: 0.08 },  // tight, precise Tubby throws
      hpfRise:     { peakHz: 3000, holdMs: 800 },              // the "all the way up" gesture
      sonarPing:   { freq: 900, durationMs: 150, level: 0.9 }, // Tubby's crisp sonar
      versionDrop: { holdBars: 2 },
    },
    variance: 0.0,
    signatureMove: 'hpfRise',
  },

  scientist: {
    id: 'scientist',
    label: 'Scientist',
    description: 'Maximum echo density, backward sounds, resonant EQ sweeps, precise mid-scoop drops. Experimental and exact.',
    suggestedCharacterPreset: 'scientist',
    intensityDefault: 0.6,
    phraseArcShape: 'sharp',        // fast attack, long sustained peak
    minBarsBetweenFires: 1.0,
    weights: {
      echoBuildUp:       2.0,   // THE Scientist move — slow feedback swell
      reverseEcho:       1.6,   // backward sounds are very Scientist
      backwardReverb:    1.5,   // backward reverb — signature reverse effect
      ghostReverb:       1.5,   // submersion in reverb — Scientist drowned everything
      eqSweep:           1.6,   // resonant return EQ sweep — very Scientist
      springSlam:        1.6,
      filterDrop:        1.2,
      echoThrow:         1.3,
      subSwell:          1.2,
      delayPresetQuarter: 1.2,  // grid-locked quarter-note echo
      delayTimeThrow:    1.1,
      masterDrop:        1.0,
      versionDrop:       1.2,
      tubbyScream:       0.4,   // not really his style
      dubSiren:          0.5,
      tapeStop:          0.8,
      hpfRise:           0.7,   // less filter-sweeping than Tubby
      combSweep:         0.8,
      ringMod:           0.3,
    },
    paramOverrides: {
      echoThrow:   { throwBeats: 4, feedbackBoost: 0.25 },   // long Scientist tails
      echoBuildUp: { feedback: 0.85 },
      combSweep:   { amount: 0.80, rateHz: 0.6, depthMs: 9 },
      eqSweep:     { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 },
      ghostReverb: {},
      versionDrop: { holdBars: 4 },
    },
    variance: 0.05,
    signatureMove: 'echoBuildUp',
    densityBias: 0.5,
  },

  perry: {
    id: 'perry',
    label: 'Lee "Scratch" Perry',
    description: 'Chaos: spring tank abuse, alien ring mod, backward sounds, rapid-fire gestures. High variance. Everything through everything.',
    suggestedCharacterPreset: 'perry',
    intensityDefault: 0.7,
    phraseArcShape: 'flat',         // constant chaos — no arc, always at peak
    minBarsBetweenFires: 0.25,      // rapid-fire — Perry fired effects constantly
    weights: {
      springKick:        2.4,   // research: Perry physically kicked the spring tank
      springSlam:        2.0,   // spring crashes are Perry's primary texture
      reverseEcho:       1.8,   // backward sounds throughout
      backwardReverb:    1.6,
      dubSiren:          1.5,
      channelThrow:      1.5,
      sonarPing:         1.5,
      tapeWobble:        1.3,   // Perry's 7.5 ips tape wow/flutter
      ringMod:           1.6,   // RAISED: alien metallic textures ARE Perry
      voltageStarve:     1.4,   // RAISED: Black Ark gear degradation
      delayTimeThrow:    1.2,   // pitch whoosh on phrase turns
      tubbyScream:       1.1,
      masterDrop:        1.0,
      ghostReverb:       0.9,
      versionDrop:       0.8,   // Perry kept everything in — rarely dropped
      eqSweep:           0.7,
      echoThrow:         0.8,
      tapeStop:          0.5,
      snareCrack:        0.9,
      filterDrop:        0.6,
      hpfRise:           0.4,   // not a Perry move
      combSweep:         0.8,
    },
    paramOverrides: {
      springKick:    { amount: 1.8, holdMs: 900 },                  // HARD spring kick
      ringMod:       { freq: 120, waveform: 1, amount: 0.85 },      // metallic alien square wave
      voltageStarve: { targetBits: 4 },                             // extreme degradation
      tapeWobble:    { depthMs: 55, rateHz: 3.5 },                  // extreme wow/flutter
    },
    variance: 0.35,
    signatureMove: 'springKick',
  },

  madProfessor: {
    id: 'madProfessor',
    label: 'Mad Professor',
    description: 'Patient, lush. Long ghost reverb tails, Ariwa SDE-3000 ping-pong, slow EQ sweeps, plate reverb. Polished and unhurried.',
    suggestedCharacterPreset: 'madProfessor',
    intensityDefault: 0.5,
    phraseArcShape: 'slow',         // very gradual build, patient — no decay
    minBarsBetweenFires: 2.0,       // unhurried — waits for the right moment
    weights: {
      ghostReverb:       2.2,   // THE Mad Professor signature
      madProfPingPong:   2.0,   // Ariwa SDE-3000 L/R asymmetric stereo
      echoBuildUp:       1.6,   // patient slow builds
      subSwell:          1.6,
      stereoDoubler:     1.4,
      echoThrow:         1.2,
      masterDrop:        1.3,
      delayPresetDotted: 1.4,   // dotted 8th — Ariwa timing
      eqSweep:           1.3,   // EQ sweep on return — very Mad Professor
      versionDrop:       1.3,   // long reverb drops
      reverseEcho:       0.5,
      filterDrop:        0.7,
      tapeStop:          0.3,
      tubbyScream:       0.3,
      dubSiren:          0.4,
      ringMod:           0.3,
      hpfRise:           0.6,   // occasional HPF
      springKick:        0.5,
      voltageStarve:     0.2,
    },
    paramOverrides: {
      echoThrow:   { throwBeats: 6, feedbackBoost: 0.10 },          // long Ariwa echo tail
      ghostReverb: {},
      versionDrop: { holdBars: 4 },                                  // long lush drop
      eqSweep:     { startHz: 500, endHz: 4000, gain: 10, q: 3.0, sweepSec: 4.0 },
    },
    variance: 0.05,
    signatureMove: 'ghostReverb',
    densityBias: 0.3,
  },

  jammy: {
    id: 'jammy',
    label: 'Prince Jammy',
    description: 'Minimalist digital. One move per bar, phrase-opening downbeats only. Tape stops, version drops, channel mutes. Nothing fancy.',
    suggestedCharacterPreset: 'gatedFlanger',
    intensityDefault: 0.35,
    phraseArcShape: 'inverted',     // fires hard at phrase start, then silence
    minBarsBetweenFires: 3.0,       // extremely sparse — one move every 3+ bars
    budgetCap: 1,
    weights: {
      tapeStop:          2.0,
      versionDrop:       1.6,   // Jammy's digital drop is iconic
      channelMute:       1.6,
      masterDrop:        1.5,   // digital downbeat cut
      filterDrop:        1.2,
      subHarmonic:       1.2,
      delayPreset380:    1.0,   // precise 380ms grid snaps
      echoThrow:         0.6,
      hpfRise:           0.3,   // not a Jammy thing
      echoBuildUp:       0.4,
      // Fancy effects are NOT Jammy
      springKick:        0.1,
      springSlam:        0.1,
      reverseEcho:       0.05,
      backwardReverb:    0.05,
      ringMod:           0.05,
      combSweep:         0.15,
      eqSweep:           0.2,
      tubbyScream:       0.2,
      dubSiren:          0.2,
      ghostReverb:       0.3,
      voltageStarve:     0.1,
      madProfPingPong:   0.2,
      sonarPing:         0.3,
      radioRiser:        0.4,
    },
    paramOverrides: {
      tapeStop:    { holdMs: 2000 },   // hold tape stop for full 2 bars
      versionDrop: { holdBars: 4 },    // Jammy's drop was 4 bars minimum
    },
    variance: 0.0,
    signatureMove: 'tapeStop',
    densityBias: -0.6,
  },
};

export function getPersona(id: AutoDubPersonaId): AutoDubPersona {
  return AUTO_DUB_PERSONAS[id] ?? AUTO_DUB_PERSONAS.custom;
}
