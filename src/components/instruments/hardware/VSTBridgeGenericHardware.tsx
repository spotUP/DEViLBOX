/**
 * VSTBridgeGenericHardware — SDL2/WASM hardware UI for VSTBridge synth plugins
 *
 * Renders a modern-styled parameterized control panel for VSTBridge synths:
 * Vital, Odin2, Surge, TonewheelOrgan, Melodica, Monique, Helm,
 * Sorcer, amsynth, OBXf, Open303
 *
 * Uses the same init buffer protocol as MAME Generic but with a wider canvas
 * (640x400) and darker, more modern visual style. Parameters are inferred
 * from the parameters prop (like BuzzGenericHardware).
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { SDLHardwareWrapper, type SDLModule } from './SDLHardwareWrapper';
import type { SynthType } from '@typedefs/instrument';

/* ── Props ─────────────────────────────────────────────────────────────── */

interface VSTBridgeGenericHardwareProps {
  synthType: SynthType;
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/* ── VSTBridge Synth Types ─────────────────────────────────────────────── */

const VSTBRIDGE_TYPES: SynthType[] = [
  'Vital' as SynthType,
  'Odin2' as SynthType,
  'Surge' as SynthType,
  'TonewheelOrgan' as SynthType,
  'Melodica' as SynthType,
  'Monique' as SynthType,
  'Helm' as SynthType,
  'Sorcer' as SynthType,
  'amsynth' as SynthType,
  'OBXf' as SynthType,
  'Open303' as SynthType,
];

/** Check if a synth type is a VSTBridge type */
export function isVSTBridgeType(synthType: SynthType): boolean {
  return VSTBRIDGE_TYPES.includes(synthType);
}

/* ── Synth Info (name + accent color) ──────────────────────────────────── */

const SYNTH_INFO: Record<string, { name: string; color: [number, number, number] }> = {
  Vital: { name: 'Vital', color: [0, 200, 255] },
  Odin2: { name: 'Odin2', color: [255, 140, 0] },
  Surge: { name: 'Surge XT', color: [100, 180, 255] },
  TonewheelOrgan: { name: 'Tonewheel Organ', color: [180, 120, 60] },
  Melodica: { name: 'Melodica', color: [255, 100, 100] },
  Monique: { name: 'Monique', color: [200, 50, 200] },
  Helm: { name: 'Helm', color: [50, 200, 50] },
  Sorcer: { name: 'Sorcer', color: [200, 200, 50] },
  amsynth: { name: 'amsynth', color: [100, 100, 255] },
  OBXf: { name: 'OB-Xf', color: [255, 200, 50] },
  Open303: { name: 'Open303', color: [255, 80, 0] },
};

/* ── Buffer Builders ───────────────────────────────────────────────────── */

/**
 * Build init buffer from parameter keys + current values.
 * Same binary protocol as MAME Generic init buffer.
 * All parameters are treated as knobs by default (type 0).
 */
function buildInitBuffer(
  synthType: string,
  parameters: Record<string, number>,
): Uint8Array {
  const info = SYNTH_INFO[synthType] ?? { name: synthType, color: [68, 187, 187] };
  const paramKeys = Object.keys(parameters);

  /* Estimate buffer size (generous upper bound) */
  const bufSize = 256 + paramKeys.length * 128;
  const buf = new Uint8Array(bufSize);
  let pos = 0;

  /* param_count */
  buf[pos++] = paramKeys.length;

  /* accent_color_rgb */
  buf[pos++] = info.color[0];
  buf[pos++] = info.color[1];
  buf[pos++] = info.color[2];

  /* synth name */
  const nameBytes = new TextEncoder().encode(info.name);
  buf[pos++] = nameBytes.length;
  buf.set(nameBytes, pos);
  pos += nameBytes.length;

  /* subtitle (empty — VSTBridge module ignores it, but protocol requires it) */
  buf[pos++] = 0;

  /* Per-parameter metadata */
  for (const key of paramKeys) {
    const val = parameters[key] ?? 0;

    /* Type: 0 = knob (all params are knobs by default) */
    buf[pos++] = 0;

    /* Label: format key name (camelCase/snake_case -> Title Case) */
    const label = key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (c) => c.toUpperCase());
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

    /* min, max, step, value (float32 LE) */
    const dv = new DataView(buf.buffer, buf.byteOffset + pos, 16);
    dv.setFloat32(0, 0, true);     /* min */
    dv.setFloat32(4, 1, true);     /* max */
    dv.setFloat32(8, 0.01, true);  /* step */
    dv.setFloat32(12, val, true);  /* value */
    pos += 16;

    /* option_count = 0 (knobs have no options) */
    buf[pos++] = 0;
  }

  return buf.slice(0, pos);
}

/** Serialize current parameter values to config buffer (float32 LE array) */
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

export const VSTBridgeGenericHardware: React.FC<VSTBridgeGenericHardwareProps> = ({
  synthType,
  parameters,
  onParamChange,
}) => {
  /* configRef pattern per CLAUDE.md — prevents stale state in callbacks */
  const parametersRef = useRef(parameters);
  useEffect(() => { parametersRef.current = parameters; }, [parameters]);

  const onChangeRef = useRef(onParamChange);
  useEffect(() => { onChangeRef.current = onParamChange; }, [onParamChange]);

  const initBuffer = useMemo(
    () => buildInitBuffer(synthType, parameters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [synthType], /* Only rebuild init buffer when synth type changes, not on every param change */
  );

  const configBuffer = useMemo(
    () => buildConfigBuffer(parameters),
    [parameters],
  );

  const handleModuleReady = useCallback((mod: SDLModule) => {
    mod.onParamChange = (paramIndex: number, value: number) => {
      const keys = Object.keys(parametersRef.current);
      if (paramIndex >= 0 && paramIndex < keys.length) {
        onChangeRef.current(keys[paramIndex], value);
      }
    };
  }, []); /* Stable — uses refs internally */

  return (
    <SDLHardwareWrapper
      moduleUrl="/vstbridge/VSTBridgeGeneric.js"
      factoryName="createVSTBridgeGeneric"
      canvasWidth={640}
      canvasHeight={400}
      initFn="_vstbridge_generic_init_with_data"
      startFn="_vstbridge_generic_start"
      shutdownFn="_vstbridge_generic_shutdown"
      loadConfigFn="_vstbridge_generic_load_config"
      configBuffer={configBuffer}
      initBuffer={initBuffer}
      initWithDataFn="_vstbridge_generic_init_with_data"
      onModuleReady={handleModuleReady}
    />
  );
};
