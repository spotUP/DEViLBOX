import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { ao as useGTUltraStore } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const ROW_H = 16;
const HEADER_H = 20;
const GTOrderList = ({ width, height, channelCount }) => {
  const canvasRef = reactExports.useRef(null);
  const orderData = useGTUltraStore((s) => s.orderData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const orderCursor = useGTUltraStore((s) => s.orderCursor);
  const setOrderCursor = useGTUltraStore((s) => s.setOrderCursor);
  const engine = useGTUltraStore((s) => s.engine);
  const [channelCol, setChannelCol] = reactExports.useState(0);
  const [hexDigit, setHexDigit] = reactExports.useState(null);
  const visibleRows = Math.floor((height - HEADER_H) / ROW_H);
  const totalLen = orderData.length > 0 ? orderData[0].length : 0;
  reactExports.useEffect(() => {
    var _a;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, width, height);
    ctx.font = `12px "JetBrains Mono", monospace`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "var(--color-bg-tertiary)";
    ctx.fillRect(0, 0, width, HEADER_H - 2);
    ctx.fillStyle = "#888";
    ctx.fillText("ORD", 4, 3);
    const colW = Math.floor((width - 30) / channelCount);
    for (let ch = 0; ch < channelCount; ch++) {
      ctx.fillStyle = ch === channelCol ? "#e0e0e0" : "#555";
      ctx.fillText(`CH${ch + 1}`, 30 + ch * colW, 3);
    }
    const scrollTop = Math.max(0, orderCursor - Math.floor(visibleRows / 2));
    for (let vi = 0; vi < visibleRows && scrollTop + vi < totalLen; vi++) {
      const idx = scrollTop + vi;
      const y = HEADER_H + vi * ROW_H;
      const isPlay = idx === playbackPos.position;
      const isCursor = idx === orderCursor;
      if (isPlay) {
        ctx.fillStyle = "rgba(233, 69, 96, 0.15)";
        ctx.fillRect(0, y, width, ROW_H);
      }
      if (isCursor) {
        const activeX = 30 + channelCol * colW;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(activeX - 2, y, colW, ROW_H);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, width - 1, ROW_H - 1);
      }
      ctx.fillStyle = "#555";
      ctx.fillText(idx.toString(16).toUpperCase().padStart(2, "0"), 4, y + 2);
      for (let ch = 0; ch < channelCount; ch++) {
        const val = ((_a = orderData[ch]) == null ? void 0 : _a[idx]) ?? 0;
        const x = 30 + ch * colW;
        if (val === 255) {
          ctx.fillStyle = "#e94560";
          ctx.fillText("EN", x, y + 2);
        } else if (val >= 208 && val <= 223) {
          ctx.fillStyle = "#ffcc00";
          ctx.fillText(`R${(val & 15).toString(16).toUpperCase()}`, x, y + 2);
        } else if (val >= 224 && val <= 239) {
          ctx.fillStyle = "#ff8866";
          ctx.fillText(`-${(val & 15).toString(16).toUpperCase()}`, x, y + 2);
        } else if (val >= 240 && val <= 254) {
          ctx.fillStyle = "#ff8866";
          ctx.fillText(`+${(val & 15).toString(16).toUpperCase()}`, x, y + 2);
        } else {
          ctx.fillStyle = "#60e060";
          ctx.fillText(val.toString(16).toUpperCase().padStart(2, "0"), x, y + 2);
        }
      }
    }
  }, [width, height, orderData, playbackPos.position, orderCursor, channelCount, visibleRows, totalLen, channelCol]);
  const handleClick = reactExports.useCallback((e) => {
    var _a;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < HEADER_H) return;
    const scrollTop = Math.max(0, orderCursor - Math.floor(visibleRows / 2));
    const idx = scrollTop + Math.floor((y - HEADER_H) / ROW_H);
    if (idx >= totalLen) return;
    setOrderCursor(idx);
    const colW = Math.floor((width - 30) / channelCount);
    const relX = x - 30;
    if (relX >= 0) {
      const ch = Math.min(channelCount - 1, Math.floor(relX / colW));
      setChannelCol(ch);
    }
    setHexDigit(null);
    (_a = canvasRef.current) == null ? void 0 : _a.focus();
  }, [orderCursor, visibleRows, totalLen, setOrderCursor, width, channelCount]);
  const handleDoubleClick = reactExports.useCallback(() => {
    if (engine) {
      const store = useGTUltraStore.getState();
      engine.play(store.currentSong, orderCursor, 0);
      store.setPlaying(true);
    }
  }, [engine, orderCursor]);
  const handleKeyDown = reactExports.useCallback((e) => {
    const { key } = e;
    e.stopPropagation();
    if (key === "ArrowUp") {
      e.preventDefault();
      setOrderCursor(Math.max(0, orderCursor - 1));
      setHexDigit(null);
      return;
    }
    if (key === "ArrowDown") {
      e.preventDefault();
      setOrderCursor(Math.min(totalLen - 1, orderCursor + 1));
      setHexDigit(null);
      return;
    }
    if (key === "ArrowLeft") {
      e.preventDefault();
      setChannelCol(Math.max(0, channelCol - 1));
      setHexDigit(null);
      return;
    }
    if (key === "ArrowRight") {
      e.preventDefault();
      setChannelCol(Math.min(channelCount - 1, channelCol + 1));
      setHexDigit(null);
      return;
    }
    const hexChar = key.toUpperCase();
    if (/^[0-9A-F]$/.test(hexChar)) {
      e.preventDefault();
      const nibble = parseInt(hexChar, 16);
      if (hexDigit === null) {
        setHexDigit(nibble);
      } else {
        const value = hexDigit << 4 | nibble;
        if (engine) {
          engine.setOrderEntry(channelCol, orderCursor, value);
          useGTUltraStore.getState().refreshAllOrders();
        }
        setHexDigit(null);
        setOrderCursor(Math.min(totalLen - 1, orderCursor + 1));
      }
      return;
    }
    if (key === "Enter") {
      e.preventDefault();
      handleDoubleClick();
      return;
    }
    if (key === "Escape") {
      setHexDigit(null);
      return;
    }
  }, [orderCursor, totalLen, channelCol, channelCount, hexDigit, engine, setOrderCursor, handleDoubleClick]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      width,
      height,
      style: { width, height, borderBottom: "1px solid var(--color-border)", outline: "none" },
      tabIndex: 0,
      onClick: handleClick,
      onDoubleClick: handleDoubleClick,
      onKeyDown: handleKeyDown
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTOrderList.tsx",
      lineNumber: 190,
      columnNumber: 5
    },
    void 0
  );
};
export {
  GTOrderList
};
