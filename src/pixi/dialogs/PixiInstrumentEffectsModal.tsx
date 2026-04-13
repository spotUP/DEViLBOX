/**
 * PixiInstrumentEffectsModal — GL-native instrument effects modal.
 *
 * Two-column layout:
 *   Left  – Current instrument's effect chain (toggle, wet, edit, remove)
 *   Right – Add effects panel (searchable grid) OR parameter editor
 *
 * DOM reference: src/components/effects/InstrumentEffectsModal.tsx
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  PixiModal,
  PixiModalHeader,
  PixiModalFooter,
  PixiButton,
  PixiLabel,
  PixiScrollView,
  PixiSelect,
  type SelectOption,
} from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { PixiEffectParameterEditor } from './PixiEffectParameterEditor';
import { usePixiTheme } from '../theme';

import { useInstrumentStore, notify } from '@stores';
import type { EffectConfig, AudioEffectType as EffectType } from '@typedefs/instrument';
import { AVAILABLE_EFFECTS, getEffectsByGroup, type AvailableEffect } from '@constants/unifiedEffects';
import { GUITARML_MODEL_REGISTRY, getModelCharacteristicDefaults } from '@constants/guitarMLRegistry';
import { INSTRUMENT_FX_PRESETS } from '@constants/fxPresets';

// ── Layout constants ────────────────────────────────────────────────────────

const MODAL_W = 700;
const MODAL_H = 450;
const LEFT_W = Math.floor(MODAL_W / 2);
const RIGHT_W = MODAL_W - LEFT_W;
const HEADER_H = 38;
const FOOTER_H = 44;
const BODY_H = MODAL_H - HEADER_H - FOOTER_H;
const SUB_HEADER_H = 56;
const PAD = 8;

// ── Category accent colors ──────────────────────────────────────────────────

const CATEGORY_ACCENT: Record<string, number> = {
  tonejs: 0x3b82f6,
  neural: 0xa855f7,
  wasm: 0x10b981,
  wam: 0x14b8a6,
};

// ── Preset options for PixiSelect ───────────────────────────────────────────

const PRESET_OPTIONS: SelectOption[] = (() => {
  const opts: SelectOption[] = [{ value: '', label: 'Load preset…' }];

  const byCategory: Record<string, { name: string; index: number }[]> = {};
  INSTRUMENT_FX_PRESETS.forEach((p, i) => {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push({ name: p.name, index: i });
  });

  Object.keys(byCategory).sort().forEach((cat) => {
    opts.push({ value: '__group__', label: cat });
    byCategory[cat]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(({ name, index }) => {
        opts.push({ value: String(index), label: name });
      });
  });

  return opts;
})();

// ── Props ───────────────────────────────────────────────────────────────────

interface PixiInstrumentEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export const PixiInstrumentEffectsModal: React.FC<PixiInstrumentEffectsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const theme = usePixiTheme();

  const [editingEffect, setEditingEffect] = useState<EffectConfig | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Ref to prevent stale closures in rapid knob onChange (see project memory)
  const editingEffectRef = useRef<EffectConfig | null>(null);
  React.useLayoutEffect(() => {
    editingEffectRef.current = editingEffect;
  }, [editingEffect]);

  const {
    instruments,
    currentInstrumentId,
    addEffectConfig,
    removeEffect,
    updateEffect,
    updateInstrument,
  } = useInstrumentStore();

  const currentInstrument = instruments.find((inst) => inst.id === currentInstrumentId);
  const effects = currentInstrument?.effects ?? [];
  const neuralEffectCount = effects.filter((fx) => fx.category === 'neural').length;

  // ── Grouped + filtered effects for add panel ─────────────────────────────

  const effectsByGroup = getEffectsByGroup();
  const filteredEffectsByGroup = useMemo(() => {
    if (!searchQuery.trim()) return effectsByGroup;
    const q = searchQuery.toLowerCase();
    const filtered: Record<string, AvailableEffect[]> = {};
    for (const [group, groupEffects] of Object.entries(effectsByGroup)) {
      const matched = groupEffects.filter((e) => e.label.toLowerCase().includes(q));
      if (matched.length > 0) filtered[group] = matched;
    }
    return filtered;
  }, [effectsByGroup, searchQuery]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAddEffect = useCallback(
    (availableEffect: AvailableEffect) => {
      if (currentInstrumentId === null) return;

      const newEffect: Omit<EffectConfig, 'id'> = {
        category: availableEffect.category,
        type: (availableEffect.type as EffectType) || 'Distortion',
        enabled: true,
        wet: 100,
        parameters: {},
        neuralModelIndex: availableEffect.neuralModelIndex,
        neuralModelName:
          availableEffect.category === 'neural' ? availableEffect.label : undefined,
      };

      // Neural model default parameters
      if (availableEffect.category === 'neural' && availableEffect.neuralModelIndex !== undefined) {
        const model = GUITARML_MODEL_REGISTRY[availableEffect.neuralModelIndex];
        if (model?.parameters) {
          Object.entries(model.parameters).forEach(([key, param]) => {
            if (param) newEffect.parameters[key] = param.default;
          });
          const charDefaults = getModelCharacteristicDefaults(
            model.characteristics.gain,
            model.characteristics.tone,
          );
          Object.assign(newEffect.parameters, charDefaults);
        }
      }

      addEffectConfig(currentInstrumentId, newEffect);
    },
    [currentInstrumentId, addEffectConfig],
  );

  const handleRemoveEffect = useCallback(
    (effectId: string) => {
      if (currentInstrumentId !== null) {
        removeEffect(currentInstrumentId, effectId);
        if (editingEffect?.id === effectId) setEditingEffect(null);
      }
    },
    [currentInstrumentId, removeEffect, editingEffect],
  );

  const handleToggle = useCallback(
    (effectId: string) => {
      const fx = effects.find((e) => e.id === effectId);
      if (fx && currentInstrumentId !== null) {
        updateEffect(currentInstrumentId, effectId, { enabled: !fx.enabled });
      }
    },
    [effects, currentInstrumentId, updateEffect],
  );

  const handleLoadPreset = useCallback(
    (presetIndex: string) => {
      if (!presetIndex || currentInstrumentId === null) return;
      const preset = INSTRUMENT_FX_PRESETS[Number(presetIndex)];
      if (!preset) return;

      const presetEffects: EffectConfig[] = preset.effects.map((fx, i) => ({
        ...fx,
        id: `preset-fx-${Date.now()}-${i}`,
      }));
      updateInstrument(currentInstrumentId, { effects: presetEffects });
      setEditingEffect(null);
      notify.success(`Applied ${preset.name}`);
    },
    [currentInstrumentId, updateInstrument],
  );

  // Parameter editor callbacks — use ref to avoid stale state
  const handleParamChange = useCallback(
    (params: Record<string, number | string>) => {
      const current = editingEffectRef.current;
      if (!current || currentInstrumentId === null) return;
      const updates = { parameters: params };
      updateEffect(currentInstrumentId, current.id, updates);
      setEditingEffect({ ...current, parameters: params });
    },
    [currentInstrumentId, updateEffect],
  );

  const handleWetChange = useCallback(
    (wet: number) => {
      const current = editingEffectRef.current;
      if (!current || currentInstrumentId === null) return;
      updateEffect(currentInstrumentId, current.id, { wet });
      setEditingEffect({ ...current, wet });
    },
    [currentInstrumentId, updateEffect],
  );

  const effectiveOpen = isOpen && !!currentInstrument;
  const title = currentInstrument
    ? `${currentInstrument.name || `Instrument ${currentInstrument.id}`} Effects`
    : 'Effects';

  // ── Layout helpers ───────────────────────────────────────────────────────

  // Effect chain: estimate content height for scroll
  const chainItemH = 52;
  const chainContentH = Math.max(effects.length * (chainItemH + 4) + 40, BODY_H - SUB_HEADER_H);
  const chainScrollH = BODY_H - SUB_HEADER_H;

  // Add panel: estimate content height
  const groupEntries = Object.entries(filteredEffectsByGroup);
  const addContentH = groupEntries.reduce(
    (h, [, items]) => h + 22 + Math.ceil(items.length / 2) * 30 + 10,
    20,
  );
  const addScrollH = BODY_H - SUB_HEADER_H - 40; // extra room for search

  return (
    <PixiModal isOpen={effectiveOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title={title} width={MODAL_W} onClose={onClose} />

      {/* ── Body: left + right columns ─────────────────────────────────── */}
      <layoutContainer layout={{ flexDirection: 'row', width: MODAL_W, height: BODY_H }}>
        {/* ═══════════ LEFT — Effect chain ═══════════ */}
        <layoutContainer
          layout={{
            width: LEFT_W,
            flexDirection: 'column',
            borderRightWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          {/* Sub-header */}
          <layoutContainer
            layout={{
              flexDirection: 'column',
              gap: 4,
              padding: PAD,
              height: SUB_HEADER_H,
              borderBottomWidth: 1,
              borderColor: theme.border.color,
              backgroundColor: theme.bgSecondary.color,
            }}
          >
            <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <PixiLabel text="Effect Chain" size="sm" weight="bold" color="text" />
              <PixiLabel
                text={`${effects.length} active${neuralEffectCount > 0 ? ` • ${neuralEffectCount} neural` : ''}`}
                size="xs"
                color="textMuted"
              />
            </layoutContainer>
            <PixiSelect
              options={PRESET_OPTIONS}
              value=""
              onChange={handleLoadPreset}
              width={LEFT_W - PAD * 2 - 4}
            />
          </layoutContainer>

          {/* Chain list */}
          <PixiScrollView
            width={LEFT_W}
            height={chainScrollH}
            contentHeight={chainContentH}
            direction="vertical"
          >
            <layoutContainer
              layout={{
                width: LEFT_W - 14,
                flexDirection: 'column',
                gap: 4,
                padding: PAD,
              }}
            >
              {effects.length === 0 ? (
                <layoutContainer
                  layout={{
                    width: LEFT_W - 30,
                    padding: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.border.color,
                    borderRadius: 6,
                  }}
                >
                  <PixiLabel text="No effects. Add from the right →" size="xs" color="textMuted" />
                </layoutContainer>
              ) : (
                effects.map((fx) => (
                  <EffectChainRow
                    key={fx.id}
                    effect={fx}
                    isEditing={editingEffect?.id === fx.id}
                    onEdit={() => setEditingEffect(fx)}
                    onToggle={() => handleToggle(fx.id)}
                    onRemove={() => handleRemoveEffect(fx.id)}
                    width={LEFT_W - 30}
                  />
                ))
              )}
            </layoutContainer>
          </PixiScrollView>
        </layoutContainer>

        {/* ═══════════ RIGHT — Add effects / Parameter editor ═══════════ */}
        <layoutContainer layout={{ width: RIGHT_W, flexDirection: 'column' }}>
          {editingEffect ? (
            /* ── Parameter editor mode ─────────────────────────────────── */
            <>
              <layoutContainer
                layout={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: PAD,
                  height: 36,
                  borderBottomWidth: 1,
                  borderColor: theme.border.color,
                  backgroundColor: theme.bgSecondary.color,
                }}
              >
                <PixiLabel
                  text={`${editingEffect.neuralModelName || editingEffect.type} Parameters`}
                  size="sm"
                  weight="bold"
                  color="text"
                />
                <PixiButton
                  label="← Back"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingEffect(null)}
                />
              </layoutContainer>
              <layoutContainer layout={{ flex: 1, padding: PAD }}>
                <PixiEffectParameterEditor
                  effect={editingEffect}
                  onChange={handleParamChange}
                  onWetChange={handleWetChange}
                />
              </layoutContainer>
            </>
          ) : (
            /* ── Add effects mode ──────────────────────────────────────── */
            <>
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 4,
                  padding: PAD,
                  borderBottomWidth: 1,
                  borderColor: theme.border.color,
                  backgroundColor: theme.bgSecondary.color,
                }}
              >
                <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <PixiLabel text="Add Effect" size="sm" weight="bold" color="text" />
                  <PixiLabel
                    text={`${AVAILABLE_EFFECTS.length} available`}
                    size="xs"
                    color="textMuted"
                  />
                </layoutContainer>
                <PixiPureTextInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search effects…"
                  width={RIGHT_W - PAD * 2 - 4}
                  height={24}
                />
              </layoutContainer>

              <PixiScrollView
                width={RIGHT_W}
                height={addScrollH}
                contentHeight={addContentH}
                direction="vertical"
              >
                <layoutContainer
                  layout={{
                    width: RIGHT_W - 14,
                    flexDirection: 'column',
                    gap: 8,
                    padding: PAD,
                  }}
                >
                  {groupEntries.length === 0 && (
                    <layoutContainer layout={{ padding: 16, alignItems: 'center' }}>
                      <PixiLabel
                        text={`No effects matching "${searchQuery}"`}
                        size="xs"
                        color="textMuted"
                      />
                    </layoutContainer>
                  )}
                  {groupEntries.map(([group, groupEffects]) => (
                    <layoutContainer
                      key={group}
                      layout={{ flexDirection: 'column', gap: 4 }}
                    >
                      <PixiLabel
                        text={group.toUpperCase()}
                        size="xs"
                        weight="bold"
                        color="textMuted"
                      />
                      <layoutContainer
                        layout={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: 4,
                        }}
                      >
                        {groupEffects.map((ae) => (
                          <PixiButton
                            key={ae.label}
                            label={ae.label}
                            variant="default"
                            size="sm"
                            onClick={() => handleAddEffect(ae)}
                          />
                        ))}
                      </layoutContainer>
                    </layoutContainer>
                  ))}
                </layoutContainer>
              </PixiScrollView>
            </>
          )}
        </layoutContainer>
      </layoutContainer>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <PixiModalFooter width={MODAL_W}>
        <layoutContainer
          layout={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, width: MODAL_W }}
        >
          <PixiButton label="Close" variant="default" onClick={onClose} />
        </layoutContainer>
      </PixiModalFooter>
    </PixiModal>
  );
};

