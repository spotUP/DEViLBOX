import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, a4 as Minus, P as Plus, W as Repeat, a5 as Flag, Z as Zap, N as RotateCcw } from "./vendor-ui-AJ7AT9BN.js";
const NOTE_REFS = [
  { value: -12, label: "−Oct", color: "rgba(90, 180, 255, 0.45)" },
  { value: -7, label: "−5th", color: "rgba(90, 180, 255, 0.22)" },
  { value: 0, label: "Root", color: "rgba(80, 255, 120, 0.65)" },
  { value: 7, label: "5th", color: "rgba(90, 180, 255, 0.45)" },
  { value: 12, label: "+Oct", color: "rgba(90, 180, 255, 0.45)" }
];
function formatValue(value, format, valueLabels, showNoteNames) {
  if (valueLabels && value >= 0 && value < valueLabels.length) {
    return valueLabels[value];
  }
  if (showNoteNames) {
    const ref = NOTE_REFS.find((r) => r.value === value);
    if (ref) return `${value > 0 ? "+" : ""}${value} (${ref.label})`;
    return value > 0 ? `+${value}` : `${value}`;
  }
  switch (format) {
    case "hex":
      return `$${(value & 255).toString(16).toUpperCase().padStart(2, "0")}`;
    case "signed":
      return value > 0 ? `+${value}` : `${value}`;
    default:
      return `${value}`;
  }
}
const SequenceEditor = ({
  label,
  data,
  onChange,
  min = 0,
  max = 15,
  bipolar = false,
  loop = -1,
  onLoopChange,
  end = -1,
  onEndChange,
  playbackPosition,
  valueLabels,
  showNoteNames = false,
  presets = [],
  fixedLength = false,
  maxLength = 256,
  color = "#a78bfa",
  height = 100,
  showCells = false,
  cellFormat = "dec"
}) => {
  const canvasRef = reactExports.useRef(null);
  const containerRef = reactExports.useRef(null);
  const [isDragging, setIsDragging] = reactExports.useState(false);
  const [isSettingLoop, setIsSettingLoop] = reactExports.useState(false);
  const [isSettingEnd, setIsSettingEnd] = reactExports.useState(false);
  const [showPresets, setShowPresets] = reactExports.useState(false);
  const [hoveredStep, setHoveredStep] = reactExports.useState(null);
  const dragStartRef = reactExports.useRef(null);
  const isLineModeRef = reactExports.useRef(false);
  const range = max - min;
  const stepWidth = Math.max(8, Math.min(24, 400 / Math.max(data.length, 1)));
  const canvasWidth = Math.max(400, data.length * stepWidth);
  const draw = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    const w = canvasWidth;
    const h = height;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2a2a4e";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = h / 4 * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    if (bipolar && min < 0) {
      const zeroY = h * (max / range);
      ctx.strokeStyle = "#5a5a8e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(w, zeroY);
      ctx.stroke();
    }
    if (showNoteNames) {
      ctx.setLineDash([3, 6]);
      NOTE_REFS.forEach((ref) => {
        if (ref.value < min || ref.value > max) return;
        const y = h - (ref.value - min) / range * h;
        ctx.strokeStyle = ref.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillStyle = ref.color;
        ctx.font = "8px monospace";
        ctx.fillText(ref.label, 3, y - 1);
      });
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = "#2a2a4e";
    ctx.lineWidth = 1;
    for (let i = 0; i < data.length; i += 4) {
      const x = i / data.length * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    if (loop >= 0 && loop < data.length) {
      const loopX = loop / data.length * w;
      const endX = end >= 0 ? end / data.length * w : w;
      ctx.fillStyle = "rgba(59, 130, 246, 0.10)";
      ctx.fillRect(loopX, 0, endX - loopX, h);
    }
    const barWidth = w / data.length;
    data.forEach((value, i) => {
      const x = i * barWidth;
      const normalised = (value - min) / range;
      const barH = normalised * h;
      const y = h - barH;
      const isHovered = (hoveredStep == null ? void 0 : hoveredStep.step) === i;
      ctx.fillStyle = isHovered ? "rgba(255,255,255,0.85)" : color;
      ctx.strokeStyle = isHovered ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.fillRect(x + 1, y, barWidth - 2, barH);
      ctx.strokeRect(x + 1, y, barWidth - 2, barH);
    });
    if (loop >= 0 && loop < data.length) {
      const lx = loop / data.length * w;
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, h);
      ctx.stroke();
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.moveTo(lx - 6, 10);
      ctx.lineTo(lx, 0);
      ctx.lineTo(lx + 6, 10);
      ctx.closePath();
      ctx.fill();
    }
    if (end >= 0 && end < data.length) {
      const ex = end / data.length * w;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex, 0);
      ctx.lineTo(ex, h);
      ctx.stroke();
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(ex - 5, 5, 10, 10);
    }
    if (typeof playbackPosition === "number" && playbackPosition >= 0 && playbackPosition < data.length) {
      const px = (playbackPosition + 0.5) / data.length * w;
      ctx.strokeStyle = "rgba(255, 220, 0, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 220, 0, 0.9)";
      ctx.beginPath();
      ctx.moveTo(px, 4);
      ctx.lineTo(px - 5, 14);
      ctx.lineTo(px, 24);
      ctx.lineTo(px + 5, 14);
      ctx.closePath();
      ctx.fill();
    }
  }, [
    data,
    min,
    max,
    range,
    bipolar,
    showNoteNames,
    loop,
    end,
    playbackPosition,
    hoveredStep,
    color,
    canvasWidth,
    height
  ]);
  reactExports.useEffect(() => {
    draw();
  }, [draw]);
  const getStepFromMouse = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { step: 0, value: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const step = Math.max(0, Math.min(data.length - 1, Math.floor(x / rect.width * data.length)));
    const value = Math.max(min, Math.min(max, Math.round(min + (1 - y / rect.height) * range)));
    return { step, value };
  };
  const applyLine = reactExports.useCallback((s0, v0, s1, v1) => {
    const newData = [...data];
    const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
    for (let s = lo; s <= hi; s++) {
      const t = hi === lo ? 0 : (s - lo) / (hi - lo);
      const v = s0 <= s1 ? v0 + (v1 - v0) * t : v1 + (v0 - v1) * (1 - t);
      newData[s] = Math.max(min, Math.min(max, Math.round(v)));
    }
    onChange(newData);
  }, [data, min, max, onChange]);
  const handleMouseDown = (e) => {
    if (isSettingLoop || isSettingEnd) {
      const { step: step2 } = getStepFromMouse(e);
      if (isSettingLoop) {
        onLoopChange == null ? void 0 : onLoopChange(step2);
        setIsSettingLoop(false);
      } else {
        onEndChange == null ? void 0 : onEndChange(step2);
        setIsSettingEnd(false);
      }
      return;
    }
    setIsDragging(true);
    const { step, value } = getStepFromMouse(e);
    dragStartRef.current = { step, value };
    isLineModeRef.current = e.shiftKey;
    if (!e.shiftKey) {
      const d = [...data];
      d[step] = value;
      onChange(d);
    }
  };
  const handleMouseMove = (e) => {
    const { step, value } = getStepFromMouse(e);
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      setHoveredStep({ step, value: data[step] ?? value, x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (!isDragging) return;
    if (isLineModeRef.current && dragStartRef.current) {
      applyLine(dragStartRef.current.step, dragStartRef.current.value, step, value);
    } else {
      const d = [...data];
      d[step] = value;
      onChange(d);
    }
  };
  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };
  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredStep(null);
  };
  const addStep = () => {
    if (data.length >= maxLength) return;
    onChange([...data, data[data.length - 1] ?? 0]);
  };
  const removeStep = () => {
    if (data.length <= 1) return;
    onChange(data.slice(0, -1));
  };
  const resetAll = () => {
    onChange(Array(data.length).fill(bipolar ? 0 : min));
  };
  const setCellValue = (i, raw) => {
    const parsed = cellFormat === "hex" ? parseInt(raw.replace(/^\$/, ""), 16) : parseInt(raw);
    if (isNaN(parsed)) return;
    const d = [...data];
    d[i] = Math.max(min, Math.min(max, parsed));
    onChange(d);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary rounded-lg border border-dark-border overflow-hidden", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-3 py-2 bg-dark-bg border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-xs font-bold text-text-primary uppercase tracking-wider", children: label }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
          lineNumber: 392,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted font-mono", children: [
          data.length,
          " steps"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
          lineNumber: 395,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-blue-400/60 font-mono hidden sm:inline", children: "shift+drag=line" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
          lineNumber: 396,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
        lineNumber: 391,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
        !fixedLength && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: removeStep,
              className: "p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded",
              title: "Remove step",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Minus, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
                lineNumber: 406,
                columnNumber: 17
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
              lineNumber: 403,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: addStep,
              className: "p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded",
              title: "Add step",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Plus, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
                lineNumber: 411,
                columnNumber: 17
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
              lineNumber: 408,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
          lineNumber: 402,
          columnNumber: 13
        }, void 0),
        onLoopChange && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              setIsSettingLoop(!isSettingLoop);
              setIsSettingEnd(false);
            },
            className: `p-1 rounded transition-colors ${isSettingLoop ? "bg-blue-500 text-text-primary" : "text-blue-400 hover:bg-blue-500/20"}`,
            title: isSettingLoop ? "Click canvas to set loop" : "Set loop point",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Repeat, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
              lineNumber: 424,
              columnNumber: 15
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
            lineNumber: 418,
            columnNumber: 13
          },
          void 0
        ),
        onEndChange && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              setIsSettingEnd(!isSettingEnd);
              setIsSettingLoop(false);
            },
            className: `p-1 rounded transition-colors ${isSettingEnd ? "bg-red-500 text-text-primary" : "text-red-400 hover:bg-red-500/20"}`,
            title: isSettingEnd ? "Click canvas to set end" : "Set end point",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Flag, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
              lineNumber: 436,
              columnNumber: 15
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
            lineNumber: 430,
            columnNumber: 13
          },
          void 0
        ),
        presets.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setShowPresets(!showPresets),
              className: `p-1 rounded transition-colors ${showPresets ? "bg-amber-500/30 text-amber-300" : "text-amber-400 hover:bg-amber-500/20"}`,
              title: "Preset patterns",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
                lineNumber: 449,
                columnNumber: 17
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
              lineNumber: 443,
              columnNumber: 15
            },
            void 0
          ),
          showPresets && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-full right-0 mt-1 bg-dark-bg border border-dark-border rounded-lg shadow-xl z-30 min-w-[130px]", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-2 py-1 text-[9px] text-text-muted font-mono uppercase border-b border-dark-border", children: "Patterns" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
              lineNumber: 453,
              columnNumber: 19
            }, void 0),
            presets.map((preset, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => {
                  onChange([...preset.data]);
                  if (preset.loop !== void 0) onLoopChange == null ? void 0 : onLoopChange(preset.loop);
                  if (preset.end !== void 0) onEndChange == null ? void 0 : onEndChange(preset.end);
                  setShowPresets(false);
                },
                className: "w-full px-3 py-1.5 text-left text-[10px] font-mono text-text-primary hover:bg-dark-bgSecondary flex items-center justify-between gap-4",
                children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: preset.name }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
                    lineNumber: 467,
                    columnNumber: 23
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[9px]", children: [
                    preset.data.length,
                    "st"
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
                    lineNumber: 468,
                    columnNumber: 23
                  }, void 0)
                ]
              },
              i,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
                lineNumber: 457,
                columnNumber: 21
              },
              void 0
            ))
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
            lineNumber: 452,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
          lineNumber: 442,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: resetAll,
            className: "p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded",
            title: "Reset",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RotateCcw, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
              lineNumber: 480,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
            lineNumber: 477,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
        lineNumber: 399,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
      lineNumber: 390,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, className: "relative overflow-x-auto", style: { height: height + 20 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "canvas",
        {
          ref: canvasRef,
          style: { display: "block" },
          className: isSettingLoop || isSettingEnd ? "cursor-crosshair" : "cursor-pointer",
          onMouseDown: handleMouseDown,
          onMouseMove: handleMouseMove,
          onMouseUp: handleMouseUp,
          onMouseLeave: handleMouseLeave
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
          lineNumber: 487,
          columnNumber: 9
        },
        void 0
      ),
      hoveredStep && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "absolute pointer-events-none z-20 bg-dark-bg/95 border border-dark-border rounded px-2 py-1 text-[10px] font-mono text-text-primary shadow-lg",
          style: {
            left: Math.min(hoveredStep.x + 10, canvasWidth - 120),
            top: Math.max(4, hoveredStep.y - 30),
            whiteSpace: "nowrap"
          },
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted mr-1", children: [
              "#",
              hoveredStep.step,
              ":"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
              lineNumber: 507,
              columnNumber: 13
            }, void 0),
            formatValue(hoveredStep.value, cellFormat, valueLabels, showNoteNames)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
          lineNumber: 499,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute bottom-0 left-0 right-0 flex items-center gap-4 px-2 py-0.5 bg-dark-bg/80 text-[9px] font-mono", children: [
        loop >= 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onLoopChange == null ? void 0 : onLoopChange(-1),
            className: "flex items-center gap-1 text-blue-400 hover:text-blue-300",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Repeat, { size: 9 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
                lineNumber: 518,
                columnNumber: 15
              }, void 0),
              " Loop@",
              loop,
              " ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted ml-0.5", children: "×" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
                lineNumber: 518,
                columnNumber: 47
              }, void 0)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
            lineNumber: 515,
            columnNumber: 13
          },
          void 0
        ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "No loop" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
          lineNumber: 520,
          columnNumber: 15
        }, void 0),
        end >= 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onEndChange == null ? void 0 : onEndChange(-1),
            className: "flex items-center gap-1 text-red-400 hover:text-red-300",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Flag, { size: 9 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
                lineNumber: 526,
                columnNumber: 15
              }, void 0),
              " End@",
              end,
              " ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted ml-0.5", children: "×" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
                lineNumber: 526,
                columnNumber: 43
              }, void 0)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
            lineNumber: 523,
            columnNumber: 13
          },
          void 0
        ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "No end" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
          lineNumber: 528,
          columnNumber: 15
        }, void 0),
        typeof playbackPosition === "number" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-yellow-400 ml-auto", children: [
          "▶ ",
          playbackPosition
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
          lineNumber: 531,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
        lineNumber: 513,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
      lineNumber: 486,
      columnNumber: 7
    }, void 0),
    showCells && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "overflow-x-auto border-t border-dark-border bg-dark-bg", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-0.5 p-2", children: data.map((v, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5 flex-shrink-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] font-mono text-text-muted", children: i.toString().padStart(2, "0") }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
        lineNumber: 542,
        columnNumber: 17
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "text",
          value: cellFormat === "hex" ? (v & 255).toString(16).toUpperCase().padStart(2, "0") : String(v),
          onChange: (e) => setCellValue(i, e.target.value),
          className: "text-[10px] font-mono text-center border rounded py-0.5",
          style: {
            width: "36px",
            background: "#060a0f",
            borderColor: v !== 0 ? "#1a2a3a" : "#111",
            color: v !== 0 ? "#7dd3fc" : "#444"
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
          lineNumber: 543,
          columnNumber: 17
        },
        void 0
      )
    ] }, i, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
      lineNumber: 541,
      columnNumber: 15
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
      lineNumber: 539,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
      lineNumber: 538,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SequenceEditor.tsx",
    lineNumber: 388,
    columnNumber: 5
  }, void 0);
};
export {
  SequenceEditor as S
};
