import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
const INSED = {
  VOLUME: 0,
  WAVELENGTH: 1,
  ATTACK_FRAMES: 2,
  ATTACK_VOLUME: 3,
  DECAY_FRAMES: 4,
  DECAY_VOLUME: 5,
  SUSTAIN_FRAMES: 6,
  RELEASE_FRAMES: 7,
  RELEASE_VOLUME: 8,
  VIBRATO_DELAY: 9,
  VIBRATO_DEPTH: 10,
  VIBRATO_SPEED: 11,
  SQUARE_LOWER: 12,
  SQUARE_UPPER: 13,
  SQUARE_SPEED: 14,
  FILTER_LOWER: 15,
  FILTER_UPPER: 16,
  FILTER_SPEED: 17,
  PERF_SPEED: 18,
  PERF_LENGTH: 19,
  HARDCUT_FRAMES: 20,
  HARDCUT_RELEASE: 21
};
function configToBuffer(c) {
  var _a, _b;
  const entries = ((_a = c.performanceList) == null ? void 0 : _a.entries) ?? [];
  const buf = new Uint8Array(22 + entries.length * 5);
  buf[0] = c.volume;
  buf[1] = c.waveLength;
  buf[2] = c.envelope.aFrames;
  buf[3] = c.envelope.aVolume;
  buf[4] = c.envelope.dFrames;
  buf[5] = c.envelope.dVolume;
  buf[6] = c.envelope.sFrames;
  buf[7] = c.envelope.rFrames;
  buf[8] = c.envelope.rVolume;
  buf[9] = c.vibratoDelay;
  buf[10] = c.vibratoDepth;
  buf[11] = c.vibratoSpeed;
  buf[12] = c.squareLowerLimit;
  buf[13] = c.squareUpperLimit;
  buf[14] = c.squareSpeed;
  buf[15] = c.filterLowerLimit;
  buf[16] = c.filterUpperLimit;
  buf[17] = c.filterSpeed;
  buf[18] = ((_b = c.performanceList) == null ? void 0 : _b.speed) ?? 1;
  buf[19] = entries.length;
  buf[20] = c.hardCutReleaseFrames;
  buf[21] = c.hardCutRelease ? 1 : 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const off = 22 + i * 5;
    buf[off] = e.note;
    buf[off + 1] = e.waveform & 127 | (e.fixed ? 1 : 0) << 7;
    buf[off + 2] = (e.fx[0] & 15) << 4 | e.fx[1] & 15;
    buf[off + 3] = e.fxParam[0];
    buf[off + 4] = e.fxParam[1];
  }
  return buf;
}
function applyParamToConfig(config, paramId, value) {
  const c = {
    ...config,
    envelope: { ...config.envelope },
    performanceList: { ...config.performanceList }
  };
  switch (paramId) {
    case INSED.VOLUME:
      c.volume = value;
      break;
    case INSED.WAVELENGTH:
      c.waveLength = value;
      break;
    case INSED.ATTACK_FRAMES:
      c.envelope.aFrames = value;
      break;
    case INSED.ATTACK_VOLUME:
      c.envelope.aVolume = value;
      break;
    case INSED.DECAY_FRAMES:
      c.envelope.dFrames = value;
      break;
    case INSED.DECAY_VOLUME:
      c.envelope.dVolume = value;
      break;
    case INSED.SUSTAIN_FRAMES:
      c.envelope.sFrames = value;
      break;
    case INSED.RELEASE_FRAMES:
      c.envelope.rFrames = value;
      break;
    case INSED.RELEASE_VOLUME:
      c.envelope.rVolume = value;
      break;
    case INSED.VIBRATO_DELAY:
      c.vibratoDelay = value;
      break;
    case INSED.VIBRATO_DEPTH:
      c.vibratoDepth = value;
      break;
    case INSED.VIBRATO_SPEED:
      c.vibratoSpeed = value;
      break;
    case INSED.SQUARE_LOWER:
      c.squareLowerLimit = value;
      break;
    case INSED.SQUARE_UPPER:
      c.squareUpperLimit = value;
      break;
    case INSED.SQUARE_SPEED:
      c.squareSpeed = value;
      break;
    case INSED.FILTER_LOWER:
      c.filterLowerLimit = value;
      break;
    case INSED.FILTER_UPPER:
      c.filterUpperLimit = value;
      break;
    case INSED.FILTER_SPEED:
      c.filterSpeed = value;
      break;
    case INSED.PERF_SPEED:
      c.performanceList.speed = value;
      break;
    case INSED.PERF_LENGTH:
      break;
    case INSED.HARDCUT_FRAMES:
      c.hardCutReleaseFrames = value;
      break;
    case INSED.HARDCUT_RELEASE:
      c.hardCutRelease = value !== 0;
      break;
  }
  return c;
}
function applyPlistToConfig(config, index, note, waveform, fixed, fx0, fp0, fx1, fp1) {
  var _a;
  const entries = [...((_a = config.performanceList) == null ? void 0 : _a.entries) ?? []];
  while (entries.length <= index) {
    entries.push({ note: 0, waveform: 0, fixed: false, fx: [0, 0], fxParam: [0, 0] });
  }
  entries[index] = {
    note,
    waveform,
    fixed: fixed !== 0,
    fx: [fx0, fx1],
    fxParam: [fp0, fp1]
  };
  return {
    ...config,
    performanceList: { ...config.performanceList, entries }
  };
}
const HivelyHardware = ({ config, onChange }) => {
  const configRef = reactExports.useRef(config);
  const moduleRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const containerRef = reactExports.useRef(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  reactExports.useEffect(() => {
    const mod = moduleRef.current;
    if (!mod || !loaded) return;
    const buf = configToBuffer(config);
    const ptr = mod._malloc(buf.length);
    if (!ptr) return;
    mod.HEAPU8.set(buf, ptr);
    mod._insed_load_from_buffer(ptr, buf.length);
    mod._free(ptr);
  }, [config, loaded]);
  const onChangeRef = reactExports.useRef(onChange);
  reactExports.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  reactExports.useEffect(() => {
    let cancelled = false;
    let mod = null;
    async function init() {
      try {
        const canvas = document.createElement("canvas");
        canvas.id = "canvas";
        canvas.width = 800;
        canvas.height = 480;
        canvas.style.width = "800px";
        canvas.style.height = "480px";
        canvas.style.display = "none";
        canvas.tabIndex = 0;
        if (containerRef.current && !cancelled) {
          containerRef.current.appendChild(canvas);
          canvasRef.current = canvas;
        }
        const factory = await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "/hively/HivelyInsEd.js";
          script.onload = () => {
            const fn = window.createHivelyInsEd;
            if (typeof fn === "function") {
              resolve(fn);
            } else {
              reject(new Error("createHivelyInsEd not found after script load"));
            }
          };
          script.onerror = () => reject(new Error("Failed to load HivelyInsEd.js"));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        mod = await factory({ canvas });
        moduleRef.current = mod;
        mod.onParamChange = (paramId, value) => {
          const updated = applyParamToConfig(configRef.current, paramId, value);
          configRef.current = updated;
          onChangeRef.current(updated);
        };
        mod.onPlistChange = (index, note, waveform, fixed, fx0, fp0, fx1, fp1) => {
          const updated = applyPlistToConfig(
            configRef.current,
            index,
            note,
            waveform,
            fixed,
            fx0,
            fp0,
            fx1,
            fp1
          );
          configRef.current = updated;
          onChangeRef.current(updated);
        };
        mod.onPlistLengthChange = (newLength) => {
          var _a;
          const entries = [...((_a = configRef.current.performanceList) == null ? void 0 : _a.entries) ?? []];
          while (entries.length > newLength) entries.pop();
          while (entries.length < newLength) {
            entries.push({ note: 0, waveform: 0, fixed: false, fx: [0, 0], fxParam: [0, 0] });
          }
          const updated = {
            ...configRef.current,
            performanceList: { ...configRef.current.performanceList, entries }
          };
          configRef.current = updated;
          onChangeRef.current(updated);
        };
        mod._insed_init(800, 480);
        const buf = configToBuffer(configRef.current);
        const ptr = mod._malloc(buf.length);
        if (ptr) {
          mod.HEAPU8.set(buf, ptr);
          mod._insed_load_from_buffer(ptr, buf.length);
          mod._free(ptr);
        }
        mod._insed_start();
        if (!cancelled) {
          canvas.style.display = "block";
          setLoaded(true);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }
    init();
    return () => {
      cancelled = true;
      if (mod) {
        try {
          mod._insed_shutdown();
        } catch {
        }
      }
      if (canvasRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(canvasRef.current);
        } catch {
        }
        canvasRef.current = null;
      }
      moduleRef.current = null;
    };
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "hively-hardware-container flex flex-col items-start", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        ref: containerRef,
        className: "relative bg-black overflow-auto",
        style: { maxWidth: "100%" },
        onClick: () => {
          var _a;
          return (_a = canvasRef.current) == null ? void 0 : _a.focus();
        },
        onMouseEnter: () => {
          var _a;
          return (_a = canvasRef.current) == null ? void 0 : _a.focus();
        },
        children: !loaded && !error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "flex items-center justify-center text-text-secondary",
            style: { width: 800, height: 480 },
            children: "Loading instrument editor..."
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HivelyHardware.tsx",
            lineNumber: 336,
            columnNumber: 11
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HivelyHardware.tsx",
        lineNumber: 328,
        columnNumber: 7
      },
      void 0
    ),
    error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-red-400 text-sm mt-2 text-center self-center", children: [
      "Failed to load hardware UI: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HivelyHardware.tsx",
      lineNumber: 345,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/HivelyHardware.tsx",
    lineNumber: 326,
    columnNumber: 5
  }, void 0);
};
export {
  HivelyHardware
};
