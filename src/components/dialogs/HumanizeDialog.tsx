/**
 * HumanizeDialog - Dialog for adding random variations to a selection
 * Adds human feel by randomizing volume values
 */

import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTrackerStore } from '@stores';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';

interface HumanizeDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HumanizeDialog: React.FC<HumanizeDialogProps> = ({ isOpen, onClose }) => {
  const { selection, humanizeSelection } = useTrackerStore();
  const [volumeVariation, setVolumeVariation] = useState(15);

  const handleApply = () => {
    if (!selection) {
      alert('Please select a region first (Alt+Arrow keys to select)');
      return;
    }

    humanizeSelection(volumeVariation);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      theme="modern"
      backdropOpacity="medium"
      closeOnBackdropClick={true}
      closeOnEscape={true}
    >
      <ModalHeader
        title="Humanize Selection"
        icon={<Sparkles size={18} />}
        onClose={onClose}
        theme="modern"
      />

      {/* Body */}
      <div className="p-4 space-y-4">
        <p className="text-xs text-text-muted">
          Add random variation to volume values to create a more human feel.
        </p>

        {/* Volume variation slider */}
        <div>
          <label className="block text-xs text-text-muted mb-2">
            Volume Variation: <span className="text-accent-primary font-mono">{volumeVariation}%</span>
          </label>
          <input
            type="range"
            value={volumeVariation}
            onChange={(e) => setVolumeVariation(parseInt(e.target.value))}
            min={0}
            max={50}
            className="w-full accent-accent-primary"
          />
          <div className="flex justify-between text-xs text-text-muted mt-1">
            <span>0% (none)</span>
            <span>50% (max)</span>
          </div>
        </div>

        {/* Preview text */}
        <div className="bg-dark-bg rounded p-3 text-xs text-text-secondary">
          <p>Each note's volume will be randomly adjusted by up to ±{volumeVariation}% of its current value.</p>
        </div>

        {/* Selection info */}
        {!selection && (
          <p className="text-xs text-accent-warning">
            No selection active. Use Alt+Arrow keys to select a region.
          </p>
        )}
      </div>

      <ModalFooter theme="modern" align="right">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleApply}
          disabled={!selection}
        >
          Apply
        </Button>
      </ModalFooter>
    </Modal>
  );
};
