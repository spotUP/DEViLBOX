const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { as as useAudioStore, R as useTrackerStore, am as __vitePreload, aC as MASTER_FX_PRESETS, aD as useSensors, aE as useSensor, aF as sortableKeyboardCoordinates, aG as KeyboardSensor, aH as PointerSensor, aI as DndContext, aJ as closestCenter, aK as SortableContext, aL as verticalListSortingStrategy, ak as getDefaultEffectParameters, aM as useSortable, aN as CSS, aO as getDefaultEffectWet } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, e as Settings, h as ChevronDown, g as Save, X, R as React, V as Volume2 } from "./vendor-ui-AJ7AT9BN.js";
import { A as AVAILABLE_EFFECTS } from "./unifiedEffects-Cd2Pk46Y.js";
import { GUITARML_MODEL_REGISTRY } from "./guitarMLRegistry-CdfjBfrw.js";
import "./vendor-tone-48TQc1H3.js";
import { E as ENCLOSURE_COLORS, D as DEFAULT_ENCLOSURE, V as VisualEffectEditorWrapper } from "./index-CRvWC1pf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-react-Dgd_wxYf.js";
import "./DrawbarSlider-Dq9geM4g.js";
import "./SectionHeader-DHk3L-9n.js";
function SortableVisualEffect({ effect, onToggle, onRemove, onUpdateParameter, onUpdateParameters, onWetChange, onChannelSelect, numChannels }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: effect.id
  });
  const selected = effect.selectedChannels;
  const hasSelection = Array.isArray(selected);
  const toggleChannel = (ch) => {
    const current = new Set(selected ?? []);
    if (current.has(ch)) {
      current.delete(ch);
      onChannelSelect(current.size > 0 ? Array.from(current).sort((a, b) => a - b) : void 0);
    } else {
      current.add(ch);
      onChannelSelect(Array.from(current).sort((a, b) => a - b));
    }
  };
  const selectAll = () => {
    onChannelSelect(void 0);
  };
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: setNodeRef,
      style,
      className: `relative group mb-3 ${isDragging ? "ring-2 ring-accent-primary rounded-xl" : ""}`,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            ...attributes,
            ...listeners,
            className: "flex items-center justify-center h-4 cursor-grab active:cursor-grabbing rounded-t-lg",
            style: { background: "rgba(255,255,255,0.03)" },
            title: "Drag to reorder",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-8 h-0.5 rounded bg-white/10" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
              lineNumber: 87,
              columnNumber: 9
            }, this)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
            lineNumber: 80,
            columnNumber: 7
          },
          this
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onRemove,
            className: "absolute top-2 right-2 z-10 p-1 rounded-lg opacity-0 group-hover:opacity-100\n                 transition-opacity hover:bg-white/10",
            style: { color: "#ff5050" },
            title: "Remove effect",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
              lineNumber: 98,
              columnNumber: 9
            }, this)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
            lineNumber: 91,
            columnNumber: 7
          },
          this
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onToggle,
            className: "absolute top-2 right-10 z-10 p-1 rounded-lg opacity-0 group-hover:opacity-100\n                 transition-opacity hover:bg-white/10",
            style: { color: effect.enabled ? "#10b981" : "rgba(255,255,255,0.2)" },
            title: effect.enabled ? "Disable" : "Enable",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("path", { d: "M18.36 6.64a9 9 0 1 1-12.73 0" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                lineNumber: 110,
                columnNumber: 11
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("line", { x1: "12", y1: "2", x2: "12", y2: "12" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                lineNumber: 111,
                columnNumber: 11
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
              lineNumber: 109,
              columnNumber: 9
            }, this)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
            lineNumber: 102,
            columnNumber: 7
          },
          this
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { opacity: effect.enabled ? 1 : 0.45, transition: "opacity 0.2s" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          VisualEffectEditorWrapper,
          {
            effect,
            onUpdateParameter,
            onUpdateParameters,
            onUpdateWet: onWetChange
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
            lineNumber: 117,
            columnNumber: 9
          },
          this
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 116,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mx-2 mb-2 mt-1 p-1.5 rounded-lg bg-dark-bg/60 border border-dark-border/40", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5 mb-1.5", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-semibold text-text-muted uppercase tracking-wider", children: "Route" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
              lineNumber: 128,
              columnNumber: 11
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: selectAll,
                className: `px-1.5 py-0.5 text-[9px] font-bold rounded transition-colors ${!hasSelection ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/40" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-transparent"}`,
                children: "ALL"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                lineNumber: 129,
                columnNumber: 11
              },
              this
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted/60 ml-auto", children: hasSelection && selected.length === 0 ? "No channels" : hasSelection ? `${selected.length}/${numChannels} ch` : "All channels" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
              lineNumber: 139,
              columnNumber: 11
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
            lineNumber: 127,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-1", children: Array.from({ length: numChannels }, (_, i) => {
            const isSelected = !hasSelection || ((selected == null ? void 0 : selected.includes(i)) ?? false);
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => toggleChannel(i),
                className: `w-5 h-5 text-[9px] font-bold rounded transition-colors ${isSelected && hasSelection ? "bg-accent-primary/30 text-accent-primary border border-accent-primary/50" : isSelected ? "bg-dark-bgTertiary text-text-secondary border border-dark-border" : "bg-dark-bg text-text-muted/30 border border-dark-border/50"}`,
                title: `Channel ${i + 1}`,
                children: i + 1
              },
              i,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                lineNumber: 151,
                columnNumber: 15
              },
              this
            );
          }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
            lineNumber: 147,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 126,
          columnNumber: 7
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
      lineNumber: 74,
      columnNumber: 5
    },
    this
  );
}
const USER_MASTER_FX_PRESETS_KEY = "master-fx-user-presets";
const MasterEffectsPanel = reactExports.forwardRef(({ hideHeader = false }, ref) => {
  const [showAddMenu, setShowAddMenu] = reactExports.useState(false);
  const [showPresetMenu, setShowPresetMenu] = reactExports.useState(false);
  const [showSaveDialog, setShowSaveDialog] = reactExports.useState(false);
  const [presetName, setPresetName] = reactExports.useState("");
  reactExports.useImperativeHandle(ref, () => ({
    toggleAddMenu: () => setShowAddMenu((prev) => !prev),
    togglePresetMenu: () => setShowPresetMenu((prev) => !prev)
  }), []);
  const {
    masterEffects,
    addMasterEffectConfig,
    removeMasterEffect,
    updateMasterEffect,
    reorderMasterEffects,
    setMasterEffects
  } = useAudioStore();
  const numChannels = useTrackerStore((s) => {
    var _a, _b;
    return ((_b = (_a = s.patterns[s.currentPatternIndex]) == null ? void 0 : _a.channels) == null ? void 0 : _b.length) ?? 16;
  });
  const masterEffectsRef = reactExports.useRef(masterEffects);
  reactExports.useEffect(() => {
    masterEffectsRef.current = masterEffects;
  }, [masterEffects]);
  const getUserPresets = reactExports.useCallback(() => {
    try {
      const stored = localStorage.getItem(USER_MASTER_FX_PRESETS_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (p) => p !== null && typeof p === "object" && typeof p.name === "string" && Array.isArray(p.effects)
      );
    } catch {
      return [];
    }
  }, []);
  const syncPresetsToServer = reactExports.useCallback((presets) => {
    __vitePreload(async () => {
      const { pushToCloud } = await import("./main-BbV5VyEH.js").then((n) => n.jb);
      return { pushToCloud };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0).then(({ pushToCloud }) => {
      __vitePreload(async () => {
        const { SYNC_KEYS } = await import("./main-BbV5VyEH.js").then((n) => n.jc);
        return { SYNC_KEYS };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0).then(({ SYNC_KEYS }) => {
        pushToCloud(SYNC_KEYS.MASTER_FX_PRESETS, presets).catch((err) => console.warn("FX preset cloud sync failed:", err));
      });
    });
  }, []);
  const handleSavePreset = reactExports.useCallback(() => {
    if (!presetName.trim()) return;
    const userPresets2 = getUserPresets();
    userPresets2.push({
      name: presetName.trim(),
      effects: masterEffects.map((fx) => ({ ...fx }))
      // Clone the effects
    });
    localStorage.setItem(USER_MASTER_FX_PRESETS_KEY, JSON.stringify(userPresets2));
    syncPresetsToServer(userPresets2);
    setPresetName("");
    setShowSaveDialog(false);
  }, [presetName, masterEffects, getUserPresets, syncPresetsToServer]);
  const handleLoadPreset = reactExports.useCallback((preset) => {
    const effects = preset.effects.map((fx, index) => ({
      ...fx,
      id: `master-fx-${Date.now()}-${index}`
    }));
    setMasterEffects(effects);
    setShowPresetMenu(false);
  }, [setMasterEffects]);
  const handleLoadUserPreset = reactExports.useCallback((preset) => {
    const effects = preset.effects.map((fx, index) => ({
      ...fx,
      id: `master-fx-${Date.now()}-${index}`
    }));
    setMasterEffects(effects);
    setShowPresetMenu(false);
  }, [setMasterEffects]);
  const handleDeleteUserPreset = reactExports.useCallback((name) => {
    const userPresets2 = getUserPresets().filter((p) => p.name !== name);
    localStorage.setItem(USER_MASTER_FX_PRESETS_KEY, JSON.stringify(userPresets2));
    syncPresetsToServer(userPresets2);
  }, [getUserPresets, syncPresetsToServer]);
  const userPresets = getUserPresets();
  const presetsByCategory = MASTER_FX_PRESETS.reduce((acc, preset) => {
    if (!acc[preset.category]) {
      acc[preset.category] = [];
    }
    acc[preset.category].push(preset);
    return acc;
  }, {});
  const sortedCategories = Object.keys(presetsByCategory).sort();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = masterEffects.findIndex((fx) => fx.id === active.id);
      const newIndex = masterEffects.findIndex((fx) => fx.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderMasterEffects(oldIndex, newIndex);
      }
    }
  };
  const handleAddEffect = (availableEffect) => {
    const type = availableEffect.type || "Distortion";
    const params = { ...getDefaultEffectParameters(type) };
    if (availableEffect.category === "neural" && availableEffect.neuralModelIndex !== void 0) {
      const model = GUITARML_MODEL_REGISTRY[availableEffect.neuralModelIndex];
      if (model == null ? void 0 : model.parameters) {
        Object.entries(model.parameters).forEach(([key, param]) => {
          if (param) params[key] = param.default;
        });
      }
    }
    const defaultWet = getDefaultEffectWet(type);
    addMasterEffectConfig({
      category: availableEffect.category,
      type,
      enabled: true,
      wet: defaultWet,
      parameters: params,
      neuralModelIndex: availableEffect.neuralModelIndex,
      neuralModelName: availableEffect.category === "neural" ? availableEffect.label : void 0
    });
    setShowAddMenu(false);
  };
  const handleToggle = reactExports.useCallback((effectId) => {
    const effect = masterEffectsRef.current.find((fx) => fx.id === effectId);
    if (effect) {
      updateMasterEffect(effectId, { enabled: !effect.enabled });
    }
  }, [updateMasterEffect]);
  const handleRemove = reactExports.useCallback((effectId) => {
    removeMasterEffect(effectId);
  }, [removeMasterEffect]);
  const handleWetChange = reactExports.useCallback((effectId, wet) => {
    updateMasterEffect(effectId, { wet });
  }, [updateMasterEffect]);
  const handleUpdateParameter = reactExports.useCallback((effectId, key, value) => {
    const effect = masterEffectsRef.current.find((fx) => fx.id === effectId);
    if (effect) {
      updateMasterEffect(effectId, {
        parameters: { ...effect.parameters, [key]: value }
      });
    }
  }, [updateMasterEffect]);
  const handleUpdateParameters = reactExports.useCallback((effectId, params) => {
    const effect = masterEffectsRef.current.find((fx) => fx.id === effectId);
    if (effect) {
      updateMasterEffect(effectId, {
        parameters: { ...effect.parameters, ...params }
      });
    }
  }, [updateMasterEffect]);
  const handleChannelSelect = reactExports.useCallback((effectId, channels) => {
    updateMasterEffect(effectId, { selectedChannels: channels });
  }, [updateMasterEffect]);
  const effectsByCategory = AVAILABLE_EFFECTS.reduce((acc, effect) => {
    if (!acc[effect.group]) acc[effect.group] = [];
    acc[effect.group].push(effect);
    return acc;
  }, {});
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: hideHeader ? "bg-dark-bg overflow-visible relative" : "bg-dark-bg border border-dark-border rounded-lg overflow-hidden", children: [
    !hideHeader && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-3 bg-dark-bgSecondary border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 16, className: "text-accent-primary" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 404,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-medium text-sm text-text-primary", children: "Master Effects" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 405,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted px-2 py-0.5 bg-dark-bg rounded", children: [
          masterEffects.length,
          " FX"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 406,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 403,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setShowPresetMenu(!showPresetMenu),
            className: "px-3 py-1 text-xs font-medium rounded bg-dark-bg text-text-primary\n                         hover:bg-dark-bgHover transition-colors flex items-center gap-1 border border-dark-border",
            children: [
              "Presets ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                lineNumber: 418,
                columnNumber: 25
              }, void 0)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
            lineNumber: 413,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 412,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setShowSaveDialog(true),
            className: "p-1.5 rounded text-text-muted hover:text-accent-primary hover:bg-dark-bgHover transition-colors",
            title: "Save current effects as preset",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Save, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
              lineNumber: 428,
              columnNumber: 15
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
            lineNumber: 423,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setShowAddMenu(!showAddMenu),
            className: "px-3 py-1 text-xs font-medium rounded bg-accent-primary/10 text-accent-primary\n                       hover:bg-accent-primary/20 transition-colors",
            children: "+ Add Effect"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
            lineNumber: 431,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 410,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
      lineNumber: 402,
      columnNumber: 9
    }, void 0),
    showPresetMenu && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "absolute right-0 top-0 mt-1 w-56 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-[99990] max-h-[70vh] overflow-y-auto",
        style: hideHeader ? { top: 0, right: 8 } : { top: "100%", right: 16 },
        children: [
          userPresets.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-3 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary", children: "User Presets" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
              lineNumber: 449,
              columnNumber: 15
            }, void 0),
            userPresets.map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "div",
              {
                className: "flex items-center justify-between px-3 py-2 hover:bg-dark-bgHover cursor-pointer group",
                children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "span",
                    {
                      onClick: () => handleLoadUserPreset(preset),
                      className: "text-sm text-text-primary flex-1",
                      children: preset.name
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                      lineNumber: 457,
                      columnNumber: 19
                    },
                    void 0
                  ),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "button",
                    {
                      onClick: (e) => {
                        e.stopPropagation();
                        handleDeleteUserPreset(preset.name);
                      },
                      className: "text-text-muted hover:text-accent-error opacity-0 group-hover:opacity-100 transition-opacity",
                      title: "Delete preset",
                      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 12 }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                        lineNumber: 471,
                        columnNumber: 21
                      }, void 0)
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                      lineNumber: 463,
                      columnNumber: 19
                    },
                    void 0
                  )
                ]
              },
              preset.name,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                lineNumber: 453,
                columnNumber: 17
              },
              void 0
            )),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border my-1" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
              lineNumber: 475,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
            lineNumber: 448,
            columnNumber: 13
          }, void 0),
          sortedCategories.map((category) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-3 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary", children: category }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
              lineNumber: 482,
              columnNumber: 15
            }, void 0),
            [...presetsByCategory[category]].sort((a, b) => a.name.localeCompare(b.name)).map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "div",
              {
                onClick: () => handleLoadPreset(preset),
                className: "px-3 py-2 hover:bg-dark-bgHover cursor-pointer",
                children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm text-text-primary", children: preset.name }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                    lineNumber: 491,
                    columnNumber: 19
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: preset.description }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                    lineNumber: 492,
                    columnNumber: 19
                  }, void 0)
                ]
              },
              preset.name,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
                lineNumber: 486,
                columnNumber: 17
              },
              void 0
            ))
          ] }, category, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
            lineNumber: 481,
            columnNumber: 13
          }, void 0))
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 444,
        columnNumber: 9
      },
      void 0
    ),
    showSaveDialog && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-3 bg-dark-bgTertiary border-b border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "text",
          placeholder: "Preset name...",
          value: presetName,
          onChange: (e) => setPresetName(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") handleSavePreset();
            if (e.key === "Escape") setShowSaveDialog(false);
          },
          maxLength: 64,
          className: "flex-1 px-3 py-1.5 text-sm bg-dark-bg border border-dark-border rounded text-text-primary\n                       placeholder-text-muted focus:outline-none focus:border-accent-primary",
          autoFocus: true
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 504,
          columnNumber: 13
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: handleSavePreset,
          className: "px-3 py-1.5 text-xs font-medium rounded bg-accent-primary text-text-primary hover:bg-accent-primaryHover transition-colors",
          children: "Save"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 518,
          columnNumber: 13
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setShowSaveDialog(false),
          className: "px-3 py-1.5 text-xs font-medium rounded bg-dark-bg text-text-muted hover:text-text-primary border border-dark-border hover:border-dark-borderLight transition-colors",
          children: "Cancel"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 524,
          columnNumber: 13
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
      lineNumber: 503,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
      lineNumber: 502,
      columnNumber: 9
    }, void 0),
    showAddMenu && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 bg-dark-bgTertiary border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted mb-3 font-medium", children: "Select Effect Type:" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 537,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: Object.entries(effectsByCategory).map(([category, effects]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted mb-1.5 uppercase tracking-wide", children: category }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 541,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1", children: effects.map((effect) => {
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
            effect.neuralModelIndex != null ? `neural-${effect.neuralModelIndex}` : effect.type,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
              lineNumber: 546,
              columnNumber: 23
            },
            void 0
          );
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 542,
          columnNumber: 17
        }, void 0)
      ] }, category, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 540,
        columnNumber: 15
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 538,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
      lineNumber: 536,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 bg-dark-bgSecondary border-b border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-xs font-mono text-text-muted overflow-x-auto", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary font-bold whitespace-nowrap", children: "INPUT" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 570,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "→" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 571,
        columnNumber: 11
      }, void 0),
      masterEffects.length > 0 ? masterEffects.map((fx, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(React.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `whitespace-nowrap ${fx.enabled ? "text-accent-success" : "text-accent-error"}`, children: fx.type }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 575,
          columnNumber: 17
        }, void 0),
        idx < masterEffects.length - 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "→" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 578,
          columnNumber: 52
        }, void 0)
      ] }, fx.id, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 574,
        columnNumber: 15
      }, void 0)) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "italic text-text-muted", children: "direct" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 582,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "→" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 584,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary font-bold whitespace-nowrap flex items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Volume2, { size: 12 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
          lineNumber: 586,
          columnNumber: 13
        }, void 0),
        " OUTPUT"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 585,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
      lineNumber: 569,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
      lineNumber: 568,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3", children: masterEffects.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-8 text-center text-text-muted text-sm border border-dashed border-dark-border rounded-lg", children: "No master effects. All audio passes through unchanged." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
      lineNumber: 594,
      columnNumber: 11
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DndContext, { sensors, collisionDetection: closestCenter, onDragEnd: handleDragEnd, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SortableContext, { items: masterEffects.map((fx) => fx.id), strategy: verticalListSortingStrategy, children: masterEffects.map((effect) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      SortableVisualEffect,
      {
        effect,
        onToggle: () => handleToggle(effect.id),
        onRemove: () => handleRemove(effect.id),
        onUpdateParameter: (key, value) => handleUpdateParameter(effect.id, key, value),
        onUpdateParameters: (params) => handleUpdateParameters(effect.id, params),
        onWetChange: (wet) => handleWetChange(effect.id, wet),
        onChannelSelect: (channels) => handleChannelSelect(effect.id, channels),
        numChannels
      },
      effect.id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
        lineNumber: 601,
        columnNumber: 17
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
      lineNumber: 599,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
      lineNumber: 598,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
      lineNumber: 592,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsPanel.tsx",
    lineNumber: 399,
    columnNumber: 5
  }, void 0);
});
MasterEffectsPanel.displayName = "MasterEffectsPanel";
export {
  MasterEffectsPanel
};
