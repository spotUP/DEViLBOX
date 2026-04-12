import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cv as DEFAULT_AEOLUS, aB as Knob } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const GREAT_STOPS = [
  { key: "greatStop0", label: "Principal 8'" },
  { key: "greatStop1", label: "Octave 4'" },
  { key: "greatStop2", label: "Fifteenth 2'" },
  { key: "greatStop3", label: "Mixture" },
  { key: "greatStop4", label: "Flute 8'" },
  { key: "greatStop5", label: "Bourdon 16'" },
  { key: "greatStop6", label: "Trumpet 8'" },
  { key: "greatStop7", label: "Clarion 4'" }
];
const SWELL_STOPS = [
  { key: "swellStop0", label: "Gedackt 8'" },
  { key: "swellStop1", label: "Salicional 8'" },
  { key: "swellStop2", label: "Voix Celeste" },
  { key: "swellStop3", label: "Oboe 8'" },
  { key: "swellStop4", label: "Gemshorn 4'" },
  { key: "swellStop5", label: "Rohrflöte 4'" },
  { key: "swellStop6", label: "Trompette 8'" },
  { key: "swellStop7", label: "Clairon 4'" }
];
const PEDAL_STOPS = [
  { key: "pedalStop0", label: "Subbass 16'" },
  { key: "pedalStop1", label: "Principal 8'" },
  { key: "pedalStop2", label: "Trompete 8'" },
  { key: "pedalStop3", label: "Octave 4'" },
  { key: "pedalStop4", label: "Bourdon 8'" }
];
const StopToggle = ({ label, active, onChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    className: `px-3 py-1.5 rounded text-xs font-bold uppercase transition-all ${active ? "bg-amber-600 text-white shadow-lg shadow-amber-900/40" : "bg-[#222] text-text-muted hover:text-text-secondary"}`,
    onClick: () => onChange(!active),
    children: label
  },
  void 0,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
    lineNumber: 49,
    columnNumber: 3
  },
  void 0
);
const StopBank = ({ title, stops, config, onUpdate }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-2 text-amber-500", children: title }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
    lineNumber: 65,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2", children: stops.map((s) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    StopToggle,
    {
      label: s.label,
      active: config[s.key] === 1,
      onChange: (on) => onUpdate(s.key, on ? 1 : 0)
    },
    s.key,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
      lineNumber: 68,
      columnNumber: 9
    },
    void 0
  )) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
    lineNumber: 66,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
  lineNumber: 64,
  columnNumber: 3
}, void 0);
const AeolusControls = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const merged = { ...DEFAULT_AEOLUS, ...config };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-4 max-w-2xl mx-auto", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StopBank, { title: "Great", stops: GREAT_STOPS, config: merged, onUpdate: updateParam }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
      lineNumber: 87,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StopBank, { title: "Swell", stops: SWELL_STOPS, config: merged, onUpdate: updateParam }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
      lineNumber: 88,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StopBank, { title: "Pedal", stops: PEDAL_STOPS, config: merged, onUpdate: updateParam }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
      lineNumber: 89,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-2 text-amber-500", children: "Couplers" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
        lineNumber: 93,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          StopToggle,
          {
            label: "Swell→Great",
            active: merged.couplerSwellGreat === 1,
            onChange: (on) => updateParam("couplerSwellGreat", on ? 1 : 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 95,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          StopToggle,
          {
            label: "Great→Pedal",
            active: merged.couplerGreatPedal === 1,
            onChange: (on) => updateParam("couplerGreatPedal", on ? 1 : 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 97,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          StopToggle,
          {
            label: "Swell→Pedal",
            active: merged.couplerSwellPedal === 1,
            onChange: (on) => updateParam("couplerSwellPedal", on ? 1 : 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 99,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          StopToggle,
          {
            label: "Swell 16'",
            active: merged.couplerSwellOctave === 1,
            onChange: (on) => updateParam("couplerSwellOctave", on ? 1 : 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 101,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
        lineNumber: 94,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
      lineNumber: 92,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-2 text-amber-500", children: "Tremulant" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
        lineNumber: 108,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 items-center justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          StopToggle,
          {
            label: "Enable",
            active: merged.tremulantOn === 1,
            onChange: (on) => updateParam("tremulantOn", on ? 1 : 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 110,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Speed",
            value: merged.tremulantSpeed ?? 0.5,
            min: 0,
            max: 1,
            defaultValue: 0.5,
            onChange: (v) => updateParam("tremulantSpeed", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 112,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Depth",
            value: merged.tremulantDepth ?? 0.5,
            min: 0,
            max: 1,
            defaultValue: 0.5,
            onChange: (v) => updateParam("tremulantDepth", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 114,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
        lineNumber: 109,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
      lineNumber: 107,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-2 text-amber-500", children: "Reverb" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
        lineNumber: 121,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Amount",
            value: merged.reverbAmount ?? 0.3,
            min: 0,
            max: 1,
            defaultValue: 0.3,
            onChange: (v) => updateParam("reverbAmount", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 123,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Size",
            value: merged.reverbSize ?? 0.5,
            min: 0,
            max: 1,
            defaultValue: 0.5,
            onChange: (v) => updateParam("reverbSize", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 125,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
        lineNumber: 122,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
      lineNumber: 120,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-2 text-amber-500", children: "Master" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
        lineNumber: 132,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Volume",
            value: merged.volume ?? 0.8,
            min: 0,
            max: 1,
            defaultValue: 0.8,
            onChange: (v) => updateParam("volume", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 134,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Tuning",
            value: merged.tuning ?? 440,
            min: 415,
            max: 466,
            defaultValue: 440,
            onChange: (v) => updateParam("tuning", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 136,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Wind",
            value: merged.windPressure ?? 0.5,
            min: 0,
            max: 1,
            defaultValue: 0.5,
            onChange: (v) => updateParam("windPressure", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 138,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Swell Expr",
            value: merged.swellExpression ?? 0.7,
            min: 0,
            max: 1,
            defaultValue: 0.7,
            onChange: (v) => updateParam("swellExpression", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 140,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Great Expr",
            value: merged.greatExpression ?? 1,
            min: 0,
            max: 1,
            defaultValue: 1,
            onChange: (v) => updateParam("greatExpression", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
            lineNumber: 142,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
        lineNumber: 133,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
      lineNumber: 131,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AeolusControls.tsx",
    lineNumber: 86,
    columnNumber: 5
  }, void 0);
};
export {
  AeolusControls,
  AeolusControls as default
};
