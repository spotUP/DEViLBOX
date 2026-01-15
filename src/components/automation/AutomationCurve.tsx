/**
 * AutomationCurveCanvas - Canvas-based automation curve editor
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { AutomationCurve as AutomationCurveType, AutomationPoint } from '@typedefs/automation';

interface AutomationCurveCanvasProps {
  curve: AutomationCurveType;
  parameter: string;
  patternLength: number;
  onChange: (curve: AutomationCurveType) => void;
}

type DrawMode = 'pencil' | 'line' | 'select';
type PresetShape = 'rampUp' | 'rampDown' | 'triangle' | 'sine' | 'saw' | 'square' | 'random';

export const AutomationCurveCanvas: React.FC<AutomationCurveCanvasProps> = ({
  curve,
  parameter,
  patternLength,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawMode, _setDrawMode] = useState<DrawMode>('pencil');
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  const width = 600;
  const height = 180;
  const padding = 20;

  // Convert row index to canvas X coordinate
  const rowToX = useCallback(
    (row: number): number => {
      return padding + (row / patternLength) * (width - padding * 2);
    },
    [patternLength]
  );

  // Convert value (0-1) to canvas Y coordinate
  const valueToY = useCallback((value: number): number => {
    return height - padding - value * (height - padding * 2);
  }, []);

  // Convert canvas X to row index
  const xToRow = useCallback(
    (x: number): number => {
      const normalized = (x - padding) / (width - padding * 2);
      return Math.round(normalized * patternLength);
    },
    [patternLength]
  );

  // Convert canvas Y to value (0-1)
  const yToValue = useCallback((y: number): number => {
    const normalized = (height - padding - y) / (height - padding * 2);
    return Math.max(0, Math.min(1, normalized));
  }, []);

  // Draw the curve
  const drawCurve = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with dark background
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#1a1a1d';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const y = padding + (i / 4) * (height - padding * 2);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Vertical grid lines (every 16 rows)
    for (let row = 0; row <= patternLength; row += 16) {
      const x = rowToX(row);
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();
    }

    // Draw curve line
    if (curve.points.length > 0) {
      // Gradient stroke
      const gradient = ctx.createLinearGradient(padding, 0, width - padding, 0);
      gradient.addColorStop(0, '#00d4aa');
      gradient.addColorStop(1, '#7c3aed');

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const sortedPoints = [...curve.points].sort((a, b) => a.row - b.row);

      sortedPoints.forEach((point, i) => {
        const x = rowToX(point.row);
        const y = valueToY(point.value);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          if (curve.interpolation === 'linear') {
            ctx.lineTo(x, y);
          } else if (curve.interpolation === 'exponential') {
            // Exponential curve
            const prevPoint = sortedPoints[i - 1];
            const prevX = rowToX(prevPoint.row);
            const prevY = valueToY(prevPoint.value);
            const cpX = prevX + (x - prevX) * 0.5;
            const cpY = prevY;
            ctx.quadraticCurveTo(cpX, cpY, x, y);
          }
        }
      });

      ctx.stroke();

      // Draw points
      sortedPoints.forEach((point, i) => {
        const x = rowToX(point.row);
        const y = valueToY(point.value);

        // Point glow
        if (i === selectedPoint) {
          ctx.fillStyle = 'rgba(0, 212, 170, 0.3)';
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = i === selectedPoint ? '#00d4aa' : '#7c3aed';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();

        // White center
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw axis labels
    ctx.fillStyle = '#606068';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText('1.0', 2, padding + 5);
    ctx.fillText('0.5', 2, height / 2 + 5);
    ctx.fillText('0.0', 2, height - padding + 5);
    ctx.fillText('0', padding, height - 5);
    ctx.fillText(patternLength.toString(), width - padding - 10, height - 5);
  }, [curve, patternLength, selectedPoint, rowToX, valueToY]);

  useEffect(() => {
    drawCurve();
  }, [drawCurve]);

  // Track if we're dragging a point
  const [isDragging, setIsDragging] = useState(false);

  // Handle mouse down
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const row = xToRow(x);
    const value = yToValue(y);

    // Always check if clicking near an existing point first (for dragging)
    const nearestIndex = curve.points.findIndex((p) => {
      const px = rowToX(p.row);
      const py = valueToY(p.value);
      return Math.hypot(px - x, py - y) < 15;
    });

    if (nearestIndex >= 0) {
      // Clicked on existing point - start dragging
      setSelectedPoint(nearestIndex);
      setIsDragging(true);
      return;
    }

    // Not clicking on a point - add new point in pencil mode
    if (drawMode === 'pencil') {
      setIsDrawing(true);
      addPoint(row, value);
    } else if (drawMode === 'select') {
      setSelectedPoint(null);
    }
  };

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const row = xToRow(x);
    const value = yToValue(y);

    // Handle dragging (works in any mode)
    if (isDragging && selectedPoint !== null) {
      const newPoints = [...curve.points];
      const clampedRow = Math.max(0, Math.min(patternLength, row));
      newPoints[selectedPoint] = { row: clampedRow, value };

      // Sort and update
      const sortedPoints = newPoints.sort((a, b) => a.row - b.row);

      // Find the new index of our dragged point
      const newIndex = sortedPoints.findIndex(p => p.row === clampedRow && Math.abs(p.value - value) < 0.001);

      onChange({
        ...curve,
        points: sortedPoints,
      });

      if (newIndex >= 0 && newIndex !== selectedPoint) {
        setSelectedPoint(newIndex);
      }
    } else if (drawMode === 'pencil' && isDrawing) {
      addPoint(row, value);
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    setIsDrawing(false);
    setIsDragging(false);
  };

  // Handle right-click to delete point
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find nearest point
    const nearestIndex = curve.points.findIndex((p) => {
      const px = rowToX(p.row);
      const py = valueToY(p.value);
      return Math.hypot(px - x, py - y) < 15;
    });

    if (nearestIndex >= 0) {
      const newPoints = curve.points.filter((_, i) => i !== nearestIndex);
      onChange({
        ...curve,
        points: newPoints,
      });
      setSelectedPoint(null);
    }
  };

  // Handle keyboard for delete
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPoint !== null) {
      const newPoints = curve.points.filter((_, i) => i !== selectedPoint);
      onChange({
        ...curve,
        points: newPoints,
      });
      setSelectedPoint(null);
    }
  }, [selectedPoint, curve, onChange]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Add point to curve
  const addPoint = (row: number, value: number) => {
    if (row < 0 || row > patternLength) return;

    const newPoints = [...curve.points];
    const existingIndex = newPoints.findIndex((p) => p.row === row);

    if (existingIndex >= 0) {
      newPoints[existingIndex].value = value;
    } else {
      newPoints.push({ row, value });
    }

    onChange({
      ...curve,
      points: newPoints.sort((a, b) => a.row - b.row),
    });
  };

  // Apply preset shape
  const applyPreset = (shape: PresetShape) => {
    const newPoints: AutomationPoint[] = [];

    for (let row = 0; row <= patternLength; row += 4) {
      let value = 0;

      switch (shape) {
        case 'rampUp':
          value = row / patternLength;
          break;
        case 'rampDown':
          value = 1 - row / patternLength;
          break;
        case 'triangle':
          value = row < patternLength / 2 ? (row / patternLength) * 2 : 2 - (row / patternLength) * 2;
          break;
        case 'sine':
          value = (Math.sin((row / patternLength) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
          break;
        case 'saw':
          value = (row % (patternLength / 4)) / (patternLength / 4);
          break;
        case 'square':
          value = row < patternLength / 2 ? 1 : 0;
          break;
        case 'random':
          value = Math.random();
          break;
      }

      newPoints.push({ row, value });
    }

    onChange({
      ...curve,
      points: newPoints,
    });
  };

  // Clear all points
  const clearCurve = () => {
    onChange({
      ...curve,
      points: [],
    });
  };

  return (
    <div className="bg-dark-bg p-4">
      <div className="text-accent-primary text-sm font-semibold mb-3">
        {parameter.toUpperCase()}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => applyPreset('rampUp')}
            className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-dark-bgTertiary text-text-secondary border border-dark-border hover:border-dark-borderLight transition-colors"
          >
            Ramp Up
          </button>
          <button
            onClick={() => applyPreset('rampDown')}
            className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-dark-bgTertiary text-text-secondary border border-dark-border hover:border-dark-borderLight transition-colors"
          >
            Ramp Down
          </button>
          <button
            onClick={() => applyPreset('triangle')}
            className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-dark-bgTertiary text-text-secondary border border-dark-border hover:border-dark-borderLight transition-colors"
          >
            Triangle
          </button>
          <button
            onClick={() => applyPreset('sine')}
            className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-dark-bgTertiary text-text-secondary border border-dark-border hover:border-dark-borderLight transition-colors"
          >
            Sine
          </button>
          <button
            onClick={() => applyPreset('random')}
            className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-dark-bgTertiary text-text-secondary border border-dark-border hover:border-dark-borderLight transition-colors"
          >
            Random
          </button>
        </div>

        <div className="w-px bg-dark-border mx-1"></div>

        <button
          onClick={clearCurve}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-dark-bgTertiary text-accent-error border border-dark-border hover:border-accent-error transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        className={`rounded-lg border border-dark-border ${
          isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
        }`}
        tabIndex={0}
      />

      {/* Interpolation Mode */}
      <div className="mt-3 flex gap-2 items-center">
        <span className="text-text-muted text-xs">Interpolation:</span>
        <button
          onClick={() => onChange({ ...curve, interpolation: 'linear' })}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
            curve.interpolation === 'linear'
              ? 'bg-accent-primary text-text-inverse border-accent-primary'
              : 'bg-dark-bgTertiary text-text-secondary border-dark-border hover:border-dark-borderLight'
          }`}
        >
          Linear
        </button>
        <button
          onClick={() => onChange({ ...curve, interpolation: 'exponential' })}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
            curve.interpolation === 'exponential'
              ? 'bg-accent-primary text-text-inverse border-accent-primary'
              : 'bg-dark-bgTertiary text-text-secondary border-dark-border hover:border-dark-borderLight'
          }`}
        >
          Exponential
        </button>
      </div>
    </div>
  );
};
