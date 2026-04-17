/**
 * PadEditor — minimal single-panel editor for a drum pad.
 *
 * Only covers the things that aren't already in the synth UI or the
 * right-click context menu: name / color / fixed note / output bus /
 * mute group / play mode / velocity curve, and for sample pads the
 * sample slot + reverse toggle. For synth pads the full synth UI is
 * embedded below — no duplicated ADSR / filter / oscillator controls.
 */

import React, { useCallback, useMemo, useState, Suspense, lazy } from 'react';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import type { DrumPad, OutputBus, VelocityCurve, SampleData } from '@/types/drumpad';
import type { InstrumentConfig } from '@/types/instrument/defaults';
import type { EffectConfig } from '@typedefs/instrument';
import { CustomSelect } from '@components/common/CustomSelect';
import { SamplePackBrowser } from '../instruments/SamplePackBrowser';
import { VisualEffectEditorWrapper } from '../effects/VisualEffectEditors';
import { AVAILABLE_EFFECTS } from '@constants/unifiedEffects';
import { getDefaultEffectParameters } from '@engine/InstrumentFactory';
import { SAMPLE_FX_PRESETS } from '@constants/sampleFxPresets';
import { X, Trash2 } from 'lucide-react';

const UnifiedInstrumentEditor = lazy(() => import('../instruments/editors/UnifiedInstrumentEditor'));

const PAD_COLOR_PRESETS = [
  '#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let octave = 0; octave <= 8; octave++) {
    for (const name of NOTE_NAMES) {
      const v = `${name}${octave}`;
      opts.push({ value: v, label: v });
    }
  }
  return opts;
})();

const OUTPUT_OPTIONS: { value: OutputBus; label: string }[] = [
  { value: 'stereo', label: 'Stereo' },
  { value: 'out1', label: 'Out 1' },
  { value: 'out2', label: 'Out 2' },
  { value: 'out3', label: 'Out 3' },
  { value: 'out4', label: 'Out 4' },
];

const PLAY_MODE_OPTIONS: { value: DrumPad['playMode']; label: string }[] = [
  { value: 'oneshot', label: 'One-shot (fires once)' },
  { value: 'sustain', label: 'Sustain (hold to engage)' },
  { value: 'toggle',  label: 'Toggle (click on / click off)' },
];

const VELOCITY_CURVE_OPTIONS: { value: VelocityCurve; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'logarithmic', label: 'Logarithmic' },
  { value: 'scurve', label: 'S-Curve' },
  { value: 'fixed', label: 'Fixed (max)' },
];

interface PadEditorProps {
  padId: number;
  onClose?: () => void;
  initialShowSampleBrowser?: boolean;
}

