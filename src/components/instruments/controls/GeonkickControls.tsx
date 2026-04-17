/**
 * GeonkickControls — full editor for the Geonkick percussion synth.
 *
 * Sections:
 *   1. Preset browser (82 bundled presets across 7 kit bundles) + audition
 *   2. Envelope editor with selector for kick-level and per-oscillator envelopes
 *   3. Scalar knobs for kick globals, filter, distortion, and per-oscillator params
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeonkickConfig } from '@/types/instrument/exotic';
import {
  GeonkickEngine,
  GeonkickFilterType,
  GeonkickKickEnvelope,
  GeonkickOscEnvelope,
  GeonkickOscFunction,
} from '@engine/geonkick/GeonkickEngine';
import { applyGeonkickPreset } from '@engine/geonkick/GeonkickPresetLoader';
import { GeonkickEnvelopeCanvas, type EnvelopePoint } from './GeonkickEnvelopeCanvas';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface PresetManifestEntry {
  file: string;
  name: string;
}

interface PresetManifestBundle {
  name: string;
  presets: PresetManifestEntry[];
}

interface PresetManifest {
  bundles: PresetManifestBundle[];
}

interface GeonkickControlsProps {
  config: GeonkickConfig;
  onChange: (updates: Partial<GeonkickConfig>) => void;
}

/* ── Envelope selector definitions ──────────────────────────────────────── */

interface EnvelopeChoice {
  label: string;
  group: 'kick' | 'osc';
  /** For kick envelopes: the GeonkickKickEnvelope type */
  kickType?: number;
  /** For osc envelopes: the GeonkickOscEnvelope type */
  oscEnvType?: number;
  /** Y-axis label for the canvas */
  yLabel: string;
}

const KICK_ENVELOPES: EnvelopeChoice[] = [
  { label: 'Amplitude', group: 'kick', kickType: GeonkickKickEnvelope.Amplitude, yLabel: 'Amplitude' },
  { label: 'Frequency', group: 'kick', kickType: GeonkickKickEnvelope.Frequency, yLabel: 'Frequency' },
  { label: 'Filter Cutoff', group: 'kick', kickType: GeonkickKickEnvelope.FilterCutoff, yLabel: 'Cutoff' },
  { label: 'Distortion Drive', group: 'kick', kickType: GeonkickKickEnvelope.DistortionDrive, yLabel: 'Drive' },
  { label: 'Distortion Vol', group: 'kick', kickType: GeonkickKickEnvelope.DistortionVolume, yLabel: 'Volume' },
  { label: 'Pitch Shift', group: 'kick', kickType: GeonkickKickEnvelope.PitchShift, yLabel: 'Pitch' },
  { label: 'Filter Q', group: 'kick', kickType: GeonkickKickEnvelope.FilterQ, yLabel: 'Q' },
  { label: 'Noise Density', group: 'kick', kickType: GeonkickKickEnvelope.NoiseDensity, yLabel: 'Density' },
];

const OSC_ENVELOPES: EnvelopeChoice[] = [
  { label: 'Amplitude', group: 'osc', oscEnvType: GeonkickOscEnvelope.Amplitude, yLabel: 'Amplitude' },
  { label: 'Frequency', group: 'osc', oscEnvType: GeonkickOscEnvelope.Frequency, yLabel: 'Frequency' },
  { label: 'Filter Cutoff', group: 'osc', oscEnvType: GeonkickOscEnvelope.FilterCutoff, yLabel: 'Cutoff' },
  { label: 'Pitch Shift', group: 'osc', oscEnvType: GeonkickOscEnvelope.PitchShift, yLabel: 'Pitch' },
];

const OSC_FUNC_LABELS: Record<number, string> = {
  [GeonkickOscFunction.Sine]: 'Sine',
  [GeonkickOscFunction.Square]: 'Square',
  [GeonkickOscFunction.Triangle]: 'Triangle',
  [GeonkickOscFunction.Sawtooth]: 'Sawtooth',
  [GeonkickOscFunction.NoiseWhite]: 'Noise W',
  [GeonkickOscFunction.NoisePink]: 'Noise P',
  [GeonkickOscFunction.NoiseBrownian]: 'Noise B',
  [GeonkickOscFunction.Sample]: 'Sample',
};

