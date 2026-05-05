/**
 * MasterEffectsPanel - Global effects chain that processes all audio output
 * Connects to useAudioStore for master effects management
 */

import React, { useState, useCallback, useImperativeHandle, forwardRef, useRef, useEffect, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EffectConfig, AudioEffectType as EffectType } from '../../types/instrument';
import { useAudioStore } from '@stores/useAudioStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useFormatStore } from '@stores/useFormatStore';
import { supportsChannelIsolation } from '@engine/tone/ChannelRoutedEffects';
import { Settings, Volume2, X, ChevronDown, Save } from 'lucide-react';
import { MASTER_FX_PRESETS, type MasterFxPreset } from '@constants/fxPresets';
import { AVAILABLE_EFFECTS, type AvailableEffect } from '@constants/unifiedEffects';
import { GUITARML_MODEL_REGISTRY } from '@constants/guitarMLRegistry';
import { getDefaultEffectParameters } from '@engine/InstrumentFactory';
import { getDefaultEffectWet } from '@engine/factories/EffectFactory';
import { effectiveBassLock } from '@engine/dj/bassLockDefaults';
import { VisualEffectEditorWrapper, ENCLOSURE_COLORS, DEFAULT_ENCLOSURE } from './VisualEffectEditors';

interface SortableVisualEffectProps {
  effect: EffectConfig;
  onToggle: () => void;
  onBassLockToggle: () => void;
  onRemove: () => void;
  onUpdateParameter: (key: string, value: number | string) => void;
  onUpdateParameters?: (params: Record<string, number | string>) => void;
  onWetChange: (wet: number) => void;
  onChannelSelect: (channels: number[] | undefined) => void;
  numChannels: number;
  /** Whether the current format supports per-channel isolation */
  isolationSupported: boolean;
}

