/**
 * PixiEffectPicker — GL-native effect command picker dialog.
 * Shows all FT2 effect commands organized by category with search and descriptions.
 * GL port of src/components/tracker/EffectPicker.tsx.
 */

import { useState, useMemo, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiButton, PixiLabel } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import {
  FT2_EFFECT_DESCRIPTIONS,
  FT2_E_COMMAND_DESCRIPTIONS,
  EFFECT_CATEGORY_COLORS,
  type EffectCategory,
  type EffectDescription,
  hasFurnaceEffects,
  getAllFurnaceEffects,
} from '@utils/ft2EffectDescriptions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PixiEffectPickerProps {
  isOpen: boolean;
  onSelect: (effTyp: number, eff: number) => void;
  onClose: () => void;
  synthType?: string;
}

type ExtendedCategory = EffectCategory | 'chip';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Map Tailwind category color classes to theme-derived hex colors */
function getCategoryHexColors(theme: ReturnType<typeof usePixiTheme>): Record<string, number> {
  return {
    'text-blue-400':           theme.accent.color,
    'text-emerald-400':        theme.success.color,
    'text-green-400':          theme.success.color,
    'text-yellow-400':         theme.warning.color,
    'text-red-400':            theme.error.color,
    'text-purple-400':         theme.accentSecondary.color,
    'text-orange-400':         theme.warning.color,
    'text-accent-highlight':   theme.accentHighlight.color,
    'text-neutral-400':        theme.textMuted.color,
    'text-pink-400':           0xF472B6,
  };
}

const CATEGORY_LABELS: Record<ExtendedCategory, string> = {
  pitch: 'Pitch',
  volume: 'Volume',
  panning: 'Panning',
  timing: 'Timing',
  global: 'Global',
  sample: 'Sample',
  misc: 'Misc',
  chip: 'Chip',
};

const CATEGORY_ORDER: EffectCategory[] = ['pitch', 'volume', 'panning', 'timing', 'global', 'sample', 'misc'];

const EXTENDED_CATEGORY_COLORS: Record<ExtendedCategory, string> = {
  ...EFFECT_CATEGORY_COLORS,
  chip: 'text-pink-400',
};

const ROW_HEIGHT = 32;
const MODAL_WIDTH = 380;
const MODAL_HEIGHT = 480;
const LIST_WIDTH = MODAL_WIDTH - 2; // account for border
const HEADER_H = 36;
const SEARCH_H = 36;
const TABS_H = 30;
const LIST_HEIGHT = MODAL_HEIGHT - HEADER_H - SEARCH_H - TABS_H - 12;

// ─── Component ────────────────────────────────────────────────────────────────

