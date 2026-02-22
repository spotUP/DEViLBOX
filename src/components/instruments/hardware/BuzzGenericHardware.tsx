/**
 * BuzzGenericHardware — SDL2/WASM hardware UI for Buzzmachine synths
 *
 * Reuses the MAMEGeneric WASM module with Buzzmachine parameter definitions.
 * Buzzmachines use the same generic parameterized approach since they have
 * similar parameter structures (knobs, selects, toggles).
 *
 * This single component covers 42+ Buzzmachine types.
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { SDLHardwareWrapper, type SDLModule } from './SDLHardwareWrapper';
import type { SynthType } from '@typedefs/instrument';

interface BuzzGenericHardwareProps {
  synthType: SynthType;
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/** Simple parameter definition for Buzz synths */
interface BuzzParamDef {
  key: string;
  label: string;
  group: string;
  type: 'knob' | 'select' | 'toggle';
  min: number;
  max: number;
  step: number;
  default: number;
  options?: { value: number; label: string }[];
}

/**
 * Get Buzz synth metadata. In the future this could be a proper registry;
 * for now we auto-generate from the synth type name + parameters map.
 */
function getBuzzSynthInfo(synthType: string): {
  name: string;
  subtitle: string;
  color: string;
  params: BuzzParamDef[];
} {
  /* Extract machine name from synth type (e.g., 'BuzzDTMF' → 'DTMF') */
  const machineName = synthType.replace(/^Buzz/, '');

  return {
    name: machineName,
    subtitle: `Buzz Machine: ${machineName}`,
    color: '#f59e0b', /* Amber for Buzz machines */
    params: [], /* Will be populated from parameters prop */
  };
}

/** Build init buffer from parameter keys + current values */
function buildInitBufferFromParams(
  name: string,
  subtitle: string,
  color: string,
  parameters: Record<string, number>,
): Uint8Array {
  const paramKeys = Object.keys(parameters);
  const bufSize = 256 + paramKeys.length * 128;
  const buf = new Uint8Array(bufSize);
  let pos = 0;

  /* param_count */
  buf[pos++] = paramKeys.length;

  /* accent_color_rgb */
  const r = parseInt(color.slice(1, 3), 16) || 0xF5;
  const g = parseInt(color.slice(3, 5), 16) || 0x9E;
  const b = parseInt(color.slice(5, 7), 16) || 0x0B;
  buf[pos++] = r;
  buf[pos++] = g;
  buf[pos++] = b;

  /* chip_name */
  const nameBytes = new TextEncoder().encode(name);
  buf[pos++] = nameBytes.length;
  buf.set(nameBytes, pos);
  pos += nameBytes.length;

  /* subtitle */
  const subBytes = new TextEncoder().encode(subtitle);
  buf[pos++] = subBytes.length;
  buf.set(subBytes, pos);
  pos += subBytes.length;

  /* Per-parameter: infer types from key names and values */
  for (const key of paramKeys) {
    const val = parameters[key] ?? 0;

    /* Type: guess from value range */
    buf[pos++] = 0; /* knob by default */

    /* Label: format key name */
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const labelBytes = new TextEncoder().encode(label);
    buf[pos++] = labelBytes.length;
    buf.set(labelBytes, pos);
    pos += labelBytes.length;

    /* Group: 'Parameters' */
    const group = 'Parameters';
    const groupBytes = new TextEncoder().encode(group);
    buf[pos++] = groupBytes.length;
    buf.set(groupBytes, pos);
    pos += groupBytes.length;

    /* min, max, step, value */
    const dv = new DataView(buf.buffer, buf.byteOffset + pos, 16);
    dv.setFloat32(0, 0, true);       /* min */
    dv.setFloat32(4, 1, true);       /* max */
    dv.setFloat32(8, 0.01, true);    /* step */
    dv.setFloat32(12, val, true);    /* value */
    pos += 16;

    /* option_count = 0 (knobs have no options) */
    buf[pos++] = 0;
  }

  return buf.slice(0, pos);
}

function buildConfigBuffer(parameters: Record<string, number>): Uint8Array {
  const keys = Object.keys(parameters);
  const buf = new Uint8Array(keys.length * 4);
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < keys.length; i++) {
    dv.setFloat32(i * 4, parameters[keys[i]] ?? 0, true);
  }
  return buf;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export const BuzzGenericHardware: React.FC<BuzzGenericHardwareProps> = ({
  synthType,
  parameters,
  onParamChange,
}) => {
  const onChangeRef = useRef(onParamChange);
  useEffect(() => { onChangeRef.current = onParamChange; }, [onParamChange]);

  const paramKeys = useMemo(() => Object.keys(parameters), [parameters]);
  const info = useMemo(() => getBuzzSynthInfo(synthType), [synthType]);

  const initBuffer = useMemo(
    () => buildInitBufferFromParams(info.name, info.subtitle, info.color, parameters),
    [info, parameters],
  );

  const configBuffer = useMemo(
    () => buildConfigBuffer(parameters),
    [parameters],
  );

  const handleModuleReady = useCallback((mod: SDLModule) => {
    mod.onParamChange = (paramIndex: number, value: number) => {
      if (paramIndex >= 0 && paramIndex < paramKeys.length) {
        onChangeRef.current(paramKeys[paramIndex], value);
      }
    };
  }, [paramKeys]);

  return (
    <SDLHardwareWrapper
      moduleUrl="/mame-generic/MAMEGeneric.js"
      factoryName="createMAMEGeneric"
      canvasWidth={560}
      canvasHeight={360}
      initFn="_mame_generic_init_with_data"
      startFn="_mame_generic_start"
      shutdownFn="_mame_generic_shutdown"
      loadConfigFn="_mame_generic_load_config"
      configBuffer={configBuffer}
      initBuffer={initBuffer}
      initWithDataFn="_mame_generic_init_with_data"
      onModuleReady={handleModuleReady}
    />
  );
};
