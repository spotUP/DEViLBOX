import React, { useRef, useEffect, useCallback } from 'react';
import type { WobbleBassConfig } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { InstrumentOscilloscope } from '@components/visualization/InstrumentOscilloscope';
import { WOBBLE_BASS_PRESETS } from '@constants/synthPresets/wobbleBass';
import { CustomSelect } from '@components/common/CustomSelect';

interface WobbleBassControlsProps {
  config: WobbleBassConfig;
  instrumentId?: number;
  onChange: (config: WobbleBassConfig) => void;
}

/* ── helpers ─────────────────────────────────────────────── */

function deepSet(obj: any, path: string[], value: any): any {
  if (path.length === 1) return { ...obj, [path[0]]: value };
  return { ...obj, [path[0]]: deepSet(obj[path[0]] ?? {}, path.slice(1), value) };
}

const ACCENT = '#8b5cf6';
const PANEL_BG = '#1a1a2e';
const SECTION_BG = '#16162a';
const MODES = ['classic', 'reese', 'fm', 'growl', 'hybrid'] as const;
const WAVE_TYPES = ['sawtooth', 'square', 'triangle', 'sine'] as const;
const WAVE_LABELS: Record<string, string> = { sawtooth: 'SAW', square: 'SQR', triangle: 'TRI', sine: 'SIN' };
const FILTER_TYPES = ['lowpass', 'bandpass', 'highpass'] as const;
const FILTER_LABELS: Record<string, string> = { lowpass: 'LP', bandpass: 'BP', highpass: 'HP' };
const ROLLOFFS = [-12, -24, -48] as const;

// Map each mode to its representative preset config
const MODE_PRESETS: Record<string, Partial<WobbleBassConfig>> = Object.fromEntries(
  ['classic', 'reese', 'fm', 'growl', 'hybrid'].map((mode) => {
    const preset = WOBBLE_BASS_PRESETS.find((p) => (p.config as Partial<WobbleBassConfig>).mode === mode);
    return [mode, preset?.config ?? {}];
  })
);
const LFO_SHAPES = ['sine', 'triangle', 'saw', 'square', 'sample_hold'] as const;
const LFO_SHAPE_LABELS: Record<string, string> = { sine: 'SIN', triangle: 'TRI', saw: 'SAW', square: 'SQR', sample_hold: 'S&H' };
const DIST_TYPES = ['soft', 'hard', 'fuzz', 'bitcrush'] as const;
const SYNC_VALUES = ['free', '1/1', '1/2', '1/2T', '1/4', '1/4T', '1/8', '1/8T', '1/16', '1/16T', '1/32'] as const;
const VOWELS = ['A', 'E', 'I', 'O', 'U'] as const;

/* ── sub-components ──────────────────────────────────────── */

import { SectionLabel } from '@components/instruments/shared';

const Toggle: React.FC<{ on: boolean; onToggle: () => void; label?: string }> = ({ on, onToggle, label }) => (
  <button
    onClick={onToggle}
    className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide select-none"
    style={{ color: on ? ACCENT : '#555' }}
  >
    <span className="w-3 h-3 rounded-sm border flex items-center justify-center text-[8px]"
      style={{ borderColor: on ? ACCENT : '#444', background: on ? ACCENT : 'transparent', color: on ? '#fff' : '#444' }}>
      {on ? '✓' : ''}
    </span>
    {label}
  </button>
);

const BtnGroup: React.FC<{ items: readonly string[]; labels?: Record<string, string>; value: string; onSelect: (v: string) => void }> = ({ items, labels, value, onSelect }) => (
  <div className="flex gap-px rounded overflow-hidden">
    {items.map(it => (
      <button key={it} onClick={() => onSelect(it)}
        className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide select-none transition-colors"
        style={{ background: value === it ? ACCENT : '#2a2a40', color: value === it ? '#fff' : '#888' }}>
        {labels?.[it] ?? it}
      </button>
    ))}
  </div>
);

const Section: React.FC<{ label: string; controls?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ label, controls, children, className }) => (
  <div className={`rounded-lg p-2.5 ${className ?? ''}`} style={{ background: SECTION_BG }}>
    <SectionLabel label={label} color="#a1a1aa" />
    <div className="flex flex-wrap items-start gap-2">{children}</div>
    {controls && <div className="flex flex-wrap items-center gap-2 mt-2">{controls}</div>}
  </div>
);

