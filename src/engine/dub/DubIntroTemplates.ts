/**
 * DubIntroTemplates — classic dub mix intro sequences.
 *
 * Messian Dread (Dubroom Tutorial, Chapter 31) describes 5 standard ways
 * to start a dub version. Each template is a timed sequence of moves
 * that fire automatically, giving the mix a professional dub-style opening.
 *
 * Templates use beat-relative timing so they adapt to any BPM.
 */

export interface DubIntroStep {
  /** Beat offset from template start (0 = immediate) */
  beat: number;
  /** Move ID to fire */
  moveId: string;
  /** Duration in beats (for hold moves) */
  holdBeats?: number;
  /** Optional per-move params */
  params?: Record<string, number>;
}

export interface DubIntroTemplate {
  id: string;
  name: string;
  description: string;
  /** Total duration in beats */
  totalBeats: number;
  steps: DubIntroStep[];
}

/**
 * Template A (Classic): Drum roll → skanks → bass drops → drums drop.
 * Standard dub version opening — builds from rhythm to full arrangement.
 */
const CLASSIC: DubIntroTemplate = {
  id: 'classic',
  name: 'Classic',
  description: 'Drum roll → echo throws → bass drops in → full mix',
  totalBeats: 16,
  steps: [
    // Start with echo throws on drums
    { beat: 0,  moveId: 'echoThrow', holdBeats: 2 },
    { beat: 2,  moveId: 'springSlam' },
    { beat: 4,  moveId: 'echoThrow', holdBeats: 2 },
    // Filter sweep to build tension
    { beat: 6,  moveId: 'eqSweep', holdBeats: 2 },
    // Spring kick for impact
    { beat: 8,  moveId: 'springKick' },
    // Ghost reverb for spacey breakdown
    { beat: 10, moveId: 'ghostReverb', holdBeats: 2 },
    // Final spring slam for the drop
    { beat: 14, moveId: 'springSlam' },
    { beat: 15, moveId: 'springKick' },
  ],
};

/**
 * Template B (Tension): Slow build with lo-fi degradation.
 * Drum roll → bass only → instruments flash in/out.
 */
const TENSION: DubIntroTemplate = {
  id: 'tension',
  name: 'Tension',
  description: 'Lo-fi degradation → filter drops → explosive release',
  totalBeats: 16,
  steps: [
    // Start with voltage starve
    { beat: 0,  moveId: 'voltageStarve', holdBeats: 4, params: { targetBits: 4 } },
    // Filter drop to cut the highs
    { beat: 4,  moveId: 'filterDrop', holdBeats: 4 },
    // Echo build to ramp intensity
    { beat: 8,  moveId: 'echoThrow', holdBeats: 2 },
    { beat: 10, moveId: 'echoThrow', holdBeats: 2 },
    // Ring mod for metallic texture
    { beat: 12, moveId: 'ringMod', holdBeats: 2 },
    // Spring kick for the release
    { beat: 14, moveId: 'springKick' },
    { beat: 15, moveId: 'springSlam' },
  ],
};

/**
 * Template C (Spacey): Wet reverb intro → bass drum hits → full.
 * "Hear only the wet reverb of the accompaniment" — Dubroom Ch.31.
 */
const SPACEY: DubIntroTemplate = {
  id: 'spacey',
  name: 'Spacey',
  description: 'Ghost reverb → spring kicks → phaser wash → drop',
  totalBeats: 16,
  steps: [
    // Ghost reverb — only wet signal
    { beat: 0,  moveId: 'ghostReverb', holdBeats: 6 },
    // Siren in the background
    { beat: 2,  moveId: 'dubSiren', holdBeats: 4 },
    // Spring kicks to establish pulse
    { beat: 6,  moveId: 'springKick' },
    { beat: 8,  moveId: 'springKick' },
    // EQ sweep for movement
    { beat: 8,  moveId: 'eqSweep', holdBeats: 4 },
    // Echo throw for the transition
    { beat: 12, moveId: 'echoThrow', holdBeats: 2 },
    // Final slam into the mix
    { beat: 15, moveId: 'springSlam' },
  ],
};

/**
 * Template D (Horns): Space echo on everything, strategic mutes.
 * Inspired by the horn-heavy dub mixes of King Tubby.
 */
const HORNS: DubIntroTemplate = {
  id: 'horns',
  name: 'Horns',
  description: 'Echo-drenched opening → stabs → spring thunder',
  totalBeats: 16,
  steps: [
    // Heavy echo from the start
    { beat: 0,  moveId: 'echoThrow', holdBeats: 4 },
    // Dub stab hits
    { beat: 4,  moveId: 'dubStab' },
    { beat: 6,  moveId: 'dubStab' },
    // Spring slam for thunder
    { beat: 8,  moveId: 'springSlam' },
    // More echo + EQ sweep combo
    { beat: 8,  moveId: 'echoThrow', holdBeats: 4 },
    { beat: 10, moveId: 'eqSweep', holdBeats: 4 },
    // Stab then kick for the drop
    { beat: 14, moveId: 'dubStab' },
    { beat: 15, moveId: 'springKick' },
  ],
};

/**
 * Template E (Space Echo): All through echo, strategic (un)muting.
 * "All channels through the space echo" — Dubroom Ch.31.
 */
const SPACE_ECHO: DubIntroTemplate = {
  id: 'spaceEcho',
  name: 'Space Echo',
  description: 'Full echo wash → delay time throws → crescendo',
  totalBeats: 16,
  steps: [
    // Echo throw to drench everything
    { beat: 0,  moveId: 'echoThrow', holdBeats: 4 },
    // Delay time manipulation
    { beat: 4,  moveId: 'delayTimeThrow', holdBeats: 2 },
    // More echo with different timing
    { beat: 6,  moveId: 'echoThrow', holdBeats: 2 },
    // Tape wobble for movement
    { beat: 8,  moveId: 'tapeWobble', holdBeats: 4 },
    // Echo throw + delay time for climax
    { beat: 12, moveId: 'echoThrow', holdBeats: 2 },
    { beat: 12, moveId: 'delayTimeThrow', holdBeats: 2 },
    // Spring slam for the big finish
    { beat: 14, moveId: 'springSlam' },
    { beat: 15, moveId: 'springKick' },
  ],
};

export const DUB_INTRO_TEMPLATES: Record<string, DubIntroTemplate> = {
  classic: CLASSIC,
  tension: TENSION,
  spacey: SPACEY,
  horns: HORNS,
  spaceEcho: SPACE_ECHO,
};

export const DUB_INTRO_TEMPLATE_IDS = Object.keys(DUB_INTRO_TEMPLATES);
