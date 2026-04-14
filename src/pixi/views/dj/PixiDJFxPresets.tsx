/**
 * PixiDJFxPresets — Native GL FX preset selector using PixiSelect dropdown.
 *
 * Shows factory presets grouped by category + user presets.
 * One-click apply. Clear All FX at top.
 */

import React, { useCallback, useState, useMemo } from 'react';
import { PixiSelect, type SelectOption } from '@/pixi/components/PixiSelect';
import { MASTER_FX_PRESETS } from '@/constants/fxPresets';
import { useAudioStore } from '@/stores/useAudioStore';
import type { EffectConfig } from '@typedefs/instrument';

// Derive categories from presets — no hardcoded list to maintain
const ALL_CATEGORIES = [...new Set(MASTER_FX_PRESETS.map(p => p.category))].sort();

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
    for (const cat of ALL_CATEGORIES) {
      const catPresets = MASTER_FX_PRESETS.filter(p => p.category === cat);
      for (const p of catPresets) {
        opts.push({ value: `factory:${p.name}`, label: p.name, group: cat });
      }
    }
    return opts;
  }, []);

  const applyPresetWithCrossfade = useCallback((newEffects: EffectConfig[], presetLabel: string) => {
    const currentEffects = useAudioStore.getState().masterEffects;
    
    // If no current effects, apply immediately
    if (currentEffects.length === 0) {
      setMasterEffects(newEffects);
      setActiveValue(presetLabel);
      return;
    }

    // Schedule crossfade on next beat
    const { scheduleQuantized } = require('@/engine/dj/DJQuantizedFX');
    const useDJStore = require('@/stores/useDJStore').useDJStore;
    
    // Determine which deck to use for quantization (prefer the playing deck)
    const djState = useDJStore.getState();
    const activeDeck = djState.decks.A.isPlaying ? 'A' : djState.decks.B.isPlaying ? 'B' : 'A';

    // Start crossfade on next beat
    scheduleQuantized(activeDeck, () => {
      const CROSSFADE_MS = 250; // Quarter-second crossfade
      const START_TIME = performance.now();

      // Fade out old effects by reducing wet parameter
      const oldEffectsWithOriginalWet = currentEffects.map(fx => ({ 
        fx, 
        originalWet: fx.wet ?? 50 
      }));

      // Set new effects with wet=0 initially
      const newEffectsZeroWet = newEffects.map(fx => ({ 
        ...fx, 
        wet: 0 
      }));

      // Install new effects at zero wet (silent)
      setMasterEffects([...currentEffects, ...newEffectsZeroWet]);

      // Animate crossfade
      const intervalId = setInterval(() => {
        const elapsed = performance.now() - START_TIME;
        const progress = Math.min(1, elapsed / CROSSFADE_MS);
        
        if (progress >= 1) {
          // Crossfade complete - remove old effects
          clearInterval(intervalId);
          setMasterEffects(newEffects);
          return;
        }

        // Update wet levels
        const currentState = useAudioStore.getState().masterEffects;
        const updated = currentState.map((fx, i) => {
          if (i < currentEffects.length) {
            // Old effect - fade out
            const original = oldEffectsWithOriginalWet[i];
            return { ...fx, wet: original.originalWet * (1 - progress) };
          } else {
            // New effect - fade in
            const targetIdx = i - currentEffects.length;
            const targetWet = newEffects[targetIdx]?.wet ?? 50;
            return { ...fx, wet: targetWet * progress };
          }
        });
        
        setMasterEffects(updated);
      }, 16); // ~60fps
    });

    setActiveValue(presetLabel);
  }, [setMasterEffects]);

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
        applyPresetWithCrossfade(effects, value);
      }
      return;
    }

    if (value.startsWith('factory:')) {
      const name = value.slice(8);
      const preset = MASTER_FX_PRESETS.find(p => p.name === name);
      if (preset) {
        const effects: EffectConfig[] = preset.effects.map((fx, i) => ({ ...fx, id: `master-fx-${Date.now()}-${i}` }));
        applyPresetWithCrossfade(effects, value);
      }
    }
  }, [setMasterEffects, applyPresetWithCrossfade]);

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
