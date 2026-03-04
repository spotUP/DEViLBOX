/**
 * PixiAdvancedEditModal — GL-native FT2 Advanced Editing Tools dialog.
 * Accordion sections: Volume ops, Block ops, Instrument remap, Export, Help, Macros.
 * GL port of src/components/dialogs/AdvancedEditModal.tsx
 */

import React, { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiButton, PixiLabel, PixiNumericInput } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useCursorStore } from '@stores';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PixiAdvancedEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowScaleVolume?: (scope: 'block' | 'track' | 'pattern') => void;
  onShowFadeVolume?: (scope: 'block' | 'track' | 'pattern') => void;
  onShowRemapInstrument?: (scope: 'block' | 'track' | 'pattern' | 'song') => void;
  onExportPattern?: () => void;
  onExportTrack?: () => void;
  onReverse?: () => void;
  onExpand?: () => void;
  onShrink?: () => void;
  onDuplicate?: () => void;
  onMath?: (op: 'add' | 'sub' | 'mul' | 'div', value: number, column: 'volume' | 'eff') => void;
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  id: string;
  expanded: boolean;
  onToggle: () => void;
  width: number;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, id: _id, expanded, onToggle, width, children }) => {
  const theme = usePixiTheme();

  return (
    <layoutContainer
      layout={{
        width: width - 32,
        flexDirection: 'column',
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      {/* Section header — DOM: px-3 py-2, text-sm font-medium */}
      <layoutContainer
        eventMode="static"
        cursor="pointer"
        onPointerUp={onToggle}
        onClick={onToggle}
        layout={{
          width: width - 34,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <pixiBitmapText
          text={title}
          style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 16, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />
        <pixiBitmapText
          text={expanded ? '\u25BC' : '\u25B6'}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
      </layoutContainer>

      {/* Section content — DOM: p-3 space-y-2 */}
      {expanded && (
        <layoutContainer
          layout={{
            width: width - 34,
            flexDirection: 'column',
            padding: 12,
            gap: 8,
            backgroundColor: theme.bgSecondary.color,
          }}
        >
          {children}
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

// ─── Button Row Helper ────────────────────────────────────────────────────────

const BTN_W = 120;
const BTN_H = 24;

// ─── Main Component ───────────────────────────────────────────────────────────

const MODAL_W = 600;
const MODAL_H = 500;

export const PixiAdvancedEditModal: React.FC<PixiAdvancedEditModalProps> = ({
  isOpen,
  onClose,
  onShowScaleVolume,
  onShowFadeVolume,
  onShowRemapInstrument,
  onExportPattern,
  onExportTrack,
  onReverse,
  onExpand,
  onShrink,
  onDuplicate,
  onMath,
}) => {
  const theme = usePixiTheme();
  const selection = useCursorStore((s) => s.selection);
  const [expandedSection, setExpandedSection] = useState<string | null>('volume');
  const [mathValue, setMathValue] = useState(1);
  const [mathColumn, setMathColumn] = useState<'volume' | 'eff'>('volume');

  const hasSelection = selection !== null;

  const toggleSection = useCallback((section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  }, []);

  const toggleMathColumn = useCallback(() => {
    setMathColumn((prev) => (prev === 'volume' ? 'eff' : 'volume'));
  }, []);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="FT2 Advanced Edit" width={MODAL_W} onClose={onClose} />

      {/* Scrollable body — DOM: p-4 space-y-4 */}
      <layoutContainer
        layout={{
          flex: 1,
          width: MODAL_W,
          padding: 16,
          flexDirection: 'column',
          gap: 16,
          overflow: 'scroll',
        }}
      >
        {/* ── Volume Operations ─────────────────────────────────────── */}
        <Section
          title="Volume Operations"
          id="volume"
          expanded={expandedSection === 'volume'}
          onToggle={() => toggleSection('volume')}
          width={MODAL_W}
        >
          <PixiLabel text="Transform volume values across selection, track, or pattern" size="xs" color="textMuted" />

          {/* Row 1: Scale Block / Fade Block */}
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <PixiButton label="Scale Block" variant="ft2" color="blue" size="sm" width={BTN_W} height={BTN_H}
              disabled={!hasSelection} onClick={() => onShowScaleVolume?.('block')} />
            <PixiButton label="Fade Block" variant="ft2" color="blue" size="sm" width={BTN_W} height={BTN_H}
              disabled={!hasSelection} onClick={() => onShowFadeVolume?.('block')} />
          </layoutContainer>

          {/* Row 2: Scale Track / Fade Track */}
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <PixiButton label="Scale Track" variant="ft2" color="blue" size="sm" width={BTN_W} height={BTN_H}
              onClick={() => onShowScaleVolume?.('track')} />
            <PixiButton label="Fade Track" variant="ft2" color="blue" size="sm" width={BTN_W} height={BTN_H}
              onClick={() => onShowFadeVolume?.('track')} />
          </layoutContainer>

          {/* Row 3: Scale Pattern / Fade Pattern */}
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <PixiButton label="Scale Pattern" variant="ft2" color="blue" size="sm" width={BTN_W} height={BTN_H}
              onClick={() => onShowScaleVolume?.('pattern')} />
            <PixiButton label="Fade Pattern" variant="ft2" color="blue" size="sm" width={BTN_W} height={BTN_H}
              onClick={() => onShowFadeVolume?.('pattern')} />
          </layoutContainer>
        </Section>

        {/* ── Block Operations ──────────────────────────────────────── */}
        <Section
          title="Block Operations"
          id="blockops"
          expanded={expandedSection === 'blockops'}
          onToggle={() => toggleSection('blockops')}
          width={MODAL_W}
        >
          <PixiLabel text="Transform selected block content" size="xs" color="textMuted" />

          <layoutContainer layout={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <PixiButton label="Reverse" variant="ft2" color="yellow" size="sm" width={BTN_W} height={BTN_H}
              disabled={!hasSelection} onClick={() => onReverse?.()} />
            <PixiButton label="Duplicate" variant="ft2" color="yellow" size="sm" width={BTN_W} height={BTN_H}
              disabled={!hasSelection} onClick={() => onDuplicate?.()} />
          </layoutContainer>

          <layoutContainer layout={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <PixiButton label="Expand 2x" variant="ft2" color="yellow" size="sm" width={BTN_W} height={BTN_H}
              disabled={!hasSelection} onClick={() => onExpand?.()} />
            <PixiButton label="Shrink 2x" variant="ft2" color="yellow" size="sm" width={BTN_W} height={BTN_H}
              disabled={!hasSelection} onClick={() => onShrink?.()} />
          </layoutContainer>

          {/* Math Operations sub-section — DOM: mt-3 pt-2 border-t */}
          <layoutContainer layout={{ flexDirection: 'column', gap: 8, marginTop: 12, borderTopWidth: 1, borderColor: theme.border.color, paddingTop: 8 }}>
            <PixiLabel text="Math Operations" size="xs" color="textMuted" />

            <layoutContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <PixiButton
                label={mathColumn === 'volume' ? 'Volume' : 'Effect'}
                variant="ft2"
                size="sm"
                width={70}
                height={BTN_H}
                onClick={toggleMathColumn}
              />
              <PixiNumericInput
                value={mathValue}
                min={0}
                max={255}
                step={1}
                onChange={setMathValue}
                width={60}
              />
            </layoutContainer>

            <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
              <PixiButton label="+" variant="ft2" color="green" size="sm" width={50} height={BTN_H}
                disabled={!hasSelection} onClick={() => onMath?.('add', mathValue, mathColumn)} />
              <PixiButton label="\u2212" variant="ft2" color="green" size="sm" width={50} height={BTN_H}
                disabled={!hasSelection} onClick={() => onMath?.('sub', mathValue, mathColumn)} />
              <PixiButton label="\u00D7" variant="ft2" color="green" size="sm" width={50} height={BTN_H}
                disabled={!hasSelection} onClick={() => onMath?.('mul', mathValue, mathColumn)} />
              <PixiButton label="\u00F7" variant="ft2" color="green" size="sm" width={50} height={BTN_H}
                disabled={!hasSelection} onClick={() => onMath?.('div', mathValue, mathColumn)} />
            </layoutContainer>
          </layoutContainer>

          <PixiLabel text="Alt+R = Reverse | Alt+D = Duplicate" size="xs" color="textMuted" />
        </Section>

        {/* ── Instrument Remap ──────────────────────────────────────── */}
        <Section
          title="Instrument Remap"
          id="remap"
          expanded={expandedSection === 'remap'}
          onToggle={() => toggleSection('remap')}
          width={MODAL_W}
        >
          <PixiLabel text="Find and replace instrument IDs" size="xs" color="textMuted" />

          <layoutContainer layout={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <PixiButton label="Remap Block" variant="ft2" color="purple" size="sm" width={BTN_W} height={BTN_H}
              disabled={!hasSelection} onClick={() => onShowRemapInstrument?.('block')} />
            <PixiButton label="Remap Track" variant="ft2" color="purple" size="sm" width={BTN_W} height={BTN_H}
              onClick={() => onShowRemapInstrument?.('track')} />
          </layoutContainer>

          <layoutContainer layout={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <PixiButton label="Remap Pattern" variant="ft2" color="purple" size="sm" width={BTN_W} height={BTN_H}
              onClick={() => onShowRemapInstrument?.('pattern')} />
            <PixiButton label="Remap Song" variant="ft2" color="purple" size="sm" width={BTN_W} height={BTN_H}
              onClick={() => onShowRemapInstrument?.('song')} />
          </layoutContainer>
        </Section>

        {/* ── Export/Import ─────────────────────────────────────────── */}
        <Section
          title="Export/Import"
          id="export"
          expanded={expandedSection === 'export'}
          onToggle={() => toggleSection('export')}
          width={MODAL_W}
        >
          <PixiLabel text="Export patterns and tracks as FT2-compatible files" size="xs" color="textMuted" />

          <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
            <PixiButton label="Pattern (.xp)" variant="ft2" color="green" size="sm" width={BTN_W} height={BTN_H}
              onClick={() => onExportPattern?.()} />
            <PixiButton label="Track (.xt)" variant="ft2" color="green" size="sm" width={BTN_W} height={BTN_H}
              onClick={() => onExportTrack?.()} />
          </layoutContainer>

          <PixiLabel text="Import: Use File > Open Module" size="xs" color="textMuted" />
        </Section>

        {/* ── Help & Reference ──────────────────────────────────────── */}
        <Section
          title="Help & Reference"
          id="help"
          expanded={expandedSection === 'help'}
          onToggle={() => toggleSection('help')}
          width={MODAL_W}
        >
          <PixiLabel text="Quick access to command references and documentation" size="xs" color="textMuted" />

          <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
            <PixiButton label="Full Reference (?)" variant="default" size="sm" width={140} height={BTN_H}
              onClick={() => {
                onClose();
                window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
              }}
            />
            <PixiButton label="Chip Reference" variant="ft2" color="red" size="sm" width={140} height={BTN_H}
              onClick={() => {
                onClose();
                window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true }));
              }}
            />
          </layoutContainer>
        </Section>

        {/* ── Macro Slots ───────────────────────────────────────────── */}
        <Section
          title="Macro Slots"
          id="macros"
          expanded={expandedSection === 'macros'}
          onToggle={() => toggleSection('macros')}
          width={MODAL_W}
        >
          <PixiLabel text="Ctrl+1-8 to recall, Ctrl+Shift+1-8 to save" size="sm" color="textSecondary" />
        </Section>
      </layoutContainer>
    </PixiModal>
  );
};
