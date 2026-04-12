import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React } from "./vendor-ui-AJ7AT9BN.js";
import { cy as DEFAULT_ZYNADDSUBFX, aB as Knob } from "./main-BbV5VyEH.js";
import { S as SegmentButton } from "./DrawbarSlider-Dq9geM4g.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const WAVE_LABELS = ["Sine", "Tri", "Saw", "Sq", "Noise", "Voice", "Chirp"];
const FILTER_LABELS = ["LP", "HP", "BP", "Notch", "Peak", "LShelf"];
const MAG_LABELS = ["Linear", "dB", "-40dB", "-60dB"];
const TAB_NAMES = ["ADDsynth", "SUBsynth", "PADsynth", "Filter/Env", "Effects"];
const VoiceControls = React.memo(({
  index,
  waveKey,
  volKey,
  detuneKey,
  octaveKey,
  merged,
  update
}) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded-lg border border-dark-borderLight bg-dark-bgSecondary", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted font-bold mb-2", children: [
    "Voice ",
    index + 1
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
    lineNumber: 42,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-start gap-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Wave" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 45,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        SegmentButton,
        {
          labels: WAVE_LABELS,
          value: merged[waveKey],
          onChange: (v) => update(waveKey, v),
          activeClass: "bg-emerald-600 text-white"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 46,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
      lineNumber: 44,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        label: "Volume",
        value: merged[volKey],
        min: 0,
        max: 1,
        defaultValue: 0,
        onChange: (v) => update(volKey, v),
        color: "#f43f5e"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 49,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        label: "Detune",
        value: merged[detuneKey],
        min: -1,
        max: 1,
        defaultValue: 0,
        onChange: (v) => update(detuneKey, v),
        color: "#f43f5e"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 51,
        columnNumber: 7
      },
      void 0
    ),
    octaveKey && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        label: "Octave",
        value: merged[octaveKey],
        min: -4,
        max: 4,
        defaultValue: 0,
        onChange: (v) => update(octaveKey, Math.round(v)),
        color: "#f43f5e"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 54,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
    lineNumber: 43,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
  lineNumber: 41,
  columnNumber: 3
}, void 0));
VoiceControls.displayName = "VoiceControls";
const ZynAddSubFXControls = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const [activeTab, setActiveTab] = reactExports.useState(0);
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const merged = { ...DEFAULT_ZYNADDSUBFX, ...config };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto text-xs", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 border-b border-dark-borderLight pb-1", children: TAB_NAMES.map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(i),
        className: `px-3 py-1.5 text-xs font-bold rounded-t transition-all ${activeTab === i ? "bg-rose-600 text-white" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
        children: name
      },
      name,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 83,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
      lineNumber: 81,
      columnNumber: 7
    }, void 0),
    activeTab === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm text-rose-400", children: "ADDsynth" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 102,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam("addEnable", merged.addEnable ? 0 : 1),
            className: `px-3 py-1 text-xs font-bold rounded transition-all ${merged.addEnable ? "bg-rose-500 text-white" : "bg-dark-bgTertiary text-text-secondary"}`,
            children: merged.addEnable ? "ON" : "OFF"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 103,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 101,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Volume",
            value: merged.addVolume,
            min: 0,
            max: 1,
            defaultValue: 0.8,
            onChange: (v) => updateParam("addVolume", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 113,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Pan",
            value: merged.addPanning,
            min: -1,
            max: 1,
            defaultValue: 0,
            onChange: (v) => updateParam("addPanning", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 115,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Detune",
            value: merged.addDetune,
            min: -1,
            max: 1,
            defaultValue: 0,
            onChange: (v) => updateParam("addDetune", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 117,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Octave",
            value: merged.addOctave,
            min: -4,
            max: 4,
            defaultValue: 0,
            onChange: (v) => updateParam("addOctave", Math.round(v)),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 119,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 112,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          VoiceControls,
          {
            index: 0,
            waveKey: "addVoice1Wave",
            volKey: "addVoice1Volume",
            detuneKey: "addVoice1Detune",
            merged,
            update: updateParam
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 123,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          VoiceControls,
          {
            index: 1,
            waveKey: "addVoice2Wave",
            volKey: "addVoice2Volume",
            detuneKey: "addVoice2Detune",
            octaveKey: "addVoice2Octave",
            merged,
            update: updateParam
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 125,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          VoiceControls,
          {
            index: 2,
            waveKey: "addVoice3Wave",
            volKey: "addVoice3Volume",
            detuneKey: "addVoice3Detune",
            octaveKey: "addVoice3Octave",
            merged,
            update: updateParam
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 127,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          VoiceControls,
          {
            index: 3,
            waveKey: "addVoice4Wave",
            volKey: "addVoice4Volume",
            detuneKey: "addVoice4Detune",
            octaveKey: "addVoice4Octave",
            merged,
            update: updateParam
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 129,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 122,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
      lineNumber: 100,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
      lineNumber: 99,
      columnNumber: 9
    }, void 0),
    activeTab === 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm text-rose-400", children: "SUBsynth" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 140,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam("subEnable", merged.subEnable ? 0 : 1),
            className: `px-3 py-1 text-xs font-bold rounded transition-all ${merged.subEnable ? "bg-rose-500 text-white" : "bg-dark-bgTertiary text-text-secondary"}`,
            children: merged.subEnable ? "ON" : "OFF"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 141,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 139,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Volume",
            value: merged.subVolume,
            min: 0,
            max: 1,
            defaultValue: 0.8,
            onChange: (v) => updateParam("subVolume", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 151,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Pan",
            value: merged.subPanning,
            min: -1,
            max: 1,
            defaultValue: 0,
            onChange: (v) => updateParam("subPanning", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 153,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Octave",
            value: merged.subOctave,
            min: -4,
            max: 4,
            defaultValue: 0,
            onChange: (v) => updateParam("subOctave", Math.round(v)),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 155,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Detune",
            value: merged.subDetune,
            min: -1,
            max: 1,
            defaultValue: 0,
            onChange: (v) => updateParam("subDetune", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 157,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 150,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Bandwidth",
            value: merged.subBandwidth,
            min: 0,
            max: 1,
            defaultValue: 0.5,
            onChange: (v) => updateParam("subBandwidth", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 161,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "BW Scale",
            value: merged.subBandwidthScale,
            min: 0,
            max: 1,
            defaultValue: 0.5,
            onChange: (v) => updateParam("subBandwidthScale", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 163,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Harmonics",
            value: merged.subNumHarmonics,
            min: 1,
            max: 64,
            defaultValue: 8,
            onChange: (v) => updateParam("subNumHarmonics", Math.round(v)),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 165,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 160,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Mag Type" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 169,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SegmentButton,
          {
            labels: MAG_LABELS,
            value: merged.subMagType,
            onChange: (v) => updateParam("subMagType", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 170,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 168,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 mt-3", children: ["subHarmonic1", "subHarmonic2", "subHarmonic3", "subHarmonic4", "subHarmonic5", "subHarmonic6"].map((key, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: `H${i + 1}`,
          value: merged[key],
          min: 0,
          max: 1,
          defaultValue: DEFAULT_ZYNADDSUBFX[key] ?? 0,
          onChange: (v) => updateParam(key, v),
          color: "#f43f5e"
        },
        key,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 175,
          columnNumber: 15
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 173,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
      lineNumber: 138,
      columnNumber: 9
    }, void 0),
    activeTab === 2 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm text-rose-400", children: "PADsynth" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 187,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam("padEnable", merged.padEnable ? 0 : 1),
            className: `px-3 py-1 text-xs font-bold rounded transition-all ${merged.padEnable ? "bg-rose-500 text-white" : "bg-dark-bgTertiary text-text-secondary"}`,
            children: merged.padEnable ? "ON" : "OFF"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 188,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 186,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Volume",
            value: merged.padVolume,
            min: 0,
            max: 1,
            defaultValue: 0.8,
            onChange: (v) => updateParam("padVolume", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 198,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Pan",
            value: merged.padPanning,
            min: -1,
            max: 1,
            defaultValue: 0,
            onChange: (v) => updateParam("padPanning", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 200,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Octave",
            value: merged.padOctave,
            min: -4,
            max: 4,
            defaultValue: 0,
            onChange: (v) => updateParam("padOctave", Math.round(v)),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 202,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Detune",
            value: merged.padDetune,
            min: -1,
            max: 1,
            defaultValue: 0,
            onChange: (v) => updateParam("padDetune", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 204,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 197,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Bandwidth",
            value: merged.padBandwidth,
            min: 0,
            max: 1,
            defaultValue: 0.5,
            onChange: (v) => updateParam("padBandwidth", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 208,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "BW Scale",
            value: merged.padBandwidthScale,
            min: 0,
            max: 1,
            defaultValue: 0.5,
            onChange: (v) => updateParam("padBandwidthScale", v),
            color: "#f43f5e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 210,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 207,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Quality" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 214,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SegmentButton,
          {
            labels: ["Low", "Med", "High", "Ultra"],
            value: merged.padQuality,
            onChange: (v) => updateParam("padQuality", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 215,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 213,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
      lineNumber: 185,
      columnNumber: 9
    }, void 0),
    activeTab === 3 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-rose-400", children: "Filter" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 225,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1 mb-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Type" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
            lineNumber: 227,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            SegmentButton,
            {
              labels: FILTER_LABELS,
              value: merged.filterType,
              onChange: (v) => updateParam("filterType", v),
              activeClass: "bg-sky-500 text-white"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 228,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 226,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Cutoff",
              value: merged.filterCutoff,
              min: 0,
              max: 1,
              defaultValue: 0.8,
              onChange: (v) => updateParam("filterCutoff", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 232,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Reso",
              value: merged.filterResonance,
              min: 0,
              max: 1,
              defaultValue: 0.2,
              onChange: (v) => updateParam("filterResonance", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 234,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Env Amt",
              value: merged.filterEnvAmount,
              min: 0,
              max: 1,
              defaultValue: 0,
              onChange: (v) => updateParam("filterEnvAmount", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 236,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Velocity",
              value: merged.filterVelocity,
              min: 0,
              max: 1,
              defaultValue: 0.5,
              onChange: (v) => updateParam("filterVelocity", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 238,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Key Trk",
              value: merged.filterKeyTrack,
              min: 0,
              max: 1,
              defaultValue: 0.5,
              onChange: (v) => updateParam("filterKeyTrack", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 240,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 231,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 224,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-rose-400", children: "Filter Envelope" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 245,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Attack",
              value: merged.filterAttack,
              min: 0,
              max: 1,
              defaultValue: 0.01,
              onChange: (v) => updateParam("filterAttack", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 247,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Decay",
              value: merged.filterDecay,
              min: 0,
              max: 1,
              defaultValue: 0.3,
              onChange: (v) => updateParam("filterDecay", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 249,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Sustain",
              value: merged.filterSustain,
              min: 0,
              max: 1,
              defaultValue: 0.7,
              onChange: (v) => updateParam("filterSustain", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 251,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Release",
              value: merged.filterRelease,
              min: 0,
              max: 1,
              defaultValue: 0.3,
              onChange: (v) => updateParam("filterRelease", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 253,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 246,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 244,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-rose-400", children: "Amp Envelope" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 258,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Attack",
              value: merged.ampAttack,
              min: 0,
              max: 1,
              defaultValue: 0.01,
              onChange: (v) => updateParam("ampAttack", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 260,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Decay",
              value: merged.ampDecay,
              min: 0,
              max: 1,
              defaultValue: 0.1,
              onChange: (v) => updateParam("ampDecay", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 262,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Sustain",
              value: merged.ampSustain,
              min: 0,
              max: 1,
              defaultValue: 1,
              onChange: (v) => updateParam("ampSustain", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 264,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Release",
              value: merged.ampRelease,
              min: 0,
              max: 1,
              defaultValue: 0.2,
              onChange: (v) => updateParam("ampRelease", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 266,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 259,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 257,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
      lineNumber: 223,
      columnNumber: 9
    }, void 0),
    activeTab === 4 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-rose-400", children: "Reverb" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 277,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Mix",
              value: merged.reverbWet,
              min: 0,
              max: 1,
              defaultValue: 0,
              onChange: (v) => updateParam("reverbWet", v),
              color: "#f43f5e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 279,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Preset",
              value: merged.reverbSize,
              min: 0,
              max: 7,
              defaultValue: 1,
              onChange: (v) => updateParam("reverbSize", Math.round(v)),
              color: "#f43f5e",
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 281,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 278,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 276,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-rose-400", children: "Chorus" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 287,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Type",
              value: merged.chorusWet,
              min: 0,
              max: 8,
              defaultValue: 0,
              onChange: (v) => updateParam("chorusWet", Math.round(v)),
              color: "#f43f5e",
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 289,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Preset",
              value: merged.chorusRate,
              min: 0,
              max: 7,
              defaultValue: 0,
              onChange: (v) => updateParam("chorusRate", Math.round(v)),
              color: "#f43f5e",
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 292,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 288,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 286,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-rose-400", children: "Distortion" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 298,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-start gap-4 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Type",
              value: merged.distortionWet,
              min: 0,
              max: 8,
              defaultValue: 0,
              onChange: (v) => updateParam("distortionWet", Math.round(v)),
              color: "#f43f5e",
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 300,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Preset",
              value: merged.distortionDrive,
              min: 0,
              max: 7,
              defaultValue: 0,
              onChange: (v) => updateParam("distortionDrive", Math.round(v)),
              color: "#f43f5e",
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
              lineNumber: 303,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
          lineNumber: 299,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
        lineNumber: 297,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
      lineNumber: 275,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ZynAddSubFXControls.tsx",
    lineNumber: 79,
    columnNumber: 5
  }, void 0);
};
export {
  ZynAddSubFXControls,
  ZynAddSubFXControls as default
};
