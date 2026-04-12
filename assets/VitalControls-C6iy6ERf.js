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
  { id: "master", label: "MASTER" },
  { id: "other", label: "OTHER" }
];
const CATEGORIZED_PREFIXES = [
  "osc_1_",
  "osc_2_",
  "osc_3_",
  "filter_1_",
  "filter_2_",
  "filter_fx_",
  "env_1_",
  "env_2_",
  "env_3_",
  "env_4_",
  "env_5_",
  "env_6_",
  "lfo_1_",
  "lfo_2_",
  "lfo_3_",
  "lfo_4_",
  "lfo_5_",
  "lfo_6_",
  "lfo_7_",
  "lfo_8_",
  "chorus_",
  "delay_",
  "distortion_",
  "reverb_",
  "compressor_",
  "flanger_",
  "phaser_",
  "eq_"
];
const CATEGORIZED_EXACT = /* @__PURE__ */ new Set([
  "volume",
  "polyphony",
  "portamento_time",
  "pitch_bend_range",
  "velocity_track",
  "oversampling",
  "macro_control_1",
  "macro_control_2",
  "macro_control_3",
  "macro_control_4"
]);
function isParamCategorized(name) {
  if (CATEGORIZED_EXACT.has(name)) return true;
  return CATEGORIZED_PREFIXES.some((prefix) => name.startsWith(prefix));
}
const ParamKnob = ({
  name,
  label,
  min,
  max,
  fmt,
  logarithmic,
  bipolar,
  size,
  paramByName,
  paramValues,
  setParam,
  knobColor
}) => {
  const p = paramByName.get(name);
  if (!p) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Knob,
    {
      label,
      value: paramValues.get(p.id) ?? p.defaultValue,
      min: min ?? p.min,
      max: max ?? p.max,
      defaultValue: p.defaultValue,
      onChange: (v) => setParam(p.id, v),
      size: size || "sm",
      color: knobColor,
      logarithmic,
      bipolar,
      formatValue: fmt
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 78,
      columnNumber: 5
    },
    void 0
  );
};
const VitalControls = ({
  instrument,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("osc");
  const [paramValues, setParamValues] = reactExports.useState(/* @__PURE__ */ new Map());
  const [paramByName, setParamByName] = reactExports.useState(/* @__PURE__ */ new Map());
  const [allParams, setAllParams] = reactExports.useState([]);
  const [synthReady, setSynthReady] = reactExports.useState(false);
  const synthRef = reactExports.useRef(null);
  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#b84eff");
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
  const paramKnobProps = { paramByName, paramValues, setParam, knobColor };
  if (!synthReady) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center gap-2 p-4 text-text-secondary", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Loader, { size: 16, className: "animate-spin" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 173,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm", children: "Loading Vital..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 174,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 172,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VSTBridgePanel, { instrument, onChange }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 176,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 171,
      columnNumber: 7
    }, void 0);
  }
  const tabBarBg = isCyanTheme ? "bg-[#061818]" : "bg-[#111]";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0 overflow-y-auto", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex gap-1 px-4 py-2 ${tabBarBg} border-b border-dark-border`, children: TABS.map((tab) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
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
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 189,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 187,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 flex flex-col gap-4", children: [
      activeTab === "osc" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [1, 2, 3].map((n) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: [
          "Oscillator ",
          n
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 210,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: `osc_${n}_transpose`,
              label: "Transpose",
              min: -48,
              max: 48,
              bipolar: true,
              fmt: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}st`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 214,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: `osc_${n}_tune`,
              label: "Tune",
              min: -1,
              max: 1,
              bipolar: true,
              fmt: (v) => `${(v * 100).toFixed(0)}ct`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 216,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `osc_${n}_level`, label: "Level" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 218,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: `osc_${n}_pan`,
              label: "Pan",
              min: -1,
              max: 1,
              bipolar: true,
              fmt: (v) => v === 0 ? "C" : v < 0 ? `L${Math.round(Math.abs(v) * 100)}` : `R${Math.round(v * 100)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 219,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: `osc_${n}_unison_voices`,
              label: "Voices",
              fmt: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 221,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `osc_${n}_unison_detune`, label: "Detune" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 223,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `osc_${n}_wave_frame`, label: "Frame" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 224,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `osc_${n}_spectral_morph_amount`, label: "Spec Morph" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 225,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `osc_${n}_distortion_amount`, label: "Distortion" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 226,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 213,
          columnNumber: 17
        }, void 0)
      ] }, n, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 209,
        columnNumber: 15
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 207,
        columnNumber: 11
      }, void 0),
      activeTab === "filter" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        [1, 2].map((n) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: [
            "Filter ",
            n
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 237,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              ParamKnob,
              {
                ...paramKnobProps,
                name: `filter_${n}_cutoff`,
                label: "Cutoff",
                fmt: (v) => {
                  const hz = 20 * Math.pow(2, v * 10);
                  return hz >= 1e3 ? `${(hz / 1e3).toFixed(1)}k` : `${Math.round(hz)}`;
                }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
                lineNumber: 241,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `filter_${n}_resonance`, label: "Resonance" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 246,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `filter_${n}_drive`, label: "Drive" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 247,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `filter_${n}_blend`, label: "Blend" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 248,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `filter_${n}_keytrack`, label: "Keytrack", bipolar: true }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 249,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `filter_${n}_mix`, label: "Mix" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 250,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 240,
            columnNumber: 17
          }, void 0)
        ] }, n, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 236,
          columnNumber: 15
        }, void 0)),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: "FX Filter" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 255,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "filter_fx_cutoff", label: "Cutoff" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 259,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "filter_fx_resonance", label: "Resonance" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 260,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "filter_fx_drive", label: "Drive" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 261,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "filter_fx_blend", label: "Blend" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 262,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "filter_fx_mix", label: "Mix" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 263,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 258,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 254,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 234,
        columnNumber: 11
      }, void 0),
      activeTab === "env" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [1, 2, 3, 4, 5, 6].map((n) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: [
          "Envelope ",
          n,
          " ",
          n === 1 ? "(Amp)" : n === 2 ? "(Filter)" : ""
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 273,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: `env_${n}_delay`,
              label: "Delay",
              fmt: (v) => `${(v * 1e3).toFixed(0)}ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 277,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: `env_${n}_attack`,
              label: "Attack",
              fmt: (v) => `${(v * 1e3).toFixed(0)}ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 279,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: `env_${n}_hold`,
              label: "Hold",
              fmt: (v) => `${(v * 1e3).toFixed(0)}ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 281,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: `env_${n}_decay`,
              label: "Decay",
              fmt: (v) => `${(v * 1e3).toFixed(0)}ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 283,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: `env_${n}_sustain`,
              label: "Sustain",
              fmt: (v) => `${Math.round(v * 100)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 285,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: `env_${n}_release`,
              label: "Release",
              fmt: (v) => `${(v * 1e3).toFixed(0)}ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 287,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `env_${n}_attack_power`, label: "A Curve", bipolar: true }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 289,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `env_${n}_decay_power`, label: "D Curve", bipolar: true }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 290,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: `env_${n}_release_power`, label: "R Curve", bipolar: true }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 291,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 276,
          columnNumber: 17
        }, void 0)
      ] }, n, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 272,
        columnNumber: 15
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 270,
        columnNumber: 11
      }, void 0),
      activeTab === "lfo" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        LfoTabContent,
        {
          paramByName,
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
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 299,
          columnNumber: 11
        },
        void 0
      ),
      activeTab === "fx" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        { name: "chorus", label: "Chorus", params: ["chorus_voices", "chorus_frequency", "chorus_depth", "chorus_feedback", "chorus_dry_wet", "chorus_mod_depth"] },
        { name: "delay", label: "Delay", params: ["delay_frequency", "delay_feedback", "delay_dry_wet", "delay_filter_cutoff", "delay_filter_spread"] },
        { name: "distortion", label: "Distortion", params: ["distortion_drive", "distortion_mix", "distortion_filter_cutoff", "distortion_filter_resonance"] },
        { name: "reverb", label: "Reverb", params: ["reverb_size", "reverb_decay_time", "reverb_pre_low_cutoff", "reverb_pre_high_cutoff", "reverb_dry_wet", "reverb_chorus_amount"] },
        { name: "compressor", label: "Compressor", params: ["compressor_attack", "compressor_release", "compressor_low_gain", "compressor_band_gain", "compressor_high_gain", "compressor_mix"] },
        { name: "flanger", label: "Flanger", params: ["flanger_frequency", "flanger_feedback", "flanger_center", "flanger_dry_wet", "flanger_mod_depth"] },
        { name: "phaser", label: "Phaser", params: ["phaser_frequency", "phaser_feedback", "phaser_center", "phaser_dry_wet", "phaser_mod_depth"] },
        { name: "eq", label: "EQ", params: ["eq_low_cutoff", "eq_low_gain", "eq_band_cutoff", "eq_band_gain", "eq_high_cutoff", "eq_high_gain"] }
      ].map((fx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 mb-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ToggleButton,
            {
              name: `${fx.name}_on`,
              paramByName,
              paramValues,
              setParam,
              accentColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 324,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm", style: { color: accentColor }, children: fx.label }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 331,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 323,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: fx.params.map((pName) => {
          const p = paramByName.get(pName);
          if (!p) return null;
          const shortLabel = pName.replace(`${fx.name}_`, "").replace(/_/g, " ");
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: shortLabel.length > 10 ? shortLabel.substring(0, 10) : shortLabel,
              value: paramValues.get(p.id) ?? p.defaultValue,
              min: p.min,
              max: p.max,
              defaultValue: p.defaultValue,
              onChange: (v) => setParam(p.id, v),
              color: knobColor
            },
            pName,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 341,
              columnNumber: 23
            },
            void 0
          );
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 335,
          columnNumber: 17
        }, void 0)
      ] }, fx.name, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 322,
        columnNumber: 15
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 311,
        columnNumber: 11
      }, void 0),
      activeTab === "master" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: "Master" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 361,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "volume", label: "Volume", size: "md" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 365,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: "polyphony",
              label: "Polyphony",
              size: "md",
              fmt: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 366,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "portamento_time", label: "Porta Time", size: "md" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 368,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: "pitch_bend_range",
              label: "PB Range",
              size: "md",
              fmt: (v) => `${Math.round(v)}st`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 369,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "velocity_track", label: "Vel Track", size: "md" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 371,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            ParamKnob,
            {
              ...paramKnobProps,
              name: "oversampling",
              label: "Oversample",
              size: "md",
              fmt: (v) => `${Math.round(v)}x`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
              lineNumber: 372,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 364,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 mt-6", style: { color: accentColor }, children: "Macros" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 375,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "macro_control_1", label: "Macro 1", size: "md" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 379,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "macro_control_2", label: "Macro 2", size: "md" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 380,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "macro_control_3", label: "Macro 3", size: "md" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 381,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamKnob, { ...paramKnobProps, name: "macro_control_4", label: "Macro 4", size: "md" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 382,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 378,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 360,
        columnNumber: 11
      }, void 0),
      activeTab === "other" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        OtherParamsTab,
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
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
          lineNumber: 388,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 205,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
    lineNumber: 185,
    columnNumber: 5
  }, void 0);
};
const LfoTabContent = ({
  paramByName,
  paramValues,
  setParam,
  knobColor,
  accentColor,
  panelBg,
  panelStyle
}) => {
  const [activeLfo, setActiveLfo] = reactExports.useState(1);
  const lfoParams = [
    "frequency",
    "sync",
    "tempo",
    "fade_time",
    "smooth_mode",
    "delay_time",
    "stereo",
    "phase"
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 mb-2", children: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveLfo(n),
        className: `px-2.5 py-1 text-xs font-bold rounded transition-all ${activeLfo === n ? "text-black" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
        style: activeLfo === n ? { backgroundColor: accentColor } : {},
        children: [
          "LFO ",
          n
        ]
      },
      n,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 432,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 430,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: [
        "LFO ",
        activeLfo
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 448,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: lfoParams.map((paramSuffix) => {
        const name = `lfo_${activeLfo}_${paramSuffix}`;
        const p = paramByName.get(name);
        if (!p) return null;
        const label = paramSuffix.replace(/_/g, " ");
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: label.length > 10 ? label.substring(0, 10) : label,
            value: paramValues.get(p.id) ?? p.defaultValue,
            min: p.min,
            max: p.max,
            defaultValue: p.defaultValue,
            onChange: (v) => setParam(p.id, v),
            color: knobColor
          },
          name,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 458,
            columnNumber: 15
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 451,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 447,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
    lineNumber: 428,
    columnNumber: 5
  }, void 0);
};
const ToggleButton = ({
  name,
  paramByName,
  paramValues,
  setParam,
  accentColor
}) => {
  const p = paramByName.get(name);
  if (!p) return null;
  const val = paramValues.get(p.id) ?? p.defaultValue;
  const isOn = val > 0.5;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick: () => setParam(p.id, isOn ? 0 : 1),
      className: `px-2 py-1 text-[10px] font-bold rounded transition-all ${isOn ? "text-black" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover"}`,
      style: isOn ? { backgroundColor: accentColor } : {},
      children: isOn ? "ON" : "OFF"
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 497,
      columnNumber: 5
    },
    void 0
  );
};
const OtherParamsTab = ({
  allParams,
  paramValues,
  setParam,
  knobColor,
  accentColor,
  panelBg,
  panelStyle
}) => {
  const uncategorized = allParams.filter((p) => !isParamCategorized(p.name));
  if (uncategorized.length === 0) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-text-muted", children: "All parameters are shown in the categorized tabs." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 531,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 530,
      columnNumber: 7
    }, void 0);
  }
  const groups = /* @__PURE__ */ new Map();
  for (const p of uncategorized) {
    const prefix = p.name.split("_").slice(0, 2).join("_");
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(p);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-3 rounded-lg border ${panelBg}`, style: panelStyle, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted mb-1", children: [
      uncategorized.length,
      " additional parameters not shown in other tabs"
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 547,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 546,
      columnNumber: 7
    }, void 0),
    Array.from(groups.entries()).map(([prefix, params]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3", style: { color: accentColor }, children: prefix.replace(/_/g, " ") }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 553,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 justify-center", children: params.map((p) => {
        const shortLabel = p.name.replace(`${prefix}_`, "").replace(/_/g, " ");
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
            lineNumber: 560,
            columnNumber: 17
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
        lineNumber: 556,
        columnNumber: 11
      }, void 0)
    ] }, prefix, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
      lineNumber: 552,
      columnNumber: 9
    }, void 0))
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VitalControls.tsx",
    lineNumber: 545,
    columnNumber: 5
  }, void 0);
};
export {
  VitalControls
};
