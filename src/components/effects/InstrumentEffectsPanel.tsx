/**
 * InstrumentEffectsPanel - Inline visual effects chain for the studio canvas view.
 *
 * Shows each effect as a visual pedal enclosure with knobs and oscilloscopes,
 * matching the style of the Master Effects modal. Supports add, remove, toggle,
 * wet/dry, and inline parameter editing.
 */

import React, { useState, useCallback, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
import type { EffectConfig, AudioEffectType as EffectType } from '@typedefs/instrument';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { Plus, X, Search } from 'lucide-react';
import { VisualEffectEditorWrapper, ENCLOSURE_COLORS, DEFAULT_ENCLOSURE } from './VisualEffectEditors';
import { getEffectsByGroup, type AvailableEffect } from '@constants/unifiedEffects';
import { GUITARML_MODEL_REGISTRY, getModelCharacteristicDefaults } from '@constants/guitarMLRegistry';
import { getDefaultEffectParameters } from '@engine/InstrumentFactory';

interface InstrumentEffectsPanelProps {
  instrumentId: number;
  instrumentName: string;
  effects: EffectConfig[];
  hideHeader?: boolean;
}

export interface InstrumentEffectsPanelHandle {
  toggleBrowser: () => void;
}

export const InstrumentEffectsPanel = forwardRef<InstrumentEffectsPanelHandle, InstrumentEffectsPanelProps>(({
  instrumentId,
  instrumentName,
  effects,
  hideHeader = false,
}, ref) => {
  const [showBrowser, setShowBrowser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Keep effects ref in sync to avoid stale closures in callbacks (critical for smooth knobs)
  const effectsRef = useRef(effects);
  useEffect(() => {
    effectsRef.current = effects;
  }, [effects]);

  useImperativeHandle(ref, () => ({
    toggleBrowser: () => setShowBrowser(prev => !prev),
  }), []);


  const addEffectConfig = useInstrumentStore((s) => s.addEffectConfig);
  const removeEffect = useInstrumentStore((s) => s.removeEffect);
  const updateEffect = useInstrumentStore((s) => s.updateEffect);

  const handleAddEffect = useCallback((availableEffect: AvailableEffect) => {
    const type = (availableEffect.type as EffectType) || 'Distortion';
    const params: Record<string, number | string> = { ...getDefaultEffectParameters(type) };

    if (availableEffect.category === 'neural' && availableEffect.neuralModelIndex !== undefined) {
      const model = GUITARML_MODEL_REGISTRY[availableEffect.neuralModelIndex];
      if (model?.parameters) {
        Object.entries(model.parameters).forEach(([key, param]) => {
          if (param) params[key] = param.default;
        });
        const charDefaults = getModelCharacteristicDefaults(
          model.characteristics.gain,
          model.characteristics.tone,
        );
        Object.assign(params, charDefaults);
      }
    }

    addEffectConfig(instrumentId, {
      category: availableEffect.category,
      type,
      enabled: true,
      wet: 100,
      parameters: params,
      neuralModelIndex: availableEffect.neuralModelIndex,
      neuralModelName: availableEffect.category === 'neural' ? availableEffect.label : undefined,
    });
    setShowBrowser(false);
    setSearchQuery('');
  }, [instrumentId, addEffectConfig]);

  const handleToggle = useCallback((effectId: string) => {
    const effect = effectsRef.current.find(fx => fx.id === effectId);
    if (effect) {
      updateEffect(instrumentId, effectId, { enabled: !effect.enabled });
    }
  }, [instrumentId, updateEffect]);

  const handleRemove = useCallback((effectId: string) => {
    removeEffect(instrumentId, effectId);
  }, [instrumentId, removeEffect]);

  const handleUpdateParameter = useCallback((effectId: string, key: string, value: number | string) => {
    const effect = effectsRef.current.find(fx => fx.id === effectId);
    if (effect) {
      updateEffect(instrumentId, effectId, {
        parameters: { ...effect.parameters, [key]: value },
      });
    }
  }, [instrumentId, updateEffect]);

  const handleUpdateWet = useCallback((effectId: string, wet: number) => {
    updateEffect(instrumentId, effectId, { wet });
  }, [instrumentId, updateEffect]);

  // Filter effects browser
  const effectsByGroup = getEffectsByGroup();
  const filteredEffectsByGroup = React.useMemo(() => {
    if (!searchQuery.trim()) return effectsByGroup;
    const q = searchQuery.toLowerCase();
    const filtered: Record<string, typeof effectsByGroup[string]> = {};
    for (const [group, groupEffects] of Object.entries(effectsByGroup)) {
      const matched = groupEffects.filter(e => e.label.toLowerCase().includes(q));
      if (matched.length > 0) filtered[group] = matched;
    }
    return filtered;
  }, [effectsByGroup, searchQuery]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-dark-bg">
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between px-3 py-2 bg-dark-bgSecondary border-b border-dark-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono text-text-muted truncate">{instrumentName}</span>
            <span className="text-[10px] text-text-muted px-1.5 py-0.5 bg-dark-bg rounded">
              {effects.length} FX
            </span>
          </div>
          <button
            onClick={() => setShowBrowser(!showBrowser)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase rounded
                     bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors"
          >
            <Plus size={11} />
            Add
          </button>
        </div>
      )}

      {/* Effect Browser (collapsible) */}
      {showBrowser && (
        <div className="border-b border-dark-border bg-dark-bgTertiary shrink-0 max-h-[300px] overflow-y-auto scrollbar-modern">
          <div className="p-2">
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search effects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-7 py-1.5 text-xs bg-dark-bg border border-dark-border rounded text-text-primary
                         placeholder-text-muted focus:outline-none focus:border-accent-primary transition-colors"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {Object.entries(filteredEffectsByGroup).map(([group, groupEffects]) => (
              <div key={group} className="mb-2">
                <div className="text-[9px] text-text-muted font-bold uppercase tracking-wider mb-1 px-1">{group}</div>
                <div className="flex flex-wrap gap-1">
                  {groupEffects.map((effect) => {
                    const enc = ENCLOSURE_COLORS[effect.type ?? ''] || DEFAULT_ENCLOSURE;
                    return (
                      <button
                        key={effect.label}
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

      {/* Effects Chain — visual pedal enclosures */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-modern p-3 space-y-3">
        {effects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="text-xs mb-2">No effects on this instrument</div>
            <button
              onClick={() => setShowBrowser(true)}
              className="px-3 py-1.5 text-xs rounded border border-dashed border-dark-border
                       hover:border-accent-primary hover:text-accent-primary transition-colors"
            >
              + Add Effect
            </button>
          </div>
        ) : (
          effects.map((effect) => {
            return (
              <div key={effect.id} className="relative group">
                {/* Remove button (top-right corner, visible on hover) */}
                <button
                  onClick={() => handleRemove(effect.id)}
                  className="absolute top-2 right-2 z-10 p-1 rounded-lg opacity-0 group-hover:opacity-100
                           transition-opacity hover:bg-white/10"
                  style={{ color: '#ff5050' }}
                  title="Remove effect"
                >
                  <X size={14} />
                </button>

                {/* Toggle button (top-right, next to remove) */}
                <button
                  onClick={() => handleToggle(effect.id)}
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

                {/* Visual Effect Editor (full pedal enclosure with knobs) */}
                <div style={{ opacity: effect.enabled ? 1 : 0.45, transition: 'opacity 0.2s' }}>
                  <VisualEffectEditorWrapper
                    effect={effect}
                    onUpdateParameter={(key, value) => handleUpdateParameter(effect.id, key, value)}
                    onUpdateWet={(wet) => handleUpdateWet(effect.id, wet)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
InstrumentEffectsPanel.displayName = 'InstrumentEffectsPanel';
