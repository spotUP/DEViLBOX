/**
 * MSDF Font Loading for PixiJS
 * Loads pre-generated MSDF bitmap font atlases for resolution-independent text rendering.
 */

import { Assets, BitmapFont } from 'pixi.js';

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

  const fontDefs = [
    { name: PIXI_FONTS.MONO, path: '/fonts/msdf/JetBrainsMono-Regular.json' },
    { name: PIXI_FONTS.MONO_BOLD, path: '/fonts/msdf/JetBrainsMono-Bold.json' },
    { name: PIXI_FONTS.SANS, path: '/fonts/msdf/Inter-Regular.json' },
    { name: PIXI_FONTS.SANS_MEDIUM, path: '/fonts/msdf/Inter-Medium.json' },
    { name: PIXI_FONTS.SANS_SEMIBOLD, path: '/fonts/msdf/Inter-SemiBold.json' },
    { name: PIXI_FONTS.SANS_BOLD, path: '/fonts/msdf/Inter-Bold.json' },
  ];

  // Register all font assets
  for (const def of fontDefs) {
    Assets.add({ alias: def.name, src: def.path });
  }

  // Load all in parallel
  try {
    await Assets.load(fontDefs.map(d => d.name));
    fontsLoaded = true;
  } catch (e) {
    console.warn('[PixiFonts] MSDF fonts not available, falling back to default BitmapFont generation.');
    // Generate fallback bitmap fonts from system fonts
    await generateFallbackFonts();
    fontsLoaded = true;
  }
}

/**
 * Generate fallback bitmap fonts when MSDF atlases aren't available.
 * Uses PixiJS v8's built-in BitmapFont.install() with canvas-rendered glyphs.
 */
async function generateFallbackFonts(): Promise<void> {
  const chars = BitmapFont.ALPHANUMERIC.concat(
    BitmapFont.ASCII,
    [' ', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '+', '=',
     '[', ']', '{', '}', '|', '\\', '/', ':', ';', '"', "'", '<', '>',
     ',', '.', '?', '~', '`', '_']
  );

  // Install minimal fallback fonts
  BitmapFont.install({
    name: PIXI_FONTS.MONO,
    style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fill: 0xffffff },
    chars,
  });

  BitmapFont.install({
    name: PIXI_FONTS.MONO_BOLD,
    style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 'bold', fill: 0xffffff },
    chars,
  });

  BitmapFont.install({
    name: PIXI_FONTS.SANS,
    style: { fontFamily: 'Inter, sans-serif', fontSize: 14, fill: 0xffffff },
    chars,
  });

  BitmapFont.install({
    name: PIXI_FONTS.SANS_MEDIUM,
    style: { fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: '500', fill: 0xffffff },
    chars,
  });

  BitmapFont.install({
    name: PIXI_FONTS.SANS_SEMIBOLD,
    style: { fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: '600', fill: 0xffffff },
    chars,
  });

  BitmapFont.install({
    name: PIXI_FONTS.SANS_BOLD,
    style: { fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 'bold', fill: 0xffffff },
    chars,
  });
}
