/**
 * PixiJS Theme Bridge
 * Converts CSS color tokens from useThemeStore to PixiJS-native numeric colors.
 */

import { useMemo } from 'react';
import { useThemeStore, type ThemeColors } from '@stores/useThemeStore';

/** PixiJS-compatible color: 0xRRGGBB numeric + separate alpha float */
export interface PixiColor {
  color: number;
  alpha: number;
}

/** All ThemeColors tokens converted to PixiJS numeric values */
export interface PixiTheme {
  bg: PixiColor;
  bgSecondary: PixiColor;
  bgTertiary: PixiColor;
  bgHover: PixiColor;
  bgActive: PixiColor;
  border: PixiColor;
  borderLight: PixiColor;
  accent: PixiColor;
  accentSecondary: PixiColor;
  accentGlow: PixiColor;
  text: PixiColor;
  textSecondary: PixiColor;
  textMuted: PixiColor;
  textInverse: PixiColor;
  error: PixiColor;
  success: PixiColor;
  warning: PixiColor;
  trackerRowEven: PixiColor;
  trackerRowOdd: PixiColor;
  trackerRowHighlight: PixiColor;
  trackerRowCurrent: PixiColor;
  trackerRowCursor: PixiColor;
  cellNote: PixiColor;
  cellInstrument: PixiColor;
  cellVolume: PixiColor;
  cellEffect: PixiColor;
  cellAccent: PixiColor;
  cellSlide: PixiColor;
  cellEmpty: PixiColor;
}

/**
 * Parse a CSS color string to PixiJS numeric color + alpha.
 * Supports: #RGB, #RRGGBB, #RRGGBBAA, rgba(r,g,b,a), rgb(r,g,b)
 */
export function cssColorToPixi(cssColor: string): PixiColor {
  const s = cssColor.trim();

  // Handle rgba(r, g, b, a)
  const rgbaMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    return { color: (r << 16) | (g << 8) | b, alpha: a };
  }

  // Handle hex: #RGB, #RRGGBB, #RRGGBBAA
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { color: (r << 16) | (g << 8) | b, alpha: 1 };
    }
    if (hex.length === 6) {
      return { color: parseInt(hex, 16), alpha: 1 };
    }
    if (hex.length === 8) {
      const color = parseInt(hex.slice(0, 6), 16);
      const alpha = parseInt(hex.slice(6, 8), 16) / 255;
      return { color, alpha };
    }
  }

  // Fallback: white
  return { color: 0xffffff, alpha: 1 };
}

/** Convert an entire ThemeColors object to PixiTheme */
function themeColorsToPixi(colors: ThemeColors): PixiTheme {
  const result: Record<string, PixiColor> = {};
  for (const key of Object.keys(colors) as (keyof ThemeColors)[]) {
    result[key] = cssColorToPixi(colors[key]);
  }
  return result as unknown as PixiTheme;
}

/**
 * React hook: subscribes to useThemeStore and returns a reactive PixiTheme.
 * Memoized — only recomputes when the theme ID changes.
 */
export function usePixiTheme(): PixiTheme {
  const theme = useThemeStore(state => state.getCurrentTheme());
  return useMemo(() => themeColorsToPixi(theme.colors), [theme.id]);
}
