import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, X, C as Check, S as Search, b as ChevronRight, d as ChevronLeft, e as Settings, f as Sparkles, M as Music2, P as Plus, g as Save, E as ExternalLink, K as Keyboard, h as ChevronDown, i as ChevronUp, R as React, L as LucideIcons } from "./vendor-ui-AJ7AT9BN.js";
import { d as useResponsive, e as useInstrumentStore, A as ALL_SYNTH_TYPES, S as SYNTH_INFO, T as ToneEngine, f as getSynthInfo, I as InstrumentList, a as useUIStore, C as CategorizedSynthSelector, D as DEFAULT_FURNACE, h as DEFAULT_BUZZMACHINE, k as getFirstPresetForSynthType, l as DEFAULT_FILTER, m as DEFAULT_ENVELOPE, n as DEFAULT_OSCILLATOR, o as focusPopout, p as DEFAULT_TB303, q as DEFAULT_GRANULAR, r as DEFAULT_DRUMKIT, t as DEFAULT_SAM, v as DEFAULT_V2, w as DEFAULT_SYNARE, x as DEFAULT_SPACE_LASER, y as DEFAULT_DUB_SIREN, z as DEFAULT_WOBBLE_BASS, B as DEFAULT_FORMANT_SYNTH, E as DEFAULT_STRING_MACHINE, F as DEFAULT_ORGAN, G as DEFAULT_POLYSYNTH, H as DEFAULT_SUPERSAW, J as DEFAULT_WAVETABLE, K as DEFAULT_PWM_SYNTH, L as DEFAULT_CHIP_SYNTH, N as DEFAULT_DRUM_MACHINE } from "./main-BbV5VyEH.js";
import { UnifiedInstrumentEditor } from "./UnifiedInstrumentEditor-CFDlFTgF.js";
import "./FurnaceControls-B82Xx7ke.js";
import { TestKeyboard } from "./TestKeyboard-B6REGXyS.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { InstrumentEffectsPanel } from "./InstrumentEffectsPanel-CG149pLS.js";
import { h as hasBuiltInInput, a as hasHardwareUI } from "./HardwareUIWrapper-GDcuDfC2.js";
import { S as SavePresetDialog } from "./SavePresetDialog-BWnDChMa.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./VisualizerFrame-7GhRHAT_.js";
import "./InstrumentOscilloscope-CE7eIp2-.js";
import "./useInstrumentColors-D5iKqwYD.js";
import "./SectionHeader-DHk3L-9n.js";
import "./EnvelopeVisualization-Bz0hAbvA.js";
import "./GTVisualMapping-BkrLaqE6.js";
import "./DOMSynthPanel-C5W_v5Xk.js";
import "./WavetableEditor-wq3DMlO8.js";
import "./WaveformThumbnail-CebZPsAz.js";
import "./SpectralFilter-Dxe-YniK.js";
import "./HarmonicBarsCanvas-tCyue1dW.js";
import "./index-CRvWC1pf.js";
import "./unifiedEffects-Cd2Pk46Y.js";
import "./guitarMLRegistry-CdfjBfrw.js";
function isFurnaceType(synthType) {
  return synthType === "Furnace" || synthType.startsWith("Furnace");
}
function isBuzzmachineType(synthType) {
  return synthType === "Buzzmachine" || synthType.startsWith("Buzz");
}
const SynthIconDisplay = ({ iconName, size }) => {
  const Icon = LucideIcons[iconName] || Music2;
  return React.createElement(Icon, { size });
};
const EditInstrumentModal = ({
  isOpen,
  onClose,
  createMode = false
}) => {
  const { isMobile } = useResponsive();
  const instruments = useInstrumentStore((state) => state.instruments);
  const currentInstrumentId = useInstrumentStore((state) => state.currentInstrumentId);
  const createInstrument = useInstrumentStore((state) => state.createInstrument);
  const updateInstrument = useInstrumentStore((state) => state.updateInstrument);
  const setPreviewInstrument = useInstrumentStore((state) => state.setPreviewInstrument);
  const setCurrentInstrument = useInstrumentStore((state) => state.setCurrentInstrument);
  const currentInstrument = instruments.find((inst) => inst.id === currentInstrumentId) || null;
  const [isCreating, setIsCreating] = reactExports.useState(createMode);
  const [selectedSynthType, setSelectedSynthType] = reactExports.useState("Sampler");
  const [synthSearch, setSynthSearch] = reactExports.useState("");
  const [instrumentName, setInstrumentName] = reactExports.useState("Sampler");
  const [tempInstrument, setTempInstrument] = reactExports.useState(null);
  const [activeTab, setActiveTab] = reactExports.useState("sound");
  const [showKeyboard, setShowKeyboard] = reactExports.useState(true);
  const [showSaveDialog, setShowSaveDialog] = reactExports.useState(false);
  const [showSynthBrowser, setShowSynthBrowser] = reactExports.useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = reactExports.useState(() => {
    try {
      const saved = localStorage.getItem("devilbox-editor-left-panel-collapsed");
      return saved === null ? true : saved === "true";
    } catch {
      return true;
    }
  });
  reactExports.useEffect(() => {
    try {
      localStorage.setItem("devilbox-editor-left-panel-collapsed", String(leftPanelCollapsed));
    } catch {
    }
  }, [leftPanelCollapsed]);
  reactExports.useEffect(() => {
    requestAnimationFrame(() => {
      if (isOpen && createMode) {
        setIsCreating(true);
        setSelectedSynthType("Sampler");
        setInstrumentName("Sampler");
        setTempInstrument(createTempInstrument("Sampler"));
      } else if (isOpen && !createMode) {
        if (instruments.length === 0) {
          setIsCreating(true);
          setSelectedSynthType("Sampler");
          setInstrumentName("Sampler");
          setTempInstrument(createTempInstrument("Sampler"));
        } else if (!currentInstrument) {
          setIsCreating(false);
          setTempInstrument(null);
          setCurrentInstrument(instruments[0].id);
        } else {
          setIsCreating(false);
          setTempInstrument(null);
        }
      }
    });
  }, [isOpen, createMode, currentInstrument, instruments, setCurrentInstrument]);
  reactExports.useEffect(() => {
    if (isCreating && tempInstrument) {
      setPreviewInstrument(tempInstrument);
      return () => setPreviewInstrument(null);
    }
  }, [isCreating, tempInstrument, setPreviewInstrument]);
  const handleClose = () => {
    setPreviewInstrument(null);
    setIsCreating(false);
    setTempInstrument(null);
    onClose();
  };
  reactExports.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);
  const filteredSynths = ALL_SYNTH_TYPES.filter((synthType) => {
    if (!synthSearch.trim()) return true;
    const synth = SYNTH_INFO[synthType];
    const query = synthSearch.toLowerCase();
    return synth.name.toLowerCase().includes(query) || synth.shortName.toLowerCase().includes(query) || synth.description.toLowerCase().includes(query) || synth.bestFor.some((tag) => tag.toLowerCase().includes(query));
  });
  const handleSelectSynth = (synthType) => {
    ToneEngine.getInstance().invalidateInstrument(-1);
    setSelectedSynthType(synthType);
    setTempInstrument(createTempInstrument(synthType));
    setInstrumentName(getSynthInfo(synthType).name);
  };
  const handleSaveNew = () => {
    setPreviewInstrument(null);
    const newId = createInstrument();
    if (tempInstrument) {
      updateInstrument(newId, {
        ...tempInstrument,
        name: instrumentName
      });
    }
    setCurrentInstrument(newId);
    setIsCreating(false);
    setTempInstrument(null);
  };
  const handlePopOut = () => {
    const ui = useUIStore.getState();
    const inst = isCreating ? tempInstrument : currentInstrument;
    const isHW = inst && hasHardwareUI(inst.synthType);
    if (isHW) {
      if (ui.hardwareUiPoppedOut) {
        focusPopout("DEViLBOX — Hardware UI");
        onClose();
        return;
      }
      onClose();
      ui.setHardwareUiPoppedOut(true);
    } else {
      if (ui.instrumentEditorPoppedOut) {
        focusPopout("DEViLBOX — Instrument Editor");
        onClose();
        return;
      }
      setPreviewInstrument(null);
      setIsCreating(false);
      setTempInstrument(null);
      onClose();
      ui.setInstrumentEditorPoppedOut(true);
    }
  };
  const handleUpdateTempInstrument = reactExports.useCallback((updates) => {
    ToneEngine.getInstance().invalidateInstrument(-1);
    setTempInstrument((prev) => prev ? { ...prev, ...updates } : null);
  }, []);
  const handleStartCreate = () => {
    setIsCreating(true);
    setSelectedSynthType("Sampler");
    setInstrumentName("Sampler");
    setTempInstrument(createTempInstrument("Sampler"));
  };
  const handleSynthTypeChange = reactExports.useCallback(() => {
    setActiveTab("sound");
  }, [setActiveTab]);
  const sortedInstruments = [...instruments].sort((a, b) => a.id - b.id);
  const currentIndex = sortedInstruments.findIndex((i) => i.id === currentInstrumentId);
  const handlePrevInstrument = reactExports.useCallback(() => {
    if (currentIndex > 0) {
      setCurrentInstrument(sortedInstruments[currentIndex - 1].id);
    } else if (sortedInstruments.length > 0) {
      setCurrentInstrument(sortedInstruments[sortedInstruments.length - 1].id);
    }
  }, [currentIndex, sortedInstruments, setCurrentInstrument]);
  const handleNextInstrument = reactExports.useCallback(() => {
    if (currentIndex < sortedInstruments.length - 1) {
      setCurrentInstrument(sortedInstruments[currentIndex + 1].id);
    } else if (sortedInstruments.length > 0) {
      setCurrentInstrument(sortedInstruments[0].id);
    }
  }, [currentIndex, sortedInstruments, setCurrentInstrument]);
  if (!isOpen) return null;
  const instrument = isCreating ? tempInstrument : currentInstrument;
  const synthInfo = (instrument == null ? void 0 : instrument.synthType) ? getSynthInfo(instrument.synthType) : getSynthInfo("Sampler");
  if (isCreating) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "fixed inset-0 z-[99990] flex items-center justify-center bg-black/90", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full bg-dark-bg flex flex-col overflow-hidden", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-2 bg-dark-bgSecondary border-b border-dark-border shrink-0", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-1.5 rounded ${synthInfo.color} bg-dark-bgTertiary`, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SynthIconDisplay, { iconName: synthInfo.icon, size: 18 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 317,
            columnNumber: 17
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 316,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-text-primary font-bold text-sm", children: "CREATE INSTRUMENT" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 320,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "text",
                value: instrumentName,
                onChange: (e) => setInstrumentName(e.target.value),
                className: "px-3 py-1 text-sm bg-dark-bg border border-dark-border text-text-primary rounded focus:border-accent-primary focus:outline-none font-mono",
                placeholder: "Instrument name..."
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 321,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 319,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
          lineNumber: 315,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: handleClose,
              className: "flex items-center gap-1.5 px-4 py-2 bg-red-900/50 text-red-300 text-sm font-bold hover:bg-red-800/60 hover:text-red-200 transition-colors rounded border border-red-700",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 335,
                  columnNumber: 17
                }, void 0),
                "Cancel"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 331,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: handleSaveNew,
              disabled: !instrumentName.trim(),
              className: "flex items-center gap-1.5 px-4 py-2 bg-green-600 text-text-primary text-sm font-bold hover:bg-green-500 transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Check, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 343,
                  columnNumber: 17
                }, void 0),
                "Add Instrument"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 338,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
          lineNumber: 330,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
        lineNumber: 314,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex overflow-hidden", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-64 shrink-0 bg-dark-bgSecondary border-r border-dark-border flex flex-col", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 border-b border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Search, { size: 14, className: "absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 356,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "text",
                value: synthSearch,
                onChange: (e) => setSynthSearch(e.target.value),
                placeholder: "Search synths...",
                className: "w-full pl-7 pr-2 py-1.5 text-xs bg-dark-bg border border-dark-border text-text-primary rounded focus:border-accent-primary focus:outline-none"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 357,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 355,
            columnNumber: 17
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 354,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-modern", children: [
            filteredSynths.map((synthType) => {
              const synth = SYNTH_INFO[synthType];
              const isSelected = selectedSynthType === synthType;
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => handleSelectSynth(synthType),
                  className: `
                        w-full px-2 py-1.5 text-left transition-all flex items-center gap-2 border-b border-dark-border
                        ${isSelected ? "bg-accent-primary text-dark-bg" : "hover:bg-dark-bgTertiary"}
                      `,
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SynthIconDisplay, { iconName: synth.icon, size: 14 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 385,
                      columnNumber: 23
                    }, void 0),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0", children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `font-bold text-xs truncate ${isSelected ? "text-dark-bg" : "text-text-primary"}`, children: synth.shortName }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                        lineNumber: 387,
                        columnNumber: 25
                      }, void 0),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-[10px] truncate ${isSelected ? "text-dark-bg/70" : "text-text-muted"}`, children: synth.bestFor[0] }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                        lineNumber: 390,
                        columnNumber: 25
                      }, void 0)
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 386,
                      columnNumber: 23
                    }, void 0)
                  ]
                },
                synthType,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 374,
                  columnNumber: 21
                },
                void 0
              );
            }),
            filteredSynths.length === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center py-4 text-text-muted text-xs", children: "No synths found" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 398,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 368,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
          lineNumber: 352,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex flex-col overflow-hidden", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-modern", children: tempInstrument && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            InstrumentEditor,
            {
              instrument: tempInstrument,
              onChange: handleUpdateTempInstrument
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 410,
              columnNumber: 19
            },
            void 0
          ) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 408,
            columnNumber: 15
          }, void 0),
          tempInstrument && !hasBuiltInInput(tempInstrument.synthType) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 border-t border-dark-border bg-dark-bgSecondary shrink-0", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TestKeyboard, { instrument: tempInstrument }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 420,
            columnNumber: 19
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 419,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
          lineNumber: 406,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
        lineNumber: 350,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
      lineNumber: 312,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
      lineNumber: 311,
      columnNumber: 7
    }, void 0);
  }
  const tabs = [
    { id: "sound", label: "Sound", icon: Settings },
    { id: "effects", label: "Effects", icon: Sparkles }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "fixed inset-0 z-[99990] bg-black/90", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg w-full h-full flex flex-col overflow-hidden", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex h-full", children: [
      !isMobile && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `border-r border-dark-border flex-shrink-0 bg-dark-bgSecondary transition-all duration-200 ${leftPanelCollapsed ? "w-8" : "w-52"}`, children: leftPanelCollapsed ? (
        // Collapsed state - just show expand button
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setLeftPanelCollapsed(false),
            className: "w-full h-full flex items-start justify-center pt-3 text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary transition-colors",
            title: "Show instrument list",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronRight, { size: 16 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 449,
              columnNumber: 17
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 444,
            columnNumber: 15
          },
          void 0
        )
      ) : (
        // Expanded state - show instrument list with collapse button
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-full flex flex-col", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-2 py-1 border-b border-dark-border", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-medium text-text-muted", children: "Instruments" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 455,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => setLeftPanelCollapsed(true),
                className: "p-1 text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary rounded transition-colors",
                title: "Hide instrument list",
                children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronLeft, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 461,
                  columnNumber: 21
                }, void 0)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 456,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 454,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            InstrumentList,
            {
              maxHeight: "100%",
              showActions: true,
              onCreateNew: handleStartCreate
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 465,
              columnNumber: 19
            },
            void 0
          ) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 464,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
          lineNumber: 453,
          columnNumber: 15
        }, void 0)
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
        lineNumber: 441,
        columnNumber: 25
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex flex-col min-w-0", children: [
        currentInstrument ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-2 border-b border-dark-border bg-dark-bgSecondary shrink-0", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: handlePrevInstrument,
                  className: "p-1.5 rounded hover:bg-dark-bgTertiary text-text-muted hover:text-text-primary transition-colors",
                  title: "Previous instrument",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronLeft, { size: 20 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                    lineNumber: 488,
                    columnNumber: 23
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 483,
                  columnNumber: 21
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg bg-dark-bg ${(synthInfo == null ? void 0 : synthInfo.color) || "text-text-primary"}`, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SynthIconDisplay, { iconName: synthInfo.icon, size: 20 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 492,
                columnNumber: 23
              }, void 0) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 491,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "input",
                    {
                      type: "text",
                      value: currentInstrument.name,
                      onChange: (e) => updateInstrument(currentInstrument.id, { name: e.target.value }),
                      className: "bg-transparent text-text-primary font-semibold text-lg focus:outline-none focus:ring-1 focus:ring-accent-primary rounded px-1 -ml-1"
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 496,
                      columnNumber: 25
                    },
                    void 0
                  ),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted font-mono", children: [
                    "(",
                    currentIndex + 1,
                    "/",
                    sortedInstruments.length,
                    ")"
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                    lineNumber: 502,
                    columnNumber: 25
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 495,
                  columnNumber: 23
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted", children: [
                  (synthInfo == null ? void 0 : synthInfo.name) || currentInstrument.synthType,
                  " ",
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "opacity-50", children: "|" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                    lineNumber: 507,
                    columnNumber: 74
                  }, void 0),
                  " ID: ",
                  currentInstrument.id.toString(16).toUpperCase().padStart(2, "0")
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 506,
                  columnNumber: 23
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 494,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: handleNextInstrument,
                  className: "p-1.5 rounded hover:bg-dark-bgTertiary text-text-muted hover:text-text-primary transition-colors",
                  title: "Next instrument",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronRight, { size: 20 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                    lineNumber: 517,
                    columnNumber: 23
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 512,
                  columnNumber: 21
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 ml-4 pl-4 border-l border-dark-border", children: tabs.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;
                return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: () => setActiveTab(tab.id),
                    className: `
                              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border
                              ${isActive ? "bg-dark-bg text-accent-primary border-accent-primary" : "text-text-muted hover:text-text-primary hover:bg-dark-bg border-transparent"}
                            `,
                    children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabIcon, { size: 14 }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                        lineNumber: 538,
                        columnNumber: 29
                      }, void 0),
                      tab.label
                    ]
                  },
                  tab.id,
                  true,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                    lineNumber: 527,
                    columnNumber: 27
                  },
                  void 0
                );
              }) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 521,
                columnNumber: 21
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 481,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => setShowSynthBrowser(true),
                  className: "flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-bg hover:bg-dark-bgTertiary text-text-primary transition-colors text-sm border border-dark-border",
                  title: "Change synth type",
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music2, { size: 14 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 552,
                      columnNumber: 23
                    }, void 0),
                    "Browse Synths"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 547,
                  columnNumber: 21
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => useUIStore.getState().setShowNewInstrumentBrowser(true),
                  className: "flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-bg hover:bg-dark-bgTertiary text-green-400 transition-colors text-sm border border-green-800 hover:border-green-600",
                  title: "Add new instrument",
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Plus, { size: 14 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 560,
                      columnNumber: 23
                    }, void 0),
                    "Add Instrument"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 555,
                  columnNumber: 21
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => setShowSaveDialog(true),
                  className: "flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-bg hover:bg-dark-bgTertiary text-text-primary transition-colors text-sm border border-dark-border",
                  title: "Save as preset",
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Save, { size: 14 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 568,
                      columnNumber: 23
                    }, void 0),
                    "Save"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 563,
                  columnNumber: 21
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: handlePopOut,
                  className: "flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-bg hover:bg-dark-bgTertiary text-text-primary transition-colors text-sm border border-dark-border",
                  title: "Pop out to separate window",
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ExternalLink, { size: 14 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 576,
                      columnNumber: 23
                    }, void 0),
                    "Pop Out"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 571,
                  columnNumber: 21
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: handleClose,
                  className: "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-bg hover:bg-dark-bgHover transition-colors text-text-muted hover:text-text-primary border border-dark-border",
                  title: "Close (Escape)",
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 18 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 584,
                      columnNumber: 23
                    }, void 0),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-medium", children: "Close" }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 585,
                      columnNumber: 23
                    }, void 0)
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 579,
                  columnNumber: 21
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 546,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 480,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-modern", children: [
            activeTab === "sound" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              InstrumentEditor,
              {
                instrument: currentInstrument,
                onChange: (updates) => updateInstrument(currentInstrument.id, updates)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 593,
                columnNumber: 21
              },
              void 0
            ),
            activeTab === "effects" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              InstrumentEffectsPanel,
              {
                instrumentId: currentInstrument.id,
                instrumentName: currentInstrument.name,
                effects: currentInstrument.effects || [],
                hideHeader: true
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 601,
                columnNumber: 23
              },
              void 0
            ) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 600,
              columnNumber: 21
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 591,
            columnNumber: 17
          }, void 0),
          showSynthBrowser && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 z-[99990] bg-black/80 flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg shadow-2xl w-[90%] max-w-4xl max-h-[85vh] flex flex-col", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-3 border-b border-dark-border", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-lg font-semibold text-text-primary flex items-center gap-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music2, { size: 20, className: "text-accent-primary" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 617,
                  columnNumber: 27
                }, void 0),
                "Browse Synth Types"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 616,
                columnNumber: 25
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => setShowSynthBrowser(false),
                  className: "p-1.5 rounded hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 18 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                    lineNumber: 624,
                    columnNumber: 27
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 620,
                  columnNumber: 25
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 615,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto p-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CategorizedSynthSelector,
              {
                onSelect: (type) => {
                  handleSynthTypeChange(type);
                  setShowSynthBrowser(false);
                }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 628,
                columnNumber: 25
              },
              void 0
            ) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 627,
              columnNumber: 23
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 614,
            columnNumber: 21
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 613,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
          lineNumber: 478,
          columnNumber: 15
        }, void 0) : (
          /* No instrument selected - show prompt */
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex flex-col", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bgSecondary", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-semibold text-text-primary", children: "Instrument Editor" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 643,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: handleClose,
                  className: "flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-bg hover:bg-dark-bgHover transition-colors text-text-muted hover:text-text-primary border border-dark-border",
                  title: "Close (Escape)",
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 18 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 649,
                      columnNumber: 21
                    }, void 0),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-medium", children: "Close" }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 650,
                      columnNumber: 21
                    }, void 0)
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 644,
                  columnNumber: 19
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 642,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music2, { size: 48, className: "mx-auto mb-4 opacity-50 text-text-muted" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 655,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-text-muted mb-2", children: "No instrument selected" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 656,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-text-muted text-sm mb-4", children: "Select an instrument from the list or create a new one" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                lineNumber: 657,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: handleStartCreate,
                  className: "flex items-center gap-2 px-4 py-2 bg-accent-primary rounded-lg text-text-inverse hover:bg-accent-primary/80 transition-colors mx-auto",
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Plus, { size: 16 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                      lineNumber: 662,
                      columnNumber: 23
                    }, void 0),
                    "Create Instrument"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 658,
                  columnNumber: 21
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 654,
              columnNumber: 19
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 653,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 641,
            columnNumber: 15
          }, void 0)
        ),
        currentInstrument && !hasBuiltInInput(currentInstrument.synthType) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setShowKeyboard(!showKeyboard),
              className: "w-full px-4 py-2 flex items-center justify-between text-sm text-text-muted hover:text-text-primary hover:bg-dark-bgHover transition-colors",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Keyboard, { size: 14 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                    lineNumber: 678,
                    columnNumber: 21
                  }, void 0),
                  "Test Keyboard"
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 677,
                  columnNumber: 19
                }, void 0),
                showKeyboard ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 681,
                  columnNumber: 35
                }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronUp, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
                  lineNumber: 681,
                  columnNumber: 63
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
              lineNumber: 673,
              columnNumber: 17
            },
            void 0
          ),
          showKeyboard && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 bg-dark-bgSecondary", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TestKeyboard, { instrument: currentInstrument }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 686,
            columnNumber: 21
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
            lineNumber: 685,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
          lineNumber: 672,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
        lineNumber: 476,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
      lineNumber: 439,
      columnNumber: 9
    }, void 0),
    showSaveDialog && currentInstrument && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      SavePresetDialog,
      {
        instrument: currentInstrument,
        onClose: () => setShowSaveDialog(false)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
        lineNumber: 696,
        columnNumber: 11
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
    lineNumber: 438,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
    lineNumber: 437,
    columnNumber: 5
  }, void 0);
};
const InstrumentEditor = ({ instrument, onChange }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    UnifiedInstrumentEditor,
    {
      instrument,
      onChange
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/EditInstrumentModal.tsx",
      lineNumber: 723,
      columnNumber: 5
    },
    void 0
  );
};
function createTempInstrument(synthType) {
  var _a, _b;
  const base = {
    id: -1,
    name: getSynthInfo(synthType).name,
    type: "synth",
    synthType,
    volume: -6,
    pan: 0,
    oscillator: DEFAULT_OSCILLATOR,
    envelope: DEFAULT_ENVELOPE,
    filter: DEFAULT_FILTER,
    effects: []
  };
  if (synthType === "TB303" || synthType === "Buzz3o3") {
    base.tb303 = { ...DEFAULT_TB303 };
    if (synthType === "Buzz3o3") {
      base.buzzmachine = {
        ...DEFAULT_BUZZMACHINE,
        machineType: "OomekAggressor",
        parameters: {
          0: 0,
          1: 120,
          2: 64,
          3: 64,
          4: 64,
          5: 64,
          6: 100,
          7: 100
        }
      };
    }
  } else if (isFurnaceType(synthType)) {
    base.furnace = { ...DEFAULT_FURNACE };
    const chipTypeMap = {
      "Furnace": 1,
      "FurnaceOPN": 0,
      "FurnaceOPNA": 13,
      "FurnaceOPNB": 14,
      "FurnaceOPM": 1,
      "FurnaceOPL": 2,
      "FurnaceOPLL": 23,
      "FurnaceOPL4": 26,
      "FurnaceOPZ": 24,
      "FurnaceESFM": 25,
      "FurnaceNES": 3,
      "FurnaceGB": 4,
      "FurnaceC64": 5,
      "FurnaceSID6581": 5,
      "FurnaceSID8580": 5,
      "FurnaceAY": 6,
      "FurnacePSG": 7,
      "FurnaceTIA": 8,
      "FurnaceVERA": 9,
      "FurnaceSAA": 10,
      "FurnaceVIC": 11,
      "FurnaceLynx": 12
    };
    if (chipTypeMap[synthType] !== void 0) {
      base.furnace.chipType = chipTypeMap[synthType];
    }
  } else if (isBuzzmachineType(synthType)) {
    base.buzzmachine = { ...DEFAULT_BUZZMACHINE };
    const machineTypeMap = {
      "Buzzmachine": "ArguruDistortion",
      "BuzzDTMF": "CyanPhaseDTMF",
      "BuzzFreqBomb": "ElenzilFrequencyBomb",
      "BuzzKick": "FSMKick",
      "BuzzKickXP": "FSMKickXP",
      "BuzzNoise": "JeskolaNoise",
      "BuzzTrilok": "JeskolaTrilok",
      "Buzz4FM2F": "MadBrain4FM2F",
      "BuzzDynamite6": "MadBrainDynamite6",
      "BuzzM3": "MakkM3",
      "Buzz3o3": "OomekAggressor"
    };
    if (machineTypeMap[synthType]) {
      base.buzzmachine.machineType = machineTypeMap[synthType];
    }
  } else if (synthType === "GranularSynth") {
    base.granular = { ...DEFAULT_GRANULAR };
  } else if (synthType === "DrumKit") {
    base.drumKit = { ...DEFAULT_DRUMKIT };
  } else if (synthType === "Sam") {
    base.sam = { ...DEFAULT_SAM };
  } else if (synthType === "V2") {
    base.v2 = { ...DEFAULT_V2 };
  } else if (synthType !== "Sampler" && synthType !== "Player" && synthType !== "ChiptuneModule") {
    switch (synthType) {
      case "DrumMachine":
        base.drumMachine = { ...DEFAULT_DRUM_MACHINE };
        break;
      case "ChipSynth":
        base.chipSynth = { ...DEFAULT_CHIP_SYNTH };
        break;
      case "PWMSynth":
        base.pwmSynth = { ...DEFAULT_PWM_SYNTH };
        break;
      case "Wavetable":
        base.wavetable = { ...DEFAULT_WAVETABLE };
        break;
      case "SuperSaw":
        base.superSaw = { ...DEFAULT_SUPERSAW };
        break;
      case "PolySynth":
        base.polySynth = { ...DEFAULT_POLYSYNTH };
        break;
      case "Organ":
        base.organ = { ...DEFAULT_ORGAN };
        break;
      case "StringMachine":
        base.stringMachine = { ...DEFAULT_STRING_MACHINE };
        break;
      case "FormantSynth":
        base.formantSynth = { ...DEFAULT_FORMANT_SYNTH };
        break;
      case "WobbleBass":
        base.wobbleBass = { ...DEFAULT_WOBBLE_BASS };
        break;
      case "DubSiren":
        base.dubSiren = { ...DEFAULT_DUB_SIREN };
        break;
      case "SpaceLaser":
        base.spaceLaser = { ...DEFAULT_SPACE_LASER };
        break;
      case "Synare":
        base.synare = { ...DEFAULT_SYNARE };
        break;
    }
  }
  const savedFurnaceChipType = (_a = base.furnace) == null ? void 0 : _a.chipType;
  const savedBuzzMachineType = (_b = base.buzzmachine) == null ? void 0 : _b.machineType;
  const firstPreset = getFirstPresetForSynthType(synthType);
  if (firstPreset) {
    const presetRecord = { ...firstPreset };
    delete presetRecord.name;
    delete presetRecord.type;
    delete presetRecord.synthType;
    Object.assign(base, presetRecord);
    base.synthType = synthType;
    base.id = -1;
    base.name = getSynthInfo(synthType).name;
    if (savedFurnaceChipType !== void 0 && base.furnace) {
      base.furnace.chipType = savedFurnaceChipType;
    }
    if (savedBuzzMachineType && base.buzzmachine) {
      base.buzzmachine.machineType = savedBuzzMachineType;
    }
  }
  return base;
}
export {
  EditInstrumentModal
};
