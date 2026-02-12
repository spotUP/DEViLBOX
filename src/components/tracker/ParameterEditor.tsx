/**
 * ParameterEditor - Visual Pattern Parameter Editor (OpenMPT-style)
 *
 * Graphical effect editing with:
 * - Vertical bars for effect values across rows
 * - Click+drag to paint values
 * - Right-click for single-row precision
 * - Support for volume, effect parameters, and custom ranges
 */

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useTrackerStore, useUIStore } from '@stores';
import { Button } from '@components/ui/Button';
import { X, RotateCcw, Wand2, ArrowUpDown } from 'lucide-react';
import type { TrackerCell } from '@typedefs';

type ParameterField = 'volume' | 'effect' | 'effectParam' | 'note' | 'instrument';
type EditMode = 'overwrite' | 'fill_blanks' | 'add' | 'scale';

interface ParameterEditorProps {
  onClose: () => void;
  channelIndex: number;
  startRow: number;
  endRow: number;
  field: ParameterField;
}

// Effect type presets for common patterns
const EFFECT_PRESETS = {
  volume: {
    label: 'Volume',
    min: 0,
    max: 64,
    default: 64,
    color: '#22c55e', // green
    format: (v: number) => v.toString(16).toUpperCase().padStart(2, '0'),
  },
  effectParam: {
    label: 'Effect Parameter',
    min: 0,
    max: 255,
    default: 0,
    color: '#f59e0b', // amber
    format: (v: number) => v.toString(16).toUpperCase().padStart(2, '0'),
  },
  effect: {
    label: 'Effect Type',
    min: 0,
    max: 35, // 0-9, A-Z
    default: 0,
    color: '#8b5cf6', // purple
    format: (v: number) => (v < 10 ? v.toString() : String.fromCharCode(55 + v)),
  },
  note: {
    label: 'Note',
    min: 0,
    max: 119, // C-0 to B-9
    default: 48, // C-4
    color: '#3b82f6', // blue
    format: (v: number) => {
      const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
      const octave = Math.floor(v / 12);
      const note = notes[v % 12];
      return `${note}${octave}`;
    },
  },
  instrument: {
    label: 'Instrument',
    min: 0,
    max: 99,
    default: 1,
    color: '#ec4899', // pink
    format: (v: number) => v.toString().padStart(2, '0'),
  },
};

