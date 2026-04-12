/**
 * PixiGeonkickPanel -- GL-native Geonkick percussion synth preset browser.
 *
 * Mirrors src/components/instruments/controls/GeonkickControls.tsx 1:1:
 *   - Header: "Geonkick" label + current preset name + Audition button
 *   - Bundle picker: PixiSelect dropdown (options from manifest.json)
 *   - Preset grid: PixiButton grid for each preset in the selected bundle
 *
 * Loading a preset fetches the .gkick JSON, applies it to GeonkickEngine,
 * and stores the parsed JSON onto the instrument config for project save/load.
 *
 * Mutations flow via onUpdate(instrumentId, { geonkick: { ...prev, ...changes } }).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixiButton, PixiLabel, PixiSelect, type SelectOption } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
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

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
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

export const PixiGeonkickPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const gk = instrument.geonkick;
  const [manifest, setManifest] = useState<PresetManifest | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<string>(() => gk?.name?.split(' / ')[0] ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const gkRef = useRef(gk);
  useEffect(() => { gkRef.current = gk; }, [gk]);

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

  const bundleOptions = useMemo<SelectOption[]>(() => {
    if (!manifest) return [];
    return manifest.bundles.map((b) => ({
      value: b.name,
      label: `${b.name} (${b.presets.length})`,
    }));
  }, [manifest]);

  const currentBundle = useMemo(
    () => manifest?.bundles.find((b) => b.name === selectedBundle),
    [manifest, selectedBundle],
  );

  const currentPresetFile = useMemo(() => {
    const nameParts = gk?.name?.split(' / ');
    if (!nameParts || nameParts.length !== 2) return null;
    return currentBundle?.presets.find((p) => p.name === nameParts[1])?.file ?? null;
  }, [gk?.name, currentBundle]);

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
        onUpdate(instrumentIdRef.current, {
          geonkick: {
            ...gkRef.current,
            preset,
            name: `${selectedBundle} / ${entry.name}`,
          } as GeonkickConfig,
        });
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [onUpdate, selectedBundle],
  );

  const audition = useCallback(() => {
    const engine = GeonkickEngine.getInstance();
    engine.triggerNote(69, 127);
  }, []);

  if (error) {
    return (
      <layoutContainer layout={{ padding: 12 }}>
        <PixiLabel text={`Error: ${error}`} size="sm" color="custom" customColor={theme.error.color} />
      </layoutContainer>
    );
  }

  if (!manifest) {
    return (
      <layoutContainer layout={{ padding: 12 }}>
        <PixiLabel text="Loading Geonkick presets..." size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          padding: 6,
          borderRadius: 4,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <PixiLabel text="Geonkick" size="sm" weight="bold" color="custom" customColor={theme.accent.color} />
        <PixiLabel
          text={gk?.name ?? 'default kick (no preset)'}
          size="sm"
          color="textSecondary"
        />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiButton
          label="Audition"
          variant="primary"
          onClick={audition}
          disabled={loading}
        />
      </layoutContainer>

      {/* Bundle picker */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <PixiLabel text="Kit:" size="xs" weight="bold" color="textMuted" />
        <PixiSelect
          options={bundleOptions}
          value={selectedBundle}
          onChange={(v) => setSelectedBundle(v)}
          width={200}
        />
      </layoutContainer>

      {/* Preset grid */}
      {currentBundle ? (
        <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingTop: 4 }}>
          {currentBundle.presets.map((entry) => {
            const active = currentPresetFile === entry.file;
            return (
              <PixiButton
                key={entry.file}
                label={entry.name}
                variant={active ? 'primary' : 'ghost'}
                onClick={() => loadPreset(entry)}
                disabled={loading}
              />
            );
          })}
        </layoutContainer>
      ) : (
        <layoutContainer layout={{ padding: 8 }}>
          <PixiLabel text="Select a bundle." size="sm" color="textMuted" />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
