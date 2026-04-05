/**
 * PixiPedalboard — GL-native horizontal pedalboard / effect chain visual editor.
 *
 * Displays effects as hardware-style stomp-box pedals in a horizontal chain.
 * Each pedal shows: category color, effect name, bypass toggle, wet/dry knob.
 * Reorder via up/down (left/right) arrow buttons. Add/remove pedals.
 *
 * Works for both per-instrument effects and master effects — the caller provides
 * the effect list and callbacks.
 *
 * DOM reference: src/components/pedalboard/PedalboardManager.tsx + EffectPedal.tsx
 */

import React from 'react';
import {
  PixiButton,
  PixiLabel,
  PixiScrollView,
  PixiKnob,
} from '../../components';
import { usePixiTheme } from '../../theme';
import type { EffectConfig } from '@typedefs/instrument';

// ── Layout constants ────────────────────────────────────────────────────────

const PEDAL_W = 120;
const PEDAL_H = 160;
const PEDAL_GAP = 8;
const PAD = 8;
const HEADER_H = 32;

// ── Category colors for pedal enclosures ────────────────────────────────────
// Maps effect group labels to pedal accent colors.
// Uses the same semantic grouping as the DOM EffectPedal PEDAL_COLORS.

const PEDAL_CATEGORY_COLORS: Record<string, { bg: number; accent: number; border: number }> = {
  // By effect group (from unifiedEffects.ts)
  'Distortion':  { bg: 0x4a1e00, accent: 0xffaa44, border: 0x8a4210 },
  'Dynamics':    { bg: 0x383838, accent: 0xaaaaaa, border: 0x484848 },
  'EQ & Filter': { bg: 0x1a3560, accent: 0x66aaff, border: 0x2a4570 },
  'Modulation':  { bg: 0x185060, accent: 0x55ccdd, border: 0x286070 },
  'Delay':       { bg: 0x183860, accent: 0x5599ee, border: 0x284870 },
  'Reverb':      { bg: 0x381860, accent: 0x9966ee, border: 0x482870 },
  'Pitch':       { bg: 0x2a5418, accent: 0x8ddd55, border: 0x3a6a22 },
  'Utility':     { bg: 0x383838, accent: 0xcccccc, border: 0x484848 },
  // By EffectCategory (fallback)
  'tonejs':      { bg: 0x1a2a50, accent: 0x3b82f6, border: 0x2a3a60 },
  'neural':      { bg: 0x381860, accent: 0xa855f7, border: 0x482870 },
  'buzzmachine': { bg: 0x4a2800, accent: 0xf97316, border: 0x5a3810 },
  'wasm':        { bg: 0x0a3a2a, accent: 0x10b981, border: 0x1a4a3a },
  'wam':         { bg: 0x0a3a3a, accent: 0x14b8a6, border: 0x1a4a4a },
};

const DEFAULT_PEDAL_COLOR = { bg: 0x2a2a2a, accent: 0xcccccc, border: 0x3a3a3a };

/** Resolve pedal color from effect group or category */
function getPedalColor(effect: EffectConfig, groupLookup: Map<string, string>): { bg: number; accent: number; border: number } {
  // First try the effect group from the registry
  const group = groupLookup.get(effect.type) ?? groupLookup.get(effect.neuralModelName ?? '');
  if (group && PEDAL_CATEGORY_COLORS[group]) return PEDAL_CATEGORY_COLORS[group];
  // Fallback to category
  if (PEDAL_CATEGORY_COLORS[effect.category]) return PEDAL_CATEGORY_COLORS[effect.category];
  return DEFAULT_PEDAL_COLOR;
}

// ── Props ───────────────────────────────────────────────────────────────────

