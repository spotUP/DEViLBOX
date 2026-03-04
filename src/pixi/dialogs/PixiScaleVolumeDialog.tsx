/**
 * PixiScaleVolumeDialog — Scale volume of selected notes by a percentage.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiKnob, PixiLabel } from '../components';
import { useTrackerStore, useCursorStore } from '@stores';

interface PixiScaleVolumeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  scope?: 'block' | 'track' | 'pattern';
}

export const PixiScaleVolumeDialog: React.FC<PixiScaleVolumeDialogProps> = ({ isOpen, onClose, scope = 'block' }) => {
  const selection = useCursorStore(s => s.selection);
  const scaleVolume = useTrackerStore(s => s.scaleVolume);

  const [scale, setScale] = useState(100);
  const hasSelection = selection != null;

  const handleApply = useCallback(() => {
    if (!hasSelection) return;
    scaleVolume(scope, scale / 100);
    onClose();
  }, [hasSelection, scale, scope, scaleVolume, onClose]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={260} height={200}>
      <PixiModalHeader title="Scale Volume" onClose={onClose} />

      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 12, alignItems: 'center' }}>
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
