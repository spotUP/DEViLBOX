/**
 * A panic left the bus dead behind a panel that read ON: the write that turns
 * the engine back on was judged against the desired-state mirror (already
 * `enabled: true`) and dropped as a no-op (2026-10-02).
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_DUB_BUS } from '@/types/dub';
import { settingsWriteChangesBus } from '../settingsWrite';

const desiredOn = { ...DEFAULT_DUB_BUS, enabled: true };

describe('settingsWriteChangesBus', () => {
  it('re-enables an engine a panic switched off while the store still says on', () => {
    expect(settingsWriteChangesBus(desiredOn, { enabled: true }, false)).toBe(true);
  });

  it('drops a mirror re-push that matches what the engine is doing', () => {
    expect(settingsWriteChangesBus(desiredOn, { enabled: true, echoWet: desiredOn.echoWet }, true)).toBe(false);
  });

  it('sees any other changed field', () => {
    expect(settingsWriteChangesBus(desiredOn, { echoWet: desiredOn.echoWet + 0.1 }, true)).toBe(true);
  });

  it('still disables an engine that is on', () => {
    expect(settingsWriteChangesBus({ ...desiredOn, enabled: false }, { enabled: false }, true)).toBe(true);
  });
});
