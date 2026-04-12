import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React } from "./vendor-ui-AJ7AT9BN.js";
import { $ as getToneEngine } from "./main-BbV5VyEH.js";
function useVisualizationAnimation({
  onFrame,
  enabled = true,
  fps = 30,
  idleThreshold = 10
}) {
  const animationRef = reactExports.useRef(null);
  const lastFrameTimeRef = reactExports.useRef(0);
  const isAnimatingRef = reactExports.useRef(false);
  const idleFramesRef = reactExports.useRef(0);
  const onFrameRef = reactExports.useRef(onFrame);
  const frameIntervalRef = reactExports.useRef(1e3 / fps);
  const idleThresholdRef = reactExports.useRef(idleThreshold);
  reactExports.useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);
  reactExports.useEffect(() => {
    frameIntervalRef.current = 1e3 / fps;
  }, [fps]);
  reactExports.useEffect(() => {
    idleThresholdRef.current = idleThreshold;
  }, [idleThreshold]);
  reactExports.useEffect(() => {
    if (!enabled) {
      isAnimatingRef.current = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    isAnimatingRef.current = true;
    idleFramesRef.current = 0;
    lastFrameTimeRef.current = 0;
    const tick = (timestamp) => {
      if (!isAnimatingRef.current) return;
      const elapsed = timestamp - lastFrameTimeRef.current;
      const frameInterval = frameIntervalRef.current;
      const currentInterval = idleFramesRef.current > idleThresholdRef.current ? frameInterval * 2 : frameInterval;
      if (elapsed < currentInterval) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrameTimeRef.current = timestamp - elapsed % currentInterval;
      const hadActivity = onFrameRef.current(timestamp);
      if (hadActivity) {
        idleFramesRef.current = 0;
      } else {
        idleFramesRef.current++;
      }
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      isAnimatingRef.current = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [enabled]);
  return {
    isAnimating: isAnimatingRef,
    idleFrames: idleFramesRef
  };
}
const COLORMAP_SIZE = 256;
const colormap = new Uint8Array(COLORMAP_SIZE * 3);
(function buildColormap() {
  const stops = [
    [0, 0, 0, 0],
    // black
    [0.15, 0, 20, 80],
    // dark blue
    [0.3, 0, 100, 140],
    // teal
    [0.45, 0, 180, 120],
    // cyan-green
    [0.6, 80, 220, 0],
    // green-yellow
    [0.75, 220, 220, 0],
    // yellow
    [0.88, 255, 80, 0],
    // orange-red
    [1, 255, 255, 255]
    // white
  ];
  for (let i = 0; i < COLORMAP_SIZE; i++) {
    const t = i / (COLORMAP_SIZE - 1);
    let lo = 0;
    for (let s = 1; s < stops.length; s++) {
      if (t <= stops[s][0]) {
        lo = s - 1;
        break;
      }
    }
    const hi = lo + 1;
    const range = stops[hi][0] - stops[lo][0];
    const frac = range > 0 ? (t - stops[lo][0]) / range : 0;
    colormap[i * 3 + 0] = Math.round(stops[lo][1] + frac * (stops[hi][1] - stops[lo][1]));
    colormap[i * 3 + 1] = Math.round(stops[lo][2] + frac * (stops[hi][2] - stops[lo][2]));
    colormap[i * 3 + 2] = Math.round(stops[lo][3] + frac * (stops[hi][3] - stops[lo][3]));
  }
})();
const logBinCache = /* @__PURE__ */ new Map();
function getLogFreqMapping(fftBins, rows) {
  const key = `${fftBins}-${rows}`;
  let mapping = logBinCache.get(key);
  if (!mapping) {
    mapping = new Array(rows);
    const minBin = 1;
    const maxBin = fftBins - 1;
    const logMin = Math.log10(minBin);
    const logMax = Math.log10(maxBin);
    for (let y = 0; y < rows; y++) {
      const frac = y / (rows - 1);
      const logVal = logMin + frac * (logMax - logMin);
      mapping[rows - 1 - y] = Math.min(Math.floor(Math.pow(10, logVal)), maxBin);
    }
    logBinCache.set(key, mapping);
  }
  return mapping;
}
const InstrumentSpectrogram = ({
  instrumentId,
  width = 200,
  height = 80,
  backgroundColor = "#000000",
  className = ""
}) => {
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const contextRef = reactExports.useRef(null);
  const [logicalWidth, setLogicalWidth] = reactExports.useState(width === "auto" ? 200 : width);
  const imageDataRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (width !== "auto") {
      requestAnimationFrame(() => setLogicalWidth(width));
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) setLogicalWidth(Math.floor(rect.width));
    };
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [width]);
  reactExports.useLayoutEffect(() => {
    const canvas2 = canvasRef.current;
    if (!canvas2) return;
    const ctx = canvas2.getContext("2d", { alpha: false });
    if (!ctx) return;
    canvas2.width = logicalWidth;
    canvas2.height = height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, logicalWidth, height);
    contextRef.current = ctx;
    imageDataRef.current = ctx.getImageData(0, 0, logicalWidth, height);
  }, [logicalWidth, height, backgroundColor]);
  const onFrame = reactExports.useCallback(() => {
    const ctx = contextRef.current;
    const imgData = imageDataRef.current;
    if (!ctx || !imgData) return false;
    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(instrumentId);
    if (!analyser || !analyser.hasActivity()) return false;
    const fftData = analyser.getFFT();
    const freqMapping = getLogFreqMapping(fftData.length, height);
    const w = imgData.width;
    const pixels = imgData.data;
    for (let y = 0; y < height; y++) {
      const rowStart = y * w * 4;
      for (let x = 0; x < w - 1; x++) {
        const dst = rowStart + x * 4;
        const src = rowStart + (x + 1) * 4;
        pixels[dst] = pixels[src];
        pixels[dst + 1] = pixels[src + 1];
        pixels[dst + 2] = pixels[src + 2];
        pixels[dst + 3] = pixels[src + 3];
      }
    }
    const xCol = w - 1;
    for (let y = 0; y < height; y++) {
      const bin = freqMapping[y];
      const dbValue = fftData[bin] ?? -100;
      const normalized = Math.max(0, Math.min(1, (dbValue + 100) / 85));
      const intensity = normalized * normalized;
      const cmIdx = Math.min(COLORMAP_SIZE - 1, Math.floor(intensity * (COLORMAP_SIZE - 1)));
      const off = (y * w + xCol) * 4;
      pixels[off] = colormap[cmIdx * 3];
      pixels[off + 1] = colormap[cmIdx * 3 + 1];
      pixels[off + 2] = colormap[cmIdx * 3 + 2];
      pixels[off + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return true;
  }, [instrumentId, height]);
  useVisualizationAnimation({ onFrame, enabled: true, fps: 30 });
  const canvas = /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      className: `rounded ${className}`,
      style: {
        backgroundColor,
        width: width === "auto" ? "100%" : `${width}px`,
        height: `${height}px`,
        display: "block",
        imageRendering: "pixelated"
      }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/InstrumentSpectrogram.tsx",
      lineNumber: 187,
      columnNumber: 5
    },
    void 0
  );
  if (width === "auto") {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, className: "w-full h-full", children: canvas }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/InstrumentSpectrogram.tsx",
      lineNumber: 202,
      columnNumber: 7
    }, void 0);
  }
  return canvas;
};
const SegmentButton = React.memo(({
  labels,
  value,
  onChange,
  activeClass = "bg-amber-600 text-black"
}) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 flex-wrap", children: labels.map((label, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    onClick: () => onChange(i),
    className: `px-2.5 py-1 text-xs font-bold rounded transition-all ${Math.round(value) === i ? activeClass : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
    children: label
  },
  label,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SegmentButton.tsx",
    lineNumber: 22,
    columnNumber: 7
  },
  void 0
)) }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SegmentButton.tsx",
  lineNumber: 20,
  columnNumber: 3
}, void 0));
SegmentButton.displayName = "SegmentButton";
const DrawbarSlider = React.memo(({
  label,
  value,
  color,
  onChange,
  accentColor
}) => {
  const sliderRef = reactExports.useRef(null);
  const isDraggingRef = reactExports.useRef(false);
  const updateValue = reactExports.useCallback((clientY) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onChange(Math.round(pct * 8));
  }, [onChange]);
  const handlePointerDown = reactExports.useCallback((e) => {
    isDraggingRef.current = true;
    e.target.setPointerCapture(e.pointerId);
    updateValue(e.clientY);
  }, [updateValue]);
  const handlePointerMove = reactExports.useCallback((e) => {
    if (!isDraggingRef.current) return;
    updateValue(e.clientY);
  }, [updateValue]);
  const handlePointerUp = reactExports.useCallback(() => {
    isDraggingRef.current = false;
  }, []);
  const fillPct = value / 8 * 100;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1 select-none", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "text-xs font-bold font-mono w-5 text-center",
        style: { color: accentColor ?? color },
        children: Math.round(value)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/DrawbarSlider.tsx",
        lineNumber: 49,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        ref: sliderRef,
        className: "relative w-6 h-28 rounded bg-dark-bgSecondary border border-dark-borderLight cursor-pointer",
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute bottom-0 left-0 right-0 rounded-b transition-all duration-75",
              style: { height: `${fillPct}%`, backgroundColor: color, opacity: 0.8 }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/DrawbarSlider.tsx",
              lineNumber: 60,
              columnNumber: 9
            },
            void 0
          ),
          [1, 2, 3, 4, 5, 6, 7].map((tick) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute left-0 right-0 h-px bg-dark-bgActive pointer-events-none",
              style: { bottom: `${tick / 8 * 100}%` }
            },
            tick,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/DrawbarSlider.tsx",
              lineNumber: 65,
              columnNumber: 11
            },
            void 0
          )),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute left-0 right-0 h-2 rounded transition-all duration-75",
              style: { bottom: `calc(${fillPct}% - 4px)`, backgroundColor: color, boxShadow: `0 0 6px ${color}88` }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/DrawbarSlider.tsx",
              lineNumber: 71,
              columnNumber: 9
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/DrawbarSlider.tsx",
        lineNumber: 53,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted font-mono whitespace-nowrap", children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/DrawbarSlider.tsx",
      lineNumber: 76,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/DrawbarSlider.tsx",
    lineNumber: 48,
    columnNumber: 5
  }, void 0);
});
DrawbarSlider.displayName = "DrawbarSlider";
export {
  DrawbarSlider as D,
  InstrumentSpectrogram as I,
  SegmentButton as S,
  useVisualizationAnimation as u
};
