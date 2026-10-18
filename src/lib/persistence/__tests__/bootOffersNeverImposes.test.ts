import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideBootRestore } from '../recoveryGate';

/**
 * "i load a song on every boot because a stale song is there on every boot"
 * (2026-09-22).
 *
 * Boot used to LOAD the explicit-save slot unconditionally:
 *
 *     const everExplicitlySaved = await hasSavedProject();
 *     if (everExplicitlySaved) { await loadProjectFromStorage(); return; }
 *
 * So once a project had been saved even once, every later session opened on
 * top of it, and the user loaded the song they actually wanted over the
 * top — two songs per boot, with the dub bus re-wired underneath the deck in
 * between.
 *
 * Boot now picks ONE slot with decideBootRestore (never both) and restores it
 * silently (owner, 2026-10-18: never ask; the user clears it if unwanted). A
 * song load requested during boot waits for the restore (bootRestore gate).
 */
describe('boot picks the stored work to restore silently', () => {
  it('a clean machine starts clean', () => {
    expect(decideBootRestore({
      everExplicitlySaved: false, savedHasContent: false, hasRecoveryRecord: false,
    })).toEqual({ kind: 'none' });
  });

  it('a saved project is chosen', () => {
    expect(decideBootRestore({
      everExplicitlySaved: true, savedHasContent: true, hasRecoveryRecord: false,
    })).toEqual({ kind: 'saved' });
  });

  it('the explicit slot wins over an OLDER crash snapshot', () => {
    // Deliberately named and saved work beats a stale crash guess.
    expect(decideBootRestore({
      everExplicitlySaved: true, savedHasContent: true, hasRecoveryRecord: true,
      savedAt: '2026-09-22T20:00:00.000Z',
      recoveryAt: '2026-09-22T19:00:00.000Z',
    })).toEqual({ kind: 'saved' });
  });

  it('a NEWER snapshot wins — it is the song actually being worked on', () => {
    // Loading a song writes the snapshot, not the explicit slot. Before this,
    // a project saved days ago kept beating the tune in front of you, and
    // every dev reload came back to the same stale song: "it always reverts
    // to that song for some reason" (2026-09-22).
    expect(decideBootRestore({
      everExplicitlySaved: true, savedHasContent: true, hasRecoveryRecord: true,
      savedAt: '2026-09-22T19:00:00.000Z',
      recoveryAt: '2026-09-22T20:00:00.000Z',
    })).toEqual({ kind: 'recovery' });
  });

  it('an unreadable snapshot timestamp never displaces saved work', () => {
    expect(decideBootRestore({
      everExplicitlySaved: true, savedHasContent: true, hasRecoveryRecord: true,
      savedAt: '2026-09-22T19:00:00.000Z',
      recoveryAt: 'not a date',
    })).toEqual({ kind: 'saved' });
  });

  it('with no timestamps at all, deliberately saved work still wins', () => {
    expect(decideBootRestore({
      everExplicitlySaved: true, savedHasContent: true, hasRecoveryRecord: true,
    })).toEqual({ kind: 'saved' });
  });

  it('a crash snapshot is offered when nothing was ever saved', () => {
    expect(decideBootRestore({
      everExplicitlySaved: false, savedHasContent: false, hasRecoveryRecord: true,
    })).toEqual({ kind: 'recovery' });
  });

  it('a pristine saved slot is not worth offering', () => {
    // One empty default pattern, no instruments — restoring it would only
    // produce a prompt for a blank project.
    expect(decideBootRestore({
      everExplicitlySaved: true, savedHasContent: false, hasRecoveryRecord: false,
    })).toEqual({ kind: 'none' });
  });

  it('every outcome is one of three slots', () => {
    const outcomes = [
      decideBootRestore({ everExplicitlySaved: true, savedHasContent: true, hasRecoveryRecord: true }),
      decideBootRestore({ everExplicitlySaved: false, savedHasContent: false, hasRecoveryRecord: true }),
      decideBootRestore({ everExplicitlySaved: false, savedHasContent: false, hasRecoveryRecord: false }),
    ];
    for (const o of outcomes) expect(['none', 'saved', 'recovery']).toContain(o.kind);
  });
});

describe('the boot effect restores one slot silently', () => {
  const HOOK = readFileSync(join(process.cwd(), 'src/hooks/useProjectPersistence.ts'), 'utf-8');

  const bootEffect = (): string => {
    const start = HOOK.indexOf('if (hasLoadedFromStorage) return;');
    expect(start, 'the boot effect moved').toBeGreaterThan(-1);
    return HOOK.slice(start, HOOK.indexOf('}, []);', start));
  };

  it('does not call loadProjectFromStorage', () => {
    expect(
      bootEffect(),
      'loading both slots is exactly the stale-song report'
    ).not.toContain('loadProjectFromStorage(');
  });

  it('asks the gate which slot to restore', () => {
    expect(bootEffect()).toContain('decideBootRestore(');
  });

  it('holds song loads until the restore has applied', () => {
    const effect = bootEffect();
    expect(effect).toContain('beginBootRestore()');
    expect(effect).toContain('endBootRestore');
  });

  it('keeps the ?reset escape hatch, which used to live inside the load', () => {
    expect(bootEffect()).toContain('handleResetParam()');
  });

  it('no restore prompt remains', () => {
    expect(HOOK).not.toContain('discardRecovery');
    expect(HOOK).not.toContain('recoverySnapshot');
  });
});
