import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, A as Music, V as Volume2, p as Trash2, k as SlidersVertical } from "./vendor-ui-AJ7AT9BN.js";
import { e as useInstrumentStore, cV as useShallow, $ as getToneEngine, W as CustomSelect } from "./main-BbV5VyEH.js";
import { start, now } from "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK_KEYS = [1, 3, 6, 8, 10];
function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[midi % 12];
  return `${note}${octave}`;
}
function isBlackKey(midi) {
  return BLACK_KEYS.includes(midi % 12);
}
function getMappingColor(sampleId) {
  const colors = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#eab308",
    "#84cc16",
    "#22c55e",
    "#10b981",
    "#14b8a6",
    "#06b6d4",
    "#0ea5e9",
    "#3b82f6",
    "#6366f1",
    "#8b5cf6",
    "#a855f7",
    "#d946ef",
    "#ec4899",
    "#f43f5e"
  ];
  let hash = 0;
  for (let i = 0; i < sampleId.length; i++) {
    hash = (hash << 5) - hash + sampleId.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
}
const DrumKitEditor = ({ instrument, onUpdate }) => {
  const { instruments } = useInstrumentStore(useShallow((s) => ({ instruments: s.instruments })));
  const drumKit = instrument.drumKit || { keymap: [], polyphony: "poly", maxVoices: 8, noteCut: false };
  const [editingMapping, setEditingMapping] = reactExports.useState(null);
  const [showAddMapping, setShowAddMapping] = reactExports.useState(false);
  const [newMappingNote, setNewMappingNote] = reactExports.useState(36);
  const scrollRef = reactExports.useRef(null);
  const sampleInstruments = reactExports.useMemo(() => {
    return instruments.filter((inst) => {
      var _a;
      return inst.type === "sample" && ((_a = inst.sample) == null ? void 0 : _a.url);
    });
  }, [instruments]);
  const findMappingForNote = reactExports.useCallback((note) => {
    return drumKit.keymap.find((m) => note >= m.noteStart && note <= m.noteEnd);
  }, [drumKit.keymap]);
  const handleAddMapping = reactExports.useCallback((sampleId, noteStart, noteEnd) => {
    const sampleInst = instruments.find((i) => i.id.toString() === sampleId);
    if (!sampleInst || !sampleInst.sample) return;
    const newMapping = {
      id: `mapping-${Date.now()}-${Math.random()}`,
      noteStart,
      noteEnd,
      sampleId,
      sampleUrl: sampleInst.sample.url,
      sampleName: sampleInst.name,
      pitchOffset: 0,
      fineTune: 0,
      volumeOffset: 0,
      panOffset: 0
    };
    const updatedKeymap = [...drumKit.keymap, newMapping];
    onUpdate({
      drumKit: {
        ...drumKit,
        keymap: updatedKeymap
      }
    });
    setShowAddMapping(false);
    setEditingMapping(newMapping);
  }, [instruments, drumKit, onUpdate]);
  const handleRemoveMapping = reactExports.useCallback((mappingId) => {
    const updatedKeymap = drumKit.keymap.filter((m) => m.id !== mappingId);
    onUpdate({
      drumKit: {
        ...drumKit,
        keymap: updatedKeymap
      }
    });
    if ((editingMapping == null ? void 0 : editingMapping.id) === mappingId) {
      setEditingMapping(null);
    }
  }, [drumKit, onUpdate, editingMapping]);
  const handleUpdateMapping = reactExports.useCallback((mappingId, updates) => {
    const updatedKeymap = drumKit.keymap.map(
      (m) => m.id === mappingId ? { ...m, ...updates } : m
    );
    onUpdate({
      drumKit: {
        ...drumKit,
        keymap: updatedKeymap
      }
    });
    if ((editingMapping == null ? void 0 : editingMapping.id) === mappingId) {
      setEditingMapping({ ...editingMapping, ...updates });
    }
  }, [drumKit, onUpdate, editingMapping]);
  const handlePreviewNote = reactExports.useCallback(async (note) => {
    try {
      await start();
      const engine = getToneEngine();
      await engine.ensureInstrumentReady(instrument);
      const noteName = midiToNoteName(note);
      const now$1 = now();
      engine.triggerNoteAttack(instrument.id, noteName, now$1, 0.8, instrument);
      setTimeout(() => {
        engine.triggerNoteRelease(instrument.id, noteName, now(), instrument);
      }, 200);
    } catch (error) {
      console.warn("[DrumKitEditor] Preview failed:", error);
    }
  }, [instrument]);
  const handleKeyClick = reactExports.useCallback((note) => {
    const mapping = findMappingForNote(note);
    if (mapping) {
      setEditingMapping(mapping);
      handlePreviewNote(note);
    } else {
      setNewMappingNote(note);
      setShowAddMapping(true);
    }
  }, [findMappingForNote, handlePreviewNote]);
  const handleUpdateSettings = reactExports.useCallback((updates) => {
    onUpdate({
      drumKit: {
        ...drumKit,
        ...updates
      }
    });
  }, [drumKit, onUpdate]);
  reactExports.useEffect(() => {
    if (scrollRef.current) {
      const middleC = 60;
      const keyHeight = 32;
      scrollRef.current.scrollTop = (96 - middleC) * keyHeight - 200;
    }
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full bg-dark-bgSecondary", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-shrink-0 bg-dark-bgTertiary border-b border-dark-border p-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 18, className: "text-accent-primary" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 196,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-sm font-medium text-text-primary", children: "DrumKit Editor" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 197,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 195,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 text-xs text-text-muted", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
          drumKit.keymap.length,
          " mappings"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 200,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 199,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
        lineNumber: 194,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 text-xs", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "Polyphony:" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 207,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: drumKit.polyphony,
              onChange: (v) => handleUpdateSettings({ polyphony: v }),
              className: "bg-dark-bgActive border border-dark-border rounded px-2 py-1 text-text-primary",
              options: [
                { value: "poly", label: "Polyphonic" },
                { value: "mono", label: "Monophonic" }
              ]
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
              lineNumber: 208,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 206,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "Max Voices:" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 220,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "number",
              min: "1",
              max: "16",
              value: drumKit.maxVoices,
              onChange: (e) => handleUpdateSettings({ maxVoices: parseInt(e.target.value) || 8 }),
              className: "bg-dark-bgActive border border-dark-border rounded px-2 py-1 w-16 text-text-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
              lineNumber: 221,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 219,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "checkbox",
              checked: drumKit.noteCut,
              onChange: (e) => handleUpdateSettings({ noteCut: e.target.checked }),
              className: "rounded"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
              lineNumber: 232,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "Note Cut" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 238,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 231,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
        lineNumber: 205,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
      lineNumber: 193,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex overflow-hidden", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: scrollRef, className: "flex-1 overflow-y-auto overflow-x-hidden bg-dark-bg", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: Array.from({ length: 96 }, (_, i) => 95 - i).map((note) => {
        const mapping = findMappingForNote(note);
        const isBlack = isBlackKey(note);
        const noteName = midiToNoteName(note);
        const octave = Math.floor(note / 12) - 1;
        const noteInOctave = note % 12;
        const isC = noteInOctave === 0;
        const mappingColor = mapping ? getMappingColor(mapping.sampleId) : void 0;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            onClick: () => handleKeyClick(note),
            className: `
                    relative flex items-center border-b border-dark-border cursor-pointer
                    transition-colors hover:bg-dark-bgHover
                    ${mapping ? "bg-dark-bgTertiary" : "bg-dark-bg"}
                    ${(editingMapping == null ? void 0 : editingMapping.id) === (mapping == null ? void 0 : mapping.id) ? "ring-2 ring-accent-primary" : ""}
                    ${isC ? "border-t-2 border-t-accent-primary/30" : ""}
                  `,
            style: {
              height: "32px",
              backgroundColor: mapping && mappingColor ? `${mappingColor}22` : void 0,
              borderLeft: mapping && mappingColor ? `4px solid ${mappingColor}` : void 0
            },
            title: mapping ? `${noteName}: ${mapping.sampleName}` : `${noteName}: No mapping`,
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-shrink-0 w-16 px-2 flex items-center justify-between", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `text-xs font-mono ${isBlack ? "text-text-muted" : "text-text-secondary"}`, children: noteName }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                  lineNumber: 278,
                  columnNumber: 21
                }, void 0),
                isC && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-accent-primary/50 font-bold", children: [
                  "C",
                  octave
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                  lineNumber: 282,
                  columnNumber: 23
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 277,
                columnNumber: 19
              }, void 0),
              mapping && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center gap-2 px-2 overflow-hidden", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Volume2, { size: 12, className: "flex-shrink-0 text-text-muted" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                  lineNumber: 289,
                  columnNumber: 23
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-primary truncate", children: mapping.sampleName }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                  lineNumber: 290,
                  columnNumber: 23
                }, void 0),
                mapping.pitchOffset !== 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-accent-primary", children: [
                  mapping.pitchOffset > 0 ? "+" : "",
                  mapping.pitchOffset,
                  "st"
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                  lineNumber: 292,
                  columnNumber: 25
                }, void 0),
                mapping.volumeOffset !== 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-blue-400", children: [
                  mapping.volumeOffset > 0 ? "+" : "",
                  mapping.volumeOffset,
                  "dB"
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                  lineNumber: 297,
                  columnNumber: 25
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 288,
                columnNumber: 21
              }, void 0)
            ]
          },
          note,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 259,
            columnNumber: 17
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
        lineNumber: 247,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
        lineNumber: 246,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-shrink-0 w-80 bg-dark-bgTertiary border-l border-dark-border overflow-y-auto", children: editingMapping ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h4", { className: "text-sm font-medium text-text-primary", children: "Mapping Parameters" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 314,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => handleRemoveMapping(editingMapping.id),
              className: "p-1 text-text-muted hover:text-accent-error transition-colors",
              title: "Remove mapping",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Trash2, { size: 14 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 320,
                columnNumber: 19
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
              lineNumber: 315,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 313,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg rounded p-3 space-y-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: "Sample" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 326,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm text-text-primary font-medium", children: editingMapping.sampleName }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 327,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: [
            midiToNoteName(editingMapping.noteStart),
            editingMapping.noteEnd > editingMapping.noteStart && ` - ${midiToNoteName(editingMapping.noteEnd)}`
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 328,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 325,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs text-text-muted mb-1 block", children: "Pitch Offset (semitones)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 336,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: "-48",
                max: "48",
                value: editingMapping.pitchOffset,
                onChange: (e) => handleUpdateMapping(editingMapping.id, { pitchOffset: parseInt(e.target.value) }),
                className: "flex-1"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 338,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: "-48",
                max: "48",
                value: editingMapping.pitchOffset,
                onChange: (e) => handleUpdateMapping(editingMapping.id, { pitchOffset: parseInt(e.target.value) || 0 }),
                className: "w-16 bg-dark-bgActive border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 346,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 337,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 335,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs text-text-muted mb-1 block", children: "Fine Tune (cents)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 359,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: "-100",
                max: "100",
                value: editingMapping.fineTune,
                onChange: (e) => handleUpdateMapping(editingMapping.id, { fineTune: parseInt(e.target.value) }),
                className: "flex-1"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 361,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: "-100",
                max: "100",
                value: editingMapping.fineTune,
                onChange: (e) => handleUpdateMapping(editingMapping.id, { fineTune: parseInt(e.target.value) || 0 }),
                className: "w-16 bg-dark-bgActive border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 369,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 360,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 358,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs text-text-muted mb-1 block", children: "Volume Offset (dB)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 382,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: "-12",
                max: "12",
                step: "0.5",
                value: editingMapping.volumeOffset,
                onChange: (e) => handleUpdateMapping(editingMapping.id, { volumeOffset: parseFloat(e.target.value) }),
                className: "flex-1"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 384,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: "-12",
                max: "12",
                step: "0.5",
                value: editingMapping.volumeOffset,
                onChange: (e) => handleUpdateMapping(editingMapping.id, { volumeOffset: parseFloat(e.target.value) || 0 }),
                className: "w-16 bg-dark-bgActive border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 393,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 383,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 381,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs text-text-muted mb-1 block", children: "Pan Offset" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 407,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: "-100",
                max: "100",
                value: editingMapping.panOffset,
                onChange: (e) => handleUpdateMapping(editingMapping.id, { panOffset: parseInt(e.target.value) }),
                className: "flex-1"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 409,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: "-100",
                max: "100",
                value: editingMapping.panOffset,
                onChange: (e) => handleUpdateMapping(editingMapping.id, { panOffset: parseInt(e.target.value) || 0 }),
                className: "w-16 bg-dark-bgActive border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 417,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 408,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mt-1", children: [
            "L ",
            " ←",
            " C ",
            "→ ",
            " R"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 426,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 406,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => handlePreviewNote(editingMapping.noteStart),
            className: "w-full px-3 py-2 bg-accent-primary hover:bg-accent-primary/80 text-text-primary rounded transition-colors text-sm",
            children: "Test Sample"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 432,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
        lineNumber: 312,
        columnNumber: 13
      }, void 0) : showAddMapping ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h4", { className: "text-sm font-medium text-text-primary", children: "Add Mapping" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 442,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setShowAddMapping(false),
              className: "text-xs text-text-muted hover:text-text-primary",
              children: "Cancel"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
              lineNumber: 443,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 441,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs text-text-muted mb-2 block", children: [
          "Note: ",
          midiToNoteName(newMappingNote)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 452,
          columnNumber: 17
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 451,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs text-text-muted mb-2 block", children: "Select Sample" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 456,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1 max-h-64 overflow-y-auto", children: sampleInstruments.map((inst) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => handleAddMapping(inst.id.toString(), newMappingNote, newMappingNote),
              className: "w-full text-left px-3 py-2 bg-dark-bg hover:bg-dark-bgHover border border-dark-border rounded transition-colors",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-primary", children: inst.name }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
                lineNumber: 464,
                columnNumber: 23
              }, void 0)
            },
            inst.id,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
              lineNumber: 459,
              columnNumber: 21
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
            lineNumber: 457,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 455,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
        lineNumber: 440,
        columnNumber: 13
      }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 flex flex-col items-center justify-center h-full text-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 48, className: "text-text-muted mb-4" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 472,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-text-muted", children: "Click a key to edit its mapping" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 473,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted mt-2", children: "or add a new sample mapping" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
          lineNumber: 476,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
        lineNumber: 471,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
        lineNumber: 310,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
      lineNumber: 244,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/DrumKitEditor.tsx",
    lineNumber: 191,
    columnNumber: 5
  }, void 0);
};
export {
  DrumKitEditor
};
