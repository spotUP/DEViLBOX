/**
 * DJFxQuickPresets - Quick dropdown for applying master FX presets in DJ view.
 *
 * Shows factory presets (grouped by category, DJ category first) and user presets.
 * One-click apply without opening the full Master Effects editor.
 * When logged in, user presets are synced to the server.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronDown, Star, Trash2, CloudOff, Cloud } from 'lucide-react';
import { MASTER_FX_PRESETS, type MasterFxPreset } from '@/constants/masterFxPresets';
import { useAudioStore } from '@/stores/useAudioStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { pushToCloud } from '@/lib/cloudSync';
import { SYNC_KEYS } from '@/hooks/useCloudSync';
import type { EffectConfig } from '@typedefs/instrument';

// ── User preset types ────────────────────────────────────────────────────────

interface UserMasterFxPreset {
  name: string;
  effects: EffectConfig[];
}

const USER_PRESETS_KEY = 'master-fx-user-presets';

// ── Category order (DJ first for DJ view) ────────────────────────────────────

const CATEGORY_ORDER: MasterFxPreset['category'][] = [
  'DJ', 'Genre', 'Loud', 'Warm', 'Clean', 'Wide', 'Vinyl',
];

// Group factory presets by category
const groupedPresets = CATEGORY_ORDER.map((cat) => ({
  category: cat,
  presets: MASTER_FX_PRESETS.filter((p) => p.category === cat),
})).filter((g) => g.presets.length > 0);

// ── Component ────────────────────────────────────────────────────────────────

export const DJFxQuickPresets: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activePresetName, setActivePresetName] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const setMasterEffects = useAudioStore((s) => s.setMasterEffects);
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
    pushToCloud(SYNC_KEYS.MASTER_FX_PRESETS, presets).catch(() => {});
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

  // ── Click outside to close ─────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

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
        <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-[70vh] overflow-y-auto rounded-lg border border-dark-border bg-dark-bgSecondary shadow-xl">
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
        </div>
      )}
    </div>
  );
};
