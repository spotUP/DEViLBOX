import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cz as hivelyPerfListToFormatChannel, cA as makePerfListCellChange, aB as Knob, cB as PatternEditorCanvas, cC as HIVELY_PERFLIST_COLUMNS } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
const WAVE_LENGTH_LABELS = ["4", "8", "16", "32", "64", "128"];
const PL_FX_NAMES = {
  0: "Filter",
  1: "Slide Up",
  2: "Slide Dn",
  3: "Square",
  4: "Flt Mod",
  5: "Jump",
  6: "Raw Tri",
  7: "Raw Saw",
  8: "Raw Sqr",
  9: "Raw Nse",
  10: "--",
  11: "--",
  12: "Volume",
  13: "--",
  14: "--",
  15: "Speed"
};
const HivelyControls = ({
  config,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("main");
  const [perfCursorY, setPerfCursorY] = reactExports.useState(0);
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor, dim: dimColor, panelBg, panelStyle } = useInstrumentColors("#44ff88", { knob: "#66ddaa", dim: "#1a3328" });
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
  }, [onChange]);
  const updateEnvelope = reactExports.useCallback((updates) => {
    onChange({ envelope: { ...configRef.current.envelope, ...updates } });
  }, [onChange]);
  const updatePerfList = reactExports.useCallback((updates) => {
    onChange({ performanceList: { ...configRef.current.performanceList, ...updates } });
  }, [onChange]);
  const insertPerfRow = reactExports.useCallback((atIndex) => {
    const entries = [...configRef.current.performanceList.entries];
    if (entries.length >= 255) return;
    const blank = { note: 0, waveform: 0, fixed: false, fx: [0, 0], fxParam: [0, 0] };
    entries.splice(atIndex, 0, blank);
    onChange({ performanceList: { ...configRef.current.performanceList, entries } });
  }, [onChange]);
  const deletePerfRow = reactExports.useCallback((atIndex) => {
    const entries = [...configRef.current.performanceList.entries];
    if (entries.length <= 1) return;
    entries.splice(atIndex, 1);
    onChange({ performanceList: { ...configRef.current.performanceList, entries } });
    if (perfCursorY >= entries.length) setPerfCursorY(entries.length - 1);
  }, [onChange, perfCursorY]);
  const NumberBox = ({ label, value, min, max, onChange: onBoxChange, width = "48px" }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-secondary w-16 text-right whitespace-nowrap", children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
      lineNumber: 86,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "input",
      {
        type: "number",
        value,
        min,
        max,
        onChange: (e) => {
          const v = parseInt(e.target.value);
          if (!isNaN(v)) onBoxChange(Math.max(min, Math.min(max, v)));
        },
        className: "text-xs font-mono text-center border rounded px-1 py-0.5",
        style: {
          width,
          background: "#0a0f0c",
          borderColor: dimColor,
          color: accentColor
        }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 87,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
    lineNumber: 85,
    columnNumber: 5
  }, void 0);
  const renderMainTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4 p-3 overflow-y-auto synth-controls-flow", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: "Volume & Wave" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 112,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.volume,
            min: 0,
            max: 64,
            step: 1,
            onChange: (v) => updateParam("volume", Math.round(v)),
            label: "Volume",
            color: knobColor,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 114,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-secondary uppercase tracking-wide", children: "Wave Length" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 119,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: WAVE_LENGTH_LABELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateParam("waveLength", i),
              className: "px-2 py-1 text-xs font-mono rounded transition-colors",
              style: {
                background: config.waveLength === i ? accentColor : "#111",
                color: config.waveLength === i ? "#000" : "#666",
                border: `1px solid ${config.waveLength === i ? accentColor : "var(--color-border-light)"}`
              },
              children: label
            },
            i,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
              lineNumber: 122,
              columnNumber: 17
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 120,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
          lineNumber: 118,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 113,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
      lineNumber: 111,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: "Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 140,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.envelope.aFrames,
              min: 1,
              max: 255,
              step: 1,
              onChange: (v) => updateEnvelope({ aFrames: Math.round(v) }),
              label: "A.Time",
              color: knobColor,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
              lineNumber: 143,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.envelope.aVolume,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => updateEnvelope({ aVolume: Math.round(v) }),
              label: "A.Vol",
              color: knobColor,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
              lineNumber: 147,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
          lineNumber: 142,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.envelope.dFrames,
              min: 1,
              max: 255,
              step: 1,
              onChange: (v) => updateEnvelope({ dFrames: Math.round(v) }),
              label: "D.Time",
              color: knobColor,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
              lineNumber: 153,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.envelope.dVolume,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => updateEnvelope({ dVolume: Math.round(v) }),
              label: "D.Vol",
              color: knobColor,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
              lineNumber: 157,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
          lineNumber: 152,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.envelope.sFrames,
            min: 1,
            max: 255,
            step: 1,
            onChange: (v) => updateEnvelope({ sFrames: Math.round(v) }),
            label: "S.Time",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 163,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
          lineNumber: 162,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.envelope.rFrames,
              min: 1,
              max: 255,
              step: 1,
              onChange: (v) => updateEnvelope({ rFrames: Math.round(v) }),
              label: "R.Time",
              color: knobColor,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
              lineNumber: 169,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.envelope.rVolume,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => updateEnvelope({ rVolume: Math.round(v) }),
              label: "R.Vol",
              color: knobColor,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
              lineNumber: 173,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
          lineNumber: 168,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 141,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        EnvelopeVisualization,
        {
          mode: "steps",
          attackVol: config.envelope.aVolume,
          attackSpeed: config.envelope.aFrames,
          decayVol: config.envelope.dVolume,
          decaySpeed: config.envelope.dFrames,
          sustainVol: config.envelope.dVolume,
          sustainLen: config.envelope.sFrames,
          releaseVol: config.envelope.rVolume,
          releaseSpeed: config.envelope.rFrames,
          maxVol: 64,
          color: knobColor,
          width: 320,
          height: 56
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
          lineNumber: 180,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 179,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
      lineNumber: 139,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: "Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 200,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoDelay,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("vibratoDelay", Math.round(v)),
            label: "Delay",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 202,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoDepth,
            min: 0,
            max: 15,
            step: 1,
            onChange: (v) => updateParam("vibratoDepth", Math.round(v)),
            label: "Depth",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 206,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoSpeed,
            min: 0,
            max: 63,
            step: 1,
            onChange: (v) => updateParam("vibratoSpeed", Math.round(v)),
            label: "Speed",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 210,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 201,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
      lineNumber: 199,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: "Square Modulation" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 219,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.squareLowerLimit,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("squareLowerLimit", Math.round(v)),
            label: "Lower",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 221,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.squareUpperLimit,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("squareUpperLimit", Math.round(v)),
            label: "Upper",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 225,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.squareSpeed,
            min: 0,
            max: 63,
            step: 1,
            onChange: (v) => updateParam("squareSpeed", Math.round(v)),
            label: "Speed",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 229,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 220,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
      lineNumber: 218,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: "Filter Modulation" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 238,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filterLowerLimit,
            min: 0,
            max: 127,
            step: 1,
            onChange: (v) => updateParam("filterLowerLimit", Math.round(v)),
            label: "Lower",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 240,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filterUpperLimit,
            min: 0,
            max: 63,
            step: 1,
            onChange: (v) => updateParam("filterUpperLimit", Math.round(v)),
            label: "Upper",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 244,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.filterSpeed,
            min: 0,
            max: 63,
            step: 1,
            onChange: (v) => updateParam("filterSpeed", Math.round(v)),
            label: "Speed",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 248,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 239,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
      lineNumber: 237,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: "Hard Cut" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 257,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam("hardCutRelease", !config.hardCutRelease),
            className: "px-3 py-1.5 text-xs font-mono rounded transition-colors",
            style: {
              background: config.hardCutRelease ? accentColor : "#111",
              color: config.hardCutRelease ? "#000" : "#666",
              border: `1px solid ${config.hardCutRelease ? accentColor : "var(--color-border-light)"}`
            },
            children: config.hardCutRelease ? "ON" : "OFF"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 259,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.hardCutReleaseFrames,
            min: 0,
            max: 7,
            step: 1,
            onChange: (v) => updateParam("hardCutReleaseFrames", Math.round(v)),
            label: "Frames",
            color: knobColor,
            formatValue: (v) => Math.round(v).toString(),
            disabled: !config.hardCutRelease
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 269,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 258,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
      lineNumber: 256,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
    lineNumber: 109,
    columnNumber: 5
  }, void 0);
  const perfListChannels = reactExports.useMemo(
    () => hivelyPerfListToFormatChannel(config),
    [config]
  );
  const perfListCellChange = reactExports.useMemo(
    () => makePerfListCellChange(config, onChange),
    [config, onChange]
  );
  const renderPerfListTab = () => {
    const entries = config.performanceList.entries;
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 p-3", style: { maxHeight: "calc(100vh - 280px)" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 mb-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          NumberBox,
          {
            label: "Speed",
            value: config.performanceList.speed,
            min: 0,
            max: 255,
            onChange: (v) => updatePerfList({ speed: v })
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 296,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          NumberBox,
          {
            label: "Length",
            value: entries.length,
            min: 1,
            max: 255,
            onChange: () => {
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 298,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 ml-auto", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => insertPerfRow(perfCursorY),
              className: "px-3 py-2 text-xs font-mono rounded border transition-colors hover:opacity-80 min-h-[36px]",
              style: { borderColor: dimColor, color: accentColor, background: "var(--color-bg-secondary)" },
              title: "Insert row (Shift+Enter)",
              children: "+Row"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
              lineNumber: 301,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => deletePerfRow(perfCursorY),
              className: "px-3 py-2 text-xs font-mono rounded border transition-colors hover:opacity-80 min-h-[36px]",
              style: { borderColor: dimColor, color: "#ff6666", background: "var(--color-bg-secondary)" },
              title: "Delete row (Shift+Backspace)",
              children: "-Row"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
              lineNumber: 308,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
          lineNumber: 300,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 295,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 200 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        PatternEditorCanvas,
        {
          formatColumns: HIVELY_PERFLIST_COLUMNS,
          formatChannels: perfListChannels,
          formatCurrentRow: 0,
          formatIsPlaying: false,
          onFormatCellChange: perfListCellChange,
          hideVUMeters: true
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
          lineNumber: 320,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 319,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "mt-2 p-2 rounded border text-[10px] font-mono grid grid-cols-4 gap-x-3 gap-y-1",
          style: { borderColor: dimColor, color: "var(--color-text-muted)" },
          children: Object.entries(PL_FX_NAMES).map(([code, name]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: accentColor }, children: parseInt(code).toString(16).toUpperCase() }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
              lineNumber: 335,
              columnNumber: 15
            }, void 0),
            "=",
            name
          ] }, code, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
            lineNumber: 334,
            columnNumber: 13
          }, void 0))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
          lineNumber: 331,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
      lineNumber: 293,
      columnNumber: 7
    }, void 0);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dimColor }, children: [["main", "Parameters"], ["perflist", "Perf. List"]].map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(id),
        className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
        style: {
          color: activeTab === id ? accentColor : "#666",
          borderBottom: activeTab === id ? `2px solid ${accentColor}` : "2px solid transparent",
          background: activeTab === id ? isCyanTheme ? "#041510" : "#0a1a12" : "transparent"
        },
        children: label
      },
      id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
        lineNumber: 350,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
      lineNumber: 348,
      columnNumber: 7
    }, void 0),
    activeTab === "main" && renderMainTab(),
    activeTab === "perflist" && renderPerfListTab()
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HivelyControls.tsx",
    lineNumber: 346,
    columnNumber: 5
  }, void 0);
};
export {
  HivelyControls
};
