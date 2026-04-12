import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { ao as useGTUltraStore, W as CustomSelect } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
const GTInstrumentPanel = ({ width, height }) => {
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const setCurrentInstrument = useGTUltraStore((s) => s.setCurrentInstrument);
  const engine = useGTUltraStore((s) => s.engine);
  const instr = instrumentData[currentInstrument];
  const atk = ((instr == null ? void 0 : instr.ad) ?? 0) >> 4;
  const dec = ((instr == null ? void 0 : instr.ad) ?? 0) & 15;
  const sus = ((instr == null ? void 0 : instr.sr) ?? 0) >> 4;
  const rel = ((instr == null ? void 0 : instr.sr) ?? 0) & 15;
  const setADSR = reactExports.useCallback((param, value) => {
    if (!engine) return;
    const v = Math.max(0, Math.min(15, value));
    const ad = (instr == null ? void 0 : instr.ad) ?? 0;
    const sr = (instr == null ? void 0 : instr.sr) ?? 0;
    switch (param) {
      case "atk":
        engine.setInstrumentAD(currentInstrument, v << 4 | ad & 15);
        break;
      case "dec":
        engine.setInstrumentAD(currentInstrument, ad & 240 | v);
        break;
      case "sus":
        engine.setInstrumentSR(currentInstrument, v << 4 | sr & 15);
        break;
      case "rel":
        engine.setInstrumentSR(currentInstrument, sr & 240 | v);
        break;
    }
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument, instr == null ? void 0 : instr.ad, instr == null ? void 0 : instr.sr]);
  const setTablePtr = reactExports.useCallback((tableType, value) => {
    if (!engine) return;
    engine.setInstrumentTablePtr(currentInstrument, tableType, Math.max(0, Math.min(255, value)));
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument]);
  const setFirstwave = reactExports.useCallback((value) => {
    if (!engine) return;
    engine.setInstrumentFirstwave(currentInstrument, Math.max(0, Math.min(255, value)));
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument]);
  const HexInput = ({ value, max, onChange, digits = 2, color = "#60e060" }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "input",
    {
      type: "text",
      value: value.toString(16).toUpperCase().padStart(digits, "0"),
      maxLength: digits,
      onChange: (e) => {
        const v = parseInt(e.target.value, 16);
        if (!isNaN(v) && v >= 0 && v <= max) onChange(v);
      },
      style: {
        background: "var(--color-bg-secondary)",
        color,
        border: "1px solid var(--color-border)",
        padding: "1px 4px",
        width: digits === 1 ? 24 : 36,
        textAlign: "center",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        outline: "none"
      },
      onFocus: (e) => e.target.select()
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
      lineNumber: 63,
      columnNumber: 5
    },
    void 0
  );
  const labelStyle = {
    color: "var(--color-text-muted)",
    fontSize: 10,
    width: 80,
    textAlign: "right",
    paddingRight: 6
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
    width,
    height,
    overflow: "auto",
    padding: 8,
    borderBottom: "1px solid var(--color-border)",
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 11,
    background: "#0d0d0d",
    color: "var(--color-text-secondary)"
  }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", marginBottom: 4 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", fontWeight: "bold", marginRight: 8, fontSize: 10 }, children: "INSTRUMENT" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 97,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: String(currentInstrument),
          onChange: (v) => setCurrentInstrument(Number(v)),
          options: Array.from({ length: 64 }, (_, i) => {
            var _a;
            return {
              value: String(i),
              label: `${i.toString(16).toUpperCase().padStart(2, "0")} - ${((_a = instrumentData[i]) == null ? void 0 : _a.name) || `Instr ${i}`}`
            };
          })
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 98,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
      lineNumber: 96,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", height: 20, marginBottom: 4 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: labelStyle, children: "Name" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 110,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-secondary)", fontSize: 11 }, children: (instr == null ? void 0 : instr.name) || "—" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 111,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
      lineNumber: 109,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      EnvelopeVisualization,
      {
        mode: "sid",
        attack: atk,
        decay: dec,
        sustain: sus,
        release: rel,
        width: "auto",
        height: 36,
        color: "#60e060"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 115,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "var(--color-text-muted)", fontWeight: "bold", fontSize: 10, marginBottom: 2 }, children: "ENVELOPE" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
      lineNumber: 127,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 8, marginBottom: 6 }, children: [
      { label: "ATK", value: atk, param: "atk" },
      { label: "DEC", value: dec, param: "dec" },
      { label: "SUS", value: sus, param: "sus" },
      { label: "REL", value: rel, param: "rel" }
    ].map(({ label, value, param }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { textAlign: "center" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "var(--color-text-muted)", fontSize: 9 }, children: label }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 136,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HexInput, { value, max: 15, digits: 1, onChange: (v) => setADSR(param, v) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 137,
        columnNumber: 13
      }, void 0)
    ] }, param, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
      lineNumber: 135,
      columnNumber: 11
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
      lineNumber: 128,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px 12px", marginBottom: 4 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { gridColumn: "1 / 3", color: "var(--color-text-muted)", fontWeight: "bold", fontSize: 10 }, children: "TABLE POINTERS" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 145,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { gridColumn: "3 / 5", color: "var(--color-text-muted)", fontWeight: "bold", fontSize: 10 }, children: "SETTINGS" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 146,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", height: 20 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", fontSize: 10, marginRight: 4 }, children: "Wave" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 150,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HexInput, { value: (instr == null ? void 0 : instr.wavePtr) ?? 0, max: 255, onChange: (v) => setTablePtr(0, v), color: "#ffcc00" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 151,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 149,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", height: 20 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", fontSize: 10, marginRight: 4 }, children: "Pulse" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 154,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HexInput, { value: (instr == null ? void 0 : instr.pulsePtr) ?? 0, max: 255, onChange: (v) => setTablePtr(1, v), color: "#ffcc00" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 155,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 153,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", height: 20 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", fontSize: 10, marginRight: 4 }, children: "VibDly" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 158,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { background: "var(--color-bg-secondary)", color: "#60e060", border: "1px solid var(--color-border)", padding: "1px 4px", width: 36, textAlign: "center", fontSize: 11 }, children: ((instr == null ? void 0 : instr.vibdelay) ?? 0).toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 159,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 157,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", height: 20 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", fontSize: 10, marginRight: 4 }, children: "Gate" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 164,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { background: "var(--color-bg-secondary)", color: "#60e060", border: "1px solid var(--color-border)", padding: "1px 4px", width: 36, textAlign: "center", fontSize: 11 }, children: ((instr == null ? void 0 : instr.gatetimer) ?? 0).toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 165,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 163,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", height: 20 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", fontSize: 10, marginRight: 4 }, children: "Filter" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 172,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HexInput, { value: (instr == null ? void 0 : instr.filterPtr) ?? 0, max: 255, onChange: (v) => setTablePtr(2, v), color: "#ffcc00" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 173,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 171,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", height: 20 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", fontSize: 10, marginRight: 4 }, children: "Speed" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 176,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HexInput, { value: (instr == null ? void 0 : instr.speedPtr) ?? 0, max: 255, onChange: (v) => setTablePtr(3, v), color: "#ffcc00" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 177,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 175,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", height: 20 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "var(--color-text-muted)", fontSize: 10, marginRight: 4 }, children: "1stWv" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 180,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HexInput, { value: (instr == null ? void 0 : instr.firstwave) ?? 0, max: 255, onChange: setFirstwave }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
          lineNumber: 181,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
        lineNumber: 179,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
      lineNumber: 143,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/gtultra/GTInstrumentPanel.tsx",
    lineNumber: 91,
    columnNumber: 5
  }, void 0);
};
export {
  GTInstrumentPanel
};
