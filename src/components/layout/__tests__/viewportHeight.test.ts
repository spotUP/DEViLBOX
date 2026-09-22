import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Phase 1 of thoughts/shared/plans/2026-09-22-responsive-mobile.md.
 *
 * Two symptoms, both of them "the app is cut off" rather than "the app is
 * cramped", and both of them caused by a number written in more than one
 * place:
 *
 *  - iOS Safari resolves `100vh` against the viewport with the browser
 *    toolbar HIDDEN, so a `100vh` app shell puts the mobile tab bar
 *    underneath the toolbar. The unit now lives once, as `--app-vh` in
 *    `src/index.css`, upgraded to `100dvh` under `@supports`.
 *  - `Modal`'s default size was `w-96` — 384px fixed — inside the backdrop's
 *    `p-4`, which on a 375px phone leaves 343px. `max-w-md` cannot rescue a
 *    fixed width.
 */

const ROOT = process.cwd();
const INDEX_CSS = join(ROOT, 'src', 'index.css');

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

describe('viewport height has one definition', () => {
  it('src/index.css declares --app-vh with a 100vh fallback and a dvh upgrade', () => {
    const css = readFileSync(INDEX_CSS, 'utf8');
    expect(css).toContain('--app-vh: 100vh;');
    expect(css).toMatch(/@supports \(height: 100dvh\) \{[\s\S]*--app-vh: 100dvh;/);
  });

  it('no .ts/.tsx file writes a literal 100vh', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(join(ROOT, 'src'))) {
      const source = readFileSync(file, 'utf8');
      let index = source.indexOf('100vh');
      while (index !== -1) {
        const line = source.slice(0, index).split('\n').length;
        offenders.push(`${relative(ROOT, file).split(sep).join('/')}:${line}`);
        index = source.indexOf('100vh', index + 1);
      }
    }
    expect(
      offenders,
      'A literal 100vh reaches the DOM. On iOS Safari that height excludes ' +
        'the browser toolbar, so the bottom of the app sits under it. Use ' +
        "`var(--app-vh)` (or Tailwind's h-screen, which resolves to it):\n" +
        offenders.join('\n')
    ).toEqual([]);
  });

  it('src/index.css uses 100vh only for the variable and its own comment', () => {
    const css = readFileSync(INDEX_CSS, 'utf8');
    const declarations = css
      .split('\n')
      .filter((line) => line.includes('100vh') && !line.trimStart().startsWith('*'));
    expect(declarations).toEqual(['  --app-vh: 100vh;']);
  });

  it('the tab bar height is one number, shared by the bar and the space reserved for it', () => {
    const css = readFileSync(INDEX_CSS, 'utf8');
    expect(css).toContain('--mobile-tab-bar-height: 52px;');
    expect(css).toContain(
      'padding-bottom: calc(var(--mobile-tab-bar-height) + env(safe-area-inset-bottom, 0));'
    );

    const bar = readFileSync(join(ROOT, 'src/components/layout/MobileTabBar.tsx'), 'utf8');
    expect(bar).toContain('min-h-[var(--mobile-tab-bar-height)]');
    expect(bar).toContain('safe-area-bottom');

    // The content area reserves the bar AND the home-indicator inset, so the
    // last row of a view is never under either.
    const layout = readFileSync(join(ROOT, 'src/components/layout/AppLayout.tsx'), 'utf8');
    expect(layout).toContain('mobile-bottom-padding');
    expect(layout).not.toContain('pb-[52px]');
  });
});

describe('Modal fits a phone', () => {
  it('no size variant emits a fixed w-<n>', () => {
    const modal = readFileSync(join(ROOT, 'src/components/ui/Modal.tsx'), 'utf8');
    const sizeMap = modal.slice(modal.indexOf('const sizeMap = {'));
    const body = sizeMap.slice(0, sizeMap.indexOf('};') + 2);

    const fixed = body.match(/\bw-\d+\b/g) ?? [];
    expect(
      fixed,
      `Modal size variants must be \`w-full max-w-*\`; a fixed width cannot be ` +
        `narrowed by max-w on a phone. Found: ${fixed.join(', ')}`
    ).toEqual([]);

    expect(body).toContain("sm: 'w-full max-w-sm'");
    expect(body).toContain("md: 'w-full max-w-md'");
  });
});
