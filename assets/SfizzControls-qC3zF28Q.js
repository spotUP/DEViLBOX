import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cx as DEFAULT_SFIZZ, aB as Knob } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const OVERSAMPLING_OPTIONS = [
  { label: "1x", value: 0 },
  { label: "2x", value: 1 },
  { label: "4x", value: 2 },
  { label: "8x", value: 3 }
];
const SfizzControls = ({ config, onChange, onLoadFiles, loadedName }) => {
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const [dragOver, setDragOver] = reactExports.useState(false);
  const updateParam = reactExports.useCallback((key, value) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);
  const fileInputRef = reactExports.useRef(null);
  const folderInputRef = reactExports.useRef(null);
  const handleFileSelect = reactExports.useCallback((e) => {
    if (e.target.files && e.target.files.length > 0 && onLoadFiles) {
      onLoadFiles(e.target.files);
    }
  }, [onLoadFiles]);
  const handleDrop = reactExports.useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0 && onLoadFiles) {
      onLoadFiles(e.dataTransfer.files);
    }
  }, [onLoadFiles]);
  const merged = { ...DEFAULT_SFIZZ, ...config };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto text-xs",
      onDragOver: (e) => {
        e.preventDefault();
        setDragOver(true);
      },
      onDragLeave: () => setDragOver(false),
      onDrop: handleDrop,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `p-2 rounded-lg border ${dragOver ? "border-violet-400 bg-violet-500/10" : "bg-[#1a1a1a] border-amber-900/30"} transition-colors`, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "SFZ Instrument" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
            lineNumber: 64,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
            loadedName && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[11px] font-mono text-violet-300 truncate px-1", children: loadedName }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 67,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => {
                    var _a;
                    return (_a = fileInputRef.current) == null ? void 0 : _a.click();
                  },
                  className: "flex-1 px-3 py-1.5 text-xs font-bold rounded bg-violet-600/80 text-white hover:bg-violet-500 transition-colors",
                  children: "Load .sfz"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
                  lineNumber: 70,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => {
                    var _a;
                    return (_a = folderInputRef.current) == null ? void 0 : _a.click();
                  },
                  className: "flex-1 px-3 py-1.5 text-xs font-bold rounded bg-violet-600/40 text-violet-200 hover:bg-violet-500/60 transition-colors",
                  children: "Load Folder"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
                  lineNumber: 76,
                  columnNumber: 13
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 69,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted text-center", children: "Drop .sfz + samples here" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 83,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
            lineNumber: 65,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              ref: fileInputRef,
              type: "file",
              accept: ".sfz,.wav,.flac,.ogg,.aiff,.aif",
              multiple: true,
              onChange: handleFileSelect,
              className: "hidden"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 87,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              ref: folderInputRef,
              type: "file",
              ...{ webkitdirectory: "", directory: "" },
              onChange: handleFileSelect,
              className: "hidden"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 89,
              columnNumber: 9
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
          lineNumber: 63,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Output" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
            lineNumber: 96,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Volume", value: merged.volume, min: 0, max: 1, defaultValue: 0.8, onChange: (v) => updateParam("volume", v), color: "#a78bfa" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 98,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Pan", value: merged.pan, min: -1, max: 1, defaultValue: 0, onChange: (v) => updateParam("pan", v), color: "#a78bfa" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 99,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Polyphony", value: merged.polyphony, min: 1, max: 256, defaultValue: 64, onChange: (v) => updateParam("polyphony", Math.round(v)), color: "#a78bfa" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 100,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Transpose", value: merged.transpose, min: -24, max: 24, defaultValue: 0, onChange: (v) => updateParam("transpose", Math.round(v)), color: "#a78bfa", unit: "st" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 101,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
            lineNumber: 97,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
          lineNumber: 95,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Performance" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
            lineNumber: 107,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-4 justify-center", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Mod Wheel", value: merged.modWheel, min: 0, max: 1, defaultValue: 0, onChange: (v) => updateParam("modWheel", v), color: "#f472b6" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 109,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Expression", value: merged.expression, min: 0, max: 1, defaultValue: 1, onChange: (v) => updateParam("expression", v), color: "#f472b6" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 110,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Pitch Bend", value: merged.pitchBend, min: -1, max: 1, defaultValue: 0, onChange: (v) => updateParam("pitchBend", v), color: "#f472b6" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 111,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Reverb", value: merged.reverbSend, min: 0, max: 1, defaultValue: 0.2, onChange: (v) => updateParam("reverbSend", v), color: "#818cf8" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 112,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Chorus", value: merged.chorusSend, min: 0, max: 1, defaultValue: 0, onChange: (v) => updateParam("chorusSend", v), color: "#818cf8" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 113,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
            lineNumber: 108,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
          lineNumber: 106,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-bold uppercase tracking-tight text-sm mb-3 text-amber-500", children: "Engine" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
            lineNumber: 119,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-4", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Knob, { label: "Preload", value: merged.preloadSize, min: 1024, max: 65536, defaultValue: 8192, onChange: (v) => updateParam("preloadSize", Math.round(v)), color: "#a78bfa" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 121,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Oversampling" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
                lineNumber: 123,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: OVERSAMPLING_OPTIONS.map(({ label, value }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => updateParam("oversampling", value),
                  className: `px-3 py-1.5 text-xs font-bold rounded transition-all ${merged.oversampling === value ? "bg-violet-500 text-white" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}`,
                  children: label
                },
                label,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
                  lineNumber: 126,
                  columnNumber: 17
                },
                void 0
              )) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
                lineNumber: 124,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
              lineNumber: 122,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
            lineNumber: 120,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[9px] text-text-muted mt-2", children: "SFZ instruments define their own CC mappings. Standard CCs: 1=ModWheel, 7=Volume, 10=Pan, 11=Expression, 64=Sustain, 74=Cutoff, 91=Reverb, 93=Chorus" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
            lineNumber: 134,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
          lineNumber: 118,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SfizzControls.tsx",
      lineNumber: 57,
      columnNumber: 5
    },
    void 0
  );
};
export {
  SfizzControls,
  SfizzControls as default
};
