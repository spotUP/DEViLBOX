/**
 * MAMEGenericHardware — SDL2/WASM hardware UI for any MAME chip synth
 *
 * Reads ChipParameterDef[] from chipParameters.ts, serializes parameter
 * metadata into the init buffer protocol, and wraps SDLHardwareWrapper.
 *
 * This single component covers 25+ MAME chip types.
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { SDLHardwareWrapper, type SDLModule } from './SDLHardwareWrapper';
import { getChipSynthDef, type ChipSynthDef } from '@/constants/chipParameters';
import type { SynthType } from '@typedefs/instrument';

interface MAMEGenericHardwareProps {
  synthType: SynthType;
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/* ── Serialize parameter metadata to init buffer ───────────────────────── */

function buildInitBuffer(def: ChipSynthDef): Uint8Array {
  /* Filter to only knob/select/toggle types (skip text, vowelEditor) */
  const params = def.parameters.filter(
    (p) => p.type === 'knob' || p.type === 'select' || p.type === 'toggle',
  );

  /* Estimate buffer size (generous upper bound) */
  const bufSize = 256 + params.length * 256;
  const buf = new Uint8Array(bufSize);
  let pos = 0;

  /* param_count */
  buf[pos++] = params.length;

  /* accent_color_rgb — parse hex color string */
  const color = def.color || '#44BBBB';
  const r = parseInt(color.slice(1, 3), 16) || 0x44;
  const g = parseInt(color.slice(3, 5), 16) || 0xBB;
  const b = parseInt(color.slice(5, 7), 16) || 0xBB;
  buf[pos++] = r;
  buf[pos++] = g;
  buf[pos++] = b;

  /* chip_name */
  const nameBytes = new TextEncoder().encode(def.name);
  buf[pos++] = nameBytes.length;
  buf.set(nameBytes, pos);
  pos += nameBytes.length;

  /* subtitle */
  const subBytes = new TextEncoder().encode(def.subtitle);
  buf[pos++] = subBytes.length;
  buf.set(subBytes, pos);
  pos += subBytes.length;

  /* Per-parameter metadata */
  for (const p of params) {
    /* type */
    const typeMap: Record<string, number> = { knob: 0, select: 1, toggle: 2 };
    buf[pos++] = typeMap[p.type] ?? 0;

    /* label */
    const labelBytes = new TextEncoder().encode(p.label);
    buf[pos++] = labelBytes.length;
    buf.set(labelBytes, pos);
    pos += labelBytes.length;

    /* group */
    const groupBytes = new TextEncoder().encode(p.group);
    buf[pos++] = groupBytes.length;
    buf.set(groupBytes, pos);
    pos += groupBytes.length;

    /* min, max, step, value (float32 LE) */
    const dv = new DataView(buf.buffer, buf.byteOffset + pos, 16);
    dv.setFloat32(0, p.min ?? 0, true);
    dv.setFloat32(4, p.max ?? 1, true);
    dv.setFloat32(8, p.step ?? 0.01, true);
    dv.setFloat32(12, p.default, true);
    pos += 16;

    /* option_count */
    const opts = p.options ?? [];
    buf[pos++] = opts.length;

    /* Per-option */
    for (const opt of opts) {
      /* opt_value (float32 LE) */
      const odv = new DataView(buf.buffer, buf.byteOffset + pos, 4);
      odv.setFloat32(0, opt.value, true);
      pos += 4;

      /* opt_label */
      const olBytes = new TextEncoder().encode(opt.label);
      buf[pos++] = olBytes.length;
      buf.set(olBytes, pos);
      pos += olBytes.length;
    }
  }

  return buf.slice(0, pos);
}

/* ── Serialize current parameter values to config buffer ───────────────── */

function buildConfigBuffer(
  def: ChipSynthDef,
  parameters: Record<string, number>,
): Uint8Array {
  const params = def.parameters.filter(
    (p) => p.type === 'knob' || p.type === 'select' || p.type === 'toggle',
  );
  const buf = new Uint8Array(params.length * 4);
  const dv = new DataView(buf.buffer);

  for (let i = 0; i < params.length; i++) {
    const val = parameters[params[i].key] ?? params[i].default;
    dv.setFloat32(i * 4, val, true);
  }

  return buf;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export const MAMEGenericHardware: React.FC<MAMEGenericHardwareProps> = ({
  synthType,
  parameters,
  onParamChange,
}) => {
  const def = useMemo(() => getChipSynthDef(synthType), [synthType]);
  const onChangeRef = useRef(onParamChange);
  useEffect(() => { onChangeRef.current = onParamChange; }, [onParamChange]);

  /* Filtered param list (same filtering as init buffer) */
  const filteredParams = useMemo(
    () => (def?.parameters ?? []).filter(
      (p) => p.type === 'knob' || p.type === 'select' || p.type === 'toggle',
    ),
    [def],
  );

  const initBuffer = useMemo(() => {
    if (!def) return new Uint8Array(0);
    return buildInitBuffer(def);
  }, [def]);

  const configBuffer = useMemo(() => {
    if (!def) return new Uint8Array(0);
    return buildConfigBuffer(def, parameters);
  }, [def, parameters]);

  const handleModuleReady = useCallback((mod: SDLModule) => {
    mod.onParamChange = (paramIndex: number, value: number) => {
      if (paramIndex >= 0 && paramIndex < filteredParams.length) {
        onChangeRef.current(filteredParams[paramIndex].key, value);
      }
    };
  }, [filteredParams]);

  if (!def) {
    return (
      <div className="p-4 text-gray-500 text-center">
        No parameter definitions for {synthType}
      </div>
    );
  }

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
