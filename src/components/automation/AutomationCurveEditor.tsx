/**
 * AutomationCurveEditor - Canvas-based curve drawing tool
 * Supports freehand drawing, shapes, keyframes, preset curves, transforms,
 * tempo-synced LFOs, select+drag, and per-point curve editing.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CustomSelect } from '@components/common/CustomSelect';
import { useAutomationStore } from '@stores';
import type { AutomationCurve, AutomationParameter, AutomationShape, InterpolationType } from '@typedefs/automation';

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

interface SelectionRect {
  startRow: number;
  startValue: number;
  endRow: number;
  endValue: number;
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
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Selection state
  const [selectedPoints, setSelectedPoints] = useState<Set<number>>(new Set());
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const dragStartRef = useRef<{ row: number; value: number } | null>(null);

  // Context menu for per-point curve type
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pointRow: number } | null>(null);

  const {
    getAutomation, setAutomation, addPoint, clearPoints,
    flipCurve, reverseCurve, scaleCurve, smoothCurve, thinCurve, humanizeCurve,
    copyCurve, pasteCurve, setPointCurveType, removePoint,
  } = useAutomationStore();

  const curve = getAutomation(patternId, channelIndex, parameter);

  // Draw grid and curve
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'var(--color-bg-tertiary)';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    const gridColor = '#2a2a2a';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    const rowWidth = width / patternLength;
    for (let i = 0; i <= patternLength; i += 4) {
      const x = i * rowWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const gridLines = 8;
    for (let i = 0; i <= gridLines; i++) {
      const y = (i / gridLines) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw selection rectangle
    if (selectionRect) {
      const x1 = (selectionRect.startRow / patternLength) * width;
      const y1 = height - selectionRect.startValue * height;
      const x2 = (selectionRect.endRow / patternLength) * width;
      const y2 = height - selectionRect.endValue * height;
      ctx.strokeStyle = 'rgba(0, 170, 255, 0.5)';
      ctx.fillStyle = 'rgba(0, 170, 255, 0.1)';
      ctx.lineWidth = 1;
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1);
      const rh = Math.abs(y2 - y1);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
    }

    // Draw automation curve
    if (curve.points.length > 0) {
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth = 2;
      ctx.beginPath();

      const sortedPoints = [...curve.points].sort((a, b) => a.row - b.row);

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

      // Draw points (selected = yellow, normal = blue)
      sortedPoints.forEach((point) => {
        const x = (point.row / patternLength) * width;
        const y = height - point.value * height;
        const isSelected = selectedPoints.has(point.row);
        ctx.fillStyle = isSelected ? '#ffcc00' : '#00aaff';
        ctx.beginPath();
        ctx.arc(x, y, isSelected ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = '#ffcc00';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    }
  }, [curve, patternLength, width, height, selectedPoints, selectionRect]);

  useEffect(() => {
    draw();
  }, [draw]);

  const coordsToRowValue = useCallback(
    (x: number, y: number): { row: number; value: number } => {
      let row = Math.floor((x / width) * patternLength);
      let value = 1 - y / height;

      if (snapToGrid) {
        row = Math.round(row);
        value = Math.round(value * 16) / 16;
      }

      row = Math.max(0, Math.min(patternLength - 1, row));
      value = Math.max(0, Math.min(1, value));

      return { row, value };
    },
    [width, height, patternLength, snapToGrid]
  );

  // Check if a point is near a click position
  const findPointNear = useCallback(
    (row: number, value: number): number | null => {
      const rowTolerance = Math.max(1, patternLength * 0.015);
      const valTolerance = 0.05;
      for (const p of curve.points) {
        if (Math.abs(p.row - row) <= rowTolerance && Math.abs(p.value - value) <= valTolerance) {
          return p.row;
        }
      }
      return null;
    },
    [curve.points, patternLength]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { row, value } = coordsToRowValue(x, y);

      setHistory((prev) => [...prev.slice(0, historyIndex + 1), { ...curve }]);
      setHistoryIndex((prev) => prev + 1);

      if (drawMode === 'select') {
        // Check if clicking on an existing selected point to drag
        const clickedPoint = findPointNear(row, value);
        if (clickedPoint !== null && selectedPoints.has(clickedPoint)) {
          setIsDraggingSelection(true);
          dragStartRef.current = { row, value };
          return;
        }
        // Start rubber-band selection
        setSelectionRect({ startRow: row, startValue: value, endRow: row, endValue: value });
        if (!e.shiftKey) setSelectedPoints(new Set());
        return;
      }

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
    [coordsToRowValue, drawMode, addPoint, curve, historyIndex, selectedPoints, findPointNear]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { row, value } = coordsToRowValue(x, y);

      if (drawMode === 'select') {
        if (isDraggingSelection && dragStartRef.current) {
          // Batch drag selected points
          const deltaRow = row - dragStartRef.current.row;
          const deltaValue = value - dragStartRef.current.value;
          if (deltaRow !== 0 || deltaValue !== 0) {
            const newPoints = curve.points.map(p => {
              if (selectedPoints.has(p.row)) {
                return {
                  ...p,
                  row: Math.max(0, Math.min(patternLength - 1, Math.round(p.row + deltaRow))),
                  value: Math.max(0, Math.min(1, p.value + deltaValue)),
                };
              }
              return p;
            });
            // Update the selected set to match new positions
            const newSelected = new Set<number>();
            newPoints.forEach(p => {
              if (selectedPoints.has(p.row - Math.round(deltaRow))) {
                newSelected.add(p.row);
              }
            });
            setAutomation(patternId, channelIndex, parameter, {
              ...curve,
              points: newPoints.sort((a, b) => a.row - b.row),
            });
            setSelectedPoints(newSelected);
            dragStartRef.current = { row, value };
          }
          return;
        }
        if (selectionRect) {
          setSelectionRect(prev => prev ? { ...prev, endRow: row, endValue: value } : null);
          return;
        }
        return;
      }

      if (!drawState.isDrawing) return;

      if (drawMode === 'pencil') {
        addPoint(curve.id, row, value);
      }

      setDrawState((prev) => ({
        ...prev,
        lastRow: row,
        lastValue: value,
      }));
    },
    [drawState, coordsToRowValue, drawMode, addPoint, curve, isDraggingSelection,
     selectedPoints, selectionRect, patternId, channelIndex, parameter, setAutomation, patternLength]
  );

  const handleMouseUp = useCallback(() => {
    if (drawMode === 'select') {
      if (isDraggingSelection) {
        setIsDraggingSelection(false);
        dragStartRef.current = null;
        return;
      }
      // Finish rubber-band: select points inside rect
      if (selectionRect) {
        const minRow = Math.min(selectionRect.startRow, selectionRect.endRow);
        const maxRow = Math.max(selectionRect.startRow, selectionRect.endRow);
        const minVal = Math.min(selectionRect.startValue, selectionRect.endValue);
        const maxVal = Math.max(selectionRect.startValue, selectionRect.endValue);
        const newSelected = new Set(selectedPoints);
        curve.points.forEach(p => {
          if (p.row >= minRow && p.row <= maxRow && p.value >= minVal && p.value <= maxVal) {
            newSelected.add(p.row);
          }
        });
        setSelectedPoints(newSelected);
        setSelectionRect(null);
      }
      return;
    }

    if (!drawState.isDrawing) return;

    if (drawMode === 'line' && drawState.startRow !== null && drawState.startValue !== null && drawState.lastRow !== null && drawState.lastValue !== null) {
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
  }, [drawState, drawMode, addPoint, curve, selectionRect, selectedPoints, isDraggingSelection]);

  // Apply shape preset
  const applyShape = useCallback(
    (shape: AutomationShape) => {
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

        case 'sweepUp':
          for (let i = 0; i < patternLength; i++) {
            const t = i / (patternLength - 1);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            points.push({ row: i, value: eased });
          }
          break;

        case 'sweepDown':
          for (let i = 0; i < patternLength; i++) {
            const t = i / (patternLength - 1);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            points.push({ row: i, value: 1 - eased });
          }
          break;

        case 'buildDrop': {
          const buildEnd = Math.floor(patternLength * 0.75);
          for (let i = 0; i <= buildEnd; i++) {
            const t = i / buildEnd;
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            points.push({ row: i, value: eased });
          }
          points.push({ row: buildEnd + 1, value: 0 });
          points.push({ row: patternLength - 1, value: 0 });
          break;
        }

        // Tempo-synced LFO shapes
        case 'lfo1_4':
        case 'lfo1_8':
        case 'lfo1_16':
        case 'lfo1_32': {
          const cyclesMap: Record<string, number> = { lfo1_4: 1, lfo1_8: 2, lfo1_16: 4, lfo1_32: 8 };
          const cycles = cyclesMap[shape] ?? 1;
          for (let i = 0; i < patternLength; i++) {
            const phase = (i / patternLength) * cycles * Math.PI * 2;
            points.push({ row: i, value: (Math.sin(phase - Math.PI / 2) + 1) / 2 });
          }
          break;
        }
      }

      points.forEach((point) => addPoint(curve.id, point.row, point.value));
    },
    [curve, patternLength, clearPoints, addPoint, historyIndex]
  );

  const handleClear = useCallback(() => {
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), { ...curve }]);
    setHistoryIndex((prev) => prev + 1);
    clearPoints(curve.id);
    setSelectedPoints(new Set());
  }, [curve, clearPoints, historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setAutomation(patternId, channelIndex, parameter, prevState as unknown as AutomationCurve);
      setHistoryIndex((prev) => prev - 1);
    }
  }, [historyIndex, history, patternId, channelIndex, parameter, setAutomation]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setAutomation(patternId, channelIndex, parameter, nextState as unknown as AutomationCurve);
      setHistoryIndex((prev) => prev + 1);
    }
  }, [historyIndex, history, patternId, channelIndex, parameter, setAutomation]);

  const handleInterpolationChange = useCallback(
    (interpolation: InterpolationType) => {
      setAutomation(patternId, channelIndex, parameter, {
        ...curve,
        interpolation,
      });
    },
    [patternId, channelIndex, parameter, curve, setAutomation]
  );

  // Transform helpers that save undo state
  const withUndo = useCallback((fn: () => void) => {
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), { ...curve }]);
    setHistoryIndex((prev) => prev + 1);
    fn();
  }, [curve, historyIndex]);

  const btnClass = "px-2 py-1 text-[10px] font-mono bg-ft2-bg text-ft2-textDim border border-ft2-border hover:bg-ft2-button whitespace-nowrap";
  const btnAccent = "px-2 py-1 text-[10px] font-mono bg-ft2-bg text-accent-primary border border-ft2-border hover:bg-ft2-button whitespace-nowrap";
  const btnActive = (active: boolean) =>
    `px-2 py-1 text-[10px] font-mono ${active ? 'bg-ft2-button text-ft2-text' : 'bg-ft2-bg text-ft2-textDim'} border border-ft2-border whitespace-nowrap`;

  return (
    <div className="automation-curve-editor bg-ft2-window border border-ft2-border rounded p-3">
      {/* Row 1: Draw modes + Interpolation + Options */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <div className="flex gap-0.5">
          <button onClick={() => setDrawMode('pencil')} className={btnActive(drawMode === 'pencil')}>Pencil</button>
          <button onClick={() => setDrawMode('line')} className={btnActive(drawMode === 'line')}>Line</button>
          <button onClick={() => setDrawMode('select')} className={btnActive(drawMode === 'select')}>Select</button>
        </div>

        <div className="w-px h-5 bg-ft2-border" />

        <CustomSelect
          value={curve.interpolation}
          onChange={(v) => handleInterpolationChange(v as InterpolationType)}
          className="px-2 py-1 text-[10px] font-mono bg-ft2-bg text-ft2-text border border-ft2-border"
          options={[
            { value: 'linear', label: 'Linear' },
            { value: 'exponential', label: 'Exponential' },
            { value: 'easeIn', label: 'Ease In' },
            { value: 'easeOut', label: 'Ease Out' },
            { value: 'easeBoth', label: 'Ease Both' },
          ]}
        />

        <label className="flex items-center gap-1 text-[10px] font-mono text-ft2-text">
          <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} className="w-3 h-3" />
          Snap
        </label>

        <div className="flex-grow" />

        <button onClick={handleUndo} disabled={historyIndex <= 0} className={btnClass + ' disabled:opacity-50'}>Undo</button>
        <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className={btnClass + ' disabled:opacity-50'}>Redo</button>
        <button onClick={handleClear} className={btnClass}>Clear</button>
      </div>

      {/* Row 2: Shape presets */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <span className="text-[9px] font-mono text-ft2-textDim mr-1">SHAPES</span>
        <button onClick={() => applyShape('rampUp')} className={btnClass}>Ramp↑</button>
        <button onClick={() => applyShape('rampDown')} className={btnClass}>Ramp↓</button>
        <button onClick={() => applyShape('triangle')} className={btnClass}>Tri</button>
        <button onClick={() => applyShape('sine')} className={btnClass}>Sine</button>
        <button onClick={() => applyShape('saw')} className={btnClass}>Saw</button>
        <button onClick={() => applyShape('square')} className={btnClass}>Sq</button>
        <button onClick={() => applyShape('random')} className={btnClass}>Rnd</button>
        <div className="w-px h-5 bg-ft2-border" />
        <button onClick={() => applyShape('sweepUp')} className={btnAccent} title="DJ filter sweep up">Sweep↑</button>
        <button onClick={() => applyShape('sweepDown')} className={btnAccent} title="DJ filter sweep down">Sweep↓</button>
        <button onClick={() => applyShape('buildDrop')} className={btnAccent} title="DJ build-up then drop">Build&Drop</button>
        <div className="w-px h-5 bg-ft2-border" />
        <span className="text-[9px] font-mono text-ft2-textDim mr-1">LFO</span>
        <button onClick={() => applyShape('lfo1_4')} className={btnClass} title="1/4 note LFO (1 cycle)">1/4</button>
        <button onClick={() => applyShape('lfo1_8')} className={btnClass} title="1/8 note LFO (2 cycles)">1/8</button>
        <button onClick={() => applyShape('lfo1_16')} className={btnClass} title="1/16 note LFO (4 cycles)">1/16</button>
        <button onClick={() => applyShape('lfo1_32')} className={btnClass} title="1/32 note LFO (8 cycles)">1/32</button>
      </div>

      {/* Row 3: Transform tools + Copy/Paste */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <span className="text-[9px] font-mono text-ft2-textDim mr-1">XFORM</span>
        <button onClick={() => withUndo(() => flipCurve(curve.id))} className={btnClass} title="Invert values (mirror vertically)">Flip</button>
        <button onClick={() => withUndo(() => reverseCurve(curve.id))} className={btnClass} title="Reverse time order">Reverse</button>
        <button onClick={() => withUndo(() => scaleCurve(curve.id, 0.25, 0.75))} className={btnClass} title="Scale values to 25-75% range">Scale 50%</button>
        <button onClick={() => withUndo(() => smoothCurve(curve.id, 3))} className={btnClass} title="Smooth curve (3 passes)">Smooth</button>
        <button onClick={() => withUndo(() => thinCurve(curve.id, 0.02))} className={btnClass} title="Reduce points (keep shape)">Thin</button>
        <button onClick={() => withUndo(() => humanizeCurve(curve.id, 0.04))} className={btnClass} title="Add slight random variation">Humanize</button>
        <div className="w-px h-5 bg-ft2-border" />
        <button onClick={() => copyCurve(curve.id)} className={btnClass} title="Copy curve to clipboard">Copy</button>
        <button onClick={() => { withUndo(() => pasteCurve(patternId, channelIndex, parameter)); }} className={btnClass} title="Paste curve (works cross-channel)">Paste</button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={(e) => { setContextMenu(null); handleMouseDown(e); }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => {
          e.preventDefault();
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const { row, value } = coordsToRowValue(x, y);
          const pointRow = findPointNear(row, value);
          if (pointRow !== null) {
            setContextMenu({ x: e.clientX, y: e.clientY, pointRow });
          }
        }}
        className="border border-ft2-border cursor-crosshair"
      />

      {/* Per-point context menu */}
      {contextMenu && (() => {
        const point = curve.points.find(p => p.row === contextMenu.pointRow);
        const currentType = point?.curveType ?? 'global';
        const menuBtn = (label: string, type: string) => (
          <button
            key={type}
            onClick={() => {
              setPointCurveType(curve.id, contextMenu.pointRow, type === 'global' ? undefined : type as InterpolationType);
              setContextMenu(null);
            }}
            className={`block w-full text-left px-3 py-1 text-[10px] font-mono hover:bg-ft2-button ${currentType === type ? 'text-accent-primary' : 'text-ft2-text'}`}
          >{currentType === type ? '• ' : '  '}{label}</button>
        );
        return (
          <div
            className="fixed z-50 bg-ft2-window border border-ft2-border rounded shadow-lg py-1 min-w-[120px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseLeave={() => setContextMenu(null)}
          >
            <div className="px-3 py-1 text-[9px] font-mono text-ft2-textDim border-b border-ft2-border mb-1">Segment Curve</div>
            {menuBtn('Global', 'global')}
            {menuBtn('Linear', 'linear')}
            {menuBtn('Exponential', 'exponential')}
            {menuBtn('Ease In', 'easeIn')}
            {menuBtn('Ease Out', 'easeOut')}
            {menuBtn('Ease Both', 'easeBoth')}
            <div className="border-t border-ft2-border mt-1 pt-1">
              <button
                onClick={() => { removePoint(curve.id, contextMenu.pointRow); setContextMenu(null); }}
                className="block w-full text-left px-3 py-1 text-[10px] font-mono text-red-400 hover:bg-ft2-button"
              >Delete Point</button>
            </div>
          </div>
        );
      })()}

      {/* Info */}
      <div className="mt-1.5 text-[10px] font-mono text-ft2-textDim flex gap-4">
        <span>Param: {parameter}</span>
        <span>Points: {curve.points.length}</span>
        <span>Mode: {drawMode}</span>
        {selectedPoints.size > 0 && <span className="text-accent-primary">Selected: {selectedPoints.size}</span>}
      </div>
    </div>
  );
};
