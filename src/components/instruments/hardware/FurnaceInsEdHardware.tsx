/**
 * FurnaceInsEdHardware — Real Furnace insEdit.cpp compiled to WASM via ImGui+SDL2+WebGL
 *
 * This single component covers ALL 65+ Furnace chip types (FM, PSG, Wavetable, PCM)
 * because the real insEdit.cpp handles all of them via switch statements on ins->type.
 *
 * Uses SDLHardwareWrapper for SDL2 canvas lifecycle management.
 *
 * Serialization protocol:
 *   JS→WASM: rawBinaryData (native Furnace format) when available, else 0xDE field format
 *   WASM→JS: 240-byte 0xDE field format via dump_config, called on-demand
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { SDLHardwareWrapper, type SDLModule } from './SDLHardwareWrapper';
import type { FurnaceConfig, SynthType } from '@typedefs/instrument';

interface FurnaceInsEdHardwareProps {
  config: FurnaceConfig;
  onChange: (config: FurnaceConfig) => void;
  synthType?: SynthType;
}

/* ── DivInstrumentType mapping ─────────────────────────────────────────── *
 * Maps our SynthType strings to the DivInstrumentType enum values
 * used by Furnace's insEdit.cpp. These must match the enum in
 * furnace-insed-wasm/src/engine/instrument.h
 */

