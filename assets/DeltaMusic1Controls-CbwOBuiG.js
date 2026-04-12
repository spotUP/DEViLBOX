import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aA as UADEEngine, aB as Knob, cB as PatternEditorCanvas } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
const OFF_ATTACK_STEP = 0;
const OFF_ATTACK_DELAY = 1;
const OFF_DECAY_STEP = 2;
const OFF_DECAY_DELAY = 3;
const OFF_SUSTAIN = 4;
const OFF_RELEASE_STEP = 6;
const OFF_RELEASE_DELAY = 7;
const OFF_VOLUME = 8;
const OFF_VIBRATO_WAIT = 9;
const OFF_VIBRATO_STEP = 10;
const OFF_VIBRATO_LENGTH = 11;
const OFF_BEND_RATE = 12;
const OFF_PORTAMENTO = 13;
const OFF_TABLE_DELAY = 15;
const OFF_ARPEGGIO = 16;
const OFF_TABLE = 30;
function signedHex2(val) {
  if (val === 0) return " 00";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "+";
  return `${sign}${abs.toString(16).toUpperCase().padStart(2, "0")}`;
}
const ARP_COLUMN = [
  {
    key: "semitone",
    label: "ST",
    charWidth: 3,
    type: "hex",
    color: "#ff9944",
    emptyColor: "var(--color-border-light)",
    emptyValue: 0,
    hexDigits: 2,
    formatter: signedHex2
  }
];
const TABLE_COLUMN = [
  {
    key: "value",
    label: "VAL",
    charWidth: 3,
    type: "hex",
    color: "#ff9944",
    emptyColor: "var(--color-border-light)",
    emptyValue: 0,
    hexDigits: 2,
    formatter: (v) => v.toString(16).toUpperCase().padStart(2, "0")
  }
];
const DeltaMusic1Controls = ({
  config,
  onChange,
  uadeChipRam
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("envelope");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const chipEditorRef = reactExports.useRef(null);
  const getEditor = reactExports.useCallback(() => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#ff9944", { knob: "#ffbb66", dim: "#331800" });
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
  }, [onChange]);
  const updU8 = reactExports.useCallback(
    (key, value, byteOffset) => {
      onChange({ [key]: value });
      if (uadeChipRam) {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 255);
      }
    },
    [onChange, uadeChipRam, getEditor]
  );
  const updS8 = reactExports.useCallback(
    (key, value, byteOffset) => {
      onChange({ [key]: value });
      if (uadeChipRam) {
        void getEditor().writeS8(uadeChipRam.instrBase + byteOffset, value);
      }
    },
    [onChange, uadeChipRam, getEditor]
  );
  const updU16 = reactExports.useCallback(
    (key, value, byteOffset) => {
      onChange({ [key]: value });
      if (uadeChipRam) {
        void getEditor().writeU16(uadeChipRam.instrBase + byteOffset, value & 65535);
      }
    },
    [onChange, uadeChipRam, getEditor]
  );
  const updateTableEntry = reactExports.useCallback((index, value) => {
    if (!configRef.current.table) return;
    const clamped = Math.max(0, Math.min(255, Math.round(value))) & 255;
    const newTable = [...configRef.current.table];
    newTable[index] = clamped;
    onChange({ table: newTable });
    if (uadeChipRam) {
      void getEditor().writeU8(uadeChipRam.instrBase + OFF_TABLE + index, clamped);
    }
  }, [onChange, uadeChipRam, getEditor]);
  const renderEnvelope = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 210,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.volume,
            min: 0,
            max: 64,
            step: 1,
            onChange: (v) => updU8("volume", Math.round(v), OFF_VOLUME),
            label: "Volume",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
            lineNumber: 212,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "0-64 Amiga scale" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 218,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 211,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 209,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 224,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider block mb-1", style: { color: accent, opacity: 0.5 }, children: "Attack" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 228,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.attackStep,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updU8("attackStep", Math.round(v), OFF_ATTACK_STEP),
              label: "Step",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
              lineNumber: 230,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.attackDelay,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updU8("attackDelay", Math.round(v), OFF_ATTACK_DELAY),
              label: "Delay",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
              lineNumber: 236,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 229,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 227,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider block mb-1", style: { color: accent, opacity: 0.5 }, children: "Decay" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 247,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.decayStep,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updU8("decayStep", Math.round(v), OFF_DECAY_STEP),
              label: "Step",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
              lineNumber: 249,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.decayDelay,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updU8("decayDelay", Math.round(v), OFF_DECAY_DELAY),
              label: "Delay",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
              lineNumber: 255,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 248,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 246,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider block mb-1", style: { color: accent, opacity: 0.5 }, children: "Sustain" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 266,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.sustain,
              min: 0,
              max: 65535,
              step: 1,
              onChange: (v) => updU16("sustain", Math.round(v), OFF_SUSTAIN),
              label: "Length",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
              lineNumber: 268,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted self-center", children: "ticks (0 = off)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
            lineNumber: 274,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 267,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 265,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider block mb-1", style: { color: accent, opacity: 0.5 }, children: "Release" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 280,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.releaseStep,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updU8("releaseStep", Math.round(v), OFF_RELEASE_STEP),
              label: "Step",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
              lineNumber: 282,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.releaseDelay,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updU8("releaseDelay", Math.round(v), OFF_RELEASE_DELAY),
              label: "Delay",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
              lineNumber: 288,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 281,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 279,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        EnvelopeVisualization,
        {
          mode: "steps",
          attackVol: config.volume,
          attackSpeed: config.attackStep > 0 ? config.attackDelay : 0,
          decayVol: config.volume / 2,
          decaySpeed: config.decayStep > 0 ? config.decayDelay : 0,
          sustainVol: config.volume / 2,
          sustainLen: Math.min(config.sustain, 255),
          releaseVol: 0,
          releaseSpeed: config.releaseStep > 0 ? config.releaseDelay : 0,
          maxVol: 64,
          width: 320,
          height: 72,
          color: accent
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 299,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 298,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 223,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
    lineNumber: 206,
    columnNumber: 5
  }, void 0);
  const renderModulation = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 319,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoWait,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8("vibratoWait", Math.round(v), OFF_VIBRATO_WAIT),
            label: "Wait",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
            lineNumber: 321,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoStep,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8("vibratoStep", Math.round(v), OFF_VIBRATO_STEP),
            label: "Step",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
            lineNumber: 327,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoLength,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8("vibratoLength", Math.round(v), OFF_VIBRATO_LENGTH),
            label: "Depth",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
            lineNumber: 333,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 320,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mt-1", children: "Wait: ticks before start. Step: LFO speed. Depth: period delta." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 340,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 318,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Pitch Bend" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 345,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.bendRate,
            min: -128,
            max: 127,
            step: 1,
            onChange: (v) => updS8("bendRate", Math.round(v), OFF_BEND_RATE),
            label: "Rate",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
            lineNumber: 347,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "0 = no bend" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 353,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 346,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 344,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Portamento" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 359,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.portamento,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8("portamento", Math.round(v), OFF_PORTAMENTO),
            label: "Speed",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
            lineNumber: 361,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "0 = disabled" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 367,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 360,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 358,
      columnNumber: 7
    }, void 0),
    !config.isSample && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Synth Table Delay" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 374,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.tableDelay,
            min: 0,
            max: 127,
            step: 1,
            onChange: (v) => updU8("tableDelay", Math.round(v), OFF_TABLE_DELAY),
            label: "Delay",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
            lineNumber: 376,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "ticks between waveform segment advances" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 382,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 375,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 373,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
    lineNumber: 315,
    columnNumber: 5
  }, void 0);
  const arpChannels = reactExports.useMemo(() => {
    const arpData = config.arpeggio.slice(0, 8);
    while (arpData.length < 8) arpData.push(0);
    const rows = arpData.map((v) => ({ semitone: v }));
    return [{ label: "Arp", patternLength: 8, rows, isPatternChannel: false }];
  }, [config.arpeggio]);
  const arpCellChange = reactExports.useMemo(() => {
    return (_ch, row, _col, value) => {
      const arpData = configRef.current.arpeggio.slice(0, 8);
      while (arpData.length < 8) arpData.push(0);
      arpData[row] = value > 127 ? value - 256 : value > 63 ? value - 128 : value;
      upd("arpeggio", arpData);
      if (uadeChipRam) {
        void getEditor().writeBlock(
          uadeChipRam.instrBase + OFF_ARPEGGIO,
          arpData.map((v) => v & 255)
        );
      }
    };
  }, [upd, uadeChipRam, getEditor]);
  const renderArpeggio = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3", style: { height: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg} flex flex-col`, style: { ...panelStyle, flex: 1, minHeight: 0 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Arpeggio Table (8 steps)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 417,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mb-2", children: "8 semitone offsets played in sequence. 0 = no arpeggio." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 418,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 120 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      PatternEditorCanvas,
      {
        formatColumns: ARP_COLUMN,
        formatChannels: arpChannels,
        formatCurrentRow: 0,
        formatIsPlaying: false,
        onFormatCellChange: arpCellChange,
        hideVUMeters: true
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 422,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 421,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
    lineNumber: 416,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
    lineNumber: 415,
    columnNumber: 5
  }, void 0);
  const tableChannels = reactExports.useMemo(() => {
    if (config.isSample || !config.table) return [];
    const rows = config.table.map((v) => ({ value: v }));
    return [{ label: "Tbl", patternLength: config.table.length, rows, isPatternChannel: false }];
  }, [config.table, config.isSample]);
  const tableCellChange = reactExports.useMemo(() => {
    return (_ch, row, _col, value) => {
      updateTableEntry(row, value);
    };
  }, [updateTableEntry]);
  const renderTable = () => {
    if (config.isSample || !config.table) {
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 text-[11px] text-text-muted", children: "No synth sound table — this is a PCM sample instrument." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 452,
        columnNumber: 9
      }, void 0);
    }
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3", style: { height: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg} flex flex-col`, style: { ...panelStyle, flex: 1, minHeight: 0 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Sound Table (48-byte sequence)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 461,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mb-2", children: "W## = waveform segment (0-7F), D## = delay (80-FE), FF = loop" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 462,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 120 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        PatternEditorCanvas,
        {
          formatColumns: TABLE_COLUMN,
          formatChannels: tableChannels,
          formatCurrentRow: 0,
          formatIsPlaying: false,
          onFormatCellChange: tableCellChange,
          hideVUMeters: true
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 466,
          columnNumber: 13
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 465,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 460,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 459,
      columnNumber: 7
    }, void 0);
  };
  const sampleCanvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (activeTab !== "sample") return;
    const canvas = sampleCanvasRef.current;
    if (!canvas) return;
    const sd = configRef.current.sampleData;
    if (!sd || sd.length === 0) return;
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 320;
      const cssH = canvas.clientHeight || 120;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      const w = cssW;
      const h = cssH;
      const mid = h / 2;
      ctx.fillStyle = "#0a0e14";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#1a2a3a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const step = Math.max(1, Math.floor(sd.length / w));
      for (let x = 0; x < w; x++) {
        const i = Math.min(sd.length - 1, Math.floor(x / w * sd.length));
        let peak = 0;
        const end = Math.min(sd.length, i + step);
        for (let j = i; j < end; j++) {
          const v = sd[j];
          const signed = v > 127 ? v - 256 : v;
          if (Math.abs(signed) > Math.abs(peak)) peak = signed;
        }
        const y = mid - peak / 128 * (mid - 2);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    const raf = requestAnimationFrame(draw);
    const obs = new ResizeObserver(draw);
    obs.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [activeTab, config.sampleData, accent]);
  const renderSample = () => {
    const sd = config.sampleData;
    if (!sd || sd.length === 0) {
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 text-[11px] text-text-muted", children: "No raw sample data available for this instrument." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 553,
        columnNumber: 9
      }, void 0);
    }
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Raw Sample Data (read-only preview)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 561,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mb-2", children: [
        sd.length.toLocaleString(),
        " bytes — signed 8-bit PCM from the DM1 sample pool.",
        config.isSample ? " This is the playable PCM sample for this instrument." : " For synth instruments this is the waveform pool used by the sound table."
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 562,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "canvas",
        {
          ref: sampleCanvasRef,
          className: "w-full rounded border border-dark-border bg-[#0a0e14]",
          style: { height: 140 }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 568,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono",
          style: { color: accent, opacity: 0.8 },
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Bytes: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: sd.length }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
                lineNumber: 575,
                columnNumber: 25
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
              lineNumber: 575,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Min: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: Math.min(...sd.map((v) => v > 127 ? v - 256 : v)) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
                lineNumber: 576,
                columnNumber: 23
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
              lineNumber: 576,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Max: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: Math.max(...sd.map((v) => v > 127 ? v - 256 : v)) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
                lineNumber: 579,
                columnNumber: 23
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
              lineNumber: 579,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Mode: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: config.isSample ? "PCM sample" : "Synth waveform pool" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
                lineNumber: 582,
                columnNumber: 24
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
              lineNumber: 582,
              columnNumber: 13
            }, void 0)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
          lineNumber: 573,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 560,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 559,
      columnNumber: 7
    }, void 0);
  };
  const hasSampleData = !!(config.sampleData && config.sampleData.length > 0);
  const tabs = [
    ["envelope", "Envelope"],
    ["modulation", "Modulation"],
    ["arpeggio", "Arpeggio"],
    ...!config.isSample ? [["table", "Table"]] : [],
    ...hasSampleData ? [["sample", "Sample"]] : []
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
          background: activeTab === id ? isCyan ? "#041510" : "#1a0e00" : "transparent"
        },
        children: label
      },
      id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 605,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
      lineNumber: 603,
      columnNumber: 7
    }, void 0),
    activeTab === "envelope" && renderEnvelope(),
    activeTab === "modulation" && renderModulation(),
    activeTab === "arpeggio" && renderArpeggio(),
    activeTab === "table" && renderTable(),
    activeTab === "sample" && renderSample(),
    uadeChipRam && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "flex justify-end px-3 py-2 border-t border-opacity-30",
        style: { borderColor: dim },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            className: "text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100 transition-colors",
            style: { background: "rgba(80,50,20,0.5)", color: "#ffaa44" },
            onClick: () => void getEditor().exportModule(
              uadeChipRam.moduleBase,
              uadeChipRam.moduleSize,
              "song.dm"
            ),
            children: "Export .dm (Amiga)"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
            lineNumber: 627,
            columnNumber: 11
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
        lineNumber: 625,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic1Controls.tsx",
    lineNumber: 602,
    columnNumber: 5
  }, void 0);
};
export {
  DeltaMusic1Controls
};
