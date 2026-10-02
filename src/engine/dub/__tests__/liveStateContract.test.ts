/**
 * The diagnostics must say which value it is reporting.
 *
 * Three separate misdiagnoses on 2026-10-02 came out of one property:
 * `getDiagnosticSnapshot()` is a flat field bag that mixes the store's
 * DESIRED values with the graph's ACTUAL ones and never says which is which.
 *
 * - `diagnostic.echoRateMs` is the SETTING. It read a steady 320 through a
 *   Dub Mute hold that was working perfectly, so the move looked dead.
 * - `spring.wet` reads 1 whatever is written to the springs dry/wet param, so
 *   it could not be used to judge that knob either.
 * - Every live probe was then compared against a song playing, whose level
 *   drifts, which is how a working knob was twice measured as "no change".
 *
 * `getLiveState()` removes the ambiguity by pairing every parameter as
 * `{ desired, actual, delta }` read at one instant, so a parameter that fails
 * to reach the graph shows a non-zero delta instead of having to be inferred.
 * `actual` is `null` when it genuinely cannot be read - an honest unknown
 * rather than a zero that reads as "working but silent".
 *
 * Source-level asserts: DubBus needs live Web Audio, AudioWorklets and Tone,
 * none of which exist under happy-dom, so this locks the shape and the seam.
 * The behavioural proof is a live `get_dub_bus_state` read against the app.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DUB_BUS_SRC = readFileSync(resolve(__dirname, '..', 'DubBus.ts'), 'utf8');
const SPACE_ECHO_SRC = readFileSync(resolve(__dirname, '..', '..', 'effects', 'SpaceEchoEffect.ts'), 'utf8');
const READ_HANDLERS_SRC = readFileSync(
  resolve(__dirname, '..', '..', '..', 'bridge', 'handlers', 'readHandlers.ts'),
  'utf8',
);

describe('getLiveState pairs desired with actual', () => {
  it('exists and reports all three fields per parameter', () => {
    expect(DUB_BUS_SRC).toContain('getLiveState()');
    expect(DUB_BUS_SRC).toContain('desired: number | null; actual: number | null; delta: number | null');
    expect(DUB_BUS_SRC).toContain('delta: d !== null && a !== null ? round(a - d) : null');
  });

  it('reads live node values, not the settings the controls write', () => {
    // Each of these must come off a node or a live accessor. Reading
    // `this.settings` here would reproduce the exact bug it exists to fix.
    const body = DUB_BUS_SRC.slice(DUB_BUS_SRC.indexOf('getLiveState()'));
    expect(body).toContain('this.lpf.frequency.value');
    expect(body).toContain('this.return_.gain.value');
    expect(body).toContain('this.input.gain.value');
    expect(body).toContain('this.echo.wet');
  });

  it('covers the parameters that moves actually move', () => {
    const body = DUB_BUS_SRC.slice(DUB_BUS_SRC.indexOf('getLiveState()'));
    // Most go in the object literal as `key: read(...)`; the echo rate is read
      // through the adapter's describe() seam afterwards as `out.key = read(...)`.
      for (const key of ['lpfCutoffHz', 'returnGain', 'echoRateMs', 'echoWet', 'plateSend', 'inputGain', 'springWet']) {
        expect(body).toMatch(new RegExp(`${key}[^\\n]*read\\(`));
      }
  });

  it('reports an unreadable live value as null rather than zero', () => {
    // A zero would read as "the control is working and the effect is silent".
    expect(DUB_BUS_SRC).toContain('const a = typeof actual === \'number\' && Number.isFinite(actual) ? round(actual) : null;');
  });

  it('reads the echo delay time through the existing describe() seam', () => {
    // The seam RE-201 already had, rather than reaching into Tone internals.
    expect(DUB_BUS_SRC).toContain('echoDesc?.delayTimeMs ?? echoDesc?.rateMs ?? echoDesc?.delayTime');
  });

  it('SpaceEcho implements that seam, since it ships by default', () => {
    // Without it the live delay time reads null on the default engine - the
    // one parameter every throw, wobble and tape move moves.
    expect(SPACE_ECHO_SRC).toContain('describe(): Record<string, unknown>');
    expect(SPACE_ECHO_SRC).toContain('rateMs: liveRateMs');
    // Off the delay node, not the stored option: a rampTo in flight is
    // precisely what these diagnostics exist to show.
    expect(SPACE_ECHO_SRC).toContain('this.head1.delayTime.getValueAtTime');
  });

  it('is reachable from the bridge, so a probe can read it', () => {
    expect(READ_HANDLERS_SRC).toContain('liveState: bus?.getLiveState?.() ?? null');
  });
});