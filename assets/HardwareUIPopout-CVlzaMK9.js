import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, d as ChevronLeft, b as ChevronRight } from "./vendor-ui-AJ7AT9BN.js";
import { e as useInstrumentStore, f as getSynthInfo } from "./main-BbV5VyEH.js";
import { a as hasHardwareUI, H as HardwareUIWrapper } from "./HardwareUIWrapper-GDcuDfC2.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const HardwareUIPopout = () => {
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);
  const setCurrentInstrument = useInstrumentStore((s) => s.setCurrentInstrument);
  const currentInstrument = instruments.find((i) => i.id === currentInstrumentId) ?? null;
  const hwInstruments = instruments.filter((i) => hasHardwareUI(i.synthType));
  const hwIdx = hwInstruments.findIndex((i) => i.id === currentInstrumentId);
  const handlePrev = () => {
    if (hwInstruments.length === 0) return;
    const idx = (hwIdx - 1 + hwInstruments.length) % hwInstruments.length;
    setCurrentInstrument(hwInstruments[idx].id);
  };
  const handleNext = () => {
    if (hwInstruments.length === 0) return;
    const idx = (hwIdx + 1) % hwInstruments.length;
    setCurrentInstrument(hwInstruments[idx].id);
  };
  reactExports.useEffect(() => {
    if (currentInstrument) {
      const info = getSynthInfo(currentInstrument.synthType);
      document.title = `${info.shortName} — ${currentInstrument.name}`;
    }
  }, [currentInstrument == null ? void 0 : currentInstrument.id, currentInstrument == null ? void 0 : currentInstrument.name, currentInstrument == null ? void 0 : currentInstrument.synthType]);
  if (!currentInstrument || !hasHardwareUI(currentInstrument.synthType)) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center h-screen bg-dark-bg text-text-muted", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm", children: "No hardware UI available for this instrument" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
      lineNumber: 51,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
      lineNumber: 50,
      columnNumber: 7
    }, void 0);
  }
  const synthInfo = getSynthInfo(currentInstrument.synthType);
  const params = currentInstrument.parameters ?? {};
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg w-full h-screen flex flex-col overflow-hidden", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-3 py-2 border-b border-dark-border bg-dark-bgSecondary shrink-0", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: handlePrev, className: "p-1 rounded hover:bg-dark-bgTertiary text-text-muted hover:text-text-primary transition-colors", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronLeft, { size: 16 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
        lineNumber: 65,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
        lineNumber: 64,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `text-xs font-bold ${synthInfo.color}`, children: synthInfo.shortName }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
        lineNumber: 67,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm text-text-primary font-medium", children: currentInstrument.name }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
        lineNumber: 68,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted font-mono", children: [
        "(",
        hwIdx + 1,
        "/",
        hwInstruments.length,
        ")"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
        lineNumber: 69,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: handleNext, className: "p-1 rounded hover:bg-dark-bgTertiary text-text-muted hover:text-text-primary transition-colors", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronRight, { size: 16 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
        lineNumber: 73,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
        lineNumber: 72,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
      lineNumber: 63,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
      lineNumber: 62,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center overflow-hidden bg-black", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      HardwareUIWrapper,
      {
        synthType: currentInstrument.synthType,
        parameters: params,
        onParamChange: (key, value) => {
          updateInstrument(currentInstrument.id, {
            parameters: { ...params, [key]: value }
          });
        },
        instrumentId: currentInstrument.id
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
        lineNumber: 80,
        columnNumber: 9
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
      lineNumber: 79,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/HardwareUIPopout.tsx",
    lineNumber: 60,
    columnNumber: 5
  }, void 0);
};
export {
  HardwareUIPopout
};
