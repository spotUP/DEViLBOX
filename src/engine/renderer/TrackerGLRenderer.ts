/**
 * TrackerGLRenderer — WebGL2 instanced renderer for the pattern editor
 *
 * 3-pass rendering strategy:
 *   Pass 1 — Row backgrounds (alternating rows, highlights, selection)
 *   Pass 2 — Glyphs        (all visible characters, instanced from atlas)
 *   Pass 3 — Overlays      (cursor rect, center-line, channel separators)
 *
 * Each pass uses a single instanced drawArrays call regardless of pattern size.
 * At 60fps with 256 rows × 16 channels, this is ~3 draw calls / frame.
 */

import { buildGlyphAtlas, parseColor, parseRgba, type GlyphAtlas, type GlyphInfo } from './glyph-atlas';
import type {
  PatternSnapshot,
  CursorSnapshot,
  SelectionSnapshot,
  ThemeSnapshot,
  UIStateSnapshot,
  ChannelLayoutSnapshot,
} from './worker-types';

// ─── Constants matching PatternEditorCanvas ───────────────────────────────────
const ROW_HEIGHT = 24;
const CHAR_WIDTH = 10;
const FONT_FAMILY = '"JetBrains Mono", "Fira Code", monospace';
const FONT_SIZE_PX = 14;

// ─── Shader source ────────────────────────────────────────────────────────────

// Renders colored rectangles (row backgrounds, overlays, cursor, separators)
const RECT_VERT = /* glsl */ `#version 300 es
layout(location=0) in vec2 aCorner;   // unit quad corner: (0,0)..(1,1)
layout(location=1) in vec4 aRect;     // x, y, w, h  (per instance, logical px)
layout(location=2) in vec4 aColor;    // r, g, b, a  (per instance)

uniform vec2 uResolution; // logical canvas size (CSS pixels)

out vec4 vColor;

void main() {
  vec2 pixelPos = aCorner * aRect.zw + aRect.xy;
  vec2 ndc = (pixelPos / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  vColor = aColor;
}`;

const RECT_FRAG = /* glsl */ `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 fragColor;

void main() {
  fragColor = vColor;
}`;

// Renders atlas-sampled glyphs with per-glyph color
const GLYPH_VERT = /* glsl */ `#version 300 es
layout(location=0) in vec2 aCorner;    // unit quad corner (0,0)..(1,1)
layout(location=1) in vec2 aPos;       // screen position (logical px, per instance)
layout(location=2) in vec2 aSize;      // glyph logical size (per instance)
layout(location=3) in vec4 aAtlasUV;  // u0,v0,u1,v1 (per instance)
layout(location=4) in vec4 aColor;    // r,g,b,a (per instance)

uniform vec2 uResolution;

out vec2 vUV;
out vec4 vColor;

void main() {
  vec2 pixelPos = aPos + aCorner * aSize;
  vec2 ndc = (pixelPos / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  vUV = aAtlasUV.xy + aCorner * (aAtlasUV.zw - aAtlasUV.xy);
  vColor = aColor;
}`;

