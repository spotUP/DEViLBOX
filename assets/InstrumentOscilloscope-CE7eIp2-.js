import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { u as useVisualizationAnimation } from "./DrawbarSlider-Dq9geM4g.js";
import { $ as getToneEngine } from "./main-BbV5VyEH.js";
const gradientCache = /* @__PURE__ */ new Map();
const InstrumentOscilloscope = ({
  instrumentId,
  width = 200,
  height = 80,
  color = "#4ade80",
  backgroundColor = "var(--color-bg)",
  lineWidth = 1.2,
  className = ""
}) => {
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const contextRef = reactExports.useRef(null);
  const [logicalWidth, setLogicalWidth] = reactExports.useState(width === "auto" ? 200 : width);
  reactExports.useEffect(() => {
    if (width !== "auto") {
      requestAnimationFrame(() => setLogicalWidth(width));
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) {
        setLogicalWidth(Math.floor(rect.width));
      }
    };
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [width]);
  reactExports.useLayoutEffect(() => {
    const canvas2 = canvasRef.current;
    if (!canvas2) return;
    const ctx = canvas2.getContext("2d", { alpha: true });
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas2.width = logicalWidth * dpr;
    canvas2.height = height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    contextRef.current = ctx;
    gradientCache.clear();
  }, [logicalWidth, height]);
  const onFrame = reactExports.useCallback(() => {
    const ctx = contextRef.current;
    if (!ctx) return false;
    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(instrumentId);
    if (backgroundColor === "transparent" || backgroundColor === "rgba(0,0,0,0)") {
      ctx.clearRect(0, 0, logicalWidth, height);
    } else {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, logicalWidth, height);
    }
    ctx.strokeStyle = "var(--color-border-light)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(logicalWidth, height / 2);
    ctx.stroke();
    if (!analyser) {
      ctx.fillStyle = `${color}80`;
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`No analyser for instrument ${instrumentId}`, logicalWidth / 2, height / 2 - 5);
      return false;
    }
    const waveform = analyser.getWaveform();
    const hasActivity = analyser.hasActivity();
    const peak = analyser.getPeak();
    if (!hasActivity) {
      ctx.strokeStyle = `${color}30`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const cycles = 3;
      for (let i = 0; i < logicalWidth; i++) {
        const t = i / logicalWidth * cycles * Math.PI * 2;
        const amp = 0.15 * Math.sin(Math.PI * i / logicalWidth);
        const y = (0.5 + amp * Math.sin(t)) * height;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();
      ctx.fillStyle = `${color}60`;
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`Peak: ${peak.toFixed(4)}`, 4, height - 4);
      return false;
    }
    const gradientKey = `${color}-${height}`;
    let gradient = gradientCache.get(gradientKey);
    if (!gradient) {
      gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.5, color);
      gradient.addColorStop(1, color);
      gradientCache.set(gradientKey, gradient);
    }
    ctx.strokeStyle = gradient;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const sliceWidth = logicalWidth / waveform.length;
    let x = 0;
    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i];
      const y = (v + 1) / 2 * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    return true;
  }, [instrumentId, backgroundColor, color, lineWidth, logicalWidth, height]);
  useVisualizationAnimation({
    onFrame,
    enabled: true,
    fps: 60
  });
  const canvas = /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      className: `rounded ${className}`,
      style: {
        backgroundColor: backgroundColor === "transparent" ? "transparent" : backgroundColor,
        width: width === "auto" ? "100%" : `${width}px`,
        height: `${height}px`,
        display: "block"
      }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/InstrumentOscilloscope.tsx",
      lineNumber: 199,
      columnNumber: 5
    },
    void 0
  );
  if (width === "auto") {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, className: "w-full h-full", children: canvas }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/InstrumentOscilloscope.tsx",
      lineNumber: 213,
      columnNumber: 7
    }, void 0);
  }
  return canvas;
};
export {
  InstrumentOscilloscope as I
};
