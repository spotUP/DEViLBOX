/**
 * Regression: a Digital Sonix & Chrome song opened on subsong N set no fileSubsongs, so on nuade (which drops the
 * UADE subsong list) the song had no nuadeSubsong: the grid showed tune N while nuade played tune 0, and the
 * live switch only moved the engine, never the grid. Now the tune is a fileSubsongs entry like Quartet's.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseModuleToSong } from '../parseModuleToSong';
import { dscSubsongCount, decodeDscModule } from '../formats/DigitalSonixChromeModule';
import { subsongStatus } from '@/lib/tracker/subsongSwitch';
import { useFormatStore } from '@/stores/useFormatStore';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const NAME = "dragon'sbreath_fanfares.dsc";
const path = join(process.cwd(), 'public/data/songs/formats', NAME);
const bytes = new Uint8Array(readFileSync(path));

describe.skipIf(!existsSync(path))('DSC subsongs on nuade', () => {
  it('opens subsong 1 with fileSubsongs current 1 and nuadeSubsong 1', async () => {
    const count = dscSubsongCount(decodeDscModule(bytes));
    expect(count).toBeGreaterThan(1);
    const song = await parseModuleToSong(new File([bytes.slice()], NAME), 1) as TrackerSong;
    expect(song.fileSubsongs).toMatchObject({ count, current: 1 });
    if (song.nuadePlayerId) expect(song.nuadeSubsong).toBe(1);
  });

  it('the format store offers the file subsong selector once the uade list is gone (nuade)', async () => {
    const song = await parseModuleToSong(new File([bytes.slice()], NAME), 1) as TrackerSong;
    delete (song as { uadeEditableSubsongs?: unknown }).uadeEditableSubsongs;
    useFormatStore.getState().applyEditorMode(song);
    expect(subsongStatus(useFormatStore.getState())).toMatchObject({ source: 'file', current: 1 });
  });
});
