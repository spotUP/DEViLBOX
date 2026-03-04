/**
 * PixiScaleVolumeDialog — Scale volume of selected notes by a percentage.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiKnob, PixiLabel } from '../components';
import { useCursorStore } from '@stores';

interface PixiScaleVolumeDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiScaleVolumeDialog: React.FC<PixiScaleVolumeDialogProps> = ({ isOpen, onClose }) => {
  const selection = useCursorStore(s => s.selection);

  const [scale, setScale] = useState(100);
  const hasSelection = selection != null;

  const handleApply = useCallback(() => {
    if (!hasSelection) return;
    // Scale volume action — will be wired to store action
    onClose();
  }, [hasSelection, scale, onClose]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={260} height={200}>
      <PixiModalHeader title="Scale Volume" onClose={onClose} />

      <layoutContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <PixiKnob
          value={scale}
          min={0}
          max={200}
          defaultValue={100}
          label="SCALE %"
          size="md"
          formatValue={(v) => `${Math.round(v)}%`}
          onChange={setScale}
        />

        {!hasSelection && (
          <PixiLabel text="Select a region first" size="xs" color="textMuted" />
        )}
      </layoutContainer>

      <PixiModalFooter>
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
        <PixiButton label="Apply" variant="primary" disabled={!hasSelection} onClick={handleApply} />
      </PixiModalFooter>
    </PixiModal>
  );
};
