import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aA as UADEEngine, aB as Knob, cB as PatternEditorCanvas } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
const ARP_COLUMN = [
  {
    key: "value",
    label: "Arp",
    charWidth: 3,
    type: "hex",
    color: "#44aaff",
    emptyColor: "var(--color-border-light)",
    emptyValue: 0,
    hexDigits: 2,
    formatter: (v) => v.toString(16).toUpperCase().padStart(2, "0")
  }
];
function signedHex2(val) {
  if (val === 0) return " 00";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "+";
  return `${sign}${abs.toString(16).toUpperCase().padStart(2, "0")}`;
}
const WAVE_COLUMN = [
  {
    key: "value",
    label: "Wave",
    charWidth: 3,
    type: "hex",
    color: "#44aaff",
    emptyColor: "var(--color-border-light)",
    emptyValue: 0,
    hexDigits: 2,
    formatter: signedHex2
  }
];
const SidMon1Controls = ({ config, onChange, uadeChipRam }) => {
  const [activeTab, setActiveTab] = reactExports.useState("main");
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
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#44aaff", { knob: "#66bbff", dim: "#001833" });
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
  }, [onChange]);
  const updU8WithChipRam = reactExports.useCallback(
    (key, value, byteOffset) => {
      upd(key, value);
      if (uadeChipRam && typeof value === "number") {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 255);
      }
    },
    [upd, uadeChipRam, getEditor]
  );
  const renderMain = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "ADSR Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 135,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        EnvelopeVisualization,
        {
          mode: "steps",
          attackVol: config.attackMax ?? 0,
          attackSpeed: config.attackSpeed ?? 0,
          decayVol: config.decayMin ?? 0,
          decaySpeed: config.decaySpeed ?? 0,
          sustainVol: config.decayMin ?? 0,
          sustainLen: config.sustain ?? 0,
          releaseVol: config.releaseMin ?? 0,
          releaseSpeed: config.releaseSpeed ?? 0,
          maxVol: 64,
          color: knob,
          width: 300,
          height: 56
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
          lineNumber: 137,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 136,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.attackSpeed ?? 0,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8WithChipRam("attackSpeed", Math.round(v), 20),
            label: "Atk Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 149,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.attackMax ?? 0,
            min: 0,
            max: 64,
            step: 1,
            onChange: (v) => updU8WithChipRam("attackMax", Math.round(v), 21),
            label: "Atk Max",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 153,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.decaySpeed ?? 0,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8WithChipRam("decaySpeed", Math.round(v), 22),
            label: "Dec Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 157,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.decayMin ?? 0,
            min: 0,
            max: 64,
            step: 1,
            onChange: (v) => updU8WithChipRam("decayMin", Math.round(v), 23),
            label: "Dec Min",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 161,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.sustain ?? 0,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8WithChipRam("sustain", Math.round(v), 24),
            label: "Sustain",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 165,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.releaseSpeed ?? 0,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8WithChipRam("releaseSpeed", Math.round(v), 26),
            label: "Rel Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 170,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.releaseMin ?? 0,
            min: 0,
            max: 64,
            step: 1,
            onChange: (v) => updU8WithChipRam("releaseMin", Math.round(v), 27),
            label: "Rel Min",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 174,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 148,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
      lineNumber: 134,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Phase Oscillator" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 183,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.phaseShift ?? 0,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8WithChipRam("phaseShift", Math.round(v), 28),
            label: "Phase Shift",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 185,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.phaseSpeed ?? 0,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8WithChipRam("phaseSpeed", Math.round(v), 29),
            label: "Phase Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 189,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Phase Shift 0 = disabled" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
          lineNumber: 193,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 184,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
      lineNumber: 182,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Tuning" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 199,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.finetune ?? 0,
            min: 0,
            max: 1005,
            step: 67,
            onChange: (v) => {
              const steps = Math.round(v / 67);
              const newVal = steps * 67;
              upd("finetune", newVal);
              if (uadeChipRam) {
                void getEditor().writeU8(uadeChipRam.instrBase + 30, steps & 255);
              }
            },
            label: "Finetune",
            color: knob,
            formatValue: (v) => `${Math.round(v / 67)}/15`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 201,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.pitchFall ?? 0,
            min: -128,
            max: 127,
            step: 1,
            onChange: (v) => {
              const val = Math.round(v);
              upd("pitchFall", val);
              if (uadeChipRam) {
                void getEditor().writeS8(uadeChipRam.instrBase + 31, val);
              }
            },
            label: "Pitch Fall",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 213,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 200,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
      lineNumber: 198,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
    lineNumber: 131,
    columnNumber: 5
  }, void 0);
  const arpChannels = reactExports.useMemo(() => {
    const arp = config.arpeggio ?? new Array(16).fill(0);
    const rows = arp.map((v) => ({ value: v }));
    return [{ label: "Arp", patternLength: arp.length, rows, isPatternChannel: false }];
  }, [config.arpeggio]);
  const arpCellChange = reactExports.useMemo(() => {
    return (_ch, row, _col, value) => {
      const arp = [...configRef.current.arpeggio ?? new Array(16).fill(0)];
      arp[row] = value & 255;
      upd("arpeggio", arp);
      if (uadeChipRam) {
        void getEditor().writeBlock(uadeChipRam.instrBase + 4, arp.slice(0, 16));
      }
    };
  }, [upd, uadeChipRam, getEditor]);
  const renderArpeggio = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3", style: { height: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg} flex flex-col`, style: { ...panelStyle, flex: 1, minHeight: 0 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Arpeggio (16 steps, unsigned byte)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
      lineNumber: 251,
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
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 253,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
      lineNumber: 252,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
    lineNumber: 250,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
    lineNumber: 249,
    columnNumber: 5
  }, void 0);
  const mainWaveChannels = reactExports.useMemo(() => {
    const wave = config.mainWave ?? new Array(32).fill(0);
    const rows = wave.map((v) => ({ value: v }));
    return [{ label: "Main", patternLength: wave.length, rows, isPatternChannel: false }];
  }, [config.mainWave]);
  const mainWaveCellChange = reactExports.useMemo(() => {
    return (_ch, row, _col, value) => {
      const wave = [...configRef.current.mainWave ?? new Array(32).fill(0)];
      wave[row] = value > 127 ? value - 256 : value;
      upd("mainWave", wave);
      if (uadeChipRam && uadeChipRam.sections.waveData) {
        void (async () => {
          const editor = getEditor();
          const waveIdx = await editor.readU32(uadeChipRam.instrBase);
          const addr = uadeChipRam.sections.waveData + waveIdx * 32;
          const bytes = wave.slice(0, 32).map((v) => (v ?? 0) + 256 & 255);
          void editor.writeBlock(addr, bytes);
        })();
      }
    };
  }, [upd, uadeChipRam, getEditor]);
  const phaseWaveChannels = reactExports.useMemo(() => {
    const wave = config.phaseWave ?? new Array(32).fill(0);
    const rows = wave.map((v) => ({ value: v }));
    return [{ label: "Phase", patternLength: wave.length, rows, isPatternChannel: false }];
  }, [config.phaseWave]);
  const phaseWaveCellChange = reactExports.useMemo(() => {
    return (_ch, row, _col, value) => {
      const wave = [...configRef.current.phaseWave ?? new Array(32).fill(0)];
      wave[row] = value > 127 ? value - 256 : value;
      upd("phaseWave", wave);
      if (uadeChipRam && uadeChipRam.sections.waveData) {
        const phaseIdx = configRef.current.phaseShift ?? 0;
        if (phaseIdx > 0) {
          const addr = uadeChipRam.sections.waveData + phaseIdx * 32;
          const bytes = wave.slice(0, 32).map((v) => (v ?? 0) + 256 & 255);
          void getEditor().writeBlock(addr, bytes);
        }
      }
    };
  }, [upd, uadeChipRam, getEditor]);
  const renderWaveform = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3", style: { height: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg} flex flex-col`, style: { ...panelStyle, flex: 1, minHeight: 0 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Main Wave (32 bytes, signed)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 319,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 120 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        PatternEditorCanvas,
        {
          formatColumns: WAVE_COLUMN,
          formatChannels: mainWaveChannels,
          formatCurrentRow: 0,
          formatIsPlaying: false,
          onFormatCellChange: mainWaveCellChange,
          hideVUMeters: true
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
          lineNumber: 321,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 320,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
      lineNumber: 318,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg} flex flex-col`, style: { ...panelStyle, flex: 1, minHeight: 0 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Phase Wave (32 bytes, signed)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 334,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 120 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        PatternEditorCanvas,
        {
          formatColumns: WAVE_COLUMN,
          formatChannels: phaseWaveChannels,
          formatCurrentRow: 0,
          formatIsPlaying: false,
          onFormatCellChange: phaseWaveCellChange,
          hideVUMeters: true
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
          lineNumber: 336,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 335,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
      lineNumber: 333,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
    lineNumber: 315,
    columnNumber: 5
  }, void 0);
  const TABS = [
    ["main", "Parameters"],
    ["arpeggio", "Arpeggio"],
    ["waveform", "Waveform"]
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dim }, children: TABS.map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(id),
        className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
        style: {
          color: activeTab === id ? accent : "#666",
          borderBottom: activeTab === id ? `2px solid ${accent}` : "2px solid transparent",
          background: activeTab === id ? isCyan ? "#041510" : "#000e1a" : "transparent"
        },
        children: label
      },
      id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 359,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
      lineNumber: 357,
      columnNumber: 7
    }, void 0),
    activeTab === "main" && renderMain(),
    activeTab === "arpeggio" && renderArpeggio(),
    activeTab === "waveform" && renderWaveform(),
    uadeChipRam && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "flex justify-end px-3 py-2 border-t border-opacity-30",
        style: { borderColor: dim },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            className: "text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100 transition-colors",
            style: { background: "rgba(60,40,100,0.4)", color: "#cc88ff" },
            onClick: () => void getEditor().exportModule(
              uadeChipRam.moduleBase,
              uadeChipRam.moduleSize,
              "song.sid1"
            ),
            children: "Export .sid1 (Amiga)"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
            lineNumber: 377,
            columnNumber: 11
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
        lineNumber: 375,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMon1Controls.tsx",
    lineNumber: 356,
    columnNumber: 5
  }, void 0);
};
export {
  SidMon1Controls
};
