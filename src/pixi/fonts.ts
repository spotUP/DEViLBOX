/**
 * MSDF Font Loading for PixiJS
 * Loads pre-generated MSDF bitmap font atlases for resolution-independent text rendering.
 * Falls back to dynamic bitmap fonts generated from system fonts when MSDF files aren't available.
 */

import { Assets, BitmapFontManager } from 'pixi.js';

/** Font family names used throughout the PixiJS UI */
export const PIXI_FONTS = {
  MONO: 'JetBrainsMono-Regular',
  MONO_BOLD: 'JetBrainsMono-Bold',
  SANS: 'Inter-Regular',
  SANS_MEDIUM: 'Inter-Medium',
  SANS_SEMIBOLD: 'Inter-SemiBold',
  SANS_BOLD: 'Inter-Bold',
} as const;

/** Whether fonts have been loaded */
let fontsLoaded = false;

/**
 * Load all MSDF bitmap fonts. Call once during app initialization.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function loadPixiFonts(): Promise<void> {
  if (fontsLoaded) return;
  // Set immediately to prevent double-entry from React Strict Mode
  fontsLoaded = true;

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

  let msdfLoaded = false;
  try {
    await Assets.load(fontDefs.map(d => d.name));
    msdfLoaded = true;
  } catch {
    // MSDF font atlas files not available — install dynamic fallback fonts
  }

  if (!msdfLoaded) {
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

  const fallbacks = [
    { name: PIXI_FONTS.MONO, family: monoFamily, weight: 'normal' },
    { name: PIXI_FONTS.MONO_BOLD, family: monoFamily, weight: 'bold' },
    { name: PIXI_FONTS.SANS, family: sansFamily, weight: 'normal' },
    { name: PIXI_FONTS.SANS_MEDIUM, family: sansFamily, weight: '500' },
    { name: PIXI_FONTS.SANS_SEMIBOLD, family: sansFamily, weight: '600' },
    { name: PIXI_FONTS.SANS_BOLD, family: sansFamily, weight: 'bold' },
  ];

  for (const fb of fallbacks) {
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
      // Font already installed or install failed — continue
    }
  }
}
