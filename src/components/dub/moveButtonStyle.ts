/**
 * The look of a dub move button.
 *
 * CALM palette (owner decision 2026-10-11, after the deck read as "a x-mas
 * tree": 54 move buttons in seven hues, error/warning/success used as move
 * categories). An idle move button is neutral. A button takes the single
 * accent only while its move is firing or latched. WHICH move it is, is said
 * by its label and its position in the deck, never by a colour.
 *
 * The recipe is `calmControlStyle` in the design system, shared with the deck
 * FX pads. This file adds only the move-button class and the hover variables.
 *
 * `MoveColor` / `MOVE_COLOR` survive as a CATEGORY TAG on the move tables
 * (the controller-shaped deck and the tests still group by it). They no longer
 * choose a paint colour: the recipe ignores them on purpose.
 */

import { calmControlStyle } from '@components/ui/controlColor';

/**
 * A move's category tag. Not a paint colour (see the file header); the values
 * stay CSS variables so existing move tables keep type-checking.
 */
export type MoveColor =
  | 'var(--color-accent)'
  | 'var(--color-accent-secondary)'
  | 'var(--color-accent-highlight)'
  | 'var(--color-warning)'
  | 'var(--color-error)'
  | 'var(--color-success)'
  | 'var(--color-text)';

/** Shorthands, so a move table reads as a move table rather than as CSS. */
export const MOVE_COLOR = {
  primary: 'var(--color-accent)',
  secondary: 'var(--color-accent-secondary)',
  highlight: 'var(--color-accent-highlight)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  success: 'var(--color-success)',
  neutral: 'var(--color-text)',
} as const satisfies Record<string, MoveColor>;

/**
 * The part of a button that never varies.
 *
 * nowrap: on the column grid a wrapped label would make one button taller than
 * its row. 'sm' is the channel-strip size; at 'md' the same buttons stacked in
 * one column ran ~600 px and the deck, capped at 75 % of the viewport, clipped
 * every strip.
 */
const BASE = {
  md: 'px-2.5 py-1 rounded border text-xs font-bold whitespace-nowrap transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
  sm: 'px-1 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
} as const;

export interface MoveButtonStyle {
  className: string;
  style: React.CSSProperties;
}

/**
 * One move button's className and inline colours.
 *
 * Lit means: the accent at full strength behind near-black text, with the
 * glow. Unlit means: a neutral wash with its own label and edge, and hovering
 * lifts the one under the cursor. Every button does this; none of them opts
 * out, and `_category` deliberately does not change a pixel.
 */
export function moveButtonStyle(
  _category: MoveColor,
  active: boolean,
  size: 'md' | 'sm' = 'md',
): MoveButtonStyle {
  const c = calmControlStyle(active);
  return {
    className: `${BASE[size]} dub-move-button${active ? ' is-active' : ''}`,
    style: {
      color: c.color,
      backgroundColor: c.backgroundColor,
      borderColor: c.borderColor,
      boxShadow: c.boxShadow,
      // Read by the hover rule in index.css, which cannot know the colour.
      ['--dub-move-hover-bg' as string]: c.hoverBackground,
      ['--dub-move-hover-border' as string]: c.hoverBorder,
    },
  };
}
