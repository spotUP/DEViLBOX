import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
function generatePreset(type, n) {
  const data = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    switch (type) {
      case "sine":
        data.push(0.5 + 0.5 * Math.sin(t * Math.PI * 2));
        break;
      case "triangle":
        data.push(t < 0.5 ? t * 2 : 2 - t * 2);
        break;
      case "saw":
        data.push(t);
        break;
      case "square":
        data.push(t < 0.5 ? 1 : 0);
        break;
      case "pulse25":
        data.push(t < 0.25 ? 1 : 0);
        break;
      case "pulse12":
        data.push(t < 0.125 ? 1 : 0);
        break;
      case "noise":
        data.push(Math.random());
        break;
    }
  }
  return data;
}
const WaveformThumbnail = (props) => {
  const canvasRef = reactExports.useRef(null);
  const w = props.width ?? 48;
  const h = props.height ?? 24;
  const drawStyle = props.style ?? "line";
  const color = props.color ?? "#06b6d4";
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#11131a";
    ctx.fillRect(0, 0, w, h);
    let normData;
    if ("type" in props) {
      normData = generatePreset(props.type, props.resolution ?? 64);
    } else {
      const mv = props.maxValue || 1;
      normData = props.data.map((v) => v / mv);
    }
    if (normData.length === 0) return;
    if (drawStyle === "bar") {
      const bw = w / normData.length;
      ctx.fillStyle = color;
      normData.forEach((v, i) => {
        const bh = v * h;
        ctx.fillRect(i * bw, h - bh, bw - 0.5, bh);
      });
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.beginPath();
      normData.forEach((v, i) => {
        const x = i / normData.length * w;
        const y = h - v * (h - 2) - 1;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.fillStyle = `${color}22`;
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    }
  }, [props, w, h, drawStyle, color]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      style: { display: "block", imageRendering: "auto" }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/WaveformThumbnail.tsx",
      lineNumber: 129,
      columnNumber: 5
    },
    void 0
  );
};
export {
  WaveformThumbnail as W
};
