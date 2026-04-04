import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  type AutomationParamDef,
  type AutomationFormat,
  getParamsForFormat,
  groupParams,
} from '../../engine/automation/AutomationParams';
import { getAutomationCapture, type CaptureEntry } from '../../engine/automation/AutomationCapture';

interface LaneConfig {
  id: string;
  paramId: string | null;
  height: number; // 24 | 48 | 72
}

interface AutomationLaneStripProps {
  format: AutomationFormat;
  formatConfig?: { sidCount?: number; channelCount?: number; chipType?: string };
  patternId: string;
  patternLength: number;
  currentRow: number;
  isPlaying: boolean;
}

let laneIdCounter = 0;

export const AutomationLaneStrip: React.FC<AutomationLaneStripProps> = ({
  format,
  formatConfig,
  patternLength,
  currentRow,
  isPlaying,
}) => {
  const [lanes, setLanes] = useState<LaneConfig[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const allParams = useMemo(
    () => getParamsForFormat(format, formatConfig),
    [format, formatConfig],
  );
  const paramGroups = useMemo(() => groupParams(allParams), [allParams]);
  const paramById = useMemo(() => {
    const map = new Map<string, AutomationParamDef>();
    for (const p of allParams) map.set(p.id, p);
    return map;
  }, [allParams]);

  const addLane = useCallback(() => {
    setLanes(prev => [...prev, {
      id: `lane-${++laneIdCounter}`,
      paramId: null,
      height: 48,
    }]);
  }, []);

  const removeLane = useCallback((laneId: string) => {
    setLanes(prev => prev.filter(l => l.id !== laneId));
  }, []);

  const setLaneParam = useCallback((laneId: string, paramId: string) => {
    setLanes(prev => prev.map(l => l.id === laneId ? { ...l, paramId } : l));
  }, []);

  const setLaneHeight = useCallback((laneId: string, height: number) => {
    setLanes(prev => prev.map(l => l.id === laneId ? { ...l, height } : l));
  }, []);

  return (
    <div className="flex-shrink-0 border-t border-dark-border bg-dark-bgPrimary">
      {/* Header bar */}
      <div className="flex items-center h-6 px-2 bg-dark-bgSecondary border-b border-dark-border text-xs text-text-muted select-none">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="mr-2 text-text-muted hover:text-text-primary w-3"
        >
          {collapsed ? '\u25B6' : '\u25BC'}
        </button>
        <span className="font-medium">Automation</span>
        <span className="ml-2 opacity-50">{lanes.length} lane{lanes.length !== 1 ? 's' : ''}</span>
        <button
          onClick={addLane}
          className="ml-auto px-2 py-0.5 text-xs bg-dark-bgTertiary hover:bg-accent-primary/20 text-text-muted hover:text-text-primary rounded"
        >
          + Add Lane
        </button>
      </div>

      {/* Lanes */}
      {!collapsed && lanes.map(lane => (
        <div key={lane.id} className="border-b border-dark-border" style={{ height: lane.height }}>
          {/* Lane header */}
          <div className="flex items-center h-5 px-2 bg-dark-bgSecondary text-xs gap-1">
            <button
              onClick={() => removeLane(lane.id)}
              className="text-text-muted hover:text-accent-error text-xs w-3 flex-shrink-0"
              title="Remove lane"
            >
              x
            </button>

            <select
              value={lane.paramId ?? ''}
              onChange={e => setLaneParam(lane.id, e.target.value)}
              className="flex-1 bg-dark-bgTertiary text-text-primary text-xs border border-dark-border rounded px-1 py-0 truncate min-w-0"
            >
              <option value="">Select parameter...</option>
              {paramGroups.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.params.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            <button
              onClick={() => {
                const heights = [24, 48, 72];
                const idx = heights.indexOf(lane.height);
                setLaneHeight(lane.id, heights[(idx + 1) % heights.length]);
              }}
              className="text-text-muted hover:text-text-primary text-xs w-4 flex-shrink-0 text-center"
              title="Resize lane"
            >
              {lane.height === 24 ? 'S' : lane.height === 48 ? 'M' : 'L'}
            </button>
          </div>

          {/* Lane curve area */}
          <div className="relative" style={{ height: lane.height - 20 }}>
            {lane.paramId ? (
              <LaneCurveCanvas
                paramId={lane.paramId}
                paramDef={paramById.get(lane.paramId)}
                patternLength={patternLength}
                height={lane.height - 20}
                currentRow={currentRow}
                isPlaying={isPlaying}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted text-xs opacity-40">
                Select a parameter
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

/** Canvas renderer for a single automation lane */
const LaneCurveCanvas: React.FC<{
  paramId: string;
  paramDef?: AutomationParamDef;
  patternLength: number;
  height: number;
  currentRow: number;
  isPlaying: boolean;
}> = ({ paramId, paramDef: _paramDef, patternLength, height, currentRow, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const widthRef = useRef(800);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Track container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        if (w > 0) {
          widthRef.current = w;
          const canvas = canvasRef.current;
          if (canvas && canvas.width !== w * 2) {
            canvas.width = w * 2; // 2x for retina
            canvas.height = height * 2;
          }
        }
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [height]);

  // RAF draw loop
  useEffect(() => {
    let running = true;
    const draw = () => {
      if (!running) return;

      const canvas = canvasRef.current;
      if (!canvas) { animFrameRef.current = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { animFrameRef.current = requestAnimationFrame(draw); return; }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Get captured data
      const capture = getAutomationCapture();
      const entries = capture.getAll(paramId);

      if (entries.length === 0) {
        // Empty state — dashed center line
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        drawCurve(ctx, entries, w, h, patternLength);
        // Draw control points
        const maxTick = Math.max(patternLength, entries[entries.length - 1].tick + 1);
        for (let i = 0; i < entries.length; i++) {
          const px = (entries[i].tick / maxTick) * w;
          const py = (1 - entries[i].value) * h;
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fillStyle = i === dragIdx ? 'rgba(255,255,255,0.9)' : 'rgba(96, 165, 250, 0.7)';
          ctx.fill();
        }
      }

      // Playback position line
      if (isPlaying && patternLength > 0) {
        const px = (currentRow / patternLength) * w;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, [paramId, patternLength, currentRow, isPlaying, dragIdx]);

  const getMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { tick: 0, value: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const capture = getAutomationCapture();
    const entries = capture.getAll(paramId);
    const maxTick = entries.length > 0
      ? Math.max(patternLength, entries[entries.length - 1].tick + 1)
      : patternLength;
    return {
      tick: Math.round((x / rect.width) * maxTick),
      value: Math.max(0, Math.min(1, 1 - (y / rect.height))),
    };
  }, [paramId, patternLength]);

  const findNearPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const capture = getAutomationCapture();
    const entries = capture.getAll(paramId);
    if (entries.length === 0) return -1;
    const maxTick = Math.max(patternLength, entries[entries.length - 1].tick + 1);
    for (let i = 0; i < entries.length; i++) {
      const px = (entries[i].tick / maxTick) * rect.width;
      const py = (1 - entries[i].value) * rect.height;
      if (Math.abs(px - mx) < 6 && Math.abs(py - my) < 6) return i;
    }
    return -1;
  }, [paramId, patternLength]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const idx = findNearPoint(e);
    if (idx >= 0) {
      setDragIdx(idx);
    } else {
      // Click in empty space — add a new point
      const { tick, value } = getMousePos(e);
      const capture = getAutomationCapture();
      capture.push(paramId, tick, value);
    }
  }, [findNearPoint, getMousePos, paramId]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragIdx === null) return;
    const { value } = getMousePos(e);
    const capture = getAutomationCapture();
    const entries = capture.getAll(paramId);
    if (dragIdx < entries.length) {
      // Update the value of the dragged point
      entries[dragIdx].value = value;
    }
  }, [dragIdx, getMousePos, paramId]);

  const handleMouseUp = useCallback(() => {
    setDragIdx(null);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const idx = findNearPoint(e);
    if (idx >= 0) {
      // Remove point — clear the param and re-push all except this one
      const capture = getAutomationCapture();
      const entries = capture.getAll(paramId);
      capture.clearParam(paramId);
      for (let i = 0; i < entries.length; i++) {
        if (i !== idx) capture.push(paramId, entries[i].tick, entries[i].value, entries[i].sourceRef);
      }
    }
  }, [findNearPoint, paramId]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas
        ref={canvasRef}
        width={1600}
        height={height * 2}
        className="w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
};

function drawCurve(
  ctx: CanvasRenderingContext2D,
  entries: CaptureEntry[],
  w: number,
  h: number,
  patternLength: number,
): void {
  if (entries.length === 0) return;
  const maxTick = Math.max(patternLength, entries[entries.length - 1].tick + 1);

  // Filled area + stroke
  ctx.beginPath();
  for (let i = 0; i < entries.length; i++) {
    const x = (entries[i].tick / maxTick) * w;
    const y = (1 - entries[i].value) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  // Stroke the curve
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Fill below
  const lastEntry = entries[entries.length - 1];
  ctx.lineTo((lastEntry.tick / maxTick) * w, h);
  ctx.lineTo((entries[0].tick / maxTick) * w, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(96, 165, 250, 0.08)';
  ctx.fill();
}
