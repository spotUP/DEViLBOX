import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { O as Oscilloscope } from "./Oscilloscope-CoW6EDI2.js";
import { R as useTrackerStore, cV as useShallow, ax as useTransportStore, a1 as useThemeStore, $ as getToneEngine, an as useSettingsStore } from "./main-BbV5VyEH.js";
import { C as CircularVU, a as ChannelWaveforms, b as ChannelActivityGrid, c as ChannelSpectrums, d as ChannelCircularVU, e as ChannelParticles, f as ChannelRings, g as ChannelTunnel, h as ChannelRadar } from "./ChannelRadar-CV3ojpWt.js";
import { V as VisualizerFrame } from "./VisualizerFrame-7GhRHAT_.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const DECAY_RATE = 0.88;
const ChannelLevelsCompact = ({
  height = 100,
  width = "auto"
}) => {
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(null);
  const levelStatesRef = reactExports.useRef([]);
  const peakHoldsRef = reactExports.useRef([]);
  const lastGensRef = reactExports.useRef([]);
  const gradientCacheRef = reactExports.useRef(null);
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex
    }))
  );
  const isPlaying = useTransportStore((state) => state.isPlaying);
  const { currentThemeId } = useThemeStore();
  const pattern = patterns[currentPatternIndex];
  const numChannels = (pattern == null ? void 0 : pattern.channels.length) || 4;
  const isCyanTheme = currentThemeId === "cyan-lineart";
  reactExports.useEffect(() => {
    levelStatesRef.current = new Array(numChannels).fill(0);
    peakHoldsRef.current = new Array(numChannels).fill(null).map(() => ({ level: 0, frames: 0 }));
  }, [numChannels]);
  const numChannelsRef = reactExports.useRef(numChannels);
  const heightRef = reactExports.useRef(height);
  const isCyanThemeRef = reactExports.useRef(isCyanTheme);
  reactExports.useEffect(() => {
    numChannelsRef.current = numChannels;
  }, [numChannels]);
  reactExports.useEffect(() => {
    heightRef.current = height;
  }, [height]);
  reactExports.useEffect(() => {
    isCyanThemeRef.current = isCyanTheme;
  }, [isCyanTheme]);
  reactExports.useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const actualWidth = container.clientWidth;
          canvas.width = actualWidth * dpr;
          canvas.height = height * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const bgColor = isCyanTheme ? "#030808" : "#0a0a0b";
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, actualWidth, height);
          const barHeight = Math.max(6, (height - 24 - (numChannels - 1) * 3) / numChannels);
          const barMaxWidth = actualWidth - 40;
          const startY = 12;
          for (let i = 0; i < numChannels; i++) {
            const y = startY + i * (barHeight + 3);
            ctx.fillStyle = isCyanTheme ? "rgba(0, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.4)";
            ctx.font = "9px monospace";
            ctx.textAlign = "left";
            ctx.fillText(`${i + 1}`, 4, y + barHeight - 1);
            ctx.fillStyle = isCyanTheme ? "rgba(0, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.1)";
            ctx.fillRect(20, y, barMaxWidth, barHeight);
          }
          ctx.fillStyle = isCyanTheme ? "rgba(0, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.3)";
          ctx.font = "10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("Channel Levels", actualWidth / 2, height - 3);
        }
      }
      levelStatesRef.current = new Array(numChannels).fill(0);
      peakHoldsRef.current = new Array(numChannels).fill(null).map(() => ({ level: 0, frames: 0 }));
      return;
    }
    const tick = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      const nc = numChannelsRef.current;
      const h = heightRef.current;
      const cyan = isCyanThemeRef.current;
      const dpr = window.devicePixelRatio || 1;
      const actualWidth = container.clientWidth;
      if (canvas.width !== Math.ceil(actualWidth * dpr) || canvas.height !== Math.ceil(h * dpr)) {
        canvas.width = Math.ceil(actualWidth * dpr);
        canvas.height = Math.ceil(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const engine = getToneEngine();
      const isRealtime = useSettingsStore.getState().vuMeterMode === "realtime";
      const triggerLevels = engine.getChannelTriggerLevels(nc);
      const triggerGens = engine.getChannelTriggerGenerations(nc);
      const realtimeLevels = isRealtime ? engine.getChannelLevels(nc) : null;
      if (lastGensRef.current.length < nc) {
        const old = lastGensRef.current;
        lastGensRef.current = new Array(nc).fill(0);
        for (let j = 0; j < old.length; j++) lastGensRef.current[j] = old[j];
      }
      for (let i = 0; i < nc; i++) {
        const isNewTrigger = triggerGens[i] !== lastGensRef.current[i];
        let trigger = isNewTrigger ? triggerLevels[i] || 0 : 0;
        if (isNewTrigger) lastGensRef.current[i] = triggerGens[i];
        if (isRealtime && realtimeLevels) {
          const rt = realtimeLevels[i] || 0;
          if (rt > trigger) trigger = rt;
        }
        const current = levelStatesRef.current[i] || 0;
        if (trigger > current) {
          levelStatesRef.current[i] = current + (trigger - current) * 0.7;
        } else {
          levelStatesRef.current[i] = current * DECAY_RATE;
          if (levelStatesRef.current[i] < 0.01) levelStatesRef.current[i] = 0;
        }
        const peak = peakHoldsRef.current[i];
        if (levelStatesRef.current[i] >= peak.level) {
          peak.level = levelStatesRef.current[i];
          peak.frames = 30;
        } else if (peak.frames > 0) {
          peak.frames--;
        } else {
          peak.level *= 0.95;
          if (peak.level < 0.01) peak.level = 0;
        }
      }
      const bgColor = cyan ? "#030808" : "#0a0a0b";
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, actualWidth, h);
      const barHeight = Math.max(6, (h - 24 - (nc - 1) * 3) / nc);
      const barMaxWidth = actualWidth - 40;
      const startY = 12;
      const gc = gradientCacheRef.current;
      let barGradient;
      if (gc && gc.width === barMaxWidth && gc.cyan === cyan) {
        barGradient = gc.gradient;
      } else {
        barGradient = ctx.createLinearGradient(20, 0, 20 + barMaxWidth, 0);
        if (cyan) {
          barGradient.addColorStop(0, "rgba(0, 200, 200, 0.8)");
          barGradient.addColorStop(0.7, "rgba(0, 255, 255, 1)");
          barGradient.addColorStop(1, "rgba(255, 100, 100, 1)");
        } else {
          barGradient.addColorStop(0, "rgba(0, 180, 140, 0.8)");
          barGradient.addColorStop(0.7, "rgba(0, 212, 170, 1)");
          barGradient.addColorStop(1, "rgba(255, 80, 80, 1)");
        }
        gradientCacheRef.current = { gradient: barGradient, width: barMaxWidth, cyan };
      }
      const labelColor = cyan ? "rgba(0, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.4)";
      const bgBarColor = cyan ? "rgba(0, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.1)";
      const peakColor = cyan ? "#00ffff" : "#ff4444";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      for (let i = 0; i < nc; i++) {
        const y = startY + i * (barHeight + 3);
        const level = levelStatesRef.current[i];
        const peak = peakHoldsRef.current[i];
        const barWidth = level * barMaxWidth;
        const peakX = 20 + peak.level * barMaxWidth;
        ctx.fillStyle = labelColor;
        ctx.fillText(`${i + 1}`, 4, y + barHeight - 1);
        ctx.fillStyle = bgBarColor;
        ctx.fillRect(20, y, barMaxWidth, barHeight);
        if (barWidth > 0) {
          ctx.fillStyle = barGradient;
          ctx.fillRect(20, y, barWidth, barHeight);
        }
        if (peak.level > 0.02) {
          ctx.fillStyle = peakColor;
          ctx.fillRect(peakX - 1, y, 2, barHeight);
        }
      }
      ctx.fillStyle = cyan ? "rgba(0, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.3)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Channel Levels", actualWidth / 2, h - 3);
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, numChannels, height, isCyanTheme]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, className: width === "auto" ? "w-full" : "", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      style: { width: "100%", height: `${height}px` }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelLevelsCompact.tsx",
      lineNumber: 261,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelLevelsCompact.tsx",
    lineNumber: 260,
    columnNumber: 5
  }, void 0);
};
const FrequencyBars = ({ height = 100 }) => {
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(void 0);
  const [width, setWidth] = reactExports.useState(300);
  const gradientCacheRef = reactExports.useRef([]);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) setWidth(newWidth);
      }
    });
    resizeObserver.observe(canvas.parentElement);
    return () => resizeObserver.disconnect();
  }, []);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const numBars = 32;
    const barWidth = width / numBars;
    const smoothedValues = new Array(numBars).fill(0);
    gradientCacheRef.current = Array.from({ length: numBars }, (_, i) => {
      const x = i * barWidth;
      const gradient = ctx.createLinearGradient(x, 0, x, height);
      gradient.addColorStop(0, "#00ffff");
      gradient.addColorStop(0.5, "#00d4aa");
      gradient.addColorStop(1, "#006655");
      return gradient;
    });
    const engine = getToneEngine();
    engine.enableAnalysers();
    const animate = () => {
      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      ctx.fillStyle = "#0a0a0b";
      ctx.fillRect(0, 0, width, height);
      const engine2 = getToneEngine();
      const fft = engine2.getFFT();
      if (fft) {
        const values = fft;
        const step = Math.floor(values.length / numBars);
        for (let i = 0; i < numBars; i++) {
          const value = values[i * step];
          const normalized = (value + 140) / 140;
          const targetHeight = Math.max(0, Math.min(1, normalized)) * height * 0.9;
          smoothedValues[i] += (targetHeight - smoothedValues[i]) * 0.3;
          const x = i * barWidth;
          const barHeight = smoothedValues[i];
          ctx.fillStyle = gradientCacheRef.current[i];
          ctx.fillRect(x + 1, height - barHeight, barWidth - 2, barHeight);
          ctx.fillStyle = "rgba(0, 255, 255, 0.5)";
          ctx.fillRect(x + 1, height - barHeight, barWidth - 2, 2);
          ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
          ctx.fillRect(x + barWidth - 2, height - barHeight, 1, barHeight);
        }
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      engine.disableAnalysers();
    };
  }, [width, height]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, style: { width: `${width}px`, height: `${height}px` } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/FrequencyBars.tsx",
    lineNumber: 121,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/FrequencyBars.tsx",
    lineNumber: 120,
    columnNumber: 5
  }, void 0);
};
const ParticleField = ({ height = 100 }) => {
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(void 0);
  const particlesRef = reactExports.useRef([]);
  const [width, setWidth] = reactExports.useState(300);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) setWidth(newWidth);
      }
    });
    resizeObserver.observe(canvas.parentElement);
    return () => resizeObserver.disconnect();
  }, []);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const particles = particlesRef.current;
    const engine = getToneEngine();
    engine.enableAnalysers();
    const createParticle = (x, y, intensity) => ({
      x,
      y,
      vx: (Math.random() - 0.5) * intensity * 4,
      vy: (Math.random() - 0.5) * intensity * 4,
      size: Math.random() * 3 + 1,
      life: 1
    });
    const animate = () => {
      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      ctx.fillStyle = "rgba(10, 10, 11, 0.15)";
      ctx.fillRect(0, 0, width, height);
      const engine2 = getToneEngine();
      const waveform = engine2.getWaveform();
      let level = 0;
      if (waveform && waveform.length > 0) {
        const rms = Math.sqrt(waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length);
        level = Math.min(1, rms * 10);
      }
      if (level > 0.1 && particles.length < 150) {
        const numNew = Math.floor(level * 8);
        for (let i = 0; i < numNew; i++) {
          particles.push(createParticle(
            width / 2 + (Math.random() - 0.5) * 40,
            height / 2 + (Math.random() - 0.5) * 40,
            level
          ));
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.015;
        const dx = width / 2 - p.x;
        const dy = height / 2 - p.y;
        const distSq = dx * dx + dy * dy;
        const threshold = 20 * 20;
        if (distSq > threshold) {
          const strength = 2 / distSq;
          p.vx += dx * strength;
          p.vy += dy * strength;
        }
        p.vx *= 0.98;
        p.vy *= 0.98;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        const alpha = p.life;
        const hue = (p.life * 60 + 160) % 360;
        ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        if (level > 0.5) {
          ctx.fillStyle = `hsla(${hue}, 100%, 80%, ${alpha * 0.3})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      particlesRef.current = [];
      engine.disableAnalysers();
    };
  }, [width, height]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, style: { width: `${width}px`, height: `${height}px` } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ParticleField.tsx",
    lineNumber: 164,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ParticleField.tsx",
    lineNumber: 163,
    columnNumber: 5
  }, void 0);
};
const VIZ_MODES = ["waveform", "spectrum", "channels", "circular", "bars", "particles", "chanWaves", "chanActivity", "chanSpectrum", "chanCircular", "chanParticles", "chanRings", "chanTunnel", "chanRadar"];
const MODE_LABELS = {
  waveform: "Waveform",
  spectrum: "Spectrum",
  channels: "Channel Levels",
  circular: "Circular VU",
  bars: "Frequency Bars",
  particles: "Particle Field",
  chanWaves: "Channel Waveforms",
  chanActivity: "Activity Grid",
  chanSpectrum: "Channel Spectrums",
  chanCircular: "Channel Circular",
  chanParticles: "Channel Particles",
  chanRings: "Channel Rings",
  chanTunnel: "Channel Tunnel",
  chanRadar: "Channel Radar"
};
const OscilloscopePopout = () => {
  const [vizMode, setVizMode] = reactExports.useState("waveform");
  const height = 440;
  const cycleMode = () => {
    const idx = VIZ_MODES.indexOf(vizMode);
    setVizMode(VIZ_MODES[(idx + 1) % VIZ_MODES.length]);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "h-screen w-screen bg-dark-bg flex flex-col cursor-pointer p-4",
      onClick: cycleMode,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-3 py-1.5 text-xs text-text-muted font-mono flex items-center justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: MODE_LABELS[vizMode] }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 59,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted/50", children: "Click to cycle modes" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 60,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
          lineNumber: 58,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VisualizerFrame, { variant: "large", className: "flex-1", style: { display: "flex", alignItems: "center", justifyContent: "center" }, children: [
          (vizMode === "waveform" || vizMode === "spectrum") && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Oscilloscope, { width: "auto", height, mode: vizMode }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 65,
            columnNumber: 64
          }, void 0),
          vizMode === "channels" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelLevelsCompact, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 66,
            columnNumber: 36
          }, void 0),
          vizMode === "circular" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CircularVU, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 67,
            columnNumber: 36
          }, void 0),
          vizMode === "bars" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FrequencyBars, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 68,
            columnNumber: 32
          }, void 0),
          vizMode === "particles" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ParticleField, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 69,
            columnNumber: 37
          }, void 0),
          vizMode === "chanWaves" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelWaveforms, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 70,
            columnNumber: 37
          }, void 0),
          vizMode === "chanActivity" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelActivityGrid, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 71,
            columnNumber: 40
          }, void 0),
          vizMode === "chanSpectrum" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelSpectrums, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 72,
            columnNumber: 40
          }, void 0),
          vizMode === "chanCircular" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelCircularVU, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 73,
            columnNumber: 40
          }, void 0),
          vizMode === "chanParticles" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelParticles, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 74,
            columnNumber: 41
          }, void 0),
          vizMode === "chanRings" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelRings, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 75,
            columnNumber: 37
          }, void 0),
          vizMode === "chanTunnel" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelTunnel, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 76,
            columnNumber: 38
          }, void 0),
          vizMode === "chanRadar" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelRadar, { height }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
            lineNumber: 77,
            columnNumber: 37
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
          lineNumber: 64,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/OscilloscopePopout.tsx",
      lineNumber: 53,
      columnNumber: 5
    },
    void 0
  );
};
export {
  OscilloscopePopout
};
