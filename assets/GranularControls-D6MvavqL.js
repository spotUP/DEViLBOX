import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const GranularControls = ({
  config,
  onChange
}) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#a78bfa");
  const knobColor2 = isCyanTheme ? "#00cccc" : "#8b5cf6";
  const knobColor3 = isCyanTheme ? "#009999" : "#7c3aed";
  const knobColorEnv = isCyanTheme ? "#00aaaa" : "#c4b5fd";
  const knobColorFilter = isCyanTheme ? "#008888" : "#6d28d9";
  const update = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
  }, [onChange]);
  const updateEnvelope = reactExports.useCallback((updates) => {
    onChange({ envelope: { ...configRef.current.envelope, ...updates } });
  }, [onChange]);
  const updateFilter = reactExports.useCallback((updates) => {
    onChange({ filter: { ...configRef.current.filter, ...updates } });
  }, [onChange]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow flex-1 overflow-y-auto p-4 flex flex-col gap-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-3 rounded-xl border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] font-bold text-text-muted uppercase tracking-wide mb-1", children: "Sample" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 40,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-secondary truncate font-mono", children: config.sampleUrl || "(no sample loaded)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 41,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
      lineNumber: 39,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-bold uppercase tracking-wide mb-3", style: { color: accentColor }, children: "Grain" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 48,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-end gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.grainSize,
            min: 10,
            max: 500,
            onChange: (v) => update("grainSize", v),
            label: "Size",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 50,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.grainOverlap,
            min: 0,
            max: 100,
            onChange: (v) => update("grainOverlap", v),
            label: "Overlap",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 56,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.density,
            min: 1,
            max: 16,
            onChange: (v) => update("density", Math.round(v)),
            label: "Density",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 62,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => update("reverse", !config.reverse),
            className: `px-3 py-2 rounded text-xs font-bold transition-all ${config.reverse ? "bg-purple-500/20 border border-purple-500 text-purple-400" : "bg-dark-bgTertiary borderLight text-text-secondary hover:border-dark-borderLight"}`,
            children: "REV"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 68,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 49,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
      lineNumber: 47,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-bold uppercase tracking-wide mb-3", style: { color: accentColor }, children: "Playback" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 83,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-end gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.scanPosition,
            min: 0,
            max: 100,
            onChange: (v) => update("scanPosition", v),
            label: "Position",
            color: knobColor2,
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 85,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.scanSpeed,
            min: -100,
            max: 100,
            bipolar: true,
            onChange: (v) => update("scanSpeed", v),
            label: "Scan Spd",
            color: knobColor2,
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 91,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.playbackRate,
            min: 0.25,
            max: 4,
            step: 0.01,
            onChange: (v) => update("playbackRate", v),
            label: "Speed",
            color: knobColor2,
            formatValue: (v) => `${v.toFixed(2)}x`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 97,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.detune,
            min: -1200,
            max: 1200,
            bipolar: true,
            onChange: (v) => update("detune", v),
            label: "Detune",
            color: knobColor2,
            formatValue: (v) => `${Math.round(v)}¢`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 103,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 84,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
      lineNumber: 82,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-bold uppercase tracking-wide mb-3", style: { color: accentColor }, children: "Random" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 114,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-end gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.randomPitch,
            min: 0,
            max: 100,
            onChange: (v) => update("randomPitch", v),
            label: "Rnd Pitch",
            color: knobColor3,
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 116,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.randomPosition,
            min: 0,
            max: 100,
            onChange: (v) => update("randomPosition", v),
            label: "Rnd Pos",
            color: knobColor3,
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 122,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 115,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
      lineNumber: 113,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-bold uppercase tracking-wide mb-3", style: { color: accentColor }, children: "Grain Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 133,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-end gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.envelope.attack,
            min: 1,
            max: 100,
            onChange: (v) => updateEnvelope({ attack: v }),
            label: "Attack",
            color: knobColorEnv,
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 135,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.envelope.release,
            min: 1,
            max: 100,
            onChange: (v) => updateEnvelope({ release: v }),
            label: "Release",
            color: knobColorEnv,
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 141,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 134,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
      lineNumber: 132,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-bold uppercase tracking-wide mb-3", style: { color: accentColor }, children: "Filter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 152,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: ["lowpass", "highpass", "bandpass", "notch"].map((type) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateFilter({ type }),
            className: `px-3 py-1 text-xs font-bold rounded border uppercase ${config.filter.type === type ? "bg-dark-bgSecondary" : "bg-[#1a1a1a] border-dark-borderLight text-text-muted hover:border-dark-borderLight"}`,
            style: config.filter.type === type ? { borderColor: accentColor, color: accentColor } : void 0,
            children: type.slice(0, 4)
          },
          type,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
            lineNumber: 156,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
          lineNumber: 154,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-end gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.filter.cutoff,
              min: 20,
              max: 2e4,
              onChange: (v) => updateFilter({ cutoff: v }),
              label: "Cutoff",
              color: knobColorFilter,
              formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
              lineNumber: 171,
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
              color: knobColorFilter,
              formatValue: (v) => `${Math.round(v)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
              lineNumber: 177,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
          lineNumber: 170,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
        lineNumber: 153,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
      lineNumber: 151,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GranularControls.tsx",
    lineNumber: 37,
    columnNumber: 5
  }, void 0);
};
export {
  GranularControls
};
