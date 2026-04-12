import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, G as Globe, h as ChevronDown, a7 as RefreshCw, a8 as CircleAlert, k as SlidersVertical } from "./vendor-ui-AJ7AT9BN.js";
import { $ as getToneEngine, br as WAMSynth, cM as WAM_SYNTH_PLUGINS, W as CustomSelect } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const WAMControls = ({
  instrument,
  onChange
}) => {
  var _a, _b, _c, _d, _e;
  const [url, setUrl] = reactExports.useState(((_a = instrument.wam) == null ? void 0 : _a.moduleUrl) || "");
  const [isLoading, setIsLoading] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [fallbackParams, setFallbackParams] = reactExports.useState(null);
  const [paramValues, setParamValues] = reactExports.useState({});
  const [hasNativeGui, setHasNativeGui] = reactExports.useState(false);
  const [pluginWarning, setPluginWarning] = reactExports.useState(null);
  const guiContainerRef = reactExports.useRef(null);
  const engine = getToneEngine();
  const handleParamChange = reactExports.useCallback((id, value) => {
    setParamValues((prev) => ({ ...prev, [id]: value }));
    const synth = engine.getInstrument(instrument.id, instrument, -1);
    if (synth instanceof WAMSynth) {
      synth.setParameter(id, value);
    }
  }, [engine, instrument]);
  reactExports.useEffect(() => {
    let isMounted = true;
    let currentGui = null;
    let resizeObserver = null;
    const mountGui = async () => {
      var _a2, _b2, _c2;
      if (!guiContainerRef.current) return;
      guiContainerRef.current.innerHTML = "";
      setFallbackParams(null);
      setHasNativeGui(false);
      setPluginWarning(null);
      if (!((_a2 = instrument.wam) == null ? void 0 : _a2.moduleUrl)) {
        console.log("[WAMControls] No URL provided yet");
        return;
      }
      try {
        console.log(`[WAMControls] Attempting to mount GUI for ${instrument.wam.moduleUrl}`);
        setIsLoading(true);
        setError(null);
        const synth = engine.getInstrument(instrument.id, instrument, -1);
        if (!(synth instanceof WAMSynth)) {
          const errorMsg = `Instrument ${instrument.id} is not a WAMSynth (got ${synth == null ? void 0 : synth.constructor.name})`;
          console.warn("[WAMControls]", errorMsg);
          setError(errorMsg);
          return;
        }
        console.log("[WAMControls] Waiting for WAM initialization...");
        await synth.ensureInitialized();
        if (!isMounted) return;
        const desc = synth.descriptor;
        const declaredNoGui = desc && /no gui/i.test(String(desc.name || ""));
        console.log("[WAMControls] Creating native GUI...");
        const gui = declaredNoGui ? null : await synth.createGui();
        if (gui && isMounted && guiContainerRef.current) {
          console.log("[WAMControls] GUI created, mounting to DOM");
          currentGui = gui;
          setHasNativeGui(true);
          guiContainerRef.current.appendChild(gui);
          let guiNaturalW = 0, guiNaturalH = 0;
          const scaleToFit = () => {
            const container = guiContainerRef.current;
            if (!container || !gui) return;
            gui.style.transform = "";
            gui.style.position = "";
            gui.style.left = "";
            gui.style.top = "";
            const w = gui.offsetWidth || gui.scrollWidth || gui.clientWidth;
            const h = gui.offsetHeight || gui.scrollHeight || gui.clientHeight;
            if (!w || !h) return;
            guiNaturalW = w;
            guiNaturalH = h;
            const cw = container.clientWidth;
            const ch = container.clientHeight;
            if (!cw || !ch) return;
            const scale = Math.min(cw / guiNaturalW, ch / guiNaturalH);
            const scaledW = guiNaturalW * scale;
            const scaledH = guiNaturalH * scale;
            gui.style.position = "absolute";
            gui.style.transformOrigin = "top left";
            gui.style.transform = `scale(${scale})`;
            gui.style.left = `${(cw - scaledW) / 2}px`;
            gui.style.top = `${(ch - scaledH) / 2}px`;
          };
          resizeObserver = new ResizeObserver(scaleToFit);
          resizeObserver.observe(guiContainerRef.current);
          requestAnimationFrame(scaleToFit);
          setTimeout(scaleToFit, 300);
          setTimeout(scaleToFit, 800);
          setTimeout(scaleToFit, 1500);
          if (synth.pluginType === "effect") {
            setPluginWarning(
              `"${((_b2 = synth.descriptor) == null ? void 0 : _b2.name) || "This plugin"}" is an audio effect. A built-in tone generator feeds audio through it so you can play it from the keyboard.`
            );
          }
        } else if (isMounted) {
          console.warn("[WAMControls] Plugin did not provide a usable GUI, trying parameter discovery");
          try {
            const params = await synth.getParameters();
            if (params && Object.keys(params).length > 0 && isMounted) {
              setFallbackParams(params);
              const initialValues = {};
              Object.entries(params).forEach(([id, info]) => {
                initialValues[id] = info.defaultValue ?? info.minValue ?? 0;
              });
              setParamValues(initialValues);
            } else if (isMounted && guiContainerRef.current) {
              const pluginName = ((_c2 = synth.descriptor) == null ? void 0 : _c2.name) || "This plugin";
              guiContainerRef.current.innerHTML = `<div class="text-text-muted text-sm p-6 text-center"><p class="font-semibold mb-2">${pluginName}</p><p class="text-xs italic">This plugin does not provide a GUI or discoverable parameters.<br/>It can still be played from the keyboard.</p></div>`;
            }
          } catch (paramErr) {
            console.warn("[WAMControls] Parameter discovery failed:", paramErr);
            if (isMounted && guiContainerRef.current) {
              guiContainerRef.current.innerHTML = '<div class="text-text-muted text-xs p-4 italic">Plugin does not provide a native GUI</div>';
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[WAMControls] Failed to load GUI:", err);
        if (isMounted) setError(msg);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    mountGui();
    return () => {
      isMounted = false;
      resizeObserver == null ? void 0 : resizeObserver.disconnect();
      if (currentGui && currentGui.parentElement) {
        currentGui.parentElement.removeChild(currentGui);
      }
    };
  }, [instrument.id, (_b = instrument.wam) == null ? void 0 : _b.moduleUrl, engine]);
  const handleUrlSubmit = (e) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    onChange({
      wam: {
        ...instrument.wam,
        moduleUrl: trimmedUrl,
        pluginState: null
        // Reset state on URL change
      }
    });
    engine.invalidateInstrument(instrument.id);
  };
  const loadPlugin = reactExports.useCallback((pluginUrl) => {
    setUrl(pluginUrl);
    onChange({
      wam: {
        ...instrument.wam,
        moduleUrl: pluginUrl,
        pluginState: null
      }
    });
    engine.invalidateInstrument(instrument.id);
  }, [instrument, onChange, engine]);
  const handlePluginSelect = reactExports.useCallback((selectedUrl) => {
    if (!selectedUrl) return;
    loadPlugin(selectedUrl);
  }, [loadPlugin]);
  const isNamedWAM = ["WAMOBXd", "WAMSynth101", "WAMTinySynth", "WAMFaustFlute"].includes(instrument.synthType);
  const groupedPlugins = WAM_SYNTH_PLUGINS.filter((p) => p.type === "instrument").reduce((acc, p) => {
    const groupKey = "Synthesizers";
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(p);
    return acc;
  }, {});
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full bg-dark-bgSecondary p-4 space-y-4 overflow-hidden", children: [
    !isNamedWAM && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
          lineNumber: 242,
          columnNumber: 13
        }, void 0),
        "Web Audio Module"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 241,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: ((_c = instrument.wam) == null ? void 0 : _c.moduleUrl) || "",
          onChange: handlePluginSelect,
          disabled: isLoading,
          className: "w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors cursor-pointer disabled:opacity-50",
          placeholder: "Select a WAM plugin...",
          options: Object.entries(groupedPlugins).map(([group, plugins]) => ({
            label: group,
            options: plugins.map((p) => ({
              value: p.url,
              label: `${p.name} — ${p.description}`
            }))
          }))
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
          lineNumber: 248,
          columnNumber: 13
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 247,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("details", { className: "group", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("summary", { className: "text-[10px] text-text-muted cursor-pointer hover:text-text-secondary select-none flex items-center gap-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 10, className: "group-open:rotate-180 transition-transform" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
            lineNumber: 267,
            columnNumber: 15
          }, void 0),
          "Custom URL"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
          lineNumber: 266,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2 space-y-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("form", { onSubmit: handleUrlSubmit, className: "flex gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "text",
                value: url,
                onChange: (e) => setUrl(e.target.value),
                placeholder: "https://example.com/my-wam-plugin/index.js",
                className: "flex-1 bg-dark-bg border border-dark-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
                lineNumber: 272,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                type: "submit",
                disabled: isLoading,
                className: "bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-50 text-text-inverse px-4 py-1.5 rounded text-sm font-bold transition-all flex items-center gap-2",
                children: isLoading ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RefreshCw, { size: 14, className: "animate-spin" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
                  lineNumber: 284,
                  columnNumber: 32
                }, void 0) : "LOAD"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
                lineNumber: 279,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
            lineNumber: 271,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] text-text-muted italic", children: [
            "Enter any WAM 2.0 module URL. Browse more at",
            " ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("a", { href: "https://www.webaudiomodules.com/", target: "_blank", rel: "noreferrer", className: "text-accent-primary hover:underline", children: "webaudiomodules.com" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
              lineNumber: 289,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
            lineNumber: 287,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
          lineNumber: 270,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 265,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
      lineNumber: 240,
      columnNumber: 9
    }, void 0),
    error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-accent-error/10 border border-accent-error/30 rounded-lg p-4 flex items-start gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CircleAlert, { size: 18, className: "text-accent-error flex-shrink-0 mt-0.5" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 299,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h4", { className: "text-sm font-bold text-accent-error uppercase", children: "Loading Error" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
          lineNumber: 301,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary mt-1 select-text cursor-text", children: error }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
          lineNumber: 302,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 300,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
      lineNumber: 298,
      columnNumber: 9
    }, void 0),
    pluginWarning && !error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2.5 flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CircleAlert, { size: 14, className: "text-blue-400 flex-shrink-0" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 310,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-secondary", children: pluginWarning }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 311,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
      lineNumber: 309,
      columnNumber: 9
    }, void 0),
    isLoading && !error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex flex-col items-center justify-center gap-3 bg-dark-bg/20 rounded-xl border border-dark-border border-dashed", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RefreshCw, { size: 32, className: "text-accent-primary animate-spin" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 318,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-text-muted font-mono animate-pulse", children: "Initializing Web Audio Module..." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 319,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
      lineNumber: 317,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: `flex-1 flex flex-col min-h-0 ${!isLoading && !error && ((_d = instrument.wam) == null ? void 0 : _d.moduleUrl) && (hasNativeGui || !fallbackParams) ? "" : "hidden"}`,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold text-text-muted uppercase", children: "Plugin Interface" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
              lineNumber: 330,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => engine.invalidateInstrument(instrument.id),
                className: "text-[10px] text-text-muted hover:text-text-primary flex items-center gap-1",
                children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RefreshCw, { size: 10 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
                    lineNumber: 335,
                    columnNumber: 13
                  }, void 0),
                  " Reload"
                ]
              },
              void 0,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
                lineNumber: 331,
                columnNumber: 11
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
            lineNumber: 329,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              ref: guiContainerRef,
              className: "flex-1 bg-black rounded-lg border border-dark-border overflow-x-hidden overflow-y-auto relative min-h-[300px]"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
              lineNumber: 338,
              columnNumber: 9
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 324,
        columnNumber: 7
      },
      void 0
    ),
    fallbackParams && !hasNativeGui && !isLoading && !error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex flex-col min-h-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold text-text-muted uppercase flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersVertical, { size: 12 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
            lineNumber: 349,
            columnNumber: 15
          }, void 0),
          "Plugin Parameters"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
          lineNumber: 348,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => engine.invalidateInstrument(instrument.id),
            className: "text-[10px] text-text-muted hover:text-text-primary flex items-center gap-1",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RefreshCw, { size: 10 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
                lineNumber: 356,
                columnNumber: 15
              }, void 0),
              " Reload"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
            lineNumber: 352,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 347,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-auto space-y-1.5 p-3 bg-dark-bg rounded-lg border border-dark-border", children: Object.entries(fallbackParams).map(([id, info]) => {
        const min = info.minValue ?? 0;
        const max = info.maxValue ?? 1;
        const step = max - min > 10 ? 1 : 0.01;
        const value = paramValues[id] ?? info.defaultValue ?? min;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs text-text-secondary w-32 truncate", title: info.label || id, children: info.label || id }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
            lineNumber: 367,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min,
              max,
              step,
              value,
              onChange: (e) => handleParamChange(id, parseFloat(e.target.value)),
              className: "flex-1 accent-accent-primary h-1.5"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
              lineNumber: 370,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted w-12 text-right font-mono", children: value.toFixed(2) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
            lineNumber: 379,
            columnNumber: 19
          }, void 0)
        ] }, id, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
          lineNumber: 366,
          columnNumber: 17
        }, void 0);
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 359,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
      lineNumber: 346,
      columnNumber: 9
    }, void 0),
    !((_e = instrument.wam) == null ? void 0 : _e.moduleUrl) && !isLoading && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex flex-col items-center justify-center gap-4 text-center p-8 bg-dark-bg/10 rounded-xl border border-dark-border border-dashed", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 rounded-full bg-dark-bgTertiary text-text-muted", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 48 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 393,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 392,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-lg font-bold text-text-primary", children: "No WAM Loaded" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
          lineNumber: 396,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-text-muted max-w-xs mx-auto mt-2", children: "Web Audio Modules are external plugins. Enter a URL above to load a synthesizer or effect." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
          lineNumber: 397,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
        lineNumber: 395,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
      lineNumber: 391,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/WAMControls.tsx",
    lineNumber: 237,
    columnNumber: 5
  }, void 0);
};
export {
  WAMControls
};
