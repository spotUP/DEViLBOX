import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, Q as Activity, _ as Funnel, Z as Zap } from "./vendor-ui-AJ7AT9BN.js";
import { W as CustomSelect, aB as Knob } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { F as FilterFrequencyResponse } from "./FilterFrequencyResponse-BHF9gTID.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
const V2_FILTER_MAP = [
  null,
  // Off
  { type: "lowpass", poles: 2 },
  // Low
  { type: "bandpass", poles: 2 },
  // Band
  { type: "highpass", poles: 2 },
  // High
  { type: "notch", poles: 2 },
  // Notch
  { type: "lowpass", poles: 2 },
  // All (all-pass, approximate)
  { type: "lowpass", poles: 4 },
  // MoogL
  { type: "highpass", poles: 4 }
  // MoogH
];
const V2Controls = ({
  config,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("osc");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#ffaa00", { knob: "#ffcc33" });
  const updateOsc1 = (updates) => {
    onChange({ osc1: { ...configRef.current.osc1, ...updates } });
  };
  const updateOsc2 = (updates) => {
    onChange({ osc2: { ...configRef.current.osc2, ...updates } });
  };
  const updateOsc3 = (updates) => {
    onChange({ osc3: { ...configRef.current.osc3, ...updates } });
  };
  const updateFilter1 = (updates) => {
    onChange({ filter1: { ...configRef.current.filter1, ...updates } });
  };
  const updateFilter2 = (updates) => {
    onChange({ filter2: { ...configRef.current.filter2, ...updates } });
  };
  const updateRouting = (updates) => {
    onChange({ routing: { ...configRef.current.routing, ...updates } });
  };
  const updateEnv = (updates) => {
    onChange({ envelope: { ...configRef.current.envelope, ...updates } });
  };
  const updateEnv2 = (updates) => {
    onChange({ envelope2: { ...configRef.current.envelope2, ...updates } });
  };
  const updateLFO1 = (updates) => {
    onChange({ lfo1: { ...configRef.current.lfo1, ...updates } });
  };
  const updateLFO2 = (updates) => {
    onChange({ lfo2: { ...configRef.current.lfo2 ?? { mode: 1, keySync: true, envMode: false, rate: 64, phase: 2, polarity: 0, amplify: 127 }, ...updates } });
  };
  const updateVoiceDist = (updates) => {
    onChange({ voiceDistortion: { ...configRef.current.voiceDistortion ?? { mode: 0, inGain: 32, param1: 0, param2: 64 }, ...updates } });
  };
  const updateChanDist = (updates) => {
    onChange({ channelDistortion: { ...configRef.current.channelDistortion ?? { mode: 0, inGain: 32, param1: 100, param2: 64 }, ...updates } });
  };
  const updateChorus = (updates) => {
    onChange({ chorusFlanger: { ...configRef.current.chorusFlanger ?? { amount: 64, feedback: 64, delayL: 32, delayR: 32, modRate: 0, modDepth: 0, modPhase: 64 }, ...updates } });
  };
  const updateCompressor = (updates) => {
    onChange({ compressor: { ...configRef.current.compressor ?? { mode: 0, stereoLink: false, autoGain: true, lookahead: 2, threshold: 90, ratio: 32, attack: 20, release: 64, outGain: 64 }, ...updates } });
  };
  const OSC_MODES = ["Off", "Saw/Tri", "Pulse", "Sin", "Noise", "XX", "AuxA", "AuxB"];
  const OSC23_MODES = ["Off", "Tri", "Pul", "Sin", "Noi", "FM", "AuxA", "AuxB"];
  const FILTER_MODES = ["Off", "Low", "Band", "High", "Notch", "All", "MoogL", "MoogH"];
  const ROUTING_MODES = ["Single", "Serial", "Parallel"];
  const DIST_MODES = ["Off", "Overdrive", "Clip", "Bitcrush", "Decimate", "LPF", "BPF", "HPF", "Notch", "Allpass", "MoogL"];
  const COMP_MODES = ["Off", "Peak", "RMS"];
  const LFO_MODES = ["Saw", "Tri", "Pulse", "Sin", "S&H"];
  const LFO_POLARITY = ["Pos", "Neg", "Bipolar"];
  const renderOscTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-amber-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 114,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "OSCILLATOR 1" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 115,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 113,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(config.osc1.mode),
            onChange: (v) => updateOsc1({ mode: parseInt(v) }),
            className: "bg-dark-bgSecondary borderLight text-xs text-amber-400 rounded px-2 py-1",
            options: OSC_MODES.map((mode, i) => ({ value: String(i), label: mode }))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 117,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 112,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc1.transpose,
            min: -64,
            max: 63,
            onChange: (v) => updateOsc1({ transpose: v }),
            label: "Trans",
            color: knobColor,
            formatValue: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 126,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc1.detune,
            min: -64,
            max: 63,
            onChange: (v) => updateOsc1({ detune: v }),
            label: "Detune",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}c`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 135,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc1.color,
            min: 0,
            max: 127,
            onChange: (v) => updateOsc1({ color: v }),
            label: "Color",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 144,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc1.level,
            min: 0,
            max: 127,
            onChange: (v) => updateOsc1({ level: v }),
            label: "Level",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 152,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 125,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 111,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-amber-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 167,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "OSCILLATOR 2" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 168,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 166,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1 cursor-pointer", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase", children: "Ring" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 172,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: config.osc2.ringMod,
                onChange: (e) => updateOsc2({ ringMod: e.target.checked }),
                className: "w-3 h-3 rounded border-dark-borderLight bg-transparent"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
                lineNumber: 173,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 171,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(config.osc2.mode),
              onChange: (v) => updateOsc2({ mode: parseInt(v) }),
              className: "bg-dark-bgSecondary borderLight text-xs text-amber-400 rounded px-2 py-1",
              options: OSC23_MODES.map((mode, i) => ({ value: String(i), label: mode }))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 180,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 170,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 165,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc2.transpose,
            min: -64,
            max: 63,
            onChange: (v) => updateOsc2({ transpose: v }),
            label: "Trans",
            color: knobColor,
            formatValue: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 190,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc2.detune,
            min: -64,
            max: 63,
            onChange: (v) => updateOsc2({ detune: v }),
            label: "Detune",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}c`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 199,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc2.color,
            min: 0,
            max: 127,
            onChange: (v) => updateOsc2({ color: v }),
            label: "Color",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 208,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc2.level,
            min: 0,
            max: 127,
            onChange: (v) => updateOsc2({ level: v }),
            label: "Level",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 216,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 189,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 164,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-amber-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 231,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "OSCILLATOR 3" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 232,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 230,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1 cursor-pointer", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase", children: "Ring" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 236,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: config.osc3.ringMod,
                onChange: (e) => updateOsc3({ ringMod: e.target.checked }),
                className: "w-3 h-3 rounded border-dark-borderLight bg-transparent"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
                lineNumber: 237,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 235,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(config.osc3.mode),
              onChange: (v) => updateOsc3({ mode: parseInt(v) }),
              className: "bg-dark-bgSecondary borderLight text-xs text-amber-400 rounded px-2 py-1",
              options: OSC23_MODES.map((mode, i) => ({ value: String(i), label: mode }))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 244,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 234,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 229,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc3.transpose,
            min: -64,
            max: 63,
            onChange: (v) => updateOsc3({ transpose: v }),
            label: "Trans",
            color: knobColor,
            formatValue: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 254,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc3.detune,
            min: -64,
            max: 63,
            onChange: (v) => updateOsc3({ detune: v }),
            label: "Detune",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}c`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 263,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc3.color,
            min: 0,
            max: 127,
            onChange: (v) => updateOsc3({ color: v }),
            label: "Color",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 272,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.osc3.level,
            min: 0,
            max: 127,
            onChange: (v) => updateOsc3({ level: v }),
            label: "Level",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 280,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 253,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 228,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
    lineNumber: 109,
    columnNumber: 5
  }, void 0);
  const renderFilterTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Funnel, { size: 16, className: "text-amber-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 298,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "VCF 1" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 299,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 297,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filter1.cutoff,
            min: 0,
            max: 127,
            onChange: (v) => updateFilter1({ cutoff: v }),
            label: "Cutoff",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 302,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filter1.resonance,
            min: 0,
            max: 127,
            onChange: (v) => updateFilter1({ resonance: v }),
            label: "Reso",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 310,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 301,
        columnNumber: 9
      }, void 0),
      (() => {
        const entry = V2_FILTER_MAP[config.filter1.mode];
        if (!entry) return null;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FilterFrequencyResponse,
          {
            filterType: entry.type,
            cutoff: config.filter1.cutoff / 127,
            resonance: config.filter1.resonance / 127,
            poles: entry.poles,
            color: knobColor,
            width: 280,
            height: 56
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 324,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 323,
          columnNumber: 13
        }, void 0);
      })(),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1.5 pt-1.5 border-t border-dark-border/20", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: String(config.filter1.mode),
          onChange: (v) => updateFilter1({ mode: parseInt(v) }),
          className: "bg-dark-bgSecondary borderLight text-xs text-amber-400 rounded px-2 py-1",
          options: FILTER_MODES.map((mode, i) => ({ value: String(i), label: mode }))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 333,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 332,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 296,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Funnel, { size: 16, className: "text-amber-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 345,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "VCF 2" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 346,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 344,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filter2.cutoff,
            min: 0,
            max: 127,
            onChange: (v) => updateFilter2({ cutoff: v }),
            label: "Cutoff",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 349,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filter2.resonance,
            min: 0,
            max: 127,
            onChange: (v) => updateFilter2({ resonance: v }),
            label: "Reso",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 357,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 348,
        columnNumber: 9
      }, void 0),
      (() => {
        const entry = V2_FILTER_MAP[config.filter2.mode];
        if (!entry) return null;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FilterFrequencyResponse,
          {
            filterType: entry.type,
            cutoff: config.filter2.cutoff / 127,
            resonance: config.filter2.resonance / 127,
            poles: entry.poles,
            color: knobColor,
            width: 280,
            height: 56
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 371,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 370,
          columnNumber: 13
        }, void 0);
      })(),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1.5 pt-1.5 border-t border-dark-border/20", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: String(config.filter2.mode),
          onChange: (v) => updateFilter2({ mode: parseInt(v) }),
          className: "bg-dark-bgSecondary borderLight text-xs text-amber-400 rounded px-2 py-1",
          options: FILTER_MODES.map((mode, i) => ({ value: String(i), label: mode }))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 380,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 379,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 343,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16, className: "text-amber-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 393,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "ROUTING" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 394,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 392,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(config.routing.mode),
            onChange: (v) => updateRouting({ mode: parseInt(v) }),
            className: "bg-dark-bgSecondary borderLight text-xs text-amber-400 rounded px-2 py-1",
            options: ROUTING_MODES.map((mode, i) => ({ value: String(i), label: mode }))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 396,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 391,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 items-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.routing.balance,
          min: 0,
          max: 127,
          onChange: (v) => updateRouting({ balance: v }),
          label: "Balance",
          color: knobColor,
          formatValue: (v) => v < 64 ? `F1:${Math.round((64 - v) / 64 * 100)}%` : `F2:${Math.round((v - 64) / 64 * 100)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 405,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 404,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 390,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
    lineNumber: 294,
    columnNumber: 5
  }, void 0);
  const renderEnvTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16, className: "text-amber-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 424,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "AMP ENVELOPE (EG 1)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 425,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 423,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.envelope.attack,
            min: 0,
            max: 127,
            onChange: (v) => updateEnv({ attack: v }),
            label: "Attack",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 429,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.envelope.decay,
            min: 0,
            max: 127,
            onChange: (v) => updateEnv({ decay: v }),
            label: "Decay",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 437,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.envelope.sustain,
            min: 0,
            max: 127,
            onChange: (v) => updateEnv({ sustain: v }),
            label: "Sustain",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 445,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.envelope.release,
            min: 0,
            max: 127,
            onChange: (v) => updateEnv({ release: v }),
            label: "Release",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 453,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 428,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        EnvelopeVisualization,
        {
          mode: "linear",
          attack: config.envelope.attack / 127,
          decay: config.envelope.decay / 127,
          sustain: config.envelope.sustain / 127,
          release: config.envelope.release / 127,
          color: knobColor,
          width: 300,
          height: 56
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 464,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 463,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 422,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16, className: "text-amber-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 479,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "MOD ENVELOPE (EG 2)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 480,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 478,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: config.envelope2.attack, min: 0, max: 127, onChange: (v) => updateEnv2({ attack: v }), label: "Attack", color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 484,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: config.envelope2.decay, min: 0, max: 127, onChange: (v) => updateEnv2({ decay: v }), label: "Decay", color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 485,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: config.envelope2.sustain, min: 0, max: 127, onChange: (v) => updateEnv2({ sustain: v }), label: "Sustain", color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 486,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: config.envelope2.release, min: 0, max: 127, onChange: (v) => updateEnv2({ release: v }), label: "Release", color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 487,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 483,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        EnvelopeVisualization,
        {
          mode: "linear",
          attack: config.envelope2.attack / 127,
          decay: config.envelope2.decay / 127,
          sustain: config.envelope2.sustain / 127,
          release: config.envelope2.release / 127,
          color: knobColor,
          width: 300,
          height: 56
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 491,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 490,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 477,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
    lineNumber: 420,
    columnNumber: 5
  }, void 0);
  const renderModTab = () => {
    const lfo2 = config.lfo2 ?? { mode: 1, keySync: true, envMode: false, rate: 64, phase: 2, polarity: 0, amplify: 127 };
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-amber-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 511,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "LFO 1" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 512,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 510,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.lfo1.rate,
              min: 0,
              max: 127,
              onChange: (v) => updateLFO1({ rate: v }),
              label: "Rate",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 516,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.lfo1.depth,
              min: 0,
              max: 127,
              onChange: (v) => updateLFO1({ depth: v }),
              label: "Depth",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 524,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 515,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 509,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-amber-500" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 539,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "LFO 2" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 540,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 538,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                value: String(lfo2.mode),
                onChange: (v) => updateLFO2({ mode: parseInt(v) }),
                className: "bg-dark-bgSecondary borderLight text-xs text-amber-400 rounded px-2 py-1",
                options: LFO_MODES.map((mode, i) => ({ value: String(i), label: mode }))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
                lineNumber: 543,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                value: String(lfo2.polarity),
                onChange: (v) => updateLFO2({ polarity: parseInt(v) }),
                className: "bg-dark-bgSecondary borderLight text-xs text-amber-400 rounded px-2 py-1",
                options: LFO_POLARITY.map((p, i) => ({ value: String(i), label: p }))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
                lineNumber: 549,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 542,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 537,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1 cursor-pointer", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase", children: "KeySync" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 560,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: lfo2.keySync,
                onChange: (e) => updateLFO2({ keySync: e.target.checked }),
                className: "w-3 h-3 rounded border-dark-borderLight bg-transparent"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
                lineNumber: 561,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 559,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1 cursor-pointer", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase", children: "Env" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 569,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: lfo2.envMode,
                onChange: (e) => updateLFO2({ envMode: e.target.checked }),
                className: "w-3 h-3 rounded border-dark-borderLight bg-transparent"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
                lineNumber: 570,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 568,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 558,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: lfo2.rate,
              min: 0,
              max: 127,
              onChange: (v) => updateLFO2({ rate: v }),
              label: "Rate",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 580,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: lfo2.phase,
              min: 0,
              max: 127,
              onChange: (v) => updateLFO2({ phase: v }),
              label: "Phase",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 588,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: lfo2.amplify,
              min: 0,
              max: 127,
              onChange: (v) => updateLFO2({ amplify: v }),
              label: "Amplify",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 596,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 579,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 536,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 508,
      columnNumber: 7
    }, void 0);
  };
  const renderFxTab = () => {
    const vDist = config.voiceDistortion ?? { mode: 0, inGain: 32, param1: 0, param2: 64 };
    const cDist = config.channelDistortion ?? { mode: 0, inGain: 32, param1: 100, param2: 64 };
    const chorus = config.chorusFlanger ?? { amount: 64, feedback: 64, delayL: 32, delayR: 32, modRate: 0, modDepth: 0, modPhase: 64 };
    const comp = config.compressor ?? { mode: 0, stereoLink: false, autoGain: true, lookahead: 2, threshold: 90, ratio: 32, attack: 20, release: 64, outGain: 64 };
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16, className: "text-amber-500" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 621,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "VOICE DISTORTION" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 622,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 620,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(vDist.mode),
              onChange: (v) => updateVoiceDist({ mode: parseInt(v) }),
              className: "bg-dark-bgSecondary borderLight text-xs text-amber-400 rounded px-2 py-1",
              options: DIST_MODES.map((mode, i) => ({ value: String(i), label: mode }))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 624,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 619,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: vDist.inGain,
              min: 0,
              max: 127,
              onChange: (v) => updateVoiceDist({ inGain: v }),
              label: "InGain",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 632,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: vDist.param1,
              min: 0,
              max: 127,
              onChange: (v) => updateVoiceDist({ param1: v }),
              label: "Param 1",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 640,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: vDist.param2,
              min: 0,
              max: 127,
              onChange: (v) => updateVoiceDist({ param2: v }),
              label: "Param 2",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 648,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 631,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 618,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16, className: "text-amber-500" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 663,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "CHANNEL DISTORTION" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 664,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 662,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(cDist.mode),
              onChange: (v) => updateChanDist({ mode: parseInt(v) }),
              className: "bg-dark-bgSecondary borderLight text-xs text-amber-400 rounded px-2 py-1",
              options: DIST_MODES.map((mode, i) => ({ value: String(i), label: mode }))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 666,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 661,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: cDist.inGain,
              min: 0,
              max: 127,
              onChange: (v) => updateChanDist({ inGain: v }),
              label: "InGain",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 674,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: cDist.param1,
              min: 0,
              max: 127,
              onChange: (v) => updateChanDist({ param1: v }),
              label: "Param 1",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 682,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: cDist.param2,
              min: 0,
              max: 127,
              onChange: (v) => updateChanDist({ param2: v }),
              label: "Param 2",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 690,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 673,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 660,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-amber-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 704,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "CHORUS / FLANGER" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 705,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 703,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: chorus.amount,
              min: 0,
              max: 127,
              onChange: (v) => updateChorus({ amount: v }),
              label: "Amount",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 708,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: chorus.feedback,
              min: 0,
              max: 127,
              onChange: (v) => updateChorus({ feedback: v }),
              label: "Feedback",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 716,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: chorus.delayL,
              min: 1,
              max: 127,
              onChange: (v) => updateChorus({ delayL: v }),
              label: "Delay L",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 724,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: chorus.delayR,
              min: 1,
              max: 127,
              onChange: (v) => updateChorus({ delayR: v }),
              label: "Delay R",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 732,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 707,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center mt-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: chorus.modRate,
              min: 0,
              max: 127,
              onChange: (v) => updateChorus({ modRate: v }),
              label: "Mod Rate",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 742,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: chorus.modDepth,
              min: 0,
              max: 127,
              onChange: (v) => updateChorus({ modDepth: v }),
              label: "Mod Depth",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 750,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: chorus.modPhase,
              min: 0,
              max: 127,
              onChange: (v) => updateChorus({ modPhase: v }),
              label: "Mod Phase",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 758,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 741,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 702,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16, className: "text-amber-500" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 773,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "COMPRESSOR" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 774,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 772,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(comp.mode),
              onChange: (v) => updateCompressor({ mode: parseInt(v) }),
              className: "bg-dark-bgSecondary borderLight text-xs text-amber-400 rounded px-2 py-1",
              options: COMP_MODES.map((mode, i) => ({ value: String(i), label: mode }))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 776,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 771,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1 cursor-pointer", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase", children: "Stereo Link" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 785,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: comp.stereoLink,
                onChange: (e) => updateCompressor({ stereoLink: e.target.checked }),
                className: "w-3 h-3 rounded border-dark-borderLight bg-transparent"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
                lineNumber: 786,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 784,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1 cursor-pointer", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase", children: "AutoGain" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 794,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: comp.autoGain,
                onChange: (e) => updateCompressor({ autoGain: e.target.checked }),
                className: "w-3 h-3 rounded border-dark-borderLight bg-transparent"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
                lineNumber: 795,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 793,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 783,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: comp.threshold,
              min: 0,
              max: 127,
              onChange: (v) => updateCompressor({ threshold: v }),
              label: "Threshold",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 804,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: comp.ratio,
              min: 0,
              max: 127,
              onChange: (v) => updateCompressor({ ratio: v }),
              label: "Ratio",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 812,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: comp.attack,
              min: 0,
              max: 127,
              onChange: (v) => updateCompressor({ attack: v }),
              label: "Attack",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 820,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: comp.release,
              min: 0,
              max: 127,
              onChange: (v) => updateCompressor({ release: v }),
              label: "Release",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 828,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: comp.outGain,
              min: 0,
              max: 127,
              onChange: (v) => updateCompressor({ outGain: v }),
              label: "Out Gain",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 836,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: comp.lookahead,
              min: 0,
              max: 10,
              onChange: (v) => updateCompressor({ lookahead: v }),
              label: "Lookahead",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
              lineNumber: 844,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
          lineNumber: 803,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 770,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 616,
      columnNumber: 7
    }, void 0);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b border-dark-border bg-dark-bg", children: [
      { id: "osc", label: "Oscillators", icon: Activity },
      { id: "filter", label: "Filters", icon: Funnel },
      { id: "env", label: "Envelopes", icon: Zap },
      { id: "fx", label: "FX", icon: Zap },
      { id: "mod", label: "Modulation", icon: Activity }
    ].map((tab) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(tab.id),
        className: `
              flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2
              ${activeTab === tab.id ? `bg-[#252525] border-b-2` : "text-text-muted hover:text-text-secondary"}
            `,
        style: activeTab === tab.id ? { color: accentColor, borderColor: accentColor } : void 0,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(tab.icon, { size: 12 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 881,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "hidden sm:inline", children: tab.label }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
            lineNumber: 882,
            columnNumber: 13
          }, void 0)
        ]
      },
      tab.id,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
        lineNumber: 869,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 861,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow flex-1 overflow-y-auto", children: activeTab === "osc" ? renderOscTab() : activeTab === "filter" ? renderFilterTab() : activeTab === "env" ? renderEnvTab() : activeTab === "fx" ? renderFxTab() : renderModTab() }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
      lineNumber: 888,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2Controls.tsx",
    lineNumber: 859,
    columnNumber: 5
  }, void 0);
};
export {
  V2Controls
};
