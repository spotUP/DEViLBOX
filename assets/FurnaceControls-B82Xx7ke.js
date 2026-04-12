const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { im as FurnaceMacroType, c9 as ScrollLockContainer, aB as Knob, W as CustomSelect, am as __vitePreload } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, P as Plus, a4 as Minus, W as Repeat, a5 as Flag, Z as Zap, N as RotateCcw, j as Cpu, Q as Activity, e as Settings, A as Music, $ as Waves, F as FileUp, V as Volume2, i as ChevronUp, h as ChevronDown, p as Trash2 } from "./vendor-ui-AJ7AT9BN.js";
import { I as InstrumentOscilloscope } from "./InstrumentOscilloscope-CE7eIp2-.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { V as VisualizerFrame } from "./VisualizerFrame-7GhRHAT_.js";
import { WavetableListEditor } from "./WavetableEditor-wq3DMlO8.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { W as WaveformThumbnail } from "./WaveformThumbnail-CebZPsAz.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
import "./SpectralFilter-Dxe-YniK.js";
import "./HarmonicBarsCanvas-tCyue1dW.js";
import "./GTVisualMapping-BkrLaqE6.js";
const BW = 22;
const BH = 16;
const BW2 = BW / 2;
const BH2 = BH / 2;
const C_CARRIER = "#f59e0b";
const C_MOD = "#3b5b8a";
const C_MOD_RING = "#60a5fa";
const C_SELECTED = "#10b981";
const C_SEL_RING = "#6ee7b7";
const C_CONN = "#64748b";
const C_FEEDBACK = "#f472b6";
const C_OUTPUT = "#22c55e";
const ALG_4OP = [
  // 0 ── Full serial:  4 → 3 → 2 → 1 → OUT
  {
    pos: { 4: [22, 41], 3: [62, 41], 2: [102, 41], 1: [145, 41] },
    mods: [[4, 3], [3, 2], [2, 1]],
    carriers: [1]
  },
  // 1 ── (4+3) → 2 → 1 → OUT
  {
    pos: { 4: [22, 25], 3: [22, 57], 2: [82, 41], 1: [148, 41] },
    mods: [[4, 2], [3, 2], [2, 1]],
    carriers: [1]
  },
  // 2 ── 4 → 3 → 1,  2 → 1 → OUT   (two modulators feed OP1)
  {
    pos: { 4: [22, 20], 3: [72, 20], 2: [22, 62], 1: [147, 41] },
    mods: [[4, 3], [3, 1], [2, 1]],
    carriers: [1]
  },
  // 3 ── 4 → 3 → 1,  2 → 3 → 1     (OP2 feeds OP3, not directly OP1)
  {
    pos: { 4: [22, 22], 3: [78, 41], 2: [22, 60], 1: [148, 41] },
    mods: [[4, 3], [2, 3], [3, 1]],
    carriers: [1]
  },
  // 4 ── (4 → 3) + (2 → 1) → OUT    (dual parallel chains)
  {
    pos: { 4: [22, 22], 3: [82, 22], 2: [22, 60], 1: [82, 60] },
    mods: [[4, 3], [2, 1]],
    carriers: [3, 1],
    busX: 148
  },
  // 5 ── 4 → (3 + 2 + 1) → OUT      (OP4 fans out to all three carriers)
  {
    pos: { 4: [20, 41], 3: [97, 15], 2: [97, 41], 1: [97, 67] },
    mods: [[4, 3], [4, 2], [4, 1]],
    carriers: [3, 2, 1],
    busX: 153
  },
  // 6 ── (4 → 3) + 2 + 1 → OUT      (OP2/OP1 free carriers)
  {
    pos: { 4: [22, 18], 3: [82, 18], 2: [82, 42], 1: [82, 66] },
    mods: [[4, 3]],
    carriers: [3, 2, 1],
    busX: 148
  },
  // 7 ── Full parallel:  4 + 3 + 2 + 1 → OUT
  {
    pos: { 4: [22, 10], 3: [22, 30], 2: [22, 50], 1: [22, 70] },
    mods: [],
    carriers: [4, 3, 2, 1],
    busX: 90
  }
];
const ALG_2OP = [
  // 0 ── Serial:  2 → 1 → OUT
  {
    pos: { 2: [40, 41], 1: [100, 41] },
    mods: [[2, 1]],
    carriers: [1]
  },
  // 1 ── Additive: 2 + 1 → OUT
  {
    pos: { 2: [40, 24], 1: [40, 58] },
    mods: [],
    carriers: [2, 1],
    busX: 106
  }
];
function curvePath(x1, y1, x2, y2) {
  if (Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}
const ArrowRight = ({ x, y, color }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("polygon", { points: `${x},${y} ${x - 5},${y - 3} ${x - 5},${y + 3}`, fill: color }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
  lineNumber: 162,
  columnNumber: 3
}, void 0);
const FMAlgorithmDiagram = ({
  algorithm,
  feedback,
  opCount = 4,
  selectedOp = null,
  onSelectOp,
  accentColor = C_CARRIER,
  className = ""
}) => {
  const algList = opCount === 2 ? ALG_2OP : ALG_4OP;
  const alg = algList[Math.max(0, Math.min(algorithm, algList.length - 1))];
  const opNumbers = opCount === 2 ? [2, 1] : [4, 3, 2, 1];
  const carrierCys = alg.carriers.map((op) => alg.pos[op][1]);
  const minCy = Math.min(...carrierCys);
  const maxCy = Math.max(...carrierCys);
  const midCy = (minCy + maxCy) / 2;
  const isSingle = alg.carriers.length === 1;
  const outSx = isSingle ? alg.pos[alg.carriers[0]][0] + BW2 : alg.busX ?? 160;
  const outSy = isSingle ? alg.pos[alg.carriers[0]][1] : midCy;
  const outArrowX = 195;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: `bg-dark-bg rounded border border-dark-border select-none ${className}`,
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "svg",
        {
          viewBox: "0 0 210 82",
          className: "w-full",
          style: { height: 72 },
          overflow: "visible",
          children: [
            alg.mods.map(([from, to], i) => {
              const [fx, fy] = alg.pos[from];
              const [tx, ty] = alg.pos[to];
              const x1 = fx + BW2;
              const x2 = tx - BW2;
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("g", { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "path",
                  {
                    d: curvePath(x1, fy, x2, ty),
                    fill: "none",
                    stroke: C_CONN,
                    strokeWidth: 1
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                    lineNumber: 212,
                    columnNumber: 15
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowRight, { x: x2, y: ty, color: C_CONN }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                  lineNumber: 218,
                  columnNumber: 15
                }, void 0)
              ] }, i, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                lineNumber: 211,
                columnNumber: 13
              }, void 0);
            }),
            feedback > 0 && (() => {
              const op4 = opCount === 2 ? 2 : 4;
              const [cx, cy] = alg.pos[op4];
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "path",
                {
                  d: `M ${cx + BW2} ${cy} Q ${cx} ${cy - 18} ${cx - BW2} ${cy}`,
                  fill: "none",
                  stroke: C_FEEDBACK,
                  strokeWidth: 1,
                  strokeDasharray: "2,2"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                  lineNumber: 228,
                  columnNumber: 13
                },
                void 0
              );
            })(),
            isSingle && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("g", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "line",
                {
                  x1: outSx,
                  y1: outSy,
                  x2: outArrowX - 4,
                  y2: outSy,
                  stroke: C_OUTPUT,
                  strokeWidth: 1.5
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                  lineNumber: 241,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowRight, { x: outArrowX, y: outSy, color: C_OUTPUT }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                lineNumber: 246,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
              lineNumber: 240,
              columnNumber: 11
            }, void 0),
            !isSingle && alg.busX !== void 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("g", { children: [
              alg.carriers.map((op) => {
                const [cx, cy] = alg.pos[op];
                return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "line",
                  {
                    x1: cx + BW2,
                    y1: cy,
                    x2: alg.busX,
                    y2: cy,
                    stroke: C_OUTPUT,
                    strokeWidth: 1
                  },
                  op,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                    lineNumber: 257,
                    columnNumber: 17
                  },
                  void 0
                );
              }),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "line",
                {
                  x1: alg.busX,
                  y1: minCy,
                  x2: alg.busX,
                  y2: maxCy,
                  stroke: C_OUTPUT,
                  strokeWidth: 1.5
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                  lineNumber: 265,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "line",
                {
                  x1: alg.busX,
                  y1: midCy,
                  x2: outArrowX - 4,
                  y2: midCy,
                  stroke: C_OUTPUT,
                  strokeWidth: 1.5
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                  lineNumber: 271,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowRight, { x: outArrowX, y: midCy, color: C_OUTPUT }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                lineNumber: 276,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
              lineNumber: 252,
              columnNumber: 11
            }, void 0),
            opNumbers.map((opNum) => {
              const [cx, cy] = alg.pos[opNum];
              const isCarrier = alg.carriers.includes(opNum);
              const isSelected = selectedOp === opNum;
              let fill = isCarrier ? accentColor : C_MOD;
              let stroke = isCarrier ? "#fcd34d" : C_MOD_RING;
              if (isSelected) {
                fill = C_SELECTED;
                stroke = C_SEL_RING;
              }
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "g",
                {
                  style: { cursor: onSelectOp ? "pointer" : "default" },
                  onClick: () => onSelectOp == null ? void 0 : onSelectOp(opNum),
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "rect",
                      {
                        x: cx - BW2,
                        y: cy - BH2,
                        width: BW,
                        height: BH,
                        rx: 2,
                        fill,
                        stroke,
                        strokeWidth: isSelected ? 1.5 : 1
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                        lineNumber: 296,
                        columnNumber: 15
                      },
                      void 0
                    ),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "text",
                      {
                        x: cx,
                        y: cy + 4,
                        textAnchor: "middle",
                        fontSize: "9",
                        fontFamily: "monospace",
                        fontWeight: "bold",
                        fill: isCarrier || isSelected ? "#000" : "#e2e8f0",
                        children: opNum
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                        lineNumber: 304,
                        columnNumber: 15
                      },
                      void 0
                    )
                  ]
                },
                opNum,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                  lineNumber: 291,
                  columnNumber: 13
                },
                void 0
              );
            }),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "text",
              {
                x: outArrowX + 3,
                y: outSy + 3,
                fontSize: "7",
                fontFamily: "monospace",
                fontWeight: "bold",
                fill: C_OUTPUT,
                children: "OUT"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                lineNumber: 319,
                columnNumber: 9
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "text",
              {
                x: 105,
                y: 80,
                textAnchor: "middle",
                fontSize: "7",
                fontFamily: "monospace",
                fill: "#475569",
                children: [
                  "ALG ",
                  algorithm,
                  " · FB ",
                  feedback
                ]
              },
              void 0,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
                lineNumber: 331,
                columnNumber: 9
              },
              void 0
            )
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
          lineNumber: 198,
          columnNumber: 7
        },
        void 0
      )
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/FMAlgorithmDiagram.tsx",
      lineNumber: 195,
      columnNumber: 5
    },
    void 0
  );
};
const MACRO_TYPE_NAMES = {
  [FurnaceMacroType.VOL]: "Volume",
  [FurnaceMacroType.ARP]: "Arpeggio",
  [FurnaceMacroType.DUTY]: "Duty",
  [FurnaceMacroType.WAVE]: "Waveform",
  [FurnaceMacroType.PITCH]: "Pitch",
  [FurnaceMacroType.EX1]: "Extra 1",
  [FurnaceMacroType.EX2]: "Extra 2",
  [FurnaceMacroType.EX3]: "Extra 3",
  [FurnaceMacroType.ALG]: "Algorithm",
  [FurnaceMacroType.FB]: "Feedback",
  [FurnaceMacroType.FMS]: "FM LFO Speed",
  [FurnaceMacroType.AMS]: "AM LFO Speed",
  [FurnaceMacroType.PAN_L]: "Pan Left",
  [FurnaceMacroType.PAN_R]: "Pan Right",
  [FurnaceMacroType.PHASE_RESET]: "Phase Reset",
  [FurnaceMacroType.EX4]: "Extra 4",
  [FurnaceMacroType.EX5]: "Extra 5",
  [FurnaceMacroType.EX6]: "Extra 6",
  [FurnaceMacroType.EX7]: "Extra 7",
  [FurnaceMacroType.EX8]: "Extra 8",
  [FurnaceMacroType.FMS2]: "FM LFO Speed 2",
  [FurnaceMacroType.AMS2]: "AM LFO Speed 2"
};
const ARP_NOTE_REFS = [
  { value: -12, label: "−Oct", color: "rgba(90, 180, 255, 0.45)" },
  { value: -7, label: "−5th", color: "rgba(90, 180, 255, 0.22)" },
  { value: -5, label: "−4th", color: "rgba(90, 180, 255, 0.18)" },
  { value: -4, label: "−M3", color: "rgba(90, 180, 255, 0.18)" },
  { value: -3, label: "−m3", color: "rgba(90, 180, 255, 0.18)" },
  { value: 0, label: "Root", color: "rgba(80, 255, 120, 0.65)" },
  { value: 3, label: "m3", color: "rgba(90, 180, 255, 0.18)" },
  { value: 4, label: "M3", color: "rgba(90, 180, 255, 0.18)" },
  { value: 5, label: "4th", color: "rgba(90, 180, 255, 0.18)" },
  { value: 7, label: "5th", color: "rgba(90, 180, 255, 0.45)" },
  { value: 9, label: "M6", color: "rgba(90, 180, 255, 0.22)" },
  { value: 10, label: "m7", color: "rgba(90, 180, 255, 0.18)" },
  { value: 12, label: "+Oct", color: "rgba(90, 180, 255, 0.45)" }
];
const MACRO_PRESETS = {
  [FurnaceMacroType.VOL]: [
    { name: "Fade In", data: [0, 2, 4, 6, 8, 10, 12, 14, 15, 15, 15, 15, 15, 15, 15, 15] },
    { name: "Fade Out", data: [15, 13, 11, 9, 7, 5, 3, 1, 0] },
    { name: "Tremolo", data: [15, 8, 15, 8, 15, 8, 15, 8], loop: 0 },
    { name: "Gate", data: [15, 15, 15, 15, 0, 0, 0, 0], loop: 0 },
    { name: "Staccato", data: [15, 0, 0, 0], loop: 0 },
    { name: "Organ", data: [12, 12, 12, 12, 12, 12, 12, 12, 8, 8, 8, 8, 6, 6, 5, 4], loop: 2, release: 8 },
    { name: "Piano", data: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] }
  ],
  [FurnaceMacroType.ARP]: [
    { name: "Major", data: [0, 4, 7, 0, 4, 7], loop: 0 },
    { name: "Minor", data: [0, 3, 7, 0, 3, 7], loop: 0 },
    { name: "Power", data: [0, 7, 0, 7], loop: 0 },
    { name: "Octave", data: [0, 12, 0, 12], loop: 0 },
    { name: "Maj 7th", data: [0, 4, 7, 11], loop: 0 },
    { name: "Dom 7th", data: [0, 4, 7, 10], loop: 0 },
    { name: "Min 7th", data: [0, 3, 7, 10], loop: 0 },
    { name: "Chromatic", data: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], loop: 0 },
    { name: "Diminished", data: [0, 3, 6, 0, 3, 6], loop: 0 }
  ],
  [FurnaceMacroType.PITCH]: [
    { name: "Vibrato", data: [0, 2, 4, 2, 0, -2, -4, -2], loop: 0 },
    { name: "Vib Fast", data: [0, 4, 0, -4, 0, 4, 0, -4], loop: 0 },
    { name: "Trill", data: [0, 2, 0, 2, 0, 2, 0, 2], loop: 0 },
    { name: "Bend Up", data: [0, 2, 4, 6, 8, 10, 12] },
    { name: "Bend Down", data: [0, -2, -4, -6, -8, -10, -12] },
    { name: "Drop", data: [0, 0, 0, 0, 0, -3, -6, -9, -12] },
    { name: "Scoop", data: [-8, -6, -4, -2, 0] }
  ],
  [FurnaceMacroType.DUTY]: [
    { name: "Square", data: [2] },
    { name: "Pulse 25%", data: [1] },
    { name: "Pulse 12%", data: [0] },
    { name: "PWM Up", data: [0, 0, 1, 1, 2, 2, 3, 3], loop: 0 },
    { name: "PWM Down", data: [3, 3, 2, 2, 1, 1, 0, 0], loop: 0 },
    { name: "PWM Slow", data: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1], loop: 0 }
  ]
};
function formatMacroValue(value, macroType) {
  const sign = (v) => v > 0 ? `+${v}` : `${v}`;
  switch (macroType) {
    case FurnaceMacroType.ARP: {
      const ref = ARP_NOTE_REFS.find((r) => r.value === value);
      return ref ? `${sign(value)} (${ref.label})` : sign(value);
    }
    case FurnaceMacroType.PITCH:
      return sign(value);
    case FurnaceMacroType.VOL:
      return `Vol ${value}`;
    case FurnaceMacroType.DUTY:
      return `Duty ${value}`;
    case FurnaceMacroType.WAVE:
      return `Wave ${value}`;
    default:
      return `${value}`;
  }
}
const MacroEditor = ({
  macro,
  macroType,
  onChange,
  minValue = 0,
  maxValue = 15,
  height = 120,
  color = "#a78bfa",
  label,
  bipolar = false,
  playbackPosition
}) => {
  const canvasRef = reactExports.useRef(null);
  const containerRef = reactExports.useRef(null);
  const [isDragging, setIsDragging] = reactExports.useState(false);
  const [isSettingLoop, setIsSettingLoop] = reactExports.useState(false);
  const [isSettingRelease, setIsSettingRelease] = reactExports.useState(false);
  const [showPresets, setShowPresets] = reactExports.useState(false);
  const [hoveredStep, setHoveredStep] = reactExports.useState(null);
  const dragStartRef = reactExports.useRef(null);
  const isLineModeRef = reactExports.useRef(false);
  const macroLabel = label || MACRO_TYPE_NAMES[macroType] || `Macro ${macroType}`;
  const presets = MACRO_PRESETS[macroType] ?? [];
  const isArpMacro = macroType === FurnaceMacroType.ARP && bipolar;
  const stepWidth = Math.max(8, Math.min(20, 400 / Math.max(macro.data.length, 1)));
  const canvasWidth = Math.max(400, macro.data.length * stepWidth);
  const drawMacro = reactExports.useCallback(() => {
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
    const range = maxValue - minValue;
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
    if (bipolar && minValue < 0) {
      const zeroY = h * (maxValue / range);
      ctx.strokeStyle = "#5a5a8e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(w, zeroY);
      ctx.stroke();
    }
    if (isArpMacro) {
      ctx.setLineDash([3, 6]);
      ARP_NOTE_REFS.forEach((ref) => {
        if (ref.value < minValue || ref.value > maxValue) return;
        const y = h - (ref.value - minValue) / range * h;
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
    for (let i = 0; i < macro.data.length; i += 4) {
      const x = i / macro.data.length * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    if (macro.loop >= 0 && macro.loop < macro.data.length) {
      const loopX = macro.loop / macro.data.length * w;
      const releaseX = macro.release >= 0 ? macro.release / macro.data.length * w : w;
      ctx.fillStyle = "rgba(59, 130, 246, 0.10)";
      ctx.fillRect(loopX, 0, releaseX - loopX, h);
    }
    const barWidth = w / macro.data.length;
    macro.data.forEach((value, i) => {
      const x = i * barWidth;
      const normalizedValue = (value - minValue) / range;
      const barHeight = normalizedValue * h;
      const y = h - barHeight;
      const isHovered = (hoveredStep == null ? void 0 : hoveredStep.step) === i;
      ctx.fillStyle = isHovered ? "rgba(255, 255, 255, 0.85)" : color;
      ctx.strokeStyle = isHovered ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
      ctx.strokeRect(x + 1, y, barWidth - 2, barHeight);
    });
    if (macro.loop >= 0 && macro.loop < macro.data.length) {
      const loopX = macro.loop / macro.data.length * w;
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(loopX, 0);
      ctx.lineTo(loopX, h);
      ctx.stroke();
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.moveTo(loopX - 6, 10);
      ctx.lineTo(loopX, 0);
      ctx.lineTo(loopX + 6, 10);
      ctx.closePath();
      ctx.fill();
    }
    if (macro.release >= 0 && macro.release < macro.data.length) {
      const releaseX = macro.release / macro.data.length * w;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(releaseX, 0);
      ctx.lineTo(releaseX, h);
      ctx.stroke();
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(releaseX - 5, 5, 10, 10);
    }
    if (typeof playbackPosition === "number" && playbackPosition >= 0 && playbackPosition < macro.data.length) {
      const px = (playbackPosition + 0.5) / macro.data.length * w;
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
  }, [macro, minValue, maxValue, color, bipolar, isArpMacro, canvasWidth, height, hoveredStep, playbackPosition]);
  reactExports.useEffect(() => {
    drawMacro();
  }, [drawMacro]);
  const getStepFromMouse = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { step: 0, value: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const step = Math.max(0, Math.min(macro.data.length - 1, Math.floor(x / rect.width * macro.data.length)));
    const range = maxValue - minValue;
    const value = Math.max(minValue, Math.min(maxValue, Math.round(minValue + (1 - y / rect.height) * range)));
    return { step, value };
  };
  const applyLine = reactExports.useCallback((startStep, startVal, endStep, endVal) => {
    const newData = [...macro.data];
    const lo = Math.min(startStep, endStep);
    const hi = Math.max(startStep, endStep);
    for (let s = lo; s <= hi; s++) {
      const t = hi === lo ? 0 : (s - lo) / (hi - lo);
      const v = startStep <= endStep ? startVal + (endVal - startVal) * t : endVal + (startVal - endVal) * (1 - t);
      newData[s] = Math.max(minValue, Math.min(maxValue, Math.round(v)));
    }
    onChange({ ...macro, data: newData });
  }, [macro, minValue, maxValue, onChange]);
  const handleMouseDown = (e) => {
    if (isSettingLoop || isSettingRelease) {
      const { step: step2 } = getStepFromMouse(e);
      if (isSettingLoop) {
        onChange({ ...macro, loop: step2 });
        setIsSettingLoop(false);
      } else {
        onChange({ ...macro, release: step2 });
        setIsSettingRelease(false);
      }
      return;
    }
    setIsDragging(true);
    const { step, value } = getStepFromMouse(e);
    dragStartRef.current = { step, value };
    isLineModeRef.current = e.shiftKey;
    if (!e.shiftKey) {
      const newData = [...macro.data];
      newData[step] = value;
      onChange({ ...macro, data: newData });
    }
  };
  const handleMouseMove = (e) => {
    const { step, value } = getStepFromMouse(e);
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const currentValue = macro.data[step] ?? value;
      setHoveredStep({
        step,
        value: currentValue,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
    if (!isDragging) return;
    if (isLineModeRef.current && dragStartRef.current) {
      applyLine(dragStartRef.current.step, dragStartRef.current.value, step, value);
    } else {
      const newData = [...macro.data];
      newData[step] = value;
      onChange({ ...macro, data: newData });
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
    if (macro.data.length >= 256) return;
    onChange({ ...macro, data: [...macro.data, macro.data[macro.data.length - 1] ?? 0] });
  };
  const removeStep = () => {
    if (macro.data.length <= 1) return;
    const newData = macro.data.slice(0, -1);
    const newLoop = macro.loop >= newData.length ? newData.length - 1 : macro.loop;
    const newRelease = macro.release >= newData.length ? newData.length - 1 : macro.release;
    onChange({ ...macro, data: newData, loop: newLoop, release: newRelease });
  };
  const resetMacro = () => {
    onChange({
      ...macro,
      data: Array(macro.data.length).fill(bipolar ? 0 : minValue),
      loop: -1,
      release: -1
    });
  };
  const applyPreset = (preset) => {
    onChange({
      ...macro,
      data: [...preset.data],
      loop: preset.loop ?? -1,
      release: preset.release ?? -1
    });
    setShowPresets(false);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary rounded-lg border border-dark-border overflow-hidden", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-3 py-2 bg-dark-bg border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-xs font-bold text-text-primary uppercase tracking-wider", children: macroLabel }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
          lineNumber: 466,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted font-mono", children: [
          macro.data.length,
          " steps"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
          lineNumber: 469,
          columnNumber: 11
        }, void 0),
        isArpMacro && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-blue-400/70 font-mono hidden sm:inline", children: "shift+drag = line" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
          lineNumber: 473,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
        lineNumber: 465,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1 text-[10px] text-text-muted mr-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Spd:" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
            lineNumber: 482,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "number",
              min: 1,
              max: 16,
              value: macro.speed ?? 1,
              onChange: (e) => onChange({ ...macro, speed: parseInt(e.target.value) || 1 }),
              className: "w-8 bg-dark-bg border border-dark-border rounded px-1 py-0.5 text-text-primary text-[10px] font-mono"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 483,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
          lineNumber: 481,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: removeStep,
            className: "p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded",
            title: "Remove step",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Minus, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 495,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
            lineNumber: 492,
            columnNumber: 11
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
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 500,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
            lineNumber: 497,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              setIsSettingLoop(!isSettingLoop);
              setIsSettingRelease(false);
            },
            className: `p-1 rounded transition-colors ${isSettingLoop ? "bg-blue-500 text-text-primary" : "text-blue-400 hover:bg-blue-500/20"}`,
            title: isSettingLoop ? "Click canvas to set loop point" : "Set loop point",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Repeat, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 510,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
            lineNumber: 504,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              setIsSettingRelease(!isSettingRelease);
              setIsSettingLoop(false);
            },
            className: `p-1 rounded transition-colors ${isSettingRelease ? "bg-red-500 text-text-primary" : "text-red-400 hover:bg-red-500/20"}`,
            title: isSettingRelease ? "Click canvas to set release point" : "Set release point",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Flag, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 520,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
            lineNumber: 514,
            columnNumber: 11
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
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                lineNumber: 534,
                columnNumber: 17
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 526,
              columnNumber: 15
            },
            void 0
          ),
          showPresets && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-full right-0 mt-1 bg-dark-bg border border-dark-border rounded-lg shadow-xl z-30 min-w-[130px]", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-2 py-1 text-[9px] text-text-muted font-mono uppercase border-b border-dark-border", children: "Patterns" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 538,
              columnNumber: 19
            }, void 0),
            presets.map((preset, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => applyPreset(preset),
                className: "w-full px-3 py-1.5 text-left text-[10px] font-mono text-text-primary hover:bg-dark-bgSecondary flex items-center justify-between gap-4",
                children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: preset.name }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                    lineNumber: 546,
                    columnNumber: 23
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[9px]", children: [
                    preset.data.length,
                    "st"
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                    lineNumber: 547,
                    columnNumber: 23
                  }, void 0)
                ]
              },
              i,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                lineNumber: 542,
                columnNumber: 21
              },
              void 0
            ))
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
            lineNumber: 537,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
          lineNumber: 525,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: resetMacro,
            className: "p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded",
            title: "Reset macro",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RotateCcw, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 559,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
            lineNumber: 556,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
        lineNumber: 479,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
      lineNumber: 464,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        ref: containerRef,
        className: "relative overflow-x-auto",
        style: { height: height + 20 },
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "canvas",
            {
              ref: canvasRef,
              style: { display: "block" },
              className: `${isSettingLoop || isSettingRelease ? "cursor-crosshair" : "cursor-pointer"}`,
              onMouseDown: handleMouseDown,
              onMouseMove: handleMouseMove,
              onMouseUp: handleMouseUp,
              onMouseLeave: handleMouseLeave
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 570,
              columnNumber: 9
            },
            void 0
          ),
          hoveredStep && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute pointer-events-none z-20 bg-dark-bg/95 border border-dark-border rounded px-2 py-1 text-[10px] font-mono text-text-primary shadow-lg",
              style: {
                left: Math.min(hoveredStep.x + 10, canvasWidth - 110),
                top: Math.max(4, hoveredStep.y - 30),
                whiteSpace: "nowrap"
              },
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted mr-1", children: [
                  "#",
                  hoveredStep.step,
                  ":"
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                  lineNumber: 592,
                  columnNumber: 13
                }, void 0),
                formatMacroValue(hoveredStep.value, macroType)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 584,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute bottom-0 left-0 right-0 flex items-center gap-4 px-2 py-0.5 bg-dark-bg/80 text-[9px] font-mono", children: [
            macro.loop >= 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => onChange({ ...macro, loop: -1 }),
                className: "flex items-center gap-1 text-blue-400 hover:text-blue-300",
                children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Repeat, { size: 9 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                    lineNumber: 603,
                    columnNumber: 15
                  }, void 0),
                  " Loop@",
                  macro.loop,
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted ml-0.5", children: "×" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                    lineNumber: 604,
                    columnNumber: 15
                  }, void 0)
                ]
              },
              void 0,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                lineNumber: 600,
                columnNumber: 13
              },
              void 0
            ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "No loop" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 607,
              columnNumber: 13
            }, void 0),
            macro.release >= 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => onChange({ ...macro, release: -1 }),
                className: "flex items-center gap-1 text-red-400 hover:text-red-300",
                children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Flag, { size: 9 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                    lineNumber: 614,
                    columnNumber: 15
                  }, void 0),
                  " Release@",
                  macro.release,
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted ml-0.5", children: "×" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                    lineNumber: 615,
                    columnNumber: 15
                  }, void 0)
                ]
              },
              void 0,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                lineNumber: 611,
                columnNumber: 13
              },
              void 0
            ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "No release" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 618,
              columnNumber: 13
            }, void 0),
            typeof playbackPosition === "number" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-yellow-400 ml-auto", children: [
              "▶ ",
              playbackPosition
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 622,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
            lineNumber: 598,
            columnNumber: 9
          }, void 0)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
        lineNumber: 565,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
    lineNumber: 462,
    columnNumber: 5
  }, void 0);
};
const MacroListEditor = ({
  macros,
  onChange,
  playbackPositions
}) => {
  const [showAddMenu, setShowAddMenu] = reactExports.useState(false);
  const getMacroRange = (macroType) => {
    switch (macroType) {
      case FurnaceMacroType.VOL:
        return { min: 0, max: 15, bipolar: false };
      case FurnaceMacroType.ARP:
        return { min: -12, max: 12, bipolar: true };
      case FurnaceMacroType.DUTY:
        return { min: 0, max: 3, bipolar: false };
      case FurnaceMacroType.WAVE:
        return { min: 0, max: 255, bipolar: false };
      case FurnaceMacroType.PITCH:
        return { min: -128, max: 127, bipolar: true };
      case FurnaceMacroType.ALG:
        return { min: 0, max: 7, bipolar: false };
      case FurnaceMacroType.FB:
        return { min: 0, max: 7, bipolar: false };
      default:
        return { min: 0, max: 15, bipolar: false };
    }
  };
  const getMacroColor = (macroType) => {
    const colors = {
      [FurnaceMacroType.VOL]: "#22c55e",
      [FurnaceMacroType.ARP]: "#3b82f6",
      [FurnaceMacroType.DUTY]: "#f59e0b",
      [FurnaceMacroType.WAVE]: "#06b6d4",
      [FurnaceMacroType.PITCH]: "#ec4899"
    };
    return colors[macroType] ?? "#a78bfa";
  };
  const addMacro = (type) => {
    const range = getMacroRange(type);
    const newMacro = {
      type,
      data: Array(16).fill(range.bipolar ? 0 : range.min),
      loop: -1,
      release: -1,
      mode: 0,
      speed: 1
    };
    onChange([...macros, newMacro]);
    setShowAddMenu(false);
  };
  const removeMacro = (index) => {
    onChange(macros.filter((_, i) => i !== index));
  };
  const updateMacro = (index, updated) => {
    const newMacros = [...macros];
    newMacros[index] = updated;
    onChange(newMacros);
  };
  const availableTypes = Object.entries(MACRO_TYPE_NAMES).filter(([typeNum]) => !macros.some((m) => m.type === parseInt(typeNum))).map(([typeNum, name]) => ({ type: parseInt(typeNum), name }));
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-2", style: { gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }, children: macros.map((macro, index) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-dark-border rounded-lg overflow-hidden flex flex-col", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-2 py-1 bg-dark-bg select-none", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "w-2.5 h-2.5 rounded-sm flex-shrink-0",
              style: { backgroundColor: getMacroColor(macro.type) }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 701,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[10px] font-bold text-text-primary", children: MACRO_TYPE_NAMES[macro.type] || `Macro ${macro.type}` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
            lineNumber: 705,
            columnNumber: 17
          }, void 0),
          typeof (playbackPositions == null ? void 0 : playbackPositions[macro.type]) === "number" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-yellow-400", children: [
            "▶ ",
            playbackPositions[macro.type]
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
            lineNumber: 709,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
          lineNumber: 700,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => removeMacro(index),
            className: "text-red-400 hover:text-red-300 text-xs px-1 hover:bg-red-500/10 rounded",
            children: "×"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
            lineNumber: 712,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
        lineNumber: 699,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        MacroEditor,
        {
          macro,
          macroType: macro.type,
          onChange: (m) => updateMacro(index, m),
          ...getMacroRange(macro.type),
          color: getMacroColor(macro.type),
          height: 50,
          playbackPosition: playbackPositions == null ? void 0 : playbackPositions[macro.type]
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
          lineNumber: 721,
          columnNumber: 13
        },
        void 0
      )
    ] }, index, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
      lineNumber: 697,
      columnNumber: 11
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
      lineNumber: 695,
      columnNumber: 7
    }, void 0),
    availableTypes.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setShowAddMenu(!showAddMenu),
          className: `w-full py-1.5 border border-dashed rounded-lg text-xs font-mono flex items-center justify-center gap-2 transition-colors ${showAddMenu ? "border-accent text-text-primary bg-dark-bgSecondary" : "border-dark-border text-text-muted hover:text-text-primary hover:border-accent"}`,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Plus, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
              lineNumber: 745,
              columnNumber: 13
            }, void 0),
            "Add Macro"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
          lineNumber: 737,
          columnNumber: 11
        },
        void 0
      ),
      showAddMenu && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-full left-0 right-0 mt-1 bg-dark-bg border border-dark-border rounded-lg shadow-xl z-10 max-h-52 overflow-y-auto", children: availableTypes.map(({ type, name }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => addMacro(type),
          className: "w-full px-3 py-2 text-left text-xs font-mono text-text-primary hover:bg-dark-bgSecondary flex items-center gap-2",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "div",
              {
                className: "w-2 h-2 rounded-sm flex-shrink-0",
                style: { backgroundColor: getMacroColor(type) }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
                lineNumber: 756,
                columnNumber: 19
              },
              void 0
            ),
            name
          ]
        },
        type,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
          lineNumber: 751,
          columnNumber: 17
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
        lineNumber: 749,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
      lineNumber: 736,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/MacroEditor.tsx",
    lineNumber: 693,
    columnNumber: 5
  }, void 0);
};
function getChipParameterRanges(chipType) {
  if ([0, 13, 14].includes(chipType)) {
    return {
      tl: { min: 0, max: 127 },
      ar: { min: 0, max: 31 },
      dr: { min: 0, max: 31 },
      d2r: { min: 0, max: 31 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: -3, max: 3 },
      rs: { min: 0, max: 3 },
      hasD2R: true,
      hasSSG: true,
      hasWS: false,
      hasDT2: false,
      isOPZ: false,
      opCount: 4
    };
  }
  if (chipType === 1) {
    return {
      tl: { min: 0, max: 127 },
      ar: { min: 0, max: 31 },
      dr: { min: 0, max: 31 },
      d2r: { min: 0, max: 31 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: -3, max: 3 },
      dt2: { min: 0, max: 3 },
      rs: { min: 0, max: 3 },
      hasD2R: true,
      hasSSG: false,
      hasWS: false,
      hasDT2: true,
      isOPZ: false,
      opCount: 4
    };
  }
  if ([2, 23, 26].includes(chipType)) {
    return {
      tl: { min: 0, max: 63 },
      ar: { min: 0, max: 15 },
      dr: { min: 0, max: 15 },
      d2r: { min: 0, max: 0 },
      // OPL has no D2R
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: 0, max: 0 },
      // OPL has no detune
      rs: { min: 0, max: 0 },
      // OPL uses KSL instead
      ksl: { min: 0, max: 3 },
      ws: { min: 0, max: 7 },
      hasD2R: false,
      hasSSG: false,
      hasWS: true,
      hasDT2: false,
      isOPZ: false,
      opCount: 4
    };
  }
  if (chipType === 11) {
    return {
      tl: { min: 0, max: 63 },
      // Modulator: 63, Carrier: 15
      ar: { min: 0, max: 15 },
      dr: { min: 0, max: 15 },
      d2r: { min: 0, max: 0 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: 0, max: 0 },
      rs: { min: 0, max: 0 },
      ksl: { min: 0, max: 3 },
      hasD2R: false,
      hasSSG: false,
      hasWS: false,
      hasDT2: false,
      isOPZ: false,
      opCount: 2
    };
  }
  if (chipType === 22) {
    return {
      tl: { min: 0, max: 127 },
      ar: { min: 0, max: 31 },
      dr: { min: 0, max: 31 },
      d2r: { min: 0, max: 31 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: -3, max: 3 },
      dt2: { min: 0, max: 3 },
      rs: { min: 0, max: 3 },
      hasD2R: true,
      hasSSG: false,
      hasWS: false,
      hasDT2: true,
      isOPZ: true,
      opCount: 4
    };
  }
  return {
    tl: { min: 0, max: 127 },
    ar: { min: 0, max: 31 },
    dr: { min: 0, max: 31 },
    d2r: { min: 0, max: 31 },
    rr: { min: 0, max: 15 },
    sl: { min: 0, max: 15 },
    mult: { min: 0, max: 15 },
    dt: { min: -3, max: 3 },
    rs: { min: 0, max: 3 },
    hasD2R: true,
    hasSSG: true,
    hasWS: false,
    hasDT2: false,
    isOPZ: false,
    opCount: 4
  };
}
const FurnaceEditor = ({ config, instrumentId, onChange }) => {
  var _a, _b;
  const [activeTab, setActiveTab] = reactExports.useState("fm");
  const [macroSubTab, setMacroSubTab] = reactExports.useState("global");
  const [selectedOp, setSelectedOp] = reactExports.useState(null);
  const fileInputRef = reactExports.useRef(null);
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const pushLiveUpdate = reactExports.useCallback((updates) => {
    onChange(updates);
    try {
      const { getToneEngine } = require("@engine/ToneEngine");
      const engine = getToneEngine();
      const synth = engine.instruments.get(instrumentId);
      if (synth == null ? void 0 : synth.remapRegisters) {
        const merged = { ...configRef.current, ...updates };
        synth.remapRegisters(merged);
      }
    } catch {
    }
  }, [onChange, instrumentId]);
  const handleDiagramSelect = reactExports.useCallback((opNum) => {
    setSelectedOp((prev) => prev === opNum ? null : opNum);
  }, []);
  const handleImport = async (e) => {
    var _a2;
    const file = (_a2 = e.target.files) == null ? void 0 : _a2[0];
    if (!file) return;
    try {
      if (file.name.endsWith(".fuw")) {
        const arrayBuffer = await file.arrayBuffer();
        const dataView = new DataView(arrayBuffer);
        const wavetableData = [];
        for (let i = 32; i < arrayBuffer.byteLength; i += 4) {
          if (i + 4 <= arrayBuffer.byteLength) {
            wavetableData.push(dataView.getUint32(i, true));
          }
        }
        if (wavetableData.length > 0) {
          const newWavetables = [...config.wavetables, {
            id: config.wavetables.length,
            data: wavetableData,
            len: wavetableData.length,
            max: Math.max(...wavetableData)
          }];
          onChange({ wavetables: newWavetables });
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
        const values = Array.from(rawData).map((v) => Math.round((v + 1) / 2 * 15));
        const newWavetables = [...config.wavetables, {
          id: config.wavetables.length,
          data: values,
          len: values.length,
          max: 15
        }];
        onChange({ wavetables: newWavetables });
      }
    } catch (err) {
      console.error("Failed to import Furnace wavetable:", err);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const updateOperator = reactExports.useCallback((idx, updates) => {
    const newOps = [...config.operators];
    newOps[idx] = { ...newOps[idx], ...updates };
    pushLiveUpdate({ operators: newOps });
  }, [config.operators, pushLiveUpdate]);
  const chipName = getChipName(config.chipType);
  const category = getChipCategory(config.chipType);
  const paramRanges = reactExports.useMemo(() => getChipParameterRanges(config.chipType), [config.chipType]);
  const hasOpMacros = ((_a = config.opMacroArrays) == null ? void 0 : _a.some((arr) => arr && arr.length > 0)) ?? false;
  const opOrder = reactExports.useMemo(() => {
    if (paramRanges.opCount === 2) return [0, 1];
    return [0, 2, 1, 3];
  }, [paramRanges.opCount]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ScrollLockContainer, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between bg-dark-bgSecondary p-3 rounded-lg border border-dark-border/50", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-700 rounded flex items-center justify-center shadow-lg shadow-indigo-900/20", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cpu, { size: 20, className: "text-text-primary" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 304,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 303,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "font-bold text-text-primary text-sm tracking-tight", children: chipName }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 307,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted font-mono uppercase bg-dark-bg px-1.5 py-0.5 rounded border border-dark-border", children: [
              category,
              " • ",
              paramRanges.opCount,
              "OP"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 309,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-emerald-400 font-mono flex items-center gap-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 8 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 313,
                columnNumber: 17
              }, void 0),
              " Ready"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 312,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 308,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 306,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 302,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 mx-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VisualizerFrame, { variant: "compact", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        InstrumentOscilloscope,
        {
          instrumentId,
          width: "auto",
          height: 40,
          color: "#a78bfa",
          backgroundColor: "transparent",
          className: "w-full"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 322,
          columnNumber: 13
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 321,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 320,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "FMS",
            value: config.fms ?? 0,
            min: 0,
            max: 7,
            onChange: (v) => pushLiveUpdate({ fms: Math.round(v) }),
            size: "sm",
            color: "#8b5cf6",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 335,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "AMS",
            value: config.ams ?? 0,
            min: 0,
            max: 3,
            onChange: (v) => pushLiveUpdate({ ams: Math.round(v) }),
            size: "sm",
            color: "#a78bfa",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 345,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 334,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 301,
      columnNumber: 7
    }, void 0),
    category === "FM" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 bg-dark-bg p-1 rounded-lg border border-dark-border", children: ["fm", "macros", ...paramRanges.hasDT2 ? ["chip"] : []].map((tab) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(tab),
        className: `flex-1 py-1.5 px-3 rounded text-xs font-mono uppercase transition-colors ${activeTab === tab ? "bg-amber-600 text-text-primary" : "text-text-muted hover:text-text-primary hover:bg-dark-bgSecondary"}`,
        children: tab === "fm" ? "Operators" : tab === "macros" ? "Macros" : "Settings"
      },
      tab,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 362,
        columnNumber: 13
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 360,
      columnNumber: 9
    }, void 0),
    category === "FM" && activeTab === "fm" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in duration-200", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "md:col-span-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FMAlgorithmDiagram,
          {
            algorithm: config.algorithm,
            feedback: config.feedback,
            opCount: paramRanges.opCount,
            selectedOp,
            onSelectOp: handleDiagramSelect
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 384,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 383,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-3 rounded-lg border border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "ALG",
              value: config.algorithm,
              min: 0,
              max: 7,
              onChange: (v) => pushLiveUpdate({ algorithm: Math.round(v) }),
              size: "md",
              color: "#f59e0b",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 396,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "FB",
              value: config.feedback,
              min: 0,
              max: 7,
              onChange: (v) => pushLiveUpdate({ feedback: Math.round(v) }),
              size: "md",
              color: "#d97706",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 406,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 395,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 394,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 381,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: opOrder.slice(0, paramRanges.opCount).map((opIdx) => {
        const op = config.operators[opIdx];
        if (!op) return null;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          OperatorCard,
          {
            index: opIdx,
            op,
            onUpdate: (u) => updateOperator(opIdx, u),
            ranges: paramRanges,
            isCarrier: isOperatorCarrier(config.algorithm, opIdx),
            isSelected: selectedOp === opIdx + 1
          },
          opIdx,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 426,
            columnNumber: 15
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 421,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 379,
      columnNumber: 9
    }, void 0),
    category === "FM" && activeTab === "macros" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in duration-200", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-violet-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 445,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Macro Editor" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 446,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted", children: "Draw to edit • Loop (blue) • Release (red)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 447,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 444,
        columnNumber: 11
      }, void 0),
      hasOpMacros && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-0.5 mb-3 bg-dark-bg p-0.5 rounded border border-dark-border", children: ["global", "op1", "op2", "op3", "op4"].map((sub) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setMacroSubTab(sub),
          className: `flex-1 py-1 px-2 rounded text-[10px] font-mono uppercase transition-colors ${macroSubTab === sub ? "bg-violet-600 text-text-primary" : "text-text-muted hover:text-text-primary hover:bg-dark-bgSecondary"}`,
          children: sub === "global" ? "Global" : sub.toUpperCase()
        },
        sub,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 453,
          columnNumber: 17
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 451,
        columnNumber: 13
      }, void 0),
      macroSubTab === "global" || !hasOpMacros ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        MacroListEditor,
        {
          macros: config.macros,
          onChange: (macros) => onChange({ macros }),
          chipType: config.chipType
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 469,
          columnNumber: 13
        },
        void 0
      ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        MacroListEditor,
        {
          macros: (config.opMacroArrays ?? [[], [], [], []])[parseInt(macroSubTab.slice(2)) - 1] ?? [],
          onChange: (macros) => {
            const opIdx = parseInt(macroSubTab.slice(2)) - 1;
            const newOpArrays = [...config.opMacroArrays ?? [[], [], [], []]];
            newOpArrays[opIdx] = macros;
            onChange({ opMacroArrays: newOpArrays });
          },
          chipType: config.chipType
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 475,
          columnNumber: 13
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 443,
      columnNumber: 9
    }, void 0),
    category === "FM" && activeTab === "chip" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in duration-200", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 16, className: "text-accent-highlight" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 493,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Chip Settings" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 494,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 492,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4", children: paramRanges.hasDT2 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "FMS2",
          value: config.fms2 ?? 0,
          min: 0,
          max: 7,
          onChange: (v) => pushLiveUpdate({ fms2: Math.round(v) }),
          size: "sm",
          color: "#06b6d4",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 500,
          columnNumber: 17
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 499,
        columnNumber: 15
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 497,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 491,
      columnNumber: 9
    }, void 0),
    config.chipType === 5 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GBPanel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 519,
      columnNumber: 9
    }, void 0),
    config.chipType === 10 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(C64Panel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 524,
      columnNumber: 9
    }, void 0),
    config.chipType === 24 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SNESPanel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 529,
      columnNumber: 9
    }, void 0),
    config.amiga && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AmigaPanel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 534,
      columnNumber: 9
    }, void 0),
    (config.chipType === 8 || config.n163) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(N163Panel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 539,
      columnNumber: 9
    }, void 0),
    (config.chipType === 16 || config.fds) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FDSPanel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 544,
      columnNumber: 9
    }, void 0),
    config.esfm && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ESFMPanel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 549,
      columnNumber: 9
    }, void 0),
    config.multipcm && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MultiPCMPanel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 554,
      columnNumber: 9
    }, void 0),
    config.soundUnit && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SoundUnitPanel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 559,
      columnNumber: 9
    }, void 0),
    (config.chipType === 21 || config.es5506) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ES5506Panel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 564,
      columnNumber: 9
    }, void 0),
    config.sid2 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SID2Panel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 569,
      columnNumber: 9
    }, void 0),
    config.sid3 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SID3Panel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 572,
      columnNumber: 24
    }, void 0),
    config.fixedDrums != null && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OPLDrumPanel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 573,
      columnNumber: 38
    }, void 0),
    category === "PSG" && ![5, 10, 24].includes(config.chipType) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PSGPanel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 577,
      columnNumber: 9
    }, void 0),
    ((_b = config.nes) == null ? void 0 : _b.dpcmNoteMap) && config.nes.dpcmMap && config.nes.dpcmMap.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 16, className: "text-accent-highlight" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 584,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase tracking-wider", children: [
          "DPCM Note Map (",
          config.nes.dpcmMap.length,
          " entries)"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 585,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 583,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "max-h-48 overflow-y-auto rounded border border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("table", { className: "w-full text-[10px] font-mono", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("thead", { className: "sticky top-0 bg-dark-bg", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("tr", { className: "text-text-muted", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("th", { className: "px-2 py-1 text-left", children: "Note" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 593,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("th", { className: "px-2 py-1 text-right", children: "Freq" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 594,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("th", { className: "px-2 py-1 text-right", children: "Delta" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 595,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 592,
          columnNumber: 17
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 591,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("tbody", { children: config.nes.dpcmMap.map((entry, i) => {
          if (entry.freq === 0 && entry.delta === 0) return null;
          const noteNames = ["C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-"];
          const noteName = `${noteNames[i % 12]}${Math.floor(i / 12)}`;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("tr", { className: "border-t border-dark-border/50 hover:bg-dark-bg/50", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("td", { className: "px-2 py-0.5 text-text-secondary", children: noteName }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 605,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("td", { className: "px-2 py-0.5 text-right text-text-primary", children: entry.freq }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 606,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("td", { className: "px-2 py-0.5 text-right text-accent-highlight", children: entry.delta }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 607,
              columnNumber: 23
            }, void 0)
          ] }, i, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 604,
            columnNumber: 21
          }, void 0);
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 598,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 590,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 589,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 582,
      columnNumber: 9
    }, void 0),
    (category === "Wavetable" || config.wavetables.length > 0) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, className: "text-accent-highlight" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 621,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase tracking-wider", children: [
          "Wavetable Editor (",
          config.wavetables.length,
          " waves)"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 622,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              var _a2;
              return (_a2 = fileInputRef.current) == null ? void 0 : _a2.click();
            },
            className: "p-1 text-text-muted hover:text-accent-highlight transition-colors",
            title: "Import .wav or .fuw wave",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileUp, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 630,
              columnNumber: 15
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 625,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            ref: fileInputRef,
            type: "file",
            accept: ".wav,.fuw",
            onChange: handleImport,
            className: "hidden"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 632,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted", children: "Draw to edit waveforms" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 639,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 620,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        WavetableListEditor,
        {
          wavetables: config.wavetables,
          onChange: (wavetables) => onChange({ wavetables })
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 642,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 619,
      columnNumber: 9
    }, void 0),
    (category === "Wavetable" || config.wavetables.length > 0 || config.ws) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WaveSynthPanel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 650,
      columnNumber: 9
    }, void 0),
    category !== "FM" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-violet-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 657,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase tracking-wider", children: [
          "Macros (",
          config.macros.length,
          ")"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 658,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted", children: "Draw to edit • Loop (blue) • Release (red)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 661,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 656,
        columnNumber: 11
      }, void 0),
      hasOpMacros && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-0.5 mb-3 bg-dark-bg p-0.5 rounded border border-dark-border", children: ["global", "op1", "op2", "op3", "op4"].map((sub) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setMacroSubTab(sub),
          className: `flex-1 py-1 px-2 rounded text-[10px] font-mono uppercase transition-colors ${macroSubTab === sub ? "bg-violet-600 text-text-primary" : "text-text-muted hover:text-text-primary hover:bg-dark-bgSecondary"}`,
          children: sub === "global" ? "Global" : sub.toUpperCase()
        },
        sub,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 667,
          columnNumber: 17
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 665,
        columnNumber: 13
      }, void 0),
      macroSubTab === "global" || !hasOpMacros ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        MacroListEditor,
        {
          macros: config.macros,
          onChange: (macros) => onChange({ macros }),
          chipType: config.chipType
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 683,
          columnNumber: 13
        },
        void 0
      ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        MacroListEditor,
        {
          macros: (config.opMacroArrays ?? [[], [], [], []])[parseInt(macroSubTab.slice(2)) - 1] ?? [],
          onChange: (macros) => {
            const opIdx = parseInt(macroSubTab.slice(2)) - 1;
            const newOpArrays = [...config.opMacroArrays ?? [[], [], [], []]];
            newOpArrays[opIdx] = macros;
            onChange({ opMacroArrays: newOpArrays });
          },
          chipType: config.chipType
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 689,
          columnNumber: 13
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 655,
      columnNumber: 9
    }, void 0),
    category === "PCM" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PCMPanel, { config, onChange: pushLiveUpdate }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 705,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 299,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 298,
    columnNumber: 5
  }, void 0);
};
const OperatorCard = ({
  index,
  op,
  onUpdate,
  ranges,
  isCarrier,
  isSelected
}) => {
  const borderColor = isSelected ? "border-emerald-500/60" : isCarrier ? "border-amber-500/30" : "border-blue-500/30";
  const accentColor = isCarrier ? "#f59e0b" : "#3b82f6";
  const bgGradient = isSelected ? "from-emerald-950/25 to-transparent" : isCarrier ? "from-amber-950/20 to-transparent" : "from-blue-950/20 to-transparent";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `bg-gradient-to-br ${bgGradient} bg-dark-bgSecondary p-3 rounded-lg border ${borderColor} transition-colors`, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "w-6 h-6 rounded flex items-center justify-center font-mono text-xs font-bold border",
            style: {
              backgroundColor: `${accentColor}20`,
              borderColor: `${accentColor}50`,
              color: accentColor
            },
            children: index + 1
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 744,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[10px] font-bold text-text-primary uppercase", children: [
            "OP",
            index + 1
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 755,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted ml-2", children: isCarrier ? "Carrier" : "Modulator" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 758,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 754,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 743,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdate({ enabled: !op.enabled }),
          className: `text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${op.enabled ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
          children: op.enabled ? "ON" : "OFF"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 765,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 742,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3 w-full", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      EnvelopeVisualization,
      {
        mode: "adsr",
        tl: op.tl,
        ar: op.ar,
        dr: op.dr,
        d2r: op.d2r ?? 0,
        rr: op.rr,
        sl: op.sl,
        maxTl: ranges.tl.max,
        maxRate: ranges.ar.max,
        color: accentColor,
        width: 280,
        height: 48
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 779,
        columnNumber: 9
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 778,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between items-center gap-1 mb-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "TL",
          value: op.tl,
          min: ranges.tl.min,
          max: ranges.tl.max,
          onChange: (v) => onUpdate({ tl: Math.round(v) }),
          size: "sm",
          color: "#ef4444",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 797,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "MULT",
          value: op.mult,
          min: ranges.mult.min,
          max: ranges.mult.max,
          onChange: (v) => onUpdate({ mult: Math.round(v) }),
          size: "sm",
          color: "#22d3ee",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 800,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "DT",
          value: op.dt,
          min: ranges.dt.min,
          max: ranges.dt.max,
          onChange: (v) => onUpdate({ dt: Math.round(v) }),
          size: "sm",
          color: "#a78bfa",
          formatValue: (v) => {
            const val = Math.round(v);
            return val > 0 ? `+${val}` : String(val);
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 803,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 796,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between items-center gap-1 mb-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "AR",
          value: op.ar,
          min: ranges.ar.min,
          max: ranges.ar.max,
          onChange: (v) => onUpdate({ ar: Math.round(v) }),
          size: "sm",
          color: "#10b981",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 810,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "DR",
          value: op.dr,
          min: ranges.dr.min,
          max: ranges.dr.max,
          onChange: (v) => onUpdate({ dr: Math.round(v) }),
          size: "sm",
          color: "#f59e0b",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 813,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "SL",
          value: op.sl,
          min: ranges.sl.min,
          max: ranges.sl.max,
          onChange: (v) => onUpdate({ sl: Math.round(v) }),
          size: "sm",
          color: "#8b5cf6",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 816,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "RR",
          value: op.rr,
          min: ranges.rr.min,
          max: ranges.rr.max,
          onChange: (v) => onUpdate({ rr: Math.round(v) }),
          size: "sm",
          color: "#ec4899",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 819,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 809,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "pt-2 border-t border-dark-border mt-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center items-center gap-3 mb-2", children: [
        ranges.hasD2R && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "D2R",
            value: op.d2r ?? 0,
            min: ranges.d2r.min,
            max: ranges.d2r.max,
            onChange: (v) => onUpdate({ d2r: Math.round(v) }),
            size: "sm",
            color: "#fb923c",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 829,
            columnNumber: 15
          },
          void 0
        ),
        ranges.rs.max > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "RS",
            value: op.rs ?? 0,
            min: ranges.rs.min,
            max: ranges.rs.max,
            onChange: (v) => onUpdate({ rs: Math.round(v) }),
            size: "sm",
            color: "#06b6d4",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 834,
            columnNumber: 15
          },
          void 0
        ),
        ranges.hasDT2 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "DT2",
            value: op.dt2 ?? 0,
            min: 0,
            max: 3,
            onChange: (v) => onUpdate({ dt2: Math.round(v) }),
            size: "sm",
            color: "#c084fc",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 839,
            columnNumber: 15
          },
          void 0
        ),
        ranges.ksl && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "KSL",
            value: op.ksl ?? 0,
            min: ranges.ksl.min,
            max: ranges.ksl.max,
            onChange: (v) => onUpdate({ ksl: Math.round(v) }),
            size: "sm",
            color: "#fbbf24",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 844,
            columnNumber: 15
          },
          void 0
        ),
        ranges.hasWS && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "WS",
            value: op.ws ?? 0,
            min: 0,
            max: 7,
            onChange: (v) => onUpdate({ ws: Math.round(v) }),
            size: "sm",
            color: "#34d399",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 849,
            columnNumber: 15
          },
          void 0
        ),
        ranges.isOPZ && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "DAM",
              value: op.dam ?? 0,
              min: 0,
              max: 7,
              onChange: (v) => onUpdate({ dam: Math.round(v) }),
              size: "sm",
              color: "#f472b6",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 855,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "DVB",
              value: op.dvb ?? 0,
              min: 0,
              max: 7,
              onChange: (v) => onUpdate({ dvb: Math.round(v) }),
              size: "sm",
              color: "#e879f9",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 858,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "KVS",
              value: op.kvs ?? 0,
              min: 0,
              max: 3,
              onChange: (v) => onUpdate({ kvs: Math.round(v) }),
              size: "sm",
              color: "#c084fc",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 861,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 854,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 827,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "AM", value: op.am ?? false, onChange: (v) => onUpdate({ am: v }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 870,
          columnNumber: 13
        }, void 0),
        ranges.hasSSG && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(op.ssg ?? 0),
            onChange: (v) => onUpdate({ ssg: parseInt(v) }),
            className: "text-[9px] font-mono px-1 py-0.5 rounded border bg-dark-bg border-dark-border text-text-primary",
            title: "SSG-EG Mode",
            options: [
              { value: "0", label: "SSG Off" },
              { value: "8", label: "SSG \\\\\\\\" },
              { value: "9", label: "SSG \\‾‾" },
              { value: "10", label: "SSG \\/\\/" },
              { value: "11", label: "SSG \\‾" },
              { value: "12", label: "SSG ////" },
              { value: "13", label: "SSG /‾‾" },
              { value: "14", label: "SSG /\\/\\" },
              { value: "15", label: "SSG /‾" }
            ]
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 872,
            columnNumber: 15
          },
          void 0
        ),
        ranges.hasWS && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "VIB", value: op.vib ?? false, onChange: (v) => onUpdate({ vib: v }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 892,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "SUS", value: op.sus ?? false, onChange: (v) => onUpdate({ sus: v }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 893,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "KSR", value: op.ksr ?? false, onChange: (v) => onUpdate({ ksr: v }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 894,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 891,
          columnNumber: 15
        }, void 0),
        ranges.isOPZ && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "EGT", value: op.egt ?? false, onChange: (v) => onUpdate({ egt: v }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 898,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 869,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 825,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 740,
    columnNumber: 5
  }, void 0);
};
const ToggleButton = ({ label, value, onChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    onClick: () => onChange(!value),
    className: `text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${value ? "bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight" : "bg-dark-bg border-dark-border text-text-muted hover:text-text-primary"}`,
    children: label
  },
  void 0,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 915,
    columnNumber: 3
  },
  void 0
);
const GB_DEFAULTS = { envVol: 15, envDir: 0, envLen: 2, soundLen: 0, softEnv: false, alwaysInit: true };
const GBPanel = ({ config, onChange }) => {
  const gb = reactExports.useMemo(() => ({ ...GB_DEFAULTS, ...config.gb }), [config.gb]);
  const updateGB = reactExports.useCallback((updates) => {
    onChange({ gb: { ...config.gb, ...GB_DEFAULTS, ...updates } });
  }, [config.gb, onChange]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-emerald-500/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-emerald-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 946,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "GB Envelope" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 947,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 945,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "VOL",
              value: gb.envVol,
              min: 0,
              max: 15,
              onChange: (v) => updateGB({ envVol: Math.round(v) }),
              size: "md",
              color: "#34d399",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 952,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "LEN",
              value: gb.envLen,
              min: 0,
              max: 7,
              onChange: (v) => updateGB({ envLen: Math.round(v) }),
              size: "md",
              color: "#10b981",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 960,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "SND",
              value: gb.soundLen,
              min: 0,
              max: 64,
              onChange: (v) => updateGB({ soundLen: Math.round(v) }),
              size: "md",
              color: "#059669",
              formatValue: (v) => v === 0 || v > 63 ? "∞" : String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 968,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 951,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted font-mono", children: "Direction:" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 980,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateGB({ envDir: 1 }),
              className: `px-3 py-1 text-[10px] font-mono rounded border transition-colors ${gb.envDir === 1 ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400" : "bg-dark-bg border-dark-border text-text-muted hover:text-text-primary"}`,
              children: "↑ UP"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 981,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateGB({ envDir: 0 }),
              className: `px-3 py-1 text-[10px] font-mono rounded border transition-colors ${gb.envDir === 0 ? "bg-rose-600/20 border-rose-500/50 text-rose-400" : "bg-dark-bg border-dark-border text-text-muted hover:text-text-primary"}`,
              children: "↓ DOWN"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 991,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 979,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 pt-2 border-t border-dark-border", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateGB({ softEnv: !gb.softEnv }),
              className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${gb.softEnv ? "bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight" : "bg-dark-bg border-dark-border text-text-muted"}`,
              children: "Soft Envelope"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1005,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateGB({ alwaysInit: !gb.alwaysInit }),
              className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${gb.alwaysInit ? "bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight" : "bg-dark-bg border-dark-border text-text-muted"}`,
              children: "Always Init"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1015,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateGB({ hwSeqEnabled: !gb.hwSeqEnabled }),
              className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${gb.hwSeqEnabled ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
              children: "HW Sequence"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1025,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateGB({ doubleWave: !gb.doubleWave }),
              className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${gb.doubleWave ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
              title: "Double wave length (GBA only)",
              children: "Double Wave (GBA)"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1035,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1004,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 pt-2 border-t border-dark-border", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "DUTY",
              value: gb.duty ?? 2,
              min: 0,
              max: 3,
              onChange: (v) => updateGB({ duty: Math.round(v) }),
              size: "sm",
              color: "#6ee7b7",
              formatValue: (v) => ["12.5%", "25%", "50%", "75%"][Math.round(v)] ?? String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1050,
              columnNumber: 13
            },
            void 0
          ),
          gb.hwSeqEnabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "SEQ LEN",
              value: gb.hwSeqLen ?? 0,
              min: 0,
              max: 64,
              onChange: (v) => updateGB({ hwSeqLen: Math.round(v) }),
              size: "sm",
              color: "#34d399",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1059,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1049,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 950,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 944,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, className: "text-emerald-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1075,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Envelope Shape" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1076,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1074,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        GBEnvelopeVisualization,
        {
          envVol: gb.envVol,
          envLen: gb.envLen,
          soundLen: gb.soundLen,
          envDir: gb.envDir
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1078,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1073,
      columnNumber: 7
    }, void 0),
    gb.hwSeqEnabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "col-span-1 md:col-span-2 bg-dark-bgSecondary p-4 rounded-lg border border-emerald-500/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-emerald-400" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1091,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "HW Sequence Commands" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1092,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted font-mono", children: [
            "(",
            (gb.hwSeq ?? []).length,
            "/64)"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1093,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1090,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              const seq = [...gb.hwSeq ?? []];
              if (seq.length < 64) {
                seq.push({ cmd: 0, data: 0 });
                updateGB({ hwSeq: seq, hwSeqLen: seq.length });
              }
            },
            disabled: (gb.hwSeq ?? []).length >= 64,
            className: "p-1 text-emerald-400 hover:text-emerald-300 disabled:text-text-muted disabled:opacity-50 transition-colors",
            title: "Add command",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Plus, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1107,
              columnNumber: 15
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1095,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1089,
        columnNumber: 11
      }, void 0),
      (gb.hwSeq ?? []).length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted font-mono", children: "No commands. Click + to add." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1112,
        columnNumber: 13
      }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1 max-h-64 overflow-y-auto", children: (gb.hwSeq ?? []).map((entry, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        GBHWSeqRow,
        {
          index: i,
          cmd: entry.cmd,
          data: entry.data,
          totalCount: (gb.hwSeq ?? []).length,
          onChange: (cmd, data) => {
            const seq = [...gb.hwSeq ?? []];
            seq[i] = { cmd, data };
            updateGB({ hwSeq: seq });
          },
          onMoveUp: () => {
            if (i <= 0) return;
            const seq = [...gb.hwSeq ?? []];
            [seq[i - 1], seq[i]] = [seq[i], seq[i - 1]];
            updateGB({ hwSeq: seq });
          },
          onMoveDown: () => {
            const seq = gb.hwSeq ?? [];
            if (i >= seq.length - 1) return;
            const newSeq = [...seq];
            [newSeq[i], newSeq[i + 1]] = [newSeq[i + 1], newSeq[i]];
            updateGB({ hwSeq: newSeq });
          },
          onRemove: () => {
            const seq = [...gb.hwSeq ?? []];
            seq.splice(i, 1);
            updateGB({ hwSeq: seq, hwSeqLen: seq.length });
          }
        },
        i,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1116,
          columnNumber: 17
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1114,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1088,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 942,
    columnNumber: 5
  }, void 0);
};
const NumInput = ({ label, value, min, max, onChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] text-text-muted font-mono w-8 text-right", children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 1164,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "input",
    {
      type: "number",
      value,
      min,
      max,
      onChange: (e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || 0))),
      className: "w-12 bg-dark-bg border border-dark-border text-[9px] text-text-primary rounded px-1 py-0.5 text-center font-mono"
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1165,
      columnNumber: 5
    },
    void 0
  )
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
  lineNumber: 1163,
  columnNumber: 3
}, void 0);
const GB_HWSEQ_CMD_NAMES = ["Envelope", "Sweep", "Wait", "Wait for Release", "Loop", "Loop until Release"];
const GBHWSeqRow = ({ index, cmd, data, totalCount, onChange, onMoveUp, onMoveDown, onRemove }) => {
  const renderParams = () => {
    switch (cmd) {
      case 0: {
        const len = data & 7;
        const dir = (data & 8) !== 0;
        const vol = data >> 4 & 15;
        const soundLen = data >> 8 & 255;
        const pack = (v, d, l, s) => l & 7 | (d ? 8 : 0) | (v & 15) << 4 | (s & 255) << 8;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            NumInput,
            {
              label: "Vol",
              value: vol,
              min: 0,
              max: 15,
              onChange: (v) => onChange(cmd, pack(v, dir, len, soundLen))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1208,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => onChange(cmd, pack(vol, !dir, len, soundLen)),
              className: `px-1.5 py-0.5 text-[8px] font-mono rounded border transition-colors ${dir ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400" : "bg-rose-600/20 border-rose-500/50 text-rose-400"}`,
              children: dir ? "↑" : "↓"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1210,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            NumInput,
            {
              label: "Len",
              value: len,
              min: 0,
              max: 7,
              onChange: (v) => onChange(cmd, pack(vol, dir, v, soundLen))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1218,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            NumInput,
            {
              label: "Snd",
              value: soundLen,
              min: 0,
              max: 64,
              onChange: (v) => onChange(cmd, pack(vol, dir, len, v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1220,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1207,
          columnNumber: 11
        }, void 0);
      }
      case 1: {
        const shift = data & 7;
        const dir = (data & 8) !== 0;
        const speed = data >> 4 & 7;
        const pack = (sh, d, sp) => sh & 7 | (d ? 8 : 0) | (sp & 7) << 4;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            NumInput,
            {
              label: "Shift",
              value: shift,
              min: 0,
              max: 7,
              onChange: (v) => onChange(cmd, pack(v, dir, speed))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1233,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => onChange(cmd, pack(shift, !dir, speed)),
              className: `px-1.5 py-0.5 text-[8px] font-mono rounded border transition-colors ${dir ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400" : "bg-rose-600/20 border-rose-500/50 text-rose-400"}`,
              children: dir ? "↑" : "↓"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1235,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            NumInput,
            {
              label: "Speed",
              value: speed,
              min: 0,
              max: 7,
              onChange: (v) => onChange(cmd, pack(shift, dir, v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1243,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1232,
          columnNumber: 11
        }, void 0);
      }
      case 2:
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          NumInput,
          {
            label: "Ticks",
            value: (data & 255) + 1,
            min: 1,
            max: 255,
            onChange: (v) => onChange(cmd, Math.max(0, v - 1))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1250,
            columnNumber: 11
          },
          void 0
        );
      case 3:
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] text-text-muted font-mono italic", children: "no params" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1254,
          columnNumber: 16
        }, void 0);
      case 4:
      // Loop
      case 5:
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          NumInput,
          {
            label: "Pos",
            value: data & 255,
            min: 0,
            max: totalCount - 1,
            onChange: (v) => onChange(cmd, v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1258,
            columnNumber: 11
          },
          void 0
        );
      default:
        return null;
    }
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 py-0.5 px-1 rounded bg-dark-bg/50 border border-dark-border/50", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] text-emerald-400 font-mono w-4 text-right", children: index }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1268,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      CustomSelect,
      {
        value: String(cmd),
        onChange: (v) => onChange(parseInt(v), 0),
        className: "bg-dark-bg border border-dark-border rounded px-1 py-0.5 text-[9px] text-text-primary font-mono",
        options: GB_HWSEQ_CMD_NAMES.map((name, i) => ({ value: String(i), label: name }))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1269,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 flex-1", children: renderParams() }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1275,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: onMoveUp,
        disabled: index === 0,
        className: "p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors",
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronUp, { size: 10 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1280,
          columnNumber: 9
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1278,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: onMoveDown,
        disabled: index >= totalCount - 1,
        className: "p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors",
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 10 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1284,
          columnNumber: 9
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1282,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: onRemove,
        className: "p-0.5 text-text-muted hover:text-rose-400 transition-colors",
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Trash2, { size: 10 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1288,
          columnNumber: 9
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1286,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 1267,
    columnNumber: 5
  }, void 0);
};
const GBEnvelopeVisualization = ({ envVol, envLen, soundLen, envDir }) => {
  const canvasRef = reactExports.useRef(null);
  const width = 200;
  const height = 80;
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#1e293b";
    ctx.setLineDash([2, 2]);
    for (let i = 0; i <= 4; i++) {
      const y = i / 4 * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 2;
    const startVol = envDir === 1 ? 0 : envVol;
    const endVol = envDir === 1 ? envVol : 0;
    const decaySteps = envLen === 0 ? 1 : 16 - envVol;
    const totalLength = soundLen === 0 || soundLen > 63 ? width : soundLen / 64 * width;
    const startY = height - startVol / 15 * (height - 8) - 4;
    const endY = height - endVol / 15 * (height - 8) - 4;
    ctx.moveTo(0, startY);
    if (envLen === 0) {
      ctx.lineTo(totalLength, startY);
    } else {
      const decayX = Math.min(decaySteps * envLen * 4, totalLength);
      ctx.lineTo(decayX, endY);
      if (decayX < totalLength) {
        ctx.lineTo(totalLength, endY);
      }
    }
    ctx.stroke();
    ctx.font = "9px monospace";
    ctx.fillStyle = "#64748b";
    ctx.fillText(`V:${envVol}`, 4, 12);
    ctx.fillText(`L:${envLen}`, 4, 24);
    ctx.fillText(envDir === 1 ? "↑" : "↓", width - 12, 12);
  }, [envVol, envLen, soundLen, envDir]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      width,
      height,
      className: "w-full rounded border border-dark-border",
      style: { height }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1372,
      columnNumber: 5
    },
    void 0
  );
};
const WAVE_SYNTH_DEFAULTS = {
  enabled: false,
  wave1: 0,
  wave2: 0,
  rateDivider: 1,
  effect: 0,
  oneShot: false,
  global: true,
  speed: 0,
  param1: 0,
  param2: 0,
  param3: 0,
  param4: 0
};
const WAVE_SYNTH_SINGLE_EFFECTS = ["None", "Invert", "Add", "Subtract", "Average", "Phase", "Chorus"];
const WAVE_SYNTH_DUAL_EFFECTS = ["None (dual)", "Wipe", "Fade", "Fade (ping-pong)", "Overlay", "Negative Overlay", "Slide", "Mix Chorus", "Phase Modulation"];
const WaveSynthPanel = ({ config, onChange }) => {
  const ws = reactExports.useMemo(() => ({ ...WAVE_SYNTH_DEFAULTS, ...config.ws }), [config.ws]);
  const updateWS = reactExports.useCallback((updates) => {
    onChange({ ws: { ...config.ws, ...WAVE_SYNTH_DEFAULTS, ...updates } });
  }, [config.ws, onChange]);
  const isDual = ws.effect >= 128;
  const effectIndex = isDual ? ws.effect - 128 : ws.effect;
  const effectNames = isDual ? WAVE_SYNTH_DUAL_EFFECTS : WAVE_SYNTH_SINGLE_EFFECTS;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-cyan-500/30 animate-in fade-in slide-in-from-top-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, className: "text-cyan-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1409,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Wave Synth" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1410,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1408,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => updateWS({ enabled: !ws.enabled }),
          className: `text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${ws.enabled ? "bg-cyan-600/20 border-cyan-500/50 text-cyan-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
          children: ws.enabled ? "ON" : "OFF"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1412,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1407,
      columnNumber: 7
    }, void 0),
    ws.enabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted font-mono", children: "Mode:" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1428,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateWS({ effect: effectIndex }),
            className: `px-3 py-1 text-[10px] font-mono rounded border transition-colors ${!isDual ? "bg-cyan-600/20 border-cyan-500/50 text-cyan-400" : "bg-dark-bg border-dark-border text-text-muted hover:text-text-primary"}`,
            children: "Single"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1429,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateWS({ effect: 128 + Math.min(effectIndex, WAVE_SYNTH_DUAL_EFFECTS.length - 1) }),
            className: `px-3 py-1 text-[10px] font-mono rounded border transition-colors ${isDual ? "bg-cyan-600/20 border-cyan-500/50 text-cyan-400" : "bg-dark-bg border-dark-border text-text-muted hover:text-text-primary"}`,
            children: "Dual"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1439,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1427,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted font-mono block mb-1", children: "Effect" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1453,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(effectIndex),
            onChange: (v) => {
              const idx = parseInt(v);
              updateWS({ effect: isDual ? 128 + idx : idx });
            },
            className: "bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary w-full",
            options: effectNames.map((name, i) => ({ value: String(i), label: name }))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1454,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1452,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "WAVE 1",
            value: ws.wave1,
            min: 0,
            max: 255,
            onChange: (v) => updateWS({ wave1: Math.round(v) }),
            size: "sm",
            color: "#06b6d4",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1467,
            columnNumber: 13
          },
          void 0
        ),
        isDual && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "WAVE 2",
            value: ws.wave2,
            min: 0,
            max: 255,
            onChange: (v) => updateWS({ wave2: Math.round(v) }),
            size: "sm",
            color: "#22d3ee",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1471,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "SPEED",
            value: ws.speed,
            min: 0,
            max: 255,
            onChange: (v) => updateWS({ speed: Math.round(v) }),
            size: "sm",
            color: "#67e8f9",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1475,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "RATE",
            value: ws.rateDivider,
            min: 1,
            max: 255,
            onChange: (v) => updateWS({ rateDivider: Math.round(v) }),
            size: "sm",
            color: "#a5f3fc",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1478,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "AMOUNT",
            value: ws.param1,
            min: 0,
            max: 255,
            onChange: (v) => updateWS({ param1: Math.round(v) }),
            size: "sm",
            color: "#0891b2",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1481,
            columnNumber: 13
          },
          void 0
        ),
        isDual && ws.effect === 136 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "POWER",
            value: ws.param2,
            min: 0,
            max: 255,
            onChange: (v) => updateWS({ param2: Math.round(v) }),
            size: "sm",
            color: "#0e7490",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1485,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1466,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 pt-2 border-t border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateWS({ global: !ws.global }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${ws.global ? "bg-cyan-600/20 border-cyan-500/50 text-cyan-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Global"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1493,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateWS({ oneShot: !ws.oneShot }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${ws.oneShot ? "bg-cyan-600/20 border-cyan-500/50 text-cyan-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "One-Shot"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1503,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1492,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1425,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 1406,
    columnNumber: 5
  }, void 0);
};
const SID3_DEFAULTS = {
  triOn: false,
  sawOn: false,
  pulseOn: false,
  noiseOn: false,
  dutyIsAbs: false,
  a: 0,
  d: 0,
  s: 0,
  sr: 0,
  r: 0,
  mixMode: 0,
  duty: 0,
  ringMod: false,
  oscSync: false,
  phaseMod: false,
  specialWaveOn: false,
  oneBitNoise: false,
  separateNoisePitch: false,
  doWavetable: false,
  resetDuty: false,
  phaseModSource: 0,
  ringModSource: 0,
  syncSource: 0,
  specialWave: 0,
  phaseInv: 0,
  feedback: 0,
  filters: []
};
const SID3_FILTER_DEFAULTS = {
  enabled: false,
  init: false,
  absoluteCutoff: false,
  bindCutoffToNote: false,
  bindCutoffToNoteDir: false,
  bindCutoffOnNote: false,
  bindResonanceToNote: false,
  bindResonanceToNoteDir: false,
  bindResonanceOnNote: false,
  cutoff: 0,
  resonance: 0,
  outputVolume: 0,
  distortion: 0,
  mode: 0,
  filterMatrix: 0,
  bindCutoffToNoteStrength: 0,
  bindCutoffToNoteCenter: 0,
  bindResonanceToNoteStrength: 0,
  bindResonanceToNoteCenter: 0
};
const SID3Panel = ({ config, onChange }) => {
  const sid3 = reactExports.useMemo(() => {
    var _a;
    return { ...SID3_DEFAULTS, ...config.sid3, filters: ((_a = config.sid3) == null ? void 0 : _a.filters) ?? [] };
  }, [config.sid3]);
  const updateSID3 = reactExports.useCallback((updates) => {
    onChange({ sid3: { ...SID3_DEFAULTS, ...config.sid3, ...updates } });
  }, [config.sid3, onChange]);
  const updateFilter = reactExports.useCallback((idx, updates) => {
    var _a;
    const filters = [...((_a = config.sid3) == null ? void 0 : _a.filters) ?? []];
    filters[idx] = { ...SID3_FILTER_DEFAULTS, ...filters[idx], ...updates };
    updateSID3({ filters });
  }, [config.sid3, updateSID3]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in slide-in-from-top-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-violet-500/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, className: "text-violet-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1561,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "SID3 Waveform" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1562,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1560,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mb-3", children: [
        { key: "triOn", label: "TRI" },
        { key: "sawOn", label: "SAW" },
        { key: "pulseOn", label: "PULSE" },
        { key: "noiseOn", label: "NOISE" }
      ].map(({ key, label }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => updateSID3({ [key]: !sid3[key] }),
          className: `px-3 py-1 text-[10px] font-mono rounded border transition-colors ${sid3[key] ? "bg-violet-600/20 border-violet-500/50 text-violet-400" : "bg-dark-bg border-dark-border text-text-muted hover:text-text-primary"}`,
          children: label
        },
        key,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1572,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1565,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2", children: [
        { key: "ringMod", label: "RING" },
        { key: "oscSync", label: "SYNC" },
        { key: "phaseMod", label: "PHASE MOD" },
        { key: "specialWaveOn", label: "SPECIAL WAVE" },
        { key: "resetDuty", label: "RESET DUTY" },
        { key: "oneBitNoise", label: "1-BIT NOISE" },
        { key: "doWavetable", label: "WAVETABLE" }
      ].map(({ key, label }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => updateSID3({ [key]: !sid3[key] }),
          className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${sid3[key] ? "bg-violet-600/20 border-violet-500/50 text-violet-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
          children: label
        },
        key,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1596,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1586,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1559,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-violet-500/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-violet-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1614,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "SID3 Envelope" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1615,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1613,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap justify-between gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "A",
            value: sid3.a,
            min: 0,
            max: 255,
            onChange: (v) => updateSID3({ a: Math.round(v) }),
            size: "md",
            color: "#8b5cf6",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1618,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "D",
            value: sid3.d,
            min: 0,
            max: 255,
            onChange: (v) => updateSID3({ d: Math.round(v) }),
            size: "md",
            color: "#7c3aed",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1621,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "S",
            value: sid3.s,
            min: 0,
            max: 255,
            onChange: (v) => updateSID3({ s: Math.round(v) }),
            size: "md",
            color: "#6d28d9",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1624,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "SR",
            value: sid3.sr,
            min: 0,
            max: 255,
            onChange: (v) => updateSID3({ sr: Math.round(v) }),
            size: "md",
            color: "#5b21b6",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1627,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "R",
            value: sid3.r,
            min: 0,
            max: 255,
            onChange: (v) => updateSID3({ r: Math.round(v) }),
            size: "md",
            color: "#4c1d95",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1630,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1617,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1612,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-violet-500/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 16, className: "text-violet-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1639,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "SID3 Controls" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1640,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1638,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "DUTY",
            value: sid3.duty,
            min: 0,
            max: 4095,
            onChange: (v) => updateSID3({ duty: Math.round(v) }),
            size: "sm",
            color: "#a78bfa",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1643,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "MIX",
            value: sid3.mixMode,
            min: 0,
            max: 3,
            onChange: (v) => updateSID3({ mixMode: Math.round(v) }),
            size: "sm",
            color: "#c4b5fd",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1646,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "FB",
            value: sid3.feedback,
            min: 0,
            max: 255,
            onChange: (v) => updateSID3({ feedback: Math.round(v) }),
            size: "sm",
            color: "#ddd6fe",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1649,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "PH INV",
            value: sid3.phaseInv,
            min: 0,
            max: 15,
            onChange: (v) => updateSID3({ phaseInv: Math.round(v) }),
            size: "sm",
            color: "#ede9fe",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1652,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1642,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 pt-2 border-t border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "PM SRC",
            value: sid3.phaseModSource,
            min: 0,
            max: 7,
            onChange: (v) => updateSID3({ phaseModSource: Math.round(v) }),
            size: "sm",
            color: "#8b5cf6",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1659,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "RM SRC",
            value: sid3.ringModSource,
            min: 0,
            max: 7,
            onChange: (v) => updateSID3({ ringModSource: Math.round(v) }),
            size: "sm",
            color: "#7c3aed",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1662,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "SYNC SRC",
            value: sid3.syncSource,
            min: 0,
            max: 7,
            onChange: (v) => updateSID3({ syncSource: Math.round(v) }),
            size: "sm",
            color: "#6d28d9",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1665,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "SPCL WAVE",
            value: sid3.specialWave,
            min: 0,
            max: 255,
            onChange: (v) => updateSID3({ specialWave: Math.round(v) }),
            size: "sm",
            color: "#5b21b6",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1668,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1658,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1637,
      columnNumber: 7
    }, void 0),
    sid3.filters.map((filt, idx) => {
      const f = { ...SID3_FILTER_DEFAULTS, ...filt };
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-violet-500/30", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Volume2, { size: 16, className: "text-violet-400" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1681,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: [
              "Filter ",
              idx + 1
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1682,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1680,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateFilter(idx, { enabled: !f.enabled }),
              className: `text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${f.enabled ? "bg-violet-600/20 border-violet-500/50 text-violet-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
              children: f.enabled ? "ON" : "OFF"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1684,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1679,
          columnNumber: 13
        }, void 0),
        f.enabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "CUT",
              value: f.cutoff,
              min: 0,
              max: 65535,
              onChange: (v) => updateFilter(idx, { cutoff: Math.round(v) }),
              size: "sm",
              color: "#a78bfa",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1697,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "RES",
              value: f.resonance,
              min: 0,
              max: 255,
              onChange: (v) => updateFilter(idx, { resonance: Math.round(v) }),
              size: "sm",
              color: "#8b5cf6",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1700,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "VOL",
              value: f.outputVolume,
              min: 0,
              max: 255,
              onChange: (v) => updateFilter(idx, { outputVolume: Math.round(v) }),
              size: "sm",
              color: "#7c3aed",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1703,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "DIST",
              value: f.distortion,
              min: 0,
              max: 255,
              onChange: (v) => updateFilter(idx, { distortion: Math.round(v) }),
              size: "sm",
              color: "#6d28d9",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1706,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "MODE",
              value: f.mode,
              min: 0,
              max: 15,
              onChange: (v) => updateFilter(idx, { mode: Math.round(v) }),
              size: "sm",
              color: "#5b21b6",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1709,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1696,
          columnNumber: 15
        }, void 0)
      ] }, idx, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1678,
        columnNumber: 11
      }, void 0);
    })
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 1557,
    columnNumber: 5
  }, void 0);
};
const OPLDrumPanel = ({ config, onChange }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-amber-500/30 animate-in fade-in slide-in-from-top-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 16, className: "text-amber-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1730,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "OPL Drums" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1731,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1729,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onChange({ fixedDrums: !config.fixedDrums }),
          className: `text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${config.fixedDrums ? "bg-amber-600/20 border-amber-500/50 text-amber-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
          children: config.fixedDrums ? "FIXED ON" : "FIXED OFF"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1733,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1728,
      columnNumber: 7
    }, void 0),
    config.fixedDrums && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "KICK",
          value: config.kickFreq ?? 0,
          min: 0,
          max: 65535,
          onChange: (v) => onChange({ kickFreq: Math.round(v) }),
          size: "md",
          color: "#f59e0b",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1747,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "SNARE/HAT",
          value: config.snareHatFreq ?? 0,
          min: 0,
          max: 65535,
          onChange: (v) => onChange({ snareHatFreq: Math.round(v) }),
          size: "md",
          color: "#fbbf24",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1750,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "TOM/TOP",
          value: config.tomTopFreq ?? 0,
          min: 0,
          max: 65535,
          onChange: (v) => onChange({ tomTopFreq: Math.round(v) }),
          size: "md",
          color: "#d97706",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1753,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1746,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 1727,
    columnNumber: 5
  }, void 0);
};
const C64_DEFAULTS = {
  triOn: false,
  sawOn: true,
  pulseOn: false,
  noiseOn: false,
  a: 0,
  d: 8,
  s: 8,
  r: 4,
  duty: 2048,
  ringMod: false,
  oscSync: false,
  toFilter: false,
  filterCutoff: 1024,
  filterResonance: 0,
  filterLP: false,
  filterBP: false,
  filterHP: false
};
const C64Panel = ({ config, onChange }) => {
  const c64 = reactExports.useMemo(() => ({ ...C64_DEFAULTS, ...config.c64 }), [config.c64]);
  const updateC64 = reactExports.useCallback((updates) => {
    onChange({ c64: { ...config.c64, ...C64_DEFAULTS, ...updates } });
  }, [config.c64, onChange]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in slide-in-from-top-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-violet-500/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, className: "text-violet-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1781,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Waveform" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1782,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1780,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
        { key: "triOn", label: "TRI", wfType: "triangle", active: c64.triOn, onColor: "#34d399", borderColor: "border-emerald-500/50", textColor: "text-emerald-400", bgColor: "bg-emerald-600/20" },
        { key: "sawOn", label: "SAW", wfType: "saw", active: c64.sawOn, onColor: "#fbbf24", borderColor: "border-amber-500/50", textColor: "text-amber-400", bgColor: "bg-amber-600/20" },
        { key: "pulseOn", label: "PULSE", wfType: "square", active: c64.pulseOn, onColor: "#22d3ee", borderColor: "border-accent-highlight/50", textColor: "text-accent-highlight", bgColor: "bg-accent-highlight/20" },
        { key: "noiseOn", label: "NOISE", wfType: "noise", active: c64.noiseOn, onColor: "#fb7185", borderColor: "border-rose-500/50", textColor: "text-rose-400", bgColor: "bg-rose-600/20" }
      ].map(({ key, label, wfType, active, onColor, borderColor, textColor, bgColor }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => updateC64({ [key]: !active }),
          className: `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded border transition-colors ${active ? `${bgColor} ${borderColor} ${textColor}` : "bg-dark-bg border-dark-border text-text-muted hover:text-text-primary"}`,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              WaveformThumbnail,
              {
                type: wfType,
                width: 40,
                height: 16,
                color: active ? onColor : "#4b5563",
                style: "line"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 1801,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono", children: label }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1807,
              columnNumber: 15
            }, void 0)
          ]
        },
        key,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1792,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1785,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1779,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-amber-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1816,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "ADSR Envelope" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1817,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1815,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        EnvelopeVisualization,
        {
          mode: "adsr",
          ar: c64.a,
          dr: c64.d,
          rr: c64.r,
          sl: c64.s,
          tl: 0,
          maxRate: 15,
          maxTl: 1,
          color: "#f59e0b",
          width: 260,
          height: 52
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1821,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1820,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "A",
            value: c64.a,
            min: 0,
            max: 15,
            onChange: (v) => updateC64({ a: Math.round(v) }),
            size: "md",
            color: "#f59e0b",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1837,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "D",
            value: c64.d,
            min: 0,
            max: 15,
            onChange: (v) => updateC64({ d: Math.round(v) }),
            size: "md",
            color: "#fb923c",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1840,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "S",
            value: c64.s,
            min: 0,
            max: 15,
            onChange: (v) => updateC64({ s: Math.round(v) }),
            size: "md",
            color: "#fbbf24",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1843,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "R",
            value: c64.r,
            min: 0,
            max: 15,
            onChange: (v) => updateC64({ r: Math.round(v) }),
            size: "md",
            color: "#facc15",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1846,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1836,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1814,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 16, className: "text-accent-highlight" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1856,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Pulse Width" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1857,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1855,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "DUTY",
            value: c64.duty,
            min: 0,
            max: 4095,
            onChange: (v) => updateC64({ duty: Math.round(v) }),
            size: "md",
            color: "#22d3ee",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1859,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1854,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16, className: "text-rose-400" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1866,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Modulation" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1867,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1865,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateC64({ ringMod: !c64.ringMod }),
              className: `flex-1 px-2 py-2 text-[10px] font-mono rounded border transition-colors ${c64.ringMod ? "bg-rose-600/20 border-rose-500/50 text-rose-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
              children: "RING"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1870,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateC64({ oscSync: !c64.oscSync }),
              className: `flex-1 px-2 py-2 text-[10px] font-mono rounded border transition-colors ${c64.oscSync ? "bg-violet-600/20 border-violet-500/50 text-violet-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
              children: "SYNC"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1880,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1869,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1864,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1853,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Volume2, { size: 16, className: "text-purple-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1897,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Filter" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1898,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1896,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateC64({ toFilter: !c64.toFilter }),
            className: `px-3 py-1 text-[10px] font-mono rounded border transition-colors ${c64.toFilter ? "bg-purple-600/20 border-purple-500/50 text-purple-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Enable"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1902,
            columnNumber: 11
          },
          void 0
        ),
        c64.toFilter && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "CUT",
              value: c64.filterCutoff ?? 1024,
              min: 0,
              max: 2047,
              onChange: (v) => updateC64({ filterCutoff: Math.round(v) }),
              size: "sm",
              color: "#a855f7",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1915,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "RES",
              value: c64.filterResonance ?? 0,
              min: 0,
              max: 15,
              onChange: (v) => updateC64({ filterResonance: Math.round(v) }),
              size: "sm",
              color: "#c084fc",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 1918,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => updateC64({ filterLP: !c64.filterLP }),
                className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${c64.filterLP ? "bg-purple-600/20 border-purple-500/50 text-purple-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
                children: "LP"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 1923,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => updateC64({ filterBP: !c64.filterBP }),
                className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${c64.filterBP ? "bg-purple-600/20 border-purple-500/50 text-purple-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
                children: "BP"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 1933,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => updateC64({ filterHP: !c64.filterHP }),
                className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${c64.filterHP ? "bg-purple-600/20 border-purple-500/50 text-purple-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
                children: "HP"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 1943,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => updateC64({ filterCh3Off: !c64.filterCh3Off }),
                className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${c64.filterCh3Off ? "bg-purple-600/20 border-purple-500/50 text-purple-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
                children: "CH3 OFF"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 1953,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1922,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1914,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1901,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1895,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 16, className: "text-text-muted" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1972,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Options" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 1973,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1971,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateC64({ dutyIsAbs: !c64.dutyIsAbs }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${c64.dutyIsAbs ? "bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Absolute Duty"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1976,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateC64({ filterIsAbs: !c64.filterIsAbs }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${c64.filterIsAbs ? "bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Absolute Filter"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1986,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateC64({ noTest: !c64.noTest }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${c64.noTest ? "bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "No Test Bit"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 1996,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateC64({ resetDuty: !c64.resetDuty }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${c64.resetDuty ? "bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Reset Duty"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2006,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateC64({ initFilter: !c64.initFilter }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${c64.initFilter ? "bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Init Filter"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2016,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 1975,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 1970,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 1777,
    columnNumber: 5
  }, void 0);
};
const SNES_DEFAULTS = { useEnv: true, gainMode: 0, gain: 127, a: 15, d: 7, s: 7, r: 0 };
const SNESPanel = ({ config, onChange }) => {
  const snes = reactExports.useMemo(() => ({ ...SNES_DEFAULTS, ...config.snes }), [config.snes]);
  const updateSNES = reactExports.useCallback((updates) => {
    onChange({ snes: { ...config.snes, ...SNES_DEFAULTS, ...updates } });
  }, [config.snes, onChange]);
  const gainModes = ["Direct", "Inc Linear", "Inc Bent", "Dec Linear", "Dec Exp"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in slide-in-from-top-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-accent-highlight/30", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-accent-highlight" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2049,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "SNES Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2050,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => updateSNES({ useEnv: !snes.useEnv }),
          className: `ml-auto px-2 py-1 text-[9px] font-mono rounded border transition-colors ${snes.useEnv ? "bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight" : "bg-dark-bg border-dark-border text-text-muted"}`,
          children: snes.useEnv ? "ADSR" : "GAIN"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2051,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2048,
      columnNumber: 9
    }, void 0),
    snes.useEnv ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "A",
            value: snes.a,
            min: 0,
            max: 15,
            onChange: (v) => updateSNES({ a: Math.round(v) }),
            size: "md",
            color: "#06b6d4",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2066,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "D",
            value: snes.d,
            min: 0,
            max: 7,
            onChange: (v) => updateSNES({ d: Math.round(v) }),
            size: "md",
            color: "#22d3ee",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2069,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "S",
            value: snes.s,
            min: 0,
            max: 7,
            onChange: (v) => updateSNES({ s: Math.round(v) }),
            size: "md",
            color: "#67e8f9",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2072,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "R",
            value: snes.r,
            min: 0,
            max: 31,
            onChange: (v) => updateSNES({ r: Math.round(v) }),
            size: "md",
            color: "#a5f3fc",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2075,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2065,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 pt-2 border-t border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "D2",
            value: snes.d2 ?? 0,
            min: 0,
            max: 31,
            onChange: (v) => updateSNES({ d2: Math.round(v) }),
            size: "sm",
            color: "#0891b2",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2080,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateSNES({ sus: snes.sus ?? 0 ? 0 : 1 }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${snes.sus ?? 0 ? "bg-accent-highlight/20 border-accent-highlight/50 text-accent-highlight" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Sustain Mode"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2083,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2079,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2064,
      columnNumber: 11
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted font-mono block mb-1", children: "Gain Mode" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2098,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(typeof snes.gainMode === "number" ? snes.gainMode : 0),
            onChange: (v) => updateSNES({ gainMode: parseInt(v) }),
            className: "bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary",
            options: gainModes.map((mode, i) => ({ value: String(i), label: mode }))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2099,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2097,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "GAIN",
          value: snes.gain,
          min: 0,
          max: 127,
          onChange: (v) => updateSNES({ gain: Math.round(v) }),
          size: "md",
          color: "#06b6d4",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2106,
          columnNumber: 13
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2096,
      columnNumber: 11
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2047,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2045,
    columnNumber: 5
  }, void 0);
};
const PSG_DEFAULTS = { duty: 50, width: 50, noiseMode: "white", attack: 0, decay: 8, sustain: 10, release: 5 };
const PSGPanel = ({ config, onChange }) => {
  const psg = reactExports.useMemo(() => ({ ...PSG_DEFAULTS, ...config.psg }), [config.psg]);
  const updatePSG = reactExports.useCallback((updates) => {
    onChange({ psg: { ...config.psg, ...PSG_DEFAULTS, ...updates } });
  }, [config.psg, onChange]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 16, className: "text-sky-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2130,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Pulse Control" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2131,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2129,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "DUTY",
            value: psg.duty,
            min: 0,
            max: 100,
            onChange: (v) => updatePSG({ duty: Math.round(v) }),
            size: "md",
            color: "#38bdf8",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2134,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "WIDTH",
            value: psg.width,
            min: 0,
            max: 100,
            onChange: (v) => updatePSG({ width: Math.round(v) }),
            size: "md",
            color: "#0ea5e9",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2137,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2133,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2128,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-rose-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2145,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Noise Mode" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2146,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2144,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updatePSG({ noiseMode: "white" }),
            className: `py-2 font-mono text-[10px] rounded border transition-colors ${psg.noiseMode === "white" ? "bg-rose-600/20 border-rose-500/50 text-rose-400" : "bg-dark-bg border-dark-border text-text-muted hover:bg-rose-950/20"}`,
            children: "WHITE"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2149,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updatePSG({ noiseMode: "periodic" }),
            className: `py-2 font-mono text-[10px] rounded border transition-colors ${psg.noiseMode === "periodic" ? "bg-rose-600/20 border-rose-500/50 text-rose-400" : "bg-dark-bg border-dark-border text-text-muted hover:bg-rose-950/20"}`,
            children: "PERIODIC"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2159,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2148,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2143,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 16, className: "text-emerald-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2174,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Envelope" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2175,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2173,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "ATK",
            value: psg.attack,
            min: 0,
            max: 15,
            onChange: (v) => updatePSG({ attack: Math.round(v) }),
            size: "sm",
            color: "#34d399",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2178,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "DEC",
            value: psg.decay,
            min: 0,
            max: 15,
            onChange: (v) => updatePSG({ decay: Math.round(v) }),
            size: "sm",
            color: "#10b981",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2181,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "SUS",
            value: psg.sustain,
            min: 0,
            max: 15,
            onChange: (v) => updatePSG({ sustain: Math.round(v) }),
            size: "sm",
            color: "#059669",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2184,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "REL",
            value: psg.release,
            min: 0,
            max: 15,
            onChange: (v) => updatePSG({ release: Math.round(v) }),
            size: "sm",
            color: "#047857",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2187,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2177,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2172,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2127,
    columnNumber: 5
  }, void 0);
};
const PCM_DEFAULTS = { sampleRate: 44100, loopStart: 0, loopEnd: 65535, loopPoint: 0, bitDepth: 8, loopEnabled: false };
const PCMPanel = ({ config, onChange }) => {
  const pcm = reactExports.useMemo(() => ({ ...PCM_DEFAULTS, ...config.pcm }), [config.pcm]);
  const updatePCM = reactExports.useCallback((updates) => {
    onChange({ pcm: { ...config.pcm, ...PCM_DEFAULTS, ...updates } });
  }, [config.pcm, onChange]);
  const bitDepths = [8, 16];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Volume2, { size: 16, className: "text-violet-400" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2211,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "PCM Sample Properties" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2212,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2210,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 md:grid-cols-5 gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "RATE",
          value: pcm.sampleRate,
          min: 4e3,
          max: 48e3,
          onChange: (v) => updatePCM({ sampleRate: Math.round(v) }),
          size: "sm",
          color: "#a78bfa",
          formatValue: (v) => `${Math.round(v / 1e3)}k`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2215,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "START",
          value: pcm.loopStart,
          min: 0,
          max: 65535,
          onChange: (v) => updatePCM({ loopStart: Math.round(v) }),
          size: "sm",
          color: "#8b5cf6",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2218,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "END",
          value: pcm.loopEnd,
          min: 0,
          max: 65535,
          onChange: (v) => updatePCM({ loopEnd: Math.round(v) }),
          size: "sm",
          color: "#7c3aed",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2221,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "LOOP",
          value: pcm.loopPoint,
          min: 0,
          max: 65535,
          onChange: (v) => updatePCM({ loopPoint: Math.round(v) }),
          size: "sm",
          color: "#6d28d9",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2224,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center justify-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-bold text-text-muted uppercase", children: "Bit Depth" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2228,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(pcm.bitDepth),
            onChange: (v) => updatePCM({ bitDepth: parseInt(v) }),
            className: "bg-dark-bg px-2 py-1 rounded border border-dark-border text-xs font-mono text-violet-400",
            options: bitDepths.map((d) => ({ value: String(d), label: `${d}-BIT` }))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2229,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2227,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2214,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-3 pt-3 border-t border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => updatePCM({ loopEnabled: !pcm.loopEnabled }),
        className: `px-3 py-1 text-[10px] font-mono rounded border transition-colors ${pcm.loopEnabled ? "bg-violet-600/20 border-violet-500/50 text-violet-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
        children: pcm.loopEnabled ? "🔁 Loop Enabled" : "Loop Disabled"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2239,
        columnNumber: 9
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2238,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2209,
    columnNumber: 5
  }, void 0);
};
const AMIGA_DEFAULTS = { initSample: -1, useNoteMap: false, useSample: true, useWave: false, waveLen: 32, noteMap: [] };
const AmigaPanel = ({ config, onChange }) => {
  const amiga = reactExports.useMemo(() => ({ ...AMIGA_DEFAULTS, ...config.amiga }), [config.amiga]);
  const updateAmiga = reactExports.useCallback((updates) => {
    onChange({ amiga: { ...config.amiga, ...AMIGA_DEFAULTS, ...updates } });
  }, [config.amiga, onChange]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in slide-in-from-top-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-amber-500/30", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 16, className: "text-amber-400" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2271,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Amiga / Sample" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2272,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2270,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "SAMPLE",
            value: amiga.initSample,
            min: -1,
            max: 255,
            onChange: (v) => updateAmiga({ initSample: Math.round(v) }),
            size: "md",
            color: "#f59e0b",
            formatValue: (v) => Math.round(v) === -1 ? "OFF" : String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2277,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "WAVE LEN",
            value: amiga.waveLen,
            min: 1,
            max: 256,
            onChange: (v) => updateAmiga({ waveLen: Math.round(v) }),
            size: "md",
            color: "#fbbf24",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2281,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2276,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 pt-2 border-t border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateAmiga({ useSample: !amiga.useSample }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${amiga.useSample ? "bg-amber-600/20 border-amber-500/50 text-amber-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Use Sample"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2288,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateAmiga({ useWave: !amiga.useWave }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${amiga.useWave ? "bg-amber-600/20 border-amber-500/50 text-amber-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Use Wavetable"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2298,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateAmiga({ useNoteMap: !amiga.useNoteMap }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${amiga.useNoteMap ? "bg-amber-600/20 border-amber-500/50 text-amber-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Note Map"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2308,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2287,
        columnNumber: 11
      }, void 0),
      amiga.useNoteMap && amiga.noteMap.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "pt-2 border-t border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted font-mono", children: [
        amiga.noteMap.length,
        " note mapping(s) configured"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2322,
        columnNumber: 15
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2321,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2275,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2269,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2268,
    columnNumber: 5
  }, void 0);
};
const N163_DEFAULTS = { wave: 0, wavePos: 0, waveLen: 32, waveMode: 0, perChPos: false };
const N163Panel = ({ config, onChange }) => {
  const n163 = reactExports.useMemo(() => ({ ...N163_DEFAULTS, ...config.n163 }), [config.n163]);
  const updateN163 = reactExports.useCallback((updates) => {
    onChange({ n163: { ...config.n163, ...N163_DEFAULTS, ...updates } });
  }, [config.n163, onChange]);
  const waveModes = ["Load on playback", "Load when changed", "Load on note-on", "Manual write"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in slide-in-from-top-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-teal-500/30", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, className: "text-teal-400" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2352,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "N163 Wavetable" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2353,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2351,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "WAVE",
            value: n163.wave,
            min: 0,
            max: 255,
            onChange: (v) => updateN163({ wave: Math.round(v) }),
            size: "md",
            color: "#14b8a6",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2358,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "POS",
            value: n163.wavePos,
            min: 0,
            max: 255,
            onChange: (v) => updateN163({ wavePos: Math.round(v) }),
            size: "md",
            color: "#2dd4bf",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2362,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "LEN",
            value: n163.waveLen,
            min: 0,
            max: 252,
            onChange: (v) => updateN163({ waveLen: Math.round(v) & -4 }),
            size: "md",
            color: "#5eead4",
            formatValue: (v) => String(Math.round(v) & -4)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2366,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2357,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 pt-2 border-t border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted font-mono block mb-1", children: "Wave Mode" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2374,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(n163.waveMode),
              onChange: (v) => updateN163({ waveMode: parseInt(v) }),
              className: "bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary",
              options: waveModes.map((mode, i) => ({ value: String(i), label: mode }))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2375,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2373,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateN163({ perChPos: !n163.perChPos }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${n163.perChPos ? "bg-teal-600/20 border-teal-500/50 text-teal-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Per-Channel Position"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2382,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2372,
        columnNumber: 11
      }, void 0),
      n163.perChPos && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "pt-2 border-t border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted font-mono block mb-2", children: "Per-Channel Wave Position / Length" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2397,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-8 gap-1", children: Array.from({ length: 8 }, (_, ch) => {
          var _a, _b;
          const pos = ((_a = n163.chPos) == null ? void 0 : _a[ch]) ?? 0;
          const len = ((_b = n163.chLen) == null ? void 0 : _b[ch]) ?? 0;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1 p-1 rounded bg-dark-bg border border-dark-border", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] text-teal-400 font-mono", children: [
              "CH",
              ch + 1
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2404,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                value: pos,
                min: 0,
                max: 255,
                onChange: (e) => {
                  const arr = [...n163.chPos ?? [0, 0, 0, 0, 0, 0, 0, 0]];
                  arr[ch] = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
                  updateN163({ chPos: arr });
                },
                className: "w-full bg-dark-bgSecondary border border-dark-border text-[9px] text-text-primary rounded px-1 py-0.5 text-center",
                title: `Position CH${ch + 1}`
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 2405,
                columnNumber: 23
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                value: len,
                min: 0,
                max: 252,
                step: 4,
                onChange: (e) => {
                  const arr = [...n163.chLen ?? [0, 0, 0, 0, 0, 0, 0, 0]];
                  arr[ch] = Math.max(0, Math.min(252, (parseInt(e.target.value) || 0) & -4));
                  updateN163({ chLen: arr });
                },
                className: "w-full bg-dark-bgSecondary border border-dark-border text-[9px] text-text-primary rounded px-1 py-0.5 text-center",
                title: `Length CH${ch + 1}`
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 2415,
                columnNumber: 23
              },
              void 0
            )
          ] }, ch, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2403,
            columnNumber: 21
          }, void 0);
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2398,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between text-[8px] text-text-muted font-mono mt-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Position (0-255)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2430,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Length (0-252, 4-aligned)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2431,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2429,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2396,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2356,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2350,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2349,
    columnNumber: 5
  }, void 0);
};
const FDS_DEFAULTS = { modSpeed: 0, modDepth: 0, modTable: new Array(32).fill(0), initModTableWithFirstWave: false };
const FDSPanel = ({ config, onChange }) => {
  const fds = reactExports.useMemo(() => ({ ...FDS_DEFAULTS, ...config.fds }), [config.fds]);
  const updateFDS = reactExports.useCallback((updates) => {
    onChange({ fds: { ...config.fds, ...FDS_DEFAULTS, ...updates } });
  }, [config.fds, onChange]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in slide-in-from-top-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-red-500/30", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-red-400" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2458,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "FDS Modulation" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2459,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2457,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "SPEED",
            value: fds.modSpeed,
            min: 0,
            max: 4095,
            onChange: (v) => updateFDS({ modSpeed: Math.round(v) }),
            size: "md",
            color: "#ef4444",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2464,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "DEPTH",
            value: fds.modDepth,
            min: 0,
            max: 63,
            onChange: (v) => updateFDS({ modDepth: Math.round(v) }),
            size: "md",
            color: "#f87171",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2468,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2463,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "pt-2 border-t border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateFDS({ initModTableWithFirstWave: !fds.initModTableWithFirstWave }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${fds.initModTableWithFirstWave ? "bg-red-600/20 border-red-500/50 text-red-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Init Mod Table from Wave"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2476,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateFDS({ compat: !fds.compat }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${fds.compat ? "bg-red-600/20 border-red-500/50 text-red-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Compat Mode"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2486,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2475,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2474,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "pt-2 border-t border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted font-mono block mb-2", children: "Modulation Table (32 steps, -4 to +3)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2501,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-px h-12 bg-dark-bg rounded border border-dark-border p-1", children: (fds.modTable || []).slice(0, 32).map((val, i) => {
          const normalized = (val + 4) / 7;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "flex-1 flex flex-col-reverse",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "bg-red-500/60 rounded-sm",
                  style: { height: `${normalized * 100}%` }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                  lineNumber: 2510,
                  columnNumber: 21
                },
                void 0
              )
            },
            i,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2506,
              columnNumber: 19
            },
            void 0
          );
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2502,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2500,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2462,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2456,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2455,
    columnNumber: 5
  }, void 0);
};
const ESFM_OP_DEFAULTS = {
  delay: 0,
  outLvl: 0,
  modIn: 0,
  left: true,
  right: true,
  ct: 0,
  fixed: false,
  fixedFreq: 0
};
const ESFMPanel = ({ config, onChange }) => {
  const esfm = reactExports.useMemo(() => {
    var _a, _b;
    return {
      operators: ((_a = config.esfm) == null ? void 0 : _a.operators) ?? [],
      noise: ((_b = config.esfm) == null ? void 0 : _b.noise) ?? 0
    };
  }, [config.esfm]);
  const updateESFM = reactExports.useCallback((updates) => {
    var _a, _b;
    onChange({ esfm: { ...config.esfm, operators: ((_a = config.esfm) == null ? void 0 : _a.operators) ?? [], noise: ((_b = config.esfm) == null ? void 0 : _b.noise) ?? 0, ...updates } });
  }, [config.esfm, onChange]);
  const updateESFMOp = reactExports.useCallback((idx, updates) => {
    var _a;
    const ops = [...((_a = config.esfm) == null ? void 0 : _a.operators) ?? []];
    ops[idx] = { ...ESFM_OP_DEFAULTS, ...ops[idx], ...updates };
    updateESFM({ operators: ops });
  }, [config.esfm, updateESFM]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in slide-in-from-top-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-orange-500/30", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16, className: "text-orange-400" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2553,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "ESFM Extensions" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2554,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2552,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "NOISE",
          value: esfm.noise,
          min: 0,
          max: 7,
          onChange: (v) => updateESFM({ noise: Math.round(v) }),
          size: "sm",
          color: "#f97316",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2558,
          columnNumber: 11
        },
        void 0
      ),
      esfm.operators.map((op, idx) => {
        const opData = { ...ESFM_OP_DEFAULTS, ...op };
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded border border-orange-500/20 bg-dark-bg/50", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-[10px] font-bold text-orange-400 mb-2", children: [
            "OP",
            idx + 1,
            " ESFM"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2567,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 mb-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "DELAY",
                value: opData.delay,
                min: 0,
                max: 7,
                onChange: (v) => updateESFMOp(idx, { delay: Math.round(v) }),
                size: "sm",
                color: "#fb923c",
                formatValue: (v) => String(Math.round(v))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 2569,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "OUT",
                value: opData.outLvl,
                min: 0,
                max: 7,
                onChange: (v) => updateESFMOp(idx, { outLvl: Math.round(v) }),
                size: "sm",
                color: "#f97316",
                formatValue: (v) => String(Math.round(v))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 2572,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "MOD IN",
                value: opData.modIn,
                min: 0,
                max: 7,
                onChange: (v) => updateESFMOp(idx, { modIn: Math.round(v) }),
                size: "sm",
                color: "#ea580c",
                formatValue: (v) => String(Math.round(v))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 2575,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "CT",
                value: opData.ct,
                min: -128,
                max: 127,
                onChange: (v) => updateESFMOp(idx, { ct: Math.round(v) }),
                size: "sm",
                color: "#c2410c",
                formatValue: (v) => String(Math.round(v))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 2578,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                label: "DT",
                value: opData.dt,
                min: -128,
                max: 127,
                onChange: (v) => updateESFMOp(idx, { dt: Math.round(v) }),
                size: "sm",
                color: "#9a3412",
                formatValue: (v) => String(Math.round(v))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
                lineNumber: 2581,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2568,
            columnNumber: 17
          }, void 0),
          opData.fixed && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "FREQ",
              value: opData.fixedFreq,
              min: 0,
              max: 1023,
              onChange: (v) => updateESFMOp(idx, { fixedFreq: Math.round(v) }),
              size: "sm",
              color: "#fdba74",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2586,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "LEFT", value: opData.left, onChange: (v) => updateESFMOp(idx, { left: v }) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2591,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "RIGHT", value: opData.right, onChange: (v) => updateESFMOp(idx, { right: v }) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2592,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToggleButton, { label: "FIXED", value: opData.fixed, onChange: (v) => updateESFMOp(idx, { fixed: v }) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2593,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2590,
            columnNumber: 17
          }, void 0)
        ] }, idx, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2566,
          columnNumber: 15
        }, void 0);
      })
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2557,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2551,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2550,
    columnNumber: 5
  }, void 0);
};
const MULTIPCM_DEFAULTS = {
  ar: 15,
  d1r: 0,
  dl: 0,
  d2r: 0,
  rr: 15,
  rc: 0,
  lfo: 0,
  vib: 0,
  am: 0,
  damp: false,
  pseudoReverb: false,
  lfoReset: false,
  levelDirect: false
};
const MultiPCMPanel = ({ config, onChange }) => {
  const mpcm = reactExports.useMemo(() => ({ ...MULTIPCM_DEFAULTS, ...config.multipcm }), [config.multipcm]);
  const updateMultiPCM = reactExports.useCallback((updates) => {
    onChange({ multipcm: { ...config.multipcm, ...MULTIPCM_DEFAULTS, ...updates } });
  }, [config.multipcm, onChange]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in slide-in-from-top-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-pink-500/30", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-pink-400" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2624,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "MultiPCM Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2625,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2623,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap justify-between gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "AR",
            value: mpcm.ar,
            min: 0,
            max: 15,
            onChange: (v) => updateMultiPCM({ ar: Math.round(v) }),
            size: "sm",
            color: "#ec4899",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2630,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "D1R",
            value: mpcm.d1r,
            min: 0,
            max: 15,
            onChange: (v) => updateMultiPCM({ d1r: Math.round(v) }),
            size: "sm",
            color: "#f472b6",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2633,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "DL",
            value: mpcm.dl,
            min: 0,
            max: 15,
            onChange: (v) => updateMultiPCM({ dl: Math.round(v) }),
            size: "sm",
            color: "#f9a8d4",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2636,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "D2R",
            value: mpcm.d2r,
            min: 0,
            max: 15,
            onChange: (v) => updateMultiPCM({ d2r: Math.round(v) }),
            size: "sm",
            color: "#db2777",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2639,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "RR",
            value: mpcm.rr,
            min: 0,
            max: 15,
            onChange: (v) => updateMultiPCM({ rr: Math.round(v) }),
            size: "sm",
            color: "#be185d",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2642,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "RC",
            value: mpcm.rc,
            min: 0,
            max: 15,
            onChange: (v) => updateMultiPCM({ rc: Math.round(v) }),
            size: "sm",
            color: "#9d174d",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2645,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2629,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 pt-2 border-t border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "LFO",
            value: mpcm.lfo,
            min: 0,
            max: 7,
            onChange: (v) => updateMultiPCM({ lfo: Math.round(v) }),
            size: "sm",
            color: "#d946ef",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2651,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "VIB",
            value: mpcm.vib,
            min: 0,
            max: 7,
            onChange: (v) => updateMultiPCM({ vib: Math.round(v) }),
            size: "sm",
            color: "#c026d3",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2654,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "AM",
            value: mpcm.am,
            min: 0,
            max: 7,
            onChange: (v) => updateMultiPCM({ am: Math.round(v) }),
            size: "sm",
            color: "#a21caf",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2657,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2650,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 pt-2 border-t border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateMultiPCM({ damp: !mpcm.damp }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${mpcm.damp ? "bg-pink-600/20 border-pink-500/50 text-pink-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Damp"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2663,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateMultiPCM({ pseudoReverb: !mpcm.pseudoReverb }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${mpcm.pseudoReverb ? "bg-pink-600/20 border-pink-500/50 text-pink-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Pseudo Reverb"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2673,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateMultiPCM({ lfoReset: !mpcm.lfoReset }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${mpcm.lfoReset ? "bg-pink-600/20 border-pink-500/50 text-pink-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "LFO Reset"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2683,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateMultiPCM({ levelDirect: !mpcm.levelDirect }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${mpcm.levelDirect ? "bg-pink-600/20 border-pink-500/50 text-pink-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Level Direct"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2693,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2662,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2628,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2622,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2621,
    columnNumber: 5
  }, void 0);
};
const SU_DEFAULTS = { switchRoles: false, hwSeqLen: 0, hwSeq: [] };
const SoundUnitPanel = ({ config, onChange }) => {
  const su = reactExports.useMemo(() => ({ ...SU_DEFAULTS, ...config.soundUnit }), [config.soundUnit]);
  const updateSU = reactExports.useCallback((updates) => {
    onChange({ soundUnit: { ...config.soundUnit, ...SU_DEFAULTS, ...updates } });
  }, [config.soundUnit, onChange]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in slide-in-from-top-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-lime-500/30", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cpu, { size: 16, className: "text-lime-400" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2727,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "Sound Unit" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2728,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2726,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "SEQ LEN",
            value: su.hwSeqLen,
            min: 0,
            max: 255,
            onChange: (v) => updateSU({ hwSeqLen: Math.round(v) }),
            size: "md",
            color: "#84cc16",
            formatValue: (v) => String(Math.round(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2733,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateSU({ switchRoles: !su.switchRoles }),
            className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${su.switchRoles ? "bg-lime-600/20 border-lime-500/50 text-lime-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
            children: "Switch Roles"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2737,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2732,
        columnNumber: 11
      }, void 0),
      su.hwSeq.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "pt-2 border-t border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted font-mono block mb-1", children: [
          "Hardware Sequence (",
          su.hwSeq.length,
          " step",
          su.hwSeq.length !== 1 ? "s" : "",
          ")"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2751,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "max-h-32 overflow-y-auto", children: su.hwSeq.map((step, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 text-[9px] font-mono text-text-muted py-0.5", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-lime-400 w-6", children: i }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2757,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
            "cmd=",
            step.cmd
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2758,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
            "val=",
            step.val
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2759,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
            "bound=",
            step.bound
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2760,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
            "spd=",
            step.speed
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2761,
            columnNumber: 21
          }, void 0)
        ] }, i, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2756,
          columnNumber: 19
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2754,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2750,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2731,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2725,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2724,
    columnNumber: 5
  }, void 0);
};
const ES5506_DEFAULTS = {
  filter: { mode: 0, k1: 65535, k2: 65535 },
  envelope: { ecount: 0, lVRamp: 0, rVRamp: 0, k1Ramp: 0, k2Ramp: 0, k1Slow: false, k2Slow: false }
};
const ES5506Panel = ({ config, onChange }) => {
  const es = reactExports.useMemo(() => {
    var _a, _b;
    return {
      filter: { ...ES5506_DEFAULTS.filter, ...(_a = config.es5506) == null ? void 0 : _a.filter },
      envelope: { ...ES5506_DEFAULTS.envelope, ...(_b = config.es5506) == null ? void 0 : _b.envelope }
    };
  }, [config.es5506]);
  const updateFilter = reactExports.useCallback((updates) => {
    var _a, _b;
    const cur = { ...ES5506_DEFAULTS.filter, ...(_a = config.es5506) == null ? void 0 : _a.filter, ...updates };
    onChange({ es5506: { filter: cur, envelope: ((_b = config.es5506) == null ? void 0 : _b.envelope) ?? ES5506_DEFAULTS.envelope } });
  }, [config.es5506, onChange]);
  const updateEnvelope = reactExports.useCallback((updates) => {
    var _a, _b;
    const cur = { ...ES5506_DEFAULTS.envelope, ...(_a = config.es5506) == null ? void 0 : _a.envelope, ...updates };
    onChange({ es5506: { filter: ((_b = config.es5506) == null ? void 0 : _b.filter) ?? ES5506_DEFAULTS.filter, envelope: cur } });
  }, [config.es5506, onChange]);
  const filterModes = ["Off", "LP", "K2", "HP", "BP"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in slide-in-from-top-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-indigo-500/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Volume2, { size: 16, className: "text-indigo-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2805,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "ES5506 Filter" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2806,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2804,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted font-mono block mb-1", children: "Mode" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2811,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(es.filter.mode),
              onChange: (v) => updateFilter({ mode: parseInt(v) }),
              className: "bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary",
              options: filterModes.map((mode, i) => ({ value: String(i), label: mode }))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2812,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2810,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "K1",
            value: es.filter.k1,
            min: 0,
            max: 65535,
            onChange: (v) => updateFilter({ k1: Math.round(v) }),
            size: "sm",
            color: "#818cf8",
            formatValue: (v) => Math.round(v).toString(16).toUpperCase()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2819,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "K2",
            value: es.filter.k2,
            min: 0,
            max: 65535,
            onChange: (v) => updateFilter({ k2: Math.round(v) }),
            size: "sm",
            color: "#6366f1",
            formatValue: (v) => Math.round(v).toString(16).toUpperCase()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2822,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2809,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2803,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-indigo-500/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-indigo-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2831,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "ES5506 Envelope" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2832,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2830,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "ECOUNT",
              value: es.envelope.ecount,
              min: 0,
              max: 511,
              onChange: (v) => updateEnvelope({ ecount: Math.round(v) }),
              size: "sm",
              color: "#a5b4fc",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2837,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "L RAMP",
              value: es.envelope.lVRamp,
              min: -128,
              max: 127,
              onChange: (v) => updateEnvelope({ lVRamp: Math.round(v) }),
              size: "sm",
              color: "#818cf8",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2840,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "R RAMP",
              value: es.envelope.rVRamp,
              min: -128,
              max: 127,
              onChange: (v) => updateEnvelope({ rVRamp: Math.round(v) }),
              size: "sm",
              color: "#6366f1",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2843,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "K1 RAMP",
              value: es.envelope.k1Ramp,
              min: -128,
              max: 127,
              onChange: (v) => updateEnvelope({ k1Ramp: Math.round(v) }),
              size: "sm",
              color: "#4f46e5",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2846,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "K2 RAMP",
              value: es.envelope.k2Ramp,
              min: -128,
              max: 127,
              onChange: (v) => updateEnvelope({ k2Ramp: Math.round(v) }),
              size: "sm",
              color: "#4338ca",
              formatValue: (v) => String(Math.round(v))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2849,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2836,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 pt-2 border-t border-dark-border", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateEnvelope({ k1Slow: !es.envelope.k1Slow }),
              className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${es.envelope.k1Slow ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
              children: "K1 Slow"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2855,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateEnvelope({ k2Slow: !es.envelope.k2Slow }),
              className: `px-2 py-1 text-[9px] font-mono rounded border transition-colors ${es.envelope.k2Slow ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-400" : "bg-dark-bg border-dark-border text-text-muted"}`,
              children: "K2 Slow"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
              lineNumber: 2865,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2854,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2835,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2829,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2801,
    columnNumber: 5
  }, void 0);
};
const SID2_DEFAULTS = { volume: 15, mixMode: 0, noiseMode: 0 };
const SID2Panel = ({ config, onChange }) => {
  const sid2 = reactExports.useMemo(() => ({ ...SID2_DEFAULTS, ...config.sid2 }), [config.sid2]);
  const updateSID2 = reactExports.useCallback((updates) => {
    onChange({ sid2: { ...config.sid2, ...SID2_DEFAULTS, ...updates } });
  }, [config.sid2, onChange]);
  const mixModes = ["Normal", "Mode 1", "Mode 2", "Mode 3"];
  const noiseModes = ["Normal", "Mode 1", "Mode 2", "Mode 3"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4 animate-in fade-in slide-in-from-top-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary p-4 rounded-lg border border-fuchsia-500/30", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 16, className: "text-fuchsia-400" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2902,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-mono text-xs font-bold text-text-primary uppercase", children: "SID2" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2903,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2901,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "VOL",
          value: sid2.volume,
          min: 0,
          max: 15,
          onChange: (v) => updateSID2({ volume: Math.round(v) }),
          size: "md",
          color: "#d946ef",
          formatValue: (v) => String(Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2907,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted font-mono block mb-1", children: "Mix Mode" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2912,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(sid2.mixMode),
            onChange: (v) => updateSID2({ mixMode: parseInt(v) }),
            className: "bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary",
            options: mixModes.map((mode, i) => ({ value: String(i), label: mode }))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2913,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2911,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted font-mono block mb-1", children: "Noise Mode" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
          lineNumber: 2921,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(sid2.noiseMode),
            onChange: (v) => updateSID2({ noiseMode: parseInt(v) }),
            className: "bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary",
            options: noiseModes.map((mode, i) => ({ value: String(i), label: mode }))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
            lineNumber: 2922,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
        lineNumber: 2920,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
      lineNumber: 2906,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2900,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/FurnaceEditor.tsx",
    lineNumber: 2899,
    columnNumber: 5
  }, void 0);
};
function getChipCategory(id) {
  if ([0, 1, 2, 11, 13, 14, 22, 23, 26].includes(id)) return "FM";
  if ([3, 4, 5, 12, 15, 16, 17, 18, 33, 34, 35, 43, 44].includes(id)) return "PSG";
  if ([6, 7, 8, 9, 19, 36, 37, 38].includes(id)) return "Wavetable";
  if ([10, 20, 21, 24, 25, 27, 28, 29, 30, 31, 32, 39, 40, 41, 42].includes(id)) return "PCM";
  return "Other";
}
function getChipName(id) {
  const names = {
    0: "Sega Genesis (YM2612)",
    1: "Arcade / X68000 (YM2151)",
    2: "AdLib / Sound Blaster (OPL3)",
    3: "Sega Master System (SN76489)",
    4: "Nintendo NES (2A03)",
    5: "Nintendo Game Boy (LR35902)",
    6: "PC Engine / TurboGrafx (HuC6280)",
    7: "Konami MSX (SCC)",
    8: "Namco Arcade (N163)",
    9: "Famicom (VRC6)",
    10: "Commodore 64 (SID)",
    11: "MSX / Sega (OPLL)",
    12: "ZX Spectrum / Amstrad (AY-3-8910)",
    13: "NEC PC-98 (OPNA)",
    14: "Neo Geo (OPNB)",
    15: "Atari 2600 (TIA)",
    16: "Famicom Disk System",
    17: "Famicom (MMC5)",
    18: "SAM Coupe (SAA1099)",
    19: "Bandai WonderSwan",
    20: "Arcade (OKI MSM6295)",
    21: "Ensoniq (ES5506)",
    22: "Yamaha TX81Z (OPZ)",
    23: "MSX-Audio (Y8950)",
    24: "Super Nintendo (SPC700)",
    25: "Atari Lynx",
    26: "Yamaha (OPL4)",
    27: "Sega Arcade (SegaPCM)",
    28: "Yamaha (YMZ280B)",
    29: "Sega CD (RF5C68)",
    30: "Irem Arcade (GA20)",
    31: "Namco Arcade (C140)",
    32: "Capcom Arcade (QSound)",
    33: "Commodore VIC-20",
    34: "Commodore Plus/4 (TED)",
    35: "Watara Supervision",
    36: "Commander X16 (VERA)",
    37: "Game Gear (SM8521)",
    38: "Konami Bubble System",
    39: "Konami Arcade (K007232)",
    40: "Konami Arcade (K053260)",
    41: "Seta Arcade (X1-010)",
    42: "NEC (μPD1771)",
    43: "Toshiba (T6W28)",
    44: "Nintendo Virtual Boy"
  };
  return names[id] || `Unknown Chip (${id})`;
}
function isOperatorCarrier(algorithm, opIndex) {
  var _a;
  const carrierMap = {
    0: [0],
    // Alg 0: OP1 is carrier
    1: [0],
    // Alg 1: OP1 is carrier
    2: [0],
    // Alg 2: OP1 is carrier
    3: [0],
    // Alg 3: OP1 is carrier
    4: [0, 2],
    // Alg 4: OP1 and OP3 are carriers
    5: [0, 1, 2],
    // Alg 5: OP1, OP2, OP3 are carriers
    6: [0, 1, 2],
    // Alg 6: OP1, OP2, OP3 are carriers
    7: [0, 1, 2, 3]
    // Alg 7: All operators are carriers
  };
  return ((_a = carrierMap[algorithm]) == null ? void 0 : _a.includes(opIndex)) ?? false;
}
export {
  FurnaceEditor as FurnaceControls,
  FurnaceEditor as default
};
