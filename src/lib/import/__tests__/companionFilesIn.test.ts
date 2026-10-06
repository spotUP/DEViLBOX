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


describe('partnerlessFilesIn (real corpus listing of songs/formats)', () => {
  const dir = join(process.cwd(), 'public/data/songs/formats');
  const listing = { siblings: readdirSync(dir) };

  it('does not offer bob4e.dum: its .ins is not in the corpus, UADE cannot open /uade/bob4e.ins', () => {
    expect(listing.siblings).not.toContain('bob4e.ins');
    expect(partnerlessFilesIn(listing).has('bob4e.dum')).toBe(true);
  });

  it('does not offer jpn.virocop-14: its smp.virocop-14 is not in the corpus', () => {
    expect(partnerlessFilesIn(listing).has('jpn.virocop-14')).toBe(true);
  });

  it('does not offer shortsong1.mod.nt as a song: it is StarTrekker synth data, its .mod is absent', () => {
    expect(partnerlessFilesIn(listing).has('shortsong1.mod.nt')).toBe(true);
  });

  it('keeps complete pairs and the song index agrees', () => {
    expect(partnerlessFilesIn({ siblings: ['jpn.a', 'smp.a', 'x.dum', 'x.ins', 'amsyntdemo.mod', 'amsyntdemo.mod.nt'] }).size).toBe(0);
    const index = JSON.parse(readFileSync(join(process.cwd(), 'public/data/songs/index.json'), 'utf8')) as { entries: { files: string[] }[] };
    const offered = index.entries.flatMap((e) => e.files);
    for (const f of ['bob4e.dum', 'jpn.virocop-14', 'shortsong1.mod.nt']) {
      expect(offered).not.toContain(`/data/songs/formats/${f}`);
    }
    expect(offered).toContain('/data/songs/infogrames/advantage tennis-intro.dum');
  });
});
