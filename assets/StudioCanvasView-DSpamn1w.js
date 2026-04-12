const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/UnifiedInstrumentEditor-CFDlFTgF.js","assets/VisualizerFrame-7GhRHAT_.js","assets/InstrumentOscilloscope-CE7eIp2-.js","assets/DrawbarSlider-Dq9geM4g.js","assets/useInstrumentColors-D5iKqwYD.js","assets/SectionHeader-DHk3L-9n.js","assets/EnvelopeVisualization-Bz0hAbvA.js","assets/GTVisualMapping-BkrLaqE6.js","assets/HardwareUIWrapper-GDcuDfC2.js","assets/DOMSynthPanel-C5W_v5Xk.js","assets/TestKeyboard-B6REGXyS.js","assets/MixerPanel-JoiCBBH7.js","assets/sendBusPresets-DSruMUC1.js","assets/ChannelInsertEffectsModal-kjfflOOE.js","assets/EffectParameterEditor-jgcbBJ--.js","assets/NeuralParameterMapper-BKFi47j3.js","assets/guitarMLRegistry-CdfjBfrw.js","assets/index-CRvWC1pf.js","assets/unifiedEffects-Cd2Pk46Y.js","assets/MasterEffectsPanel-BSvrJOQI.js","assets/InstrumentEffectsPanel-CG149pLS.js","assets/DJView-C0JJBDZr.js","assets/DJActions-Ap2A5JjP.js","assets/parseModuleToSong-B-Yqzlmn.js","assets/useDeckStateSync-BIQewTIw.js","assets/AudioDataBus-DGyOo1ms.js","assets/DJVideoCapture-DWBKuoDP.js","assets/DJView-4NTtRZzC.css"])))=>i.map(i=>d[i]);
import { a as useUIStore, al as useWorkbenchStore, am as __vitePreload, e as useInstrumentStore } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, d as ChevronLeft, b as ChevronRight, N as RotateCcw } from "./vendor-ui-AJ7AT9BN.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
const TrackerView = reactExports.lazy(
  () => __vitePreload(() => import("./main-BbV5VyEH.js").then((n) => n.jA), true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0).then((m) => ({ default: m.TrackerView }))
);
const UnifiedInstrumentEditor = reactExports.lazy(
  () => __vitePreload(() => import("./UnifiedInstrumentEditor-CFDlFTgF.js"), true ? __vite__mapDeps([7,1,2,3,8,0,4,5,6,9,10,11,12,13,14,15,16]) : void 0).then((m) => ({ default: m.UnifiedInstrumentEditor }))
);
const TestKeyboard = reactExports.lazy(
  () => __vitePreload(() => import("./TestKeyboard-B6REGXyS.js"), true ? __vite__mapDeps([17,1,2,3,0,4,5,6]) : void 0).then((m) => ({ default: m.TestKeyboard }))
);
const MixerContent = reactExports.lazy(
  () => __vitePreload(() => import("./MixerPanel-JoiCBBH7.js"), true ? __vite__mapDeps([18,1,2,3,0,4,5,6,19,20,21,22,23,24,10,12,25]) : void 0).then((m) => ({ default: m.MixerView }))
);
const MasterEffectsPanel = reactExports.lazy(
  () => __vitePreload(() => import("./MasterEffectsPanel-BSvrJOQI.js"), true ? __vite__mapDeps([26,0,1,2,3,4,5,6,25,23,24,10,12]) : void 0).then((m) => ({ default: m.MasterEffectsPanel }))
);
const InstrumentEffectsPanel = reactExports.lazy(
  () => __vitePreload(() => import("./InstrumentEffectsPanel-CG149pLS.js"), true ? __vite__mapDeps([27,1,2,3,0,4,5,6,24,10,12,25,23]) : void 0).then((m) => ({ default: m.InstrumentEffectsPanel }))
);
const DJView = reactExports.lazy(
  () => __vitePreload(() => import("./DJView-C0JJBDZr.js"), true ? __vite__mapDeps([28,0,1,2,3,4,5,6,29,30,31,32,33,25,23,34]) : void 0).then((m) => ({ default: m.DJView }))
);
const GAP = 8;
const PANEL_MIN_H = 150;
const PANEL_MIN_WIDTHS = {
  tracker: 600,
  instrument: 800,
  mixer: 400,
  masterFx: 300,
  instrumentFx: 300,
  dj: 800
};
const PANEL_MIN_W = 200;
function computeDefaultPanels(viewW, viewH) {
  const pad = 10;
  const trackerW = Math.max(1200, Math.round(viewW * 0.55));
  const instrW = Math.max(1100, Math.round(viewW * 0.5));
  const topH = Math.max(900, Math.round(viewH * 0.75));
  const totalTopW = trackerW + instrW + GAP;
  const fxW = Math.max(500, Math.round(totalTopW * 0.5) - GAP / 2);
  const fxH = Math.max(400, Math.round(viewH * 0.4));
  const fxY = pad + topH + GAP;
  const mixerW = Math.max(700, Math.min(900, Math.round(viewW * 0.45)));
  const djW = Math.max(1e3, Math.round(viewW * 0.5));
  const row3H = Math.max(500, Math.round(viewH * 0.45));
  const row3Y = fxY + fxH + GAP;
  return {
    tracker: { x: pad, y: pad, w: trackerW, h: topH },
    instrument: { x: pad + trackerW + GAP, y: pad, w: instrW, h: topH },
    masterFx: { x: pad, y: fxY, w: fxW, h: fxH },
    instrumentFx: { x: pad + fxW + GAP, y: fxY, w: fxW, h: fxH },
    mixer: { x: pad, y: row3Y, w: mixerW, h: row3H },
    dj: { x: pad + mixerW + GAP, y: row3Y, w: djW, h: row3H }
  };
}
const DEFAULT_PANELS = computeDefaultPanels(1920, 1080);
const PANEL_LABELS = {
  tracker: "TRACKER",
  instrument: "INSTRUMENT",
  mixer: "MIXER",
  masterFx: "MASTER FX",
  instrumentFx: "INSTRUMENT FX",
  dj: "DJ"
};
const PANEL_COLORS = {
  tracker: "border-2 border-blue-500/40",
  instrument: "border-2 border-purple-500/40",
  mixer: "border-2 border-green-500/40",
  masterFx: "border-2 border-orange-500/40",
  instrumentFx: "border-2 border-pink-500/40",
  dj: "border-2 border-red-500/40"
};
const EDGE_SIZE = 6;
const EDGE_CURSORS = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize"
};
const GRID_SIZE = 20;
const StudioGrid = ({ offsetX, offsetY, scale }) => {
  const gridSize = GRID_SIZE * scale;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { className: "absolute inset-0 pointer-events-none", style: { width: "100%", height: "100%" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("defs", { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "pattern",
      {
        id: "studio-canvas-grid",
        width: gridSize,
        height: gridSize,
        patternUnits: "userSpaceOnUse",
        x: offsetX,
        y: offsetY,
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "circle",
          {
            cx: gridSize / 2,
            cy: gridSize / 2,
            r: Math.max(0.4, 0.8 * scale),
            fill: "var(--color-text-muted)",
            opacity: "0.2"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
            lineNumber: 149,
            columnNumber: 11
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 141,
        columnNumber: 9
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 140,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("rect", { width: "100%", height: "100%", fill: "url(#studio-canvas-grid)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 158,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
    lineNumber: 139,
    columnNumber: 5
  }, void 0);
};
const InstrumentPanelContent = () => {
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentId = useInstrumentStore((s) => s.currentInstrumentId);
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);
  const setCurrentInstrument = useInstrumentStore((s) => s.setCurrentInstrument);
  const current = instruments.find((i) => i.id === currentId) ?? instruments[0];
  const sorted = [...instruments].sort((a, b) => a.id - b.id);
  const idx = sorted.findIndex((i) => i.id === currentId);
  const handlePrev = reactExports.useCallback(() => {
    if (sorted.length === 0) return;
    const prev = idx > 0 ? sorted[idx - 1] : sorted[sorted.length - 1];
    setCurrentInstrument(prev.id);
  }, [idx, sorted, setCurrentInstrument]);
  const handleNext = reactExports.useCallback(() => {
    if (sorted.length === 0) return;
    const next = idx < sorted.length - 1 ? sorted[idx + 1] : sorted[0];
    setCurrentInstrument(next.id);
  }, [idx, sorted, setCurrentInstrument]);
  if (!current) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center text-text-muted text-xs", children: "No instruments" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 188,
      columnNumber: 12
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full min-h-0", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 px-2 py-1 bg-dark-bgTertiary border-b border-dark-border text-xs shrink-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: handlePrev, className: "p-0.5 hover:bg-dark-bgHover rounded", title: "Previous instrument", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronLeft, { size: 12 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 195,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 194,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1 text-center text-text-secondary font-mono truncate", children: [
        String(current.id).padStart(2, "0"),
        ": ",
        current.name || current.synthType
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 197,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: handleNext, className: "p-0.5 hover:bg-dark-bgHover rounded", title: "Next instrument", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronRight, { size: 12 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 201,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 200,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 193,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-h-0 overflow-auto", style: { containerType: "inline-size" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center text-text-muted text-xs p-4", children: "Loading..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 205,
      columnNumber: 29
    }, void 0), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      UnifiedInstrumentEditor,
      {
        instrument: current,
        onChange: (updates) => updateInstrument(current.id, updates)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 206,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 205,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 204,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "shrink-0 border-t border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Suspense, { fallback: null, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TestKeyboard, { instrument: current }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 215,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 214,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 213,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
    lineNumber: 192,
    columnNumber: 5
  }, void 0);
};
const InstrumentFxPanelContent = () => {
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentId = useInstrumentStore((s) => s.currentInstrumentId);
  const current = instruments.find((i) => i.id === currentId) ?? instruments[0];
  if (!current) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center text-text-muted text-xs", children: "No instruments" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 231,
      columnNumber: 12
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center text-text-muted text-xs", children: "Loading FX..." }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
    lineNumber: 235,
    columnNumber: 25
  }, void 0), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    InstrumentEffectsPanel,
    {
      instrumentId: current.id,
      instrumentName: `${String(current.id).padStart(2, "0")}: ${current.name || current.synthType}`,
      effects: current.effects || []
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 236,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
    lineNumber: 235,
    columnNumber: 5
  }, void 0);
};
const EdgeHandles = ({ onEdgeDown }) => {
  const common = "absolute z-10";
  const E = EDGE_SIZE;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: common, style: { top: E, bottom: E, left: 0, width: E, cursor: "ew-resize" }, onPointerDown: (e) => onEdgeDown("w", e) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 257,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: common, style: { top: E, bottom: E, right: 0, width: E, cursor: "ew-resize" }, onPointerDown: (e) => onEdgeDown("e", e) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 258,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: common, style: { left: E, right: E, top: 0, height: E, cursor: "ns-resize" }, onPointerDown: (e) => onEdgeDown("n", e) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 259,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: common, style: { left: E, right: E, bottom: 0, height: E, cursor: "ns-resize" }, onPointerDown: (e) => onEdgeDown("s", e) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 260,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: common, style: { top: 0, left: 0, width: E * 2, height: E * 2, cursor: "nwse-resize" }, onPointerDown: (e) => onEdgeDown("nw", e) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 262,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: common, style: { top: 0, right: 0, width: E * 2, height: E * 2, cursor: "nesw-resize" }, onPointerDown: (e) => onEdgeDown("ne", e) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 263,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: common, style: { bottom: 0, left: 0, width: E * 2, height: E * 2, cursor: "nesw-resize" }, onPointerDown: (e) => onEdgeDown("sw", e) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 264,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: common, style: { bottom: 0, right: 0, width: E * 2, height: E * 2, cursor: "nwse-resize" }, onPointerDown: (e) => onEdgeDown("se", e) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 265,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
    lineNumber: 255,
    columnNumber: 5
  }, void 0);
};
const COLLAPSED_H = 28;
const DraggablePanel = ({ id, layout, camera, collapsed, zIndex, onDragStart, onEdgeResizeStart, onBringToFront, onToggleCollapse, children }) => {
  const handleEdgeDown = reactExports.useCallback((edge, e) => {
    onEdgeResizeStart(id, edge, e);
  }, [id, onEdgeResizeStart]);
  const displayH = collapsed ? COLLAPSED_H : layout.h;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-studio-panel": true,
      className: "absolute overflow-visible",
      style: {
        left: camera.x + layout.x * camera.scale,
        top: camera.y + layout.y * camera.scale,
        width: layout.w * camera.scale,
        height: displayH * camera.scale,
        zIndex,
        transformOrigin: "0 0"
      },
      onMouseDown: () => onBringToFront(id),
      children: [
        !collapsed && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EdgeHandles, { onEdgeDown: handleEdgeDown }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
          lineNumber: 313,
          columnNumber: 22
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `w-full h-full rounded-lg ${PANEL_COLORS[id]} shadow-xl bg-dark-bg overflow-hidden flex flex-col`, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "flex items-center px-2 py-1 bg-dark-bgSecondary border-b border-dark-border cursor-move shrink-0 select-none",
              onPointerDown: (e) => {
                e.preventDefault();
                e.stopPropagation();
                onDragStart(id, e);
              },
              onDoubleClick: (e) => {
                e.stopPropagation();
                onToggleCollapse(id);
              },
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono text-text-muted tracking-widest flex-1 pointer-events-none", children: PANEL_LABELS[id] }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
                  lineNumber: 330,
                  columnNumber: 11
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono text-text-muted opacity-50 pointer-events-none", children: collapsed ? "collapsed" : `${Math.round(layout.w)}x${Math.round(layout.h)}` }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
                  lineNumber: 333,
                  columnNumber: 11
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
              lineNumber: 318,
              columnNumber: 9
            },
            void 0
          ),
          !collapsed && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-h-0 overflow-hidden flex flex-col", children }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
            lineNumber: 339,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
          lineNumber: 316,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 299,
      columnNumber: 5
    },
    void 0
  );
};
const StudioCanvasView = () => {
  const openModal = useUIStore((s) => s.openModal);
  const containerRef = reactExports.useRef(null);
  const rawCamera = useWorkbenchStore((s) => s.camera);
  const camera = reactExports.useMemo(() => ({ ...rawCamera, scale: 1 }), [rawCamera]);
  const panCamera = useWorkbenchStore((s) => s.panCamera);
  const setCamera = useWorkbenchStore((s) => s.setCamera);
  const [panels, setPanels] = reactExports.useState({ ...DEFAULT_PANELS });
  const [collapsed, setCollapsed] = reactExports.useState({ tracker: false, instrument: false, mixer: false, masterFx: false, instrumentFx: false, dj: false });
  const [zOrder, setZOrder] = reactExports.useState(["dj", "mixer", "masterFx", "instrumentFx", "instrument", "tracker"]);
  const initializedRef = reactExports.useRef(false);
  reactExports.useLayoutEffect(() => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const fitted = computeDefaultPanels(rect.width, rect.height);
      setPanels(fitted);
      setCamera({ x: 0, y: 0, scale: 1 });
    }
  }, [setCamera]);
  const isPanning = reactExports.useRef(false);
  const panStart = reactExports.useRef({ x: 0, y: 0 });
  const dragRef = reactExports.useRef(null);
  const resizeRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const handleMove = (e) => {
      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        panStart.current = { x: e.clientX, y: e.clientY };
        panCamera(dx, dy);
        return;
      }
      if (dragRef.current) {
        const dt = dragRef.current;
        const s = useWorkbenchStore.getState().camera.scale;
        const dx = (e.clientX - dt.startX) / s;
        const dy = (e.clientY - dt.startY) / s;
        setPanels((prev) => ({
          ...prev,
          [dt.id]: { ...prev[dt.id], x: dt.panelX + dx, y: dt.panelY + dy }
        }));
        return;
      }
      if (resizeRef.current) {
        const rs = resizeRef.current;
        const s = useWorkbenchStore.getState().camera.scale;
        const dx = (e.clientX - rs.startX) / s;
        const dy = (e.clientY - rs.startY) / s;
        const { edge } = rs;
        const orig = rs.layout;
        let { x, y, w, h } = orig;
        const minW = PANEL_MIN_WIDTHS[rs.id] ?? PANEL_MIN_W;
        if (edge === "w" || edge === "nw" || edge === "sw") {
          const newW = Math.max(minW, w - dx);
          x = orig.x + (w - newW);
          w = newW;
        }
        if (edge === "e" || edge === "ne" || edge === "se") {
          w = Math.max(minW, w + dx);
        }
        if (edge === "n" || edge === "nw" || edge === "ne") {
          const newH = Math.max(PANEL_MIN_H, h - dy);
          y = orig.y + (h - newH);
          h = newH;
        }
        if (edge === "s" || edge === "sw" || edge === "se") {
          h = Math.max(PANEL_MIN_H, h + dy);
        }
        setPanels((prev) => ({ ...prev, [rs.id]: { x, y, w, h } }));
        return;
      }
    };
    const handleUp = () => {
      isPanning.current = false;
      dragRef.current = null;
      resizeRef.current = null;
      document.body.style.cursor = "";
    };
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [panCamera]);
  const cmdHeldRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Meta" || e.key === "Control") {
        cmdHeldRef.current = true;
        if (!isPanning.current && !dragRef.current && !resizeRef.current) {
          document.body.style.cursor = "grab";
        }
      }
    };
    const onKeyUp = (e) => {
      if (e.key === "Meta" || e.key === "Control") {
        cmdHeldRef.current = false;
        if (!isPanning.current) document.body.style.cursor = "";
      }
    };
    const onBlur = () => {
      cmdHeldRef.current = false;
      if (!isPanning.current) document.body.style.cursor = "";
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  reactExports.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const startPan = (e) => {
      if (dragRef.current || resizeRef.current) return;
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      document.body.style.cursor = "grabbing";
    };
    const handleDown = (e) => {
      if (e.button === 1) {
        startPan(e);
        return;
      }
      if (e.button === 0 && (e.metaKey || e.ctrlKey)) {
        startPan(e);
        return;
      }
      if (e.button === 0) {
        const target = e.target;
        const isBackground = target === el || target.tagName === "svg" || target.tagName === "rect" || target.tagName === "circle" || target.tagName === "pattern";
        if (!isBackground) return;
        startPan(e);
      }
    };
    el.addEventListener("mousedown", handleDown);
    return () => el.removeEventListener("mousedown", handleDown);
  }, []);
  reactExports.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      var _a;
      const target = e.target;
      const isPanel = !!((_a = target.closest) == null ? void 0 : _a.call(target, "[data-studio-panel]"));
      if (isPanel) return;
      e.preventDefault();
      const dx = e.shiftKey ? -e.deltaY : -e.deltaX;
      const dy = e.shiftKey ? 0 : -e.deltaY;
      panCamera(dx, dy);
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [panCamera]);
  const ALL_PANELS = ["tracker", "instrument", "masterFx", "instrumentFx", "mixer", "dj"];
  const visiblePanels = reactExports.useMemo(
    () => ALL_PANELS.filter((id) => !collapsed[id]).sort((a, b) => {
      const pa = panels[a], pb = panels[b];
      const rowA = Math.round(pa.y / 100), rowB = Math.round(pb.y / 100);
      return rowA !== rowB ? rowA - rowB : pa.x - pb.x;
    }),
    [panels, collapsed]
  );
  const [focusedPanel, setFocusedPanel] = reactExports.useState(-1);
  const panToPanel = reactExports.useCallback((index) => {
    var _a;
    const rect = (_a = containerRef.current) == null ? void 0 : _a.getBoundingClientRect();
    if (!rect || visiblePanels.length === 0) return;
    const wrapped = (index % visiblePanels.length + visiblePanels.length) % visiblePanels.length;
    const id = visiblePanels[wrapped];
    const p = panels[id];
    const cx = rect.width / 2 - (p.x + p.w / 2);
    const cy = rect.height / 2 - (p.y + p.h / 2);
    setCamera({ x: cx, y: cy, scale: 1 });
    setFocusedPanel(wrapped);
  }, [panels, visiblePanels, setCamera]);
  const handlePrevPanel = reactExports.useCallback(() => {
    panToPanel(focusedPanel <= 0 ? visiblePanels.length - 1 : focusedPanel - 1);
  }, [focusedPanel, visiblePanels.length, panToPanel]);
  const handleNextPanel = reactExports.useCallback(() => {
    panToPanel(focusedPanel >= visiblePanels.length - 1 ? 0 : focusedPanel + 1);
  }, [focusedPanel, visiblePanels.length, panToPanel]);
  reactExports.useEffect(() => {
    const handleKey = (e) => {
      var _a, _b;
      const tag = (_a = document.activeElement) == null ? void 0 : _a.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setCamera({ x: 0, y: 0, scale: 1 });
        const rect = (_b = containerRef.current) == null ? void 0 : _b.getBoundingClientRect();
        setPanels(rect && rect.width > 0 ? computeDefaultPanels(rect.width, rect.height) : { ...DEFAULT_PANELS });
        setFocusedPanel(-1);
      }
      if (e.key === "ArrowLeft" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handlePrevPanel();
      }
      if (e.key === "ArrowRight" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleNextPanel();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [setCamera, handlePrevPanel, handleNextPanel]);
  const handleDragStart = reactExports.useCallback((id, e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      panelX: panels[id].x,
      panelY: panels[id].y
    };
    document.body.style.cursor = "move";
  }, [panels]);
  const handleEdgeResizeStart = reactExports.useCallback((id, edge, e) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      id,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      layout: { ...panels[id] }
    };
    document.body.style.cursor = EDGE_CURSORS[edge];
  }, [panels]);
  const handleReset = reactExports.useCallback(() => {
    var _a;
    setCamera({ x: 0, y: 0, scale: 1 });
    const rect = (_a = containerRef.current) == null ? void 0 : _a.getBoundingClientRect();
    setPanels(rect && rect.width > 0 ? computeDefaultPanels(rect.width, rect.height) : { ...DEFAULT_PANELS });
    setFocusedPanel(-1);
  }, [setCamera]);
  const handleBringToFront = reactExports.useCallback((id) => {
    setZOrder((prev) => {
      const without = prev.filter((p) => p !== id);
      return [...without, id];
    });
  }, []);
  const handleToggleCollapse = reactExports.useCallback((id) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, className: "relative flex-1 min-h-0 min-w-0 overflow-hidden bg-dark-bg select-none", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StudioGrid, { offsetX: camera.x, offsetY: camera.y, scale: camera.scale }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 692,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DraggablePanel, { id: "tracker", layout: panels.tracker, camera, collapsed: collapsed.tracker, zIndex: zOrder.indexOf("tracker"), onDragStart: handleDragStart, onEdgeResizeStart: handleEdgeResizeStart, onBringToFront: handleBringToFront, onToggleCollapse: handleToggleCollapse, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center text-text-muted text-xs", children: "Loading tracker..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 697,
      columnNumber: 29
    }, void 0), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      TrackerView,
      {
        onShowExport: () => openModal("export"),
        onShowHelp: (tab) => openModal("help", { initialTab: tab || "shortcuts" }),
        onShowMasterFX: () => {
          const s = useUIStore.getState();
          if (s.modalOpen === "masterFx") {
            s.closeModal();
          } else {
            s.openModal("masterFx");
          }
        },
        onShowInstrumentFX: () => {
          const s = useUIStore.getState();
          if (s.modalOpen === "instrumentFx") {
            s.closeModal();
          } else {
            s.openModal("instrumentFx");
          }
        },
        onShowInstruments: () => openModal("instruments"),
        onShowDrumpads: () => openModal("drumpads"),
        showPatterns: false,
        showMasterFX: false,
        showInstrumentFX: false
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 698,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 697,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 696,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DraggablePanel, { id: "instrument", layout: panels.instrument, camera, collapsed: collapsed.instrument, zIndex: zOrder.indexOf("instrument"), onDragStart: handleDragStart, onEdgeResizeStart: handleEdgeResizeStart, onBringToFront: handleBringToFront, onToggleCollapse: handleToggleCollapse, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(InstrumentPanelContent, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 713,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 712,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DraggablePanel, { id: "masterFx", layout: panels.masterFx, camera, collapsed: collapsed.masterFx, zIndex: zOrder.indexOf("masterFx"), onDragStart: handleDragStart, onEdgeResizeStart: handleEdgeResizeStart, onBringToFront: handleBringToFront, onToggleCollapse: handleToggleCollapse, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-h-0 overflow-auto", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center text-text-muted text-xs p-4", children: "Loading master FX..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 718,
      columnNumber: 31
    }, void 0), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MasterEffectsPanel, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 719,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 718,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 717,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 716,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DraggablePanel, { id: "instrumentFx", layout: panels.instrumentFx, camera, collapsed: collapsed.instrumentFx, zIndex: zOrder.indexOf("instrumentFx"), onDragStart: handleDragStart, onEdgeResizeStart: handleEdgeResizeStart, onBringToFront: handleBringToFront, onToggleCollapse: handleToggleCollapse, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(InstrumentFxPanelContent, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 725,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 724,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DraggablePanel, { id: "mixer", layout: panels.mixer, camera, collapsed: collapsed.mixer, zIndex: zOrder.indexOf("mixer"), onDragStart: handleDragStart, onEdgeResizeStart: handleEdgeResizeStart, onBringToFront: handleBringToFront, onToggleCollapse: handleToggleCollapse, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-h-0 overflow-x-auto overflow-y-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center text-text-muted text-xs", children: "Loading mixer..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 730,
      columnNumber: 31
    }, void 0), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerContent, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 731,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 730,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 729,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 728,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DraggablePanel, { id: "dj", layout: panels.dj, camera, collapsed: collapsed.dj, zIndex: zOrder.indexOf("dj"), onDragStart: handleDragStart, onEdgeResizeStart: handleEdgeResizeStart, onBringToFront: handleBringToFront, onToggleCollapse: handleToggleCollapse, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center text-text-muted text-xs", children: "Loading DJ..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 737,
      columnNumber: 29
    }, void 0), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJView, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 738,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 737,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 736,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-2 right-2 flex items-center gap-1 bg-dark-bgSecondary/90 backdrop-blur-sm border border-dark-border rounded-lg px-2 py-1 z-10", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: handlePrevPanel, className: "p-1 hover:bg-dark-bgHover rounded text-text-secondary", title: "Previous panel", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronLeft, { size: 14 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 745,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 744,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono text-text-muted min-w-[90px] text-center", children: focusedPanel >= 0 && focusedPanel < visiblePanels.length ? PANEL_LABELS[visiblePanels[focusedPanel]] : "OVERVIEW" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 747,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: handleNextPanel, className: "p-1 hover:bg-dark-bgHover rounded text-text-secondary", title: "Next panel", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronRight, { size: 14 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 751,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 750,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: handleReset, className: "p-1 hover:bg-dark-bgHover rounded text-text-secondary ml-1", title: "Reset layout (R)", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RotateCcw, { size: 14 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 754,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
        lineNumber: 753,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 743,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute bottom-2 left-2 text-[9px] font-mono text-text-muted opacity-50 z-10", children: "Drag: pan | Scroll: pan | Arrows: prev/next panel | R: reset" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
      lineNumber: 759,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/studio/StudioCanvasView.tsx",
    lineNumber: 690,
    columnNumber: 5
  }, void 0);
};
export {
  StudioCanvasView,
  StudioCanvasView as default
};
