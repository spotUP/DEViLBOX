/**
 * "you removed the border and the background from the button" (2026-10-08).
 * Theme colours are CSS variables; with a plain 'var(--x)' Tailwind cannot
 * apply an opacity modifier, so bg-accent-primary/20 (and every other /NN tint
 * in the app) generated no CSS and the element drew no background at all.
 */
import { describe, it, expect } from 'vitest';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import config from '../../tailwind.config.js';

async function utilitiesFor(classes: string): Promise<string> {
  const result = await postcss([
    tailwindcss({ ...config, content: [{ raw: `<div class="${classes}"></div>`, extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined });
  return result.css;
}

describe('theme colours with an opacity modifier', () => {
  it('generate a faded background, border and text colour', async () => {
    const css = await utilitiesFor('bg-accent-primary/20 border-dark-border/50 text-text-muted/70');
    expect(css).toMatch(/\.bg-accent-primary\\\/20\s*\{[^}]*background-color:[^;]*var\(--color-accent\)[^;]*0\.2/);
    expect(css).toMatch(/\.border-dark-border\\\/50\s*\{[^}]*border-color:[^;]*var\(--color-border\)/);
    expect(css).toMatch(/\.text-text-muted\\\/70\s*\{[^}]*color:[^;]*var\(--color-text-muted\)/);
  });

  it('keep the solid colour without a modifier', async () => {
    const css = await utilitiesFor('bg-dark-bgSecondary');
    expect(css).toMatch(/\.bg-dark-bgSecondary\s*\{[^}]*var\(--color-bg-secondary\) calc\(var\(--tw-bg-opacity, 1\) \* 100%\)/);
  });
});