export const PadEditor: React.FC<PadEditorProps> = ({ padId, onClose, initialShowSampleBrowser = false }) => {
  const programs = useDrumPadStore((s) => s.programs);
  const currentProgramId = useDrumPadStore((s) => s.currentProgramId);
  const updatePad = useDrumPadStore((s) => s.updatePad);
  const clearPad = useDrumPadStore((s) => s.clearPad);
  const loadSampleToPad = useDrumPadStore((s) => s.loadSampleToPad);

  const pad = useMemo<DrumPad | undefined>(() => {
    return programs.get(currentProgramId)?.pads.find((p) => p.id === padId);
  }, [programs, currentProgramId, padId]);

  const [showSampleBrowser, setShowSampleBrowser] = useState(initialShowSampleBrowser);

  const handleSynthChange = useCallback((updates: Partial<InstrumentConfig>) => {
    if (!pad?.synthConfig) return;
    updatePad(pad.id, { synthConfig: { ...pad.synthConfig, ...updates } });
  }, [pad, updatePad]);

  const handleSampleLoaded = useCallback(async (sample: SampleData) => {
    await loadSampleToPad(padId, sample);
    setShowSampleBrowser(false);
  }, [loadSampleToPad, padId]);

  if (!pad) {
    return (
      <div className="p-6 bg-dark-bg border border-dark-border rounded-lg text-text-muted">
        Pad {padId} not found.
      </div>
    );
  }

  const kind: 'synth' | 'sample' | 'action' | 'empty' =
    pad.synthConfig ? 'synth'
    : pad.sample ? 'sample'
    : (pad.djFxAction || pad.scratchAction || pad.pttAction) ? 'action'
    : 'empty';

  return (
    <div className="flex flex-col bg-dark-bgSecondary border border-dark-border rounded-lg overflow-hidden max-h-[90vh] w-[min(900px,95vw)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-dark-border bg-dark-bg shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Pad {pad.id}</span>
          <input
            type="text"
            value={pad.name}
            onChange={(e) => updatePad(pad.id, { name: e.target.value })}
            className="w-48 px-2 py-1 text-sm font-mono font-bold bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
          />
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-dark-bgHover rounded transition-colors text-text-muted hover:text-text-primary"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Pad-level config strip (not synth params) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 px-4 py-3 border-b border-dark-border shrink-0">
        <Field label="Color">
          <div className="flex gap-1">
            {PAD_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => updatePad(pad.id, { color: c })}
                aria-label={`Color ${c}`}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${pad.color === c ? 'border-text-primary scale-110' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <button
              onClick={() => updatePad(pad.id, { color: undefined })}
              className="w-5 h-5 rounded-full border border-dark-borderLight text-[8px] text-text-muted hover:text-text-primary"
              title="No color"
            >
              ×
            </button>
          </div>
        </Field>

        {(kind === 'synth' || kind === 'sample') && (
          <Field label="Trigger note">
            <CustomSelect
              value={pad.instrumentNote ?? 'C4'}
              onChange={(v) => updatePad(pad.id, { instrumentNote: v })}
              options={NOTE_OPTIONS}
              className="w-full px-2 py-1 text-xs font-mono bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary"
            />
          </Field>
        )}

        <Field label="Output">
          <CustomSelect
            value={pad.output}
            onChange={(v) => updatePad(pad.id, { output: v as OutputBus })}
            options={OUTPUT_OPTIONS}
            className="w-full px-2 py-1 text-xs font-mono bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary"
          />
        </Field>

        <Field label="Mute group">
          <CustomSelect
            value={String(pad.muteGroup ?? 0)}
            onChange={(v) => updatePad(pad.id, { muteGroup: Number(v) })}
            options={[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: n === 0 ? 'None' : `Group ${n}` }))}
            className="w-full px-2 py-1 text-xs font-mono bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary"
          />
        </Field>

        <Field label="Play mode">
          <CustomSelect
            value={pad.playMode ?? 'oneshot'}
            onChange={(v) => updatePad(pad.id, { playMode: v as DrumPad['playMode'] })}
            options={PLAY_MODE_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }))}
            className="w-full px-2 py-1 text-xs font-mono bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary"
          />
        </Field>

        <Field label="Velocity curve">
          <CustomSelect
            value={pad.velocityCurve ?? 'linear'}
            onChange={(v) => updatePad(pad.id, { velocityCurve: v as VelocityCurve })}
            options={VELOCITY_CURVE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            className="w-full px-2 py-1 text-xs font-mono bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary"
          />
        </Field>
      </div>

      {/* Sound area — embeds the synth UI OR sample browser OR action label */}
      <div className="flex-1 min-h-0 overflow-auto">
        {kind === 'synth' && pad.synthConfig && (
          <Suspense fallback={<div className="p-6 text-text-muted text-sm">Loading synth editor…</div>}>
            <UnifiedInstrumentEditor
              instrument={pad.synthConfig}
              onChange={handleSynthChange}
            />
          </Suspense>
        )}

        {kind === 'sample' && pad.sample && (
          <div className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-mono font-bold text-text-primary">{pad.sample.name}</div>
                <div className="text-[10px] font-mono text-text-muted">
                  {pad.sample.duration.toFixed(2)}s · {pad.sample.sampleRate} Hz
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSampleBrowser(true)}
                  className="px-3 py-1 text-xs font-mono font-bold rounded border border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:text-text-primary hover:bg-dark-bgHover"
                >
                  Replace
                </button>
                <button
                  onClick={() => updatePad(pad.id, { sample: null })}
                  className="px-3 py-1 text-xs font-mono font-bold rounded border border-accent-error/50 bg-dark-bgTertiary text-accent-error hover:bg-accent-error/10"
                >
                  Remove
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-mono text-text-secondary">
              <input
                type="checkbox"
                checked={pad.reverse}
                onChange={(e) => updatePad(pad.id, { reverse: e.target.checked })}
              />
              Reverse
            </label>
          </div>
        )}

        {kind === 'action' && (
          <div className="p-6 text-xs font-mono text-text-muted">
            This pad triggers a DJ action. Edit the action via right-click →
            DJ FX / Scratch / PTT menus.
          </div>
        )}

        {kind === 'empty' && !showSampleBrowser && (
          <div className="p-6 flex flex-col items-center gap-3 text-text-muted">
            <div className="text-sm font-mono">This pad is empty.</div>
            <button
              onClick={() => setShowSampleBrowser(true)}
              className="px-4 py-2 text-xs font-mono font-bold rounded border border-accent-primary bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20"
            >
              Load sample…
            </button>
            <div className="text-[10px] font-mono text-text-muted">
              Or right-click the pad to assign a synth / scratch pattern / DJ FX.
            </div>
          </div>
        )}

        {showSampleBrowser && (
          <div className="p-4 border-t border-dark-border">
            <SamplePackBrowser
              onSelectSample={handleSampleLoaded}
              onClose={() => setShowSampleBrowser(false)}
            />
          </div>
        )}
      </div>

      {/* Effects chain — reverb, delay, saturation, etc. wired per pad. */}
      {kind !== 'empty' && (
        <PadEffectsSection
          pad={pad}
          onEffectsChange={(effects) => updatePad(pad.id, { effects, presetName: undefined })}
          onLoadPreset={(name, effects) => updatePad(pad.id, { effects, presetName: name })}
        />
      )}

      {/* Danger zone */}
      <div className="flex justify-end px-4 py-2 border-t border-dark-border bg-dark-bg shrink-0">
        <button
          onClick={() => { clearPad(pad.id); onClose?.(); }}
          className="px-3 py-1 text-[10px] font-mono font-bold rounded border border-accent-error/50 text-accent-error hover:bg-accent-error/10"
        >
          Clear pad
        </button>
      </div>
    </div>
  );
};

