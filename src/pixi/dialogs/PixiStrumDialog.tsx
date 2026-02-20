/**
 * PixiStrumDialog — Apply strum timing offset to selected notes.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiKnob, PixiLabel } from '../components';
import { useTrackerStore } from '@stores';

interface PixiStrumDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiStrumDialog: React.FC<PixiStrumDialogProps> = ({ isOpen, onClose }) => {
  const selection = useTrackerStore(s => s.selection);

  const [delay, setDelay] = useState(2);
  const [direction, setDirection] = useState<'down' | 'up'>('down');
  const hasSelection = selection != null;

  const handleApply = useCallback(() => {
    if (!hasSelection) return;
    // Strum action — will be wired to store action
    onClose();
  }, [hasSelection, delay, direction, onClose]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={260} height={220}>
      <PixiModalHeader title="Strum" onClose={onClose} />

      <pixiContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <PixiKnob
          value={delay}
          min={0}
          max={16}
          defaultValue={2}
          label="DELAY"
          size="md"
          formatValue={(v) => `${Math.round(v)} rows`}
          onChange={setDelay}
        />

        <pixiContainer layout={{ flexDirection: 'row', gap: 4 }}>
          <PixiButton
            label="Down"
            variant={direction === 'down' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setDirection('down')}
          />
          <PixiButton
            label="Up"
            variant={direction === 'up' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setDirection('up')}
          />
        </pixiContainer>

        {!hasSelection && (
          <PixiLabel text="Select a region first" size="xs" color="textMuted" />
        )}
      </pixiContainer>

      <PixiModalFooter>
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
        <PixiButton label="Apply" variant="primary" disabled={!hasSelection} onClick={handleApply} />
      </PixiModalFooter>
    </PixiModal>
  );
};