export const ParameterEditor: React.FC<ParameterEditorProps> = ({
  onClose,
  channelIndex,
  startRow,
  endRow,
  field,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const patterns = useTrackerStore((state) => state.patterns);
  const currentPatternIndex = useTrackerStore((state) => state.currentPatternIndex);
  const setCell = useTrackerStore((state) => state.setCell);

  const preset = EFFECT_PRESETS[field];
  const rowCount = endRow - startRow + 1;

  const [isDragging, setIsDragging] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('overwrite');
  const [previewValues, setPreviewValues] = useState<number[] | null>(null);
  const useHexNumbers = useUIStore((state) => state.useHexNumbers);

  // Extract values from pattern data (memoized, recomputed when source data changes)
  const patternValues = useMemo(() => {
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return [];

    const channel = pattern.channels[channelIndex];
    if (!channel) return [];

    const result: number[] = [];
    for (let row = startRow; row <= endRow; row++) {
      const cell = channel.rows[row];
      if (!cell) {
        result.push(preset.default);
        continue;
      }

      let value = preset.default;
      switch (field) {
        case 'volume':
          value = cell.volume ?? preset.default;
          break;
        case 'effect':
          if (cell.effect && cell.effect !== '...') {
            value = parseInt(cell.effect[0], 16) || 0;
          }
          break;
        case 'effectParam':
          if (cell.effect && cell.effect !== '...' && cell.effect.length >= 3) {
            value = parseInt(cell.effect.substring(1), 16) || 0;
          }
          break;
        case 'note':
          if (cell.note && cell.note !== 0) {
            value = cell.note;
          }
          break;
        case 'instrument':
          value = cell.instrument ?? preset.default;
          break;
      }
      result.push(value);
    }
    return result;
  }, [patterns, currentPatternIndex, channelIndex, startRow, endRow, field, preset.default]);

  // Local editing state. Tracks pattern source identity to detect when to reinitialize.
  const [values, setValues] = useState<number[]>(patternValues);
  const [lastPatternKey, setLastPatternKey] = useState(() =>
    `${currentPatternIndex}-${channelIndex}-${startRow}-${endRow}-${field}`
  );

  // Detect when we should reinitialize from pattern data
  const patternKey = `${currentPatternIndex}-${channelIndex}-${startRow}-${endRow}-${field}`;
  if (patternKey !== lastPatternKey) {
    setLastPatternKey(patternKey);
    setValues(patternValues);
  }

  // Canvas dimensions
  const BAR_WIDTH = 12;
  const BAR_GAP = 2;
  const PADDING = 20;
  const canvasWidth = Math.max(400, rowCount * (BAR_WIDTH + BAR_GAP) + PADDING * 2);
  const canvasHeight = 200;

  // Draw the parameter bars
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw grid lines
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;

    // Horizontal grid lines (every 25%)
    for (let i = 0; i <= 4; i++) {
      const y = PADDING + (canvasHeight - PADDING * 2) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(PADDING, y);
      ctx.lineTo(canvasWidth - PADDING, y);
      ctx.stroke();

      // Label
      const labelValue = Math.round(preset.max - (preset.max - preset.min) * (i / 4));
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(preset.format(labelValue), PADDING - 4, y + 3);
    }

    // Draw bars
    const displayValues = previewValues || values;
    const barAreaHeight = canvasHeight - PADDING * 2;

    displayValues.forEach((value, index) => {
      const x = PADDING + index * (BAR_WIDTH + BAR_GAP);
      const normalizedValue = (value - preset.min) / (preset.max - preset.min);
      const barHeight = normalizedValue * barAreaHeight;
      const y = canvasHeight - PADDING - barHeight;

      // Bar fill with gradient
      const gradient = ctx.createLinearGradient(x, y, x, canvasHeight - PADDING);
      gradient.addColorStop(0, preset.color);
      gradient.addColorStop(1, preset.color + '40');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, BAR_WIDTH, barHeight);

      // Bar outline
      ctx.strokeStyle = preset.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, BAR_WIDTH, barHeight);

      // Row number at bottom (every 4 rows)
      if ((startRow + index) % 4 === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          useHexNumbers
            ? (startRow + index).toString(16).toUpperCase().padStart(2, '0')
            : (startRow + index).toString().padStart(2, '0'),
          x + BAR_WIDTH / 2,
          canvasHeight - 4
        );
      }
    });

  }, [values, previewValues, canvasWidth, canvasHeight, preset, startRow, useHexNumbers]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Convert mouse position to row index and value
  const getRowAndValue = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate row index
    const rowIndex = Math.floor((x - PADDING) / (BAR_WIDTH + BAR_GAP));
    if (rowIndex < 0 || rowIndex >= rowCount) return null;

    // Calculate value (inverted Y axis)
    const barAreaHeight = canvasHeight - PADDING * 2;
    const normalizedY = 1 - (y - PADDING) / barAreaHeight;
    const value = Math.round(preset.min + normalizedY * (preset.max - preset.min));
    const clampedValue = Math.max(preset.min, Math.min(preset.max, value));

    return { rowIndex, value: clampedValue };
  }, [rowCount, preset, canvasHeight]);

  // Apply value based on edit mode
  const applyValue = useCallback((rowIndex: number, value: number, mode: EditMode) => {
    setValues(prev => {
      const newValues = [...prev];
      const currentValue = newValues[rowIndex];

      switch (mode) {
        case 'overwrite':
          newValues[rowIndex] = value;
          break;
        case 'fill_blanks':
          if (currentValue === 0 || currentValue === preset.default) {
            newValues[rowIndex] = value;
          }
          break;
        case 'add':
          newValues[rowIndex] = Math.max(preset.min, Math.min(preset.max, currentValue + (value - preset.max / 2)));
          break;
        case 'scale': {
          const factor = value / preset.max;
          newValues[rowIndex] = Math.round(currentValue * factor);
          break;
        }
      }

      return newValues;
    });
  }, [preset]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const result = getRowAndValue(e);
    if (!result) return;

    // Right-click for single-row precision
    if (e.button === 2) {
      e.preventDefault();
      applyValue(result.rowIndex, result.value, 'overwrite');
      return;
    }

    setIsDragging(true);
    applyValue(result.rowIndex, result.value, editMode);
  }, [getRowAndValue, applyValue, editMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) {
      // Show preview on hover
      const result = getRowAndValue(e);
      if (result) {
        setPreviewValues(() => {
          const newPreview = [...values];
          newPreview[result.rowIndex] = result.value;
          return newPreview;
        });
      }
      return;
    }

    const result = getRowAndValue(e);
    if (result) {
      applyValue(result.rowIndex, result.value, editMode);
    }
  }, [isDragging, getRowAndValue, applyValue, editMode, values]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
    setPreviewValues(null);
  }, []);

  // Prevent context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Apply changes to pattern
  const applyToPattern = useCallback(() => {
    values.forEach((value, index) => {
      const row = startRow + index;
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return;

      const cell = pattern.channels[channelIndex]?.rows[row];
      if (!cell) return;

      const updates: Partial<TrackerCell> = {};

      switch (field) {
        case 'volume':
          updates.volume = value;
          break;
        case 'effect': {
          // Update effect type, keep parameter
          const currentEffect = cell.effect || '000';
          const param = currentEffect.length >= 3 ? currentEffect.substring(1) : '00';
          updates.effect = preset.format(value) + param;
          break;
        }
        case 'effectParam': {
          // Update parameter, keep effect type
          const effectType = cell.effect?.[0] || '0';
          updates.effect = effectType + value.toString(16).toUpperCase().padStart(2, '0');
          break;
        }
        case 'note':
          updates.note = value;
          break;
        case 'instrument':
          updates.instrument = value;
          break;
      }

      setCell(channelIndex, row, updates);
    });

    onClose();
  }, [values, startRow, patterns, currentPatternIndex, channelIndex, field, preset, setCell, onClose]);

  // Generate preset patterns
  const generatePattern = useCallback((type: 'ramp_up' | 'ramp_down' | 'triangle' | 'random' | 'sine') => {
    const newValues = Array(rowCount).fill(0).map((_, index) => {
      const t = index / (rowCount - 1 || 1);
      const range = preset.max - preset.min;

      switch (type) {
        case 'ramp_up':
          return Math.round(preset.min + t * range);
        case 'ramp_down':
          return Math.round(preset.max - t * range);
        case 'triangle':
          return Math.round(preset.min + Math.abs(1 - 2 * t) * range);
        case 'random':
          return Math.round(preset.min + Math.random() * range);
        case 'sine':
          return Math.round(preset.min + ((Math.sin(t * Math.PI * 2) + 1) / 2) * range);
        default:
          return preset.default;
      }
    });
    setValues(newValues);
  }, [rowCount, preset]);

  // Interpolate between first and last values
  const interpolate = useCallback(() => {
    if (values.length < 2) return;

    const startVal = values[0];
    const endVal = values[values.length - 1];

    const newValues = values.map((_, index) => {
      const t = index / (values.length - 1);
      return Math.round(startVal + (endVal - startVal) * t);
    });
    setValues(newValues);
  }, [values]);

  // Reset to original values from pattern
  const reset = useCallback(() => {
    setValues(patternValues);
  }, [patternValues]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div
        ref={containerRef}
        className="bg-dark-bg border border-dark-border rounded-lg shadow-2xl max-w-[95vw] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-dark-bgSecondary border-b border-dark-border">
          <div className="flex items-center gap-3">
            <h2 className="text-text-primary font-bold">{preset.label} Editor</h2>
            <span className="text-xs text-text-secondary">
              Channel {channelIndex + 1}, Rows {startRow}-{endRow}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-dark-bgSecondary/50 border-b border-dark-border">
          {/* Edit Mode */}
          <div className="flex items-center gap-1 mr-4">
            <span className="text-xs text-text-secondary mr-1">Mode:</span>
            {(['overwrite', 'fill_blanks', 'add', 'scale'] as EditMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setEditMode(mode)}
                className={`px-2 py-1 text-xs rounded ${
                  editMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-dark-bg text-text-secondary hover:bg-dark-bgSecondary'
                }`}
              >
                {mode === 'fill_blanks' ? 'Fill Empty' : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {/* Pattern generators */}
          <div className="flex items-center gap-1 border-l border-dark-border pl-4">
            <span className="text-xs text-text-secondary mr-1">Generate:</span>
            <button onClick={() => generatePattern('ramp_up')} className="px-2 py-1 text-xs bg-dark-bg hover:bg-dark-bgSecondary rounded" title="Ramp Up">↗</button>
            <button onClick={() => generatePattern('ramp_down')} className="px-2 py-1 text-xs bg-dark-bg hover:bg-dark-bgSecondary rounded" title="Ramp Down">↘</button>
            <button onClick={() => generatePattern('triangle')} className="px-2 py-1 text-xs bg-dark-bg hover:bg-dark-bgSecondary rounded" title="Triangle">∧</button>
            <button onClick={() => generatePattern('sine')} className="px-2 py-1 text-xs bg-dark-bg hover:bg-dark-bgSecondary rounded" title="Sine">∿</button>
            <button onClick={() => generatePattern('random')} className="px-2 py-1 text-xs bg-dark-bg hover:bg-dark-bgSecondary rounded" title="Random">?</button>
          </div>

          {/* Tools */}
          <div className="flex items-center gap-1 border-l border-dark-border pl-4">
            <Button variant="ghost" size="sm" onClick={interpolate} title="Interpolate between first and last">
              <ArrowUpDown size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={reset} title="Reset to original">
              <RotateCcw size={14} />
            </Button>
          </div>
        </div>

        {/* Canvas */}
        <div className="p-4 overflow-x-auto">
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
            className="cursor-crosshair border border-dark-border rounded"
            style={{ minWidth: canvasWidth }}
          />
        </div>

        {/* Help text */}
        <div className="px-4 py-2 text-xs text-text-secondary bg-dark-bgSecondary/30 border-t border-dark-border">
          <span className="font-medium">Tips:</span> Click + drag to paint values. Right-click for single-row precision.
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 bg-dark-bgSecondary border-t border-dark-border">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={applyToPattern}>
            <Wand2 size={14} className="mr-1" />
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
};
