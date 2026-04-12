import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { u as useInstrumentColors } from "./useInstrumentColors-D5iKqwYD.js";
import { aA as UADEEngine } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function parseVolModHeader(data) {
  return {
    envelopeSpeed: data[0] ?? 0,
    sndSeqNum: data[1] ?? 0,
    vibSpeed: data[2] ?? 0,
    vibAmpl: data[3] ?? 0,
    vibDelay: data[4] ?? 0
  };
}
function parseVolEnvelope(data) {
  const entries = [];
  let i = 5;
  const limit = Math.min(data.length, 64);
  while (i < limit) {
    const cmd = data[i];
    if (cmd === 224 && i + 1 < limit) {
      const target = (data[i + 1] ?? 0) & 63;
      entries.push({ pos: i, raw: cmd, kind: "loop", label: "LOOP", detail: `→ pos ${target}`, argBytes: 2 });
      i += 2;
    } else if (cmd === 225) {
      entries.push({ pos: i, raw: cmd, kind: "end", label: "END", detail: "", argBytes: 1 });
      i += 1;
      break;
    } else if (cmd === 232 && i + 1 < limit) {
      const ticks = data[i + 1] ?? 0;
      entries.push({ pos: i, raw: cmd, kind: "sustain", label: "SUSTAIN", detail: `${ticks} ticks`, argBytes: 2 });
      i += 2;
    } else if (cmd === 234 && i + 2 < limit) {
      const speed = data[i + 1] ?? 0;
      const time = data[i + 2] ?? 0;
      entries.push({ pos: i, raw: cmd, kind: "slide", label: "VOL SLIDE", detail: `spd=${speed} t=${time}`, argBytes: 3 });
      i += 3;
    } else if (cmd >= 224) {
      entries.push({ pos: i, raw: cmd, kind: "unknown", label: `$${cmd.toString(16).toUpperCase()}`, detail: "unknown cmd", argBytes: 1 });
      i += 1;
    } else {
      entries.push({ pos: i, raw: cmd, kind: "volume", label: "VOL", detail: `${cmd}`, argBytes: 1 });
      i += 1;
    }
  }
  return entries;
}
function parseSndSeq(data, seqIdx, seqsCount) {
  const entries = [];
  const base = seqIdx * 64;
  const limit = Math.min(base + 64, data.length);
  let i = base;
  while (i < limit) {
    const pos = i - base;
    const cmd = data[i];
    if (cmd < 224) {
      const param = i + 1 < limit ? data[i + 1] : 0;
      const isLocked = (cmd & 128) !== 0;
      const val = cmd & 127;
      entries.push({
        pos,
        raw: cmd,
        kind: "note",
        label: isLocked ? "NOTE" : "TRANS",
        detail: isLocked ? `pitch=$${val.toString(16).padStart(2, "0")} p2=$${param.toString(16).padStart(2, "0")}` : `trans=${val - 64} p2=$${param.toString(16).padStart(2, "0")}`,
        argBytes: 2
      });
      i += 2;
    } else if (cmd === 224 && i + 1 < limit) {
      const target = (data[i + 1] ?? 0) & 63;
      entries.push({ pos, raw: cmd, kind: "loop", label: "LOOP", detail: `→ pos ${target}`, argBytes: 2 });
      i += 2;
    } else if (cmd === 225) {
      entries.push({ pos, raw: cmd, kind: "end", label: "END", detail: "", argBytes: 1 });
      i += 1;
      break;
    } else if (cmd === 226 && i + 1 < limit) {
      const smp = data[i + 1] ?? 0;
      entries.push({ pos, raw: cmd, kind: "setwave", label: "SET_WAVE", detail: `smp#${smp}`, argBytes: 2 });
      i += 2;
    } else if (cmd === 227 && i + 2 < limit) {
      const spd = data[i + 1] ?? 0;
      const amp = data[i + 2] ?? 0;
      entries.push({ pos, raw: cmd, kind: "vibrato", label: "VIBRATO", detail: `spd=${spd} amp=${amp}`, argBytes: 3 });
      i += 3;
    } else if (cmd === 228 && i + 1 < limit) {
      const smp = data[i + 1] ?? 0;
      entries.push({ pos, raw: cmd, kind: "newwave", label: "NEW_WAVE", detail: `smp#${smp}`, argBytes: 2 });
      i += 2;
    } else if (cmd === 229) {
      const smp = i + 1 < limit ? data[i + 1] : 0;
      entries.push({ pos, raw: cmd, kind: "wavemod", label: "WAVE_MOD", detail: `smp#${smp} (+8 args)`, argBytes: 9 });
      i += 9;
    } else if (cmd === 230) {
      entries.push({ pos, raw: cmd, kind: "updwavemod", label: "UPD_WAVE_MOD", detail: "(+5 args)", argBytes: 6 });
      i += 6;
    } else if (cmd === 231 && i + 1 < limit) {
      const seq = data[i + 1] ?? 0;
      const valid = seq < seqsCount;
      entries.push({ pos, raw: cmd, kind: "setseq", label: "SET_SEQ", detail: `seq#${seq}${valid ? "" : " (!)"}`, argBytes: 2 });
      i += 2;
    } else if (cmd === 232 && i + 1 < limit) {
      const ticks = data[i + 1] ?? 0;
      entries.push({ pos, raw: cmd, kind: "sustain", label: "SUSTAIN", detail: `${ticks} ticks`, argBytes: 2 });
      i += 2;
    } else if (cmd === 233 && i + 2 < limit) {
      const pack = data[i + 1] ?? 0;
      const smp = data[i + 2] ?? 0;
      entries.push({ pos, raw: cmd, kind: "smppack", label: "SMP_PACK", detail: `pack#${pack} smp#${smp}`, argBytes: 3 });
      i += 3;
    } else if (cmd === 234 && i + 1 < limit) {
      const thresh = data[i + 1] ?? 0;
      entries.push({ pos, raw: cmd, kind: "random", label: "RANDOMIZE", detail: `thresh=${thresh}`, argBytes: 2 });
      i += 2;
    } else {
      entries.push({ pos, raw: cmd, kind: "unknown", label: `$${cmd.toString(16).toUpperCase()}`, detail: "?", argBytes: 1 });
      i += 1;
    }
  }
  return entries;
}
const SAMPLE_STRUCT_SIZE = 30;
function parseSampleHeaders(headers, count) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const base = i * SAMPLE_STRUCT_SIZE;
    if (base + SAMPLE_STRUCT_SIZE > headers.length) break;
    let name = "";
    for (let j = 0; j < 18; j++) {
      const b = headers[base + j];
      if (b === 0) break;
      name += String.fromCharCode(b);
    }
    const startOffset = (headers[base + 18] << 24 | headers[base + 19] << 16 | headers[base + 20] << 8 | headers[base + 21]) >>> 0;
    const lenWords = headers[base + 22] << 8 | headers[base + 23];
    const repOffsBytes = headers[base + 24] << 8 | headers[base + 25];
    const repLenWords = headers[base + 28] << 8 | headers[base + 29];
    result.push({
      idx: i,
      name: name.trim() || `Sample ${i + 1}`,
      startOffset,
      lenBytes: lenWords * 2,
      repOffset: repOffsBytes,
      repLenBytes: repLenWords * 2
    });
  }
  return result;
}
function hexPreview(data, maxBytes = 64) {
  const bytes = data.slice(0, maxBytes);
  const rows = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const hex = Array.from(chunk).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const asc = Array.from(chunk).map((b) => b >= 32 && b < 127 ? String.fromCharCode(b) : ".").join("");
    rows.push(`${i.toString(16).padStart(4, "0")}  ${hex.padEnd(47)}  ${asc}`);
  }
  return rows.join("\n");
}
const TFMXControls = ({ config, onChange, uadeChipRam }) => {
  const [activeTab, setActiveTab] = reactExports.useState("summary");
  const [showVolHex, setShowVolHex] = reactExports.useState(false);
  const [showSndHex, setShowSndHex] = reactExports.useState(false);
  const [activeSndSeq, setActiveSndSeq] = reactExports.useState(0);
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
  const { isCyan, accent, dim, panelBg, panelStyle } = useInstrumentColors("#ff6644", { dim: "#331100" });
  const accentDim = isCyan ? "#009999" : "#cc4422";
  const panelBg2 = isCyan ? "#041510" : "#1a0800";
  const inputBg = isCyan ? "#020e0a" : "#0e0500";
  const readonly = !onChange;
  const setVolByte = reactExports.useCallback((byteIdx, value) => {
    if (!onChange) return;
    const cur = configRef.current;
    const next = new Uint8Array(cur.volModSeqData);
    next[byteIdx] = Math.max(0, Math.min(255, value));
    onChange({ ...cur, volModSeqData: next });
    if (uadeChipRam) {
      void getEditor().writeU8(uadeChipRam.instrBase + byteIdx, next[byteIdx]);
    }
  }, [onChange, uadeChipRam, getEditor]);
  const setSndByte = reactExports.useCallback((byteIdx, value) => {
    var _a;
    if (!onChange) return;
    const cur = configRef.current;
    const next = new Uint8Array(cur.sndModSeqData);
    next[byteIdx] = Math.max(0, Math.min(255, value));
    onChange({ ...cur, sndModSeqData: next });
    if (uadeChipRam) {
      const sndBase = (_a = uadeChipRam.sections) == null ? void 0 : _a.sndModSeqsBase;
      const addr = sndBase !== void 0 ? sndBase + byteIdx : uadeChipRam.instrBase + 64 + byteIdx;
      void getEditor().writeU8(addr, next[byteIdx]);
    }
  }, [onChange, uadeChipRam, getEditor]);
  const StatRow = ({ label, value }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 py-0.5", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted w-36", children: label }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
      lineNumber: 374,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono", style: { color: accent }, children: value }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
      lineNumber: 375,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
    lineNumber: 373,
    columnNumber: 5
  }, void 0);
  const renderSummary = () => {
    const samples = parseSampleHeaders(config.sampleHeaders, config.sampleCount);
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "TFMX Instrument Data" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 387,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StatRow, { label: "SndModSeq count", value: config.sndSeqsCount.toString() }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 388,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StatRow, { label: "SndModSeq bytes", value: `${config.sndModSeqData.byteLength} B` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 389,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StatRow, { label: "VolModSeq bytes", value: `${config.volModSeqData.byteLength} B` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 390,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StatRow, { label: "Sample slots", value: config.sampleCount.toString() }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 391,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StatRow, { label: "Sample headers", value: `${config.sampleHeaders.byteLength} B` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 392,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StatRow, { label: "Sample PCM bank", value: `${(config.sampleData.byteLength / 1024).toFixed(1)} KiB` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 393,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-[9px] text-text-muted", children: "TFMX instruments use SndMod/VolMod macro sequences with a shared PCM sample bank." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 394,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
        lineNumber: 386,
        columnNumber: 9
      }, void 0),
      samples.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Sample Bank" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 402,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "font-mono text-[9px] flex border-b mb-1 pb-0.5",
            style: { borderColor: dim, color: "var(--color-text-muted)" },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-5", children: "#" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                lineNumber: 405,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-28", children: "Name" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                lineNumber: 406,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-16 text-right pr-2", children: "Offset" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                lineNumber: 407,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-16 text-right pr-2", children: "Len" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                lineNumber: 408,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-16 text-right", children: "RepLen" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                lineNumber: 409,
                columnNumber: 15
              }, void 0)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 403,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "overflow-y-auto", style: { maxHeight: "200px" }, children: samples.map((s) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-[9px] flex py-0.5 items-center", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-5 text-text-muted", children: s.idx }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 414,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-28 truncate", style: { color: accent }, children: s.name }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 415,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-16 text-right pr-2 text-text-muted", children: [
            "$",
            s.startOffset.toString(16).padStart(6, "0")
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 416,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-16 text-right pr-2 text-text-secondary", children: s.lenBytes > 0 ? `${(s.lenBytes / 1024).toFixed(1)}K` : "0" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 419,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-16 text-right text-text-muted", children: s.repLenBytes > 2 ? `${(s.repLenBytes / 1024).toFixed(1)}K` : "–" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 422,
            columnNumber: 19
          }, void 0)
        ] }, s.idx, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 413,
          columnNumber: 17
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 411,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
        lineNumber: 401,
        columnNumber: 11
      }, void 0),
      uadeChipRam && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Export" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 434,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              void getEditor().exportModule(
                uadeChipRam.moduleBase,
                uadeChipRam.moduleSize,
                "module.mdat"
              );
            },
            className: "text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded border transition-colors",
            style: {
              borderColor: accentDim,
              color: accentDim,
              background: "transparent"
            },
            children: "Export .mdat (Amiga)"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 435,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-1 text-[9px] text-text-muted", children: "Downloads the full mdat file with any chip RAM edits applied." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 451,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
        lineNumber: 433,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
      lineNumber: 384,
      columnNumber: 7
    }, void 0);
  };
  const renderVolMod = () => {
    const hdr = parseVolModHeader(config.volModSeqData);
    const envEntries = parseVolEnvelope(config.volModSeqData);
    const kindColor = (kind) => {
      if (kind === "volume") return accent;
      if (kind === "end") return "#ff4444";
      if (kind === "loop") return "#44ff88";
      if (kind === "sustain") return "#ffaa44";
      if (kind === "slide") return "#aa88ff";
      return "#666";
    };
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "VolModSeq Header (bytes 0–4)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 479,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-x-4 gap-y-1", children: [
          ["[0] Env Speed", 0, hdr.envelopeSpeed],
          ["[1] SndSeq #", 1, hdr.sndSeqNum],
          ["[2] Vib Speed", 2, hdr.vibSpeed],
          ["[3] Vib Ampl", 3, hdr.vibAmpl],
          ["[4] Vib Delay", 4, hdr.vibDelay]
        ].map(([lbl, idx, val]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 py-0.5", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted w-24", children: lbl }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 489,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "number",
              min: 0,
              max: 255,
              disabled: readonly,
              value: val,
              onChange: (e) => {
                const v = parseInt(e.target.value);
                if (!isNaN(v)) setVolByte(idx, v);
              },
              className: "text-[10px] font-mono text-center border rounded py-0.5",
              style: {
                width: "52px",
                background: inputBg,
                borderColor: dim,
                color: val !== 0 ? accent : "#444",
                cursor: readonly ? "default" : void 0
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
              lineNumber: 490,
              columnNumber: 17
            },
            void 0
          )
        ] }, idx, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 488,
          columnNumber: 15
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 480,
          columnNumber: 11
        }, void 0),
        hdr.sndSeqNum >= config.sndSeqsCount && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-[9px]", style: { color: "#ff6644" }, children: [
          "Warning: SndSeq #",
          hdr.sndSeqNum,
          " is out of range (max ",
          config.sndSeqsCount - 1,
          ")"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 512,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
        lineNumber: 478,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Volume Envelope (bytes 5–63)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 521,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setShowVolHex((v) => !v),
              className: "text-[9px] px-2 py-0.5 rounded border",
              style: { borderColor: dim, color: accentDim, background: "transparent" },
              children: showVolHex ? "Hide" : "Hex"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
              lineNumber: 522,
              columnNumber: 13
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 520,
          columnNumber: 11
        }, void 0),
        showVolHex ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "pre",
          {
            className: "text-[9px] font-mono overflow-x-auto p-2 rounded",
            style: { background: "#080400", color: "var(--color-text-muted)", border: `1px solid ${dim}` },
            children: hexPreview(config.volModSeqData.slice(5))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 531,
            columnNumber: 13
          },
          void 0
        ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "flex font-mono text-[9px] border-b mb-1 pb-0.5",
              style: { borderColor: dim, color: "var(--color-text-muted)" },
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-6 text-center", children: "Pos" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                  lineNumber: 540,
                  columnNumber: 17
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-8 text-center", children: "Hex" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                  lineNumber: 541,
                  columnNumber: 17
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-16 text-center", children: "Cmd" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                  lineNumber: 542,
                  columnNumber: 17
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1", children: "Detail" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                  lineNumber: 543,
                  columnNumber: 17
                }, void 0),
                !readonly && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-12 text-right", children: "Edit" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                  lineNumber: 544,
                  columnNumber: 31
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
              lineNumber: 538,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "overflow-y-auto", style: { maxHeight: "220px" }, children: envEntries.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted py-2", children: "No envelope data" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 548,
            columnNumber: 19
          }, void 0) : envEntries.map((e, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center font-mono text-[9px] py-0.5", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-6 text-center text-text-muted", children: e.pos }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
              lineNumber: 552,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-8 text-center text-text-muted", children: e.raw.toString(16).padStart(2, "0") }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
              lineNumber: 553,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-16 text-center font-bold", style: { color: kindColor(e.kind) }, children: e.label }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
              lineNumber: 556,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1 text-text-secondary", children: e.detail }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
              lineNumber: 559,
              columnNumber: 23
            }, void 0),
            !readonly && e.kind === "volume" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "number",
                min: 0,
                max: 64,
                value: e.raw,
                onChange: (ev) => {
                  const v = parseInt(ev.target.value);
                  if (!isNaN(v)) setVolByte(5 + e.pos, v);
                },
                className: "text-[9px] font-mono text-center border rounded py-0",
                style: {
                  width: "44px",
                  background: inputBg,
                  borderColor: dim,
                  color: accent
                }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                lineNumber: 561,
                columnNumber: 25
              },
              void 0
            ),
            !readonly && e.kind !== "volume" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-12" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
              lineNumber: 579,
              columnNumber: 25
            }, void 0)
          ] }, i, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 551,
            columnNumber: 21
          }, void 0)) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 546,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-[9px] text-text-muted", children: "Volume range 0–64. Commands: E0=loop E1=end E8=sustain EA=vol-slide" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 585,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 536,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
        lineNumber: 519,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
      lineNumber: 476,
      columnNumber: 7
    }, void 0);
  };
  const renderSndMod = () => {
    const seqCount = Math.min(config.sndSeqsCount, Math.floor(config.sndModSeqData.length / 64));
    const clampedSeq = Math.max(0, Math.min(seqCount - 1, activeSndSeq));
    const entries = seqCount > 0 ? parseSndSeq(config.sndModSeqData, clampedSeq, seqCount) : [];
    const kindColor = (kind) => {
      switch (kind) {
        case "setwave":
        case "newwave":
          return "#88ccff";
        case "end":
          return "#ff4444";
        case "loop":
          return "#44ff88";
        case "sustain":
          return "#ffaa44";
        case "vibrato":
          return "#ff88ff";
        case "setseq":
          return "#ffff44";
        case "wavemod":
        case "updwavemod":
          return "#44ffff";
        case "smppack":
          return "#88ff88";
        case "random":
          return "#ffaa88";
        case "note":
          return accent;
        default:
          return "#666";
      }
    };
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 p-3 overflow-y-auto", style: { maxHeight: "calc(100vh - 280px)" }, children: seqCount === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted", children: "No SndModSeq data" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
      lineNumber: 626,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
      lineNumber: 625,
      columnNumber: 11
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: "Sound Modulation Sequences" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 632,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 flex-wrap", children: Array.from({ length: seqCount }, (_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setActiveSndSeq(i),
            className: "text-[9px] font-mono px-2 py-0.5 rounded border transition-colors",
            style: {
              borderColor: i === clampedSeq ? accent : dim,
              color: i === clampedSeq ? panelBg2 : accentDim,
              background: i === clampedSeq ? accent : "transparent"
            },
            children: i
          },
          i,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 635,
            columnNumber: 19
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 633,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
        lineNumber: 631,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `rounded-lg border p-3 ${panelBg}`, style: panelStyle, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { color: accent, label: `SndModSeq #${clampedSeq}` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 653,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setShowSndHex((v) => !v),
              className: "text-[9px] px-2 py-0.5 rounded border",
              style: { borderColor: dim, color: accentDim, background: "transparent" },
              children: showSndHex ? "Hide" : "Hex"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
              lineNumber: 654,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 652,
          columnNumber: 15
        }, void 0),
        showSndHex ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "pre",
          {
            className: "text-[9px] font-mono overflow-x-auto p-2 rounded",
            style: { background: "#080400", color: "var(--color-text-muted)", border: `1px solid ${dim}` },
            children: hexPreview(config.sndModSeqData.slice(clampedSeq * 64, clampedSeq * 64 + 64))
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 663,
            columnNumber: 17
          },
          void 0
        ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "flex font-mono text-[9px] border-b mb-1 pb-0.5",
              style: { borderColor: dim, color: "var(--color-text-muted)" },
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-6 text-center", children: "Pos" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                  lineNumber: 672,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-8 text-center", children: "Hex" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                  lineNumber: 673,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-24 text-center", children: "Cmd" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                  lineNumber: 674,
                  columnNumber: 21
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1", children: "Detail" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                  lineNumber: 675,
                  columnNumber: 21
                }, void 0),
                !readonly && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-14 text-right", children: "Arg" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                  lineNumber: 676,
                  columnNumber: 35
                }, void 0)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
              lineNumber: 670,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "overflow-y-auto", style: { maxHeight: "260px" }, children: entries.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted py-2", children: "Empty sequence" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 680,
            columnNumber: 23
          }, void 0) : entries.map((e, i) => {
            const baseByte = clampedSeq * 64 + e.pos;
            const argByte = baseByte + 1;
            const showArgInput = !readonly && (e.kind === "note" || e.kind === "setwave" || e.kind === "newwave" || e.kind === "sustain" || e.kind === "vibrato" || e.kind === "setseq" || e.kind === "random");
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center font-mono text-[9px] py-0.5", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-6 text-center text-text-muted", children: e.pos }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                lineNumber: 694,
                columnNumber: 29
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-8 text-center text-text-muted", children: e.raw.toString(16).padStart(2, "0") }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                lineNumber: 695,
                columnNumber: 29
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-24 text-center font-bold", style: { color: kindColor(e.kind) }, children: e.label }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                lineNumber: 698,
                columnNumber: 29
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1 text-text-secondary", children: e.detail }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                lineNumber: 701,
                columnNumber: 29
              }, void 0),
              showArgInput ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "number",
                  min: 0,
                  max: 255,
                  value: config.sndModSeqData[argByte] ?? 0,
                  onChange: (ev) => {
                    const v = parseInt(ev.target.value);
                    if (!isNaN(v)) setSndByte(argByte, v);
                  },
                  className: "text-[9px] font-mono text-center border rounded py-0",
                  style: {
                    width: "52px",
                    background: inputBg,
                    borderColor: dim,
                    color: accent
                  },
                  title: `SndModSeq[${baseByte + 1}] — first argument byte`
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                  lineNumber: 703,
                  columnNumber: 31
                },
                void 0
              ) : !readonly ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-14" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
                lineNumber: 721,
                columnNumber: 31
              }, void 0) : null
            ] }, i, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
              lineNumber: 693,
              columnNumber: 27
            }, void 0);
          }) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 678,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 text-[9px] text-text-muted", children: "E2/E4=set/new wave · E3=vibrato · E7=jump seq · E8=sustain · E9=smp pack" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
            lineNumber: 728,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
          lineNumber: 668,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
        lineNumber: 651,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
      lineNumber: 629,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
      lineNumber: 623,
      columnNumber: 7
    }, void 0);
  };
  const TABS = [
    { id: "summary", label: "Summary" },
    { id: "volmod", label: "VolModSeq" },
    { id: "sndmod", label: "SndModSeqs" }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b", style: { borderColor: dim }, children: TABS.map(({ id, label }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(id),
        className: "px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
        style: {
          color: activeTab === id ? accent : "#666",
          borderBottom: activeTab === id ? `2px solid ${accent}` : "2px solid transparent",
          background: activeTab === id ? isCyan ? "#041510" : "#1a0800" : "transparent"
        },
        children: label
      },
      id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
        lineNumber: 752,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
      lineNumber: 750,
      columnNumber: 7
    }, void 0),
    activeTab === "summary" && renderSummary(),
    activeTab === "volmod" && renderVolMod(),
    activeTab === "sndmod" && renderSndMod()
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/TFMXControls.tsx",
    lineNumber: 749,
    columnNumber: 5
  }, void 0);
};
export {
  TFMXControls
};
