import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The NavBar's Load must work while the Dub Deck is open.
 *
 * Expanding the strip sets editorFullscreen, which unmounts FT2Toolbar; the
 * NavBar row that replaces it called the toolbar's local file-browser state
 * setter through the actions registry — a setter of an unmounted component,
 * so nothing happened. "i cant press some buttons when the dub bus is
 * active/fold out, load for example" (2026-09-22).
 */
const navBar = readFileSync(join(process.cwd(), 'src/components/layout/NavBar.tsx'), 'utf-8');
const registry = readFileSync(join(process.cwd(), 'src/stores/useFT2ToolbarActions.ts'), 'utf-8');
const toolbar = readFileSync(join(process.cwd(), 'src/components/tracker/FT2Toolbar/FT2Toolbar.tsx'), 'utf-8');
const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf-8');

describe('NavBar Load while the dub deck is open', () => {
  it('opens the always-mounted App-level file browser', () => {
    expect(navBar).toContain("onClick={() => useUIStore.getState().setShowFileBrowser(true)}>Load</Button>");
    expect(app).toMatch(/\{showFileBrowser && \(\s*<FileBrowser/);
  });

  it('has no path through a handler owned by the unmounted toolbar', () => {
    expect(registry).not.toMatch(/^\s*openFileBrowser:/m);
    expect(toolbar).not.toContain('openFileBrowser:');
    expect(navBar).not.toContain('ft2Actions.openFileBrowser');
  });
});
