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

  /**
   * This assertion used to pin `!stripCollapsed`, which was the BUG rather
   * than the intent.
   *
   * `TrackerView` hides `FT2Toolbar` on `editorFullscreen`; the NavBar row
   * exists to replace it while it is hidden. Asking a different question —
   * "is the strip expanded?" — let the two answers come apart: enabling the bus
   * expands the strip, expanding the strip sets fullscreen, but each of those
   * effects only fires when its own input changed, so turning fullscreen off by
   * any other route left the strip expanded AND the toolbar visible. Both rows
   * rendered. That is the doubled Play/Stop pair, reported repeatedly and once
   * "fixed" as a NavBar grid overflow, which it was not.
   *
   * Corrected to the intent: exactly one transport, ever.
   */
  it('renders the NavBar transport row exactly when the FT2 toolbar is hidden', () => {
    const nav = read('components/layout/NavBar.tsx');
    const view = read('components/tracker/TrackerView.tsx');
    // The toolbar is hidden on editorFullscreen...
    expect(view).toContain('{!editorFullscreen && (');
    // ...so the replacement row must appear on exactly that condition.
    expect(nav).toContain("const dubDeckTransportActive = n.activeView === 'tracker' && editorFullscreen;");
    expect(nav).not.toContain('!stripCollapsed;');
    expect(nav).toContain('onClick={() => ft2Actions.playSong?.()}');
    expect(nav).toContain('onClick={() => ft2Actions.playPattern?.()}');
    expect(nav).toContain('onClick={() => ft2Actions.openFileBrowser?.()}');
    expect(nav).toContain('onClick={() => ft2Actions.undo?.()}');
    expect(nav).toContain('onClick={() => ft2Actions.redo?.()}');
  });
});
