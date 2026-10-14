/**
 * Owner 2026-10-14 "fix all nuade formats": a multi-subsong file on nuade showed no subsong control until the first play
 * had loaded the engine (nativeSubsongs is the engine's load report). Swept over the nuade table (121 rows; the 25 rows
 * below are the multi-subsong corpus songs whose control was missing at import): the player is asked at import, and the
 * control (subsongStatus) shows nuade's own count as soon as the song is applied.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { applyNuadeChoice } from '@/lib/import/parsers/withNuade';
import { useFormatStore } from '@stores/useFormatStore';
import { subsongStatus } from '@/lib/tracker/subsongSwitch';
import { NuadeHeadless } from '@/engine/nuade/nuadeHeadless';
import { NUADE_FORMATS } from '@/engine/nuade/nuadeFormats';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = join(__dirname, '../../../..');
// [row id, corpus song, subsongs nuade reports]
const ROWS: [string, string, number][] = [
  ['actionamics', 'public/data/songs/actionamics/dynablaster.ast', 20],
  ['bendaglish', 'public/data/songs/ben-daglish/motorhead-titleandingame.bd', 3],
  ['coredesign', 'public/data/songs/core-design/dynamite dux.core', 34],
  ['davelowe', 'public/data/songs/dave-lowe-new/m-bison.dln', 2],
  ['davidwhittaker', 'public/data/songs/formats/apb.dw', 8],
  ['desire', 'public/data/songs/desire/batmanreturns.dsr', 10],
  ['digmug', 'public/data/songs/digital-mugician/believe.dmu', 2],
  ['dsc', "public/data/songs/digital-sonix-and-chrome/David Hanlon/dragon'sbreath enfx.dsc", 4],
  ['fredgray', 'public/data/songs/formats/eco.gray', 4],
  ['instereo2', 'public/data/songs/formats/stereo_feeling.is20', 2],
  ['jankomrsicflogel', 'public/data/songs/formats/spacestation.jmf', 2],
  ['jasonbrooke', 'public/data/songs/formats/ikari_warriors.jb', 3],
  ['jesperolsen', 'public/data/songs/jesper-olsen/guldkornsexpressen ingame.jo', 15],
  ['markcooksey', 'public/data/songs/mark-cooksey/mighty bombjack.mc', 12],
  ['markcooksey_old', 'public/data/songs/mark-cooksey-old/mco.overlander', 5],
  ['medley', 'public/data/songs/medley/combat.mso', 7],
  ['mikedavies', 'public/data/songs/mike-davies/strider.md', 5],
  ['paulsummers', 'public/data/songs/formats/everton_fc_-_jingles.snk', 6],
  ['professionalsoundartists', 'public/data/songs/professional-sound-artists/test module.psa', 2],
  ['robhubbardst', 'public/data/songs/formats/battleships.rho', 2],
  ['seanconnolly', 'public/data/songs/formats/surf_ninjas.scn', 7],
  ['soundimages', 'public/data/songs/formats/blinkys scary school-sfx.tw', 5],
  ['specialfx', 'public/data/songs/special-fx/striker ingame.jd', 34],
  ['stevebarrett', 'public/data/songs/formats/street_fighter.sb', 5],
  ['wallybeben', 'public/data/songs/formats/wicked.wb', 9],
];

describe('a multi-subsong file on nuade shows its subsong control at import', () => {
  it.each(ROWS)('%s: subsongStatus has nuade\'s count before any engine has loaded', async (id, file, count) => {
    const bytes = readFileSync(join(ROOT, file));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const nu = await NuadeHeadless.create();
    nu.clearFiles(); nu.open(new Uint8Array(buffer), basename(file), id);
    expect(nu.subsongCount, 'nuade reports this count').toBe(count);
    nu.close();
    const song = await applyNuadeChoice({ instruments: [], patterns: [], format: 'MOD' } as unknown as TrackerSong, {
      buffer, fileName: basename(file), prefs: { [NUADE_FORMATS[id]!.prefKey]: 'nuade' } as never,
    });
    expect(song.nuadePlayerId).toBe(id);
    useFormatStore.getState().reset();
    useFormatStore.getState().applyEditorMode(song as never);
    expect(subsongStatus(useFormatStore.getState())).toMatchObject({ source: 'native', count, current: nu.defaultSubsong });
  }, 30_000);
});
