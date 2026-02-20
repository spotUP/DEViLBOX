/**
 * PixiFadeVolumeDialog — Fade volume in/out across selection.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiNumericInput, PixiLabel } from '../components';
import { useTrackerStore } from '@stores';

interface PixiFadeVolumeDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiFadeVolumeDialog: React.FC<PixiFadeVolumeDialogProps> = ({ isOpen, onClose }) => {
  const selection = useTrackerStore(s => s.selection);

  const [startVol, setStartVol] = useState(64);
  const [endVol, setEndVol] = useState(0);
  const hasSelection = selection != null;

  const handleApply = useCallback(() => {
    if (!hasSelection) return;
    // Fade volume action — will be wired to store action
    onClose();
  }, [hasSelection, startVol, endVol, onClose]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={280} height={200}>
      <PixiModalHeader title="Fade Volume" onClose={onClose} />

      <pixiContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 12 }}>
        <pixiContainer layout={{ flexDirection: 'row', gap: 16 }}>
          <PixiNumericInput
            value={startVol}
            min={0}
            max={64}
            label="Start"
            onChange={setStartVol}
            width={50}
          />
          <PixiNumericInput
            value={endVol}
            min={0}
            max={64}
            label="End"
            onChange={setEndVol}
            width={50}
          />
        </pixiContainer>

        <pixiContainer layout={{ flexDirection: 'row', gap: 4 }}>
          <PixiButton label="Fade In" variant="ghost" size="sm" onClick={() => { setStartVol(0); setEndVol(64); }} />
          <PixiButton label="Fade Out" variant="ghost" size="sm" onClick={() => { setStartVol(64); setEndVol(0); }} />
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
