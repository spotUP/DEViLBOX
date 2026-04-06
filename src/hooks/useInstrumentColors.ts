/**
 * useInstrumentColors — Shared hook for instrument control panel theming.
 *
 * Every instrument control panel picks a "brand color" and derives accent,
 * knob, dim, and panel-background tokens from it.  When the cyan-lineart
 * theme is active the accent snaps to #00ffff.
 *
 * Replaces 40+ inline copies of the same isCyanTheme ternary pattern.
 */

import type React from 'react';
import { useThemeStore } from '@stores';

/** Darken a hex color to ~20% brightness for dim backgrounds. */
function hexToDim(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.round(r * 0.2).toString(16).padStart(2, '0')}${Math.round(g * 0.2).toString(16).padStart(2, '0')}${Math.round(b * 0.2).toString(16).padStart(2, '0')}`;
}

export interface InstrumentColors {
  /** Whether the cyan-lineart theme is active */
  isCyan: boolean;
  /** Primary accent color (#00ffff in cyan theme, brandColor otherwise) */
  accent: string;
  /** Knob/control color (same as accent unless overridden) */
  knob: string;
  /** Dark background tint derived from accent */
  dim: string;
  /** Tailwind panel background classes (bg only — use panelStyle for border) */
  panelBg: string;
  /** Inline style for panel border + background (works with any color) */
  panelStyle: React.CSSProperties;
}

/**
 * Derive a consistent color palette from a brand color.
 *
 * @param brandColor  The instrument's accent color when NOT in cyan theme
 * @param opts.knob   Optional separate knob color (defaults to brandColor)
 * @param opts.dim    Optional explicit dim color (defaults to auto-derived)
 */
export function useInstrumentColors(
  brandColor: string,
  opts?: { knob?: string; dim?: string },
): InstrumentColors {
  const isCyan = useThemeStore((s) => s.currentThemeId) === 'cyan-lineart';
  const accent = isCyan ? '#00ffff' : brandColor;
  const knob = isCyan ? '#00ffff' : (opts?.knob ?? brandColor);
  const dim = isCyan ? '#004444' : (opts?.dim ?? hexToDim(brandColor));
  const panelBg = isCyan
    ? 'bg-[#041510]'
    : '';
  const panelStyle: React.CSSProperties = {
    backgroundColor: dim,
    borderColor: accent + '33', // 20% opacity hex suffix
  };

  return { isCyan, accent, knob, dim, panelBg, panelStyle };
}
