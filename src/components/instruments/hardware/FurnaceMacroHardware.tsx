/**
 * FurnaceMacroHardware — SDL2/WASM hardware UI for Furnace macro sequence editing
 *
 * Maps FurnaceConfig.macros → 264-byte packed buffer for the furnace_macro C module.
 * Handles onParamChange / onMacroEdit / onTabChange callbacks back to FurnaceConfig updates.
 *
 * Renders below the main instrument editor (FM/PSG/Wave/PCM) as a sub-canvas
 * for editing per-instrument macro sequences (Vol, Arp, Duty, Wave, Pitch, Ex1-Ex3).
 *
 * Canvas: 640x200
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { SDLHardwareWrapper, type SDLModule } from './SDLHardwareWrapper';
import type { FurnaceConfig, FurnaceMacro } from '@typedefs/instrument';

/* ── Props ─────────────────────────────────────────────────────────────── */

interface FurnaceMacroHardwareProps {
  config: FurnaceConfig;
  activeMacro?: number;  // which macro tab to show initially (0-7)
  onChange: (config: FurnaceConfig) => void;
}

/* ── Macro Type Constants (must match furnace_macro.h MACRO_* defines) ── */

const MACRO_TYPE = {
  VOL:   0,
  ARP:   1,
  DUTY:  2,
  WAVE:  3,
  PITCH: 4,
  EX1:   5,
  EX2:   6,
  EX3:   7,
} as const;

const MACRO_COUNT = 8;

/* ── Param IDs (must match furnace_macro.c PARAM_* defines) ────────────── */

const PARAM = {
  TAB_SELECT: 0,
  LOOP_POS:   1,
  REL_POS:    2,
  MACRO_LEN:  3,
  MACRO_MODE: 4,
} as const;

/* ── Config buffer layout constants (must match furnace_macro.h) ───────── */

const MACRO_HEADER_SIZE = 4;
const MACRO_DATA_SIZE   = 256;
const MACRO_CONFIG_SIZE = 264;  // 4 + 256 + 4

/* ── Default value ranges per macro type ───────────────────────────────── */

interface MacroRange {
  min: number;
  max: number;
}

const MACRO_RANGES: Record<number, MacroRange> = {
  [MACRO_TYPE.VOL]:   { min: 0, max: 15 },
  [MACRO_TYPE.ARP]:   { min: -127, max: 127 },
  [MACRO_TYPE.DUTY]:  { min: 0, max: 3 },
  [MACRO_TYPE.WAVE]:  { min: 0, max: 63 },
  [MACRO_TYPE.PITCH]: { min: -127, max: 127 },
  [MACRO_TYPE.EX1]:   { min: 0, max: 15 },
  [MACRO_TYPE.EX2]:   { min: 0, max: 15 },
  [MACRO_TYPE.EX3]:   { min: 0, max: 15 },
};

/* ── Helper: find a macro by type in the macros array ──────────────────── */

function findMacro(macros: FurnaceMacro[], type: number): FurnaceMacro | undefined {
  return macros.find(m => m.type === type || m.code === type);
}

/* ── Config -> Buffer serialization ────────────────────────────────────── */

