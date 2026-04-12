const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/GTInstrumentPanel-Be2sjJs8.js","assets/DrawbarSlider-Dq9geM4g.js","assets/EnvelopeVisualization-Bz0hAbvA.js","assets/GTVisualMapping-BkrLaqE6.js","assets/GTOrderList-NqxttzXy.js","assets/GTTableEditor-Be4WhdJ4.js","assets/WavetableEditor-wq3DMlO8.js","assets/WaveformThumbnail-CebZPsAz.js","assets/SpectralFilter-Dxe-YniK.js","assets/HarmonicBarsCanvas-tCyue1dW.js","assets/PixiIsolatedWrapper-BN_s-AaT.js"])))=>i.map(i=>d[i]);
import { an as useSettingsStore, ao as useGTUltraStore, am as __vitePreload } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
const GTToolbar = reactExports.lazy(() => __vitePreload(() => import("./main-BbV5VyEH.js").then((n) => n.jy), true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0).then((m) => ({ default: m.GTToolbar })));
const GTInstrumentPanel = reactExports.lazy(() => __vitePreload(() => import("./GTInstrumentPanel-Be2sjJs8.js"), true ? __vite__mapDeps([7,1,2,3,0,4,5,6,8,9,10]) : void 0).then((m) => ({ default: m.GTInstrumentPanel })));
const GTOrderList = reactExports.lazy(() => __vitePreload(() => import("./GTOrderList-NqxttzXy.js"), true ? __vite__mapDeps([11,1,2,3,0,4,5,6]) : void 0).then((m) => ({ default: m.GTOrderList })));
const GTTableEditor = reactExports.lazy(() => __vitePreload(() => import("./GTTableEditor-Be4WhdJ4.js"), true ? __vite__mapDeps([12,1,2,3,0,4,5,6,13,8,14,15,16]) : void 0).then((m) => ({ default: m.GTTableEditor })));
const IsolatedComponent = ({ name }) => {
  const renderMode = useSettingsStore((s) => s.renderMode);
  const [size, setSize] = reactExports.useState({ width: 800, height: 600 });
  const containerRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  if (renderMode === "webgl") {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, style: { width: "100%", height: "100vh", background: "#0d0d0d", display: "flex", flexDirection: "column" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#6b6b80", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, textAlign: "center" }, children: [
        "WebGL mode — showing Pixi component: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6366f1", fontWeight: "bold" }, children: name }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
          lineNumber: 51,
          columnNumber: 48
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("br", {}, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
          lineNumber: 52,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 9, color: "#44445a" }, children: "Pixi components need the full app context. Load a GT Ultra .sng file to see them." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
          lineNumber: 53,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 50,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#444" }, children: "Loading Pixi..." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 56,
        columnNumber: 29
      }, void 0), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PixiIsolatedWrapper, { name, width: size.width, height: size.height - 60 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 57,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 56,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
      lineNumber: 49,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, style: { width: "100%", height: "100vh", background: "#0d0d0d", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: "4px 12px", background: "#1a1a24", borderBottom: "1px solid #2a2a3a", fontSize: 9, color: "#6b6b80", fontFamily: '"JetBrains Mono", monospace' }, children: [
      "DOM: ",
      name
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
      lineNumber: 66,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 0, overflow: "auto" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#444" }, children: "Loading..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
      lineNumber: 70,
      columnNumber: 29
    }, void 0), children: [
      name === "toolbar" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GTToolbar, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 71,
        columnNumber: 34
      }, void 0),
      name === "instrument-panel" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GTInstrumentPanel, { width: size.width, height: size.height - 30 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 72,
        columnNumber: 43
      }, void 0),
      name === "order-list" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GTOrderList, { width: size.width, height: size.height - 30, channelCount: sidCount * 3 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 73,
        columnNumber: 37
      }, void 0),
      name === "table-editor" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GTTableEditor, { width: size.width, height: size.height - 30 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 74,
        columnNumber: 39
      }, void 0),
      name === "pattern-grid" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#6b6b80", fontFamily: "monospace", fontSize: 11 }, children: "Pattern Grid uses PatternEditorCanvas — load a GT Ultra .sng to see it in context." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 76,
        columnNumber: 13
      }, void 0),
      name === "sid-monitor" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#6b6b80", fontFamily: "monospace", fontSize: 11 }, children: "SID Monitor — available in GTUltraControls instrument tab. Load a .sng file." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 81,
        columnNumber: 13
      }, void 0),
      name === "preset-browser" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#6b6b80", fontFamily: "monospace", fontSize: 11 }, children: "Preset Browser — available in DAW mode bottom panel. Switch to DAW view." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 86,
        columnNumber: 13
      }, void 0),
      name === "piano-roll" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#6b6b80", fontFamily: "monospace", fontSize: 11 }, children: "Piano Roll — available in DAW mode. Load a GT Ultra .sng and switch to DAW view." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 91,
        columnNumber: 13
      }, void 0),
      name === "mixer" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#6b6b80", fontFamily: "monospace", fontSize: 11 }, children: "Mixer — available in DAW mode bottom panel or Mixer view." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 96,
        columnNumber: 13
      }, void 0),
      name === "arrangement" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#6b6b80", fontFamily: "monospace", fontSize: 11 }, children: "Arrangement — available in DAW mode. Load a GT Ultra .sng and switch to DAW view." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
        lineNumber: 101,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
      lineNumber: 70,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
      lineNumber: 69,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/IsolatedComponent.tsx",
    lineNumber: 65,
    columnNumber: 5
  }, void 0);
};
const PixiIsolatedWrapper = reactExports.lazy(() => __vitePreload(() => import("./PixiIsolatedWrapper-BN_s-AaT.js"), true ? __vite__mapDeps([17,1,2,3]) : void 0).then((m) => ({ default: m.PixiIsolatedWrapper })));
export {
  IsolatedComponent
};
