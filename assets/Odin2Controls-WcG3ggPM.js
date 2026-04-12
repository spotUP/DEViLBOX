import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, a6 as Loader } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob, $ as getToneEngine } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { VSTBridgePanel } from "./VSTBridgePanel-C5HiFSR6.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { F as FilterFrequencyResponse } from "./FilterFrequencyResponse-BHF9gTID.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const Toggle = reactExports.memo(({ id, label, params, accentColor, setParam }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    onClick: () => setParam(id, params[id] > 0.5 ? 0 : 1),
    className: `px-2 py-1 text-[10px] font-bold rounded transition-all ${params[id] > 0.5 ? "text-black" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover"}`,
    style: params[id] > 0.5 ? { backgroundColor: accentColor } : {},
    children: label
  },
  void 0,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
    lineNumber: 31,
    columnNumber: 3
  },
  void 0
));
Toggle.displayName = "Toggle";
const FxToggle = reactExports.memo(({ id, label, params, fxAccent, setParam }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    onClick: () => setParam(id, params[id] > 0.5 ? 0 : 1),
    className: `px-2 py-1 text-[10px] font-bold rounded transition-all ${params[id] > 0.5 ? "text-black" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover"}`,
    style: params[id] > 0.5 ? { backgroundColor: fxAccent } : {},
    children: label
  },
  void 0,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
    lineNumber: 48,
    columnNumber: 3
  },
  void 0
));
FxToggle.displayName = "FxToggle";
const TypeSelect = reactExports.memo(({ id, labels, params, accentColor, setParam }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1", children: labels.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    onClick: () => setParam(id, i),
    className: `px-1.5 py-1 text-[9px] font-bold rounded transition-all ${Math.round(params[id]) === i ? "text-black" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
    style: Math.round(params[id]) === i ? { backgroundColor: accentColor } : {},
    children: label
  },
  label,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
    lineNumber: 67,
    columnNumber: 7
  },
  void 0
)) }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
  lineNumber: 65,
  columnNumber: 3
}, void 0));
TypeSelect.displayName = "TypeSelect";
const Section = reactExports.memo(({ title, color, bg, panelBg, accentColor, children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${bg || panelBg}`, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-2", style: { color: color || accentColor }, children: title }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
    lineNumber: 88,
    columnNumber: 5
  }, void 0),
  children
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
  lineNumber: 87,
  columnNumber: 3
}, void 0));
Section.displayName = "Section";
const P = {
  // Master (6)
  MASTER_VOL: 0,
  MASTER_GAIN: 1,
  MASTER_PAN: 2,
  MASTER_GLIDE: 3,
  MASTER_VELOCITY: 4,
  MASTER_UNISON_DETUNE: 5,
  // Osc1 (11)
  OSC1_TYPE: 6,
  OSC1_VOL: 7,
  OSC1_OCT: 8,
  OSC1_SEMI: 9,
  OSC1_FINE: 10,
  OSC1_PW: 12,
  OSC1_POS: 13,
  OSC1_FM: 14,
  OSC1_DRIFT: 15,
  OSC1_RESET: 16,
  // Osc2 (12)
  OSC2_TYPE: 17,
  OSC2_VOL: 18,
  OSC2_OCT: 19,
  OSC2_SEMI: 20,
  OSC2_FINE: 21,
  OSC2_PW: 23,
  OSC2_POS: 24,
  OSC2_FM: 25,
  OSC2_DRIFT: 26,
  OSC2_SYNC: 27,
  OSC2_RESET: 28,
  // Osc3 (12)
  OSC3_TYPE: 29,
  OSC3_VOL: 30,
  OSC3_OCT: 31,
  OSC3_SEMI: 32,
  OSC3_FINE: 33,
  OSC3_PW: 35,
  OSC3_POS: 36,
  OSC3_FM: 37,
  OSC3_DRIFT: 38,
  OSC3_SYNC: 39,
  OSC3_RESET: 40,
  // Filter1 (11)
  FIL1_TYPE: 41,
  FIL1_FREQ: 42,
  FIL1_RES: 43,
  FIL1_GAIN: 44,
  FIL1_ENV: 45,
  FIL1_SAT: 46,
  FIL1_VEL: 47,
  FIL1_KBD: 48,
  FIL1_OSC1: 49,
  FIL1_OSC2: 50,
  FIL1_OSC3: 51,
  // Filter2 (12)
  FIL2_TYPE: 52,
  FIL2_FREQ: 53,
  FIL2_RES: 54,
  FIL2_GAIN: 55,
  FIL2_ENV: 56,
  FIL2_SAT: 57,
  FIL2_VEL: 58,
  FIL2_KBD: 59,
  FIL2_OSC1: 60,
  FIL2_OSC2: 61,
  FIL2_OSC3: 62,
  FIL2_FIL1: 63,
  // Routing (2)
  FIL1_AMP: 64,
  FIL2_AMP: 65,
  // Env1 (5)
  ENV1_A: 66,
  ENV1_D: 67,
  ENV1_S: 68,
  ENV1_R: 69,
  ENV1_LOOP: 70,
  // Env2 (5)
  ENV2_A: 71,
  ENV2_D: 72,
  ENV2_S: 73,
  ENV2_R: 74,
  ENV2_LOOP: 75,
  // Env3 (5)
  ENV3_A: 76,
  ENV3_D: 77,
  ENV3_S: 78,
  ENV3_R: 79,
  ENV3_LOOP: 80,
  // LFO1 (3)
  LFO1_FREQ: 81,
  LFO1_DEPTH: 83,
  // LFO2 (3)
  LFO2_FREQ: 84,
  LFO2_DEPTH: 86,
  // LFO3 (3)
  LFO3_FREQ: 87,
  LFO3_DEPTH: 89,
  // Distortion (3)
  DIST_ON: 90,
  DIST_BOOST: 91,
  DIST_DRYWET: 92,
  // Delay (6)
  DELAY_ON: 93,
  DELAY_TIME: 94,
  DELAY_FB: 95,
  DELAY_HP: 96,
  DELAY_DRY: 97,
  DELAY_WET: 98,
  // Phaser (5)
  PHASER_ON: 99,
  PHASER_RATE: 100,
  PHASER_MOD: 101,
  PHASER_FB: 102,
  PHASER_DW: 103,
  // Flanger (5)
  FLANGER_ON: 104,
  FLANGER_RATE: 105,
  FLANGER_AMT: 106,
  FLANGER_FB: 107,
  FLANGER_DW: 108,
  // Chorus (5)
  CHORUS_ON: 109,
  CHORUS_RATE: 110,
  CHORUS_AMT: 111,
  CHORUS_FB: 112,
  CHORUS_DW: 113,
  // Reverb (5)
  REVERB_ON: 114,
  REVERB_HALL: 115,
  REVERB_DAMP: 116,
  REVERB_PRE: 117,
  REVERB_DW: 118
};
const PARAM_COUNT = 119;
const OSC_TYPE_LABELS = [
  "Analog",
  "Wavetable",
  "Multi",
  "Vector",
  "Chip",
  "FM",
  "PM",
  "Noise",
  "WaveDraw",
  "ChipDraw",
  "SpecDraw"
];
const FILTER_TYPE_LABELS = [
  "None",
  "LP24",
  "LP12",
  "BP24",
  "BP12",
  "HP24",
  "HP12",
  "SEM12",
  "Korg LP",
  "Korg HP",
  "Diode",
  "Formant",
  "Comb",
  "Ring"
];
const ODIN2_FILTER_MAP = [
  null,
  // None
  { type: "lowpass", poles: 4 },
  // LP24
  { type: "lowpass", poles: 2 },
  // LP12
  { type: "bandpass", poles: 4 },
  // BP24
  { type: "bandpass", poles: 2 },
  // BP12
  { type: "highpass", poles: 4 },
  // HP24
  { type: "highpass", poles: 2 },
  // HP12
  { type: "lowpass", poles: 2 },
  // SEM12 (state-variable, approximate as LP12)
  { type: "lowpass", poles: 4 },
  // Korg LP (Moog ladder)
  { type: "highpass", poles: 4 },
  // Korg HP
  { type: "lowpass", poles: 4 },
  // Diode
  { type: "lowpass", poles: 2 },
  // Formant (approximate)
  { type: "bandpass", poles: 2 },
  // Comb (approximate)
  { type: "bandpass", poles: 2 }
  // Ring (approximate)
];
const Odin2Controls = ({
  instrument,
  onChange
}) => {
  const [params, setParams] = reactExports.useState(new Array(PARAM_COUNT).fill(0));
  const [synthReady, setSynthReady] = reactExports.useState(false);
  const synthRef = reactExports.useRef(null);
  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor } = useInstrumentColors("#4a9eff");
  const fxAccent = isCyanTheme ? "#00ccaa" : "#7c3aed";
  reactExports.useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      var _a;
      try {
        const engine = getToneEngine();
        const key = engine.getInstrumentKey(instrument.id, -1);
        const synth = (_a = engine.instruments) == null ? void 0 : _a.get(key);
        if (!synth || !("setParameter" in synth)) {
          setTimeout(() => {
            if (!cancelled) connect();
          }, 500);
          return;
        }
        if ("ensureInitialized" in synth) {
          await synth.ensureInitialized();
        }
        synthRef.current = synth;
        if ("getParams" in synth) {
          const wasmParams = synth.getParams();
          const vals = wasmParams.map((p) => p.defaultValue);
          if (!cancelled) {
            setParams(vals);
            setSynthReady(true);
          }
        } else {
          if (!cancelled) setSynthReady(true);
        }
      } catch {
        setTimeout(() => {
          if (!cancelled) connect();
        }, 1e3);
      }
    };
    connect();
    return () => {
      cancelled = true;
    };
  }, [instrument.id]);
  const setParam = reactExports.useCallback((id, value) => {
    setParams((prev) => {
      const next = [...prev];
      next[id] = value;
      return next;
    });
    if (synthRef.current) {
      synthRef.current.setParameter(id, value);
    }
  }, []);
  if (!synthReady) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center gap-2 p-4 text-text-secondary", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Loader, { size: 16, className: "animate-spin" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 246,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm", children: "Loading Odin2..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 247,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 245,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VSTBridgePanel, { instrument, onChange }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 249,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 244,
      columnNumber: 7
    }, void 0);
  }
  const panelBg = isCyanTheme ? "bg-[#051515] border-accent-highlight/20" : "bg-[#1a1a1a] border-blue-900/30";
  const fxBg = isCyanTheme ? "bg-[#041210] border-teal-900/40" : "bg-[#151020] border-purple-900/30";
  const oscData = [
    { idx: 0, typeId: P.OSC1_TYPE, volId: P.OSC1_VOL, octId: P.OSC1_OCT, semiId: P.OSC1_SEMI, fineId: P.OSC1_FINE, pwId: P.OSC1_PW, posId: P.OSC1_POS, fmId: P.OSC1_FM, driftId: P.OSC1_DRIFT, resetId: P.OSC1_RESET, syncId: -1 },
    { idx: 1, typeId: P.OSC2_TYPE, volId: P.OSC2_VOL, octId: P.OSC2_OCT, semiId: P.OSC2_SEMI, fineId: P.OSC2_FINE, pwId: P.OSC2_PW, posId: P.OSC2_POS, fmId: P.OSC2_FM, driftId: P.OSC2_DRIFT, resetId: P.OSC2_RESET, syncId: P.OSC2_SYNC },
    { idx: 2, typeId: P.OSC3_TYPE, volId: P.OSC3_VOL, octId: P.OSC3_OCT, semiId: P.OSC3_SEMI, fineId: P.OSC3_FINE, pwId: P.OSC3_PW, posId: P.OSC3_POS, fmId: P.OSC3_FM, driftId: P.OSC3_DRIFT, resetId: P.OSC3_RESET, syncId: P.OSC3_SYNC }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Master", panelBg, accentColor, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 justify-center flex-wrap", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "Volume",
          value: params[P.MASTER_VOL],
          min: 0,
          max: 1,
          defaultValue: 0.7,
          onChange: (v) => setParam(P.MASTER_VOL, v),
          size: "md",
          color: knobColor
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 273,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "Gain",
          value: params[P.MASTER_GAIN],
          min: -24,
          max: 12,
          defaultValue: 0,
          onChange: (v) => setParam(P.MASTER_GAIN, v),
          color: knobColor,
          bipolar: true,
          formatValue: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 275,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "Pan",
          value: params[P.MASTER_PAN],
          min: -1,
          max: 1,
          defaultValue: 0,
          onChange: (v) => setParam(P.MASTER_PAN, v),
          color: knobColor,
          bipolar: true
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 278,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "Glide",
          value: params[P.MASTER_GLIDE],
          min: 0,
          max: 1,
          defaultValue: 0,
          onChange: (v) => setParam(P.MASTER_GLIDE, v),
          color: knobColor,
          formatValue: (v) => `${Math.round(v * 1e3)}ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 280,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "Velocity",
          value: params[P.MASTER_VELOCITY],
          min: 0,
          max: 1,
          defaultValue: 1,
          onChange: (v) => setParam(P.MASTER_VELOCITY, v),
          color: knobColor
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 283,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "Uni Det",
          value: params[P.MASTER_UNISON_DETUNE],
          min: 0,
          max: 1,
          defaultValue: 0,
          onChange: (v) => setParam(P.MASTER_UNISON_DETUNE, v),
          color: knobColor
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 285,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 272,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 271,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Oscillators", panelBg, accentColor, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4", children: oscData.map((osc) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold w-10 shrink-0", style: { color: accentColor }, children: [
          "OSC ",
          osc.idx + 1
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 296,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TypeSelect, { id: osc.typeId, labels: OSC_TYPE_LABELS, params, accentColor, setParam }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 299,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 295,
        columnNumber: 15
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 flex-wrap justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Vol",
            value: params[osc.volId],
            min: 0,
            max: 1,
            defaultValue: 0.7,
            onChange: (v) => setParam(osc.volId, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 302,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Oct",
            value: params[osc.octId],
            min: -4,
            max: 4,
            defaultValue: 0,
            step: 1,
            onChange: (v) => setParam(osc.octId, Math.round(v)),
            color: knobColor,
            formatValue: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 304,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Semi",
            value: params[osc.semiId],
            min: -12,
            max: 12,
            defaultValue: 0,
            step: 1,
            onChange: (v) => setParam(osc.semiId, Math.round(v)),
            color: knobColor,
            bipolar: true,
            formatValue: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 307,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Fine",
            value: params[osc.fineId],
            min: -100,
            max: 100,
            defaultValue: 0,
            onChange: (v) => setParam(osc.fineId, v),
            color: knobColor,
            bipolar: true,
            formatValue: (v) => `${v.toFixed(0)}ct`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 310,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "PW",
            value: params[osc.pwId],
            min: 0.02,
            max: 0.98,
            defaultValue: 0.5,
            onChange: (v) => setParam(osc.pwId, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 313,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Pos",
            value: params[osc.posId],
            min: 0,
            max: 1,
            defaultValue: 0,
            onChange: (v) => setParam(osc.posId, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 315,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "FM",
            value: params[osc.fmId],
            min: 0,
            max: 1,
            defaultValue: 0,
            onChange: (v) => setParam(osc.fmId, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 317,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Drift",
            value: params[osc.driftId],
            min: 0,
            max: 1,
            defaultValue: 0,
            onChange: (v) => setParam(osc.driftId, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 319,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: osc.resetId, label: "Reset", params, accentColor, setParam }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 321,
          columnNumber: 17
        }, void 0),
        osc.syncId >= 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: osc.syncId, label: "Sync", params, accentColor, setParam }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 322,
          columnNumber: 37
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 301,
        columnNumber: 15
      }, void 0)
    ] }, osc.idx, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 294,
      columnNumber: 13
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 292,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 291,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Filters", panelBg, accentColor, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold", style: { color: accentColor }, children: "FILTER 1" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 334,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TypeSelect, { id: P.FIL1_TYPE, labels: FILTER_TYPE_LABELS, params, accentColor, setParam }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 335,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 justify-center flex-wrap", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Freq",
              value: params[P.FIL1_FREQ],
              min: 20,
              max: 2e4,
              defaultValue: 1e4,
              onChange: (v) => setParam(P.FIL1_FREQ, v),
              color: knobColor,
              logarithmic: true,
              formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 337,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Res",
              value: params[P.FIL1_RES],
              min: 0,
              max: 1,
              defaultValue: 0.2,
              onChange: (v) => setParam(P.FIL1_RES, v),
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 340,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Gain",
              value: params[P.FIL1_GAIN],
              min: 0,
              max: 2,
              defaultValue: 1,
              onChange: (v) => setParam(P.FIL1_GAIN, v),
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 342,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Env",
              value: params[P.FIL1_ENV],
              min: -1,
              max: 1,
              defaultValue: 0.5,
              onChange: (v) => setParam(P.FIL1_ENV, v),
              color: knobColor,
              bipolar: true
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 344,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Sat",
              value: params[P.FIL1_SAT],
              min: 0,
              max: 1,
              defaultValue: 0,
              onChange: (v) => setParam(P.FIL1_SAT, v),
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 346,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Vel",
              value: params[P.FIL1_VEL],
              min: 0,
              max: 1,
              defaultValue: 0,
              onChange: (v) => setParam(P.FIL1_VEL, v),
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 348,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Kbd",
              value: params[P.FIL1_KBD],
              min: 0,
              max: 1,
              defaultValue: 0,
              onChange: (v) => setParam(P.FIL1_KBD, v),
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 350,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 336,
          columnNumber: 13
        }, void 0),
        (() => {
          const entry = ODIN2_FILTER_MAP[Math.round(params[P.FIL1_TYPE])];
          if (!entry) return null;
          const norm = Math.log10(Math.max(params[P.FIL1_FREQ], 20) / 20) / 3;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "my-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            FilterFrequencyResponse,
            {
              filterType: entry.type,
              cutoff: norm,
              resonance: params[P.FIL1_RES],
              poles: entry.poles,
              color: accentColor,
              width: 280,
              height: 56
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 359,
              columnNumber: 19
            },
            void 0
          ) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 358,
            columnNumber: 17
          }, void 0);
        })(),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: P.FIL1_OSC1, label: "Osc1", params, accentColor, setParam }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 368,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: P.FIL1_OSC2, label: "Osc2", params, accentColor, setParam }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 369,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: P.FIL1_OSC3, label: "Osc3", params, accentColor, setParam }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 370,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 367,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 333,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold", style: { color: accentColor }, children: "FILTER 2" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 376,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TypeSelect, { id: P.FIL2_TYPE, labels: FILTER_TYPE_LABELS, params, accentColor, setParam }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 377,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 justify-center flex-wrap", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Freq",
              value: params[P.FIL2_FREQ],
              min: 20,
              max: 2e4,
              defaultValue: 1e4,
              onChange: (v) => setParam(P.FIL2_FREQ, v),
              color: knobColor,
              logarithmic: true,
              formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 379,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Res",
              value: params[P.FIL2_RES],
              min: 0,
              max: 1,
              defaultValue: 0,
              onChange: (v) => setParam(P.FIL2_RES, v),
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 382,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Gain",
              value: params[P.FIL2_GAIN],
              min: 0,
              max: 2,
              defaultValue: 1,
              onChange: (v) => setParam(P.FIL2_GAIN, v),
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 384,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Env",
              value: params[P.FIL2_ENV],
              min: -1,
              max: 1,
              defaultValue: 0,
              onChange: (v) => setParam(P.FIL2_ENV, v),
              color: knobColor,
              bipolar: true
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 386,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Sat",
              value: params[P.FIL2_SAT],
              min: 0,
              max: 1,
              defaultValue: 0,
              onChange: (v) => setParam(P.FIL2_SAT, v),
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 388,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Vel",
              value: params[P.FIL2_VEL],
              min: 0,
              max: 1,
              defaultValue: 0,
              onChange: (v) => setParam(P.FIL2_VEL, v),
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 390,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Kbd",
              value: params[P.FIL2_KBD],
              min: 0,
              max: 1,
              defaultValue: 0,
              onChange: (v) => setParam(P.FIL2_KBD, v),
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 392,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 378,
          columnNumber: 13
        }, void 0),
        (() => {
          const entry = ODIN2_FILTER_MAP[Math.round(params[P.FIL2_TYPE])];
          if (!entry) return null;
          const norm = Math.log10(Math.max(params[P.FIL2_FREQ], 20) / 20) / 3;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "my-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            FilterFrequencyResponse,
            {
              filterType: entry.type,
              cutoff: norm,
              resonance: params[P.FIL2_RES],
              poles: entry.poles,
              color: accentColor,
              width: 280,
              height: 56
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 401,
              columnNumber: 19
            },
            void 0
          ) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 400,
            columnNumber: 17
          }, void 0);
        })(),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: P.FIL2_OSC1, label: "Osc1", params, accentColor, setParam }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 410,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: P.FIL2_OSC2, label: "Osc2", params, accentColor, setParam }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 411,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: P.FIL2_OSC3, label: "Osc3", params, accentColor, setParam }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 412,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: P.FIL2_FIL1, label: "Fil1", params, accentColor, setParam }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 413,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 409,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 375,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 331,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 330,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Routing", panelBg, accentColor, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 justify-center", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: P.FIL1_AMP, label: "Fil1 → Amp", params, accentColor, setParam }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 422,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: P.FIL2_AMP, label: "Fil2 → Amp", params, accentColor, setParam }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 423,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 421,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 420,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Envelopes", panelBg, accentColor, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4", children: [
      { label: "AMP EG", a: P.ENV1_A, d: P.ENV1_D, s: P.ENV1_S, r: P.ENV1_R, loop: P.ENV1_LOOP },
      { label: "FILTER EG", a: P.ENV2_A, d: P.ENV2_D, s: P.ENV2_S, r: P.ENV2_R, loop: P.ENV2_LOOP },
      { label: "MOD EG", a: P.ENV3_A, d: P.ENV3_D, s: P.ENV3_S, r: P.ENV3_R, loop: P.ENV3_LOOP }
    ].map((env) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold block mb-2", style: { color: accentColor }, children: env.label }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 436,
        columnNumber: 15
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 justify-center flex-wrap", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "A",
            value: params[env.a],
            min: 1e-3,
            max: 5,
            defaultValue: 0.01,
            onChange: (v) => setParam(env.a, v),
            color: knobColor,
            formatValue: (v) => v < 0.1 ? `${(v * 1e3).toFixed(0)}ms` : `${v.toFixed(2)}s`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 440,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "D",
            value: params[env.d],
            min: 1e-3,
            max: 5,
            defaultValue: 0.3,
            onChange: (v) => setParam(env.d, v),
            color: knobColor,
            formatValue: (v) => v < 0.1 ? `${(v * 1e3).toFixed(0)}ms` : `${v.toFixed(2)}s`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 443,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "S",
            value: params[env.s],
            min: 0,
            max: 1,
            defaultValue: 0.7,
            onChange: (v) => setParam(env.s, v),
            color: knobColor,
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 446,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "R",
            value: params[env.r],
            min: 1e-3,
            max: 5,
            defaultValue: 0.3,
            onChange: (v) => setParam(env.r, v),
            color: knobColor,
            formatValue: (v) => v < 0.1 ? `${(v * 1e3).toFixed(0)}ms` : `${v.toFixed(2)}s`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 449,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { id: env.loop, label: "Loop", params, accentColor, setParam }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 452,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 439,
        columnNumber: 15
      }, void 0)
    ] }, env.label, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 435,
      columnNumber: 13
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 429,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 428,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "LFOs", panelBg, accentColor, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4", children: [
      { label: "LFO1 → Filter", freq: P.LFO1_FREQ, depth: P.LFO1_DEPTH },
      { label: "LFO2 → Pitch", freq: P.LFO2_FREQ, depth: P.LFO2_DEPTH },
      { label: "LFO3 → Amp", freq: P.LFO3_FREQ, depth: P.LFO3_DEPTH }
    ].map((lfo) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold block mb-2", style: { color: accentColor }, children: lfo.label }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 468,
        columnNumber: 15
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Freq",
            value: params[lfo.freq],
            min: 0.01,
            max: 20,
            defaultValue: 2,
            onChange: (v) => setParam(lfo.freq, v),
            color: knobColor,
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 472,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Depth",
            value: params[lfo.depth],
            min: 0,
            max: 1,
            defaultValue: 0,
            onChange: (v) => setParam(lfo.depth, v),
            color: knobColor,
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
            lineNumber: 475,
            columnNumber: 17
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 471,
        columnNumber: 15
      }, void 0)
    ] }, lfo.label, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 467,
      columnNumber: 13
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 461,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 460,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Distortion", color: fxAccent, bg: fxBg, panelBg, accentColor, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 items-center justify-center flex-wrap", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FxToggle, { id: P.DIST_ON, label: "ON", params, fxAccent, setParam }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 487,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "Boost",
          value: params[P.DIST_BOOST],
          min: 0,
          max: 1,
          defaultValue: 0.5,
          onChange: (v) => setParam(P.DIST_BOOST, v),
          color: fxAccent
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 488,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          label: "Dry/Wet",
          value: params[P.DIST_DRYWET],
          min: 0,
          max: 1,
          defaultValue: 1,
          onChange: (v) => setParam(P.DIST_DRYWET, v),
          color: fxAccent
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 490,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 486,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 485,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Effects", color: fxAccent, bg: fxBg, panelBg, accentColor, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FxToggle, { id: P.DELAY_ON, label: "DELAY", params, fxAccent, setParam }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 501,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 500,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 flex-wrap justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Time",
              value: params[P.DELAY_TIME],
              min: 0.01,
              max: 2,
              defaultValue: 0.3,
              onChange: (v) => setParam(P.DELAY_TIME, v),
              color: fxAccent,
              formatValue: (v) => `${(v * 1e3).toFixed(0)}ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 504,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Feedback",
              value: params[P.DELAY_FB],
              min: 0,
              max: 1,
              defaultValue: 0.4,
              onChange: (v) => setParam(P.DELAY_FB, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 507,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "HP",
              value: params[P.DELAY_HP],
              min: 20,
              max: 2e3,
              defaultValue: 80,
              onChange: (v) => setParam(P.DELAY_HP, v),
              color: fxAccent,
              logarithmic: true
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 509,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Dry",
              value: params[P.DELAY_DRY],
              min: 0,
              max: 1,
              defaultValue: 1,
              onChange: (v) => setParam(P.DELAY_DRY, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 511,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Wet",
              value: params[P.DELAY_WET],
              min: 0,
              max: 1,
              defaultValue: 0.3,
              onChange: (v) => setParam(P.DELAY_WET, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 513,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 503,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 499,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FxToggle, { id: P.CHORUS_ON, label: "CHORUS", params, fxAccent, setParam }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 521,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 520,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 flex-wrap justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Rate",
              value: params[P.CHORUS_RATE],
              min: 0.01,
              max: 10,
              defaultValue: 0.3,
              onChange: (v) => setParam(P.CHORUS_RATE, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 524,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Amount",
              value: params[P.CHORUS_AMT],
              min: 0,
              max: 1,
              defaultValue: 0.5,
              onChange: (v) => setParam(P.CHORUS_AMT, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 526,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "FB",
              value: params[P.CHORUS_FB],
              min: -0.98,
              max: 0.98,
              defaultValue: 0,
              onChange: (v) => setParam(P.CHORUS_FB, v),
              color: fxAccent,
              bipolar: true
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 528,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "D/W",
              value: params[P.CHORUS_DW],
              min: 0,
              max: 1,
              defaultValue: 0.5,
              onChange: (v) => setParam(P.CHORUS_DW, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 530,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 523,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 519,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FxToggle, { id: P.PHASER_ON, label: "PHASER", params, fxAccent, setParam }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 538,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 537,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 flex-wrap justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Rate",
              value: params[P.PHASER_RATE],
              min: 0.01,
              max: 10,
              defaultValue: 0.5,
              onChange: (v) => setParam(P.PHASER_RATE, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 541,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Mod",
              value: params[P.PHASER_MOD],
              min: 0,
              max: 1.5,
              defaultValue: 0.5,
              onChange: (v) => setParam(P.PHASER_MOD, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 543,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "FB",
              value: params[P.PHASER_FB],
              min: 0,
              max: 0.97,
              defaultValue: 0.3,
              onChange: (v) => setParam(P.PHASER_FB, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 545,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "D/W",
              value: params[P.PHASER_DW],
              min: 0,
              max: 1,
              defaultValue: 0.5,
              onChange: (v) => setParam(P.PHASER_DW, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 547,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 540,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 536,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FxToggle, { id: P.FLANGER_ON, label: "FLANGER", params, fxAccent, setParam }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 555,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 554,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 flex-wrap justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Rate",
              value: params[P.FLANGER_RATE],
              min: 0.01,
              max: 10,
              defaultValue: 0.3,
              onChange: (v) => setParam(P.FLANGER_RATE, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 558,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Amount",
              value: params[P.FLANGER_AMT],
              min: 0,
              max: 1,
              defaultValue: 0.5,
              onChange: (v) => setParam(P.FLANGER_AMT, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 560,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "FB",
              value: params[P.FLANGER_FB],
              min: -0.98,
              max: 0.98,
              defaultValue: 0.3,
              onChange: (v) => setParam(P.FLANGER_FB, v),
              color: fxAccent,
              bipolar: true
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 562,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "D/W",
              value: params[P.FLANGER_DW],
              min: 0,
              max: 1,
              defaultValue: 0.5,
              onChange: (v) => setParam(P.FLANGER_DW, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 564,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 557,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 553,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FxToggle, { id: P.REVERB_ON, label: "REVERB", params, fxAccent, setParam }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 572,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 571,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 flex-wrap justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Hall",
              value: params[P.REVERB_HALL],
              min: 0.2,
              max: 10,
              defaultValue: 2,
              onChange: (v) => setParam(P.REVERB_HALL, v),
              color: fxAccent,
              formatValue: (v) => `${v.toFixed(1)}s`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 575,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Damp",
              value: params[P.REVERB_DAMP],
              min: 500,
              max: 2e4,
              defaultValue: 6e3,
              onChange: (v) => setParam(P.REVERB_DAMP, v),
              color: fxAccent,
              logarithmic: true,
              formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 578,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "Pre-D",
              value: params[P.REVERB_PRE],
              min: 1e-3,
              max: 0.5,
              defaultValue: 0.04,
              onChange: (v) => setParam(P.REVERB_PRE, v),
              color: fxAccent,
              formatValue: (v) => `${(v * 1e3).toFixed(0)}ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 581,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              label: "D/W",
              value: params[P.REVERB_DW],
              min: 0,
              max: 1,
              defaultValue: 0.3,
              onChange: (v) => setParam(P.REVERB_DW, v),
              color: fxAccent
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
              lineNumber: 584,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
          lineNumber: 574,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
        lineNumber: 570,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 497,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
      lineNumber: 496,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/Odin2Controls.tsx",
    lineNumber: 269,
    columnNumber: 5
  }, void 0);
};
export {
  Odin2Controls
};
