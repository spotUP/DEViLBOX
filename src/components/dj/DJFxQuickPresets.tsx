/**
 * DJFxQuickPresets - Quick dropdown for applying master FX presets in DJ view.
 *
 * Shows factory presets (grouped by category, DJ category first), user presets,
 * and an "Add Effect" section with all 49 effects from the unified registry.
 * One-click apply without opening the full Master Effects editor.
 * When logged in, user presets are synced to the server.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Star, Trash2, CloudOff, Cloud, Plus, Search, X } from 'lucide-react';
import { FX_PRESETS, type FxPreset, type FxTag } from '@/constants/fxPresets';
import { AVAILABLE_EFFECTS, type AvailableEffect } from '@/constants/unifiedEffects';
import { GUITARML_MODEL_REGISTRY } from '@/constants/guitarMLRegistry';
import { getDefaultEffectParameters } from '@engine/InstrumentFactory';
import { useAudioStore } from '@/stores/useAudioStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { pushToCloud } from '@/lib/cloudSync';
import { SYNC_KEYS } from '@/hooks/useCloudSync';
import type { EffectConfig, AudioEffectType } from '@typedefs/instrument';

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

// Group factory presets by primary tag (first tag) — sorted with DJ first
const groupedPresets = (() => {
  const byCategory: Record<string, FxPreset[]> = {};
  for (const p of FX_PRESETS) {
    const cat = p.tags[0];
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  }
  // DJ first, then alphabetical
  const cats = Object.keys(byCategory).sort((a, b) => {
    if (a === 'DJ') return -1;
    if (b === 'DJ') return 1;
    return a.localeCompare(b);
  });
  return cats.map(cat => ({ category: cat, presets: byCategory[cat] }));
})();

// Collect all unique tags across all presets, DJ + Dub cluster first
const ALL_TAGS: FxTag[] = (() => {
  const tags = new Set<FxTag>();
  for (const p of FX_PRESETS) for (const t of p.tags) tags.add(t);
  const arr = Array.from(tags).sort((a, b) => a.localeCompare(b));
  // Pin DJ first, then Dub + its sub-categories, then the rest.
  // Reggae/dub DJs typically want to drill into a specific dub flavour.
  const priority: FxTag[] = ['DJ', 'Dub', 'Dub Echo', 'Dub Reverb', 'Dub Filter', 'Dub Siren', 'Dub Mod'];
  const pinned: FxTag[] = [];
  for (const t of priority) {
    const idx = arr.indexOf(t);
    if (idx >= 0) {
      arr.splice(idx, 1);
      pinned.push(t);
    }
  }
  return [...pinned, ...arr];
})();

// ── Component ────────────────────────────────────────────────────────────────

export const DJFxQuickPresets: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddEffect, setShowAddEffect] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<FxTag | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const masterEffects = useAudioStore((s) => s.masterEffects);
  const setMasterEffects = useAudioStore((s) => s.setMasterEffects);
  const addMasterEffectConfig = useAudioStore((s) => s.addMasterEffectConfig);
  const user = useAuthStore((s) => s.user);

  // Reset search/filter when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setActiveTag(null);
    } else {
      // Focus search input when opened
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen]);

  // Filter presets by search query and active tag
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return groupedPresets.map(({ category, presets }) => ({
      category,
      presets: presets.filter(p => {
        if (activeTag && !p.tags.includes(activeTag)) return false;
        if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)
            && !p.tags.some(t => t.toLowerCase().includes(q))) return false;
        return true;
      }),
    })).filter(g => g.presets.length > 0);
  }, [searchQuery, activeTag]);

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

  // ── Active preset detection (driven by the live master FX chain) ────────
  // Derived rather than stored: the button must reflect whatever preset is
  // currently applied, regardless of how it got there — dropdown click,
  // MasterEffectsModal load, playlist restore on reload, cloud sync, etc.
  // A fingerprint compares effect type sequence + enabled flag + sorted
  // parameters (id/category ignored). First match wins: factory presets
  // are checked before user presets so a factory name isn't shadowed by a
  // user preset with identical effects.
  const activePresetName = useMemo(() => {
    if (masterEffects.length === 0) return null;

    const fingerprint = (effects: Array<{ type: string; enabled?: boolean; parameters?: Record<string, number | string> }>): string =>
      effects.map(fx => {
        const params = fx.parameters ?? {};
        const sortedParams = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join(',');
        return `${fx.type}|${fx.enabled !== false ? 1 : 0}|${sortedParams}`;
      }).join('~');

    const current = fingerprint(masterEffects);
    for (const p of FX_PRESETS) {
      if (fingerprint(p.effects) === current) return p.name;
    }
    for (const p of userPresets) {
      if (fingerprint(p.effects) === current) return p.name;
    }
    return null;
  }, [masterEffects, userPresets]);

  // ── Server sync helper (uses centralized cloudSync) ─────────────────────

  const syncToServer = useCallback((presets: UserMasterFxPreset[]) => {
    pushToCloud(SYNC_KEYS.MASTER_FX_PRESETS, presets).catch((err) => console.warn('FX preset cloud sync failed:', err));
  }, []);

  // ── Apply preset with beat-synced crossfade ──────────────────────────────

  // The DJMixerEngine handles crossfading internally (equal-power, ~2 beats).
  // Just apply the new effects — the engine does the rest.
  const applyPreset = useCallback(
    (newEffects: EffectConfig[], _presetName: string, gainCompensationDb?: number) => {
      // activePresetName is derived from masterEffects via fingerprint match,
      // so setting the effects is enough — the button updates itself.
      setMasterEffects(newEffects, gainCompensationDb);
      setIsOpen(false);
    },
    [setMasterEffects],
  );

  const applyFactoryPreset = useCallback(
    (preset: FxPreset) => {
      const effects: EffectConfig[] = preset.effects.map((fx, i) => ({
        ...fx,
        id: `master-fx-${Date.now()}-${i}`,
      }));
      applyPreset(effects, preset.name, preset.gainCompensationDb);
    },
    [applyPreset],
  );

  const applyUserPreset = useCallback(
    (preset: UserMasterFxPreset) => {
      const effects: EffectConfig[] = preset.effects.map((fx, i) => ({
        ...fx,
        id: `master-fx-${Date.now()}-${i}`,
      }));
      applyPreset(effects, preset.name, 0); // user presets have no measured compensation
    },
    [applyPreset],
  );

  const deleteUserPreset = useCallback(
    async (name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const updated = getUserPresets().filter((p) => p.name !== name);
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(updated));
      setUserPresets(updated);
      // Sync to server
      await syncToServer(updated);
    },
    [getUserPresets, syncToServer],
  );

  const clearPresets = useCallback(() => {
    setMasterEffects([], 0);
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
      // activePresetName auto-recomputes from the new masterEffects chain.
      // Don't close — let user add multiple effects
    },
    [addMasterEffectConfig],
  );

  // ── Click outside to close (checks both wrapper and portal menu) ─────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapperRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [isOpen]);

  // Compute portal position from the trigger button's bounding rect
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: Math.max(0, rect.right - 288), // 288 = w-72 (18rem)
      });
    }
  }, [isOpen]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div ref={wrapperRef} className="relative">
      {/* Trigger button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono border transition-all
          ${activePresetName
            ? 'border-green-600/60 bg-green-950/30 text-green-400'
            : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
          }`}
      >
        <span
          className="truncate max-w-[180px]"
          title={activePresetName ?? 'No preset — click to load FX presets'}
        >
          {activePresetName || 'FX Presets'}
        </span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu — rendered via portal so parent overflow:hidden can't clip it */}
      {isOpen && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="z-[99990] w-72 max-h-[70vh] overflow-hidden rounded-lg border border-dark-border bg-dark-bgSecondary shadow-xl flex flex-col"
        >
          {/* Search + Tag filter header (sticky) */}
          <div className="shrink-0 border-b border-dark-border bg-dark-bgSecondary">
            {/* Search bar */}
            <div className="relative px-2 pt-2 pb-1">
              <Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted/50 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search presets..."
                className="w-full pl-7 pr-7 py-1.5 text-xs font-mono rounded border border-dark-borderLight
                  bg-dark-bgTertiary text-text-primary placeholder:text-text-muted/40
                  focus:outline-none focus:border-accent-primary/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted/50 hover:text-text-primary"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Category tag pills — wrap rather than sideways-scroll so
                 all tags (esp. the dub sub-categories) are visible at once. */}
            <div className="px-2 pb-2 flex flex-wrap gap-1">
              <button
                onClick={() => setActiveTag(null)}
                className={`shrink-0 px-2 py-0.5 text-[10px] font-mono rounded-full border transition-colors
                  ${!activeTag
                    ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                    : 'border-dark-borderLight bg-dark-bgTertiary text-text-muted hover:text-text-primary hover:border-dark-borderLight'
                  }`}
              >
                All
              </button>
              {ALL_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={`shrink-0 px-2 py-0.5 text-[10px] font-mono rounded-full border transition-colors
                    ${activeTag === tag
                      ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                      : 'border-dark-borderLight bg-dark-bgTertiary text-text-muted hover:text-text-primary hover:border-dark-borderLight'
                    }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable preset list */}
          <div className="overflow-y-auto flex-1 min-h-0">
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

          {/* Factory presets by category (filtered) */}
          {filteredGroups.map(({ category, presets }) => (
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
                  <span>{preset.name}</span>
                  <span className="ml-1.5 text-[9px] text-text-muted/40">{preset.tags.slice(1).join(' · ')}</span>
                </button>
              ))}
            </div>
          ))}

          {/* Empty state */}
          {filteredGroups.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-text-muted/50 font-mono">
              No presets match{searchQuery ? ` "${searchQuery}"` : ''}{activeTag ? ` in ${activeTag}` : ''}
            </div>
          )}

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
          </div> {/* end scrollable area */}
        </div>,
        document.body,
      )}
    </div>
  );
};
