import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { S as SDLHardwareWrapper } from "./HardwareUIWrapper-GDcuDfC2.js";
import "./vendor-react-Dgd_wxYf.js";
import "./main-BbV5VyEH.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MACRO_TYPE = {
  VOL: 0,
  ARP: 1,
  DUTY: 2,
  WAVE: 3,
  PITCH: 4,
  EX1: 5,
  EX2: 6,
  EX3: 7
};
const MACRO_COUNT = 8;
const PARAM = {
  TAB_SELECT: 0,
  LOOP_POS: 1,
  REL_POS: 2,
  MACRO_LEN: 3,
  MACRO_MODE: 4
};
const MACRO_HEADER_SIZE = 4;
const MACRO_DATA_SIZE = 256;
const MACRO_CONFIG_SIZE = 264;
const MACRO_RANGES = {
  [MACRO_TYPE.VOL]: { min: 0, max: 15 },
  [MACRO_TYPE.ARP]: { min: -127, max: 127 },
  [MACRO_TYPE.DUTY]: { min: 0, max: 3 },
  [MACRO_TYPE.WAVE]: { min: 0, max: 63 },
  [MACRO_TYPE.PITCH]: { min: -127, max: 127 },
  [MACRO_TYPE.EX1]: { min: 0, max: 15 },
  [MACRO_TYPE.EX2]: { min: 0, max: 15 },
  [MACRO_TYPE.EX3]: { min: 0, max: 15 }
};
function findMacro(macros, type) {
  return macros.find((m) => m.type === type || m.code === type);
}
function configToBuffer(config, activeMacro) {
  const buf = new Uint8Array(MACRO_CONFIG_SIZE);
  const macro = findMacro(config.macros, activeMacro);
  const range = MACRO_RANGES[activeMacro] ?? { min: 0, max: 15 };
  buf[0] = activeMacro & 255;
  buf[1] = macro ? Math.min(macro.data.length, 255) : 0;
  buf[2] = macro ? macro.loop >= 0 && macro.loop < 255 ? macro.loop : 255 : 255;
  buf[3] = macro ? macro.release >= 0 && macro.release < 255 ? macro.release : 255 : 255;
  if (macro && macro.data.length > 0) {
    const len = Math.min(macro.data.length, MACRO_DATA_SIZE);
    for (let i = 0; i < len; i++) {
      buf[MACRO_HEADER_SIZE + i] = macro.data[i] & 255;
    }
  }
  buf[260] = range.min & 255;
  buf[261] = range.max & 255;
  buf[262] = macro ? macro.mode ?? 0 : 0;
  buf[263] = 0;
  return buf;
}
const FurnaceMacroHardware = ({
  config,
  activeMacro: activeMacroProp,
  onChange
}) => {
  const configRef = reactExports.useRef(config);
  const onChangeRef = reactExports.useRef(onChange);
  const activeMacroRef = reactExports.useRef(activeMacroProp ?? MACRO_TYPE.VOL);
  reactExports.useEffect(() => {
    configRef.current = config;
  }, [config]);
  reactExports.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  reactExports.useEffect(() => {
    if (activeMacroProp !== void 0) {
      activeMacroRef.current = activeMacroProp;
    }
  }, [activeMacroProp]);
  const configBuffer = reactExports.useMemo(
    () => configToBuffer(config, activeMacroRef.current),
    [config]
  );
  const handleModuleReady = reactExports.useCallback((mod) => {
    mod.onTabChange = (tab) => {
      if (tab < 0 || tab >= MACRO_COUNT) return;
      activeMacroRef.current = tab;
      const buf = configToBuffer(configRef.current, tab);
      const loadFn = mod._furnace_macro_load_config;
      if (typeof loadFn === "function") {
        const ptr = mod._malloc(buf.length);
        if (ptr) {
          mod.HEAPU8.set(buf, ptr);
          loadFn.call(mod, ptr, buf.length);
          mod._free(ptr);
        }
      }
    };
    mod.onMacroEdit = (index, value) => {
      const c = { ...configRef.current };
      const macros = [...c.macros];
      const macroType = activeMacroRef.current;
      let macroIdx = macros.findIndex((m) => m.type === macroType || m.code === macroType);
      if (macroIdx < 0) {
        macros.push({
          type: macroType,
          code: macroType,
          data: [],
          loop: -1,
          release: -1,
          mode: 0
        });
        macroIdx = macros.length - 1;
      }
      const macro = { ...macros[macroIdx] };
      const data = [...macro.data];
      while (data.length <= index) {
        data.push(0);
      }
      data[index] = value;
      macro.data = data;
      macros[macroIdx] = macro;
      c.macros = macros;
      configRef.current = c;
      onChangeRef.current(c);
    };
    mod.onParamChange = (paramId, value) => {
      const c = { ...configRef.current };
      const macros = [...c.macros];
      const macroType = activeMacroRef.current;
      let macroIdx = macros.findIndex((m) => m.type === macroType || m.code === macroType);
      if (macroIdx < 0) return;
      const macro = { ...macros[macroIdx] };
      switch (paramId) {
        case PARAM.TAB_SELECT:
          return;
        case PARAM.LOOP_POS:
          macro.loop = value === 255 ? -1 : value;
          break;
        case PARAM.REL_POS:
          macro.release = value === 255 ? -1 : value;
          break;
        case PARAM.MACRO_LEN: {
          const newData = [...macro.data];
          if (value < newData.length) {
            newData.length = value;
          } else {
            while (newData.length < value) {
              newData.push(0);
            }
          }
          macro.data = newData;
          break;
        }
        case PARAM.MACRO_MODE:
          macro.mode = value;
          break;
        default:
          return;
      }
      macros[macroIdx] = macro;
      c.macros = macros;
      configRef.current = c;
      onChangeRef.current(c);
    };
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    SDLHardwareWrapper,
    {
      imageRendering: "auto",
      moduleUrl: "/furnace/FurnaceMacro.js",
      factoryName: "createFurnaceMacro",
      canvasWidth: 1280,
      canvasHeight: 400,
      displayWidth: 640,
      displayHeight: 200,
      initFn: "_furnace_macro_init",
      startFn: "_furnace_macro_start",
      shutdownFn: "_furnace_macro_shutdown",
      loadConfigFn: "_furnace_macro_load_config",
      configBuffer,
      onModuleReady: handleModuleReady
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FurnaceMacroHardware.tsx",
      lineNumber: 251,
      columnNumber: 5
    },
    void 0
  );
};
export {
  FurnaceMacroHardware
};
