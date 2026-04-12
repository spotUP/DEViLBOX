import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React } from "./vendor-ui-AJ7AT9BN.js";
import { cp as DEFAULT_SETBFREE, aB as Knob } from "./main-BbV5VyEH.js";
import { D as DrawbarSlider, S as SegmentButton } from "./DrawbarSlider-Dq9geM4g.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const DRAWBAR_LABELS = ["16'", "5⅓'", "8'", "4'", "2⅔'", "2'", "1⅗'", "1⅓'", "1'"];
const DRAWBAR_COLORS = [
  "#a0522d",
  "#a0522d",
  "#f0f0f0",
  "#f0f0f0",
  "#222222",
  "#f0f0f0",
  "#222222",
  "#222222",
  "#f0f0f0"
];
const UPPER_KEYS = [
  "upper16",
  "upper513",
  "upper8",
  "upper4",
  "upper223",
  "upper2",
  "upper135",
  "upper113",
  "upper1"
];
const LOWER_KEYS = [
  "lower16",
  "lower513",
  "lower8",
  "lower4",
  "lower223",
  "lower2",
  "lower135",
  "lower113",
  "lower1"
];
const PEDAL_KEYS = [
  "pedal16",
  "pedal513",
  "pedal8",
  "pedal4",
  "pedal223",
  "pedal2",
  "pedal135",
  "pedal113",
  "pedal1"
];
const VIBRATO_LABELS = ["Off", "V1", "C1", "V2", "C2", "V3", "C3"];
const LESLIE_LABELS = ["STOP", "SLOW", "FAST"];
const DrawbarBank = React.memo(({ title, keys, merged, update }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-2 text-amber-500", children: title }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
    lineNumber: 56,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-1 sm:gap-2", children: DRAWBAR_LABELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    DrawbarSlider,
    {
      label,
      value: merged[keys[i]] ?? 0,
      color: DRAWBAR_COLORS[i],
      accentColor: "#fbbf24",
      onChange: (v) => update(keys[i], v)
    },
    i,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
      lineNumber: 59,
      columnNumber: 9
    },
    void 0
  )) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
    lineNumber: 57,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
  lineNumber: 55,
  columnNumber: 3
}, void 0));
DrawbarBank.displayName = "DrawbarBank";
const SetBfreeControls = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const [showPedals, setShowPedals] = reactExports.useState(false);
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const merged = { ...DEFAULT_SETBFREE, ...config };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto text-xs", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DrawbarBank, { title: "Upper Manual", keys: UPPER_KEYS, merged, update: updateParam }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
      lineNumber: 92,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DrawbarBank, { title: "Lower Manual", keys: LOWER_KEYS, merged, update: updateParam }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
      lineNumber: 95,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setShowPedals(!showPedals),
          className: "font-bold uppercase tracking-tight text-sm text-amber-500 w-full text-left flex items-center gap-2",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `transition-transform ${showPedals ? "rotate-90" : ""}`, children: "▶" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
              lineNumber: 103,
              columnNumber: 11
            }, void 0),
            "Pedals"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
          lineNumber: 99,
          columnNumber: 9
        },
        void 0
      ),
      showPedals && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-1 sm:gap-2 mt-4", children: DRAWBAR_LABELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        DrawbarSlider,
        {
          label,
          value: merged[PEDAL_KEYS[i]] ?? 0,
          color: DRAWBAR_COLORS[i],
          onChange: (v) => updateParam(PEDAL_KEYS[i], v)
        },
        i,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
          lineNumber: 109,
          columnNumber: 15
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 107,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
      lineNumber: 98,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Percussion" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 123,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SegmentButton,
          {
            labels: ["OFF", "ON"],
            value: merged.percEnable,
            onChange: (v) => updateParam("percEnable", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 125,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-8 bg-dark-bgHover" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
          lineNumber: 130,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SegmentButton,
          {
            labels: ["NORMAL", "SOFT"],
            value: merged.percVolume,
            onChange: (v) => updateParam("percVolume", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 131,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-8 bg-dark-bgHover" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
          lineNumber: 136,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SegmentButton,
          {
            labels: ["SLOW", "FAST"],
            value: merged.percDecay,
            onChange: (v) => updateParam("percDecay", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 137,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-8 bg-dark-bgHover" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
          lineNumber: 142,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SegmentButton,
          {
            labels: ["2ND", "3RD"],
            value: merged.percHarmonic,
            onChange: (v) => updateParam("percHarmonic", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 143,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-8 bg-dark-bgHover" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
          lineNumber: 148,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Gain",
            value: merged.percGain,
            min: 0,
            max: 22,
            defaultValue: 11,
            onChange: (v) => updateParam("percGain", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 149,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 124,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
      lineNumber: 122,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Vibrato / Chorus" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 163,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-start gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SegmentButton,
          {
            labels: VIBRATO_LABELS,
            value: merged.vibratoType,
            onChange: (v) => updateParam("vibratoType", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 165,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-8 bg-dark-bgHover" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
          lineNumber: 170,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateParam("vibratoUpper", merged.vibratoUpper ? 0 : 1),
              className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${merged.vibratoUpper ? "bg-amber-600 text-black" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
              children: "UPPER"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
              lineNumber: 172,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateParam("vibratoLower", merged.vibratoLower ? 0 : 1),
              className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${merged.vibratoLower ? "bg-amber-600 text-black" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
              children: "LOWER"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
              lineNumber: 182,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
          lineNumber: 171,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Freq",
            value: merged.vibratoFreq,
            min: 4,
            max: 22,
            defaultValue: 7,
            onChange: (v) => updateParam("vibratoFreq", v),
            color: "#d4a017",
            unit: "Hz"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 193,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 164,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
      lineNumber: 162,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Leslie Speaker" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 208,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-start gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SegmentButton,
          {
            labels: LESLIE_LABELS,
            value: merged.leslieSpeed,
            onChange: (v) => updateParam("leslieSpeed", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 210,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-8 bg-dark-bgHover" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
          lineNumber: 215,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam("leslieBrake", merged.leslieBrake ? 0 : 1),
            className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${merged.leslieBrake ? "bg-red-600 text-white" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: "BRAKE"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 216,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 209,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 mt-3 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Horn Slow",
            value: merged.hornSlowRpm,
            min: 5,
            max: 200,
            defaultValue: 40,
            onChange: (v) => updateParam("hornSlowRpm", v),
            color: "#d4a017",
            unit: "rpm"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 228,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Horn Fast",
            value: merged.hornFastRpm,
            min: 100,
            max: 900,
            defaultValue: 400,
            onChange: (v) => updateParam("hornFastRpm", v),
            color: "#d4a017",
            unit: "rpm"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 230,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Horn Acc",
            value: merged.hornAccel,
            min: 0.05,
            max: 2,
            defaultValue: 0.161,
            onChange: (v) => updateParam("hornAccel", v),
            color: "#d4a017",
            unit: "s"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 232,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Drum Slow",
            value: merged.drumSlowRpm,
            min: 5,
            max: 100,
            defaultValue: 36,
            onChange: (v) => updateParam("drumSlowRpm", v),
            color: "#d4a017",
            unit: "rpm"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 234,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Drum Fast",
            value: merged.drumFastRpm,
            min: 60,
            max: 600,
            defaultValue: 357,
            onChange: (v) => updateParam("drumFastRpm", v),
            color: "#d4a017",
            unit: "rpm"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 236,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Drum Acc",
            value: merged.drumAccel,
            min: 0.5,
            max: 10,
            defaultValue: 4.127,
            onChange: (v) => updateParam("drumAccel", v),
            color: "#d4a017",
            unit: "s"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 238,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 227,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
      lineNumber: 207,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Effects" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 245,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-start gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam("overdriveEnable", merged.overdriveEnable ? 0 : 1),
            className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${merged.overdriveEnable ? "bg-red-600 text-white" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: "OVERDRIVE"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 247,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "OD Char",
            value: merged.overdriveCharacter,
            min: 0,
            max: 127,
            defaultValue: 0,
            onChange: (v) => updateParam("overdriveCharacter", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 257,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-8 bg-dark-bgHover" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
          lineNumber: 259,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Reverb Mix",
            value: merged.reverbMix,
            min: 0,
            max: 1,
            defaultValue: 0.1,
            onChange: (v) => updateParam("reverbMix", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 260,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Reverb Wet",
            value: merged.reverbWet,
            min: 0,
            max: 1,
            defaultValue: 0.1,
            onChange: (v) => updateParam("reverbWet", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 262,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 246,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
      lineNumber: 244,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Master" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 269,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Volume",
            value: merged.volume,
            min: 0,
            max: 1,
            defaultValue: 0.8,
            onChange: (v) => updateParam("volume", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 271,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Key Click",
            value: merged.keyClick,
            min: 0,
            max: 1,
            defaultValue: 0.5,
            onChange: (v) => updateParam("keyClick", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 273,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Tuning",
            value: merged.tuning,
            min: 220,
            max: 880,
            defaultValue: 440,
            onChange: (v) => updateParam("tuning", v),
            color: "#d4a017",
            unit: "Hz"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 275,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Output",
            value: merged.outputLevel,
            min: 0,
            max: 1,
            defaultValue: 0.8,
            onChange: (v) => updateParam("outputLevel", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 277,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Swell",
            value: merged.swellPedal,
            min: 0,
            max: 1,
            defaultValue: 1,
            onChange: (v) => updateParam("swellPedal", v),
            color: "#d4a017"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
            lineNumber: 279,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
        lineNumber: 270,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
      lineNumber: 268,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SetBfreeControls.tsx",
    lineNumber: 90,
    columnNumber: 5
  }, void 0);
};
export {
  SetBfreeControls,
  SetBfreeControls as default
};
