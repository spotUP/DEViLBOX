import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { c9 as ScrollLockContainer, W as CustomSelect, aB as Knob, cO as NUM_HARMONICS, cP as WAVE_NAMES, cQ as WAVE_SAMPLES, cR as formatCutoffHz, cS as filterResponseDb, cT as cutoffToHz } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { H as HarmonicBarsCanvas } from "./HarmonicBarsCanvas-tCyue1dW.js";
import { u as useCMIPanel, C as CMI_TAB_DEFS, f as fmtInt, a as fmtWave, b as fmtCutoff, c as fmtTrack } from "./useCMIPanel-BZl1VcVm.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const CMI_GREEN = "#22c55e";
const CMI_GREEN_DIM = "#166534";
const CMI_GREEN_BRIGHT = "#4ade80";
const CMI_GREEN_FAINT = "#0d3320";
const CMI_GREEN_GLOW = "rgba(34, 197, 94, 0.15)";
const WaveformCanvas = ({ waveform, width, height }) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);
    const mid = height / 2;
    ctx.strokeStyle = CMI_GREEN_FAINT;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();
    for (let q = 1; q < 4; q++) {
      ctx.beginPath();
      ctx.moveTo(q / 4 * width, 0);
      ctx.lineTo(q / 4 * width, height);
      ctx.stroke();
    }
    if (waveform.length > 0) {
      const amp = mid - 6;
      ctx.strokeStyle = CMI_GREEN;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, mid - waveform[0] * amp);
      for (let i = 1; i < waveform.length; i++) {
        ctx.lineTo(i / (waveform.length - 1) * width, mid - waveform[i] * amp);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = CMI_GREEN_DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }, [waveform, width, height]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, width, height, style: { width, height, borderRadius: 4 } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
    lineNumber: 87,
    columnNumber: 10
  }, void 0);
};
const FilterCanvas = ({ cutoff, width, height }) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);
    const fc = cutoffToHz(cutoff);
    const logMin = Math.log10(20), logMax = Math.log10(2e4);
    const dbRange = 60;
    ctx.strokeStyle = CMI_GREEN_FAINT;
    ctx.lineWidth = 0.5;
    for (const f of [100, 1e3, 1e4]) {
      const x = (Math.log10(f) - logMin) / (logMax - logMin) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (const db of [-6, -12, -24, -48]) {
      const y = -db / dbRange * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = CMI_GREEN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px < width; px++) {
      const f = Math.pow(10, logMin + px / width * (logMax - logMin));
      const y = Math.min(height, -filterResponseDb(f, fc) / dbRange * height);
      if (px === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();
    const cx = (Math.log10(Math.max(20, fc)) - logMin) / (logMax - logMin) * width;
    ctx.strokeStyle = CMI_GREEN_BRIGHT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.stroke();
    ctx.strokeStyle = CMI_GREEN_DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }, [cutoff, width, height]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, width, height, style: { width, height, borderRadius: 4 } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
    lineNumber: 147,
    columnNumber: 10
  }, void 0);
};
const EnvelopeCanvas = ({ curve, width, height }) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = CMI_GREEN_FAINT;
    ctx.lineWidth = 0.5;
    for (let q = 1; q <= 4; q++) {
      const y = height - q / 4 * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    if (curve.length > 0) {
      ctx.strokeStyle = CMI_GREEN;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(curve[0].x * width, height - curve[0].y * height);
      for (let i = 1; i < curve.length; i++) {
        ctx.lineTo(curve[i].x * width, height - curve[i].y * height);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = CMI_GREEN_DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }, [curve, width, height]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, width, height, style: { width, height, borderRadius: 4 } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
    lineNumber: 194,
    columnNumber: 10
  }, void 0);
};
const CMIControls = ({
  parameters,
  instrumentId,
  onParamChange
}) => {
  const cmi = useCMIPanel({
    externalParams: parameters,
    externalOnChange: onParamChange,
    instrumentId
  });
  const fileInputRef = reactExports.useRef(null);
  const handleFileDrop = reactExports.useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) cmi.loadSampleFromFile(file);
  }, [cmi]);
  const handleFileSelect = reactExports.useCallback((e) => {
    var _a;
    const file = (_a = e.target.files) == null ? void 0 : _a[0];
    if (file) cmi.loadSampleFromFile(file);
    e.target.value = "";
  }, [cmi]);
  const VIS_W = 420;
  const BAR_H = 140;
  const WAVE_PREVIEW_H = 60;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ScrollLockContainer, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "flex flex-col gap-2 p-3 rounded-lg select-none",
      style: {
        backgroundColor: "#111111",
        border: `1px solid ${CMI_GREEN_DIM}`,
        boxShadow: `inset 0 0 30px rgba(0,0,0,0.5), 0 0 8px ${CMI_GREEN_GLOW}`,
        minHeight: 200
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold tracking-widest", style: { color: CMI_GREEN }, children: "FAIRLIGHT CMI IIx" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 241,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono", style: { color: CMI_GREEN_DIM }, children: "16-Voice Sampling Synthesizer" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 244,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 240,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-0.5", children: Array.from({ length: 16 }, (_, i) => {
            const active = cmi.voiceStatus[i * 4] === 1;
            const env = cmi.voiceStatus[i * 4 + 2];
            const releasing = cmi.voiceStatus[i * 4 + 3] === 1;
            const brightness = active ? Math.max(0.3, env / 255) : 0;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "div",
              {
                title: active ? `V${i + 1}: note ${cmi.voiceStatus[i * 4 + 1]} env ${env}${releasing ? " (rel)" : ""}` : `V${i + 1}: off`,
                style: {
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: active ? releasing ? `rgba(34, 197, 94, ${brightness * 0.6})` : `rgba(34, 197, 94, ${brightness})` : "#1a1a1a",
                  border: `1px solid ${active ? CMI_GREEN_DIM : "#222"}`,
                  boxShadow: active ? `0 0 ${Math.round(brightness * 4)}px ${CMI_GREEN}` : "none"
                }
              },
              i,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                lineNumber: 256,
                columnNumber: 17
              },
              void 0
            );
          }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 249,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
          lineNumber: 239,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1.5 flex-1", children: CMI_TAB_DEFS.map((tab) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => cmi.setActiveTab(tab.id),
              className: "px-3 py-1 text-xs font-mono transition-all rounded-sm",
              style: {
                color: cmi.activeTab === tab.id ? "#000" : CMI_GREEN,
                backgroundColor: cmi.activeTab === tab.id ? CMI_GREEN : "transparent",
                border: `1px solid ${cmi.activeTab === tab.id ? CMI_GREEN : CMI_GREEN_DIM}`
              },
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "opacity-60 mr-1", children: tab.pageNum }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                  lineNumber: 287,
                  columnNumber: 17
                }, void 0),
                tab.label
              ]
            },
            tab.id,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 277,
              columnNumber: 15
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 275,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: "",
              onChange: (v) => cmi.loadPreset(parseInt(v)),
              placeholder: "PRESET",
              options: cmi.presets.map((p, i) => ({ value: String(i), label: p.name })),
              className: "text-[10px] font-mono px-2 py-1 rounded-sm",
              style: {
                backgroundColor: "#0a0a0a",
                color: CMI_GREEN,
                border: `1px solid ${CMI_GREEN_DIM}`,
                outline: "none"
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 292,
              columnNumber: 11
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
          lineNumber: 274,
          columnNumber: 9
        }, void 0),
        cmi.activeTab === "harmonic" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.volume, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("volume", v), label: "Volume", color: CMI_GREEN, formatValue: fmtInt }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 311,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.waveSelect, min: 0, max: 7, onChange: (v) => cmi.handleParamChange("wave_select", v), label: "Wave", color: CMI_GREEN, formatValue: fmtWave }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 312,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 310,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                HarmonicBarsCanvas,
                {
                  harmonics: cmi.harmonics,
                  count: NUM_HARMONICS,
                  width: VIS_W,
                  height: BAR_H,
                  barColor: CMI_GREEN,
                  highlightColor: CMI_GREEN_BRIGHT,
                  gridColor: CMI_GREEN_FAINT,
                  borderColor: CMI_GREEN_DIM,
                  onDragStart: cmi.startHarmonicDrag,
                  onDrag: cmi.updateHarmonicAt,
                  onDragEnd: cmi.endHarmonicDrag
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                  lineNumber: 316,
                  columnNumber: 17
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WaveformCanvas, { waveform: cmi.customWaveform, width: VIS_W, height: WAVE_PREVIEW_H }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                lineNumber: 329,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mt-1", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: cmi.syncHarmonicsToEngine,
                    className: "px-3 py-1 text-[10px] font-mono font-bold rounded-sm transition-all",
                    style: { color: "#000", backgroundColor: CMI_GREEN, border: `1px solid ${CMI_GREEN}` },
                    children: "APPLY TO ENGINE"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                    lineNumber: 331,
                    columnNumber: 19
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono", style: { color: CMI_GREEN_DIM }, children: cmi.sampleLoaded ? `Loaded: ${cmi.sampleName}` : "Draw harmonics then click Apply" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                  lineNumber: 338,
                  columnNumber: 19
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                lineNumber: 330,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 315,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1 pt-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono font-bold mb-1", style: { color: CMI_GREEN_DIM }, children: "PRESETS" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                lineNumber: 344,
                columnNumber: 17
              }, void 0),
              WAVE_NAMES.map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => cmi.selectWavePreset(i),
                  className: "px-2 py-0.5 text-[10px] font-mono rounded-sm text-left transition-all",
                  style: {
                    color: cmi.waveBank === i ? "#000" : CMI_GREEN,
                    backgroundColor: cmi.waveBank === i ? CMI_GREEN : "transparent",
                    border: `1px solid ${cmi.waveBank === i ? CMI_GREEN : CMI_GREEN_DIM}`
                  },
                  children: name.toUpperCase()
                },
                i,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                  lineNumber: 346,
                  columnNumber: 19
                },
                void 0
              ))
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 343,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 314,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
          lineNumber: 309,
          columnNumber: 11
        }, void 0),
        cmi.activeTab === "wave" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.waveSelect, min: 0, max: 7, onChange: (v) => cmi.handleParamChange("wave_select", v), label: "Wave", color: CMI_GREEN, formatValue: fmtWave }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 368,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.volume, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("volume", v), label: "Volume", color: CMI_GREEN, formatValue: fmtInt }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 369,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 367,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "div",
              {
                className: "relative cursor-pointer rounded",
                style: { border: `1px dashed ${CMI_GREEN_DIM}`, width: VIS_W, height: 80 },
                onDragOver: (e) => e.preventDefault(),
                onDrop: handleFileDrop,
                onClick: () => {
                  var _a;
                  return (_a = fileInputRef.current) == null ? void 0 : _a.click();
                },
                children: [
                  cmi.sampleLoaded && cmi.sampleWaveform ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WaveformCanvas, { waveform: cmi.sampleWaveform, width: VIS_W, height: 80 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                    lineNumber: 381,
                    columnNumber: 19
                  }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WaveformCanvas, { waveform: cmi.builtinWaveform, width: VIS_W, height: 80 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                    lineNumber: 383,
                    columnNumber: 19
                  }, void 0),
                  !cmi.sampleLoaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 flex items-center justify-center pointer-events-none", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono opacity-50", style: { color: CMI_GREEN }, children: "DROP WAV/AIFF or CLICK TO BROWSE FILES" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                    lineNumber: 387,
                    columnNumber: 21
                  }, void 0) }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                    lineNumber: 386,
                    columnNumber: 19
                  }, void 0)
                ]
              },
              void 0,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                lineNumber: 373,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("input", { ref: fileInputRef, type: "file", accept: ".wav,.aiff,.aif,.mp3,.ogg,.flac", className: "hidden", onChange: handleFileSelect }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 393,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono font-bold", style: { color: CMI_GREEN }, children: cmi.sampleLoaded ? cmi.sampleName : `BANK ${cmi.waveBank}: ${WAVE_NAMES[cmi.waveBank] ?? "?"}` }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                lineNumber: 395,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono", style: { color: CMI_GREEN_DIM }, children: [
                WAVE_SAMPLES,
                " samples | 8-bit PCM | 16KB/voice"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                lineNumber: 398,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 394,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 372,
            columnNumber: 13
          }, void 0),
          cmi.libraryCategories.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1.5", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono font-bold", style: { color: CMI_GREEN_DIM }, children: [
              "FAIRLIGHT SAMPLE LIBRARY (",
              cmi.libraryCategories.length,
              " categories)"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 406,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", style: { maxWidth: VIS_W }, children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CustomSelect,
                {
                  value: String(cmi.libraryCategoryIndex),
                  onChange: (v) => {
                    cmi.setLibraryCategoryIndex(Number(v));
                  },
                  options: cmi.libraryCategories.map((cat, i) => ({ value: String(i), label: cat.toUpperCase() })),
                  className: "text-[10px] font-mono px-2 py-1 rounded-sm",
                  style: {
                    color: CMI_GREEN,
                    backgroundColor: "#0a0a0a",
                    border: `1px solid ${CMI_GREEN_DIM}`,
                    width: 140,
                    outline: "none"
                  }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                  lineNumber: 411,
                  columnNumber: 19
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CustomSelect,
                {
                  value: String(cmi.librarySampleIndex),
                  onChange: (v) => cmi.loadLibrarySample(Number(v)),
                  placeholder: "— SELECT SAMPLE —",
                  options: cmi.librarySamples.map((s, i) => ({ value: String(i), label: s.name })),
                  className: "text-[10px] font-mono px-2 py-1 rounded-sm flex-1",
                  style: {
                    color: CMI_GREEN,
                    backgroundColor: "#0a0a0a",
                    border: `1px solid ${CMI_GREEN_DIM}`,
                    outline: "none"
                  }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                  lineNumber: 423,
                  columnNumber: 19
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: cmi.prevLibrarySample,
                  className: "px-2 py-1 text-[10px] font-mono rounded-sm",
                  style: { color: CMI_GREEN, border: `1px solid ${CMI_GREEN_DIM}`, background: "transparent" },
                  children: "PREV"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                  lineNumber: 436,
                  columnNumber: 19
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: cmi.nextLibrarySample,
                  className: "px-2 py-1 text-[10px] font-mono rounded-sm",
                  style: { color: CMI_GREEN, border: `1px solid ${CMI_GREEN_DIM}`, background: "transparent" },
                  children: "NEXT"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                  lineNumber: 440,
                  columnNumber: 19
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => cmi.previewing ? cmi.stopPreview() : cmi.previewLibrarySample(),
                  className: "px-2 py-1 text-[10px] font-mono rounded-sm",
                  style: {
                    color: cmi.previewing ? "#000" : CMI_GREEN_BRIGHT,
                    backgroundColor: cmi.previewing ? CMI_GREEN_BRIGHT : "transparent",
                    border: `1px solid ${CMI_GREEN_BRIGHT}`
                  },
                  children: cmi.previewing ? "STOP" : "PREVIEW"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                  lineNumber: 444,
                  columnNumber: 19
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 409,
              columnNumber: 17
            }, void 0),
            cmi.libraryLoading && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono", style: { color: CMI_GREEN_BRIGHT }, children: "Loading..." }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 457,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 405,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
          lineNumber: 366,
          columnNumber: 11
        }, void 0),
        cmi.activeTab === "control" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.volume, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("volume", v), label: "Volume", color: CMI_GREEN, formatValue: fmtInt }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 468,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.waveSelect, min: 0, max: 7, onChange: (v) => cmi.handleParamChange("wave_select", v), label: "Wave", color: CMI_GREEN, formatValue: fmtWave }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 469,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.cutoff, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("filter_cutoff", v), label: "Cutoff", color: CMI_GREEN, formatValue: fmtCutoff }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 470,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.filterTrack, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("filter_track", v), label: "Key Track", color: CMI_GREEN, formatValue: fmtTrack }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 471,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.attackTime, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("attack_time", v), label: "Attack", color: CMI_GREEN, formatValue: fmtInt }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 472,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.releaseTime, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("release_time", v), label: "Release", color: CMI_GREEN, formatValue: fmtInt }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 473,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.envRate, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("envelope_rate", v), label: "Env Rate", color: CMI_GREEN, formatValue: fmtInt }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 474,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 467,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono font-bold", style: { color: CMI_GREEN_DIM }, children: "ENVELOPE" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                lineNumber: 478,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EnvelopeCanvas, { curve: cmi.envelopeCurve, width: Math.floor(VIS_W / 2), height: 120 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                lineNumber: 479,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 477,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono font-bold", style: { color: CMI_GREEN_DIM }, children: "FILTER RESPONSE" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                lineNumber: 482,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FilterCanvas, { cutoff: cmi.cutoff, width: Math.floor(VIS_W / 2), height: 120 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
                lineNumber: 483,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 481,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 476,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
          lineNumber: 466,
          columnNumber: 11
        }, void 0),
        cmi.activeTab === "filter" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.cutoff, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("filter_cutoff", v), label: "Cutoff", color: CMI_GREEN, formatValue: fmtCutoff }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 493,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.filterTrack, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("filter_track", v), label: "Key Track", color: CMI_GREEN, formatValue: fmtTrack }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 494,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 492,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] font-mono font-bold", style: { color: CMI_GREEN }, children: "SSM2045 x2 CASCADED LOWPASS (-24dB/oct)" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 497,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FilterCanvas, { cutoff: cmi.cutoff, width: VIS_W, height: 120 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 500,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono", style: { color: CMI_GREEN_DIM }, children: [
              "Cutoff: ",
              formatCutoffHz(cmi.cutoff),
              "Hz | Max: 14kHz"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 501,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 496,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
          lineNumber: 491,
          columnNumber: 11
        }, void 0),
        cmi.activeTab === "envelope" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.attackTime, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("attack_time", v), label: "Attack", color: CMI_GREEN, formatValue: fmtInt }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 512,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.releaseTime, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("release_time", v), label: "Release", color: CMI_GREEN, formatValue: fmtInt }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 513,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: cmi.envRate, min: 0, max: 255, onChange: (v) => cmi.handleParamChange("envelope_rate", v), label: "Rate", color: CMI_GREEN, formatValue: fmtInt }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 514,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 511,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] font-mono font-bold", style: { color: CMI_GREEN }, children: "HARDWARE ENVELOPE GENERATOR" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 517,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EnvelopeCanvas, { curve: cmi.envelopeCurve, width: VIS_W, height: 120 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 520,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono", style: { color: CMI_GREEN_DIM }, children: "8-bit up/down counter | 6-bit divider chain | PTM6840 timer-driven" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
              lineNumber: 521,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
            lineNumber: 516,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
          lineNumber: 510,
          columnNumber: 11
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
      lineNumber: 229,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/CMIControls.tsx",
    lineNumber: 228,
    columnNumber: 5
  }, void 0);
};
export {
  CMIControls,
  CMIControls as default
};
