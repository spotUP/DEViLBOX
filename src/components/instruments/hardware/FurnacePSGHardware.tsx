/**
 * FurnacePSGHardware — SDL2/WASM hardware UI for Furnace PSG chip synths
 *
 * Maps FurnaceConfig → 22-byte packed buffer for the furnace_psg C module.
 * Handles onParamChange callbacks back to FurnaceConfig updates.
 *
 * Covers 19 PSG chip types:
 * NES, GB, C64, SID6581, SID8580, AY, PSG, VIC, TIA, VERA,
 * SAA, TED, VRC6, MMC5, AY8930, POKEY, PET, PCSPKR, SNES
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { SDLHardwareWrapper, type SDLModule } from './SDLHardwareWrapper';
import type { FurnaceConfig, SynthType } from '@typedefs/instrument';

interface FurnacePSGHardwareProps {
  config: FurnaceConfig;
  onChange: (config: FurnaceConfig) => void;
  synthType?: SynthType;
}

/* ── SynthType → PSG subtype index (must match furnace_psg.h PSG_CHIP_* constants) ── */

const SYNTH_TO_SUBTYPE: Record<string, number> = {
  FurnaceNES:     0,   // PSG_CHIP_NES
  FurnaceGB:      1,   // PSG_CHIP_GB
  FurnaceC64:     2,   // PSG_CHIP_C64
  FurnaceSID6581: 3,   // PSG_CHIP_SID6581
  FurnaceSID8580: 4,   // PSG_CHIP_SID8580
  FurnaceAY:      5,   // PSG_CHIP_AY
  FurnacePSG:     6,   // PSG_CHIP_PSG
  FurnaceVIC:     7,   // PSG_CHIP_VIC
  FurnaceTIA:     8,   // PSG_CHIP_TIA
  FurnaceVERA:    9,   // PSG_CHIP_VERA
  FurnaceSAA:    10,   // PSG_CHIP_SAA
  FurnaceTED:    11,   // PSG_CHIP_TED
  FurnaceVRC6:   12,   // PSG_CHIP_VRC6
  FurnaceMMC5:   13,   // PSG_CHIP_MMC5
  FurnaceAY8930: 14,   // PSG_CHIP_AY8930
  FurnacePOKEY:  15,   // PSG_CHIP_POKEY
  FurnacePET:    16,   // PSG_CHIP_PET
  FurnacePCSPKR: 17,   // PSG_CHIP_PCSPKR
  FurnaceSNES:   18,   // PSG_CHIP_SNES
};

/* Also map SynthType string → chipType number for routing */
const SYNTH_TO_CHIP: Record<string, number> = {
  FurnaceNES:     1,
  FurnaceGB:      2,
  FurnaceC64:     3,
  FurnaceSID6581: 4,
  FurnaceSID8580: 5,
  FurnaceAY:      6,
  FurnacePSG:     7,
  FurnaceVIC:     8,
  FurnaceTIA:     9,
  FurnaceVERA:   10,
  FurnaceSAA:    11,
  FurnaceTED:    12,
  FurnaceVRC6:   13,
  FurnaceMMC5:   14,
  FurnaceAY8930: 15,
  FurnacePOKEY:  16,
  FurnacePET:    17,
  FurnacePCSPKR: 18,
  FurnaceSNES:   19,
};

/* Reverse map: chipType number → PSG subtype index */
const CHIP_SUBTYPE_MAP: Record<number, number> = {};
for (const [synth, chipType] of Object.entries(SYNTH_TO_CHIP)) {
  CHIP_SUBTYPE_MAP[chipType] = SYNTH_TO_SUBTYPE[synth];
}

/* ── Param IDs (must match furnace_psg.c PARAM_* constants) ────────────── */

