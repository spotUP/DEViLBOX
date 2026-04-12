import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aA as UADEEngine, aB as Knob } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import { w as writeWaveformByte } from "./waveformDraw-Qi2V4aQb.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const OFF_VOL_TABLE = 6;
const OFF_VIB_TABLE = 21;
const OFF_PITCH_BEND = 36;
const OFF_TABLE = 40;
const DeltaMusic2Controls = ({
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
  const updateVolEntry = reactExports.useCallback(
    (entryIndex, field, value) => {
      const cur = configRef.current;
      const newTable = cur.volTable.map(
        (e, idx) => idx === entryIndex ? field === 0 ? { ...e, speed: value } : field === 1 ? { ...e, level: value } : { ...e, sustain: value } : e
      );
      onChange({ volTable: newTable });
      if (uadeChipRam) {
        const byteOff = OFF_VOL_TABLE + entryIndex * 3 + field;
        void getEditor().writeU8(uadeChipRam.instrBase + byteOff, value & 255);
      }
    },
    [onChange, uadeChipRam, getEditor]
  );
  const updateVibEntry = reactExports.useCallback(
    (entryIndex, field, value) => {
      const cur = configRef.current;
      const newTable = cur.vibTable.map(
        (e, idx) => idx === entryIndex ? field === 0 ? { ...e, speed: value } : field === 1 ? { ...e, delay: value } : { ...e, sustain: value } : e
      );
      onChange({ vibTable: newTable });
      if (uadeChipRam) {
        const byteOff = OFF_VIB_TABLE + entryIndex * 3 + field;
        void getEditor().writeU8(uadeChipRam.instrBase + byteOff, value & 255);
      }
    },
    [onChange, uadeChipRam, getEditor]
  );
  const updatePitchBend = reactExports.useCallback(
    (value) => {
      onChange({ pitchBend: value });
      if (uadeChipRam) {
        void getEditor().writeU16(uadeChipRam.instrBase + OFF_PITCH_BEND, value & 65535);
      }
    },
    [onChange, uadeChipRam, getEditor]
  );
  const updateTableEntry = reactExports.useCallback(
    (index, value) => {
      if (!configRef.current.table) return;
      const newTable = new Uint8Array(configRef.current.table);
      newTable[index] = value & 255;
      onChange({ table: newTable });
      if (uadeChipRam) {
        void getEditor().writeU8(uadeChipRam.instrBase + OFF_TABLE + index, value & 255);
      }
    },
    [onChange, uadeChipRam, getEditor]
  );
  const renderEnvelope = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume Table (5 entries)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
      lineNumber: 171,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mb-2", children: "Each entry: Speed (step rate), Level (0-255), Sustain (ticks at this level)." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
      lineNumber: 172,
      columnNumber: 9
    }, void 0),
    config.volTable.slice(0, 5).map((entry, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider block mb-1", style: { color: accent, opacity: 0.5 }, children: [
        "Entry ",
        idx + 1
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 177,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: entry.speed,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateVolEntry(idx, 0, Math.round(v)),
            label: "Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
            lineNumber: 181,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: entry.level,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateVolEntry(idx, 1, Math.round(v)),
            label: "Level",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
            lineNumber: 187,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: entry.sustain,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updateVolEntry(idx, 2, Math.round(v)),
            label: "Sustain",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
            lineNumber: 193,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 180,
        columnNumber: 13
      }, void 0)
    ] }, idx, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
      lineNumber: 176,
      columnNumber: 11
    }, void 0))
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
    lineNumber: 170,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
    lineNumber: 169,
    columnNumber: 5
  }, void 0);
  const renderModulation = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato Table (5 entries)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 213,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mb-2", children: "Each entry: Speed (LFO rate), Delay (ticks before start), Sustain (ticks at this vibrato)." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 214,
        columnNumber: 9
      }, void 0),
      config.vibTable.slice(0, 5).map((entry, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider block mb-1", style: { color: accent, opacity: 0.5 }, children: [
          "Entry ",
          idx + 1
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
          lineNumber: 219,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: entry.speed,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updateVibEntry(idx, 0, Math.round(v)),
              label: "Speed",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
              lineNumber: 223,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: entry.delay,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updateVibEntry(idx, 1, Math.round(v)),
              label: "Delay",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
              lineNumber: 229,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: entry.sustain,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updateVibEntry(idx, 2, Math.round(v)),
              label: "Sustain",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
              lineNumber: 235,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
          lineNumber: 222,
          columnNumber: 13
        }, void 0)
      ] }, idx, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 218,
        columnNumber: 11
      }, void 0))
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
      lineNumber: 212,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Pitch Bend" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 248,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.pitchBend,
            min: 0,
            max: 65535,
            step: 1,
            onChange: (v) => updatePitchBend(Math.round(v)),
            label: "Bend",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
            lineNumber: 250,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "0 = no bend" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
          lineNumber: 256,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 249,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
      lineNumber: 247,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
    lineNumber: 209,
    columnNumber: 5
  }, void 0);
  const renderTable = () => {
    if (config.isSample || !config.table) {
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 text-[11px] text-text-muted", children: "No synth sound table — this is a PCM sample instrument." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 267,
        columnNumber: 9
      }, void 0);
    }
    const table = config.table;
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Wavetable Sequence (48 bytes)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 278,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-8 gap-1", children: Array.from(table).map((entry, idx) => {
        const isLoop = entry === 255;
        const isWave = entry < 255;
        let bg = "#0a0e14";
        let textColor = "#555";
        if (isWave) {
          bg = accent + "1a";
          textColor = accent;
        } else if (isLoop) {
          bg = "#1a0000";
          textColor = "#884444";
        }
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "flex flex-col items-center py-1 rounded text-[8px] font-mono",
            style: { background: bg, border: `1px solid ${textColor}44` },
            title: `Byte ${idx}: ${entry} (0x${entry.toString(16).padStart(2, "0").toUpperCase()})`,
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: textColor, opacity: 0.5 }, children: idx }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
                lineNumber: 300,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "number",
                  min: 0,
                  max: 255,
                  value: entry,
                  onChange: (e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 0 && v <= 255) {
                      updateTableEntry(idx, v);
                    }
                  },
                  onBlur: (e) => {
                    const v = parseInt(e.target.value, 10);
                    if (isNaN(v)) {
                      updateTableEntry(idx, 0);
                    } else {
                      updateTableEntry(idx, Math.max(0, Math.min(255, v)));
                    }
                  },
                  className: "w-full text-center bg-transparent border-none outline-none text-[9px] font-mono",
                  style: {
                    color: textColor,
                    MozAppearance: "textfield",
                    WebkitAppearance: "none"
                  }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
                  lineNumber: 301,
                  columnNumber: 19
                },
                void 0
              )
            ]
          },
          idx,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
            lineNumber: 296,
            columnNumber: 17
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 279,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 flex flex-col gap-1 text-[9px]", style: { color: accent, opacity: 0.6 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "0-254 = waveform index  ·  255 = loop/end marker (LP)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
          lineNumber: 332,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Click any cell to edit its value" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
          lineNumber: 333,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 331,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
      lineNumber: 277,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
      lineNumber: 276,
      columnNumber: 7
    }, void 0);
  };
  const waveCanvasRef = reactExports.useRef(null);
  const waveDrawingRef = reactExports.useRef(false);
  const waveLastIdxRef = reactExports.useRef(-1);
  const drawDM2Waveform = reactExports.useCallback(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const wavePCM = configRef.current.waveformPCM;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 140;
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
    if (!wavePCM || wavePCM.length === 0) {
      ctx.fillStyle = "#4a5a6a";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("No waveform data", w / 2, mid);
      return;
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx = Math.min(wavePCM.length - 1, Math.floor(x / w * wavePCM.length));
      const v = wavePCM[idx];
      const signed = v > 127 ? v - 256 : v;
      const y = mid - signed / 128 * (mid - 4);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [accent]);
  reactExports.useEffect(() => {
    if (activeTab !== "waveform") return;
    const raf = requestAnimationFrame(drawDM2Waveform);
    const canvas = waveCanvasRef.current;
    if (!canvas) {
      return () => cancelAnimationFrame(raf);
    }
    const obs = new ResizeObserver(drawDM2Waveform);
    obs.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [activeTab, drawDM2Waveform, config.waveformPCM]);
  const writeWaveformFromEvent = reactExports.useCallback((e) => {
    const cur = configRef.current;
    if (!cur.waveformPCM || cur.isSample) return;
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const u8 = new Uint8Array(cur.waveformPCM.length);
    for (let i = 0; i < cur.waveformPCM.length; i++) {
      u8[i] = cur.waveformPCM[i] & 255;
    }
    const { next, idx } = writeWaveformByte(
      u8,
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      waveLastIdxRef.current
    );
    waveLastIdxRef.current = idx;
    const signed = new Array(next.length);
    for (let i = 0; i < next.length; i++) {
      signed[i] = next[i] > 127 ? next[i] - 256 : next[i];
    }
    onChange({ waveformPCM: signed });
  }, [onChange]);
  const handleWavePointerDown = reactExports.useCallback((e) => {
    if (configRef.current.isSample || !configRef.current.waveformPCM) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    waveDrawingRef.current = true;
    waveLastIdxRef.current = -1;
    writeWaveformFromEvent(e);
  }, [writeWaveformFromEvent]);
  const handleWavePointerMove = reactExports.useCallback((e) => {
    if (!waveDrawingRef.current) return;
    writeWaveformFromEvent(e);
  }, [writeWaveformFromEvent]);
  const handleWavePointerUp = reactExports.useCallback((e) => {
    waveDrawingRef.current = false;
    waveLastIdxRef.current = -1;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
  }, []);
  const applyWavePreset = reactExports.useCallback((kind) => {
    const cur = configRef.current;
    if (!cur.waveformPCM || cur.isSample) return;
    const size = cur.waveformPCM.length;
    const out = new Array(size);
    for (let i = 0; i < size; i++) {
      const t = i / size;
      let v = 0;
      switch (kind) {
        case "sine":
          v = Math.round(Math.sin(t * Math.PI * 2) * 127);
          break;
        case "triangle":
          v = Math.round((1 - Math.abs(t * 4 % 4 - 2)) * 127);
          break;
        case "square":
          v = t < 0.5 ? 127 : -127;
          break;
        case "saw":
          v = Math.round((t * 2 - 1) * 127);
          break;
        case "noise":
          v = Math.round((Math.random() * 2 - 1) * 127);
          break;
        case "clear":
          v = 0;
          break;
      }
      out[i] = Math.max(-127, Math.min(127, v));
    }
    onChange({ waveformPCM: out });
  }, [onChange]);
  const renderWaveform = () => {
    if (config.isSample) {
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 text-[11px] text-text-muted", children: "No oscillator waveform — this is a PCM sample instrument." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 498,
        columnNumber: 9
      }, void 0);
    }
    if (!config.waveformPCM || config.waveformPCM.length === 0) {
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 text-[11px] text-text-muted", children: "No waveform data available for this instrument." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 505,
        columnNumber: 9
      }, void 0);
    }
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Oscillator Waveform (click + drag to draw)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 513,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mb-2", children: [
        config.waveformPCM.length,
        " bytes — signed 8-bit PCM. This is the waveform selected by the wavetable sequence (Table tab)."
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 514,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 mb-2", children: ["sine", "triangle", "square", "saw", "noise", "clear"].map((k) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => applyWavePreset(k),
          className: "text-[9px] font-mono px-1.5 py-0.5 rounded border border-dark-border text-text-secondary hover:text-accent-primary hover:border-accent-primary/50 uppercase",
          title: `Fill waveform with ${k}`,
          children: k
        },
        k,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
          lineNumber: 520,
          columnNumber: 15
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 518,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "canvas",
        {
          ref: waveCanvasRef,
          className: "w-full rounded border border-dark-border bg-[#0a0e14] cursor-crosshair",
          style: { height: 160, touchAction: "none" },
          onPointerDown: handleWavePointerDown,
          onPointerMove: handleWavePointerMove,
          onPointerUp: handleWavePointerUp,
          onPointerCancel: handleWavePointerUp
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
          lineNumber: 530,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-[9px]", style: { color: accent, opacity: 0.6 }, children: "Edits are saved to the instrument config and exported with .xm. Live UADE chip-RAM patching is not performed for this field (the waveform pool sits outside the instrument header)." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 539,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
      lineNumber: 512,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
      lineNumber: 511,
      columnNumber: 7
    }, void 0);
  };
  const hasWaveformPCM = !config.isSample && !!(config.waveformPCM && config.waveformPCM.length > 0);
  const tabs = [
    ["envelope", "Envelope"],
    ["modulation", "Modulation"],
    ...!config.isSample ? [["table", "Table"]] : [],
    ...hasWaveformPCM ? [["waveform", "Waveform"]] : []
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
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 564,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
      lineNumber: 562,
      columnNumber: 7
    }, void 0),
    activeTab === "envelope" && renderEnvelope(),
    activeTab === "modulation" && renderModulation(),
    activeTab === "table" && renderTable(),
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
            style: { background: "rgba(80,50,20,0.5)", color: "#ffaa44" },
            onClick: () => void getEditor().exportModule(
              uadeChipRam.moduleBase,
              uadeChipRam.moduleSize,
              "song.dm2"
            ),
            children: "Export .dm2 (Amiga)"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
            lineNumber: 585,
            columnNumber: 11
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
        lineNumber: 583,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DeltaMusic2Controls.tsx",
    lineNumber: 561,
    columnNumber: 5
  }, void 0);
};
export {
  DeltaMusic2Controls
};
