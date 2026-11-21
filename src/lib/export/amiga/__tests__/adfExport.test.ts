import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { adfTemplateFor, adfSongName, patchAdfSlot, buildAdf, AdfExportError, type AdfManifest } from '../adfExport';

const SONGS = 'public/data/songs/';
const manifest = JSON.parse(readFileSync('public/amiga-adf/manifest.json', 'utf8')) as AdfManifest;
const tpl = (f: string) => Uint8Array.from(readFileSync(`public/amiga-adf/${f}`));
const song = (p: string) => Uint8Array.from(readFileSync(SONGS + p));

const CASES: Array<[string, string]> = [
  ['amigaklang/Virgill-mothership.mod', 'PTK-Prowiz'],
  ['ahx/amanda.ahx', 'AbyssHighestExperience'],
  ['future-composer-1.4/starglide1.fc', 'FutureComposer1.4'],
  ['jamcracker/freehand-spreadtro.jam', 'JamCracker'],
  ['digital-mugician/believe.dmu', 'Mugician'],
  ['digibooster/the day after.digi', 'DIGI-Booster'],
  ['formats/msx-cracktro 2.sun', 'SUN-Tronic'],
  ['custommade/the viking child crack.cm', 'CustomMade'],
  ['formats/primemover_01.hot', 'Anders_0land'],
  ['formats/perception.ems', 'EMS-6'],
  ['formats/je taime.ems', 'EMS'],
  ['formats/ballade.song.ems', 'EMS'],
  ['formats/universal monsters - dracula.mmd0', 'MED'],
  ['formats/funky nightmare.mmd1', 'MED-A1200'],
  ['formats/hybris.fp', 'FuturePlayer'],
  ['formats/imploder_drums.fp', 'FuturePlayer'],
  ['formats/ep-trmonsterbusiness.mcmd', 'MCMD'],
  ['formats/beathoven_smallest.bss', 'BeathovenSynthesizer'],
  ['formats/tristar_cracktro.bss', 'BeathovenSynthesizer'],
  ['formats/pauker_rap_2.ss', 'SpeedySystem'],
  ['formats/action.aps', 'AProSys'],
  ['formats/agony-level1.aam', 'ArtAndMagic'],
  ['formats/agony-level2.aam', 'ArtAndMagic'],
  ['formats/future basketball main.tw', 'SoundImages'],
  ['formats/crystal.dp', 'Tronic'],
  ['formats/locomotion.dp', 'Tronic'],
  ['formats/krymini title.amc', 'AM-Composer'],
  ['formats/krymini jingle 1.amc', 'AM-Composer'],
  ['formats/riffraff_smallest.riff', 'RiffRaff'],
  ['formats/sidewinder2.riff', 'RiffRaff'],
  ['formats/prehistoric_tale.hipc', 'JochenHippel-CoSo'],
  ['oktalyzer/les granges brulees.okta', 'Oktalyzer'],
  ['formats/ghostbattle_gameover.hip7', 'JochenHippel-7V'],
  ['hippel-7v/lethalxcess-intro.hip7', 'JochenHippel-7V'],
  ['formats/almighty.sa', 'SonicArranger'],
  ['sonic-arranger/mega end.sa', 'SonicArranger'],
  ['formats/anthrox_intro.dm2', 'DeltaMusic2.0'],
  ['delta-music-2/asperity megademo 3.dm2', 'DeltaMusic2.0'],
  ['formats/anarchy.sid1', 'SIDMon1.0'],
  ['sidmon-1/myfunnymazea.sid', 'SIDMon1.0'],
];

