/**
 * domSizes — Maps DOM CSS pixel values to Pixi layout values.
 *
 * The DOM uses CSS pixels directly (font-size: 11px = 11px visually).
 * Pixi DynamicBitmapFont rasterizes at 48px/2x and scales down.
 * This creates a visual size mismatch — Pixi text at fontSize:11
 * appears slightly different from CSS 11px due to bitmap scaling.
 *
 * These converters ensure GL components use sizes that produce
 * the same visual result as the DOM CSS equivalents.
 *
 * Calibrated by comparing DOM screenshots to GL screenshots.
 */

// ── Font Size ──────────────────────────────────────────────────────────────────
// Pixi bitmap fonts render slightly smaller than CSS fonts at the same nominal px.
// This multiplier compensates so `domFontSize(11)` produces the same visual
// size as CSS `font-size: 11px`.
const FONT_SCALE = 1.0; // 1.0 = no adjustment. Increase if Pixi text looks smaller.

/**
 * Convert a DOM CSS font-size (px) to Pixi BitmapText fontSize.
 * Use this everywhere you'd set fontSize on a pixiBitmapText.
 *
 * @example
 *   // DOM: text-[11px] → GL:
 *   <pixiBitmapText style={{ fontSize: domFont(11) }} />
 */
export function domFont(cssPx: number): number {
  return Math.round(cssPx * FONT_SCALE);
}

// ── Tailwind text-* class shortcuts ────────────────────────────────────────────
/** text-[8px] */  export const FONT_8  = domFont(8);
/** text-[9px] */  export const FONT_9  = domFont(9);
/** text-[10px] */ export const FONT_10 = domFont(10);
/** text-[11px] */ export const FONT_11 = domFont(11);
/** text-xs (12px) */ export const FONT_XS = domFont(12);
/** text-sm (14px) */ export const FONT_SM = domFont(14);
/** text-base (16px) */ export const FONT_BASE = domFont(16);
/** text-lg (18px) */ export const FONT_LG = domFont(18);

// ── Spacing ────────────────────────────────────────────────────────────────────
// Pixi @pixi/layout uses Yoga which interprets px values differently from CSS.
// In practice, 1 Pixi layout px ≈ 1 CSS px, so no scaling needed for spacing.
// But if we find a consistent offset, adjust here.
const SPACING_SCALE = 1.0;

/**
 * Convert a DOM CSS spacing value (px) to Pixi layout value.
 * Use for padding, margin, gap, width, height.
 *
 * @example
 *   // DOM: px-3 (12px) → GL:
 *   layout={{ paddingLeft: domPx(12) }}
 */
export function domPx(cssPx: number): number {
  return Math.round(cssPx * SPACING_SCALE);
}

// ── Tailwind spacing shortcuts (1 unit = 4px) ─────────────────────────────────
/** p-0.5 = 2px */  export const SP_0_5 = domPx(2);
/** p-1 = 4px */    export const SP_1   = domPx(4);
/** p-1.5 = 6px */  export const SP_1_5 = domPx(6);
/** p-2 = 8px */    export const SP_2   = domPx(8);
/** p-3 = 12px */   export const SP_3   = domPx(12);
/** p-4 = 16px */   export const SP_4   = domPx(16);
/** gap-1 = 4px */  export const GAP_1  = domPx(4);
/** gap-1.5 = 6px */export const GAP_1_5 = domPx(6);
/** gap-2 = 8px */  export const GAP_2  = domPx(8);

// ── Icon Size ──────────────────────────────────────────────────────────────────
// Lucide icons are rendered as SVG→Texture sprites.
// DOM uses <Icon size={14} /> which produces 14×14px SVG.
// Pixi sprites at width:14 height:14 should match.
const ICON_SCALE = 1.0;

/**
 * Convert a DOM Lucide icon size to Pixi sprite size.
 *
 * @example
 *   // DOM: <Volume2 size={14} /> → GL:
 *   <pixiSprite width={domIcon(14)} height={domIcon(14)} />
 */
export function domIcon(cssPx: number): number {
  return Math.round(cssPx * ICON_SCALE);
}

// ── Common DOM element heights ─────────────────────────────────────────────────
/** Channel header row 1 (28px in DOM) */
export const CHANNEL_HEADER_H = domPx(28);
/** Channel header row 2 — column labels (20px in DOM) */
export const COLUMN_LABELS_H = domPx(20);
/** Total channel header (48px) */
export const TOTAL_HEADER_H = CHANNEL_HEADER_H + COLUMN_LABELS_H;
/** Button height sm (24px in DOM) */
export const BTN_SM_H = domPx(24);
/** Button height md (28px in DOM) */
export const BTN_MD_H = domPx(28);
