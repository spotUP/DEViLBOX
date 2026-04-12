import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { A as ATTACK_MS, D as DECAY_MS } from "./GTVisualMapping-BkrLaqE6.js";
const COLOR_ENV = "#7dd3fc";
const COLOR_SUSTAIN = "rgba(125, 211, 252, 0.35)";
const COLOR_RELEASE = "rgba(239, 68, 68, 0.18)";
const COLOR_GRID = "#1e2a3a";
const COLOR_BACKGROUND = "#0d1117";
const EnvelopeVisualization = (props) => {
  const canvasRef = reactExports.useRef(null);
  const containerRef = reactExports.useRef(null);
  const [measuredWidth, setMeasuredWidth] = reactExports.useState(0);
  const isAuto = props.width === "auto";
  const w = isAuto ? measuredWidth : typeof props.width === "number" ? props.width : 280;
  const h = props.height ?? 72;
  const strokeColor = props.color ?? COLOR_ENV;
  const bgColor = props.backgroundColor ?? COLOR_BACKGROUND;
  const borderStyle = props.border ?? "1px solid rgba(255,255,255,0.06)";
  reactExports.useEffect(() => {
    if (!isAuto) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        if (cr.width > 0) setMeasuredWidth(Math.floor(cr.width));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isAuto]);
  const draw = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || w === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = h / 4 * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    if (props.mode === "adsr") {
      drawADSR(ctx, w, h, props, strokeColor);
    } else if (props.mode === "linear") {
      drawLinear(ctx, w, h, props, strokeColor);
    } else if (props.mode === "sid") {
      drawSID(ctx, w, h, props, strokeColor);
    } else if (props.mode === "ms") {
      drawMS(ctx, w, h, props, strokeColor);
    } else {
      drawSteps(ctx, w, h, props, strokeColor);
    }
  }, [props, w, h, strokeColor, bgColor]);
  reactExports.useEffect(() => {
    draw();
  }, [draw]);
  const canvasEl = /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      style: { display: "block", borderRadius: 4, border: borderStyle }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EnvelopeVisualization.tsx",
      lineNumber: 212,
      columnNumber: 5
    },
    void 0
  );
  if (isAuto) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, style: { width: "100%" }, children: canvasEl }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EnvelopeVisualization.tsx",
      lineNumber: 220,
      columnNumber: 7
    }, void 0);
  }
  return canvasEl;
};
function drawADSR(ctx, w, h, p, color) {
  const maxTl = p.maxTl ?? 127;
  const maxRate = p.maxRate ?? 31;
  const d2r = p.d2r ?? 0;
  const amp = 1 - p.tl / maxTl;
  const arFrac = (maxRate - p.ar) / maxRate;
  const drFrac = p.sl / 15 * ((maxRate - p.dr) / maxRate);
  const d2rFrac = (15 - p.sl) / 15 * ((31 - d2r) / 31);
  const rrFrac = (15 - p.rr) / 15;
  const xA = arFrac * 0.45;
  const xD = xA + drFrac * 0.45;
  const xD2 = xD + d2rFrac * 0.45;
  const xR = rrFrac;
  const yPeak = (1 - amp) * h;
  const ySustain = (1 - amp * (p.sl / 15)) * h;
  ctx.fillStyle = COLOR_RELEASE;
  ctx.beginPath();
  ctx.moveTo(0, yPeak);
  ctx.lineTo(xR * w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  if (p.sl < 15) {
    ctx.strokeStyle = COLOR_SUSTAIN;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xD * w, ySustain);
    ctx.lineTo(w, ySustain);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, h);
  if (p.ar === 0) {
    ctx.lineTo(w, h);
  } else {
    ctx.lineTo(xA * w, yPeak);
    ctx.lineTo(xD * w, ySustain);
    if (d2r > 0) {
      ctx.lineTo(xD2 * w, h);
    } else {
      ctx.lineTo(w, ySustain);
    }
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "8px monospace";
  ctx.fillText("A", xA * w + 2, yPeak - 3 > 8 ? yPeak - 3 : yPeak + 9);
  ctx.fillText("D", xD * w + 2, ySustain - 3 > 8 ? ySustain - 3 : 9);
  ctx.fillText("R", 2, h - 4);
}
function drawLinear(ctx, w, h, p, color) {
  const a = Math.max(0, Math.min(1, p.attack));
  const d = Math.max(0, Math.min(1, p.decay));
  const s = Math.max(0, Math.min(1, p.sustain));
  const r = Math.max(0, Math.min(1, p.release));
  const HOLD = 0.25;
  const total = a + d + HOLD + r;
  const toX = (t) => t / total * w;
  const xA = toX(a);
  const xD = toX(a + d);
  const xS = toX(a + d + HOLD);
  const yTop = 2;
  const ySus = yTop + (1 - s) * (h - yTop - 2);
  ctx.fillStyle = COLOR_SUSTAIN;
  ctx.fillRect(xD, 0, xS - xD, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(xA, yTop);
  ctx.lineTo(xD, ySus);
  ctx.lineTo(xS, ySus);
  ctx.lineTo(w, h);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  const mid = (x1, x2) => (x1 + x2) / 2;
  if (xA > 10) ctx.fillText("A", mid(0, xA), h - 4);
  ctx.fillText("D", mid(xA, xD), h - 4);
  ctx.fillText("S", mid(xD, xS), h - 4);
  ctx.fillText("R", mid(xS, w), h - 4);
  ctx.textAlign = "left";
}
function drawSteps(ctx, w, h, p, color) {
  const {
    attackVol,
    attackSpeed,
    decayVol,
    decaySpeed,
    sustainVol,
    sustainLen,
    releaseSpeed,
    maxVol
  } = p;
  const releaseVol = p.releaseVol ?? 0;
  const atkW = Math.max(1, attackSpeed + 1);
  const decW = Math.max(1, decaySpeed + 1);
  const susW = Math.max(1, Math.min(sustainLen, 48));
  const relW = Math.max(1, releaseSpeed + 1);
  const total = atkW + decW + susW + relW;
  const toX = (x) => x / total * w;
  const toY = (v) => h - v / maxVol * h;
  const xSusStart = toX(atkW + decW);
  const xSusEnd = toX(atkW + decW + susW);
  ctx.fillStyle = COLOR_SUSTAIN;
  ctx.fillRect(xSusStart, 0, xSusEnd - xSusStart, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(0, h);
  const x1 = toX(atkW);
  const x2 = toX(atkW + decW);
  const x3 = xSusEnd;
  const x4 = toX(total);
  ctx.lineTo(x1, toY(attackVol));
  ctx.lineTo(x2, toY(decayVol));
  ctx.lineTo(x3, toY(sustainVol));
  ctx.lineTo(x4, toY(releaseVol));
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.font = "8px monospace";
  ctx.fillText("A", 2, h - 4);
  ctx.fillText("D", x1 + 2, h - 4);
  ctx.fillText("S", xSusStart + 3, h - 4);
  ctx.fillText("R", x3 + 2, h - 4);
  ctx.strokeStyle = COLOR_SUSTAIN;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(x2, toY(sustainVol));
  ctx.lineTo(w, toY(sustainVol));
  ctx.stroke();
  ctx.setLineDash([]);
}
function drawSID(ctx, w, h, p, color) {
  const atkMs = ATTACK_MS[Math.min(15, Math.max(0, p.attack))];
  const decMs = DECAY_MS[Math.min(15, Math.max(0, p.decay))];
  const susLevel = Math.min(15, Math.max(0, p.sustain)) / 15;
  const relMs = DECAY_MS[Math.min(15, Math.max(0, p.release))];
  const susHoldMs = 200;
  const totalMs = atkMs + decMs + susHoldMs + relMs;
  if (totalMs === 0) return;
  const tx = (ms) => ms / totalMs * w;
  const xA = tx(atkMs);
  const xD = tx(atkMs + decMs);
  const xS = tx(atkMs + decMs + susHoldMs);
  const ySus = h * (1 - susLevel);
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(xA, 2);
  ctx.lineTo(xD, ySus);
  ctx.lineTo(xS, ySus);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.12;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(xA, 2);
  ctx.lineTo(xD, ySus);
  ctx.lineTo(xS, ySus);
  ctx.lineTo(w, h);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  const mid = (x1, x2) => (x1 + x2) / 2;
  if (xA > 12) ctx.fillText("A", mid(0, xA), h - 4);
  ctx.fillText("D", mid(xA, xD), h - 4);
  ctx.fillText("S", mid(xD, xS), h - 4);
  ctx.fillText("R", mid(xS, w), h - 4);
  ctx.textAlign = "left";
}
function drawMS(ctx, w, h, p, color) {
  const atkMs = Math.max(0, p.attack);
  const decMs = Math.max(0, p.decay);
  const relMs = Math.max(0, p.release);
  const susLevel = Math.max(0, Math.min(100, p.sustain)) / 100;
  const adsr = atkMs + decMs + relMs;
  const susHoldMs = Math.max(adsr * 0.2, 50);
  const totalMs = adsr + susHoldMs;
  if (totalMs === 0) return;
  const tx = (ms) => ms / totalMs * w;
  const xA = tx(atkMs);
  const xD = tx(atkMs + decMs);
  const xS = tx(atkMs + decMs + susHoldMs);
  const ySus = 2 + (1 - susLevel) * (h - 4);
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(xA, 2);
  ctx.lineTo(xD, ySus);
  ctx.lineTo(xS, ySus);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.12;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(125, 211, 252, 0.35)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(xD, ySus);
  ctx.lineTo(xS, ySus);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(xA, 2);
  ctx.lineTo(xD, ySus);
  ctx.lineTo(xS, ySus);
  ctx.lineTo(w, h);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  const mid = (x1, x2) => (x1 + x2) / 2;
  if (xA > 12) ctx.fillText("A", mid(0, xA), h - 4);
  ctx.fillText("D", mid(xA, xD), h - 4);
  ctx.fillText("S", mid(xD, xS), h - 4);
  ctx.fillText("R", mid(xS, w), h - 4);
  ctx.textAlign = "left";
}
export {
  EnvelopeVisualization as E
};
