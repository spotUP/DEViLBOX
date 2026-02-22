/**
 * FurnaceWaveHardware — SDL2/WASM hardware UI for Furnace wavetable chip synths
 *
 * Maps FurnaceConfig → 300-byte packed buffer for the furnace_wave C module.
 * Handles onParamChange / onWaveDraw callbacks back to FurnaceConfig updates.
 *
 * Covers 10 wavetable chip types:
 * SCC, N163, FDS, PCE, VB, SWAN, Lynx, X1_010, BUBBLE, NAMCO
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { SDLHardwareWrapper, type SDLModule } from './SDLHardwareWrapper';
import type { FurnaceConfig, SynthType } from '@typedefs/instrument';

interface FurnaceWaveHardwareProps {
  config: FurnaceConfig;
  onChange: (config: FurnaceConfig) => void;
}

/* ── SynthType → C PSG_CHIP_* subtype index ──────────────────────────── */

const SYNTH_TO_SUBTYPE: Record<string, number> = {
  FurnaceSCC: 0,      // WAVE_CHIP_SCC
  FurnaceN163: 1,     // WAVE_CHIP_N163
  FurnaceFDS: 2,      // WAVE_CHIP_FDS
  FurnacePCE: 3,      // WAVE_CHIP_PCE
  FurnaceVB: 4,       // WAVE_CHIP_VB
  FurnaceSWAN: 5,     // WAVE_CHIP_SWAN
  FurnaceLynx: 6,     // WAVE_CHIP_LYNX
  FurnaceX1_010: 7,   // WAVE_CHIP_X1_010
  FurnaceBUBBLE: 8,   // WAVE_CHIP_BUBBLE
  FurnaceNAMCO: 9,    // WAVE_CHIP_NAMCO
};

/* ── Param IDs (must match furnace_wave.c constants) ─────────────────── */

const PARAM = {
  WAVE_SELECT: 0,
  WAVE_LEN: 1,
  FDS_MOD_SPEED: 2,
  FDS_MOD_DEPTH: 3,
  N163_POS: 4,
  N163_LEN: 5,
  N163_MODE: 6,
} as const;

/* ── Default wave lengths per chip ───────────────────────────────────── */

const DEFAULT_WAVE_LEN: Record<number, number> = {
  0: 32,   // SCC
  1: 32,   // N163
  2: 64,   // FDS
  3: 32,   // PCE
  4: 32,   // VB
  5: 32,   // SWAN
  6: 32,   // Lynx
  7: 128,  // X1_010
  8: 32,   // BUBBLE
  9: 32,   // NAMCO
};

/* ── Config → Buffer serialization ───────────────────────────────────── */

function configToBuffer(config: FurnaceConfig, synthType: string): Uint8Array {
  const buf = new Uint8Array(300); // WAVE_CONFIG_SIZE

  const subtype = SYNTH_TO_SUBTYPE[synthType] ?? 0;
  const waveCount = config.wavetables?.length ?? 0;
  const currentWave = 0; // Always show first wavetable
  const waveLen = config.wavetables?.[0]?.len ?? DEFAULT_WAVE_LEN[subtype] ?? 32;

  // Header (4 bytes)
  buf[0] = subtype;
  buf[1] = waveCount & 0xFF;
  buf[2] = currentWave;
  buf[3] = waveLen & 0xFF;

  // Wave data (256 bytes at offset 4)
  const waveData = config.wavetables?.[0]?.data ?? [];
  for (let i = 0; i < 256 && i < waveData.length; i++) {
    buf[4 + i] = waveData[i] & 0xFF;
  }

  // FDS modulation (36 bytes at offset 260)
  if (subtype === 2 && config.fds) { // FDS chip
    const modTable = config.fds.modTable ?? [];
    for (let i = 0; i < 32; i++) {
      buf[260 + i] = (modTable[i] ?? 0) & 0xFF; // signed stored as uint8
    }
    const modSpeed = config.fds.modSpeed ?? 0;
    buf[292] = modSpeed & 0xFF;
    buf[293] = (modSpeed >> 8) & 0xFF;
    buf[294] = (config.fds.modDepth ?? 0) & 0xFF;
  }

  // N163 settings (4 bytes at offset 296)
  if (subtype === 1 && config.n163) { // N163 chip
    buf[296] = (config.n163.wavePos ?? 0) & 0xFF;
    buf[297] = (config.n163.waveLen ?? 32) & 0xFF;
    buf[298] = (config.n163.waveMode ?? 0) & 0xFF;
  }

  return buf;
}

/* ── Component ───────────────────────────────────────────────────────── */

export const FurnaceWaveHardware: React.FC<FurnaceWaveHardwareProps & { synthType?: SynthType }> = ({
  config,
  onChange,
  synthType,
}) => {
  const configRef = useRef(config);
  const onChangeRef = useRef(onChange);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const st = synthType ?? 'FurnaceSCC';
  const configBuffer = useMemo(() => configToBuffer(config, st), [config, st]);

  const handleModuleReady = useCallback((mod: SDLModule) => {
    /* Parameter changes */
    mod.onParamChange = (paramId: number, value: number) => {
      const c = { ...configRef.current };
      switch (paramId) {
        case PARAM.FDS_MOD_SPEED:
          c.fds = { ...c.fds!, modSpeed: value };
          break;
        case PARAM.FDS_MOD_DEPTH:
          c.fds = { ...c.fds!, modDepth: value };
          break;
        case PARAM.N163_POS:
          c.n163 = { ...c.n163!, wavePos: value };
          break;
        case PARAM.N163_LEN:
          c.n163 = { ...c.n163!, waveLen: value };
          break;
        case PARAM.N163_MODE:
          c.n163 = { ...c.n163!, waveMode: value };
          break;
      }
      configRef.current = c;
      onChangeRef.current(c);
    };

    /* Wavetable draw */
    (mod as SDLModule & { onWaveDraw?: (index: number, value: number) => void }).onWaveDraw = (index: number, value: number) => {
      const c = { ...configRef.current };
      const wavetables = [...(c.wavetables ?? [])];
      if (wavetables.length === 0) {
        wavetables.push({ id: 0, data: [], len: DEFAULT_WAVE_LEN[SYNTH_TO_SUBTYPE[st] ?? 0] ?? 32 });
      }
      const wave = { ...wavetables[0] };
      const data = [...wave.data];
      data[index] = value;
      wave.data = data;
      wavetables[0] = wave;
      c.wavetables = wavetables;
      configRef.current = c;
      onChangeRef.current(c);
    };
  }, [st]);

  return (
    <SDLHardwareWrapper
      moduleUrl="/furnace/FurnaceWave.js"
      factoryName="createFurnaceWave"
      canvasWidth={560}
      canvasHeight={400}
      initFn="_furnace_wave_init"
      startFn="_furnace_wave_start"
      shutdownFn="_furnace_wave_shutdown"
      loadConfigFn="_furnace_wave_load_config"
      configBuffer={configBuffer}
      onModuleReady={handleModuleReady}
    />
  );
};

/** Check if a SynthType is a Furnace wavetable type */
// eslint-disable-next-line react-refresh/only-export-components
export function isFurnaceWaveType(synthType: SynthType): boolean {
  return synthType in SYNTH_TO_SUBTYPE;
}
