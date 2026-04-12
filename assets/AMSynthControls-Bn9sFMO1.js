import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { ck as DEFAULT_AMSYNTH, aB as Knob, cl as AMSYNTH_PARAM_NAMES } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const WAVEFORM_NAMES = ["Sine", "Pulse", "Saw", "Noise", "Random"];
const LFO_WAVEFORM_NAMES = ["Sine", "Square", "Saw Up", "Saw Down", "Noise", "Random", "S&H"];
const FILTER_TYPES = ["Low Pass", "High Pass", "Band Pass", "Band Stop", "Bypass"];
const KBD_MODES = ["Poly", "Mono", "Legato"];
const CONFIG_KEYS = [
  "ampAttack",
  "ampDecay",
  "ampSustain",
  "ampRelease",
  "osc1Waveform",
  "filterAttack",
  "filterDecay",
  "filterSustain",
  "filterRelease",
  "filterResonance",
  "filterEnvAmount",
  "filterCutoff",
  "osc2Detune",
  "osc2Waveform",
  "masterVol",
  "lfoFreq",
  "lfoWaveform",
  "osc2Range",
  "oscMix",
  "freqModAmount",
  "filterModAmount",
  "ampModAmount",
  "oscMixMode",
  "osc1Pulsewidth",
  "osc2Pulsewidth",
  "reverbRoomsize",
  "reverbDamp",
  "reverbWet",
  "reverbWidth",
  "distortionCrunch",
  "osc2Sync",
  "portamentoTime",
  "keyboardMode",
  "osc2Pitch",
  "filterType",
  "filterSlope",
  "freqModOsc",
  "filterKbdTrack",
  "filterVelSens",
  "ampVelSens",
  "portamentoMode"
];
const BIPOLAR_PARAMS = /* @__PURE__ */ new Set([
  "osc2Detune",
  "oscMix",
  "filterEnvAmount",
  "filterModAmount",
  "ampModAmount"
]);
const GROUPS = [
  {
    label: "Oscillator 1",
    params: [
      { key: "osc1Waveform", min: 0, max: 4, step: 1, format: (v) => WAVEFORM_NAMES[Math.round(v)] || "?" },
      { key: "osc1Pulsewidth", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` }
    ]
  },
  {
    label: "Oscillator 2",
    params: [
      { key: "osc2Waveform", min: 0, max: 4, step: 1, format: (v) => WAVEFORM_NAMES[Math.round(v)] || "?" },
      { key: "osc2Pulsewidth", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
      { key: "osc2Detune", min: -1, max: 1, format: (v) => `${(v * 100).toFixed(1)} cent` },
      { key: "osc2Range", min: -3, max: 4, step: 1, format: (v) => `${Math.round(v)} oct` },
      { key: "osc2Pitch", min: -12, max: 12, step: 1, format: (v) => `${Math.round(v)} semi` },
      { key: "osc2Sync", min: 0, max: 1, step: 1, format: (v) => v > 0.5 ? "On" : "Off" }
    ]
  },
  {
    label: "Mixer",
    params: [
      { key: "oscMix", min: -1, max: 1, format: (v) => v < 0 ? `Osc1 ${Math.round(-v * 100)}%` : `Osc2 ${Math.round(v * 100)}%` },
      { key: "oscMixMode", min: 0, max: 1, step: 1, format: (v) => v > 0.5 ? "Ring Mod" : "Mix" },
      { key: "masterVol", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` }
    ]
  },
  {
    label: "Filter",
    params: [
      { key: "filterCutoff", min: -0.5, max: 1.5, format: (v) => `${(v * 100).toFixed(0)}%` },
      { key: "filterResonance", min: 0, max: 0.97, format: (v) => `${Math.round(v * 100)}%` },
      { key: "filterEnvAmount", min: -16, max: 16, format: (v) => `${v.toFixed(1)}` },
      { key: "filterType", min: 0, max: 4, step: 1, format: (v) => FILTER_TYPES[Math.round(v)] || "?" },
      { key: "filterSlope", min: 0, max: 1, step: 1, format: (v) => v > 0.5 ? "24dB" : "12dB" },
      { key: "filterKbdTrack", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
      { key: "filterVelSens", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` }
    ]
  },
  {
    label: "Filter Envelope",
    params: [
      { key: "filterAttack", min: 0, max: 2.5, format: (v) => `${(v * 1e3).toFixed(0)} ms` },
      { key: "filterDecay", min: 0, max: 2.5, format: (v) => `${(v * 1e3).toFixed(0)} ms` },
      { key: "filterSustain", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
      { key: "filterRelease", min: 0, max: 2.5, format: (v) => `${(v * 1e3).toFixed(0)} ms` }
    ]
  },
  {
    label: "Amp Envelope",
    params: [
      { key: "ampAttack", min: 0, max: 2.5, format: (v) => `${(v * 1e3).toFixed(0)} ms` },
      { key: "ampDecay", min: 0, max: 2.5, format: (v) => `${(v * 1e3).toFixed(0)} ms` },
      { key: "ampSustain", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
      { key: "ampRelease", min: 0, max: 2.5, format: (v) => `${(v * 1e3).toFixed(0)} ms` },
      { key: "ampVelSens", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` }
    ]
  },
  {
    label: "LFO & Modulation",
    params: [
      { key: "lfoFreq", min: 0, max: 7.5, format: (v) => `${v.toFixed(2)} Hz` },
      { key: "lfoWaveform", min: 0, max: 6, step: 1, format: (v) => LFO_WAVEFORM_NAMES[Math.round(v)] || "?" },
      { key: "freqModAmount", min: 0, max: 1.26, format: (v) => `${Math.round(v * 100)}%` },
      { key: "filterModAmount", min: -1, max: 1, format: (v) => `${Math.round(v * 100)}%` },
      { key: "ampModAmount", min: -1, max: 1, format: (v) => `${Math.round(v * 100)}%` },
      { key: "freqModOsc", min: 0, max: 2, step: 1, format: (v) => ["Both", "Osc1", "Osc2"][Math.round(v)] || "?" }
    ]
  },
  {
    label: "Effects",
    params: [
      { key: "distortionCrunch", min: 0, max: 0.9, format: (v) => `${Math.round(v * 100)}%` },
      { key: "reverbWet", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
      { key: "reverbRoomsize", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
      { key: "reverbDamp", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
      { key: "reverbWidth", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` }
    ]
  },
  {
    label: "Performance",
    params: [
      { key: "keyboardMode", min: 0, max: 2, step: 1, format: (v) => KBD_MODES[Math.round(v)] || "?" },
      { key: "portamentoTime", min: 0, max: 1, format: (v) => `${(v * 1e3).toFixed(0)} ms` },
      { key: "portamentoMode", min: 0, max: 1, step: 1, format: (v) => v > 0.5 ? "Legato" : "Always" }
    ]
  }
];
const AMSynthControls = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const { isCyan: isCyanTheme, knob: knobColor } = useInstrumentColors("#88ff88");
  const headerColor = isCyanTheme ? "text-cyan-400" : "text-green-400";
  const merged = { ...DEFAULT_AMSYNTH, ...config };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-3 text-xs", children: GROUPS.map((group) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-[#1a1a1a] border border-dark-border rounded-xl p-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${headerColor} mb-2 text-[11px] uppercase tracking-wide`, children: group.label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AMSynthControls.tsx",
      lineNumber: 145,
      columnNumber: 11
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4", children: group.params.map((p) => {
      const idx = CONFIG_KEYS.indexOf(p.key);
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: AMSYNTH_PARAM_NAMES[idx] || p.key,
          value: merged[p.key] ?? 0,
          min: p.min,
          max: p.max,
          step: p.step,
          onChange: (v) => updateParam(p.key, v),
          formatValue: p.format,
          bipolar: BIPOLAR_PARAMS.has(p.key),
          color: knobColor
        },
        p.key,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AMSynthControls.tsx",
          lineNumber: 152,
          columnNumber: 17
        },
        void 0
      );
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AMSynthControls.tsx",
      lineNumber: 148,
      columnNumber: 11
    }, void 0)
  ] }, group.label, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AMSynthControls.tsx",
    lineNumber: 144,
    columnNumber: 9
  }, void 0)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/AMSynthControls.tsx",
    lineNumber: 142,
    columnNumber: 5
  }, void 0);
};
export {
  AMSynthControls
};
