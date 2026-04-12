import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, aM as Clock, R as React, X, A as Music, u as Disc, q as Radio, av as ArrowLeftRight, k as SlidersVertical, $ as Waves, Z as Zap, aN as Gauge, G as Globe, Y as Wind } from "./vendor-ui-AJ7AT9BN.js";
import { as as useAudioStore, ax as useTransportStore, dM as bpmToMs, fk as SYNC_DIVISIONS, W as CustomSelect, fl as isEffectBpmSynced, fm as getEffectSyncDivision, aB as Knob, R as useTrackerStore, cV as useShallow, $ as getToneEngine, fn as AelapseEffect, fo as VOCODER_EFFECT_PRESETS, bN as BUZZMACHINE_INFO, fp as WAMEffectNode } from "./main-BbV5VyEH.js";
import { u as useVisualizationAnimation } from "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionHeader } from "./SectionHeader-DHk3L-9n.js";
function useEffectAnalyser(effectId, mode) {
  const FFT_SIZE = 2048;
  const preRef = reactExports.useRef(new Float32Array(FFT_SIZE));
  const postRef = reactExports.useRef(new Float32Array(FFT_SIZE));
  const [, setTick] = reactExports.useState(0);
  const hasAnalyserRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    preRef.current = new Float32Array(FFT_SIZE);
    postRef.current = new Float32Array(FFT_SIZE);
  }, [effectId, mode]);
  useVisualizationAnimation({
    onFrame: () => {
      const engine = useAudioStore.getState().toneEngineInstance;
      const analysers = (engine == null ? void 0 : engine.getMasterEffectAnalysers(effectId)) ?? null;
      if (!analysers) {
        if (hasAnalyserRef.current) {
          hasAnalyserRef.current = false;
          preRef.current = new Float32Array(FFT_SIZE);
          postRef.current = new Float32Array(FFT_SIZE);
          setTick((t) => t + 1);
        }
        return false;
      }
      hasAnalyserRef.current = true;
      const binCount = analysers.pre.frequencyBinCount;
      if (preRef.current.length !== binCount) {
        preRef.current = new Float32Array(binCount);
        postRef.current = new Float32Array(binCount);
      }
      if (mode === "waveform") {
        analysers.pre.getFloatTimeDomainData(preRef.current);
        analysers.post.getFloatTimeDomainData(postRef.current);
      } else {
        analysers.pre.getFloatFrequencyData(preRef.current);
        analysers.post.getFloatFrequencyData(postRef.current);
      }
      setTick((t) => t + 1);
      return true;
    },
    enabled: true
  });
  return { pre: preRef.current, post: postRef.current };
}
function computeRMS(data) {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}
function chebyshev(n, x) {
  if (n === 0) return 1;
  if (n === 1) return x;
  let prev2 = 1;
  let prev1 = x;
  for (let k = 2; k <= n; k++) {
    const curr = 2 * x * prev1 - prev2;
    prev2 = prev1;
    prev1 = curr;
  }
  return prev1;
}
const EffectOscilloscope = ({
  pre,
  post,
  color,
  width = 300,
  height = 80
}) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr) canvas.width = width * dpr;
    if (canvas.height !== height * dpr) canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "var(--color-border-light)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    let startIndex = 0;
    for (let i = 1; i < pre.length; i++) {
      if (pre[i - 1] < 0 && pre[i] >= 0) {
        startIndex = i;
        break;
      }
    }
    const drawWave = (data, strokeColor, lineWidth) => {
      const maxSamples = Math.min(1024, data.length - startIndex);
      if (maxSamples <= 0) return;
      const sliceWidth = width / maxSamples;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (let i = 0; i < maxSamples; i++) {
        const sample = data[startIndex + i];
        const x = i * sliceWidth;
        const y = (1 - sample) * (height / 2);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };
    drawWave(pre, "rgba(160,160,160,0.5)", 1);
    drawWave(post, color, 1.5);
  });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      style: {
        width: "100%",
        height: `${height}px`,
        borderRadius: 4,
        display: "block"
      }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectVisualizer.tsx",
      lineNumber: 126,
      columnNumber: 5
    },
    void 0
  );
};
const EffectSpectrum = ({
  pre,
  post,
  color,
  width = 300,
  height = 80,
  sampleRate = 44100
}) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr) canvas.width = width * dpr;
    if (canvas.height !== height * dpr) canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);
    const binCount = pre.length;
    if (binCount === 0) return;
    const nyquist = sampleRate / 2;
    const minDb = -100;
    const maxDb = 0;
    const freqToX = (bin) => {
      const freq = bin / binCount * nyquist;
      const safeFreq = Math.max(freq, 20);
      return Math.log10(safeFreq / 20) / Math.log10(nyquist / 20) * width;
    };
    const dbToY = (db) => {
      const clamped = Math.max(minDb, Math.min(maxDb, db));
      return height - (clamped - minDb) / (maxDb - minDb) * height;
    };
    ctx.fillStyle = "rgba(120,120,120,0.25)";
    ctx.beginPath();
    ctx.moveTo(freqToX(1), height);
    for (let i = 1; i < binCount; i++) {
      const x = freqToX(i);
      const y = dbToY(pre[i]);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(freqToX(binCount - 1), height);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 1; i < binCount; i++) {
      const x = freqToX(i);
      const y = dbToY(post[i]);
      if (i === 1) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      style: {
        width: "100%",
        height: `${height}px`,
        borderRadius: 4,
        display: "block"
      }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectVisualizer.tsx",
      lineNumber: 229,
      columnNumber: 5
    },
    void 0
  );
};
const WaveshaperCurve = ({
  type,
  drive = 0.5,
  order = 3,
  bits = 8,
  color,
  width = 120,
  height = 120
}) => {
  const canvasRef = reactExports.useRef(null);
  const draw = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "var(--color-border-light)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    const numPoints = width * 4;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = i / (numPoints - 1) * 2 - 1;
      const canvasX = i / (numPoints - 1) * width;
      let y = 0;
      if (type === "Distortion") {
        const driveGain = Math.tanh(drive * 10 + 0.1);
        y = Math.tanh((drive * 10 + 0.1) * x) / driveGain;
      } else if (type === "Chebyshev") {
        const n = Math.max(1, Math.round(order));
        const normFactor = chebyshev(n, 1);
        y = normFactor !== 0 ? chebyshev(n, x) / normFactor : chebyshev(n, x);
        y = Math.max(-1, Math.min(1, y));
      } else if (type === "TapeSaturation") {
        const gain = drive * 5 + 0.1;
        const sign = x < 0 ? -1 : 1;
        const absX = Math.abs(x);
        const satNorm = Math.tanh(gain);
        y = satNorm !== 0 ? sign * Math.tanh(absX * gain) / satNorm : sign * Math.tanh(absX * gain);
      } else if (type === "BitCrusher") {
        const levels = Math.pow(2, Math.max(1, Math.round(bits)));
        y = Math.round(x * levels) / levels;
        y = Math.max(-1, Math.min(1, y));
      }
      const canvasY = (1 - y) * (height / 2);
      if (i === 0) {
        ctx.moveTo(canvasX, canvasY);
      } else {
        ctx.lineTo(canvasX, canvasY);
      }
    }
    ctx.stroke();
  }, [type, drive, order, bits, color, width, height]);
  reactExports.useEffect(() => {
    draw();
  }, [draw]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      style: {
        width: `${width}px`,
        maxWidth: "100%",
        height: `${height}px`,
        aspectRatio: "1",
        borderRadius: 4,
        display: "block"
      }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectVisualizer.tsx",
      lineNumber: 349,
      columnNumber: 5
    },
    void 0
  );
};
const GainReductionMeter = ({
  pre,
  post,
  width = 80,
  height = 120
}) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);
    const rmsPre = computeRMS(pre);
    const rmsPost = computeRMS(post);
    const minDb = -60;
    const maxDb = 0;
    const toNorm = (db) => Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
    const levelBarX = 4;
    const levelBarW = width / 2 - 8;
    const barH = height - 24;
    ctx.fillStyle = "#1a1a1f";
    ctx.fillRect(levelBarX, 8, levelBarW, barH);
    const postDb = rmsPost > 0 ? 20 * Math.log10(rmsPost) : minDb;
    const levelNorm = toNorm(postDb);
    const levelBarHeight = levelNorm * barH;
    let levelColor = "#4ade80";
    if (postDb > -6) levelColor = "#ef4444";
    else if (postDb > -12) levelColor = "#f59e0b";
    ctx.fillStyle = levelColor;
    ctx.fillRect(levelBarX, 8 + barH - levelBarHeight, levelBarW, levelBarHeight);
    const grBarX = width / 2 + 4;
    const grBarW = width / 2 - 8;
    ctx.fillStyle = "#1a1a1f";
    ctx.fillRect(grBarX, 8, grBarW, barH);
    if (rmsPre > 0 && rmsPost > 0) {
      const grDb = 20 * Math.log10(rmsPost / rmsPre);
      const grClamped = Math.max(-20, Math.min(0, grDb));
      const grNorm = Math.abs(grClamped) / 20;
      const grBarHeight = grNorm * barH;
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(grBarX, 8, grBarW, grBarHeight);
      const grText = `${grClamped.toFixed(1)}`;
      ctx.fillStyle = "#ef4444";
      ctx.font = "8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(grText, width - 2, height - 2);
    }
    ctx.fillStyle = "#666";
    ctx.font = "8px monospace";
    ctx.textAlign = "left";
    ctx.fillText("LEVEL", levelBarX, height - 2);
    ctx.textAlign = "right";
    ctx.fillText("GR", width - 2, height - 12);
  });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: 4,
        display: "block"
      }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectVisualizer.tsx",
      lineNumber: 467,
      columnNumber: 5
    },
    void 0
  );
};
const BpmSyncControl = ({
  bpmSync,
  syncDivision,
  onToggleSync,
  onChangeDivision
}) => {
  const bpm = useTransportStore((s) => s.bpm);
  const isOn = bpmSync === 1;
  const computedMs = reactExports.useMemo(
    () => isOn ? bpmToMs(bpm, syncDivision) : null,
    [isOn, bpm, syncDivision]
  );
  const grouped = reactExports.useMemo(() => {
    const groups = {};
    for (const d of SYNC_DIVISIONS) {
      (groups[d.category] ??= []).push(d);
    }
    return groups;
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mt-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => onToggleSync(!isOn),
        className: `flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide transition-colors ${isOn ? "bg-emerald-600 text-text-primary" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover"}`,
        title: isOn ? "BPM sync ON — click to disable" : "Enable BPM sync",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Clock, { size: 12 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/BpmSyncControl.tsx",
            lineNumber: 63,
            columnNumber: 9
          }, void 0),
          "Sync"
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/BpmSyncControl.tsx",
        lineNumber: 54,
        columnNumber: 7
      },
      void 0
    ),
    isOn && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: syncDivision,
          onChange: (v) => onChangeDivision(v),
          options: Object.entries(grouped).map(([cat, divs]) => ({
            label: cat,
            options: divs.map((d) => ({
              value: d.value,
              label: d.label
            }))
          })),
          className: "bg-dark-bgTertiary text-text-secondary text-xs rounded px-2 py-1 border border-dark-borderLight focus:outline-none focus:border-emerald-500"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/BpmSyncControl.tsx",
          lineNumber: 70,
          columnNumber: 11
        },
        void 0
      ),
      computedMs !== null && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-emerald-400 font-mono tabular-nums", children: computedMs < 1e3 ? `${Math.round(computedMs)}ms` : `${(computedMs / 1e3).toFixed(2)}s` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/BpmSyncControl.tsx",
        lineNumber: 85,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/BpmSyncControl.tsx",
      lineNumber: 68,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/BpmSyncControl.tsx",
    lineNumber: 52,
    columnNumber: 5
  }, void 0);
};
function getParam(effect, key, defaultValue) {
  const value = effect.parameters[key];
  return typeof value === "number" ? value : defaultValue;
}
function renderBpmSync(effect, onUpdateParameter) {
  const synced = isEffectBpmSynced(effect.parameters);
  const division = getEffectSyncDivision(effect.parameters);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    BpmSyncControl,
    {
      bpmSync: synced ? 1 : 0,
      syncDivision: division,
      onToggleSync: (enabled) => onUpdateParameter("bpmSync", enabled ? 1 : 0),
      onChangeDivision: (div) => onUpdateParameter("syncDivision", div)
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/shared.tsx",
      lineNumber: 40,
      columnNumber: 5
    },
    this
  );
}
const DistortionEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  var _a;
  const drive = getParam(effect, "drive", 0.4);
  const oversample = ((_a = effect.parameters) == null ? void 0 : _a.oversample) || "none";
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const OVERSAMPLE_OPTS = ["none", "2x", "4x"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#ef4444" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 29,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WaveshaperCurve, { type: "Distortion", drive, color: "#ef4444", height: 100 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 30,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ef4444", title: "Distortion" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 32,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-2 mb-4", children: OVERSAMPLE_OPTS.map((o) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("oversample", o),
          className: `px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${oversample === o ? "bg-red-700/70 border-red-500 text-red-100" : "bg-black/40 border-dark-border text-text-muted hover:border-red-700"}`,
          children: o === "none" ? "Off" : o
        },
        o,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
          lineNumber: 35,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 33,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: drive,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("drive", v),
            label: "Drive",
            size: "lg",
            color: "#ef4444",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 42,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            size: "lg",
            color: "#f97316",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 52,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 41,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 31,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
    lineNumber: 28,
    columnNumber: 5
  }, void 0);
};
const ReverbEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const decay = getParam(effect, "decay", 1.5);
  const preDelay = getParam(effect, "preDelay", 0.01);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#6366f1" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 83,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#6366f1", title: "Reverb" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 85,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: decay,
            min: 0.1,
            max: 10,
            onChange: (v) => onUpdateParameter("decay", v),
            label: "Decay",
            color: "#6366f1",
            formatValue: (v) => `${v.toFixed(1)}s`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 87,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: preDelay,
            min: 0,
            max: 0.5,
            onChange: (v) => onUpdateParameter("preDelay", v),
            label: "Pre-Delay",
            color: "#6366f1",
            formatValue: (v) => `${Math.round(v * 1e3)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 96,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#8b5cf6",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 105,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 86,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 84,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
    lineNumber: 82,
    columnNumber: 5
  }, void 0);
};
const DelayEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const time = getParam(effect, "time", 0.25);
  const feedback = getParam(effect, "feedback", 0.5);
  const synced = isEffectBpmSynced(effect.parameters);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const isPingPong = effect.type === "PingPongDelay";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#3b82f6" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 138,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#3b82f6", title: isPingPong ? "Ping Pong Delay" : "Delay" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 140,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: synced ? "opacity-40 pointer-events-none" : "", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: time,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("time", v),
            label: "Time",
            color: "#3b82f6",
            formatValue: (v) => `${Math.round(v * 1e3)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 143,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
          lineNumber: 142,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: feedback,
            min: 0,
            max: 0.95,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            color: "#3b82f6",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 153,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#06b6d4",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 162,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 141,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 139,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
    lineNumber: 137,
    columnNumber: 5
  }, void 0);
};
const ChorusEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const frequency = getParam(effect, "frequency", 1.5);
  const depth = getParam(effect, "depth", 0.7);
  const delayTime = getParam(effect, "delayTime", 3.5);
  const synced = isEffectBpmSynced(effect.parameters);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#ec4899" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 195,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ec4899", title: "Chorus" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 197,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: synced ? "opacity-40 pointer-events-none" : "", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: 0,
            max: 20,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Rate",
            size: "sm",
            color: "#ec4899",
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 200,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
          lineNumber: 199,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: depth,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("depth", v),
            label: "Depth",
            size: "sm",
            color: "#ec4899",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 211,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: delayTime,
            min: 2,
            max: 20,
            onChange: (v) => onUpdateParameter("delayTime", v),
            label: "Delay",
            size: "sm",
            color: "#ec4899",
            formatValue: (v) => `${v.toFixed(1)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 221,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            size: "sm",
            color: "#f472b6",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 231,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 198,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 196,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
    lineNumber: 194,
    columnNumber: 5
  }, void 0);
};
const PhaserEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const frequency = getParam(effect, "frequency", 0.5);
  const octaves = getParam(effect, "octaves", 3);
  const baseFrequency = getParam(effect, "baseFrequency", 350);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#a855f7" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 264,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a855f7", title: "Phaser" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 266,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: 0,
            max: 20,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Rate",
            size: "sm",
            color: "#a855f7",
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 268,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: octaves,
            min: 0,
            max: 8,
            onChange: (v) => onUpdateParameter("octaves", v),
            label: "Octaves",
            size: "sm",
            color: "#a855f7",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 278,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: baseFrequency,
            min: 50,
            max: 1e3,
            onChange: (v) => onUpdateParameter("baseFrequency", v),
            label: "Base Freq",
            size: "sm",
            color: "#a855f7",
            formatValue: (v) => `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 288,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            size: "sm",
            color: "#c084fc",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 298,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 267,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 265,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
    lineNumber: 263,
    columnNumber: 5
  }, void 0);
};
const TremoloEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  var _a;
  const frequency = getParam(effect, "frequency", 10);
  const depth = getParam(effect, "depth", 0.5);
  const type = ((_a = effect.parameters) == null ? void 0 : _a.type) || "sine";
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const WAVE_TYPES = ["sine", "triangle", "square", "sawtooth"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#f97316" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 332,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#f97316", title: "Tremolo" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 334,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-2 mb-4", children: WAVE_TYPES.map((w) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("type", w),
          className: `px-3 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${type === w ? "bg-orange-700/70 border-orange-500 text-orange-100" : "bg-black/40 border-dark-border text-text-muted hover:border-orange-700"}`,
          children: w === "sawtooth" ? "saw" : w
        },
        w,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
          lineNumber: 337,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 335,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Rate",
            color: "#f97316",
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 344,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: depth,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("depth", v),
            label: "Depth",
            color: "#f97316",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 353,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#fb923c",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 362,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 343,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 333,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
    lineNumber: 331,
    columnNumber: 5
  }, void 0);
};
const VibratoEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  var _a;
  const frequency = getParam(effect, "frequency", 5);
  const depth = getParam(effect, "depth", 0.1);
  const type = ((_a = effect.parameters) == null ? void 0 : _a.type) || "sine";
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const WAVE_TYPES = ["sine", "triangle", "square", "sawtooth"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#14b8a6" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 395,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#14b8a6", title: "Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 397,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-2 mb-4", children: WAVE_TYPES.map((w) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("type", w),
          className: `px-3 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${type === w ? "bg-teal-700/70 border-teal-500 text-teal-100" : "bg-black/40 border-dark-border text-text-muted hover:border-teal-700"}`,
          children: w === "sawtooth" ? "saw" : w
        },
        w,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
          lineNumber: 400,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 398,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Rate",
            color: "#14b8a6",
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 407,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: depth,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("depth", v),
            label: "Depth",
            color: "#14b8a6",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 416,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#2dd4bf",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
            lineNumber: 425,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
        lineNumber: 406,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
      lineNumber: 396,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BasicEffectEditors.tsx",
    lineNumber: 394,
    columnNumber: 5
  }, void 0);
};
const AutoFilterEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  var _a;
  const frequency = getParam(effect, "frequency", 1);
  const baseFrequency = getParam(effect, "baseFrequency", 200);
  const octaves = getParam(effect, "octaves", 2.6);
  const type = ((_a = effect.parameters) == null ? void 0 : _a.type) || "sine";
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  const WAVE_TYPES = ["sine", "triangle", "square", "sawtooth"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#eab308" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 34,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#eab308", title: "Auto Filter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 36,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-2 mb-4", children: WAVE_TYPES.map((w) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("type", w),
          className: `px-3 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${type === w ? "bg-yellow-700/70 border-yellow-500 text-yellow-100" : "bg-black/40 border-dark-border text-text-muted hover:border-yellow-700"}`,
          children: w === "sawtooth" ? "saw" : w
        },
        w,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
          lineNumber: 39,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 37,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: 0,
            max: 20,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Rate",
            size: "sm",
            color: "#eab308",
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 46,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: baseFrequency,
            min: 20,
            max: 2e3,
            onChange: (v) => onUpdateParameter("baseFrequency", v),
            label: "Base Freq",
            size: "sm",
            color: "#eab308",
            formatValue: (v) => `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 56,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: octaves,
            min: 0,
            max: 8,
            onChange: (v) => onUpdateParameter("octaves", v),
            label: "Octaves",
            size: "sm",
            color: "#eab308",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 66,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            size: "sm",
            color: "#fbbf24",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 76,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 45,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 35,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
    lineNumber: 33,
    columnNumber: 5
  }, void 0);
};
const CompressorEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const threshold = getParam(effect, "threshold", -24);
  const ratio = getParam(effect, "ratio", 12);
  const attack = getParam(effect, "attack", 3e-3);
  const release = getParam(effect, "release", 0.25);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#10b981" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 109,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GainReductionMeter, { pre, post }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 110,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#10b981", title: "Compressor" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 112,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: threshold,
            min: -100,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Threshold",
            size: "sm",
            color: "#10b981",
            formatValue: (v) => `${Math.round(v)}dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 114,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ratio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("ratio", v),
            label: "Ratio",
            size: "sm",
            color: "#10b981",
            formatValue: (v) => `${v.toFixed(1)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 124,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            size: "sm",
            color: "#10b981",
            formatValue: (v) => `${Math.round(v * 1e3)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 134,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            size: "sm",
            color: "#10b981",
            formatValue: (v) => `${Math.round(v * 1e3)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 144,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 113,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 111,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#34d399",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 158,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 157,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 156,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
    lineNumber: 108,
    columnNumber: 5
  }, void 0);
};
const EQ3Editor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const low = getParam(effect, "low", 0);
  const mid = getParam(effect, "mid", 0);
  const high = getParam(effect, "high", 0);
  const lowFrequency = getParam(effect, "lowFrequency", 400);
  const highFrequency = getParam(effect, "highFrequency", 2500);
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#3b82f6" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 191,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#3b82f6", title: "3-Band EQ" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 193,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: low,
            min: -20,
            max: 20,
            onChange: (v) => onUpdateParameter("low", v),
            label: "Low",
            color: "#ef4444",
            bipolar: true,
            formatValue: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 195,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: mid,
            min: -20,
            max: 20,
            onChange: (v) => onUpdateParameter("mid", v),
            label: "Mid",
            color: "#eab308",
            bipolar: true,
            formatValue: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 205,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: high,
            min: -20,
            max: 20,
            onChange: (v) => onUpdateParameter("high", v),
            label: "High",
            color: "#3b82f6",
            bipolar: true,
            formatValue: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 215,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 194,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 192,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#6b7280", title: "Crossover" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 228,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowFrequency,
            min: 20,
            max: 1e3,
            onChange: (v) => onUpdateParameter("lowFrequency", v),
            label: "Low Freq",
            size: "sm",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 230,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highFrequency,
            min: 1e3,
            max: 1e4,
            onChange: (v) => onUpdateParameter("highFrequency", v),
            label: "High Freq",
            size: "sm",
            color: "#6b7280",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}kHz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 240,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            size: "sm",
            color: "#9ca3af",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 250,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 229,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 227,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
    lineNumber: 190,
    columnNumber: 5
  }, void 0);
};
const FilterEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  var _a, _b;
  const frequency = getParam(effect, "frequency", 350);
  const Q = getParam(effect, "Q", 1);
  const gain = getParam(effect, "gain", 0);
  const type = ((_a = effect.parameters) == null ? void 0 : _a.type) || "lowpass";
  const rolloff = Number(((_b = effect.parameters) == null ? void 0 : _b.rolloff) ?? -12);
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  const FILTER_TYPES = ["lowpass", "highpass", "bandpass", "notch", "allpass", "peaking", "lowshelf", "highshelf"];
  const TYPE_SHORT = { lowpass: "LP", highpass: "HP", bandpass: "BP", notch: "Notch", allpass: "AP", peaking: "Peak", lowshelf: "LoS", highshelf: "HiS" };
  const ROLLOFFS = [-12, -24, -48, -96];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#f97316" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 288,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#f97316", title: "Filter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 290,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-1.5 mb-3", children: FILTER_TYPES.map((t) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("type", t),
          className: `px-2 py-1.5 rounded-lg text-xs font-bold border transition-all ${type === t ? "bg-orange-700/70 border-orange-500 text-orange-100" : "bg-black/40 border-dark-border text-text-muted hover:border-orange-700"}`,
          children: TYPE_SHORT[t] || t
        },
        t,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
          lineNumber: 293,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 291,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-2 mb-4", children: ROLLOFFS.map((r) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("rolloff", r),
          className: `px-3 py-1 rounded-lg text-xs font-bold border transition-all ${rolloff === r ? "bg-orange-700/70 border-orange-500 text-orange-100" : "bg-black/40 border-dark-border text-text-muted hover:border-orange-700"}`,
          children: [
            r,
            "dB"
          ]
        },
        r,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
          lineNumber: 301,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 299,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: 20,
            max: 2e4,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Frequency",
            color: "#f97316",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}kHz` : `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 308,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: Q,
            min: 1e-3,
            max: 100,
            onChange: (v) => onUpdateParameter("Q", v),
            label: "Q",
            color: "#f97316",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 317,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: gain,
            min: -40,
            max: 40,
            onChange: (v) => onUpdateParameter("gain", v),
            label: "Gain",
            color: "#f97316",
            bipolar: true,
            formatValue: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 326,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 307,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 289,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#fb923c",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 340,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 339,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 338,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
    lineNumber: 287,
    columnNumber: 5
  }, void 0);
};
const DubFilterEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const cutoff = getParam(effect, "cutoff", 20);
  const resonance = getParam(effect, "resonance", 10);
  const gain = getParam(effect, "gain", 1);
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#22c55e" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 371,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#22c55e", title: "Dub Filter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 373,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: cutoff,
            min: 20,
            max: 1e4,
            onChange: (v) => onUpdateParameter("cutoff", v),
            label: "Cutoff",
            color: "#22c55e",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 375,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: resonance,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("resonance", v),
            label: "Resonance",
            color: "#22c55e",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 384,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: gain,
            min: 0.5,
            max: 2,
            onChange: (v) => onUpdateParameter("gain", v),
            label: "Drive",
            color: "#22c55e",
            formatValue: (v) => `${v.toFixed(2)}x`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 393,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 374,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 372,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#4ade80",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 406,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 405,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 404,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
    lineNumber: 370,
    columnNumber: 5
  }, void 0);
};
const SidechainCompressorEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const threshold = getParam(effect, "threshold", -24);
  const ratio = getParam(effect, "ratio", 4);
  const attack = getParam(effect, "attack", 3e-3);
  const release = getParam(effect, "release", 0.25);
  const knee = getParam(effect, "knee", 6);
  const sidechainGain = getParam(effect, "sidechainGain", 100);
  const sidechainSource = getParam(effect, "sidechainSource", -1);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const channelCount = useTrackerStore((s) => {
    var _a;
    return ((_a = s.patterns[0]) == null ? void 0 : _a.channels.length) ?? 8;
  });
  const channelNames = useTrackerStore(useShallow(
    (s) => {
      var _a;
      return ((_a = s.patterns[0]) == null ? void 0 : _a.channels.map((ch, i) => ch.name || `CH ${i + 1}`)) ?? [];
    }
  ));
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#10b981" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 446,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GainReductionMeter, { pre, post }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 447,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#10b981", title: "Compressor" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 449,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: threshold,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Threshold",
            color: "#10b981",
            formatValue: (v) => `${Math.round(v)}dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 451,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ratio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("ratio", v),
            label: "Ratio",
            color: "#10b981",
            formatValue: (v) => `${v.toFixed(1)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 460,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: knee,
            min: 0,
            max: 40,
            onChange: (v) => onUpdateParameter("knee", v),
            label: "Knee",
            color: "#10b981",
            formatValue: (v) => `${Math.round(v)}dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 469,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 450,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 448,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#34d399", title: "Envelope & Sidechain" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 481,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1.5", children: "Sidechain Source" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
          lineNumber: 483,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(Math.round(sidechainSource)),
            onChange: (v) => onUpdateParameter("sidechainSource", Number(v)),
            options: [
              { value: "-1", label: "Self (Internal)" },
              ...Array.from({ length: channelCount }, (_, i) => ({
                value: String(i),
                label: channelNames[i] || `CH ${i + 1}`
              }))
            ],
            className: "w-full bg-black/60 border border-dark-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:border-emerald-500 focus:outline-none"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 484,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 482,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: 1e-3,
            max: 0.5,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            color: "#34d399",
            formatValue: (v) => v >= 0.1 ? `${(v * 1e3).toFixed(0)}ms` : `${(v * 1e3).toFixed(1)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 498,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 0.01,
            max: 1,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#34d399",
            formatValue: (v) => `${(v * 1e3).toFixed(0)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 507,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: sidechainGain,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("sidechainGain", v),
            label: "SC Gain",
            color: "#34d399",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 516,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 497,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 480,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6ee7b7",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 529,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 528,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 527,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
    lineNumber: 445,
    columnNumber: 5
  }, void 0);
};
const MOOG_MODEL_NAMES = ["Hyperion", "Krajeski", "Stilson", "Microtracker", "Improved", "Oberheim"];
const MOOG_MODE_NAMES = ["LP2", "LP4", "BP2", "BP4", "HP2", "HP4", "Notch"];
const MoogFilterEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const cutoff = getParam(effect, "cutoff", 1e3);
  const resonance = getParam(effect, "resonance", 10);
  const drive = getParam(effect, "drive", 1);
  const model = getParam(effect, "model", 0);
  const filterMode = getParam(effect, "filterMode", 1);
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#f59e0b" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 565,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#f59e0b", title: "Model" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 568,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-1 mb-3", children: MOOG_MODEL_NAMES.map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("model", i),
          className: `px-2 py-1.5 text-xs font-medium rounded transition-colors ${Math.round(model) === i ? "bg-amber-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
          children: name
        },
        i,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
          lineNumber: 571,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 569,
        columnNumber: 9
      }, void 0),
      Math.round(model) === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#f59e0b", title: "Filter Mode (Hyperion)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
          lineNumber: 586,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-1", children: MOOG_MODE_NAMES.map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onUpdateParameter("filterMode", i),
            className: `px-2 py-1.5 text-xs font-medium rounded transition-colors ${Math.round(filterMode) === i ? "bg-amber-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: name
          },
          i,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 589,
            columnNumber: 17
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
          lineNumber: 587,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 585,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 567,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#f59e0b", title: "Filter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 607,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: cutoff,
            min: 20,
            max: 2e4,
            onChange: (v) => onUpdateParameter("cutoff", v),
            label: "Cutoff",
            color: "#f59e0b",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 609,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: resonance,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("resonance", v),
            label: "Resonance",
            color: "#f59e0b",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 618,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: drive,
            min: 0.1,
            max: 4,
            onChange: (v) => onUpdateParameter("drive", v),
            label: "Drive",
            color: "#f59e0b",
            formatValue: (v) => `${v.toFixed(1)}x`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
            lineNumber: 627,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 608,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 606,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#fbbf24",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
        lineNumber: 641,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 640,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
      lineNumber: 639,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/FilterEffectEditors.tsx",
    lineNumber: 564,
    columnNumber: 5
  }, void 0);
};
const BiPhaseEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const routing = getParam(effect, "routing", 0);
  const rateA = getParam(effect, "rateA", 0.5);
  const depthA = getParam(effect, "depthA", 0.6);
  const rateB = getParam(effect, "rateB", 4);
  const depthB = getParam(effect, "depthB", 0.4);
  const feedback = getParam(effect, "feedback", 0.3);
  const synced = isEffectBpmSynced(effect.parameters);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#a855f7" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 35,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a855f7", title: "Routing" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 37,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 justify-center mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onUpdateParameter("routing", 0),
            className: `px-4 py-1.5 text-xs font-medium rounded transition-colors ${Math.round(routing) === 0 ? "bg-purple-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: "Parallel"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 39,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onUpdateParameter("routing", 1),
            className: `px-4 py-1.5 text-xs font-medium rounded transition-colors ${Math.round(routing) === 1 ? "bg-purple-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: "Series"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 49,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 38,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 36,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a855f7", title: "Phase A" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 62,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: synced ? "opacity-40 pointer-events-none" : "", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: rateA,
            min: 0.1,
            max: 10,
            onChange: (v) => onUpdateParameter("rateA", v),
            label: "Rate A",
            color: "#a855f7",
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 65,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 64,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: depthA,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("depthA", v),
            label: "Depth A",
            color: "#a855f7",
            formatValue: (v) => `${(v * 100).toFixed(0)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 75,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 63,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 61,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#c084fc", title: "Phase B" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 88,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: rateB,
            min: 0.1,
            max: 10,
            onChange: (v) => onUpdateParameter("rateB", v),
            label: "Rate B",
            color: "#c084fc",
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 90,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: depthB,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("depthB", v),
            label: "Depth B",
            color: "#c084fc",
            formatValue: (v) => `${(v * 100).toFixed(0)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 99,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 89,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 87,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: feedback,
          min: 0,
          max: 0.95,
          onChange: (v) => onUpdateParameter("feedback", v),
          label: "Feedback",
          color: "#a855f7",
          formatValue: (v) => `${(v * 100).toFixed(0)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 112,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#d8b4fe",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 121,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 111,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 110,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
    lineNumber: 34,
    columnNumber: 5
  }, void 0);
};
const TapeSaturationEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const drive = getParam(effect, "drive", 50);
  const tone = getParam(effect, "tone", 12e3);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#ef4444" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 151,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WaveshaperCurve, { type: "TapeSaturation", drive: drive / 100, color: "#ef4444", height: 100 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 152,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ef4444", title: "Tape Saturation" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 154,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: drive,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("drive", v),
            label: "Drive",
            color: "#ef4444",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 156,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: tone,
            min: 2e3,
            max: 2e4,
            onChange: (v) => onUpdateParameter("tone", v),
            label: "Tone",
            color: "#ef4444",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 165,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 155,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 153,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#f87171",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 178,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 177,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 176,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
    lineNumber: 150,
    columnNumber: 5
  }, void 0);
};
const VINYL_RPM_PRESETS = [
  { label: "33", rpm: 33, speed: 5.5 },
  { label: "45", rpm: 45, speed: 7.5 },
  { label: "78", rpm: 78, speed: 13 }
];
const VINYL_CONDITION_PRESETS = [
  { label: "New", hiss: 28, dust: 22, age: 18, riaa: 35, stylusResonance: 30, wornStylus: 0, pinch: 15, innerGroove: 5, ghostEcho: 5, dropout: 0, warp: 0, eccentricity: 8 },
  { label: "Played", hiss: 50, dust: 58, age: 45, riaa: 52, stylusResonance: 50, wornStylus: 28, pinch: 35, innerGroove: 25, ghostEcho: 20, dropout: 10, warp: 10, eccentricity: 18 },
  { label: "Worn", hiss: 70, dust: 78, age: 66, riaa: 68, stylusResonance: 65, wornStylus: 62, pinch: 52, innerGroove: 55, ghostEcho: 40, dropout: 35, warp: 28, eccentricity: 32 },
  { label: "Shellac", hiss: 86, dust: 86, age: 86, riaa: 84, stylusResonance: 80, wornStylus: 84, pinch: 72, innerGroove: 76, ghostEcho: 58, dropout: 62, warp: 46, eccentricity: 52 }
];
const VinylNoiseEditor = ({
  effect,
  onUpdateParameter,
  onUpdateParameters,
  onUpdateWet
}) => {
  var _a, _b;
  reactExports.useEffect(() => {
    const node = getToneEngine().getMasterEffectNode(effect.id);
    if (node && "setEditorOpen" in node) node.setEditorOpen(true);
    return () => {
      const n = getToneEngine().getMasterEffectNode(effect.id);
      if (n && "setEditorOpen" in n) n.setEditorOpen(false);
    };
  }, [effect.id]);
  const hiss = getParam(effect, "hiss", 50);
  const dust = getParam(effect, "dust", 50);
  const age = getParam(effect, "age", 50);
  const speed = getParam(effect, "speed", 0);
  const riaa = getParam(effect, "riaa", 30);
  const stylusResonance = getParam(effect, "stylusResonance", 25);
  const wornStylus = getParam(effect, "wornStylus", 0);
  const pinch = getParam(effect, "pinch", 15);
  const innerGroove = getParam(effect, "innerGroove", 0);
  const ghostEcho = getParam(effect, "ghostEcho", 0);
  const dropout = getParam(effect, "dropout", 0);
  const warp = getParam(effect, "warp", 0);
  const eccentricity = getParam(effect, "eccentricity", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const activeRpm = ((_a = VINYL_RPM_PRESETS.find(
    (p) => Math.abs(speed - p.speed) < 0.5
  )) == null ? void 0 : _a.rpm) ?? null;
  const activeCond = ((_b = VINYL_CONDITION_PRESETS.find(
    (p) => p.hiss === Math.round(hiss) && p.dust === Math.round(dust) && p.age === Math.round(age) && p.riaa === Math.round(riaa)
  )) == null ? void 0 : _b.label) ?? null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#d97706" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 256,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#d97706", title: "Noise" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 259,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted self-center w-16 shrink-0", children: "RPM" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 263,
          columnNumber: 11
        }, void 0),
        VINYL_RPM_PRESETS.map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onUpdateParameter("speed", p.speed),
            className: [
              "flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all",
              activeRpm === p.rpm ? "bg-amber-700/70 border-amber-500 text-amber-100" : "bg-black/40 border-dark-border text-text-muted hover:border-amber-700 hover:text-amber-300"
            ].join(" "),
            children: p.label
          },
          p.rpm,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 265,
            columnNumber: 13
          },
          void 0
        ))
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 262,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted self-center w-16 shrink-0", children: "Condition" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 282,
          columnNumber: 11
        }, void 0),
        VINYL_CONDITION_PRESETS.map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              const allParams = {
                hiss: p.hiss,
                dust: p.dust,
                age: p.age,
                riaa: p.riaa,
                stylusResonance: p.stylusResonance,
                wornStylus: p.wornStylus,
                pinch: p.pinch,
                innerGroove: p.innerGroove,
                ghostEcho: p.ghostEcho,
                dropout: p.dropout,
                warp: p.warp,
                eccentricity: p.eccentricity
              };
              if (onUpdateParameters) {
                onUpdateParameters(allParams);
              } else {
                Object.entries(allParams).forEach(([key, value]) => onUpdateParameter(key, value));
              }
            },
            className: [
              "flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all",
              activeCond === p.label ? "bg-amber-700/70 border-amber-500 text-amber-100" : "bg-black/40 border-dark-border text-text-muted hover:border-amber-700 hover:text-amber-300"
            ].join(" "),
            children: p.label
          },
          p.label,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 284,
            columnNumber: 13
          },
          void 0
        ))
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 281,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 rounded-lg bg-black/20 border border-amber-900/30 p-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-amber-600/80 mb-2 text-center tracking-widest uppercase", children: "Hiss" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 323,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: hiss,
              min: 0,
              max: 100,
              onChange: (v) => onUpdateParameter("hiss", v),
              label: "Volume",
              color: "#d97706",
              formatValue: (v) => `${Math.round(v)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
              lineNumber: 325,
              columnNumber: 15
            },
            void 0
          ) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 324,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 322,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 rounded-lg bg-black/20 border border-amber-900/30 p-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-amber-600/80 mb-2 text-center tracking-widest uppercase", children: "Crackle" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 339,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                value: dust,
                min: 0,
                max: 100,
                onChange: (v) => onUpdateParameter("dust", v),
                label: "Volume",
                color: "#d97706",
                formatValue: (v) => `${Math.round(v)}%`
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
                lineNumber: 341,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                value: age,
                min: 0,
                max: 100,
                onChange: (v) => onUpdateParameter("age", v),
                label: "Warmth",
                color: "#b45309",
                formatValue: (v) => `${Math.round(v)}%`
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
                lineNumber: 350,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 340,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 338,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 320,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center pt-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: speed,
          min: 0,
          max: 100,
          onChange: (v) => onUpdateParameter("speed", v),
          label: "Flutter",
          color: "#92400e",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 365,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 364,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 258,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ca8a04", title: "Tone" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 379,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: riaa,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("riaa", v),
            label: "RIAA",
            color: "#d97706",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 381,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: stylusResonance,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("stylusResonance", v),
            label: "Resonance",
            color: "#d97706",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 390,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: wornStylus,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("wornStylus", v),
            label: "Worn",
            color: "#b45309",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 399,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 380,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 378,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#b45309", title: "Distortion" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 413,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: pinch,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("pinch", v),
            label: "Pinch",
            color: "#b45309",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 415,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: innerGroove,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("innerGroove", v),
            label: "Inner",
            color: "#92400e",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 424,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 414,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 412,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#78350f", title: "Time / Space" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 438,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ghostEcho,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("ghostEcho", v),
            label: "Echo",
            color: "#d97706",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 440,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: dropout,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("dropout", v),
            label: "Dropout",
            color: "#d97706",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 449,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: warp,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("warp", v),
            label: "Warp",
            color: "#b45309",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 458,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: eccentricity,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("eccentricity", v),
            label: "Eccent.",
            color: "#92400e",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 467,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 439,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 437,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#d97706", title: "Output" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 481,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#d97706",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 483,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 482,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 480,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
    lineNumber: 255,
    columnNumber: 5
  }, void 0);
};
const MVerbEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const damping = getParam(effect, "damping", 0.5);
  const density = getParam(effect, "density", 0.5);
  const bandwidth = getParam(effect, "bandwidth", 0.5);
  const decay = getParam(effect, "decay", 0.7);
  const predelay = getParam(effect, "predelay", 0);
  const size = getParam(effect, "size", 0.8);
  const gain = getParam(effect, "gain", 1);
  const mix = getParam(effect, "mix", 0.4);
  const earlyMix = getParam(effect, "earlyMix", 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#7c3aed" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 520,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c3aed", title: "Reverb" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 522,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: decay, min: 0, max: 1, onChange: (v) => onUpdateParameter("decay", v), label: "Decay", color: "#7c3aed", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 524,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: size, min: 0, max: 1, onChange: (v) => onUpdateParameter("size", v), label: "Size", color: "#7c3aed", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 525,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: damping, min: 0, max: 1, onChange: (v) => onUpdateParameter("damping", v), label: "Damp", color: "#8b5cf6", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 526,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: density, min: 0, max: 1, onChange: (v) => onUpdateParameter("density", v), label: "Density", color: "#8b5cf6", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 527,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 523,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 521,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a78bfa", title: "Character" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 531,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: bandwidth, min: 0, max: 1, onChange: (v) => onUpdateParameter("bandwidth", v), label: "Bandwidth", color: "#a78bfa", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 533,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: predelay, min: 0, max: 1, onChange: (v) => onUpdateParameter("predelay", v), label: "Pre-Delay", color: "#a78bfa", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 534,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: earlyMix, min: 0, max: 1, onChange: (v) => onUpdateParameter("earlyMix", v), label: "Early Mix", color: "#a78bfa", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 535,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 532,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 530,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: gain, min: 0, max: 1, onChange: (v) => onUpdateParameter("gain", v), label: "Gain", color: "#c4b5fd", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 540,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: mix, min: 0, max: 1, onChange: (v) => onUpdateParameter("mix", v), label: "Int. Mix", color: "#c4b5fd", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 541,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: effect.wet, min: 0, max: 100, onChange: onUpdateWet, label: "Wet", color: "#ddd6fe", formatValue: (v) => `${Math.round(v)}%` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 542,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 539,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 538,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
    lineNumber: 519,
    columnNumber: 5
  }, void 0);
};
const SPEED_LABELS = ["Slow", "Brake", "Fast"];
const LeslieEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const speed = getParam(effect, "speed", 0);
  const hornRate = getParam(effect, "hornRate", 6.8);
  const drumRate = getParam(effect, "drumRate", 5.9);
  const hornDepth = getParam(effect, "hornDepth", 0.7);
  const drumDepth = getParam(effect, "drumDepth", 0.5);
  const doppler = getParam(effect, "doppler", 0.5);
  const width = getParam(effect, "width", 0.8);
  const acceleration = getParam(effect, "acceleration", 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const speedIdx = speed < 0.25 ? 0 : speed > 0.75 ? 2 : 1;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#f97316" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 574,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#f97316", title: "Speed" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 576,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-1 mb-3", children: SPEED_LABELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("speed", i === 0 ? 0 : i === 1 ? 0.5 : 1),
          className: `px-2 py-1.5 text-xs font-medium rounded transition-colors ${speedIdx === i ? "bg-orange-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
          children: label
        },
        i,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 579,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 577,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: acceleration, min: 0, max: 1, onChange: (v) => onUpdateParameter("acceleration", v), label: "Accel", color: "#f97316", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 593,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 592,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 575,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#fb923c", title: "Rotors" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 597,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: hornRate, min: 0.1, max: 10, onChange: (v) => onUpdateParameter("hornRate", v), label: "Horn Hz", color: "#fb923c", formatValue: (v) => `${v.toFixed(1)}` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 599,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: hornDepth, min: 0, max: 1, onChange: (v) => onUpdateParameter("hornDepth", v), label: "Horn Dep", color: "#fb923c", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 600,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: drumRate, min: 0.1, max: 8, onChange: (v) => onUpdateParameter("drumRate", v), label: "Drum Hz", color: "#fdba74", formatValue: (v) => `${v.toFixed(1)}` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 601,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: drumDepth, min: 0, max: 1, onChange: (v) => onUpdateParameter("drumDepth", v), label: "Drum Dep", color: "#fdba74", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 602,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 598,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 596,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: doppler, min: 0, max: 1, onChange: (v) => onUpdateParameter("doppler", v), label: "Doppler", color: "#fed7aa", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 607,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: width, min: 0, max: 1, onChange: (v) => onUpdateParameter("width", v), label: "Width", color: "#fed7aa", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 608,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: effect.wet, min: 0, max: 100, onChange: onUpdateWet, label: "Wet", color: "#fef3c7", formatValue: (v) => `${Math.round(v)}%` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 609,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 606,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 605,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
    lineNumber: 573,
    columnNumber: 5
  }, void 0);
};
const SpringReverbEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const decay = getParam(effect, "decay", 0.6);
  const damping = getParam(effect, "damping", 0.4);
  const tension = getParam(effect, "tension", 0.5);
  const springMix = getParam(effect, "mix", 0.35);
  const drip = getParam(effect, "drip", 0.5);
  const diffusion = getParam(effect, "diffusion", 0.7);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center space-y-4 w-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#059669" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 635,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#059669", title: "Spring Tank" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 637,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-8 items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: decay, min: 0, max: 1, onChange: (v) => onUpdateParameter("decay", v), label: "Decay", color: "#059669", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 639,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: damping, min: 0, max: 1, onChange: (v) => onUpdateParameter("damping", v), label: "Damp", color: "#059669", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 640,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: tension, min: 0, max: 1, onChange: (v) => onUpdateParameter("tension", v), label: "Tension", color: "#10b981", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 641,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 638,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 636,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#34d399", title: "Character" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 645,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-8 items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: drip, min: 0, max: 1, onChange: (v) => onUpdateParameter("drip", v), label: "Drip", color: "#34d399", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 647,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: diffusion, min: 0, max: 1, onChange: (v) => onUpdateParameter("diffusion", v), label: "Diffusion", color: "#34d399", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
          lineNumber: 648,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 646,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 644,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-8 items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: springMix, min: 0, max: 1, onChange: (v) => onUpdateParameter("mix", v), label: "Int. Mix", color: "#6ee7b7", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 653,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: effect.wet, min: 0, max: 100, onChange: onUpdateWet, label: "Wet", color: "#a7f3d0", formatValue: (v) => `${Math.round(v)}%` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
        lineNumber: 654,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 652,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 651,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
    lineNumber: 634,
    columnNumber: 5
  }, void 0);
};
const FilmstripKnob = React.memo(({
  src,
  frameCount,
  frameW,
  frameH,
  value,
  onChange,
  defaultValue = 0.5,
  style
}) => {
  const frame = Math.round(value * (frameCount - 1));
  const bgY = -(frame * frameH);
  const startRef = reactExports.useRef(null);
  const onChangeRef = reactExports.useRef(onChange);
  const valueRef = reactExports.useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;
  const onPointerDown = reactExports.useCallback((e) => {
    e.preventDefault();
    startRef.current = { startY: e.clientY, startValue: valueRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = reactExports.useCallback((e) => {
    if (!startRef.current) return;
    const delta = startRef.current.startY - e.clientY;
    const newVal = Math.max(0, Math.min(1, startRef.current.startValue + delta / 150));
    onChangeRef.current(newVal);
  }, []);
  const onPointerUp = reactExports.useCallback(() => {
    startRef.current = null;
  }, []);
  const onDblClick = reactExports.useCallback(() => {
    onChangeRef.current(defaultValue);
  }, [defaultValue]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onDoubleClick: onDblClick,
      style: {
        width: frameW,
        height: frameH,
        backgroundImage: `url(${src})`,
        backgroundSize: `${frameW}px auto`,
        backgroundPositionY: `${bgY}px`,
        backgroundRepeat: "no-repeat",
        cursor: "ns-resize",
        userSelect: "none",
        position: "absolute",
        ...style
      }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 710,
      columnNumber: 5
    },
    void 0
  );
});
const KissOfShameEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const [reelFrame, setReelFrame] = reactExports.useState(0);
  const { post } = useEffectAnalyser(effect.id, "waveform");
  const toVuFrame = (rms) => Math.min(64, Math.round(Math.pow(Math.min(rms * 3, 1), 0.6) * 64));
  let vuLFrame = 0, vuRFrame = 0;
  if (post && post.length > 0) {
    const half = post.length >> 1;
    let sumL = 0, sumR = 0;
    for (let i = 0; i < half; i++) {
      sumL += post[i] * post[i];
    }
    for (let i = half; i < post.length; i++) {
      sumR += post[i] * post[i];
    }
    vuLFrame = toVuFrame(Math.sqrt(sumL / half));
    vuRFrame = toVuFrame(Math.sqrt(sumR / (post.length - half)));
  }
  const containerH = 703;
  const yOff = 0;
  reactExports.useEffect(() => {
    const id = setInterval(() => setReelFrame((f) => (f + 1) % 31), 50);
    return () => clearInterval(id);
  }, []);
  const drive = getParam(effect, "drive", 30) / 100;
  const character = getParam(effect, "character", 40) / 100;
  const bias = getParam(effect, "bias", 40) / 100;
  const shame = getParam(effect, "shame", 20) / 100;
  const hiss = getParam(effect, "hiss", 20) / 100;
  const speed = getParam(effect, "speed", 0);
  const printThrough = getParam(effect, "printThrough", 0) === 1;
  const wet = effect.wet / 100;
  const bypassed = !effect.enabled;
  const updateMasterEffect = useAudioStore((s) => s.updateMasterEffect);
  const toggleBypass = reactExports.useCallback(() => {
    updateMasterEffect(effect.id, { enabled: !effect.enabled });
  }, [effect.id, effect.enabled, updateMasterEffect]);
  const BASE = "/kissofshame/ui/";
  const reelBgY = -(reelFrame * 322);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: 600, maxWidth: "100%", height: Math.ceil(containerH * 0.625), overflow: "hidden", margin: "0 auto" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      style: {
        position: "relative",
        width: 960,
        height: containerH,
        overflow: "hidden",
        userSelect: "none",
        cursor: "default",
        transform: "scale(0.625)",
        transformOrigin: "top left"
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "img",
          {
            src: BASE + "FaceWithReels.png",
            style: { position: "absolute", top: 0, left: 0, width: 960, height: containerH, pointerEvents: "none" },
            alt: ""
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 796,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            style: {
              position: "absolute",
              left: 0,
              top: 0,
              width: 960,
              height: 322,
              backgroundImage: `url(${BASE}Wheels.png)`,
              backgroundSize: "960px auto",
              backgroundPositionY: `${reelBgY}px`,
              backgroundRepeat: "no-repeat",
              pointerEvents: "none"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 803,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FilmstripKnob,
          {
            src: BASE + "InputKnob.png",
            frameCount: 65,
            frameW: 116,
            frameH: 116,
            value: drive,
            onChange: (v) => onUpdateParameter("drive", Math.round(v * 100)),
            defaultValue: 0.3,
            style: { left: 104, top: 521 + yOff }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 819,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            style: {
              position: "absolute",
              left: 401,
              top: 491 + yOff,
              width: 174,
              height: 163,
              backgroundImage: `url(${BASE}ShameKnob.png)`,
              backgroundSize: "174px auto",
              backgroundPositionY: `${-(Math.round(shame * 64) * 163)}px`,
              backgroundRepeat: "no-repeat",
              pointerEvents: "none"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 829,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FilmstripKnob,
          {
            src: BASE + "ShameCross.png",
            frameCount: 65,
            frameW: 174,
            frameH: 163,
            value: shame,
            onChange: (v) => onUpdateParameter("shame", Math.round(v * 100)),
            defaultValue: 0.2,
            style: { left: 401, top: 491 + yOff }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 845,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FilmstripKnob,
          {
            src: BASE + "AgeKnob.png",
            frameCount: 65,
            frameW: 74,
            frameH: 72,
            value: bias,
            onChange: (v) => onUpdateParameter("bias", Math.round(v * 100)),
            defaultValue: 0.4,
            style: { left: 350, top: 455 + yOff }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 855,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FilmstripKnob,
          {
            src: BASE + "HissKnob.png",
            frameCount: 65,
            frameW: 78,
            frameH: 72,
            value: hiss,
            onChange: (v) => onUpdateParameter("hiss", Math.round(v * 100)),
            defaultValue: 0.2,
            style: { left: 547, top: 455 + yOff }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 865,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FilmstripKnob,
          {
            src: BASE + "BlendKnob.png",
            frameCount: 65,
            frameW: 78,
            frameH: 72,
            value: wet,
            onChange: (v) => onUpdateWet(Math.round(v * 100)),
            defaultValue: 0.5,
            style: { left: 705, top: 455 + yOff }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 875,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FilmstripKnob,
          {
            src: BASE + "OutputKnob.png",
            frameCount: 65,
            frameW: 122,
            frameH: 116,
            value: character,
            onChange: (v) => onUpdateParameter("character", Math.round(v * 100)),
            defaultValue: 0.4,
            style: { left: 757, top: 521 + yOff }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 885,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            style: {
              position: "absolute",
              left: 251,
              top: 518 + yOff,
              width: 108,
              height: 108,
              backgroundImage: `url(${BASE}VUMeterL.png)`,
              backgroundSize: "108px auto",
              backgroundPositionY: `${-(vuLFrame * 108)}px`,
              backgroundRepeat: "no-repeat",
              pointerEvents: "none",
              filter: "brightness(1.4) contrast(1.2) sepia(0.6) saturate(2.5) hue-rotate(-15deg)"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 895,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            style: {
              position: "absolute",
              left: 605,
              top: 518 + yOff,
              width: 110,
              height: 108,
              backgroundImage: `url(${BASE}VUMeterR.png)`,
              backgroundSize: "110px auto",
              backgroundPositionY: `${-(vuRFrame * 108)}px`,
              backgroundRepeat: "no-repeat",
              pointerEvents: "none",
              filter: "brightness(1.4) contrast(1.2) sepia(0.6) saturate(2.5) hue-rotate(-15deg)"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 912,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            onClick: () => onUpdateParameter("speed", speed === 0 ? 1 : 0),
            style: {
              position: "absolute",
              left: 233,
              top: 610 + yOff,
              width: 42,
              height: 39,
              backgroundImage: `url(${BASE}TapeType.png)`,
              backgroundSize: "42px auto",
              backgroundPositionY: speed === 1 ? "-39px" : "0px",
              backgroundRepeat: "no-repeat",
              cursor: "pointer"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 929,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            onClick: toggleBypass,
            style: {
              position: "absolute",
              left: 202,
              top: 469 + yOff,
              width: 34,
              height: 34,
              backgroundImage: `url(${BASE}Bypass.png)`,
              backgroundSize: "34px auto",
              backgroundPositionY: bypassed ? `${-34 * 2}px` : "0px",
              backgroundRepeat: "no-repeat",
              cursor: "pointer"
            },
            title: bypassed ? "Activate" : "Bypass"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 946,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            onClick: () => onUpdateParameter("printThrough", printThrough ? 0 : 1),
            style: {
              position: "absolute",
              left: 698,
              top: 609 + yOff,
              width: 47,
              height: 41,
              backgroundImage: `url(${BASE}PrintThrough.png)`,
              backgroundSize: "47px auto",
              backgroundPositionY: printThrough ? "-41px" : "0px",
              backgroundRepeat: "no-repeat",
              cursor: "pointer"
            },
            title: printThrough ? "Print Through: On" : "Print Through: Off"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
            lineNumber: 964,
            columnNumber: 7
          },
          void 0
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
      lineNumber: 783,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VintageEffectEditors.tsx",
    lineNumber: 782,
    columnNumber: 5
  }, void 0);
};
const VERTEX_SHADER_ES3 = (
  /* glsl */
  `#version 300 es
in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`
);
const FRAGMENT_SHADER_ES3 = (
  /* glsl */
  `#version 300 es
precision highp float;
precision highp int;

#define PI 3.14159
#define NSPRINGS 4
#define N NSPRINGS
#define SHOWSPRINGS 3
#define RMS_BUFFER_SIZE 64
#define NITER 80
#define BACKGROUND_COLOR vec3(0.8235294117647058, 0.8392156862745098, 0.8470588235294118)

uniform float u_rms[RMS_BUFFER_SIZE * NSPRINGS];
uniform int   u_rmspos;
uniform float u_coils;
uniform float u_radius;
uniform float u_shape;
uniform int   u_aasubpixels;
uniform float u_time;
uniform vec2  u_resolution;

out vec4 fragColor;

const float springSize     = 0.3;
const float springRadius   = 0.38 * springSize;
const float springCoilsMin = 35.0;
const float springCoilsMax = 60.0;
const float coilRadiusMin  = 0.007;
const float coilRadiusMax  = 0.014;

float springCoils;
float coilRadius;

float roundedBox(vec2 p, vec2 size, float cornerSize) {
    vec2 q    = abs(p) - size + cornerSize;
    float sdf = min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - cornerSize;
    return sdf;
}

float getRMS(float x, int springId) {
    float lgth  = 0.6;
    float xpos  = lgth * float(RMS_BUFFER_SIZE) * (x + 1.0) / 2.0;
    int   ixpos = int(xpos);
    float fxpos = xpos - float(ixpos);
    int ixpos0  = (u_rmspos - ixpos)       & (RMS_BUFFER_SIZE - 1);
    int ixpos1  = (u_rmspos - (ixpos + 1)) & (RMS_BUFFER_SIZE - 1);
    float rms0  = u_rms[ixpos0 * N + springId];
    float rms1  = u_rms[ixpos1 * N + springId];
    float rms   = rms0 + fxpos * (rms1 - rms0);
    rms = pow(rms, 1.0 / 2.5);
    return 5.0 * rms;
}

vec3 transformSpace(vec3 p, float x) {
    p.y /= springSize;
    p.y += 0.5;
    int id = 0;
    if (p.y < 2.0 && p.y > -1.0) {
        id  = int(p.y + 1.0);
        p.y = (fract(p.y) - 0.5) * springSize;
    }

    float springMove = getRMS(x, id);

    float winoverflow = 0.85;
    float winpower    = 0.8;
    float win         = pow(cos(x * winoverflow * PI / 2.0), winpower);
    springMove *= win;

    float fid = float(id);

    p.x = p.x * springCoils - springMove + (fid - 0.394) * 24.1498;

    float transverse = springMove * 0.006;
    float rot  = 2.0 * PI * u_time * (8.12321 + 2.323 * fid) + fid * 124.32;
    float crot = cos(rot);
    float srot = sin(rot);
    p.y += crot * transverse;
    p.z += srot * transverse;

    return p;
}

float mapScene(vec3 p, float x) {
    p = transformSpace(p, x);
    float cylinder = length(p.yz) - springRadius;
    float coils    = (sin(u_shape * atan(p.y, p.z) - p.x)) / springCoils;
    float dist     = length(vec2(cylinder, coils)) - coilRadius;
    return dist;
}

vec3 getColor(vec3 p, float x) {
    p = transformSpace(p, x);
    p.yz /= springRadius;

    float theta = 0.29 * PI;
    float cth = cos(theta);
    float sth = sin(theta);
    p.yz *= mat2(cth, sth, -sth, cth);

    const vec3 baseColor = vec3(0.851, 0.92, 1.000);
    const vec3 specColor = vec3(0.648, 0.706, 0.760);

    vec3 color = baseColor * (0.25 + 0.10 * (1.0 + (length(p.yz) - 1.0) *
                                                   springRadius / coilRadius));

    p.x -= 0.66 + u_radius * 0.5;
    p.z = max(-p.z, 0.0) - sin(2.0 * (p.x + u_shape * atan(p.y, p.z))) * 0.10;
    p.z = abs(p.z);

    color += baseColor * pow(p.z * 0.25, 1.0);
    color += specColor * (pow(p.z * 0.845, 60.0));
    return color;
}

void main() {
    springCoils = springCoilsMin + u_coils * (springCoilsMax - springCoilsMin);
    coilRadius  = coilRadiusMin + u_radius * (coilRadiusMax - coilRadiusMin);

    vec3  color = vec3(0.0);
    float alpha = 0.0;

    for (int aax = 0; aax < u_aasubpixels; ++aax) {
        for (int aay = 0; aay < u_aasubpixels; ++aay) {
            vec2 aa = vec2(float(aax), float(aay)) / float(u_aasubpixels);
            vec2 st = (2.0 * (gl_FragCoord.xy + aa) - u_resolution);
            float xpos = st.x / u_resolution.x;
            st /= u_resolution.yy;

            vec3 ro = vec3(0.0, 0.0, -5.0);
            vec3 rd = normalize(vec3(st, 10.0));

            float dist = 0.0;
            for (int i = 0; i < NITER; ++i) {
                vec3 p      = ro + dist * rd;
                float delta = 0.95 * mapScene(p, xpos);
                dist += delta;
                if (delta < 0.001) {
                    p = ro + dist * rd;
                    color += getColor(p, xpos);
                    alpha += 1.0;
                    break;
                }
                if (dist > 6.0) {
                    // Background — transparent so the JUCE framebuffer
                    // underneath shows through. The shadow/shading is
                    // drawn as semi-transparent darkening instead of an
                    // opaque background fill.
                    float shade     = 0.02 + u_radius * 0.10 + u_coils * 0.14;
                    float shadeSize = 1.70;
                    float shadeY    = st.y * shadeSize;
                    shadeY += 0.86;
                    if (shadeY < 2.0 && shadeY > -1.0) {
                        shadeY = (fract(shadeY) - 0.5) / shadeSize;
                        shadeY = abs(shadeY);
                    }
                    float shadowAlpha = shade *
                        (1.0 - min(1.0, pow(shadeY * 5.9,
                                            1.5 + 0.5 * (u_coils + u_radius))));
                    alpha += shadowAlpha * 0.4;
                    break;
                }
            }
        }
    }

    float aa2 = float(u_aasubpixels) * float(u_aasubpixels);
    color /= max(1.0, aa2);
    alpha /= aa2;

    fragColor = vec4(color, alpha);
}
`
);
class AelapseSpringsRenderer {
  gl;
  program;
  quadVao;
  quadBuf;
  // Uniform locations — resolved once after link.
  uRms;
  uRmsPos;
  uCoils;
  uRadius;
  uShape;
  uAASubpixels;
  uTime;
  uResolution;
  disposed = false;
  constructor(canvas) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      // we do our own SDF-aware supersampling
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    });
    if (!gl) {
      throw new Error("AelapseSpringsRenderer: WebGL2 is not available");
    }
    this.gl = gl;
    this.program = this.buildProgram(VERTEX_SHADER_ES3, FRAGMENT_SHADER_ES3);
    const verts = new Float32Array([
      -1,
      -1,
      1,
      -1,
      -1,
      1,
      -1,
      1,
      1,
      -1,
      1,
      1
    ]);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("AelapseSpringsRenderer: createVertexArray failed");
    this.quadVao = vao;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    if (!buf) throw new Error("AelapseSpringsRenderer: createBuffer failed");
    this.quadBuf = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const aPosLoc = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.uRms = gl.getUniformLocation(this.program, "u_rms[0]");
    this.uRmsPos = gl.getUniformLocation(this.program, "u_rmspos");
    this.uCoils = gl.getUniformLocation(this.program, "u_coils");
    this.uRadius = gl.getUniformLocation(this.program, "u_radius");
    this.uShape = gl.getUniformLocation(this.program, "u_shape");
    this.uAASubpixels = gl.getUniformLocation(this.program, "u_aasubpixels");
    this.uTime = gl.getUniformLocation(this.program, "u_time");
    this.uResolution = gl.getUniformLocation(this.program, "u_resolution");
  }
  /** Render one frame with the given state. Call from a rAF loop. */
  render(state) {
    if (this.disposed) return;
    const gl = this.gl;
    const canvas = gl.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    const targetW = Math.max(1, Math.floor(cssW * dpr));
    const targetH = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.program);
    if (this.uCoils) gl.uniform1f(this.uCoils, state.coils);
    if (this.uRadius) gl.uniform1f(this.uRadius, state.radius);
    if (this.uShape) gl.uniform1f(this.uShape, state.shape);
    if (this.uTime) gl.uniform1f(this.uTime, state.time);
    if (this.uResolution) gl.uniform2f(this.uResolution, canvas.width, canvas.height);
    if (this.uRmsPos) gl.uniform1i(this.uRmsPos, state.rmsPos | 0);
    if (this.uAASubpixels) gl.uniform1i(this.uAASubpixels, state.aaSubpixels ?? 1);
    if (this.uRms) {
      if (state.rmsStack.length >= 256) {
        gl.uniform1fv(this.uRms, state.rmsStack, 0, 256);
      } else {
        const padded = new Float32Array(256);
        padded.set(state.rmsStack.subarray(0, Math.min(256, state.rmsStack.length)));
        gl.uniform1fv(this.uRms, padded);
      }
    }
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteVertexArray(this.quadVao);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteProgram(this.program);
  }
  // ─── internals ───────────────────────────────────────────────────────────
  buildProgram(vertSrc, fragSrc) {
    const gl = this.gl;
    const vert = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram();
    if (!prog) throw new Error("createProgram failed");
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) ?? "(no log)";
      gl.deleteProgram(prog);
      throw new Error("Shader link failed: " + log);
    }
    gl.detachShader(prog, vert);
    gl.detachShader(prog, frag);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return prog;
  }
  compileShader(type, src) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) throw new Error("createShader failed");
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) ?? "(no log)";
      gl.deleteShader(sh);
      throw new Error(
        `Shader compile failed (${type === gl.VERTEX_SHADER ? "vertex" : "fragment"}): ${log}`
      );
    }
    return sh;
  }
}
function blitFramebuffer(mod, heapBuffer, ctx, imgData, fbWidth, fbHeight) {
  const fbPtr = mod._aelapse_ui_get_fb();
  if (!fbPtr) return;
  const totalPixels = fbWidth * fbHeight;
  const src = new Uint8Array(heapBuffer, fbPtr, totalPixels * 4);
  const dst = imgData.data;
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];
    dst[off + 1] = src[off + 1];
    dst[off + 2] = src[off];
    dst[off + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
const AelapseHardwareUI = ({
  onUpdateParameter,
  getRMSSnapshot
}) => {
  const containerRef = reactExports.useRef(null);
  const jcanvasRef = reactExports.useRef(null);
  const overlayRef = reactExports.useRef(null);
  const moduleRef = reactExports.useRef(null);
  const springsRef = reactExports.useRef(null);
  const startTimeRef = reactExports.useRef(performance.now());
  const fallbackRMSRef = reactExports.useRef(new Float32Array(256));
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const fbWidthRef = reactExports.useRef(900);
  const fbHeightRef = reactExports.useRef(600);
  const canvasCoords = reactExports.useCallback(
    (canvas, e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      return [
        Math.floor((e.clientX - rect.left) * sx),
        Math.floor((e.clientY - rect.top) * sy)
      ];
    },
    []
  );
  const getModifiers = reactExports.useCallback((e) => {
    let mods = 0;
    if (e.shiftKey) mods |= 1;
    if (e.ctrlKey) mods |= 2;
    if (e.altKey) mods |= 4;
    if (e.metaKey) mods |= 8;
    if (e.buttons & 1) mods |= 16;
    return mods;
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups = [];
    let capturedMemory = null;
    const origInstantiate = WebAssembly.instantiate.bind(WebAssembly);
    const interceptInstantiate = async (...args) => {
      const result = await origInstantiate(...args);
      const instance = result.instance ?? result;
      if (instance && instance.exports) {
        for (const v of Object.values(instance.exports)) {
          if (v instanceof WebAssembly.Memory) {
            capturedMemory = v;
            break;
          }
        }
      }
      return result;
    };
    const init = async () => {
      try {
        const factory = await new Promise((resolve, reject) => {
          const existing = window.createAelapseUIModule;
          if (typeof existing === "function") {
            resolve(existing);
            return;
          }
          const script = document.createElement("script");
          script.src = "/aelapse/AelapseUI.js";
          script.onload = () => {
            const fn = window.createAelapseUIModule;
            if (typeof fn === "function") resolve(fn);
            else reject(new Error("createAelapseUIModule not found on window"));
          };
          script.onerror = () => reject(new Error("Failed to load AelapseUI.js"));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        WebAssembly.instantiate = interceptInstantiate;
        let m;
        try {
          m = await factory({
            onAbort: (what) => console.error("[AelapseHardwareUI] WASM abort:", what)
          });
        } finally {
          WebAssembly.instantiate = origInstantiate;
        }
        if (cancelled) {
          m._aelapse_ui_shutdown();
          return;
        }
        if (capturedMemory) m.wasmMemory = capturedMemory;
        moduleRef.current = m;
        await new Promise((r) => setTimeout(r, 30));
        if (cancelled) {
          m._aelapse_ui_shutdown();
          return;
        }
        m._aelapse_ui_init();
        const w = m._aelapse_ui_get_width();
        const h = m._aelapse_ui_get_height();
        fbWidthRef.current = w;
        fbHeightRef.current = h;
        const jcanvas = jcanvasRef.current;
        const overlay = overlayRef.current;
        if (!jcanvas || !overlay) return;
        jcanvas.width = w;
        jcanvas.height = h;
        const updateCanvasCSS = () => {
          const container = containerRef.current;
          if (!container) return;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const s = Math.min(cw / w, ch / h);
          const dw = Math.floor(w * s);
          const dh = Math.floor(h * s);
          jcanvas.style.width = `${dw}px`;
          jcanvas.style.height = `${dh}px`;
          overlay.style.width = `${dw}px`;
          overlay.style.height = `${dh}px`;
        };
        updateCanvasCSS();
        const ro = new ResizeObserver(updateCanvasCSS);
        if (containerRef.current) ro.observe(containerRef.current);
        eventCleanups.push(() => ro.disconnect());
        const ctx = jcanvas.getContext("2d");
        if (!ctx) return;
        const imgData = ctx.createImageData(w, h);
        const onMouseDown = (e) => {
          e.preventDefault();
          jcanvas.focus();
          const [cx, cy] = canvasCoords(jcanvas, e);
          m._aelapse_ui_on_mouse_down(cx, cy, getModifiers(e));
        };
        const onMouseUp = (e) => {
          const [cx, cy] = canvasCoords(jcanvas, e);
          m._aelapse_ui_on_mouse_up(cx, cy, getModifiers(e));
        };
        const onMouseMove = (e) => {
          const [cx, cy] = canvasCoords(jcanvas, e);
          m._aelapse_ui_on_mouse_move(cx, cy, getModifiers(e));
        };
        const onWheel = (e) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(jcanvas, e);
          m._aelapse_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
        };
        jcanvas.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mousemove", onMouseMove);
        jcanvas.addEventListener("wheel", onWheel, { passive: false });
        eventCleanups.push(
          () => jcanvas.removeEventListener("mousedown", onMouseDown),
          () => document.removeEventListener("mouseup", onMouseUp),
          () => document.removeEventListener("mousemove", onMouseMove),
          () => jcanvas.removeEventListener("wheel", onWheel)
        );
        window._aelapseUIParamCallback = (paramIndex, normalizedValue) => {
          if (onUpdateParameter) onUpdateParameter(paramIndex, normalizedValue);
        };
        eventCleanups.push(() => {
          delete window._aelapseUIParamCallback;
        });
        const springs = new AelapseSpringsRenderer(overlay);
        springsRef.current = springs;
        setLoaded(true);
        const renderLoop = (nowMs) => {
          var _a, _b;
          if (cancelled) return;
          rafId = requestAnimationFrame(renderLoop);
          const modRef = moduleRef.current;
          if (!modRef) return;
          modRef._aelapse_ui_tick();
          const memBuf = ((_a = modRef.wasmMemory) == null ? void 0 : _a.buffer) ?? ((_b = modRef.HEAPU8) == null ? void 0 : _b.buffer);
          if (memBuf) blitFramebuffer(modRef, memBuf, ctx, imgData, w, h);
          const sprX = modRef._aelapse_ui_get_springs_x();
          const sprY = modRef._aelapse_ui_get_springs_y();
          const sprW = modRef._aelapse_ui_get_springs_w();
          const sprH = modRef._aelapse_ui_get_springs_h();
          if (sprW > 0 && sprH > 0) {
            const cssScale = jcanvas.clientWidth / w;
            overlay.style.left = `${Math.round(sprX * cssScale)}px`;
            overlay.style.top = `${Math.round(sprY * cssScale)}px`;
            overlay.style.width = `${Math.round(sprW * cssScale)}px`;
            overlay.style.height = `${Math.round(sprH * cssScale)}px`;
          }
          const rmsSnap = (getRMSSnapshot == null ? void 0 : getRMSSnapshot()) ?? null;
          const stack = rmsSnap ? rmsSnap.stack : fallbackRMSRef.current;
          const pos = rmsSnap ? rmsSnap.pos : 0;
          const radius = modRef._aelapse_ui_get_param(15);
          const shape = modRef._aelapse_ui_get_param(17);
          const coils = modRef._aelapse_ui_get_param(20);
          springs.render({
            coils,
            radius,
            shape,
            time: (nowMs - startTimeRef.current) / 1e3,
            rmsStack: stack,
            rmsPos: pos
          });
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error("[AelapseHardwareUI] Init failed:", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    init();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());
      if (springsRef.current) {
        springsRef.current.dispose();
        springsRef.current = null;
      }
      if (moduleRef.current) {
        moduleRef.current._aelapse_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers, onUpdateParameter, getRMSSnapshot]);
  if (error) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#ff6666", fontFamily: "monospace" }, children: [
      "[AelapseHardwareUI] Error: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/hardware/AelapseHardwareUI.tsx",
      lineNumber: 376,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      style: {
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a1a",
        width: "100%",
        height: "100%",
        overflow: "hidden"
      },
      children: [
        !loaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#888", fontFamily: "monospace" }, children: "Loading Ælapse hardware UI…" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/hardware/AelapseHardwareUI.tsx",
          lineNumber: 397,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "relative" }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "canvas",
            {
              ref: jcanvasRef,
              tabIndex: 0,
              style: {
                display: loaded ? "block" : "none",
                cursor: "default",
                imageRendering: "pixelated"
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/hardware/AelapseHardwareUI.tsx",
              lineNumber: 402,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "canvas",
            {
              ref: overlayRef,
              style: {
                display: loaded ? "block" : "none",
                position: "absolute",
                top: 0,
                left: 0,
                pointerEvents: "none"
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/hardware/AelapseHardwareUI.tsx",
              lineNumber: 411,
              columnNumber: 9
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/hardware/AelapseHardwareUI.tsx",
          lineNumber: 401,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/hardware/AelapseHardwareUI.tsx",
      lineNumber: 383,
      columnNumber: 5
    },
    void 0
  );
};
const JUCE_INDEX_TO_STORE_KEY = [
  "delayActive",
  // 0  kDelayActive
  "delayDryWet",
  // 1  kDelayDrywet
  null,
  // 2  kDelayTimeType — BPM sync deferred
  "delayTime",
  // 3  kDelaySeconds
  null,
  // 4  kDelayBeats    — BPM sync deferred
  "delayFeedback",
  // 5  kDelayFeedback
  "delayCutLow",
  // 6  kDelayCutLow
  "delayCutHi",
  // 7  kDelayCutHi
  "delaySaturation",
  // 8  kDelaySaturation
  "delayDrift",
  // 9  kDelayDrift
  "delayMode",
  // 10 kDelayMode
  "springsActive",
  // 11 kSpringsActive
  "springsDryWet",
  // 12 kSpringsDryWet
  "springsWidth",
  // 13 kSpringsWidth
  "springsLength",
  // 14 kSpringsLength
  "springsDecay",
  // 15 kSpringsDecay
  "springsDamp",
  // 16 kSpringsDamp
  "springsShape",
  // 17 kSpringsShape
  "springsTone",
  // 18 kSpringsTone
  "springsScatter",
  // 19 kSpringsScatter
  "springsChaos"
  // 20 kSpringsChaos
];
const AelapseEditor = ({
  effect,
  onUpdateParameter
}) => {
  const handleParam = reactExports.useCallback(
    (juceIndex, value01) => {
      const key = JUCE_INDEX_TO_STORE_KEY[juceIndex];
      if (!key) return;
      const isBool = key === "delayActive" || key === "springsActive";
      const stored = isBool ? value01 > 0.5 ? 100 : 0 : value01 * 100;
      onUpdateParameter(key, stored);
    },
    [onUpdateParameter]
  );
  const getRMSSnapshot = reactExports.useCallback(() => {
    const engine = useAudioStore.getState().toneEngineInstance;
    const node = engine == null ? void 0 : engine.getMasterEffectNode(effect.id);
    if (node instanceof AelapseEffect) {
      return node.getRMSSnapshot();
    }
    return null;
  }, [effect.id]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center w-full", style: { minHeight: 620 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full", style: { height: 620 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    AelapseHardwareUI,
    {
      onUpdateParameter: handleParam,
      getRMSSnapshot
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AelapseEditor.tsx",
      lineNumber: 93,
      columnNumber: 9
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AelapseEditor.tsx",
    lineNumber: 92,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AelapseEditor.tsx",
    lineNumber: 91,
    columnNumber: 5
  }, void 0);
};
const RE_TAPE_ECHO_PRESETS = [
  // ═══════════════════════════════════════════════════════════════
  // KING TUBBY — The originator. Channel strip → RE-201 → mixing desk.
  // Characterized by rhythmic throws with heavy filtering.
  // ═══════════════════════════════════════════════════════════════
  {
    name: "King Tubby Throw",
    description: "Classic dub throw — rhythmic echo with heavy tape filtering",
    params: {
      mode: 3,
      // Head 1 + feedback
      repeatRate: 0.35,
      // Medium-long delay
      intensity: 0.55,
      // Moderate feedback — echoes decay naturally
      echoVolume: 0.85,
      // Echo loud in the mix
      wow: 0.15,
      // Subtle pitch wobble
      flutter: 0.1,
      // Light flutter
      dirt: 0.05,
      // Hint of grit
      inputBleed: 0,
      loopAmount: 0,
      playheadFilter: 1
      // Head EQ ON — key to the dark filtered sound
    }
  },
  {
    name: "Tubby Steppers",
    description: "Tight rhythmic delay for steppers riddims",
    params: {
      mode: 0,
      // Head 1 only — tight, precise
      repeatRate: 0.55,
      // Faster repeat — 16th note feel
      intensity: 0.45,
      // Controlled feedback
      echoVolume: 0.7,
      wow: 0.08,
      flutter: 0.05,
      dirt: 0.03,
      inputBleed: 0,
      loopAmount: 0,
      playheadFilter: 1
    }
  },
  // ═══════════════════════════════════════════════════════════════
  // LEE SCRATCH PERRY — Black Ark era. Psychedelic, washy, maximal.
  // Everything cranked, multiple echo layers, intentional chaos.
  // ═══════════════════════════════════════════════════════════════
  {
    name: "Black Ark Wash",
    description: "Perry-style psychedelic wash — dense layered echoes",
    params: {
      mode: 5,
      // Both heads + feedback — maximum density
      repeatRate: 0.3,
      // Long delay for spacious wash
      intensity: 0.65,
      // High feedback — echoes pile up
      echoVolume: 0.9,
      wow: 0.25,
      // Heavy wow for pitch drift
      flutter: 0.2,
      // Pronounced flutter
      dirt: 0.15,
      // Dirty tape sound
      inputBleed: 1,
      // Bleed ON — extra chaos
      loopAmount: 0.2,
      // Ghost echoes from tape loop
      playheadFilter: 1
    }
  },
  // ═══════════════════════════════════════════════════════════════
  // SCIENTIST — Precise, surgical dub mixing. Clean throws that
  // sit perfectly in the mix without overwhelming the riddim.
  // ═══════════════════════════════════════════════════════════════
  {
    name: "Scientist Clean",
    description: "Precise clean throws — sits in the mix perfectly",
    params: {
      mode: 3,
      // Head 1 + feedback
      repeatRate: 0.4,
      // Medium delay
      intensity: 0.4,
      // Controlled — doesn't run away
      echoVolume: 0.65,
      // Not too loud
      wow: 0.05,
      // Minimal wow
      flutter: 0.03,
      // Near-perfect tape
      dirt: 0,
      inputBleed: 0,
      loopAmount: 0,
      playheadFilter: 1
    }
  },
  // ═══════════════════════════════════════════════════════════════
  // CLASSIC PRESETS — Standard delay patterns
  // ═══════════════════════════════════════════════════════════════
  {
    name: "Slapback",
    description: "Short tight slapback — rocksteady vocal double",
    params: {
      mode: 0,
      // Head 1 only
      repeatRate: 0.75,
      // Short delay
      intensity: 0.15,
      // Single repeat
      echoVolume: 0.6,
      wow: 0,
      flutter: 0,
      dirt: 0,
      inputBleed: 0,
      loopAmount: 0,
      playheadFilter: 0
    }
  },
  {
    name: "Dubplate Special",
    description: "Heavy dub plate echo with tape degradation",
    params: {
      mode: 4,
      // Head 2 + feedback — longer intervals
      repeatRate: 0.25,
      // Very long delay
      intensity: 0.6,
      // High feedback
      echoVolume: 0.8,
      wow: 0.2,
      flutter: 0.15,
      dirt: 0.1,
      inputBleed: 0,
      loopAmount: 0.15,
      // Subtle ghost echo
      playheadFilter: 1
    }
  },
  {
    name: "Rhythm Echo",
    description: "Two-head polyrhythmic echo pattern",
    params: {
      mode: 2,
      // Both heads — creates rhythmic pattern
      repeatRate: 0.45,
      // Medium
      intensity: 0.35,
      // Moderate feedback
      echoVolume: 0.75,
      wow: 0.1,
      flutter: 0.08,
      dirt: 0.05,
      inputBleed: 0,
      loopAmount: 0,
      playheadFilter: 1
    }
  },
  {
    name: "Infinite Dub",
    description: "Self-oscillating echo — turn down intensity to recover",
    params: {
      mode: 5,
      // Both + feedback
      repeatRate: 0.35,
      intensity: 0.78,
      // Near self-oscillation
      echoVolume: 0.9,
      wow: 0.3,
      // Heavy wobble
      flutter: 0.25,
      dirt: 0.2,
      inputBleed: 1,
      loopAmount: 0.3,
      // Lots of ghost echo
      playheadFilter: 1
    }
  }
];
const SpaceyDelayerEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const firstTap = getParam(effect, "firstTap", 250);
  const tapSize = getParam(effect, "tapSize", 150);
  const feedback = getParam(effect, "feedback", 40);
  const multiTap = getParam(effect, "multiTap", 1);
  const tapeFilter = getParam(effect, "tapeFilter", 0);
  const synced = isEffectBpmSynced(effect.parameters);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#8b5cf6" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 33,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#8b5cf6", title: "Spacey Delayer" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 36,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: firstTap,
            min: 10,
            max: 2e3,
            onChange: (v) => {
              if (synced) onUpdateParameter("bpmSync", 0);
              onUpdateParameter("firstTap", v);
            },
            label: "First Tap",
            color: "#8b5cf6",
            formatValue: (v) => synced ? "SYNC" : `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 38,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: tapSize,
            min: 10,
            max: 1e3,
            onChange: (v) => onUpdateParameter("tapSize", v),
            label: "Tap Size",
            color: "#a78bfa",
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 50,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: feedback,
            min: 0,
            max: 95,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            color: "#7c3aed",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 59,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#06b6d4",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 68,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 37,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 35,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a78bfa", title: "Options" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 83,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onUpdateParameter("multiTap", multiTap ? 0 : 1),
            className: `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${multiTap ? "bg-purple-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: [
              "Multi-Tap ",
              multiTap ? "ON" : "OFF"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 85,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onUpdateParameter("tapeFilter", tapeFilter ? 0 : 1),
            className: `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tapeFilter ? "bg-purple-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: [
              "Tape Filter ",
              tapeFilter ? "ON" : "OFF"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 95,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 84,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 82,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
    lineNumber: 32,
    columnNumber: 5
  }, void 0);
};
const RETapeEchoEditor = ({
  effect,
  onUpdateParameter,
  onUpdateParameters,
  onUpdateWet
}) => {
  const mode = getParam(effect, "mode", 3);
  const repeatRate = getParam(effect, "repeatRate", 0.5);
  const intensity = getParam(effect, "intensity", 0.5);
  const echoVolume = getParam(effect, "echoVolume", 0.8);
  const wow = getParam(effect, "wow", 0);
  const flutter = getParam(effect, "flutter", 0);
  const dirt = getParam(effect, "dirt", 0);
  const inputBleed = getParam(effect, "inputBleed", 0);
  const loopAmount = getParam(effect, "loopAmount", 0);
  const playheadFilter = getParam(effect, "playheadFilter", 1);
  const synced = isEffectBpmSynced(effect.parameters);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const modeLabels = ["Head 1", "Head 2", "Both", "H1+FB", "H2+FB", "Both+FB"];
  const applyPreset = (preset) => {
    if (onUpdateParameters) {
      onUpdateParameters(preset.params);
    } else {
      Object.entries(preset.params).forEach(([key, value]) => {
        onUpdateParameter(key, value);
      });
    }
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#dc2626" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 148,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#dc2626", title: "Presets" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 151,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1", children: RE_TAPE_ECHO_PRESETS.map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => applyPreset(preset),
          title: preset.description,
          className: "px-2.5 py-1.5 rounded text-xs font-medium transition-colors\n                bg-dark-bgTertiary text-text-secondary hover:bg-red-600/30 hover:text-text-primary\n                active:bg-red-600 active:text-text-primary",
          children: preset.name
        },
        preset.name,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 154,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 152,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 150,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#dc2626", title: "RE Tape Echo" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 169,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: repeatRate * 100,
            min: 0,
            max: 100,
            onChange: (v) => {
              if (synced) onUpdateParameter("bpmSync", 0);
              onUpdateParameter("repeatRate", v / 100);
            },
            label: "Rate",
            color: "#dc2626",
            formatValue: (v) => synced ? "SYNC" : `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 171,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: intensity * 100,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("intensity", v / 100),
            label: "Intensity",
            color: "#ef4444",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 183,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: echoVolume * 100,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("echoVolume", v / 100),
            label: "Echo Vol",
            color: "#f97316",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 192,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#06b6d4",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 201,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 170,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 168,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#f97316", title: "Tape Character" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 216,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: wow * 100,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("wow", v / 100),
            label: "Wow",
            color: "#f97316",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 218,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: flutter * 100,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("flutter", v / 100),
            label: "Flutter",
            color: "#fb923c",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 227,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: dirt * 100,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("dirt", v / 100),
            label: "Dirt",
            color: "#ea580c",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 236,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: loopAmount * 100,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("loopAmount", v / 100),
            label: "Tape Loop",
            color: "#a16207",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 245,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 217,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 215,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#b91c1c", title: "Mode & Options" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 259,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-secondary mb-2", children: "Echo Mode" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 261,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-6 gap-1", children: modeLabels.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onUpdateParameter("mode", i),
            className: `px-2 py-1.5 rounded text-xs font-medium transition-colors ${mode === i ? "bg-red-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: label
          },
          i,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 264,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 262,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 260,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onUpdateParameter("playheadFilter", playheadFilter ? 0 : 1),
            className: `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${playheadFilter ? "bg-red-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: [
              "Head EQ ",
              playheadFilter ? "ON" : "OFF"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 279,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onUpdateParameter("inputBleed", inputBleed ? 0 : 1),
            className: `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${inputBleed ? "bg-red-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: [
              "Bleed ",
              inputBleed ? "ON" : "OFF"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 289,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 278,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 258,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
    lineNumber: 147,
    columnNumber: 5
  }, void 0);
};
const SpaceEchoEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const mode = getParam(effect, "mode", 4);
  const rate = getParam(effect, "rate", 300);
  const intensity = getParam(effect, "intensity", 0.5);
  const echoVolume = getParam(effect, "echoVolume", 0.8);
  const reverbVolume = getParam(effect, "reverbVolume", 0.3);
  const bass = getParam(effect, "bass", 0);
  const treble = getParam(effect, "treble", 0);
  const synced = isEffectBpmSynced(effect.parameters);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#6366f1" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 326,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#6366f1", title: "Echo" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 328,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: mode,
            min: 1,
            max: 12,
            onChange: (v) => onUpdateParameter("mode", Math.round(v)),
            label: "Mode",
            color: "#6366f1",
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 330,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: rate,
            min: 50,
            max: 1e3,
            onChange: (v) => {
              if (synced) onUpdateParameter("bpmSync", 0);
              onUpdateParameter("rate", v);
            },
            label: "Rate",
            color: "#6366f1",
            formatValue: (v) => synced ? "SYNC" : `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 339,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: intensity,
            min: 0,
            max: 1.2,
            onChange: (v) => onUpdateParameter("intensity", v),
            label: "Intensity",
            color: "#6366f1",
            formatValue: (v) => `${(v * 100).toFixed(0)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 351,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 329,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 327,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#818cf8", title: "Levels & EQ" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 364,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: echoVolume,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("echoVolume", v),
            label: "Echo Vol",
            color: "#818cf8",
            formatValue: (v) => `${(v * 100).toFixed(0)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 366,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: reverbVolume,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("reverbVolume", v),
            label: "Reverb Vol",
            color: "#818cf8",
            formatValue: (v) => `${(v * 100).toFixed(0)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 375,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: bass,
            min: -20,
            max: 20,
            onChange: (v) => onUpdateParameter("bass", v),
            label: "Bass",
            color: "#818cf8",
            bipolar: true,
            formatValue: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 384,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: treble,
            min: -20,
            max: 20,
            onChange: (v) => onUpdateParameter("treble", v),
            label: "Treble",
            color: "#818cf8",
            bipolar: true,
            formatValue: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 394,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 365,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 363,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#a5b4fc",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 408,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 407,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 406,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
    lineNumber: 325,
    columnNumber: 5
  }, void 0);
};
const TONEARM_RPM_PRESETS = [
  { label: "33 RPM", value: 33.333 },
  { label: "45 RPM", value: 45 },
  { label: "78 RPM", value: 78 }
];
const ToneArmEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  var _a;
  const wow = getParam(effect, "wow", 20) / 100;
  const coil = getParam(effect, "coil", 50) / 100;
  const flutter = getParam(effect, "flutter", 15) / 100;
  const riaa = getParam(effect, "riaa", 50) / 100;
  const stylus = getParam(effect, "stylus", 30) / 100;
  const hiss = getParam(effect, "hiss", 20) / 100;
  const pops = getParam(effect, "pops", 15) / 100;
  const rpm = getParam(effect, "rpm", 33.333);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const activeRpm = ((_a = TONEARM_RPM_PRESETS.find((p) => Math.abs(rpm - p.value) < 1)) == null ? void 0 : _a.label) ?? null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center space-y-4 w-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#a3e635" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 452,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a3e635", title: "Record Speed" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 456,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: TONEARM_RPM_PRESETS.map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("rpm", p.value),
          className: [
            "flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all",
            activeRpm === p.label ? "bg-lime-700/70 border-lime-500 text-lime-100" : "bg-black/40 border-dark-border text-text-muted hover:border-lime-700 hover:text-lime-300"
          ].join(" "),
          children: p.label
        },
        p.label,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 459,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 457,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 455,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a3e635", title: "Cartridge" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 477,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-8 items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: coil, min: 0, max: 1, onChange: (v) => onUpdateParameter("coil", Math.round(v * 100)), label: "Coil", color: "#a3e635", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 479,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: riaa, min: 0, max: 1, onChange: (v) => onUpdateParameter("riaa", Math.round(v * 100)), label: "RIAA", color: "#84cc16", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 480,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: stylus, min: 0, max: 1, onChange: (v) => onUpdateParameter("stylus", Math.round(v * 100)), label: "Stylus", color: "#65a30d", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 481,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 478,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 476,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#bef264", title: "Turntable" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 487,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-8 items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: wow, min: 0, max: 1, onChange: (v) => onUpdateParameter("wow", Math.round(v * 100)), label: "Wow", color: "#bef264", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 489,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: flutter, min: 0, max: 1, onChange: (v) => onUpdateParameter("flutter", Math.round(v * 100)), label: "Flutter", color: "#bef264", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 490,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 488,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 486,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#d9f99d", title: "Surface" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 496,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-8 items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: hiss, min: 0, max: 1, onChange: (v) => onUpdateParameter("hiss", Math.round(v * 100)), label: "Hiss", color: "#d9f99d", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 498,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: pops, min: 0, max: 1, onChange: (v) => onUpdateParameter("pops", Math.round(v * 100)), label: "Pops", color: "#d9f99d", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 499,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { value: effect.wet / 100, min: 0, max: 1, onChange: (v) => onUpdateWet(Math.round(v * 100)), label: "Wet", color: "#ecfccb", formatValue: (v) => `${Math.round(v * 100)}%` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 500,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 497,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 495,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
    lineNumber: 451,
    columnNumber: 5
  }, void 0);
};
const TUMULT_CATEGORIES = [
  { label: "Hum", start: 0, end: 4 },
  { label: "Machine", start: 5, end: 15 },
  { label: "Static", start: 16, end: 21 },
  { label: "Vinyl", start: 22, end: 26 },
  { label: "World", start: 27, end: 44 },
  { label: "Plethora A", start: 45, end: 61 },
  { label: "Plethora B", start: 62, end: 71 },
  { label: "Plethora C", start: 72, end: 94 }
];
const TUMULT_SAMPLE_NAMES = [
  // hum
  "Hyperspace",
  "Alien Hum",
  "Elec Hum",
  "Feedback",
  "VHS Hum",
  // machine
  "Fan",
  "Dough",
  "Fridge 1",
  "Fridge 2",
  "Furnace",
  "Lettersort",
  "Oven",
  "Tattoo AC",
  "Hotel Vent",
  "Vending",
  "Washing",
  // static
  "Elec Zap",
  "Elec Noise",
  "Film Static",
  "Gramophone",
  "Radio Fuzz",
  "TV Static",
  // vinyl
  "Runoff",
  "Old Vinyl",
  "Vinyl Dust",
  "Analogue",
  "Vinyl Crackle",
  // world
  "City Snow",
  "City Night",
  "City Traffic",
  "Crowd",
  "Campfire 1",
  "Fire 2",
  "Campfire 3",
  "Campfire 4",
  "Rain LA",
  "Forest Rain",
  "Thunder Rain",
  "City Rain",
  "Traffic Rain",
  "Metro",
  "Waterfall 1",
  "Waterfall 2",
  "Waterfall 3",
  "Waterfall 4",
  // noiseplethora A
  "A0 Radio 1",
  "A0 Radio 2",
  "A1 SineFM",
  "A2 RingSqr",
  "A3 RingSine 1",
  "A3 RingSine 2",
  "A4 CrossMod 1",
  "A4 CrossMod 2",
  "A5 Resonoise",
  "A6 Grain 1",
  "A6 Grain 2",
  "A7 Grain3 1",
  "A7 Grain3 2",
  "A8 Grain4 1",
  "A8 Grain4 2",
  "A9 Basurilla 1",
  "A9 Basurilla 2",
  // noiseplethora B
  "B0 ClusterSaw",
  "B1 PwCluster",
  "B2 CrCluster",
  "B3 SineFM",
  "B4 TriFM",
  "B5 Prime",
  "B6 PrimeCnoise",
  "B7 Fibonacci",
  "B8 Partial",
  "B9 Phasing",
  // noiseplethora C
  "C0 Basura 1",
  "C0 Basura 2",
  "C1 Atari",
  "C2 Filomena 1",
  "C2 Filomena 2",
  "C3 PSH",
  "C4 Array 1",
  "C4 Array 2",
  "C4 Array 3",
  "C4 Array 4",
  "C5 Exists 1",
  "C5 Exists 2",
  "C6 WhoKnows 1",
  "C6 WhoKnows 2",
  "C6 WhoKnows 3",
  "C7 Satan 1",
  "C7 Satan 2",
  "C8 BitCrush 1",
  "C8 BitCrush 2",
  "C8 BitCrush 3",
  "C9 LFree 1",
  "C9 LFree 2",
  "C9 LFree 3"
];
const TumultEditor = ({
  effect,
  onUpdateParameter
}) => {
  const configRef = reactExports.useRef(effect);
  reactExports.useEffect(() => {
    configRef.current = effect;
  }, [effect]);
  reactExports.useEffect(() => {
    const node = getToneEngine().getMasterEffectNode(effect.id);
    if (node && "setEditorOpen" in node) node.setEditorOpen(true);
    return () => {
      const n = getToneEngine().getMasterEffectNode(effect.id);
      if (n && "setEditorOpen" in n) n.setEditorOpen(false);
    };
  }, [effect.id]);
  const p = (key, def) => getParam(effect, key, def);
  const sourceMode = p("sourceMode", 0);
  const noiseMode = p("noiseMode", 0);
  const switchBranch = p("switchBranch", 0);
  const sampleIndex = p("sampleIndex", 0);
  const activeCat = TUMULT_CATEGORIES.find((c) => sampleIndex >= c.start && sampleIndex <= c.end);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const set = reactExports.useCallback((key, value) => {
    onUpdateParameter(key, value);
  }, [onUpdateParameter]);
  const SOURCE_LABELS2 = ["Off", "Synth", "Sample", "Custom"];
  const NOISE_LABELS = ["White", "Pink", "Brown", "Velvet", "Crushed"];
  const BRANCH_LABELS = ["Duck", "Raw", "Follow"];
  const BRANCH_VALUES = [0, 2, 1];
  const btnBase = "flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all";
  const btnActive = "bg-violet-700/70 border-violet-500 text-violet-100";
  const btnInactive = "bg-black/40 border-dark-border text-text-muted hover:border-violet-700 hover:text-violet-300";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#7c3aed" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 595,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c3aed", title: "Source" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 598,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 mb-3", children: SOURCE_LABELS2.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => set("sourceMode", i),
          className: `${btnBase} ${sourceMode === i ? btnActive : btnInactive}`,
          children: label
        },
        label,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 602,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 600,
        columnNumber: 9
      }, void 0),
      sourceMode === 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: NOISE_LABELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => set("noiseMode", i),
          className: `${btnBase} ${noiseMode === i ? btnActive : btnInactive}`,
          children: label
        },
        label,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 612,
          columnNumber: 15
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 610,
        columnNumber: 11
      }, void 0),
      (sourceMode === 2 || sourceMode === 3) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1.5 mb-2 flex-wrap", children: TUMULT_CATEGORIES.map((cat) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => set("sampleIndex", cat.start),
            className: `px-2 py-1 rounded text-xs font-bold border transition-all ${(activeCat == null ? void 0 : activeCat.label) === cat.label ? btnActive : btnInactive}`,
            children: cat.label
          },
          cat.label,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 624,
            columnNumber: 17
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 622,
          columnNumber: 13
        }, void 0),
        activeCat && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1.5 flex-wrap", children: Array.from({ length: activeCat.end - activeCat.start + 1 }, (_, i) => {
          const idx = activeCat.start + i;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => set("sampleIndex", idx),
              className: `px-2 py-1 rounded text-xs border transition-all ${sampleIndex === idx ? btnActive : btnInactive}`,
              children: TUMULT_SAMPLE_NAMES[idx]
            },
            idx,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
              lineNumber: 638,
              columnNumber: 21
            },
            void 0
          );
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 634,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 621,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 597,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c3aed", title: "Controls" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 654,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-6 items-start flex-wrap", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Gain",
            value: p("noiseGain", -10),
            min: -35,
            max: 35,
            unit: "dB",
            onChange: (v) => set("noiseGain", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 657,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Mix",
            value: p("mix", 0.5),
            min: 0,
            max: 1,
            onChange: (v) => set("mix", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 659,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Clip",
            value: p("clipAmount", 0.497),
            min: 0.05,
            max: 1,
            onChange: (v) => set("clipAmount", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 661,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted mb-1", children: "Mode" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 665,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1.5", children: BRANCH_LABELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => set("switchBranch", BRANCH_VALUES[i]),
              className: `px-3 py-1 rounded text-xs font-bold border transition-all ${switchBranch === BRANCH_VALUES[i] ? btnActive : btnInactive}`,
              children: label
            },
            label,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
              lineNumber: 668,
              columnNumber: 17
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 666,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
          lineNumber: 664,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 656,
        columnNumber: 9
      }, void 0),
      switchBranch === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 mt-3 pt-3 border-t border-dark-border flex-wrap", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Threshold",
            value: p("duckThreshold", -20),
            min: -100,
            max: 0,
            unit: "dB",
            onChange: (v) => set("duckThreshold", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 681,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Attack",
            value: p("duckAttack", 0),
            min: 0,
            max: 500,
            unit: "ms",
            onChange: (v) => set("duckAttack", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 683,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Release",
            value: p("duckRelease", 15),
            min: 0,
            max: 500,
            unit: "ms",
            onChange: (v) => set("duckRelease", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 685,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 680,
        columnNumber: 11
      }, void 0),
      switchBranch === 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 mt-3 pt-3 border-t border-dark-border flex-wrap", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Threshold",
            value: p("followThreshold", -20),
            min: -100,
            max: 0,
            unit: "dB",
            onChange: (v) => set("followThreshold", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 692,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Attack",
            value: p("followAttack", 0),
            min: 0,
            max: 500,
            unit: "ms",
            onChange: (v) => set("followAttack", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 694,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Release",
            value: p("followRelease", 15),
            min: 0,
            max: 500,
            unit: "ms",
            onChange: (v) => set("followRelease", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 696,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            label: "Amount",
            value: p("followAmount", 0.7),
            min: 0,
            max: 1,
            onChange: (v) => set("followAmount", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 698,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 691,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 653,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c3aed", title: "EQ" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 706,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 flex-wrap", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          TumultEQBand,
          {
            label: "HP",
            enableKey: "hpEnable",
            freqKey: "hpFreq",
            qKey: "hpQ",
            enabled: !!p("hpEnable", 0),
            freq: p("hpFreq", 888.5),
            q: p("hpQ", 0.7),
            onSet: set,
            showGain: false
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 709,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          TumultEQBand,
          {
            label: "Low",
            enableKey: "peak1Enable",
            freqKey: "peak1Freq",
            gainKey: "peak1Gain",
            qKey: "peak1Q",
            typeKey: "peak1Type",
            enabled: !!p("peak1Enable", 0),
            freq: p("peak1Freq", 20),
            gain: p("peak1Gain", -0.19),
            q: p("peak1Q", 0.7),
            filterType: p("peak1Type", 0),
            typeLabels: ["Bell", "Lo Shelf"],
            onSet: set,
            showGain: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 712,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          TumultEQBand,
          {
            label: "Mid",
            enableKey: "peak2Enable",
            freqKey: "peak2Freq",
            gainKey: "peak2Gain",
            qKey: "peak2Q",
            enabled: !!p("peak2Enable", 0),
            freq: p("peak2Freq", 600),
            gain: p("peak2Gain", 1),
            q: p("peak2Q", 1),
            onSet: set,
            showGain: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 718,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          TumultEQBand,
          {
            label: "High",
            enableKey: "peak3Enable",
            freqKey: "peak3Freq",
            gainKey: "peak3Gain",
            qKey: "peak3Q",
            typeKey: "peak3Type",
            enabled: !!p("peak3Enable", 0),
            freq: p("peak3Freq", 2500),
            gain: p("peak3Gain", 1),
            q: p("peak3Q", 1),
            filterType: p("peak3Type", 1),
            typeLabels: ["Bell", "Hi Shelf"],
            onSet: set,
            showGain: true
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 723,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          TumultEQBand,
          {
            label: "LP",
            enableKey: "lpEnable",
            freqKey: "lpFreq",
            qKey: "lpQ",
            enabled: !!p("lpEnable", 0),
            freq: p("lpFreq", 8500),
            q: p("lpQ", 0.7),
            onSet: set,
            showGain: false
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
            lineNumber: 729,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 708,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 705,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
    lineNumber: 594,
    columnNumber: 5
  }, void 0);
};
const TumultEQBand = ({
  label,
  enableKey,
  freqKey,
  gainKey,
  qKey,
  typeKey,
  enabled,
  freq,
  gain,
  q,
  filterType,
  typeLabels,
  onSet,
  showGain
}) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex flex-col gap-2 min-w-[60px]", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold text-text-secondary", children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 749,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => onSet(enableKey, enabled ? 0 : 1),
        className: `w-4 h-4 rounded-sm border transition-all ${enabled ? "bg-violet-500 border-violet-400" : "bg-black/40 border-dark-border"}`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
        lineNumber: 750,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
    lineNumber: 748,
    columnNumber: 5
  }, void 0),
  typeKey && typeLabels && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: typeLabels.map((t, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick: () => onSet(typeKey, i),
      className: `flex-1 py-0.5 rounded text-[10px] border transition-all ${filterType === i ? "bg-violet-700/70 border-violet-500 text-violet-100" : "bg-black/40 border-dark-border text-text-muted"}`,
      children: t
    },
    t,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 760,
      columnNumber: 11
    },
    void 0
  )) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
    lineNumber: 758,
    columnNumber: 7
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Knob,
    {
      label: "Freq",
      value: freq,
      min: 20,
      max: 2e4,
      unit: "Hz",
      onChange: (v) => onSet(freqKey, v),
      size: "sm"
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 771,
      columnNumber: 5
    },
    void 0
  ),
  showGain && gainKey && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Knob,
    {
      label: "Gain",
      value: gain ?? 0,
      min: -24,
      max: 24,
      unit: "dB",
      onChange: (v) => onSet(gainKey, v),
      size: "sm"
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 774,
      columnNumber: 7
    },
    void 0
  ),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Knob,
    {
      label: "Q",
      value: q,
      min: 0.7,
      max: 10,
      onChange: (v) => onSet(qKey, v),
      size: "sm"
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
      lineNumber: 777,
      columnNumber: 5
    },
    void 0
  )
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DelayVariantEditors.tsx",
  lineNumber: 747,
  columnNumber: 3
}, void 0);
const AutoPannerEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  var _a;
  const frequency = getParam(effect, "frequency", 1);
  const depth = getParam(effect, "depth", 1);
  const type = ((_a = effect.parameters) == null ? void 0 : _a.type) || "sine";
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const WAVE_TYPES = ["sine", "triangle", "square", "sawtooth"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#22c55e" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 30,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#22c55e", title: "Auto Panner" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 32,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-2 mb-4", children: WAVE_TYPES.map((w) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("type", w),
          className: `px-3 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${type === w ? "bg-green-700/70 border-green-500 text-green-100" : "bg-black/40 border-dark-border text-text-muted hover:border-green-700"}`,
          children: w === "sawtooth" ? "saw" : w
        },
        w,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
          lineNumber: 35,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 33,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: 0,
            max: 20,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Rate",
            color: "#22c55e",
            formatValue: (v) => `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 42,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: depth,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("depth", v),
            label: "Depth",
            color: "#22c55e",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 51,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#4ade80",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 60,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 41,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 31,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
    lineNumber: 29,
    columnNumber: 5
  }, void 0);
};
const AutoWahEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const baseFrequency = getParam(effect, "baseFrequency", 100);
  const octaves = getParam(effect, "octaves", 6);
  const sensitivity = getParam(effect, "sensitivity", 0);
  const Q = getParam(effect, "Q", 2);
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#f43f5e" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 92,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#f43f5e", title: "Auto Wah" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 94,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: baseFrequency,
            min: 50,
            max: 500,
            onChange: (v) => onUpdateParameter("baseFrequency", v),
            label: "Base Freq",
            size: "sm",
            color: "#f43f5e",
            formatValue: (v) => `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 96,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: octaves,
            min: 0,
            max: 8,
            onChange: (v) => onUpdateParameter("octaves", v),
            label: "Octaves",
            size: "sm",
            color: "#f43f5e",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 106,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: sensitivity,
            min: -40,
            max: 0,
            onChange: (v) => onUpdateParameter("sensitivity", v),
            label: "Sens",
            size: "sm",
            color: "#f43f5e",
            formatValue: (v) => `${Math.round(v)}dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 116,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: Q,
            min: 0,
            max: 10,
            onChange: (v) => onUpdateParameter("Q", v),
            label: "Q",
            size: "sm",
            color: "#f43f5e",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 126,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 95,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 93,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#fb7185",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 140,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 139,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 138,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
    lineNumber: 91,
    columnNumber: 5
  }, void 0);
};
const BitCrusherEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const bits = getParam(effect, "bits", 4);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#84cc16" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 169,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#84cc16", title: "Bit Crusher" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 171,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: bits,
            min: 1,
            max: 16,
            onChange: (v) => onUpdateParameter("bits", Math.round(v)),
            label: "Bits",
            size: "lg",
            color: "#84cc16",
            formatValue: (v) => `${Math.round(v)} bit`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 173,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            size: "lg",
            color: "#a3e635",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 183,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 172,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 170,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
    lineNumber: 168,
    columnNumber: 5
  }, void 0);
};
const ChebyshevEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  var _a;
  const order = getParam(effect, "order", 2);
  const oversample = ((_a = effect.parameters) == null ? void 0 : _a.oversample) || "none";
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const OVERSAMPLE_OPTS = ["none", "2x", "4x"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#f59e0b" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 216,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WaveshaperCurve, { type: "Chebyshev", order, color: "#f59e0b", height: 100 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 217,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#f59e0b", title: "Chebyshev Waveshaper" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 219,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-2 mb-4", children: OVERSAMPLE_OPTS.map((o) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("oversample", o),
          className: `px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${oversample === o ? "bg-amber-700/70 border-amber-500 text-amber-100" : "bg-black/40 border-dark-border text-text-muted hover:border-amber-700"}`,
          children: o === "none" ? "Off" : o
        },
        o,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
          lineNumber: 222,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 220,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: order,
            min: 1,
            max: 100,
            onChange: (v) => onUpdateParameter("order", Math.round(v)),
            label: "Order",
            size: "lg",
            color: "#f59e0b",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 229,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            size: "lg",
            color: "#fbbf24",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 239,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 228,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 218,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
    lineNumber: 215,
    columnNumber: 5
  }, void 0);
};
const FrequencyShifterEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const frequency = getParam(effect, "frequency", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#06b6d4" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 269,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#06b6d4", title: "Frequency Shifter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 271,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: -1e3,
            max: 1e3,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Shift",
            size: "lg",
            color: "#06b6d4",
            bipolar: true,
            formatValue: (v) => `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 273,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            size: "lg",
            color: "#22d3ee",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 284,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 272,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 270,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
    lineNumber: 268,
    columnNumber: 5
  }, void 0);
};
const PitchShiftEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const pitch = getParam(effect, "pitch", 0);
  const windowSize = getParam(effect, "windowSize", 0.1);
  const feedback = getParam(effect, "feedback", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#8b5cf6" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 316,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#8b5cf6", title: "Pitch Shift" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 318,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: pitch,
            min: -12,
            max: 12,
            onChange: (v) => onUpdateParameter("pitch", Math.round(v)),
            label: "Pitch",
            color: "#8b5cf6",
            bipolar: true,
            formatValue: (v) => `${Math.round(v) > 0 ? "+" : ""}${Math.round(v)}st`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 320,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: windowSize,
            min: 0.01,
            max: 0.5,
            onChange: (v) => onUpdateParameter("windowSize", v),
            label: "Window",
            color: "#8b5cf6",
            formatValue: (v) => `${Math.round(v * 1e3)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 330,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: feedback,
            min: 0,
            max: 0.95,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            color: "#8b5cf6",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 339,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 319,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 317,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#a78bfa",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 352,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 351,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 350,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
    lineNumber: 315,
    columnNumber: 5
  }, void 0);
};
const JCReverbEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const roomSize = getParam(effect, "roomSize", 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#6366f1" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 381,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#6366f1", title: "JC Reverb" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 383,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: roomSize,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("roomSize", v),
            label: "Room Size",
            size: "lg",
            color: "#6366f1",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 385,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            size: "lg",
            color: "#818cf8",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 395,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 384,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 382,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
    lineNumber: 380,
    columnNumber: 5
  }, void 0);
};
const StereoWidenerEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const width = getParam(effect, "width", 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#ec4899" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 425,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ec4899", title: "Stereo Widener" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 427,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: width,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("width", v),
            label: "Width",
            size: "lg",
            color: "#ec4899",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 429,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            size: "lg",
            color: "#f472b6",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
            lineNumber: 439,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
        lineNumber: 428,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
      lineNumber: 426,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/SpecializedEffectEditors.tsx",
    lineNumber: 424,
    columnNumber: 5
  }, void 0);
};
const CARRIER_LABELS = ["Saw", "Square", "Noise", "Chord"];
const CARRIER_NAME_TO_INT = {
  saw: 0,
  square: 1,
  noise: 2,
  chord: 3
};
const SOURCE_LABELS = [
  { value: "self", label: "Chain" },
  { value: "mic", label: "Mic" }
];
function getStringParam(effect, key, def) {
  const v = effect.parameters[key];
  return typeof v === "string" ? v : def;
}
const VocoderEditor = ({
  effect,
  onUpdateParameter,
  onUpdateParameters,
  onUpdateWet
}) => {
  const presetName = getStringParam(effect, "preset", "");
  const source = getStringParam(effect, "source", "self");
  const bands = getParam(effect, "bands", 32);
  const filtersPerBand = getParam(effect, "filtersPerBand", 6);
  const carrierType = getParam(effect, "carrierType", 3);
  const carrierFreq = getParam(effect, "carrierFreq", 130.81);
  const formantShift = getParam(effect, "formantShift", 1);
  const reactionTime = getParam(effect, "reactionTime", 30);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const applyPreset = (name) => {
    const preset = VOCODER_EFFECT_PRESETS.find((p2) => p2.name === name);
    if (!preset) return;
    const p = preset.params;
    const allParams = {
      preset: name,
      bands: p.bands,
      filtersPerBand: p.filtersPerBand,
      carrierType: CARRIER_NAME_TO_INT[p.carrierType],
      carrierFreq: p.carrierFreq,
      formantShift: p.formantShift,
      reactionTime: Math.round(p.reactionTime * 1e3)
    };
    if (onUpdateParameters) {
      onUpdateParameters(allParams);
    } else {
      Object.entries(allParams).forEach(([key, value]) => onUpdateParameter(key, value));
    }
  };
  const tweak = (key, value) => {
    if (presetName) onUpdateParameter("preset", "");
    onUpdateParameter(key, value);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#a855f7" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 85,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a855f7", title: "Voice Preset" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 88,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-1 mb-3", children: VOCODER_EFFECT_PRESETS.map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => applyPreset(p.name),
          className: `px-2 py-1.5 text-[11px] font-bold rounded transition-colors ${presetName === p.name ? "bg-purple-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
          children: p.name
        },
        p.name,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
          lineNumber: 91,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 89,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a855f7", title: "Modulator Source" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 105,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-1", children: SOURCE_LABELS.map((s) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("source", s.value),
          className: `px-2 py-1.5 text-xs font-medium rounded transition-colors ${source === s.value ? "bg-purple-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
          title: s.value === "self" ? "Chain audio modulates the carrier" : "Microphone input modulates the carrier",
          children: s.label
        },
        s.value,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
          lineNumber: 108,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 106,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 87,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a855f7", title: "Carrier" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 126,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-1 mb-3", children: CARRIER_LABELS.map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => tweak("carrierType", i),
          className: `px-2 py-1.5 text-xs font-medium rounded transition-colors ${Math.round(carrierType) === i ? "bg-purple-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
          children: name
        },
        name,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
          lineNumber: 129,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 127,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: carrierFreq,
            min: 20,
            max: 2e3,
            onChange: (v) => tweak("carrierFreq", v),
            label: "Freq",
            color: "#a855f7",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(2)}k` : `${v.toFixed(1)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
            lineNumber: 143,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: formantShift,
            min: 0.25,
            max: 4,
            onChange: (v) => tweak("formantShift", v),
            label: "Formant",
            color: "#a855f7",
            formatValue: (v) => `${v.toFixed(2)}x`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
            lineNumber: 152,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 142,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 125,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a855f7", title: "Filterbank" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 166,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: bands,
            min: 12,
            max: 64,
            onChange: (v) => tweak("bands", Math.round(v)),
            label: "Bands",
            color: "#a855f7",
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
            lineNumber: 168,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: filtersPerBand,
            min: 1,
            max: 8,
            onChange: (v) => tweak("filtersPerBand", Math.round(v)),
            label: "Order",
            color: "#a855f7",
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
            lineNumber: 177,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: reactionTime,
            min: 2,
            max: 500,
            onChange: (v) => tweak("reactionTime", Math.round(v)),
            label: "Reaction",
            color: "#a855f7",
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
            lineNumber: 186,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 167,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 165,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#c084fc",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 201,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 200,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 199,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
    lineNumber: 84,
    columnNumber: 5
  }, void 0);
};
const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALE_OPTIONS = ["major", "minor", "chromatic", "pentatonic", "blues"];
const AutoTuneEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const key = getParam(effect, "key", 0);
  const scale = getStringParam(effect, "scale", "major");
  const strength = getParam(effect, "strength", 100);
  const speed = getParam(effect, "speed", 70);
  const { pre: atPre, post: atPost } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre: atPre, post: atPost, color: "#ec4899" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 236,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ec4899", title: "Key" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 239,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-6 gap-1", children: KEY_NAMES.map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("key", i),
          className: `px-2 py-1.5 text-xs font-medium rounded transition-colors ${Math.round(key) === i ? "bg-pink-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
          children: name
        },
        name,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
          lineNumber: 242,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 240,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 238,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ec4899", title: "Scale" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 259,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-5 gap-1", children: SCALE_OPTIONS.map((s) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("scale", s),
          className: `px-2 py-1.5 text-[11px] font-bold uppercase rounded transition-colors ${scale === s ? "bg-pink-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
          children: s
        },
        s,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
          lineNumber: 262,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 260,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 258,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ec4899", title: "Correction" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 279,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: strength,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("strength", v),
            label: "Strength",
            color: "#ec4899",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
            lineNumber: 281,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: speed,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("speed", v),
            label: "Speed",
            color: "#ec4899",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
            lineNumber: 290,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 280,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 278,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#f472b6",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
        lineNumber: 305,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 304,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
      lineNumber: 303,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/VoiceEffectEditors.tsx",
    lineNumber: 235,
    columnNumber: 5
  }, void 0);
};
const TapeDegradationEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const wow = getParam(effect, "wow", 30);
  const flutter = getParam(effect, "flutter", 20);
  const hiss = getParam(effect, "hiss", 15);
  const dropouts = getParam(effect, "dropouts", 0);
  const saturation = getParam(effect, "saturation", 30);
  const toneShift = getParam(effect, "toneShift", 50);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#a1887f" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 34,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a1887f", title: "Tape Mechanics" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 38,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: wow,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("wow", v),
            label: "Wow",
            color: "#a1887f",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 40,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: flutter,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("flutter", v),
            label: "Flutter",
            color: "#a1887f",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 42,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 39,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 37,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#8d6e63", title: "Degradation" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 49,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: hiss,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("hiss", v),
            label: "Hiss",
            color: "#8d6e63",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 51,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: dropouts,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("dropouts", v),
            label: "Dropouts",
            color: "#8d6e63",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 53,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: saturation,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("saturation", v),
            label: "Saturation",
            color: "#8d6e63",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 55,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: toneShift,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("toneShift", v),
            label: "Tone",
            color: "#8d6e63",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 57,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 50,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 48,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#bcaaa4",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 65,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 64,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 63,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
    lineNumber: 33,
    columnNumber: 5
  }, void 0);
};
const AmbientDelayEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const time = getParam(effect, "time", 375);
  const feedback = getParam(effect, "feedback", 55);
  const taps = getParam(effect, "taps", 2);
  const filterFreq = getParam(effect, "filterFreq", 2500);
  const filterQ = getParam(effect, "filterQ", 1.5);
  const modRate = getParam(effect, "modRate", 30);
  const modDepth = getParam(effect, "modDepth", 15);
  const stereoSpread = getParam(effect, "stereoSpread", 50);
  const diffusion = getParam(effect, "diffusion", 20);
  const synced = isEffectBpmSynced(effect.parameters);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#26a69a" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 96,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#26a69a", title: "Delay" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 100,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: time,
            min: 10,
            max: 2e3,
            onChange: (v) => onUpdateParameter("time", v),
            label: "Time",
            size: "lg",
            color: "#26a69a",
            disabled: synced,
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}s` : `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 103,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: feedback,
            min: 0,
            max: 95,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            size: "lg",
            color: "#26a69a",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 106,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: taps,
            min: 1,
            max: 3,
            onChange: (v) => onUpdateParameter("taps", Math.round(v)),
            label: "Taps",
            size: "lg",
            color: "#26a69a",
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 108,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 102,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 99,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#00897b", title: "Filter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 115,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: filterFreq,
            min: 100,
            max: 1e4,
            onChange: (v) => onUpdateParameter("filterFreq", v),
            label: "Freq",
            color: "#00897b",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 117,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: filterQ,
            min: 0.1,
            max: 10,
            onChange: (v) => onUpdateParameter("filterQ", v),
            label: "Q",
            color: "#00897b",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 120,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 116,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 114,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#4db6ac", title: "Modulation" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 127,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: modRate,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("modRate", v),
            label: "Rate",
            color: "#4db6ac",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 129,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: modDepth,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("modDepth", v),
            label: "Depth",
            color: "#4db6ac",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 131,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: stereoSpread,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("stereoSpread", v),
            label: "Spread",
            color: "#4db6ac",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 133,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: diffusion,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("diffusion", v),
            label: "Diffusion",
            color: "#4db6ac",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 135,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 128,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 126,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#80cbc4",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 143,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 142,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 141,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
    lineNumber: 95,
    columnNumber: 5
  }, void 0);
};
const ShimmerReverbEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const decay = getParam(effect, "decay", 70);
  const shimmer = getParam(effect, "shimmer", 50);
  const pitch = getParam(effect, "pitch", 12);
  const damping = getParam(effect, "damping", 50);
  const size = getParam(effect, "size", 70);
  const predelay = getParam(effect, "predelay", 40);
  const modRate = getParam(effect, "modRate", 30);
  const modDepth = getParam(effect, "modDepth", 20);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#7c4dff" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 172,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c4dff", title: "Reverb" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 176,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: decay,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("decay", v),
            label: "Decay",
            size: "lg",
            color: "#7c4dff",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 178,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: size,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("size", v),
            label: "Size",
            size: "lg",
            color: "#7c4dff",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 180,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: damping,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("damping", v),
            label: "Damping",
            color: "#7c4dff",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 182,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: predelay,
            min: 0,
            max: 200,
            onChange: (v) => onUpdateParameter("predelay", v),
            label: "Pre-delay",
            color: "#7c4dff",
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 184,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 177,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 175,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#b388ff", title: "Shimmer" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 191,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: shimmer,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("shimmer", v),
            label: "Amount",
            size: "lg",
            color: "#b388ff",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 193,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: pitch,
            min: -24,
            max: 24,
            onChange: (v) => onUpdateParameter("pitch", Math.round(v)),
            label: "Pitch",
            size: "lg",
            color: "#b388ff",
            formatValue: (v) => `${Math.round(v)}st`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 195,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 192,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 190,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#9575cd", title: "Modulation" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 202,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: modRate,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("modRate", v),
            label: "Rate",
            color: "#9575cd",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 204,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: modDepth,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("modDepth", v),
            label: "Depth",
            color: "#9575cd",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 206,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 203,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 201,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#ce93d8",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 214,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 213,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 212,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
    lineNumber: 171,
    columnNumber: 5
  }, void 0);
};
const GranularFreezeEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const freeze = getParam(effect, "freeze", 0);
  const grainSize = getParam(effect, "grainSize", 80);
  const density = getParam(effect, "density", 12);
  const scatter = getParam(effect, "scatter", 30);
  const pitch = getParam(effect, "pitch", 0);
  const spray = getParam(effect, "spray", 20);
  const shimmer = getParam(effect, "shimmer", 0);
  const stereoWidth = getParam(effect, "stereoWidth", 70);
  const feedback = getParam(effect, "feedback", 0);
  const captureLen = getParam(effect, "captureLen", 500);
  const attack = getParam(effect, "attack", 5);
  const release = getParam(effect, "release", 40);
  const thru = getParam(effect, "thru", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const isFrozen = freeze >= 0.5;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#00bcd4" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 250,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#00bcd4", title: "Freeze" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 254,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-4 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onUpdateParameter("freeze", isFrozen ? 0 : 1),
            className: `px-8 py-3 text-sm font-bold rounded-lg transition-colors ${isFrozen ? "bg-cyan-600 text-text-primary ring-2 ring-cyan-400" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: isFrozen ? "FROZEN" : "LIVE"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 256,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onUpdateParameter("thru", thru >= 0.5 ? 0 : 1),
            className: `px-4 py-3 text-sm font-medium rounded-lg transition-colors ${thru >= 0.5 ? "bg-cyan-700 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
            children: "Thru"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 266,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 255,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 253,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#00bcd4", title: "Grains" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 281,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: grainSize,
            min: 5,
            max: 500,
            onChange: (v) => onUpdateParameter("grainSize", v),
            label: "Size",
            color: "#00bcd4",
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 283,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: density,
            min: 1,
            max: 50,
            onChange: (v) => onUpdateParameter("density", Math.round(v)),
            label: "Density",
            color: "#00bcd4",
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 285,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: scatter,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("scatter", v),
            label: "Scatter",
            color: "#00bcd4",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 287,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: spray,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("spray", v),
            label: "Spray",
            color: "#00bcd4",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 289,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 282,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 280,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#0097a7", title: "Character" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 296,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: pitch,
            min: -24,
            max: 24,
            onChange: (v) => onUpdateParameter("pitch", Math.round(v)),
            label: "Pitch",
            color: "#0097a7",
            formatValue: (v) => `${Math.round(v)}st`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 298,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: shimmer,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("shimmer", v),
            label: "Shimmer",
            color: "#0097a7",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 300,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: stereoWidth,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("stereoWidth", v),
            label: "Width",
            color: "#0097a7",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 302,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: feedback,
            min: 0,
            max: 95,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            color: "#0097a7",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 304,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 297,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 295,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#00838f", title: "Capture" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 311,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: captureLen,
            min: 50,
            max: 5e3,
            onChange: (v) => onUpdateParameter("captureLen", v),
            label: "Length",
            color: "#00838f",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}s` : `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 313,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: 1,
            max: 100,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            color: "#00838f",
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 316,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 1,
            max: 500,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#00838f",
            formatValue: (v) => `${Math.round(v)}ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
            lineNumber: 318,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 312,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 310,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#4dd0e1",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
        lineNumber: 326,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 325,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
      lineNumber: 324,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/AdditionalEffectEditors.tsx",
    lineNumber: 249,
    columnNumber: 5
  }, void 0);
};
const BUZZ_TYPE_MAP = {
  BuzzDistortion: "ArguruDistortion",
  BuzzOverdrive: "GeonikOverdrive",
  BuzzDistortion2: "JeskolaDistortion",
  BuzzDist2: "ElakDist2",
  BuzzSoftSat: "GraueSoftSat",
  BuzzStereoDist: "WhiteNoiseStereoDist",
  BuzzSVF: "ElakSVF",
  BuzzPhilta: "FSMPhilta",
  BuzzNotch: "CyanPhaseNotch",
  BuzzZfilter: "QZfilter",
  BuzzDelay: "JeskolaDelay",
  BuzzCrossDelay: "JeskolaCrossDelay",
  BuzzFreeverb: "JeskolaFreeverb",
  BuzzPanzerDelay: "FSMPanzerDelay",
  BuzzChorus: "FSMChorus",
  BuzzChorus2: "FSMChorus2",
  BuzzWhiteChorus: "WhiteNoiseWhiteChorus",
  BuzzFreqShift: "BigyoFrequencyShifter",
  BuzzCompressor: "GeonikCompressor",
  BuzzLimiter: "LdSLimit",
  BuzzExciter: "OomekExciter",
  BuzzMasterizer: "OomekMasterizer",
  BuzzStereoGain: "DedaCodeStereoGain"
};
const BuzzmachineEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const machineType = BUZZ_TYPE_MAP[effect.type];
  const info = machineType ? BUZZMACHINE_INFO[machineType] : void 0;
  const params = (info == null ? void 0 : info.parameters) ?? [];
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const rows = reactExports.useMemo(() => {
    const result = [];
    for (let i = 0; i < params.length; i += 4) {
      result.push(params.slice(i, i + 4));
    }
    return result;
  }, [params]);
  if (!info || params.length === 0) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#ff9800" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
        lineNumber: 64,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ff9800", title: effect.type }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
          lineNumber: 66,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted text-center", children: "No parameters available" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
          lineNumber: 67,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
        lineNumber: 65,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#ff9800",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
          lineNumber: 71,
          columnNumber: 13
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
        lineNumber: 70,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
        lineNumber: 69,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
      lineNumber: 63,
      columnNumber: 7
    }, void 0);
  }
  const formatParamValue = (value, min, max, isByte) => {
    if (isByte && max <= 1) return value >= 0.5 ? "ON" : "OFF";
    if (isByte && max <= 10) return `${Math.round(value)}`;
    const range = max - min;
    if (range <= 100) return `${Math.round(value)}`;
    if (range <= 1e3) return `${Math.round(value)}`;
    return `${Math.round(value)}`;
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#ff9800" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
      lineNumber: 90,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ff9800", title: info.name }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
        lineNumber: 93,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] text-text-muted text-center -mt-1 mb-2", children: [
        "by ",
        info.author
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
        lineNumber: 94,
        columnNumber: 9
      }, void 0),
      rows.map((row, rowIdx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end mb-3", children: row.map((param) => {
        const key = String(param.index);
        const value = typeof effect.parameters[key] === "number" ? effect.parameters[key] : param.defaultValue;
        const isByte = param.type === "byte";
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value,
            min: param.minValue,
            max: param.maxValue,
            onChange: (v) => onUpdateParameter(key, isByte ? Math.round(v) : v),
            label: param.name,
            color: "#ff9800",
            formatValue: (v) => formatParamValue(v, param.minValue, param.maxValue, isByte)
          },
          param.index,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
            lineNumber: 106,
            columnNumber: 17
          },
          void 0
        );
      }) }, rowIdx, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
        lineNumber: 97,
        columnNumber: 11
      }, void 0))
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
      lineNumber: 92,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#ffb74d",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
        lineNumber: 125,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
      lineNumber: 124,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
      lineNumber: 123,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/BuzzmachineEditor.tsx",
    lineNumber: 89,
    columnNumber: 5
  }, void 0);
};
function formatParamName(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
}
function inferParamRange(_key, value) {
  if (value < 0) return { min: -60, max: 12, step: 0.5, unit: "dB" };
  if (value > 100) return { min: 0, max: Math.max(value * 4, 1e3), step: 1, unit: "" };
  if (value >= 0 && value <= 1) return { min: 0, max: 1, step: 0.01, unit: "" };
  return { min: 0, max: 100, step: 1, unit: "%" };
}
const WASM_ACCENT = "#10b981";
const GenericEffectEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet
}) => {
  const params = Object.entries(effect.parameters).filter(
    ([, v]) => typeof v === "number"
  );
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: WASM_ACCENT }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
      lineNumber: 52,
      columnNumber: 7
    }, void 0),
    params.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: WASM_ACCENT, title: effect.type }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
        lineNumber: 56,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap justify-around items-end gap-y-4", children: params.map(([key, value]) => {
        const range = inferParamRange(key, value);
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value,
            min: range.min,
            max: range.max,
            step: range.step,
            onChange: (v) => onUpdateParameter(key, v),
            label: formatParamName(key),
            size: "md",
            color: WASM_ACCENT,
            formatValue: (v) => {
              if (range.max <= 1) return v.toFixed(2);
              if (range.unit === "dB") return `${v.toFixed(1)}dB`;
              return `${Math.round(v)}${range.unit}`;
            }
          },
          key,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
            lineNumber: 61,
            columnNumber: 17
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
        lineNumber: 57,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
      lineNumber: 55,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        size: "lg",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
        lineNumber: 85,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
      lineNumber: 84,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
      lineNumber: 83,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
    lineNumber: 51,
    columnNumber: 5
  }, void 0);
};
const WAMEffectEditor = ({
  effect,
  onUpdateWet
}) => {
  const guiContainerRef = reactExports.useRef(null);
  const [isLoading, setIsLoading] = reactExports.useState(true);
  const [hasGui, setHasGui] = reactExports.useState(false);
  reactExports.useEffect(() => {
    let isMounted = true;
    let currentGui = null;
    let resizeObserver = null;
    const mountGui = async () => {
      if (!guiContainerRef.current) return;
      guiContainerRef.current.innerHTML = "";
      setHasGui(false);
      setIsLoading(true);
      try {
        const engine = getToneEngine();
        let node = null;
        for (let attempt = 0; attempt < 25; attempt++) {
          node = engine.getMasterEffectNode(effect.id);
          if (node && node instanceof WAMEffectNode) break;
          node = null;
          await new Promise((r) => setTimeout(r, 200));
          if (!isMounted) return;
        }
        if (!node || !(node instanceof WAMEffectNode)) {
          if (isMounted) setIsLoading(false);
          return;
        }
        await node.ensureInitialized();
        if (!isMounted) return;
        const gui = await node.createGui();
        if (!gui || !isMounted || !guiContainerRef.current) {
          if (isMounted) setIsLoading(false);
          return;
        }
        currentGui = gui;
        setHasGui(true);
        guiContainerRef.current.appendChild(gui);
        const origClone = gui.cloneNode.bind(gui);
        gui.cloneNode = (deep) => {
          try {
            return origClone(deep);
          } catch {
            return document.createElement("div");
          }
        };
        const WAM_MIN_SCALE = {
          WAMQuadraFuzz: 1.3,
          WAMVoxAmp: 1.15
        };
        const WAM_NO_SCALE = /* @__PURE__ */ new Set([
          "WAMBigMuff",
          "WAMTS9",
          "WAMQuadraFuzz",
          "WAMPitchShifter"
        ]);
        const effectMinScale = WAM_MIN_SCALE[effect.type] ?? 0;
        const forceNoScale = WAM_NO_SCALE.has(effect.type);
        const tryResizeCanvasPlugin = (container) => {
          const shadow = gui.shadowRoot;
          if (!shadow) return false;
          const canvas = shadow.querySelector("canvas");
          if (!canvas) return false;
          const guiAny = gui;
          const cw = container.clientWidth;
          if (!cw || !guiAny.width) return false;
          const origW = 430;
          const origH = 250;
          const aspectRatio = origH / origW;
          const newWidth = cw;
          const newHeight = Math.round(newWidth * aspectRatio);
          canvas.width = newWidth;
          canvas.height = newHeight;
          const canvas2 = shadow.querySelectorAll("canvas")[1];
          if (canvas2) {
            canvas2.width = newWidth;
            canvas2.height = newHeight;
          }
          guiAny.width = newWidth;
          guiAny.height = newHeight;
          guiAny.pixelsPerDb = 0.5 * newHeight / (guiAny.dbScale || 60);
          const canvasParent = shadow.querySelector("#DivFilterBank");
          if (canvasParent) {
            canvasParent.style.width = `${newWidth}px`;
            canvasParent.style.height = `${newHeight}px`;
          }
          container.style.height = `${newHeight + 20}px`;
          if (typeof guiAny.draw === "function") guiAny.draw();
          return true;
        };
        let naturalW = 0;
        let naturalH = 0;
        let isCanvasPlugin = false;
        const scaleToFit = () => {
          const container = guiContainerRef.current;
          if (!container || !gui) return;
          if (forceNoScale) {
            gui.style.zoom = "";
            gui.style.transform = "";
            gui.style.position = "relative";
            gui.style.margin = "0 auto";
            gui.style.display = "block";
            const h = gui.offsetHeight || gui.scrollHeight || gui.clientHeight;
            if (h) container.style.height = `${h + 8}px`;
            return;
          }
          if (isCanvasPlugin || tryResizeCanvasPlugin(container)) {
            isCanvasPlugin = true;
            gui.style.zoom = "";
            gui.style.transform = "";
            tryResizeCanvasPlugin(container);
            return;
          }
          if (!naturalW || !naturalH) {
            gui.style.zoom = "";
            gui.style.transform = "";
            gui.style.position = "";
            gui.style.left = "";
            gui.style.top = "";
            naturalW = gui.offsetWidth || gui.scrollWidth || gui.clientWidth;
            naturalH = gui.offsetHeight || gui.scrollHeight || gui.clientHeight;
            if (!naturalW || !naturalH) return;
          }
          const cw = container.clientWidth;
          if (!cw) return;
          const scale = Math.max(effectMinScale, cw / naturalW);
          const scaledH = naturalH * scale;
          container.style.height = `${Math.max(scaledH, 200)}px`;
          gui.style.zoom = `${scale}`;
        };
        resizeObserver = new ResizeObserver(scaleToFit);
        resizeObserver.observe(guiContainerRef.current);
        requestAnimationFrame(scaleToFit);
        setTimeout(scaleToFit, 300);
        setTimeout(scaleToFit, 800);
        setTimeout(scaleToFit, 1500);
      } catch (err) {
        console.warn("[WAMEffectEditor] Failed to load GUI:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    mountGui();
    return () => {
      isMounted = false;
      resizeObserver == null ? void 0 : resizeObserver.disconnect();
      if (currentGui == null ? void 0 : currentGui.parentElement) {
        currentGui.parentElement.removeChild(currentGui);
      }
    };
  }, [effect.id]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        ref: guiContainerRef,
        className: "bg-black rounded-lg border border-dark-border overflow-visible relative flex justify-center",
        style: { minHeight: hasGui ? 200 : 0, display: hasGui || isLoading ? "flex" : "none" }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
        lineNumber: 313,
        columnNumber: 7
      },
      void 0
    ),
    isLoading && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center py-8 text-text-muted text-xs", children: "Loading plugin interface..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
      lineNumber: 319,
      columnNumber: 9
    }, void 0),
    !hasGui && !isLoading && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center text-text-muted text-xs py-4", children: "Plugin did not provide a native GUI." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
      lineNumber: 324,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#6b7280", title: "Mix" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
        lineNumber: 330,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          size: "lg",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
          lineNumber: 332,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
        lineNumber: 331,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
      lineNumber: 329,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/WAMEffectEditor.tsx",
    lineNumber: 311,
    columnNumber: 5
  }, void 0);
};
const DYN_PRIMARY = "#3b82f6";
const DYN_SECONDARY = "#60a5fa";
const DYN_TERTIARY = "#93c5fd";
const DYN_ACCENT = "#2563eb";
const Section$2 = ({ children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
  lineNumber: 23,
  columnNumber: 3
}, void 0);
const NoiseGateEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, "threshold", -40);
  const attack = getParam(effect, "attack", 0.5);
  const hold = getParam(effect, "hold", 50);
  const release = getParam(effect, "release", 100);
  const range = getParam(effect, "range", 0);
  const hpf = getParam(effect, "hpf", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: DYN_PRIMARY }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 43,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: DYN_PRIMARY, title: "Gate" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 45,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: threshold,
            min: -80,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Threshold",
            color: DYN_PRIMARY,
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 47,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: range,
            min: -80,
            max: 0,
            onChange: (v) => onUpdateParameter("range", v),
            label: "Range",
            color: DYN_PRIMARY,
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 49,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 46,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 44,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: DYN_SECONDARY, title: "Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 54,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: 0.1,
            max: 50,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            color: DYN_SECONDARY,
            formatValue: (v) => `${v.toFixed(1)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 56,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: hold,
            min: 0,
            max: 500,
            onChange: (v) => onUpdateParameter("hold", v),
            label: "Hold",
            color: DYN_SECONDARY,
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 58,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 1,
            max: 2e3,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: DYN_SECONDARY,
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 60,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 55,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 53,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-8 items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: hpf,
          min: 0,
          max: 2e3,
          onChange: (v) => onUpdateParameter("hpf", v),
          label: "Sidechain HPF",
          color: DYN_TERTIARY,
          formatValue: (v) => `${Math.round(v)} Hz`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 66,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 68,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 65,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 64,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 42,
    columnNumber: 5
  }, void 0);
};
const LimiterEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, "threshold", -1);
  const ceiling = getParam(effect, "ceiling", -0.3);
  const attack = getParam(effect, "attack", 5);
  const release = getParam(effect, "release", 50);
  const lookahead = getParam(effect, "lookahead", 5);
  const knee = getParam(effect, "knee", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: DYN_ACCENT }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 91,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: DYN_ACCENT, title: "Limiter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 93,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: threshold,
            min: -24,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Threshold",
            color: DYN_ACCENT,
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 95,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ceiling,
            min: -12,
            max: 0,
            onChange: (v) => onUpdateParameter("ceiling", v),
            label: "Ceiling",
            color: DYN_ACCENT,
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 97,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: knee,
            min: 0,
            max: 12,
            onChange: (v) => onUpdateParameter("knee", v),
            label: "Knee",
            color: DYN_SECONDARY,
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 99,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 94,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 92,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: DYN_SECONDARY, title: "Timing" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 104,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: 0.1,
            max: 50,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            color: DYN_SECONDARY,
            formatValue: (v) => `${v.toFixed(1)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 106,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 500,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: DYN_SECONDARY,
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 108,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lookahead,
            min: 0,
            max: 20,
            onChange: (v) => onUpdateParameter("lookahead", v),
            label: "Lookahead",
            color: DYN_SECONDARY,
            formatValue: (v) => `${v.toFixed(1)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 110,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 105,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 103,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 116,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 115,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 114,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 90,
    columnNumber: 5
  }, void 0);
};
const MonoCompEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, "threshold", -12);
  const ratio = getParam(effect, "ratio", 4);
  const attack = getParam(effect, "attack", 10);
  const release = getParam(effect, "release", 100);
  const knee = getParam(effect, "knee", 6);
  const makeup = getParam(effect, "makeup", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: DYN_PRIMARY }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 139,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: DYN_PRIMARY, title: "Compressor" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 141,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: threshold,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Threshold",
            color: DYN_PRIMARY,
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 143,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ratio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("ratio", v),
            label: "Ratio",
            color: DYN_PRIMARY,
            formatValue: (v) => `${v.toFixed(1)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 145,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: knee,
            min: 0,
            max: 12,
            onChange: (v) => onUpdateParameter("knee", v),
            label: "Knee",
            color: DYN_SECONDARY,
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 147,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 142,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 140,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: DYN_SECONDARY, title: "Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 152,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: 0.1,
            max: 200,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            color: DYN_SECONDARY,
            formatValue: (v) => `${v.toFixed(1)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 154,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 2e3,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: DYN_SECONDARY,
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 156,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: makeup,
            min: -12,
            max: 24,
            onChange: (v) => onUpdateParameter("makeup", v),
            label: "Makeup",
            color: DYN_TERTIARY,
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 158,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 153,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 151,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 164,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 163,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 162,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 138,
    columnNumber: 5
  }, void 0);
};
const ExpanderEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, "threshold", -30);
  const ratio = getParam(effect, "ratio", 2);
  const attack = getParam(effect, "attack", 1);
  const release = getParam(effect, "release", 100);
  const range = getParam(effect, "range", -60);
  const knee = getParam(effect, "knee", 6);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#8b5cf6" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 187,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#8b5cf6", title: "Expander" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 189,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: threshold,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Threshold",
            color: "#8b5cf6",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 191,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ratio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("ratio", v),
            label: "Ratio",
            color: "#8b5cf6",
            formatValue: (v) => `${v.toFixed(1)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 193,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: range,
            min: -80,
            max: 0,
            onChange: (v) => onUpdateParameter("range", v),
            label: "Range",
            color: "#a78bfa",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 195,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: knee,
            min: 0,
            max: 12,
            onChange: (v) => onUpdateParameter("knee", v),
            label: "Knee",
            color: "#a78bfa",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 197,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 190,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 188,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a78bfa", title: "Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 202,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: 0.1,
            max: 100,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            color: "#a78bfa",
            formatValue: (v) => `${v.toFixed(1)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 204,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 2e3,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#a78bfa",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 206,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 203,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 201,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 212,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 211,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 210,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 186,
    columnNumber: 5
  }, void 0);
};
const ClipperEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const inputGain = getParam(effect, "inputGain", 0);
  const ceiling = getParam(effect, "ceiling", -1);
  const softness = getParam(effect, "softness", 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#ef4444" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 232,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ef4444", title: "Clipper" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 234,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: inputGain,
            min: -12,
            max: 24,
            onChange: (v) => onUpdateParameter("inputGain", v),
            label: "Input",
            color: "#ef4444",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 236,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ceiling,
            min: -24,
            max: 0,
            onChange: (v) => onUpdateParameter("ceiling", v),
            label: "Ceiling",
            color: "#f87171",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 238,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: softness,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("softness", v),
            label: "Softness",
            color: "#fca5a5",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 240,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 235,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 233,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 246,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 245,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 244,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 231,
    columnNumber: 5
  }, void 0);
};
const DeEsserEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const frequency = getParam(effect, "frequency", 6e3);
  const bandwidth = getParam(effect, "bandwidth", 1);
  const threshold = getParam(effect, "threshold", -20);
  const ratio = getParam(effect, "ratio", 4);
  const attack = getParam(effect, "attack", 1);
  const release = getParam(effect, "release", 50);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#06b6d4" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 269,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#06b6d4", title: "Detection" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 271,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: 2e3,
            max: 12e3,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Frequency",
            color: "#06b6d4",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 273,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: bandwidth,
            min: 0.1,
            max: 4,
            onChange: (v) => onUpdateParameter("bandwidth", v),
            label: "Bandwidth",
            color: "#22d3ee",
            formatValue: (v) => `${v.toFixed(1)} oct`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 275,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 272,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 270,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#22d3ee", title: "Reduction" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 280,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: threshold,
            min: -40,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Threshold",
            color: "#22d3ee",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 282,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ratio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("ratio", v),
            label: "Ratio",
            color: "#67e8f9",
            formatValue: (v) => `${v.toFixed(1)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 284,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: 0.1,
            max: 20,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            color: "#67e8f9",
            formatValue: (v) => `${v.toFixed(1)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 286,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 500,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#67e8f9",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 288,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 281,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 279,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 294,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 293,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 292,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 268,
    columnNumber: 5
  }, void 0);
};
const MultibandCompEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, "lowCrossover", 200);
  const highCross = getParam(effect, "highCrossover", 3e3);
  const lowThresh = getParam(effect, "lowThreshold", -20);
  const midThresh = getParam(effect, "midThreshold", -20);
  const highThresh = getParam(effect, "highThreshold", -20);
  const lowRatio = getParam(effect, "lowRatio", 4);
  const midRatio = getParam(effect, "midRatio", 4);
  const highRatio = getParam(effect, "highRatio", 4);
  const lowGain = getParam(effect, "lowGain", 1);
  const midGain = getParam(effect, "midGain", 1);
  const highGain = getParam(effect, "highGain", 1);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: DYN_PRIMARY }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 322,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: DYN_PRIMARY, title: "Crossover" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 324,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowCross,
            min: 40,
            max: 1e3,
            onChange: (v) => onUpdateParameter("lowCrossover", v),
            label: "Low X",
            color: DYN_PRIMARY,
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 326,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highCross,
            min: 500,
            max: 1e4,
            onChange: (v) => onUpdateParameter("highCrossover", v),
            label: "High X",
            color: DYN_SECONDARY,
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 328,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 325,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 323,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: DYN_PRIMARY, title: "Low Band" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 333,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("lowThreshold", v),
            label: "Thresh",
            color: DYN_PRIMARY,
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 335,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowRatio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("lowRatio", v),
            label: "Ratio",
            color: DYN_PRIMARY,
            formatValue: (v) => `${v.toFixed(1)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 337,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowGain,
            min: 0,
            max: 4,
            onChange: (v) => onUpdateParameter("lowGain", v),
            label: "Gain",
            color: DYN_PRIMARY,
            formatValue: (v) => `${v.toFixed(2)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 339,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 334,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 332,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: DYN_SECONDARY, title: "Mid Band" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 344,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("midThreshold", v),
            label: "Thresh",
            color: DYN_SECONDARY,
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 346,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midRatio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("midRatio", v),
            label: "Ratio",
            color: DYN_SECONDARY,
            formatValue: (v) => `${v.toFixed(1)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 348,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midGain,
            min: 0,
            max: 4,
            onChange: (v) => onUpdateParameter("midGain", v),
            label: "Gain",
            color: DYN_SECONDARY,
            formatValue: (v) => `${v.toFixed(2)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 350,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 345,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 343,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: DYN_TERTIARY, title: "High Band" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 355,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("highThreshold", v),
            label: "Thresh",
            color: DYN_TERTIARY,
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 357,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highRatio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("highRatio", v),
            label: "Ratio",
            color: DYN_TERTIARY,
            formatValue: (v) => `${v.toFixed(1)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 359,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highGain,
            min: 0,
            max: 4,
            onChange: (v) => onUpdateParameter("highGain", v),
            label: "Gain",
            color: DYN_TERTIARY,
            formatValue: (v) => `${v.toFixed(2)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 361,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 356,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 354,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 367,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 366,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 365,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 321,
    columnNumber: 5
  }, void 0);
};
const TransientDesignerEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const attack = getParam(effect, "attack", 0);
  const sustain = getParam(effect, "sustain", 0);
  const output = getParam(effect, "output", 1);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#f59e0b" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 387,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#f59e0b", title: "Transient" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 389,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: -100,
            max: 100,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            color: "#f59e0b",
            formatValue: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 391,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: sustain,
            min: -100,
            max: 100,
            onChange: (v) => onUpdateParameter("sustain", v),
            label: "Sustain",
            color: "#fbbf24",
            formatValue: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 393,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: output,
            min: 0,
            max: 2,
            onChange: (v) => onUpdateParameter("output", v),
            label: "Output",
            color: "#fcd34d",
            formatValue: (v) => `${v.toFixed(2)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 395,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 390,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 388,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 401,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 400,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 399,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 386,
    columnNumber: 5
  }, void 0);
};
const DynamicsProcEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowerThresh = getParam(effect, "lowerThresh", -40);
  const upperThresh = getParam(effect, "upperThresh", -12);
  const ratio = getParam(effect, "ratio", 4);
  const attack = getParam(effect, "attack", 10);
  const release = getParam(effect, "release", 100);
  const makeup = getParam(effect, "makeup", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#7c3aed" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 424,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c3aed", title: "Dynamics" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 426,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowerThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("lowerThresh", v),
            label: "Lower",
            color: "#7c3aed",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 428,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: upperThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("upperThresh", v),
            label: "Upper",
            color: "#8b5cf6",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 430,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ratio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("ratio", v),
            label: "Ratio",
            color: "#a78bfa",
            formatValue: (v) => `${v.toFixed(1)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 432,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 427,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 425,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a78bfa", title: "Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 437,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: 0.1,
            max: 200,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            color: "#a78bfa",
            formatValue: (v) => `${v.toFixed(1)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 439,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 2e3,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#c4b5fd",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 441,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: makeup,
            min: -12,
            max: 24,
            onChange: (v) => onUpdateParameter("makeup", v),
            label: "Makeup",
            color: "#c4b5fd",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 443,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 438,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 436,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 449,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 448,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 447,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 423,
    columnNumber: 5
  }, void 0);
};
const X42CompEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, "threshold", -20);
  const ratio = getParam(effect, "ratio", 4);
  const attack = getParam(effect, "attack", 10);
  const release = getParam(effect, "release", 100);
  const hold = getParam(effect, "hold", 0);
  const inputGain = getParam(effect, "inputGain", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#059669" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 472,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#059669", title: "X42 Comp" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 474,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: threshold,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Threshold",
            color: "#059669",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 476,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ratio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("ratio", v),
            label: "Ratio",
            color: "#059669",
            formatValue: (v) => `${v.toFixed(1)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 478,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: inputGain,
            min: -12,
            max: 12,
            onChange: (v) => onUpdateParameter("inputGain", v),
            label: "Input",
            color: "#10b981",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 480,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 475,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 473,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#10b981", title: "Timing" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 485,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: 0.1,
            max: 200,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            color: "#10b981",
            formatValue: (v) => `${v.toFixed(1)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 487,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: hold,
            min: 0,
            max: 500,
            onChange: (v) => onUpdateParameter("hold", v),
            label: "Hold",
            color: "#34d399",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 489,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 2e3,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#34d399",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 491,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 486,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 484,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 497,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 496,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 495,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 471,
    columnNumber: 5
  }, void 0);
};
const GOTTCompEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, "lowCross", 200);
  const highCross = getParam(effect, "highCross", 4e3);
  const lowThresh = getParam(effect, "lowThresh", -18);
  const midThresh = getParam(effect, "midThresh", -18);
  const highThresh = getParam(effect, "highThresh", -18);
  const lowRatio = getParam(effect, "lowRatio", 4);
  const midRatio = getParam(effect, "midRatio", 4);
  const highRatio = getParam(effect, "highRatio", 4);
  const attack = getParam(effect, "attack", 10);
  const release = getParam(effect, "release", 100);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#dc2626" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 524,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#dc2626", title: "Crossover" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 526,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowCross,
            min: 40,
            max: 1e3,
            onChange: (v) => onUpdateParameter("lowCross", v),
            label: "Low X",
            color: "#dc2626",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 528,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highCross,
            min: 500,
            max: 12e3,
            onChange: (v) => onUpdateParameter("highCross", v),
            label: "High X",
            color: "#ef4444",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 530,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 527,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 525,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ef4444", title: "Bands" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 535,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("lowThresh", v),
            label: "Low Thr",
            color: "#dc2626",
            formatValue: (v) => `${v.toFixed(0)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 537,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowRatio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("lowRatio", v),
            label: "Low Rat",
            color: "#dc2626",
            formatValue: (v) => `${v.toFixed(0)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 539,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("midThresh", v),
            label: "Mid Thr",
            color: "#ef4444",
            formatValue: (v) => `${v.toFixed(0)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 541,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midRatio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("midRatio", v),
            label: "Mid Rat",
            color: "#ef4444",
            formatValue: (v) => `${v.toFixed(0)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 543,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("highThresh", v),
            label: "Hi Thr",
            color: "#f87171",
            formatValue: (v) => `${v.toFixed(0)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 545,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highRatio,
            min: 1,
            max: 20,
            onChange: (v) => onUpdateParameter("highRatio", v),
            label: "Hi Rat",
            color: "#f87171",
            formatValue: (v) => `${v.toFixed(0)}:1`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 547,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 536,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 534,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: attack,
          min: 0.1,
          max: 200,
          onChange: (v) => onUpdateParameter("attack", v),
          label: "Attack",
          color: "#fca5a5",
          formatValue: (v) => `${v.toFixed(1)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 553,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: release,
          min: 5,
          max: 2e3,
          onChange: (v) => onUpdateParameter("release", v),
          label: "Release",
          color: "#fca5a5",
          formatValue: (v) => `${Math.round(v)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 555,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 557,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 552,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 551,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 523,
    columnNumber: 5
  }, void 0);
};
const SidechainGateEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, "threshold", -30);
  const attack = getParam(effect, "attack", 1);
  const hold = getParam(effect, "hold", 50);
  const release = getParam(effect, "release", 200);
  const range = getParam(effect, "range", 0);
  const scFreq = getParam(effect, "scFreq", 200);
  const scQ = getParam(effect, "scQ", 1);
  const sidechainSource = getParam(effect, "sidechainSource", -1);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const channelCount = useTrackerStore((s) => {
    var _a;
    return ((_a = s.patterns[0]) == null ? void 0 : _a.channels.length) ?? 8;
  });
  const channelNames = useTrackerStore(useShallow(
    (s) => {
      var _a;
      return ((_a = s.patterns[0]) == null ? void 0 : _a.channels.map((ch, i) => ch.name || `CH ${i + 1}`)) ?? [];
    }
  ));
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#0891b2" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 587,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#0891b2", title: "Gate" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 589,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: threshold,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Threshold",
            color: "#0891b2",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 591,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: range,
            min: -80,
            max: 0,
            onChange: (v) => onUpdateParameter("range", v),
            label: "Range",
            color: "#06b6d4",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 593,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 590,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 588,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#06b6d4", title: "Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 598,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: attack,
            min: 0.1,
            max: 100,
            onChange: (v) => onUpdateParameter("attack", v),
            label: "Attack",
            color: "#06b6d4",
            formatValue: (v) => `${v.toFixed(1)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 600,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: hold,
            min: 0,
            max: 500,
            onChange: (v) => onUpdateParameter("hold", v),
            label: "Hold",
            color: "#22d3ee",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 602,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 2e3,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#22d3ee",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 604,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 599,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 597,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#22d3ee", title: "Sidechain" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 609,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1.5", children: "Sidechain Source" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 611,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(Math.round(sidechainSource)),
            onChange: (v) => onUpdateParameter("sidechainSource", Number(v)),
            options: [
              { value: "-1", label: "Self (Internal)" },
              ...Array.from({ length: channelCount }, (_, i) => ({
                value: String(i),
                label: channelNames[i] || `CH ${i + 1}`
              }))
            ],
            className: "w-full bg-black/60 border border-dark-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:border-cyan-500 focus:outline-none"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 612,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 610,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: scFreq,
            min: 20,
            max: 1e4,
            onChange: (v) => onUpdateParameter("scFreq", v),
            label: "SC Freq",
            color: "#22d3ee",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 626,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: scQ,
            min: 0.1,
            max: 10,
            onChange: (v) => onUpdateParameter("scQ", v),
            label: "SC Q",
            color: "#67e8f9",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 628,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 630,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 625,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 608,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 586,
    columnNumber: 5
  }, void 0);
};
const SidechainLimiterEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const ceiling = getParam(effect, "ceiling", -1);
  const release = getParam(effect, "release", 50);
  const scFreq = getParam(effect, "scFreq", 1e3);
  const scGain = getParam(effect, "scGain", 0);
  const sidechainSource = getParam(effect, "sidechainSource", -1);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const channelCount = useTrackerStore((s) => {
    var _a;
    return ((_a = s.patterns[0]) == null ? void 0 : _a.channels.length) ?? 8;
  });
  const channelNames = useTrackerStore(useShallow(
    (s) => {
      var _a;
      return ((_a = s.patterns[0]) == null ? void 0 : _a.channels.map((ch, i) => ch.name || `CH ${i + 1}`)) ?? [];
    }
  ));
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#0e7490" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 657,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#0e7490", title: "Limiter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 659,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ceiling,
            min: -12,
            max: 0,
            onChange: (v) => onUpdateParameter("ceiling", v),
            label: "Ceiling",
            color: "#0e7490",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 661,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 500,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#0891b2",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 663,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 660,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 658,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#06b6d4", title: "Sidechain" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 668,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1.5", children: "Sidechain Source" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 670,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(Math.round(sidechainSource)),
            onChange: (v) => onUpdateParameter("sidechainSource", Number(v)),
            options: [
              { value: "-1", label: "Self (Internal)" },
              ...Array.from({ length: channelCount }, (_, i) => ({
                value: String(i),
                label: channelNames[i] || `CH ${i + 1}`
              }))
            ],
            className: "w-full bg-black/60 border border-dark-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:border-cyan-500 focus:outline-none"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 671,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 669,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: scFreq,
            min: 20,
            max: 1e4,
            onChange: (v) => onUpdateParameter("scFreq", v),
            label: "SC Freq",
            color: "#06b6d4",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 685,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: scGain,
            min: -12,
            max: 12,
            onChange: (v) => onUpdateParameter("scGain", v),
            label: "SC Gain",
            color: "#22d3ee",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 687,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 689,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 684,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 667,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 656,
    columnNumber: 5
  }, void 0);
};
const MultibandGateEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, "lowCross", 200);
  const highCross = getParam(effect, "highCross", 3e3);
  const lowThresh = getParam(effect, "lowThresh", -40);
  const midThresh = getParam(effect, "midThresh", -40);
  const highThresh = getParam(effect, "highThresh", -40);
  const attack = getParam(effect, "attack", 1);
  const release = getParam(effect, "release", 200);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#0284c7" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 713,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#0284c7", title: "Crossover" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 715,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowCross,
            min: 40,
            max: 1e3,
            onChange: (v) => onUpdateParameter("lowCross", v),
            label: "Low X",
            color: "#0284c7",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 717,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highCross,
            min: 500,
            max: 1e4,
            onChange: (v) => onUpdateParameter("highCross", v),
            label: "High X",
            color: "#0ea5e9",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 719,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 716,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 714,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#0ea5e9", title: "Band Thresholds" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 724,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowThresh,
            min: -80,
            max: 0,
            onChange: (v) => onUpdateParameter("lowThresh", v),
            label: "Low",
            color: "#0284c7",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 726,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midThresh,
            min: -80,
            max: 0,
            onChange: (v) => onUpdateParameter("midThresh", v),
            label: "Mid",
            color: "#0ea5e9",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 728,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highThresh,
            min: -80,
            max: 0,
            onChange: (v) => onUpdateParameter("highThresh", v),
            label: "High",
            color: "#38bdf8",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 730,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 725,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 723,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: attack,
          min: 0.1,
          max: 100,
          onChange: (v) => onUpdateParameter("attack", v),
          label: "Attack",
          color: "#7dd3fc",
          formatValue: (v) => `${v.toFixed(1)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 736,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: release,
          min: 5,
          max: 2e3,
          onChange: (v) => onUpdateParameter("release", v),
          label: "Release",
          color: "#7dd3fc",
          formatValue: (v) => `${Math.round(v)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 738,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 740,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 735,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 734,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 712,
    columnNumber: 5
  }, void 0);
};
const MultibandLimiterEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, "lowCross", 200);
  const highCross = getParam(effect, "highCross", 3e3);
  const lowCeil = getParam(effect, "lowCeil", -1);
  const midCeil = getParam(effect, "midCeil", -1);
  const highCeil = getParam(effect, "highCeil", -1);
  const lowGain = getParam(effect, "lowGain", 1);
  const midGain = getParam(effect, "midGain", 1);
  const highGain = getParam(effect, "highGain", 1);
  const release = getParam(effect, "release", 50);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#4338ca" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 766,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#4338ca", title: "Crossover" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 768,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowCross,
            min: 40,
            max: 1e3,
            onChange: (v) => onUpdateParameter("lowCross", v),
            label: "Low X",
            color: "#4338ca",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 770,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highCross,
            min: 500,
            max: 1e4,
            onChange: (v) => onUpdateParameter("highCross", v),
            label: "High X",
            color: "#6366f1",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 772,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 769,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 767,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#6366f1", title: "Band Ceilings" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 777,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowCeil,
            min: -12,
            max: 0,
            onChange: (v) => onUpdateParameter("lowCeil", v),
            label: "Low",
            color: "#4338ca",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 779,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midCeil,
            min: -12,
            max: 0,
            onChange: (v) => onUpdateParameter("midCeil", v),
            label: "Mid",
            color: "#6366f1",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 781,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highCeil,
            min: -12,
            max: 0,
            onChange: (v) => onUpdateParameter("highCeil", v),
            label: "High",
            color: "#818cf8",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 783,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 778,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 776,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#818cf8", title: "Band Gains" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 788,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowGain,
            min: 0,
            max: 4,
            onChange: (v) => onUpdateParameter("lowGain", v),
            label: "Low",
            color: "#4338ca",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 790,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midGain,
            min: 0,
            max: 4,
            onChange: (v) => onUpdateParameter("midGain", v),
            label: "Mid",
            color: "#6366f1",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 792,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highGain,
            min: 0,
            max: 4,
            onChange: (v) => onUpdateParameter("highGain", v),
            label: "High",
            color: "#818cf8",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 794,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 500,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#a5b4fc",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 796,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 789,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 787,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 802,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 801,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 800,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 765,
    columnNumber: 5
  }, void 0);
};
const MaximizerEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const ceiling = getParam(effect, "ceiling", -0.3);
  const release = getParam(effect, "release", 50);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#b91c1c" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 821,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#b91c1c", title: "Maximizer" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 823,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ceiling,
            min: -24,
            max: 0,
            onChange: (v) => onUpdateParameter("ceiling", v),
            label: "Ceiling",
            color: "#b91c1c",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 825,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 500,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#dc2626",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 827,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 829,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 824,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 822,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 820,
    columnNumber: 5
  }, void 0);
};
const AGCEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const target = getParam(effect, "target", -12);
  const speed = getParam(effect, "speed", 0.1);
  const maxGain = getParam(effect, "maxGain", 12);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#16a34a" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 849,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#16a34a", title: "Auto Gain" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 851,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: target,
            min: -24,
            max: 0,
            onChange: (v) => onUpdateParameter("target", v),
            label: "Target",
            color: "#16a34a",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 853,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: speed,
            min: 0.01,
            max: 1,
            onChange: (v) => onUpdateParameter("speed", v),
            label: "Speed",
            color: "#22c55e",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 855,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: maxGain,
            min: 0,
            max: 24,
            onChange: (v) => onUpdateParameter("maxGain", v),
            label: "Max Gain",
            color: "#4ade80",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 857,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 852,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 850,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 863,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 862,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 861,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 848,
    columnNumber: 5
  }, void 0);
};
const BeatBreatherEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const transientBoost = getParam(effect, "transientBoost", 0);
  const sustainBoost = getParam(effect, "sustainBoost", 0);
  const sensitivity = getParam(effect, "sensitivity", 0.5);
  const attack = getParam(effect, "attack", 5);
  const release = getParam(effect, "release", 100);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#ea580c" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 885,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ea580c", title: "Beat Breather" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 887,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: transientBoost,
            min: -12,
            max: 12,
            onChange: (v) => onUpdateParameter("transientBoost", v),
            label: "Transient",
            color: "#ea580c",
            formatValue: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 889,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: sustainBoost,
            min: -12,
            max: 12,
            onChange: (v) => onUpdateParameter("sustainBoost", v),
            label: "Sustain",
            color: "#f97316",
            formatValue: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 891,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: sensitivity,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("sensitivity", v),
            label: "Sense",
            color: "#fb923c",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 893,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 888,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 886,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: attack,
          min: 0.5,
          max: 50,
          onChange: (v) => onUpdateParameter("attack", v),
          label: "Attack",
          color: "#fdba74",
          formatValue: (v) => `${v.toFixed(1)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 899,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: release,
          min: 5,
          max: 1e3,
          onChange: (v) => onUpdateParameter("release", v),
          label: "Release",
          color: "#fdba74",
          formatValue: (v) => `${Math.round(v)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 901,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 903,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 898,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 897,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 884,
    columnNumber: 5
  }, void 0);
};
const DuckaEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, "threshold", -20);
  const drop = getParam(effect, "drop", 0.5);
  const release = getParam(effect, "release", 200);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#7c2d12" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 923,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c2d12", title: "Ducka" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 925,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: threshold,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Threshold",
            color: "#7c2d12",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 927,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: drop,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("drop", v),
            label: "Drop",
            color: "#9a3412",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 929,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 2e3,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#c2410c",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 931,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 933,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 926,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 924,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 922,
    columnNumber: 5
  }, void 0);
};
const PandaEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, "threshold", -20);
  const factor = getParam(effect, "factor", 0.5);
  const release = getParam(effect, "release", 100);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#1e3a5f" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 953,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#1e3a5f", title: "Panda" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 955,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: threshold,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Threshold",
            color: "#1e3a5f",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 957,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: factor,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("factor", v),
            label: "Factor",
            color: "#2563eb",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 959,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: release,
            min: 5,
            max: 2e3,
            onChange: (v) => onUpdateParameter("release", v),
            label: "Release",
            color: "#3b82f6",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 961,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 963,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 956,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 954,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 952,
    columnNumber: 5
  }, void 0);
};
const MultibandClipperEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, "lowCross", 200);
  const highCross = getParam(effect, "highCross", 4e3);
  const lowCeil = getParam(effect, "lowCeil", -3);
  const midCeil = getParam(effect, "midCeil", -3);
  const highCeil = getParam(effect, "highCeil", -3);
  const softness = getParam(effect, "softness", 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#be123c" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 986,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#be123c", title: "Crossover" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 988,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowCross,
            min: 40,
            max: 1e3,
            onChange: (v) => onUpdateParameter("lowCross", v),
            label: "Low X",
            color: "#be123c",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 990,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highCross,
            min: 500,
            max: 12e3,
            onChange: (v) => onUpdateParameter("highCross", v),
            label: "High X",
            color: "#e11d48",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 992,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 989,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 987,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#e11d48", title: "Band Ceilings" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 997,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowCeil,
            min: -12,
            max: 0,
            onChange: (v) => onUpdateParameter("lowCeil", v),
            label: "Low",
            color: "#be123c",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 999,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midCeil,
            min: -12,
            max: 0,
            onChange: (v) => onUpdateParameter("midCeil", v),
            label: "Mid",
            color: "#e11d48",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1001,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highCeil,
            min: -12,
            max: 0,
            onChange: (v) => onUpdateParameter("highCeil", v),
            label: "High",
            color: "#f43f5e",
            formatValue: (v) => `${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1003,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: softness,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("softness", v),
            label: "Soft",
            color: "#fb7185",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1005,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 998,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 996,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1011,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1010,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1009,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 985,
    columnNumber: 5
  }, void 0);
};
const MultibandDynamicsEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, "lowCross", 200);
  const highCross = getParam(effect, "highCross", 4e3);
  const lowExpThresh = getParam(effect, "lowExpThresh", -40);
  const midExpThresh = getParam(effect, "midExpThresh", -40);
  const highExpThresh = getParam(effect, "highExpThresh", -40);
  const lowCompThresh = getParam(effect, "lowCompThresh", -12);
  const midCompThresh = getParam(effect, "midCompThresh", -12);
  const highCompThresh = getParam(effect, "highCompThresh", -12);
  const ratio = getParam(effect, "ratio", 4);
  const attack = getParam(effect, "attack", 10);
  const release = getParam(effect, "release", 100);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#4c1d95" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1039,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#4c1d95", title: "Crossover" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1041,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowCross,
            min: 40,
            max: 1e3,
            onChange: (v) => onUpdateParameter("lowCross", v),
            label: "Low X",
            color: "#4c1d95",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1043,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highCross,
            min: 500,
            max: 12e3,
            onChange: (v) => onUpdateParameter("highCross", v),
            label: "High X",
            color: "#6d28d9",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1045,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1042,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1040,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#6d28d9", title: "Expander Thresholds" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1050,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowExpThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("lowExpThresh", v),
            label: "Low",
            color: "#4c1d95",
            formatValue: (v) => `${v.toFixed(0)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1052,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midExpThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("midExpThresh", v),
            label: "Mid",
            color: "#6d28d9",
            formatValue: (v) => `${v.toFixed(0)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1054,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highExpThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("highExpThresh", v),
            label: "High",
            color: "#7c3aed",
            formatValue: (v) => `${v.toFixed(0)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1056,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1051,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1049,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c3aed", title: "Compressor Thresholds" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1061,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowCompThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("lowCompThresh", v),
            label: "Low",
            color: "#6d28d9",
            formatValue: (v) => `${v.toFixed(0)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1063,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midCompThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("midCompThresh", v),
            label: "Mid",
            color: "#7c3aed",
            formatValue: (v) => `${v.toFixed(0)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1065,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highCompThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("highCompThresh", v),
            label: "High",
            color: "#8b5cf6",
            formatValue: (v) => `${v.toFixed(0)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1067,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1062,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1060,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: ratio,
          min: 1,
          max: 20,
          onChange: (v) => onUpdateParameter("ratio", v),
          label: "Ratio",
          color: "#a78bfa",
          formatValue: (v) => `${v.toFixed(1)}:1`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 1073,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: attack,
          min: 0.1,
          max: 200,
          onChange: (v) => onUpdateParameter("attack", v),
          label: "Attack",
          color: "#a78bfa",
          formatValue: (v) => `${v.toFixed(1)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 1075,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: release,
          min: 5,
          max: 2e3,
          onChange: (v) => onUpdateParameter("release", v),
          label: "Release",
          color: "#c4b5fd",
          formatValue: (v) => `${Math.round(v)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 1077,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 1079,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1072,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1071,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 1038,
    columnNumber: 5
  }, void 0);
};
const MultibandExpanderEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, "lowCross", 200);
  const highCross = getParam(effect, "highCross", 4e3);
  const lowThresh = getParam(effect, "lowThresh", -40);
  const midThresh = getParam(effect, "midThresh", -40);
  const highThresh = getParam(effect, "highThresh", -40);
  const ratio = getParam(effect, "ratio", 2);
  const attack = getParam(effect, "attack", 5);
  const release = getParam(effect, "release", 100);
  const range = getParam(effect, "range", -40);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#1e40af" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1105,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#1e40af", title: "Crossover" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1107,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowCross,
            min: 40,
            max: 1e3,
            onChange: (v) => onUpdateParameter("lowCross", v),
            label: "Low X",
            color: "#1e40af",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1109,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highCross,
            min: 500,
            max: 12e3,
            onChange: (v) => onUpdateParameter("highCross", v),
            label: "High X",
            color: "#2563eb",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1111,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1108,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1106,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#2563eb", title: "Bands" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1116,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("lowThresh", v),
            label: "Low Thr",
            color: "#1e40af",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1118,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: midThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("midThresh", v),
            label: "Mid Thr",
            color: "#2563eb",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1120,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highThresh,
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("highThresh", v),
            label: "Hi Thr",
            color: "#3b82f6",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
            lineNumber: 1122,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1117,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1115,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: ratio,
          min: 1,
          max: 20,
          onChange: (v) => onUpdateParameter("ratio", v),
          label: "Ratio",
          color: "#60a5fa",
          formatValue: (v) => `${v.toFixed(1)}:1`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 1128,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: range,
          min: -80,
          max: 0,
          onChange: (v) => onUpdateParameter("range", v),
          label: "Range",
          color: "#60a5fa",
          formatValue: (v) => `${v.toFixed(0)} dB`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 1130,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: attack,
          min: 0.1,
          max: 100,
          onChange: (v) => onUpdateParameter("attack", v),
          label: "Attack",
          color: "#93c5fd",
          formatValue: (v) => `${v.toFixed(1)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 1132,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: release,
          min: 5,
          max: 2e3,
          onChange: (v) => onUpdateParameter("release", v),
          label: "Release",
          color: "#93c5fd",
          formatValue: (v) => `${Math.round(v)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
          lineNumber: 1134,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1127,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1126,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
        lineNumber: 1140,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1139,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
      lineNumber: 1138,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DynamicsEditors.tsx",
    lineNumber: 1104,
    columnNumber: 5
  }, void 0);
};
const Section$1 = ({ children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
  lineNumber: 14,
  columnNumber: 3
}, void 0);
const OverdriveEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const drive = getParam(effect, "drive", 50);
  const tone = getParam(effect, "tone", 50);
  const mix = getParam(effect, "mix", 100);
  const level = getParam(effect, "level", 50);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#dc2626" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 32,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#dc2626", title: "Overdrive" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 34,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: drive,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("drive", v),
            label: "Drive",
            color: "#dc2626",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 36,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: tone,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("tone", v),
            label: "Tone",
            color: "#ef4444",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 38,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: level,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("level", v),
            label: "Level",
            color: "#f87171",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 40,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: mix,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("mix", v),
            label: "Int. Mix",
            color: "#fca5a5",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 42,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 35,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 33,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 48,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 47,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 46,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
    lineNumber: 31,
    columnNumber: 5
  }, void 0);
};
const SaturatorEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const drive = getParam(effect, "drive", 0.5);
  const blend = getParam(effect, "blend", 0.5);
  const preFreq = getParam(effect, "preFreq", 2e4);
  const postFreq = getParam(effect, "postFreq", 2e4);
  const mix = getParam(effect, "mix", 1);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#ea580c" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 70,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ea580c", title: "Saturator" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 72,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: drive,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("drive", v),
            label: "Drive",
            color: "#ea580c",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 74,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: blend,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("blend", v),
            label: "Blend",
            color: "#f97316",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 76,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: mix,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("mix", v),
            label: "Int. Mix",
            color: "#fb923c",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 78,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 73,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 71,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#fb923c", title: "Tone" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 83,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: preFreq,
            min: 200,
            max: 2e4,
            onChange: (v) => onUpdateParameter("preFreq", v),
            label: "Pre LPF",
            color: "#fb923c",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 85,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: postFreq,
            min: 200,
            max: 2e4,
            onChange: (v) => onUpdateParameter("postFreq", v),
            label: "Post LPF",
            color: "#fdba74",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 87,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 89,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 84,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 82,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
    lineNumber: 69,
    columnNumber: 5
  }, void 0);
};
const ExciterEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const frequency = getParam(effect, "frequency", 3e3);
  const amount = getParam(effect, "amount", 0.5);
  const blend = getParam(effect, "blend", 0.5);
  const ceil = getParam(effect, "ceil", 16e3);
  const mix = getParam(effect, "mix", 1);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#eab308" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 111,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#eab308", title: "Exciter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 113,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: 500,
            max: 12e3,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Frequency",
            color: "#eab308",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 115,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: amount,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("amount", v),
            label: "Amount",
            color: "#facc15",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 117,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: blend,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("blend", v),
            label: "Blend",
            color: "#fde047",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 119,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: ceil,
            min: 2e3,
            max: 2e4,
            onChange: (v) => onUpdateParameter("ceil", v),
            label: "Ceiling",
            color: "#fef08a",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 121,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: mix,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("mix", v),
            label: "Int. Mix",
            color: "#fbbf24",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 123,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 114,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 112,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 129,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 128,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 127,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
    lineNumber: 110,
    columnNumber: 5
  }, void 0);
};
const AutoSatEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const amount = getParam(effect, "amount", 0.5);
  const mix = getParam(effect, "mix", 1);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#b45309" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 148,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#b45309", title: "Auto Saturation" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 150,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: amount,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("amount", v),
            label: "Amount",
            color: "#b45309",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 152,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: mix,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("mix", v),
            label: "Int. Mix",
            color: "#d97706",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 154,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 156,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 151,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 149,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
    lineNumber: 147,
    columnNumber: 5
  }, void 0);
};
const SatmaEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const distortion = getParam(effect, "distortion", 0.5);
  const tone = getParam(effect, "tone", 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#92400e" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 175,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#92400e", title: "Satma" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 177,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: distortion,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("distortion", v),
            label: "Distortion",
            color: "#92400e",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 179,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: tone,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("tone", v),
            label: "Tone",
            color: "#b45309",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 181,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 183,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 178,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 176,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
    lineNumber: 174,
    columnNumber: 5
  }, void 0);
};
const DistortionShaperEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const inputGain = getParam(effect, "inputGain", 1);
  const outputGain = getParam(effect, "outputGain", 1);
  const point1x = getParam(effect, "point1x", -0.5);
  const point1y = getParam(effect, "point1y", -0.8);
  const point2x = getParam(effect, "point2x", 0.5);
  const point2y = getParam(effect, "point2y", 0.8);
  const preLpf = getParam(effect, "preLpf", 2e4);
  const postLpf = getParam(effect, "postLpf", 2e4);
  const mix = getParam(effect, "mix", 1);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#991b1b" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 209,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#991b1b", title: "Gain" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 211,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: inputGain,
            min: 0,
            max: 4,
            onChange: (v) => onUpdateParameter("inputGain", v),
            label: "Input",
            color: "#991b1b",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 213,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: outputGain,
            min: 0,
            max: 4,
            onChange: (v) => onUpdateParameter("outputGain", v),
            label: "Output",
            color: "#b91c1c",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 215,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: mix,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("mix", v),
            label: "Int. Mix",
            color: "#dc2626",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 217,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 212,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 210,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#dc2626", title: "Curve Shape" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 222,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: point1x,
            min: -1,
            max: 0,
            onChange: (v) => onUpdateParameter("point1x", v),
            label: "P1 X",
            size: "sm",
            color: "#dc2626",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 224,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: point1y,
            min: -1,
            max: 0,
            onChange: (v) => onUpdateParameter("point1y", v),
            label: "P1 Y",
            size: "sm",
            color: "#ef4444",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 226,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: point2x,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("point2x", v),
            label: "P2 X",
            size: "sm",
            color: "#dc2626",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 228,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: point2y,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("point2y", v),
            label: "P2 Y",
            size: "sm",
            color: "#ef4444",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 230,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 223,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 221,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ef4444", title: "Filters" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 235,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: preLpf,
            min: 200,
            max: 2e4,
            onChange: (v) => onUpdateParameter("preLpf", v),
            label: "Pre LPF",
            color: "#ef4444",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 237,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: postLpf,
            min: 200,
            max: 2e4,
            onChange: (v) => onUpdateParameter("postLpf", v),
            label: "Post LPF",
            color: "#f87171",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 239,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 241,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 236,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 234,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
    lineNumber: 208,
    columnNumber: 5
  }, void 0);
};
const TubeAmpEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const drive = getParam(effect, "drive", 50);
  const bass = getParam(effect, "bass", 50);
  const mid = getParam(effect, "mid", 50);
  const treble = getParam(effect, "treble", 50);
  const presence = getParam(effect, "presence", 50);
  const master = getParam(effect, "master", 50);
  const sag = getParam(effect, "sag", 20);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#92400e" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 265,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#92400e", title: "Preamp" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 267,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: drive,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("drive", v),
            label: "Drive",
            color: "#92400e",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 269,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: sag,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("sag", v),
            label: "Sag",
            color: "#b45309",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 271,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 268,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 266,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#b45309", title: "Tone Stack" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 276,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: bass,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("bass", v),
            label: "Bass",
            color: "#78350f",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 278,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: mid,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("mid", v),
            label: "Mid",
            color: "#92400e",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 280,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: treble,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("treble", v),
            label: "Treble",
            color: "#b45309",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 282,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: presence,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("presence", v),
            label: "Presence",
            color: "#d97706",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 284,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 277,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 275,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: master,
          min: 0,
          max: 100,
          onChange: (v) => onUpdateParameter("master", v),
          label: "Master",
          color: "#fbbf24",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
          lineNumber: 290,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
          lineNumber: 292,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 289,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 288,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
    lineNumber: 264,
    columnNumber: 5
  }, void 0);
};
const CabinetSimEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const cabinet = getParam(effect, "cabinet", 0);
  const brightness = getParam(effect, "brightness", 50);
  const mix = getParam(effect, "mix", 100);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const CAB_MODELS = ["1x8", "1x12", "2x12", "4x10", "4x12", "8x10", "Open", "Closed"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#78350f" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 314,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#78350f", title: "Cabinet" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 316,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-1.5 mb-4", children: CAB_MODELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("cabinet", i),
          className: `px-2 py-1.5 rounded-lg text-xs font-bold border transition-all ${Math.round(cabinet) === i ? "bg-amber-800/70 border-amber-600 text-amber-100" : "bg-black/40 border-dark-border text-text-muted hover:border-amber-800"}`,
          children: label
        },
        i,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
          lineNumber: 319,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 317,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: brightness,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("brightness", v),
            label: "Bright",
            color: "#92400e",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 326,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: mix,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("mix", v),
            label: "Int. Mix",
            color: "#b45309",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 328,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 325,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 315,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 334,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 333,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 332,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
    lineNumber: 313,
    columnNumber: 5
  }, void 0);
};
const DrivaEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const amount = getParam(effect, "amount", 0.5);
  const tone = getParam(effect, "tone", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#c2410c" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 353,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#c2410c", title: "Driva" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 355,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: amount,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("amount", v),
            label: "Amount",
            color: "#c2410c",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 357,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: tone,
            min: -1,
            max: 1,
            onChange: (v) => onUpdateParameter("tone", v),
            label: "Tone",
            color: "#ea580c",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 359,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 361,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 356,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 354,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
    lineNumber: 352,
    columnNumber: 5
  }, void 0);
};
const BassEnhancerEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const frequency = getParam(effect, "frequency", 100);
  const amount = getParam(effect, "amount", 0.5);
  const drive = getParam(effect, "drive", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#7c2d12" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 381,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c2d12", title: "Bass Enhancer" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 383,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: 20,
            max: 500,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Frequency",
            color: "#7c2d12",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 385,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: amount,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("amount", v),
            label: "Amount",
            color: "#9a3412",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 387,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: drive,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("drive", v),
            label: "Drive",
            color: "#c2410c",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 389,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
            lineNumber: 391,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
        lineNumber: 384,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
      lineNumber: 382,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/DistortionSatEditors.tsx",
    lineNumber: 380,
    columnNumber: 5
  }, void 0);
};
function computeBiquadCoeffs(type, freq, gain, q, sr) {
  const w0 = 2 * Math.PI * Math.max(1, Math.min(sr / 2 - 1, freq)) / sr;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Math.max(0.01, q));
  const A = Math.pow(10, gain / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case "peaking":
      b0 = 1 + alpha * A;
      b1 = -2 * cosW0;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW0;
      a2 = 1 - alpha / A;
      break;
    case "lowShelf": {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cosW0 + sq);
      b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
      b2 = A * (A + 1 - (A - 1) * cosW0 - sq);
      a0 = A + 1 + (A - 1) * cosW0 + sq;
      a1 = -2 * (A - 1 + (A + 1) * cosW0);
      a2 = A + 1 + (A - 1) * cosW0 - sq;
      break;
    }
    case "highShelf": {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cosW0 + sq);
      b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
      b2 = A * (A + 1 + (A - 1) * cosW0 - sq);
      a0 = A + 1 - (A - 1) * cosW0 + sq;
      a1 = 2 * (A - 1 - (A + 1) * cosW0);
      a2 = A + 1 - (A - 1) * cosW0 - sq;
      break;
    }
    case "highpass":
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case "lowpass":
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    default:
      b0 = 1;
      b1 = 0;
      b2 = 0;
      a0 = 1;
      a1 = 0;
      a2 = 0;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
