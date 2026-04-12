import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cw as DEFAULT_FLUIDSYNTH, W as CustomSelect, aB as Knob } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const GM_PROGRAMS = [
  { value: 0, label: "Acoustic Grand Piano" },
  { value: 1, label: "Bright Acoustic Piano" },
  { value: 2, label: "Electric Grand Piano" },
  { value: 3, label: "Honky-tonk Piano" },
  { value: 4, label: "Electric Piano 1" },
  { value: 5, label: "Electric Piano 2" },
  { value: 6, label: "Harpsichord" },
  { value: 7, label: "Clavinet" },
  { value: 16, label: "Drawbar Organ" },
  { value: 19, label: "Church Organ" },
  { value: 24, label: "Acoustic Guitar (nylon)" },
  { value: 25, label: "Acoustic Guitar (steel)" },
  { value: 32, label: "Acoustic Bass" },
  { value: 33, label: "Electric Bass (finger)" },
  { value: 40, label: "Violin" },
  { value: 42, label: "Cello" },
  { value: 48, label: "String Ensemble 1" },
  { value: 52, label: "Choir Aahs" },
  { value: 56, label: "Trumpet" },
  { value: 60, label: "French Horn" },
  { value: 64, label: "Soprano Sax" },
  { value: 65, label: "Alto Sax" },
  { value: 73, label: "Flute" },
  { value: 80, label: "Synth Lead (square)" },
  { value: 88, label: "Synth Pad (new age)" }
];
const FluidSynthControls = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const merged = { ...DEFAULT_FLUIDSYNTH, ...config };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto text-xs", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Program" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
        lineNumber: 64,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Instrument" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 67,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              className: "bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-2 py-1 text-xs w-52",
              value: String(merged.program),
              onChange: (v) => updateParam("program", parseInt(v, 10)),
              options: GM_PROGRAMS.map(({ value, label }) => ({ value: String(value), label: `${value}: ${label}` }))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
              lineNumber: 68,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
          lineNumber: 66,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Bank",
            value: merged.bank,
            min: 0,
            max: 128,
            defaultValue: 0,
            onChange: (v) => updateParam("bank", Math.round(v)),
            color: "#38bdf8"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 75,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
        lineNumber: 65,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
      lineNumber: 63,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Reverb" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
        lineNumber: 82,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Room",
            value: merged.reverbRoomSize,
            min: 0,
            max: 1.2,
            defaultValue: 0.2,
            onChange: (v) => updateParam("reverbRoomSize", v),
            color: "#38bdf8"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 84,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Damp",
            value: merged.reverbDamping,
            min: 0,
            max: 1,
            defaultValue: 0,
            onChange: (v) => updateParam("reverbDamping", v),
            color: "#38bdf8"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 86,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Width",
            value: merged.reverbWidth,
            min: 0,
            max: 100,
            defaultValue: 0.5,
            onChange: (v) => updateParam("reverbWidth", v),
            color: "#38bdf8"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 88,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Level",
            value: merged.reverbLevel,
            min: 0,
            max: 1,
            defaultValue: 0.9,
            onChange: (v) => updateParam("reverbLevel", v),
            color: "#38bdf8"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 90,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
        lineNumber: 83,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
      lineNumber: 81,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Chorus" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
        lineNumber: 97,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Voices",
            value: merged.chorusVoices,
            min: 0,
            max: 99,
            defaultValue: 3,
            onChange: (v) => updateParam("chorusVoices", Math.round(v)),
            color: "#38bdf8"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 99,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Level",
            value: merged.chorusLevel,
            min: 0,
            max: 10,
            defaultValue: 2,
            onChange: (v) => updateParam("chorusLevel", v),
            color: "#38bdf8"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 101,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Speed",
            value: merged.chorusSpeed,
            min: 0.1,
            max: 5,
            defaultValue: 0.3,
            onChange: (v) => updateParam("chorusSpeed", v),
            color: "#38bdf8",
            unit: "Hz"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 103,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Depth",
            value: merged.chorusDepth,
            min: 0,
            max: 21,
            defaultValue: 8,
            onChange: (v) => updateParam("chorusDepth", v),
            color: "#38bdf8"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 105,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Type" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 108,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: ["Sine", "Triangle"].map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateParam("chorusType", i),
              className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${Math.round(merged.chorusType) === i ? "bg-sky-500 text-white" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
              children: label
            },
            label,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
              lineNumber: 111,
              columnNumber: 17
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 109,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
          lineNumber: 107,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
        lineNumber: 98,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
      lineNumber: 96,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Master" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
        lineNumber: 130,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Gain",
            value: merged.gain,
            min: 0,
            max: 10,
            defaultValue: 0.4,
            onChange: (v) => updateParam("gain", v),
            color: "#38bdf8"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 132,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Polyphony",
            value: merged.polyphony,
            min: 1,
            max: 256,
            defaultValue: 64,
            onChange: (v) => updateParam("polyphony", Math.round(v)),
            color: "#38bdf8"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 134,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Tuning",
            value: merged.tuning,
            min: 430,
            max: 450,
            defaultValue: 440,
            onChange: (v) => updateParam("tuning", v),
            color: "#38bdf8",
            unit: "Hz"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 136,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Transpose",
            value: merged.transpose,
            min: -24,
            max: 24,
            defaultValue: 0,
            onChange: (v) => updateParam("transpose", Math.round(v)),
            color: "#38bdf8",
            unit: "st"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
            lineNumber: 138,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
        lineNumber: 131,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
      lineNumber: 129,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/FluidSynthControls.tsx",
    lineNumber: 61,
    columnNumber: 5
  }, void 0);
};
export {
  FluidSynthControls,
  FluidSynthControls as default
};
