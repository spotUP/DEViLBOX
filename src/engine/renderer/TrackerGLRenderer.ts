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

function noteToString(note: number): string {
  if (note === 0) return '---';
  if (note === 97) return 'OFF';
  const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
  const noteIndex = (note - 1) % 12;
  const octave = Math.floor((note - 1) / 12);
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

function hexByte(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

function decByte(v: number): string {
  return v.toString(10).padStart(2, '0');
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

    const colors = {
      bg:                  parseColor(theme.bg),
      rowNormal:           parseColor(theme.rowNormal),
      rowHighlight:        parseColor(theme.rowHighlight),
      centerLine:          parseRgba(theme.accentGlow),
      cursor:              parseColor(theme.accent),
      cursorSecondary:     parseColor(theme.accentSecondary),
      text:                parseColor(theme.textNote),
      textMuted:           parseColor(theme.textMuted),
      textNote:            parseColor(theme.textNote),
      textNoteActive:      parseColor(theme.textNoteActive),
      textInstrument:      parseColor(theme.textInstrument),
      textVolume:          parseColor(theme.textVolume),
      textEffect:          parseColor(theme.textEffect),
      border:              parseColor(theme.border),
      lineNumber:          parseColor(theme.lineNumber),
      lineNumberHighlight: parseColor(theme.lineNumberHighlight),
      selection:           parseRgba(theme.selection),
      accent:              parseColor(theme.accent),
      flagAccent:          [0.961, 0.620, 0.044, 1.0] as [number, number, number, number], // #f59e0b
      flagSlide:           [0.024, 0.714, 0.831, 1.0] as [number, number, number, number], // #06b6d4
      flagMute:            [0.980, 0.800, 0.082, 1.0] as [number, number, number, number], // #facc15
      flagHammer:          [0.133, 0.827, 0.933, 1.0] as [number, number, number, number], // #22d3ee
    };

    // Current row
    const currentRow = isPlaying ? playRow : cursor.rowIndex;

    // Compute layout values
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const showAcid = ui.columnVisibility.flag1 || ui.columnVisibility.flag2;
    const showProb = ui.columnVisibility.probability;
    const paramWidth = CHAR_WIDTH * 4 + 8
      + (showAcid ? CHAR_WIDTH * 2 + 8 : 0)
      + (showProb ? CHAR_WIDTH * 2 + 4 : 0);
    const contentWidth = noteWidth + 4 + paramWidth;

    // Visible rows
    const visibleLines = Math.ceil(height / ROW_HEIGHT) + 2;
    const topLines = Math.floor(visibleLines / 2);
    const vStart = currentRow - topLines;
    const visibleEnd = vStart + visibleLines;
    const centerLineTop = Math.floor(height / 2) - ROW_HEIGHT / 2;
    const baseY = centerLineTop - topLines * ROW_HEIGHT - smoothOffset;

    // ── Clear ─────────────────────────────────────────────────────────────────
    if (ui.trackerVisualBg) {
      gl.clearColor(0, 0, 0, 0);
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

      const y = baseY + (i - vStart) * ROW_HEIGHT;
      if (y + ROW_HEIGHT < 0 || y > height) continue;

      if (!ui.trackerVisualBg) {
        const isHL = rowIndex % 4 === 0;
        const bgColor = isHL ? colors.rowHighlight : colors.rowNormal;
        const alpha = isGhostRow ? bgColor[3] * 0.35 : bgColor[3];
        this.addRect(0, y, width, ROW_HEIGHT, [bgColor[0], bgColor[1], bgColor[2], alpha]);
      }
    }

    // Center line highlight
    {
      const [r, g, b, a] = colors.centerLine;
      const alpha = ui.trackerVisualBg ? a * 0.5 : a;
      this.addRect(0, centerLineTop, width, ROW_HEIGHT, [r, g, b, alpha]);
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

      const y = baseY + (i - vStart) * ROW_HEIGHT;
      if (y + ROW_HEIGHT < 0 || y > height) continue;

      const ghostAlpha = isGhostRow ? 0.35 : 1.0;
      const isHL = rowIndex % 4 === 0;

      // Line number
      const lineNumStr = ui.useHex
        ? rowIndex.toString(16).toUpperCase().padStart(2, '0')
        : rowIndex.toString(10).padStart(2, '0');
      const lnColor = isHL ? colors.lineNumberHighlight : colors.lineNumber;
      this.addGlyphString(lineNumStr, 4, y + (ROW_HEIGHT - atlas.glyphLogicalHeight) / 2,
        atlas, [lnColor[0], lnColor[1], lnColor[2], lnColor[3] * ghostAlpha]);

      // Each channel
      for (let ch = 0; ch < numChannels; ch++) {
        const colX = channelOffsets[ch] - scrollX;
        const chW  = channelWidths[ch];
        if (colX + chW < 0 || colX > width) continue;

        const chData = sourcePattern.channels[ch];
        if (!chData) continue;
        const cell = chData.rows[rowIndex];
        if (!cell) continue;

        const isCollapsed = chData.collapsed;
        const x = colX + Math.floor((chW - (isCollapsed ? noteWidth : contentWidth)) / 2);
        const gy = y + (ROW_HEIGHT - atlas.glyphLogicalHeight) / 2;

        if (isCollapsed) {
          // Just note column
          const noteStr = noteToString(cell.note ?? 0);
          const nc = cell.note === 0 ? colors.textMuted : colors.textNote;
          this.addGlyphString(noteStr, x, gy, atlas,
            [nc[0], nc[1], nc[2], nc[3] * ghostAlpha]);
          continue;
        }

        // Note
        const isCurrentPlayingRow = isPlaying && !isGhostRow && rowIndex === currentRow;
        const cellNote = cell.note ?? 0;
        if (!ui.blankEmpty || cellNote !== 0) {
          const nc = cellNote === 0 ? colors.textMuted
                   : cellNote === 97 ? colors.textEffect
                   : (isCurrentPlayingRow && cellNote > 0 ? colors.textNoteActive : colors.textNote);
          this.addGlyphString(noteToString(cellNote), x, gy, atlas,
            [nc[0], nc[1], nc[2], nc[3] * ghostAlpha]);
        }

        // Parameters
        let px = x + noteWidth + 4;
        const effectCols = chData.effectCols ?? 2;

        // Instrument
        const inst = cell.instrument ?? 0;
        if (inst !== 0) {
          const ic = colors.textInstrument;
          this.addGlyphString(hexByte(inst), px, gy, atlas,
            [ic[0], ic[1], ic[2], ic[3] * ghostAlpha]);
        } else if (!ui.blankEmpty) {
          const mc = colors.textMuted;
          this.addGlyphString('..', px, gy, atlas, [mc[0], mc[1], mc[2], mc[3] * ghostAlpha]);
        }
        px += CHAR_WIDTH * 2 + 4;

        // Volume
        const vol = cell.volume ?? 0;
        const hasVol = vol >= 0x10 && vol <= 0x50;
        if (hasVol) {
          const vc = colors.textVolume;
          this.addGlyphString(hexByte(vol), px, gy, atlas,
            [vc[0], vc[1], vc[2], vc[3] * ghostAlpha]);
        } else if (!ui.blankEmpty) {
          const mc = colors.textMuted;
          this.addGlyphString('..', px, gy, atlas, [mc[0], mc[1], mc[2], mc[3] * ghostAlpha]);
        }
        px += CHAR_WIDTH * 2 + 4;

        // Effect columns (variable)
        for (let ecol = 0; ecol < effectCols; ecol++) {
          let colEffTyp = 0;
          let colEff = 0;
          if (ecol === 0) { colEffTyp = cell.effTyp ?? 0; colEff = cell.eff ?? 0; }
          else if (ecol === 1) { colEffTyp = cell.effTyp2 ?? 0; colEff = cell.eff2 ?? 0; }

          const hasEff = colEffTyp !== 0 || colEff !== 0;
          if (hasEff) {
            const ec = colors.textEffect;
            const effChar = colEffTyp < 10 ? colEffTyp.toString() : String.fromCharCode(55 + colEffTyp);
            this.addGlyphString(effChar + hexByte(colEff), px, gy, atlas,
              [ec[0], ec[1], ec[2], ec[3] * ghostAlpha]);
          } else if (!ui.blankEmpty) {
            const mc = colors.textMuted;
            this.addGlyphString('...', px, gy, atlas, [mc[0], mc[1], mc[2], mc[3] * ghostAlpha]);
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
              this.addGlyphString(flagStr, fx, gy, atlas, [fc[0], fc[1], fc[2], fc[3] * ghostAlpha]);
            }
          };
          drawFlag(cell.flag1, px);
          px += CHAR_WIDTH + 4;
          drawFlag(cell.flag2, px);
          px += CHAR_WIDTH + 4;
        }

        // Probability
        if (cell.probability !== undefined && cell.probability > 0) {
          const p = Math.min(99, Math.max(0, cell.probability));
          const probHex = p >= 75 ? '#4ade80' : p >= 50 ? '#facc15' : p >= 25 ? '#fb923c' : '#f87171';
          const pc = parseColor(probHex);
          const probStr = ui.useHex ? hexByte(p) : decByte(p);
          this.addGlyphString(probStr, px, gy, atlas, [pc[0], pc[1], pc[2], pc[3] * ghostAlpha]);
        }

        // Selection highlight (rect pass would be cleaner but we need to do it here per row)
        if (sel && !isGhostRow && ch >= minSelCh && ch <= maxSelCh
            && rowIndex >= minSelRow && rowIndex <= maxSelRow) {
          const [sr, sg, sb, sa] = colors.selection;
          this.addRect(colX, y, chW, ROW_HEIGHT, [sr, sg, sb, sa]);
        }

        // Drag-over highlight
        if (dragOver && !isGhostRow
            && ch === dragOver.channelIndex && rowIndex === dragOver.rowIndex) {
          const ac = colors.accent;
          this.addRect(colX, y, chW, ROW_HEIGHT, [ac[0], ac[1], ac[2], 0.4]);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASS 3 — Overlays (cursor caret + channel separators top-pass)
    // ═══════════════════════════════════════════════════════════════════════════

    // Cursor caret
    if (!pattern.channels[cursor.channelIndex]?.collapsed) {
      const colX = channelOffsets[cursor.channelIndex] - scrollX;
      const chW  = channelWidths[cursor.channelIndex];
      const cursorX = colX + Math.floor((chW - contentWidth) / 2);

      const paramBase = noteWidth + 4;
      const hasAcidC  = pattern.channels[cursor.channelIndex]?.rows[0]?.flag1 !== undefined
                     || pattern.channels[cursor.channelIndex]?.rows[0]?.flag2 !== undefined;
      const acidOff = CHAR_WIDTH * 10 + 16;
      const probOff = acidOff + (hasAcidC ? CHAR_WIDTH * 2 + 8 : 0);

      let caretOffX = 0;
      let caretW    = CHAR_WIDTH;

      switch (cursor.columnType) {
        case 'note':       caretOffX = 0;                                                               caretW = noteWidth; break;
        case 'instrument': caretOffX = paramBase + cursor.digitIndex * CHAR_WIDTH;                      break;
        case 'volume':     caretOffX = paramBase + (CHAR_WIDTH * 2 + 4) + cursor.digitIndex * CHAR_WIDTH; break;
        case 'effTyp':     caretOffX = paramBase + CHAR_WIDTH * 4 + 8;                                  break;
        case 'effParam':   caretOffX = paramBase + CHAR_WIDTH * 4 + 8 + CHAR_WIDTH + cursor.digitIndex * CHAR_WIDTH; break;
        case 'effTyp2':    caretOffX = paramBase + CHAR_WIDTH * 7 + 12;                                 break;
        case 'effParam2':  caretOffX = paramBase + CHAR_WIDTH * 7 + 12 + CHAR_WIDTH + cursor.digitIndex * CHAR_WIDTH; break;
        case 'flag1':      caretOffX = paramBase + acidOff;                                             break;
        case 'flag2':      caretOffX = paramBase + acidOff + CHAR_WIDTH + 4;                            break;
        case 'probability':caretOffX = paramBase + probOff + cursor.digitIndex * CHAR_WIDTH;            break;
        default:           caretOffX = paramBase + CHAR_WIDTH * 4 + 8;                                  break;
      }

      const caretX = cursorX + caretOffX;
      const caretY = centerLineTop;

      // Determine caret color
      let caretColor = colors.cursor;
      if (isPlaying) caretColor = colors.cursorSecondary;

      // Draw caret background
      this.addRect(caretX, caretY, caretW, ROW_HEIGHT, caretColor);
    }

    this.flushRects();
    this.flushGlyphs();

    // Draw cursor text (white on colored background) — separate glyph pass
    if (!pattern.channels[cursor.channelIndex]?.collapsed) {
      const colX = channelOffsets[cursor.channelIndex] - scrollX;
      const chW  = channelWidths[cursor.channelIndex];
      const cursorX = colX + Math.floor((chW - contentWidth) / 2);

      const paramBase = noteWidth + 4;
      const hasAcidC  = pattern.channels[cursor.channelIndex]?.rows[0]?.flag1 !== undefined
                     || pattern.channels[cursor.channelIndex]?.rows[0]?.flag2 !== undefined;
      const acidOff = CHAR_WIDTH * 10 + 16;
      const probOff = acidOff + (hasAcidC ? CHAR_WIDTH * 2 + 8 : 0);

      let caretOffX = 0;
      switch (cursor.columnType) {
        case 'note':       caretOffX = 0; break;
        case 'instrument': caretOffX = paramBase + cursor.digitIndex * CHAR_WIDTH; break;
        case 'volume':     caretOffX = paramBase + CHAR_WIDTH * 2 + 4 + cursor.digitIndex * CHAR_WIDTH; break;
        case 'effTyp':     caretOffX = paramBase + CHAR_WIDTH * 4 + 8; break;
        case 'effParam':   caretOffX = paramBase + CHAR_WIDTH * 4 + 8 + CHAR_WIDTH + cursor.digitIndex * CHAR_WIDTH; break;
        case 'effTyp2':    caretOffX = paramBase + CHAR_WIDTH * 7 + 12; break;
        case 'effParam2':  caretOffX = paramBase + CHAR_WIDTH * 7 + 12 + CHAR_WIDTH + cursor.digitIndex * CHAR_WIDTH; break;
        case 'flag1':      caretOffX = paramBase + acidOff; break;
        case 'flag2':      caretOffX = paramBase + acidOff + CHAR_WIDTH + 4; break;
        case 'probability':caretOffX = paramBase + probOff + cursor.digitIndex * CHAR_WIDTH; break;
        default:           caretOffX = paramBase + CHAR_WIDTH * 4 + 8; break;
      }

      const caretRow = isPlaying ? currentRow : cursor.rowIndex;
      const caretCell = pattern.channels[cursor.channelIndex]?.rows[caretRow];
      if (caretCell) {
        const col = cursor.columnType;
        const di  = cursor.digitIndex;
        let charStr = '';
        if (col === 'note') {
          charStr = noteToString(caretCell.note ?? 0);
        } else if (col === 'instrument') {
          const s = (caretCell.instrument ?? 0) === 0 ? '..' : hexByte(caretCell.instrument ?? 0);
          charStr = s[di] ?? '.';
        } else if (col === 'volume') {
          const v = caretCell.volume ?? 0;
          const s = (v >= 0x10 && v <= 0x50) ? hexByte(v) : '..';
          charStr = s[di] ?? '.';
        } else if (col === 'effTyp') {
          const et = caretCell.effTyp ?? 0; const ep = caretCell.eff ?? 0;
          charStr = (et !== 0 || ep !== 0) ? et.toString(16).toUpperCase() : '.';
        } else if (col === 'effParam') {
          const et = caretCell.effTyp ?? 0; const ep = caretCell.eff ?? 0;
          const s = (et !== 0 || ep !== 0) ? hexByte(ep) : '..';
          charStr = s[di] ?? '.';
        } else if (col === 'effTyp2') {
          const et2 = caretCell.effTyp2 ?? 0; const ep2 = caretCell.eff2 ?? 0;
          charStr = (et2 !== 0 || ep2 !== 0) ? et2.toString(16).toUpperCase() : '.';
        } else if (col === 'effParam2') {
          const et2 = caretCell.effTyp2 ?? 0; const ep2 = caretCell.eff2 ?? 0;
          const s = (et2 !== 0 || ep2 !== 0) ? hexByte(ep2) : '..';
          charStr = s[di] ?? '.';
        } else if (col === 'flag1') {
          charStr = caretCell.flag1 === 1 ? 'A' : caretCell.flag1 === 2 ? 'S' : '.';
        } else if (col === 'flag2') {
          charStr = caretCell.flag2 === 1 ? 'A' : caretCell.flag2 === 2 ? 'S' : '.';
        } else if (col === 'probability') {
          const p = caretCell.probability ?? 0;
          const s = p > 0 ? (ui.useHex ? hexByte(p) : decByte(p)) : '..';
          charStr = s[di] ?? '.';
        }

        const caretX = cursorX + caretOffX;
        const caretY = centerLineTop;
        const gy = caretY + (ROW_HEIGHT - atlas.glyphLogicalHeight) / 2;
        this.addGlyphString(charStr, caretX, gy, atlas, [1, 1, 1, 1]);
      }
    }

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

  private addGlyphString(
    str: string,
    x: number,
    y: number,
    atlas: GlyphAtlas,
    color: [number,number,number,number],
  ): void {
    let cx = x;
    for (const ch of str) {
      const info = atlas.lookup.get(ch);
      if (info) {
        this.addGlyph(cx, y, info, color);
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
