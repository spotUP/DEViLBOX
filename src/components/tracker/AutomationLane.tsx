/**
 * AutomationLane - Inline automation curve editor for pattern editor
 * Displays a miniature automation curve below channel rows
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { useAutomationStore } from '@stores/useAutomationStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import type { AutomationCurve, AutomationParameter } from '@typedefs/automation';
import { ChevronDown, ChevronUp, Eye, EyeOff, Trash2 } from 'lucide-react';

// Automatable parameters with their display settings
const AUTOMATION_PARAMETERS: {
  id: AutomationParameter;
  label: string;
  shortLabel: string;
  color: string;
  min: number;
  max: number;
}[] = [
  { id: 'cutoff', label: 'Filter Cutoff', shortLabel: 'Cut', color: '#4f9d69', min: 200, max: 20000 },
  { id: 'resonance', label: 'Resonance', shortLabel: 'Res', color: '#3b82f6', min: 0, max: 100 },
  { id: 'envMod', label: 'Env Mod', shortLabel: 'Env', color: '#f59e0b', min: 0, max: 100 },
  { id: 'volume', label: 'Volume', shortLabel: 'Vol', color: '#ef4444', min: -60, max: 0 },
  { id: 'pan', label: 'Pan', shortLabel: 'Pan', color: '#8b5cf6', min: -100, max: 100 },
  { id: 'decay', label: 'Decay', shortLabel: 'Dec', color: '#06b6d4', min: 30, max: 3000 },
];

interface AutomationLaneProps {
  patternId: string;
  channelIndex: number;
  patternLength: number;
  rowHeight?: number;
  /** If true, shows in compact mini mode */
  compact?: boolean;
  /** Called when automation changes */
  onAutomationChange?: () => void;
}

