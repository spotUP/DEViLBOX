/**
 * A song index offers songs, not the files that belong WITH a song.
 *
 * The jukebox listed `instruments/Saxophone.ss` beside its SMUS, and the
 * `.ins` half of an Infogrames `.dum`/`.ins` pair, as songs; each one
 * "failed to load" and was judged a broken format (ledger F11, F12).
 * `companionFilesIn` names them from the same rules that fetch them.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { companionFilesIn, isInSampleDirectory, partnerlessFilesIn } from '../companionResolver';

describe('companionFilesIn', () => {
  it('names the instrument files a SMUS owns, not the SMUS', () => {
    // Sonix instruments: .ss, .instr, or no extension; `.info` is Workbench litter.
    const out = companionFilesIn({ siblings: ['42.smus', 'readme.txt'], subdirs: { instruments: ['Saxophone.ss', 'Trumpet.ss', 'LEDchord', 'LEDchord.info'] } });
    expect([...out].sort()).toEqual(['instruments/LEDchord', 'instruments/Saxophone.ss', 'instruments/Trumpet.ss']);
  });

  it('keeps the module of a mutual pair and drops the half the registry cannot name', () => {
    const listing = { siblings: ['advantage tennis-intro.dum', 'advantage tennis-intro.ins', 'other.dum'] };
    // Only `.dum` is a song to the registry; `.ins` falls to the catch-all.
    const out = companionFilesIn(listing, (n) => n.endsWith('.dum'));
    expect([...out]).toEqual(['advantage tennis-intro.ins']);
  });

  it('keeps both halves of a mutual pair when both are songs', () => {
    const out = companionFilesIn({ siblings: ['a.dum', 'a.ins'] }, () => true);
    expect(out.size).toBe(0);
  });

  it('names the TFMX sample half', () => {
    const out = companionFilesIn({ siblings: ['mdat.jaguar', 'smpl.jaguar', 'mdat.other'] }, (n) => n.startsWith('mdat.'));
    expect([...out]).toEqual(['smpl.jaguar']);
  });

  it('leaves a lone file alone', () => {
    expect(companionFilesIn({ siblings: ['SnareDrum.ss'] }).size).toBe(0);
  });
});

describe('isInSampleDirectory', () => {
  it('names the instrument directories, at any depth, in any case', () => {
    expect(isInSampleDirectory('SUNTronicTunes/instr/ah')).toBe(true);
    expect(isInSampleDirectory('iff-smus/Mark Riley/Instruments/Vib-Pipe-PPP.inst')).toBe(true);
    expect(isInSampleDirectory('sonix/instruments/4th.l.d3.ss')).toBe(true);
    expect(isInSampleDirectory('formats/instruments.mod')).toBe(false);
    expect(isInSampleDirectory('speedy-system/pauker rap 2.ss')).toBe(false);
  });
});


describe('partnerlessFilesIn', () => {
  it('does not offer an Infogrames .dum with no .ins (UADE cannot open /uade/<tune>.ins)', () => {
    expect(partnerlessFilesIn({ siblings: ['bob4e.dum'] }).has('bob4e.dum')).toBe(true);
  });

  it('does not offer a Jason Page jpn.* without its smp.*', () => {
    expect(partnerlessFilesIn({ siblings: ['jpn.virocop-14', 'smp.virocop-13'] }).has('jpn.virocop-14')).toBe(true);
  });

  it('does not offer a StarTrekker .nt as a song when its .mod is absent', () => {
    expect(partnerlessFilesIn({ siblings: ['shortsong1.mod.nt'] }).has('shortsong1.mod.nt')).toBe(true);
  });

  it('keeps complete pairs, including a .dum on its shared bank', () => {
    expect(partnerlessFilesIn({ siblings: ['jpn.a', 'smp.a', 'x.dum', 'x.ins', 'amsyntdemo.mod', 'amsyntdemo.mod.nt', 'bob4e.dum', 'bob4.ins'] }).size).toBe(0);
  });

  it('the song index offers every corpus song whose partner is present', () => {
    const index = JSON.parse(readFileSync(join(process.cwd(), 'public/data/songs/index.json'), 'utf8')) as { entries: { files: string[] }[] };
    const offered = index.entries.flatMap((e) => e.files);
    const formats = new Set(readdirSync(join(process.cwd(), 'public/data/songs/formats')));
    for (const f of partnerlessFilesIn({ siblings: [...formats] })) {
      expect(offered).not.toContain(`/data/songs/formats/${f}`);
    }
    expect(offered).toContain('/data/songs/infogrames/advantage tennis-intro.dum');
  });
});

describe('Infogrames shared instrument bank', () => {
  it('bob4e.dum takes the shared bob4.ins when bob4e.ins does not exist (UADE asks for both)', async () => {
    const { resolveCompanions, listingFromRelativePaths } = await import('../companionResolver');
    const res = resolveCompanions('bob4e.dum', listingFromRelativePaths(['bob4e.dum', 'bob4.ins', 'bob4d.ins']));
    expect(res.companions).toContain('bob4.ins');
    expect(res.companions).not.toContain('bob4d.ins');
  });
});
