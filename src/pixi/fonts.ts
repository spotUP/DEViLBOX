/**
 * Bitmap Font Loading for PixiJS
 *
 * Uses DynamicBitmapFont (Canvas-rasterized at high resolution) instead of MSDF atlases.
 * MSDF fonts require a custom SDF shader per BitmapText, which forces isBatchable=false
 * in PixiJS v8's GraphicsContextSystem — each of the 183 BitmapText elements in the UI
 * becomes a separate draw call (400+ per frame).
 *
 * DynamicBitmapFont uses no custom shader → batchable → all BitmapText elements batch
 * into a handful of draw calls. Rasterized at 48px with 2x resolution (96px effective)
 * for crisp rendering even at high zoom levels.
 */

import { BitmapFontManager, Cache, type TextStyleFontWeight } from 'pixi.js';

/** Font family names used throughout the PixiJS UI */
export const PIXI_FONTS = {
  MONO: 'JetBrainsMono-Regular',
  MONO_BOLD: 'JetBrainsMono-Bold',
  SANS: 'Inter-Regular',
  SANS_MEDIUM: 'Inter-Medium',
  SANS_SEMIBOLD: 'Inter-SemiBold',
  SANS_BOLD: 'Inter-Bold',
} as const;

/**
 * Shared promise for font loading — ensures React Strict Mode double-invocation
 * waits for the same loading operation instead of racing.
 */
let fontLoadPromise: Promise<void> | null = null;

/**
 * Load all bitmap fonts. Call once during app initialization.
 * Safe to call multiple times — subsequent calls await the same promise.
 */
export function loadPixiFonts(): Promise<void> {
  if (!fontLoadPromise) {
    fontLoadPromise = Promise.resolve(installFonts());
  }
  return fontLoadPromise;
}

/** Guard against multiple installs across HMR reloads / StrictMode double-mounts */
let _fontsInstalled = false;

/** Extra characters used as icons/symbols in the GL UI (beyond ASCII) */
const EXTRA_CHARS = '±·¼É×é–—•…₁₂₃₆⅓⅛⅟←↑→↓↔⇥⇱⇲−∞≡⊓⊕⊞⊿⏎─│┊┌┐└┘├┤┬┴┼═█■▲△▴▶▸▾◂◈○◎●★☰♫♬✓✕';

/**
 * Install DynamicBitmapFont for all UI font families.
 * Canvas-rasterized at 48px / 2x resolution (96px effective detail).
 */
function installFonts(): void {
  if (_fontsInstalled) return;
  _fontsInstalled = true;
  const monoFamily = 'JetBrains Mono, Menlo, Consolas, monospace';
  const sansFamily = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

  // Build character set: ASCII + UI symbol characters
  const charSet: [string, string][] = [[' ', '~']];
  for (const c of EXTRA_CHARS) {
    charSet.push([c, c]);
  }

  const fallbacks: { name: string; family: string; weight: TextStyleFontWeight }[] = [
    { name: PIXI_FONTS.MONO,          family: monoFamily, weight: 'normal' },
    { name: PIXI_FONTS.MONO_BOLD,     family: monoFamily, weight: 'bold'   },
    { name: PIXI_FONTS.SANS,          family: sansFamily, weight: 'normal' },
    { name: PIXI_FONTS.SANS_MEDIUM,   family: sansFamily, weight: '500'    },
    { name: PIXI_FONTS.SANS_SEMIBOLD, family: sansFamily, weight: '600'    },
    { name: PIXI_FONTS.SANS_BOLD,     family: sansFamily, weight: 'bold'   },
  ];

  for (const fb of fallbacks) {
    const cacheKey = `${fb.name}-bitmap`;
    // Skip if already installed (avoids [Cache] "already has key" warning)
    if (Cache.has(cacheKey)) continue;
    try {
      BitmapFontManager.install({
        name: fb.name,
        style: {
          fontFamily: fb.family,
          fontWeight: fb.weight,
          fontSize: 48,
          fill: 0xffffff,
        },
        chars: charSet,
        resolution: 2, // 96px effective — crisp up to ~8x zoom
      });
    } catch {
      // Font install failed — continue with remaining fonts
    }
  }
}
