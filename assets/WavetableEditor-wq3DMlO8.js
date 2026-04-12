const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { W as CustomSelect, ef as FURNACE_WAVETABLE_PRESETS, am as __vitePreload } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { ag as Maximize, af as Minimize, an as Pencil, ao as ChartColumn, ap as SquareFunction, aq as LibraryBig, a4 as Minus, am as Maximize2, ar as FlipVertical, as as FlipHorizontal, at as Split, au as Contrast, N as RotateCcw, av as ArrowLeftRight, X, a as reactExports, s as Play, T as TriangleAlert, g as Save, S as Search, P as Plus, aw as Copy, $ as Waves, F as FileUp, a1 as WandSparkles, p as Trash2 } from "./vendor-ui-AJ7AT9BN.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { W as WaveformThumbnail } from "./WaveformThumbnail-CebZPsAz.js";
import { p as penInterpolate, r as resample, a as requantize, t as toFloat, f as fft, b as applyChipTarget, d as dcRemove, n as normalize, i as invert, c as reverse, m as mirrorLeftToRight, q as quarterWaveReflect, e as phaseAlignToPeak, H as HarmonicPanel } from "./SpectralFilter-Dxe-YniK.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
import "./HarmonicBarsCanvas-tCyue1dW.js";
const CHIP_TARGETS = {
  "generic-32x16": {
    id: "generic-32x16",
    name: "Generic 32×16",
    maxValue: 15,
    defaultLen: 32,
    minLen: 4,
    maxLen: 256,
    lenStep: 1,
    bitDepth: 4,
    description: "4-bit, 32 samples — Game Boy, Namco, WonderSwan"
  },
  "generic-32x32": {
    id: "generic-32x32",
    name: "Generic 32×32",
    maxValue: 31,
    defaultLen: 32,
    minLen: 4,
    maxLen: 256,
    lenStep: 1,
    bitDepth: 5,
    description: "5-bit, 32 samples"
  },
  "generic-64x256": {
    id: "generic-64x256",
    name: "Generic 64×256",
    maxValue: 255,
    defaultLen: 64,
    minLen: 4,
    maxLen: 256,
    lenStep: 1,
    bitDepth: 8,
    description: "8-bit, 64 samples"
  },
  "generic-128x256": {
    id: "generic-128x256",
    name: "Generic 128×256",
    maxValue: 255,
    defaultLen: 128,
    minLen: 4,
    maxLen: 256,
    lenStep: 1,
    bitDepth: 8,
    description: "8-bit, 128 samples"
  },
  "generic-256x256": {
    id: "generic-256x256",
    name: "Generic 256×256",
    maxValue: 255,
    defaultLen: 256,
    minLen: 4,
    maxLen: 256,
    lenStep: 1,
    bitDepth: 8,
    description: "8-bit, 256 samples (max resolution)"
  },
  gameboy: {
    id: "gameboy",
    name: "Game Boy",
    maxValue: 15,
    defaultLen: 32,
    minLen: 32,
    maxLen: 32,
    lenStep: 32,
    lockedLen: true,
    lockedDepth: true,
    bitDepth: 4,
    description: "Wave RAM: 32 × 4-bit (fixed)"
  },
  fds: {
    id: "fds",
    name: "FDS",
    maxValue: 63,
    defaultLen: 32,
    minLen: 32,
    maxLen: 32,
    lenStep: 32,
    lockedLen: true,
    lockedDepth: true,
    bitDepth: 6,
    description: "Famicom Disk System: 32 × 6-bit (fixed)"
  },
  n163: {
    id: "n163",
    name: "Namco N163",
    maxValue: 15,
    defaultLen: 32,
    minLen: 4,
    maxLen: 252,
    lenStep: 4,
    bitDepth: 4,
    description: "N163: variable length, 4-byte aligned, 4-bit"
  },
  gtultra: {
    id: "gtultra",
    name: "GT Ultra (C64 SID)",
    maxValue: 255,
    defaultLen: 255,
    minLen: 1,
    maxLen: 255,
    lenStep: 1,
    bitDepth: 8,
    description: "GoatTracker wave table: 255 × 8-bit entries"
  }
};
const CHIP_TARGET_ORDER = [
  "generic-32x16",
  "generic-32x32",
  "generic-64x256",
  "generic-128x256",
  "generic-256x256",
  "gameboy",
  "fds",
  "n163",
  "gtultra"
];
function detectChipTarget(length, maxValue) {
  if (length === 32 && maxValue === 15) return "gameboy";
  if (length === 32 && maxValue === 63) return "fds";
  if (length === 32 && maxValue === 31) return "generic-32x32";
  if (maxValue === 15 && length % 4 === 0 && length >= 4 && length <= 252) {
    return length === 32 ? "generic-32x16" : "n163";
  }
  if (maxValue === 255) {
    if (length === 255) return "gtultra";
    if (length === 64) return "generic-64x256";
    if (length === 128) return "generic-128x256";
    return "generic-256x256";
  }
  return "generic-32x16";
}
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "	" || c === "\n") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9" || c === ".") {
      let j = i;
      while (j < src.length && (src[j] >= "0" && src[j] <= "9" || src[j] === ".")) j++;
      out.push({ k: "num", v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_") {
      let j = i;
      while (j < src.length && (src[j] >= "a" && src[j] <= "z" || src[j] >= "A" && src[j] <= "Z" || src[j] >= "0" && src[j] <= "9" || src[j] === "_")) j++;
      out.push({ k: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/%^".includes(c)) {
      out.push({ k: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") {
      out.push({ k: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ k: "rp" });
      i++;
      continue;
    }
    if (c === ",") {
      out.push({ k: "comma" });
      i++;
      continue;
    }
    throw new Error(`Unexpected character '${c}' at ${i}`);
  }
  out.push({ k: "end" });
  return out;
}
const CONSTANTS = {
  PI: Math.PI,
  TAU: Math.PI * 2,
  E: Math.E
};
function hashNoise(x) {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
const FUNCTIONS = {
  sin: ([x]) => Math.sin(x),
  cos: ([x]) => Math.cos(x),
  tan: ([x]) => Math.tan(x),
  abs: ([x]) => Math.abs(x),
  sign: ([x]) => Math.sign(x),
  sqrt: ([x]) => Math.sqrt(Math.max(0, x)),
  exp: ([x]) => Math.exp(x),
  log: ([x]) => Math.log(Math.max(1e-9, x)),
  min: ([a, b]) => Math.min(a, b),
  max: ([a, b]) => Math.max(a, b),
  clamp: ([x, lo, hi]) => Math.max(lo, Math.min(hi, x)),
  mix: ([a, b, t]) => a + (b - a) * t,
  floor: ([x]) => Math.floor(x),
  ceil: ([x]) => Math.ceil(x),
  round: ([x]) => Math.round(x),
  saw: ([x]) => {
    const p = x - Math.floor(x);
    return p * 2 - 1;
  },
  tri: ([x]) => {
    const p = x - Math.floor(x);
    return p < 0.5 ? p * 4 - 1 : 3 - p * 4;
  },
  sq: ([x]) => {
    const p = x - Math.floor(x);
    return p < 0.5 ? 1 : -1;
  },
  pulse: ([x, d]) => {
    const p = x - Math.floor(x);
    const duty = Math.max(0, Math.min(1, d));
    return p < duty ? 1 : -1;
  },
  noise: ([x]) => hashNoise(x),
  env: ([x, a, r]) => {
    const att = Math.max(1e-4, a);
    const rel = Math.max(1e-4, r);
    if (x < 0 || x > 1) return 0;
    if (x < att) return x / att;
    if (x > 1 - rel) return (1 - x) / rel;
    return 1;
  }
};
function peek(s) {
  return s.toks[s.pos];
}
function eat(s) {
  return s.toks[s.pos++];
}
function parseAddSub(s) {
  let left = parseMulDiv(s);
  while (true) {
    const t = peek(s);
    if (t.k === "op" && (t.v === "+" || t.v === "-")) {
      const op = t.v;
      eat(s);
      const right = parseMulDiv(s);
      const l = left, r = right;
      left = op === "+" ? (c) => l(c) + r(c) : (c) => l(c) - r(c);
    } else break;
  }
  return left;
}
function parseMulDiv(s) {
  let left = parsePow(s);
  while (true) {
    const t = peek(s);
    if (t.k === "op" && (t.v === "*" || t.v === "/" || t.v === "%")) {
      const op = t.v;
      eat(s);
      const right = parsePow(s);
      const l = left, r = right;
      if (op === "*") left = (c) => l(c) * r(c);
      else if (op === "/") left = (c) => {
        const v = r(c);
        return v === 0 ? 0 : l(c) / v;
      };
      else left = (c) => {
        const v = r(c);
        return v === 0 ? 0 : l(c) % v;
      };
    } else break;
  }
  return left;
}
function parsePow(s) {
  const left = parseUnary(s);
  const t = peek(s);
  if (t.k === "op" && t.v === "^") {
    eat(s);
    const right = parsePow(s);
    return (c) => Math.pow(left(c), right(c));
  }
  return left;
}
function parseUnary(s) {
  const t = peek(s);
  if (t.k === "op" && (t.v === "+" || t.v === "-")) {
    eat(s);
    const inner = parseUnary(s);
    return t.v === "-" ? (c) => -inner(c) : inner;
  }
  return parsePrimary(s);
}
function parsePrimary(s) {
  const t = eat(s);
  if (t.k === "num") {
    const v = t.v;
    return () => v;
  }
  if (t.k === "lp") {
    const inner = parseAddSub(s);
    if (peek(s).k !== "rp") throw new Error("Expected )");
    eat(s);
    return inner;
  }
  if (t.k === "id") {
    if (peek(s).k === "lp") {
      eat(s);
      const args = [];
      if (peek(s).k !== "rp") {
        args.push(parseAddSub(s));
        while (peek(s).k === "comma") {
          eat(s);
          args.push(parseAddSub(s));
        }
      }
      if (peek(s).k !== "rp") throw new Error(`Expected ) after ${t.v}(...)`);
      eat(s);
      const fn = FUNCTIONS[t.v];
      if (!fn) throw new Error(`Unknown function: ${t.v}`);
      return (c) => fn(args.map((a) => a(c)));
    }
    if (t.v === "x") return (c) => c.x;
    const k = CONSTANTS[t.v];
    if (k !== void 0) return () => k;
    throw new Error(`Unknown identifier: ${t.v}`);
  }
  throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
}
function parseExpr(s) {
  const result = parseAddSub(s);
  if (peek(s).k !== "end") throw new Error("Unexpected trailing input");
  return result;
}
function compileWaveformExpression(src) {
  const toks = tokenize(src);
  const state = { toks, pos: 0 };
  return parseExpr(state);
}
function evaluateWaveformExpression(src, length, maxValue) {
  try {
    const op = compileWaveformExpression(src);
    const mid = maxValue / 2;
    const out = [];
    for (let i = 0; i < length; i++) {
      const x = i / length;
      const v = op({ x });
      const clamped = Math.max(-1, Math.min(1, v));
      out.push(Math.max(0, Math.min(maxValue, Math.round(clamped * mid + mid))));
    }
    return { data: out, error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : String(err) };
  }
}
const MATH_PRESETS = [
  { name: "Sine", expr: "sin(x*TAU)" },
  { name: "Triangle", expr: "tri(x)" },
  { name: "Saw", expr: "saw(x)" },
  { name: "Square", expr: "sq(x)" },
  { name: "25% Pulse", expr: "pulse(x, 0.25)" },
  { name: "Harmonic 1+3+5", expr: "sin(x*TAU) + sin(x*TAU*3)/3 + sin(x*TAU*5)/5" },
  { name: "Detuned dual sine", expr: "sin(x*TAU) * 0.5 + sin(x*TAU*1.01) * 0.5" },
  { name: "Soft saw", expr: "tri(x) * abs(sin(x*TAU*2))" },
  { name: "Sync-ish", expr: "saw(x*3) * 0.5 + sin(x*TAU)*0.5" },
  { name: "Noise burst", expr: "noise(x*32) * env(x, 0.01, 0.5)" },
  { name: "Bell-ish", expr: "sin(x*TAU) * env(x, 0.001, 0.99) + sin(x*TAU*3.1)*0.3*env(x, 0.001, 0.5)" },
  { name: "Brassy", expr: "sin(x*TAU + sin(x*TAU)*0.8)" },
  { name: "Plucked", expr: "(sin(x*TAU) + noise(x*100)*0.2) * env(x, 0.001, 0.9)" }
];
const MODE_TABS = [
  { id: "draw", label: "Draw", icon: Pencil },
  { id: "harmonic", label: "Harmonic", icon: ChartColumn },
  { id: "math", label: "Math", icon: SquareFunction },
  { id: "presets", label: "Presets", icon: LibraryBig }
];
const IconBtn = ({ onClick, title, active, children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    onClick,
    title,
    className: `p-1.5 rounded transition-colors border ${active ? "bg-accent-highlight/20 text-accent-highlight border-accent-highlight/50" : "bg-dark-bgSecondary text-text-muted hover:text-text-primary border-dark-border hover:border-dark-border/80"}`,
    children
  },
  void 0,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
    lineNumber: 58,
    columnNumber: 3
  },
  void 0
);
const StudioToolbar = ({
  mode,
  onModeChange,
  chipTarget,
  onChipTargetChange,
  layout,
  onLayoutChange,
  onDcRemove,
  onNormalize,
  onInvert,
  onReverse,
  onMirror,
  onQuarterReflect,
  onPhaseAlign,
  hasCompareBuffer,
  onCaptureCompare,
  onClearCompare,
  onSwapCompare
}) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center flex-wrap gap-2 px-2 py-1.5 bg-dark-bg border-b border-dark-border", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      IconBtn,
      {
        onClick: () => onLayoutChange(layout === "compact" ? "studio" : "compact"),
        title: layout === "compact" ? "Expand Studio" : "Compact view",
        children: layout === "compact" ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Maximize, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
          lineNumber: 86,
          columnNumber: 33
        }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Minimize, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
          lineNumber: 86,
          columnNumber: 58
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 82,
        columnNumber: 7
      },
      void 0
    ),
    layout === "studio" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-0.5 border border-dark-border rounded bg-dark-bgSecondary p-0.5", children: MODE_TABS.map((tab) => {
      const Icon = tab.icon;
      const isActive = mode === tab.id;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onModeChange(tab.id),
          className: `flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold uppercase transition-colors ${isActive ? "bg-accent-highlight/20 text-accent-highlight" : "text-text-muted hover:text-text-primary"}`,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Icon, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
              lineNumber: 105,
              columnNumber: 17
            }, void 0),
            tab.label
          ]
        },
        tab.id,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
          lineNumber: 96,
          columnNumber: 15
        },
        void 0
      );
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
      lineNumber: 91,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono text-text-muted uppercase", children: "Chip:" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 115,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: chipTarget,
          onChange: (v) => onChipTargetChange(v),
          options: CHIP_TARGET_ORDER.map((id) => ({
            value: id,
            label: CHIP_TARGETS[id].name
          })),
          className: "bg-dark-bgSecondary border border-dark-border rounded px-1.5 py-1 text-[10px] font-mono text-text-primary hover:border-accent-highlight/50 focus:outline-none focus:border-accent-highlight/50"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
          lineNumber: 116,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
      lineNumber: 114,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-5 bg-dark-border" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
      lineNumber: 128,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconBtn, { onClick: onDcRemove, title: "Remove DC offset (center waveform)", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Minus, { size: 14 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 132,
        columnNumber: 82
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 132,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconBtn, { onClick: onNormalize, title: "Normalize to full range", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Maximize2, { size: 14 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 133,
        columnNumber: 72
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 133,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconBtn, { onClick: onInvert, title: "Invert vertically", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FlipVertical, { size: 14 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 134,
        columnNumber: 63
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 134,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconBtn, { onClick: onReverse, title: "Reverse (time-flip)", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FlipHorizontal, { size: 14 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 135,
        columnNumber: 66
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 135,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
      lineNumber: 131,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-5 bg-dark-border" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
      lineNumber: 139,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconBtn, { onClick: onMirror, title: "Mirror left half to right", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Split, { size: 14 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 143,
        columnNumber: 71
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 143,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconBtn, { onClick: onQuarterReflect, title: "Quarter-wave reflect (symmetric)", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Contrast, { size: 14 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 144,
        columnNumber: 86
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 144,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconBtn, { onClick: onPhaseAlign, title: "Rotate peak to index 0", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RotateCcw, { size: 14 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 145,
        columnNumber: 72
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 145,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
      lineNumber: 142,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-5 bg-dark-border" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
      lineNumber: 149,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: !hasCompareBuffer ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: onCaptureCompare,
        title: "Capture current waveform as B (for A/B compare)",
        className: "px-2 py-1 rounded text-[10px] font-mono font-bold bg-dark-bgSecondary text-text-muted hover:text-text-primary border border-dark-border",
        children: "A/B"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
        lineNumber: 154,
        columnNumber: 11
      },
      void 0
    ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: onSwapCompare,
          title: "Swap A↔B",
          className: "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold bg-violet-600/20 text-violet-400 border border-violet-500/50",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowLeftRight, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
              lineNumber: 168,
              columnNumber: 15
            }, void 0),
            "A↔B"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
          lineNumber: 163,
          columnNumber: 13
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: onClearCompare,
          title: "Clear compare snapshot",
          className: "p-1.5 rounded text-text-muted hover:text-accent-error border border-dark-border",
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
            lineNumber: 176,
            columnNumber: 15
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
          lineNumber: 171,
          columnNumber: 13
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
      lineNumber: 162,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
      lineNumber: 152,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/StudioToolbar.tsx",
    lineNumber: 80,
    columnNumber: 5
  }, void 0);
};
const DrawCanvas = ({
  data,
  maxValue,
  height = 220,
  chipTarget,
  compareData,
  showSymmetryOverlay = false,
  showZeroCrossings = false,
  onChange
}) => {
  const canvasRef = reactExports.useRef(null);
  const [isDragging, setIsDragging] = reactExports.useState(false);
  const lastIdxRef = reactExports.useRef(null);
  const length = data.length || 32;
  const drawAll = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = Math.max(320, length * 12);
    const logicalHeight = height;
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    canvas.style.width = logicalWidth + "px";
    canvas.style.height = logicalHeight + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const w = logicalWidth;
    const h = logicalHeight;
    const cs = getComputedStyle(canvas);
    const bgColor = cs.getPropertyValue("--color-bg").trim() || "#0f0c0c";
    const gridColor = cs.getPropertyValue("--color-bg-secondary").trim() || "#1d1818";
    const borderColor = cs.getPropertyValue("--color-border").trim() || "#2f2525";
    const accentColor = cs.getPropertyValue("--color-accent-highlight").trim() || "#22d3ee";
    const overlayColor = cs.getPropertyValue("--color-accent-primary").trim() || "#10b981";
    const warnColor = cs.getPropertyValue("--color-accent-error").trim() || "#ef4444";
    const subtleColor = cs.getPropertyValue("--color-text-subtle").trim() || "#585050";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    if (chipTarget && chipTarget.bitDepth <= 6) {
      const levels = chipTarget.maxValue + 1;
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 0.5;
      for (let i = 1; i < levels; i++) {
        const y = h - i / (levels - 1) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = h / 4 * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const gridStep = Math.max(1, Math.floor(length / 8));
    for (let i = 0; i < length; i += gridStep) {
      const x = i / length * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    if (showZeroCrossings) {
      const mid = maxValue / 2;
      ctx.strokeStyle = subtleColor;
      ctx.lineWidth = 1;
      for (let i = 1; i < data.length; i++) {
        const a = data[i - 1] - mid;
        const b = data[i] - mid;
        if (a < 0 && b >= 0 || a > 0 && b <= 0) {
          const x = i / length * w;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }
    }
    if (showSymmetryOverlay) {
      const half = Math.floor(data.length / 2);
      ctx.strokeStyle = subtleColor;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (let i = 0; i < half; i++) {
        const mirrorIdx = data.length - 1 - i;
        const x = (mirrorIdx + 0.5) / length * w;
        const y = h - data[i] / maxValue * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (compareData && compareData.length > 0) {
      ctx.strokeStyle = overlayColor;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const cmpLen = compareData.length;
      for (let i = 0; i < cmpLen; i++) {
        const x = (i + 0.5) / cmpLen * w;
        const y = h - compareData[i] / maxValue * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const barWidth = w / length;
    ctx.fillStyle = accentColor;
    data.forEach((value, i) => {
      const x = i * barWidth;
      const normalizedValue = value / maxValue;
      const barHeight = normalizedValue * h;
      const y = h - barHeight;
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    });
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    data.forEach((value, i) => {
      const x = i / length * w + barWidth / 2;
      const y = h - value / maxValue * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (chipTarget) {
      let hasAlias = false;
      for (let i = 1; i < data.length; i++) {
        if (Math.abs(data[i] - data[i - 1]) > maxValue * 0.6) {
          hasAlias = true;
          break;
        }
      }
      if (hasAlias) {
        ctx.fillStyle = warnColor;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(0, 0, w, 4);
        ctx.globalAlpha = 1;
      }
    }
  }, [data, maxValue, length, height, chipTarget, compareData, showSymmetryOverlay, showZeroCrossings]);
  reactExports.useEffect(() => {
    drawAll();
  }, [drawAll]);
  const sampleFromEvent = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const idx = Math.max(0, Math.min(length - 1, Math.floor(x / rect.width * length)));
    const normalizedY = 1 - y / rect.height;
    const value = Math.round(normalizedY * maxValue);
    return { idx, value };
  };
  const handleMouseDown = (e) => {
    const hit = sampleFromEvent(e);
    if (!hit) return;
    setIsDragging(true);
    lastIdxRef.current = hit.idx;
    const newData = [...data];
    newData[hit.idx] = Math.max(0, Math.min(maxValue, hit.value));
    onChange(newData);
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const hit = sampleFromEvent(e);
    if (!hit) return;
    const fromIdx = lastIdxRef.current ?? hit.idx;
    const newData = penInterpolate(data, fromIdx, hit.idx, hit.value, maxValue);
    lastIdxRef.current = hit.idx;
    onChange(newData);
  };
  const handleMouseUp = () => {
    setIsDragging(false);
    lastIdxRef.current = null;
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative rounded border border-dark-border overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      width: Math.max(320, length * 12),
      height,
      className: "cursor-crosshair block w-full",
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/DrawCanvas.tsx",
      lineNumber: 263,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/DrawCanvas.tsx",
    lineNumber: 262,
    columnNumber: 5
  }, void 0);
};
const MathPanel = ({
  expr,
  onExprChange,
  length,
  maxValue,
  onDataChange
}) => {
  const [error, setError] = reactExports.useState(null);
  const applyExpression = reactExports.useCallback(
    (text) => {
      const result = evaluateWaveformExpression(text, length, maxValue);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        onDataChange(result.data);
      }
    },
    [length, maxValue, onDataChange]
  );
  const handleChange = (value) => {
    onExprChange(value);
    applyExpression(value);
  };
  const loadPreset = (presetExpr) => {
    onExprChange(presetExpr);
    applyExpression(presetExpr);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2 p-2 bg-dark-bgSecondary rounded border border-dark-border", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono font-bold text-text-primary uppercase", children: "Math / Expression" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
      lineNumber: 51,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
      lineNumber: 50,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono text-accent-highlight", children: "f(x) =" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 59,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "text",
            value: expr,
            onChange: (e) => handleChange(e.target.value),
            spellCheck: false,
            className: "flex-1 bg-dark-bg border border-dark-border rounded px-2 py-1 text-[11px] font-mono text-text-primary focus:outline-none focus:border-accent-highlight/50",
            placeholder: "sin(x*TAU)"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
            lineNumber: 60,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => applyExpression(expr),
            title: "Re-evaluate",
            className: "p-1 rounded text-text-muted hover:text-accent-highlight border border-dark-border",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Play, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
              lineNumber: 73,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
            lineNumber: 68,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
        lineNumber: 58,
        columnNumber: 9
      }, void 0),
      error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 px-2 py-1 bg-accent-error/10 border border-accent-error/30 rounded", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TriangleAlert, { size: 11, className: "text-accent-error flex-shrink-0" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 78,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono text-accent-error", children: error }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 79,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
        lineNumber: 77,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
      lineNumber: 57,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("details", { className: "text-[9px] font-mono", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("summary", { className: "cursor-pointer text-text-muted hover:text-text-primary", children: "Functions & variables" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
        lineNumber: 86,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-1 pl-3 space-y-0.5 text-text-subtle", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-highlight", children: "x" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
            lineNumber: 90,
            columnNumber: 16
          }, void 0),
          " — phase, 0..1"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 90,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-highlight", children: "PI, TAU, E" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
            lineNumber: 91,
            columnNumber: 16
          }, void 0),
          " — constants"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 91,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-highlight", children: "sin, cos, tan, abs, sqrt, exp, log" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 92,
          columnNumber: 16
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 92,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-highlight", children: "saw(x), tri(x), sq(x)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
            lineNumber: 93,
            columnNumber: 16
          }, void 0),
          " — bipolar waves"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 93,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-highlight", children: "pulse(x, duty)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
            lineNumber: 94,
            columnNumber: 16
          }, void 0),
          " — pulse with duty 0..1"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 94,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-highlight", children: "noise(x)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
            lineNumber: 95,
            columnNumber: 16
          }, void 0),
          " — deterministic noise"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 95,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-highlight", children: "env(x, attack, release)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
            lineNumber: 96,
            columnNumber: 16
          }, void 0),
          " — 0..1 envelope"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 96,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-highlight", children: "clamp, mix, min, max" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 97,
          columnNumber: 16
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 97,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
        lineNumber: 89,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
      lineNumber: 85,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono text-text-muted uppercase", children: "Examples:" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
        lineNumber: 103,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1", children: MATH_PRESETS.map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => loadPreset(p.expr),
          title: p.expr,
          className: "px-2 py-0.5 rounded text-[9px] font-mono bg-dark-bg text-text-muted hover:text-text-primary border border-dark-border hover:border-accent-highlight/50",
          children: p.name
        },
        p.name,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
          lineNumber: 106,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
        lineNumber: 104,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
      lineNumber: 102,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/MathPanel.tsx",
    lineNumber: 49,
    columnNumber: 5
  }, void 0);
};
const USER_PRESET_KEY = "devilbox:wavetable:user-presets";
function loadUserPresets() {
  try {
    const raw = localStorage.getItem(USER_PRESET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}
function saveUserPresets(presets) {
  try {
    localStorage.setItem(USER_PRESET_KEY, JSON.stringify(presets));
  } catch (err) {
    console.warn("[WaveformStudio] Failed to save user preset:", err);
  }
}
const PresetBrowser = ({
  currentLen,
  currentMax,
  currentData,
  onLoad
}) => {
  const [category, setCategory] = reactExports.useState("all");
  const [query, setQuery] = reactExports.useState("");
  const [userPresets, setUserPresets] = reactExports.useState(() => loadUserPresets());
  const filtered = reactExports.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (category === "user") {
      return userPresets.filter((p) => !q || p.name.toLowerCase().includes(q));
    }
    return FURNACE_WAVETABLE_PRESETS.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [category, query, userPresets]);
  const handleLoadFactory = (preset) => {
    const resampled = resample(preset.data, currentLen);
    const requantized = requantize(resampled, preset.max, currentMax);
    onLoad(requantized, currentLen, currentMax);
  };
  const handleLoadUser = (preset) => {
    const resampled = resample(preset.data, currentLen);
    const requantized = requantize(resampled, preset.max, currentMax);
    onLoad(requantized, currentLen, currentMax);
  };
  const handleSaveCurrent = () => {
    const name = window.prompt("Preset name:", `Custom ${userPresets.length + 1}`);
    if (!name) return;
    const newPreset = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      len: currentLen,
      max: currentMax,
      data: [...currentData],
      savedAt: Date.now()
    };
    const updated = [...userPresets, newPreset];
    setUserPresets(updated);
    saveUserPresets(updated);
  };
  const handleDeleteUser = (id) => {
    const updated = userPresets.filter((p) => p.id !== id);
    setUserPresets(updated);
    saveUserPresets(updated);
  };
  const CATEGORIES = [
    { id: "all", label: "All" },
    { id: "32x16", label: "4-bit" },
    { id: "32x32", label: "5-bit" },
    { id: "128x256", label: "8-bit" },
    { id: "user", label: "User" }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2 p-2 bg-dark-bgSecondary rounded border border-dark-border", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono font-bold text-text-primary uppercase", children: "Preset Browser" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
        lineNumber: 122,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: handleSaveCurrent,
          className: "flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono bg-dark-bg text-text-muted hover:text-accent-highlight border border-dark-border hover:border-accent-highlight/50",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Save, { size: 10 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
              lineNumber: 129,
              columnNumber: 11
            }, void 0),
            "Save current"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
          lineNumber: 125,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
      lineNumber: 121,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-0.5 bg-dark-bg border border-dark-border rounded p-0.5", children: CATEGORIES.map((c) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setCategory(c.id),
          className: `px-2 py-0.5 rounded text-[9px] font-mono uppercase transition-colors ${category === c.id ? "bg-accent-highlight/20 text-accent-highlight" : "text-text-muted hover:text-text-primary"}`,
          children: c.label
        },
        c.id,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
          lineNumber: 138,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
        lineNumber: 136,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center gap-1 bg-dark-bg border border-dark-border rounded px-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Search, { size: 11, className: "text-text-muted" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
          lineNumber: 152,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "text",
            value: query,
            onChange: (e) => setQuery(e.target.value),
            placeholder: "Search presets…",
            className: "flex-1 bg-transparent text-[10px] font-mono text-text-primary focus:outline-none py-1"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
            lineNumber: 153,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
        lineNumber: 151,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
      lineNumber: 135,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "grid gap-1.5 max-h-64 overflow-y-auto pr-1",
        style: { gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" },
        children: [
          category === "user" ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            filtered.map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative group", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => handleLoadUser(preset),
                  className: "w-full flex flex-col items-center gap-0.5 p-1.5 rounded border border-dark-border bg-dark-bg hover:border-accent-highlight/50 transition-colors",
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      WaveformThumbnail,
                      {
                        data: preset.data,
                        maxValue: preset.max,
                        width: 80,
                        height: 30,
                        color: "#22d3ee",
                        style: "line"
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
                        lineNumber: 176,
                        columnNumber: 19
                      },
                      void 0
                    ),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[9px] text-text-primary truncate w-full text-center", children: preset.name }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
                      lineNumber: 183,
                      columnNumber: 19
                    }, void 0),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[8px] text-text-muted", children: [
                      preset.len,
                      "×",
                      preset.max + 1
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
                      lineNumber: 186,
                      columnNumber: 19
                    }, void 0)
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
                  lineNumber: 172,
                  columnNumber: 17
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => handleDeleteUser(preset.id),
                  title: "Delete preset",
                  className: "absolute top-0.5 right-0.5 p-0.5 bg-dark-bgSecondary text-text-muted hover:text-accent-error rounded opacity-0 group-hover:opacity-100",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 10 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
                    lineNumber: 195,
                    columnNumber: 19
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
                  lineNumber: 190,
                  columnNumber: 17
                },
                void 0
              )
            ] }, preset.id, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
              lineNumber: 171,
              columnNumber: 15
            }, void 0)),
            filtered.length === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "col-span-full text-center text-[10px] font-mono text-text-muted py-4", children: 'No user presets yet. Click "Save current" to add one.' }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
              lineNumber: 200,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
            lineNumber: 169,
            columnNumber: 11
          }, void 0) : filtered.map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => handleLoadFactory(preset),
              className: "flex flex-col items-center gap-0.5 p-1.5 rounded border border-dark-border bg-dark-bg hover:border-accent-highlight/50 transition-colors",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  WaveformThumbnail,
                  {
                    data: preset.data,
                    maxValue: preset.max,
                    width: 80,
                    height: 30,
                    color: "#22d3ee",
                    style: "line"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
                    lineNumber: 212,
                    columnNumber: 15
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[9px] text-text-primary truncate w-full text-center", children: preset.name }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
                  lineNumber: 219,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[8px] text-text-muted", children: [
                  preset.len,
                  "×",
                  preset.max + 1
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
                  lineNumber: 222,
                  columnNumber: 15
                }, void 0)
              ]
            },
            preset.id,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
              lineNumber: 207,
              columnNumber: 13
            },
            void 0
          )),
          category !== "user" && filtered.length === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "col-span-full text-center text-[10px] font-mono text-text-muted py-4", children: "No matching presets." }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
            lineNumber: 229,
            columnNumber: 11
          }, void 0)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
        lineNumber: 164,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/PresetBrowser.tsx",
    lineNumber: 120,
    columnNumber: 5
  }, void 0);
};
function computeSpectrum(buffer) {
  let size = 1;
  while (size < buffer.length && size < 256) size *= 2;
  if (size < 16) size = 16;
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  for (let i = 0; i < buffer.length && i < size; i++) re[i] = buffer[i];
  fft(re, im);
  const bins = size / 2;
  const mags = [];
  let peak = 0;
  for (let i = 1; i <= bins; i++) {
    const r = re[i] ?? 0;
    const m = im[i] ?? 0;
    const mag = Math.sqrt(r * r + m * m);
    mags.push(mag);
    if (mag > peak) peak = mag;
  }
  if (peak > 0) {
    for (let i = 0; i < mags.length; i++) mags[i] /= peak;
  }
  return mags;
}
const LivePanels = ({
  data,
  maxValue,
  compareData,
  compareMax
}) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 260;
    const h = 140;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const cs = getComputedStyle(canvas);
    const bgColor = cs.getPropertyValue("--color-bg").trim() || "#0f0c0c";
    const gridColor = cs.getPropertyValue("--color-bg-secondary").trim() || "#1d1818";
    const accentColor = cs.getPropertyValue("--color-accent-highlight").trim() || "#22d3ee";
    const compareColor = cs.getPropertyValue("--color-accent-primary").trim() || "#10b981";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = h / 4 * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    if (data.length > 0) {
      const buf = toFloat(data, maxValue);
      const mags = computeSpectrum(buf);
      const barWidth = w / mags.length;
      ctx.fillStyle = accentColor;
      for (let i = 0; i < mags.length; i++) {
        const db = mags[i] < 1e-6 ? -120 : 20 * Math.log10(mags[i]);
        const norm = Math.max(0, Math.min(1, (db + 60) / 60));
        const bh = norm * h;
        ctx.fillRect(i * barWidth, h - bh, Math.max(1, barWidth - 1), bh);
      }
    }
    if (compareData && compareData.length > 0) {
      const buf = toFloat(compareData, compareMax ?? maxValue);
      const mags = computeSpectrum(buf);
      const barWidth = w / mags.length;
      ctx.strokeStyle = compareColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let i = 0; i < mags.length; i++) {
        const db = mags[i] < 1e-6 ? -120 : 20 * Math.log10(mags[i]);
        const norm = Math.max(0, Math.min(1, (db + 60) / 60));
        const y = h - norm * h;
        const x = i * barWidth + barWidth / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [data, maxValue, compareData, compareMax]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1 p-2 bg-dark-bgSecondary rounded border border-dark-border", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono font-bold text-text-primary uppercase", children: "Spectrum" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
        lineNumber: 132,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono text-text-muted", children: "log / 60 dB" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
        lineNumber: 135,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
      lineNumber: 131,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, className: "block rounded" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
      lineNumber: 137,
      columnNumber: 7
    }, void 0),
    compareData && compareData.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-[9px] font-mono", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-2 h-2 rounded-sm bg-accent-highlight" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
          lineNumber: 141,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "A (current)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
          lineNumber: 142,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
        lineNumber: 140,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-2 h-2 rounded-sm bg-accent-primary" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
          lineNumber: 145,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "B (snapshot)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
          lineNumber: 146,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
        lineNumber: 144,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
      lineNumber: 139,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/LivePanels.tsx",
    lineNumber: 130,
    columnNumber: 5
  }, void 0);
};
const generateWaveform = (type, length, maxValue) => {
  const data = [];
  const mid = maxValue / 2;
  for (let i = 0; i < length; i++) {
    const phase = i / length;
    let value;
    switch (type) {
      case "sine":
        value = Math.sin(phase * 2 * Math.PI) * mid + mid;
        break;
      case "triangle":
        value = phase < 0.5 ? phase * 4 * mid : (1 - phase) * 4 * mid;
        break;
      case "saw":
        value = phase * maxValue;
        break;
      case "square":
        value = phase < 0.5 ? maxValue : 0;
        break;
      case "pulse25":
        value = phase < 0.25 ? maxValue : 0;
        break;
      case "pulse12":
        value = phase < 0.125 ? maxValue : 0;
        break;
      case "noise":
        value = Math.random() * maxValue;
        break;
      default:
        value = mid;
    }
    data.push(Math.round(Math.max(0, Math.min(maxValue, value))));
  }
  return data;
};
const resampleData = (data, targetLen) => {
  if (data.length === targetLen) return data;
  const result = [];
  const ratio = data.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    const a = data[srcIndex];
    const b = data[(srcIndex + 1) % data.length];
    result.push(Math.round(a + (b - a) * frac));
  }
  return result;
};
const WavetableEditor = ({
  wavetable,
  onChange,
  onRemove,
  height = 180,
  initialLayout = "compact"
}) => {
  const fileInputRef = reactExports.useRef(null);
  const [showGenerator, setShowGenerator] = reactExports.useState(false);
  const [layout, setLayout] = reactExports.useState(initialLayout);
  const [mode, setMode] = reactExports.useState("draw");
  const [chipTarget, setChipTarget] = reactExports.useState(
    () => detectChipTarget(wavetable.data.length || 32, wavetable.max ?? 15)
  );
  const [compareBuffer, setCompareBuffer] = reactExports.useState(null);
  const [compareMax, setCompareMax] = reactExports.useState(wavetable.max ?? 15);
  const [harmonics, setHarmonics] = reactExports.useState(() => {
    const arr = new Array(32).fill(0);
    arr[0] = 1;
    return arr;
  });
  const [mathExpr, setMathExpr] = reactExports.useState("sin(x*TAU)");
  const maxValue = wavetable.max ?? 15;
  const length = wavetable.data.length || 32;
  const targetConfig = CHIP_TARGETS[chipTarget];
  const handleChipTargetChange = reactExports.useCallback(
    (newTargetId) => {
      const newTarget = CHIP_TARGETS[newTargetId];
      setChipTarget(newTargetId);
      if (length === newTarget.defaultLen && maxValue === newTarget.maxValue) return;
      const result = applyChipTarget(wavetable.data, maxValue, newTarget.defaultLen, newTarget.maxValue);
      onChange({ ...wavetable, data: result.data, len: result.len, max: result.max });
    },
    [length, maxValue, wavetable, onChange]
  );
  const handleImport = async (e) => {
    var _a;
    const file = (_a = e.target.files) == null ? void 0 : _a[0];
    if (!file) return;
    try {
      if (file.name.endsWith(".h")) {
        const text = await file.text();
        const values = text.split(/[\s,]+/).map((v) => parseInt(v)).filter((v) => !isNaN(v));
        if (values.length > 0) {
          const importMax = Math.max(...values);
          const scaled = values.map((v) => Math.round(v / importMax * maxValue));
          const resampled = resampleData(scaled, length);
          onChange({ ...wavetable, data: resampled });
        }
      } else {
        const { getDevilboxAudioContext } = await __vitePreload(async () => {
          const { getDevilboxAudioContext: getDevilboxAudioContext2 } = await import("./main-BbV5VyEH.js").then((n) => n.iK);
          return { getDevilboxAudioContext: getDevilboxAudioContext2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
        let audioCtx;
        try {
          audioCtx = getDevilboxAudioContext();
        } catch {
          audioCtx = new AudioContext();
        }
        const arrayBuffer = await file.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        const rawData = buffer.getChannelData(0);
        const values = Array.from(rawData).map((v) => Math.round((v + 1) / 2 * maxValue));
        const resampled = resampleData(values, length);
        onChange({ ...wavetable, data: resampled });
      }
    } catch (err) {
      console.error("Failed to import wavetable:", err);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const applyWaveform = (type) => {
    const newData = generateWaveform(type, length, maxValue);
    onChange({ ...wavetable, data: newData });
    setShowGenerator(false);
  };
  const resizeWavetable = (newLength) => {
    const min = targetConfig.minLen;
    const max = targetConfig.maxLen;
    const step = targetConfig.lenStep;
    const snapped = Math.round(newLength / step) * step;
    if (snapped < min || snapped > max) return;
    const newData = [];
    for (let i = 0; i < snapped; i++) {
      const srcIndex = i / snapped * wavetable.data.length;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(wavetable.data.length - 1, srcIndexFloor + 1);
      const frac = srcIndex - srcIndexFloor;
      const value = wavetable.data[srcIndexFloor] * (1 - frac) + wavetable.data[srcIndexCeil] * frac;
      newData.push(Math.round(value));
    }
    onChange({ ...wavetable, data: newData, len: snapped });
  };
  const setMaxValueHandler = (newMax) => {
    if (newMax < 1 || newMax > 255) return;
    const scale = newMax / maxValue;
    const newData = wavetable.data.map((v) => Math.round(v * scale));
    onChange({ ...wavetable, data: newData, max: newMax });
  };
  const clearWavetable = () => {
    const mid = Math.floor(maxValue / 2);
    onChange({ ...wavetable, data: Array(length).fill(mid) });
  };
  const updateData = reactExports.useCallback(
    (newData) => {
      onChange({ ...wavetable, data: newData });
    },
    [wavetable, onChange]
  );
  const opDcRemove = reactExports.useCallback(() => updateData(dcRemove(wavetable.data, maxValue)), [wavetable.data, maxValue, updateData]);
  const opNormalize = reactExports.useCallback(() => updateData(normalize(wavetable.data, maxValue)), [wavetable.data, maxValue, updateData]);
  const opInvert = reactExports.useCallback(() => updateData(invert(wavetable.data, maxValue)), [wavetable.data, maxValue, updateData]);
  const opReverse = reactExports.useCallback(() => updateData(reverse(wavetable.data)), [wavetable.data, updateData]);
  const opMirror = reactExports.useCallback(() => updateData(mirrorLeftToRight(wavetable.data)), [wavetable.data, updateData]);
  const opQuarterReflect = reactExports.useCallback(() => updateData(quarterWaveReflect(wavetable.data, maxValue)), [wavetable.data, maxValue, updateData]);
  const opPhaseAlign = reactExports.useCallback(() => updateData(phaseAlignToPeak(wavetable.data)), [wavetable.data, updateData]);
  const captureCompare = reactExports.useCallback(() => {
    setCompareBuffer([...wavetable.data]);
    setCompareMax(maxValue);
  }, [wavetable.data, maxValue]);
  const clearCompare = reactExports.useCallback(() => {
    setCompareBuffer(null);
  }, []);
  const swapCompare = reactExports.useCallback(() => {
    if (!compareBuffer) return;
    const currentData = [...wavetable.data];
    updateData(compareBuffer);
    setCompareBuffer(currentData);
  }, [compareBuffer, wavetable.data, updateData]);
  reactExports.useEffect(() => {
  }, []);
  const showStudioPanels = layout === "studio";
  const showLivePanels = layout === "studio";
  const headerBadge = reactExports.useMemo(() => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 14, className: "text-accent-highlight" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
      lineNumber: 276,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[10px] font-bold text-text-primary", children: [
      "Wave ",
      wavetable.id
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
      lineNumber: 277,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted", children: [
      length,
      "×",
      maxValue + 1
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
      lineNumber: 280,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
    lineNumber: 275,
    columnNumber: 5
  }, void 0), [wavetable.id, length, maxValue]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary rounded-lg border border-dark-border overflow-hidden", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-3 py-2 bg-dark-bg border-b border-dark-border", children: [
      headerBadge,
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              var _a;
              return (_a = fileInputRef.current) == null ? void 0 : _a.click();
            },
            className: "p-1 text-accent-highlight hover:bg-accent-highlight/20 rounded",
            title: "Import .wav or .h wave",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileUp, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
              lineNumber: 298,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
            lineNumber: 293,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            ref: fileInputRef,
            type: "file",
            accept: ".wav,.h,.fuw",
            onChange: handleImport,
            className: "hidden"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
            lineNumber: 300,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setShowGenerator(!showGenerator),
              className: "p-1 text-amber-400 hover:bg-amber-500/20 rounded",
              title: "Generate waveform",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WandSparkles, { size: 14 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                lineNumber: 314,
                columnNumber: 15
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
              lineNumber: 309,
              columnNumber: 13
            },
            void 0
          ),
          showGenerator && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-full right-0 mt-1 bg-dark-bg border border-dark-border rounded shadow-lg z-20 min-w-[120px]", children: ["sine", "triangle", "saw", "square", "pulse25", "pulse12", "noise"].map(
            (type) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => applyWaveform(type),
                className: "w-full px-3 py-1.5 text-left text-[10px] font-mono text-text-primary hover:bg-dark-bgSecondary capitalize",
                children: type
              },
              type,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                lineNumber: 320,
                columnNumber: 21
              },
              void 0
            )
          ) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
            lineNumber: 317,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
          lineNumber: 308,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: clearWavetable,
            className: "p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded",
            title: "Clear",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Copy, { size: 14, className: "rotate-180" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
              lineNumber: 337,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
            lineNumber: 332,
            columnNumber: 11
          },
          void 0
        ),
        onRemove && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onRemove,
            className: "p-1 text-accent-error hover:text-accent-error hover:bg-accent-error/20 rounded",
            title: "Remove wavetable",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Trash2, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
              lineNumber: 345,
              columnNumber: 15
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
            lineNumber: 340,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
        lineNumber: 291,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
      lineNumber: 289,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      StudioToolbar,
      {
        mode,
        onModeChange: setMode,
        chipTarget,
        onChipTargetChange: handleChipTargetChange,
        layout,
        onLayoutChange: setLayout,
        onDcRemove: opDcRemove,
        onNormalize: opNormalize,
        onInvert: opInvert,
        onReverse: opReverse,
        onMirror: opMirror,
        onQuarterReflect: opQuarterReflect,
        onPhaseAlign: opPhaseAlign,
        hasCompareBuffer: compareBuffer !== null,
        onCaptureCompare: captureCompare,
        onClearCompare: clearCompare,
        onSwapCompare: swapCompare
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
        lineNumber: 352,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: `p-2 ${showStudioPanels ? "grid gap-2" : "flex flex-col gap-2"}`,
        style: showStudioPanels ? { gridTemplateColumns: "minmax(0, 1fr) 280px" } : void 0,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 min-w-0", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              DrawCanvas,
              {
                data: wavetable.data,
                maxValue,
                height,
                chipTarget: targetConfig,
                compareData: compareBuffer,
                onChange: updateData
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                lineNumber: 377,
                columnNumber: 11
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-2 py-1.5 bg-dark-bg rounded border border-dark-border text-[9px] font-mono", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "Length:" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                  lineNumber: 389,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: () => resizeWavetable(length - targetConfig.lenStep),
                    className: "text-text-muted hover:text-text-primary disabled:opacity-40",
                    disabled: targetConfig.lockedLen || length <= targetConfig.minLen,
                    children: "÷"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                    lineNumber: 390,
                    columnNumber: 15
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-primary", children: length }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                  lineNumber: 397,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: () => resizeWavetable(length + targetConfig.lenStep),
                    className: "text-text-muted hover:text-text-primary disabled:opacity-40",
                    disabled: targetConfig.lockedLen || length >= targetConfig.maxLen,
                    children: "×"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                    lineNumber: 398,
                    columnNumber: 15
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                lineNumber: 388,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "Height:" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                  lineNumber: 407,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  CustomSelect,
                  {
                    value: String(maxValue),
                    onChange: (v) => setMaxValueHandler(parseInt(v)),
                    disabled: targetConfig.lockedDepth,
                    className: "bg-dark-bgSecondary border border-dark-border rounded px-1 py-0.5 text-text-primary disabled:opacity-50",
                    options: [
                      { value: "3", label: "4" },
                      { value: "7", label: "8" },
                      { value: "15", label: "16" },
                      { value: "31", label: "32" },
                      { value: "63", label: "64" },
                      { value: "127", label: "128" },
                      { value: "255", label: "256" }
                    ]
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                    lineNumber: 408,
                    columnNumber: 15
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                lineNumber: 406,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-subtle text-[9px]", children: targetConfig.description }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                lineNumber: 424,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
              lineNumber: 387,
              columnNumber: 11
            }, void 0),
            showStudioPanels && mode === "harmonic" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              HarmonicPanel,
              {
                harmonics,
                onHarmonicsChange: setHarmonics,
                length,
                maxValue,
                onDataChange: updateData
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                lineNumber: 431,
                columnNumber: 13
              },
              void 0
            ),
            showStudioPanels && mode === "math" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              MathPanel,
              {
                expr: mathExpr,
                onExprChange: setMathExpr,
                length,
                maxValue,
                onDataChange: updateData
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                lineNumber: 440,
                columnNumber: 13
              },
              void 0
            ),
            showStudioPanels && mode === "presets" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              PresetBrowser,
              {
                currentLen: length,
                currentMax: maxValue,
                currentData: wavetable.data,
                onLoad: (data, len, max) => onChange({ ...wavetable, data, len, max })
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                lineNumber: 449,
                columnNumber: 13
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
            lineNumber: 376,
            columnNumber: 9
          }, void 0),
          showLivePanels && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            LivePanels,
            {
              data: wavetable.data,
              maxValue,
              compareData: compareBuffer,
              compareMax
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
              lineNumber: 463,
              columnNumber: 13
            },
            void 0
          ) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
            lineNumber: 462,
            columnNumber: 11
          }, void 0)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
        lineNumber: 373,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
    lineNumber: 287,
    columnNumber: 5
  }, void 0);
};
const WavetableListEditor = ({
  wavetables,
  onChange,
  maxWavetables = 64
}) => {
  const [selectedWave, setSelectedWave] = reactExports.useState(
    wavetables.length > 0 ? 0 : null
  );
  const addWavetable = () => {
    if (wavetables.length >= maxWavetables) return;
    const newId = wavetables.length > 0 ? Math.max(...wavetables.map((w) => w.id)) + 1 : 0;
    const newWave = {
      id: newId,
      data: generateWaveform("sine", 32, 15),
      len: 32,
      max: 15
    };
    onChange([...wavetables, newWave]);
    setSelectedWave(wavetables.length);
  };
  const removeWavetable = (index) => {
    const newWavetables = wavetables.filter((_, i) => i !== index);
    onChange(newWavetables);
    if (selectedWave === index) {
      setSelectedWave(
        newWavetables.length > 0 ? Math.min(index, newWavetables.length - 1) : null
      );
    } else if (selectedWave !== null && selectedWave > index) {
      setSelectedWave(selectedWave - 1);
    }
  };
  const updateWavetable = (index, updated) => {
    const newWavetables = [...wavetables];
    newWavetables[index] = updated;
    onChange(newWavetables);
  };
  const duplicateWavetable = (index) => {
    if (wavetables.length >= maxWavetables) return;
    const source = wavetables[index];
    const newId = Math.max(...wavetables.map((w) => w.id)) + 1;
    const newWave = {
      ...source,
      id: newId,
      data: [...source.data]
    };
    onChange([...wavetables, newWave]);
    setSelectedWave(wavetables.length);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 flex-wrap", children: [
      wavetables.map((wave, index) => {
        const isSelected = selectedWave === index;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setSelectedWave(index),
            className: `flex flex-col items-center gap-0.5 px-2 py-1 rounded border transition-colors
                ${isSelected ? "bg-accent-highlight/20 border-accent-highlight" : "bg-dark-bg border-dark-border hover:border-dark-border/80"}`,
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                WaveformThumbnail,
                {
                  data: wave.data,
                  maxValue: wave.max ?? 15,
                  width: 52,
                  height: 18,
                  color: isSelected ? "#22d3ee" : "#4b5563",
                  style: "bar"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                  lineNumber: 550,
                  columnNumber: 15
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "span",
                {
                  className: `font-mono text-[9px] ${isSelected ? "text-accent-highlight" : "text-text-muted"}`,
                  children: [
                    "Wave ",
                    wave.id
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                  lineNumber: 558,
                  columnNumber: 15
                },
                void 0
              )
            ]
          },
          wave.id,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
            lineNumber: 541,
            columnNumber: 13
          },
          void 0
        );
      }),
      wavetables.length < maxWavetables && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: addWavetable,
            className: "px-3 py-1.5 rounded border border-dashed border-dark-border text-text-muted hover:text-text-primary hover:border-accent text-[10px] font-mono flex items-center gap-1",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Plus, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                lineNumber: 573,
                columnNumber: 15
              }, void 0),
              "Add"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
            lineNumber: 569,
            columnNumber: 13
          },
          void 0
        ),
        selectedWave !== null && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => duplicateWavetable(selectedWave),
            className: "px-3 py-1.5 rounded border border-dashed border-dark-border text-text-muted hover:text-text-primary hover:border-accent-highlight text-[10px] font-mono flex items-center gap-1",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Copy, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
                lineNumber: 581,
                columnNumber: 17
              }, void 0),
              "Duplicate"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
            lineNumber: 577,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
        lineNumber: 568,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
      lineNumber: 537,
      columnNumber: 7
    }, void 0),
    selectedWave !== null && wavetables[selectedWave] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      WavetableEditor,
      {
        wavetable: wavetables[selectedWave],
        onChange: (w) => updateWavetable(selectedWave, w),
        onRemove: wavetables.length > 1 ? () => removeWavetable(selectedWave) : void 0
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
        lineNumber: 591,
        columnNumber: 9
      },
      void 0
    ),
    wavetables.length === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center py-8 text-text-muted text-sm", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 32, className: "mx-auto mb-2 opacity-50" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
        lineNumber: 601,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { children: "No wavetables" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
        lineNumber: 602,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: addWavetable,
          className: "mt-2 text-accent hover:underline text-xs",
          children: "Add your first wavetable"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
          lineNumber: 603,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
      lineNumber: 600,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/WavetableEditor.tsx",
    lineNumber: 535,
    columnNumber: 5
  }, void 0);
};
export {
  WavetableEditor,
  WavetableListEditor,
  WavetableEditor as default
};
