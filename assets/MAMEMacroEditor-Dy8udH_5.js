import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, h as ChevronDown, p as Trash2 } from "./vendor-ui-AJ7AT9BN.js";
import { c$ as MacroType, $ as getToneEngine } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MACRO_TYPE_INFO = {
  [MacroType.VOLUME]: {
    label: "Volume",
    min: 0,
    max: 127,
    signed: false,
    color: "#00d4aa",
    description: "Volume envelope (0-127)"
  },
  [MacroType.ARPEGGIO]: {
    label: "Arpeggio",
    min: -24,
    max: 24,
    signed: true,
    color: "#ff6b6b",
    description: "Semitone offset (-24 to +24)"
  },
  [MacroType.DUTY]: {
    label: "Duty/Wave",
    min: 0,
    max: 7,
    signed: false,
    color: "#ffd93d",
    description: "Duty cycle or wave mode"
  },
  [MacroType.WAVETABLE]: {
    label: "Wavetable",
    min: 0,
    max: 63,
    signed: false,
    color: "#6bcbff",
    description: "Wavetable index select"
  },
  [MacroType.PITCH]: {
    label: "Pitch",
    min: -128,
    max: 127,
    signed: true,
    color: "#c56bff",
    description: "Fine pitch offset (cents)"
  },
  [MacroType.PANNING]: {
    label: "Panning",
    min: -127,
    max: 127,
    signed: true,
    color: "#ff9f43",
    description: "Left/Right panning"
  },
  [MacroType.PHASE_RESET]: {
    label: "Phase Reset",
    min: 0,
    max: 1,
    signed: false,
    color: "#ff6b9d",
    description: "Trigger phase reset (0/1)"
  },
  [MacroType.ALG]: {
    label: "Algorithm",
    min: 0,
    max: 7,
    signed: false,
    color: "#4ecdc4",
    description: "FM algorithm select"
  },
  [MacroType.FB]: {
    label: "Feedback",
    min: 0,
    max: 7,
    signed: false,
    color: "#45b7d1",
    description: "FM feedback amount"
  }
};
const MACRO_PRESETS = {
  // Volume presets
  "vol-sustain": { name: "Sustain", data: [127], loop: 0 },
  "vol-decay": { name: "Decay", data: [127, 100, 80, 64, 50, 40, 32, 25, 20, 15, 10, 5, 0] },
  "vol-pluck": { name: "Pluck", data: [127, 80, 50, 30, 15, 5, 0] },
  "vol-swell": { name: "Swell", data: [0, 10, 25, 45, 70, 100, 127], loop: 6 },
  "vol-tremolo": { name: "Tremolo", data: [127, 100, 80, 100, 127, 100, 80, 100], loop: 0 },
  // Arpeggio presets
  "arp-maj": { name: "Major", data: [0, 4, 7], loop: 0 },
  "arp-min": { name: "Minor", data: [0, 3, 7], loop: 0 },
  "arp-oct": { name: "Octave", data: [0, 12], loop: 0 },
  "arp-5th": { name: "Fifth", data: [0, 7], loop: 0 },
  "arp-dim": { name: "Dim", data: [0, 3, 6], loop: 0 },
  // Pitch presets
  "pitch-vibrato": { name: "Vibrato", data: [0, 5, 10, 5, 0, -5, -10, -5], loop: 0 },
  "pitch-wobble": { name: "Wobble", data: [0, 15, 0, -15], loop: 0 },
  "pitch-slide-up": { name: "Slide Up", data: [0, 5, 10, 15, 20, 25, 30] },
  "pitch-slide-dn": { name: "Slide Down", data: [0, -5, -10, -15, -20, -25, -30] },
  // Duty presets
  "duty-cycle": { name: "Cycle", data: [0, 1, 2, 3], loop: 0 },
  "duty-pulse": { name: "Pulse", data: [0, 1, 0, 1, 2, 1], loop: 0 }
};
function SingleMacroEditor({
  macro,
  onChange,
  label,
  min = 0,
  max = 127,
  signed = false,
  color = "#00d4aa",
  height = 80
}) {
  const canvasRef = reactExports.useRef(null);
  const [isDragging, setIsDragging] = reactExports.useState(false);
  const [selectedStep, setSelectedStep] = reactExports.useState(null);
  const { isCyan: isCyanTheme, accent: effectiveColor } = useInstrumentColors(color);
  const bgColor = isCyanTheme ? "#030808" : "#0a0a0b";
  const gridColor = isCyanTheme ? "rgba(0, 255, 255, 0.08)" : "rgba(100, 100, 120, 0.15)";
  const textColor = isCyanTheme ? "#00ffff" : "#888";
  const data = macro.data.length > 0 ? macro.data : [signed ? 0 : Math.floor(max / 2)];
  const length = data.length;
  const drawMacro = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = Math.max(200, length * 12);
    const logicalHeight = height;
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    canvas.style.width = logicalWidth + "px";
    canvas.style.height = logicalHeight + "px";
    ctx.scale(dpr, dpr);
    const w = logicalWidth;
    const h = logicalHeight;
    const pad = 2;
    const stepWidth = (w - pad * 2) / Math.max(1, length);
    const range = max - min;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (h - pad * 2) * i / 4;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }
    if (signed) {
      ctx.strokeStyle = isCyanTheme ? "rgba(0, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.2)";
      ctx.beginPath();
      ctx.moveTo(pad, h / 2);
      ctx.lineTo(w - pad, h / 2);
      ctx.stroke();
    }
    if (macro.loop >= 0 && macro.loop < length) {
      const loopX = pad + macro.loop * stepWidth;
      ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
      ctx.fillRect(loopX, 0, w - loopX, h);
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(loopX, 0);
      ctx.lineTo(loopX, h);
      ctx.stroke();
    }
    if (macro.release >= 0 && macro.release < length) {
      const relX = pad + macro.release * stepWidth;
      ctx.strokeStyle = "#ff6600";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(relX, 0);
      ctx.lineTo(relX, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (let i = 0; i < length; i++) {
      const x = pad + i * stepWidth;
      const val = data[i];
      const normalizedVal = (val - min) / range;
      const barH = normalizedVal * (h - pad * 2);
      if (signed) {
        const centerY = h / 2;
        const barTop = val >= 0 ? centerY - (normalizedVal - 0.5) * (h - pad * 2) : centerY;
        const barHeight = Math.abs(val) / (max - min) * (h - pad * 2);
        ctx.fillStyle = selectedStep === i ? "#ffffff" : effectiveColor;
        ctx.fillRect(x + 1, barTop, stepWidth - 2, barHeight);
      } else {
        ctx.fillStyle = selectedStep === i ? "#ffffff" : effectiveColor;
        ctx.fillRect(x + 1, h - pad - barH, stepWidth - 2, barH);
      }
      if (i % 8 === 0) {
        ctx.fillStyle = textColor;
        ctx.font = "8px monospace";
        ctx.fillText(String(i), x + 2, h - 2);
      }
    }
  }, [data, length, height, min, max, signed, macro.loop, macro.release, selectedStep, effectiveColor, bgColor, gridColor, textColor, isCyanTheme]);
  reactExports.useEffect(() => {
    drawMacro();
  }, [drawMacro]);
  const getStepFromEvent = reactExports.useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const stepWidth = rect.width / length;
    return Math.floor(x / stepWidth);
  }, [length]);
  const getValueFromEvent = reactExports.useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const normalizedY = 1 - y / rect.height;
    const range = max - min;
    return Math.round(min + normalizedY * range);
  }, [min, max]);
  const handleMouseDown = reactExports.useCallback((e) => {
    const step = getStepFromEvent(e);
    const value = getValueFromEvent(e);
    if (step === null || step < 0 || step >= length) return;
    setIsDragging(true);
    setSelectedStep(step);
    const newData = [...data];
    newData[step] = Math.max(min, Math.min(max, value));
    onChange({ ...macro, data: newData });
  }, [getStepFromEvent, getValueFromEvent, data, length, min, max, onChange, macro]);
  const handleMouseMove = reactExports.useCallback((e) => {
    if (!isDragging) return;
    const step = getStepFromEvent(e);
    const value = getValueFromEvent(e);
    if (step === null || step < 0 || step >= length) return;
    setSelectedStep(step);
    const newData = [...data];
    newData[step] = Math.max(min, Math.min(max, value));
    onChange({ ...macro, data: newData });
  }, [isDragging, getStepFromEvent, getValueFromEvent, data, length, min, max, onChange, macro]);
  const handleMouseUp = reactExports.useCallback(() => {
    setIsDragging(false);
    setSelectedStep(null);
  }, []);
  const addStep = reactExports.useCallback(() => {
    const newData = [...data, data[data.length - 1] || 0];
    onChange({ ...macro, data: newData });
  }, [data, onChange, macro]);
  const removeStep = reactExports.useCallback(() => {
    if (data.length <= 1) return;
    const newData = data.slice(0, -1);
    const newLoop = macro.loop >= newData.length ? newData.length - 1 : macro.loop;
    const newRelease = macro.release >= newData.length ? -1 : macro.release;
    onChange({ ...macro, data: newData, loop: newLoop, release: newRelease });
  }, [data, onChange, macro]);
  const clearMacro = reactExports.useCallback(() => {
    const defaultVal = signed ? 0 : Math.floor(max / 2);
    onChange({ ...macro, data: [defaultVal], loop: -1, release: -1 });
  }, [onChange, macro, signed, max]);
  const setLoopPoint = reactExports.useCallback(() => {
    if (selectedStep !== null) {
      onChange({ ...macro, loop: macro.loop === selectedStep ? -1 : selectedStep });
    }
  }, [selectedStep, onChange, macro]);
  const setReleasePoint = reactExports.useCallback(() => {
    if (selectedStep !== null) {
      onChange({ ...macro, release: macro.release === selectedStep ? -1 : selectedStep });
    }
  }, [selectedStep, onChange, macro]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono uppercase tracking-wider", style: { color: effectiveColor }, children: label }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
        lineNumber: 380,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-slate-500", children: [
          length,
          " steps"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
          lineNumber: 384,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: addStep,
            className: "px-1 py-0.5 text-[9px] bg-dark-surface hover:bg-dark-border rounded",
            title: "Add step",
            children: "+"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
            lineNumber: 385,
            columnNumber: 11
          },
          this
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: removeStep,
            className: "px-1 py-0.5 text-[9px] bg-dark-surface hover:bg-dark-border rounded",
            title: "Remove step",
            children: "-"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
            lineNumber: 390,
            columnNumber: 11
          },
          this
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: setLoopPoint,
            className: "px-1 py-0.5 text-[9px] bg-green-900/50 hover:bg-green-800/50 rounded",
            title: "Set loop point",
            children: "L"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
            lineNumber: 395,
            columnNumber: 11
          },
          this
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: setReleasePoint,
            className: "px-1 py-0.5 text-[9px] bg-orange-900/50 hover:bg-orange-800/50 rounded",
            title: "Set release point",
            children: "R"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
            lineNumber: 400,
            columnNumber: 11
          },
          this
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: clearMacro,
            className: "px-1 py-0.5 text-[9px] bg-red-900/50 hover:bg-red-800/50 rounded",
            title: "Clear",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Trash2, { size: 10 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
              lineNumber: 410,
              columnNumber: 13
            }, this)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
            lineNumber: 405,
            columnNumber: 11
          },
          this
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
        lineNumber: 383,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
      lineNumber: 379,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative overflow-x-auto", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "canvas",
      {
        ref: canvasRef,
        className: "cursor-crosshair rounded",
        onMouseDown: handleMouseDown,
        onMouseMove: handleMouseMove,
        onMouseUp: handleMouseUp,
        onMouseLeave: handleMouseUp
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
        lineNumber: 417,
        columnNumber: 9
      },
      this
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
      lineNumber: 416,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
    lineNumber: 377,
    columnNumber: 5
  }, this);
}
function MAMEMacroEditor({
  instrumentId,
  macros,
  onChange,
  chipCapabilities = {}
}) {
  const [presetMenuOpen, setPresetMenuOpen] = reactExports.useState(null);
  const { isCyan: isCyanTheme } = useInstrumentColors("#00d4aa");
  const availableMacroTypes = reactExports.useMemo(() => {
    const types = [MacroType.VOLUME, MacroType.ARPEGGIO, MacroType.PITCH];
    if (chipCapabilities.hasWavetable) {
      types.push(MacroType.WAVETABLE);
    }
    if (chipCapabilities.hasNoise) {
      types.push(MacroType.DUTY);
    }
    if (chipCapabilities.hasPanning) {
      types.push(MacroType.PANNING);
    }
    if (chipCapabilities.hasFM) {
      types.push(MacroType.ALG, MacroType.FB);
    }
    types.push(MacroType.PHASE_RESET);
    return types;
  }, [chipCapabilities]);
  const getMacro = reactExports.useCallback((type) => {
    const existing = macros.find((m) => m.type === type);
    if (existing) return existing;
    const info = MACRO_TYPE_INFO[type];
    const defaultVal = (info == null ? void 0 : info.signed) ? 0 : (info == null ? void 0 : info.max) || 127;
    return {
      type,
      data: [defaultVal],
      loop: -1,
      release: -1
    };
  }, [macros]);
  const updateMacro = reactExports.useCallback((type, macro) => {
    const newMacros = macros.filter((m) => m.type !== type);
    newMacros.push(macro);
    onChange(newMacros);
    const engine = getToneEngine();
    const synth = engine.getMAMEChipSynth(instrumentId);
    if (synth) {
      synth.setMacro({
        type: macro.type,
        data: macro.data,
        loop: macro.loop,
        release: macro.release
      });
    }
  }, [macros, onChange, instrumentId]);
  const applyPreset = reactExports.useCallback((type, presetKey) => {
    const preset = MACRO_PRESETS[presetKey];
    if (!preset) return;
    const macro = getMacro(type);
    updateMacro(type, {
      ...macro,
      data: [...preset.data],
      loop: preset.loop ?? -1
    });
    setPresetMenuOpen(null);
  }, [getMacro, updateMacro]);
  const getPresetsForType = reactExports.useCallback((type) => {
    const prefix = type === MacroType.VOLUME ? "vol-" : type === MacroType.ARPEGGIO ? "arp-" : type === MacroType.PITCH ? "pitch-" : type === MacroType.DUTY ? "duty-" : "";
    return Object.keys(MACRO_PRESETS).filter((k) => k.startsWith(prefix));
  }, []);
  const panelBg = isCyanTheme ? "linear-gradient(180deg, #0a1515 0%, #050c0c 100%)" : "linear-gradient(180deg, #1e1e1e 0%, #151515 100%)";
  const borderColor = isCyanTheme ? "rgba(0, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.08)";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "rounded-lg overflow-hidden",
      style: { background: panelBg, border: `1px solid ${borderColor}` },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "px-3 py-2 flex items-center justify-between border-b",
            style: { borderColor },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "span",
                {
                  className: "text-xs font-semibold uppercase tracking-wider",
                  style: { color: isCyanTheme ? "#00ffff" : "#e2e8f0" },
                  children: "Macros"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                  lineNumber: 537,
                  columnNumber: 9
                },
                this
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-slate-500", children: [
                macros.filter((m) => m.data.length > 1).length,
                " active"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                lineNumber: 543,
                columnNumber: 9
              }, this)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
            lineNumber: 533,
            columnNumber: 7
          },
          this
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 grid gap-2", style: { gridTemplateColumns: `repeat(auto-fill, minmax(180px, 1fr))` }, children: availableMacroTypes.map((type) => {
          const info = MACRO_TYPE_INFO[type];
          if (!info) return null;
          const macro = getMacro(type);
          const isActive = macro.data.length > 1;
          const presets = getPresetsForType(type);
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "rounded border flex flex-col",
              style: { borderColor: isActive ? info.color + "40" : borderColor },
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-2 py-1 flex items-center justify-between", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5", children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "div",
                      {
                        className: "w-2 h-2 rounded-full flex-shrink-0",
                        style: { backgroundColor: isActive ? info.color : "#444" }
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                        lineNumber: 567,
                        columnNumber: 19
                      },
                      this
                    ),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "span",
                      {
                        className: "text-[10px] font-medium",
                        style: { color: isCyanTheme ? "#00ffff" : "#e2e8f0" },
                        children: info.label
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                        lineNumber: 571,
                        columnNumber: 19
                      },
                      this
                    )
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                    lineNumber: 566,
                    columnNumber: 17
                  }, this),
                  presets.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "button",
                      {
                        onClick: () => setPresetMenuOpen(presetMenuOpen === type ? null : type),
                        className: "text-[9px] px-1.5 py-0.5 bg-dark-surface hover:bg-dark-border rounded flex items-center gap-0.5",
                        children: [
                          "Presets",
                          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 8 }, void 0, false, {
                            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                            lineNumber: 586,
                            columnNumber: 23
                          }, this)
                        ]
                      },
                      void 0,
                      true,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                        lineNumber: 581,
                        columnNumber: 21
                      },
                      this
                    ),
                    presetMenuOpen === type && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-full right-0 mt-1 bg-dark-bg border border-dark-border rounded shadow-lg z-10 min-w-[120px]", children: presets.map((key) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "button",
                      {
                        onClick: () => applyPreset(type, key),
                        className: "block w-full text-left px-3 py-1.5 text-[10px] hover:bg-dark-surface",
                        children: MACRO_PRESETS[key].name
                      },
                      key,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                        lineNumber: 591,
                        columnNumber: 27
                      },
                      this
                    )) }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                      lineNumber: 589,
                      columnNumber: 23
                    }, this)
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                    lineNumber: 580,
                    columnNumber: 19
                  }, this)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                  lineNumber: 565,
                  columnNumber: 15
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-1.5 pb-1.5", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  SingleMacroEditor,
                  {
                    macro,
                    onChange: (newMacro) => updateMacro(type, newMacro),
                    label: info.label,
                    min: info.min,
                    max: info.max,
                    signed: info.signed,
                    color: info.color,
                    height: 50
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                    lineNumber: 607,
                    columnNumber: 17
                  },
                  this
                ) }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
                  lineNumber: 606,
                  columnNumber: 15
                }, this)
              ]
            },
            type,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
              lineNumber: 559,
              columnNumber: 13
            },
            this
          );
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
          lineNumber: 549,
          columnNumber: 7
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MAMEMacroEditor.tsx",
      lineNumber: 528,
      columnNumber: 5
    },
    this
  );
}
export {
  MAMEMacroEditor,
  MAMEMacroEditor as default
};
