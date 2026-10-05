import { describe, it, expect } from 'vitest';
import {
  resolveCompanions,
  expectedCompanionNames,
  listingFromRelativePaths,
  splitName,
  stemOf,
  MAX_COMPANIONS,
  MAX_SUBDIR_FILES,
  SHARED_BANK,
} from '../companionResolver';

/**
 * The seven-song test from 2026-09-22 as pure name lists, plus every rule
 * the old server table carried. Directory listings are what sat on disk
 * under ~/Desktop/mods that day.
 */
const SYNTH_DREAM = [
  'sdr.monsterbusiness 1', 'sdr.monsterbusiness 2', 'sdr.monsterbusiness 3', 'sdr.monsterbusiness 4',
  'sdr.monsterbusiness 5', 'sdr.monsterbusiness 6', 'sdr.monsterbusiness 7', 'sdr.monsterbusiness 8',
  'sdr.nobuddiesland 1', 'sdr.nobuddiesland 2', 'sdr.nobuddiesland 3', 'sdr.nobuddiesland 4',
  'sdr.nobuddiesland end 2',
  'smp.nobuddiesland 1', 'smp.nobuddiesland 2', 'smp.nobuddiesland 3', 'smp.nobuddiesland 4',
  'smp.nobuddiesland end 2',
  'smp.set',
];

const DYNAMIC_SYNTH = [
  'dns.hollywoodpokerpro ingame', 'dns.hollywoodpokerpro title', 'dns.ptc',
  'dns.starball ingame', 'dns.starball title',
  'smp.hollywoodpokerpro ingame', 'smp.hollywoodpokerpro title',
  'smp.starball ingame', 'smp.starball title',
];

const DYTER = [
  'dyter07 hiscore.osp', 'dyter07 mainfx.osp', 'dyter07 ongame01.osp', 'dyter07 ongame02.osp',
  'dyter07 ongame03.osp', 'dyter07 ongame04.osp', 'dyter07 title.osp', 'smp.set',
];

describe('splitName / stemOf', () => {
  it('reads the stem past a role-first word', () => {
    expect(splitName('mdat.jaguar')).toEqual({ stem: 'jaguar', role: 'mdat' });
    expect(splitName('dns.starball title')).toEqual({ stem: 'starball title', role: 'dns' });
  });

  it('reads the stem before a role-last word', () => {
    expect(splitName('jaguar.smpl')).toEqual({ stem: 'jaguar', role: 'smpl' });
    expect(splitName('dyter07 title.osp')).toEqual({ stem: 'dyter07 title', role: 'osp' });
  });

  it('falls back to everything before the last dot, with no role', () => {
    expect(splitName('break the box.mod')).toEqual({ stem: 'break the box', role: null });
    expect(stemOf('popelich-brutalo.adsc.as')).toBe('popelich-brutalo.adsc');
  });
});

describe('the discriminating pair — SynthDream', () => {
  it('takes the tune\'s own smp.<tune> and NOT the shared bank', () => {
    const r = resolveCompanions('sdr.nobuddiesland end 2', { siblings: SYNTH_DREAM });
    expect(r.companions).toEqual(['smp.nobuddiesland end 2']);
    expect(r.usedSharedBank).toBe(false);
  });

  it('falls back to smp.set when the tune owns nothing — and takes no other tune\'s bank', () => {
    const r = resolveCompanions('sdr.monsterbusiness 5', { siblings: SYNTH_DREAM });
    expect(r.companions).toEqual([SHARED_BANK]);
    expect(r.usedSharedBank).toBe(true);
  });
});

describe('guard 1 — a companion never carries the module\'s own role', () => {
  it('DynamicSynthesizer: finds smp.starball title, none of the dns.* songs', () => {
    const r = resolveCompanions('dns.starball title', { siblings: DYNAMIC_SYNTH });
    expect(r.companions).toEqual(['smp.starball title']);
  });

  it('two songs that merely share a name are not companions', () => {
    const r = resolveCompanions('foo.mod', { siblings: ['foo.mod', 'foo.xm', 'foo.s3m'] });
    expect(r.companions).toEqual([]);
  });
});

