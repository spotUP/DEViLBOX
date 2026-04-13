/**
 * PixiDJFxPresets — Native GL FX preset selector using PixiSelect dropdown.
 *
 * Shows factory presets grouped by category + user presets.
 * One-click apply. Clear All FX at top.
 */

import React, { useCallback, useState, useMemo } from 'react';
import { PixiSelect, type SelectOption } from '@/pixi/components/PixiSelect';
import { MASTER_FX_PRESETS, type MasterFxPreset } from '@/constants/fxPresets';
import { useAudioStore } from '@/stores/useAudioStore';
import type { EffectConfig } from '@typedefs/instrument';

const CATEGORY_ORDER: MasterFxPreset['category'][] = [
  'Amiga', 'C64', 'DJ', 'Genre', 'Loud', 'Warm', 'Clean', 'Wide', 'Vinyl',
];

const USER_PRESETS_KEY = 'master-fx-user-presets';

interface UserPreset { name: string; effects: EffectConfig[] }

function getUserPresets(): UserPreset[] {
  try {
    const stored = localStorage.getItem(USER_PRESETS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((p: UserPreset) => p?.name && Array.isArray(p.effects)) : [];
  } catch { return []; }
}

interface Props {
  width?: number;
  height?: number;
  layout?: Record<string, unknown>;
}

export const PixiDJFxPresets: React.FC<Props> = ({ width = 130, height = 24, layout: layoutProp }) => {
  const [activeValue, setActiveValue] = useState('');
  const setMasterEffects = useAudioStore((s) => s.setMasterEffects);

  const options = useMemo((): SelectOption[] => {
    const opts: SelectOption[] = [
      { value: '__clear__', label: 'Clear All FX' },
    ];

    // User presets
    const userPresets = getUserPresets();
    if (userPresets.length > 0) {
      for (const p of userPresets) {
        opts.push({ value: `user:${p.name}`, label: `★ ${p.name}`, group: 'My Presets' });
      }
    }

    // Factory presets by category
    for (const cat of CATEGORY_ORDER) {
      const catPresets = MASTER_FX_PRESETS.filter(p => p.category === cat);
      for (const p of catPresets) {
        opts.push({ value: `factory:${p.name}`, label: p.name, group: cat });
      }
    }
    return opts;
  }, []);

  const handleChange = useCallback((value: string) => {
    if (value === '__clear__') {
      setMasterEffects([]);
      setActiveValue('');
      return;
    }

    if (value.startsWith('user:')) {
      const name = value.slice(5);
      const preset = getUserPresets().find(p => p.name === name);
      if (preset) {
        const effects = preset.effects.map((fx, i) => ({ ...fx, id: `master-fx-${Date.now()}-${i}` }));
        setMasterEffects(effects);
        setActiveValue(value);
      }
      return;
    }

    if (value.startsWith('factory:')) {
      const name = value.slice(8);
      const preset = MASTER_FX_PRESETS.find(p => p.name === name);
      if (preset) {
        const effects: EffectConfig[] = preset.effects.map((fx, i) => ({ ...fx, id: `master-fx-${Date.now()}-${i}` }));
        setMasterEffects(effects);
        setActiveValue(value);
      }
    }
  }, [setMasterEffects]);

  return (
    <PixiSelect
      options={options}
      value={activeValue}
      onChange={handleChange}
      width={width}
      height={height}
      placeholder="FX Presets"
      layout={layoutProp}
    />
  );
};
