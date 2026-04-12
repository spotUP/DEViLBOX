import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cG as DEFAULT_HARMONIC_SYNTH, aB as Knob, W as CustomSelect } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { F as FilterFrequencyResponse } from "./FilterFrequencyResponse-BHF9gTID.js";
import { H as HarmonicBarsCanvas } from "./HarmonicBarsCanvas-tCyue1dW.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
const NUM_HARMONICS = 32;
const SPECTRAL_PRESETS = {
  Saw: Array.from({ length: NUM_HARMONICS }, (_, i) => 1 / (i + 1)),
  Square: Array.from({ length: NUM_HARMONICS }, (_, i) => (i + 1) % 2 === 1 ? 1 / (i + 1) : 0),
  Triangle: Array.from({ length: NUM_HARMONICS }, (_, i) => {
    if ((i + 1) % 2 === 0) return 0;
    const n = i + 1;
    return 1 / (n * n) * (n % 4 === 1 ? 1 : -1);
  }).map((v) => Math.abs(v)),
  Organ: Array.from({ length: NUM_HARMONICS }, (_, i) => {
    const n = i + 1;
    return [1, 2, 3, 4, 5, 6, 8].includes(n) ? 0.8 / Math.sqrt(n) : 0;
  }),
  Bell: Array.from({ length: NUM_HARMONICS }, (_, i) => {
    const n = i + 1;
    return Math.exp(-0.3 * n) * (1 + 0.5 * Math.sin(n * 0.7));
  }),
  Choir: Array.from({ length: NUM_HARMONICS }, (_, i) => {
    const n = i + 1;
    const f = n * 200;
    const d1 = Math.exp(-((f - 500) ** 2) / 200 ** 2);
    const d2 = Math.exp(-((f - 1500) ** 2) / 400 ** 2) * 0.6;
    const d3 = Math.exp(-((f - 2500) ** 2) / 600 ** 2) * 0.3;
    return (d1 + d2 + d3) * (1 / n);
  })
};
for (const key of Object.keys(SPECTRAL_PRESETS)) {
  const arr = SPECTRAL_PRESETS[key];
  const maxVal = Math.max(...arr);
  if (maxVal > 0) {
    SPECTRAL_PRESETS[key] = arr.map((v) => v / maxVal);
  }
}
const HarmonicSynthControls = ({
  config,
  instrumentId: _instrumentId,
  onChange
}) => {
  const [_isDragging, setIsDragging] = reactExports.useState(false);
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { isCyan: isCyanTheme, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#4ade80");
  const barColor = isCyanTheme ? "rgba(0, 255, 255, 0.7)" : "rgba(74, 222, 128, 0.7)";
  const barHighlight = isCyanTheme ? "rgba(0, 255, 255, 1)" : "rgba(74, 222, 128, 1)";
  const harmonics = config.harmonics || DEFAULT_HARMONIC_SYNTH.harmonics;
  const setHarmonicFromNormalized = reactExports.useCallback((nx, ny) => {
    const idx = Math.floor(nx * NUM_HARMONICS);
    const amp = Math.max(0, Math.min(1, 1 - ny));
    if (idx >= 0 && idx < NUM_HARMONICS) {
      const cur = configRef.current;
      const newH = [...cur.harmonics || DEFAULT_HARMONIC_SYNTH.harmonics];
      newH[idx] = amp;
      onChange({ harmonics: newH });
    }
  }, [onChange]);
  const updateFilter = reactExports.useCallback((updates) => {
    onChange({ filter: { ...configRef.current.filter, ...updates } });
  }, [onChange]);
  const updateEnvelope = reactExports.useCallback((updates) => {
    onChange({ envelope: { ...configRef.current.envelope, ...updates } });
  }, [onChange]);
  const updateLFO = reactExports.useCallback((updates) => {
    onChange({ lfo: { ...configRef.current.lfo, ...updates } });
  }, [onChange]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border ${panelBg} overflow-hidden`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-3 py-1.5 border-b border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[10px] font-bold text-text-primary tracking-wider", children: "HARMONICS" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 105,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: Object.keys(SPECTRAL_PRESETS).map((name) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onChange({ harmonics: [...SPECTRAL_PRESETS[name]] }),
            className: "px-2 py-0.5 text-[9px] font-mono rounded border hover:border-accent text-text-muted hover:text-text-primary transition-colors",
            children: name
          },
          name,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
            lineNumber: 108,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 106,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
        lineNumber: 104,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        HarmonicBarsCanvas,
        {
          harmonics,
          count: NUM_HARMONICS,
          width: 600,
          height: 120,
          barColor,
          highlightColor: barHighlight,
          backgroundColor: isCyanTheme ? "#030d0d" : "#111111",
          gridColor: isCyanTheme ? "rgba(0, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.06)",
          gradient: true,
          showLabels: true,
          labelColor: isCyanTheme ? "rgba(0, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.3)",
          hiDpi: true,
          onDragStart: (nx, ny) => {
            setIsDragging(true);
            setHarmonicFromNormalized(nx, ny);
          },
          onDrag: setHarmonicFromNormalized,
          onDragEnd: () => setIsDragging(false)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 118,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
      lineNumber: 103,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-[10px] font-bold text-text-muted mb-2 tracking-wider", children: "SPECTRAL" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 141,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.spectralTilt,
              min: -100,
              max: 100,
              onChange: (v) => onChange({ spectralTilt: v }),
              label: "Tilt",
              color: knobColor,
              bipolar: true,
              defaultValue: 0
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 143,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.evenOddBalance,
              min: -100,
              max: 100,
              onChange: (v) => onChange({ evenOddBalance: v }),
              label: "E/O",
              color: knobColor,
              bipolar: true,
              defaultValue: 0
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 147,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.maxVoices,
              min: 4,
              max: 8,
              onChange: (v) => onChange({ maxVoices: Math.round(v) }),
              label: "Voices",
              color: knobColor,
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 151,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 142,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
        lineNumber: 140,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[10px] font-bold text-text-muted tracking-wider", children: "FILTER" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
            lineNumber: 162,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: config.filter.type,
              onChange: (v) => updateFilter({ type: v }),
              options: [
                { value: "lowpass", label: "LP" },
                { value: "highpass", label: "HP" },
                { value: "bandpass", label: "BP" }
              ],
              className: "bg-transparent border rounded px-1.5 py-0.5 text-[9px] font-mono text-text-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 163,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 161,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.filter.cutoff,
              min: 20,
              max: 2e4,
              onChange: (v) => updateFilter({ cutoff: v }),
              label: "Cutoff",
              unit: "Hz",
              color: knobColor,
              logarithmic: true
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 175,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.filter.resonance,
              min: 0,
              max: 30,
              onChange: (v) => updateFilter({ resonance: v }),
              label: "Reso",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 179,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 174,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FilterFrequencyResponse,
          {
            filterType: config.filter.type,
            cutoff: Math.log10(Math.max(config.filter.cutoff, 20) / 20) / 3,
            resonance: config.filter.resonance / 30,
            poles: 2,
            color: knobColor,
            width: 300,
            height: 56
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
            lineNumber: 185,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 184,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
        lineNumber: 160,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-[10px] font-bold text-text-muted mb-2 tracking-wider", children: "ENVELOPE" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 196,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.envelope.attack,
              min: 0,
              max: 2e3,
              onChange: (v) => updateEnvelope({ attack: v }),
              label: "A",
              unit: "ms",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 198,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.envelope.decay,
              min: 0,
              max: 2e3,
              onChange: (v) => updateEnvelope({ decay: v }),
              label: "D",
              unit: "ms",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 202,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.envelope.sustain,
              min: 0,
              max: 100,
              onChange: (v) => updateEnvelope({ sustain: v }),
              label: "S",
              unit: "%",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 206,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.envelope.release,
              min: 0,
              max: 5e3,
              onChange: (v) => updateEnvelope({ release: v }),
              label: "R",
              unit: "ms",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 210,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 197,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EnvelopeVisualization,
          {
            mode: "linear",
            attack: config.envelope.attack / 2e3,
            decay: config.envelope.decay / 2e3,
            sustain: config.envelope.sustain / 100,
            release: config.envelope.release / 5e3,
            color: knobColor,
            width: 300,
            height: 48
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
            lineNumber: 216,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 215,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
        lineNumber: 195,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[10px] font-bold text-text-muted tracking-wider", children: "LFO" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
            lineNumber: 231,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: config.lfo.target,
              onChange: (v) => updateLFO({ target: v }),
              options: [
                { value: "pitch", label: "Pitch" },
                { value: "filter", label: "Filter" },
                { value: "spectral", label: "Spectral" }
              ],
              className: "bg-transparent border rounded px-1.5 py-0.5 text-[9px] font-mono text-text-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 232,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 230,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.lfo.rate,
              min: 0.1,
              max: 20,
              onChange: (v) => updateLFO({ rate: v }),
              label: "Rate",
              unit: "Hz",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 244,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.lfo.depth,
              min: 0,
              max: 100,
              onChange: (v) => updateLFO({ depth: v }),
              label: "Depth",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
              lineNumber: 248,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
          lineNumber: 243,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
        lineNumber: 229,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
      lineNumber: 138,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HarmonicSynthControls.tsx",
    lineNumber: 101,
    columnNumber: 5
  }, void 0);
};
export {
  HarmonicSynthControls
};
