/**
 * Regression: the first DJ seed (public/data/playlists/imported-prg.json) was
 * built from the owner's HippoPlayer playlists by a converter that kept only
 * the bare file name of every non-Modland URL. 515 entries lost their source
 * and could never load; "Anathema-Imbasille 3" played two of its eight.
 *
 * The converter (tools/convert-hippo-playlists.ts -> src/lib/dj/hippoPlaylist.ts)
 * keeps every URL as the entry's source.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { playlistFromPrg, parsePrgEntries } from '../hippoPlaylist';
import { isBareFileName } from '../playlistTrackSource';

/** Anathema-Imbasille_3.prg as HippoPlayer saved it (UTF-8, 0xF7-prefixed title line). */
const IMBASILLE_3 = [
  'HiPPrg',
  '',
  '÷ Anathema - Imbassile 3',
  'http://ftp.modland.com/pub/modules/Protracker/Blaizer/coop-DWB/ben dover.mod',
  'http://ftp.modland.com/pub/modules/Protracker/DWB/cloudwalker 777.mod',
  'http://hippoplayer.se/data/Modules/Protracker/D/DWB/quickening.mod',
  'http://hippoplayer.se/data/Modules/Protracker/D/DWB/stainless.mod',
  'http://hippoplayer.se/data/Modules/Protracker/M/M-Litz/echo-logical.mod',
  'http://hippoplayer.se/data/Modules/Protracker/M/M-Litz/governmeltdown.mod',
  'http://hippoplayer.se/data/Modules/Protracker/M/M-Litz/mozart is a fake.mod',
  'http://hippoplayer.se/data/Modules/Protracker/M/M-Litz/weeny-bopper.mod',
  '',
].join('\n');

const HIPPO_SOURCES = [
  'http://hippoplayer.se/data/Modules/Protracker/D/DWB/quickening.mod',
  'http://hippoplayer.se/data/Modules/Protracker/D/DWB/stainless.mod',
  'http://hippoplayer.se/data/Modules/Protracker/M/M-Litz/echo-logical.mod',
  'http://hippoplayer.se/data/Modules/Protracker/M/M-Litz/governmeltdown.mod',
  'http://hippoplayer.se/data/Modules/Protracker/M/M-Litz/mozart is a fake.mod',
  'http://hippoplayer.se/data/Modules/Protracker/M/M-Litz/weeny-bopper.mod',
];

/** One line of every URL kind the 74 owner playlists hold, saved as ISO-8859-1 like most of them. */
const MIXED_LINES = [
  'http://ftp.modland.com/pub/modules/Hippel COSO/Jochen Hippel/a prehistoric tale %28intro%29.hipc',
  'http://ftp.modland.com/pub/modules/Fasttracker 2/Radix/superchip #2.xm',
  'https://ftp.modland.com/pub/modules/TFMX/Chris Huelsbeck/mdat.monkey island#name=Chris Huelsbeck - Monkey Island (Subsong 5) (TFMX)#song=4',
  'http://hvsc.c64.org/download/C64Music/MUSICIANS/B/Bart/Metropolis.sid#name=01. Bart/Metropolis (sid)',
  'https://hvsc.c64.org/download/C64Music/MUSICIANS/J/Jucke/Pag.sid#name=09. Jucke - När Jag Var en Liten Påg',
  'http://hippoplayer.se/webdata/Modules/Video Game Music/Arcade/Companies/Taito/Bubble_Bobble_%28Arcade%29/07 Real Ending.vgz#name=Bubble Bobble (Taito) - Real Ending',
  'https://hippoplayer.se/WB.html?playmod=https://hvsc.c64.org/download/C64Music/MUSICIANS/L/Linus/Cold_War_Generation.sid#name=71. Linus - Cold War Generation',
  'http://uhc.amigaremix.com/listen/1811/ron_klaren_-_battle_squadron_-_game_over_-_trance_version_by_cz_tunes.mp3',
  'https://www.modules.pl/modules/awesome/Awesome_-_Ancient_Stories.zip',
  'http://ice1.somafm.com/groovesalad-256-mp3#name=SomaFM Groove Salad              ',
];
const MIXED_SOURCES = [
  'modland:pub/modules/Hippel COSO/Jochen Hippel/a prehistoric tale (intro).hipc',
  'modland:pub/modules/Fasttracker 2/Radix/superchip #2.xm',
  'modland:pub/modules/TFMX/Chris Huelsbeck/mdat.monkey island',
  'hvsc:MUSICIANS/B/Bart/Metropolis.sid',
  'hvsc:MUSICIANS/J/Jucke/Pag.sid',
  'http://hippoplayer.se/webdata/Modules/Video Game Music/Arcade/Companies/Taito/Bubble_Bobble_%28Arcade%29/07 Real Ending.vgz',
  'hvsc:MUSICIANS/L/Linus/Cold_War_Generation.sid',
  'http://uhc.amigaremix.com/listen/1811/ron_klaren_-_battle_squadron_-_game_over_-_trance_version_by_cz_tunes.mp3',
  'https://www.modules.pl/modules/awesome/Awesome_-_Ancient_Stories.zip',
  'http://ice1.somafm.com/groovesalad-256-mp3',
];

