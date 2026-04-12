import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React, X } from "./vendor-ui-AJ7AT9BN.js";
import { ao as useGTUltraStore, O as useModalClose } from "./main-BbV5VyEH.js";
import { WavetableEditor } from "./WavetableEditor-wq3DMlO8.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./DrawbarSlider-Dq9geM4g.js";
import "./WaveformThumbnail-CebZPsAz.js";
import "./SpectralFilter-Dxe-YniK.js";
import "./HarmonicBarsCanvas-tCyue1dW.js";
const TABLE_TYPE_INDEX$1 = {
  wave: 0,
  pulse: 1,
  filter: 2,
  speed: 3
};
const GTUltraTableStudioModal = ({
  isOpen,
  onClose,
  tableType,
  column = 0
}) => {
  const tableData = useGTUltraStore((s) => s.tableData);
  const engine = useGTUltraStore((s) => s.engine);
  const initial = reactExports.useMemo(() => {
    const table = tableData[tableType] ?? { left: new Uint8Array(255), right: new Uint8Array(255) };
    const source = column === 0 ? table.left : table.right;
    return {
      id: 0,
      data: Array.from(source),
      len: 255,
      max: 255
    };
  }, [tableData, tableType, column]);
  const [local, setLocal] = reactExports.useState(initial);
  React.useEffect(() => {
    if (isOpen) setLocal(initial);
  }, [isOpen, initial]);
  useModalClose({ isOpen, onClose });
  const handleCommit = reactExports.useCallback(() => {
    if (!engine) return;
    const typeIdx = TABLE_TYPE_INDEX$1[tableType];
    const table = tableData[tableType] ?? { left: new Uint8Array(255), right: new Uint8Array(255) };
    for (let i = 0; i < 255; i++) {
      const left = column === 0 ? local.data[i] ?? 0 : table.left[i] ?? 0;
      const right = column === 1 ? local.data[i] ?? 0 : table.right[i] ?? 0;
      engine.setTableEntry(typeIdx, i, left, right);
    }
    engine.checkpointUndo();
    onClose();
  }, [engine, tableType, column, local, tableData, onClose]);
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg shadow-2xl w-full max-w-[1100px] max-h-[90vh] flex flex-col", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-2 border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-sm font-mono font-bold text-text-primary uppercase tracking-wider", children: [
          "Waveform Studio — GT Ultra ",
          tableType,
          " table (",
          column === 0 ? "LEFT" : "RIGHT",
          ")"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
          lineNumber: 81,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] font-mono text-text-muted", children: "Edits commit back to the chip via engine.setTableEntry on save." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
          lineNumber: 84,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
        lineNumber: 80,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: onClose,
          title: "Close",
          className: "p-1.5 rounded text-text-muted hover:text-text-primary border border-dark-border",
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 16 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
            lineNumber: 93,
            columnNumber: 13
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
          lineNumber: 88,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
      lineNumber: 79,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto p-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      WavetableEditor,
      {
        wavetable: local,
        onChange: setLocal,
        initialLayout: "studio"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
        lineNumber: 98,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
      lineNumber: 97,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-end gap-2 px-4 py-2 border-t border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: onClose,
          className: "px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase bg-dark-bgSecondary text-text-muted hover:text-text-primary border border-dark-border",
          children: "Cancel"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
          lineNumber: 106,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: handleCommit,
          className: "px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase bg-accent-highlight/20 text-accent-highlight hover:bg-accent-highlight/30 border border-accent-highlight/50",
          children: "Save to chip"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
          lineNumber: 112,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
      lineNumber: 105,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
    lineNumber: 78,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTUltraTableStudioModal.tsx",
    lineNumber: 77,
    columnNumber: 5
  }, void 0);
};
const TABLE_TYPES = ["wave", "pulse", "filter", "speed"];
const TABLE_TYPE_INDEX = { wave: 0, pulse: 1, filter: 2, speed: 3 };
const TABLE_COLORS = {
  wave: "#60e060",
  pulse: "#ff8866",
  filter: "#ffcc00",
  speed: "#6699ff"
};
const WAVE_LEFT_ANNOTATIONS = {
  0: "nop",
  1: "set",
  16: "del+gateoff",
  17: "del+gateon",
  224: "inaudible",
  225: "noise+",
  254: "rst",
  255: "end"
};
const ROW_H = 14;
const GTTableEditor = ({ width, height }) => {
  const [activeTable, setActiveTable] = reactExports.useState("wave");
  const [activeCol, setActiveCol] = reactExports.useState(0);
  const [hexDigit, setHexDigit] = reactExports.useState(null);
  const [drawing, setDrawing] = reactExports.useState(false);
  const [hoverInfo, setHoverInfo] = reactExports.useState(null);
  const [studioOpen, setStudioOpen] = reactExports.useState(false);
  const canvasRef = reactExports.useRef(null);
  const tableData = useGTUltraStore((s) => s.tableData);
  const tableCursor = useGTUltraStore((s) => s.tableCursor);
  const setTableCursor = useGTUltraStore((s) => s.setTableCursor);
  const engine = useGTUltraStore((s) => s.engine);
  const tabHeight = 22;
  const headerHeight = 16;
  const contentHeight = height - tabHeight - headerHeight;
  const visibleRows = Math.floor(contentHeight / ROW_H);
  const table = tableData[activeTable] ?? { left: new Uint8Array(255), right: new Uint8Array(255) };
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = contentHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, width, contentHeight);
    ctx.font = `11px "JetBrains Mono", monospace`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "var(--color-bg-tertiary)";
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillStyle = "#888";
    ctx.fillText(" IDX", 4, 2);
    ctx.fillStyle = activeCol === 0 ? "#e0e0e0" : "#555";
    ctx.fillText("LEFT", 40, 2);
    ctx.fillStyle = activeCol === 1 ? "#e0e0e0" : "#555";
    ctx.fillText("RIGHT", 80, 2);
    if (activeTable === "wave") {
      ctx.fillStyle = "#444";
      ctx.fillText("INFO", 126, 2);
    }
    const scrollTop = Math.max(0, tableCursor - Math.floor(visibleRows / 2));
    const color = TABLE_COLORS[activeTable];
    for (let vi = 0; vi < visibleRows; vi++) {
      const idx = scrollTop + vi;
      if (idx >= 255) break;
      const y = headerHeight + vi * ROW_H;
      const isCursor = idx === tableCursor;
      if (isCursor) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, y, width, ROW_H);
        const colX = activeCol === 0 ? 36 : 76;
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(colX, y, 32, ROW_H);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, width - 1, ROW_H - 1);
      }
      ctx.fillStyle = "#555";
      ctx.fillText(idx.toString(16).toUpperCase().padStart(2, "0"), 8, y + 1);
      const left = table.left[idx];
      ctx.fillStyle = left === 0 ? "var(--color-border-light)" : color;
      ctx.fillText(left.toString(16).toUpperCase().padStart(2, "0"), 40, y + 1);
      const right = table.right[idx];
      ctx.fillStyle = right === 0 ? "var(--color-border-light)" : color;
      ctx.fillText(right.toString(16).toUpperCase().padStart(2, "0"), 80, y + 1);
      if (activeTable === "wave" && left !== 0) {
        const anno = WAVE_LEFT_ANNOTATIONS[left];
        if (anno) {
          ctx.fillStyle = "#555";
          ctx.fillText(anno, 126, y + 1);
        }
      }
      if (right > 0 && (activeTable === "pulse" || activeTable === "filter")) {
        const barW = right / 255 * (width - 170);
        ctx.fillStyle = color + "22";
        ctx.fillRect(126, y + 2, barW, ROW_H - 4);
      }
    }
  }, [width, contentHeight, activeTable, table, tableCursor, visibleRows, headerHeight, activeCol]);
  const pointerToIdx = reactExports.useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < headerHeight) return -1;
    const scrollTop = Math.max(0, tableCursor - Math.floor(visibleRows / 2));
    return Math.min(254, Math.max(0, scrollTop + Math.floor((y - headerHeight) / ROW_H)));
  }, [tableCursor, visibleRows, headerHeight]);
  const applyDrawValue = reactExports.useCallback((e) => {
    if (!engine) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = pointerToIdx(e);
    if (idx < 0) return;
    const barAreaStart = 130;
    const barAreaEnd = width - 10;
    if (x >= barAreaStart && (activeTable === "pulse" || activeTable === "filter" || activeTable === "speed")) {
      const frac = Math.max(0, Math.min(1, (x - barAreaStart) / (barAreaEnd - barAreaStart)));
      const value = Math.round(frac * 255);
      const typeIdx = TABLE_TYPE_INDEX[activeTable];
      engine.setTableEntry(typeIdx, 1, idx, value);
      useGTUltraStore.getState().refreshAllTables();
    }
  }, [engine, activeTable, width, pointerToIdx]);
  const handleCanvasClick = reactExports.useCallback((e) => {
    var _a;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < headerHeight) return;
    const scrollTop = Math.max(0, tableCursor - Math.floor(visibleRows / 2));
    const idx = scrollTop + Math.floor((y - headerHeight) / ROW_H);
    if (idx < 255) setTableCursor(idx);
    setActiveCol(x >= 66 && x < 120 ? 1 : 0);
    setHexDigit(null);
    (_a = canvasRef.current) == null ? void 0 : _a.focus();
  }, [tableCursor, visibleRows, headerHeight, setTableCursor]);
  const handlePointerDown = reactExports.useCallback((e) => {
    setDrawing(true);
    applyDrawValue(e);
  }, [applyDrawValue]);
  const handlePointerMove = reactExports.useCallback((e) => {
    const idx = pointerToIdx(e);
    if (idx >= 0) {
      const rect = canvasRef.current.getBoundingClientRect();
      setHoverInfo({ idx, x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setHoverInfo(null);
    }
    if (drawing) {
      applyDrawValue(e);
    }
  }, [drawing, pointerToIdx, applyDrawValue]);
  const handlePointerUp = reactExports.useCallback(() => {
    setDrawing(false);
  }, []);
  const handleKeyDown = reactExports.useCallback((e) => {
    const { key } = e;
    e.stopPropagation();
    if (key === "ArrowUp") {
      e.preventDefault();
      setTableCursor(Math.max(0, tableCursor - 1));
      setHexDigit(null);
      return;
    }
    if (key === "ArrowDown") {
      e.preventDefault();
      setTableCursor(Math.min(254, tableCursor + 1));
      setHexDigit(null);
      return;
    }
    if (key === "ArrowLeft") {
      e.preventDefault();
      setActiveCol(0);
      setHexDigit(null);
      return;
    }
    if (key === "ArrowRight") {
      e.preventDefault();
      setActiveCol(1);
      setHexDigit(null);
      return;
    }
    if (key === "Tab") {
      e.preventDefault();
      const curIdx = TABLE_TYPES.indexOf(activeTable);
      const next = e.shiftKey ? TABLE_TYPES[(curIdx - 1 + 4) % 4] : TABLE_TYPES[(curIdx + 1) % 4];
      setActiveTable(next);
      setHexDigit(null);
      return;
    }
    if (key === "PageUp") {
      e.preventDefault();
      setTableCursor(Math.max(0, tableCursor - visibleRows));
      setHexDigit(null);
      return;
    }
    if (key === "PageDown") {
      e.preventDefault();
      setTableCursor(Math.min(254, tableCursor + visibleRows));
      setHexDigit(null);
      return;
    }
    if (key === "Home") {
      e.preventDefault();
      setTableCursor(0);
      setHexDigit(null);
      return;
    }
    if (key === "End") {
      e.preventDefault();
      setTableCursor(254);
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
          const typeIdx = TABLE_TYPE_INDEX[activeTable];
          engine.setTableEntry(typeIdx, activeCol, tableCursor, value);
          useGTUltraStore.getState().refreshAllTables();
        }
        setHexDigit(null);
        setTableCursor(Math.min(254, tableCursor + 1));
      }
      return;
    }
    if (key === "Delete") {
      e.preventDefault();
      if (engine) {
        const typeIdx = TABLE_TYPE_INDEX[activeTable];
        engine.setTableEntry(typeIdx, activeCol, tableCursor, 0);
        useGTUltraStore.getState().refreshAllTables();
      }
      return;
    }
    if (key === "Escape") {
      setHexDigit(null);
      return;
    }
  }, [tableCursor, activeTable, activeCol, hexDigit, engine, visibleRows, setTableCursor]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width, height, display: "flex", flexDirection: "column" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", height: tabHeight, background: "var(--color-bg-tertiary)" }, children: [
      TABLE_TYPES.map((t) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => {
            setActiveTable(t);
            setHexDigit(null);
          },
          style: {
            flex: 1,
            background: activeTable === t ? "#0d0d0d" : "transparent",
            color: activeTable === t ? TABLE_COLORS[t] : "#555",
            border: "none",
            borderBottom: activeTable === t ? `2px solid ${TABLE_COLORS[t]}` : "2px solid transparent",
            cursor: "pointer",
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
            fontWeight: "bold",
            textTransform: "uppercase"
          },
          children: t
        },
        t,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTTableEditor.tsx",
          lineNumber: 280,
          columnNumber: 11
        },
        void 0
      )),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setStudioOpen(true),
          title: "Open Waveform Studio (draw, harmonic, math, presets)",
          style: {
            padding: "0 10px",
            background: "transparent",
            color: "#22d3ee",
            border: "none",
            borderLeft: "1px solid var(--color-border)",
            cursor: "pointer",
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
            fontWeight: "bold",
            textTransform: "uppercase"
          },
          children: "Studio"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTTableEditor.tsx",
          lineNumber: 299,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTTableEditor.tsx",
      lineNumber: 278,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "relative", width, height: contentHeight }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "canvas",
        {
          ref: canvasRef,
          style: { width, height: contentHeight, outline: "none", cursor: drawing ? "crosshair" : "default" },
          tabIndex: 0,
          onClick: handleCanvasClick,
          onKeyDown: handleKeyDown,
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerLeave: () => {
            setDrawing(false);
            setHoverInfo(null);
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTTableEditor.tsx",
          lineNumber: 321,
          columnNumber: 9
        },
        void 0
      ),
      hoverInfo && hoverInfo.idx >= 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        position: "absolute",
        left: Math.min(hoverInfo.x + 12, width - 90),
        top: Math.max(0, hoverInfo.y - 24),
        background: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: 3,
        padding: "2px 6px",
        fontSize: 9,
        fontFamily: '"JetBrains Mono", monospace',
        color: TABLE_COLORS[activeTable],
        pointerEvents: "none",
        zIndex: 10,
        whiteSpace: "nowrap"
      }, children: [
        "[",
        hoverInfo.idx.toString(16).toUpperCase().padStart(2, "0"),
        "] L:",
        table.left[hoverInfo.idx].toString(16).toUpperCase().padStart(2, "0"),
        " R:",
        table.right[hoverInfo.idx].toString(16).toUpperCase().padStart(2, "0"),
        activeTable === "wave" && WAVE_LEFT_ANNOTATIONS[table.left[hoverInfo.idx]] ? ` (${WAVE_LEFT_ANNOTATIONS[table.left[hoverInfo.idx]]})` : ""
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTTableEditor.tsx",
        lineNumber: 334,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTTableEditor.tsx",
      lineNumber: 320,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      GTUltraTableStudioModal,
      {
        isOpen: studioOpen,
        onClose: () => setStudioOpen(false),
        tableType: activeTable,
        column: activeCol
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTTableEditor.tsx",
        lineNumber: 356,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTTableEditor.tsx",
    lineNumber: 276,
    columnNumber: 5
  }, void 0);
};
export {
  GTTableEditor
};