export interface PixiPedalboardProps {
  /** The ordered effect chain */
  effects: EffectConfig[];
  /** Total available width */
  width: number;
  /** Total available height */
  height: number;
  /** Called to add a new effect (opens an add-effect UI externally) */
  onAddEffect?: () => void;
  /** Remove effect by ID */
  onRemoveEffect?: (effectId: string) => void;
  /** Toggle bypass for effect */
  onToggleEffect?: (effectId: string) => void;
  /** Update effect parameters */
  onUpdateEffect?: (effectId: string, updates: Partial<EffectConfig>) => void;
  /** Reorder: move effect from oldIndex to newIndex */
  onReorder?: (oldIndex: number, newIndex: number) => void;
  /** Select effect for detailed parameter editing */
  onSelectEffect?: (effectId: string) => void;
  /** Currently selected effect ID */
  selectedEffectId?: string | null;
  /** Effect type -> group label mapping for color lookup */
  effectGroupLookup?: Map<string, string>;
}

// ── Component ───────────────────────────────────────────────────────────────

export const PixiPedalboard: React.FC<PixiPedalboardProps> = ({
  effects,
  width,
  height,
  onAddEffect,
  onRemoveEffect,
  onToggleEffect,
  onUpdateEffect,
  onReorder,
  onSelectEffect,
  selectedEffectId,
  effectGroupLookup = new Map(),
}) => {
  const theme = usePixiTheme();

  // Total scrollable content width
  const contentW = effects.length * (PEDAL_W + PEDAL_GAP) + (PEDAL_W / 2) + PAD * 2;
  const scrollW = width;
  const bodyH = height - HEADER_H;

  return (
    <layoutContainer layout={{ width, height, flexDirection: 'column' }}>
      {/* ── Header: signal flow + add button ────────────────────────────── */}
      <layoutContainer
        layout={{
          width,
          height: HEADER_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: PAD,
          paddingRight: PAD,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
          backgroundColor: theme.bgSecondary.color,
        }}
      >
        <PixiLabel text="IN" size="xs" weight="bold" color="accent" />
        <PixiLabel text=">" size="xs" color="textMuted" />
        {effects.length > 0 ? (
          effects.map((fx, idx) => (
            <React.Fragment key={fx.id}>
              <PixiLabel
                text={fx.neuralModelName || fx.type}
                size="xs"
                color="custom"
                customColor={fx.enabled ? theme.success.color : theme.error.color}
              />
              {idx < effects.length - 1 && (
                <PixiLabel text=">" size="xs" color="textMuted" />
              )}
            </React.Fragment>
          ))
        ) : (
          <PixiLabel text="direct" size="xs" color="textMuted" />
        )}
        <PixiLabel text=">" size="xs" color="textMuted" />
        <PixiLabel text="OUT" size="xs" weight="bold" color="accent" />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiLabel text={`${effects.length} FX`} size="xs" color="textMuted" />
        {onAddEffect && (
          <PixiButton label="+ Add" variant="primary" size="sm" onClick={onAddEffect} />
        )}
      </layoutContainer>

      {/* ── Body: horizontal scroll of pedals ───────────────────────────── */}
      <PixiScrollView
        width={scrollW}
        height={bodyH}
        contentWidth={contentW}
        contentHeight={bodyH}
        direction="horizontal"
      >
        <layoutContainer
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: PEDAL_GAP,
            padding: PAD,
            height: bodyH,
          }}
        >
          {effects.length === 0 ? (
            <layoutContainer
              layout={{
                width: scrollW - PAD * 2,
                height: PEDAL_H,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.border.color,
                borderRadius: 8,
              }}
            >
              <PixiLabel text="No effects in chain" size="sm" color="textMuted" />
              {onAddEffect && (
                <PixiButton
                  label="Add First Effect"
                  variant="default"
                  size="sm"
                  onClick={onAddEffect}
                  layout={{ marginTop: 8 }}
                />
              )}
            </layoutContainer>
          ) : (
            effects.map((fx, idx) => (
              <PedalCard
                key={fx.id}
                effect={fx}
                index={idx}
                total={effects.length}
                isSelected={selectedEffectId === fx.id}
                colors={getPedalColor(fx, effectGroupLookup)}
                onToggle={() => onToggleEffect?.(fx.id)}
                onRemove={() => onRemoveEffect?.(fx.id)}
                onSelect={() => onSelectEffect?.(fx.id)}
                onMoveLeft={() => idx > 0 && onReorder?.(idx, idx - 1)}
                onMoveRight={() => idx < effects.length - 1 && onReorder?.(idx, idx + 1)}
                onWetChange={(wet) => onUpdateEffect?.(fx.id, { wet })}
              />
            ))
          )}
        </layoutContainer>
      </PixiScrollView>
    </layoutContainer>
  );
};

