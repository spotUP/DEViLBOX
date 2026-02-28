/**
 * MSDF Font Loading for PixiJS
 * Loads pre-generated MSDF bitmap font atlases for resolution-independent text rendering.
 * Falls back to dynamic bitmap fonts generated from system fonts when MSDF files aren't available.
 *
 * NOTE: Pixi v8's built-in `loadBitmapFont` only handles .xml and .fnt extensions.
 * Our MSDF atlases are .json, so we must manually parse and register them as BitmapFont objects.
 * Without this, Assets.load() for .json falls through to the generic JSON loader, returning a
 * plain object that never gets registered — causing BitmapText to fall back to a DynamicBitmapFont
 * using 'Inter-Regular' as a CSS font family (invalid), rendering with the system default font.
 */

import { Assets, BitmapFont, BitmapFontManager, Cache, type Texture, type TextStyleFontWeight } from 'pixi.js';

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
    { name: PIXI_FONTS.MONO,         path: '/fonts/msdf/JetBrainsMono-Regular.json' },
    { name: PIXI_FONTS.MONO_BOLD,    path: '/fonts/msdf/JetBrainsMono-Bold.json' },
    { name: PIXI_FONTS.SANS,         path: '/fonts/msdf/Inter-Regular.json' },
    { name: PIXI_FONTS.SANS_MEDIUM,  path: '/fonts/msdf/Inter-Medium.json' },
    { name: PIXI_FONTS.SANS_SEMIBOLD,path: '/fonts/msdf/Inter-SemiBold.json' },
    { name: PIXI_FONTS.SANS_BOLD,    path: '/fonts/msdf/Inter-Bold.json' },
  ];

  try {
    await Promise.all(fontDefs.map(def => loadMSDFFontFromJson(def.name, def.path)));
  } catch {
    // MSDF font atlas files not available — reinstall fallback fonts
    installFallbackFonts();
  }
}

/**
 * Manually load an MSDF bitmap font from a JSON (Angelcode BMFont JSON) file.
 *
 * Pixi v8's loadBitmapFont loader only handles .xml/.fnt extensions, not .json.
 * We manually fetch + parse + construct the BitmapFont so it gets registered
 * under the correct `${name}-bitmap` cache key that BitmapFontManager.getFont() looks up.
 */
async function loadMSDFFontFromJson(name: string, jsonPath: string): Promise<void> {
  const response = await fetch(jsonPath);
  if (!response.ok) throw new Error(`Failed to fetch MSDF font: ${jsonPath}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();

  // Build chars map: Record<charString, RawCharData>
  // Pixi's BitmapFont constructor expects chars keyed by character string,
  // with camelCase offset fields (xOffset, yOffset, xAdvance) and a `letter` field.
  const chars: Record<string, unknown> = {};

  for (const c of json.chars) {
    chars[c.char] = {
      id:       c.id,
      letter:   c.char,
      page:     c.page,
      x:        c.x,
      y:        c.y,
      width:    c.width,
      height:   c.height,
      xOffset:  c.xoffset,
      yOffset:  c.yoffset,
      xAdvance: c.xadvance,
      kerning:  {} as Record<string, number>,
    };
  }

  // Apply kerning pairs
  for (const k of (json.kernings ?? [])) {
    const second = String.fromCharCode(k.second);
    const first  = String.fromCharCode(k.first);
    if (chars[second]) (chars[second] as { kerning: Record<string, number> }).kerning[first] = k.amount;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {
    fontFamily:     json.info.face,
    fontSize:       json.info.size,
    lineHeight:     json.common.lineHeight,
    baseLineOffset: json.common.lineHeight - json.common.base,
    pages: (json.pages as string[]).map((file: string, id: number) => ({ id, file })),
    chars,
    distanceField: json.distanceField ? {
      type:  json.distanceField.fieldType,
      range: json.distanceField.distanceRange,
    } : undefined,
  };

  // Load texture atlas pages (paths are relative to the JSON directory)
  const baseDir = jsonPath.substring(0, jsonPath.lastIndexOf('/'));
  const textures: Texture[] = [];
  for (let i = 0; i < (json.pages as string[]).length; i++) {
    // eslint-disable-next-line no-await-in-loop
    textures[i] = await Assets.load(`${baseDir}/${json.pages[i] as string}`);
  }

  // Replace any existing fallback DynamicBitmapFont in cache before registering MSDF version.
  // Use Cache.remove() (NOT BitmapFontManager.uninstall()) to avoid destroying in-use textures.
  const cacheKey = `${name}-bitmap`;
  if (Cache.has(cacheKey)) Cache.remove(cacheKey);

  // Create BitmapFont and register under the cache key BitmapFontManager.getFont() looks up.
  const bitmapFont = new BitmapFont({ data, textures }, jsonPath);
  Cache.set(cacheKey, bitmapFont);
}

/**
 * Install dynamic bitmap fonts as fallbacks when MSDF files aren't available.
 * These use system fonts rendered via Canvas, which works but isn't as crisp as MSDF.
 */
function installFallbackFonts(): void {
  const monoFamily = 'JetBrains Mono, Menlo, Consolas, monospace';
  const sansFamily = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

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
