import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React } from "./vendor-ui-AJ7AT9BN.js";
import { aq as useFormatStore, c_ as TFMXEngine, R as useTrackerStore, W as CustomSelect } from "./main-BbV5VyEH.js";
import { T as TFMX_MACRO_COMMANDS } from "./tfmxNative-CJLFLWrB.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SampleBrowserPane } from "./SampleBrowserPane-B7s228O0.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function findCmdDef(opcode) {
  return TFMX_MACRO_COMMANDS.find((c) => c.opcode === opcode);
}
function hex2(v) {
  return (v & 255).toString(16).toUpperCase().padStart(2, "0");
}
function hex8(v) {
  return (v >>> 0).toString(16).toUpperCase().padStart(8, "0");
}
function s16(v) {
  return v > 32767 ? v - 65536 : v;
}
function buildParamFields(cmd, layout) {
  const { byte1: b1, byte2: b2, byte3: b3 } = cmd;
  const w16 = b2 << 8 | b3;
  const w24 = b1 << 16 | b2 << 8 | b3;
  switch (layout) {
    case "none":
      return [];
    case "byte":
      return [{
        label: "Param",
        value: b1,
        display: hex2(b1),
        min: 0,
        max: 255,
        apply: (_c, v) => [v & 255, b2, b3]
      }];
    case "word16":
      return [{
        label: "Word16",
        value: w16,
        display: hex2(b2) + hex2(b3),
        min: 0,
        max: 65535,
        apply: (_c, v) => [b1, v >> 8 & 255, v & 255]
      }];
    case "addr24":
      return [{
        label: "Addr24",
        value: w24,
        display: hex2(b1) + hex2(b2) + hex2(b3),
        min: 0,
        max: 16777215,
        apply: (_c, v) => [v >> 16 & 255, v >> 8 & 255, v & 255]
      }];
    case "byte_word":
      return [
        {
          label: "Count",
          value: b1,
          display: hex2(b1),
          min: 0,
          max: 255,
          apply: (_c, v) => [v & 255, b2, b3]
        },
        {
          label: "Step",
          value: w16,
          display: hex2(b2) + hex2(b3),
          min: 0,
          max: 65535,
          apply: (_c, v) => [b1, v >> 8 & 255, v & 255]
        }
      ];
    case "note_detune":
      return [
        {
          label: "Note",
          value: b1,
          display: hex2(b1),
          min: 0,
          max: 255,
          apply: (_c, v) => [v & 255, b2, b3]
        },
        {
          label: "Detune",
          value: s16(w16),
          display: s16(w16).toString(),
          min: -32768,
          max: 32767,
          apply: (_c, v) => {
            const u = (v < 0 ? v + 65536 : v) & 65535;
            return [b1, u >> 8 & 255, u & 255];
          }
        }
      ];
    case "env":
      return [
        {
          label: "Speed",
          value: b1,
          display: hex2(b1),
          min: 0,
          max: 255,
          apply: (_c, v) => [v & 255, b2, b3]
        },
        {
          label: "Count",
          value: b2,
          display: hex2(b2),
          min: 0,
          max: 255,
          apply: (_c, v) => [b1, v & 255, b3]
        },
        {
          label: "Target",
          value: b3,
          display: hex2(b3),
          min: 0,
          max: 63,
          apply: (_c, v) => [b1, b2, v & 255]
        }
      ];
    case "vibrato":
      return [
        {
          label: "Speed",
          value: b1,
          display: hex2(b1),
          min: 0,
          max: 255,
          apply: (_c, v) => [v & 255, b2, b3]
        },
        {
          label: "Intensity",
          value: b3,
          display: hex2(b3),
          min: 0,
          max: 255,
          apply: (_c, v) => [b1, b2, v & 255]
        }
      ];
    case "volume":
      return [{
        label: "Volume",
        value: b3,
        display: hex2(b3),
        min: 0,
        max: 63,
        apply: (_c, v) => [b1, b2, v & 255]
      }];
    case "addvol_note":
      return [
        {
          label: "Note",
          value: b1,
          display: hex2(b1),
          min: 0,
          max: 255,
          apply: (_c, v) => [v & 255, b2, b3]
        },
        {
          label: "Flag",
          value: b2,
          display: hex2(b2),
          min: 0,
          max: 255,
          apply: (_c, v) => [b1, v & 255, b3]
        },
        {
          label: "Vol",
          value: b3,
          display: hex2(b3),
          min: 0,
          max: 63,
          apply: (_c, v) => [b1, b2, v & 255]
        }
      ];
    case "wave":
      return [{
        label: "Sample",
        value: b3,
        display: hex2(b3),
        min: 0,
        max: 255,
        apply: (_c, v) => [b1, b2, v & 255]
      }];
    case "wave_mod":
      return [
        {
          label: "Sample",
          value: b1,
          display: hex2(b1),
          min: 0,
          max: 255,
          apply: (_c, v) => [v & 255, b2, b3]
        },
        {
          label: "Arg",
          value: w16,
          display: hex2(b2) + hex2(b3),
          min: 0,
          max: 65535,
          apply: (_c, v) => [b1, v >> 8 & 255, v & 255]
        }
      ];
    case "split":
      return [
        {
          label: "Threshold",
          value: b1,
          display: hex2(b1),
          min: 0,
          max: 255,
          apply: (_c, v) => [v & 255, b2, b3]
        },
        {
          label: "Step",
          value: w16,
          display: hex2(b2) + hex2(b3),
          min: 0,
          max: 65535,
          apply: (_c, v) => [b1, v >> 8 & 255, v & 255]
        }
      ];
    case "random":
      return [
        {
          label: "Macro",
          value: b1,
          display: hex2(b1),
          min: 0,
          max: 255,
          apply: (_c, v) => [v & 255, b2, b3]
        },
        {
          label: "Speed",
          value: b2,
          display: hex2(b2),
          min: 0,
          max: 255,
          apply: (_c, v) => [b1, v & 255, b3]
        },
        {
          label: "Mode",
          value: b3,
          display: hex2(b3),
          min: 0,
          max: 255,
          apply: (_c, v) => [b1, b2, v & 255]
        }
      ];
    case "play_macro":
      return [
        {
          label: "Macro",
          value: b1,
          display: hex2(b1),
          min: 0,
          max: 255,
          apply: (_c, v) => [v & 255, b2, b3]
        },
        {
          label: "Ch|Vol",
          value: b2,
          display: hex2(b2),
          min: 0,
          max: 255,
          apply: (_c, v) => [b1, v & 255, b3]
        },
        {
          label: "Detune",
          value: b3,
          display: hex2(b3),
          min: 0,
          max: 255,
          apply: (_c, v) => [b1, b2, v & 255]
        }
      ];
    case "sid_speed":
      return [
        {
          label: "Speed",
          value: b1,
          display: hex2(b1),
          min: 0,
          max: 255,
          apply: (_c, v) => [v & 255, b2, b3]
        },
        {
          label: "Delta",
          value: w16,
          display: hex2(b2) + hex2(b3),
          min: 0,
          max: 65535,
          apply: (_c, v) => [b1, v >> 8 & 255, v & 255]
        }
      ];
    case "sid_op1":
      return [
        {
          label: "Speed",
          value: b1,
          display: hex2(b1),
          min: 0,
          max: 255,
          apply: (_c, v) => [v & 255, b2, b3]
        },
        {
          label: "InterMod",
          value: b2,
          display: hex2(b2),
          min: 0,
          max: 255,
          apply: (_c, v) => [b1, v & 255, b3]
        },
        {
          label: "InterDelta",
          value: b3,
          display: hex2(b3),
          min: 0,
          max: 255,
          apply: (_c, v) => [b1, b2, v & 255]
        }
      ];
  }
  return [];
}
const macroBtn = {
  fontSize: "10px",
  padding: "1px 6px",
  cursor: "pointer",
  background: "var(--color-bg)",
  color: "#88c0c0",
  border: "1px solid #88c0c0",
  borderRadius: "2px",
  fontFamily: "inherit",
  minWidth: "16px"
};
const TFMXMacroEditor = ({ height = 360, initialMacroIndex }) => {
  const native = useFormatStore((s) => s.tfmxNative);
  const setMacroCommand = useFormatStore((s) => s.setTFMXMacroCommand);
  const insertStep = useFormatStore((s) => s.insertTFMXMacroStep);
  const deleteStep = useFormatStore((s) => s.deleteTFMXMacroStep);
  const duplicateStep = useFormatStore((s) => s.duplicateTFMXMacroStep);
  const tfmxFileData = useFormatStore((s) => s.tfmxFileData);
  const tfmxSmplData = useFormatStore((s) => s.tfmxSmplData);
  const reloadAudio = reactExports.useCallback(() => {
    if (!tfmxFileData || !TFMXEngine.hasInstance()) return;
    TFMXEngine.getInstance().reloadModule(tfmxFileData, tfmxSmplData);
  }, [tfmxFileData, tfmxSmplData]);
  const [previewNote, setPreviewNote] = reactExports.useState(24);
  const previewMacro = reactExports.useCallback((macroTableIdx) => {
    if (!TFMXEngine.hasInstance()) return;
    TFMXEngine.getInstance().previewMacro(macroTableIdx, previewNote, 15, 0);
  }, [previewNote]);
  const seekToUsage = reactExports.useCallback((macroTableIdx) => {
    if (!native) return false;
    const patternsUsing = /* @__PURE__ */ new Set();
    for (let p = 0; p < native.patterns.length; p++) {
      if (native.patterns[p].some((c) => c.macro === macroTableIdx)) {
        patternsUsing.add(p);
      }
    }
    if (patternsUsing.size === 0) return false;
    const activeSteps = native.tracksteps.filter((s) => !s.isEFFE && s.stepIndex >= native.firstStep && s.stepIndex <= native.lastStep);
    for (let i = 0; i < activeSteps.length; i++) {
      const step = activeSteps[i];
      for (const v of step.voices) {
        if (v.patternNum >= 0 && !v.isStop && patternsUsing.has(v.patternNum)) {
          useTrackerStore.getState().setCurrentPosition(i, false);
          return true;
        }
      }
    }
    return false;
  }, [native]);
  const resolveArrayIdx = reactExports.useCallback((tableIdx) => {
    if (tableIdx === void 0 || !native) return 0;
    const found = native.macros.findIndex((m) => m.index === tableIdx);
    return found >= 0 ? found : 0;
  }, [native]);
  const [selectedMacroIdx, setSelectedMacroIdx] = reactExports.useState(() => resolveArrayIdx(initialMacroIndex));
  const [selectedStepIdx, setSelectedStepIdx] = reactExports.useState(0);
  const [showRaw, setShowRaw] = reactExports.useState(false);
  const [autoReload, setAutoReload] = reactExports.useState(false);
  React.useEffect(() => {
    if (!autoReload) return;
    if (!tfmxFileData || !TFMXEngine.hasInstance()) return;
    const handle = window.setTimeout(() => {
      TFMXEngine.getInstance().reloadModule(tfmxFileData, tfmxSmplData);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [autoReload, tfmxFileData, tfmxSmplData, native == null ? void 0 : native.macros]);
  React.useEffect(() => {
    if (initialMacroIndex === void 0) return;
    const idx = resolveArrayIdx(initialMacroIndex);
    setSelectedMacroIdx(idx);
    setSelectedStepIdx(0);
  }, [initialMacroIndex, resolveArrayIdx]);
  const macros = (native == null ? void 0 : native.macros) ?? [];
  const macro = macros[selectedMacroIdx];
  const cmd = macro == null ? void 0 : macro.commands[selectedStepIdx];
  const cmdDef = cmd ? findCmdDef(cmd.opcode) : void 0;
  const macroUsage = reactExports.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    if (!native) return map;
    for (let p = 0; p < native.patterns.length; p++) {
      for (const c of native.patterns[p]) {
        if (c.macro === void 0) continue;
        let entry = map.get(c.macro);
        if (!entry) {
          entry = { count: 0, patterns: /* @__PURE__ */ new Set(), notes: /* @__PURE__ */ new Set() };
          map.set(c.macro, entry);
        }
        entry.count++;
        entry.patterns.add(p);
        if (c.note !== void 0) entry.notes.add(c.note);
      }
    }
    return map;
  }, [native]);
  const sampleRefs = reactExports.useMemo(() => {
    const seen = /* @__PURE__ */ new Map();
    if (!native) return [];
    for (const m of native.macros) {
      let pendingAddr = null;
      for (const c of m.commands) {
        if (c.opcode === 2) {
          pendingAddr = (c.byte1 << 16 | c.byte2 << 8 | c.byte3) >>> 0;
        } else if (c.opcode === 3 && pendingAddr !== null) {
          const lenWords = c.byte2 << 8 | c.byte3;
          const key = `${pendingAddr.toString(16)}:${lenWords}`;
          let entry = seen.get(key);
          if (!entry) {
            entry = { addr: pendingAddr, lenWords, macros: /* @__PURE__ */ new Set() };
            seen.set(key, entry);
          }
          entry.macros.add(m.index);
          pendingAddr = null;
        }
      }
    }
    return Array.from(seen.values()).map((e) => ({ addr: e.addr, lenWords: e.lenWords, macros: Array.from(e.macros).sort((a, b) => a - b) })).sort((a, b) => a.addr - b.addr);
  }, [native]);
  const [showSamplePane, setShowSamplePane] = reactExports.useState(false);
  const labelForMacro = reactExports.useCallback((macroTableIndex) => {
    const usage = macroUsage.get(macroTableIndex);
    if (!usage || usage.count === 0) return "";
    const noteValues = Array.from(usage.notes);
    const minNote = Math.min(...noteValues);
    const maxNote = Math.max(...noteValues);
    let category;
    if (maxNote < 16) category = "bass";
    else if (minNote > 40) category = "lead";
    else if (usage.notes.size <= 2) category = "fx";
    else category = "mid";
    return `${category}·×${usage.count}`;
  }, [macroUsage]);
  const paramFields = reactExports.useMemo(() => {
    if (!cmd || !cmdDef) return [];
    return buildParamFields(cmd, cmdDef.layout);
  }, [cmd, cmdDef]);
  const handleOpcodeChange = reactExports.useCallback((newOpcode) => {
    if (!cmd) return;
    const newB0 = cmd.byte0 & 192 | newOpcode & 63;
    setMacroCommand(selectedMacroIdx, selectedStepIdx, newB0, cmd.byte1, cmd.byte2, cmd.byte3);
  }, [cmd, selectedMacroIdx, selectedStepIdx, setMacroCommand]);
  const handleFlagsChange = reactExports.useCallback((newFlags) => {
    if (!cmd) return;
    const newB0 = cmd.byte0 & 63 | newFlags & 192;
    setMacroCommand(selectedMacroIdx, selectedStepIdx, newB0, cmd.byte1, cmd.byte2, cmd.byte3);
  }, [cmd, selectedMacroIdx, selectedStepIdx, setMacroCommand]);
  const handleParamChange = reactExports.useCallback((field, raw) => {
    if (!cmd) return;
    let v;
    if (raw.startsWith("$") || raw.startsWith("0x")) {
      v = parseInt(raw.replace(/^(\$|0x)/, ""), 16);
    } else {
      v = parseInt(raw, 10);
    }
    if (!Number.isFinite(v)) return;
    v = Math.max(field.min, Math.min(field.max, v));
    const [nb1, nb2, nb3] = field.apply(cmd, v);
    setMacroCommand(selectedMacroIdx, selectedStepIdx, cmd.byte0, nb1, nb2, nb3);
  }, [cmd, selectedMacroIdx, selectedStepIdx, setMacroCommand]);
  const handleRawByteChange = reactExports.useCallback((byteIdx, raw) => {
    if (!cmd) return;
    let v = parseInt(raw, 16);
    if (!Number.isFinite(v)) return;
    v = Math.max(0, Math.min(255, v));
    const bytes = [cmd.byte0, cmd.byte1, cmd.byte2, cmd.byte3];
    bytes[byteIdx] = v;
    setMacroCommand(selectedMacroIdx, selectedStepIdx, bytes[0], bytes[1], bytes[2], bytes[3]);
  }, [cmd, selectedMacroIdx, selectedStepIdx, setMacroCommand]);
  if (!native || macros.length === 0) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      height,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--color-text-muted)",
      fontSize: "11px"
    }, children: "No TFMX macros loaded" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
      lineNumber: 480,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    display: "flex",
    height: `${height}px`,
    width: "100%",
    backgroundColor: "var(--color-bg)",
    color: "var(--color-text-secondary)",
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: "11px",
    borderTop: "1px solid var(--color-border)"
  }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      width: "120px",
      borderRight: "1px solid var(--color-border)",
      overflowY: "auto",
      backgroundColor: "var(--color-bg-tertiary)"
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        padding: "4px 8px",
        fontWeight: "bold",
        color: "#e0a050",
        borderBottom: "1px solid var(--color-border)",
        position: "sticky",
        top: 0,
        backgroundColor: "var(--color-bg-tertiary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
          "MACROS (",
          macros.length,
          ")"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
          lineNumber: 509,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setShowSamplePane(!showSamplePane),
            title: `${showSamplePane ? "Hide" : "Show"} sample browser`,
            style: {
              fontSize: "9px",
              padding: "1px 4px",
              cursor: "pointer",
              background: showSamplePane ? "rgba(136,192,192,0.2)" : "var(--color-bg)",
              color: "#88c0c0",
              border: "1px solid #88c0c0",
              borderRadius: "2px"
            },
            children: "SMP"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 510,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
        lineNumber: 503,
        columnNumber: 9
      }, void 0),
      macros.map((m, i) => {
        const usageLabel = labelForMacro(m.index);
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            onClick: () => {
              setSelectedMacroIdx(i);
              setSelectedStepIdx(0);
            },
            style: {
              padding: "3px 8px",
              cursor: "pointer",
              backgroundColor: i === selectedMacroIdx ? "rgba(224,160,80,0.2)" : "transparent",
              color: i === selectedMacroIdx ? "#e0a050" : "var(--color-text-secondary)",
              borderLeft: i === selectedMacroIdx ? "2px solid #e0a050" : "2px solid transparent"
            },
            title: usageLabel ? `Used ${usageLabel.split("·")[1]}` : "Unused in any pattern",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                hex2(m.index),
                " : ",
                m.length,
                "st"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                lineNumber: 534,
                columnNumber: 15
              }, void 0),
              usageLabel && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: "9px", color: "#88c0c0", marginTop: "1px" }, children: usageLabel }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                lineNumber: 536,
                columnNumber: 17
              }, void 0)
            ]
          },
          m.index,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 523,
            columnNumber: 13
          },
          void 0
        );
      })
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
      lineNumber: 499,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      width: "260px",
      borderRight: "1px solid var(--color-border)",
      overflowY: "auto",
      backgroundColor: "var(--color-bg-secondary)"
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        padding: "4px 8px",
        fontWeight: "bold",
        color: "#88c0c0",
        borderBottom: "1px solid var(--color-border)",
        position: "sticky",
        top: 0,
        backgroundColor: "var(--color-bg-secondary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "4px"
      }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "STEPS" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
          lineNumber: 556,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: "2px" }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => {
                const ok = insertStep(selectedMacroIdx, selectedStepIdx);
                if (!ok) console.warn("[TFMX] insert refused — macro is full");
              },
              title: "Insert NOP at selected step",
              style: macroBtn,
              children: "+"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
              lineNumber: 558,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => {
                const ok = duplicateStep(selectedMacroIdx, selectedStepIdx);
                if (!ok) console.warn("[TFMX] duplicate refused — macro is full");
              },
              title: "Duplicate selected step",
              style: macroBtn,
              children: "×2"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
              lineNumber: 566,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => {
                const ok = deleteStep(selectedMacroIdx, selectedStepIdx);
                if (!ok) console.warn("[TFMX] delete refused — last step");
                else setSelectedStepIdx(Math.max(0, selectedStepIdx - 1));
              },
              title: "Delete selected step",
              style: macroBtn,
              children: "−"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
              lineNumber: 574,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
          lineNumber: 557,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", fontWeight: "normal" }, children: [
          "@",
          hex8((macro == null ? void 0 : macro.fileOffset) ?? 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
          lineNumber: 584,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
        lineNumber: 550,
        columnNumber: 9
      }, void 0),
      macro == null ? void 0 : macro.commands.map((c, i) => {
        const def = findCmdDef(c.opcode);
        const isSel = i === selectedStepIdx;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            onClick: () => setSelectedStepIdx(i),
            style: {
              padding: "2px 8px",
              cursor: "pointer",
              backgroundColor: isSel ? "rgba(136,192,192,0.2)" : "transparent",
              color: isSel ? "#88c0c0" : "var(--color-text-secondary)",
              borderLeft: isSel ? "2px solid #88c0c0" : "2px solid transparent",
              display: "flex",
              gap: "6px",
              whiteSpace: "nowrap"
            },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", width: "24px" }, children: i.toString().padStart(3, "0") }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                lineNumber: 603,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#a0a0d0", width: "70px" }, children: [
                hex2(c.byte0),
                " ",
                hex2(c.byte1),
                " ",
                hex2(c.byte2),
                " ",
                hex2(c.byte3)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                lineNumber: 606,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { flex: 1 }, children: (def == null ? void 0 : def.mnemonic) ?? `?${hex2(c.opcode)}` }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                lineNumber: 609,
                columnNumber: 15
              }, void 0)
            ]
          },
          i,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 592,
            columnNumber: 13
          },
          void 0
        );
      })
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
      lineNumber: 546,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      flex: 1,
      padding: "8px 12px",
      overflowY: "auto"
    }, children: cmd && cmdDef && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        marginBottom: "10px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "8px"
      }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "2px" }, children: [
            "MACRO ",
            hex2(macro.index),
            " · STEP ",
            selectedStepIdx,
            " · @",
            hex8(cmd.fileOffset)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 626,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: "13px", fontWeight: "bold", color: "#e0a050" }, children: cmdDef.mnemonic }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 629,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: "10px", color: "var(--color-text-muted)", marginTop: "2px" }, children: cmdDef.description }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 632,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
          lineNumber: 625,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: "4px", alignItems: "center" }, children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: 0,
                max: 63,
                value: previewNote,
                onChange: (e) => setPreviewNote(Math.max(0, Math.min(63, parseInt(e.target.value) || 0))),
                title: "Note value (0-63) for preview audition",
                style: {
                  width: "40px",
                  fontSize: "10px",
                  padding: "3px 4px",
                  background: "var(--color-bg)",
                  color: "#c084fc",
                  border: "1px solid #c084fc",
                  borderRadius: "3px",
                  fontFamily: "inherit",
                  textAlign: "center"
                }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                lineNumber: 638,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => previewMacro(macro.index),
                title: "Trigger this macro on voice 0 at the chosen note. Requires playback to be running so the WASM renders audio.",
                style: {
                  fontSize: "10px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  background: "rgba(192,132,252,0.15)",
                  color: "#c084fc",
                  border: "1px solid #c084fc",
                  borderRadius: "3px",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap"
                },
                children: "♪ Preview"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                lineNumber: 652,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => {
                  const ok = seekToUsage(macro.index);
                  if (!ok) console.warn("[TFMX] selected macro is unused — nothing to seek to");
                },
                title: "Find a song position where this macro is used and seek the player there",
                style: {
                  fontSize: "10px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  background: "rgba(136,192,192,0.15)",
                  color: "#88c0c0",
                  border: "1px solid #88c0c0",
                  borderRadius: "3px",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap"
                },
                children: "▶ Find Usage"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                lineNumber: 664,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: reloadAudio,
                title: "Reload the running TFMX WASM with edited mdat — applies all macro edits to live playback",
                style: {
                  fontSize: "10px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  background: "rgba(224,160,80,0.15)",
                  color: "#e0a050",
                  border: "1px solid #e0a050",
                  borderRadius: "3px",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap"
                },
                children: "⟳ Reload Audio"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                lineNumber: 679,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 637,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "label",
            {
              style: {
                fontSize: "9px",
                color: "var(--color-text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer",
                userSelect: "none"
              },
              title: "Push every edit to the running WASM after a 200ms debounce",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "input",
                  {
                    type: "checkbox",
                    checked: autoReload,
                    onChange: (e) => setAutoReload(e.target.checked),
                    style: { margin: 0 }
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                    lineNumber: 700,
                    columnNumber: 19
                  },
                  void 0
                ),
                "auto-reload"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
              lineNumber: 692,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
          lineNumber: 636,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
        lineNumber: 621,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { style: { width: "70px", color: "var(--color-text-muted)" }, children: "Opcode" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
          lineNumber: 713,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(cmd.opcode),
            onChange: (v) => handleOpcodeChange(Number(v)),
            options: TFMX_MACRO_COMMANDS.map((d) => ({ value: String(d.opcode), label: `${hex2(d.opcode)} — ${d.mnemonic}` }))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 714,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
        lineNumber: 712,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { style: { width: "70px", color: "var(--color-text-muted)" }, children: "Flags" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
          lineNumber: 723,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(cmd.flags),
            onChange: (v) => handleFlagsChange(Number(v)),
            options: [
              { value: String(0), label: "00 — none" },
              { value: String(64), label: "40 — keyup wait" },
              { value: String(128), label: "80 — pause flag" },
              { value: String(192), label: "C0 — both" }
            ]
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 724,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
        lineNumber: 722,
        columnNumber: 13
      }, void 0),
      paramFields.length === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "var(--color-text-muted)", fontStyle: "italic", marginBottom: "8px" }, children: "No parameters" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
        lineNumber: 738,
        columnNumber: 15
      }, void 0),
      paramFields.map((field, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginBottom: "4px"
      }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { style: { width: "70px", color: "var(--color-text-muted)" }, children: field.label }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
          lineNumber: 746,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "text",
            defaultValue: field.display,
            onBlur: (e) => handleParamChange(field, e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") e.target.blur();
            },
            style: {
              width: "100px",
              fontSize: "11px",
              padding: "2px 4px",
              fontFamily: "inherit",
              background: "var(--color-bg)",
              color: "#e0e0e0",
              border: "1px solid var(--color-border)",
              borderRadius: "2px"
            }
          },
          `${selectedMacroIdx}-${selectedStepIdx}-${i}-${field.value}`,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 747,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", fontSize: "10px" }, children: [
          "[",
          field.min,
          "..",
          field.max,
          "]"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
          lineNumber: 762,
          columnNumber: 17
        }, void 0)
      ] }, i, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
        lineNumber: 743,
        columnNumber: 15
      }, void 0)),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { marginTop: "14px", borderTop: "1px solid var(--color-border)", paddingTop: "8px" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            onClick: () => setShowRaw(!showRaw),
            style: {
              cursor: "pointer",
              color: "var(--color-text-muted)",
              fontSize: "10px",
              marginBottom: "4px"
            },
            children: [
              showRaw ? "▼" : "▶",
              " RAW BYTES"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 770,
            columnNumber: 15
          },
          void 0
        ),
        showRaw && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: "8px" }, children: [
          [0, 1, 2, 3].map((i) => {
            const b = [cmd.byte0, cmd.byte1, cmd.byte2, cmd.byte3][i];
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" }, children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", fontSize: "9px" }, children: [
                "b",
                i
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                lineNumber: 785,
                columnNumber: 25
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "text",
                  defaultValue: hex2(b),
                  onBlur: (e) => handleRawByteChange(i, e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === "Enter") e.target.blur();
                  },
                  style: {
                    width: "36px",
                    fontSize: "11px",
                    padding: "2px 4px",
                    textAlign: "center",
                    fontFamily: "inherit",
                    background: "var(--color-bg)",
                    color: "#a0a0d0",
                    border: "1px solid var(--color-border)",
                    borderRadius: "2px"
                  }
                },
                `raw-${selectedMacroIdx}-${selectedStepIdx}-${i}-${b}`,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
                  lineNumber: 786,
                  columnNumber: 25
                },
                void 0
              )
            ] }, i, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
              lineNumber: 784,
              columnNumber: 23
            }, void 0);
          }),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { alignSelf: "flex-end", color: "var(--color-text-muted)", fontSize: "10px" }, children: [
            "raw=$",
            hex8(cmd.raw)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 804,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
          lineNumber: 780,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
        lineNumber: 769,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
      lineNumber: 620,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
      lineNumber: 616,
      columnNumber: 7
    }, void 0),
    showSamplePane && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      SampleBrowserPane,
      {
        entries: sampleRefs.map((s, i) => ({
          id: i,
          name: `$${hex8(s.addr)}`,
          sizeBytes: s.lenWords * 2
        })),
        emptyMessage: "No SetBegin/SetLen pairs found in any macro.",
        renderEntry: (entry) => {
          const s = sampleRefs[entry.id];
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary font-mono", children: [
              "$",
              hex8(s.addr)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
              lineNumber: 827,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted mt-0.5", children: [
              s.lenWords * 2,
              " bytes (",
              s.lenWords,
              "w)"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
              lineNumber: 830,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-0.5 text-[9px] text-accent-primary", children: [
              s.macros.length,
              " macro",
              s.macros.length === 1 ? "" : "s",
              ": ",
              s.macros.slice(0, 6).map((m) => hex2(m)).join(" "),
              s.macros.length > 6 && "…"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
              lineNumber: 833,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
            lineNumber: 826,
            columnNumber: 15
          }, void 0);
        }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
        lineNumber: 816,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/tfmx/TFMXMacroEditor.tsx",
    lineNumber: 492,
    columnNumber: 5
  }, void 0);
};
export {
  TFMXMacroEditor
};
