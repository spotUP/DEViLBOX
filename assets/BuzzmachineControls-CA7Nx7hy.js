const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, q as Radio, o as Drum, ax as AudioWaveform, ay as Bomb, az as Phone, aA as Layers, F as FileUp, A as Music, Z as Zap, j as Cpu, $ as Waves, R as React } from "./vendor-ui-AJ7AT9BN.js";
import { bn as BuzzmachineType, eg as getBuzzmachinePresetNames, eh as BUZZMACHINE_PRESETS, W as CustomSelect, bN as BUZZMACHINE_INFO, aB as Knob, am as __vitePreload } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionHeader } from "./SectionHeader-DHk3L-9n.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function getMachineTypeFromString(typeStr) {
  const allTypes = Object.values(BuzzmachineType);
  const found = allTypes.find((t) => t === typeStr);
  return found || BuzzmachineType.ARGURU_DISTORTION;
}
const BuzzmachineEditor = ({
  config,
  onChange
}) => {
  var _a, _b;
  const machineTypeStr = ((_a = config.buzzmachine) == null ? void 0 : _a.machineType) || BuzzmachineType.ARGURU_DISTORTION;
  const machineType = getMachineTypeFromString(machineTypeStr);
  const machineInfo = BUZZMACHINE_INFO[machineType];
  const parameters = ((_b = config.buzzmachine) == null ? void 0 : _b.parameters) || {};
  const presetNames = reactExports.useMemo(() => getBuzzmachinePresetNames(machineType), [machineType]);
  const hasPresets = presetNames.length > 0;
  const handleParameterChange = reactExports.useCallback(
    (paramIndex, value) => {
      onChange({
        buzzmachine: {
          ...config.buzzmachine,
          machineType: machineTypeStr,
          parameters: {
            ...parameters,
            [paramIndex]: value
          }
        }
      });
    },
    [config.buzzmachine, machineTypeStr, parameters, onChange]
  );
  const handlePresetChange = reactExports.useCallback(
    (presetName) => {
      if (!presetName) return;
      const presets = BUZZMACHINE_PRESETS[machineType];
      const presetConfig = presets == null ? void 0 : presets[presetName];
      if (presetConfig) {
        onChange({
          buzzmachine: presetConfig
        });
      }
    },
    [machineType, onChange]
  );
  const formatValue = (param, value) => {
    if (param.type === "byte") {
      if (param.maxValue === 1) {
        return value === 0 ? "Off" : "On";
      }
      return value.toString();
    } else {
      const name = param.name.toLowerCase();
      if (name.includes("gain")) {
        const multiplier = value / 256;
        return `${multiplier.toFixed(2)}x`;
      } else if (name.includes("threshold")) {
        const normalized = value / param.maxValue;
        return `${(normalized * 100).toFixed(0)}%`;
      } else if (name === "cutoff") {
        const normalized = value / param.maxValue;
        return `${(normalized * 100).toFixed(0)}%`;
      } else if (name === "resonance") {
        const normalized = value / param.maxValue;
        return `${(normalized * 100).toFixed(0)}%`;
      } else if (name.includes("time") || name.includes("delay")) {
        return `${value}ms`;
      } else if (name.includes("freq")) {
        return `${value}Hz`;
      }
      return value.toString();
    }
  };
  const getHelpText = () => {
    switch (machineType) {
      case BuzzmachineType.ARGURU_DISTORTION:
        return "Use Saturate mode for warm tube-like distortion. Use Clip mode for hard digital clipping. Enable Phase Inversor for stereo widening.";
      case BuzzmachineType.ELAK_SVF:
        return "High resonance values create self-oscillation (TB-303 style). Automate cutoff for classic acid sweeps.";
      case BuzzmachineType.FSM_KICK:
      case BuzzmachineType.FSM_KICKXP:
        return "Classic electronic kick drum. Trigger with notes - lower notes produce deeper kicks.";
      case BuzzmachineType.JESKOLA_TRILOK:
        return "Versatile drum machine. Use different notes for different drum sounds.";
      case BuzzmachineType.JESKOLA_NOISE:
        return "White/pink noise generator. Great for snares, hi-hats, and sound effects.";
      case BuzzmachineType.OOMEK_AGGRESSOR:
        return "Aggressive bass synth inspired by TB-303. Perfect for acid lines.";
      case BuzzmachineType.JESKOLA_FREEVERB:
        return "High-quality reverb based on Freeverb algorithm. Use for spatial effects.";
      case BuzzmachineType.JESKOLA_DELAY:
      case BuzzmachineType.JESKOLA_CROSSDELAY:
        return "Classic delay effect. CrossDelay adds stereo ping-pong effect.";
      case BuzzmachineType.FSM_CHORUS:
      case BuzzmachineType.FSM_CHORUS2:
        return "Lush chorus effect for thickening sounds. Chorus2 has more modulation options.";
      case BuzzmachineType.GEONIK_COMPRESSOR:
        return "Dynamic range compressor. Use for punchy drums or glue on buses.";
      case BuzzmachineType.OOMEK_MASTERIZER:
        return "Mastering processor with limiting and enhancement.";
      default:
        if (machineInfo.type === "generator") {
          return "Sound generator. Trigger with MIDI notes to produce audio.";
        }
        return "Audio effect processor. Route audio through this for processing.";
    }
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    hasPresets && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#06b6d4", title: "Presets" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
        lineNumber: 166,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          onChange: (v) => handlePresetChange(v),
          className: "w-full bg-dark-bgTertiary border border-dark-borderLight rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-highlight focus:border-transparent transition-all",
          placeholder: "Select preset...",
          value: "",
          options: presetNames.map((name) => ({ value: name, label: name }))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
          lineNumber: 167,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
      lineNumber: 165,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#8b5cf6", title: `${machineInfo.name} Parameters` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
        lineNumber: 179,
        columnNumber: 9
      }, void 0),
      machineInfo.parameters.length > 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6", children: machineInfo.parameters.map((param) => {
        const currentValue = parameters[param.index] ?? param.defaultValue;
        const isSwitch = param.type === "byte" && param.maxValue === 1;
        if (isSwitch) {
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center justify-center space-y-2 p-2 bg-dark-bgSecondary/50 rounded-lg border border-dark-border", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-secondary uppercase tracking-wider text-center h-8 flex items-center", children: param.name }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
              lineNumber: 190,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleParameterChange(param.index, currentValue === 0 ? 1 : 0),
                className: `
                        w-full py-2 px-2 rounded font-bold text-[10px] transition-all
                        ${currentValue === 1 ? "bg-green-600/20 text-green-400 ring-1 ring-green-500" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover"}
                      `,
                children: currentValue === 1 ? "ON" : "OFF"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
                lineNumber: 193,
                columnNumber: 21
              },
              void 0
            )
          ] }, param.index, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
            lineNumber: 189,
            columnNumber: 19
          }, void 0);
        }
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: currentValue,
            min: param.minValue,
            max: param.maxValue,
            onChange: (v) => handleParameterChange(param.index, Math.round(v)),
            label: param.name,
            size: "sm",
            color: "#8b5cf6",
            formatValue: (v) => formatValue(param, v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
            lineNumber: 211,
            columnNumber: 19
          },
          void 0
        ) }, param.index, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
          lineNumber: 210,
          columnNumber: 17
        }, void 0);
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
        lineNumber: 182,
        columnNumber: 11
      }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center py-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-text-muted text-sm italic", children: "No parameters available for this machine." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
        lineNumber: 227,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
        lineNumber: 226,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
      lineNumber: 178,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-blue-900/10 rounded-xl p-4 border border-blue-900/30", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-blue-300/80 leading-relaxed italic", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-blue-400 font-bold not-italic", children: "TIP:" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
        lineNumber: 237,
        columnNumber: 11
      }, void 0),
      " ",
      getHelpText()
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
      lineNumber: 236,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
      lineNumber: 235,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/BuzzmachineEditor.tsx",
    lineNumber: 162,
    columnNumber: 5
  }, void 0);
};
const useBuzzmachineParam = (config, onChange) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  });
  return reactExports.useCallback(
    (paramIndex, value) => {
      var _a, _b;
      const currentParams = ((_a = configRef.current.buzzmachine) == null ? void 0 : _a.parameters) || {};
      const machineType = ((_b = configRef.current.buzzmachine) == null ? void 0 : _b.machineType) || "ArguruDistortion";
      onChange({
        buzzmachine: {
          machineType,
          ...configRef.current.buzzmachine,
          parameters: {
            ...currentParams,
            [paramIndex]: value
          }
        }
      });
    },
    [onChange]
  );
};
const FSMKickEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const startFreq = params[1] ?? 198;
  const endFreq = params[2] ?? 64;
  const toneDecTime = params[3] ?? 46;
  const toneDecShape = params[4] ?? 27;
  const ampDecTime = params[5] ?? 55;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-red-600 to-orange-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Drum, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 28,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 27,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "FSM Kick" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 31,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "Kick Drum by Krzysztof Foltman" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 32,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 30,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
      lineNumber: 26,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
      lineNumber: 25,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#ef4444", title: "Pitch" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 41,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: startFreq,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(1, Math.round(v)),
              label: "Start",
              color: "#ef4444",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 43,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: endFreq,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(2, Math.round(v)),
              label: "End",
              color: "#ef4444",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 52,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 42,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 40,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#f97316", title: "Envelope" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 66,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: toneDecTime,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(3, Math.round(v)),
              label: "Tone Dec",
              color: "#f97316",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 68,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: toneDecShape,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(4, Math.round(v)),
              label: "Tone Shape",
              color: "#f97316",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 77,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: ampDecTime,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(5, Math.round(v)),
              label: "Amp Dec",
              color: "#f97316",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 86,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 67,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 65,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
      lineNumber: 38,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
    lineNumber: 23,
    columnNumber: 5
  }, void 0);
};
const FSMKickXPEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const startFreq = params[1] ?? 145;
  const endFreq = params[2] ?? 50;
  const buzz = params[3] ?? 55;
  const click = params[4] ?? 28;
  const punch = params[5] ?? 47;
  const toneDecRate = params[6] ?? 30;
  const toneDecShape = params[7] ?? 27;
  const buzzDecRate = params[8] ?? 55;
  const cpDecRate = params[9] ?? 55;
  const ampDecSlope = params[10] ?? 1;
  const ampDecTime = params[11] ?? 32;
  const ampRelSlope = params[12] ?? 105;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-red-600 to-pink-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Drum, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 131,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 130,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "FSM KickXP" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 134,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "Extended Kick Drum by FSM" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 135,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 133,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
      lineNumber: 129,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
      lineNumber: 128,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#ef4444", title: "Pitch" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 144,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: startFreq,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(1, Math.round(v)),
              label: "Start",
              size: "sm",
              color: "#ef4444",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 146,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: endFreq,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(2, Math.round(v)),
              label: "End",
              size: "sm",
              color: "#ef4444",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 156,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: toneDecRate,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(6, Math.round(v)),
              label: "Dec Rate",
              size: "sm",
              color: "#ef4444",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 166,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: toneDecShape,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(7, Math.round(v)),
              label: "Dec Shape",
              size: "sm",
              color: "#ef4444",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 176,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 145,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 143,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#f97316", title: "Character" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 191,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: buzz,
              min: 0,
              max: 100,
              onChange: (v) => updateParam(3, Math.round(v)),
              label: "Buzz",
              size: "sm",
              color: "#f97316",
              formatValue: (v) => `${Math.round(v)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 193,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: click,
              min: 0,
              max: 100,
              onChange: (v) => updateParam(4, Math.round(v)),
              label: "Click",
              size: "sm",
              color: "#f97316",
              formatValue: (v) => `${Math.round(v)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 203,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: punch,
              min: 0,
              max: 100,
              onChange: (v) => updateParam(5, Math.round(v)),
              label: "Punch",
              size: "sm",
              color: "#f97316",
              formatValue: (v) => `${Math.round(v)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 213,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: buzzDecRate,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(8, Math.round(v)),
              label: "Buzz Dec",
              size: "sm",
              color: "#f97316",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 223,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: cpDecRate,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(9, Math.round(v)),
              label: "C+P Dec",
              size: "sm",
              color: "#f97316",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 233,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 192,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 190,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#eab308", title: "Amplitude" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 248,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: ampDecSlope,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(10, Math.round(v)),
              label: "Dec Slope",
              color: "#eab308",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 250,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: ampDecTime,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(11, Math.round(v)),
              label: "Dec Time",
              color: "#eab308",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 259,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: ampRelSlope,
              min: 1,
              max: 240,
              onChange: (v) => updateParam(12, Math.round(v)),
              label: "Rel Slope",
              color: "#eab308",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 268,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 249,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 247,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
      lineNumber: 141,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
    lineNumber: 126,
    columnNumber: 5
  }, void 0);
};
const OomekAggressorEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const oscType = params[0] ?? 0;
  const cutoff = params[1] ?? 120;
  const resonance = params[2] ?? 64;
  const envMod = params[3] ?? 64;
  const decay = params[4] ?? 64;
  const accent = params[5] ?? 64;
  const finetune = params[6] ?? 100;
  const volume = params[7] ?? 100;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-red-500 to-orange-500", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 308,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 307,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "Oomek Aggressor 3o3" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 311,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "303-Style Acid Synth by Radoslaw Dutkiewicz" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 312,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 310,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
      lineNumber: 306,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
      lineNumber: 305,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#ef4444", title: "Oscillator" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 321,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 justify-center mb-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateParam(0, 0),
              className: `
                flex-1 max-w-32 py-3 rounded-lg font-bold transition-all
                ${oscType === 0 ? "bg-red-500/20 text-red-400 ring-2 ring-red-500" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}
              `,
              children: "SAW"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 323,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => updateParam(0, 1),
              className: `
                flex-1 max-w-32 py-3 rounded-lg font-bold transition-all
                ${oscType === 1 ? "bg-red-500/20 text-red-400 ring-2 ring-red-500" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}
              `,
              children: "SQUARE"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 335,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 322,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: finetune,
            min: 0,
            max: 200,
            onChange: (v) => updateParam(6, Math.round(v)),
            label: "Finetune",
            color: "#ef4444",
            bipolar: true,
            formatValue: (v) => `${Math.round(v - 100)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
            lineNumber: 349,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 348,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 320,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#f97316", title: "Filter" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 364,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: cutoff,
              min: 0,
              max: 240,
              onChange: (v) => updateParam(1, Math.round(v)),
              label: "Cutoff",
              color: "#f97316",
              formatValue: (v) => `${Math.round(v / 2.4)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 366,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: resonance,
              min: 0,
              max: 128,
              onChange: (v) => updateParam(2, Math.round(v)),
              label: "Resonance",
              color: "#f97316",
              formatValue: (v) => `${Math.round(v / 1.28)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 375,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: envMod,
              min: 0,
              max: 128,
              onChange: (v) => updateParam(3, Math.round(v)),
              label: "Env Mod",
              color: "#f97316",
              formatValue: (v) => `${Math.round(v / 1.28)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 384,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 365,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 363,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#eab308", title: "Envelope & Output" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 398,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: decay,
              min: 0,
              max: 128,
              onChange: (v) => updateParam(4, Math.round(v)),
              label: "Decay",
              color: "#eab308",
              formatValue: (v) => `${Math.round(v / 1.28)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 400,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: accent,
              min: 0,
              max: 128,
              onChange: (v) => updateParam(5, Math.round(v)),
              label: "Accent",
              color: "#eab308",
              formatValue: (v) => `${Math.round(v / 1.28)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 409,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: volume,
              min: 0,
              max: 200,
              onChange: (v) => updateParam(7, Math.round(v)),
              label: "Volume",
              color: "#eab308",
              formatValue: (v) => `${Math.round(v / 2)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
              lineNumber: 418,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
          lineNumber: 399,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
        lineNumber: 397,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
      lineNumber: 318,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/DrumEditors.tsx",
    lineNumber: 303,
    columnNumber: 5
  }, void 0);
};
const JeskolaTrilokEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const bdTone = params[0] ?? 64;
  const bdDecay = params[1] ?? 64;
  const bdVolume = params[2] ?? 128;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-orange-600 to-red-700", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Drum, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 26,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 25,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "Jeskola Trilok" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 29,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "Drum Machine by Oskari Tammelin" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 30,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 28,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 24,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 23,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#ef4444", title: "Bass Drum" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 39,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: bdTone,
              min: 0,
              max: 127,
              onChange: (v) => updateParam(0, Math.round(v)),
              label: "Tone",
              color: "#ef4444",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 41,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: bdDecay,
              min: 0,
              max: 127,
              onChange: (v) => updateParam(1, Math.round(v)),
              label: "Decay",
              color: "#ef4444",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 50,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: bdVolume,
              min: 0,
              max: 254,
              onChange: (v) => updateParam(2, Math.round(v)),
              label: "Volume",
              color: "#ef4444",
              formatValue: (v) => `${Math.round(v / 2.54)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 59,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 40,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 38,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary/50 rounded-lg p-4 border border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary leading-relaxed", children: "Trigger notes to play the bass drum. Use tracker note commands to control pitch and velocity." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 73,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 72,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 36,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
    lineNumber: 21,
    columnNumber: 5
  }, void 0);
};
const JeskolaNoiseEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const attack = params[0] ?? 16;
  const sustain = params[1] ?? 16;
  const release = params[2] ?? 512;
  const color = params[3] ?? 4096;
  const volume = params[4] ?? 128;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-gray-500 to-gray-700", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AudioWaveform, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 104,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 103,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "Jeskola Noise" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 107,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "Noise Generator by Oskari Tammelin" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 108,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 106,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 102,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 101,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#6b7280", title: "Envelope" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 117,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: attack,
              min: 1,
              max: 65535,
              onChange: (v) => updateParam(0, Math.round(v)),
              label: "Attack",
              color: "#6b7280",
              formatValue: (v) => `${Math.round(v)}ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 119,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: sustain,
              min: 1,
              max: 65535,
              onChange: (v) => updateParam(1, Math.round(v)),
              label: "Sustain",
              color: "#6b7280",
              formatValue: (v) => `${Math.round(v)}ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 128,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: release,
              min: 1,
              max: 65535,
              onChange: (v) => updateParam(2, Math.round(v)),
              label: "Release",
              color: "#6b7280",
              formatValue: (v) => `${Math.round(v)}ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 137,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 118,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 116,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#a855f7", title: "Tone" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 151,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: color,
              min: 0,
              max: 4096,
              onChange: (v) => updateParam(3, Math.round(v)),
              label: "Color",
              size: "lg",
              color: "#a855f7",
              formatValue: (v) => v < 1365 ? "Dark" : v < 2730 ? "Mid" : "Bright"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 153,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: volume,
              min: 0,
              max: 254,
              onChange: (v) => updateParam(4, Math.round(v)),
              label: "Volume",
              size: "lg",
              color: "#a855f7",
              formatValue: (v) => `${Math.round(v / 2.54)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 163,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 152,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 150,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 114,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
    lineNumber: 99,
    columnNumber: 5
  }, void 0);
};
const CyanPhaseDTMFEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const digit = params[0] ?? 0;
  const length = (params[1] ?? 100) | (params[2] ?? 0) << 8;
  const volume = params[3] ?? 128;
  const digitLabels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#", "A", "B", "C", "D"];
  const updateWord = (lowIndex, highIndex, value) => {
    const low = value & 255;
    const high = value >> 8 & 255;
    updateParam(lowIndex, low);
    updateParam(highIndex, high);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Phone, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 208,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 207,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "CyanPhase DTMF" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 211,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "Dial Tone Generator by CyanPhase" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 212,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 210,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 206,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 205,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#06b6d4", title: "Digit" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 221,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2", children: digitLabels.map((label, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam(0, idx),
            className: `
                  py-3 rounded-lg font-bold text-lg transition-all
                  ${digit === idx ? "bg-accent-highlight/20 text-accent-highlight ring-2 ring-accent-highlight" : "bg-dark-bgTertiary text-text-secondary hover:text-text-secondary hover:bg-dark-bgHover"}
                `,
            children: label
          },
          idx,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
            lineNumber: 224,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 222,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 220,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#3b82f6", title: "Output" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 243,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: length,
              min: 1,
              max: 65535,
              onChange: (v) => updateWord(1, 2, Math.round(v)),
              label: "Length",
              color: "#3b82f6",
              formatValue: (v) => `${Math.round(v)}ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 245,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: volume,
              min: 0,
              max: 255,
              onChange: (v) => updateParam(3, Math.round(v)),
              label: "Volume",
              color: "#3b82f6",
              formatValue: (v) => `${Math.round(v / 2.55)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 254,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 244,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 242,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 218,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
    lineNumber: 203,
    columnNumber: 5
  }, void 0);
};
const ElenzilFrequencyBombEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const startFreq = (params[0] ?? 0) | (params[1] ?? 4) << 8;
  const endFreq = (params[2] ?? 100) | (params[3] ?? 0) << 8;
  const freqAttack = (params[4] ?? 10) | (params[5] ?? 0) << 8;
  const attackUnit = params[6] ?? 4;
  const volume = params[7] ?? 128;
  const wave = params[8] ?? 0;
  const wavePower = params[9] ?? 1;
  const waveLabels = ["Sine", "Saw", "Square", "Triangle", "Noise"];
  const unitLabels = ["", "ms", "tick", "256th", "sec"];
  const updateWord = (lowIndex, highIndex, value) => {
    const low = value & 255;
    const high = value >> 8 & 255;
    updateParam(lowIndex, low);
    updateParam(highIndex, high);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Bomb, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 303,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 302,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "Elenzil FrequencyBomb" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 306,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "Frequency Sweep Generator by Elenzil" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 307,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 305,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 301,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 300,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#f97316", title: "Frequency Sweep" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 316,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: startFreq,
              min: 0,
              max: 65534,
              onChange: (v) => updateWord(0, 1, Math.round(v)),
              label: "Start",
              color: "#f97316",
              formatValue: (v) => `${Math.round(v)}Hz`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 318,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: endFreq,
              min: 0,
              max: 65534,
              onChange: (v) => updateWord(2, 3, Math.round(v)),
              label: "End",
              color: "#f97316",
              formatValue: (v) => `${Math.round(v)}Hz`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 327,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: freqAttack,
              min: 0,
              max: 65534,
              onChange: (v) => updateWord(4, 5, Math.round(v)),
              label: `Attack (${unitLabels[attackUnit] || "ms"})`,
              color: "#f97316",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 336,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 317,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center mt-4 gap-1", children: [1, 2, 3, 4].map((unit) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam(6, unit),
            className: `
                  px-3 py-1 text-xs rounded font-medium transition-all
                  ${attackUnit === unit ? "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}
                `,
            children: unitLabels[unit]
          },
          unit,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
            lineNumber: 349,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 347,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 315,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#ef4444", title: "Waveform" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 368,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 mb-4", children: waveLabels.map((label, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam(8, idx),
            className: `
                  flex-1 py-2 rounded-lg font-bold text-xs transition-all
                  ${wave === idx ? "bg-red-500/20 text-red-400 ring-1 ring-red-500" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}
                `,
            children: label
          },
          idx,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
            lineNumber: 371,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 369,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: wavePower,
              min: 1,
              max: 13,
              onChange: (v) => updateParam(9, Math.round(v)),
              label: "Power",
              color: "#ef4444",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 387,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: volume,
              min: 0,
              max: 240,
              onChange: (v) => updateParam(7, Math.round(v)),
              label: "Volume",
              color: "#ef4444",
              formatValue: (v) => `${Math.round(v / 2.4)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
              lineNumber: 396,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
          lineNumber: 386,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
        lineNumber: 367,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
      lineNumber: 313,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/OscillatorEditors.tsx",
    lineNumber: 298,
    columnNumber: 5
  }, void 0);
};
const MadBrain4FM2FEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const routing = params[0] ?? 1;
  const osc4Wave = params[1] ?? 1;
  const osc4Freq = params[2] ?? 1;
  const osc4Fine = params[3] ?? 0;
  const osc4Vol = params[4] ?? 32;
  const waveLabels = ["", "Sine", "Tri", "Saw", "Square", "Noise", "S&H", "Ramp", "PW25", "PW12", "PW6", "Harm2", "Harm3", "Harm4", "Harm5", "Harm6", "Harm7"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cpu, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 31,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 30,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "MadBrain 4FM2F" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 34,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "4-Op FM Synth by MadBrain" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 35,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 33,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 29,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 28,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#8b5cf6", title: "FM Routing" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 44,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: routing,
            min: 1,
            max: 15,
            onChange: (v) => updateParam(0, Math.round(v)),
            label: "Algorithm",
            size: "lg",
            color: "#8b5cf6",
            formatValue: (v) => `Alg ${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
            lineNumber: 46,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 45,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 43,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#6366f1", title: "Oscillator 4" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 61,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-secondary mb-2 block", children: "Waveform" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
            lineNumber: 63,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(osc4Wave),
              onChange: (v) => updateParam(1, parseInt(v)),
              className: "w-full bg-dark-bgTertiary border border-dark-borderLight rounded-lg px-3 py-2 text-sm text-text-primary",
              options: waveLabels.slice(1).map((label, idx) => ({
                value: String(idx + 1),
                label
              }))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 64,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 62,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: osc4Freq,
              min: 0,
              max: 32,
              onChange: (v) => updateParam(2, Math.round(v)),
              label: "Ratio",
              color: "#6366f1",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 75,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: osc4Fine,
              min: 0,
              max: 254,
              onChange: (v) => updateParam(3, Math.round(v)),
              label: "Fine",
              color: "#6366f1",
              bipolar: true,
              formatValue: (v) => `${Math.round(v - 127)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 84,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: osc4Vol,
              min: 0,
              max: 64,
              onChange: (v) => updateParam(4, Math.round(v)),
              label: "Volume",
              color: "#6366f1",
              formatValue: (v) => `${Math.round(v / 0.64)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 94,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 74,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 60,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 41,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
    lineNumber: 26,
    columnNumber: 5
  }, void 0);
};
const MadBrainDynamite6Editor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const coarse = params[0] ?? 128;
  const fine = params[1] ?? 128;
  const amp = params[2] ?? 32;
  const attack = params[3] ?? 4;
  const decay = params[4] ?? 255;
  const routing = params[5] ?? 0;
  const release = params[6] ?? 61440;
  const routingLabels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 135,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 134,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "MadBrain Dynamite6" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 138,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "6-Voice Synth by MadBrain" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 139,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 137,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 133,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 132,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#eab308", title: "Pitch" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 148,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: coarse,
              min: 1,
              max: 255,
              onChange: (v) => updateParam(0, Math.round(v)),
              label: "Coarse",
              color: "#eab308",
              bipolar: true,
              formatValue: (v) => `${Math.round(v - 128)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 150,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: fine,
              min: 1,
              max: 255,
              onChange: (v) => updateParam(1, Math.round(v)),
              label: "Fine",
              color: "#eab308",
              bipolar: true,
              formatValue: (v) => `${Math.round(v - 128)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 160,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 149,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 147,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#f97316", title: "Envelope" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 175,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: attack,
              min: 0,
              max: 254,
              onChange: (v) => updateParam(3, Math.round(v)),
              label: "Attack",
              size: "sm",
              color: "#f97316",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 177,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: decay,
              min: 1,
              max: 255,
              onChange: (v) => updateParam(4, Math.round(v)),
              label: "Decay",
              size: "sm",
              color: "#f97316",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 187,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: release,
              min: 1,
              max: 65535,
              onChange: (v) => updateParam(6, Math.round(v)),
              label: "Release",
              size: "sm",
              color: "#f97316",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 197,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: amp,
              min: 1,
              max: 255,
              onChange: (v) => updateParam(2, Math.round(v)),
              label: "Amp",
              size: "sm",
              color: "#f97316",
              formatValue: (v) => `${Math.round(v / 2.55)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 207,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 176,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 174,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#f59e0b", title: "Routing" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 222,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1 justify-center", children: routingLabels.map((label, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam(5, idx),
            className: `
                  w-10 h-10 rounded-lg font-bold text-sm transition-all
                  ${routing === idx ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}
                `,
            children: label
          },
          idx,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
            lineNumber: 225,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 223,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 221,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 145,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
    lineNumber: 130,
    columnNumber: 5
  }, void 0);
};
const MakkM3Editor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const osc1Wave = params[0] ?? 0;
  const pw1 = params[1] ?? 64;
  const osc2Wave = params[2] ?? 0;
  const pw2 = params[3] ?? 64;
  const mix = params[4] ?? 64;
  const mixType = params[5] ?? 0;
  const semiDetune = params[6] ?? 64;
  const fineDetune = params[7] ?? 64;
  const glide = params[8] ?? 0;
  const subOscWave = params[9] ?? 0;
  const subOscVol = params[10] ?? 64;
  const waveLabels = ["Sine", "Tri", "Saw", "Square", "Noise", "S&H"];
  const mixTypeLabels = ["Add", "Ring", "AM", "FM", "Sync", "HSync", "Osc1", "Osc2", "Sub"];
  const subWaveLabels = ["Sine", "Tri", "Saw", "Square", "Noise"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-green-500 to-teal-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 278,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 277,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "Makk M3" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 281,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "2-Osc Subtractive Synth by MAKK" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 282,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 280,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 276,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 275,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#22c55e", title: "Oscillator 1" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 291,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 mb-3", children: waveLabels.map((label, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam(0, idx),
            className: `
                  flex-1 py-1.5 rounded text-xs font-bold transition-all
                  ${osc1Wave === idx ? "bg-green-500/20 text-green-400 ring-1 ring-green-500" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}
                `,
            children: label
          },
          idx,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
            lineNumber: 294,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 292,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: pw1,
            min: 0,
            max: 127,
            onChange: (v) => updateParam(1, Math.round(v)),
            label: "Pulse Width",
            size: "sm",
            color: "#22c55e",
            formatValue: (v) => `${Math.round(v / 1.27)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
            lineNumber: 310,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 309,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 290,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#14b8a6", title: "Oscillator 2" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 325,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 mb-3", children: waveLabels.map((label, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam(2, idx),
            className: `
                  flex-1 py-1.5 rounded text-xs font-bold transition-all
                  ${osc2Wave === idx ? "bg-teal-500/20 text-teal-400 ring-1 ring-teal-500" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}
                `,
            children: label
          },
          idx,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
            lineNumber: 328,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 326,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: pw2,
              min: 0,
              max: 127,
              onChange: (v) => updateParam(3, Math.round(v)),
              label: "Pulse Width",
              size: "sm",
              color: "#14b8a6",
              formatValue: (v) => `${Math.round(v / 1.27)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 344,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: semiDetune,
              min: 0,
              max: 127,
              onChange: (v) => updateParam(6, Math.round(v)),
              label: "Semi",
              size: "sm",
              color: "#14b8a6",
              bipolar: true,
              formatValue: (v) => `${Math.round(v - 64)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 354,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: fineDetune,
              min: 0,
              max: 127,
              onChange: (v) => updateParam(7, Math.round(v)),
              label: "Fine",
              size: "sm",
              color: "#14b8a6",
              bipolar: true,
              formatValue: (v) => `${Math.round(v - 64)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 365,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 343,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 324,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#10b981", title: "Mix & Sub" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 381,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 mb-3 flex-wrap", children: mixTypeLabels.map((label, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam(5, idx),
            className: `
                  px-2 py-1 rounded text-xs font-bold transition-all
                  ${mixType === idx ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}
                `,
            children: label
          },
          idx,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
            lineNumber: 384,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 382,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: mix,
              min: 0,
              max: 127,
              onChange: (v) => updateParam(4, Math.round(v)),
              label: "Mix",
              size: "sm",
              color: "#10b981",
              formatValue: (v) => `${Math.round(v / 1.27)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 400,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: glide,
              min: 0,
              max: 127,
              onChange: (v) => updateParam(8, Math.round(v)),
              label: "Glide",
              size: "sm",
              color: "#10b981",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 410,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted mb-1", children: "Sub Wave" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 421,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                value: String(subOscWave),
                onChange: (v) => updateParam(9, parseInt(v)),
                className: "bg-dark-bgTertiary border border-dark-borderLight rounded px-2 py-1 text-xs text-text-primary",
                options: subWaveLabels.map((label, idx) => ({
                  value: String(idx),
                  label
                }))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
                lineNumber: 422,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
            lineNumber: 420,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: subOscVol,
              min: 0,
              max: 127,
              onChange: (v) => updateParam(10, Math.round(v)),
              label: "Sub Vol",
              size: "sm",
              color: "#10b981",
              formatValue: (v) => `${Math.round(v / 1.27)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 432,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 399,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 380,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 288,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
    lineNumber: 273,
    columnNumber: 5
  }, void 0);
};
const MakkM4Editor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const fileInputRef = reactExports.useRef(null);
  const osc1Wave = params[0] ?? 0;
  const osc2Wave = params[1] ?? 0;
  const mix = params[2] ?? 64;
  const detune = params[3] ?? 64;
  const glide = params[5] ?? 0;
  const cutoff = params[10] ?? 255;
  const resonance = params[11] ?? 0;
  const handleImport = async (e) => {
    var _a2, _b;
    const file = (_a2 = e.target.files) == null ? void 0 : _a2[0];
    if (!file) return;
    try {
      let wavetableData = [];
      if (file.name.endsWith(".h")) {
        const text = await file.text();
        wavetableData = text.split(/[\s,]+/).map((v) => parseInt(v)).filter((v) => !isNaN(v));
      } else {
        const { getDevilboxAudioContext } = await __vitePreload(async () => {
          const { getDevilboxAudioContext: getDevilboxAudioContext2 } = await import("./main-BbV5VyEH.js").then((n) => n.iK);
          return { getDevilboxAudioContext: getDevilboxAudioContext2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
        let audioCtx;
        try {
          audioCtx = getDevilboxAudioContext();
        } catch {
          audioCtx = new AudioContext();
        }
        const arrayBuffer = await file.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        const rawData = buffer.getChannelData(0);
        wavetableData = Array.from(rawData).map((v) => Math.round((v + 1) / 2 * 255));
      }
      if (wavetableData.length > 0) {
        onChange({
          buzzmachine: {
            ...config.buzzmachine,
            customWaves: {
              ...((_b = config.buzzmachine) == null ? void 0 : _b.customWaves) || {},
              [osc1Wave]: wavetableData
            }
          }
        });
      }
    } catch (err) {
      console.error("Failed to import M4 wave:", err);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Layers, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 513,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 512,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "Makk M4" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 516,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "2-Osc Wavetable Synth by MAKK" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 517,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 515,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 511,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 510,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#8b5cf6", title: "Oscillators" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
            lineNumber: 526,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => {
                var _a2;
                return (_a2 = fileInputRef.current) == null ? void 0 : _a2.click();
              },
              className: "flex items-center gap-1.5 px-2 py-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded text-[10px] font-bold uppercase hover:bg-indigo-500/30 transition-colors",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileUp, { size: 12 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
                  lineNumber: 531,
                  columnNumber: 15
                }, void 0),
                "Import Wave"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 527,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              ref: fileInputRef,
              type: "file",
              accept: ".wav,.h",
              onChange: handleImport,
              className: "hidden"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 534,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 525,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-6", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] font-bold text-text-muted uppercase tracking-wider", children: "Osc 1 Wave" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 545,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                value: osc1Wave,
                min: 0,
                max: 127,
                onChange: (v) => updateParam(0, Math.round(v)),
                label: "Wave Index",
                color: "#8b5cf6",
                formatValue: (v) => `Index ${Math.round(v)}`
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
                lineNumber: 546,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
            lineNumber: 544,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] font-bold text-text-muted uppercase tracking-wider", children: "Osc 2 Wave" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 557,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                value: osc2Wave,
                min: 0,
                max: 127,
                onChange: (v) => updateParam(1, Math.round(v)),
                label: "Wave Index",
                color: "#a855f7",
                formatValue: (v) => `Index ${Math.round(v)}`
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
                lineNumber: 558,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
            lineNumber: 556,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 543,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end mt-6", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: mix,
              min: 0,
              max: 127,
              onChange: (v) => updateParam(2, Math.round(v)),
              label: "Mix",
              color: "#8b5cf6",
              formatValue: (v) => `${Math.round(v / 1.27)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 571,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: detune,
              min: 0,
              max: 127,
              onChange: (v) => updateParam(3, Math.round(v)),
              label: "Detune",
              color: "#8b5cf6",
              bipolar: true,
              formatValue: (v) => `${Math.round(v - 64)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 580,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: glide,
              min: 0,
              max: 127,
              onChange: (v) => updateParam(5, Math.round(v)),
              label: "Glide",
              color: "#8b5cf6",
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 590,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 570,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 524,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#ec4899", title: "Filter" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 604,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: cutoff,
              min: 0,
              max: 255,
              onChange: (v) => updateParam(10, Math.round(v)),
              label: "Cutoff",
              color: "#ec4899",
              formatValue: (v) => `${Math.round(v / 2.55)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 606,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: resonance,
              min: 0,
              max: 255,
              onChange: (v) => updateParam(11, Math.round(v)),
              label: "Resonance",
              color: "#ec4899",
              formatValue: (v) => `${Math.round(v / 2.55)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
              lineNumber: 615,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
          lineNumber: 605,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
        lineNumber: 603,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
      lineNumber: 522,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FMEditors.tsx",
    lineNumber: 508,
    columnNumber: 5
  }, void 0);
};
const JeskolaDelayEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const dryThru = params[0] ?? 1;
  const length = (params[1] ?? 3) | (params[2] ?? 0) << 8;
  const lengthUnit = params[3] ?? 0;
  const feedback = params[4] ?? 96;
  const wetOut = params[5] ?? 48;
  const unitLabels = ["tick", "ms", "sample", "1/256 tick"];
  const updateWord = (lowIndex, highIndex, value) => {
    const low = value & 255;
    const high = value >> 8 & 255;
    updateParam(lowIndex, low);
    updateParam(highIndex, high);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 35,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 34,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "Jeskola Delay" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 38,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "Mono Delay by Oskari Tammelin" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 39,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 37,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 33,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 32,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#3b82f6", title: "Time" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 45,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: length, min: 1, max: 65535, onChange: (v) => updateWord(1, 2, Math.round(v)), label: "Length", size: "lg", color: "#3b82f6", formatValue: (v) => Math.round(v).toString() }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 47,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 46,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center mt-4 gap-1", children: unitLabels.map((label, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: () => updateParam(3, idx), className: `px-2 py-1 text-xs rounded font-medium transition-all ${lengthUnit === idx ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}`, children: label }, idx, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 51,
          columnNumber: 15
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 49,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 44,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#06b6d4", title: "Mix" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 56,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-secondary", children: "Dry Thru" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
              lineNumber: 59,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: () => updateParam(0, dryThru === 1 ? 0 : 1), className: `px-4 py-2 rounded-lg font-bold text-sm transition-all ${dryThru === 1 ? "bg-accent-highlight/20 text-accent-highlight ring-1 ring-accent-highlight" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}`, children: dryThru === 1 ? "ON" : "OFF" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
              lineNumber: 60,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 58,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: feedback, min: 0, max: 128, onChange: (v) => updateParam(4, Math.round(v)), label: "Feedback", color: "#06b6d4", formatValue: (v) => `${Math.round(v / 128 * 100)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 62,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: wetOut, min: 0, max: 128, onChange: (v) => updateParam(5, Math.round(v)), label: "Wet", color: "#06b6d4", formatValue: (v) => `${Math.round(v / 128 * 100)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 63,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 57,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 55,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 43,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
    lineNumber: 31,
    columnNumber: 5
  }, void 0);
};
const JeskolaCrossDelayEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const dryThru = params[0] ?? 1;
  const leftLength = (params[1] ?? 3) | (params[2] ?? 0) << 8;
  const rightLength = (params[3] ?? 3) | (params[4] ?? 0) << 8;
  const lengthUnit = params[5] ?? 0;
  const feedback = params[6] ?? 96;
  const wetOut = params[7] ?? 48;
  const unitLabels = ["tick", "ms", "sample", "1/256 tick"];
  const updateWord = (lowIndex, highIndex, value) => {
    const low = value & 255;
    const high = value >> 8 & 255;
    updateParam(lowIndex, low);
    updateParam(highIndex, high);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 100,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 99,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "Jeskola CrossDelay" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 103,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "Stereo Cross Delay by Oskari Tammelin" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 104,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 102,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 98,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 97,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#ec4899", title: "Stereo Time" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 110,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: leftLength, min: 1, max: 65535, onChange: (v) => updateWord(1, 2, Math.round(v)), label: "Left", color: "#ec4899", formatValue: (v) => Math.round(v).toString() }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 112,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: rightLength, min: 1, max: 65535, onChange: (v) => updateWord(3, 4, Math.round(v)), label: "Right", color: "#a855f7", formatValue: (v) => Math.round(v).toString() }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 113,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 111,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center mt-4 gap-1", children: unitLabels.map((label, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: () => updateParam(5, idx), className: `px-2 py-1 text-xs rounded font-medium transition-all ${lengthUnit === idx ? "bg-pink-500/20 text-pink-400 ring-1 ring-pink-500" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}`, children: label }, idx, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 117,
          columnNumber: 15
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 115,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 109,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#8b5cf6", title: "Mix" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 122,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-secondary", children: "Dry Thru" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
              lineNumber: 125,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: () => updateParam(0, dryThru === 1 ? 0 : 1), className: `px-4 py-2 rounded-lg font-bold text-sm transition-all ${dryThru === 1 ? "bg-purple-500/20 text-purple-400 ring-1 ring-purple-500" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary"}`, children: dryThru === 1 ? "ON" : "OFF" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
              lineNumber: 126,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 124,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: feedback, min: 0, max: 128, onChange: (v) => updateParam(6, Math.round(v)), label: "Feedback", color: "#8b5cf6", formatValue: (v) => `${Math.round(v / 128 * 100)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 128,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: wetOut, min: 0, max: 128, onChange: (v) => updateParam(7, Math.round(v)), label: "Wet", color: "#8b5cf6", formatValue: (v) => `${Math.round(v / 128 * 100)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 129,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 123,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 121,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 108,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
    lineNumber: 96,
    columnNumber: 5
  }, void 0);
};
const JeskolaFreeverbEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const revTime = params[0] ?? 200;
  const hiDamp = params[1] ?? 128;
  const preDelay = params[2] ?? 0;
  const lowCut = params[3] ?? 0;
  const hiCut = params[4] ?? 255;
  const revOut = params[5] ?? 64;
  const dryOut = params[6] ?? 255;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 158,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 157,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "Jeskola Freeverb" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 161,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "Freeverb Reverb by Oskari Tammelin" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 162,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 160,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 156,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 155,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#6366f1", title: "Reverb Character" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 168,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: revTime, min: 0, max: 255, onChange: (v) => updateParam(0, Math.round(v)), label: "Room Size", color: "#6366f1", formatValue: (v) => `${Math.round(v / 2.55)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 170,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: hiDamp, min: 0, max: 255, onChange: (v) => updateParam(1, Math.round(v)), label: "Hi Damp", color: "#6366f1", formatValue: (v) => `${Math.round(v / 2.55)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 171,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: preDelay, min: 0, max: 255, onChange: (v) => updateParam(2, Math.round(v)), label: "Pre-Delay", color: "#6366f1", formatValue: (v) => `${Math.round(v)}ms` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 172,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 169,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 167,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#8b5cf6", title: "Filter" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 176,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: lowCut, min: 0, max: 255, onChange: (v) => updateParam(3, Math.round(v)), label: "Low Cut", color: "#8b5cf6", formatValue: (v) => `${Math.round(v / 2.55)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 178,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: hiCut, min: 0, max: 255, onChange: (v) => updateParam(4, Math.round(v)), label: "Hi Cut", color: "#8b5cf6", formatValue: (v) => `${Math.round(v / 2.55)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 179,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 177,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 175,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#a855f7", title: "Output" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 183,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: dryOut, min: 0, max: 255, onChange: (v) => updateParam(6, Math.round(v)), label: "Dry", color: "#a855f7", formatValue: (v) => `${Math.round(v / 2.55)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 185,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: revOut, min: 0, max: 255, onChange: (v) => updateParam(5, Math.round(v)), label: "Reverb", color: "#a855f7", formatValue: (v) => `${Math.round(v / 2.55)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 186,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 184,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 182,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 166,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
    lineNumber: 154,
    columnNumber: 5
  }, void 0);
};
const JeskolaDistortionEditor = ({ config, onChange }) => {
  var _a;
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = ((_a = config.buzzmachine) == null ? void 0 : _a.parameters) || {};
  const posThreshold = (params[0] ?? 0) | (params[1] ?? 96) << 8;
  const posClamp = (params[2] ?? 0) | (params[3] ?? 128) << 8;
  const negThreshold = (params[4] ?? 0) | (params[5] ?? 160) << 8;
  const negClamp = (params[6] ?? 0) | (params[7] ?? 128) << 8;
  const amount = (params[8] ?? 0) | (params[9] ?? 128) << 8;
  const updateWord = (lowIndex, highIndex, value) => {
    const low = value & 255;
    const high = value >> 8 & 255;
    updateParam(lowIndex, low);
    updateParam(highIndex, high);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "synth-editor-header px-4 py-3 bg-[#1a1a1a]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-gradient-to-br from-red-600 to-orange-600", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 20, className: "text-text-primary" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 220,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 219,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "Jeskola Distortion" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 223,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: "Asymmetric Distortion by Oskari Tammelin" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 224,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 222,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 218,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 217,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#22c55e", title: "Positive (+)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 230,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: posThreshold, min: 0, max: 65535, onChange: (v) => updateWord(0, 1, Math.round(v)), label: "Threshold", color: "#22c55e", formatValue: (v) => `${Math.round(v / 655.35)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 232,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: posClamp, min: 0, max: 65535, onChange: (v) => updateWord(2, 3, Math.round(v)), label: "Clamp", color: "#22c55e", formatValue: (v) => `${Math.round(v / 655.35)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 233,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 231,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 229,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#ef4444", title: "Negative (-)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 237,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-6 items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: negThreshold, min: 0, max: 65535, onChange: (v) => updateWord(4, 5, Math.round(v)), label: "Threshold", color: "#ef4444", formatValue: (v) => `${Math.round(v / 655.35)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 239,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: negClamp, min: 0, max: 65535, onChange: (v) => updateWord(6, 7, Math.round(v)), label: "Clamp", color: "#ef4444", formatValue: (v) => `${Math.round(v / 655.35)}%` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
            lineNumber: 240,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 238,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 236,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "bg-[#1a1a1a] rounded-xl p-4 border border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { color: "#f97316", title: "Output" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 244,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: amount, min: 0, max: 65535, onChange: (v) => updateWord(8, 9, Math.round(v)), label: "Amount", size: "lg", color: "#f97316", formatValue: (v) => `${Math.round(v / 655.35)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 246,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
          lineNumber: 245,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
        lineNumber: 243,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
      lineNumber: 228,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/jeskola/FXEditors.tsx",
    lineNumber: 216,
    columnNumber: 5
  }, void 0);
};
const BUZZMACHINE_EDITORS = {
  // Generators
  "CyanPhaseDTMF": CyanPhaseDTMFEditor,
  "ElenzilFrequencyBomb": ElenzilFrequencyBombEditor,
  "FSMKick": FSMKickEditor,
  "FSMKickXP": FSMKickXPEditor,
  "JeskolaNoise": JeskolaNoiseEditor,
  "JeskolaTrilok": JeskolaTrilokEditor,
  "MadBrain4FM2F": MadBrain4FM2FEditor,
  "MadBrainDynamite6": MadBrainDynamite6Editor,
  "MakkM3": MakkM3Editor,
  "MakkM4": MakkM4Editor,
  "OomekAggressor": OomekAggressorEditor,
  // Effects (Jeskola)
  "JeskolaDelay": JeskolaDelayEditor,
  "JeskolaCrossDelay": JeskolaCrossDelayEditor,
  "JeskolaFreeverb": JeskolaFreeverbEditor,
  "JeskolaDistortion": JeskolaDistortionEditor
};
function getJeskolaEditor(machineType) {
  return BUZZMACHINE_EDITORS[machineType] || null;
}
const BuzzmachineEditorResolver = ({
  config,
  onChange,
  machineType
}) => {
  const Resolved = getJeskolaEditor(machineType);
  if (Resolved) {
    return React.createElement(Resolved, { config, onChange });
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BuzzmachineEditor, { config, onChange }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/BuzzmachineControls.tsx",
    lineNumber: 32,
    columnNumber: 10
  }, void 0);
};
const BuzzmachineControls = ({
  config,
  onChange
}) => {
  var _a;
  const machineType = ((_a = config.buzzmachine) == null ? void 0 : _a.machineType) || "";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BuzzmachineEditorResolver, { config, onChange, machineType }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/BuzzmachineControls.tsx",
    lineNumber: 40,
    columnNumber: 10
  }, void 0);
};
export {
  BuzzmachineControls,
  BuzzmachineControls as default
};
