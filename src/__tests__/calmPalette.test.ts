import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * CALM palette ratchet for the DJ view and the dub deck (owner decision
 * 2026-10-11, after the DJ view read as "a x-mas tree": 13 raw Tailwind hues in
 * 28 files and 66 distinct hex colours).
 *
 * Rules the code is held to:
 *  - surfaces and text: theme tokens only;
 *  - hue only where it carries meaning: ONE identity colour per deck
 *    (--color-deck-a/b/c in src/index.css, read through text-deck-a ... or
 *    src/lib/deckIdentity.ts), ONE accent for live state, error/warning/success
 *    for real states;
 *  - so a raw Tailwind hue class (text-red-400, bg-emerald-900/30 ...) and a
 *    hex literal do not belong in these folders.
 *
 * Exempt, because they are not DOM chrome: components/dj/visualizers/**
 * (canvas/WebGL palettes) and the 3D views (DeckVinyl3DView, MixerVestax3DView,
 * DJ3DOverlay). Test folders are not scanned.
 */

// CALM_ROOT lets the revert-check point the scan at an older checkout.
const ROOT = process.env.CALM_ROOT ?? process.cwd();
const SCAN = ['src/components/dj', 'src/components/dub', 'src/components/instruments/controls/DubSirenControls.tsx'];
const EXEMPT = [
  'src/components/dj/visualizers/',
  'src/components/dj/DeckVinyl3DView.tsx',
  'src/components/dj/MixerVestax3DView.tsx',
  'src/components/dj/DJ3DOverlay.tsx',
];

function walk(path: string, out: string[] = []): string[] {
  const st = statSync(path);
  if (st.isFile()) {
    if (/\.(tsx?|css)$/.test(path)) out.push(path);
    return out;
  }
  for (const name of readdirSync(path)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    walk(join(path, name), out);
  }
  return out;
}

function sources(): { file: string; lines: string[] }[] {
  return SCAN.flatMap((p) => walk(join(ROOT, p)))
    .map((abs) => relative(ROOT, abs))
    .filter((f) => !EXEMPT.some((e) => f === e || f.startsWith(e)))
    .map((file) => ({ file, lines: readFileSync(join(ROOT, file), 'utf-8').split('\n') }));
}

const HUES = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
/** text-red-400, hover:bg-emerald-900/30, ring-amber-500 ... */
export const RAW_HUE_CLASS = new RegExp(
  `\\b(?:text|bg|border|ring|fill|stroke|from|via|to|divide|outline|shadow|decoration|accent|caret)-(?:${HUES})-\\d{2,3}\\b`,
);
/** #fff, #1a1a1a, #ff00ff80 */
export const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;

/**
 * Hex literals that are allowed, each with the reason. Matched per line of
 * code (comment-only lines are skipped). Anything else is a violation.
 */
export const HEX_ALLOWLIST: { file: string; line: RegExp; why: string }[] = [
  {
    // Meter/theme reads: the literal is only the last-resort fallback when a
    // theme variable is missing; the colour shown is the theme's.
    file: '*',
    line: /getPropertyValue\([^)]*\)[^|]*\|\|\s*'#[0-9a-fA-F]{3,8}'/,
    why: 'fallback for a missing theme CSS variable',
  },
  {
    file: 'src/components/dj/QRCode.tsx',
    line: /#(?:000000|ffffff|fff)\b/,
    why: 'a QR code must be black on white to scan, whatever the theme',
  },
  {
    file: 'src/components/dj/DeckCuePoints.tsx',
    line: /^\s*'#[0-9A-F]{6}',\s*\/\/ \d: /,
    why: 'hot-cue palette: eight cue slots told apart by colour, as on every DJ controller',
  },
];

function violations(re: RegExp, allow: (file: string, line: string) => boolean): string[] {
  const out: string[] = [];
  for (const { file, lines } of sources()) {
    lines.forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
      if (re.test(line) && !allow(file, line)) out.push(`${file}:${i + 1}: ${code.slice(0, 120)}`);
    });
  }
  return out;
}

describe('CALM palette: DJ view and dub deck', () => {
  it('scans the DJ and dub folders (the ratchet is not vacuous)', () => {
    const files = sources().map((s) => s.file);
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('src/components/dj/DJDeck.tsx');
    expect(files).toContain('src/components/dub/moveButtonStyle.ts');
    expect(files).toContain('src/components/instruments/controls/DubSirenControls.tsx');
    expect(files.some((f) => f.includes('/visualizers/'))).toBe(false);
  });

  it('catches the patterns it exists for', () => {
    expect(RAW_HUE_CLASS.test('className="text-red-400 hover:bg-emerald-900/30"')).toBe(true);
    expect(RAW_HUE_CLASS.test('ring-amber-500')).toBe(true);
    expect(RAW_HUE_CLASS.test('text-accent-error bg-dark-bgTertiary text-deck-a')).toBe(false);
    expect(HEX_LITERAL.test("color: '#60a5fa'")).toBe(true);
    expect(HEX_LITERAL.test('var(--color-deck-a)')).toBe(false);
  });

  it('uses no raw Tailwind hue class (red, amber, blue ...): hue comes from a token', () => {
    expect(violations(RAW_HUE_CLASS, () => false)).toEqual([]);
  });

  it('uses no hex colour literal outside the commented allowlist', () => {
    const bad = violations(HEX_LITERAL, (file, line) =>
      HEX_ALLOWLIST.some((a) => (a.file === '*' || a.file === file) && a.line.test(line)),
    );
    expect(bad).toEqual([]);
  });

  it('keeps every allowlist entry alive, so a stale exemption cannot hide a new violation', () => {
    for (const a of HEX_ALLOWLIST) {
      const hit = sources().some(
        ({ file, lines }) => (a.file === '*' || a.file === file) && lines.some((l) => a.line.test(l)),
      );
      expect(hit, `allowlist entry no longer matches anything: ${a.why}`).toBe(true);
    }
  });

  it('defines the deck identity colours once, in the theme, and Tailwind reads them', () => {
    const css = readFileSync(join(ROOT, 'src/index.css'), 'utf-8');
    const tw = readFileSync(join(ROOT, 'tailwind.config.js'), 'utf-8');
    for (const d of ['a', 'b', 'c']) {
      expect(css).toMatch(new RegExp(`--color-deck-${d}:\\s*#[0-9a-fA-F]{6}`));
      expect(tw).toContain(`tone('--color-deck-${d}')`);
    }
  });
});
