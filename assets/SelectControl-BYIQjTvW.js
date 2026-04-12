import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import { W as CustomSelect } from "./main-BbV5VyEH.js";
const SelectControl = ({ label, value, options, onChange }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-text-muted text-[10px]", children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SelectControl.tsx",
    lineNumber: 18,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    CustomSelect,
    {
      className: "bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]",
      value: String(Math.round(value)),
      onChange: (v) => onChange(Number(v)),
      options: options.map((n, i) => ({ value: String(i), label: n }))
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SelectControl.tsx",
      lineNumber: 19,
      columnNumber: 5
    },
    void 0
  )
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SelectControl.tsx",
  lineNumber: 17,
  columnNumber: 3
}, void 0);
export {
  SelectControl as S
};
