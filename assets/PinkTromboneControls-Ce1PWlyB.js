import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cb as PINK_TROMBONE_PRESETS, cc as PinkTromboneSynth, c9 as ScrollLockContainer, aB as Knob } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const PinkTromboneControls = ({
  config,
  onChange
}) => {
  var _a;
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#ff6699");
  const pushConfig = reactExports.useCallback((updates) => {
    onChange(updates);
    const synth = PinkTromboneSynth.getActiveInstance();
    if (synth) synth.applyConfig(updates);
  }, [onChange]);
  const updateParam = reactExports.useCallback((key, value) => {
    pushConfig({ ...configRef.current, [key]: value });
  }, [pushConfig]);
  const handlePresetChange = reactExports.useCallback((presetName) => {
    const preset = PINK_TROMBONE_PRESETS[presetName];
    if (preset) {
      pushConfig({ ...configRef.current, ...preset, preset: presetName });
    }
  }, [pushConfig]);
  const synthRef = reactExports.useRef(null);
  const getSynth = reactExports.useCallback(async () => {
    const active = PinkTromboneSynth.getActiveInstance();
    if (active) return active;
    if (!synthRef.current) {
      synthRef.current = new PinkTromboneSynth(configRef.current);
      const ctx = synthRef.current.output.context;
      synthRef.current.output.connect(ctx.destination);
      await synthRef.current.ready();
    }
    return synthRef.current;
  }, []);
  const handleSpeak = reactExports.useCallback(() => {
    const text = configRef.current.text;
    if (!(text == null ? void 0 : text.trim())) return;
    getSynth().then((synth) => {
      synth.applyConfig(configRef.current);
      synth.speak(text).catch((e) => console.error("[PinkTrombone] Speech failed:", e));
    });
  }, [getSynth]);
  const presetNames = Object.keys(PINK_TROMBONE_PRESETS);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ScrollLockContainer, { className: "p-4 overflow-y-auto h-full", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "max-w-3xl mx-auto space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Text to Speech" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 81,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 80,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "text",
            value: config.text || "",
            onChange: (e) => onChange({ ...configRef.current, text: e.target.value }),
            onKeyDown: (e) => {
              if (e.key === "Enter") handleSpeak();
            },
            placeholder: "Type text and press Speak...",
            className: "flex-1 px-3 py-2 rounded bg-black/30 border border-white/10 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-white/30"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 86,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleSpeak,
            disabled: !((_a = config.text) == null ? void 0 : _a.trim()),
            className: `px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all ${"text-black hover:brightness-110"}`,
            style: { backgroundColor: accentColor },
            children: "Speak"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 94,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 85,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase w-8", children: "Speed" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
          lineNumber: 106,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "range",
            min: 0,
            max: 1,
            step: 0.01,
            value: config.speed ?? 0.5,
            onChange: (e) => pushConfig({ ...configRef.current, speed: parseFloat(e.target.value) }),
            className: "flex-1 h-1 accent-pink-500"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 107,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 105,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-1 flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase w-8", children: "Pitch" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
          lineNumber: 116,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "range",
            min: 0,
            max: 1,
            step: 0.01,
            value: config.speechPitch ?? 0.3,
            onChange: (e) => pushConfig({ ...configRef.current, speechPitch: parseFloat(e.target.value) }),
            className: "flex-1 h-1 accent-pink-500"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 117,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 115,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
      lineNumber: 79,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Vowel Preset" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 130,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 129,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1.5", children: presetNames.map((name) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => handlePresetChange(name),
          className: `px-2.5 py-1 rounded text-xs font-medium transition-all ${config.preset === name ? "text-black shadow-md" : "bg-dark-bg/50 text-text-secondary hover:text-text-primary hover:bg-dark-bg"}`,
          style: config.preset === name ? { backgroundColor: accentColor } : void 0,
          children: name
        },
        name,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
          lineNumber: 136,
          columnNumber: 15
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 134,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
      lineNumber: 128,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Glottis (Voice Source)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 155,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 154,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.tenseness,
            min: 0,
            max: 1,
            step: 0.01,
            onChange: (v) => updateParam("tenseness", v),
            label: "Tenseness",
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 160,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoAmount,
            min: 0,
            max: 1,
            step: 0.01,
            onChange: (v) => updateParam("vibratoAmount", v),
            label: "Vibrato",
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 168,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 159,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
      lineNumber: 153,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Tongue Shape" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 182,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 181,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.tongueIndex,
            min: 0,
            max: 1,
            step: 0.01,
            onChange: (v) => updateParam("tongueIndex", v),
            label: "Position",
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 187,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.tongueDiameter,
            min: 0,
            max: 1,
            step: 0.01,
            onChange: (v) => updateParam("tongueDiameter", v),
            label: "Height",
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 195,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 186,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
      lineNumber: 180,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Lip & Nasal" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 209,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 208,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.lipDiameter,
            min: 0,
            max: 1,
            step: 0.01,
            onChange: (v) => updateParam("lipDiameter", v),
            label: "Lip Shape",
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 214,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.velum,
            min: 0,
            max: 1,
            step: 0.01,
            onChange: (v) => updateParam("velum", v),
            label: "Nasal",
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 222,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 213,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
      lineNumber: 207,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Constriction" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 236,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 235,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.constrictionIndex,
            min: 0,
            max: 1,
            step: 0.01,
            onChange: (v) => updateParam("constrictionIndex", v),
            label: "Position",
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 241,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.constrictionDiameter,
            min: 0,
            max: 1,
            step: 0.01,
            onChange: (v) => updateParam("constrictionDiameter", v),
            label: "Size",
            size: "md",
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
            lineNumber: 249,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
        lineNumber: 240,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
      lineNumber: 234,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
    lineNumber: 76,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/PinkTromboneControls.tsx",
    lineNumber: 75,
    columnNumber: 5
  }, void 0);
};
export {
  PinkTromboneControls
};
