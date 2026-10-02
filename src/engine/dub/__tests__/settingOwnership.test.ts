/**
 * A held move being switched off mid-gesture by the settings mirror.
 *
 * `ringMod` and `voltageStarve` change engine state by calling
 * `bus.setSettings` directly. The STORE never learns they did, so the next
 * mirror push — PadGrid every 50 ms, DJSamplerPanel on every change — carries
 * the store's older values and arrives with `ringModEnabled: false` while the
 * pad is still down. The effect vanishes under the performer's finger.
 *
 * Echo rate has been protected from exactly this since `beginRateOverride`;
 * this generalises it. Ref-counted, so two overlapping moves cannot release
 * each other's claim, and released BEFORE the move's own dispose write so that
 * write still lands.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const BUS = read('engine/dub/DubBus.ts');

/** The claim/release logic, mirrored so it can be exercised without a bus. */
function makeOwnership() {
  const owned = new Map<string, number>();
  return {
    claim(keys: readonly string[]) {
      for (const k of keys) owned.set(k, (owned.get(k) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        for (const k of keys) {
          const depth = (owned.get(k) ?? 1) - 1;
          if (depth <= 0) owned.delete(k); else owned.set(k, depth);
        }
      };
    },
    isOwned: (k: string) => owned.has(k),
    size: () => owned.size,
  };
}

describe('a move owns its keys until it lets go', () => {
  it('reports a claimed key as owned', () => {
    const o = makeOwnership();
    o.claim(['ringModEnabled']);
    expect(o.isOwned('ringModEnabled')).toBe(true);
    expect(o.isOwned('lofiEnabled')).toBe(false);
  });

  it('releases on dispose', () => {
    const o = makeOwnership();
    const release = o.claim(['lofiEnabled', 'lofiBits']);
    release();
    expect(o.isOwned('lofiEnabled')).toBe(false);
    expect(o.size()).toBe(0);
  });

  it('survives a double release', () => {
    // A hold released twice — pointerup plus lostpointercapture, which is now a
    // real path — must not decrement someone else's claim.
    const o = makeOwnership();
    const first = o.claim(['ringModEnabled']);
    const second = o.claim(['ringModEnabled']);
    first();
    first();
    expect(o.isOwned('ringModEnabled')).toBe(true);
    second();
    expect(o.isOwned('ringModEnabled')).toBe(false);
  });

  it('keeps the key owned while two moves overlap', () => {
    const o = makeOwnership();
    const a = o.claim(['lofiEnabled']);
    const b = o.claim(['lofiEnabled']);
    a();
    expect(o.isOwned('lofiEnabled'), 'released by the wrong claim').toBe(true);
    b();
    expect(o.isOwned('lofiEnabled')).toBe(false);
  });
});

describe('setSettings respects ownership', () => {
  it('drops owned keys before deciding anything changed', () => {
    // Order matters: filtering AFTER the change check would let an owned-key
    // write mark the settings dirty and run the whole body for nothing.
    const filterAt = BUS.indexOf('if (this._ownedSettingKeys.size > 0) {');
    const changeAt = BUS.indexOf('if (!settingsWriteChangesBus(');
    expect(filterAt, 'ownership filter missing from setSettings').toBeGreaterThan(-1);
    expect(filterAt).toBeLessThan(changeAt);
  });

  it('is wired into the moves that mutate the bus behind the store', () => {
    for (const [file, key] of [
      ['engine/dub/moves/ringMod.ts', 'ringModEnabled'],
      ['engine/dub/moves/voltageStarve.ts', 'lofiEnabled'],
    ] as const) {
      const src = read(file);
      expect(src, file).toContain('bus.claimSettingKeys(');
      expect(src, file).toContain(key);
      // Released before the dispose write, or that write is dropped too.
      const releaseAt = src.indexOf('release();');
      const disposeWriteAt = src.indexOf('bus.setSettings({', releaseAt);
      expect(releaseAt, `${file}: no release in dispose`).toBeGreaterThan(-1);
      expect(disposeWriteAt).toBeGreaterThan(releaseAt);
    }
  });
});
