import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, q as Radio, $ as Waves, Q as Activity, Z as Zap } from "./vendor-ui-AJ7AT9BN.js";
import { start, Oscillator, AmplitudeEnvelope } from "./vendor-tone-48TQc1H3.js";
import { StartrekkerAMEngine } from "./StartrekkerAMEngine-culT-tWE.js";
import { aB as Knob } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
const WAVEFORM_NAMES = ["Sine", "Sawtooth", "Square", "Noise"];
const NT_OFFSETS = {
  waveform: 26,
  basePeriod: 6,
  attackTarget: 8,
  attackRate: 10,
  attack2Target: 12,
  attack2Rate: 14,
  decayTarget: 16,
  decayRate: 18,
  sustainCount: 20,
  releaseRate: 24,
  vibFreqStep: 28,
  vibAmplitude: 30,
  periodShift: 34
};
function EnvelopeViz({ config, accentColor }) {
  const path = reactExports.useMemo(() => {
    const w = 320, h = 72, maxAmpl = 256;
    const norm = (v) => Math.max(0, Math.min(1, (v + maxAmpl) / (maxAmpl * 2)));
    const startY = norm(Math.min(config.basePeriod, maxAmpl));
    const atkY = norm(config.attackTarget);
    const atk2Y = norm(config.attack2Target);
    const decY = norm(config.decayTarget);
    const atkRate = Math.max(1, Math.abs(config.attackRate));
    const atk2Rate = Math.max(1, Math.abs(config.attack2Rate));
    const decRate = Math.max(1, Math.abs(config.decayRate));
    const susLen = Math.max(1, config.sustainCount);
    const relRate = Math.max(1, Math.abs(config.releaseRate));
    const totalTime = Math.abs(config.attackTarget - config.basePeriod) / atkRate + Math.abs(config.attack2Target - config.attackTarget) / atk2Rate + Math.abs(config.decayTarget - config.attack2Target) / decRate + susLen + Math.abs(config.decayTarget) / relRate;
    const scale = totalTime > 0 ? w / totalTime : w / 5;
    let x = 0;
    const pts = [];
    const toY = (v) => h - v * (h - 4) - 2;
    pts.push(`M 0 ${toY(startY).toFixed(1)}`);
    x += Math.abs(config.attackTarget - config.basePeriod) / atkRate * scale;
    pts.push(`L ${Math.min(x, w).toFixed(1)} ${toY(atkY).toFixed(1)}`);
    x += Math.abs(config.attack2Target - config.attackTarget) / atk2Rate * scale;
    pts.push(`L ${Math.min(x, w).toFixed(1)} ${toY(atk2Y).toFixed(1)}`);
    x += Math.abs(config.decayTarget - config.attack2Target) / decRate * scale;
    pts.push(`L ${Math.min(x, w).toFixed(1)} ${toY(decY).toFixed(1)}`);
    x += susLen * scale;
    pts.push(`L ${Math.min(x, w).toFixed(1)} ${toY(decY).toFixed(1)}`);
    x += (config.decayTarget > 0 ? Math.abs(config.decayTarget) / relRate : 10) * scale;
    pts.push(`L ${Math.min(x, w).toFixed(1)} ${toY(0).toFixed(1)}`);
    return pts.join(" ");
  }, [config]);
  const fillPath = path + ` L 320 72 L 0 72 Z`;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { viewBox: "0 0 320 72", className: "w-full h-20 rounded-lg overflow-hidden", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("defs", { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("linearGradient", { id: "envGrad", x1: "0", y1: "0", x2: "0", y2: "1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("stop", { offset: "0%", stopColor: accentColor, stopOpacity: "0.3" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 78,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("stop", { offset: "100%", stopColor: accentColor, stopOpacity: "0.02" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 79,
        columnNumber: 11
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 77,
      columnNumber: 9
    }, this) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 76,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("rect", { width: "320", height: "72", fill: "rgba(0,0,0,0.4)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 82,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("line", { x1: "0", y1: "36", x2: "320", y2: "36", stroke: "rgba(255,255,255,0.06)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 84,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("line", { x1: "0", y1: "18", x2: "320", y2: "18", stroke: "rgba(255,255,255,0.03)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 85,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("line", { x1: "0", y1: "54", x2: "320", y2: "54", stroke: "rgba(255,255,255,0.03)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 86,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("path", { d: fillPath, fill: "url(#envGrad)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 88,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("path", { d: path, fill: "none", stroke: accentColor, strokeWidth: "2.5", strokeLinejoin: "round" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 90,
      columnNumber: 7
    }, this),
    ["ATK", "ATK2", "DEC", "SUS", "REL"].map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("text", { x: 16 + i * 62, y: "68", fill: "rgba(255,255,255,0.25)", fontSize: "8", fontFamily: "monospace", children: label }, label, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 93,
      columnNumber: 9
    }, this))
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
    lineNumber: 75,
    columnNumber: 5
  }, this);
}
function useAMPreview(config) {
  const oscRef = reactExports.useRef(null);
  const envRef = reactExports.useRef(null);
  return reactExports.useCallback(async () => {
    if (!config) return;
    await start();
    if (oscRef.current) {
      try {
        oscRef.current.stop();
        oscRef.current.dispose();
      } catch {
      }
    }
    if (envRef.current) {
      try {
        envRef.current.dispose();
      } catch {
      }
    }
    const wfTypes = ["sine", "sawtooth", "square", "square"];
    const wf = wfTypes[config.waveform] ?? "sine";
    const osc = new Oscillator(262, wf).toDestination();
    const env = new AmplitudeEnvelope({
      attack: Math.max(0.01, config.attackRate > 0 ? 0.05 : 0.01),
      decay: Math.max(0.05, config.decayRate > 0 ? 0.2 : 0.05),
      sustain: config.sustainCount > 0 ? 0.5 : 0.3,
      release: Math.max(0.05, config.releaseRate > 0 ? 0.3 : 0.1)
    }).toDestination();
    osc.connect(env);
    oscRef.current = osc;
    envRef.current = env;
    osc.start();
    env.triggerAttackRelease(0.5);
    setTimeout(() => {
      try {
        osc.stop();
        osc.dispose();
        env.dispose();
      } catch {
      }
      if (oscRef.current === osc) oscRef.current = null;
      if (envRef.current === env) envRef.current = null;
    }, 1e3);
  }, [config]);
}
const StartrekkerAMControls = ({
  config,
  instrumentName,
  instrumentId,
  onChange
}) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor } = useInstrumentColors("#00cccc", { knob: "#00dddd" });
  const sectionBorder = isCyanTheme ? "border-accent-highlight/20" : "border-[#1a3a3a]";
  const sectionBg = isCyanTheme ? "bg-[#051515]" : "bg-[#0a1a1a]";
  const updateParam = reactExports.useCallback((key, value) => {
    if (!configRef.current) return;
    const updated = { ...configRef.current, [key]: value };
    if (instrumentId && StartrekkerAMEngine.hasInstance()) {
      const offset = NT_OFFSETS[key];
      if (offset !== void 0) {
        const wasmVal = key === "waveform" ? value & 3 : value & 65535;
        StartrekkerAMEngine.getInstance().setNtParam(instrumentId, offset, wasmVal);
      }
    }
    if (onChange) onChange(updated);
  }, [instrumentId, onChange]);
  const playPreview = useAMPreview(config);
  if (!config) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center justify-center p-8 text-text-muted gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 32, className: "opacity-30" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 160,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-lg font-bold", children: instrumentName }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 161,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm opacity-60", children: "PCM sample instrument" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 162,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs opacity-40", children: "AM parameters are stored in the .nt companion file" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 163,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 159,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 p-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${sectionBg} ${sectionBorder}`, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, style: { color: accentColor } }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 174,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold", style: { color: accentColor }, children: "WAVEFORM" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 175,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 173,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: playPreview,
            className: "px-3 py-1 rounded-full text-xs font-bold transition-all hover:scale-105",
            style: { backgroundColor: accentColor + "20", color: accentColor, border: `1px solid ${accentColor}40` },
            children: "Preview"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 177,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 172,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col md:flex-row gap-3 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: WAVEFORM_NAMES.map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updateParam("waveform", i),
            className: "w-12 h-12 rounded-lg border transition-all flex flex-col items-center justify-center gap-0.5",
            style: config.waveform === i ? {
              borderColor: accentColor,
              backgroundColor: accentColor + "15",
              boxShadow: `0 0 12px ${accentColor}30`
            } : {
              borderColor: "rgba(255,255,255,0.1)",
              backgroundColor: "rgba(0,0,0,0.2)"
            },
            children: [
              i === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 14, color: config.waveform === i ? accentColor : "#555" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
                lineNumber: 203,
                columnNumber: 29
              }, void 0),
              i === 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 14, color: config.waveform === i ? accentColor : "#555" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
                lineNumber: 204,
                columnNumber: 29
              }, void 0),
              i === 2 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-3.5 h-3.5 border-t-2 border-r-2 border-b-0 border-l-2", style: { borderColor: config.waveform === i ? accentColor : "#555" } }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
                lineNumber: 205,
                columnNumber: 29
              }, void 0),
              i === 3 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 14, color: config.waveform === i ? accentColor : "#555" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
                lineNumber: 206,
                columnNumber: 29
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] uppercase", style: { color: config.waveform === i ? accentColor : "#555" }, children: name }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
                lineNumber: 207,
                columnNumber: 17
              }, void 0)
            ]
          },
          i,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 190,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 188,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.periodShift,
            min: 0,
            max: 15,
            onChange: (v) => updateParam("periodShift", Math.round(v)),
            label: "Shift",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 212,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.basePeriod,
            min: 0,
            max: 512,
            onChange: (v) => updateParam("basePeriod", Math.round(v)),
            label: "Base Amp",
            color: knobColor,
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 214,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 186,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 171,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${sectionBg} ${sectionBorder}`, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16, style: { color: accentColor } }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 222,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold", style: { color: accentColor }, children: "ENVELOPE" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 223,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted ml-auto", children: "5-Phase ADSR" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 224,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 221,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EnvelopeViz, { config, accentColor }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 227,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-5 gap-3 mt-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Attack 1" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 232,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.attackTarget,
              min: -256,
              max: 256,
              onChange: (v) => updateParam("attackTarget", Math.round(v)),
              label: "Target",
              color: knobColor,
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
              lineNumber: 233,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.attackRate,
              min: 0,
              max: 128,
              onChange: (v) => updateParam("attackRate", Math.round(v)),
              label: "Rate",
              color: knobColor,
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
              lineNumber: 235,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 231,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Attack 2" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 241,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.attack2Target,
              min: -256,
              max: 256,
              onChange: (v) => updateParam("attack2Target", Math.round(v)),
              label: "Target",
              color: knobColor,
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
              lineNumber: 242,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.attack2Rate,
              min: 0,
              max: 128,
              onChange: (v) => updateParam("attack2Rate", Math.round(v)),
              label: "Rate",
              color: knobColor,
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
              lineNumber: 244,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 240,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Decay" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 250,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.decayTarget,
              min: -256,
              max: 256,
              onChange: (v) => updateParam("decayTarget", Math.round(v)),
              label: "Target",
              color: knobColor,
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
              lineNumber: 251,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.decayRate,
              min: 0,
              max: 128,
              onChange: (v) => updateParam("decayRate", Math.round(v)),
              label: "Rate",
              color: knobColor,
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
              lineNumber: 253,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 249,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Sustain" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 259,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.sustainCount,
              min: 0,
              max: 999,
              onChange: (v) => updateParam("sustainCount", Math.round(v)),
              label: "Length",
              color: knobColor,
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
              lineNumber: 260,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 258,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-bold uppercase tracking-wider", style: { color: accentColor }, children: "Release" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 266,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.releaseRate,
              min: 0,
              max: 128,
              onChange: (v) => updateParam("releaseRate", Math.round(v)),
              label: "Rate",
              color: knobColor,
              formatValue: (v) => `${Math.round(v)}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
              lineNumber: 267,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 265,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 229,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 220,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${sectionBg} ${sectionBorder}`, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 16, style: { color: "#22c55e" } }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 276,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold text-emerald-400", children: "VIBRATO" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
          lineNumber: 277,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 275,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 items-center justify-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibFreqStep,
            min: 0,
            max: 500,
            onChange: (v) => updateParam("vibFreqStep", Math.round(v)),
            label: "Speed",
            color: "#22c55e",
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 281,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: Math.abs(config.vibAmplitude),
            min: 0,
            max: 256,
            onChange: (v) => updateParam("vibAmplitude", Math.round(v) * (config.vibAmplitude < 0 ? -1 : 1)),
            label: "Depth",
            color: "#22c55e",
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
            lineNumber: 283,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
        lineNumber: 280,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
      lineNumber: 274,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/StartrekkerAMControls.tsx",
    lineNumber: 169,
    columnNumber: 5
  }, void 0);
};
export {
  StartrekkerAMControls
};
