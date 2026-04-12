import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cZ as useSF2Store } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionLabel } from "./SectionLabel-DZkGAxIq.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1e3, 3e3, 5e3, 8e3];
const DECAY_MS = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3e3, 9e3, 15e3, 24e3];
const RELEASE_MS = DECAY_MS;
const SID_VOICE_REGS = [
  { offset: 0, label: "Freq Lo" },
  { offset: 1, label: "Freq Hi" },
  { offset: 2, label: "PW Lo" },
  { offset: 3, label: "PW Hi" },
  { offset: 4, label: "Control" },
  { offset: 5, label: "AD" },
  { offset: 6, label: "SR" }
];
const SID_GLOBAL_REGS = [
  { offset: 21, label: "FC Lo" },
  { offset: 22, label: "FC Hi" },
  { offset: 23, label: "Res/Filt" },
  { offset: 24, label: "Mode/Vol" }
];
function hex(v, digits = 2) {
  return v.toString(16).toUpperCase().padStart(digits, "0");
}
function getActiveWaveforms(ctrl) {
  const names = [];
  if (ctrl & 16) names.push("TRI");
  if (ctrl & 32) names.push("SAW");
  if (ctrl & 64) names.push("PUL");
  if (ctrl & 128) names.push("NOI");
  return names.length > 0 ? names.join("+") : "OFF";
}
const SF2Controls = ({ config, onChange }) => {
  const descriptor = useSF2Store((s) => s.descriptor);
  const instruments = useSF2Store((s) => s.instruments);
  const tableDefs = useSF2Store((s) => s.tableDefs);
  const c64Memory = useSF2Store((s) => s.c64Memory);
  const configRef = reactExports.useRef(config);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  const instrTableDef = tableDefs.find((t) => t.type === 128);
  const storeInst = instruments[config.instIndex];
  const rawBytes = (storeInst == null ? void 0 : storeInst.rawBytes) ?? config.rawBytes;
  const colCount = (instrTableDef == null ? void 0 : instrTableDef.columnCount) ?? config.columnCount;
  const handleByteChange = reactExports.useCallback((byteOffset, value) => {
    useSF2Store.getState().setInstrumentByte(configRef.current.instIndex, byteOffset, value);
    const newBytes = new Uint8Array(configRef.current.rawBytes);
    newBytes[byteOffset] = value;
    onChange({ rawBytes: newBytes });
  }, [onChange]);
  const handleNameChange = reactExports.useCallback((name) => {
    onChange({ name });
  }, [onChange]);
  const driverVersion = descriptor ? `${descriptor.driverName} v${descriptor.versionMajor}.${String(descriptor.versionMinor).padStart(2, "0")}` : "Unknown Driver";
  const [sidRegs, setSidRegs] = reactExports.useState(new Array(25).fill(0));
  reactExports.useEffect(() => {
    const iv = setInterval(() => {
      const mem = useSF2Store.getState().c64Memory;
      if (mem.length >= 54297) {
        const regs = [];
        for (let i = 0; i < 25; i++) regs.push(mem[54272 + i]);
        setSidRegs(regs);
      }
    }, 50);
    return () => clearInterval(iv);
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 p-3 text-xs font-mono h-full overflow-y-auto", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 flex-shrink-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary font-bold text-sm", children: "SF2" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 112,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px]", children: driverVersion }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 113,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: [
        "#",
        config.instIndex + 1
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 114,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "text",
          value: config.name,
          onChange: (e) => handleNameChange(e.target.value),
          className: "flex-1 px-2 py-0.5 bg-dark-bgSecondary border border-dark-border rounded text-text-primary text-xs font-mono min-w-0",
          maxLength: 31
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 115,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 111,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      InstrumentTab,
      {
        rawBytes,
        colCount,
        instrTableDef,
        onByteChange: handleByteChange
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 125,
        columnNumber: 7
      },
      void 0
    ),
    tableDefs.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 134,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TablesTab, { tableDefs, c64Memory }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 135,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 133,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 139,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SIDMonitorTab, { regs: sidRegs }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 140,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
    lineNumber: 109,
    columnNumber: 5
  }, void 0);
};
const InstrumentTab = ({ rawBytes, colCount, instrTableDef, onByteChange }) => {
  const hasEnoughBytes = colCount >= 2;
  const ad = hasEnoughBytes ? rawBytes[0] : 0;
  const sr = hasEnoughBytes ? rawBytes[1] : 0;
  const attack = ad >> 4 & 15;
  const decay = ad & 15;
  const sustain = sr >> 4 & 15;
  const release = sr & 15;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
    hasEnoughBytes && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label: "Envelope (AD/SR)" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 169,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-4 items-end", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          EnvelopeVisualization,
          {
            mode: "sid",
            attack,
            decay,
            sustain,
            release
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 172,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 171,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1 text-[10px] text-text-secondary min-w-[80px]", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "ATK:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 181,
              columnNumber: 53
            }, void 0),
            " ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
              attack,
              " (",
              ATTACK_MS[attack],
              "ms)"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 181,
              columnNumber: 99
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 181,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "DEC:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 182,
              columnNumber: 53
            }, void 0),
            " ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
              decay,
              " (",
              DECAY_MS[decay],
              "ms)"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 182,
              columnNumber: 99
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 182,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "SUS:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 183,
              columnNumber: 53
            }, void 0),
            " ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
              sustain,
              " (",
              Math.round(sustain / 15 * 100),
              "%)"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 183,
              columnNumber: 99
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 183,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "REL:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 184,
              columnNumber: 53
            }, void 0),
            " ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
              release,
              " (",
              RELEASE_MS[release],
              "ms)"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 184,
              columnNumber: 99
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 184,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 180,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 170,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 168,
      columnNumber: 9
    }, void 0),
    colCount >= 3 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label: "Waveform Pointer" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 193,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-[11px]", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "Table idx:" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 195,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary font-bold", children: [
          "$",
          hex(rawBytes[2])
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 196,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted ml-2", children: [
          "(",
          rawBytes[2],
          ")"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 197,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 194,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 192,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label: instrTableDef ? `${instrTableDef.name} (${colCount} cols)` : `Raw Bytes (${colCount})` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 204,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-0.5", children: Array.from({ length: colCount }, (_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-7 text-center text-text-muted text-[9px]", children: hex(i) }, i, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 208,
        columnNumber: 13
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 206,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-0.5", children: Array.from({ length: colCount }, (_, i) => {
        const val = i < rawBytes.length ? rawBytes[i] : 0;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "text",
            value: hex(val),
            onChange: (e) => {
              const parsed = parseInt(e.target.value, 16);
              if (!isNaN(parsed) && parsed >= 0 && parsed <= 255) {
                onByteChange(i, parsed);
              }
            },
            className: "w-7 px-0.5 py-0.5 text-center bg-dark-bgSecondary border border-dark-border rounded text-accent-primary text-[10px] font-mono focus:border-accent-primary focus:outline-none",
            maxLength: 2
          },
          i,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 218,
            columnNumber: 15
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 214,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 203,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
    lineNumber: 165,
    columnNumber: 5
  }, void 0);
};
const TablesTab = ({ tableDefs, c64Memory }) => {
  const [selectedTable, setSelectedTable] = reactExports.useState(0);
  const td = tableDefs[selectedTable];
  const setTableByte = useSF2Store((s) => s.setTableByte);
  if (tableDefs.length === 0) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted text-center py-8", children: "No driver tables defined" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 250,
      columnNumber: 12
    }, void 0);
  }
  const rows = td ? Math.min(td.rowCount, 256) : 0;
  const cols = (td == null ? void 0 : td.columnCount) ?? 0;
  const displayRows = Math.min(rows, 64);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 flex-wrap", children: tableDefs.map((t, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setSelectedTable(i),
        className: `px-2 py-0.5 text-[10px] rounded border transition-colors ${selectedTable === i ? "bg-accent-primary/20 text-accent-primary border-accent-primary/40 font-bold" : "bg-dark-bgSecondary text-text-muted border-dark-border hover:text-text-secondary"}`,
        children: [
          t.name,
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-1 text-[9px] opacity-60", children: t.type === 128 ? "INS" : t.type === 129 ? "CMD" : "" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 272,
            columnNumber: 13
          }, void 0)
        ]
      },
      i,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 262,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 260,
      columnNumber: 7
    }, void 0),
    td && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted", children: [
      td.name,
      " — ",
      td.rowCount,
      " rows × ",
      td.columnCount,
      " cols — addr: $",
      hex(td.address, 4)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 281,
      columnNumber: 9
    }, void 0),
    td && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "overflow-auto max-h-[400px]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("table", { className: "border-collapse text-[10px]", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("thead", { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("tr", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("th", { className: "sticky top-0 bg-dark-bgTertiary text-text-muted px-1 text-right w-8 border-r border-dark-border", children: "Row" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 292,
            columnNumber: 17
          }, void 0),
          Array.from({ length: cols }, (_, c) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("th", { className: "sticky top-0 bg-dark-bgTertiary text-text-muted px-1 w-6 text-center border-r border-dark-border", children: hex(c) }, c, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 294,
            columnNumber: 19
          }, void 0))
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 291,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 290,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("tbody", { children: Array.from({ length: displayRows }, (_, r) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("tr", { className: r % 16 === 0 ? "border-t border-dark-border" : "", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("td", { className: "text-right text-text-muted px-1 border-r border-dark-border bg-dark-bgSecondary", children: hex(r) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 303,
            columnNumber: 19
          }, void 0),
          Array.from({ length: cols }, (_2, c) => {
            const addr = td.address + c * td.rowCount + r;
            const val = addr < c64Memory.length ? c64Memory[addr] : 0;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("td", { className: "border-r border-dark-border/30 p-0", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "text",
                value: hex(val),
                onChange: (e) => {
                  const parsed = parseInt(e.target.value, 16);
                  if (!isNaN(parsed) && parsed >= 0 && parsed <= 255) {
                    setTableByte(td, r, c, parsed);
                  }
                },
                className: `w-6 px-0.5 py-0 text-center bg-transparent border-none font-mono text-[10px] focus:bg-dark-bgSecondary focus:outline-none focus:ring-1 focus:ring-accent-primary/50 ${val === 0 ? "text-text-muted/40" : "text-accent-primary"}`,
                maxLength: 2
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
                lineNumber: 311,
                columnNumber: 25
              },
              void 0
            ) }, c, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 310,
              columnNumber: 23
            }, void 0);
          })
        ] }, r, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 302,
          columnNumber: 17
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 300,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 289,
        columnNumber: 11
      }, void 0),
      rows > displayRows && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted mt-1", children: [
        "Showing ",
        displayRows,
        " of ",
        rows,
        " rows"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 333,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 288,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
    lineNumber: 258,
    columnNumber: 5
  }, void 0);
};
const SIDMonitorTab = ({ regs }) => {
  const voices = [0, 1, 2];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionLabel, { label: "SID Registers ($D400–$D418)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 349,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mb-1", children: "Live values from running SID emulation (20 Hz refresh)" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 350,
      columnNumber: 7
    }, void 0),
    voices.map((v) => {
      const base = v * 7;
      const freq = regs[base] | regs[base + 1] << 8;
      const pw = regs[base + 2] | (regs[base + 3] & 15) << 8;
      const ctrl = regs[base + 4];
      const gate = ctrl & 1;
      const wf = getActiveWaveforms(ctrl);
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-dark-border rounded p-2 bg-dark-bgSecondary", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `font-bold ${gate ? "text-accent-success" : "text-text-muted"}`, children: [
            "Voice ",
            v + 1
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 363,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `text-[9px] px-1 rounded ${gate ? "bg-accent-success/20 text-accent-success" : "bg-dark-bgTertiary text-text-muted"}`, children: gate ? "GATE ON" : "gate off" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 366,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-accent-primary text-[10px] font-bold", children: wf }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 369,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 362,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-x-3 gap-y-0.5 text-[10px]", children: [
          SID_VOICE_REGS.map((r) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: [
              r.label,
              ":"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 374,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: [
              "$",
              hex(regs[base + r.offset])
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 375,
              columnNumber: 19
            }, void 0)
          ] }, r.offset, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 373,
            columnNumber: 17
          }, void 0)),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "Freq:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 379,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: freq }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 380,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 378,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "PW:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 383,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: [
              pw,
              " (",
              Math.round(pw / 40.95),
              "%)"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
              lineNumber: 384,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 382,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 371,
          columnNumber: 13
        }, void 0)
      ] }, v, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 361,
        columnNumber: 11
      }, void 0);
    }),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-dark-border rounded p-2 bg-dark-bgSecondary", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-bold text-text-secondary text-[11px] mb-1", children: "Filter / Volume" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 393,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-x-3 gap-y-0.5 text-[10px]", children: [
        SID_GLOBAL_REGS.map((r) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: [
            r.label,
            ":"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 397,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: [
            "$",
            hex(regs[r.offset])
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 398,
            columnNumber: 15
          }, void 0)
        ] }, r.offset, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 396,
          columnNumber: 13
        }, void 0)),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "Cutoff:" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 402,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: regs[21] & 7 | regs[22] << 3 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 403,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 401,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "Res:" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 406,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: regs[23] >> 4 & 15 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 407,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 405,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: "Vol:" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 410,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: regs[24] & 15 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
            lineNumber: 411,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
          lineNumber: 409,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
        lineNumber: 394,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
      lineNumber: 392,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/SF2Controls.tsx",
    lineNumber: 348,
    columnNumber: 5
  }, void 0);
};
export {
  SF2Controls
};
