import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { dH as MusicLineEngine, W as CustomSelect, aB as Knob } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
let arpClipboard = null;
const VISIBLE_ROWS = 12;
const MAX_ROWS = 128;
const ROW_HEIGHT = 20;
const GRID_HEIGHT = VISIBLE_ROWS * ROW_HEIGHT;
const NUM_CURSOR_COLS = 9;
const ML_NOTES = ["C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-"];
const ARP_OFFSET = [0, 1, 1, 2, 3, 3, 4, 5, 5];
const ARP_SHIFT = [0, 1, 0, 0, 1, 0, 0, 1, 0];
const FIELD_KEYS = ["note", "smpl", "fx1", "param1", "fx2", "param2"];
const COL_COLORS = [
  "#60e060",
  // 0: note
  "#e0c040",
  // 1: ws hi
  "#e0c040",
  // 2: ws lo
  "#60a0e0",
  // 3: fx1 num
  "#6080c0",
  // 4: fx1 param hi
  "#6080c0",
  // 5: fx1 param lo
  "#c060e0",
  // 6: fx2 num
  "#a060c0",
  // 7: fx2 param hi
  "#a060c0"
  // 8: fx2 param lo
];
const COL_WIDTHS = [36, 12, 12, 12, 12, 12, 12, 12, 12];
const ROW_NUM_WIDTH = 28;
const GROUP_GAP = 6;
const TOTAL_WIDTH = ROW_NUM_WIDTH + COL_WIDTHS.reduce((s, w) => s + w, 0) + GROUP_GAP * 3;
const SUB_FX_NAMES = {
  0: "---",
  1: "Pitch Up",
  2: "Pitch Dn",
  3: "Set Vol",
  4: "Vol Up",
  5: "Vol Dn",
  6: "Restart"
};
const QWERTY_NOTE_MAP = {
  // Bottom row (lower octave): C=0, C#=1, D=2, ...
  z: { semitone: 0, octaveOffset: 0 },
  s: { semitone: 1, octaveOffset: 0 },
  x: { semitone: 2, octaveOffset: 0 },
  d: { semitone: 3, octaveOffset: 0 },
  c: { semitone: 4, octaveOffset: 0 },
  v: { semitone: 5, octaveOffset: 0 },
  g: { semitone: 6, octaveOffset: 0 },
  b: { semitone: 7, octaveOffset: 0 },
  h: { semitone: 8, octaveOffset: 0 },
  n: { semitone: 9, octaveOffset: 0 },
  j: { semitone: 10, octaveOffset: 0 },
  m: { semitone: 11, octaveOffset: 0 },
  ",": { semitone: 0, octaveOffset: 1 },
  // Top row (higher octave)
  q: { semitone: 0, octaveOffset: 1 },
  "2": { semitone: 1, octaveOffset: 1 },
  w: { semitone: 2, octaveOffset: 1 },
  "3": { semitone: 3, octaveOffset: 1 },
  e: { semitone: 4, octaveOffset: 1 },
  r: { semitone: 5, octaveOffset: 1 },
  "5": { semitone: 6, octaveOffset: 1 },
  t: { semitone: 7, octaveOffset: 1 },
  "6": { semitone: 8, octaveOffset: 1 },
  y: { semitone: 9, octaveOffset: 1 },
  "7": { semitone: 10, octaveOffset: 1 },
  u: { semitone: 11, octaveOffset: 1 },
  i: { semitone: 0, octaveOffset: 2 },
  "9": { semitone: 1, octaveOffset: 2 },
  o: { semitone: 2, octaveOffset: 2 },
  "0": { semitone: 3, octaveOffset: 2 },
  p: { semitone: 4, octaveOffset: 2 }
};
function formatNote(value) {
  if (value === 0) return "---";
  if (value === 61) return "END";
  if (value === 62) return "RST";
  const rel = value & 128;
  const raw = value & 127;
  if (raw >= 1 && raw <= 60) {
    const n = (raw - 1) % 12;
    const o = Math.floor((raw - 1) / 12) + 1;
    const name = `${ML_NOTES[n]}${o}`;
    return rel ? `~${name.slice(0, 2)}${o}` : name;
  }
  return value.toString(16).toUpperCase().padStart(2, "0");
}
function formatHexNibble(value) {
  return value.toString(16).toUpperCase();
}
function formatRow(entry) {
  const { note, smpl, fx1, param1, fx2, param2 } = entry;
  return [
    formatNote(note),
    // col 0: note (3 chars)
    formatHexNibble(smpl >> 4 & 15),
    // col 1: ws hi
    formatHexNibble(smpl & 15),
    // col 2: ws lo
    formatHexNibble(fx1 >> 4 & 15),
    // col 3: fx1 num (high nibble only — fx num is 0-F)
    formatHexNibble(param1 >> 4 & 15),
    // col 4: fx1 param hi
    formatHexNibble(param1 & 15),
    // col 5: fx1 param lo
    formatHexNibble(fx2 >> 4 & 15),
    // col 6: fx2 num
    formatHexNibble(param2 >> 4 & 15),
    // col 7: fx2 param hi
    formatHexNibble(param2 & 15)
    // col 8: fx2 param lo
  ];
}
const EMPTY_ARP_ROW = { note: 0, smpl: 0, fx1: 0, param1: 0, fx2: 0, param2: 0 };
function makeEmptyRows() {
  return Array.from({ length: MAX_ROWS }, () => ({ ...EMPTY_ARP_ROW }));
}
function normalizeMarkRange(start, end) {
  if (start === null || end === null) return null;
  return [Math.min(start, end), Math.max(start, end)];
}
const MusicLineArpeggioEditor = ({
  initialTable = 0,
  onTableChange
}) => {
  const [numArps, setNumArps] = reactExports.useState(0);
  const [selectedTable, setSelectedTable] = reactExports.useState(Math.max(0, initialTable));
  const [rows, setRows] = reactExports.useState([]);
  const [tableLength, setTableLength] = reactExports.useState(0);
  const [loading, setLoading] = reactExports.useState(true);
  const [selRow, setSelRow] = reactExports.useState(0);
  const [selCol, setSelCol] = reactExports.useState(0);
  const [editMode, setEditMode] = reactExports.useState(0);
  const [octave, setOctave] = reactExports.useState(2);
  const [markStart, setMarkStart] = reactExports.useState(null);
  const [markEnd, setMarkEnd] = reactExports.useState(null);
  const scrollRef = reactExports.useRef(null);
  const rowsRef = reactExports.useRef(rows);
  rowsRef.current = rows;
  const markRange = normalizeMarkRange(markStart, markEnd);
  reactExports.useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled && numArps === 0) {
        setNumArps(1);
      }
    }, 2e3);
    if (MusicLineEngine.hasInstance()) {
      const engine = MusicLineEngine.getInstance();
      engine.ready().then(() => {
        engine.readInstArpConfig(0).then((cfg) => {
          clearTimeout(timeout);
          if (!cancelled) setNumArps(Math.max(1, cfg.numArps));
        }).catch(() => {
          clearTimeout(timeout);
          if (!cancelled) setNumArps(1);
        });
      });
    }
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setRows(makeEmptyRows());
        setTableLength(MAX_ROWS);
        setLoading(false);
        setSelRow(0);
        setSelCol(0);
      }
    }, 2e3);
    (async () => {
      if (!MusicLineEngine.hasInstance()) {
        clearTimeout(timeout);
        setRows(makeEmptyRows());
        setTableLength(MAX_ROWS);
        setLoading(false);
        return;
      }
      const engine = MusicLineEngine.getInstance();
      await engine.ready();
      try {
        const data = await engine.readArpTable(selectedTable);
        clearTimeout(timeout);
        if (cancelled) return;
        const effectiveRows = data.rows.length > 0 ? data.rows : makeEmptyRows();
        const effectiveLength = data.length > 0 ? data.length : MAX_ROWS;
        while (effectiveRows.length < MAX_ROWS) {
          effectiveRows.push({ ...EMPTY_ARP_ROW });
        }
        setRows(effectiveRows);
        setTableLength(effectiveLength);
      } catch {
        clearTimeout(timeout);
        if (cancelled) return;
        setRows(makeEmptyRows());
        setTableLength(MAX_ROWS);
      }
      setLoading(false);
      setSelRow(0);
      setSelCol(0);
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [selectedTable]);
  const handleCellClick = reactExports.useCallback((row, col, shiftKey) => {
    if (shiftKey) {
      if (markStart === null) {
        setMarkStart(selRow);
      }
      setMarkEnd(row);
    } else {
      setMarkStart(null);
      setMarkEnd(null);
    }
    setSelRow(row);
    setSelCol(col);
  }, [selRow, markStart]);
  const commitByte = reactExports.useCallback((row, fieldIdx, value) => {
    const fieldKey = FIELD_KEYS[fieldIdx];
    const clamped = Math.max(0, Math.min(255, value));
    if (MusicLineEngine.hasInstance()) {
      const engine = MusicLineEngine.getInstance();
      engine.writeArpEntry(selectedTable, row, fieldIdx, clamped);
    }
    setRows((prev) => {
      const next = [...prev];
      next[row] = { ...next[row], [fieldKey]: clamped };
      return next;
    });
  }, [selectedTable]);
  const commitNibble = reactExports.useCallback((row, cursorCol, nibbleValue) => {
    var _a;
    const fieldIdx = ARP_OFFSET[cursorCol];
    const isHigh = ARP_SHIFT[cursorCol] === 1;
    const fieldKey = FIELD_KEYS[fieldIdx];
    const currentByte = ((_a = rowsRef.current[row]) == null ? void 0 : _a[fieldKey]) ?? 0;
    let newByte;
    if (isHigh) {
      newByte = nibbleValue << 4 | currentByte & 15;
    } else {
      newByte = currentByte & 240 | nibbleValue & 15;
    }
    commitByte(row, fieldIdx, newByte);
  }, [commitByte]);
  const advanceCursor = reactExports.useCallback(() => {
    if (editMode === 0) {
      setSelRow((r) => Math.min(r + 1, tableLength - 1));
    } else {
      setSelCol((c) => {
        if (c < NUM_CURSOR_COLS - 1) return c + 1;
        setSelRow((r) => Math.min(r + 1, tableLength - 1));
        return 0;
      });
    }
  }, [editMode, tableLength]);
  const insertRow = reactExports.useCallback((atRow) => {
    setRows((prev) => {
      const next = [...prev];
      next.splice(atRow, 0, { ...EMPTY_ARP_ROW });
      if (next.length > MAX_ROWS) next.length = MAX_ROWS;
      return next;
    });
  }, []);
  const deleteRow = reactExports.useCallback((atRow) => {
    setRows((prev) => {
      const next = [...prev];
      next.splice(atRow, 1);
      next.push({ ...EMPTY_ARP_ROW });
      return next;
    });
  }, []);
  const clearCurrentField = reactExports.useCallback(() => {
    const cursorCol = selCol;
    if (cursorCol === 0) {
      commitByte(selRow, 0, 0);
    } else {
      commitNibble(selRow, cursorCol, 0);
    }
  }, [selRow, selCol, commitByte, commitNibble]);
  const writeFullRowToEngine = reactExports.useCallback((tableIdx, rowIdx, entry) => {
    if (!MusicLineEngine.hasInstance()) return;
    const engine = MusicLineEngine.getInstance();
    const vals = [entry.note, entry.smpl, entry.fx1, entry.param1, entry.fx2, entry.param2];
    for (let f = 0; f < vals.length; f++) {
      engine.writeArpEntry(tableIdx, rowIdx, f, vals[f]);
    }
  }, []);
  const copyBlock = reactExports.useCallback(() => {
    if (!markRange) return;
    const [lo, hi] = markRange;
    arpClipboard = { rows: rowsRef.current.slice(lo, hi + 1).map((r) => ({ ...r })) };
  }, [markRange]);
  const cutBlock = reactExports.useCallback(() => {
    if (!markRange) return;
    const [lo, hi] = markRange;
    arpClipboard = { rows: rowsRef.current.slice(lo, hi + 1).map((r) => ({ ...r })) };
    setRows((prev) => {
      const next = [...prev];
      for (let r = lo; r <= hi; r++) {
        next[r] = { ...EMPTY_ARP_ROW };
        writeFullRowToEngine(selectedTable, r, EMPTY_ARP_ROW);
      }
      return next;
    });
    setMarkStart(null);
    setMarkEnd(null);
  }, [markRange, selectedTable, writeFullRowToEngine]);
  const pasteBlock = reactExports.useCallback(() => {
    if (!arpClipboard || arpClipboard.rows.length === 0) return;
    const startRow = selRow;
    const clipRows = arpClipboard.rows;
    setRows((prev) => {
      const next = [...prev];
      for (let i = 0; i < clipRows.length; i++) {
        const targetRow = startRow + i;
        if (targetRow >= tableLength) break;
        next[targetRow] = { ...clipRows[i] };
        writeFullRowToEngine(selectedTable, targetRow, clipRows[i]);
      }
      return next;
    });
  }, [selRow, tableLength, selectedTable, writeFullRowToEngine]);
  const handleKeyDown = reactExports.useCallback((e) => {
    const cursorCol = selCol;
    const isMeta = e.metaKey || e.ctrlKey;
    if (isMeta && e.key === "c") {
      e.preventDefault();
      copyBlock();
      return;
    }
    if (isMeta && e.key === "x") {
      e.preventDefault();
      cutBlock();
      return;
    }
    if (isMeta && e.key === "v") {
      e.preventDefault();
      pasteBlock();
      return;
    }
    if (isMeta && e.key === "a") {
      e.preventDefault();
      setMarkStart(0);
      setMarkEnd(tableLength - 1);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setMarkStart(null);
      setMarkEnd(null);
      return;
    }
    if (e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (markStart === null) {
        setMarkStart(selRow);
        setMarkEnd(selRow);
      }
      if (e.key === "ArrowDown") {
        const newRow = Math.min(selRow + 1, tableLength - 1);
        setSelRow(newRow);
        setMarkEnd(newRow);
      } else {
        const newRow = Math.max(selRow - 1, 0);
        setSelRow(newRow);
        setMarkEnd(newRow);
      }
      return;
    }
    if (e.shiftKey && (e.key === "PageDown" || e.key === "PageUp")) {
      e.preventDefault();
      if (markStart === null) {
        setMarkStart(selRow);
        setMarkEnd(selRow);
      }
      if (e.key === "PageDown") {
        const newRow = Math.min(selRow + VISIBLE_ROWS, tableLength - 1);
        setSelRow(newRow);
        setMarkEnd(newRow);
      } else {
        const newRow = Math.max(selRow - VISIBLE_ROWS, 0);
        setSelRow(newRow);
        setMarkEnd(newRow);
      }
      return;
    }
    if (e.shiftKey && e.key === "Home") {
      e.preventDefault();
      if (markStart === null) setMarkStart(selRow);
      setSelRow(0);
      setMarkEnd(0);
      return;
    }
    if (e.shiftKey && e.key === "End") {
      e.preventDefault();
      if (markStart === null) setMarkStart(selRow);
      const lastRow = tableLength - 1;
      setSelRow(lastRow);
      setMarkEnd(lastRow);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMarkStart(null);
      setMarkEnd(null);
      setSelRow((r) => Math.min(r + 1, tableLength - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setMarkStart(null);
      setMarkEnd(null);
      setSelRow((r) => Math.max(r - 1, 0));
      return;
    }
    if (e.key === "ArrowRight" || e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      setSelCol((c) => Math.min(c + 1, NUM_CURSOR_COLS - 1));
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      setSelCol((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key === "PageDown") {
      e.preventDefault();
      setMarkStart(null);
      setMarkEnd(null);
      setSelRow((r) => Math.min(r + VISIBLE_ROWS, tableLength - 1));
      return;
    }
    if (e.key === "PageUp") {
      e.preventDefault();
      setMarkStart(null);
      setMarkEnd(null);
      setSelRow((r) => Math.max(r - VISIBLE_ROWS, 0));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setMarkStart(null);
      setMarkEnd(null);
      setSelRow(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setMarkStart(null);
      setMarkEnd(null);
      setSelRow(tableLength - 1);
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      clearCurrentField();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      deleteRow(selRow);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      insertRow(selRow);
      return;
    }
    if (e.key >= "F1" && e.key <= "F5") {
      e.preventDefault();
      setOctave(parseInt(e.key[1], 10) - 1);
      return;
    }
    if (e.key === "F6") {
      e.preventDefault();
      setEditMode((m) => m === 0 ? 1 : 0);
      return;
    }
    if (cursorCol === 0) {
      const key = e.key.toLowerCase();
      if (key === "1") {
        e.preventDefault();
        commitByte(selRow, 0, 61);
        advanceCursor();
        return;
      }
      if (key === "`" || key === "~") {
        e.preventDefault();
        commitByte(selRow, 0, 62);
        advanceCursor();
        return;
      }
      const mapping = QWERTY_NOTE_MAP[key];
      if (mapping) {
        e.preventDefault();
        const noteValue = (octave + mapping.octaveOffset) * 12 + mapping.semitone + 1;
        if (noteValue >= 1 && noteValue <= 60) {
          commitByte(selRow, 0, noteValue);
          advanceCursor();
        }
        return;
      }
      return;
    }
    const hexMatch = e.key.match(/^[0-9a-fA-F]$/);
    if (hexMatch) {
      e.preventDefault();
      const nibbleValue = parseInt(hexMatch[0], 16);
      commitNibble(selRow, cursorCol, nibbleValue);
      advanceCursor();
      return;
    }
  }, [
    selRow,
    selCol,
    octave,
    tableLength,
    editMode,
    commitByte,
    commitNibble,
    advanceCursor,
    clearCurrentField,
    deleteRow,
    insertRow,
    copyBlock,
    cutBlock,
    pasteBlock,
    markStart
  ]);
  reactExports.useEffect(() => {
    if (!scrollRef.current) return;
    const top = selRow * ROW_HEIGHT;
    const bot = top + ROW_HEIGHT;
    const st = scrollRef.current.scrollTop;
    if (top < st) {
      scrollRef.current.scrollTop = top;
    } else if (bot > st + GRID_HEIGHT) {
      scrollRef.current.scrollTop = bot - GRID_HEIGHT;
    }
  }, [selRow]);
  const getColLeft = (colIdx) => {
    let left = ROW_NUM_WIDTH;
    for (let i = 0; i < colIdx; i++) {
      left += COL_WIDTHS[i];
      if (i === 0 || i === 2 || i === 5) left += GROUP_GAP;
    }
    return left;
  };
  const getCursorColFromX = (x) => {
    for (let i = NUM_CURSOR_COLS - 1; i >= 0; i--) {
      if (x >= getColLeft(i)) return i;
    }
    return 0;
  };
  if (loading) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "var(--color-text-muted)", fontSize: 11, padding: 12 }, children: "Loading arpeggio data..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
      lineNumber: 731,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        flex: 1,
        minHeight: 0,
        fontFamily: "monospace",
        fontSize: 11
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "5px 8px",
              background: "#0e0e18",
              border: "1px solid #1e1e2e",
              borderRadius: 4,
              flexWrap: "wrap"
            },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { style: { color: "#7a7a9a", fontSize: 10 }, children: [
                "Table:",
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  CustomSelect,
                  {
                    value: String(selectedTable),
                    onChange: (v) => {
                      const idx = parseInt(v, 10);
                      setSelectedTable(idx);
                      onTableChange == null ? void 0 : onTableChange(idx);
                    },
                    options: Array.from({ length: numArps }, (_, i) => ({ value: String(i), label: String(i) }))
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                    lineNumber: 764,
                    columnNumber: 11
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                lineNumber: 762,
                columnNumber: 9
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#7a7a9a", fontSize: 10 }, children: [
                "Oct: ",
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#60e060" }, children: octave + 1 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                  lineNumber: 771,
                  columnNumber: 16
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#3a3a5a", marginLeft: 2 }, children: "(F1-F5)" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                  lineNumber: 772,
                  columnNumber: 11
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                lineNumber: 770,
                columnNumber: 9
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "span",
                {
                  onClick: () => setEditMode((m) => m === 0 ? 1 : 0),
                  style: {
                    color: editMode === 0 ? "#60a0e0" : "#e0c040",
                    fontSize: 10,
                    cursor: "pointer",
                    userSelect: "none",
                    padding: "1px 4px",
                    background: "#14141e",
                    border: "1px solid #2a2a3e",
                    borderRadius: 3
                  },
                  children: [
                    editMode === 0 ? "Vert" : "Horiz",
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#3a3a5a", marginLeft: 2 }, children: "(F6)" }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                      lineNumber: 788,
                      columnNumber: 11
                    }, void 0)
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                  lineNumber: 774,
                  columnNumber: 9
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#7a7a9a", fontSize: 10 }, children: [
                "Rows: ",
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#a0a0ff" }, children: tableLength }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                  lineNumber: 791,
                  columnNumber: 17
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                lineNumber: 790,
                columnNumber: 9
              }, void 0),
              markRange && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#60a0e0", fontSize: 10 }, children: [
                "Mark: ",
                markRange[0].toString(16).toUpperCase().padStart(2, "0"),
                "-",
                markRange[1].toString(16).toUpperCase().padStart(2, "0"),
                "(",
                markRange[1] - markRange[0] + 1,
                " rows)"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                lineNumber: 794,
                columnNumber: 11
              }, void 0)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
            lineNumber: 750,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            style: {
              display: "flex",
              gap: 8,
              padding: "2px 8px",
              fontSize: 9,
              color: "#5a5a7a",
              flexWrap: "wrap"
            },
            children: Object.entries(SUB_FX_NAMES).map(([k, v]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#60a0e0" }, children: parseInt(k).toString(16).toUpperCase() }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                lineNumber: 814,
                columnNumber: 13
              }, void 0),
              "=",
              v
            ] }, k, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
              lineNumber: 813,
              columnNumber: 11
            }, void 0))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
            lineNumber: 802,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            style: {
              display: "flex",
              borderBottom: "1px solid #2a2a3e",
              padding: "2px 0",
              userSelect: "none",
              position: "relative",
              height: 14
            },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: ROW_NUM_WIDTH, textAlign: "right", paddingRight: 4, color: "#4a4a6a", fontSize: 9 }, children: "#" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                lineNumber: 831,
                columnNumber: 9
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "absolute", left: getColLeft(0), color: "#60e060", fontSize: 9, opacity: 0.7 }, children: "Note" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                lineNumber: 834,
                columnNumber: 9
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "absolute", left: getColLeft(1), color: "#e0c040", fontSize: 9, opacity: 0.7 }, children: "WS" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                lineNumber: 837,
                columnNumber: 9
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "absolute", left: getColLeft(3), color: "#60a0e0", fontSize: 9, opacity: 0.7 }, children: "FPP" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                lineNumber: 840,
                columnNumber: 9
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "absolute", left: getColLeft(6), color: "#c060e0", fontSize: 9, opacity: 0.7 }, children: "FPP" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                lineNumber: 843,
                columnNumber: 9
              }, void 0)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
            lineNumber: 821,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            ref: scrollRef,
            tabIndex: 0,
            onKeyDown: handleKeyDown,
            style: {
              flex: 1,
              minHeight: GRID_HEIGHT,
              maxHeight: GRID_HEIGHT,
              overflowY: "auto",
              overflowX: "hidden",
              outline: "none",
              cursor: "default"
            },
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: TOTAL_WIDTH }, children: rows.slice(0, tableLength).map((entry, rowIdx) => {
              const isSelectedRow = rowIdx === selRow;
              const isMarked = markRange !== null && rowIdx >= markRange[0] && rowIdx <= markRange[1];
              const formatted = formatRow(entry);
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  onClick: (e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const col = getCursorColFromX(x);
                    handleCellClick(rowIdx, col, e.shiftKey);
                  },
                  style: {
                    display: "flex",
                    position: "relative",
                    height: ROW_HEIGHT,
                    alignItems: "center",
                    background: isMarked ? "#1a2a3e" : isSelectedRow ? "#1a1a2e" : rowIdx % 4 === 0 ? "#0c0c16" : "transparent",
                    borderBottom: "1px solid #12121e",
                    cursor: "pointer"
                  },
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "div",
                      {
                        style: {
                          width: ROW_NUM_WIDTH,
                          textAlign: "right",
                          paddingRight: 4,
                          color: isMarked ? "#60a0e0" : rowIdx % 4 === 0 ? "#5a5a8a" : "#3a3a5a",
                          fontSize: 10,
                          flexShrink: 0
                        },
                        children: rowIdx.toString(16).toUpperCase().padStart(2, "0")
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                        lineNumber: 891,
                        columnNumber: 17
                      },
                      void 0
                    ),
                    formatted.map((text, colIdx) => {
                      const isSelected = isSelectedRow && colIdx === selCol;
                      const fieldIdx = ARP_OFFSET[colIdx];
                      const byteValue = entry[FIELD_KEYS[fieldIdx]];
                      const isEmpty = colIdx === 0 ? byteValue === 0 : text === "0";
                      const tooltip = colIdx === 3 || colIdx === 6 ? SUB_FX_NAMES[byteValue >> 4 & 15] ?? `Unknown` : void 0;
                      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                        "div",
                        {
                          title: tooltip,
                          style: {
                            position: "absolute",
                            left: getColLeft(colIdx),
                            width: COL_WIDTHS[colIdx],
                            textAlign: "center",
                            color: isEmpty ? "#2a2a3e" : COL_COLORS[colIdx],
                            background: isSelected ? "#2a2a4e" : "transparent",
                            borderRadius: isSelected ? 2 : 0,
                            outline: isSelected ? `1px solid ${COL_COLORS[colIdx]}44` : "none",
                            lineHeight: `${ROW_HEIGHT}px`,
                            fontSize: colIdx === 0 ? 11 : 10
                          },
                          children: text
                        },
                        colIdx,
                        false,
                        {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                          lineNumber: 917,
                          columnNumber: 21
                        },
                        void 0
                      );
                    })
                  ]
                },
                rowIdx,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
                  lineNumber: 870,
                  columnNumber: 15
                },
                void 0
              );
            }) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
              lineNumber: 863,
              columnNumber: 9
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
            lineNumber: 849,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: "2px 8px", fontSize: 9, color: "#3a3a5a" }, children: "Note: QWERTY | 1=END `=RST | Hex: 0-9 A-F | Del=Clear | BkSp=Del Row | Enter=Ins Row | F1-F5=Oct | F6=Mode" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
          lineNumber: 944,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: "0px 8px 2px", fontSize: 9, color: "#3a3a5a" }, children: "Block: Shift+Arrow/Click=Mark | Ctrl+C=Copy | Ctrl+X=Cut | Ctrl+V=Paste | Ctrl+A=All | Esc=Deselect" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
          lineNumber: 947,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineArpeggioEditor.tsx",
      lineNumber: 738,
      columnNumber: 5
    },
    void 0
  );
};
const WIDTH = 256;
const HEIGHT = 64;
const BG_COLOR = "#0a0a14";
const LINE_COLOR = "#40e040";
const CENTER_COLOR = "#1a3a1a";
const MusicLineWaveformVisualizer = () => {
  const canvasRef = reactExports.useRef(null);
  const analyserRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(0);
  const dataRef = reactExports.useRef(null);
  const draw = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!canvas || !analyser || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    analyser.getByteTimeDomainData(data);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = CENTER_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT / 2);
    ctx.lineTo(WIDTH, HEIGHT / 2);
    ctx.stroke();
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const sliceWidth = WIDTH / data.length;
    let x = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128;
      const y = v * HEIGHT / 2;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    ctx.stroke();
    rafRef.current = requestAnimationFrame(draw);
  }, []);
  reactExports.useEffect(() => {
    if (!MusicLineEngine.hasInstance()) return;
    const engine = MusicLineEngine.getInstance();
    const audioContext = engine.output.context;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0;
    analyserRef.current = analyser;
    dataRef.current = new Uint8Array(analyser.frequencyBinCount);
    engine.output.connect(analyser);
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        engine.output.disconnect(analyser);
      } catch {
      }
      analyserRef.current = null;
      dataRef.current = null;
    };
  }, [draw]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      width: WIDTH,
      height: HEIGHT,
      style: {
        width: WIDTH,
        height: HEIGHT,
        borderRadius: 4,
        border: "1px solid #2a2a4a",
        imageRendering: "pixelated"
      }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/musicline/MusicLineWaveformVisualizer.tsx",
      lineNumber: 99,
      columnNumber: 5
    },
    void 0
  );
};
const PAL_C3_RATE = 8287;
const BRAND_COLOR = "#7070ff";
const LOOP_SIZE_DEFS = {
  1: { samples: 16, approxNote: "C-4" },
  2: { samples: 32, approxNote: "C-3" },
  3: { samples: 64, approxNote: "C-2" },
  4: { samples: 128, approxNote: "C-1" },
  5: { samples: 256, approxNote: "C-0" }
};
const OFF = {
  // Header
  volume: 58,
  transpose: 60,
  slideSpeed: 61,
  effects1: 62,
  effects2: 63,
  // ADSR (+64, 24 bytes: 4 stages x {Length u16, Speed u16, Volume u16})
  atkLength: 64,
  atkSpeed: 66,
  atkVolume: 68,
  decLength: 70,
  decSpeed: 72,
  decVolume: 74,
  susLength: 76,
  susSpeed: 78,
  susVolume: 80,
  relLength: 82,
  relSpeed: 84,
  relVolume: 86,
  // Vibrato (+88, 12 bytes)
  vibDir: 88,
  vibWaveNum: 89,
  vibSpeed: 90,
  vibDelay: 92,
  vibAtkSpd: 94,
  vibAttack: 96,
  vibDepth: 98,
  // Tremolo (+100, 12 bytes)
  tremDir: 100,
  tremWaveNum: 101,
  tremSpeed: 102,
  tremDelay: 104,
  tremAtkSpd: 106,
  tremAttack: 108,
  tremDepth: 110,
  // Arpeggio (+112, 4 bytes)
  arpTable: 112,
  arpSpeed: 114,
  arpGroove: 115,
  // Transform (+116, 18 bytes: 5xu8 waveNums + pad + 6xu16)
  trfWave0: 116,
  trfWave1: 117,
  trfWave2: 118,
  trfWave3: 119,
  trfWave4: 120,
  // +121 pad
  trfStart: 122,
  trfRepeat: 124,
  trfRepEnd: 126,
  trfSpeed: 128,
  trfTurns: 130,
  trfDelay: 132,
  // Phase (+134, 14 bytes)
  phsType: 134,
  phsStart: 136,
  phsRepeat: 138,
  phsRepEnd: 140,
  phsSpeed: 142,
  phsTurns: 144,
  phsDelay: 146,
  // Mix (+148, 14 bytes)
  mixWaveNum: 148,
  // +149 pad
  mixStart: 150,
  mixRepeat: 152,
  mixRepEnd: 154,
  mixSpeed: 156,
  mixTurns: 158,
  mixDelay: 160,
  // Resonance (+162, 14 bytes)
  resAmp: 162,
  resFilBoost: 163,
  resStart: 164,
  resRepeat: 166,
  resRepEnd: 168,
  resSpeed: 170,
  resTurns: 172,
  resDelay: 174,
  // Filter (+176, 14 bytes)
  filType: 176,
  // +177 pad
  filStart: 178,
  filRepeat: 180,
  filRepEnd: 182,
  filSpeed: 184,
  filTurns: 186,
  filDelay: 188,
  // Loop (+190, 16 bytes)
  lpStart: 190,
  lpRepeat: 192,
  lpRepEnd: 194,
  lpLength: 196,
  lpStep: 198,
  lpWait: 200,
  lpDelay: 202,
  lpTurns: 204
};
const SIZES = {
  volume: 2,
  transpose: 1,
  slideSpeed: 1,
  effects1: 1,
  effects2: 1,
  // ADSR (all u16)
  atkLength: 2,
  atkSpeed: 2,
  atkVolume: 2,
  decLength: 2,
  decSpeed: 2,
  decVolume: 2,
  susLength: 2,
  susSpeed: 2,
  susVolume: 2,
  relLength: 2,
  relSpeed: 2,
  relVolume: 2,
  // Vibrato
  vibDir: 1,
  vibWaveNum: 1,
  vibSpeed: 2,
  vibDelay: 2,
  vibAtkSpd: 2,
  vibAttack: 2,
  vibDepth: 2,
  // Tremolo
  tremDir: 1,
  tremWaveNum: 1,
  tremSpeed: 2,
  tremDelay: 2,
  tremAtkSpd: 2,
  tremAttack: 2,
  tremDepth: 2,
  // Arpeggio
  arpTable: 2,
  arpSpeed: 1,
  arpGroove: 1,
  // Transform
  trfWave0: 1,
  trfWave1: 1,
  trfWave2: 1,
  trfWave3: 1,
  trfWave4: 1,
  trfStart: 2,
  trfRepeat: 2,
  trfRepEnd: 2,
  trfSpeed: 2,
  trfTurns: 2,
  trfDelay: 2,
  // Phase
  phsType: 2,
  phsStart: 2,
  phsRepeat: 2,
  phsRepEnd: 2,
  phsSpeed: 2,
  phsTurns: 2,
  phsDelay: 2,
  // Mix
  mixWaveNum: 1,
  mixStart: 2,
  mixRepeat: 2,
  mixRepEnd: 2,
  mixSpeed: 2,
  mixTurns: 2,
  mixDelay: 2,
  // Resonance
  resAmp: 1,
  resFilBoost: 1,
  resStart: 2,
  resRepeat: 2,
  resRepEnd: 2,
  resSpeed: 2,
  resTurns: 2,
  resDelay: 2,
  // Filter
  filType: 1,
  filStart: 2,
  filRepeat: 2,
  filRepEnd: 2,
  filSpeed: 2,
  filTurns: 2,
  filDelay: 2,
  // Loop
  lpStart: 2,
  lpRepeat: 2,
  lpRepEnd: 2,
  lpLength: 2,
  lpStep: 2,
  lpWait: 2,
  lpDelay: 2,
  lpTurns: 2
};
const ALL_OFFSETS = {};
for (const [key, val] of Object.entries(OFF)) {
  ALL_OFFSETS[key] = val;
}
const FX_MODULES = [
  { name: "ADSR Envelope", fxIndex: 0, register: 1, bit: 0, color: "#60e060" },
  { name: "Vibrato", fxIndex: 1, register: 1, bit: 1, color: "#60a0ff" },
  { name: "Tremolo", fxIndex: 2, register: 1, bit: 2, color: "#a060ff" },
  { name: "Arpeggio", fxIndex: 3, register: 1, bit: 3, color: "#e0c040" },
  { name: "Loop", fxIndex: 4, register: 1, bit: 4, color: "#ff8040" },
  { name: "Transform", fxIndex: 5, register: 1, bit: 5, color: "#ff6090" },
  { name: "Phase", fxIndex: 6, register: 2, bit: 0, color: "#40d0d0" },
  { name: "Mix", fxIndex: 7, register: 2, bit: 1, color: "#d0a060" },
  { name: "Resonance", fxIndex: 8, register: 2, bit: 2, color: "#e06060" },
  { name: "Filter", fxIndex: 9, register: 2, bit: 3, color: "#60d080" },
  { name: "Hold Sustain", fxIndex: 10, register: 2, bit: 4, color: "#a0a0c0" }
];
const WAVE_TYPE_OPTIONS = [
  { value: 0, label: "Sine" },
  { value: 1, label: "RampDown" },
  { value: 2, label: "SawTooth" },
  { value: 3, label: "Square" }
];
const DIRECTION_OPTIONS = [
  { value: 0, label: "Forward" },
  { value: 1, label: "Backward" }
];
const PHASE_TYPE_OPTIONS = [
  { value: 0, label: "Old" },
  { value: 1, label: "High" },
  { value: 2, label: "Med" },
  { value: 3, label: "Low" }
];
const FILTER_TYPE_OPTIONS = [
  { value: 0, label: "Normal" },
  { value: 1, label: "Resonance" }
];
const ARPEGGIO_MODE_OPTIONS = [
  { value: 0, label: "Transpose" },
  { value: 1, label: "FixNote" }
];
let instCopyBuffer = null;
function CycleSelect({ value, options, label, color, onChange }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", gap: 2, minWidth: 70 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: {
      fontSize: 9,
      letterSpacing: 1,
      textTransform: "uppercase",
      fontFamily: "monospace",
      color: color + "aa"
    }, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 294,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      CustomSelect,
      {
        value: String(value),
        onChange: (v) => onChange(Number(v)),
        options: options.map((opt) => ({ value: String(opt.value), label: opt.label })),
        style: {
          background: "#0e0e1c",
          border: `1px solid ${color}40`,
          borderRadius: 3,
          color,
          fontSize: 10,
          fontFamily: "monospace",
          padding: "3px 4px",
          cursor: "pointer"
        }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 300,
        columnNumber: 7
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 293,
    columnNumber: 5
  }, this);
}
const MusicLineControls = ({ instrument }) => {
  var _a, _b;
  const [tab, setTab] = reactExports.useState("effects");
  const [fields, setFields] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const [expandedModules, setExpandedModules] = reactExports.useState(/* @__PURE__ */ new Set([0]));
  const fieldsRef = reactExports.useRef(null);
  const mlConfig = (_a = instrument.metadata) == null ? void 0 : _a.mlSynthConfig;
  const waveformType = (mlConfig == null ? void 0 : mlConfig.waveformType) ?? 3;
  const volume = (mlConfig == null ? void 0 : mlConfig.volume) ?? 64;
  const mlInstIdx = ((_b = instrument.metadata) == null ? void 0 : _b.mlInstIdx) ?? 0;
  const colors = useInstrumentColors(BRAND_COLOR);
  const loopDef = LOOP_SIZE_DEFS[waveformType] ?? { samples: 256, approxNote: "?" };
  const freq = Math.round(PAL_C3_RATE / loopDef.samples);
  reactExports.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const defaults = {};
    for (const key of Object.keys(ALL_OFFSETS)) defaults[key] = 0;
    (async () => {
      if (!MusicLineEngine.hasInstance()) {
        setFields(defaults);
        fieldsRef.current = defaults;
        setLoading(false);
        return;
      }
      const engine = MusicLineEngine.getInstance();
      const timeout = setTimeout(() => {
        if (!cancelled) {
          setFields(defaults);
          fieldsRef.current = defaults;
          setLoading(false);
        }
      }, 2e3);
      try {
        await engine.ready();
        const data = await engine.readInstAll(mlInstIdx, ALL_OFFSETS, SIZES);
        clearTimeout(timeout);
        if (cancelled) return;
        setFields(data);
        fieldsRef.current = data;
      } catch {
        clearTimeout(timeout);
        if (cancelled) return;
        setFields(defaults);
        fieldsRef.current = defaults;
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mlInstIdx]);
  const writeField = reactExports.useCallback((fieldName, value) => {
    const offset = ALL_OFFSETS[fieldName];
    const size = SIZES[fieldName] ?? 1;
    if (offset === void 0) return;
    if (MusicLineEngine.hasInstance()) {
      const engine = MusicLineEngine.getInstance();
      engine.writeInstField(mlInstIdx, offset, size, value);
    }
    setFields((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [fieldName]: value };
      fieldsRef.current = next;
      return next;
    });
  }, [mlInstIdx]);
  const toggleEffect = reactExports.useCallback((fxIndex, enabled) => {
    if (!MusicLineEngine.hasInstance()) return;
    const engine = MusicLineEngine.getInstance();
    engine.setEffectFlag(mlInstIdx, fxIndex, enabled);
    const mod = FX_MODULES[fxIndex];
    const regKey = mod.register === 1 ? "effects1" : "effects2";
    setFields((prev) => {
      if (!prev) return prev;
      const oldVal = prev[regKey] ?? 0;
      const newVal = enabled ? oldVal | 1 << mod.bit : oldVal & ~(1 << mod.bit);
      const next = { ...prev, [regKey]: newVal };
      fieldsRef.current = next;
      return next;
    });
  }, [mlInstIdx]);
  const isEffectEnabled = reactExports.useCallback((fxIndex) => {
    if (!fields) return false;
    const mod = FX_MODULES[fxIndex];
    const regKey = mod.register === 1 ? "effects1" : "effects2";
    return !!(fields[regKey] & 1 << mod.bit);
  }, [fields]);
  const toggleExpanded = reactExports.useCallback((fxIndex) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(fxIndex)) next.delete(fxIndex);
      else next.add(fxIndex);
      return next;
    });
  }, []);
  const handleCopy = reactExports.useCallback(() => {
    if (!fields) return;
    instCopyBuffer = { ...fields };
  }, [fields]);
  const handleSwap = reactExports.useCallback(() => {
    if (!fields || !instCopyBuffer) return;
    const currentFields = { ...fields };
    for (const [key, val] of Object.entries(instCopyBuffer)) {
      writeField(key, val);
    }
    instCopyBuffer = currentFields;
  }, [fields, writeField]);
  const handleCut = reactExports.useCallback(() => {
    if (!fields) return;
    instCopyBuffer = { ...fields };
    for (const key of Object.keys(ALL_OFFSETS)) {
      writeField(key, 0);
    }
  }, [fields, writeField]);
  const tabs = ["info", "waveform", "effects", "arpeggio"];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      style: {
        background: "linear-gradient(180deg, #0a0a12 0%, #060608 100%)",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: "monospace",
        height: "100%",
        overflow: "hidden"
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }, children: [
          tabs.map((t) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setTab(t),
              style: {
                padding: "5px 14px",
                background: tab === t ? "#1a1a30" : "transparent",
                border: tab === t ? "1px solid #6060ff" : "1px solid #2a2a4a",
                borderRadius: 4,
                color: tab === t ? "#a0a0ff" : "#4a4a6a",
                fontSize: 11,
                fontFamily: "monospace",
                letterSpacing: 1,
                textTransform: "uppercase",
                cursor: "pointer"
              },
              children: t
            },
            t,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
              lineNumber: 486,
              columnNumber: 11
            },
            void 0
          )),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1 } }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
            lineNumber: 505,
            columnNumber: 9
          }, void 0),
          [
            { label: "Copy", handler: handleCopy, tip: "Copy instrument to buffer" },
            { label: "Swap", handler: handleSwap, tip: "Swap instrument with buffer" },
            { label: "Cut", handler: handleCut, tip: "Copy to buffer + reset" }
          ].map(({ label, handler, tip }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: handler,
              title: tip,
              disabled: !fields || label === "Swap" && !instCopyBuffer,
              style: {
                padding: "4px 10px",
                background: "#12121e",
                border: "1px solid #2a2a4a",
                borderRadius: 3,
                color: !fields || label === "Swap" && !instCopyBuffer ? "#2a2a4a" : "#7a7a9a",
                fontSize: 10,
                fontFamily: "monospace",
                letterSpacing: 0.5,
                cursor: !fields || label === "Swap" && !instCopyBuffer ? "default" : "pointer",
                opacity: !fields || label === "Swap" && !instCopyBuffer ? 0.4 : 1
              },
              children: label
            },
            label,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
              lineNumber: 512,
              columnNumber: 11
            },
            void 0
          ))
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 484,
          columnNumber: 7
        }, void 0),
        tab === "info" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(InfoTab, { waveformType, volume, loopDef, freq }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 536,
          columnNumber: 9
        }, void 0),
        tab === "waveform" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 10, letterSpacing: 2, color: "#4a4a6a", textTransform: "uppercase" }, children: "Real-Time Waveform" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
            lineNumber: 541,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MusicLineWaveformVisualizer, {}, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
            lineNumber: 544,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9, color: "#3a3a5a", lineHeight: 1.6, letterSpacing: 0.5 }, children: "Live audio waveform from the MusicLine engine output." }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
            lineNumber: 545,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 540,
          columnNumber: 9
        }, void 0),
        tab === "effects" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EffectsTab,
          {
            fields,
            loading,
            writeField,
            toggleEffect,
            isEffectEnabled,
            expandedModules,
            toggleExpanded,
            colors
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
            lineNumber: 552,
            columnNumber: 9
          },
          void 0
        ),
        tab === "arpeggio" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArpPanel, { instIdx: mlInstIdx }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 565,
          columnNumber: 9
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 471,
      columnNumber: 5
    },
    void 0
  );
};
function InfoTab({ waveformType, volume, loopDef, freq }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 10, letterSpacing: 2, color: "#4a4a6a", textTransform: "uppercase", marginBottom: 10 }, children: "Waveform Loop" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 580,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        background: "#0e0e18",
        border: "1px solid #2a2a4a",
        borderRadius: 6
      }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
          padding: "6px 14px",
          background: "#1a1a30",
          border: "1px solid #6060ff",
          borderRadius: 4,
          fontSize: 18,
          fontWeight: "bold",
          color: "#a0a0ff",
          letterSpacing: 1
        }, children: loopDef.samples }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 587,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 12, color: "#7a7a9a" }, children: [
            loopDef.samples,
            "-sample single-cycle waveform"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
            lineNumber: 594,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 10, color: "#4a4a6a" }, children: [
            "Loop type ",
            waveformType,
            " -- ",
            freq,
            " Hz fundamental at ",
            loopDef.approxNote
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
            lineNumber: 597,
            columnNumber: 13
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 593,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 583,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 579,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      display: "flex",
      gap: 24,
      padding: "10px 14px",
      background: "#0e0e18",
      border: "1px solid #1e1e2e",
      borderRadius: 6
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(InfoItem, { label: "Volume", value: `${volume} / 64` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 608,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(InfoItem, { label: "Sample rate", value: `${PAL_C3_RATE} Hz` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 609,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(InfoItem, { label: "Loop", value: "Full cycle" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 610,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(InfoItem, { label: "Base note", value: loopDef.approxNote }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 611,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 604,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9, color: "#3a3a5a", lineHeight: 1.6, letterSpacing: 0.5 }, children: "Waveform shape is stored as PCM in the song file and cannot be edited here. The loop type determines the playback pitch at a given note trigger." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 614,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 578,
    columnNumber: 5
  }, this);
}
function InfoItem({ label, value }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#4a4a6a" }, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 625,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 12, color: "#7a7a9a", fontFamily: "monospace" }, children: value }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 626,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 624,
    columnNumber: 5
  }, this);
}
function EffectsTab({
  fields,
  loading,
  writeField,
  toggleEffect,
  isEffectEnabled,
  expandedModules,
  toggleExpanded,
  colors
}) {
  if (loading || !fields) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "#4a4a6a", fontSize: 11, padding: 12 }, children: "Loading instrument data..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 649,
      columnNumber: 12
    }, this);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      display: "flex",
      gap: 16,
      padding: "8px 12px",
      background: "#0c0c16",
      border: "1px solid #1e1e2e",
      borderRadius: 4,
      alignItems: "center",
      flexShrink: 0
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields.volume ?? 64,
          min: 0,
          max: 64,
          label: "Volume",
          size: "sm",
          color: colors.knob,
          onChange: (v) => writeField("volume", Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 660,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields.transpose ?? 0,
          min: 0,
          max: 255,
          label: "Transpose",
          size: "sm",
          color: colors.knob,
          onChange: (v) => writeField("transpose", Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 662,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields.slideSpeed ?? 0,
          min: 0,
          max: 255,
          label: "Slide Spd",
          size: "sm",
          color: colors.knob,
          onChange: (v) => writeField("slideSpeed", Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 664,
          columnNumber: 9
        },
        this
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 655,
      columnNumber: 7
    }, this),
    FX_MODULES.map((mod, idx) => {
      if (idx === 10) {
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FxModuleHeader,
          {
            mod,
            enabled: isEffectEnabled(idx),
            expanded: false,
            onToggleEnabled: (en) => toggleEffect(idx, en),
            onToggleExpanded: () => {
            },
            simple: true
          },
          idx,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
            lineNumber: 673,
            columnNumber: 13
          },
          this
        );
      }
      const expanded = expandedModules.has(idx);
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FxModuleHeader,
          {
            mod,
            enabled: isEffectEnabled(idx),
            expanded,
            onToggleEnabled: (en) => toggleEffect(idx, en),
            onToggleExpanded: () => toggleExpanded(idx)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
            lineNumber: 688,
            columnNumber: 13
          },
          this
        ),
        expanded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          FxModuleParams,
          {
            fxIndex: idx,
            fields,
            writeField
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
            lineNumber: 696,
            columnNumber: 15
          },
          this
        )
      ] }, idx, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 687,
        columnNumber: 11
      }, this);
    })
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 653,
    columnNumber: 5
  }, this);
}
function FxModuleHeader({ mod, enabled, expanded, onToggleEnabled, onToggleExpanded, simple }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 10px",
        background: enabled ? "#0e0e1c" : "#08080e",
        border: `1px solid ${enabled ? mod.color + "40" : "#1a1a2a"}`,
        borderRadius: 4,
        cursor: simple ? "default" : "pointer",
        opacity: enabled ? 1 : 0.5,
        transition: "all 0.15s ease"
      },
      onClick: simple ? void 0 : onToggleExpanded,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "checkbox",
            checked: enabled,
            onChange: (e) => {
              e.stopPropagation();
              onToggleEnabled(e.target.checked);
            },
            style: { accentColor: mod.color, cursor: "pointer", width: 14, height: 14 }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
            lineNumber: 734,
            columnNumber: 7
          },
          this
        ),
        !simple && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 10, color: "#4a4a6a", width: 12, textAlign: "center", userSelect: "none" }, children: expanded ? "v" : ">" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 746,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: {
          fontSize: 11,
          fontFamily: "monospace",
          letterSpacing: 1,
          color: enabled ? mod.color : "#4a4a6a",
          textTransform: "uppercase",
          fontWeight: "bold",
          flex: 1
        }, children: mod.name }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 752,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: {
          fontSize: 9,
          color: enabled ? "#60e060" : "#4a4a6a",
          fontFamily: "monospace"
        }, children: enabled ? "ON" : "OFF" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 762,
          columnNumber: 7
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 720,
      columnNumber: 5
    },
    this
  );
}
function FxModuleParams({ fxIndex, fields, writeField }) {
  const knobColor = FX_MODULES[fxIndex].color;
  const panelStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: "10px 12px",
    background: "#0a0a14",
    borderLeft: `2px solid ${knobColor}30`,
    borderRight: "1px solid #1a1a2a",
    borderBottom: "1px solid #1a1a2a",
    borderRadius: "0 0 4px 4px",
    marginTop: -1
  };
  switch (fxIndex) {
    case 0:
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ADSRParams, { fields, writeField, color: knobColor, style: panelStyle }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 788,
        columnNumber: 20
      }, this);
    case 1:
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VibratoParams, { fields, writeField, color: knobColor, style: panelStyle, prefix: "vib" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 789,
        columnNumber: 20
      }, this);
    case 2:
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VibratoParams, { fields, writeField, color: knobColor, style: panelStyle, prefix: "trem" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 790,
        columnNumber: 20
      }, this);
    case 3:
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArpeggioParams, { fields, writeField, color: knobColor, style: panelStyle }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 791,
        columnNumber: 20
      }, this);
    case 4:
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LoopParams, { fields, writeField, color: knobColor, style: panelStyle }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 792,
        columnNumber: 20
      }, this);
    case 5:
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TransformParams, { fields, writeField, color: knobColor, style: panelStyle }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 793,
        columnNumber: 20
      }, this);
    case 6:
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PhaseFxParams, { fields, writeField, color: knobColor, style: panelStyle }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 794,
        columnNumber: 20
      }, this);
    case 7:
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CommonFxParams,
        {
          fields,
          writeField,
          color: knobColor,
          style: panelStyle,
          prefix: "mix",
          extraFields: [{ name: "mixWaveNum", label: "WaveNum", max: 255 }]
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 795,
          columnNumber: 20
        },
        this
      );
    case 8:
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CommonFxParams,
        {
          fields,
          writeField,
          color: knobColor,
          style: panelStyle,
          prefix: "res",
          extraFields: [{ name: "resAmp", label: "Amp", max: 255 }, { name: "resFilBoost", label: "FilBoost", max: 255 }]
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 797,
          columnNumber: 20
        },
        this
      );
    case 9:
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FilterFxParams, { fields, writeField, color: knobColor, style: panelStyle }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 799,
        columnNumber: 20
      }, this);
    default:
      return null;
  }
}
function ADSRParams({ fields, writeField, color, style }) {
  const stages = [
    { label: "Attack", prefix: "atk" },
    { label: "Decay", prefix: "dec" },
    { label: "Sustain", prefix: "sus" },
    { label: "Release", prefix: "rel" }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style, children: stages.map((stage) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", gap: 4, marginRight: 12 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 9, color: color + "aa", letterSpacing: 1, textTransform: "uppercase", fontFamily: "monospace" }, children: stage.label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 820,
      columnNumber: 11
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 6 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields[`${stage.prefix}Length`] ?? 0,
          min: 0,
          max: 65535,
          label: "Len",
          size: "sm",
          color,
          onChange: (v) => writeField(`${stage.prefix}Length`, Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 824,
          columnNumber: 13
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields[`${stage.prefix}Speed`] ?? 0,
          min: 0,
          max: 65535,
          label: "Spd",
          size: "sm",
          color,
          onChange: (v) => writeField(`${stage.prefix}Speed`, Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 827,
          columnNumber: 13
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields[`${stage.prefix}Volume`] ?? 0,
          min: 0,
          max: 65535,
          label: "Vol",
          size: "sm",
          color,
          onChange: (v) => writeField(`${stage.prefix}Volume`, Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 830,
          columnNumber: 13
        },
        this
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 823,
      columnNumber: 11
    }, this)
  ] }, stage.prefix, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 819,
    columnNumber: 9
  }, this)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 817,
    columnNumber: 5
  }, this);
}
function VibratoParams({ fields, writeField, color, style, prefix }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      CycleSelect,
      {
        value: fields[`${prefix}WaveNum`] ?? 0,
        options: WAVE_TYPE_OPTIONS,
        label: "Wave Type",
        color,
        onChange: (v) => writeField(`${prefix}WaveNum`, v)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 848,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      CycleSelect,
      {
        value: fields[`${prefix}Dir`] ?? 0,
        options: DIRECTION_OPTIONS,
        label: "Direction",
        color,
        onChange: (v) => writeField(`${prefix}Dir`, v)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 851,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`${prefix}Speed`] ?? 0,
        min: 0,
        max: 65535,
        label: "Speed",
        size: "sm",
        color,
        onChange: (v) => writeField(`${prefix}Speed`, Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 854,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`${prefix}Delay`] ?? 0,
        min: 0,
        max: 65535,
        label: "Delay",
        size: "sm",
        color,
        onChange: (v) => writeField(`${prefix}Delay`, Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 857,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`${prefix}AtkSpd`] ?? 0,
        min: 0,
        max: 65535,
        label: "Atk Spd",
        size: "sm",
        color,
        onChange: (v) => writeField(`${prefix}AtkSpd`, Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 860,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`${prefix}Attack`] ?? 0,
        min: 0,
        max: 65535,
        label: "Attack",
        size: "sm",
        color,
        onChange: (v) => writeField(`${prefix}Attack`, Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 863,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`${prefix}Depth`] ?? 0,
        min: 0,
        max: 65535,
        label: "Depth",
        size: "sm",
        color,
        onChange: (v) => writeField(`${prefix}Depth`, Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 866,
        columnNumber: 7
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 847,
    columnNumber: 5
  }, this);
}
function ArpeggioParams({ fields, writeField, color, style }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.arpTable ?? 0,
        min: 0,
        max: 65535,
        label: "Table",
        size: "sm",
        color,
        onChange: (v) => writeField("arpTable", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 880,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.arpSpeed ?? 0,
        min: 0,
        max: 255,
        label: "Speed",
        size: "sm",
        color,
        onChange: (v) => writeField("arpSpeed", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 883,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      CycleSelect,
      {
        value: fields.arpGroove ?? 0,
        options: ARPEGGIO_MODE_OPTIONS,
        label: "Mode",
        color,
        onChange: (v) => writeField("arpGroove", v)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 886,
        columnNumber: 7
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 879,
    columnNumber: 5
  }, this);
}
function LoopParams({ fields, writeField, color, style }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.lpStart ?? 0,
        min: 0,
        max: 65535,
        label: "Start",
        size: "sm",
        color,
        onChange: (v) => writeField("lpStart", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 900,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.lpRepeat ?? 0,
        min: 0,
        max: 65535,
        label: "Repeat",
        size: "sm",
        color,
        onChange: (v) => writeField("lpRepeat", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 903,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.lpRepEnd ?? 0,
        min: 0,
        max: 65535,
        label: "Rep End",
        size: "sm",
        color,
        onChange: (v) => writeField("lpRepEnd", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 906,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.lpLength ?? 0,
        min: 0,
        max: 65535,
        label: "Length",
        size: "sm",
        color,
        onChange: (v) => writeField("lpLength", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 909,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.lpStep ?? 0,
        min: 0,
        max: 65535,
        label: "Step",
        size: "sm",
        color,
        onChange: (v) => writeField("lpStep", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 912,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.lpWait ?? 0,
        min: 0,
        max: 65535,
        label: "Wait",
        size: "sm",
        color,
        onChange: (v) => writeField("lpWait", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 915,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.lpDelay ?? 0,
        min: 0,
        max: 65535,
        label: "Delay",
        size: "sm",
        color,
        onChange: (v) => writeField("lpDelay", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 918,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.lpTurns ?? 0,
        min: 0,
        max: 65535,
        label: "Turns",
        size: "sm",
        color,
        onChange: (v) => writeField("lpTurns", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 921,
        columnNumber: 7
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 899,
    columnNumber: 5
  }, this);
}
function TransformParams({ fields, writeField, color, style }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 6, marginBottom: 4 }, children: [0, 1, 2, 3, 4].map((i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`trfWave${i}`] ?? 0,
        min: 0,
        max: 255,
        label: `W${i + 1}`,
        size: "sm",
        color,
        onChange: (v) => writeField(`trfWave${i}`, Math.round(v))
      },
      i,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 938,
        columnNumber: 11
      },
      this
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 936,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 6 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields.trfStart ?? 0,
          min: 0,
          max: 65535,
          label: "Start",
          size: "sm",
          color,
          onChange: (v) => writeField("trfStart", Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 945,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields.trfRepeat ?? 0,
          min: 0,
          max: 65535,
          label: "Repeat",
          size: "sm",
          color,
          onChange: (v) => writeField("trfRepeat", Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 948,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields.trfRepEnd ?? 0,
          min: 0,
          max: 65535,
          label: "Rep End",
          size: "sm",
          color,
          onChange: (v) => writeField("trfRepEnd", Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 951,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields.trfSpeed ?? 0,
          min: 0,
          max: 65535,
          label: "Speed",
          size: "sm",
          color,
          onChange: (v) => writeField("trfSpeed", Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 954,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields.trfTurns ?? 0,
          min: 0,
          max: 65535,
          label: "Turns",
          size: "sm",
          color,
          onChange: (v) => writeField("trfTurns", Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 957,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: fields.trfDelay ?? 0,
          min: 0,
          max: 65535,
          label: "Delay",
          size: "sm",
          color,
          onChange: (v) => writeField("trfDelay", Math.round(v))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 960,
          columnNumber: 9
        },
        this
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 944,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 934,
    columnNumber: 5
  }, this);
}
function PhaseFxParams({ fields, writeField, color, style }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      CycleSelect,
      {
        value: fields.phsType ?? 0,
        options: PHASE_TYPE_OPTIONS,
        label: "Phase Type",
        color,
        onChange: (v) => writeField("phsType", v)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 976,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.phsStart ?? 0,
        min: 0,
        max: 65535,
        label: "Start",
        size: "sm",
        color,
        onChange: (v) => writeField("phsStart", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 979,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.phsRepeat ?? 0,
        min: 0,
        max: 65535,
        label: "Repeat",
        size: "sm",
        color,
        onChange: (v) => writeField("phsRepeat", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 982,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.phsRepEnd ?? 0,
        min: 0,
        max: 65535,
        label: "Rep End",
        size: "sm",
        color,
        onChange: (v) => writeField("phsRepEnd", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 985,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.phsSpeed ?? 0,
        min: 0,
        max: 65535,
        label: "Speed",
        size: "sm",
        color,
        onChange: (v) => writeField("phsSpeed", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 988,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.phsTurns ?? 0,
        min: 0,
        max: 65535,
        label: "Turns",
        size: "sm",
        color,
        onChange: (v) => writeField("phsTurns", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 991,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.phsDelay ?? 0,
        min: 0,
        max: 65535,
        label: "Delay",
        size: "sm",
        color,
        onChange: (v) => writeField("phsDelay", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 994,
        columnNumber: 7
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 975,
    columnNumber: 5
  }, this);
}
function FilterFxParams({ fields, writeField, color, style }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      CycleSelect,
      {
        value: fields.filType ?? 0,
        options: FILTER_TYPE_OPTIONS,
        label: "Filter Type",
        color,
        onChange: (v) => writeField("filType", v)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1009,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.filStart ?? 0,
        min: 0,
        max: 65535,
        label: "Start",
        size: "sm",
        color,
        onChange: (v) => writeField("filStart", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1012,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.filRepeat ?? 0,
        min: 0,
        max: 65535,
        label: "Repeat",
        size: "sm",
        color,
        onChange: (v) => writeField("filRepeat", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1015,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.filRepEnd ?? 0,
        min: 0,
        max: 65535,
        label: "Rep End",
        size: "sm",
        color,
        onChange: (v) => writeField("filRepEnd", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1018,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.filSpeed ?? 0,
        min: 0,
        max: 65535,
        label: "Speed",
        size: "sm",
        color,
        onChange: (v) => writeField("filSpeed", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1021,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.filTurns ?? 0,
        min: 0,
        max: 65535,
        label: "Turns",
        size: "sm",
        color,
        onChange: (v) => writeField("filTurns", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1024,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields.filDelay ?? 0,
        min: 0,
        max: 65535,
        label: "Delay",
        size: "sm",
        color,
        onChange: (v) => writeField("filDelay", Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1027,
        columnNumber: 7
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 1008,
    columnNumber: 5
  }, this);
}
function CommonFxParams({ fields, writeField, color, style, prefix, extraFields }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style, children: [
    extraFields.map((ef) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[ef.name] ?? 0,
        min: 0,
        max: ef.max,
        label: ef.label,
        size: "sm",
        color,
        onChange: (v) => writeField(ef.name, Math.round(v))
      },
      ef.name,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1046,
        columnNumber: 9
      },
      this
    )),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`${prefix}Start`] ?? 0,
        min: 0,
        max: 65535,
        label: "Start",
        size: "sm",
        color,
        onChange: (v) => writeField(`${prefix}Start`, Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1050,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`${prefix}Repeat`] ?? 0,
        min: 0,
        max: 65535,
        label: "Repeat",
        size: "sm",
        color,
        onChange: (v) => writeField(`${prefix}Repeat`, Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1053,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`${prefix}RepEnd`] ?? 0,
        min: 0,
        max: 65535,
        label: "Rep End",
        size: "sm",
        color,
        onChange: (v) => writeField(`${prefix}RepEnd`, Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1056,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`${prefix}Speed`] ?? 0,
        min: 0,
        max: 65535,
        label: "Speed",
        size: "sm",
        color,
        onChange: (v) => writeField(`${prefix}Speed`, Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1059,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`${prefix}Turns`] ?? 0,
        min: 0,
        max: 65535,
        label: "Turns",
        size: "sm",
        color,
        onChange: (v) => writeField(`${prefix}Turns`, Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1062,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: fields[`${prefix}Delay`] ?? 0,
        min: 0,
        max: 65535,
        label: "Delay",
        size: "sm",
        color,
        onChange: (v) => writeField(`${prefix}Delay`, Math.round(v))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1065,
        columnNumber: 7
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 1044,
    columnNumber: 5
  }, this);
}
function ArpPanel({ instIdx }) {
  const [arpConfig, setArpConfig] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  reactExports.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (!MusicLineEngine.hasInstance()) {
        setArpConfig({ table: 0, speed: 6, groove: 0, numArps: 0 });
        setLoading(false);
        return;
      }
      const engine = MusicLineEngine.getInstance();
      const timeout = setTimeout(() => {
        if (!cancelled) {
          setArpConfig({ table: 0, speed: 6, groove: 0, numArps: 0 });
          setLoading(false);
        }
      }, 2e3);
      try {
        await engine.ready();
        const config = await engine.readInstArpConfig(instIdx);
        clearTimeout(timeout);
        if (cancelled) return;
        setArpConfig(config);
      } catch {
        clearTimeout(timeout);
        if (cancelled) return;
        setArpConfig({ table: 0, speed: 6, groove: 0, numArps: 0 });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [instIdx]);
  if (loading) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "var(--color-text-muted)", fontSize: 11, padding: 12 }, children: "Loading arpeggio data..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 1121,
      columnNumber: 12
    }, this);
  }
  const cfg = arpConfig ?? { table: 0, speed: 6, groove: 0 };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      display: "flex",
      gap: 16,
      padding: "8px 12px",
      background: "var(--color-bg-tertiary)",
      border: "1px solid var(--color-border)",
      borderRadius: 4,
      fontSize: 10
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)" }, children: [
        "Table: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-accent)" }, children: cfg.table >= 0 ? cfg.table : "none" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 1134,
          columnNumber: 18
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1133,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)" }, children: [
        "Speed: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-accent)" }, children: cfg.speed }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 1136,
          columnNumber: 67
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1136,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)" }, children: [
        "Groove: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-accent)" }, children: cfg.groove }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
          lineNumber: 1137,
          columnNumber: 68
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1137,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
      lineNumber: 1129,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      MusicLineArpeggioEditor,
      {
        initialTable: cfg.table >= 0 ? cfg.table : 0
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
        lineNumber: 1141,
        columnNumber: 7
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/MusicLineControls.tsx",
    lineNumber: 1127,
    columnNumber: 5
  }, this);
}
export {
  MusicLineControls
};
