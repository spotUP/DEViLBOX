import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, a0 as MessageSquare, a1 as WandSparkles, Q as Activity, a2 as Book, i as ChevronUp, h as ChevronDown, Z as Zap } from "./vendor-ui-AJ7AT9BN.js";
import { c9 as ScrollLockContainer, aB as Knob, ca as SamJs } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { V as VowelEditor } from "./VowelEditor--8udaoKG.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const V2SpeechControls = ({
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
        onChange({ text: phonetic });
      }
    } catch (e) {
      console.error("[V2Speech] Phonetic conversion failed:", e);
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
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ScrollLockContainer, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-controls-flow grid grid-cols-4 gap-2 p-2 h-full overflow-y-auto scrollbar-modern", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MessageSquare, { size: 16, className: "text-amber-500" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
            lineNumber: 59,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "V2 SPEECH TEXT" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
            lineNumber: 60,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
          lineNumber: 58,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1.5 cursor-pointer", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: config.singMode,
              onChange: (e) => onChange({ singMode: e.target.checked }),
              className: "w-3 h-3 rounded border-dark-borderLight bg-transparent"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
              lineNumber: 63,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase font-bold", title: "Enables MIDI note-to-pitch tracking", children: "Sing Mode" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
            lineNumber: 69,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
          lineNumber: 62,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
        lineNumber: 57,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "text",
            value: config.text,
            onChange: (e) => onChange({ text: e.target.value }),
            className: "flex-1 bg-black/40 borderLight rounded-lg px-4 py-3 font-mono text-amber-500 focus:border-amber-500/50 outline-none",
            placeholder: "HELLO WORLD"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
            lineNumber: 74,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleConvertToPhonemes,
            className: "px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-all flex flex-col items-center justify-center min-w-[80px]",
            title: "Convert plain text to phonemes",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WandSparkles, { size: 16, className: "mb-1" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
                lineNumber: 86,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] font-black uppercase tracking-tighter", children: "Convert" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
                lineNumber: 87,
                columnNumber: 13
              }, void 0)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
            lineNumber: 81,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
        lineNumber: 73,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] text-text-muted mt-2 uppercase", children: "Type plain text and click Convert, or enter phonemes directly (e.g., DHAX KWIHK BRAUN FAHKS)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
        lineNumber: 90,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
      lineNumber: 56,
      columnNumber: 7
    }, void 0),
    config.singMode && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
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
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
        lineNumber: 97,
        columnNumber: 9
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, className: "text-amber-500" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
          lineNumber: 109,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-amber-400 uppercase tracking-tight", children: "VOICE PARAMETERS" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
          lineNumber: 110,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
        lineNumber: 108,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.speed,
            min: 0,
            max: 127,
            onChange: (v) => onChange({ speed: v }),
            label: "Speed",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
            lineNumber: 114,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.pitch,
            min: 0,
            max: 127,
            onChange: (v) => onChange({ pitch: v }),
            label: "Pitch",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
            lineNumber: 122,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.formantShift,
            min: 0,
            max: 127,
            onChange: (v) => onChange({ formantShift: v }),
            label: "Formant",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
            lineNumber: 130,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
        lineNumber: 113,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
      lineNumber: 107,
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
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
                lineNumber: 148,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-secondary uppercase tracking-widest", children: "Phoneme Reference" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
                lineNumber: 149,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
              lineNumber: 147,
              columnNumber: 11
            }, void 0),
            showPhonemes ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronUp, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
              lineNumber: 151,
              columnNumber: 27
            }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
              lineNumber: 151,
              columnNumber: 53
            }, void 0)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
          lineNumber: 143,
          columnNumber: 9
        },
        void 0
      ),
      showPhonemes && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-dark-border bg-black/20", children: PHONEMES.map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col p-1.5 rounded bg-dark-bgSecondary/50 border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-amber-500 font-mono", children: p.code }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
          lineNumber: 158,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] text-text-muted uppercase", children: p.example }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
          lineNumber: 159,
          columnNumber: 17
        }, void 0)
      ] }, p.code, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
        lineNumber: 157,
        columnNumber: 15
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
        lineNumber: 155,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
      lineNumber: 142,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-amber-500/5 border border-amber-500/10 rounded-lg p-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 14, className: "text-amber-400 mt-0.5" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
        lineNumber: 168,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] text-amber-400/70 leading-relaxed uppercase", children: "V2 Speech uses the SAM engine. Sing Mode tracks keyboard notes to change pitch. Formant shift adjusts voice character from male to female." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
        lineNumber: 169,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
      lineNumber: 167,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
      lineNumber: 166,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
    lineNumber: 54,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/V2SpeechControls.tsx",
    lineNumber: 53,
    columnNumber: 5
  }, void 0);
};
export {
  V2SpeechControls
};
