/** SNES ROM export wiring: dialog mode, handler and tile reach the TAD build, which exposes the player ROM bytes. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../../..');
describe('SNES ROM export wiring', () => {
  it('dialog mode, handler and tile are connected to the TAD build', () => {
    const hook = readFileSync(join(root, 'src/hooks/dialogs/useExportDialog.ts'), 'utf8');
    const dlg = readFileSync(join(root, 'src/lib/export/ExportDialog.tsx'), 'utf8');
    expect(hook).toMatch(/ExportMode = .*'snesRom'/);
    expect(hook).toContain("snesRom: '.sfc'");
    expect(hook).toContain('handleExportSnesRom');
    expect(hook).toContain('r.playerRom');
    expect(dlg).toContain("case 'snesRom':");
    expect(dlg).toContain("setExportMode('snesRom')");
    expect(dlg).toContain('ex.handleExportSnesRom(');
    expect(readFileSync(join(root, 'src/lib/export/tad/tadProjectBuilder.ts'), 'utf8')).toContain('result.playerRom = ');
    expect(readdirSync(join(root, 'public/tad'))).toContain('player-devilbox-lorom.sfc');
  });
});
