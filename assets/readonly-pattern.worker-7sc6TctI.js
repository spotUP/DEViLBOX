(function() {
  "use strict";
  const ATLAS_CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const ATLAS_CHAR_LIST = Array.from(ATLAS_CHARS);
  const ATLAS_COLS = 16;
  function buildGlyphAtlas(gl, fontFamily, fontSizePx, rowHeightPx, dpr) {
    const physicalFontSize = fontSizePx * dpr;
    const physicalCellH = Math.ceil(rowHeightPx * dpr);
    const measureCanvas = new OffscreenCanvas(64, physicalCellH);
    const mctx = measureCanvas.getContext("2d");
    mctx.font = `${physicalFontSize}px ${fontFamily}`;
    const measured = mctx.measureText("W");
    const physicalCellW = Math.ceil(measured.width);
    const numChars = ATLAS_CHAR_LIST.length;
    const numRows = Math.ceil(numChars / ATLAS_COLS);
    const atlasW = ATLAS_COLS * physicalCellW;
    const atlasH = numRows * physicalCellH;
    const atlasCanvas = new OffscreenCanvas(atlasW, atlasH);
    const ctx = atlasCanvas.getContext("2d");
    ctx.clearRect(0, 0, atlasW, atlasH);
    ctx.font = `${physicalFontSize}px ${fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    const lookup = /* @__PURE__ */ new Map();
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
        logicalHeight: physicalCellH / dpr
      });
    });
    const imageData = ctx.getImageData(0, 0, atlasW, atlasH);
    const texture = gl.createTexture();
    if (!texture) throw new Error("[GlyphAtlas] Failed to create WebGL texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      atlasW,
      atlasH,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      imageData.data
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
      dpr
    };
  }
  function parseColor(css) {
    const hex = css.replace("#", "");
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
        1
      ];
    }
    if (hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
        parseInt(hex.slice(6, 8), 16) / 255
      ];
    }
    return [0.9, 0.9, 0.9, 1];
  }
  function parseRgba(css) {
    if (css.startsWith("#")) return parseColor(css);
    const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (m) {
      return [
        parseInt(m[1]) / 255,
        parseInt(m[2]) / 255,
        parseInt(m[3]) / 255,
        m[4] !== void 0 ? parseFloat(m[4]) : 1
      ];
    }
    return [0.5, 0.5, 0.5, 1];
  }
  const ROW_HEIGHT = 24;
  const CHAR_WIDTH = 10;
  const FONT_FAMILY = '"JetBrains Mono", "Fira Code", monospace';
  const FONT_SIZE_PX = 14;
  const RECT_VERT = (
    /* glsl */
    `#version 300 es
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
}`
  );
  const RECT_FRAG = (
    /* glsl */
    `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 fragColor;

void main() {
  fragColor = vColor;
}`
  );
  const GLYPH_VERT = (
    /* glsl */
    `#version 300 es
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
}`
  );
  const GLYPH_FRAG = (
    /* glsl */
    `#version 300 es
precision mediump float;
in vec2 vUV;
in vec4 vColor;
uniform sampler2D uAtlas;
out vec4 fragColor;

void main() {
  float a = texture(uAtlas, vUV).a; // white text on transparent background
  fragColor = vec4(vColor.rgb, a * vColor.a);
}`
  );
  function compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    if (!sh) throw new Error("createShader failed");
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile error: ${gl.getShaderInfoLog(sh)}`);
    }
    return sh;
  }
  function linkProgram(gl, vert, frag) {
    const prog = gl.createProgram();
    if (!prog) throw new Error("createProgram failed");
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }
  const NOTE_NAMES = ["C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-"];
  const HEX_TABLE = new Array(256);
  const DEC_TABLE = new Array(256);
  for (let i = 0; i < 256; i++) {
    HEX_TABLE[i] = i.toString(16).toUpperCase().padStart(2, "0");
    DEC_TABLE[i] = i.toString(10).padStart(2, "0");
  }
  const HEX1_TABLE = Array.from({ length: 16 }, (_, i) => i.toString(16).toUpperCase());
  const NOTE_CACHE = /* @__PURE__ */ new Map();
  function getNoteTable(displayOffset) {
    let table = NOTE_CACHE.get(displayOffset);
    if (table) return table;
    table = new Array(192);
    table[0] = "---";
    for (let n = 1; n < 189; n++) {
      const adj = n + displayOffset - 1;
      const noteIndex = (adj % 12 + 12) % 12;
      const octave = Math.floor(adj / 12);
      table[n] = `${NOTE_NAMES[noteIndex]}${octave}`;
    }
    table[97] = "OFF";
    NOTE_CACHE.set(displayOffset, table);
    return table;
  }
  const COL_GAP = 4;
  const EFFECT_CHARS = new Array(36);
  for (let i = 0; i < 10; i++) EFFECT_CHARS[i] = i.toString();
  for (let i = 10; i < 36; i++) EFFECT_CHARS[i] = String.fromCharCode(55 + i);
  const PROB_COLORS = [
    parseColor("#f87171"),
    // 0-24
    parseColor("#fb923c"),
    // 25-49
    parseColor("#facc15"),
    // 50-74
    parseColor("#4ade80")
    // 75-99
  ];
  function lerpWhiteRGBA(c, t) {
    if (t <= 0) return c;
    if (t >= 1) return [1, 1, 1, c[3]];
    return [c[0] + (1 - c[0]) * t, c[1] + (1 - c[1]) * t, c[2] + (1 - c[2]) * t, c[3]];
  }
  const RECT_FLOATS = 8;
  const GLYPH_FLOATS = 12;
  const RECT_CAPACITY = 4096;
  const GLYPH_CAPACITY = 65536;
  class TrackerGLRenderer {
    gl;
    rectProg;
    glyphProg;
    // Uniforms
    rectResLoc;
    glyphResLoc;
    glyphAtlasLoc;
    // Rect draw resources
    rectVAO;
    rectCornerBuf;
    rectInstanceBuf;
    // Glyph draw resources
    glyphVAO;
    glyphCornerBuf;
    glyphInstanceBuf;
    // Atlas
    atlas = null;
    // Instance data
    rectData;
    glyphData;
    rectCount = 0;
    glyphCount = 0;
    // Canvas size in logical CSS pixels
    width = 1;
    height = 1;
    dpr = 1;
    // Cached parsed theme colors — only re-parsed when theme object changes
    cachedTheme = null;
    colors = {
      bg: [0, 0, 0, 1],
      rowNormal: [0, 0, 0, 1],
      rowHighlight: [0, 0, 0, 1],
      rowSecondaryHighlight: [0, 0, 0, 1],
      centerLine: [0, 0, 0, 1],
      rowCurrent: [0, 0, 0, 1],
      cursor: [0, 0, 0, 1],
      cursorSecondary: [0, 0, 0, 1],
      text: [0, 0, 0, 1],
      textMuted: [0, 0, 0, 1],
      textNote: [0, 0, 0, 1],
      textNoteActive: [0, 0, 0, 1],
      textInstrument: [0, 0, 0, 1],
      textVolume: [0, 0, 0, 1],
      textEffect: [0, 0, 0, 1],
      border: [0, 0, 0, 1],
      lineNumber: [0, 0, 0, 1],
      lineNumberHighlight: [0, 0, 0, 1],
      selection: [0, 0, 0, 1],
      bookmark: [0.961, 0.62, 0.044, 1],
      accent: [0, 0, 0, 1],
      flagAccent: [0.961, 0.62, 0.044, 1],
      flagSlide: [0.024, 0.714, 0.831, 1],
      flagMute: [0.98, 0.8, 0.082, 1],
      flagHammer: [0.133, 0.827, 0.933, 1]
    };
    // Reusable color tuple to avoid per-cell allocations
    tmpColor = [0, 0, 0, 1];
    constructor(canvas) {
      const gl = canvas.getContext("webgl2", {
        antialias: false,
        alpha: true,
        premultipliedAlpha: false,
        desynchronized: true
      });
      if (!gl) throw new Error("[TrackerGLRenderer] WebGL2 not supported");
      this.gl = gl;
      this.rectProg = linkProgram(gl, RECT_VERT, RECT_FRAG);
      this.glyphProg = linkProgram(gl, GLYPH_VERT, GLYPH_FRAG);
      this.rectResLoc = gl.getUniformLocation(this.rectProg, "uResolution");
      this.glyphResLoc = gl.getUniformLocation(this.glyphProg, "uResolution");
      this.glyphAtlasLoc = gl.getUniformLocation(this.glyphProg, "uAtlas");
      const corners = new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]);
      this.rectVAO = gl.createVertexArray();
      gl.bindVertexArray(this.rectVAO);
      this.rectCornerBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rectCornerBuf);
      gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.rectInstanceBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rectInstanceBuf);
      this.rectData = new Float32Array(RECT_CAPACITY * RECT_FLOATS);
      gl.bufferData(gl.ARRAY_BUFFER, this.rectData.byteLength, gl.DYNAMIC_DRAW);
      const stride = RECT_FLOATS * 4;
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
      gl.vertexAttribDivisor(2, 1);
      gl.bindVertexArray(null);
      this.glyphVAO = gl.createVertexArray();
      gl.bindVertexArray(this.glyphVAO);
      this.glyphCornerBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphCornerBuf);
      gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.glyphInstanceBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphInstanceBuf);
      this.glyphData = new Float32Array(GLYPH_CAPACITY * GLYPH_FLOATS);
      gl.bufferData(gl.ARRAY_BUFFER, this.glyphData.byteLength, gl.DYNAMIC_DRAW);
      const gStride = GLYPH_FLOATS * 4;
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, gStride, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, gStride, 8);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, gStride, 16);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 4, gl.FLOAT, false, gStride, 32);
      gl.vertexAttribDivisor(4, 1);
      gl.bindVertexArray(null);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA
      );
      gl.disable(gl.DEPTH_TEST);
    }
    // ─── Public API ─────────────────────────────────────────────────────────────
    resize(logicalW, logicalH, dpr) {
      this.width = logicalW;
      this.height = logicalH;
      this.dpr = dpr;
      const canvas = this.gl.canvas;
      canvas.width = Math.ceil(logicalW * dpr);
      canvas.height = Math.ceil(logicalH * dpr);
      this.gl.viewport(0, 0, canvas.width, canvas.height);
      if (!this.atlas || this.atlas.dpr !== dpr) {
        this.buildAtlas();
      }
    }
    buildAtlas() {
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
    render(opts) {
      var _a, _b, _c, _d;
      if (!this.atlas) this.buildAtlas();
      const atlas = this.atlas;
      const gl = this.gl;
      this.rectCount = 0;
      this.glyphCount = 0;
      const {
        patterns,
        currentPatternIndex,
        scrollX,
        cursor,
        selection,
        playback,
        theme: theme2,
        ui,
        layout: layout2,
        dragOver
      } = opts;
      const { isPlaying: isPlaying2, row: playRow, smoothOffset, patternIndex: playPatternIdx } = playback;
      const activePatternIdx = isPlaying2 ? playPatternIdx : currentPatternIndex;
      const pattern2 = patterns[activePatternIdx];
      const { width, height } = this;
      const { offsets: channelOffsets, widths: channelWidths } = layout2;
      if (height < 48 || width < 48) return;
      if (theme2 !== this.cachedTheme) {
        this.cachedTheme = theme2;
        this.colors.bg = parseColor(theme2.bg);
        this.colors.rowNormal = parseColor(theme2.rowNormal);
        this.colors.rowHighlight = parseColor(theme2.rowHighlight);
        this.colors.rowSecondaryHighlight = parseColor(theme2.rowSecondaryHighlight);
        this.colors.centerLine = parseRgba(theme2.accentGlow);
        this.colors.rowCurrent = parseColor(theme2.rowCurrent);
        this.colors.cursor = parseColor(theme2.accent);
        this.colors.cursorSecondary = parseColor(theme2.accentSecondary);
        this.colors.text = parseColor(theme2.textNote);
        this.colors.textMuted = parseColor(theme2.textMuted);
        this.colors.textNote = parseColor(theme2.textNote);
        this.colors.textNoteActive = parseColor(theme2.textNoteActive);
        this.colors.textInstrument = parseColor(theme2.textInstrument);
        this.colors.textVolume = parseColor(theme2.textVolume);
        this.colors.textEffect = parseColor(theme2.textEffect);
        this.colors.border = parseColor(theme2.trackerBorder || theme2.border);
        this.colors.lineNumber = parseColor(theme2.lineNumber);
        this.colors.lineNumberHighlight = parseColor(theme2.lineNumberHighlight);
        this.colors.selection = parseRgba(theme2.selection);
        this.colors.bookmark = parseColor(theme2.bookmark || "#f59e0b");
        this.colors.accent = parseColor(theme2.accent);
      }
      const colors = this.colors;
      const currentRow2 = isPlaying2 ? playRow : cursor.rowIndex;
      const noteWidth = CHAR_WIDTH * 3 + 4;
      const showAcid = ui.columnVisibility.flag1 || ui.columnVisibility.flag2;
      const showProb = ui.columnVisibility.probability;
      const rowH = ui.rowHeight ?? 24;
      const visibleLines = Math.ceil(height / rowH) + 2;
      const topLines = Math.floor(visibleLines / 2);
      const vStart = currentRow2 - topLines;
      const visibleEnd = vStart + visibleLines;
      const centerLineTop = Math.floor(height / 2) - rowH / 2;
      const baseY = centerLineTop - topLines * rowH - smoothOffset;
      const hlInterval = ui.rowHighlightInterval ?? 4;
      const hl2Interval = ui.rowSecondaryHighlightInterval ?? 0;
      if (ui.trackerVisualBg) {
        gl.clearColor(0, 0, 0, 0);
      } else {
        const [r, g, b, a] = colors.bg;
        gl.clearColor(r, g, b, a);
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!pattern2) {
        this.flushRects();
        this.flushGlyphs();
        return;
      }
      const numChannels = pattern2.channels.length;
      const anySolo = pattern2.channels.some((ch) => ch.solo);
      const MUTED_ALPHA = 0.3;
      const sel = selection;
      const minSelCh = sel ? Math.min(sel.startChannel, sel.endChannel) : -1;
      const maxSelCh = sel ? Math.max(sel.startChannel, sel.endChannel) : -1;
      const minSelRow = sel ? Math.min(sel.startRow, sel.endRow) : -1;
      const maxSelRow = sel ? Math.max(sel.startRow, sel.endRow) : -1;
      for (let ch = 0; ch < numChannels; ch++) {
        const colX = channelOffsets[ch] - scrollX;
        const chW = channelWidths[ch];
        if (colX + chW < 0 || colX > width) continue;
        const chData = pattern2.channels[ch];
        if (ch === cursor.channelIndex) {
          this.addRect(colX, 0, chW, height, [1, 1, 1, 0.02]);
        }
        if (chData.color) {
          const c = parseColor(chData.color);
          this.addRect(colX, 0, chW, height, [c[0], c[1], c[2], 0.03]);
        }
        const isDimmed = chData.muted || anySolo && !chData.solo;
        if (isDimmed) {
          this.addRect(colX, 0, chW, height, [0, 0, 0, 0.45]);
        }
      }
      for (let i = vStart; i < visibleEnd; i++) {
        let rowIndex;
        let isGhostRow = false;
        let ghostPattern = null;
        if (i < 0 || i >= pattern2.length) {
          if (!ui.showGhostPatterns) continue;
          if (i < 0) {
            const prevIdx = isPlaying2 ? activePatternIdx - 1 : currentPatternIndex - 1;
            ghostPattern = prevIdx >= 0 ? patterns[prevIdx] : patterns[patterns.length - 1] ?? null;
            if (!ghostPattern) continue;
            rowIndex = ghostPattern.length + i;
            if (rowIndex < 0 || rowIndex >= ghostPattern.length) continue;
          } else {
            const nextIdx = isPlaying2 ? activePatternIdx + 1 : currentPatternIndex + 1;
            ghostPattern = nextIdx < patterns.length ? patterns[nextIdx] : patterns[0] ?? null;
            if (!ghostPattern) continue;
            rowIndex = i - pattern2.length;
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
      if (ui.bookmarks && ui.bookmarks.length > 0) {
        const bmColor = colors.bookmark;
        for (const bm of ui.bookmarks) {
          if (bm < vStart || bm >= visibleEnd) continue;
          if (bm < 0 || bm >= pattern2.length) continue;
          const y = baseY + (bm - vStart) * rowH;
          if (y + rowH < 0 || y > height) continue;
          this.addRect(0, y, 3, rowH, [bmColor[0], bmColor[1], bmColor[2], 0.9]);
        }
      }
      {
        const [r, g, b, a] = colors.centerLine;
        const alpha = ui.trackerVisualBg ? a * 0.5 : a;
        this.addRect(0, centerLineTop, width, rowH, [r, g, b, alpha]);
      }
      if (!((_a = pattern2.channels[cursor.channelIndex]) == null ? void 0 : _a.collapsed)) {
        const colX = channelOffsets[cursor.channelIndex] - scrollX;
        const chW = channelWidths[cursor.channelIndex];
        const chData = pattern2.channels[cursor.channelIndex];
        const chColumns = (chData == null ? void 0 : chData.columnSpecs) ?? ui.columns;
        const colIdx = parseInt(cursor.columnType, 10);
        let caretOffX = 0;
        let caretW = CHAR_WIDTH;
        let cursorX;
        if (!isNaN(colIdx) && chColumns) {
          const dataContentWidth = chColumns.reduce((s, c) => s + c.charWidth * CHAR_WIDTH + COL_GAP, 0) - COL_GAP;
          cursorX = colX + Math.floor((chW - dataContentWidth) / 2);
          for (let ci = 0; ci < colIdx && ci < chColumns.length; ci++) {
            caretOffX += chColumns[ci].charWidth * CHAR_WIDTH + COL_GAP;
          }
          caretW = (((_b = chColumns[colIdx]) == null ? void 0 : _b.charWidth) ?? 1) * CHAR_WIDTH;
        } else {
          const cursorEffectCols = (chData == null ? void 0 : chData.effectCols) ?? 2;
          const cursorNoteCols = (chData == null ? void 0 : chData.noteCols) ?? 1;
          const CURSOR_NOTE_COL_GROUP_W = noteWidth + 4 + CHAR_WIDTH * 2 + 4 + CHAR_WIDTH * 2 + 4;
          const cursorContentWidth = CURSOR_NOTE_COL_GROUP_W * cursorNoteCols + cursorEffectCols * (CHAR_WIDTH * 3 + 4) + (showAcid ? CHAR_WIDTH * 2 + 8 : 0) + (showProb ? CHAR_WIDTH * 2 + 4 : 0);
          cursorX = colX + Math.floor((chW - cursorContentWidth) / 2);
          const cursorNoteCol = cursor.noteColumnIndex ?? 0;
          const noteColOffset = cursorNoteCol * CURSOR_NOTE_COL_GROUP_W;
          const paramBase = noteWidth + 4;
          const hasAcidC = ((_c = chData == null ? void 0 : chData.rows[0]) == null ? void 0 : _c.flag1) !== void 0 || ((_d = chData == null ? void 0 : chData.rows[0]) == null ? void 0 : _d.flag2) !== void 0;
          const effBase = cursorNoteCols * CURSOR_NOTE_COL_GROUP_W;
          const acidOff = effBase + cursorEffectCols * (CHAR_WIDTH * 3 + 4);
          const probOff = acidOff + (hasAcidC ? CHAR_WIDTH * 2 + 8 : 0);
          switch (cursor.columnType) {
            case "note":
              caretOffX = noteColOffset;
              caretW = noteWidth;
              break;
            case "instrument":
              caretOffX = noteColOffset + paramBase + cursor.digitIndex * CHAR_WIDTH;
              break;
            case "volume":
              caretOffX = noteColOffset + paramBase + (CHAR_WIDTH * 2 + 4) + cursor.digitIndex * CHAR_WIDTH;
              break;
            case "effTyp":
              caretOffX = effBase;
              break;
            case "effParam":
              caretOffX = effBase + CHAR_WIDTH + cursor.digitIndex * CHAR_WIDTH;
              break;
            case "effTyp2":
              caretOffX = effBase + (CHAR_WIDTH * 3 + 4);
              break;
            case "effParam2":
              caretOffX = effBase + (CHAR_WIDTH * 3 + 4) + CHAR_WIDTH + cursor.digitIndex * CHAR_WIDTH;
              break;
            case "flag1":
              caretOffX = acidOff;
              break;
            case "flag2":
              caretOffX = acidOff + CHAR_WIDTH + 4;
              break;
            case "probability":
              caretOffX = probOff + cursor.digitIndex * CHAR_WIDTH;
              break;
            default:
              caretOffX = effBase;
              break;
          }
        }
        const caretX = cursorX + caretOffX;
        const caretY = centerLineTop;
        this.addRect(caretX, caretY, caretW, rowH, colors.cursor);
      }
      for (let ch = 0; ch < numChannels; ch++) {
        const colX = channelOffsets[ch] - scrollX;
        const chW = channelWidths[ch];
        if (colX + chW < 0 || colX > width) continue;
        const chData = pattern2.channels[ch];
        this.addRect(colX + chW, 0, 1, height, colors.border);
        if (chData.color) {
          const c = parseColor(chData.color);
          const stripeW = chData.collapsed ? 4 : 2;
          this.addRect(colX, 0, stripeW, height, [c[0], c[1], c[2], 0.4]);
        }
      }
      this.flushRects();
      const noteTable = getNoteTable(ui.noteDisplayOffset);
      for (let i = vStart; i < visibleEnd; i++) {
        let rowIndex;
        let isGhostRow = false;
        let sourcePattern = pattern2;
        if (i < 0 || i >= pattern2.length) {
          if (!ui.showGhostPatterns) continue;
          if (i < 0) {
            const prevIdx = isPlaying2 ? activePatternIdx - 1 : currentPatternIndex - 1;
            const gp = prevIdx >= 0 ? patterns[prevIdx] : patterns[patterns.length - 1] ?? null;
            if (!gp) continue;
            rowIndex = gp.length + i;
            if (rowIndex < 0 || rowIndex >= gp.length) continue;
            sourcePattern = gp;
          } else {
            const nextIdx = isPlaying2 ? activePatternIdx + 1 : currentPatternIndex + 1;
            const gp = nextIdx < patterns.length ? patterns[nextIdx] : patterns[0] ?? null;
            if (!gp) continue;
            rowIndex = i - pattern2.length;
            if (rowIndex < 0 || rowIndex >= gp.length) continue;
            sourcePattern = gp;
          }
          isGhostRow = true;
        } else {
          rowIndex = i;
        }
        const y = baseY + (i - vStart) * rowH;
        if (y + rowH < 0 || y > height) continue;
        const ghostAlpha = isGhostRow ? 0.35 : 1;
        const isHL2b = hl2Interval > 0 && rowIndex % hl2Interval === 0;
        const isHL = rowIndex % hlInterval === 0 || isHL2b;
        const TRAIL_ROWS = 3;
        const behind = isPlaying2 && !isGhostRow ? currentRow2 - i : -1;
        const glow = behind >= 0 && behind <= TRAIL_ROWS ? 1 - behind / TRAIL_ROWS : 0;
        const bold = behind === 0;
        let lineNumStr;
        if (ui.showBeatLabels) {
          const beat = Math.floor(rowIndex / hlInterval) + 1;
          const tick = rowIndex % hlInterval + 1;
          lineNumStr = `${beat}.${tick}`;
        } else {
          lineNumStr = ui.useHex ? HEX_TABLE[rowIndex & 255] : DEC_TABLE[rowIndex & 255];
        }
        const lnColor = lerpWhiteRGBA(isHL ? colors.lineNumberHighlight : colors.lineNumber, glow);
        this.setTmpColor(lnColor, ghostAlpha);
        this.addGlyphString(
          lineNumStr,
          4,
          y + (rowH - atlas.glyphLogicalHeight) / 2,
          atlas,
          this.tmpColor,
          bold
        );
        for (let ch = 0; ch < numChannels; ch++) {
          const colX = channelOffsets[ch] - scrollX;
          const chW = channelWidths[ch];
          if (colX + chW < 0 || colX > width) continue;
          const chData = sourcePattern.channels[ch];
          if (!chData) continue;
          const cell = chData.rows[rowIndex];
          if (!cell) continue;
          const chDimmed = chData.muted || anySolo && !chData.solo;
          const cellAlpha = ghostAlpha * (chDimmed ? MUTED_ALPHA : 1);
          const isCollapsed = chData.collapsed;
          const effectCols = chData.effectCols ?? 2;
          const gy = y + (rowH - atlas.glyphLogicalHeight) / 2;
          if (isCollapsed) {
            const x = colX + Math.floor((chW - noteWidth) / 2);
            const noteHas = (cell.note ?? 0) > 0;
            const nc = lerpWhiteRGBA(noteHas ? colors.textNote : colors.textMuted, noteHas ? glow : 0);
            this.setTmpColor(nc, cellAlpha);
            this.addGlyphString(noteTable[cell.note ?? 0] ?? "---", x, gy, atlas, this.tmpColor, noteHas && bold);
            continue;
          }
          if (ui.columns && cell.params) {
            const chColumns = chData.columnSpecs ?? ui.columns;
            const dataContentWidth = chColumns.reduce((s, c) => s + c.charWidth * CHAR_WIDTH + COL_GAP, 0) - COL_GAP;
            const x = colX + Math.floor((chW - dataContentWidth) / 2);
            let px = x;
            for (let ci = 0; ci < chColumns.length; ci++) {
              const col = chColumns[ci];
              const val = cell.params[ci] ?? col.emptyValue;
              const isEmpty = val === col.emptyValue;
              const baseColor = isEmpty ? col.emptyColor : col.color;
              this.setTmpColor(lerpWhiteRGBA(baseColor, isEmpty ? 0 : glow), cellAlpha);
              let str;
              if (col.type === "note") {
                str = isEmpty ? "---" : noteTable[val] ?? "---";
              } else if (isEmpty) {
                switch (col.hexDigits) {
                  case 1:
                    str = ".";
                    break;
                  case 2:
                    str = "..";
                    break;
                  case 3:
                    str = "...";
                    break;
                  default:
                    str = "....";
                    break;
                }
              } else {
                switch (col.hexDigits) {
                  case 1:
                    str = HEX1_TABLE[val & 15];
                    break;
                  case 2:
                    str = HEX_TABLE[val & 255];
                    break;
                  case 3:
                    str = (val & 4095).toString(16).toUpperCase().padStart(3, "0");
                    break;
                  default:
                    str = (val & 65535).toString(16).toUpperCase().padStart(4, "0");
                    break;
                }
              }
              if (!isEmpty || !ui.blankEmpty) {
                this.addGlyphString(str, px, gy, atlas, this.tmpColor, !isEmpty && bold);
              }
              px += col.charWidth * CHAR_WIDTH + COL_GAP;
            }
          } else {
            const totalNoteCols = chData.noteCols ?? 1;
            const NOTE_COL_GROUP_W = noteWidth + 4 + CHAR_WIDTH * 2 + 4 + CHAR_WIDTH * 2 + 4;
            const chContentWidth = NOTE_COL_GROUP_W * totalNoteCols + effectCols * (CHAR_WIDTH * 3 + 4) + (showAcid ? CHAR_WIDTH * 2 + 8 : 0) + (showProb ? CHAR_WIDTH * 2 + 4 : 0);
            const x = colX + Math.floor((chW - chContentWidth) / 2);
            for (let nc = 0; nc < totalNoteCols; nc++) {
              const ncX = x + nc * NOTE_COL_GROUP_W;
              const cellNote = nc === 0 ? cell.note ?? 0 : nc === 1 ? cell.note2 ?? 0 : nc === 2 ? cell.note3 ?? 0 : cell.note4 ?? 0;
              if (!ui.blankEmpty || cellNote !== 0) {
                const noteHas = cellNote > 0;
                const noteColor = lerpWhiteRGBA(
                  cellNote === 0 ? colors.textMuted : cellNote === 97 ? colors.textEffect : colors.textNote,
                  noteHas ? glow : 0
                );
                this.setTmpColor(noteColor, cellAlpha);
                this.addGlyphString(noteTable[cellNote] ?? "---", ncX, gy, atlas, this.tmpColor, noteHas && bold);
              }
              let px2 = ncX + noteWidth + 4;
              const inst = nc === 0 ? cell.instrument ?? 0 : nc === 1 ? cell.instrument2 ?? 0 : nc === 2 ? cell.instrument3 ?? 0 : cell.instrument4 ?? 0;
              if (inst !== 0) {
                this.setTmpColor(lerpWhiteRGBA(colors.textInstrument, glow), cellAlpha);
                this.addGlyphString(HEX_TABLE[inst & 255], px2, gy, atlas, this.tmpColor, bold);
              } else if (!ui.blankEmpty) {
                this.setTmpColor(lerpWhiteRGBA(colors.textMuted, 0), cellAlpha);
                this.addGlyphString("..", px2, gy, atlas, this.tmpColor, false);
              }
              px2 += CHAR_WIDTH * 2 + 4;
              const vol = nc === 0 ? cell.volume ?? 0 : nc === 1 ? cell.volume2 ?? 0 : nc === 2 ? cell.volume3 ?? 0 : cell.volume4 ?? 0;
              const hasVol = vol >= 16 && vol <= 80;
              if (hasVol) {
                this.setTmpColor(lerpWhiteRGBA(colors.textVolume, glow), cellAlpha);
                this.addGlyphString(HEX_TABLE[vol & 255], px2, gy, atlas, this.tmpColor, bold);
              } else if (!ui.blankEmpty) {
                this.setTmpColor(lerpWhiteRGBA(colors.textMuted, 0), cellAlpha);
                this.addGlyphString("..", px2, gy, atlas, this.tmpColor, false);
              }
            }
            let px = x + totalNoteCols * NOTE_COL_GROUP_W;
            for (let ecol = 0; ecol < effectCols; ecol++) {
              let colEffTyp = 0;
              let colEff = 0;
              if (ecol === 0) {
                colEffTyp = cell.effTyp ?? 0;
                colEff = cell.eff ?? 0;
              } else if (ecol === 1) {
                colEffTyp = cell.effTyp2 ?? 0;
                colEff = cell.eff2 ?? 0;
              } else if (ecol === 2) {
                colEffTyp = cell.effTyp3 ?? 0;
                colEff = cell.eff3 ?? 0;
              } else if (ecol === 3) {
                colEffTyp = cell.effTyp4 ?? 0;
                colEff = cell.eff4 ?? 0;
              } else if (ecol === 4) {
                colEffTyp = cell.effTyp5 ?? 0;
                colEff = cell.eff5 ?? 0;
              }
              const hasEff = colEffTyp !== 0 || colEff !== 0;
              if (hasEff) {
                this.setTmpColor(lerpWhiteRGBA(colors.textEffect, glow), cellAlpha);
                let effStr;
                if (colEffTyp >= 80 && colEffTyp <= 84) {
                  const DSP_CHARS = ["D", "E", "C", "L", "X"];
                  effStr = (DSP_CHARS[colEffTyp - 80] ?? "D") + HEX_TABLE[colEff & 255];
                } else if (colEffTyp >= 48 && colEffTyp <= 63) {
                  const OPL_CHARS = ["F", "C", "M", "V"];
                  effStr = "~" + (OPL_CHARS[colEffTyp - 48] ?? "?") + (colEff & 15).toString(16).toUpperCase();
                } else {
                  effStr = (EFFECT_CHARS[colEffTyp] ?? "?") + HEX_TABLE[colEff & 255];
                }
                this.addGlyphString(effStr, px, gy, atlas, this.tmpColor, bold);
              } else if (!ui.blankEmpty) {
                this.setTmpColor(lerpWhiteRGBA(colors.textMuted, 0), cellAlpha);
                this.addGlyphString("...", px, gy, atlas, this.tmpColor, false);
              }
              px += CHAR_WIDTH * 3 + 4;
            }
            const hasFlagCols = cell.flag1 !== void 0 || cell.flag2 !== void 0;
            if (hasFlagCols) {
              const drawFlag = (flagVal, fx) => {
                let flagStr = ".";
                let fc = colors.textMuted;
                if (flagVal === 1) {
                  flagStr = "A";
                  fc = colors.flagAccent;
                } else if (flagVal === 2) {
                  flagStr = "S";
                  fc = colors.flagSlide;
                } else if (flagVal === 3) {
                  flagStr = "M";
                  fc = colors.flagMute;
                } else if (flagVal === 4) {
                  flagStr = "H";
                  fc = colors.flagHammer;
                }
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
            if (cell.probability !== void 0 && cell.probability > 0) {
              const p = Math.min(99, Math.max(0, cell.probability));
              const pc = p >= 75 ? PROB_COLORS[3] : p >= 50 ? PROB_COLORS[2] : p >= 25 ? PROB_COLORS[1] : PROB_COLORS[0];
              const probStr = ui.useHex ? HEX_TABLE[p] : DEC_TABLE[p];
              this.setTmpColor(lerpWhiteRGBA(pc, glow), cellAlpha);
              this.addGlyphString(probStr, px, gy, atlas, this.tmpColor, bold);
            }
          }
          if (sel && !isGhostRow && ch >= minSelCh && ch <= maxSelCh && rowIndex >= minSelRow && rowIndex <= maxSelRow) {
            const [sr, sg, sb, sa] = colors.selection;
            this.addRect(colX, y, chW, rowH, [sr, sg, sb, sa]);
          }
          if (dragOver && !isGhostRow && ch === dragOver.channelIndex && rowIndex === dragOver.rowIndex) {
            const ac = colors.accent;
            this.addRect(colX, y, chW, rowH, [ac[0], ac[1], ac[2], 0.4]);
          }
        }
      }
      this.flushRects();
      this.flushGlyphs();
    }
    // ─── Instance data helpers ───────────────────────────────────────────────────
    ensureRectCapacity(needed) {
      if (this.rectCount + needed > this.rectData.length / RECT_FLOATS) {
        const newCap = Math.max(this.rectData.length / RECT_FLOATS * 2, this.rectCount + needed);
        const next = new Float32Array(newCap * RECT_FLOATS);
        next.set(this.rectData);
        this.rectData = next;
      }
    }
    addRect(x, y, w, h, color) {
      this.ensureRectCapacity(1);
      const off = this.rectCount * RECT_FLOATS;
      this.rectData[off + 0] = x;
      this.rectData[off + 1] = y;
      this.rectData[off + 2] = w;
      this.rectData[off + 3] = h;
      this.rectData[off + 4] = color[0];
      this.rectData[off + 5] = color[1];
      this.rectData[off + 6] = color[2];
      this.rectData[off + 7] = color[3];
      this.rectCount++;
    }
    ensureGlyphCapacity(needed) {
      if (this.glyphCount + needed > this.glyphData.length / GLYPH_FLOATS) {
        const newCap = Math.max(this.glyphData.length / GLYPH_FLOATS * 2, this.glyphCount + needed);
        const next = new Float32Array(newCap * GLYPH_FLOATS);
        next.set(this.glyphData);
        this.glyphData = next;
      }
    }
    addGlyph(x, y, info, color) {
      this.ensureGlyphCapacity(1);
      const off = this.glyphCount * GLYPH_FLOATS;
      this.glyphData[off + 0] = x;
      this.glyphData[off + 1] = y;
      this.glyphData[off + 2] = info.logicalWidth;
      this.glyphData[off + 3] = info.logicalHeight;
      this.glyphData[off + 4] = info.u0;
      this.glyphData[off + 5] = info.v0;
      this.glyphData[off + 6] = info.u1;
      this.glyphData[off + 7] = info.v1;
      this.glyphData[off + 8] = color[0];
      this.glyphData[off + 9] = color[1];
      this.glyphData[off + 10] = color[2];
      this.glyphData[off + 11] = color[3];
      this.glyphCount++;
    }
    /** Set tmpColor to base color × alpha multiplier (avoids allocating new arrays) */
    setTmpColor(base, alphaMul) {
      this.tmpColor[0] = base[0];
      this.tmpColor[1] = base[1];
      this.tmpColor[2] = base[2];
      this.tmpColor[3] = base[3] * alphaMul;
    }
    addGlyphString(str, x, y, atlas, color, bold = false) {
      let cx = x;
      for (let si = 0; si < str.length; si++) {
        const info = atlas.lookup.get(str[si]);
        if (info) {
          this.addGlyph(cx, y, info, color);
          if (bold) this.addGlyph(cx + 1, y, info, color);
          cx += info.logicalWidth;
        } else {
          cx += atlas.glyphLogicalWidth;
        }
      }
    }
    // ─── GPU flush ───────────────────────────────────────────────────────────────
    flushRects() {
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
    flushGlyphs() {
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
    dispose() {
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
  let renderer = null;
  let pattern = null;
  let currentRow = 0;
  let isPlaying = false;
  let layout = { offsets: [], widths: [], totalWidth: 0 };
  const DEFAULT_THEME = {
    accent: "#00e5ff",
    accentSecondary: "#7c3aed",
    accentGlow: "rgba(0,229,255,0.08)",
    rowCurrent: "#1a2a25",
    bg: "#0a0a0b",
    rowNormal: "#0d0d0e",
    rowHighlight: "#111113",
    rowSecondaryHighlight: "rgba(96,165,250,0.2)",
    border: "#252530",
    trackerBorder: "#252530",
    textNote: "#909090",
    textNoteActive: "#ffffff",
    textMuted: "#505050",
    textInstrument: "#4ade80",
    textVolume: "#60a5fa",
    textEffect: "#f97316",
    lineNumber: "#707070",
    lineNumberHighlight: "#f97316",
    selection: "rgba(59,130,246,0.3)",
    bookmark: "#f59e0b"
  };
  let theme = DEFAULT_THEME;
  let dirty = true;
  self.onmessage = (e) => {
    const msg = e.data;
    switch (msg.type) {
      case "init": {
        theme = msg.theme;
        pattern = msg.pattern;
        currentRow = msg.currentRow;
        isPlaying = msg.isPlaying;
        layout = msg.layout;
        try {
          renderer = new TrackerGLRenderer(msg.canvas);
          renderer.resize(msg.width, msg.height, msg.dpr);
        } catch (err) {
          console.error("[ReadOnlyPatternWorker] WebGL2 init failed:", err);
          return;
        }
        startRAF();
        self.postMessage({ type: "ready" });
        break;
      }
      case "pattern":
        pattern = msg.pattern;
        layout = msg.layout;
        dirty = true;
        break;
      case "playback":
        currentRow = msg.currentRow;
        isPlaying = msg.isPlaying;
        dirty = true;
        break;
      case "resize":
        renderer == null ? void 0 : renderer.resize(msg.w, msg.h, msg.dpr);
        dirty = true;
        break;
    }
  };
  function startRAF() {
    const tick = () => {
      renderFrame();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function renderFrame() {
    if (!renderer || !dirty) return;
    dirty = false;
    const patterns = pattern ? [pattern] : [];
    renderer.render({
      patterns,
      currentPatternIndex: 0,
      scrollX: 0,
      cursor: { rowIndex: currentRow, channelIndex: 0, columnType: "note", digitIndex: 0 },
      selection: null,
      playback: { row: currentRow, smoothOffset: 0, patternIndex: 0, isPlaying },
      theme,
      ui: {
        useHex: true,
        blankEmpty: false,
        showGhostPatterns: false,
        columnVisibility: { flag1: false, flag2: false, probability: false },
        trackerVisualBg: false,
        recordMode: false,
        rowHeight: 24,
        rowHighlightInterval: 4,
        rowSecondaryHighlightInterval: 16,
        showBeatLabels: false,
        noteDisplayOffset: 0,
        bookmarks: []
      },
      layout,
      dragOver: null
    });
  }
})();
