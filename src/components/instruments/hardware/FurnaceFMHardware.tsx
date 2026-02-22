/**
 * FurnaceFMHardware — SDL2/WASM hardware UI for Furnace FM chip synths
 *
 * Maps FurnaceConfig → 88-byte packed buffer for the furnace_fm C module.
 * Handles onParamChange / onOpParamChange callbacks back to FurnaceConfig updates.
 *
 * Covers 12 FM chip types:
 * OPN, OPM, OPL, OPLL, OPZ, OPNA, OPNB, OPL4, Y8950, OPN2203, OPNBB, ESFM
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { SDLHardwareWrapper, type SDLModule } from './SDLHardwareWrapper';
import type { FurnaceConfig, SynthType } from '@typedefs/instrument';

interface FurnaceFMHardwareProps {
  config: FurnaceConfig;
  onChange: (config: FurnaceConfig) => void;
}

/* ── Chip subtype mapping (must match furnace_fm.h FM_CHIP_* constants) ── */

const CHIP_SUBTYPE_MAP: Record<number, number> = {
  1:  0,   // OPN2 (Genesis) → FM_CHIP_OPN
  2:  1,   // OPM (X68000) → FM_CHIP_OPM
  3:  2,   // OPL (AdLib) → FM_CHIP_OPL
  4:  3,   // OPLL (MSX) → FM_CHIP_OPLL
  5:  4,   // OPZ (TX81Z) → FM_CHIP_OPZ
  6:  5,   // ESFM → FM_CHIP_ESFM
  7:  6,   // OPNA (PC-98) → FM_CHIP_OPNA
  8:  7,   // OPNB (Neo Geo) → FM_CHIP_OPNB
  9:  8,   // OPL4 → FM_CHIP_OPL4
  10: 9,   // Y8950 → FM_CHIP_Y8950
  11: 10,  // OPN2203 → FM_CHIP_OPN2203
  12: 11,  // OPNBB → FM_CHIP_OPNBB
};

/* Also map SynthType string → chipType number for routing */
const SYNTH_TO_CHIP: Record<string, number> = {
  FurnaceOPN: 1,
  FurnaceOPM: 2,
  FurnaceOPL: 3,
  FurnaceOPLL: 4,
  FurnaceOPZ: 5,
  FurnaceESFM: 6,
  FurnaceOPNA: 7,
  FurnaceOPNB: 8,
  FurnaceOPL4: 9,
  FurnaceY8950: 10,
  FurnaceOPN2203: 11,
  FurnaceOPNBB: 12,
};

/* ── Op param IDs (must match furnace_fm.c OP_* constants) ─────────────── */

const OP_PARAM = {
  ENABLED: 0, MULT: 1, TL: 2, AR: 3, DR: 4, D2R: 5, SL: 6, RR: 7,
  DT: 8, DT2: 9, RS: 10, AM: 11, KSR: 12, KSL: 13, SUS: 14, VIB: 15,
  WS: 16, SSG: 17,
} as const;

/* ── Global param IDs (must match furnace_fm.c PARAM_* constants) ──────── */

const GLOBAL_PARAM = {
  ALGORITHM: 0, FEEDBACK: 1, FMS: 2, AMS: 3, OPLL_PRESET: 4,
} as const;

/* ── Config → Buffer serialization ─────────────────────────────────────── */

