/**
 * tw() — Tailwind-to-Yoga layout property parser.
 *
 * Converts Tailwind CSS class strings into @pixi/layout compatible yoga props.
 * Theme-aware: color classes resolve to numeric theme colors via a theme object.
 *
 * Usage:
 *   const layout = tw('flex flex-col gap-4 p-6', theme);
 *   <layoutContainer layout={layout} />
 *
 * Supported classes:
 *   Flex:    flex, flex-col, flex-row, flex-1, flex-wrap, flex-nowrap, shrink-0
 *   Align:   items-center, items-start, items-end, items-stretch, items-baseline
 *   Justify: justify-center, justify-between, justify-end, justify-start, justify-around, justify-evenly
 *   Gap:     gap-{n}, gap-x-{n}, gap-y-{n}
 *   Padding: p-{n}, px-{n}, py-{n}, pt-{n}, pb-{n}, pl-{n}, pr-{n}
 *   Margin:  m-{n}, mx-{n}, my-{n}, mt-{n}, mb-{n}, ml-{n}, mr-{n}, m-auto, mx-auto
 *   Width:   w-{n}, w-full, w-auto, min-w-0, max-w-{n}
 *   Height:  h-{n}, h-full, h-auto, min-h-0, max-h-{n}
 *   Border:  border, border-2, border-b, border-t, border-l, border-r
 *   Radius:  rounded, rounded-sm, rounded-md, rounded-lg, rounded-xl, rounded-full
 *   Overflow: overflow-hidden, overflow-scroll, overflow-visible, overflow-y-auto
 *   Position: absolute, relative, static, sticky, inset-0
 *   Top/Left: top-0, left-0, right-0, bottom-0
 *   Colors:  bg-dark-{name}, border-dark-{name}, border-accent-{name}
 *   Display: hidden
 *
 * Spacing scale: n * 4px (Tailwind standard). Supports decimals like p-1.5
 */

import type { PixiTheme } from '../theme';
import type { LayoutStyles } from '@pixi/layout';

// Tailwind spacing: 1 unit = 4px
function spacing(n: number): number {
  return n * 4;
}

// Parse spacing value from class suffix — handles integers, decimals, fractions, and px
function parseSpacing(val: string): number | undefined {
  if (val === 'px') return 1; // Tailwind 'px' = 1px
  if (val.includes('/')) {
    const [a, b] = val.split('/');
    return spacing(Number(a) / Number(b));
  }
  if (val.includes('.')) return spacing(parseFloat(val));
  const n = parseInt(val, 10);
  if (isNaN(n)) return undefined;
  return spacing(n);
}

// Named max-width breakpoints (Tailwind defaults)
const MAX_W: Record<string, number> = {
  xs: 320, sm: 384, md: 448, lg: 512, xl: 576,
  '2xl': 672, '3xl': 768, '4xl': 896, '5xl': 1024, '6xl': 1152, '7xl': 1280,
};

// Named width values (w-64 = 256px, etc.)
const NAMED_W: Record<string, number> = {
  '0': 0, '1': 4, '2': 8, '3': 12, '4': 16, '5': 20, '6': 24, '8': 32,
  '10': 40, '12': 48, '16': 64, '20': 80, '24': 96, '32': 128, '40': 160,
  '48': 192, '56': 224, '64': 256, '72': 288, '80': 320, '96': 384,
};

// Resolve bg/border color class to theme color number
function resolveColor(cls: string, theme: PixiTheme): number | undefined {
  // bg-dark-{key} or border-dark-{key}
  const colorMap: Record<string, number> = {
    'dark-bg': theme.bg.color,
    'dark-bgSecondary': theme.bgSecondary.color,
    'dark-bgTertiary': theme.bgTertiary.color,
    'dark-bgHover': theme.bgHover.color,
    'dark-bgActive': theme.bgActive.color,
    'dark-border': theme.border.color,
    'dark-borderLight': theme.borderLight.color,
    'accent-primary': theme.accent.color,
    'accent-secondary': theme.accentSecondary.color,
    'accent-warning': theme.warning.color,
    'accent-error': theme.error.color,
    'accent-success': theme.success.color,
  };
  return colorMap[cls];
}

