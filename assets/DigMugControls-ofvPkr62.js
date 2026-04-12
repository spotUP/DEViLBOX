import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aA as UADEEngine, W as CustomSelect, aB as Knob, cB as PatternEditorCanvas } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { W as WaveformThumbnail } from "./WaveformThumbnail-CebZPsAz.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import { w as writeWaveformByte } from "./waveformDraw-Qi2V4aQb.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const DM_WAVES = [
  { name: "Sine", type: "sine" },
  { name: "Triangle", type: "triangle" },
  { name: "Sawtooth", type: "saw" },
  { name: "Square", type: "square" },
  { name: "Pulse 25%", type: "pulse25" },
  { name: "Pulse 12%", type: "pulse12" },
  { name: "Noise", type: "noise" },
  { name: "Organ 1", type: "sine" },
  { name: "Organ 2", type: "sine" },
  { name: "Brass", type: "saw" },
  { name: "String", type: "saw" },
  { name: "Bell", type: "sine" },
  { name: "Piano", type: "triangle" },
  { name: "Flute", type: "sine" },
  { name: "Reed", type: "square" }
];
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
    color: "#aaff44",
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
const DigMugControls = ({
  config,
  onChange,
  arpPlaybackPosition,
  uadeChipRam
}) => {
  var _a;
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
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#aaff44", { knob: "#bbff66", dim: "#1a3300" });
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
  }, [onChange]);
  const updWithChipRam = reactExports.useCallback(
    (key, value, byteOffset) => {
      upd(key, value);
      if (uadeChipRam) {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 255);
      }
    },
    [upd, uadeChipRam, getEditor]
  );
  const handleExport = reactExports.useCallback(async () => {
    if (!uadeChipRam) return;
    try {
      await getEditor().exportModule(
        uadeChipRam.moduleBase,
        uadeChipRam.moduleSize,
        "digmug_module.dm"
      );
    } catch (e) {
      console.error("[DigMugControls] Export failed:", e);
    }
  }, [uadeChipRam, getEditor]);
  const updateWavetable = reactExports.useCallback((slot, value) => {
    const wt = [...configRef.current.wavetable];
    wt[slot] = value;
    onChange({ wavetable: wt });
    if (uadeChipRam) {
      const byteOffset = slot === 0 ? 0 : slot === 2 ? 12 : slot === 3 ? 13 : -1;
      if (byteOffset >= 0) {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 255);
      }
    }
  }, [onChange, uadeChipRam, getEditor]);
  const renderMain = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Wavetable Slots (4 waves)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 157,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 mb-3", children: [0, 1, 2, 3].map((slot) => {
        const waveIdx = config.wavetable[slot];
        const waveDef = DM_WAVES[waveIdx] ?? DM_WAVES[0];
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted text-center", children: [
            "Wave ",
            slot + 1
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 164,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "rounded overflow-hidden border", style: { borderColor: dim }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WaveformThumbnail, { type: waveDef.type, width: 72, height: 28, color: accent, style: "line" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 166,
            columnNumber: 19
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 165,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(waveIdx),
              onChange: (v) => updateWavetable(slot, parseInt(v)),
              options: DM_WAVES.map((w, i) => ({ value: String(i), label: `${i}: ${w.name}` })),
              className: "text-[9px] font-mono border rounded px-1 py-0.5",
              style: { background: "#0a0f00", borderColor: dim, color: accent }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
              lineNumber: 168,
              columnNumber: 17
            },
            void 0
          )
        ] }, slot, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
          lineNumber: 163,
          columnNumber: 15
        }, void 0);
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 158,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.waveBlend,
            min: 0,
            max: 63,
            step: 1,
            onChange: (v) => updWithChipRam("waveBlend", Math.round(v), 6),
            label: "Blend Pos",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 180,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.waveSpeed,
            min: 0,
            max: 63,
            step: 1,
            onChange: (v) => updWithChipRam("waveSpeed", Math.round(v), 14),
            label: "Morph Spd",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 183,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 179,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 h-3 rounded overflow-hidden", style: { background: "var(--color-bg-secondary)", border: `1px solid ${dim}` }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-full transition-all", style: {
        width: `${config.waveBlend / 63 * 100}%`,
        background: `linear-gradient(to right, ${accent}88, ${accent})`
      } }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 188,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 187,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between text-[9px] text-text-muted mt-0.5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "W1" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
          lineNumber: 194,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "W2" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
          lineNumber: 194,
          columnNumber: 26
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "W3" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
          lineNumber: 194,
          columnNumber: 41
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "W4" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
          lineNumber: 194,
          columnNumber: 56
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 193,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
      lineNumber: 156,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume & Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 198,
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
            onChange: (v) => updWithChipRam("volume", Math.round(v), 2),
            label: "Volume",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 200,
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
            onChange: (v) => updWithChipRam("vibSpeed", Math.round(v), 5),
            label: "Vib Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 203,
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
            onChange: (v) => updWithChipRam("vibDepth", Math.round(v), 7),
            label: "Vib Depth",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 206,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 199,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
      lineNumber: 197,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
    lineNumber: 155,
    columnNumber: 5
  }, void 0);
  const hasWaveform = !!config.waveformData;
  const hasPcm = !!config.pcmData;
  const waveCanvasRef = reactExports.useRef(null);
  const pcmCanvasRef = reactExports.useRef(null);
  const isDrawingRef = reactExports.useRef(false);
  const lastIdxRef = reactExports.useRef(-1);
  const drawWave = reactExports.useCallback(() => {
    const canvas = waveCanvasRef.current;
    const wf = configRef.current.waveformData;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 120;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const w = cssW, h = cssH, mid = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a0f00";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
    if (!wf || wf.length === 0) {
      ctx.fillStyle = "#4a5a3a";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("No waveform data", w / 2, mid);
      return;
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx = Math.floor(x / w * wf.length) % wf.length;
      const s = wf[idx] > 127 ? wf[idx] - 256 : wf[idx];
      const y = mid - s / 128 * (mid - 4);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [accent, dim]);
  reactExports.useEffect(() => {
    if (activeTab !== "sample" || !hasWaveform) return;
    const raf = requestAnimationFrame(() => drawWave());
    const obs = new ResizeObserver(() => drawWave());
    if (waveCanvasRef.current) obs.observe(waveCanvasRef.current);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [activeTab, hasWaveform, drawWave, config.waveformData]);
  const writeWaveByteFromEvent = reactExports.useCallback((e) => {
    const cur = configRef.current;
    if (!cur.waveformData) return;
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { next, idx } = writeWaveformByte(
      cur.waveformData,
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      lastIdxRef.current
    );
    lastIdxRef.current = idx;
    onChange({ waveformData: next });
  }, [onChange]);
  const handleWavePointerDown = reactExports.useCallback((e) => {
    if (!configRef.current.waveformData) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastIdxRef.current = -1;
    writeWaveByteFromEvent(e);
  }, [writeWaveByteFromEvent]);
  const handleWavePointerMove = reactExports.useCallback((e) => {
    if (!isDrawingRef.current) return;
    writeWaveByteFromEvent(e);
  }, [writeWaveByteFromEvent]);
  const handleWavePointerUp = reactExports.useCallback((e) => {
    isDrawingRef.current = false;
    lastIdxRef.current = -1;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
  }, []);
  const applyWavePreset = reactExports.useCallback((kind) => {
    var _a2;
    const cur = configRef.current;
    const size = Math.max(1, ((_a2 = cur.waveformData) == null ? void 0 : _a2.length) ?? 128);
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      const t = i / size;
      let v = 0;
      switch (kind) {
        case "sine":
          v = Math.round(Math.sin(t * Math.PI * 2) * 127);
          break;
        case "triangle":
          v = Math.round((t < 0.25 ? 4 * t : t < 0.75 ? 2 - 4 * t : -4 + 4 * t) * 127);
          break;
        case "square":
          v = t < 0.5 ? 127 : -127;
          break;
        case "saw":
          v = Math.round((2 * t - 1) * 127);
          break;
        case "noise":
          v = Math.round((Math.random() * 2 - 1) * 127);
          break;
        case "clear":
          v = 0;
          break;
      }
      out[i] = v < 0 ? v + 256 : v;
    }
    onChange({ waveformData: out });
  }, [onChange]);
  const drawPcm = reactExports.useCallback(() => {
    const canvas = pcmCanvasRef.current;
    const pcm = configRef.current.pcmData;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 120;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const w = cssW, h = cssH, mid = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a0f00";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
    if (!pcm || pcm.length === 0) {
      ctx.fillStyle = "#4a5a3a";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("No PCM data", w / 2, mid);
      return;
    }
    const loopStart = configRef.current.loopStart ?? 0;
    const loopLength = configRef.current.loopLength ?? 0;
    if (loopLength > 0) {
      const x0 = Math.floor(loopStart / pcm.length * w);
      const x1 = Math.min(w, Math.floor((loopStart + loopLength) / pcm.length * w));
      ctx.fillStyle = `${accent}22`;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, 0);
      ctx.lineTo(x0 + 0.5, h);
      ctx.moveTo(x1 - 0.5, 0);
      ctx.lineTo(x1 - 0.5, h);
      ctx.stroke();
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(pcm.length / w));
    for (let x = 0; x < w; x++) {
      let min = 127, max = -128;
      const start = Math.floor(x / w * pcm.length);
      const end = Math.min(pcm.length, start + step);
      for (let i = start; i < end; i++) {
        const s = pcm[i] > 127 ? pcm[i] - 256 : pcm[i];
        if (s < min) min = s;
        if (s > max) max = s;
      }
      const yMin = mid - max / 128 * (mid - 2);
      const yMax = mid - min / 128 * (mid - 2);
      ctx.moveTo(x + 0.5, yMin);
      ctx.lineTo(x + 0.5, yMax);
    }
    ctx.stroke();
  }, [accent, dim]);
  reactExports.useEffect(() => {
    if (activeTab !== "sample" || !hasPcm) return;
    const raf = requestAnimationFrame(() => drawPcm());
    const obs = new ResizeObserver(() => drawPcm());
    if (pcmCanvasRef.current) obs.observe(pcmCanvasRef.current);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [activeTab, hasPcm, drawPcm, config.pcmData, config.loopStart, config.loopLength]);
  const pcmLen = ((_a = config.pcmData) == null ? void 0 : _a.length) ?? 0;
  const updateLoopStart = reactExports.useCallback((raw) => {
    var _a2;
    const max = ((_a2 = configRef.current.pcmData) == null ? void 0 : _a2.length) ?? 0;
    const v = Math.max(0, Math.min(max, Math.floor(raw)));
    onChange({ loopStart: v });
  }, [onChange]);
  const updateLoopLength = reactExports.useCallback((raw) => {
    var _a2;
    const max = ((_a2 = configRef.current.pcmData) == null ? void 0 : _a2.length) ?? 0;
    const start = configRef.current.loopStart ?? 0;
    const v = Math.max(0, Math.min(Math.max(0, max - start), Math.floor(raw)));
    onChange({ loopLength: v });
  }, [onChange]);
  const renderSample = () => {
    var _a2;
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
      hasWaveform && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Synth Waveform — click + drag to draw" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 431,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: ["sine", "triangle", "square", "saw", "noise", "clear"].map((k) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => applyWavePreset(k),
              className: "text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase",
              style: { borderColor: dim, color: accent, background: "rgba(40,80,20,0.2)" },
              title: `Fill waveform with ${k}`,
              children: k
            },
            k,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
              lineNumber: 434,
              columnNumber: 17
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 432,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
          lineNumber: 430,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: waveCanvasRef,
            className: "w-full rounded border cursor-crosshair",
            style: { height: 140, borderColor: dim, background: "#0a0f00", touchAction: "none" },
            onPointerDown: handleWavePointerDown,
            onPointerMove: handleWavePointerMove,
            onPointerUp: handleWavePointerUp,
            onPointerCancel: handleWavePointerUp
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 444,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-1 text-[9px] font-mono text-text-muted", children: [
          ((_a2 = config.waveformData) == null ? void 0 : _a2.length) ?? 0,
          " bytes (signed 8-bit)"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
          lineNumber: 453,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 429,
        columnNumber: 9
      }, void 0),
      hasPcm && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "PCM Sample (read-only)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 462,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono text-text-muted", children: [
            pcmLen.toLocaleString(),
            " bytes"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 463,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
          lineNumber: 461,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: pcmCanvasRef,
            className: "w-full rounded border",
            style: { height: 140, borderColor: dim, background: "#0a0f00" }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 467,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-3 mt-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono uppercase tracking-wider", style: { color: accent }, children: "Loop Start" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
              lineNumber: 474,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: 0,
                max: pcmLen,
                step: 1,
                value: config.loopStart ?? 0,
                onChange: (e) => updateLoopStart(parseInt(e.target.value || "0", 10)),
                className: "text-xs font-mono border rounded px-2 py-1",
                style: { background: "#0a0f00", borderColor: dim, color: accent }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
                lineNumber: 477,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 473,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono uppercase tracking-wider", style: { color: accent }, children: "Loop Length" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
              lineNumber: 489,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: 0,
                max: Math.max(0, pcmLen - (config.loopStart ?? 0)),
                step: 1,
                value: config.loopLength ?? 0,
                onChange: (e) => updateLoopLength(parseInt(e.target.value || "0", 10)),
                className: "text-xs font-mono border rounded px-2 py-1",
                style: { background: "#0a0f00", borderColor: dim, color: accent }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
                lineNumber: 492,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 488,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
          lineNumber: 472,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono text-text-muted mt-1", children: [
          "Loop end: ",
          ((config.loopStart ?? 0) + (config.loopLength ?? 0)).toLocaleString(),
          " / ",
          pcmLen.toLocaleString()
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
          lineNumber: 504,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 460,
        columnNumber: 9
      }, void 0),
      !hasWaveform && !hasPcm && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-6 ${panelBg} text-center text-xs font-mono text-text-muted`, style: panelStyle, children: "No sample data on this instrument." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 511,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
      lineNumber: 427,
      columnNumber: 5
    }, void 0);
  };
  const arpChannels = reactExports.useMemo(() => arpToFormatChannel(config.arpTable), [config.arpTable]);
  const arpCellChange = reactExports.useMemo(
    () => makeArpCellChange(config.arpTable, (d) => upd("arpTable", d)),
    [config.arpTable, upd]
  );
  const renderArpeggio = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3", style: { height: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg} flex flex-col`, style: { ...panelStyle, flex: 1, minHeight: 0 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Arpeggio Speed" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 529,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.arpSpeed,
          min: 0,
          max: 15,
          step: 1,
          onChange: (v) => {
            const val = Math.round(v);
            upd("arpSpeed", val);
            if (uadeChipRam) {
              void getEditor().writeU8(uadeChipRam.instrBase + 14, Math.round(val * 17) & 255);
            }
          },
          label: "Speed",
          color: knob,
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
          lineNumber: 530,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
      lineNumber: 528,
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
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 541,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
      lineNumber: 540,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
    lineNumber: 527,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
    lineNumber: 526,
    columnNumber: 5
  }, void 0);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dim }, children: [["main", "Parameters"], ["arpeggio", "Arpeggio"], ["sample", "Sample"]].map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(id),
        className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
        style: {
          color: activeTab === id ? accent : "#666",
          borderBottom: activeTab === id ? `2px solid ${accent}` : "2px solid transparent",
          background: activeTab === id ? isCyan ? "#041510" : "#0a1400" : "transparent"
        },
        children: label
      },
      id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 558,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
      lineNumber: 556,
      columnNumber: 7
    }, void 0),
    activeTab === "main" && renderMain(),
    activeTab === "arpeggio" && renderArpeggio(),
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
            style: { background: "rgba(40,80,20,0.3)", color: "#aaff44" },
            onClick: () => void handleExport(),
            children: "Export .dm (Amiga)"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
            lineNumber: 576,
            columnNumber: 11
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
        lineNumber: 574,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DigMugControls.tsx",
    lineNumber: 555,
    columnNumber: 5
  }, void 0);
};
export {
  DigMugControls
};
