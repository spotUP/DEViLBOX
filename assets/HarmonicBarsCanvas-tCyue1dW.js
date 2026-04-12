import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
const HarmonicBarsCanvas = ({
  harmonics,
  count,
  width,
  height,
  barColor,
  highlightColor,
  backgroundColor = "#0a0a0a",
  gridColor = "rgba(128,128,128,0.15)",
  borderColor,
  gradient = false,
  showLabels = false,
  labelColor = "rgba(255,255,255,0.3)",
  hiDpi = false,
  onDragStart,
  onDrag,
  onDragEnd
}) => {
  const canvasRef = reactExports.useRef(null);
  const dragging = reactExports.useRef(false);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = hiDpi ? window.devicePixelRatio || 1 : 1;
    const w = hiDpi ? canvas.clientWidth : width;
    const h = hiDpi ? canvas.clientHeight : height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    if (!hiDpi) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.scale(dpr, dpr);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const y = h / 4 * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const barW = w / count;
    const gap = gradient ? Math.max(1, barW * 0.1) : 0;
    for (let i = 0; i < count; i++) {
      const amp = Math.max(0, Math.min(1, harmonics[i] || 0));
      if (amp <= 1e-3) continue;
      const barH = amp * h;
      const x = i * barW + (gradient ? gap / 2 : 1);
      const y = h - barH;
      const bw = gradient ? barW - gap : barW - 2;
      if (gradient) {
        const grad = ctx.createLinearGradient(x, y, x, h);
        grad.addColorStop(0, highlightColor);
        grad.addColorStop(1, barColor);
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, bw, barH);
      } else {
        ctx.fillStyle = barColor;
        ctx.fillRect(x, y, bw, barH);
        ctx.fillStyle = highlightColor;
        ctx.fillRect(x, y, bw, 2);
      }
      if (showLabels && ((i + 1) % 4 === 1 || i === 0)) {
        ctx.fillStyle = labelColor;
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), x + bw / 2, h - 3);
      }
    }
    if (borderColor && borderColor !== "none") {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, w, h);
    }
  }, [harmonics, count, width, height, barColor, highlightColor, backgroundColor, gridColor, borderColor, gradient, showLabels, labelColor, hiDpi]);
  const getCoords = reactExports.useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      nx: (e.clientX - rect.left) / rect.width,
      ny: (e.clientY - rect.top) / rect.height
    };
  }, []);
  const hasInteraction = !!(onDragStart || onDrag || onDragEnd);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      width: hiDpi ? void 0 : width,
      height: hiDpi ? void 0 : height,
      style: {
        cursor: hasInteraction ? "crosshair" : void 0,
        borderRadius: 4,
        width: hiDpi ? "100%" : width,
        height: hiDpi ? height : height
      },
      onMouseDown: hasInteraction ? (e) => {
        dragging.current = true;
        const c = getCoords(e);
        onDragStart == null ? void 0 : onDragStart(c.nx, c.ny);
      } : void 0,
      onMouseMove: hasInteraction ? (e) => {
        if (dragging.current) {
          const c = getCoords(e);
          onDrag == null ? void 0 : onDrag(c.nx, c.ny);
        }
      } : void 0,
      onMouseUp: hasInteraction ? () => {
        dragging.current = false;
        onDragEnd == null ? void 0 : onDragEnd();
      } : void 0,
      onMouseLeave: hasInteraction ? () => {
        dragging.current = false;
        onDragEnd == null ? void 0 : onDragEnd();
      } : void 0
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/HarmonicBarsCanvas.tsx",
      lineNumber: 141,
      columnNumber: 5
    },
    void 0
  );
};
export {
  HarmonicBarsCanvas as H
};
