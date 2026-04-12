import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aB as Knob } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const ADSR_LABELS = ["Attack", "Decay", "Sustain", "Release"];
const RonKlarenControls = ({
  config,
  onChange
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("main");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const { accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#66bbff", { knob: "#88ccff", dim: "#001a33" });
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
  }, [onChange]);
  const updateAdsrEntry = reactExports.useCallback((index, field, value) => {
    const newAdsr = configRef.current.adsr.map(
      (e, i) => i === index ? { ...e, [field]: value } : { ...e }
    );
    onChange({ adsr: newAdsr });
  }, [onChange]);
  const renderMain = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Oscillator / Phase" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
        lineNumber: 55,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.phaseSpeed,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => upd("phaseSpeed", Math.round(v)),
            label: "Phase Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
            lineNumber: 57,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.phaseLengthInWords,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => upd("phaseLengthInWords", Math.round(v)),
            label: "Phase Length",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
            lineNumber: 60,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.phaseValue,
            min: -128,
            max: 127,
            step: 1,
            onChange: (v) => upd("phaseValue", Math.round(v)),
            label: "Phase Value",
            color: knob,
            formatValue: (v) => {
              const n = Math.round(v);
              return n > 0 ? `+${n}` : n.toString();
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
            lineNumber: 63,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.phasePosition,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => upd("phasePosition", Math.round(v)),
            label: "Phase Pos",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
            lineNumber: 69,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
        lineNumber: 56,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 mt-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider", style: { color: accent }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: config.phaseDirection,
              onChange: (e) => upd("phaseDirection", e.target.checked),
              className: "accent-current",
              style: { accentColor: accent }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
              lineNumber: 75,
              columnNumber: 13
            },
            void 0
          ),
          "Reverse Direction"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
          lineNumber: 74,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono", style: { color: "#666" }, children: config.isSample ? "(Sample mode)" : "(Synthesis mode)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
          lineNumber: 84,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
        lineNumber: 73,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
      lineNumber: 54,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
        lineNumber: 91,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoDelay,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => upd("vibratoDelay", Math.round(v)),
            label: "Delay",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
            lineNumber: 93,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoSpeed,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => upd("vibratoSpeed", Math.round(v)),
            label: "Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
            lineNumber: 96,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoDepth,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => upd("vibratoDepth", Math.round(v)),
            label: "Depth",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
            lineNumber: 99,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
        lineNumber: 92,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
      lineNumber: 90,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
    lineNumber: 53,
    columnNumber: 5
  }, void 0);
  const renderAdsr = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "4-Point Envelope" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
      lineNumber: 111,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-4", children: config.adsr.map((entry, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono font-bold uppercase tracking-wider", style: { color: accent }, children: ADSR_LABELS[i] ?? `Stage ${i + 1}` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
        lineNumber: 115,
        columnNumber: 15
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: entry.point,
          min: 0,
          max: 255,
          step: 1,
          onChange: (v) => updateAdsrEntry(i, "point", Math.round(v)),
          label: "Level",
          color: knob,
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
          lineNumber: 118,
          columnNumber: 15
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: entry.increment,
          min: 0,
          max: 255,
          step: 1,
          onChange: (v) => updateAdsrEntry(i, "increment", Math.round(v)),
          label: "Rate",
          color: knob,
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
          lineNumber: 121,
          columnNumber: 15
        },
        void 0
      )
    ] }, i, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
      lineNumber: 114,
      columnNumber: 13
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
      lineNumber: 112,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AdsrVisual, { adsr: config.adsr, color: accent, dim }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
      lineNumber: 128,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
    lineNumber: 110,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
    lineNumber: 109,
    columnNumber: 5
  }, void 0);
  const waveCanvasRef = reactExports.useRef(null);
  const waveData = config.waveformData;
  reactExports.useEffect(() => {
    if (activeTab !== "waveform") return;
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#000a1a";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    if (!waveData || waveData.length === 0) {
      ctx.fillStyle = "#555";
      ctx.font = "11px monospace";
      ctx.fillText("(no waveform data)", 8, H / 2 - 6);
      return;
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(waveData.length / W));
    for (let x = 0; x < W; x++) {
      const i = Math.min(waveData.length - 1, x * step);
      const s = waveData[i];
      const y = H / 2 - s / 128 * (H / 2 - 2);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [activeTab, waveData, accent, dim]);
  const renderWaveform = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Waveform Data (read-only)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
      lineNumber: 180,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "canvas",
      {
        ref: waveCanvasRef,
        width: 480,
        height: 96,
        className: "w-full rounded",
        style: { background: "#000a1a", border: `1px solid ${dim}`, imageRendering: "pixelated" }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
        lineNumber: 181,
        columnNumber: 9
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-[10px] font-mono", style: { color: "#888" }, children: waveData && waveData.length > 0 ? `${waveData.length} bytes (${config.phaseLengthInWords} words)` : "No waveform data" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
      lineNumber: 188,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
    lineNumber: 179,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
    lineNumber: 178,
    columnNumber: 5
  }, void 0);
  const TABS = [
    { id: "main", label: "Oscillator" },
    { id: "adsr", label: "Envelope" },
    { id: "waveform", label: "Waveform" }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center border-b", style: { borderColor: dim }, children: TABS.map(({ id, label }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(id),
        className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
        style: {
          color: activeTab === id ? accent : "#666",
          borderBottom: activeTab === id ? `2px solid ${accent}` : "2px solid transparent",
          background: activeTab === id ? "#001520" : "transparent"
        },
        children: label
      },
      id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
        lineNumber: 207,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
      lineNumber: 205,
      columnNumber: 7
    }, void 0),
    activeTab === "main" && renderMain(),
    activeTab === "adsr" && renderAdsr(),
    activeTab === "waveform" && renderWaveform()
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
    lineNumber: 204,
    columnNumber: 5
  }, void 0);
};
const AdsrVisual = ({ adsr, color, dim: dimColor }) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#000a1a";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const x = W / 4 * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H);
    const segW = W / 4;
    for (let i = 0; i < Math.min(adsr.length, 4); i++) {
      const x = segW * (i + 1);
      const y = H - adsr[i].point / 255 * (H - 4);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = color + "88";
    ctx.font = "9px monospace";
    const labels = ["A", "D", "S", "R"];
    for (let i = 0; i < Math.min(adsr.length, 4); i++) {
      ctx.fillText(labels[i], segW * i + 4, 12);
    }
  }, [adsr, color, dimColor]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      width: 320,
      height: 48,
      className: "w-full mt-2 rounded",
      style: { background: "#000a1a", border: `1px solid ${dimColor}` }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RonKlarenControls.tsx",
      lineNumber: 283,
      columnNumber: 5
    },
    void 0
  );
};
export {
  RonKlarenControls
};
