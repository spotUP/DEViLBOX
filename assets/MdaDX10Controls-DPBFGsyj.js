import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { ci as DEFAULT_MDA_DX10, cj as DX10_PARAM_NAMES } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const PARAM_KEYS = [
  "attack",
  "decay",
  "release",
  "coarse",
  "fine",
  "modInit",
  "modDec",
  "modSus",
  "modRel",
  "modVel",
  "vibrato",
  "octave",
  "fineTune",
  "waveform",
  "modThru",
  "lfoRate"
];
function formatValue(key, value) {
  switch (key) {
    case "octave":
      return `${Math.round(4 * value - 2)}`;
    case "fineTune":
      return `${Math.round(200 * value - 100)} cent`;
    case "coarse": {
      const ratio = Math.floor(32 * value);
      return `Ratio ${ratio}`;
    }
    case "fine":
      return `+${(value * 100).toFixed(0)}%`;
    case "waveform":
      return value < 0.5 ? "Sine" : `Rich ${Math.round(200 * value - 100)}%`;
    default:
      return `${Math.round(100 * value)}%`;
  }
}
const GROUPS = [
  { label: "Carrier Envelope", keys: ["attack", "decay", "release"] },
  { label: "Modulator", keys: ["coarse", "fine", "modInit", "modDec", "modSus", "modRel", "modVel", "modThru"] },
  { label: "Pitch & Tone", keys: ["octave", "fineTune", "waveform"] },
  { label: "LFO", keys: ["vibrato", "lfoRate"] }
];
const MdaDX10Controls = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const merged = { ...DEFAULT_MDA_DX10, ...config };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4 text-xs", children: GROUPS.map((group) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-muted font-semibold mb-2 border-b border-dark-border pb-1", children: group.label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaDX10Controls.tsx",
      lineNumber: 57,
      columnNumber: 11
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2", children: group.keys.map((key) => {
      const idx = PARAM_KEYS.indexOf(key);
      const val = merged[key] ?? 0.5;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted truncate", title: DX10_PARAM_NAMES[idx], children: DX10_PARAM_NAMES[idx] }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaDX10Controls.tsx",
          lineNumber: 64,
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
            className: "w-full accent-orange-500 h-2"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaDX10Controls.tsx",
            lineNumber: 67,
            columnNumber: 19
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: formatValue(key, val) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaDX10Controls.tsx",
          lineNumber: 76,
          columnNumber: 19
        }, void 0)
      ] }, key, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaDX10Controls.tsx",
        lineNumber: 63,
        columnNumber: 17
      }, void 0);
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaDX10Controls.tsx",
      lineNumber: 58,
      columnNumber: 11
    }, void 0)
  ] }, group.label, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaDX10Controls.tsx",
    lineNumber: 56,
    columnNumber: 9
  }, void 0)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MdaDX10Controls.tsx",
    lineNumber: 53,
    columnNumber: 5
  }, void 0);
};
export {
  MdaDX10Controls
};
