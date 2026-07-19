import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression: the pattern editor rendered TWO fullscreen buttons in normal
 * (non-fullscreen) mode, both drawn with the same Maximize2 icon so they looked
 * like duplicates:
 *
 *  1. EditorControlsBar toolbar — a *browser* fullscreen toggle
 *     (`document.documentElement.requestFullscreen()`, "Toggle Fullscreen (F11)").
 *     Redundant with the browser's own F11 and editor-agnostic.
 *  2. TrackerView pattern-editor overlay (bottom-right corner) — the *editor*
 *     fullscreen toggle (`toggleEditorFullscreen`, "Fullscreen editor" / "Exit
 *     fullscreen (Esc)"), which expands the editor pane within the app.
 *
 * Fix: drop the redundant browser-fullscreen button from EditorControlsBar and
 * keep the editor-fullscreen overlay as the single canonical control.
 *
 * jsdom has no layout engine and the project forbids Playwright, so the
 * invariant is guarded at its source.
 */
describe('pattern editor exposes a single fullscreen control', () => {
  const root = process.cwd();
  const editorControlsBar = readFileSync(
    resolve(root, 'src/components/tracker/EditorControlsBar.tsx'),
    'utf-8',
  );
  const trackerView = readFileSync(
    resolve(root, 'src/components/tracker/TrackerView.tsx'),
    'utf-8',
  );

  it('EditorControlsBar no longer renders a browser-fullscreen button', () => {
    expect(editorControlsBar).not.toContain('requestFullscreen');
    expect(editorControlsBar).not.toContain('Toggle Fullscreen');
  });

  it('TrackerView keeps the editor-fullscreen overlay as the canonical toggle', () => {
    expect(trackerView).toContain('toggleEditorFullscreen');
    expect(trackerView).toContain('Fullscreen editor');
  });
});
