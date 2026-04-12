import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, D as Download } from "./vendor-ui-AJ7AT9BN.js";
import { aA as UADEEngine, aB as Knob, cB as PatternEditorCanvas } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { W as WaveformThumbnail } from "./WaveformThumbnail-CebZPsAz.js";
import { F as FilterFrequencyResponse } from "./FilterFrequencyResponse-BHF9gTID.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
const WAVEFORMS = [
  { name: "Triangle", type: "triangle" },
  { name: "Sawtooth", type: "saw" },
  { name: "Pulse", type: "square" },
  { name: "Noise", type: "noise" }
];
const FILTER_MODE_NAMES = ["LP", "HP", "BP"];
const FILTER_MODE_TYPES = ["lowpass", "highpass", "bandpass"];
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
    color: "#ff66aa",
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
const SidMonControls = ({
  config,
  onChange,
  arpPlaybackPosition,
  uadeChipRam
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("main");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const chipEditorRef = reactExports.useRef(null);
  const getEditor = reactExports.useCallback(() => {
    if (!uadeChipRam) return null;
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, [uadeChipRam]);
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#ff66aa", { knob: "#ff88bb", dim: "#330022" });
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
  }, [onChange]);
  const updWithChipRam = reactExports.useCallback((key, value, chipWriter) => {
    onChange({ [key]: value });
    const editor = getEditor();
    if (editor && uadeChipRam && chipWriter) {
      chipWriter(editor, uadeChipRam.instrBase).catch(console.error);
    }
  }, [onChange, getEditor, uadeChipRam]);
  const renderMain = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Waveform" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 165,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 mb-3", children: WAVEFORMS.map((wf, i) => {
        const active = config.waveform === i;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => upd("waveform", i),
            className: "flex flex-col items-center gap-0.5 px-1 py-1.5 rounded transition-colors",
            style: {
              background: active ? accent + "28" : "#0a0012",
              border: `1px solid ${active ? accent : "#2a002a"}`
            },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WaveformThumbnail, { type: wf.type, width: 56, height: 22, color: active ? accent : "#555", style: "line" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
                lineNumber: 177,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono leading-tight", style: { color: active ? accent : "#555" }, children: wf.name }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
                lineNumber: 178,
                columnNumber: 17
              }, void 0)
            ]
          },
          i,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 170,
            columnNumber: 15
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 166,
        columnNumber: 9
      }, void 0),
      config.waveform === 2 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.pulseWidth,
          min: 0,
          max: 255,
          step: 1,
          onChange: (v) => upd("pulseWidth", Math.round(v)),
          label: "Pulse Width",
          color: knob,
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
          lineNumber: 187,
          columnNumber: 13
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 186,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 164,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "ADSR (SID format, 0-15)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 194,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.attack,
            min: 0,
            max: 15,
            step: 1,
            onChange: (v) => {
              const sid = Math.round(v);
              const raw = Math.round((15 - sid) * 256 / 16);
              updWithChipRam("attack", sid, async (ed, base) => {
                await ed.writeU8(base + 17, raw);
              });
            },
            label: "Attack",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 196,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.decay,
            min: 0,
            max: 15,
            step: 1,
            onChange: (v) => {
              const sid = Math.round(v);
              const raw = Math.round((15 - sid) * 256 / 16);
              updWithChipRam("decay", sid, async (ed, base) => {
                await ed.writeU8(base + 19, raw);
              });
            },
            label: "Decay",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 203,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.sustain,
            min: 0,
            max: 15,
            step: 1,
            onChange: (v) => {
              const sid = Math.round(v);
              const raw = Math.round(sid * 255 / 15);
              updWithChipRam("sustain", sid, async (ed, base) => {
                await ed.writeU8(base + 18, raw);
              });
            },
            label: "Sustain",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 210,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.release,
            min: 0,
            max: 15,
            step: 1,
            onChange: (v) => {
              const sid = Math.round(v);
              const raw = Math.round((15 - sid) * 256 / 16);
              updWithChipRam("release", sid, async (ed, base) => {
                await ed.writeU8(base + 22, raw);
              });
            },
            label: "Release",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 217,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 195,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EnvelopeVisualization, { mode: "adsr", ar: config.attack, dr: config.decay, rr: config.release, sl: config.sustain, tl: 0, maxRate: 15, maxTl: 1, width: 320, height: 64, color: accent }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 226,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 225,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 193,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 230,
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
            onChange: (v) => updWithChipRam("vibDelay", Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 11, Math.round(v));
            }),
            label: "Delay",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 232,
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
            onChange: (v) => updWithChipRam("vibSpeed", Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 10, Math.round(v));
            }),
            label: "Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 235,
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
            onChange: (v) => updWithChipRam("vibDepth", Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 9, Math.round(v));
            }),
            label: "Depth",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 238,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 231,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 229,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
    lineNumber: 163,
    columnNumber: 5
  }, void 0);
  const renderFilter = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Filter Mode" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 250,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 mb-2", children: FILTER_MODE_NAMES.map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => upd("filterMode", i),
        className: "flex-1 py-1.5 text-xs font-mono rounded transition-colors",
        style: {
          background: config.filterMode === i ? accent : "#111",
          color: config.filterMode === i ? "#000" : "#666",
          border: `1px solid ${config.filterMode === i ? accent : "var(--color-border-light)"}`
        },
        children: name
      },
      i,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 253,
        columnNumber: 13
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 251,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.filterCutoff,
          min: 0,
          max: 255,
          step: 1,
          onChange: (v) => upd("filterCutoff", Math.round(v)),
          label: "Cutoff",
          color: knob,
          size: "md",
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
          lineNumber: 266,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.filterResonance,
          min: 0,
          max: 15,
          step: 1,
          onChange: (v) => upd("filterResonance", Math.round(v)),
          label: "Resonance",
          color: knob,
          size: "md",
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
          lineNumber: 269,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 265,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FilterFrequencyResponse, { filterType: FILTER_MODE_TYPES[config.filterMode] ?? "lowpass", cutoff: config.filterCutoff / 255, resonance: config.filterResonance / 15, poles: 2, color: accent, width: 320, height: 64 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 274,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 273,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
    lineNumber: 249,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
    lineNumber: 248,
    columnNumber: 5
  }, void 0);
  const arpChannels = reactExports.useMemo(() => arpToFormatChannel(config.arpTable), [config.arpTable]);
  const arpCellChange = reactExports.useMemo(
    () => makeArpCellChange(config.arpTable, (d) => upd("arpTable", d)),
    [config.arpTable, upd]
  );
  const renderArpeggio = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3", style: { height: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg} flex flex-col`, style: { ...panelStyle, flex: 1, minHeight: 0 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Arpeggio Speed" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 291,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.arpSpeed,
          min: 0,
          max: 15,
          step: 1,
          onChange: (v) => updWithChipRam("arpSpeed", Math.round(v), async (ed, base) => {
            await ed.writeU8(base + 6, Math.round(v) * 16);
          }),
          label: "Speed",
          color: knob,
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
          lineNumber: 292,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 290,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 120 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      PatternEditorCanvas,
      {
        formatColumns: ARP_COLUMN,
        formatChannels: arpChannels,
        formatCurrentRow: arpPlaybackPosition ?? 0,
        formatIsPlaying: arpPlaybackPosition !== void 0,
        onFormatCellChange: arpCellChange,
        hideVUMeters: true
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 299,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 298,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
    lineNumber: 289,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
    lineNumber: 288,
    columnNumber: 5
  }, void 0);
  const pcmCanvasRef = reactExports.useRef(null);
  const pcmLen = config.pcmData ? config.pcmData.length : 0;
  reactExports.useEffect(() => {
    if (activeTab !== "pcm") return;
    const canvas = pcmCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#0a0012";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    const data = config.pcmData;
    if (!data || data.length === 0) {
      ctx.fillStyle = "#555";
      ctx.font = "11px monospace";
      ctx.fillText("(no PCM data)", 8, H / 2 - 6);
      return;
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(data.length / W));
    for (let x = 0; x < W; x++) {
      const i = Math.min(data.length - 1, x * step);
      const b = data[i];
      const s = b > 127 ? b - 256 : b;
      const y = H / 2 - s / 128 * (H / 2 - 2);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const ls = config.loopStart ?? 0;
    const ll = config.loopLength ?? 0;
    if (ll > 0 && ls >= 0 && ls < data.length) {
      const x1 = Math.floor(ls / data.length * W);
      const x2 = Math.floor((ls + ll) / data.length * W);
      ctx.fillStyle = accent + "22";
      ctx.fillRect(x1, 0, Math.max(1, x2 - x1), H);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1 + 0.5, 0);
      ctx.lineTo(x1 + 0.5, H);
      ctx.moveTo(x2 + 0.5, 0);
      ctx.lineTo(x2 + 0.5, H);
      ctx.stroke();
    }
  }, [activeTab, config.pcmData, config.loopStart, config.loopLength, accent, dim]);
  const renderPcm = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "PCM Sample (read-only preview)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 380,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "canvas",
        {
          ref: pcmCanvasRef,
          width: 480,
          height: 96,
          className: "w-full rounded",
          style: { background: "#0a0012", border: `1px solid ${dim}`, imageRendering: "pixelated" }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
          lineNumber: 381,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-[10px] font-mono", style: { color: "#888" }, children: pcmLen > 0 ? `${pcmLen.toLocaleString()} bytes (${(pcmLen / 1024).toFixed(2)} KB)` : "No PCM data loaded" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 388,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 379,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Loop Points" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 396,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono uppercase tracking-wider", style: { color: accent }, children: "Loop Start" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 399,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "number",
              min: 0,
              max: Math.max(0, pcmLen),
              step: 1,
              value: config.loopStart ?? 0,
              onChange: (e) => {
                const raw = parseInt(e.target.value, 10);
                const v = Number.isFinite(raw) ? Math.max(0, Math.min(pcmLen, raw)) : 0;
                upd("loopStart", v);
              },
              className: "px-2 py-1 text-xs font-mono rounded",
              style: {
                background: "#0a0012",
                color: accent,
                border: `1px solid ${dim}`
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
              lineNumber: 402,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono", style: { color: "#666" }, children: [
            "0 .. ",
            pcmLen
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 420,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
          lineNumber: 398,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono uppercase tracking-wider", style: { color: accent }, children: "Loop Length" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 425,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "number",
              min: 0,
              max: Math.max(0, pcmLen),
              step: 1,
              value: config.loopLength ?? 0,
              onChange: (e) => {
                const raw = parseInt(e.target.value, 10);
                const v = Number.isFinite(raw) ? Math.max(0, Math.min(pcmLen, raw)) : 0;
                upd("loopLength", v);
              },
              className: "px-2 py-1 text-xs font-mono rounded",
              style: {
                background: "#0a0012",
                color: accent,
                border: `1px solid ${dim}`
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
              lineNumber: 428,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono", style: { color: "#666" }, children: [
            "0 .. ",
            pcmLen,
            " (0 = no loop)"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 446,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
          lineNumber: 424,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 397,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 395,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Finetune" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 454,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.finetune ?? 0,
            min: -8,
            max: 7,
            step: 1,
            onChange: (v) => upd("finetune", Math.round(v)),
            label: "Finetune",
            color: knob,
            formatValue: (v) => {
              const n = Math.round(v);
              return n > 0 ? `+${n}` : n.toString();
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
            lineNumber: 456,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] font-mono", style: { color: "#888" }, children: "-8 .. +7 (signed nibble)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
          lineNumber: 469,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
        lineNumber: 455,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 453,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
    lineNumber: 378,
    columnNumber: 5
  }, void 0);
  const TABS = [
    { id: "main", label: "Main" },
    { id: "filter", label: "Filter" },
    { id: "arpeggio", label: "Arpeggio" },
    ...config.type === "pcm" ? [{ id: "pcm", label: "PCM Sample" }] : []
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center border-b", style: { borderColor: dim }, children: [
      TABS.map(({ id, label }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab(id),
          className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
          style: {
            color: activeTab === id ? accent : "#666",
            borderBottom: activeTab === id ? `2px solid ${accent}` : "2px solid transparent",
            background: activeTab === id ? isCyan ? "#041510" : "#1a0010" : "transparent"
          },
          children: label
        },
        id,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
          lineNumber: 488,
          columnNumber: 11
        },
        void 0
      )),
      uadeChipRam && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => {
            const editor = getEditor();
            if (editor && uadeChipRam) {
              editor.exportModule(uadeChipRam.moduleBase, uadeChipRam.moduleSize, "sidmon2_instrument.sm2").catch(console.error);
            }
          },
          className: "ml-auto flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-dark-bgSecondary hover:bg-dark-bg border rounded transition-colors",
          title: "Export module with current edits",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Download, { size: 10 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
              lineNumber: 511,
              columnNumber: 13
            }, void 0),
            "Export .sm2 (Amiga)"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
          lineNumber: 500,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
      lineNumber: 486,
      columnNumber: 7
    }, void 0),
    activeTab === "main" && renderMain(),
    activeTab === "filter" && renderFilter(),
    activeTab === "arpeggio" && renderArpeggio(),
    activeTab === "pcm" && renderPcm()
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SidMonControls.tsx",
    lineNumber: 485,
    columnNumber: 5
  }, void 0);
};
export {
  SidMonControls
};