export const PixiEffectPicker: React.FC<PixiEffectPickerProps> = ({
  isOpen,
  onSelect,
  onClose,
  synthType,
}) => {
  const theme = usePixiTheme();
  const categoryHexColors = getCategoryHexColors(theme);
  const [filter, setFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExtendedCategory | 'all'>('all');

  const showFurnaceEffects = synthType ? hasFurnaceEffects(synthType) : false;

  // Collect all effects
  const allEffects = useMemo(() => {
    const effects: (EffectDescription & { key: string; isExtended: boolean; isFurnace: boolean })[] = [];

    Object.entries(FT2_EFFECT_DESCRIPTIONS).forEach(([key, desc]) => {
      effects.push({ ...desc, key, isExtended: false, isFurnace: false });
    });

    Object.entries(FT2_E_COMMAND_DESCRIPTIONS).forEach(([key, desc]) => {
      effects.push({ ...desc, key, isExtended: true, isFurnace: false });
    });

    if (showFurnaceEffects && synthType) {
      const furnaceEffects = getAllFurnaceEffects(synthType);
      furnaceEffects.forEach((desc) => {
        const hexCode = desc.command.substring(0, 2);
        effects.push({
          ...desc,
          key: hexCode,
          isExtended: false,
          isFurnace: true,
          category: 'misc' as EffectCategory,
        });
      });
    }

    return effects;
  }, [showFurnaceEffects, synthType]);

  // Filter effects
  const filtered = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    return allEffects.filter(eff => {
      if (selectedCategory === 'chip') {
        if (!eff.isFurnace) return false;
      } else if (selectedCategory !== 'all') {
        if (eff.isFurnace) return false;
        if (eff.category !== selectedCategory) return false;
      }
      if (!filter) return true;
      return (
        eff.name.toLowerCase().includes(lowerFilter) ||
        eff.command.toLowerCase().includes(lowerFilter) ||
        eff.description.toLowerCase().includes(lowerFilter)
      );
    });
  }, [allEffects, filter, selectedCategory]);

  const handleSelect = useCallback((eff: typeof allEffects[0]) => {
    if (eff.isExtended) {
      const subCmd = parseInt(eff.key.substring(1), 16);
      onSelect(14, subCmd << 4);
    } else if (eff.isFurnace) {
      const effTyp = parseInt(eff.key, 16);
      onSelect(effTyp, 0);
    } else {
      const effTyp = parseInt(eff.key, 16);
      onSelect(effTyp, 0);
    }
    onClose();
  }, [onSelect, onClose]);

  const contentHeight = filtered.length * ROW_HEIGHT;
  const [scrollY, setScrollY] = useState(0);
  const maxScrollY = Math.max(0, contentHeight - LIST_HEIGHT);

  const handleWheel = useCallback((e: { deltaY: number; stopPropagation: () => void }) => {
    e.stopPropagation();
    setScrollY(prev => Math.max(0, Math.min(maxScrollY, prev + (e.deltaY as number))));
  }, [maxScrollY]);

  if (!isOpen) return null;

  // Determine which rows are visible for virtual rendering
  const startIdx = Math.max(0, Math.floor(scrollY / ROW_HEIGHT) - 1);
  const endIdx = Math.min(filtered.length, Math.ceil((scrollY + LIST_HEIGHT) / ROW_HEIGHT) + 1);
  const visibleEffects = filtered.slice(startIdx, endIdx);

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_WIDTH} height={MODAL_HEIGHT}>
      <PixiModalHeader title="Effect Commands" onClose={onClose} width={MODAL_WIDTH} />

      {/* Search input */}
      <layoutContainer
        layout={{
          width: LIST_WIDTH,
          height: SEARCH_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 16,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiPureTextInput
          value={filter}
          onChange={setFilter}
          placeholder="Search effects..."
          width={LIST_WIDTH - 32}
          height={24}
          fontSize={11}
          font="sans"
        />
      </layoutContainer>

      {/* Category tabs */}
      <layoutContainer
        layout={{
          width: LIST_WIDTH,
          height: TABS_H,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 3,
          paddingLeft: 16,
          paddingRight: 16,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiButton
          label="All"
          variant="ghost"
          size="sm"
          active={selectedCategory === 'all'}
          onClick={() => setSelectedCategory('all')}
          height={20}
        />
        {CATEGORY_ORDER.map(cat => (
          <PixiButton
            key={cat}
            label={CATEGORY_LABELS[cat]}
            variant="ghost"
            size="sm"
            active={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
            height={20}
          />
        ))}
        {showFurnaceEffects && (
          <PixiButton
            label={`Chip${synthType ? ` (${synthType.replace('Furnace', '')})` : ''}`}
            variant="ghost"
            size="sm"
            active={selectedCategory === 'chip'}
            onClick={() => setSelectedCategory('chip')}
            height={20}
          />
        )}
      </layoutContainer>

      {/* Effect list */}
      <pixiContainer
        eventMode="static"
        onWheel={handleWheel}
        layout={{
          width: LIST_WIDTH,
          height: LIST_HEIGHT,
          overflow: 'hidden',
        }}
      >
        {filtered.length === 0 ? (
          <layoutContainer layout={{ width: LIST_WIDTH, height: LIST_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
            <PixiLabel text="No effects match" size="xs" color="textMuted" />
          </layoutContainer>
        ) : (
          <pixiContainer y={-scrollY + startIdx * ROW_HEIGHT}>
            {visibleEffects.map((eff, i) => {
              const colorClass = eff.isFurnace
                ? EXTENDED_CATEGORY_COLORS.chip
                : EXTENDED_CATEGORY_COLORS[eff.category];
              const hexColor = categoryHexColors[colorClass] ?? theme.textMuted.color;
              const tickLabel = eff.tick === 'tick-0' ? 'T0' : eff.tick === 'tick-N' ? 'TN' : 'T*';

              return (
                <layoutContainer
                  key={eff.isFurnace ? `f-${eff.key}` : eff.isExtended ? `e-${eff.key}` : `n-${eff.key}`}
                  eventMode="static"
                  cursor="pointer"
                  onPointerUp={() => handleSelect(eff)}
                  onClick={() => handleSelect(eff)}
                  layout={{
                    position: 'absolute',
                    top: (startIdx + i) * ROW_HEIGHT,
                    width: LIST_WIDTH,
                    height: ROW_HEIGHT,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingLeft: 16,
                    paddingRight: 16,
                    gap: 8,
                  }}
                >
                  {/* Command hex code */}
                  <pixiBitmapText
                    text={eff.command.substring(0, 3)}
                    style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 13, fill: hexColor }}
                    layout={{ width: 30 }}
                  />

                  {/* Name + description */}
                  <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 1 }}>
                    <pixiBitmapText
                      text={eff.name + (eff.isFurnace ? ' (Chip)' : '')}
                      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: theme.text.color }}
                      layout={{}}
                    />
                    <pixiBitmapText
                      text={eff.description.length > 50 ? eff.description.substring(0, 48) + '..' : eff.description}
                      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: theme.textMuted.color }}
                      layout={{}}
                    />
                  </layoutContainer>

                  {/* Tick indicator */}
                  <pixiBitmapText
                    text={tickLabel}
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: theme.textMuted.color }}
                    layout={{ width: 18 }}
                  />
                </layoutContainer>
              );
            })}
          </pixiContainer>
        )}
      </pixiContainer>
    </PixiModal>
  );
};
