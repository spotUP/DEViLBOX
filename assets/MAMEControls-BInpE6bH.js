const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { dJ as MAMEEngine, aB as Knob, am as __vitePreload } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, F as FileUp, q as Radio, e as Settings, aj as HardDrive, j as Cpu, ak as Database, Q as Activity, g as Save } from "./vendor-ui-AJ7AT9BN.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
const MAMEVFXFilterVisualizer = ({
  k1,
  k2,
  width = 160,
  height = 64,
  color = "#ec4899"
}) => {
  const points = reactExports.useMemo(() => {
    const pts = [];
    const numPoints = 40;
    const res = k2 / 255;
    const cutoff = k1 / 255;
    for (let i = 0; i <= numPoints; i++) {
      const x = i / numPoints * width;
      const freq = i / numPoints;
      const dist = Math.abs(freq - cutoff);
      const amp = 1 / (0.1 + dist * 5 + (1 - res) * 2);
      const y = height - Math.min(0.9, amp * 0.5) * height - 5;
      pts.push(`${x},${y}`);
    }
    return pts.join(" ");
  }, [k1, k2, width, height]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative bg-black/40 rounded border border-dark-border overflow-hidden", style: { width, height }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { width, height, className: "absolute inset-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "path",
        {
          d: `M 0,${height} L ${points} L ${width},${height} Z`,
          fill: `${color}20`,
          stroke: color,
          strokeWidth: "2",
          strokeLinejoin: "round"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/MAMEVFXFilterVisualizer.tsx",
          lineNumber: 51,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "line",
        {
          x1: k1 / 255 * width,
          y1: "0",
          x2: k1 / 255 * width,
          y2: height,
          stroke: "white",
          strokeWidth: "1",
          strokeDasharray: "2,2",
          opacity: "0.3"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/MAMEVFXFilterVisualizer.tsx",
          lineNumber: 59,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/MAMEVFXFilterVisualizer.tsx",
      lineNumber: 50,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-1 left-1 text-[7px] text-text-muted font-bold uppercase tracking-tighter", children: "VFX SVF Response" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/MAMEVFXFilterVisualizer.tsx",
      lineNumber: 65,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/MAMEVFXFilterVisualizer.tsx",
    lineNumber: 49,
    columnNumber: 5
  }, void 0);
};
const MAMEVFXVoiceMatrix = ({
  handle,
  accentColor,
  knobColor,
  panelBg,
  panelStyle
}) => {
  const engine = MAMEEngine.getInstance();
  const [selectedVoice, setSelectedVoice] = reactExports.useState(0);
  const [voiceActivity, setVoiceActivity] = reactExports.useState(new Array(32).fill(false));
  const [voiceParams, setVoiceParams] = reactExports.useState({});
  reactExports.useEffect(() => {
    if (handle === 0) return;
    const interval = setInterval(() => {
      const newActivity = [];
      const originalPage = engine.read(handle, 120);
      for (let i = 0; i < 32; i++) {
        engine.write(handle, 120, i);
        const ctrl = engine.read(handle, 0);
        newActivity.push((ctrl & 1) === 0);
      }
      engine.write(handle, 120, originalPage);
      setVoiceActivity(newActivity);
      engine.write(handle, 120, selectedVoice);
      const params = {};
      for (let i = 0; i < 16; i++) {
        params[i] = engine.read(handle, i);
      }
      setVoiceParams(params);
      engine.write(handle, 120, originalPage);
    }, 100);
    return () => clearInterval(interval);
  }, [engine, handle, selectedVoice]);
  const handleVoiceWrite = reactExports.useCallback((reg, val) => {
    if (handle === 0) return;
    const originalPage = engine.read(handle, 120);
    engine.write(handle, 120, selectedVoice);
    engine.write(handle, reg, val);
    engine.write(handle, 120, originalPage);
  }, [engine, handle, selectedVoice]);
  const handleSysexUpload = reactExports.useCallback(async (e) => {
    var _a;
    const file = (_a = e.target.files) == null ? void 0 : _a[0];
    if (!file || handle === 0) return;
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    engine.addMidiEvent(handle, data);
  }, [engine, handle]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-3 rounded border ${panelBg} flex items-center justify-between`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 bg-purple-500/20 rounded", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileUp, { className: "text-purple-400", size: 18 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 82,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 81,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h4", { className: "text-xs font-bold uppercase tracking-wider text-text-primary", children: "SysEx Bank Loader" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
            lineNumber: 85,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[9px] text-text-muted", children: "Import original .SYX patches" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
            lineNumber: 86,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 84,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
        lineNumber: 80,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "cursor-pointer text-[10px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-3 py-1.5 rounded border border-purple-500/30 transition-colors font-bold uppercase", children: [
        "Load .SYX",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("input", { type: "file", className: "hidden", accept: ".syx", onChange: handleSysexUpload }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 91,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
        lineNumber: 89,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
      lineNumber: 79,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-text-secondary", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 16 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
        lineNumber: 96,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase text-text-primary", children: "Voice Matrix (32 Oscillators)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
        lineNumber: 97,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
      lineNumber: 95,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `grid grid-cols-8 gap-1 p-2 rounded border ${panelBg}`, style: panelStyle, children: Array.from({ length: 32 }).map((_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setSelectedVoice(i),
        className: `
              relative h-8 flex items-center justify-center rounded text-[10px] font-mono transition-all
              ${selectedVoice === i ? "bg-accent-primary text-black font-bold border-accent-primary shadow-lg shadow-accent-primary/20" : "bg-dark-bgSecondary/50 text-text-muted hover:bg-dark-bgHover"}
              border border-transparent
            `,
        children: [
          i.toString().padStart(2, "0"),
          voiceActivity[i] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "span",
            {
              className: "absolute top-1 right-1 w-1.5 h-1.5 rounded-full animate-pulse",
              style: { backgroundColor: selectedVoice === i ? "black" : accentColor }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
              lineNumber: 116,
              columnNumber: 15
            },
            void 0
          )
        ]
      },
      i,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
        lineNumber: 103,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
      lineNumber: 101,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-4 rounded border ${panelBg} space-y-4 shadow-inner-dark`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between border-b border-dark-border pb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 14, className: "text-text-muted" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
            lineNumber: 129,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold uppercase tracking-widest text-text-secondary", children: [
            "Editing Voice ",
            selectedVoice.toString().padStart(2, "0")
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
            lineNumber: 130,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 128,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted uppercase font-mono", children: "Status:" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
            lineNumber: 135,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `text-[9px] font-bold font-mono ${voiceActivity[selectedVoice] ? "text-green-400" : "text-red-400"}`, children: voiceActivity[selectedVoice] ? "RUNNING" : "STOPPED" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
            lineNumber: 136,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 134,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
        lineNumber: 127,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 md:grid-cols-8 gap-4 place-items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "VOL L", min: 0, max: 255, value: voiceParams[16] || 0, onChange: (v) => handleVoiceWrite(16, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 143,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "VOL R", min: 0, max: 255, value: voiceParams[32] || 0, onChange: (v) => handleVoiceWrite(32, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 144,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "FREQ L", min: 0, max: 255, value: voiceParams[8] || 0, onChange: (v) => handleVoiceWrite(8, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 145,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "FREQ H", min: 0, max: 255, value: voiceParams[9] || 0, onChange: (v) => handleVoiceWrite(9, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 146,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "K1", min: 0, max: 255, value: voiceParams[72] || 0, onChange: (v) => handleVoiceWrite(72, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 147,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "K2", min: 0, max: 255, value: voiceParams[56] || 0, onChange: (v) => handleVoiceWrite(56, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 148,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "ECOUNT", min: 0, max: 255, value: voiceParams[48] || 0, onChange: (v) => handleVoiceWrite(48, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 149,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "CTRL", min: 0, max: 255, value: voiceParams[0] || 0, onChange: (v) => handleVoiceWrite(0, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 150,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
        lineNumber: 142,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/20 p-2 rounded border border-dark-border space-y-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-muted uppercase font-bold tracking-tighter", children: "Wavetable Offset" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
            lineNumber: 155,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between text-[10px] font-mono", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "START:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
              lineNumber: 157,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: [
              "0x",
              (voiceParams[8 + 128] || 0).toString(16).toUpperCase().padStart(4, "0")
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
              lineNumber: 158,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
            lineNumber: 156,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between text-[10px] font-mono", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "END:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
              lineNumber: 161,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: [
              "0x",
              (voiceParams[16 + 128] || 0).toString(16).toUpperCase().padStart(4, "0")
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
              lineNumber: 162,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
            lineNumber: 160,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 154,
          columnNumber: 12
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          MAMEVFXFilterVisualizer,
          {
            k1: voiceParams[72] || 0,
            k2: voiceParams[56] || 0,
            width: 180,
            height: 50,
            color: accentColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
            lineNumber: 167,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
          lineNumber: 166,
          columnNumber: 12
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
        lineNumber: 153,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
      lineNumber: 126,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx",
    lineNumber: 77,
    columnNumber: 5
  }, void 0);
};
const MAMEDOCVoiceMatrix = ({
  handle,
  knobColor,
  panelBg,
  panelStyle
}) => {
  const engine = MAMEEngine.getInstance();
  const [selectedOsc, setSelectedOsc] = reactExports.useState(0);
  const [oscActivity, setOscActivity] = reactExports.useState(new Array(32).fill(false));
  const [oscParams, setOscParams] = reactExports.useState({});
  reactExports.useEffect(() => {
    if (handle === 0) return;
    const interval = setInterval(() => {
      const newActivity = [];
      for (let i = 0; i < 32; i++) {
        const ctrl = engine.read(handle, 128 + i);
        newActivity.push((ctrl & 1) === 0);
      }
      setOscActivity(newActivity);
      const params = {};
      params[0] = engine.read(handle, 0 + selectedOsc);
      params[32] = engine.read(handle, 32 + selectedOsc);
      params[64] = engine.read(handle, 64 + selectedOsc);
      params[128] = engine.read(handle, 128 + selectedOsc);
      params[160] = engine.read(handle, 160 + selectedOsc);
      params[192] = engine.read(handle, 192 + selectedOsc);
      setOscParams(params);
    }, 100);
    return () => clearInterval(interval);
  }, [engine, handle, selectedOsc]);
  const handleOscWrite = reactExports.useCallback((base, val) => {
    if (handle === 0) return;
    engine.write(handle, base + selectedOsc, val);
  }, [engine, handle, selectedOsc]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-text-secondary", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 16 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
        lineNumber: 61,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase text-text-primary", children: "DOC Oscillator Matrix (32 Voices)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
        lineNumber: 62,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
      lineNumber: 60,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `grid grid-cols-8 gap-1 p-2 rounded border ${panelBg}`, style: panelStyle, children: Array.from({ length: 32 }).map((_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setSelectedOsc(i),
        className: `
              relative h-8 flex items-center justify-center rounded text-[10px] font-mono transition-all
              ${selectedOsc === i ? "bg-amber-500 text-black font-bold border-amber-500 shadow-lg shadow-amber-500/20" : "bg-dark-bgSecondary/50 text-text-muted hover:bg-dark-bgHover"}
              border border-transparent
            `,
        children: [
          i.toString().padStart(2, "0"),
          oscActivity[i] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "span",
            {
              className: "absolute top-1 right-1 w-1.5 h-1.5 rounded-full animate-pulse bg-amber-400"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
              lineNumber: 81,
              columnNumber: 15
            },
            void 0
          )
        ]
      },
      i,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
        lineNumber: 68,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
      lineNumber: 66,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-4 rounded border ${panelBg} space-y-4 shadow-inner-dark`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between border-b border-dark-border pb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 14, className: "text-text-muted" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
            lineNumber: 93,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold uppercase tracking-widest text-text-secondary", children: [
            "Editing Oscillator ",
            selectedOsc.toString().padStart(2, "0")
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
            lineNumber: 94,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
          lineNumber: 92,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted uppercase font-mono", children: "Status:" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
            lineNumber: 99,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `text-[9px] font-bold font-mono ${oscActivity[selectedOsc] ? "text-green-400" : "text-red-400"}`, children: oscActivity[selectedOsc] ? "RUNNING" : "HALTED" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
            lineNumber: 100,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
          lineNumber: 98,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
        lineNumber: 91,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 md:grid-cols-6 gap-4 place-items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "FREQ L", min: 0, max: 255, value: oscParams[0] || 0, onChange: (v) => handleOscWrite(0, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
          lineNumber: 107,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "FREQ H", min: 0, max: 255, value: oscParams[32] || 0, onChange: (v) => handleOscWrite(32, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
          lineNumber: 108,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "VOLUME", min: 0, max: 255, value: oscParams[64] || 0, onChange: (v) => handleOscWrite(64, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
          lineNumber: 109,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "CTRL", min: 0, max: 255, value: oscParams[128] || 0, onChange: (v) => handleOscWrite(128, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
          lineNumber: 110,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "W-SIZE", min: 0, max: 255, value: oscParams[160] || 0, onChange: (v) => handleOscWrite(160, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
          lineNumber: 111,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "W-PTR", min: 0, max: 255, value: oscParams[192] || 0, onChange: (v) => handleOscWrite(192, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
          lineNumber: 112,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
        lineNumber: 106,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/20 p-2 rounded border border-dark-border space-y-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-muted uppercase font-bold tracking-tighter", children: "Register State (HEX)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
            lineNumber: 117,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between text-[10px] font-mono", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "FREQ:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
              lineNumber: 119,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-amber-400", children: [
              "0x",
              (oscParams[32] || 0).toString(16).toUpperCase().padStart(2, "0"),
              (oscParams[0] || 0).toString(16).toUpperCase().padStart(2, "0")
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
              lineNumber: 120,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
            lineNumber: 118,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between text-[10px] font-mono", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "WAVE:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
              lineNumber: 123,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-amber-400", children: [
              "PTR: 0x",
              (oscParams[192] || 0).toString(16).toUpperCase().padStart(2, "0"),
              " | SZ: 0x",
              (oscParams[160] || 0).toString(16).toUpperCase().padStart(2, "0")
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
              lineNumber: 124,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
            lineNumber: 122,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
          lineNumber: 116,
          columnNumber: 12
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/20 p-2 rounded border border-dark-border flex flex-col justify-center italic text-[9px] text-text-muted", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: "• ES5503 (DOC) - Gritty 8-bit wavetable engine." }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
            lineNumber: 128,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: "• HALT bit must be cleared (0) for audio to play." }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
            lineNumber: 129,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
          lineNumber: 127,
          columnNumber: 12
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
        lineNumber: 115,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
      lineNumber: 90,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx",
    lineNumber: 59,
    columnNumber: 5
  }, void 0);
};
const MAMERSAVoiceMatrix = ({
  handle,
  knobColor,
  panelBg,
  panelStyle
}) => {
  const engine = MAMEEngine.getInstance();
  const [selectedVoice, setSelectedVoice] = reactExports.useState(0);
  const [selectedPart, setSelectedPart] = reactExports.useState(0);
  const [voiceActivity, setVoiceActivity] = reactExports.useState(new Array(16).fill(false));
  const [partParams, setPartParams] = reactExports.useState({});
  const [roms, setRoms] = reactExports.useState({});
  reactExports.useEffect(() => {
    if (handle === 0) return;
    const interval = setInterval(() => {
      const newActivity = [];
      for (let i = 0; i < 16; i++) {
        const mem_offset2 = i * 256 + 0 * 16;
        const env_speed = engine.read(handle, mem_offset2 + 5);
        newActivity.push(env_speed > 0);
      }
      setVoiceActivity(newActivity);
      const params = {};
      const mem_offset = selectedVoice * 256 + selectedPart * 16;
      for (let i = 0; i < 8; i++) {
        params[i] = engine.read(handle, mem_offset + i);
      }
      setPartParams(params);
    }, 100);
    return () => clearInterval(interval);
  }, [engine, handle, selectedVoice, selectedPart]);
  const handlePartWrite = reactExports.useCallback((reg, val) => {
    if (handle === 0) return;
    const mem_offset = selectedVoice * 256 + selectedPart * 16;
    engine.write(handle, mem_offset + reg, val);
  }, [engine, handle, selectedVoice, selectedPart]);
  const handleRSARomUpload = reactExports.useCallback(async (e, type) => {
    var _a;
    const file = (_a = e.target.files) == null ? void 0 : _a[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const newRoms = { ...roms, [type]: data };
    setRoms(newRoms);
    if (newRoms.ic5 && newRoms.ic6 && newRoms.ic7) {
      console.log("🎹 MAME: All Roland SA ROMs ready, injecting...");
      engine.rsaLoadRoms(handle, newRoms.ic5, newRoms.ic6, newRoms.ic7);
    }
  }, [engine, handle, roms]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-4 border rounded ${panelBg} space-y-3`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-text-secondary", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HardDrive, { size: 16 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 78,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase text-text-primary", children: "Roland SA Sample ROMs" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 79,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
        lineNumber: 77,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-2", children: ["ic5", "ic6", "ic7"].map((id) => {
        const isLoaded = !!roms[id];
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: `
                flex flex-col items-center justify-center p-2 rounded border border-dashed transition-all cursor-pointer
                ${isLoaded ? "bg-sky-500/10 border-sky-500/50" : "bg-dark-bgSecondary/50 border-dark-border hover:border-text-muted"}
              `, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `text-[9px] font-bold ${isLoaded ? "text-sky-400" : "text-text-muted"}`, children: id.toUpperCase() }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
            lineNumber: 89,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] text-text-muted", children: isLoaded ? "READY" : "UPLOAD" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
            lineNumber: 90,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("input", { type: "file", className: "hidden", onChange: (e) => handleRSARomUpload(e, id) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
            lineNumber: 91,
            columnNumber: 17
          }, void 0)
        ] }, id, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 85,
          columnNumber: 15
        }, void 0);
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
        lineNumber: 81,
        columnNumber: 9
      }, void 0),
      !(roms.ic5 && roms.ic6 && roms.ic7) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[8px] text-text-muted italic", children: "Note: RSA engine requires all 3 ROMs (MKS-20 set) to produce sound." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
        lineNumber: 97,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
      lineNumber: 76,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-text-secondary", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 16 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
        lineNumber: 102,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase text-text-primary", children: "Roland SA Voice Matrix (16 Voices / 10 Parts)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
        lineNumber: 103,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
      lineNumber: 101,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `grid grid-cols-8 gap-1 p-2 rounded border ${panelBg}`, style: panelStyle, children: Array.from({ length: 16 }).map((_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setSelectedVoice(i),
        className: `
              relative h-8 flex items-center justify-center rounded text-[10px] font-mono transition-all
              ${selectedVoice === i ? "bg-sky-500 text-black font-bold border-sky-500 shadow-lg shadow-sky-500/20" : "bg-dark-bgSecondary/50 text-text-muted hover:bg-dark-bgHover"}
              border border-transparent
            `,
        children: [
          "V",
          i.toString().padStart(2, "0"),
          voiceActivity[i] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "span",
            {
              className: "absolute top-1 right-1 w-1.5 h-1.5 rounded-full animate-pulse bg-sky-400"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
              lineNumber: 122,
              columnNumber: 15
            },
            void 0
          )
        ]
      },
      i,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
        lineNumber: 109,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
      lineNumber: 107,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 overflow-x-auto pb-1", children: Array.from({ length: 10 }).map((_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setSelectedPart(i),
        className: `
              px-2 py-1 rounded text-[9px] font-bold uppercase transition-all
              ${selectedPart === i ? "bg-sky-500/20 text-sky-400 border border-sky-500/30" : "bg-dark-bgSecondary text-text-muted hover:text-text-primary"}
            `,
        children: [
          "PART ",
          i
        ]
      },
      i,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
        lineNumber: 133,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
      lineNumber: 131,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-4 rounded border ${panelBg} space-y-4 shadow-inner-dark`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between border-b border-dark-border pb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 14, className: "text-text-muted" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 152,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold uppercase tracking-widest text-text-secondary", children: [
          "Voice ",
          selectedVoice,
          " | Part ",
          selectedPart,
          " Parameters"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 153,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
        lineNumber: 151,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
        lineNumber: 150,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 md:grid-cols-7 gap-4 place-items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "PITCH L", min: 0, max: 255, value: partParams[0] || 0, onChange: (v) => handlePartWrite(0, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 160,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "PITCH H", min: 0, max: 255, value: partParams[1] || 0, onChange: (v) => handlePartWrite(1, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 161,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "W-LOOP", min: 0, max: 255, value: partParams[2] || 0, onChange: (v) => handlePartWrite(2, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 162,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "W-HIGH", min: 0, max: 255, value: partParams[3] || 0, onChange: (v) => handlePartWrite(3, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 163,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "E-DEST", min: 0, max: 255, value: partParams[4] || 0, onChange: (v) => handlePartWrite(4, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 164,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "E-SPD", min: 0, max: 255, value: partParams[5] || 0, onChange: (v) => handlePartWrite(5, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 165,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "E-OFFS", min: 0, max: 255, value: partParams[7] || 0, onChange: (v) => handlePartWrite(7, v), color: knobColor }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 166,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
        lineNumber: 159,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/20 p-2 rounded border border-dark-border space-y-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-muted uppercase font-bold tracking-tighter", children: "Hardware Info (SA Engine)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
            lineNumber: 171,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between text-[10px] font-mono", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "PITCH:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
              lineNumber: 173,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sky-400", children: [
              "0x",
              (partParams[1] || 0).toString(16).toUpperCase().padStart(2, "0"),
              (partParams[0] || 0).toString(16).toUpperCase().padStart(2, "0")
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
              lineNumber: 174,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
            lineNumber: 172,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between text-[10px] font-mono", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "WAVE:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
              lineNumber: 177,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sky-400", children: [
              "HI: 0x",
              (partParams[3] || 0).toString(16).toUpperCase().padStart(2, "0"),
              " | LP: 0x",
              (partParams[2] || 0).toString(16).toUpperCase().padStart(2, "0")
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
              lineNumber: 178,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
            lineNumber: 176,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 170,
          columnNumber: 12
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/20 p-2 rounded border border-dark-border flex flex-col justify-center italic text-[9px] text-text-muted", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: "• Structured Adaptive (SA) - Ultra-accurate 80s piano synthesis." }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
            lineNumber: 182,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: '• Each voice is composed of 10 "Parts" (harmonic components).' }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
            lineNumber: 183,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
          lineNumber: 181,
          columnNumber: 12
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
        lineNumber: 169,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
      lineNumber: 149,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMERSAVoiceMatrix.tsx",
    lineNumber: 74,
    columnNumber: 5
  }, void 0);
};
const REQUIRED_ROMS = {
  vfx: "vfx.zip (or fsd1.zip)",
  doc: "esq1.zip (or csd1.zip)",
  rsa: "mks20.zip",
  swp30: "mu100.zip (swp30 ROMs)"
};
const MAMEControls = ({
  config,
  handle,
  onChange
}) => {
  const engine = MAMEEngine.getInstance();
  const requiredZip = REQUIRED_ROMS[config.type] || "roms.zip";
  const numVoices = config.type === "swp30" ? 64 : config.type === "rsa" ? 16 : 32;
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors("#ff4444", { knob: "#ff8888" });
  const handleFileUpload = reactExports.useCallback(async (e, bank) => {
    var _a;
    const file = (_a = e.target.files) == null ? void 0 : _a[0];
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".zip")) {
      try {
        const JSZip = (await __vitePreload(async () => {
          const { default: __vite_default__ } = await import("./main-BbV5VyEH.js").then((n) => n.j);
          return { default: __vite_default__ };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0)).default;
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);
        const files = [];
        loadedZip.forEach((relativePath, zipEntry) => {
          const isMetadata = relativePath.toLowerCase().match(/\.(txt|md|txt|pdf|url|inf)$/);
          if (!zipEntry.dir && !isMetadata) {
            files.push({ name: relativePath, entry: zipEntry });
          }
        });
        files.sort((a, b) => a.name.localeCompare(b.name, void 0, { numeric: true, sensitivity: "base" }));
        for (let i = 0; i < files.length; i++) {
          const targetBank = bank + i;
          const fileData = await files[i].entry.async("uint8array");
          engine.setRom(targetBank, fileData);
        }
        onChange({ romsLoaded: true });
      } catch (err) {
        console.error("🎹 MAME: Failed to unzip ROM set:", err);
      }
    } else {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      engine.setRom(bank, data);
      onChange({ romsLoaded: true });
    }
  }, [engine, onChange]);
  const handleRegisterWrite = reactExports.useCallback((offset, value) => {
    if (handle === 0) return;
    engine.write(handle, offset, value);
    const newRegs = { ...configRef.current.registers, [offset]: value };
    onChange({ registers: newRegs });
  }, [handle, engine, onChange]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex items-center justify-between p-3 rounded border ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 bg-accent-primary/20 rounded", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cpu, { style: { color: accentColor }, size: 20 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 97,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 96,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-bold uppercase tracking-wider text-text-primary", children: [
            "MAME ",
            (config.type ?? "vfx").toUpperCase(),
            " ENGINE"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 100,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] text-text-muted", children: (config.type ?? "vfx") === "vfx" ? "ES5506 (OTTO) 32-Voice Wavetable" : (config.type ?? "vfx") === "doc" ? "ES5503 (DOC) 32-Voice Wavetable" : (config.type ?? "vfx") === "swp30" ? "Yamaha SWP30 (AWM2) ROMpler/DSP" : "Roland SA CPU-B Synthesis" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 103,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 99,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 95,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex items-center gap-2 px-2 py-1 rounded text-[10px] font-mono ${config.romsLoaded ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Database, { size: 12 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 112,
          columnNumber: 11
        }, void 0),
        config.romsLoaded ? "ROMS READY" : "ROMS MISSING"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 111,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
      lineNumber: 94,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-4 border rounded ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-1 text-text-secondary", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HardDrive, { size: 16 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
              lineNumber: 122,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase", children: "ROM Banks" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
              lineNumber: 123,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 121,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "cursor-pointer text-[10px] bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary px-2 py-1 rounded border border-accent-primary/30 transition-colors", children: [
            "UPLOAD ZIP",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "file",
                className: "hidden",
                accept: ".zip",
                onChange: (e) => handleFileUpload(e, 0)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
                lineNumber: 127,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 125,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 120,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted mb-3 flex items-center gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Database, { size: 10 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 136,
            columnNumber: 13
          }, void 0),
          "EXPECTS: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono", style: { color: accentColor }, children: requiredZip }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 137,
            columnNumber: 22
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 135,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: [0, 1, 2, 3].map((bank) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between text-[10px]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: [
            "BANK ",
            bank
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 142,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "cursor-pointer hover:underline", style: { color: accentColor }, children: [
            "UPLOAD",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "file",
                className: "hidden",
                onChange: (e) => handleFileUpload(e, bank)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
                lineNumber: 145,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 143,
            columnNumber: 17
          }, void 0)
        ] }, bank, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 141,
          columnNumber: 15
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 139,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 119,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-4 border rounded ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3 text-text-secondary", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 159,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase", children: "Status" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 160,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 158,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1 font-mono text-[10px]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "CLOCK" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
              lineNumber: 164,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-primary", children: [
              (config.clock / 1e6).toFixed(2),
              " MHz"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
              lineNumber: 165,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 163,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "VOICES" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
              lineNumber: 168,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-primary", children: numVoices }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
              lineNumber: 169,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 167,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "ACCURACY" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
              lineNumber: 172,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "SAMPLE PERFECT" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
              lineNumber: 173,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 171,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 162,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 157,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
      lineNumber: 118,
      columnNumber: 7
    }, void 0),
    config.type === "vfx" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-text-secondary", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Save, { size: 16 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 183,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase", children: "Common Registers" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 184,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 182,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 md:grid-cols-8 gap-4 place-items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "PAGE",
            min: 0,
            max: 255,
            value: config.registers[0] || 0,
            onChange: (v) => handleRegisterWrite(0, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 187,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "ACTIVE",
            min: 0,
            max: 31,
            value: config.registers[1] || 31,
            onChange: (v) => handleRegisterWrite(1, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 195,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "MODE",
            min: 0,
            max: 255,
            value: config.registers[2] || 0,
            onChange: (v) => handleRegisterWrite(2, v),
            color: knobColor
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 203,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 186,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[9px] text-text-muted italic p-2 rounded bg-black/20", children: "Note: You are directly editing the Ensoniq OTTO registers. Consult the ES5506 datasheet for mapping." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 212,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
      lineNumber: 181,
      columnNumber: 9
    }, void 0),
    config.type === "vfx" && handle !== 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      MAMEVFXVoiceMatrix,
      {
        handle,
        accentColor,
        knobColor,
        panelBg,
        panelStyle
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 220,
        columnNumber: 9
      },
      void 0
    ),
    config.type === "doc" && handle !== 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      MAMEDOCVoiceMatrix,
      {
        handle,
        knobColor,
        panelBg,
        panelStyle
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 231,
        columnNumber: 9
      },
      void 0
    ),
    config.type === "rsa" && handle !== 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      MAMERSAVoiceMatrix,
      {
        handle,
        knobColor,
        panelBg,
        panelStyle
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 241,
        columnNumber: 9
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-text-secondary", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Activity, { size: 16 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 252,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold uppercase", children: "Register Live View (HEX)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 253,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 251,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-8 md:grid-cols-16 gap-1 p-2 bg-black/40 rounded border font-mono text-[9px]", children: Array.from({ length: 32 }).map((_, i) => {
        const val = handle !== 0 ? engine.read(handle, i) : 0;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center p-1 bg-dark-bgSecondary/30 rounded", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted mb-1", children: i.toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 260,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: accentColor }, children: val.toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
            lineNumber: 261,
            columnNumber: 17
          }, void 0)
        ] }, i, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
          lineNumber: 259,
          columnNumber: 15
        }, void 0);
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
        lineNumber: 255,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
      lineNumber: 250,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MAMEControls.tsx",
    lineNumber: 92,
    columnNumber: 5
  }, void 0);
};
export {
  MAMEControls
};
