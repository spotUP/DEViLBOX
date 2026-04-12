import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { aA as UADEEngine, aB as Knob, cB as PatternEditorCanvas } from "./main-BbV5VyEH.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import { W as WaveformThumbnail } from "./WaveformThumbnail-CebZPsAz.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import { e as encodeSoundMonADSR, g as generateSoundMonWaveform } from "./chipRamEncoders-CC3pCIsG.js";
import { w as writeWaveformByte } from "./waveformDraw-Qi2V4aQb.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
const DEFAULT_WAVE_PCM_LEN = 64;
const WAVE_DEFS = [
  { name: "Square", type: "square" },
  { name: "Saw", type: "saw" },
  { name: "Triangle", type: "triangle" },
  { name: "Noise", type: "noise" },
  { name: "Pulse 1", type: "pulse25" },
  { name: "Pulse 2", type: "pulse12" },
  { name: "Pulse 3", type: "pulse12" },
  { name: "Pulse 4", type: "pulse25" },
  { name: "Blend 1", type: "sine" },
  { name: "Blend 2", type: "triangle" },
  { name: "Blend 3", type: "saw" },
  { name: "Blend 4", type: "square" },
  { name: "Ring 1", type: "sine" },
  { name: "Ring 2", type: "triangle" },
  { name: "FM 1", type: "sine" },
  { name: "FM 2", type: "triangle" }
];
function signedHex2(val) {
  if (val === 0) return " 00";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "+";
  return `${sign}${abs.toString(16).toUpperCase().padStart(2, "0")}`;
}
const ARP_COLUMN = [
  {
    key: "semitone",
    label: "ST",
    charWidth: 3,
    type: "hex",
    color: "#44aaff",
    emptyColor: "var(--color-border-light)",
    emptyValue: 0,
    hexDigits: 2,
    formatter: signedHex2
  }
];
function arpToFormatChannel(data) {
  const rows = data.map((v) => ({ semitone: v }));
  return [{ label: "Arp", patternLength: data.length, rows, isPatternChannel: false }];
}
function makeArpCellChange(data, onChangeData) {
  return (_ch, row, _col, value) => {
    const next = [...data];
    next[row] = value > 127 ? value - 256 : value > 63 ? value - 128 : value;
    onChangeData(next);
  };
}
const SM_V1V2_INSTR_SIZE = 29;
function lfoDelayOffset(instrSize) {
  return instrSize === SM_V1V2_INSTR_SIZE ? 15 : 14;
}
function lfoSpeedOffset(instrSize) {
  return instrSize === SM_V1V2_INSTR_SIZE ? 16 : 15;
}
const SoundMonControls = ({
  config,
  onChange,
  arpPlaybackPosition,
  uadeChipRam
}) => {
  var _a;
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
  const updWithChipRam = reactExports.useCallback(
    (key, value, byteOffset) => {
      upd(key, value);
      if (uadeChipRam && typeof value === "number") {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 255);
      }
    },
    [upd, uadeChipRam, getEditor]
  );
  const updADSRWithChipRam = reactExports.useCallback(
    (key, value) => {
      upd(key, value);
      if (uadeChipRam && uadeChipRam.sections.synthTables) {
        void (async () => {
          const editor = getEditor();
          const headerBytes = await editor.readBytes(uadeChipRam.instrBase + 5, 3);
          const adsrTableOff = headerBytes[0] << 6;
          const adsrLen = headerBytes[1] << 8 | headerBytes[2];
          if (adsrLen <= 0) return;
          const newCfg = { ...configRef.current, [key]: value };
          const sequence = encodeSoundMonADSR(newCfg, adsrLen);
          const addr = uadeChipRam.sections.synthTables + adsrTableOff;
          void editor.writeBlock(addr, Array.from(sequence));
        })();
      }
    },
    [upd, uadeChipRam, getEditor]
  );
  const updWaveTypeWithChipRam = reactExports.useCallback(
    (waveType) => {
      upd("waveType", waveType);
      if (uadeChipRam && uadeChipRam.sections.synthTables) {
        void (async () => {
          const editor = getEditor();
          const tableIndexBytes = await editor.readBytes(uadeChipRam.instrBase + 1, 1);
          const tableIndex = tableIndexBytes[0] & 15;
          const waveAddr = uadeChipRam.sections.synthTables + (tableIndex << 6);
          const waveData = generateSoundMonWaveform(waveType);
          void editor.writeBlock(waveAddr, Array.from(waveData));
        })();
      }
    },
    [upd, uadeChipRam, getEditor]
  );
  const renderMain = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Waveform" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 248,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 mb-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.waveSpeed,
          min: 0,
          max: 15,
          step: 1,
          onChange: (v) => upd("waveSpeed", Math.round(v)),
          label: "Morph Rate",
          color: knob,
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 250,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 249,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-1 mt-2", children: WAVE_DEFS.map((def, i) => {
        const active = config.waveType === i;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => updWaveTypeWithChipRam(i),
            className: "flex flex-col items-center gap-0.5 px-1 py-1.5 rounded transition-colors",
            style: {
              background: active ? accent + "28" : "#0a0e14",
              border: `1px solid ${active ? accent : "#2a2a2a"}`
            },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                WaveformThumbnail,
                {
                  type: def.type,
                  width: 40,
                  height: 18,
                  color: active ? accent : "#444",
                  style: "line"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
                  lineNumber: 266,
                  columnNumber: 17
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "span",
                {
                  className: "text-[9px] font-mono leading-tight",
                  style: { color: active ? accent : "#555" },
                  children: def.name
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
                  lineNumber: 272,
                  columnNumber: 17
                },
                void 0
              )
            ]
          },
          i,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 259,
            columnNumber: 15
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 255,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
      lineNumber: 247,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume Envelope" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 284,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider", style: { color: accent, opacity: 0.5 }, children: "Attack" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 288,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.attackVolume,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => updADSRWithChipRam("attackVolume", Math.round(v)),
              label: "Volume",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 289,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.attackSpeed,
              min: 0,
              max: 63,
              step: 1,
              onChange: (v) => {
                updADSRWithChipRam("attackSpeed", Math.round(v));
                if (uadeChipRam) {
                  void getEditor().writeU8(uadeChipRam.instrBase + 8, Math.round(v) & 255);
                }
              },
              label: "Speed",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 293,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 287,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider", style: { color: accent, opacity: 0.5 }, children: "Decay" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 304,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.decayVolume,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => updADSRWithChipRam("decayVolume", Math.round(v)),
              label: "Volume",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 305,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.decaySpeed,
              min: 0,
              max: 63,
              step: 1,
              onChange: (v) => updADSRWithChipRam("decaySpeed", Math.round(v)),
              label: "Speed",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 309,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 303,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider", style: { color: accent, opacity: 0.5 }, children: "Sustain" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 315,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.sustainVolume,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => updADSRWithChipRam("sustainVolume", Math.round(v)),
              label: "Volume",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 316,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.sustainLength,
              min: 0,
              max: 255,
              step: 1,
              onChange: (v) => updADSRWithChipRam("sustainLength", Math.round(v)),
              label: "Length",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 320,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 314,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider", style: { color: accent, opacity: 0.5 }, children: "Release" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 326,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.releaseVolume,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => updADSRWithChipRam("releaseVolume", Math.round(v)),
              label: "Volume",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 327,
              columnNumber: 13
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.releaseSpeed,
              min: 0,
              max: 63,
              step: 1,
              onChange: (v) => updADSRWithChipRam("releaseSpeed", Math.round(v)),
              label: "Speed",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 331,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 325,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 286,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        EnvelopeVisualization,
        {
          mode: "steps",
          attackVol: config.attackVolume,
          attackSpeed: config.attackSpeed,
          decayVol: config.decayVolume,
          decaySpeed: config.decaySpeed,
          sustainVol: config.sustainVolume,
          sustainLen: config.sustainLength,
          releaseVol: config.releaseVolume,
          releaseSpeed: config.releaseSpeed,
          maxVol: 64,
          width: 320,
          height: 72,
          color: accent
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 339,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 338,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
      lineNumber: 283,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Vibrato" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 354,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoDelay,
            min: 0,
            max: 255,
            step: 1,
            onChange: (v) => {
              const val = Math.round(v);
              updWithChipRam(
                "vibratoDelay",
                val,
                lfoDelayOffset((uadeChipRam == null ? void 0 : uadeChipRam.instrSize) ?? SM_V1V2_INSTR_SIZE)
              );
            },
            label: "Delay",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 356,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoSpeed,
            min: 0,
            max: 63,
            step: 1,
            onChange: (v) => {
              const val = Math.round(v);
              updWithChipRam(
                "vibratoSpeed",
                val,
                lfoSpeedOffset((uadeChipRam == null ? void 0 : uadeChipRam.instrSize) ?? SM_V1V2_INSTR_SIZE)
              );
            },
            label: "Speed",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 366,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.vibratoDepth,
            min: 0,
            max: 63,
            step: 1,
            onChange: (v) => updWithChipRam("vibratoDepth", Math.round(v), 11),
            label: "Depth",
            color: knob,
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 376,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 355,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
      lineNumber: 353,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Portamento" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 385,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Knob,
          {
            value: config.portamentoSpeed,
            min: 0,
            max: 63,
            step: 1,
            onChange: (v) => upd("portamentoSpeed", Math.round(v)),
            label: "Speed",
            color: knob,
            size: "md",
            formatValue: (v) => Math.round(v).toString()
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 387,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "0 = disabled" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 391,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 386,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
      lineNumber: 384,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
    lineNumber: 244,
    columnNumber: 5
  }, void 0);
  const arpChannels = reactExports.useMemo(() => arpToFormatChannel(config.arpTable), [config.arpTable]);
  const arpCellChange = reactExports.useMemo(
    () => makeArpCellChange(config.arpTable, (d) => upd("arpTable", d)),
    [config.arpTable, upd]
  );
  const renderArpeggio = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3", style: { height: "calc(100vh - 280px)" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg} flex flex-col`, style: { ...panelStyle, flex: 1, minHeight: 0 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Arpeggio Speed" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 409,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Knob,
        {
          value: config.arpSpeed,
          min: 0,
          max: 15,
          step: 1,
          onChange: (v) => upd("arpSpeed", Math.round(v)),
          label: "Speed",
          color: knob,
          formatValue: (v) => Math.round(v).toString()
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 410,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
      lineNumber: 408,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, minHeight: 120 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      PatternEditorCanvas,
      {
        formatColumns: ARP_COLUMN,
        formatChannels: arpChannels,
        formatCurrentRow: arpPlaybackPosition ?? 0,
        formatIsPlaying: arpPlaybackPosition !== void 0,
        onFormatCellChange: arpCellChange,
        hideVUMeters: true
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 417,
        columnNumber: 11
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
      lineNumber: 416,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
    lineNumber: 407,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
    lineNumber: 406,
    columnNumber: 5
  }, void 0);
  const waveCanvasRef = reactExports.useRef(null);
  const pcmPreviewRef = reactExports.useRef(null);
  const isDrawingRef = reactExports.useRef(false);
  const lastIdxRef = reactExports.useRef(-1);
  const wavePCMToBytes = reactExports.useCallback((arr) => {
    const len = arr && arr.length > 0 ? arr.length : DEFAULT_WAVE_PCM_LEN;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      const v = arr && i < arr.length ? arr[i] : 0;
      out[i] = (v < 0 ? v + 256 : v) & 255;
    }
    return out;
  }, []);
  const bytesToWavePCM = reactExports.useCallback((bytes) => {
    const out = new Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] > 127 ? bytes[i] - 256 : bytes[i];
    }
    return out;
  }, []);
  reactExports.useEffect(() => {
    if (config.type !== "synth") return;
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const raf = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 320;
      const cssH = canvas.clientHeight || 120;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0a0e14";
      ctx.fillRect(0, 0, cssW, cssH);
      const mid = cssH / 2;
      ctx.strokeStyle = accent + "40";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(cssW, mid);
      ctx.stroke();
      const data = configRef.current.wavePCM;
      const len = data && data.length > 0 ? data.length : DEFAULT_WAVE_PCM_LEN;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < cssW; x++) {
        const idx = Math.floor(x / cssW * len);
        const s = data && idx < data.length ? data[idx] : 0;
        const y = mid - s / 128 * (mid - 4);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    return () => cancelAnimationFrame(raf);
  }, [config.type, config.wavePCM, accent]);
  reactExports.useEffect(() => {
    if (config.type !== "pcm") return;
    const canvas = pcmPreviewRef.current;
    if (!canvas) return;
    const raf = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 320;
      const cssH = canvas.clientHeight || 120;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0a0e14";
      ctx.fillRect(0, 0, cssW, cssH);
      const mid = cssH / 2;
      ctx.strokeStyle = accent + "40";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(cssW, mid);
      ctx.stroke();
      const pcm = configRef.current.pcmData;
      if (!pcm || pcm.length === 0) {
        ctx.fillStyle = "#4a5a6a";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("No PCM data", cssW / 2, mid + 4);
        return;
      }
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < cssW; x++) {
        const idx = Math.floor(x / cssW * pcm.length);
        const raw = pcm[idx];
        const s = raw > 127 ? raw - 256 : raw;
        const y = mid - s / 128 * (mid - 4);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const ls = configRef.current.loopStart ?? 0;
      const ll = configRef.current.loopLength ?? 0;
      if (ll > 0 && pcm.length > 0) {
        const xStart = ls / pcm.length * cssW;
        const xEnd = (ls + ll) / pcm.length * cssW;
        ctx.strokeStyle = "#ffaa00";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(xStart, 0);
        ctx.lineTo(xStart, cssH);
        ctx.moveTo(xEnd, 0);
        ctx.lineTo(xEnd, cssH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [config.type, config.pcmData, config.loopStart, config.loopLength, accent]);
  const writeWavePCMFromEvent = reactExports.useCallback((e) => {
    const cur = configRef.current;
    if (cur.type !== "synth") return;
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const bytes = wavePCMToBytes(cur.wavePCM);
    const { next, idx } = writeWaveformByte(
      bytes,
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      lastIdxRef.current
    );
    lastIdxRef.current = idx;
    upd("wavePCM", bytesToWavePCM(next));
  }, [upd, wavePCMToBytes, bytesToWavePCM]);
  const handleWavePointerDown = reactExports.useCallback((e) => {
    if (configRef.current.type !== "synth") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastIdxRef.current = -1;
    writeWavePCMFromEvent(e);
  }, [writeWavePCMFromEvent]);
  const handleWavePointerMove = reactExports.useCallback((e) => {
    if (!isDrawingRef.current) return;
    writeWavePCMFromEvent(e);
  }, [writeWavePCMFromEvent]);
  const handleWavePointerUp = reactExports.useCallback((e) => {
    isDrawingRef.current = false;
    lastIdxRef.current = -1;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
  }, []);
  const pcmLen = ((_a = config.pcmData) == null ? void 0 : _a.length) ?? 0;
  const renderSample = () => {
    var _a2;
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Instrument Type" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 608,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[11px] font-mono mt-1", style: { color: accent }, children: config.type === "synth" ? "SYNTH (wavetable)" : "PCM (sample)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 609,
          columnNumber: 9
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 607,
        columnNumber: 7
      }, void 0),
      config.type === "synth" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Wave PCM (click + drag to draw)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 618,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted font-mono", children: [
            ((_a2 = config.wavePCM) == null ? void 0 : _a2.length) ?? DEFAULT_WAVE_PCM_LEN,
            " bytes"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 619,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 617,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: waveCanvasRef,
            className: "w-full rounded border cursor-crosshair",
            style: { height: 120, touchAction: "none", borderColor: dim },
            onPointerDown: handleWavePointerDown,
            onPointerMove: handleWavePointerMove,
            onPointerUp: handleWavePointerUp,
            onPointerCancel: handleWavePointerUp
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 623,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 616,
        columnNumber: 9
      }, void 0),
      config.type === "pcm" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "PCM Sample" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 639,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted font-mono", children: [
            pcmLen,
            " bytes"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 640,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 638,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: pcmPreviewRef,
            className: "w-full rounded border",
            style: { height: 120, borderColor: dim }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 642,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-3 mt-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider", style: { color: accent, opacity: 0.6 }, children: "Loop Start" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 649,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: 0,
                max: Math.max(0, pcmLen),
                step: 1,
                value: config.loopStart ?? 0,
                onChange: (e) => {
                  const raw = parseInt(e.target.value, 10);
                  const v = Number.isFinite(raw) ? Math.max(0, Math.min(pcmLen, raw)) : 0;
                  upd("loopStart", v);
                },
                className: "px-2 py-1 rounded border text-xs font-mono bg-[#0a0e14] text-text-primary",
                style: { borderColor: dim }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
                lineNumber: 652,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 648,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] uppercase tracking-wider", style: { color: accent, opacity: 0.6 }, children: "Loop Length (0 = no loop)" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 668,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: 0,
                max: Math.max(0, pcmLen - (config.loopStart ?? 0)),
                step: 1,
                value: config.loopLength ?? 0,
                onChange: (e) => {
                  const raw = parseInt(e.target.value, 10);
                  const maxLen = Math.max(0, pcmLen - (config.loopStart ?? 0));
                  const v = Number.isFinite(raw) ? Math.max(0, Math.min(maxLen, raw)) : 0;
                  upd("loopLength", v);
                },
                className: "px-2 py-1 rounded border text-xs font-mono bg-[#0a0e14] text-text-primary",
                style: { borderColor: dim }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
                lineNumber: 671,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 667,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 647,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 637,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Tuning & Volume" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 693,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 mt-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.finetune ?? 0,
              min: -8,
              max: 7,
              step: 1,
              bipolar: true,
              onChange: (v) => upd("finetune", Math.round(v)),
              label: "Finetune",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 695,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.transpose ?? 0,
              min: -12,
              max: 12,
              step: 1,
              bipolar: true,
              onChange: (v) => upd("transpose", Math.round(v)),
              label: "Transpose",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 706,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Knob,
            {
              value: config.volume ?? 64,
              min: 0,
              max: 64,
              step: 1,
              onChange: (v) => upd("volume", Math.round(v)),
              label: "Volume",
              color: knob,
              formatValue: (v) => Math.round(v).toString()
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
              lineNumber: 717,
              columnNumber: 11
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
          lineNumber: 694,
          columnNumber: 9
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 692,
        columnNumber: 7
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
      lineNumber: 604,
      columnNumber: 5
    }, void 0);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dim }, children: [["main", "Parameters"], ["arpeggio", "Arpeggio"], ["sample", "Sample"]].map(([id, label]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
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
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 736,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
      lineNumber: 734,
      columnNumber: 7
    }, void 0),
    activeTab === "main" && renderMain(),
    activeTab === "arpeggio" && renderArpeggio(),
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
            style: { background: "rgba(80,120,40,0.3)", color: "#88cc44" },
            onClick: () => void getEditor().exportModule(
              uadeChipRam.moduleBase,
              uadeChipRam.moduleSize,
              "song.bp"
            ),
            children: "Export .bp (Amiga)"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
            lineNumber: 754,
            columnNumber: 11
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
        lineNumber: 752,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SoundMonControls.tsx",
    lineNumber: 733,
    columnNumber: 5
  }, void 0);
};
export {
  SoundMonControls
};
