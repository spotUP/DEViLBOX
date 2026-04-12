import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { E as EnvelopeVisualization } from "./EnvelopeVisualization-Bz0hAbvA.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./GTVisualMapping-BkrLaqE6.js";
const Section = ({ title, description, children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { marginBottom: 32, borderBottom: "1px solid #2a2a3a", paddingBottom: 24 }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { style: { fontSize: 18, fontWeight: "bold", color: "#e2e2e8", marginBottom: 4 }, children: title }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 15,
    columnNumber: 5
  }, void 0),
  description && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { style: { fontSize: 12, color: "#6b6b80", marginBottom: 12 }, children: description }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 16,
    columnNumber: 21
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }, children }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 17,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 14,
  columnNumber: 3
}, void 0);
const Card = ({ label, width = 200, height, children }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: 6, padding: 12, width, minHeight: height }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9, color: "#6b6b80", marginBottom: 8, fontFamily: '"JetBrains Mono", monospace', textTransform: "uppercase", letterSpacing: "0.05em" }, children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 25,
    columnNumber: 5
  }, void 0),
  children
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 24,
  columnNumber: 3
}, void 0);
const Swatch = ({ color, name, hex }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: 24, height: 24, borderRadius: 4, background: color, border: "1px solid #333" } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 33,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 11, color: "#e2e2e8" }, children: name }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 35,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9, color: "#6b6b80", fontFamily: '"JetBrains Mono", monospace' }, children: hex }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 36,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 34,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 32,
  columnNumber: 3
}, void 0);
const BTN = "px-3 py-1.5 text-xs font-mono border cursor-pointer transition-colors rounded";
const ButtonSample = ({ label, className }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { className: `${BTN} ${className}`, children: label }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 44,
  columnNumber: 3
}, void 0);
const SliderSample = ({ label, color = "#6366f1" }) => {
  const [val, setVal] = reactExports.useState(50);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { marginBottom: 8 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9, color: "#6b6b80", marginBottom: 2 }, children: [
      label,
      ": ",
      val
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 52,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("input", { type: "range", min: 0, max: 100, value: val, onChange: (e) => setVal(+e.target.value), style: { width: "100%", accentColor: color } }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 53,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 51,
    columnNumber: 5
  }, void 0);
};
const ADSRMini = ({ a, d, s, r, color, width = 160, height = 50 }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EnvelopeVisualization, { mode: "sid", attack: a, decay: d, sustain: s, release: r, width, height, color, backgroundColor: "#121218", border: "1px solid #2a2a3a" }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 61,
  columnNumber: 3
}, void 0);
const CH_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ec4899", "#06b6d4", "#a855f7"];
const PatternGridMock = () => {
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = 500, h = 240;
    ctx.fillStyle = "#0d0d12";
    ctx.fillRect(0, 0, w, h);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, 16);
    const cols = ["Row", "Note", "Ins", "Cmd", "Dat", "Note", "Ins", "Cmd", "Dat", "Note", "Ins", "Cmd", "Dat"];
    const colW = [30, 30, 22, 22, 22, 30, 22, 22, 22, 30, 22, 22, 22];
    let cx = 0;
    cols.forEach((col, i) => {
      ctx.fillStyle = i === 0 ? "#555" : i < 5 ? "#6366f180" : i < 9 ? "#f59e0b80" : "#10b98180";
      ctx.fillText(col, cx + 2, 11);
      cx += colW[i];
    });
    const demoNotes = [["C-4", "01", "---", "--"], ["...", "..", "---", "--"], ["E-4", "01", "---", "--"], ["...", "..", "---", "--"], ["G-4", "02", "0C", "40"], ["...", "..", "---", "--"], ["...", "..", "---", "--"], ["C-5", "01", "03", "20"], ["...", "..", "---", "--"], ["===", "..", "---", "--"], ["...", "..", "---", "--"], ["D-4", "01", "---", "--"], ["...", "..", "---", "--"], ["F#4", "02", "04", "30"]];
    for (let r = 0; r < 14; r++) {
      const y = 18 + r * 15;
      const isBeat = r % 4 === 0;
      ctx.fillStyle = isBeat ? "#0e0e1a" : r % 2 === 0 ? "#0b0b14" : "#0d0d18";
      ctx.fillRect(0, y, w, 15);
      if (r === 4) {
        ctx.fillStyle = "#ffffff10";
        ctx.fillRect(0, y, w, 15);
      }
      ctx.fillStyle = isBeat ? "#666" : "#444";
      ctx.fillText(r.toString(16).toUpperCase().padStart(2, "0"), 4, y + 11);
      const d = demoNotes[r] || ["...", "..", "---", "--"];
      for (let ch = 0; ch < 3; ch++) {
        const bx = 30 + ch * 96;
        const note = d[0], ins = d[1], cmd = d[2], dat = d[3];
        ctx.fillStyle = note === "..." ? "#333" : note === "===" ? "#ef4444" : "#e8e8f0";
        ctx.fillText(note, bx + 2, y + 11);
        ctx.fillStyle = ins === ".." ? "#333" : "#fbbf24";
        ctx.fillText(ins, bx + 32, y + 11);
        ctx.fillStyle = cmd === "---" ? "#333" : "#f97316";
        ctx.fillText(cmd, bx + 54, y + 11);
        ctx.fillStyle = dat === "--" ? "#333" : "#f97316";
        ctx.fillText(dat, bx + 76, y + 11);
      }
    }
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref, width: 500, height: 240, style: { width: 500, height: 240, borderRadius: 4 } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 112,
    columnNumber: 10
  }, void 0);
};
const PianoRollMock = () => {
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = 500, h = 200, keysW = 36;
    ctx.fillStyle = "#121218";
    ctx.fillRect(0, 0, w, h);
    const BLACK = [1, 3, 6, 8, 10];
    for (let n = 0; n < 24; n++) {
      const y = n * (h / 24);
      const noteH2 = h / 24;
      const isBlack = BLACK.includes((23 - n) % 12);
      ctx.fillStyle = isBlack ? "#0a0a0a" : "#141414";
      ctx.fillRect(0, y, keysW, noteH2);
      ctx.fillStyle = isBlack ? "#161620" : "#1a1a24";
      ctx.fillRect(keysW, y, w - keysW, noteH2);
      if ((23 - n) % 12 === 0) {
        ctx.fillStyle = "#44445a";
        ctx.font = '7px "JetBrains Mono"';
        ctx.fillText(`C${Math.floor((23 - n) / 12) + 3}`, 2, y + noteH2 - 1);
        ctx.fillStyle = "#2a2a3a";
        ctx.fillRect(keysW, y, w - keysW, 1);
      }
    }
    for (let col = 0; col < 32; col++) {
      const x = keysW + col * ((w - keysW) / 32);
      ctx.fillStyle = col % 4 === 0 ? "#2a2a3a" : "#1e1e28";
      ctx.globalAlpha = col % 4 === 0 ? 0.6 : 0.3;
      ctx.fillRect(x, 0, 1, h - 30);
      ctx.globalAlpha = 1;
    }
    const notes = [{ r: 0, n: 12, l: 4 }, { r: 4, n: 16, l: 2 }, { r: 8, n: 19, l: 4 }, { r: 12, n: 12, l: 3 }, { r: 16, n: 14, l: 2 }, { r: 20, n: 17, l: 4 }, { r: 24, n: 21, l: 3 }, { r: 28, n: 19, l: 4 }];
    const cellW = (w - keysW) / 32;
    const noteH = h / 24;
    notes.forEach(({ r, n, l }) => {
      const x = keysW + r * cellW, y2 = (23 - n) * noteH, nw = l * cellW - 1;
      ctx.fillStyle = "#6366f1";
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.roundRect(x, y2 + 1, nw, noteH - 2, 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y2 + 1, nw, noteH - 2, 2);
      ctx.stroke();
    });
    ctx.fillStyle = "#2a2a3a";
    ctx.fillRect(keysW, h - 30, w - keysW, 1);
    notes.forEach(({ r, l }) => {
      const x = keysW + r * cellW;
      const vel = 0.4 + Math.random() * 0.5;
      const velColor = vel > 0.7 ? "#ef4444" : vel > 0.5 ? "#f59e0b" : "#10b981";
      ctx.fillStyle = velColor;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x, h - vel * 28 - 1, Math.max(2, l * cellW - 2), vel * 28);
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(keysW + 12 * cellW, 0, 2, h);
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref, width: 500, height: 200, style: { width: 500, height: 200, borderRadius: 4 } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 169,
    columnNumber: 10
  }, void 0);
};
const OrderMatrixMock = () => {
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = 500, h = 120;
    ctx.fillStyle = "#0d0d12";
    ctx.fillRect(0, 0, w, h);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, 16);
    ["Pos", "CH1", "CH2", "CH3"].forEach((ch, i) => {
      ctx.fillStyle = i === 0 ? "#666" : CH_COLORS[i - 1];
      ctx.fillText(ch, 8 + i * 80, 11);
    });
    const data = [["00", "00", "00"], ["01", "02", "01"], ["02", "01", "03"], ["FF", "FF", "FF"]];
    data.forEach((row, r) => {
      const y = 18 + r * 16;
      ctx.fillStyle = r === 1 ? "#ffffff08" : "transparent";
      ctx.fillRect(0, y, w, 16);
      ctx.fillStyle = "#555";
      ctx.fillText(r.toString(16).toUpperCase().padStart(2, "0"), 8, y + 12);
      row.forEach((val, ch) => {
        ctx.fillStyle = val === "FF" ? "#ef4444" : "#60e060";
        ctx.fillText(val, 88 + ch * 80, y + 12);
      });
    });
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref, width: 500, height: 120, style: { width: 500, height: 120, borderRadius: 4 } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 199,
    columnNumber: 10
  }, void 0);
};
const InstrumentPanelMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9, color: "#e2e2e8" }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6366f1", fontWeight: "bold" }, children: "#01 Classic Bass" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 205,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80" }, children: "AD:09 SR:00" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 206,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 204,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ADSRMini, { a: 0, d: 9, s: 0, r: 0, color: "#10b981", width: 250, height: 50 }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 208,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, marginTop: 8 }, children: ["ATK:0", "DEC:9", "SUS:0", "REL:0"].map((l) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { background: "#121218", padding: "2px 4px", borderRadius: 2, textAlign: "center", color: "#10b981" }, children: l }, l, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 210,
    columnNumber: 54
  }, void 0)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 209,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 4, marginTop: 8 }, children: ["TRI", "SAW", "PUL", "NOI"].map((w, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, padding: "4px 0", textAlign: "center", borderRadius: 3, border: `1px solid ${i === 1 ? "#10b981" : "#2a2a3a"}`, background: i === 1 ? "#10b98120" : "#22222e", color: i === 1 ? "#10b981" : "#44445a" }, children: w }, w, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 213,
    columnNumber: 51
  }, void 0)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 212,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px", marginTop: 8, color: "#6b6b80" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
      "Wave: ",
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#60e060" }, children: "00" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 216,
        columnNumber: 19
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 216,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
      "Pulse: ",
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#ff8866" }, children: "00" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 217,
        columnNumber: 20
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 217,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
      "Filter: ",
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#ffcc00" }, children: "00" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 218,
        columnNumber: 21
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 218,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
      "Speed: ",
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6699ff" }, children: "00" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 219,
        columnNumber: 20
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 219,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 215,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 12, marginTop: 6, color: "#6b6b80" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Gate: 00" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 222,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Vib: 00" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 222,
      columnNumber: 28
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 221,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 203,
  columnNumber: 3
}, void 0);
const InstrumentDesignerMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9, color: "#e2e2e8" }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80" }, children: "<" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 230,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6366f1", fontWeight: "bold" }, children: "#01 Classic Bass" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 231,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80" }, children: ">" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 232,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 229,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "#44445a", marginBottom: 2 }, children: "ENVELOPE" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 234,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ADSRMini, { a: 0, d: 9, s: 10, r: 3, color: "#6366f1", width: 250, height: 60 }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 235,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 8, marginTop: 4, color: "#6b6b80" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "A:0 2ms" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 237,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "D:9 300ms" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 237,
      columnNumber: 27
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "S:10 67%" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 237,
      columnNumber: 49
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "R:3 72ms" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 237,
      columnNumber: 70
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 236,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "#44445a", marginTop: 8, marginBottom: 2 }, children: "WAVEFORM" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 239,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }, children: [{ n: "TRI", on: false }, { n: "SAW", on: true }, { n: "PUL", on: false }, { n: "NOI", on: false }].map(({ n, on }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: 4, borderRadius: 4, border: `1px solid ${on ? "#10b981" : "#2a2a3a"}`, background: on ? "#10b98115" : "#22222e", color: on ? "#10b981" : "#44445a" }, children: n }, n, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 242,
    columnNumber: 9
  }, void 0)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 240,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "#44445a", marginTop: 8, marginBottom: 2 }, children: "FILTER" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 245,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 4 }, children: ["LP", "BP", "HP"].map((m, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: "2px 8px", borderRadius: 3, border: `1px solid ${i === 0 ? "#ffcc00" : "#2a2a3a"}`, color: i === 0 ? "#ffcc00" : "#44445a", fontSize: 8 }, children: m }, m, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 247,
    columnNumber: 41
  }, void 0)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 246,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 228,
  columnNumber: 3
}, void 0);
const TableEditorMock = () => {
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = 380, h = 180;
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, w, h);
    ctx.font = '10px "JetBrains Mono", monospace';
    ["wave", "pulse", "filter", "speed"].forEach((t, i) => {
      const colors = ["#60e060", "#ff8866", "#ffcc00", "#6699ff"];
      ctx.fillStyle = i === 1 ? "#0d0d0d" : "transparent";
      ctx.fillRect(i * 95, 0, 94, 18);
      ctx.fillStyle = i === 1 ? colors[i] : "#555";
      ctx.fillText(t.toUpperCase(), i * 95 + 8, 13);
      if (i === 1) {
        ctx.fillStyle = colors[i];
        ctx.fillRect(i * 95, 16, 94, 2);
      }
    });
    ctx.fillStyle = "#888";
    ctx.fillText(" IDX", 4, 32);
    ctx.fillText("LEFT", 40, 32);
    ctx.fillText("RIGHT", 80, 32);
    for (let r = 0; r < 9; r++) {
      const y = 36 + r * 15;
      const isCursor = r === 3;
      if (isCursor) {
        ctx.fillStyle = "#ffffff08";
        ctx.fillRect(0, y, w, 15);
      }
      ctx.fillStyle = "#555";
      ctx.fillText(r.toString(16).toUpperCase().padStart(2, "0"), 8, y + 11);
      const lv = r < 6 ? Math.round(Math.sin(r * 0.8) * 127 + 128) : 0;
      const rv = r < 6 ? Math.round(Math.cos(r * 0.6) * 127 + 128) : 0;
      ctx.fillStyle = lv === 0 ? "#333" : "#ff8866";
      ctx.fillText(lv.toString(16).toUpperCase().padStart(2, "0"), 40, y + 11);
      ctx.fillStyle = rv === 0 ? "#333" : "#ff8866";
      ctx.fillText(rv.toString(16).toUpperCase().padStart(2, "0"), 80, y + 11);
      if (rv > 0) {
        ctx.fillStyle = "#ff886622";
        ctx.fillRect(126, y + 2, rv / 255 * 200, 11);
      }
    }
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref, width: 380, height: 180, style: { width: 380, height: 180, borderRadius: 4 } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 284,
    columnNumber: 10
  }, void 0);
};
const SIDMonitorMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 8, fontFamily: '"JetBrains Mono", monospace', color: "#666" }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "#ef4444", fontWeight: "bold", marginBottom: 4 }, children: "SID #1 REGISTERS" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 289,
    columnNumber: 5
  }, void 0),
  [0, 1, 2].map((v) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { marginBottom: 6 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "#6b6b80", marginBottom: 1 }, children: [
      "Voice ",
      v + 1
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 292,
      columnNumber: 9
    }, void 0),
    ["Freq Lo", "Freq Hi", "PW Lo", "PW Hi", "Control", "Atk/Dec", "Sus/Rel"].map((name, ri) => {
      const colors = ["#6699ff", "#6699ff", "#ff8866", "#ff8866", "#ffcc00", "#60e060", "#60e060"];
      const val = Math.round(Math.random() * 200);
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 6, color: val > 0 ? colors[ri] : "#333" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { width: 48, color: "#444" }, children: name }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 298,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: val.toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 299,
          columnNumber: 15
        }, void 0)
      ] }, ri, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 297,
        columnNumber: 13
      }, void 0);
    })
  ] }, v, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 291,
    columnNumber: 7
  }, void 0)),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "#6b6b80", marginBottom: 1 }, children: "Filter / Vol" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 305,
    columnNumber: 5
  }, void 0),
  ["FC Lo", "FC Hi", "Res/Filt", "Mode/Vol"].map((name) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 6, color: "#ef4444" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { width: 48, color: "#444" }, children: name }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 308,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: Math.round(Math.random() * 255).toString(16).toUpperCase().padStart(2, "0") }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 309,
      columnNumber: 9
    }, void 0)
  ] }, name, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 307,
    columnNumber: 7
  }, void 0))
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 288,
  columnNumber: 3
}, void 0);
const MixerMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 4, height: 160 }, children: Array.from({ length: 6 }, (_, ch) => {
  const color = CH_COLORS[ch];
  const level = 0.3 + Math.random() * 0.6;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 4px", background: "#22222e", borderRadius: 4, border: "1px solid #2a2a3a" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: "80%", height: 3, borderRadius: 2, background: color } }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 321,
      columnNumber: 11
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 9, color: "#e2e2e8" }, children: [
      "CH",
      ch + 1
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 322,
      columnNumber: 11
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, width: 10, background: "#121218", borderRadius: 2, position: "relative", overflow: "hidden" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "absolute", bottom: 0, width: "100%", height: `${level * 100}%`, background: level > 0.85 ? "#ef4444" : color, borderRadius: 2, opacity: 0.7 } }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 324,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 323,
      columnNumber: 11
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 8, color: "#44445a" }, children: "M S" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 326,
      columnNumber: 11
    }, void 0)
  ] }, ch, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 320,
    columnNumber: 9
  }, void 0);
}) }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 316,
  columnNumber: 3
}, void 0);
const ArrangementMock = () => {
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = 500, h = 120, headerW = 40;
    ctx.fillStyle = "#121218";
    ctx.fillRect(0, 0, w, h);
    ctx.font = '8px "JetBrains Mono", monospace';
    for (let ch = 0; ch < 3; ch++) {
      const y = ch * 38, color = CH_COLORS[ch], trackH = 36;
      ctx.fillStyle = "#1a1a24";
      ctx.fillRect(0, y, headerW, trackH);
      ctx.fillStyle = color;
      ctx.fillRect(0, y, 3, trackH);
      ctx.fillStyle = "#6b6b80";
      ctx.fillText(`CH${ch + 1}`, 6, y + 20);
      ctx.fillStyle = "#2a2a3a";
      ctx.fillRect(headerW, y + trackH - 1, w - headerW, 1);
      let bx = headerW;
      for (let p = 0; p < 4; p++) {
        const bw = 60 + Math.random() * 40;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.roundRect(bx + 1, y + 2, bw - 2, trackH - 4, 4);
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx + 1, y + 2, bw - 2, trackH - 4, 4);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.fillText(p.toString(16).toUpperCase().padStart(2, "0"), bx + 4, y + 20);
        bx += bw + 2;
      }
    }
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(headerW + 120, 0, 2, h);
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref, width: 500, height: 120, style: { width: 500, height: 120, borderRadius: 4 } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 361,
    columnNumber: 10
  }, void 0);
};
const ToolbarMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "#1a1a2e", borderRadius: 4, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80", padding: "1px 4px", border: "1px solid #333", borderRadius: 2 }, children: "Save" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 366,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80", padding: "1px 4px", border: "1px solid #333", borderRadius: 2 }, children: "PRG" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 367,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80", padding: "1px 4px", border: "1px solid #333", borderRadius: 2 }, children: "SID" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 368,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { width: 1, height: 16, background: "#333" } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 369,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#ef4444", fontWeight: "bold" }, children: "REC" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 370,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#f59e0b" }, children: "JAM" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 371,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { width: 1, height: 16, background: "#333" } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 372,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80" }, children: [
    "Pos:",
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#e2e2e8" }, children: "00" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 373,
      columnNumber: 44
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 373,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80" }, children: [
    "Row:",
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#e2e2e8" }, children: "00" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 374,
      columnNumber: 44
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 374,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#ffcc00", fontWeight: "bold" }, children: "Commando Theme" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 375,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80" }, children: "by Rob Hubbard" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 376,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { flex: 1 } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 377,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80" }, children: "Oct:3" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 378,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80" }, children: "Stp:1" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 379,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80" }, children: "Tempo:6" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 380,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6b6b80" }, children: "6581" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 381,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#10b981", fontWeight: "bold", padding: "1px 4px", border: "1px solid #10b98150", borderRadius: 2 }, children: "1xSID" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 382,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { width: 1, height: 16, background: "#333" } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 383,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6366f180" }, children: "[PRO]" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 384,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#6366f1", fontWeight: "bold" }, children: "[DAW]" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 385,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 365,
  columnNumber: 3
}, void 0);
const PresetListMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9 }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "#888", marginBottom: 4 }, children: "PRESETS" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 391,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 2, marginBottom: 6 }, children: ["bass", "lead", "pad", "arp", "drum", "fx"].map((c, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { padding: "1px 4px", fontSize: 8, borderRadius: 2, background: i === 0 ? "#1a2a3a" : "#141414", color: i === 0 ? "#66aaff" : "#666" }, children: c.toUpperCase() }, c, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 394,
    columnNumber: 9
  }, void 0)) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 392,
    columnNumber: 5
  }, void 0),
  ["Classic Bass", "Sub Bass", "Acid Bass", "Hubbard Bass", "Galway Bass"].map((name, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: "2px 4px", background: i === 1 ? "#1a1a1a" : "transparent", color: i === 1 ? "#66aaff" : "#ccc", borderRadius: 2, marginBottom: 1 }, children: [
    name,
    " ",
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#666", float: "right" }, children: "09 00" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 399,
      columnNumber: 16
    }, void 0)
  ] }, name, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 398,
    columnNumber: 7
  }, void 0))
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 390,
  columnNumber: 3
}, void 0);
const PresetCardsMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }, children: [
  { n: "Classic Bass", d: "Punchy sawtooth bass", a: 0, dd: 9, s: 0, r: 0, w: "S" },
  { n: "Acid Bass", d: "Pulse with filter sweep", a: 0, dd: 8, s: 0, r: 0, w: "P" },
  { n: "PWM Lead", d: "Pulse width modulation", a: 0, dd: 9, s: 10, r: 9, w: "P" },
  { n: "Soft Pad", d: "Slow attack triangle", a: 8, dd: 12, s: 8, r: 12, w: "T" }
].map(({ n, d, a, dd, s, r, w }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: "6px 8px", borderRadius: 4, border: "1px solid #2a2a3a", background: "#22222e", cursor: "pointer" }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9, color: "#e2e2e8", fontWeight: "bold", marginBottom: 1 }, children: n }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 413,
    columnNumber: 9
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 7, color: "#44445a", marginBottom: 3 }, children: d }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 414,
    columnNumber: 9
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 3, fontSize: 7 }, children: ["T", "S", "P", "N"].map((wf) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: wf === w ? "#10b981" : "#44445a" }, children: wf }, wf, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 417,
      columnNumber: 45
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 416,
      columnNumber: 11
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ADSRMini, { a, d: dd, s, r, color: "#6366f1", width: 50, height: 16 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 419,
      columnNumber: 11
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 415,
    columnNumber: 9
  }, void 0)
] }, n, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 412,
  columnNumber: 7
}, void 0)) }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 406,
  columnNumber: 3
}, void 0);
const NavBarMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: 4, padding: "4px 12px", background: "#0d0d12", borderRadius: 4, fontSize: 10, border: "1px solid #2a2a3a" }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontWeight: "bold", color: "#e2e2e8", marginRight: 8 }, children: "DEViLBOX" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 428,
    columnNumber: 5
  }, void 0),
  ["Tracker", "Arrange", "Piano", "Mixer", "DJ", "Pads", "VJ", "Studio", "Split", "Grid", "303"].map((v, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { padding: "2px 6px", borderRadius: 3, fontSize: 9, cursor: "pointer", background: i === 0 ? "#6366f120" : "transparent", color: i === 0 ? "#6366f1" : "#6b6b80" }, children: v }, v, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 430,
    columnNumber: 7
  }, void 0)),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { flex: 1 } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 432,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 9, color: "#6b6b80" }, children: "Vol" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 433,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 9, color: "#6b6b80" }, children: "MIDI" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 434,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 9, color: "#6b6b80" }, children: "Settings" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 435,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 427,
  columnNumber: 3
}, void 0);
const MobileTabBarMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", background: "#0d0d12", borderRadius: 4, border: "1px solid #2a2a3a" }, children: [{ l: "Pattern", active: true }, { l: "Instr", active: false }, { l: "Mixer", active: false }, { l: "Arrange", active: false }, { l: "Pads", active: false }].map(({ l, active }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, textAlign: "center", padding: "8px 0", fontSize: 9, color: active ? "#6366f1" : "#44445a", background: active ? "#6366f110" : "transparent", cursor: "pointer" }, children: l }, l, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 442,
  columnNumber: 7
}, void 0)) }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 440,
  columnNumber: 3
}, void 0);
const OscilloscopeMock = () => {
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0d0d12";
    ctx.fillRect(0, 0, 280, 60);
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < 280; x++) {
      const y = 30 + Math.sin(x * 0.05) * 20 * Math.sin(x * 0.02);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref, width: 280, height: 60, style: { width: 280, height: 60, borderRadius: 4, border: "1px solid #2a2a3a" } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 460,
    columnNumber: 10
  }, void 0);
};
const FreqBarsMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "flex-end", gap: 1, height: 60, background: "#0d0d12", borderRadius: 4, padding: "4px 2px", border: "1px solid #2a2a3a" }, children: Array.from({ length: 32 }, (_, i) => {
  const h = Math.max(2, 55 * Math.exp(-i * 0.08) * (0.5 + Math.random() * 0.5));
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, height: h, background: `hsl(${160 + i * 3}, 70%, 50%)`, borderRadius: 1, opacity: 0.8 } }, i, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 467,
    columnNumber: 14
  }, void 0);
}) }, void 0, false, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 464,
  columnNumber: 3
}, void 0);
const StereoFieldMock = () => {
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0d0d12";
    ctx.fillRect(0, 0, 100, 100);
    ctx.strokeStyle = "#2a2a3a";
    ctx.beginPath();
    ctx.arc(50, 50, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#2a2a3a";
    ctx.beginPath();
    ctx.moveTo(50, 10);
    ctx.lineTo(50, 90);
    ctx.moveTo(10, 50);
    ctx.lineTo(90, 50);
    ctx.stroke();
    ctx.fillStyle = "#6366f1";
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 25;
      ctx.fillRect(50 + Math.cos(a) * r, 50 + Math.sin(a) * r, 2, 2);
    }
    ctx.globalAlpha = 1;
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref, width: 100, height: 100, style: { width: 100, height: 100, borderRadius: 4, border: "1px solid #2a2a3a" } }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 484,
    columnNumber: 10
  }, void 0);
};
const DAWViewMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", height: 340, gap: 1, background: "#121218", borderRadius: 6, overflow: "hidden", border: "1px solid #2a2a3a" }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToolbarMock, {}, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 489,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", gap: 1, minHeight: 0 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 1 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 100, background: "#0d0d12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#44445a" }, children: "Arrangement Timeline" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 492,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, background: "#0d0d12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#44445a" }, children: "Piano Roll Editor" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 493,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 491,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: 180, background: "#1a1a24", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#44445a", borderLeft: "1px solid #2a2a3a" }, children: "Instrument Designer" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 495,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 490,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 80, background: "#1a1a24", borderTop: "1px solid #2a2a3a", padding: 4 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 2, marginBottom: 4 }, children: ["Mixer", "Tables", "Monitor", "Presets", "Clips", "Steps", "Scope"].map((t, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { padding: "1px 6px", fontSize: 8, borderRadius: 2, color: i === 0 ? "#6366f1" : "#44445a", background: i === 0 ? "#6366f120" : "transparent" }, children: t }, t, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 500,
      columnNumber: 11
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 498,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerMock, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 503,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 497,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 488,
  columnNumber: 3
}, void 0);
const ProViewMock = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", height: 260, gap: 1, background: "#0d0d12", borderRadius: 6, overflow: "hidden", border: "1px solid #2a2a3a" }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToolbarMock, {}, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 510,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 60, background: "#0d0d12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#44445a", borderBottom: "1px solid #1a1a2e" }, children: "Order Matrix (3 channels × order positions)" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 511,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, background: "#0b0b14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#44445a" }, children: "Pattern Grid — Hex Editor (Note | Ins | Cmd | Dat × 3 channels)" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 512,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
  lineNumber: 509,
  columnNumber: 3
}, void 0);
const SPLIT_VIEWS = [
  { id: "tracker", label: "Tracker" },
  { id: "mixer", label: "Mixer" },
  { id: "arrangement", label: "Arrangement" },
  { id: "pianoroll", label: "Piano Roll" },
  { id: "dj", label: "DJ" },
  { id: "studio", label: "Studio" },
  { id: "drumpad", label: "Pads" }
];
const SplitScreenComparison = () => {
  const [showSplit, setShowSplit] = reactExports.useState(false);
  const [view, setView] = reactExports.useState("tracker");
  const baseUrl = window.location.origin;
  const domUrl = `${baseUrl}/?_renderMode=dom#/_view=${view}`;
  const glUrl = `${baseUrl}/?_renderMode=webgl#/_view=${view}`;
  if (!showSplit) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setShowSplit(true),
        style: {
          padding: "8px 20px",
          fontSize: 12,
          fontFamily: "inherit",
          border: "1px solid #6366f1",
          borderRadius: 6,
          cursor: "pointer",
          background: "#6366f120",
          color: "#6366f1",
          fontWeight: "bold"
        },
        children: "Open Side-by-Side Comparison"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 538,
        columnNumber: 7
      },
      void 0
    );
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "fixed", inset: 0, zIndex: 99999, background: "#0a0a10", display: "flex", flexDirection: "column" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 40, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", background: "#1a1a24", borderBottom: "1px solid #2a2a3a" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 13, fontWeight: "bold", color: "#e2e2e8" }, children: "DOM vs WebGL" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 554,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 3 }, children: SPLIT_VIEWS.map(({ id, label }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: () => setView(id), style: {
        padding: "3px 10px",
        fontSize: 10,
        fontFamily: "inherit",
        border: "none",
        borderRadius: 3,
        cursor: "pointer",
        background: view === id ? "#6366f1" : "#22222e",
        color: view === id ? "#fff" : "#6b6b80"
      }, children: label }, id, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 557,
        columnNumber: 13
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 555,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { flex: 1 } }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 563,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 9, color: "#44445a" }, children: "Both iframes load the full app — interact with either side" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 564,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: () => setShowSplit(false), style: {
        padding: "4px 12px",
        fontSize: 11,
        fontFamily: "inherit",
        border: "1px solid #2a2a3a",
        borderRadius: 4,
        cursor: "pointer",
        background: "#22222e",
        color: "#e2e2e8"
      }, children: "Close" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 565,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 553,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", minHeight: 0 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", flexDirection: "column", borderRight: "2px solid #6366f1" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 22, flexShrink: 0, background: "#10b98120", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#10b981", fontWeight: "bold" }, children: "DOM (React/HTML) — Source of Truth" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 574,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("iframe", { src: domUrl, style: { flex: 1, border: "none", width: "100%" }, title: "DOM" }, `dom-${view}`, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 577,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 573,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", flexDirection: "column" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 22, flexShrink: 0, background: "#6366f120", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#6366f1", fontWeight: "bold" }, children: "WebGL (Pixi) — Should Match DOM" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 580,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("iframe", { src: glUrl, style: { flex: 1, border: "none", width: "100%" }, title: "WebGL" }, `gl-${view}`, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 583,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 579,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 572,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 551,
    columnNumber: 5
  }, void 0);
};
const BackToApp = () => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "a",
  {
    href: "/",
    onClick: (e) => {
      e.preventDefault();
      history.replaceState(null, "", window.location.pathname);
      window.location.reload();
    },
    style: { fontSize: 11, color: "#6366f1", textDecoration: "none", cursor: "pointer" },
    children: "Back to App"
  },
  void 0,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 592,
    columnNumber: 3
  },
  void 0
);
const DesignSystemPage = () => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: "100vw", height: "100vh", overflow: "auto", background: "#121218", color: "#e2e2e8", fontFamily: '"JetBrains Mono", "SF Mono", monospace', padding: "24px 32px" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { maxWidth: 1200, margin: "0 auto" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { style: { fontSize: 28, fontWeight: "bold", marginBottom: 4 }, children: "DEViLBOX Design System" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 607,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { style: { fontSize: 12, color: "#6b6b80", marginBottom: 0 }, children: "Visual catalog of all UI components — DOM and Pixi renderers" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 608,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 606,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SplitScreenComparison, {}, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 611,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BackToApp, {}, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 612,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 610,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 605,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Colors", description: "Core palette used across all components", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Backgrounds", width: 220, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#121218", name: "Background", hex: "#121218" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 619,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#1a1a24", name: "Panel BG", hex: "#1a1a24" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 620,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#22222e", name: "Surface", hex: "#22222e" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 621,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#2a2a3a", name: "Border", hex: "#2a2a3a" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 622,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 618,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Accents", width: 220, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#6366f1", name: "Primary (Indigo)", hex: "#6366f1" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 625,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#f59e0b", name: "Warm (Amber)", hex: "#f59e0b" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 626,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#10b981", name: "Success (Emerald)", hex: "#10b981" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 627,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#ef4444", name: "Error (Red)", hex: "#ef4444" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 628,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 624,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Text", width: 220, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#e2e2e8", name: "Primary", hex: "#e2e2e8" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 631,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#6b6b80", name: "Secondary", hex: "#6b6b80" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 632,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#44445a", name: "Muted", hex: "#44445a" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 633,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 630,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Channel Colors", width: 220, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#6366f1", name: "CH1 (Indigo)", hex: "#6366f1" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 636,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#f59e0b", name: "CH2 (Amber)", hex: "#f59e0b" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 637,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#10b981", name: "CH3 (Emerald)", hex: "#10b981" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 638,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#ec4899", name: "CH4 (Pink)", hex: "#ec4899" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 639,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#06b6d4", name: "CH5 (Cyan)", hex: "#06b6d4" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 640,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#a855f7", name: "CH6 (Purple)", hex: "#a855f7" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 641,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 635,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "SID Table Colors", width: 220, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#60e060", name: "Wave", hex: "#60e060" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 644,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#ff8866", name: "Pulse", hex: "#ff8866" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 645,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#ffcc00", name: "Filter", hex: "#ffcc00" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 646,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "#6699ff", name: "Speed", hex: "#6699ff" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 647,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 643,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "FT2 Theme", width: 220, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "var(--color-ft2-header, #1a1a2e)", name: "FT2 Header", hex: "var(--color-ft2-header)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 650,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "var(--color-ft2-text, #c0c0c0)", name: "FT2 Text", hex: "var(--color-ft2-text)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 651,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "var(--color-ft2-highlight, #ffcc00)", name: "FT2 Highlight", hex: "var(--color-ft2-highlight)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 652,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { color: "var(--color-ft2-border, #333)", name: "FT2 Border", hex: "var(--color-ft2-border)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 653,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 649,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 617,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Typography", description: "Monospace font system", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Font Sizes", width: 300, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 8, color: "#e2e2e8", marginBottom: 4 }, children: "8px — Micro labels, table tooltips" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 660,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 9, color: "#e2e2e8", marginBottom: 4 }, children: "9px — Bottom tabs, preset categories" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 661,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 10, color: "#e2e2e8", marginBottom: 4 }, children: "10px — Toolbar items, panel labels" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 662,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 11, color: "#e2e2e8", marginBottom: 4 }, children: "11px — Main UI text, song name" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 663,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 13, color: "#e2e2e8", marginBottom: 4 }, children: "13px — Headers, status messages" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 664,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 659,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Font Weights", width: 300, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 11, fontWeight: "normal", color: "#e2e2e8", marginBottom: 4 }, children: "Normal — Body text, values" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 667,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 11, fontWeight: "bold", color: "#e2e2e8", marginBottom: 4 }, children: "Bold — Headers, active items" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 668,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 666,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 658,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Buttons", description: "DOM button styles (Tailwind classes)", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "FT2 Style", width: 300, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ButtonSample, { label: "Default", className: "bg-ft2-header text-ft2-textDim border-ft2-border hover:bg-ft2-border" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 676,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ButtonSample, { label: "Active", className: "bg-indigo-600/30 text-indigo-300 border-indigo-500/50 font-bold" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 677,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ButtonSample, { label: "Record", className: "bg-red-500 text-white border-transparent font-bold" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 678,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ButtonSample, { label: "Jam", className: "bg-amber-600/30 text-amber-400 border-amber-500/50" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 679,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ButtonSample, { label: "Success", className: "bg-emerald-600/20 text-emerald-400 border-emerald-500/50 font-bold" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 680,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 675,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 674,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "DAW Style", width: 300, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 }, children: ["[play]", "[stop]", "[REC]", "[FOLLOW]", "[SIDE]", "[PRO]", "[DAW]"].map((label) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { padding: "2px 6px", fontSize: 10, fontFamily: "inherit", color: label.includes("REC") ? "#ef4444" : label === label.toUpperCase() ? "#6366f1" : "#44445a", cursor: "pointer" }, children: label }, label, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 686,
        columnNumber: 17
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 684,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 683,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 673,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Inputs", description: "Sliders, toggles, and hex inputs", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "ADSR Sliders", width: 220, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SliderSample, { label: "Attack", color: "#10b981" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 694,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SliderSample, { label: "Decay", color: "#10b981" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 695,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SliderSample, { label: "Sustain", color: "#10b981" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 696,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SliderSample, { label: "Release", color: "#10b981" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 697,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 693,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Waveform Toggles", width: 260, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }, children: [{ name: "TRI", on: true }, { name: "SAW", on: false }, { name: "PUL", on: true }, { name: "NOI", on: false }].map(({ name, on }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: "6px 8px", borderRadius: 4, border: `1px solid ${on ? "#10b981" : "#2a2a3a"}`, background: on ? "#10b98120" : "#22222e", color: on ? "#10b981" : "#44445a", fontSize: 10, cursor: "pointer" }, children: [
        name,
        " — ",
        on ? "Active" : "Off"
      ] }, name, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 702,
        columnNumber: 17
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 700,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 699,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Hex Input", width: 200, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 8 }, children: ["A0", "9F", "00", "FF"].map((hex) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { background: "#121218", border: "1px solid #2a2a3a", borderRadius: 3, padding: "2px 6px", fontFamily: "inherit", fontSize: 11, color: hex === "00" ? "#44445a" : "#60e060" }, children: hex }, hex, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 711,
        columnNumber: 17
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 709,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 708,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 692,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Visualizations", description: "ADSR envelopes, waveforms, VU meters", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "ADSR Envelopes", width: 360, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 8, color: "#6b6b80", marginBottom: 2 }, children: "Punchy Bass" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 722,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ADSRMini, { a: 0, d: 9, s: 0, r: 0, color: "#6366f1" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 723,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 721,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 8, color: "#6b6b80", marginBottom: 2 }, children: "Soft Pad" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 726,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ADSRMini, { a: 8, d: 12, s: 8, r: 12, color: "#10b981" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 727,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 725,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 720,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 719,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Channel VU Meters", width: 280, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 8, alignItems: "flex-end", height: 80 }, children: [0.8, 0.5, 0.3, 0.9, 0.2, 0.6].map((level, i) => {
        const colors = ["#6366f1", "#f59e0b", "#10b981", "#ec4899", "#06b6d4", "#a855f7"];
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: 12, height: 60, background: "#121218", borderRadius: 2, position: "relative", overflow: "hidden" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "absolute", bottom: 0, width: "100%", height: `${level * 100}%`, background: level > 0.85 ? "#ef4444" : colors[i], borderRadius: 2, opacity: 0.8 } }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 738,
            columnNumber: 23
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 737,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 7, color: "#6b6b80" }, children: i + 1 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 740,
            columnNumber: 21
          }, void 0)
        ] }, i, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 736,
          columnNumber: 19
        }, void 0);
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 732,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 731,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Mini Waveforms", width: 320, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 12 }, children: ["Triangle", "Sawtooth", "Pulse", "Noise"].map((name) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { textAlign: "center" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("svg", { width: 60, height: 30, viewBox: "0 0 60 30", style: { background: "#121218", borderRadius: 3, border: "1px solid #2a2a3a" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "polyline",
          {
            fill: "none",
            stroke: "#10b981",
            strokeWidth: "1.5",
            points: name === "Triangle" ? "0,15 15,2 45,28 60,15" : name === "Sawtooth" ? "0,15 54,2 54,28 60,15" : name === "Pulse" ? "0,15 0,2 30,2 30,28 60,28 60,15" : "0,15 6,5 12,22 18,8 24,25 30,3 36,20 42,10 48,24 54,7 60,15"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 751,
            columnNumber: 21
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 750,
          columnNumber: 19
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 7, color: "#6b6b80", marginTop: 2 }, children: name }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 756,
          columnNumber: 19
        }, void 0)
      ] }, name, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 749,
        columnNumber: 17
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 747,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 746,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 718,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Panel Components", description: "Composite panels used in the tracker and DAW views", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Tab Bar", width: 400, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 2, background: "#121218", padding: 4, borderRadius: 4 }, children: ["Mixer", "Tables", "Monitor", "Presets", "Clips", "Steps", "Scope"].map((tab, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { style: { padding: "3px 10px", fontSize: 10, fontFamily: "inherit", borderRadius: 3, border: "none", cursor: "pointer", background: i === 0 ? "#6366f130" : "transparent", color: i === 0 ? "#6366f1" : "#44445a", fontWeight: i === 0 ? "bold" : "normal" }, children: tab }, tab, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 768,
        columnNumber: 17
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 766,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 765,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Channel Strip", width: 100, height: 200, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "4px 0" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: "80%", height: 3, borderRadius: 2, background: "#6366f1" } }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 774,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { fontSize: 10, color: "#e2e2e8" }, children: "CH 1" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 775,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: 12, height: 80, background: "#121218", borderRadius: 2, position: "relative", overflow: "hidden" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "absolute", bottom: 0, width: "100%", height: "60%", background: "#6366f1", borderRadius: 2, opacity: 0.7 } }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 777,
          columnNumber: 17
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 776,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 4, fontSize: 9, color: "#44445a" }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "M" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 780,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "S" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 780,
            columnNumber: 31
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 779,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 773,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 772,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Preset Card", width: 200, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: "8px 10px", borderRadius: 4, border: "1px solid #2a2a3a", background: "#22222e", cursor: "pointer" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 10, color: "#e2e2e8", fontWeight: "bold", marginBottom: 2 }, children: "Classic Bass" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 786,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 8, color: "#44445a", marginBottom: 4 }, children: "Punchy sawtooth bass" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 787,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 4, fontSize: 8 }, children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#44445a" }, children: "T" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
              lineNumber: 790,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#10b981" }, children: "S" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
              lineNumber: 791,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#44445a" }, children: "P" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
              lineNumber: 792,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#44445a" }, children: "N" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
              lineNumber: 793,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 789,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ADSRMini, { a: 0, d: 9, s: 0, r: 0, color: "#6366f1", width: 60, height: 18 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 795,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 788,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 785,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 784,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Arrangement Block", width: 300, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 2, padding: 4, background: "#121218", borderRadius: 4 }, children: ["#6366f1", "#f59e0b", "#10b981"].map((color, ch) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 7, color: "#6b6b80", marginBottom: 2 }, children: [
          "CH",
          ch + 1
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 803,
          columnNumber: 19
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 2 }, children: [0, 1, 2].map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, height: 20, borderRadius: 3, background: `${color}40`, border: `1px solid ${color}99`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color }, children: p.toString(16).toUpperCase().padStart(2, "0") }, p, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 806,
          columnNumber: 23
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 804,
          columnNumber: 19
        }, void 0)
      ] }, ch, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 802,
        columnNumber: 17
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 800,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 799,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Step Sequencer Row", width: 340, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 2 }, children: Array.from({ length: 16 }, (_, i) => {
        const on = [0, 4, 8, 10, 12].includes(i);
        const isBeat = i % 4 === 0;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
          width: 18,
          height: 18,
          borderRadius: 3,
          cursor: "pointer",
          border: `1px solid ${on ? "#6366f1" : isBeat ? "#2a2a3a" : "#1e1e28"}`,
          background: on ? "#6366f1" : "transparent"
        } }, i, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 821,
          columnNumber: 19
        }, void 0);
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 816,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 815,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 764,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Table Visualization", description: "Wave/Pulse/Filter/Speed table bar charts", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Bar Chart (Pulse Table)", width: 400, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "flex-end", gap: 1, height: 60, background: "#121218", borderRadius: 4, padding: "4px 2px", border: "1px solid #2a2a3a" }, children: Array.from({ length: 32 }, (_, i) => {
      const val = Math.sin(i * 0.3) * 0.5 + 0.5;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, height: `${val * 100}%`, background: "#ff8866", borderRadius: 1, opacity: 0.7 } }, i, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 838,
        columnNumber: 24
      }, void 0);
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 835,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 834,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 833,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Pattern Editor", description: "Hex-based tracker pattern grid — the core editing surface", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Pattern Grid (DOM — PatternEditorCanvas)", width: 520, height: 260, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PatternGridMock, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 847,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 846,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 845,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Piano Roll", description: "DAW-style note editor with velocity lane", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Piano Roll (DOM + Pixi — PixiGTPianoRoll)", width: 520, height: 220, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PianoRollMock, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 853,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 852,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 851,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Order Matrix", description: "Sequence editor showing pattern order per channel", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Order Matrix (DOM — GTOrderMatrix)", width: 520, height: 140, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OrderMatrixMock, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 859,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 858,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 857,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Instrument Panel", description: "SID instrument editor — ADSR, waveforms, table pointers", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Instrument Panel (DOM — GTInstrumentPanel)", width: 280, height: 300, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(InstrumentPanelMock, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 865,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 864,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Instrument Designer (Pixi — PixiGTInstrumentDesigner)", width: 280, height: 300, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(InstrumentDesignerMock, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 868,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 867,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 863,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Table Editor", description: "Wave/Pulse/Filter/Speed table hex editor with draw mode", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Table Editor (DOM — GTTableEditor)", width: 400, height: 200, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TableEditorMock, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 874,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 873,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 872,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "SID Monitor", description: "Live SID register display — 3 voices + global filter", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "SID Monitor (DOM + Pixi)", width: 250, height: 280, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SIDMonitorMock, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 880,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 879,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 878,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Mixer", description: "Per-channel mixer strips with VU meters", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Mixer Panel (DAW bottom panel)", width: 400, height: 180, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerMock, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 886,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 885,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 884,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Arrangement Timeline", description: "Horizontal pattern blocks per channel", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Arrangement (DAW — PixiGTDAWArrangement)", width: 520, height: 140, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrangementMock, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 892,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 891,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 890,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Toolbar", description: "Transport controls, song info, SID config", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "GT Toolbar (DOM — GTToolbar)", width: 700, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ToolbarMock, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 898,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 897,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 896,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Preset Browser", description: "SID instrument presets organized by category", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "List Variant (Studio)", width: 220, height: 200, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PresetListMock, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 904,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 903,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Cards Variant (DAW)", width: 400, height: 200, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PresetCardsMock, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 907,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 906,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 902,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Navigation", description: "Desktop nav bar, mobile tab bar, mobile hamburger menu", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Desktop NavBar", width: 700, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NavBarMock, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 913,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 912,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Mobile Tab Bar", width: 360, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MobileTabBarMock, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 916,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 915,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 911,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Visualization Components", description: "Audio-reactive and static visual displays", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Oscilloscope", width: 300, height: 80, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(OscilloscopeMock, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 922,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 921,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Frequency Bars", width: 300, height: 80, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FreqBarsMock, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 925,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 924,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Stereo Field", width: 120, height: 120, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StereoFieldMock, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 928,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 927,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 920,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Full View Compositions", description: "Complete view layouts as they appear in the app", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "DAW Mode (GT Ultra)", width: 700, height: 360, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DAWViewMock, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 935,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 934,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Pro Mode (GT Ultra)", width: 700, height: 280, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ProViewMock, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 938,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 937,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 933,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Layout Patterns", description: "How panels are composed into views", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "DAW Layout", width: 500, height: 200, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", height: 180, gap: 2 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 20, background: "#1a1a2e", borderRadius: 3, display: "flex", alignItems: "center", padding: "0 8px", fontSize: 8, color: "#6b6b80" }, children: "Toolbar (transport, BPM, view switch)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 946,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", gap: 2 }, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 2 }, children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 50, background: "#0d0d15", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#6b6b80" }, children: "Arrangement Timeline" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
              lineNumber: 949,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, background: "#0d0d15", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#6b6b80" }, children: "Piano Roll" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
              lineNumber: 950,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 948,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: 100, background: "#0d0d15", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#6b6b80" }, children: "Instrument Designer" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
            lineNumber: 952,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 947,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 40, background: "#0d0d15", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#6b6b80" }, children: "Bottom Panel (Mixer / Tables / Monitor / Presets)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 954,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 945,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 944,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Pro Layout", width: 300, height: 200, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", height: 180, gap: 2 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 20, background: "#1a1a2e", borderRadius: 3, display: "flex", alignItems: "center", padding: "0 8px", fontSize: 8, color: "#6b6b80" }, children: "GT Toolbar" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 959,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { height: 40, background: "#0d0d15", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#6b6b80" }, children: "Order Matrix" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 960,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, background: "#0d0d15", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#6b6b80" }, children: "Pattern Grid (hex editor)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 961,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 958,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 957,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 943,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Spacing & Sizing", description: "Standard dimensions used across panels", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Panel Heights", width: 300, children: [
        { name: "Toolbar", h: 36 },
        { name: "Bottom Panel", h: 240 },
        { name: "Arrangement", h: 220 },
        { name: "Order Matrix", h: 160 },
        { name: "Tab Bar", h: 28 }
      ].map(({ name, h }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b6b80", marginBottom: 4 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: name }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 977,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#e2e2e8" }, children: [
          h,
          "px"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 978,
          columnNumber: 17
        }, void 0)
      ] }, name, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 976,
        columnNumber: 15
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 968,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { label: "Sidebar & Gaps", width: 300, children: [
        { name: "Sidebar Width", v: "280px" },
        { name: "Piano Keys Width", v: "40px" },
        { name: "Channel Header", v: "50px" },
        { name: "Border Radius", v: "4px / 6px" },
        { name: "Standard Padding", v: "8px" },
        { name: "Standard Gap", v: "4px" }
      ].map(({ name, v }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b6b80", marginBottom: 4 }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: name }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 992,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#e2e2e8" }, children: v }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
          lineNumber: 993,
          columnNumber: 17
        }, void 0)
      ] }, name, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 991,
        columnNumber: 15
      }, void 0)) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
        lineNumber: 982,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 967,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { textAlign: "center", padding: "24px 0", color: "#44445a", fontSize: 10 }, children: "DEViLBOX Design System — generated from component library" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
      lineNumber: 999,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 604,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/design-system/DesignSystemPage.tsx",
    lineNumber: 603,
    columnNumber: 5
  }, void 0);
};
export {
  DesignSystemPage
};
