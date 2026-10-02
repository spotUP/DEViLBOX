/**
 * A measurement probe belongs to the measurement.
 *
 * `measure_dub_bus_stages` used to apply its temporary settings through
 * `setDubBus`, which persists the whole voicing to localStorage on every
 * call. Every probe was therefore saved, and a reload between applying and
 * restoring left the probe on disk as the performer's own settings — the
 * vector behind a session that came back with the return at zero and the echo
 * dry (2026-10-01).
 *
 * The fake bus stands in for `DubBus` with the two methods a probe needs, so
 * the test needs no AudioContext and no engine. It reproduces the one rule
 * that matters: `_applySettings` DROPS a key that is currently claimed, so a
 * probe that claimed its own override and then wrote it would write nothing.
 */

import { describe, it, expect } from 'vitest';
import {
  applyEphemeralDubSettings,
  type EphemeralDubSettingsTarget,
} from '../measurementSettings';

type Call =
  | { op: 'claim'; keys: string[] }
  | { op: 'release'; keys: string[] }
  | { op: 'set'; settings: Record<string, unknown> };

/** A bus that records what it was told, in order. */
function fakeBus() {
  const calls: Call[] = [];
  const claimed = new Set<string>();
  const bus: EphemeralDubSettingsTarget = {
    setSettings(settings) {
      const applied: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(settings)) {
        if (!claimed.has(k)) applied[k] = v;
      }
      calls.push({ op: 'set', settings: applied });
    },
    claimSettingKeys(keys) {
      const list = [...keys];
      for (const k of list) claimed.add(k);
      calls.push({ op: 'claim', keys: list });
      return () => {
        for (const k of list) claimed.delete(k);
        calls.push({ op: 'release', keys: list });
      };
    },
  };
  return { bus, calls, ops: () => calls.map(c => c.op) };
}

const SAVED = { enabled: false, returnGain: 0, echoWet: 0, echoEngine: 'spaceEcho' };

describe('applyEphemeralDubSettings', () => {
  it('applies the probe to the bus, with the bus switched on', () => {
    const { bus, calls } = fakeBus();
    applyEphemeralDubSettings(bus, SAVED, { returnGain: 0.85 });
    const writes = calls.filter(c => c.op === 'set');
    expect(writes).toHaveLength(1);
    expect(writes[0].settings).toEqual({
      enabled: true,
      returnGain: 0.85,
      echoWet: 0,
      echoEngine: 'spaceEcho',
    });
  });

  it('claims the probe keys AND enabled, so the store mirror cannot revert them', () => {
    const { bus, calls } = fakeBus();
    applyEphemeralDubSettings(bus, SAVED, { returnGain: 0.85, echoEngine: 'anotherDelay' });
    expect(calls[0]).toEqual({
      op: 'claim',
      keys: ['returnGain', 'echoEngine', 'enabled'],
    });
  });

  it('drops the claim for its own write and takes it straight back', () => {
    // A claimed key is dropped on write, so claim → write without releasing
    // would apply nothing at all.
    const { bus, ops } = fakeBus();
    applyEphemeralDubSettings(bus, SAVED, { returnGain: 0.85 });
    expect(ops()).toEqual(['claim', 'release', 'set', 'claim']);
  });

  it('releases the claim BEFORE restoring, or the restore is a silent no-op', () => {
    const { bus, calls, ops } = fakeBus();
    const { restore } = applyEphemeralDubSettings(bus, SAVED, { returnGain: 0.85 });
    calls.length = 0;
    restore();
    expect(ops()).toEqual(['release', 'set']);
  });

  it('puts the saved settings back, not the probe', () => {
    const { bus, calls } = fakeBus();
    const { restore } = applyEphemeralDubSettings(bus, SAVED, { returnGain: 0.85, echoWet: 1 });
    restore();
    const last = calls[calls.length - 1];
    expect(last.op).toBe('set');
    expect(last.op === 'set' && last.settings).toEqual(SAVED);
  });

  it('leaves the keys alone after restoring — the probe is over', () => {
    const { bus, ops } = fakeBus();
    const { restore } = applyEphemeralDubSettings(bus, SAVED, { returnGain: 0.85 });
    restore();
    expect(ops().filter(op => op === 'claim')).toHaveLength(2);
    expect(ops().at(-1)).toBe('set');
  });

  it('restores once, however often it is called', () => {
    const { bus, calls } = fakeBus();
    const { restore } = applyEphemeralDubSettings(bus, SAVED, { returnGain: 0.85 });
    restore();
    calls.length = 0;
    restore();
    expect(calls).toHaveLength(0);
  });

  it('never writes a setting the probe did not name', () => {
    const { bus, calls } = fakeBus();
    applyEphemeralDubSettings(bus, SAVED, { returnGain: 0.85 });
    const write = calls.find(c => c.op === 'set');
    // echoWet is not in the override, so the probe must leave it as saved
    // rather than resetting it to a default.
    expect(write?.op === 'set' && write.settings.echoWet).toBe(0);
    expect(write?.op === 'set' && write.settings.echoEngine).toBe('spaceEcho');
  });
});
