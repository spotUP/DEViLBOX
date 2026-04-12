const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { cY as DX7Synth, $ as getToneEngine, am as __vitePreload, W as CustomSelect } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./vendor-react-Dgd_wxYf.js";
const ParamSlider = ({ label, value, min = 0, max = 1, step = 0.01, displayValue, onChange, accentColor = "#d4a017" }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary text-[10px] w-20 shrink-0", children: label }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
    lineNumber: 41,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "input",
    {
      type: "range",
      min,
      max,
      step,
      value,
      onChange: (e) => onChange(Number(e.target.value)),
      className: "flex-1 h-1.5 appearance-none bg-dark-bgTertiary rounded cursor-pointer",
      style: {
        accentColor
      }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
      lineNumber: 42,
      columnNumber: 5
    },
    void 0
  ),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[10px] w-12 text-right font-mono", children: displayValue ?? `${Math.round(value * 100)}%` }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
    lineNumber: 54,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
  lineNumber: 40,
  columnNumber: 3
}, void 0);
const DX7Controls = ({ instrument, onChange }) => {
  var _a, _b, _c;
  const [manifest, setManifest] = reactExports.useState(null);
  const [selectedBank, setSelectedBank] = reactExports.useState(((_a = instrument.dx7) == null ? void 0 : _a.bank) ?? 0);
  const [selectedVoice, setSelectedVoice] = reactExports.useState(((_b = instrument.dx7) == null ? void 0 : _b.program) ?? 0);
  const [currentVoiceName, setCurrentVoiceName] = reactExports.useState("");
  const [loading, setLoading] = reactExports.useState(false);
  const fileInputRef = reactExports.useRef(null);
  const configRef = reactExports.useRef(instrument.dx7);
  const synthRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    configRef.current = instrument.dx7;
  }, [instrument.dx7]);
  reactExports.useEffect(() => {
    const cached = DX7Synth.getPatchManifest();
    if (cached) {
      setManifest(cached);
    } else {
      DX7Synth.fetchPatchManifest().then((m) => {
        if (m) setManifest(m);
      });
    }
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const engine = getToneEngine();
        console.log("[DX7Controls] Ensuring synth ready for id:", instrument.id);
        await engine.ensureInstrumentReady(instrument);
        if (cancelled) return;
        const key = engine.getInstrumentKey(instrument.id, -1);
        const synth = engine.instruments.get(key);
        console.log("[DX7Controls] After ensureReady: key=", key, "synth=", synth, "hasLoadSysex=", synth && "loadSysex" in synth, "mapSize=", engine.instruments.size);
        if (synth && "loadSysex" in synth) {
          synthRef.current = synth;
          console.log("[DX7Controls] Synth cached in ref, isReady=", synth.isReady, "_ready=", synth._ready);
        } else {
          const keys = [];
          engine.instruments.forEach((_v, k) => keys.push(`${k}(id=${k >>> 16})`));
          console.warn("[DX7Controls] Synth NOT found. Map keys:", keys.join(", "));
        }
      } catch (err) {
        console.warn("[DX7Controls] Failed to ensure synth ready:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instrument.id]);
  const getSynth = reactExports.useCallback(() => {
    if (synthRef.current) return synthRef.current;
    try {
      const engine = getToneEngine();
      const key = engine.getInstrumentKey(instrument.id, -1);
      const synth = engine.instruments.get(key);
      if (synth && "loadSysex" in synth) {
        synthRef.current = synth;
        return synthRef.current;
      }
      for (const [k, v] of engine.instruments) {
        if (k >>> 16 === instrument.id && v && "loadSysex" in v) {
          synthRef.current = v;
          return synthRef.current;
        }
      }
    } catch {
    }
    return null;
  }, [instrument.id]);
  const bankNames = reactExports.useMemo(() => {
    if (!manifest) return [];
    return manifest.banks.map((b, i) => {
      const firstName = b.voices[0] || "Unknown";
      const name = b.file.replace(".syx", "").toUpperCase();
      return { index: i, file: b.file, label: `${name} — ${firstName}...`, voices: b.voices };
    });
  }, [manifest]);
  const currentBank = manifest == null ? void 0 : manifest.banks[selectedBank];
  const selectPatch = reactExports.useCallback(async (bankIndex, voiceIndex) => {
    if (!manifest) return;
    const bank = manifest.banks[bankIndex];
    if (!bank) return;
    setLoading(true);
    setSelectedBank(bankIndex);
    setSelectedVoice(voiceIndex);
    setCurrentVoiceName(bank.voices[voiceIndex] || `Voice ${voiceIndex + 1}`);
    const synth = getSynth();
    if (synth == null ? void 0 : synth.loadPatchBank) {
      await synth.loadPatchBank(bank.file, voiceIndex);
    }
    onChange({ dx7: { ...configRef.current, bank: bankIndex, program: voiceIndex, vcedPreset: void 0 } });
    setLoading(false);
  }, [manifest, getSynth, onChange]);
  const selectVoiceInBank = reactExports.useCallback(async (voiceIndex) => {
    setSelectedVoice(voiceIndex);
    setCurrentVoiceName((currentBank == null ? void 0 : currentBank.voices[voiceIndex]) || `Voice ${voiceIndex + 1}`);
    const synth = getSynth();
    if (synth && currentBank) {
      await synth.loadPatchBank(currentBank.file, voiceIndex);
    }
    onChange({ dx7: { ...configRef.current, bank: selectedBank, program: voiceIndex, vcedPreset: void 0 } });
  }, [currentBank, selectedBank, getSynth, onChange]);
  const loadVcedPreset = reactExports.useCallback((name) => {
    setCurrentVoiceName(name);
    onChange({ dx7: { ...configRef.current, vcedPreset: name, bank: void 0, program: void 0 } });
  }, [onChange]);
  const handleVolumeChange = reactExports.useCallback((v) => {
    onChange({ volume: v });
  }, [onChange]);
  const handleFile = reactExports.useCallback(async (file) => {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const synth = getSynth();
    console.log("[DX7Controls] handleFile:", file.name, "size=", data.length, "synth=", synth);
    if ((data.length === 4104 || data.length === 4096) && synth) {
      if (data.length === 4096) {
        const sysex = new Uint8Array(4104);
        sysex[0] = 240;
        sysex[1] = 67;
        sysex[2] = 0;
        sysex[3] = 9;
        sysex[4] = 32;
        sysex[5] = 0;
        sysex.set(data, 6);
        let sum = 0;
        for (let i = 0; i < 4096; i++) sum += data[i];
        sysex[4102] = -sum & 127;
        sysex[4103] = 247;
        synth.loadSysex(sysex.buffer);
      } else {
        synth.loadSysex(buffer);
      }
      setCurrentVoiceName(`${file.name} (32 voices)`);
    } else if (data.length >= 155 && data.length <= 163 && synth) {
      const vcedStart = data[0] === 240 ? 6 : 0;
      const vcedData = data.subarray(vcedStart, vcedStart + 155);
      synth._loadVcedData(new Uint8Array(vcedData));
      setCurrentVoiceName(`${file.name} (single voice)`);
    } else if (!synth) {
      console.warn("[DX7Controls] No synth available for file loading");
    }
  }, [getSynth]);
  const [vcedNames, setVcedNames] = reactExports.useState([]);
  reactExports.useEffect(() => {
    __vitePreload(async () => {
      const { DX7_VCED_PRESETS } = await import("./main-BbV5VyEH.js").then((n) => n.iZ);
      return { DX7_VCED_PRESETS };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0).then(({ DX7_VCED_PRESETS }) => {
      setVcedNames(DX7_VCED_PRESETS.map((p) => p.name));
    });
  }, []);
  const volume = instrument.volume ?? -6;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 space-y-3 text-xs", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-black/60 border border-amber-500/40 rounded-lg p-3 font-mono", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-amber-500/60 text-[10px] uppercase tracking-wider", children: "Current Voice" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
          lineNumber: 234,
          columnNumber: 11
        }, void 0),
        loading && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-amber-300 animate-pulse text-[10px]", children: "Loading..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
          lineNumber: 235,
          columnNumber: 23
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
        lineNumber: 233,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-amber-400 text-lg font-bold tracking-wide", children: currentVoiceName || ((_c = instrument.dx7) == null ? void 0 : _c.vcedPreset) || "ROM Voice 1" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
        lineNumber: 237,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-amber-500/40 text-[10px] mt-1", children: currentBank ? `Bank: ${currentBank.file.replace(".syx", "").toUpperCase()} • Voice ${selectedVoice + 1}/32` : "Select a bank below" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
        lineNumber: 240,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
      lineNumber: 232,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-ft2-border rounded p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-ft2-highlight text-[10px] font-bold uppercase mb-2 tracking-wider", children: "Master" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
        lineNumber: 247,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        ParamSlider,
        {
          label: "Volume",
          value: volume,
          min: -40,
          max: 6,
          step: 0.5,
          displayValue: `${volume > 0 ? "+" : ""}${volume.toFixed(1)} dB`,
          onChange: handleVolumeChange
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
          lineNumber: 249,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
        lineNumber: 248,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
      lineNumber: 246,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-ft2-border rounded p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-ft2-highlight text-[10px] font-bold uppercase mb-2 tracking-wider", children: "Built-in Presets" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
        lineNumber: 263,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-1", children: vcedNames.map((name) => {
        var _a2;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => loadVcedPreset(name),
            className: `px-2 py-1.5 text-[10px] rounded transition-all truncate ${((_a2 = instrument.dx7) == null ? void 0 : _a2.vcedPreset) === name ? "bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/50" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgQuaternary hover:text-text-primary"}`,
            title: name,
            children: name
          },
          name,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
            lineNumber: 266,
            columnNumber: 13
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
        lineNumber: 264,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
      lineNumber: 262,
      columnNumber: 7
    }, void 0),
    manifest && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-ft2-border rounded p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-ft2-highlight text-[10px] font-bold uppercase mb-2 tracking-wider", children: [
        "Patch Banks (",
        manifest.banks.length,
        " banks • ",
        manifest.banks.length * 32,
        " voices)"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
        lineNumber: 285,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: String(selectedBank),
          onChange: (v) => selectPatch(Number(v), 0),
          options: bankNames.map((b) => ({ value: String(b.index), label: b.label })),
          className: "w-full bg-dark-bgSecondary text-text-primary border border-ft2-border rounded px-2 py-1.5 text-[11px] mb-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
          lineNumber: 290,
          columnNumber: 11
        },
        void 0
      ),
      currentBank && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-1", children: currentBank.voices.map((name, i) => {
        var _a2;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => selectVoiceInBank(i),
            className: `px-1.5 py-1 text-[9px] rounded transition-all truncate text-left ${selectedVoice === i && !((_a2 = instrument.dx7) == null ? void 0 : _a2.vcedPreset) ? "bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/50 font-bold" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgQuaternary hover:text-text-primary"}`,
            title: `${i + 1}. ${name}`,
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted mr-1", children: [
                i + 1,
                "."
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
                lineNumber: 311,
                columnNumber: 19
              }, void 0),
              name
            ]
          },
          i,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
            lineNumber: 301,
            columnNumber: 17
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
        lineNumber: 299,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
      lineNumber: 284,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "border border-dashed border-ft2-border rounded p-3 text-center hover:border-amber-500/50 transition-colors cursor-pointer",
        onDragOver: (e) => e.preventDefault(),
        onDrop: (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        },
        onClick: () => {
          var _a2;
          return (_a2 = fileInputRef.current) == null ? void 0 : _a2.click();
        },
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted text-[10px]", children: "Drop .SYX file here or click to browse" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
            lineNumber: 331,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted/50 text-[9px] mt-1", children: "Supports 32-voice bulk dumps (4104 bytes)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
            lineNumber: 334,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              ref: fileInputRef,
              type: "file",
              accept: ".syx,.SYX",
              onChange: (e) => {
                var _a2;
                const file = (_a2 = e.target.files) == null ? void 0 : _a2[0];
                if (file) handleFile(file);
                e.target.value = "";
              },
              style: { display: "none" }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
              lineNumber: 337,
              columnNumber: 9
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
        lineNumber: 321,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/controls/DX7Controls.tsx",
    lineNumber: 230,
    columnNumber: 5
  }, void 0);
};
export {
  DX7Controls,
  DX7Controls as default
};
