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
 * Boot now OFFERS. The saved slot reuses the Restore/Discard prompt the crash
 * snapshot already had, so there is one mechanism, and a boot the user ignores
 * leaves them on a clean slate.
 */
describe('boot offers stored work and never imposes it', () => {
  it('a clean machine starts clean', () => {
    expect(decideBootRestore({
      everExplicitlySaved: false, savedHasContent: false, hasRecoveryRecord: false,
    })).toEqual({ kind: 'none' });
  });

  it('a saved project is offered, not loaded', () => {
    expect(decideBootRestore({
      everExplicitlySaved: true, savedHasContent: true, hasRecoveryRecord: false,
    })).toEqual({ kind: 'saved' });
  });

  it('the explicit slot wins over a crash snapshot beside it', () => {
    // Deliberately named and saved work beats a crash guess.
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

  it('every outcome is an offer — none of them load', () => {
    const outcomes = [
      decideBootRestore({ everExplicitlySaved: true, savedHasContent: true, hasRecoveryRecord: true }),
      decideBootRestore({ everExplicitlySaved: false, savedHasContent: false, hasRecoveryRecord: true }),
      decideBootRestore({ everExplicitlySaved: false, savedHasContent: false, hasRecoveryRecord: false }),
    ];
    for (const o of outcomes) expect(['none', 'saved', 'recovery']).toContain(o.kind);
  });
});

describe('the boot effect cannot load silently', () => {
  const HOOK = readFileSync(join(process.cwd(), 'src/hooks/useProjectPersistence.ts'), 'utf-8');

  const bootEffect = (): string => {
    const start = HOOK.indexOf('if (hasLoadedFromStorage) return;');
    expect(start, 'the boot effect moved').toBeGreaterThan(-1);
    return HOOK.slice(start, HOOK.indexOf('}, []);', start));
  };

  it('does not call loadProjectFromStorage', () => {
    expect(
      bootEffect(),
      'boot loading the saved project is exactly the stale-song report'
    ).not.toContain('loadProjectFromStorage(');
  });

  it('asks the gate what to offer', () => {
    expect(bootEffect()).toContain('decideBootRestore(');
  });

  it('keeps the ?reset escape hatch, which used to live inside the load', () => {
    expect(bootEffect()).toContain('handleResetParam()');
  });

  it('declining a SAVED project does not delete it', () => {
    const discard = HOOK.slice(HOOK.indexOf('const discardRecovery'), HOOK.indexOf('const save ='));
    // Only a crash snapshot is consumed by being declined.
    expect(discard).toContain('if (wasRecovery) void idbDeleteRecovery()');
    expect(discard, 'the saved project must survive a Discard').not.toContain('idbDelete()');
  });
});
