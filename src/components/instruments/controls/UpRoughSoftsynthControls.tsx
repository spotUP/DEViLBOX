/**
 * UpRoughSoftsynthControls - editor for the Up Rough softsynth.
 *
 * The knob set is read from the selected voice's ParameterDef list (getSoftsynthVoice(voice).params),
 * grouped by ParameterDef.group, so a voice that gains parameters gains knobs with no change here.
 * Changing the voice resets the params to that voice's defaults (the golden_era values).
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { UpRoughSoftsynthConfig } from '@/types/instrument';
import type { ParameterDef } from '@/engine/registry/SynthDescriptor';
import { SOFTSYNTH_VOICES, getSoftsynthVoice } from '@/engine/uprough/voiceRegistry';
import { voiceDefaults } from '@/engine/uprough/softsynthVoice';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { CustomSelect } from '@components/common/CustomSelect';
import { Button } from '@components/ui/Button';
import { RotateCcw } from 'lucide-react';

export interface UpRoughSoftsynthControlsProps {
  config: UpRoughSoftsynthConfig;
  instrumentId: number;
  onChange: (updates: Partial<UpRoughSoftsynthConfig>) => void;
}

const DEFAULT_GROUP = 'Voice';
const SEED_MAX = 9999;

const VOICE_OPTIONS = SOFTSYNTH_VOICES.map((v) => ({ value: v.id, label: v.label }));

function groupParams(params: readonly ParameterDef[]): [string, ParameterDef[]][] {
  const groups = new Map<string, ParameterDef[]>();
  for (const p of params) {
    const name = p.group ?? DEFAULT_GROUP;
    const list = groups.get(name);
    if (list) list.push(p);
    else groups.set(name, [p]);
  }
  return [...groups.entries()];
}

export const UpRoughSoftsynthControls: React.FC<UpRoughSoftsynthControlsProps> = ({
  config,
  instrumentId: _instrumentId,
  onChange,
}) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const voice = getSoftsynthVoice(config.voice);
  const groups = useMemo(() => (voice ? groupParams(voice.params) : []), [voice]);
  // Params missing from the stored config (older projects, newly added knobs) read as the voice default.
  const values = useMemo(
    () => (voice ? { ...voiceDefaults(voice), ...config.params } : config.params),
    [voice, config.params],
  );

  const setParam = useCallback((key: string, value: number) => {
    const cur = configRef.current;
    onChange({ params: { ...cur.params, [key]: value } });
  }, [onChange]);

  const setVoice = useCallback((id: string) => {
    const next = getSoftsynthVoice(id);
    if (!next) return;
    onChange({ voice: id, params: voiceDefaults(next) });
  }, [onChange]);

  const resetToDefaults = useCallback(() => {
    const cur = getSoftsynthVoice(configRef.current.voice);
    if (!cur) return;
    onChange({ params: voiceDefaults(cur) });
  }, [onChange]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dark-border bg-dark-bgSecondary p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-[10px] font-bold text-text-muted tracking-wider">Voice</span>
          <div className="w-48">
            <CustomSelect value={config.voice} onChange={setVoice} options={VOICE_OPTIONS} />
          </div>
          <Knob
            value={config.seed} min={0} max={SEED_MAX} step={1} defaultValue={0}
            onChange={(v) => onChange({ seed: Math.round(v) })}
            label="Seed" tone="primary" size="sm" formatValue={(v) => String(Math.round(v))}
          />
          <Button variant="default" size="sm" icon={<RotateCcw size={12} />} onClick={resetToDefaults}>
            Reset to defaults
          </Button>
        </div>
      </div>

      {!voice && (
        <div className="font-mono text-[10px] text-accent-error">Unknown voice: {config.voice}</div>
      )}

      {groups.map(([name, params]) => (
        <div key={name} className="rounded-lg border border-dark-border bg-dark-bgSecondary p-3" data-testid={`softsynth-group-${name}`}>
          <div className="font-mono text-[10px] font-bold text-text-muted mb-2 tracking-wider">{name}</div>
          <div className="flex flex-wrap gap-4">
            {params.map((p) => {
              const value = values[p.key] ?? p.default;
              if (p.type === 'toggle') {
                return (
                  <Toggle key={p.key} label={p.label} value={value >= 0.5} tone="primary"
                    onChange={(on) => setParam(p.key, on ? 1 : 0)} />
                );
              }
              if (p.type === 'select' && p.options) {
                return (
                  <div key={p.key} className="flex flex-col gap-1">
                    <span className="font-mono text-[9px] text-text-muted">{p.label}</span>
                    <CustomSelect
                      value={String(value)}
                      onChange={(s) => setParam(p.key, Number(s))}
                      options={p.options.map((o) => ({ value: String(o.value), label: o.label }))}
                    />
                  </div>
                );
              }
              const min = p.min ?? 0;
              const max = p.max ?? 1;
              return (
                <Knob
                  key={p.key}
                  value={value} min={min} max={max} defaultValue={p.default}
                  step={(max - min) / 200}
                  onChange={(v) => setParam(p.key, v)}
                  label={p.label} tone="primary" size="sm" bipolar={min < 0 && max > 0}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
