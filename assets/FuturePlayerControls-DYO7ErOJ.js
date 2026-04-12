import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cF as FuturePlayerEngine, e as useInstrumentStore, aB as Knob, W as CustomSelect } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { S as SampleBrowserPane } from "./SampleBrowserPane-B7s228O0.js";
import { F as FP_NEGATE_OFFSET, a as FP_DETAIL_OFFSET } from "./detailOffsets-DlJBo0KQ.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
const FuturePlayerControls = ({
  config,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("envelope");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { isCyan, knob, panelBg, panelStyle } = useInstrumentColors("#ffbb66");
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
    const cur = configRef.current;
    if (cur.detailPtr !== void 0 && FuturePlayerEngine.hasInstance()) {
      const offset = FP_DETAIL_OFFSET[key];
      if (offset !== void 0 && typeof value === "number") {
        FuturePlayerEngine.getInstance().writeByte(cur.detailPtr + offset, value & 255);
      } else if (key === "pitchMod1Negate" && typeof value === "boolean") {
        FuturePlayerEngine.getInstance().writeByte(cur.detailPtr + FP_NEGATE_OFFSET.pitchMod1Negate, value ? 1 : 0);
      } else if (key === "pitchMod2Negate" && typeof value === "boolean") {
        FuturePlayerEngine.getInstance().writeByte(cur.detailPtr + FP_NEGATE_OFFSET.pitchMod2Negate, value ? 1 : 0);
      }
    }
  }, [onChange]);
  const tabs = [
    { id: "envelope", label: "Envelope" },
    { id: "pitchMod", label: "Pitch Mod" },
    { id: "sampleMod", label: "Sample Mod" }
  ];
  const [showSamplePane, setShowSamplePane] = reactExports.useState(false);
  const allInstruments = useInstrumentStore((s) => s.instruments);
  const sampleRows = reactExports.useMemo(() => {
    return allInstruments.filter((inst) => inst.synthType === "FuturePlayerSynth" && inst.futurePlayer).map((inst) => {
      const c = inst.futurePlayer;
      return {
        id: inst.id,
        instrName: inst.name || `#${inst.id}`,
        size: c.sampleSize,
        isWavetable: c.isWavetable,
        isCurrent: c === config
      };
    });
  }, [allInstruments, config]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 space-y-3 flex-1 min-w-0 overflow-y-auto", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-xs", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `px-2 py-0.5 rounded ${isCyan ? "bg-accent-highlight/20 text-accent-highlight" : "bg-orange-900/30 text-orange-300"}`, children: config.isWavetable ? "Wavetable" : "PCM Sample" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
          lineNumber: 117,
          columnNumber: 9
        }, void 0),
        config.sampleSize > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: [
          config.sampleSize,
          " bytes"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
          lineNumber: 121,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setShowSamplePane((v) => !v),
            title: `${showSamplePane ? "Hide" : "Show"} sample browser`,
            className: `ml-auto px-2 py-0.5 rounded text-[10px] font-mono border ${showSamplePane ? "bg-accent-primary/20 text-accent-primary border-accent-primary/60" : "bg-dark-bg text-text-secondary border-dark-border hover:text-accent-primary hover:border-accent-primary/50"}`,
            children: "SMP"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 123,
            columnNumber: 9
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
        lineNumber: 116,
        columnNumber: 7
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 border-b border-dark-border pb-1", children: tabs.map((t) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab(t.id),
          className: `px-3 py-1 text-xs rounded-t transition-colors ${activeTab === t.id ? isCyan ? "bg-accent-highlight/20 text-accent-highlight" : "bg-orange-900/40 text-orange-300" : "text-text-muted hover:text-text-primary"}`,
          children: t.label
        },
        t.id,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
          lineNumber: 139,
          columnNumber: 11
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
        lineNumber: 137,
        columnNumber: 7
      }, void 0),
      activeTab === "envelope" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded border p-3 ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-semibold text-text-secondary mb-2", children: "Volume" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 158,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Volume",
              value: config.volume,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => upd("volume", v),
              size: "md",
              color: knob
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 160,
              columnNumber: 15
            },
            void 0
          ) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 159,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
          lineNumber: 157,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded border p-3 ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-semibold text-text-secondary mb-2", children: "Envelope" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 173,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Atk Rate",
                value: config.attackRate,
                min: 0,
                max: 255,
                step: 1,
                onChange: (v) => upd("attackRate", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 175,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Atk Peak",
                value: config.attackPeak,
                min: 0,
                max: 255,
                step: 1,
                onChange: (v) => upd("attackPeak", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 177,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Dec Rate",
                value: config.decayRate,
                min: 0,
                max: 255,
                step: 1,
                onChange: (v) => upd("decayRate", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 179,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Sus Level",
                value: config.sustainLevel,
                min: 0,
                max: 255,
                step: 1,
                onChange: (v) => upd("sustainLevel", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 181,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 174,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 mt-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Sus Rate",
                value: config.sustainRate & 127,
                min: 0,
                max: 127,
                step: 1,
                onChange: (v) => upd("sustainRate", config.sustainRate & 128 | v & 127),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 185,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Sus Target",
                value: config.sustainTarget,
                min: 0,
                max: 255,
                step: 1,
                onChange: (v) => upd("sustainTarget", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 187,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Rel Rate",
                value: config.releaseRate,
                min: 0,
                max: 255,
                step: 1,
                onChange: (v) => upd("releaseRate", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 189,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted mb-1", children: "Sus Dir" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 192,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => upd("sustainRate", config.sustainRate ^ 128),
                  className: `px-2 py-1 text-xs rounded ${config.sustainRate & 128 ? "bg-red-900/40 text-red-300" : isCyan ? "bg-accent-highlight/20 text-accent-highlight" : "bg-green-900/40 text-green-300"}`,
                  children: config.sustainRate & 128 ? "Down" : "Up"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                  lineNumber: 193,
                  columnNumber: 17
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 191,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 184,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
          lineNumber: 172,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded border p-2 ${panelBg}`, style: { ...panelStyle, height: 96 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EnvelopeVisualization,
          {
            mode: "steps",
            attackVol: config.attackPeak,
            attackSpeed: config.attackRate || 1,
            decayVol: config.sustainLevel,
            decaySpeed: config.decayRate || 1,
            sustainVol: config.sustainTarget,
            sustainLen: 16,
            releaseVol: 0,
            releaseSpeed: config.releaseRate || 1,
            maxVol: 255,
            color: knob,
            height: 72
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 209,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
          lineNumber: 208,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
        lineNumber: 155,
        columnNumber: 9
      }, void 0),
      activeTab === "pitchMod" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded border p-3 ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-semibold text-text-secondary", children: "Pitch Mod 1" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 233,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `text-[9px] px-1.5 py-0.5 rounded ${config.hasPitchMod1 ? isCyan ? "bg-accent-highlight/20 text-accent-highlight" : "bg-green-900/40 text-green-300" : "bg-bg-tertiary text-text-muted"}`, children: config.hasPitchMod1 ? "Active" : "None" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 234,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 232,
            columnNumber: 13
          }, void 0),
          config.hasPitchMod1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Delay",
                value: config.pitchMod1Delay,
                min: 0,
                max: 255,
                step: 1,
                onChange: (v) => upd("pitchMod1Delay", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 244,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Shift",
                value: config.pitchMod1Shift,
                min: 0,
                max: 7,
                step: 1,
                onChange: (v) => upd("pitchMod1Shift", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 246,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted mb-1", children: "Mode" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 249,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CustomSelect,
                {
                  className: "bg-dark-bg border border-dark-border text-text-primary text-xs rounded px-1 py-0.5 focus:outline-none focus:border-accent-primary",
                  value: String(config.pitchMod1Mode === 0 ? 0 : config.pitchMod1Mode === 1 ? 1 : 128),
                  onChange: (v) => upd("pitchMod1Mode", Number(v)),
                  options: [
                    { value: "0", label: "Loop" },
                    { value: "1", label: "Continue" },
                    { value: "128", label: "One-shot" }
                  ]
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                  lineNumber: 250,
                  columnNumber: 19
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 248,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted mb-1", children: "Negate" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 262,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => upd("pitchMod1Negate", !config.pitchMod1Negate),
                  className: `px-2 py-1 text-xs rounded ${config.pitchMod1Negate ? "bg-accent-error/40 text-accent-error" : isCyan ? "bg-accent-highlight/20 text-accent-highlight" : "bg-accent-success/40 text-accent-success"}`,
                  children: config.pitchMod1Negate ? "Yes" : "No"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                  lineNumber: 263,
                  columnNumber: 19
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 261,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 243,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
          lineNumber: 231,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded border p-3 ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-semibold text-text-secondary", children: "Pitch Mod 2" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 281,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `text-[9px] px-1.5 py-0.5 rounded ${config.hasPitchMod2 ? isCyan ? "bg-accent-highlight/20 text-accent-highlight" : "bg-green-900/40 text-green-300" : "bg-bg-tertiary text-text-muted"}`, children: config.hasPitchMod2 ? "Active" : "None" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 282,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 280,
            columnNumber: 13
          }, void 0),
          config.hasPitchMod2 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Delay",
                value: config.pitchMod2Delay,
                min: 0,
                max: 255,
                step: 1,
                onChange: (v) => upd("pitchMod2Delay", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 292,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Shift",
                value: config.pitchMod2Shift,
                min: 0,
                max: 7,
                step: 1,
                onChange: (v) => upd("pitchMod2Shift", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 294,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted mb-1", children: "Mode" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 297,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CustomSelect,
                {
                  className: "bg-dark-bg border border-dark-border text-text-primary text-xs rounded px-1 py-0.5 focus:outline-none focus:border-accent-primary",
                  value: String(config.pitchMod2Mode === 0 ? 0 : config.pitchMod2Mode === 1 ? 1 : 128),
                  onChange: (v) => upd("pitchMod2Mode", Number(v)),
                  options: [
                    { value: "0", label: "Loop" },
                    { value: "1", label: "Continue" },
                    { value: "128", label: "One-shot" }
                  ]
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                  lineNumber: 298,
                  columnNumber: 19
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 296,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted mb-1", children: "Negate" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 310,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => upd("pitchMod2Negate", !config.pitchMod2Negate),
                  className: `px-2 py-1 text-xs rounded ${config.pitchMod2Negate ? "bg-accent-error/40 text-accent-error" : isCyan ? "bg-accent-highlight/20 text-accent-highlight" : "bg-accent-success/40 text-accent-success"}`,
                  children: config.pitchMod2Negate ? "Yes" : "No"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                  lineNumber: 311,
                  columnNumber: 19
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 309,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 291,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
          lineNumber: 279,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
        lineNumber: 229,
        columnNumber: 9
      }, void 0),
      activeTab === "sampleMod" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded border p-3 ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-semibold text-text-secondary", children: "Sample Mod 1" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 334,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `text-[9px] px-1.5 py-0.5 rounded ${config.hasSampleMod1 ? isCyan ? "bg-accent-highlight/20 text-accent-highlight" : "bg-green-900/40 text-green-300" : "bg-bg-tertiary text-text-muted"}`, children: config.hasSampleMod1 ? "Active" : "None" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 335,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 333,
            columnNumber: 13
          }, void 0),
          config.hasSampleMod1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Delay",
                value: config.sampleMod1Delay,
                min: 0,
                max: 255,
                step: 1,
                onChange: (v) => upd("sampleMod1Delay", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 345,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Shift",
                value: config.sampleMod1Shift,
                min: 0,
                max: 7,
                step: 1,
                onChange: (v) => upd("sampleMod1Shift", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 347,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted mb-1", children: "Mode" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 350,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CustomSelect,
                {
                  className: "bg-dark-bg border border-dark-border text-text-primary text-xs rounded px-1 py-0.5 focus:outline-none focus:border-accent-primary",
                  value: String(config.sampleMod1Mode === 0 ? 0 : config.sampleMod1Mode & 128 ? 128 : 1),
                  onChange: (v) => upd("sampleMod1Mode", Number(v)),
                  options: [
                    { value: "0", label: "Loop" },
                    { value: "1", label: "Continue" },
                    { value: "128", label: "One-shot" }
                  ]
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                  lineNumber: 351,
                  columnNumber: 19
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 349,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 344,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
          lineNumber: 332,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded border p-3 ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-semibold text-text-secondary", children: "Sample Mod 2" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 369,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `text-[9px] px-1.5 py-0.5 rounded ${config.hasSampleMod2 ? isCyan ? "bg-accent-highlight/20 text-accent-highlight" : "bg-green-900/40 text-green-300" : "bg-bg-tertiary text-text-muted"}`, children: config.hasSampleMod2 ? "Active" : "None" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 370,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 368,
            columnNumber: 13
          }, void 0),
          config.hasSampleMod2 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Delay",
                value: config.sampleMod2Delay,
                min: 0,
                max: 255,
                step: 1,
                onChange: (v) => upd("sampleMod2Delay", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 380,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "Shift",
                value: config.sampleMod2Shift,
                min: 0,
                max: 7,
                step: 1,
                onChange: (v) => upd("sampleMod2Shift", v),
                color: knob
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 382,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted mb-1", children: "Mode" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 385,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CustomSelect,
                {
                  className: "bg-dark-bg border border-dark-border text-text-primary text-xs rounded px-1 py-0.5 focus:outline-none focus:border-accent-primary",
                  value: String(config.sampleMod2Mode === 0 ? 0 : config.sampleMod2Mode & 128 ? 128 : 1),
                  onChange: (v) => upd("sampleMod2Mode", Number(v)),
                  options: [
                    { value: "0", label: "Loop" },
                    { value: "1", label: "Continue" },
                    { value: "128", label: "One-shot" }
                  ]
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                  lineNumber: 386,
                  columnNumber: 19
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 384,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 379,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
          lineNumber: 367,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
        lineNumber: 330,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
      lineNumber: 114,
      columnNumber: 7
    }, void 0),
    showSamplePane && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      SampleBrowserPane,
      {
        entries: sampleRows.map((s) => ({
          id: s.id,
          name: `${String(s.id).padStart(2, "0")}. ${s.instrName}`,
          sizeBytes: s.size,
          isCurrent: s.isCurrent
        })),
        emptyMessage: "No Future Player instruments loaded.",
        renderEntry: (entry) => {
          const s = sampleRows.find((r) => r.id === entry.id);
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `font-mono truncate ${s.isCurrent ? "text-accent-primary" : "text-text-primary"}`, children: [
              String(s.id).padStart(2, "0"),
              ". ",
              s.instrName
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 418,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted mt-0.5", children: s.size > 0 ? `${s.size} bytes` : "—" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 421,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-0.5 text-[9px]", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: s.isWavetable ? "text-accent-highlight" : "text-accent-secondary", children: s.isWavetable ? "WAVETABLE" : "PCM" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 425,
                columnNumber: 19
              }, void 0),
              s.isCurrent && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-1 text-accent-primary", children: "(this instrument)" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
                lineNumber: 428,
                columnNumber: 35
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
              lineNumber: 424,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
            lineNumber: 417,
            columnNumber: 15
          }, void 0);
        }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
        lineNumber: 406,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FuturePlayerControls.tsx",
    lineNumber: 113,
    columnNumber: 5
  }, void 0);
};
export {
  FuturePlayerControls
};
