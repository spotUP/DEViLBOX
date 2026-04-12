import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cg as DEFAULT_MDA_JX10, ch as JX10_PARAM_NAMES } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const PARAM_KEYS = [
  "oscMix",
  "oscTune",
  "oscFine",
  "glide",
  "glideRate",
  "glideBend",
  "vcfFreq",
  "vcfReso",
  "vcfEnv",
  "vcfLfo",
  "vcfVel",
  "vcfAtt",
  "vcfDec",
  "vcfSus",
  "vcfRel",
  "envAtt",
  "envDec",
  "envSus",
  "envRel",
  "lfoRate",
  "vibrato",
  "noise",
  "octave",
  "tuning"
];
function formatGlideMode(v) {
  if (v < 0.17) return "Poly";
  if (v < 0.33) return "P-Legato";
  if (v < 0.5) return "P-Glide";
  if (v < 0.67) return "Mono";
  if (v < 0.83) return "M-Legato";
  return "M-Glide";
}
function formatValue(key, value) {
  switch (key) {
    case "oscMix":
      return `${Math.round(100 * value)}% Osc2`;
    case "oscTune":
      return `${Math.round(48 * value - 24)} semi`;
    case "oscFine":
      return `${Math.round(200 * value - 100)} cent`;
    case "glide":
      return formatGlideMode(value);
    case "glideRate":
      return `${Math.round(100 * value)}%`;
    case "glideBend":
      return `${Math.round(100 * value - 50)}%`;
    case "octave":
      return `${Math.round(4 * value - 2)}`;
    case "tuning":
      return `${Math.round(200 * value - 100)} cent`;
    default:
      return `${Math.round(100 * value)}%`;
  }
}
const GROUPS = [
  { label: "Oscillators", keys: ["oscMix", "oscTune", "oscFine", "noise", "octave", "tuning"] },
  { label: "Glide", keys: ["glide", "glideRate", "glideBend"] },
  { label: "Filter (VCF)", keys: ["vcfFreq", "vcfReso", "vcfEnv", "vcfLfo", "vcfVel"] },
  { label: "Filter Envelope", keys: ["vcfAtt", "vcfDec", "vcfSus", "vcfRel"] },
  { label: "Amp Envelope", keys: ["envAtt", "envDec", "envSus", "envRel"] },
  { label: "Modulation", keys: ["lfoRate", "vibrato"] }
];
const MdaJX10Controls = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const merged = { ...DEFAULT_MDA_JX10, ...config };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4 text-xs", children: GROUPS.map((group) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-muted font-semibold mb-2 border-b border-dark-border pb-1", children: group.label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaJX10Controls.tsx",
      lineNumber: 70,
      columnNumber: 11
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2", children: group.keys.map((key) => {
      const idx = PARAM_KEYS.indexOf(key);
      const val = merged[key] ?? 0.5;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted truncate", title: JX10_PARAM_NAMES[idx], children: JX10_PARAM_NAMES[idx] }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaJX10Controls.tsx",
          lineNumber: 77,
          columnNumber: 19
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "range",
            min: 0,
            max: 1,
            step: 1e-3,
            value: val,
            onChange: (e) => updateParam(key, parseFloat(e.target.value)),
            className: "w-full accent-blue-500 h-2"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaJX10Controls.tsx",
            lineNumber: 80,
            columnNumber: 19
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: formatValue(key, val) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaJX10Controls.tsx",
          lineNumber: 89,
          columnNumber: 19
        }, void 0)
      ] }, key, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaJX10Controls.tsx",
        lineNumber: 76,
        columnNumber: 17
      }, void 0);
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaJX10Controls.tsx",
      lineNumber: 71,
      columnNumber: 11
    }, void 0)
  ] }, group.label, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaJX10Controls.tsx",
    lineNumber: 69,
    columnNumber: 9
  }, void 0)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaJX10Controls.tsx",
    lineNumber: 66,
    columnNumber: 5
  }, void 0);
};
export {
  MdaJX10Controls
};
