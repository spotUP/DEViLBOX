/** GB ROM export wiring: availability gate follows the GB chip id, the dialog mode is registered, and the exporter module calls the hUGE builder. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gbRomExportAvailable } from '../gb/gbExport';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';

const root = join(__dirname, '../../../..');
describe('GB ROM export wiring', () => {
  it('is available only for songs with a Game Boy chip', () => {
    expect(gbRomExportAvailable([FurnaceDispatchPlatform.GB])).toBe(true);
    expect(gbRomExportAvailable([FurnaceDispatchPlatform.SMS])).toBe(false);
    expect(gbRomExportAvailable(undefined)).toBe(false);
  });
  it('dialog mode, handler and tile are connected to the builder', () => {
    const hook = readFileSync(join(root, 'src/hooks/dialogs/useExportDialog.ts'), 'utf8');
    const dlg = readFileSync(join(root, 'src/lib/export/ExportDialog.tsx'), 'utf8');
    expect(hook).toMatch(/ExportMode = .*'gbRom'/);
    expect(hook).toContain("gbRom: '.gb'");
    expect(hook).toContain('exportGbRom()');
    expect(dlg).toContain("case 'gbRom':");
    expect(dlg).toContain("setExportMode('gbRom')");
    expect(readFileSync(join(root, 'src/lib/export/gb/gbExport.ts'), 'utf8')).toContain('buildHugeRom(');
    expect(readdirSync(join(root, 'public/gb'))).toContain('huge-player.gb');
  });
});
