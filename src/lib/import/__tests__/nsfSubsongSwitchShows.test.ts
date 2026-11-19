/**
 * Owner report 2026-11-19: a dropped Metroid .nsf (12 tracks) showed no subsong switch.
 * Drives the real import (nsfToFur wasm -> Furnace song) and the format store, then asks the
 * one subsong model (subsongStatus) what the FT2 toolbar input would show.
 */
import fs from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm } from './furnaceFileOpsWasmHarness';
import { parseModuleToSong } from '../parseModuleToSong';
import { useFormatStore } from '@stores/useFormatStore';
import { subsongStatus } from '@/lib/tracker/subsongSwitch';

const FILES: Array<[string, string, number]> = [
  ['/Users/spot/Downloads/Metroid (EMU).zophar/Metroid (1986-08)(Nintendo R&D1)(Nintendo).nsf', 'metroid.nsf', 12],
  ['/Users/spot/Downloads/NSFE/bioniccommando.nsfe', 'bioniccommando.nsfe', 0],
];

beforeAll(async () => {
  installFurnaceFileOpsWasm();
  await import('../parsers/FurnaceToSong');
}, 300000);

describe('NSF subsong switch shows', { timeout: 300000 }, () => {
  for (const [path, name, tracks] of FILES) {
    it.skipIf(!fs.existsSync(path))(name, async () => {
      const bytes = fs.readFileSync(path);
      const song = await parseModuleToSong(new File([bytes], name));
      useFormatStore.getState().applyEditorMode(song as never);
      const status = subsongStatus(useFormatStore.getState());
      console.log(name, JSON.stringify(status), 'fileSubsongs', JSON.stringify((song as { fileSubsongs?: unknown }).fileSubsongs));
      expect(status).not.toBeNull();
      expect(status!.count).toBeGreaterThan(1);
      if (tracks) expect(status!.count).toBe(tracks);
      // reopenAtFileSubsong reopens from these bytes; the switch target converts the other track
      expect(useFormatStore.getState().nsfFileData).toBeInstanceOf(ArrayBuffer);
      const other = await parseModuleToSong(new File([bytes], name), 2);
      expect((other as { fileSubsongs?: { current: number } }).fileSubsongs?.current).toBe(2);
    });
  }
});
