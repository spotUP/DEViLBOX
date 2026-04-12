import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, a6 as Loader } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob, $ as getToneEngine } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { VSTBridgePanel } from "./VSTBridgePanel-C5HiFSR6.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const TABS = [
  { id: "osc", label: "OSC" },
  { id: "filter", label: "FILTER" },
  { id: "env", label: "ENV" },
  { id: "lfo", label: "LFO" },
  { id: "fx", label: "FX" },
  { id: "global", label: "GLOBAL" },
  { id: "other", label: "OTHER" }
];
function isSurgeParamCategorized(name) {
  for (const scene of ["A", "B"]) {
    for (const n of [1, 2, 3]) {
      if (name.startsWith(`${scene} Osc ${n} `)) return true;
    }
    for (const n of [1, 2]) {
      if (name.startsWith(`${scene} Filter ${n} `)) return true;
    }
    if (name.startsWith(`${scene} Amp EG `)) return true;
    if (name.startsWith(`${scene} Filter EG `)) return true;
    for (const n of [1, 2, 3, 4, 5, 6]) {
      if (name.startsWith(`${scene} LFO ${n} `)) return true;
    }
    for (const n of [1, 2]) {
      if (name.startsWith(`${scene} S-LFO ${n} `)) return true;
    }
  }
  if (name.startsWith("FX ")) return true;
  const globalNames = /* @__PURE__ */ new Set([
    "Volume",
    "Active Scene",
    "Scene Mode",
    "Split Point",
    "FX Return A",
    "FX Return B",
    "Polyphony"
  ]);
  if (globalNames.has(name)) return true;
  return false;
}
const SurgeControls = ({
  instrument,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("osc");
  const [activeScene, setActiveScene] = reactExports.useState("A");
  const [paramValues, setParamValues] = reactExports.useState(/* @__PURE__ */ new Map());
  const [paramByName, setParamByName] = reactExports.useState(/* @__PURE__ */ new Map());
  const [allParams, setAllParams] = reactExports.useState([]);
  const [synthReady, setSynthReady] = reactExports.useState(false);
  const synthRef = reactExports.useRef(null);
  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#ff8c00");
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
          const nameMap = /* @__PURE__ */ new Map();
          const valMap = /* @__PURE__ */ new Map();
          for (const p of wasmParams) {
            nameMap.set(p.name, p);
            valMap.set(p.id, p.defaultValue);
          }
          if (!cancelled) {
            setParamByName(nameMap);
            setParamValues(valMap);
            setAllParams(wasmParams);
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
    setParamValues((prev) => {
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
    if (synthRef.current) {
      synthRef.current.setParameter(id, value);
    }
  }, []);
  const renderParamKnob = reactExports.useCallback((props) => {
    const p = paramByName.get(props.name);
    if (!p) return null;
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        label: props.label,
        value: paramValues.get(p.id) ?? p.defaultValue,
        min: props.min ?? p.min,
        max: props.max ?? p.max,
        defaultValue: p.defaultValue,
        onChange: (v) => setParam(p.id, v),
        size: props.size || "sm",
        color: knobColor,
        logarithmic: props.logarithmic,
        bipolar: props.bipolar,
        formatValue: props.fmt
      },
      p.id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 151,
        columnNumber: 7
      },
      void 0
    );
  }, [paramByName, paramValues, setParam, knobColor]);
  const getSceneParams = reactExports.useCallback((pattern) => {
    const prefix = `${activeScene} ${pattern}`;
    return allParams.filter((p) => p.name.startsWith(prefix));
  }, [allParams, activeScene]);
  if (!synthReady) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center gap-2 p-4 text-text-secondary", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Loader, { size: 16, className: "animate-spin" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 178,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm", children: "Loading Surge XT..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 179,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 177,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VSTBridgePanel, { instrument, onChange }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 181,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 176,
      columnNumber: 7
    }, void 0);
  }
  const tabBarBg = isCyanTheme ? "bg-[#061818]" : "bg-[#111]";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow flex flex-col gap-0 overflow-y-auto", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex items-center gap-3 px-4 py-2 ${tabBarBg} border-b border-dark-border`, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: ["A", "B"].map((scene) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveScene(scene),
          className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${activeScene === scene ? "text-black" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
          style: activeScene === scene ? { backgroundColor: accentColor } : {},
          children: [
            "Scene ",
            scene
          ]
        },
        scene,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 196,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 194,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-6 bg-dark-bgHover" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 211,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: TABS.map((tab) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab(tab.id),
          className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${activeTab === tab.id ? "text-black" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
          style: activeTab === tab.id ? { backgroundColor: accentColor } : {},
          children: tab.label
        },
        tab.id,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 216,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 214,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 192,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 flex flex-col gap-4", children: [
      activeTab === "osc" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [1, 2, 3].map((n) => {
        const oscParams = getSceneParams(`Osc ${n}`);
        if (oscParams.length === 0) return null;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: [
            activeScene,
            " - Oscillator ",
            n
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
            lineNumber: 242,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: [
            renderParamKnob({
              name: `${activeScene} Osc ${n} Pitch`,
              label: "Pitch",
              bipolar: true,
              fmt: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}st`
            }),
            oscParams.filter((p) => !p.name.includes("Pitch") && !p.name.includes("Type")).map((p) => {
              const shortName = p.name.replace(`${activeScene} Osc ${n} `, "");
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Knob,
                {
                  label: shortName.length > 10 ? shortName.substring(0, 10) : shortName,
                  value: paramValues.get(p.id) ?? p.defaultValue,
                  min: p.min,
                  max: p.max,
                  defaultValue: p.defaultValue,
                  onChange: (v) => setParam(p.id, v),
                  color: knobColor
                },
                p.id,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
                  lineNumber: 253,
                  columnNumber: 27
                },
                void 0
              );
            })
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
            lineNumber: 245,
            columnNumber: 19
          }, void 0)
        ] }, n, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 241,
          columnNumber: 17
        }, void 0);
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 235,
        columnNumber: 11
      }, void 0),
      activeTab === "filter" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [1, 2].map((n) => {
        const filParams = getSceneParams(`Filter ${n}`);
        if (filParams.length === 0) return null;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: [
            activeScene,
            " - Filter ",
            n
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
            lineNumber: 280,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: [
            renderParamKnob({ name: `${activeScene} Filter ${n} Frequency`, label: "Cutoff", logarithmic: true }),
            renderParamKnob({ name: `${activeScene} Filter ${n} Resonance`, label: "Resonance" }),
            renderParamKnob({ name: `${activeScene} Filter ${n} Env Depth`, label: "Env Depth", bipolar: true }),
            renderParamKnob({ name: `${activeScene} Filter ${n} Keytrack`, label: "Keytrack", bipolar: true }),
            filParams.filter((p) => {
              const n2 = p.name.toLowerCase();
              return !n2.includes("frequency") && !n2.includes("resonance") && !n2.includes("env depth") && !n2.includes("keytrack") && !n2.includes("type");
            }).map((p) => {
              const shortName = p.name.replace(new RegExp(`${activeScene} Filter \\d+ `), "");
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Knob,
                {
                  label: shortName.length > 10 ? shortName.substring(0, 10) : shortName,
                  value: paramValues.get(p.id) ?? p.defaultValue,
                  min: p.min,
                  max: p.max,
                  defaultValue: p.defaultValue,
                  onChange: (v) => setParam(p.id, v),
                  color: knobColor
                },
                p.id,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
                  lineNumber: 297,
                  columnNumber: 27
                },
                void 0
              );
            })
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
            lineNumber: 283,
            columnNumber: 19
          }, void 0)
        ] }, n, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 279,
          columnNumber: 17
        }, void 0);
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 273,
        columnNumber: 11
      }, void 0),
      activeTab === "env" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: ["Amp EG", "Filter EG"].map((egName) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: [
          activeScene,
          " - ",
          egName
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 320,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: [
          renderParamKnob({
            name: `${activeScene} ${egName} Attack`,
            label: "Attack",
            fmt: (v) => `${(v * 1e3).toFixed(0)}ms`
          }),
          renderParamKnob({
            name: `${activeScene} ${egName} Decay`,
            label: "Decay",
            fmt: (v) => `${(v * 1e3).toFixed(0)}ms`
          }),
          renderParamKnob({
            name: `${activeScene} ${egName} Sustain`,
            label: "Sustain",
            fmt: (v) => `${Math.round(v * 100)}%`
          }),
          renderParamKnob({
            name: `${activeScene} ${egName} Release`,
            label: "Release",
            fmt: (v) => `${(v * 1e3).toFixed(0)}ms`
          }),
          renderParamKnob({ name: `${activeScene} ${egName} Attack Shape`, label: "A Shape", bipolar: true }),
          renderParamKnob({ name: `${activeScene} ${egName} Decay Shape`, label: "D Shape", bipolar: true }),
          renderParamKnob({ name: `${activeScene} ${egName} Release Shape`, label: "R Shape", bipolar: true })
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 323,
          columnNumber: 17
        }, void 0)
      ] }, egName, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 319,
        columnNumber: 15
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 317,
        columnNumber: 11
      }, void 0),
      activeTab === "lfo" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        SurgeLfoTab,
        {
          activeScene,
          paramValues,
          setParam,
          knobColor,
          accentColor,
          panelBg,
          panelStyle,
          allParams
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 342,
          columnNumber: 11
        },
        void 0
      ),
      activeTab === "fx" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        SurgeFxTab,
        {
          allParams,
          paramValues,
          setParam,
          knobColor,
          accentColor,
          panelBg,
          panelStyle
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 355,
          columnNumber: 11
        },
        void 0
      ),
      activeTab === "global" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: "Global" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 368,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
          renderParamKnob({ name: "Volume", label: "Volume", size: "md" }),
          renderParamKnob({
            name: "Active Scene",
            label: "Scene",
            fmt: (v) => v < 0.5 ? "A" : "B"
          }),
          renderParamKnob({
            name: "Scene Mode",
            label: "Mode",
            fmt: (v) => ["Single", "Key Split", "Dual", "Ch Split"][Math.round(v)] || `${Math.round(v)}`
          }),
          renderParamKnob({
            name: "Split Point",
            label: "Split",
            size: "md",
            fmt: (v) => `${Math.round(v)}`
          }),
          renderParamKnob({ name: "FX Return A", label: "FX Ret A", size: "md" }),
          renderParamKnob({ name: "FX Return B", label: "FX Ret B", size: "md" }),
          renderParamKnob({
            name: "Polyphony",
            label: "Poly",
            fmt: (v) => `${Math.round(v)}`
          })
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 371,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 367,
        columnNumber: 11
      }, void 0),
      activeTab === "other" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        SurgeOtherTab,
        {
          allParams,
          paramValues,
          setParam,
          knobColor,
          accentColor,
          panelBg,
          panelStyle
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 388,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 233,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
    lineNumber: 190,
    columnNumber: 5
  }, void 0);
};
const SurgeLfoTab = ({
  activeScene,
  paramValues,
  setParam,
  knobColor,
  accentColor,
  panelBg,
  panelStyle,
  allParams
}) => {
  const [activeLfo, setActiveLfo] = reactExports.useState(1);
  const lfoLabels = ["LFO 1", "LFO 2", "LFO 3", "LFO 4", "LFO 5", "LFO 6", "S-LFO 1", "S-LFO 2"];
  const currentLfoName = lfoLabels[activeLfo - 1] || "LFO 1";
  const prefix = `${activeScene} ${currentLfoName}`;
  const lfoParams = allParams.filter((p) => p.name.startsWith(prefix));
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 flex-wrap mb-2", children: lfoLabels.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveLfo(i + 1),
        className: `px-2 py-1 text-[10px] font-bold rounded transition-all ${activeLfo === i + 1 ? "text-black" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
        style: activeLfo === i + 1 ? { backgroundColor: accentColor } : {},
        children: label
      },
      label,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 434,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 432,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: [
        activeScene,
        " - ",
        currentLfoName
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 450,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: lfoParams.map((p) => {
        const shortName = p.name.replace(`${prefix} `, "");
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: shortName.length > 10 ? shortName.substring(0, 10) : shortName,
            value: paramValues.get(p.id) ?? p.defaultValue,
            min: p.min,
            max: p.max,
            defaultValue: p.defaultValue,
            onChange: (v) => setParam(p.id, v),
            color: knobColor
          },
          p.id,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
            lineNumber: 457,
            columnNumber: 15
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 453,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 449,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
    lineNumber: 431,
    columnNumber: 5
  }, void 0);
};
const SurgeFxTab = ({
  allParams,
  paramValues,
  setParam,
  knobColor,
  accentColor,
  panelBg,
  panelStyle
}) => {
  const fxSlots = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "S1", "S2", "S3", "S4", "G1", "G2", "G3", "G4"];
  const fxGroups = fxSlots.map((slot) => {
    const prefix = `FX ${slot}`;
    const params = allParams.filter((p) => p.name.startsWith(prefix));
    return { slot, prefix, params };
  }).filter((g) => g.params.length > 0);
  if (fxGroups.length === 0) {
    const fxParams = allParams.filter((p) => p.name.startsWith("FX"));
    if (fxParams.length === 0) {
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-text-muted", children: "No FX parameters available." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 506,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 505,
        columnNumber: 9
      }, void 0);
    }
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: "Effects" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 513,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: fxParams.map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: p.name.replace("FX ", "").substring(0, 10),
          value: paramValues.get(p.id) ?? p.defaultValue,
          min: p.min,
          max: p.max,
          defaultValue: p.defaultValue,
          onChange: (v) => setParam(p.id, v),
          color: knobColor
        },
        p.id,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 518,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 516,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 512,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: fxGroups.map(({ slot, prefix, params }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: [
      "FX ",
      slot
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 538,
      columnNumber: 11
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: params.map((p) => {
      const shortName = p.name.replace(`${prefix} `, "");
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: shortName.length > 10 ? shortName.substring(0, 10) : shortName,
          value: paramValues.get(p.id) ?? p.defaultValue,
          min: p.min,
          max: p.max,
          defaultValue: p.defaultValue,
          onChange: (v) => setParam(p.id, v),
          color: knobColor
        },
        p.id,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
          lineNumber: 545,
          columnNumber: 17
        },
        void 0
      );
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 541,
      columnNumber: 11
    }, void 0)
  ] }, slot, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
    lineNumber: 537,
    columnNumber: 9
  }, void 0)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
    lineNumber: 535,
    columnNumber: 5
  }, void 0);
};
const SurgeOtherTab = ({
  allParams,
  paramValues,
  setParam,
  knobColor,
  accentColor,
  panelBg,
  panelStyle
}) => {
  const uncategorized = allParams.filter((p) => !isSurgeParamCategorized(p.name));
  if (uncategorized.length === 0) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-text-muted", children: "All parameters are shown in the categorized tabs." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 586,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 585,
      columnNumber: 7
    }, void 0);
  }
  const groups = /* @__PURE__ */ new Map();
  for (const p of uncategorized) {
    const words = p.name.split(" ");
    const prefix = words.length > 2 ? words.slice(0, 2).join(" ") : words[0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(p);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-3 rounded-lg border ${panelBg}`, style: panelStyle, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted mb-1", children: [
      uncategorized.length,
      " additional parameters not shown in other tabs"
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 603,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 602,
      columnNumber: 7
    }, void 0),
    Array.from(groups.entries()).map(([prefix, params]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: prefix }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 609,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: params.map((p) => {
        const shortLabel = p.name.replace(`${prefix} `, "");
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: shortLabel.length > 12 ? shortLabel.substring(0, 12) : shortLabel,
            value: paramValues.get(p.id) ?? p.defaultValue,
            min: p.min,
            max: p.max,
            defaultValue: p.defaultValue,
            onChange: (v) => setParam(p.id, v),
            color: knobColor
          },
          p.id,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
            lineNumber: 616,
            columnNumber: 17
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
        lineNumber: 612,
        columnNumber: 11
      }, void 0)
    ] }, prefix, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
      lineNumber: 608,
      columnNumber: 9
    }, void 0))
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SurgeControls.tsx",
    lineNumber: 601,
    columnNumber: 5
  }, void 0);
};
export {
  SurgeControls
};
