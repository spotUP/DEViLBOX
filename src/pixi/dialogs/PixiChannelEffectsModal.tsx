/**
 * PixiChannelEffectsModal — GL-native per-channel insert effects editor.
 *
 * Two-column layout:
 *   Left  – Insert effect chain (reorder, toggle, remove)
 *   Right – Add effects panel (searchable) OR parameter editor
 *
 * DOM reference: src/components/effects/ChannelInsertEffectsModal.tsx
 * GL reference:  src/pixi/dialogs/PixiMasterEffectsModal.tsx
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

import { useMixerStore } from '@stores/useMixerStore';
import type { EffectConfig, AudioEffectType as EffectType } from '@typedefs/instrument';
import { AVAILABLE_EFFECTS, getEffectsByGroup, type AvailableEffect } from '@constants/unifiedEffects';
import { CHANNEL_FX_PRESETS } from '@constants/channelFxPresets';
import { getDefaultEffectParameters } from '@engine/InstrumentFactory';

import {
  EFFECT_TYPE_TONEJS,
  EFFECT_TYPE_NEURAL,
  EFFECT_TYPE_BUZZMACHINE,
  EFFECT_TYPE_WASM,
  EFFECT_TYPE_WAM,
} from '../colors';

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
const MAX_INSERT_EFFECTS = 4;

const CATEGORY_ACCENT: Record<string, number> = {
  tonejs: EFFECT_TYPE_TONEJS,
  neural: EFFECT_TYPE_NEURAL,
  buzzmachine: EFFECT_TYPE_BUZZMACHINE,
  wasm: EFFECT_TYPE_WASM,
  wam: EFFECT_TYPE_WAM,
};

// ── Preset options ──────────────────────────────────────────────────────────

function buildPresetOptions(): SelectOption[] {
  const opts: SelectOption[] = [{ value: '', label: 'Load preset…' }];
  opts.push({ value: '__none__', label: '— No effects —' });
  CHANNEL_FX_PRESETS.forEach((p, i) => {
    opts.push({ value: `factory:${i}`, label: p.name });
  });
  return opts;
}

// ── Props ───────────────────────────────────────────────────────────────────

interface PixiChannelEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelIndex: number;
}

// ── Component ───────────────────────────────────────────────────────────────

export const PixiChannelEffectsModal: React.FC<PixiChannelEffectsModalProps> = ({
  isOpen,
  onClose,
  channelIndex,
}) => {
  const theme = usePixiTheme();

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Ref to prevent stale closures in rapid knob onChange (see project memory)
  const editingIndexRef = useRef<number | null>(null);
  React.useLayoutEffect(() => {
    editingIndexRef.current = editingIndex;
  }, [editingIndex]);

  const channelName = useMixerStore(s => s.channels[channelIndex]?.name ?? `Ch ${channelIndex + 1}`);
  const insertEffects = useMixerStore(s => s.channels[channelIndex]?.insertEffects ?? []);
  const effectsRef = useRef(insertEffects);
  useEffect(() => { effectsRef.current = insertEffects; }, [insertEffects]);

  const {
    addChannelInsertEffect,
    removeChannelInsertEffect,
    toggleChannelInsertEffect,
    moveChannelInsertEffect,
    updateChannelInsertEffect,
    loadChannelInsertPreset,
  } = useMixerStore();

  // Derive editing effect from store
  const editingEffect = useMemo(
    () => (editingIndex !== null ? insertEffects[editingIndex] ?? null : null),
    [insertEffects, editingIndex],
  );

  // Clamp editingIndex when effects list changes
  useEffect(() => {
    if (editingIndex !== null && editingIndex >= insertEffects.length) {
      setEditingIndex(insertEffects.length > 0 ? insertEffects.length - 1 : null);
    }
  }, [insertEffects.length, editingIndex]);

  // Reset editing on open
  useEffect(() => {
    if (isOpen) {
      setEditingIndex(insertEffects.length > 0 ? 0 : null);
      setSearchQuery('');
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const presetOptions = useMemo(() => buildPresetOptions(), []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleLoadPreset = useCallback(
    (value: string) => {
      if (!value) return;
      if (value === '__none__') {
        loadChannelInsertPreset(channelIndex, []);
        setEditingIndex(null);
      } else if (value.startsWith('factory:')) {
        const idx = Number(value.slice(8));
        const preset = CHANNEL_FX_PRESETS[idx];
        if (!preset) return;
        loadChannelInsertPreset(channelIndex, preset.effects.map(fx => ({ ...fx })));
        setEditingIndex(0);
      }
    },
    [channelIndex, loadChannelInsertPreset],
  );

  const handleAddEffect = useCallback(
    (availableEffect: AvailableEffect) => {
      if (insertEffects.length >= MAX_INSERT_EFFECTS) return;
      const type = (availableEffect.type as EffectType) || 'Distortion';
      const params: Record<string, number | string> = { ...getDefaultEffectParameters(type) };

      addChannelInsertEffect(channelIndex, {
        category: availableEffect.category,
        type,
        enabled: true,
        wet: 100,
        parameters: params,
        neuralModelIndex: availableEffect.neuralModelIndex,
        neuralModelName:
          availableEffect.category === 'neural' ? availableEffect.label : undefined,
      } as EffectConfig);

      // Select the newly added effect
      const updated = useMixerStore.getState().channels[channelIndex]?.insertEffects ?? [];
      setEditingIndex(updated.length - 1);
    },
    [channelIndex, insertEffects.length, addChannelInsertEffect],
  );

  const handleRemoveEffect = useCallback(
    (index: number) => {
      removeChannelInsertEffect(channelIndex, index);
      if (editingIndex === index) setEditingIndex(null);
      else if (editingIndex !== null && editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
    },
    [channelIndex, removeChannelInsertEffect, editingIndex],
  );

  const handleToggle = useCallback(
    (index: number) => {
      toggleChannelInsertEffect(channelIndex, index);
    },
    [channelIndex, toggleChannelInsertEffect],
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index > 0) {
        moveChannelInsertEffect(channelIndex, index, index - 1);
        if (editingIndex === index) setEditingIndex(index - 1);
      }
    },
    [channelIndex, moveChannelInsertEffect, editingIndex],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index < insertEffects.length - 1) {
        moveChannelInsertEffect(channelIndex, index, index + 1);
        if (editingIndex === index) setEditingIndex(index + 1);
      }
    },
    [channelIndex, insertEffects.length, moveChannelInsertEffect, editingIndex],
  );

  // Parameter editor callbacks — use ref to avoid stale state
  const handleParamChange = useCallback(
    (params: Record<string, number | string>) => {
      const idx = editingIndexRef.current;
      if (idx === null) return;
      updateChannelInsertEffect(channelIndex, idx, { parameters: params });
    },
    [channelIndex, updateChannelInsertEffect],
  );

  const handleWetChange = useCallback(
    (wet: number) => {
      const idx = editingIndexRef.current;
      if (idx === null) return;
      updateChannelInsertEffect(channelIndex, idx, { wet });
    },
    [channelIndex, updateChannelInsertEffect],
  );

  // ── Layout helpers ───────────────────────────────────────────────────────

  const chainItemH = 60;
  const chainContentH = Math.max(insertEffects.length * (chainItemH + 4) + 40, BODY_H - SUB_HEADER_H);
  const chainScrollH = BODY_H - SUB_HEADER_H;

  const groupEntries = Object.entries(filteredEffectsByGroup);
  const addContentH = groupEntries.reduce(
    (h, [, items]) => h + 22 + Math.ceil(items.length / 2) * 30 + 10,
    20,
  );
  const addScrollH = BODY_H - SUB_HEADER_H - 40;

  // Signal flow
  const signalFlowItems = insertEffects.map((fx) => ({
    name: fx.neuralModelName || fx.type,
    enabled: fx.enabled,
  }));

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title={`Channel ${channelIndex + 1} Effects — ${channelName}`} width={MODAL_W} onClose={onClose} />

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
          {/* Sub-header: presets */}
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
              <PixiLabel text="Insert Chain" size="sm" weight="bold" color="text" />
              <PixiLabel
                text={`${insertEffects.length}/${MAX_INSERT_EFFECTS} FX`}
                size="xs"
                color="textMuted"
              />
            </layoutContainer>
            <PixiSelect
              options={presetOptions}
              value=""
              onChange={handleLoadPreset}
              width={LEFT_W - PAD * 2 - 4}
            />
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
                    color="custom"
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
              {insertEffects.length === 0 ? (
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
                insertEffects.map((fx, idx) => (
                  <ChannelEffectChainRow
                    key={`${fx.type}-${idx}`}
                    effect={fx}
                    index={idx}
                    total={insertEffects.length}
                    isEditing={editingIndex === idx}
                    onEdit={() => setEditingIndex(idx)}
                    onToggle={() => handleToggle(idx)}
                    onRemove={() => handleRemoveEffect(idx)}
                    onMoveUp={() => handleMoveUp(idx)}
                    onMoveDown={() => handleMoveDown(idx)}
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
                  onClick={() => setEditingIndex(null)}
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
                    text={insertEffects.length >= MAX_INSERT_EFFECTS ? 'Max reached' : `${AVAILABLE_EFFECTS.length} available`}
                    size="xs"
                    color={insertEffects.length >= MAX_INSERT_EFFECTS ? 'custom' : 'textMuted'}
                    customColor={insertEffects.length >= MAX_INSERT_EFFECTS ? theme.warning.color : undefined}
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
                            disabled={insertEffects.length >= MAX_INSERT_EFFECTS}
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

// ── Sub-component: ChannelEffectChainRow ─────────────────────────────────────

interface ChannelEffectChainRowProps {
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

const ChannelEffectChainRow: React.FC<ChannelEffectChainRowProps> = ({
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
