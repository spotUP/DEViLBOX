import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, n as LayoutGrid, o as Drum, X, Z as Zap, p as Trash2, q as Radio, s as Play, t as Piano, u as Disc } from "./vendor-ui-AJ7AT9BN.js";
import { Y as getPadMappingManager, e as useInstrumentStore, Z as useMIDI, Q as useMIDIStore, O as useModalClose, _ as detectControllerProfile, $ as getToneEngine, W as CustomSelect, a0 as TR707DrumMap } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const DrumpadEditorModal = ({ isOpen, onClose }) => {
  const padManager = getPadMappingManager();
  const { instruments } = useInstrumentStore();
  const { devices, isEnabled } = useMIDI();
  const { padBank: activeBank, setPadBank: setActiveBank } = useMIDIStore();
  const [mappings, setMappings] = reactExports.useState([]);
  const [selectedPadIndex, setSelectedPadIndex] = reactExports.useState(null);
  const [isLearning, setIsLearning] = reactExports.useState(false);
  useModalClose({ isOpen, onClose });
  const drumMachines = reactExports.useMemo(() => {
    return instruments.filter(
      (inst) => {
        var _a;
        return inst.synthType === "MAMETR707" || ((_a = inst.synthType) == null ? void 0 : _a.toLowerCase().includes("drum")) || inst.name.toLowerCase().includes("drum machine");
      }
    );
  }, [instruments]);
  const refreshMappings = reactExports.useCallback(() => {
    setMappings(padManager.getAllMappings());
  }, [padManager]);
  const handleLoadDrumMachine = (drumMachineId) => {
    const drumMachine = instruments.find((inst) => inst.id === drumMachineId);
    if (!drumMachine) return;
    const startNote = 36;
    const notes = Array.from({ length: 16 }, (_, i) => startNote + i);
    notes.forEach((n) => {
      const mapping = padManager.getMapping(9, n);
      if (mapping) padManager.removeMapping(mapping.id);
    });
    if (drumMachine.synthType === "MAMETR707") {
      const drumMap = [
        { note: TR707DrumMap.BASS_1, padNote: 36, label: "Bass 1" },
        { note: TR707DrumMap.RIMSHOT, padNote: 37, label: "Rimshot" },
        { note: TR707DrumMap.SNARE_1, padNote: 38, label: "Snare 1" },
        { note: TR707DrumMap.HANDCLAP, padNote: 39, label: "Handclap" },
        { note: TR707DrumMap.SNARE_2, padNote: 40, label: "Snare 2" },
        { note: TR707DrumMap.LOW_TOM, padNote: 41, label: "Low Tom" },
        { note: TR707DrumMap.CLOSED_HIHAT, padNote: 42, label: "Closed HH" },
        { note: TR707DrumMap.MID_TOM, padNote: 43, label: "Mid Tom" },
        // Bank B
        { note: TR707DrumMap.OPEN_HIHAT, padNote: 46, label: "Open HH" },
        { note: TR707DrumMap.CRASH, padNote: 49, label: "Crash" },
        { note: TR707DrumMap.HI_TOM, padNote: 50, label: "Hi Tom" },
        { note: TR707DrumMap.RIDE, padNote: 51, label: "Ride" },
        { note: TR707DrumMap.TAMBOURINE, padNote: 54, label: "Tambourine" },
        { note: TR707DrumMap.COWBELL, padNote: 56, label: "Cowbell" }
      ];
      drumMap.forEach(({ note, padNote }) => {
        padManager.setMapping({
          id: `9-${padNote}`,
          inputChannel: 9,
          inputNote: padNote,
          type: "instrument",
          targetInstrumentId: drumMachine.id,
          targetNote: note
        });
      });
    } else {
      notes.slice(0, 8).forEach((padNote, i) => {
        padManager.setMapping({
          id: `9-${padNote}`,
          inputChannel: 9,
          inputNote: padNote,
          type: "instrument",
          targetInstrumentId: drumMachine.id,
          targetNote: 36 + i
          // Start from C1 and go up chromatically
        });
      });
    }
    refreshMappings();
  };
  const handleLoadPreset = () => {
    const startNote = 36;
    const notes = Array.from({ length: 16 }, (_, i) => startNote + i);
    notes.forEach((n) => {
      const mapping = padManager.getMapping(9, n);
      if (mapping) padManager.removeMapping(mapping.id);
    });
    const findInst = (keywords, synthType) => {
      let found = instruments.find(
        (inst) => keywords.some((k) => inst.name.toLowerCase().includes(k.toLowerCase()))
      );
      if (!found && synthType) {
        found = instruments.find((inst) => inst.synthType === synthType);
      }
      if (!found) {
        found = instruments.find(
          (inst) => keywords.some((k) => inst.synthType.toLowerCase().includes(k.toLowerCase()))
        );
      }
      return found;
    };
    const slots = [
      { keywords: ["Kick", "BD", "Bass Drum"], synthType: "DrumMachine", note: 36 },
      { keywords: ["Snare", "SD"], synthType: "DrumMachine", note: 38 },
      { keywords: ["Clap", "CP"], synthType: "DrumMachine", note: 39 },
      { keywords: ["Closed Hat", "CH", "HH"], synthType: "DrumMachine", note: 42 },
      { keywords: ["Open Hat", "OH"], synthType: "DrumMachine", note: 46 },
      { keywords: ["Rim", "RS"], synthType: "DrumMachine", note: 37 },
      { keywords: ["Tom", "Low"], synthType: "DrumMachine", note: 41 },
      { keywords: ["Tom", "Hi"], synthType: "DrumMachine", note: 43 },
      { keywords: ["Synare", "Disco"], synthType: "Synare", note: 40 },
      { keywords: ["Siren", "Dub"], synthType: "DubSiren", note: 48 },
      // Pad 13 (Bank B start)
      { keywords: ["Laser", "Zap"], synthType: "SpaceLaser", note: 49 }
      // Pad 14
    ];
    slots.forEach((slot) => {
      const inst = findInst(slot.keywords);
      if (inst) {
        padManager.setMapping({
          id: `9-${slot.note}`,
          inputChannel: 9,
          inputNote: slot.note,
          type: "instrument",
          targetInstrumentId: inst.id,
          targetNote: 60
        });
      }
    });
    refreshMappings();
  };
  reactExports.useEffect(() => {
    if (isOpen && isEnabled) {
      padManager.init();
      const frame = requestAnimationFrame(() => refreshMappings());
      return () => cancelAnimationFrame(frame);
    }
  }, [isOpen, isEnabled, padManager, refreshMappings]);
  reactExports.useEffect(() => {
    if (isOpen && mappings.length === 0 && devices.length > 0) {
      const profile = detectControllerProfile(devices[0].name || "");
      if (profile && profile.pads.length > 0) ;
    }
  }, [isOpen, devices, mappings.length]);
  const DEFAULT_PADS = Array.from({ length: 16 }, (_, i) => ({
    index: i,
    label: `Pad ${i + 1}`,
    defaultNote: 36 + i,
    bank: i < 8 ? "A" : "B"
  }));
  const getMappingForPad = (padIndex) => {
    const defaultNote = 36 + padIndex;
    return mappings.find((m) => m.inputNote === defaultNote);
  };
  const handlePadClick = (index) => {
    setSelectedPadIndex(index);
  };
  const previewInstrument = reactExports.useCallback((id) => {
    const inst = instruments.find((i) => i.id === id);
    if (inst) {
      const engine = getToneEngine();
      engine.triggerPolyNoteAttack(inst.id, "C4", 1, inst);
      setTimeout(() => {
        engine.triggerPolyNoteRelease(inst.id, "C4", inst);
      }, 500);
    }
  }, [instruments]);
  const handleInstrumentChange = (instrumentId) => {
    if (selectedPadIndex === null) return;
    const existing = getMappingForPad(selectedPadIndex);
    const defaultNote = 36 + selectedPadIndex;
    const newMapping = {
      id: (existing == null ? void 0 : existing.id) || `10-${defaultNote}`,
      // Default to Ch 10
      inputChannel: (existing == null ? void 0 : existing.inputChannel) || 9,
      // Ch 10 (0-indexed = 9)
      inputNote: (existing == null ? void 0 : existing.inputNote) || defaultNote,
      type: "instrument",
      targetInstrumentId: instrumentId,
      targetNote: (existing == null ? void 0 : existing.targetNote) || 60
      // Default C4
    };
    padManager.setMapping(newMapping);
    refreshMappings();
    previewInstrument(instrumentId);
  };
  const handleNoteChange = (note) => {
    if (selectedPadIndex === null) return;
    const existing = getMappingForPad(selectedPadIndex);
    if (!existing) return;
    padManager.setMapping({
      ...existing,
      targetNote: note
    });
    refreshMappings();
  };
  const startLearn = () => {
    if (selectedPadIndex === null) return;
    setIsLearning(true);
    padManager.startLearn((note, channel) => {
      var _a;
      const existing = getMappingForPad(selectedPadIndex);
      const targetId = (existing == null ? void 0 : existing.targetInstrumentId) ?? (((_a = instruments[0]) == null ? void 0 : _a.id) || 1);
      const newMapping = {
        id: `${channel}-${note}`,
        inputChannel: channel,
        inputNote: note,
        type: "instrument",
        targetInstrumentId: targetId,
        targetNote: (existing == null ? void 0 : existing.targetNote) || 60
      };
      if (existing && existing.id !== newMapping.id) {
        padManager.removeMapping(existing.id);
      }
      padManager.setMapping(newMapping);
      refreshMappings();
      setIsLearning(false);
    });
  };
  const removeMapping = () => {
    if (selectedPadIndex === null) return;
    const existing = getMappingForPad(selectedPadIndex);
    if (existing) {
      padManager.removeMapping(existing.id);
      refreshMappings();
    }
  };
  const getInstrumentName = (id) => {
    var _a;
    return ((_a = instruments.find((i) => i.id === id)) == null ? void 0 : _a.name) || `Inst ${id}`;
  };
  if (!isOpen) return null;
  const currentPadMapping = selectedPadIndex !== null ? getMappingForPad(selectedPadIndex) : null;
  const visiblePads = DEFAULT_PADS.filter((p) => p.bank === activeBank);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "fixed inset-0 bg-black/80 flex items-center justify-center z-[99990]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg w-[800px] h-[600px] flex flex-col", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-6 py-4 border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-6", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-xl font-semibold text-text-primary flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LayoutGrid, { size: 24 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
            lineNumber: 324,
            columnNumber: 15
          }, void 0),
          "Drumpad Editor"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
          lineNumber: 323,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          drumMachines.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 bg-dark-bgSecondary p-1 rounded-lg", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Drum, { size: 14, className: "text-accent-primary ml-2" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
              lineNumber: 331,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-muted uppercase", children: "Drum Kit:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
              lineNumber: 332,
              columnNumber: 19
            }, void 0),
            drumMachines.length === 1 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleLoadDrumMachine(drumMachines[0].id),
                className: "px-3 py-1 text-[10px] font-bold bg-accent-primary hover:bg-accent-primary/80 text-text-primary rounded transition-colors uppercase",
                title: `Auto-map ${drumMachines[0].name} to pads`,
                children: drumMachines[0].name
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                lineNumber: 334,
                columnNumber: 21
              },
              void 0
            ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                onChange: (v) => v && handleLoadDrumMachine(parseInt(v)),
                className: "px-2 py-1 text-[10px] font-bold bg-accent-primary hover:bg-accent-primary/80 text-text-primary rounded transition-colors uppercase cursor-pointer",
                value: "",
                placeholder: "Select Kit...",
                options: drumMachines.map((dm) => ({
                  value: String(dm.id),
                  label: dm.name
                }))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                lineNumber: 342,
                columnNumber: 21
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
            lineNumber: 330,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 bg-dark-bgSecondary p-1 rounded-lg", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-text-muted uppercase px-2", children: "Auto-Map:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
              lineNumber: 358,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleLoadPreset(),
                className: "px-3 py-1 text-[10px] font-bold bg-dark-bgActive hover:bg-accent-primary text-text-primary rounded transition-colors uppercase",
                children: "Match Names"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                lineNumber: 359,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
            lineNumber: 357,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
          lineNumber: 327,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
        lineNumber: 322,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: onClose, className: "text-text-muted hover:text-text-primary", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 24 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
        lineNumber: 369,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
        lineNumber: 368,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
      lineNumber: 321,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 overflow-hidden", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-2/3 p-6 border-r border-dark-border flex flex-col", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center mb-6 gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setActiveBank("A"),
              className: `px-6 py-2 rounded-full font-medium transition-all ${activeBank === "A" ? "bg-accent-primary text-text-primary" : "bg-dark-bgSecondary text-text-muted"}`,
              children: "Bank A"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
              lineNumber: 379,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setActiveBank("B"),
              className: `px-6 py-2 rounded-full font-medium transition-all ${activeBank === "B" ? "bg-accent-primary text-text-primary" : "bg-dark-bgSecondary text-text-muted"}`,
              children: "Bank B"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
              lineNumber: 385,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
          lineNumber: 378,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-4 flex-1", children: visiblePads.map((pad) => {
          const mapping = getMappingForPad(pad.index);
          const isSelected = selectedPadIndex === pad.index;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => handlePadClick(pad.index),
              className: `
                      relative rounded-lg p-4 flex flex-col items-center justify-center border-2 transition-all
                      ${isSelected ? "border-accent-primary bg-accent-primary/10" : mapping ? "border-accent-success/50 bg-dark-bgSecondary" : "border-dark-border bg-dark-bgSecondary/50 hover:bg-dark-bgSecondary"}
                    `,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold text-text-muted absolute top-2 left-2", children: pad.label }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                  lineNumber: 413,
                  columnNumber: 21
                }, void 0),
                mapping ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 24, className: "text-accent-success mb-2" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                    lineNumber: 419,
                    columnNumber: 25
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-medium text-text-primary text-center truncate w-full", children: getInstrumentName(mapping.targetInstrumentId) }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                    lineNumber: 420,
                    columnNumber: 25
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted mt-1", children: [
                    "Note: ",
                    mapping.targetNote
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                    lineNumber: 423,
                    columnNumber: 25
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                  lineNumber: 418,
                  columnNumber: 23
                }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted/50 text-sm", children: "Unmapped" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                  lineNumber: 428,
                  columnNumber: 23
                }, void 0)
              ]
            },
            pad.index,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
              lineNumber: 400,
              columnNumber: 19
            },
            void 0
          );
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
          lineNumber: 394,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
        lineNumber: 375,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-1/3 p-6 bg-dark-bgSecondary/30", children: selectedPadIndex !== null ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-6", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-lg font-medium text-text-primary", children: [
            "Pad ",
            selectedPadIndex + 1
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
            lineNumber: 441,
            columnNumber: 19
          }, void 0),
          currentPadMapping && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: removeMapping,
              className: "text-accent-error hover:bg-accent-error/10 p-2 rounded",
              title: "Remove Mapping",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Trash2, { size: 18 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                lineNumber: 450,
                columnNumber: 23
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
              lineNumber: 445,
              columnNumber: 21
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
          lineNumber: 440,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-sm font-medium text-text-secondary", children: "Input Trigger" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
            lineNumber: 457,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 bg-dark-bg border border-dark-border rounded px-3 py-2 text-text-muted text-sm flex items-center", children: currentPadMapping ? `CH ${currentPadMapping.inputChannel + 1} | Note ${currentPadMapping.inputNote}` : `Default: Note ${36 + selectedPadIndex}` }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
              lineNumber: 459,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: startLearn,
                className: `
                        px-3 py-2 rounded text-text-primary transition-colors flex items-center gap-2
                        ${isLearning ? "bg-accent-warning animate-pulse" : "bg-dark-bgActive hover:bg-accent-primary"}
                      `,
                children: [
                  isLearning ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Radio, { size: 16 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                    lineNumber: 472,
                    columnNumber: 37
                  }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                    lineNumber: 472,
                    columnNumber: 59
                  }, void 0),
                  isLearning ? "Learning..." : "Learn"
                ]
              },
              void 0,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                lineNumber: 465,
                columnNumber: 21
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
            lineNumber: 458,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
          lineNumber: 456,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-sm font-medium text-text-secondary", children: "Target Instrument" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
            lineNumber: 480,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                value: String((currentPadMapping == null ? void 0 : currentPadMapping.targetInstrumentId) ?? ""),
                onChange: (v) => handleInstrumentChange(parseInt(v)),
                className: "flex-1 bg-dark-bg border border-dark-border rounded px-3 py-2 text-text-primary",
                placeholder: "Select Instrument...",
                options: instruments.map((inst) => ({
                  value: String(inst.id),
                  label: `${inst.id.toString(16).toUpperCase().padStart(2, "0")} - ${inst.name}`
                }))
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                lineNumber: 482,
                columnNumber: 21
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => (currentPadMapping == null ? void 0 : currentPadMapping.targetInstrumentId) && previewInstrument(currentPadMapping.targetInstrumentId),
                disabled: !(currentPadMapping == null ? void 0 : currentPadMapping.targetInstrumentId),
                className: "p-2 bg-dark-bg border border-dark-border rounded text-text-secondary hover:text-accent-success hover:border-accent-success/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                title: "Preview Instrument",
                children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Play, { size: 18 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                  lineNumber: 498,
                  columnNumber: 23
                }, void 0)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                lineNumber: 492,
                columnNumber: 21
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
            lineNumber: 481,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
          lineNumber: 479,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-sm font-medium text-text-secondary", children: "Target Note" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
            lineNumber: 505,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Piano, { size: 16, className: "text-text-muted" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
              lineNumber: 507,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: "0",
                max: "127",
                value: (currentPadMapping == null ? void 0 : currentPadMapping.targetNote) || 60,
                onChange: (e) => handleNoteChange(parseInt(e.target.value)),
                className: "flex-1 bg-dark-bg border border-dark-border rounded px-3 py-2 text-text-primary"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
                lineNumber: 508,
                columnNumber: 21
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted w-8", title: "MIDI note name", children: (() => {
              const n = (currentPadMapping == null ? void 0 : currentPadMapping.targetNote) ?? 60;
              const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
              return `${names[n % 12]}${Math.floor(n / 12) - 1}`;
            })() }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
              lineNumber: 516,
              columnNumber: 21
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
            lineNumber: 506,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted", children: "MIDI Note to trigger (60 = C-4)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
            lineNumber: 524,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
          lineNumber: 504,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
        lineNumber: 439,
        columnNumber: 15
      }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-full flex flex-col items-center justify-center text-text-muted", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc, { size: 48, className: "mb-4 opacity-50" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
          lineNumber: 532,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { children: "Select a pad to edit" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
          lineNumber: 533,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
        lineNumber: 531,
        columnNumber: 15
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
        lineNumber: 437,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
      lineNumber: 373,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
    lineNumber: 319,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/midi/DrumpadEditorModal.tsx",
    lineNumber: 318,
    columnNumber: 5
  }, void 0);
};
export {
  DrumpadEditorModal
};
