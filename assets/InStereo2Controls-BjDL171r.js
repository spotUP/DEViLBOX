import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob, W as CustomSelect, cB as PatternEditorCanvas } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { W as WaveformLineCanvas, B as BarChart } from "./BarChart-CuXp5QZ0.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function signedHex2(val) {
  return (val & 255).toString(16).toUpperCase().padStart(2, "0");
}
const ARP_COLUMN = [
  {
    key: "semitone",
    label: "ST",
    charWidth: 2,
    type: "hex",
    color: "#ffcc66",
    emptyColor: "#334455",
    emptyValue: void 0,
    hexDigits: 2,
    formatter: signedHex2
  }
];
function arpToFormatChannel(arp, label) {
  const rows = arp.values.slice(0, 14).map((v) => ({
    semitone: v & 255
  }));
  return {
    label,
    patternLength: 14,
    rows,
    isPatternChannel: false
  };
}
function makeArpCellChange(configRef, tableIdx, onChange) {
  return (_channelIdx, rowIdx, _columnKey, value) => {
    const signed = value > 127 ? value - 256 : value;
    const arps = configRef.current.arpeggios.map((a, i) => {
      if (i !== tableIdx) return { ...a };
      const vals = [...a.values];
      vals[rowIdx] = signed;
      return { ...a, values: vals };
    });
    onChange({ ...configRef.current, arpeggios: arps });
  };
}
const EG_MODES = [
  { value: 0, name: "Disabled" },
  { value: 1, name: "Calc" },
  { value: 2, name: "Free" }
];
const InStereo2Controls = ({
  config,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("synthesis");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#ff8844", { knob: "#ffaa66", dim: "#331a00" });
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const renderSynthesis = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume & Waveform" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 113,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.volume,
            min: 0,
            max: 64,
            step: 1,
            onChange: (v) => updateParam("volume", Math.round(v)),
            label: "Volume",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 115,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.waveformLength,
            min: 2,
            max: 256,
            step: 2,
            onChange: (v) => updateParam("waveformLength", Math.round(v)),
            label: "Wave Len",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 119,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 114,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
      lineNumber: 112,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Waveform 1" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 128,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        WaveformLineCanvas,
        {
          data: config.waveform1,
          width: 320,
          height: 72,
          color: accent,
          label: "WF1"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
          lineNumber: 129,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
      lineNumber: 127,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Waveform 2" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 139,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        WaveformLineCanvas,
        {
          data: config.waveform2,
          width: 320,
          height: 72,
          color: isCyan ? "#00cc99" : "#cc6633",
          label: "WF2"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
          lineNumber: 140,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
      lineNumber: 138,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
    lineNumber: 109,
    columnNumber: 5
  }, void 0);
  const adsrMarkers = reactExports.useMemo(() => {
    const m = [];
    if (config.sustainPoint > 0) m.push({ pos: config.sustainPoint, color: "#ffff00", label: "S" });
    if (config.adsrLength > 0) m.push({ pos: config.adsrLength, color: "#ff4444", label: "L" });
    if (config.adsrRepeat > 0) m.push({ pos: config.adsrRepeat, color: "#44ff44", label: "R" });
    return m;
  }, [config.sustainPoint, config.adsrLength, config.adsrRepeat]);
  const egMarkers = reactExports.useMemo(() => {
    const m = [];
    if (config.egMode === 2 && config.egStartLen > 0) m.push({ pos: config.egStartLen, color: "#ff4444", label: "L" });
    return m;
  }, [config.egMode, config.egStartLen]);
  const renderEnvelope = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "ADSR Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 171,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 flex-wrap", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.adsrLength,
            min: 0,
            max: 127,
            step: 1,
            onChange: (v) => updateParam("adsrLength", Math.round(v)),
            label: "Length",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 173,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.adsrRepeat,
            min: 0,
            max: 127,
            step: 1,
            onChange: (v) => updateParam("adsrRepeat", Math.round(v)),
            label: "Repeat",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 177,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.sustainPoint,
            min: 0,
            max: 127,
            step: 1,
            onChange: (v) => updateParam("sustainPoint", Math.round(v)),
            label: "Sus Point",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 181,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.sustainSpeed,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("sustainSpeed", Math.round(v)),
            label: "Sus Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 185,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 172,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        BarChart,
        {
          data: config.adsrTable,
          width: 320,
          height: 56,
          color: accent,
          markers: adsrMarkers
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
          lineNumber: 191,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 190,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
      lineNumber: 170,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Envelope Generator (EG)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 202,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: String(config.egMode),
          onChange: (v) => updateParam("egMode", parseInt(v)),
          options: EG_MODES.map((m) => ({ value: String(m.value), label: m.name })),
          className: "w-full text-xs font-mono border rounded px-2 py-1.5 mb-3",
          style: { background: "#0a0a0a", borderColor: dim, color: accent }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
          lineNumber: 203,
          columnNumber: 9
        },
        void 0
      ),
      config.egMode !== 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        config.egMode === 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.egStartLen,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updateParam("egStartLen", Math.round(v)),
              label: "Start/Len",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
              lineNumber: 215,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.egStopRep,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updateParam("egStopRep", Math.round(v)),
              label: "Stop/Rep",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
              lineNumber: 219,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.egSpeedUp,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updateParam("egSpeedUp", Math.round(v)),
              label: "Speed Up",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
              lineNumber: 223,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.egSpeedDown,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updateParam("egSpeedDown", Math.round(v)),
              label: "Speed Dn",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
              lineNumber: 227,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
          lineNumber: 214,
          columnNumber: 15
        }, void 0),
        config.egMode === 2 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.egStartLen,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updateParam("egStartLen", Math.round(v)),
              label: "Start Len",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
              lineNumber: 235,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.egStopRep,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updateParam("egStopRep", Math.round(v)),
              label: "Stop Rep",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
              lineNumber: 239,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
          lineNumber: 234,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          BarChart,
          {
            data: config.egTable,
            width: 320,
            height: 48,
            color: isCyan ? "#00cc99" : "#cc6633",
            markers: egMarkers
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 246,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
          lineNumber: 245,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 212,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
      lineNumber: 201,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
    lineNumber: 167,
    columnNumber: 5
  }, void 0);
  const renderModulation = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 266,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoDelay,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("vibratoDelay", Math.round(v)),
            label: "Delay",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 268,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoSpeed,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("vibratoSpeed", Math.round(v)),
            label: "Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 272,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoLevel,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("vibratoLevel", Math.round(v)),
            label: "Level",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 276,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 267,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
      lineNumber: 265,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Portamento" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 285,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.portamentoSpeed,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("portamentoSpeed", Math.round(v)),
            label: "Speed",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 287,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "0 = disabled" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
          lineNumber: 291,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 286,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
      lineNumber: 284,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "LFO (Pitch Modulation)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 297,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.amfLength,
            min: 0,
            max: 127,
            step: 1,
            onChange: (v) => updateParam("amfLength", Math.round(v)),
            label: "Length",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 299,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.amfRepeat,
            min: 0,
            max: 127,
            step: 1,
            onChange: (v) => updateParam("amfRepeat", Math.round(v)),
            label: "Repeat",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 303,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 298,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        BarChart,
        {
          data: config.lfoTable,
          width: 320,
          height: 56,
          color: accent,
          signed: true
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
          lineNumber: 309,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 308,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
      lineNumber: 296,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
    lineNumber: 262,
    columnNumber: 5
  }, void 0);
  const updateArpField = reactExports.useCallback(
    (index, field, value) => {
      const arps = configRef.current.arpeggios.map(
        (a, i) => i === index ? { ...a, [field]: value } : { ...a }
      );
      onChange({ ...configRef.current, arpeggios: arps });
    },
    [onChange]
  );
  const arpChannels = reactExports.useMemo(
    () => [0, 1, 2].map(
      (tIdx) => [arpToFormatChannel(config.arpeggios[tIdx], `Arp ${tIdx + 1}`)]
    ),
    [config.arpeggios]
  );
  const arpCellChanges = reactExports.useMemo(
    () => [0, 1, 2].map(
      (tIdx) => makeArpCellChange(configRef, tIdx, onChange)
    ),
    [onChange]
  );
  const renderArpeggio = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Arpeggio Tables" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
      lineNumber: 350,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [0, 1, 2].map((tIdx) => {
      const arp = config.arpeggios[tIdx];
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "rounded border p-2", style: { borderColor: dim, background: "#0a0a0a" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold", style: { color: accent }, children: [
            "Arp ",
            tIdx + 1
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 357,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[9px] text-text-muted", children: "Len" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
              lineNumber: 361,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: 0,
                max: 14,
                value: arp.length,
                onChange: (e) => updateArpField(tIdx, "length", Math.max(0, Math.min(14, parseInt(e.target.value) || 0))),
                className: "w-10 text-[10px] font-mono text-center border rounded px-1 py-0.5",
                style: { background: "var(--color-bg-secondary)", borderColor: dim, color: "var(--color-text-secondary)" }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
                lineNumber: 362,
                columnNumber: 21
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 360,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[9px] text-text-muted", children: "Rep" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
              lineNumber: 371,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: 0,
                max: 14,
                value: arp.repeat,
                onChange: (e) => updateArpField(tIdx, "repeat", Math.max(0, Math.min(14, parseInt(e.target.value) || 0))),
                className: "w-10 text-[10px] font-mono text-center border rounded px-1 py-0.5",
                style: { background: "var(--color-bg-secondary)", borderColor: dim, color: "var(--color-text-secondary)" }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
                lineNumber: 372,
                columnNumber: 21
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 370,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
          lineNumber: 356,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 240 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          PatternEditorCanvas,
          {
            formatColumns: ARP_COLUMN,
            formatChannels: arpChannels[tIdx],
            formatCurrentRow: 0,
            formatIsPlaying: false,
            onFormatCellChange: arpCellChanges[tIdx],
            hideVUMeters: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
            lineNumber: 382,
            columnNumber: 19
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
          lineNumber: 381,
          columnNumber: 17
        }, void 0)
      ] }, tIdx, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 355,
        columnNumber: 15
      }, void 0);
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
      lineNumber: 351,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
    lineNumber: 349,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
    lineNumber: 348,
    columnNumber: 5
  }, void 0);
  const tabs = reactExports.useMemo(() => [
    ["synthesis", "Synthesis"],
    ["envelope", "Envelope"],
    ["modulation", "Modulation"],
    ["arpeggio", "Arpeggio"]
  ], []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dim }, children: tabs.map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(id),
        className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
        style: {
          color: activeTab === id ? accent : "#666",
          borderBottom: activeTab === id ? `2px solid ${accent}` : "2px solid transparent",
          background: activeTab === id ? isCyan ? "#041510" : "#140a00" : "transparent"
        },
        children: label
      },
      id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
        lineNumber: 412,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
      lineNumber: 410,
      columnNumber: 7
    }, void 0),
    activeTab === "synthesis" && renderSynthesis(),
    activeTab === "envelope" && renderEnvelope(),
    activeTab === "modulation" && renderModulation(),
    activeTab === "arpeggio" && renderArpeggio()
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/InStereo2Controls.tsx",
    lineNumber: 409,
    columnNumber: 5
  }, void 0);
};
export {
  InStereo2Controls
};
