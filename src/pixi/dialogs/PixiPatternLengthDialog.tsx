/**
 * PixiPatternLengthDialog — Set pattern length via Ctrl+Shift+L shortcut.
 * Quick-access preset buttons + numeric input for custom length.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiNumericInput, PixiLabel } from '../components';
import { useTrackerStore } from '@stores';
import { useUIStore } from '@stores';

interface PixiPatternLengthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESETS = [16, 32, 48, 64, 96, 128, 192, 256];

export const PixiPatternLengthDialog: React.FC<PixiPatternLengthDialogProps> = ({ isOpen, onClose }) => {
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const currentLength = useTrackerStore(s => s.patterns[s.currentPatternIndex]?.length ?? 64);
  const resizePattern = useTrackerStore(s => s.resizePattern);

  const [length, setLength] = useState(currentLength);

  const handleApply = useCallback(() => {
    resizePattern(currentPatternIndex, length);
    useUIStore.getState().setStatusMessage(`Pattern length: ${length} rows`, false, 1000);
    onClose();
  }, [currentPatternIndex, length, resizePattern, onClose]);

  const handlePreset = useCallback((preset: number) => {
    setLength(preset);
    resizePattern(currentPatternIndex, preset);
    useUIStore.getState().setStatusMessage(`Pattern length: ${preset} rows`, false, 1000);
    onClose();
  }, [currentPatternIndex, resizePattern, onClose]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={320} height={260}>
      <PixiModalHeader title="Pattern Length" onClose={onClose} />

      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 12 }}>
        <PixiLabel
          text={`Current: ${currentLength} rows`}
          size="xs"
          color="textMuted"
          font="sans"
        />

        {/* Preset buttons — 2 rows of 4 */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            {PRESETS.slice(0, 4).map(p => (
              <PixiButton
                key={p}
                label={String(p)}
                variant={p === currentLength ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => handlePreset(p)}
              />
            ))}
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            {PRESETS.slice(4).map(p => (
              <PixiButton
                key={p}
                label={String(p)}
                variant={p === currentLength ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => handlePreset(p)}
              />
            ))}
          </layoutContainer>
        </layoutContainer>

        {/* Custom length input */}
        <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <PixiLabel text="Custom:" size="sm" color="text" font="sans" />
          <PixiNumericInput
            value={length}
            min={1}
            max={256}
            label=""
            onChange={setLength}
            width={60}
          />
          <PixiLabel text="rows" size="xs" color="textMuted" font="sans" />
        </layoutContainer>
      </layoutContainer>

      <PixiModalFooter>
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
        <PixiButton label="Apply" variant="primary" onClick={handleApply} />
      </PixiModalFooter>
    </PixiModal>
  );
};
