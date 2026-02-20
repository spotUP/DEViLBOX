/**
 * PixiInterpolateDialog — Interpolate values across selection.
 * Controls: column selector, start/end values, curve type.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiNumericInput, PixiLabel } from '../components';
import { useTrackerStore } from '@stores';

interface PixiInterpolateDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type InterpolateColumn = 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan';
type CurveType = 'linear' | 'log' | 'exp' | 'scurve';

const COLUMNS: { id: InterpolateColumn; label: string; min: number; max: number }[] = [
  { id: 'volume', label: 'Volume', min: 0, max: 64 },
  { id: 'cutoff', label: 'Cutoff', min: 0, max: 127 },
  { id: 'resonance', label: 'Resonance', min: 0, max: 127 },
  { id: 'envMod', label: 'Env Mod', min: 0, max: 127 },
  { id: 'pan', label: 'Pan', min: 0, max: 255 },
];

const CURVES: { id: CurveType; label: string }[] = [
  { id: 'linear', label: 'LIN' },
  { id: 'log', label: 'LOG' },
  { id: 'exp', label: 'EXP' },
  { id: 'scurve', label: 'S' },
];

export const PixiInterpolateDialog: React.FC<PixiInterpolateDialogProps> = ({ isOpen, onClose }) => {
  const selection = useTrackerStore(s => s.selection);
  const interpolateSelection = useTrackerStore(s => s.interpolateSelection);

  const [column, setColumn] = useState<InterpolateColumn>('volume');
  const [startValue, setStartValue] = useState(0);
  const [endValue, setEndValue] = useState(64);
  const [curve, setCurve] = useState<CurveType>('linear');

  const colConfig = COLUMNS.find(c => c.id === column)!;
  const hasSelection = selection != null;

  const handleApply = useCallback(() => {
    if (!hasSelection) return;
    interpolateSelection?.(column, startValue, endValue, curve);
    onClose();
  }, [hasSelection, interpolateSelection, column, startValue, endValue, curve, onClose]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={320} height={280}>
      <PixiModalHeader title="Interpolate" onClose={onClose} />

      <pixiContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 10 }}>
        {/* Column selector */}
        <pixiContainer layout={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
          {COLUMNS.map(col => (
            <PixiButton
              key={col.id}
              label={col.label}
              variant={column === col.id ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => {
                setColumn(col.id);
                setStartValue(col.min);
                setEndValue(col.max);
              }}
            />
          ))}
        </pixiContainer>

        {/* Start / End values */}
        <pixiContainer layout={{ flexDirection: 'row', gap: 16 }}>
          <PixiNumericInput
            value={startValue}
            min={colConfig.min}
            max={colConfig.max}
            label="Start"
            onChange={setStartValue}
            width={50}
          />
          <PixiNumericInput
            value={endValue}
            min={colConfig.min}
            max={colConfig.max}
            label="End"
            onChange={setEndValue}
            width={50}
          />
        </pixiContainer>

        {/* Curve type */}
        <pixiContainer layout={{ flexDirection: 'row', gap: 4 }}>
          {CURVES.map(c => (
            <PixiButton
              key={c.id}
              label={c.label}
              variant={curve === c.id ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setCurve(c.id)}
            />
          ))}
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