function configToBuffer(config: FurnaceConfig): Uint8Array {
  const buf = new Uint8Array(88); // FM_CONFIG_SIZE = 8 + 4 * 20

  const subtype = CHIP_SUBTYPE_MAP[config.chipType] ?? 0;
  const opsCount = config.ops ?? config.operators.length;

  // Header (8 bytes)
  buf[0] = subtype;
  buf[1] = config.algorithm & 7;
  buf[2] = config.feedback & 7;
  buf[3] = (config.fms ?? 0) & 7;
  buf[4] = (config.ams ?? 0) & 3;
  buf[5] = opsCount;
  buf[6] = config.opllPreset ?? 0;
  buf[7] = config.fixedDrums ? 1 : 0;

  // Per-operator (20 bytes each)
  for (let i = 0; i < 4; i++) {
    const op = config.operators[i];
    if (!op) continue;
    const off = 8 + i * 20;

    buf[off + 0] = op.enabled ? 1 : 0;
    buf[off + 1] = op.mult & 0xFF;
    buf[off + 2] = op.tl & 0xFF;
    buf[off + 3] = op.ar & 0xFF;
    buf[off + 4] = op.dr & 0xFF;
    buf[off + 5] = op.d2r & 0xFF;
    buf[off + 6] = op.sl & 0xFF;
    buf[off + 7] = op.rr & 0xFF;
    buf[off + 8] = op.dt & 0xFF;  // signed, but stored as uint8
    buf[off + 9] = (op.dt2 ?? 0) & 0xFF;
    buf[off + 10] = (op.rs ?? 0) & 0xFF;
    buf[off + 11] = op.am ? 1 : 0;
    buf[off + 12] = op.ksr ? 1 : 0;
    buf[off + 13] = (op.ksl ?? 0) & 0xFF;
    buf[off + 14] = op.sus ? 1 : 0;
    buf[off + 15] = op.vib ? 1 : 0;
    buf[off + 16] = (op.ws ?? 0) & 0xFF;
    buf[off + 17] = (op.ssg ?? 0) & 0xFF;
  }

  return buf;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export const FurnaceFMHardware: React.FC<FurnaceFMHardwareProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  const onChangeRef = useRef(onChange);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const configBuffer = useMemo(() => configToBuffer(config), [config]);

  const handleModuleReady = useCallback((mod: SDLModule) => {
    /* Global param change */
    mod.onParamChange = (paramId: number, value: number) => {
      const c = { ...configRef.current };
      switch (paramId) {
        case GLOBAL_PARAM.ALGORITHM:   c.algorithm = value; break;
        case GLOBAL_PARAM.FEEDBACK:    c.feedback = value; break;
        case GLOBAL_PARAM.FMS:         c.fms = value; break;
        case GLOBAL_PARAM.AMS:         c.ams = value; break;
        case GLOBAL_PARAM.OPLL_PRESET: c.opllPreset = value; break;
      }
      configRef.current = c;
      onChangeRef.current(c);
    };

    /* Per-operator param change */
    mod.onOpParamChange = (opIndex: number, paramId: number, value: number) => {
      const c = { ...configRef.current };
      const ops = [...c.operators];
      const op = { ...ops[opIndex] };

      switch (paramId) {
        case OP_PARAM.ENABLED: op.enabled = value !== 0; break;
        case OP_PARAM.MULT:    op.mult = value; break;
        case OP_PARAM.TL:      op.tl = value; break;
        case OP_PARAM.AR:      op.ar = value; break;
        case OP_PARAM.DR:      op.dr = value; break;
        case OP_PARAM.D2R:     op.d2r = value; break;
        case OP_PARAM.SL:      op.sl = value; break;
        case OP_PARAM.RR:      op.rr = value; break;
        case OP_PARAM.DT:      op.dt = value; break;
        case OP_PARAM.DT2:     op.dt2 = value; break;
        case OP_PARAM.RS:      op.rs = value; break;
        case OP_PARAM.AM:      op.am = value !== 0; break;
        case OP_PARAM.KSR:     op.ksr = value !== 0; break;
        case OP_PARAM.KSL:     op.ksl = value; break;
        case OP_PARAM.SUS:     op.sus = value !== 0; break;
        case OP_PARAM.VIB:     op.vib = value !== 0; break;
        case OP_PARAM.WS:      op.ws = value; break;
        case OP_PARAM.SSG:     op.ssg = value; break;
      }

      ops[opIndex] = op;
      c.operators = ops;
      configRef.current = c;
      onChangeRef.current(c);
    };

    /* Algorithm change (separate callback for immediate diagram update) */
    mod.onAlgorithmChange = (alg: number) => {
      const c = { ...configRef.current, algorithm: alg };
      configRef.current = c;
      onChangeRef.current(c);
    };
  }, []);

  return (
    <SDLHardwareWrapper
      moduleUrl="/furnace/FurnaceFM.js"
      factoryName="createFurnaceFM"
      canvasWidth={640}
      canvasHeight={480}
      initFn="_furnace_fm_init"
      startFn="_furnace_fm_start"
      shutdownFn="_furnace_fm_shutdown"
      loadConfigFn="_furnace_fm_load_config"
      configBuffer={configBuffer}
      onModuleReady={handleModuleReady}
    />
  );
};

/** Check if a SynthType is a Furnace FM type */
// eslint-disable-next-line react-refresh/only-export-components
export function isFurnaceFMType(synthType: SynthType): boolean {
  return synthType in SYNTH_TO_CHIP;
}
