/**
 * ChannelInsertEffectsModal — Add/edit/remove per-channel insert effects.
 *
 * Left column: effect chain list + add button.
 * Right column: effect parameter editor or effect browser.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMixerStore } from '@stores/useMixerStore';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { EffectParameterEditor } from './EffectParameterEditor';
import { AVAILABLE_EFFECTS, getEffectsByGroup, type AvailableEffect } from '@constants/unifiedEffects';
import { getDefaultEffectParameters } from '@engine/InstrumentFactory';
import { CHANNEL_FX_PRESETS, getPresetsByTag, type ChannelFxPreset, type FxPreset, type FxTag } from '@constants/fxPresets';
import type { EffectConfig, AudioEffectType as EffectType } from '@typedefs/instrument';
import { ChevronDown } from 'lucide-react';

const MAX_INSERT_EFFECTS = 4;

// Preset filter tags surfaced in the channel-insert picker. The `Dub`
// family is first-class here since per-channel dub sends are one of the
// common use-cases (bass channel → no reverb; lead channel → plate).
const PRESET_FILTER_TAGS: FxTag[] = [
  'Dub', 'Dub Echo', 'Dub Reverb', 'Dub Filter', 'Dub Mod',
  'Reverb', 'Delay', 'Modulation', 'Creative', 'Space', 'Lo-Fi',
];

interface ChannelInsertEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelIndex: number;
}

export const ChannelInsertEffectsModal: React.FC<ChannelInsertEffectsModalProps> = ({
  isOpen,
  onClose,
  channelIndex,
}) => {
  const insertEffects = useMixerStore(s => s.channels[channelIndex]?.insertEffects ?? []);
  const addChannelInsertEffect = useMixerStore(s => s.addChannelInsertEffect);
  const removeChannelInsertEffect = useMixerStore(s => s.removeChannelInsertEffect);
  const updateChannelInsertEffect = useMixerStore(s => s.updateChannelInsertEffect);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showBrowser, setShowBrowser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [presetTagFilter, setPresetTagFilter] = useState<FxTag | null>(null);
  // Close preset menu on outside click.
  const presetMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showPresetMenu) return;
    const onDown = (e: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setShowPresetMenu(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showPresetMenu]);

  const effectsRef = useRef(insertEffects);
  useEffect(() => { effectsRef.current = insertEffects; }, [insertEffects]);

  useModalClose({ isOpen, onClose, enableEnter: false });

  useEffect(() => {
    if (selectedIndex >= insertEffects.length && insertEffects.length > 0) {
      setSelectedIndex(insertEffects.length - 1);
    }
  }, [insertEffects.length, selectedIndex]);

  const selectedEffect: EffectConfig | undefined = insertEffects[selectedIndex];

  const handleUpdateParameter = useCallback((key: string, value: number | string) => {
    const effects = effectsRef.current;
    const fx = effects[selectedIndex];
    if (!fx) return;
    updateChannelInsertEffect(channelIndex, selectedIndex, {
      parameters: { ...fx.parameters, [key]: value },
    });
  }, [channelIndex, selectedIndex, updateChannelInsertEffect]);

  const handleWetChange = useCallback((wet: number) => {
    updateChannelInsertEffect(channelIndex, selectedIndex, { wet });
  }, [channelIndex, selectedIndex, updateChannelInsertEffect]);

  const handleToggle = useCallback((index: number) => {
    const effects = effectsRef.current;
    const fx = effects[index];
    if (!fx) return;
    updateChannelInsertEffect(channelIndex, index, { enabled: !fx.enabled });
  }, [channelIndex, updateChannelInsertEffect]);

  const handleRemove = useCallback((index: number) => {
    removeChannelInsertEffect(channelIndex, index);
    if (selectedIndex >= insertEffects.length - 1) {
      setSelectedIndex(Math.max(0, insertEffects.length - 2));
    }
  }, [channelIndex, selectedIndex, insertEffects.length, removeChannelInsertEffect]);

  const handleAddEffect = useCallback((available: AvailableEffect) => {
    if (insertEffects.length >= MAX_INSERT_EFFECTS) return;
    const type = (available.type as EffectType) || 'Distortion';
    const params: Record<string, number | string> = { ...getDefaultEffectParameters(type) };
    addChannelInsertEffect(channelIndex, {
      category: available.category,
      type,
      enabled: true,
      wet: 100,
      parameters: params,
    } as EffectConfig);
    setShowBrowser(false);
    setSelectedIndex(insertEffects.length); // select the newly added effect
  }, [channelIndex, insertEffects.length, addChannelInsertEffect]);

  const removeChannelInsertEffectFn = useMixerStore(s => s.removeChannelInsertEffect);
  const handleLoadPreset = useCallback((preset: FxPreset | ChannelFxPreset) => {
    // Clear existing inserts, then apply preset (capped at the per-channel limit).
    const current = effectsRef.current;
    for (let i = current.length - 1; i >= 0; i--) {
      removeChannelInsertEffectFn(channelIndex, i);
    }
    const slice = preset.effects.slice(0, MAX_INSERT_EFFECTS);
    for (const fx of slice) {
      addChannelInsertEffect(channelIndex, {
        ...fx,
        id: `channel-fx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      } as EffectConfig);
    }
    setShowPresetMenu(false);
    setShowBrowser(false);
    setSelectedIndex(0);
  }, [channelIndex, addChannelInsertEffect, removeChannelInsertEffectFn]);

  // Filter preset list by tag + by the effects being available (no neural
  // models sneaking into the channel insert bus).
  const presetsForMenu = presetTagFilter
    ? getPresetsByTag(presetTagFilter)
    : CHANNEL_FX_PRESETS;

  // Filter available effects by search
  const groupedEffects = getEffectsByGroup();
  const filteredGroups: Record<string, AvailableEffect[]> = {};
  const query = searchQuery.toLowerCase();
  for (const [group, effects] of Object.entries(groupedEffects)) {
    const filtered = query
      ? effects.filter(e => e.label.toLowerCase().includes(query) || (e.type ?? '').toLowerCase().includes(query))
      : effects;
    if (filtered.length > 0) filteredGroups[group] = filtered;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-primary border border-border-primary rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary">
          <span className="text-sm font-medium text-text-primary">
            Channel {channelIndex + 1} — Insert Effects
          </span>
          <div className="flex items-center gap-2">
            {/* Preset selector — surfaces the same FX_PRESETS that Master /
                Instrument panels use, so a "Dub Chamber" chain or a new
                MadProfessor/Dattorro preset can land on any channel in one
                click. Capped at MAX_INSERT_EFFECTS effects (4 today). */}
            <div className="relative" ref={presetMenuRef}>
              <button
                onClick={() => setShowPresetMenu(v => !v)}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded border border-border-primary text-text-muted hover:text-text-primary hover:border-accent-primary/40 transition-colors"
                title="Load a factory preset chain to this channel"
              >
                Presets <ChevronDown size={12} />
              </button>
              {showPresetMenu && (
                <div className="absolute right-0 top-[120%] z-20 w-72 max-h-[60vh] overflow-y-auto bg-surface-primary border border-border-primary rounded shadow-2xl">
                  <div className="flex flex-wrap gap-1 p-2 border-b border-border-primary">
                    <button
                      onClick={() => setPresetTagFilter(null)}
                      className={`px-1.5 py-0.5 text-[9px] font-mono rounded border ${
                        presetTagFilter === null
                          ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40'
                          : 'text-text-muted border-border-primary hover:text-text-primary'
                      }`}
                    >
                      ALL
                    </button>
                    {PRESET_FILTER_TAGS.map(tag => (
                      <button
                        key={tag}
                        onClick={() => setPresetTagFilter(tag)}
                        className={`px-1.5 py-0.5 text-[9px] font-mono rounded border ${
                          presetTagFilter === tag
                            ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40'
                            : 'text-text-muted border-border-primary hover:text-text-primary'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <div className="py-1">
                    {presetsForMenu.map(preset => (
                      <button
                        key={preset.name}
                        onClick={() => handleLoadPreset(preset)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-surface-secondary transition-colors"
                        title={preset.description}
                      >
                        <div className="font-medium text-text-primary">{preset.name}</div>
                        <div className="text-[10px] text-text-muted truncate">{preset.description}</div>
                      </button>
                    ))}
                    {presetsForMenu.length === 0 && (
                      <div className="px-3 py-4 text-center text-text-muted text-[11px]">
                        No presets with this tag.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <span className="text-[10px] text-text-muted">
              {insertEffects.length}/{MAX_INSERT_EFFECTS}
            </span>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">
              ✕
            </button>
          </div>
        </div>

        {/* Body — two columns */}
        <div className="flex" style={{ height: '60vh' }}>
          {/* Left column: effect chain + add button */}
          <div className="w-[200px] border-r border-border-primary flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {insertEffects.map((fx, i) => (
                <button
                  key={fx.id ?? `fx-${i}`}
                  onClick={() => { setSelectedIndex(i); setShowBrowser(false); }}
                  className={`w-full text-left px-3 py-2 border-b border-border-primary transition-colors ${
                    i === selectedIndex && !showBrowser
                      ? 'bg-accent-primary/10 text-text-primary'
                      : 'text-text-muted hover:bg-surface-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggle(i); }}
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 border ${
                        fx.enabled
                          ? 'bg-accent-primary border-accent-primary'
                          : 'bg-transparent border-text-muted'
                      }`}
                      title={fx.enabled ? 'Disable' : 'Enable'}
                    />
                    <span className="text-xs font-mono truncate flex-1">{fx.type}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove(i); }}
                      className="text-text-muted hover:text-accent-error text-xs opacity-0 group-hover:opacity-100"
                      title="Remove"
                      style={{ opacity: i === selectedIndex && !showBrowser ? 1 : undefined }}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5 pl-[18px]">
                    wet: {Math.round(fx.wet)}%
                  </div>
                </button>
              ))}
              {insertEffects.length === 0 && !showBrowser && (
                <div className="px-3 py-4 text-text-muted text-xs text-center">
                  No effects on this channel.
                  <br />Click + to add one.
                </div>
              )}
            </div>
            {/* Add button */}
            <button
              onClick={() => setShowBrowser(true)}
              disabled={insertEffects.length >= MAX_INSERT_EFFECTS}
              className={`px-3 py-2 border-t border-border-primary text-xs font-mono transition-colors ${
                insertEffects.length >= MAX_INSERT_EFFECTS
                  ? 'text-text-muted/30 cursor-not-allowed'
                  : showBrowser
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-secondary'
              }`}
            >
              + Add Effect ({AVAILABLE_EFFECTS.length} available)
            </button>
          </div>

          {/* Right column: parameter editor or effect browser */}
          <div className="flex-1 overflow-y-auto">
            {showBrowser ? (
              <div className="p-3">
                <input
                  type="text"
                  placeholder="Search effects..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full px-2 py-1 mb-3 text-xs bg-surface-secondary border border-border-primary rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary"
                  autoFocus
                />
                {Object.entries(filteredGroups).map(([group, effects]) => (
                  <div key={group} className="mb-3">
                    <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1">
                      {group}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {effects.map(fx => (
                        <button
                          key={fx.type}
                          onClick={() => handleAddEffect(fx)}
                          className="text-left px-2 py-1.5 text-xs font-mono rounded border border-border-primary text-text-muted hover:text-text-primary hover:bg-surface-secondary hover:border-accent-primary/30 transition-colors"
                          title={fx.description}
                        >
                          {fx.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(filteredGroups).length === 0 && (
                  <div className="text-text-muted text-xs text-center py-4">
                    No effects matching &quot;{searchQuery}&quot;
                  </div>
                )}
              </div>
            ) : selectedEffect ? (
              <EffectParameterEditor
                effect={selectedEffect}
                onUpdateParameter={handleUpdateParameter}
                onUpdateParameters={(params) => {
                  const effects = effectsRef.current;
                  const fx = effects[selectedIndex];
                  if (!fx) return;
                  updateChannelInsertEffect(channelIndex, selectedIndex, {
                    parameters: { ...fx.parameters, ...params },
                  });
                }}
                onUpdateWet={handleWetChange}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                Click + Add Effect to get started
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
