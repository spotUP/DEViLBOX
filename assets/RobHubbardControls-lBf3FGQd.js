import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aA as UADEEngine, aB as Knob } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { S as SequenceEditor } from "./SequenceEditor-Byjrj1oK.js";
import { W as WaveformThumbnail } from "./WaveformThumbnail-CebZPsAz.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const RobHubbardControls = ({ config, onChange, uadeChipRam }) => {
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
    if (key === "sampleVolume" && uadeChipRam) {
      void getEditor().writeBytes(uadeChipRam.instrBase + 4, new Uint8Array([value]));
    }
  }, [onChange, uadeChipRam, getEditor]);
  const InfoValue = ({ label, value }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-bold uppercase tracking-wider", style: { color: accent, opacity: 0.5 }, children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
      lineNumber: 51,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[11px] font-mono", style: { color: accent }, children: value }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
      lineNumber: 54,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
    lineNumber: 50,
    columnNumber: 5
  }, void 0);
  const renderMain = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Sample" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 66,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 items-start flex-wrap", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.sampleVolume,
            min: 0,
            max: 64,
            step: 1,
            onChange: (v) => upd("sampleVolume", Math.round(v)),
            label: "Volume",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
            lineNumber: 68,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            InfoValue,
            {
              label: "Loop Offset",
              value: config.loopOffset < 0 ? "No loop" : config.loopOffset.toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
              lineNumber: 73,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            InfoValue,
            {
              label: "Sample Length",
              value: `${config.sampleLen} bytes`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
              lineNumber: 77,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
          lineNumber: 72,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 67,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
      lineNumber: 65,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 87,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.divider,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => upd("divider", Math.round(v)),
            label: "Depth Divisor",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
            lineNumber: 89,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoIdx,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => upd("vibratoIdx", Math.round(v)),
            label: "Start Index",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
            lineNumber: 93,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Divisor 0 = disabled" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
          lineNumber: 97,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 88,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
      lineNumber: 86,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Wobble" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 103,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.hiPos,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => upd("hiPos", Math.round(v)),
            label: "Upper Bound",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
            lineNumber: 105,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.loPos,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => upd("loPos", Math.round(v)),
            label: "Lower Bound",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
            lineNumber: 109,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Upper 0 = disabled" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
          lineNumber: 113,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 104,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
      lineNumber: 102,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Tuning" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 119,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 items-center flex-wrap", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-bold uppercase tracking-wider", style: { color: accent, opacity: 0.5 }, children: "Relative" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
            lineNumber: 122,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "number",
              value: config.relative,
              min: 256,
              max: 16383,
              onChange: (e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) {
                  upd("relative", Math.max(256, Math.min(16383, val)));
                }
              },
              className: "text-[11px] font-mono text-center border rounded py-1 px-2",
              style: {
                width: "72px",
                background: "#060a0f",
                borderColor: dim,
                color: accent
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
              lineNumber: 125,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
          lineNumber: 121,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono", style: { color: accent, opacity: 0.6 }, children: [
          "3579545 / ",
          config.relative,
          " ≈ ",
          Math.round(3579545 / Math.max(1, config.relative)),
          " Hz"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
          lineNumber: 145,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 120,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
      lineNumber: 118,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
    lineNumber: 62,
    columnNumber: 5
  }, void 0);
  const renderVibwave = () => {
    const vib = config.vibTable ?? [];
    const hasData = vib.length > 0;
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato Wave Table" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 161,
        columnNumber: 11
      }, void 0),
      hasData ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SequenceEditor,
          {
            label: "Vibrato Wave",
            data: vib,
            onChange: (d) => upd("vibTable", d),
            min: -128,
            max: 127,
            bipolar: true,
            fixedLength: true,
            color: accent,
            height: 72
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
            lineNumber: 164,
            columnNumber: 15
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] font-mono mt-1", style: { color: accent, opacity: 0.5 }, children: [
          vib.length,
          " entries · starting index: ",
          config.vibratoIdx
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
          lineNumber: 174,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 163,
        columnNumber: 13
      }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[11px] font-mono", style: { color: "var(--color-text-muted)" }, children: "No vibrato table data" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 179,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
      lineNumber: 160,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
      lineNumber: 159,
      columnNumber: 7
    }, void 0);
  };
  const renderSample = () => {
    const raw = config.sampleData ?? [];
    const hasData = raw.length > 0;
    const MAX_POINTS = 512;
    const stride = Math.max(1, Math.ceil(raw.length / MAX_POINTS));
    const samples = [];
    for (let i = 0; i < raw.length; i += stride) {
      samples.push(raw[i] & 255);
    }
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Sample Waveform" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 205,
        columnNumber: 11
      }, void 0),
      hasData ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-2 rounded overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          WaveformThumbnail,
          {
            data: samples,
            maxValue: 255,
            width: 320,
            height: 64,
            color: knob,
            style: "line"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
            lineNumber: 209,
            columnNumber: 17
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
          lineNumber: 208,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono", style: { color: accent, opacity: 0.6 }, children: [
            config.sampleLen,
            " bytes total"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
            lineNumber: 218,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "(read-only — from parsed binary)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
            lineNumber: 221,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
          lineNumber: 217,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 207,
        columnNumber: 13
      }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[11px] font-mono", style: { color: "var(--color-text-muted)" }, children: "No sample data" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 227,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
      lineNumber: 204,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
      lineNumber: 203,
      columnNumber: 7
    }, void 0);
  };
  const TABS = [
    ["main", "Parameters"],
    ["vibwave", "Vib Wave"],
    ["sample", "Sample"]
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dim }, children: TABS.map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
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
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 246,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
      lineNumber: 244,
      columnNumber: 7
    }, void 0),
    activeTab === "main" && renderMain(),
    activeTab === "vibwave" && renderVibwave(),
    activeTab === "sample" && renderSample(),
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
              "module.rh"
            ),
            children: "Export .rh (Amiga)"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
            lineNumber: 264,
            columnNumber: 11
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
        lineNumber: 262,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/RobHubbardControls.tsx",
    lineNumber: 243,
    columnNumber: 5
  }, void 0);
};
export {
  RobHubbardControls
};