const SYNTH_TO_DIV_INS_TYPE: Record<string, number> = {
  // FM — values from furnace-insed-wasm/src/engine/instrument.h enum DivInstrumentType
  FurnaceOPN:     1,  // DIV_INS_FM=1
  FurnaceOPM:    33,  // DIV_INS_OPM=33
  FurnaceOPNA:    1,  // DIV_INS_FM=1 (OPN family shares FM type)
  FurnaceOPNB:    1,  // DIV_INS_FM=1
  FurnaceOPN2203: 1,  // DIV_INS_FM=1
  FurnaceOPNBB:   1,  // DIV_INS_FM=1
  FurnaceOPL:    14,  // DIV_INS_OPL=14
  FurnaceOPLL:   13,  // DIV_INS_OPLL=13
  FurnaceVRC7:   13,  // DIV_INS_OPLL=13 (VRC7 uses OPLL format)
  FurnaceOPZ:    19,  // DIV_INS_OPZ=19
  FurnaceOPL4:   14,  // DIV_INS_OPL=14
  FurnaceY8950:  32,  // DIV_INS_OPL_DRUMS=32
  FurnaceESFM:   55,  // DIV_INS_ESFM=55

  // PSG / Chip
  FurnacePSG:      6,  // DIV_INS_AY=6
  FurnaceAY:       6,  // DIV_INS_AY=6
  FurnaceAY8930:   7,  // DIV_INS_AY8930=7
  FurnaceSN:       0,  // DIV_INS_STD=0
  FurnaceNES:     34,  // DIV_INS_NES=34
  FurnaceMMC5:    34,  // DIV_INS_NES=34 (MMC5 uses NES type)
  FurnaceGB:       2,  // DIV_INS_GB=2
  FurnaceC64:      3,  // DIV_INS_C64=3
  FurnaceSID6581:  3,  // DIV_INS_C64=3 (6581 variant)
  FurnaceSID8580:  3,  // DIV_INS_C64=3 (8580 variant)
  FurnacePOKEY:   20,  // DIV_INS_POKEY=20
  FurnaceTED:     52,  // DIV_INS_TED=52
  FurnaceVIC:     10,  // DIV_INS_VIC=10
  FurnaceVERA:    24,  // DIV_INS_VERA=24
  FurnaceSAA:      9,  // DIV_INS_SAA1099=9
  FurnaceTIA:      8,  // DIV_INS_TIA=8
  FurnacePET:     11,  // DIV_INS_PET=11
  FurnacePCSPKR:  21,  // DIV_INS_BEEPER=21
  FurnaceZXBEEPER:21,  // DIV_INS_BEEPER=21
  FurnaceSCVTONE: 21,  // DIV_INS_BEEPER=21 (closest match)
  FurnaceSM8521:  48,  // DIV_INS_SM8521=48
  FurnacePONG:     0,  // DIV_INS_STD=0
  FurnacePV1000:  49,  // DIV_INS_PV1000=49
  FurnaceDAVE:    58,  // DIV_INS_DAVE=58
  FurnaceNDS:     59,  // DIV_INS_NDS=59
  FurnaceGBA:     60,  // DIV_INS_GBA_DMA=60
  FurnacePOKEMINI:47,  // DIV_INS_POKEMINI=47
  FurnaceLynx:    23,  // DIV_INS_MIKEY=23
  FurnaceSWAN:    22,  // DIV_INS_SWAN=22
  FurnaceSU:      30,  // DIV_INS_SU=30
  FurnacePOWERNOISE:56, // DIV_INS_POWERNOISE=56
  FurnaceT6W28:   44,  // DIV_INS_T6W28=44
  FurnaceSUPERVISION:64, // DIV_INS_SUPERVISION=64
  FurnaceUPD1771: 65,  // DIV_INS_UPD1771C=65

  // Wavetable
  FurnaceSCC:    18,  // DIV_INS_SCC=18
  FurnaceN163:   17,  // DIV_INS_N163=17
  FurnaceFDS:    15,  // DIV_INS_FDS=15
  FurnacePCE:     5,  // DIV_INS_PCE=5
  FurnaceVB:     16,  // DIV_INS_VBOY=16
  FurnaceVRC6:   12,  // DIV_INS_VRC6=12
  FurnaceBubSys: 21,  // DIV_INS_BEEPER=21
  FurnaceX1_010: 25,  // DIV_INS_X1_010=25
  FurnaceNAMCO:  31,  // DIV_INS_NAMCO=31
  FurnacePCMDAC: 28,  // DIV_INS_MULTIPCM=28 (closest match)

  // PCM
  FurnaceAMIGA:    4,  // DIV_INS_AMIGA=4
  FurnaceSNES:    29,  // DIV_INS_SNES=29
  FurnaceSEGAPCM: 39,  // DIV_INS_SEGAPCM=39
  FurnaceQSOUND:  40,  // DIV_INS_QSOUND=40
  FurnaceES5506:  27,  // DIV_INS_ES5506=27
  FurnaceRF5C68:  42,  // DIV_INS_RF5C68=42
  FurnaceC140:    53,  // DIV_INS_C140=53
  FurnaceK053260: 50,  // DIV_INS_K053260=50
  FurnaceK007232: 45,  // DIV_INS_K007232=45
  FurnaceGA20:    46,  // DIV_INS_GA20=46
  FurnaceOKI:     36,  // DIV_INS_MSM6295=36
  FurnaceYMZ280B: 41,  // DIV_INS_YMZ280B=41
  FurnaceMSM6258: 35,  // DIV_INS_MSM6258=35
  FurnaceMSM5232: 43,  // DIV_INS_MSM5232=43
  FurnaceMULTIPCM:28,  // DIV_INS_MULTIPCM=28
};

/* ── Field-by-field binary format (0xDE) ───────────────────────────────── *
 * 240 bytes total. See wasm_bridge.cpp for the C-side mirror.
 *
 * Header: [0xDE, version=1, lenLo, lenHi, type, 0, 0, 0]
 * FM:     offset 8  (96 bytes: alg,fb,fms,ams,ops,opllPreset,fixedDrums,fms2 + 4 ops × 22)
 * GB:     offset 104 (8 bytes)
 * C64:    offset 112 (16 bytes)
 * SNES:   offset 128 (8 bytes)
 * N163:   offset 136 (8 bytes)
 * FDS:    offset 144 (44 bytes)
 * ESFM:   offset 188 (36 bytes)
 * ES5506: offset 224 (16 bytes)
 */

