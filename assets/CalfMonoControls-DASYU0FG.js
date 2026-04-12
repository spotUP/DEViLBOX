import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { co as DEFAULT_CALF_MONO, W as CustomSelect } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const WAVE_NAMES = [
  "Saw",
  "Square",
  "Pulse",
  "Sine",
  "Triangle",
  "Varistep",
  "Skew Saw",
  "Skew Sqr",
  "Var Tri",
  "Super Saw",
  "Super Sqr",
  "Super Sine",
  "Brass",
  "Reed",
  "Organ",
  "Noise"
];
const FILTER_NAMES = [
  "LP 12dB",
  "LP 24dB",
  "2×LP 12dB",
  "HP 12dB",
  "LP+Notch",
  "HP+Notch",
  "BP 6dB",
  "2×BP 6dB"
];
const PHASE_NAMES = ["Free", "On Note", "Random", "Sync", "Phase 4", "Phase 5"];
const LEGATO_NAMES = ["Off", "On", "Retrig", "Fing"];
const MIDI_CH_NAMES = ["All", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"];
const TRIG_NAMES = ["Free", "Retrigger"];
const Sl = ({ label, value, min, max, step, onChange, cls, fmt }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
    lineNumber: 39,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "input",
    {
      type: "range",
      min,
      max,
      step,
      value,
      onChange: (e) => onChange(parseFloat(e.target.value)),
      className: `w-full h-2 ${cls}`
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 40,
      columnNumber: 5
    },
    void 0
  ),
  fmt && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: fmt(value) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
    lineNumber: 43,
    columnNumber: 13
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
  lineNumber: 38,
  columnNumber: 3
}, void 0);
const Sel = ({ label, value, options, onChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
    lineNumber: 51,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    CustomSelect,
    {
      value: String(Math.round(value)),
      onChange: (v) => onChange(parseInt(v)),
      options: options.map((n, i) => ({ value: String(i), label: n })),
      className: "bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]"
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 52,
      columnNumber: 5
    },
    void 0
  )
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
  lineNumber: 50,
  columnNumber: 3
}, void 0);
const Tog = ({ label, value, onChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
    lineNumber: 65,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      className: `px-2 py-0.5 rounded text-[10px] ${value ? "bg-green-700 text-white" : "bg-gray-700 text-text-muted"}`,
      onClick: () => onChange(value ? 0 : 1),
      children: value ? "ON" : "OFF"
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 66,
      columnNumber: 5
    },
    void 0
  )
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
  lineNumber: 64,
  columnNumber: 3
}, void 0);
const Section = ({ title, children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-muted font-semibold mb-2 border-b border-dark-border pb-1", children: title }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
    lineNumber: 75,
    columnNumber: 5
  }, void 0),
  children
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
  lineNumber: 74,
  columnNumber: 3
}, void 0);
const CalfMonoControls = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const update = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const m = { ...DEFAULT_CALF_MONO, ...config };
  const sl = (key, label, min, max, step, cls, fmt) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Sl,
    {
      label,
      value: m[key],
      min,
      max,
      step,
      onChange: (v) => update(key, v),
      cls,
      fmt
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 93,
      columnNumber: 5
    },
    void 0
  );
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4 text-xs", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Oscillators", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sel, { label: "Osc1 Wave", value: m.o1Wave, options: WAVE_NAMES, onChange: (v) => update("o1Wave", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
          lineNumber: 102,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sel, { label: "Osc2 Wave", value: m.o2Wave, options: WAVE_NAMES, onChange: (v) => update("o2Wave", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
          lineNumber: 103,
          columnNumber: 11
        }, void 0),
        sl("o1Pw", "PW 1", -1, 1, 0.01, "accent-green-500"),
        sl("o2Pw", "PW 2", -1, 1, 0.01, "accent-green-500")
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 101,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2", children: [
        sl("o1Xpose", "Transpose 1", -24, 24, 1, "accent-green-500", (v) => `${v} semi`),
        sl("o2Xpose", "Transpose 2", -24, 24, 1, "accent-green-500", (v) => `${v} semi`),
        sl("o1Stretch", "Stretch", 1, 16, 1, "accent-green-500"),
        sl("o1Window", "Window", 0, 1, 0.01, "accent-green-500")
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 107,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2", children: [
        sl("o12Detune", "Detune", 0, 100, 0.1, "accent-green-500", (v) => `${v.toFixed(1)} ct`),
        sl("scaleDetune", "Scale Detune", 0, 1, 0.01, "accent-green-500"),
        sl("o2Unison", "Unison", 0, 1, 0.01, "accent-green-500"),
        sl("o2UnisonFrq", "Unison Freq", 0.01, 20, 0.01, "accent-green-500", (v) => `${v.toFixed(2)} Hz`)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 113,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2 mt-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sel, { label: "Phase Mode", value: m.phaseMode, options: PHASE_NAMES, onChange: (v) => update("phaseMode", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
          lineNumber: 120,
          columnNumber: 11
        }, void 0),
        sl("o12Mix", "Mix", 0, 1, 0.01, "accent-green-500", (v) => `${Math.round(v * 100)}%`)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 119,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 100,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Filter", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sel, { label: "Type", value: m.filter, options: FILTER_NAMES, onChange: (v) => update("filter", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
          lineNumber: 128,
          columnNumber: 11
        }, void 0),
        sl("cutoff", "Cutoff", 10, 16e3, 1, "accent-purple-500", (v) => `${Math.round(v)} Hz`),
        sl("res", "Resonance", 0.7, 8, 0.01, "accent-purple-500", (v) => v.toFixed(2))
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 127,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2 mt-2", children: [
        sl("filterSep", "Separation", -2400, 2400, 1, "accent-purple-500", (v) => `${Math.round(v)} ct`),
        sl("keyFollow", "Key Follow", 0, 2, 0.01, "accent-purple-500", (v) => v.toFixed(2))
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 132,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 126,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Envelope 1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 sm:grid-cols-5 gap-2", children: [
        sl("adsrA", "Attack", 1, 2e4, 1, "accent-red-500", (v) => `${Math.round(v)} ms`),
        sl("adsrD", "Decay", 10, 2e4, 1, "accent-red-500", (v) => `${Math.round(v)} ms`),
        sl("adsrS", "Sustain", 0, 1, 0.01, "accent-red-500", (v) => `${Math.round(v * 100)}%`),
        sl("adsrF", "Fade", -1e4, 1e4, 1, "accent-red-500", (v) => `${Math.round(v)} ms`),
        sl("adsrR", "Release", 10, 2e4, 1, "accent-red-500", (v) => `${Math.round(v)} ms`)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 140,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-2 mt-2", children: [
        sl("env2cutoff", "→Cutoff", -10800, 10800, 1, "accent-red-500", (v) => `${Math.round(v)} ct`),
        sl("env2res", "→Resonance", 0, 1, 0.01, "accent-red-500"),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Tog, { label: "→Amp", value: m.env2amp, onChange: (v) => update("env2amp", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
          lineNumber: 150,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 147,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 139,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Envelope 2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 sm:grid-cols-5 gap-2", children: [
        sl("adsr2A", "Attack", 1, 2e4, 1, "accent-orange-500", (v) => `${Math.round(v)} ms`),
        sl("adsr2D", "Decay", 10, 2e4, 1, "accent-orange-500", (v) => `${Math.round(v)} ms`),
        sl("adsr2S", "Sustain", 0, 1, 0.01, "accent-orange-500", (v) => `${Math.round(v * 100)}%`),
        sl("adsr2F", "Fade", -1e4, 1e4, 1, "accent-orange-500", (v) => `${Math.round(v)} ms`),
        sl("adsr2R", "Release", 10, 2e4, 1, "accent-orange-500", (v) => `${Math.round(v)} ms`)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 156,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-2 mt-2", children: [
        sl("adsr2Cutoff", "→Cutoff", -10800, 10800, 1, "accent-orange-500", (v) => `${Math.round(v)} ct`),
        sl("adsr2Res", "→Resonance", 0, 1, 0.01, "accent-orange-500"),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Tog, { label: "→Amp", value: m.adsr2Amp, onChange: (v) => update("adsr2Amp", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
          lineNumber: 166,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 163,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 155,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "LFO 1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-2", children: [
        sl("lfoRate", "Rate", 0.01, 20, 0.01, "accent-cyan-500", (v) => `${v.toFixed(2)} Hz`),
        sl("lfoDelay", "Delay", 0, 5, 0.01, "accent-cyan-500", (v) => `${v.toFixed(2)} s`),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sel, { label: "Trigger", value: m.lfo1Trig, options: TRIG_NAMES, onChange: (v) => update("lfo1Trig", v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
          lineNumber: 175,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 172,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2", children: [
        sl("lfo2filter", "→Filter", -4800, 4800, 1, "accent-cyan-500", (v) => `${Math.round(v)} ct`),
        sl("lfo2pitch", "→Pitch", 0, 1200, 1, "accent-cyan-500", (v) => `${Math.round(v)} ct`),
        sl("lfo2pw", "→PW", 0, 1, 0.01, "accent-cyan-500"),
        sl("mwhl2lfo", "ModWheel", 0, 1, 0.01, "accent-cyan-500")
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 177,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 171,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "LFO 2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-2", children: [
      sl("lfo2Rate", "Rate", 0.01, 20, 0.01, "accent-sky-500", (v) => `${v.toFixed(2)} Hz`),
      sl("lfo2Delay", "Delay", 0.1, 5, 0.01, "accent-sky-500", (v) => `${v.toFixed(2)} s`),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sel, { label: "Trigger", value: m.lfo2Trig, options: TRIG_NAMES, onChange: (v) => update("lfo2Trig", v) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 190,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 187,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 186,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Velocity & Performance", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2", children: [
      sl("vel2filter", "Vel→Filter", 0, 1, 0.01, "accent-yellow-500"),
      sl("vel2amp", "Vel→Amp", 0, 1, 0.01, "accent-yellow-500"),
      sl("portamento", "Portamento", 1, 2e3, 1, "accent-yellow-500", (v) => `${Math.round(v)} ms`),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sel, { label: "Legato", value: m.legato, options: LEGATO_NAMES, onChange: (v) => update("legato", v) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 200,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 196,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 195,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Master", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-2", children: [
      sl("master", "Volume", 0, 100, 0.1, "accent-emerald-500"),
      sl("pbendRange", "PBend Range", 0, 2400, 1, "accent-emerald-500", (v) => `${Math.round(v)} ct`),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sel, { label: "MIDI Ch", value: m.midi, options: MIDI_CH_NAMES, onChange: (v) => update("midi", v) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
        lineNumber: 209,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 206,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
      lineNumber: 205,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CalfMonoControls.tsx",
    lineNumber: 98,
    columnNumber: 5
  }, void 0);
};
export {
  CalfMonoControls,
  CalfMonoControls as default
};
