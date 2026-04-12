import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
const SAMPLE_RATE = 44100;
const N_POINTS = 400;
const DB_MIN = -60;
const DB_MAX = 18;
const DB_RANGE = DB_MAX - DB_MIN;
const COLOR_BG = "#0d1117";
const COLOR_GRID = "#192130";
const COLOR_ZERO_DB = "#253040";
const COLOR_LABEL = "#475569";
function makeBiquad(type, fc, Q) {
  const f = Math.max(20, Math.min(fc, SAMPLE_RATE * 0.499));
  const w0 = 2 * Math.PI * f / SAMPLE_RATE;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * Math.max(Q, 0.01));
  const a0 = 1 + alpha;
  const a1 = -2 * cosw;
  const a2 = 1 - alpha;
  let b0, b1, b2;
  switch (type) {
    case "highpass":
      b0 = (1 + cosw) / 2;
      b1 = -(1 + cosw);
      b2 = (1 + cosw) / 2;
      break;
    case "bandpass":
      b0 = sinw / 2;
      b1 = 0;
      b2 = -sinw / 2;
      break;
    case "notch":
      b0 = 1;
      b1 = -2 * cosw;
      b2 = 1;
      break;
    default:
      b0 = (1 - cosw) / 2;
      b1 = 1 - cosw;
      b2 = (1 - cosw) / 2;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
function magnitudeDB(c, freq, poles) {
  const w = 2 * Math.PI * freq / SAMPLE_RATE;
  const cosw = Math.cos(w);
  const sinw = Math.sin(w);
  const cos2w = Math.cos(2 * w);
  const sin2w = Math.sin(2 * w);
  const bRe = c.b0 + c.b1 * cosw + c.b2 * cos2w;
  const bIm = -c.b1 * sinw - c.b2 * sin2w;
  const aRe = 1 + c.a1 * cosw + c.a2 * cos2w;
  const aIm = -c.a1 * sinw - c.a2 * sin2w;
  const denom = aRe * aRe + aIm * aIm;
  const mag = Math.sqrt((bRe * bRe + bIm * bIm) / Math.max(denom, 1e-30));
  const db = 20 * Math.log10(Math.max(mag, 1e-10));
  return poles === 4 ? db * 2 : db;
}
const FilterFrequencyResponse = ({
  filterType = "lowpass",
  cutoff,
  resonance,
  poles = 2,
  freqMin = 20,
  freqMax = 2e4,
  qMin = 0.5,
  qMax = 20,
  color = "#22d3ee",
  width = 280,
  height = 72
}) => {
  const canvasRef = reactExports.useRef(null);
  const draw = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    const W = width;
    const H = height;
    const fc = freqMin * Math.pow(freqMax / freqMin, Math.max(0, Math.min(1, cutoff)));
    const Q = qMin + Math.max(0, Math.min(1, resonance)) * (qMax - qMin);
    const coeffs = makeBiquad(filterType, fc, Q);
    const logSpan = Math.log10(freqMax / freqMin);
    const freqX = (f) => (Math.log10(Math.max(f, freqMin)) - Math.log10(freqMin)) / logSpan * W;
    const dbY = (db) => (1 - (Math.max(DB_MIN, Math.min(DB_MAX, db)) - DB_MIN) / DB_RANGE) * H;
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 0.5;
    for (const db of [-60, -48, -36, -24, -12, 0, 12]) {
      const y = Math.round(dbY(db)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.strokeStyle = db === 0 ? COLOR_ZERO_DB : COLOR_GRID;
      ctx.lineWidth = db === 0 ? 1 : 0.5;
      ctx.stroke();
    }
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = COLOR_GRID;
    for (const f of [100, 1e3, 1e4]) {
      const x = Math.round(freqX(f)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    const xs = [];
    const ys = [];
    for (let i = 0; i < N_POINTS; i++) {
      const t = i / (N_POINTS - 1);
      const freq = freqMin * Math.pow(freqMax / freqMin, t);
      xs.push(freqX(freq));
      ys.push(dbY(magnitudeDB(coeffs, freq, poles)));
    }
    ctx.beginPath();
    ctx.moveTo(xs[0], H);
    for (let i = 0; i < N_POINTS; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.lineTo(xs[N_POINTS - 1], H);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.14;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i < N_POINTS; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.globalAlpha = 1;
    ctx.stroke();
    const cx = freqX(fc);
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, H);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const fcLabel = fc >= 1e3 ? `${(fc / 1e3).toFixed(fc >= 1e4 ? 0 : 1)}k` : `${Math.round(fc)}`;
    ctx.font = "7px monospace";
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.textAlign = cx > W * 0.8 ? "right" : "left";
    ctx.fillText(fcLabel, cx + (cx > W * 0.8 ? -3 : 3), H - 2);
    ctx.globalAlpha = 1;
    const zeroY = dbY(0);
    ctx.font = "7px monospace";
    ctx.fillStyle = COLOR_LABEL;
    ctx.textAlign = "right";
    ctx.fillText("0", W - 2, zeroY - 2);
  }, [filterType, cutoff, resonance, poles, freqMin, freqMax, qMin, qMax, color, width, height]);
  reactExports.useEffect(() => {
    draw();
  }, [draw]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      style: { display: "block", borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FilterFrequencyResponse.tsx",
      lineNumber: 262,
      columnNumber: 5
    },
    void 0
  );
};
export {
  FilterFrequencyResponse as F
};
