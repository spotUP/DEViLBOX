import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, D as Download } from "./vendor-ui-AJ7AT9BN.js";
import { aA as UADEEngine, aB as Knob, cB as PatternEditorCanvas } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { N as NumBox } from "./NumBox-9OpyboiL.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
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
    color: "#ff8800",
    emptyColor: "var(--color-border-light)",
    emptyValue: 0,
    hexDigits: 2,
    formatter: signedHex2
  }
];
function arpToFormatChannel(data) {
  const rows = data.map((v) => ({ semitone: v }));
  return [{ label: "Arp", patternLength: data.length, rows, isPatternChannel: false }];
}
function makeArpCellChange(data, onChangeData) {
  return (_ch, row, _col, value) => {
    const next = [...data];
    next[row] = value > 127 ? value - 256 : value > 63 ? value - 128 : value;
    onChangeData(next);
  };
}
const FredControls = ({ config, onChange, uadeChipRam }) => {
  const [activeTab, setActiveTab] = reactExports.useState("envelope");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const chipEditorRef = reactExports.useRef(null);
  function getEditor() {
    if (!uadeChipRam) return null;
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#ff8800", { knob: "#ffaa44", dim: "#332200" });
  async function updWithChipRam(key, value, chipWriter) {
    onChange({ [key]: value });
    const editor = getEditor();
    if (editor && uadeChipRam && chipWriter) {
      chipWriter(editor, uadeChipRam.instrBase).catch(console.error);
    }
  }
  const renderEnvelope = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 133,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        EnvelopeVisualization,
        {
          mode: "steps",
          attackVol: config.attackVol,
          attackSpeed: config.attackSpeed,
          decayVol: config.decayVol,
          decaySpeed: config.decaySpeed,
          sustainVol: config.envelopeVol,
          sustainLen: config.sustainTime,
          releaseVol: config.releaseVol,
          releaseSpeed: config.releaseSpeed,
          maxVol: 64,
          width: 320,
          height: 72,
          color: accent
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 135,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 134,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.attackVol,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => void updWithChipRam("attackVol", Math.round(v), async (ed, base) => {
                await ed.writeU8(base + 16, Math.round(v));
              }),
              label: "Atk Vol",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
              lineNumber: 148,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.attackSpeed,
              min: 1,
              max: 255,
              step: 1,
              onChange: (v) => void updWithChipRam("attackSpeed", Math.round(v), async (ed, base) => {
                await ed.writeU8(base + 15, Math.round(v));
              }),
              label: "Atk Spd",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
              lineNumber: 152,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 147,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.decayVol,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => void updWithChipRam("decayVol", Math.round(v), async (ed, base) => {
                await ed.writeU8(base + 18, Math.round(v));
              }),
              label: "Dec Vol",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
              lineNumber: 158,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.decaySpeed,
              min: 1,
              max: 255,
              step: 1,
              onChange: (v) => void updWithChipRam("decaySpeed", Math.round(v), async (ed, base) => {
                await ed.writeU8(base + 17, Math.round(v));
              }),
              label: "Dec Spd",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
              lineNumber: 162,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 157,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.sustainTime,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => void updWithChipRam("sustainTime", Math.round(v), async (ed, base) => {
                await ed.writeU8(base + 19, Math.round(v));
              }),
              label: "Sus Time",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
              lineNumber: 168,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.envelopeVol,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => void updWithChipRam("envelopeVol", Math.round(v), async (ed, base) => {
                await ed.writeU8(base + 14, Math.round(v));
              }),
              label: "Init Vol",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
              lineNumber: 172,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 167,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.releaseVol,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => void updWithChipRam("releaseVol", Math.round(v), async (ed, base) => {
                await ed.writeU8(base + 21, Math.round(v));
              }),
              label: "Rel Vol",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
              lineNumber: 178,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.releaseSpeed,
              min: 1,
              max: 255,
              step: 1,
              onChange: (v) => void updWithChipRam("releaseSpeed", Math.round(v), async (ed, base) => {
                await ed.writeU8(base + 20, Math.round(v));
              }),
              label: "Rel Spd",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
              lineNumber: 182,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 177,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 146,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
      lineNumber: 132,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Relative Tuning" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 190,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.relative,
            min: 256,
            max: 4096,
            step: 1,
            onChange: (v) => void updWithChipRam("relative", Math.round(v), async (ed, base) => {
              await ed.writeU16(base + 8, Math.round(v));
            }),
            label: "Relative",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
            lineNumber: 192,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted max-w-[120px]", children: "1024 = no shift. Values <1024 pitch down, >1024 pitch up." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 196,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 191,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
      lineNumber: 189,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
    lineNumber: 131,
    columnNumber: 5
  }, void 0);
  const renderPWM = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Pulse Width Range" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 208,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.pulsePosL,
            min: 0,
            max: 64,
            step: 1,
            onChange: (v) => void updWithChipRam("pulsePosL", Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 43, Math.round(v));
            }),
            label: "Low",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
            lineNumber: 210,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.pulsePosH,
            min: 0,
            max: 64,
            step: 1,
            onChange: (v) => void updWithChipRam("pulsePosH", Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 44, Math.round(v));
            }),
            label: "High",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
            lineNumber: 214,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 h-4 rounded relative overflow-hidden", style: { background: "var(--color-bg-secondary)", border: `1px solid ${dim}` }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute h-full", style: {
          left: `${config.pulsePosL / 64 * 100}%`,
          width: `${Math.max(0, (config.pulsePosH - config.pulsePosL) / 64 * 100)}%`,
          background: accent,
          opacity: 0.4
        } }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 219,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 218,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 209,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
      lineNumber: 207,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "PWM Modulation" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 229,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.pulseSpeed,
            min: 1,
            max: 255,
            step: 1,
            onChange: (v) => void updWithChipRam("pulseSpeed", Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 42, Math.round(v));
            }),
            label: "Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
            lineNumber: 231,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.pulseDelay,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => void updWithChipRam("pulseDelay", Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 45, Math.round(v));
            }),
            label: "Delay",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
            lineNumber: 235,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.pulseRatePos,
            min: 0,
            max: 127,
            step: 1,
            onChange: (v) => void updWithChipRam("pulseRatePos", Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 41, Math.round(v));
            }),
            label: "Rate +",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
            lineNumber: 239,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.pulseRateNeg,
            min: -128,
            max: 0,
            step: 1,
            onChange: (v) => void updWithChipRam("pulseRateNeg", Math.round(v), async (ed, base) => {
              await ed.writeS8(base + 40, Math.round(v));
            }),
            label: "Rate -",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
            lineNumber: 243,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 230,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-[9px] text-text-muted font-mono", children: "PWM sweeps pulse width from Low to High at +Rate then High to Low at |Rate-|" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 248,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
      lineNumber: 228,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
    lineNumber: 206,
    columnNumber: 5
  }, void 0);
  const arpChannels = reactExports.useMemo(() => arpToFormatChannel(config.arpeggio), [config.arpeggio]);
  const arpCellChange = reactExports.useMemo(
    () => makeArpCellChange(config.arpeggio, (d) => void updWithChipRam("arpeggio", d, async (ed, base) => {
      const bytes = d.slice(0, 16).map((v) => v < 0 ? v + 256 : v);
      await ed.writeBlock(base + 22, bytes);
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.arpeggio]
  );
  const renderArpeggio = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3", style: { height: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Arpeggio Settings" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 269,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          NumBox,
          {
            label: "Active Steps",
            value: config.arpeggioLimit,
            min: 0,
            max: 16,
            color: accent,
            borderColor: dim,
            background: "#0a0800",
            width: "52px",
            onValueChange: (v) => void updWithChipRam("arpeggioLimit", v, async (ed, base) => {
              await ed.writeU8(base + 51, v);
            })
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
            lineNumber: 271,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          NumBox,
          {
            label: "Speed (ticks)",
            value: config.arpeggioSpeed,
            min: 1,
            max: 255,
            color: accent,
            borderColor: dim,
            background: "#0a0800",
            width: "52px",
            onValueChange: (v) => void updWithChipRam("arpeggioSpeed", v, async (ed, base) => {
              await ed.writeU8(base + 38, v);
            })
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
            lineNumber: 274,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 270,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
      lineNumber: 268,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg} flex flex-col`, style: { ...panelStyle, flex: 1, minHeight: 0 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Arpeggio Table (semitone offsets)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 280,
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
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 282,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 281,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[9px] text-text-muted mt-1", children: [
        "Steps 0-",
        config.arpeggioLimit - 1,
        " active (set by Active Steps limit above)"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 291,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
      lineNumber: 279,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
    lineNumber: 267,
    columnNumber: 5
  }, void 0);
  const renderVibrato = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
      lineNumber: 302,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.vibratoDelay,
          min: 0,
          max: 255,
          step: 1,
          onChange: (v) => void updWithChipRam("vibratoDelay", Math.round(v), async (ed, base) => {
            await ed.writeU8(base + 10, Math.round(v));
          }),
          label: "Delay",
          color: knob,
          size: "md",
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 304,
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
          onChange: (v) => void updWithChipRam("vibratoSpeed", Math.round(v), async (ed, base) => {
            await ed.writeU8(base + 12, Math.round(v));
          }),
          label: "Speed",
          color: knob,
          size: "md",
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 308,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.vibratoDepth,
          min: 0,
          max: 63,
          step: 1,
          onChange: (v) => void updWithChipRam("vibratoDepth", Math.round(v), async (ed, base) => {
            await ed.writeU8(base + 13, Math.round(v));
          }),
          label: "Depth",
          color: knob,
          size: "md",
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
          lineNumber: 312,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
      lineNumber: 303,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-[9px] text-text-muted font-mono", children: "Depth in 1/64th semitone units. Speed = ticks per LFO step." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
      lineNumber: 317,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
    lineNumber: 301,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
    lineNumber: 300,
    columnNumber: 5
  }, void 0);
  const TABS = [
    { id: "envelope", label: "Envelope" },
    { id: "pwm", label: "PWM" },
    { id: "arpeggio", label: "Arpeggio" },
    { id: "vibrato", label: "Vibrato" }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dim }, children: TABS.map(({ id, label }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(id),
        className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
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
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 335,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
      lineNumber: 333,
      columnNumber: 7
    }, void 0),
    uadeChipRam && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-end px-3 py-1 border-b", style: { borderColor: dim }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => {
          const editor = getEditor();
          if (editor && uadeChipRam) {
            editor.exportModule(uadeChipRam.moduleBase, uadeChipRam.moduleSize, "fred_module.fred").catch(console.error);
          }
        },
        className: "flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-dark-bgSecondary hover:bg-dark-bg border rounded transition-colors",
        title: "Export module with current edits",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Download, { size: 10 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
            lineNumber: 360,
            columnNumber: 13
          }, void 0),
          "Export .fred (Amiga)"
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
        lineNumber: 349,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
      lineNumber: 348,
      columnNumber: 9
    }, void 0),
    activeTab === "envelope" && renderEnvelope(),
    activeTab === "pwm" && renderPWM(),
    activeTab === "arpeggio" && renderArpeggio(),
    activeTab === "vibrato" && renderVibrato()
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FredControls.tsx",
    lineNumber: 332,
    columnNumber: 5
  }, void 0);
};
export {
  FredControls
};
