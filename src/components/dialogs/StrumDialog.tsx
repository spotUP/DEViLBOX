/**
 * StrumDialog - Apply strum/arpeggiate effect across channels
 * Adds incremental EDx (note delay) effects to create strumming
 */

import React, { useState } from 'react';
import { Music } from 'lucide-react';
import { useTrackerStore } from '@stores';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { useDialogKeyboard } from '@hooks/useDialogKeyboard';

interface StrumDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StrumDialog: React.FC<StrumDialogProps> = ({ isOpen, onClose }) => {
  const { selection, strumSelection } = useTrackerStore();
  const [tickDelay, setTickDelay] = useState(1);
  const [direction, setDirection] = useState<'up' | 'down'>('down');

  const handleApply = () => {
    if (!selection) {
      alert('Please select a region first (Alt+Arrow keys to select)');
      return;
    }

    strumSelection(tickDelay, direction);
    onClose();
  };

  // Enhanced keyboard controls
  const { shortcuts } = useDialogKeyboard({
    isOpen,
    onConfirm: handleApply,
    onCancel: onClose,
    confirmDisabled: !selection,
  });

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
        title="Strum / Arpeggiate"
        icon={<Music size={18} />}
        onClose={onClose}
        theme="modern"
      />

      <div className="p-4 space-y-4">
        <div className="text-xs text-text-secondary">
          Add incremental note delays (EDx) across channels to create a strum or arpeggio effect.
        </div>

        {/* Tick delay per channel */}
        <div>
          <label className="block text-xs text-text-muted mb-1">
            Ticks per channel (1-15)
          </label>
          <input
            type="number"
            value={tickDelay}
            onChange={(e) => setTickDelay(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
            min={1}
            max={15}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent-primary"
          />
        </div>

        {/* Direction */}
        <div>
          <label className="block text-xs text-text-muted mb-1">Direction</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDirection('down')}
              className={`px-3 py-2 text-xs rounded border transition-colors ${
                direction === 'down'
                  ? 'bg-accent-primary border-accent-primary text-white'
                  : 'bg-dark-bg border-dark-border text-text-secondary hover:border-text-muted'
              }`}
            >
              Down (left to right)
            </button>
            <button
              onClick={() => setDirection('up')}
              className={`px-3 py-2 text-xs rounded border transition-colors ${
                direction === 'up'
                  ? 'bg-accent-primary border-accent-primary text-white'
                  : 'bg-dark-bg border-dark-border text-text-secondary hover:border-text-muted'
              }`}
            >
              Up (right to left)
            </button>
          </div>
        </div>

        {!selection && (
          <p className="text-xs text-accent-warning">
            No selection active. Use Alt+Arrow keys to select a region.
          </p>
        )}
      </div>

      <ModalFooter theme="modern" align="right">
        <Button variant="ghost" onClick={onClose}>
          Cancel {shortcuts.cancel && <span className="text-xs opacity-70 ml-2">{shortcuts.cancel}</span>}
        </Button>
        <Button
          variant="primary"
          onClick={handleApply}
          disabled={!selection}
        >
          Apply {shortcuts.confirm && !selection ? null : shortcuts.confirm && <span className="text-xs opacity-70 ml-2">{shortcuts.confirm}</span>}
        </Button>
      </ModalFooter>
    </Modal>
  );
};
