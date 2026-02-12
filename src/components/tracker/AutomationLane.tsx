/**
 * AutomationLane - Inline automation curve editor for pattern editor
 * Displays a miniature automation curve below channel rows.
 * Parameters are resolved dynamically from the channel's instrument via NKS maps.
 */

import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useAutomationStore } from '@stores/useAutomationStore';
import { useChannelAutomationParams } from '@hooks/useChannelAutomationParams';
import type { AutomatableParamInfo } from '@hooks/useChannelAutomationParams';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

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
  rowHeight: _rowHeight = 20,
  compact = false,
  onAutomationChange,
}) => {
  void _rowHeight;
  const {
    getCurvesForPattern,
    addCurve,
    addPoint,
    removeCurve,
  } = useAutomationStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [activeParamKey, setActiveParamKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showParamMenu, setShowParamMenu] = useState(false);

  // Dynamic params from channel's instrument
  const { params } = useChannelAutomationParams(channelIndex);

  // Auto-select first param when instrument changes
  useEffect(() => {
    if (params.length === 0) return;
    if (!activeParamKey || !params.find((p) => p.key === activeParamKey)) {
      requestAnimationFrame(() => setActiveParamKey(params[0].key));
    }
  }, [params, activeParamKey]);

  const activeParameter = activeParamKey ?? params[0]?.key ?? 'tb303.cutoff';

  // Get curves for this channel
  const curves = getCurvesForPattern(patternId, channelIndex);
  const activeCurve = useMemo(
    () => curves.find((c) => c.parameter === activeParameter),
    [curves, activeParameter]
  );

  // Get parameter info
  const paramInfo: AutomatableParamInfo | undefined = params.find((p) => p.key === activeParameter);

  // Canvas dimensions
  const width = 200;
  const height = compact ? 32 : 60;

  // Draw the automation curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    for (let row = 0; row < patternLength; row += 16) {
      const x = (row / patternLength) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Resolve color — use CSS variable value or fallback
    const color = paramInfo?.color ?? 'var(--color-synth-filter)';
    // For canvas we need a concrete color; parse from CSS variable
    const resolvedColor = getComputedColor(canvas, color);

    if (activeCurve && activeCurve.points.length > 0) {
      ctx.strokeStyle = resolvedColor;
      ctx.lineWidth = 2;
      ctx.beginPath();

      activeCurve.points.forEach((point, i) => {
        const x = (point.row / patternLength) * width;
        // Values are 0-1 normalized
        const y = height - point.value * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Points
      ctx.fillStyle = resolvedColor;
      activeCurve.points.forEach((point) => {
        const x = (point.row / patternLength) * width;
        const y = height - point.value * height;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (!activeCurve || activeCurve.points.length === 0) {
      ctx.fillStyle = '#4a4a5e';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Click to add points', width / 2, height / 2 + 4);
    }
  }, [activeCurve, patternLength, width, height, paramInfo]);

  // Handle canvas click
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const row = Math.round((x / width) * patternLength);
      const value = Math.max(0, Math.min(1, 1 - y / height));

      let curveId = activeCurve?.id;
      if (!curveId) {
        curveId = addCurve(patternId, channelIndex, activeParameter);
      }
      addPoint(curveId, row, value);
      onAutomationChange?.();
    },
    [activeCurve, patternId, channelIndex, activeParameter, patternLength, width, height, addCurve, addPoint, onAutomationChange]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || !activeCurve) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const row = Math.round((x / width) * patternLength);
      const value = Math.max(0, Math.min(1, 1 - y / height));
      addPoint(activeCurve.id, row, value);
    },
    [isDragging, activeCurve, patternLength, width, height, addPoint]
  );

  const handleClear = useCallback(() => {
    if (activeCurve) {
      removeCurve(activeCurve.id);
      onAutomationChange?.();
    }
  }, [activeCurve, removeCurve, onAutomationChange]);

  if (compact && !isExpanded) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 bg-dark-bgSecondary border-t border-dark-border">
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary"
        >
          <ChevronDown size={10} />
          <span style={{ color: paramInfo?.color }}>{paramInfo?.shortLabel ?? '---'}</span>
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
              <div className="absolute top-full left-0 mt-1 bg-dark-bgTertiary border border-dark-border rounded shadow-lg z-10 max-h-64 overflow-y-auto">
                {params.map((param) => {
                  const hasCurve = curves.some((c) => c.parameter === param.key);
                  return (
                    <button
                      key={param.key}
                      onClick={() => {
                        setActiveParamKey(param.key);
                        setShowParamMenu(false);
                      }}
                      className={`
                        flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors
                        ${activeParameter === param.key ? 'bg-dark-bgActive' : 'hover:bg-dark-bgHover'}
                      `}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: param.color }}
                      />
                      <span className="text-text-secondary">{param.name}</span>
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

      {activeCurve && activeCurve.points.length > 0 && (
        <div className="px-2 pb-1 text-[10px] text-text-muted">
          {activeCurve.points.length} point{activeCurve.points.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

/** Resolve a CSS variable string to a concrete color for canvas rendering */
function getComputedColor(element: HTMLElement, cssVar: string): string {
  if (!cssVar.startsWith('var(')) return cssVar;
  const varName = cssVar.slice(4, -1).trim();
  const computed = getComputedStyle(element).getPropertyValue(varName).trim();
  return computed || '#4f9d69';
}
