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
 *
 * Icon font: fontaudio (https://github.com/fefanto/fontaudio)
 * License: Icons CC BY 4.0, Font SIL OFL 1.1, Code MIT
 */

import { BitmapFontManager, Cache, type TextStyleFontWeight } from 'pixi.js';
import { FAD_ICONS } from './fontaudioIcons';

/** Font family names used throughout the PixiJS UI */
export const PIXI_FONTS = {
  MONO: 'JetBrainsMono-Regular',
  MONO_BOLD: 'JetBrainsMono-Bold',
  SANS: 'Inter-Regular',
  SANS_MEDIUM: 'Inter-Medium',
  SANS_SEMIBOLD: 'Inter-SemiBold',
  SANS_BOLD: 'Inter-Bold',
  ICONS: 'FontAudio-Icons',
} as const;

/**
 * Shared promise for font loading — ensures React Strict Mode double-invocation
 * waits for the same loading operation instead of racing.
 */
let fontLoadPromise: Promise<void> | null = null;

/**
 * Load all bitmap fonts. Call once during app initialization.
 * Safe to call multiple times — subsequent calls await the same promise.
 * Waits for web fonts (including fontaudio) to load before rasterizing.
 */
export function loadPixiFonts(): Promise<void> {
  if (!fontLoadPromise) {
    fontLoadPromise = loadFontAudioFace().then(() => installFonts());
  }
  return fontLoadPromise;
}

/** Load the fontaudio @font-face programmatically */
async function loadFontAudioFace(): Promise<void> {
  const face = new FontFace('fontaudio', "url('/fonts/fontaudio.woff2')");
  document.fonts.add(face);
  await face.load();
  // Also wait for all other web fonts (Inter, JetBrains Mono)
  await document.fonts.ready;
}

/** Guard against multiple installs across HMR reloads / StrictMode double-mounts */
let _fontsInstalled = false;

/**
 * Install DynamicBitmapFont for all UI font families.
 * Canvas-rasterized at 48px / 2x resolution (96px effective detail).
 */
function installFonts(): void {
  if (_fontsInstalled) return;
  _fontsInstalled = true;
  const monoFamily = 'JetBrains Mono, Menlo, Consolas, monospace';
  const sansFamily = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

  // ASCII chars for text fonts
  const asciiChars: [string, string][] = [[' ', '~']];

  // Icon chars — all fontaudio codepoints (Private Use Area U+F100–F1FF)
  const iconChars: [string, string][] = [];
  for (const cp of Object.values(FAD_ICONS)) {
    iconChars.push([cp, cp]);
  }

  const fonts: { name: string; family: string; weight: TextStyleFontWeight; chars: [string, string][] }[] = [
    { name: PIXI_FONTS.MONO,          family: monoFamily, weight: 'normal', chars: asciiChars },
    { name: PIXI_FONTS.MONO_BOLD,     family: monoFamily, weight: 'bold',   chars: asciiChars },
    { name: PIXI_FONTS.SANS,          family: sansFamily, weight: 'normal', chars: asciiChars },
    { name: PIXI_FONTS.SANS_MEDIUM,   family: sansFamily, weight: '500',    chars: asciiChars },
    { name: PIXI_FONTS.SANS_SEMIBOLD, family: sansFamily, weight: '600',    chars: asciiChars },
    { name: PIXI_FONTS.SANS_BOLD,     family: sansFamily, weight: 'bold',   chars: asciiChars },
    { name: PIXI_FONTS.ICONS,         family: 'fontaudio', weight: 'normal', chars: iconChars },
  ];

  // Suppress PixiJS Cache warnings during batch font installation.
  // PixiJS v8 warns about a shared '-bitmap' cache key for each install after the first.
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('[Cache] already has key')) return;
    origWarn.apply(console, args);
  };

  try {
    for (const fb of fonts) {
      const cacheKey = `${fb.name}-bitmap`;
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
          chars: fb.chars,
          resolution: 2,
        });
      } catch {
        // Font install failed — continue with remaining fonts
      }
    }
  } finally {
    console.warn = origWarn;
  }
}
