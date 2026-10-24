/**
 * SunVoxPresetSelect - the bundled SunVox instrument library as a preset picker.
 * Picking a patch replaces this instrument's graph (same path as loading a .sunsynth file).
 */
import React, { useMemo } from 'react';
import type { InstrumentConfig } from '@/types/instrument';
import { CustomSelect, type SelectOptionGroup } from '@components/common/CustomSelect';
import { listBundledSunVoxPresets, sunvoxPatchConfigFromUrl } from '@/engine/sunvox/sunvoxPatchConfig';
import { notify } from '@stores/useNotificationStore';

export interface SunVoxPresetSelectProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const SunVoxPresetSelect: React.FC<SunVoxPresetSelectProps> = ({ instrument, onChange }) => {
  const presets = useMemo(() => listBundledSunVoxPresets(), []);
  const groups = useMemo<SelectOptionGroup[]>(() => {
    const byCategory = new Map<string, SelectOptionGroup>();
    for (const p of presets) {
      let group = byCategory.get(p.category);
      if (!group) {
        group = { label: (p.category.charAt(0).toUpperCase() + p.category.slice(1)).replace(/\//g, ' / '), options: [] };
        byCategory.set(p.category, group);
      }
      group.options.push({ value: p.url, label: p.name });
    }
    return [...byCategory.values()];
  }, [presets]);
  const current = presets.find(p => p.name === instrument.sunvox?.patchName);

  const handlePick = async (url: string) => {
    try {
      const { name, config } = await sunvoxPatchConfigFromUrl(url);
      onChange({ name, sunvox: config });
    } catch (err) {
      console.error('[SunVoxPresetSelect] Preset load failed:', err);
      notify.error(`Could not load SunVox preset: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <CustomSelect
      value={current?.url ?? ''}
      onChange={url => void handlePick(url)}
      options={groups}
      placeholder={`Presets (${presets.length})`}
      className="max-w-[200px]"
    />
  );
};
