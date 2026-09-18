/**
 * Which intentions each dub move can serve (Gate E).
 *
 * Tagged per MOVE rather than per rule: `echoThrow` appears in five rules
 * (percussion on bar 3, skank on the offbeat, lead, transient-triggered,
 * answer-shaped) and what it can express does not change between them. One
 * map, so Gate F's gesture engine and Gate H's move choice read the same
 * affordances instead of each inventing their own.
 *
 * A move may serve several intentions — `filterDrop` both drops and marks a
 * transition — and the intentions it does NOT serve are the useful half: a
 * `springSlam` cannot create SPACE, however the dice fall, because it adds to
 * the wash rather than clearing it.
 *
 * REST is deliberately absent from every entry: resting is not something you
 * press, it is the decision not to press anything. A move tagged REST would
 * re-create the exact bug Gate E exists to remove.
 *
 * RESET is absent for a different reason. When feedback is at the ceiling the
 * answer is to LET GO — release what is held and let the tail decay — not to
 * fire something else at a mix that is already running away. It is served by
 * releasing gestures, so no move claims it, and `movesForIntention('RESET')`
 * correctly returns nothing.
 */

import type { Intention } from './performanceContext';

/**
 * Intentions each move can serve.
 *
 * ACCENT      — mark something that is about to sound.
 * ANSWER      — reply to what the player just did.
 * SPACE       — take something away so what is ringing can be heard.
 * BUILD       — accumulate toward an edge.
 * DROP        — remove the mix, leave the tail.
 * TEXTURE     — colour what is already there.
 * TRANSITION  — mark a seam in the arrangement.
 * RESET       — pull energy back when feedback is at the ceiling.
 */
export const MOVE_INTENTIONS: Readonly<Record<string, readonly Intention[]>> = {
  // Throws — the performer's sentence-level punctuation.
  echoThrow:          ['ACCENT', 'ANSWER', 'TEXTURE'],
  channelThrow:       ['ACCENT', 'ANSWER'],
  skankEchoThrow:     ['ACCENT', 'ANSWER', 'TEXTURE'],
  skankFloatThrow:    ['ACCENT', 'TEXTURE'],
  dubStab:            ['ACCENT', 'ANSWER'],
  snareCrack:         ['ACCENT'],
  springKick:         ['ACCENT'],
  springSlam:         ['ACCENT', 'TEXTURE'],
  delayTimeThrow:     ['ACCENT', 'TRANSITION'],
  tubbyScream:        ['ACCENT', 'TRANSITION'],

  // Builds — energy accumulating toward a seam.
  hpfRise:            ['BUILD', 'TRANSITION'],
  radioRiser:         ['BUILD', 'TRANSITION'],
  echoBuildUp:        ['BUILD'],
  subSwell:           ['BUILD', 'TEXTURE'],
  subHarmonic:        ['BUILD', 'TEXTURE'],
  eqSweep:            ['BUILD', 'TEXTURE'],
  oscBass:            ['BUILD', 'TEXTURE'],

  // Drops and seams — taking the mix away.
  filterDrop:         ['DROP', 'TRANSITION'],
  masterDrop:         ['DROP'],
  versionDrop:        ['DROP', 'TRANSITION'],
  riddimSection:      ['DROP', 'SPACE'],
  tapeStop:           ['TRANSITION', 'DROP'],
  transportTapeStop:  ['TRANSITION', 'DROP'],
  channelMute:        ['SPACE', 'DROP', 'ANSWER'],

  // Space is made by TAKING SOMETHING AWAY, and most often by firing nothing
  // at all. `ghostReverb` and `sonarPing` were tagged SPACE and neither
  // creates any: the ghost replaces a dry channel with a full wash (wet cost
  // 0.75) and the ping adds a sound. With them listed, a performer that
  // decided it wanted space went and fired something — the Gate N1 simulator
  // measured the restrained persona firing MORE than the restless one because
  // of it. They are texture, which is what they sound like.
  ghostReverb:        ['TEXTURE'],
  sonarPing:          ['TEXTURE'],

  // Texture — colouring what is already playing.
  madProfPingPong:    ['TEXTURE'],
  ringMod:            ['TEXTURE'],
  voltageStarve:      ['TEXTURE'],
  crushBass:          ['TEXTURE'],
  combSweep:          ['TEXTURE', 'BUILD'],
  stereoDoubler:      ['TEXTURE'],
  tapeWobble:         ['TEXTURE', 'TRANSITION'],
  reverseEcho:        ['TEXTURE', 'TRANSITION'],
  backwardReverb:     ['TEXTURE', 'TRANSITION'],
  dubSiren:           ['ACCENT', 'TRANSITION'],
  toast:              ['ACCENT', 'TEXTURE'],

  // Delay character changes — they re-colour the tail and mark a seam when
  // they land on one. None of them are an accent: changing the delay time
  // does not itself put anything in the mix.
  delayPresetDotted:  ['TEXTURE', 'TRANSITION'],
  delayPresetTriplet: ['TEXTURE', 'TRANSITION'],
  delayPreset380:     ['TEXTURE', 'TRANSITION'],
  delayPresetQuarter: ['TEXTURE', 'TRANSITION'],
  delayPreset8th:     ['TEXTURE', 'TRANSITION'],
  delayPreset16th:    ['TEXTURE', 'TRANSITION'],
  delayPresetDoubler: ['TEXTURE', 'TRANSITION'],
};

/**
 * Can this move serve this intention?
 *
 * An UNTAGGED move answers `false` for every intention except TEXTURE. That
 * is deliberate: a new move with no declared affordance should be available
 * for colour and nothing else until someone decides what it expresses, rather
 * than silently qualifying for DROP and reshaping a version.
 */
export function moveServes(moveId: string, intention: Intention): boolean {
  const tags = MOVE_INTENTIONS[moveId];
  if (!tags) return intention === 'TEXTURE';
  return tags.includes(intention);
}

/** Every move that can serve an intention. */
export function movesForIntention(intention: Intention): readonly string[] {
  return Object.keys(MOVE_INTENTIONS).filter(id => moveServes(id, intention));
}