const PARAM = {
  WAVEFORM:      0,
  DUTY:          1,
  NOISE:         2,
  RING_MOD:      3,
  OSC_SYNC:      4,
  TO_FILTER:     5,
  FILTER_ON:     6,
  FILTER_LP:     7,
  FILTER_BP:     8,
  FILTER_HP:     9,
  ENV_0:        10,
  ENV_1:        11,
  ENV_2:        12,
  ENV_3:        13,
  ENV_4:        14,
  ENV_5:        15,
  ENV_6:        16,
  ENV_7:        17,
  FILTER_CUTOFF: 18,
  FILTER_RES:   19,
  NOISE_MODE:   20,
  PSG_WIDTH:    21,
  AY_ENV_SHAPE: 22,
  DUTY_HI:      23,
} as const;

/* ── chipType number → PSG subtype helper ──────────────────────────────── */

function getChipSubtype(config: FurnaceConfig, synthType?: SynthType): number {
  // Prefer synthType lookup — config.chipType uses a different numbering system
  // (Furnace engine chip IDs) that can collide with SYNTH_TO_CHIP values.
  if (synthType && synthType in SYNTH_TO_SUBTYPE) {
    return SYNTH_TO_SUBTYPE[synthType];
  }
  return CHIP_SUBTYPE_MAP[config.chipType] ?? 0;
}

/* ── Config → Buffer serialization (22 bytes, PSG_CONFIG_SIZE) ─────────── */
/*
 * Buffer layout (from furnace_psg.h):
 *
 * Header (4 bytes):
 *   [0]  chip_subtype (0-18)
 *   [1]  waveform
 *   [2]  duty (low byte)
 *   [3]  flags (bit0=noiseOn, bit1=ringMod, bit2=oscSync, bit3=toFilter,
 *               bit4=filterOn, bit5=filterLP, bit6=filterBP, bit7=filterHP)
 *
 * Envelope (8 bytes):
 *   [4-11] envParam0-7 (chip-dependent)
 *
 * Filter (6 bytes):
 *   [12] filterCutoffLo
 *   [13] filterCutoffHi
 *   [14] filterResonance
 *   [15] filterFlags
 *   [16] dutyHi
 *   [17] reserved
 *
 * AY specific (4 bytes):
 *   [18] noiseMode
 *   [19] psgWidth
 *   [20] ayEnvShape
 *   [21] reserved
 */

