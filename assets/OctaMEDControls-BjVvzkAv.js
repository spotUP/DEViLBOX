import { R as useTrackerStore, e as useInstrumentStore, az as useProjectStore, ax as useTransportStore, am as __vitePreload, aA as UADEEngine, aB as Knob } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { S as SequenceEditor } from "./SequenceEditor-Byjrj1oK.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
function voltblCellClass(v) {
  if (v === 255) return "loop";
  if (v === 254) return "stop";
  if (v >= 128 && v <= 191) return "wait";
  return "vol";
}
function wftblCellClass(v) {
  if (v === 255) return "loop";
  if (v === 254) return "stop";
  if (v >= 128 && v <= 191) return "wait";
  if (v >= 0 && v <= 9) return "wavesel";
  return "other";
}
const OctaMEDControls = ({ config, onChange, uadeChipRam }) => {
  const [activeTab, setActiveTab] = reactExports.useState("params");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const chipEditorRef = reactExports.useRef(null);
  function getEditor() {
    if (!uadeChipRam) return null;
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }
  const handleExport = reactExports.useCallback(() => {
    const editor = getEditor();
    if (!editor || !uadeChipRam) return;
    void editor.exportModule(uadeChipRam.moduleBase, uadeChipRam.moduleSize, "module.med");
  }, [uadeChipRam]);
  const [exportingMod, setExportingMod] = reactExports.useState(false);
  const handleExportMod = reactExports.useCallback(async () => {
    var _a, _b;
    setExportingMod(true);
    try {
      const trackerState = useTrackerStore.getState();
      const instrumentState = useInstrumentStore.getState();
      const projectState = useProjectStore.getState();
      const transportState = useTransportStore.getState();
      const nChannels = ((_a = trackerState.patterns[0]) == null ? void 0 : _a.channels.length) ?? 4;
      const song = {
        name: ((_b = projectState.metadata) == null ? void 0 : _b.name) ?? "Untitled",
        format: "MED",
        patterns: trackerState.patterns,
        instruments: instrumentState.instruments,
        songPositions: trackerState.patternOrder,
        songLength: trackerState.patternOrder.length,
        restartPosition: 0,
        numChannels: nChannels,
        initialSpeed: transportState.speed,
        initialBPM: transportState.bpm
      };
      const { exportSongToMOD } = await __vitePreload(async () => {
        const { exportSongToMOD: exportSongToMOD2 } = await import("./modExport-CKzh04Ua.js");
        return { exportSongToMOD: exportSongToMOD2 };
      }, true ? [] : void 0);
      const result = await exportSongToMOD(song, { bakeSynths: true });
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[OctaMEDControls] Export MOD failed:", err);
    } finally {
      setExportingMod(false);
    }
  }, []);
  const numChannels = useTrackerStore((s) => {
    var _a;
    return ((_a = s.patterns[0]) == null ? void 0 : _a.channels.length) ?? 4;
  });
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#44aaff", { knob: "#66bbff", dim: "#001833" });
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
    const editor = getEditor();
    if (!editor || !uadeChipRam) return;
    const base = uadeChipRam.instrBase;
    if (key === "voltblSpeed") {
      void editor.writeU8(base + 18, value);
    } else if (key === "wfSpeed") {
      void editor.writeU8(base + 19, value);
    } else if (key === "loopStart") {
      void editor.writeU16(base + 10, Math.floor(value / 2));
    } else if (key === "loopLen") {
      void editor.writeU16(base + 12, Math.floor(value / 2));
    } else if (key === "voltbl") {
      void editor.writeBlock(base + 22, Array.from(value));
    } else if (key === "wftbl") {
      void editor.writeBlock(base + 150, Array.from(value));
    }
  }, [onChange, uadeChipRam]);
  const renderParams = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Playback" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 139,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.volume,
            min: 0,
            max: 64,
            step: 1,
            onChange: (v) => upd("volume", Math.round(v)),
            label: "Volume",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
            lineNumber: 141,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.voltblSpeed,
            min: 0,
            max: 15,
            step: 1,
            onChange: (v) => upd("voltblSpeed", Math.round(v)),
            label: "Vol Tbl Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
            lineNumber: 152,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.wfSpeed,
            min: 0,
            max: 15,
            step: 1,
            onChange: (v) => upd("wfSpeed", Math.round(v)),
            label: "WF Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
            lineNumber: 162,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoSpeed,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => upd("vibratoSpeed", Math.round(v)),
            label: "Vibrato Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
            lineNumber: 172,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 140,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-[10px] text-text-muted", children: "Vol Tbl Speed / WF Speed: 0 = execute every output block" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 183,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
      lineNumber: 138,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Loop" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 190,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] uppercase tracking-wider", style: { color: accent, opacity: 0.5 }, children: "Loop Start (bytes)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
            lineNumber: 193,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "number",
              min: 0,
              step: 2,
              value: config.loopStart,
              onChange: (e) => upd("loopStart", Math.max(0, parseInt(e.target.value) || 0)),
              className: "w-24 text-sm font-mono border rounded px-2 py-1",
              style: { background: "#001833", borderColor: dim, color: accent }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
              lineNumber: 196,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
          lineNumber: 192,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] uppercase tracking-wider", style: { color: accent, opacity: 0.5 }, children: "Loop Length (bytes)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
            lineNumber: 207,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "number",
              min: 0,
              step: 2,
              value: config.loopLen,
              onChange: (e) => upd("loopLen", Math.max(0, parseInt(e.target.value) || 0)),
              className: "w-24 text-sm font-mono border rounded px-2 py-1",
              style: { background: "#001833", borderColor: dim, color: accent }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
              lineNumber: 210,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
          lineNumber: 206,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 191,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
      lineNumber: 189,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
    lineNumber: 136,
    columnNumber: 5
  }, void 0);
  const renderVoltbl = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vol Command Table (128 bytes)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
      lineNumber: 229,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 mb-3 text-[10px] font-mono", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: accent }, children: "FF = loop at current volume" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 233,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#ff4444" }, children: "FE = stop" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 234,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)" }, children: "00–40 = set volume (0–64)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 235,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-secondary)" }, children: "80–BF = wait N ticks" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 236,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
      lineNumber: 232,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-0.5", style: { gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }, children: Array.from(config.voltbl).map((v, i) => {
      const cls = voltblCellClass(v);
      let bg = "#111";
      let color = "#555";
      if (cls === "loop") {
        bg = "#001a1a";
        color = accent;
      }
      if (cls === "stop") {
        bg = "#1a0000";
        color = "#ff4444";
      }
      if (cls === "wait") {
        bg = "#0a0a0a";
        color = "#777";
      }
      if (cls === "vol" && v > 0) {
        bg = "#001022";
        color = "#3399cc";
      }
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] font-mono mb-0.5", style: { color: "var(--color-border-light)" }, children: i.toString(16).padStart(2, "0").toUpperCase() }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
          lineNumber: 251,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "number",
            value: v,
            min: 0,
            max: 255,
            onChange: (e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) {
                const newArr = new Uint8Array(configRef.current.voltbl);
                newArr[i] = Math.max(0, Math.min(255, val));
                upd("voltbl", newArr);
              }
            },
            className: "text-[9px] font-mono text-center border rounded py-0.5",
            style: {
              width: "100%",
              background: bg,
              borderColor: cls !== "vol" || v > 0 ? dim : "var(--color-bg-tertiary)",
              color,
              minWidth: 0,
              padding: "2px 1px"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
            lineNumber: 254,
            columnNumber: 17
          },
          void 0
        )
      ] }, i, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 250,
        columnNumber: 15
      }, void 0);
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
      lineNumber: 239,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
    lineNumber: 228,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
    lineNumber: 227,
    columnNumber: 5
  }, void 0);
  const renderWftbl = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "WF Command Table (128 bytes)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
      lineNumber: 289,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-3 mb-3 text-[10px] font-mono", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: accent }, children: "FF = loop" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 293,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#ff4444" }, children: "FE = stop" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 294,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#44cc88" }, children: "00–09 = select waveform 0–9" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 295,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-secondary)" }, children: "80–BF = wait N ticks" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 296,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
      lineNumber: 292,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-0.5", style: { gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }, children: Array.from(config.wftbl).map((v, i) => {
      const cls = wftblCellClass(v);
      let bg = "#111";
      let color = "#555";
      if (cls === "loop") {
        bg = "#001a1a";
        color = accent;
      }
      if (cls === "stop") {
        bg = "#1a0000";
        color = "#ff4444";
      }
      if (cls === "wait") {
        bg = "#0a0a0a";
        color = "#777";
      }
      if (cls === "wavesel") {
        bg = "#001a08";
        color = "#44cc88";
      }
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] font-mono mb-0.5", style: { color: "var(--color-border-light)" }, children: i.toString(16).padStart(2, "0").toUpperCase() }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
          lineNumber: 311,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "number",
            value: v,
            min: 0,
            max: 255,
            onChange: (e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) {
                const newArr = new Uint8Array(configRef.current.wftbl);
                newArr[i] = Math.max(0, Math.min(255, val));
                upd("wftbl", newArr);
              }
            },
            className: "text-[9px] font-mono text-center border rounded py-0.5",
            style: {
              width: "100%",
              background: bg,
              borderColor: cls !== "other" ? dim : "var(--color-bg-tertiary)",
              color,
              minWidth: 0,
              padding: "2px 1px"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
            lineNumber: 314,
            columnNumber: 17
          },
          void 0
        )
      ] }, i, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 310,
        columnNumber: 15
      }, void 0);
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
      lineNumber: 299,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
    lineNumber: 288,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
    lineNumber: 287,
    columnNumber: 5
  }, void 0);
  const renderWaveform = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    config.waveforms.map((wf, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: `Wave ${idx + 1}` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 350,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        SequenceEditor,
        {
          label: `Wave ${idx + 1}`,
          data: Array.from(wf),
          onChange: (d) => {
            const newWaveforms = configRef.current.waveforms.map(
              (w, i) => i === idx ? new Int8Array(d) : w
            );
            onChange({ waveforms: newWaveforms });
          },
          min: -128,
          max: 127,
          bipolar: true,
          fixedLength: true,
          color: knob,
          height: 72
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
          lineNumber: 351,
          columnNumber: 11
        },
        void 0
      )
    ] }, idx, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
      lineNumber: 349,
      columnNumber: 9
    }, void 0)),
    config.waveforms.length === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted p-3", children: "No waveforms defined." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
      lineNumber: 370,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
    lineNumber: 347,
    columnNumber: 5
  }, void 0);
  const TAB_LABELS = [
    ["params", "Parameters"],
    ["voltbl", "Vol Table"],
    ["wftbl", "WF Table"],
    ["waveform", "Waveforms"]
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b items-center", style: { borderColor: dim }, children: [
      TAB_LABELS.map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab(id),
          className: "px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
          style: {
            color: activeTab === id ? accent : "#666",
            borderBottom: activeTab === id ? `2px solid ${accent}` : "2px solid transparent",
            background: activeTab === id ? isCyan ? "#041510" : "#000e1a" : "transparent"
          },
          children: label
        },
        id,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
          lineNumber: 387,
          columnNumber: 11
        },
        void 0
      )),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "ml-auto flex items-center gap-2 mr-2", children: [
        numChannels <= 4 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              void handleExportMod();
            },
            disabled: exportingMod,
            className: "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border rounded transition-colors",
            style: { color: exportingMod ? "#444" : accent, borderColor: dim, background: "transparent", cursor: exportingMod ? "wait" : "pointer" },
            children: exportingMod ? "Exporting..." : "Export .mod"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
            lineNumber: 402,
            columnNumber: 13
          },
          void 0
        ),
        uadeChipRam && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleExport,
            className: "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border rounded transition-colors",
            style: { color: accent, borderColor: dim, background: "transparent" },
            children: "Export .med"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
            lineNumber: 412,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
        lineNumber: 400,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
      lineNumber: 385,
      columnNumber: 7
    }, void 0),
    activeTab === "params" && renderParams(),
    activeTab === "voltbl" && renderVoltbl(),
    activeTab === "wftbl" && renderWftbl(),
    activeTab === "waveform" && renderWaveform()
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/OctaMEDControls.tsx",
    lineNumber: 383,
    columnNumber: 5
  }, void 0);
};
export {
  OctaMEDControls
};
