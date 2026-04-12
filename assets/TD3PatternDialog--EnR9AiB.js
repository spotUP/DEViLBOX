import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, X, U as Upload, D as Download, T as TriangleAlert, C as Check, F as FileUp, l as FileDown, m as LoaderCircle } from "./vendor-ui-AJ7AT9BN.js";
import { Q as useMIDIStore, R as useTrackerStore, U as useCursorStore, O as useModalClose, V as getMIDIManager, W as CustomSelect, X as FileSaver_minExports, e as useInstrumentStore } from "./main-BbV5VyEH.js";
import { createDefaultTB303Instrument } from "./instrumentFactory-Cy6PK_Jx.js";
import { f as formatPatternLocation, i as isTD3PatternResponse, d as decodePattern, e as exportTD3PatternToSeq, a as encodePattern, b as encodePatternRequest } from "./TD3PatternExporter-CTOfWZKO.js";
import { suggestBaseOctave, validatePatternForTD3Export, trackerPatternToTD3Steps, td3StepsToTrackerCells } from "./TD3PatternTranslator-C2Ot5Q0Y.js";
import { parseTD3File } from "./TD3PatternLoader-DQDKRwGq.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const GROUP_NAMES = ["A", "B", "C", "D"];
const TD3PatternDialog = ({ isOpen, onClose }) => {
  var _a;
  const [activeTab, setActiveTab] = reactExports.useState("export");
  const [selectedGroup, setSelectedGroup] = reactExports.useState(0);
  const [selectedPattern, setSelectedPattern] = reactExports.useState(0);
  const [selectedChannel, setSelectedChannel] = reactExports.useState(0);
  const [baseOctave, setBaseOctave] = reactExports.useState(2);
  const [isSending, setIsSending] = reactExports.useState(false);
  const [isRequesting, setIsRequesting] = reactExports.useState(false);
  const [sendResult, setSendResult] = reactExports.useState(null);
  const [receivedPattern, setReceivedPattern] = reactExports.useState(null);
  const [warnings, setWarnings] = reactExports.useState([]);
  const requestTimeoutRef = reactExports.useRef(null);
  const fileInputRef = reactExports.useRef(null);
  const { selectedOutputId, selectedInputId } = useMIDIStore();
  const { patterns, currentPatternIndex, setCell } = useTrackerStore();
  const cursor = useCursorStore((s) => s.cursor);
  const currentPattern = patterns[currentPatternIndex];
  const channels = (currentPattern == null ? void 0 : currentPattern.channels) || [];
  useModalClose({ isOpen, onClose });
  reactExports.useEffect(() => {
    if (isOpen) {
      setSendResult(null);
      setReceivedPattern(null);
      setWarnings([]);
      setSelectedChannel(cursor.channelIndex);
      if (currentPattern && currentPattern.channels[cursor.channelIndex]) {
        const cells = currentPattern.channels[cursor.channelIndex].rows;
        setBaseOctave(suggestBaseOctave(cells));
      }
    }
  }, [isOpen, cursor.channelIndex, currentPattern]);
  reactExports.useEffect(() => {
    return () => {
      if (requestTimeoutRef.current !== null) {
        clearTimeout(requestTimeoutRef.current);
        requestTimeoutRef.current = null;
      }
    };
  }, []);
  reactExports.useEffect(() => {
    if (!isOpen || activeTab !== "import" || !isRequesting) return;
    const manager = getMIDIManager();
    const handleMessage = (message) => {
      if (message.type === "sysex" && isTD3PatternResponse(message.data)) {
        const decoded = decodePattern(message.data);
        if (decoded) {
          if (requestTimeoutRef.current !== null) {
            clearTimeout(requestTimeoutRef.current);
            requestTimeoutRef.current = null;
          }
          setReceivedPattern(decoded);
          setIsRequesting(false);
        }
      }
    };
    manager.addMessageHandler(handleMessage);
    return () => manager.removeMessageHandler(handleMessage);
  }, [isOpen, activeTab, isRequesting]);
  const getExportCells = reactExports.useCallback(() => {
    if (!currentPattern || !currentPattern.channels[selectedChannel]) {
      return [];
    }
    return currentPattern.channels[selectedChannel].rows;
  }, [currentPattern, selectedChannel]);
  const validation = validatePatternForTD3Export(getExportCells(), baseOctave);
  const handleExport = async () => {
    if (!selectedOutputId) return;
    const cells = getExportCells();
    const { steps, warnings: exportWarnings } = trackerPatternToTD3Steps(cells, baseOctave);
    setWarnings(exportWarnings);
    const patternData = {
      group: selectedGroup,
      pattern: selectedPattern,
      steps,
      triplet: false,
      activeSteps: Math.min(16, cells.length)
    };
    const sysex = encodePattern(patternData);
    setIsSending(true);
    setSendResult(null);
    try {
      getMIDIManager().sendSysEx(sysex);
      setSendResult({
        success: true,
        message: `Pattern sent to ${formatPatternLocation(selectedGroup, selectedPattern)}`
      });
    } catch (error) {
      setSendResult({
        success: false,
        message: error instanceof Error ? error.message : "Failed to send pattern"
      });
    } finally {
      setIsSending(false);
    }
  };
  const handleExportFile = () => {
    const cells = getExportCells();
    const { steps } = trackerPatternToTD3Steps(cells, baseOctave);
    const patternData = {
      name: `Pattern ${formatPatternLocation(selectedGroup, selectedPattern)}`,
      steps: steps.map((s) => ({
        note: s.note ? s.note.value : null,
        octave: s.note ? s.note.octave : 0,
        upperC: s.note ? s.note.upperC : false,
        flag1: s.accent ? 1 : void 0,
        flag2: s.slide ? 2 : void 0,
        tie: s.tie
      })),
      activeSteps: Math.min(16, cells.length)
    };
    const blob = new Blob([JSON.stringify(patternData, null, 2)], { type: "application/json" });
    FileSaver_minExports.saveAs(blob, `td3-pattern-${formatPatternLocation(selectedGroup, selectedPattern).replace(" ", "")}.json`);
    setSendResult({
      success: true,
      message: "Pattern exported to JSON file"
    });
  };
  const handleExportSeq = () => {
    const cells = getExportCells();
    const { steps } = trackerPatternToTD3Steps(cells, baseOctave);
    const patternData = {
      group: selectedGroup,
      pattern: selectedPattern,
      steps,
      triplet: false,
      activeSteps: Math.min(16, cells.length)
    };
    try {
      const bytes = exportTD3PatternToSeq(patternData);
      const blob = new Blob([bytes.buffer], { type: "application/octet-stream" });
      FileSaver_minExports.saveAs(blob, `td3-pattern-${formatPatternLocation(selectedGroup, selectedPattern).replace(" ", "")}.seq`);
      setSendResult({
        success: true,
        message: "Pattern exported to .seq file"
      });
    } catch {
      setSendResult({
        success: false,
        message: "Failed to export .seq file"
      });
    }
  };
  const handleFileImport = async (e) => {
    var _a2;
    const file = (_a2 = e.target.files) == null ? void 0 : _a2[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      if (file.name.toLowerCase().endsWith(".sqs")) {
        const td3File = await parseTD3File(buffer);
        if (td3File.patterns.length > 0) {
          const firstPatt = td3File.patterns[0];
          setReceivedPattern({
            group: 0,
            pattern: 0,
            steps: firstPatt.steps,
            triplet: firstPatt.triplet || false,
            activeSteps: firstPatt.length
          });
          setSendResult({
            success: true,
            message: `Loaded pattern "${firstPatt.name}" from .sqs file`
          });
        }
      } else {
        const text = new TextDecoder().decode(buffer);
        const data = JSON.parse(text);
        const mappedSteps = data.steps.map((s) => ({
          note: s.note === null ? null : { value: s.note, octave: s.octave, upperC: s.upperC || false },
          flag1: s.accent ? 1 : void 0,
          flag2: s.slide ? 2 : void 0,
          tie: s.tie
        }));
        setReceivedPattern({
          group: data.group || 0,
          pattern: data.pattern || 0,
          steps: mappedSteps,
          triplet: data.triplet || false,
          activeSteps: data.activeSteps || 16
        });
        setSendResult({
          success: true,
          message: "Loaded pattern from JSON file"
        });
      }
    } catch {
      setSendResult({
        success: false,
        message: "Failed to parse pattern file"
      });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  const handleRequestPattern = () => {
    if (!selectedOutputId || !selectedInputId) return;
    const sysex = encodePatternRequest(selectedGroup, selectedPattern);
    setIsRequesting(true);
    setReceivedPattern(null);
    setSendResult(null);
    try {
      getMIDIManager().sendSysEx(sysex);
      if (requestTimeoutRef.current !== null) {
        clearTimeout(requestTimeoutRef.current);
      }
      requestTimeoutRef.current = window.setTimeout(() => {
        requestTimeoutRef.current = null;
        setIsRequesting(false);
        setSendResult({
          success: false,
          message: "No response from TD-3. Make sure it is connected and in the correct mode."
        });
      }, 5e3);
    } catch (error) {
      setIsRequesting(false);
      setSendResult({
        success: false,
        message: error instanceof Error ? error.message : "Failed to send request"
      });
    }
  };
  const handleImportIntoPattern = () => {
    if (!receivedPattern) return;
    const { instruments, addInstrument } = useInstrumentStore.getState();
    let tb303Instrument = instruments.find((inst) => inst.synthType === "TB303");
    if (!tb303Instrument) {
      const newInst = createDefaultTB303Instrument();
      addInstrument(newInst);
      tb303Instrument = newInst;
    }
    const instrumentIndex = instruments.findIndex((i) => i.id === tb303Instrument.id) + 1;
    const cells = td3StepsToTrackerCells(receivedPattern.steps, baseOctave);
    const stepsToImport = Math.min(receivedPattern.activeSteps, cells.length);
    for (let i = 0; i < stepsToImport; i++) {
      const cell = cells[i];
      setCell(selectedChannel, i, {
        note: cell.note,
        instrument: cell.note ? instrumentIndex : void 0,
        // Set instrument for notes
        flag1: cell.flag1,
        flag2: cell.flag2
      });
    }
    setSendResult({
      success: true,
      message: `Imported ${stepsToImport} steps into channel ${selectedChannel + 1} with TB-303`
    });
    setReceivedPattern(null);
  };
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "fixed inset-0 bg-black/60 flex items-center justify-center z-[99990] animate-fade-in", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-hidden animate-slide-in-up", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-3 border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-bold text-text-primary", children: "TD-3 Pattern Transfer" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
        lineNumber: 364,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: onClose,
          className: "p-1 rounded hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors",
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 18 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 369,
            columnNumber: 13
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 365,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
      lineNumber: 363,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab("export"),
          className: `flex-1 px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${activeTab === "export" ? "text-text-primary border-b-2 border-accent-primary bg-dark-bgActive" : "text-text-secondary hover:text-text-primary"}`,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Upload, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 383,
              columnNumber: 13
            }, void 0),
            "Export"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 375,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setActiveTab("import"),
          className: `flex-1 px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${activeTab === "import" ? "text-text-primary border-b-2 border-accent-primary bg-dark-bgActive" : "text-text-secondary hover:text-text-primary"}`,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Download, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 394,
              columnNumber: 13
            }, void 0),
            "Import"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 386,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
      lineNumber: 374,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4 overflow-y-auto max-h-[400px]", children: [
      !selectedOutputId && activeTab === "export" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 p-3 bg-accent-warning/10 border border-accent-warning/30 rounded-md", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TriangleAlert, { size: 16, className: "text-accent-warning flex-shrink-0" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 404,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm text-text-secondary", children: "No MIDI output selected. You can still export to file." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 405,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
        lineNumber: 403,
        columnNumber: 13
      }, void 0),
      (!selectedOutputId || !selectedInputId) && activeTab === "import" && !receivedPattern && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 p-3 bg-dark-bgTertiary border border-dark-border rounded-md", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TriangleAlert, { size: 16, className: "text-text-muted flex-shrink-0" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 413,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm text-text-muted", children: 'MIDI transfer requires hardware. Use "Load File" for .sqs or .json patterns.' }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 414,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
        lineNumber: 412,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-medium text-text-muted uppercase tracking-wide mb-1", children: "Group" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 423,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: GROUP_NAMES.map((name, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setSelectedGroup(idx),
              className: `flex-1 py-2 rounded font-medium text-sm transition-colors
                      ${selectedGroup === idx ? "bg-accent-primary text-text-inverse" : "bg-dark-bgTertiary text-text-secondary hover:text-text-primary hover:bg-dark-bgActive"}`,
              children: name
            },
            name,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 428,
              columnNumber: 19
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 426,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 422,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-medium text-text-muted uppercase tracking-wide mb-1", children: "Pattern (1-16)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 444,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(selectedPattern),
              onChange: (v) => setSelectedPattern(Number(v)),
              options: Array.from({ length: 16 }, (_, i) => ({
                value: String(i),
                label: i < 8 ? `A${i + 1}` : `B${i - 7}`
              })),
              className: "w-full px-3 py-2 rounded bg-dark-bgTertiary border border-dark-border text-text-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 447,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 443,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
        lineNumber: 421,
        columnNumber: 11
      }, void 0),
      activeTab === "export" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-medium text-text-muted uppercase tracking-wide mb-1", children: "Source Channel" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 464,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                value: String(selectedChannel),
                onChange: (v) => setSelectedChannel(Number(v)),
                options: channels.map((ch, idx) => ({
                  value: String(idx),
                  label: ch.name || `Channel ${idx + 1}`
                })),
                className: "w-full px-3 py-2 rounded bg-dark-bgTertiary border border-dark-border text-text-primary"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                lineNumber: 467,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 463,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-medium text-text-muted uppercase tracking-wide mb-1", children: "Base Octave" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 479,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                value: String(baseOctave),
                onChange: (v) => setBaseOctave(Number(v)),
                options: [
                  { value: "1", label: "C1 - C4" },
                  { value: "2", label: "C2 - C5" },
                  { value: "3", label: "C3 - C6" },
                  { value: "4", label: "C4 - C7" }
                ],
                className: "w-full px-3 py-2 rounded bg-dark-bgTertiary border border-dark-border text-text-primary"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                lineNumber: 482,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 478,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 462,
          columnNumber: 15
        }, void 0),
        (validation.warnings.length > 0 || warnings.length > 0) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1", children: [...validation.warnings, ...warnings].map((warning, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "flex items-center gap-2 text-xs text-accent-warning",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TriangleAlert, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                lineNumber: 504,
                columnNumber: 23
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: warning }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                lineNumber: 505,
                columnNumber: 23
              }, void 0)
            ]
          },
          i,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 500,
            columnNumber: 21
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 498,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { children: [
          "Exporting ",
          Math.min(16, getExportCells().length),
          " steps from",
          " ",
          ((_a = channels[selectedChannel]) == null ? void 0 : _a.name) || `Channel ${selectedChannel + 1}`,
          " to",
          " ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-primary font-mono", children: formatPatternLocation(selectedGroup, selectedPattern) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 516,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 513,
          columnNumber: 17
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 512,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
        lineNumber: 461,
        columnNumber: 13
      }, void 0),
      activeTab === "import" && receivedPattern && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 bg-dark-bgTertiary rounded-md border border-accent-primary/20", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h4", { className: "text-sm font-medium text-text-primary mb-2 flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Check, { size: 14, className: "text-accent-success" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 528,
            columnNumber: 17
          }, void 0),
          "Pattern Loaded"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 527,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted", children: [
          receivedPattern.activeSteps,
          " active steps detected."
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 531,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-medium text-text-muted uppercase tracking-wide mb-1", children: "Target Channel" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 536,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: String(selectedChannel),
              onChange: (v) => setSelectedChannel(Number(v)),
              options: channels.map((ch, idx) => ({
                value: String(idx),
                label: ch.name || `Channel ${idx + 1}`
              })),
              className: "w-full px-3 py-2 rounded bg-dark-bg border border-dark-border text-text-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 539,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 535,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
        lineNumber: 526,
        columnNumber: 13
      }, void 0),
      sendResult && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: `flex items-center gap-2 p-3 rounded-md ${sendResult.success ? "bg-accent-success/10 border border-accent-success/30" : "bg-accent-error/10 border border-accent-error/30"}`,
          children: [
            sendResult.success ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Check, { size: 16, className: "text-accent-success" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 562,
              columnNumber: 17
            }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TriangleAlert, { size: 16, className: "text-accent-error" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 564,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm text-text-secondary", children: sendResult.message }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 566,
              columnNumber: 15
            }, void 0)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 554,
          columnNumber: 13
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
      lineNumber: 400,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-dark-border bg-dark-bgTertiary", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
        activeTab === "import" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              ref: fileInputRef,
              type: "file",
              accept: ".json,.sqs",
              className: "hidden",
              onChange: handleFileImport
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 576,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => {
                var _a2;
                return (_a2 = fileInputRef.current) == null ? void 0 : _a2.click();
              },
              className: "px-3 py-2 text-xs font-bold bg-dark-bg border border-dark-border text-text-secondary hover:text-text-primary rounded transition-colors flex items-center gap-2",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileUp, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                  lineNumber: 587,
                  columnNumber: 19
                }, void 0),
                "LOAD FILE"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 583,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 575,
          columnNumber: 15
        }, void 0),
        activeTab === "export" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: handleExportFile,
              className: "px-3 py-2 text-xs font-bold bg-dark-bg border border-dark-border text-text-secondary hover:text-text-primary rounded transition-colors flex items-center gap-2",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileDown, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                  lineNumber: 598,
                  columnNumber: 19
                }, void 0),
                "SAVE AS JSON"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 594,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: handleExportSeq,
              className: "px-3 py-2 text-xs font-bold bg-dark-bg border border-dark-border text-text-secondary hover:text-text-primary rounded transition-colors flex items-center gap-2",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileDown, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                  lineNumber: 605,
                  columnNumber: 19
                }, void 0),
                "SAVE AS .SEQ"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 601,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
          lineNumber: 593,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
        lineNumber: 573,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onClose,
            className: "px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors",
            children: "Close"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 613,
            columnNumber: 13
          },
          void 0
        ),
        activeTab === "export" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleExport,
            disabled: !selectedOutputId || isSending || !validation.valid,
            className: "px-4 py-2 text-sm font-medium bg-accent-primary text-text-inverse rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-glow-sm",
            children: isSending ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LoaderCircle, { size: 14, className: "animate-spin" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                lineNumber: 628,
                columnNumber: 21
              }, void 0),
              "Sending..."
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 627,
              columnNumber: 19
            }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Upload, { size: 14 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                lineNumber: 633,
                columnNumber: 21
              }, void 0),
              "Send to TD-3"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 632,
              columnNumber: 19
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 621,
            columnNumber: 15
          },
          void 0
        ),
        activeTab === "import" && !receivedPattern && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleRequestPattern,
            disabled: !selectedOutputId || !selectedInputId || isRequesting,
            className: "px-4 py-2 text-sm font-medium bg-accent-primary text-text-inverse rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2",
            children: isRequesting ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LoaderCircle, { size: 14, className: "animate-spin" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                lineNumber: 648,
                columnNumber: 21
              }, void 0),
              "Requesting..."
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 647,
              columnNumber: 19
            }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Download, { size: 14 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                lineNumber: 653,
                columnNumber: 21
              }, void 0),
              "Request from TD-3"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
              lineNumber: 652,
              columnNumber: 19
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 641,
            columnNumber: 15
          },
          void 0
        ),
        activeTab === "import" && receivedPattern && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleImportIntoPattern,
            className: "px-4 py-2 text-sm font-medium bg-accent-success text-text-inverse rounded hover:bg-accent-success/90 transition-colors flex items-center gap-2 shadow-glow-sm",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Check, { size: 14 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
                lineNumber: 665,
                columnNumber: 17
              }, void 0),
              "Insert into Pattern"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
            lineNumber: 661,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
        lineNumber: 612,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
      lineNumber: 572,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
    lineNumber: 361,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/TD3PatternDialog.tsx",
    lineNumber: 360,
    columnNumber: 5
  }, void 0);
};
export {
  TD3PatternDialog
};