function configToBuffer(config: FurnaceConfig, synthType?: SynthType): Uint8Array {
  const buf = new Uint8Array(22); // PSG_CONFIG_SIZE

  const subtype = getChipSubtype(config, synthType);

  /* --- Header (4 bytes) --- */
  buf[0] = subtype;

  /* Waveform — chip-specific mapping */
  if (subtype === 2 || subtype === 3 || subtype === 4) {
    /* C64/SID: waveform is a bitmask of tri/saw/pulse/noise */
    const c64 = config.c64;
    let wv = 0;
    if (c64?.triOn) wv |= 1;
    if (c64?.sawOn) wv |= 2;
    if (c64?.pulseOn) wv |= 4;
    if (c64?.noiseOn) wv |= 8;
    buf[1] = wv;
  } else if (subtype === 1) {
    /* GB: 0=Pulse, 1=Wave */
    buf[1] = config.gb?.duty !== undefined && config.gb.duty > 3 ? 1 : 0;
  } else {
    buf[1] = 0; /* Default waveform 0 */
  }

  /* Duty (low byte) */
  if (subtype === 2 || subtype === 3 || subtype === 4) {
    /* C64: 12-bit duty */
    const duty = config.c64?.duty ?? 0;
    buf[2] = duty & 0xFF;
    buf[16] = (duty >> 8) & 0xFF; /* dutyHi in filter section */
  } else if (subtype === 1) {
    buf[2] = config.gb?.duty ?? 2;
  } else if (subtype === 0 || subtype === 13) {
    /* NES / MMC5 */
    buf[2] = config.nes?.dutyNoise ?? 0;
  } else if (subtype === 6) {
    /* PSG (SN76489) */
    buf[2] = config.psg?.duty ?? 0;
  } else if (subtype === 12) {
    /* VRC6 — duty 0-7 */
    buf[2] = config.nes?.dutyNoise ?? 0;
  } else {
    buf[2] = 0;
  }

  /* Flags byte */
  let flags = 0;
  if (subtype === 2 || subtype === 3 || subtype === 4) {
    if (config.c64?.noiseOn)                          flags |= 0x01; // bit0 = noiseOn
    if (config.c64?.ringMod)                          flags |= 0x02; // bit1 = ringMod
    if (config.c64?.oscSync)                          flags |= 0x04; // bit2 = oscSync
    if (config.c64?.toFilter)                         flags |= 0x08; // bit3 = toFilter
    if (config.c64?.filterOn ?? config.c64?.initFilter) flags |= 0x10; // bit4 = filterOn
    if (config.c64?.filterLP)                         flags |= 0x20; // bit5 = filterLP
    if (config.c64?.filterBP)                         flags |= 0x40; // bit6 = filterBP
    if (config.c64?.filterHP)                         flags |= 0x80; // bit7 = filterHP
  }
  buf[3] = flags;

  /* --- Envelope section (8 bytes) [4-11] — chip-dependent --- */
  if (subtype === 0 || subtype === 13) {
    /* NES / MMC5 */
    buf[4] = config.nes?.envValue ?? 15;
    buf[5] = config.nes?.envMode === 'env' ? 1 : 0;
    buf[6] = config.nes?.sweepEnabled ? 1 : 0;
    buf[7] = config.nes?.sweepPeriod ?? 0;
    buf[8] = config.nes?.sweepShift ?? 0;
    buf[9] = config.nes?.sweepNegate ? 1 : 0;
  } else if (subtype === 1) {
    /* GB */
    buf[4] = config.gb?.envVol ?? 15;
    buf[5] = config.gb?.envDir ?? 0;
    buf[6] = config.gb?.envLen ?? 0;
    buf[7] = config.gb?.soundLen ?? 0;
  } else if (subtype === 2 || subtype === 3 || subtype === 4) {
    /* C64/SID */
    buf[4] = config.c64?.a ?? 0;
    buf[5] = config.c64?.d ?? 0;
    buf[6] = config.c64?.s ?? 15;
    buf[7] = config.c64?.r ?? 0;
  } else if (subtype === 18) {
    /* SNES */
    buf[4] = config.snes?.a ?? 15;
    buf[5] = config.snes?.d ?? 7;
    buf[6] = config.snes?.s ?? 7;
    buf[7] = config.snes?.r ?? 0;
    const gm = config.snes?.gainMode;
    buf[8] = typeof gm === 'number' ? gm : 0;
    buf[9] = config.snes?.gain ?? 0;
  } else if (subtype === 6) {
    /* PSG (SN76489) — uses psg sub-config ADSR */
    buf[4] = config.psg?.attack ?? 0;
    buf[5] = config.psg?.decay ?? 0;
    buf[6] = config.psg?.sustain ?? 15;
    buf[7] = config.psg?.release ?? 0;
  }

  /* --- Filter section (6 bytes) [12-17] — C64/SID only --- */
  if (subtype === 2 || subtype === 3 || subtype === 4) {
    const cutoff = config.c64?.filterCutoff ?? 0;
    buf[12] = cutoff & 0xFF;
    buf[13] = (cutoff >> 8) & 0xFF;
    buf[14] = config.c64?.filterResonance ?? config.c64?.filterRes ?? 0;
    let ff = 0;
    if (config.c64?.filterLP)     ff |= 1;
    if (config.c64?.filterBP)     ff |= 2;
    if (config.c64?.filterHP)     ff |= 4;
    if (config.c64?.filterCh3Off) ff |= 8;
    buf[15] = ff;
    /* buf[16] already set (dutyHi) */
    buf[17] = 0; /* reserved */
  }

  /* --- AY/PSG section (4 bytes) [18-21] --- */
  if (subtype === 5 || subtype === 6 || subtype === 14) {
    /* AY / PSG / AY8930 */
    buf[18] = config.psg?.noiseMode === 'periodic' ? 1 : 0;
    buf[19] = config.psg?.width ?? 0;
    buf[20] = 0; /* ayEnvShape — stored on config if present */
    buf[21] = 0; /* reserved */
  }

  return buf;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export const FurnacePSGHardware: React.FC<FurnacePSGHardwareProps> = ({ config, onChange, synthType }) => {
  const configRef = useRef(config);
  const onChangeRef = useRef(onChange);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const configBuffer = useMemo(() => configToBuffer(config, synthType), [config, synthType]);

  const handleModuleReady = useCallback((mod: SDLModule) => {
    mod.onParamChange = (paramId: number, value: number) => {
      const c = { ...configRef.current };
      const subtype = getChipSubtype(c, synthType);

      switch (paramId) {
        /* ── General params ────────────────────────────── */
        case PARAM.WAVEFORM:
          if (subtype === 2 || subtype === 3 || subtype === 4) {
            /* C64/SID: waveform is a bitmask */
            c.c64 = { ...c.c64! };
            c.c64.triOn   = !!(value & 1);
            c.c64.sawOn   = !!(value & 2);
            c.c64.pulseOn = !!(value & 4);
            c.c64.noiseOn = !!(value & 8);
          }
          break;

        case PARAM.DUTY:
          if (subtype === 2 || subtype === 3 || subtype === 4) {
            c.c64 = { ...c.c64! };
            c.c64.duty = ((c.c64.duty ?? 0) & 0xFF00) | (value & 0xFF);
          } else if (subtype === 1) {
            c.gb = { ...c.gb!, duty: value };
          } else if (subtype === 0 || subtype === 13) {
            c.nes = { ...c.nes!, dutyNoise: value };
          } else if (subtype === 6) {
            c.psg = { ...c.psg!, duty: value };
          }
          break;

        case PARAM.DUTY_HI:
          if (subtype === 2 || subtype === 3 || subtype === 4) {
            c.c64 = { ...c.c64! };
            c.c64.duty = ((c.c64.duty ?? 0) & 0x00FF) | ((value & 0xFF) << 8);
          }
          break;

        case PARAM.NOISE:
          if (c.c64) { c.c64 = { ...c.c64, noiseOn: !!value }; }
          break;

        case PARAM.RING_MOD:
          if (c.c64) { c.c64 = { ...c.c64, ringMod: !!value }; }
          break;

        case PARAM.OSC_SYNC:
          if (c.c64) { c.c64 = { ...c.c64, oscSync: !!value }; }
          break;

        case PARAM.TO_FILTER:
          if (c.c64) { c.c64 = { ...c.c64, toFilter: !!value }; }
          break;

        case PARAM.FILTER_ON:
          if (c.c64) { c.c64 = { ...c.c64, filterOn: !!value }; }
          break;

        case PARAM.FILTER_LP:
          if (c.c64) { c.c64 = { ...c.c64, filterLP: !!value }; }
          break;

        case PARAM.FILTER_BP:
          if (c.c64) { c.c64 = { ...c.c64, filterBP: !!value }; }
          break;

        case PARAM.FILTER_HP:
          if (c.c64) { c.c64 = { ...c.c64, filterHP: !!value }; }
          break;

        /* ── Envelope params (chip-dependent) ──────────── */
        case PARAM.ENV_0:
          if (subtype === 0 || subtype === 13) {
            c.nes = { ...c.nes!, envValue: value };
          } else if (subtype === 1) {
            c.gb = { ...c.gb!, envVol: value };
          } else if (subtype === 2 || subtype === 3 || subtype === 4) {
            c.c64 = { ...c.c64!, a: value };
          } else if (subtype === 18) {
            c.snes = { ...c.snes!, a: value };
          } else if (subtype === 6) {
            c.psg = { ...c.psg!, attack: value };
          }
          break;

        case PARAM.ENV_1:
          if (subtype === 0 || subtype === 13) {
            c.nes = { ...c.nes!, envMode: value ? 'env' : 'length' };
          } else if (subtype === 1) {
            c.gb = { ...c.gb!, envDir: value };
          } else if (subtype === 2 || subtype === 3 || subtype === 4) {
            c.c64 = { ...c.c64!, d: value };
          } else if (subtype === 18) {
            c.snes = { ...c.snes!, d: value };
          } else if (subtype === 6) {
            c.psg = { ...c.psg!, decay: value };
          }
          break;

        case PARAM.ENV_2:
          if (subtype === 0 || subtype === 13) {
            c.nes = { ...c.nes!, sweepEnabled: !!value };
          } else if (subtype === 1) {
            c.gb = { ...c.gb!, envLen: value };
          } else if (subtype === 2 || subtype === 3 || subtype === 4) {
            c.c64 = { ...c.c64!, s: value };
          } else if (subtype === 18) {
            c.snes = { ...c.snes!, s: value };
          } else if (subtype === 6) {
            c.psg = { ...c.psg!, sustain: value };
          }
          break;

        case PARAM.ENV_3:
          if (subtype === 0 || subtype === 13) {
            c.nes = { ...c.nes!, sweepPeriod: value };
          } else if (subtype === 1) {
            c.gb = { ...c.gb!, soundLen: value };
          } else if (subtype === 2 || subtype === 3 || subtype === 4) {
            c.c64 = { ...c.c64!, r: value };
          } else if (subtype === 18) {
            c.snes = { ...c.snes!, r: value };
          } else if (subtype === 6) {
            c.psg = { ...c.psg!, release: value };
          }
          break;

        case PARAM.ENV_4:
          if (subtype === 0 || subtype === 13) {
            c.nes = { ...c.nes!, sweepShift: value };
          } else if (subtype === 18) {
            c.snes = { ...c.snes!, gainMode: value };
          }
          break;

        case PARAM.ENV_5:
          if (subtype === 0 || subtype === 13) {
            c.nes = { ...c.nes!, sweepNegate: !!value };
          } else if (subtype === 18) {
            c.snes = { ...c.snes!, gain: value };
          }
          break;

        case PARAM.ENV_6:
        case PARAM.ENV_7:
          /* Reserved envelope slots — no-op for current chip types */
          break;

        /* ── Filter params (C64/SID) ───────────────────── */
        case PARAM.FILTER_CUTOFF:
          if (c.c64) { c.c64 = { ...c.c64, filterCutoff: value }; }
          break;

        case PARAM.FILTER_RES:
          if (c.c64) { c.c64 = { ...c.c64, filterResonance: value, filterRes: value }; }
          break;

        /* ── AY / PSG specific ─────────────────────────── */
        case PARAM.NOISE_MODE:
          if (c.psg) { c.psg = { ...c.psg, noiseMode: value ? 'periodic' : 'white' }; }
          break;

        case PARAM.PSG_WIDTH:
          if (c.psg) { c.psg = { ...c.psg, width: value }; }
          break;

        case PARAM.AY_ENV_SHAPE:
          /* AY envelope shape — no dedicated sub-object, store on config */
          (c as Record<string, unknown>).ayEnvShape = value;
          break;
      }

      configRef.current = c;
      onChangeRef.current(c);
    };
  }, [synthType]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SDLHardwareWrapper
      imageRendering="auto"
      moduleUrl="/furnace/FurnacePSG.js"
      factoryName="createFurnacePSG"
      canvasWidth={960}
      canvasHeight={720}
      displayWidth={480}
      displayHeight={360}
      initFn="_furnace_psg_init"
      startFn="_furnace_psg_start"
      shutdownFn="_furnace_psg_shutdown"
      loadConfigFn="_furnace_psg_load_config"
      configBuffer={configBuffer}
      onModuleReady={handleModuleReady}
    />
  );
};

/** Check if a SynthType is a Furnace PSG type */
// eslint-disable-next-line react-refresh/only-export-components
export function isFurnacePSGType(synthType: SynthType): boolean {
  return synthType in SYNTH_TO_SUBTYPE;
}