const GLYPH_FRAG = /* glsl */ `#version 300 es
precision mediump float;
in vec2 vUV;
in vec4 vColor;
uniform sampler2D uAtlas;
out vec4 fragColor;

void main() {
  float a = texture(uAtlas, vUV).a; // white text on transparent background
  fragColor = vec4(vColor.rgb, a * vColor.a);
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error('createProgram failed');
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

// ─── Pre-computed lookup tables (zero-alloc in hot path) ──────────────────────

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

// Pre-compute all 256 hex byte strings
const HEX_TABLE: string[] = new Array(256);
const DEC_TABLE: string[] = new Array(256);
for (let i = 0; i < 256; i++) {
  HEX_TABLE[i] = i.toString(16).toUpperCase().padStart(2, '0');
  DEC_TABLE[i] = i.toString(10).padStart(2, '0');
}

// Pre-compute single hex digit strings (0-F)
const HEX1_TABLE: string[] = Array.from({ length: 16 }, (_, i) => i.toString(16).toUpperCase());

// Pre-compute note strings — 192 entries covers GT Ultra range (1-188), standard (1-96), and OFF (97)
const NOTE_CACHE = new Map<number, string[]>();
function getNoteTable(displayOffset: number): string[] {
  let table = NOTE_CACHE.get(displayOffset);
  if (table) return table;
  table = new Array(192);
  table[0] = '---';
  for (let n = 1; n < 189; n++) {
    const adj = n + displayOffset - 1;
    const noteIndex = ((adj % 12) + 12) % 12;
    const octave = Math.floor(adj / 12);
    table[n] = `${NOTE_NAMES[noteIndex]}${octave}`;
  }
  table[97] = 'OFF';
  NOTE_CACHE.set(displayOffset, table);
  return table;
}

const COL_GAP = 4; // Gap between columns in data-driven mode

// Effect type char lookup (0-35 → '0'-'9','A'-'Z')
const EFFECT_CHARS: string[] = new Array(36);
for (let i = 0; i < 10; i++) EFFECT_CHARS[i] = i.toString();
for (let i = 10; i < 36; i++) EFFECT_CHARS[i] = String.fromCharCode(55 + i);

// Pre-parsed probability colors
const PROB_COLORS: [number, number, number, number][] = [
  parseColor('#f87171'),  // 0-24
  parseColor('#fb923c'),  // 25-49
  parseColor('#facc15'),  // 50-74
  parseColor('#4ade80'),  // 75-99
];

/** Lerp an RGBA color toward white by factor t (0 = original, 1 = white). */
function lerpWhiteRGBA(
  c: [number, number, number, number], t: number,
): [number, number, number, number] {
  if (t <= 0) return c;
  if (t >= 1) return [1, 1, 1, c[3]];
  return [c[0] + (1 - c[0]) * t, c[1] + (1 - c[1]) * t, c[2] + (1 - c[2]) * t, c[3]];
}

// ─── Instance data arrays (pre-allocated, grown as needed) ───────────────────

// Rect instance: x, y, w, h, r, g, b, a  (8 floats)
const RECT_FLOATS = 8;
// Glyph instance: posX, posY, sizeW, sizeH, u0, v0, u1, v1, r, g, b, a  (12 floats)
const GLYPH_FLOATS = 12;

// Maximum instances per frame (grown if needed)
const RECT_CAPACITY  = 4096;
const GLYPH_CAPACITY = 65536;

// ─── Main renderer class ──────────────────────────────────────────────────────

export class TrackerGLRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly rectProg: WebGLProgram;
  private readonly glyphProg: WebGLProgram;

  // Uniforms
  private readonly rectResLoc: WebGLUniformLocation;
  private readonly glyphResLoc: WebGLUniformLocation;
  private readonly glyphAtlasLoc: WebGLUniformLocation;

  // Rect draw resources
  private readonly rectVAO: WebGLVertexArrayObject;
  private readonly rectCornerBuf: WebGLBuffer;
  private readonly rectInstanceBuf: WebGLBuffer;

  // Glyph draw resources
  private readonly glyphVAO: WebGLVertexArrayObject;
  private readonly glyphCornerBuf: WebGLBuffer;
  private readonly glyphInstanceBuf: WebGLBuffer;

  // Atlas
  private atlas: GlyphAtlas | null = null;

  // Instance data
  private rectData: Float32Array;
  private glyphData: Float32Array;
  private rectCount = 0;
  private glyphCount = 0;

  // Canvas size in logical CSS pixels
  private width = 1;
  private height = 1;
  private dpr = 1;

  // Cached parsed theme colors — only re-parsed when theme object changes
  private cachedTheme: ThemeSnapshot | null = null;
  private colors = {
    bg:                  [0,0,0,1] as [number,number,number,number],
    rowNormal:           [0,0,0,1] as [number,number,number,number],
    rowHighlight:        [0,0,0,1] as [number,number,number,number],
    rowSecondaryHighlight: [0,0,0,1] as [number,number,number,number],
    centerLine:          [0,0,0,1] as [number,number,number,number],
    rowCurrent:          [0,0,0,1] as [number,number,number,number],
    cursor:              [0,0,0,1] as [number,number,number,number],
    cursorSecondary:     [0,0,0,1] as [number,number,number,number],
    text:                [0,0,0,1] as [number,number,number,number],
    textMuted:           [0,0,0,1] as [number,number,number,number],
    textNote:            [0,0,0,1] as [number,number,number,number],
    textNoteActive:      [0,0,0,1] as [number,number,number,number],
    textInstrument:      [0,0,0,1] as [number,number,number,number],
    textVolume:          [0,0,0,1] as [number,number,number,number],
    textEffect:          [0,0,0,1] as [number,number,number,number],
    border:              [0,0,0,1] as [number,number,number,number],
    lineNumber:          [0,0,0,1] as [number,number,number,number],
    lineNumberHighlight: [0,0,0,1] as [number,number,number,number],
    selection:           [0,0,0,1] as [number,number,number,number],
    bookmark:            [0.961, 0.620, 0.044, 1.0] as [number,number,number,number],
    accent:              [0,0,0,1] as [number,number,number,number],
    flagAccent:          [0.961, 0.620, 0.044, 1.0] as [number,number,number,number],
    flagSlide:           [0.024, 0.714, 0.831, 1.0] as [number,number,number,number],
    flagMute:            [0.980, 0.800, 0.082, 1.0] as [number,number,number,number],
    flagHammer:          [0.133, 0.827, 0.933, 1.0] as [number,number,number,number],
  };

  // Reusable color tuple to avoid per-cell allocations
  private readonly tmpColor: [number, number, number, number] = [0, 0, 0, 1];

  constructor(canvas: OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
      desynchronized: true,
    });
    if (!gl) throw new Error('[TrackerGLRenderer] WebGL2 not supported');
    this.gl = gl;

    // Compile shader programs
    this.rectProg  = linkProgram(gl, RECT_VERT,  RECT_FRAG);
    this.glyphProg = linkProgram(gl, GLYPH_VERT, GLYPH_FRAG);

    // Uniform locations
    this.rectResLoc   = gl.getUniformLocation(this.rectProg,  'uResolution')!;
    this.glyphResLoc  = gl.getUniformLocation(this.glyphProg, 'uResolution')!;
    this.glyphAtlasLoc = gl.getUniformLocation(this.glyphProg, 'uAtlas')!;

    // Unit quad corners (2 triangles)
    const corners = new Float32Array([0,0, 1,0, 0,1, 1,0, 1,1, 0,1]);

    // ── Rect VAO ──────────────────────────────────────────────────────────────
    this.rectVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.rectVAO);

    this.rectCornerBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rectCornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.rectInstanceBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rectInstanceBuf);
    this.rectData = new Float32Array(RECT_CAPACITY * RECT_FLOATS);
    gl.bufferData(gl.ARRAY_BUFFER, this.rectData.byteLength, gl.DYNAMIC_DRAW);

    const stride = RECT_FLOATS * 4;
    // location 1 = aRect (vec4: x,y,w,h)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    // location 2 = aColor (vec4: r,g,b,a)
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);

    // ── Glyph VAO ─────────────────────────────────────────────────────────────
    this.glyphVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.glyphVAO);

    this.glyphCornerBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphCornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.glyphInstanceBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphInstanceBuf);
    this.glyphData = new Float32Array(GLYPH_CAPACITY * GLYPH_FLOATS);
    gl.bufferData(gl.ARRAY_BUFFER, this.glyphData.byteLength, gl.DYNAMIC_DRAW);

    const gStride = GLYPH_FLOATS * 4;
    // loc 1 = aPos   (vec2: x, y)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, gStride, 0);
    gl.vertexAttribDivisor(1, 1);
    // loc 2 = aSize  (vec2: w, h)
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, gStride, 8);
    gl.vertexAttribDivisor(2, 1);
    // loc 3 = aAtlasUV (vec4: u0,v0,u1,v1)
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, gStride, 16);
    gl.vertexAttribDivisor(3, 1);
    // loc 4 = aColor (vec4: r,g,b,a)
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, gStride, 32);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);

    // GL state
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA,
    );
    gl.disable(gl.DEPTH_TEST);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  resize(logicalW: number, logicalH: number, dpr: number): void {
    this.width  = logicalW;
    this.height = logicalH;
    this.dpr    = dpr;
    // Set physical pixel dimensions on the backing store — without this the
    // OffscreenCanvas stays at its default 300×150 and gets stretched to fill
    // the CSS display area, making everything look zoomed in on retina screens.
    const canvas = this.gl.canvas as OffscreenCanvas;
    canvas.width  = Math.ceil(logicalW * dpr);
    canvas.height = Math.ceil(logicalH * dpr);
    this.gl.viewport(0, 0, canvas.width, canvas.height);
    // Rebuild atlas at new DPR if needed
    if (!this.atlas || this.atlas.dpr !== dpr) {
      this.buildAtlas();
    }
  }

  private buildAtlas(): void {
    const gl = this.gl;
    if (this.atlas) {
      gl.deleteTexture(this.atlas.texture);
    }
    this.atlas = buildGlyphAtlas(gl, FONT_FAMILY, FONT_SIZE_PX, ROW_HEIGHT, this.dpr);
  }

  /**
   * Render one frame of the tracker pattern editor.
   * All state is provided as plain data — no Zustand, no React.
   */
  render(opts: {
    patterns: PatternSnapshot[];
    currentPatternIndex: number;
    scrollX: number;
    cursor: CursorSnapshot;
    selection: SelectionSnapshot | null;
    playback: { row: number; smoothOffset: number; patternIndex: number; isPlaying: boolean };
    theme: ThemeSnapshot;
    ui: UIStateSnapshot;
    layout: ChannelLayoutSnapshot;
    dragOver: { channelIndex: number; rowIndex: number } | null;
  }): void {
    if (!this.atlas) this.buildAtlas();
    const atlas = this.atlas!;
    const gl = this.gl;

    // Reset instance counts
    this.rectCount  = 0;
    this.glyphCount = 0;

    const {
      patterns, currentPatternIndex, scrollX, cursor, selection,
      playback, theme, ui, layout, dragOver,
    } = opts;

    const { isPlaying, row: playRow, smoothOffset, patternIndex: playPatternIdx } = playback;
    const activePatternIdx = isPlaying ? playPatternIdx : currentPatternIndex;
    const pattern = patterns[activePatternIdx];

    const { width, height } = this;
    const { offsets: channelOffsets, widths: channelWidths } = layout;

    // Skip rendering when dimensions are too small (e.g. during init before
    // the ResizeObserver fires). With height ≤ rowHeight the center line rect
    // overflows NDC and fills the entire viewport.
    if (height < 48 || width < 48) return;

    // Re-parse theme colors only when theme reference changes
    if (theme !== this.cachedTheme) {
      this.cachedTheme = theme;
      this.colors.bg                  = parseColor(theme.bg);
      this.colors.rowNormal           = parseColor(theme.rowNormal);
      this.colors.rowHighlight        = parseColor(theme.rowHighlight);
      this.colors.rowSecondaryHighlight = parseColor(theme.rowSecondaryHighlight);
      this.colors.centerLine          = parseRgba(theme.accentGlow);
      this.colors.rowCurrent          = parseColor(theme.rowCurrent);
      this.colors.cursor              = parseColor(theme.accent);
      this.colors.cursorSecondary     = parseColor(theme.accentSecondary);
      this.colors.text                = parseColor(theme.textNote);
      this.colors.textMuted           = parseColor(theme.textMuted);
      this.colors.textNote            = parseColor(theme.textNote);
      this.colors.textNoteActive      = parseColor(theme.textNoteActive);
      this.colors.textInstrument      = parseColor(theme.textInstrument);
      this.colors.textVolume          = parseColor(theme.textVolume);
      this.colors.textEffect          = parseColor(theme.textEffect);
      this.colors.border              = parseColor(theme.trackerBorder || theme.border);
      this.colors.lineNumber          = parseColor(theme.lineNumber);
      this.colors.lineNumberHighlight = parseColor(theme.lineNumberHighlight);
      this.colors.selection           = parseRgba(theme.selection);
      this.colors.bookmark            = parseColor(theme.bookmark || '#f59e0b');
      this.colors.accent              = parseColor(theme.accent);
    }
    const colors = this.colors;

    // Current row
    const currentRow = isPlaying ? playRow : cursor.rowIndex;

    // Compute layout values
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const showAcid = ui.columnVisibility.flag1 || ui.columnVisibility.flag2;
    const showProb = ui.columnVisibility.probability;

    // Visible rows
    const rowH = ui.rowHeight ?? 24;
    const visibleLines = Math.ceil(height / rowH) + 2;
    const topLines = Math.floor(visibleLines / 2);
    const vStart = currentRow - topLines;
    const visibleEnd = vStart + visibleLines;
    const centerLineTop = Math.floor(height / 2) - rowH / 2;
    const baseY = centerLineTop - topLines * rowH - smoothOffset;
    const hlInterval = ui.rowHighlightInterval ?? 4;
    const hl2Interval = ui.rowSecondaryHighlightInterval ?? 0;

    // ── Clear ─────────────────────────────────────────────────────────────────
    if (ui.trackerVisualBg) {
      gl.clearColor(0, 0, 0, 0.75);
    } else {
      const [r, g, b, a] = colors.bg;
      gl.clearColor(r, g, b, a);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASS 1 — Row backgrounds + channel backgrounds
    // ═══════════════════════════════════════════════════════════════════════════

    if (!pattern) {
      this.flushRects();
      this.flushGlyphs();
      return;
    }

    const numChannels = pattern.channels.length;

    // Mute / solo dimming — compute once per frame
    const anySolo = pattern.channels.some(ch => ch.solo);
    const MUTED_ALPHA = 0.3;

    // Selection ranges
    const sel = selection;
    const minSelCh  = sel ? Math.min(sel.startChannel, sel.endChannel) : -1;
    const maxSelCh  = sel ? Math.max(sel.startChannel, sel.endChannel) : -1;
    const minSelRow = sel ? Math.min(sel.startRow, sel.endRow) : -1;
    const maxSelRow = sel ? Math.max(sel.startRow, sel.endRow) : -1;

    // Full-height channel tints (drawn before rows)
    for (let ch = 0; ch < numChannels; ch++) {
      const colX = channelOffsets[ch] - scrollX;
      const chW  = channelWidths[ch];
      if (colX + chW < 0 || colX > width) continue;
      const chData = pattern.channels[ch];

      // Active channel highlight
      if (ch === cursor.channelIndex) {
        this.addRect(colX, 0, chW, height, [1,1,1, 0.02]);
      }
      // Channel color tint
      if (chData.color) {
        const c = parseColor(chData.color);
        this.addRect(colX, 0, chW, height, [c[0], c[1], c[2], 0.03]);
      }
      // Muted / non-solo darkening overlay
      const isDimmed = chData.muted || (anySolo && !chData.solo);
      if (isDimmed) {
        this.addRect(colX, 0, chW, height, [0, 0, 0, 0.45]);
      }
    }

    // Row backgrounds
    for (let i = vStart; i < visibleEnd; i++) {
      let rowIndex: number;
      let isGhostRow = false;
      let ghostPattern: PatternSnapshot | null = null;

      if (i < 0 || i >= pattern.length) {
        if (!ui.showGhostPatterns) continue;
        if (i < 0) {
          const prevIdx = isPlaying ? activePatternIdx - 1 : currentPatternIndex - 1;
          ghostPattern = prevIdx >= 0 ? patterns[prevIdx] : patterns[patterns.length - 1] ?? null;
          if (!ghostPattern) continue;
          rowIndex = ghostPattern.length + i;
          if (rowIndex < 0 || rowIndex >= ghostPattern.length) continue;
        } else {
          const nextIdx = isPlaying ? activePatternIdx + 1 : currentPatternIndex + 1;
          ghostPattern = nextIdx < patterns.length ? patterns[nextIdx] : patterns[0] ?? null;
          if (!ghostPattern) continue;
          rowIndex = i - pattern.length;
          if (rowIndex < 0 || rowIndex >= ghostPattern.length) continue;
        }
        isGhostRow = true;
      } else {
        rowIndex = i;
      }

      const y = baseY + (i - vStart) * rowH;
      if (y + rowH < 0 || y > height) continue;

      if (!ui.trackerVisualBg) {
        const isHL2 = hl2Interval > 0 && rowIndex % hl2Interval === 0;
        const isHL = rowIndex % hlInterval === 0;
        const bgColor = isHL2 ? colors.rowSecondaryHighlight : isHL ? colors.rowHighlight : colors.rowNormal;
        const alpha = isGhostRow ? bgColor[3] * 0.35 : bgColor[3];
        this.addRect(0, y, width, rowH, [bgColor[0], bgColor[1], bgColor[2], alpha]);
      }
    }

    // Bookmark indicators — small colored bar at left edge of gutter
    if (ui.bookmarks && ui.bookmarks.length > 0) {
      const bmColor = colors.bookmark;
      for (const bm of ui.bookmarks) {
        if (bm < vStart || bm >= visibleEnd) continue;
        if (bm < 0 || bm >= pattern.length) continue;
        const y = baseY + (bm - vStart) * rowH;
        if (y + rowH < 0 || y > height) continue;
        this.addRect(0, y, 3, rowH, [bmColor[0], bmColor[1], bmColor[2], 0.9]);
      }
    }

    // Center line highlight
    {
      const [r, g, b, a] = colors.centerLine;
      const alpha = ui.trackerVisualBg ? a * 0.5 : a;
      this.addRect(0, centerLineTop, width, rowH, [r, g, b, alpha]);
    }

    // Cursor caret background — drawn behind text so notes remain readable
    if (!pattern.channels[cursor.channelIndex]?.collapsed) {
      const colX = channelOffsets[cursor.channelIndex] - scrollX;
      const chW  = channelWidths[cursor.channelIndex];
      const chData = pattern.channels[cursor.channelIndex];
      const chColumns = chData?.columnSpecs ?? ui.columns;
      const colIdx = parseInt(cursor.columnType, 10);

      let caretOffX = 0;
      let caretW    = CHAR_WIDTH;
      let cursorX: number;

      if (!isNaN(colIdx) && chColumns) {
        // DATA-DRIVEN CURSOR — format mode uses numeric column indices
        const dataContentWidth = chColumns.reduce((s, c) => s + c.charWidth * CHAR_WIDTH + COL_GAP, 0) - COL_GAP;
        cursorX = colX + Math.floor((chW - dataContentWidth) / 2);
        for (let ci = 0; ci < colIdx && ci < chColumns.length; ci++) {
          caretOffX += chColumns[ci].charWidth * CHAR_WIDTH + COL_GAP;
        }
        caretW = (chColumns[colIdx]?.charWidth ?? 1) * CHAR_WIDTH;
      } else {
        // FIXED-COLUMN CURSOR
        const cursorEffectCols = chData?.effectCols ?? 2;
        const cursorNoteCols = chData?.noteCols ?? 1;
        const CURSOR_NOTE_COL_GROUP_W = noteWidth + 4 + CHAR_WIDTH * 2 + 4 + CHAR_WIDTH * 2 + 4;
        const cursorContentWidth = CURSOR_NOTE_COL_GROUP_W * cursorNoteCols + cursorEffectCols * (CHAR_WIDTH * 3 + 4)
          + (showAcid ? CHAR_WIDTH * 2 + 8 : 0) + (showProb ? CHAR_WIDTH * 2 + 4 : 0);
        cursorX = colX + Math.floor((chW - cursorContentWidth) / 2);

        // Cursor noteColumnIndex determines which note group the cursor is in
        const cursorNoteCol = cursor.noteColumnIndex ?? 0;
        const noteColOffset = cursorNoteCol * CURSOR_NOTE_COL_GROUP_W;
        const paramBase = noteWidth + 4;
        const hasAcidC  = chData?.rows[0]?.flag1 !== undefined
                       || chData?.rows[0]?.flag2 !== undefined;
        // Effects base offset — after all note column groups
        const effBase = cursorNoteCols * CURSOR_NOTE_COL_GROUP_W;
        const acidOff = effBase + cursorEffectCols * (CHAR_WIDTH * 3 + 4);
        const probOff = acidOff + (hasAcidC ? CHAR_WIDTH * 2 + 8 : 0);

        switch (cursor.columnType) {
          case 'note':       caretOffX = noteColOffset;                                                    caretW = noteWidth; break;
          case 'instrument': caretOffX = noteColOffset + paramBase + cursor.digitIndex * CHAR_WIDTH;       break;
          case 'volume':     caretOffX = noteColOffset + paramBase + (CHAR_WIDTH * 2 + 4) + cursor.digitIndex * CHAR_WIDTH; break;
          case 'effTyp':     caretOffX = effBase;                                                          break;
          case 'effParam':   caretOffX = effBase + CHAR_WIDTH + cursor.digitIndex * CHAR_WIDTH;            break;
          case 'effTyp2':    caretOffX = effBase + (CHAR_WIDTH * 3 + 4);                                   break;
          case 'effParam2':  caretOffX = effBase + (CHAR_WIDTH * 3 + 4) + CHAR_WIDTH + cursor.digitIndex * CHAR_WIDTH; break;
          case 'flag1':      caretOffX = acidOff;                                                          break;
          case 'flag2':      caretOffX = acidOff + CHAR_WIDTH + 4;                                         break;
          case 'probability':caretOffX = probOff + cursor.digitIndex * CHAR_WIDTH;                         break;
          default:           caretOffX = effBase;                                                           break;
        }
      }

      const caretX = cursorX + caretOffX;
      const caretY = centerLineTop;
      this.addRect(caretX, caretY, caretW, rowH, colors.cursor);
    }

    // Channel separators and left stripes (full height)
    for (let ch = 0; ch < numChannels; ch++) {
      const colX = channelOffsets[ch] - scrollX;
      const chW  = channelWidths[ch];
      if (colX + chW < 0 || colX > width) continue;
      const chData = pattern.channels[ch];

      // Separator
      this.addRect(colX + chW, 0, 1, height, colors.border);

      // Left stripe
      if (chData.color) {
        const c = parseColor(chData.color);
        const stripeW = chData.collapsed ? 4 : 2;
        this.addRect(colX, 0, stripeW, height, [c[0], c[1], c[2], 0.4]);
      }
    }

    this.flushRects();

    // ═══════════════════════════════════════════════════════════════════════════
    // PASS 2 — Glyphs (all visible cell text)
    // ═══════════════════════════════════════════════════════════════════════════

    // Pre-compute note lookup table outside the loop
    const noteTable = getNoteTable(ui.noteDisplayOffset);

    for (let i = vStart; i < visibleEnd; i++) {
      let rowIndex: number;
      let isGhostRow = false;
      let sourcePattern = pattern;

      if (i < 0 || i >= pattern.length) {
        if (!ui.showGhostPatterns) continue;
        if (i < 0) {
          const prevIdx = isPlaying ? activePatternIdx - 1 : currentPatternIndex - 1;
          const gp = prevIdx >= 0 ? patterns[prevIdx] : patterns[patterns.length - 1] ?? null;
          if (!gp) continue;
          rowIndex = gp.length + i;
          if (rowIndex < 0 || rowIndex >= gp.length) continue;
          sourcePattern = gp;
        } else {
          const nextIdx = isPlaying ? activePatternIdx + 1 : currentPatternIndex + 1;
          const gp = nextIdx < patterns.length ? patterns[nextIdx] : patterns[0] ?? null;
          if (!gp) continue;
          rowIndex = i - pattern.length;
          if (rowIndex < 0 || rowIndex >= gp.length) continue;
          sourcePattern = gp;
        }
        isGhostRow = true;
      } else {
        rowIndex = i;
      }

      const y = baseY + (i - vStart) * rowH;
      if (y + rowH < 0 || y > height) continue;

      const ghostAlpha = isGhostRow ? 0.35 : 1.0;
      // Per-row alpha for ghost; per-channel mute alpha computed in channel loop below
      const isHL2b = hl2Interval > 0 && rowIndex % hl2Interval === 0;
      const isHL = rowIndex % hlInterval === 0 || isHL2b;

      // Line number — use pre-computed hex/dec tables
      // Glow trails behind the playhead: active row = white, rows above fade out
      const TRAIL_ROWS = 3;
      const behind = isPlaying && !isGhostRow ? currentRow - i : -1;
      const glow = behind >= 0 && behind <= TRAIL_ROWS ? 1 - behind / TRAIL_ROWS : 0;
      const bold = behind === 0; // bold on the exact active row
      let lineNumStr: string;
      if (ui.showBeatLabels) {
        const beat = Math.floor(rowIndex / hlInterval) + 1;
        const tick = (rowIndex % hlInterval) + 1;
        lineNumStr = `${beat}.${tick}`;
      } else {
        lineNumStr = ui.useHex ? HEX_TABLE[rowIndex & 0xFF] : DEC_TABLE[rowIndex & 0xFF];
      }
      const lnColor = lerpWhiteRGBA(isHL ? colors.lineNumberHighlight : colors.lineNumber, glow);
      this.setTmpColor(lnColor, ghostAlpha);
      this.addGlyphString(lineNumStr, 4, y + (rowH - atlas.glyphLogicalHeight) / 2,
        atlas, this.tmpColor, bold);

      // Each channel
      for (let ch = 0; ch < numChannels; ch++) {
        const colX = channelOffsets[ch] - scrollX;
        const chW  = channelWidths[ch];
        if (colX + chW < 0 || colX > width) continue;

        const chData = sourcePattern.channels[ch];
        if (!chData) continue;
        const cell = chData.rows[rowIndex];
        if (!cell) continue;

        // Combined alpha: ghost dimming × mute/solo dimming
        const chDimmed = chData.muted || (anySolo && !chData.solo);
        const cellAlpha = ghostAlpha * (chDimmed ? MUTED_ALPHA : 1.0);

        const isCollapsed = chData.collapsed;
        const effectCols = chData.effectCols ?? 2;
        const gy = y + (rowH - atlas.glyphLogicalHeight) / 2;

        if (isCollapsed) {
          const x = colX + Math.floor((chW - noteWidth) / 2);
          const noteHas = (cell.note ?? 0) > 0;
          const nc = lerpWhiteRGBA(noteHas ? colors.textNote : colors.textMuted, noteHas ? glow : 0);
          this.setTmpColor(nc, cellAlpha);
          this.addGlyphString(noteTable[cell.note ?? 0] ?? '---', x, gy, atlas, this.tmpColor, noteHas && bold);
          continue;
        }

        if (ui.columns && cell.params) {
          // DATA-DRIVEN PATH — renders custom format columns
          const chColumns = chData.columnSpecs ?? ui.columns;
          const dataContentWidth = chColumns.reduce((s, c) => s + c.charWidth * CHAR_WIDTH + COL_GAP, 0) - COL_GAP;
          const x = colX + Math.floor((chW - dataContentWidth) / 2);
          let px = x;
          for (let ci = 0; ci < chColumns.length; ci++) {
            const col = chColumns[ci];
            const val = cell.params[ci] ?? col.emptyValue;
            const isEmpty = val === col.emptyValue;
            const baseColor: [number, number, number, number] = isEmpty ? col.emptyColor : col.color;
            this.setTmpColor(lerpWhiteRGBA(baseColor, isEmpty ? 0 : glow), cellAlpha);

            let str: string;
            if (col.type === 'note') {
              str = isEmpty ? '---' : (noteTable[val] ?? '---');
            } else if (isEmpty) {
              // Show dots for empty hex cells, matching normal mode
              switch (col.hexDigits) {
                case 1:  str = '.'; break;
                case 2:  str = '..'; break;
                case 3:  str = '...'; break;
                default: str = '....'; break;
              }
            } else {
              switch (col.hexDigits) {
                case 1:  str = HEX1_TABLE[val & 0xF]; break;
                case 2:  str = HEX_TABLE[val & 0xFF]; break;
                case 3:  str = (val & 0xFFF).toString(16).toUpperCase().padStart(3, '0'); break;
                default: str = (val & 0xFFFF).toString(16).toUpperCase().padStart(4, '0'); break;
              }
            }

            if (!isEmpty || !ui.blankEmpty) {
              this.addGlyphString(str, px, gy, atlas, this.tmpColor, !isEmpty && bold);
            }
            px += col.charWidth * CHAR_WIDTH + COL_GAP;
          }
        } else {
          // FIXED-COLUMN PATH (note/inst/vol/eff) — supports multi-note columns
          const totalNoteCols = chData.noteCols ?? 1;
          const NOTE_COL_GROUP_W = noteWidth + 4 + CHAR_WIDTH * 2 + 4 + CHAR_WIDTH * 2 + 4;
          const chContentWidth = NOTE_COL_GROUP_W * totalNoteCols + effectCols * (CHAR_WIDTH * 3 + 4)
            + (showAcid ? CHAR_WIDTH * 2 + 8 : 0) + (showProb ? CHAR_WIDTH * 2 + 4 : 0);
          const x = colX + Math.floor((chW - chContentWidth) / 2);

          // Render each note column group (note + inst + vol)
          for (let nc = 0; nc < totalNoteCols; nc++) {
            const ncX = x + nc * NOTE_COL_GROUP_W;
            const cellNote = nc === 0 ? (cell.note ?? 0)
              : nc === 1 ? (cell.note2 ?? 0)
              : nc === 2 ? (cell.note3 ?? 0) : (cell.note4 ?? 0);
            if (!ui.blankEmpty || cellNote !== 0) {
              const noteHas = cellNote > 0;
              const noteColor = lerpWhiteRGBA(
                cellNote === 0 ? colors.textMuted
                : cellNote === 97 ? colors.textEffect
                : colors.textNote, noteHas ? glow : 0);
              this.setTmpColor(noteColor, cellAlpha);
              this.addGlyphString(noteTable[cellNote] ?? '---', ncX, gy, atlas, this.tmpColor, noteHas && bold);
            }

            let px = ncX + noteWidth + 4;

            const inst = nc === 0 ? (cell.instrument ?? 0)
              : nc === 1 ? (cell.instrument2 ?? 0)
              : nc === 2 ? (cell.instrument3 ?? 0) : (cell.instrument4 ?? 0);
            if (inst !== 0) {
              this.setTmpColor(lerpWhiteRGBA(colors.textInstrument, glow), cellAlpha);
              this.addGlyphString(HEX_TABLE[inst & 0xFF], px, gy, atlas, this.tmpColor, bold);
            } else if (!ui.blankEmpty) {
              this.setTmpColor(lerpWhiteRGBA(colors.textMuted, 0), cellAlpha);
              this.addGlyphString('..', px, gy, atlas, this.tmpColor, false);
            }
            px += CHAR_WIDTH * 2 + 4;

            const vol = nc === 0 ? (cell.volume ?? 0)
              : nc === 1 ? (cell.volume2 ?? 0)
              : nc === 2 ? (cell.volume3 ?? 0) : (cell.volume4 ?? 0);
            const hasVol = vol >= 0x10 && vol <= 0x50;
            if (hasVol) {
              this.setTmpColor(lerpWhiteRGBA(colors.textVolume, glow), cellAlpha);
              this.addGlyphString(HEX_TABLE[vol & 0xFF], px, gy, atlas, this.tmpColor, bold);
            } else if (!ui.blankEmpty) {
              this.setTmpColor(lerpWhiteRGBA(colors.textMuted, 0), cellAlpha);
              this.addGlyphString('..', px, gy, atlas, this.tmpColor, false);
            }
          }

          // Effects start after all note column groups
          let px = x + totalNoteCols * NOTE_COL_GROUP_W;

          // Effect columns (variable) — use EFFECT_CHARS and HEX_TABLE lookups
          for (let ecol = 0; ecol < effectCols; ecol++) {
            let colEffTyp = 0;
            let colEff = 0;
            if (ecol === 0) { colEffTyp = cell.effTyp ?? 0; colEff = cell.eff ?? 0; }
            else if (ecol === 1) { colEffTyp = cell.effTyp2 ?? 0; colEff = cell.eff2 ?? 0; }
            else if (ecol === 2) { colEffTyp = cell.effTyp3 ?? 0; colEff = cell.eff3 ?? 0; }
            else if (ecol === 3) { colEffTyp = cell.effTyp4 ?? 0; colEff = cell.eff4 ?? 0; }
            else if (ecol === 4) { colEffTyp = cell.effTyp5 ?? 0; colEff = cell.eff5 ?? 0; }

            const hasEff = colEffTyp !== 0 || colEff !== 0;
            if (hasEff) {
              this.setTmpColor(lerpWhiteRGBA(colors.textEffect, glow), cellAlpha);
              // Symphonie DSP effects: effTyp 0x50-0x54 → type letter + value
              let effStr: string;
              if (colEffTyp >= 0x50 && colEffTyp <= 0x54) {
                const DSP_CHARS = ['D', 'E', 'C', 'L', 'X'];
                effStr = (DSP_CHARS[colEffTyp - 0x50] ?? 'D') + HEX_TABLE[colEff & 0xFF];
              } else if (colEffTyp >= 0x30 && colEffTyp <= 0x3F) {
                // OPL native effects: ~F=feedback, ~C=carrier vol, ~M=mod vol, ~V=inst vol
                const OPL_CHARS = ['F', 'C', 'M', 'V'];
                effStr = '~' + (OPL_CHARS[colEffTyp - 0x30] ?? '?') + ((colEff & 0xF).toString(16).toUpperCase());
              } else {
                effStr = (EFFECT_CHARS[colEffTyp] ?? '?') + HEX_TABLE[colEff & 0xFF];
              }
              this.addGlyphString(effStr, px, gy, atlas, this.tmpColor, bold);
            } else if (!ui.blankEmpty) {
              this.setTmpColor(lerpWhiteRGBA(colors.textMuted, 0), cellAlpha);
              this.addGlyphString('...', px, gy, atlas, this.tmpColor, false);
            }
            px += CHAR_WIDTH * 3 + 4;
          }

          // Flag columns
          const hasFlagCols = cell.flag1 !== undefined || cell.flag2 !== undefined;
          if (hasFlagCols) {
            const drawFlag = (flagVal: number | undefined, fx: number) => {
              let flagStr = '.';
              let fc: [number,number,number,number] = colors.textMuted;
              if (flagVal === 1) { flagStr = 'A'; fc = colors.flagAccent; }
              else if (flagVal === 2) { flagStr = 'S'; fc = colors.flagSlide; }
              else if (flagVal === 3) { flagStr = 'M'; fc = colors.flagMute; }
              else if (flagVal === 4) { flagStr = 'H'; fc = colors.flagHammer; }
              if (flagVal || !ui.blankEmpty) {
                this.setTmpColor(lerpWhiteRGBA(fc, flagVal ? glow : 0), cellAlpha);
                this.addGlyphString(flagStr, fx, gy, atlas, this.tmpColor, !!flagVal && bold);
              }
            };
            drawFlag(cell.flag1, px);
            px += CHAR_WIDTH + 4;
            drawFlag(cell.flag2, px);
            px += CHAR_WIDTH + 4;
          }

          // Probability — use pre-parsed PROB_COLORS instead of parseColor() in hot loop
          if (cell.probability !== undefined && cell.probability > 0) {
            const p = Math.min(99, Math.max(0, cell.probability));
            const pc = p >= 75 ? PROB_COLORS[3] : p >= 50 ? PROB_COLORS[2] : p >= 25 ? PROB_COLORS[1] : PROB_COLORS[0];
            const probStr = ui.useHex ? HEX_TABLE[p] : DEC_TABLE[p];
            this.setTmpColor(lerpWhiteRGBA(pc, glow), cellAlpha);
            this.addGlyphString(probStr, px, gy, atlas, this.tmpColor, bold);
          }
        } // end fixed-column path

        // Selection highlight (rect pass would be cleaner but we need to do it here per row)
        if (sel && !isGhostRow && ch >= minSelCh && ch <= maxSelCh
            && rowIndex >= minSelRow && rowIndex <= maxSelRow) {
          const [sr, sg, sb, sa] = colors.selection;
          this.addRect(colX, y, chW, rowH, [sr, sg, sb, sa]);
        }

        // Drag-over highlight
        if (dragOver && !isGhostRow
            && ch === dragOver.channelIndex && rowIndex === dragOver.rowIndex) {
          const ac = colors.accent;
          this.addRect(colX, y, chW, rowH, [ac[0], ac[1], ac[2], 0.4]);
        }
      }
    }

    // Flush final batches
    this.flushRects();
    this.flushGlyphs();
  }

  // ─── Instance data helpers ───────────────────────────────────────────────────

  private ensureRectCapacity(needed: number): void {
    if (this.rectCount + needed > this.rectData.length / RECT_FLOATS) {
      const newCap = Math.max(this.rectData.length / RECT_FLOATS * 2, this.rectCount + needed);
      const next = new Float32Array(newCap * RECT_FLOATS);
      next.set(this.rectData);
      this.rectData = next;
    }
  }

  private addRect(x: number, y: number, w: number, h: number, color: [number,number,number,number]): void {
    this.ensureRectCapacity(1);
    const off = this.rectCount * RECT_FLOATS;
    this.rectData[off+0] = x; this.rectData[off+1] = y;
    this.rectData[off+2] = w; this.rectData[off+3] = h;
    this.rectData[off+4] = color[0]; this.rectData[off+5] = color[1];
    this.rectData[off+6] = color[2]; this.rectData[off+7] = color[3];
    this.rectCount++;
  }

  private ensureGlyphCapacity(needed: number): void {
    if (this.glyphCount + needed > this.glyphData.length / GLYPH_FLOATS) {
      const newCap = Math.max(this.glyphData.length / GLYPH_FLOATS * 2, this.glyphCount + needed);
      const next = new Float32Array(newCap * GLYPH_FLOATS);
      next.set(this.glyphData);
      this.glyphData = next;
    }
  }

  private addGlyph(
    x: number, y: number,
    info: GlyphInfo,
    color: [number,number,number,number],
  ): void {
    this.ensureGlyphCapacity(1);
    const off = this.glyphCount * GLYPH_FLOATS;
    this.glyphData[off+0]  = x;
    this.glyphData[off+1]  = y;
    this.glyphData[off+2]  = info.logicalWidth;
    this.glyphData[off+3]  = info.logicalHeight;
    this.glyphData[off+4]  = info.u0;
    this.glyphData[off+5]  = info.v0;
    this.glyphData[off+6]  = info.u1;
    this.glyphData[off+7]  = info.v1;
    this.glyphData[off+8]  = color[0];
    this.glyphData[off+9]  = color[1];
    this.glyphData[off+10] = color[2];
    this.glyphData[off+11] = color[3];
    this.glyphCount++;
  }

  /** Set tmpColor to base color × alpha multiplier (avoids allocating new arrays) */
  private setTmpColor(base: [number,number,number,number], alphaMul: number): void {
    this.tmpColor[0] = base[0];
    this.tmpColor[1] = base[1];
    this.tmpColor[2] = base[2];
    this.tmpColor[3] = base[3] * alphaMul;
  }

  private addGlyphString(
    str: string,
    x: number,
    y: number,
    atlas: GlyphAtlas,
    color: [number,number,number,number],
    bold = false,
  ): void {
    let cx = x;
    for (let si = 0; si < str.length; si++) {
      const info = atlas.lookup.get(str[si]);
      if (info) {
        this.addGlyph(cx, y, info, color);
        if (bold) this.addGlyph(cx + 1, y, info, color); // fake bold: double-strike offset
        cx += info.logicalWidth;
      } else {
        cx += atlas.glyphLogicalWidth;
      }
    }
  }

  // ─── GPU flush ───────────────────────────────────────────────────────────────

  private flushRects(): void {
    if (this.rectCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.rectProg);
    gl.uniform2f(this.rectResLoc, this.width, this.height);
    gl.bindVertexArray(this.rectVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rectInstanceBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.rectData, 0, this.rectCount * RECT_FLOATS);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.rectCount);
    gl.bindVertexArray(null);
    this.rectCount = 0;
  }

  private flushGlyphs(): void {
    if (this.glyphCount === 0 || !this.atlas) return;
    const gl = this.gl;
    gl.useProgram(this.glyphProg);
    gl.uniform2f(this.glyphResLoc, this.width, this.height);
    gl.uniform1i(this.glyphAtlasLoc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.texture);
    gl.bindVertexArray(this.glyphVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphInstanceBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.glyphData, 0, this.glyphCount * GLYPH_FLOATS);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.glyphCount);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.glyphCount = 0;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.rectProg);
    gl.deleteProgram(this.glyphProg);
    gl.deleteBuffer(this.rectCornerBuf);
    gl.deleteBuffer(this.rectInstanceBuf);
    gl.deleteBuffer(this.glyphCornerBuf);
    gl.deleteBuffer(this.glyphInstanceBuf);
    gl.deleteVertexArray(this.rectVAO);
    gl.deleteVertexArray(this.glyphVAO);
    if (this.atlas) gl.deleteTexture(this.atlas.texture);
  }
}