// ── Effects section ───────────────────────────────────────────────────────

interface PadEffectsSectionProps {
  pad: DrumPad;
  onEffectsChange: (effects: EffectConfig[]) => void;
  onLoadPreset: (name: string, effects: EffectConfig[]) => void;
}

const PadEffectsSection: React.FC<PadEffectsSectionProps> = ({ pad, onEffectsChange, onLoadPreset }) => {
  const effects = pad.effects ?? [];

  const addEffect = useCallback((effectId: string) => {
    const avail = AVAILABLE_EFFECTS.find((e) => (e.type ?? `neural-${e.neuralModelIndex}`) === effectId);
    if (!avail) return;
    const type = avail.type ?? `NeuralEffect${avail.neuralModelIndex}`;
    const params = getDefaultEffectParameters(type);
    const next: EffectConfig = {
      id: `pad-fx-${pad.id}-${Date.now()}`,
      category: avail.category,
      type: type as EffectConfig['type'],
      enabled: true,
      wet: 100,
      parameters: params,
      ...(avail.neuralModelIndex !== undefined ? { neuralModelIndex: avail.neuralModelIndex } : {}),
    };
    onEffectsChange([...effects, next]);
  }, [effects, pad.id, onEffectsChange]);

  const removeEffect = useCallback((idx: number) => {
    onEffectsChange(effects.filter((_, i) => i !== idx));
  }, [effects, onEffectsChange]);

  const updateEffect = useCallback((idx: number, patch: Partial<EffectConfig>) => {
    onEffectsChange(effects.map((fx, i) => (i === idx ? { ...fx, ...patch } : fx)));
  }, [effects, onEffectsChange]);

  const updateParameter = useCallback((idx: number, key: string, value: number | string) => {
    onEffectsChange(effects.map((fx, i) => (i === idx ? { ...fx, parameters: { ...fx.parameters, [key]: value } } : fx)));
  }, [effects, onEffectsChange]);

  const updateParameters = useCallback((idx: number, params: Record<string, number | string>) => {
    onEffectsChange(effects.map((fx, i) => (i === idx ? { ...fx, parameters: { ...fx.parameters, ...params } } : fx)));
  }, [effects, onEffectsChange]);

  const effectOptions = useMemo(() => (
    AVAILABLE_EFFECTS.map((e) => ({
      value: e.type ?? `neural-${e.neuralModelIndex}`,
      label: `${e.group} · ${e.label}`,
    }))
  ), []);

  const presetOptions = useMemo(() => ([
    { value: '', label: '— Load FX preset —' },
    ...SAMPLE_FX_PRESETS.map((p) => ({ value: p.name, label: p.name })),
  ]), []);

  const handlePresetChange = useCallback((name: string) => {
    const preset = SAMPLE_FX_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    const stamped = preset.effects.map((e, i) => ({ ...e, id: `pad-fx-${pad.id}-${Date.now()}-${i}` }));
    onLoadPreset(preset.name, stamped);
  }, [pad.id, onLoadPreset]);

  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-t border-dark-border bg-dark-bg">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted shrink-0">
          Effects ({effects.length})
        </span>
        <CustomSelect
          value=""
          onChange={handlePresetChange}
          options={presetOptions}
          className="flex-1 px-2 py-1 text-xs font-mono bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary"
        />
        <CustomSelect
          value=""
          onChange={(v) => { if (v) addEffect(v); }}
          options={[{ value: '', label: '＋ Add effect' }, ...effectOptions]}
          className="flex-1 px-2 py-1 text-xs font-mono bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary"
        />
        {effects.length > 0 && (
          <button
            onClick={() => onEffectsChange([])}
            className="px-2 py-1 text-[10px] font-mono rounded border border-accent-error/50 text-accent-error hover:bg-accent-error/10"
            title="Clear effects chain"
          >
            Clear
          </button>
        )}
      </div>

      {pad.presetName && (
        <div className="text-[10px] font-mono text-text-muted">
          Preset: <span className="text-accent-highlight">{pad.presetName}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {effects.map((fx, idx) => (
          <div key={fx.id} className="border border-dark-borderLight rounded bg-dark-bgTertiary">
            <div className="flex items-center justify-between px-2 py-1 border-b border-dark-border">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[10px] font-mono text-text-secondary">
                  <input
                    type="checkbox"
                    checked={fx.enabled}
                    onChange={(e) => updateEffect(idx, { enabled: e.target.checked })}
                  />
                  {fx.type}
                </label>
              </div>
              <button
                onClick={() => removeEffect(idx)}
                className="p-1 text-text-muted hover:text-accent-error"
                title="Remove effect"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            {fx.enabled && (
              <div className="p-2">
                <VisualEffectEditorWrapper
                  effect={fx}
                  onUpdateParameter={(k, v) => updateParameter(idx, k, v)}
                  onUpdateParameters={(params) => updateParameters(idx, params)}
                  onUpdateWet={(w) => updateEffect(idx, { wet: w })}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Field wrapper ──────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">{label}</span>
    {children}
  </div>
);
