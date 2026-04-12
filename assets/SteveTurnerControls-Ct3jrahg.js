const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { am as __vitePreload, aB as Knob } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
const PARAM_IDS = {
  priority: 0,
  sampleIdx: 1,
  initDelay: 2,
  env1Duration: 3,
  env1Delta: 4,
  env2Duration: 5,
  env2Delta: 6,
  pitchShift: 7,
  oscCount: 8,
  oscDelta: 9,
  oscLoop: 10,
  decayDelta: 11,
  numVibrato: 12,
  vibratoDelay: 13,
  vibratoSpeed: 14,
  vibratoMaxDepth: 15,
  chain: 16
};
const KnobCell = ({ label, value, min, max, color, onChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Knob,
    {
      value,
      min,
      max,
      step: 1,
      onChange: (v) => onChange(Math.round(v)),
      color
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
      lineNumber: 39,
      columnNumber: 5
    },
    void 0
  ),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-secondary", children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
    lineNumber: 45,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-tertiary font-mono", children: value }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
    lineNumber: 46,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
  lineNumber: 38,
  columnNumber: 3
}, void 0);
const SteveTurnerControls = ({
  config,
  onChange,
  instrumentIndex
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("envelope");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
    const paramId = PARAM_IDS[key];
    if (paramId !== void 0 && instrumentIndex !== void 0) {
      __vitePreload(async () => {
        const { SteveTurnerEngine } = await import("./main-BbV5VyEH.js").then((n) => n.iL);
        return { SteveTurnerEngine };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0).then(({ SteveTurnerEngine }) => {
        if (SteveTurnerEngine.hasInstance()) {
          SteveTurnerEngine.getInstance().setInstrumentParam(instrumentIndex, paramId, value);
        }
      }).catch((err) => console.warn("SteveTurner param forward failed:", err));
    }
  }, [onChange, instrumentIndex]);
  const tabs = [
    { key: "envelope", label: "Envelope" },
    { key: "vibrato", label: "Vibrato" },
    { key: "misc", label: "Misc" }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 space-y-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 border-b border-dark-border pb-1", children: [
      tabs.map((t) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          className: `px-3 py-1 text-xs rounded-t transition-colors ${activeTab === t.key ? "bg-accent-primary text-white" : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"}`,
          onClick: () => setActiveTab(t.key),
          children: t.label
        },
        t.key,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 85,
          columnNumber: 11
        },
        void 0
      )),
      instrumentIndex !== void 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-auto text-xs text-text-tertiary self-center", children: [
        "Inst ",
        instrumentIndex
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
        lineNumber: 98,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
      lineNumber: 83,
      columnNumber: 7
    }, void 0),
    activeTab === "envelope" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Delay",
          value: config.initDelay,
          min: 0,
          max: 255,
          color: "#4fc3f7",
          onChange: (v) => upd("initDelay", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 107,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Seg1 Dur",
          value: config.env1Duration,
          min: 0,
          max: 255,
          color: "#81c784",
          onChange: (v) => upd("env1Duration", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 109,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Seg1 Delta",
          value: config.env1Delta,
          min: -128,
          max: 127,
          color: "#81c784",
          onChange: (v) => upd("env1Delta", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 111,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Seg2 Dur",
          value: config.env2Duration,
          min: 0,
          max: 255,
          color: "#ffb74d",
          onChange: (v) => upd("env2Duration", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 113,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Seg2 Delta",
          value: config.env2Delta,
          min: -128,
          max: 127,
          color: "#ffb74d",
          onChange: (v) => upd("env2Delta", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 115,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Osc Count",
          value: config.oscCount,
          min: 0,
          max: 65535,
          color: "#ce93d8",
          onChange: (v) => upd("oscCount", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 117,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Osc Delta",
          value: config.oscDelta,
          min: -128,
          max: 127,
          color: "#ce93d8",
          onChange: (v) => upd("oscDelta", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 119,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Osc Loop",
          value: config.oscLoop,
          min: 0,
          max: 255,
          color: "#ce93d8",
          onChange: (v) => upd("oscLoop", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 121,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Decay",
          value: config.decayDelta,
          min: -128,
          max: 127,
          color: "#ef5350",
          onChange: (v) => upd("decayDelta", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 123,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
      lineNumber: 106,
      columnNumber: 9
    }, void 0),
    activeTab === "vibrato" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Entries",
          value: config.numVibrato,
          min: 0,
          max: 5,
          color: "#4dd0e1",
          onChange: (v) => upd("numVibrato", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 131,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Vib Delay",
          value: config.vibratoDelay,
          min: 0,
          max: 255,
          color: "#4dd0e1",
          onChange: (v) => upd("vibratoDelay", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 133,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Vib Speed",
          value: config.vibratoSpeed,
          min: 0,
          max: 255,
          color: "#4dd0e1",
          onChange: (v) => upd("vibratoSpeed", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 135,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Vib Max",
          value: config.vibratoMaxDepth,
          min: 0,
          max: 255,
          color: "#4dd0e1",
          onChange: (v) => upd("vibratoMaxDepth", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 137,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Pitch Shift",
          value: config.pitchShift,
          min: 0,
          max: 7,
          color: "#aed581",
          onChange: (v) => upd("pitchShift", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 139,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
      lineNumber: 130,
      columnNumber: 9
    }, void 0),
    activeTab === "misc" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Priority",
          value: config.priority,
          min: 0,
          max: 255,
          color: "#90a4ae",
          onChange: (v) => upd("priority", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 147,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Sample",
          value: config.sampleIdx,
          min: 0,
          max: 29,
          color: "#90a4ae",
          onChange: (v) => upd("sampleIdx", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 149,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        KnobCell,
        {
          label: "Chain",
          value: config.chain,
          min: 0,
          max: 32,
          color: "#ffab91",
          onChange: (v) => upd("chain", v)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
          lineNumber: 151,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
      lineNumber: 146,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SteveTurnerControls.tsx",
    lineNumber: 81,
    columnNumber: 5
  }, void 0);
};
export {
  SteveTurnerControls
};
