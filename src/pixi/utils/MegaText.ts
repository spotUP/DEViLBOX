/**
 * MegaText — Batched text renderer using a single Graphics context.
 *
 * Renders many text labels through one Graphics object instead of individual
 * BitmapText instances. Bypasses ctx.texture() to avoid per-glyph Matrix.clone()
 * overhead — all glyph instructions share a single transform matrix.
 *
 * With DynamicBitmapFont (no customShader), this Graphics is batchable when
 * under 400 verts, or a single non-batched draw call when larger.
 */

import { Graphics, Cache, Matrix, type ColorSource } from 'pixi.js';
import type { BitmapFont } from 'pixi.js';

/** A single text label to render. */
export interface GlyphLabel {
  /** X position in local coordinates */
  x: number;
  /** Y position in local coordinates */
  y: number;
  /** Text string to render */
  text: string;
  /** Tint color (0xRRGGBB) */
  color: number;
  /** Font family name (cache key without '-bitmap' suffix) */
  fontFamily: string;
  /** Alpha (0-1). Labels with alpha < 1 are rendered with pre-multiplied tint. */
  alpha?: number;
}

// Cached font lookups to avoid repeated Cache.get() per glyph
const fontCache = new Map<string, BitmapFont>();

function getCachedFont(fontFamily: string): BitmapFont | null {
  let font = fontCache.get(fontFamily);
  if (font) return font;
  const cacheKey = `${fontFamily}-bitmap`;
  if (!Cache.has(cacheKey)) return null;
  font = Cache.get(cacheKey) as BitmapFont;
  fontCache.set(fontFamily, font);
  return font;
}

/** Clear the font cache (call if fonts are reloaded). */
export function clearMegaTextFontCache(): void {
  fontCache.clear();
}

/**
 * MegaText: A Graphics object that renders many text labels in a single draw call.
 *
 * Usage:
 *   const mega = new MegaText();
 *   parent.addChild(mega);
 *   mega.updateLabels(labels);
 */
export class MegaText extends Graphics {
  private _labelCount = 0;

  /** Number of labels rendered in the last updateLabels() call. */
  get labelCount(): number { return this._labelCount; }

  /**
   * Rebuild the graphics context with all glyph quads for the given labels.
   *
   * @param labels - Array of text labels to render.
   * @param fontSize - The target font size in pixels (default 11, matching pattern editor).
   */
  updateLabels(labels: GlyphLabel[], fontSize: number = 11): void {
    const ctx = this.context;
    ctx.clear();
    this._labelCount = labels.length;

    if (labels.length === 0) return;

    const firstFont = getCachedFont(labels[0].fontFamily);
    if (!firstFont) return;

    // Font scale: maps font-unit space → pixel space
    const fontScale = fontSize / firstFont.baseMeasurementFontSize;
    const invScale = 1 / fontScale;

    // Single shared transform for all glyph instructions.
    // Bypasses ctx.texture() which calls _transform.clone() per glyph.
    const sharedTransform = new Matrix(fontScale, 0, 0, fontScale, 0, 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instructions = (ctx as any).instructions as any[];

    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const font = getCachedFont(label.fontFamily);
      if (!font) continue;

      const { text, color } = label;
      const labelX = label.x * invScale;
      const labelY = label.y * invScale;

      // Pre-multiply alpha into tint
      let tint: ColorSource = color;
      if (label.alpha !== undefined && label.alpha < 1) {
        const a = label.alpha;
        const r = ((color >> 16) & 0xff) * a;
        const g = ((color >> 8) & 0xff) * a;
        const b = (color & 0xff) * a;
        tint = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
      }

      let cursorX = labelX;
      let prevChar = '';
      for (let j = 0; j < text.length; j++) {
        const char = text[j];
        const charData = font.chars[char];
        if (!charData?.texture) {
          cursorX += font.chars[' ']?.xAdvance ?? 6;
          prevChar = char;
          continue;
        }

        if (prevChar && charData.kerning[prevChar]) {
          cursorX += charData.kerning[prevChar];
        }

        const texture = charData.texture;
        instructions.push({
          action: 'texture',
          data: {
            image: texture,
            dx: Math.round(cursorX + charData.xOffset),
            dy: Math.round(labelY + charData.yOffset),
            dw: texture.orig.width,
            dh: texture.orig.height,
            transform: sharedTransform,
            alpha: 1,
            style: tint,
          },
        });

        cursorX += charData.xAdvance;
        prevChar = char;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx as any).onUpdate();
  }
}
