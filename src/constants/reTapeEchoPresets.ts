/**
 * RE Tape Echo Presets — Classic Dub & Delay Settings
 *
 * Based on the Roland RE-150/201 tape echo used by King Tubby,
 * Lee "Scratch" Perry, Scientist, and other dub pioneers.
 *
 * Parameters:
 *   mode: 0-5 (head selection + feedback)
 *   repeatRate: 0-1 (tape speed → delay time, lower = longer delay)
 *   intensity: 0-1 (feedback amount)
 *   echoVolume: 0-1 (wet echo level)
 *   wow: 0-1 (low-frequency speed wobble)
 *   flutter: 0-1 (mid-frequency speed variation)
 *   dirt: 0-1 (high-frequency tape noise)
 *   inputBleed: 0 or 1 (record/play head crosstalk)
 *   loopAmount: 0-1 (tape loop ghost echo)
 *   playheadFilter: 0 or 1 (speed-dependent EQ)
 */

export interface RETapeEchoPreset {
  name: string;
  description: string;
  params: {
    mode: number;
    repeatRate: number;
    intensity: number;
    echoVolume: number;
    wow: number;
    flutter: number;
    dirt: number;
    inputBleed: number;
    loopAmount: number;
    playheadFilter: number;
  };
}

export const RE_TAPE_ECHO_PRESETS: RETapeEchoPreset[] = [
  // ═══════════════════════════════════════════════════════════════
  // KING TUBBY — The originator. Channel strip → RE-201 → mixing desk.
  // Characterized by rhythmic throws with heavy filtering.
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'King Tubby Throw',
    description: 'Classic dub throw — rhythmic echo with heavy tape filtering',
    params: {
      mode: 3,           // Head 1 + feedback
      repeatRate: 0.35,  // Medium-long delay
      intensity: 0.55,   // Moderate feedback — echoes decay naturally
      echoVolume: 0.85,  // Echo loud in the mix
      wow: 0.15,         // Subtle pitch wobble
      flutter: 0.1,      // Light flutter
      dirt: 0.05,        // Hint of grit
      inputBleed: 0,
      loopAmount: 0,
      playheadFilter: 1, // Head EQ ON — key to the dark filtered sound
    },
  },
  {
    name: 'Tubby Steppers',
    description: 'Tight rhythmic delay for steppers riddims',
    params: {
      mode: 0,           // Head 1 only — tight, precise
      repeatRate: 0.55,  // Faster repeat — 16th note feel
      intensity: 0.45,   // Controlled feedback
      echoVolume: 0.7,
      wow: 0.08,
      flutter: 0.05,
      dirt: 0.03,
      inputBleed: 0,
      loopAmount: 0,
      playheadFilter: 1,
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // LEE SCRATCH PERRY — Black Ark era. Psychedelic, washy, maximal.
  // Everything cranked, multiple echo layers, intentional chaos.
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Black Ark Wash',
    description: 'Perry-style psychedelic wash — dense layered echoes',
    params: {
      mode: 5,           // Both heads + feedback — maximum density
      repeatRate: 0.3,   // Long delay for spacious wash
      intensity: 0.65,   // High feedback — echoes pile up
      echoVolume: 0.9,
      wow: 0.25,         // Heavy wow for pitch drift
      flutter: 0.2,      // Pronounced flutter
      dirt: 0.15,        // Dirty tape sound
      inputBleed: 1,     // Bleed ON — extra chaos
      loopAmount: 0.2,   // Ghost echoes from tape loop
      playheadFilter: 1,
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // SCIENTIST — Precise, surgical dub mixing. Clean throws that
  // sit perfectly in the mix without overwhelming the riddim.
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Scientist Clean',
    description: 'Precise clean throws — sits in the mix perfectly',
    params: {
      mode: 3,           // Head 1 + feedback
      repeatRate: 0.4,   // Medium delay
      intensity: 0.4,    // Controlled — doesn't run away
      echoVolume: 0.65,  // Not too loud
      wow: 0.05,         // Minimal wow
      flutter: 0.03,     // Near-perfect tape
      dirt: 0,
      inputBleed: 0,
      loopAmount: 0,
      playheadFilter: 1,
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // CLASSIC PRESETS — Standard delay patterns
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Slapback',
    description: 'Short tight slapback — rocksteady vocal double',
    params: {
      mode: 0,           // Head 1 only
      repeatRate: 0.75,  // Short delay
      intensity: 0.15,   // Single repeat
      echoVolume: 0.6,
      wow: 0,
      flutter: 0,
      dirt: 0,
      inputBleed: 0,
      loopAmount: 0,
      playheadFilter: 0,
    },
  },
  {
    name: 'Dubplate Special',
    description: 'Heavy dub plate echo with tape degradation',
    params: {
      mode: 4,           // Head 2 + feedback — longer intervals
      repeatRate: 0.25,  // Very long delay
      intensity: 0.6,    // High feedback
      echoVolume: 0.8,
      wow: 0.2,
      flutter: 0.15,
      dirt: 0.1,
      inputBleed: 0,
      loopAmount: 0.15,  // Subtle ghost echo
      playheadFilter: 1,
    },
  },
  {
    name: 'Rhythm Echo',
    description: 'Two-head polyrhythmic echo pattern',
    params: {
      mode: 2,           // Both heads — creates rhythmic pattern
      repeatRate: 0.45,  // Medium
      intensity: 0.35,   // Moderate feedback
      echoVolume: 0.75,
      wow: 0.1,
      flutter: 0.08,
      dirt: 0.05,
      inputBleed: 0,
      loopAmount: 0,
      playheadFilter: 1,
    },
  },
  {
    name: 'Infinite Dub',
    description: 'Self-oscillating echo — turn down intensity to recover',
    params: {
      mode: 5,           // Both + feedback
      repeatRate: 0.35,
      intensity: 0.78,   // Near self-oscillation
      echoVolume: 0.9,
      wow: 0.3,          // Heavy wobble
      flutter: 0.25,
      dirt: 0.2,
      inputBleed: 1,
      loopAmount: 0.3,   // Lots of ghost echo
      playheadFilter: 1,
    },
  },
];