function magnitudeResponse(coeffs, freq, sr) {
  const w = 2 * Math.PI * freq / sr;
  const cosW = Math.cos(w);
  const cos2W = Math.cos(2 * w);
  const sinW = Math.sin(w);
  const sin2W = Math.sin(2 * w);
  const numReal = coeffs.b0 + coeffs.b1 * cosW + coeffs.b2 * cos2W;
  const numImag = -(coeffs.b1 * sinW + coeffs.b2 * sin2W);
  const denReal = 1 + coeffs.a1 * cosW + coeffs.a2 * cos2W;
  const denImag = -(coeffs.a1 * sinW + coeffs.a2 * sin2W);
  const numMag = Math.sqrt(numReal * numReal + numImag * numImag);
  const denMag = Math.sqrt(denReal * denReal + denImag * denImag);
  return numMag / (denMag || 1e-10);
}
const EQCurve = ({
  bands,
  color = "#3b82f6",
  width = 300,
  height = 120,
  dbRange = 18,
  sampleRate = 48e3
}) => {
  const canvasRef = reactExports.useRef(null);
  const bandCoeffs = reactExports.useMemo(
    () => bands.map((b) => computeBiquadCoeffs(b.type, b.freq, b.gain, b.q, sampleRate)),
    [bands, sampleRate]
  );
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr) canvas.width = width * dpr;
    if (canvas.height !== height * dpr) canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);
    const freqMin = 20;
    const freqMax = 2e4;
    const logMin = Math.log10(freqMin);
    const logMax = Math.log10(freqMax);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    for (const f of [20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4]) {
      const x = (Math.log10(f) - logMin) / (logMax - logMin) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let db = -dbRange; db <= dbRange; db += 6) {
      const y = (dbRange - db) / (2 * dbRange) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    for (const [f, label] of [[100, "100"], [1e3, "1k"], [1e4, "10k"]]) {
      const x = (Math.log10(f) - logMin) / (logMax - logMin) * width;
      ctx.fillText(label, x, height - 2);
    }
    const numPoints = Math.min(width * 2, 512);
    const points = [];
    for (let i = 0; i < numPoints; i++) {
      const logFreq = logMin + i / (numPoints - 1) * (logMax - logMin);
      const freq = Math.pow(10, logFreq);
      const x = i / (numPoints - 1) * width;
      let totalMag = 1;
      for (const coeffs of bandCoeffs) {
        totalMag *= magnitudeResponse(coeffs, freq, sampleRate);
      }
      const db = 20 * Math.log10(totalMag || 1e-10);
      const clampedDb = Math.max(-dbRange, Math.min(dbRange, db));
      const y = (dbRange - clampedDb) / (2 * dbRange) * height;
      points.push([x, y]);
    }
    ctx.beginPath();
    ctx.moveTo(points[0][0], height / 2);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.lineTo(points[points.length - 1][0], height / 2);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, color + "30");
    gradient.addColorStop(0.5, color + "08");
    gradient.addColorStop(1, color + "30");
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = color + "80";
    for (const band of bands) {
      if (band.gain === 0 && band.type === "peaking") continue;
      const x = (Math.log10(Math.max(freqMin, Math.min(freqMax, band.freq))) - logMin) / (logMax - logMin) * width;
      ctx.beginPath();
      ctx.arc(x, height / 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [bandCoeffs, bands, color, width, height, dbRange, sampleRate]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      style: {
        width: "100%",
        height: `${height}px`,
        borderRadius: 4,
        display: "block"
      }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EQCurve.tsx",
      lineNumber: 250,
      columnNumber: 5
    },
    void 0
  );
};
const EQSlider = ({
  value,
  min,
  max,
  onChange,
  label,
  color = "#3b82f6",
  height = 100,
  width = 28
}) => {
  const trackRef = reactExports.useRef(null);
  const [dragging, setDragging] = reactExports.useState(false);
  const [hovering, setHovering] = reactExports.useState(false);
  const onChangeRef = reactExports.useRef(onChange);
  onChangeRef.current = onChange;
  const valueToY = reactExports.useCallback((v) => {
    const ratio = (v - min) / (max - min);
    return height - ratio * height;
  }, [min, max, height]);
  const yToValue = reactExports.useCallback((y) => {
    const ratio = 1 - Math.max(0, Math.min(1, y / height));
    const raw = min + ratio * (max - min);
    return Math.abs(raw) < 0.5 ? 0 : Math.round(raw * 10) / 10;
  }, [min, max, height]);
  const handleMove = reactExports.useCallback((clientY) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    onChangeRef.current(yToValue(y));
  }, [yToValue]);
  const handlePointerDown = reactExports.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    e.target.setPointerCapture(e.pointerId);
    handleMove(e.clientY);
  }, [handleMove]);
  const handlePointerMove = reactExports.useCallback((e) => {
    if (!dragging) return;
    handleMove(e.clientY);
  }, [dragging, handleMove]);
  const handlePointerUp = reactExports.useCallback(() => {
    setDragging(false);
  }, []);
  const handleDoubleClick = reactExports.useCallback(() => {
    onChangeRef.current(0);
  }, []);
  const thumbY = valueToY(value);
  const zeroY = valueToY(0);
  const isPositive = value > 0;
  const fillTop = isPositive ? thumbY : zeroY;
  const fillHeight = Math.abs(thumbY - zeroY);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "flex flex-col items-center gap-1",
      style: { width },
      onMouseEnter: () => setHovering(true),
      onMouseLeave: () => setHovering(false),
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono leading-none h-3", style: { color: hovering || dragging ? color : "transparent" }, children: [
          value > 0 ? "+" : "",
          value.toFixed(1)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EQSlider.tsx",
          lineNumber: 85,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            ref: trackRef,
            className: "relative cursor-pointer rounded-sm",
            style: { width: 6, height, background: "rgba(255,255,255,0.08)" },
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onDoubleClick: handleDoubleClick,
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "absolute left-0 right-0",
                  style: { top: zeroY, height: 1, background: "rgba(255,255,255,0.2)" }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EQSlider.tsx",
                  lineNumber: 100,
                  columnNumber: 9
                },
                void 0
              ),
              fillHeight > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "absolute left-0 right-0 rounded-sm",
                  style: {
                    top: fillTop,
                    height: fillHeight,
                    background: color,
                    opacity: 0.4
                  }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EQSlider.tsx",
                  lineNumber: 107,
                  columnNumber: 11
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "absolute rounded-sm",
                  style: {
                    left: -3,
                    top: thumbY - 3,
                    width: 12,
                    height: 6,
                    background: color,
                    boxShadow: dragging ? `0 0 6px ${color}` : "none",
                    transition: dragging ? "none" : "box-shadow 0.15s"
                  }
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EQSlider.tsx",
                  lineNumber: 119,
                  columnNumber: 9
                },
                void 0
              )
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EQSlider.tsx",
            lineNumber: 90,
            columnNumber: 7
          },
          void 0
        ),
        label && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-muted leading-none text-center whitespace-nowrap", children: label }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EQSlider.tsx",
          lineNumber: 135,
          columnNumber: 9
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EQSlider.tsx",
      lineNumber: 78,
      columnNumber: 5
    },
    void 0
  );
};
const Section = ({ children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
  lineNumber: 14,
  columnNumber: 3
}, void 0);
const ParametricEQEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const bands = [
    { freq: "b1Freq", gain: "b1Gain", q: "b1Q", label: "Band 1", defF: 100, color: "#ef4444" },
    { freq: "b2Freq", gain: "b2Gain", q: "b2Q", label: "Band 2", defF: 500, color: "#f97316" },
    { freq: "b3Freq", gain: "b3Gain", q: "b3Q", label: "Band 3", defF: 2e3, color: "#eab308" },
    { freq: "b4Freq", gain: "b4Gain", q: "b4Q", label: "Band 4", defF: 8e3, color: "#22c55e" }
  ];
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  const eqBands = bands.map((b) => ({
    type: "peaking",
    freq: getParam(effect, b.freq, b.defF),
    gain: getParam(effect, b.gain, 0),
    q: getParam(effect, b.q, 0.7)
  }));
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EQCurve, { bands: eqBands, color: "#f97316" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 41,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#f97316", height: 60 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 42,
      columnNumber: 7
    }, void 0),
    bands.map((b) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: b.color, title: b.label }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 45,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, b.freq, b.defF),
            min: 20,
            max: 2e4,
            onChange: (v) => onUpdateParameter(b.freq, v),
            label: "Freq",
            color: b.color,
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 47,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: getParam(effect, b.gain, 0),
            min: -18,
            max: 18,
            onChange: (v) => onUpdateParameter(b.gain, v),
            label: "Gain",
            color: b.color
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 50,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, b.q, 0.7),
            min: 0.1,
            max: 10,
            onChange: (v) => onUpdateParameter(b.q, v),
            label: "Q",
            color: b.color,
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 52,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 46,
        columnNumber: 11
      }, void 0)
    ] }, b.freq, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 44,
      columnNumber: 9
    }, void 0)),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 60,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 59,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 58,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 40,
    columnNumber: 5
  }, void 0);
};
const EQ5BandEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  const eqBands = [
    { type: "lowShelf", freq: getParam(effect, "lowShelfFreq", 100), gain: getParam(effect, "lowShelfGain", 0), q: 0.7 },
    { type: "peaking", freq: getParam(effect, "peak1Freq", 500), gain: getParam(effect, "peak1Gain", 0), q: getParam(effect, "peak1Q", 1) },
    { type: "peaking", freq: getParam(effect, "peak2Freq", 1500), gain: getParam(effect, "peak2Gain", 0), q: getParam(effect, "peak2Q", 1) },
    { type: "peaking", freq: getParam(effect, "peak3Freq", 5e3), gain: getParam(effect, "peak3Gain", 0), q: getParam(effect, "peak3Q", 1) },
    { type: "highShelf", freq: getParam(effect, "highShelfFreq", 8e3), gain: getParam(effect, "highShelfGain", 0), q: 0.7 }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EQCurve, { bands: eqBands, color: "#10b981" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 85,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#10b981", height: 60 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 86,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#10b981", title: "Low Shelf" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 88,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "lowShelfFreq", 100),
            min: 20,
            max: 500,
            onChange: (v) => onUpdateParameter("lowShelfFreq", v),
            label: "Freq",
            color: "#059669",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 90,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: getParam(effect, "lowShelfGain", 0),
            min: -18,
            max: 18,
            onChange: (v) => onUpdateParameter("lowShelfGain", v),
            label: "Gain",
            color: "#059669"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 93,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 89,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 87,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#10b981", title: "Peaks" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 98,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        { f: "peak1Freq", g: "peak1Gain", q: "peak1Q", def: 500, c: "#10b981" },
        { f: "peak2Freq", g: "peak2Gain", q: "peak2Q", def: 1500, c: "#34d399" },
        { f: "peak3Freq", g: "peak3Gain", q: "peak3Q", def: 5e3, c: "#6ee7b7" }
      ].map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(React.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, p.f, p.def),
            min: 20,
            max: 2e4,
            onChange: (v) => onUpdateParameter(p.f, v),
            label: "Freq",
            color: p.c,
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 106,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: getParam(effect, p.g, 0),
            min: -18,
            max: 18,
            onChange: (v) => onUpdateParameter(p.g, v),
            label: "Gain",
            color: p.c
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 109,
            columnNumber: 15
          },
          void 0
        )
      ] }, p.f, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 105,
        columnNumber: 13
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 99,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 97,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#6ee7b7", title: "High Shelf" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 116,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "highShelfFreq", 8e3),
            min: 1e3,
            max: 18e3,
            onChange: (v) => onUpdateParameter("highShelfFreq", v),
            label: "Freq",
            color: "#6ee7b7",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 118,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: getParam(effect, "highShelfGain", 0),
            min: -18,
            max: 18,
            onChange: (v) => onUpdateParameter("highShelfGain", v),
            label: "Gain",
            color: "#6ee7b7"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 121,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 123,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 117,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 115,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 84,
    columnNumber: 5
  }, void 0);
};
const ZamEQ2Editor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  const bwToQ = (bw) => 1 / (2 * Math.sinh(Math.log(2) / 2 * bw));
  const eqBands = [
    { type: "peaking", freq: getParam(effect, "lowFreq", 200), gain: getParam(effect, "lowGain", 0), q: bwToQ(getParam(effect, "lowBw", 1)) },
    { type: "peaking", freq: getParam(effect, "highFreq", 4e3), gain: getParam(effect, "highGain", 0), q: bwToQ(getParam(effect, "highBw", 1)) }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EQCurve, { bands: eqBands, color: "#0ea5e9" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 146,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#0ea5e9", height: 60 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 147,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#0ea5e9", title: "Low Band" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 149,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "lowFreq", 200),
            min: 20,
            max: 2e3,
            onChange: (v) => onUpdateParameter("lowFreq", v),
            label: "Freq",
            color: "#0284c7",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 151,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: getParam(effect, "lowGain", 0),
            min: -18,
            max: 18,
            onChange: (v) => onUpdateParameter("lowGain", v),
            label: "Gain",
            color: "#0284c7"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 154,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "lowBw", 1),
            min: 0.1,
            max: 6,
            onChange: (v) => onUpdateParameter("lowBw", v),
            label: "BW",
            color: "#0ea5e9",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 156,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 150,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 148,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#38bdf8", title: "High Band" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 162,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "highFreq", 4e3),
            min: 500,
            max: 16e3,
            onChange: (v) => onUpdateParameter("highFreq", v),
            label: "Freq",
            color: "#38bdf8",
            formatValue: (v) => `${(v / 1e3).toFixed(1)}k`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 164,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: getParam(effect, "highGain", 0),
            min: -18,
            max: 18,
            onChange: (v) => onUpdateParameter("highGain", v),
            label: "Gain",
            color: "#38bdf8"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 167,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "highBw", 1),
            min: 0.1,
            max: 6,
            onChange: (v) => onUpdateParameter("highBw", v),
            label: "BW",
            color: "#7dd3fc",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 169,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 163,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 161,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 176,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 175,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 174,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 145,
    columnNumber: 5
  }, void 0);
};
const PhonoFilterEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const mode = Math.round(getParam(effect, "mode", 0));
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const modes = ["RIAA", "NAB", "Columbia", "IEC"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#a1887f" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 194,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a1887f", title: "Phono Filter" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 196,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 mb-4 justify-center", children: modes.map((label, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("mode", idx),
          className: `px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${mode === idx ? "bg-amber-700/70 border-amber-500 text-amber-100" : "bg-black/40 border-dark-border text-text-muted hover:border-amber-700"}`,
          children: label
        },
        idx,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 199,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 197,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 206,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 205,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 195,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 193,
    columnNumber: 5
  }, void 0);
};
const DynamicEQEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  const eqBands = [
    { type: "peaking", freq: getParam(effect, "processFreq", 1e3), gain: getParam(effect, "maxGain", 0), q: getParam(effect, "processQ", 1) }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EQCurve, { bands: eqBands, color: "#8b5cf6" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 227,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#8b5cf6", height: 60 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 228,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#8b5cf6", title: "Detection" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 230,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "detectFreq", 1e3),
            min: 20,
            max: 2e4,
            onChange: (v) => onUpdateParameter("detectFreq", v),
            label: "Detect",
            color: "#8b5cf6",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 232,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "detectQ", 1),
            min: 0.1,
            max: 10,
            onChange: (v) => onUpdateParameter("detectQ", v),
            label: "Q",
            color: "#a78bfa",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 235,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "threshold", -20),
            min: -60,
            max: 0,
            onChange: (v) => onUpdateParameter("threshold", v),
            label: "Thresh",
            color: "#a78bfa",
            formatValue: (v) => `${v.toFixed(0)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 237,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 231,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 229,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a78bfa", title: "Processing" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 243,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "processFreq", 1e3),
            min: 20,
            max: 2e4,
            onChange: (v) => onUpdateParameter("processFreq", v),
            label: "Proc Freq",
            color: "#c4b5fd",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 245,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "processQ", 1),
            min: 0.1,
            max: 10,
            onChange: (v) => onUpdateParameter("processQ", v),
            label: "Proc Q",
            color: "#c4b5fd",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 248,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "maxGain", 0),
            min: -18,
            max: 18,
            onChange: (v) => onUpdateParameter("maxGain", v),
            label: "Max Gain",
            color: "#ddd6fe",
            formatValue: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 250,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 244,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 242,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: getParam(effect, "attack", 10),
          min: 0.1,
          max: 200,
          onChange: (v) => onUpdateParameter("attack", v),
          label: "Attack",
          color: "#ddd6fe",
          formatValue: (v) => `${v.toFixed(1)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 257,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: getParam(effect, "release", 100),
          min: 5,
          max: 2e3,
          onChange: (v) => onUpdateParameter("release", v),
          label: "Release",
          color: "#ede9fe",
          formatValue: (v) => `${Math.round(v)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 259,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 261,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 256,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 255,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 226,
    columnNumber: 5
  }, void 0);
};
const KuizaEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  const eqBands = [
    { type: "lowShelf", freq: 200, gain: getParam(effect, "low", 0), q: 0.7 },
    { type: "peaking", freq: 800, gain: getParam(effect, "lowMid", 0), q: 1 },
    { type: "peaking", freq: 3e3, gain: getParam(effect, "highMid", 0), q: 1 },
    { type: "highShelf", freq: 8e3, gain: getParam(effect, "high", 0), q: 0.7 }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EQCurve, { bands: eqBands, color: "#14b8a6" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 285,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#14b8a6", height: 60 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 286,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#14b8a6", title: "Kuiza EQ" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 288,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: getParam(effect, "low", 0),
            min: -18,
            max: 18,
            onChange: (v) => onUpdateParameter("low", v),
            label: "Low",
            color: "#0d9488"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 290,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: getParam(effect, "lowMid", 0),
            min: -18,
            max: 18,
            onChange: (v) => onUpdateParameter("lowMid", v),
            label: "Lo-Mid",
            color: "#14b8a6"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 292,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: getParam(effect, "highMid", 0),
            min: -18,
            max: 18,
            onChange: (v) => onUpdateParameter("highMid", v),
            label: "Hi-Mid",
            color: "#2dd4bf"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 294,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: getParam(effect, "high", 0),
            min: -18,
            max: 18,
            onChange: (v) => onUpdateParameter("high", v),
            label: "High",
            color: "#5eead4"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 296,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 289,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 287,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: getParam(effect, "gain", 0),
          min: -12,
          max: 12,
          onChange: (v) => onUpdateParameter("gain", v),
          label: "Gain",
          color: "#99f6e4",
          formatValue: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 302,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 305,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 301,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 300,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 284,
    columnNumber: 5
  }, void 0);
};
const FlangerEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const rate = getParam(effect, "rate", 0.3);
  const depth = getParam(effect, "depth", 70);
  const delay = getParam(effect, "delay", 5);
  const feedback = getParam(effect, "feedback", 30);
  const stereo = getParam(effect, "stereo", 90);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#ec4899" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 327,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ec4899", title: "Flanger" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 329,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: rate,
            min: 0.01,
            max: 10,
            onChange: (v) => onUpdateParameter("rate", v),
            label: "Rate",
            color: "#ec4899",
            formatValue: (v) => `${v.toFixed(2)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 331,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: depth,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("depth", v),
            label: "Depth",
            color: "#f472b6",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 333,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: delay,
            min: 0.1,
            max: 20,
            onChange: (v) => onUpdateParameter("delay", v),
            label: "Delay",
            color: "#f9a8d4",
            formatValue: (v) => `${v.toFixed(1)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 335,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 330,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 328,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: feedback,
          min: -100,
          max: 100,
          onChange: (v) => onUpdateParameter("feedback", v),
          label: "Feedback",
          color: "#f9a8d4",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 341,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: stereo,
          min: 0,
          max: 180,
          onChange: (v) => onUpdateParameter("stereo", v),
          label: "Stereo",
          color: "#fbcfe8",
          formatValue: (v) => `${Math.round(v)}°`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 343,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 345,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 340,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 339,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 326,
    columnNumber: 5
  }, void 0);
};
const JunoChorusEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const rate = getParam(effect, "rate", 0.5);
  const depth = getParam(effect, "depth", 50);
  const mode = getParam(effect, "mode", 2);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#7c3aed" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 365,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c3aed", title: "Juno Chorus" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 367,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: rate,
            min: 0.01,
            max: 5,
            onChange: (v) => onUpdateParameter("rate", v),
            label: "Rate",
            color: "#7c3aed",
            formatValue: (v) => `${v.toFixed(2)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 369,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: depth,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("depth", v),
            label: "Depth",
            color: "#8b5cf6",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 371,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: mode,
            min: 1,
            max: 3,
            step: 1,
            onChange: (v) => onUpdateParameter("mode", Math.round(v)),
            label: "Mode",
            color: "#a78bfa",
            formatValue: (v) => `I${Math.round(v) > 1 ? "I" : ""}${Math.round(v) > 2 ? "I" : ""}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 373,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 375,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 368,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 366,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 364,
    columnNumber: 5
  }, void 0);
};
const MultiChorusEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const rate = getParam(effect, "rate", 0.5);
  const depth = getParam(effect, "depth", 0.5);
  const voices = getParam(effect, "voices", 4);
  const stereoPhase = getParam(effect, "stereoPhase", 90);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#6366f1" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 396,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#6366f1", title: "Multi Chorus" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 398,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: rate,
            min: 0.01,
            max: 5,
            onChange: (v) => onUpdateParameter("rate", v),
            label: "Rate",
            color: "#6366f1",
            formatValue: (v) => `${v.toFixed(2)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 400,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: depth,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("depth", v),
            label: "Depth",
            color: "#818cf8",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 402,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: voices,
            min: 2,
            max: 8,
            step: 1,
            onChange: (v) => onUpdateParameter("voices", Math.round(v)),
            label: "Voices",
            color: "#a5b4fc",
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 404,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: stereoPhase,
            min: 0,
            max: 360,
            onChange: (v) => onUpdateParameter("stereoPhase", v),
            label: "Stereo",
            color: "#c7d2fe",
            formatValue: (v) => `${Math.round(v)}°`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 406,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 399,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 397,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 412,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 411,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 410,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 395,
    columnNumber: 5
  }, void 0);
};
const CalfPhaserEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const rate = getParam(effect, "rate", 0.5);
  const depth = getParam(effect, "depth", 0.7);
  const stages = getParam(effect, "stages", 6);
  const feedback = getParam(effect, "feedback", 0.5);
  const stereoPhase = getParam(effect, "stereoPhase", 90);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#d946ef" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 434,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#d946ef", title: "Calf Phaser" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 436,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: rate,
            min: 0.01,
            max: 10,
            onChange: (v) => onUpdateParameter("rate", v),
            label: "Rate",
            color: "#d946ef",
            formatValue: (v) => `${v.toFixed(2)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 438,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: depth,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("depth", v),
            label: "Depth",
            color: "#e879f9",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 440,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: stages,
            min: 2,
            max: 12,
            step: 2,
            onChange: (v) => onUpdateParameter("stages", Math.round(v)),
            label: "Stages",
            color: "#f0abfc",
            formatValue: (v) => `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 442,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: feedback,
            min: -1,
            max: 1,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            color: "#f5d0fe",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 444,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: stereoPhase,
            min: 0,
            max: 360,
            onChange: (v) => onUpdateParameter("stereoPhase", v),
            label: "Stereo",
            color: "#fae8ff",
            formatValue: (v) => `${Math.round(v)}°`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 446,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 437,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 435,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 452,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 451,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 450,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 433,
    columnNumber: 5
  }, void 0);
};
const PulsatorEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const rate = getParam(effect, "rate", 2);
  const depth = getParam(effect, "depth", 0.5);
  const stereoPhase = getParam(effect, "stereoPhase", 180);
  const offset = getParam(effect, "offset", 0);
  const waveform = getParam(effect, "waveform", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const WAVE_LABELS = ["Sine", "Tri", "Square", "Saw", "Rev Saw"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#f43f5e" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 476,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#f43f5e", title: "Pulsator" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 478,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-2 mb-4", children: WAVE_LABELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("waveform", i),
          className: `px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${Math.round(waveform) === i ? "bg-rose-700/70 border-rose-500 text-rose-100" : "bg-black/40 border-dark-border text-text-muted hover:border-rose-700"}`,
          children: label
        },
        i,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 481,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 479,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: rate,
            min: 0.1,
            max: 20,
            onChange: (v) => onUpdateParameter("rate", v),
            label: "Rate",
            color: "#f43f5e",
            formatValue: (v) => `${v.toFixed(1)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 488,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: depth,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("depth", v),
            label: "Depth",
            color: "#fb7185",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 490,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: stereoPhase,
            min: 0,
            max: 360,
            onChange: (v) => onUpdateParameter("stereoPhase", v),
            label: "Stereo",
            color: "#fda4af",
            formatValue: (v) => `${Math.round(v)}°`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 492,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: offset,
            min: -1,
            max: 1,
            onChange: (v) => onUpdateParameter("offset", v),
            label: "Offset",
            color: "#fecdd3",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 494,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 487,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 477,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 500,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 499,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 498,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 475,
    columnNumber: 5
  }, void 0);
};
const RingModEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const frequency = getParam(effect, "frequency", 440);
  const lfoRate = getParam(effect, "lfoRate", 0);
  const lfoDepth = getParam(effect, "lfoDepth", 0);
  const waveform = getParam(effect, "waveform", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const WAVE_LABELS = ["Sine", "Square", "Tri", "Saw"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#be185d" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 523,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#be185d", title: "Ring Modulator" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 525,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center gap-2 mb-4", children: WAVE_LABELS.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => onUpdateParameter("waveform", i),
          className: `px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${Math.round(waveform) === i ? "bg-pink-700/70 border-pink-500 text-pink-100" : "bg-black/40 border-dark-border text-text-muted hover:border-pink-700"}`,
          children: label
        },
        i,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 528,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 526,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: frequency,
            min: 20,
            max: 5e3,
            onChange: (v) => onUpdateParameter("frequency", v),
            label: "Frequency",
            color: "#be185d",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 535,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lfoRate,
            min: 0,
            max: 20,
            onChange: (v) => onUpdateParameter("lfoRate", v),
            label: "LFO Rate",
            color: "#db2777",
            formatValue: (v) => `${v.toFixed(1)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 537,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lfoDepth,
            min: 0,
            max: 100,
            onChange: (v) => onUpdateParameter("lfoDepth", v),
            label: "LFO Depth",
            color: "#ec4899",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 539,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 534,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 524,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 545,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 544,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 543,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 522,
    columnNumber: 5
  }, void 0);
};
const DragonflyEditor = (title, color, extras) => {
  const Comp = ({ effect, onUpdateParameter, onUpdateWet }) => {
    const decay = getParam(effect, "decay", 50);
    const damping = getParam(effect, "damping", 50);
    const predelay = getParam(effect, "predelay", 10);
    const width = getParam(effect, "width", 100);
    const earlyLevel = extras.earlyLevel ? getParam(effect, "earlyLevel", 50) : 0;
    const size = extras.size ? getParam(effect, "size", 1) : 0;
    const brightness = extras.brightness ? getParam(effect, "brightness", 70) : 0;
    const { pre, post } = useEffectAnalyser(effect.id, "waveform");
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 570,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color, title }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 572,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: decay,
              min: 0,
              max: 100,
              onChange: (v) => onUpdateParameter("decay", v),
              label: "Decay",
              color,
              formatValue: (v) => `${Math.round(v)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
              lineNumber: 574,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: damping,
              min: 0,
              max: 100,
              onChange: (v) => onUpdateParameter("damping", v),
              label: "Damp",
              color,
              formatValue: (v) => `${Math.round(v)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
              lineNumber: 576,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: predelay,
              min: 0,
              max: 200,
              onChange: (v) => onUpdateParameter("predelay", v),
              label: "Pre-Delay",
              color,
              formatValue: (v) => `${Math.round(v)} ms`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
              lineNumber: 578,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: width,
              min: 0,
              max: 150,
              onChange: (v) => onUpdateParameter("width", v),
              label: "Width",
              color,
              formatValue: (v) => `${Math.round(v)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
              lineNumber: 580,
              columnNumber: 13
            },
            void 0
          ),
          extras.earlyLevel && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: earlyLevel,
              min: 0,
              max: 100,
              onChange: (v) => onUpdateParameter("earlyLevel", v),
              label: "Early",
              color,
              formatValue: (v) => `${Math.round(v)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
              lineNumber: 583,
              columnNumber: 15
            },
            void 0
          ),
          extras.size && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: size,
              min: 0.1,
              max: 5,
              onChange: (v) => onUpdateParameter("size", v),
              label: "Size",
              color,
              formatValue: (v) => v.toFixed(1)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
              lineNumber: 587,
              columnNumber: 15
            },
            void 0
          ),
          extras.brightness && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: brightness,
              min: 0,
              max: 100,
              onChange: (v) => onUpdateParameter("brightness", v),
              label: "Bright",
              color,
              formatValue: (v) => `${Math.round(v)}%`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
              lineNumber: 591,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 573,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 571,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 598,
          columnNumber: 13
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 597,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 596,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 569,
      columnNumber: 7
    }, void 0);
  };
  Comp.displayName = title.replace(/\s/g, "") + "Editor";
  return Comp;
};
const DragonflyHallEditor = DragonflyEditor("Dragonfly Hall", "#7c3aed", { earlyLevel: true, size: true });
const DragonflyPlateEditor = DragonflyEditor("Dragonfly Plate", "#8b5cf6", { brightness: true });
const DragonflyRoomEditor = DragonflyEditor("Dragonfly Room", "#a78bfa", { earlyLevel: true, size: true });
const EarlyReflectionsEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const size = getParam(effect, "size", 1);
  const damping = getParam(effect, "damping", 0.3);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#059669" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 623,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#059669", title: "Early Reflections" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 625,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: size,
            min: 0.1,
            max: 5,
            onChange: (v) => onUpdateParameter("size", v),
            label: "Size",
            color: "#059669",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 627,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: damping,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("damping", v),
            label: "Damp",
            color: "#10b981",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 629,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 631,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 626,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 624,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 622,
    columnNumber: 5
  }, void 0);
};
const RoomyEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const time = getParam(effect, "time", 2);
  const damping = getParam(effect, "damping", 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#0f766e" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 649,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#0f766e", title: "Roomy" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 651,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: time,
            min: 0.1,
            max: 10,
            onChange: (v) => onUpdateParameter("time", v),
            label: "Time",
            color: "#0f766e",
            formatValue: (v) => `${v.toFixed(1)}s`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 653,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: damping,
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("damping", v),
            label: "Damp",
            color: "#14b8a6",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 655,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 657,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 652,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 650,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 648,
    columnNumber: 5
  }, void 0);
};
const ReverseDelayEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#7c3aed" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 673,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c3aed", title: "Reverse Delay" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 675,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "time", 500),
            min: 50,
            max: 2e3,
            onChange: (v) => onUpdateParameter("time", v),
            label: "Time",
            color: "#7c3aed",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 678,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "feedback", 0.3),
            min: 0,
            max: 0.95,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            color: "#8b5cf6",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 680,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 682,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 677,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 674,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 672,
    columnNumber: 5
  }, void 0);
};
const VintageDelayEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#a1887f" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 694,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a1887f", title: "Vintage Delay" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 696,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "time", 400),
            min: 50,
            max: 2e3,
            onChange: (v) => onUpdateParameter("time", v),
            label: "Time",
            color: "#a1887f",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 699,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "feedback", 0.4),
            min: 0,
            max: 0.95,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            color: "#8d6e63",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 701,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "cutoff", 3e3),
            min: 200,
            max: 12e3,
            onChange: (v) => onUpdateParameter("cutoff", v),
            label: "Tone",
            color: "#795548",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 703,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "drive", 0.3),
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("drive", v),
            label: "Drive",
            color: "#6d4c41",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 706,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 698,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 695,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 712,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 711,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 710,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 693,
    columnNumber: 5
  }, void 0);
};
const ArtisticDelayEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#4f46e5" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 724,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#4f46e5", title: "Artistic Delay" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 726,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "timeL", 500),
            min: 10,
            max: 2e3,
            onChange: (v) => onUpdateParameter("timeL", v),
            label: "Time L",
            color: "#4f46e5",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 729,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "timeR", 375),
            min: 10,
            max: 2e3,
            onChange: (v) => onUpdateParameter("timeR", v),
            label: "Time R",
            color: "#6366f1",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 731,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "feedback", 0.4),
            min: 0,
            max: 0.95,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            color: "#818cf8",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 733,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "pan", 0.5),
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("pan", v),
            label: "Pan",
            color: "#a5b4fc",
            formatValue: (v) => `${Math.round((v - 0.5) * 200)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 735,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 728,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 725,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: getParam(effect, "lpf", 12e3),
          min: 200,
          max: 2e4,
          onChange: (v) => onUpdateParameter("lpf", v),
          label: "LPF",
          color: "#c7d2fe",
          formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 741,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: getParam(effect, "hpf", 40),
          min: 20,
          max: 2e3,
          onChange: (v) => onUpdateParameter("hpf", v),
          label: "HPF",
          color: "#c7d2fe",
          formatValue: (v) => `${Math.round(v)} Hz`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 744,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 746,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 740,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 739,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 723,
    columnNumber: 5
  }, void 0);
};
const SlapbackDelayEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#ca8a04" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 758,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ca8a04", title: "Slapback" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 760,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "time", 60),
            min: 10,
            max: 200,
            onChange: (v) => onUpdateParameter("time", v),
            label: "Time",
            color: "#ca8a04",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 763,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "feedback", 0.1),
            min: 0,
            max: 0.7,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            color: "#eab308",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 765,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "tone", 4e3),
            min: 200,
            max: 12e3,
            onChange: (v) => onUpdateParameter("tone", v),
            label: "Tone",
            color: "#facc15",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 767,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 770,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 762,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 759,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 757,
    columnNumber: 5
  }, void 0);
};
const ZamDelayEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#16a34a" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 782,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#16a34a", title: "ZamDelay" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 784,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "time", 500),
            min: 10,
            max: 2e3,
            onChange: (v) => onUpdateParameter("time", v),
            label: "Time",
            color: "#16a34a",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 787,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "feedback", 0.4),
            min: 0,
            max: 0.95,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            color: "#22c55e",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 789,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "lpf", 8e3),
            min: 200,
            max: 2e4,
            onChange: (v) => onUpdateParameter("lpf", v),
            label: "LPF",
            color: "#4ade80",
            formatValue: (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 791,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "hpf", 60),
            min: 20,
            max: 2e3,
            onChange: (v) => onUpdateParameter("hpf", v),
            label: "HPF",
            color: "#86efac",
            formatValue: (v) => `${Math.round(v)} Hz`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 794,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 786,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 783,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 800,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 799,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 798,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 781,
    columnNumber: 5
  }, void 0);
};
const DellaEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#0891b2" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 812,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#0891b2", title: "Della" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 814,
        columnNumber: 9
      }, void 0),
      renderBpmSync(effect, onUpdateParameter),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "time", 300),
            min: 10,
            max: 2e3,
            onChange: (v) => onUpdateParameter("time", v),
            label: "Time",
            color: "#0891b2",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 817,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "feedback", 0.5),
            min: 0,
            max: 0.95,
            onChange: (v) => onUpdateParameter("feedback", v),
            label: "Feedback",
            color: "#06b6d4",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 819,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "volume", 0.7),
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("volume", v),
            label: "Volume",
            color: "#22d3ee",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 821,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 823,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 816,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 813,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 811,
    columnNumber: 5
  }, void 0);
};
const BinauralPannerEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#0d9488" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 839,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#0d9488", title: "Binaural Panner" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 841,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "azimuth", 0),
            min: -180,
            max: 180,
            onChange: (v) => onUpdateParameter("azimuth", v),
            label: "Azimuth",
            color: "#0d9488",
            formatValue: (v) => `${Math.round(v)}°`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 843,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "elevation", 0),
            min: -90,
            max: 90,
            onChange: (v) => onUpdateParameter("elevation", v),
            label: "Elevation",
            color: "#14b8a6",
            formatValue: (v) => `${Math.round(v)}°`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 845,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "distance", 1),
            min: 0.1,
            max: 10,
            onChange: (v) => onUpdateParameter("distance", v),
            label: "Distance",
            color: "#2dd4bf",
            formatValue: (v) => v.toFixed(1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 847,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 849,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 842,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 840,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 838,
    columnNumber: 5
  }, void 0);
};
const HaasEnhancerEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#0ea5e9", title: "Haas Enhancer" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 861,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: getParam(effect, "delay", 10),
          min: 0.5,
          max: 40,
          onChange: (v) => onUpdateParameter("delay", v),
          label: "Delay",
          color: "#0ea5e9",
          formatValue: (v) => `${v.toFixed(1)} ms`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 863,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: getParam(effect, "side", 0),
          min: -1,
          max: 1,
          onChange: (v) => onUpdateParameter("side", v),
          label: "Side",
          color: "#38bdf8",
          formatValue: (v) => v < 0 ? `L ${Math.round(-v * 100)}%` : `R ${Math.round(v * 100)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 865,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 867,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 862,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 860,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 859,
    columnNumber: 5
  }, void 0);
};
const MultiSpreadEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#6366f1", title: "Multi Spread" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 879,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: getParam(effect, "bands", 4),
          min: 2,
          max: 8,
          step: 1,
          onChange: (v) => onUpdateParameter("bands", Math.round(v)),
          label: "Bands",
          color: "#6366f1",
          formatValue: (v) => `${Math.round(v)}`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 881,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: getParam(effect, "spread", 0.7),
          min: 0,
          max: 1,
          onChange: (v) => onUpdateParameter("spread", v),
          label: "Spread",
          color: "#818cf8",
          formatValue: (v) => `${Math.round(v * 100)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 883,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 885,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 880,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 878,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 877,
    columnNumber: 5
  }, void 0);
};
const MultibandEnhancerEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#7c3aed", title: "Multiband Enhancer" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 897,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "lowWidth", 1),
            min: 0,
            max: 3,
            onChange: (v) => onUpdateParameter("lowWidth", v),
            label: "Low W",
            color: "#6d28d9",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 899,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "midWidth", 1),
            min: 0,
            max: 3,
            onChange: (v) => onUpdateParameter("midWidth", v),
            label: "Mid W",
            color: "#7c3aed",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 901,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "highWidth", 1),
            min: 0,
            max: 3,
            onChange: (v) => onUpdateParameter("highWidth", v),
            label: "Hi W",
            color: "#8b5cf6",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 903,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "topWidth", 1),
            min: 0,
            max: 3,
            onChange: (v) => onUpdateParameter("topWidth", v),
            label: "Top W",
            color: "#a78bfa",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 905,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "harmonics", 0),
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("harmonics", v),
            label: "Harmonics",
            color: "#c4b5fd",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 907,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 898,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 896,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 913,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 912,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 911,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 895,
    columnNumber: 5
  }, void 0);
};
const VihdaEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#4f46e5", title: "Vihda" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 925,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: getParam(effect, "width", 1),
          min: 0,
          max: 3,
          onChange: (v) => onUpdateParameter("width", v),
          label: "Width",
          color: "#4f46e5",
          formatValue: (v) => v.toFixed(2)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 927,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: getParam(effect, "invert", 0),
          min: 0,
          max: 1,
          step: 1,
          onChange: (v) => onUpdateParameter("invert", Math.round(v)),
          label: "Invert",
          color: "#6366f1",
          formatValue: (v) => Math.round(v) ? "ON" : "OFF"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 929,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 932,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 926,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 924,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 923,
    columnNumber: 5
  }, void 0);
};
const MashaEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const active = getParam(effect, "active", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#dc2626" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 949,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#dc2626", title: "Masha" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 951,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center mb-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onPointerDown: () => onUpdateParameter("active", 1),
          onPointerUp: () => onUpdateParameter("active", 0),
          onPointerLeave: () => {
            if (active >= 0.5) onUpdateParameter("active", 0);
          },
          className: `px-6 py-2 rounded-lg text-sm font-bold border-2 transition-all select-none ${active >= 0.5 ? "bg-red-600 border-red-400 text-white shadow-lg shadow-red-600/40 animate-pulse" : "bg-black/40 border-dark-border text-text-muted hover:border-red-700"}`,
          children: active >= 0.5 ? "ACTIVE" : "HOLD"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 953,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 952,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "time", 100),
            min: 1,
            max: 500,
            onChange: (v) => onUpdateParameter("time", v),
            label: "Time",
            color: "#dc2626",
            formatValue: (v) => `${Math.round(v)} ms`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 964,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "volume", 1),
            min: 0,
            max: 2,
            onChange: (v) => onUpdateParameter("volume", v),
            label: "Volume",
            color: "#ef4444",
            formatValue: (v) => v.toFixed(2)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 966,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "passthrough", 0),
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("passthrough", v),
            label: "Pass",
            color: "#f87171",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 968,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 970,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 963,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 950,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 948,
    columnNumber: 5
  }, void 0);
};
const BittaEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#16a34a" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 982,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#16a34a", title: "Bitta" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 984,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "crush", 8),
            min: 1,
            max: 16,
            step: 1,
            onChange: (v) => onUpdateParameter("crush", Math.round(v)),
            label: "Crush",
            color: "#16a34a",
            formatValue: (v) => `${Math.round(v)} bit`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 986,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: effect.wet,
            min: 0,
            max: 100,
            onChange: onUpdateWet,
            label: "Mix",
            color: "#6b7280",
            formatValue: (v) => `${Math.round(v)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 988,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 985,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 983,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 981,
    columnNumber: 5
  }, void 0);
};
const VinylEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#78350f" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1e3,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#78350f", title: "Vinyl" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1002,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end flex-wrap gap-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "crackle", 0.3),
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("crackle", v),
            label: "Crackle",
            color: "#78350f",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1004,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "noise", 0.2),
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("noise", v),
            label: "Noise",
            color: "#92400e",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1006,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "rumble", 0.1),
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("rumble", v),
            label: "Rumble",
            color: "#b45309",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1008,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "wear", 0.3),
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("wear", v),
            label: "Wear",
            color: "#d97706",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1010,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: getParam(effect, "speed", 0.5),
            min: 0,
            max: 1,
            onChange: (v) => onUpdateParameter("speed", v),
            label: "Speed",
            color: "#f59e0b",
            formatValue: (v) => `${Math.round(v * 100)}%`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1012,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1003,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1001,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1018,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1017,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1016,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 999,
    columnNumber: 5
  }, void 0);
};
const fmtFreq = (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)} Hz`;
const EQ8BandEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const hpFreq = getParam(effect, "hpFreq", 20);
  const lpFreq = getParam(effect, "lpFreq", 2e4);
  const lowShelfFreq = getParam(effect, "lowShelfFreq", 100);
  const lowShelfGain = getParam(effect, "lowShelfGain", 0);
  const highShelfFreq = getParam(effect, "highShelfFreq", 8e3);
  const highShelfGain = getParam(effect, "highShelfGain", 0);
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  const peakDefaults = [250, 1e3, 3500, 8e3];
  const eqBands = [
    { type: "highpass", freq: hpFreq, gain: 0, q: 0.7 },
    { type: "lowShelf", freq: lowShelfFreq, gain: lowShelfGain, q: 0.7 },
    ...[1, 2, 3, 4].map((b) => ({
      type: "peaking",
      freq: getParam(effect, `peak${b}Freq`, peakDefaults[b - 1]),
      gain: getParam(effect, `peak${b}Gain`, 0),
      q: getParam(effect, `peak${b}Q`, 1)
    })),
    { type: "highShelf", freq: highShelfFreq, gain: highShelfGain, q: 0.7 },
    { type: "lowpass", freq: lpFreq, gain: 0, q: 0.7 }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EQCurve, { bands: eqBands, color: "#3b82f6", height: 130, dbRange: 24 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1057,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#3b82f6", height: 60 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1058,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#3b82f6", title: "Filters" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1060,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: hpFreq,
            min: 20,
            max: 2e3,
            onChange: (v) => onUpdateParameter("hpFreq", v),
            label: "HP Freq",
            color: "#60a5fa",
            formatValue: fmtFreq
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1062,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lpFreq,
            min: 1e3,
            max: 2e4,
            onChange: (v) => onUpdateParameter("lpFreq", v),
            label: "LP Freq",
            color: "#60a5fa",
            formatValue: fmtFreq
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1064,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1061,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1059,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#2563eb", title: "Shelves" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1069,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: lowShelfFreq,
            min: 20,
            max: 1e3,
            onChange: (v) => onUpdateParameter("lowShelfFreq", v),
            label: "Lo Freq",
            color: "#3b82f6",
            formatValue: fmtFreq
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1071,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: lowShelfGain,
            min: -36,
            max: 36,
            onChange: (v) => onUpdateParameter("lowShelfGain", v),
            label: "Lo Gain",
            color: "#3b82f6"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1073,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: highShelfFreq,
            min: 1e3,
            max: 2e4,
            onChange: (v) => onUpdateParameter("highShelfFreq", v),
            label: "Hi Freq",
            color: "#60a5fa",
            formatValue: fmtFreq
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1075,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: highShelfGain,
            min: -36,
            max: 36,
            onChange: (v) => onUpdateParameter("highShelfGain", v),
            label: "Hi Gain",
            color: "#60a5fa"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1077,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1070,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1068,
      columnNumber: 7
    }, void 0),
    [1, 2, 3, 4].map((band) => {
      const freq = getParam(effect, `peak${band}Freq`, peakDefaults[band - 1]);
      const gain = getParam(effect, `peak${band}Gain`, 0);
      const q = getParam(effect, `peak${band}Q`, 1);
      const colors = ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"];
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: colors[band - 1], title: `Peak ${band}` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 1088,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: freq,
              min: 20,
              max: 2e4,
              onChange: (v) => onUpdateParameter(`peak${band}Freq`, v),
              label: "Freq",
              color: colors[band - 1],
              formatValue: fmtFreq
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
              lineNumber: 1090,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            EQSlider,
            {
              value: gain,
              min: -36,
              max: 36,
              onChange: (v) => onUpdateParameter(`peak${band}Gain`, v),
              label: "Gain",
              color: colors[band - 1]
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
              lineNumber: 1092,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: q,
              min: 0.1,
              max: 10,
              onChange: (v) => onUpdateParameter(`peak${band}Q`, v),
              label: "Q",
              color: colors[band - 1],
              formatValue: (v) => v.toFixed(2)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
              lineNumber: 1094,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 1089,
          columnNumber: 13
        }, void 0)
      ] }, band, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1087,
        columnNumber: 11
      }, void 0);
    }),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1102,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1101,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1100,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 1056,
    columnNumber: 5
  }, void 0);
};
const EQ12_FREQS = [30, 80, 160, 400, 800, 1500, 3e3, 5e3, 8e3, 12e3, 14e3, 18e3];
const EQ12_COLORS = [
  "#1e3a5f",
  "#1e40af",
  "#2563eb",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#7dd3fc",
  "#38bdf8",
  "#0ea5e9",
  "#0284c7",
  "#0369a1",
  "#075985"
];
const EQ12BandEditor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  const eqBands = EQ12_FREQS.map((freq, i) => ({
    type: "peaking",
    freq,
    gain: getParam(effect, `gain_${i}`, 0),
    q: getParam(effect, `q_${i}`, 1)
  }));
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EQCurve, { bands: eqBands, color: "#3b82f6", height: 130, dbRange: 24 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1130,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#3b82f6", height: 60 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1131,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#3b82f6", title: "12-Band EQ" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1133,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-around items-end gap-1", children: EQ12_FREQS.map((defaultFreq, i) => {
        const gain = getParam(effect, `gain_${i}`, 0);
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: gain,
            min: -36,
            max: 36,
            onChange: (v) => onUpdateParameter(`gain_${i}`, v),
            label: fmtFreq(defaultFreq),
            color: EQ12_COLORS[i],
            height: 120
          },
          i,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1138,
            columnNumber: 15
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1134,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1132,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#60a5fa", title: "Q & Mix" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1146,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-6 gap-x-2 gap-y-4", children: EQ12_FREQS.map((_, i) => {
        const q = getParam(effect, `q_${i}`, 1);
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: q,
            min: 0.1,
            max: 10,
            onChange: (v) => onUpdateParameter(`q_${i}`, v),
            label: "",
            color: "#6b7280",
            size: "sm",
            formatValue: (v) => `Q ${v.toFixed(1)}`
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1152,
            columnNumber: 17
          },
          void 0
        ) }, i, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 1151,
          columnNumber: 15
        }, void 0);
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1147,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center mt-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: effect.wet,
          min: 0,
          max: 100,
          onChange: onUpdateWet,
          label: "Mix",
          color: "#6b7280",
          formatValue: (v) => `${Math.round(v)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
          lineNumber: 1160,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1159,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1145,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 1129,
    columnNumber: 5
  }, void 0);
};
const GEQ31_FREQS = [
  20,
  25,
  31.5,
  40,
  50,
  63,
  80,
  100,
  125,
  160,
  200,
  250,
  315,
  400,
  500,
  630,
  800,
  1e3,
  1250,
  1600,
  2e3,
  2500,
  3150,
  4e3,
  5e3,
  6300,
  8e3,
  1e4,
  12500,
  16e3,
  2e4
];
const GEQ31Editor = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, "fft");
  const eqBands = GEQ31_FREQS.map((freq, i) => ({
    type: "peaking",
    freq,
    gain: getParam(effect, `band_${i}`, 0),
    q: 2.5
  }));
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EQCurve, { bands: eqBands, color: "#3b82f6", height: 130, dbRange: 12 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1188,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectSpectrum, { pre, post, color: "#3b82f6", height: 60 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1189,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#3b82f6", title: "31-Band Graphic EQ" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1191,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-[2px] items-end justify-center overflow-x-auto py-2", children: GEQ31_FREQS.map((freq, i) => {
        const gain = getParam(effect, `band_${i}`, 0);
        const hue = 210 + i / 30 * 60;
        const color = `hsl(${hue}, 70%, 55%)`;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EQSlider,
          {
            value: gain,
            min: -12,
            max: 12,
            onChange: (v) => onUpdateParameter(`band_${i}`, v),
            label: freq >= 1e3 ? `${(freq / 1e3).toFixed(freq >= 1e4 ? 0 : 1)}k` : `${freq}`,
            color,
            height: 140,
            width: 22
          },
          i,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
            lineNumber: 1198,
            columnNumber: 15
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1192,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1190,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: effect.wet,
        min: 0,
        max: 100,
        onChange: onUpdateWet,
        label: "Mix",
        color: "#6b7280",
        formatValue: (v) => `${Math.round(v)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
        lineNumber: 1208,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1207,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
      lineNumber: 1206,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/EQModReverbEditors.tsx",
    lineNumber: 1187,
    columnNumber: 5
  }, void 0);
};
const EFFECT_EDITORS = {
  Distortion: DistortionEditor,
  Reverb: ReverbEditor,
  Delay: DelayEditor,
  FeedbackDelay: DelayEditor,
  PingPongDelay: DelayEditor,
  Chorus: ChorusEditor,
  Phaser: PhaserEditor,
  Tremolo: TremoloEditor,
  Vibrato: VibratoEditor,
  AutoFilter: AutoFilterEditor,
  AutoPanner: AutoPannerEditor,
  AutoWah: AutoWahEditor,
  BitCrusher: BitCrusherEditor,
  Chebyshev: ChebyshevEditor,
  FrequencyShifter: FrequencyShifterEditor,
  PitchShift: PitchShiftEditor,
  Compressor: CompressorEditor,
  EQ3: EQ3Editor,
  Filter: FilterEditor,
  JCReverb: JCReverbEditor,
  StereoWidener: StereoWidenerEditor,
  SpaceEcho: SpaceEchoEditor,
  BiPhase: BiPhaseEditor,
  DubFilter: DubFilterEditor,
  TapeSaturation: TapeSaturationEditor,
  Tumult: TumultEditor,
  VinylNoise: VinylNoiseEditor,
  ToneArm: ToneArmEditor,
  TapeSimulator: KissOfShameEditor,
  SidechainCompressor: SidechainCompressorEditor,
  SpaceyDelayer: SpaceyDelayerEditor,
  RETapeEcho: RETapeEchoEditor,
  MoogFilter: MoogFilterEditor,
  Vocoder: VocoderEditor,
  AutoTune: AutoTuneEditor,
  MVerb: MVerbEditor,
  Leslie: LeslieEditor,
  SpringReverb: SpringReverbEditor,
  Aelapse: AelapseEditor,
  TapeDegradation: TapeDegradationEditor,
  AmbientDelay: AmbientDelayEditor,
  ShimmerReverb: ShimmerReverbEditor,
  GranularFreeze: GranularFreezeEditor,
  // Zynthian-ported dynamics effects
  NoiseGate: NoiseGateEditor,
  Limiter: LimiterEditor,
  MonoComp: MonoCompEditor,
  Expander: ExpanderEditor,
  Clipper: ClipperEditor,
  DeEsser: DeEsserEditor,
  MultibandComp: MultibandCompEditor,
  TransientDesigner: TransientDesignerEditor,
  DynamicsProc: DynamicsProcEditor,
  X42Comp: X42CompEditor,
  GOTTComp: GOTTCompEditor,
  SidechainGate: SidechainGateEditor,
  SidechainLimiter: SidechainLimiterEditor,
  MultibandGate: MultibandGateEditor,
  MultibandLimiter: MultibandLimiterEditor,
  Maximizer: MaximizerEditor,
  AGC: AGCEditor,
  BeatBreather: BeatBreatherEditor,
  Ducka: DuckaEditor,
  Panda: PandaEditor,
  MultibandClipper: MultibandClipperEditor,
  MultibandDynamics: MultibandDynamicsEditor,
  MultibandExpander: MultibandExpanderEditor,
  // Zynthian-ported distortion/saturation effects
  Overdrive: OverdriveEditor,
  Saturator: SaturatorEditor,
  Exciter: ExciterEditor,
  AutoSat: AutoSatEditor,
  Satma: SatmaEditor,
  DistortionShaper: DistortionShaperEditor,
  TubeAmp: TubeAmpEditor,
  CabinetSim: CabinetSimEditor,
  Driva: DrivaEditor,
  BassEnhancer: BassEnhancerEditor,
  // Zynthian-ported EQ effects
  ParametricEQ: ParametricEQEditor,
  EQ5Band: EQ5BandEditor,
  EQ8Band: EQ8BandEditor,
  EQ12Band: EQ12BandEditor,
  GEQ31: GEQ31Editor,
  ZamEQ2: ZamEQ2Editor,
  PhonoFilter: PhonoFilterEditor,
  DynamicEQ: DynamicEQEditor,
  Kuiza: KuizaEditor,
  // Zynthian-ported modulation effects
  Flanger: FlangerEditor,
  JunoChorus: JunoChorusEditor,
  MultiChorus: MultiChorusEditor,
  CalfPhaser: CalfPhaserEditor,
  Pulsator: PulsatorEditor,
  RingMod: RingModEditor,
  // Zynthian-ported reverb/delay effects
  DragonflyHall: DragonflyHallEditor,
  DragonflyPlate: DragonflyPlateEditor,
  DragonflyRoom: DragonflyRoomEditor,
  EarlyReflections: EarlyReflectionsEditor,
  Roomy: RoomyEditor,
  ReverseDelay: ReverseDelayEditor,
  VintageDelay: VintageDelayEditor,
  ArtisticDelay: ArtisticDelayEditor,
  SlapbackDelay: SlapbackDelayEditor,
  ZamDelay: ZamDelayEditor,
  Della: DellaEditor,
  // Zynthian-ported stereo/spatial effects
  BinauralPanner: BinauralPannerEditor,
  HaasEnhancer: HaasEnhancerEditor,
  MultiSpread: MultiSpreadEditor,
  MultibandEnhancer: MultibandEnhancerEditor,
  Vihda: VihdaEditor,
  // Zynthian-ported creative/lo-fi effects
  Masha: MashaEditor,
  Bitta: BittaEditor,
  Vinyl: VinylEditor,
  // Buzzmachine WASM effects — dynamic knob editor
  BuzzDistortion: BuzzmachineEditor,
  BuzzOverdrive: BuzzmachineEditor,
  BuzzDistortion2: BuzzmachineEditor,
  BuzzDist2: BuzzmachineEditor,
  BuzzSoftSat: BuzzmachineEditor,
  BuzzStereoDist: BuzzmachineEditor,
  BuzzSVF: BuzzmachineEditor,
  BuzzPhilta: BuzzmachineEditor,
  BuzzNotch: BuzzmachineEditor,
  BuzzZfilter: BuzzmachineEditor,
  BuzzDelay: BuzzmachineEditor,
  BuzzCrossDelay: BuzzmachineEditor,
  BuzzFreeverb: BuzzmachineEditor,
  BuzzPanzerDelay: BuzzmachineEditor,
  BuzzChorus: BuzzmachineEditor,
  BuzzChorus2: BuzzmachineEditor,
  BuzzWhiteChorus: BuzzmachineEditor,
  BuzzFreqShift: BuzzmachineEditor,
  BuzzCompressor: BuzzmachineEditor,
  BuzzLimiter: BuzzmachineEditor,
  BuzzExciter: BuzzmachineEditor,
  BuzzMasterizer: BuzzmachineEditor,
  BuzzStereoGain: BuzzmachineEditor,
  // WAM 2.0 effects — embed native plugin GUI
  WAMBigMuff: WAMEffectEditor,
  WAMTS9: WAMEffectEditor,
  WAMDistoMachine: WAMEffectEditor,
  WAMQuadraFuzz: WAMEffectEditor,
  WAMVoxAmp: WAMEffectEditor,
  WAMStonePhaser: WAMEffectEditor,
  WAMPingPongDelay: WAMEffectEditor,
  WAMFaustDelay: WAMEffectEditor,
  WAMPitchShifter: WAMEffectEditor,
  WAMGraphicEQ: WAMEffectEditor,
  WAMPedalboard: WAMEffectEditor
};
function getVisualEffectEditor(effectType) {
  return EFFECT_EDITORS[effectType] || GenericEffectEditor;
}
const ENCLOSURE_COLORS = {
  Distortion: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#ef4444", border: "#3a1a0a" },
  Reverb: { bg: "#0e0a20", bgEnd: "#080618", accent: "#6366f1", border: "#1a1430" },
  JCReverb: { bg: "#0e0a20", bgEnd: "#080618", accent: "#6366f1", border: "#1a1430" },
  Delay: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  FeedbackDelay: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  PingPongDelay: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  Chorus: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  Phaser: { bg: "#180a20", bgEnd: "#100618", accent: "#a855f7", border: "#281430" },
  Tremolo: { bg: "#201408", bgEnd: "#180e04", accent: "#f97316", border: "#301e0a" },
  Vibrato: { bg: "#081a18", bgEnd: "#041210", accent: "#14b8a6", border: "#0a2a28" },
  Compressor: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  EQ3: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  Filter: { bg: "#201408", bgEnd: "#180e04", accent: "#f97316", border: "#301e0a" },
  StereoWidener: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  AutoFilter: { bg: "#1a1808", bgEnd: "#121004", accent: "#eab308", border: "#2a280a" },
  AutoPanner: { bg: "#081a0a", bgEnd: "#041204", accent: "#22c55e", border: "#0a2a0e" },
  AutoWah: { bg: "#200a10", bgEnd: "#18060a", accent: "#f43f5e", border: "#301418" },
  BitCrusher: { bg: "#141a08", bgEnd: "#0e1204", accent: "#84cc16", border: "#1e2a0a" },
  Chebyshev: { bg: "#1a1508", bgEnd: "#120e04", accent: "#f59e0b", border: "#2a2008" },
  FrequencyShifter: { bg: "#081820", bgEnd: "#041018", accent: "#06b6d4", border: "#0a2830" },
  PitchShift: { bg: "#100a20", bgEnd: "#0a0618", accent: "#8b5cf6", border: "#1a1430" },
  SpaceyDelayer: { bg: "#100a20", bgEnd: "#0a0618", accent: "#8b5cf6", border: "#1a1430" },
  SpaceEcho: { bg: "#0e0a20", bgEnd: "#080618", accent: "#6366f1", border: "#1a1430" },
  BiPhase: { bg: "#180a20", bgEnd: "#100618", accent: "#a855f7", border: "#281430" },
  DubFilter: { bg: "#081a0a", bgEnd: "#041204", accent: "#22c55e", border: "#0a2a0e" },
  TapeSaturation: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#ef4444", border: "#3a1a0a" },
  Tumult: { bg: "#0d0a1a", bgEnd: "#080612", accent: "#7c3aed", border: "#1a1030" },
  VinylNoise: { bg: "#1a1008", bgEnd: "#120a04", accent: "#d97706", border: "#2a1a08" },
  ToneArm: { bg: "#0a1a04", bgEnd: "#061204", accent: "#a3e635", border: "#102a08" },
  SidechainCompressor: { bg: "#081a10", bgEnd: "#04120a", accent: "#10b981", border: "#0a2a18" },
  RETapeEcho: { bg: "#2a0808", bgEnd: "#1a0404", accent: "#dc2626", border: "#3a1010" },
  TapeSimulator: { bg: "#1a1208", bgEnd: "#120e04", accent: "#b45309", border: "#2a1e08" },
  MoogFilter: { bg: "#1a1508", bgEnd: "#120e04", accent: "#f59e0b", border: "#2a2008" },
  Vocoder: { bg: "#1a0a22", bgEnd: "#100618", accent: "#a855f7", border: "#2a1430" },
  AutoTune: { bg: "#220a18", bgEnd: "#180614", accent: "#ec4899", border: "#321428" },
  MVerb: { bg: "#140a22", bgEnd: "#0c061a", accent: "#7c3aed", border: "#201432" },
  Leslie: { bg: "#201408", bgEnd: "#180e04", accent: "#f97316", border: "#301e0a" },
  SpringReverb: { bg: "#081a0a", bgEnd: "#041204", accent: "#059669", border: "#0a2a0e" },
  // ── WASM effects — Dynamics ──
  NoiseGate: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  Limiter: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  DeEsser: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  MultibandComp: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  TransientDesigner: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  Expander: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  MonoComp: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  SidechainGate: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  MultibandGate: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  MultibandLimiter: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  SidechainLimiter: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  Clipper: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  DynamicsProc: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  X42Comp: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  Ducka: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  BeatBreather: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  MultibandClipper: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  MultibandDynamics: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  MultibandExpander: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  GOTTComp: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  Maximizer: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  AGC: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  Panda: { bg: "#081a0a", bgEnd: "#041204", accent: "#10b981", border: "#0a2a0e" },
  // ── WASM effects — Distortion ──
  Overdrive: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#ef4444", border: "#3a1a0a" },
  CabinetSim: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#ef4444", border: "#3a1a0a" },
  TubeAmp: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#ef4444", border: "#3a1a0a" },
  Saturator: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#ef4444", border: "#3a1a0a" },
  Exciter: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#f97316", border: "#3a1a0a" },
  AutoSat: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#ef4444", border: "#3a1a0a" },
  Satma: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#dc2626", border: "#3a1a0a" },
  DistortionShaper: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#ef4444", border: "#3a1a0a" },
  Driva: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#dc2626", border: "#3a1a0a" },
  // ── WASM effects — Modulation ──
  Flanger: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  RingMod: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  JunoChorus: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  Pulsator: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  MultiChorus: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  CalfPhaser: { bg: "#180a20", bgEnd: "#100618", accent: "#a855f7", border: "#281430" },
  // ── WASM effects — Reverb & Delay ──
  DragonflyPlate: { bg: "#0e0a20", bgEnd: "#080618", accent: "#6366f1", border: "#1a1430" },
  DragonflyHall: { bg: "#0e0a20", bgEnd: "#080618", accent: "#6366f1", border: "#1a1430" },
  DragonflyRoom: { bg: "#0e0a20", bgEnd: "#080618", accent: "#6366f1", border: "#1a1430" },
  ReverseDelay: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  VintageDelay: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  ArtisticDelay: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  SlapbackDelay: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  ZamDelay: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  EarlyReflections: { bg: "#0e0a20", bgEnd: "#080618", accent: "#6366f1", border: "#1a1430" },
  Della: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  Roomy: { bg: "#0e0a20", bgEnd: "#080618", accent: "#6366f1", border: "#1a1430" },
  // ── WASM effects — EQ & Filter ──
  ParametricEQ: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  BassEnhancer: { bg: "#201408", bgEnd: "#180e04", accent: "#f59e0b", border: "#301e0a" },
  EQ5Band: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  EQ8Band: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  EQ12Band: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  GEQ31: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  ZamEQ2: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  PhonoFilter: { bg: "#201408", bgEnd: "#180e04", accent: "#f59e0b", border: "#301e0a" },
  DynamicEQ: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  Kuiza: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  // ── WASM effects — Stereo & Spatial ──
  HaasEnhancer: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  MultiSpread: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  MultibandEnhancer: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  BinauralPanner: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  Vihda: { bg: "#200a18", bgEnd: "#180614", accent: "#ec4899", border: "#301428" },
  // ── WASM effects — Creative / Lo-Fi ──
  Masha: { bg: "#0d0a1a", bgEnd: "#080612", accent: "#7c3aed", border: "#1a1030" },
  Vinyl: { bg: "#1a1008", bgEnd: "#120a04", accent: "#d97706", border: "#2a1a08" },
  Bitta: { bg: "#1a1008", bgEnd: "#120a04", accent: "#d97706", border: "#2a1a08" },
  // WAM 2.0 effects
  WAMBigMuff: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#ef4444", border: "#3a1a0a" },
  WAMTS9: { bg: "#201408", bgEnd: "#180e04", accent: "#f97316", border: "#301e0a" },
  WAMDistoMachine: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#dc2626", border: "#3a1a0a" },
  WAMQuadraFuzz: { bg: "#2a1008", bgEnd: "#1a0a04", accent: "#ef4444", border: "#3a1a0a" },
  WAMVoxAmp: { bg: "#201408", bgEnd: "#180e04", accent: "#f97316", border: "#301e0a" },
  WAMStonePhaser: { bg: "#180a20", bgEnd: "#100618", accent: "#a855f7", border: "#281430" },
  WAMPingPongDelay: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  WAMFaustDelay: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  WAMPitchShifter: { bg: "#100a20", bgEnd: "#0a0618", accent: "#8b5cf6", border: "#1a1430" },
  WAMGraphicEQ: { bg: "#081420", bgEnd: "#040e18", accent: "#3b82f6", border: "#0a1e30" },
  WAMPedalboard: { bg: "#081a18", bgEnd: "#041210", accent: "#14b8a6", border: "#0a2a28" }
};
const DEFAULT_ENCLOSURE = { bg: "#181818", bgEnd: "#101010", accent: "#888", border: "#282828" };
const ENCLOSURE_SHADOW = [
  "0 6px 16px rgba(0,0,0,0.5)",
  "0 2px 4px rgba(0,0,0,0.7)",
  "inset 0 1px 0 rgba(255,255,255,0.06)",
  "inset 0 -1px 0 rgba(0,0,0,0.4)"
].join(", ");
const EffectEditorDispatch = ({
  effectType,
  ...props
}) => {
  const Editor = EFFECT_EDITORS[effectType] || GenericEffectEditor;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Editor, { ...props }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
    lineNumber: 402,
    columnNumber: 10
  }, void 0);
};
const VisualEffectEditorWrapper = ({
  effect,
  onUpdateParameter,
  onUpdateParameters,
  onUpdateWet,
  onClose
}) => {
  const iconMap = {
    Distortion: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 415,
      columnNumber: 17
    }, void 0),
    Reverb: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 416,
      columnNumber: 13
    }, void 0),
    JCReverb: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 417,
      columnNumber: 15
    }, void 0),
    Delay: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Clock, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 418,
      columnNumber: 12
    }, void 0),
    FeedbackDelay: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Clock, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 419,
      columnNumber: 20
    }, void 0),
    PingPongDelay: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Clock, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 420,
      columnNumber: 20
    }, void 0),
    Chorus: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 421,
      columnNumber: 13
    }, void 0),
    Phaser: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 422,
      columnNumber: 13
    }, void 0),
    Tremolo: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Wind, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 423,
      columnNumber: 14
    }, void 0),
    Vibrato: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Wind, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 424,
      columnNumber: 14
    }, void 0),
    Compressor: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 425,
      columnNumber: 17
    }, void 0),
    EQ3: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 426,
      columnNumber: 10
    }, void 0),
    Filter: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 427,
      columnNumber: 13
    }, void 0),
    StereoWidener: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowLeftRight, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 428,
      columnNumber: 20
    }, void 0),
    SpaceyDelayer: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Clock, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 429,
      columnNumber: 20
    }, void 0),
    SpaceEcho: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 430,
      columnNumber: 16
    }, void 0),
    BiPhase: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 431,
      columnNumber: 14
    }, void 0),
    DubFilter: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 432,
      columnNumber: 16
    }, void 0),
    TapeSaturation: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 433,
      columnNumber: 21
    }, void 0),
    Tumult: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 434,
      columnNumber: 13
    }, void 0),
    VinylNoise: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 435,
      columnNumber: 17
    }, void 0),
    ToneArm: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 436,
      columnNumber: 14
    }, void 0),
    SidechainCompressor: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 437,
      columnNumber: 26
    }, void 0),
    RETapeEcho: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 438,
      columnNumber: 17
    }, void 0),
    TapeSimulator: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 439,
      columnNumber: 20
    }, void 0),
    MoogFilter: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 440,
      columnNumber: 17
    }, void 0),
    MVerb: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 441,
      columnNumber: 12
    }, void 0),
    Leslie: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 442,
      columnNumber: 13
    }, void 0),
    SpringReverb: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 443,
      columnNumber: 19
    }, void 0),
    // WAM 2.0 effects
    WAMBigMuff: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 445,
      columnNumber: 17
    }, void 0),
    WAMTS9: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 446,
      columnNumber: 13
    }, void 0),
    WAMDistoMachine: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 447,
      columnNumber: 22
    }, void 0),
    WAMQuadraFuzz: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 448,
      columnNumber: 20
    }, void 0),
    WAMVoxAmp: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 449,
      columnNumber: 16
    }, void 0),
    WAMStonePhaser: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 450,
      columnNumber: 21
    }, void 0),
    WAMPingPongDelay: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 451,
      columnNumber: 23
    }, void 0),
    WAMFaustDelay: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 452,
      columnNumber: 20
    }, void 0),
    WAMPitchShifter: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 453,
      columnNumber: 22
    }, void 0),
    WAMGraphicEQ: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 454,
      columnNumber: 19
    }, void 0),
    WAMPedalboard: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 455,
      columnNumber: 20
    }, void 0),
    // ── WASM Dynamics ──
    NoiseGate: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 457,
      columnNumber: 16
    }, void 0),
    Limiter: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 458,
      columnNumber: 14
    }, void 0),
    DeEsser: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 459,
      columnNumber: 14
    }, void 0),
    MultibandComp: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 460,
      columnNumber: 20
    }, void 0),
    TransientDesigner: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 461,
      columnNumber: 24
    }, void 0),
    Expander: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 462,
      columnNumber: 15
    }, void 0),
    MonoComp: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 463,
      columnNumber: 15
    }, void 0),
    SidechainGate: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 464,
      columnNumber: 20
    }, void 0),
    MultibandGate: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 465,
      columnNumber: 20
    }, void 0),
    MultibandLimiter: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 466,
      columnNumber: 23
    }, void 0),
    SidechainLimiter: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 467,
      columnNumber: 23
    }, void 0),
    Clipper: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 468,
      columnNumber: 14
    }, void 0),
    DynamicsProc: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 469,
      columnNumber: 19
    }, void 0),
    X42Comp: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 470,
      columnNumber: 14
    }, void 0),
    Ducka: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 471,
      columnNumber: 12
    }, void 0),
    BeatBreather: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 472,
      columnNumber: 19
    }, void 0),
    MultibandClipper: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 473,
      columnNumber: 23
    }, void 0),
    MultibandDynamics: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 474,
      columnNumber: 24
    }, void 0),
    MultibandExpander: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 475,
      columnNumber: 24
    }, void 0),
    GOTTComp: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 476,
      columnNumber: 15
    }, void 0),
    Maximizer: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 477,
      columnNumber: 16
    }, void 0),
    AGC: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 478,
      columnNumber: 10
    }, void 0),
    Panda: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Gauge, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 479,
      columnNumber: 12
    }, void 0),
    // ── WASM Distortion ──
    Overdrive: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 481,
      columnNumber: 16
    }, void 0),
    CabinetSim: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 482,
      columnNumber: 17
    }, void 0),
    TubeAmp: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 483,
      columnNumber: 14
    }, void 0),
    Saturator: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 484,
      columnNumber: 16
    }, void 0),
    Exciter: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 485,
      columnNumber: 14
    }, void 0),
    AutoSat: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 486,
      columnNumber: 14
    }, void 0),
    Satma: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 487,
      columnNumber: 12
    }, void 0),
    DistortionShaper: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 488,
      columnNumber: 23
    }, void 0),
    Driva: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 489,
      columnNumber: 12
    }, void 0),
    // ── WASM Modulation ──
    Flanger: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 491,
      columnNumber: 14
    }, void 0),
    RingMod: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 492,
      columnNumber: 14
    }, void 0),
    JunoChorus: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 493,
      columnNumber: 17
    }, void 0),
    Pulsator: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 494,
      columnNumber: 15
    }, void 0),
    MultiChorus: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 495,
      columnNumber: 18
    }, void 0),
    CalfPhaser: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 496,
      columnNumber: 17
    }, void 0),
    // ── WASM Reverb & Delay ──
    DragonflyPlate: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 498,
      columnNumber: 21
    }, void 0),
    DragonflyHall: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 499,
      columnNumber: 20
    }, void 0),
    DragonflyRoom: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 500,
      columnNumber: 20
    }, void 0),
    ReverseDelay: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Clock, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 501,
      columnNumber: 19
    }, void 0),
    VintageDelay: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Clock, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 502,
      columnNumber: 19
    }, void 0),
    ArtisticDelay: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Clock, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 503,
      columnNumber: 20
    }, void 0),
    SlapbackDelay: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Clock, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 504,
      columnNumber: 20
    }, void 0),
    ZamDelay: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Clock, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 505,
      columnNumber: 15
    }, void 0),
    EarlyReflections: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 506,
      columnNumber: 23
    }, void 0),
    Della: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Clock, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 507,
      columnNumber: 12
    }, void 0),
    Roomy: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Waves, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 508,
      columnNumber: 12
    }, void 0),
    // ── WASM EQ & Filter ──
    ParametricEQ: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 510,
      columnNumber: 19
    }, void 0),
    BassEnhancer: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 511,
      columnNumber: 19
    }, void 0),
    EQ5Band: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 512,
      columnNumber: 14
    }, void 0),
    EQ8Band: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 513,
      columnNumber: 14
    }, void 0),
    EQ12Band: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 514,
      columnNumber: 15
    }, void 0),
    GEQ31: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 515,
      columnNumber: 12
    }, void 0),
    ZamEQ2: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 516,
      columnNumber: 13
    }, void 0),
    PhonoFilter: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 517,
      columnNumber: 18
    }, void 0),
    DynamicEQ: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 518,
      columnNumber: 16
    }, void 0),
    Kuiza: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 519,
      columnNumber: 12
    }, void 0),
    // ── WASM Stereo & Spatial ──
    HaasEnhancer: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowLeftRight, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 521,
      columnNumber: 19
    }, void 0),
    MultiSpread: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowLeftRight, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 522,
      columnNumber: 18
    }, void 0),
    MultibandEnhancer: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowLeftRight, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 523,
      columnNumber: 24
    }, void 0),
    BinauralPanner: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowLeftRight, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 524,
      columnNumber: 21
    }, void 0),
    Vihda: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowLeftRight, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 525,
      columnNumber: 12
    }, void 0),
    // ── WASM Creative / Lo-Fi ──
    Masha: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 527,
      columnNumber: 12
    }, void 0),
    Vinyl: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 528,
      columnNumber: 12
    }, void 0),
    Bitta: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc, { size: 18, className: "text-text-primary" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 529,
      columnNumber: 12
    }, void 0)
  };
  const effectType = effect.type ?? "";
  const enc = ENCLOSURE_COLORS[effectType] || DEFAULT_ENCLOSURE;
  const icon = iconMap[effectType] || /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 18, className: "text-text-primary" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
    lineNumber: 534,
    columnNumber: 39
  }, void 0);
  const isWAM = effectType.startsWith("WAM");
  if (isWAM) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "overflow-y-auto scrollbar-modern", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      EffectEditorDispatch,
      {
        effectType: effect.type,
        effect,
        onUpdateParameter,
        onUpdateParameters,
        onUpdateWet
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
        lineNumber: 541,
        columnNumber: 9
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 540,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "synth-editor-container rounded-xl overflow-hidden select-none",
      style: {
        background: `linear-gradient(170deg, ${enc.bg} 0%, ${enc.bgEnd} 100%)`,
        border: `2px solid ${enc.border}`,
        boxShadow: ENCLOSURE_SHADOW
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "px-5 py-4 flex items-center justify-between",
            style: {
              background: `linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)`,
              borderBottom: `1px solid ${enc.border}`
            },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "div",
                  {
                    className: "p-2 rounded-lg",
                    style: {
                      background: `linear-gradient(135deg, ${enc.accent}40, ${enc.accent}20)`,
                      border: `1px solid ${enc.accent}30`,
                      boxShadow: `0 0 12px ${enc.accent}15`
                    },
                    children: icon
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
                    lineNumber: 570,
                    columnNumber: 11
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-base font-black text-text-primary tracking-wide", children: effect.neuralModelName || effect.type }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
                    lineNumber: 581,
                    columnNumber: 13
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mt-0.5", children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "div",
                      {
                        style: {
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          backgroundColor: effect.enabled ? "#22ff44" : "#1a2a1a",
                          boxShadow: effect.enabled ? "0 0 4px 1px rgba(34,255,68,0.5), 0 0 10px 3px rgba(34,255,68,0.15)" : "inset 0 1px 2px rgba(0,0,0,0.5)",
                          transition: "all 0.3s ease"
                        }
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
                        lineNumber: 586,
                        columnNumber: 15
                      },
                      void 0
                    ),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[11px] text-text-secondary font-medium", children: [
                      effect.enabled ? "Active" : "Bypassed",
                      " | Mix: ",
                      effect.wet,
                      "%"
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
                      lineNumber: 598,
                      columnNumber: 15
                    }, void 0)
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
                    lineNumber: 584,
                    columnNumber: 13
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
                  lineNumber: 580,
                  columnNumber: 11
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
                lineNumber: 569,
                columnNumber: 9
              }, void 0),
              onClose && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: onClose,
                  className: "p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 16 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
                    lineNumber: 609,
                    columnNumber: 13
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
                  lineNumber: 605,
                  columnNumber: 11
                },
                void 0
              )
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
            lineNumber: 562,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-h-0 p-4 overflow-y-auto scrollbar-modern", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EffectEditorDispatch,
          {
            effectType: effect.type,
            effect,
            onUpdateParameter,
            onUpdateParameters,
            onUpdateWet
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
            lineNumber: 616,
            columnNumber: 9
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
          lineNumber: 615,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/editors/index.tsx",
      lineNumber: 553,
      columnNumber: 5
    },
    void 0
  );
};
export {
  DEFAULT_ENCLOSURE as D,
  ENCLOSURE_COLORS as E,
  VisualEffectEditorWrapper as V,
  EffectOscilloscope as a,
  getVisualEffectEditor as g,
  useEffectAnalyser as u
};
