import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob, cu as DEFAULT_TAL_NOIZEMAKER } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SelectControl } from "./SelectControl-BYIQjTvW.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const OSC_WAVE_NAMES = ["Saw", "Pulse", "Noise", "Triangle", "Sine"];
const FILTER_TYPE_NAMES = ["LP24", "LP12", "HP", "BP"];
const LFO_WAVE_NAMES = ["Tri", "Saw", "Square", "S&H", "Sine"];
const LFO_DEST_NAMES = ["Filter", "Osc", "PW", "Pan"];
const FREE_AD_DEST_NAMES = ["Filter", "Osc", "PW", "Pan"];
const SectionHeader = ({ title }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-muted font-semibold mb-2 border-b border-dark-border pb-1", children: title }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
  lineNumber: 25,
  columnNumber: 3
}, void 0);
const ToggleButton = ({ label, value, onChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    className: `px-2 py-0.5 rounded text-[10px] ${value > 0.5 ? "bg-green-700 text-white" : "bg-gray-700 text-text-muted"}`,
    onClick: () => onChange(value > 0.5 ? 0 : 1),
    children: [
      label,
      ": ",
      value > 0.5 ? "ON" : "OFF"
    ]
  },
  void 0,
  true,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
    lineNumber: 32,
    columnNumber: 3
  },
  void 0
);
const TalNoizeMakerControls = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const update = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const m = { ...DEFAULT_TAL_NOIZEMAKER, ...config };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4 text-xs", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: "Oscillators" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 53,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded bg-[#1a2a1a]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted font-semibold text-[11px]", children: "OSC 1" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 57,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1 items-end", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Volume", value: m.osc1Volume, min: 0, max: 1, color: "#4ade80", onChange: (v) => update("osc1Volume", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 59,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Tune", value: m.osc1Tune, min: 0, max: 1, color: "#facc15", bipolar: true, onChange: (v) => update("osc1Tune", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 60,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Fine", value: m.osc1FineTune, min: 0, max: 1, color: "#facc15", bipolar: true, onChange: (v) => update("osc1FineTune", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 61,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "PW", value: m.osc1PW, min: 0, max: 1, color: "#60a5fa", onChange: (v) => update("osc1PW", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 62,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Phase", value: m.osc1Phase, min: 0, max: 1, color: "#818cf8", onChange: (v) => update("osc1Phase", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 63,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectControl, { label: "Wave", value: m.osc1Waveform, options: OSC_WAVE_NAMES, onChange: (v) => update("osc1Waveform", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 64,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "Sync", value: m.oscSync, onChange: (v) => update("oscSync", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 65,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 58,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 56,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded bg-[#1a2a1a]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted font-semibold text-[11px]", children: "OSC 2" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 71,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1 items-end", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Volume", value: m.osc2Volume, min: 0, max: 1, color: "#4ade80", onChange: (v) => update("osc2Volume", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 73,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Tune", value: m.osc2Tune, min: 0, max: 1, color: "#facc15", bipolar: true, onChange: (v) => update("osc2Tune", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 74,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Fine", value: m.osc2FineTune, min: 0, max: 1, color: "#facc15", bipolar: true, onChange: (v) => update("osc2FineTune", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 75,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Phase", value: m.osc2Phase, min: 0, max: 1, color: "#818cf8", onChange: (v) => update("osc2Phase", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 76,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "FM", value: m.osc2FM, min: 0, max: 1, color: "#f472b6", onChange: (v) => update("osc2FM", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 77,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectControl, { label: "Wave", value: m.osc2Waveform, options: OSC_WAVE_NAMES, onChange: (v) => update("osc2Waveform", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 78,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 72,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 70,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 54,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 mt-2 items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Osc 3 Vol", value: m.osc3Volume, min: 0, max: 1, color: "#4ade80", onChange: (v) => update("osc3Volume", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 85,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Master Tune", value: m.masterTune, min: 0, max: 1, color: "#facc15", bipolar: true, onChange: (v) => update("masterTune", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 86,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Ring Mod", value: m.ringModulation, min: 0, max: 1, color: "#f97316", onChange: (v) => update("ringModulation", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 87,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Transpose", value: m.transpose, min: 0, max: 1, color: "#facc15", bipolar: true, onChange: (v) => update("transpose", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 88,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Vintage Noise", value: m.vintageNoise, min: 0, max: 1, color: "#94a3b8", onChange: (v) => update("vintageNoise", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 89,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 84,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
      lineNumber: 52,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: "Filter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 95,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Cutoff", value: m.cutoff, min: 0, max: 1, color: "#a855f7", onChange: (v) => update("cutoff", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 97,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Reso", value: m.resonance, min: 0, max: 1, color: "#a855f7", onChange: (v) => update("resonance", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 98,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Drive", value: m.filterDrive, min: 0, max: 1, color: "#ef4444", onChange: (v) => update("filterDrive", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 99,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Key Follow", value: m.keyFollow, min: 0, max: 1, color: "#818cf8", onChange: (v) => update("keyFollow", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 100,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Contour", value: m.filterContour, min: 0, max: 1, color: "#c084fc", onChange: (v) => update("filterContour", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 101,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Vel Cutoff", value: m.velocityCutoff, min: 0, max: 1, color: "#c084fc", onChange: (v) => update("velocityCutoff", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 102,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "High Pass", value: m.highPass, min: 0, max: 1, color: "#a855f7", onChange: (v) => update("highPass", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 103,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectControl, { label: "Type", value: m.filterType, options: FILTER_TYPE_NAMES, onChange: (v) => update("filterType", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 104,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 96,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
      lineNumber: 94,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: "Envelopes" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 110,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded bg-[#1a1a2a]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted font-semibold text-[11px]", children: "AMP" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 114,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1 items-end", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "A", value: m.ampAttack, min: 0, max: 1, color: "#ef4444", onChange: (v) => update("ampAttack", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 116,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "D", value: m.ampDecay, min: 0, max: 1, color: "#ef4444", onChange: (v) => update("ampDecay", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 117,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "S", value: m.ampSustain, min: 0, max: 1, color: "#ef4444", onChange: (v) => update("ampSustain", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 118,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "R", value: m.ampRelease, min: 0, max: 1, color: "#ef4444", onChange: (v) => update("ampRelease", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 119,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Vel", value: m.velocityVolume, min: 0, max: 1, color: "#f87171", onChange: (v) => update("velocityVolume", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 120,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 115,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 113,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded bg-[#2a1a2a]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted font-semibold text-[11px]", children: "FILTER" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 126,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1 items-end", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "A", value: m.filterAttack, min: 0, max: 1, color: "#a855f7", onChange: (v) => update("filterAttack", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 128,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "D", value: m.filterDecay, min: 0, max: 1, color: "#a855f7", onChange: (v) => update("filterDecay", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 129,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "S", value: m.filterSustain, min: 0, max: 1, color: "#a855f7", onChange: (v) => update("filterSustain", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 130,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "R", value: m.filterRelease, min: 0, max: 1, color: "#a855f7", onChange: (v) => update("filterRelease", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 131,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Vel Cont", value: m.velocityContour, min: 0, max: 1, color: "#c084fc", onChange: (v) => update("velocityContour", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 132,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 127,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 125,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 111,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded bg-[#2a1a1a] mt-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted font-semibold text-[11px]", children: "FREE AD" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 139,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "A", value: m.freeAdAttack, min: 0, max: 1, color: "#f97316", onChange: (v) => update("freeAdAttack", v) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 141,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "D", value: m.freeAdDecay, min: 0, max: 1, color: "#f97316", onChange: (v) => update("freeAdDecay", v) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 142,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Amount", value: m.freeAdAmount, min: 0, max: 1, color: "#f97316", onChange: (v) => update("freeAdAmount", v) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 143,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectControl, { label: "Dest", value: m.freeAdDestination, options: FREE_AD_DEST_NAMES, onChange: (v) => update("freeAdDestination", v) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 144,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 140,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 138,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
      lineNumber: 109,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: "LFOs" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 151,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded bg-[#1a2a2a]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted font-semibold text-[11px]", children: "LFO 1" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 155,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1 items-end", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Rate", value: m.lfo1Rate, min: 0, max: 1, color: "#22d3ee", onChange: (v) => update("lfo1Rate", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 157,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectControl, { label: "Wave", value: m.lfo1Waveform, options: LFO_WAVE_NAMES, onChange: (v) => update("lfo1Waveform", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 158,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Amount", value: m.lfo1Amount, min: 0, max: 1, color: "#22d3ee", onChange: (v) => update("lfo1Amount", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 159,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectControl, { label: "Dest", value: m.lfo1Destination, options: LFO_DEST_NAMES, onChange: (v) => update("lfo1Destination", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 160,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Phase", value: m.lfo1Phase, min: 0, max: 1, color: "#67e8f9", onChange: (v) => update("lfo1Phase", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 161,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "Sync", value: m.lfo1Sync, onChange: (v) => update("lfo1Sync", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 162,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "Key Trig", value: m.lfo1KeyTrigger, onChange: (v) => update("lfo1KeyTrigger", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 163,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 156,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 154,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded bg-[#1a2a2a]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted font-semibold text-[11px]", children: "LFO 2" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 169,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1 items-end", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Rate", value: m.lfo2Rate, min: 0, max: 1, color: "#2dd4bf", onChange: (v) => update("lfo2Rate", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 171,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectControl, { label: "Wave", value: m.lfo2Waveform, options: LFO_WAVE_NAMES, onChange: (v) => update("lfo2Waveform", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 172,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Amount", value: m.lfo2Amount, min: 0, max: 1, color: "#2dd4bf", onChange: (v) => update("lfo2Amount", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 173,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectControl, { label: "Dest", value: m.lfo2Destination, options: LFO_DEST_NAMES, onChange: (v) => update("lfo2Destination", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 174,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Phase", value: m.lfo2Phase, min: 0, max: 1, color: "#5eead4", onChange: (v) => update("lfo2Phase", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 175,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "Sync", value: m.lfo2Sync, onChange: (v) => update("lfo2Sync", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 176,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "Key Trig", value: m.lfo2KeyTrigger, onChange: (v) => update("lfo2KeyTrigger", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 177,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 170,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 168,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 152,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
      lineNumber: 150,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: "Effects" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 185,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded bg-[#1a1a2a]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted font-semibold text-[11px]", children: "CHORUS" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 189,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1 items-end", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "Chorus 1", value: m.chorus1Enable, onChange: (v) => update("chorus1Enable", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 191,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "Chorus 2", value: m.chorus2Enable, onChange: (v) => update("chorus2Enable", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 192,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 190,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 188,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded bg-[#1a1a2a]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted font-semibold text-[11px]", children: "REVERB" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 198,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1 items-end", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Wet", value: m.reverbWet, min: 0, max: 1, color: "#c084fc", onChange: (v) => update("reverbWet", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 200,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Decay", value: m.reverbDecay, min: 0, max: 1, color: "#c084fc", onChange: (v) => update("reverbDecay", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 201,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Pre-Dly", value: m.reverbPreDelay, min: 0, max: 1, color: "#c084fc", onChange: (v) => update("reverbPreDelay", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 202,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Hi Cut", value: m.reverbHighCut, min: 0, max: 1, color: "#c084fc", onChange: (v) => update("reverbHighCut", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 203,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Lo Cut", value: m.reverbLowCut, min: 0, max: 1, color: "#c084fc", onChange: (v) => update("reverbLowCut", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 204,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 199,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 197,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded bg-[#1a1a2a]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted font-semibold text-[11px]", children: "DELAY" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 210,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1 items-end", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Wet", value: m.delayWet, min: 0, max: 1, color: "#fb923c", onChange: (v) => update("delayWet", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 212,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Time", value: m.delayTime, min: 0, max: 1, color: "#fb923c", onChange: (v) => update("delayTime", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 213,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Feedback", value: m.delayFeedback, min: 0, max: 1, color: "#fb923c", onChange: (v) => update("delayFeedback", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 214,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "Sync", value: m.delaySync, onChange: (v) => update("delaySync", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 215,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Factor L", value: m.delayFactorL, min: 0, max: 1, color: "#fb923c", onChange: (v) => update("delayFactorL", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 216,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Factor R", value: m.delayFactorR, min: 0, max: 1, color: "#fb923c", onChange: (v) => update("delayFactorR", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 217,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Hi Shelf", value: m.delayHighShelf, min: 0, max: 1, color: "#fb923c", onChange: (v) => update("delayHighShelf", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 218,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Lo Shelf", value: m.delayLowShelf, min: 0, max: 1, color: "#fb923c", onChange: (v) => update("delayLowShelf", v) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
              lineNumber: 219,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 211,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 209,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 186,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
      lineNumber: 184,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: "Performance" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 227,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Volume", value: m.volume, min: 0, max: 1, color: "#4ade80", onChange: (v) => update("volume", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 229,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Porta", value: m.portamento, min: 0, max: 1, color: "#60a5fa", onChange: (v) => update("portamento", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 230,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectControl, { label: "Porta Mode", value: m.portamentoMode, options: ["Auto", "Always"], onChange: (v) => update("portamentoMode", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 231,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Voices",
            value: m.voices,
            min: 0,
            max: 1,
            color: "#e2e8f0",
            formatValue: (v) => String(Math.max(1, Math.round(v * 15) + 1)),
            onChange: (v) => update("voices", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 232,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "PB Pitch",
            value: m.pitchwheelPitch,
            min: 0,
            max: 1,
            color: "#facc15",
            formatValue: (v) => String(Math.round(v * 24)),
            onChange: (v) => update("pitchwheelPitch", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
            lineNumber: 235,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "PB Cutoff", value: m.pitchwheelCutoff, min: 0, max: 1, color: "#facc15", onChange: (v) => update("pitchwheelCutoff", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 238,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Detune", value: m.detune, min: 0, max: 1, color: "#f472b6", onChange: (v) => update("detune", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 239,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Bitcrusher", value: m.oscBitcrusher, min: 0, max: 1, color: "#f97316", onChange: (v) => update("oscBitcrusher", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
          lineNumber: 240,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
        lineNumber: 228,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
      lineNumber: 226,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TalNoizeMakerControls.tsx",
    lineNumber: 50,
    columnNumber: 5
  }, void 0);
};
export {
  TalNoizeMakerControls,
  TalNoizeMakerControls as default
};
