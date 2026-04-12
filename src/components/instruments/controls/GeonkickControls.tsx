/**
 * GeonkickControls — minimal editor for the Geonkick percussion synth.
 *
 * MVP UI: preset browser (82 bundled presets across 7 kit bundles) plus an
 * audition button that triggers the loaded voice on MIDI note 69. The full
 * parameter surface (envelopes, oscillators, filter, distortion) exists in
 * GeonkickEngine but needs a dedicated envelope editor before exposing it
 * to the user — tracked as the next phase in the port session.
 *
 * Loading a preset applies it to the shared Geonkick worker immediately
 * AND stores the parsed JSON onto the instrument's `geonkick.preset` slot
 * so the state survives project save/load.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GeonkickConfig } from '@/types/instrument/exotic';
import { GeonkickEngine } from '@engine/geonkick/GeonkickEngine';
import { applyGeonkickPreset } from '@engine/geonkick/GeonkickPresetLoader';

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

export const GeonkickControls: React.FC<GeonkickControlsProps> = ({ config, onChange }) => {
  const [manifest, setManifest] = useState<PresetManifest | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<string>(() => config.name?.split(' / ')[0] ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
    return (
      <div className="p-4 text-accent-error text-sm">
        Error: {error}
      </div>
    );
  }

  if (!manifest) {
    return <div className="p-4 text-text-muted text-sm">Loading Geonkick presets…</div>;
  }

  const currentPresetFile = (() => {
    const nameParts = config.name?.split(' / ');
    if (!nameParts || nameParts.length !== 2) return null;
    return currentBundle?.presets.find((p) => p.name === nameParts[1])?.file ?? null;
  })();

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Top: current voice + audition */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted">Geonkick</div>
          <div className="text-sm text-accent-primary font-mono">
            {config.name ?? 'default kick (no preset)'}
          </div>
        </div>
        <button
          onClick={audition}
          disabled={loading}
          className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded bg-accent-primary/20 text-accent-primary border border-accent-primary/40 hover:bg-accent-primary/30 disabled:opacity-50"
        >
          Audition
        </button>
      </div>

      {/* Bundle picker */}
      <div className="flex gap-2 px-4 py-2 border-b border-dark-border flex-wrap">
        {manifest.bundles.map((b) => {
          const active = b.name === selectedBundle;
          return (
            <button
              key={b.name}
              onClick={() => setSelectedBundle(b.name)}
              className={`px-3 py-1 text-[11px] font-bold rounded border ${
                active
                  ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40'
                  : 'bg-[#1a1a1a] text-text-muted border-dark-borderLight hover:text-text-secondary'
              }`}
            >
              {b.name}
              <span className="ml-1 text-[9px] opacity-60">{b.presets.length}</span>
            </button>
          );
        })}
      </div>

      {/* Preset grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {currentBundle ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {currentBundle.presets.map((entry) => {
              const active = currentPresetFile === entry.file;
              return (
                <button
                  key={entry.file}
                  onClick={() => loadPreset(entry)}
                  disabled={loading}
                  className={`px-3 py-2 text-left text-xs rounded border transition-colors ${
                    active
                      ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40'
                      : 'bg-[#1a1a1a] text-text-secondary border-dark-borderLight hover:border-accent-primary/40'
                  } disabled:opacity-50`}
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
  );
};
