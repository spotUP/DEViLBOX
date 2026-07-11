import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Boot flash regression: the very first frame the browser paints (before the JS
 * module bundle loads src/index.css) is driven ONLY by the inline <style> in
 * index.html. If the <html> backdrop element is left unstyled there, the browser
 * shows its default white for that frame — a flash that burns eyes in dark rooms.
 *
 * These assertions fail if the inline dark <html> rule is ever removed.
 */
describe('boot flash: html backdrop painted dark before bundle loads', () => {
  const repoRoot = process.cwd(); // vitest runs with cwd = repo root
  const indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  const appCss = readFileSync(resolve(repoRoot, 'src/index.css'), 'utf8');

  it('inline <style> in index.html gives html a dark background-color', () => {
    // grab the first inline <style>...</style> block (the boot/loading styles)
    const styleBlock = indexHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(styleBlock).not.toBe('');
    const htmlRule = styleBlock.match(/html\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(htmlRule).toMatch(/background-color\s*:\s*#0a0a0b/i);
  });

  it('inline body rule stays dark too (loading screen backdrop)', () => {
    const styleBlock = indexHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    const bodyRule = styleBlock.match(/body\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(bodyRule).toMatch(/background-color\s*:\s*#0a0a0b/i);
  });

  it('app css html rule keeps a background so no white shows after the theme loads', () => {
    const htmlRule = appCss.match(/\bhtml\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(htmlRule).toMatch(/background-color\s*:/i);
  });
});