function configToBuffer(config: FurnaceConfig, synthType?: SynthType): Uint8Array {
  // Prefer rawBinaryData (native Furnace format) when available
  if (config.rawBinaryData && config.rawBinaryData.length > 4) {
    const magic = String.fromCharCode(...config.rawBinaryData.slice(0, 4));
    console.log(`[FurnaceInsEd] configToBuffer: using rawBinaryData (${config.rawBinaryData.length} bytes, magic="${magic}")`);
    return config.rawBinaryData;
  }

  // Fall back to field-by-field format
  const buf = new Uint8Array(240);
  const dv = new DataView(buf.buffer);

  // Header
  buf[0] = 0xDE;
  buf[1] = 1;
  dv.setUint16(2, 240, true);
  const divInsType = synthType ? (SYNTH_TO_DIV_INS_TYPE[synthType] ?? config.chipType) : config.chipType;
  buf[4] = divInsType & 0xFF;
  console.log(`[FurnaceInsEd] configToBuffer: 0xDE format, synthType=${synthType}, divInsType=${divInsType}`);

  // FM section (offset 8)
  buf[8] = config.algorithm;
  buf[9] = config.feedback;
  buf[10] = config.fms ?? 0;
  buf[11] = config.ams ?? 0;
  buf[12] = config.ops ?? 2;
  buf[13] = config.opllPreset ?? 0;
  buf[14] = config.fixedDrums ? 1 : 0;
  buf[15] = config.fms2 ?? 0;

  // FM operators (4 × 22 bytes at offsets 16, 38, 60, 82)
  for (let i = 0; i < 4; i++) {
    const op = config.operators[i];
    if (!op) continue;
    const off = 16 + i * 22;
    buf[off]    = op.enabled ? 1 : 0;
    buf[off+1]  = op.mult;
    buf[off+2]  = op.tl;
    buf[off+3]  = op.ar;
    buf[off+4]  = op.dr;
    buf[off+5]  = op.d2r;
    buf[off+6]  = op.sl;
    buf[off+7]  = op.rr;
    buf[off+8]  = ((op.dt ?? 0) + 128) & 0xFF; // signed → unsigned
    buf[off+9]  = op.dt2 ?? 0;
    buf[off+10] = op.rs ?? 0;
    buf[off+11] = op.am ? 1 : 0;
    buf[off+12] = op.ksr ? 1 : 0;
    buf[off+13] = op.ksl ?? 0;
    buf[off+14] = op.sus ? 1 : 0;
    buf[off+15] = op.vib ? 1 : 0;
    buf[off+16] = op.ws ?? 0;
    buf[off+17] = op.ssg ?? 0;
    buf[off+18] = op.dam ?? 0;
    buf[off+19] = op.dvb ?? 0;
    buf[off+20] = op.egt ? 1 : 0;
    buf[off+21] = op.kvs ?? 2;
  }

  // GB section (offset 104)
  if (config.gb) {
    buf[104] = config.gb.envVol;
    buf[105] = config.gb.envDir;
    buf[106] = config.gb.envLen;
    buf[107] = config.gb.soundLen;
  }

  // C64 section (offset 112)
  if (config.c64) {
    buf[112] = (config.c64.triOn ? 1 : 0) | (config.c64.sawOn ? 2 : 0) |
               (config.c64.pulseOn ? 4 : 0) | (config.c64.noiseOn ? 8 : 0);
    buf[113] = config.c64.a;
    buf[114] = config.c64.d;
    buf[115] = config.c64.s;
    buf[116] = config.c64.r;
    dv.setUint16(117, config.c64.duty, true);
    buf[119] = config.c64.ringMod ? 1 : 0;
    buf[120] = config.c64.oscSync ? 1 : 0;
    buf[121] = config.c64.filterResonance ?? config.c64.filterRes ?? 0;
    dv.setUint16(122, config.c64.filterCutoff ?? 0, true);
    buf[124] = (config.c64.filterLP ? 1 : 0) | (config.c64.filterBP ? 2 : 0) |
               (config.c64.filterHP ? 4 : 0) | (config.c64.filterCh3Off ? 8 : 0);
    buf[125] = (config.c64.toFilter ? 1 : 0) | (config.c64.initFilter ? 2 : 0) |
               (config.c64.dutyIsAbs ? 4 : 0) | (config.c64.filterIsAbs ? 8 : 0);
  }

  // SNES section (offset 128)
  if (config.snes) {
    buf[128] = config.snes.useEnv ? 1 : 0;
    buf[129] = typeof config.snes.gainMode === 'number' ? config.snes.gainMode : 0;
    buf[130] = config.snes.gain;
    buf[131] = config.snes.a;
    buf[132] = config.snes.d;
    buf[133] = config.snes.s;
    buf[134] = config.snes.r;
    buf[135] = config.snes.d2 ?? 0;
  }

  // N163 section (offset 136)
  if (config.n163) {
    dv.setInt32(136, config.n163.wave, true);
    buf[140] = config.n163.wavePos;
    buf[141] = config.n163.waveLen;
    buf[142] = config.n163.waveMode;
    buf[143] = config.n163.perChPos ? 1 : 0;
  }

  // FDS section (offset 144)
  if (config.fds) {
    dv.setInt32(144, config.fds.modSpeed, true);
    dv.setInt32(148, config.fds.modDepth, true);
    for (let i = 0; i < 32; i++) {
      buf[152 + i] = (config.fds.modTable[i] ?? 0) & 0xFF;
    }
    buf[184] = config.fds.initModTableWithFirstWave ? 1 : 0;
  }

  // ESFM section (offset 188)
  if (config.esfm) {
    buf[188] = config.esfm.noise;
    for (let i = 0; i < 4; i++) {
      const op = config.esfm.operators[i];
      if (!op) continue;
      const off = 189 + i * 8;
      buf[off]   = op.delay;
      buf[off+1] = op.outLvl;
      buf[off+2] = op.modIn;
      buf[off+3] = op.left ? 1 : 0;
      buf[off+4] = op.right ? 1 : 0;
      buf[off+5] = op.ct;
      buf[off+6] = op.dt;
      buf[off+7] = op.fixed ? 1 : 0;
    }
  }

  // ES5506 section (offset 224)
  if (config.es5506) {
    buf[224] = config.es5506.filter.mode;
    dv.setUint16(225, config.es5506.filter.k1, true);
    dv.setUint16(227, config.es5506.filter.k2, true);
    dv.setUint16(229, config.es5506.envelope.ecount, true);
    buf[231] = config.es5506.envelope.lVRamp & 0xFF;
    buf[232] = config.es5506.envelope.rVRamp & 0xFF;
    buf[233] = config.es5506.envelope.k1Ramp & 0xFF;
    buf[234] = config.es5506.envelope.k2Ramp & 0xFF;
    buf[235] = config.es5506.envelope.k1Slow ? 1 : 0;
    buf[236] = config.es5506.envelope.k2Slow ? 1 : 0;
  }

  return buf;
}

