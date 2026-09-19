/**
 * The doubled Play/Stop pair that appears when the dub bus is on — and why the
 * second one did nothing.
 *
 * Long-standing, reported again 2026-09-19 with a screenshot showing two
 * overlapping transport buttons. Closed once before as "NavBar grid overflow",
 * which it was not.
 *
 * TWO transport rows exist by design: `FT2Toolbar`'s own, and a compact one in
 * the NavBar meant to REPLACE it while the toolbar is hidden by dub-deck
 * fullscreen. They were gated on different flags:
 *
 *   TrackerView hides the toolbar on `editorFullscreen`
 *   NavBar showed its row on `!stripCollapsed`
 *
 * Those are kept in step only by one-way effects in `DubDeckStrip` that each
 * fire when THEIR OWN input changes — enabling the bus expands the strip, and
 * expanding the strip sets fullscreen. So anything that clears
 * `editorFullscreen` without touching `stripCollapsed` leaves the strip
 * expanded AND the toolbar visible, and both rows render. It shows up with the
 * dub bus because enabling the bus is what expands the strip in the first
 * place.
 *
 * The second half — "and it doesn't work" — is a different fault with the same
 * root: the NavBar drives handlers that `FT2Toolbar` registers and deliberately
 * keeps alive after unmount. An unmounted component stops rendering, so any
 * value captured from its last render freezes. The NavBar computed its LABEL
 * from the live store while calling a handler frozen at `isPlaying === false`:
 * the button read "Stop Song" and tried to start playback again.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const nav = read('components/layout/NavBar.tsx');
const view = read('components/tracker/TrackerView.tsx');
const toolbar = read('components/tracker/FT2Toolbar/FT2Toolbar.tsx');

describe('exactly one transport row, ever', () => {
  it('the NavBar row appears on the same flag that hides the toolbar', () => {
    expect(view).toContain('{!editorFullscreen && (');
    expect(nav).toContain("const dubDeckTransportActive = n.activeView === 'tracker' && editorFullscreen;");
  });

  it('does not ask a second question that can disagree', () => {
    // `!stripCollapsed` was that second question. Matched against CODE only —
    // the comment above the condition names it while explaining the history,
    // and a test that reads comments proves nothing.
    const code = nav
      .split('\n')
      .filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toContain('stripCollapsed');
  });

  it('leaves no dead subscription behind', () => {
    expect(nav).not.toContain('useDubStore');
  });
});

describe('the handlers the NavBar drives read live state', () => {
  it('play/stop decides from the store, not from a captured render', () => {
    expect(toolbar).toContain('const isPlaying = useTransportStore.getState().isPlaying;');
  });

  it('pattern play reads both flags live', () => {
    expect(toolbar).toContain('const { isPlaying, isLooping } = useTransportStore.getState();');
  });

  it('still registers its handlers for the NavBar to call', () => {
    // The bridge itself is correct and stays: the toolbar hands its handlers
    // over so the transport survives its own unmount.
    expect(toolbar).toContain('useFT2ToolbarActions.getState().register({');
    expect(toolbar).not.toContain('return () => useFT2ToolbarActions.getState().unregister();');
  });
});
