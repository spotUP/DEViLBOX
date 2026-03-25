/**
 * DAW Mode Theme — Modern DAW color palette and sizing constants.
 *
 * Inspired by Ableton Live / Bitwig dark themes.
 * Deep blue-black backgrounds with indigo/amber/emerald accents.
 */

// ── Background & Surface ──
export const DAW_BG          = 0x121218;
export const DAW_PANEL_BG    = 0x1a1a24;
export const DAW_PANEL_BORDER = 0x2a2a3a;
export const DAW_SURFACE     = 0x22222e;
export const DAW_SURFACE_HOVER = 0x2a2a38;

// ── Accents ──
export const DAW_ACCENT      = 0x6366f1;  // Indigo — primary accent
export const DAW_ACCENT_WARM = 0xf59e0b;  // Amber — playhead, highlights
export const DAW_SUCCESS     = 0x10b981;  // Emerald — active/on/play
export const DAW_ERROR       = 0xef4444;  // Red — record, danger

// ── Text ──
export const DAW_TEXT        = 0xe2e2e8;
export const DAW_TEXT_SEC    = 0x6b6b80;
export const DAW_TEXT_MUTED  = 0x44445a;

// ── Channel Colors (one per SID voice) ──
export const DAW_CH_COLORS = [
  0x6366f1,  // CH1 indigo
  0xf59e0b,  // CH2 amber
  0x10b981,  // CH3 emerald
  0xec4899,  // CH4 pink
  0x06b6d4,  // CH5 cyan
  0xa855f7,  // CH6 purple
];

// ── Piano Roll Grid ──
export const DAW_GRID_WHITE_KEY = 0x1a1a24;
export const DAW_GRID_BLACK_KEY = 0x161620;
export const DAW_GRID_BEAT      = 0x2a2a3a;
export const DAW_GRID_SUB       = 0x1e1e28;

// ── Sizing ──
export const DAW_TOOLBAR_H     = 36;
export const DAW_BOTTOM_H      = 240;
export const DAW_SIDEBAR_W     = 280;
export const DAW_ARRANGEMENT_H = 220;
export const DAW_CHANNEL_HEADER_W = 50;
export const DAW_PIANO_KEYS_W  = 40;
export const DAW_VELOCITY_H    = 50;

// ── Radius & Spacing ──
export const DAW_RADIUS        = 4;
export const DAW_RADIUS_LG     = 6;
export const DAW_GAP           = 4;
export const DAW_PAD           = 8;
