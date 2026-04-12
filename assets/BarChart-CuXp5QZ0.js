import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
const WaveformLineCanvas = ({
  data,
  width,
  height,
  color,
  label,
  maxSamples = 256
}) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(128,128,128,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    if (data.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const len = Math.min(data.length, maxSamples);
    for (let i = 0; i < len; i++) {
      const x = i / (len - 1) * width;
      const y = (1 - (data[i] + 128) / 255) * (height - 2) + 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (label) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.font = "9px monospace";
      ctx.fillText(label, 4, 10);
      ctx.globalAlpha = 1;
    }
  }, [data, width, height, color, label, maxSamples]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, width, height, className: "rounded" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/WaveformLineCanvas.tsx",
    lineNumber: 64,
    columnNumber: 10
  }, void 0);
};
const BarChart = ({
  data,
  width,
  height,
  color,
  signed,
  markers,
  maxValues = 128
}) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);
    if (data.length === 0) return;
    const len = Math.min(data.length, maxValues);
    const barW = Math.max(1, width / len);
    if (signed) {
      ctx.strokeStyle = "rgba(128,128,128,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.fillStyle = color;
      for (let i = 0; i < len; i++) {
        const v = data[i];
        const normH = Math.abs(v) / 128 * (height / 2);
        const x = i / len * width;
        if (v >= 0) {
          ctx.fillRect(x, height / 2 - normH, barW, normH);
        } else {
          ctx.fillRect(x, height / 2, barW, normH);
        }
      }
    } else {
      ctx.fillStyle = color;
      for (let i = 0; i < len; i++) {
        const v = data[i];
        const barH = v / 255 * height;
        const x = i / len * width;
        ctx.fillRect(x, height - barH, barW, barH);
      }
    }
    if (markers) {
      for (const m of markers) {
        if (m.pos >= 0 && m.pos < len) {
          const x = m.pos / len * width;
          ctx.strokeStyle = m.color;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
          ctx.setLineDash([]);
          if (m.label) {
            ctx.fillStyle = m.color;
            ctx.font = "8px monospace";
            ctx.fillText(m.label, x + 2, 9);
          }
        }
      }
    }
  }, [data, width, height, color, signed, markers, maxValues]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, width, height, className: "rounded" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/BarChart.tsx",
    lineNumber: 96,
    columnNumber: 10
  }, void 0);
};
export {
  BarChart as B,
  WaveformLineCanvas as W
};
