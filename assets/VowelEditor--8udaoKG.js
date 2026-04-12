import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { X, p as Trash2, W as Repeat, s as Play } from "./vendor-ui-AJ7AT9BN.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
const VOWELS = [
  { code: "IY", example: "beet" },
  { code: "IH", example: "bit" },
  { code: "EH", example: "bet" },
  { code: "AE", example: "bat" },
  { code: "AA", example: "hot" },
  { code: "AH", example: "but" },
  { code: "AO", example: "bought" },
  { code: "OH", example: "bone" },
  { code: "UH", example: "book" },
  { code: "UW", example: "boot" },
  { code: "RR", example: "bird" },
  { code: "LL", example: "lull" },
  { code: "WW", example: "we" },
  { code: "YY", example: "yes" }
];
const VowelEditor = ({
  vowelSequence,
  loopSingle,
  onChange,
  onLoopToggle,
  accentColor
}) => {
  const { isCyan: isCyanTheme, accent } = useInstrumentColors("#ffcc33");
  const color = accentColor ?? accent;
  const panelBorder = isCyanTheme ? "rgba(0, 255, 255, 0.2)" : "rgba(255,255,255,0.08)";
  const mutedColor = isCyanTheme ? "#006060" : "#94a3b8";
  const bgColor = isCyanTheme ? "rgba(0, 20, 20, 0.4)" : "rgba(0,0,0,0.3)";
  const addVowel = (code) => {
    onChange([...vowelSequence, code]);
  };
  const removeAt = (index) => {
    onChange(vowelSequence.filter((_, i) => i !== index));
  };
  const clearAll = () => {
    onChange([]);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: bgColor,
    border: `1px solid ${panelBorder}`,
    borderRadius: 8,
    padding: "8px 10px"
  }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: {
      fontSize: 10,
      fontWeight: 700,
      color,
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    }, children: "Vowel Sequence" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
      lineNumber: 65,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 3
    }, children: VOWELS.map((v) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => addVowel(v.code),
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px 2px",
          borderRadius: 4,
          border: `1px solid ${panelBorder}`,
          background: isCyanTheme ? "#041010" : "#0d1117",
          cursor: "pointer",
          transition: "all 0.1s"
        },
        onMouseEnter: (e) => {
          e.currentTarget.style.background = `${color}22`;
          e.currentTarget.style.borderColor = `${color}66`;
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.background = isCyanTheme ? "#041010" : "#0d1117";
          e.currentTarget.style.borderColor = panelBorder;
        },
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 10, fontWeight: 700, color, fontFamily: "Monaco, Menlo, monospace" }, children: v.code }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
            lineNumber: 102,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 7, color: mutedColor, textTransform: "uppercase" }, children: v.example }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
            lineNumber: 105,
            columnNumber: 13
          }, void 0)
        ]
      },
      v.code,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
        lineNumber: 80,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
      lineNumber: 74,
      columnNumber: 7
    }, void 0),
    vowelSequence.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      overflowX: "auto",
      paddingBottom: 2
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        display: "flex",
        gap: 3,
        flex: "1 1 0",
        minWidth: 0,
        overflowX: "auto"
      }, children: vowelSequence.map((code, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "2px 6px",
            borderRadius: 10,
            background: `${color}22`,
            border: `1px solid ${color}44`,
            flexShrink: 0
          },
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 9, fontWeight: 700, color, fontFamily: "Monaco, Menlo, monospace" }, children: code }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
              lineNumber: 135,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => removeAt(i),
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: mutedColor,
                  padding: 0
                },
                onMouseEnter: (e) => {
                  e.currentTarget.style.color = "#ff4444";
                },
                onMouseLeave: (e) => {
                  e.currentTarget.style.color = mutedColor;
                },
                children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 8 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
                  lineNumber: 151,
                  columnNumber: 19
                }, void 0)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
                lineNumber: 138,
                columnNumber: 17
              },
              void 0
            )
          ]
        },
        `${code}-${i}`,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
          lineNumber: 124,
          columnNumber: 15
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
        lineNumber: 119,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: clearAll,
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "3px 6px",
            borderRadius: 4,
            background: "transparent",
            border: `1px solid ${panelBorder}`,
            cursor: "pointer",
            color: mutedColor,
            flexShrink: 0,
            transition: "all 0.1s"
          },
          onMouseEnter: (e) => {
            e.currentTarget.style.color = "#ff4444";
            e.currentTarget.style.borderColor = "#ff444444";
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.color = mutedColor;
            e.currentTarget.style.borderColor = panelBorder;
          },
          title: "Clear all",
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Trash2, { size: 10 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
            lineNumber: 179,
            columnNumber: 13
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
          lineNumber: 156,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
      lineNumber: 114,
      columnNumber: 9
    }, void 0),
    vowelSequence.length === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9, color: mutedColor, textAlign: "center", padding: "2px 0" }, children: "Click vowels above to build a sequence. Each tracker note cycles to the next vowel." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
      lineNumber: 185,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        onClick: () => onLoopToggle(!loopSingle),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 6,
          border: `1px solid ${loopSingle ? `${color}44` : panelBorder}`,
          background: loopSingle ? `${color}12` : "transparent",
          cursor: "pointer",
          transition: "all 0.15s"
        },
        children: [
          loopSingle ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Repeat, { size: 14, style: { color, flexShrink: 0 } }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
            lineNumber: 204,
            columnNumber: 13
          }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Play, { size: 14, style: { color: mutedColor, flexShrink: 0 } }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
            lineNumber: 205,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }, children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 10, fontWeight: 700, color: loopSingle ? color : mutedColor, textTransform: "uppercase" }, children: loopSingle ? "Sustain / Loop" : "One-Shot" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
              lineNumber: 208,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 8, color: mutedColor }, children: loopSingle ? "Vowel loops while note is held" : "Vowel plays once per note trigger" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
              lineNumber: 211,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
            lineNumber: 207,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
            width: 40,
            height: 20,
            borderRadius: 10,
            background: loopSingle ? color : isCyanTheme ? "#0a1a1a" : "#334155",
            border: `1px solid ${loopSingle ? color : panelBorder}`,
            position: "relative",
            flexShrink: 0,
            transition: "background 0.2s"
          }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
            width: 16,
            height: 16,
            borderRadius: 8,
            background: isCyanTheme ? "#030808" : "#fff",
            position: "absolute",
            top: 1,
            left: loopSingle ? 21 : 2,
            transition: "left 0.2s",
            boxShadow: loopSingle ? `0 0 6px ${color}` : "none"
          } }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
            lineNumber: 226,
            columnNumber: 11
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
            lineNumber: 218,
            columnNumber: 9
          }, void 0)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
        lineNumber: 191,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/VowelEditor.tsx",
    lineNumber: 57,
    columnNumber: 5
  }, void 0);
};
export {
  VowelEditor as V
};
