import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { bK as MODULAR_INIT_PATCH, cH as ModularToolbar, cI as ModularRackView, cJ as ModularCanvasView, cK as ModularMatrixView, cL as registerBuiltInModules } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
registerBuiltInModules();
const ModularSynthEditor = ({ config, onChange }) => {
  const patchConfig = config.modularSynth || MODULAR_INIT_PATCH;
  const handlePatchChange = reactExports.useCallback(
    (newPatch) => {
      onChange({
        ...config,
        modularSynth: newPatch
      });
    },
    [config, onChange]
  );
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full bg-dark-bg", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ModularToolbar, { config: patchConfig, onChange: handlePatchChange }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/synths/modular/ModularSynthEditor.tsx",
      lineNumber: 42,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-hidden", children: [
      patchConfig.viewMode === "rack" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ModularRackView, { config: patchConfig, onChange: handlePatchChange }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/synths/modular/ModularSynthEditor.tsx",
        lineNumber: 47,
        columnNumber: 11
      }, void 0),
      patchConfig.viewMode === "canvas" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ModularCanvasView, { config: patchConfig, onChange: handlePatchChange }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/synths/modular/ModularSynthEditor.tsx",
        lineNumber: 51,
        columnNumber: 11
      }, void 0),
      patchConfig.viewMode === "matrix" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ModularMatrixView, { config: patchConfig, onChange: handlePatchChange }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/synths/modular/ModularSynthEditor.tsx",
        lineNumber: 55,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/synths/modular/ModularSynthEditor.tsx",
      lineNumber: 45,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 px-4 py-1.5 bg-dark-bgSecondary border-t border-dark-border text-xs text-text-muted", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "Modules: ",
        patchConfig.modules.length
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/synths/modular/ModularSynthEditor.tsx",
        lineNumber: 61,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "Connections: ",
        patchConfig.connections.length
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/synths/modular/ModularSynthEditor.tsx",
        lineNumber: 62,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
        "Polyphony: ",
        patchConfig.polyphony
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/synths/modular/ModularSynthEditor.tsx",
        lineNumber: 63,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/synths/modular/ModularSynthEditor.tsx",
      lineNumber: 60,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/synths/modular/ModularSynthEditor.tsx",
    lineNumber: 40,
    columnNumber: 5
  }, void 0);
};
export {
  ModularSynthEditor as ModularSynthControls
};
