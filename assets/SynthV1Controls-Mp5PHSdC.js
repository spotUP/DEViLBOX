import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cq as DEFAULT_SYNTHV1, aB as Knob, cr as DCO_SHAPE_NAMES, W as CustomSelect, cs as DCF_TYPE_NAMES, ct as LFO_SHAPE_NAMES } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SelectControl } from "./SelectControl-BYIQjTvW.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const OCTAVE_OPTIONS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const pk = (section, field, page) => `${section}${page}${field}`;
const SectionHeader = ({ title }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-muted font-semibold mb-2 border-b border-dark-border pb-1 text-xs uppercase tracking-wider", children: title }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
  lineNumber: 35,
  columnNumber: 3
}, void 0);
const ADSRRow = ({ a, d, s, r, onA, onD, onS, onR, color = "#ef4444" }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: a, min: 0, max: 1, onChange: onA, label: "Attack", color }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
    lineNumber: 49,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: d, min: 0, max: 1, onChange: onD, label: "Decay", color }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
    lineNumber: 50,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: s, min: 0, max: 1, onChange: onS, label: "Sustain", color }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
    lineNumber: 51,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: r, min: 0, max: 1, onChange: onR, label: "Release", color }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
    lineNumber: 52,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
  lineNumber: 48,
  columnNumber: 3
}, void 0);
const SynthV1Controls = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = reactExports.useState("synth1");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const update = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const merged = { ...DEFAULT_SYNTHV1, ...config };
  const dcoK = (name, p) => `dco${p}${name}`;
  const dcfK = (name, p) => `dcf${p}${name}`;
  const dcaK = (name, p) => `dca${p}${name}`;
  const lfoK = (name, p) => `lfo${p}${name}`;
  const renderSynthPage = (page) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded bg-[#1a2a1a]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: `DCO ${page} — Oscillators` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 77,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-4 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px] font-semibold", children: "Osc A" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 81,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: merged[dcoK("Width1", page)],
              min: 0,
              max: 1,
              onChange: (v) => update(dcoK("Width1", page), v),
              label: "Width",
              color: "#22c55e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
              lineNumber: 82,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            SelectControl,
            {
              label: "Shape",
              value: merged[dcoK("Shape1", page)],
              options: DCO_SHAPE_NAMES,
              onChange: (v) => update(dcoK("Shape1", page), v)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
              lineNumber: 85,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
          lineNumber: 80,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px] font-semibold", children: "Osc B" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 92,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: merged[dcoK("Width2", page)],
              min: 0,
              max: 1,
              onChange: (v) => update(dcoK("Width2", page), v),
              label: "Width",
              color: "#22c55e"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
              lineNumber: 93,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            SelectControl,
            {
              label: "Shape",
              value: merged[dcoK("Shape2", page)],
              options: DCO_SHAPE_NAMES,
              onChange: (v) => update(dcoK("Shape2", page), v)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
              lineNumber: 96,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
          lineNumber: 91,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 78,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcoK("Tuning", page)],
            min: -1,
            max: 1,
            onChange: (v) => update(dcoK("Tuning", page), v),
            label: "Tune",
            color: "#eab308",
            bipolar: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 103,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcoK("Glide", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(dcoK("Glide", page), v),
            label: "Glide",
            color: "#3b82f6"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 106,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcoK("Detune", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(dcoK("Detune", page), v),
            label: "Detune",
            color: "#eab308"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 109,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Octave" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 113,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              className: "bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]",
              value: String(Math.round(merged[dcoK("Octave", page)])),
              onChange: (v) => update(dcoK("Octave", page), parseInt(v)),
              options: OCTAVE_OPTIONS.map((o) => ({ value: String(o), label: o > 0 ? `+${o}` : String(o) }))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
              lineNumber: 114,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
          lineNumber: 112,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 102,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcoK("Balance", page)],
            min: -1,
            max: 1,
            onChange: (v) => update(dcoK("Balance", page), v),
            label: "Balance",
            color: "#a855f7",
            bipolar: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 123,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcoK("RingMod", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(dcoK("RingMod", page), v),
            label: "Ring Mod",
            color: "#f97316"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 126,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcoK("Phase", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(dcoK("Phase", page), v),
            label: "Phase",
            color: "#6366f1"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 129,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcoK("Panning", page)],
            min: -1,
            max: 1,
            onChange: (v) => update(dcoK("Panning", page), v),
            label: "Pan",
            color: "#14b8a6",
            bipolar: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 132,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 122,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Sync" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
          lineNumber: 138,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            className: `px-2 py-0.5 rounded text-[10px] ${merged[dcoK("Sync", page)] > 0.5 ? "bg-green-700 text-white" : "bg-gray-700 text-text-muted"}`,
            onClick: () => update(dcoK("Sync", page), merged[dcoK("Sync", page)] > 0.5 ? 0 : 1),
            children: merged[dcoK("Sync", page)] > 0.5 ? "ON" : "OFF"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 139,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 137,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 136,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 76,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded bg-[#1a1a2a]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: `DCF ${page} — Filter` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 149,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcfK("Cutoff", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(dcfK("Cutoff", page), v),
            label: "Cutoff",
            color: "#a855f7"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 151,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcfK("Reso", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(dcfK("Reso", page), v),
            label: "Reso",
            color: "#a855f7"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 154,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcfK("Envelope", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(dcfK("Envelope", page), v),
            label: "Env Amt",
            color: "#a855f7"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 157,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcfK("KeyFollow", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(dcfK("KeyFollow", page), v),
            label: "Key Follow",
            color: "#a855f7"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 160,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 150,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SelectControl,
          {
            label: "Type",
            value: merged[dcfK("Type", page)],
            options: DCF_TYPE_NAMES,
            onChange: (v) => update(dcfK("Type", page), v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 165,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Slope" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 170,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              className: "bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]",
              value: String(Math.round(merged[dcfK("Slope", page)])),
              onChange: (v) => update(dcfK("Slope", page), parseInt(v)),
              options: [
                { value: "0", label: "12 dB" },
                { value: "1", label: "24 dB" }
              ]
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
              lineNumber: 171,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
          lineNumber: 169,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 164,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        ADSRRow,
        {
          a: merged[dcfK("Attack", page)],
          d: merged[dcfK("Decay", page)],
          s: merged[dcfK("Sustain", page)],
          r: merged[dcfK("Release", page)],
          onA: (v) => update(dcfK("Attack", page), v),
          onD: (v) => update(dcfK("Decay", page), v),
          onS: (v) => update(dcfK("Sustain", page), v),
          onR: (v) => update(dcfK("Release", page), v),
          color: "#a855f7"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
          lineNumber: 182,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 148,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded bg-[#2a1a1a]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: `DCA ${page} — Amplifier` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 193,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[dcaK("Volume", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(dcaK("Volume", page), v),
            label: "Volume",
            color: "#ef4444"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 195,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[pk("dco", "Velocity", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(pk("dco", "Velocity", page), v),
            label: "DCO Vel",
            color: "#ef4444"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 198,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[pk("dca", "Velocity", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(pk("dca", "Velocity", page), v),
            label: "DCA Vel",
            color: "#ef4444"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 201,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 194,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        ADSRRow,
        {
          a: merged[dcaK("Attack", page)],
          d: merged[dcaK("Decay", page)],
          s: merged[dcaK("Sustain", page)],
          r: merged[dcaK("Release", page)],
          onA: (v) => update(dcaK("Attack", page), v),
          onD: (v) => update(dcaK("Decay", page), v),
          onS: (v) => update(dcaK("Sustain", page), v),
          onR: (v) => update(dcaK("Release", page), v),
          color: "#ef4444"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
          lineNumber: 205,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 192,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded bg-[#1a1a1a]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: `LFO ${page}` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 216,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[lfoK("Bpm", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(lfoK("Bpm", page), v),
            label: "Rate",
            color: "#f59e0b"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 218,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[lfoK("Width", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(lfoK("Width", page), v),
            label: "Width",
            color: "#f59e0b"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 221,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SelectControl,
          {
            label: "Shape",
            value: merged[lfoK("Shape", page)],
            options: LFO_SHAPE_NAMES,
            onChange: (v) => update(lfoK("Shape", page), v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 224,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 217,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-5 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[lfoK("Pitch", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(lfoK("Pitch", page), v),
            label: "Pitch",
            color: "#f59e0b"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 230,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[lfoK("Cutoff", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(lfoK("Cutoff", page), v),
            label: "Cutoff",
            color: "#f59e0b"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 233,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[lfoK("Reso", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(lfoK("Reso", page), v),
            label: "Reso",
            color: "#f59e0b"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 236,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[lfoK("Panning", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(lfoK("Panning", page), v),
            label: "Pan",
            color: "#f59e0b"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 239,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged[lfoK("Volume", page)],
            min: 0,
            max: 1,
            onChange: (v) => update(lfoK("Volume", page), v),
            label: "Volume",
            color: "#f59e0b"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 242,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 229,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mt-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Sync" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
          lineNumber: 247,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            className: `px-2 py-0.5 rounded text-[10px] ${merged[lfoK("Sync", page)] > 0.5 ? "bg-green-700 text-white" : "bg-gray-700 text-text-muted"}`,
            onClick: () => update(lfoK("Sync", page), merged[lfoK("Sync", page)] > 0.5 ? 0 : 1),
            children: merged[lfoK("Sync", page)] > 0.5 ? "ON" : "OFF"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 248,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 246,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 215,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 gap-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: merged[pk("dcf", "Velocity", page)],
        min: 0,
        max: 1,
        onChange: (v) => update(pk("dcf", "Velocity", page), v),
        label: "DCF Velocity",
        color: "#64748b"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 258,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 257,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 256,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
    lineNumber: 74,
    columnNumber: 5
  }, void 0);
  const renderEffects = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded bg-[#1a1a2a]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: "Chorus" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 270,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-5 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.chorusWet,
            min: 0,
            max: 1,
            onChange: (v) => update("chorusWet", v),
            label: "Wet",
            color: "#06b6d4"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 272,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.chorusDelay,
            min: 0,
            max: 1,
            onChange: (v) => update("chorusDelay", v),
            label: "Delay",
            color: "#06b6d4"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 274,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.chorusFeedback,
            min: -1,
            max: 1,
            onChange: (v) => update("chorusFeedback", v),
            label: "Feedback",
            color: "#06b6d4",
            bipolar: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 276,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.chorusRate,
            min: 0,
            max: 1,
            onChange: (v) => update("chorusRate", v),
            label: "Rate",
            color: "#06b6d4"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 278,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.chorusMod,
            min: 0,
            max: 1,
            onChange: (v) => update("chorusMod", v),
            label: "Mod",
            color: "#06b6d4"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 280,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 271,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 269,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded bg-[#1a2a1a]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: "Flanger" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 287,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.flangerWet,
            min: 0,
            max: 1,
            onChange: (v) => update("flangerWet", v),
            label: "Wet",
            color: "#22c55e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 289,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.flangerDelay,
            min: 0,
            max: 1,
            onChange: (v) => update("flangerDelay", v),
            label: "Delay",
            color: "#22c55e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 291,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.flangerFeedback,
            min: -1,
            max: 1,
            onChange: (v) => update("flangerFeedback", v),
            label: "Feedback",
            color: "#22c55e",
            bipolar: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 293,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.flangerDaft,
            min: 0,
            max: 1,
            onChange: (v) => update("flangerDaft", v),
            label: "Daft",
            color: "#22c55e"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 295,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 288,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 286,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded bg-[#2a1a2a]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: "Phaser" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 302,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-5 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.phaserWet,
            min: 0,
            max: 1,
            onChange: (v) => update("phaserWet", v),
            label: "Wet",
            color: "#d946ef"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 304,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.phaserRate,
            min: 0,
            max: 1,
            onChange: (v) => update("phaserRate", v),
            label: "Rate",
            color: "#d946ef"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 306,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.phaserFeedback,
            min: -1,
            max: 1,
            onChange: (v) => update("phaserFeedback", v),
            label: "Feedback",
            color: "#d946ef",
            bipolar: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 308,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.phaserDepth,
            min: 0,
            max: 1,
            onChange: (v) => update("phaserDepth", v),
            label: "Depth",
            color: "#d946ef"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 310,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.phaserDaft,
            min: 0,
            max: 1,
            onChange: (v) => update("phaserDaft", v),
            label: "Daft",
            color: "#d946ef"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 312,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 303,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 301,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded bg-[#1a1a1a]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: "Delay" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 319,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.delayWet,
            min: 0,
            max: 1,
            onChange: (v) => update("delayWet", v),
            label: "Wet",
            color: "#f59e0b"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 321,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.delayDelay,
            min: 0,
            max: 1,
            onChange: (v) => update("delayDelay", v),
            label: "Time",
            color: "#f59e0b"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 323,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.delayFeedback,
            min: -1,
            max: 1,
            onChange: (v) => update("delayFeedback", v),
            label: "Feedback",
            color: "#f59e0b",
            bipolar: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 325,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.delayBpm,
            min: 0,
            max: 1,
            onChange: (v) => update("delayBpm", v),
            label: "BPM Sync",
            color: "#f59e0b"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 327,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 320,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 318,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 rounded bg-[#2a1a1a]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { title: "Reverb" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 334,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.reverbWet,
            min: 0,
            max: 1,
            onChange: (v) => update("reverbWet", v),
            label: "Wet",
            color: "#ef4444"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 336,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: merged.reverbRoom,
            min: 0,
            max: 1,
            onChange: (v) => update("reverbRoom", v),
            label: "Room",
            color: "#ef4444"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
            lineNumber: 338,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 335,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 333,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
    lineNumber: 267,
    columnNumber: 5
  }, void 0);
  const TABS = [
    { id: "synth1", label: "Synth 1" },
    { id: "synth2", label: "Synth 2" },
    { id: "effects", label: "Effects" }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full text-xs", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b border-dark-border bg-dark-bg", children: TABS.map((tab) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(tab.id),
        className: `
              flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors
              ${activeTab === tab.id ? "bg-[#252525] text-cyan-400 border-b-2 border-cyan-400" : "text-text-muted hover:text-text-secondary"}
            `,
        children: tab.label
      },
      tab.id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
        lineNumber: 356,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 354,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow flex-1 overflow-y-auto", children: activeTab === "synth1" ? renderSynthPage(1) : activeTab === "synth2" ? renderSynthPage(2) : renderEffects() }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
      lineNumber: 373,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SynthV1Controls.tsx",
    lineNumber: 352,
    columnNumber: 5
  }, void 0);
};
export {
  SynthV1Controls,
  SynthV1Controls as default
};