describe('the other shapes', () => {
  it('TFMX: mdat. finds smpl., and the other way round', () => {
    const sib = ['mdat.fatalheritage ship', 'smpl.fatalheritage ship', 'mdat.fatalheritage 22', 'smpl.fatalheritage 22'];
    expect(resolveCompanions('mdat.fatalheritage ship', { siblings: sib }).companions).toEqual(['smpl.fatalheritage ship']);
    expect(resolveCompanions('smpl.fatalheritage ship', { siblings: sib }).companions).toEqual(['mdat.fatalheritage ship']);
  });

  it('suffixed: AudioSculpture finds its own name plus .as', () => {
    const r = resolveCompanions('popelich-brutalo.adsc', { siblings: ['popelich-brutalo.adsc', 'popelich-brutalo.adsc.as'] });
    expect(r.companions).toEqual(['popelich-brutalo.adsc.as']);
  });

  it('shared bank: SynthPack takes smp.set and none of the other .osp tunes', () => {
    const r = resolveCompanions('dyter07 title.osp', { siblings: DYTER });
    expect(r.companions).toEqual([SHARED_BANK]);
  });

  it('Hippel 7V needs nothing and gets nothing', () => {
    const r = resolveCompanions('ghostbattle gameover.hip7', {
      siblings: ['amberstar-extro.hip7', 'ghostbattle gameover.hip7', 'lethalxcess-end.hip7'],
    });
    expect(r.companions).toEqual([]);
  });

  it('extension pairs the server carried: .sng/.ins, .dum/.ins, .4v/.set', () => {
    expect(resolveCompanions('tune.sng', { siblings: ['tune.sng', 'tune.ins', 'other.ins'] }).companions).toEqual(['tune.ins']);
    expect(resolveCompanions('tune.dum', { siblings: ['tune.dum', 'tune.ins'] }).companions).toEqual(['tune.ins']);
    expect(resolveCompanions('tune.4v', { siblings: ['tune.4v', 'tune.set'] }).companions).toEqual(['tune.set']);
  });

  it('prefix pairs the server carried: jpn/jpnd/thm/mfp/sjs/max with smp, mcr with mcs, midi with smpl', () => {
    for (const [a, b] of [['jpn', 'smp'], ['jpnd', 'smp'], ['thm', 'smp'], ['mfp', 'smp'], ['sjs', 'smp'], ['max', 'smp'], ['mcr', 'mcs'], ['midi', 'smpl']]) {
      const r = resolveCompanions(`${a}.tune`, { siblings: [`${a}.tune`, `${b}.tune`, `${b}.other`] });
      expect(r.companions, `${a} -> ${b}`).toEqual([`${b}.tune`]);
    }
  });

  it('named special cases: <base>.sdata, .kh + songplay, .sci + <3>patch.003', () => {
    expect(resolveCompanions('tune.mod', { siblings: ['tune.mod', 'tune.sdata'] }).companions).toEqual(['tune.sdata']);
    expect(resolveCompanions('intro.kh', { siblings: ['intro.kh', 'songplay'] }).companions).toEqual(['songplay']);
    expect(resolveCompanions('abcsong.sci', { siblings: ['abcsong.sci', 'abcpatch.003'] }).companions).toEqual(['abcpatch.003']);
  });

  /**
   * The Wanted Team eagleplayers read their replay code from a file that
   * ships with the MODULE: "must be called 'WantedTeam.bin' and must be
   * stored in the same directory as the module"
   * (uade-3.05/amigasrc/players/wanted_team/*\/EP_*.readme).
   *
   * `lollypop-subgame 01.jo` failed with `uade_request_amiga_file: file not
   * found '/uade/WantedTeam.bin'` because nothing ever handed the sibling
   * over. The first plan was to ship the binary under `public/uade/`, which
   * would have been wrong — it is per-module data, not a player file.
   */
  it('Wanted Team modules take their replay binary from the same directory', () => {
    expect(
      resolveCompanions('jo.lollypop-subgame 01', {
        siblings: ['jo.lollypop-subgame 01', 'WantedTeam.bin'],
      }).companions,
    ).toEqual(['WantedTeam.bin']);

    expect(
      resolveCompanions('pat.some tune', { siblings: ['pat.some tune', 'WantedTeam.bin'] })
        .companions,
    ).toEqual(['WantedTeam.bin']);
  });

  it('sample subdirectories keep their relative paths', () => {
    expect(resolveCompanions('tank1.sun', { siblings: ['tank1.sun'], subdirs: { instr: ['perc1.x', 'bio', 'lead.x'] } }).companions)
      .toEqual(['instr/perc1.x', 'instr/lead.x']);
    expect(resolveCompanions('smus.tune', { siblings: ['smus.tune'], subdirs: { Instruments: ['kick.instr', 'snare.ss', '.DS_Store', 'readme.txt'] } }).companions)
      .toEqual(['Instruments/kick.instr', 'Instruments/snare.ss']);
    expect(resolveCompanions('hittheroad.sng', { siblings: ['hittheroad.sng'], subdirs: { Samples: ['electom', 'bass'] } }).companions)
      .toEqual(['Samples/electom', 'Samples/bass']);
    // Registered as the replayer opens it, read from one level up.
    const up = resolveCompanions('hittheroad.sng', { siblings: ['hittheroad.sng'], parentSamples: ['electom'] });
    expect(up.companions).toEqual(['Samples/electom']);
    expect(up.sources).toEqual({ 'Samples/electom': '../Samples/electom' });
    expect(resolveCompanions('mdat.x', { siblings: ['mdat.x', 'smpl.x'] }).sources).toEqual({});
  });
});

