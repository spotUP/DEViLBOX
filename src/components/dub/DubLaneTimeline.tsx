/**
 * DubLaneTimeline — horizontal strip showing recorded dub events with full
 * edit affordances:
 *   - Left-click + drag middle  → move the event's row
 *   - Left-click + drag right 6px → resize duration (hold-kind events only)
 *   - Right-click event          → context menu: delete / duplicate / clone to ch / clear pattern
 *   - Right-click empty track    → context menu: clear all events
 *   - Hover bar                  → fatter hit target, tooltip with full spec
 *
 * Playhead is a 1px white line driven via rAF + replayer.getStateAtTime for
 * sub-row smoothness. Same technique as PatternEditorCanvas.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { getTrackerReplayer } from '@/engine/TrackerReplayer';
import type { DubEvent } from '@/types/dub';

// Move-id → Tailwind bg-color class. New moves add entries here.
// Grouped by family so related moves land on similar hues:
//   primary / primary/70 → echo family
//   highlight / highlight/70 → dub stabs, one-shot delay accents
//   secondary / secondary/70 → filters, tape stop (sweep-style)
//   warning / warning/70 → siren, wobble (modulation)
//   success / success/70 → spring, toast (resonant tails)
//   error / error/70 → mute, drop, transport stop (destructive)
//   text-primary → snare / ping / click family
//   accent-primary/40 → sub / bass family (deep low end)
const MOVE_COLOR: Record<string, string> = {
  // ── Phase 1 moves ──
  echoThrow: 'bg-accent-primary',
  dubStab: 'bg-accent-highlight',
  filterDrop: 'bg-accent-secondary',
  dubSiren: 'bg-accent-warning',
  springSlam: 'bg-accent-success',
  channelMute: 'bg-accent-error',
  channelThrow: 'bg-accent-primary/70',
  delayTimeThrow: 'bg-accent-highlight/70',
  tapeWobble: 'bg-accent-warning/70',
  masterDrop: 'bg-accent-error/70',
  snareCrack: 'bg-text-primary',
  tapeStop: 'bg-accent-secondary/70',
  backwardReverb: 'bg-accent-highlight',
  toast: 'bg-accent-success/70',
  transportTapeStop: 'bg-accent-error',
  // ── PR #42 moves — grouped by family ──
  reverseEcho:       'bg-accent-primary/50',    // echo family, darker
  echoBuildUp:       'bg-accent-primary/40',    // echo family, deep build
  delayPreset380:    'bg-accent-highlight/50',  // delay accent
  delayPresetDotted: 'bg-accent-highlight/40',  // delay accent, darker
  tubbyScream:       'bg-accent-warning/50',    // modulated scream → warning fam
  stereoDoubler:     'bg-accent-primary/30',    // wide echo tint
  sonarPing:         'bg-text-primary/70',      // ping family
  radioRiser:        'bg-accent-warning/40',    // sweep-riser → warning fam
  subSwell:          'bg-accent-secondary/50',  // low sweep
  oscBass:           'bg-accent-secondary/40',  // bass family, deeper
  crushBass:         'bg-accent-error/50',      // destructive bass crush
  subHarmonic:       'bg-accent-secondary/30',  // sub family, deepest
};

// Hold-kind moves have a meaningful durationRows. Keep in sync with the
// kind table in parameterRouter.ts (any edit there needs a matching entry here).
const HOLD_KINDS = new Set([
  // Phase 1 holds
  'channelMute', 'filterDrop', 'dubSiren', 'tapeWobble', 'masterDrop', 'toast',
  // PR #42 holds (moves that return a disposer)
  'tubbyScream', 'stereoDoubler', 'oscBass', 'crushBass', 'subHarmonic',
]);

const POINT_WIDTH_PX = 6;   // rendered width for trigger events
const RESIZE_GRAB_PX = 6;   // hit-target on the right edge of hold events

interface ContextMenuState {
  x: number; y: number;
  eventId: string | null;  // null → background menu (clear all)
}

export const DubLaneTimeline: React.FC = () => {
  const patternIdx = useTrackerStore(s => s.currentPatternIndex);
  const pattern = useTrackerStore(s => s.patterns[patternIdx]);
  const setPatternDubLane = useTrackerStore(s => s.setPatternDubLane);

  const lane = pattern?.dubLane;
  const patternLength = pattern?.length ?? 64;
  const channelCount = pattern?.channels.length ?? 4;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // ── rAF playhead ──
  useEffect(() => {
    let rafId = 0;
    const replayer = getTrackerReplayer();
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const el = playheadRef.current;
      if (!el) return;
      const ts = useTransportStore.getState();
      let sub = ts.currentRow;
      if (ts.isPlaying && replayer) {
        const audioTime = Tone.now();
        const state = replayer.getStateAtTime(audioTime, true);
        if (state && state.duration > 0) {
          const progress = Math.min(Math.max((audioTime - state.time) / state.duration, 0), 1);
          sub = state.row + progress;
        }
      }
      const pct = patternLength > 0 ? (sub / patternLength) * 100 : 0;
      el.style.left = `${pct}%`;
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [patternLength]);

  // ── Lane mutations ──
  const replaceEvents = useCallback((fn: (prev: DubEvent[]) => DubEvent[]) => {
    if (!lane) return;
    const next = fn(lane.events).sort((a, b) => a.row - b.row);
    setPatternDubLane(patternIdx, { ...lane, events: next });
  }, [lane, patternIdx, setPatternDubLane]);

  const deleteEvent = useCallback((id: string) => {
    replaceEvents(evs => evs.filter(e => e.id !== id));
  }, [replaceEvents]);

  const duplicateEvent = useCallback((id: string) => {
    if (!lane) return;
    const ev = lane.events.find(e => e.id === id);
    if (!ev) return;
    const copy: DubEvent = {
      ...ev,
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      row: Math.min(patternLength - 0.01, ev.row + 0.5),
      params: { ...ev.params },
    };
    replaceEvents(evs => [...evs, copy]);
  }, [lane, patternLength, replaceEvents]);

  const cloneToChannel = useCallback((id: string, newChannelId: number) => {
    if (!lane) return;
    const ev = lane.events.find(e => e.id === id);
    if (!ev) return;
    const copy: DubEvent = {
      ...ev,
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      channelId: newChannelId,
      params: { ...ev.params },
    };
    replaceEvents(evs => [...evs, copy]);
  }, [lane, replaceEvents]);

  const clearAll = useCallback(() => {
    if (!lane) return;
    setPatternDubLane(patternIdx, { ...lane, events: [] });
  }, [lane, patternIdx, setPatternDubLane]);

  // ── Drag state ──
  // Listeners live on `window` during an active drag (installed in onPointerDown,
  // torn down on pointerup) so React re-rendering the dragged bar mid-drag can't
  // break the pointer capture — the window-level handlers keep firing regardless
  // of whether the bar's DOM identity survives the update.
  const dragRef = useRef<{
    eventId: string;
    mode: 'move' | 'resize';
    startX: number;
    startRow: number;
    startDuration: number;
  } | null>(null);

  const pxToRow = useCallback((deltaPx: number): number => {
    const el = containerRef.current;
    if (!el) return 0;
    const w = el.getBoundingClientRect().width;
    if (w <= 0) return 0;
    return (deltaPx / w) * patternLength;
  }, [patternLength]);

  const onPointerDown = useCallback((e: React.PointerEvent, ev: DubEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const isHold = ev.durationRows !== undefined && HOLD_KINDS.has(ev.moveId);
    const inResize = isHold && localX >= rect.width - RESIZE_GRAB_PX;

    dragRef.current = {
      eventId: ev.id,
      mode: inResize ? 'resize' : 'move',
      startX: e.clientX,
      startRow: ev.row,
      startDuration: ev.durationRows ?? 0,
    };

    const onMove = (me: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      me.preventDefault();
      const deltaRows = pxToRow(me.clientX - drag.startX);
      if (drag.mode === 'move') {
        const nextRow = Math.max(0, Math.min(patternLength - 0.01, drag.startRow + deltaRows));
        replaceEvents(evs => evs.map(v => v.id === drag.eventId ? { ...v, row: nextRow } : v));
      } else {
        const nextDur = Math.max(0.05, Math.min(patternLength - drag.startRow, drag.startDuration + deltaRows));
        replaceEvents(evs => evs.map(v => v.id === drag.eventId ? { ...v, durationRows: nextDur } : v));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [pxToRow, patternLength, replaceEvents]);

  // ── Context menu ──
  const onContextMenuEvent = useCallback((e: React.MouseEvent, eventId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, eventId });
  }, []);

  const onContextMenuBackground = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, eventId: null });
  }, []);

  // Close menu on any click outside (pointerdown on window).
  useEffect(() => {
    if (!contextMenu) return;
    const onDocDown = () => setContextMenu(null);
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    window.addEventListener('pointerdown', onDocDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('pointerdown', onDocDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [contextMenu]);

  const menuEvent = useMemo(() => {
    if (!contextMenu?.eventId || !lane) return null;
    return lane.events.find(e => e.id === contextMenu.eventId) ?? null;
  }, [contextMenu, lane]);

  // ── Render ──
  return (
    <>
      <div
        ref={containerRef}
        className="relative w-full h-5 bg-dark-bg border border-dark-border rounded-sm overflow-hidden"
        onContextMenu={onContextMenuBackground}
      >
        {lane?.events.map(ev => {
          const leftPct = (ev.row / patternLength) * 100;
          const isHold = ev.durationRows !== undefined && HOLD_KINDS.has(ev.moveId);
          const widthPct = isHold
            ? Math.max(0.5, (ev.durationRows! / patternLength) * 100)
            : undefined;
          const colorClass = MOVE_COLOR[ev.moveId] ?? 'bg-text-muted';
          const durationLabel = isHold ? ` · ${ev.durationRows!.toFixed(2)} rows held` : '';
          return (
            <div
              key={ev.id}
              className={`absolute top-0.5 bottom-0.5 ${colorClass} hover:brightness-125 cursor-grab active:cursor-grabbing`}
              style={{
                left: `${leftPct}%`,
                width: widthPct !== undefined ? `${widthPct}%` : `${POINT_WIDTH_PX}px`,
                minWidth: `${POINT_WIDTH_PX}px`,
                touchAction: 'none',
              }}
              onPointerDown={(e) => onPointerDown(e, ev)}
              onContextMenu={(e) => onContextMenuEvent(e, ev.id)}
              title={`${ev.moveId}${ev.channelId !== undefined ? ` · ch ${ev.channelId + 1}` : ''} · row ${ev.row.toFixed(1)}${durationLabel} · drag to move · right-click for menu${isHold ? ' · drag right edge to resize' : ''}`}
              aria-label={`${ev.moveId} at row ${ev.row.toFixed(1)}`}
            >
              {/* Right-edge resize affordance for hold events */}
              {isHold && widthPct !== undefined && (widthPct * (containerRef.current?.getBoundingClientRect().width ?? 0) / 100) > 12 && (
                <div
                  className="absolute top-0 bottom-0 right-0 w-1 bg-text-primary/60 pointer-events-none"
                />
              )}
            </div>
          );
        })}

        <div
          ref={playheadRef}
          className="absolute top-0 bottom-0 w-px bg-text-primary pointer-events-none"
          style={{ left: '0%' }}
        />

        {!lane || lane.events.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[9px] font-mono text-text-muted">
            Dub lane empty — arm REC and perform · right-click here when you have events
          </div>
        ) : null}
      </div>

      {contextMenu && (
        <div
          className="fixed z-[10000] bg-dark-bgSecondary border border-dark-borderLight rounded shadow-lg text-xs font-mono py-1"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px`, minWidth: '180px' }}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menuEvent ? (
            <>
              <div className="px-3 py-1 text-text-muted text-[10px] border-b border-dark-border">
                {menuEvent.moveId}{menuEvent.channelId !== undefined ? ` · ch ${menuEvent.channelId + 1}` : ''} · row {menuEvent.row.toFixed(1)}
              </div>
              <button
                className="w-full text-left px-3 py-1 text-text-primary hover:bg-dark-bgHover"
                onClick={() => { duplicateEvent(menuEvent.id); setContextMenu(null); }}
              >
                Duplicate (+0.5 row)
              </button>
              {menuEvent.channelId !== undefined && channelCount > 1 && (
                <div className="px-3 py-1 border-t border-dark-border">
                  <div className="text-text-muted text-[10px] mb-1">Clone to channel…</div>
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: channelCount }, (_, i) => i).filter(i => i !== menuEvent.channelId).map(i => (
                      <button
                        key={i}
                        className="px-1.5 py-0.5 rounded bg-dark-bgTertiary border border-dark-border text-text-secondary text-[9px] hover:border-accent-primary hover:text-accent-primary"
                        onClick={() => { cloneToChannel(menuEvent.id, i); setContextMenu(null); }}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                className="w-full text-left px-3 py-1 text-accent-error hover:bg-accent-error/10 border-t border-dark-border"
                onClick={() => { deleteEvent(menuEvent.id); setContextMenu(null); }}
              >
                Delete event
              </button>
            </>
          ) : (
            <>
              <div className="px-3 py-1 text-text-muted text-[10px] border-b border-dark-border">
                Dub lane · {lane?.events.length ?? 0} events
              </div>
              <button
                className="w-full text-left px-3 py-1 text-accent-error hover:bg-accent-error/10"
                onClick={() => { clearAll(); setContextMenu(null); }}
                disabled={!lane || lane.events.length === 0}
              >
                Clear all events on this pattern
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
};
