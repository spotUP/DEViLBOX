import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, a6 as Loader, k as SlidersVertical } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob, $ as getToneEngine } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function groupParams(params) {
  const groups = /* @__PURE__ */ new Map();
  for (const param of params) {
    const colonIdx = param.name.indexOf(":");
    const groupName = colonIdx > 0 ? param.name.substring(0, colonIdx) : "Parameters";
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(param);
  }
  return Array.from(groups.entries()).map(([name, groupParams2]) => ({
    name,
    params: groupParams2
  }));
}
function getParamDisplayName(param) {
  const colonIdx = param.name.indexOf(":");
  return colonIdx > 0 ? param.name.substring(colonIdx + 1).trim() : param.name;
}
const VSTBridgePanel = ({
  instrument
}) => {
  const [params, setParams] = reactExports.useState([]);
  const [paramValues, setParamValues] = reactExports.useState(/* @__PURE__ */ new Map());
  const [isLoading, setIsLoading] = reactExports.useState(true);
  const synthRef = reactExports.useRef(null);
  const { accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#a78bfa");
  reactExports.useEffect(() => {
    let cancelled = false;
    const loadParams = async () => {
      var _a;
      try {
        const engine = getToneEngine();
        const key = engine.getInstrumentKey(instrument.id, -1);
        const synth = (_a = engine.instruments) == null ? void 0 : _a.get(key);
        if (!synth || !("getParams" in synth)) {
          setTimeout(() => {
            if (!cancelled) loadParams();
          }, 500);
          return;
        }
        if ("ensureInitialized" in synth) {
          await synth.ensureInitialized();
        }
        synthRef.current = synth;
        const wasmParams = synth.getParams();
        if (!cancelled) {
          setParams(wasmParams);
          const values = /* @__PURE__ */ new Map();
          for (const p of wasmParams) {
            values.set(p.id, p.defaultValue);
          }
          setParamValues(values);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadParams();
    return () => {
      cancelled = true;
    };
  }, [instrument.id]);
  const handleParamChange = reactExports.useCallback((paramId, value) => {
    setParamValues((prev) => {
      const next = new Map(prev);
      next.set(paramId, value);
      return next;
    });
    if (synthRef.current) {
      synthRef.current.setParameter(paramId, value);
    }
  }, []);
  if (isLoading) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center gap-2 p-8 text-text-secondary", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Loader, { size: 16, className: "animate-spin" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
        lineNumber: 127,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Loading parameters..." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
        lineNumber: 128,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
      lineNumber: 126,
      columnNumber: 7
    }, void 0);
  }
  if (params.length === 0) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center gap-2 p-8 text-text-muted", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 16 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
        lineNumber: 136,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "No parameters exposed by this synth" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
        lineNumber: 137,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
      lineNumber: 135,
      columnNumber: 7
    }, void 0);
  }
  const groups = groupParams(params);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto", children: groups.map((group) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 16, style: { color: accentColor } }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
        lineNumber: 149,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "h3",
        {
          className: "font-bold uppercase tracking-tight text-sm",
          style: { color: accentColor },
          children: group.name
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
          lineNumber: 150,
          columnNumber: 13
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
      lineNumber: 148,
      columnNumber: 11
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-3", children: group.params.map((param) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        label: getParamDisplayName(param),
        value: paramValues.get(param.id) ?? param.defaultValue,
        min: param.min,
        max: param.max,
        defaultValue: param.defaultValue,
        onChange: (value) => handleParamChange(param.id, value),
        color: knobColor
      },
      param.id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
        lineNumber: 160,
        columnNumber: 15
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
      lineNumber: 158,
      columnNumber: 11
    }, void 0)
  ] }, group.name, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
    lineNumber: 147,
    columnNumber: 9
  }, void 0)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VSTBridgePanel.tsx",
    lineNumber: 145,
    columnNumber: 5
  }, void 0);
};
export {
  VSTBridgePanel
};
