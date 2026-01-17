/**
 * AutomationCurveCanvas - Canvas-based automation curve editor
 * Full-width with vertical grid lines for each pattern position
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { AutomationCurve as AutomationCurveType, AutomationPoint } from '@typedefs/automation';
import { useThemeStore } from '@stores';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawMode, _setDrawMode] = useState<DrawMode>('pencil');
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(800);

  const height = 200;
  const paddingLeft = 35;  // Space for Y-axis labels
  const paddingRight = 10;
  const paddingTop = 10;
  const paddingBottom = 25;  // Space for X-axis labels

  // Theme-aware colors
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const curveColor1 = isCyanTheme ? '#00ffff' : '#00d4aa';
  const curveColor2 = isCyanTheme ? '#00ffff' : '#7c3aed';
  const pointGlow = isCyanTheme ? 'rgba(0, 255, 255, 0.3)' : 'rgba(0, 212, 170, 0.3)';
  const gridColor = isCyanTheme ? '#0a2020' : '#1a1a1d';
  const gridColorMajor = isCyanTheme ? '#0f3030' : '#252528';
  const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
  const labelColor = isCyanTheme ? '#00a0a0' : '#606068';

  // Resize observer to track container width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    setCanvasWidth(container.clientWidth);

    return () => resizeObserver.disconnect();
  }, []);

  // Drawing area dimensions
  const drawWidth = canvasWidth - paddingLeft - paddingRight;
  const drawHeight = height - paddingTop - paddingBottom;

  // Convert row index to canvas X coordinate
  const rowToX = useCallback(
    (row: number): number => {
      return paddingLeft + (row / patternLength) * drawWidth;
    },
    [patternLength, drawWidth]
  );

  // Convert value (0-1) to canvas Y coordinate
  const valueToY = useCallback((value: number): number => {
    return paddingTop + (1 - value) * drawHeight;
  }, [drawHeight]);

  // Convert canvas X to row index
  const xToRow = useCallback(
    (x: number): number => {
      const normalized = (x - paddingLeft) / drawWidth;
      return Math.round(normalized * patternLength);
    },
    [patternLength, drawWidth]
  );

  // Convert canvas Y to value (0-1)
  const yToValue = useCallback((y: number): number => {
    const normalized = 1 - (y - paddingTop) / drawHeight;
    return Math.max(0, Math.min(1, normalized));
  }, [drawHeight]);

  // Draw the curve
  const drawCurve = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with dark background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasWidth, height);

    // Draw vertical grid lines for each pattern position
    for (let row = 0; row <= patternLength; row++) {
      const x = rowToX(row);
      const isMajor = row % 16 === 0;
      const isMinor = row % 4 === 0;

      ctx.strokeStyle = isMajor ? gridColorMajor : gridColor;
      ctx.lineWidth = isMajor ? 1.5 : 0.5;

      // Only draw every row if pattern is small, otherwise every 4th
      if (patternLength <= 64 || isMinor) {
        ctx.beginPath();
        ctx.moveTo(x, paddingTop);
        ctx.lineTo(x, height - paddingBottom);
        ctx.stroke();
      }

      // Draw row numbers at major positions
      if (isMajor && row < patternLength) {
        ctx.fillStyle = labelColor;
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(row.toString(), x, height - 8);
      }
    }

    // Draw horizontal grid lines (0%, 25%, 50%, 75%, 100%)
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = paddingTop + (i / 4) * drawHeight;
      const isMajor = i === 2; // 50% line

      ctx.strokeStyle = isMajor ? gridColorMajor : gridColor;
      ctx.lineWidth = isMajor ? 1 : 0.5;

      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(canvasWidth - paddingRight, y);
      ctx.stroke();
    }

    // Draw Y-axis labels
    ctx.fillStyle = labelColor;
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('1.0', paddingLeft - 5, paddingTop + 4);
    ctx.fillText('0.5', paddingLeft - 5, paddingTop + drawHeight / 2 + 3);
    ctx.fillText('0.0', paddingLeft - 5, height - paddingBottom + 3);

    // Draw curve line
    if (curve.points.length > 0) {
      // Gradient stroke (or solid cyan for cyan theme)
      const gradient = ctx.createLinearGradient(paddingLeft, 0, canvasWidth - paddingRight, 0);
      gradient.addColorStop(0, curveColor1);
      gradient.addColorStop(1, curveColor2);

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
          ctx.fillStyle = pointGlow;
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = i === selectedPoint ? curveColor1 : curveColor2;
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
  }, [curve, patternLength, selectedPoint, rowToX, valueToY, curveColor1, curveColor2, pointGlow, canvasWidth, bgColor, gridColor, gridColorMajor, labelColor, drawWidth, drawHeight]);

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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

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

      {/* Canvas Container - Full Width */}
      <div ref={containerRef} className="w-full">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
          className={`w-full rounded-lg border border-dark-border ${
            isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
          }`}
          style={{ height: height }}
          tabIndex={0}
        />
      </div>

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
