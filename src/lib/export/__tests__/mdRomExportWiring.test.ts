/** MD ROM export wiring: availability gate follows the GB chip id, the dialog mode is registered, and the exporter module calls the hUGE builder. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { mdRomExportAvailable } from '../md/mdExport';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';

const root = join(__dirname, '../../../..');
describe('MD ROM export wiring', () => {
  it('is available only for songs with a Mega Drive chip', () => {
    expect(mdRomExportAvailable([FurnaceDispatchPlatform.GENESIS])).toBe(true);
    expect(mdRomExportAvailable([FurnaceDispatchPlatform.SMS])).toBe(false);
    expect(mdRomExportAvailable(undefined)).toBe(false);
    expect(mdRomExportAvailable([FurnaceDispatchPlatform.GENESIS_EXT])).toBe(true);
    expect(mdRomExportAvailable([FurnaceDispatchPlatform.YM2612_EXT, FurnaceDispatchPlatform.SMS])).toBe(true);
    expect(mdRomExportAvailable([FurnaceDispatchPlatform.YM2612, FurnaceDispatchPlatform.SMS])).toBe(true);
  });
  it('dialog mode, handler and tile are connected to the builder', () => {
    const hook = readFileSync(join(root, 'src/hooks/dialogs/useExportDialog.ts'), 'utf8');
    const dlg = readFileSync(join(root, 'src/lib/export/ExportDialog.tsx'), 'utf8');
    expect(hook).toMatch(/ExportMode = .*'mdRom'/);
    expect(hook).toContain("mdRom: '.bin'");
    expect(hook).toContain('exportMdRom()');
    expect(dlg).toContain("case 'mdRom':");
    expect(dlg).toContain("setExportMode('mdRom')");
    expect(readFileSync(join(root, 'src/lib/export/md/mdExport.ts'), 'utf8')).toContain('buildMdRom(');
    expect(readdirSync(join(root, 'public/md'))).toContain('player.bin');
  });
});
