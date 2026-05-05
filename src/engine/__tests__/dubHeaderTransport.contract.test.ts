import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');

function read(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

describe('dub header transport handoff contracts', () => {
  it('keeps FT2 toolbar actions registered when the toolbar unmounts for dub deck fullscreen', () => {
    const toolbar = read('components/tracker/FT2Toolbar/FT2Toolbar.tsx');
    expect(toolbar).toContain('useFT2ToolbarActions.getState().register({');
    expect(toolbar).not.toContain('return () => useFT2ToolbarActions.getState().unregister();');
    expect(toolbar).toContain('the Dub Deck expands by toggling editorFullscreen');
  });

  it('renders the NavBar transport row from the FT2 toolbar action bridge when the dub deck is expanded', () => {
    const nav = read('components/layout/NavBar.tsx');
    expect(nav).toContain("const dubDeckTransportActive = n.activeView === 'tracker' && !stripCollapsed;");
    expect(nav).toContain('onClick={() => ft2Actions.playSong?.()}');
    expect(nav).toContain('onClick={() => ft2Actions.playPattern?.()}');
    expect(nav).toContain('onClick={() => ft2Actions.openFileBrowser?.()}');
    expect(nav).toContain('onClick={() => ft2Actions.undo?.()}');
    expect(nav).toContain('onClick={() => ft2Actions.redo?.()}');
  });
});
