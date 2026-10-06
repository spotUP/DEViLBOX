/**
 * Companions are found in BOTH naming forms (prefix `ins.x`, extension `x.ins`)
 * for every role EXPECTED_PARTNER knows, plus the shared-bank fallbacks.
 * Reported 2026-10-06: a Modland bob4e.dum download fetched no `bob4.ins`.
 *
 * The listing below is exactly what a directory listing gives; the resolver is
 * the one decision point for every load path (pick, drop, folder, Modland,
 * jukebox), so the table is proved here once and the paths are proved to call
 * it in modlandCompanions.test.ts / companionFetchOnePath.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { EXPECTED_PARTNER, resolveCompanions, expectedCompanionNames } from '../companionResolver';

const FORMS = (role: string, tune: string) => [`${role}.${tune}`, `${tune}.${role}`];

describe('companionResolver: every two-file role is found in prefix and extension form', () => {
  const plain = Object.entries(EXPECTED_PARTNER).filter(([, partners]) =>
    partners.every((p) => !p.startsWith('.') && !p.includes('.') && p !== 'songplay'));

  for (const [role, partners] of plain) {
    for (const partner of partners) {
      for (const moduleName of FORMS(role, 'tune')) {
        for (const partnerName of FORMS(partner, 'tune')) {
          it(`${moduleName} finds ${partnerName}`, () => {
            const found = resolveCompanions(moduleName, { siblings: [moduleName, partnerName, 'other.mod'] });
            expect(found.companions).toEqual([partnerName]);
          });
        }
      }
    }
  }
});

describe('companionResolver: shared banks and special cases', () => {
  it('a Modland bob4e.dum takes the shared bob4.ins (extension form)', () => {
    expect(resolveCompanions('bob4e.dum', { siblings: ['bob4e.dum', 'bob4.ins'] }).companions).toEqual(['bob4.ins']);
  });
  it('a Modland bob4e.dum takes the shared ins.bob4 (prefix form)', () => {
    expect(resolveCompanions('bob4e.dum', { siblings: ['bob4e.dum', 'ins.bob4'] }).companions).toEqual(['ins.bob4']);
  });
  it('bob4e.dum prefers its own bob4e.ins over the shared bank', () => {
    const r = resolveCompanions('bob4e.dum', { siblings: ['bob4e.dum', 'bob4e.ins', 'bob4.ins'] });
    expect(r.companions).toEqual(['bob4e.ins']);
  });
  it('sdr.monsterbusiness_5 owning nothing takes smp.set (prefix form)', () => {
    const r = resolveCompanions('sdr.monsterbusiness_5', { siblings: ['sdr.monsterbusiness_5', 'smp.set', 'sdr.nobuddiesland_jigsaw', 'smp.nobuddiesland_jigsaw'] });
    expect(r.companions).toEqual(['smp.set']);
    expect(r.usedSharedBank).toBe(true);
  });
  it('osp.x takes the shared bank in extension form (set.smp)', () => {
    expect(resolveCompanions('osp.x', { siblings: ['osp.x', 'set.smp'] }).companions).toEqual(['set.smp']);
  });
  it('sdr.nobuddiesland_jigsaw keeps its own bank and ignores smp.set', () => {
    const r = resolveCompanions('sdr.nobuddiesland_jigsaw', { siblings: ['sdr.nobuddiesland_jigsaw', 'smp.nobuddiesland_jigsaw', 'smp.set'] });
    expect(r.companions).toEqual(['smp.nobuddiesland_jigsaw']);
  });
  it('audiosculpture_smallest.adsc finds .adsc.as', () => {
    expect(resolveCompanions('audiosculpture_smallest.adsc', { siblings: ['audiosculpture_smallest.adsc', 'audiosculpture_smallest.adsc.as'] }).companions)
      .toEqual(['audiosculpture_smallest.adsc.as']);
  });
  it('a .kh song finds songplay', () => {
    expect(resolveCompanions('tune.kh', { siblings: ['tune.kh', 'songplay'] }).companions).toEqual(['songplay']);
  });
  it('a .sci song finds <3>patch.003', () => {
    expect(resolveCompanions('abc.sci', { siblings: ['abc.sci', 'abcpatch.003'] }).companions).toEqual(['abcpatch.003']);
  });
  it('the corpus holds the files these cases are named after', () => {
    const dir = join(process.cwd(), 'public/data/songs/formats');
    for (const f of ['bob4e.dum', 'bob4.ins', 'sdr.monsterbusiness_5', 'audiosculpture_smallest.adsc']) {
      expect(existsSync(join(dir, f)), f).toBe(true);
    }
  });
  it('the lone-file prompt names the partner in the module own form', () => {
    expect(expectedCompanionNames('bob4e.dum')).toEqual(['bob4e.ins']);
    expect(expectedCompanionNames('dns.tune')).toEqual(['smp.tune']);
  });
});
