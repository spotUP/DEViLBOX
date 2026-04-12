import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, e as Settings, h as ChevronDown, X, g as Save, T as TriangleAlert, E as ExternalLink, R as React, V as Volume2, P as Plus, k as SlidersVertical, S as Search, j as Cpu, G as Globe } from "./vendor-ui-AJ7AT9BN.js";
import { as as useAudioStore, R as useTrackerStore, aD as useSensors, aE as useSensor, aF as sortableKeyboardCoordinates, aG as KeyboardSensor, aH as PointerSensor, ak as getDefaultEffectParameters, aC as MASTER_FX_PRESETS, a as useUIStore, o as focusPopout, aI as DndContext, aJ as closestCenter, aK as SortableContext, aL as verticalListSortingStrategy, aM as useSortable, aN as CSS } from "./main-BbV5VyEH.js";
import { E as EffectParameterEditor } from "./EffectParameterEditor-jgcbBJ--.js";
import { E as ENCLOSURE_COLORS, D as DEFAULT_ENCLOSURE } from "./index-CRvWC1pf.js";
import { g as getEffectsByGroup } from "./unifiedEffects-Cd2Pk46Y.js";
import { GUITARML_MODEL_REGISTRY, getModelCharacteristicDefaults } from "./guitarMLRegistry-CdfjBfrw.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./NeuralParameterMapper-BKFi47j3.js";
import "./DrawbarSlider-Dq9geM4g.js";
import "./SectionHeader-DHk3L-9n.js";
const USER_MASTER_FX_PRESETS_KEY = "master-fx-user-presets";
const MasterEffectsModal = ({ isOpen, onClose }) => {
  const [showPresetMenu, setShowPresetMenu] = reactExports.useState(false);
  const [showSaveDialog, setShowSaveDialog] = reactExports.useState(false);
  const [presetName, setPresetName] = reactExports.useState("");
  const [editingEffectId, setEditingEffectId] = reactExports.useState(null);
  const [previewEffectId, setPreviewEffectId] = reactExports.useState(null);
  const [searchQuery, setSearchQuery] = reactExports.useState("");
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
  const handleChannelSelect = reactExports.useCallback((effectId, channels) => {
    updateMasterEffect(effectId, { selectedChannels: channels });
  }, [updateMasterEffect]);
  const editingEffect = reactExports.useMemo(
    () => masterEffects.find((e) => e.id === editingEffectId) ?? null,
    [masterEffects, editingEffectId]
  );
  const editingEffectRef = reactExports.useRef(editingEffect);
  reactExports.useLayoutEffect(() => {
    editingEffectRef.current = editingEffect;
  }, [editingEffect]);
  reactExports.useEffect(() => {
    var _a;
    if (isOpen) {
      setEditingEffectId(((_a = masterEffects[0]) == null ? void 0 : _a.id) ?? null);
    }
  }, [isOpen]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
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
  const handleSavePreset = reactExports.useCallback(() => {
    if (!presetName.trim()) return;
    const userPresets2 = getUserPresets();
    userPresets2.push({
      name: presetName.trim(),
      effects: masterEffects.map((fx) => ({ ...fx }))
    });
    localStorage.setItem(USER_MASTER_FX_PRESETS_KEY, JSON.stringify(userPresets2));
    setPresetName("");
    setShowSaveDialog(false);
  }, [presetName, masterEffects, getUserPresets]);
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
  }, [getUserPresets]);
  const neuralEffectCount = masterEffects.filter((fx) => fx.category === "neural").length;
  const handlePreviewEffect = reactExports.useCallback((availableEffect) => {
    var _a;
    if (previewEffectId) {
      removeMasterEffect(previewEffectId);
    }
    if (availableEffect.category === "neural" && neuralEffectCount >= 3) {
      const proceed = confirm(
        "Performance Warning\n\nAdding a 4th neural effect. Multiple neural effects can cause high CPU usage and audio glitches.\n\nContinue anyway?"
      );
      if (!proceed) {
        setPreviewEffectId(null);
        setEditingEffectId(null);
        return;
      }
    }
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
    addMasterEffectConfig({
      category: availableEffect.category,
      type,
      enabled: true,
      wet: 100,
      parameters: params,
      neuralModelIndex: availableEffect.neuralModelIndex,
      neuralModelName: availableEffect.category === "neural" ? availableEffect.label : void 0
    });
    const added = useAudioStore.getState().masterEffects;
    const newId = ((_a = added[added.length - 1]) == null ? void 0 : _a.id) ?? null;
    setPreviewEffectId(newId);
    setEditingEffectId(newId);
  }, [previewEffectId, neuralEffectCount, addMasterEffectConfig, removeMasterEffect]);
  const handleConfirmAdd = reactExports.useCallback(() => {
    if (!previewEffectId) return;
    setPreviewEffectId(null);
  }, [previewEffectId]);
  const handleCancelPreview = reactExports.useCallback(() => {
    if (previewEffectId) {
      removeMasterEffect(previewEffectId);
    }
    setPreviewEffectId(null);
    setEditingEffectId(null);
  }, [previewEffectId, removeMasterEffect]);
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
  const handleToggle = (effectId) => {
    const effect = masterEffects.find((fx) => fx.id === effectId);
    if (effect) {
      updateMasterEffect(effectId, { enabled: !effect.enabled });
    }
  };
  const handleWetChange = (effectId, wet) => {
    updateMasterEffect(effectId, { wet });
  };
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };
  const userPresets = getUserPresets();
  const presetsByCategory = MASTER_FX_PRESETS.reduce((acc, preset) => {
    if (!acc[preset.category]) {
      acc[preset.category] = [];
    }
    acc[preset.category].push(preset);
    return acc;
  }, {});
  const sortedCategories = Object.keys(presetsByCategory).sort();
  const effectsByGroup = getEffectsByGroup();
  const filteredEffectsByGroup = reactExports.useMemo(() => {
    if (!searchQuery.trim()) return effectsByGroup;
    const q = searchQuery.toLowerCase();
    const filtered = {};
    for (const [group, effects] of Object.entries(effectsByGroup)) {
      const matched = effects.filter((e) => e.label.toLowerCase().includes(q));
      if (matched.length > 0) filtered[group] = matched;
    }
    return filtered;
  }, [effectsByGroup, searchQuery]);
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "fixed inset-0 z-[99990] flex items-center justify-center bg-black/80",
      onClick: handleBackdropClick,
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-xl shadow-2xl w-[95vw] h-[90vh] max-w-[1400px] flex flex-col overflow-hidden animate-scale-in", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-6 py-4 border-b border-dark-border bg-dark-bgSecondary", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 20, className: "text-accent-primary" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 302,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "Master Effects" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 303,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted px-2 py-1 bg-dark-bg rounded", children: [
                masterEffects.length,
                " FX"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 304,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 301,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => setShowPresetMenu(!showPresetMenu),
                  className: "px-4 py-2 text-sm font-medium rounded-lg bg-dark-bgTertiary text-text-primary\n                         hover:bg-dark-bgHover transition-colors flex items-center gap-2",
                  children: [
                    "Presets ",
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 14 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                      lineNumber: 316,
                      columnNumber: 25
                    }, void 0)
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 311,
                  columnNumber: 15
                },
                void 0
              ),
              showPresetMenu && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute left-0 top-full mt-2 w-72 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-[99990] max-h-[60vh] overflow-y-auto scrollbar-modern", children: [
                userPresets.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary sticky top-0", children: "User Presets" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                    lineNumber: 324,
                    columnNumber: 23
                  }, void 0),
                  userPresets.map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "div",
                    {
                      className: "flex items-center justify-between px-4 py-3 hover:bg-dark-bgHover cursor-pointer group",
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
                            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                            lineNumber: 332,
                            columnNumber: 27
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
                            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
                              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                              lineNumber: 346,
                              columnNumber: 29
                            }, void 0)
                          },
                          void 0,
                          false,
                          {
                            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                            lineNumber: 338,
                            columnNumber: 27
                          },
                          void 0
                        )
                      ]
                    },
                    preset.name,
                    true,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                      lineNumber: 328,
                      columnNumber: 25
                    },
                    void 0
                  )),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                    lineNumber: 350,
                    columnNumber: 23
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 323,
                  columnNumber: 21
                }, void 0),
                sortedCategories.map((category) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary sticky top-0", children: category }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                    lineNumber: 357,
                    columnNumber: 23
                  }, void 0),
                  [...presetsByCategory[category]].sort((a, b) => a.name.localeCompare(b.name)).map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "div",
                    {
                      onClick: () => handleLoadPreset(preset),
                      className: "px-4 py-3 hover:bg-dark-bgHover cursor-pointer",
                      children: [
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm text-text-primary", children: preset.name }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                          lineNumber: 366,
                          columnNumber: 27
                        }, void 0),
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: preset.description }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                          lineNumber: 367,
                          columnNumber: 27
                        }, void 0)
                      ]
                    },
                    preset.name,
                    true,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                      lineNumber: 361,
                      columnNumber: 25
                    },
                    void 0
                  ))
                ] }, category, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 356,
                  columnNumber: 21
                }, void 0))
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 320,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 310,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => setShowSaveDialog(true),
                className: "p-2 rounded-lg text-text-muted hover:text-accent-primary hover:bg-dark-bgHover transition-colors",
                title: "Save current effects as preset",
                children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Save, { size: 18 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 382,
                  columnNumber: 15
                }, void 0)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 377,
                columnNumber: 13
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 300,
            columnNumber: 11
          }, void 0),
          neuralEffectCount >= 3 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TriangleAlert, { size: 14, className: "text-yellow-500" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 389,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-yellow-500 font-medium", children: [
              neuralEffectCount,
              " neural effects - High CPU usage"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 390,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 388,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => {
                const already = useUIStore.getState().masterEffectsPoppedOut;
                if (already) {
                  focusPopout("DEViLBOX — Master Effects");
                } else {
                  onClose();
                  useUIStore.getState().setMasterEffectsPoppedOut(true);
                }
              },
              className: "p-2 rounded-lg hover:bg-dark-bgHover transition-colors text-text-muted hover:text-accent-highlight",
              title: "Pop out to separate window",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ExternalLink, { size: 20 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 410,
                columnNumber: 13
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 397,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: onClose,
              className: "p-2 rounded-lg hover:bg-dark-bgHover transition-colors text-text-muted hover:text-text-primary",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 24 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 418,
                columnNumber: 13
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 414,
              columnNumber: 11
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
          lineNumber: 299,
          columnNumber: 9
        }, void 0),
        showSaveDialog && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-6 py-4 bg-dark-bgTertiary border-b border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
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
              className: "flex-1 px-4 py-2 text-sm bg-dark-bg border border-dark-border rounded-lg text-text-primary\n                         placeholder-text-muted focus:outline-none focus:border-accent-primary",
              autoFocus: true
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 426,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: handleSavePreset,
              className: "px-4 py-2 text-sm font-medium rounded-lg bg-accent-primary text-text-primary hover:bg-accent-primaryHover transition-colors",
              children: "Save"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 439,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setShowSaveDialog(false),
              className: "px-4 py-2 text-sm font-medium rounded-lg bg-dark-bg text-text-muted hover:text-text-primary border border-dark-border hover:border-dark-borderLight transition-colors",
              children: "Cancel"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 445,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
          lineNumber: 425,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
          lineNumber: 424,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-6 py-3 bg-dark-bgSecondary border-b border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 text-sm font-mono text-text-muted overflow-x-auto", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary font-bold whitespace-nowrap", children: "INPUT" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 458,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "→" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 459,
            columnNumber: 13
          }, void 0),
          masterEffects.length > 0 ? masterEffects.map((fx, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(React.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `whitespace-nowrap ${fx.enabled ? "text-accent-success" : "text-accent-error"}`, children: fx.type }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 463,
              columnNumber: 19
            }, void 0),
            idx < masterEffects.length - 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "→" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 466,
              columnNumber: 54
            }, void 0)
          ] }, fx.id, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 462,
            columnNumber: 17
          }, void 0)) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "italic text-text-muted", children: "direct" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 470,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "→" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 472,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary font-bold whitespace-nowrap flex items-center gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Volume2, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 474,
              columnNumber: 15
            }, void 0),
            " OUTPUT"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 473,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
          lineNumber: 457,
          columnNumber: 11
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
          lineNumber: 456,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-hidden flex", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-[30%] border-r border-dark-border flex flex-col", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 border-b border-dark-border bg-dark-bgSecondary", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-bold text-text-primary mb-1", children: "Effect Chain" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 484,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted", children: "Drag to reorder. Click to edit." }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 485,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 483,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-modern p-3", children: masterEffects.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-6 text-center text-text-muted text-xs border border-dashed border-dark-border rounded-lg", children: "No effects yet. Add from the browser panel." }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 490,
              columnNumber: 17
            }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DndContext, { sensors, collisionDetection: closestCenter, onDragEnd: handleDragEnd, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SortableContext, { items: masterEffects.map((fx) => fx.id), strategy: verticalListSortingStrategy, children: masterEffects.map((effect) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              SortableEffectItem,
              {
                effect,
                isSelected: editingEffectId === effect.id,
                onSelect: () => {
                  if (previewEffectId) {
                    removeMasterEffect(previewEffectId);
                    setPreviewEffectId(null);
                  }
                  setEditingEffectId(effect.id);
                },
                onToggle: () => handleToggle(effect.id),
                onRemove: () => removeMasterEffect(effect.id),
                onWetChange: (wet) => handleWetChange(effect.id, wet),
                onChannelSelect: (channels) => handleChannelSelect(effect.id, channels),
                numChannels
              },
              effect.id,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 497,
                columnNumber: 23
              },
              void 0
            )) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 495,
              columnNumber: 19
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 494,
              columnNumber: 17
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 488,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 482,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-1/2 border-r border-dark-border flex flex-col", children: editingEffect ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 border-b border-dark-border bg-dark-bgSecondary flex items-center justify-between", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-bold text-text-primary", children: [
                  editingEffect.neuralModelName || editingEffect.type,
                  " Parameters"
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 524,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted", children: previewEffectId === editingEffectId ? "Preview — tweak knobs to hear changes" : "Adjust effect settings" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 525,
                  columnNumber: 21
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 523,
                columnNumber: 19
              }, void 0),
              previewEffectId === editingEffectId && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: handleCancelPreview,
                    className: "px-3 py-1.5 text-xs font-medium rounded-lg border border-dark-border\n                                 text-text-muted hover:text-text-primary hover:border-dark-borderLight transition-colors",
                    children: "Cancel"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                    lineNumber: 531,
                    columnNumber: 23
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: handleConfirmAdd,
                    className: "flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg\n                                 bg-accent-primary text-text-primary hover:bg-accent-primaryHover transition-colors",
                    children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Plus, { size: 12 }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                        lineNumber: 543,
                        columnNumber: 25
                      }, void 0),
                      "Add to Chain"
                    ]
                  },
                  void 0,
                  true,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                    lineNumber: 538,
                    columnNumber: 23
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 530,
                columnNumber: 21
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 522,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-modern p-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              EffectParameterEditor,
              {
                effect: editingEffect,
                onUpdateParameter: (key, value) => {
                  if (!editingEffectId) return;
                  const current = editingEffectRef.current;
                  if (!current) return;
                  updateMasterEffect(editingEffectId, {
                    parameters: { ...current.parameters, [key]: value }
                  });
                },
                onUpdateWet: (wet) => {
                  if (editingEffectId) updateMasterEffect(editingEffectId, { wet });
                }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 550,
                columnNumber: 19
              },
              void 0
            ) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 549,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 521,
            columnNumber: 15
          }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center text-text-muted", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center space-y-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 32, className: "mx-auto opacity-30" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 569,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm", children: [
              "Select an effect from the chain",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("br", {}, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 570,
                columnNumber: 73
              }, void 0),
              "or click one in the browser to preview"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 570,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 568,
            columnNumber: 17
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 567,
            columnNumber: 15
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 519,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-[20%] flex flex-col", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 border-b border-dark-border bg-dark-bgSecondary space-y-3", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-bold text-text-primary", children: "Effect Browser" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 580,
                  columnNumber: 17
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted", children: "Click to preview" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 581,
                  columnNumber: 17
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 579,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Search, { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 584,
                  columnNumber: 17
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "input",
                  {
                    type: "text",
                    placeholder: "Search effects...",
                    value: searchQuery,
                    onChange: (e) => setSearchQuery(e.target.value),
                    className: "w-full pl-9 pr-8 py-2 text-sm bg-dark-bg border border-dark-border rounded-lg text-text-primary\n                           placeholder-text-muted focus:outline-none focus:border-accent-primary transition-colors"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                    lineNumber: 585,
                    columnNumber: 17
                  },
                  void 0
                ),
                searchQuery && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: () => setSearchQuery(""),
                    className: "absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors",
                    children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                      lineNumber: 598,
                      columnNumber: 21
                    }, void 0)
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                    lineNumber: 594,
                    columnNumber: 19
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 583,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 578,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-modern p-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
              Object.keys(filteredEffectsByGroup).length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-6 text-center text-text-muted text-xs", children: [
                'No effects matching "',
                searchQuery,
                '"'
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 606,
                columnNumber: 19
              }, void 0) : null,
              Object.entries(filteredEffectsByGroup).map(([group, groupEffects]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h4", { className: "text-xs text-text-muted font-medium uppercase tracking-wide mb-1.5", children: group }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 612,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1", children: groupEffects.map((effect) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: () => handlePreviewEffect(effect),
                    className: "w-full px-3 py-2 text-sm rounded-lg border border-dark-border bg-dark-bgSecondary\n                                   hover:bg-accent-primary hover:text-text-primary hover:border-accent-primary\n                                   transition-colors text-left flex items-center justify-between gap-2",
                    children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate", children: effect.label }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                        lineNumber: 622,
                        columnNumber: 27
                      }, void 0),
                      effect.category === "neural" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cpu, { size: 12, className: "flex-shrink-0 opacity-60" }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                        lineNumber: 624,
                        columnNumber: 29
                      }, void 0),
                      effect.category === "wam" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 12, className: "flex-shrink-0 opacity-60" }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                        lineNumber: 627,
                        columnNumber: 29
                      }, void 0)
                    ]
                  },
                  effect.label,
                  true,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                    lineNumber: 615,
                    columnNumber: 25
                  },
                  void 0
                )) }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 613,
                  columnNumber: 21
                }, void 0)
              ] }, group, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 611,
                columnNumber: 19
              }, void 0))
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 604,
              columnNumber: 15
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 603,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 577,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
          lineNumber: 480,
          columnNumber: 9
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
        lineNumber: 297,
        columnNumber: 7
      }, void 0)
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
      lineNumber: 293,
      columnNumber: 5
    },
    void 0
  );
};
function SortableEffectItem({ effect, isSelected, onSelect, onToggle, onRemove, onWetChange, onChannelSelect, numChannels }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: effect.id
  });
  const enc = effect.category === "neural" ? { bg: "#1a0a20", bgEnd: "#100618", accent: "#a855f7", border: "#281430" } : ENCLOSURE_COLORS[effect.type] || DEFAULT_ENCLOSURE;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : effect.enabled ? 1 : 0.55,
    background: `linear-gradient(135deg, ${enc.bg} 0%, ${enc.bgEnd} 100%)`,
    border: isSelected ? `2px solid ${enc.accent}` : `2px solid ${enc.border}`,
    boxShadow: isDragging ? `0 8px 24px rgba(0,0,0,0.5), 0 0 0 2px ${enc.accent}` : isSelected ? `0 4px 12px rgba(0,0,0,0.4), 0 0 12px ${enc.accent}20` : "0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)"
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: setNodeRef,
      style,
      className: "rounded-xl p-4 mb-3 cursor-pointer transition-all select-none",
      onClick: onSelect,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              ...attributes,
              ...listeners,
              className: "cursor-grab active:cursor-grabbing p-1 opacity-30 hover:opacity-60 transition-opacity",
              style: { color: enc.accent },
              title: "Drag to reorder",
              onClick: (e) => e.stopPropagation(),
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "currentColor", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "4", cy: "4", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 696,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "4", cy: "8", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 697,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "4", cy: "12", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 698,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "10", cy: "4", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 699,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "10", cy: "8", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 700,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "10", cy: "12", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 701,
                  columnNumber: 13
                }, this)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 695,
                columnNumber: 11
              }, this)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 687,
              columnNumber: 9
            },
            this
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              style: {
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: effect.enabled ? "#10b981" : `${enc.bg}`,
                boxShadow: effect.enabled ? "0 0 4px 1px #10b98180, 0 0 10px 3px #10b98125" : "inset 0 1px 2px rgba(0,0,0,0.5)",
                transition: "all 0.3s ease",
                flexShrink: 0
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 706,
              columnNumber: 9
            },
            this
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-black text-sm text-white/90 tracking-wide truncate", children: effect.neuralModelName || effect.type }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 723,
                columnNumber: 13
              }, this),
              effect.category === "neural" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "span",
                {
                  className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                  style: {
                    background: `${enc.accent}15`,
                    border: `1px solid ${enc.accent}30`,
                    color: `${enc.accent}cc`
                  },
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cpu, { size: 8 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                      lineNumber: 734,
                      columnNumber: 17
                    }, this),
                    "Neural"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 727,
                  columnNumber: 15
                },
                this
              ),
              effect.category === "wam" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "span",
                {
                  className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                  style: {
                    background: `${enc.accent}15`,
                    border: `1px solid ${enc.accent}30`,
                    color: `${enc.accent}cc`
                  },
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 8 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                      lineNumber: 746,
                      columnNumber: 17
                    }, this),
                    "WAM"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 739,
                  columnNumber: 15
                },
                this
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 722,
              columnNumber: 11
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[11px] mt-0.5", style: { color: `${enc.accent}80` }, children: [
              effect.enabled ? "Active" : "Bypassed",
              " | Mix: ",
              effect.wet,
              "%"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 751,
              columnNumber: 11
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 721,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: "0",
                max: "100",
                value: effect.wet,
                onChange: (e) => onWetChange(Number(e.target.value)),
                className: "w-16 h-1 rounded-lg appearance-none cursor-pointer\n                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5\n                     [&::-webkit-slider-thumb]:rounded-full",
                style: {
                  background: `linear-gradient(90deg, ${enc.accent}60 ${effect.wet}%, rgba(255,255,255,0.08) ${effect.wet}%)`,
                  // @ts-expect-error -- webkit slider thumb color via CSS variable
                  "--thumb-color": enc.accent
                }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 759,
                columnNumber: 11
              },
              this
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  onToggle();
                },
                className: "p-1.5 rounded-lg transition-colors hover:bg-white/5",
                style: { color: effect.enabled ? "#10b981" : "rgba(255,255,255,0.2)" },
                title: effect.enabled ? "Disable" : "Enable",
                children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("path", { d: "M18.36 6.64a9 9 0 1 1-12.73 0" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                    lineNumber: 786,
                    columnNumber: 15
                  }, this),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("line", { x1: "12", y1: "2", x2: "12", y2: "12" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                    lineNumber: 787,
                    columnNumber: 15
                  }, this)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 785,
                  columnNumber: 13
                }, this)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 776,
                columnNumber: 11
              },
              this
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  onRemove();
                },
                className: "p-1.5 rounded-lg transition-colors hover:bg-white/5",
                style: { color: "rgba(255,80,80,0.4)" },
                title: "Remove effect",
                children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                  lineNumber: 801,
                  columnNumber: 13
                }, this)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 792,
                columnNumber: 11
              },
              this
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 757,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
          lineNumber: 685,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 pt-2 border-t", style: { borderColor: `${enc.border}` }, onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5 mb-1.5", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-semibold uppercase tracking-wider", style: { color: `${enc.accent}80` }, children: "Route" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 809,
              columnNumber: 11
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => onChannelSelect(void 0),
                className: `px-1.5 py-0.5 text-[9px] font-bold rounded transition-colors ${!Array.isArray(effect.selectedChannels) ? "text-white/90 border" : "text-white/30 hover:text-white/50 border border-transparent"}`,
                style: !Array.isArray(effect.selectedChannels) ? { background: `${enc.accent}30`, borderColor: `${enc.accent}60` } : {},
                children: "ALL"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 810,
                columnNumber: 11
              },
              this
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] ml-auto", style: { color: `${enc.accent}60` }, children: Array.isArray(effect.selectedChannels) && effect.selectedChannels.length === 0 ? "No channels" : Array.isArray(effect.selectedChannels) ? `${effect.selectedChannels.length}/${numChannels} ch` : "All channels" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
              lineNumber: 821,
              columnNumber: 11
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 808,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-1", children: Array.from({ length: numChannels }, (_, i) => {
            const sel = effect.selectedChannels;
            const isOn = !Array.isArray(sel) || sel.includes(i);
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => {
                  const current = new Set(sel ?? []);
                  if (current.has(i)) {
                    current.delete(i);
                    onChannelSelect(current.size > 0 ? Array.from(current).sort((a, b) => a - b) : void 0);
                  } else {
                    current.add(i);
                    onChannelSelect(Array.from(current).sort((a, b) => a - b));
                  }
                },
                className: "w-5 h-5 text-[9px] font-bold rounded transition-colors",
                style: {
                  background: isOn && Array.isArray(sel) ? `${enc.accent}30` : "rgba(255,255,255,0.04)",
                  border: isOn && Array.isArray(sel) ? `1px solid ${enc.accent}60` : "1px solid rgba(255,255,255,0.08)",
                  color: isOn ? Array.isArray(sel) ? `${enc.accent}` : "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)"
                },
                title: `Channel ${i + 1}`,
                children: i + 1
              },
              i,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
                lineNumber: 834,
                columnNumber: 15
              },
              this
            );
          }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
            lineNumber: 829,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
          lineNumber: 807,
          columnNumber: 7
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/MasterEffectsModal.tsx",
      lineNumber: 679,
      columnNumber: 5
    },
    this
  );
}
export {
  MasterEffectsModal
};
