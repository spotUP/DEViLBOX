import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sweep was reported as doing nothing. It did something, for two seconds.
 *
 * The deck lists `eqSweep` under TOGGLE — click on, click off — and the move
 * swept a +12 dB resonant peak 300 -> 3000 Hz over `sweepSec` and then
 * STOPPED ITSELF: `if (t >= 1) this.stopEQSweep()`, which restored the return
 * EQ to its prior state (gain 3, disabled). The button stayed lit; the effect
 * was already over. Reported 2026-09-22 as "sweep does something briefly and
 * stops but its a toggle so i expect it to continue until untoggled", and
 * again 2026-09-23 as "sweep does nothing" once the governor stopped masking
 * everything else.
 *
 * The return EQ itself is fine: +12 dB at 1 kHz through the settings path
 * moved the master's mid share 0.228 -> 0.296 and back (2026-09-23).
 *
 * A toggle holds. The sweep now runs to its end frequency and sits there until
 * the performer releases it, which is when the prior EQ comes back. Nothing
 * about the sweep's shape changes — only who decides when it ends.
 */
const SRC = readFileSync(join(process.cwd(), 'src/engine/dub/DubBus.ts'), 'utf-8');

const startEQSweep = (): string => {
  const start = SRC.indexOf('  startEQSweep(');
  expect(start, 'startEQSweep moved').toBeGreaterThan(-1);
  return SRC.slice(start, SRC.indexOf('\n  }\n', start));
};

describe('the EQ sweep holds until it is released', () => {
  it('does not stop itself when the sweep reaches its end', () => {
    const body = startEQSweep();
    expect(
      body,
      'the sweep ended itself at t >= 1 and restored the EQ while the toggle was still lit'
    ).not.toContain('if (t >= 1) this.stopEQSweep()');
  });

  it('still parks the peak at the end frequency rather than ticking for ever', () => {
    const body = startEQSweep();
    // The interval has to stop stepping once it has arrived; what must NOT
    // happen is the restore.
    expect(body).toContain('clearInterval');
    expect(body).toContain('t >= 1');
  });

  it('restores the prior EQ only from the releaser', () => {
    const body = startEQSweep();
    expect(body).toContain('return () => this.stopEQSweep();');
  });

  it('puts a band that was OFF back off, not on at its stored gain', () => {
    // Resting state is `enabled: false, gain: 3`. Restoring through
    // setReturnEQ alone derives enabled from gain !== 0, so every sweep left
    // the return EQ on at +3 dB (live settings, 2026-09-23).
    const stop = SRC.slice(SRC.indexOf('  stopEQSweep(): void {'), SRC.indexOf('\n  }\n', SRC.indexOf('  stopEQSweep(): void {')));
    expect(SRC).toContain('enabled: this.settings.returnEqEnabled,');
    expect(stop).toContain('if (!prior.enabled)');
    expect(stop).toContain('returnEqEnabled: false');
  });
});