function latin1(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

describe('HippoPlayer playlist converter keeps every source', () => {
  it('turns every URL line into one entry carrying that URL as its source', () => {
    const text = ['HiPPrg', '', '÷***** mixed *****', ...MIXED_LINES, '÷--------', ''].join('\n');
    const playlist = playlistFromPrg('Mixed_Sources.prg', latin1(text));
    expect(playlist.tracks.map((t) => t.fileName)).toEqual(MIXED_SOURCES);
    expect(playlist.tracks.every((t) => !isBareFileName(t.fileName))).toBe(true);
    // Names come from HippoPlayer's #name= marker, decoded from ISO-8859-1.
    expect(playlist.tracks[4].trackName).toBe('09. Jucke - När Jag Var en Liten Påg');
    expect(playlist.tracks[9].trackName).toBe('SomaFM Groove Salad');
    expect(playlist.tracks[7].format).toBe('MP3');
  });

  it('gives the six hippoplayer.se entries of "Anathema-Imbasille 3" their URLs', () => {
    const playlist = playlistFromPrg('Anathema-Imbasille_3.prg', new TextEncoder().encode(IMBASILLE_3));
    expect(playlist.id).toBe('playlist-prg-anathema-imbasille-3');
    expect(playlist.name).toBe('Anathema-Imbasille 3');
    expect(playlist.tracks.map((t) => t.fileName)).toEqual([
      'modland:pub/modules/Protracker/Blaizer/coop-DWB/ben dover.mod',
      'modland:pub/modules/Protracker/DWB/cloudwalker 777.mod',
      ...HIPPO_SOURCES,
    ]);
    expect(parsePrgEntries(IMBASILLE_3)).toHaveLength(8);
  });

  it('keeps the first seed ids, dots included, so persisted copies still match', () => {
    expect(playlistFromPrg('NE7s_Faves_Vol._1.prg', latin1('HiPPrg\n')).id).toBe('playlist-prg-ne7s-faves-vol.-1');
  });

  it('the bundled seed has no bare entry and Imbasille 3 carries the six hippoplayer.se sources', () => {
    const seedPath = path.resolve(__dirname, '../../../../public/data/playlists/imported-prg.json');
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as Array<{ id: string; tracks: Array<{ fileName: string }> }>;
    expect(seed).toHaveLength(74);
    expect(seed.flatMap((p) => p.tracks).filter((t) => isBareFileName(t.fileName))).toEqual([]);
    const imbasille = seed.find((p) => p.id === 'playlist-prg-anathema-imbasille-3')!;
    expect(imbasille.tracks.map((t) => t.fileName).slice(2)).toEqual(HIPPO_SOURCES);
  });
});
