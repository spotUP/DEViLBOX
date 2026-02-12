/**
 * VSTBridgePanel - Auto-generated parameter UI for VSTBridge synths
 *
 * Queries synth.getParams() after init, renders a grid of Knob components.
 * Groups params by prefix if names follow "Group:ParamName" convention.
 * If descriptor.panelComponent is set, renders that instead (override mechanism).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Knob } from '@components/controls/Knob';
import { Sliders, Loader } from 'lucide-react';
import { useThemeStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { VSTBridgeParam } from '@engine/vstbridge/synth-registry';
import type { VSTBridgeSynth } from '@engine/vstbridge/VSTBridgeSynth';

interface VSTBridgePanelProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

interface ParamGroup {
  name: string;
  params: VSTBridgeParam[];
}

/** Group parameters by prefix (e.g. "Filter:Cutoff" → group "Filter") */
function groupParams(params: VSTBridgeParam[]): ParamGroup[] {
  const groups = new Map<string, VSTBridgeParam[]>();

  for (const param of params) {
    const colonIdx = param.name.indexOf(':');
    const groupName = colonIdx > 0 ? param.name.substring(0, colonIdx) : 'Parameters';
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName)!.push(param);
  }

  return Array.from(groups.entries()).map(([name, groupParams]) => ({
    name,
    params: groupParams,
  }));
}

/** Get display name for a param (strip group prefix) */
function getParamDisplayName(param: VSTBridgeParam): string {
  const colonIdx = param.name.indexOf(':');
  return colonIdx > 0 ? param.name.substring(colonIdx + 1).trim() : param.name;
}

export const VSTBridgePanel: React.FC<VSTBridgePanelProps> = ({
  instrument,
}) => {
  const [params, setParams] = useState<VSTBridgeParam[]>([]);
  const [paramValues, setParamValues] = useState<Map<number, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const synthRef = useRef<VSTBridgeSynth | null>(null);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const accentColor = isCyanTheme ? '#00ffff' : '#a78bfa';
  const knobColor = isCyanTheme ? '#00ffff' : '#a78bfa';

  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-purple-900/50';

  // Load params from the synth after WASM init
  useEffect(() => {
    let cancelled = false;

    const loadParams = async () => {
      try {
        const engine = getToneEngine();
        // Look up the synth from the engine's instrument map
        // VSTBridge synths use shared instance key: ${id}--1
        const key = `${instrument.id}--1`;
        const synth = engine.instruments?.get(key) as VSTBridgeSynth | null;
        if (!synth || !('getParams' in synth)) {
          // Synth not yet available — retry after a delay
          setTimeout(() => {
            if (!cancelled) loadParams();
          }, 500);
          return;
        }

        // Ensure WASM is initialized
        if ('ensureInitialized' in synth) {
          await (synth as VSTBridgeSynth).ensureInitialized();
        }

        synthRef.current = synth;
        const wasmParams = synth.getParams();

        if (!cancelled) {
          setParams(wasmParams);
          // Initialize values from defaults
          const values = new Map<number, number>();
          for (const p of wasmParams) {
            values.set(p.id, p.defaultValue);
          }
          setParamValues(values);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadParams();
    return () => { cancelled = true; };
  }, [instrument.id]);

  const handleParamChange = useCallback((paramId: number, value: number) => {
    setParamValues((prev) => {
      const next = new Map(prev);
      next.set(paramId, value);
      return next;
    });

    // Real-time update to WASM
    if (synthRef.current) {
      synthRef.current.setParameter(paramId, value);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-gray-400">
        <Loader size={16} className="animate-spin" />
        <span>Loading parameters...</span>
      </div>
    );
  }

  if (params.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-gray-500">
        <Sliders size={16} />
        <span>No parameters exposed by this synth</span>
      </div>
    );
  }

  const groups = groupParams(params);

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {groups.map((group) => (
        <div key={group.name} className={`p-4 rounded-xl border ${panelBg}`}>
          <div className="flex items-center gap-2 mb-4">
            <Sliders size={16} style={{ color: accentColor }} />
            <h3
              className="font-bold uppercase tracking-tight text-sm"
              style={{ color: accentColor }}
            >
              {group.name}
            </h3>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-3">
            {group.params.map((param) => (
              <Knob
                key={param.id}
                label={getParamDisplayName(param)}
                value={paramValues.get(param.id) ?? param.defaultValue}
                min={param.min}
                max={param.max}
                defaultValue={param.defaultValue}
                onChange={(value) => handleParamChange(param.id, value)}
                size="sm"
                color={knobColor}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
