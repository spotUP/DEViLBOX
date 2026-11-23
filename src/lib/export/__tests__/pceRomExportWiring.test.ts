/** PC Engine ROM export wiring: availability gate follows the PCE chip id, the dialog mode is registered, and the exporter module calls the HuSIC converter. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pceRomExportAvailable } from '../pce/pceExport';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';

const root = join(__dirname, '../../../..');
describe('PC Engine ROM export wiring', () => {
  it('is available only for songs whose only chip is one HuC6280', () => {
    expect(pceRomExportAvailable([FurnaceDispatchPlatform.PCE])).toBe(true);
    expect(pceRomExportAvailable([FurnaceDispatchPlatform.GB])).toBe(false);
    expect(pceRomExportAvailable(undefined)).toBe(false);
  });
  it('dialog mode, handler and tile are connected to the converter', () => {
    const hook = readFileSync(join(root, 'src/hooks/dialogs/useExportDialog.ts'), 'utf8');
    const dlg = readFileSync(join(root, 'src/lib/export/ExportDialog.tsx'), 'utf8');
    expect(hook).toMatch(/ExportMode = .*'pceRom'/);
    expect(hook).toContain("pceRom: '.pce'");
    expect(hook).toContain('exportPceRom()');
    expect(dlg).toContain("case 'pceRom':");
    expect(dlg).toContain("setExportMode('pceRom')");
    expect(readFileSync(join(root, 'src/lib/export/pce/pceExport.ts'), 'utf8')).toContain('furnaceToHusic(');
    expect(readdirSync(join(root, 'public/pce'))).toEqual(expect.arrayContaining(['player.pce', 'player.json']));
  });
});
