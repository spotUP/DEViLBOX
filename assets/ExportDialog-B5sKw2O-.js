import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, X, D as Download, U as Upload, ai as FileMusic, Z as Zap, e as Settings, V as Volume2, M as Music2, j as Cpu } from "./vendor-ui-AJ7AT9BN.js";
import { R as useTrackerStore, aq as useFormatStore, e as useInstrumentStore, az as useProjectStore, ax as useTransportStore, P as notify, d9 as useAutomationStore, a as useUIStore, X as FileSaver_minExports } from "./main-BbV5VyEH.js";
import { u as useExportDialog } from "./useExportDialog-BsJBFWkX.js";
import { getUADEInstrument, exportUADEAsWav, exportSongAsWav, exportPatternAsWav } from "./audioExport-CBM9EItl.js";
import { exportSongToMIDI, exportPatternToMIDI } from "./midiExport-BvJVaxgH.js";
import { exportWithOpenMPT } from "./OpenMPTExporter-CTwKLtBQ.js";
import { ChipRecordingSession, FORMAT_INFO, getLogStatistics, exportChipMusic, parseRegisterLog, getAvailableFormats } from "./ChipExporter-CeAdgJMA.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./FurnaceFileOps-c7uBibmq.js";
import "./OpenMPTSoundlib-RubRPKN7.js";
const AudioExportPanel = ({
  handlerRef,
  selectedPatternIndex,
  setSelectedPatternIndex,
  isRendering,
  setIsRendering,
  renderProgress,
  setRenderProgress,
  initialScope
}) => {
  var _a;
  const { patterns } = useTrackerStore();
  const { originalModuleData } = useFormatStore();
  const { instruments } = useInstrumentStore();
  const { metadata } = useProjectStore();
  const { bpm } = useTransportStore();
  const [audioExportScope, setAudioExportScope] = reactExports.useState(initialScope === "arrangement" ? "song" : initialScope || "pattern");
  reactExports.useEffect(() => {
    if (initialScope) setAudioExportScope(initialScope === "arrangement" ? "song" : initialScope);
  }, [initialScope]);
  handlerRef.current = async () => {
    var _a2;
    setIsRendering(true);
    setRenderProgress(0);
    try {
      const uadeInst = getUADEInstrument(instruments);
      if ((_a2 = uadeInst == null ? void 0 : uadeInst.uade) == null ? void 0 : _a2.fileData) {
        await exportUADEAsWav(
          uadeInst.uade.fileData,
          uadeInst.uade.filename,
          `${metadata.name || "song"}.wav`,
          uadeInst.uade.currentSubsong ?? 0,
          (progress) => setRenderProgress(progress)
        );
      } else if (originalModuleData == null ? void 0 : originalModuleData.base64) {
        const binaryStr = atob(originalModuleData.base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const fileData = bytes.buffer;
        const sourceFilename = originalModuleData.sourceFile || `module.${originalModuleData.format.toLowerCase()}`;
        await exportUADEAsWav(
          fileData,
          sourceFilename,
          `${metadata.name || "song"}.wav`,
          0,
          (progress) => setRenderProgress(progress)
        );
      } else if (audioExportScope === "song") {
        const sequence = patterns.map((_, index) => index);
        await exportSongAsWav(
          patterns,
          sequence,
          instruments,
          bpm,
          `${metadata.name || "song"}.wav`,
          (progress) => setRenderProgress(progress)
        );
      } else {
        const pattern = patterns[selectedPatternIndex];
        if (!pattern) {
          notify.warning("Please select a valid pattern");
          return false;
        }
        await exportPatternAsWav(
          pattern,
          instruments,
          bpm,
          `${pattern.name || "pattern"}.wav`,
          (progress) => setRenderProgress(progress)
        );
      }
    } finally {
      setIsRendering(false);
      setRenderProgress(0);
    }
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-mono font-bold text-accent-primary mb-3", children: "Audio Export (WAV)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
      lineNumber: 104,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setAudioExportScope("pattern"),
            disabled: isRendering,
            className: `
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${audioExportScope === "pattern" ? "bg-accent-primary text-text-inverse" : "bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border"}
            `,
            children: "Single Pattern"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
            lineNumber: 110,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setAudioExportScope("song"),
            disabled: isRendering,
            className: `
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${audioExportScope === "song" ? "bg-accent-primary text-text-inverse" : "bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border"}
            `,
            children: [
              "Full Song (",
              patterns.length,
              " patterns)"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
            lineNumber: 123,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
        lineNumber: 109,
        columnNumber: 9
      }, void 0),
      audioExportScope === "pattern" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-1", children: "Pattern to Render" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
          lineNumber: 141,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "select",
          {
            value: selectedPatternIndex,
            onChange: (e) => setSelectedPatternIndex(Number(e.target.value)),
            className: "input w-full",
            disabled: isRendering,
            children: patterns.map((pattern, index) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("option", { value: index, children: [
              index.toString().padStart(2, "0"),
              " - ",
              pattern.name
            ] }, pattern.id, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
              lineNumber: 151,
              columnNumber: 17
            }, void 0))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
            lineNumber: 144,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
        lineNumber: 140,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-text-secondary space-y-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "Format: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "WAV (16-bit, 44.1kHz)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
            lineNumber: 160,
            columnNumber: 24
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
          lineNumber: 160,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "BPM: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: bpm }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
            lineNumber: 161,
            columnNumber: 21
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
          lineNumber: 161,
          columnNumber: 11
        }, void 0),
        audioExportScope === "song" ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            "Patterns: ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: patterns.length }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
              lineNumber: 164,
              columnNumber: 30
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
            lineNumber: 164,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            "Total Rows: ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: patterns.reduce((sum, p) => sum + p.length, 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
              lineNumber: 165,
              columnNumber: 32
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
            lineNumber: 165,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
          lineNumber: 163,
          columnNumber: 13
        }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "Length: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: [
            ((_a = patterns[selectedPatternIndex]) == null ? void 0 : _a.length) || 64,
            " rows"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
            lineNumber: 168,
            columnNumber: 26
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
          lineNumber: 168,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
        lineNumber: 159,
        columnNumber: 9
      }, void 0),
      isRendering && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted mb-1", children: [
          "Rendering",
          audioExportScope !== "pattern" ? ` ${audioExportScope}` : "",
          "... ",
          renderProgress,
          "%"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
          lineNumber: 173,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full bg-dark-border rounded-full h-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "bg-accent-primary h-2 rounded-full transition-all duration-200",
            style: { width: `${renderProgress}%` }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
            lineNumber: 177,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
          lineNumber: 176,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
        lineNumber: 172,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
      lineNumber: 107,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/AudioExportPanel.tsx",
    lineNumber: 103,
    columnNumber: 5
  }, void 0);
};
const MidiExportPanel = ({
  handlerRef,
  selectedPatternIndex,
  setSelectedPatternIndex
}) => {
  var _a;
  const { patterns } = useTrackerStore();
  const { metadata } = useProjectStore();
  const { bpm } = useTransportStore();
  const { curves } = useAutomationStore();
  const [midiType, setMidiType] = reactExports.useState(1);
  const [midiIncludeAutomation, setMidiIncludeAutomation] = reactExports.useState(true);
  const [midiExportFullSong, setMidiExportFullSong] = reactExports.useState(false);
  handlerRef.current = async () => {
    const timeSignature = [4, 4];
    const midiOptions = {
      type: midiType,
      includeAutomation: midiIncludeAutomation,
      velocityScale: 1,
      exportMutedChannels: false
    };
    let midiData;
    let filename;
    if (midiExportFullSong) {
      const sequence = patterns.map((p) => p.id);
      midiData = exportSongToMIDI(patterns, sequence, bpm, timeSignature, curves, midiOptions);
      filename = `${metadata.name || "song"}.mid`;
    } else {
      const pattern = patterns[selectedPatternIndex];
      if (!pattern) {
        notify.warning("Please select a valid pattern");
        return false;
      }
      midiData = exportPatternToMIDI(pattern, bpm, timeSignature, midiOptions);
      filename = `${pattern.name || "pattern"}.mid`;
    }
    const blob = new Blob([new Uint8Array(midiData)], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify.success(`MIDI file "${filename}" exported successfully!`);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-mono font-bold text-accent-primary mb-3", children: "MIDI Export (.mid)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
      lineNumber: 68,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setMidiExportFullSong(false),
            className: `
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${!midiExportFullSong ? "bg-accent-primary text-text-inverse" : "bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border"}
            `,
            children: "Single Pattern"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
            lineNumber: 74,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setMidiExportFullSong(true),
            className: `
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${midiExportFullSong ? "bg-accent-primary text-text-inverse" : "bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border"}
            `,
            children: [
              "Full Song (",
              patterns.length,
              " patterns)"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
            lineNumber: 86,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
        lineNumber: 73,
        columnNumber: 9
      }, void 0),
      !midiExportFullSong && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-1", children: "Pattern to Export" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
          lineNumber: 103,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "select",
          {
            value: selectedPatternIndex,
            onChange: (e) => setSelectedPatternIndex(Number(e.target.value)),
            className: "input w-full",
            children: patterns.map((pattern, index) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("option", { value: index, children: [
              index.toString().padStart(2, "0"),
              " - ",
              pattern.name
            ] }, pattern.id, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
              lineNumber: 112,
              columnNumber: 17
            }, void 0))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
            lineNumber: 106,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
        lineNumber: 102,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-1", children: "MIDI Format" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
          lineNumber: 122,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setMidiType(0),
              className: `
                flex-1 px-3 py-2 rounded-lg text-xs font-mono transition-all
                ${midiType === 0 ? "bg-accent-secondary text-text-inverse" : "bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border"}
              `,
              children: "Type 0 (Single Track)"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
              lineNumber: 126,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setMidiType(1),
              className: `
                flex-1 px-3 py-2 rounded-lg text-xs font-mono transition-all
                ${midiType === 1 ? "bg-accent-secondary text-text-inverse" : "bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border"}
              `,
              children: "Type 1 (Multi-Track)"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
              lineNumber: 138,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
          lineNumber: 125,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
        lineNumber: 121,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-3 text-sm font-mono text-text-primary cursor-pointer hover:text-accent-primary transition-colors", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "checkbox",
            checked: midiIncludeAutomation,
            onChange: (e) => setMidiIncludeAutomation(e.target.checked),
            className: "w-4 h-4 rounded border-dark-border bg-dark-bg text-accent-primary focus:ring-accent-primary"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
            lineNumber: 155,
            columnNumber: 11
          },
          void 0
        ),
        "Include automation as CC messages"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
        lineNumber: 154,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-text-secondary space-y-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "Format: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "Standard MIDI File (SMF)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
            lineNumber: 165,
            columnNumber: 24
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
          lineNumber: 165,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "Resolution: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "480 PPQ" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
            lineNumber: 166,
            columnNumber: 28
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
          lineNumber: 166,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "BPM: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: bpm }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
            lineNumber: 167,
            columnNumber: 21
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
          lineNumber: 167,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "Channels: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: ((_a = patterns[selectedPatternIndex]) == null ? void 0 : _a.channels.length) || 8 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
            lineNumber: 168,
            columnNumber: 26
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
          lineNumber: 168,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
        lineNumber: 164,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
      lineNumber: 71,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/MidiExportPanel.tsx",
    lineNumber: 67,
    columnNumber: 5
  }, void 0);
};
const FORMAT_LABELS = {
  mod: "ProTracker MOD",
  xm: "FastTracker II XM",
  it: "Impulse Tracker IT",
  s3m: "ScreamTracker 3 S3M"
};
const CHANNEL_MAX = {
  mod: 32,
  xm: 32,
  it: 64,
  s3m: 32
};
const ModuleExportPanel = ({
  handlerRef,
  exportMode,
  onClose
}) => {
  var _a;
  const { patterns, patternOrder } = useTrackerStore();
  const { instruments } = useInstrumentStore();
  const { metadata } = useProjectStore();
  const { bpm, speed } = useTransportStore();
  const [channelCount, setChannelCount] = reactExports.useState(
    exportMode === "mod" ? 4 : 8
  );
  const [exportWarnings, setExportWarnings] = reactExports.useState([]);
  const hasNotes = patterns.some(
    (pat) => pat.channels.some((ch) => ch.rows.some((row) => row.note > 0))
  );
  const maxChannels = CHANNEL_MAX[exportMode] ?? 32;
  const replacedIds = (() => {
    try {
      const { getTrackerReplayer } = require("@engine/TrackerReplayer");
      return getTrackerReplayer().replacedInstrumentIds;
    } catch {
      return [];
    }
  })();
  const hasReplacedInstruments = replacedIds.length > 0;
  reactExports.useEffect(() => {
    setExportWarnings([]);
    setChannelCount(exportMode === "mod" ? 4 : 8);
  }, [exportMode]);
  handlerRef.current = async () => {
    if (!hasNotes) {
      notify.error("No playable note data — this format stores audio externally and cannot be exported.");
      return false;
    }
    const opts = {
      format: exportMode,
      moduleName: metadata.name || "DEViLBOX Export",
      channelLimit: Math.min(channelCount, maxChannels),
      initialBPM: bpm,
      initialSpeed: speed
    };
    const result = await exportWithOpenMPT(patterns, instruments, patternOrder, opts);
    const url = URL.createObjectURL(result.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (result.warnings.length > 0) {
      setExportWarnings(result.warnings);
      notify.warning(`${exportMode.toUpperCase()} exported with ${result.warnings.length} warnings.`);
    } else {
      notify.success(`${exportMode.toUpperCase()} file "${result.filename}" exported successfully!`);
      onClose();
    }
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-mono font-bold text-accent-primary mb-3", children: [
      FORMAT_LABELS[exportMode],
      " Export (.",
      exportMode,
      ")"
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
      lineNumber: 97,
      columnNumber: 7
    }, void 0),
    !hasNotes ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-red-500/10 border border-red-500/30 rounded-lg p-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-mono text-red-300", children: "No playable note data found. This format stores audio externally and cannot be exported to a tracker module." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
      lineNumber: 103,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
      lineNumber: 102,
      columnNumber: 9
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
      hasReplacedInstruments && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-accent-warning/10 border border-accent-warning/30 rounded-lg p-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-mono text-text-muted", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-warning font-bold", children: "WARNING:" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
          lineNumber: 112,
          columnNumber: 17
        }, void 0),
        " Instruments",
        " ",
        replacedIds.join(", "),
        " are synth-replaced. They will export as silence in",
        " ",
        exportMode.toUpperCase(),
        " format. Save as .dbx to preserve synth assignments."
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
        lineNumber: 111,
        columnNumber: 15
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
        lineNumber: 110,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-1", children: [
          "Channel Count (max ",
          maxChannels,
          ")"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
          lineNumber: 120,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "number",
            min: 1,
            max: maxChannels,
            value: channelCount,
            onChange: (e) => setChannelCount(Math.min(maxChannels, Math.max(1, Number(e.target.value)))),
            className: "input w-full"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
            lineNumber: 123,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
        lineNumber: 119,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-text-secondary space-y-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "Format: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: FORMAT_LABELS[exportMode] }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
            lineNumber: 134,
            columnNumber: 26
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
          lineNumber: 134,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "Engine: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "OpenMPT CSoundFile (WASM)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
            lineNumber: 135,
            columnNumber: 26
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
          lineNumber: 135,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "Patterns: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: patterns.length }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
            lineNumber: 136,
            columnNumber: 28
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
          lineNumber: 136,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "Channels: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: Math.min(((_a = patterns[0]) == null ? void 0 : _a.channels.length) || channelCount, maxChannels) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
            lineNumber: 137,
            columnNumber: 28
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
          lineNumber: 137,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "Instruments: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: instruments.length }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
            lineNumber: 138,
            columnNumber: 31
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
          lineNumber: 138,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          "BPM / Speed: ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: [
            bpm,
            " / ",
            speed
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
            lineNumber: 139,
            columnNumber: 31
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
          lineNumber: 139,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
        lineNumber: 133,
        columnNumber: 11
      }, void 0),
      exportWarnings.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-orange-500/10 border border-orange-500/30 rounded-lg p-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h4", { className: "text-xs font-mono font-bold text-orange-400 mb-2", children: [
          "Export Warnings (",
          exportWarnings.length,
          ")"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
          lineNumber: 144,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("ul", { className: "text-xs font-mono text-orange-300 space-y-1 max-h-32 overflow-y-auto", children: exportWarnings.map((warning, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { className: "flex items-start gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-orange-400", children: "•" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
            lineNumber: 150,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: warning }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
            lineNumber: 151,
            columnNumber: 21
          }, void 0)
        ] }, idx, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
          lineNumber: 149,
          columnNumber: 19
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
          lineNumber: 147,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
        lineNumber: 143,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
      lineNumber: 108,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ModuleExportPanel.tsx",
    lineNumber: 96,
    columnNumber: 5
  }, void 0);
};
const ChipExportPanel = ({
  handlerRef,
  isRendering,
  setIsRendering,
  renderProgress,
  setRenderProgress,
  onClose,
  onFormatChange
}) => {
  const { metadata } = useProjectStore();
  const { bpm, loopStartRow, currentRow, setLoopStartRow } = useTransportStore();
  const [chipFormat, setChipFormat] = reactExports.useState("vgm");
  const [chipRecordingSession] = reactExports.useState(() => new ChipRecordingSession());
  const [isChipRecording, setIsChipRecording] = reactExports.useState(false);
  const [chipRecordingTime, setChipRecordingTime] = reactExports.useState(0);
  const [chipLogData, setChipLogData] = reactExports.useState(null);
  const [chipWrites, setChipWrites] = reactExports.useState([]);
  const [availableChipFormats, setAvailableChipFormats] = reactExports.useState([]);
  const [chipTitle, setChipTitle] = reactExports.useState("");
  const [chipAuthor, setChipAuthor] = reactExports.useState("");
  const [chipLoopPoint, setChipLoopPoint] = reactExports.useState(0);
  const chipRecordingTimerRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (loopStartRow > 0) {
      setChipLoopPoint(loopStartRow);
    }
  }, [loopStartRow]);
  reactExports.useEffect(() => {
    onFormatChange == null ? void 0 : onFormatChange(FORMAT_INFO[chipFormat].extension);
  }, [chipFormat, onFormatChange]);
  reactExports.useEffect(() => {
    return () => {
      if (chipRecordingTimerRef.current) {
        clearInterval(chipRecordingTimerRef.current);
      }
    };
  }, []);
  const startChipRecording = () => {
    chipRecordingSession.startRecording();
    setIsChipRecording(true);
    setChipRecordingTime(0);
    setChipLogData(null);
    setChipWrites([]);
    setAvailableChipFormats([]);
    chipRecordingTimerRef.current = setInterval(() => {
      setChipRecordingTime((t) => t + 100);
    }, 100);
  };
  const stopChipRecording = async () => {
    if (chipRecordingTimerRef.current) {
      clearInterval(chipRecordingTimerRef.current);
      chipRecordingTimerRef.current = null;
    }
    const logData = await chipRecordingSession.stopRecording();
    setIsChipRecording(false);
    setChipLogData(logData);
    if (logData.length > 0) {
      const writes = parseRegisterLog(logData);
      setChipWrites(writes);
      const formats = getAvailableFormats(writes);
      setAvailableChipFormats(formats);
      if (formats.length > 0 && !formats.includes(chipFormat)) {
        setChipFormat(formats[0]);
      }
    }
  };
  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1e3);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const tenths = Math.floor(ms % 1e3 / 100);
    return `${minutes}:${secs.toString().padStart(2, "0")}.${tenths}`;
  };
  handlerRef.current = async () => {
    if (!chipLogData || chipLogData.length === 0) {
      notify.error("No recording data. Press Record and play your song first.");
      return false;
    }
    if (chipWrites.length === 0) {
      notify.error("No register writes captured. Make sure Furnace chips are playing.");
      return false;
    }
    if (!availableChipFormats.includes(chipFormat)) {
      const usedChips = getLogStatistics(chipWrites).usedChips.map((c) => c.name).join(", ");
      notify.error(`${FORMAT_INFO[chipFormat].name} format is not compatible with chips used: ${usedChips}. Try VGM for universal compatibility.`);
      return false;
    }
    if (!chipTitle.trim()) {
      notify.error("Please enter a title for your export.");
      return false;
    }
    setIsRendering(true);
    setRenderProgress(0);
    try {
      const rowsPerBeat = 4;
      const beatsPerSecond = bpm / 60;
      const secondsPerRow = 1 / (beatsPerSecond * rowsPerBeat);
      const loopPointSamples = chipLoopPoint > 0 ? Math.floor(chipLoopPoint * secondsPerRow * 44100) : void 0;
      setRenderProgress(50);
      const chipResult = await exportChipMusic(chipLogData, {
        format: chipFormat,
        title: chipTitle || metadata.name || "Untitled",
        author: chipAuthor || metadata.author || "Unknown",
        loopPoint: loopPointSamples
      });
      setRenderProgress(100);
      const url = URL.createObjectURL(chipResult.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = chipResult.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify.success(`${FORMAT_INFO[chipFormat].name} file exported successfully!`);
      onClose();
    } catch (error) {
      notify.error(`Export failed: ${error.message}`);
    } finally {
      setIsRendering(false);
      setRenderProgress(0);
    }
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-mono font-bold text-accent-primary mb-3", children: "Chip Music Export" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
      lineNumber: 185,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono text-text-muted", children: "RECORDING" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
            lineNumber: 192,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-lg font-mono text-accent-primary font-bold", children: formatTime(chipRecordingTime) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
            lineNumber: 193,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 191,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: !isChipRecording ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: startChipRecording,
            className: "flex-1 px-4 py-2 rounded-lg bg-red-500 text-text-primary font-mono text-sm hover:bg-red-600 transition-colors flex items-center justify-center gap-2",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-3 h-3 rounded-full bg-white" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                lineNumber: 203,
                columnNumber: 17
              }, void 0),
              "Record"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
            lineNumber: 199,
            columnNumber: 15
          },
          void 0
        ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: stopChipRecording,
            className: "flex-1 px-4 py-2 rounded-lg bg-dark-bgHover text-text-primary font-mono text-sm hover:bg-dark-border transition-colors flex items-center justify-center gap-2",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-3 h-3 bg-white" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                lineNumber: 211,
                columnNumber: 17
              }, void 0),
              "Stop"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
            lineNumber: 207,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 197,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-mono text-text-muted mt-2", children: isChipRecording ? "Recording... Play your song now!" : chipWrites.length > 0 ? `Captured ${chipWrites.length.toLocaleString()} register writes` : "Press Record, then play your song to capture chip output" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 216,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
        lineNumber: 190,
        columnNumber: 9
      }, void 0),
      chipWrites.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h4", { className: "text-xs font-mono text-text-muted mb-2", children: "CAPTURED DATA" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 228,
          columnNumber: 13
        }, void 0),
        (() => {
          const stats = getLogStatistics(chipWrites);
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1 text-sm font-mono", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Duration: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: [
                stats.duration.toFixed(1),
                "s"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                lineNumber: 233,
                columnNumber: 34
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 233,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Writes: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: stats.totalWrites.toLocaleString() }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                lineNumber: 234,
                columnNumber: 32
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 234,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "pt-1 border-t border-dark-border mt-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "Chips used:" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                lineNumber: 236,
                columnNumber: 21
              }, void 0),
              stats.usedChips.map((chip) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "ml-2 text-xs", children: [
                chip.name,
                ": ",
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-secondary", children: chip.writes.toLocaleString() }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                  lineNumber: 239,
                  columnNumber: 38
                }, void 0)
              ] }, chip.type, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                lineNumber: 238,
                columnNumber: 23
              }, void 0))
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 235,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
            lineNumber: 232,
            columnNumber: 17
          }, void 0);
        })()
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
        lineNumber: 227,
        columnNumber: 11
      }, void 0),
      chipWrites.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted mb-2", children: "QUICK PRESETS" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 252,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setChipFormat("vgm"),
              className: "px-3 py-2 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors text-left",
              children: "🌐 Universal (VGM)"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 254,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setChipFormat("gym"),
              disabled: !availableChipFormats.includes("gym"),
              className: "px-3 py-2 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed",
              children: "🎮 Genesis (GYM)"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 260,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setChipFormat("nsf"),
              disabled: !availableChipFormats.includes("nsf"),
              className: "px-3 py-2 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed",
              children: "🕹️ NES (NSF)"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 267,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setChipFormat("gbs"),
              disabled: !availableChipFormats.includes("gbs"),
              className: "px-3 py-2 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed",
              children: "🎮 Game Boy (GBS)"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 274,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 253,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
        lineNumber: 251,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-2", children: "EXPORT FORMAT" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 287,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: ["vgm", "gym", "nsf", "gbs", "spc", "zsm", "sap", "tiuna"].map((fmt) => {
          const info = FORMAT_INFO[fmt];
          const isAvailable = availableChipFormats.includes(fmt) || chipWrites.length === 0;
          const loopSupport = {
            vgm: { supported: true, type: "custom" },
            gym: { supported: false, type: "none" },
            nsf: { supported: true, type: "auto" },
            gbs: { supported: true, type: "auto" },
            spc: { supported: false, type: "none" },
            zsm: { supported: false, type: "none" },
            sap: { supported: false, type: "none" },
            tiuna: { supported: false, type: "none" },
            s98: { supported: true, type: "custom" },
            sndh: { supported: false, type: "none" }
          }[fmt] ?? { type: "none" };
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => isAvailable && setChipFormat(fmt),
              disabled: !isAvailable && chipWrites.length > 0,
              className: `
                    p-3 rounded-lg text-left transition-all
                    ${chipFormat === fmt ? "bg-accent-primary text-text-inverse" : isAvailable || chipWrites.length === 0 ? "bg-dark-bg border border-dark-border hover:border-dark-borderLight" : "bg-dark-bg border border-dark-border opacity-40 cursor-not-allowed"}
                  `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: info.name }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                    lineNumber: 325,
                    columnNumber: 21
                  }, void 0),
                  loopSupport.type === "custom" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs opacity-70", title: "Custom loop point supported", children: "🔁" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                    lineNumber: 327,
                    columnNumber: 23
                  }, void 0),
                  loopSupport.type === "auto" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs opacity-70", title: "Loops entire song automatically", children: "↻" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                    lineNumber: 330,
                    columnNumber: 23
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                  lineNumber: 324,
                  columnNumber: 19
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs opacity-70", children: [
                  ".",
                  info.extension
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
                  lineNumber: 333,
                  columnNumber: 19
                }, void 0)
              ]
            },
            fmt,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 310,
              columnNumber: 17
            },
            void 0
          );
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 290,
          columnNumber: 11
        }, void 0),
        chipLoopPoint > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-xs", children: (() => {
          const loopType = {
            vgm: "custom",
            nsf: "auto",
            gbs: "auto",
            gym: "none",
            spc: "none",
            zsm: "none",
            sap: "none",
            tiuna: "none",
            s98: "custom",
            sndh: "none"
          }[chipFormat] ?? "none";
          if (loopType === "custom") {
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-green-400", children: [
              "✓ Loop point at row ",
              chipLoopPoint,
              " will be used"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 358,
              columnNumber: 21
            }, void 0);
          } else if (loopType === "auto") {
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-yellow-400", children: [
              "⚠️ ",
              chipFormat.toUpperCase(),
              " loops entire song (custom loop points not supported)"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 364,
              columnNumber: 21
            }, void 0);
          } else {
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-yellow-400", children: [
              "⚠️ ",
              chipFormat.toUpperCase(),
              " format does not support loop points"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 370,
              columnNumber: 21
            }, void 0);
          }
        })() }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 341,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
        lineNumber: 286,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-1", children: "Title" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
            lineNumber: 383,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "text",
              value: chipTitle,
              onChange: (e) => setChipTitle(e.target.value),
              placeholder: metadata.name || "Untitled",
              className: "input w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 386,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 382,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-1", children: "Author" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
            lineNumber: 395,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "text",
              value: chipAuthor,
              onChange: (e) => setChipAuthor(e.target.value),
              placeholder: metadata.author || "Unknown",
              className: "input w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 398,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 394,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
        lineNumber: 381,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-2", children: "LOOP POINT (Row)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 410,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "number",
              value: chipLoopPoint,
              onChange: (e) => setChipLoopPoint(Math.max(0, Number(e.target.value))),
              min: 0,
              className: "input flex-1 font-mono",
              placeholder: "0"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 414,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => {
                setChipLoopPoint(currentRow);
                setLoopStartRow(currentRow);
              },
              className: "px-3 py-2 rounded-lg bg-dark-bgHover text-text-primary font-mono text-xs hover:bg-dark-border transition-colors",
              title: "Set loop point to current row",
              children: "From Cursor"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
              lineNumber: 422,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 413,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-mono text-text-muted mt-2", children: chipLoopPoint > 0 ? `Music will loop back to row ${chipLoopPoint}` : "Set to 0 for no loop (one-shot playback)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 433,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
        lineNumber: 409,
        columnNumber: 9
      }, void 0),
      isRendering && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono text-text-muted", children: [
            "Exporting ",
            FORMAT_INFO[chipFormat].name,
            "..."
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
            lineNumber: 444,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono text-accent-primary", children: [
            renderProgress,
            "%"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
            lineNumber: 447,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 443,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-2 bg-dark-border rounded-full overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "h-full bg-accent-primary transition-all duration-300",
            style: { width: `${renderProgress}%` }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
            lineNumber: 452,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
          lineNumber: 451,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
        lineNumber: 442,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted bg-dark-bg border border-dark-border rounded-lg p-3", children: FORMAT_INFO[chipFormat].description }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
        lineNumber: 461,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
      lineNumber: 188,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ChipExportPanel.tsx",
    lineNumber: 184,
    columnNumber: 5
  }, void 0);
};
const ExportDialog = ({ isOpen, onClose }) => {
  var _a;
  const ex = useExportDialog({ isOpen });
  const [chipExtension, setChipExtension] = reactExports.useState("vgm");
  const fileInputRef = reactExports.useRef(null);
  const audioHandlerRef = reactExports.useRef(null);
  const midiHandlerRef = reactExports.useRef(null);
  const moduleHandlerRef = reactExports.useRef(null);
  const chipHandlerRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const handleExport = async () => {
    var _a2, _b, _c, _d;
    try {
      switch (ex.exportMode) {
        case "song":
          return ex.handleExportSong(onClose);
        case "sfx":
          return ex.handleExportSFX(onClose);
        case "instrument":
          return ex.handleExportInstrument(onClose);
        case "audio": {
          if (await ((_a2 = audioHandlerRef.current) == null ? void 0 : _a2.call(audioHandlerRef)) === false) return;
          break;
        }
        case "midi": {
          if (await ((_b = midiHandlerRef.current) == null ? void 0 : _b.call(midiHandlerRef)) === false) return;
          break;
        }
        case "xm":
        case "mod":
        case "it":
        case "s3m": {
          if (await ((_c = moduleHandlerRef.current) == null ? void 0 : _c.call(moduleHandlerRef)) === false) return;
          break;
        }
        case "chip": {
          if (await ((_d = chipHandlerRef.current) == null ? void 0 : _d.call(chipHandlerRef)) === false) return;
          break;
        }
        case "fur":
          return ex.handleExportFur((b, n) => FileSaver_minExports.saveAs(b, n), onClose);
        case "nano":
          return ex.handleExportNano((b, n) => FileSaver_minExports.saveAs(b, n), onClose);
        case "native":
          return ex.handleExportNative((b, n) => FileSaver_minExports.saveAs(b, n), onClose);
      }
      if (ex.exportMode !== "xm" && ex.exportMode !== "mod" && ex.exportMode !== "it" && ex.exportMode !== "s3m") {
        onClose();
      }
    } catch (error) {
      console.error("Export failed:", error);
    }
  };
  const handleImportClick = () => {
    var _a2;
    (_a2 = fileInputRef.current) == null ? void 0 : _a2.click();
  };
  const handleFileSelect = async (event) => {
    var _a2;
    const file = (_a2 = event.target.files) == null ? void 0 : _a2[0];
    if (!file) return;
    event.target.value = "";
    await ex.handleImportFile(file, onClose);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgTertiary border-b border-dark-border px-5 py-4 flex items-center justify-between", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "font-mono text-lg font-bold text-text-primary", children: "Export / Import" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 119,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: onClose,
          className: "btn-icon",
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 20 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 126,
            columnNumber: 13
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 122,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
      lineNumber: 118,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border-b border-dark-border flex", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => ex.setDialogMode("export"),
          className: `
              flex-1 px-4 py-3 font-mono text-sm transition-all border-r border-dark-border flex items-center justify-center gap-2
              ${ex.dialogMode === "export" ? "bg-accent-primary text-text-inverse font-bold" : "text-text-secondary hover:bg-dark-bgHover"}
            `,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Download, { size: 16 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 142,
              columnNumber: 13
            }, void 0),
            "Export"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 132,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => ex.setDialogMode("import"),
          className: `
              flex-1 px-4 py-3 font-mono text-sm transition-all flex items-center justify-center gap-2
              ${ex.dialogMode === "import" ? "bg-accent-primary text-text-inverse font-bold" : "text-text-secondary hover:bg-dark-bgHover"}
            `,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Upload, { size: 16 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 155,
              columnNumber: 13
            }, void 0),
            "Import"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 145,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
      lineNumber: 131,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-modern p-5", children: ex.dialogMode === "export" ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-3", children: "EXPORT MODE" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 166,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("song"),
              className: `
                      p-4 rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === "song" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileMusic, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 180,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "Song" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 181,
                  columnNumber: 21
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 170,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("sfx"),
              className: `
                      p-4 rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === "sfx" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 193,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "SFX" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 194,
                  columnNumber: 21
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 183,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("instrument"),
              className: `
                      p-4 rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === "instrument" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Settings, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 206,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "Instrument" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 207,
                  columnNumber: 21
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 196,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("audio"),
              className: `
                      p-4 rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === "audio" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Volume2, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 219,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "Audio" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 220,
                  columnNumber: 21
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 209,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("midi"),
              className: `
                      p-4 rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === "midi" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music2, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 232,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "MIDI" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 233,
                  columnNumber: 21
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 222,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("xm"),
              className: `
                      p-4 rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === "xm" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileMusic, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 245,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "XM" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 246,
                  columnNumber: 21
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 235,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("mod"),
              className: `
                      p-4 rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === "mod" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileMusic, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 258,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "MOD" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 259,
                  columnNumber: 21
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 248,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("it"),
              className: `
                      p-4 rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === "it" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileMusic, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 271,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "IT" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 272,
                  columnNumber: 21
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 261,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("s3m"),
              className: `
                      p-4 rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === "s3m" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileMusic, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 284,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "S3M" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 285,
                  columnNumber: 21
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 274,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("chip"),
              className: `
                      p-4 rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === "chip" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cpu, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 297,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "Chip" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 298,
                  columnNumber: 21
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 287,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("nano"),
              className: `
                      p-4 rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === "nano" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 310,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "Nano" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 311,
                  columnNumber: 21
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 300,
              columnNumber: 19
            },
            void 0
          ),
          ex.editorMode === "furnace" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("fur"),
              className: `
                        p-4 rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === "fur" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                      `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileMusic, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 324,
                  columnNumber: 23
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "Furnace" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 325,
                  columnNumber: 23
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 314,
              columnNumber: 21
            },
            void 0
          ),
          (ex.editorMode === "jamcracker" || ex.editorMode === "classic" || ex.editorMode === "hively" || ex.editorMode === "klystrack" || ex.editorMode === "musicline") && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => ex.setExportMode("native"),
              className: `
                        p-4 rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === "native" ? "bg-accent-primary text-text-inverse border-accent-primary glow-sm" : "bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"}
                      `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileMusic, { size: 24, className: "mx-auto mb-2" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 339,
                  columnNumber: 23
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-sm font-semibold", children: "Native" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 340,
                  columnNumber: 23
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 329,
              columnNumber: 21
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 169,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 165,
        columnNumber: 15
      }, void 0),
      ex.exportMode === "song" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-mono font-bold text-accent-primary mb-3", children: "Song Export" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 349,
          columnNumber: 19
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2 text-sm font-mono text-text-primary", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            "Project: ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: ex.metadata.name }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 353,
              columnNumber: 35
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 353,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            "Patterns: ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: ex.patterns.length }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 354,
              columnNumber: 36
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 354,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            "Instruments: ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: ex.instruments.length }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 355,
              columnNumber: 39
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 355,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            "BPM: ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: ex.bpm }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 356,
              columnNumber: 31
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 356,
            columnNumber: 21
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 352,
          columnNumber: 19
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 348,
        columnNumber: 17
      }, void 0),
      ex.exportMode === "sfx" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-mono font-bold text-accent-primary mb-3", children: "SFX Export" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 363,
          columnNumber: 19
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-1", children: "SFX Name" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 368,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "text",
                value: ex.sfxName,
                onChange: (e) => ex.setSfxName(e.target.value),
                className: "input w-full"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 371,
                columnNumber: 23
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 367,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-1", children: "Pattern" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 379,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "select",
              {
                value: ex.selectedPatternIndex,
                onChange: (e) => ex.setSelectedPatternIndex(Number(e.target.value)),
                className: "input w-full",
                children: ex.patterns.map((pattern, index) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("option", { value: index, children: [
                  index.toString().padStart(2, "0"),
                  " - ",
                  pattern.name
                ] }, pattern.id, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 388,
                  columnNumber: 27
                }, void 0))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 382,
                columnNumber: 23
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 378,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-1", children: "Instrument" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 395,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "select",
              {
                value: ex.selectedInstrumentId,
                onChange: (e) => ex.setSelectedInstrumentId(Number(e.target.value)),
                className: "input w-full",
                children: ex.instruments.map((instrument) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("option", { value: instrument.id, children: [
                  instrument.id.toString(16).toUpperCase().padStart(2, "0"),
                  " - ",
                  instrument.name
                ] }, instrument.id, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                  lineNumber: 404,
                  columnNumber: 27
                }, void 0))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 398,
                columnNumber: 23
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 394,
            columnNumber: 21
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 366,
          columnNumber: 19
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 362,
        columnNumber: 17
      }, void 0),
      ex.exportMode === "instrument" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-mono font-bold text-accent-primary mb-3", children: "Instrument Export" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 416,
          columnNumber: 19
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-mono text-text-muted mb-1", children: "Select Instrument" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 420,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "select",
            {
              value: ex.selectedInstrumentId,
              onChange: (e) => ex.setSelectedInstrumentId(Number(e.target.value)),
              className: "input w-full",
              children: ex.instruments.map((instrument) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("option", { value: instrument.id, children: [
                instrument.id.toString(16).toUpperCase().padStart(2, "0"),
                " - ",
                instrument.name
              ] }, instrument.id, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 429,
                columnNumber: 25
              }, void 0))
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 423,
              columnNumber: 21
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 419,
          columnNumber: 19
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 415,
        columnNumber: 17
      }, void 0),
      ex.exportMode === "audio" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        AudioExportPanel,
        {
          handlerRef: audioHandlerRef,
          selectedPatternIndex: ex.selectedPatternIndex,
          setSelectedPatternIndex: ex.setSelectedPatternIndex,
          isRendering: ex.isRendering,
          setIsRendering: ex.setIsRendering,
          renderProgress: ex.renderProgress,
          setRenderProgress: ex.setRenderProgress,
          initialScope: ((_a = ex.modalData) == null ? void 0 : _a.audioScope) === "arrangement" ? "arrangement" : void 0
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 439,
          columnNumber: 17
        },
        void 0
      ),
      ex.exportMode === "midi" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        MidiExportPanel,
        {
          handlerRef: midiHandlerRef,
          selectedPatternIndex: ex.selectedPatternIndex,
          setSelectedPatternIndex: ex.setSelectedPatternIndex
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 452,
          columnNumber: 17
        },
        void 0
      ),
      (ex.exportMode === "xm" || ex.exportMode === "mod" || ex.exportMode === "it" || ex.exportMode === "s3m") && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        ModuleExportPanel,
        {
          handlerRef: moduleHandlerRef,
          exportMode: ex.exportMode,
          onClose
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 460,
          columnNumber: 17
        },
        void 0
      ),
      ex.exportMode === "chip" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        ChipExportPanel,
        {
          handlerRef: chipHandlerRef,
          isRendering: ex.isRendering,
          setIsRendering: ex.setIsRendering,
          renderProgress: ex.renderProgress,
          setRenderProgress: ex.setRenderProgress,
          onClose,
          onFormatChange: setChipExtension
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 468,
          columnNumber: 17
        },
        void 0
      ),
      ex.exportMode === "fur" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-mono font-bold text-accent-primary mb-3", children: "Furnace Export (.fur)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 481,
          columnNumber: 19
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-text-secondary space-y-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            "Format: ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "Furnace Tracker Module" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 486,
              columnNumber: 36
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 486,
            columnNumber: 23
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            "Engine: ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "FurnaceFileOps WASM" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 487,
              columnNumber: 36
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 487,
            columnNumber: 23
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            "Patterns: ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: ex.patterns.length }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 488,
              columnNumber: 38
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 488,
            columnNumber: 23
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            "Instruments: ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: ex.instruments.length }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 489,
              columnNumber: 41
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 489,
            columnNumber: 23
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 485,
          columnNumber: 21
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 484,
          columnNumber: 19
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 480,
        columnNumber: 17
      }, void 0),
      ex.exportMode === "native" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-mono font-bold text-accent-primary mb-3", children: "Native Amiga Format Export" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 497,
          columnNumber: 19
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-text-secondary space-y-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Preset: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: useUIStore.getState().activeSystemPreset || "auto-detect" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 502,
                columnNumber: 36
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 502,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Patterns: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: ex.patterns.length }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 503,
                columnNumber: 38
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 503,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Instruments: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: ex.instruments.length }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 504,
                columnNumber: 41
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 504,
              columnNumber: 23
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 501,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-mono text-text-primary leading-relaxed", children: "Exports as the original tracker format with all edits preserved. Supports 30+ formats including JamCracker, SoundMon, ProTracker, Future Composer, SidMon, PumaTracker, OctaMED, Hively/AHX, DigiBooster, Oktalyzer, Klystrack, InStereo, DeltaMusic, Digital Mugician, Sonic Arranger, TFMX, Fred Editor, SoundFX, TCB Tracker, and more. Chip RAM readback is available as fallback." }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 507,
            columnNumber: 23
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 506,
            columnNumber: 21
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 500,
          columnNumber: 19
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 496,
        columnNumber: 17
      }, void 0),
      ex.exportMode === "nano" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-mono font-bold text-accent-primary mb-3", children: "Nano Binary Export (.dbn)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 521,
          columnNumber: 19
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-mono text-text-primary leading-relaxed", children: [
            "Extreme binary compression for demoscene 4k intros. Exports a strictly optimized ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-secondary", children: "Uint8Array" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 528,
              columnNumber: 54
            }, void 0),
            " containing only used instruments and bit-masked pattern data."
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 526,
            columnNumber: 23
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 525,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-text-secondary space-y-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Target Size: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "< 4KB" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 533,
                columnNumber: 41
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 533,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Format: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "DBXN Binary" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 534,
                columnNumber: 36
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 534,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              "Used Instruments: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: (() => {
                const used = /* @__PURE__ */ new Set();
                ex.patterns.forEach((pattern) => {
                  pattern.channels.forEach((ch) => {
                    ch.rows.forEach((cell) => {
                      if (cell.instrument > 0) used.add(cell.instrument);
                    });
                  });
                });
                return used.size;
              })() }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 535,
                columnNumber: 46
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 535,
              columnNumber: 23
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 532,
            columnNumber: 21
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 524,
          columnNumber: 19
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 520,
        columnNumber: 17
      }, void 0),
      ex.exportMode === "song" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-mono font-bold text-accent-primary mb-3", children: "Options" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 556,
          columnNumber: 19
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-3 text-sm font-mono text-text-primary cursor-pointer hover:text-accent-primary transition-colors", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: ex.options.includeAutomation,
              onChange: (e) => ex.setOptions({ ...ex.options, includeAutomation: e.target.checked }),
              className: "w-4 h-4 rounded border-dark-border bg-dark-bg text-accent-primary focus:ring-accent-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 561,
              columnNumber: 23
            },
            void 0
          ),
          "Include automation data"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 560,
          columnNumber: 21
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 559,
          columnNumber: 19
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 555,
        columnNumber: 17
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
      lineNumber: 163,
      columnNumber: 13
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center py-10", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-20 h-20 mx-auto mb-5 rounded-full bg-dark-bgSecondary border border-dark-border flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Upload, { size: 32, className: "text-accent-primary" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 578,
          columnNumber: 19
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 577,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-xl font-mono font-bold text-text-primary mb-2", children: "Import File" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 580,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm font-mono text-text-muted mb-6", children: "Select a .dbx, .sfx.json, or .dbi file" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 583,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleImportClick,
            className: "btn-primary px-8 py-3",
            children: "Choose File"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 586,
            columnNumber: 17
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            ref: fileInputRef,
            type: "file",
            accept: ".json",
            onChange: handleFileSelect,
            className: "hidden"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 592,
            columnNumber: 17
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 576,
        columnNumber: 15
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mt-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h4", { className: "text-xs font-mono font-bold text-accent-primary mb-3", children: "Supported Formats" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 602,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("ul", { className: "text-sm font-mono text-text-secondary space-y-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "•" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 607,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("strong", { children: ".song.json" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 608,
                columnNumber: 27
              }, void 0),
              " - Full song with all patterns and instruments"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 608,
              columnNumber: 21
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 606,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "•" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 611,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("strong", { children: ".sfx.json" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 612,
                columnNumber: 27
              }, void 0),
              " - Single pattern with one instrument"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 612,
              columnNumber: 21
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 610,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary", children: "•" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 615,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("strong", { children: ".dbi" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 616,
                columnNumber: 27
              }, void 0),
              " - Individual instrument preset"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
              lineNumber: 616,
              columnNumber: 21
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 614,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
          lineNumber: 605,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 601,
        columnNumber: 15
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
      lineNumber: 574,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
      lineNumber: 161,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border-t border-dark-border px-5 py-4 flex items-center justify-between", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted", children: ex.dialogMode === "export" ? `Format: ${ex.exportMode === "audio" ? ".wav" : ex.exportMode === "midi" ? ".mid" : ex.exportMode === "xm" ? ".xm" : ex.exportMode === "mod" ? ".mod" : ex.exportMode === "it" ? ".it" : ex.exportMode === "s3m" ? ".s3m" : ex.exportMode === "chip" ? `.${chipExtension}` : ex.exportMode === "nano" ? ".dbn" : ex.exportMode === "fur" ? ".fur" : `.${ex.exportMode}.json`}` : "Select a file to import" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 626,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onClose,
            className: "btn",
            disabled: ex.isRendering,
            children: "Cancel"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 643,
            columnNumber: 13
          },
          void 0
        ),
        ex.dialogMode === "export" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleExport,
            className: "btn-primary flex items-center gap-2",
            disabled: ex.isRendering,
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Download, { size: 16 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
                lineNumber: 656,
                columnNumber: 17
              }, void 0),
              ex.isRendering ? "Rendering..." : "Export"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
            lineNumber: 651,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
        lineNumber: 642,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
      lineNumber: 625,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
    lineNumber: 116,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/lib/export/ExportDialog.tsx",
    lineNumber: 115,
    columnNumber: 5
  }, void 0);
};
export {
  ExportDialog
};
