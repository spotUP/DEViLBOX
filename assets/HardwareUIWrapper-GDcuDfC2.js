import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { R as React, a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { a1 as useThemeStore, cN as getChipSynthDef, e as useInstrumentStore, $ as getToneEngine, fq as unpackDX7Voice } from "./main-BbV5VyEH.js";
const DRUM_VOICES = [
  { key: "accent", label: "Accent", shortLabel: "AC" },
  { key: "bass", label: "Bass Drum", shortLabel: "BD" },
  { key: "snare", label: "Snare Drum", shortLabel: "SD" },
  { key: "low_tom", label: "Low Tom", shortLabel: "LT" },
  { key: "mid_tom", label: "Mid Tom", shortLabel: "MT" },
  { key: "hi_tom", label: "Hi Tom", shortLabel: "HT" },
  { key: "rimshot", label: "Rim/Cow", shortLabel: "RIM/COW" },
  { key: "handclap", label: "HCP/Tamb", shortLabel: "HCP/TAMB" },
  { key: "hihat", label: "Hi-Hat", shortLabel: "HH" },
  { key: "crash", label: "Crash", shortLabel: "CRASH" },
  { key: "ride", label: "Ride", shortLabel: "RIDE" },
  { key: "volume", label: "Volume", shortLabel: "VOLUME" }
];
const TR707Slider = ({ label, shortLabel, value, onChange }) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isDark = currentThemeId !== "cyan-lineart";
  const handlePointerDown = (e) => {
    var _a, _b;
    e.preventDefault();
    (_b = (_a = e.target).setPointerCapture) == null ? void 0 : _b.call(_a, e.pointerId);
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const computeValue = (clientY) => {
      const y = clientY - rect.top;
      const raw = 1 - Math.max(0, Math.min(1, y / rect.height));
      onChange(Math.round(raw * 100) / 100);
    };
    computeValue(e.clientY);
    const handlePointerMove = (moveEvent) => computeValue(moveEvent.clientY);
    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2 flex-1", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "relative h-32 w-8 cursor-pointer select-none touch-none",
        onPointerDown: handlePointerDown,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `absolute inset-0 rounded-full ${isDark ? "bg-dark-bgTertiary" : "bg-dark-bgHover"} border ${isDark ? "border-dark-borderLight" : "border-dark-borderLight"}`, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute left-1/2 top-2 bottom-2 w-1 -translate-x-1/2 bg-dark-bgSecondary rounded-full" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
            lineNumber: 80,
            columnNumber: 11
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
            lineNumber: 79,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: `absolute left-1/2 w-6 h-3 rounded-sm ${isDark ? "bg-red-600" : "bg-red-500"} border border-red-800 shadow-lg pointer-events-none`,
              style: {
                top: `${(1 - value) * 100}%`,
                transform: "translate(-50%, -50%)"
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 84,
              columnNumber: 9
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
        lineNumber: 75,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-xs font-bold ${isDark ? "text-text-secondary" : "text-text-muted"} tracking-wider`, children: shortLabel }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
        lineNumber: 95,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-[10px] ${isDark ? "text-text-muted" : "text-text-muted"} uppercase`, children: label }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
        lineNumber: 98,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
      lineNumber: 94,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
    lineNumber: 73,
    columnNumber: 5
  }, void 0);
};
const TR707Knob = ({ label, value, onChange, size = "medium" }) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isDark = currentThemeId !== "cyan-lineart";
  const sizeMap = {
    small: "w-12 h-12",
    medium: "w-16 h-16",
    large: "w-20 h-20"
  };
  const rotation = -135 + value * 270;
  const handlePointerDown = (e) => {
    var _a, _b;
    (_b = (_a = e.target).setPointerCapture) == null ? void 0 : _b.call(_a, e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const handlePointerMove = (moveEvent) => {
      const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      const degrees = angle * (180 / Math.PI);
      const normalized = (degrees + 135 + 360) % 360;
      const newValue = Math.max(0, Math.min(1, normalized / 270));
      onChange(newValue);
    };
    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: `${sizeMap[size]} relative cursor-pointer select-none`,
        onPointerDown: handlePointerDown,
        title: `${label}: ${Math.round(value * 100)}%`,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: `absolute inset-0 rounded-full ${isDark ? "bg-dark-bgTertiary" : "bg-dark-bgHover"} border-4 ${isDark ? "border-dark-border" : "border-dark-border"} shadow-lg`,
              style: {
                background: isDark ? "radial-gradient(circle at 30% 30%, #4b5563, #1f2937)" : "radial-gradient(circle at 30% 30%, #6b7280, #374151)"
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 157,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute top-1 left-1/2 w-1 h-4 bg-white rounded-full -translate-x-1/2 shadow-md",
              style: {
                transform: `translateX(-50%) rotate(${rotation}deg)`,
                transformOrigin: `50% ${size === "large" ? "2.5rem" : size === "medium" ? "2rem" : "1.5rem"}`
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 167,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `absolute inset-0 m-auto w-3 h-3 rounded-full ${isDark ? "bg-dark-bg" : "bg-black"} shadow-inner` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
            lineNumber: 176,
            columnNumber: 9
          }, void 0)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
        lineNumber: 151,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-xs font-bold ${isDark ? "text-text-secondary" : "text-text-muted"} uppercase tracking-wider text-center`, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
      lineNumber: 179,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
    lineNumber: 150,
    columnNumber: 5
  }, void 0);
};
const TR707Hardware = ({
  parameters,
  onParamChange
}) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isDark = currentThemeId !== "cyan-lineart";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: `rounded-lg overflow-hidden shadow-2xl ${isDark ? "bg-gradient-to-b from-gray-400 via-gray-300 to-gray-400" : "bg-gradient-to-b from-gray-200 via-gray-100 to-gray-200"}`,
      style: {
        background: "linear-gradient(180deg, #d4d4d4 0%, #c0c0c0 50%, #a8a8a8 100%)"
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 border-b-2 border-dark-borderLight flex items-center justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary font-black text-xl tracking-wider", style: { fontFamily: "monospace" }, children: "ROLAND" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
            lineNumber: 206,
            columnNumber: 11
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
            lineNumber: 205,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-right", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted text-xs font-light tracking-[0.3em] uppercase", children: "Rhythm Composer" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 211,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-inverse font-black text-3xl tracking-tight", children: "TR-707" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 212,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
            lineNumber: 210,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
          lineNumber: 204,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 p-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-shrink-0 w-48 space-y-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-gradient-to-b from-gray-700 to-gray-800 p-3 rounded border-2 border-dark-borderLight shadow-inner", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-green-900/30 border border-green-800 rounded p-2 min-h-[80px] font-mono text-xs text-green-400", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "opacity-80", children: "MEMORY PATTERN" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
                lineNumber: 223,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-[10px]", children: "PTN: 01" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
                lineNumber: 224,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px]", children: "KIT: Standard" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
                lineNumber: 225,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 222,
              columnNumber: 13
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 221,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-1", children: ["A", "B", "C", "D", "E", "F", "G", "H"].map((btn) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                className: "bg-dark-bgHover hover:bg-dark-bgHover text-text-primary text-xs font-bold py-2 rounded border border-dark-borderLight shadow",
                children: btn
              },
              btn,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
                lineNumber: 232,
                columnNumber: 15
              },
              void 0
            )) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 230,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { className: "w-full bg-orange-600 hover:bg-orange-500 text-text-primary text-xs font-bold py-2 rounded border border-orange-700", children: "EDIT" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
                lineNumber: 243,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { className: "w-full bg-dark-bgHover hover:bg-dark-bgHover text-text-primary text-xs font-bold py-2 rounded border border-dark-borderLight", children: "OPTION" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
                lineNumber: 246,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 242,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
            lineNumber: 219,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex flex-col", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold text-text-muted uppercase tracking-widest mb-2 text-center", children: "LEVEL" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 254,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 justify-between items-end flex-1 px-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted uppercase tracking-tight self-start", children: "MAX" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
                lineNumber: 258,
                columnNumber: 13
              }, void 0),
              DRUM_VOICES.map((voice) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                TR707Slider,
                {
                  label: voice.label,
                  shortLabel: voice.shortLabel,
                  value: parameters[voice.key] || 0.8,
                  onChange: (value) => onParamChange(voice.key, value)
                },
                voice.key,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
                  lineNumber: 260,
                  columnNumber: 15
                },
                void 0
              )),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted uppercase tracking-tight self-start", children: "MAX" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
                lineNumber: 268,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 257,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted uppercase tracking-tight text-center mt-1", children: "MIN" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 270,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-end mt-3 pr-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted uppercase font-bold mb-1", children: "Shuffle" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
                lineNumber: 275,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                TR707Knob,
                {
                  label: "",
                  value: parameters.decay || 0.5,
                  onChange: (value) => onParamChange("decay", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
                  lineNumber: 276,
                  columnNumber: 15
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 274,
              columnNumber: 13
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 273,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
            lineNumber: 253,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
          lineNumber: 217,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 pb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-gradient-to-b from-gray-600 to-gray-700 rounded p-2 border border-dark-borderLight", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-16 gap-0.5 mb-2", children: Array.from({ length: 16 }, (_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-borderLight h-6 rounded-sm flex items-center justify-center text-[9px] text-text-secondary",
              children: i + 1
            },
            i,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 292,
              columnNumber: 15
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
            lineNumber: 290,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 text-[9px] text-text-secondary justify-between px-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Bass Drum" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 301,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Snare Drum" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 302,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Low Tom" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 303,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Mid Tom" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 304,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Hi Tom" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 305,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-right", children: "Hi-Hat" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
              lineNumber: 306,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
            lineNumber: 300,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
          lineNumber: 289,
          columnNumber: 9
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
          lineNumber: 288,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-1 bg-dark-bgTertiary border-t border-dark-borderLight", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted text-center uppercase tracking-widest", children: "PCM Digital Rhythm Composer • 1985" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
          lineNumber: 313,
          columnNumber: 9
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
          lineNumber: 312,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR707Hardware.tsx",
      lineNumber: 197,
      columnNumber: 5
    },
    void 0
  );
};
const grey = "#9b9fa0";
const darkGrey = "#232425";
const drumLabel = "#f6edc6";
const stencilOrange = "#ff5a00";
const red = "#d03933";
const buttonOrange = "#e98e2f";
const yellow = "#dfd442";
const offWhite = "#e9e8e7";
const miscKnobInner = "#C8D4C8";
const levelKnobInner = "#ff5a00";
const drumHandle = "#111111";
const slightlyDarkerBlack = "#111111";
const drumSwitchHandle = "#313335";
const lightActive = "#FE0000";
const lightInactive = "#570000";
const baseFontFamily = "Helvetica, Arial, sans-serif";
const brandingFontFamily = `"ITC Serif Gothic W03", ${baseFontFamily}`;
const panelFontFamily = `"Helvetica LT W04", ${baseFontFamily}`;
const unselectableText = {
  MozUserSelect: "none",
  WebkitUserSelect: "none",
  msUserSelect: "none",
  userSelect: "none"
};
const basePreset = {
  fontFamily: panelFontFamily,
  fontWeight: "bold",
  textAlign: "center",
  letterSpacing: "-0.2px",
  ...unselectableText,
  cursor: "default"
};
const labelGreyNormal = {
  ...basePreset,
  fontSize: 13,
  color: grey
};
const labelGreyLarge = {
  ...basePreset,
  fontSize: 15,
  color: grey
};
const labelGreySmall = {
  ...basePreset,
  fontSize: 11,
  color: grey
};
const ring = (size) => ({
  position: "absolute",
  width: size,
  height: size,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  margin: "auto",
  borderRadius: "50%"
});
const Light = ({ active }) => {
  const size = 18;
  const innerPadding = 4;
  const baseInnerStyle = {
    position: "absolute",
    left: innerPadding,
    right: innerPadding,
    top: innerPadding,
    bottom: innerPadding,
    borderRadius: "50%"
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    position: "relative",
    backgroundColor: "rgba(0,0,0,0.4)",
    width: size,
    height: size,
    borderRadius: "50%",
    pointerEvents: "none"
  }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { ...baseInnerStyle, backgroundColor: lightInactive } }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 122,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      ...baseInnerStyle,
      backgroundColor: lightActive,
      transition: "opacity 0.1s",
      opacity: active ? 1 : 0
    } }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 123,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
    lineNumber: 114,
    columnNumber: 5
  }, void 0);
};
const Guides = React.memo(({
  num: numProp,
  distance,
  hideCount = 0,
  guideStyle = {},
  rotate = true,
  values,
  offset
}) => {
  let num = numProp ?? 0;
  let useValues = false;
  if (values != null && values.length !== 0) {
    num = values.length;
    useValues = true;
  }
  const guides = [];
  const angleCounter = 360 / (num + hideCount);
  let currentAngle = 180 + hideCount * angleCounter;
  if (offset) currentAngle += offset;
  const hideCountAdjust = hideCount > 1 ? hideCount - 1 : 0;
  const hideCompensation = angleCounter * hideCountAdjust / 2;
  for (let i = 0; i < num; i++) {
    let value = null;
    if (useValues) value = values[i];
    let transform = `translateX(-50%) translateY(-50%) rotate(${currentAngle}deg) translateY(-${distance}px)`;
    if (rotate === false)
      transform += ` rotate(-${currentAngle - hideCompensation}deg)`;
    guides.push(
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          style: {
            ...guideStyle,
            cursor: "default",
            position: "absolute",
            top: "50%",
            left: "50%",
            transform
          },
          children: value
        },
        i,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
          lineNumber: 178,
          columnNumber: 7
        },
        void 0
      )
    );
    currentAngle += angleCounter;
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    position: "absolute",
    width: "100%",
    height: "100%",
    transform: `rotate(-${hideCompensation}deg)`
  }, children: guides }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
    lineNumber: 197,
    columnNumber: 5
  }, void 0);
}, () => true);
const Knob = ({ value, onChange, size, min, max, step, bufferSize = 360, children }) => {
  const rootRef = React.useRef(null);
  const handlePointerDown = reactExports.useCallback((e) => {
    var _a, _b;
    e.preventDefault();
    (_b = (_a = e.target).setPointerCapture) == null ? void 0 : _b.call(_a, e.pointerId);
    const startY = e.clientY;
    const startVal = value;
    const range = max - min;
    const handlePointerMove = (moveEvent) => {
      const delta = (startY - moveEvent.clientY) / 200;
      let newValue = startVal + delta * range;
      newValue = Math.round(newValue / step) * step + min;
      newValue = Math.max(min, Math.min(max, newValue));
      onChange(newValue);
    };
    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  }, [value, onChange, min, max, step]);
  const normalizedValue = (value - min) / (max - min);
  const rotationAmount = normalizedValue * bufferSize - bufferSize / 2;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: rootRef,
      style: {
        position: "relative",
        borderRadius: "50%",
        height: size,
        width: size,
        cursor: "grab"
      },
      onPointerDown: handlePointerDown,
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        position: "relative",
        borderRadius: "50%",
        height: "100%",
        width: "100%",
        transform: `rotate(${rotationAmount}deg)`
      }, children }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 265,
        columnNumber: 7
      }, void 0)
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 254,
      columnNumber: 5
    },
    void 0
  );
};
const LABEL_HEIGHT = 30;
const DrumKnob = React.memo(({ value, onChange, size = 75, label = "", level = false }) => {
  const knobSize = Math.ceil(size * 0.6);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    width: size,
    height: size + LABEL_HEIGHT
  }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexGrow: 1
    }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: labelGreyNormal, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 310,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 303,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      position: "relative",
      width: size,
      height: size
    }, children: [
      level && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        position: "absolute",
        width: 5,
        height: 5,
        borderRadius: "50%",
        backgroundColor: levelKnobInner,
        right: "8%",
        top: "37%",
        zIndex: 2
      } }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 321,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Guides,
        {
          num: 11,
          distance: size / 3,
          hideCount: 1,
          guideStyle: {
            width: 2,
            backgroundColor: grey,
            height: size / 3
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
          lineNumber: 334,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { ...ring(knobSize), display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value,
          onChange,
          size: knobSize,
          min: 0,
          max: 100,
          step: 2,
          bufferSize: 300,
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
            position: "relative",
            overflow: "hidden",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            border: `solid ${drumHandle} 8px`,
            backgroundColor: level ? levelKnobInner : miscKnobInner
          }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
            position: "absolute",
            width: 4,
            height: 12,
            backgroundColor: drumHandle,
            top: -6,
            left: "50%",
            transform: "translateX(-50%)"
          } }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
            lineNumber: 367,
            columnNumber: 15
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
            lineNumber: 357,
            columnNumber: 13
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
          lineNumber: 347,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 346,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 314,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
    lineNumber: 293,
    columnNumber: 5
  }, void 0);
}, (prev, next) => prev.value === next.value);
const DrumSwitch = ({ position, onChange }) => {
  const borderRadius = 2;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      style: {
        position: "relative",
        width: 22,
        height: 50,
        padding: 4,
        backgroundColor: slightlyDarkerBlack,
        borderRadius,
        cursor: "pointer"
      },
      onClick: () => onChange(position < 0.5 ? 1 : 0),
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        position: "absolute",
        width: 22 - 8,
        // thickness - padding*2
        height: (50 - 8) / 2,
        // (length - padding*2) / 2
        left: 4,
        top: position < 0.5 ? 4 : 50 - 4 - (50 - 8) / 2,
        backgroundColor: drumSwitchHandle,
        borderRadius,
        transition: "top 0.1s ease"
      } }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 413,
        columnNumber: 9
      }, void 0)
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 400,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
    lineNumber: 393,
    columnNumber: 5
  }, void 0);
};
const baseLabelStyle = {
  fontFamily: panelFontFamily,
  whiteSpace: "pre",
  color: darkGrey,
  letterSpacing: -0.5,
  ...unselectableText
};
const InstrumentLabel = ({ label }) => {
  const formattedLabel = label.map((section, index) => {
    let style;
    let value;
    if (section[0] === "*") {
      style = { ...baseLabelStyle, fontSize: 19, fontWeight: 400 };
      value = section.slice(1);
    } else {
      style = { ...baseLabelStyle, fontSize: 11 };
      value = section;
    }
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style, children: value }, index, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 451,
      columnNumber: 7
    }, void 0);
  });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    width: "100%",
    height: 36,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: drumLabel,
    borderRadius: 4
  }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    alignItems: "baseline",
    cursor: "default",
    display: "flex",
    flexDirection: "row",
    wordSpacing: "-0.1em"
  }, children: formattedLabel }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
    lineNumber: 466,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
    lineNumber: 456,
    columnNumber: 5
  }, void 0);
};
const InstrumentColumnLayout = ({ labels, children, width, height }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "space-between",
    width,
    height,
    padding: 4
  }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    }, children: React.Children.map(children, (child, index) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { marginBottom: 5 }, children: child }, index, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 507,
      columnNumber: 11
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 500,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch"
    }, children: labels.map((label, index) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { marginTop: 8 }, children: label }, index, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 521,
      columnNumber: 11
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 514,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
    lineNumber: 490,
    columnNumber: 5
  }, void 0);
};
const EMPTY_CONTROL = "EMPTY";
const InstrumentColumn = ({ config, width, height, parameters, onParamChange }) => {
  const { type, labels, switchConfig, controls } = config;
  const DRUM_KNOB_SIZE = Math.ceil(width * 0.72);
  const labelComponents = [];
  labelComponents.push(
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(InstrumentLabel, { label: labels[0] }, `${type}-label-0`, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 551,
      columnNumber: 5
    }, void 0)
  );
  if (labels.length === 2) {
    if (switchConfig != null) {
      labelComponents.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          DrumSwitch,
          {
            position: parameters[switchConfig.param] ?? 0,
            onChange: (v) => onParamChange(switchConfig.param, v)
          },
          `${type}-switch`,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
            lineNumber: 556,
            columnNumber: 9
          },
          void 0
        )
      );
    }
    labelComponents.push(
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(InstrumentLabel, { label: labels[1] }, `${type}-label-1`, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 564,
        columnNumber: 7
      }, void 0)
    );
  }
  const controlComponents = [];
  controlComponents.push(
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      DrumKnob,
      {
        value: parameters[`${type}_level`] ?? 75,
        onChange: (v) => onParamChange(`${type}_level`, v),
        size: DRUM_KNOB_SIZE,
        label: "LEVEL",
        level: true
      },
      `${type}-knob-level`,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 571,
        columnNumber: 5
      },
      void 0
    )
  );
  controls.forEach((controlName, index) => {
    if (controlName !== EMPTY_CONTROL) {
      controlComponents.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          DrumKnob,
          {
            value: parameters[`${type}_${controlName}`] ?? 50,
            onChange: (v) => onParamChange(`${type}_${controlName}`, v),
            size: DRUM_KNOB_SIZE,
            label: controlName.toUpperCase()
          },
          `${type}-knob-${index}`,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
            lineNumber: 583,
            columnNumber: 9
          },
          void 0
        )
      );
    } else {
      controlComponents.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            style: {
              width: DRUM_KNOB_SIZE,
              height: DRUM_KNOB_SIZE + LABEL_HEIGHT
            }
          },
          `${type}-knob-${index}`,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
            lineNumber: 594,
            columnNumber: 9
          },
          void 0
        )
      );
    }
  });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    InstrumentColumnLayout,
    {
      labels: labelComponents,
      width,
      height,
      children: controlComponents
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 606,
      columnNumber: 5
    },
    void 0
  );
};
const TitleText = React.memo(({ text }) => {
  const eSplit = text.split("e");
  const result = eSplit.reduce((acc, cur, idx) => {
    if (idx === 0) return [cur];
    const rotatedE = /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "span",
      {
        style: {
          display: "inline-block",
          transformOrigin: "50% 60%",
          transform: "rotate(-40deg)"
        },
        children: "e"
      },
      idx,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 624,
        columnNumber: 7
      },
      void 0
    );
    return [...acc, rotatedE, cur];
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: result }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
    lineNumber: 637,
    columnNumber: 10
  }, void 0);
});
const lineHeight = 1.5;
const titleRight = 60;
const lineTop = 55;
const AppTitle = ({ width, height }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "relative", width, height }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      position: "absolute",
      height: `${lineHeight}%`,
      left: "50%",
      transform: "translateX(-50%)",
      top: `${lineTop}%`,
      backgroundColor: stencilOrange,
      width: width - 20
    } }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 648,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      display: "flex",
      flexDirection: "row",
      flexWrap: "nowrap",
      alignItems: "baseline",
      position: "absolute",
      bottom: `calc(${lineTop}% - 17.5px)`,
      right: titleRight
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        ...labelGreyLarge,
        fontFamily: brandingFontFamily,
        marginRight: 40,
        color: stencilOrange,
        fontSize: 50,
        textShadow: `0.3rem 0 ${darkGrey},0.3rem 0rem ${darkGrey},-0.3rem -0 ${darkGrey},-0.3rem 0 ${darkGrey}`
      }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TitleText, { text: "Rhythm Composer" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 676,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 668,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        ...labelGreyLarge,
        fontFamily: brandingFontFamily,
        color: stencilOrange,
        fontSize: 40,
        letterSpacing: -1.5
      }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TitleText, { text: "DEViLBOX" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 685,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 678,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 659,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      ...labelGreyLarge,
      fontFamily: brandingFontFamily,
      position: "absolute",
      top: `${lineTop + lineHeight * 3}%`,
      right: titleRight,
      fontSize: 28,
      letterSpacing: -1
    }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TitleText, { text: "Browser Controlled" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 699,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 690,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
    lineNumber: 646,
    columnNumber: 5
  }, void 0);
};
const labelValues = [];
for (let i = 0; i < 11; i++) {
  if (i === 0) {
    labelValues.push("MIN");
  } else if (i === 10) {
    labelValues.push("MAX");
  } else {
    labelValues.push(i);
  }
}
const MasterVolumeKnob = ({ value, onChange, size = 130 }) => {
  const knobSize = Math.ceil(size * 0.54);
  const labelHeight = 9;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "space-between",
    width: size,
    height: size + labelHeight
  }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      position: "relative",
      width: size,
      height: size
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Guides,
        {
          num: 11,
          distance: size * 0.33,
          hideCount: 1,
          guideStyle: {
            width: 5,
            height: 5,
            backgroundColor: grey,
            borderRadius: "50%"
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
          lineNumber: 741,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Guides,
        {
          distance: size * 0.45,
          hideCount: 1,
          rotate: false,
          values: labelValues,
          guideStyle: labelGreySmall
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
          lineNumber: 753,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: ring(knobSize), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value,
          onChange,
          size: knobSize,
          bufferSize: 300,
          min: 0,
          max: 100,
          step: 1,
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            backgroundColor: darkGrey,
            border: `2px solid ${grey}`
          }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
            position: "absolute",
            width: 3,
            height: "40%",
            backgroundColor: stencilOrange,
            top: 2,
            left: "50%",
            transform: "translateX(-50%)",
            borderRadius: 1
          } }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
            lineNumber: 780,
            columnNumber: 15
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
            lineNumber: 772,
            columnNumber: 13
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
          lineNumber: 762,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 761,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 735,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      position: "relative",
      ...labelGreyNormal,
      overflow: "visible",
      top: -4
    }, children: "MASTER VOLUME" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 794,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
    lineNumber: 727,
    columnNumber: 5
  }, void 0);
};
const StepButton = ({ color, active, onClick, width = 50, height = 80 }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      style: {
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 5,
        backgroundColor: color,
        width,
        height,
        cursor: "pointer"
      },
      onClick,
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Light, { active }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 831,
        columnNumber: 7
      }, void 0)
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 817,
      columnNumber: 5
    },
    void 0
  );
};
const instrumentConfig = [
  {
    type: "accent",
    labels: [["*A", "*C", "CENT"]],
    controls: []
  },
  {
    type: "kick",
    labels: [["*B", "ASS ", "*D", "RUM"]],
    controls: ["tone", "decay"]
  },
  {
    type: "snare",
    labels: [["*S", "NARE ", "*D", "RUM"]],
    controls: ["tone", "snappy"]
  },
  {
    type: "low_tom",
    labels: [["*L", "OW ", "*C", "ONGA"], ["*L", "OW ", "*T", "OM"]],
    switchConfig: { param: "low_tom_selector" },
    controls: ["tuning"]
  },
  {
    type: "mid_tom",
    labels: [["*M", "ID ", "*C", "ONGA"], ["*M", "ID ", "*T", "OM"]],
    switchConfig: { param: "mid_tom_selector" },
    controls: ["tuning"]
  },
  {
    type: "hi_tom",
    labels: [["*H", "I ", "*C", "ONGA"], ["*H", "I ", "*T", "OM"]],
    switchConfig: { param: "hi_tom_selector" },
    controls: ["tuning"]
  },
  {
    type: "rimshot",
    labels: [["*C", "*L", "AVES"], ["*R", "IM ", "*S", "HOT"]],
    switchConfig: { param: "rimshot_selector" },
    controls: []
  },
  {
    type: "clap",
    labels: [["*M", "*A", "RACAS"], ["HAND ", "*C", "LA", "*P"]],
    switchConfig: { param: "clap_selector" },
    controls: []
  },
  {
    type: "cowbell",
    labels: [["*C", "OW ", "*B", "ELL"]],
    controls: []
  },
  {
    type: "cymbal",
    labels: [["*C", "*Y", "MBAL"]],
    controls: ["tone", "decay"]
  },
  {
    type: "oh",
    labels: [["*O", "PEN ", "*H", "IHAT"]],
    controls: [EMPTY_CONTROL, "decay"]
  },
  {
    type: "ch",
    labels: [["*C", "LS'D ", "*H", "IHAT"]],
    controls: []
  }
];
const STEP_COLORS = [
  red,
  red,
  red,
  red,
  buttonOrange,
  buttonOrange,
  buttonOrange,
  buttonOrange,
  yellow,
  yellow,
  yellow,
  yellow,
  offWhite,
  offWhite,
  offWhite,
  offWhite
];
const TR808Hardware = ({
  parameters,
  onParamChange
}) => {
  const [stepPattern, setStepPattern] = React.useState(
    new Array(16).fill(false)
  );
  const toggleStep = reactExports.useCallback((index) => {
    setStepPattern((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);
  const SEPARATOR_WIDTH = 1;
  const INSTRUMENTS_HEIGHT_RATIO = 0.7;
  const TOP_HEIGHT = 520;
  const instrumentsHeight = Math.ceil(TOP_HEIGHT * INSTRUMENTS_HEIGHT_RATIO);
  const titleSectionHeight = TOP_HEIGHT - instrumentsHeight;
  const BOTTOM_HEIGHT = 120;
  const STEP_BUTTON_W = 50;
  const STEP_BUTTON_H = 80;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    width: "100%",
    backgroundColor: darkGrey,
    overflow: "hidden"
  }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      width: "100%",
      display: "flex",
      flexDirection: "column"
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        width: "100%",
        height: 3,
        backgroundColor: grey
      } }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 972,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        width: "100%",
        height: instrumentsHeight,
        display: "flex",
        flexDirection: "row",
        alignItems: "center"
      }, children: instrumentConfig.reduce((components, config, index) => {
        const result = [...components];
        if (index !== 0) {
          result.push(
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "div",
              {
                style: {
                  width: SEPARATOR_WIDTH,
                  height: instrumentsHeight - 10,
                  backgroundColor: grey,
                  flexShrink: 0
                }
              },
              `separator-${index}`,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
                lineNumber: 991,
                columnNumber: 17
              },
              void 0
            )
          );
        }
        result.push(
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              style: {
                flex: "1 1 0",
                minWidth: 0,
                height: instrumentsHeight,
                display: "flex",
                justifyContent: "center"
              },
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                InstrumentColumn,
                {
                  config,
                  width: 110,
                  height: instrumentsHeight,
                  parameters,
                  onParamChange
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
                  lineNumber: 1013,
                  columnNumber: 17
                },
                void 0
              )
            },
            `column-${index}`,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
              lineNumber: 1003,
              columnNumber: 15
            },
            void 0
          )
        );
        return result;
      }, []) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 979,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        width: "100%",
        height: titleSectionHeight,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between"
      }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          AppTitle,
          {
            width: Math.ceil(titleSectionHeight * 5.5),
            height: titleSectionHeight
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
            lineNumber: 1035,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
          height: titleSectionHeight,
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center"
        }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          MasterVolumeKnob,
          {
            value: parameters.master_volume ?? 75,
            onChange: (v) => onParamChange("master_volume", v),
            size: Math.floor(titleSectionHeight * 0.86)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
            lineNumber: 1046,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
          lineNumber: 1039,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 1027,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        width: "100%",
        height: 3,
        backgroundColor: grey
      } }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 1055,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 966,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      width: "100%",
      height: BOTTOM_HEIGHT,
      backgroundColor: grey,
      padding: "8px 16px",
      display: "flex",
      flexDirection: "column"
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        marginBottom: 4
      }, children: STEP_COLORS.map((_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        ...labelGreySmall,
        color: i < 8 ? stencilOrange : darkGrey,
        fontSize: i < 4 || i >= 8 && i < 12 ? 13 : 11,
        fontWeight: "bold",
        width: STEP_BUTTON_W,
        textAlign: "center"
      }, children: i + 1 }, i, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 1082,
        columnNumber: 13
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 1074,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "flex-start",
        flex: 1
      }, children: STEP_COLORS.map((color, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        StepButton,
        {
          color,
          active: stepPattern[i],
          onClick: () => toggleStep(i),
          width: STEP_BUTTON_W,
          height: STEP_BUTTON_H
        },
        i,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
          lineNumber: 1104,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
        lineNumber: 1096,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
      lineNumber: 1065,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TR808Hardware.tsx",
    lineNumber: 958,
    columnNumber: 5
  }, void 0);
};
const TB303Knob = ({ label, value, onChange, size = "medium", color = "silver" }) => {
  const sizeMap = {
    small: "w-10 h-10",
    medium: "w-14 h-14",
    large: "w-20 h-20"
  };
  const rotation = -135 + value * 270;
  const handlePointerDown = (e) => {
    var _a, _b;
    (_b = (_a = e.target).setPointerCapture) == null ? void 0 : _b.call(_a, e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const handlePointerMove = (moveEvent) => {
      const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      const degrees = angle * (180 / Math.PI);
      const normalized = (degrees + 135 + 360) % 360;
      const newValue = Math.max(0, Math.min(1, normalized / 270));
      onChange(newValue);
    };
    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };
  const knobColor = color === "orange" ? "radial-gradient(circle at 30% 30%, #ff8800, #cc6600)" : "radial-gradient(circle at 30% 30%, #c0c0c0, #808080)";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: `${sizeMap[size]} relative cursor-pointer select-none`,
        onPointerDown: handlePointerDown,
        title: `${label}: ${Math.round(value * 100)}%`,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute inset-0 rounded-full border-2 border-dark-border shadow-lg",
              style: {
                background: knobColor
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 70,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute top-1 left-1/2 w-0.5 h-3 bg-black rounded-full -translate-x-1/2",
              style: {
                transform: `translateX(-50%) rotate(${rotation}deg)`,
                transformOrigin: `50% ${size === "large" ? "2.5rem" : size === "medium" ? "1.75rem" : "1.25rem"}`
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 78,
              columnNumber: 9
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
        lineNumber: 64,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-[9px] font-bold text-text-secondary uppercase tracking-wide text-center`, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
      lineNumber: 87,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
    lineNumber: 63,
    columnNumber: 5
  }, void 0);
};
const TB303Button = ({ label, active = false, onClick, color = "gray" }) => {
  const colorMap = {
    gray: active ? "bg-dark-bgActive" : "bg-dark-bgHover",
    orange: active ? "bg-orange-500" : "bg-orange-600",
    red: active ? "bg-red-500" : "bg-red-600"
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick,
      className: `${colorMap[color]} hover:brightness-110 text-text-primary text-[9px] font-bold px-3 py-1.5 rounded border border-dark-border shadow-md transition-all ${active ? "shadow-lg scale-95" : ""}`,
      children: label
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
      lineNumber: 111,
      columnNumber: 5
    },
    void 0
  );
};
const TB303Hardware = ({
  parameters,
  onParamChange
}) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "rounded-lg overflow-hidden shadow-2xl",
      style: {
        background: "linear-gradient(180deg, #e0e0e0 0%, #c8c8c8 50%, #b0b0b0 100%)"
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 bg-gradient-to-r from-gray-800 to-gray-700 border-b-2 border-dark-border flex items-center justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary font-black text-xl tracking-wider", style: { fontFamily: "monospace" }, children: "ROLAND" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
            lineNumber: 138,
            columnNumber: 11
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
            lineNumber: 137,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-right", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-secondary text-xs font-light tracking-[0.3em] uppercase", children: "Bass Line" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 143,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary font-black text-3xl tracking-tight", children: "TB-303" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 144,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
            lineNumber: 142,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
          lineNumber: 136,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-6", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-6", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold text-text-muted uppercase tracking-widest mb-3 border-b border-dark-borderLight pb-1", children: "VCF (Voltage Controlled Filter)" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 152,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-6 justify-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                TB303Knob,
                {
                  label: "Cutoff",
                  value: parameters.cutoff || 0.5,
                  onChange: (value) => onParamChange("cutoff", value),
                  size: "large",
                  color: "silver"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                  lineNumber: 156,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                TB303Knob,
                {
                  label: "Resonance",
                  value: parameters.resonance || 0.5,
                  onChange: (value) => onParamChange("resonance", value),
                  size: "large",
                  color: "silver"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                  lineNumber: 163,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                TB303Knob,
                {
                  label: "Env Mod",
                  value: parameters.envMod || 0.5,
                  onChange: (value) => onParamChange("envMod", value),
                  size: "large",
                  color: "silver"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                  lineNumber: 170,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                TB303Knob,
                {
                  label: "Decay",
                  value: parameters.decay || 0.5,
                  onChange: (value) => onParamChange("decay", value),
                  size: "large",
                  color: "silver"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                  lineNumber: 177,
                  columnNumber: 13
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 155,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
            lineNumber: 151,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-6", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold text-text-muted uppercase tracking-widest mb-3 border-b border-dark-borderLight pb-1", children: "VCO (Voltage Controlled Oscillator)" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 189,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-6 justify-center items-end", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                TB303Knob,
                {
                  label: "Tuning",
                  value: parameters.tuning || 0.5,
                  onChange: (value) => onParamChange("tuning", value),
                  size: "medium",
                  color: "silver"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                  lineNumber: 193,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    TB303Button,
                    {
                      label: "SAW",
                      active: parameters.waveform !== 1,
                      onClick: () => onParamChange("waveform", 0)
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                      lineNumber: 204,
                      columnNumber: 17
                    },
                    void 0
                  ),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    TB303Button,
                    {
                      label: "SQR",
                      active: parameters.waveform === 1,
                      onClick: () => onParamChange("waveform", 1)
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                      lineNumber: 209,
                      columnNumber: 17
                    },
                    void 0
                  )
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                  lineNumber: 203,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-bold text-text-muted uppercase", children: "Wave" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                  lineNumber: 215,
                  columnNumber: 15
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                lineNumber: 202,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 192,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
            lineNumber: 188,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-4", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold text-text-muted uppercase tracking-widest mb-3 border-b border-dark-borderLight pb-1", children: "VCA (Voltage Controlled Amplifier)" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 222,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-6 justify-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                TB303Knob,
                {
                  label: "Volume",
                  value: parameters.volume || 0.8,
                  onChange: (value) => onParamChange("volume", value),
                  size: "large",
                  color: "orange"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                  lineNumber: 226,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                TB303Knob,
                {
                  label: "Accent",
                  value: parameters.accent || 0.5,
                  onChange: (value) => onParamChange("accent", value),
                  size: "medium",
                  color: "silver"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
                  lineNumber: 233,
                  columnNumber: 13
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 225,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
            lineNumber: 221,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 justify-center mt-6 pt-4 border-t border-dark-borderLight", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TB303Button, { label: "NORMAL", color: "gray" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 245,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TB303Button, { label: "PATTERN", color: "gray" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 246,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TB303Button, { label: "WRITE", color: "orange" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 247,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TB303Button, { label: "TRACK", color: "gray" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
              lineNumber: 248,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
            lineNumber: 244,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
          lineNumber: 149,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-1 bg-dark-bgSecondary border-t border-dark-borderLight", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted text-center uppercase tracking-widest", children: "Computerized Bass Line • 1981-1984 • Acid House Legend" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
          lineNumber: 254,
          columnNumber: 9
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
          lineNumber: 253,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TB303Hardware.tsx",
      lineNumber: 129,
      columnNumber: 5
    },
    void 0
  );
};
const D50Knob = ({ label, value, onChange, size = "medium" }) => {
  const sizeMap = {
    small: "w-10 h-10",
    medium: "w-12 h-12"
  };
  const rotation = -135 + value * 270;
  const handlePointerDown = (e) => {
    var _a, _b;
    (_b = (_a = e.target).setPointerCapture) == null ? void 0 : _b.call(_a, e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const handlePointerMove = (moveEvent) => {
      const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      const degrees = angle * (180 / Math.PI);
      const normalized = (degrees + 135 + 360) % 360;
      const newValue = Math.max(0, Math.min(1, normalized / 270));
      onChange(newValue);
    };
    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: `${sizeMap[size]} relative cursor-pointer select-none`,
        onPointerDown: handlePointerDown,
        title: `${label}: ${Math.round(value * 100)}%`,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute inset-0 rounded-full border-2 border-dark-border shadow-lg",
              style: {
                background: "radial-gradient(circle at 30% 30%, #707070, #404040)"
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 64,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute top-1 left-1/2 w-1 h-2 bg-white rounded-full -translate-x-1/2 shadow-md",
              style: {
                transform: `translateX(-50%) rotate(${rotation}deg)`,
                transformOrigin: `50% ${size === "medium" ? "1.5rem" : "1.25rem"}`
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 72,
              columnNumber: 9
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
        lineNumber: 58,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-[8px] font-semibold text-text-secondary uppercase tracking-wide text-center max-w-[60px]`, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
      lineNumber: 81,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
    lineNumber: 57,
    columnNumber: 5
  }, void 0);
};
const D50Button = ({ label, active = false, onClick, small = false }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick,
      className: `${small ? "text-[8px] px-2 py-1" : "text-[9px] px-3 py-1.5"} ${active ? "bg-red-600" : "bg-dark-bgHover"} hover:brightness-110 text-text-primary font-bold rounded border border-dark-border shadow-md transition-all ${active ? "shadow-lg" : ""}`,
      children: label
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
      lineNumber: 98,
      columnNumber: 5
    },
    void 0
  );
};
const D50Hardware = ({
  parameters,
  onParamChange
}) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "rounded-lg overflow-hidden shadow-2xl",
      style: {
        background: "linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)"
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-6 py-3 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b-2 border-dark-borderLight", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary font-black text-2xl tracking-wider", style: { fontFamily: "monospace" }, children: "ROLAND" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 125,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-right", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-secondary text-[10px] font-light tracking-[0.4em] uppercase", children: "Linear Synthesizer" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                lineNumber: 129,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary font-black text-4xl tracking-tight", children: "D-50" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                lineNumber: 130,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 128,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
            lineNumber: 124,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-gradient-to-b from-cyan-900 to-cyan-950 border-2 border-accent-highlight/30 rounded p-3 shadow-inner", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-accent-highlight text-sm", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between mb-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "PATCH: 11" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                lineNumber: 138,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "FANTASIA" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                lineNumber: 139,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 137,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-accent-highlight opacity-80", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Upper: Piano+Str" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                lineNumber: 142,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-4", children: "Lower: Synth Bass" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                lineNumber: 143,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 141,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
            lineNumber: 136,
            columnNumber: 11
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
            lineNumber: 135,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
          lineNumber: 123,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-6 bg-gradient-to-b from-gray-800 to-gray-900", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-6", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold text-accent-highlight uppercase tracking-widest mb-3 pb-1 border-b border-dark-borderLight", children: "Tone Controls" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 153,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-4", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-secondary uppercase mb-2", children: "Upper" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                  lineNumber: 158,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 justify-center", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    D50Knob,
                    {
                      label: "Level",
                      value: parameters.upper_level || 0.8,
                      onChange: (value) => onParamChange("upper_level", value),
                      size: "medium"
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                      lineNumber: 160,
                      columnNumber: 17
                    },
                    void 0
                  ),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    D50Knob,
                    {
                      label: "Detune",
                      value: parameters.upper_detune || 0.5,
                      onChange: (value) => onParamChange("upper_detune", value),
                      size: "small"
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                      lineNumber: 166,
                      columnNumber: 17
                    },
                    void 0
                  )
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                  lineNumber: 159,
                  columnNumber: 15
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                lineNumber: 157,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-secondary uppercase mb-2", children: "Lower" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                  lineNumber: 176,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 justify-center", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    D50Knob,
                    {
                      label: "Level",
                      value: parameters.lower_level || 0.8,
                      onChange: (value) => onParamChange("lower_level", value),
                      size: "medium"
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                      lineNumber: 178,
                      columnNumber: 17
                    },
                    void 0
                  ),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    D50Knob,
                    {
                      label: "Detune",
                      value: parameters.lower_detune || 0.5,
                      onChange: (value) => onParamChange("lower_detune", value),
                      size: "small"
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                      lineNumber: 184,
                      columnNumber: 17
                    },
                    void 0
                  )
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                  lineNumber: 177,
                  columnNumber: 15
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                lineNumber: 175,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-secondary uppercase mb-2", children: "Cutoff" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                  lineNumber: 194,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  D50Knob,
                  {
                    label: "Filter",
                    value: parameters.cutoff || 0.7,
                    onChange: (value) => onParamChange("cutoff", value),
                    size: "medium"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                    lineNumber: 195,
                    columnNumber: 15
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                lineNumber: 193,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-secondary uppercase mb-2", children: "Resonance" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                  lineNumber: 204,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  D50Knob,
                  {
                    label: "Reso",
                    value: parameters.resonance || 0.3,
                    onChange: (value) => onParamChange("resonance", value),
                    size: "medium"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                    lineNumber: 205,
                    columnNumber: 15
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                lineNumber: 203,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 156,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
            lineNumber: 152,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-6", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold text-accent-highlight uppercase tracking-widest mb-3 pb-1 border-b border-dark-borderLight", children: "Effects & Master" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 217,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-6 justify-center items-end", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                D50Knob,
                {
                  label: "Chorus",
                  value: parameters.chorus || 0.3,
                  onChange: (value) => onParamChange("chorus", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                  lineNumber: 221,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                D50Knob,
                {
                  label: "Reverb",
                  value: parameters.reverb || 0.4,
                  onChange: (value) => onParamChange("reverb", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                  lineNumber: 227,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                D50Knob,
                {
                  label: "Volume",
                  value: parameters.volume || 0.8,
                  onChange: (value) => onParamChange("volume", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
                  lineNumber: 233,
                  columnNumber: 13
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 220,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
            lineNumber: 216,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 mt-6 pt-4 border-t border-dark-borderLight", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(D50Button, { label: "PATCH" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 244,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(D50Button, { label: "TONE" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 245,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(D50Button, { label: "CHASE" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 246,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(D50Button, { label: "EDIT" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 247,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(D50Button, { label: "WRITE" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 248,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(D50Button, { label: "UTILITY" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 249,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(D50Button, { label: "MIDI" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 250,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(D50Button, { label: "EXIT" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
              lineNumber: 251,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
            lineNumber: 243,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-8 gap-1 mt-4", children: ["A-1", "A-2", "A-3", "A-4", "A-5", "A-6", "A-7", "A-8"].map((patch) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(D50Button, { label: patch, small: true }, patch, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
            lineNumber: 257,
            columnNumber: 13
          }, void 0)) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
            lineNumber: 255,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
          lineNumber: 150,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-1 bg-black border-t border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted text-center uppercase tracking-widest", children: "LA Synthesis • 16 Voices • PCM + Analog • 1987" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
          lineNumber: 264,
          columnNumber: 9
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
          lineNumber: 263,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/D50Hardware.tsx",
      lineNumber: 116,
      columnNumber: 5
    },
    void 0
  );
};
const CZ101Slider = ({ label, value, onChange }) => {
  const handleChange = (e) => {
    onChange(parseFloat(e.target.value));
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative h-24 w-6 flex items-center justify-center", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `absolute inset-0 rounded bg-dark-bgTertiary border border-dark-borderLight`, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute left-1/2 top-1 bottom-1 w-0.5 -translate-x-1/2 bg-dark-bgSecondary rounded-full" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
        lineNumber: 35,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
        lineNumber: 33,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "range",
          min: "0",
          max: "1",
          step: "0.01",
          value,
          onChange: handleChange,
          className: "absolute h-24 w-6 bg-transparent cursor-pointer z-10 opacity-0",
          style: {
            writingMode: "vertical-lr",
            direction: "rtl"
          },
          title: `${label}: ${Math.round(value * 100)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
          lineNumber: 39,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "absolute w-5 h-2.5 rounded-sm bg-orange-500 border border-orange-700 shadow-md pointer-events-none z-20",
          style: {
            top: `${100 - value * 100}%`,
            transform: "translateY(-50%)"
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
          lineNumber: 55,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
      lineNumber: 32,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-[8px] font-bold text-text-secondary uppercase tracking-wide text-center`, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
      lineNumber: 65,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
    lineNumber: 30,
    columnNumber: 5
  }, void 0);
};
const CZ101Button = ({ label, active = false, onClick, color = "gray", small = false }) => {
  const colorMap = {
    gray: active ? "bg-dark-bgActive" : "bg-dark-bgHover",
    orange: active ? "bg-orange-500" : "bg-orange-600"
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick,
      className: `${colorMap[color]} hover:brightness-110 text-text-primary ${small ? "text-[8px] px-2 py-1" : "text-[9px] px-3 py-1.5"} font-bold rounded border border-dark-border shadow-md transition-all ${active ? "shadow-lg scale-95" : ""}`,
      children: label
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
      lineNumber: 88,
      columnNumber: 5
    },
    void 0
  );
};
const CZ101Hardware = ({
  parameters,
  onParamChange
}) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "rounded-lg overflow-hidden shadow-2xl max-w-2xl",
      style: {
        background: "linear-gradient(180deg, #4a4a4a 0%, #3a3a3a 50%, #2a2a2a 100%)"
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 bg-gradient-to-r from-gray-900 to-gray-800 border-b-2 border-orange-600 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary font-black text-xl tracking-[0.3em]", style: { fontFamily: "sans-serif" }, children: "CASIO" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
            lineNumber: 115,
            columnNumber: 11
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
            lineNumber: 114,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-right", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-orange-400 text-xs font-light tracking-[0.3em] uppercase", children: "Phase Distortion" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
              lineNumber: 120,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary font-black text-3xl tracking-wide", children: "CZ-101" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
              lineNumber: 121,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
            lineNumber: 119,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
          lineNumber: 113,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-4 bg-gradient-to-b from-gray-800 to-gray-900 p-2 rounded border border-dark-borderLight shadow-inner", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-amber-900/20 border border-amber-800 rounded p-2 min-h-[60px] font-mono text-xs text-amber-400", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "PATCH: 12" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                lineNumber: 131,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "BRASS 1" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                lineNumber: 132,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
              lineNumber: 130,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-amber-500/80 mt-1", children: "DCO1: SAW | DCO2: PULSE" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
              lineNumber: 134,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
            lineNumber: 129,
            columnNumber: 11
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
            lineNumber: 128,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-4", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 text-center", children: "Parameter Control" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
              lineNumber: 142,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 justify-center items-end bg-dark-bgSecondary/30 rounded p-3", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CZ101Slider,
                {
                  label: "DCW",
                  value: parameters.dcw || 0.5,
                  onChange: (value) => onParamChange("dcw", value)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                  lineNumber: 146,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CZ101Slider,
                {
                  label: "DCA",
                  value: parameters.dca || 0.8,
                  onChange: (value) => onParamChange("dca", value)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                  lineNumber: 151,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CZ101Slider,
                {
                  label: "DCO",
                  value: parameters.dco || 0.5,
                  onChange: (value) => onParamChange("dco", value)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                  lineNumber: 156,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CZ101Slider,
                {
                  label: "Detune",
                  value: parameters.detune || 0.5,
                  onChange: (value) => onParamChange("detune", value)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                  lineNumber: 161,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CZ101Slider,
                {
                  label: "Octave",
                  value: parameters.octave || 0.5,
                  onChange: (value) => onParamChange("octave", value)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                  lineNumber: 166,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CZ101Slider,
                {
                  label: "Volume",
                  value: parameters.volume || 0.8,
                  onChange: (value) => onParamChange("volume", value)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                  lineNumber: 171,
                  columnNumber: 13
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
              lineNumber: 145,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
            lineNumber: 141,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 text-center", children: "Waveform" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
              lineNumber: 181,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CZ101Button, { label: "SAW", small: true, active: parameters.waveform === 0, onClick: () => onParamChange("waveform", 0) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                lineNumber: 185,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CZ101Button, { label: "SQUARE", small: true, active: parameters.waveform === 1, onClick: () => onParamChange("waveform", 1) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                lineNumber: 186,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CZ101Button, { label: "PULSE", small: true, active: parameters.waveform === 2, onClick: () => onParamChange("waveform", 2) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                lineNumber: 187,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CZ101Button, { label: "RESO", small: true, active: parameters.waveform === 6, onClick: () => onParamChange("waveform", 6) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
                lineNumber: 188,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
              lineNumber: 184,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
            lineNumber: 180,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-2 mb-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CZ101Button, { label: "CARTRIDGE", color: "gray" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
              lineNumber: 194,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CZ101Button, { label: "TONE EDIT", color: "orange" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
              lineNumber: 195,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CZ101Button, { label: "PROGRAM", color: "gray" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
              lineNumber: 196,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
            lineNumber: 193,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-1", children: ["A-1", "A-2", "A-3", "A-4", "B-1", "B-2", "B-3", "B-4"].map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CZ101Button, { label: preset, small: true, color: "gray" }, preset, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
            lineNumber: 202,
            columnNumber: 13
          }, void 0)) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
            lineNumber: 200,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
          lineNumber: 126,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-1 bg-black border-t border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted text-center uppercase tracking-widest", children: "Phase Distortion Synthesis • 8 Voices • 1984" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
          lineNumber: 209,
          columnNumber: 9
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
          lineNumber: 208,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/CZ101Hardware.tsx",
      lineNumber: 106,
      columnNumber: 5
    },
    void 0
  );
};
const VFXKnob = ({ label, value, onChange, size = "medium" }) => {
  const sizeMap = {
    small: "w-10 h-10",
    medium: "w-14 h-14"
  };
  const rotation = -135 + value * 270;
  const handlePointerDown = (e) => {
    var _a, _b;
    (_b = (_a = e.target).setPointerCapture) == null ? void 0 : _b.call(_a, e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const handlePointerMove = (moveEvent) => {
      const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      const degrees = angle * (180 / Math.PI);
      const normalized = (degrees + 135 + 360) % 360;
      const newValue = Math.max(0, Math.min(1, normalized / 270));
      onChange(newValue);
    };
    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: `${sizeMap[size]} relative cursor-pointer select-none`,
        onPointerDown: handlePointerDown,
        title: `${label}: ${Math.round(value * 100)}%`,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute inset-0 rounded-full border-2 border-black shadow-lg",
              style: {
                background: "radial-gradient(circle at 30% 30%, #303030, #000000)"
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 64,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute top-1 left-1/2 w-1 h-3 bg-white rounded-full -translate-x-1/2 shadow-md",
              style: {
                transform: `translateX(-50%) rotate(${rotation}deg)`,
                transformOrigin: `50% ${size === "medium" ? "1.75rem" : "1.25rem"}`
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 72,
              columnNumber: 9
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
        lineNumber: 58,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-[8px] font-semibold text-text-secondary uppercase tracking-wide text-center max-w-[60px]`, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
      lineNumber: 81,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
    lineNumber: 57,
    columnNumber: 5
  }, void 0);
};
const VFXButton = ({ label, active = false, onClick, small = false }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick,
      className: `${small ? "text-[8px] px-2 py-1" : "text-[9px] px-3 py-1.5"} ${active ? "bg-blue-600" : "bg-dark-bgHover"} hover:brightness-110 text-text-primary font-bold rounded border border-dark-border shadow-md transition-all ${active ? "shadow-lg" : ""}`,
      children: label
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
      lineNumber: 98,
      columnNumber: 5
    },
    void 0
  );
};
const VFXHardware = ({
  parameters,
  onParamChange
}) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "rounded-lg overflow-hidden shadow-2xl",
      style: {
        background: "linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)"
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-6 py-3 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 border-b-2 border-blue-700", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-blue-200 text-[10px] font-light tracking-[0.5em] uppercase", children: "Ensoniq" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 126,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary font-black text-3xl tracking-wider", children: "VFX" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 127,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-blue-300 text-[9px] font-light tracking-[0.3em] uppercase", children: "SD Music Synthesizer" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 128,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
            lineNumber: 125,
            columnNumber: 11
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
            lineNumber: 124,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-gradient-to-b from-blue-950 to-black border-2 border-blue-800 rounded p-3 shadow-inner", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-blue-400 text-sm", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between mb-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "PROG: 042" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                lineNumber: 136,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "TRANSWAVES" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                lineNumber: 137,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 135,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-blue-500 opacity-80", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Wave: Piano →  Strings" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 140,
              columnNumber: 15
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 139,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-blue-600 mt-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "ENV1: ▁▃▅█▇▅▃▁" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                lineNumber: 143,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-4", children: "ENV2: ▁▂▃▄▅▆▇█" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                lineNumber: 144,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 142,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
            lineNumber: 134,
            columnNumber: 11
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
            lineNumber: 133,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
          lineNumber: 123,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-6 bg-gradient-to-b from-gray-900 to-black", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-6", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 pb-1 border-b border-dark-border", children: "Oscillator / Wave" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 154,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-5 justify-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Wave",
                  value: parameters.wave || 0,
                  onChange: (value) => onParamChange("wave", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 158,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Start",
                  value: parameters.wave_start || 0,
                  onChange: (value) => onParamChange("wave_start", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 164,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "End",
                  value: parameters.wave_end || 1,
                  onChange: (value) => onParamChange("wave_end", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 170,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Pitch",
                  value: parameters.pitch || 0.5,
                  onChange: (value) => onParamChange("pitch", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 176,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Fine",
                  value: parameters.fine || 0.5,
                  onChange: (value) => onParamChange("fine", value),
                  size: "small"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 182,
                  columnNumber: 13
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 157,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
            lineNumber: 153,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-6", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 pb-1 border-b border-dark-border", children: "Filter" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 193,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-5 justify-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Cutoff",
                  value: parameters.cutoff || 0.7,
                  onChange: (value) => onParamChange("cutoff", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 197,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Reso",
                  value: parameters.resonance || 0.3,
                  onChange: (value) => onParamChange("resonance", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 203,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Env Amt",
                  value: parameters.filter_env || 0.5,
                  onChange: (value) => onParamChange("filter_env", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 209,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Vel Amt",
                  value: parameters.filter_vel || 0.5,
                  onChange: (value) => onParamChange("filter_vel", value),
                  size: "small"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 215,
                  columnNumber: 13
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 196,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
            lineNumber: 192,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-6", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 pb-1 border-b border-dark-border", children: "Envelope / Amp" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 226,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-5 justify-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Attack",
                  value: parameters.attack || 0,
                  onChange: (value) => onParamChange("attack", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 230,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Decay",
                  value: parameters.decay || 0.3,
                  onChange: (value) => onParamChange("decay", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 236,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Sustain",
                  value: parameters.sustain || 0.7,
                  onChange: (value) => onParamChange("sustain", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 242,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Release",
                  value: parameters.release || 0.3,
                  onChange: (value) => onParamChange("release", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 248,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Volume",
                  value: parameters.volume || 0.8,
                  onChange: (value) => onParamChange("volume", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 254,
                  columnNumber: 13
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 229,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
            lineNumber: 225,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-4", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 pb-1 border-b border-dark-border", children: "Effects" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 265,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-5 justify-center", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Chorus",
                  value: parameters.chorus || 0.2,
                  onChange: (value) => onParamChange("chorus", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 269,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Reverb",
                  value: parameters.reverb || 0.3,
                  onChange: (value) => onParamChange("reverb", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 275,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                VFXKnob,
                {
                  label: "Delay",
                  value: parameters.delay || 0,
                  onChange: (value) => onParamChange("delay", value),
                  size: "medium"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
                  lineNumber: 281,
                  columnNumber: 13
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 268,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
            lineNumber: 264,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2 mt-6 pt-4 border-t border-dark-border", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VFXButton, { label: "PROGRAM" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 292,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VFXButton, { label: "EDIT" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 293,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VFXButton, { label: "SEQ" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 294,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VFXButton, { label: "SONG" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 295,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VFXButton, { label: "FX" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 296,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VFXButton, { label: "CART" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 297,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VFXButton, { label: "MIDI" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 298,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VFXButton, { label: "MASTER" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
              lineNumber: 299,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
            lineNumber: 291,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-8 gap-1 mt-3", children: Array.from({ length: 8 }, (_, i) => i + 1).map((num) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VFXButton, { label: num.toString(), small: true }, num, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
            lineNumber: 305,
            columnNumber: 13
          }, void 0)) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
            lineNumber: 303,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
          lineNumber: 151,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-1 bg-black border-t border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted text-center uppercase tracking-widest", children: "Wavetable Synthesis • 21 Voices • 32 Oscillators • 1989" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
          lineNumber: 312,
          columnNumber: 9
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
          lineNumber: 311,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VFXHardware.tsx",
      lineNumber: 116,
      columnNumber: 5
    },
    void 0
  );
};
const HWKnob = ({
  label,
  value,
  min = 0,
  max = 1,
  step,
  size = "md",
  color = "#88ccff",
  formatDisplay,
  onChange
}) => {
  const dragRef = reactExports.useRef(null);
  const knobSize = size === "sm" ? 24 : size === "lg" ? 40 : 32;
  const containerWidth = size === "sm" ? 48 : size === "lg" ? 64 : 56;
  const handlePointerDown = reactExports.useCallback((e) => {
    var _a, _b;
    e.preventDefault();
    (_b = (_a = e.target).setPointerCapture) == null ? void 0 : _b.call(_a, e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
    const handlePointerMove = (ev) => {
      if (!dragRef.current) return;
      const dy = dragRef.current.startY - ev.clientY;
      const range = max - min;
      let newVal = dragRef.current.startVal + dy / 150 * range;
      if (step) newVal = Math.round(newVal / step) * step;
      newVal = Math.max(min, Math.min(max, newVal));
      onChange(newVal);
    };
    const handlePointerUp = () => {
      dragRef.current = null;
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  }, [value, min, max, step, onChange]);
  const displayVal = formatDisplay ? formatDisplay(value) : value.toFixed(2);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "flex flex-col items-center gap-0.5 select-none cursor-ns-resize",
      style: { width: containerWidth },
      onPointerDown: handlePointerDown,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "rounded-full border-2 flex items-center justify-center text-[9px]",
            style: { borderColor: color, color, width: knobSize, height: knobSize },
            children: Math.round((value - min) / (max - min) * 100)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMESharedKnob.tsx",
            lineNumber: 68,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-text-muted text-center leading-tight truncate w-full", children: label }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMESharedKnob.tsx",
          lineNumber: 74,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] text-text-muted text-center", children: displayVal }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMESharedKnob.tsx",
          lineNumber: 77,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMESharedKnob.tsx",
      lineNumber: 63,
      columnNumber: 5
    },
    void 0
  );
};
const HWSectionLabel = ({ label, color = "#88ccff80" }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "text-[9px] font-bold uppercase tracking-wider mb-1 px-1",
      style: { color },
      children: label
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMESharedKnob.tsx",
      lineNumber: 94,
      columnNumber: 5
    },
    void 0
  );
};
function makeFormatDisplay(p) {
  const fmt = p.formatValue;
  if (fmt === "percent") return (v) => `${Math.round(v * 100)}%`;
  if (fmt === "int") return (v) => `${Math.round(v)}`;
  if (fmt === "hz") return (v) => `${Math.round(v)} Hz`;
  if (fmt === "db") return (v) => `${Math.round(v)} dB`;
  if (fmt === "seconds") return (v) => v >= 1 ? `${v.toFixed(2)}s` : `${Math.round(v * 1e3)}ms`;
  return (p.max ?? 1) > 1 ? (v) => `${Math.round(v)}` : (v) => `${Math.round(v * 100)}%`;
}
const KnobParam = ({ p, value, color, onChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  HWKnob,
  {
    label: p.label,
    value,
    min: p.min ?? 0,
    max: p.max ?? 1,
    step: p.step,
    onChange: (v) => onChange(p.key, v),
    color,
    size: "sm",
    formatDisplay: makeFormatDisplay(p)
  },
  void 0,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
    lineNumber: 47,
    columnNumber: 3
  },
  void 0
);
const ToggleParam = ({ p, value, color, onChange }) => {
  const active = value > 0.5;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick: () => onChange(p.key, active ? 0 : 1),
      className: "rounded font-mono transition-all",
      style: {
        width: 56,
        height: 22,
        fontSize: 8,
        background: active ? `${color}35` : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? color : "rgba(255,255,255,0.12)"}`,
        color: active ? color : "rgba(255,255,255,0.35)",
        boxShadow: active ? `0 0 6px ${color}30` : void 0
      },
      children: p.label
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
      lineNumber: 64,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
    lineNumber: 63,
    columnNumber: 5
  }, void 0);
};
const SelectParam = ({ p, value, color, onChange }) => {
  const opts = p.options;
  if (opts && opts.length > 0) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-start gap-0.5", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] uppercase tracking-wider mb-1", style: { color: "rgba(255,255,255,0.4)" }, children: p.label }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
        lineNumber: 89,
        columnNumber: 9
      }, void 0),
      opts.map((opt) => {
        const active = Math.abs(value - opt.value) < 0.01;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onChange(p.key, opt.value),
            className: "rounded font-mono transition-all text-left",
            style: {
              width: 72,
              height: 18,
              fontSize: 7,
              paddingLeft: 4,
              background: active ? `${color}35` : "rgba(255,255,255,0.04)",
              border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
              color: active ? color : "rgba(255,255,255,0.35)",
              boxShadow: active ? `0 0 4px ${color}25` : void 0
            },
            children: opt.label
          },
          opt.label,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
            lineNumber: 95,
            columnNumber: 13
          },
          void 0
        );
      })
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
      lineNumber: 88,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KnobParam, { p, value, color, onChange }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
    lineNumber: 119,
    columnNumber: 10
  }, void 0);
};
const MAMEGenericHardware = ({
  synthType,
  parameters,
  onParamChange
}) => {
  const def = reactExports.useMemo(() => getChipSynthDef(synthType), [synthType]);
  const onChangeRef = reactExports.useRef(onParamChange);
  reactExports.useEffect(() => {
    onChangeRef.current = onParamChange;
  }, [onParamChange]);
  const handleChange = (key, value) => onChangeRef.current(key, value);
  if (!def) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 text-center", style: { color: "rgba(255,255,255,0.4)" }, children: [
      "No parameter definitions for ",
      synthType
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
      lineNumber: 137,
      columnNumber: 7
    }, void 0);
  }
  const color = def.color || "#60a5fa";
  const paramsByGroup = reactExports.useMemo(() => {
    const groups = /* @__PURE__ */ new Map();
    for (const p of def.parameters) {
      if (p.type === "text" || p.type === "vowelEditor") continue;
      const g = p.group || "General";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(p);
    }
    return groups;
  }, [def]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "rounded-lg overflow-hidden shadow-2xl select-none",
      style: {
        background: "linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)",
        border: "2px solid #2a2a2a"
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "px-5 py-3 border-b",
            style: {
              background: "linear-gradient(90deg, #181818 0%, #222222 50%, #181818 100%)",
              borderColor: "rgba(255,255,255,0.08)"
            },
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "rgba(255,255,255,0.4)", fontSize: 7, letterSpacing: "0.3em", textTransform: "uppercase" }, children: "MAME CHIP EMULATION" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
                  lineNumber: 175,
                  columnNumber: 13
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "#e0e0e0", fontSize: 18, fontWeight: 900, letterSpacing: "0.05em" }, children: def.name }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
                  lineNumber: 178,
                  columnNumber: 13
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "rgba(255,255,255,0.3)", fontSize: 7, letterSpacing: "0.1em" }, children: def.subtitle }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
                  lineNumber: 181,
                  columnNumber: 13
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
                lineNumber: 174,
                columnNumber: 11
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  className: "rounded px-2 py-1 font-mono",
                  style: { background: `${color}18`, border: `1px solid ${color}40` },
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em" }, children: def.synthType }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
                    lineNumber: 190,
                    columnNumber: 13
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
                  lineNumber: 186,
                  columnNumber: 11
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
              lineNumber: 173,
              columnNumber: 9
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
            lineNumber: 166,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-5 items-start", children: Array.from(paramsByGroup.entries()).map(([group, params]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { minWidth: 70 }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HWSectionLabel, { label: group, color: `${color}80` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
            lineNumber: 202,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 items-start mt-1", children: params.map((p) => {
            const value = parameters[p.key] ?? p.default;
            if (p.type === "toggle") {
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                ToggleParam,
                {
                  p,
                  value,
                  color,
                  onChange: handleChange
                },
                p.key,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
                  lineNumber: 208,
                  columnNumber: 23
                },
                void 0
              );
            }
            if (p.type === "select") {
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                SelectParam,
                {
                  p,
                  value,
                  color,
                  onChange: handleChange
                },
                p.key,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
                  lineNumber: 219,
                  columnNumber: 23
                },
                void 0
              );
            }
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              KnobParam,
              {
                p,
                value,
                color,
                onChange: handleChange
              },
              p.key,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
                lineNumber: 229,
                columnNumber: 21
              },
              void 0
            );
          }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
            lineNumber: 203,
            columnNumber: 15
          }, void 0)
        ] }, group, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
          lineNumber: 201,
          columnNumber: 13
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
          lineNumber: 199,
          columnNumber: 9
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
          lineNumber: 198,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "px-5 py-1 text-center",
            style: { background: "rgba(0,0,0,0.5)", borderTop: "1px solid rgba(255,255,255,0.06)" },
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "rgba(255,255,255,0.18)", fontSize: 7, letterSpacing: "0.3em", textTransform: "uppercase" }, children: [
              def.name,
              "  •  MAME EMULATION"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
              lineNumber: 249,
              columnNumber: 9
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
            lineNumber: 245,
            columnNumber: 7
          },
          void 0
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MAMEGenericHardware.tsx",
      lineNumber: 158,
      columnNumber: 5
    },
    void 0
  );
};
const factoryCache = /* @__PURE__ */ new Map();
const loadPromises = /* @__PURE__ */ new Map();
async function loadModuleFactory(moduleUrl, factoryName) {
  const cached = factoryCache.get(moduleUrl);
  if (cached) return cached;
  const pending = loadPromises.get(moduleUrl);
  if (pending) return pending;
  const promise = new Promise(
    (resolve, reject) => {
      const script = document.createElement("script");
      script.src = moduleUrl;
      script.onload = () => {
        const fn = window[factoryName];
        if (typeof fn === "function") {
          const factory = fn;
          factoryCache.set(moduleUrl, factory);
          loadPromises.delete(moduleUrl);
          resolve(factory);
        } else {
          loadPromises.delete(moduleUrl);
          reject(new Error(`${factoryName} not found after loading ${moduleUrl}`));
        }
      };
      script.onerror = () => {
        loadPromises.delete(moduleUrl);
        reject(new Error(`Failed to load ${moduleUrl}`));
      };
      document.head.appendChild(script);
    }
  );
  loadPromises.set(moduleUrl, promise);
  return promise;
}
let sdlFactoryLock = Promise.resolve();
let sdlInstanceCounter = 0;
const SDLHardwareWrapper = ({
  moduleUrl,
  factoryName,
  canvasWidth,
  canvasHeight,
  initFn,
  startFn,
  shutdownFn,
  loadConfigFn,
  configBuffer,
  onModuleReady,
  onError,
  initBuffer,
  initWithDataFn,
  pcmData,
  loadPcmFn,
  className,
  imageRendering = "pixelated",
  displayWidth,
  displayHeight
}) => {
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const moduleRef = reactExports.useRef(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const configBufferRef = reactExports.useRef(configBuffer);
  const onModuleReadyRef = reactExports.useRef(onModuleReady);
  const onErrorRef = reactExports.useRef(onError);
  reactExports.useEffect(() => {
    configBufferRef.current = configBuffer;
  }, [configBuffer]);
  reactExports.useEffect(() => {
    onModuleReadyRef.current = onModuleReady;
  }, [onModuleReady]);
  reactExports.useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  const uniqueCanvasId = reactExports.useMemo(() => `canvas-sdl-${++sdlInstanceCounter}`, []);
  reactExports.useEffect(() => {
    const mod = moduleRef.current;
    if (!mod || !loaded) return;
    const fn = mod[loadConfigFn];
    if (typeof fn !== "function") return;
    const ptr = mod._malloc(configBuffer.length);
    if (!ptr) return;
    mod.HEAPU8.set(configBuffer, ptr);
    fn.call(mod, ptr, configBuffer.length);
    mod._free(ptr);
  }, [configBuffer, loaded, loadConfigFn]);
  reactExports.useEffect(() => {
    const mod = moduleRef.current;
    if (!mod || !loaded || !pcmData || !loadPcmFn) return;
    const fn = mod[loadPcmFn];
    if (typeof fn !== "function") return;
    const ptr = mod._malloc(pcmData.length);
    if (!ptr) return;
    mod.HEAP8.set(pcmData, ptr);
    fn.call(mod, ptr, pcmData.length);
    mod._free(ptr);
  }, [pcmData, loaded, loadPcmFn]);
  reactExports.useEffect(() => {
    let cancelled = false;
    let mod = null;
    let localCanvas = null;
    let localContainer = null;
    let factoryCompleted = false;
    function removeCanvas() {
      if (localCanvas) {
        const parent = localContainer ?? localCanvas.parentNode;
        if (parent) {
          try {
            parent.removeChild(localCanvas);
          } catch {
          }
        }
        canvasRef.current = null;
        localCanvas = null;
      }
    }
    function doShutdown(m) {
      const prevId = localCanvas == null ? void 0 : localCanvas.id;
      if (localCanvas) localCanvas.id = "canvas";
      try {
        const fn = m[shutdownFn];
        if (typeof fn === "function") fn.call(m);
      } catch {
      }
      if (localCanvas && prevId !== void 0) localCanvas.id = prevId;
    }
    async function init() {
      try {
        const canvas = document.createElement("canvas");
        canvas.id = uniqueCanvasId;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.style.imageRendering = imageRendering;
        canvas.tabIndex = 0;
        localCanvas = canvas;
        localContainer = containerRef.current;
        if (containerRef.current && !cancelled) {
          containerRef.current.appendChild(canvas);
          canvasRef.current = canvas;
        }
        if (cancelled) {
          removeCanvas();
          return;
        }
        const factory = await loadModuleFactory(moduleUrl, factoryName);
        if (cancelled) {
          removeCanvas();
          return;
        }
        let factoryResult = null;
        let factoryError = null;
        const myTurn = sdlFactoryLock.then(async () => {
          if (cancelled) return;
          canvas.id = "canvas";
          try {
            factoryResult = await factory({ canvas });
          } catch (e) {
            factoryError = e;
          } finally {
            canvas.id = uniqueCanvasId;
          }
        });
        sdlFactoryLock = myTurn.then(
          () => void 0,
          () => void 0
          // Don't break the lock chain on error
        );
        await myTurn;
        factoryCompleted = true;
        if (factoryError) throw factoryError;
        if (!factoryResult) {
          removeCanvas();
          return;
        }
        const sdlMod = factoryResult;
        mod = sdlMod;
        moduleRef.current = sdlMod;
        if (cancelled) {
          doShutdown(sdlMod);
          removeCanvas();
          return;
        }
        if (onModuleReadyRef.current) {
          onModuleReadyRef.current(sdlMod);
        }
        if (initBuffer && initWithDataFn) {
          const initWithData = sdlMod[initWithDataFn];
          if (typeof initWithData === "function") {
            const ptr = sdlMod._malloc(initBuffer.length);
            if (ptr) {
              sdlMod.HEAPU8.set(initBuffer, ptr);
              initWithData.call(sdlMod, ptr, initBuffer.length);
              sdlMod._free(ptr);
            }
          }
        } else {
          const initFunc = sdlMod[initFn];
          if (typeof initFunc === "function") {
            initFunc.call(sdlMod, canvasWidth, canvasHeight);
          }
        }
        const cfgBuf = configBufferRef.current;
        const loadCfg = sdlMod[loadConfigFn];
        if (typeof loadCfg === "function" && cfgBuf.length > 0) {
          const ptr = sdlMod._malloc(cfgBuf.length);
          if (ptr) {
            sdlMod.HEAPU8.set(cfgBuf, ptr);
            loadCfg.call(sdlMod, ptr, cfgBuf.length);
            sdlMod._free(ptr);
          }
        }
        const startFunc = sdlMod[startFn];
        if (typeof startFunc === "function") {
          startFunc.call(sdlMod);
        }
        if (!cancelled) setLoaded(true);
      } catch (err) {
        const msg = String(err);
        if (!cancelled) {
          setError(msg);
          if (onErrorRef.current) onErrorRef.current(msg);
        }
      }
    }
    init();
    return () => {
      cancelled = true;
      if (mod) {
        doShutdown(mod);
      }
      if (factoryCompleted || !localCanvas) {
        removeCanvas();
      }
      moduleRef.current = null;
    };
  }, []);
  const handleClick = reactExports.useCallback(() => {
    var _a;
    (_a = canvasRef.current) == null ? void 0 : _a.focus();
  }, []);
  reactExports.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onMouseEnter = () => {
      var _a;
      (_a = canvasRef.current) == null ? void 0 : _a.focus();
    };
    const onWheel = (e) => {
      e.preventDefault();
    };
    container.addEventListener("mouseenter", onMouseEnter);
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("mouseenter", onMouseEnter);
      container.removeEventListener("wheel", onWheel);
    };
  }, []);
  const cssAspectW = displayWidth ?? canvasWidth;
  const cssAspectH = displayHeight ?? canvasHeight;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `sdl-hardware-wrapper ${className ?? ""}`, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        ref: containerRef,
        className: "relative overflow-hidden",
        style: {
          width: "100%",
          maxWidth: displayWidth ? `${displayWidth}px` : void 0,
          aspectRatio: `${cssAspectW} / ${cssAspectH}`,
          background: loaded ? "transparent" : "#111"
        },
        onClick: handleClick,
        children: !loaded && !error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "absolute inset-0 flex items-center justify-center text-text-muted text-xs",
            style: { pointerEvents: "none" },
            children: "Loading hardware UI…"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SDLHardwareWrapper.tsx",
            lineNumber: 463,
            columnNumber: 11
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SDLHardwareWrapper.tsx",
        lineNumber: 450,
        columnNumber: 7
      },
      void 0
    ),
    error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-red-400 text-sm mt-2 text-center", children: [
      "Failed to load hardware UI: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SDLHardwareWrapper.tsx",
      lineNumber: 472,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SDLHardwareWrapper.tsx",
    lineNumber: 449,
    columnNumber: 5
  }, void 0);
};
function getBuzzSynthInfo(synthType) {
  const machineName = synthType.replace(/^Buzz/, "");
  return {
    name: machineName,
    subtitle: `Buzz Machine: ${machineName}`,
    color: "#f59e0b",
    /* Amber for Buzz machines */
    params: []
    /* Will be populated from parameters prop */
  };
}
function buildInitBufferFromParams(name, subtitle, color, parameters) {
  const paramKeys = Object.keys(parameters);
  const bufSize = 256 + paramKeys.length * 128;
  const buf = new Uint8Array(bufSize);
  let pos = 0;
  buf[pos++] = paramKeys.length;
  const r = parseInt(color.slice(1, 3), 16) || 245;
  const g = parseInt(color.slice(3, 5), 16) || 158;
  const b = parseInt(color.slice(5, 7), 16) || 11;
  buf[pos++] = r;
  buf[pos++] = g;
  buf[pos++] = b;
  const nameBytes = new TextEncoder().encode(name);
  buf[pos++] = nameBytes.length;
  buf.set(nameBytes, pos);
  pos += nameBytes.length;
  const subBytes = new TextEncoder().encode(subtitle);
  buf[pos++] = subBytes.length;
  buf.set(subBytes, pos);
  pos += subBytes.length;
  for (const key of paramKeys) {
    const val = parameters[key] ?? 0;
    buf[pos++] = 0;
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const labelBytes = new TextEncoder().encode(label);
    buf[pos++] = labelBytes.length;
    buf.set(labelBytes, pos);
    pos += labelBytes.length;
    const group = "Parameters";
    const groupBytes = new TextEncoder().encode(group);
    buf[pos++] = groupBytes.length;
    buf.set(groupBytes, pos);
    pos += groupBytes.length;
    const dv = new DataView(buf.buffer, buf.byteOffset + pos, 16);
    dv.setFloat32(0, 0, true);
    dv.setFloat32(4, 1, true);
    dv.setFloat32(8, 0.01, true);
    dv.setFloat32(12, val, true);
    pos += 16;
    buf[pos++] = 0;
  }
  return buf.slice(0, pos);
}
function buildConfigBuffer$1(parameters) {
  const keys = Object.keys(parameters);
  const buf = new Uint8Array(keys.length * 4);
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < keys.length; i++) {
    dv.setFloat32(i * 4, parameters[keys[i]] ?? 0, true);
  }
  return buf;
}
const BuzzGenericHardware = ({
  synthType,
  parameters,
  onParamChange
}) => {
  const onChangeRef = reactExports.useRef(onParamChange);
  reactExports.useEffect(() => {
    onChangeRef.current = onParamChange;
  }, [onParamChange]);
  const paramKeys = reactExports.useMemo(() => Object.keys(parameters), [parameters]);
  const info = reactExports.useMemo(() => getBuzzSynthInfo(synthType), [synthType]);
  const initBuffer = reactExports.useMemo(
    () => buildInitBufferFromParams(info.name, info.subtitle, info.color, parameters),
    [info, parameters]
  );
  const configBuffer = reactExports.useMemo(
    () => buildConfigBuffer$1(parameters),
    [parameters]
  );
  const handleModuleReady = reactExports.useCallback((mod) => {
    mod.onParamChange = (paramIndex, value) => {
      if (paramIndex >= 0 && paramIndex < paramKeys.length) {
        onChangeRef.current(paramKeys[paramIndex], value);
      }
    };
  }, [paramKeys]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    SDLHardwareWrapper,
    {
      moduleUrl: "/mame-generic/MAMEGeneric.js",
      factoryName: "createMAMEGeneric",
      canvasWidth: 560,
      canvasHeight: 360,
      initFn: "_mame_generic_init_with_data",
      startFn: "_mame_generic_start",
      shutdownFn: "_mame_generic_shutdown",
      loadConfigFn: "_mame_generic_load_config",
      configBuffer,
      initBuffer,
      initWithDataFn: "_mame_generic_init_with_data",
      onModuleReady: handleModuleReady
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/BuzzGenericHardware.tsx",
      lineNumber: 168,
      columnNumber: 5
    },
    void 0
  );
};
const VSTBRIDGE_TYPES = [
  "Vital",
  "Odin2",
  "Surge",
  "TonewheelOrgan",
  "Melodica",
  "Monique",
  "Helm",
  "Sorcer",
  "amsynth",
  "OBXf",
  "Open303",
  // Zynthian ports
  "MdaEPiano",
  "MdaJX10",
  "MdaDX10",
  "ToneAM",
  "RaffoSynth",
  "CalfMono",
  "SetBfree",
  "SynthV1",
  "TalNoizeMaker",
  "Aeolus",
  "FluidSynth",
  "Sfizz",
  "ZynAddSubFX"
];
function isVSTBridgeType(synthType) {
  return VSTBRIDGE_TYPES.includes(synthType);
}
const SYNTH_INFO = {
  Vital: { name: "Vital", color: [0, 200, 255] },
  Odin2: { name: "Odin2", color: [255, 140, 0] },
  Surge: { name: "Surge XT", color: [100, 180, 255] },
  TonewheelOrgan: { name: "Tonewheel Organ", color: [180, 120, 60] },
  Melodica: { name: "Melodica", color: [255, 100, 100] },
  Monique: { name: "Monique", color: [200, 50, 200] },
  Helm: { name: "Helm", color: [50, 200, 50] },
  Sorcer: { name: "Sorcer", color: [200, 200, 50] },
  amsynth: { name: "amsynth", color: [100, 100, 255] },
  OBXf: { name: "OB-Xf", color: [255, 200, 50] },
  Open303: { name: "Open303", color: [255, 80, 0] },
  // Zynthian ports
  MdaEPiano: { name: "MDA ePiano", color: [200, 160, 120] },
  MdaJX10: { name: "MDA JX-10", color: [80, 140, 220] },
  MdaDX10: { name: "MDA DX-10", color: [220, 120, 60] },
  AMSynth: { name: "ToneAM", color: [100, 100, 255] },
  RaffoSynth: { name: "Raffo Minimoog", color: [160, 100, 50] },
  CalfMono: { name: "Calf Mono", color: [60, 180, 120] },
  SetBfree: { name: "setBfree B3", color: [180, 120, 60] },
  SynthV1: { name: "SynthV1", color: [140, 100, 200] },
  TalNoizeMaker: { name: "TAL NoizeMaker", color: [40, 180, 200] },
  Aeolus: { name: "Aeolus Organ", color: [200, 170, 80] },
  FluidSynth: { name: "FluidSynth", color: [80, 160, 200] },
  Sfizz: { name: "Sfizz", color: [120, 80, 200] },
  ZynAddSubFX: { name: "ZynAddSubFX", color: [220, 60, 60] }
};
function buildInitBuffer(synthType, parameters) {
  const info = SYNTH_INFO[synthType] ?? { name: synthType, color: [68, 187, 187] };
  const paramKeys = Object.keys(parameters);
  const bufSize = 256 + paramKeys.length * 128;
  const buf = new Uint8Array(bufSize);
  let pos = 0;
  buf[pos++] = paramKeys.length;
  buf[pos++] = info.color[0];
  buf[pos++] = info.color[1];
  buf[pos++] = info.color[2];
  const nameBytes = new TextEncoder().encode(info.name);
  buf[pos++] = nameBytes.length;
  buf.set(nameBytes, pos);
  pos += nameBytes.length;
  buf[pos++] = 0;
  for (const key of paramKeys) {
    const val = parameters[key] ?? 0;
    buf[pos++] = 0;
    const label = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());
    const labelBytes = new TextEncoder().encode(label);
    buf[pos++] = labelBytes.length;
    buf.set(labelBytes, pos);
    pos += labelBytes.length;
    const group = "Parameters";
    const groupBytes = new TextEncoder().encode(group);
    buf[pos++] = groupBytes.length;
    buf.set(groupBytes, pos);
    pos += groupBytes.length;
    const dv = new DataView(buf.buffer, buf.byteOffset + pos, 16);
    dv.setFloat32(0, 0, true);
    dv.setFloat32(4, 1, true);
    dv.setFloat32(8, 0.01, true);
    dv.setFloat32(12, val, true);
    pos += 16;
    buf[pos++] = 0;
  }
  return buf.slice(0, pos);
}
function buildConfigBuffer(parameters) {
  const keys = Object.keys(parameters);
  const buf = new Uint8Array(keys.length * 4);
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < keys.length; i++) {
    dv.setFloat32(i * 4, parameters[keys[i]] ?? 0, true);
  }
  return buf;
}
const VSTBridgeGenericHardware = ({
  synthType,
  parameters,
  onParamChange
}) => {
  const parametersRef = reactExports.useRef(parameters);
  reactExports.useEffect(() => {
    parametersRef.current = parameters;
  }, [parameters]);
  const onChangeRef = reactExports.useRef(onParamChange);
  reactExports.useEffect(() => {
    onChangeRef.current = onParamChange;
  }, [onParamChange]);
  const initBuffer = reactExports.useMemo(
    () => buildInitBuffer(synthType, parameters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [synthType]
    /* Only rebuild init buffer when synth type changes, not on every param change */
  );
  const configBuffer = reactExports.useMemo(
    () => buildConfigBuffer(parameters),
    [parameters]
  );
  const handleModuleReady = reactExports.useCallback((mod) => {
    mod.onParamChange = (paramIndex, value) => {
      const keys = Object.keys(parametersRef.current);
      if (paramIndex >= 0 && paramIndex < keys.length) {
        onChangeRef.current(keys[paramIndex], value);
      }
    };
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    SDLHardwareWrapper,
    {
      moduleUrl: "/vstbridge/VSTBridgeGeneric.js",
      factoryName: "createVSTBridgeGeneric",
      canvasWidth: 640,
      canvasHeight: 400,
      initFn: "_vstbridge_generic_init_with_data",
      startFn: "_vstbridge_generic_start",
      shutdownFn: "_vstbridge_generic_shutdown",
      loadConfigFn: "_vstbridge_generic_load_config",
      configBuffer,
      initBuffer,
      initWithDataFn: "_vstbridge_generic_init_with_data",
      onModuleReady: handleModuleReady
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VSTBridgeGenericHardware.tsx",
      lineNumber: 211,
      columnNumber: 5
    },
    void 0
  );
};
const FZHardware = ({ parameters, onParamChange }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MAMEGenericHardware, { synthType: "MAMEFZPCM", parameters, onParamChange }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FZHardware.tsx",
    lineNumber: 13,
    columnNumber: 10
  }, void 0);
};
const PS1SPUHardware = ({ parameters, onParamChange }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MAMEGenericHardware, { synthType: "MAMEPS1SPU", parameters, onParamChange }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/PS1SPUHardware.tsx",
    lineNumber: 13,
    columnNumber: 10
  }, void 0);
};
const ZSG2Hardware = ({ parameters, onParamChange }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MAMEGenericHardware, { synthType: "MAMEZSG2", parameters, onParamChange }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/ZSG2Hardware.tsx",
    lineNumber: 13,
    columnNumber: 10
  }, void 0);
};
const KS0164Hardware = ({ parameters, onParamChange }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MAMEGenericHardware, { synthType: "MAMEKS0164", parameters, onParamChange }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/KS0164Hardware.tsx",
    lineNumber: 13,
    columnNumber: 10
  }, void 0);
};
const SWP00Hardware = ({ parameters, onParamChange }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MAMEGenericHardware, { synthType: "MAMESWP00", parameters, onParamChange }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SWP00Hardware.tsx",
    lineNumber: 13,
    columnNumber: 10
  }, void 0);
};
const SWP20Hardware = ({ parameters, onParamChange }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MAMEGenericHardware, { synthType: "MAMESWP20", parameters, onParamChange }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SWP20Hardware.tsx",
    lineNumber: 13,
    columnNumber: 10
  }, void 0);
};
const RolandGPHardware = ({ parameters, onParamChange }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MAMEGenericHardware, { synthType: "MAMERolandGP", parameters, onParamChange }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/RolandGPHardware.tsx",
    lineNumber: 13,
    columnNumber: 10
  }, void 0);
};
function blitFramebuffer$6(mod, ctx, imgData, width, height) {
  const fbPtr = mod._monique_ui_get_fb();
  if (!fbPtr) return;
  const totalPixels = width * height;
  const src = mod.HEAPU8.subarray(fbPtr, fbPtr + totalPixels * 4);
  const dst = imgData.data;
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];
    dst[off + 1] = src[off + 1];
    dst[off + 2] = src[off];
    dst[off + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
const MoniqueHardwareUI = (props) => {
  const { onParamChange: _onParamChange, instrumentId: instrumentIdProp } = props;
  const storeInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);
  const instrumentId = instrumentIdProp ?? storeInstrumentId ?? 1;
  const canvasRef = reactExports.useRef(null);
  const instrumentIdRef = reactExports.useRef(instrumentId);
  instrumentIdRef.current = instrumentId;
  const moduleRef = reactExports.useRef(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [dimensions, setDimensions] = reactExports.useState({ width: 1465, height: 1210 });
  const canvasCoords = reactExports.useCallback(
    (canvas, e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return [
        Math.floor((e.clientX - rect.left) * scaleX),
        Math.floor((e.clientY - rect.top) * scaleY)
      ];
    },
    []
  );
  const getModifiers = reactExports.useCallback((e) => {
    let mods = 0;
    if (e.shiftKey) mods |= 1;
    if (e.ctrlKey) mods |= 2;
    if (e.altKey) mods |= 4;
    if (e.metaKey) mods |= 8;
    if (e.buttons & 1) mods |= 16;
    return mods;
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups = [];
    const init = async () => {
      try {
        const factory = await new Promise((resolve, reject) => {
          const existing = window.createMoniqueUIModule;
          if (typeof existing === "function") {
            resolve(existing);
            return;
          }
          const script = document.createElement("script");
          script.src = "/monique/MoniqueUI.js";
          script.onload = () => {
            const fn = window.createMoniqueUIModule;
            if (typeof fn === "function") {
              resolve(fn);
            } else {
              reject(new Error("createMoniqueUIModule not found on window"));
            }
          };
          script.onerror = () => reject(new Error("Failed to load MoniqueUI.js"));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        const m = await factory({});
        if (cancelled) {
          m._monique_ui_shutdown();
          return;
        }
        moduleRef.current = m;
        const audioCtx = window.devilboxAudioContext;
        const sampleRate = (audioCtx == null ? void 0 : audioCtx.sampleRate) ?? 48e3;
        m._monique_ui_init(sampleRate);
        const w = m._monique_ui_get_width();
        const h = m._monique_ui_get_height();
        setDimensions({ width: w, height: h });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const imgData = ctx.createImageData(w, h);
        let isDragging = false;
        const onMouseDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          isDragging = true;
          canvas.focus();
          const [cx, cy] = canvasCoords(canvas, e);
          m._monique_ui_on_mouse_down(cx, cy, getModifiers(e));
        };
        const onMouseUp = (e) => {
          isDragging = false;
          const [cx, cy] = canvasCoords(canvas, e);
          m._monique_ui_on_mouse_up(cx, cy, getModifiers(e));
        };
        const onMouseMove = (e) => {
          if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
          }
          const [cx, cy] = canvasCoords(canvas, e);
          m._monique_ui_on_mouse_move(cx, cy, getModifiers(e));
        };
        const onWheel = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const [cx, cy] = canvasCoords(canvas, e);
          m._monique_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
        };
        canvas.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        eventCleanups.push(
          () => canvas.removeEventListener("mousedown", onMouseDown),
          () => document.removeEventListener("mouseup", onMouseUp),
          () => document.removeEventListener("mousemove", onMouseMove),
          () => canvas.removeEventListener("wheel", onWheel)
        );
        window._moniqueUIMidiCallback = (type, note, vel) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            const instruments = engine.instruments;
            const key = instrumentIdRef.current << 16 | 65535;
            const synth = instruments == null ? void 0 : instruments.get(key);
            if (!(synth == null ? void 0 : synth._worklet)) {
              console.warn(`[MoniqueHardwareUI] Synth worklet not ready for instrument ${instrumentId}`);
              return;
            }
            if (type === "noteOn") {
              synth._worklet.port.postMessage({ type: "noteOn", note, velocity: vel });
            } else if (type === "noteOff") {
              synth._worklet.port.postMessage({ type: "noteOff", note });
            }
          } catch {
          }
        };
        const pendingParams = /* @__PURE__ */ new Map();
        let paramFlushScheduled = false;
        const flushParams = () => {
          paramFlushScheduled = false;
          if (pendingParams.size === 0 || !instrumentIdRef.current) return;
          try {
            const engine = getToneEngine();
            const instruments = engine.instruments;
            const key = instrumentIdRef.current << 16 | 65535;
            const synth = instruments == null ? void 0 : instruments.get(key);
            if (synth == null ? void 0 : synth._worklet) {
              for (const [idx, val] of pendingParams) {
                synth._worklet.port.postMessage({ type: "setParam", index: idx, value: val });
              }
            }
          } catch {
          }
          pendingParams.clear();
        };
        window._moniqueUIParamCallback = (index, value) => {
          pendingParams.set(index, value);
          if (!paramFlushScheduled) {
            paramFlushScheduled = true;
            requestAnimationFrame(flushParams);
          }
        };
        eventCleanups.push(() => {
          delete window._moniqueUIMidiCallback;
          delete window._moniqueUIParamCallback;
        });
        setLoaded(true);
        const renderLoop = () => {
          if (cancelled) return;
          if (m._monique_ui_tick) m._monique_ui_tick();
          blitFramebuffer$6(m, ctx, imgData, w, h);
          rafId = requestAnimationFrame(renderLoop);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error("[MoniqueHardwareUI] Init failed:", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    init();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());
      if (instrumentIdRef.current) {
        try {
          const engine = getToneEngine();
          const instruments = engine.instruments;
          const key = instrumentIdRef.current << 16 | 65535;
          const synth = instruments == null ? void 0 : instruments.get(key);
          if (synth == null ? void 0 : synth._worklet) {
            synth._worklet.port.postMessage({ type: "allNotesOff" });
          }
        } catch {
        }
      }
      if (moduleRef.current) {
        moduleRef.current._monique_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers]);
  if (error) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#ff6666", fontFamily: "monospace" }, children: [
      "[MoniqueHardwareUI] Error: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MoniqueHardwareUI.tsx",
      lineNumber: 321,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "#1a1a1a",
        width: "100%",
        height: "100%",
        overflow: "auto"
      },
      children: [
        !loaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#888", fontFamily: "monospace" }, children: "Loading Monique hardware UI..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MoniqueHardwareUI.tsx",
          lineNumber: 340,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: canvasRef,
            width: dimensions.width,
            height: dimensions.height,
            tabIndex: 0,
            style: {
              imageRendering: "pixelated",
              maxWidth: "100%",
              height: "auto",
              display: loaded ? "block" : "none",
              cursor: "default",
              touchAction: "none",
              // Prevent browser scroll on drag
              userSelect: "none"
              // Prevent text selection during drag
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MoniqueHardwareUI.tsx",
            lineNumber: 344,
            columnNumber: 7
          },
          void 0
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/MoniqueHardwareUI.tsx",
      lineNumber: 328,
      columnNumber: 5
    },
    void 0
  );
};
const MoniqueHardwareUI$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  MoniqueHardwareUI,
  default: MoniqueHardwareUI
}, Symbol.toStringTag, { value: "Module" }));
function blitFramebuffer$5(mod, ctx, imgData, fbWidth, fbHeight) {
  const fbPtr = mod._amsynth_ui_get_fb();
  if (!fbPtr) return;
  const totalPixels = fbWidth * fbHeight;
  const src = mod.HEAPU8.subarray(fbPtr, fbPtr + totalPixels * 4);
  const dst = imgData.data;
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];
    dst[off + 1] = src[off + 1];
    dst[off + 2] = src[off];
    dst[off + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
const AmsynthHardwareUI = ({
  onParamChange: _onParamChange,
  instrumentId
}) => {
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const moduleRef = reactExports.useRef(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const fbWidthRef = reactExports.useRef(600);
  const fbHeightRef = reactExports.useRef(400);
  const canvasCoords = reactExports.useCallback(
    (canvas, e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return [
        Math.floor((e.clientX - rect.left) * scaleX),
        Math.floor((e.clientY - rect.top) * scaleY)
      ];
    },
    []
  );
  const getModifiers = reactExports.useCallback((e) => {
    let mods = 0;
    if (e.shiftKey) mods |= 1;
    if (e.ctrlKey) mods |= 2;
    if (e.altKey) mods |= 4;
    if (e.metaKey) mods |= 8;
    if (e.buttons & 1) mods |= 16;
    return mods;
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups = [];
    const init = async () => {
      try {
        const factory = await new Promise((resolve, reject) => {
          const existing = window.createAmsynthUIModule;
          if (typeof existing === "function") {
            resolve(existing);
            return;
          }
          const script = document.createElement("script");
          script.src = "/amsynth/AmsynthUI.js";
          script.onload = () => {
            const fn = window.createAmsynthUIModule;
            if (typeof fn === "function") {
              resolve(fn);
            } else {
              reject(new Error("createAmsynthUIModule not found on window"));
            }
          };
          script.onerror = () => reject(new Error("Failed to load AmsynthUI.js"));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        const m = await factory({});
        if (cancelled) {
          m._amsynth_ui_shutdown();
          return;
        }
        moduleRef.current = m;
        const dpr = window.devicePixelRatio || 1;
        if (m._amsynth_ui_init_scaled) {
          m._amsynth_ui_init_scaled(dpr);
        } else {
          m._amsynth_ui_init();
        }
        const w = m._amsynth_ui_get_width();
        const h = m._amsynth_ui_get_height();
        fbWidthRef.current = Math.round(w / dpr);
        fbHeightRef.current = Math.round(h / dpr);
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const nativeW = fbWidthRef.current;
        const nativeH = fbHeightRef.current;
        canvas.style.width = `${nativeW}px`;
        canvas.style.height = `${nativeH}px`;
        canvas.style.imageRendering = "auto";
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const imgData = ctx.createImageData(w, h);
        let isDragging = false;
        const onMouseDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          isDragging = true;
          canvas.focus();
          const [cx, cy] = canvasCoords(canvas, e);
          m._amsynth_ui_on_mouse_down(cx, cy, getModifiers(e));
        };
        const onMouseUp = (e) => {
          isDragging = false;
          const [cx, cy] = canvasCoords(canvas, e);
          m._amsynth_ui_on_mouse_up(cx, cy, getModifiers(e));
        };
        const onMouseMove = (e) => {
          if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
          }
          const [cx, cy] = canvasCoords(canvas, e);
          m._amsynth_ui_on_mouse_move(cx, cy, getModifiers(e));
        };
        const onWheel = (e) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._amsynth_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
        };
        canvas.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        eventCleanups.push(
          () => canvas.removeEventListener("mousedown", onMouseDown),
          () => document.removeEventListener("mouseup", onMouseUp),
          () => document.removeEventListener("mousemove", onMouseMove),
          () => canvas.removeEventListener("wheel", onWheel)
        );
        window._amsynthUIParamCallback = (paramId, normalizedValue) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            const instruments = engine.instruments;
            const key = instrumentId << 16 | 65535;
            const synth = instruments == null ? void 0 : instruments.get(key);
            if (synth == null ? void 0 : synth._worklet) {
              synth._worklet.port.postMessage({
                type: "setParameter",
                index: paramId,
                value: normalizedValue
              });
            }
          } catch {
          }
        };
        eventCleanups.push(() => {
          delete window._amsynthUIParamCallback;
        });
        setLoaded(true);
        const renderLoop = () => {
          if (cancelled) return;
          if (m._amsynth_ui_tick) m._amsynth_ui_tick();
          blitFramebuffer$5(m, ctx, imgData, w, h);
          rafId = requestAnimationFrame(renderLoop);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error("[AmsynthHardwareUI] Init failed:", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    init();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());
      if (moduleRef.current) {
        moduleRef.current._amsynth_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers, instrumentId]);
  if (error) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#ff6666", fontFamily: "monospace" }, children: [
      "[AmsynthHardwareUI] Error: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/AmsynthHardwareUI.tsx",
      lineNumber: 288,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a1a",
        width: "100%",
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        position: "relative"
      },
      children: [
        !loaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#888", fontFamily: "monospace" }, children: "Loading amsynth hardware UI..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/AmsynthHardwareUI.tsx",
          lineNumber: 310,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: canvasRef,
            tabIndex: 0,
            style: {
              display: loaded ? "block" : "none",
              cursor: "default",
              touchAction: "none",
              userSelect: "none"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/AmsynthHardwareUI.tsx",
            lineNumber: 314,
            columnNumber: 7
          },
          void 0
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/AmsynthHardwareUI.tsx",
      lineNumber: 295,
      columnNumber: 5
    },
    void 0
  );
};
const AmsynthHardwareUI$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AmsynthHardwareUI,
  default: AmsynthHardwareUI
}, Symbol.toStringTag, { value: "Module" }));
function blitFramebuffer$4(mod, ctx, imgData, fbWidth, fbHeight) {
  const fbPtr = mod._dexed_ui_get_fb();
  if (!fbPtr) return;
  const totalPixels = fbWidth * fbHeight;
  const src = mod.HEAPU8.subarray(fbPtr, fbPtr + totalPixels * 4);
  const dst = imgData.data;
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];
    dst[off + 1] = src[off + 1];
    dst[off + 2] = src[off];
    dst[off + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
const DexedHardwareUI = ({
  onParamChange: _onParamChange,
  instrumentId
}) => {
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const moduleRef = reactExports.useRef(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [patchInfo, setPatchInfo] = reactExports.useState(null);
  const fileInputRef = reactExports.useRef(null);
  const loadSysexFile = reactExports.useCallback(async (file) => {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const m = moduleRef.current;
    if (data.length === 4104 || data.length === 4096) {
      const voiceData = data.length === 4104 ? data.subarray(6, 4102) : data;
      const firstVoice = unpackDX7Voice(voiceData.subarray(0, 128));
      if (m) {
        const ptr = m._malloc(155);
        m.HEAPU8.set(firstVoice.subarray(0, 155), ptr);
        m._dexed_ui_load_sysex(ptr, 155);
        m._free(ptr);
      }
      if (instrumentId) {
        try {
          const engine = getToneEngine();
          const key = instrumentId << 16 | 65535;
          const synth = engine.instruments.get(key);
          if (synth == null ? void 0 : synth.loadSysex) {
            if (data.length === 4096) {
              const sysex = new Uint8Array(4104);
              sysex[0] = 240;
              sysex[1] = 67;
              sysex[2] = 0;
              sysex[3] = 9;
              sysex[4] = 32;
              sysex[5] = 0;
              sysex.set(data, 6);
              let sum = 0;
              for (let i = 0; i < 4096; i++) sum += data[i];
              sysex[4102] = -sum & 127;
              sysex[4103] = 247;
              synth.loadSysex(sysex.buffer);
            } else {
              synth.loadSysex(buffer);
            }
          }
        } catch {
        }
      }
      setPatchInfo(`Loaded ${file.name} (32 voices)`);
    } else if (data.length >= 155 && data.length <= 163) {
      const vcedStart = data[0] === 240 ? 6 : 0;
      const vcedData = data.subarray(vcedStart, vcedStart + 155);
      if (m) {
        const ptr = m._malloc(155);
        m.HEAPU8.set(vcedData, ptr);
        m._dexed_ui_load_sysex(ptr, 155);
        m._free(ptr);
      }
      if (instrumentId) {
        try {
          const engine = getToneEngine();
          const key = instrumentId << 16 | 65535;
          const synth = engine.instruments.get(key);
          if (synth == null ? void 0 : synth._loadVcedData) {
            synth._loadVcedData(new Uint8Array(vcedData));
          }
        } catch {
        }
      }
      setPatchInfo(`Loaded ${file.name} (single voice)`);
    } else {
      setPatchInfo(`Unknown format (${data.length} bytes)`);
    }
  }, [instrumentId]);
  const handleFileDrop = reactExports.useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".syx") || file.name.endsWith(".SYX"))) {
      loadSysexFile(file);
    }
  }, [loadSysexFile]);
  const handleFileInput = reactExports.useCallback((e) => {
    var _a;
    const file = (_a = e.target.files) == null ? void 0 : _a[0];
    if (file) loadSysexFile(file);
    e.target.value = "";
  }, [loadSysexFile]);
  const fbWidthRef = reactExports.useRef(866);
  const fbHeightRef = reactExports.useRef(674);
  const canvasCoords = reactExports.useCallback(
    (canvas, e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return [
        Math.floor((e.clientX - rect.left) * scaleX),
        Math.floor((e.clientY - rect.top) * scaleY)
      ];
    },
    []
  );
  const getModifiers = reactExports.useCallback((e) => {
    let mods = 0;
    if (e.shiftKey) mods |= 1;
    if (e.ctrlKey) mods |= 2;
    if (e.altKey) mods |= 4;
    if (e.metaKey) mods |= 8;
    if (e.buttons & 1) mods |= 16;
    return mods;
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups = [];
    const init = async () => {
      try {
        const factory = await new Promise((resolve, reject) => {
          const existing = window.createDexedUIModule;
          if (typeof existing === "function") {
            resolve(existing);
            return;
          }
          const script = document.createElement("script");
          script.src = "/dexed/DexedUI.js";
          script.onload = () => {
            const fn = window.createDexedUIModule;
            if (typeof fn === "function") {
              resolve(fn);
            } else {
              reject(new Error("createDexedUIModule not found on window"));
            }
          };
          script.onerror = () => reject(new Error("Failed to load DexedUI.js"));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        const m = await factory({});
        if (cancelled) {
          m._dexed_ui_shutdown();
          return;
        }
        moduleRef.current = m;
        const dpr = window.devicePixelRatio || 1;
        if (m._dexed_ui_init_scaled) {
          m._dexed_ui_init_scaled(dpr);
        } else {
          m._dexed_ui_init();
        }
        const w = m._dexed_ui_get_width();
        const h = m._dexed_ui_get_height();
        fbWidthRef.current = Math.round(w / dpr);
        fbHeightRef.current = Math.round(h / dpr);
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const nativeW = fbWidthRef.current;
        const nativeH = fbHeightRef.current;
        const updateCanvasCSS = () => {
          const container = containerRef.current;
          if (!container) return;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const s = Math.min(cw / nativeW, ch / nativeH);
          canvas.style.width = `${Math.floor(nativeW * s)}px`;
          canvas.style.height = `${Math.floor(nativeH * s)}px`;
        };
        updateCanvasCSS();
        const ro = new ResizeObserver(updateCanvasCSS);
        if (containerRef.current) ro.observe(containerRef.current);
        eventCleanups.push(() => ro.disconnect());
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const imgData = ctx.createImageData(w, h);
        const onMouseDown = (e) => {
          e.preventDefault();
          canvas.focus();
          const [cx, cy] = canvasCoords(canvas, e);
          m._dexed_ui_on_mouse_down(cx, cy, getModifiers(e));
        };
        const onMouseUp = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._dexed_ui_on_mouse_up(cx, cy, getModifiers(e));
        };
        const onMouseMove = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._dexed_ui_on_mouse_move(cx, cy, getModifiers(e));
        };
        const onWheel = (e) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._dexed_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
        };
        canvas.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        eventCleanups.push(
          () => canvas.removeEventListener("mousedown", onMouseDown),
          () => document.removeEventListener("mouseup", onMouseUp),
          () => document.removeEventListener("mousemove", onMouseMove),
          () => canvas.removeEventListener("wheel", onWheel)
        );
        window._dexedUIParamCallback = (_paramId, _normalizedValue) => {
          lastVoiceHash = 0;
        };
        window._dexedUIMidiCallback = (type, note, vel) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            const key = instrumentId << 16 | 65535;
            const synth = engine.instruments.get(key);
            if (!synth) return;
            if (type === "noteOn") {
              synth.triggerAttack(note, void 0, vel / 127);
            } else if (type === "noteOff") {
              synth.triggerRelease(note);
            }
          } catch {
          }
        };
        window._dexedUICartCallback = () => {
          var _a;
          (_a = fileInputRef.current) == null ? void 0 : _a.click();
        };
        eventCleanups.push(() => {
          delete window._dexedUIParamCallback;
          delete window._dexedUIMidiCallback;
          delete window._dexedUICartCallback;
        });
        setLoaded(true);
        let lastVoiceHash = 0;
        let syncCounter = 0;
        const computeHash = (data) => {
          let h2 = 0;
          for (let i = 0; i < data.length; i++) h2 = (h2 << 5) - h2 + data[i] | 0;
          return h2;
        };
        const syncVoiceToAudio = () => {
          if (!instrumentId) return;
          const voicePtr = m._dexed_ui_get_voice_data();
          if (!voicePtr) return;
          const vced = m.HEAPU8.subarray(voicePtr, voicePtr + 155);
          const hash = computeHash(vced);
          if (hash === lastVoiceHash) return;
          lastVoiceHash = hash;
          try {
            const engine = getToneEngine();
            const key = instrumentId << 16 | 65535;
            const synth = engine.instruments.get(key);
            if (synth && "_loadVcedData" in synth) {
              synth._loadVcedData(new Uint8Array(vced));
            }
          } catch {
          }
        };
        const renderLoop = () => {
          if (cancelled) return;
          if (m._dexed_ui_tick) m._dexed_ui_tick();
          blitFramebuffer$4(m, ctx, imgData, w, h);
          if (++syncCounter % 6 === 0) syncVoiceToAudio();
          rafId = requestAnimationFrame(renderLoop);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error("[DexedHardwareUI] Init failed:", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    init();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());
      if (instrumentId) {
        try {
          const engine = getToneEngine();
          const key = instrumentId << 16 | 65535;
          const synth = engine.instruments.get(key);
          if (synth == null ? void 0 : synth.triggerRelease) synth.triggerRelease();
        } catch {
        }
      }
      if (moduleRef.current) {
        moduleRef.current._dexed_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers, instrumentId]);
  if (error) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#ff6666", fontFamily: "monospace" }, children: [
      "[DexedHardwareUI] Error: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/DexedHardwareUI.tsx",
      lineNumber: 430,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      onDragOver: (e) => e.preventDefault(),
      onDrop: handleFileDrop,
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a1a",
        width: "100%",
        height: "100%",
        overflow: "hidden"
      },
      children: [
        !loaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#888", fontFamily: "monospace" }, children: "Loading Dexed DX7 hardware UI..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/DexedHardwareUI.tsx",
          lineNumber: 453,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: canvasRef,
            tabIndex: 0,
            style: {
              display: loaded ? "block" : "none",
              cursor: "default"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/DexedHardwareUI.tsx",
            lineNumber: 457,
            columnNumber: 7
          },
          void 0
        ),
        loaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => {
                var _a;
                return (_a = fileInputRef.current) == null ? void 0 : _a.click();
              },
              style: {
                background: "#333",
                color: "#ccc",
                border: "1px solid #555",
                borderRadius: 4,
                padding: "3px 10px",
                fontSize: 11,
                cursor: "pointer"
              },
              children: "Load .SYX"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/DexedHardwareUI.tsx",
              lineNumber: 467,
              columnNumber: 11
            },
            void 0
          ),
          patchInfo && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#8f8", fontSize: 11, fontFamily: "monospace" }, children: patchInfo }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/DexedHardwareUI.tsx",
            lineNumber: 477,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              ref: fileInputRef,
              type: "file",
              accept: ".syx,.SYX",
              onChange: handleFileInput,
              style: { display: "none" }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/DexedHardwareUI.tsx",
              lineNumber: 479,
              columnNumber: 11
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/DexedHardwareUI.tsx",
          lineNumber: 466,
          columnNumber: 9
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/DexedHardwareUI.tsx",
      lineNumber: 437,
      columnNumber: 5
    },
    void 0
  );
};
const OBXD_NATIVE_PRESETS = [
  // ═══════════════════════════════════════════════════════════
  // INIT / DEFAULT
  // ═══════════════════════════════════════════════════════════
  {
    name: "Init",
    //       OSC1                     OSC2                     MIX/SYNC/XOR
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      0,
      0,
      0.5,
      0,
      0,
      0,
      0,
      //       FILTER                                FILT ENV
      0.7,
      0.3,
      0,
      0.5,
      0,
      0.3,
      0.01,
      0.2,
      0.3,
      0.3,
      //       AMP ENV                 LFO
      0.01,
      0.2,
      0.7,
      0.3,
      0.2,
      0,
      0,
      0,
      0,
      0,
      0,
      //       GLOBAL                                           EXTENDED
      0.7,
      8,
      0,
      0.1,
      0,
      0.3,
      0.5,
      0,
      0,
      -1,
      0.02
    ]
  },
  // ═══════════════════════════════════════════════════════════
  // BASSES
  // ═══════════════════════════════════════════════════════════
  {
    name: "Classic Bass",
    values: [
      0,
      -1,
      0,
      0.5,
      1,
      0,
      -1,
      0.08,
      0.5,
      0.7,
      0,
      0,
      0,
      0.25,
      0.15,
      0,
      0.7,
      0,
      0,
      0.01,
      0.25,
      0.1,
      0.15,
      0.01,
      0.1,
      0.6,
      0.15,
      0.2,
      0,
      0,
      0,
      0,
      0,
      0,
      0.75,
      4,
      0,
      0.1,
      0,
      0.1,
      0.3,
      0,
      0.3,
      -1,
      0.02
    ]
  },
  {
    name: "Sub Bass",
    values: [
      2,
      -2,
      0,
      0.5,
      1,
      0,
      -1,
      0.03,
      0.5,
      0.5,
      0,
      0,
      0,
      0.15,
      0.05,
      0,
      0.3,
      0,
      0,
      0.01,
      0.35,
      0.15,
      0.2,
      0.01,
      0.15,
      0.8,
      0.2,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0.8,
      4,
      0,
      0.1,
      0,
      0,
      0.2,
      0,
      0.5,
      -2,
      0.01
    ]
  },
  {
    name: "Acid Bass",
    values: [
      0,
      -1,
      0,
      0.5,
      1,
      0,
      -1,
      0,
      0.5,
      0,
      0,
      0,
      0,
      0.2,
      0.7,
      0,
      0.9,
      0,
      0.5,
      0.01,
      0.15,
      0.05,
      0.1,
      0.01,
      0.08,
      0.6,
      0.1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0.7,
      1,
      0,
      0.1,
      0.05,
      0,
      0.6,
      0,
      0,
      -1,
      0.02
    ]
  },
  {
    name: "Growl Bass",
    values: [
      0,
      -1,
      0,
      0.5,
      1,
      0,
      -1,
      0.15,
      0.5,
      0.8,
      0,
      0,
      0,
      0.3,
      0.55,
      0,
      0.8,
      0,
      0.4,
      0.01,
      0.2,
      0.1,
      0.15,
      0.01,
      0.12,
      0.65,
      0.12,
      0.35,
      0,
      0,
      0.05,
      0.15,
      0,
      0,
      0.75,
      4,
      0,
      0.15,
      0,
      0.1,
      0.5,
      0,
      0.4,
      -1,
      0.03
    ]
  },
  {
    name: "Pulse Bass",
    values: [
      1,
      -1,
      0,
      0.35,
      1,
      1,
      -1,
      0.06,
      0.65,
      0.7,
      0,
      0,
      0,
      0.2,
      0.2,
      0,
      0.6,
      0,
      0.2,
      0.01,
      0.3,
      0.2,
      0.2,
      0.01,
      0.15,
      0.7,
      0.15,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0.7,
      4,
      0,
      0.1,
      0,
      0.1,
      0.4,
      0,
      0.2,
      -1,
      0.02
    ]
  },
  // ═══════════════════════════════════════════════════════════
  // LEADS
  // ═══════════════════════════════════════════════════════════
  {
    name: "Fat Lead",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      -1,
      0.1,
      0.5,
      1,
      0,
      0,
      0,
      0.6,
      0.4,
      0,
      0.3,
      0.2,
      0.3,
      0.01,
      0.2,
      0.4,
      0.2,
      0.01,
      0.1,
      0.8,
      0.2,
      0.3,
      0,
      0,
      0.1,
      0,
      0,
      0,
      0.7,
      8,
      0,
      0.1,
      0,
      0.3,
      0.5,
      0,
      0,
      -1,
      0.02
    ]
  },
  {
    name: "Sync Lead",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      1,
      0,
      0.5,
      0.8,
      0,
      1,
      0,
      0.5,
      0.3,
      0,
      0.5,
      0.3,
      0.3,
      0.01,
      0.25,
      0.3,
      0.2,
      0.01,
      0.15,
      0.8,
      0.25,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0.7,
      4,
      0,
      0.1,
      0,
      0.2,
      0.5,
      0,
      0,
      -1,
      0.02
    ]
  },
  {
    name: "Screaming Lead",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      1,
      0.12,
      0.5,
      0.6,
      0,
      1,
      0,
      0.35,
      0.65,
      0,
      0.8,
      0.4,
      0.4,
      0.01,
      0.15,
      0.2,
      0.15,
      0.01,
      0.1,
      0.85,
      0.2,
      0.25,
      0,
      0,
      0.08,
      0,
      0,
      0,
      0.7,
      1,
      0,
      0.1,
      0.08,
      0.1,
      0.6,
      0,
      0,
      -1,
      0.03
    ]
  },
  {
    name: "Triangle Lead",
    values: [
      2,
      0,
      0,
      0.5,
      1,
      2,
      0,
      0.08,
      0.5,
      0.6,
      0,
      0,
      0,
      0.65,
      0.15,
      0,
      0.2,
      0.3,
      0.2,
      0.01,
      0.3,
      0.4,
      0.3,
      0.01,
      0.15,
      0.8,
      0.25,
      0.3,
      0,
      0,
      0.15,
      0,
      0,
      0,
      0.7,
      4,
      0,
      0.1,
      0,
      0.2,
      0.4,
      0,
      0,
      -1,
      0.01
    ]
  },
  {
    name: "Mono Saw Lead",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      0,
      0.05,
      0.5,
      0.9,
      0,
      0,
      0,
      0.55,
      0.35,
      0,
      0.4,
      0.3,
      0.4,
      0.01,
      0.2,
      0.35,
      0.2,
      0.01,
      0.1,
      0.85,
      0.2,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0.7,
      1,
      0,
      0.1,
      0.06,
      0.1,
      0.5,
      0,
      0,
      -1,
      0.02
    ]
  },
  {
    name: "Portamento Lead",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      0,
      0.07,
      0.5,
      0.85,
      0,
      0,
      0,
      0.5,
      0.3,
      0,
      0.35,
      0.25,
      0.3,
      0.01,
      0.25,
      0.3,
      0.25,
      0.01,
      0.12,
      0.8,
      0.2,
      0.2,
      0,
      0,
      0.05,
      0,
      0,
      0,
      0.7,
      1,
      0,
      0.1,
      0.25,
      0.15,
      0.5,
      0,
      0,
      -1,
      0.02
    ]
  },
  // ═══════════════════════════════════════════════════════════
  // PADS
  // ═══════════════════════════════════════════════════════════
  {
    name: "Classic Brass",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      0,
      0.05,
      0.5,
      0.8,
      0,
      0,
      0,
      0.4,
      0.2,
      0,
      0.6,
      0,
      0.3,
      0.1,
      0.3,
      0.4,
      0.2,
      0.05,
      0.1,
      0.8,
      0.3,
      0.2,
      0,
      0,
      0,
      0,
      0,
      0,
      0.7,
      8,
      0,
      0.1,
      0,
      0.3,
      0.5,
      0,
      0,
      -1,
      0.02
    ]
  },
  {
    name: "Pulse Pad",
    values: [
      1,
      0,
      0,
      0.3,
      1,
      1,
      0,
      0.02,
      0.7,
      0.9,
      0,
      0,
      0,
      0.3,
      0.1,
      0,
      0.2,
      0.1,
      0.2,
      0.3,
      0.5,
      0.4,
      0.5,
      0.5,
      0.5,
      0.7,
      1,
      0.15,
      0,
      0,
      0,
      0,
      0,
      0.3,
      0.7,
      8,
      0,
      0.1,
      0,
      0.4,
      0.3,
      0,
      0,
      -1,
      0.02
    ]
  },
  {
    name: "Warm Pad",
    values: [
      0,
      0,
      0,
      0.5,
      0.8,
      0,
      0,
      0.06,
      0.5,
      0.8,
      0,
      0,
      0,
      0.35,
      0.15,
      1,
      0.3,
      0.1,
      0.1,
      0.2,
      0.4,
      0.5,
      0.6,
      0.6,
      0.4,
      0.75,
      0.8,
      0.1,
      0,
      0,
      0,
      0.05,
      0,
      0,
      0.7,
      8,
      0,
      0.15,
      0,
      0.5,
      0.3,
      0,
      0,
      -1,
      0.03
    ]
  },
  {
    name: "Shimmering Pad",
    values: [
      0,
      0,
      0,
      0.5,
      0.7,
      0,
      1,
      0.03,
      0.5,
      0.7,
      0,
      0,
      0,
      0.45,
      0.2,
      0,
      0.25,
      0.2,
      0.1,
      0.4,
      0.5,
      0.5,
      0.7,
      0.7,
      0.3,
      0.8,
      0.9,
      0.25,
      1,
      0,
      0.1,
      0.08,
      0,
      0,
      0.65,
      8,
      0,
      0.2,
      0,
      0.6,
      0.3,
      0,
      0,
      -1,
      0.02
    ]
  },
  {
    name: "Dark Pad",
    values: [
      0,
      -1,
      0,
      0.5,
      0.9,
      0,
      0,
      0.04,
      0.5,
      0.7,
      0,
      0,
      0,
      0.2,
      0.1,
      0,
      0.15,
      0,
      0.1,
      0.5,
      0.6,
      0.5,
      0.7,
      0.7,
      0.5,
      0.75,
      0.9,
      0.08,
      0,
      0,
      0,
      0,
      0,
      0,
      0.7,
      8,
      0,
      0.1,
      0,
      0.5,
      0.2,
      0,
      0.2,
      -1,
      0.03
    ]
  },
  {
    name: "Ethereal Pad",
    values: [
      2,
      0,
      0,
      0.5,
      0.6,
      2,
      0,
      0.05,
      0.5,
      0.6,
      0,
      0,
      0,
      0.5,
      0.25,
      0,
      0.2,
      0.15,
      0.1,
      0.6,
      0.4,
      0.5,
      0.8,
      0.8,
      0.3,
      0.7,
      1,
      0.12,
      0,
      0,
      0.08,
      0.06,
      0,
      0,
      0.65,
      8,
      0,
      0.15,
      0,
      0.6,
      0.25,
      0,
      0,
      -1,
      0.02
    ]
  },
  // ═══════════════════════════════════════════════════════════
  // STRINGS
  // ═══════════════════════════════════════════════════════════
  {
    name: "Analog Strings",
    values: [
      0,
      0,
      0,
      0.5,
      0.9,
      0,
      0,
      0.04,
      0.5,
      0.9,
      0,
      0,
      0,
      0.4,
      0.1,
      0,
      0.3,
      0.15,
      0.2,
      0.2,
      0.4,
      0.5,
      0.4,
      0.4,
      0.3,
      0.8,
      0.5,
      0.15,
      0,
      0.2,
      0.03,
      0,
      0,
      0,
      0.7,
      8,
      0,
      0.15,
      0,
      0.5,
      0.4,
      0,
      0,
      -1,
      0.03
    ]
  },
  {
    name: "Unison Strings",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      0,
      0.03,
      0.5,
      1,
      0,
      0,
      0,
      0.45,
      0.12,
      0,
      0.35,
      0.15,
      0.2,
      0.25,
      0.4,
      0.55,
      0.45,
      0.35,
      0.3,
      0.8,
      0.5,
      0.12,
      0,
      0.15,
      0.02,
      0,
      0,
      0,
      0.65,
      8,
      1,
      0.2,
      0,
      0.6,
      0.35,
      0,
      0,
      -1,
      0.03
    ]
  },
  // ═══════════════════════════════════════════════════════════
  // KEYS / PLUCKS
  // ═══════════════════════════════════════════════════════════
  {
    name: "Electric Piano",
    values: [
      2,
      0,
      0,
      0.5,
      0.8,
      2,
      1,
      0.01,
      0.5,
      0.4,
      0,
      0,
      0,
      0.5,
      0.1,
      0,
      0.3,
      0.3,
      0.4,
      0.01,
      0.3,
      0.2,
      0.25,
      0.01,
      0.4,
      0.5,
      0.35,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0.7,
      8,
      0,
      0.1,
      0,
      0.4,
      0.5,
      0,
      0,
      -1,
      0.01
    ]
  },
  {
    name: "Pluck",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      0,
      0.03,
      0.5,
      0.6,
      0,
      0,
      0,
      0.6,
      0.2,
      0,
      0.65,
      0.3,
      0.3,
      0.01,
      0.15,
      0.1,
      0.12,
      0.01,
      0.2,
      0.3,
      0.2,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0.7,
      8,
      0,
      0.1,
      0,
      0.3,
      0.5,
      0,
      0,
      -1,
      0.02
    ]
  },
  {
    name: "Harpsichord",
    values: [
      1,
      0,
      0,
      0.4,
      1,
      1,
      1,
      0,
      0.6,
      0.5,
      0,
      0,
      0,
      0.55,
      0.15,
      0,
      0.7,
      0.4,
      0.5,
      0.01,
      0.1,
      0.05,
      0.08,
      0.01,
      0.12,
      0.2,
      0.15,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0.7,
      8,
      0,
      0.1,
      0,
      0.3,
      0.6,
      0,
      0,
      -1,
      0.01
    ]
  },
  // ═══════════════════════════════════════════════════════════
  // FX / EXPERIMENTAL
  // ═══════════════════════════════════════════════════════════
  {
    name: "XOR Metallic",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      0,
      0.15,
      0.5,
      1,
      0,
      0,
      1,
      0.45,
      0.4,
      0,
      0.5,
      0.2,
      0.3,
      0.01,
      0.2,
      0.25,
      0.2,
      0.01,
      0.15,
      0.7,
      0.25,
      0.3,
      2,
      0,
      0.1,
      0.1,
      0,
      0,
      0.65,
      8,
      0,
      0.1,
      0,
      0.3,
      0.4,
      0,
      0,
      -1,
      0.04
    ]
  },
  {
    name: "Noise Sweep",
    values: [
      3,
      0,
      0,
      0.5,
      0.8,
      0,
      0,
      0,
      0.5,
      0.5,
      0,
      0,
      0,
      0.15,
      0.5,
      0,
      0.9,
      0,
      0,
      0.3,
      0.8,
      0.3,
      0.6,
      0.5,
      0.6,
      0.6,
      0.8,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0.65,
      8,
      0,
      0.1,
      0,
      0.4,
      0.2,
      0.5,
      0,
      -1,
      0.02
    ]
  },
  {
    name: "S&H Random",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      1,
      0,
      0.08,
      0.5,
      0.7,
      0,
      0,
      0,
      0.35,
      0.3,
      0,
      0.4,
      0.2,
      0.2,
      0.01,
      0.2,
      0.3,
      0.2,
      0.01,
      0.15,
      0.7,
      0.25,
      0.5,
      4,
      0,
      0,
      0.4,
      0,
      0.2,
      0.65,
      8,
      0,
      0.1,
      0,
      0.3,
      0.4,
      0,
      0,
      -1,
      0.03
    ]
  },
  {
    name: "PWM Evolve",
    values: [
      1,
      0,
      0,
      0.3,
      1,
      1,
      0,
      0.02,
      0.7,
      0.9,
      0,
      0,
      0,
      0.4,
      0.15,
      0,
      0.25,
      0.1,
      0.2,
      0.4,
      0.5,
      0.45,
      0.5,
      0.5,
      0.4,
      0.75,
      0.7,
      0.2,
      0,
      0,
      0,
      0,
      0,
      0.6,
      0.7,
      8,
      0,
      0.1,
      0,
      0.4,
      0.3,
      0,
      0,
      -1,
      0.02
    ]
  },
  {
    name: "Resonant Sweep",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      0,
      0.06,
      0.5,
      0.8,
      0,
      0,
      0,
      0.15,
      0.75,
      0,
      0.85,
      0.3,
      0.3,
      0.2,
      0.6,
      0.2,
      0.5,
      0.3,
      0.4,
      0.7,
      0.6,
      0.1,
      0,
      0,
      0,
      0.2,
      0,
      0,
      0.65,
      8,
      0,
      0.1,
      0,
      0.3,
      0.4,
      0,
      0,
      -1,
      0.02
    ]
  },
  {
    name: "Bandpass Drone",
    values: [
      0,
      -1,
      0,
      0.5,
      0.9,
      0,
      0,
      0.07,
      0.5,
      0.9,
      0,
      0,
      0,
      0.4,
      0.6,
      3,
      0.1,
      0,
      0,
      0.01,
      0.3,
      0.5,
      0.4,
      0.8,
      0.2,
      0.9,
      0.8,
      0.08,
      2,
      0,
      0.03,
      0.05,
      0,
      0,
      0.6,
      8,
      0,
      0.2,
      0,
      0.6,
      0.2,
      0.15,
      0.3,
      -1,
      0.04
    ]
  },
  // ═══════════════════════════════════════════════════════════
  // UNISON / DETUNED
  // ═══════════════════════════════════════════════════════════
  {
    name: "Supersaw",
    values: [
      0,
      0,
      0,
      0.5,
      1,
      0,
      0,
      0.12,
      0.5,
      1,
      0,
      0,
      0,
      0.55,
      0.15,
      0,
      0.3,
      0.15,
      0.2,
      0.01,
      0.25,
      0.4,
      0.3,
      0.01,
      0.15,
      0.8,
      0.3,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0.7,
      8,
      1,
      0.3,
      0,
      0.5,
      0.4,
      0,
      0,
      -1,
      0.04
    ]
  },
  {
    name: "Unison Hoover",
    values: [
      0,
      -1,
      0,
      0.5,
      1,
      0,
      0,
      0.1,
      0.5,
      0.8,
      0,
      0,
      0,
      0.4,
      0.3,
      0,
      0.5,
      0.1,
      0.3,
      0.01,
      0.2,
      0.2,
      0.2,
      0.01,
      0.15,
      0.75,
      0.2,
      0.3,
      0,
      0,
      0.05,
      0.1,
      0,
      0,
      0.7,
      8,
      1,
      0.35,
      0.05,
      0.4,
      0.5,
      0,
      0.2,
      -1,
      0.05
    ]
  },
  {
    name: "Thick Unison Pad",
    values: [
      0,
      0,
      0,
      0.5,
      0.85,
      1,
      0,
      0.04,
      0.45,
      0.85,
      0,
      0,
      0,
      0.35,
      0.15,
      0,
      0.2,
      0.1,
      0.15,
      0.5,
      0.5,
      0.5,
      0.6,
      0.6,
      0.4,
      0.8,
      0.8,
      0.1,
      0,
      0,
      0,
      0.04,
      0,
      0.15,
      0.65,
      8,
      1,
      0.25,
      0,
      0.6,
      0.3,
      0,
      0,
      -1,
      0.04
    ]
  }
];
const OBXF_ID_TO_OBXD = {
  // Master
  Volume: 34,
  // MASTER_VOLUME
  // Global
  Polyphony: 35,
  // VOICES
  Portamento: 38,
  // PORTAMENTO
  Unison: 36,
  // UNISON
  UnisonDetune: 37,
  // UNISON_DETUNE
  // Oscillators
  Osc1Pitch: 1,
  // OSC1_OCTAVE (semitone → octave, both 0-1 normalized)
  Osc2Detune: 7,
  // OSC2_DETUNE
  Osc2Pitch: 6,
  // OSC2_OCTAVE
  OscPW: 3,
  // OSC1_PW
  Osc2PWOffset: 8,
  // OSC2_PW
  OscSync: 11,
  // OSC_SYNC
  // Mixer
  Osc1Mix: 4,
  // OSC1_LEVEL
  Osc2Mix: 9,
  // OSC2_LEVEL
  NoiseMix: 41,
  // NOISE_LEVEL
  // Filter
  FilterCutoff: 13,
  // FILTER_CUTOFF
  FilterResonance: 14,
  // FILTER_RESONANCE
  FilterEnvAmount: 16,
  // FILTER_ENV_AMOUNT
  FilterKeyFollow: 17,
  // FILTER_KEY_TRACK
  Filter4PoleMode: 15,
  // FILTER_TYPE
  // Filter Envelope
  FilterEnvAttack: 19,
  // FILTER_ATTACK
  FilterEnvDecay: 20,
  // FILTER_DECAY
  FilterEnvSustain: 21,
  // FILTER_SUSTAIN
  FilterEnvRelease: 22,
  // FILTER_RELEASE
  VelToFilterEnv: 18,
  // FILTER_VELOCITY
  // Amp Envelope
  AmpEnvAttack: 23,
  // AMP_ATTACK
  AmpEnvDecay: 24,
  // AMP_DECAY
  AmpEnvSustain: 25,
  // AMP_SUSTAIN
  AmpEnvRelease: 26,
  // AMP_RELEASE
  // LFO (map LFO1 → OBXd's single LFO)
  LFO1Rate: 27,
  // LFO_RATE
  LFO1ModAmount1: 30,
  // LFO_OSC_AMOUNT
  LFO1ModAmount2: 31
  // LFO_FILTER_AMOUNT
};
function blitFramebuffer$3(mod, ctx, imgData, fbWidth, fbHeight) {
  const fbPtr = mod._obxf_ui_get_fb();
  if (!fbPtr) return;
  const totalPixels = fbWidth * fbHeight;
  const src = mod.HEAPU8.subarray(fbPtr, fbPtr + totalPixels * 4);
  const dst = imgData.data;
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];
    dst[off + 1] = src[off + 1];
    dst[off + 2] = src[off];
    dst[off + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
const OBXfHardwareUI = ({
  onParamChange: _onParamChange,
  instrumentId
}) => {
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const moduleRef = reactExports.useRef(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const fbWidthRef = reactExports.useRef(1440);
  const fbHeightRef = reactExports.useRef(450);
  const canvasCoords = reactExports.useCallback(
    (canvas, e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return [
        Math.floor((e.clientX - rect.left) * scaleX),
        Math.floor((e.clientY - rect.top) * scaleY)
      ];
    },
    []
  );
  const getModifiers = reactExports.useCallback((e) => {
    let mods = 0;
    if (e.shiftKey) mods |= 1;
    if (e.ctrlKey) mods |= 2;
    if (e.altKey) mods |= 4;
    if (e.metaKey) mods |= 8;
    if (e.buttons & 1) mods |= 16;
    return mods;
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups = [];
    const init = async () => {
      try {
        const factory = await new Promise((resolve, reject) => {
          const existing = window.createOBXfUIModule;
          if (typeof existing === "function") {
            resolve(existing);
            return;
          }
          const script = document.createElement("script");
          script.src = "/obxf/OBXfUI.js";
          script.onload = () => {
            const fn = window.createOBXfUIModule;
            if (typeof fn === "function") {
              resolve(fn);
            } else {
              reject(new Error("createOBXfUIModule not found on window"));
            }
          };
          script.onerror = () => reject(new Error("Failed to load OBXfUI.js"));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        const m = await factory({
          onAbort: (what) => {
            console.error("[OBXfHardwareUI] WASM abort:", what);
          }
        });
        if (cancelled) {
          m._obxf_ui_shutdown();
          return;
        }
        moduleRef.current = m;
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (cancelled) {
          m._obxf_ui_shutdown();
          return;
        }
        m._obxf_ui_init();
        window._obxdPresetNames = OBXD_NATIVE_PRESETS.map((p) => p.name);
        if (m._obxf_ui_populate_presets) m._obxf_ui_populate_presets();
        const w = m._obxf_ui_get_width();
        const h = m._obxf_ui_get_height();
        fbWidthRef.current = w;
        fbHeightRef.current = h;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const nativeW = fbWidthRef.current;
        const nativeH = fbHeightRef.current;
        const updateCanvasCSS = () => {
          const container = containerRef.current;
          if (!container) return;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const s = Math.min(cw / nativeW, ch / nativeH);
          canvas.style.width = `${Math.floor(nativeW * s)}px`;
          canvas.style.height = `${Math.floor(nativeH * s)}px`;
        };
        updateCanvasCSS();
        const ro = new ResizeObserver(updateCanvasCSS);
        if (containerRef.current) ro.observe(containerRef.current);
        eventCleanups.push(() => ro.disconnect());
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const imgData = ctx.createImageData(w, h);
        const onMouseDown = (e) => {
          e.preventDefault();
          canvas.focus();
          const [cx, cy] = canvasCoords(canvas, e);
          m._obxf_ui_on_mouse_down(cx, cy, getModifiers(e));
        };
        const onMouseUp = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._obxf_ui_on_mouse_up(cx, cy, getModifiers(e));
        };
        const onMouseMove = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._obxf_ui_on_mouse_move(cx, cy, getModifiers(e));
        };
        const onWheel = (e) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._obxf_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
        };
        canvas.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        eventCleanups.push(
          () => canvas.removeEventListener("mousedown", onMouseDown),
          () => document.removeEventListener("mouseup", onMouseUp),
          () => document.removeEventListener("mousemove", onMouseMove),
          () => canvas.removeEventListener("wheel", onWheel)
        );
        window._obxfUIParamCallback = (paramIndex, normalizedValue) => {
          if (!instrumentId) return;
          const paramIds = window._obxfParamIds;
          if (!paramIds || paramIndex < 0 || paramIndex >= paramIds.length) return;
          const obxfId = paramIds[paramIndex];
          const obxdParamId = OBXF_ID_TO_OBXD[obxfId];
          if (obxdParamId === void 0) return;
          try {
            const engine = getToneEngine();
            const instruments = engine.instruments;
            const key = instrumentId << 16 | 65535;
            const synth = instruments == null ? void 0 : instruments.get(key);
            if (synth == null ? void 0 : synth._worklet) {
              synth._worklet.port.postMessage({
                type: "parameter",
                paramId: obxdParamId,
                value: normalizedValue
              });
            }
          } catch {
          }
        };
        window._obxfUIMidiCallback = (type, note, vel) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            const instruments = engine.instruments;
            const key = instrumentId << 16 | 65535;
            const synth = instruments == null ? void 0 : instruments.get(key);
            if (!(synth == null ? void 0 : synth._worklet)) return;
            if (type === "noteOn") {
              synth._worklet.port.postMessage({ type: "noteOn", note, velocity: vel });
            } else if (type === "noteOff") {
              synth._worklet.port.postMessage({ type: "noteOff", note });
            }
          } catch {
          }
        };
        window._obxfUIProgramCallback = (presetIndex) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            const instruments = engine.instruments;
            const key = instrumentId << 16 | 65535;
            const synth = instruments == null ? void 0 : instruments.get(key);
            if (!(synth == null ? void 0 : synth._worklet)) return;
            const idx = presetIndex < 0 ? 0 : presetIndex;
            const preset = OBXD_NATIVE_PRESETS[idx];
            if (preset) {
              synth._worklet.port.postMessage({
                type: "loadPatch",
                values: preset.values
              });
            }
          } catch {
          }
        };
        eventCleanups.push(() => {
          delete window._obxfUIParamCallback;
          delete window._obxfUIMidiCallback;
          delete window._obxfUIProgramCallback;
          delete window._obxfParamIds;
          delete window._obxdPresetNames;
        });
        setLoaded(true);
        let lastFrameTime = 0;
        const FRAME_INTERVAL = 1e3 / 30;
        const renderLoop = (now) => {
          if (cancelled) return;
          rafId = requestAnimationFrame(renderLoop);
          if (now - lastFrameTime < FRAME_INTERVAL) return;
          lastFrameTime = now;
          if (m._obxf_ui_tick) m._obxf_ui_tick();
          blitFramebuffer$3(m, ctx, imgData, w, h);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error("[OBXfHardwareUI] Init failed:", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    init();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());
      if (instrumentId) {
        try {
          const engine = getToneEngine();
          const instruments = engine.instruments;
          const key = instrumentId << 16 | 65535;
          const synth = instruments == null ? void 0 : instruments.get(key);
          if (synth == null ? void 0 : synth._worklet) {
            synth._worklet.port.postMessage({ type: "allNotesOff" });
          }
        } catch {
        }
      }
      if (moduleRef.current) {
        moduleRef.current._obxf_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers, instrumentId]);
  if (error) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#ff6666", fontFamily: "monospace" }, children: [
      "[OBXfHardwareUI] Error: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OBXfHardwareUI.tsx",
      lineNumber: 420,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a1a",
        width: "100%",
        height: "100%",
        overflow: "hidden"
      },
      children: [
        !loaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#888", fontFamily: "monospace" }, children: "Loading OB-Xf hardware UI..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OBXfHardwareUI.tsx",
          lineNumber: 440,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: canvasRef,
            tabIndex: 0,
            style: {
              display: loaded ? "block" : "none",
              cursor: "default"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OBXfHardwareUI.tsx",
            lineNumber: 444,
            columnNumber: 7
          },
          void 0
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OBXfHardwareUI.tsx",
      lineNumber: 427,
      columnNumber: 5
    },
    void 0
  );
};
function blitFramebuffer$2(mod, ctx, imgData, fbWidth, fbHeight) {
  const fbPtr = mod._odin2_ui_get_fb();
  if (!fbPtr) return;
  const totalPixels = fbWidth * fbHeight;
  const src = mod.HEAPU8.subarray(fbPtr, fbPtr + totalPixels * 4);
  const dst = imgData.data;
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];
    dst[off + 1] = src[off + 1];
    dst[off + 2] = src[off];
    dst[off + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
const Odin2HardwareUI = ({
  onParamChange: _onParamChange,
  instrumentId
}) => {
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const moduleRef = reactExports.useRef(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const fbWidthRef = reactExports.useRef(1200);
  const fbHeightRef = reactExports.useRef(924);
  const canvasCoords = reactExports.useCallback(
    (canvas, e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return [
        Math.floor((e.clientX - rect.left) * scaleX),
        Math.floor((e.clientY - rect.top) * scaleY)
      ];
    },
    []
  );
  const getModifiers = reactExports.useCallback((e) => {
    let mods = 0;
    if (e.shiftKey) mods |= 1;
    if (e.ctrlKey) mods |= 2;
    if (e.altKey) mods |= 4;
    if (e.metaKey) mods |= 8;
    if (e.buttons & 1) mods |= 16;
    return mods;
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups = [];
    const init = async () => {
      try {
        const factory = await new Promise((resolve, reject) => {
          const existing = window.createOdin2UIModule;
          if (typeof existing === "function") {
            resolve(existing);
            return;
          }
          const script = document.createElement("script");
          script.src = "/odin2/Odin2UI.js";
          script.onload = () => {
            const fn = window.createOdin2UIModule;
            if (typeof fn === "function") {
              resolve(fn);
            } else {
              reject(new Error("createOdin2UIModule not found on window"));
            }
          };
          script.onerror = () => reject(new Error("Failed to load Odin2UI.js"));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        const m = await factory({
          onAbort: (what) => {
            console.error("[Odin2HardwareUI] WASM abort:", what);
          }
        });
        if (cancelled) {
          m._odin2_ui_shutdown();
          return;
        }
        moduleRef.current = m;
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (cancelled) {
          m._odin2_ui_shutdown();
          return;
        }
        m._odin2_ui_init();
        const w = m._odin2_ui_get_width();
        const h = m._odin2_ui_get_height();
        fbWidthRef.current = w;
        fbHeightRef.current = h;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const nativeW = w;
        const nativeH = h;
        const updateCanvasCSS = () => {
          const container = containerRef.current;
          if (!container) return;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const s = Math.min(cw / nativeW, ch / nativeH);
          canvas.style.width = `${Math.floor(nativeW * s)}px`;
          canvas.style.height = `${Math.floor(nativeH * s)}px`;
        };
        updateCanvasCSS();
        const ro = new ResizeObserver(updateCanvasCSS);
        if (containerRef.current) ro.observe(containerRef.current);
        eventCleanups.push(() => ro.disconnect());
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const imgData = ctx.createImageData(w, h);
        const onMouseDown = (e) => {
          e.preventDefault();
          canvas.focus();
          const [cx, cy] = canvasCoords(canvas, e);
          m._odin2_ui_on_mouse_down(cx, cy, getModifiers(e));
        };
        const onMouseUp = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._odin2_ui_on_mouse_up(cx, cy, getModifiers(e));
        };
        const onMouseMove = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._odin2_ui_on_mouse_move(cx, cy, getModifiers(e));
        };
        const onWheel = (e) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._odin2_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
        };
        canvas.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        eventCleanups.push(
          () => canvas.removeEventListener("mousedown", onMouseDown),
          () => document.removeEventListener("mouseup", onMouseUp),
          () => document.removeEventListener("mousemove", onMouseMove),
          () => canvas.removeEventListener("wheel", onWheel)
        );
        window._odin2UIParamCallback = (paramIndex, normalizedValue) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            const instruments = engine.instruments;
            const key = instrumentId << 16 | 65535;
            const synth = instruments == null ? void 0 : instruments.get(key);
            if (synth == null ? void 0 : synth._worklet) {
              synth._worklet.port.postMessage({
                type: "parameter",
                paramId: paramIndex,
                value: normalizedValue
              });
            }
          } catch {
          }
        };
        eventCleanups.push(() => {
          delete window._odin2UIParamCallback;
          delete window._odin2ParamIds;
        });
        setLoaded(true);
        let lastFrameTime = 0;
        const FRAME_INTERVAL = 1e3 / 30;
        const renderLoop = (now) => {
          if (cancelled) return;
          rafId = requestAnimationFrame(renderLoop);
          if (now - lastFrameTime < FRAME_INTERVAL) return;
          lastFrameTime = now;
          if (m._odin2_ui_tick) m._odin2_ui_tick();
          blitFramebuffer$2(m, ctx, imgData, w, h);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error("[Odin2HardwareUI] Init failed:", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    init();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());
      if (instrumentId) {
        try {
          const engine = getToneEngine();
          const instruments = engine.instruments;
          const key = instrumentId << 16 | 65535;
          const synth = instruments == null ? void 0 : instruments.get(key);
          if (synth == null ? void 0 : synth._worklet) {
            synth._worklet.port.postMessage({ type: "allNotesOff" });
          }
        } catch {
        }
      }
      if (moduleRef.current) {
        moduleRef.current._odin2_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers, instrumentId]);
  if (error) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#ff6666", fontFamily: "monospace" }, children: [
      "[Odin2HardwareUI] Error: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/Odin2HardwareUI.tsx",
      lineNumber: 306,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a1a",
        width: "100%",
        height: "100%",
        overflow: "hidden"
      },
      children: [
        !loaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#888", fontFamily: "monospace" }, children: "Loading Odin2 hardware UI..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/Odin2HardwareUI.tsx",
          lineNumber: 326,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: canvasRef,
            tabIndex: 0,
            style: {
              display: loaded ? "block" : "none",
              cursor: "default"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/Odin2HardwareUI.tsx",
            lineNumber: 330,
            columnNumber: 7
          },
          void 0
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/Odin2HardwareUI.tsx",
      lineNumber: 313,
      columnNumber: 5
    },
    void 0
  );
};
function blitFramebuffer$1(mod, ctx, imgData, fbWidth, fbHeight) {
  const fbPtr = mod._helm_ui_get_fb();
  if (!fbPtr) return;
  const totalPixels = fbWidth * fbHeight;
  const src = mod.HEAPU8.subarray(fbPtr, fbPtr + totalPixels * 4);
  const dst = imgData.data;
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];
    dst[off + 1] = src[off + 1];
    dst[off + 2] = src[off];
    dst[off + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
const HelmHardwareUI = ({
  onParamChange: _onParamChange,
  instrumentId
}) => {
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const moduleRef = reactExports.useRef(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const canvasCoords = reactExports.useCallback(
    (canvas, e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return [
        Math.floor((e.clientX - rect.left) * scaleX),
        Math.floor((e.clientY - rect.top) * scaleY)
      ];
    },
    []
  );
  const getModifiers = reactExports.useCallback((e) => {
    let mods = 0;
    if (e.shiftKey) mods |= 1;
    if (e.ctrlKey) mods |= 2;
    if (e.altKey) mods |= 4;
    if (e.metaKey) mods |= 8;
    if (e.buttons & 1) mods |= 16;
    return mods;
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups = [];
    const init = async () => {
      try {
        const factory = await new Promise((resolve, reject) => {
          const existing = window.createHelmUIModule;
          if (typeof existing === "function") {
            resolve(existing);
            return;
          }
          const script = document.createElement("script");
          script.src = "/helm/HelmUI.js";
          script.onload = () => {
            const fn = window.createHelmUIModule;
            if (typeof fn === "function") {
              resolve(fn);
            } else {
              reject(new Error("createHelmUIModule not found on window"));
            }
          };
          script.onerror = () => reject(new Error("Failed to load HelmUI.js"));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        const m = await factory({
          onAbort: (what) => {
            console.error("[HelmHardwareUI] WASM abort:", what);
          }
        });
        if (cancelled) {
          m._helm_ui_shutdown();
          return;
        }
        moduleRef.current = m;
        m._helm_ui_init();
        const w = m._helm_ui_get_width();
        const h = m._helm_ui_get_height();
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const updateCanvasCSS = () => {
          const container = containerRef.current;
          if (!container || !canvas) return;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const s = Math.min(cw / w, ch / h);
          canvas.style.width = `${Math.floor(w * s)}px`;
          canvas.style.height = `${Math.floor(h * s)}px`;
        };
        updateCanvasCSS();
        const ro = new ResizeObserver(updateCanvasCSS);
        if (containerRef.current) ro.observe(containerRef.current);
        eventCleanups.push(() => ro.disconnect());
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const imgData = ctx.createImageData(w, h);
        const onMouseDown = (e) => {
          e.preventDefault();
          canvas.focus();
          const [cx, cy] = canvasCoords(canvas, e);
          m._helm_ui_on_mouse_down(cx, cy, getModifiers(e));
        };
        const onMouseUp = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._helm_ui_on_mouse_up(cx, cy, getModifiers(e));
        };
        const onMouseMove = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._helm_ui_on_mouse_move(cx, cy, getModifiers(e));
        };
        const onWheel = (e) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._helm_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
        };
        canvas.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        eventCleanups.push(
          () => canvas.removeEventListener("mousedown", onMouseDown),
          () => document.removeEventListener("mouseup", onMouseUp),
          () => document.removeEventListener("mousemove", onMouseMove),
          () => canvas.removeEventListener("wheel", onWheel)
        );
        window._helmUIParamCallback = (paramIndex, normalizedValue) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            const instruments = engine.instruments;
            const key = instrumentId << 16 | 65535;
            const synth = instruments == null ? void 0 : instruments.get(key);
            if (synth == null ? void 0 : synth._worklet) {
              synth._worklet.port.postMessage({
                type: "parameter",
                paramId: paramIndex,
                value: normalizedValue
              });
            }
          } catch {
          }
        };
        eventCleanups.push(() => {
          delete window._helmUIParamCallback;
        });
        setLoaded(true);
        let lastFrameTime = 0;
        const FRAME_INTERVAL = 1e3 / 30;
        const renderLoop = (now) => {
          if (cancelled) return;
          rafId = requestAnimationFrame(renderLoop);
          if (now - lastFrameTime < FRAME_INTERVAL) return;
          lastFrameTime = now;
          if (m._helm_ui_tick) m._helm_ui_tick();
          blitFramebuffer$1(m, ctx, imgData, w, h);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error("[HelmHardwareUI] Init failed:", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    init();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());
      if (moduleRef.current) {
        moduleRef.current._helm_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers, instrumentId]);
  if (error) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#ff6666", fontFamily: "monospace" }, children: [
      "[HelmHardwareUI] Error: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HelmHardwareUI.tsx",
      lineNumber: 268,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a1a",
        width: "100%",
        height: "100%",
        overflow: "hidden"
      },
      children: [
        !loaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#888", fontFamily: "monospace" }, children: "Loading Helm hardware UI..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HelmHardwareUI.tsx",
          lineNumber: 288,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: canvasRef,
            tabIndex: 0,
            style: {
              display: loaded ? "block" : "none",
              cursor: "default"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HelmHardwareUI.tsx",
            lineNumber: 292,
            columnNumber: 7
          },
          void 0
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HelmHardwareUI.tsx",
      lineNumber: 275,
      columnNumber: 5
    },
    void 0
  );
};
function blitFramebuffer(mod, ctx, imgData, fbWidth, fbHeight) {
  const fbPtr = mod._surge_ui_get_fb();
  if (!fbPtr) return;
  const totalPixels = fbWidth * fbHeight;
  const src = mod.HEAPU8.subarray(fbPtr, fbPtr + totalPixels * 4);
  const dst = imgData.data;
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];
    dst[off + 1] = src[off + 1];
    dst[off + 2] = src[off];
    dst[off + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
const SurgeHardwareUI = ({
  onParamChange: _onParamChange,
  instrumentId
}) => {
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const moduleRef = reactExports.useRef(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const canvasCoords = reactExports.useCallback(
    (canvas, e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return [
        Math.floor((e.clientX - rect.left) * scaleX),
        Math.floor((e.clientY - rect.top) * scaleY)
      ];
    },
    []
  );
  const getModifiers = reactExports.useCallback((e) => {
    let mods = 0;
    if (e.shiftKey) mods |= 1;
    if (e.ctrlKey) mods |= 2;
    if (e.altKey) mods |= 4;
    if (e.metaKey) mods |= 8;
    if (e.buttons & 1) mods |= 16;
    return mods;
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups = [];
    const init = async () => {
      try {
        const factory = await new Promise((resolve, reject) => {
          const existing = window.createSurgeUI;
          if (typeof existing === "function") {
            resolve(existing);
            return;
          }
          const script = document.createElement("script");
          script.src = "/surge/SurgeUI.js";
          script.onload = () => {
            const fn = window.createSurgeUI;
            if (typeof fn === "function") {
              resolve(fn);
            } else {
              reject(new Error("createSurgeUI not found on window"));
            }
          };
          script.onerror = () => reject(new Error("Failed to load SurgeUI.js"));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        const m = await factory({
          onAbort: (what) => {
            console.error("[SurgeHardwareUI] WASM abort:", what);
          }
        });
        if (cancelled) {
          m._surge_ui_shutdown();
          return;
        }
        moduleRef.current = m;
        m._surge_ui_init();
        const w = m._surge_ui_get_width();
        const h = m._surge_ui_get_height();
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const updateCanvasCSS = () => {
          const container = containerRef.current;
          if (!container || !canvas) return;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const s = Math.min(cw / w, ch / h);
          canvas.style.width = `${Math.floor(w * s)}px`;
          canvas.style.height = `${Math.floor(h * s)}px`;
        };
        updateCanvasCSS();
        const ro = new ResizeObserver(updateCanvasCSS);
        if (containerRef.current) ro.observe(containerRef.current);
        eventCleanups.push(() => ro.disconnect());
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const imgData = ctx.createImageData(w, h);
        const onMouseDown = (e) => {
          e.preventDefault();
          canvas.focus();
          const [cx, cy] = canvasCoords(canvas, e);
          m._surge_ui_on_mouse_down(cx, cy, getModifiers(e));
        };
        const onMouseUp = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._surge_ui_on_mouse_up(cx, cy, getModifiers(e));
        };
        const onMouseMove = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._surge_ui_on_mouse_move(cx, cy, getModifiers(e));
        };
        const onWheel = (e) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._surge_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
        };
        canvas.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        eventCleanups.push(
          () => canvas.removeEventListener("mousedown", onMouseDown),
          () => document.removeEventListener("mouseup", onMouseUp),
          () => document.removeEventListener("mousemove", onMouseMove),
          () => canvas.removeEventListener("wheel", onWheel)
        );
        window._surgeUIParamCallback = (paramIndex, normalizedValue) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            const instruments = engine.instruments;
            const key = instrumentId << 16 | 65535;
            const synth = instruments == null ? void 0 : instruments.get(key);
            if (synth == null ? void 0 : synth._worklet) {
              synth._worklet.port.postMessage({
                type: "parameter",
                paramId: paramIndex,
                value: normalizedValue
              });
            }
          } catch {
          }
        };
        eventCleanups.push(() => {
          delete window._surgeUIParamCallback;
        });
        setLoaded(true);
        let lastFrameTime = 0;
        const FRAME_INTERVAL = 1e3 / 30;
        const renderLoop = (now) => {
          if (cancelled) return;
          rafId = requestAnimationFrame(renderLoop);
          if (now - lastFrameTime < FRAME_INTERVAL) return;
          lastFrameTime = now;
          if (m._surge_ui_tick) m._surge_ui_tick();
          blitFramebuffer(m, ctx, imgData, w, h);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error("[SurgeHardwareUI] Init failed:", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    init();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());
      if (moduleRef.current) {
        moduleRef.current._surge_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers, instrumentId]);
  if (error) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#ff6666", fontFamily: "monospace" }, children: [
      "[SurgeHardwareUI] Error: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SurgeHardwareUI.tsx",
      lineNumber: 268,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a1a",
        width: "100%",
        height: "100%",
        overflow: "hidden"
      },
      children: [
        !loaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 16, color: "#888", fontFamily: "monospace" }, children: "Loading Surge XT hardware UI..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SurgeHardwareUI.tsx",
          lineNumber: 288,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: canvasRef,
            tabIndex: 0,
            style: {
              display: loaded ? "block" : "none",
              cursor: "default"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SurgeHardwareUI.tsx",
            lineNumber: 292,
            columnNumber: 7
          },
          void 0
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SurgeHardwareUI.tsx",
      lineNumber: 275,
      columnNumber: 5
    },
    void 0
  );
};
const COLORS = {
  body: "#C0C0C0",
  bodyDark: "#A8A8A8",
  bodyBorder: "#888",
  lcd: "#B8C890",
  lcdText: "#2A3020",
  lcdBorder: "#707860",
  orange: "#E86420",
  orangeHover: "#F07830",
  orangeActive: "#D05818",
  orangeText: "#FFF",
  grayKey: "#E0E0E0",
  grayKeyHover: "#EAEAEA",
  grayKeyActive: "#CCC",
  grayKeyBorder: "#999",
  blackKey: "#333",
  blackKeyHover: "#444",
  blackKeyActive: "#222",
  labelText: "#444",
  speakerDot: "#999",
  speakerBg: "#B0B0B0",
  redLed: "#FF2200",
  darkText: "#222"
};
const SOUND_NAMES = [
  "Piano",
  "Fantasy",
  "Violin",
  "Flute",
  "Guitar",
  "Guitar 2",
  "Eng.Horn",
  "E.Piano",
  "E.Fantasy",
  "E.Violin"
];
const RHYTHM_NAMES = [
  "March",
  "Waltz",
  "Swing",
  "4 Beat",
  "Rock 1",
  "Rock 2",
  "Bossa",
  "Samba",
  "Rhumba",
  "Beguine"
];
const ADSR_PARAMS = ["attack", "decay", "sustainLevel", "sustainTime", "release"];
const VL1Button = ({ label, active, color = "gray", onClick, small }) => {
  const bg = color === "orange" ? active ? COLORS.orangeActive : COLORS.orange : color === "black" ? active ? COLORS.blackKeyActive : COLORS.blackKey : active ? COLORS.grayKeyActive : COLORS.grayKey;
  const hoverBg = color === "orange" ? COLORS.orangeHover : color === "black" ? COLORS.blackKeyHover : COLORS.grayKeyHover;
  const textColor = color === "orange" || color === "black" ? COLORS.orangeText : COLORS.darkText;
  const border = color === "gray" ? COLORS.grayKeyBorder : "transparent";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick,
      style: {
        background: bg,
        color: textColor,
        border: `1px solid ${border}`,
        borderRadius: 3,
        padding: small ? "2px 6px" : "4px 10px",
        fontSize: small ? 9 : 10,
        fontFamily: '"Helvetica Neue", Arial, sans-serif',
        fontWeight: "bold",
        cursor: "pointer",
        minWidth: small ? 36 : 48,
        textAlign: "center",
        boxShadow: active ? "inset 0 1px 3px rgba(0,0,0,0.4)" : "0 1px 2px rgba(0,0,0,0.3)",
        transition: "all 0.1s ease",
        textTransform: "uppercase",
        letterSpacing: 0.5
      },
      onMouseEnter: (e) => {
        e.target.style.background = hoverBg;
      },
      onMouseLeave: (e) => {
        e.target.style.background = bg;
      },
      children: label
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
      lineNumber: 83,
      columnNumber: 5
    },
    void 0
  );
};
const ADSRSlider = ({ label, value, onChange }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      fontSize: 8,
      fontWeight: "bold",
      color: COLORS.labelText,
      textTransform: "uppercase",
      letterSpacing: 0.5
    }, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
      lineNumber: 121,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      position: "relative",
      width: 28,
      height: 80,
      background: COLORS.bodyDark,
      borderRadius: 3,
      border: `1px solid ${COLORS.bodyBorder}`
    }, children: [
      [0, 0.5, 1].map((t) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        position: "absolute",
        right: 2,
        top: `${(1 - t) * 85 + 5}%`,
        fontSize: 6,
        color: COLORS.labelText,
        transform: "translateY(-50%)"
      }, children: Math.round(t * 9) }, t, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 134,
        columnNumber: 11
      }, void 0)),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "range",
          min: "0",
          max: "1",
          step: "0.01",
          value,
          onChange: (e) => onChange(parseFloat(e.target.value)),
          style: {
            position: "absolute",
            left: 0,
            top: 0,
            width: 80,
            height: 28,
            transform: "rotate(-90deg) translateX(-80px)",
            transformOrigin: "top left",
            cursor: "pointer",
            accentColor: COLORS.orange
          },
          title: `${label}: ${Math.round(value * 9)}`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
          lineNumber: 141,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
      lineNumber: 127,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
    lineNumber: 120,
    columnNumber: 5
  }, void 0);
};
const SpeakerGrille = () => {
  const dots = reactExports.useMemo(() => {
    const result = [];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 8; col++) {
        result.push({ x: col * 8 + 4, y: row * 8 + 4 });
      }
    }
    return result;
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    width: 70,
    height: 52,
    background: COLORS.speakerBg,
    borderRadius: 4,
    border: `1px solid ${COLORS.bodyBorder}`,
    position: "relative",
    overflow: "hidden"
  }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { width: "70", height: "52", viewBox: "0 0 70 52", children: dots.map((d, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circle", { cx: d.x + 3, cy: d.y + 2, r: 2, fill: COLORS.speakerDot }, i, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
    lineNumber: 184,
    columnNumber: 11
  }, void 0)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
    lineNumber: 182,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
    lineNumber: 177,
    columnNumber: 5
  }, void 0);
};
const LCDDisplay = ({
  soundIndex,
  rhythmOn,
  rhythmIndex
}) => {
  const soundName = SOUND_NAMES[soundIndex] || "ADSR";
  const rhythmName = rhythmOn ? RHYTHM_NAMES[rhythmIndex] || "---" : "---";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    background: COLORS.lcd,
    border: `2px solid ${COLORS.lcdBorder}`,
    borderRadius: 4,
    padding: "6px 12px",
    fontFamily: '"Courier New", monospace',
    fontSize: 12,
    color: COLORS.lcdText,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    minWidth: 200,
    gap: 16,
    boxShadow: "inset 0 1px 4px rgba(0,0,0,0.15)"
  }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 7, opacity: 0.6 }, children: "SOUND" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 216,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontWeight: "bold", fontSize: 13, letterSpacing: 1 }, children: soundName }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 217,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
      lineNumber: 215,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { textAlign: "right" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 7, opacity: 0.6 }, children: "RHYTHM" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 220,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontWeight: "bold", fontSize: 13, letterSpacing: 1 }, children: rhythmName }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 221,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
      lineNumber: 219,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
    lineNumber: 200,
    columnNumber: 5
  }, void 0);
};
const VL1Hardware = ({ parameters, onParamChange }) => {
  const paramsRef = reactExports.useRef(parameters);
  reactExports.useEffect(() => {
    paramsRef.current = parameters;
  }, [parameters]);
  const update = reactExports.useCallback((key, value) => {
    onParamChange(key, value);
  }, [onParamChange]);
  const soundIndex = Math.round((parameters.sound ?? 0) * 10);
  const rhythmIndex = Math.round((parameters.rhythm ?? 0) * 9);
  const rhythmOn = (parameters.rhythmOn ?? 0) > 0.5;
  const octaveVal = Math.round((parameters.octave ?? 0.5) * 2);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    background: `linear-gradient(180deg, ${COLORS.body} 0%, ${COLORS.bodyDark} 100%)`,
    border: `2px solid ${COLORS.bodyBorder}`,
    borderRadius: 8,
    padding: 16,
    maxWidth: 640,
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
    boxShadow: "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4)",
    userSelect: "none"
  }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SpeakerGrille, {}, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
          lineNumber: 259,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
            fontSize: 8,
            fontWeight: "bold",
            color: COLORS.labelText,
            letterSpacing: 2,
            textTransform: "uppercase"
          }, children: "CASIO" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 261,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
            fontSize: 18,
            fontWeight: "bold",
            color: COLORS.darkText,
            letterSpacing: 3,
            fontFamily: '"Courier New", monospace'
          }, children: "VL-TONE" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 267,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
            fontSize: 7,
            color: COLORS.labelText,
            letterSpacing: 1
          }, children: "VL-1" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 273,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
          lineNumber: 260,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 258,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LCDDisplay, { soundIndex, rhythmOn, rhythmIndex }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 280,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
      lineNumber: 254,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { marginBottom: 10 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        fontSize: 8,
        fontWeight: "bold",
        color: COLORS.labelText,
        marginBottom: 4,
        letterSpacing: 1
      }, children: "SOUND SELECT" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 285,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 3, flexWrap: "wrap" }, children: SOUND_NAMES.map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        VL1Button,
        {
          label: name,
          active: soundIndex === i,
          color: i >= 7 ? "orange" : "gray",
          small: true,
          onClick: () => update("sound", i / 10)
        },
        name,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
          lineNumber: 293,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 291,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
      lineNumber: 284,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      display: "flex",
      gap: 16,
      marginBottom: 10,
      alignItems: "flex-end"
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
          fontSize: 8,
          fontWeight: "bold",
          color: COLORS.orange,
          marginBottom: 4,
          letterSpacing: 1
        }, children: "A D S L   S T   R" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
          lineNumber: 311,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 6 }, children: ADSR_PARAMS.map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          ADSRSlider,
          {
            label: p === "sustainLevel" ? "SL" : p === "sustainTime" ? "ST" : p[0].toUpperCase(),
            value: parameters[p] ?? 0,
            onChange: (v) => update(p, v)
          },
          p,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 319,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
          lineNumber: 317,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 310,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          ADSRSlider,
          {
            label: "VIB",
            value: parameters.vibrato ?? 0,
            onChange: (v) => update("vibrato", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 331,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          ADSRSlider,
          {
            label: "TREM",
            value: parameters.tremolo ?? 0,
            onChange: (v) => update("tremolo", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 336,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 330,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", gap: 3 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
          fontSize: 8,
          fontWeight: "bold",
          color: COLORS.labelText,
          letterSpacing: 1
        }, children: "OCTAVE" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
          lineNumber: 345,
          columnNumber: 11
        }, void 0),
        ["LOW", "MID", "HIGH"].map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          VL1Button,
          {
            label: name,
            active: octaveVal === i,
            color: octaveVal === i ? "orange" : "gray",
            small: true,
            onClick: () => update("octave", i / 2)
          },
          name,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 352,
            columnNumber: 13
          },
          void 0
        ))
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 344,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          ADSRSlider,
          {
            label: "TUNE",
            value: parameters.tune ?? 0.5,
            onChange: (v) => update("tune", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 365,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          ADSRSlider,
          {
            label: "VOL",
            value: parameters.volume ?? 0.7,
            onChange: (v) => update("volume", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 370,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          ADSRSlider,
          {
            label: "BAL",
            value: parameters.balance ?? 0.5,
            onChange: (v) => update("balance", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 375,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 364,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
      lineNumber: 306,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      display: "flex",
      gap: 12,
      alignItems: "flex-end",
      marginBottom: 8
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
          fontSize: 8,
          fontWeight: "bold",
          color: COLORS.labelText,
          marginBottom: 4,
          letterSpacing: 1
        }, children: "RHYTHM" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
          lineNumber: 388,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 400 }, children: RHYTHM_NAMES.map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          VL1Button,
          {
            label: name,
            active: rhythmOn && rhythmIndex === i,
            color: rhythmOn && rhythmIndex === i ? "orange" : "gray",
            small: true,
            onClick: () => {
              update("rhythm", i / 9);
              if (!rhythmOn) update("rhythmOn", 1);
            }
          },
          name,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 396,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
          lineNumber: 394,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 387,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", gap: 3 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          VL1Button,
          {
            label: rhythmOn ? "■ STOP" : "▶ START",
            active: rhythmOn,
            color: rhythmOn ? "orange" : "black",
            onClick: () => update("rhythmOn", rhythmOn ? 0 : 1)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 413,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          ADSRSlider,
          {
            label: "TEMPO",
            value: parameters.tempo ?? 0.5,
            onChange: (v) => update("tempo", v)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
            lineNumber: 419,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 412,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: COLORS.redLed,
        boxShadow: `0 0 6px ${COLORS.redLed}`,
        marginBottom: 4
      } }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
        lineNumber: 427,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
      lineNumber: 384,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/VL1Hardware.tsx",
    lineNumber: 243,
    columnNumber: 5
  }, void 0);
};
const V2Knob = ({ label, value, min = 0, max = 127, color = "#33ccff", onChange }) => {
  const norm = (value - min) / (max - min);
  const angle = -135 + norm * 270;
  const handleWheel = (e) => {
    e.preventDefault();
    const step = (max - min) / 50;
    const newVal = Math.max(min, Math.min(max, value + (e.deltaY < 0 ? step : -step)));
    onChange(Math.round(newVal));
  };
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    const onMove = (ev) => {
      const delta = (startY - ev.clientY) * (max - min) / 150;
      onChange(Math.round(Math.max(min, Math.min(max, startVal + delta))));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5 w-12", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "w-8 h-8 rounded-full border-2 cursor-pointer relative",
        style: { borderColor: color, background: "#1a1a2e" },
        onWheel: handleWheel,
        onMouseDown: handleMouseDown,
        title: `${label}: ${Math.round(value)}`,
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "absolute w-0.5 h-3 rounded-full",
            style: { background: color, top: "2px", left: "50%", transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: "bottom center" }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 55,
            columnNumber: 9
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
        lineNumber: 48,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-bold uppercase tracking-wide text-center", style: { color }, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
      lineNumber: 60,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] text-text-muted font-mono", children: Math.round(value) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
      lineNumber: 61,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
    lineNumber: 47,
    columnNumber: 5
  }, void 0);
};
const SectionLabel = ({ label, color = "#33ccff" }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-bold uppercase tracking-[0.2em] mb-1 pb-0.5 border-b", style: { color, borderColor: `${color}40` }, children: label }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
  lineNumber: 67,
  columnNumber: 3
}, void 0);
const V2Hardware = ({ parameters, onParamChange }) => {
  const p = (key, def = 64) => parameters[key] ?? def;
  const set = (key) => (v) => onParamChange(key, v);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "rounded-lg overflow-hidden shadow-2xl", style: { background: "linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 50%, #0d0d1a 100%)", maxWidth: "680px" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 flex items-center justify-between", style: { background: "linear-gradient(90deg, #0a0a15 0%, #1a1a2e 50%, #0a0a15 100%)", borderBottom: "2px solid #33ccff40" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-cyan-600 tracking-[0.4em] uppercase font-light", children: "farbrausch" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
        lineNumber: 80,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xl font-black tracking-wider", style: { color: "#33ccff" }, children: "V2" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
        lineNumber: 81,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-cyan-800 tracking-widest", children: "SYNTHESIZER" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
        lineNumber: 82,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
      lineNumber: 79,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 space-y-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-3", children: [["OSC 1", "osc1", "#33ccff"], ["OSC 2", "osc2", "#ff6633"], ["OSC 3", "osc3", "#cc66ff"]].map(([label, prefix, color]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/30 rounded p-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label, color }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
          lineNumber: 90,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1 justify-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "MODE", value: p(`${prefix}.mode`, prefix === "osc1" ? 1 : 0), min: 0, max: 7, color, onChange: set(`${prefix}.mode`) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 92,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "TRANS", value: p(`${prefix}.transpose`, 64), color: "#ffcc33", onChange: set(`${prefix}.transpose`) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 93,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "DETUNE", value: p(`${prefix}.detune`, prefix === "osc2" ? 74 : prefix === "osc3" ? 54 : 64), color: "#ffcc33", onChange: set(`${prefix}.detune`) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 94,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "COLOR", value: p(`${prefix}.color`, 64), color: "#ff9933", onChange: set(`${prefix}.color`) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 95,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "VOL", value: p(`${prefix}.level`, prefix === "osc1" ? 127 : 0), color: "#66ff99", onChange: set(`${prefix}.level`) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 96,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
          lineNumber: 91,
          columnNumber: 15
        }, void 0)
      ] }, prefix, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
        lineNumber: 89,
        columnNumber: 13
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
        lineNumber: 87,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/30 rounded p-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label: "FILTER 1", color: "#ff6633" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 105,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 justify-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "MODE", value: p("filter1.mode", 1), min: 0, max: 7, color: "#ff6633", onChange: set("filter1.mode") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 107,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "CUT", value: p("filter1.cutoff", 127), color: "#ff6633", onChange: set("filter1.cutoff") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 108,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "RES", value: p("filter1.resonance", 0), color: "#ff6633", onChange: set("filter1.resonance") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 109,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 106,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
          lineNumber: 104,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/30 rounded p-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label: "FILTER 2", color: "#33ccff" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 113,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 justify-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "MODE", value: p("filter2.mode", 0), min: 0, max: 7, color: "#33ccff", onChange: set("filter2.mode") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 115,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "CUT", value: p("filter2.cutoff", 64), color: "#33ccff", onChange: set("filter2.cutoff") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 116,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "RES", value: p("filter2.resonance", 0), color: "#33ccff", onChange: set("filter2.resonance") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 117,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 114,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
          lineNumber: 112,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/30 rounded p-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label: "ROUTING", color: "#cc66ff" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 121,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 justify-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "MODE", value: p("routing.mode", 0), min: 0, max: 2, color: "#cc66ff", onChange: set("routing.mode") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 123,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "BAL", value: p("routing.balance", 64), color: "#cc66ff", onChange: set("routing.balance") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 124,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 122,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
          lineNumber: 120,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
        lineNumber: 103,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/30 rounded p-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label: "AMP ENV", color: "#66ff99" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 132,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 justify-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "ATK", value: p("envelope.attack", 0), color: "#66ff99", onChange: set("envelope.attack") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 134,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "DEC", value: p("envelope.decay", 64), color: "#66ff99", onChange: set("envelope.decay") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 135,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "SUS", value: p("envelope.sustain", 127), color: "#66ff99", onChange: set("envelope.sustain") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 136,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "REL", value: p("envelope.release", 32), color: "#66ff99", onChange: set("envelope.release") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 137,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 133,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
          lineNumber: 131,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/30 rounded p-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label: "MOD ENV", color: "#ff9933" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 141,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 justify-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "ATK", value: p("envelope2.attack", 0), color: "#ff9933", onChange: set("envelope2.attack") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 143,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "DEC", value: p("envelope2.decay", 64), color: "#ff9933", onChange: set("envelope2.decay") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 144,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "SUS", value: p("envelope2.sustain", 127), color: "#ff9933", onChange: set("envelope2.sustain") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 145,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "REL", value: p("envelope2.release", 32), color: "#ff9933", onChange: set("envelope2.release") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 146,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 142,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
          lineNumber: 140,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
        lineNumber: 130,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/30 rounded p-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label: "LFO 1", color: "#ffcc33" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 154,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 justify-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "RATE", value: p("lfo1.rate", 64), color: "#ffcc33", onChange: set("lfo1.rate") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 156,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "DEPTH", value: p("lfo1.depth", 0), color: "#ffcc33", onChange: set("lfo1.depth") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 157,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 155,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
          lineNumber: 153,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/30 rounded p-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label: "LFO 2", color: "#ff6699" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 161,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 justify-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "RATE", value: p("lfo2.rate", 64), color: "#ff6699", onChange: set("lfo2.rate") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 163,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(V2Knob, { label: "AMP", value: p("lfo2.amplify", 127), color: "#ff6699", onChange: set("lfo2.amplify") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
              lineNumber: 164,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
            lineNumber: 162,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
          lineNumber: 160,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
        lineNumber: 152,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
      lineNumber: 85,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-1 text-center", style: { background: "#0a0a15", borderTop: "1px solid #33ccff20" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-cyan-900 tracking-[0.3em] uppercase", children: "farbrausch Synthesizer System • V2M Engine" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
      lineNumber: 172,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
      lineNumber: 171,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/V2Hardware.tsx",
    lineNumber: 77,
    columnNumber: 5
  }, void 0);
};
const TFKnob = ({ label, value, color = "#ff9933", onChange }) => {
  const angle = -135 + value * 270;
  const handleWheel = (e) => {
    e.preventDefault();
    const newVal = Math.max(0, Math.min(1, value + (e.deltaY < 0 ? 0.02 : -0.02)));
    onChange(Math.round(newVal * 100) / 100);
  };
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    const onMove = (ev) => {
      const delta = (startY - ev.clientY) / 150;
      onChange(Math.round(Math.max(0, Math.min(1, startVal + delta)) * 100) / 100);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5 w-11", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "w-7 h-7 rounded-full border-2 cursor-pointer relative",
        style: { borderColor: color, background: "#1a1208" },
        onWheel: handleWheel,
        onMouseDown: handleMouseDown,
        title: `${label}: ${Math.round(value * 100)}%`,
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "absolute w-0.5 h-2.5 rounded-full",
            style: { background: color, top: "2px", left: "50%", transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: "bottom center" }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 51,
            columnNumber: 9
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
        lineNumber: 44,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[6px] font-bold uppercase tracking-wide text-center leading-tight", style: { color }, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
      lineNumber: 56,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
    lineNumber: 43,
    columnNumber: 5
  }, void 0);
};
const Section$3 = ({ label, color = "#ff9933", children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/30 rounded p-1.5", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] font-bold uppercase tracking-[0.15em] mb-1 pb-0.5 border-b", style: { color, borderColor: `${color}30` }, children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
    lineNumber: 63,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-0.5 justify-center", children }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
    lineNumber: 64,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
  lineNumber: 62,
  columnNumber: 3
}, void 0);
const TunefishHardware = ({ parameters, onParamChange }) => {
  const p = (key, def = 0.5) => parameters[key] ?? def;
  const set = (key) => (v) => onParamChange(key, v);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "rounded-lg overflow-hidden shadow-2xl", style: { background: "linear-gradient(180deg, #1a1208 0%, #2a1f10 50%, #1a1208 100%)", maxWidth: "700px" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 flex items-center justify-between", style: { background: "#0f0a04", borderBottom: "2px solid #ff993340" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] tracking-[0.3em] uppercase font-light", style: { color: "#ff9933" }, children: "Brain Control" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
        lineNumber: 76,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xl font-black tracking-wider", style: { color: "#ff9933" }, children: "TUNEFISH 4" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
        lineNumber: 77,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] tracking-widest", style: { color: "#ff993380" }, children: "DEMOSCENE SYNTH" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
        lineNumber: 78,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
      lineNumber: 75,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 space-y-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$3, { label: "GENERATOR", color: "#ff9933", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "BW", value: p("genBandwidth"), onChange: set("genBandwidth") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 85,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "HARM", value: p("genNumHarmonics"), onChange: set("genNumHarmonics") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 86,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "DAMP", value: p("genDamp"), onChange: set("genDamp") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 87,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "MOD", value: p("genModulation", 0), onChange: set("genModulation") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 88,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "DRIVE", value: p("genDrive", 0), color: "#ff6633", onChange: set("genDrive") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 89,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "OCT", value: p("genOctave"), color: "#ffcc33", onChange: set("genOctave") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 90,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
          lineNumber: 84,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$3, { label: "VOICE", color: "#ffcc33", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "VOL", value: p("genVolume", 0.8), color: "#66ff99", onChange: set("genVolume") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 93,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "PAN", value: p("genPanning"), color: "#66ff99", onChange: set("genPanning") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 94,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "GAIN", value: p("globalGain", 0.7), color: "#66ff99", onChange: set("globalGain") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 95,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "FREQ", value: p("genFreq"), color: "#ffcc33", onChange: set("genFreq") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 96,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "DETUNE", value: p("genDetune", 0), color: "#ffcc33", onChange: set("genDetune") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 97,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "GLIDE", value: p("genGlide", 0), color: "#ffcc33", onChange: set("genGlide") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 98,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
          lineNumber: 92,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
        lineNumber: 83,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$3, { label: "POLY / UNISON", color: "#cc66ff", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "POLY", value: p("genPolyphony", 1), color: "#cc66ff", onChange: set("genPolyphony") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 105,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "UNI", value: p("genUnisono", 0), color: "#cc66ff", onChange: set("genUnisono") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 106,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "SPREAD", value: p("genSpread"), color: "#cc66ff", onChange: set("genSpread") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 107,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "SLOP", value: p("genSlop", 0), color: "#cc66ff", onChange: set("genSlop") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 108,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
          lineNumber: 104,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$3, { label: "NOISE", color: "#999999", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "AMT", value: p("noiseAmount", 0), color: "#999", onChange: set("noiseAmount") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 111,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "FREQ", value: p("noiseFreq"), color: "#999", onChange: set("noiseFreq") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 112,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "BW", value: p("noiseBandwidth"), color: "#999", onChange: set("noiseBandwidth") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 113,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
          lineNumber: 110,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
        lineNumber: 103,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$3, { label: "LP FILTER", color: "#ff6633", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "CUT", value: p("lpFilterCutoff", 1), color: "#ff6633", onChange: set("lpFilterCutoff") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 120,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "RES", value: p("lpFilterResonance", 0), color: "#ff6633", onChange: set("lpFilterResonance") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 121,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
          lineNumber: 119,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$3, { label: "HP FILTER", color: "#33ccff", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "CUT", value: p("hpFilterCutoff", 0), color: "#33ccff", onChange: set("hpFilterCutoff") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 124,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "RES", value: p("hpFilterResonance", 0), color: "#33ccff", onChange: set("hpFilterResonance") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 125,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
          lineNumber: 123,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$3, { label: "BP FILTER", color: "#ffcc33", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "CUT", value: p("bpFilterCutoff"), color: "#ffcc33", onChange: set("bpFilterCutoff") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 128,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "Q", value: p("bpFilterQ"), color: "#ffcc33", onChange: set("bpFilterQ") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 129,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
          lineNumber: 127,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$3, { label: "NOTCH", color: "#cc66ff", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "CUT", value: p("ntFilterCutoff"), color: "#cc66ff", onChange: set("ntFilterCutoff") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 132,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "Q", value: p("ntFilterQ"), color: "#cc66ff", onChange: set("ntFilterQ") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 133,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
          lineNumber: 131,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
        lineNumber: 118,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$3, { label: "DISTORTION", color: "#ff3333", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "AMT", value: p("distortionAmount", 0), color: "#ff3333", onChange: set("distortionAmount") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 140,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "GAIN", value: p("distortionGain", 0), color: "#ff3333", onChange: set("distortionGain") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 141,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
          lineNumber: 139,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$3, { label: "DELAY", color: "#33ccff", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "LEFT", value: p("delayLeft", 0), color: "#33ccff", onChange: set("delayLeft") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 144,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "RIGHT", value: p("delayRight", 0), color: "#33ccff", onChange: set("delayRight") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 145,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "DECAY", value: p("delayDecay", 0), color: "#33ccff", onChange: set("delayDecay") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 146,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
          lineNumber: 143,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$3, { label: "CHORUS / FLANGE", color: "#66ff99", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "RATE", value: p("chorusFreq", 0), color: "#66ff99", onChange: set("chorusFreq") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 149,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "DEPTH", value: p("chorusDepth", 0), color: "#66ff99", onChange: set("chorusDepth") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 150,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TFKnob, { label: "GAIN", value: p("chorusGain", 0), color: "#66ff99", onChange: set("chorusGain") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
            lineNumber: 151,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
          lineNumber: 148,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
        lineNumber: 138,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
      lineNumber: 81,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-1 text-center", style: { background: "#0f0a04", borderTop: "1px solid #ff993320" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] tracking-[0.3em] uppercase", style: { color: "#ff993360" }, children: "Tunefish 4 • Additive Synthesis Engine" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
      lineNumber: 158,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
      lineNumber: 157,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/TunefishHardware.tsx",
    lineNumber: 73,
    columnNumber: 5
  }, void 0);
};
const WSKnob = ({ label, value, color = "#ff3333", onChange }) => {
  const angle = -135 + value * 270;
  const handleWheel = (e) => {
    e.preventDefault();
    onChange(Math.round(Math.max(0, Math.min(1, value + (e.deltaY < 0 ? 0.02 : -0.02))) * 100) / 100);
  };
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    const onMove = (ev) => {
      onChange(Math.round(Math.max(0, Math.min(1, startVal + (startY - ev.clientY) / 150)) * 100) / 100);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5 w-12", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "w-8 h-8 rounded-full border-2 cursor-pointer relative",
        style: { borderColor: color, background: "#1a0808" },
        onWheel: handleWheel,
        onMouseDown: handleMouseDown,
        title: `${label}: ${Math.round(value * 100)}%`,
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "absolute w-0.5 h-3 rounded-full",
            style: { background: color, top: "2px", left: "50%", transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: "bottom center" }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
            lineNumber: 49,
            columnNumber: 9
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
        lineNumber: 42,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-bold uppercase tracking-wide text-center", style: { color }, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
      lineNumber: 54,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
    lineNumber: 41,
    columnNumber: 5
  }, void 0);
};
const Section$2 = ({ label, color = "#ff3333", children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/40 rounded p-2", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-bold uppercase tracking-[0.2em] mb-1 pb-0.5 border-b", style: { color, borderColor: `${color}40` }, children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
    lineNumber: 61,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1 justify-center", children }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
    lineNumber: 62,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
  lineNumber: 60,
  columnNumber: 3
}, void 0);
const SlaughterHardware = ({ parameters, onParamChange }) => {
  const p = (key, def = 0.5) => parameters[key] ?? def;
  const set = (key) => (v) => onParamChange(key, v);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "rounded-lg overflow-hidden shadow-2xl", style: { background: "linear-gradient(180deg, #1a0505 0%, #2a0808 50%, #1a0505 100%)", maxWidth: "600px" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 flex items-center justify-between", style: { background: "#0f0202", borderBottom: "2px solid #ff333340" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-red-800 tracking-[0.3em] uppercase font-light", children: "WaveSabre" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
        lineNumber: 74,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xl font-black tracking-wider text-red-500", children: "SLAUGHTER" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
        lineNumber: 75,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-red-900 tracking-widest", children: "SUBTRACTIVE" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
        lineNumber: 76,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
      lineNumber: 73,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 space-y-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { label: "OSCILLATOR", color: "#33ccff", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "WAVE", value: p("waveform", 0), color: "#33ccff", onChange: set("waveform") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 82,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "PW", value: p("pulseWidth"), color: "#33ccff", onChange: set("pulseWidth") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 83,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "COARSE", value: p("coarse"), color: "#ffcc33", onChange: set("coarse") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 84,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "FINE", value: p("fine"), color: "#ffcc33", onChange: set("fine") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 85,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "VOICES", value: p("voices", 0.125), color: "#ffcc33", onChange: set("voices") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 86,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "DETUNE", value: p("detune", 0.1), color: "#ffcc33", onChange: set("detune") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 87,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "SPREAD", value: p("spread"), color: "#ffcc33", onChange: set("spread") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 88,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
        lineNumber: 81,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { label: "FILTER", color: "#ff6633", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "TYPE", value: p("filterType", 0), color: "#ff6633", onChange: set("filterType") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 93,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "CUTOFF", value: p("cutoff"), color: "#ff6633", onChange: set("cutoff") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 94,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "RESO", value: p("resonance", 0.3), color: "#ff6633", onChange: set("resonance") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 95,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "ENV", value: p("filterEnvAmount"), color: "#ff6633", onChange: set("filterEnvAmount") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 96,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
        lineNumber: 92,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { label: "AMP ENVELOPE", color: "#66ff99", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "ATK", value: p("ampAttack", 0.01), color: "#66ff99", onChange: set("ampAttack") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
            lineNumber: 102,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "DEC", value: p("ampDecay", 0.3), color: "#66ff99", onChange: set("ampDecay") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
            lineNumber: 103,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "SUS", value: p("ampSustain", 0.7), color: "#66ff99", onChange: set("ampSustain") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
            lineNumber: 104,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "REL", value: p("ampRelease", 0.3), color: "#66ff99", onChange: set("ampRelease") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
            lineNumber: 105,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 101,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { label: "FILTER ENVELOPE", color: "#cc66ff", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "ATK", value: p("filterAttack", 0.01), color: "#cc66ff", onChange: set("filterAttack") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
            lineNumber: 108,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "DEC", value: p("filterDecay", 0.2), color: "#cc66ff", onChange: set("filterDecay") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
            lineNumber: 109,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "SUS", value: p("filterSustain", 0.3), color: "#cc66ff", onChange: set("filterSustain") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
            lineNumber: 110,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "REL", value: p("filterRelease", 0.2), color: "#cc66ff", onChange: set("filterRelease") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
            lineNumber: 111,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
          lineNumber: 107,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
        lineNumber: 100,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$2, { label: "OUTPUT", color: "#66ff99", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WSKnob, { label: "GAIN", value: p("gain"), color: "#66ff99", onChange: set("gain") }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
        lineNumber: 117,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
        lineNumber: 116,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
      lineNumber: 79,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-1 text-center", style: { background: "#0f0202", borderTop: "1px solid #ff333320" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-red-900 tracking-[0.3em] uppercase", children: "WaveSabre Slaughter • Subtractive Synth Engine" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
      lineNumber: 122,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
      lineNumber: 121,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/SlaughterHardware.tsx",
    lineNumber: 71,
    columnNumber: 5
  }, void 0);
};
const FKnob = ({ label, value, color = "#3366ff", onChange }) => {
  const angle = -135 + value * 270;
  const handleWheel = (e) => {
    e.preventDefault();
    onChange(Math.round(Math.max(0, Math.min(1, value + (e.deltaY < 0 ? 0.02 : -0.02))) * 100) / 100);
  };
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    const onMove = (ev) => {
      onChange(Math.round(Math.max(0, Math.min(1, startVal + (startY - ev.clientY) / 150)) * 100) / 100);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5 w-12", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "w-8 h-8 rounded-full border-2 cursor-pointer relative",
        style: { borderColor: color, background: "#080818" },
        onWheel: handleWheel,
        onMouseDown: handleMouseDown,
        title: `${label}: ${Math.round(value * 100)}%`,
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "absolute w-0.5 h-3 rounded-full",
            style: { background: color, top: "2px", left: "50%", transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: "bottom center" }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 48,
            columnNumber: 9
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
        lineNumber: 41,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-bold uppercase tracking-wide text-center", style: { color }, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
      lineNumber: 53,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
    lineNumber: 40,
    columnNumber: 5
  }, void 0);
};
const Section$1 = ({ label, color = "#3366ff", children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/40 rounded p-2", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-bold uppercase tracking-[0.2em] mb-1 pb-0.5 border-b", style: { color, borderColor: `${color}40` }, children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
    lineNumber: 60,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1 justify-center", children }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
    lineNumber: 61,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
  lineNumber: 59,
  columnNumber: 3
}, void 0);
const FalconHardware = ({ parameters, onParamChange }) => {
  const p = (key, def = 0.5) => parameters[key] ?? def;
  const set = (key) => (v) => onParamChange(key, v);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "rounded-lg overflow-hidden shadow-2xl", style: { background: "linear-gradient(180deg, #050510 0%, #0a0a25 50%, #050510 100%)", maxWidth: "600px" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 flex items-center justify-between", style: { background: "#030308", borderBottom: "2px solid #3366ff40" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-blue-800 tracking-[0.3em] uppercase font-light", children: "WaveSabre" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
        lineNumber: 73,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xl font-black tracking-wider text-blue-400", children: "FALCON" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
        lineNumber: 74,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-blue-900 tracking-widest", children: "FM SYNTHESIS" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
        lineNumber: 75,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
      lineNumber: 72,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 space-y-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { label: "OSCILLATOR 1", color: "#33ccff", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "WAVE", value: p("osc1Waveform", 0), color: "#33ccff", onChange: set("osc1Waveform") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 82,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "COARSE", value: p("osc1Coarse"), color: "#ffcc33", onChange: set("osc1Coarse") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 83,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "FINE", value: p("osc1Fine"), color: "#ffcc33", onChange: set("osc1Fine") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 84,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
          lineNumber: 81,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { label: "OSCILLATOR 2", color: "#ff6633", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "WAVE", value: p("osc2Waveform", 0), color: "#ff6633", onChange: set("osc2Waveform") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 87,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "COARSE", value: p("osc2Coarse"), color: "#ffcc33", onChange: set("osc2Coarse") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 88,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "FINE", value: p("osc2Fine"), color: "#ffcc33", onChange: set("osc2Fine") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 89,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
          lineNumber: 86,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
        lineNumber: 80,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { label: "FM MODULATION", color: "#cc66ff", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "AMT", value: p("fmAmount", 0.3), color: "#cc66ff", onChange: set("fmAmount") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
          lineNumber: 95,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "RATIO", value: p("fmCoarse", 0.125), color: "#cc66ff", onChange: set("fmCoarse") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
          lineNumber: 96,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "FINE", value: p("fmFine"), color: "#cc66ff", onChange: set("fmFine") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
          lineNumber: 97,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "FDBK", value: p("feedback", 0.1), color: "#cc66ff", onChange: set("feedback") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
          lineNumber: 98,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
        lineNumber: 94,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { label: "AMP ENVELOPE", color: "#66ff99", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "ATK", value: p("attack1", 0.01), color: "#66ff99", onChange: set("attack1") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 104,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "DEC", value: p("decay1", 0.3), color: "#66ff99", onChange: set("decay1") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 105,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "SUS", value: p("sustain1"), color: "#66ff99", onChange: set("sustain1") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 106,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "REL", value: p("release1", 0.3), color: "#66ff99", onChange: set("release1") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 107,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
          lineNumber: 103,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { label: "MOD ENVELOPE", color: "#ff9933", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "ATK", value: p("attack2", 0.01), color: "#ff9933", onChange: set("attack2") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 110,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "DEC", value: p("decay2", 0.2), color: "#ff9933", onChange: set("decay2") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 111,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "SUS", value: p("sustain2", 0.3), color: "#ff9933", onChange: set("sustain2") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 112,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "REL", value: p("release2", 0.2), color: "#ff9933", onChange: set("release2") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 113,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
          lineNumber: 109,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
        lineNumber: 102,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { label: "VOICE", color: "#ffcc33", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "VOICES", value: p("voices", 0.125), color: "#ffcc33", onChange: set("voices") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 120,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "DETUNE", value: p("detune", 0.1), color: "#ffcc33", onChange: set("detune") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 121,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "SPREAD", value: p("spread"), color: "#ffcc33", onChange: set("spread") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
            lineNumber: 122,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
          lineNumber: 119,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section$1, { label: "OUTPUT", color: "#66ff99", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FKnob, { label: "GAIN", value: p("gain"), color: "#66ff99", onChange: set("gain") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
          lineNumber: 125,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
          lineNumber: 124,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
        lineNumber: 118,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
      lineNumber: 78,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-1 text-center", style: { background: "#030308", borderTop: "1px solid #3366ff20" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-blue-900 tracking-[0.3em] uppercase", children: "WaveSabre Falcon • 2-Op FM Synthesis Engine" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
      lineNumber: 131,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
      lineNumber: 130,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FalconHardware.tsx",
    lineNumber: 70,
    columnNumber: 5
  }, void 0);
};
const OKnob = ({ label, value, color = "#33ff66", onChange }) => {
  const angle = -135 + value * 270;
  const handleWheel = (e) => {
    e.preventDefault();
    onChange(Math.round(Math.max(0, Math.min(1, value + (e.deltaY < 0 ? 0.02 : -0.02))) * 100) / 100);
  };
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    const onMove = (ev) => {
      onChange(Math.round(Math.max(0, Math.min(1, startVal + (startY - ev.clientY) / 150)) * 100) / 100);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5 w-14", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "w-9 h-9 rounded-full border-2 cursor-pointer relative",
        style: { borderColor: color, background: "#081a08" },
        onWheel: handleWheel,
        onMouseDown: handleMouseDown,
        title: `${label}: ${Math.round(value * 100)}%`,
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "absolute w-0.5 h-3.5 rounded-full",
            style: { background: color, top: "2px", left: "50%", transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: "bottom center" }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
            lineNumber: 49,
            columnNumber: 9
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
        lineNumber: 42,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] font-bold uppercase tracking-wide text-center", style: { color }, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
      lineNumber: 54,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[7px] text-green-800 font-mono", children: [
      Math.round(value * 100),
      "%"
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
      lineNumber: 55,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
    lineNumber: 41,
    columnNumber: 5
  }, void 0);
};
const Section = ({ label, color = "#33ff66", children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/30 rounded p-2", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-bold uppercase tracking-[0.2em] mb-1.5 pb-0.5 border-b", style: { color, borderColor: `${color}30` }, children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
    lineNumber: 62,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1 justify-center", children }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
    lineNumber: 63,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
  lineNumber: 61,
  columnNumber: 3
}, void 0);
const OidosHardware = ({ parameters, onParamChange }) => {
  const p = (key, def = 0.5) => parameters[key] ?? def;
  const set = (key) => (v) => onParamChange(key, v);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "rounded-lg overflow-hidden shadow-2xl", style: { background: "linear-gradient(180deg, #061206 0%, #0a1f0a 50%, #061206 100%)", maxWidth: "580px" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-2 flex items-center justify-between", style: { background: "#030a03", borderBottom: "2px solid #33ff6640" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-green-800 tracking-[0.3em] uppercase font-light", children: "Additive" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
        lineNumber: 75,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xl font-black tracking-wider", style: { color: "#33ff66" }, children: "OIDOS" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
        lineNumber: 76,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-green-900 tracking-widest", children: "4K SYNTH" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
        lineNumber: 77,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
      lineNumber: 74,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 space-y-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "GENERATION", color: "#ff9933", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "SEED", value: p("seed"), color: "#ff9933", onChange: set("seed") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 83,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "MODES", value: p("modes", 0.4), color: "#ff9933", onChange: set("modes") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 84,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "FAT", value: p("fat", 0.1), color: "#ff9933", onChange: set("fat") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 85,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "WIDTH", value: p("width", 0.34), color: "#ff9933", onChange: set("width") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 86,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
        lineNumber: 82,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "HARMONICS", color: "#33ccff", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "OVERT", value: p("overtones", 0.27), color: "#33ccff", onChange: set("overtones") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 91,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "SHARP", value: p("sharpness", 0.9), color: "#33ccff", onChange: set("sharpness") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 92,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "HARM", value: p("harmonicity", 1), color: "#33ccff", onChange: set("harmonicity") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 93,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
        lineNumber: 90,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "DECAY", color: "#66ff99", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "LOW", value: p("decayLow", 1), color: "#66ff99", onChange: set("decayLow") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 98,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "HIGH", value: p("decayHigh", 1), color: "#66ff99", onChange: set("decayHigh") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 99,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
        lineNumber: 97,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "LOW FILTER", color: "#ff6633", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "CUT", value: p("filterLow", 0), color: "#ff6633", onChange: set("filterLow") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
            lineNumber: 105,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "SLOPE", value: p("filterSlopeLow", 0), color: "#ff6633", onChange: set("filterSlopeLow") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
            lineNumber: 106,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "SWEEP", value: p("filterSweepLow"), color: "#ff6633", onChange: set("filterSweepLow") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
            lineNumber: 107,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 104,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "HIGH FILTER", color: "#cc66ff", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "CUT", value: p("filterHigh", 1), color: "#cc66ff", onChange: set("filterHigh") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
            lineNumber: 110,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "SLOPE", value: p("filterSlopeHigh", 0), color: "#cc66ff", onChange: set("filterSlopeHigh") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
            lineNumber: 111,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "SWEEP", value: p("filterSweepHigh"), color: "#cc66ff", onChange: set("filterSweepHigh") }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
            lineNumber: 112,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 109,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
        lineNumber: 103,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { label: "OUTPUT", color: "#ffcc33", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "GAIN", value: p("gain", 0.25), color: "#66ff99", onChange: set("gain") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 118,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "ATK", value: p("attack", 0.25), color: "#ffcc33", onChange: set("attack") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 119,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OKnob, { label: "REL", value: p("release"), color: "#ffcc33", onChange: set("release") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
          lineNumber: 120,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
        lineNumber: 117,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
      lineNumber: 80,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-1 text-center", style: { background: "#030a03", borderTop: "1px solid #33ff6620" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] text-green-900 tracking-[0.3em] uppercase", children: "Oidos • Additive Synthesis • 4k/64k Intros" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
      lineNumber: 125,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
      lineNumber: 124,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/OidosHardware.tsx",
    lineNumber: 72,
    columnNumber: 5
  }, void 0);
};
const WaveSabreHardwareRouter = ({ parameters, onParamChange }) => {
  if (parameters["osc1Waveform"] !== void 0 || parameters["fmAmount"] !== void 0) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FalconHardware, { parameters, onParamChange }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HardwareUIWrapper.tsx",
      lineNumber: 46,
      columnNumber: 12
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlaughterHardware, { parameters, onParamChange }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HardwareUIWrapper.tsx",
    lineNumber: 48,
    columnNumber: 10
  }, void 0);
};
const DEDICATED_UI_MAP = {
  // Drum Machines
  MAMETR707: TR707Hardware,
  DrumMachine: TR808Hardware,
  // Roland TR-808/909 Rhythm Composers (1980/1983)
  TR808: TR808Hardware,
  // Roland TR-808 (io-808 synth engine)
  // Synthesizers - Classic
  TB303: TB303Hardware,
  // Roland TB-303 Bass Line (1981)
  CZ101: CZ101Hardware,
  // Casio CZ-101 Phase Distortion (1984)
  DX7: DexedHardwareUI,
  // Yamaha DX7 FM Synthesis (1983)
  OBXf: OBXfHardwareUI,
  // Oberheim OB-X Analog (1979) — JUCE OB-Xf UI
  Odin2: Odin2HardwareUI,
  // Odin2 Semi-Modular Synth — JUCE Odin2 UI
  Helm: HelmHardwareUI,
  // Helm Polyphonic Synth — JUCE Helm UI
  Surge: SurgeHardwareUI,
  // Surge XT Hybrid Synth — JUCE Surge XT UI
  // Synthesizers - MAME (dedicated)
  MAMERSA: D50Hardware,
  // Roland D-50 LA Synthesis (1987)
  MAMEVFX: VFXHardware,
  // Ensoniq VFX Wavetable (1989)
  // MAME PCM / Samplers (dedicated hardware UIs)
  MAMEFZPCM: FZHardware,
  // Casio FZ-1 16-bit PCM Sampler (1987)
  MAMEPS1SPU: PS1SPUHardware,
  // Sony PlayStation SPU ADPCM (1994)
  MAMEZSG2: ZSG2Hardware,
  // ZOOM ZSG-2 48-Channel ADPCM
  MAMEKS0164: KS0164Hardware,
  // Samsung KS0164 32-Voice GM Wavetable
  MAMESWP00: SWP00Hardware,
  // Yamaha SWP00 AWM2 MU50 (1994)
  MAMESWP20: SWP20Hardware,
  // Yamaha SWP20 AWM2 MU80 (1994)
  MAMERolandGP: RolandGPHardware,
  // Roland TC6116 SC-88 PCM (1994)
  // Monique Monosynth — full JUCE UI via software renderer
  Monique: MoniqueHardwareUI,
  // amsynth — bitmap skin-based JUCE UI via software renderer
  Amsynth: AmsynthHardwareUI,
  // Casio VL-Tone — retro calculator-style HTML UI
  VL1: VL1Hardware,
  // Demoscene synths — custom panel UIs
  V2: V2Hardware,
  TunefishSynth: TunefishHardware,
  WaveSabreSynth: WaveSabreHardwareRouter,
  OidosSynth: OidosHardware
};
const MAME_GENERIC_TYPES = [
  // Sound generators
  "MAMEAstrocade",
  // Bally Astrocade Custom I/O (1977)
  "MAMESN76477",
  // TI SN76477 Complex Sound Generator (1978)
  "MAMEASC",
  // Apple Sound Chip (1987)
  "MAMEES5503",
  // Ensoniq DOC 32-Voice Wavetable (1986)
  "MAMEMSM5232",
  // OKI MSM5232 8-Voice Organ
  "MAMESNKWave",
  // SNK Programmable Waveform
  "MAMETMS36XX",
  // TI TMS36XX Tone Matrix Organ
  "MAMETIA",
  // Atari 2600 TIA
  "MAMEVASynth",
  // Virtual Analog Modeling
  // Speech synthesizers
  "MAMEMEA8000",
  // Philips MEA8000 LPC Speech
  "MAMESP0250",
  // GI SP0250 Digital LPC Speech
  "MAMETMS5220",
  // TI TMS5220 Speak & Spell
  "MAMEVotrax",
  // Votrax SC-01 Formant Speech
  // Keyboard / Phase Distortion
  "MAMEUPD931",
  // NEC uPD931 Casio Keyboard Voice
  "MAMEUPD933",
  // NEC uPD933 CZ Phase Distortion
  // FM synthesis
  "MAMEYMOPQ",
  // Yamaha YM3806 4-Op FM
  "MAMEYMF271",
  // Yamaha OPX 4-Op FM+PCM
  // Curtis analog
  "CEM3394",
  // Curtis Electromusic Analog Voice
  // PCM / ROM-based (minimal controls)
  "MAMEICS2115",
  // ICS WaveFront 32-Voice
  "MAMEK054539",
  // Konami K054539 PCM/ADPCM
  "MAMEC352",
  // Namco C352 32-Voice PCM
  "MAMERF5C400",
  // Ricoh RF5C400 32-Voice PCM
  "SCSP",
  // Sega Saturn SCSP
  "MAMESWP30"
  // Yamaha MU-2000 SWP30
];
const BUZZ_GENERIC_TYPES = [
  "Buzzmachine",
  "BuzzDTMF",
  "BuzzFreqBomb",
  "BuzzKick",
  "BuzzKickXP",
  "BuzzNoise",
  "BuzzTrilok",
  "Buzz4FM2F",
  "BuzzDynamite6",
  "BuzzM3",
  "Buzz3o3",
  "Buzz3o3DF",
  "BuzzM4"
];
const SYNTHS_WITH_BUILTIN_INPUT = /* @__PURE__ */ new Set([
  "DrumMachine",
  // TR-808/909 has a 16-step sequencer
  "TR808",
  // TR-808 (io-808 engine) has a 16-step sequencer
  "MAMETR707",
  // TR-707 has a 16-step sequencer
  "TB303"
  // TB-303 has its own note input
  // Note: Monique has a built-in keyboard only in hardware UI mode,
  // not in simple controls mode. The keyboard visibility for Monique
  // is handled by MoniqueHardwareUI rendering its own piano.
]);
function hasHardwareUI(synthType) {
  if (synthType in DEDICATED_UI_MAP) return true;
  if (MAME_GENERIC_TYPES.includes(synthType)) return true;
  if (BUZZ_GENERIC_TYPES.includes(synthType)) return true;
  if (isVSTBridgeType(synthType)) return true;
  return false;
}
function hasBuiltInInput(synthType) {
  return SYNTHS_WITH_BUILTIN_INPUT.has(synthType);
}
const HardwareUIWrapper = ({
  synthType,
  parameters,
  onParamChange,
  instrumentId
}) => {
  const DedicatedComponent = DEDICATED_UI_MAP[synthType];
  if (DedicatedComponent) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      DedicatedComponent,
      {
        parameters,
        onParamChange,
        instrumentId
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HardwareUIWrapper.tsx",
        lineNumber: 223,
        columnNumber: 7
      },
      void 0
    );
  }
  if (MAME_GENERIC_TYPES.includes(synthType)) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      MAMEGenericHardware,
      {
        synthType,
        parameters,
        onParamChange
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HardwareUIWrapper.tsx",
        lineNumber: 234,
        columnNumber: 7
      },
      void 0
    );
  }
  if (BUZZ_GENERIC_TYPES.includes(synthType)) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      BuzzGenericHardware,
      {
        synthType,
        parameters,
        onParamChange
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HardwareUIWrapper.tsx",
        lineNumber: 245,
        columnNumber: 7
      },
      void 0
    );
  }
  if (isVSTBridgeType(synthType)) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      VSTBridgeGenericHardware,
      {
        synthType,
        parameters,
        onParamChange
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HardwareUIWrapper.tsx",
        lineNumber: 256,
        columnNumber: 7
      },
      void 0
    );
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-8 text-center text-text-muted", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-lg mb-2", children: [
      "Hardware UI not available for ",
      synthType
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HardwareUIWrapper.tsx",
      lineNumber: 267,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm", children: "This synth uses the standard control interface." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HardwareUIWrapper.tsx",
      lineNumber: 268,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HardwareUIWrapper.tsx",
    lineNumber: 266,
    columnNumber: 5
  }, void 0);
};
export {
  AmsynthHardwareUI$1 as A,
  HardwareUIWrapper as H,
  MoniqueHardwareUI$1 as M,
  SDLHardwareWrapper as S,
  hasHardwareUI as a,
  hasBuiltInInput as h
};
