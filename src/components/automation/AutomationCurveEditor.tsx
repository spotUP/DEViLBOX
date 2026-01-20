/**
 * AutomationCurveEditor - Canvas-based curve drawing tool
 * Supports freehand drawing, shapes, keyframes, and preset curves
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAutomationStore } from '@stores';
import type { AutomationParameter, AutomationShape, InterpolationType } from '@typedefs/automation';

interface AutomationCurveEditorProps {
  patternId: string;
  channelIndex: number;
  parameter: AutomationParameter;
  patternLength: number;
  width?: number;
  height?: number;
}

type DrawMode = 'pencil' | 'line' | 'curve' | 'select';

interface DrawState {
  isDrawing: boolean;
  startRow: number | null;
  startValue: number | null;
  lastRow: number | null;
  lastValue: number | null;
}

export const AutomationCurveEditor: React.FC<AutomationCurveEditorProps> = ({
  patternId,
  channelIndex,
  parameter,
  patternLength,
  width = 800,
  height = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>('pencil');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [drawState, setDrawState] = useState<DrawState>({
    isDrawing: false,
    startRow: null,
    startValue: null,
    lastRow: null,
    lastValue: null,
  });
  const [history, setHistory] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [historyIndex, setHistoryIndex] = useState(-1);

  const { getAutomation, setAutomation, addPoint, clearPoints } = useAutomationStore();

  const curve = getAutomation(patternId, channelIndex, parameter);

  // Draw grid and curve
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    const gridColor = '#2a2a2a';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    // Vertical grid lines (rows)
    const rowWidth = width / patternLength;
    for (let i = 0; i <= patternLength; i += 4) {
      const x = i * rowWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Horizontal grid lines (value)
    const gridLines = 8;
    for (let i = 0; i <= gridLines; i++) {
      const y = (i / gridLines) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw center line
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw automation curve
    if (curve.points.length > 0) {
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth = 2;
      ctx.beginPath();

      // Sort points by row
      const sortedPoints = [...curve.points].sort((a, b) => a.row - b.row);

      // Draw curve based on interpolation type
      for (let i = 0; i < sortedPoints.length; i++) {
        const point = sortedPoints[i];
        const x = (point.row / patternLength) * width;
        const y = height - point.value * height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevPoint = sortedPoints[i - 1];
          const prevX = (prevPoint.row / patternLength) * width;
          const prevY = height - prevPoint.value * height;

          if (curve.interpolation === 'linear') {
            ctx.lineTo(x, y);
          } else if (curve.interpolation === 'exponential') {
            // Bezier curve for exponential
            const cpX = prevX + (x - prevX) * 0.5;
            const cpY = prevY;
            ctx.quadraticCurveTo(cpX, cpY, x, y);
          } else if (curve.interpolation === 'easeIn') {
            const cpX = prevX;
            const cpY = y;
            ctx.quadraticCurveTo(cpX, cpY, x, y);
          } else if (curve.interpolation === 'easeOut') {
            const cpX = x;
            const cpY = prevY;
            ctx.quadraticCurveTo(cpX, cpY, x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      }

      ctx.stroke();

      // Draw points
      ctx.fillStyle = '#00aaff';
      sortedPoints.forEach((point) => {
        const x = (point.row / patternLength) * width;
        const y = height - point.value * height;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, [curve, patternLength, width, height]);

  // Redraw on curve change
  useEffect(() => {
    draw();
  }, [draw]);

  // Convert canvas coordinates to row/value
  const coordsToRowValue = useCallback(
    (x: number, y: number): { row: number; value: number } => {
      let row = Math.floor((x / width) * patternLength);
      let value = 1 - y / height;

      // Snap to grid
      if (snapToGrid) {
        row = Math.round(row);
        value = Math.round(value * 16) / 16; // 16 steps
      }

      // Clamp values
      row = Math.max(0, Math.min(patternLength - 1, row));
      value = Math.max(0, Math.min(1, value));

      return { row, value };
    },
    [width, height, patternLength, snapToGrid]
  );

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { row, value } = coordsToRowValue(x, y);

      // Save state for undo
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), { ...curve }]);
      setHistoryIndex((prev) => prev + 1);

      setDrawState({
        isDrawing: true,
        startRow: row,
        startValue: value,
        lastRow: row,
        lastValue: value,
      });

      if (drawMode === 'pencil') {
        addPoint(curve.id, row, value);
      }
    },
    [coordsToRowValue, drawMode, addPoint, curve, historyIndex]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!drawState.isDrawing) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { row, value } = coordsToRowValue(x, y);

      if (drawMode === 'pencil') {
        // Freehand drawing
        addPoint(curve.id, row, value);
      } else if (drawMode === 'line' && drawState.startRow !== null && drawState.startValue !== null) {
        // Draw line preview
        // Actual line will be drawn on mouse up
      }

      setDrawState((prev) => ({
        ...prev,
        lastRow: row,
        lastValue: value,
      }));
    },
    [drawState, coordsToRowValue, drawMode, addPoint, curve]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (!drawState.isDrawing) return;

    if (drawMode === 'line' && drawState.startRow !== null && drawState.startValue !== null && drawState.lastRow !== null && drawState.lastValue !== null) {
      // Draw line between start and end
      const steps = Math.abs(drawState.lastRow - drawState.startRow);
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        const row = Math.round(drawState.startRow + (drawState.lastRow - drawState.startRow) * t);
        const value = drawState.startValue + (drawState.lastValue - drawState.startValue) * t;
        addPoint(curve.id, row, value);
      }
    }

    setDrawState({
      isDrawing: false,
      startRow: null,
      startValue: null,
      lastRow: null,
      lastValue: null,
    });
  }, [drawState, drawMode, addPoint, curve]);

  // Apply shape preset
  const applyShape = useCallback(
    (shape: AutomationShape) => {
      // Save state for undo
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), { ...curve }]);
      setHistoryIndex((prev) => prev + 1);

      clearPoints(curve.id);

      const points: Array<{ row: number; value: number }> = [];

      switch (shape) {
        case 'rampUp':
          points.push({ row: 0, value: 0 });
          points.push({ row: patternLength - 1, value: 1 });
          break;

        case 'rampDown':
          points.push({ row: 0, value: 1 });
          points.push({ row: patternLength - 1, value: 0 });
          break;

        case 'triangle':
          points.push({ row: 0, value: 0 });
          points.push({ row: Math.floor(patternLength / 2), value: 1 });
          points.push({ row: patternLength - 1, value: 0 });
          break;

        case 'sine':
          for (let i = 0; i < patternLength; i++) {
            const value = (Math.sin((i / patternLength) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
            points.push({ row: i, value });
          }
          break;

        case 'saw':
          for (let i = 0; i < patternLength; i++) {
            const value = (i / patternLength);
            points.push({ row: i, value });
          }
          break;

        case 'reverseSaw':
          for (let i = 0; i < patternLength; i++) {
            const value = 1 - (i / patternLength);
            points.push({ row: i, value });
          }
          break;

        case 'square':
          points.push({ row: 0, value: 0 });
          points.push({ row: Math.floor(patternLength / 2) - 1, value: 0 });
          points.push({ row: Math.floor(patternLength / 2), value: 1 });
          points.push({ row: patternLength - 1, value: 1 });
          break;

        case 'random':
          for (let i = 0; i < patternLength; i += 4) {
            points.push({ row: i, value: Math.random() });
          }
          break;
      }

      points.forEach((point) => addPoint(curve.id, point.row, point.value));
    },
    [curve, patternLength, clearPoints, addPoint, historyIndex]
  );

  // Clear curve
  const handleClear = useCallback(() => {
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), { ...curve }]);
    setHistoryIndex((prev) => prev + 1);
    clearPoints(curve.id);
  }, [curve, clearPoints, historyIndex]);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setAutomation(patternId, channelIndex, parameter, prevState);
      setHistoryIndex((prev) => prev - 1);
    }
  }, [historyIndex, history, patternId, channelIndex, parameter, setAutomation]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setAutomation(patternId, channelIndex, parameter, nextState);
      setHistoryIndex((prev) => prev + 1);
    }
  }, [historyIndex, history, patternId, channelIndex, parameter, setAutomation]);

  // Change interpolation type
  const handleInterpolationChange = useCallback(
    (interpolation: InterpolationType) => {
      setAutomation(patternId, channelIndex, parameter, {
        ...curve,
        interpolation,
      });
    },
    [patternId, channelIndex, parameter, curve, setAutomation]
  );

  return (
    <div className="automation-curve-editor bg-ft2-window border border-ft2-border rounded p-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        {/* Draw modes */}
        <div className="flex gap-1">
          <button
            onClick={() => setDrawMode('pencil')}
            className={`px-3 py-1 text-xs font-mono ${
              drawMode === 'pencil' ? 'bg-ft2-button text-ft2-text' : 'bg-ft2-bg text-ft2-textDim'
            } border border-ft2-border`}
          >
            Pencil
          </button>
          <button
            onClick={() => setDrawMode('line')}
            className={`px-3 py-1 text-xs font-mono ${
              drawMode === 'line' ? 'bg-ft2-button text-ft2-text' : 'bg-ft2-bg text-ft2-textDim'
            } border border-ft2-border`}
          >
            Line
          </button>
          <button
            onClick={() => setDrawMode('curve')}
            className={`px-3 py-1 text-xs font-mono ${
              drawMode === 'curve' ? 'bg-ft2-button text-ft2-text' : 'bg-ft2-bg text-ft2-textDim'
            } border border-ft2-border`}
          >
            Curve
          </button>
          <button
            onClick={() => setDrawMode('select')}
            className={`px-3 py-1 text-xs font-mono ${
              drawMode === 'select' ? 'bg-ft2-button text-ft2-text' : 'bg-ft2-bg text-ft2-textDim'
            } border border-ft2-border`}
          >
            Select
          </button>
        </div>

        <div className="w-px h-6 bg-ft2-border"></div>

        {/* Shape presets */}
        <div className="flex gap-1">
          <button
            onClick={() => applyShape('rampUp')}
            className="px-3 py-1 text-xs font-mono bg-ft2-bg text-ft2-textDim border border-ft2-border hover:bg-ft2-button"
          >
            Ramp Up
          </button>
          <button
            onClick={() => applyShape('rampDown')}
            className="px-3 py-1 text-xs font-mono bg-ft2-bg text-ft2-textDim border border-ft2-border hover:bg-ft2-button"
          >
            Ramp Down
          </button>
          <button
            onClick={() => applyShape('triangle')}
            className="px-3 py-1 text-xs font-mono bg-ft2-bg text-ft2-textDim border border-ft2-border hover:bg-ft2-button"
          >
            Triangle
          </button>
          <button
            onClick={() => applyShape('sine')}
            className="px-3 py-1 text-xs font-mono bg-ft2-bg text-ft2-textDim border border-ft2-border hover:bg-ft2-button"
          >
            Sine
          </button>
          <button
            onClick={() => applyShape('saw')}
            className="px-3 py-1 text-xs font-mono bg-ft2-bg text-ft2-textDim border border-ft2-border hover:bg-ft2-button"
          >
            Saw
          </button>
          <button
            onClick={() => applyShape('random')}
            className="px-3 py-1 text-xs font-mono bg-ft2-bg text-ft2-textDim border border-ft2-border hover:bg-ft2-button"
          >
            Random
          </button>
        </div>

        <div className="w-px h-6 bg-ft2-border"></div>

        {/* Interpolation */}
        <select
          value={curve.interpolation}
          onChange={(e) => handleInterpolationChange(e.target.value as InterpolationType)}
          className="px-2 py-1 text-xs font-mono bg-ft2-bg text-ft2-text border border-ft2-border"
        >
          <option value="linear">Linear</option>
          <option value="exponential">Exponential</option>
          <option value="easeIn">Ease In</option>
          <option value="easeOut">Ease Out</option>
        </select>

        <div className="w-px h-6 bg-ft2-border"></div>

        {/* Options */}
        <label className="flex items-center gap-2 text-xs font-mono text-ft2-text">
          <input
            type="checkbox"
            checked={snapToGrid}
            onChange={(e) => setSnapToGrid(e.target.checked)}
            className="w-4 h-4"
          />
          Snap to Grid
        </label>

        <div className="flex-grow"></div>

        {/* Actions */}
        <button
          onClick={handleUndo}
          disabled={historyIndex <= 0}
          className="px-3 py-1 text-xs font-mono bg-ft2-bg text-ft2-textDim border border-ft2-border hover:bg-ft2-button disabled:opacity-50"
        >
          Undo
        </button>
        <button
          onClick={handleRedo}
          disabled={historyIndex >= history.length - 1}
          className="px-3 py-1 text-xs font-mono bg-ft2-bg text-ft2-textDim border border-ft2-border hover:bg-ft2-button disabled:opacity-50"
        >
          Redo
        </button>
        <button
          onClick={handleClear}
          className="px-3 py-1 text-xs font-mono bg-ft2-bg text-ft2-textDim border border-ft2-border hover:bg-ft2-button"
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
        className="border border-ft2-border cursor-crosshair"
      />

      {/* Info */}
      <div className="mt-2 text-xs font-mono text-ft2-textDim">
        Parameter: {parameter} | Points: {curve.points.length} | Mode: {drawMode}
      </div>
    </div>
  );
};
