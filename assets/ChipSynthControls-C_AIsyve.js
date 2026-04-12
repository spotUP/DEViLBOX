const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { cN as getChipSynthDef, am as __vitePreload, c9 as ScrollLockContainer, W as CustomSelect, aB as Knob } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { V as VowelEditor } from "./VowelEditor--8udaoKG.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
const ChipSynthControls = ({
  synthType,
  parameters,
  instrumentId,
  onParamChange,
  onTextChange,
  onLoadPreset,
  onRomUpload,
  onSpeak
}) => {
  const chipDef = reactExports.useMemo(() => getChipSynthDef(synthType), [synthType]);
  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor } = useInstrumentColors((chipDef == null ? void 0 : chipDef.color) ?? "#ffcc33");
  const [activeOpTab, setActiveOpTab] = reactExports.useState(0);
  const parametersRef = reactExports.useRef(parameters);
  reactExports.useEffect(() => {
    parametersRef.current = parameters;
  }, [parameters]);
  reactExports.useEffect(() => {
    if (!instrumentId) return;
    (async () => {
      try {
        const { getToneEngine } = await __vitePreload(async () => {
          const { getToneEngine: getToneEngine2 } = await import("./main-BbV5VyEH.js").then((n) => n.j2);
          return { getToneEngine: getToneEngine2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
        const { useInstrumentStore } = await __vitePreload(async () => {
          const { useInstrumentStore: useInstrumentStore2 } = await import("./main-BbV5VyEH.js").then((n) => n.j0);
          return { useInstrumentStore: useInstrumentStore2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
        const engine = getToneEngine();
        const inst = useInstrumentStore.getState().instruments.find((i) => i.id === instrumentId);
        if (inst) await engine.ensureInstrumentReady(inst);
      } catch {
      }
    })();
  }, [instrumentId]);
  const [phonemeMode, setPhonemeMode] = reactExports.useState({});
  const grouped = reactExports.useMemo(() => {
    if (!chipDef) return {};
    const groups = {};
    for (const param of chipDef.parameters) {
      if (!groups[param.group]) groups[param.group] = [];
      groups[param.group].push(param);
    }
    return groups;
  }, [chipDef]);
  const formatValue = reactExports.useCallback((param, value) => {
    if (param.formatValue === "percent") return `${Math.round(value * 100)}%`;
    if (param.formatValue === "int") return String(Math.round(value));
    if (param.formatValue === "hz") return `${Math.round(value)} Hz`;
    if (param.formatValue === "db") return `${value.toFixed(1)} dB`;
    if (param.formatValue === "seconds") return `${value.toFixed(3)}s`;
    if (param.options) {
      const opt = param.options.find((o) => o.value === Math.round(value));
      return opt ? opt.label : String(Math.round(value));
    }
    return value.toFixed(2);
  }, []);
  const handleRomFileUpload = reactExports.useCallback(async (e, bank) => {
    var _a;
    const file = (_a = e.target.files) == null ? void 0 : _a[0];
    if (!file || !onRomUpload) return;
    if (file.name.toLowerCase().endsWith(".zip")) {
      try {
        const JSZip = (await __vitePreload(async () => {
          const { default: __vite_default__ } = await import("./main-BbV5VyEH.js").then((n) => n.j);
          return { default: __vite_default__ };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0)).default;
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);
        const files = [];
        loadedZip.forEach((relativePath, zipEntry) => {
          const isMetadata = relativePath.toLowerCase().match(/\.(txt|md|pdf|url|inf)$/);
          if (!zipEntry.dir && !isMetadata) {
            files.push({ name: relativePath, entry: zipEntry });
          }
        });
        files.sort((a, b) => a.name.localeCompare(b.name, void 0, { numeric: true, sensitivity: "base" }));
        for (let i = 0; i < files.length; i++) {
          const targetBank = bank + i;
          const fileData = await files[i].entry.async("uint8array");
          onRomUpload(targetBank, fileData);
        }
        onParamChange("_romsLoaded", 1);
      } catch (err) {
        console.error("🎹 ROM: Failed to unzip ROM set:", err);
      }
    } else {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      onRomUpload(bank, data);
      onParamChange("_romsLoaded", 1);
    }
    e.target.value = "";
  }, [onRomUpload, onParamChange]);
  if (!chipDef) return null;
  const bgColor = isCyanTheme ? "rgba(0, 20, 20, 0.4)" : "rgba(0,0,0,0.3)";
  const textColor = isCyanTheme ? "#00ffff" : "#e2e8f0";
  const mutedColor = isCyanTheme ? "#006060" : "#94a3b8";
  const panelBorder = isCyanTheme ? "rgba(0, 255, 255, 0.2)" : "rgba(255,255,255,0.08)";
  const renderParam = (param, keyPrefix = "") => {
    const paramKey = keyPrefix ? `${keyPrefix}${param.key}` : param.key;
    const currentValue = parameters[paramKey] ?? param.default;
    if (param.type === "toggle") {
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onParamChange(paramKey, currentValue ? 0 : 1),
            style: {
              width: 48,
              height: 24,
              borderRadius: 12,
              background: currentValue ? accentColor : isCyanTheme ? "#0a1a1a" : "#334155",
              border: `1px solid ${currentValue ? accentColor : panelBorder}`,
              cursor: "pointer",
              position: "relative",
              transition: "background 0.2s"
            },
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
              width: 18,
              height: 18,
              borderRadius: 9,
              background: isCyanTheme ? "#030808" : "#fff",
              position: "absolute",
              top: 2,
              left: currentValue ? 27 : 3,
              transition: "left 0.2s",
              boxShadow: currentValue ? `0 0 6px ${accentColor}` : "none"
            } }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
              lineNumber: 153,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
            lineNumber: 143,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 10, color: mutedColor }, children: param.label }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 162,
          columnNumber: 11
        }, void 0)
      ] }, paramKey, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 142,
        columnNumber: 9
      }, void 0);
    }
    if (param.type === "text") {
      const textValue = String(parameters[paramKey] ?? param.defaultText ?? "");
      const isSpeechText = paramKey === "speechText" && onSpeak;
      const showPhonemes = phonemeMode[paramKey] ?? false;
      const handlePhonemeToggle = () => {
        if (!isSpeechText) return;
        if (!showPhonemes) {
          try {
            __vitePreload(async () => {
              const { textToPhonemes } = await import("./main-BbV5VyEH.js").then((n) => n.iY);
              return { textToPhonemes };
            }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0).then(({ textToPhonemes }) => {
              const phonemes = textToPhonemes(textValue);
              if (phonemes) {
                onTextChange == null ? void 0 : onTextChange(paramKey, phonemes);
                setPhonemeMode((prev) => ({ ...prev, [paramKey]: true }));
              }
            });
          } catch (err) {
            console.error("[ChipSynthControls] Failed to convert to phonemes:", err);
          }
        } else {
          setPhonemeMode((prev) => ({ ...prev, [paramKey]: false }));
        }
      };
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", gap: 4, flex: "1 1 100%" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 10, color: mutedColor, textTransform: "uppercase", fontWeight: 600 }, children: param.label }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 197,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 6 }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "text",
              value: textValue,
              onChange: (e) => onTextChange == null ? void 0 : onTextChange(paramKey, e.target.value),
              onKeyDown: (e) => {
                e.stopPropagation();
                if (e.key === "Enter" && isSpeechText) {
                  onSpeak(textValue);
                }
              },
              placeholder: param.placeholder || (showPhonemes ? "Phonemes: /HEH LOW/ ..." : "Enter text to speak"),
              style: {
                background: isCyanTheme ? "#041010" : "#0d1117",
                color: isCyanTheme ? "#00ffff" : accentColor,
                border: `1px solid ${showPhonemes ? "#ff6b00" : panelBorder}`,
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 13,
                fontFamily: "Monaco, Menlo, monospace",
                outline: "none",
                flex: 1
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
              lineNumber: 199,
              columnNumber: 13
            },
            void 0
          ),
          isSpeechText && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: handlePhonemeToggle,
                style: {
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: `1px solid ${showPhonemes ? "#ff6b00" : accentColor}44`,
                  background: showPhonemes ? "#ff6b0020" : `${accentColor}18`,
                  color: showPhonemes ? "#ff6b00" : accentColor,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s"
                },
                title: showPhonemes ? "Show normal text mode" : "Convert to phonemes",
                children: showPhonemes ? "🔤 Text" : "🗣 Phonemes"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
                lineNumber: 224,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => onSpeak(textValue),
                style: {
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: `1px solid ${accentColor}44`,
                  background: `${accentColor}18`,
                  color: accentColor,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  whiteSpace: "nowrap",
                  transition: "background 0.15s"
                },
                children: "▶ Speak"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
                lineNumber: 244,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
            lineNumber: 223,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 198,
          columnNumber: 11
        }, void 0)
      ] }, paramKey, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 196,
        columnNumber: 9
      }, void 0);
    }
    if (param.type === "vowelEditor") {
      const seqStr = String(parameters["vowelSequence"] ?? "");
      const seq = seqStr ? seqStr.split(",").filter(Boolean) : [];
      const loopVal = Number(parameters["vowelLoopSingle"] ?? 1);
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: "1 1 100%" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        VowelEditor,
        {
          vowelSequence: seq,
          loopSingle: loopVal >= 1,
          onChange: (newSeq) => onTextChange == null ? void 0 : onTextChange("vowelSequence", newSeq.join(",")),
          onLoopToggle: (loop) => onParamChange("vowelLoopSingle", loop ? 1 : 0),
          accentColor
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 276,
          columnNumber: 11
        },
        void 0
      ) }, paramKey, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 275,
        columnNumber: 9
      }, void 0);
    }
    if (param.type === "select" && param.options) {
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(Math.round(Number(currentValue))),
            onChange: (v) => onParamChange(paramKey, Number(v)),
            options: param.options.map((opt) => ({ value: String(opt.value), label: opt.label })),
            style: {
              background: isCyanTheme ? "#041010" : "#1e293b",
              color: textColor,
              border: `1px solid ${panelBorder}`,
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 11,
              cursor: "pointer",
              minWidth: 80
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
            lineNumber: 290,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 10, color: mutedColor }, children: param.label }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 303,
          columnNumber: 11
        }, void 0)
      ] }, paramKey, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 289,
        columnNumber: 9
      }, void 0);
    }
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: Number(currentValue),
        min: param.min ?? 0,
        max: param.max ?? 1,
        step: param.step ?? 0.01,
        onChange: (v) => onParamChange(paramKey, v),
        label: param.label,
        color: knobColor,
        defaultValue: param.default,
        logarithmic: param.logarithmic,
        bipolar: param.bipolar,
        formatValue: (v) => formatValue(param, v)
      },
      paramKey,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 310,
        columnNumber: 7
      },
      void 0
    );
  };
  const renderGroup = (groupName, params, keyPrefix = "") => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    background: bgColor,
    border: `1px solid ${panelBorder}`,
    borderRadius: 8,
    padding: "8px 12px",
    marginBottom: 8
  }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      fontSize: 10,
      fontWeight: 600,
      color: accentColor,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      marginBottom: 8
    }, children: groupName }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
      lineNumber: 335,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 12,
      justifyContent: "flex-start",
      alignItems: "flex-end"
    }, children: params.map((p) => renderParam(p, keyPrefix)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
      lineNumber: 344,
      columnNumber: 7
    }, void 0)
  ] }, groupName, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
    lineNumber: 328,
    columnNumber: 5
  }, void 0);
  const hasOperators = chipDef.operatorCount != null && chipDef.operatorCount > 0 && chipDef.operatorParams;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ScrollLockContainer, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: "8px 0" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 14, fontWeight: 700, color: accentColor }, children: chipDef.name }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 364,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 11, color: mutedColor }, children: chipDef.subtitle }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 367,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
      lineNumber: 363,
      columnNumber: 7
    }, void 0),
    chipDef.romConfig && onRomUpload && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      background: bgColor,
      border: `1px solid ${parameters._romsLoaded ? isCyanTheme ? "rgba(0,255,128,0.3)" : "rgba(34,197,94,0.3)" : isCyanTheme ? "rgba(255,100,100,0.3)" : "rgba(239,68,68,0.3)"}`,
      borderRadius: 8,
      padding: "8px 12px",
      marginBottom: 8
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
          fontSize: 10,
          fontWeight: 600,
          color: accentColor,
          textTransform: "uppercase",
          letterSpacing: "0.05em"
        }, children: "ROM Banks" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 382,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
          fontSize: 9,
          fontWeight: 600,
          padding: "2px 6px",
          borderRadius: 4,
          background: parameters._romsLoaded ? isCyanTheme ? "rgba(0,255,128,0.15)" : "rgba(34,197,94,0.15)" : isCyanTheme ? "rgba(255,100,100,0.15)" : "rgba(239,68,68,0.15)",
          color: parameters._romsLoaded ? isCyanTheme ? "#00ff80" : "#22c55e" : isCyanTheme ? "#ff6464" : "#ef4444"
        }, children: parameters._romsLoaded ? "ROMS READY" : "ROMS MISSING" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 390,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 381,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9, color: mutedColor, marginBottom: 8 }, children: [
        "Expects: ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontFamily: "Monaco, Menlo, monospace", color: accentColor }, children: chipDef.romConfig.requiredZip }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 405,
          columnNumber: 22
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 404,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "w-full sm:w-auto", style: {
          fontSize: 10,
          fontWeight: 600,
          padding: "4px 10px",
          borderRadius: 4,
          border: `1px solid ${accentColor}33`,
          background: `${accentColor}11`,
          color: accentColor,
          cursor: "pointer",
          transition: "background 0.15s",
          textAlign: "center"
        }, children: [
          "UPLOAD ZIP",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "file",
              accept: ".zip",
              style: { display: "none" },
              onChange: (e) => handleRomFileUpload(e, 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
              lineNumber: 420,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 408,
          columnNumber: 13
        }, void 0),
        Array.from({ length: chipDef.romConfig.bankCount }, (_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { style: {
          fontSize: 9,
          padding: "3px 8px",
          borderRadius: 4,
          border: `1px solid ${panelBorder}`,
          background: isCyanTheme ? "#041010" : "#1e293b",
          color: accentColor,
          cursor: "pointer"
        }, children: [
          "BANK ",
          i,
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "file",
              style: { display: "none" },
              onChange: (e) => handleRomFileUpload(e, i)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
              lineNumber: 438,
              columnNumber: 17
            },
            void 0
          )
        ] }, i, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 428,
          columnNumber: 15
        }, void 0))
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 407,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
      lineNumber: 374,
      columnNumber: 9
    }, void 0),
    chipDef.presetCount > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      background: bgColor,
      border: `1px solid ${panelBorder}`,
      borderRadius: 8,
      padding: "8px 12px",
      marginBottom: 8
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        fontSize: 10,
        fontWeight: 600,
        color: accentColor,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginBottom: 8
      }, children: "Chip Presets" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 458,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 }, children: Array.from({ length: chipDef.presetCount }, (_, i) => {
        var _a;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onLoadPreset(i),
            style: {
              padding: "4px 10px",
              borderRadius: 4,
              border: `1px solid ${parameters._program === i ? accentColor : panelBorder}`,
              background: parameters._program === i ? `${accentColor}22` : isCyanTheme ? "#041010" : "#1e293b",
              color: parameters._program === i ? accentColor : textColor,
              fontSize: 11,
              cursor: "pointer",
              fontWeight: parameters._program === i ? 600 : 400,
              transition: "all 0.15s"
            },
            children: ((_a = chipDef.presetNames) == null ? void 0 : _a[i]) ?? `Preset ${i + 1}`
          },
          i,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
            lineNumber: 469,
            columnNumber: 15
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
        lineNumber: 467,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
      lineNumber: 451,
      columnNumber: 9
    }, void 0),
    hasOperators && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 2, marginBottom: 8 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveOpTab(0),
          style: {
            padding: "4px 12px",
            borderRadius: "6px 6px 0 0",
            border: `1px solid ${panelBorder}`,
            borderBottom: activeOpTab === 0 ? `2px solid ${accentColor}` : `1px solid ${panelBorder}`,
            background: activeOpTab === 0 ? bgColor : "transparent",
            color: activeOpTab === 0 ? accentColor : mutedColor,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer"
          },
          children: "Global"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 496,
          columnNumber: 11
        },
        void 0
      ),
      Array.from({ length: chipDef.operatorCount }, (_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveOpTab(i + 1),
          style: {
            padding: "4px 12px",
            borderRadius: "6px 6px 0 0",
            border: `1px solid ${panelBorder}`,
            borderBottom: activeOpTab === i + 1 ? `2px solid ${accentColor}` : `1px solid ${panelBorder}`,
            background: activeOpTab === i + 1 ? bgColor : "transparent",
            color: activeOpTab === i + 1 ? accentColor : mutedColor,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer"
          },
          children: [
            "Op ",
            i + 1
          ]
        },
        i + 1,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
          lineNumber: 510,
          columnNumber: 13
        },
        void 0
      ))
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
      lineNumber: 495,
      columnNumber: 9
    }, void 0),
    (!hasOperators || activeOpTab === 0) && Object.entries(grouped).map(([group, params]) => renderGroup(group, params)),
    hasOperators && activeOpTab > 0 && chipDef.operatorParams && (() => {
      const opParams = chipDef.operatorParams;
      const opGroups = {};
      for (const p of opParams) {
        if (!opGroups[p.group]) opGroups[p.group] = [];
        opGroups[p.group].push(p);
      }
      return Object.entries(opGroups).map(
        ([group, params]) => renderGroup(group, params, `op${activeOpTab}_`)
      );
    })()
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
    lineNumber: 361,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/ChipSynthControls.tsx",
    lineNumber: 360,
    columnNumber: 5
  }, void 0);
};
export {
  ChipSynthControls,
  ChipSynthControls as default
};
