import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, a6 as Loader } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob, $ as getToneEngine } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { VSTBridgePanel } from "./VSTBridgePanel-C5HiFSR6.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const P = {
  BREATH: 0,
  BRIGHTNESS: 1,
  VIBRATO_RATE: 2,
  VIBRATO_DEPTH: 3,
  DETUNE: 4,
  NOISE: 5,
  PORTAMENTO: 6,
  ATTACK: 7,
  RELEASE: 8,
  VOLUME: 9
};
const DEFAULTS = [0.7, 0.5, 4.5, 0.2, 5, 0.15, 0.1, 0.15, 0.2, 0.8];
const MelodicaControls = ({
  instrument,
  onChange
}) => {
  const [params, setParams] = reactExports.useState([...DEFAULTS]);
  const [synthReady, setSynthReady] = reactExports.useState(false);
  const synthRef = reactExports.useRef(null);
  const { accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#2dd4bf");
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
          const vals = DEFAULTS.map(
            (def, i) => i < wasmParams.length ? wasmParams[i].defaultValue ?? def : def
          );
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
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
          lineNumber: 102,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm", children: "Loading Melodica..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
          lineNumber: 103,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
        lineNumber: 101,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VSTBridgePanel, { instrument, onChange }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
        lineNumber: 105,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
      lineNumber: 100,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "h3",
        {
          className: "font-bold uppercase tracking-tight text-sm mb-3",
          style: { color: accentColor },
          children: "Breath & Dynamics"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
          lineNumber: 115,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Breath",
            value: params[P.BREATH],
            min: 0,
            max: 1,
            defaultValue: 0.7,
            onChange: (v) => setParam(P.BREATH, v),
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
            lineNumber: 122,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Attack",
            value: params[P.ATTACK],
            min: 0,
            max: 1,
            defaultValue: 0.15,
            onChange: (v) => setParam(P.ATTACK, v),
            size: "md",
            color: knobColor,
            formatValue: (v) => `${Math.round(v * 1e3)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
            lineNumber: 132,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Release",
            value: params[P.RELEASE],
            min: 0,
            max: 1,
            defaultValue: 0.2,
            onChange: (v) => setParam(P.RELEASE, v),
            size: "md",
            color: knobColor,
            formatValue: (v) => `${Math.round(v * 1e3)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
            lineNumber: 143,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
        lineNumber: 121,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
      lineNumber: 114,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "h3",
        {
          className: "font-bold uppercase tracking-tight text-sm mb-3",
          style: { color: accentColor },
          children: "Tone"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
          lineNumber: 159,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Brightness",
            value: params[P.BRIGHTNESS],
            min: 0,
            max: 1,
            defaultValue: 0.5,
            onChange: (v) => setParam(P.BRIGHTNESS, v),
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
            lineNumber: 166,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Noise",
            value: params[P.NOISE],
            min: 0,
            max: 1,
            defaultValue: 0.15,
            onChange: (v) => setParam(P.NOISE, v),
            size: "md",
            color: knobColor,
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
            lineNumber: 176,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Detune",
            value: params[P.DETUNE],
            min: -50,
            max: 50,
            defaultValue: 5,
            onChange: (v) => setParam(P.DETUNE, v),
            size: "md",
            color: knobColor,
            bipolar: true,
            formatValue: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}ct`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
            lineNumber: 187,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
        lineNumber: 165,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
      lineNumber: 158,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "h3",
        {
          className: "font-bold uppercase tracking-tight text-sm mb-3",
          style: { color: accentColor },
          children: "Vibrato"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
          lineNumber: 204,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Rate",
            value: params[P.VIBRATO_RATE],
            min: 0,
            max: 10,
            defaultValue: 4.5,
            onChange: (v) => setParam(P.VIBRATO_RATE, v),
            size: "md",
            color: knobColor,
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
            lineNumber: 211,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Depth",
            value: params[P.VIBRATO_DEPTH],
            min: 0,
            max: 1,
            defaultValue: 0.2,
            onChange: (v) => setParam(P.VIBRATO_DEPTH, v),
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
            lineNumber: 222,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
        lineNumber: 210,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
      lineNumber: 203,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "h3",
        {
          className: "font-bold uppercase tracking-tight text-sm mb-3",
          style: { color: accentColor },
          children: "Playing & Output"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
          lineNumber: 237,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Portamento",
            value: params[P.PORTAMENTO],
            min: 0,
            max: 1,
            defaultValue: 0.1,
            onChange: (v) => setParam(P.PORTAMENTO, v),
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
            lineNumber: 244,
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
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
            lineNumber: 254,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
        lineNumber: 243,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
      lineNumber: 236,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MelodicaControls.tsx",
    lineNumber: 112,
    columnNumber: 5
  }, void 0);
};
export {
  MelodicaControls
};
