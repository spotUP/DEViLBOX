import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { w as writeWaveformByte } from "./waveformDraw-Qi2V4aQb.js";
import { R as useTrackerStore, e as useInstrumentStore, aB as Knob } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SampleBrowserPane } from "./SampleBrowserPane-B7s228O0.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function generateWaveformPreset(kind, size = 64) {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    let s = 0;
    switch (kind) {
      case "sine":
        s = Math.round(Math.sin(i / size * Math.PI * 2) * 120);
        break;
      case "triangle": {
        const half = size / 2;
        const phase = i < half ? i / half : 1 - (i - half) / half;
        s = Math.round((phase * 2 - 1) * 120);
        break;
      }
      case "square":
        s = i < size / 2 ? 120 : -120;
        break;
      case "saw":
        s = Math.round((i / size * 2 - 1) * 120);
        break;
      case "noise":
        s = Math.round((Math.random() * 2 - 1) * 120);
        break;
      case "clear":
        s = 0;
        break;
    }
    buf[i] = s < 0 ? s + 256 : s;
  }
  return buf;
}
function drawWaveform(canvas, waveformData, phaseDelta) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 120;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.scale(dpr, dpr);
  const w = cssW;
  const h = cssH;
  const mid = h / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#1a2a3a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
  if (!waveformData || waveformData.length < 64) {
    ctx.fillStyle = "#4a5a6a";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("No AM waveform data", w / 2, mid);
    return;
  }
  const WAVE_SIZE = 64;
  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let phase = 0;
  for (let x = 0; x < w; x++) {
    const idx = Math.floor(x / w * WAVE_SIZE) % WAVE_SIZE;
    const phaseIdx = (idx + Math.floor(phase / 4)) % WAVE_SIZE;
    const s1 = waveformData[idx] > 127 ? waveformData[idx] - 256 : waveformData[idx];
    const s2 = waveformData[phaseIdx] > 127 ? waveformData[phaseIdx] - 256 : waveformData[phaseIdx];
    const blended = (s1 + s2) / 2;
    const y = mid - blended / 128 * (mid - 4);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    phase = phase + Math.floor(phaseDelta * WAVE_SIZE / w) & 255;
  }
  ctx.stroke();
  ctx.strokeStyle = "#00ff8840";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const idx = Math.floor(x / w * WAVE_SIZE) % WAVE_SIZE;
    const s = waveformData[idx] > 127 ? waveformData[idx] - 256 : waveformData[idx];
    const y = mid - s / 128 * (mid - 4);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