describe('listingFromRelativePaths — a folder drop as a listing', () => {
  it('splits top-level names from one level of subdirectories', () => {
    expect(listingFromRelativePaths(['sdr.a', 'smp.a', 'instr/perc1.x', 'Samples/electom', 'deep/er/x'])).toEqual({
      siblings: ['sdr.a', 'smp.a'],
      subdirs: { instr: ['perc1.x'], Samples: ['electom'] },
    });
  });
});

describe('bounds and order', () => {
  it('caps SIBLING matches — a wrong stem must not sweep a directory of songs', () => {
    const many = Array.from({ length: 40 }, (_, i) => `role${i}.tune`);
    // Every one of these carries the module's stem with a different "role";
    // only the known role words match, but the cap is what bounds it.
    const r = resolveCompanions('mdat.tune', { siblings: ['mdat.tune', ...many, ...['smpl', 'smp', 'ins', 'set', 'sng', 'dum', 'snd', 'song', 'sdata', 'instr', 'samples', 'tfmx', 'tfx', 'dns', 'sdr', 'osp', 'jpn', 'jpnd', 'thm'].map(r => `${r}.tune`)] });
    expect(r.companions.length).toBeLessThanOrEqual(MAX_COMPANIONS);
  });

  it('does NOT cap a sample subdirectory — those files are the instrument set', () => {
    // ZoundMonitor: 51 files in Samples/. A count cap staged the first sixteen
    // alphabetically and the tune died like a missing companion (Up Rough, 2026-09-22).
    const samples = Array.from({ length: 51 }, (_, i) => `sample${String(i).padStart(2, '0')}`);
    const r = resolveCompanions('sonjavanveen.sng', { siblings: ['sonjavanveen.sng'], subdirs: { Samples: samples } });
    expect(r.companions.length).toBe(51);
    expect(r.companions[50]).toBe('Samples/sample50');
  });

  it('still bounds a pathological subdirectory', () => {
    const many = Array.from({ length: 700 }, (_, i) => `x${i}.x`);
    const r = resolveCompanions('tune.sun', { siblings: ['tune.sun'], subdirs: { instr: many } });
    expect(r.companions.length).toBe(MAX_SUBDIR_FILES);
  });

  it('ZoundMonitor with Samples/ beside the song DIRECTORY: registered as Samples/<f>, read from one level up', () => {
    const r = resolveCompanions('sonjavanveen.sng', { siblings: ['sonjavanveen.sng', 'other.sng'], parentSamples: ['electom', 'bass'] });
    expect(r.companions).toEqual(['Samples/electom', 'Samples/bass']);
    expect(r.sources['Samples/bass']).toBe('../Samples/bass');
  });

  it('puts the tune\'s own files before a shared bank, and never takes the bank when it owns something', () => {
    const r = resolveCompanions('sdr.tune', { siblings: ['sdr.tune', 'smp.tune', 'smp.set'] });
    expect(r.companions).toEqual(['smp.tune']);
  });

  it('is case-insensitive on names but returns them as listed', () => {
    const r = resolveCompanions('MDAT.Jaguar', { siblings: ['MDAT.Jaguar', 'SMPL.Jaguar'] });
    expect(r.companions).toEqual(['SMPL.Jaguar']);
  });
});

describe('expectedCompanionNames — the lone-file prompt', () => {
  it('names the partner for a role-first module', () => {
    expect(expectedCompanionNames('mdat.fatalheritage ship')).toEqual(['smpl.fatalheritage ship']);
    expect(expectedCompanionNames('dns.starball title')).toEqual(['smp.starball title']);
    expect(expectedCompanionNames('sdr.monsterbusiness 5')).toEqual(['smp.monsterbusiness 5', SHARED_BANK]);
    expect(expectedCompanionNames('SPM.Hypnosphere')).toEqual(['sps.Hypnosphere']);
  });

  it('names the partner for a role-last module', () => {
    expect(expectedCompanionNames('dyter07 title.osp')).toEqual([SHARED_BANK]);
    expect(expectedCompanionNames('popelich-brutalo.adsc')).toEqual(['popelich-brutalo.adsc.as']);
    expect(expectedCompanionNames('tune.sng')).toEqual(['tune.ins']);
    expect(expectedCompanionNames('intro.kh')).toEqual(['songplay']);
    expect(expectedCompanionNames('abcsong.sci')).toEqual(['abcpatch.003']);
    expect(expectedCompanionNames('hypnosphere.spm')).toEqual(['hypnosphere.sps']);
  });

  it('says nothing for a format that needs nothing', () => {
    expect(expectedCompanionNames('ghostbattle gameover.hip7')).toEqual([]);
    expect(expectedCompanionNames('break the box.mod')).toEqual([]);
  });
});
