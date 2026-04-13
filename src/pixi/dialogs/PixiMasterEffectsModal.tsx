/**
 * PixiMasterEffectsModal — GL-native master effects modal for the Pixi.js scene graph.
 *
 * Two-column layout:
 *   Left  – Master effect chain (reorder, toggle, wet, remove)
 *   Right – Add effects panel (searchable) OR parameter editor
 *
 * DOM reference: src/components/effects/MasterEffectsModal.tsx
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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

import { useAudioStore } from '@stores/useAudioStore';
import type { EffectConfig, AudioEffectType as EffectType } from '@typedefs/instrument';
import { AVAILABLE_EFFECTS, getEffectsByGroup, type AvailableEffect } from '@constants/unifiedEffects';
import { MASTER_FX_PRESETS } from '@constants/fxPresets';
import { GUITARML_MODEL_REGISTRY, getModelCharacteristicDefaults } from '@constants/guitarMLRegistry';
import { getDefaultEffectParameters } from '@engine/InstrumentFactory';

// ── Layout constants ────────────────────────────────────────────────────────

const MODAL_W = 750;
const MODAL_H = 500;
const LEFT_W = Math.floor(MODAL_W / 2);
const RIGHT_W = MODAL_W - LEFT_W;
const HEADER_H = 38;
const FOOTER_H = 44;
const BODY_H = MODAL_H - HEADER_H - FOOTER_H;
const SUB_HEADER_H = 56;
const PAD = 8;

import {
  EFFECT_TYPE_TONEJS,
  EFFECT_TYPE_NEURAL,
  EFFECT_TYPE_BUZZMACHINE,
  EFFECT_TYPE_WASM,
  EFFECT_TYPE_WAM,
} from '../colors';

// ── Category accent colors ──────────────────────────────────────────────────

const CATEGORY_ACCENT: Record<string, number> = {
  tonejs: EFFECT_TYPE_TONEJS,
  neural: EFFECT_TYPE_NEURAL,
  buzzmachine: EFFECT_TYPE_BUZZMACHINE,
  wasm: EFFECT_TYPE_WASM,
  wam: EFFECT_TYPE_WAM,
};

// ── User preset storage ─────────────────────────────────────────────────────

const USER_PRESETS_KEY = 'master-fx-user-presets';

interface UserMasterFxPreset {
  name: string;
  effects: EffectConfig[];
}

function getUserPresets(): UserMasterFxPreset[] {
  try {
    const stored = localStorage.getItem(USER_PRESETS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is UserMasterFxPreset =>
        p !== null &&
        typeof p === 'object' &&
        typeof p.name === 'string' &&
        Array.isArray(p.effects),
    );
  } catch {
    return [];
  }
}

// ── Preset options ──────────────────────────────────────────────────────────

function buildPresetOptions(): SelectOption[] {
  const userPresets = getUserPresets();
  const opts: SelectOption[] = [{ value: '', label: 'Load preset…' }];

  if (userPresets.length > 0) {
    [...userPresets]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => {
        const origIdx = userPresets.indexOf(p);
        opts.push({ value: `user:${origIdx}`, label: `★ ${p.name}` });
      });
  }

  // Group by category, sort categories and presets alphabetically
  const byCategory: Record<string, { preset: typeof MASTER_FX_PRESETS[0]; index: number }[]> = {};
  MASTER_FX_PRESETS.forEach((p, i) => {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push({ preset: p, index: i });
  });

  Object.keys(byCategory).sort().forEach((cat) => {
    opts.push({ value: '__group__', label: cat });
    byCategory[cat]
      .sort((a, b) => a.preset.name.localeCompare(b.preset.name))
      .forEach(({ preset, index }) => {
        opts.push({ value: `factory:${index}`, label: preset.name });
      });
  });

  return opts;
}

// ── Props ───────────────────────────────────────────────────────────────────

interface PixiMasterEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export const PixiMasterEffectsModal: React.FC<PixiMasterEffectsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const theme = usePixiTheme();

  const [editingEffectId, setEditingEffectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Ref to prevent stale closures in rapid knob onChange (see project memory)
  const editingEffectIdRef = useRef<string | null>(null);
  React.useLayoutEffect(() => {
    editingEffectIdRef.current = editingEffectId;
  }, [editingEffectId]);

  const {
    masterEffects,
    addMasterEffectConfig,
    removeMasterEffect,
    updateMasterEffect,
    reorderMasterEffects,
    setMasterEffects,
  } = useAudioStore();

  // Derive editingEffect from store (never stale)
  const editingEffect = useMemo(
    () => masterEffects.find((e) => e.id === editingEffectId) ?? null,
    [masterEffects, editingEffectId],
  );

  // Auto-select first effect on open
  useEffect(() => {
    if (isOpen && masterEffects.length > 0 && !editingEffectId) {
      setEditingEffectId(masterEffects[0].id);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const neuralEffectCount = masterEffects.filter((fx) => fx.category === 'neural').length;

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

  // ── Preset options (rebuild when user presets may have changed) ───────────

  const presetOptions = useMemo(() => buildPresetOptions(), [showSaveDialog]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleLoadPreset = useCallback(
    (value: string) => {
      if (!value) return;

      if (value.startsWith('user:')) {
        const idx = Number(value.slice(5));
        const userPresets = getUserPresets();
        const preset = userPresets[idx];
        if (!preset) return;
        const effects: EffectConfig[] = preset.effects.map((fx, i) => ({
          ...fx,
          id: `master-fx-${Date.now()}-${i}`,
        }));
        setMasterEffects(effects);
      } else if (value.startsWith('factory:')) {
        const idx = Number(value.slice(8));
        const preset = MASTER_FX_PRESETS[idx];
        if (!preset) return;
        const effects: EffectConfig[] = preset.effects.map((fx, i) => ({
          ...fx,
          id: `master-fx-${Date.now()}-${i}`,
        }));
        setMasterEffects(effects);
      }

      setEditingEffectId(null);
    },
    [setMasterEffects],
  );

  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;
    const userPresets = getUserPresets();
    userPresets.push({
      name: presetName.trim(),
      effects: masterEffects.map((fx) => ({ ...fx })),
    });
    localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(userPresets));
    setPresetName('');
    setShowSaveDialog(false);
  }, [presetName, masterEffects]);

  const handleAddEffect = useCallback(
    (availableEffect: AvailableEffect) => {
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

      addMasterEffectConfig({
        category: availableEffect.category,
        type,
        enabled: true,
        wet: 100,
        parameters: params,
        neuralModelIndex: availableEffect.neuralModelIndex,
        neuralModelName:
          availableEffect.category === 'neural' ? availableEffect.label : undefined,
      });

      // Select the newly added effect
      const added = useAudioStore.getState().masterEffects;
      const newId = added[added.length - 1]?.id ?? null;
      setEditingEffectId(newId);
    },
    [addMasterEffectConfig],
  );

  const handleRemoveEffect = useCallback(
    (effectId: string) => {
      removeMasterEffect(effectId);
      if (editingEffectId === effectId) setEditingEffectId(null);
    },
    [removeMasterEffect, editingEffectId],
  );

  const handleToggle = useCallback(
    (effectId: string) => {
      const fx = masterEffects.find((e) => e.id === effectId);
      if (fx) updateMasterEffect(effectId, { enabled: !fx.enabled });
    },
    [masterEffects, updateMasterEffect],
  );

  const handleMoveUp = useCallback(
    (effectId: string) => {
      const idx = masterEffects.findIndex((e) => e.id === effectId);
      if (idx > 0) reorderMasterEffects(idx, idx - 1);
    },
    [masterEffects, reorderMasterEffects],
  );

  const handleMoveDown = useCallback(
    (effectId: string) => {
      const idx = masterEffects.findIndex((e) => e.id === effectId);
      if (idx >= 0 && idx < masterEffects.length - 1) reorderMasterEffects(idx, idx + 1);
    },
    [masterEffects, reorderMasterEffects],
  );

  // Parameter editor callbacks — use ref to avoid stale state
  const handleParamChange = useCallback(
    (params: Record<string, number | string>) => {
      const id = editingEffectIdRef.current;
      if (!id) return;
      updateMasterEffect(id, { parameters: params });
    },
    [updateMasterEffect],
  );

  const handleWetChange = useCallback(
    (wet: number) => {
      const id = editingEffectIdRef.current;
      if (!id) return;
      updateMasterEffect(id, { wet });
    },
    [updateMasterEffect],
  );

  // ── Layout helpers ───────────────────────────────────────────────────────

  const chainItemH = 60;
  const chainContentH = Math.max(masterEffects.length * (chainItemH + 4) + 40, BODY_H - SUB_HEADER_H);
  const chainScrollH = BODY_H - SUB_HEADER_H;

  const groupEntries = Object.entries(filteredEffectsByGroup);
  const addContentH = groupEntries.reduce(
    (h, [, items]) => h + 22 + Math.ceil(items.length / 2) * 30 + 10,
    20,
  );
  const addScrollH = BODY_H - SUB_HEADER_H - 40;

  // Signal flow text
  const signalFlowItems = masterEffects.map((fx) => ({
    name: fx.neuralModelName || fx.type,
    enabled: fx.enabled,
  }));

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Master Effects" width={MODAL_W} onClose={onClose} />

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
          {/* Sub-header: presets + save + signal flow */}
          <layoutContainer
            layout={{
              flexDirection: 'column',
              gap: 4,
              padding: PAD,
              height: showSaveDialog ? SUB_HEADER_H + 32 : SUB_HEADER_H,
              borderBottomWidth: 1,
              borderColor: theme.border.color,
              backgroundColor: theme.bgSecondary.color,
            }}
          >
            <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <PixiLabel text="Effect Chain" size="sm" weight="bold" color="text" />
              <PixiLabel
                text={`${masterEffects.length} FX${neuralEffectCount >= 3 ? ` • ⚠ ${neuralEffectCount} neural` : ''}`}
                size="xs"
                color={neuralEffectCount >= 3 ? 'custom' : 'textMuted'}
                customColor={neuralEffectCount >= 3 ? theme.warning.color : undefined}
              />
              <layoutContainer layout={{ flex: 1 }} />
              <PixiButton
                label="Save"
                variant="ghost"
                size="sm"
                onClick={() => setShowSaveDialog(!showSaveDialog)}
              />
            </layoutContainer>
            <PixiSelect
              options={presetOptions}
              value=""
              onChange={handleLoadPreset}
              width={LEFT_W - PAD * 2 - 4}
            />
            {/* Save dialog inline */}
            {showSaveDialog && (
              <layoutContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                <PixiPureTextInput
                  value={presetName}
                  onChange={setPresetName}
                  onSubmit={handleSavePreset}
                  onCancel={() => setShowSaveDialog(false)}
                  placeholder="Preset name…"
                  width={LEFT_W - PAD * 2 - 80}
                  height={22}
                />
                <PixiButton label="Save" variant="primary" size="sm" onClick={handleSavePreset} />
              </layoutContainer>
            )}
          </layoutContainer>

          {/* Signal flow */}
          <layoutContainer
            layout={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingLeft: PAD,
              paddingRight: PAD,
              height: 20,
              borderBottomWidth: 1,
              borderColor: theme.border.color,
              backgroundColor: theme.bgSecondary.color,
            }}
          >
            <PixiLabel text="IN" size="xs" weight="bold" color="accent" />
            <PixiLabel text="→" size="xs" color="textMuted" />
            {signalFlowItems.length > 0 ? (
              signalFlowItems.map((item, idx) => (
                <React.Fragment key={idx}>
                  <PixiLabel
                    text={item.name}
                    size="xs"
                    color={item.enabled ? 'custom' : 'custom'}
                    customColor={item.enabled ? theme.success.color : theme.error.color}
                  />
                  {idx < signalFlowItems.length - 1 && (
                    <PixiLabel text="→" size="xs" color="textMuted" />
                  )}
                </React.Fragment>
              ))
            ) : (
              <PixiLabel text="direct" size="xs" color="textMuted" />
            )}
            <PixiLabel text="→" size="xs" color="textMuted" />
            <PixiLabel text="OUT" size="xs" weight="bold" color="accent" />
          </layoutContainer>

          {/* Chain list */}
          <PixiScrollView
            width={LEFT_W}
            height={chainScrollH - 20}
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
              {masterEffects.length === 0 ? (
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
                masterEffects.map((fx, idx) => (
                  <MasterEffectChainRow
                    key={fx.id}
                    effect={fx}
                    index={idx}
                    total={masterEffects.length}
                    isEditing={editingEffectId === fx.id}
                    onEdit={() => setEditingEffectId(fx.id)}
                    onToggle={() => handleToggle(fx.id)}
                    onRemove={() => handleRemoveEffect(fx.id)}
                    onMoveUp={() => handleMoveUp(fx.id)}
                    onMoveDown={() => handleMoveDown(fx.id)}
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
                  onClick={() => setEditingEffectId(null)}
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

// ── Sub-component: MasterEffectChainRow ─────────────────────────────────────

interface MasterEffectChainRowProps {
  effect: EffectConfig;
  index: number;
  total: number;
  isEditing: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  width: number;
}

const MasterEffectChainRow: React.FC<MasterEffectChainRowProps> = ({
  effect,
  index,
  total,
  isEditing,
  onEdit,
  onToggle,
  onRemove,
  onMoveUp,
  onMoveDown,
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
      {/* Top row: reorder + name + badges */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {/* Reorder buttons */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 1 }}>
          <PixiButton
            label="▲"
            variant="ghost"
            size="sm"
            onClick={() => { onMoveUp(); }}
            disabled={index === 0}
          />
          <PixiButton
            label="▼"
            variant="ghost"
            size="sm"
            onClick={() => { onMoveDown(); }}
            disabled={index >= total - 1}
          />
        </layoutContainer>

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
