import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, Z as Zap, Y as Wind, Q as Activity, _ as Funnel, W as Repeat, $ as Waves } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { F as FilterFrequencyResponse } from "./FilterFrequencyResponse-BHF9gTID.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const SpaceLaserControls = ({
  config,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("laser");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#00ff00", { knob: "#88ff88" });
  const updateLaser = (updates) => {
    onChange({ laser: { ...configRef.current.laser, ...updates } });
  };
  const updateFM = (updates) => {
    onChange({ fm: { ...configRef.current.fm, ...updates } });
  };
  const updateNoise = (updates) => {
    onChange({ noise: { ...configRef.current.noise, ...updates } });
  };
  const updateDelay = (updates) => {
    onChange({ delay: { ...configRef.current.delay, ...updates } });
  };
  const updateReverb = (updates) => {
    onChange({ reverb: { ...configRef.current.reverb, ...updates } });
  };
  const updateFilter = (updates) => {
    onChange({ filter: { ...configRef.current.filter, ...updates } });
  };
  const renderLaserTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-green-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 58,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-green-400"}`, children: "LASER SWEEP" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 59,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 57,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.laser.startFreq,
            min: 100,
            max: 1e4,
            onChange: (v) => updateLaser({ startFreq: v }),
            label: "Start",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 63,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.laser.endFreq,
            min: 20,
            max: 2e3,
            onChange: (v) => updateLaser({ endFreq: v }),
            label: "End",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 72,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.laser.sweepTime,
            min: 10,
            max: 2e3,
            onChange: (v) => updateLaser({ sweepTime: v }),
            label: "Time",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 81,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 62,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2 mt-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-muted uppercase", children: "Curve" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 93,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: ["exponential", "linear"].map((curve) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateLaser({ sweepCurve: curve }),
            className: `
                  px-2 py-1 text-[10px] font-bold rounded border uppercase
                  ${config.laser.sweepCurve === curve ? `bg-dark-bgSecondary` : "bg-[#1a1a1a] border-dark-borderLight text-text-muted hover:border-dark-borderLight"}
                `,
            style: config.laser.sweepCurve === curve ? { borderColor: accentColor, color: accentColor } : void 0,
            children: curve.slice(0, 3)
          },
          curve,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 96,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 94,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 92,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
      lineNumber: 56,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Wind, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-green-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 118,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-green-400"}`, children: "NOISE GRIT" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 119,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 117,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.noise.amount,
          min: 0,
          max: 100,
          onChange: (v) => updateNoise({ amount: v }),
          label: "Amount",
          color: knobColor,
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 123,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 122,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2 mt-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-muted uppercase", children: "Type" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 135,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: ["white", "pink", "brown"].map((type) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateNoise({ type }),
            className: `
                  px-2 py-1 text-[10px] font-bold rounded border uppercase
                  ${config.noise.type === type ? `bg-dark-bgSecondary` : "bg-[#1a1a1a] border-dark-borderLight text-text-muted hover:border-dark-borderLight"}
                `,
            style: config.noise.type === type ? { borderColor: accentColor, color: accentColor } : void 0,
            children: type[0]
          },
          type,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 138,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 136,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 134,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
      lineNumber: 116,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
    lineNumber: 54,
    columnNumber: 5
  }, void 0);
  const renderFMTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-green-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 164,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-green-400"}`, children: "FM MODULATION" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 165,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 163,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.fm.amount,
            min: 0,
            max: 100,
            onChange: (v) => updateFM({ amount: v }),
            label: "Index",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 169,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.fm.ratio,
            min: 0.5,
            max: 16,
            onChange: (v) => updateFM({ ratio: v }),
            label: "Ratio",
            color: knobColor,
            formatValue: (v) => `${v.toFixed(2)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 178,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 168,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
      lineNumber: 162,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Funnel, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-green-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 193,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-green-400"}`, children: "FILTER" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 194,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 192,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 w-full", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.filter.cutoff,
              min: 20,
              max: 15e3,
              onChange: (v) => updateFilter({ cutoff: v }),
              label: "Cutoff",
              color: knobColor,
              formatValue: (v) => `${Math.round(v)}Hz`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
              lineNumber: 199,
              columnNumber: 13
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
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
              lineNumber: 208,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 198,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FilterFrequencyResponse,
          {
            filterType: config.filter.type,
            cutoff: Math.log10(Math.max(config.filter.cutoff, 20) / 20) / 3,
            resonance: config.filter.resonance / 100,
            poles: 2,
            color: accentColor,
            width: 300,
            height: 56
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 219,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: ["lowpass", "highpass", "bandpass", "notch"].map((type) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateFilter({ type }),
            className: `
                  px-3 py-1 text-xs font-bold rounded border uppercase
                  ${config.filter.type === type ? `bg-dark-bgSecondary` : "bg-[#1a1a1a] border-dark-borderLight text-text-muted hover:border-dark-borderLight"}
                `,
            style: config.filter.type === type ? { borderColor: accentColor, color: accentColor } : void 0,
            children: type.slice(0, 4)
          },
          type,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 228,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 226,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 197,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
      lineNumber: 191,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
    lineNumber: 160,
    columnNumber: 5
  }, void 0);
  const renderFXTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Repeat, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-green-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 254,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-green-400"}`, children: "SPACE DELAY" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 255,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 253,
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 259,
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 268,
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 277,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 258,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1.5 pt-1.5 border-t border-dark-border/20", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 cursor-pointer", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted", children: "Enable" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 289,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "checkbox",
            checked: config.delay.enabled,
            onChange: (e) => updateDelay({ enabled: e.target.checked }),
            className: `w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? "border-accent-highlight checked:bg-accent-highlight" : "border-green-500 checked:bg-green-500"}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 290,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 288,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 287,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
      lineNumber: 252,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, className: isCyanTheme ? "text-accent-highlight" : "text-green-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 303,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: `font-bold ${isCyanTheme ? "text-accent-highlight" : "text-green-400"}`, children: "COSMIC REVERB" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 304,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 302,
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 308,
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 317,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 307,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-1.5 pt-1.5 border-t border-dark-border/20", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 cursor-pointer", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted", children: "Enable" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 329,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "checkbox",
            checked: config.reverb.enabled,
            onChange: (e) => updateReverb({ enabled: e.target.checked }),
            className: `w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? "border-accent-highlight checked:bg-accent-highlight" : "border-green-500 checked:bg-green-500"}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
            lineNumber: 330,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 328,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
        lineNumber: 327,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
      lineNumber: 301,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
    lineNumber: 250,
    columnNumber: 5
  }, void 0);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b border-dark-border bg-dark-bg", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab("laser"),
          className: `
            flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors
            ${activeTab === "laser" ? `bg-[#252525] border-b-2` : "text-text-muted hover:text-text-secondary"}
          `,
          style: activeTab === "laser" ? { color: accentColor, borderColor: accentColor } : void 0,
          children: "Laser & Noise"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 346,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab("fm"),
          className: `
            flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors
            ${activeTab === "fm" ? `bg-[#252525] border-b-2` : "text-text-muted hover:text-text-secondary"}
          `,
          style: activeTab === "fm" ? { color: accentColor, borderColor: accentColor } : void 0,
          children: "FM & Filter"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 359,
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
          children: "Space FX"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
          lineNumber: 372,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
      lineNumber: 345,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow flex-1 overflow-y-auto", children: activeTab === "laser" ? renderLaserTab() : activeTab === "fm" ? renderFMTab() : renderFXTab() }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
      lineNumber: 388,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SpaceLaserControls.tsx",
    lineNumber: 343,
    columnNumber: 5
  }, void 0);
};
export {
  SpaceLaserControls
};
