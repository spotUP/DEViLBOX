/**
 * Colour-coded controls — the source of truth for every one of them.
 *
 * ONE base colour goes in, and the whole set of surfaces comes out by formula:
 * a readable label, a tinted background, a border, and a glow for when the
 * control is live. A caller picks a hue; it does not get to invent a
 * behaviour.
 *
 * The recipe is the drum pad's, which is the one place in DEViLBOX that had
 * this right — it lived inline in `PadButton` and nothing else could reach it.
 * The dub deck meanwhile grew a seventeen-case switch of hand-written Tailwind
 * strings where some buttons hovered and some did not, some lit by background
 * alone and one had a glow: "why are the buttons so different? only some have
 * an outline when i hover them and some have crazy weird bg colors when
 * hovered... we have better color coded buttons in the drum pad view"
 * (2026-09-23). So the pad's recipe moved here and both call it.
 *
 * Why runtime resolution rather than a table of hex: the accents are CSS
 * variables and change with the theme. A baked table would be wrong the moment
 * anyone switches theme, and Tailwind opacity variants (`bg-accent-primary/70`)
 * cannot express a tint and a glow from the same hue anyway.
 */

/** The four surfaces a colour-coded control draws with. */
export interface ControlColors {
  /** The label, lightened if the hue is too dark to read on a dark panel. */
  text: string;
  /** The resting surface — a wash of the hue, not the hue itself. */
  bg: string;
  /** The edge. */
  border: string;
  /** What it glows when live. */
  glow: string;
}

/** Cache of resolved CSS variables. Cleared when the theme changes. */
const resolved = new Map<string, string>();

if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  // A theme switch rewrites the variables, so anything resolved from them is
  // stale. Watching the attributes that carry the theme is cheaper than
  // reading computed style on every render of every button.
  new MutationObserver(() => resolved.clear()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
  });
}

/**
 * A colour as hex, resolving `var(--name)` against the document.
 *
 * Returns the input unchanged when it is already hex, and a neutral grey when
 * a variable cannot be read — in a test environment, say, where there is no
 * document to ask.
 */
export function resolveColor(color: string): string {
  const trimmed = color.trim();
  if (!trimmed.startsWith('var(')) return trimmed;

  const cached = resolved.get(trimmed);
  if (cached) return cached;

  const name = trimmed.slice(4, -1).split(',')[0].trim();
  const value = typeof document === 'undefined'
    ? ''
    : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = value || '#9ca3af';
  resolved.set(trimmed, hex);
  return hex;
}

/** Hex to its three channels. Accepts `#abc` and `#aabbcc`. */
function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.substring(0, 2), 16) || 0,
    parseInt(full.substring(2, 4), 16) || 0,
    parseInt(full.substring(4, 6), 16) || 0,
  ];
}

/**
 * Lighten a colour that is too dark to read on DEViLBOX's dark panels.
 *
 * Below a relative luminance of 0.35 the label disappears into the background,
 * so the hue is boosted by half until it does not.
 */
export function ensureContrast(hexColor: string): string {
  const [r, g, b] = channels(resolveColor(hexColor));
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance >= 0.35) return resolveColor(hexColor);

  const boost = 1.5;
  const lift = (c: number) => Math.min(255, Math.floor(c * boost)).toString(16).padStart(2, '0');
  return `#${lift(r)}${lift(g)}${lift(b)}`;
}

/**
 * Opacities the whole app shares, so a tint means the same thing everywhere.
 *
 * From the drum pad, which chose them: a wash you can read a label on, an edge
 * that reads as an edge, and a glow with presence but no bloom.
 */
export const CONTROL_ALPHA = { bg: 0.12, border: 0.35, glow: 0.5 } as const;

/** Every surface for one hue. */
export function deriveControlColors(color: string): ControlColors {
  const hex = resolveColor(color);
  const [r, g, b] = channels(hex);
  return {
    text: ensureContrast(hex),
    bg: `rgba(${r},${g},${b},${CONTROL_ALPHA.bg})`,
    border: `rgba(${r},${g},${b},${CONTROL_ALPHA.border})`,
    glow: `rgba(${r},${g},${b},${CONTROL_ALPHA.glow})`,
  };
}
