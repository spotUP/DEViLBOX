import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
const OPL_WAVEFORMS = ["Sine", "Half-Sine", "Abs-Sine", "Pulse", "Sine×2", "Abs×2", "Square", "DSaw"];
function ADSRBar({ label, a, d, s, r }) {
  const aw = a / 15 * 100;
  const dw = d / 15 * 100;
  const sw = s / 15 * 100;
  const rw = r / 15 * 100;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted text-[10px] font-semibold", children: [
      label,
      " ADSR"
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
      lineNumber: 26,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-px h-5 rounded overflow-hidden bg-dark-bg", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "bg-accent-success/60 flex items-center justify-center text-[8px] text-text-primary",
          style: { width: `${Math.max(aw, 8)}%` },
          title: `Attack: ${a}`,
          children: [
            "A:",
            a
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 28,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "bg-accent-warning/60 flex items-center justify-center text-[8px] text-text-primary",
          style: { width: `${Math.max(dw, 8)}%` },
          title: `Decay: ${d}`,
          children: [
            "D:",
            d
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 30,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "bg-accent-primary/60 flex items-center justify-center text-[8px] text-text-primary",
          style: { width: `${Math.max(sw, 8)}%` },
          title: `Sustain: ${s}`,
          children: [
            "S:",
            s
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 32,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "bg-accent-error/60 flex items-center justify-center text-[8px] text-text-primary",
          style: { width: `${Math.max(rw, 8)}%` },
          title: `Release: ${r}`,
          children: [
            "R:",
            r
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 34,
          columnNumber: 9
        },
        this
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
      lineNumber: 27,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
    lineNumber: 25,
    columnNumber: 5
  }, this);
}
function ParamRow({ label, value, max, unit }) {
  const pct = value / max * 100;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px] w-20 truncate", title: label, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
      lineNumber: 45,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 h-3 bg-dark-bg rounded overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-full bg-accent-primary/50 rounded", style: { width: `${pct}%` } }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
      lineNumber: 47,
      columnNumber: 9
    }, this) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
      lineNumber: 46,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary text-[10px] w-10 text-right", children: [
      value,
      unit || ""
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
      lineNumber: 49,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
    lineNumber: 44,
    columnNumber: 5
  }, this);
}
const OPL3Controls = ({ config }) => {
  const c = config;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4 text-xs", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted text-[10px] bg-dark-bg/50 rounded px-2 py-1 border border-dark-border", children: "OPL3 instrument — audio from AdPlug WASM player. Parameters are read-only." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
      lineNumber: 59,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 items-center", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: "Algorithm:" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 66,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary font-mono text-xs", children: (c.connection ?? 0) === 0 ? "FM (Op1→Op2)" : "Additive (Op1+Op2)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 67,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 65,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: "Feedback:" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 72,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary font-mono text-xs", children: c.feedback ?? 0 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 73,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 71,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
      lineNumber: 64,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-dark-border rounded p-3 space-y-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-accent-warning font-semibold text-[11px] border-b border-dark-border pb-1", children: "Operator 1 — Modulator" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 79,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ADSRBar, { label: "Op1", a: c.op1Attack ?? 0, d: c.op1Decay ?? 0, s: c.op1Sustain ?? 0, r: c.op1Release ?? 0 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 82,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamRow, { label: "Level", value: c.op1Level ?? 0, max: 63 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 83,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamRow, { label: "Multiplier", value: c.op1Multi ?? 0, max: 15, unit: "×" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 84,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: [
          "Wave: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: OPL_WAVEFORMS[c.op1Waveform ?? 0] }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
            lineNumber: 86,
            columnNumber: 63
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 86,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: [
          "KSL: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: c.op1KSL ?? 0 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
            lineNumber: 87,
            columnNumber: 62
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 87,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 85,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3", children: [
        (c.op1Tremolo ?? 0) > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-success text-[10px]", children: "Tremolo" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 90,
          columnNumber: 39
        }, void 0),
        (c.op1Vibrato ?? 0) > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary text-[10px]", children: "Vibrato" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 91,
          columnNumber: 39
        }, void 0),
        (c.op1SustainHold ?? 0) > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-warning text-[10px]", children: "Sustain Hold" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 92,
          columnNumber: 43
        }, void 0),
        (c.op1KSR ?? 0) > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: "KSR" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 93,
          columnNumber: 35
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 89,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
      lineNumber: 78,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-dark-border rounded p-3 space-y-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-accent-success font-semibold text-[11px] border-b border-dark-border pb-1", children: "Operator 2 — Carrier" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 99,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ADSRBar, { label: "Op2", a: c.op2Attack ?? 0, d: c.op2Decay ?? 0, s: c.op2Sustain ?? 0, r: c.op2Release ?? 0 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 102,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamRow, { label: "Level", value: c.op2Level ?? 0, max: 63 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 103,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParamRow, { label: "Multiplier", value: c.op2Multi ?? 0, max: 15, unit: "×" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 104,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: [
          "Wave: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: OPL_WAVEFORMS[c.op2Waveform ?? 0] }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
            lineNumber: 106,
            columnNumber: 63
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 106,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: [
          "KSL: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: c.op2KSL ?? 0 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
            lineNumber: 107,
            columnNumber: 62
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 107,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 105,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3", children: [
        (c.op2Tremolo ?? 0) > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-success text-[10px]", children: "Tremolo" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 110,
          columnNumber: 39
        }, void 0),
        (c.op2Vibrato ?? 0) > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary text-[10px]", children: "Vibrato" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 111,
          columnNumber: 39
        }, void 0),
        (c.op2SustainHold ?? 0) > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-warning text-[10px]", children: "Sustain Hold" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 112,
          columnNumber: 43
        }, void 0),
        (c.op2KSR ?? 0) > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: "KSR" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
          lineNumber: 113,
          columnNumber: 35
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
        lineNumber: 109,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
      lineNumber: 98,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OPL3Controls.tsx",
    lineNumber: 57,
    columnNumber: 5
  }, void 0);
};
export {
  OPL3Controls
};
