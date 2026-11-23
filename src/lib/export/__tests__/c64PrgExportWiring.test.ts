/** Commodore 64 PRG export wiring: availability gate follows the SID chip id, the dialog mode is registered, and the exporter module runs the GoatTracker converter and relocator. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { c64PrgExportAvailable } from '../c64/c64Export';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';

const root = join(__dirname, '../../../..');
describe('Commodore 64 PRG export wiring', () => {
  it('is available only for songs whose only chip is one SID', () => {
    expect(c64PrgExportAvailable([FurnaceDispatchPlatform.C64_6581])).toBe(true);
    expect(c64PrgExportAvailable([FurnaceDispatchPlatform.C64_8580])).toBe(true);
    expect(c64PrgExportAvailable([FurnaceDispatchPlatform.C64_8580, FurnaceDispatchPlatform.C64_8580])).toBe(false);
    expect(c64PrgExportAvailable([FurnaceDispatchPlatform.GB])).toBe(false);
    expect(c64PrgExportAvailable(undefined)).toBe(false);
  });
  it('dialog mode, handler and tile are connected to the converter', () => {
    const hook = readFileSync(join(root, 'src/hooks/dialogs/useExportDialog.ts'), 'utf8');
    const dlg = readFileSync(join(root, 'src/lib/export/ExportDialog.tsx'), 'utf8');
    expect(hook).toMatch(/ExportMode = .*'c64Prg'/);
    expect(hook).toContain("c64Prg: '.prg'");
    expect(hook).toContain('exportC64Prg()');
    expect(dlg).toContain("case 'c64Prg':");
    expect(dlg).toContain("setExportMode('c64Prg')");
    const mod = readFileSync(join(root, 'src/lib/export/c64/c64Export.ts'), 'utf8');
    expect(mod).toContain('furnaceToGoatTracker(');
    expect(mod).toContain("'gt_export_prg'");
    expect(readdirSync(join(root, 'public/gtultra'))).toEqual(expect.arrayContaining(['GTUltra.js', 'GTUltra.wasm']));
  });
});