describe('adf slot patcher', () => {
  it.each(CASES)('%s picks %s and patches only its slot and length word', async (path, name) => {
    const mod = song(path);
    expect(adfTemplateFor(mod, path)).toBe(name);
    const e = manifest.templates[name];
    const base = tpl(e.adf);
    const r = await buildAdf(mod, path.split('/').pop()!, manifest, async () => base);
    const { diskOffset, maxBytes } = e.moduleSlot;
    const lw = e.moduleLengthWord.diskOffset;
    expect(r.data.length).toBe(base.length);
    expect(new DataView(r.data.buffer).getUint32(lw, false)).toBe(mod.length);
    expect(Array.from(r.data.subarray(diskOffset, diskOffset + mod.length))).toEqual(Array.from(mod));
    expect(r.data.subarray(diskOffset + mod.length, diskOffset + maxBytes).every((b) => b === 0)).toBe(true);
    for (let i = 0; i < base.length; i++) {
      const inSlot = i >= diskOffset && i < diskOffset + maxBytes;
      const inLen = i >= lw && i < lw + 4;
      const inTitle = i >= e.titleSlot.diskOffset && i < e.titleSlot.diskOffset + e.titleSlot.bytes;
      if (!inSlot && !inLen && !inTitle && r.data[i] !== base[i]) throw new Error(`byte ${i} changed outside the slot`);
    }
    expect(r.filename.endsWith('.adf')).toBe(true);
  });

  it('writes the file name without extension, sanitized and space padded, at the manifest title slot', async () => {
    const e = manifest.templates['EMS'];
    const base = tpl(e.adf);
    const mod = song('formats/je taime.ems');
    const at = (n: string) => buildAdf(mod, n, manifest, async () => base).then((r) =>
      String.fromCharCode(...r.data.subarray(e.titleSlot.diskOffset, e.titleSlot.diskOffset + e.titleSlot.bytes)));
    expect(await at('je taime.ems')).toBe('je taime'.padEnd(e.titleSlot.bytes, ' '));
    expect(await at('caf\u00e9.ems')).toBe('caf?'.padEnd(e.titleSlot.bytes, ' '));
    expect(await at('x'.repeat(60) + '.ems')).toBe('x'.repeat(e.titleSlot.bytes));
  });

  it('every template records a 29 byte title slot inside the image, outside the module slot', () => {
    for (const [k, e] of Object.entries(manifest.templates)) {
      expect(e.titleSlot.bytes, k).toBe(29);
      const t = e.titleSlot.diskOffset;
      expect(t + 29 <= e.moduleSlot.diskOffset || t >= e.moduleSlot.diskOffset + e.moduleSlot.maxBytes, k).toBe(true);
    }
  });

  it('TFMX: writes the smpl companion into its own slot with its length word, and refuses a missing or oversize one', () => {
    const e = manifest.templates['TFMX-Pro'];
    const base = tpl(e.adf);
    const mdat = song('formats/mdat.turrican_bonus');
    expect(adfTemplateFor(mdat, 'mdat.turrican_bonus')).toBe('TFMX-Pro');
    const smpl = song('formats/smpl.turrican_bonus');
    const r = patchAdfSlot(base, e, mdat, smpl);
    const cs = e.companionSlot!, cl = e.companionLengthWord!.diskOffset;
    expect(new DataView(r.buffer).getUint32(cl, false)).toBe(smpl.length);
    expect(Array.from(r.subarray(cs.diskOffset, cs.diskOffset + smpl.length))).toEqual(Array.from(smpl));
    expect(() => patchAdfSlot(base, e, mdat)).toThrow(/companion/);
    expect(() => patchAdfSlot(base, e, mdat, new Uint8Array(cs.maxBytes + 1).fill(1))).toThrow(AdfExportError);
  });

  it('Maximum_Effect: routes MAX.* by name and writes SMP.set into the companion slot', () => {
    const e = manifest.templates['Maximum_Effect'];
    const mod = song('maximum-effect/MAX.DinosaurDetective jingle1');
    expect(adfTemplateFor(mod, 'MAX.DinosaurDetective jingle1')).toBe('Maximum_Effect');
    const smp = song('maximum-effect/SMP.set');
    const r = patchAdfSlot(tpl(e.adf), e, mod, smp);
    const cs = e.companionSlot!;
    expect(new DataView(r.buffer).getUint32(e.companionLengthWord!.diskOffset, false)).toBe(smp.length);
    expect(Array.from(r.subarray(cs.diskOffset, cs.diskOffset + smp.length))).toEqual(Array.from(smp));
  });

  it('Sound-FX: routes .sfx by name and tag, patches the slot', () => {
    const e = manifest.templates['Sound-FX'];
    const mod = song('soundfx/batdance.sfx');
    expect(adfTemplateFor(mod, 'batdance.sfx')).toBe('Sound-FX');
    expect(adfTemplateFor(mod, 'batdance.mod')).not.toBe('Sound-FX');
    const r = patchAdfSlot(tpl(e.adf), e, mod);
    expect(Array.from(r.subarray(e.moduleSlot.diskOffset, e.moduleSlot.diskOffset + mod.length))).toEqual(Array.from(mod));
  });

  it('SoundMaster: routes .sm by name and header, patches the slot', () => {
    const e = manifest.templates['SoundMaster'];
    const mod = song("sound-master/rackney'sisland 4.sm");
    expect(adfTemplateFor(mod, "rackney'sisland 4.sm")).toBe('SoundMaster');
    const r = patchAdfSlot(tpl(e.adf), e, mod);
    expect(Array.from(r.subarray(e.moduleSlot.diskOffset, e.moduleSlot.diskOffset + mod.length))).toEqual(Array.from(mod));
  });

  it.each([
    ['SoundMon2.0', 'formats/aquarivs.bp'],
    ['InStereo', 'formats/fantasi8.is'],
    ['QuadraComposer', 'formats/synth_corn.emod'],
  ])('%s: routes by magic, patches the slot', (name, path) => {
    const e = manifest.templates[name];
    const mod = song(path);
    expect(adfTemplateFor(mod, path.split('/').pop())).toBe(name);
    const r = patchAdfSlot(tpl(e.adf), e, mod);
    expect(Array.from(r.subarray(e.moduleSlot.diskOffset, e.moduleSlot.diskOffset + mod.length))).toEqual(Array.from(mod));
  });

  it('names the export after the whole file for prefix-named files, strips the extension for suffix-named', async () => {
    expect(adfSongName('MAX.DinosaurDetective jingle1')).toBe('MAX.DinosaurDetective jingle1');
    expect(adfSongName('mdat.song')).toBe('mdat.song');
    expect(adfSongName('crystal.dp')).toBe('crystal');
    expect(adfSongName('song.mod')).toBe('song');
  });

  it('refuses a module larger than the slot, and does not modify the template', () => {
    const e = manifest.templates['AbyssHighestExperience'];
    const base = tpl(e.adf);
    const copy = base.slice();
    expect(() => patchAdfSlot(base, e, new Uint8Array(e.moduleSlot.maxBytes + 1).fill(1))).toThrow(AdfExportError);
    expect(() => patchAdfSlot(base, e, new Uint8Array(e.moduleSlot.maxBytes).fill(1))).not.toThrow();
    expect(base).toEqual(copy);
  });

  it('refuses a player whose chip memory need exceeds the machine', () => {
    const e = { ...manifest.templates['PTK-Prowiz'], chipArenaBytes: 600000 };
    expect(() => patchAdfSlot(tpl(e.adf), e, song('amigaklang/Virgill-mothership.mod'))).toThrow(/chip memory/);
  });

  it('refuses a format with no disk player', async () => {
    await expect(buildAdf(new Uint8Array(2000).fill(7), 'x.bin', manifest, async () => new Uint8Array())).rejects.toThrow(/No Amiga disk player/);
  });
});
