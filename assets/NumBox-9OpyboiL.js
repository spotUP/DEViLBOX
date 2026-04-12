import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
const NumBox = ({
  label,
  value,
  min,
  max,
  onValueChange,
  hex,
  width = "48px",
  color = "var(--color-text-secondary)",
  borderColor = "var(--color-border)",
  background = "#0a0a0a"
}) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-secondary w-20 text-right whitespace-nowrap", children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/NumBox.tsx",
    lineNumber: 32,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "input",
    {
      type: "number",
      value,
      min,
      max,
      onChange: (e) => {
        const v = parseInt(e.target.value);
        if (!isNaN(v)) onValueChange(Math.max(min, Math.min(max, v)));
      },
      className: "text-xs font-mono text-center border rounded px-1 py-0.5",
      style: { width, background, borderColor, color }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/NumBox.tsx",
      lineNumber: 33,
      columnNumber: 5
    },
    void 0
  ),
  hex && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono text-text-secondary", children: [
    "$",
    value.toString(16).toUpperCase().padStart(2, "0")
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/NumBox.tsx",
    lineNumber: 46,
    columnNumber: 7
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/NumBox.tsx",
  lineNumber: 31,
  columnNumber: 3
}, void 0);
export {
  NumBox as N
};
