import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { W as CustomSelect, aB as Knob } from "./main-BbV5VyEH.js";
import { I as InstrumentOscilloscope } from "./InstrumentOscilloscope-CE7eIp2-.js";
import { W as WOBBLE_BASS_PRESETS } from "./wobbleBass-Bz7KhM6S.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function deepSet(obj, path, value) {
  if (path.length === 1) return { ...obj, [path[0]]: value };
  return { ...obj, [path[0]]: deepSet(obj[path[0]] ?? {}, path.slice(1), value) };
}
const ACCENT = "#8b5cf6";
const PANEL_BG = "#1a1a2e";
const SECTION_BG = "#16162a";
const MODES = ["classic", "reese", "fm", "growl", "hybrid"];
const WAVE_TYPES = ["sawtooth", "square", "triangle", "sine"];
const WAVE_LABELS = { sawtooth: "SAW", square: "SQR", triangle: "TRI", sine: "SIN" };
const FILTER_TYPES = ["lowpass", "bandpass", "highpass"];
const FILTER_LABELS = { lowpass: "LP", bandpass: "BP", highpass: "HP" };
const ROLLOFFS = [-12, -24, -48];
const MODE_PRESETS = Object.fromEntries(
  ["classic", "reese", "fm", "growl", "hybrid"].map((mode) => {
    const preset = WOBBLE_BASS_PRESETS.find((p) => p.config.mode === mode);
    return [mode, (preset == null ? void 0 : preset.config) ?? {}];
  })
);
const LFO_SHAPES = ["sine", "triangle", "saw", "square", "sample_hold"];
const LFO_SHAPE_LABELS = { sine: "SIN", triangle: "TRI", saw: "SAW", square: "SQR", sample_hold: "S&H" };
const DIST_TYPES = ["soft", "hard", "fuzz", "bitcrush"];
const SYNC_VALUES = ["free", "1/1", "1/2", "1/2T", "1/4", "1/4T", "1/8", "1/8T", "1/16", "1/16T", "1/32"];
const VOWELS = ["A", "E", "I", "O", "U"];
const Toggle = ({ on, onToggle, label }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    onClick: onToggle,
    className: "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide select-none",
    style: { color: on ? ACCENT : "#555" },
    children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "span",
        {
          className: "w-3 h-3 rounded-sm border flex items-center justify-center text-[8px]",
          style: { borderColor: on ? ACCENT : "#444", background: on ? ACCENT : "transparent", color: on ? "#fff" : "#444" },
          children: on ? "✓" : ""
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 54,
          columnNumber: 5
        },
        void 0
      ),
      label
    ]
  },
  void 0,
  true,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
    lineNumber: 49,
    columnNumber: 3
  },
  void 0
);
const BtnGroup = ({ items, labels, value, onSelect }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-px rounded overflow-hidden", children: items.map((it) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    onClick: () => onSelect(it),
    className: "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide select-none transition-colors",
    style: { background: value === it ? ACCENT : "#2a2a40", color: value === it ? "#fff" : "#888" },
    children: (labels == null ? void 0 : labels[it]) ?? it
  },
  it,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
    lineNumber: 65,
    columnNumber: 7
  },
  void 0
)) }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
  lineNumber: 63,
  columnNumber: 3
}, void 0);
const Section = ({ label, controls, children, className }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg p-2.5 ${className ?? ""}`, style: { background: SECTION_BG }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label, color: "#a1a1aa" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
    lineNumber: 76,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-start gap-2", children }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
    lineNumber: 77,
    columnNumber: 5
  }, void 0),
  controls && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-2 mt-2", children: controls }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
    lineNumber: 78,
    columnNumber: 18
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
  lineNumber: 75,
  columnNumber: 3
}, void 0);
const KnobWrap = ({ label, value, min, max, onChange, step, fmt, bipolar, color, size }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  Knob,
  {
    value,
    min,
    max,
    onChange,
    label,
    size: size ?? "md",
    color: color ?? ACCENT,
    step,
    formatValue: fmt,
    bipolar
  },
  void 0,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
    lineNumber: 85,
    columnNumber: 3
  },
  void 0
);
const WobbleBassControls = ({ config, instrumentId, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const set = reactExports.useCallback((path, value) => {
    onChange(deepSet(configRef.current, path, value));
  }, [onChange]);
  const handleModeChange = reactExports.useCallback((mode) => {
    const preset = MODE_PRESETS[mode];
    if (preset) {
      onChange({ ...configRef.current, ...preset, mode });
    } else {
      onChange({ ...configRef.current, mode });
    }
  }, [onChange]);
  const pct = (v) => `${Math.round(v)}%`;
  const hz = (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}Hz`;
  const fmtMs = (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}s` : `${Math.round(v)}ms`;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 p-3 rounded-xl select-none", style: { background: PANEL_BG, fontFamily: "system-ui" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[11px] font-bold uppercase tracking-widest text-zinc-500", children: "Mode" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 118,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BtnGroup, { items: MODES, value: config.mode, onSelect: (v) => handleModeChange(v) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 119,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
      lineNumber: 117,
      columnNumber: 7
    }, void 0),
    instrumentId != null && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { background: SECTION_BG, borderRadius: 8, padding: "4px 6px" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      InstrumentOscilloscope,
      {
        instrumentId,
        width: "auto",
        height: 48,
        color: ACCENT,
        backgroundColor: SECTION_BG,
        lineWidth: 1.5
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 125,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
      lineNumber: 124,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "OSC 1", className: "flex-1 min-w-[200px]", controls: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BtnGroup, { items: WAVE_TYPES, labels: WAVE_LABELS, value: config.osc1.type, onSelect: (v) => set(["osc1", "type"], v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 139,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          BtnGroup,
          {
            items: ["-2", "-1", "0", "+1", "+2"],
            value: String(config.osc1.octave > 0 ? `+${config.osc1.octave}` : config.osc1.octave),
            onSelect: (v) => set(["osc1", "octave"], parseInt(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
            lineNumber: 140,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 138,
        columnNumber: 75
      }, void 0), children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Detune", value: config.osc1.detune, min: -100, max: 100, onChange: (v) => set(["osc1", "detune"], v), step: 1, fmt: (v) => `${Math.round(v)}c`, bipolar: true }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 143,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Level", value: config.osc1.level, min: 0, max: 100, onChange: (v) => set(["osc1", "level"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 144,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 138,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "OSC 2", className: "flex-1 min-w-[200px]", controls: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BtnGroup, { items: WAVE_TYPES, labels: WAVE_LABELS, value: config.osc2.type, onSelect: (v) => set(["osc2", "type"], v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 148,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          BtnGroup,
          {
            items: ["-2", "-1", "0", "+1", "+2"],
            value: String(config.osc2.octave > 0 ? `+${config.osc2.octave}` : config.osc2.octave),
            onSelect: (v) => set(["osc2", "octave"], parseInt(v))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
            lineNumber: 149,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 147,
        columnNumber: 75
      }, void 0), children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Detune", value: config.osc2.detune, min: -100, max: 100, onChange: (v) => set(["osc2", "detune"], v), step: 1, fmt: (v) => `${Math.round(v)}c`, bipolar: true }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 152,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Level", value: config.osc2.level, min: 0, max: 100, onChange: (v) => set(["osc2", "level"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 153,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 147,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "SUB", className: "min-w-[120px]", controls: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { on: config.sub.enabled, onToggle: () => set(["sub", "enabled"], !configRef.current.sub.enabled), label: "On" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 157,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BtnGroup, { items: ["-2", "-1", "0"], value: String(config.sub.octave), onSelect: (v) => set(["sub", "octave"], parseInt(v)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 158,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 156,
        columnNumber: 66
      }, void 0), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Level", value: config.sub.level, min: 0, max: 100, onChange: (v) => set(["sub", "level"], v), fmt: pct }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 160,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 156,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "FM", className: "min-w-[160px]", controls: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { on: config.fm.enabled, onToggle: () => set(["fm", "enabled"], !configRef.current.fm.enabled), label: "On" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 164,
        columnNumber: 11
      }, void 0), children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Amount", value: config.fm.amount, min: 0, max: 100, onChange: (v) => set(["fm", "amount"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 166,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Ratio", value: config.fm.ratio, min: 0.5, max: 16, onChange: (v) => set(["fm", "ratio"], v), step: 0.5, fmt: (v) => v.toFixed(1) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 167,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Env", value: config.fm.envelope, min: 0, max: 100, onChange: (v) => set(["fm", "envelope"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 168,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 163,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "UNISON", className: "min-w-[160px]", controls: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BtnGroup, { items: ["1", "2", "4", "8", "16"], value: String(config.unison.voices), onSelect: (v) => set(["unison", "voices"], parseInt(v)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 172,
        columnNumber: 11
      }, void 0), children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Detune", value: config.unison.detune, min: 0, max: 100, onChange: (v) => set(["unison", "detune"], v), step: 1, fmt: (v) => `${Math.round(v)}c` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 174,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Spread", value: config.unison.stereoSpread, min: 0, max: 100, onChange: (v) => set(["unison", "stereoSpread"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 175,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 171,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
      lineNumber: 137,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "FILTER", className: "flex-1 min-w-[280px]", controls: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BtnGroup, { items: FILTER_TYPES, labels: FILTER_LABELS, value: config.filter.type, onSelect: (v) => set(["filter", "type"], v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 182,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BtnGroup, { items: ROLLOFFS.map(String), value: String(config.filter.rolloff), onSelect: (v) => set(["filter", "rolloff"], parseInt(v)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 183,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 181,
        columnNumber: 76
      }, void 0), children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Cutoff", value: config.filter.cutoff, min: 20, max: 2e4, onChange: (v) => set(["filter", "cutoff"], v), fmt: hz }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 185,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Reso", value: config.filter.resonance, min: 0, max: 100, onChange: (v) => set(["filter", "resonance"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 186,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Drive", value: config.filter.drive, min: 0, max: 100, onChange: (v) => set(["filter", "drive"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 187,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Key Trk", value: config.filter.keyTracking, min: 0, max: 100, onChange: (v) => set(["filter", "keyTracking"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 188,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 181,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "FILTER ENV", className: "min-w-[220px]", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Amount", value: config.filterEnvelope.amount, min: -100, max: 100, onChange: (v) => set(["filterEnvelope", "amount"], v), fmt: pct, bipolar: true }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 192,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Attack", value: config.filterEnvelope.attack, min: 0, max: 2e3, onChange: (v) => set(["filterEnvelope", "attack"], v), fmt: fmtMs }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 193,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Decay", value: config.filterEnvelope.decay, min: 0, max: 2e3, onChange: (v) => set(["filterEnvelope", "decay"], v), fmt: fmtMs }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 194,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Sustain", value: config.filterEnvelope.sustain, min: 0, max: 100, onChange: (v) => set(["filterEnvelope", "sustain"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 195,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Release", value: config.filterEnvelope.release, min: 0, max: 2e3, onChange: (v) => set(["filterEnvelope", "release"], v), fmt: fmtMs }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 196,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 191,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
      lineNumber: 180,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "WOBBLE LFO", className: "flex-1 min-w-[340px]", controls: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { on: config.wobbleLFO.enabled, onToggle: () => set(["wobbleLFO", "enabled"], !configRef.current.wobbleLFO.enabled), label: "On" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 203,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BtnGroup, { items: LFO_SHAPES, labels: LFO_SHAPE_LABELS, value: config.wobbleLFO.shape, onSelect: (v) => set(["wobbleLFO", "shape"], v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 204,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-end gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-zinc-500 uppercase", children: "Sync" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
            lineNumber: 206,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: config.wobbleLFO.sync,
              onChange: (v) => set(["wobbleLFO", "sync"], v),
              className: "text-[10px] rounded px-1 py-0.5 border-none outline-none",
              style: { background: "#2a2a40", color: "var(--color-text-secondary)" },
              options: SYNC_VALUES.map((s) => ({ value: s, label: s }))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
              lineNumber: 207,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 205,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { on: config.wobbleLFO.retrigger, onToggle: () => set(["wobbleLFO", "retrigger"], !configRef.current.wobbleLFO.retrigger), label: "Retrig" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 211,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 202,
        columnNumber: 80
      }, void 0), children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Rate", value: config.wobbleLFO.rate, min: 0.1, max: 30, onChange: (v) => set(["wobbleLFO", "rate"], v), fmt: (v) => `${v.toFixed(1)}Hz` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 213,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Amount", value: config.wobbleLFO.amount, min: 0, max: 100, onChange: (v) => set(["wobbleLFO", "amount"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 214,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Pitch", value: config.wobbleLFO.pitchAmount, min: 0, max: 100, onChange: (v) => set(["wobbleLFO", "pitchAmount"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 215,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "FM Amt", value: config.wobbleLFO.fmAmount, min: 0, max: 100, onChange: (v) => set(["wobbleLFO", "fmAmount"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 216,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Phase", value: config.wobbleLFO.phase, min: 0, max: 360, onChange: (v) => set(["wobbleLFO", "phase"], v), step: 1, fmt: (v) => `${Math.round(v)}°` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 217,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 202,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "AMP ENVELOPE", className: "min-w-[200px]", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Attack", value: config.envelope.attack, min: 0, max: 2e3, onChange: (v) => set(["envelope", "attack"], v), fmt: fmtMs }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 221,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Decay", value: config.envelope.decay, min: 0, max: 2e3, onChange: (v) => set(["envelope", "decay"], v), fmt: fmtMs }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 222,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Sustain", value: config.envelope.sustain, min: 0, max: 100, onChange: (v) => set(["envelope", "sustain"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 223,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Release", value: config.envelope.release, min: 0, max: 4e3, onChange: (v) => set(["envelope", "release"], v), fmt: fmtMs }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 224,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 220,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
      lineNumber: 201,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "DISTORTION", className: "flex-1 min-w-[200px]", controls: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { on: config.distortion.enabled, onToggle: () => set(["distortion", "enabled"], !configRef.current.distortion.enabled), label: "On" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 231,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BtnGroup, { items: DIST_TYPES, value: config.distortion.type, onSelect: (v) => set(["distortion", "type"], v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 232,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 230,
        columnNumber: 80
      }, void 0), children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Drive", value: config.distortion.drive, min: 0, max: 100, onChange: (v) => set(["distortion", "drive"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 234,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Tone", value: config.distortion.tone, min: 0, max: 100, onChange: (v) => set(["distortion", "tone"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 235,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 230,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "FORMANT", className: "flex-1 min-w-[200px]", controls: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toggle, { on: config.formant.enabled, onToggle: () => set(["formant", "enabled"], !configRef.current.formant.enabled), label: "On" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 239,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BtnGroup, { items: VOWELS, value: config.formant.vowel.toUpperCase(), onSelect: (v) => set(["formant", "vowel"], v) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 240,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 238,
        columnNumber: 77
      }, void 0), children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "Morph", value: config.formant.morph, min: 0, max: 100, onChange: (v) => set(["formant", "morph"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 242,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobWrap, { label: "LFO Amt", value: config.formant.lfoAmount, min: 0, max: 100, onChange: (v) => set(["formant", "lfoAmount"], v), fmt: pct }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
          lineNumber: 243,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
        lineNumber: 238,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
      lineNumber: 229,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WobbleBassControls.tsx",
    lineNumber: 115,
    columnNumber: 5
  }, void 0);
};
export {
  WobbleBassControls
};
