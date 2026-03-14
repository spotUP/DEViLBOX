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

import { BitmapFontManager, type TextStyleFontWeight } from 'pixi.js';
import { FAD_ICONS } from './fontaudioIcons';

declare global {
  interface Window {
    /**
     * Persists the web-font face load promise across Vite HMR reloads.
     * Prevents re-adding fontaudio to document.fonts on every hot update,
     * which would accumulate duplicate FontFace entries.
     */
    __pixiFontFacePromise?: Promise<void>;
  }
}

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
 * Load all bitmap fonts. Call once during app initialization.
 * Safe to call multiple times — subsequent calls await the same font-face
 * load promise, then run installFonts() (guarded by module-level flag).
 *
 * Split into two guards:
 * - loadFontAudioFace is window-level: persists across HMR, prevents adding
 *   duplicate FontFace entries to document.fonts on each hot update.
 * - installFonts is module-level: resets on HMR so fonts are re-registered
 *   with the new WebGL context whenever the PixiJS Application is recreated.
 */
export function loadPixiFonts(): Promise<void> {
  if (!window.__pixiFontFacePromise) {
    window.__pixiFontFacePromise = loadFontAudioFace();
  }
  return window.__pixiFontFacePromise.then(() => installFonts());
}

/** Load the fontaudio @font-face programmatically */
async function loadFontAudioFace(): Promise<void> {
  const face = new FontFace('fontaudio', "url('/fonts/fontaudio.woff2')");
  document.fonts.add(face);
  await face.load();
  // Also wait for all other web fonts (Inter, JetBrains Mono)
  await document.fonts.ready;
}

/**
 * Guard against multiple installs within a single module lifetime.
 * Resets on Vite HMR module re-evaluation so installFonts() re-runs
 * after PixiJS Application recreation (new WebGL context needs new atlases).
 */
let _fontsInstalled = false;

/**
 * Install DynamicBitmapFont for all UI font families.
 * Canvas-rasterized at 48px / 2x resolution (96px effective detail).
 *
 * PixiJS v8 warns "[Cache] already has key: -bitmap" for fonts 2–7 because
 * they share a single internal atlas key. These warnings are expected and
 * harmless — all 7 fonts are installed successfully despite the warning.
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

  for (const fb of fonts) {
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
}
