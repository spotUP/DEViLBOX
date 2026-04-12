import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
const SampleBrowserPane = ({
  entries,
  onEntryClick,
  headerLabel = "SAMPLES",
  emptyMessage = "No samples loaded.",
  width = 220,
  renderEntry
}) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "flex-shrink-0 border-l border-dark-border bg-dark-bgSecondary overflow-y-auto",
      style: { width },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-2 py-1 font-bold text-xs text-accent-primary border-b border-dark-border bg-dark-bgSecondary sticky top-0 z-10", children: [
          headerLabel,
          " (",
          entries.length,
          ")"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SampleBrowserPane.tsx",
          lineNumber: 52,
          columnNumber: 7
        }, void 0),
        entries.length === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 text-[10px] text-text-muted italic", children: emptyMessage }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SampleBrowserPane.tsx",
          lineNumber: 56,
          columnNumber: 9
        }, void 0),
        entries.map((entry) => {
          const isClickable = !!onEntryClick;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              onClick: isClickable ? () => onEntryClick(entry) : void 0,
              className: [
                "px-2 py-1.5 border-b border-dark-border text-[10px]",
                entry.isCurrent ? "bg-accent-primary/10" : "",
                isClickable ? "cursor-pointer hover:bg-accent-primary/20 transition-colors" : ""
              ].join(" "),
              title: typeof entry.id === "number" ? `#${entry.id}: ${entry.name}` : entry.name,
              children: renderEntry ? renderEntry(entry) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `font-mono truncate ${entry.isCurrent ? "text-accent-primary" : "text-text-primary"}`, children: entry.name }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SampleBrowserPane.tsx",
                  lineNumber: 77,
                  columnNumber: 17
                }, void 0),
                entry.sizeBytes !== void 0 && entry.sizeBytes > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted mt-0.5", children: [
                  entry.sizeBytes,
                  " bytes"
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SampleBrowserPane.tsx",
                  lineNumber: 81,
                  columnNumber: 19
                }, void 0),
                entry.isCurrent && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-0.5 text-[9px] text-accent-primary", children: "(this instrument)" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SampleBrowserPane.tsx",
                  lineNumber: 86,
                  columnNumber: 19
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SampleBrowserPane.tsx",
                lineNumber: 76,
                columnNumber: 15
              }, void 0)
            },
            entry.id,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SampleBrowserPane.tsx",
              lineNumber: 63,
              columnNumber: 11
            },
            void 0
          );
        })
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/shared/SampleBrowserPane.tsx",
      lineNumber: 48,
      columnNumber: 5
    },
    void 0
  );
};
export {
  SampleBrowserPane as S
};
