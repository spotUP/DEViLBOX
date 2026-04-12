import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { a1 as useThemeStore, $ as getToneEngine } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function MAMEOscilloscope({
  instrumentId,
  width,
  height = 120,
  color
}) {
  const canvasRef = reactExports.useRef(null);
  const containerRef = reactExports.useRef(null);
  const animFrameRef = reactExports.useRef(0);
  const oscDataRef = reactExports.useRef(null);
  const [isActive, setIsActive] = reactExports.useState(false);
  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyanTheme = currentThemeId === "cyan-lineart";
  const bgColor = isCyanTheme ? "#030808" : "#0a0a0b";
  const gridColor = isCyanTheme ? "rgba(0, 255, 255, 0.06)" : "rgba(100, 100, 120, 0.1)";
  const centerLineColor = isCyanTheme ? "rgba(0, 255, 255, 0.15)" : "rgba(100, 100, 120, 0.2)";
  const waveColor = color || (isCyanTheme ? "#00ffff" : "#00d4aa");
  const panelBg = isCyanTheme ? "linear-gradient(180deg, #0a1515 0%, #050c0c 100%)" : "linear-gradient(180deg, #252525 0%, #1a1a1a 100%)";
  const bgColorRef = reactExports.useRef(bgColor);
  const gridColorRef = reactExports.useRef(gridColor);
  const centerLineColorRef = reactExports.useRef(centerLineColor);
  const waveColorRef = reactExports.useRef(waveColor);
  reactExports.useEffect(() => {
    bgColorRef.current = bgColor;
  }, [bgColor]);
  reactExports.useEffect(() => {
    gridColorRef.current = gridColor;
  }, [gridColor]);
  reactExports.useEffect(() => {
    centerLineColorRef.current = centerLineColor;
  }, [centerLineColor]);
  reactExports.useEffect(() => {
    waveColorRef.current = waveColor;
  }, [waveColor]);
  reactExports.useEffect(() => {
    const engine = getToneEngine();
    const synth = engine.getMAMEChipSynth(instrumentId);
    if (!synth) {
      requestAnimationFrame(() => setIsActive(false));
      return;
    }
    requestAnimationFrame(() => setIsActive(true));
    const unsubscribe = synth.onOscData((data) => {
      oscDataRef.current = data;
    });
    const tick = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }
      ctx.fillStyle = bgColorRef.current;
      ctx.fillRect(0, 0, w, h);
      const pad = 4;
      const innerW = w - pad * 2;
      const innerH = h - pad * 2;
      ctx.strokeStyle = gridColorRef.current;
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = pad + innerH * i / 4;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(w - pad, y);
        ctx.stroke();
      }
      for (let i = 1; i < 8; i++) {
        const x = pad + innerW * i / 8;
        ctx.beginPath();
        ctx.moveTo(x, pad);
        ctx.lineTo(x, h - pad);
        ctx.stroke();
      }
      ctx.strokeStyle = centerLineColorRef.current;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, h / 2);
      ctx.lineTo(w - pad, h / 2);
      ctx.stroke();
      const data = oscDataRef.current;
      const wc = waveColorRef.current;
      if (data && data.length > 0) {
        ctx.strokeStyle = wc;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const samples = data.length;
        const step = innerW / samples;
        for (let i = 0; i < samples; i++) {
          const x = pad + i * step;
          const sample = Math.max(-1, Math.min(1, data[i]));
          const y = pad + innerH / 2 - sample * (innerH / 2 - 4);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.strokeStyle = wc;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = wc;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, h / 2);
        ctx.lineTo(w - pad, h / 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      unsubscribe();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [instrumentId]);
  if (!isActive) {
    return null;
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      className: "rounded-lg overflow-hidden",
      style: {
        background: panelBg,
        border: isCyanTheme ? "1px solid rgba(0, 255, 255, 0.2)" : "1px solid rgba(255, 255, 255, 0.08)",
        width: width || "100%"
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "px-2 py-1 flex items-center justify-between border-b",
            style: { borderColor: isCyanTheme ? "rgba(0, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.05)" },
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "span",
              {
                className: "text-[10px] font-mono uppercase tracking-wider",
                style: { color: isCyanTheme ? "#00ffff" : "#888" },
                children: "Oscilloscope"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/MAMEOscilloscope.tsx",
                lineNumber: 192,
                columnNumber: 9
              },
              this
            )
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/MAMEOscilloscope.tsx",
            lineNumber: 190,
            columnNumber: 7
          },
          this
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: canvasRef,
            style: { width: "100%", height },
            className: "block"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/MAMEOscilloscope.tsx",
            lineNumber: 197,
            columnNumber: 7
          },
          this
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/MAMEOscilloscope.tsx",
      lineNumber: 181,
      columnNumber: 5
    },
    this
  );
}
export {
  MAMEOscilloscope
};
