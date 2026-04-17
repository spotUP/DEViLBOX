/**
 * Glyph Atlas Builder — WebGL2 texture atlas for tracker font rendering
 *
 * Captures browser font rendering exactly via Canvas 2D → texImage2D.
 * All characters are rendered at DPR scale and stored as RGBA data.
 * The renderer samples this texture for each glyph, giving pixel-perfect
 * output identical to the Canvas 2D renderer.
 */

// All printable ASCII characters used in the tracker
const ATLAS_CHARS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`' +
  'abcdefghijklmnopqrstuvwxyz{|}~';

export const ATLAS_CHAR_LIST = Array.from(ATLAS_CHARS);

export interface GlyphInfo {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  logicalWidth: number;  // in logical (pre-DPR) pixels
  logicalHeight: number; // in logical (pre-DPR) pixels
}

export interface GlyphAtlas {
  texture: WebGLTexture;
  lookup: Map<string, GlyphInfo>;
  glyphLogicalWidth: number;  // monospace cell width in logical pixels
  glyphLogicalHeight: number; // row height in logical pixels
  atlasPixelWidth: number;    // texture width in physical pixels
  atlasPixelHeight: number;   // texture height in physical pixels
  dpr: number;
}

const ATLAS_COLS = 16;

/**
 * Build a glyph atlas by rendering all ASCII chars onto an OffscreenCanvas
 * and uploading the result as a WebGL2 RGBA texture.
 *
 * @param gl            WebGL2 rendering context (on the OffscreenCanvas)
 * @param fontFamily    CSS font family string (e.g. "JetBrains Mono, monospace")
 * @param fontSizePx    Logical font size in CSS pixels
 * @param rowHeightPx   Logical row height in CSS pixels (used for cell height)
 * @param dpr           Device pixel ratio
 */
export function buildGlyphAtlas(
  gl: WebGL2RenderingContext,
  fontFamily: string,
  fontSizePx: number,
  rowHeightPx: number,
  dpr: number,
): GlyphAtlas {
  const physicalFontSize = fontSizePx * dpr;
  const physicalCellH = Math.ceil(rowHeightPx * dpr);

  // Use a temp canvas to measure the true monospace glyph width
  const measureCanvas = new OffscreenCanvas(64, physicalCellH);
  const mctx = measureCanvas.getContext('2d')!;
  mctx.font = `${physicalFontSize}px ${fontFamily}`;
  const measured = mctx.measureText('W');
  const physicalCellW = Math.ceil(measured.width);

  const numChars = ATLAS_CHAR_LIST.length;
  const numRows = Math.ceil(numChars / ATLAS_COLS);
  const atlasW = ATLAS_COLS * physicalCellW;
  const atlasH = numRows * physicalCellH;

  // Render all glyphs onto the atlas canvas
  const atlasCanvas = new OffscreenCanvas(atlasW, atlasH);
  const ctx = atlasCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, atlasW, atlasH);
  ctx.font = `${physicalFontSize}px ${fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'white';

  const lookup = new Map<string, GlyphInfo>();

  ATLAS_CHAR_LIST.forEach((char, i) => {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const px = col * physicalCellW;
    const py = row * physicalCellH;

    ctx.fillText(char, px, py + physicalCellH / 2);

    lookup.set(char, {
      u0: px / atlasW,
      v0: py / atlasH,
      u1: (px + physicalCellW) / atlasW,
      v1: (py + physicalCellH) / atlasH,
      logicalWidth: physicalCellW / dpr,
      logicalHeight: physicalCellH / dpr,
    });
  });

  // Upload atlas to WebGL2 texture
  const imageData = ctx.getImageData(0, 0, atlasW, atlasH);

  const texture = gl.createTexture();
  if (!texture) throw new Error('[GlyphAtlas] Failed to create WebGL texture');

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA,
    atlasW, atlasH, 0,
    gl.RGBA, gl.UNSIGNED_BYTE,
    imageData.data,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return {
    texture,
    lookup,
    glyphLogicalWidth: physicalCellW / dpr,
    glyphLogicalHeight: physicalCellH / dpr,
    atlasPixelWidth: atlasW,
    atlasPixelHeight: atlasH,
    dpr,
  };
}

/** Parse a CSS hex color "#rrggbb" or "#rrggbbaa" into [r, g, b, a] in 0..1 range */
export function parseColor(css: string): [number, number, number, number] {
  const hex = css.replace('#', '');
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
      1.0,
    ];
  }
  if (hex.length === 8) {
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
      parseInt(hex.slice(6, 8), 16) / 255,
    ];
  }
  // Fallback: rgba(...) or named color
  return [0.9, 0.9, 0.9, 1.0];
}

/** Parse "rgba(r,g,b,a)" format (used by accentGlow etc.) */
export function parseRgba(css: string): [number, number, number, number] {
  if (css.startsWith('#')) return parseColor(css);
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) {
    return [
      parseInt(m[1]) / 255,
      parseInt(m[2]) / 255,
      parseInt(m[3]) / 255,
      m[4] !== undefined ? parseFloat(m[4]) : 1.0,
    ];
  }
  return [0.5, 0.5, 0.5, 1.0];
}
