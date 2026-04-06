/**
 * AutomationParameterPicker — Per-channel dropdown for adding/removing automation parameters.
 * Renders as a compact button bar above each channel's automation lane area.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAutomationStore } from '@stores';
import { useChannelAutomationParams, groupParamsBySection } from '@hooks/useChannelAutomationParams';
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';

interface AutomationParameterPickerProps {
  channelIndex: number;
  patternId?: string;
  left: number;
  width: number;
  top: number;
}

export const AutomationParameterPicker: React.FC<AutomationParameterPickerProps> = ({
  channelIndex,
  patternId,
  left,
  width,
  top,
}) => {
  const { isMobile } = useResponsiveSafe();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pillPadding = isMobile ? 'px-2.5 py-1.5' : 'px-1.5 py-0.5';
  const pillText = isMobile ? 'text-[11px]' : 'text-[9px]';
  const dropdownItemPad = isMobile ? 'px-3 py-2.5' : 'px-2 py-1';

  const { params } = useChannelAutomationParams(channelIndex);
  const groups = useMemo(() => groupParamsBySection(params), [params]);

  const addActiveParameter = useAutomationStore(s => s.addActiveParameter);
  const removeActiveParameter = useAutomationStore(s => s.removeActiveParameter);
  const getActiveParameters = useAutomationStore(s => s.getActiveParameters);
  const setShowLane = useAutomationStore(s => s.setShowLane);
  const addCurve = useAutomationStore(s => s.addCurve);
  const addPoint = useAutomationStore(s => s.addPoint);
  const getCurvesForPattern = useAutomationStore(s => s.getCurvesForPattern);

  const activeParams = getActiveParameters(channelIndex);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  if (params.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: Math.max(width, 60),
        zIndex: 10,
      }}
    >
      {/* Active parameter pills */}
      <div className="flex gap-0.5 items-center flex-wrap" style={{ maxWidth: width }}>
        {activeParams.map((paramKey) => {
          const param = params.find(p => p.key === paramKey);
          if (!param) return null;
          return (
            <button
              key={paramKey}
              onClick={() => removeActiveParameter(channelIndex, paramKey)}
              className={`${pillPadding} ${pillText} font-mono rounded border transition-colors`}
              style={{
                backgroundColor: `${param.color}20`,
                borderColor: param.color,
                color: param.color,
              }}
              title={`${param.name} — click to remove`}
            >
              {param.shortLabel}
              <span className="ml-0.5 opacity-60">×</span>
            </button>
          );
        })}

        {/* Add parameter button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`${pillPadding} ${pillText} font-mono rounded border border-dark-border text-text-muted hover:text-text-secondary hover:border-dark-borderLight transition-colors`}
          title="Add automation parameter"
        >
          +
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 mt-1 bg-dark-bgSecondary border border-dark-border rounded-md shadow-lg z-50 overflow-y-auto"
          style={{ maxHeight: 240, minWidth: 140, maxWidth: 200 }}
        >
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-text-muted bg-dark-bgTertiary border-b border-dark-border">
                {group.label}
              </div>
              {group.params.map((param) => {
                const isActive = activeParams.includes(param.key);
                return (
                  <button
                    key={param.key}
                    onClick={() => {
                      if (isActive) {
                        removeActiveParameter(channelIndex, param.key);
                      } else {
                        addActiveParameter(channelIndex, param.key);
                        setShowLane(channelIndex, true);
                        // Seed a curve point so the lane is immediately visible.
                        // Without this, the lane renderer filters out empty curves.
                        if (patternId) {
                          const curves = getCurvesForPattern(patternId, channelIndex);
                          const existing = curves.find((c) => c.parameter === param.key);
                          let curveId = existing?.id;
                          if (!curveId) {
                            curveId = addCurve(patternId, channelIndex, param.key);
                          }
                          if (curveId && (!existing || existing.points.length === 0)) {
                            addPoint(curveId, 0, 1);
                          }
                        }
                      }
                    }}
                    className={`w-full text-left ${dropdownItemPad} text-xs flex items-center gap-1.5 transition-colors ${
                      isActive
                        ? 'bg-accent-primary/10 text-accent-primary'
                        : 'text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: param.color }}
                    />
                    <span className="truncate">{param.name}</span>
                    {isActive && <span className="ml-auto text-[10px] opacity-60">✓</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