/** Parse a 240-byte 0xDE field format dump back into a partial FurnaceConfig */
function bufferToConfig(data: Uint8Array, existingConfig: FurnaceConfig): FurnaceConfig {
  if (data.length < 240 || data[0] !== 0xDE) return existingConfig;

  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chipType = data[4];

  // FM operators
  const operators = [];
  for (let i = 0; i < 4; i++) {
    const off = 16 + i * 22;
    operators.push({
      enabled: data[off] !== 0,
      mult: data[off+1],
      tl: data[off+2],
      ar: data[off+3],
      dr: data[off+4],
      d2r: data[off+5],
      sl: data[off+6],
      rr: data[off+7],
      dt: (data[off+8] << 24) >> 24, // sign-extend from byte
      dt2: data[off+9],
      rs: data[off+10],
      am: data[off+11] !== 0,
      ksr: data[off+12] !== 0,
      ksl: data[off+13],
      sus: data[off+14] !== 0,
      vib: data[off+15] !== 0,
      ws: data[off+16],
      ssg: data[off+17],
      dam: data[off+18],
      dvb: data[off+19],
      egt: data[off+20] !== 0,
      kvs: data[off+21],
    });
  }

  // C64 waveform/filter flags
  const c64wave = data[112];
  const c64filt = data[124];
  const c64misc = data[125];

  return {
    ...existingConfig,
    chipType,
    algorithm: data[8],
    feedback: data[9],
    fms: data[10],
    ams: data[11],
    ops: data[12],
    opllPreset: data[13],
    fixedDrums: data[14] !== 0,
    fms2: data[15],
    operators,
    gb: {
      ...(existingConfig.gb ?? { envVol: 15, envDir: 0, envLen: 2, soundLen: 64 }),
      envVol: data[104],
      envDir: data[105],
      envLen: data[106],
      soundLen: data[107],
    },
    c64: {
      ...(existingConfig.c64 ?? {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 0, d: 8, s: 0, r: 0, duty: 2048, ringMod: false, oscSync: false,
      }),
      triOn: (c64wave & 1) !== 0,
      sawOn: (c64wave & 2) !== 0,
      pulseOn: (c64wave & 4) !== 0,
      noiseOn: (c64wave & 8) !== 0,
      a: data[113],
      d: data[114],
      s: data[115],
      r: data[116],
      duty: dv.getUint16(117, true),
      ringMod: data[119] !== 0,
      oscSync: data[120] !== 0,
      filterResonance: data[121],
      filterCutoff: dv.getUint16(122, true),
      filterLP: (c64filt & 1) !== 0,
      filterBP: (c64filt & 2) !== 0,
      filterHP: (c64filt & 4) !== 0,
      filterCh3Off: (c64filt & 8) !== 0,
      toFilter: (c64misc & 1) !== 0,
      initFilter: (c64misc & 2) !== 0,
      dutyIsAbs: (c64misc & 4) !== 0,
      filterIsAbs: (c64misc & 8) !== 0,
    },
    snes: {
      ...(existingConfig.snes ?? { useEnv: false, gainMode: 0, gain: 0, a: 0, d: 0, s: 0, r: 0 }),
      useEnv: data[128] !== 0,
      gainMode: data[129],
      gain: data[130],
      a: data[131],
      d: data[132],
      s: data[133],
      r: data[134],
      d2: data[135],
    },
    n163: {
      ...(existingConfig.n163 ?? { wave: 0, wavePos: 0, waveLen: 0, waveMode: 0, perChPos: false }),
      wave: dv.getInt32(136, true),
      wavePos: data[140],
      waveLen: data[141],
      waveMode: data[142],
      perChPos: data[143] !== 0,
    },
    fds: {
      ...(existingConfig.fds ?? { modSpeed: 0, modDepth: 0, modTable: new Array(32).fill(0), initModTableWithFirstWave: false }),
      modSpeed: dv.getInt32(144, true),
      modDepth: dv.getInt32(148, true),
      modTable: Array.from({ length: 32 }, (_, i) => (data[152 + i] << 24) >> 24),
      initModTableWithFirstWave: data[184] !== 0,
    },
    esfm: existingConfig.esfm ? {
      ...existingConfig.esfm,
      noise: data[188],
      operators: Array.from({ length: 4 }, (_, i) => {
        const off = 189 + i * 8;
        const base = existingConfig.esfm?.operators[i] ?? {
          enabled: true, mult: 0, tl: 0, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0,
          delay: 0, outLvl: 0, modIn: 0, left: true, right: true, ct: 0, fixed: false, fixedFreq: 0,
        };
        return {
          ...base,
          delay: data[off],
          outLvl: data[off+1],
          modIn: data[off+2],
          left: data[off+3] !== 0,
          right: data[off+4] !== 0,
          ct: data[off+5],
          dt: data[off+6],
          fixed: data[off+7] !== 0,
        };
      }),
    } : existingConfig.esfm,
    es5506: {
      filter: {
        mode: data[224],
        k1: dv.getUint16(225, true),
        k2: dv.getUint16(227, true),
      },
      envelope: {
        ecount: dv.getUint16(229, true),
        lVRamp: (data[231] << 24) >> 24,
        rVRamp: (data[232] << 24) >> 24,
        k1Ramp: (data[233] << 24) >> 24,
        k2Ramp: (data[234] << 24) >> 24,
        k1Slow: data[235] !== 0,
        k2Slow: data[236] !== 0,
      },
    },
  };
}

