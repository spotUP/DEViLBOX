import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aA as UADEEngine, e as useInstrumentStore, W as CustomSelect, aB as Knob, cB as PatternEditorCanvas } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { S as SampleBrowserPane } from "./SampleBrowserPane-B7s228O0.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import { a as encodeFCVolEnvelope, b as encodeFCFreqMacro } from "./chipRamEncoders-CC3pCIsG.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
function hex1(val) {
  return (val & 15).toString(16).toUpperCase();
}
function hex2signed(val) {
  const byte = val < 0 ? val + 256 & 255 : val & 255;
  return byte.toString(16).toUpperCase().padStart(2, "0");
}
function hex2(val) {
  return (val & 255).toString(16).toUpperCase().padStart(2, "0");
}
const FC_SYNTH_MACRO_COLUMNS = [
  {
    key: "waveNum",
    label: "Wav",
    charWidth: 1,
    type: "hex",
    color: "#66ccff",
    // Light blue — waveform
    emptyColor: "#334455",
    emptyValue: 0,
    hexDigits: 1,
    formatter: hex1
  },
  {
    key: "transposition",
    label: "Trn",
    charWidth: 2,
    type: "hex",
    color: "#ffcc44",
    // Yellow — transposition
    emptyColor: "#334455",
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2signed
  },
  {
    key: "effect",
    label: "FX",
    charWidth: 2,
    type: "hex",
    color: "#ff8844",
    // Orange — effect
    emptyColor: "#334455",
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2
  }
];
function fcSynthMacroToFormatChannel(config) {
  const rows = config.synthTable.map((step) => ({
    waveNum: step.waveNum,
    transposition: step.transposition < 0 ? step.transposition + 256 & 255 : step.transposition & 255,
    effect: step.effect
  }));
  return [{
    label: "Synth Macro",
    patternLength: config.synthTable.length,
    rows,
    isPatternChannel: false
  }];
}
function makeSynthMacroCellChange(config, onChange) {
  return (_channelIdx, rowIdx, columnKey, value) => {
    const table = [...config.synthTable];
    const step = { ...table[rowIdx] };
    switch (columnKey) {
      case "waveNum":
        step.waveNum = value & 15;
        break;
      case "transposition": {
        const signed = value > 127 ? value - 256 : value;
        step.transposition = Math.max(-64, Math.min(63, signed));
        break;
      }
      case "effect":
        step.effect = value & 255;
        break;
    }
    table[rowIdx] = step;
    onChange({ synthTable: table });
  };
}
const FC_ARPEGGIO_COLUMNS = [
  {
    key: "semitone",
    label: "Semi",
    charWidth: 2,
    type: "hex",
    color: "#88ff88",
    // Green — semitone offset
    emptyColor: "#334455",
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2signed
  }
];
function fcArpeggioToFormatChannel(config) {
  const rows = config.arpTable.map((v) => ({
    semitone: v < 0 ? v + 256 & 255 : v & 255
  }));
  return [{
    label: "Arpeggio",
    patternLength: config.arpTable.length,
    rows,
    isPatternChannel: false
  }];
}
function makeArpeggioCellChange(config, onChange) {
  return (_channelIdx, rowIdx, _columnKey, value) => {
    const arr = [...config.arpTable];
    const signed = value > 127 ? value - 256 : value;
    arr[rowIdx] = Math.max(-64, Math.min(63, signed));
    onChange({ arpTable: arr });
  };
}
const FC_WAVE_NAMES = {
  0: "Sawtooth",
  1: "Square",
  2: "Triangle",
  3: "Noise",
  4: "Saw+Sq",
  5: "Saw+Tri",
  6: "Sq+Tri",
  7: "Pulse 1",
  8: "Pulse 2",
  9: "Pulse 3",
  10: "Pulse 4",
  11: "Pulse 5"
};
function waveLabel(n) {
  return FC_WAVE_NAMES[n] ?? `Wave ${n}`;
}
const FCControls = ({ config, onChange, uadeChipRam }) => {
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
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#ffdd44", { knob: "#ffee77", dim: "#332a00" });
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
  }, [onChange]);
  const updWithChipRam = reactExports.useCallback(
    (key, value, byteOffset) => {
      upd(key, value);
      if (uadeChipRam && typeof value === "number" && UADEEngine.hasInstance()) {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 255).catch((err) => console.warn("FC chip RAM write failed:", err));
      }
    },
    [upd, uadeChipRam, getEditor]
  );
  const updADSRWithChipRam = reactExports.useCallback(
    (key, value) => {
      upd(key, value);
      if (uadeChipRam && UADEEngine.hasInstance()) {
        const newCfg = { ...configRef.current, [key]: value };
        const opcodes = encodeFCVolEnvelope(newCfg);
        const fullBuf = new Array(59).fill(225);
        for (let i = 0; i < opcodes.length; i++) fullBuf[i] = opcodes[i];
        void getEditor().writeBlock(uadeChipRam.instrBase + 5, fullBuf).catch((err) => console.warn("FC chip RAM write failed:", err));
      }
    },
    [upd, uadeChipRam, getEditor]
  );
  const writeFreqMacroToChipRam = reactExports.useCallback(
    (newCfg) => {
      if (!uadeChipRam || !uadeChipRam.sections.freqMacros) return;
      if (!UADEEngine.hasInstance()) return;
      void (async () => {
        try {
          const editor = getEditor();
          const freqMacroIdxBytes = await editor.readBytes(uadeChipRam.instrBase + 1, 1);
          const freqMacroIdx = freqMacroIdxBytes[0];
          const freqMacroAddr = uadeChipRam.sections.freqMacros + freqMacroIdx * 64;
          const encoded = encodeFCFreqMacro(newCfg.synthTable, newCfg.arpTable);
          void editor.writeBlock(freqMacroAddr, Array.from(encoded));
        } catch {
        }
      })();
    },
    [uadeChipRam, getEditor]
  );
  const renderEnvelope = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Base Waveform" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 161,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(config.waveNumber),
            onChange: (v) => upd("waveNumber", parseInt(v)),
            options: Array.from({ length: 47 }, (_, i) => ({ value: String(i), label: `${i}: ${waveLabel(i)}` })),
            className: "text-xs font-mono border rounded px-2 py-1.5",
            style: { background: "#100d00", borderColor: dim, color: accent }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
            lineNumber: 163,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Initial waveform (overridden by synth macro)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 170,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 162,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 160,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 176,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        EnvelopeVisualization,
        {
          mode: "steps",
          attackVol: config.atkVolume,
          attackSpeed: config.atkLength,
          decayVol: config.decVolume,
          decaySpeed: config.decLength,
          sustainVol: config.sustVolume,
          sustainLen: 32,
          releaseVol: 0,
          releaseSpeed: config.relLength,
          maxVol: 64,
          color: knob,
          width: 300,
          height: 56
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 178,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 177,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.atkLength,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updADSRWithChipRam("atkLength", Math.round(v)),
              label: "Atk Len",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
              lineNumber: 191,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.atkVolume,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => updADSRWithChipRam("atkVolume", Math.round(v)),
              label: "Atk Vol",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
              lineNumber: 195,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 190,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.decLength,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updADSRWithChipRam("decLength", Math.round(v)),
              label: "Dec Len",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
              lineNumber: 201,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.decVolume,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => updADSRWithChipRam("decVolume", Math.round(v)),
              label: "Dec Vol",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
              lineNumber: 205,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 200,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.relLength,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updADSRWithChipRam("relLength", Math.round(v)),
              label: "Rel Len",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
              lineNumber: 211,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.sustVolume,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => updADSRWithChipRam("sustVolume", Math.round(v)),
              label: "Sus Vol",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
              lineNumber: 215,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 210,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 189,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 175,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 225,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibDelay,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updWithChipRam("vibDelay", Math.round(v), 4),
            label: "Delay",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
            lineNumber: 227,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibSpeed,
            min: 0,
            max: 63,
            step: 1,
            onChange: (v) => updWithChipRam("vibSpeed", Math.round(v), 2),
            label: "Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
            lineNumber: 231,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibDepth,
            min: 0,
            max: 63,
            step: 1,
            onChange: (v) => updWithChipRam("vibDepth", Math.round(v), 3),
            label: "Depth",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
            lineNumber: 235,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 226,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 224,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
    lineNumber: 158,
    columnNumber: 5
  }, void 0);
  const synthMacroChannels = reactExports.useMemo(
    () => fcSynthMacroToFormatChannel(config),
    [config]
  );
  const synthMacroCellChange = reactExports.useMemo(
    () => {
      const baseCellChange = makeSynthMacroCellChange(config, (updates) => {
        onChange(updates);
        if (updates.synthTable) {
          writeFreqMacroToChipRam({ ...configRef.current, ...updates });
        }
      });
      return baseCellChange;
    },
    [config, onChange, writeFreqMacroToChipRam]
  );
  const renderSynth = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Synth Macro Sequencer" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 265,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 mb-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.synthSpeed,
          min: 0,
          max: 15,
          step: 1,
          onChange: (v) => updWithChipRam("synthSpeed", Math.round(v), 0),
          label: "Speed",
          color: knob,
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 267,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Ticks per macro step (0 = disabled)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 271,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 266,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 200 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      PatternEditorCanvas,
      {
        formatColumns: FC_SYNTH_MACRO_COLUMNS,
        formatChannels: synthMacroChannels,
        formatCurrentRow: 0,
        formatIsPlaying: false,
        onFormatCellChange: synthMacroCellChange,
        hideVUMeters: true
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 276,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 275,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
    lineNumber: 264,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
    lineNumber: 263,
    columnNumber: 5
  }, void 0);
  const arpeggioChannels = reactExports.useMemo(
    () => fcArpeggioToFormatChannel(config),
    [config]
  );
  const arpeggioCellChange = reactExports.useMemo(
    () => {
      const baseCellChange = makeArpeggioCellChange(config, (updates) => {
        onChange(updates);
        if (updates.arpTable) {
          writeFreqMacroToChipRam({ ...configRef.current, ...updates });
        }
      });
      return baseCellChange;
    },
    [config, onChange, writeFreqMacroToChipRam]
  );
  const renderArpeggio = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Arpeggio Table (semitone offsets)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 310,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 200 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      PatternEditorCanvas,
      {
        formatColumns: FC_ARPEGGIO_COLUMNS,
        formatChannels: arpeggioChannels,
        formatCurrentRow: 0,
        formatIsPlaying: false,
        onFormatCellChange: arpeggioCellChange,
        hideVUMeters: true
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 312,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 311,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
    lineNumber: 309,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
    lineNumber: 308,
    columnNumber: 5
  }, void 0);
  const TABS = [
    { id: "envelope", label: "Envelope" },
    { id: "synth", label: "Synth Macro" },
    { id: "arpeggio", label: "Arpeggio" },
    { id: "rawvol", label: "Raw Vol Macro" }
  ];
  const [rawVolExpanded, setRawVolExpanded] = reactExports.useState(false);
  const effectiveVolBytes = reactExports.useMemo(() => {
    if (config.volMacroData && config.volMacroData.length > 0) {
      const out2 = new Array(59).fill(225);
      for (let i = 0; i < Math.min(59, config.volMacroData.length); i++) {
        out2[i] = config.volMacroData[i] & 255;
      }
      return out2;
    }
    const encoded = encodeFCVolEnvelope(config);
    const out = new Array(59).fill(225);
    for (let i = 0; i < Math.min(59, encoded.length); i++) out[i] = encoded[i];
    return out;
  }, [config]);
  const annotateByte = reactExports.useCallback((bytes, i) => {
    const b = bytes[i];
    if (b === 225) return "END";
    if (b === 224) {
      const dest = bytes[i + 1];
      return `LOOP→${dest ?? "?"}`;
    }
    if (b === 232) {
      const n = bytes[i + 1];
      return `SUS ${n ?? "?"}`;
    }
    if (b === 234) {
      const s = bytes[i + 1];
      const t = bytes[i + 2];
      return `SLD ${s ?? "?"},${t ?? "?"}`;
    }
    if (i > 0) {
      const prev = bytes[i - 1];
      if (prev === 224) return "(dest)";
      if (prev === 232) return "(count)";
      if (prev === 234) return "(speed)";
    }
    if (i > 1 && bytes[i - 2] === 234) return "(target)";
    if (b <= 64) return `vol ${b}`;
    return `0x${b.toString(16).toUpperCase()}`;
  }, []);
  const updateRawVolByte = reactExports.useCallback(
    (index, newVal) => {
      const clamped = newVal & 255;
      const current = configRef.current.volMacroData ? [...configRef.current.volMacroData] : [...effectiveVolBytes];
      while (current.length < 59) current.push(225);
      current[index] = clamped;
      onChange({ volMacroData: current });
      if (uadeChipRam && UADEEngine.hasInstance()) {
        void getEditor().writeU8(uadeChipRam.instrBase + 5 + index, clamped).catch((err) => console.warn("FC raw vol byte write failed:", err));
      }
    },
    [effectiveVolBytes, onChange, uadeChipRam, getEditor]
  );
  const updateVolMacroSpeed = reactExports.useCallback(
    (value) => {
      const clamped = Math.max(0, Math.min(15, Math.round(value)));
      onChange({ volMacroSpeed: clamped });
      if (uadeChipRam && UADEEngine.hasInstance()) {
        void getEditor().writeU8(uadeChipRam.instrBase + 0, clamped & 255).catch((err) => console.warn("FC volMacroSpeed write failed:", err));
      }
    },
    [onChange, uadeChipRam, getEditor]
  );
  const reencodeFromADSR = reactExports.useCallback(() => {
    const encoded = encodeFCVolEnvelope(configRef.current);
    const out = new Array(59).fill(225);
    for (let i = 0; i < Math.min(59, encoded.length); i++) out[i] = encoded[i];
    onChange({ volMacroData: out });
    if (uadeChipRam && UADEEngine.hasInstance()) {
      void getEditor().writeBlock(uadeChipRam.instrBase + 5, out).catch((err) => console.warn("FC re-encode chip RAM write failed:", err));
    }
  }, [onChange, uadeChipRam, getEditor]);
  const renderRawVol = () => {
    const currentSpeed = config.volMacroSpeed ?? config.synthSpeed ?? 0;
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vol Macro Speed" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 435,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: currentSpeed,
              min: 0,
              max: 15,
              step: 1,
              onChange: (v) => updateVolMacroSpeed(v),
              label: "Speed",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
              lineNumber: 437,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Ticks per vol macro step (byte[0] of vol macro — aliases synthSpeed)." }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
            lineNumber: 447,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 436,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 434,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            type: "button",
            onClick: () => setRawVolExpanded((v) => !v),
            className: "w-full flex items-center justify-between px-3 py-2 text-left",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: `Raw Vol Macro Bytes (59) ${rawVolExpanded ? "▾" : "▸"}` }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                lineNumber: 459,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: config.volMacroData ? "custom" : "derived from ADSR" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                lineNumber: 460,
                columnNumber: 13
              }, void 0)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
            lineNumber: 454,
            columnNumber: 11
          },
          void 0
        ),
        rawVolExpanded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-3 pb-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                type: "button",
                onClick: reencodeFromADSR,
                className: "text-[10px] px-2 py-1 rounded bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60 transition-colors border border-yellow-900/60",
                children: "Re-encode from ADSR"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                lineNumber: 467,
                columnNumber: 17
              },
              void 0
            ),
            config.volMacroData && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                type: "button",
                onClick: () => onChange({ volMacroData: void 0 }),
                className: "text-[10px] px-2 py-1 rounded bg-dark-bg text-text-secondary hover:text-accent-primary border border-dark-border",
                children: "Clear override (use ADSR)"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                lineNumber: 475,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted ml-auto", children: "0xE0=LOOP · 0xE1=END · 0xE8=SUS · 0xEA=SLD · 0..64=vol" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
              lineNumber: 483,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
            lineNumber: 466,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "grid gap-1 font-mono text-[9px]",
              style: { gridTemplateColumns: "repeat(12, minmax(0, 1fr))" },
              children: effectiveVolBytes.map((b, i) => {
                const ann = annotateByte(effectiveVolBytes, i);
                const isOpcode = b >= 224;
                return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "div",
                  {
                    className: "flex flex-col items-center border rounded px-0.5 py-0.5",
                    style: {
                      borderColor: dim,
                      background: isOpcode ? "#221100" : "#100d00"
                    },
                    title: `byte[${i}] = 0x${b.toString(16).padStart(2, "0").toUpperCase()} (${b}) — ${ann}`,
                    children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] text-text-muted", children: i }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                        lineNumber: 504,
                        columnNumber: 23
                      }, void 0),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                        "input",
                        {
                          type: "text",
                          value: b.toString(16).padStart(2, "0").toUpperCase(),
                          onChange: (e) => {
                            const parsed = parseInt(e.target.value, 16);
                            if (!isNaN(parsed)) updateRawVolByte(i, parsed);
                          },
                          className: "w-full text-center bg-transparent border-0 outline-none p-0",
                          style: { color: isOpcode ? "#ffaa44" : accent },
                          maxLength: 2
                        },
                        void 0,
                        false,
                        {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                          lineNumber: 505,
                          columnNumber: 23
                        },
                        void 0
                      ),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                        "span",
                        {
                          className: "text-[8px] truncate w-full text-center",
                          style: { color: isOpcode ? "#ffaa44" : "#776633" },
                          children: ann
                        },
                        void 0,
                        false,
                        {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                          lineNumber: 516,
                          columnNumber: 23
                        },
                        void 0
                      )
                    ]
                  },
                  i,
                  true,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                    lineNumber: 495,
                    columnNumber: 21
                  },
                  void 0
                );
              })
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
              lineNumber: 487,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 465,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 453,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 433,
      columnNumber: 7
    }, void 0);
  };
  const [showSamplePane, setShowSamplePane] = reactExports.useState(false);
  const allInstruments = useInstrumentStore((s) => s.instruments);
  const sampleRows = reactExports.useMemo(() => {
    return allInstruments.filter((inst) => inst.synthType === "FCSynth" && inst.fc).map((inst) => {
      var _a;
      const c = inst.fc;
      return {
        id: inst.id,
        instrName: inst.name || `#${inst.id}`,
        waveNumber: c.waveNumber,
        waveSize: ((_a = c.wavePCM) == null ? void 0 : _a.length) ?? 0,
        isCurrent: c === config
      };
    });
  }, [allInstruments, config]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dim }, children: [
      TABS.map(({ id, label }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab(id),
          className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
          style: {
            color: activeTab === id ? accent : "#666",
            borderBottom: activeTab === id ? `2px solid ${accent}` : "2px solid transparent",
            background: activeTab === id ? isCyan ? "#041510" : "#1a1500" : "transparent"
          },
          children: label
        },
        id,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 561,
          columnNumber: 11
        },
        void 0
      )),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setShowSamplePane((v) => !v),
          title: `${showSamplePane ? "Hide" : "Show"} sample browser`,
          className: `ml-auto mr-2 my-1 px-2 py-0.5 rounded text-[10px] font-mono border ${showSamplePane ? "bg-accent-primary/20 text-accent-primary border-accent-primary/60" : "bg-dark-bg text-text-secondary border-dark-border hover:text-accent-primary hover:border-accent-primary/50"}`,
          children: "SMP"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 572,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 559,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 min-h-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0 overflow-y-auto", children: [
        activeTab === "envelope" && renderEnvelope(),
        activeTab === "synth" && renderSynth(),
        activeTab === "arpeggio" && renderArpeggio(),
        activeTab === "rawvol" && renderRawVol()
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 585,
        columnNumber: 9
      }, void 0),
      showSamplePane && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        SampleBrowserPane,
        {
          entries: sampleRows.map((s) => ({
            id: s.id,
            name: `${String(s.id).padStart(2, "0")}. ${s.instrName}`,
            isCurrent: s.isCurrent
          })),
          emptyMessage: "No Future Composer instruments loaded.",
          renderEntry: (entry) => {
            const s = sampleRows.find((r) => r.id === entry.id);
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `font-mono truncate ${s.isCurrent ? "text-accent-primary" : "text-text-primary"}`, children: [
                String(s.id).padStart(2, "0"),
                ". ",
                s.instrName
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                lineNumber: 603,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted mt-0.5", children: [
                "wave #",
                s.waveNumber,
                s.waveSize > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-1", children: [
                  "· ",
                  s.waveSize,
                  "B"
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                  lineNumber: 608,
                  columnNumber: 40
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                lineNumber: 606,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-0.5 text-[9px]", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: s.waveNumber < 10 ? "text-accent-secondary" : "text-accent-highlight", children: s.waveNumber < 10 ? "PCM SLOT" : "SYNTH WAVE" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                  lineNumber: 611,
                  columnNumber: 21
                }, void 0),
                s.isCurrent && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-1 text-accent-primary", children: "(this instrument)" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                  lineNumber: 614,
                  columnNumber: 37
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
                lineNumber: 610,
                columnNumber: 19
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
              lineNumber: 602,
              columnNumber: 17
            }, void 0);
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
          lineNumber: 592,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 584,
      columnNumber: 7
    }, void 0),
    uadeChipRam && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-end px-3 py-2 border-t border-yellow-900/30", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        className: "text-[10px] px-2 py-1 rounded bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60 transition-colors",
        onClick: () => void getEditor().exportModule(
          uadeChipRam.moduleBase,
          uadeChipRam.moduleSize,
          "song.fc"
        ),
        children: "Export .fc (Amiga)"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
        lineNumber: 624,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
      lineNumber: 623,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FCControls.tsx",
    lineNumber: 558,
    columnNumber: 5
  }, void 0);
};
export {
  FCControls
};
