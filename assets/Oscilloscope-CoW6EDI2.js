import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { as as useAudioStore, a1 as useThemeStore, ax as useTransportStore } from "./main-BbV5VyEH.js";
const Oscilloscope = ({
  width = 800,
  height = 120,
  mode = "waveform"
}) => {
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(0);
  const { analyserNode, fftNode } = useAudioStore();
  const [measuredWidth, setMeasuredWidth] = reactExports.useState(800);
  const actualWidth = width !== "auto" ? width : measuredWidth;
  reactExports.useEffect(() => {
    if (width !== "auto") return;
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      setMeasuredWidth(Math.floor(rect.width));
    };
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [width]);
  const { currentThemeId } = useThemeStore();
  const isCyanTheme = currentThemeId === "cyan-lineart";
  const isPlaying = useTransportStore((state) => state.isPlaying);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = actualWidth * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!isPlaying) {
      const bgColor2 = isCyanTheme ? "#030808" : "#0a0a0b";
      const gridColor2 = isCyanTheme ? "rgba(0, 255, 255, 0.08)" : "#1a1a1d";
      const centerLineColor2 = isCyanTheme ? "rgba(0, 255, 255, 0.2)" : "rgba(0, 212, 170, 0.2)";
      ctx.fillStyle = bgColor2;
      ctx.fillRect(0, 0, actualWidth, height);
      ctx.strokeStyle = gridColor2;
      ctx.lineWidth = 1;
      for (let i = 0; i < actualWidth; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }
      for (let i = 0; i < height; i += 30) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(actualWidth, i);
        ctx.stroke();
      }
      ctx.strokeStyle = centerLineColor2;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(actualWidth, height / 2);
      ctx.stroke();
      return;
    }
    let isRunning = true;
    let lastFrameTime = 0;
    const FRAME_INTERVAL = 1e3 / 30;
    const bgColor = isCyanTheme ? "#030808" : "#0a0a0b";
    const gridColor = isCyanTheme ? "rgba(0, 255, 255, 0.08)" : "#1a1a1d";
    const waveColor1 = isCyanTheme ? "#00ffff" : "#00d4aa";
    const waveColor2 = isCyanTheme ? "#00ffff" : "#7c3aed";
    const centerLineColor = isCyanTheme ? "rgba(0, 255, 255, 0.2)" : "rgba(0, 212, 170, 0.2)";
    const waveformGradient = ctx.createLinearGradient(0, 0, actualWidth, 0);
    waveformGradient.addColorStop(0, waveColor1);
    waveformGradient.addColorStop(0.5, waveColor1);
    waveformGradient.addColorStop(1, waveColor2);
    const spectrumColors = [];
    if (mode === "spectrum") {
      for (let i = 0; i < 1024; i++) {
        if (isCyanTheme) {
          spectrumColors.push("rgba(0, 255, 255, 0.75)");
        } else {
          const hue = 160 + i / 1024 * 120;
          spectrumColors.push(`hsla(${hue}, 80%, 50%, 0.8)`);
        }
      }
    }
    const draw = (timestamp) => {
      if (!isRunning || !canvas || !ctx) return;
      const elapsed = timestamp - lastFrameTime;
      if (elapsed < FRAME_INTERVAL) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrameTime = timestamp - elapsed % FRAME_INTERVAL;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, actualWidth, height);
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let i = 0; i < actualWidth; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }
      for (let i = 0; i < height; i += 30) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(actualWidth, i);
        ctx.stroke();
      }
      if (mode === "waveform" && analyserNode) {
        const waveform = analyserNode.getValue();
        ctx.strokeStyle = waveformGradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const sliceWidth = actualWidth / waveform.length;
        let x = 0;
        for (let i = 0; i < waveform.length; i++) {
          const v = (waveform[i] + 1) / 2;
          const y = v * height;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }
        ctx.stroke();
        ctx.strokeStyle = centerLineColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(actualWidth, height / 2);
        ctx.stroke();
      } else if (mode === "spectrum" && fftNode) {
        const spectrum = fftNode.getValue();
        const barWidth = actualWidth / spectrum.length;
        let x = 0;
        for (let i = 0; i < spectrum.length; i++) {
          const db = spectrum[i];
          const normalized = (db + 100) / 100;
          const barHeight = normalized * height;
          if (isCyanTheme) {
            ctx.globalAlpha = 0.5 + normalized * 0.5;
            ctx.fillStyle = "rgb(0, 255, 255)";
          } else {
            ctx.fillStyle = spectrumColors[i] || spectrumColors[spectrumColors.length - 1];
          }
          ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }
        ctx.globalAlpha = 1;
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    animationRef.current = requestAnimationFrame(draw);
    return () => {
      isRunning = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [actualWidth, height, mode, analyserNode, fftNode, isCyanTheme, isPlaying]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, className: width === "auto" ? "w-full" : "", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      style: { width: width === "auto" ? "100%" : `${actualWidth}px`, height: `${height}px` }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/Oscilloscope.tsx",
      lineNumber: 243,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/Oscilloscope.tsx",
    lineNumber: 242,
    columnNumber: 5
  }, void 0);
};
export {
  Oscilloscope as O
};