// ── Sub-component: PedalCard ──────────────────────────────────────────────

interface PedalCardProps {
  effect: EffectConfig;
  index: number;
  total: number;
  isSelected: boolean;
  colors: { bg: number; accent: number; border: number };
  onToggle: () => void;
  onRemove: () => void;
  onSelect: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onWetChange: (wet: number) => void;
}

const PedalCard: React.FC<PedalCardProps> = ({
  effect,
  index,
  total,
  isSelected,
  colors,
  onToggle,
  onRemove,
  onSelect,
  onMoveLeft,
  onMoveRight,
  onWetChange,
}) => {
  const displayName = effect.neuralModelName || effect.type;
  // Truncate long names
  const truncatedName = displayName.length > 14 ? displayName.slice(0, 13) + '...' : displayName;

  return (
    <layoutContainer
      layout={{
        width: PEDAL_W,
        height: PEDAL_H,
        flexDirection: 'column',
        borderRadius: 8,
        borderWidth: isSelected ? 2 : 1,
        borderColor: isSelected ? colors.accent : colors.border,
        backgroundColor: colors.bg,
        overflow: 'hidden',
      }}
      eventMode="static"
      cursor="pointer"
      onPress={onSelect}
    >
      {/* ── Top bar: LED + category badge ─────────────────────────────── */}
      <layoutContainer
        layout={{
          width: PEDAL_W,
          height: 24,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingLeft: 6,
          paddingRight: 4,
          backgroundColor: effect.enabled ? colors.bg : 0x1a1a1a,
        }}
      >
        {/* LED indicator */}
        <layoutContainer
          layout={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: effect.enabled ? 0x22ff44 : 0x333333,
          }}
        />
        <PixiLabel
          text={effect.category.toUpperCase()}
          size="xs"
          color="custom"
          customColor={colors.accent}
        />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiButton
          icon="close"
          label=""
          variant="ghost"
          size="sm"
          onClick={onRemove}
        />
      </layoutContainer>

      {/* ── Effect name ───────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          width: PEDAL_W,
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 2,
          paddingBottom: 2,
        }}
      >
        <PixiLabel
          text={truncatedName}
          size="sm"
          weight="bold"
          color="custom"
          customColor={effect.enabled ? colors.accent : 0x666666}
        />
      </layoutContainer>

      {/* ── Wet/Dry knob ──────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          width: PEDAL_W,
          alignItems: 'center',
          justifyContent: 'center',
          height: 58,
        }}
      >
        <PixiKnob
          value={effect.wet}
          min={0}
          max={100}
          onChange={(v: number) => onWetChange(v)}
          label="Wet"
          unit="%"
          size="sm"
          color={colors.accent}
        />
      </layoutContainer>

      {/* ── Bottom bar: bypass + reorder ──────────────────────────────── */}
      <layoutContainer
        layout={{
          width: PEDAL_W,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 4,
          paddingRight: 4,
          paddingBottom: 4,
          gap: 2,
        }}
      >
        {/* Move left */}
        <PixiButton
          icon="prev"
          label=""
          variant="ghost"
          size="sm"
          disabled={index === 0}
          onClick={onMoveLeft}
        />

        {/* Bypass toggle (stomp switch) */}
        <PixiButton
          label={effect.enabled ? 'ON' : 'OFF'}
          variant={effect.enabled ? 'primary' : 'ghost'}
          size="sm"
          onClick={onToggle}
        />

        {/* Move right */}
        <PixiButton
          icon="next"
          label=""
          variant="ghost"
          size="sm"
          disabled={index >= total - 1}
          onClick={onMoveRight}
        />
      </layoutContainer>
    </layoutContainer>
  );
};
