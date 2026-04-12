import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React, M as Music2, d as ChevronLeft, b as ChevronRight, g as Save, e as Settings, f as Sparkles, K as Keyboard, h as ChevronDown, i as ChevronUp, L as LucideIcons } from "./vendor-ui-AJ7AT9BN.js";
import { e as useInstrumentStore, aD as useSensors, aE as useSensor, aF as sortableKeyboardCoordinates, aG as KeyboardSensor, aH as PointerSensor, aI as DndContext, aJ as closestCenter, aK as SortableContext, aL as verticalListSortingStrategy, aM as useSortable, aN as CSS, f as getSynthInfo } from "./main-BbV5VyEH.js";
import { UnifiedInstrumentEditor } from "./UnifiedInstrumentEditor-CFDlFTgF.js";
import "./FurnaceControls-B82Xx7ke.js";
import { TestKeyboard } from "./TestKeyboard-B6REGXyS.js";
import "./DrawbarSlider-Dq9geM4g.js";
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
import "./HardwareUIWrapper-GDcuDfC2.js";
import "./DOMSynthPanel-C5W_v5Xk.js";
import "./WavetableEditor-wq3DMlO8.js";
import "./WaveformThumbnail-CebZPsAz.js";
import "./SpectralFilter-Dxe-YniK.js";
import "./HarmonicBarsCanvas-tCyue1dW.js";
const AVAILABLE_EFFECTS = [
  "Distortion",
  "Reverb",
  "Delay",
  "Chorus",
  "Phaser",
  "Tremolo",
  "Vibrato",
  "AutoFilter",
  "AutoPanner",
  "AutoWah",
  "BitCrusher",
  "Chebyshev",
  "FeedbackDelay",
  "FrequencyShifter",
  "PingPongDelay",
  "PitchShift",
  "Compressor",
  "EQ3",
  "Filter",
  "JCReverb",
  "StereoWidener",
  "SpaceEcho",
  "BiPhase",
  "DubFilter",
  "MoogFilter",
  "SpaceyDelayer",
  "RETapeEcho",
  "MVerb",
  "Leslie",
  "SpringReverb",
  "VinylNoise"
];
function SortableEffect({ effect, onToggle, onRemove, onEdit, onWetChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: effect.id
  });
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
      className: `
        bg-ft2-header border border-ft2-border p-3 mb-2
        ${isDragging ? "shadow-lg" : ""}
      `,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              ...attributes,
              ...listeners,
              className: "text-ft2-textDim hover:text-ft2-highlight cursor-grab active:cursor-grabbing",
              title: "Drag to reorder",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "currentColor", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "6", cy: "4", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
                  lineNumber: 103,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "10", cy: "4", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
                  lineNumber: 104,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "6", cy: "8", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
                  lineNumber: 105,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "10", cy: "8", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
                  lineNumber: 106,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "6", cy: "12", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
                  lineNumber: 107,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: "10", cy: "12", r: "1.5" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
                  lineNumber: 108,
                  columnNumber: 13
                }, this)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
                lineNumber: 102,
                columnNumber: 11
              }, this)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
              lineNumber: 96,
              columnNumber: 9
            },
            this
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 font-mono text-sm font-bold text-ft2-text", children: effect.type }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
            lineNumber: 113,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-ft2-textDim", children: "WET" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
              lineNumber: 119,
              columnNumber: 11
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: "0",
                max: "100",
                value: effect.wet,
                onChange: (e) => onWetChange(Number(e.target.value)),
                className: "w-20 h-1 bg-ft2-bg rounded-lg appearance-none cursor-pointer\n                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3\n                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ft2-highlight\n                     [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3\n                     [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ft2-highlight [&::-moz-range-thumb]:border-0"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
                lineNumber: 120,
                columnNumber: 11
              },
              this
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-ft2-highlight font-mono w-8 text-right", children: [
              effect.wet,
              "%"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
              lineNumber: 132,
              columnNumber: 11
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
            lineNumber: 118,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: onEdit,
              className: "px-2 py-1 text-xs border border-ft2-border bg-ft2-bg\n                   hover:border-ft2-highlight hover:text-ft2-highlight transition-colors",
              title: "Edit parameters",
              children: "EDIT"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
              lineNumber: 138,
              columnNumber: 9
            },
            this
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: onToggle,
              className: `
            px-2 py-1 text-xs border font-bold transition-colors
            ${effect.enabled ? "border-green-500 bg-green-900 text-green-300 hover:bg-green-800" : "border-red-500 bg-red-900 text-red-300 hover:bg-red-800"}
          `,
              children: effect.enabled ? "ON" : "OFF"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
              lineNumber: 148,
              columnNumber: 9
            },
            this
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: onRemove,
              className: "px-2 py-1 text-xs border border-ft2-border bg-ft2-bg\n                   hover:border-red-500 hover:text-red-500 transition-colors",
              title: "Remove effect",
              children: "X"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
              lineNumber: 163,
              columnNumber: 9
            },
            this
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 94,
          columnNumber: 7
        }, this),
        !effect.enabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-xs text-red-400 font-mono", children: "BYPASSED" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 175,
          columnNumber: 9
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
      lineNumber: 86,
      columnNumber: 5
    },
    this
  );
}
const EffectChain = ({
  instrumentId,
  effects,
  onEditEffect
}) => {
  const [showAddMenu, setShowAddMenu] = reactExports.useState(false);
  const { updateEffect, removeEffect, addEffect, reorderEffects } = useInstrumentStore();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = effects.findIndex((fx) => fx.id === active.id);
      const newIndex = effects.findIndex((fx) => fx.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderEffects(instrumentId, oldIndex, newIndex);
      }
    }
  };
  const handleAddEffect = (effectType) => {
    addEffect(instrumentId, effectType);
    setShowAddMenu(false);
  };
  const handleToggle = (effectId) => {
    const effect = effects.find((fx) => fx.id === effectId);
    if (effect) {
      updateEffect(instrumentId, effectId, { enabled: !effect.enabled });
    }
  };
  const handleRemove = (effectId) => {
    removeEffect(instrumentId, effectId);
  };
  const handleEdit = (effect) => {
    if (onEditEffect) {
      onEditEffect(effect);
    }
  };
  const handleWetChange = (effectId, wet) => {
    updateEffect(instrumentId, effectId, { wet });
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 bg-ft2-bg", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-4 pb-2 border-b border-ft2-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-ft2-highlight text-sm font-bold", children: "EFFECTS CHAIN" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 239,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setShowAddMenu(!showAddMenu),
          className: "px-3 py-1 text-xs border border-ft2-border bg-ft2-header\n                   hover:border-ft2-highlight hover:text-ft2-highlight transition-colors font-bold",
          children: "+ ADD EFFECT"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 240,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
      lineNumber: 238,
      columnNumber: 7
    }, void 0),
    showAddMenu && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-4 p-3 bg-ft2-header border border-ft2-highlight max-h-64 overflow-y-auto scrollbar-ft2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-ft2-textDim mb-2 font-bold", children: "SELECT EFFECT:" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 252,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-1", children: AVAILABLE_EFFECTS.map((effectType) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => handleAddEffect(effectType),
          className: "px-2 py-1 text-xs text-left border border-ft2-border bg-ft2-bg\n                         hover:bg-ft2-cursor hover:text-ft2-bg hover:border-ft2-highlight\n                         transition-colors font-mono",
          children: effectType
        },
        effectType,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 255,
          columnNumber: 15
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 253,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
      lineNumber: 251,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-4 p-3 bg-ft2-header border border-ft2-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between text-xs font-mono text-ft2-textDim", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-highlight font-bold", children: "SYNTH" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 272,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "→" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 273,
        columnNumber: 11
      }, void 0),
      effects.length > 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: effects.map((fx, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(React.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: fx.enabled ? "text-green-400" : "text-red-400", children: [
          "FX",
          idx + 1
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 278,
          columnNumber: 19
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "→" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 281,
          columnNumber: 19
        }, void 0)
      ] }, fx.id, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 277,
        columnNumber: 17
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 275,
        columnNumber: 13
      }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-textDim italic", children: "no effects" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 287,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "→" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 288,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 286,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-highlight font-bold", children: "OUT" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 291,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
      lineNumber: 271,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
      lineNumber: 270,
      columnNumber: 7
    }, void 0),
    effects.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-8 text-center text-ft2-textDim text-sm border border-dashed border-ft2-border", children: 'No effects. Click "ADD EFFECT" to get started.' }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
      lineNumber: 297,
      columnNumber: 9
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DndContext, { sensors, collisionDetection: closestCenter, onDragEnd: handleDragEnd, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SortableContext, { items: effects.map((fx) => fx.id), strategy: verticalListSortingStrategy, children: effects.map((effect) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      SortableEffect,
      {
        effect,
        onToggle: () => handleToggle(effect.id),
        onRemove: () => handleRemove(effect.id),
        onEdit: () => handleEdit(effect),
        onWetChange: (wet) => handleWetChange(effect.id, wet)
      },
      effect.id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 304,
        columnNumber: 15
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
      lineNumber: 302,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
      lineNumber: 301,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-4 text-xs text-ft2-textDim", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-bold mb-1", children: "TIPS:" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 319,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("ul", { className: "list-disc list-inside space-y-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { children: "Drag effects to reorder the signal chain" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 321,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { children: "Use WET control to blend effect with dry signal" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 322,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { children: "Click EDIT to adjust effect parameters" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 323,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { children: "Toggle ON/OFF to bypass effects" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
          lineNumber: 324,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
        lineNumber: 320,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
      lineNumber: 318,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/EffectChain.tsx",
    lineNumber: 236,
    columnNumber: 5
  }, void 0);
};
const InstrumentEditorPopout = () => {
  const instruments = useInstrumentStore((state) => state.instruments);
  const currentInstrumentId = useInstrumentStore((state) => state.currentInstrumentId);
  const updateInstrument = useInstrumentStore((state) => state.updateInstrument);
  const setCurrentInstrument = useInstrumentStore((state) => state.setCurrentInstrument);
  const currentInstrument = instruments.find((inst) => inst.id === currentInstrumentId) || null;
  reactExports.useEffect(() => {
    console.log("[InstrumentEditorPopout] Mounted with currentInstrumentId:", currentInstrumentId);
    console.log("[InstrumentEditorPopout] Store instruments count:", instruments.length);
  }, []);
  const [activeTab, setActiveTab] = reactExports.useState("sound");
  const [showKeyboard, setShowKeyboard] = reactExports.useState(true);
  const [showSaveDialog, setShowSaveDialog] = reactExports.useState(false);
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
  const synthInfo = (currentInstrument == null ? void 0 : currentInstrument.synthType) ? getSynthInfo(currentInstrument.synthType) : getSynthInfo("Sampler");
  const tabs = [
    { id: "sound", label: "Sound", icon: Settings },
    { id: "effects", label: "Effects", icon: Sparkles }
  ];
  if (!currentInstrument) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "flex items-center justify-center h-screen",
        style: { background: "var(--color-bg)", color: "var(--color-text)" },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music2, { size: 48, className: "mx-auto mb-4 opacity-50 text-text-muted" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
            lineNumber: 74,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-text-secondary mb-2", children: "No instrument selected" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
            lineNumber: 75,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-text-muted text-sm", children: "Select an instrument in the main window" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
            lineNumber: 76,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
          lineNumber: 73,
          columnNumber: 9
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
        lineNumber: 69,
        columnNumber: 7
      },
      void 0
    );
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg w-full h-screen flex flex-col overflow-hidden", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bgSecondary shrink-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handlePrevInstrument,
            className: "p-1.5 rounded hover:bg-dark-bgTertiary text-text-muted hover:text-text-primary transition-colors",
            title: "Previous instrument",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronLeft, { size: 20 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
              lineNumber: 92,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
            lineNumber: 87,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg bg-dark-bg ${(synthInfo == null ? void 0 : synthInfo.color) || "text-text-primary"}`, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SynthIconDisplay, { iconName: synthInfo.icon, size: 20 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
          lineNumber: 96,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
          lineNumber: 95,
          columnNumber: 11
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
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
                lineNumber: 100,
                columnNumber: 15
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
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
              lineNumber: 106,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
            lineNumber: 99,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted", children: [
            (synthInfo == null ? void 0 : synthInfo.name) || currentInstrument.synthType,
            " ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "opacity-50", children: "|" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
              lineNumber: 112,
              columnNumber: 15
            }, void 0),
            " ID:",
            " ",
            currentInstrument.id.toString(16).toUpperCase().padStart(2, "0")
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
            lineNumber: 110,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
          lineNumber: 98,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleNextInstrument,
            className: "p-1.5 rounded hover:bg-dark-bgTertiary text-text-muted hover:text-text-primary transition-colors",
            title: "Next instrument",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronRight, { size: 20 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
              lineNumber: 122,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
            lineNumber: 117,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
        lineNumber: 86,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setShowSaveDialog(true),
          className: "flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-bg hover:bg-dark-bgTertiary text-text-primary transition-colors text-sm border border-dark-border",
          title: "Save as preset",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Save, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
              lineNumber: 132,
              columnNumber: 13
            }, void 0),
            "Save"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
          lineNumber: 127,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
        lineNumber: 126,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
      lineNumber: 85,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 px-4 py-2 border-b border-dark-border bg-dark-bg shrink-0", children: tabs.map((tab) => {
      const TabIcon = tab.icon;
      const isActive = activeTab === tab.id;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab(tab.id),
          className: `
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border
                ${isActive ? "bg-dark-bgSecondary text-accent-primary border-accent-primary" : "text-text-muted hover:text-text-primary hover:bg-dark-bgSecondary border-transparent"}
              `,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabIcon, { size: 16 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
              lineNumber: 155,
              columnNumber: 15
            }, void 0),
            tab.label
          ]
        },
        tab.id,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
          lineNumber: 144,
          columnNumber: 13
        },
        void 0
      );
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
      lineNumber: 139,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-modern", children: [
      activeTab === "sound" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        UnifiedInstrumentEditor,
        {
          instrument: currentInstrument,
          onChange: (updates) => {
            console.log("[InstrumentEditorPopout] onChange called with updates:", updates);
            updateInstrument(currentInstrument.id, updates);
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
          lineNumber: 165,
          columnNumber: 11
        },
        void 0
      ),
      activeTab === "effects" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        EffectChain,
        {
          instrumentId: currentInstrument.id,
          effects: currentInstrument.effects || []
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
          lineNumber: 176,
          columnNumber: 13
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
        lineNumber: 175,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
      lineNumber: 163,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border shrink-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setShowKeyboard(!showKeyboard),
          className: "w-full px-4 py-2 flex items-center justify-between text-sm text-text-muted hover:text-text-primary hover:bg-dark-bgHover transition-colors",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Keyboard, { size: 14 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
                lineNumber: 191,
                columnNumber: 13
              }, void 0),
              "Test Keyboard"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
              lineNumber: 190,
              columnNumber: 11
            }, void 0),
            showKeyboard ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
              lineNumber: 194,
              columnNumber: 27
            }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronUp, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
              lineNumber: 194,
              columnNumber: 55
            }, void 0)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
          lineNumber: 186,
          columnNumber: 9
        },
        void 0
      ),
      showKeyboard && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 bg-dark-bgSecondary", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TestKeyboard, { instrument: currentInstrument }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
        lineNumber: 199,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
        lineNumber: 198,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
      lineNumber: 185,
      columnNumber: 7
    }, void 0),
    showSaveDialog && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      SavePresetDialog,
      {
        instrument: currentInstrument,
        onClose: () => setShowSaveDialog(false)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
        lineNumber: 206,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
    lineNumber: 83,
    columnNumber: 5
  }, void 0);
};
const SynthIconDisplay = ({ iconName, size }) => {
  const Icon = LucideIcons[iconName] || Music2;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Icon, { size }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/InstrumentEditorPopout.tsx",
    lineNumber: 218,
    columnNumber: 10
  }, void 0);
};
export {
  InstrumentEditorPopout,
  InstrumentEditorPopout as default
};
