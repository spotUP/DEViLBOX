import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, O as Speaker, Q as Activity, W as Repeat, Y as Wind, _ as Funnel, $ as Waves } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob, $ as getToneEngine } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { F as FilterFrequencyResponse } from "./FilterFrequencyResponse-BHF9gTID.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const DubSirenControls = ({
  config,
  instrumentId,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("main");
  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#ff4444", { knob: "#ff8888" });
  const updateOsc = (updates) => {
    onChange({ oscillator: { ...config.oscillator, ...updates } });
  };
  const updateLFO = (updates) => {
    onChange({ lfo: { ...config.lfo, ...updates } });
  };
  const updateDelay = (updates) => {
    if (updates.time !== void 0) {
      updates.time = Math.max(0, Math.min(1, updates.time));
    }
    onChange({ delay: { ...config.delay, ...updates } });
  };
  const updateReverb = (updates) => {
    onChange({ reverb: { ...config.reverb, ...updates } });
  };
  const updateFilter = (updates) => {
    onChange({ filter: { ...config.filter, ...updates } });
  };
  const handleThrow = (active) => {
    const engine = getToneEngine();
    const baseline = config.delay.enabled ? config.delay.wet : 0;
    engine.throwInstrumentToEffect(instrumentId, "SpaceEcho", active ? 1 : baseline);
  };
  const renderWaveSelector = (currentType, onSelect, label) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold text-text-muted uppercase tracking-wide text-center", children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
      lineNumber: 67,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 justify-center", children: ["sine", "square", "sawtooth", "triangle"].map((type) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => onSelect(type),
        className: `
              w-10 h-10 rounded border transition-all flex items-center justify-center
              ${currentType === type ? `bg-dark-bgSecondary` : "bg-[#1a1a1a] border-dark-borderLight hover:border-dark-borderLight"}
            `,
        style: currentType === type ? { borderColor: accentColor, boxShadow: `0 0 10px ${accentColor}40` } : void 0,
        title: type,
        children: [
          type === "sine" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, color: currentType === type ? accentColor : "#666" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 84,
            columnNumber: 33
          }, void 0),
          type === "square" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-4 h-4 border-t-2 border-r-2 border-b-0 border-l-2", style: { borderColor: currentType === type ? accentColor : "#666" } }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 85,
            columnNumber: 35
          }, void 0),
          type === "sawtooth" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, color: currentType === type ? accentColor : "#666" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 86,
            columnNumber: 37
          }, void 0),
          type === "triangle" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-transparent border-b-current", style: { color: currentType === type ? accentColor : "#666" } }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 87,
            columnNumber: 37
          }, void 0)
        ]
      },
      type,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 70,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
      lineNumber: 68,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
    lineNumber: 66,
    columnNumber: 5
  }, void 0);
  const renderMainTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Speaker, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-red-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 99,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-red-400"}`, children: "OSCILLATOR" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 100,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 98,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col md:flex-row gap-3 items-center gap-3", children: [
        renderWaveSelector(config.oscillator.type, (t) => updateOsc({ type: t }), "Waveform"),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.oscillator.frequency,
            min: 60,
            max: 1e3,
            onChange: (v) => updateOsc({ frequency: v }),
            label: "Freq",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 106,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 103,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
      lineNumber: 97,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-red-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 122,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-red-400"}`, children: "LFO MODULATION" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 123,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 121,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 cursor-pointer", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted", children: "Enable" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 126,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: config.lfo.enabled,
              onChange: (e) => updateLFO({ enabled: e.target.checked }),
              className: `w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? "border-accent-highlight checked:bg-accent-highlight" : "border-red-500 checked:bg-red-500"}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
              lineNumber: 127,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 125,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 120,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `transition-opacity ${config.lfo.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col md:flex-row gap-3 items-center gap-3", children: [
        renderWaveSelector(config.lfo.type, (t) => updateLFO({ type: t }), "LFO Shape"),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.lfo.rate,
            min: 0.1,
            max: 20,
            onChange: (v) => updateLFO({ rate: v }),
            label: "Rate",
            color: knobColor,
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 140,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.lfo.depth,
            min: 0,
            max: 500,
            onChange: (v) => updateLFO({ depth: v }),
            label: "Depth",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 150,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 137,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 136,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
      lineNumber: 119,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
    lineNumber: 95,
    columnNumber: 5
  }, void 0);
  const renderFXTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Repeat, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-red-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 171,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-red-400"}`, children: "DELAY" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 172,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 170,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 cursor-pointer", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted", children: "Enable" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 175,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: config.delay.enabled,
              onChange: (e) => updateDelay({ enabled: e.target.checked }),
              className: `w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? "border-accent-highlight checked:bg-accent-highlight" : "border-red-500 checked:bg-red-500"}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
              lineNumber: 176,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 174,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 169,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex gap-3 transition-opacity ${config.delay.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.delay.time,
            min: 0.01,
            max: 1,
            onChange: (v) => updateDelay({ time: v }),
            label: "Time",
            color: knobColor,
            formatValue: (v) => `${(v * 1e3).toFixed(0)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 186,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.delay.feedback,
            min: 0,
            max: 0.95,
            onChange: (v) => updateDelay({ feedback: v }),
            label: "Fdbk",
            color: knobColor,
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 195,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.delay.wet,
            min: 0,
            max: 1,
            onChange: (v) => updateDelay({ wet: v }),
            label: "Mix",
            color: knobColor,
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 204,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-muted uppercase", children: "Throw" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 216,
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
                ${isCyanTheme ? "bg-accent-highlight/20 border-2 border-accent-highlight text-accent-highlight" : "bg-red-500/20 border-2 border-red-500 text-red-500"}
                hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]
              `,
              title: "Momentary Delay Throw (Dub Style)",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Wind, { size: 20 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
                lineNumber: 232,
                columnNumber: 15
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
              lineNumber: 217,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 215,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 185,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
      lineNumber: 168,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Funnel, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-red-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 242,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-red-400"}`, children: "FILTER" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 243,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 241,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 cursor-pointer", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted", children: "Enable" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 246,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: config.filter.enabled,
              onChange: (e) => updateFilter({ enabled: e.target.checked }),
              className: `w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? "border-accent-highlight checked:bg-accent-highlight" : "border-red-500 checked:bg-red-500"}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
              lineNumber: 247,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 245,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 240,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex flex-col items-center gap-4 transition-opacity ${config.filter.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: ["lowpass", "highpass", "bandpass", "notch"].map((type) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateFilter({ type }),
            className: `
                  px-3 py-1 text-xs font-bold rounded border uppercase
                  ${config.filter.type === type ? `bg-dark-bgSecondary` : "bg-[#1a1a1a] border-dark-borderLight text-text-muted hover:border-dark-borderLight"}
                `,
            style: config.filter.type === type ? { borderColor: accentColor, color: accentColor } : void 0,
            children: type
          },
          type,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 260,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 258,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [-12, -24, -48, -96].map((roll) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateFilter({ rolloff: roll }),
            className: `
                  px-3 py-1 text-xs font-bold rounded border
                  ${config.filter.rolloff === roll ? `bg-dark-bgSecondary` : "bg-[#1a1a1a] border-dark-borderLight text-text-muted hover:border-dark-borderLight"}
                `,
            style: config.filter.rolloff === roll ? { borderColor: accentColor, color: accentColor } : void 0,
            children: [
              roll,
              "dB"
            ]
          },
          roll,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 280,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 278,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filter.frequency,
            min: 20,
            max: 1e4,
            onChange: (v) => updateFilter({ frequency: v }),
            label: "Cutoff",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 297,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FilterFrequencyResponse,
          {
            filterType: config.filter.type,
            cutoff: Math.log10(Math.max(config.filter.frequency, 20) / 20) / 3,
            resonance: 0,
            poles: 2,
            color: knobColor,
            width: 300,
            height: 56
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 307,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 256,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
      lineNumber: 239,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-red-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 322,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-red-400"}`, children: "REVERB" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 323,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 321,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 cursor-pointer", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted", children: "Enable" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 326,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: config.reverb.enabled,
              onChange: (e) => updateReverb({ enabled: e.target.checked }),
              className: `w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? "border-accent-highlight checked:bg-accent-highlight" : "border-red-500 checked:bg-red-500"}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
              lineNumber: 327,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 325,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 320,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex gap-3 transition-opacity ${config.reverb.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.reverb.decay,
            min: 0.1,
            max: 10,
            onChange: (v) => updateReverb({ decay: v }),
            label: "Decay",
            color: knobColor,
            formatValue: (v) => `${v.toFixed(1)}s`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 337,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.reverb.wet,
            min: 0,
            max: 1,
            onChange: (v) => updateReverb({ wet: v }),
            label: "Mix",
            color: knobColor,
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
            lineNumber: 346,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
        lineNumber: 336,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
      lineNumber: 319,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
    lineNumber: 166,
    columnNumber: 5
  }, void 0);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b border-dark-border bg-dark-bg", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab("main"),
          className: `
            flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors
            ${activeTab === "main" ? `bg-[#252525] border-b-2` : "text-text-muted hover:text-text-secondary"}
          `,
          style: activeTab === "main" ? { color: accentColor, borderColor: accentColor } : void 0,
          children: "Oscillator & LFO"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 364,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab("fx"),
          className: `
            flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors
            ${activeTab === "fx" ? `bg-[#252525] border-b-2` : "text-text-muted hover:text-text-secondary"}
          `,
          style: activeTab === "fx" ? { color: accentColor, borderColor: accentColor } : void 0,
          children: "Effects & Filter"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
          lineNumber: 377,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
      lineNumber: 363,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow flex-1 overflow-y-auto", children: activeTab === "main" ? renderMainTab() : renderFXTab() }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
      lineNumber: 393,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DubSirenControls.tsx",
    lineNumber: 361,
    columnNumber: 5
  }, void 0);
};
export {
  DubSirenControls
};