function SortableVisualEffect({ effect, onToggle, onBassLockToggle, onRemove, onUpdateParameter, onUpdateParameters, onWetChange, onChannelSelect, numChannels, isolationSupported }: SortableVisualEffectProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: effect.id,
  });
  const selected = effect.selectedChannels;
  const hasSelection = Array.isArray(selected);

  const toggleChannel = (ch: number) => {
    const current = new Set(selected ?? []);
    if (current.has(ch)) {
      current.delete(ch);
      onChannelSelect(current.size > 0 ? Array.from(current).sort((a, b) => a - b) : undefined);
    } else {
      current.add(ch);
      onChannelSelect(Array.from(current).sort((a, b) => a - b));
    }
  };

  const selectAll = () => {
    onChannelSelect(undefined); // undefined = all channels
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group mb-3 ${isDragging ? 'ring-2 ring-accent-primary rounded-xl' : ''}`}
    >
      {/* Drag handle bar */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center h-4 cursor-grab active:cursor-grabbing rounded-t-lg"
        style={{ background: 'rgba(255,255,255,0.03)' }}
        title="Drag to reorder"
      >
        <div className="w-8 h-0.5 rounded bg-white/10" />
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 z-10 p-1 rounded-lg opacity-0 group-hover:opacity-100
                 transition-opacity hover:bg-white/10"
        style={{ color: '#ff5050' }}
        title="Remove effect"
      >
        <X size={14} />
      </button>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute top-2 right-10 z-10 p-1 rounded-lg opacity-0 group-hover:opacity-100
                 transition-opacity hover:bg-white/10"
        style={{ color: effect.enabled ? '#10b981' : 'rgba(255,255,255,0.2)' }}
        title={effect.enabled ? 'Disable' : 'Enable'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
          <line x1="12" y1="2" x2="12" y2="12" />
        </svg>
      </button>

      {/* Bass-lock toggle — 150 Hz crossover protects the bassline from
          being smeared by reverb / delay / phaser. Visible on hover. */}
      <button
        onClick={onBassLockToggle}
        className="absolute top-2 right-[72px] z-10 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold opacity-0 group-hover:opacity-100
                 transition-opacity hover:bg-white/10"
        style={{
          color: effectiveBassLock(effect.type, effect.bassLock) ? '#f59e0b' : 'rgba(255,255,255,0.25)',
          border: '1px solid currentColor',
          lineHeight: 1,
        }}
        title={
          effectiveBassLock(effect.type, effect.bassLock)
            ? 'Bass-Lock ON — low end bypasses this effect (150 Hz crossover)'
            : 'Bass-Lock OFF — effect processes full spectrum'
        }
      >
        BL
      </button>

      {/* Visual pedal enclosure */}
      <div style={{ opacity: effect.enabled ? 1 : 0.45, transition: 'opacity 0.2s' }}>
        <VisualEffectEditorWrapper
          effect={effect}
          onUpdateParameter={onUpdateParameter}
          onUpdateParameters={onUpdateParameters}
          onUpdateWet={onWetChange}
        />
      </div>

      {/* Channel routing selector — only for formats with multi-output isolation */}
      {isolationSupported && <div className="mx-2 mb-2 mt-1 p-1.5 rounded-lg bg-dark-bg/60 border border-dark-border/40">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Route</span>
          <button
            onClick={selectAll}
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-colors ${
              !hasSelection
                ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/40'
                : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-transparent'
            }`}
          >
            ALL
          </button>
          <span className="text-[9px] text-text-muted/60 ml-auto">
            {hasSelection && selected!.length === 0
              ? 'No channels'
              : hasSelection
                ? `${selected!.length}/${numChannels} ch`
                : 'All channels'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {Array.from({ length: numChannels }, (_, i) => {
            const isSelected = !hasSelection || (selected?.includes(i) ?? false);
            return (
              <button
                key={i}
                onClick={() => toggleChannel(i)}
                className={`w-5 h-5 text-[9px] font-bold rounded transition-colors ${
                  isSelected && hasSelection
                    ? 'bg-accent-primary/30 text-accent-primary border border-accent-primary/50'
                    : isSelected
                      ? 'bg-dark-bgTertiary text-text-secondary border border-dark-border'
                      : 'bg-dark-bg text-text-muted/30 border border-dark-border/50'
                }`}
                title={`Channel ${i + 1}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>}
    </div>
  );
}

interface MasterEffectsPanelProps {
  hideHeader?: boolean;
}

export interface MasterEffectsPanelHandle {
  toggleAddMenu: () => void;
  togglePresetMenu: () => void;
}

// User preset storage key
const USER_MASTER_FX_PRESETS_KEY = 'master-fx-user-presets';

interface UserMasterFxPreset {
  name: string;
  effects: EffectConfig[];
}

export const MasterEffectsPanel = forwardRef<MasterEffectsPanelHandle, MasterEffectsPanelProps>(({ hideHeader = false }, ref) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');

  useImperativeHandle(ref, () => ({
    toggleAddMenu: () => setShowAddMenu(prev => !prev),
    togglePresetMenu: () => setShowPresetMenu(prev => !prev),
  }), []);

  const masterEffects = useAudioStore((s) => s.masterEffects);
  const addMasterEffectConfig = useAudioStore((s) => s.addMasterEffectConfig);
  const removeMasterEffect = useAudioStore((s) => s.removeMasterEffect);
  const updateMasterEffect = useAudioStore((s) => s.updateMasterEffect);
  const reorderMasterEffects = useAudioStore((s) => s.reorderMasterEffects);
  const setMasterEffects = useAudioStore((s) => s.setMasterEffects);

  // Channel count for channel selection UI
  const numChannels = useTrackerStore(s => s.patterns[s.currentPatternIndex]?.channels?.length ?? 16);

  // Per-channel isolation only available for multi-output worklet engines
  const editorMode = useFormatStore(s => s.editorMode);
  const isolationSupported = supportsChannelIsolation(editorMode);

  // Keep masterEffects ref in sync to avoid stale closures (critical for smooth knobs)
  const masterEffectsRef = useRef(masterEffects);
  useEffect(() => {
    masterEffectsRef.current = masterEffects;
  }, [masterEffects]);

  // ── Smooth knob support ──────────────────────────────────────────────────
  // Send audio param changes directly to ToneEngine (immediate, no Immer overhead).
  // Throttle Zustand store writes to ~60 fps so React doesn't choke on rapid knob turns.
  const pendingStoreUpdates = useRef<Map<string, { effectId: string; params: Record<string, number | string>; wet?: number }>>(new Map());
  const storeFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const STORE_THROTTLE_MS = 16; // ~60 fps

  const flushStoreUpdates = useCallback(() => {
    storeFlushTimer.current = null;
    const updates = pendingStoreUpdates.current;
    if (updates.size === 0) return;
    const batch = new Map(updates);
    updates.clear();
    batch.forEach(({ effectId, params, wet }) => {
      const effect = masterEffectsRef.current.find(fx => fx.id === effectId);
      if (!effect) return;
      const u: Partial<EffectConfig> = {};
      if (Object.keys(params).length > 0) u.parameters = { ...effect.parameters, ...params };
      if (wet !== undefined) u.wet = wet;
      if (Object.keys(u).length > 0) updateMasterEffect(effectId, u);
    });
  }, [updateMasterEffect]);

  const scheduleStoreFlush = useCallback(() => {
    if (!storeFlushTimer.current) {
      storeFlushTimer.current = setTimeout(flushStoreUpdates, STORE_THROTTLE_MS);
    }
  }, [flushStoreUpdates]);

  // Get user presets from localStorage with validation
  const getUserPresets = useCallback((): UserMasterFxPreset[] => {
    try {
      const stored = localStorage.getItem(USER_MASTER_FX_PRESETS_KEY);
      if (!stored) return [];

      const parsed = JSON.parse(stored);
      // Validate structure: must be array of objects with name and effects
      if (!Array.isArray(parsed)) return [];

      return parsed.filter(
        (p): p is UserMasterFxPreset =>
          p !== null &&
          typeof p === 'object' &&
          typeof p.name === 'string' &&
          Array.isArray(p.effects)
      );
    } catch {
      return [];
    }
  }, []);

  // Sync user presets to server (uses centralized cloudSync)
  const syncPresetsToServer = useCallback((presets: UserMasterFxPreset[]) => {
    import('@/lib/cloudSync').then(({ pushToCloud }) => {
      import('@/hooks/useCloudSync').then(({ SYNC_KEYS }) => {
        pushToCloud(SYNC_KEYS.MASTER_FX_PRESETS, presets).catch((err) => console.warn('FX preset cloud sync failed:', err));
      });
    });
  }, []);

  // Save current settings as user preset
  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;

    const userPresets = getUserPresets();
    userPresets.push({
      name: presetName.trim(),
      effects: masterEffects.map(fx => ({ ...fx })), // Clone the effects
    });
    localStorage.setItem(USER_MASTER_FX_PRESETS_KEY, JSON.stringify(userPresets));
    syncPresetsToServer(userPresets);

    setPresetName('');
    setShowSaveDialog(false);
  }, [presetName, masterEffects, getUserPresets, syncPresetsToServer]);

  // Load a factory preset
  const handleLoadPreset = useCallback((preset: MasterFxPreset) => {
    const effects: EffectConfig[] = preset.effects.map((fx, index) => ({
      ...fx,
      id: `master-fx-${Date.now()}-${index}`,
    }));
    setMasterEffects(effects, preset.gainCompensationDb);
    setShowPresetMenu(false);
  }, [setMasterEffects]);

  // Load user preset
  const handleLoadUserPreset = useCallback((preset: UserMasterFxPreset) => {
    const effects: EffectConfig[] = preset.effects.map((fx, index) => ({
      ...fx,
      id: `master-fx-${Date.now()}-${index}`,
    }));
    setMasterEffects(effects, 0);
    setShowPresetMenu(false);
  }, [setMasterEffects]);

  // Clear all effects
  const handleClearEffects = useCallback(() => {
    setMasterEffects([], 0);
    setShowPresetMenu(false);
  }, [setMasterEffects]);

  // Delete user preset
  const handleDeleteUserPreset = useCallback((name: string) => {
    const userPresets = getUserPresets().filter(p => p.name !== name);
    localStorage.setItem(USER_MASTER_FX_PRESETS_KEY, JSON.stringify(userPresets));
    syncPresetsToServer(userPresets);
  }, [getUserPresets, syncPresetsToServer]);

  const userPresets = getUserPresets();

  // Derive activePresetName from the current effects chain via fingerprinting
  // (survives reloads, manual edits, cloud sync — matches DJFxQuickPresets pattern)
  const activePresetName = useMemo(() => {
    if (masterEffects.length === 0) return null;
    const fingerprint = (effects: Array<{ type: string; enabled?: boolean; parameters?: Record<string, number | string> }>): string =>
      effects.map(fx => {
        const params = fx.parameters ?? {};
        const sortedParams = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join(',');
        return `${fx.type}|${fx.enabled !== false ? 1 : 0}|${sortedParams}`;
      }).join('~');
    const current = fingerprint(masterEffects);
    for (const p of MASTER_FX_PRESETS) {
      if (fingerprint(p.effects) === current) return p.name;
    }
    for (const p of userPresets) {
      if (fingerprint(p.effects) === current) return p.name;
    }
    return null;
  }, [masterEffects, userPresets]);

  // Group factory presets by category, sorted alphabetically
  const presetsByCategory = MASTER_FX_PRESETS.reduce((acc, preset) => {
    if (!acc[preset.category]) {
      acc[preset.category] = [];
    }
    acc[preset.category].push(preset);
    return acc;
  }, {} as Record<string, MasterFxPreset[]>);
  const sortedCategories = Object.keys(presetsByCategory).sort();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = masterEffects.findIndex((fx) => fx.id === active.id);
      const newIndex = masterEffects.findIndex((fx) => fx.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderMasterEffects(oldIndex, newIndex);
      }
    }
  };

  const handleAddEffect = (availableEffect: AvailableEffect) => {
    const type = (availableEffect.type as EffectType) || 'Distortion';
    const params: Record<string, number | string> = { ...getDefaultEffectParameters(type) };

    if (availableEffect.category === 'neural' && availableEffect.neuralModelIndex !== undefined) {
      const model = GUITARML_MODEL_REGISTRY[availableEffect.neuralModelIndex];
      if (model?.parameters) {
        Object.entries(model.parameters).forEach(([key, param]) => {
          if (param) params[key] = param.default;
        });
      }
    }

    const defaultWet = getDefaultEffectWet(type);

    addMasterEffectConfig({
      category: availableEffect.category,
      type,
      enabled: true,
      wet: defaultWet,
      parameters: params,
      neuralModelIndex: availableEffect.neuralModelIndex,
      neuralModelName: availableEffect.category === 'neural' ? availableEffect.label : undefined,
    });
    setShowAddMenu(false);
  };

  const handleToggle = useCallback((effectId: string) => {
    const effect = masterEffectsRef.current.find((fx) => fx.id === effectId);
    if (effect) {
      updateMasterEffect(effectId, { enabled: !effect.enabled });
    }
  }, [updateMasterEffect]);

  const handleBassLockToggle = useCallback((effectId: string) => {
    const effect = masterEffectsRef.current.find((fx) => fx.id === effectId);
    if (effect) {
      // First click flips to explicit opposite of current effective state;
      // after that each click toggles. undefined → use per-type default.
      const current = effectiveBassLock(effect.type, effect.bassLock);
      updateMasterEffect(effectId, { bassLock: !current });
    }
  }, [updateMasterEffect]);

  const handleRemove = useCallback((effectId: string) => {
    removeMasterEffect(effectId);
  }, [removeMasterEffect]);

  const handleWetChange = useCallback((effectId: string, wet: number) => {
    // Immediate audio update — bypass Immer for responsiveness
    const engine = useAudioStore.getState().toneEngineInstance;
    const effect = masterEffectsRef.current.find(fx => fx.id === effectId);
    if (engine && effect) {
      engine.updateMasterEffectParams(effectId, { ...effect, wet } as EffectConfig);
    }
    // Throttled store persistence
    const pending = pendingStoreUpdates.current.get(effectId) ?? { effectId, params: {} };
    pending.wet = wet;
    pendingStoreUpdates.current.set(effectId, pending);
    scheduleStoreFlush();
  }, [scheduleStoreFlush]);

  const handleUpdateParameter = useCallback((effectId: string, key: string, value: number | string) => {
    // Immediate audio update — bypass Immer for responsiveness
    const engine = useAudioStore.getState().toneEngineInstance;
    const effect = masterEffectsRef.current.find(fx => fx.id === effectId);
    if (engine && effect) {
      const updatedConfig = { ...effect, parameters: { ...effect.parameters, [key]: value } } as EffectConfig;
      engine.updateMasterEffectParams(effectId, updatedConfig);
    }
    // Throttled store persistence
    const pending = pendingStoreUpdates.current.get(effectId) ?? { effectId, params: {} };
    pending.params[key] = value;
    pendingStoreUpdates.current.set(effectId, pending);
    scheduleStoreFlush();
  }, [scheduleStoreFlush]);

  const handleUpdateParameters = useCallback((effectId: string, params: Record<string, number | string>) => {
    // Immediate audio update — bypass Immer for responsiveness
    const engine = useAudioStore.getState().toneEngineInstance;
    const effect = masterEffectsRef.current.find(fx => fx.id === effectId);
    if (engine && effect) {
      const updatedConfig = { ...effect, parameters: { ...effect.parameters, ...params } } as EffectConfig;
      engine.updateMasterEffectParams(effectId, updatedConfig);
    }
    // Throttled store persistence
    const pending = pendingStoreUpdates.current.get(effectId) ?? { effectId, params: {} };
    Object.assign(pending.params, params);
    pendingStoreUpdates.current.set(effectId, pending);
    scheduleStoreFlush();
  }, [scheduleStoreFlush]);

  const handleChannelSelect = useCallback((effectId: string, channels: number[] | undefined) => {
    updateMasterEffect(effectId, { selectedChannels: channels });
  }, [updateMasterEffect]);

  // Group effects by group for the add menu
  const effectsByCategory = AVAILABLE_EFFECTS.reduce((acc, effect) => {
    if (!acc[effect.group]) acc[effect.group] = [];
    acc[effect.group].push(effect);
    return acc;
  }, {} as Record<string, AvailableEffect[]>);

  return (
    <div className={hideHeader ? "bg-dark-bg overflow-visible relative" : "bg-dark-bg border border-dark-border rounded-lg overflow-hidden"}>
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 bg-dark-bgSecondary border-b border-dark-border">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-accent-primary" />
            <span className="font-medium text-sm text-text-primary">Master Effects</span>
            <span className="text-xs text-text-muted px-2 py-0.5 bg-dark-bg rounded">
              {masterEffects.length} FX
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Presets Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowPresetMenu(!showPresetMenu)}
                className={`px-3 py-1 text-xs font-medium rounded flex items-center gap-1 border transition-colors truncate max-w-[180px]
                  ${activePresetName
                    ? 'border-accent-success/60 bg-accent-success/10 text-accent-success'
                    : 'bg-dark-bg text-text-primary hover:bg-dark-bgHover border-dark-border'
                  }`}
              >
                <span className="truncate">{activePresetName || 'Presets'}</span> <ChevronDown size={12} className="shrink-0" />
              </button>
            </div>

            {/* Save Preset Button */}
            <button
              onClick={() => setShowSaveDialog(true)}
              className="p-1.5 rounded text-text-muted hover:text-accent-primary hover:bg-dark-bgHover transition-colors"
              title="Save current effects as preset"
            >
              <Save size={14} />
            </button>

            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="px-3 py-1 text-xs font-medium rounded bg-accent-primary/10 text-accent-primary
                       hover:bg-accent-primary/20 transition-colors"
            >
              + Add Effect
            </button>
          </div>
        </div>
      )}

      {/* Preset dropdown — rendered outside header so it works in both modes */}
      {showPresetMenu && (
        <div className="absolute right-0 top-0 mt-1 w-56 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-[99990] max-h-[70vh] overflow-y-auto"
          style={hideHeader ? { top: 0, right: 8 } : { top: '100%', right: 16 }}>
          {/* None / Clear */}
          <button
            onClick={handleClearEffects}
            className="w-full px-3 py-2 text-left text-xs font-mono text-text-muted hover:bg-dark-bgHover hover:text-text-primary border-b border-dark-border transition-colors"
          >
            None (clear all)
          </button>
          {/* User Presets */}
          {userPresets.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary">
                User Presets
              </div>
              {userPresets.map((preset) => (
                <div
                  key={preset.name}
                  className="flex items-center justify-between px-3 py-2 hover:bg-dark-bgHover cursor-pointer group"
                >
                  <span
                    onClick={() => handleLoadUserPreset(preset)}
                    className="text-sm text-text-primary flex-1"
                  >
                    {preset.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteUserPreset(preset.name);
                    }}
                    className="text-text-muted hover:text-accent-error opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete preset"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <div className="border-t border-dark-border my-1" />
            </>
          )}

          {/* Factory Presets by Category */}
          {sortedCategories.map((category) => (
            <div key={category}>
              <div className="px-3 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary">
                {category}
              </div>
              {[...presetsByCategory[category]].sort((a, b) => a.name.localeCompare(b.name)).map((preset) => (
                <div
                  key={preset.name}
                  onClick={() => handleLoadPreset(preset)}
                  className="px-3 py-2 hover:bg-dark-bgHover cursor-pointer"
                >
                  <div className="text-sm text-text-primary">{preset.name}</div>
                  <div className="text-xs text-text-muted">{preset.description}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Save Preset Dialog */}
      {showSaveDialog && (
        <div className="px-4 py-3 bg-dark-bgTertiary border-b border-dark-border">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Preset name..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePreset();
                if (e.key === 'Escape') setShowSaveDialog(false);
              }}
              maxLength={64}
              className="flex-1 px-3 py-1.5 text-sm bg-dark-bg border border-dark-border rounded text-text-primary
                       placeholder-text-muted focus:outline-none focus:border-accent-primary"
              autoFocus
            />
            <button
              onClick={handleSavePreset}
              className="px-3 py-1.5 text-xs font-medium rounded bg-accent-primary text-text-primary hover:bg-accent-primaryHover transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setShowSaveDialog(false)}
              className="px-3 py-1.5 text-xs font-medium rounded bg-dark-bg text-text-muted hover:text-text-primary border border-dark-border hover:border-dark-borderLight transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Effect Menu */}
      {showAddMenu && (
        <div className="p-4 bg-dark-bgTertiary border-b border-dark-border">
          <div className="text-xs text-text-muted mb-3 font-medium">Select Effect Type:</div>
          <div className="space-y-3">
            {Object.entries(effectsByCategory).map(([category, effects]) => (
              <div key={category}>
                <div className="text-xs text-text-muted mb-1.5 uppercase tracking-wide">{category}</div>
                <div className="flex flex-wrap gap-1">
                  {effects.map((effect) => {
                    const enc = ENCLOSURE_COLORS[effect.type ?? ''] || DEFAULT_ENCLOSURE;
                    return (
                      <button
                        key={effect.neuralModelIndex != null ? `neural-${effect.neuralModelIndex}` : effect.type}
                        onClick={() => handleAddEffect(effect)}
                        className="px-2 py-1 text-[10px] rounded border transition-colors hover:text-text-primary"
                        style={{
                          borderColor: enc.border,
                          background: enc.bg,
                          color: enc.accent,
                        }}
                      >
                        {effect.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signal Flow */}
      <div className="px-4 py-2 bg-dark-bgSecondary border-b border-dark-border">
        <div className="flex items-center gap-2 text-xs font-mono text-text-muted overflow-x-auto">
          <span className="text-accent-primary font-bold whitespace-nowrap">INPUT</span>
          <span>→</span>
          {masterEffects.length > 0 ? (
            masterEffects.map((fx, idx) => (
              <React.Fragment key={fx.id}>
                <span className={`whitespace-nowrap ${fx.enabled ? 'text-accent-success' : 'text-accent-error'}`}>
                  {fx.type}
                </span>
                {idx < masterEffects.length - 1 && <span>→</span>}
              </React.Fragment>
            ))
          ) : (
            <span className="italic text-text-muted">direct</span>
          )}
          <span>→</span>
          <span className="text-accent-primary font-bold whitespace-nowrap flex items-center gap-1">
            <Volume2 size={12} /> OUTPUT
          </span>
        </div>
      </div>

      {/* Effects Chain — visual pedal enclosures */}
      <div className="p-3">
        {masterEffects.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm border border-dashed border-dark-border rounded-lg">
            No master effects. All audio passes through unchanged.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={masterEffects.map((fx) => fx.id)} strategy={verticalListSortingStrategy}>
              {masterEffects.map((effect) => (
                <SortableVisualEffect
                  key={effect.id}
                  effect={effect}
                  onToggle={() => handleToggle(effect.id)}
                  onBassLockToggle={() => handleBassLockToggle(effect.id)}
                  onRemove={() => handleRemove(effect.id)}
                  onUpdateParameter={(key, value) => handleUpdateParameter(effect.id, key, value)}
                  onUpdateParameters={(params) => handleUpdateParameters(effect.id, params)}
                  onWetChange={(wet) => handleWetChange(effect.id, wet)}
                  onChannelSelect={(channels) => handleChannelSelect(effect.id, channels)}
                  numChannels={numChannels}
                  isolationSupported={isolationSupported}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
});
MasterEffectsPanel.displayName = 'MasterEffectsPanel';
