import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, a0 as MessageSquare, a1 as WandSparkles, Q as Activity, Z as Zap, a2 as Book, i as ChevronUp, h as ChevronDown } from "./vendor-ui-AJ7AT9BN.js";
import { c9 as ScrollLockContainer, aB as Knob, ca as SamJs } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { V as VowelEditor } from "./VowelEditor--8udaoKG.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const SAMControls = ({
  config,
  onChange
}) => {
  const [showPhonemes, setShowPhonemes] = reactExports.useState(false);
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  });
  const { knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#ffcc33");
  const handleConvertToPhonemes = () => {
    try {
      const phonetic = SamJs.convert(configRef.current.text);
      if (phonetic) {
        onChange({
          text: phonetic,
          phonetic: true
        });
      }
    } catch (e) {
      console.error("[SAM] Phonetic conversion failed:", e);
    }
  };
  const PHONEMES = [
    { code: "IY", example: "beet" },
    { code: "IH", example: "bit" },
    { code: "EH", example: "bet" },
    { code: "AE", example: "bat" },
    { code: "AA", example: "hot" },
    { code: "AH", example: "but" },
    { code: "AO", example: "bought" },
    { code: "OH", example: "bone" },
    { code: "UH", example: "book" },
    { code: "UW", example: "boot" },
    { code: "RR", example: "bird" },
    { code: "LL", example: "lull" },
    { code: "WW", example: "we" },
    { code: "YY", example: "yes" }
  ];
  const handleTextChange = (text) => {
    onChange({ text });
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ScrollLockContainer, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow grid grid-cols-4 gap-2 p-2 h-full overflow-y-auto scrollbar-modern", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MessageSquare, { size: 16, className: "text-amber-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 66,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "SAM TEXT" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 67,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
          lineNumber: 65,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1.5 cursor-pointer", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: config.phonetic,
                onChange: (e) => onChange({ phonetic: e.target.checked }),
                className: "w-3 h-3 rounded border-dark-borderLight bg-transparent"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                lineNumber: 71,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase font-bold", children: "Phonetic" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
              lineNumber: 77,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 70,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1.5 cursor-pointer", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: config.singmode,
                onChange: (e) => onChange({ singmode: e.target.checked }),
                className: "w-3 h-3 rounded border-dark-borderLight bg-transparent"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                lineNumber: 80,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase font-bold", title: "Adjusts pitch based on MIDI notes", children: "Sing" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
              lineNumber: 86,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 79,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
          lineNumber: 69,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
        lineNumber: 64,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "text",
            value: config.text,
            onChange: (e) => handleTextChange(e.target.value),
            className: "flex-1 bg-black/40 borderLight rounded-lg px-4 py-3 font-mono text-amber-500 focus:border-amber-500/50 outline-none",
            placeholder: "COMMODORE SIXTY FOUR"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 92,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleConvertToPhonemes,
            className: "px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-all flex flex-col items-center justify-center min-w-[80px]",
            title: "Convert plain text to SAM phonemes",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WandSparkles, { size: 16, className: "mb-1" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                lineNumber: 104,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] font-black uppercase tracking-tighter", children: "Convert" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                lineNumber: 105,
                columnNumber: 13
              }, void 0)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 99,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
        lineNumber: 91,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
      lineNumber: 63,
      columnNumber: 7
    }, void 0),
    config.singmode && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      VowelEditor,
      {
        vowelSequence: config.vowelSequence ?? [],
        loopSingle: config.vowelLoopSingle ?? true,
        onChange: (seq) => onChange({ vowelSequence: seq }),
        onLoopToggle: (loop) => onChange({ vowelLoopSingle: loop }),
        accentColor: knobColor
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
        lineNumber: 112,
        columnNumber: 9
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg} flex flex-col items-center`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2 w-full", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-amber-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 126,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "VOCAL CHARACTER" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 127,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
          lineNumber: 125,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "w-full max-w-[200px] aspect-square bg-black/60 rounded-lg borderLight relative cursor-crosshair overflow-hidden touch-none",
            "data-prevent-scroll": true,
            onMouseMove: (e) => {
              if (e.buttons === 1) {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(255, (e.clientX - rect.left) / rect.width * 255));
                const y = Math.max(0, Math.min(255, (1 - (e.clientY - rect.top) / rect.height) * 255));
                onChange({ ...configRef.current, mouth: Math.round(x), throat: Math.round(y) });
              }
            },
            onClick: (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = Math.max(0, Math.min(255, (e.clientX - rect.left) / rect.width * 255));
              const y = Math.max(0, Math.min(255, (1 - (e.clientY - rect.top) / rect.height) * 255));
              onChange({ ...configRef.current, mouth: Math.round(x), throat: Math.round(y) });
            },
            onTouchMove: (e) => {
              if (e.touches.length === 1) {
                const touch = e.touches[0];
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(255, (touch.clientX - rect.left) / rect.width * 255));
                const y = Math.max(0, Math.min(255, (1 - (touch.clientY - rect.top) / rect.height) * 255));
                onChange({ ...configRef.current, mouth: Math.round(x), throat: Math.round(y) });
              }
            },
            onTouchStart: (e) => {
              if (e.touches.length === 1) {
                const touch = e.touches[0];
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(255, (touch.clientX - rect.left) / rect.width * 255));
                const y = Math.max(0, Math.min(255, (1 - (touch.clientY - rect.top) / rect.height) * 255));
                onChange({ ...configRef.current, mouth: Math.round(x), throat: Math.round(y) });
              }
            },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-[1px] bg-amber-500" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                  lineNumber: 168,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-full w-[1px] bg-amber-500" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                  lineNumber: 169,
                  columnNumber: 15
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                lineNumber: 167,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "absolute w-3 h-3 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.8)] -translate-x-1/2 translate-y-1/2",
                  style: {
                    left: `${config.mouth / 255 * 100}%`,
                    bottom: `${config.throat / 255 * 100}%`
                  }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                  lineNumber: 173,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute bottom-1 left-2 text-[8px] text-text-muted uppercase font-bold", children: "Mouth (X)" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                lineNumber: 182,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-2 left-1 text-[8px] text-text-muted uppercase font-bold origin-left rotate-90", children: "Throat (Y)" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                lineNumber: 183,
                columnNumber: 13
              }, void 0)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 130,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 mt-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted uppercase font-bold", children: "Mouth" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
              lineNumber: 188,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-amber-500 font-mono font-bold", children: config.mouth }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
              lineNumber: 189,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 187,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted uppercase font-bold", children: "Throat" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
              lineNumber: 192,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-amber-500 font-mono font-bold", children: config.throat }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
              lineNumber: 193,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 191,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
          lineNumber: 186,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
        lineNumber: 124,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16, className: "text-amber-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 201,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "PERFORMANCE" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
            lineNumber: 202,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
          lineNumber: 200,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3 items-center justify-center h-40", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.pitch,
              min: 0,
              max: 255,
              onChange: (v) => onChange({ ...configRef.current, pitch: v }),
              label: "Pitch",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
              lineNumber: 205,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.speed,
              min: 0,
              max: 255,
              onChange: (v) => onChange({ ...configRef.current, speed: v }),
              label: "Speed",
              color: knobColor
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
              lineNumber: 213,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
          lineNumber: 204,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
        lineNumber: 199,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
      lineNumber: 122,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-xl border ${panelBg} overflow-hidden transition-all`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setShowPhonemes(!showPhonemes),
          className: "w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Book, { size: 14, className: "text-amber-500" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                lineNumber: 232,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-secondary uppercase tracking-widest", children: "Phoneme Reference" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
                lineNumber: 233,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
              lineNumber: 231,
              columnNumber: 11
            }, void 0),
            showPhonemes ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronUp, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
              lineNumber: 235,
              columnNumber: 27
            }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
              lineNumber: 235,
              columnNumber: 53
            }, void 0)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
          lineNumber: 227,
          columnNumber: 9
        },
        void 0
      ),
      showPhonemes && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-dark-border bg-black/20", children: PHONEMES.map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col p-1.5 rounded bg-dark-bgSecondary/50 border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-amber-500 font-mono", children: p.code }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
          lineNumber: 242,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] text-text-muted uppercase", children: p.example }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
          lineNumber: 243,
          columnNumber: 17
        }, void 0)
      ] }, p.code, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
        lineNumber: 241,
        columnNumber: 15
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
        lineNumber: 239,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
      lineNumber: 226,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-amber-500/5 border border-amber-500/10 rounded-lg p-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 14, className: "text-amber-400 mt-0.5" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
        lineNumber: 252,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] text-amber-400/70 leading-relaxed uppercase", children: "SAM renders a new buffer on every change. Sing mode allows melodic playback via keyboard." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
        lineNumber: 253,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
      lineNumber: 251,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
      lineNumber: 250,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
    lineNumber: 61,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SAMControls.tsx",
    lineNumber: 60,
    columnNumber: 5
  }, void 0);
};
export {
  SAMControls
};
