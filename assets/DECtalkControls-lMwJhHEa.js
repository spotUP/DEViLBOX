const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { am as __vitePreload, by as DECtalkSynth, $ as getToneEngine, c9 as ScrollLockContainer, cd as DECTALK_VOICES } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
const DECtalkControls = ({
  config,
  onChange,
  instrumentId
}) => {
  var _a;
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { accent: accentColor, panelBg, panelStyle } = useInstrumentColors("#00ff88");
  const synthRef = reactExports.useRef(null);
  const getSynth = reactExports.useCallback(async () => {
    if (!synthRef.current) {
      try {
        const { getDevilboxAudioContext } = await __vitePreload(async () => {
          const { getDevilboxAudioContext: getDevilboxAudioContext2 } = await import("./main-BbV5VyEH.js").then((n) => n.iK);
          return { getDevilboxAudioContext: getDevilboxAudioContext2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
        const ctx = getDevilboxAudioContext();
        synthRef.current = new DECtalkSynth(configRef.current);
        synthRef.current.output.connect(ctx.destination);
        await synthRef.current.ready();
      } catch (e) {
        console.error("[DECtalk] Failed to create synth:", e);
        return null;
      }
    }
    return synthRef.current;
  }, []);
  reactExports.useEffect(() => {
    if (synthRef.current) {
      synthRef.current.applyConfig(config);
    }
  }, [config]);
  const handleSpeak = reactExports.useCallback(() => {
    var _a2;
    if (!((_a2 = configRef.current.text) == null ? void 0 : _a2.trim())) return;
    getSynth().then((synth) => {
      if (!synth) return;
      synth.speak().catch((e) => console.error("[DECtalk] Speak failed:", e));
    });
  }, [getSynth]);
  const pushConfig = reactExports.useCallback((updates) => {
    onChange(updates);
    if (synthRef.current) {
      synthRef.current.applyConfig(updates);
    }
    if (instrumentId) {
      try {
        getToneEngine().updateNativeSynthConfig(instrumentId, updates);
      } catch {
      }
    }
  }, [onChange, instrumentId]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ScrollLockContainer, { className: "p-4 overflow-y-auto h-full", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "max-w-3xl mx-auto space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase tracking-wider", style: { color: accentColor }, children: "DECtalk Text-to-Speech" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 79,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 78,
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
            className: "flex-1 px-3 py-2 rounded bg-black/30 border border-white/10 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-white/30 font-mono"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
            lineNumber: 84,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleSpeak,
            disabled: !((_a = config.text) == null ? void 0 : _a.trim()),
            className: "px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all text-black hover:brightness-110",
            style: { backgroundColor: accentColor },
            children: "Speak"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
            lineNumber: 92,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 83,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
      lineNumber: 77,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Voice" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 106,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 105,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1.5", children: DECTALK_VOICES.map((name, index) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => pushConfig({ ...configRef.current, voice: index }),
          className: `px-2.5 py-1 rounded text-xs font-medium transition-all ${config.voice === index ? "text-black shadow-md" : "bg-dark-bg/50 text-text-secondary hover:text-text-primary hover:bg-dark-bg"}`,
          style: config.voice === index ? { backgroundColor: accentColor } : void 0,
          children: name
        },
        name,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
          lineNumber: 112,
          columnNumber: 15
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 110,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
      lineNumber: 104,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Parameters" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 131,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 130,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase w-12", children: "Rate" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
            lineNumber: 137,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: 75,
              max: 600,
              step: 5,
              value: config.rate ?? 200,
              onChange: (e) => pushConfig({ ...configRef.current, rate: parseInt(e.target.value) }),
              className: "flex-1 h-1",
              style: { accentColor }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
              lineNumber: 138,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted w-10 text-right font-mono", children: config.rate ?? 200 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
            lineNumber: 146,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
          lineNumber: 136,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase w-12", children: "Pitch" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
            lineNumber: 149,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: 0,
              max: 1,
              step: 0.01,
              value: config.pitch ?? 0.5,
              onChange: (e) => pushConfig({ ...configRef.current, pitch: parseFloat(e.target.value) }),
              className: "flex-1 h-1",
              style: { accentColor }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
              lineNumber: 150,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted w-10 text-right font-mono", children: (config.pitch ?? 0.5).toFixed(2) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
            lineNumber: 158,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
          lineNumber: 148,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted uppercase w-12", children: "Volume" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
            lineNumber: 161,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: 0,
              max: 1,
              step: 0.01,
              value: config.volume ?? 0.8,
              onChange: (e) => pushConfig({ ...configRef.current, volume: parseFloat(e.target.value) }),
              className: "flex-1 h-1",
              style: { accentColor }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
              lineNumber: 162,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted w-10 text-right font-mono", children: (config.volume ?? 0.8).toFixed(2) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
            lineNumber: 170,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
          lineNumber: 160,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 135,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
      lineNumber: 129,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Quick Phrases" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 178,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 177,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1.5", children: [
        "I am DECtalk.",
        "Danger. Danger.",
        "I am sorry Dave, I am afraid I cannot do that.",
        "Resistance is futile.",
        "Exterminate. Exterminate.",
        "I will be back.",
        "Open the pod bay doors.",
        "All your base are belong to us."
      ].map((phrase) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => {
            onChange({ ...configRef.current, text: phrase });
            setTimeout(() => {
              getSynth().then((synth) => {
                if (!synth) return;
                synth.applyConfig({ ...configRef.current, text: phrase });
                synth.speak();
              });
            }, 50);
          },
          className: "px-2 py-1 rounded text-[10px] bg-dark-bg/50 text-text-secondary hover:text-text-primary hover:bg-dark-bg transition-all",
          children: phrase
        },
        phrase,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
          lineNumber: 193,
          columnNumber: 15
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
        lineNumber: 182,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
      lineNumber: 176,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
    lineNumber: 74,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DECtalkControls.tsx",
    lineNumber: 73,
    columnNumber: 5
  }, void 0);
};
export {
  DECtalkControls
};
