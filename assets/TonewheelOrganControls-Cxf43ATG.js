import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, a6 as Loader } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob, $ as getToneEngine } from "./main-BbV5VyEH.js";
import { D as DrawbarSlider } from "./DrawbarSlider-Dq9geM4g.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { VSTBridgePanel } from "./VSTBridgePanel-C5HiFSR6.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const P = {
  PERCUSSION: 9,
  PERC_FAST: 10,
  PERC_SOFT: 11,
  CLICK: 12,
  VIBRATO_TYPE: 13,
  VIBRATO_DEPTH: 14,
  OVERDRIVE: 15,
  VOLUME: 16
};
const DRAWBAR_LABELS = ["16'", "5⅓'", "8'", "4'", "2⅔'", "2'", "1⅗'", "1⅓'", "1'"];
const DRAWBAR_COLORS = [
  "#a0522d",
  // brown
  "#a0522d",
  // brown
  "#f0f0f0",
  // white
  "#f0f0f0",
  // white
  "#222222",
  // black
  "#f0f0f0",
  // white
  "#222222",
  // black
  "#222222",
  // black
  "#f0f0f0"
  // white
];
const VIBRATO_LABELS = ["V1", "V2", "V3", "C1", "C2", "C3"];
const PERC_LABELS = ["OFF", "2ND", "3RD"];
const DEFAULTS = [8, 8, 8, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0.3, 2, 0.5, 0, 0.8];
const TonewheelOrganControls = ({
  instrument,
  onChange
}) => {
  const [params, setParams] = reactExports.useState([...DEFAULTS]);
  const [synthReady, setSynthReady] = reactExports.useState(false);
  const synthRef = reactExports.useRef(null);
  const { accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#d4a017");
  reactExports.useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      var _a;
      try {
        const engine = getToneEngine();
        const key = engine.getInstrumentKey(instrument.id, -1);
        const synth = (_a = engine.instruments) == null ? void 0 : _a.get(key);
        if (!synth || !("setParameter" in synth)) {
          setTimeout(() => {
            if (!cancelled) connect();
          }, 500);
          return;
        }
        if ("ensureInitialized" in synth) {
          await synth.ensureInitialized();
        }
        synthRef.current = synth;
        if ("getParams" in synth) {
          const wasmParams = synth.getParams();
          const vals = wasmParams.map((p) => p.defaultValue);
          if (!cancelled) {
            setParams(vals);
            setSynthReady(true);
          }
        } else {
          if (!cancelled) setSynthReady(true);
        }
      } catch {
        setTimeout(() => {
          if (!cancelled) connect();
        }, 1e3);
      }
    };
    connect();
    return () => {
      cancelled = true;
    };
  }, [instrument.id]);
  const setParam = reactExports.useCallback((id, value) => {
    setParams((prev) => {
      const next = [...prev];
      next[id] = value;
      return next;
    });
    if (synthRef.current) {
      synthRef.current.setParameter(id, value);
    }
  }, []);
  if (!synthReady) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center gap-2 p-4 text-text-secondary", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Loader, { size: 16, className: "animate-spin" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 127,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm", children: "Loading Tonewheel Organ..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 128,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
        lineNumber: 126,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VSTBridgePanel, { instrument, onChange }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
        lineNumber: 130,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
      lineNumber: 125,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "h3",
        {
          className: "font-bold uppercase tracking-tight text-sm mb-2",
          style: { color: accentColor },
          children: "Drawbars"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 140,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-1 sm:gap-2", children: DRAWBAR_LABELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        DrawbarSlider,
        {
          label,
          value: params[i],
          color: DRAWBAR_COLORS[i],
          accentColor,
          onChange: (v) => setParam(i, v)
        },
        i,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 148,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
        lineNumber: 146,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
      lineNumber: 139,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "h3",
        {
          className: "font-bold uppercase tracking-tight text-sm mb-3",
          style: { color: accentColor },
          children: "Percussion"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 162,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: PERC_LABELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setParam(P.PERCUSSION, i),
            className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${Math.round(params[P.PERCUSSION]) === i ? "text-black" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            style: Math.round(params[P.PERCUSSION]) === i ? { backgroundColor: accentColor } : {},
            children: label
          },
          label,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
            lineNumber: 172,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 170,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-8 bg-dark-bgHover" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 187,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: ["SLOW", "FAST"].map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setParam(P.PERC_FAST, i),
            className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${Math.round(params[P.PERC_FAST]) === i ? "text-black" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            style: Math.round(params[P.PERC_FAST]) === i ? { backgroundColor: accentColor } : {},
            children: label
          },
          label,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
            lineNumber: 192,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 190,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-8 bg-dark-bgHover" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 207,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: ["NORM", "SOFT"].map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setParam(P.PERC_SOFT, i),
            className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${Math.round(params[P.PERC_SOFT]) === i ? "text-black" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            style: Math.round(params[P.PERC_SOFT]) === i ? { backgroundColor: accentColor } : {},
            children: label
          },
          label,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
            lineNumber: 212,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 210,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
        lineNumber: 168,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
      lineNumber: 161,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "h3",
        {
          className: "font-bold uppercase tracking-tight text-sm mb-3",
          style: { color: accentColor },
          children: "Vibrato / Chorus"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 231,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-start gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: VIBRATO_LABELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setParam(P.VIBRATO_TYPE, i),
            className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${Math.round(params[P.VIBRATO_TYPE]) === i ? "text-black" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            style: Math.round(params[P.VIBRATO_TYPE]) === i ? { backgroundColor: accentColor } : {},
            children: label
          },
          label,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
            lineNumber: 241,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 239,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Depth",
            value: params[P.VIBRATO_DEPTH],
            min: 0,
            max: 1,
            defaultValue: 0.5,
            onChange: (v) => setParam(P.VIBRATO_DEPTH, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
            lineNumber: 256,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
        lineNumber: 237,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
      lineNumber: 230,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "h3",
        {
          className: "font-bold uppercase tracking-tight text-sm mb-3",
          style: { color: accentColor },
          children: "Tone & Output"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
          lineNumber: 270,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Click",
            value: params[P.CLICK],
            min: 0,
            max: 1,
            defaultValue: 0.3,
            onChange: (v) => setParam(P.CLICK, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
            lineNumber: 277,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Overdrive",
            value: params[P.OVERDRIVE],
            min: 0,
            max: 1,
            defaultValue: 0,
            onChange: (v) => setParam(P.OVERDRIVE, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
            lineNumber: 286,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Volume",
            value: params[P.VOLUME],
            min: 0,
            max: 1,
            defaultValue: 0.8,
            onChange: (v) => setParam(P.VOLUME, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
            lineNumber: 295,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
        lineNumber: 276,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
      lineNumber: 269,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TonewheelOrganControls.tsx",
    lineNumber: 137,
    columnNumber: 5
  }, void 0);
};
export {
  TonewheelOrganControls
};
