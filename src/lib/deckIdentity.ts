/**
 * Deck identity colours for code that cannot use a Tailwind class: canvas,
 * workers and WebGL.
 *
 * The colours are defined ONCE, as `--color-deck-a/b/c` in `src/index.css`
 * (Tailwind reads the same variables as `text-deck-a` etc.). This module only
 * resolves them, so changing a deck's colour is a one-line CSS edit.
 */

import { resolveColor } from '@components/ui/controlColor';

export type DeckIdentityId = 'A' | 'B' | 'C';

const DECK_VAR: Record<DeckIdentityId, string> = {
  A: 'var(--color-deck-a)',
  B: 'var(--color-deck-b)',
  C: 'var(--color-deck-c)',
};

/** The deck's identity colour as hex. Unknown ids fall back to deck A. */
export function deckAccent(deckId: string): string {
  return resolveColor(DECK_VAR[deckId as DeckIdentityId] ?? DECK_VAR.A);
}

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
 * A dark surface tinted with the deck colour (the record label under the
 * platter): the identity colour mixed 18 % into the theme background.
 */
export function deckLabelSurface(deckId: string): string {
  const [ar, ag, ab] = channels(deckAccent(deckId));
  const [br, bg, bb] = channels(resolveColor('var(--color-bg)'));
  const mix = (a: number, b: number) =>
    Math.round(a * 0.18 + b * 0.82).toString(16).padStart(2, '0');
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}
