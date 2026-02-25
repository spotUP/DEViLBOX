/**
 * FurnacePCMHardware — SDL2/WASM hardware UI for Furnace PCM chip synths
 *
 * Maps FurnaceConfig → 20-byte packed buffer for the furnace_pcm C module.
 * Handles onParamChange callbacks back to FurnaceConfig updates.
 *
 * Covers 12 PCM chip types:
 * SEGAPCM, QSOUND, ES5506, RF5C68, C140, K007232, K053260, GA20,
 * OKI, YMZ280B, MULTIPCM, AMIGA
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { SDLHardwareWrapper, type SDLModule } from './SDLHardwareWrapper';
import type { FurnaceConfig, SynthType } from '@typedefs/instrument';

interface FurnacePCMHardwareProps {
  config: FurnaceConfig;
  onChange: (config: FurnaceConfig) => void;
}

/* ── SynthType string → chip subtype number (must match furnace_pcm.h PCM_CHIP_*) ── */

const SYNTH_TO_SUBTYPE: Record<string, number> = {
  FurnaceSEGAPCM: 0,
  FurnaceQSOUND: 1,
  FurnaceES5506: 2,
  FurnaceRF5C68: 3,
  FurnaceC140: 4,
  FurnaceK007232: 5,
  FurnaceK053260: 6,
  FurnaceGA20: 7,
  FurnaceOKI: 8,
  FurnaceYMZ280B: 9,
  FurnaceMULTIPCM: 10,
  FurnaceAMIGA: 11,
};

/* ── Param IDs (must match furnace_pcm.c PARAM_* constants) ────────────── */

const PARAM = {
  SAMPLE_RATE:   0,
  BIT_DEPTH:     1,
  LOOP_ENABLE:   2,
  LOOP_MODE:     3,
  LOOP_START:    4,
  LOOP_END:      5,
  FILTER_ENABLE: 6,
  FILTER_K1:     7,
  FILTER_K2:     8,
} as const;

/* ── Config → Buffer serialization (20 bytes per PCM_CONFIG_SIZE) ──────── */

function configToBuffer(config: FurnaceConfig, synthType?: SynthType): Uint8Array {
  const buf = new Uint8Array(20); // PCM_CONFIG_SIZE

  /* Determine chip subtype from SynthType string or chipType number */
  let subtype: number;
  if (synthType && synthType in SYNTH_TO_SUBTYPE) {
    subtype = SYNTH_TO_SUBTYPE[synthType];
  } else {
    subtype = getChipSubtype(config);
  }

  const pcm = config.pcm;
  const es5506 = config.es5506;

  /* Header (8 bytes) */
  buf[0] = subtype;
  buf[1] = pcm?.bitDepth ?? 8;
  buf[2] = pcm?.loopEnabled ? 1 : 0;
  buf[3] = 0; // loop mode — default forward

  const sampleRate = pcm?.sampleRate ?? 22050;
  buf[4] = sampleRate & 0xFF;
  buf[5] = (sampleRate >> 8) & 0xFF;

  buf[6] = es5506?.filter?.mode ? 1 : 0;  // filter_enable for ES5506
  buf[7] = 0; // reserved

  /* Loop points (8 bytes) */
  const loopStart = pcm?.loopStart ?? 0;
  const loopEnd = pcm?.loopEnd ?? pcm?.loopPoint ?? 0;

  buf[8]  = loopStart & 0xFF;
  buf[9]  = (loopStart >> 8) & 0xFF;
  buf[10] = (loopStart >> 16) & 0xFF;
  buf[11] = (loopStart >> 24) & 0xFF;
  buf[12] = loopEnd & 0xFF;
  buf[13] = (loopEnd >> 8) & 0xFF;
  buf[14] = (loopEnd >> 16) & 0xFF;
  buf[15] = (loopEnd >> 24) & 0xFF;

  /* ES5506 filter (4 bytes) */
  const k1 = es5506?.filter?.k1 ?? 0;
  const k2 = es5506?.filter?.k2 ?? 0;
  buf[16] = k1 & 0xFF;
  buf[17] = (k1 >> 8) & 0xFF;
  buf[18] = k2 & 0xFF;
  buf[19] = (k2 >> 8) & 0xFF;

  return buf;
}

/* ── chipType number → PCM subtype index mapping ───────────────────────── */

function getChipSubtype(config: FurnaceConfig): number {
  return SYNTH_TO_SUBTYPE[`Furnace${getChipSuffix(config.chipType)}`] ?? 0;
}

function getChipSuffix(chipType: number): string {
  const map: Record<number, string> = {
    40: 'SEGAPCM',
    41: 'QSOUND',
    42: 'ES5506',
    43: 'RF5C68',
    44: 'C140',
    45: 'K007232',
    46: 'K053260',
    47: 'GA20',
    48: 'OKI',
    49: 'YMZ280B',
    50: 'MULTIPCM',
    51: 'AMIGA',
  };
  return map[chipType] ?? 'SEGAPCM';
}

/* ── Component ─────────────────────────────────────────────────────────── */

export const FurnacePCMHardware: React.FC<FurnacePCMHardwareProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  const onChangeRef = useRef(onChange);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const configBuffer = useMemo(() => configToBuffer(config), [config]);

  const handleModuleReady = useCallback((mod: SDLModule) => {
    mod.onParamChange = (paramId: number, value: number) => {
      const c = { ...configRef.current };

      switch (paramId) {
        case PARAM.SAMPLE_RATE:
          c.pcm = { ...c.pcm!, sampleRate: value };
          break;

        case PARAM.BIT_DEPTH:
          c.pcm = { ...c.pcm!, bitDepth: value };
          break;

        case PARAM.LOOP_ENABLE:
          c.pcm = { ...c.pcm!, loopEnabled: !!value };
          break;

        case PARAM.LOOP_MODE:
          // Loop mode stored locally — no direct FurnaceConfig field,
          // but we propagate it via the config buffer
          break;

        case PARAM.LOOP_START:
          c.pcm = { ...c.pcm!, loopStart: value };
          break;

        case PARAM.LOOP_END:
          c.pcm = { ...c.pcm!, loopEnd: value, loopPoint: value };
          break;

        case PARAM.FILTER_ENABLE:
          c.es5506 = {
            ...c.es5506!,
            filter: { ...c.es5506?.filter!, mode: value ? 1 : 0 },
          };
          break;

        case PARAM.FILTER_K1:
          c.es5506 = {
            ...c.es5506!,
            filter: { ...c.es5506?.filter!, k1: value },
          };
          break;

        case PARAM.FILTER_K2:
          c.es5506 = {
            ...c.es5506!,
            filter: { ...c.es5506?.filter!, k2: value },
          };
          break;
      }

      configRef.current = c;
      onChangeRef.current(c);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SDLHardwareWrapper
      imageRendering="auto"
      moduleUrl="/furnace/FurnacePCM.js"
      factoryName="createFurnacePCM"
      canvasWidth={480}
      canvasHeight={320}
      initFn="_furnace_pcm_init"
      startFn="_furnace_pcm_start"
      shutdownFn="_furnace_pcm_shutdown"
      loadConfigFn="_furnace_pcm_load_config"
      configBuffer={configBuffer}
      onModuleReady={handleModuleReady}
    />
  );
};

/** Check if a SynthType is a Furnace PCM type */
// eslint-disable-next-line react-refresh/only-export-components
export function isFurnacePCMType(synthType: SynthType): boolean {
  return synthType in SYNTH_TO_SUBTYPE;
}
