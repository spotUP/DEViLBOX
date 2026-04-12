import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { $ as getToneEngine, R as useTrackerStore, cV as useShallow, ax as useTransportStore } from "./main-BbV5VyEH.js";
const CircularVU = ({ height = 100 }) => {
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(void 0);
  const gradientCacheRef = reactExports.useRef([]);
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
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.4;
    const numRings = 3;
    gradientCacheRef.current = [];
    for (let i = 0; i < numRings; i++) {
      const radius = maxRadius * (0.4 + i * 0.2);
      const gradient = ctx.createLinearGradient(
        centerX - radius,
        centerY,
        centerX + radius,
        centerY
      );
      gradient.addColorStop(0, "#00d4aa");
      gradient.addColorStop(0.5, "#00ffff");
      gradient.addColorStop(1, "#00d4aa");
      gradientCacheRef.current.push(gradient);
    }
    const animate = () => {
      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      ctx.clearRect(0, 0, width, height);
      const engine = getToneEngine();
      const waveform = engine.getWaveform();
      let level = 0;
      if (waveform && waveform.length > 0) {
        const rms = Math.sqrt(waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length);
        level = Math.min(1, rms * 10);
      }
      ctx.strokeStyle = "var(--color-border-light)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < numRings; i++) {
        const radius = maxRadius * (0.4 + i * 0.2);
        const intensity = Math.max(0, level - i * 0.3);
        if (intensity > 0) {
          const angle = Math.PI * 2 * Math.min(intensity * 2, 1);
          ctx.strokeStyle = gradientCacheRef.current[i];
          ctx.lineWidth = 8;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + angle);
          ctx.stroke();
        }
      }
      ctx.fillStyle = level > 0.5 ? "#00ffff" : "var(--color-border-light)";
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
      ctx.fill();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, style: { width: `${width}px`, height: `${height}px` } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/CircularVU.tsx",
    lineNumber: 126,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/CircularVU.tsx",
    lineNumber: 125,
    columnNumber: 5
  }, void 0);
};
const ChannelWaveforms = ({ height = 100 }) => {
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(void 0);
  const [width, setWidth] = reactExports.useState(300);
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex
    }))
  );
  const pattern = patterns[currentPatternIndex];
  const channelCount = (pattern == null ? void 0 : pattern.channels.length) || 4;
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
    let mounted = true;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const channelsPerRow = Math.min(4, channelCount);
    const rows = Math.ceil(channelCount / channelsPerRow);
    const cellWidth = width / channelsPerRow;
    const cellHeight = height / rows;
    const engine = getToneEngine();
    engine.enableAnalysers();
    const animate = () => {
      var _a;
      if (!mounted) return;
      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      ctx.fillStyle = "#0a0a0b";
      ctx.fillRect(0, 0, width, height);
      const engine2 = getToneEngine();
      const waveform = engine2.getWaveform();
      if (waveform) {
        const values = waveform;
        for (let ch = 0; ch < channelCount; ch++) {
          const row = Math.floor(ch / channelsPerRow);
          const col = ch % channelsPerRow;
          const x = col * cellWidth;
          const y = row * cellHeight;
          ctx.strokeStyle = "var(--color-border)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellWidth, cellHeight);
          ctx.fillStyle = "#555";
          ctx.font = "8px monospace";
          ctx.fillText(`CH${ch + 1}`, x + 4, y + 10);
          const padding = 4;
          const waveHeight = cellHeight - padding * 2 - 12;
          const waveY = y + padding + 12;
          const step = Math.max(1, Math.floor(values.length / (cellWidth - padding * 2)));
          const channelOffset = Math.floor(ch / channelCount * values.length);
          const phaseShift = ch * 123 % values.length;
          ctx.strokeStyle = ((_a = pattern == null ? void 0 : pattern.channels[ch]) == null ? void 0 : _a.muted) ? "var(--color-border-light)" : "#00d4aa";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < cellWidth - padding * 2; i++) {
            const idx = (channelOffset + i * step + phaseShift) % values.length;
            let value = values[idx];
            const channelAmp = 0.3 + ch / channelCount * 0.5;
            const channelFreq = 1 + ch % 3;
            value = value * channelAmp * channelFreq;
            const px = x + padding + i;
            const py = waveY + waveHeight / 2 + value * waveHeight * 0.4;
            if (i === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.stroke();
        }
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      engine.disableAnalysers();
    };
  }, [width, height, channelCount, pattern]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, style: { width: `${width}px`, height: `${height}px` } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelWaveforms.tsx",
    lineNumber: 151,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelWaveforms.tsx",
    lineNumber: 150,
    columnNumber: 5
  }, void 0);
};
const ChannelActivityGrid = ({ height = 100 }) => {
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(void 0);
  const [width, setWidth] = reactExports.useState(300);
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex
    }))
  );
  const pattern = patterns[currentPatternIndex];
  const channelCount = (pattern == null ? void 0 : pattern.channels.length) || 4;
  const smoothedLevels = reactExports.useRef(new Array(32).fill(0));
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
    let mounted = true;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const channelsPerRow = Math.min(8, channelCount);
    const rows = Math.ceil(channelCount / channelsPerRow);
    const cellWidth = width / channelsPerRow;
    const cellHeight = height / rows;
    const animate = () => {
      var _a, _b, _c;
      if (!mounted) return;
      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      ctx.fillStyle = "#0a0a0b";
      ctx.fillRect(0, 0, width, height);
      const engine = getToneEngine();
      let baseLevel = 0;
      if (useTransportStore.getState().isPlaying) {
        const waveform = engine.getWaveform();
        if (waveform && waveform.length > 0) {
          const rms = Math.sqrt(waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length);
          baseLevel = Math.min(1, rms * 10);
        }
      }
      for (let ch = 0; ch < channelCount; ch++) {
        const row = Math.floor(ch / channelsPerRow);
        const col = ch % channelsPerRow;
        const x = col * cellWidth;
        const y = row * cellHeight;
        const time = Date.now() / 1e3;
        const channelPhase = ch * 2.1;
        const variation = Math.sin(time * 2 + channelPhase) * 0.4 + Math.cos(time * 1.3 + channelPhase * 0.7) * 0.3;
        const channelMultiplier = 0.5 + ch % 4 * 0.2;
        const targetLevel = ((_a = pattern == null ? void 0 : pattern.channels[ch]) == null ? void 0 : _a.muted) ? 0 : Math.max(0, Math.min(1, baseLevel * channelMultiplier + variation));
        smoothedLevels.current[ch] += (targetLevel - smoothedLevels.current[ch]) * 0.2;
        const level = smoothedLevels.current[ch];
        const padding = 2;
        ctx.fillStyle = "#111";
        ctx.fillRect(x + padding, y + padding, cellWidth - padding * 2, cellHeight - padding * 2);
        const meterHeight = (cellHeight - padding * 2) * level;
        const gradient = ctx.createLinearGradient(x, y + cellHeight, x, y + cellHeight - meterHeight);
        if (level > 0.8) {
          gradient.addColorStop(0, "#ff0000");
          gradient.addColorStop(0.3, "#ffff00");
          gradient.addColorStop(1, "#00ff00");
        } else if (level > 0.5) {
          gradient.addColorStop(0, "#ffff00");
          gradient.addColorStop(1, "#00ff00");
        } else {
          gradient.addColorStop(0, "#00ff00");
          gradient.addColorStop(1, "#00d4aa");
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(
          x + padding,
          y + cellHeight - padding - meterHeight,
          cellWidth - padding * 2,
          meterHeight
        );
        ctx.fillStyle = level > 0.5 ? "#000" : "#666";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText((ch + 1).toString(), x + cellWidth / 2, y + cellHeight / 2 + 3);
        ctx.strokeStyle = ((_b = pattern == null ? void 0 : pattern.channels[ch]) == null ? void 0 : _b.solo) ? "#00ffff" : "var(--color-border)";
        ctx.lineWidth = ((_c = pattern == null ? void 0 : pattern.channels[ch]) == null ? void 0 : _c.solo) ? 2 : 1;
        ctx.strokeRect(x + padding, y + padding, cellWidth - padding * 2, cellHeight - padding * 2);
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, channelCount, pattern]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, style: { width: `${width}px`, height: `${height}px` } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelActivityGrid.tsx",
    lineNumber: 159,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelActivityGrid.tsx",
    lineNumber: 158,
    columnNumber: 5
  }, void 0);
};
const ChannelSpectrums = ({ height = 100 }) => {
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(void 0);
  const [width, setWidth] = reactExports.useState(300);
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex
    }))
  );
  const pattern = patterns[currentPatternIndex];
  const channelCount = (pattern == null ? void 0 : pattern.channels.length) || 4;
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
    let mounted = true;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const channelsPerRow = Math.min(4, channelCount);
    const rows = Math.ceil(channelCount / channelsPerRow);
    const cellWidth = width / channelsPerRow;
    const cellHeight = height / rows;
    const engine = getToneEngine();
    engine.enableAnalysers();
    const animate = () => {
      var _a;
      if (!mounted) return;
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
        const barsPerChannel = 16;
        const time = Date.now() / 1e3;
        for (let ch = 0; ch < channelCount; ch++) {
          const row = Math.floor(ch / channelsPerRow);
          const col = ch % channelsPerRow;
          const x = col * cellWidth;
          const y = row * cellHeight;
          ctx.strokeStyle = "var(--color-border)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellWidth, cellHeight);
          ctx.fillStyle = "#555";
          ctx.font = "8px monospace";
          ctx.fillText(`CH${ch + 1}`, x + 4, y + 10);
          const padding = 4;
          const barWidth = (cellWidth - padding * 2) / barsPerChannel;
          const maxBarHeight = cellHeight - padding * 2 - 12;
          for (let i = 0; i < barsPerChannel; i++) {
            const frequencyOffset = Math.floor(ch / channelCount * values.length * 0.6);
            const idx = (Math.floor(i / barsPerChannel * values.length) + frequencyOffset) % values.length;
            const value = values[idx];
            const normalized = (value + 140) / 140;
            const barHeight = Math.max(0, Math.min(1, normalized)) * maxBarHeight;
            const channelPhase = ch * 1.7;
            const channelAmp = 0.4 + ch % 3 * 0.3;
            const channelMod = ((_a = pattern == null ? void 0 : pattern.channels[ch]) == null ? void 0 : _a.muted) ? 0 : Math.sin(time * 1.5 + channelPhase + i * 0.4) * 0.3 + channelAmp;
            const finalHeight = barHeight * channelMod;
            const barX = x + padding + i * barWidth;
            const barY = y + padding + 12 + maxBarHeight - finalHeight;
            const hue = i / barsPerChannel * 180 + 180;
            ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
            ctx.fillRect(barX, barY, barWidth - 1, finalHeight);
          }
        }
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      engine.disableAnalysers();
    };
  }, [width, height, channelCount, pattern]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, style: { width: `${width}px`, height: `${height}px` } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelSpectrums.tsx",
    lineNumber: 147,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelSpectrums.tsx",
    lineNumber: 146,
    columnNumber: 5
  }, void 0);
};
const ChannelCircularVU = ({ height = 100 }) => {
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(void 0);
  const [width, setWidth] = reactExports.useState(300);
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex
    }))
  );
  const pattern = patterns[currentPatternIndex];
  const channelCount = (pattern == null ? void 0 : pattern.channels.length) || 4;
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
    let mounted = true;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const channelsPerRow = Math.min(4, channelCount);
    const rows = Math.ceil(channelCount / channelsPerRow);
    const cellWidth = width / channelsPerRow;
    const cellHeight = height / rows;
    const animate = () => {
      var _a;
      if (!mounted) return;
      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      ctx.fillStyle = "#0a0a0b";
      ctx.fillRect(0, 0, width, height);
      const engine = getToneEngine();
      let baseLevel = 0;
      if (useTransportStore.getState().isPlaying) {
        const waveform = engine.getWaveform();
        if (waveform && waveform.length > 0) {
          const rms = Math.sqrt(waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length);
          baseLevel = Math.min(1, rms * 10);
        }
      }
      for (let ch = 0; ch < channelCount; ch++) {
        const row = Math.floor(ch / channelsPerRow);
        const col = ch % channelsPerRow;
        const x = col * cellWidth;
        const y = row * cellHeight;
        const time = Date.now() / 1e3;
        const channelPhase = ch * 2.5;
        const variation = Math.sin(time * 2 + channelPhase) * 0.3;
        const channelMultiplier = 0.6 + ch % 3 * 0.2;
        const level = ((_a = pattern == null ? void 0 : pattern.channels[ch]) == null ? void 0 : _a.muted) ? 0 : Math.max(0, Math.min(1, baseLevel * channelMultiplier + variation));
        ctx.strokeStyle = "var(--color-border)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellWidth, cellHeight);
        ctx.fillStyle = "#555";
        ctx.font = "8px monospace";
        ctx.fillText(`CH${ch + 1}`, x + 4, y + 10);
        const centerX = x + cellWidth / 2;
        const centerY = y + cellHeight / 2;
        const maxRadius = Math.min(cellWidth, cellHeight) / 2 - 12;
        ctx.strokeStyle = "var(--color-border-light)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
        ctx.stroke();
        const numRings = 2;
        for (let i = 0; i < numRings; i++) {
          const radius = maxRadius * (0.5 + i * 0.3);
          const intensity = Math.max(0, level - i * 0.4);
          if (intensity > 0) {
            const angle = Math.PI * 2 * Math.min(intensity * 1.5, 1);
            const rotation = (time + ch * 0.3) % (Math.PI * 2);
            const hue = 160 + ch / channelCount * 60;
            ctx.strokeStyle = `hsl(${hue}, 80%, 50%)`;
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, -Math.PI / 2 + rotation, -Math.PI / 2 + rotation + angle);
            ctx.stroke();
          }
        }
        ctx.fillStyle = level > 0.5 ? "#00ffff" : "var(--color-border-light)";
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, channelCount, pattern]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, style: { width: `${width}px`, height: `${height}px` } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelCircularVU.tsx",
    lineNumber: 161,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelCircularVU.tsx",
    lineNumber: 160,
    columnNumber: 5
  }, void 0);
};
const ChannelParticles = ({ height = 100 }) => {
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(void 0);
  const particlesRef = reactExports.useRef([]);
  const [width, setWidth] = reactExports.useState(300);
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex
    }))
  );
  const pattern = patterns[currentPatternIndex];
  const channelCount = (pattern == null ? void 0 : pattern.channels.length) || 4;
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
    let mounted = true;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const channelsPerRow = Math.min(4, channelCount);
    const rows = Math.ceil(channelCount / channelsPerRow);
    const cellWidth = width / channelsPerRow;
    const cellHeight = height / rows;
    particlesRef.current = Array(channelCount).fill(0).map(() => []);
    const animate = () => {
      var _a;
      if (!mounted) return;
      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      ctx.fillStyle = "#0a0a0b";
      ctx.fillRect(0, 0, width, height);
      const engine = getToneEngine();
      let baseLevel = 0;
      if (useTransportStore.getState().isPlaying) {
        const waveform = engine.getWaveform();
        if (waveform && waveform.length > 0) {
          const rms = Math.sqrt(waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length);
          baseLevel = Math.min(1, rms * 10);
        }
      }
      for (let ch = 0; ch < channelCount; ch++) {
        const row = Math.floor(ch / channelsPerRow);
        const col = ch % channelsPerRow;
        const x = col * cellWidth;
        const y = row * cellHeight;
        const time = Date.now() / 1e3;
        const channelPhase = ch * 2.3;
        const variation = Math.sin(time * 2.5 + channelPhase) * 0.35;
        const channelMultiplier = 0.5 + ch % 4 * 0.25;
        const level = ((_a = pattern == null ? void 0 : pattern.channels[ch]) == null ? void 0 : _a.muted) ? 0 : Math.max(0, Math.min(1, baseLevel * channelMultiplier + variation));
        ctx.strokeStyle = "var(--color-border)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellWidth, cellHeight);
        ctx.fillStyle = "#555";
        ctx.font = "8px monospace";
        ctx.fillText(`CH${ch + 1}`, x + 4, y + 10);
        const centerX = x + cellWidth / 2;
        const centerY = y + cellHeight / 2;
        const maxParticles = 20;
        const particles = particlesRef.current[ch];
        if (level > 0.1 && particles.length < maxParticles) {
          const spawnCount = Math.floor(level * 3);
          for (let i = 0; i < spawnCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 1.5;
            particles.push({
              x: centerX,
              y: centerY,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 1,
              maxLife: 0.5 + Math.random() * 0.5,
              channelIndex: ch
            });
          }
        }
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          const dx = centerX - p.x;
          const dy = centerY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 5) {
            p.vx += dx * 0.01;
            p.vy += dy * 0.01;
          }
          p.vx *= 0.98;
          p.vy *= 0.98;
          p.life -= 0.02;
          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }
          const alpha = p.life;
          const hue = 160 + ch / channelCount * 60;
          const size = 2 + alpha * 2;
          ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${alpha * 0.8})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${alpha * 0.2})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, channelCount, pattern]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, style: { width: `${width}px`, height: `${height}px` } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelParticles.tsx",
    lineNumber: 208,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelParticles.tsx",
    lineNumber: 207,
    columnNumber: 5
  }, void 0);
};
const ChannelRings = ({ height = 100 }) => {
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(void 0);
  const [width, setWidth] = reactExports.useState(300);
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex
    }))
  );
  const pattern = patterns[currentPatternIndex];
  const channelCount = (pattern == null ? void 0 : pattern.channels.length) || 4;
  const smoothedLevels = reactExports.useRef(new Array(32).fill(0));
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
    let mounted = true;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const channelsPerRow = Math.min(4, channelCount);
    const rows = Math.ceil(channelCount / channelsPerRow);
    const cellWidth = width / channelsPerRow;
    const cellHeight = height / rows;
    const animate = () => {
      var _a;
      if (!mounted) return;
      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      const engine = getToneEngine();
      const waveform = engine.getWaveform();
      let baseLevel = 0;
      if (waveform && waveform.length > 0) {
        const rms = Math.sqrt(waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length);
        baseLevel = Math.min(1, rms * 10);
      }
      for (let ch = 0; ch < channelCount; ch++) {
        const row = Math.floor(ch / channelsPerRow);
        const col = ch % channelsPerRow;
        const x = col * cellWidth;
        const y = row * cellHeight;
        const time = Date.now() / 1e3;
        const channelPhase = ch * 1.5;
        const variation = Math.sin(time * 3 + channelPhase) * 0.2;
        const targetLevel = ((_a = pattern == null ? void 0 : pattern.channels[ch]) == null ? void 0 : _a.muted) ? 0 : Math.max(0, Math.min(1, baseLevel + variation));
        smoothedLevels.current[ch] += (targetLevel - smoothedLevels.current[ch]) * 0.15;
        const level = smoothedLevels.current[ch];
        const centerX = x + cellWidth / 2;
        const centerY = y + cellHeight / 2;
        const maxRadius = Math.min(cellWidth, cellHeight) / 2 - 10;
        ctx.fillStyle = "var(--color-border-light)";
        ctx.font = "8px monospace";
        ctx.fillText((ch + 1).toString(), x + 4, y + 10);
        const numRings = 3;
        for (let i = 0; i < numRings; i++) {
          const ringLevel = Math.max(0, level - i * 0.2);
          const radius = maxRadius / numRings * (i + 1) + ringLevel * 10;
          const alpha = 0.2 + ringLevel * 0.8;
          const hue = 180 + ch / channelCount * 120 + i * 20;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${hue}, 80%, 50%, ${alpha})`;
          ctx.lineWidth = 1 + ringLevel * 3;
          ctx.stroke();
          if (ringLevel > 0.3) {
            ctx.shadowBlur = 10 * ringLevel;
            ctx.shadowColor = `hsla(${hue}, 100%, 50%, 0.5)`;
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX - 5, centerY);
        ctx.lineTo(centerX + 5, centerY);
        ctx.moveTo(centerX, centerY - 5);
        ctx.lineTo(centerX, centerY + 5);
        ctx.stroke();
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, channelCount, pattern]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, style: { width: `${width}px`, height: `${height}px` } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelRings.tsx",
    lineNumber: 154,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelRings.tsx",
    lineNumber: 153,
    columnNumber: 5
  }, void 0);
};
const ChannelTunnel = ({ height = 100 }) => {
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(void 0);
  const [width, setWidth] = reactExports.useState(300);
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex
    }))
  );
  const pattern = patterns[currentPatternIndex];
  const channelCount = (pattern == null ? void 0 : pattern.channels.length) || 4;
  const tunnelOffset = reactExports.useRef(0);
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
    let mounted = true;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const channelsPerRow = Math.min(4, channelCount);
    const rows = Math.ceil(channelCount / channelsPerRow);
    const cellWidth = width / channelsPerRow;
    const cellHeight = height / rows;
    const animate = () => {
      var _a;
      if (!mounted) return;
      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      const engine = getToneEngine();
      const fft = engine.getFFT();
      tunnelOffset.current += 0.05;
      for (let ch = 0; ch < channelCount; ch++) {
        const rowIdx = Math.floor(ch / channelsPerRow);
        const colIdx = ch % channelsPerRow;
        const x = colIdx * cellWidth;
        const y = rowIdx * cellHeight;
        const centerX = x + cellWidth / 2;
        const centerY = y + cellHeight / 2;
        let intensity = 0;
        if (fft && fft.length > 0) {
          const sliceSize = Math.floor(fft.length / channelCount);
          const startIdx = ch * sliceSize;
          let sum = 0;
          for (let i = 0; i < 10; i++) {
            sum += (fft[startIdx + i] + 140) / 140;
          }
          intensity = Math.max(0, Math.min(1, sum / 10));
        }
        if ((_a = pattern == null ? void 0 : pattern.channels[ch]) == null ? void 0 : _a.muted) intensity = 0;
        const numLayers = 8;
        for (let i = 0; i < numLayers; i++) {
          const z = (i / numLayers + tunnelOffset.current % (1 / numLayers)) % 1;
          const scale = 1 - z;
          const alpha = z * 0.8;
          const hue = 200 + ch / channelCount * 100 + z * 50;
          ctx.strokeStyle = `hsla(${hue}, 80%, 50%, ${alpha})`;
          ctx.lineWidth = 1 + intensity * 2;
          const w = cellWidth * scale;
          const h = cellHeight * scale;
          ctx.strokeRect(centerX - w / 2, centerY - h / 2, w, h);
          if (i === 0 && intensity > 0.5) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(centerX - w / 2, centerY - h / 2);
            ctx.moveTo(x + cellWidth, y);
            ctx.lineTo(centerX + w / 2, centerY - h / 2);
            ctx.moveTo(x, y + cellHeight);
            ctx.lineTo(centerX - w / 2, centerY + h / 2);
            ctx.moveTo(x + cellWidth, y + cellHeight);
            ctx.lineTo(centerX + w / 2, centerY + h / 2);
            ctx.stroke();
          }
        }
        const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 10 + intensity * 20);
        const centerHue = 180 + ch / channelCount * 60;
        grad.addColorStop(0, `hsla(${centerHue}, 100%, 70%, ${intensity * 0.5})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, channelCount, pattern]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, style: { width: `${width}px`, height: `${height}px` } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelTunnel.tsx",
    lineNumber: 156,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelTunnel.tsx",
    lineNumber: 155,
    columnNumber: 5
  }, void 0);
};
const ChannelRadar = ({ height = 100 }) => {
  const canvasRef = reactExports.useRef(null);
  const animationRef = reactExports.useRef(void 0);
  const [width, setWidth] = reactExports.useState(300);
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex
    }))
  );
  const pattern = patterns[currentPatternIndex];
  const channelCount = (pattern == null ? void 0 : pattern.channels.length) || 4;
  const scanAngle = reactExports.useRef(0);
  const blips = reactExports.useRef([]);
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
    let mounted = true;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const channelsPerRow = Math.min(4, channelCount);
    const rows = Math.ceil(channelCount / channelsPerRow);
    const cellWidth = width / channelsPerRow;
    const cellHeight = height / rows;
    if (blips.current.length !== channelCount) {
      blips.current = Array(channelCount).fill(0).map(() => []);
    }
    const animate = () => {
      var _a;
      if (!mounted) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      const engine = getToneEngine();
      const waveform = useTransportStore.getState().isPlaying ? engine.getWaveform() : null;
      scanAngle.current += 0.05;
      for (let ch = 0; ch < channelCount; ch++) {
        const rowIdx = Math.floor(ch / channelsPerRow);
        const colIdx = ch % channelsPerRow;
        const x = colIdx * cellWidth;
        const y = rowIdx * cellHeight;
        const centerX = x + cellWidth / 2;
        const centerY = y + cellHeight / 2;
        const radius = Math.min(cellWidth, cellHeight) / 2 - 5;
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX - radius, centerY);
        ctx.lineTo(centerX + radius, centerY);
        ctx.moveTo(centerX, centerY - radius);
        ctx.lineTo(centerX, centerY + radius);
        ctx.stroke();
        let level = 0;
        if (waveform && waveform.length > 0) {
          const chStart = Math.floor(ch / channelCount * waveform.length);
          const chEnd = Math.floor((ch + 1) / channelCount * waveform.length);
          let sum = 0;
          for (let i = chStart; i < chEnd; i += 10) {
            sum += Math.abs(waveform[i]);
          }
          level = Math.min(1, sum / ((chEnd - chStart) / 10) * 5);
        }
        if ((_a = pattern == null ? void 0 : pattern.channels[ch]) == null ? void 0 : _a.muted) level = 0;
        if (level > 0.3) {
          const angle = scanAngle.current % (Math.PI * 2);
          const dist = (0.2 + Math.random() * 0.8) * radius;
          blips.current[ch].push({
            x: centerX + Math.cos(angle) * dist,
            y: centerY + Math.sin(angle) * dist,
            age: 1,
            hue: 120 + ch / channelCount * 100
          });
        }
        for (let i = blips.current[ch].length - 1; i >= 0; i--) {
          const b = blips.current[ch][i];
          ctx.fillStyle = `hsla(${b.hue}, 100%, 50%, ${b.age})`;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 2 * b.age, 0, Math.PI * 2);
          ctx.fill();
          b.age -= 0.01;
          if (b.age <= 0) blips.current[ch].splice(i, 1);
        }
        const sweepGradient = ctx.createConicGradient(scanAngle.current, centerX, centerY);
        const baseHue = 120 + ch / channelCount * 100;
        sweepGradient.addColorStop(0, `hsla(${baseHue}, 100%, 50%, 0.5)`);
        sweepGradient.addColorStop(0.1, `hsla(${baseHue}, 100%, 50%, 0)`);
        sweepGradient.addColorStop(1, `hsla(${baseHue}, 100%, 50%, 0)`);
        ctx.fillStyle = sweepGradient;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, scanAngle.current, scanAngle.current - 0.5, true);
        ctx.fill();
        ctx.strokeStyle = `hsla(${baseHue}, 100%, 70%, 0.8)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(scanAngle.current) * radius, centerY + Math.sin(scanAngle.current) * radius);
        ctx.stroke();
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, channelCount, pattern]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, style: { width: `${width}px`, height: `${height}px` } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelRadar.tsx",
    lineNumber: 184,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/ChannelRadar.tsx",
    lineNumber: 183,
    columnNumber: 5
  }, void 0);
};
export {
  CircularVU as C,
  ChannelWaveforms as a,
  ChannelActivityGrid as b,
  ChannelSpectrums as c,
  ChannelCircularVU as d,
  ChannelParticles as e,
  ChannelRings as f,
  ChannelTunnel as g,
  ChannelRadar as h
};
