/**
 * A SID's player clock: how often the C64 calls its music player. A SID tune
 * advances one step every whole number of player calls (VIC raster IRQ at the
 * PAL / NTSC frame rate, or a CIA timer the tune programs itself), so the call
 * rate is the unit its tempo is made of - like a module's ticks.
 *
 * WebSID counts IRQ handler entries (emu_get_irq_calls) and stamps the system
 * cycle of the latest one (emu_get_irq_last_cycle), third-party/websid "DEViLBOX:"
 * changes. The render samples both after every chunk; the steady rate is read
 * here, past the tune's start-up (an RSID runs the kernal's 60 Hz timer before
 * it installs its own).
 *
 * Pure.
 */

/** WebSID's player call counter after a render chunk. */
export interface PlayerCallSample {
  /** IRQ handler entries since the tune started. */
  calls: number;
  /** System cycle (uint32) of the latest entry. */
  lastCallCycle: number;
}

/** The share of the render skipped before the rate is read (the tune's start-up). */
export const PLAYER_CLOCK_SETTLE_FRACTION = 0.2;
/** The two halves of the read window must agree this closely, or the rate is not steady. */
export const PLAYER_CLOCK_STEADY_TOLERANCE = 0.001;
/** Fewer calls than this in the window say nothing. */
const MIN_CALLS = 50;

function periodCycles(a: PlayerCallSample, b: PlayerCallSample): number | undefined {
  const calls = b.calls - a.calls;
  if (calls < MIN_CALLS / 2) return undefined;
  return ((b.lastCallCycle - a.lastCallCycle) >>> 0) / calls;
}

/**
 * The tune's steady player call rate in Hz, or undefined when the tune makes
 * no steady IRQ calls (no player IRQ, a rate that changes over the render).
 */
export function steadyPlayerCallHz(samples: PlayerCallSample[], clockHz: number): number | undefined {
  if (!(clockHz > 0) || samples.length < 3) return undefined;
  const tail = samples.slice(Math.floor(samples.length * PLAYER_CLOCK_SETTLE_FRACTION));
  const first = tail[0], mid = tail[Math.floor(tail.length / 2)], last = tail[tail.length - 1];
  if (last.calls - first.calls < MIN_CALLS) return undefined;
  const whole = periodCycles(first, last);
  const a = periodCycles(first, mid), b = periodCycles(mid, last);
  if (!whole || !a || !b || Math.abs(a - b) / whole > PLAYER_CLOCK_STEADY_TOLERANCE) return undefined;
  return clockHz / whole;
}
