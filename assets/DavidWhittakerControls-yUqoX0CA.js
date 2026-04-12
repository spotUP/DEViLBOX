import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aA as UADEEngine, aB as Knob } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { S as SequenceEditor } from "./SequenceEditor-Byjrj1oK.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const VOLSEQ_PRESETS = [
  { name: "Attack", data: [0, 10, 20, 35, 50, 60, 64, 58, 50, 42], loop: 9 },
  { name: "Organ", data: [64, 60, 58, 55, 52, 50, 48, 46], loop: 7 },
  { name: "Pluck", data: [64, 50, 38, 28, 20, 14, 9, 5, 2, 0] },
  { name: "Pad", data: [0, 12, 26, 42, 56, 64], loop: 5 },
  { name: "Full", data: [64], loop: 0 }
];
const FRQSEQ_PRESETS = [
  { name: "Vibrato", data: [0, 3, 5, 3, 0, -3, -5, -3], loop: 0 },
  { name: "Slide Up", data: [-12, -9, -6, -3, 0], loop: 4 },
  { name: "Slide Down", data: [12, 9, 6, 3, 0], loop: 4 },
  { name: "Tremolo", data: [0, 6, 12, 6], loop: 0 },
  { name: "Flat", data: [0] }
];
const DavidWhittakerControls = ({
  config,
  onChange,
  volseqPlaybackPosition,
  frqseqPlaybackPosition,
  uadeChipRam
}) => {
  const [activeTab, setActiveTab] = reactExports.useState("main");
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const chipEditorRef = reactExports.useRef(null);
  const getEditor = reactExports.useCallback(() => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);
  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors("#44aaff", { knob: "#66bbff", dim: "#001833" });
  const upd = reactExports.useCallback((key, value) => {
    onChange({ [key]: value });
  }, [onChange]);
  const renderMain = () => {
    const relVal = config.relative ?? 8364;
    const approxHz = Math.round(3579545 / relVal);
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume & Tuning" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
          lineNumber: 85,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.defaultVolume ?? 64,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => upd("defaultVolume", Math.round(v)),
              label: "Volume",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
              lineNumber: 87,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "label",
              {
                className: "text-[10px] font-bold uppercase tracking-wider",
                style: { color: accent, opacity: 0.7 },
                children: "Relative"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
                lineNumber: 95,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                value: relVal,
                min: 256,
                max: 65535,
                onChange: (e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) upd("relative", Math.max(256, Math.min(65535, val)));
                },
                className: "text-[11px] font-mono border rounded px-2 py-1",
                style: { width: "80px", background: "#060a0f", borderColor: dim, color: accent }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
                lineNumber: 99,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: [
              "3579545 / value ≈ ",
              approxHz,
              " Hz"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
              lineNumber: 110,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
            lineNumber: 94,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
          lineNumber: 86,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
        lineNumber: 84,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
          lineNumber: 119,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.vibratoSpeed ?? 0,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => upd("vibratoSpeed", Math.round(v)),
              label: "Speed",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
              lineNumber: 121,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.vibratoDepth ?? 0,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => upd("vibratoDepth", Math.round(v)),
              label: "Depth",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
              lineNumber: 128,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
          lineNumber: 120,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
        lineNumber: 118,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
      lineNumber: 82,
      columnNumber: 7
    }, void 0);
  };
  const renderSequences = () => {
    const volseq = config.volseq ?? [];
    const frqseq = config.frqseq ?? [];
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume Sequence" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
          lineNumber: 151,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SequenceEditor,
          {
            label: "volseq",
            data: volseq.map((v) => Math.max(0, v)),
            onChange: (d) => upd("volseq", d),
            min: 0,
            max: 64,
            presets: VOLSEQ_PRESETS,
            playbackPosition: volseqPlaybackPosition,
            color: accent,
            height: 80
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
            lineNumber: 152,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[9px] text-text-muted mt-1", children: "Volume level per step (0–64). Sequence loops at the loop point." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
          lineNumber: 162,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
        lineNumber: 150,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Frequency Sequence" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
          lineNumber: 169,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SequenceEditor,
          {
            label: "frqseq",
            data: frqseq,
            onChange: (d) => upd("frqseq", d),
            min: -127,
            max: 127,
            bipolar: true,
            showNoteNames: true,
            presets: FRQSEQ_PRESETS,
            playbackPosition: frqseqPlaybackPosition,
            color: knob,
            height: 80
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
            lineNumber: 170,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[9px] text-text-muted mt-1", children: "Semitone offsets from note pitch per step. Use the loop marker (L) to set loop point." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
          lineNumber: 182,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
        lineNumber: 168,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
      lineNumber: 147,
      columnNumber: 7
    }, void 0);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dim }, children: [["main", "Parameters"], ["sequences", "Sequences"]].map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
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
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
        lineNumber: 194,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
      lineNumber: 192,
      columnNumber: 7
    }, void 0),
    activeTab === "main" && renderMain(),
    activeTab === "sequences" && renderSequences(),
    uadeChipRam && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "flex justify-end px-3 py-2 border-t border-opacity-30",
        style: { borderColor: dim },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            className: "text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100 transition-colors",
            style: { background: "rgba(60,40,100,0.4)", color: "#cc88ff" },
            onClick: () => void getEditor().exportModule(
              uadeChipRam.moduleBase,
              uadeChipRam.moduleSize,
              "song.dw"
            ),
            children: "Export .dw (Amiga)"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
            lineNumber: 213,
            columnNumber: 11
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
        lineNumber: 211,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DavidWhittakerControls.tsx",
    lineNumber: 191,
    columnNumber: 5
  }, void 0);
};
export {
  DavidWhittakerControls
};
