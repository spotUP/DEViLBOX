import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cm as DEFAULT_RAFFO, cn as RAFFO_PARAM_NAMES, W as CustomSelect } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const WAVEFORM_NAMES = ["Saw", "Triangle", "Square", "Pulse", "Off"];
const RANGE_NAMES = { 1: "32'", 2: "16'", 3: "8'", 4: "4'", 5: "2'", 6: "1'" };
const CONFIG_KEYS = [
  "volume",
  "wave0",
  "wave1",
  "wave2",
  "wave3",
  "range0",
  "range1",
  "range2",
  "range3",
  "vol0",
  "vol1",
  "vol2",
  "vol3",
  "attack",
  "decay",
  "sustain",
  "release",
  "filterCutoff",
  "filterAttack",
  "filterDecay",
  "filterSustain",
  "glide",
  "oscButton0",
  "oscButton1",
  "oscButton2",
  "oscButton3",
  "filterResonance",
  "tuning0",
  "tuning1",
  "tuning2",
  "tuning3",
  "filterRelease"
];
const OscGroup = ({ idx, merged, update }) => {
  const waveKey = `wave${idx}`;
  const rangeKey = `range${idx}`;
  const volKey = `vol${idx}`;
  const btnKey = `oscButton${idx}`;
  const tuneKey = `tuning${idx}`;
  const isOn = (merged[btnKey] ?? 1) > 0;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded ${isOn ? "bg-[#1a2a1a]" : "bg-[#1a1a1a] opacity-50"}`, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          className: `px-2 py-0.5 rounded text-[10px] ${isOn ? "bg-green-700 text-white" : "bg-gray-700 text-text-muted"}`,
          onClick: () => update(btnKey, isOn ? 0 : 1),
          children: isOn ? "ON" : "OFF"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 45,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted font-semibold", children: [
        "OSC ",
        idx + 1
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 49,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
      lineNumber: 44,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Waveform" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 53,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            className: "bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]",
            value: String(Math.round(merged[waveKey] ?? 0)),
            onChange: (v) => update(waveKey, parseInt(v)),
            options: WAVEFORM_NAMES.map((n, i) => ({ value: String(i), label: n }))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
            lineNumber: 54,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 52,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Range" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 62,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            className: "bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]",
            value: String(Math.round(merged[rangeKey] ?? 2)),
            onChange: (v) => update(rangeKey, parseInt(v)),
            options: [1, 2, 3, 4, 5, 6].map((r) => ({ value: String(r), label: RANGE_NAMES[r] }))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
            lineNumber: 63,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 61,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Volume" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 71,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "range",
            min: 0,
            max: 10,
            step: 0.1,
            value: merged[volKey] ?? 5,
            onChange: (e) => update(volKey, parseFloat(e.target.value)),
            className: "w-full accent-green-500 h-2"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
            lineNumber: 72,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 70,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
      lineNumber: 51,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Tuning" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 78,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "range",
          min: -12,
          max: 12,
          step: 0.01,
          value: merged[tuneKey] ?? 0,
          onChange: (e) => update(tuneKey, parseFloat(e.target.value)),
          className: "w-full accent-yellow-500 h-2"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 79,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: [
        (merged[tuneKey] ?? 0).toFixed(2),
        " semi"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 82,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
      lineNumber: 77,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
    lineNumber: 43,
    columnNumber: 5
  }, void 0);
};
const RaffoSynthControls = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const merged = { ...DEFAULT_RAFFO, ...config };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4 text-xs", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-muted font-semibold mb-2 border-b border-dark-border pb-1", children: "Oscillators" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 102,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2", children: [0, 1, 2, 3].map((i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OscGroup, { idx: i, merged, update: updateParam }, i, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 104,
        columnNumber: 34
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 103,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
      lineNumber: 101,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-muted font-semibold mb-2 border-b border-dark-border pb-1", children: "Master" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 110,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Volume" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
            lineNumber: 113,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: 0,
              max: 10,
              step: 0.1,
              value: merged.volume ?? 7,
              onChange: (e) => updateParam("volume", parseFloat(e.target.value)),
              className: "w-full accent-green-500 h-2"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
              lineNumber: 114,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 112,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Glide" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
            lineNumber: 119,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: 0,
              max: 10,
              step: 0.1,
              value: merged.glide ?? 1,
              onChange: (e) => updateParam("glide", parseFloat(e.target.value)),
              className: "w-full accent-blue-500 h-2"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
              lineNumber: 120,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 118,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 111,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
      lineNumber: 109,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-muted font-semibold mb-2 border-b border-dark-border pb-1", children: "Amp Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 129,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2", children: ["attack", "decay", "sustain", "release"].map((k) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: RAFFO_PARAM_NAMES[CONFIG_KEYS.indexOf(k)] }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 133,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "range",
            min: k === "sustain" || k === "release" ? 0 : 0,
            max: k === "sustain" || k === "release" ? 1 : 1e3,
            step: k === "sustain" || k === "release" ? 0.01 : 1,
            value: merged[k] ?? 0,
            onChange: (e) => updateParam(k, parseFloat(e.target.value)),
            className: "w-full accent-red-500 h-2"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
            lineNumber: 134,
            columnNumber: 15
          },
          void 0
        )
      ] }, k, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 132,
        columnNumber: 13
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 130,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
      lineNumber: 128,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-muted font-semibold mb-2 border-b border-dark-border pb-1", children: "Filter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 145,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Cutoff" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
            lineNumber: 148,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: 500,
              max: 1e4,
              step: 10,
              value: merged.filterCutoff ?? 3e3,
              onChange: (e) => updateParam("filterCutoff", parseFloat(e.target.value)),
              className: "w-full accent-purple-500 h-2"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
              lineNumber: 149,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: [
            Math.round(merged.filterCutoff ?? 3e3),
            " Hz"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
            lineNumber: 152,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 147,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Resonance" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
            lineNumber: 155,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: 0,
              max: 10,
              step: 0.1,
              value: merged.filterResonance ?? 3,
              onChange: (e) => updateParam("filterResonance", parseFloat(e.target.value)),
              className: "w-full accent-purple-500 h-2"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
              lineNumber: 156,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 154,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: "Filter Release" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
            lineNumber: 161,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: 0,
              max: 1,
              step: 0.01,
              value: merged.filterRelease ?? 0.5,
              onChange: (e) => updateParam("filterRelease", parseFloat(e.target.value)),
              className: "w-full accent-purple-500 h-2"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
              lineNumber: 162,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 160,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 146,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 mt-2", children: ["filterAttack", "filterDecay", "filterSustain"].map((k) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: RAFFO_PARAM_NAMES[CONFIG_KEYS.indexOf(k)] }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
          lineNumber: 170,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "range",
            min: k === "filterSustain" ? 0 : 0,
            max: k === "filterSustain" ? 1 : 1e3,
            step: k === "filterSustain" ? 0.01 : 1,
            value: merged[k] ?? 0,
            onChange: (e) => updateParam(k, parseFloat(e.target.value)),
            className: "w-full accent-purple-500 h-2"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
            lineNumber: 171,
            columnNumber: 15
          },
          void 0
        )
      ] }, k, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 169,
        columnNumber: 13
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
        lineNumber: 167,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
      lineNumber: 144,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RaffoSynthControls.tsx",
    lineNumber: 99,
    columnNumber: 5
  }, void 0);
};
export {
  RaffoSynthControls
};
