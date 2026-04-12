import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React } from "./vendor-ui-AJ7AT9BN.js";
import { ao as useGTUltraStore, du as GTToolbar } from "./main-BbV5VyEH.js";
import { e as encodeAD, a as encodeSR, b as attackLabel, d as decayLabel, s as sustainLabel, W as WAVEFORMS } from "./GTVisualMapping-BkrLaqE6.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { g as getPresetCategories, a as getPresetsByCategory } from "./gtultraPresets-B_La0BBT.js";
import { O as Oscilloscope } from "./Oscilloscope-CoW6EDI2.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const DAW_CSS = {
  bg: "var(--color-bg)",
  panelBg: "var(--color-bg-secondary)",
  panelBorder: "var(--color-border)",
  surface: "var(--color-bg-tertiary)",
  surfaceHover: "var(--color-bg-hover)",
  accent: "var(--color-accent)",
  accentWarm: "var(--color-warning)",
  success: "var(--color-success)",
  text: "var(--color-text)",
  textSec: "var(--color-text-secondary)",
  textMuted: "var(--color-text-muted)"
};
const DAW_CH_CSS = [
  "#6366f1",
  // CH1 indigo
  "#f59e0b",
  // CH2 amber
  "#10b981",
  // CH3 emerald
  "#ec4899",
  // CH4 pink
  "#06b6d4",
  // CH5 cyan
  "#a855f7"
  // CH6 purple
];
const TOOLBAR_H = 36;
const BOTTOM_H = 220;
const SIDEBAR_W = 480;
const ARRANGEMENT_H = 180;
const GTDAWView = () => {
  const engine = useGTUltraStore((s) => s.engine);
  const dawSidebarOpen = useGTUltraStore((s) => s.dawSidebarOpen);
  const ready = !!engine;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", background: DAW_CSS.bg, color: DAW_CSS.text, fontFamily: '"JetBrains Mono", monospace' }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: TOOLBAR_H, flexShrink: 0 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GTToolbar, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 47,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 46,
      columnNumber: 7
    }, void 0),
    !ready ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: DAW_CSS.textMuted }, children: "GoatTracker Ultra DAW — initializing..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 51,
      columnNumber: 9
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: ARRANGEMENT_H, flexShrink: 0, borderBottom: `1px solid ${DAW_CSS.panelBorder}` }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DAWArrangement, {}, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
            lineNumber: 61,
            columnNumber: 17
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
            lineNumber: 60,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 0 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DAWPianoRoll, {}, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
            lineNumber: 64,
            columnNumber: 17
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
            lineNumber: 63,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 59,
          columnNumber: 13
        }, void 0),
        dawSidebarOpen && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: SIDEBAR_W, flexShrink: 0, borderLeft: `1px solid ${DAW_CSS.panelBorder}`, overflowY: "auto" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DAWInstrumentDesigner, {}, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 71,
          columnNumber: 17
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 70,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 57,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: BOTTOM_H, flexShrink: 0, borderTop: `1px solid ${DAW_CSS.panelBorder}` }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DAWBottomPanel, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 78,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 77,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 55,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
    lineNumber: 44,
    columnNumber: 5
  }, void 0);
};
const DAWArrangement = () => {
  const canvasRef = reactExports.useRef(null);
  const orderData = useGTUltraStore((s) => s.orderData);
  const patternData = useGTUltraStore((s) => s.patternData);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const playing = useGTUltraStore((s) => s.playing);
  const dawSelectedChannel = useGTUltraStore((s) => s.dawSelectedChannel);
  const dawSelectedPattern = useGTUltraStore((s) => s.dawSelectedPattern);
  const engine = useGTUltraStore((s) => s.engine);
  const channelCount = sidCount * 3;
  const arrangeLPRef = reactExports.useRef(null);
  const [arrangeMenu, setArrangeMenu] = reactExports.useState(null);
  reactExports.useEffect(() => {
    var _a;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = (_a = canvas.parentElement) == null ? void 0 : _a.getBoundingClientRect();
    const w = (rect == null ? void 0 : rect.width) || 800;
    const h = (rect == null ? void 0 : rect.height) || ARRANGEMENT_H;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = DAW_CSS.bg;
    ctx.fillRect(0, 0, w, h);
    const headerW = 50;
    const trackH = Math.max(20, Math.floor(h / channelCount));
    for (let ch = 0; ch < channelCount; ch++) {
      const y = ch * trackH;
      const color = DAW_CH_CSS[ch % DAW_CH_CSS.length];
      ctx.fillStyle = DAW_CSS.panelBg;
      ctx.fillRect(0, y, headerW, trackH);
      ctx.fillStyle = color;
      ctx.fillRect(0, y, 3, trackH);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = DAW_CSS.textSec;
      ctx.fillText(`CH${ch + 1}`, 8, y + trackH / 2 + 3);
      ctx.fillStyle = DAW_CSS.panelBorder;
      ctx.fillRect(headerW, y + trackH - 1, w - headerW, 1);
      const od = orderData[ch];
      if (!od) continue;
      let blockX = headerW;
      for (let oi = 0; oi < od.length; oi++) {
        const patNum = od[oi];
        if (patNum === 255) break;
        if (patNum >= 208) continue;
        const pd = patternData.get(patNum);
        const blockW = Math.max(8, (pd ? pd.length : 32) * 2);
        const isSelected = ch === dawSelectedChannel && patNum === dawSelectedPattern;
        if (blockX + blockW > headerW && blockX < w) {
          ctx.fillStyle = color;
          ctx.globalAlpha = isSelected ? 0.5 : 0.2;
          ctx.beginPath();
          ctx.roundRect(blockX + 1, y + 2, blockW - 2, trackH - 4, 4);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = color;
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.globalAlpha = isSelected ? 1 : 0.6;
          ctx.beginPath();
          ctx.roundRect(blockX + 1, y + 2, blockW - 2, trackH - 4, 4);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = isSelected ? DAW_CSS.text : color;
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.fillText(patNum.toString(16).toUpperCase().padStart(2, "0"), blockX + 4, y + trackH / 2 + 3);
        }
        blockX += blockW;
      }
    }
    if (playing) {
      const od0 = orderData[0];
      if (od0) {
        let phX = headerW;
        for (let oi = 0; oi < playbackPos.songPos && oi < od0.length; oi++) {
          const pn = od0[oi];
          if (pn === 255) break;
          if (pn >= 208) continue;
          const pd = patternData.get(pn);
          phX += Math.max(8, (pd ? pd.length : 32) * 2);
        }
        phX += playbackPos.row * 2;
        ctx.fillStyle = DAW_CSS.accentWarm;
        ctx.fillRect(phX, 0, 2, h);
      }
    }
  }, [orderData, patternData, channelCount, playing, playbackPos, dawSelectedChannel, dawSelectedPattern]);
  const handleClick = reactExports.useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const headerW = 50;
    if (x < headerW) return;
    const trackH = Math.max(20, Math.floor(rect.height / (sidCount * 3)));
    const ch = Math.min(sidCount * 3 - 1, Math.floor(y / trackH));
    const od = orderData[ch];
    if (!od) return;
    let blockX = headerW;
    for (let oi = 0; oi < od.length; oi++) {
      const patNum = od[oi];
      if (patNum === 255) break;
      if (patNum >= 208) continue;
      const pd = patternData.get(patNum);
      const blockW = Math.max(8, (pd ? pd.length : 32) * 2);
      if (x >= blockX && x < blockX + blockW) {
        useGTUltraStore.getState().setDawSelectedChannel(ch);
        useGTUltraStore.getState().setDawSelectedPattern(patNum);
        return;
      }
      blockX += blockW;
    }
  }, [orderData, patternData, sidCount]);
  const hitTestBlock = reactExports.useCallback((x, y) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const headerW = 50;
    if (x < headerW) return null;
    const trackH = Math.max(20, Math.floor(rect.height / channelCount));
    const ch = Math.min(channelCount - 1, Math.max(0, Math.floor(y / trackH)));
    const od = orderData[ch];
    if (!od) return null;
    let blockX = headerW;
    for (let oi = 0; oi < od.length; oi++) {
      const patNum = od[oi];
      if (patNum === 255) break;
      if (patNum >= 208) continue;
      const pd = patternData.get(patNum);
      const blockW = Math.max(8, (pd ? pd.length : 32) * 2);
      if (x >= blockX && x < blockX + blockW) {
        return { ch, orderIdx: oi, patNum };
      }
      blockX += blockW;
    }
    return null;
  }, [channelCount, orderData, patternData]);
  const handleArrangeTouchStart = reactExports.useCallback((e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const lx = touch.clientX - rect.left;
      const ly = touch.clientY - rect.top;
      arrangeLPRef.current = setTimeout(() => {
        const hit = hitTestBlock(lx, ly);
        if (hit) {
          setArrangeMenu({ x: lx, y: ly, ...hit });
        }
        arrangeLPRef.current = null;
      }, 500);
    }
  }, [hitTestBlock]);
  const handleArrangeTouchMove = reactExports.useCallback(() => {
    if (arrangeLPRef.current) {
      clearTimeout(arrangeLPRef.current);
      arrangeLPRef.current = null;
    }
  }, []);
  const handleArrangeTouchEnd = reactExports.useCallback(() => {
    if (arrangeLPRef.current) {
      clearTimeout(arrangeLPRef.current);
      arrangeLPRef.current = null;
    }
  }, []);
  const handleArrangeDuplicate = reactExports.useCallback(() => {
    if (!arrangeMenu || !engine) {
      setArrangeMenu(null);
      return;
    }
    const od = orderData[arrangeMenu.ch];
    if (!od) {
      setArrangeMenu(null);
      return;
    }
    let endIdx = 0;
    for (let i = 0; i < od.length; i++) {
      if (od[i] === 255) {
        endIdx = i;
        break;
      }
    }
    if (endIdx >= 254) {
      setArrangeMenu(null);
      return;
    }
    for (let i = endIdx; i > arrangeMenu.orderIdx + 1; i--) {
      engine.setOrderEntry(arrangeMenu.ch, i, od[i - 1]);
    }
    engine.setOrderEntry(arrangeMenu.ch, arrangeMenu.orderIdx + 1, arrangeMenu.patNum);
    engine.setOrderEntry(arrangeMenu.ch, endIdx + 1, 255);
    useGTUltraStore.getState().refreshAllOrders();
    setArrangeMenu(null);
  }, [arrangeMenu, engine, orderData]);
  const handleArrangeClear = reactExports.useCallback(() => {
    if (!arrangeMenu || !engine) {
      setArrangeMenu(null);
      return;
    }
    engine.setOrderEntry(arrangeMenu.ch, arrangeMenu.orderIdx, 0);
    useGTUltraStore.getState().refreshAllOrders();
    setArrangeMenu(null);
  }, [arrangeMenu, engine]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: "100%", height: "100%", position: "relative" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "canvas",
      {
        ref: canvasRef,
        onClick: handleClick,
        onTouchStart: handleArrangeTouchStart,
        onTouchMove: handleArrangeTouchMove,
        onTouchEnd: handleArrangeTouchEnd,
        style: { width: "100%", height: "100%", cursor: "pointer", touchAction: "pan-x" }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 313,
        columnNumber: 7
      },
      void 0
    ),
    arrangeMenu && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        style: {
          position: "absolute",
          left: arrangeMenu.x,
          top: arrangeMenu.y,
          background: DAW_CSS.panelBg,
          border: `1px solid ${DAW_CSS.panelBorder}`,
          borderRadius: 4,
          padding: 2,
          zIndex: 100,
          minWidth: 100,
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
        },
        children: [
          [
            { label: "Duplicate", action: handleArrangeDuplicate },
            { label: "Clear", action: handleArrangeClear }
          ].map(({ label, action }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: action,
              style: {
                display: "block",
                width: "100%",
                padding: "6px 12px",
                fontSize: 10,
                fontFamily: "inherit",
                background: "none",
                border: "none",
                color: DAW_CSS.text,
                cursor: "pointer",
                textAlign: "left",
                borderRadius: 2
              },
              onMouseEnter: (e) => {
                e.currentTarget.style.background = DAW_CSS.surfaceHover;
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.background = "none";
              },
              children: label
            },
            label,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
              lineNumber: 335,
              columnNumber: 13
            },
            void 0
          )),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setArrangeMenu(null),
              style: {
                display: "block",
                width: "100%",
                padding: "4px 12px",
                fontSize: 10,
                fontFamily: "inherit",
                background: "none",
                border: "none",
                color: DAW_CSS.textMuted,
                cursor: "pointer",
                textAlign: "left",
                borderRadius: 2,
                borderTop: `1px solid ${DAW_CSS.panelBorder}`
              },
              children: "Cancel"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
              lineNumber: 349,
              columnNumber: 11
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 323,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
    lineNumber: 312,
    columnNumber: 5
  }, void 0);
};
const BLACK_KEYS = [1, 3, 6, 8, 10];
const MIN_NOTE = 24;
const MAX_NOTE = 84;
const VISIBLE_NOTES = MAX_NOTE - MIN_NOTE;
const PIANO_W = 40;
const DAWPianoRoll = () => {
  const canvasRef = reactExports.useRef(null);
  const patternData = useGTUltraStore((s) => s.patternData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const playing = useGTUltraStore((s) => s.playing);
  const dawSelectedChannel = useGTUltraStore((s) => s.dawSelectedChannel);
  const dawSelectedPattern = useGTUltraStore((s) => s.dawSelectedPattern);
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const dawZoomX = useGTUltraStore((s) => s.dawZoomX);
  const engine = useGTUltraStore((s) => s.engine);
  const pd = patternData.get(dawSelectedPattern);
  const maxRows = pd ? pd.length : 32;
  const chColor = DAW_CH_CSS[dawSelectedChannel % DAW_CH_CSS.length];
  const touchStartDistRef = reactExports.useRef(0);
  const touchStartZoomRef = reactExports.useRef(dawZoomX);
  const longPressTimerRef = reactExports.useRef(null);
  const [longPressMenu, setLongPressMenu] = reactExports.useState(null);
  reactExports.useEffect(() => {
    var _a;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = (_a = canvas.parentElement) == null ? void 0 : _a.getBoundingClientRect();
    const w = (rect == null ? void 0 : rect.width) || 800;
    const h = (rect == null ? void 0 : rect.height) || 400;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    const gridW = w - PIANO_W;
    const velH = 40;
    const gridH = h - velH;
    const noteH = Math.max(2, gridH / VISIBLE_NOTES);
    const cellW = dawZoomX;
    ctx.fillStyle = DAW_CSS.bg;
    ctx.fillRect(0, 0, w, h);
    for (let n = MIN_NOTE; n < MAX_NOTE; n++) {
      const y = (MAX_NOTE - 1 - n) * noteH;
      const semitone = n % 12;
      const isBlack = BLACK_KEYS.includes(semitone);
      ctx.fillStyle = isBlack ? "#0a0a0a" : "#141414";
      ctx.fillRect(0, y, PIANO_W, noteH);
      ctx.fillStyle = isBlack ? "#161620" : "#1a1a24";
      ctx.fillRect(PIANO_W, y, gridW, noteH);
      if (semitone === 0) {
        ctx.fillStyle = DAW_CSS.textMuted;
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.fillText(`C${Math.floor(n / 12)}`, 2, y + noteH - 1);
        ctx.fillStyle = "#2a2a3a";
        ctx.fillRect(PIANO_W, y, gridW, 1);
      }
    }
    for (let row = 0; row < maxRows; row++) {
      const x = PIANO_W + row * cellW;
      const isBeat = row % 4 === 0;
      ctx.fillStyle = isBeat ? "#2a2a3a" : "#1e1e28";
      ctx.globalAlpha = isBeat ? 0.6 : 0.3;
      ctx.fillRect(x, 0, 1, gridH);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = DAW_CSS.panelBorder;
    ctx.fillRect(PIANO_W, gridH, gridW, 1);
    if (pd) {
      const bpc = 4;
      for (let row = 0; row < maxRows; row++) {
        const off = row * bpc;
        if (off >= pd.data.length) break;
        const noteVal = pd.data[off];
        if (noteVal === 0 || noteVal >= 189) continue;
        if (noteVal < 1 || noteVal > 96) continue;
        const midiNote = noteVal - 1 + 24;
        if (midiNote < MIN_NOTE || midiNote >= MAX_NOTE) continue;
        let noteLen = 1;
        for (let r2 = row + 1; r2 < maxRows; r2++) {
          if (r2 * bpc >= pd.data.length) break;
          if (pd.data[r2 * bpc] !== 0) break;
          noteLen++;
        }
        const x = PIANO_W + row * cellW;
        const nw = noteLen * cellW - 1;
        const y = (MAX_NOTE - 1 - midiNote) * noteH;
        ctx.fillStyle = chColor;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.roundRect(x, y + 1, Math.max(4, nw), noteH - 2, 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = chColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y + 1, Math.max(4, nw), noteH - 2, 2);
        ctx.stroke();
        const vel = pd.data[off + 1];
        const barH = vel > 0 ? vel / 63 * (velH - 4) : velH * 0.5;
        ctx.fillStyle = chColor;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(x, gridH + velH - barH - 2, Math.max(2, cellW - 2), barH);
        ctx.globalAlpha = 1;
      }
    }
    if (playing) {
      ctx.fillStyle = DAW_CSS.accentWarm;
      ctx.fillRect(PIANO_W + playbackPos.row * cellW, 0, 2, h);
    }
  }, [pd, maxRows, dawSelectedChannel, playing, playbackPos, dawZoomX, chColor]);
  const handleClick = reactExports.useCallback((e) => {
    if (!engine || !pd) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < PIANO_W) return;
    const gridH = rect.height - 40;
    if (y > gridH) return;
    const noteH = Math.max(2, gridH / VISIBLE_NOTES);
    const row = Math.max(0, Math.min(maxRows - 1, Math.floor((x - PIANO_W) / dawZoomX)));
    const note = Math.max(MIN_NOTE, Math.min(MAX_NOTE - 1, MAX_NOTE - 1 - Math.floor(y / noteH)));
    const gtNote = note - 24 + 1;
    const bpc = 4;
    const existingNote = row * bpc < pd.data.length ? pd.data[row * bpc] : 0;
    if (e.button === 2 || existingNote > 0 && existingNote < 189) {
      engine.setPatternCell(dawSelectedPattern, row, 0, 0);
      engine.setPatternCell(dawSelectedPattern, row, 1, 0);
    } else if (existingNote === 0 || existingNote >= 189) {
      if (gtNote >= 1 && gtNote <= 95) {
        engine.setPatternCell(dawSelectedPattern, row, 0, gtNote);
        engine.setPatternCell(dawSelectedPattern, row, 1, currentInstrument);
        engine.jamNoteOn(dawSelectedChannel, gtNote, currentInstrument);
        setTimeout(() => engine.jamNoteOff(dawSelectedChannel), 200);
      }
    }
    useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
  }, [engine, pd, maxRows, dawZoomX, dawSelectedPattern, dawSelectedChannel, currentInstrument]);
  const getTouchDistance = (touches) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const handleTouchStart = reactExports.useCallback((e) => {
    if (e.touches.length === 2) {
      touchStartDistRef.current = getTouchDistance(e.touches);
      touchStartZoomRef.current = useGTUltraStore.getState().dawZoomX;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const tx = touch.clientX - rect.left;
      const ty = touch.clientY - rect.top;
      longPressTimerRef.current = setTimeout(() => {
        const gridH = rect.height - 40;
        if (tx < PIANO_W || ty > gridH) return;
        const noteH = Math.max(2, gridH / VISIBLE_NOTES);
        const row = Math.max(0, Math.min(maxRows - 1, Math.floor((tx - PIANO_W) / dawZoomX)));
        const midiNote = Math.max(MIN_NOTE, Math.min(MAX_NOTE - 1, MAX_NOTE - 1 - Math.floor(ty / noteH)));
        if (pd) {
          const bpc = 4;
          const off = row * bpc;
          if (off < pd.data.length && pd.data[off] > 0 && pd.data[off] < 189) {
            setLongPressMenu({ x: touch.clientX, y: touch.clientY, row, note: midiNote });
          }
        }
        longPressTimerRef.current = null;
      }, 500);
    }
  }, [maxRows, dawZoomX, pd]);
  const handleTouchMove = reactExports.useCallback((e) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (e.touches.length === 2) {
      const dist = getTouchDistance(e.touches);
      if (touchStartDistRef.current > 0) {
        const scale = dist / touchStartDistRef.current;
        const newZoom = Math.max(4, Math.min(64, Math.round(touchStartZoomRef.current * scale)));
        useGTUltraStore.getState().setDawZoom(newZoom, useGTUltraStore.getState().dawZoomY);
      }
    }
  }, []);
  const handleTouchEnd = reactExports.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartDistRef.current = 0;
  }, []);
  const handleLongPressDelete = reactExports.useCallback(() => {
    if (!longPressMenu || !engine) return;
    engine.setPatternCell(dawSelectedPattern, longPressMenu.row, 0, 0);
    engine.setPatternCell(dawSelectedPattern, longPressMenu.row, 1, 0);
    useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
    setLongPressMenu(null);
  }, [longPressMenu, engine, dawSelectedPattern]);
  const handleLongPressDuplicate = reactExports.useCallback(() => {
    if (!longPressMenu || !engine || !pd) return;
    const bpc = 4;
    const off = longPressMenu.row * bpc;
    if (off >= pd.data.length) {
      setLongPressMenu(null);
      return;
    }
    const noteVal = pd.data[off];
    const instVal = pd.data[off + 1];
    for (let r = longPressMenu.row + 1; r < maxRows; r++) {
      if (r * bpc >= pd.data.length) break;
      if (pd.data[r * bpc] === 0) {
        engine.setPatternCell(dawSelectedPattern, r, 0, noteVal);
        engine.setPatternCell(dawSelectedPattern, r, 1, instVal);
        break;
      }
    }
    useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
    setLongPressMenu(null);
  }, [longPressMenu, engine, pd, maxRows, dawSelectedPattern]);
  const handleLongPressChangeInst = reactExports.useCallback(() => {
    if (!longPressMenu || !engine) return;
    engine.setPatternCell(dawSelectedPattern, longPressMenu.row, 1, currentInstrument);
    useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
    setLongPressMenu(null);
  }, [longPressMenu, engine, dawSelectedPattern, currentInstrument]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: "100%", height: "100%", position: "relative" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "canvas",
      {
        ref: canvasRef,
        onClick: handleClick,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onContextMenu: (e) => {
          e.preventDefault();
          handleClick(e);
        },
        style: { width: "100%", height: "100%", cursor: "crosshair", touchAction: "none" }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 638,
        columnNumber: 7
      },
      void 0
    ),
    longPressMenu && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        style: {
          position: "fixed",
          left: longPressMenu.x,
          top: longPressMenu.y,
          background: DAW_CSS.panelBg,
          border: `1px solid ${DAW_CSS.panelBorder}`,
          borderRadius: 4,
          padding: 2,
          zIndex: 200,
          minWidth: 120,
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
        },
        onPointerDown: (e) => e.stopPropagation(),
        children: [
          [
            { label: "Delete Note", action: handleLongPressDelete },
            { label: "Duplicate", action: handleLongPressDuplicate },
            { label: `Set Inst #${currentInstrument.toString(16).toUpperCase().padStart(2, "0")}`, action: handleLongPressChangeInst }
          ].map(({ label, action }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: action,
              style: {
                display: "block",
                width: "100%",
                padding: "6px 12px",
                fontSize: 11,
                fontFamily: "inherit",
                background: "none",
                border: "none",
                color: DAW_CSS.text,
                cursor: "pointer",
                textAlign: "left",
                borderRadius: 2
              },
              onMouseEnter: (e) => {
                e.currentTarget.style.background = DAW_CSS.surfaceHover;
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.background = "none";
              },
              children: label
            },
            label,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
              lineNumber: 663,
              columnNumber: 13
            },
            void 0
          )),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setLongPressMenu(null),
              style: {
                display: "block",
                width: "100%",
                padding: "4px 12px",
                fontSize: 10,
                fontFamily: "inherit",
                background: "none",
                border: "none",
                color: DAW_CSS.textMuted,
                cursor: "pointer",
                textAlign: "left",
                borderRadius: 2,
                borderTop: `1px solid ${DAW_CSS.panelBorder}`
              },
              children: "Cancel"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
              lineNumber: 677,
              columnNumber: 11
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 649,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
    lineNumber: 637,
    columnNumber: 5
  }, void 0);
};
function getPulseWidthFrac(pulsePtr, tableData) {
  const pt = tableData["pulse"];
  if (!pt || pulsePtr === 0 || pulsePtr > pt.left.length) return 0.5;
  const hi = pt.left[pulsePtr] || 0;
  const lo = pt.right[pulsePtr] || 0;
  const pw = (hi & 15) << 8 | lo;
  return Math.max(0.05, Math.min(0.95, pw / 4095));
}
const WaveformMiniCanvas = ({ bit, isOn, pulseWidthFrac }) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const color = isOn ? DAW_CSS.success : DAW_CSS.textMuted;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = isOn ? 1 : 0.4;
    ctx.beginPath();
    const mid = h / 2;
    if (bit === 16) {
      ctx.moveTo(0, mid);
      ctx.lineTo(w * 0.25, 2);
      ctx.lineTo(w * 0.75, h - 2);
      ctx.lineTo(w, mid);
    } else if (bit === 32) {
      ctx.moveTo(0, mid);
      ctx.lineTo(w * 0.9, 2);
      ctx.lineTo(w * 0.9, h - 2);
      ctx.lineTo(w, mid);
    } else if (bit === 64) {
      const transX = w * pulseWidthFrac;
      ctx.moveTo(0, h - 2);
      ctx.lineTo(0, 2);
      ctx.lineTo(transX, 2);
      ctx.lineTo(transX, h - 2);
      ctx.lineTo(w, h - 2);
    } else if (bit === 128) {
      ctx.moveTo(0, mid);
      for (let i = 1; i <= 10; i++) {
        const nx = i / 10 * w;
        const ny = 2 + (Math.sin(i * 7.3) * 0.5 + 0.5) * (h - 4);
        ctx.lineTo(nx, ny);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [bit, isOn, pulseWidthFrac]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, width: 36, height: 20, style: { width: 36, height: 20, flexShrink: 0 } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
    lineNumber: 757,
    columnNumber: 10
  }, void 0);
};
const DAWInstrumentDesigner = () => {
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const engine = useGTUltraStore((s) => s.engine);
  const dawSelectedChannel = useGTUltraStore((s) => s.dawSelectedChannel);
  const tableData = useGTUltraStore((s) => s.tableData);
  const inst = instrumentData[currentInstrument] || instrumentData[0];
  const chColor = DAW_CH_CSS[dawSelectedChannel % DAW_CH_CSS.length];
  const attack = inst.ad >> 4 & 15;
  const decay = inst.ad & 15;
  const sustain = inst.sr >> 4 & 15;
  const release = inst.sr & 15;
  const waveform = inst.firstwave & 254;
  const setADSR = reactExports.useCallback((a, d, s, r) => {
    if (!engine) return;
    engine.setInstrumentAD(currentInstrument, encodeAD(a, d));
    engine.setInstrumentSR(currentInstrument, encodeSR(s, r));
    const data = [...useGTUltraStore.getState().instrumentData];
    data[currentInstrument] = { ...inst, ad: encodeAD(a, d), sr: encodeSR(s, r) };
    useGTUltraStore.setState({ instrumentData: data });
  }, [engine, currentInstrument, inst]);
  const toggleWave = reactExports.useCallback((bit) => {
    if (!engine) return;
    const newWave = waveform ^ bit | inst.firstwave & 1;
    engine.setInstrumentFirstwave(currentInstrument, newWave);
    const data = [...useGTUltraStore.getState().instrumentData];
    data[currentInstrument] = { ...inst, firstwave: newWave };
    useGTUltraStore.setState({ instrumentData: data });
  }, [engine, currentInstrument, inst, waveform]);
  const prevInst = () => useGTUltraStore.getState().setCurrentInstrument(currentInstrument - 1);
  const nextInst = () => useGTUltraStore.getState().setCurrentInstrument(currentInstrument + 1);
  const instHex = currentInstrument.toString(16).toUpperCase().padStart(2, "0");
  const sliderStyle = { width: "100%", accentColor: chColor, cursor: "pointer" };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 8, background: DAW_CSS.panelBg, height: "100%", fontSize: 10, lineHeight: "16px" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: prevInst, style: { color: DAW_CSS.textSec, cursor: "pointer", background: "none", border: "none", fontSize: 14 }, children: "<" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 806,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: chColor, fontWeight: "bold" }, children: [
        "#",
        instHex
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 807,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: DAW_CSS.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: inst.name || "Untitled" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 808,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: nextInst, style: { color: DAW_CSS.textSec, cursor: "pointer", background: "none", border: "none", fontSize: 14 }, children: ">" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 809,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 805,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: DAW_CSS.textMuted, marginBottom: 4 }, children: "ENVELOPE" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 813,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      EnvelopeVisualization,
      {
        mode: "sid",
        attack,
        decay,
        sustain,
        release,
        width: "auto",
        height: 60,
        color: chColor,
        backgroundColor: DAW_CSS.bg,
        border: `1px solid ${DAW_CSS.panelBorder}`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 814,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px", marginTop: 4 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { style: { color: DAW_CSS.textSec }, children: [
        "A:",
        attack,
        " ",
        attackLabel(attack),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("input", { type: "range", min: 0, max: 15, value: attack, onChange: (e) => setADSR(+e.target.value, decay, sustain, release), style: sliderStyle }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 828,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 827,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { style: { color: DAW_CSS.textSec }, children: [
        "D:",
        decay,
        " ",
        decayLabel(decay),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("input", { type: "range", min: 0, max: 15, value: decay, onChange: (e) => setADSR(attack, +e.target.value, sustain, release), style: sliderStyle }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 831,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 830,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { style: { color: DAW_CSS.textSec }, children: [
        "S:",
        sustain,
        " ",
        sustainLabel(sustain),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("input", { type: "range", min: 0, max: 15, value: sustain, onChange: (e) => setADSR(attack, decay, +e.target.value, release), style: sliderStyle }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 834,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 833,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { style: { color: DAW_CSS.textSec }, children: [
        "R:",
        release,
        " ",
        decayLabel(release),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("input", { type: "range", min: 0, max: 15, value: release, onChange: (e) => setADSR(attack, decay, sustain, +e.target.value), style: sliderStyle }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 837,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 836,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 826,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: DAW_CSS.textMuted, marginTop: 10, marginBottom: 4 }, children: "WAVEFORM" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 842,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }, children: WAVEFORMS.map((wf) => {
      const isOn = (waveform & wf.bit) !== 0;
      const pulseWidthFrac = wf.bit === 64 ? getPulseWidthFrac(inst.pulsePtr, tableData) : 0.5;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => toggleWave(wf.bit),
          style: {
            padding: "6px 8px",
            borderRadius: 4,
            border: `1px solid ${isOn ? DAW_CSS.success : DAW_CSS.panelBorder}`,
            background: isOn ? `${DAW_CSS.success}20` : DAW_CSS.surface,
            color: isOn ? DAW_CSS.success : DAW_CSS.textMuted,
            cursor: "pointer",
            fontSize: 10,
            fontFamily: "inherit",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 6
          },
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WaveformMiniCanvas, { bit: wf.bit, isOn, pulseWidthFrac }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
              lineNumber: 866,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: wf.shortName }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
              lineNumber: 867,
              columnNumber: 15
            }, void 0)
          ]
        },
        wf.bit,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 848,
          columnNumber: 13
        },
        void 0
      );
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 843,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 12, marginTop: 6, color: DAW_CSS.textSec }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "Ring: ",
        waveform & 4 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: DAW_CSS.success }, children: "ON" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 875,
          columnNumber: 42
        }, void 0) : "off"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 875,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "Sync: ",
        waveform & 2 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: DAW_CSS.success }, children: "ON" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 876,
          columnNumber: 42
        }, void 0) : "off"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 876,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 874,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: DAW_CSS.textMuted, marginTop: 10, marginBottom: 4 }, children: "TABLES & SETTINGS" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 880,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "2px 8px", color: DAW_CSS.textSec }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "Wave: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: inst.wavePtr ? "#60e060" : DAW_CSS.textMuted }, children: inst.wavePtr.toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 882,
          columnNumber: 21
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 882,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "Pulse: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: inst.pulsePtr ? "#ff8866" : DAW_CSS.textMuted }, children: inst.pulsePtr.toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 883,
          columnNumber: 22
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 883,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "Gate: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: inst.gatetimer ? "#60e060" : DAW_CSS.textMuted }, children: inst.gatetimer.toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 884,
          columnNumber: 21
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 884,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "Vib: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: inst.vibdelay ? "#60e060" : DAW_CSS.textMuted }, children: inst.vibdelay.toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 885,
          columnNumber: 20
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 885,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "Filter: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: inst.filterPtr ? "#ffcc00" : DAW_CSS.textMuted }, children: inst.filterPtr.toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 886,
          columnNumber: 23
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 886,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "Speed: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: inst.speedPtr ? "#6699ff" : DAW_CSS.textMuted }, children: inst.speedPtr.toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 887,
          columnNumber: 22
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 887,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "1stWv: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#60e060" }, children: inst.firstwave.toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 888,
          columnNumber: 22
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 888,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 881,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
    lineNumber: 803,
    columnNumber: 5
  }, void 0);
};
const BOTTOM_TABS = [
  { id: "mixer", label: "Mixer" },
  { id: "steps", label: "Steps" },
  { id: "presets", label: "Presets" },
  { id: "tables", label: "Tables" },
  { id: "monitor", label: "Monitor" },
  { id: "clips", label: "Clips" },
  { id: "scope", label: "Scope" }
];
const DAWBottomPanel = () => {
  const dawBottomPanel = useGTUltraStore((s) => s.dawBottomPanel);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: DAW_CSS.panelBg }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 2, padding: "4px 8px", borderBottom: `1px solid ${DAW_CSS.panelBorder}` }, children: BOTTOM_TABS.map(({ id, label }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => useGTUltraStore.getState().setDawBottomPanel(id),
        style: {
          padding: "3px 10px",
          fontSize: 10,
          fontFamily: "inherit",
          borderRadius: 3,
          border: "none",
          cursor: "pointer",
          background: dawBottomPanel === id ? `${DAW_CSS.accent}30` : "transparent",
          color: dawBottomPanel === id ? DAW_CSS.accent : DAW_CSS.textMuted,
          fontWeight: dawBottomPanel === id ? "bold" : "normal"
        },
        children: label
      },
      id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 915,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 913,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 0, overflow: "auto" }, children: [
      dawBottomPanel === "mixer" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DAWMixer, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 937,
        columnNumber: 40
      }, void 0),
      dawBottomPanel === "steps" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DAWStepSequencer, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 938,
        columnNumber: 40
      }, void 0),
      dawBottomPanel === "presets" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DAWPresetBrowser, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 939,
        columnNumber: 42
      }, void 0),
      dawBottomPanel === "tables" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: DAW_CSS.textMuted }, children: "Table editor -- coming soon" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 940,
        columnNumber: 41
      }, void 0),
      dawBottomPanel === "monitor" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: DAW_CSS.textMuted }, children: "SID Monitor -- coming soon" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 941,
        columnNumber: 42
      }, void 0),
      dawBottomPanel === "clips" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: DAW_CSS.textMuted }, children: "Clip Grid -- coming soon" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 942,
        columnNumber: 40
      }, void 0),
      dawBottomPanel === "scope" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Oscilloscope, { width: "auto", height: 180 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 943,
        columnNumber: 40
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 936,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
    lineNumber: 911,
    columnNumber: 5
  }, void 0);
};
const DAWMixer = () => {
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const channelCount = sidCount * 3;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 4, padding: 8, height: "100%" }, children: Array.from({ length: channelCount }, (_, ch) => {
    const color = DAW_CH_CSS[ch % DAW_CH_CSS.length];
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 4px", background: DAW_CSS.surface, borderRadius: 4, border: `1px solid ${DAW_CSS.panelBorder}` }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: "80%", height: 3, borderRadius: 2, background: color } }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 961,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 10, color: DAW_CSS.text }, children: [
        "CH ",
        ch + 1
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 962,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, width: 10, background: DAW_CSS.bg, borderRadius: 2, position: "relative" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "absolute", bottom: 0, width: "100%", height: "40%", background: color, borderRadius: 2, opacity: 0.6 } }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 964,
        columnNumber: 15
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 963,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 9, color: DAW_CSS.textMuted }, children: "M S" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 966,
        columnNumber: 13
      }, void 0)
    ] }, ch, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 960,
      columnNumber: 11
    }, void 0);
  }) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
    lineNumber: 956,
    columnNumber: 5
  }, void 0);
};
const DAWPresetBrowser = () => {
  const [selectedCat, setSelectedCat] = reactExports.useState(0);
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const engine = useGTUltraStore((s) => s.engine);
  const categories = getPresetCategories();
  const presets = categories[selectedCat] ? getPresetsByCategory(categories[selectedCat]) : [];
  const applyPreset = reactExports.useCallback((preset) => {
    if (!engine) return;
    engine.setInstrumentAD(currentInstrument, preset.ad);
    engine.setInstrumentSR(currentInstrument, preset.sr);
    engine.setInstrumentFirstwave(currentInstrument, preset.waveform);
    const data = [...useGTUltraStore.getState().instrumentData];
    data[currentInstrument] = { ...data[currentInstrument], ad: preset.ad, sr: preset.sr, firstwave: preset.waveform, name: preset.name };
    useGTUltraStore.setState({ instrumentData: data });
  }, [engine, currentInstrument]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 8 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 2, marginBottom: 8 }, children: categories.map((cat, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setSelectedCat(i),
        style: {
          padding: "3px 8px",
          fontSize: 9,
          fontFamily: "inherit",
          borderRadius: 3,
          border: "none",
          cursor: "pointer",
          background: i === selectedCat ? `${DAW_CSS.accent}30` : DAW_CSS.surface,
          color: i === selectedCat ? DAW_CSS.accent : DAW_CSS.textMuted
        },
        children: cat.toUpperCase()
      },
      cat,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 999,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 997,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }, children: presets.map((preset, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => applyPreset(preset),
        style: {
          padding: "8px 10px",
          textAlign: "left",
          borderRadius: 4,
          cursor: "pointer",
          fontFamily: "inherit",
          border: `1px solid ${DAW_CSS.panelBorder}`,
          background: DAW_CSS.surface,
          transition: "border-color 0.15s"
        },
        onMouseEnter: (e) => {
          e.target.style.borderColor = DAW_CSS.accent;
        },
        onMouseLeave: (e) => {
          e.target.style.borderColor = DAW_CSS.panelBorder;
        },
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 10, color: DAW_CSS.text, fontWeight: "bold", marginBottom: 2 }, children: preset.name }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
            lineNumber: 1027,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 8, color: DAW_CSS.textMuted, marginBottom: 4 }, children: preset.description }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
            lineNumber: 1028,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 4, fontSize: 8 }, children: WAVEFORMS.map((wf) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: preset.waveform & wf.bit ? DAW_CSS.success : DAW_CSS.textMuted }, children: wf.shortName }, wf.bit, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
            lineNumber: 1031,
            columnNumber: 17
          }, void 0)) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
            lineNumber: 1029,
            columnNumber: 13
          }, void 0)
        ]
      },
      i,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 1016,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 1014,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
    lineNumber: 995,
    columnNumber: 5
  }, void 0);
};
const STEP_COUNT = 16;
const DAWStepSequencer = () => {
  const patternData = useGTUltraStore((s) => s.patternData);
  const dawSelectedPattern = useGTUltraStore((s) => s.dawSelectedPattern);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const engine = useGTUltraStore((s) => s.engine);
  const pd = patternData.get(dawSelectedPattern);
  const channelCount = sidCount * 3;
  const getStepActive = reactExports.useCallback((_ch, step) => {
    if (!pd) return false;
    const bpc = 4;
    const off = step * bpc;
    if (off >= pd.data.length) return false;
    const noteVal = pd.data[off];
    return noteVal > 0 && noteVal < 189;
  }, [pd]);
  const toggleStep = reactExports.useCallback((_ch, step) => {
    if (!engine || !pd) return;
    const bpc = 4;
    const off = step * bpc;
    if (off >= pd.data.length) return;
    const noteVal = pd.data[off];
    const hasNote = noteVal > 0 && noteVal < 189;
    if (hasNote) {
      engine.setPatternCell(dawSelectedPattern, step, 0, 0);
      engine.setPatternCell(dawSelectedPattern, step, 1, 0);
    } else {
      const defaultNote = 25;
      engine.setPatternCell(dawSelectedPattern, step, 0, defaultNote);
      engine.setPatternCell(dawSelectedPattern, step, 1, currentInstrument);
    }
    useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
  }, [engine, pd, dawSelectedPattern, currentInstrument]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 8, overflowX: "auto", height: "100%" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: `60px repeat(${STEP_COUNT}, 1fr)`, gap: 2, fontSize: 9, fontFamily: '"JetBrains Mono", monospace' }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: DAW_CSS.textMuted } }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 1093,
      columnNumber: 9
    }, void 0),
    Array.from({ length: STEP_COUNT }, (_, s) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      textAlign: "center",
      color: s % 4 === 0 ? DAW_CSS.textSec : DAW_CSS.textMuted,
      fontWeight: s % 4 === 0 ? "bold" : "normal",
      padding: "2px 0"
    }, children: (s + 1).toString().padStart(2, "0") }, s, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
      lineNumber: 1095,
      columnNumber: 11
    }, void 0)),
    Array.from({ length: channelCount }, (_, ch) => {
      const color = DAW_CH_CSS[ch % DAW_CH_CSS.length];
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(React.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: 4, color: DAW_CSS.textSec }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: 3, height: 16, borderRadius: 1, background: color } }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
            lineNumber: 1109,
            columnNumber: 17
          }, void 0),
          "CH",
          ch + 1
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
          lineNumber: 1108,
          columnNumber: 15
        }, void 0),
        Array.from({ length: STEP_COUNT }, (_2, step) => {
          const active = getStepActive(ch, step);
          const isBeat = step % 4 === 0;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              onClick: () => toggleStep(ch, step),
              style: {
                width: "100%",
                aspectRatio: "1",
                maxHeight: 28,
                borderRadius: 3,
                cursor: "pointer",
                border: `1px solid ${active ? color : isBeat ? DAW_CSS.panelBorder : DAW_CSS.surface}`,
                background: active ? `${color}` : isBeat ? DAW_CSS.surface : DAW_CSS.bg,
                opacity: active ? 0.85 : 1,
                transition: "background 0.1s, border-color 0.1s"
              }
            },
            step,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
              lineNumber: 1116,
              columnNumber: 19
            },
            void 0
          );
        })
      ] }, ch, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
        lineNumber: 1107,
        columnNumber: 13
      }, void 0);
    })
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
    lineNumber: 1091,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/daw/GTDAWView.tsx",
    lineNumber: 1090,
    columnNumber: 5
  }, void 0);
};
export {
  GTDAWView
};
