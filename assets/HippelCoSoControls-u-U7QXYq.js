import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, D as Download } from "./vendor-ui-AJ7AT9BN.js";
import { R as useTrackerStore, cE as HippelCoSoSynth, aA as UADEEngine, aB as Knob } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { S as SequenceEditor } from "./SequenceEditor-Byjrj1oK.js";
import { S as SampleBrowserPane } from "./SampleBrowserPane-B7s228O0.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const FSEQ_PRESETS = [
  { name: "Vibrato", data: [0, 3, 5, 3, 0, -3, -5, -3], loop: 0 },
  { name: "Slide Up", data: [-12, -9, -6, -3, 0], loop: 4 },
  { name: "Slide Dn", data: [12, 9, 6, 3, 0], loop: 4 },
  { name: "Tremolo", data: [0, 6, 12, 6], loop: 0 },
  { name: "Flat", data: [0] }
];
const VSEQ_PRESETS = [
  { name: "Attack-Dec", data: [0, 16, 32, 48, 63, 48, 32, 20, 12, 8, 4, 2, 1, 0] },
  { name: "Organ", data: [63, 63, 50, 40, 38, 35, 33, 30], loop: 7 },
  { name: "Pluck", data: [63, 50, 40, 30, 22, 16, 10, 6, 3, 1, 0] },
  { name: "Pad", data: [0, 8, 18, 30, 42, 54, 63], loop: 6 },
  { name: "Full", data: [63], loop: 0 }
];
const HippelCoSoControls = ({
  config,
  onChange,
  fseqPlaybackPosition,
  vseqPlaybackPosition,
  uadeChipRam,
  instrumentId
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("main");
  const [showSamplePane, setShowSamplePane] = reactExports.useState(false);
  const sampleRows = reactExports.useMemo(() => {
    return (config.sampleBank ?? []).map((s) => ({
      index: s.index,
      pointer: s.pointer,
      length: s.length,
      loopStart: s.loopStart,
      repeatLength: s.repeatLength,
      hasLoop: s.repeatLength > 2
    }));
  }, [config.sampleBank]);
  const findUsage = reactExports.useCallback(() => {
    if (instrumentId === void 0) return false;
    const store = useTrackerStore.getState();
    const patterns = store.patterns;
    const order = store.patternOrder;
    const usingPatternIdx = /* @__PURE__ */ new Set();
    for (let p = 0; p < patterns.length; p++) {
      const pat = patterns[p];
      if (!pat) continue;
      outer: for (const ch of pat.channels) {
        for (const row of ch.rows) {
          if (row && row.instrument === instrumentId) {
            usingPatternIdx.add(p);
            break outer;
          }
        }
      }
    }
    if (usingPatternIdx.size === 0) return false;
    for (let i = 0; i < order.length; i++) {
      if (usingPatternIdx.has(order[i])) {
        store.setCurrentPosition(i, false);
        return true;
      }
    }
    return false;
  }, [instrumentId]);
  const [previewNote, setPreviewNote] = reactExports.useState(48);
  const previewSynthRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    return () => {
      var _a;
      (_a = previewSynthRef.current) == null ? void 0 : _a.dispose();
      previewSynthRef.current = null;
    };
  }, []);
  const handlePreview = reactExports.useCallback(async () => {
    let synth = previewSynthRef.current;
    if (!synth) {
      synth = new HippelCoSoSynth();
      previewSynthRef.current = synth;
      synth.output.connect(synth.output.context.destination);
    }
    await synth.setInstrument(config);
    synth.triggerAttack(previewNote);
    setTimeout(() => synth.triggerRelease(), 800);
  }, [config, previewNote]);
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
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#44aaff", { knob: "#66bbff", dim: "#001833" });
  const updU8WithChipRam = reactExports.useCallback(
    (key, value, byteOffset) => {
      onChange({ [key]: value });
      if (uadeChipRam && typeof value === "number") {
        const editor = getEditor();
        if (editor) {
          void editor.writeU8(uadeChipRam.instrBase + byteOffset, value & 255);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, uadeChipRam]
  );
  const updS8WithChipRam = reactExports.useCallback(
    (key, value, byteOffset) => {
      onChange({ [key]: value });
      if (uadeChipRam && typeof value === "number") {
        const editor = getEditor();
        if (editor) {
          void editor.writeU8(uadeChipRam.instrBase + byteOffset, value < 0 ? 256 + value : value);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, uadeChipRam]
  );
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
  }, [onChange]);
  function encodeSequence(values) {
    let end = values.length;
    while (end > 0) {
      const v = values[end - 1];
      if (v >= -31 && v <= -25) end--;
      else break;
    }
    const out = new Uint8Array(end + 1);
    for (let i = 0; i < end; i++) {
      const v = values[i] | 0;
      out[i] = v < 0 ? 256 + v & 255 : v & 255;
    }
    out[end] = 256 + -31;
    return out;
  }
  const writeSeqToChipRam = reactExports.useCallback((kind, values) => {
    if (!uadeChipRam) return;
    const sections = uadeChipRam.sections;
    const addr = kind === "fseq" ? sections.fseqBodyAddr : sections.vseqBodyAddr;
    const budget = kind === "fseq" ? sections.fseqBodyMaxLen : sections.vseqBodyMaxLen;
    if (addr === void 0 || budget === void 0) return;
    if (addr === 4294967295 || budget === 0) return;
    const encoded = encodeSequence(values);
    if (encoded.length > budget) {
      console.warn(
        `[HippelCoSo] ${kind} sequence overflow — edit rejected (encoded ${encoded.length} bytes > budget ${budget} bytes)`
      );
      return;
    }
    const editor = getEditor();
    if (!editor) return;
    const padded = new Uint8Array(budget);
    padded.set(encoded, 0);
    void editor.writeBytes(addr, padded);
  }, [uadeChipRam]);
  const writeFseqToChipRam = reactExports.useCallback((values) => {
    writeSeqToChipRam("fseq", values);
  }, [writeSeqToChipRam]);
  const writeVseqToChipRam = reactExports.useCallback((values) => {
    writeSeqToChipRam("vseq", values);
  }, [writeSeqToChipRam]);
  const renderMain = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Timing" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
        lineNumber: 278,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.volSpeed,
          min: 1,
          max: 16,
          step: 1,
          onChange: (v) => updU8WithChipRam("volSpeed", Math.round(v), 0),
          label: "Vol Speed",
          color: knob,
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
          lineNumber: 280,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
        lineNumber: 279,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted mt-1 block", children: "ticks per vseq step" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
        lineNumber: 288,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
      lineNumber: 277,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
        lineNumber: 293,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibDelay,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8WithChipRam("vibDelay", Math.round(v), 4),
            label: "Delay",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
            lineNumber: 295,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibSpeed,
            min: -128,
            max: 127,
            step: 1,
            onChange: (v) => updS8WithChipRam("vibSpeed", Math.round(v), 2),
            label: "Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
            lineNumber: 302,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibDepth,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => updU8WithChipRam("vibDepth", Math.round(v), 3),
            label: "Depth",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
            lineNumber: 309,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
        lineNumber: 294,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
      lineNumber: 292,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
    lineNumber: 275,
    columnNumber: 5
  }, void 0);
  const renderSequences = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Frequency Sequence" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
        lineNumber: 327,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        SequenceEditor,
        {
          label: "fseq",
          data: config.fseq,
          onChange: (d) => {
            upd("fseq", d);
            writeFseqToChipRam(d);
          },
          min: -127,
          max: 127,
          bipolar: true,
          showNoteNames: true,
          presets: FSEQ_PRESETS,
          playbackPosition: fseqPlaybackPosition,
          color: accent,
          height: 80
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
          lineNumber: 328,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[9px] text-text-muted mt-1", children: "Relative pitch offsets per step (semitones). Use the loop marker (L) to set loop point." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
        lineNumber: 340,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
      lineNumber: 326,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume Sequence" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
        lineNumber: 347,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        SequenceEditor,
        {
          label: "vseq",
          data: config.vseq.map((v) => Math.max(0, v)),
          onChange: (d) => {
            upd("vseq", d);
            writeVseqToChipRam(d);
          },
          min: 0,
          max: 63,
          presets: VSEQ_PRESETS,
          playbackPosition: vseqPlaybackPosition,
          color: knob,
          height: 80
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
          lineNumber: 348,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[9px] text-text-muted mt-1", children: "Volume level per step (0–63). Sequence loops at the loop point." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
        lineNumber: 358,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
      lineNumber: 346,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
    lineNumber: 323,
    columnNumber: 5
  }, void 0);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center border-b", style: { borderColor: dim }, children: [
      [["main", "Parameters"], ["sequences", "Sequences"]].map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab(id),
          className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
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
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
          lineNumber: 369,
          columnNumber: 11
        },
        void 0
      )),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "ml-auto flex items-center gap-1 mr-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "number",
            min: 0,
            max: 95,
            value: previewNote,
            onChange: (e) => setPreviewNote(Math.max(0, Math.min(95, parseInt(e.target.value) || 0))),
            title: "MIDI note (0-95) for preview audition",
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
            lineNumber: 383,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => void handlePreview(),
            title: "Play a preview note using this instrument",
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
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
            lineNumber: 397,
            columnNumber: 11
          },
          void 0
        ),
        instrumentId !== void 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              const ok = findUsage();
              if (!ok) {
                console.warn("[HippelCoSo] instrument is unused — nothing to seek to");
              }
            },
            title: "Find a song position where this instrument is used and seek the player there",
            className: "px-2 py-1 text-[10px] font-mono bg-dark-bg hover:bg-dark-bgSecondary border border-dark-border rounded text-accent-primary hover:border-accent-primary/60 transition-colors",
            children: "▶ Find Usage"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
            lineNumber: 410,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setShowSamplePane((v) => !v),
            title: `${showSamplePane ? "Hide" : "Show"} sample browser`,
            className: `px-2 py-1 text-[10px] font-mono border rounded transition-colors ${showSamplePane ? "bg-accent-primary/20 text-accent-primary border-accent-primary/60" : "bg-dark-bg text-text-secondary border-dark-border hover:text-accent-primary hover:border-accent-primary/50"}`,
            children: "SMP"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
            lineNumber: 423,
            columnNumber: 11
          },
          void 0
        ),
        uadeChipRam && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              const editor = getEditor();
              if (editor && uadeChipRam) {
                editor.exportModule(uadeChipRam.moduleBase, uadeChipRam.moduleSize, "module.hipc").catch(console.error);
              }
            },
            className: "flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-dark-bgSecondary hover:bg-dark-bg border border-dark-border rounded transition-colors",
            title: "Export module with current edits",
            style: { color: accent },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Download, { size: 10 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
                lineNumber: 447,
                columnNumber: 15
              }, void 0),
              "Export .hipc"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
            lineNumber: 435,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
        lineNumber: 382,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
      lineNumber: 367,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 min-h-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0", children: [
        activeTab === "main" && renderMain(),
        activeTab === "sequences" && renderSequences()
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
        lineNumber: 454,
        columnNumber: 9
      }, void 0),
      showSamplePane && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        SampleBrowserPane,
        {
          width: 240,
          entries: sampleRows.map((s) => ({
            id: s.index,
            name: `${String(s.index).padStart(2, "0")}. sample`,
            sizeBytes: s.length
          })),
          emptyMessage: "No sample bank — this song carries no COSO sample headers.",
          renderEntry: (entry) => {
            const s = sampleRows.find((r) => r.index === entry.id);
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono truncate text-text-primary", children: [
                String(s.index).padStart(2, "0"),
                ". sample"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
                lineNumber: 471,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted mt-0.5", children: [
                s.length,
                " bytes",
                s.hasLoop && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-1 text-accent-success", children: "·loop" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
                  lineNumber: 476,
                  columnNumber: 35
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
                lineNumber: 474,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-0.5 text-[9px] text-text-muted font-mono", children: [
                "ptr 0x",
                s.pointer.toString(16),
                s.hasLoop && ` · rep ${s.repeatLength}`
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
                lineNumber: 478,
                columnNumber: 19
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
              lineNumber: 470,
              columnNumber: 17
            }, void 0);
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
          lineNumber: 459,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
      lineNumber: 453,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/HippelCoSoControls.tsx",
    lineNumber: 366,
    columnNumber: 5
  }, void 0);
};
export {
  HippelCoSoControls
};
