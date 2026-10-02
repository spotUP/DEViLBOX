/**
 * A panic must not leave the bus muted behind the panel's back.
 *
 * `dubPanic()` mutes the ENGINE — `this.enabled = false`, input gain to zero —
 * without writing `settings.enabled`, because that field mirrors the store and
 * is the performer's desired state. The KILL button pairs its panic with
 * `store.setDubBus({ enabled: false })`, so there the two agree.
 *
 * An emergency panic has no such caller. The bus is an echo that ran away, or
 * a hold pad is stuck, and the move fires `dubPanic` to stop it — nothing
 * touches the store. The engine is now muted while the store still says
 * enabled, and because that value never CHANGED there was nothing for the
 * store->engine mirror to push: the mirror fires on a new `dubBus` object and
 * the performer's next "enable" was a no-op against an already-true value.
 *
 * The result is a bus that is dead while the UI reads ON. Measured 2026-10-02:
 * engine `enabled: false`, `inputGain: 0`, `returnRms: 0`, master chain
 * carrying signal — every wet control and every move, including Sub Harmonic,
 * doing nothing at all, which is how it was reported.
 *
 * The drain timer already restores echo and spring "from the current settings"
 * when its window closes. `enabled` has to be restored the same way, through
 * `setSettings` so the full enable path runs (input ramp, synth un-silencing,
 * the disabled warning reset) rather than a bare flag poke.
 *
 * These are source-level asserts: DubBus needs live Web Audio, AudioWorklets
 * and Tone, none of which exist under happy-dom, and this file locks wiring.
 * The behavioural proof is a live measurement against the running app.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DUB_BUS_SRC = readFileSync(resolve(__dirname, '..', 'DubBus.ts'), 'utf8');

/** The `dubPanic()` method body. */
function dubPanicBody(): string {
  const start = DUB_BUS_SRC.indexOf('  dubPanic(): void {');
  expect(start, 'dubPanic() not found').toBeGreaterThan(-1);
  const end = DUB_BUS_SRC.indexOf('\n  /**', start);
  return DUB_BUS_SRC.slice(start, end === -1 ? undefined : end);
}

/** The drain-window timer inside `dubPanic()`. */
function drainTimerBody(): string {
  const body = dubPanicBody();
  const start = body.indexOf('const drainTimer = setTimeout(');
  expect(start, 'dubPanic drain timer not found').toBeGreaterThan(-1);
  return body.slice(start, body.indexOf('DubBus.DRAIN_MS);', start));
}

describe('panic re-converges the engine with the performer\'s desired state', () => {
  it('restores enabled from settings when the drain window closes', () => {
    expect(drainTimerBody()).toContain('setSettings({ enabled: this.settings.enabled }, { force: true })');
  });

  it('restores it through setSettings, not a bare flag poke', () => {
    // A bare `this.enabled = this.settings.enabled` would flip the flag while
    // leaving input gain at zero and the generated synths silenced — a bus
    // that reads enabled and passes nothing, which is the bug in miniature.
    const timer = drainTimerBody();
    expect(timer).not.toMatch(/this\.enabled\s*=\s*this\.settings\.enabled/);
  });

  it('keeps the drain honest about the level restores it already made', () => {
    const timer = drainTimerBody();
    expect(timer).toContain('this.echo.setIntensity(this.settings.echoIntensity)');
    expect(timer).toContain('this._setSpringWet(this.settings.springWet)');
  });

  it('still mutes the engine immediately, and leaves desired state alone', () => {
    const body = dubPanicBody();
    // The instant mute is the point of a panic and must survive.
    expect(body).toMatch(/this\.enabled\s*=\s*false/);
    // Desired state is the store's; panic must not pre-write it, or the
    // mirror's equality check would short-circuit the performer's own
    // setDubBus({ enabled: false }) when it finally arrives.
    expect(body).not.toMatch(/this\.settings\.enabled\s*=/);
  });

  it('un-mutes after exactly the drain window, not before', () => {
    // The re-converge has to sit inside the timer, or the bus comes back
    // while its buffers are still draining.
    expect(dubPanicBody().indexOf('setSettings({ enabled: this.settings.enabled }, { force: true })'))
      .toBeGreaterThan(dubPanicBody().indexOf('const drainTimer = setTimeout('));
  });

  it('forces the write past the no-op guard', () => {
    // `_applySettings` drops a write whose values already match. Panic
    // diverged the ENGINE from `settings` without changing either, so the
    // only write that can repair it looks identical to the ones the guard
    // exists to drop — without `force` the restore returns before the enable
    // sequence ever runs and the bus stays muted. That is what the first
    // attempt at this fix did: it read correctly and measured `enabled:
    // false` after the drain window closed.
    expect(DUB_BUS_SRC).toContain('if (!changed && !opts?.force) return;');
    expect(DUB_BUS_SRC).toMatch(
      /private _applySettings\(settings: Partial<DubBusSettings>, opts\?: \{ force\?: boolean \}\)/,
    );
  });

  it('reuses the real enable sequence rather than poking the flag', () => {
    // The enable path does far more than set `enabled`: it restores the input
    // gain panic muted to zero, re-syncs the master insert, re-applies the
    // vinyl level, resets the disabled warning and pre-warms reverse capture.
    // A bare assignment would leave a bus that reads enabled and passes
    // nothing — the same bug wearing a different hat.
    const enableBranch = DUB_BUS_SRC.slice(
      DUB_BUS_SRC.indexOf('if (typeof settings.enabled === \'boolean\') {'),
    );
    expect(enableBranch).toContain('this.enabled = settings.enabled;');
    expect(enableBranch).toContain('ig.linearRampToValueAtTime(1, t + 0.02);');
    expect(enableBranch).toContain('this._syncMasterInsertToEnabled();');
  });
});
