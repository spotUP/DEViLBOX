/**
 * PixiInterpolateDialog — Interpolate values across selection.
 * Matches DOM: src/components/dialogs/InterpolateDialog.tsx
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiNumericInput, PixiSelect, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useTrackerStore, useCursorStore } from '@stores';
import type { SelectOption } from '../components';

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
  { id: 'pan', label: 'Pan', min: -100, max: 100 },
];

const COLUMN_OPTIONS: SelectOption[] = COLUMNS.map(c => ({ value: c.id, label: c.label }));

const CURVES: { id: CurveType; label: string; description: string }[] = [
  { id: 'linear', label: 'Linear', description: 'Constant rate of change' },
  { id: 'log', label: 'Logarithmic', description: 'Fast start, gradual end' },
  { id: 'exp', label: 'Exponential', description: 'Gradual start, fast end' },
  { id: 'scurve', label: 'S-Curve', description: 'Smooth ease in/out' },
];

export const PixiInterpolateDialog: React.FC<PixiInterpolateDialogProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();
  const selection = useCursorStore(s => s.selection);
  const interpolateSelection = useTrackerStore(s => s.interpolateSelection);

  const [column, setColumn] = useState<InterpolateColumn>('volume');
  const [startValue, setStartValue] = useState(64);
  const [endValue, setEndValue] = useState(0);
  const [curve, setCurve] = useState<CurveType>('linear');

  const colConfig = COLUMNS.find(c => c.id === column)!;
  const hasSelection = selection != null;

  const handleColumnChange = useCallback((newColumn: string) => {
    const col = newColumn as InterpolateColumn;
    setColumn(col);
    const info = COLUMNS.find(c => c.id === col)!;
    if (col === 'pan') {
      setStartValue(-100);
      setEndValue(100);
    } else {
      setStartValue(info.max);
      setEndValue(0);
    }
  }, []);

  const handleApply = useCallback(() => {
    if (!hasSelection) return;
    interpolateSelection?.(column, startValue, endValue, curve);
    onClose();
  }, [hasSelection, interpolateSelection, column, startValue, endValue, curve, onClose]);

  if (!isOpen) return null;

  const curveDesc = CURVES.find(c => c.id === curve)?.description ?? '';

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={340} height={380}>
      <PixiModalHeader title="Interpolate Selection" onClose={onClose} />

      {/* Body — matches DOM p-4 space-y-4 (padding:16, gap:16) */}
      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 16 }}>
        {/* Column selector — matches DOM select */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <PixiLabel text="Column" size="xs" color="textMuted" font="sans" />
          <PixiSelect
            options={COLUMN_OPTIONS}
            value={column}
            onChange={handleColumnChange}
            width={308}
          />
        </layoutContainer>

        {/* Start value — matches DOM number input */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <pixiBitmapText
            text={`Start Value (${colConfig.min} - ${colConfig.max})`}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
          <PixiNumericInput
            value={startValue}
            min={colConfig.min}
            max={colConfig.max}
            onChange={setStartValue}
            width={60}
          />
        </layoutContainer>

        {/* End value — matches DOM number input */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <pixiBitmapText
            text={`End Value (${colConfig.min} - ${colConfig.max})`}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
          <PixiNumericInput
            value={endValue}
            min={colConfig.min}
            max={colConfig.max}
            onChange={setEndValue}
            width={60}
          />
        </layoutContainer>

        {/* Curve type — matches DOM grid-cols-4 button grid */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <PixiLabel text="Curve" size="xs" color="textMuted" font="sans" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            {CURVES.map(c => (
              <PixiButton
                key={c.id}
                label={c.label}
                variant={curve === c.id ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setCurve(c.id)}
              />
            ))}
          </layoutContainer>
          <PixiLabel text={curveDesc} size="xs" color="textMuted" font="sans" />
        </layoutContainer>

        {/* Selection warning */}
        {!hasSelection && (
          <PixiLabel text="No selection active. Use Alt+Arrow keys to select a region." size="xs" color="warning" font="sans" />
        )}
      </layoutContainer>

      <PixiModalFooter align="right">
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
        <PixiButton label="Apply" variant="primary" disabled={!hasSelection} onClick={handleApply} />
      </PixiModalFooter>
    </PixiModal>
  );
};
