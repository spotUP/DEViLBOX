import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React } from "./vendor-ui-AJ7AT9BN.js";
import { ao as useGTUltraStore, cB as PatternEditorCanvas } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { N as NumBox } from "./NumBox-9OpyboiL.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { b as applyPresetToInstrument, S as SID_PRESETS, a as getPresetsByCategory, g as getPresetCategories } from "./gtultraPresets-B_La0BBT.js";
import { e as encodeAD, a as encodeSR, A as ATTACK_MS, D as DECAY_MS, W as WAVEFORMS } from "./GTVisualMapping-BkrLaqE6.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function decodeWaveSequence(left, right, startPtr) {
  const steps = [];
  if (startPtr <= 0 || startPtr > 254) return steps;
  let pendingDelay = 0;
  let i = startPtr - 1;
  for (let safety = 0; safety < 255 && i < 255; safety++) {
    const l = left[i];
    const r = right[i];
    if (l === 255) break;
    if (l >= 1 && l <= 15) {
      pendingDelay += l;
      i++;
      continue;
    }
    if (l >= 16 && l <= 239) {
      const isSilent = l >= 224;
      const waveBits = isSilent ? 0 : l & 240;
      steps.push({
        waveform: waveBits,
        gate: !!(l & 1),
        sync: !!(l & 2),
        ring: !!(l & 4),
        delay: pendingDelay,
        noteOffset: r
      });
      pendingDelay = 0;
      i++;
      continue;
    }
    if (l >= 240 && l <= 254) {
      steps.push({
        waveform: 0,
        gate: false,
        sync: false,
        ring: false,
        delay: pendingDelay,
        noteOffset: 0,
        isCommand: true,
        cmdByte: l,
        cmdParam: r
      });
      pendingDelay = 0;
      i++;
      continue;
    }
    i++;
  }
  return steps;
}
function encodeWaveSequence(steps) {
  const left = [];
  const right = [];
  for (const step of steps) {
    if (step.delay > 0) {
      let remaining = step.delay;
      while (remaining > 0) {
        const d = Math.min(15, remaining);
        left.push(d);
        right.push(0);
        remaining -= d;
      }
    }
    if (step.isCommand) {
      left.push(step.cmdByte ?? 240);
      right.push(step.cmdParam ?? 0);
    } else {
      let wave = step.waveform & 240;
      if (step.gate) wave |= 1;
      if (step.sync) wave |= 2;
      if (step.ring) wave |= 4;
      if (wave < 16) wave = 16;
      left.push(wave);
      right.push(step.noteOffset);
    }
  }
  left.push(255);
  right.push(0);
  return { left, right };
}
function decodePulseSequence(left, right, startPtr) {
  const steps = [];
  if (startPtr <= 0 || startPtr > 254) return steps;
  let i = startPtr - 1;
  for (let safety = 0; safety < 255 && i < 255; safety++) {
    const l = left[i];
    const r = right[i];
    if (l === 255) break;
    if (l >= 128) {
      const pw = (l & 15) << 8 | r;
      steps.push({ type: "set", value: pw, speed: 0 });
    } else if (l > 0) {
      steps.push({ type: "mod", value: l, speed: r });
    }
    i++;
  }
  return steps;
}
function encodePulseSequence(steps) {
  const left = [];
  const right = [];
  for (const step of steps) {
    if (step.type === "set") {
      const pw = Math.max(0, Math.min(4095, step.value));
      left.push(128 | pw >> 8 & 15);
      right.push(pw & 255);
    } else {
      left.push(Math.max(1, Math.min(127, step.value)));
      right.push(step.speed & 255);
    }
  }
  left.push(255);
  right.push(0);
  return { left, right };
}
function decodeFilterSequence(left, right, startPtr) {
  const steps = [];
  if (startPtr <= 0 || startPtr > 254) return steps;
  let i = startPtr - 1;
  for (let safety = 0; safety < 255 && i < 255; safety++) {
    const l = left[i];
    const r = right[i];
    if (l === 255) break;
    if (l >= 128 || l === 0) {
      steps.push({ type: "set", value: l, param: r });
    } else {
      steps.push({ type: "mod", value: l, param: r });
    }
    i++;
  }
  return steps;
}
function encodeFilterSequence(steps) {
  const left = [];
  const right = [];
  for (const step of steps) {
    left.push(step.value & 255);
    right.push(step.param & 255);
  }
  left.push(255);
  right.push(0);
  return { left, right };
}
const WAVE_CMD_NAMES = {
  240: "NOP",
  241: "Porta Up",
  242: "Porta Down",
  243: "Tone Porta",
  244: "Vibrato",
  245: "Set AD",
  246: "Set SR",
  247: "Set Wave",
  249: "Pulse Ptr",
  250: "Filter Ptr",
  251: "Filter Ctrl",
  252: "Cutoff",
  253: "Master Vol"
};
function waveCommandLabel(cmdByte) {
  return WAVE_CMD_NAMES[cmdByte] ?? `CMD $${cmdByte.toString(16).toUpperCase()}`;
}
function waveformName(bits) {
  const parts = [];
  if (bits & 16) parts.push("TRI");
  if (bits & 32) parts.push("SAW");
  if (bits & 64) parts.push("PUL");
  if (bits & 128) parts.push("NOI");
  return parts.join("+") || "OFF";
}
const TABLE_COLORS = {
  wave: "#60e060",
  pulse: "#ff8866",
  filter: "#ffcc00",
  speed: "#6699ff"
};
const CATEGORY_LABELS = {
  bass: "Bass",
  lead: "Lead",
  pad: "Pad",
  arp: "Arp",
  drum: "Drum",
  fx: "FX",
  classic: "Classic",
  template: "Template"
};
const ARP_CHORDS = [
  { label: "Major", semitones: [0, 4, 7] },
  { label: "Minor", semitones: [0, 3, 7] },
  { label: "Oct", semitones: [0, 12] },
  { label: "Power", semitones: [0, 7] },
  { label: "Dim", semitones: [0, 3, 6] },
  { label: "7th", semitones: [0, 4, 7, 10] },
  { label: "Sus4", semitones: [0, 5, 7] }
];
const DRAW_H = 100;
const DRAW_STEPS = 32;
const DrawCanvas = ({ values, color, label, onDraw }) => {
  const canvasRef = reactExports.useRef(null);
  const isDragging = reactExports.useRef(false);
  const localValues = reactExports.useRef([...values]);
  reactExports.useEffect(() => {
    localValues.current = [...values];
  }, [values]);
  const draw = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    const dpr2 = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = dpr2;
    for (let i = 0; i <= 4; i++) {
      const y = i / 4 * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const vals = localValues.current;
    const barW = w / DRAW_STEPS;
    for (let i = 0; i < DRAW_STEPS; i++) {
      const v = vals[i] ?? 0;
      const barH = v * h;
      ctx.fillStyle = color + "80";
      ctx.fillRect(i * barW + 1 * dpr2, h - barH, barW - 2 * dpr2, barH);
    }
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr2;
    for (let i = 0; i < DRAW_STEPS; i++) {
      const x = (i + 0.5) * barW;
      const y = h - (vals[i] ?? 0) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (label) {
      ctx.font = `${9 * dpr2}px monospace`;
      ctx.fillStyle = "#555";
      ctx.fillText(label, 4 * dpr2, 10 * dpr2);
    }
  }, [color, label]);
  reactExports.useEffect(() => {
    draw();
  }, [draw, values]);
  const getStep = reactExports.useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    const step = Math.floor(x * DRAW_STEPS);
    return { step: Math.max(0, Math.min(DRAW_STEPS - 1, step)), value: Math.max(0, Math.min(1, y)) };
  }, []);
  const handlePointerDown = reactExports.useCallback((e) => {
    isDragging.current = true;
    const pt = getStep(e);
    if (pt) {
      localValues.current[pt.step] = pt.value;
      draw();
    }
    e.target.setPointerCapture(e.pointerId);
  }, [getStep, draw]);
  const handlePointerMove = reactExports.useCallback((e) => {
    if (!isDragging.current) return;
    const pt = getStep(e);
    if (pt) {
      localValues.current[pt.step] = pt.value;
      draw();
    }
  }, [getStep, draw]);
  const handlePointerUp = reactExports.useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    onDraw([...localValues.current]);
  }, [onDraw]);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      width: Math.round(280 * dpr),
      height: Math.round(DRAW_H * dpr),
      style: { width: "100%", height: DRAW_H, borderRadius: 4, background: "#060a08", border: "1px solid #1a1a1a", cursor: "crosshair" },
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
      lineNumber: 153,
      columnNumber: 5
    },
    void 0
  );
};
function pulseStepsToValues(steps) {
  const vals = new Array(DRAW_STEPS).fill(0.5);
  if (steps.length === 0) return vals;
  let pw = 2048;
  let idx = 0;
  for (const step of steps) {
    if (step.type === "set") {
      pw = step.value;
      if (idx < DRAW_STEPS) vals[idx] = pw / 4095;
      idx++;
    } else {
      for (let f = 0; f < step.value && idx < DRAW_STEPS; f++) {
        const speed = step.speed < 128 ? step.speed : step.speed - 256;
        pw = Math.max(0, Math.min(4095, pw + speed));
        vals[idx] = pw / 4095;
        idx++;
      }
    }
  }
  for (; idx < DRAW_STEPS; idx++) vals[idx] = pw / 4095;
  return vals;
}
function valuesToPulseSteps(values) {
  return values.filter((_, i) => i === 0 || Math.abs(values[i] - values[i - 1]) > 0.01).map((v) => ({ type: "set", value: Math.round(v * 4095), speed: 0 }));
}
const PulseDrawCanvas = ({ pulseSteps, color, onDraw }) => {
  const values = reactExports.useMemo(() => pulseStepsToValues(pulseSteps), [pulseSteps]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DrawCanvas, { values, color, label: "Pulse Width", onDraw }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
    lineNumber: 205,
    columnNumber: 10
  }, void 0);
};
function filterStepsToValues(steps) {
  const vals = new Array(DRAW_STEPS).fill(0.5);
  if (steps.length === 0) return vals;
  let cutoff = 128;
  let idx = 0;
  for (const step of steps) {
    if (step.type === "set") {
      cutoff = step.param;
      if (idx < DRAW_STEPS) vals[idx] = cutoff / 255;
      idx++;
    } else {
      for (let f = 0; f < step.value && idx < DRAW_STEPS; f++) {
        const speed = step.param < 128 ? step.param : step.param - 256;
        cutoff = Math.max(0, Math.min(255, cutoff + speed));
        vals[idx] = cutoff / 255;
        idx++;
      }
    }
  }
  for (; idx < DRAW_STEPS; idx++) vals[idx] = cutoff / 255;
  return vals;
}
function valuesToFilterSteps(values) {
  return values.filter((_, i) => i === 0 || Math.abs(values[i] - values[i - 1]) > 0.01).map((v) => ({ type: "set", value: 144, param: Math.round(v * 255) }));
}
const FilterDrawCanvas = ({ filterSteps, color, onDraw }) => {
  const values = reactExports.useMemo(() => filterStepsToValues(filterSteps), [filterSteps]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DrawCanvas, { values, color, label: "Filter Cutoff", onDraw }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
    lineNumber: 244,
    columnNumber: 10
  }, void 0);
};
const ARP_GRID_ROWS = 24;
const ARP_GRID_COLS = 8;
const ArpGrid = ({ color }) => {
  const [steps, setSteps] = reactExports.useState(
    () => Array.from({ length: ARP_GRID_COLS }, () => new Array(ARP_GRID_ROWS).fill(false))
  );
  const toggleCell = reactExports.useCallback((col, row) => {
    setSteps((prev) => {
      const next = prev.map((c) => [...c]);
      next[col] = new Array(ARP_GRID_ROWS).fill(false);
      next[col][row] = !prev[col][row];
      return next;
    });
  }, []);
  const cellSize = 14;
  const noteNames = ["C", "", "D", "", "E", "F", "", "G", "", "A", "", "B"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { overflowX: "auto" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: `20px repeat(${ARP_GRID_COLS}, ${cellSize}px)`, gap: 1, fontSize: 10 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
      lineNumber: 274,
      columnNumber: 9
    }, void 0),
    Array.from({ length: ARP_GRID_COLS }, (_, c) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { textAlign: "center", color: "#555", fontSize: 10 }, children: c + 1 }, c, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
      lineNumber: 276,
      columnNumber: 11
    }, void 0)),
    Array.from({ length: ARP_GRID_ROWS }, (_, rowIdx) => {
      const semitone = ARP_GRID_ROWS - 1 - rowIdx;
      const noteName = noteNames[semitone % 12];
      const isBlackKey = !noteName;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(React.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "#555", textAlign: "right", paddingRight: 2, fontSize: 10, lineHeight: `${cellSize}px` }, children: [
          noteName || "·",
          semitone % 12 === 0 ? Math.floor(semitone / 12) : ""
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
          lineNumber: 285,
          columnNumber: 15
        }, void 0),
        Array.from({ length: ARP_GRID_COLS }, (_2, col) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            onClick: () => toggleCell(col, semitone),
            style: {
              width: cellSize,
              height: cellSize,
              background: steps[col][semitone] ? color : isBlackKey ? "#0a0a0a" : "#111",
              border: `1px solid ${steps[col][semitone] ? color : "#222"}`,
              borderRadius: 1,
              cursor: "pointer"
            }
          },
          col,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 289,
            columnNumber: 17
          },
          void 0
        ))
      ] }, rowIdx, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
        lineNumber: 284,
        columnNumber: 13
      }, void 0);
    })
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
    lineNumber: 272,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
    lineNumber: 271,
    columnNumber: 5
  }, void 0);
};
const GTSoundDesigner = () => {
  const { accent: accentColor, panelBg } = useInstrumentColors("#44ff88", { dim: "#1a3328" });
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const tableData = useGTUltraStore((s) => s.tableData);
  const engine = useGTUltraStore((s) => s.engine);
  const inst = instrumentData[currentInstrument];
  const [activeCategory, setActiveCategory] = reactExports.useState("all");
  const [isAuditioning, setIsAuditioning] = reactExports.useState(false);
  const attack = ((inst == null ? void 0 : inst.ad) ?? 0) >> 4;
  const decay = ((inst == null ? void 0 : inst.ad) ?? 0) & 15;
  const sustain = ((inst == null ? void 0 : inst.sr) ?? 0) >> 4;
  const release = ((inst == null ? void 0 : inst.sr) ?? 0) & 15;
  const waveform = ((inst == null ? void 0 : inst.firstwave) ?? 0) & 254;
  const gate = !!(((inst == null ? void 0 : inst.firstwave) ?? 0) & 1);
  const gateTimerValue = ((inst == null ? void 0 : inst.gatetimer) ?? 0) & 63;
  const hardRestart = !(((inst == null ? void 0 : inst.gatetimer) ?? 0) & 64);
  const vibdelay = (inst == null ? void 0 : inst.vibdelay) ?? 0;
  const waveSteps = reactExports.useMemo(() => {
    if (!(tableData == null ? void 0 : tableData.wave) || !(inst == null ? void 0 : inst.wavePtr)) return [];
    return decodeWaveSequence(tableData.wave.left, tableData.wave.right, inst.wavePtr);
  }, [tableData == null ? void 0 : tableData.wave, inst == null ? void 0 : inst.wavePtr]);
  const pulseSteps = reactExports.useMemo(() => {
    if (!(tableData == null ? void 0 : tableData.pulse) || !(inst == null ? void 0 : inst.pulsePtr)) return [];
    return decodePulseSequence(tableData.pulse.left, tableData.pulse.right, inst.pulsePtr);
  }, [tableData == null ? void 0 : tableData.pulse, inst == null ? void 0 : inst.pulsePtr]);
  const filterSteps = reactExports.useMemo(() => {
    if (!(tableData == null ? void 0 : tableData.filter) || !(inst == null ? void 0 : inst.filterPtr)) return [];
    return decodeFilterSequence(tableData.filter.left, tableData.filter.right, inst.filterPtr);
  }, [tableData == null ? void 0 : tableData.filter, inst == null ? void 0 : inst.filterPtr]);
  const setADSR = reactExports.useCallback((a, d, s, r) => {
    if (!engine) return;
    engine.setInstrumentAD(currentInstrument, encodeAD(a, d));
    engine.setInstrumentSR(currentInstrument, encodeSR(s, r));
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument]);
  const toggleWaveBit = reactExports.useCallback((bit) => {
    if (!engine) return;
    const newWave = ((inst == null ? void 0 : inst.firstwave) ?? 0) ^ bit;
    engine.setInstrumentFirstwave(currentInstrument, newWave);
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument, inst == null ? void 0 : inst.firstwave]);
  const applyPreset = reactExports.useCallback((preset) => {
    if (!engine) return;
    applyPresetToInstrument(preset, currentInstrument, engine, tableData);
    useGTUltraStore.getState().refreshAllInstruments();
    useGTUltraStore.getState().refreshAllTables();
  }, [engine, currentInstrument, tableData]);
  const toggleAudition = reactExports.useCallback(() => {
    if (!engine) return;
    if (isAuditioning) {
      engine.jamNoteOff(0);
      setIsAuditioning(false);
    } else {
      engine.jamNoteOn(0, 37, currentInstrument);
      setIsAuditioning(true);
    }
  }, [engine, isAuditioning, currentInstrument]);
  const writeWaveSteps = reactExports.useCallback((steps) => {
    if (!engine || !(inst == null ? void 0 : inst.wavePtr)) return;
    const { left, right } = encodeWaveSequence(steps);
    const ptr = inst.wavePtr - 1;
    for (let i = 0; i < left.length; i++) {
      engine.setTableEntry(0, 0, ptr + i, left[i]);
      engine.setTableEntry(0, 1, ptr + i, right[i]);
    }
    useGTUltraStore.getState().refreshAllTables();
  }, [engine, inst == null ? void 0 : inst.wavePtr]);
  const addWaveStep = reactExports.useCallback(() => {
    const newSteps = [...waveSteps, {
      waveform: 64,
      gate: true,
      sync: false,
      ring: false,
      delay: 0,
      noteOffset: 128
    }];
    writeWaveSteps(newSteps);
  }, [waveSteps, writeWaveSteps]);
  const removeWaveStep = reactExports.useCallback((idx) => {
    const newSteps = waveSteps.filter((_, i) => i !== idx);
    writeWaveSteps(newSteps);
  }, [waveSteps, writeWaveSteps]);
  const setGateTimer = reactExports.useCallback((v) => {
    var _a;
    if (!engine) return;
    const current = (inst == null ? void 0 : inst.gatetimer) ?? 0;
    (_a = engine.setInstrumentGatetimer) == null ? void 0 : _a.call(engine, currentInstrument, current & 192 | v & 63);
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument, inst == null ? void 0 : inst.gatetimer]);
  const setVibDelay = reactExports.useCallback((v) => {
    var _a;
    if (!engine) return;
    (_a = engine.setInstrumentVibdelay) == null ? void 0 : _a.call(engine, currentInstrument, v);
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument]);
  const SectionLabel2 = ({ label, color }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "text-sm font-bold uppercase tracking-widest mb-1.5",
      style: { color: color ?? accentColor, opacity: 0.7 },
      children: label
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
      lineNumber: 436,
      columnNumber: 5
    },
    void 0
  );
  const filteredPresets = activeCategory === "all" ? SID_PRESETS : getPresetsByCategory(activeCategory);
  const envPath = reactExports.useMemo(() => {
    const ams = ATTACK_MS[attack], dms = DECAY_MS[decay], rms = DECAY_MS[release];
    const sLevel = sustain / 15;
    const totalMs = ams + dms + Math.max(rms, 200);
    if (totalMs === 0) return "";
    const w = 200, h = 60, scale = w / totalMs;
    const x1 = ams * scale, x2 = x1 + dms * scale, x3 = x2 + 200 * scale, x4 = x3 + rms * scale;
    return `M0,${h} L${x1.toFixed(1)},2 L${x2.toFixed(1)},${(h * (1 - sLevel)).toFixed(1)} L${x3.toFixed(1)},${(h * (1 - sLevel)).toFixed(1)} L${x4.toFixed(1)},${h}`;
  }, [attack, decay, sustain, release]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-2 ${panelBg}`, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel2, { label: "Presets" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
          lineNumber: 466,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: toggleAudition,
            className: "px-3 py-1 text-sm font-bold rounded ml-auto",
            style: {
              background: isAuditioning ? "#ff4444" : accentColor,
              color: "#000"
            },
            children: isAuditioning ? "STOP" : "▶ PLAY"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 467,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
        lineNumber: 465,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 mb-2 flex-wrap", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            className: "px-2 py-0.5 text-xs font-mono rounded",
            style: {
              background: activeCategory === "all" ? accentColor : "transparent",
              color: activeCategory === "all" ? "#000" : "#666",
              border: `1px solid ${activeCategory === "all" ? accentColor : "#333"}`
            },
            onClick: () => setActiveCategory("all"),
            children: "All"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 481,
            columnNumber: 11
          },
          void 0
        ),
        getPresetCategories().map((cat) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            className: "px-2 py-0.5 text-xs font-mono rounded",
            style: {
              background: activeCategory === cat ? accentColor : "transparent",
              color: activeCategory === cat ? "#000" : "#666",
              border: `1px solid ${activeCategory === cat ? accentColor : "#333"}`
            },
            onClick: () => setActiveCategory(cat),
            children: CATEGORY_LABELS[cat] || cat
          },
          cat,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 491,
            columnNumber: 13
          },
          void 0
        ))
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
        lineNumber: 480,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 overflow-x-auto pb-1", style: { scrollbarWidth: "thin" }, children: filteredPresets.map((preset, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => applyPreset(preset),
          className: "flex-shrink-0 px-3 py-2 rounded text-left",
          style: {
            background: "#111",
            border: "1px solid #333",
            minWidth: 120
          },
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-bold", style: { color: accentColor }, children: preset.name }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 517,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-secondary mt-0.5", children: preset.description }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 518,
              columnNumber: 15
            }, void 0)
          ]
        },
        i,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
          lineNumber: 507,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
        lineNumber: 505,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
      lineNumber: 464,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-3", style: { gridTemplateColumns: "repeat(3, 1fr)" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel2, { label: "ADSR Envelope" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 532,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "rounded px-1 mb-2", style: { background: "#060a08" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { viewBox: "0 0 200 60", width: "100%", height: 60, preserveAspectRatio: "none", children: envPath && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("path", { d: envPath, fill: "none", stroke: accentColor, strokeWidth: 1.5, opacity: 0.8 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 535,
            columnNumber: 29
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 534,
            columnNumber: 15
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 533,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2", children: [
            { label: "A", value: attack, table: ATTACK_MS, set: (v) => setADSR(v, decay, sustain, release) },
            { label: "D", value: decay, table: DECAY_MS, set: (v) => setADSR(attack, v, sustain, release) },
            { label: "S", value: sustain, table: null, set: (v) => setADSR(attack, decay, v, release) },
            { label: "R", value: release, table: DECAY_MS, set: (v) => setADSR(attack, decay, sustain, v) }
          ].map(({ label, value, table, set }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold text-text-secondary", children: label }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 546,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: 0,
                max: 15,
                value,
                onChange: (e) => set(parseInt(e.target.value)),
                style: { width: "100%", accentColor }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 547,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono", style: { color: accentColor }, children: table ? table[value] >= 1e3 ? `${(table[value] / 1e3).toFixed(1)}s` : `${table[value]}ms` : `${Math.round(value / 15 * 100)}%` }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 550,
              columnNumber: 19
            }, void 0)
          ] }, label, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 545,
            columnNumber: 17
          }, void 0)) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 538,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
          lineNumber: 531,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel2, { label: "Waveform Sequence", color: TABLE_COLORS.wave }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 560,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1.5 mb-3", children: [
            WAVEFORMS.map((wf) => {
              const active = !!(waveform & wf.bit);
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => toggleWaveBit(wf.bit),
                  className: "px-2 py-1 text-sm font-mono rounded",
                  style: {
                    background: active ? TABLE_COLORS.wave : "#111",
                    color: active ? "#000" : "#555",
                    border: `1px solid ${active ? TABLE_COLORS.wave : "#333"}`
                  },
                  children: wf.shortName
                },
                wf.bit,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                  lineNumber: 567,
                  columnNumber: 19
                },
                void 0
              );
            }),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => toggleWaveBit(1),
                className: "px-2 py-1 text-sm font-mono rounded",
                style: {
                  background: gate ? TABLE_COLORS.wave + "40" : "#111",
                  color: gate ? TABLE_COLORS.wave : "#555",
                  border: `1px solid ${gate ? TABLE_COLORS.wave : "#333"}`
                },
                children: "GATE"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 578,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 563,
            columnNumber: 13
          }, void 0),
          waveSteps.length > 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
            waveSteps.map((step, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "div",
              {
                className: "flex items-center gap-2 px-2 py-1 rounded",
                style: { background: "#0a0f0c", border: "1px solid #1a3328" },
                children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono w-4", style: { color: "#555" }, children: i + 1 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                    lineNumber: 595,
                    columnNumber: 21
                  }, void 0),
                  step.isCommand ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono", style: { color: "#888" }, children: [
                    waveCommandLabel(step.cmdByte ?? 0),
                    " $",
                    (step.cmdParam ?? 0).toString(16).toUpperCase().padStart(2, "0")
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                    lineNumber: 597,
                    columnNumber: 23
                  }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-bold", style: { color: TABLE_COLORS.wave }, children: waveformName(step.waveform) }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                      lineNumber: 602,
                      columnNumber: 25
                    }, void 0),
                    step.gate && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs", style: { color: TABLE_COLORS.wave }, children: "G" }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                      lineNumber: 605,
                      columnNumber: 39
                    }, void 0),
                    step.delay > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono text-text-secondary", children: [
                      "+",
                      step.delay,
                      "f"
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                      lineNumber: 607,
                      columnNumber: 27
                    }, void 0),
                    step.noteOffset !== 128 && step.noteOffset !== 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono", style: { color: TABLE_COLORS.speed }, children: [
                      "n:",
                      step.noteOffset.toString(16).toUpperCase()
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                      lineNumber: 612,
                      columnNumber: 27
                    }, void 0)
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                    lineNumber: 601,
                    columnNumber: 23
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "button",
                    {
                      onClick: () => removeWaveStep(i),
                      className: "ml-auto text-xs text-text-secondary hover:text-red-400",
                      children: "x"
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                      lineNumber: 618,
                      columnNumber: 21
                    },
                    void 0
                  )
                ]
              },
              i,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 593,
                columnNumber: 19
              },
              void 0
            )),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: addWaveStep,
                className: "text-xs font-mono py-1 rounded",
                style: { color: TABLE_COLORS.wave, border: `1px dashed ${TABLE_COLORS.wave}40` },
                children: "+ Add Step"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 623,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 591,
            columnNumber: 15
          }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-secondary text-center py-4", children: [
            (inst == null ? void 0 : inst.wavePtr) ? "No wave table data at this pointer" : "No wave table assigned",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("br", {}, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 632,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: addWaveStep,
                className: "mt-2 text-xs font-mono py-1 px-3 rounded",
                style: { color: TABLE_COLORS.wave, border: `1px dashed ${TABLE_COLORS.wave}40` },
                children: "+ Create Wave Sequence"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 633,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 630,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
          lineNumber: 559,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
        lineNumber: 528,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel2, { label: "Pulse Width", color: TABLE_COLORS.pulse }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 647,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            PulseDrawCanvas,
            {
              pulseSteps,
              color: TABLE_COLORS.pulse,
              onDraw: (values) => {
                if (!engine || !(inst == null ? void 0 : inst.pulsePtr)) return;
                const steps = valuesToPulseSteps(values);
                const { left, right } = encodePulseSequence(steps);
                const ptr = inst.pulsePtr - 1;
                for (let i = 0; i < left.length; i++) {
                  engine.setTableEntry(1, 0, ptr + i, left[i]);
                  engine.setTableEntry(1, 1, ptr + i, right[i]);
                }
                useGTUltraStore.getState().refreshAllTables();
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 648,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 mt-2 flex-wrap", children: [
            { label: "50%", steps: [{ type: "set", value: 2048, speed: 0 }] },
            { label: "Sweep ↑", steps: [{ type: "set", value: 512, speed: 0 }, { type: "mod", value: 64, speed: 8 }] },
            { label: "Sweep ↓", steps: [{ type: "set", value: 3584, speed: 0 }, { type: "mod", value: 64, speed: 248 }] },
            { label: "Wobble", steps: [{ type: "set", value: 2048, speed: 0 }, { type: "mod", value: 32, speed: 6 }, { type: "mod", value: 32, speed: 250 }] }
          ].map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              className: "px-2 py-0.5 text-xs font-mono rounded",
              style: { color: TABLE_COLORS.pulse, border: `1px solid ${TABLE_COLORS.pulse}40` },
              onClick: () => {
                if (!engine || !(inst == null ? void 0 : inst.pulsePtr)) return;
                const { left, right } = encodePulseSequence(preset.steps);
                const ptr = inst.pulsePtr - 1;
                for (let i = 0; i < left.length; i++) {
                  engine.setTableEntry(1, 0, ptr + i, left[i]);
                  engine.setTableEntry(1, 1, ptr + i, right[i]);
                }
                useGTUltraStore.getState().refreshAllTables();
              },
              children: preset.label
            },
            preset.label,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 671,
              columnNumber: 17
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 664,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
          lineNumber: 646,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel2, { label: "Filter", color: TABLE_COLORS.filter }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 691,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 mb-2", children: [
            ["LP", "BP", "HP"].map((mode) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                className: "px-3 py-1 text-xs font-mono rounded",
                style: {
                  color: TABLE_COLORS.filter,
                  border: `1px solid ${TABLE_COLORS.filter}40`,
                  background: "#111"
                },
                children: mode
              },
              mode,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 695,
                columnNumber: 17
              },
              void 0
            )),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 ml-auto", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-secondary", children: "Res" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 706,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "range",
                  min: 0,
                  max: 15,
                  defaultValue: 8,
                  style: { width: 60, accentColor: TABLE_COLORS.filter }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                  lineNumber: 707,
                  columnNumber: 17
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 705,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 693,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            FilterDrawCanvas,
            {
              filterSteps,
              color: TABLE_COLORS.filter,
              onDraw: (values) => {
                if (!engine || !(inst == null ? void 0 : inst.filterPtr)) return;
                const steps = valuesToFilterSteps(values);
                const { left, right } = encodeFilterSequence(steps);
                const ptr = inst.filterPtr - 1;
                for (let i = 0; i < left.length; i++) {
                  engine.setTableEntry(2, 0, ptr + i, left[i]);
                  engine.setTableEntry(2, 1, ptr + i, right[i]);
                }
                useGTUltraStore.getState().refreshAllTables();
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 712,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 mt-2 flex-wrap", children: [
            { label: "Sweep ↓", steps: [{ type: "set", value: 144, param: 255 }, { type: "mod", value: 64, param: 252 }] },
            { label: "Sweep ↑", steps: [{ type: "set", value: 144, param: 32 }, { type: "mod", value: 64, param: 4 }] },
            { label: "Wah", steps: [{ type: "set", value: 144, param: 64 }, { type: "mod", value: 16, param: 8 }, { type: "mod", value: 16, param: 248 }] }
          ].map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              className: "px-2 py-0.5 text-xs font-mono rounded",
              style: { color: TABLE_COLORS.filter, border: `1px solid ${TABLE_COLORS.filter}40` },
              onClick: () => {
                if (!engine || !(inst == null ? void 0 : inst.filterPtr)) return;
                const { left, right } = encodeFilterSequence(preset.steps);
                const ptr = inst.filterPtr - 1;
                for (let i = 0; i < left.length; i++) {
                  engine.setTableEntry(2, 0, ptr + i, left[i]);
                  engine.setTableEntry(2, 1, ptr + i, right[i]);
                }
                useGTUltraStore.getState().refreshAllTables();
              },
              children: preset.label
            },
            preset.label,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 734,
              columnNumber: 17
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 728,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
          lineNumber: 690,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
        lineNumber: 643,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel2, { label: "Arpeggio", color: TABLE_COLORS.speed }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 758,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArpGrid, { color: TABLE_COLORS.speed }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 759,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 mt-2 flex-wrap", children: ARP_CHORDS.map((chord) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              className: "px-2 py-0.5 text-xs font-mono rounded",
              style: { color: TABLE_COLORS.speed, border: `1px solid ${TABLE_COLORS.speed}40` },
              onClick: () => {
                if (!engine || !(inst == null ? void 0 : inst.speedPtr)) return;
                const ptr = inst.speedPtr - 1;
                for (let i = 0; i < chord.semitones.length; i++) {
                  engine.setTableEntry(3, 0, ptr + i, 0);
                  engine.setTableEntry(3, 1, ptr + i, chord.semitones[i]);
                }
                engine.setTableEntry(3, 0, ptr + chord.semitones.length, 255);
                engine.setTableEntry(3, 1, ptr + chord.semitones.length, ptr + 1);
                useGTUltraStore.getState().refreshAllTables();
              },
              children: chord.label
            },
            chord.label,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 762,
              columnNumber: 17
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 760,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
          lineNumber: 757,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel2, { label: "Settings" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 784,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-1", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-secondary", children: "Gate Timer" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                  lineNumber: 790,
                  columnNumber: 19
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono", style: { color: accentColor }, children: gateTimerValue }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                  lineNumber: 791,
                  columnNumber: 19
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 789,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "range",
                  min: 0,
                  max: 63,
                  value: gateTimerValue,
                  onChange: (e) => setGateTimer(parseInt(e.target.value)),
                  style: { width: "100%", accentColor }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                  lineNumber: 793,
                  columnNumber: 17
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-secondary opacity-60", children: "Note duration in frames (0 = default)" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 796,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 788,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-1", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-secondary", children: "Vibrato Delay" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                  lineNumber: 804,
                  columnNumber: 19
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono", style: { color: accentColor }, children: vibdelay }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                  lineNumber: 805,
                  columnNumber: 19
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 803,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "range",
                  min: 0,
                  max: 255,
                  value: vibdelay,
                  onChange: (e) => setVibDelay(parseInt(e.target.value)),
                  style: { width: "100%", accentColor }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                  lineNumber: 807,
                  columnNumber: 17
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-secondary opacity-60", children: "Frames before vibrato starts (0 = off)" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 810,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 802,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 cursor-pointer", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "checkbox",
                  checked: hardRestart,
                  onChange: () => {
                    var _a;
                    if (!engine) return;
                    const gt = (inst == null ? void 0 : inst.gatetimer) ?? 0;
                    (_a = engine.setInstrumentGatetimer) == null ? void 0 : _a.call(engine, currentInstrument, gt ^ 64);
                    useGTUltraStore.getState().refreshAllInstruments();
                  },
                  style: { accentColor }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                  lineNumber: 817,
                  columnNumber: 17
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-secondary", children: "Hard Restart" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
                lineNumber: 825,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
              lineNumber: 816,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
            lineNumber: 785,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
          lineNumber: 783,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
        lineNumber: 754,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
      lineNumber: 525,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTSoundDesigner.tsx",
    lineNumber: 461,
    columnNumber: 5
  }, void 0);
};
const RELEASE_MS = DECAY_MS;
const SID_VOICE_REGS = [
  { offset: 0, label: "Freq Lo" },
  { offset: 1, label: "Freq Hi" },
  { offset: 2, label: "PW Lo" },
  { offset: 3, label: "PW Hi" },
  { offset: 4, label: "Control" },
  { offset: 5, label: "AD" },
  { offset: 6, label: "SR" }
];
const SID_GLOBAL_REGS = [
  { offset: 21, label: "FC Lo" },
  { offset: 22, label: "FC Hi" },
  { offset: 23, label: "Res/Filt" },
  { offset: 24, label: "Mode/Vol" }
];
const WAVEFORM_BITS = [
  { bit: 4, label: "TRI", name: "Triangle" },
  { bit: 5, label: "SAW", name: "Sawtooth" },
  { bit: 6, label: "PUL", name: "Pulse" },
  { bit: 7, label: "NOI", name: "Noise" }
];
const WAVEFORM_EXTRAS = [
  { bit: 1, label: "SYNC", name: "Sync" },
  { bit: 2, label: "RING", name: "Ring Mod" },
  { bit: 3, label: "TEST", name: "Test Bit" }
];
const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, "0");
const makeTableCol = (color) => [
  { key: "left", label: "L", charWidth: 2, type: "hex", hexDigits: 2, color, emptyColor: "#334", emptyValue: 0, formatter: hex2 },
  { key: "right", label: "R", charWidth: 2, type: "hex", hexDigits: 2, color, emptyColor: "#334", emptyValue: 0, formatter: hex2 }
];
const TABLE_DEFS = [
  { key: "wave", label: "Wave", color: "#60e060", ptrKey: "wavePtr", cols: makeTableCol("#60e060") },
  { key: "pulse", label: "Pulse", color: "#ff8866", ptrKey: "pulsePtr", cols: makeTableCol("#ff8866") },
  { key: "filter", label: "Filter", color: "#ffcc00", ptrKey: "filterPtr", cols: makeTableCol("#ffcc00") },
  { key: "speed", label: "Speed", color: "#6699ff", ptrKey: "speedPtr", cols: makeTableCol("#6699ff") }
];
const EFFECT_REF = [
  "0=NOP",
  "1=PortaUp",
  "2=PortaDn",
  "3=TonePorta",
  "4=Vibrato",
  "5=SetAD",
  "6=SetSR",
  "7=SetWave",
  "8=WavPtr",
  "9=PulPtr",
  "A=FilPtr",
  "B=FilCtrl",
  "C=Cutoff",
  "D=MasVol",
  "E=FunkTmp",
  "F=Tempo"
];
const WAVE_CMD_REF = [
  "01-0F=Delay",
  "10-DF=Waveform",
  "E0-EF=Silent",
  "F0=NOP",
  "F1=PortaUp",
  "F2=PortaDn",
  "F3=TonePorta",
  "F4=Vibrato",
  "F5=SetAD",
  "F6=SetSR",
  "F7=SetWave",
  "F9=PulPtr",
  "FA=FilPtr",
  "FB=FilCtrl",
  "FC=Cutoff",
  "FD=MasVol",
  "FF=Jump"
];
const GTUltraControls = ({
  config: _config,
  instrumentId: _instrumentId,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("instrument");
  const [showEffectRef, setShowEffectRef] = reactExports.useState(false);
  const [showTableRef, setShowTableRef] = reactExports.useState(false);
  const { isCyan: isCyanTheme, accent: accentColor, dim: dimColor, panelBg, panelStyle } = useInstrumentColors("#44ff88", { dim: "#1a3328" });
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const inst = instrumentData[currentInstrument];
  const config = reactExports.useMemo(() => ({
    ..._config,
    ad: (inst == null ? void 0 : inst.ad) ?? _config.ad,
    sr: (inst == null ? void 0 : inst.sr) ?? _config.sr,
    firstwave: (inst == null ? void 0 : inst.firstwave) ?? _config.firstwave,
    gatetimer: (inst == null ? void 0 : inst.gatetimer) ?? _config.gatetimer,
    vibdelay: (inst == null ? void 0 : inst.vibdelay) ?? _config.vibdelay,
    wavePtr: (inst == null ? void 0 : inst.wavePtr) ?? _config.wavePtr,
    pulsePtr: (inst == null ? void 0 : inst.pulsePtr) ?? _config.pulsePtr,
    filterPtr: (inst == null ? void 0 : inst.filterPtr) ?? _config.filterPtr,
    speedPtr: (inst == null ? void 0 : inst.speedPtr) ?? _config.speedPtr
  }), [_config, inst]);
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const sidRegisters = useGTUltraStore((s) => s.sidRegisters);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const tableData = useGTUltraStore((s) => s.tableData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const isPlaying = useGTUltraStore((s) => s.playing);
  const attack = config.ad >> 4 & 15;
  const decay = config.ad & 15;
  const sustain = config.sr >> 4 & 15;
  const release = config.sr & 15;
  const gate = !!(config.firstwave & 1);
  const gateTimerValue = config.gatetimer & 63;
  const hardRestartEnabled = !(config.gatetimer & 64);
  const hardRestartImmediate = !!(config.gatetimer & 128);
  const panVal = config.pan ?? 136;
  const panMin = panVal >> 4 & 15;
  const panMax = panVal & 15;
  const setAttack = reactExports.useCallback((v) => {
    const c = configRef.current;
    onChange({ ad: v << 4 | c.ad & 15 });
  }, [onChange]);
  const setDecay = reactExports.useCallback((v) => {
    const c = configRef.current;
    onChange({ ad: c.ad & 240 | v });
  }, [onChange]);
  const setSustain = reactExports.useCallback((v) => {
    const c = configRef.current;
    onChange({ sr: v << 4 | c.sr & 15 });
  }, [onChange]);
  const setRelease = reactExports.useCallback((v) => {
    const c = configRef.current;
    onChange({ sr: c.sr & 240 | v });
  }, [onChange]);
  const toggleWaveBit = reactExports.useCallback((bit) => {
    onChange({ firstwave: configRef.current.firstwave ^ 1 << bit });
  }, [onChange]);
  const toggleGate = reactExports.useCallback(() => {
    onChange({ firstwave: configRef.current.firstwave ^ 1 });
  }, [onChange]);
  const AdsrSlider = ({ label, value, timeMs, onValueChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5", style: { width: 36 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono", style: { color: accentColor }, children: value.toString(16).toUpperCase() }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
      lineNumber: 174,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "input",
      {
        type: "range",
        min: 0,
        max: 15,
        step: 1,
        value,
        onChange: (e) => onValueChange(parseInt(e.target.value)),
        style: { writingMode: "vertical-lr", direction: "rtl", width: 20, height: 64, accentColor }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
        lineNumber: 175,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-bold text-text-secondary", children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
      lineNumber: 178,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] text-text-secondary font-mono", children: timeMs >= 1e3 ? `${(timeMs / 1e3).toFixed(1)}s` : `${timeMs}ms` }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
      lineNumber: 179,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
    lineNumber: 173,
    columnNumber: 5
  }, void 0);
  const renderInstrumentTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "grid gap-3 p-3 overflow-y-auto synth-controls-flow",
      style: { maxHeight: "calc(100vh - 280px)", gridTemplateColumns: "repeat(3, 1fr)" },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: "ADSR Envelope" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 195,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            EnvelopeVisualization,
            {
              mode: "sid",
              attack,
              decay,
              sustain,
              release,
              width: "auto",
              height: 72,
              color: accentColor,
              backgroundColor: "#060a08",
              border: "none"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 196,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AdsrSlider, { label: "A", value: attack, timeMs: ATTACK_MS[attack], onValueChange: setAttack }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 209,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AdsrSlider, { label: "D", value: decay, timeMs: DECAY_MS[decay], onValueChange: setDecay }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 210,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AdsrSlider, { label: "S", value: sustain, timeMs: 0, onValueChange: setSustain }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 211,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AdsrSlider, { label: "R", value: release, timeMs: RELEASE_MS[release], onValueChange: setRelease }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 212,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 208,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-secondary text-center mt-1 font-mono", children: [
            "AD=$",
            hex2(config.ad),
            " SR=$",
            hex2(config.sr)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 214,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
          lineNumber: 194,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: "Waveform" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 221,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1.5 mb-2", children: WAVEFORM_BITS.map(({ bit, label }) => {
            const active = !!(config.firstwave & 1 << bit);
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => toggleWaveBit(bit),
                className: "px-2.5 py-1 text-xs font-mono rounded transition-colors",
                style: {
                  background: active ? accentColor : "#111",
                  color: active ? "#000" : "#666",
                  border: `1px solid ${active ? accentColor : "var(--color-border-light)"}`
                },
                children: label
              },
              bit,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 226,
                columnNumber: 15
              },
              void 0
            );
          }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 222,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1.5 cursor-pointer", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("input", { type: "checkbox", checked: gate, onChange: toggleGate, style: { accentColor } }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 237,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-secondary", children: "Gate on" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 238,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 236,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono text-text-secondary ml-auto", children: [
              "$",
              hex2(config.firstwave)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 240,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 235,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 mt-2", children: WAVEFORM_EXTRAS.map(({ bit, label, name }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1 cursor-pointer", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: !!(config.firstwave & 1 << bit),
                onChange: () => toggleWaveBit(bit),
                style: { accentColor }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 245,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-secondary", title: name, children: label }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 247,
              columnNumber: 15
            }, void 0)
          ] }, bit, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 244,
            columnNumber: 13
          }, void 0)) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 242,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
          lineNumber: 220,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: "Timing" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 256,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                NumBox,
                {
                  label: "Gate Timer",
                  value: gateTimerValue,
                  min: 0,
                  max: 63,
                  hex: true,
                  color: accentColor,
                  borderColor: dimColor,
                  background: "#0a0f0c",
                  onValueChange: (v) => onChange({ gatetimer: configRef.current.gatetimer & 192 | v & 63 })
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                  lineNumber: 258,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 ml-[84px]", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1 cursor-pointer", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "input",
                    {
                      type: "checkbox",
                      checked: hardRestartEnabled,
                      onChange: () => onChange({ gatetimer: configRef.current.gatetimer ^ 64 }),
                      style: { accentColor }
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                      lineNumber: 263,
                      columnNumber: 17
                    },
                    void 0
                  ),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-secondary", children: "Hard Restart" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                    lineNumber: 265,
                    columnNumber: 17
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                  lineNumber: 262,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1 cursor-pointer", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "input",
                    {
                      type: "checkbox",
                      checked: hardRestartImmediate,
                      onChange: () => onChange({ gatetimer: configRef.current.gatetimer ^ 128 }),
                      style: { accentColor }
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                      lineNumber: 268,
                      columnNumber: 17
                    },
                    void 0
                  ),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-secondary", children: "Immediate" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                    lineNumber: 270,
                    columnNumber: 17
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                  lineNumber: 267,
                  columnNumber: 15
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 261,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                NumBox,
                {
                  label: "Vibrato Delay",
                  value: config.vibdelay,
                  min: 0,
                  max: 255,
                  hex: true,
                  color: accentColor,
                  borderColor: dimColor,
                  background: "#0a0f0c",
                  onValueChange: (v) => onChange({ vibdelay: v })
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                  lineNumber: 273,
                  columnNumber: 13
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 257,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 255,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: "Panning" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 280,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-secondary w-12 text-right", children: "Min" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                  lineNumber: 283,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "input",
                  {
                    type: "range",
                    min: 0,
                    max: 15,
                    value: panMin,
                    onChange: (e) => onChange({ pan: parseInt(e.target.value) << 4 | panMax }),
                    style: { flex: 1, accentColor }
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                    lineNumber: 284,
                    columnNumber: 15
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono w-4", style: { color: accentColor }, children: panMin.toString(16).toUpperCase() }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                  lineNumber: 287,
                  columnNumber: 15
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 282,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-secondary w-12 text-right", children: "Max" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                  lineNumber: 290,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "input",
                  {
                    type: "range",
                    min: 0,
                    max: 15,
                    value: panMax,
                    onChange: (e) => onChange({ pan: panMin << 4 | parseInt(e.target.value) }),
                    style: { flex: 1, accentColor }
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                    lineNumber: 291,
                    columnNumber: 15
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono w-4", style: { color: accentColor }, children: panMax.toString(16).toUpperCase() }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                  lineNumber: 294,
                  columnNumber: 15
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 289,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-secondary opacity-60 ml-14", children: "0=Left 8=Center F=Right" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 296,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 281,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 279,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
          lineNumber: 254,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: "Table Pointers" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 304,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NumBox, { label: "Wave Table", value: config.wavePtr, min: 0, max: 255, hex: true, color: accentColor, borderColor: dimColor, background: "#0a0f0c", onValueChange: (v) => onChange({ wavePtr: v }) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 306,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NumBox, { label: "Pulse Table", value: config.pulsePtr, min: 0, max: 255, hex: true, color: accentColor, borderColor: dimColor, background: "#0a0f0c", onValueChange: (v) => onChange({ pulsePtr: v }) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 307,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NumBox, { label: "Filter Table", value: config.filterPtr, min: 0, max: 255, hex: true, color: accentColor, borderColor: dimColor, background: "#0a0f0c", onValueChange: (v) => onChange({ filterPtr: v }) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 308,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NumBox, { label: "Speed Table", value: config.speedPtr, min: 0, max: 255, hex: true, color: accentColor, borderColor: dimColor, background: "#0a0f0c", onValueChange: (v) => onChange({ speedPtr: v }) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 309,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 305,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-secondary mt-1.5 opacity-60", children: "0 = disabled. Edit in Tables tab." }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 311,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 303,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                className: "text-[10px] font-bold uppercase tracking-widest w-full text-left",
                style: { color: accentColor, opacity: 0.7 },
                onClick: () => setShowEffectRef(!showEffectRef),
                children: [
                  showEffectRef ? "[-]" : "[+]",
                  " Pattern Effects"
                ]
              },
              void 0,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 315,
                columnNumber: 11
              },
              void 0
            ),
            showEffectRef && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 font-mono text-[9px]", children: EFFECT_REF.map((r) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#999" }, children: r }, r, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 321,
              columnNumber: 38
            }, void 0)) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 320,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 314,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
          lineNumber: 302,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
      lineNumber: 190,
      columnNumber: 5
    },
    void 0
  );
  const allTableChannels = reactExports.useMemo(() => {
    return TABLE_DEFS.map((td) => {
      const tbl = tableData == null ? void 0 : tableData[td.key];
      const rows = [];
      for (let i = 0; i < 255; i++) {
        rows.push({ left: (tbl == null ? void 0 : tbl.left[i]) ?? 0, right: (tbl == null ? void 0 : tbl.right[i]) ?? 0 });
      }
      return { label: td.label, patternLength: 255, rows, isPatternChannel: false };
    });
  }, [tableData]);
  const makeTableCellChange = reactExports.useCallback((tableIdx) => {
    return (_ch, row, colKey, value) => {
      const engine = useGTUltraStore.getState().engine;
      if (!engine) return;
      const side = colKey === "left" ? 0 : 1;
      engine.setTableEntry(tableIdx, side, row, value);
      const refresh = useGTUltraStore.getState().refreshAllTables;
      if (refresh) refresh();
    };
  }, []);
  const liveTablePos = reactExports.useMemo(() => {
    var _a;
    const packed = ((_a = playbackPos.tablePositions) == null ? void 0 : _a[0]) ?? 0;
    return {
      wave: packed & 255,
      pulse: packed >> 8 & 255,
      filter: packed >> 16 & 255,
      speed: 0
      // speed table has no position tracker
    };
  }, [playbackPos.tablePositions]);
  const renderTablesTab = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 min-h-0 gap-px", style: { background: "#111" }, children: TABLE_DEFS.map((td, i) => {
      const ptr = config[td.ptrKey] ?? 0;
      const livePos = isPlaying ? liveTablePos[td.key] ?? 0 : 0;
      const currentRow = isPlaying && livePos > 0 ? livePos : 0;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 px-1 py-0.5", style: { background: "#060a08" }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-bold uppercase", style: { color: td.color }, children: td.label }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 380,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] font-mono", style: { color: td.color, opacity: 0.6 }, children: [
            "$",
            hex2(ptr),
            isPlaying && livePos > 0 ? ` @${hex2(livePos)}` : ""
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 381,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
          lineNumber: 379,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 0 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          PatternEditorCanvas,
          {
            formatColumns: td.cols,
            formatChannels: [allTableChannels[i]],
            formatCurrentRow: currentRow,
            formatIsPlaying: isPlaying,
            onFormatCellChange: makeTableCellChange(i),
            hideVUMeters: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 386,
            columnNumber: 17
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
          lineNumber: 385,
          columnNumber: 15
        }, void 0)
      ] }, td.key, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
        lineNumber: 378,
        columnNumber: 13
      }, void 0);
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
      lineNumber: 370,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-2 py-1 border-t", style: { borderColor: dimColor }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          className: "text-[9px] font-mono w-full text-left",
          style: { color: "#666" },
          onClick: () => setShowTableRef(!showTableRef),
          children: [
            showTableRef ? "[-]" : "[+]",
            " Wave Table Commands"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
          lineNumber: 402,
          columnNumber: 9
        },
        void 0
      ),
      showTableRef && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 font-mono text-[8px]", children: WAVE_CMD_REF.map((r) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#777" }, children: r }, r, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
        lineNumber: 408,
        columnNumber: 38
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
        lineNumber: 407,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
      lineNumber: 401,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
    lineNumber: 368,
    columnNumber: 5
  }, void 0);
  reactExports.useEffect(() => {
    if (activeTab !== "monitor") return;
    useGTUltraStore.getState().refreshSidRegisters();
    const id = setInterval(() => {
      useGTUltraStore.getState().refreshSidRegisters();
    }, 66);
    return () => clearInterval(id);
  }, [activeTab]);
  const renderMonitorTab = () => {
    const chipCount = sidCount ?? 1;
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow", style: { maxHeight: "calc(100vh - 280px)" }, children: Array.from({ length: chipCount }, (_, chipIdx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      chipCount > 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accentColor, label: `SID ${chipIdx + 1}` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
        lineNumber: 436,
        columnNumber: 31
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-xs", style: { lineHeight: "1.6" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-3", style: { gridTemplateColumns: "repeat(4, 1fr)" }, children: [
        [0, 1, 2].map((voice) => {
          const base = voice * 7;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold mb-1", style: { color: accentColor, opacity: 0.6 }, children: [
              "Voice ",
              voice + 1
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 444,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-x-2", style: { gridTemplateColumns: "auto 1fr" }, children: SID_VOICE_REGS.map(({ offset, label }) => {
              var _a;
              const reg = base + offset, val = ((_a = sidRegisters[chipIdx]) == null ? void 0 : _a[reg]) ?? 0;
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(React.Fragment, { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary text-right", children: label }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                  lineNumber: 449,
                  columnNumber: 29
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: val > 0 ? accentColor : "#444" }, children: hex2(val) }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                  lineNumber: 450,
                  columnNumber: 29
                }, void 0)
              ] }, reg, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 448,
                columnNumber: 35
              }, void 0);
            }) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 445,
              columnNumber: 23
            }, void 0)
          ] }, voice, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 443,
            columnNumber: 21
          }, void 0);
        }),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold mb-1", style: { color: accentColor, opacity: 0.6 }, children: "Filter" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 458,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-x-2", style: { gridTemplateColumns: "auto 1fr" }, children: SID_GLOBAL_REGS.map(({ offset, label }) => {
            var _a;
            const val = ((_a = sidRegisters[chipIdx]) == null ? void 0 : _a[offset]) ?? 0;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(React.Fragment, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary text-right", children: label }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 463,
                columnNumber: 25
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: val > 0 ? accentColor : "#444" }, children: hex2(val) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
                lineNumber: 464,
                columnNumber: 25
              }, void 0)
            ] }, offset, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
              lineNumber: 462,
              columnNumber: 31
            }, void 0);
          }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
            lineNumber: 459,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
          lineNumber: 457,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
        lineNumber: 439,
        columnNumber: 15
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
        lineNumber: 437,
        columnNumber: 13
      }, void 0)
    ] }, chipIdx, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
      lineNumber: 435,
      columnNumber: 11
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
      lineNumber: 433,
      columnNumber: 7
    }, void 0);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dimColor }, children: [["instrument", "Instrument"], ["designer", "Sound Designer"], ["tables", "Tables"], ["monitor", "SID Monitor"]].map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(id),
        className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
        style: {
          color: activeTab === id ? accentColor : "#666",
          borderBottom: activeTab === id ? `2px solid ${accentColor}` : "2px solid transparent",
          background: activeTab === id ? isCyanTheme ? "#041510" : "#0a1a12" : "transparent"
        },
        children: label
      },
      id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
        lineNumber: 484,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
      lineNumber: 482,
      columnNumber: 7
    }, void 0),
    activeTab === "instrument" && renderInstrumentTab(),
    activeTab === "designer" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GTSoundDesigner, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
      lineNumber: 494,
      columnNumber: 36
    }, void 0),
    activeTab === "tables" && renderTablesTab(),
    activeTab === "monitor" && renderMonitorTab()
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GTUltraControls.tsx",
    lineNumber: 481,
    columnNumber: 5
  }, void 0);
};
export {
  GTUltraControls
};
