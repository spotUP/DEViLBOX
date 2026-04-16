/**
 * Centralized semantic color constants for PixiJS components.
 *
 * Theme-dependent colors (bg, text, borders) come from usePixiTheme().
 * These are domain-specific colors that stay consistent across themes.
 */

// ─── Cell / Data Colors (Tailwind palette equivalents) ──────────────────────

/** Note name text */
export const CELL_NOTE      = 0xf2f0f0;
/** Instrument number text */
export const CELL_INSTRUMENT = 0xfbbf24; // amber-400
/** Volume column text */
export const CELL_VOLUME    = 0x4ade80; // green-400
/** Effect column text */
export const CELL_EFFECT    = 0xf97316; // orange-500
/** Empty/dot placeholder */
export const CELL_EMPTY     = 0x3a3232;
/** Purple accent (effect params, selections) */
export const CELL_ACCENT    = 0xa855f7; // purple-500
/** Slide/portamento */
export const CELL_SLIDE     = 0x60a5fa; // blue-400

// ─── Synth Knob Accent Colors ───────────────────────────────────────────────

export const KNOB_YELLOW    = 0xffcc00;
export const KNOB_CYAN      = 0x06b6d4;
export const KNOB_ORANGE    = 0xff9900;
export const KNOB_RED       = 0xff3333;
export const KNOB_GREEN     = 0x22c55e;
export const KNOB_BLUE      = 0x3b82f6;
export const KNOB_PURPLE    = 0xa855f7;

// ─── Macro / Automation Lane Colors ─────────────────────────────────────────

export const LANE_CUTOFF    = 0x22c55e; // green
export const LANE_RESONANCE = 0xeab308; // yellow
export const LANE_ENVMOD    = 0x06b6d4; // cyan
export const LANE_PAN       = 0x3b82f6; // blue

// ─── Panel Background Tints (dark neutrals) ─────────────────────────────────

export const PANEL_BG_DARK     = 0x0b0909;
export const PANEL_BG          = 0x111111;
export const PANEL_BG_MEDIUM   = 0x141414;
export const PANEL_BG_LIGHT    = 0x161616;
export const PANEL_BG_LIGHTER  = 0x1a1a1a;

// ─── Deck Colors (DJ view) ──────────────────────────────────────────────────

export const DECK_A = 0x60a5fa; // blue
export const DECK_B = 0xf87171; // red
export const DECK_C = 0x34d399; // green

// ─── Mixer Colors ───────────────────────────────────────────────────────────

export const VU_GREEN       = 0x22c55e;
export const VU_YELLOW      = 0xeab308;
export const VU_RED         = 0xef4444;
export const MUTE_COLOR     = 0xef4444;
export const SOLO_COLOR     = 0xfbbf24;

// ─── Effect Type Colors ──────────────────────────────────────────────────────

export const EFFECT_TYPE_TONEJS     = 0x3b82f6; // blue
export const EFFECT_TYPE_NEURAL     = 0xa855f7; // purple
export const EFFECT_TYPE_BUZZMACHINE = 0xf97316; // orange
export const EFFECT_TYPE_WASM       = 0x10b981; // green
export const EFFECT_TYPE_WAM        = 0x14b8a6; // teal

// ─── DJ Pad Category Colors ─────────────────────────────────────────────────

export const DJ_STUTTER      = 0xff9900; // orange (same as KNOB_ORANGE)
export const DJ_DELAY        = 0xffcc00; // gold (same as KNOB_YELLOW)
export const DJ_FILTER       = 0x14b8a6; // teal (same as EFFECT_TYPE_WAM)
export const DJ_REVERB       = 0x3b82f6; // blue (same as KNOB_BLUE)
export const DJ_MODULATION   = 0xa855f7; // purple (same as KNOB_PURPLE)
export const DJ_DISTORTION   = 0xef4444; // red (same as VU_RED)
export const DJ_TAPE         = 0x1a1a2e; // dark (same as TOOLTIP_BG)
export const DJ_ONESHOT      = 0xfbbf24; // amber (same as CELL_INSTRUMENT)
export const DJ_SCRATCH      = 0x06b6d4; // cyan (same as KNOB_CYAN)
export const DJ_SCRATCH_ADV  = 0x0891b2; // darker cyan
export const DJ_SCRATCH_EXP  = 0x0e7490; // deep cyan
export const DJ_SCRATCH_CTL  = 0xef4444; // red (stop/control)
export const DJ_DECK_FX      = 0x22c55e; // green (deck-targeted effects)

// ─── UI Element Colors ──────────────────────────────────────────────────────

export const TOOLTIP_BG     = 0x1a1a2e;
export const TOOLTIP_BORDER = 0x2a2a4e;

// ─── Undo/Action Type Colors ────────────────────────────────────────────────

export const ACTION_NOTE     = 0x60a5fa; // blue
export const ACTION_EFFECT   = 0x4ade80; // green
export const ACTION_INSERT   = 0xfbbf24; // yellow
export const ACTION_DELETE   = 0xf87171; // red
export const ACTION_PATTERN  = 0xa78bfa; // purple
export const ACTION_MOVE     = 0x2dd4bf; // teal
export const ACTION_BULK     = 0xfb923c; // orange

// ─── Color Utilities ────────────────────────────────────────────────────────

/** Convert 0xRRGGBB to '#rrggbb' for DOM usage */
export function colorToHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/** Darken a color to create a tinted background (e.g., dark red for error states) */
export function tintBg(color: number, factor = 0.15): number {
  return (((color >> 16 & 0xff) * factor | 0) << 16) | (((color >> 8 & 0xff) * factor | 0) << 8) | ((color & 0xff) * factor | 0);
}

// ─── Misc ───────────────────────────────────────────────────────────────────

export const WHITE          = 0xffffff;
export const BLACK          = 0x000000;
export const SELECTION_FILL = 0x3b82f6;
export const CURSOR_COLOR   = 0xffffff;
