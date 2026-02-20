/**
 * PixiHumanizeDialog — Randomly adjust note volumes within a range.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiKnob, PixiLabel } from '../components';
import { useTrackerStore } from '@stores';

interface PixiHumanizeDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiHumanizeDialog: React.FC<PixiHumanizeDialogProps> = ({ isOpen, onClose }) => {
  const selection = useTrackerStore(s => s.selection);
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
    <PixiModal isOpen={isOpen} onClose={onClose} width={280} height={220}>
      <PixiModalHeader title="Humanize" onClose={onClose} />

      <pixiContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <PixiKnob
          value={variation}
          min={0}
          max={50}
          defaultValue={15}
          label="VARIATION"
          size="md"
          formatValue={(v) => `±${Math.round(v)}%`}
          onChange={setVariation}
        />

        <PixiLabel
          text={`Each note volume adjusted by up to ±${Math.round(variation)}%`}
          size="xs"
          color="textMuted"
        />

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
