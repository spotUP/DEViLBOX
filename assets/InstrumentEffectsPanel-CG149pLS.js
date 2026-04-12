import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React, P as Plus, S as Search, X } from "./vendor-ui-AJ7AT9BN.js";
import { e as useInstrumentStore, ak as getDefaultEffectParameters } from "./main-BbV5VyEH.js";
import { E as ENCLOSURE_COLORS, D as DEFAULT_ENCLOSURE, V as VisualEffectEditorWrapper } from "./index-CRvWC1pf.js";
import { g as getEffectsByGroup } from "./unifiedEffects-Cd2Pk46Y.js";
import { GUITARML_MODEL_REGISTRY, getModelCharacteristicDefaults } from "./guitarMLRegistry-CdfjBfrw.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./DrawbarSlider-Dq9geM4g.js";
import "./SectionHeader-DHk3L-9n.js";
const InstrumentEffectsPanel = reactExports.forwardRef(({
  instrumentId,
  instrumentName,
  effects,
  hideHeader = false
}, ref) => {
  const [showBrowser, setShowBrowser] = reactExports.useState(false);
  const [searchQuery, setSearchQuery] = reactExports.useState("");
  const effectsRef = reactExports.useRef(effects);
  reactExports.useEffect(() => {
    effectsRef.current = effects;
  }, [effects]);
  reactExports.useImperativeHandle(ref, () => ({
    toggleBrowser: () => setShowBrowser((prev) => !prev)
  }), []);
  const {
    addEffectConfig,
    removeEffect,
    updateEffect
  } = useInstrumentStore();
  const handleAddEffect = reactExports.useCallback((availableEffect) => {
    const type = availableEffect.type || "Distortion";
    const params = { ...getDefaultEffectParameters(type) };
    if (availableEffect.category === "neural" && availableEffect.neuralModelIndex !== void 0) {
      const model = GUITARML_MODEL_REGISTRY[availableEffect.neuralModelIndex];
      if (model == null ? void 0 : model.parameters) {
        Object.entries(model.parameters).forEach(([key, param]) => {
          if (param) params[key] = param.default;
        });
        const charDefaults = getModelCharacteristicDefaults(
          model.characteristics.gain,
          model.characteristics.tone
        );
        Object.assign(params, charDefaults);
      }
    }
    addEffectConfig(instrumentId, {
      category: availableEffect.category,
      type,
      enabled: true,
      wet: 100,
      parameters: params,
      neuralModelIndex: availableEffect.neuralModelIndex,
      neuralModelName: availableEffect.category === "neural" ? availableEffect.label : void 0
    });
    setShowBrowser(false);
    setSearchQuery("");
  }, [instrumentId, addEffectConfig]);
  const handleToggle = reactExports.useCallback((effectId) => {
    const effect = effectsRef.current.find((fx) => fx.id === effectId);
    if (effect) {
      updateEffect(instrumentId, effectId, { enabled: !effect.enabled });
    }
  }, [instrumentId, updateEffect]);
  const handleRemove = reactExports.useCallback((effectId) => {
    removeEffect(instrumentId, effectId);
  }, [instrumentId, removeEffect]);
  const handleUpdateParameter = reactExports.useCallback((effectId, key, value) => {
    const effect = effectsRef.current.find((fx) => fx.id === effectId);
    if (effect) {
      updateEffect(instrumentId, effectId, {
        parameters: { ...effect.parameters, [key]: value }
      });
    }
  }, [instrumentId, updateEffect]);
  const handleUpdateWet = reactExports.useCallback((effectId, wet) => {
    updateEffect(instrumentId, effectId, { wet });
  }, [instrumentId, updateEffect]);
  const effectsByGroup = getEffectsByGroup();
  const filteredEffectsByGroup = React.useMemo(() => {
    if (!searchQuery.trim()) return effectsByGroup;
    const q = searchQuery.toLowerCase();
    const filtered = {};
    for (const [group, groupEffects] of Object.entries(effectsByGroup)) {
      const matched = groupEffects.filter((e) => e.label.toLowerCase().includes(q));
      if (matched.length > 0) filtered[group] = matched;
    }
    return filtered;
  }, [effectsByGroup, searchQuery]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full min-h-0 bg-dark-bg", children: [
    !hideHeader && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-3 py-2 bg-dark-bgSecondary border-b border-dark-border shrink-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 min-w-0", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono text-text-muted truncate", children: instrumentName }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
          lineNumber: 129,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted px-1.5 py-0.5 bg-dark-bg rounded", children: [
          effects.length,
          " FX"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
          lineNumber: 130,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
        lineNumber: 128,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setShowBrowser(!showBrowser),
          className: "flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase rounded\n                     bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Plus, { size: 11 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
              lineNumber: 139,
              columnNumber: 13
            }, void 0),
            "Add"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
          lineNumber: 134,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
      lineNumber: 127,
      columnNumber: 9
    }, void 0),
    showBrowser && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-b border-dark-border bg-dark-bgTertiary shrink-0 max-h-[300px] overflow-y-auto scrollbar-modern", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Search, { size: 12, className: "absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
          lineNumber: 150,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "text",
            placeholder: "Search effects...",
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value),
            className: "w-full pl-7 pr-7 py-1.5 text-xs bg-dark-bg border border-dark-border rounded text-text-primary\n                         placeholder-text-muted focus:outline-none focus:border-accent-primary transition-colors",
            autoFocus: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
            lineNumber: 151,
            columnNumber: 15
          },
          void 0
        ),
        searchQuery && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setSearchQuery(""),
            className: "absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
              lineNumber: 165,
              columnNumber: 19
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
            lineNumber: 161,
            columnNumber: 17
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
        lineNumber: 149,
        columnNumber: 13
      }, void 0),
      Object.entries(filteredEffectsByGroup).map(([group, groupEffects]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted font-bold uppercase tracking-wider mb-1 px-1", children: group }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
          lineNumber: 171,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1", children: groupEffects.map((effect) => {
          const enc = ENCLOSURE_COLORS[effect.type ?? ""] || DEFAULT_ENCLOSURE;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => handleAddEffect(effect),
              className: "px-2 py-1 text-[10px] rounded border transition-colors hover:text-text-primary",
              style: {
                borderColor: enc.border,
                background: enc.bg,
                color: enc.accent
              },
              children: effect.label
            },
            effect.label,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
              lineNumber: 176,
              columnNumber: 23
            },
            void 0
          );
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
          lineNumber: 172,
          columnNumber: 17
        }, void 0)
      ] }, group, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
        lineNumber: 170,
        columnNumber: 15
      }, void 0))
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
      lineNumber: 148,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
      lineNumber: 147,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-h-0 overflow-y-auto scrollbar-modern p-3 space-y-3", children: effects.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center justify-center h-full text-text-muted", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs mb-2", children: "No effects on this instrument" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
        lineNumber: 201,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setShowBrowser(true),
          className: "px-3 py-1.5 text-xs rounded border border-dashed border-dark-border\n                       hover:border-accent-primary hover:text-accent-primary transition-colors",
          children: "+ Add Effect"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
          lineNumber: 202,
          columnNumber: 13
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
      lineNumber: 200,
      columnNumber: 11
    }, void 0) : effects.map((effect) => {
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative group", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => handleRemove(effect.id),
            className: "absolute top-2 right-2 z-10 p-1 rounded-lg opacity-0 group-hover:opacity-100\n                           transition-opacity hover:bg-white/10",
            style: { color: "#ff5050" },
            title: "Remove effect",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
              lineNumber: 222,
              columnNumber: 19
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
            lineNumber: 215,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => handleToggle(effect.id),
            className: "absolute top-2 right-10 z-10 p-1 rounded-lg opacity-0 group-hover:opacity-100\n                           transition-opacity hover:bg-white/10",
            style: { color: effect.enabled ? "#10b981" : "rgba(255,255,255,0.2)" },
            title: effect.enabled ? "Disable" : "Enable",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("path", { d: "M18.36 6.64a9 9 0 1 1-12.73 0" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
                lineNumber: 234,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("line", { x1: "12", y1: "2", x2: "12", y2: "12" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
                lineNumber: 235,
                columnNumber: 21
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
              lineNumber: 233,
              columnNumber: 19
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
            lineNumber: 226,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { opacity: effect.enabled ? 1 : 0.45, transition: "opacity 0.2s" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          VisualEffectEditorWrapper,
          {
            effect,
            onUpdateParameter: (key, value) => handleUpdateParameter(effect.id, key, value),
            onUpdateWet: (wet) => handleUpdateWet(effect.id, wet)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
            lineNumber: 241,
            columnNumber: 19
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
          lineNumber: 240,
          columnNumber: 17
        }, void 0)
      ] }, effect.id, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
        lineNumber: 213,
        columnNumber: 15
      }, void 0);
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
      lineNumber: 198,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsPanel.tsx",
    lineNumber: 124,
    columnNumber: 5
  }, void 0);
});
InstrumentEffectsPanel.displayName = "InstrumentEffectsPanel";
export {
  InstrumentEffectsPanel
};
