import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { R as useTrackerStore, cD as SonicArrangerSynth, aA as UADEEngine, aB as Knob, W as CustomSelect, cB as PatternEditorCanvas } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { W as WaveformLineCanvas, B as BarChart } from "./BarChart-CuXp5QZ0.js";
import { S as SampleBrowserPane } from "./SampleBrowserPane-B7s228O0.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const SA_OFFSET = {
  volume: 16,
  // u16
  fineTuning: 18,
  // i16
  portamentoSpeed: 20,
  vibratoDelay: 22,
  vibratoSpeed: 24,
  vibratoLevel: 26,
  amfNumber: 28,
  amfDelay: 30,
  amfLength: 32,
  amfRepeat: 34,
  adsrNumber: 36,
  adsrDelay: 38,
  adsrLength: 40,
  adsrRepeat: 42,
  sustainPoint: 44,
  sustainDelay: 46,
  effectArg1: 64,
  effect: 66,
  effectArg2: 68,
  effectArg3: 70,
  effectDelay: 72
};
function signedHex2(val) {
  return (val & 255).toString(16).toUpperCase().padStart(2, "0");
}
function unsignedHex2(val) {
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
const ADSR_COLUMN = [
  {
    key: "value",
    label: "Vol",
    charWidth: 2,
    type: "hex",
    color: "#66ffaa",
    emptyColor: "#334455",
    emptyValue: void 0,
    hexDigits: 2,
    formatter: unsignedHex2
  }
];
const AMF_COLUMN = [
  {
    key: "value",
    label: "Pit",
    charWidth: 2,
    type: "hex",
    color: "#ff88cc",
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
  return { label, patternLength: 14, rows, isPatternChannel: false };
}
function tableToFormatChannel(data, label) {
  const len = Math.min(data.length, 128);
  const rows = Array.from({ length: len }, (_, i) => ({
    value: data[i] & 255
  }));
  return { label, patternLength: len, rows, isPatternChannel: false };
}
function makeArpCellChange(configRef, tableIdx, onChange, writeByte) {
  return (_channelIdx, rowIdx, _columnKey, value) => {
    const signed = value > 127 ? value - 256 : value;
    const arps = configRef.current.arpeggios.map((a, i) => {
      if (i !== tableIdx) return { ...a };
      const vals = [...a.values];
      vals[rowIdx] = signed;
      return { ...a, values: vals };
    });
    onChange({ ...configRef.current, arpeggios: arps });
    writeByte == null ? void 0 : writeByte(tableIdx, rowIdx, value & 255);
  };
}
function makeTableCellChange(configRef, tableKey, signed, onChange, writeByte) {
  return (_channelIdx, rowIdx, _columnKey, value) => {
    const realValue = signed ? value > 127 ? value - 256 : value : value;
    const table = [...configRef.current[tableKey]];
    table[rowIdx] = realValue;
    onChange({ ...configRef.current, [tableKey]: table });
    writeByte == null ? void 0 : writeByte(rowIdx, value & 255);
  };
}
const EFFECT_MODES = [
  { value: 0, name: "None" },
  { value: 1, name: "Wave Negator" },
  { value: 2, name: "Free Negator" },
  { value: 3, name: "Rotate Vertical" },
  { value: 4, name: "Rotate Horizontal" },
  { value: 5, name: "Alien Voice" },
  { value: 6, name: "Poly Negator" },
  { value: 7, name: "Shack Wave 1" },
  { value: 8, name: "Shack Wave 2" },
  { value: 9, name: "Metamorph" },
  { value: 10, name: "Laser" },
  { value: 11, name: "Wave Alias" },
  { value: 12, name: "Noise Generator 1" },
  { value: 13, name: "Low Pass Filter 1" },
  { value: 14, name: "Low Pass Filter 2" },
  { value: 15, name: "Oszilator" },
  { value: 16, name: "Noise Generator 2" },
  { value: 17, name: "FM Drum" }
];
function arg1Label(mode) {
  if (mode === 9 || mode === 15) return "Target Wave";
  if (mode === 3 || mode === 11) return "Delta";
  if (mode === 5 || mode === 7 || mode === 8) return "Source Wave";
  return "Arg 1";
}
function arg2Label(mode) {
  if (mode === 10 || mode === 17) return "Detune";
  return "Start Pos";
}
function arg3Label(mode) {
  if (mode === 10) return "Repeats";
  if (mode === 17) return "Threshold";
  return "Stop Pos";
}
const SonicArrangerControls = ({
  config,
  onChange,
  uadeChipRam,
  instrumentId
}) => {
  var _a, _b;
  const [activeTab, setActiveTab] = reactExports.useState("synthesis");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const findUsage = reactExports.useCallback(() => {
    if (instrumentId === void 0) return false;
    const store = useTrackerStore.getState();
    const patterns = store.patterns;
    const order = store.patternOrder;
    const usingPatternIdx = /* @__PURE__ */ new Set();
    for (let p = 0; p < patterns.length; p++) {
      const pat = patterns[p];
      if (!pat) continue;
      outer: for (const ch of pat.channels) {
        for (const row of ch.rows) {
          if (row && row.instrument === instrumentId) {
            usingPatternIdx.add(p);
            break outer;
          }
        }
      }
    }
    if (usingPatternIdx.size === 0) return false;
    for (let i = 0; i < order.length; i++) {
      if (usingPatternIdx.has(order[i])) {
        store.setCurrentPosition(i, false);
        return true;
      }
    }
    return false;
  }, [instrumentId]);
  const [previewNote, setPreviewNote] = reactExports.useState(48);
  const previewSynthRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    return () => {
      var _a2;
      (_a2 = previewSynthRef.current) == null ? void 0 : _a2.dispose();
      previewSynthRef.current = null;
    };
  }, []);
  const handlePreview = reactExports.useCallback(async () => {
    let synth = previewSynthRef.current;
    if (!synth) {
      synth = new SonicArrangerSynth();
      previewSynthRef.current = synth;
      synth.output.connect(synth.output.context.destination);
    }
    await synth.setInstrument(config);
    synth.triggerAttack(previewNote);
    setTimeout(() => synth.triggerRelease(), 800);
  }, [config, previewNote]);
  const chipEditorRef = reactExports.useRef(null);
  const getEditor = reactExports.useCallback(() => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#ff8844", { knob: "#ffaa66", dim: "#331a00" });
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
    if (typeof value === "number" && uadeChipRam && SA_OFFSET[key] !== void 0 && UADEEngine.hasInstance()) {
      const off = SA_OFFSET[key];
      const addr = uadeChipRam.instrBase + off;
      const numVal = value;
      const u = (numVal < 0 ? numVal + 65536 : numVal) & 65535;
      void getEditor().writeU16(addr, u).catch((err) => console.warn("SA chip RAM write failed:", err));
    }
  }, [onChange, uadeChipRam, getEditor]);
  const setAdsrByte = reactExports.useCallback((tableIdx, pos, value) => {
    if (!uadeChipRam || !UADEEngine.hasInstance()) return;
    const syarBase = uadeChipRam.sections.syarBase;
    if (syarBase === void 0) return;
    const addr = syarBase + tableIdx * 128 + pos;
    void getEditor().writeU8(addr, value & 255).catch((err) => console.warn("SA ADSR chip RAM write failed:", err));
  }, [uadeChipRam, getEditor]);
  const setAmfByte = reactExports.useCallback((tableIdx, pos, value) => {
    if (!uadeChipRam || !UADEEngine.hasInstance()) return;
    const syafBase = uadeChipRam.sections.syafBase;
    if (syafBase === void 0) return;
    const addr = syafBase + tableIdx * 128 + pos;
    void getEditor().writeU8(addr, value & 255).catch((err) => console.warn("SA AMF chip RAM write failed:", err));
  }, [uadeChipRam, getEditor]);
  const setArpByte = reactExports.useCallback((subTblIdx, pos, value) => {
    if (!uadeChipRam || !UADEEngine.hasInstance()) return;
    const addr = uadeChipRam.instrBase + 74 + subTblIdx * 16 + 2 + pos;
    void getEditor().writeU8(addr, value & 255).catch((err) => console.warn("SA arp chip RAM write failed:", err));
  }, [uadeChipRam, getEditor]);
  const setArpHeader = reactExports.useCallback((subTblIdx, field, value) => {
    if (!uadeChipRam || !UADEEngine.hasInstance()) return;
    const offset = field === "length" ? 0 : 1;
    const addr = uadeChipRam.instrBase + 74 + subTblIdx * 16 + offset;
    void getEditor().writeU8(addr, value & 255).catch((err) => console.warn("SA arp header chip RAM write failed:", err));
  }, [uadeChipRam, getEditor]);
  const adsrChannel = reactExports.useMemo(
    () => [tableToFormatChannel(config.adsrTable, "ADSR")],
    [config.adsrTable]
  );
  const adsrCellChange = reactExports.useMemo(
    () => makeTableCellChange(
      configRef,
      "adsrTable",
      false,
      onChange,
      (rowIdx, value) => setAdsrByte(configRef.current.adsrNumber, rowIdx, value)
    ),
    [onChange, setAdsrByte]
  );
  const amfChannel = reactExports.useMemo(
    () => [tableToFormatChannel(config.amfTable, "AMF")],
    [config.amfTable]
  );
  const amfCellChange = reactExports.useMemo(
    () => makeTableCellChange(
      configRef,
      "amfTable",
      true,
      onChange,
      (rowIdx, value) => setAmfByte(configRef.current.amfNumber, rowIdx, value)
    ),
    [onChange, setAmfByte]
  );
  const arpChannels = reactExports.useMemo(
    () => [0, 1, 2].map(
      (tIdx) => [arpToFormatChannel(config.arpeggios[tIdx], `Arp ${tIdx + 1}`)]
    ),
    [config.arpeggios]
  );
  const arpCellChanges = reactExports.useMemo(
    () => [0, 1, 2].map(
      (tIdx) => makeArpCellChange(configRef, tIdx, onChange, setArpByte)
    ),
    [onChange, setArpByte]
  );
  const numAdsrTables = ((_a = uadeChipRam == null ? void 0 : uadeChipRam.sections) == null ? void 0 : _a.numAdsrTables) ?? 16;
  const numAmfTables = ((_b = uadeChipRam == null ? void 0 : uadeChipRam.sections) == null ? void 0 : _b.numAmfTables) ?? 16;
  const numWaveforms = (config.allWaveforms ?? []).length;
  const renderSynthesis = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Instrument" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 402,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted w-12", children: "Name" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 404,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "text",
            value: config.name ?? "",
            onChange: (e) => updateParam("name", e.target.value),
            className: "flex-1 text-xs font-mono border rounded px-2 py-1",
            style: { background: "#0a0a0a", borderColor: dim, color: accent }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 405,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 403,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
      lineNumber: 401,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Synthesis Effect" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 415,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 flex-wrap", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.effectArg1,
            min: 0,
            max: 127,
            step: 1,
            onChange: (v) => updateParam("effectArg1", Math.round(v)),
            label: arg1Label(config.effect),
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 417,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.effectArg2,
            min: 0,
            max: 127,
            step: 1,
            onChange: (v) => updateParam("effectArg2", Math.round(v)),
            label: arg2Label(config.effect),
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 421,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.effectArg3,
            min: 0,
            max: 127,
            step: 1,
            onChange: (v) => updateParam("effectArg3", Math.round(v)),
            label: arg3Label(config.effect),
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 425,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.effectDelay,
            min: 1,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("effectDelay", Math.round(v)),
            label: "Effect Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 429,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 416,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: String(config.effect),
          onChange: (v) => updateParam("effect", parseInt(v)),
          options: EFFECT_MODES.map((m) => ({ value: String(m.value), label: `${m.value}: ${m.name}` })),
          className: "w-full text-xs font-mono border rounded px-2 py-1.5 mt-3",
          style: { background: "#0a0a0a", borderColor: dim, color: accent }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 434,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
      lineNumber: 414,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Waveform" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 443,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WaveformLineCanvas, { data: config.waveformData, width: 320, height: 72, color: accent, maxSamples: 128 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 444,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 mt-2 text-[10px] text-text-muted", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { children: "Wave #" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 447,
            columnNumber: 13
          }, void 0),
          numWaveforms > 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(config.waveformNumber),
              onChange: (v) => updateParam("waveformNumber", parseInt(v) || 0),
              options: Array.from({ length: numWaveforms }, (_, i) => ({ value: String(i), label: String(i) })),
              className: "text-[10px] font-mono border rounded px-1 py-0.5",
              style: { background: "#0a0a0a", borderColor: dim, color: accent }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
              lineNumber: 449,
              columnNumber: 15
            },
            void 0
          ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "number",
              min: 0,
              max: 255,
              value: config.waveformNumber,
              onChange: (e) => updateParam("waveformNumber", Math.max(0, Math.min(255, parseInt(e.target.value) || 0))),
              className: "w-14 text-[10px] font-mono border rounded px-1 py-0.5",
              style: { background: "#0a0a0a", borderColor: dim, color: accent }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
              lineNumber: 457,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 446,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { children: "Length" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 469,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "number",
              min: 0,
              max: 65535,
              value: config.waveformLength,
              onChange: (e) => updateParam("waveformLength", Math.max(0, Math.min(65535, parseInt(e.target.value) || 0))),
              className: "w-16 text-[10px] font-mono border rounded px-1 py-0.5",
              style: { background: "#0a0a0a", borderColor: dim, color: accent }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
              lineNumber: 470,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "words" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 479,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 468,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 445,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
      lineNumber: 442,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
    lineNumber: 400,
    columnNumber: 5
  }, void 0);
  const renderEnvelope = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume & Tuning" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 491,
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 493,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.fineTuning,
            min: -128,
            max: 127,
            step: 1,
            onChange: (v) => updateParam("fineTuning", Math.round(v)),
            label: "Fine Tune",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 497,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 492,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
      lineNumber: 490,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "ADSR Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 504,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BarChart, { data: config.adsrTable, width: 320, height: 56, color: accent }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 505,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mt-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted", children: "ADSR Table #" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 507,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(config.adsrNumber),
            onChange: (v) => updateParam("adsrNumber", parseInt(v) || 0),
            options: Array.from({ length: numAdsrTables }, (_, i) => ({ value: String(i), label: String(i) })),
            className: "text-[10px] font-mono border rounded px-1 py-0.5",
            style: { background: "#0a0a0a", borderColor: dim, color: accent }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 508,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted", children: [
          "(",
          numAdsrTables,
          " available)"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 515,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 506,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 flex-wrap mt-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.adsrDelay,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("adsrDelay", Math.round(v)),
            label: "Delay",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 518,
            columnNumber: 11
          },
          void 0
        ),
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 522,
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 526,
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 530,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.sustainDelay,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("sustainDelay", Math.round(v)),
            label: "Sus Delay",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 534,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 517,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 280, marginTop: 8 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        PatternEditorCanvas,
        {
          formatColumns: ADSR_COLUMN,
          formatChannels: adsrChannel,
          formatCurrentRow: 0,
          formatIsPlaying: false,
          onFormatCellChange: adsrCellChange,
          hideVUMeters: true
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 540,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 539,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
      lineNumber: 503,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "AMF (Pitch Modulation)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 551,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BarChart, { data: config.amfTable, width: 320, height: 56, color: accent, signed: true }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 552,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mt-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted", children: "AMF Table #" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 554,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(config.amfNumber),
            onChange: (v) => updateParam("amfNumber", parseInt(v) || 0),
            options: Array.from({ length: numAmfTables }, (_, i) => ({ value: String(i), label: String(i) })),
            className: "text-[10px] font-mono border rounded px-1 py-0.5",
            style: { background: "#0a0a0a", borderColor: dim, color: accent }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 555,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted", children: [
          "(",
          numAmfTables,
          " available)"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 562,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 553,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 mt-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.amfDelay,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateParam("amfDelay", Math.round(v)),
            label: "Delay",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 565,
            columnNumber: 11
          },
          void 0
        ),
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 569,
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 573,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 564,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 280, marginTop: 8 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        PatternEditorCanvas,
        {
          formatColumns: AMF_COLUMN,
          formatChannels: amfChannel,
          formatCurrentRow: 0,
          formatIsPlaying: false,
          onFormatCellChange: amfCellChange,
          hideVUMeters: true
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 579,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 578,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
      lineNumber: 550,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
    lineNumber: 489,
    columnNumber: 5
  }, void 0);
  const updateArpField = reactExports.useCallback(
    (index, field, value) => {
      const arps = configRef.current.arpeggios.map(
        (a, i) => i === index ? { ...a, [field]: value } : { ...a }
      );
      onChange({ ...configRef.current, arpeggios: arps });
      setArpHeader(index, field, value);
    },
    [onChange, setArpHeader]
  );
  const renderModulation = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 608,
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 610,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoSpeed,
            min: 0,
            max: 65535,
            step: 1,
            onChange: (v) => updateParam("vibratoSpeed", Math.round(v)),
            label: "Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 614,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoLevel,
            min: 0,
            max: 65535,
            step: 1,
            onChange: (v) => updateParam("vibratoLevel", Math.round(v)),
            label: "Level",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 618,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 609,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
      lineNumber: 607,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Portamento" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 625,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.portamentoSpeed,
            min: 0,
            max: 65535,
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 627,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "0 = disabled" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 631,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 626,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
      lineNumber: 624,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Arpeggio Tables" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 635,
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
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
              lineNumber: 642,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[9px] text-text-muted", children: "Len" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
                lineNumber: 644,
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
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
                  lineNumber: 645,
                  columnNumber: 21
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
              lineNumber: 643,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[9px] text-text-muted", children: "Rep" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
                lineNumber: 651,
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
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
                  lineNumber: 652,
                  columnNumber: 21
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
              lineNumber: 650,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 641,
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
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
              lineNumber: 659,
              columnNumber: 19
            },
            void 0
          ) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 658,
            columnNumber: 17
          }, void 0)
        ] }, tIdx, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 640,
          columnNumber: 15
        }, void 0);
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 636,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
      lineNumber: 634,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
    lineNumber: 606,
    columnNumber: 5
  }, void 0);
  const tabs = reactExports.useMemo(() => [
    ["synthesis", "Synthesis"],
    ["envelope", "Envelope"],
    ["modulation", "Modulation"]
  ], []);
  const [showSamplePane, setShowSamplePane] = reactExports.useState(false);
  function miniWave(data) {
    if (!data || data.length === 0) return "";
    const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
    const cells = 16;
    const out = [];
    const step = Math.max(1, Math.floor(data.length / cells));
    for (let i = 0; i < cells; i++) {
      const start = i * step;
      const end = Math.min(data.length, start + step);
      let sum = 0;
      for (let j = start; j < end; j++) {
        const v = data[j];
        const s = v > 127 ? v - 256 : v;
        sum += Math.abs(s);
      }
      const avg = sum / Math.max(1, end - start);
      const idx = Math.min(7, Math.floor(avg / 128 * 8));
      out.push(bars[idx]);
    }
    return out.join("");
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dim }, children: [
      tabs.map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
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
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 718,
          columnNumber: 11
        },
        void 0
      )),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "ml-auto mr-2 my-1 flex items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "number",
            min: 0,
            max: 95,
            value: previewNote,
            onChange: (e) => setPreviewNote(Math.max(0, Math.min(95, parseInt(e.target.value) || 0))),
            title: "MIDI note (0-95) for preview audition",
            style: {
              width: "40px",
              fontSize: "10px",
              padding: "3px 4px",
              background: "var(--color-bg)",
              color: "#c084fc",
              border: "1px solid #c084fc",
              borderRadius: "3px",
              fontFamily: "inherit",
              textAlign: "center"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 730,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => void handlePreview(),
            title: "Play a preview note using this instrument",
            style: {
              fontSize: "10px",
              padding: "4px 8px",
              cursor: "pointer",
              background: "rgba(192,132,252,0.15)",
              color: "#c084fc",
              border: "1px solid #c084fc",
              borderRadius: "3px",
              fontFamily: "inherit",
              whiteSpace: "nowrap"
            },
            children: "♪ Preview"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 744,
            columnNumber: 11
          },
          void 0
        ),
        instrumentId !== void 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              const ok = findUsage();
              if (!ok) console.warn("[SonicArranger] instrument is unused — nothing to seek to");
            },
            title: "Find a song position where this instrument is used and seek the player there",
            className: "px-2 py-0.5 rounded text-[10px] font-mono bg-dark-bg text-accent-primary border border-dark-border hover:border-accent-primary/60 transition-colors",
            children: "▶ Find Usage"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 757,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setShowSamplePane((v) => !v),
            title: `${showSamplePane ? "Hide" : "Show"} sample browser`,
            className: `px-2 py-0.5 rounded text-[10px] font-mono border ${showSamplePane ? "bg-accent-primary/20 text-accent-primary border-accent-primary/60" : "bg-dark-bg text-text-secondary border-dark-border hover:text-accent-primary hover:border-accent-primary/50"}`,
            children: "SMP"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
            lineNumber: 768,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 729,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
      lineNumber: 716,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 min-h-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0 overflow-y-auto", children: [
        activeTab === "synthesis" && renderSynthesis(),
        activeTab === "envelope" && renderEnvelope(),
        activeTab === "modulation" && renderModulation()
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
        lineNumber: 782,
        columnNumber: 9
      }, void 0),
      showSamplePane && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        SampleBrowserPane,
        {
          headerLabel: "WAVEFORMS",
          entries: (config.allWaveforms ?? []).map((wf, i) => ({
            id: i,
            name: `${String(i).padStart(2, "0")}. wave${i}`,
            sizeBytes: wf.length,
            isCurrent: i === config.waveformNumber
          })),
          onEntryClick: (entry) => updateParam("waveformNumber", entry.id),
          emptyMessage: "No waveform bank on this instrument.",
          renderEntry: (entry) => {
            const wf = (config.allWaveforms ?? [])[entry.id];
            const isCurrent = entry.id === config.waveformNumber;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `font-mono ${isCurrent ? "text-accent-primary" : "text-text-primary"}`, children: [
                String(entry.id).padStart(2, "0"),
                ". wave",
                entry.id
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
                lineNumber: 803,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted mt-0.5", children: [
                (wf == null ? void 0 : wf.length) ?? 0,
                " bytes"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
                lineNumber: 806,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-0.5 font-mono text-accent-highlight text-[10px] leading-none tracking-tight", children: wf ? miniWave(wf) : "" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
                lineNumber: 809,
                columnNumber: 19
              }, void 0),
              isCurrent && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-0.5 text-[9px] text-accent-primary", children: "(this instrument)" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
                lineNumber: 813,
                columnNumber: 21
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
              lineNumber: 802,
              columnNumber: 17
            }, void 0);
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
          lineNumber: 788,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
      lineNumber: 781,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SonicArrangerControls.tsx",
    lineNumber: 715,
    columnNumber: 5
  }, void 0);
};
export {
  SonicArrangerControls
};
