import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cW as GeonkickEngine, cX as applyGeonkickPreset } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const PRESETS_BASE = (() => {
  const baseUrl = "/";
  return `${baseUrl}geonkick/presets/`;
})();
let manifestCache = null;
async function fetchManifest() {
  if (manifestCache) return manifestCache;
  const resp = await fetch(`${PRESETS_BASE}manifest.json`);
  if (!resp.ok) throw new Error("preset manifest fetch failed");
  manifestCache = await resp.json();
  return manifestCache;
}
async function fetchPresetJson(file) {
  const resp = await fetch(`${PRESETS_BASE}${file}`);
  if (!resp.ok) throw new Error(`preset fetch failed: ${file}`);
  return await resp.json();
}
const GeonkickControls = ({ config, onChange }) => {
  const [manifest, setManifest] = reactExports.useState(null);
  const [selectedBundle, setSelectedBundle] = reactExports.useState(() => {
    var _a;
    return ((_a = config.name) == null ? void 0 : _a.split(" / ")[0]) ?? "";
  });
  const [loading, setLoading] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  reactExports.useEffect(() => {
    fetchManifest().then((m) => {
      setManifest(m);
      if (!selectedBundle && m.bundles.length > 0) {
        setSelectedBundle(m.bundles[0].name);
      }
    }).catch((err) => setError(String(err)));
  }, []);
  const currentBundle = reactExports.useMemo(
    () => manifest == null ? void 0 : manifest.bundles.find((b) => b.name === selectedBundle),
    [manifest, selectedBundle]
  );
  const loadPreset = reactExports.useCallback(
    async (entry) => {
      setLoading(true);
      setError(null);
      try {
        const preset = await fetchPresetJson(entry.file);
        const engine = GeonkickEngine.getInstance();
        await engine.ready();
        applyGeonkickPreset(engine, preset);
        onChange({
          preset,
          name: `${selectedBundle} / ${entry.name}`
        });
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [onChange, selectedBundle]
  );
  const audition = reactExports.useCallback(() => {
    const engine = GeonkickEngine.getInstance();
    engine.triggerNote(69, 127);
  }, []);
  if (error) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 text-accent-error text-sm", children: [
      "Error: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
      lineNumber: 112,
      columnNumber: 7
    }, void 0);
  }
  if (!manifest) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 text-text-muted text-sm", children: "Loading Geonkick presets…" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
      lineNumber: 119,
      columnNumber: 12
    }, void 0);
  }
  const currentPresetFile = (() => {
    var _a, _b;
    const nameParts = (_a = config.name) == null ? void 0 : _a.split(" / ");
    if (!nameParts || nameParts.length !== 2) return null;
    return ((_b = currentBundle == null ? void 0 : currentBundle.presets.find((p) => p.name === nameParts[1])) == null ? void 0 : _b.file) ?? null;
  })();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col h-full bg-gradient-to-b from-[#1e1e1e] to-[#151515]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-3 border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] uppercase tracking-wider text-text-muted", children: "Geonkick" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
          lineNumber: 133,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm text-accent-primary font-mono", children: config.name ?? "default kick (no preset)" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
          lineNumber: 134,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
        lineNumber: 132,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: audition,
          disabled: loading,
          className: "px-4 py-2 text-xs font-bold uppercase tracking-wider rounded bg-accent-primary/20 text-accent-primary border border-accent-primary/40 hover:bg-accent-primary/30 disabled:opacity-50",
          children: "Audition"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
          lineNumber: 138,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
      lineNumber: 131,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 px-4 py-2 border-b border-dark-border flex-wrap", children: manifest.bundles.map((b) => {
      const active = b.name === selectedBundle;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setSelectedBundle(b.name),
          className: `px-3 py-1 text-[11px] font-bold rounded border ${active ? "bg-accent-primary/20 text-accent-primary border-accent-primary/40" : "bg-[#1a1a1a] text-text-muted border-dark-borderLight hover:text-text-secondary"}`,
          children: [
            b.name,
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-1 text-[9px] opacity-60", children: b.presets.length }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
              lineNumber: 162,
              columnNumber: 15
            }, void 0)
          ]
        },
        b.name,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
          lineNumber: 152,
          columnNumber: 13
        },
        void 0
      );
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
      lineNumber: 148,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto p-4", children: currentBundle ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2", children: currentBundle.presets.map((entry) => {
      const active = currentPresetFile === entry.file;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => loadPreset(entry),
          disabled: loading,
          className: `px-3 py-2 text-left text-xs rounded border transition-colors ${active ? "bg-accent-primary/20 text-accent-primary border-accent-primary/40" : "bg-[#1a1a1a] text-text-secondary border-dark-borderLight hover:border-accent-primary/40"} disabled:opacity-50`,
          children: entry.name
        },
        entry.file,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
          lineNumber: 175,
          columnNumber: 17
        },
        void 0
      );
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
      lineNumber: 171,
      columnNumber: 11
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted text-sm", children: "Select a bundle." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
      lineNumber: 191,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
      lineNumber: 169,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/GeonkickControls.tsx",
    lineNumber: 129,
    columnNumber: 5
  }, void 0);
};
export {
  GeonkickControls
};
