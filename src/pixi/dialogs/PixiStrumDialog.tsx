/**
 * PixiStrumDialog — Apply strum timing offset to selected notes.
 * Matches DOM: src/components/dialogs/StrumDialog.tsx
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiNumericInput, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useTrackerStore, useCursorStore } from '@stores';

interface PixiStrumDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiStrumDialog: React.FC<PixiStrumDialogProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();
  const selection = useCursorStore(s => s.selection);
  const strumSelection = useTrackerStore(s => s.strumSelection);

  const [delay, setDelay] = useState(1);
  const [direction, setDirection] = useState<'down' | 'up'>('down');
  const hasSelection = selection != null;

  const handleApply = useCallback(() => {
    if (!hasSelection) return;
    strumSelection(Math.round(delay), direction);
    onClose();
  }, [hasSelection, delay, direction, strumSelection, onClose]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={340} height={300}>
      <PixiModalHeader title="Strum / Arpeggiate" onClose={onClose} />

      {/* Body — matches DOM p-4 space-y-4 (padding:16, gap:16) */}
      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 16 }}>
        {/* Description — matches DOM text-xs text-text-secondary */}
        <PixiLabel
          text="Add incremental note delays (EDx) across channels to create a strum or arpeggio effect."
          size="xs"
          color="textSecondary"
          font="sans"
        />

        {/* Tick delay — matches DOM number input with label */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <PixiLabel text="Ticks per channel (1-15)" size="xs" color="textMuted" font="sans" />
          <PixiNumericInput
            value={delay}
            min={1}
            max={15}
            onChange={setDelay}
            width={60}
          />
        </layoutContainer>

        {/* Direction — matches DOM grid-cols-2 button row */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <PixiLabel text="Direction" size="xs" color="textMuted" font="sans" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
            <PixiButton
              label="Down (left to right)"
              variant={direction === 'down' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setDirection('down')}
            />
            <PixiButton
              label="Up (right to left)"
              variant={direction === 'up' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setDirection('up')}
            />
          </layoutContainer>
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
