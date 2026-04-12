import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { W as CustomSelect, aB as Knob } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const INST_TYPES = {
  0: "Normal (one-shot)",
  4: "Loop",
  8: "Sustain",
  [-4 & 255]: "Kill",
  // -4 stored as number
  [-8 & 255]: "Silent"
  // -8 stored as number
};
function getTypeLabel(type) {
  if (type === -4 || type === 252) return "Kill";
  if (type === -8 || type === 248) return "Silent";
  return INST_TYPES[type] ?? `Type ${type}`;
}
const MULTI_CHANNEL_LABELS = {
  0: "Mono",
  1: "Stereo L",
  2: "Stereo R",
  3: "Line Source"
};
const SymphonieControls = ({
  config,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("general");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#bb88ff", { knob: "#cc99ff", dim: "#1a0033" });
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
  }, [onChange]);
  const renderGeneral = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Instrument Type" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 77,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(config.type),
            onChange: (v) => upd("type", parseInt(v, 10)),
            options: [
              { value: "0", label: "Normal (one-shot)" },
              { value: "4", label: "Loop" },
              { value: "8", label: "Sustain" },
              { value: "-4", label: "Kill" },
              { value: "-8", label: "Silent" }
            ],
            className: "text-xs px-2 py-1 rounded bg-black/30 border border-white/10 outline-none",
            style: { color: accent }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
            lineNumber: 79,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: getTypeLabel(config.type) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
          lineNumber: 92,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 78,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
      lineNumber: 76,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 98,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.volume,
            min: 0,
            max: 100,
            step: 1,
            onChange: (v) => upd("volume", Math.round(v)),
            label: "Volume",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
            lineNumber: 100,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "0-100 (Symphonie scale)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
          lineNumber: 106,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 99,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
      lineNumber: 97,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Tuning" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 112,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.tune,
            min: -48,
            max: 48,
            step: 1,
            onChange: (v) => upd("tune", Math.round(v)),
            label: "Tune",
            color: knob,
            size: "md",
            formatValue: (v) => {
              const r = Math.round(v);
              return r > 0 ? `+${r}` : `${r}`;
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
            lineNumber: 114,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.fineTune,
            min: -128,
            max: 127,
            step: 1,
            onChange: (v) => upd("fineTune", Math.round(v)),
            label: "Fine Tune",
            color: knob,
            size: "md",
            formatValue: (v) => {
              const r = Math.round(v);
              return r > 0 ? `+${r}` : `${r}`;
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
            lineNumber: 123,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 113,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mt-1", children: "Tune: semitone offset. Fine Tune: sub-semitone adjustment." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 133,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
      lineNumber: 111,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Sample Rate" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 140,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.sampledFrequency,
            min: 4e3,
            max: 48e3,
            step: 1,
            onChange: (v) => upd("sampledFrequency", Math.round(v)),
            label: "Rate",
            color: knob,
            size: "md",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
            lineNumber: 142,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Original sample rate (0 = 8363 Hz default)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
          lineNumber: 148,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 141,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
      lineNumber: 139,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
    lineNumber: 73,
    columnNumber: 5
  }, void 0);
  const renderLoop = () => {
    const loopPct = config.loopStart / (100 * 65536) * 100;
    const lenPct = config.loopLen / (100 * 65536) * 100;
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Loop Settings" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 163,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative h-6 rounded bg-black/40 mb-3 overflow-hidden", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "absolute h-full rounded opacity-40",
            style: {
              left: `${loopPct}%`,
              width: `${Math.min(lenPct, 100 - loopPct)}%`,
              background: accent
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
            lineNumber: 167,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "absolute text-[9px] left-1 top-1 text-text-muted", children: [
          "Start: ",
          loopPct.toFixed(1),
          "% | Len: ",
          lenPct.toFixed(1),
          "%"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
          lineNumber: 175,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 166,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: loopPct,
            min: 0,
            max: 100,
            step: 0.1,
            onChange: (v) => upd("loopStart", Math.round(v / 100 * 100 * 65536)),
            label: "Start %",
            color: knob,
            size: "md",
            formatValue: (v) => `${v.toFixed(1)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
            lineNumber: 181,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lenPct,
            min: 0,
            max: 100,
            step: 0.1,
            onChange: (v) => upd("loopLen", Math.round(v / 100 * 100 * 65536)),
            label: "Length %",
            color: knob,
            size: "md",
            formatValue: (v) => `${v.toFixed(1)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
            lineNumber: 187,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 180,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.numLoops,
          min: 0,
          max: 255,
          step: 1,
          onChange: (v) => upd("numLoops", Math.round(v)),
          label: "Repeats",
          color: knob,
          formatValue: (v) => Math.round(v) === 0 ? "Inf" : Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
          lineNumber: 196,
          columnNumber: 13
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 195,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 text-[11px] cursor-pointer", style: { color: accent }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "checkbox",
            checked: config.newLoopSystem,
            onChange: (e) => upd("newLoopSystem", e.target.checked),
            className: "rounded"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
            lineNumber: 206,
            columnNumber: 15
          },
          void 0
        ),
        "New Loop System"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 205,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 204,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mt-2", children: "Loop start/length as percentages of sample length. Repeats 0 = infinite loop." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 216,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
      lineNumber: 162,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
      lineNumber: 161,
      columnNumber: 7
    }, void 0);
  };
  const renderRouting = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Channel Routing" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 231,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(config.multiChannel),
            onChange: (v) => upd("multiChannel", parseInt(v, 10)),
            options: [
              { value: "0", label: "Mono" },
              { value: "1", label: "Stereo L" },
              { value: "2", label: "Stereo R" },
              { value: "3", label: "Line Source" }
            ],
            className: "text-xs px-2 py-1 rounded bg-black/30 border border-white/10 outline-none",
            style: { color: accent }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
            lineNumber: 233,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: MULTI_CHANNEL_LABELS[config.multiChannel] ?? "Unknown" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
          lineNumber: 245,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 232,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
      lineNumber: 230,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "DSP Processing" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 253,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 text-[11px] cursor-pointer", style: { color: accent }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "checkbox",
            checked: config.noDsp,
            onChange: (e) => upd("noDsp", e.target.checked),
            className: "rounded"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
            lineNumber: 255,
            columnNumber: 11
          },
          void 0
        ),
        "Bypass DSP (no echo/delay)"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 254,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mt-2", children: "When enabled, this instrument bypasses the Symphonie DSP ring buffer effects (echo, delay, creative echo, creative delay)." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 263,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
      lineNumber: 252,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
    lineNumber: 227,
    columnNumber: 5
  }, void 0);
  const tabs = [
    ["general", "General"],
    ["loop", "Loop"],
    ["routing", "Routing"]
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b overflow-x-auto", style: { borderColor: dim }, children: tabs.map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(id),
        className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap",
        style: {
          color: activeTab === id ? accent : "#666",
          borderBottom: activeTab === id ? `2px solid ${accent}` : "2px solid transparent",
          background: activeTab === id ? isCyan ? "#041510" : "#120820" : "transparent"
        },
        children: label
      },
      id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
        lineNumber: 283,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
      lineNumber: 281,
      columnNumber: 7
    }, void 0),
    activeTab === "general" && renderGeneral(),
    activeTab === "loop" && renderLoop(),
    activeTab === "routing" && renderRouting()
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SymphonieControls.tsx",
    lineNumber: 280,
    columnNumber: 5
  }, void 0);
};
export {
  SymphonieControls
};
