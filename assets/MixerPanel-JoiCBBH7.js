import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aj as useMixerStore, e as useInstrumentStore, R as useTrackerStore, $ as getToneEngine, W as CustomSelect } from "./main-BbV5VyEH.js";
import { g as getChannelFxPresetsByCategory, a as getSendBusPresetsByCategory } from "./sendBusPresets-DSruMUC1.js";
import { C as ChannelInsertEffectsModal } from "./ChannelInsertEffectsModal-kjfflOOE.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./EffectParameterEditor-jgcbBJ--.js";
import "./NeuralParameterMapper-BKFi47j3.js";
import "./guitarMLRegistry-CdfjBfrw.js";
import "./index-CRvWC1pf.js";
import "./DrawbarSlider-Dq9geM4g.js";
import "./SectionHeader-DHk3L-9n.js";
import "./unifiedEffects-Cd2Pk46Y.js";
const NUM_CHANNELS = 16;
const VU_HEIGHT = 120;
const FADER_HEIGHT = 100;
const SEND_CYCLE_VALUES = [0, 0.5, 0.75, 1];
function formatDb(volume) {
  if (volume <= 0) return "-∞";
  const db = 20 * Math.log10(volume);
  return `${Math.round(db)}`;
}
function vuColor(level) {
  if (level > 0.9) return "#ff3333";
  if (level > 0.7) return "#ffcc00";
  return "#22dd66";
}
function vuGradientStyle(level, height) {
  const fillH = Math.min(level * height, height);
  return {
    height: fillH,
    background: fillH > height * 0.9 ? "linear-gradient(to top, #22dd66, #ffcc00 60%, #ff3333 90%)" : fillH > height * 0.7 ? "linear-gradient(to top, #22dd66, #ffcc00 80%)" : "#22dd66",
    transition: "height 40ms linear"
  };
}
const FX_TYPES = [
  null,
  "reverb",
  "delay",
  "chorus",
  "distortion",
  "phaser",
  "flanger",
  "compressor",
  "eq"
];
const FxSlotDropdown = ({ value, onChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  CustomSelect,
  {
    value: value ?? "",
    onChange: (v) => onChange(v || null),
    options: [
      { value: "", label: "---" },
      ...FX_TYPES.filter(Boolean).map((fx) => ({
        value: fx,
        label: fx.toUpperCase()
      }))
    ],
    className: "bg-[#1a1a24] text-[8px] font-mono text-white/50 border border-white/10 rounded px-0.5 py-0 w-full cursor-pointer hover:border-white/20"
  },
  void 0,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
    lineNumber: 68,
    columnNumber: 3
  },
  void 0
);
const ChannelFxPresetDropdown = ({ onSelect }) => {
  const [open, setOpen] = reactExports.useState(false);
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => {
      document.removeEventListener("pointerdown", handler);
    };
  }, [open]);
  const grouped = getChannelFxPresetsByCategory();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", ref, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setOpen(!open),
        className: "text-[8px] font-mono text-white/30 hover:text-white/60 border border-white/10 rounded px-1 py-0.5 leading-tight transition-colors w-full",
        title: "Load channel FX preset",
        children: "FX"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 105,
        columnNumber: 7
      },
      void 0
    ),
    open && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "absolute bottom-full left-0 mb-1 z-[100000] bg-[#1a1a24] border border-white/15 rounded shadow-xl py-1 max-h-[280px] overflow-y-auto scrollbar-none",
        style: { width: 160 },
        children: Object.entries(grouped).map(([category, presets]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] font-mono text-white/30 px-2 pt-1.5 pb-0.5 uppercase tracking-wider", children: category }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 119,
            columnNumber: 15
          }, void 0),
          presets.map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              className: "block w-full text-left text-[9px] font-mono text-white/70 hover:text-white hover:bg-white/5 px-2 py-0.5 transition-colors",
              title: preset.description,
              onClick: () => {
                onSelect(preset.effects);
                setOpen(false);
              },
              children: preset.name
            },
            preset.name,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
              lineNumber: 123,
              columnNumber: 17
            },
            void 0
          ))
        ] }, category, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 118,
          columnNumber: 13
        }, void 0))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 113,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
    lineNumber: 104,
    columnNumber: 5
  }, void 0);
};
const SendBusPresetDropdown = ({ onSelect }) => {
  const [open, setOpen] = reactExports.useState(false);
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => {
      document.removeEventListener("pointerdown", handler);
    };
  }, [open]);
  const grouped = getSendBusPresetsByCategory();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", ref, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setOpen(!open),
        className: "text-[8px] font-mono text-teal-400/60 hover:text-teal-400 border border-teal-400/20 rounded px-1 py-0.5 leading-tight transition-colors w-full",
        title: "Load send bus preset",
        children: "FX"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 166,
        columnNumber: 7
      },
      void 0
    ),
    open && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "absolute bottom-full left-0 mb-1 z-[100000] bg-[#1a1a24] border border-teal-400/20 rounded shadow-xl py-1 max-h-[280px] overflow-y-auto scrollbar-none",
        style: { width: 180 },
        children: Object.entries(grouped).map(([category, presets]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] font-mono text-teal-400/40 px-2 pt-1.5 pb-0.5 uppercase tracking-wider", children: category }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 180,
            columnNumber: 15
          }, void 0),
          presets.map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              className: "block w-full text-left text-[9px] font-mono text-white/70 hover:text-teal-300 hover:bg-teal-400/5 px-2 py-0.5 transition-colors",
              title: preset.description,
              onClick: () => {
                onSelect(preset.effects);
                setOpen(false);
              },
              children: preset.name
            },
            preset.name,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
              lineNumber: 184,
              columnNumber: 17
            },
            void 0
          ))
        ] }, category, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 179,
          columnNumber: 13
        }, void 0))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 174,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
    lineNumber: 165,
    columnNumber: 5
  }, void 0);
};
const SendBars = ({ levels, onCycle }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5 w-full px-1", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-mono text-white/30 tracking-wider", children: "SENDS" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
    lineNumber: 211,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-0.5 w-full justify-center", children: levels.slice(0, 4).map((lvl, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      className: "relative bg-white/5 rounded-sm cursor-pointer hover:bg-white/10 transition-colors",
      style: { width: 10, height: 20 },
      onClick: () => onCycle(i),
      title: `Send ${String.fromCharCode(65 + i)}: ${Math.round(lvl * 100)}% (click to cycle)`,
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "absolute bottom-0 left-0 right-0 rounded-sm",
          style: {
            height: `${lvl * 100}%`,
            backgroundColor: "#14b8a6",
            transition: "height 100ms ease"
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 221,
          columnNumber: 11
        },
        void 0
      )
    },
    i,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
      lineNumber: 214,
      columnNumber: 9
    },
    void 0
  )) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
    lineNumber: 212,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
  lineNumber: 210,
  columnNumber: 3
}, void 0);
const verticalFaderStyle = `
  .dom-mixer-fader {
    -webkit-appearance: none;
    appearance: none;
    writing-mode: vertical-lr;
    direction: rtl;
    background: transparent;
    cursor: pointer;
  }
  .dom-mixer-fader::-webkit-slider-runnable-track {
    width: 4px;
    background: #2a2a3a;
    border-radius: 2px;
  }
  .dom-mixer-fader::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 8px;
    background: #d4a020;
    border-radius: 2px;
    margin-left: -6px;
    cursor: pointer;
  }
  .dom-mixer-fader::-moz-range-track {
    width: 4px;
    background: #2a2a3a;
    border-radius: 2px;
  }
  .dom-mixer-fader::-moz-range-thumb {
    width: 16px;
    height: 8px;
    background: #d4a020;
    border: none;
    border-radius: 2px;
    cursor: pointer;
  }
  .dom-mixer-fader-teal::-webkit-slider-thumb {
    background: #14b8a6;
  }
  .dom-mixer-fader-teal::-moz-range-thumb {
    background: #14b8a6;
  }
  .dom-mixer-pan {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
    height: 12px;
  }
  .dom-mixer-pan::-webkit-slider-runnable-track {
    height: 3px;
    background: #2a2a3a;
    border-radius: 1px;
  }
  .dom-mixer-pan::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 8px;
    height: 10px;
    background: #60a5fa;
    border-radius: 2px;
    margin-top: -3.5px;
    cursor: pointer;
  }
  .dom-mixer-pan::-moz-range-track {
    height: 3px;
    background: #2a2a3a;
    border-radius: 1px;
  }
  .dom-mixer-pan::-moz-range-thumb {
    width: 8px;
    height: 10px;
    background: #60a5fa;
    border: none;
    border-radius: 2px;
    cursor: pointer;
  }
`;
const DOMChannelStrip = ({
  index,
  name,
  instrumentName,
  volume,
  pan,
  muted,
  soloed,
  level,
  peakLevel,
  dimmed,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  sendLevels,
  onSendLevelCycle,
  insertEffectCount,
  effects,
  onEffectChange,
  onChannelFxPresetSelect,
  onFxClick
}) => {
  const peakY = Math.min(peakLevel * VU_HEIGHT, VU_HEIGHT);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "flex flex-col items-center gap-1 select-none",
      style: {
        width: 56,
        padding: "6px 2px",
        opacity: dimmed ? 0.35 : 1,
        transition: "opacity 0.1s"
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono text-white/40 truncate text-center w-full leading-tight", children: name }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 379,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-mono text-white/25 truncate text-center w-full leading-tight", title: instrumentName, children: instrumentName.slice(0, 8) || "---" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 384,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "relative rounded-sm bg-white/5 overflow-hidden",
            style: { width: 10, height: VU_HEIGHT },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "absolute bottom-0 left-0 right-0 rounded-sm",
                  style: vuGradientStyle(level, VU_HEIGHT)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
                  lineNumber: 394,
                  columnNumber: 9
                },
                void 0
              ),
              peakY > 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "absolute left-0 right-0",
                  style: {
                    bottom: peakY - 1,
                    height: 2,
                    backgroundColor: vuColor(peakLevel),
                    transition: "bottom 40ms linear"
                  }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
                  lineNumber: 400,
                  columnNumber: 11
                },
                void 0
              )
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 389,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-mono text-white/30 leading-tight text-center", style: { minWidth: 28 }, children: [
          formatDb(level),
          " dB"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 413,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5 w-full px-0.5", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FxSlotDropdown, { value: effects[0], onChange: (v) => onEffectChange(0, v) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 419,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FxSlotDropdown, { value: effects[1], onChange: (v) => onEffectChange(1, v) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 420,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 418,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "range",
            min: 0,
            max: 1,
            step: 0.01,
            value: volume,
            title: `Volume: ${formatDb(volume)} dB`,
            onChange: (e) => onVolumeChange(parseFloat(e.target.value)),
            className: "dom-mixer-fader touch-none",
            style: { width: 20, height: FADER_HEIGHT }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 424,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[6px] font-mono text-white/20 tracking-wider", children: "PAN" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 438,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: -1,
              max: 1,
              step: 0.01,
              value: pan,
              title: `Pan: ${pan >= 0 ? "+" : ""}${pan.toFixed(2)}`,
              onChange: (e) => onPanChange(parseFloat(e.target.value)),
              className: "dom-mixer-pan",
              style: { width: 40 }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
              lineNumber: 439,
              columnNumber: 9
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 437,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-mono text-white/20 leading-tight", children: [
          "C",
          index + 1
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 453,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onMuteToggle,
            className: "text-[9px] font-mono font-bold rounded leading-none border px-2 py-1 transition-colors",
            style: {
              backgroundColor: muted ? "#dc2626" : "transparent",
              borderColor: muted ? "#dc2626" : "rgba(255,255,255,0.15)",
              color: muted ? "#fff" : "rgba(255,255,255,0.4)"
            },
            title: muted ? "Unmute" : "Mute",
            children: "M"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 458,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onSoloToggle,
            className: "text-[9px] font-mono font-bold rounded leading-none border px-2 py-1 transition-colors",
            style: {
              backgroundColor: soloed ? "#ca8a04" : "transparent",
              borderColor: soloed ? "#ca8a04" : "rgba(255,255,255,0.15)",
              color: soloed ? "#fff" : "rgba(255,255,255,0.4)"
            },
            title: soloed ? "Unsolo" : "Solo",
            children: "S"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 472,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SendBars, { levels: sendLevels, onCycle: onSendLevelCycle }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 486,
          columnNumber: 7
        }, void 0),
        onFxClick ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onFxClick,
            className: `text-[8px] font-mono leading-tight cursor-pointer transition-colors px-1 py-0.5 rounded border ${insertEffectCount > 0 ? "text-teal-400 border-teal-400/40 hover:bg-teal-400/10" : "text-text-muted border-border-primary hover:text-teal-400 hover:border-teal-400/30"}`,
            title: insertEffectCount > 0 ? `Edit ${insertEffectCount} insert effect(s)` : "Add insert effects to this channel",
            children: [
              "FX",
              insertEffectCount > 0 ? `:${insertEffectCount}` : ""
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 490,
            columnNumber: 9
          },
          void 0
        ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-mono text-text-muted leading-tight", children: [
          "FX:",
          insertEffectCount
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 502,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelFxPresetDropdown, { onSelect: onChannelFxPresetSelect }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 508,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
      lineNumber: 369,
      columnNumber: 5
    },
    void 0
  );
};
const DOMSendBusStrip = ({ busIndex, bus }) => {
  const busLetter = String.fromCharCode(65 + busIndex);
  const handleVolumeChange = reactExports.useCallback((e) => {
    useMixerStore.getState().setSendBusVolume(busIndex, parseFloat(e.target.value));
  }, [busIndex]);
  const handleMuteToggle = reactExports.useCallback(() => {
    useMixerStore.getState().setSendBusMute(busIndex, !bus.muted);
  }, [busIndex, bus.muted]);
  const handlePresetSelect = reactExports.useCallback((effects) => {
    useMixerStore.getState().setSendBusEffects(busIndex, effects);
  }, [busIndex]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "flex flex-col items-center gap-1 select-none",
      style: {
        width: 56,
        padding: "6px 2px",
        backgroundColor: "rgba(20, 184, 166, 0.03)",
        borderRadius: 4
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[18px] font-mono font-bold text-teal-400 leading-tight", children: busLetter }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 546,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-mono text-white/30 truncate text-center w-full leading-tight", children: bus.name }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 551,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] font-mono text-teal-400/70 leading-tight", children: [
          "FX:",
          bus.effects.length
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 556,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "range",
            min: 0,
            max: 1,
            step: 0.01,
            value: bus.volume,
            title: `${bus.name}: ${formatDb(bus.volume)} dB`,
            onChange: handleVolumeChange,
            className: "dom-mixer-fader dom-mixer-fader-teal touch-none",
            style: { width: 20, height: FADER_HEIGHT }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 561,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleMuteToggle,
            className: "text-[9px] font-mono font-bold rounded leading-none border px-2 py-1 transition-colors",
            style: {
              backgroundColor: bus.muted ? "#dc2626" : "transparent",
              borderColor: bus.muted ? "#dc2626" : "rgba(20, 184, 166, 0.3)",
              color: bus.muted ? "#fff" : "rgba(20, 184, 166, 0.6)"
            },
            title: bus.muted ? "Unmute" : "Mute",
            children: "M"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 574,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SendBusPresetDropdown, { onSelect: handlePresetSelect }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 588,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
      lineNumber: 536,
      columnNumber: 5
    },
    void 0
  );
};
const DOMMasterStrip = ({
  volume,
  level,
  peakLevel,
  onVolumeChange
}) => {
  const peakY = Math.min(peakLevel * VU_HEIGHT, VU_HEIGHT);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "flex flex-col items-center gap-1 select-none",
      style: { width: 56, padding: "6px 2px" },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono text-white/50 font-bold truncate text-center w-full leading-tight", children: "MASTER" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 616,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] leading-tight", children: " " }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 621,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "relative rounded-sm bg-white/5 overflow-hidden",
            style: { width: 10, height: VU_HEIGHT },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "absolute bottom-0 left-0 right-0 rounded-sm",
                  style: vuGradientStyle(level, VU_HEIGHT)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
                  lineNumber: 628,
                  columnNumber: 9
                },
                void 0
              ),
              peakY > 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "absolute left-0 right-0",
                  style: {
                    bottom: peakY - 1,
                    height: 2,
                    backgroundColor: vuColor(peakLevel),
                    transition: "bottom 40ms linear"
                  }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
                  lineNumber: 633,
                  columnNumber: 11
                },
                void 0
              )
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 624,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-mono text-white/30 leading-tight text-center", style: { minWidth: 28 }, children: [
          formatDb(level),
          " dB"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 646,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 34 } }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 651,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "range",
            min: 0,
            max: 1,
            step: 0.01,
            value: volume,
            title: `Master: ${formatDb(volume)} dB`,
            onChange: (e) => onVolumeChange(parseFloat(e.target.value)),
            className: "dom-mixer-fader touch-none",
            style: { width: 20, height: FADER_HEIGHT }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 654,
            columnNumber: 7
          },
          void 0
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
      lineNumber: 611,
      columnNumber: 5
    },
    void 0
  );
};
const MixerContent = () => {
  const allChannels = useMixerStore((s) => s.channels);
  const master = useMixerStore((s) => s.master);
  const isSoloing = useMixerStore((s) => s.isSoloing);
  const sendBuses = useMixerStore((s) => s.sendBuses);
  const setChannelVolume = useMixerStore((s) => s.setChannelVolume);
  const setChannelPan = useMixerStore((s) => s.setChannelPan);
  const setMasterVolume = useMixerStore((s) => s.setMasterVolume);
  const setChannelMute = useMixerStore((s) => s.setChannelMute);
  const setChannelSolo = useMixerStore((s) => s.setChannelSolo);
  const setChannelEffect = useMixerStore((s) => s.setChannelEffect);
  const [channelFxModalIndex, setChannelFxModalIndex] = reactExports.useState(null);
  const instruments = useInstrumentStore((s) => s.instruments);
  const patternChannelCount = useTrackerStore((s) => {
    var _a;
    if (s.patterns.length === 0) return 4;
    return ((_a = s.patterns[0]) == null ? void 0 : _a.channels.length) ?? 4;
  });
  const visibleCount = Math.max(1, Math.min(patternChannelCount, allChannels.length));
  const channels = allChannels.slice(0, visibleCount);
  const [levels, setLevels] = reactExports.useState(() => new Array(NUM_CHANNELS).fill(0));
  const [peaks, setPeaks] = reactExports.useState(() => new Array(NUM_CHANNELS).fill(0));
  const prevLevelsRef = reactExports.useRef(levels);
  const peaksRef = reactExports.useRef(peaks);
  const peakDecayRef = reactExports.useRef(new Array(NUM_CHANNELS).fill(0));
  reactExports.useEffect(() => {
    let raf = 0;
    const tick = () => {
      var _a;
      const engine = getToneEngine();
      const patterns = useTrackerStore.getState().patterns;
      const patternIndex = useTrackerStore.getState().currentPatternIndex;
      const pattern = patterns[patternIndex];
      const numCh = (pattern == null ? void 0 : pattern.channels.length) ?? NUM_CHANNELS;
      const allLevels = ((_a = engine.getChannelLevels) == null ? void 0 : _a.call(engine, numCh)) ?? [];
      const nextLevels = [];
      const nextPeaks = [];
      for (let i = 0; i < numCh; i++) {
        const chLevel = allLevels[i] ?? 0;
        const prev = prevLevelsRef.current[i] ?? 0;
        nextLevels.push(chLevel > prev ? chLevel : prev * 0.92);
        const prevPeak = peaksRef.current[i] ?? 0;
        if (chLevel >= prevPeak) {
          nextPeaks.push(chLevel);
          peakDecayRef.current[i] = 30;
        } else if (peakDecayRef.current[i] > 0) {
          peakDecayRef.current[i]--;
          nextPeaks.push(prevPeak);
        } else {
          nextPeaks.push(prevPeak * 0.97);
        }
      }
      prevLevelsRef.current = nextLevels;
      peaksRef.current = nextPeaks;
      setLevels(nextLevels);
      setPeaks(nextPeaks);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const masterLevel = Math.max(...levels, 0);
  const masterPeak = Math.max(...peaks, 0);
  const handleSendLevelCycle = reactExports.useCallback((chIdx, sendIdx) => {
    var _a, _b;
    const current = ((_b = (_a = useMixerStore.getState().channels[chIdx]) == null ? void 0 : _a.sendLevels) == null ? void 0 : _b[sendIdx]) ?? 0;
    const cycleIdx = SEND_CYCLE_VALUES.indexOf(current);
    const next = SEND_CYCLE_VALUES[(cycleIdx + 1) % SEND_CYCLE_VALUES.length];
    useMixerStore.getState().setChannelSendLevel(chIdx, sendIdx, next);
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-row items-start overflow-x-auto pb-2 scrollbar-none", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-start", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-mono text-white/20 tracking-[0.2em] px-2 pt-1 pb-0.5", children: "CHANNELS" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 755,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-row", children: channels.map((ch, i) => {
          var _a;
          const inst = instruments[i];
          const instName = (inst == null ? void 0 : inst.name) ?? "";
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            DOMChannelStrip,
            {
              index: i,
              name: ch.name,
              instrumentName: instName,
              volume: ch.volume,
              pan: ch.pan,
              muted: ch.muted,
              soloed: ch.soloed,
              level: levels[i] ?? 0,
              peakLevel: peaks[i] ?? 0,
              dimmed: isSoloing && !ch.soloed,
              onVolumeChange: (v) => setChannelVolume(i, v),
              onPanChange: (p) => setChannelPan(i, p),
              onMuteToggle: () => {
                const c = useMixerStore.getState().channels[i];
                if (c) setChannelMute(i, !c.muted);
              },
              onSoloToggle: () => {
                const c = useMixerStore.getState().channels[i];
                if (c) setChannelSolo(i, !c.soloed);
              },
              sendLevels: ch.sendLevels,
              onSendLevelCycle: (sendIdx) => handleSendLevelCycle(i, sendIdx),
              insertEffectCount: ((_a = ch.insertEffects) == null ? void 0 : _a.length) ?? 0,
              effects: ch.effects,
              onEffectChange: (slot, type) => setChannelEffect(i, slot, type),
              onChannelFxPresetSelect: (fx) => useMixerStore.getState().loadChannelInsertPreset(i, fx),
              onFxClick: () => setChannelFxModalIndex(i)
            },
            i,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
              lineNumber: 763,
              columnNumber: 15
            },
            void 0
          );
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 758,
          columnNumber: 9
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 754,
        columnNumber: 7
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "self-stretch flex flex-col items-center mx-0.5 my-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 w-px bg-white/10" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 800,
        columnNumber: 9
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 799,
        columnNumber: 7
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-start", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-mono text-teal-400/30 tracking-[0.2em] px-2 pt-1 pb-0.5", children: "SENDS" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 805,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-row", children: sendBuses.map((bus, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DOMSendBusStrip, { busIndex: i, bus }, `send-${i}`, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 810,
          columnNumber: 13
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 808,
          columnNumber: 9
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 804,
        columnNumber: 7
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "self-stretch flex flex-col items-center mx-0.5 my-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 w-px", style: { backgroundColor: "rgba(20, 184, 166, 0.15)" } }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 817,
        columnNumber: 9
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 816,
        columnNumber: 7
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-start", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-mono text-white/20 tracking-[0.2em] px-2 pt-1 pb-0.5", children: "MASTER" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 822,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          DOMMasterStrip,
          {
            volume: master.volume,
            level: masterLevel,
            peakLevel: masterPeak,
            onVolumeChange: setMasterVolume
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 825,
            columnNumber: 9
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 821,
        columnNumber: 7
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
      lineNumber: 752,
      columnNumber: 5
    }, void 0),
    channelFxModalIndex !== null && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      ChannelInsertEffectsModal,
      {
        isOpen: true,
        onClose: () => setChannelFxModalIndex(null),
        channelIndex: channelFxModalIndex
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
        lineNumber: 835,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
    lineNumber: 751,
    columnNumber: 5
  }, void 0);
};
const MixerView = () => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col flex-1 min-h-0 bg-[#0e0e14]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("style", { children: verticalFaderStyle }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
      lineNumber: 850,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerContent, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
      lineNumber: 851,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
    lineNumber: 849,
    columnNumber: 5
  }, void 0);
};
const MixerPanel = () => {
  const domPanelVisible = useMixerStore((s) => s.domPanelVisible);
  const toggleDomPanel = useMixerStore((s) => s.toggleDomPanel);
  if (!domPanelVisible) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "fixed bottom-8 left-1/2 -translate-x-1/2 z-[99990] bg-[#0e0e14] border border-white/10 rounded-lg shadow-2xl",
      style: { minWidth: "min(98vw, 1100px)" },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("style", { children: verticalFaderStyle }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 869,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-3 py-1.5 border-b border-white/10", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono text-white/40 tracking-widest", children: "MIXER" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
            lineNumber: 872,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: toggleDomPanel,
              className: "text-[10px] text-white/30 hover:text-white/70 transition-colors leading-none px-1 font-mono",
              title: "Close mixer",
              children: "X"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
              lineNumber: 875,
              columnNumber: 9
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 871,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerContent, {}, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
          lineNumber: 883,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/panels/MixerPanel.tsx",
      lineNumber: 865,
      columnNumber: 5
    },
    void 0
  );
};
export {
  MixerPanel,
  MixerView
};