const KnobWrap: React.FC<{ label: string; value: number; min: number; max: number; onChange: (v: number) => void;
  step?: number; fmt?: (v: number) => string; bipolar?: boolean; color?: string; size?: 'sm' | 'md' }> = (
  { label, value, min, max, onChange, step, fmt, bipolar, color, size }) => (
  <Knob value={value} min={min} max={max} onChange={onChange} label={label} size={size ?? 'md'}
    color={color ?? ACCENT} step={step} formatValue={fmt} bipolar={bipolar} />
);

/* ── main component ──────────────────────────────────────── */

export const WobbleBassControls: React.FC<WobbleBassControlsProps> = ({ config, instrumentId, onChange }) => {
  // CRITICAL: configRef pattern to avoid stale state in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const set = useCallback((path: string[], value: any) => {
    onChange(deepSet(configRef.current, path, value));
  }, [onChange]);

  const handleModeChange = useCallback((mode: string) => {
    const preset = MODE_PRESETS[mode];
    if (preset) {
      // Apply preset config merged with current config, then set mode
      onChange({ ...configRef.current, ...preset, mode } as WobbleBassConfig);
    } else {
      onChange({ ...configRef.current, mode } as WobbleBassConfig);
    }
  }, [onChange]);

  const pct = (v: number) => `${Math.round(v)}%`;
  const hz = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}Hz`;
  const fmtMs = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl select-none" style={{ background: PANEL_BG, fontFamily: 'system-ui' }}>
      {/* ── MODE SELECTOR ─────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Mode</span>
        <BtnGroup items={MODES} value={config.mode} onSelect={v => handleModeChange(v)} />
      </div>

      {/* ── OSCILLOSCOPE ──────────────────────────── */}
      {instrumentId != null && (
        <div style={{ background: SECTION_BG, borderRadius: 8, padding: '4px 6px' }}>
          <InstrumentOscilloscope
            instrumentId={instrumentId}
            width="auto"
            height={48}
            color={ACCENT}
            backgroundColor={SECTION_BG}
            lineWidth={1.5}
          />
        </div>
      )}

      {/* ── ROW 1: OSCILLATORS ────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Section label="OSC 1" className="flex-1 min-w-[200px]" controls={<>
          <BtnGroup items={WAVE_TYPES} labels={WAVE_LABELS} value={config.osc1.type} onSelect={v => set(['osc1', 'type'], v)} />
          <BtnGroup items={['-2','-1','0','+1','+2']} value={String(config.osc1.octave > 0 ? `+${config.osc1.octave}` : config.osc1.octave)}
            onSelect={v => set(['osc1', 'octave'], parseInt(v))} />
        </>}>
          <KnobWrap label="Detune" value={config.osc1.detune} min={-100} max={100} onChange={v => set(['osc1', 'detune'], v)} step={1} fmt={v => `${Math.round(v)}c`} bipolar />
          <KnobWrap label="Level" value={config.osc1.level} min={0} max={100} onChange={v => set(['osc1', 'level'], v)} fmt={pct} />
        </Section>

        <Section label="OSC 2" className="flex-1 min-w-[200px]" controls={<>
          <BtnGroup items={WAVE_TYPES} labels={WAVE_LABELS} value={config.osc2.type} onSelect={v => set(['osc2', 'type'], v)} />
          <BtnGroup items={['-2','-1','0','+1','+2']} value={String(config.osc2.octave > 0 ? `+${config.osc2.octave}` : config.osc2.octave)}
            onSelect={v => set(['osc2', 'octave'], parseInt(v))} />
        </>}>
          <KnobWrap label="Detune" value={config.osc2.detune} min={-100} max={100} onChange={v => set(['osc2', 'detune'], v)} step={1} fmt={v => `${Math.round(v)}c`} bipolar />
          <KnobWrap label="Level" value={config.osc2.level} min={0} max={100} onChange={v => set(['osc2', 'level'], v)} fmt={pct} />
        </Section>

        <Section label="SUB" className="min-w-[120px]" controls={<>
          <Toggle on={config.sub.enabled} onToggle={() => set(['sub', 'enabled'], !configRef.current.sub.enabled)} label="On" />
          <BtnGroup items={['-2','-1','0']} value={String(config.sub.octave)} onSelect={v => set(['sub', 'octave'], parseInt(v))} />
        </>}>
          <KnobWrap label="Level" value={config.sub.level} min={0} max={100} onChange={v => set(['sub', 'level'], v)} fmt={pct} />
        </Section>

        <Section label="FM" className="min-w-[160px]" controls={
          <Toggle on={config.fm.enabled} onToggle={() => set(['fm', 'enabled'], !configRef.current.fm.enabled)} label="On" />
        }>
          <KnobWrap label="Amount" value={config.fm.amount} min={0} max={100} onChange={v => set(['fm', 'amount'], v)} fmt={pct} />
          <KnobWrap label="Ratio" value={config.fm.ratio} min={0.5} max={16} onChange={v => set(['fm', 'ratio'], v)} step={0.5} fmt={v => v.toFixed(1)} />
          <KnobWrap label="Env" value={config.fm.envelope} min={0} max={100} onChange={v => set(['fm', 'envelope'], v)} fmt={pct} />
        </Section>

        <Section label="UNISON" className="min-w-[160px]" controls={
          <BtnGroup items={['1','2','4','8','16']} value={String(config.unison.voices)} onSelect={v => set(['unison', 'voices'], parseInt(v))} />
        }>
          <KnobWrap label="Detune" value={config.unison.detune} min={0} max={100} onChange={v => set(['unison', 'detune'], v)} step={1} fmt={v => `${Math.round(v)}c`} />
          <KnobWrap label="Spread" value={config.unison.stereoSpread} min={0} max={100} onChange={v => set(['unison', 'stereoSpread'], v)} fmt={pct} />
        </Section>
      </div>

      {/* ── ROW 2: FILTER ─────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Section label="FILTER" className="flex-1 min-w-[280px]" controls={<>
          <BtnGroup items={FILTER_TYPES} labels={FILTER_LABELS} value={config.filter.type} onSelect={v => set(['filter', 'type'], v)} />
          <BtnGroup items={ROLLOFFS.map(String)} value={String(config.filter.rolloff)} onSelect={v => set(['filter', 'rolloff'], parseInt(v))} />
        </>}>
          <KnobWrap label="Cutoff" value={config.filter.cutoff} min={20} max={20000} onChange={v => set(['filter', 'cutoff'], v)} fmt={hz} />
          <KnobWrap label="Reso" value={config.filter.resonance} min={0} max={100} onChange={v => set(['filter', 'resonance'], v)} fmt={pct} />
          <KnobWrap label="Drive" value={config.filter.drive} min={0} max={100} onChange={v => set(['filter', 'drive'], v)} fmt={pct} />
          <KnobWrap label="Key Trk" value={config.filter.keyTracking} min={0} max={100} onChange={v => set(['filter', 'keyTracking'], v)} fmt={pct} />
        </Section>

        <Section label="FILTER ENV" className="min-w-[220px]">
          <KnobWrap label="Amount" value={config.filterEnvelope.amount} min={-100} max={100} onChange={v => set(['filterEnvelope', 'amount'], v)} fmt={pct} bipolar />
          <KnobWrap label="Attack" value={config.filterEnvelope.attack} min={0} max={2000} onChange={v => set(['filterEnvelope', 'attack'], v)} fmt={fmtMs} />
          <KnobWrap label="Decay" value={config.filterEnvelope.decay} min={0} max={2000} onChange={v => set(['filterEnvelope', 'decay'], v)} fmt={fmtMs} />
          <KnobWrap label="Sustain" value={config.filterEnvelope.sustain} min={0} max={100} onChange={v => set(['filterEnvelope', 'sustain'], v)} fmt={pct} />
          <KnobWrap label="Release" value={config.filterEnvelope.release} min={0} max={2000} onChange={v => set(['filterEnvelope', 'release'], v)} fmt={fmtMs} />
        </Section>
      </div>

      {/* ── ROW 3: MODULATION ─────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Section label="WOBBLE LFO" className="flex-1 min-w-[340px]" controls={<>
          <Toggle on={config.wobbleLFO.enabled} onToggle={() => set(['wobbleLFO', 'enabled'], !configRef.current.wobbleLFO.enabled)} label="On" />
          <BtnGroup items={LFO_SHAPES} labels={LFO_SHAPE_LABELS} value={config.wobbleLFO.shape} onSelect={v => set(['wobbleLFO', 'shape'], v)} />
          <div className="flex items-end gap-1">
            <span className="text-[9px] text-zinc-500 uppercase">Sync</span>
            <CustomSelect value={config.wobbleLFO.sync} onChange={v => set(['wobbleLFO', 'sync'], v)}
              className="text-[10px] rounded px-1 py-0.5 border-none outline-none" style={{ background: '#2a2a40', color: 'var(--color-text-secondary)' }}
              options={SYNC_VALUES.map(s => ({ value: s, label: s }))} />
          </div>
          <Toggle on={config.wobbleLFO.retrigger} onToggle={() => set(['wobbleLFO', 'retrigger'], !configRef.current.wobbleLFO.retrigger)} label="Retrig" />
        </>}>
          <KnobWrap label="Rate" value={config.wobbleLFO.rate} min={0.1} max={30} onChange={v => set(['wobbleLFO', 'rate'], v)} fmt={v => `${v.toFixed(1)}Hz`} />
          <KnobWrap label="Amount" value={config.wobbleLFO.amount} min={0} max={100} onChange={v => set(['wobbleLFO', 'amount'], v)} fmt={pct} />
          <KnobWrap label="Pitch" value={config.wobbleLFO.pitchAmount} min={0} max={100} onChange={v => set(['wobbleLFO', 'pitchAmount'], v)} fmt={pct} />
          <KnobWrap label="FM Amt" value={config.wobbleLFO.fmAmount} min={0} max={100} onChange={v => set(['wobbleLFO', 'fmAmount'], v)} fmt={pct} />
          <KnobWrap label="Phase" value={config.wobbleLFO.phase} min={0} max={360} onChange={v => set(['wobbleLFO', 'phase'], v)} step={1} fmt={v => `${Math.round(v)}°`} />
        </Section>

        <Section label="AMP ENVELOPE" className="min-w-[200px]">
          <KnobWrap label="Attack" value={config.envelope.attack} min={0} max={2000} onChange={v => set(['envelope', 'attack'], v)} fmt={fmtMs} />
          <KnobWrap label="Decay" value={config.envelope.decay} min={0} max={2000} onChange={v => set(['envelope', 'decay'], v)} fmt={fmtMs} />
          <KnobWrap label="Sustain" value={config.envelope.sustain} min={0} max={100} onChange={v => set(['envelope', 'sustain'], v)} fmt={pct} />
          <KnobWrap label="Release" value={config.envelope.release} min={0} max={4000} onChange={v => set(['envelope', 'release'], v)} fmt={fmtMs} />
        </Section>
      </div>

      {/* ── ROW 4: EFFECTS ────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Section label="DISTORTION" className="flex-1 min-w-[200px]" controls={<>
          <Toggle on={config.distortion.enabled} onToggle={() => set(['distortion', 'enabled'], !configRef.current.distortion.enabled)} label="On" />
          <BtnGroup items={DIST_TYPES} value={config.distortion.type} onSelect={v => set(['distortion', 'type'], v)} />
        </>}>
          <KnobWrap label="Drive" value={config.distortion.drive} min={0} max={100} onChange={v => set(['distortion', 'drive'], v)} fmt={pct} />
          <KnobWrap label="Tone" value={config.distortion.tone} min={0} max={100} onChange={v => set(['distortion', 'tone'], v)} fmt={pct} />
        </Section>

        <Section label="FORMANT" className="flex-1 min-w-[200px]" controls={<>
          <Toggle on={config.formant.enabled} onToggle={() => set(['formant', 'enabled'], !configRef.current.formant.enabled)} label="On" />
          <BtnGroup items={VOWELS} value={config.formant.vowel.toUpperCase()} onSelect={v => set(['formant', 'vowel'], v)} />
        </>}>
          <KnobWrap label="Morph" value={config.formant.morph} min={0} max={100} onChange={v => set(['formant', 'morph'], v)} fmt={pct} />
          <KnobWrap label="LFO Amt" value={config.formant.lfoAmount} min={0} max={100} onChange={v => set(['formant', 'lfoAmount'], v)} fmt={pct} />
        </Section>
      </div>
    </div>
  );
};
