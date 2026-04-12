/**
 * gig.ts — Default 2-hour soak test scenario for pre-gig validation.
 *
 * Drives a realistic DJ+VJ session: load tracks to decks, crossfade between
 * them, sweep EQ/filter, cycle VJ presets, and capture telemetry snapshots.
 * One "cycle" = one track transition (~2 min). The runner loops ~60 cycles
 * for a 2-hour run, swapping deck roles each iteration.
 *
 * Usage (via tools/soak-test.ts with --scenario flag):
 *   npx tsx tools/soak-test.ts \
 *     --scenario tools/soak-scenarios/gig.ts \
 *     --duration 2 \
 *     --music-dir "/path/to/dj-tracks"
 */

export interface SoakStep {
  /** Seconds from cycle start */
  t: number;
  /** MCP action to execute */
  action?: string;
  /** Action arguments */
  args?: Record<string, unknown>;
  /** Telemetry snapshot */
  telemetry?: 'frame' | 'gpu' | 'heap';
  /** Log message */
  log?: string;
}

export interface SoakScenario {
  name: string;
  cycleDurationSec: number;
  steps: SoakStep[];
}

/**
 * Build the gig scenario. `activeSide` alternates A/B each cycle.
 * `incomingSide` is the deck being loaded and faded TO.
 */
export function buildGigScenario(activeSide: 'A' | 'B'): SoakScenario {
  const incoming = activeSide === 'A' ? 'B' : 'A';

  return {
    name: `gig-cycle-${activeSide}→${incoming}`,
    cycleDurationSec: 120,
    steps: [
      // ── Setup ────────────────────────────────────────────────
      { t: 0,   action: 'switchView', args: { view: 'dj' } },
      { t: 0,   log: `cycle start: ${activeSide}→${incoming}` },

      // Load incoming track
      { t: 2,   action: 'loadDeck', args: { side: incoming, path: '__RANDOM_TRACK__' } },

      // Start playing the active deck (if not already)
      { t: 5,   action: 'playDeck', args: { side: activeSide } },

      // ── Main mix (wait for incoming to be ready) ─────────────
      { t: 15,  action: 'playDeck', args: { side: incoming } },

      // EQ tweak on incoming
      { t: 20,  action: 'setEQ', args: { side: incoming, band: 'low', value: -6 } },
      { t: 25,  action: 'setEQ', args: { side: incoming, band: 'low', value: 0 } },

      // Crossfade: 0 = full active, 1 = full incoming
      // Ramp over ~20 seconds (4 steps)
      { t: 30,  action: 'setCrossfader', args: { value: activeSide === 'A' ? 0.25 : 0.75 } },
      { t: 35,  action: 'setCrossfader', args: { value: activeSide === 'A' ? 0.50 : 0.50 } },
      { t: 40,  action: 'setCrossfader', args: { value: activeSide === 'A' ? 0.75 : 0.25 } },
      { t: 45,  action: 'setCrossfader', args: { value: activeSide === 'A' ? 1.00 : 0.00 } },

      // Now fully on incoming — stop old deck
      { t: 48,  action: 'stopDeck', args: { side: activeSide } },

      // ── FX / filter sweep on the new active deck ─────────────
      { t: 55,  action: 'setFilter', args: { side: incoming, value: 0.3 } },
      { t: 60,  action: 'setFilter', args: { side: incoming, value: -0.2 } },
      { t: 65,  action: 'setFilter', args: { side: incoming, value: 0 } },

      // ── VJ preset cycle ──────────────────────────────────────
      { t: 70,  action: 'switchView', args: { view: 'split' } },
      { t: 72,  action: 'nextVjPreset', args: {} },
      { t: 80,  action: 'nextVjPreset', args: {} },
      { t: 90,  action: 'switchView', args: { view: 'dj' } },

      // ── Telemetry snapshot ───────────────────────────────────
      { t: 100, telemetry: 'frame' },
      { t: 101, telemetry: 'gpu' },
      { t: 102, telemetry: 'heap' },

      // ── Quiet tail (let audio play normally) ─────────────────
      { t: 110, log: 'cycle tail — waiting' },
    ],
  };
}
