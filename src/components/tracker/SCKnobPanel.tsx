/**
 * SCKnobPanel — Collapsible SuperCollider param panel for DOM tracker view.
 * Appears above the pattern editor when a SuperCollider instrument is active.
 * Mirrors: src/components/tracker/TB303KnobPanel.tsx
 */

import React, { useCallback, memo, useState } from 'react';
import { useInstrumentStore, useUIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';

export const SCKnobPanel: React.FC = memo(() => {
  const { instruments, updateInstrumentRealtime } = useInstrumentStore(
    useShallow((s) => ({
      instruments: s.instruments,
      updateInstrumentRealtime: s.updateInstrumentRealtime,
    }))
  );

  const { scCollapsed, toggleSCCollapsed } = useUIStore(
    useShallow((s) => ({
      scCollapsed: s.scCollapsed ?? true,
      toggleSCCollapsed: s.toggleSCCollapsed,
    }))
  );

  const scInstrument = instruments.find(
    (i) => i.synthType === 'SuperCollider' && !!i.superCollider?.binary
  );
  const scConfig = scInstrument?.superCollider;
  const params = scConfig?.params ?? [];
  const synthDefName = scConfig?.synthDefName ?? 'SC';

  const [paramPage, setParamPage] = useState(0);
  const KNOBS_PER_PAGE = 8;
  const totalPages = Math.max(1, Math.ceil(params.length / KNOBS_PER_PAGE));
  const visibleParams = params.slice(
    paramPage * KNOBS_PER_PAGE,
    (paramPage + 1) * KNOBS_PER_PAGE
  );

  const handleParamChange = useCallback(
    (paramName: string, value: number) => {
      if (!scInstrument || !scConfig) return;
      const latest = useInstrumentStore
        .getState()
        .instruments.find((i) => i.id === scInstrument.id);
      if (!latest?.superCollider) return;
      const updatedParams = latest.superCollider.params.map((p) =>
        p.name === paramName ? { ...p, value } : p
      );
      updateInstrumentRealtime(scInstrument.id, {
        superCollider: { ...latest.superCollider, params: updatedParams },
      });
    },
    [scInstrument, scConfig, updateInstrumentRealtime]
  );

  if (!scInstrument) return null;

  return (
    <div
      className="border-b border-dark-borderLight bg-dark-bgSecondary select-none"
      style={{ height: scCollapsed ? 36 : 120 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-9">
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: '#00cc66', color: 'var(--color-text-inverse)' }}
        >
          SC
        </span>
        <span className="text-sm font-bold text-text-primary">
          \{synthDefName}
        </span>
        <span className="text-xs text-text-muted">
          {params.length} params
        </span>
        <div className="flex-1" />

        {!scCollapsed && totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              className="text-text-secondary hover:text-text-primary disabled:opacity-30 p-0.5"
              onClick={() => setParamPage(Math.max(0, paramPage - 1))}
              disabled={paramPage === 0}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-text-muted">
              {paramPage + 1}/{totalPages}
            </span>
            <button
              className="text-text-secondary hover:text-text-primary disabled:opacity-30 p-0.5"
              onClick={() => setParamPage(Math.min(totalPages - 1, paramPage + 1))}
              disabled={paramPage >= totalPages - 1}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <button
          className="text-text-secondary hover:text-text-primary p-0.5"
          onClick={toggleSCCollapsed}
        >
          {scCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Param sliders row */}
      {!scCollapsed && (
        <div className="flex items-center gap-3 px-3 h-[84px] border-t border-dark-border overflow-x-auto">
          {visibleParams.map((param) => (
            <div key={param.name} className="flex flex-col items-center gap-1 min-w-[64px]">
              <input
                type="range"
                className="w-14 accent-green-500"
                min={param.min}
                max={param.max}
                step={(param.max - param.min) / 127}
                value={param.value}
                onChange={(e) => handleParamChange(param.name, parseFloat(e.target.value))}
              />
              <span className="text-[10px] text-text-secondary truncate max-w-[64px] text-center">
                {param.name}
              </span>
              <span className="text-[9px] text-text-muted">
                {Number(param.value.toPrecision(3))}
              </span>
            </div>
          ))}

          {params.length === 0 && (
            <span className="text-xs text-text-muted">Compile SynthDef to see params</span>
          )}
        </div>
      )}
    </div>
  );
});

SCKnobPanel.displayName = 'SCKnobPanel';