// ── Sub-component: EffectChainRow ───────────────────────────────────────────

interface EffectChainRowProps {
  effect: EffectConfig;
  isEditing: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
  width: number;
}

const EffectChainRow: React.FC<EffectChainRowProps> = ({
  effect,
  isEditing,
  onEdit,
  onToggle,
  onRemove,
  width,
}) => {
  const theme = usePixiTheme();
  const accent = CATEGORY_ACCENT[effect.category] ?? theme.accent.color;

  return (
    <layoutContainer
      layout={{
        width,
        flexDirection: 'column',
        gap: 4,
        padding: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: isEditing ? accent : theme.border.color,
        backgroundColor: isEditing ? 0x1a1a2e : theme.bgSecondary.color,
      }}
      eventMode="static"
      cursor="pointer"
      onPress={onEdit}
    >
      {/* Top row: name + badges */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {/* LED */}
        <layoutContainer
          layout={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: effect.enabled ? 0x22ff44 : theme.bgActive.color,
          }}
        />
        <PixiLabel
          text={effect.neuralModelName || effect.type}
          size="xs"
          weight="bold"
          color="text"
        />
        {effect.category === 'neural' && (
          <PixiLabel text="Neural" size="xs" color="custom" customColor={0xa855f7} />
        )}
        {effect.category === 'wam' && (
          <PixiLabel text="WAM" size="xs" color="custom" customColor={0x14b8a6} />
        )}
        <layoutContainer layout={{ flex: 1 }} />
      </layoutContainer>

      {/* Bottom row: status + controls */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <PixiLabel
          text={`${effect.enabled ? 'Active' : 'Bypassed'} • Wet: ${effect.wet}%`}
          size="xs"
          color="textMuted"
        />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiButton
          label={effect.enabled ? 'ON' : 'OFF'}
          variant={effect.enabled ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => { onToggle(); }}
        />
        <PixiButton
          icon="close"
          label=""
          variant="ghost"
          size="sm"
          onClick={() => { onRemove(); }}
        />
      </layoutContainer>
    </layoutContainer>
  );
};