function configToBuffer(config: FurnaceConfig, activeMacro: number): Uint8Array {
  const buf = new Uint8Array(MACRO_CONFIG_SIZE);

  const macro = findMacro(config.macros, activeMacro);
  const range = MACRO_RANGES[activeMacro] ?? { min: 0, max: 15 };

  // Header (4 bytes)
  buf[0] = activeMacro & 0xFF;
  buf[1] = macro ? Math.min(macro.data.length, 255) : 0;
  buf[2] = macro ? (macro.loop >= 0 && macro.loop < 255 ? macro.loop : 255) : 255;
  buf[3] = macro ? (macro.release >= 0 && macro.release < 255 ? macro.release : 255) : 255;

  // Macro data (256 bytes, starting at offset 4)
  if (macro && macro.data.length > 0) {
    const len = Math.min(macro.data.length, MACRO_DATA_SIZE);
    for (let i = 0; i < len; i++) {
      // Store as int8 (signed byte)
      buf[MACRO_HEADER_SIZE + i] = macro.data[i] & 0xFF;
    }
  }

  // Range info (4 bytes, starting at offset 260)
  buf[260] = range.min & 0xFF;  // int8 min
  buf[261] = range.max & 0xFF;  // int8 max
  buf[262] = macro ? (macro.mode ?? 0) : 0;  // mode
  buf[263] = 0;  // reserved

  return buf;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export const FurnaceMacroHardware: React.FC<FurnaceMacroHardwareProps> = ({
  config,
  activeMacro: activeMacroProp,
  onChange,
}) => {
  /* configRef pattern (CLAUDE.md) — prevents stale closures in callbacks */
  const configRef = useRef(config);
  const onChangeRef = useRef(onChange);
  const activeMacroRef = useRef(activeMacroProp ?? MACRO_TYPE.VOL);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    if (activeMacroProp !== undefined) {
      activeMacroRef.current = activeMacroProp;
    }
  }, [activeMacroProp]);

  /* Serialize config + active macro into the 264-byte buffer */
  const configBuffer = useMemo(
    () => configToBuffer(config, activeMacroRef.current),
    [config],
  );

  /* Module ready callback: register JS callbacks on the WASM module */
  const handleModuleReady = useCallback((mod: SDLModule) => {
    /* Tab change: switch active macro, re-push that macro's data */
    mod.onTabChange = (tab: number) => {
      if (tab < 0 || tab >= MACRO_COUNT) return;
      activeMacroRef.current = tab;

      /* Re-push the new macro's data to WASM */
      const buf = configToBuffer(configRef.current, tab);
      const loadFn = mod._furnace_macro_load_config as ((ptr: number, len: number) => void) | undefined;
      if (typeof loadFn === 'function') {
        const ptr = mod._malloc(buf.length);
        if (ptr) {
          mod.HEAPU8.set(buf, ptr);
          loadFn.call(mod, ptr, buf.length);
          mod._free(ptr);
        }
      }
    };

    /* Individual step edit: update the data array for the active macro */
    mod.onMacroEdit = (index: number, value: number) => {
      const c = { ...configRef.current };
      const macros = [...c.macros];
      const macroType = activeMacroRef.current;

      // Find or create the macro entry
      let macroIdx = macros.findIndex(m => m.type === macroType || m.code === macroType);
      if (macroIdx < 0) {
        // Create a new macro entry if it doesn't exist
        macros.push({
          type: macroType,
          code: macroType,
          data: [],
          loop: -1,
          release: -1,
          mode: 0,
        });
        macroIdx = macros.length - 1;
      }

      const macro = { ...macros[macroIdx] };
      const data = [...macro.data];

      // Extend data array if necessary
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

    /* Param changes: loop position, release position, length, mode */
    mod.onParamChange = (paramId: number, value: number) => {
      const c = { ...configRef.current };
      const macros = [...c.macros];
      const macroType = activeMacroRef.current;

      let macroIdx = macros.findIndex(m => m.type === macroType || m.code === macroType);
      if (macroIdx < 0) return;

      const macro = { ...macros[macroIdx] };

      switch (paramId) {
        case PARAM.TAB_SELECT:
          // Tab selection is handled in onTabChange
          return;

        case PARAM.LOOP_POS:
          macro.loop = value === 255 ? -1 : value;
          break;

        case PARAM.REL_POS:
          macro.release = value === 255 ? -1 : value;
          break;

        case PARAM.MACRO_LEN: {
          // Resize the data array
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

  return (
    <SDLHardwareWrapper
      moduleUrl="/furnace/FurnaceMacro.js"
      factoryName="createFurnaceMacro"
      canvasWidth={640}
      canvasHeight={200}
      initFn="_furnace_macro_init"
      startFn="_furnace_macro_start"
      shutdownFn="_furnace_macro_shutdown"
      loadConfigFn="_furnace_macro_load_config"
      configBuffer={configBuffer}
      onModuleReady={handleModuleReady}
    />
  );
};
