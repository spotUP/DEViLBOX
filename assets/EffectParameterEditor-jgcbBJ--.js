import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, V as Volume2, X, T as TriangleAlert } from "./vendor-ui-AJ7AT9BN.js";
import { N as NeuralParameterMapper } from "./NeuralParameterMapper-BKFi47j3.js";
import { g as getVisualEffectEditor, V as VisualEffectEditorWrapper, u as useEffectAnalyser, a as EffectOscilloscope } from "./index-CRvWC1pf.js";
import { aB as Knob } from "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { S as SectionHeader } from "./SectionHeader-DHk3L-9n.js";
const EffectParameterEditor = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
  onClose
}) => {
  reactExports.useMemo(() => {
    const EditorComponent = getVisualEffectEditor(effect.type);
    return EditorComponent.name !== "GenericEffectEditor";
  }, [effect.type]);
  const neuralParameters = reactExports.useMemo(() => {
    if (effect.category !== "neural" || effect.neuralModelIndex === void 0) {
      return null;
    }
    const mapper = new NeuralParameterMapper(effect.neuralModelIndex);
    const neuralParams = mapper.getAvailableParameters();
    return neuralParams.map((param) => ({
      name: param.name,
      key: param.key,
      min: 0,
      max: 100,
      step: 1,
      unit: param.unit || "%",
      defaultValue: param.default,
      implemented: param.implemented
    }));
  }, [effect.category, effect.neuralModelIndex]);
  if (neuralParameters) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      NeuralEffectEditor,
      {
        effect,
        parameters: neuralParameters,
        onUpdateParameter,
        onUpdateWet,
        onClose
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
        lineNumber: 80,
        columnNumber: 7
      },
      void 0
    );
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    VisualEffectEditorWrapper,
    {
      effect,
      onUpdateParameter,
      onUpdateWet,
      onClose
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
      lineNumber: 95,
      columnNumber: 5
    },
    void 0
  );
};
const NEURAL_SHADOW = [
  "0 6px 16px rgba(0,0,0,0.5)",
  "0 2px 4px rgba(0,0,0,0.7)",
  "inset 0 1px 0 rgba(255,255,255,0.06)",
  "inset 0 -1px 0 rgba(0,0,0,0.4)"
].join(", ");
const NeuralEffectEditor = ({
  effect,
  parameters,
  onUpdateParameter,
  onUpdateWet,
  onClose
}) => {
  const getParameterValue = (param) => {
    const value = effect.parameters[param.key] ?? param.defaultValue;
    return typeof value === "number" ? value : param.defaultValue;
  };
  const { pre, post } = useEffectAnalyser(effect.id, "waveform");
  const implementedParams = parameters.filter((p) => p.implemented !== false);
  const unimplementedParams = parameters.filter((p) => p.implemented === false);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "synth-editor-container rounded-xl overflow-hidden select-none",
      style: {
        background: "linear-gradient(170deg, #1a0a20 0%, #100618 100%)",
        border: "2px solid #281430",
        boxShadow: NEURAL_SHADOW
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "px-5 py-4 flex items-center justify-between",
            style: {
              background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)",
              borderBottom: "1px solid #281430"
            },
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "div",
                  {
                    className: "p-2 rounded-lg",
                    style: {
                      background: "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.15))",
                      border: "1px solid rgba(168,85,247,0.2)",
                      boxShadow: "0 0 12px rgba(168,85,247,0.1)"
                    },
                    children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Volume2, { size: 18, className: "text-text-primary" }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                      lineNumber: 171,
                      columnNumber: 13
                    }, void 0)
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                    lineNumber: 163,
                    columnNumber: 11
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-base font-black text-text-primary tracking-wide", children: effect.type }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                    lineNumber: 174,
                    columnNumber: 13
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mt-0.5", children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      "div",
                      {
                        style: {
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          backgroundColor: effect.enabled ? "#c084fc" : "#1a0a20",
                          boxShadow: effect.enabled ? "0 0 4px 1px rgba(192,132,252,0.5), 0 0 10px 3px rgba(192,132,252,0.15)" : "inset 0 1px 2px rgba(0,0,0,0.5)",
                          transition: "all 0.3s ease"
                        }
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                        lineNumber: 177,
                        columnNumber: 15
                      },
                      void 0
                    ),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[11px] text-text-secondary font-medium", children: [
                      "Neural Effect | ",
                      effect.enabled ? "Active" : "Bypassed"
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                      lineNumber: 189,
                      columnNumber: 15
                    }, void 0)
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                    lineNumber: 175,
                    columnNumber: 13
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                  lineNumber: 173,
                  columnNumber: 11
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                lineNumber: 162,
                columnNumber: 9
              }, void 0),
              onClose && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: onClose,
                  className: "p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 16 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                    lineNumber: 200,
                    columnNumber: 13
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                  lineNumber: 196,
                  columnNumber: 11
                },
                void 0
              )
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
            lineNumber: 155,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EffectOscilloscope, { pre, post, color: "#a855f7" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
            lineNumber: 208,
            columnNumber: 9
          }, void 0),
          implementedParams.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#a855f7", title: "Parameters" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
              lineNumber: 213,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap justify-around gap-4", children: implementedParams.map((param) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                value: getParameterValue(param),
                min: param.min,
                max: param.max,
                onChange: (v) => onUpdateParameter(param.key, v),
                label: param.name,
                size: "sm",
                color: "#a855f7",
                formatValue: (v) => `${Math.round(v)}${param.unit}`
              },
              param.key,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                lineNumber: 216,
                columnNumber: 17
              },
              void 0
            )) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
              lineNumber: 214,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
            lineNumber: 212,
            columnNumber: 11
          }, void 0),
          unimplementedParams.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark opacity-50", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-4", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TriangleAlert, { size: 14, className: "text-yellow-500" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                lineNumber: 236,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-[11px] font-black text-yellow-500/80 uppercase tracking-[0.15em]", children: "Coming Soon" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                lineNumber: 237,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
              lineNumber: 235,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap justify-around gap-4", children: unimplementedParams.map((param) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                value: getParameterValue(param),
                min: param.min,
                max: param.max,
                onChange: () => {
                },
                label: param.name,
                size: "sm",
                color: "#6b7280",
                formatValue: (v) => `${Math.round(v)}${param.unit}`
              },
              param.key,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                lineNumber: 243,
                columnNumber: 17
              },
              void 0
            )) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
              lineNumber: 241,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
            lineNumber: 234,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SectionHeader, { size: "lg", color: "#ec4899", title: "Output" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
              lineNumber: 261,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Knob,
              {
                value: effect.wet,
                min: 0,
                max: 100,
                onChange: onUpdateWet,
                label: "Mix",
                size: "lg",
                color: "#ec4899",
                formatValue: (v) => `${Math.round(v)}%`
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
                lineNumber: 263,
                columnNumber: 13
              },
              void 0
            ) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
              lineNumber: 262,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
            lineNumber: 260,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "rounded-lg p-3 border border-dark-border bg-black/20", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[11px] text-text-muted leading-relaxed", children: "Neural effects use machine learning models for authentic amp/pedal emulation. Changes are applied in real-time." }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
            lineNumber: 278,
            columnNumber: 11
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
            lineNumber: 277,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
          lineNumber: 206,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/effects/EffectParameterEditor.tsx",
      lineNumber: 146,
      columnNumber: 5
    },
    void 0
  );
};
export {
  EffectParameterEditor as E
};
