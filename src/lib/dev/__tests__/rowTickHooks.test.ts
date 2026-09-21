/**
 * The pattern scroll that never moved, and the two dub features nobody could
 * have used.
 *
 * `useTransportStore.setCurrentRow` reached for three things on every row
 * through `require()`, under a comment calling that "the file's pattern for
 * avoiding circular imports at startup". `require` does not exist in an ESM
 * browser bundle: each call threw a ReferenceError on the very first row and
 * was swallowed by the catch beside it.
 *
 * So for as long as that code has been there: lane events never fired, `Z00`
 * typed into a cell did nothing, and the edit cursor never followed the play
 * head. Only the last of those is visible, and it was reported on 2026-09-21
 * as "the pattern scroll is frozen" — with playback advancing, followPlayback
 * true, and the cursor sitting on row 0.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  registerRowHook, unregisterRowHook, registeredRowHooks, fireRowHooks, clearRowHooks,
} from '../rowTickHooks';

afterEach(() => { clearRowHooks(); vi.restoreAllMocks(); });

describe('rowTickHooks', () => {
  it('fires a registered hook with the row', () => {
    const hook = vi.fn();
    registerRowHook('a', hook);
    fireRowHooks(17);
    expect(hook).toHaveBeenCalledWith(17);
  });

  it('fires nothing when nothing is registered', () => {
    expect(() => fireRowHooks(0)).not.toThrow();
    expect(registeredRowHooks()).toEqual([]);
  });

  it('keeps the documented order: lane events, then effect commands', () => {
    const order: string[] = [];
    registerRowHook('dubLanePlayer', () => order.push('lane'));
    registerRowHook('dubEffectScanner', () => order.push('effect'));
    fireRowHooks(4);
    expect(order).toEqual(['lane', 'effect']);
  });

  it('lets one hook fail without taking the others or the transport down', () => {
    // This runs on every row of playback. A throw must not stop the song.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    registerRowHook('broken', () => { throw new Error('nope'); });
    registerRowHook('after', after);
    expect(() => fireRowHooks(1)).not.toThrow();
    expect(after).toHaveBeenCalled();
  });

  it('reports a failing hook once, not once per row', () => {
    // Silence here is exactly what hid the original fault; a message per row
    // would be its own bug.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerRowHook('broken', () => { throw new Error('nope'); });
    for (let row = 0; row < 64; row++) fireRowHooks(row);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('replaces a hook registered twice under one name', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerRowHook('x', first);
    registerRowHook('x', second);
    fireRowHooks(0);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it('forgets an unregistered hook', () => {
    const hook = vi.fn();
    registerRowHook('x', hook);
    unregisterRowHook('x');
    fireRowHooks(0);
    expect(hook).not.toHaveBeenCalled();
    expect(registeredRowHooks()).toEqual([]);
  });
});

/**
 * One reachability test per feature: the wiring, proven once.
 */
describe('the transport uses it, and no longer uses require', () => {
  const root = join(__dirname, '..', '..', '..');
  const transport = readFileSync(join(root, 'stores', 'useTransportStore.ts'), 'utf8');

  it('fires the hooks on every row while playing', () => {
    expect(transport).toContain('fireRowHooks(row)');
    expect(transport).toContain('ensureRowHooksLoaded()');
  });

  it('loads the hook modules itself, so they work before the deck is opened', () => {
    // They self-register on import, and nothing else imports them until the
    // Dub Deck mounts — but a lane event has to fire whether or not that view
    // was ever opened.
    expect(transport).toMatch(/import\('@engine\/dub\/DubLanePlayer'\)/);
    expect(transport).toMatch(/import\('@engine\/dub\/DubEffectScanner'\)/);
  });

  it('reaches the cursor through the registry, not through require', () => {
    expect(transport).toContain('getEditorStoreRef()');
    expect(transport).toContain('getCursorStoreRef()');
    expect(transport).toMatch(/cursorStore\.setState\(\{ cursor: \{ \.\.\.cursor, rowIndex: row \} \}\)/);
  });

  it('has no require() left in the per-row path', () => {
    // The specific fault: a call that cannot succeed, wrapped in a catch that
    // never speaks.
    expect(transport).not.toMatch(/=\s*require\(/);
  });

  it('has both hook modules register themselves', () => {
    for (const [file, name] of [
      ['DubLanePlayer.ts', 'dubLanePlayer'],
      ['DubEffectScanner.ts', 'dubEffectScanner'],
    ] as const) {
      const src = readFileSync(join(root, 'engine', 'dub', file), 'utf8');
      expect(src, file).toContain(`registerRowHook('${name}'`);
    }
  });
});