export const AutomationLane: React.FC<AutomationLaneProps> = ({
  patternId,
  channelIndex,
  patternLength,
  rowHeight = 20,
  compact = false,
  onAutomationChange,
}) => {
  const {
    getCurvesForPattern,
    addCurve,
    addPoint,
    updatePoint,
    removePoint,
    removeCurve,
    getValueAtRow,
  } = useAutomationStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [activeParameter, setActiveParameter] = useState<AutomationParameter>('cutoff');
  const [isDragging, setIsDragging] = useState(false);
  const [showParamMenu, setShowParamMenu] = useState(false);

  // Get curves for this channel
  const curves = getCurvesForPattern(patternId, channelIndex);
  const activeCurve = curves.find((c) => c.parameter === activeParameter);

  // Get parameter info
  const paramInfo = AUTOMATION_PARAMETERS.find((p) => p.id === activeParameter);

  // Canvas dimensions
  const width = 200;
  const height = compact ? 32 : 60;

  // Draw the automation curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = 1;

    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Vertical lines (every 16 rows)
    for (let row = 0; row < patternLength; row += 16) {
      const x = (row / patternLength) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw curve if exists
    if (activeCurve && activeCurve.points.length > 0) {
      ctx.strokeStyle = paramInfo?.color || '#4f9d69';
      ctx.lineWidth = 2;
      ctx.beginPath();

      // Draw line through all points
      activeCurve.points.forEach((point, i) => {
        const x = (point.row / patternLength) * width;
        const normalizedValue = paramInfo
          ? (point.value - paramInfo.min) / (paramInfo.max - paramInfo.min)
          : point.value / 100;
        const y = height - normalizedValue * height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw points
      ctx.fillStyle = paramInfo?.color || '#4f9d69';
      activeCurve.points.forEach((point) => {
        const x = (point.row / patternLength) * width;
        const normalizedValue = paramInfo
          ? (point.value - paramInfo.min) / (paramInfo.max - paramInfo.min)
          : point.value / 100;
        const y = height - normalizedValue * height;

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw "no automation" hint if empty
    if (!activeCurve || activeCurve.points.length === 0) {
      ctx.fillStyle = '#4a4a5e';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Click to add points', width / 2, height / 2 + 4);
    }
  }, [activeCurve, patternLength, width, height, paramInfo]);

  // Handle canvas click to add/edit points
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Calculate row and value from click position
      const row = Math.round((x / width) * patternLength);
      const normalizedValue = 1 - y / height;
      const value = paramInfo
        ? paramInfo.min + normalizedValue * (paramInfo.max - paramInfo.min)
        : normalizedValue * 100;

      // Create curve if doesn't exist
      let curveId = activeCurve?.id;
      if (!curveId) {
        curveId = addCurve(patternId, channelIndex, activeParameter);
      }

      // Add or update point
      addPoint(curveId, row, Math.round(value));
      onAutomationChange?.();
    },
    [
      activeCurve,
      patternId,
      channelIndex,
      activeParameter,
      patternLength,
      width,
      height,
      paramInfo,
      addCurve,
      addPoint,
      onAutomationChange,
    ]
  );

  // Handle mouse drag for continuous drawing
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || !activeCurve) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const row = Math.round((x / width) * patternLength);
      const normalizedValue = 1 - y / height;
      const value = paramInfo
        ? paramInfo.min + normalizedValue * (paramInfo.max - paramInfo.min)
        : normalizedValue * 100;

      addPoint(activeCurve.id, row, Math.round(value));
    },
    [isDragging, activeCurve, patternLength, width, height, paramInfo, addPoint]
  );

  // Handle clear automation
  const handleClear = useCallback(() => {
    if (activeCurve) {
      removeCurve(activeCurve.id);
      onAutomationChange?.();
    }
  }, [activeCurve, removeCurve, onAutomationChange]);

  if (compact && !isExpanded) {
    // Mini collapsed view - just a bar with parameter indicator
    return (
      <div className="flex items-center gap-1 px-2 py-1 bg-dark-bgSecondary border-t border-dark-border">
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary"
        >
          <ChevronDown size={10} />
          <span style={{ color: paramInfo?.color }}>{paramInfo?.shortLabel}</span>
          {activeCurve && activeCurve.points.length > 0 && (
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: paramInfo?.color }} />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-dark-bgSecondary border-t border-dark-border">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-dark-border/50">
        <div className="flex items-center gap-2">
          {compact && (
            <button
              onClick={() => setIsExpanded(false)}
              className="p-0.5 text-text-muted hover:text-text-primary"
            >
              <ChevronUp size={12} />
            </button>
          )}

          {/* Parameter selector */}
          <div className="relative">
            <button
              onClick={() => setShowParamMenu(!showParamMenu)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors"
              style={{ color: paramInfo?.color, backgroundColor: `${paramInfo?.color}20` }}
            >
              {paramInfo?.shortLabel || activeParameter}
              <ChevronDown size={10} />
            </button>

            {showParamMenu && (
              <div className="absolute top-full left-0 mt-1 bg-dark-bgTertiary border border-dark-border rounded shadow-lg z-10">
                {AUTOMATION_PARAMETERS.map((param) => {
                  const hasCurve = curves.some((c) => c.parameter === param.id);
                  return (
                    <button
                      key={param.id}
                      onClick={() => {
                        setActiveParameter(param.id);
                        setShowParamMenu(false);
                      }}
                      className={`
                        flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors
                        ${activeParameter === param.id ? 'bg-dark-bgActive' : 'hover:bg-dark-bgHover'}
                      `}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: param.color }}
                      />
                      <span className="text-text-secondary">{param.label}</span>
                      {hasCurve && (
                        <span className="ml-auto text-[10px] text-text-muted">has data</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {activeCurve && activeCurve.points.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1 text-text-muted hover:text-accent-error transition-colors"
              title="Clear automation"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="p-1">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full rounded cursor-crosshair"
          onClick={handleCanvasClick}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onMouseMove={handleMouseMove}
        />
      </div>

      {/* Value display */}
      {activeCurve && activeCurve.points.length > 0 && (
        <div className="px-2 pb-1 text-[10px] text-text-muted">
          {activeCurve.points.length} point{activeCurve.points.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};
