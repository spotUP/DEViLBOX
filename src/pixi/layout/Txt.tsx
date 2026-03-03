/**
 * Txt — The <span>/<p> equivalent for the GL UI.
 *
 * Wraps <pixiBitmapText> with Tailwind class parsing for text styling.
 * Extracts font size, weight, color, and alignment from className.
 *
 * Usage:
 *   <Txt className="text-sm font-semibold text-text-muted">Hello world</Txt>
 *   <Txt className="text-xs text-accent-primary uppercase">STATUS</Txt>
 */

import React, { useMemo } from 'react';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { TEXT_SIZE, resolveTextColor, tw } from './tw';
import type { LayoutStyles } from '@pixi/layout';

const EMPTY_LAYOUT: LayoutStyles = {};

interface TxtProps {
  /** Tailwind class string for text styling + layout */
  className?: string;
  /** Explicit layout overrides */
  layout?: LayoutStyles;
  /** Alpha override */
  alpha?: number;
  children: string;
}

// Font weight → font family mapping
const WEIGHT_FONTS: Record<string, Record<string, string>> = {
  sans: {
    regular: PIXI_FONTS.SANS,
    medium: PIXI_FONTS.SANS_MEDIUM,
    semibold: PIXI_FONTS.SANS_SEMIBOLD,
    bold: PIXI_FONTS.SANS_BOLD,
  },
  mono: {
    regular: PIXI_FONTS.MONO,
    medium: PIXI_FONTS.MONO,
    semibold: PIXI_FONTS.MONO_BOLD,
    bold: PIXI_FONTS.MONO_BOLD,
  },
};

export const Txt: React.FC<TxtProps> = ({
  className,
  layout: layoutOverride,
  alpha: alphaProp,
  children,
}) => {
  const theme = usePixiTheme();

  const { text, fontFamily, fontSize, tint, textAlpha, computedLayout } = useMemo(() => {
    let size = 12; // default text-sm
    let weight = 'regular';
    let family = 'sans';
    let color: number | undefined;
    let alpha = 1;
    let transform: 'none' | 'uppercase' = 'none';

    // Remaining classes for layout parsing
    const layoutClasses: string[] = [];

    if (className) {
      const classes = className.split(/\s+/).filter(Boolean);
      for (const cls of classes) {
        // Text size
        if (TEXT_SIZE[cls] !== undefined) { size = TEXT_SIZE[cls]; continue; }

        // Font weight
        if (cls === 'font-medium') { weight = 'medium'; continue; }
        if (cls === 'font-semibold') { weight = 'semibold'; continue; }
        if (cls === 'font-bold') { weight = 'bold'; continue; }
        if (cls === 'font-normal') { weight = 'regular'; continue; }

        // Font family
        if (cls === 'font-mono') { family = 'mono'; continue; }
        if (cls === 'font-sans') { family = 'sans'; continue; }

        // Text color
        if (cls.startsWith('text-') && !TEXT_SIZE[cls]) {
          const colorKey = cls.slice(5); // e.g., "text-muted" from "text-text-muted"
          const resolved = resolveTextColor(colorKey, theme);
          if (resolved !== undefined) { color = resolved; continue; }
        }

        // Text transform
        if (cls === 'uppercase') { transform = 'uppercase'; continue; }

        // Tracking (letter spacing) — yoga doesn't support this, skip
        if (cls.startsWith('tracking-')) { continue; }

        // Text alignment — not supported in BitmapText directly, skip
        if (cls === 'text-center' || cls === 'text-left' || cls === 'text-right') { continue; }

        // Pass remaining classes to layout parser
        layoutClasses.push(cls);
      }
    }

    const resolvedFont = WEIGHT_FONTS[family]?.[weight] ?? PIXI_FONTS.SANS;
    const displayText = transform === 'uppercase' ? children.toUpperCase() : children;
    const base = layoutClasses.length > 0 ? tw(layoutClasses.join(' '), theme) : EMPTY_LAYOUT;
    const layout = layoutOverride ? { ...base, ...layoutOverride } : base;

    return {
      text: displayText,
      fontFamily: resolvedFont,
      fontSize: size,
      tint: color ?? theme.text.color,
      textAlpha: alpha,
      computedLayout: layout,
    };
  }, [className, theme, children, layoutOverride]);

  return (
    <pixiBitmapText
      text={text}
      style={{ fontFamily, fontSize, fill: 0xffffff }}
      tint={tint}
      alpha={alphaProp ?? textAlpha}
      layout={computedLayout === EMPTY_LAYOUT ? EMPTY_LAYOUT : computedLayout}
    />
  );
};
