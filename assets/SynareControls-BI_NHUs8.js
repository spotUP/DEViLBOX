import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, o as Drum, O as Speaker, Y as Wind, a3 as MoveDown, Q as Activity, $ as Waves } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob, W as CustomSelect, $ as getToneEngine } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { F as FilterFrequencyResponse } from "./FilterFrequencyResponse-BHF9gTID.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const SynareControls = ({
  config,
  instrumentId,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("main");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#ffcc00", { knob: "#ff9900" });
  const mainBg = isCyanTheme ? "bg-[#030808]" : "bg-gradient-to-b from-[#1e1e1e] to-[#151515]";
  const headerBg = isCyanTheme ? "bg-[#041010] border-b-2 border-accent-highlight" : "bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffcc00]";
  const updateOsc = (updates) => {
    onChange({ oscillator: { ...configRef.current.oscillator, ...updates } });
  };
  const updateOsc2 = (updates) => {
    onChange({ oscillator2: { ...configRef.current.oscillator2, ...updates } });
  };
  const updateNoise = (updates) => {
    onChange({ noise: { ...configRef.current.noise, ...updates } });
  };
  const updateFilter = (updates) => {
    onChange({ filter: { ...configRef.current.filter, ...updates } });
  };
  const updateEnv = (updates) => {
    onChange({ envelope: { ...configRef.current.envelope, ...updates } });
  };
  const updateSweep = (updates) => {
    onChange({ sweep: { ...configRef.current.sweep, ...updates } });
  };
  const handleThrow = (active) => {
    const engine = getToneEngine();
    engine.throwInstrumentToEffect(instrumentId, "Reverb", active ? 0.9 : 0.3);
  };
  const renderMainTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Speaker, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-yellow-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 77,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-yellow-400"}`, children: "PITCH & TONE" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 78,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 76,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-muted uppercase", children: "Wave" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 84,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: ["square", "pulse"].map((type) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateOsc({ type }),
              className: `
                    px-2 py-1 text-[10px] font-bold rounded border uppercase
                    ${config.oscillator.type === type ? `bg-dark-bgSecondary` : "bg-[#1a1a1a] border-dark-borderLight text-text-muted hover:border-dark-borderLight"}
                  `,
              style: config.oscillator.type === type ? { borderColor: accentColor, color: accentColor } : void 0,
              children: type
            },
            type,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
              lineNumber: 87,
              columnNumber: 17
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 85,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 83,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.oscillator.tune,
            min: 40,
            max: 1e3,
            onChange: (v) => updateOsc({ tune: v }),
            label: "Tune",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 104,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.oscillator.fine,
            min: -100,
            max: 100,
            onChange: (v) => updateOsc({ fine: v }),
            label: "Fine",
            color: knobColor,
            bipolar: true,
            defaultValue: 0,
            formatValue: (v) => `${Math.round(v)}c`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 113,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.oscillator2.enabled ? config.oscillator2.mix : 0,
            min: 0,
            max: 1,
            onChange: (v) => updateOsc2({ enabled: v > 0, mix: v }),
            label: "Osc 2",
            color: knobColor,
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 124,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.oscillator2.detune,
            min: -24,
            max: 24,
            onChange: (v) => updateOsc2({ detune: v }),
            label: "Detune",
            color: knobColor,
            bipolar: true,
            defaultValue: 0,
            formatValue: (v) => `${Math.round(v)}st`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 133,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.envelope.decay,
            min: 10,
            max: 2e3,
            onChange: (v) => updateEnv({ decay: v }),
            label: "Decay",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 144,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.envelope.sustain,
            min: 0,
            max: 1,
            onChange: (v) => updateEnv({ sustain: v }),
            label: "Sustain",
            color: knobColor,
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 153,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 81,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
      lineNumber: 75,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Wind, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-yellow-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 169,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-yellow-400"}`, children: "NOISE" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 170,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 168,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 cursor-pointer", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted", children: "Enable" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 173,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: config.noise.enabled,
              onChange: (e) => updateNoise({ enabled: e.target.checked }),
              className: `w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? "border-accent-highlight checked:bg-accent-highlight" : "border-yellow-500 checked:bg-yellow-500"}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
              lineNumber: 174,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 172,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 167,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex flex-wrap gap-3 items-end transition-opacity ${config.noise.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-muted uppercase", children: "Type" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 186,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: ["white", "pink"].map((type) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateNoise({ type }),
              className: `
                    px-2 py-1 text-[10px] font-bold rounded border uppercase
                    ${config.noise.type === type ? `bg-dark-bgSecondary` : "bg-[#1a1a1a] border-dark-borderLight text-text-muted hover:border-dark-borderLight"}
                  `,
              style: config.noise.type === type ? { borderColor: accentColor, color: accentColor } : void 0,
              children: type
            },
            type,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
              lineNumber: 189,
              columnNumber: 17
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 187,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 185,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.noise.mix,
            min: 0,
            max: 1,
            onChange: (v) => updateNoise({ mix: v }),
            label: "Mix",
            color: knobColor,
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 206,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.noise.color,
            min: 0,
            max: 100,
            onChange: (v) => updateNoise({ color: v }),
            label: "Color",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 215,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 183,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
      lineNumber: 166,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MoveDown, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-yellow-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 231,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-yellow-400"}`, children: "PITCH SWEEP" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 232,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 230,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 cursor-pointer", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted", children: "Enable" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 235,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: config.sweep.enabled,
              onChange: (e) => updateSweep({ enabled: e.target.checked }),
              className: `w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? "border-accent-highlight checked:bg-accent-highlight" : "border-yellow-500 checked:bg-yellow-500"}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
              lineNumber: 236,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 234,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 229,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex flex-wrap gap-3 transition-opacity ${config.sweep.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.sweep.amount,
            min: 0,
            max: 48,
            onChange: (v) => updateSweep({ amount: v }),
            label: "Range",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}st`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 246,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.sweep.time,
            min: 10,
            max: 1e3,
            onChange: (v) => updateSweep({ time: v }),
            label: "Time",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 255,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 245,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
      lineNumber: 228,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
    lineNumber: 73,
    columnNumber: 5
  }, void 0);
  const renderModTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-yellow-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 274,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-yellow-400"}`, children: "FILTER" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 275,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 273,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filter.cutoff,
            min: 20,
            max: 1e4,
            onChange: (v) => updateFilter({ cutoff: v }),
            label: "Cutoff",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 279,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filter.resonance,
            min: 0,
            max: 100,
            onChange: (v) => updateFilter({ resonance: v }),
            label: "Reso",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 288,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filter.envMod,
            min: 0,
            max: 100,
            onChange: (v) => updateFilter({ envMod: v }),
            label: "Env Mod",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 297,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filter.decay,
            min: 10,
            max: 2e3,
            onChange: (v) => updateFilter({ decay: v }),
            label: "F-Decay",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 306,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 278,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        FilterFrequencyResponse,
        {
          filterType: "lowpass",
          cutoff: Math.log10(Math.max(config.filter.cutoff, 20) / 20) / 3,
          resonance: config.filter.resonance / 100,
          poles: 2,
          color: knobColor,
          width: 300,
          height: 56
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 317,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 316,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
      lineNumber: 272,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-yellow-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 330,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-yellow-400"}`, children: "MODULATION" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 331,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 329,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 cursor-pointer", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted", children: "Enable" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 334,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: config.lfo.enabled,
              onChange: (e) => onChange({ lfo: { ...config.lfo, enabled: e.target.checked } }),
              className: `w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? "border-accent-highlight checked:bg-accent-highlight" : "border-yellow-500 checked:bg-yellow-500"}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
              lineNumber: 335,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 333,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 328,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex flex-wrap gap-3 transition-opacity ${config.lfo.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.lfo.rate,
            min: 0.1,
            max: 20,
            onChange: (v) => onChange({ lfo: { ...config.lfo, rate: v } }),
            label: "Rate",
            color: knobColor,
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 345,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.lfo.depth,
            min: 0,
            max: 100,
            onChange: (v) => onChange({ lfo: { ...config.lfo, depth: v } }),
            label: "Depth",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 354,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-muted uppercase", children: "Target" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 365,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: config.lfo.target,
              onChange: (v) => onChange({ lfo: { ...config.lfo, target: v } }),
              options: [
                { value: "pitch", label: "Pitch" },
                { value: "filter", label: "Filter" },
                { value: "both", label: "Both" }
              ],
              className: "bg-dark-bg borderLight text-xs text-text-primary rounded px-1 py-0.5"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
              lineNumber: 366,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 364,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-muted uppercase", children: "Throw" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
            lineNumber: 380,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onMouseDown: () => handleThrow(true),
              onMouseUp: () => handleThrow(false),
              onMouseLeave: () => handleThrow(false),
              onTouchStart: () => handleThrow(true),
              onTouchEnd: () => handleThrow(false),
              className: `
                w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95
                ${isCyanTheme ? "bg-accent-highlight/20 border-2 border-accent-highlight text-accent-highlight" : "bg-yellow-500/20 border-2 border-yellow-500 text-yellow-500"}
                hover:shadow-[0_0_15px_rgba(255,204,0,0.4)]
              `,
              title: "Momentary Reverb Throw",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Wind, { size: 20 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
                lineNumber: 396,
                columnNumber: 15
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
              lineNumber: 381,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 379,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 344,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
      lineNumber: 327,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
    lineNumber: 270,
    columnNumber: 5
  }, void 0);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `synth-editor-container ${mainBg} flex flex-col h-full`, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `synth-editor-header px-4 py-3 ${headerBg}`, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-700 shadow-lg text-black", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Drum, { size: 24 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 410,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 409,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-xl font-black tracking-tight", style: { color: accentColor }, children: "SYNARE 3" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 413,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: `text-[10px] uppercase tracking-widest ${isCyanTheme ? "text-accent-highlight" : "text-text-secondary"}`, children: "Electronic Percussion" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
          lineNumber: 414,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 412,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
      lineNumber: 408,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
      lineNumber: 407,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b border-dark-border bg-dark-bg", children: ["main", "mod"].map((tab) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(tab),
        className: `
              flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors
              ${activeTab === tab ? `bg-[#252525] border-b-2` : "text-text-muted hover:text-text-secondary"}
            `,
        style: activeTab === tab ? { color: accentColor, borderColor: accentColor } : void 0,
        children: tab === "main" ? "Synth & Sweep" : "Filter & LFO"
      },
      tab,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
        lineNumber: 422,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
      lineNumber: 420,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow flex-1 overflow-y-auto", children: activeTab === "main" ? renderMainTab() : renderModTab() }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
      lineNumber: 440,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynareControls.tsx",
    lineNumber: 405,
    columnNumber: 5
  }, void 0);
};
export {
  SynareControls
};
