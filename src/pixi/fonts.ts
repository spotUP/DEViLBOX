/**
 * MSDF Font Loading for PixiJS
 * Loads pre-generated MSDF bitmap font atlases for resolution-independent text rendering.
 * Falls back to dynamic bitmap fonts generated from system fonts when MSDF files aren't available.
 */

import { Assets, BitmapFontManager, Cache, type TextStyleFontWeight } from 'pixi.js';

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
 * Load all MSDF bitmap fonts. Call once during app initialization.
 * Safe to call multiple times — subsequent calls await the same promise.
 */
export function loadPixiFonts(): Promise<void> {
  if (!fontLoadPromise) {
    fontLoadPromise = doLoadFonts();
  }
  return fontLoadPromise;
}

async function doLoadFonts(): Promise<void> {
  // Install fallback fonts FIRST so they're available immediately
  // when the Application renders and BitmapText instances are created.
  installFallbackFonts();

  // Then try to load MSDF font atlases (sharper at all sizes, preferred over fallbacks)
  const fontDefs = [
    { name: PIXI_FONTS.MONO, path: '/fonts/msdf/JetBrainsMono-Regular.json' },
    { name: PIXI_FONTS.MONO_BOLD, path: '/fonts/msdf/JetBrainsMono-Bold.json' },
    { name: PIXI_FONTS.SANS, path: '/fonts/msdf/Inter-Regular.json' },
    { name: PIXI_FONTS.SANS_MEDIUM, path: '/fonts/msdf/Inter-Medium.json' },
    { name: PIXI_FONTS.SANS_SEMIBOLD, path: '/fonts/msdf/Inter-SemiBold.json' },
    { name: PIXI_FONTS.SANS_BOLD, path: '/fonts/msdf/Inter-Bold.json' },
  ];

  for (const def of fontDefs) {
    Assets.add({ alias: def.name, src: def.path });
  }

  try {
    // Evict the fallback cache entries before MSDF load so Pixi doesn't warn
    // "already has key" when both register under "${name}-bitmap".
    // We use Cache.remove() (not BitmapFontManager.uninstall()) to avoid
    // destroying the DynamicBitmapFont textures while BitmapText nodes are
    // actively using them — that would cause a red-rectangle flash.
    for (const def of fontDefs) {
      if (Cache.has(`${def.name}-bitmap`)) Cache.remove(`${def.name}-bitmap`);
    }
    await Assets.load(fontDefs.map(d => d.name));
  } catch {
    // MSDF font atlas files not available — reinstall fallback fonts
    installFallbackFonts();
  }
}

/**
 * Install dynamic bitmap fonts as fallbacks when MSDF files aren't available.
 * These use system fonts rendered via Canvas, which works but isn't as crisp as MSDF.
 */
function installFallbackFonts(): void {
  const monoFamily = 'JetBrains Mono, Menlo, Consolas, monospace';
  const sansFamily = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

  const fallbacks: { name: string; family: string; weight: TextStyleFontWeight }[] = [
    { name: PIXI_FONTS.MONO, family: monoFamily, weight: 'normal' },
    { name: PIXI_FONTS.MONO_BOLD, family: monoFamily, weight: 'bold' },
    { name: PIXI_FONTS.SANS, family: sansFamily, weight: 'normal' },
    { name: PIXI_FONTS.SANS_MEDIUM, family: sansFamily, weight: '500' },
    { name: PIXI_FONTS.SANS_SEMIBOLD, family: sansFamily, weight: '600' },
    { name: PIXI_FONTS.SANS_BOLD, family: sansFamily, weight: 'bold' },
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
          fontSize: 32,
          fill: 0xffffff,
        },
        chars: BitmapFontManager.ASCII,
      });
    } catch {
      // Font install failed — continue with remaining fonts
    }
  }
}
