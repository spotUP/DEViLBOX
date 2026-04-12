import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { T as ToneEngine, a1 as useThemeStore, an as useSettingsStore } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FT2_KEYBOARD_MAP = {
  // Lower octave row (Z-M)
  "z": "C",
  "s": "C#",
  "x": "D",
  "d": "D#",
  "c": "E",
  "v": "F",
  "g": "F#",
  "b": "G",
  "h": "G#",
  "n": "A",
  "j": "A#",
  "m": "B",
  // Upper octave row (Q-I)
  "q": "C+",
  "2": "C#+",
  "w": "D+",
  "3": "D#+",
  "e": "E+",
  "r": "F+",
  "5": "F#+",
  "t": "G+",
  "6": "G#+",
  "y": "A+",
  "7": "A#+",
  "u": "B+",
  "i": "C++"
};
function generateKeys(startOctave, numOctaves) {
  const keys = [];
  const keyboardOctaveOffset = startOctave <= 3 ? 3 - startOctave : 0;
  for (let oct = 0; oct < numOctaves; oct++) {
    const octave = startOctave + oct;
    for (const noteName of NOTE_NAMES) {
      const isBlack = noteName.includes("#");
      const note = `${noteName}${octave}`;
      let keyboardKey;
      const mappedOctave = oct - keyboardOctaveOffset;
      if (mappedOctave === 0) {
        const entry = Object.entries(FT2_KEYBOARD_MAP).find((pair) => pair[1] === noteName);
        if (entry) keyboardKey = entry[0];
      } else if (mappedOctave === 1) {
        const entry = Object.entries(FT2_KEYBOARD_MAP).find((pair) => pair[1] === noteName + "+");
        if (entry) keyboardKey = entry[0];
      } else if (mappedOctave === 2 && noteName === "C") {
        keyboardKey = "i";
      }
      keys.push({
        note,
        label: noteName.replace("#", ""),
        isBlack,
        keyboardKey,
        octave
      });
    }
  }
  const lastOctave = startOctave + numOctaves;
  keys.push({
    note: `C${lastOctave}`,
    label: "C",
    isBlack: false,
    keyboardKey: numOctaves <= 2 ? "i" : void 0,
    octave: lastOctave
  });
  return keys;
}
const MIN_WHITE_KEY_WIDTH = 24;
const MAX_WHITE_KEY_WIDTH = 40;
const WHITE_KEYS_PER_OCTAVE = 7;
const TestKeyboard = ({ instrument }) => {
  const [activeNotes, setActiveNotes] = reactExports.useState(/* @__PURE__ */ new Set());
  const [containerWidth, setContainerWidth] = reactExports.useState(400);
  const containerRef = reactExports.useRef(null);
  const engineRef = reactExports.useRef(ToneEngine.getInstance());
  const activeNotesRef = reactExports.useRef(/* @__PURE__ */ new Set());
  const initPromiseRef = reactExports.useRef(null);
  const lastTouchTimeRef = reactExports.useRef(0);
  const pianoKeyColors = useThemeStore((s) => {
    const theme = s.getCurrentTheme();
    return theme.colors.pianoKeyColors;
  });
  reactExports.useEffect(() => {
    activeNotesRef.current = activeNotes;
  }, [activeNotes]);
  reactExports.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width - 24;
        if (width > 0) {
          setContainerWidth(width);
        }
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);
  const { whiteKeyWidth, keys } = reactExports.useMemo(() => {
    const availableWidth = containerWidth - 8;
    let octaves = 6;
    let keyWidth = MAX_WHITE_KEY_WIDTH;
    while (octaves >= 2) {
      const totalWhiteKeys2 = octaves * WHITE_KEYS_PER_OCTAVE + 1;
      keyWidth = availableWidth / totalWhiteKeys2;
      if (keyWidth >= MIN_WHITE_KEY_WIDTH) {
        keyWidth = Math.min(keyWidth, MAX_WHITE_KEY_WIDTH);
        break;
      }
      octaves--;
    }
    octaves = Math.max(2, octaves);
    const totalWhiteKeys = octaves * WHITE_KEYS_PER_OCTAVE + 1;
    keyWidth = Math.min(availableWidth / totalWhiteKeys, MAX_WHITE_KEY_WIDTH);
    const startOctave = Math.max(1, 4 - Math.floor(octaves / 2));
    return {
      numOctaves: octaves,
      whiteKeyWidth: keyWidth,
      keys: generateKeys(startOctave, octaves)
    };
  }, [containerWidth]);
  const ensureContextRunning = reactExports.useCallback(() => {
    const engine = engineRef.current;
    engine.syncResume();
    if (engine.isContextActuallyRunning()) return Promise.resolve();
    if (!initPromiseRef.current) {
      initPromiseRef.current = engine.init().finally(() => {
        initPromiseRef.current = null;
      });
    }
    return initPromiseRef.current;
  }, []);
  const attackNote = reactExports.useCallback((note) => {
    if (activeNotesRef.current.has(note)) return;
    activeNotesRef.current = new Set(activeNotesRef.current).add(note);
    const engine = engineRef.current;
    const inst = instrument;
    const { midiPolyphonic } = useSettingsStore.getState();
    setActiveNotes((prev) => {
      if (midiPolyphonic) {
        return new Set(prev).add(note);
      } else {
        return /* @__PURE__ */ new Set([note]);
      }
    });
    const doAttack = () => {
      if (midiPolyphonic) {
        engine.triggerPolyNoteAttack(inst.id, note, 0.8, inst);
      } else {
        for (const activeNote of activeNotesRef.current) {
          if (activeNote !== note) {
            engine.triggerPolyNoteRelease(inst.id, activeNote, inst);
          }
        }
        engine.triggerPolyNoteAttack(inst.id, note, 0.8, inst);
      }
    };
    if (engine.isContextActuallyRunning()) {
      engine.getInstrument(inst.id, inst);
      doAttack();
    } else {
      void ensureContextRunning().then(() => engine.ensureInstrumentReady(inst)).then(doAttack);
    }
  }, [instrument, ensureContextRunning]);
  const releaseNote = reactExports.useCallback((note) => {
    const next = new Set(activeNotesRef.current);
    next.delete(note);
    activeNotesRef.current = next;
    const engine = engineRef.current;
    const inst = instrument;
    engine.triggerPolyNoteRelease(inst.id, note, inst);
    setActiveNotes((prev) => {
      const s = new Set(prev);
      s.delete(note);
      return s;
    });
  }, [instrument]);
  const whiteKeys = keys.filter((k) => !k.isBlack);
  const blackKeys = keys.filter((k) => k.isBlack);
  const getBlackKeyPosition = (key) => {
    const keyIndex = keys.findIndex((k) => k.note === key.note);
    const whiteKeysBefore = keys.slice(0, keyIndex).filter((k) => !k.isBlack).length;
    return whiteKeysBefore * whiteKeyWidth - whiteKeyWidth * 0.3 / 2;
  };
  const blackKeyWidth = whiteKeyWidth * 0.6;
  const keyHeight = 96;
  const blackKeyHeight = keyHeight * 0.6;
  const lightenColor = reactExports.useCallback((hex, amount) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lr = Math.min(255, Math.round(r + (255 - r) * amount));
    const lg = Math.min(255, Math.round(g + (255 - g) * amount));
    const lb = Math.min(255, Math.round(b + (255 - b) * amount));
    return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
  }, []);
  const CHROMATIC_TO_GROUP = [0, -1, 1, -1, 2, 3, -1, 4, -1, 5, -1, 6];
  const getKeyColors = reactExports.useCallback((noteInOctave, isBlack) => {
    if (isBlack) {
      return { base: "#1a1a1d", hover: "#2a2a30", active: "#f59e0b", shadow: "rgba(245, 158, 11, 0.5)" };
    }
    const groupIdx = CHROMATIC_TO_GROUP[noteInOctave];
    const hasThemeColors = (pianoKeyColors == null ? void 0 : pianoKeyColors.length) === 7 && groupIdx >= 0;
    if (hasThemeColors) {
      const base = pianoKeyColors[groupIdx];
      return {
        base,
        hover: lightenColor(base, 0.25),
        active: lightenColor(base, 0.5),
        shadow: base + "80"
      };
    }
    return { base: "#ffffff", hover: "#f0f0f0", active: "#67e8f9", shadow: "rgba(103, 232, 249, 0.5)" };
  }, [pianoKeyColors, lightenColor]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, className: "space-y-3 w-full", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3 pt-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-ft2-header rounded border-2 border-ft2-border p-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "relative flex items-end justify-center",
        style: { height: keyHeight },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative w-full h-full", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex w-full h-full", children: whiteKeys.map((key, index) => {
            const isActive = activeNotes.has(key.note);
            const isOctaveStart = key.label === "C";
            const noteIdx = NOTE_NAMES.indexOf(key.label);
            const colors = getKeyColors(noteIdx, false);
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onContextMenu: (e) => e.preventDefault(),
                onMouseDown: (e) => {
                  e.preventDefault();
                  if (Date.now() - lastTouchTimeRef.current < 500) return;
                  attackNote(key.note);
                },
                onMouseUp: (e) => {
                  e.preventDefault();
                  if (Date.now() - lastTouchTimeRef.current < 500) return;
                  releaseNote(key.note);
                },
                onMouseLeave: () => {
                  if (activeNotes.has(key.note)) releaseNote(key.note);
                },
                onTouchStart: () => {
                  lastTouchTimeRef.current = Date.now();
                  attackNote(key.note);
                },
                onTouchEnd: () => {
                  releaseNote(key.note);
                },
                className: `
                      relative border border-ft2-border rounded-b flex-1
                      transition-colors duration-75 cursor-pointer select-none touch-none
                      ${isOctaveStart && index > 0 ? "border-l-2 border-l-gray-300" : ""}
                    `,
                style: {
                  height: keyHeight,
                  backgroundColor: isActive ? colors.active : colors.base,
                  boxShadow: isActive ? `0 4px 12px ${colors.shadow}` : void 0
                },
                onMouseEnter: (e) => {
                  if (!activeNotes.has(key.note)) {
                    e.currentTarget.style.backgroundColor = colors.hover;
                  }
                },
                onMouseOut: (e) => {
                  if (!activeNotes.has(key.note)) {
                    e.currentTarget.style.backgroundColor = colors.base;
                  }
                },
                children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute bottom-1 left-0 right-0 text-center", children: [
                  isOctaveStart && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] font-mono", style: { color: pianoKeyColors ? "#00000080" : void 0 }, children: key.octave }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
                    lineNumber: 382,
                    columnNumber: 25
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "div",
                    {
                      className: "font-bold",
                      style: { fontSize: whiteKeyWidth < 30 ? "8px" : "10px", color: pianoKeyColors ? "#00000099" : void 0 },
                      children: key.label
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
                      lineNumber: 384,
                      columnNumber: 23
                    },
                    void 0
                  ),
                  key.keyboardKey && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-secondary font-mono uppercase", children: key.keyboardKey }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
                    lineNumber: 391,
                    columnNumber: 25
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
                  lineNumber: 380,
                  columnNumber: 21
                }, void 0)
              },
              key.note,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
                lineNumber: 336,
                columnNumber: 19
              },
              void 0
            );
          }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
            lineNumber: 329,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 pointer-events-none", children: blackKeys.map((key) => {
            const isActive = activeNotes.has(key.note);
            const leftPosition = getBlackKeyPosition(key);
            const noteIdx = NOTE_NAMES.indexOf(key.label + "#");
            const colors = getKeyColors(noteIdx, true);
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onContextMenu: (e) => e.preventDefault(),
                onMouseDown: (e) => {
                  e.preventDefault();
                  if (Date.now() - lastTouchTimeRef.current < 500) return;
                  attackNote(key.note);
                },
                onMouseUp: (e) => {
                  e.preventDefault();
                  if (Date.now() - lastTouchTimeRef.current < 500) return;
                  releaseNote(key.note);
                },
                onMouseLeave: () => {
                  if (activeNotes.has(key.note)) releaseNote(key.note);
                },
                onTouchStart: () => {
                  lastTouchTimeRef.current = Date.now();
                  attackNote(key.note);
                },
                onTouchEnd: () => {
                  releaseNote(key.note);
                },
                className: "absolute border border-ft2-border rounded-b pointer-events-auto\n                      transition-colors duration-75 cursor-pointer select-none touch-none z-10",
                style: {
                  left: leftPosition,
                  width: blackKeyWidth,
                  height: blackKeyHeight,
                  backgroundColor: isActive ? colors.active : colors.base,
                  boxShadow: isActive ? `0 4px 12px ${colors.shadow}` : void 0
                },
                onMouseEnter: (e) => {
                  if (!activeNotes.has(key.note)) {
                    e.currentTarget.style.backgroundColor = colors.hover;
                  }
                },
                onMouseOut: (e) => {
                  if (!activeNotes.has(key.note)) {
                    e.currentTarget.style.backgroundColor = colors.base;
                  }
                },
                children: key.keyboardKey && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "div",
                  {
                    className: "absolute bottom-1 left-0 right-0 text-center text-text-secondary font-mono uppercase",
                    style: { fontSize: "7px" },
                    children: key.keyboardKey
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
                    lineNumber: 454,
                    columnNumber: 23
                  },
                  void 0
                )
              },
              key.note,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
                lineNumber: 410,
                columnNumber: 19
              },
              void 0
            );
          }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
            lineNumber: 402,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
          lineNumber: 327,
          columnNumber: 11
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
        lineNumber: 323,
        columnNumber: 9
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
      lineNumber: 322,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 px-2 py-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-ft2-highlight shrink-0", children: "VEL" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
        lineNumber: 471,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "range",
          min: "0",
          max: "100",
          defaultValue: "80",
          className: "w-24 h-1 bg-ft2-bg rounded-lg appearance-none cursor-pointer accent-ft2-cursor"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
          lineNumber: 472,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono text-ft2-text", children: "80%" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
        lineNumber: 479,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
      lineNumber: 470,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
    lineNumber: 321,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/TestKeyboard.tsx",
    lineNumber: 320,
    columnNumber: 5
  }, void 0);
};
export {
  TestKeyboard
};