// Text color classes → theme color number (for Txt component)
export function resolveTextColor(cls: string, theme: PixiTheme): number | undefined {
  const map: Record<string, number> = {
    'text-primary': theme.text.color,
    'text-secondary': theme.textSecondary.color,
    'text-muted': theme.textMuted.color,
    'text-inverse': theme.textInverse.color,
    'accent-primary': theme.accent.color,
    'accent-secondary': theme.accentSecondary.color,
    'accent-warning': theme.warning.color,
    'accent-error': theme.error.color,
    'accent-success': theme.success.color,
  };
  return map[cls];
}

// Text size classes → font size in pixels
export const TEXT_SIZE: Record<string, number> = {
  'text-xs': 12,
  'text-sm': 14,
  'text-base': 16,
  'text-lg': 18,
  'text-xl': 21,
  'text-2xl': 26,
  'text-[10px]': 10,
  'text-[11px]': 11,
  'text-[12px]': 12,
  'text-[14px]': 14,
  'text-[16px]': 16,
  'text-[18px]': 18,
};

/**
 * Parse a Tailwind class string into @pixi/layout yoga style props.
 * Color-related props (backgroundColor, borderColor) require the theme.
 */
export function tw(classNames: string, theme?: PixiTheme): LayoutStyles {
  const s: LayoutStyles = {};
  if (!classNames) return s;

  const classes = classNames.split(/\s+/).filter(Boolean);

  for (const cls of classes) {
    // --- Display / Flex ---
    if (cls === 'flex') { /* default in yoga */ continue; }
    if (cls === 'hidden') { s.display = 'none'; continue; }
    if (cls === 'flex-col') { s.flexDirection = 'column'; continue; }
    if (cls === 'flex-row') { s.flexDirection = 'row'; continue; }
    if (cls === 'flex-col-reverse') { s.flexDirection = 'column-reverse'; continue; }
    if (cls === 'flex-row-reverse') { s.flexDirection = 'row-reverse'; continue; }
    if (cls === 'flex-1') { s.flex = 1; continue; }
    if (cls === 'flex-auto') { s.flexGrow = 1; s.flexShrink = 1; continue; }
    if (cls === 'flex-none') { s.flex = 0; continue; }
    if (cls === 'flex-wrap') { s.flexWrap = 'wrap'; continue; }
    if (cls === 'flex-nowrap') { s.flexWrap = 'nowrap'; continue; }
    if (cls === 'shrink-0') { s.flexShrink = 0; continue; }
    if (cls === 'grow') { s.flexGrow = 1; continue; }
    if (cls === 'grow-0') { s.flexGrow = 0; continue; }

    // --- Align ---
    if (cls === 'items-center') { s.alignItems = 'center'; continue; }
    if (cls === 'items-start') { s.alignItems = 'flex-start'; continue; }
    if (cls === 'items-end') { s.alignItems = 'flex-end'; continue; }
    if (cls === 'items-stretch') { s.alignItems = 'stretch'; continue; }
    if (cls === 'items-baseline') { s.alignItems = 'baseline'; continue; }
    if (cls === 'self-center') { s.alignSelf = 'center'; continue; }
    if (cls === 'self-start') { s.alignSelf = 'flex-start'; continue; }
    if (cls === 'self-end') { s.alignSelf = 'flex-end'; continue; }
    if (cls === 'self-stretch') { s.alignSelf = 'stretch'; continue; }

    // --- Justify ---
    if (cls === 'justify-center') { s.justifyContent = 'center'; continue; }
    if (cls === 'justify-between') { s.justifyContent = 'space-between'; continue; }
    if (cls === 'justify-around') { s.justifyContent = 'space-around'; continue; }
    if (cls === 'justify-evenly') { s.justifyContent = 'space-evenly'; continue; }
    if (cls === 'justify-start') { s.justifyContent = 'flex-start'; continue; }
    if (cls === 'justify-end') { s.justifyContent = 'flex-end'; continue; }

    // --- Gap ---
    let m: RegExpMatchArray | null;
    if ((m = cls.match(/^gap-(\d+\.?\d*)$/))) { s.gap = parseSpacing(m[1]); continue; }
    if ((m = cls.match(/^gap-x-(\d+\.?\d*)$/))) { s.columnGap = parseSpacing(m[1]); continue; }
    if ((m = cls.match(/^gap-y-(\d+\.?\d*)$/))) { s.rowGap = parseSpacing(m[1]); continue; }

    // --- Padding ---
    if ((m = cls.match(/^p-(\d+\.?\d*|px)$/))) { s.padding = parseSpacing(m[1]); continue; }
    if ((m = cls.match(/^px-(\d+\.?\d*|px)$/))) { const v = parseSpacing(m[1]); s.paddingLeft = v; s.paddingRight = v; continue; }
    if ((m = cls.match(/^py-(\d+\.?\d*|px)$/))) { const v = parseSpacing(m[1]); s.paddingTop = v; s.paddingBottom = v; continue; }
    if ((m = cls.match(/^pt-(\d+\.?\d*|px)$/))) { s.paddingTop = parseSpacing(m[1]); continue; }
    if ((m = cls.match(/^pb-(\d+\.?\d*|px)$/))) { s.paddingBottom = parseSpacing(m[1]); continue; }
    if ((m = cls.match(/^pl-(\d+\.?\d*|px)$/))) { s.paddingLeft = parseSpacing(m[1]); continue; }
    if ((m = cls.match(/^pr-(\d+\.?\d*|px)$/))) { s.paddingRight = parseSpacing(m[1]); continue; }

    // --- Margin ---
    if (cls === 'm-auto') { s.margin = 'auto'; continue; }
    if (cls === 'mx-auto') { s.marginLeft = 'auto'; s.marginRight = 'auto'; continue; }
    if ((m = cls.match(/^m-(\d+\.?\d*|px)$/))) { s.margin = parseSpacing(m[1]); continue; }
    if ((m = cls.match(/^mx-(\d+\.?\d*|px)$/))) { const v = parseSpacing(m[1]); s.marginLeft = v; s.marginRight = v; continue; }
    if ((m = cls.match(/^my-(\d+\.?\d*|px)$/))) { const v = parseSpacing(m[1]); s.marginTop = v; s.marginBottom = v; continue; }
    if ((m = cls.match(/^mt-(\d+\.?\d*|px)$/))) { s.marginTop = parseSpacing(m[1]); continue; }
    if ((m = cls.match(/^mb-(\d+\.?\d*|px)$/))) { s.marginBottom = parseSpacing(m[1]); continue; }
    if ((m = cls.match(/^ml-(\d+\.?\d*|px)$/))) { s.marginLeft = parseSpacing(m[1]); continue; }
    if ((m = cls.match(/^mr-(\d+\.?\d*|px)$/))) { s.marginRight = parseSpacing(m[1]); continue; }

    // --- Width / Height ---
    if (cls === 'w-full') { s.width = '100%'; continue; }
    if (cls === 'w-auto') { s.width = 'auto'; continue; }
    if (cls === 'h-full') { s.height = '100%'; continue; }
    if (cls === 'h-auto') { s.height = 'auto'; continue; }
    if ((m = cls.match(/^w-(\d+)$/))) { const n = m[1]; s.width = NAMED_W[n] ?? spacing(parseInt(n)); continue; }
    if ((m = cls.match(/^h-(\d+)$/))) { const n = m[1]; s.height = NAMED_W[n] ?? spacing(parseInt(n)); continue; }
    if ((m = cls.match(/^w-\[(\d+)px\]$/))) { s.width = parseInt(m[1]); continue; }
    if ((m = cls.match(/^h-\[(\d+)px\]$/))) { s.height = parseInt(m[1]); continue; }
    if (cls === 'min-h-0') { s.minHeight = 0; continue; }
    if (cls === 'min-w-0') { s.minWidth = 0; continue; }
    if ((m = cls.match(/^max-w-(.+)$/))) { const v = MAX_W[m[1]]; if (v) s.maxWidth = v; continue; }
    if ((m = cls.match(/^max-h-\[(\d+)px\]$/))) { s.maxHeight = parseInt(m[1]); continue; }

    // --- Border width ---
    if (cls === 'border') { s.borderWidth = 1; continue; }
    if (cls === 'border-0') { s.borderWidth = 0; continue; }
    if (cls === 'border-2') { s.borderWidth = 2; continue; }
    if (cls === 'border-b') { s.borderBottomWidth = 1; continue; }
    if (cls === 'border-t') { s.borderTopWidth = 1; continue; }
    if (cls === 'border-l') { s.borderLeftWidth = 1; continue; }
    if (cls === 'border-r') { s.borderRightWidth = 1; continue; }

    // --- Border radius ---
    if (cls === 'rounded-none') { s.borderRadius = 0; continue; }
    if (cls === 'rounded-sm') { s.borderRadius = 2; continue; }
    if (cls === 'rounded') { s.borderRadius = 4; continue; }
    if (cls === 'rounded-md') { s.borderRadius = 6; continue; }
    if (cls === 'rounded-lg') { s.borderRadius = 8; continue; }
    if (cls === 'rounded-xl') { s.borderRadius = 12; continue; }
    if (cls === 'rounded-2xl') { s.borderRadius = 16; continue; }
    if (cls === 'rounded-full') { s.borderRadius = 9999; continue; }

    // --- Overflow ---
    if (cls === 'overflow-hidden') { s.overflow = 'hidden'; continue; }
    if (cls === 'overflow-scroll' || cls === 'overflow-auto') { s.overflow = 'scroll'; continue; }
    if (cls === 'overflow-visible') { s.overflow = 'visible'; continue; }
    if (cls === 'overflow-y-auto' || cls === 'overflow-y-scroll') { s.overflow = 'scroll'; continue; }
    if (cls === 'overflow-x-auto' || cls === 'overflow-x-scroll') { s.overflow = 'scroll'; continue; }

    // --- Position ---
    if (cls === 'absolute') { s.position = 'absolute'; continue; }
    if (cls === 'relative') { s.position = 'relative'; continue; }
    if (cls === 'static') { s.position = 'static'; continue; }
    if (cls === 'sticky') { s.position = 'relative'; continue; } // best-effort
    if (cls === 'inset-0') { s.top = 0; s.right = 0; s.bottom = 0; s.left = 0; continue; }
    if (cls === 'top-0') { s.top = 0; continue; }
    if (cls === 'left-0') { s.left = 0; continue; }
    if (cls === 'right-0') { s.right = 0; continue; }
    if (cls === 'bottom-0') { s.bottom = 0; continue; }

    // --- Background color (requires theme) ---
    if (theme && cls.startsWith('bg-')) {
      const colorKey = cls.slice(3); // e.g., "dark-bgSecondary"
      // Handle bg-accent-primary/10 (alpha variant)
      const [base] = colorKey.split('/');
      const color = resolveColor(base, theme);
      if (color !== undefined) {
        s.backgroundColor = color;
        // Note: @pixi/layout doesn't support bg alpha directly in the color value,
        // but LayoutContainer uses Graphics.fill which accepts ColorSource
      }
      continue;
    }

    // --- Border color (requires theme) ---
    if (theme && cls.startsWith('border-') && !cls.match(/^border-[btlr0-9]/)) {
      const colorKey = cls.slice(7);
      const [base] = colorKey.split('/');
      const color = resolveColor(base, theme);
      if (color !== undefined) {
        s.borderColor = color;
      }
      continue;
    }

    // Skip text-related classes (handled by Txt component), transition, hover, etc.
    // These are silently ignored as they don't apply to layout containers.
  }

  return s;
}

/**
 * Merge tw() output with explicit overrides.
 * Explicit values take priority over parsed classes.
 */
export function twMerge(classNames: string, overrides: LayoutStyles, theme?: PixiTheme): LayoutStyles {
  return { ...tw(classNames, theme), ...overrides };
}
