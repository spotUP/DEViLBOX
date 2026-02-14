/**
 * InterpolateDialog - Dialog for interpolating values in a selection
 * Allows setting start/end values and column type for linear interpolation
 */

import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useTrackerStore } from '@stores';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { useDialogKeyboard } from '@hooks/useDialogKeyboard';

interface InterpolateDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type InterpolateColumn = 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan';
type InterpolateCurve = 'linear' | 'log' | 'exp' | 'scurve';

const COLUMN_OPTIONS: { value: InterpolateColumn; label: string; min: number; max: number }[] = [
  { value: 'volume', label: 'Volume', min: 0, max: 64 },
  { value: 'cutoff', label: 'Cutoff', min: 0, max: 127 },
  { value: 'resonance', label: 'Resonance', min: 0, max: 127 },
  { value: 'envMod', label: 'Env Mod', min: 0, max: 127 },
  { value: 'pan', label: 'Pan', min: -100, max: 100 },
];

const CURVE_OPTIONS: { value: InterpolateCurve; label: string; description: string }[] = [
  { value: 'linear', label: 'Linear', description: 'Constant rate of change' },
  { value: 'log', label: 'Logarithmic', description: 'Fast start, gradual end' },
  { value: 'exp', label: 'Exponential', description: 'Gradual start, fast end' },
  { value: 'scurve', label: 'S-Curve', description: 'Smooth ease in/out' },
];

export const InterpolateDialog: React.FC<InterpolateDialogProps> = ({ isOpen, onClose }) => {
  const { selection, interpolateSelection } = useTrackerStore();
  const [column, setColumn] = useState<InterpolateColumn>('volume');
  const [startValue, setStartValue] = useState(64);
  const [endValue, setEndValue] = useState(0);
  const [curve, setCurve] = useState<InterpolateCurve>('linear');

  const selectedColumnInfo = COLUMN_OPTIONS.find(c => c.value === column)!;

  const handleApply = () => {
    if (!selection) {
      alert('Please select a region first (Alt+Arrow keys to select)');
      return;
    }

    interpolateSelection(column, startValue, endValue, curve);
    onClose();
  };

  // Enhanced keyboard controls
  const { shortcuts } = useDialogKeyboard({
    isOpen,
    onConfirm: handleApply,
    onCancel: onClose,
    confirmDisabled: !selection,
  });

  const handleColumnChange = (newColumn: InterpolateColumn) => {
    setColumn(newColumn);
    const info = COLUMN_OPTIONS.find(c => c.value === newColumn)!;
    // Reset values to sensible defaults for the new column
    if (newColumn === 'pan') {
      setStartValue(-100);
      setEndValue(100);
    } else {
      setStartValue(info.max);
      setEndValue(0);
    }
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
        title="Interpolate Selection"
        icon={<TrendingUp size={18} />}
        onClose={onClose}
        theme="modern"
      />

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Column selector */}
        <div>
          <label className="block text-xs text-text-muted mb-1">Column</label>
          <select
            value={column}
            onChange={(e) => handleColumnChange(e.target.value as InterpolateColumn)}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary"
          >
            {COLUMN_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Start value */}
        <div>
          <label className="block text-xs text-text-muted mb-1">
            Start Value ({selectedColumnInfo.min} - {selectedColumnInfo.max})
          </label>
          <input
            type="number"
            value={startValue}
            onChange={(e) => setStartValue(Math.max(selectedColumnInfo.min, Math.min(selectedColumnInfo.max, parseInt(e.target.value) || 0)))}
            min={selectedColumnInfo.min}
            max={selectedColumnInfo.max}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent-primary"
          />
        </div>

        {/* End value */}
        <div>
          <label className="block text-xs text-text-muted mb-1">
            End Value ({selectedColumnInfo.min} - {selectedColumnInfo.max})
          </label>
          <input
            type="number"
            value={endValue}
            onChange={(e) => setEndValue(Math.max(selectedColumnInfo.min, Math.min(selectedColumnInfo.max, parseInt(e.target.value) || 0)))}
            min={selectedColumnInfo.min}
            max={selectedColumnInfo.max}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent-primary"
          />
        </div>

        {/* Curve type */}
        <div>
          <label className="block text-xs text-text-muted mb-1">Curve</label>
          <div className="grid grid-cols-4 gap-1">
            {CURVE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setCurve(opt.value)}
                className={`px-2 py-1.5 text-xs rounded border transition-colors ${
                  curve === opt.value
                    ? 'bg-accent-primary border-accent-primary text-white'
                    : 'bg-dark-bg border-dark-border text-text-secondary hover:border-text-muted'
                }`}
                title={opt.description}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            {CURVE_OPTIONS.find(c => c.value === curve)?.description}
          </p>
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
