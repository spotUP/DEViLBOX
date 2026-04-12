import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { ce as DEFAULT_MDA_EPIANO, cf as EPIANO_PARAM_NAMES } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const PARAM_KEYS = [
  "envelopeDecay",
  "envelopeRelease",
  "hardness",
  "trebleBoost",
  "modulation",
  "lfoRate",
  "velocitySense",
  "stereoWidth",
  "polyphony",
  "fineTuning",
  "randomTuning",
  "overdrive"
];
function formatValue(key, value) {
  switch (key) {
    case "modulation":
      return value > 0.5 ? `Trem ${Math.round(200 * value - 100)}%` : `Pan ${Math.round(100 - 200 * value)}%`;
    case "lfoRate":
      return `${Math.exp(6.22 * value - 2.61).toFixed(2)} Hz`;
    case "stereoWidth":
      return `${Math.round(200 * value)}%`;
    case "polyphony":
      return `${1 + Math.floor(31 * value)} voices`;
    case "fineTuning":
      return `${Math.round(100 * value - 50)} cents`;
    case "randomTuning":
      return `${(50 * value * value).toFixed(1)} cents`;
    case "overdrive":
      return `${Math.round(100 * value)}%`;
    case "hardness":
    case "trebleBoost":
      return `${Math.round(100 * value - 50)}%`;
    default:
      return `${Math.round(100 * value)}%`;
  }
}
const MdaEPianoControls = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const fullConfig = { ...DEFAULT_MDA_EPIANO, ...config };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-ft2-border p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-ft2-highlight text-xs mb-2 font-bold", children: "Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
        lineNumber: 62,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: ["envelopeDecay", "envelopeRelease"].map((key, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        ParamSlider,
        {
          label: EPIANO_PARAM_NAMES[i],
          value: fullConfig[key] ?? 0.5,
          displayValue: formatValue(key, fullConfig[key] ?? 0.5),
          onChange: (v) => updateParam(key, v)
        },
        key,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
          lineNumber: 65,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
        lineNumber: 63,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
      lineNumber: 61,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-ft2-border p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-ft2-highlight text-xs mb-2 font-bold", children: "Tone" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
        lineNumber: 77,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: ["hardness", "trebleBoost", "overdrive", "velocitySense"].map((key) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        ParamSlider,
        {
          label: EPIANO_PARAM_NAMES[PARAM_KEYS.indexOf(key)],
          value: fullConfig[key] ?? 0.5,
          displayValue: formatValue(key, fullConfig[key] ?? 0.5),
          onChange: (v) => updateParam(key, v)
        },
        key,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
          lineNumber: 80,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
        lineNumber: 78,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
      lineNumber: 76,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-ft2-border p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-ft2-highlight text-xs mb-2 font-bold", children: "Modulation" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
        lineNumber: 92,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: ["modulation", "lfoRate"].map((key) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        ParamSlider,
        {
          label: EPIANO_PARAM_NAMES[PARAM_KEYS.indexOf(key)],
          value: fullConfig[key] ?? 0.5,
          displayValue: formatValue(key, fullConfig[key] ?? 0.5),
          onChange: (v) => updateParam(key, v)
        },
        key,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
          lineNumber: 95,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
        lineNumber: 93,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
      lineNumber: 91,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-ft2-border p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-ft2-highlight text-xs mb-2 font-bold", children: "Stereo & Tuning" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
        lineNumber: 107,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: ["stereoWidth", "fineTuning", "randomTuning", "polyphony"].map((key) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        ParamSlider,
        {
          label: EPIANO_PARAM_NAMES[PARAM_KEYS.indexOf(key)],
          value: fullConfig[key] ?? 0.5,
          displayValue: formatValue(key, fullConfig[key] ?? 0.5),
          onChange: (v) => updateParam(key, v)
        },
        key,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
          lineNumber: 110,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
        lineNumber: 108,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
      lineNumber: 106,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
    lineNumber: 59,
    columnNumber: 5
  }, void 0);
};
const ParamSlider = ({ label, value, displayValue, onChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between text-xs", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-textDim", children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
      lineNumber: 133,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-text font-mono", children: displayValue }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
      lineNumber: 134,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
    lineNumber: 132,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "input",
    {
      type: "range",
      min: 0,
      max: 1,
      step: 1e-3,
      value,
      onChange: (e) => onChange(parseFloat(e.target.value)),
      className: "w-full h-2 bg-ft2-bg rounded appearance-none cursor-pointer accent-ft2-highlight"
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
      lineNumber: 136,
      columnNumber: 5
    },
    void 0
  )
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaEPianoControls.tsx",
  lineNumber: 131,
  columnNumber: 3
}, void 0);
export {
  MdaEPianoControls
};
