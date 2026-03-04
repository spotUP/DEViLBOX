/**
 * PixiHumanizeDialog — Randomly adjust note volumes within a range.
 * Matches DOM: src/components/dialogs/HumanizeDialog.tsx
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiSlider, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useTrackerStore, useCursorStore } from '@stores';

interface PixiHumanizeDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiHumanizeDialog: React.FC<PixiHumanizeDialogProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();
  const selection = useCursorStore(s => s.selection);
  const humanizeSelection = useTrackerStore(s => s.humanizeSelection);

  const [variation, setVariation] = useState(15);
  const hasSelection = selection != null;

  const handleApply = useCallback(() => {
    if (!hasSelection) return;
    humanizeSelection?.(variation);
    onClose();
  }, [hasSelection, humanizeSelection, variation, onClose]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={340} height={280}>
      <PixiModalHeader title="Humanize Selection" onClose={onClose} />

      {/* Body — matches DOM p-4 space-y-4 (padding:16, gap:16) */}
      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 16 }}>
        {/* Description — matches DOM text-xs text-text-muted */}
        <PixiLabel
          text="Add random variation to volume values to create a more human feel."
          size="xs"
          color="textMuted"
          font="sans"
        />

        {/* Volume variation slider — matches DOM slider + label */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <pixiBitmapText
              text="Volume Variation: "
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
            <pixiBitmapText
              text={`${variation}%`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
              tint={theme.accent.color}
              layout={{}}
            />
          </layoutContainer>
          <PixiSlider
            value={variation}
            min={0}
            max={50}
            onChange={setVariation}
            orientation="horizontal"
            length={308}
            handleWidth={16}
            handleHeight={16}
            thickness={6}
          />
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', width: 308 }}>
            <PixiLabel text="0% (none)" size="xs" color="textMuted" font="sans" />
            <PixiLabel text="50% (max)" size="xs" color="textMuted" font="sans" />
          </layoutContainer>
        </layoutContainer>

        {/* Preview box — matches DOM bg-dark-bg rounded p-3 */}
        <layoutContainer
          layout={{
            padding: 12,
            borderRadius: 6,
            backgroundColor: theme.bg.color,
          }}
        >
          <PixiLabel
            text={`Each note's volume will be randomly adjusted by up to ±${variation}% of its current value.`}
            size="xs"
            color="textSecondary"
            font="sans"
          />
        </layoutContainer>

        {/* Selection warning — matches DOM text-xs text-accent-warning */}
        {!hasSelection && (
          <PixiLabel text="No selection active. Use Alt+Arrow keys to select a region." size="xs" color="warning" font="sans" />
        )}
      </layoutContainer>

      <PixiModalFooter align="right">
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
        <PixiButton label="Apply" variant="primary" disabled={!hasSelection} onClick={handleApply} />
      </PixiModalFooter>
    </PixiModal>
  );
};
