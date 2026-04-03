/**
 * PixiDynamicParamPanel — Generic parameter panel for synths with runtime-discovered params.
 * Used for Buzzmachines, MAME chips, VSTBridge, WAM, and any synth that exposes
 * parameters dynamically rather than through static layout descriptors.
 *
 * Renders a scrollable grid of PixiKnobs generated from parameter metadata.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiScrollView } from '../../components';
import { getToneEngine } from '../../../engine/ToneEngine';
import type { InstrumentConfig } from '../../../types/instrument';

interface DynamicParam {
  id: number | string;
  name: string;
  min: number;
  max: number;
  value: number;
  defaultValue?: number;
}

interface PixiDynamicParamPanelProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
  /** Panel title */
  title?: string;
}

/** Format a camelCase or snake_case parameter name to Title Case */
function formatParamName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .substring(0, 12); // Truncate for knob labels
}

/** Assign a color from a fixed palette based on index */
const PARAM_COLORS = [
  '#ff9900', '#ffcc00', '#22c55e', '#33ccff', '#9966ff',
  '#cc66ff', '#ff3366', '#ff6600', '#66ccff', '#06b6d4',
];

export const PixiDynamicParamPanel: React.FC<PixiDynamicParamPanelProps> = ({ instrument, onChange: _onChange, title }) => {
  const [params, setParams] = useState<DynamicParam[]>([]);
  const valuesRef = useRef<Record<string | number, number>>({});

  // Discover parameters from the running synth instance
  useEffect(() => {
    const discover = async () => {
      try {
        const engine = getToneEngine();
        await engine.ensureInstrumentReady(instrument);
        const key = engine.getInstrumentKey(instrument.id, -1);
        const synth = engine.instruments.get(key);
        if (!synth) return;

        let discovered: DynamicParam[] = [];

        // Buzzmachine — has getParameters()
        if ('getParameters' in synth && typeof (synth as any).getParameters === 'function') {
          const buzzParams = (synth as any).getParameters() as Array<{
            index: number; name: string; minValue: number; maxValue: number; defaultValue: number;
          }>;
          discovered = buzzParams.map(p => ({
            id: p.index,
            name: p.name,
            min: p.minValue,
            max: p.maxValue,
            value: p.defaultValue,
            defaultValue: p.defaultValue,
          }));
        }
        // VSTBridge / MAME — has getAutomatableParams() or getParams()
        else if ('getAutomatableParams' in synth && typeof (synth as any).getAutomatableParams === 'function') {
          const vstParams = (synth as any).getAutomatableParams() as Array<{
            id: number; name: string; min: number; max: number; defaultValue: number;
          }>;
          discovered = vstParams.map(p => ({
            id: p.id,
            name: p.name,
            min: p.min,
            max: p.max,
            value: p.defaultValue,
            defaultValue: p.defaultValue,
          }));
        }
        // Generic — has params array or parameterDescriptors
        else if ('params' in synth && Array.isArray((synth as any).params)) {
          discovered = ((synth as any).params as DynamicParam[]);
        }

        // Read current values
        const values: Record<string | number, number> = {};
        for (const p of discovered) {
          if ('get' in synth && typeof (synth as any).get === 'function') {
            try {
              const v = (synth as any).get(String(p.name));
              if (typeof v === 'number') {
                p.value = v;
              }
            } catch { /* use default */ }
          }
          values[p.id] = p.value;
        }
        valuesRef.current = values;
        setParams(discovered);
      } catch { /* engine not ready */ }
    };
    discover();
  }, [instrument.id, instrument.synthType]);

  const handleParamChange = useCallback((paramId: string | number, value: number) => {
    valuesRef.current[paramId] = value;
    setParams(prev => prev.map(p => p.id === paramId ? { ...p, value } : p));

    try {
      const engine = getToneEngine();
      const key = engine.getInstrumentKey(instrument.id, -1);
      const synth = engine.instruments.get(key);
      if (!synth) return;

      // Try setParameter(id, value) — works for Buzz, MAME, VSTBridge
      if ('setParameter' in synth && typeof (synth as any).setParameter === 'function') {
        (synth as any).setParameter(paramId, value);
      }
      // Fallback: set(name, value)
      else if ('set' in synth && typeof (synth as any).set === 'function') {
        (synth as any).set(String(paramId), value);
      }
    } catch { /* engine not ready */ }
  }, [instrument.id]);

  if (params.length === 0) {
    return (
      <layoutContainer layout={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 80 }}>
        <PixiLabel text={title ? `${title} — No parameters` : 'No parameters available'} size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  return (
    <pixiContainer layout={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      {title && (
        <PixiLabel text={title} size="sm" weight="bold" color="textSecondary" layout={{ marginBottom: 2 }} />
      )}
      <PixiScrollView width={320} height={360}>
        <pixiContainer layout={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: 320, padding: 4 }}>
          {params.map((p, i) => (
            <pixiContainer key={String(p.id)} layout={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 56 }}>
              <PixiKnob
                value={p.value}
                min={p.min}
                max={p.max}
                onChange={(v) => handleParamChange(p.id, v)}
                size="sm"
                color={parseInt(PARAM_COLORS[i % PARAM_COLORS.length].slice(1), 16)}
                label={formatParamName(p.name)}
              />
            </pixiContainer>
          ))}
        </pixiContainer>
      </PixiScrollView>
    </pixiContainer>
  );
};
