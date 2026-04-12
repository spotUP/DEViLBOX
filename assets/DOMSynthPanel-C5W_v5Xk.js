import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { W as CustomSelect, aB as Knob } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const SECTION_ACCENTS = [
  "#22d3ee",
  // cyan
  "#a78bfa",
  // violet
  "#f59e0b",
  // amber
  "#ec4899",
  // pink
  "#10b981",
  // emerald
  "#f97316",
  // orange
  "#3b82f6",
  // blue
  "#ef4444"
  // red
];
function getSynthEnclosure(synthName) {
  const name = synthName.toLowerCase();
  if (name.includes("bass") || name.includes("wobble"))
    return { bg: "#1a0a22", bgEnd: "#100618", accent: "#a855f7", border: "#2a1430" };
  if (name.includes("drum") || name.includes("808") || name.includes("membrane"))
    return { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#ef4444", border: "#3a1a0a" };
  if (name.includes("fm") || name.includes("dx") || name.includes("dexed"))
    return { bg: "#081420", bgEnd: "#040e18", accent: "#22d3ee", border: "#0a1e30" };
  if (name.includes("pad") || name.includes("ambient") || name.includes("space"))
    return { bg: "#0e0a20", bgEnd: "#080618", accent: "#6366f1", border: "#1a1430" };
  if (name.includes("lead") || name.includes("mono"))
    return { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" };
  if (name.includes("organ") || name.includes("piano") || name.includes("key"))
    return { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" };
  if (name.includes("pluck") || name.includes("string") || name.includes("guitar"))
    return { bg: "#201408", bgEnd: "#180e04", accent: "#f59e0b", border: "#301e0a" };
  if (name.includes("noise") || name.includes("metal"))
    return { bg: "#141414", bgEnd: "#0a0a0a", accent: "#94a3b8", border: "#282828" };
  return { bg: "#120a1a", bgEnd: "#0a0612", accent: "#8b5cf6", border: "#1e1430" };
}
const ENCLOSURE_SHADOW = [
  "0 6px 16px rgba(0,0,0,0.5)",
  "0 2px 4px rgba(0,0,0,0.7)",
  "inset 0 1px 0 rgba(255,255,255,0.06)",
  "inset 0 -1px 0 rgba(0,0,0,0.4)"
].join(", ");
const deepGet = (obj, path) => {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return void 0;
    current = current[part];
  }
  return current;
};
const deepSet = (container, pathParts, value) => {
  if (pathParts.length === 0) return value;
  const [k, ...rest] = pathParts;
  const copy = { ...container };
  copy[k] = deepSet(copy[k], rest, value);
  return copy;
};
const DOMSynthPanel = ({ layout, config, onChange }) => {
  var _a, _b, _c, _d;
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  });
  const [activeTab, setActiveTab] = reactExports.useState(((_b = (_a = layout.tabs) == null ? void 0 : _a[0]) == null ? void 0 : _b.id) ?? "");
  const enc = getSynthEnclosure(layout.name);
  const resolveKey = (key) => {
    if (key.startsWith("~")) return key.slice(1);
    return layout.configKey ? `${layout.configKey}.${key}` : key;
  };
  const updateParam = reactExports.useCallback((key, value) => {
    const full = resolveKey(key);
    const parts = full.split(".");
    if (parts.length === 1) {
      onChange({ [parts[0]]: value });
    } else {
      const [root, ...rest] = parts;
      const newRoot = deepSet(configRef.current[root], rest, value);
      onChange({ [root]: newRoot });
    }
  }, [onChange, layout.configKey]);
  const getValue = (key) => deepGet(config, resolveKey(key));
  const sections = layout.tabs ? ((_c = layout.tabs.find((t) => t.id === activeTab)) == null ? void 0 : _c.sections) ?? ((_d = layout.tabs[0]) == null ? void 0 : _d.sections) ?? [] : layout.sections ?? [];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "synth-editor-container rounded-xl overflow-hidden select-none",
      style: {
        background: `linear-gradient(170deg, ${enc.bg} 0%, ${enc.bgEnd} 100%)`,
        border: `2px solid ${enc.border}`,
        boxShadow: ENCLOSURE_SHADOW
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "px-4 py-2.5 flex items-center gap-3",
            style: {
              background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)",
              borderBottom: `1px solid ${enc.border}`
            },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black",
                  style: {
                    background: `linear-gradient(135deg, ${enc.accent}40, ${enc.accent}20)`,
                    border: `1px solid ${enc.accent}30`,
                    boxShadow: `0 0 12px ${enc.accent}15`,
                    color: enc.accent
                  },
                  children: "♪"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
                  lineNumber: 131,
                  columnNumber: 9
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-black text-text-primary tracking-wide truncate", children: layout.name }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
                lineNumber: 143,
                columnNumber: 11
              }, void 0) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
                lineNumber: 142,
                columnNumber: 9
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "w-2 h-2 rounded-full flex-shrink-0",
                  style: {
                    backgroundColor: "#22ff44",
                    boxShadow: "0 0 4px 1px rgba(34,255,68,0.5), 0 0 10px 3px rgba(34,255,68,0.15)"
                  }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
                  lineNumber: 146,
                  columnNumber: 9
                },
                void 0
              )
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
            lineNumber: 124,
            columnNumber: 7
          },
          void 0
        ),
        layout.tabs && layout.tabs.length > 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-0 border-b", style: { borderColor: enc.border }, children: layout.tabs.map((tab) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setActiveTab(tab.id),
            className: `flex-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === tab.id ? "text-text-primary" : "text-text-muted hover:text-text-secondary"}`,
            style: activeTab === tab.id ? {
              background: `linear-gradient(180deg, ${enc.accent}15, transparent)`,
              borderBottom: `2px solid ${enc.accent}`
            } : {
              borderBottom: "2px solid transparent"
            },
            children: tab.label
          },
          tab.id,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
            lineNumber: 159,
            columnNumber: 13
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
          lineNumber: 157,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 flex flex-col gap-3", children: sections.map((section, sIdx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          DOMSynthSection,
          {
            section,
            getValue,
            updateParam,
            accent: SECTION_ACCENTS[sIdx % SECTION_ACCENTS.length],
            enclosure: enc
          },
          `${activeTab}-${sIdx}`,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
            lineNumber: 183,
            columnNumber: 11
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
          lineNumber: 181,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
      lineNumber: 115,
      columnNumber: 5
    },
    void 0
  );
};
const DOMSynthSection = ({ section, getValue, updateParam, accent, enclosure }) => {
  const knobs = section.controls.filter((c) => c.type === "knob" || c.type === "slider");
  const toggles = section.controls.filter((c) => c.type === "toggle" || c.type === "switch3way" || c.type === "select");
  const cols = section.columns ?? Math.min(knobs.length, 6);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "rounded-lg p-3 backdrop-blur-sm",
      style: {
        background: "rgba(0,0,0,0.3)",
        border: `1px solid ${enclosure.border}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)"
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "w-1.5 h-4 rounded-full",
              style: { backgroundColor: accent, boxShadow: `0 0 8px ${accent}60` }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
              lineNumber: 223,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-black uppercase tracking-[0.15em] text-white/90", children: section.label }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
            lineNumber: 227,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
          lineNumber: 222,
          columnNumber: 7
        }, void 0),
        knobs.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-2", style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }, children: knobs.map((ctrl) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          DOMSynthControl,
          {
            descriptor: ctrl,
            value: getValue(ctrl.key),
            onChange: (v) => updateParam(ctrl.key, v),
            accent
          },
          ctrl.key,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
            lineNumber: 236,
            columnNumber: 13
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
          lineNumber: 234,
          columnNumber: 9
        }, void 0),
        toggles.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 mt-3 pt-3", style: { borderTop: `1px solid ${enclosure.border}` }, children: toggles.map((ctrl) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          DOMSynthControl,
          {
            descriptor: ctrl,
            value: getValue(ctrl.key),
            onChange: (v) => updateParam(ctrl.key, v),
            accent
          },
          ctrl.key,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
            lineNumber: 251,
            columnNumber: 13
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
          lineNumber: 249,
          columnNumber: 9
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
      lineNumber: 213,
      columnNumber: 5
    },
    void 0
  );
};
const DOMSynthControl = ({ descriptor, value, onChange, accent }) => {
  var _a, _b;
  switch (descriptor.type) {
    case "knob": {
      const numVal = typeof value === "number" ? value : descriptor.defaultValue ?? 0.5;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: numVal,
          min: descriptor.min ?? 0,
          max: descriptor.max ?? 1,
          onChange: (v) => onChange(v),
          label: descriptor.label,
          color: descriptor.color ?? accent,
          formatValue: descriptor.formatValue
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
          lineNumber: 280,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
        lineNumber: 279,
        columnNumber: 9
      }, void 0);
    }
    case "toggle": {
      const active = Boolean(value);
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onChange(!active),
            className: "px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded transition-colors",
            style: active ? {
              background: `${accent}25`,
              color: accent,
              border: `1px solid ${accent}50`,
              boxShadow: `0 0 6px ${accent}20`
            } : {
              background: "rgba(255,255,255,0.04)",
              color: "var(--color-text-muted)",
              border: "1px solid rgba(255,255,255,0.08)"
            },
            children: active ? ((_a = descriptor.labels) == null ? void 0 : _a[1]) ?? "ON" : ((_b = descriptor.labels) == null ? void 0 : _b[0]) ?? "OFF"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
            lineNumber: 297,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-muted uppercase tracking-wider", children: descriptor.label }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
          lineNumber: 313,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
        lineNumber: 296,
        columnNumber: 9
      }, void 0);
    }
    case "slider": {
      const numVal = typeof value === "number" ? value : 0.5;
      const min = descriptor.min ?? 0;
      const max = descriptor.max ?? 1;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "range",
            min,
            max,
            step: (max - min) / 100,
            value: numVal,
            onChange: (e) => onChange(parseFloat(e.target.value)),
            className: "w-full h-1",
            style: { maxWidth: "64px", accentColor: accent }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
            lineNumber: 324,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-muted uppercase tracking-wider", children: descriptor.label }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
          lineNumber: 334,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
        lineNumber: 323,
        columnNumber: 9
      }, void 0);
    }
    case "switch3way": {
      const numVal = typeof value === "number" ? value : 0;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-px rounded overflow-hidden", style: { border: "1px solid rgba(255,255,255,0.08)" }, children: descriptor.labels.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onChange(i),
            className: "px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider transition-colors",
            style: numVal === i ? {
              background: `${accent}25`,
              color: accent
            } : {
              background: "rgba(255,255,255,0.03)",
              color: "var(--color-text-muted)"
            },
            children: label
          },
          i,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
            lineNumber: 345,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
          lineNumber: 343,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-muted uppercase tracking-wider", children: descriptor.label }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
          lineNumber: 361,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
        lineNumber: 342,
        columnNumber: 9
      }, void 0);
    }
    case "select": {
      const strVal = typeof value === "string" ? value : String(value ?? "");
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-muted uppercase tracking-wider", children: descriptor.label }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
          lineNumber: 370,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: strVal,
            onChange: (v) => onChange(v),
            options: descriptor.options.map((opt) => ({ value: opt.value, label: opt.label })),
            className: "px-2 py-1 text-[10px] rounded border transition-colors focus:outline-none",
            style: {
              background: "rgba(0,0,0,0.3)",
              borderColor: "rgba(255,255,255,0.1)",
              color: "var(--color-text-primary)"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
            lineNumber: 371,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DOMSynthPanel.tsx",
        lineNumber: 369,
        columnNumber: 9
      }, void 0);
    }
    default:
      return null;
  }
};
export {
  DOMSynthPanel
};
