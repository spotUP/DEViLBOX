/**
 * DubLaneTimeline — lightweight horizontal strip showing recorded dub events
 * as vertical bars along the current pattern's length. Click a bar to delete
 * the event. The playhead is a 1px white line that follows transport.currentRow.
 *
 * Phase 1 scope: read-only except single-click-to-delete. Drag, multi-select,
 * and repeat operations land with the dedicated DubLaneEditor in Phase 9.
 */

import React, { useCallback } from 'react';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';

// Move-id → token color class. New moves add entries here as they land.
const MOVE_COLOR: Record<string, string> = {
  echoThrow: 'bg-accent-primary',
  // Future: dubStab: 'bg-accent-highlight', channelMute: 'bg-accent-error', …
};

export const DubLaneTimeline: React.FC = () => {
  const patternIdx = useTrackerStore(s => s.currentPatternIndex);
  const pattern = useTrackerStore(s => s.patterns[patternIdx]);
  const setPatternDubLane = useTrackerStore(s => s.setPatternDubLane);
  const currentRow = useTransportStore(s => s.currentRow);

  const lane = pattern?.dubLane;
  const patternLength = pattern?.length ?? 64;

  const deleteEvent = useCallback((eventId: string) => {
    if (!lane) return;
    const filtered = lane.events.filter(e => e.id !== eventId);
    setPatternDubLane(patternIdx, { ...lane, events: filtered });
  }, [lane, patternIdx, setPatternDubLane]);

  const playheadPct = patternLength > 0 ? (currentRow / patternLength) * 100 : 0;

  return (
    <div className="relative w-full h-5 bg-dark-bg border border-dark-border rounded-sm overflow-hidden">
      {/* Event bars */}
      {lane?.events.map(ev => {
        const leftPct = (ev.row / patternLength) * 100;
        const colorClass = MOVE_COLOR[ev.moveId] ?? 'bg-text-muted';
        return (
          <button
            key={ev.id}
            className={`absolute top-0.5 bottom-0.5 w-1 ${colorClass} hover:w-1.5 transition-all`}
            style={{ left: `${leftPct}%` }}
            onClick={() => deleteEvent(ev.id)}
            title={`${ev.moveId}${ev.channelId !== undefined ? ` · ch ${ev.channelId + 1}` : ''} · row ${ev.row.toFixed(1)} · click to delete`}
            aria-label={`Delete ${ev.moveId} event at row ${ev.row.toFixed(1)}`}
          />
        );
      })}

      {/* Playhead */}
      {currentRow >= 0 && (
        <div
          className="absolute top-0 bottom-0 w-px bg-text-primary pointer-events-none"
          style={{ left: `${playheadPct}%` }}
        />
      )}

      {/* Empty state hint */}
      {!lane || lane.events.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[9px] font-mono text-text-muted">
          Dub lane empty — arm REC and perform
        </div>
      ) : null}
    </div>
  );
};