const FILTER_TYPE_LABELS: Record<number, string> = {
  [GeonkickFilterType.LowPass]: 'LP',
  [GeonkickFilterType.HighPass]: 'HP',
  [GeonkickFilterType.BandPass]: 'BP',
};

const DEFAULT_ENVELOPE: EnvelopePoint[] = [
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

/* ── Preset manifest fetch ──────────────────────────────────────────────── */

const PRESETS_BASE = (() => {
  const baseUrl = import.meta.env.BASE_URL || '/';
  return `${baseUrl}geonkick/presets/`;
})();

let manifestCache: PresetManifest | null = null;
async function fetchManifest(): Promise<PresetManifest> {
  if (manifestCache) return manifestCache;
  const resp = await fetch(`${PRESETS_BASE}manifest.json`);
  if (!resp.ok) throw new Error('preset manifest fetch failed');
  manifestCache = (await resp.json()) as PresetManifest;
  return manifestCache;
}

async function fetchPresetJson(file: string): Promise<Record<string, unknown>> {
  const resp = await fetch(`${PRESETS_BASE}${file}`);
  if (!resp.ok) throw new Error(`preset fetch failed: ${file}`);
  return (await resp.json()) as Record<string, unknown>;
}

/* ── Helpers to read/write envelope points from preset JSON ─────────────── */

type PresetJson = Record<string, unknown>;

function getPresetObj(preset: PresetJson | undefined, path: string): unknown {
  if (!preset) return undefined;
  const parts = path.split('.');
  let cur: unknown = preset;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Read envelope points from the preset JSON at a given dot-path.
 * Handles both `{ points: [[x,y], ...] }` and raw `[[x,y], ...]` shapes.
 */
function readEnvelopePoints(preset: PresetJson | undefined, path: string): EnvelopePoint[] {
  const val = getPresetObj(preset, path);
  let arr: unknown[] | undefined;
  if (Array.isArray(val)) {
    // Direct array: e.g. kick.filter.cutoff_env = [[x,y], ...]
    arr = val;
  } else if (val && typeof val === 'object' && 'points' in (val as Record<string, unknown>)) {
    const pts = (val as Record<string, unknown>).points;
    if (Array.isArray(pts)) arr = pts;
  }
  if (!arr || arr.length === 0) return [...DEFAULT_ENVELOPE];
  return arr
    .filter((p) => Array.isArray(p) && (p as number[]).length >= 2)
    .map((p) => ({ x: (p as number[])[0], y: (p as number[])[1] }));
}

/** Deep-clone and set a value at a dot-path in the preset JSON, returning the new object. */
function setPresetValue(preset: PresetJson, path: string, value: unknown): PresetJson {
  const clone = JSON.parse(JSON.stringify(preset)) as PresetJson;
  const parts = path.split('.');
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return clone;
}

/** Convert EnvelopePoint[] to the [[x,y], ...] JSON form used in .gkick files. */
function pointsToArray(pts: EnvelopePoint[]): number[][] {
  return pts.map((p) => [p.x, p.y]);
}

/**
 * Map from envelope selection to the JSON path in the preset where points live,
 * and the JSON shape ('envelope' = {points: [...]}, 'array' = [[x,y],...]).
 */
function getEnvelopePath(
  envChoice: EnvelopeChoice,
  oscIndex: number,
): { path: string; shape: 'envelope' | 'array' } {
  if (envChoice.group === 'kick') {
    switch (envChoice.kickType) {
      case GeonkickKickEnvelope.Amplitude:
        return { path: 'kick.ampl_env', shape: 'envelope' };
      case GeonkickKickEnvelope.FilterCutoff:
        return { path: 'kick.filter.cutoff_env', shape: 'array' };
      case GeonkickKickEnvelope.DistortionDrive:
        return { path: 'kick.distortion.drive_env', shape: 'array' };
      case GeonkickKickEnvelope.DistortionVolume:
        return { path: 'kick.distortion.volume_env', shape: 'array' };
      default:
        // Frequency, PitchShift, FilterQ, NoiseDensity don't have
        // standard paths in the .gkick format — store under kick.<name>_env
        const name = envChoice.label.toLowerCase().replace(/\s+/g, '_');
        return { path: `kick.${name}_env`, shape: 'array' };
    }
  } else {
    const oscKey = `osc${oscIndex}`;
    switch (envChoice.oscEnvType) {
      case GeonkickOscEnvelope.Amplitude:
        return { path: `${oscKey}.ampl_env`, shape: 'envelope' };
      case GeonkickOscEnvelope.Frequency:
        return { path: `${oscKey}.freq_env`, shape: 'envelope' };
      case GeonkickOscEnvelope.FilterCutoff:
        return { path: `${oscKey}.filter.cutoff_env`, shape: 'array' };
      case GeonkickOscEnvelope.PitchShift:
        return { path: `${oscKey}.pitchshift_env`, shape: 'envelope' };
      default:
        return { path: `${oscKey}.env_${envChoice.oscEnvType}`, shape: 'array' };
    }
  }
}

/** Read a scalar number from preset JSON at a dot-path. */
function readPresetNumber(preset: PresetJson | undefined, path: string, fallback: number): number {
  const val = getPresetObj(preset, path);
  return typeof val === 'number' ? val : fallback;
}

/** Read a boolean from preset JSON at a dot-path. */
function readPresetBool(preset: PresetJson | undefined, path: string, fallback: boolean): boolean {
  const val = getPresetObj(preset, path);
  return typeof val === 'boolean' ? val : fallback;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export const GeonkickControls: React.FC<GeonkickControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const { accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors('#f97316', { knob: '#fb923c' });

  /* ── Preset browser state ─────────────────────────────────────────────── */
  const [manifest, setManifest] = useState<PresetManifest | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<string>(() => config.name?.split(' / ')[0] ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  /* ── Envelope editor state ────────────────────────────────────────────── */
  const [envGroup, setEnvGroup] = useState<'kick' | 'osc'>('kick');
  const [kickEnvIdx, setKickEnvIdx] = useState(0);
  const [oscEnvIdx, setOscEnvIdx] = useState(0);
  const [selectedOsc, setSelectedOsc] = useState(0);

  /* ── Active tab ───────────────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState<'envelope' | 'kick' | 'oscillator'>('envelope');

  useEffect(() => {
    fetchManifest()
      .then((m) => {
        setManifest(m);
        if (!selectedBundle && m.bundles.length > 0) {
          setSelectedBundle(m.bundles[0].name);
        }
      })
      .catch((err) => setError(String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentBundle = useMemo(
    () => manifest?.bundles.find((b) => b.name === selectedBundle),
    [manifest, selectedBundle],
  );

  const loadPreset = useCallback(
    async (entry: PresetManifestEntry) => {
      setLoading(true);
      setError(null);
      try {
        const preset = await fetchPresetJson(entry.file);
        const engine = GeonkickEngine.getInstance();
        await engine.ready();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        applyGeonkickPreset(engine, preset as any);
        onChange({
          preset,
          name: `${selectedBundle} / ${entry.name}`,
        });
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [onChange, selectedBundle],
  );

  const audition = useCallback(() => {
    const engine = GeonkickEngine.getInstance();
    engine.triggerNote(69, 127);
  }, []);

  /* ── Envelope read/write ──────────────────────────────────────────────── */

  const currentEnvChoice = envGroup === 'kick' ? KICK_ENVELOPES[kickEnvIdx] : OSC_ENVELOPES[oscEnvIdx];

  const currentEnvelopePoints = useMemo((): EnvelopePoint[] => {
    const preset = configRef.current.preset;
    if (!preset || !currentEnvChoice) return [...DEFAULT_ENVELOPE];
    const { path } = getEnvelopePath(currentEnvChoice, selectedOsc);
    return readEnvelopePoints(preset, path);
  }, [config.preset, currentEnvChoice, selectedOsc]);

  const handleEnvelopeChange = useCallback(
    (pts: EnvelopePoint[]) => {
      if (!currentEnvChoice) return;
      const cfg = configRef.current;
      const engine = GeonkickEngine.getInstance();

      // Send to engine immediately
      if (currentEnvChoice.group === 'kick' && currentEnvChoice.kickType !== undefined) {
        engine.setKickEnvelope(
          currentEnvChoice.kickType as GeonkickKickEnvelope,
          pts.map((p) => ({ x: p.x, y: p.y, controlPoint: false })),
        );
      } else if (currentEnvChoice.group === 'osc' && currentEnvChoice.oscEnvType !== undefined) {
        engine.setOscillatorEnvelope(
          selectedOsc,
          currentEnvChoice.oscEnvType as GeonkickOscEnvelope,
          pts.map((p) => ({ x: p.x, y: p.y, controlPoint: false })),
        );
      }

      // Persist to config.preset
      if (cfg.preset) {
        const { path, shape } = getEnvelopePath(currentEnvChoice, selectedOsc);
        let newPreset: PresetJson;
        if (shape === 'envelope') {
          // Read existing envelope object to preserve amplitude etc
          const existing = getPresetObj(cfg.preset, path);
          const envObj =
            existing && typeof existing === 'object' && !Array.isArray(existing)
              ? { ...(existing as Record<string, unknown>) }
              : {};
          envObj.points = pointsToArray(pts);
          newPreset = setPresetValue(cfg.preset, path, envObj);
        } else {
          newPreset = setPresetValue(cfg.preset, path, pointsToArray(pts));
        }
        onChange({ preset: newPreset });
      }
    },
    [currentEnvChoice, selectedOsc, onChange],
  );

  /* ── Scalar parameter helpers ─────────────────────────────────────────── */

  const updatePresetValue = useCallback(
    (path: string, value: unknown, engineCall: (engine: GeonkickEngine) => void) => {
      const cfg = configRef.current;
      const engine = GeonkickEngine.getInstance();
      engineCall(engine);
      if (cfg.preset) {
        const newPreset = setPresetValue(cfg.preset, path, value);
        onChange({ preset: newPreset });
      }
    },
    [onChange],
  );

  /* ── Render ───────────────────────────────────────────────────────────── */

  if (error) {
    return (
      <div className="p-4 text-accent-error text-sm">
        Error: {error}
      </div>
    );
  }

  if (!manifest) {
    return <div className="p-4 text-text-muted text-sm">Loading Geonkick presets...</div>;
  }

  const currentPresetFile = (() => {
    const nameParts = config.name?.split(' / ');
    if (!nameParts || nameParts.length !== 2) return null;
    return currentBundle?.presets.find((p) => p.name === nameParts[1])?.file ?? null;
  })();

  const preset = config.preset;

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-dark-bg to-dark-bgDeep">
      {/* Top: current voice + audition */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-dark-border">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Geonkick</div>
            <div className="text-sm font-mono" style={{ color: accentColor }}>
              {config.name ?? 'default kick (no preset)'}
            </div>
          </div>
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded border border-dark-borderLight text-text-muted hover:text-text-secondary"
          >
            {showPresets ? 'Hide Presets' : 'Presets'}
          </button>
        </div>
        <button
          onClick={audition}
          disabled={loading}
          className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded border disabled:opacity-50"
          style={{
            background: `${accentColor}20`,
            color: accentColor,
            borderColor: `${accentColor}66`,
          }}
        >
          Audition
        </button>
      </div>

      {/* Collapsible preset browser */}
      {showPresets && (
        <div className="border-b border-dark-border">
          <div className="flex gap-2 px-4 py-2 border-b border-dark-border flex-wrap">
            {manifest.bundles.map((b) => {
              const active = b.name === selectedBundle;
              return (
                <button
                  key={b.name}
                  onClick={() => setSelectedBundle(b.name)}
                  className={`px-3 py-1 text-[11px] font-bold rounded border ${
                    active
                      ? 'border-accent-primary/40'
                      : 'bg-dark-bgSecondary text-text-muted border-dark-borderLight hover:text-text-secondary'
                  }`}
                  style={active ? { background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}66` } : undefined}
                >
                  {b.name}
                  <span className="ml-1 text-[9px] opacity-60">{b.presets.length}</span>
                </button>
              );
            })}
          </div>
          <div className="max-h-40 overflow-y-auto p-3">
            {currentBundle ? (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1">
                {currentBundle.presets.map((entry) => {
                  const active = currentPresetFile === entry.file;
                  return (
                    <button
                      key={entry.file}
                      onClick={() => loadPreset(entry)}
                      disabled={loading}
                      className={`px-2 py-1 text-left text-[11px] rounded border transition-colors ${
                        active
                          ? 'border-accent-primary/40'
                          : 'bg-dark-bgSecondary text-text-secondary border-dark-borderLight hover:border-dark-borderLight'
                      } disabled:opacity-50`}
                      style={active ? { background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}66` } : undefined}
                    >
                      {entry.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-text-muted text-sm">Select a bundle.</div>
            )}
          </div>
        </div>
      )}

      {/* Tabs: Envelope | Kick | Oscillator */}
      <div className="flex border-b border-dark-border">
        {(['envelope', 'kick', 'oscillator'] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                active ? 'border-b-2' : 'text-text-muted hover:text-text-secondary'
              }`}
              style={active ? { color: accentColor, borderColor: accentColor, background: '#252525' } : undefined}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'envelope' && (
          <div className="p-3 flex flex-col gap-3">
            {/* Envelope group selector */}
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setEnvGroup('kick')}
                className={`px-3 py-1 text-[11px] font-bold rounded border ${
                  envGroup === 'kick' ? '' : 'bg-dark-bgSecondary text-text-muted border-dark-borderLight'
                }`}
                style={envGroup === 'kick' ? { background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}66` } : undefined}
              >
                Kick
              </button>
              <button
                onClick={() => setEnvGroup('osc')}
                className={`px-3 py-1 text-[11px] font-bold rounded border ${
                  envGroup === 'osc' ? '' : 'bg-dark-bgSecondary text-text-muted border-dark-borderLight'
                }`}
                style={envGroup === 'osc' ? { background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}66` } : undefined}
              >
                Oscillator
              </button>

              {/* Osc index selector when in osc mode */}
              {envGroup === 'osc' && (
                <div className="flex gap-1 ml-2">
                  {Array.from({ length: 9 }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedOsc(i)}
                      className={`w-6 h-6 text-[10px] font-bold rounded border ${
                        selectedOsc === i ? '' : 'bg-dark-bgSecondary text-text-muted border-dark-borderLight'
                      }`}
                      style={selectedOsc === i ? { background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}66` } : undefined}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Envelope type picker */}
            <div className="flex gap-1 flex-wrap">
              {(envGroup === 'kick' ? KICK_ENVELOPES : OSC_ENVELOPES).map((env, idx) => {
                const active = envGroup === 'kick' ? kickEnvIdx === idx : oscEnvIdx === idx;
                return (
                  <button
                    key={env.label}
                    onClick={() => (envGroup === 'kick' ? setKickEnvIdx(idx) : setOscEnvIdx(idx))}
                    className={`px-2 py-1 text-[10px] font-bold rounded border ${
                      active ? '' : 'bg-dark-bgSecondary text-text-muted border-dark-borderLight'
                    }`}
                    style={active ? { background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}66` } : undefined}
                  >
                    {env.label}
                  </button>
                );
              })}
            </div>

            {/* Canvas */}
            <div className="rounded border border-dark-border overflow-hidden">
              <GeonkickEnvelopeCanvas
                points={currentEnvelopePoints}
                onChange={handleEnvelopeChange}
                width={520}
                height={180}
                yLabel={currentEnvChoice?.yLabel ?? 'Value'}
                accentColor={accentColor}
              />
            </div>
            <div className="text-[10px] text-text-muted">
              Click to add point. Drag to move. Right-click to remove.
            </div>
          </div>
        )}

        {activeTab === 'kick' && (
          <div className="p-3 flex flex-col gap-3">
            {/* Kick globals */}
            <div className={`p-3 rounded-lg border ${panelBg}`} style={panelStyle}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">
                Kick Globals
              </div>
              <div className="flex gap-4 flex-wrap">
                <Knob
                  value={readPresetNumber(preset, 'kick.ampl_env.length', 300) / 1000}
                  min={0.05}
                  max={4.0}
                  onChange={(v) =>
                    updatePresetValue('kick.ampl_env.length', v * 1000, (e) => e.setLength(v))
                  }
                  label="Length"
                  color={knobColor}
                  formatValue={(v) => `${(v * 1000).toFixed(0)}ms`}
                />
                <Knob
                  value={readPresetNumber(preset, 'kick.limiter', 1.0)}
                  min={0}
                  max={1.5}
                  onChange={(v) =>
                    updatePresetValue('kick.limiter', v, (e) => e.setLimiter(v))
                  }
                  label="Limiter"
                  color={knobColor}
                  formatValue={(v) => `${v.toFixed(2)}`}
                />
                <Knob
                  value={readPresetNumber(preset, 'kick.ampl_env.amplitude', 1.0)}
                  min={0}
                  max={1}
                  onChange={(v) =>
                    updatePresetValue('kick.ampl_env.amplitude', v, (e) => e.setKickAmplitude(v))
                  }
                  label="Amplitude"
                  color={knobColor}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                />
              </div>
            </div>

            {/* Filter */}
            <div className={`p-3 rounded-lg border ${panelBg}`} style={panelStyle}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Kick Filter
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-[10px] text-text-muted">Enable</span>
                  <input
                    type="checkbox"
                    checked={readPresetBool(preset, 'kick.filter.enabled', false)}
                    onChange={(e) =>
                      updatePresetValue('kick.filter.enabled', e.target.checked, (eng) =>
                        eng.setFilterEnabled(e.target.checked),
                      )
                    }
                    className="w-3.5 h-3.5 rounded border-2 bg-transparent cursor-pointer accent-accent-primary"
                  />
                </label>
              </div>
              <div
                className={`flex gap-4 flex-wrap transition-opacity ${
                  readPresetBool(preset, 'kick.filter.enabled', false) ? 'opacity-100' : 'opacity-40 pointer-events-none'
                }`}
              >
                <Knob
                  paramKey="geonkick.filterCutoff"
                  value={readPresetNumber(preset, 'kick.filter.cutoff', 800)}
                  min={20}
                  max={20000}
                  onChange={(v) =>
                    updatePresetValue('kick.filter.cutoff', v, (e) => e.setFilterCutoff(v))
                  }
                  label="Cutoff"
                  color={knobColor}
                  logarithmic
                  formatValue={(v) => `${Math.round(v)}Hz`}
                />
                <Knob
                  paramKey="geonkick.filterQ"
                  value={readPresetNumber(preset, 'kick.filter.factor', 10)}
                  min={0.1}
                  max={20}
                  onChange={(v) =>
                    updatePresetValue('kick.filter.factor', v, (e) => e.setFilterFactor(v))
                  }
                  label="Q"
                  color={knobColor}
                  formatValue={(v) => `${v.toFixed(1)}`}
                />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-text-muted uppercase">Type</span>
                  <div className="flex gap-1">
                    {Object.entries(FILTER_TYPE_LABELS).map(([val, label]) => {
                      const numVal = Number(val);
                      const active = readPresetNumber(preset, 'kick.filter.type', 0) === numVal;
                      return (
                        <button
                          key={val}
                          onClick={() =>
                            updatePresetValue('kick.filter.type', numVal, (e) =>
                              e.setFilterType(numVal as GeonkickFilterType),
                            )
                          }
                          className={`px-2 py-1 text-[10px] font-bold rounded border ${
                            active ? '' : 'bg-dark-bgSecondary text-text-muted border-dark-borderLight'
                          }`}
                          style={active ? { background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}66` } : undefined}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Distortion */}
            <div className={`p-3 rounded-lg border ${panelBg}`} style={panelStyle}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Distortion
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-[10px] text-text-muted">Enable</span>
                  <input
                    type="checkbox"
                    checked={readPresetBool(preset, 'kick.distortion.enabled', false)}
                    onChange={(e) =>
                      updatePresetValue('kick.distortion.enabled', e.target.checked, (eng) =>
                        eng.setDistortionEnabled(e.target.checked),
                      )
                    }
                    className="w-3.5 h-3.5 rounded border-2 bg-transparent cursor-pointer accent-accent-primary"
                  />
                </label>
              </div>
              <div
                className={`flex gap-4 flex-wrap transition-opacity ${
                  readPresetBool(preset, 'kick.distortion.enabled', false) ? 'opacity-100' : 'opacity-40 pointer-events-none'
                }`}
              >
                <Knob
                  paramKey="geonkick.distDrive"
                  value={readPresetNumber(preset, 'kick.distortion.drive', 1)}
                  min={0}
                  max={10}
                  onChange={(v) =>
                    updatePresetValue('kick.distortion.drive', v, (e) => e.setDistortionDrive(v))
                  }
                  label="Drive"
                  color={knobColor}
                  formatValue={(v) => `${v.toFixed(2)}`}
                />
                <Knob
                  value={readPresetNumber(preset, 'kick.distortion.volume', 0.5)}
                  min={0}
                  max={2}
                  onChange={(v) =>
                    updatePresetValue('kick.distortion.volume', v, (e) => e.setDistortionVolume(v))
                  }
                  label="Volume"
                  color={knobColor}
                  formatValue={(v) => `${v.toFixed(2)}`}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'oscillator' && (
          <div className="p-3 flex flex-col gap-3">
            {/* Osc selector */}
            <div className="flex gap-1">
              {Array.from({ length: 9 }, (_, i) => {
                const oscEnabled = readPresetBool(preset, `osc${i}.enabled`, false);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedOsc(i)}
                    className={`px-3 py-1 text-[11px] font-bold rounded border ${
                      selectedOsc === i ? '' : 'bg-dark-bgSecondary border-dark-borderLight'
                    }`}
                    style={
                      selectedOsc === i
                        ? { background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}66` }
                        : { color: oscEnabled ? '#9ca3af' : '#4b5563' }
                    }
                  >
                    Osc {i}
                    {oscEnabled ? '' : ' (off)'}
                  </button>
                );
              })}
            </div>

            {/* Per-osc controls */}
            <div className={`p-3 rounded-lg border ${panelBg}`} style={panelStyle}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Oscillator {selectedOsc}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-[10px] text-text-muted">Enable</span>
                  <input
                    type="checkbox"
                    checked={readPresetBool(preset, `osc${selectedOsc}.enabled`, false)}
                    onChange={(e) =>
                      updatePresetValue(`osc${selectedOsc}.enabled`, e.target.checked, (eng) =>
                        eng.enableOscillator(selectedOsc, e.target.checked),
                      )
                    }
                    className="w-3.5 h-3.5 rounded border-2 bg-transparent cursor-pointer accent-accent-primary"
                  />
                </label>
              </div>

              <div className="flex gap-4 flex-wrap items-start">
                <Knob
                  value={readPresetNumber(preset, `osc${selectedOsc}.ampl_env.amplitude`, 0.26)}
                  min={0}
                  max={1}
                  onChange={(v) =>
                    updatePresetValue(`osc${selectedOsc}.ampl_env.amplitude`, v, (e) =>
                      e.setOscillatorAmplitude(selectedOsc, v),
                    )
                  }
                  label="Amplitude"
                  color={knobColor}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                />
                <Knob
                  value={readPresetNumber(preset, `osc${selectedOsc}.freq_env.amplitude`, 800)}
                  min={20}
                  max={20000}
                  onChange={(v) =>
                    updatePresetValue(`osc${selectedOsc}.freq_env.amplitude`, v, (e) =>
                      e.setOscillatorFrequency(selectedOsc, v),
                    )
                  }
                  label="Frequency"
                  color={knobColor}
                  logarithmic
                  formatValue={(v) => `${Math.round(v)}Hz`}
                />
                <Knob
                  value={readPresetNumber(preset, `osc${selectedOsc}.phase`, 0)}
                  min={0}
                  max={1}
                  onChange={(v) =>
                    updatePresetValue(`osc${selectedOsc}.phase`, v, (e) =>
                      e.setOscillatorPhase(selectedOsc, v),
                    )
                  }
                  label="Phase"
                  color={knobColor}
                  formatValue={(v) => `${(v * 360).toFixed(0)}deg`}
                />
                <Knob
                  value={readPresetNumber(preset, `osc${selectedOsc}.seed`, 0)}
                  min={0}
                  max={1000}
                  onChange={(v) =>
                    updatePresetValue(`osc${selectedOsc}.seed`, Math.round(v), (e) =>
                      e.setOscillatorSeed(selectedOsc, Math.round(v)),
                    )
                  }
                  label="Seed"
                  color={knobColor}
                  formatValue={(v) => `${Math.round(v)}`}
                />

                {/* Waveform selector */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-text-muted uppercase">Function</span>
                  <div className="flex gap-1 flex-wrap max-w-[180px]">
                    {Object.entries(OSC_FUNC_LABELS).map(([val, label]) => {
                      const numVal = Number(val);
                      const active =
                        readPresetNumber(preset, `osc${selectedOsc}.function`, 0) === numVal;
                      return (
                        <button
                          key={val}
                          onClick={() =>
                            updatePresetValue(`osc${selectedOsc}.function`, numVal, (e) =>
                              e.setOscillatorFunction(selectedOsc, numVal as GeonkickOscFunction),
                            )
                          }
                          className={`px-2 py-1 text-[9px] font-bold rounded border ${
                            active ? '' : 'bg-dark-bgSecondary text-text-muted border-dark-borderLight'
                          }`}
                          style={active ? { background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}66` } : undefined}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* FM toggle */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-text-muted uppercase">FM</span>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={readPresetBool(preset, `osc${selectedOsc}.is_fm`, false)}
                      onChange={(e) =>
                        updatePresetValue(`osc${selectedOsc}.is_fm`, e.target.checked, (eng) =>
                          eng.setOscillatorFm(selectedOsc, e.target.checked),
                        )
                      }
                      className="w-4 h-4 rounded border-2 bg-transparent cursor-pointer accent-accent-primary"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Per-osc filter */}
            <div className={`p-3 rounded-lg border ${panelBg}`} style={panelStyle}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Osc {selectedOsc} Filter
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-[10px] text-text-muted">Enable</span>
                  <input
                    type="checkbox"
                    checked={readPresetBool(preset, `osc${selectedOsc}.filter.enabled`, false)}
                    onChange={(e) =>
                      updatePresetValue(`osc${selectedOsc}.filter.enabled`, e.target.checked, (eng) =>
                        eng.setOscillatorFilterEnabled(selectedOsc, e.target.checked),
                      )
                    }
                    className="w-3.5 h-3.5 rounded border-2 bg-transparent cursor-pointer accent-accent-primary"
                  />
                </label>
              </div>
              <div
                className={`flex gap-4 flex-wrap transition-opacity ${
                  readPresetBool(preset, `osc${selectedOsc}.filter.enabled`, false) ? 'opacity-100' : 'opacity-40 pointer-events-none'
                }`}
              >
                <Knob
                  value={readPresetNumber(preset, `osc${selectedOsc}.filter.cutoff`, 800)}
                  min={20}
                  max={20000}
                  onChange={(v) =>
                    updatePresetValue(`osc${selectedOsc}.filter.cutoff`, v, (e) =>
                      e.setOscillatorFilterCutoff(selectedOsc, v),
                    )
                  }
                  label="Cutoff"
                  color={knobColor}
                  logarithmic
                  formatValue={(v) => `${Math.round(v)}Hz`}
                />
                <Knob
                  value={readPresetNumber(preset, `osc${selectedOsc}.filter.factor`, 10)}
                  min={0.1}
                  max={20}
                  onChange={(v) =>
                    updatePresetValue(`osc${selectedOsc}.filter.factor`, v, (e) =>
                      e.setOscillatorFilterFactor(selectedOsc, v),
                    )
                  }
                  label="Q"
                  color={knobColor}
                  formatValue={(v) => `${v.toFixed(1)}`}
                />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-text-muted uppercase">Type</span>
                  <div className="flex gap-1">
                    {Object.entries(FILTER_TYPE_LABELS).map(([val, label]) => {
                      const numVal = Number(val);
                      const active =
                        readPresetNumber(preset, `osc${selectedOsc}.filter.type`, 0) === numVal;
                      return (
                        <button
                          key={val}
                          onClick={() =>
                            updatePresetValue(`osc${selectedOsc}.filter.type`, numVal, (e) =>
                              e.setOscillatorFilterType(selectedOsc, numVal as GeonkickFilterType),
                            )
                          }
                          className={`px-2 py-1 text-[10px] font-bold rounded border ${
                            active ? '' : 'bg-dark-bgSecondary text-text-muted border-dark-borderLight'
                          }`}
                          style={active ? { background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}66` } : undefined}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
