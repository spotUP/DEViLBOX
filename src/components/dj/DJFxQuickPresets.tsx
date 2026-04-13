/**
 * DJFxQuickPresets - Quick dropdown for applying master FX presets in DJ view.
 *
 * Shows factory presets (grouped by category, DJ category first), user presets,
 * and an "Add Effect" section with all 49 effects from the unified registry.
 * One-click apply without opening the full Master Effects editor.
 * When logged in, user presets are synced to the server.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronDown, Star, Trash2, CloudOff, Cloud, Plus } from 'lucide-react';
import { MASTER_FX_PRESETS, type MasterFxPreset } from '@/constants/fxPresets';
import { AVAILABLE_EFFECTS, type AvailableEffect } from '@/constants/unifiedEffects';
import { GUITARML_MODEL_REGISTRY } from '@/constants/guitarMLRegistry';
import { getDefaultEffectParameters } from '@engine/InstrumentFactory';
import { useAudioStore } from '@/stores/useAudioStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { pushToCloud } from '@/lib/cloudSync';
import { SYNC_KEYS } from '@/hooks/useCloudSync';
import type { EffectConfig, AudioEffectType } from '@typedefs/instrument';
import { useClickOutside } from '@hooks/useClickOutside';

// ── User preset types ────────────────────────────────────────────────────────

interface UserMasterFxPreset {
  name: string;
  effects: EffectConfig[];
}

const USER_PRESETS_KEY = 'master-fx-user-presets';

// ── Category order (DJ first for DJ view) ────────────────────────────────────

// Effects where wet should default to 100% (not 50%)
const DYNAMICS_EFFECTS = new Set<string>(['Compressor', 'EQ3']);

// Group all available effects by their UI group for the "Add Effect" section
const effectsByGroup = AVAILABLE_EFFECTS.reduce((acc, effect) => {
  if (!acc[effect.group]) acc[effect.group] = [];
  acc[effect.group].push(effect);
  return acc;
}, {} as Record<string, AvailableEffect[]>);

// Group factory presets by category — derived from presets, sorted alphabetically
const groupedPresets = (() => {
  const byCategory: Record<string, MasterFxPreset[]> = {};
  for (const p of MASTER_FX_PRESETS) {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p);
  }
  return Object.keys(byCategory).sort().map(cat => ({ category: cat, presets: byCategory[cat] }));
})();

// ── Component ────────────────────────────────────────────────────────────────

export const DJFxQuickPresets: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddEffect, setShowAddEffect] = useState(false);
  const [activePresetName, setActivePresetName] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const setMasterEffects = useAudioStore((s) => s.setMasterEffects);
  const addMasterEffectConfig = useAudioStore((s) => s.addMasterEffectConfig);
  const user = useAuthStore((s) => s.user);

  // ── Local user presets ───────────────────────────────────────────────────

  const getUserPresets = useCallback((): UserMasterFxPreset[] => {
    try {
      const stored = localStorage.getItem(USER_PRESETS_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (p: unknown): p is UserMasterFxPreset =>
          p !== null &&
          typeof p === 'object' &&
          typeof (p as UserMasterFxPreset).name === 'string' &&
          Array.isArray((p as UserMasterFxPreset).effects),
      );
    } catch {
      return [];
    }
  }, []);

  const [userPresets, setUserPresets] = useState<UserMasterFxPreset[]>(getUserPresets);

  // Refresh user presets when dropdown opens (picks up saves from MasterEffectsPanel)
  useEffect(() => {
    if (isOpen) setUserPresets(getUserPresets());
  }, [isOpen, getUserPresets]);

  // ── Server sync helper (uses centralized cloudSync) ─────────────────────

  const syncToServer = useCallback((presets: UserMasterFxPreset[]) => {
    pushToCloud(SYNC_KEYS.MASTER_FX_PRESETS, presets).catch((err) => console.warn('FX preset cloud sync failed:', err));
  }, []);

  // ── Apply preset ───────────────────────────────────────────────────────

  const applyFactoryPreset = useCallback(
    (preset: MasterFxPreset) => {
      const effects: EffectConfig[] = preset.effects.map((fx, i) => ({
        ...fx,
        id: `master-fx-${Date.now()}-${i}`,
      }));
      setMasterEffects(effects);
      setActivePresetName(preset.name);
      setIsOpen(false);
    },
    [setMasterEffects],
  );

  const applyUserPreset = useCallback(
    (preset: UserMasterFxPreset) => {
      const effects: EffectConfig[] = preset.effects.map((fx, i) => ({
        ...fx,
        id: `master-fx-${Date.now()}-${i}`,
      }));
      setMasterEffects(effects);
      setActivePresetName(preset.name);
      setIsOpen(false);
    },
    [setMasterEffects],
  );

  const deleteUserPreset = useCallback(
    async (name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const updated = getUserPresets().filter((p) => p.name !== name);
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(updated));
      setUserPresets(updated);
      if (activePresetName === name) setActivePresetName(null);
      // Sync to server
      await syncToServer(updated);
    },
    [getUserPresets, activePresetName, syncToServer],
  );

  const clearPresets = useCallback(() => {
    setMasterEffects([]);
    setActivePresetName(null);
    setIsOpen(false);
  }, [setMasterEffects]);

  // ── Add individual effect from unified registry ───────────────────────
  const handleAddEffect = useCallback(
    (availableEffect: AvailableEffect) => {
      const type = (availableEffect.type as AudioEffectType) || 'Distortion';
      const params: Record<string, number | string> = { ...getDefaultEffectParameters(type) };

      if (availableEffect.category === 'neural' && availableEffect.neuralModelIndex !== undefined) {
        const model = GUITARML_MODEL_REGISTRY[availableEffect.neuralModelIndex];
        if (model?.parameters) {
          Object.entries(model.parameters).forEach(([key, param]) => {
            if (param) params[key] = param.default;
          });
        }
      }

      const defaultWet = DYNAMICS_EFFECTS.has(type) ? 100 : 50;

      addMasterEffectConfig({
        category: availableEffect.category,
        type,
        enabled: true,
        wet: defaultWet,
        parameters: params,
        neuralModelIndex: availableEffect.neuralModelIndex,
        neuralModelName: availableEffect.category === 'neural' ? availableEffect.label : undefined,
      });
      setActivePresetName(null);
      // Don't close — let user add multiple effects
    },
    [addMasterEffectConfig],
  );

  // ── Click outside to close ─────────────────────────────────────────────
  useClickOutside(dropdownRef, () => setIsOpen(false), { enabled: isOpen });

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono border transition-all
          ${activePresetName
            ? 'border-green-600/60 bg-green-950/30 text-green-400'
            : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
          }`}
      >
        <span className="truncate max-w-[120px]">
          {activePresetName || 'FX Presets'}
        </span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-[99990] w-64 max-h-[70vh] overflow-y-auto rounded-lg border border-dark-border bg-dark-bgSecondary shadow-xl">
          {/* Clear / Bypass */}
          <button
            onClick={clearPresets}
            className="w-full px-3 py-2 text-left text-xs font-mono text-text-muted hover:bg-dark-bgHover hover:text-text-primary border-b border-dark-border transition-colors"
          >
            Clear All FX
          </button>

          {/* User presets */}
          {userPresets.length > 0 && (
            <div className="border-b border-dark-border">
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-400/70">
                <Star size={10} />
                My Presets
                {user && <Cloud size={9} className="ml-auto text-green-500/50" aria-label="Synced to account" />}
                {!user && <CloudOff size={9} className="ml-auto text-text-muted/30" aria-label="Local only — log in to sync" />}
              </div>
              {userPresets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyUserPreset(preset)}
                  className={`group flex items-center w-full px-3 py-1.5 text-left text-xs font-mono transition-colors
                    ${activePresetName === preset.name
                      ? 'bg-amber-950/30 text-amber-300'
                      : 'text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
                    }`}
                >
                  <span className="truncate flex-1">{preset.name}</span>
                  <span className="text-[9px] text-text-muted/50 mr-2">
                    {preset.effects.length} fx
                  </span>
                  <Trash2
                    size={11}
                    className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-red-400 transition-opacity"
                    onClick={(e) => deleteUserPreset(preset.name, e)}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Factory presets by category */}
          {groupedPresets.map(({ category, presets }) => (
            <div key={category} className="border-b border-dark-border last:border-0">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-text-muted/60">
                {category}
              </div>
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyFactoryPreset(preset)}
                  className={`w-full px-3 py-1.5 text-left text-xs font-mono transition-colors
                    ${activePresetName === preset.name
                      ? 'bg-accent-primary/10 text-accent-primary'
                      : 'text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
                    }`}
                  title={preset.description}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          ))}

          {/* Add Individual Effect section */}
          <div className="border-t border-dark-border">
            <button
              onClick={() => setShowAddEffect(!showAddEffect)}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-accent-primary/80 hover:text-accent-primary hover:bg-dark-bgHover transition-colors"
            >
              <Plus size={10} />
              Add Individual Effect
              <ChevronDown size={10} className={`ml-auto transition-transform ${showAddEffect ? 'rotate-180' : ''}`} />
            </button>

            {showAddEffect && (
              <div className="px-2 pb-2 space-y-2">
                {Object.entries(effectsByGroup).map(([group, effects]) => (
                  <div key={group}>
                    <div className="px-1 py-1 text-[9px] font-bold uppercase tracking-widest text-text-muted/50">
                      {group}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {effects.map((effect) => (
                        <button
                          key={effect.type ?? `neural-${effect.neuralModelIndex}`}
                          onClick={() => handleAddEffect(effect)}
                          className="px-1.5 py-0.5 text-[10px] rounded border border-dark-borderLight
                            bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary
                            hover:border-accent-primary/50 transition-colors"
                          title={effect.description}
                        >
                          {effect.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
