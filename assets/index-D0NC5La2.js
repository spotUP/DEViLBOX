import { MasterEffectsPanel } from "./MasterEffectsPanel-BSvrJOQI.js";
import { MasterEffectsModal } from "./MasterEffectsModal-C1jgx1li.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React, e as Settings, h as ChevronDown, T as TriangleAlert, E as ExternalLink, X, j as Cpu, G as Globe, k as SlidersVertical, S as Search } from "./vendor-ui-AJ7AT9BN.js";
import { e as useInstrumentStore, O as useModalClose, P as notify, a as useUIStore, o as focusPopout } from "./main-BbV5VyEH.js";
import { E as EffectParameterEditor } from "./EffectParameterEditor-jgcbBJ--.js";
import { g as getEffectsByGroup, A as AVAILABLE_EFFECTS } from "./unifiedEffects-Cd2Pk46Y.js";
import { GUITARML_MODEL_REGISTRY, getModelCharacteristicDefaults } from "./guitarMLRegistry-CdfjBfrw.js";
import { I as INSTRUMENT_FX_PRESETS } from "./instrumentFxPresets-BJjRgkOl.js";
import { C } from "./ChannelInsertEffectsModal-kjfflOOE.js";
import "./vendor-tone-48TQc1H3.js";
import "./index-CRvWC1pf.js";
import "./DrawbarSlider-Dq9geM4g.js";
import "./SectionHeader-DHk3L-9n.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./NeuralParameterMapper-BKFi47j3.js";
const InstrumentEffectsModal = ({ isOpen, onClose }) => {
  const [editingEffect, setEditingEffect] = reactExports.useState(null);
  const [showPresetMenu, setShowPresetMenu] = reactExports.useState(false);
  const [searchQuery, setSearchQuery] = reactExports.useState("");
  const {
    instruments,
    currentInstrumentId,
    addEffectConfig,
    removeEffect,
    updateEffect,
    updateInstrument
  } = useInstrumentStore();
  const currentInstrument = instruments.find((inst) => inst.id === currentInstrumentId);
  const idCounterRef = reactExports.useRef(0);
  const editingEffectRef = reactExports.useRef(null);
  React.useLayoutEffect(() => {
    editingEffectRef.current = editingEffect;
  }, [editingEffect]);
  useModalClose({ isOpen, onClose });
  const handleLoadPreset = reactExports.useCallback((preset) => {
    if (currentInstrumentId === null) return;
    const effects2 = preset.effects.map((fx, index) => ({
      ...fx,
      id: `instrument-fx-${++idCounterRef.current}-${index}`
    }));
    updateInstrument(currentInstrumentId, { effects: effects2 });
    setShowPresetMenu(false);
    notify.success(`Applied ${preset.name} to ${currentInstrument == null ? void 0 : currentInstrument.name}`);
  }, [currentInstrumentId, updateInstrument, currentInstrument == null ? void 0 : currentInstrument.name]);
  const effects = (currentInstrument == null ? void 0 : currentInstrument.effects) || [];
  const neuralEffectCount = effects.filter((fx) => fx.category === "neural").length;
  const handleAddEffect = reactExports.useCallback((availableEffect) => {
    if (currentInstrumentId === null) return;
    if (availableEffect.category === "neural" && neuralEffectCount >= 3) {
      const proceed = window.confirm(
        "Performance Warning\n\nYou are adding a 4th neural effect. Multiple neural effects can cause high CPU usage and audio glitches.\n\nConsider using Tone.js effects or reducing the neural effect count.\n\nContinue anyway?"
      );
      if (!proceed) return;
    }
    const newEffect = {
      id: `effect-${++idCounterRef.current}`,
      category: availableEffect.category,
      type: availableEffect.type || "Distortion",
      enabled: true,
      wet: 100,
      parameters: {},
      neuralModelIndex: availableEffect.neuralModelIndex,
      neuralModelName: availableEffect.category === "neural" ? availableEffect.label : void 0
    };
    if (availableEffect.category === "neural" && availableEffect.neuralModelIndex !== void 0) {
      const model = GUITARML_MODEL_REGISTRY[availableEffect.neuralModelIndex];
      if (model == null ? void 0 : model.parameters) {
        Object.entries(model.parameters).forEach(([key, param]) => {
          if (param) newEffect.parameters[key] = param.default;
        });
        const charDefaults = getModelCharacteristicDefaults(
          model.characteristics.gain,
          model.characteristics.tone
        );
        Object.assign(newEffect.parameters, charDefaults);
      }
    }
    addEffectConfig(currentInstrumentId, newEffect);
  }, [currentInstrumentId, neuralEffectCount, addEffectConfig]);
  const handleRemoveEffect = reactExports.useCallback((effectId) => {
    if (currentInstrumentId !== null) {
      removeEffect(currentInstrumentId, effectId);
    }
  }, [currentInstrumentId, removeEffect]);
  const handleToggle = reactExports.useCallback((effectId) => {
    const effect = effects.find((fx) => fx.id === effectId);
    if (effect && currentInstrumentId !== null) {
      updateEffect(currentInstrumentId, effectId, { enabled: !effect.enabled });
    }
  }, [effects, currentInstrumentId, updateEffect]);
  const handleWetChange = reactExports.useCallback((effectId, wet) => {
    if (currentInstrumentId !== null) {
      updateEffect(currentInstrumentId, effectId, { wet });
    }
  }, [currentInstrumentId, updateEffect]);
  const handleBackdropClick = reactExports.useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);
  const effectsByGroup = getEffectsByGroup();
  const filteredEffectsByGroup = reactExports.useMemo(() => {
    if (!searchQuery.trim()) return effectsByGroup;
    const q = searchQuery.toLowerCase();
    const filtered = {};
    for (const [group, groupEffects] of Object.entries(effectsByGroup)) {
      const matched = groupEffects.filter((e) => e.label.toLowerCase().includes(q));
      if (matched.length > 0) filtered[group] = matched;
    }
    return filtered;
  }, [effectsByGroup, searchQuery]);
  if (!isOpen || !currentInstrument) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "fixed inset-0 z-[99990] flex items-center justify-center bg-black/80",
      onClick: handleBackdropClick,
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-xl shadow-2xl w-[95vw] h-[90vh] max-w-[1200px] flex flex-col overflow-hidden animate-scale-in", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-6 py-4 border-b border-dark-border bg-dark-bgSecondary", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 20, className: "text-accent-primary" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 168,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: [
              currentInstrument.name || `Instrument ${currentInstrument.id}`,
              " Effects"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 169,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted px-2 py-1 bg-dark-bg rounded", children: currentInstrument.synthType }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 172,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-accent-info px-2 py-1 bg-accent-info/10 rounded", children: [
              AVAILABLE_EFFECTS.length,
              " effects available"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 175,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative ml-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => setShowPresetMenu(!showPresetMenu),
                  className: "px-4 py-2 text-sm font-medium rounded-lg bg-dark-bgTertiary text-text-primary\n                         hover:bg-dark-bgHover transition-colors flex items-center gap-2 border border-dark-border",
                  children: [
                    "Presets ",
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 14 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                      lineNumber: 186,
                      columnNumber: 25
                    }, void 0)
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                  lineNumber: 181,
                  columnNumber: 15
                },
                void 0
              ),
              showPresetMenu && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute left-0 top-full mt-2 w-72 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-[99990] max-h-[60vh] overflow-y-auto scrollbar-modern", children: Object.entries(INSTRUMENT_FX_PRESETS.reduce((acc, preset) => {
                if (!acc[preset.category]) acc[preset.category] = [];
                acc[preset.category].push(preset);
                return acc;
              }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([category, presets]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary sticky top-0", children: category }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                  lineNumber: 200,
                  columnNumber: 23
                }, void 0),
                [...presets].sort((a, b) => a.name.localeCompare(b.name)).map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "div",
                  {
                    onClick: () => handleLoadPreset(preset),
                    className: "px-4 py-3 hover:bg-dark-bgHover cursor-pointer",
                    children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm text-text-primary", children: preset.name }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 209,
                        columnNumber: 27
                      }, void 0),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: preset.description }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 210,
                        columnNumber: 27
                      }, void 0)
                    ]
                  },
                  preset.name,
                  true,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                    lineNumber: 204,
                    columnNumber: 25
                  },
                  void 0
                ))
              ] }, category, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 199,
                columnNumber: 21
              }, void 0)) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 190,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 180,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
            lineNumber: 167,
            columnNumber: 11
          }, void 0),
          neuralEffectCount >= 3 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TriangleAlert, { size: 14, className: "text-yellow-500" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 223,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-yellow-500 font-medium", children: [
              neuralEffectCount,
              " neural effects - High CPU usage"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 224,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
            lineNumber: 222,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => {
                const already = useUIStore.getState().instrumentEffectsPoppedOut;
                if (already) {
                  focusPopout("DEViLBOX — Instrument Effects");
                } else {
                  onClose();
                  useUIStore.getState().setInstrumentEffectsPoppedOut(true);
                }
              },
              className: "p-2 rounded-lg hover:bg-dark-bgHover transition-colors text-text-muted hover:text-accent-highlight",
              title: "Pop out to separate window",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ExternalLink, { size: 20 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 244,
                columnNumber: 13
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 231,
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
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 252,
                columnNumber: 13
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 248,
              columnNumber: 11
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
          lineNumber: 166,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-hidden flex", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-1/2 border-r border-dark-border flex flex-col", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 border-b border-dark-border bg-dark-bgSecondary", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-bold text-text-primary mb-3", children: "Effect Chain" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 261,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted", children: [
                effects.length,
                " effect",
                effects.length !== 1 ? "s" : "",
                " active",
                neuralEffectCount > 0 && ` • ${neuralEffectCount} neural`
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 262,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 260,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-modern p-4", children: effects.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-8 text-center text-text-muted text-sm border border-dashed border-dark-border rounded-lg", children: "No effects. Add from the panel on the right →" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 270,
              columnNumber: 17
            }, void 0) : effects.map((effect) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "div",
              {
                className: `
                      bg-dark-bgSecondary border rounded-lg p-4 mb-3 cursor-pointer transition-all
                      ${!effect.enabled ? "opacity-60" : ""}
                      ${(editingEffect == null ? void 0 : editingEffect.id) === effect.id ? "border-accent-primary bg-accent-primary/5" : "border-dark-border hover:border-dark-borderLight"}
                    `,
                onClick: () => setEditingEffect(effect),
                children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1", children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-medium text-sm text-text-primary", children: effect.neuralModelName || effect.type }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 288,
                        columnNumber: 27
                      }, void 0),
                      effect.category === "neural" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 rounded text-[10px] text-purple-300", children: [
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cpu, { size: 10 }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                          lineNumber: 294,
                          columnNumber: 31
                        }, void 0),
                        "Neural"
                      ] }, void 0, true, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 293,
                        columnNumber: 29
                      }, void 0),
                      effect.category === "wam" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-cyan-500/20 to-teal-500/20 border border-accent-highlight/30 rounded text-[10px] text-accent-highlight", children: [
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 10 }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                          lineNumber: 300,
                          columnNumber: 31
                        }, void 0),
                        "WAM"
                      ] }, void 0, true, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 299,
                        columnNumber: 29
                      }, void 0)
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                      lineNumber: 287,
                      columnNumber: 25
                    }, void 0),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: [
                      effect.enabled ? "Active" : "Bypassed",
                      " • Wet: ",
                      effect.wet,
                      "%"
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                      lineNumber: 305,
                      columnNumber: 25
                    }, void 0)
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                    lineNumber: 286,
                    columnNumber: 23
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", onClick: (e) => e.stopPropagation(), children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "input",
                      {
                        type: "range",
                        min: "0",
                        max: "100",
                        value: effect.wet,
                        onChange: (e) => handleWetChange(effect.id, Number(e.target.value)),
                        className: "w-20 h-1 bg-dark-bg rounded-lg appearance-none cursor-pointer\n                                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3\n                                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary"
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 314,
                        columnNumber: 27
                      },
                      void 0
                    ) }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                      lineNumber: 313,
                      columnNumber: 25
                    }, void 0),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "button",
                      {
                        onClick: (e) => {
                          e.stopPropagation();
                          setEditingEffect(effect);
                        },
                        className: "p-2 rounded text-text-muted hover:text-accent-primary hover:bg-dark-bgHover transition-colors",
                        title: "Edit parameters",
                        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 16 }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                          lineNumber: 335,
                          columnNumber: 27
                        }, void 0)
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 327,
                        columnNumber: 25
                      },
                      void 0
                    ),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "button",
                      {
                        onClick: (e) => {
                          e.stopPropagation();
                          handleToggle(effect.id);
                        },
                        className: `
                            p-2 rounded transition-colors
                            ${effect.enabled ? "text-accent-success bg-accent-success/10 hover:bg-accent-success/20" : "text-text-muted hover:text-accent-error hover:bg-accent-error/10"}
                          `,
                        title: effect.enabled ? "Disable" : "Enable",
                        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [
                          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("path", { d: "M18.36 6.64a9 9 0 1 1-12.73 0" }, void 0, false, {
                            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                            lineNumber: 354,
                            columnNumber: 29
                          }, void 0),
                          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("line", { x1: "12", y1: "2", x2: "12", y2: "12" }, void 0, false, {
                            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                            lineNumber: 355,
                            columnNumber: 29
                          }, void 0)
                        ] }, void 0, true, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                          lineNumber: 353,
                          columnNumber: 27
                        }, void 0)
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 339,
                        columnNumber: 25
                      },
                      void 0
                    ),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "button",
                      {
                        onClick: (e) => {
                          e.stopPropagation();
                          handleRemoveEffect(effect.id);
                        },
                        className: "p-2 rounded text-text-muted hover:text-accent-error hover:bg-accent-error/10 transition-colors",
                        title: "Remove effect",
                        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 16 }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                          lineNumber: 368,
                          columnNumber: 27
                        }, void 0)
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 360,
                        columnNumber: 25
                      },
                      void 0
                    )
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                    lineNumber: 311,
                    columnNumber: 23
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                  lineNumber: 284,
                  columnNumber: 21
                }, void 0)
              },
              effect.id,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 275,
                columnNumber: 19
              },
              void 0
            )) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 268,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
            lineNumber: 259,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-1/2 flex flex-col", children: editingEffect ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 border-b border-dark-border bg-dark-bgSecondary flex items-center justify-between", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-bold text-text-primary flex items-center gap-2", children: [
                  editingEffect.neuralModelName || editingEffect.type,
                  " Parameters",
                  editingEffect.category === "neural" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 rounded text-[10px] text-purple-300", children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cpu, { size: 10 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                      lineNumber: 388,
                      columnNumber: 27
                    }, void 0),
                    "Neural"
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                    lineNumber: 387,
                    columnNumber: 25
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                  lineNumber: 384,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted", children: "Adjust effect settings" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                  lineNumber: 393,
                  columnNumber: 21
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 383,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => setEditingEffect(null),
                  className: "text-xs text-text-muted hover:text-accent-primary transition-colors",
                  children: "Back to Add"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                  lineNumber: 395,
                  columnNumber: 19
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 382,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-modern p-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              EffectParameterEditor,
              {
                effect: editingEffect,
                onUpdateParameter: (key, value) => {
                  const current = editingEffectRef.current;
                  if (!current) return;
                  const updates = { parameters: { ...current.parameters, [key]: value } };
                  if (currentInstrumentId !== null) {
                    updateEffect(currentInstrumentId, current.id, updates);
                  }
                  setEditingEffect({ ...current, ...updates });
                },
                onUpdateWet: (wet) => {
                  const current = editingEffectRef.current;
                  if (!current || currentInstrumentId === null) return;
                  updateEffect(currentInstrumentId, current.id, { wet });
                  setEditingEffect({ ...current, wet });
                }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 403,
                columnNumber: 19
              },
              void 0
            ) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 402,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
            lineNumber: 381,
            columnNumber: 15
          }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 border-b border-dark-border bg-dark-bgSecondary space-y-3", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-bold text-text-primary", children: "Add Effect" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                  lineNumber: 427,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted", children: [
                  "All ",
                  AVAILABLE_EFFECTS.length,
                  " effects available"
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                  lineNumber: 428,
                  columnNumber: 21
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 426,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Search, { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                  lineNumber: 433,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "input",
                  {
                    type: "text",
                    placeholder: "Search effects...",
                    value: searchQuery,
                    onChange: (e) => setSearchQuery(e.target.value),
                    className: "w-full pl-9 pr-8 py-2 text-sm bg-dark-bg border border-dark-border rounded-lg text-text-primary\n                               placeholder-text-muted focus:outline-none focus:border-accent-primary transition-colors"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                    lineNumber: 434,
                    columnNumber: 21
                  },
                  void 0
                ),
                searchQuery && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: () => setSearchQuery(""),
                    className: "absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors",
                    children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                      lineNumber: 447,
                      columnNumber: 25
                    }, void 0)
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                    lineNumber: 443,
                    columnNumber: 23
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 432,
                columnNumber: 19
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 425,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-modern p-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
              Object.keys(filteredEffectsByGroup).length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-8 text-center text-text-muted text-sm", children: [
                'No effects matching "',
                searchQuery,
                '"'
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 455,
                columnNumber: 23
              }, void 0) : null,
              Object.entries(filteredEffectsByGroup).map(([group, groupEffects]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h4", { className: "text-xs text-text-muted font-medium uppercase tracking-wide mb-2", children: group }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                  lineNumber: 461,
                  columnNumber: 25
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: groupEffects.map((effect) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: () => handleAddEffect(effect),
                    className: "px-3 py-2 text-sm rounded-lg border border-dark-border bg-dark-bgSecondary\n                                       hover:bg-accent-primary hover:text-text-primary hover:border-accent-primary\n                                       transition-colors text-left flex items-center justify-between gap-2",
                    children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate", children: effect.label }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 473,
                        columnNumber: 31
                      }, void 0),
                      effect.category === "neural" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cpu, { size: 12, className: "flex-shrink-0 opacity-60" }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 476,
                        columnNumber: 33
                      }, void 0),
                      effect.category === "wam" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 12, className: "flex-shrink-0 opacity-60" }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                        lineNumber: 479,
                        columnNumber: 33
                      }, void 0)
                    ]
                  },
                  effect.label,
                  true,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                    lineNumber: 466,
                    columnNumber: 29
                  },
                  void 0
                )) }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                  lineNumber: 464,
                  columnNumber: 25
                }, void 0)
              ] }, group, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
                lineNumber: 460,
                columnNumber: 23
              }, void 0))
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 453,
              columnNumber: 19
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
              lineNumber: 452,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
            lineNumber: 424,
            columnNumber: 15
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
            lineNumber: 379,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
          lineNumber: 257,
          columnNumber: 9
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
        lineNumber: 164,
        columnNumber: 7
      }, void 0)
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/InstrumentEffectsModal.tsx",
      lineNumber: 160,
      columnNumber: 5
    },
    void 0
  );
};
export {
  C as ChannelInsertEffectsModal,
  EffectParameterEditor,
  InstrumentEffectsModal,
  MasterEffectsModal,
  MasterEffectsPanel
};
