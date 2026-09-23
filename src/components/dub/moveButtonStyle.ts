/**
 * The look of a dub move button.
 *
 * It does not define one. It calls the design system's colour-coded control
 * recipe — the drum pad's, now shared — with the move's hue, and every button
 * in the deck comes out with the same behaviour: the same resting surface, the
 * same hover, the same lit state, the same glow. The colour says WHICH move it
 * is, and nothing else.
 *
 * What was here before: a seventeen-case switch of hand-written Tailwind
 * strings. They had drifted apart until some buttons hovered their border and
 * some hovered nothing, active text was `text-text-inverse` in places and
 * `text-white` in others, and exactly one token carried a glow. Asked about it
 * repeatedly across 2026-09-23 — "why are the buttons so different? only some
 * have an outline when i hover them and some have crazy weird bg colors when
 * hovered... i undestand you tried to color code by group? but you failed
 * hard" — and then, decisively, "we have better color coded buttons in the
 * drum pad view" and "if the drum pad buttons are not in the design system
 * they need to go there and be the source of truth". They are there now.
 */

import { deriveControlColors } from '@components/ui/controlColor';

/**
 * A move's hue.
 *
 * CSS variables, not hex, so the deck follows the theme — and not Tailwind
 * opacity variants, because a tint, a border and a glow cannot be derived from
 * `bg-accent-primary/70`. The recipe takes one colour and produces all three.
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
 * The hue lives in the style, not the class, because it is derived at runtime
 * from the theme. The class carries only what is identical on every button.
 *
 * Lit means: the hue at full strength behind near-black text, with the glow.
 * Unlit means: the hue as a wash, its own label, its own edge — so a row of
 * idle buttons reads as a row rather than as a paintbox, and hovering lifts the
 * one under the cursor. Every button does this; none of them opts out.
 */
export function moveButtonStyle(
  color: MoveColor,
  active: boolean,
  size: 'md' | 'sm' = 'md',
): MoveButtonStyle {
  const c = deriveControlColors(color);
  return {
    className: `${BASE[size]} dub-move-button${active ? ' is-active' : ''}`,
    style: {
      color: active ? 'var(--color-bg)' : c.text,
      backgroundColor: active ? c.text : c.bg,
      borderColor: active ? c.text : c.border,
      boxShadow: active ? `0 0 10px 2px ${c.glow}` : undefined,
      // Read by the hover rule in index.css, which cannot know the hue.
      ['--dub-move-hover-bg' as string]: c.border,
      ['--dub-move-hover-border' as string]: c.text,
    },
  };
}
