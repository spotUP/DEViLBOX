/**
 * NS-4 the format table (81 replace + 33 dual rows) and NS-0 the declared voice count, measured over its corpus.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NUADE_FORMAT_LIST, NUADE_FORMATS, nuadeFormatsByPrefKey } from '../nuadeFormats';
import { NUADE_NODE_VOICES } from '../nuadeProtocol';
import { NuadeHeadless } from '../nuadeHeadless';
import preNuadeDefaults from './preNuadeDefaults.json';
import { resolvedFormatEngines } from '../nuadeRouting';

const ROOT = join(__dirname, '../../../..');

const REPLACE_WAVES = `amcomposer amos andrewparton aprosys artandmagic ashleyhogg audiosculpture cinemaware dariuszendeh davidhanney desire dirkbialluch dsc dynamicsynthesizer earache ems emsv6 fashiontracker forgottenworlds fredgray gluemon howiedavies infogrames jankomrsicflogel jasonbrooke jasonpage jeroentel jesperolsen kimchristensen krishatlelid laxity legglessmusiceditor majortom maniacsofnoise markcooksey markcooksey_old markii maximumeffect mcmd medley mikedavies mmdc musicalenlightenment ntsp onescapee paulrobotham paulshields paulsummers peterverswyvelen pierreadane pokeynoise professionalsoundartists protracker4 quartet richardjoseph riffraff robhubbard robhubbardst scumm seanconnolly seanconran silmarils soundfx soundimages soundmaster specialfx speedya1system speedysystem spl stevebarrett synthdream synthpack syntracker thomashermann timetracker timfollin tomytracker tronic ufo voodoo zoundmonitor`.split(' ');
const DUAL = `actionamics activisionpro bendaglish davidwhittaker deltamusic1 deltamusic2 digmug dss facethemusic fred_np futurecomposer hippel hippel7v instereo1 instereo2 jamcracker musicassembler musicmaker oktalyzer pumatracker quadracomposer ronklaren sidmon2 sonicarranger sonix soundcontrol soundfactory soundmon suntronic synthesis hippelhip fcbsi gmc`.split(' ');

describe('the node declares the measured voice maximum', () => {
  it('before a song is open the node is declared for NUADE_NODE_VOICES, the corpus maximum; a song then sizes it (nuadeNodeVoices.test.ts)', () => {
    const src = readFileSync(join(ROOT, 'src/engine/nuade/NuadeEngine.ts'), 'utf8');
    expect(src).toMatch(/_nodeVoices = NUADE_NODE_VOICES/);
    expect(src).toMatch(/channelOutputNodeOptions\(this\._nodeVoices\)/);
    expect(NUADE_NODE_VOICES).toBe(8);
  });
});

describe('a fresh user keeps the pre-nuade engine of every format', () => {
  // preNuadeDefaults.json = the formatEngine defaults of useSettingsStore at 57e7803be, before the table (91 of the 114 rows had one;
  // the other 23 keys are new with the table and defaulted to UADE in their routes).
  it('the table\'s legacy engine is the old default, and the route reads it unless a recorded verdict moved the row to nuade', () => {
    const old = preNuadeDefaults as Record<string, string>;
    let checked = 0;
    for (const f of NUADE_FORMAT_LIST) {
      if (!(f.prefKey in old)) continue;
      checked++;
      expect(f.legacyEngine, `${f.id}: legacy engine vs the old default`).toBe(old[f.prefKey]);
      const route = (resolvedFormatEngines({} as never) as unknown as Record<string, string>)[f.prefKey];
      // nuade reads as native in the route (our parser draws the grid, playback is switched afterwards)
      const expected = f.defaultEngine === 'nuade' ? 'native' : old[f.prefKey];
      expect(route, `${f.id}: what a fresh user's import route is told`).toBe(expected);
      if (f.defaultEngine === 'nuade') expect(f.uadeEnvelopeCorrelation, `${f.id}: moved to nuade without a measurement`).not.toBeNull();
    }
    expect(checked).toBeGreaterThan(85);
  });
});

describe('NS-4 nuade format table', () => {
  it('lists real file extensions: no row carries an unexpanded C macro name (SUN_EXTENSION made SUN-Tronic unroutable)', () => {
    for (const r of Object.values(NUADE_FORMATS)) for (const e of r.extensions) expect(e, `${r.id}: ${e}`).not.toMatch(/[A-Z]/);
    expect(NUADE_FORMATS.suntronic!.extensions).toContain('sun');
    expect(NUADE_FORMATS.stevebarrett!.extensions).toContain('sb');
  });

  it('holds exactly the 81 replace rows (R01-R84 less R09 gmc, R46 fcbsi, R48 hippelhip) and the 33 dual rows AB01-AB33 of the plan', () => {
    const replace = NUADE_FORMAT_LIST.filter((f) => f.role === 'replace').map((f) => f.id).sort();
    const dual = NUADE_FORMAT_LIST.filter((f) => f.role === 'dual').map((f) => f.id).sort();
    expect(REPLACE_WAVES.length).toBe(81);
    expect(DUAL.length).toBe(33);
    expect(replace).toEqual([...REPLACE_WAVES].sort());
    expect(dual).toEqual([...DUAL].sort());
  });

  it('every row names a player the committed Nuade.wasm contains', async () => {
    const have = new Set((await NuadeHeadless.create()).playerIds());
    for (const f of NUADE_FORMAT_LIST) expect(have.has(f.id), f.id).toBe(true);
  });

  it('a row plays today\'s way unless its recorded verdict moved it: nuade only for a measured replace row, a held row names why, no dual row moves without our engine measured (DN-1)', () => {
    for (const f of NUADE_FORMAT_LIST) {
      expect(f.legacyEngine, f.id).not.toBe('nuade');
      if (f.defaultEngine === 'nuade') {
        expect(f.uadeEnvelopeCorrelation, `${f.id}: moved to nuade without a measurement`).toBeGreaterThanOrEqual(0.95);
        expect(f.heldBecause, f.id).toBeUndefined();
        // A dual row moves only by DN-1: it beats our own engine by 0.01 on the mean.
        if (f.role === 'dual') expect(f.uadeEnvelopeCorrelation! - (f.ownEnvelopeCorrelation ?? Infinity), `${f.id}: DN-1`).toBeGreaterThanOrEqual(0.01 - 1e-9);
      } else {
        expect(f.defaultEngine, `${f.id}: a row that is not on nuade plays its legacy engine`).toBe(f.legacyEngine);
      }
      // A held replace row stays on UADE; a held dual row (nuade scores better, our engine keeps the live edit path) stays ours.
      if (f.heldBecause) expect(f.defaultEngine, f.id).toBe(f.legacyEngine);
      if (f.role === 'dual' && f.ownEnvelopeCorrelation == null) expect(f.defaultEngine, `${f.id}: our engine stays the default until it is measured against nuade`).toBe(f.legacyEngine);
    }
  });

  it('rows that share a preference key agree on its default, and every key is declared in FormatEnginePreferences', () => {
    const types = readFileSync(join(ROOT, 'src/types/formatEngine.ts'), 'utf8');
    for (const key of new Set(NUADE_FORMAT_LIST.map((f) => f.prefKey))) {
      expect(new Set(nuadeFormatsByPrefKey(key).map((f) => f.defaultEngine)).size, key).toBe(1);
      expect(types, key).toMatch(new RegExp(`\\b${key}\\?: FormatEngineChoice`));
    }
    expect(NUADE_FORMATS.markcooksey!.prefKey).toBe(NUADE_FORMATS.markcooksey_old!.prefKey);
    expect(NUADE_FORMATS.speedysystem!.prefKey).toBe(NUADE_FORMATS.speedya1system!.prefKey);
  });

  it('follows by order and row only where the grid is DIRECT Rows; the corpus songs exist (10 formats have none)', () => {
    let noCorpus = 0;
    for (const f of NUADE_FORMAT_LIST) {
      for (const song of f.corpus) expect(existsSync(join(ROOT, song)), song).toBe(true);
      if (f.corpus.length === 0) noCorpus++;
    }
    // No song of these exists in the repo or on Modland (searched 2026-10-13 by extension and by Modland format name): unmeasured.
    expect(NUADE_FORMAT_LIST.filter((f) => f.corpus.length === 0).map((f) => f.id).sort()).toEqual(['amos', 'andrewparton', 'cinemaware', 'kimchristensen', 'laxity', 'ntsp', 'onescapee', 'quartet', 'timetracker', 'ufo']);
    expect(noCorpus).toBe(10);
    expect(NUADE_FORMATS.amos!.followBy).toBe('orderRow');
    expect(NUADE_FORMATS.mmdc!.followBy).toBe('tick');
  });
});

describe('NS-0 declared voices', () => {
  it('the node declares at least the largest voice count of any corpus song, and that count is measured here', async () => {
    const nu = await NuadeHeadless.create();
    let max = 0;
    let opened = 0;
    for (const f of NUADE_FORMAT_LIST) {
      for (const song of f.corpus) {
        // A song that needs a companion file the corpus does not carry yet (Audio Sculpture's .AS) cannot open alone.
        try { nu.open(readFileSync(join(ROOT, song)), song.split('/').pop()!, f.id); } catch { continue; }
        opened++;
        max = Math.max(max, nu.voiceCount);
        nu.close();
      }
    }
    expect(opened).toBeGreaterThan(150);
    expect(max).toBeGreaterThanOrEqual(4);
    expect(NUADE_NODE_VOICES).toBeGreaterThanOrEqual(max);
    expect(NUADE_NODE_VOICES).toBe(max);
  });
});