const JamCrackerControls = ({
  config,
  onChange,
  instrumentId
}) => {
  const seekToUsage = reactExports.useCallback(() => {
    if (instrumentId === void 0) {
      console.warn("[JamCracker] Find Usage: no instrumentId on this editor");
      return;
    }
    const state = useTrackerStore.getState();
    const { patterns, patternOrder, setCurrentPosition } = state;
    const hitPatternIndices = /* @__PURE__ */ new Set();
    for (let p = 0; p < patterns.length; p++) {
      const pat = patterns[p];
      let found = false;
      for (const ch of pat.channels) {
        for (const cell of ch.rows) {
          if (cell.instrument === instrumentId) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) hitPatternIndices.add(p);
    }
    if (hitPatternIndices.size === 0) {
      console.warn(`[JamCracker] instrument ${instrumentId} is not used in any pattern`);
      return;
    }
    for (let i = 0; i < patternOrder.length; i++) {
      if (hitPatternIndices.has(patternOrder[i])) {
        setCurrentPosition(i, false);
        return;
      }
    }
    console.warn(`[JamCracker] instrument ${instrumentId} found in pattern(s) but none are in the song order`);
  }, [instrumentId]);
  const canvasRef = reactExports.useRef(null);
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const raf = requestAnimationFrame(() => {
      drawWaveform(canvas, configRef.current.waveformData, configRef.current.phaseDelta);
    });
    const obs = new ResizeObserver(() => {
      drawWaveform(canvas, configRef.current.waveformData, configRef.current.phaseDelta);
    });
    obs.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [config.waveformData, config.phaseDelta]);
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const isDrawingRef = reactExports.useRef(false);
  const lastIdxRef = reactExports.useRef(-1);
  const writeWaveformByteFromEvent = reactExports.useCallback((e) => {
    const cur = configRef.current;
    if (!cur.isAM || !cur.waveformData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { next, idx } = writeWaveformByte(
      cur.waveformData,
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      lastIdxRef.current
    );
    lastIdxRef.current = idx;
    onChange({ ...cur, waveformData: next });
  }, [onChange]);
  const handlePointerDown = reactExports.useCallback((e) => {
    if (!configRef.current.isAM) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastIdxRef.current = -1;
    writeWaveformByteFromEvent(e);
  }, [writeWaveformByteFromEvent]);
  const handlePointerMove = reactExports.useCallback((e) => {
    if (!isDrawingRef.current) return;
    writeWaveformByteFromEvent(e);
  }, [writeWaveformByteFromEvent]);
  const handlePointerUp = reactExports.useCallback((e) => {
    isDrawingRef.current = false;
    lastIdxRef.current = -1;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
  }, []);
  const applyPreset = reactExports.useCallback((kind) => {
    var _a;
    const cur = configRef.current;
    const size = Math.max(64, ((_a = cur.waveformData) == null ? void 0 : _a.length) ?? 64);
    onChange({ ...cur, waveformData: generateWaveformPreset(kind, size) });
  }, [onChange]);
  const [showSamplePane, setShowSamplePane] = reactExports.useState(false);
  const allInstruments = useInstrumentStore((s) => s.instruments);
  const sampleRows = reactExports.useMemo(() => {
    return allInstruments.filter((inst) => inst.synthType === "JamCrackerSynth" && inst.jamCracker).map((inst) => {
      var _a;
      const c = inst.jamCracker;
      return {
        id: inst.id,
        instrName: inst.name || c.name || `#${inst.id}`,
        sampleName: c.name || "(unnamed)",
        size: c.isAM ? ((_a = c.waveformData) == null ? void 0 : _a.length) ?? 64 : c.sampleSize,
        isAM: c.isAM,
        hasLoop: c.hasLoop,
        isCurrent: c === config
      };
    });
  }, [allInstruments, config]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4 synth-controls-flow flex-1 min-w-0 overflow-y-auto", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 text-sm", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-highlight font-mono font-bold", children: "JamCracker Pro" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
          lineNumber: 296,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "|" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
          lineNumber: 297,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "text",
            value: config.name,
            onChange: (e) => onChange({ ...configRef.current, name: e.target.value }),
            className: "px-2 py-0.5 rounded bg-dark-bg border border-dark-border text-text-primary font-mono text-xs focus:outline-none focus:border-accent-primary min-w-[120px]",
            placeholder: "Instrument name"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
            lineNumber: 298,
            columnNumber: 9
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 ml-auto", children: [
          config.isAM && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs font-mono", children: "AM SYNTH" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
            lineNumber: 307,
            columnNumber: 13
          }, void 0),
          config.hasLoop && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "px-2 py-0.5 bg-green-900/50 text-green-300 rounded text-xs font-mono", children: "LOOP" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
            lineNumber: 312,
            columnNumber: 13
          }, void 0),
          !config.isAM && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded text-xs font-mono", children: [
            "PCM (",
            config.sampleSize,
            " bytes)"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
            lineNumber: 317,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: seekToUsage,
              disabled: instrumentId === void 0,
              title: "Find a song position where this instrument is used and seek the player there",
              className: "px-2 py-0.5 rounded text-[10px] font-mono border bg-dark-bg text-accent-secondary border-dark-border hover:text-accent-primary hover:border-accent-primary/50 disabled:opacity-40 disabled:cursor-not-allowed",
              children: "▶ Find Usage"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
              lineNumber: 321,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setShowSamplePane((v) => !v),
              title: `${showSamplePane ? "Hide" : "Show"} sample browser`,
              className: `px-2 py-0.5 rounded text-[10px] font-mono border ${showSamplePane ? "bg-accent-primary/20 text-accent-primary border-accent-primary/60" : "bg-dark-bg text-text-secondary border-dark-border hover:text-accent-primary hover:border-accent-primary/50"}`,
              children: "SMP"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
              lineNumber: 329,
              columnNumber: 11
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
          lineNumber: 305,
          columnNumber: 9
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
        lineNumber: 295,
        columnNumber: 7
      }, void 0),
      config.isAM && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted font-mono uppercase tracking-wider", children: "AM Waveform — click + drag to draw" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
            lineNumber: 347,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: ["sine", "triangle", "square", "saw", "noise", "clear"].map((k) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => applyPreset(k),
              className: "text-[9px] font-mono px-1.5 py-0.5 rounded border border-dark-border text-text-secondary hover:text-accent-primary hover:border-accent-primary/50 uppercase",
              title: `Fill waveform with ${k}`,
              children: k
            },
            k,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
              lineNumber: 352,
              columnNumber: 17
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
            lineNumber: 350,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
          lineNumber: 346,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: canvasRef,
            className: "w-full rounded border border-dark-border bg-[#0a0e14] cursor-crosshair",
            style: { height: 120, touchAction: "none" },
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerUp
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
            lineNumber: 363,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
        lineNumber: 345,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 items-start", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.volume / 64,
              onChange: (v) => updateParam("volume", Math.round(v * 64)),
              size: "md",
              label: "Volume",
              min: 0,
              max: 1,
              bipolar: false
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
              lineNumber: 378,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted font-mono", children: config.volume }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
            lineNumber: 387,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
          lineNumber: 377,
          columnNumber: 9
        }, void 0),
        config.isAM && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.phaseDelta / 255,
              onChange: (v) => updateParam("phaseDelta", Math.round(v * 255)),
              size: "md",
              label: "Phase Δ",
              min: 0,
              max: 1,
              bipolar: false
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
              lineNumber: 392,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted font-mono", children: config.phaseDelta }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
            lineNumber: 401,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
          lineNumber: 391,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
        lineNumber: 376,
        columnNumber: 7
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 text-[11px] font-mono", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted uppercase tracking-wider", children: "Flags:" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
          lineNumber: 408,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1.5 cursor-pointer text-text-primary select-none", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: (config.flags & 1) !== 0,
              onChange: (e) => {
                const cur = configRef.current;
                const newFlags = e.target.checked ? cur.flags | 1 : cur.flags & -2;
                onChange({
                  ...cur,
                  flags: newFlags,
                  isAM: (newFlags & 2) !== 0,
                  hasLoop: (newFlags & 1) !== 0
                });
              },
              className: "accent-accent-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
              lineNumber: 410,
              columnNumber: 11
            },
            void 0
          ),
          "Loop"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
          lineNumber: 409,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-1.5 cursor-pointer text-text-primary select-none", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: (config.flags & 2) !== 0,
              onChange: (e) => {
                const cur = configRef.current;
                const newFlags = e.target.checked ? cur.flags | 2 : cur.flags & -3;
                onChange({
                  ...cur,
                  flags: newFlags,
                  isAM: (newFlags & 2) !== 0,
                  hasLoop: (newFlags & 1) !== 0
                });
              },
              className: "accent-accent-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
              lineNumber: 428,
              columnNumber: 11
            },
            void 0
          ),
          "AM Synth"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
          lineNumber: 427,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted ml-auto", children: [
          "0x",
          config.flags.toString(16).padStart(2, "0"),
          config.isAM ? " — AM synthesis (64-byte waveform loop with phase modulation)" : " — PCM sample"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
          lineNumber: 445,
          columnNumber: 9
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
        lineNumber: 407,
        columnNumber: 7
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
      lineNumber: 293,
      columnNumber: 7
    }, void 0),
    showSamplePane && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      SampleBrowserPane,
      {
        entries: sampleRows.map((s) => ({
          id: s.id,
          name: `${String(s.id).padStart(2, "0")}. ${s.sampleName}`,
          sizeBytes: s.size,
          isCurrent: s.isCurrent
        })),
        emptyMessage: "No JamCracker instruments loaded.",
        renderEntry: (entry) => {
          const s = sampleRows.find((r) => r.id === entry.id);
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `font-mono truncate ${s.isCurrent ? "text-accent-primary" : "text-text-primary"}`, children: [
              String(s.id).padStart(2, "0"),
              ". ",
              s.sampleName
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
              lineNumber: 466,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted mt-0.5", children: [
              s.size,
              " bytes",
              s.hasLoop && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-1 text-accent-success", children: "·loop" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
                lineNumber: 471,
                columnNumber: 33
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
              lineNumber: 469,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-0.5 text-[9px]", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: s.isAM ? "text-accent-highlight" : "text-accent-secondary", children: s.isAM ? "AM SYNTH" : "PCM" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
                lineNumber: 474,
                columnNumber: 19
              }, void 0),
              s.isCurrent && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-1 text-accent-primary", children: "(this instrument)" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
                lineNumber: 477,
                columnNumber: 35
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
              lineNumber: 473,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
            lineNumber: 465,
            columnNumber: 15
          }, void 0);
        }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
        lineNumber: 454,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/JamCrackerControls.tsx",
    lineNumber: 292,
    columnNumber: 5
  }, void 0);
};
export {
  JamCrackerControls
};
