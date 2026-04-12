import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aj as useMixerStore, O as useModalClose, ak as getDefaultEffectParameters } from "./main-BbV5VyEH.js";
import { E as EffectParameterEditor } from "./EffectParameterEditor-jgcbBJ--.js";
import { g as getEffectsByGroup, A as AVAILABLE_EFFECTS } from "./unifiedEffects-Cd2Pk46Y.js";
import "./vendor-tone-48TQc1H3.js";
const MAX_INSERT_EFFECTS = 4;
const ChannelInsertEffectsModal = ({
  isOpen,
  onClose,
  channelIndex
}) => {
  const insertEffects = useMixerStore((s) => {
    var _a;
    return ((_a = s.channels[channelIndex]) == null ? void 0 : _a.insertEffects) ?? [];
  });
  const addChannelInsertEffect = useMixerStore((s) => s.addChannelInsertEffect);
  const removeChannelInsertEffect = useMixerStore((s) => s.removeChannelInsertEffect);
  const updateChannelInsertEffect = useMixerStore((s) => s.updateChannelInsertEffect);
  const [selectedIndex, setSelectedIndex] = reactExports.useState(0);
  const [showBrowser, setShowBrowser] = reactExports.useState(false);
  const [searchQuery, setSearchQuery] = reactExports.useState("");
  const effectsRef = reactExports.useRef(insertEffects);
  reactExports.useEffect(() => {
    effectsRef.current = insertEffects;
  }, [insertEffects]);
  useModalClose({ isOpen, onClose, enableEnter: false });
  reactExports.useEffect(() => {
    if (selectedIndex >= insertEffects.length && insertEffects.length > 0) {
      setSelectedIndex(insertEffects.length - 1);
    }
  }, [insertEffects.length, selectedIndex]);
  const selectedEffect = insertEffects[selectedIndex];
  const handleUpdateParameter = reactExports.useCallback((key, value) => {
    const effects = effectsRef.current;
    const fx = effects[selectedIndex];
    if (!fx) return;
    updateChannelInsertEffect(channelIndex, selectedIndex, {
      parameters: { ...fx.parameters, [key]: value }
    });
  }, [channelIndex, selectedIndex, updateChannelInsertEffect]);
  const handleWetChange = reactExports.useCallback((wet) => {
    updateChannelInsertEffect(channelIndex, selectedIndex, { wet });
  }, [channelIndex, selectedIndex, updateChannelInsertEffect]);
  const handleToggle = reactExports.useCallback((index) => {
    const effects = effectsRef.current;
    const fx = effects[index];
    if (!fx) return;
    updateChannelInsertEffect(channelIndex, index, { enabled: !fx.enabled });
  }, [channelIndex, updateChannelInsertEffect]);
  const handleRemove = reactExports.useCallback((index) => {
    removeChannelInsertEffect(channelIndex, index);
    if (selectedIndex >= insertEffects.length - 1) {
      setSelectedIndex(Math.max(0, insertEffects.length - 2));
    }
  }, [channelIndex, selectedIndex, insertEffects.length, removeChannelInsertEffect]);
  const handleAddEffect = reactExports.useCallback((available) => {
    if (insertEffects.length >= MAX_INSERT_EFFECTS) return;
    const type = available.type || "Distortion";
    const params = { ...getDefaultEffectParameters(type) };
    addChannelInsertEffect(channelIndex, {
      category: available.category,
      type,
      enabled: true,
      wet: 100,
      parameters: params
    });
    setShowBrowser(false);
    setSelectedIndex(insertEffects.length);
  }, [channelIndex, insertEffects.length, addChannelInsertEffect]);
  const groupedEffects = getEffectsByGroup();
  const filteredGroups = {};
  const query = searchQuery.toLowerCase();
  for (const [group, effects] of Object.entries(groupedEffects)) {
    const filtered = query ? effects.filter((e) => e.label.toLowerCase().includes(query) || (e.type ?? "").toLowerCase().includes(query)) : effects;
    if (filtered.length > 0) filteredGroups[group] = filtered;
  }
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60", onClick: onClose, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "bg-surface-primary border border-border-primary rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden",
      onClick: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-2 border-b border-border-primary", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-medium text-text-primary", children: [
            "Channel ",
            channelIndex + 1,
            " — Insert Effects"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
            lineNumber: 114,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: [
              insertEffects.length,
              "/",
              MAX_INSERT_EFFECTS
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
              lineNumber: 118,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: onClose, className: "text-text-muted hover:text-text-primary text-lg leading-none", children: "✕" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
              lineNumber: 121,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
            lineNumber: 117,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
          lineNumber: 113,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex", style: { height: "60vh" }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-[200px] border-r border-border-primary flex flex-col", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto", children: [
              insertEffects.map((fx, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => {
                    setSelectedIndex(i);
                    setShowBrowser(false);
                  },
                  className: `w-full text-left px-3 py-2 border-b border-border-primary transition-colors ${i === selectedIndex && !showBrowser ? "bg-accent-primary/10 text-text-primary" : "text-text-muted hover:bg-surface-secondary"}`,
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                        "button",
                        {
                          onClick: (e) => {
                            e.stopPropagation();
                            handleToggle(i);
                          },
                          className: `w-2.5 h-2.5 rounded-full flex-shrink-0 border ${fx.enabled ? "bg-accent-primary border-accent-primary" : "bg-transparent border-text-muted"}`,
                          title: fx.enabled ? "Disable" : "Enable"
                        },
                        void 0,
                        false,
                        {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                          lineNumber: 143,
                          columnNumber: 21
                        },
                        void 0
                      ),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono truncate flex-1", children: fx.type }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                        lineNumber: 152,
                        columnNumber: 21
                      }, void 0),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                        "button",
                        {
                          onClick: (e) => {
                            e.stopPropagation();
                            handleRemove(i);
                          },
                          className: "text-text-muted hover:text-accent-error text-xs opacity-0 group-hover:opacity-100",
                          title: "Remove",
                          style: { opacity: i === selectedIndex && !showBrowser ? 1 : void 0 },
                          children: "✕"
                        },
                        void 0,
                        false,
                        {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                          lineNumber: 153,
                          columnNumber: 21
                        },
                        void 0
                      )
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                      lineNumber: 142,
                      columnNumber: 19
                    }, void 0),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mt-0.5 pl-[18px]", children: [
                      "wet: ",
                      Math.round(fx.wet),
                      "%"
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                      lineNumber: 162,
                      columnNumber: 19
                    }, void 0)
                  ]
                },
                fx.id ?? `fx-${i}`,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                  lineNumber: 133,
                  columnNumber: 17
                },
                void 0
              )),
              insertEffects.length === 0 && !showBrowser && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-3 py-4 text-text-muted text-xs text-center", children: [
                "No effects on this channel.",
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("br", {}, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                  lineNumber: 170,
                  columnNumber: 19
                }, void 0),
                "Click + to add one."
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                lineNumber: 168,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
              lineNumber: 131,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => setShowBrowser(true),
                disabled: insertEffects.length >= MAX_INSERT_EFFECTS,
                className: `px-3 py-2 border-t border-border-primary text-xs font-mono transition-colors ${insertEffects.length >= MAX_INSERT_EFFECTS ? "text-text-muted/30 cursor-not-allowed" : showBrowser ? "bg-accent-primary/10 text-accent-primary" : "text-text-muted hover:text-text-primary hover:bg-surface-secondary"}`,
                children: [
                  "+ Add Effect (",
                  AVAILABLE_EFFECTS.length,
                  " available)"
                ]
              },
              void 0,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                lineNumber: 175,
                columnNumber: 13
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
            lineNumber: 130,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto", children: showBrowser ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "text",
                placeholder: "Search effects...",
                value: searchQuery,
                onChange: (e) => setSearchQuery(e.target.value),
                className: "w-full px-2 py-1 mb-3 text-xs bg-surface-secondary border border-border-primary rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary",
                autoFocus: true
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                lineNumber: 194,
                columnNumber: 17
              },
              void 0
            ),
            Object.entries(filteredGroups).map(([group, effects]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1", children: group }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                lineNumber: 204,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-1", children: effects.map((fx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => handleAddEffect(fx),
                  className: "text-left px-2 py-1.5 text-xs font-mono rounded border border-border-primary text-text-muted hover:text-text-primary hover:bg-surface-secondary hover:border-accent-primary/30 transition-colors",
                  title: fx.description,
                  children: fx.label
                },
                fx.type,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                  lineNumber: 209,
                  columnNumber: 25
                },
                void 0
              )) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
                lineNumber: 207,
                columnNumber: 21
              }, void 0)
            ] }, group, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
              lineNumber: 203,
              columnNumber: 19
            }, void 0)),
            Object.keys(filteredGroups).length === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted text-xs text-center py-4", children: [
              'No effects matching "',
              searchQuery,
              '"'
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
              lineNumber: 222,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
            lineNumber: 193,
            columnNumber: 15
          }, void 0) : selectedEffect ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            EffectParameterEditor,
            {
              effect: selectedEffect,
              onUpdateParameter: handleUpdateParameter,
              onUpdateWet: handleWetChange
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
              lineNumber: 228,
              columnNumber: 15
            },
            void 0
          ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center h-full text-text-muted text-sm", children: "Click + Add Effect to get started" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
            lineNumber: 234,
            columnNumber: 15
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
            lineNumber: 191,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
          lineNumber: 128,
          columnNumber: 9
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
      lineNumber: 108,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/ChannelInsertEffectsModal.tsx",
    lineNumber: 107,
    columnNumber: 5
  }, void 0);
};
export {
  ChannelInsertEffectsModal as C
};