/* ── Cache-busting version — bump when rebuilding WASM ────────────────── */
const WASM_VERSION = 2;

/* ── Component ─────────────────────────────────────────────────────────── */

export const FurnaceInsEdHardware: React.FC<FurnaceInsEdHardwareProps> = ({
  config,
  onChange,
  synthType,
}) => {
  const configRef = useRef(config);
  const onChangeRef = useRef(onChange);
  const moduleRef = useRef<SDLModule | null>(null);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const configBuffer = useMemo(
    () => configToBuffer(config, synthType),
    [config, synthType],
  );

  // NOTE: handleModuleReady runs BEFORE init — do NOT call WASM functions
  // that need g_engine here. The chip type is set via load_config's buffer.
  const handleModuleReady = useCallback((mod: SDLModule) => {
    moduleRef.current = mod;
  }, []);

  // Dump config from WASM on unmount — captures any edits made in the ImGui UI
  useEffect(() => {
    return () => {
      const mod = moduleRef.current;
      if (!mod) return;

      const dumpConfig = mod['_furnace_insed_dump_config'] as
        ((ptr: number, maxLen: number) => number) | undefined;
      const malloc = mod['_malloc'] as ((size: number) => number) | undefined;
      const free = mod['_free'] as ((ptr: number) => void) | undefined;
      const HEAPU8 = mod['HEAPU8'] as Uint8Array | undefined;

      if (!dumpConfig || !malloc || !free || !HEAPU8) return;

      const ptr = malloc(240);
      if (!ptr) return;

      try {
        const written = dumpConfig(ptr, 240);
        if (written === 240) {
          const dumpData = new Uint8Array(240);
          dumpData.set(HEAPU8.subarray(ptr, ptr + 240));
          const updatedConfig = bufferToConfig(dumpData, configRef.current);
          onChangeRef.current(updatedConfig);
        }
      } finally {
        free(ptr);
      }
    };
  }, []); // Empty deps — runs cleanup only on unmount

  return (
    <SDLHardwareWrapper
      imageRendering="pixelated"
      moduleUrl={`/furnace-gui/FurnaceInsEd.js?v=${WASM_VERSION}`}
      factoryName="createFurnaceInsEd"
      canvasWidth={1280}
      canvasHeight={800}
      initFn="_furnace_insed_init"
      startFn="_furnace_insed_start"
      shutdownFn="_furnace_insed_shutdown"
      loadConfigFn="_furnace_insed_load_config"
      configBuffer={configBuffer}
      onModuleReady={handleModuleReady}
      className="w-full"
    />
  );
};

/** Check if a SynthType is any Furnace type that can use the insEdit WASM module */
// eslint-disable-next-line react-refresh/only-export-components
export function isFurnaceInsEdType(synthType: SynthType): boolean {
  return synthType in SYNTH_TO_DIV_INS_TYPE;
}
