/**
 * PadGrid - 4x4 grid of drum pads (MPC-style)
 *
 * Audio triggering is delegated to useMIDIPadRouting (shared with DJ/VJ views).
 * This component handles UI concerns: visual feedback, keyboard nav, context menu.
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { PadButton } from './PadButton';
import { DubBusPanel } from '../dub/DubBusPanel';
import { getDJEngineIfActive } from '@/engine/dj/DJEngine';
import { ContextMenu, useContextMenu } from '@components/common/ContextMenu';
import { usePadContextMenu } from '@/hooks/drumpad/usePadContextMenu';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { getAudioContext } from '../../audio/AudioContextSingleton';
import { useOrientation } from '@hooks/useOrientation';
import type { PadBank } from '../../types/drumpad';
import { getBankPads } from '../../types/drumpad';
import { useMIDIPadRouting, clearDubReleasers } from '@/hooks/drumpad/useMIDIPadRouting';
import { useTransportStore } from '../../stores/useTransportStore';
import { useDJStore } from '../../stores/useDJStore';
import { bpmSyncedEchoRate, getActiveBpm } from '@/engine/dub/DubActions';

interface PadGridProps {
  onPadSelect: (padId: number) => void;
  onLoadSample?: (padId: number) => void;
  selectedPadId: number | null;
  performanceMode?: boolean;
}

export const PadGrid: React.FC<PadGridProps> = ({
  onPadSelect,
  onLoadSample,
  selectedPadId,
  performanceMode = false,
}) => {
  // ── Shared full-featured pad engine (also handles MIDI routing) ──
  const { triggerPad: hookTriggerPad, releasePad: hookReleasePad, releaseAllHeld, engineRef } = useMIDIPadRouting();

  // Context menu state
  const contextMenu = useContextMenu();
  const [contextMenuPadId, setContextMenuPadId] = useState<number | null>(null);

  // Track velocity for each pad (for visual feedback)
  const [padVelocities, setPadVelocities] = useState<Record<number, number>>({});
  const velocityTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Track focused pad for keyboard navigation (uses bank-relative IDs)
  const [focusedPadId, setFocusedPadId] = useState<number>(1);

  // Current bank
  const { currentBank, setBank } = useDrumPadStore();

  const { isPortrait } = useOrientation();
  const gridCols = isPortrait ? 2 : 4;

  const { programs, currentProgramId } = useDrumPadStore();
  const currentProgram = programs.get(currentProgramId);
  const controllerPadCount = useDrumPadStore(s => s.controllerPadCount);
  const visiblePads = Math.min(controllerPadCount, 8);

  // Grid container ref for keyboard focus
  const gridRef = useRef<HTMLDivElement>(null);

  // Reset focused pad and clear visual state when bank changes
  useEffect(() => {
    const bankOffset = { A: 0, B: 8 }[currentBank];
    setFocusedPadId(bankOffset + 1);
    setPadVelocities({});
    releaseAllHeld();
  }, [currentBank, releaseAllHeld]);

  // Dub Bus settings mirror — push store state to the audio engine.
  // Only re-run when fields that affect the engine actually change.
  // Previous version depended on the entire `dubBus` object and spread
  // it into setDubBusSettings on every slider pixel — causing heavy
  // AudioParam scheduling + React re-render stutter. Now we split into
  // two effects: one for echo-rate sync (BPM-dependent, needs specific
  // fields) and one for everything else (uses a JSON key to detect real
  // changes).
  const dubBus = useDrumPadStore((s) => s.dubBus);
  const transportBpm = useTransportStore((s) => s.bpm);
  // Subscribe to deck-relevant fields so the effect re-runs when ANY
  // source of "active BPM" changes (deck swaps, crossfader moves, etc.).
  const djDeckSig = useDJStore((s) =>
    `${s.decks.A.isPlaying ? s.decks.A.beatGrid?.bpm || s.decks.A.detectedBPM : 0}|` +
    `${s.decks.B.isPlaying ? s.decks.B.beatGrid?.bpm || s.decks.B.detectedBPM : 0}|` +
    `${s.decks.C.isPlaying ? s.decks.C.beatGrid?.bpm || s.decks.C.detectedBPM : 0}|` +
    `${s.crossfaderPosition}`
  );
  // Stable ref to the latest dubBus so the settings-push effect can
  // read it without depending on it (avoids re-triggering on every
  // slider pixel).
  const dubBusRef = useRef(dubBus);
  dubBusRef.current = dubBus;
  // Echo-rate sync — only depends on the fields that affect BPM sync.
  useEffect(() => {
    const bpm = getActiveBpm();
    const synced = bpmSyncedEchoRate(bpm, dubBus.echoSyncDivision, dubBus.echoRateMs);
    engineRef.current?.setDubBusSettings({ echoRateMs: synced });
  }, [dubBus.echoSyncDivision, dubBus.echoRateMs, transportBpm, djDeckSig, engineRef]);
  // Full settings push — debounced to avoid flooding the engine with
  // AudioParam writes during slider drags. 50ms is fast enough that the
  // engine stays in sync but slow enough to skip intermediate pixels.
  useEffect(() => {
    const h = setTimeout(() => {
      const bus = dubBusRef.current;
      const bpm = getActiveBpm();
      const synced = bpmSyncedEchoRate(bpm, bus.echoSyncDivision, bus.echoRateMs);
      engineRef.current?.setDubBusSettings({ ...bus, echoRateMs: synced });
    }, 50);
    return () => clearTimeout(h);
  }, [dubBus, engineRef]);

  // DJ mixer (re-)attach runs ONCE on mount (and retries once a few ms later
  // in case the DJ engine mounted after the pad-engine singleton was created).
  // Must NOT run on every dubBus change — a re-attach disconnects/reconnects
  // masterGain, which under load produces an audible click.
  useEffect(() => {
    const attach = () => {
      const engine = engineRef.current;
      if (!engine) return false;
      try {
        const dj = getDJEngineIfActive();
        if (dj) { engine.attachDJMixer(dj.mixer); return true; }
      } catch { /* DJ engine not available — dub throws fall back to no-op */ }
      return false;
    };
    if (!attach()) {
      const t = setTimeout(attach, 200);
      return () => clearTimeout(t);
    }
  }, [engineRef]);

  // ── Dub / DJ panic listeners ──
  // `dub-panic` fires from the "KILL" button in the Dub Bus popover and from
  // ESC in the drumpad view. Drains the bus via the engine then flips the
  // store flag so the UI reflects the dead state.
  // `dj-panic` is the broader panic from the DJ view's ESC and from our own
  // drumpad ESC — must ALSO release every held pad (dub hold, DJ FX sustain,
  // PTT, synth note, sample sustain) plus stop every voice on the engine.
  // Without this, a held pad at ESC time continues ringing after the panic
  // "clears" everything else.
  useEffect(() => {
    const onDubPanic = () => {
      engineRef.current?.dubPanic();
      // Clear hook-side releasers too — engine-side cancels already ran
      // inside dubPanic, but _dubReleasers still holds stale entries that
      // would fire no-op cancels on the next pad release.
      clearDubReleasers();
      useDrumPadStore.getState().setDubBus({ enabled: false });
    };
    const onDjPanic = () => {
      // Order matters: release hold-state first so per-action disengage
      // (DJ FX, PTT, synth noteOff) runs before we kill the bus + voices.
      releaseAllHeld();
      engineRef.current?.stopAll();
      engineRef.current?.dubPanic();
      clearDubReleasers();
      // Sync the store flag so the Dub Bus UI reflects the kill.
      useDrumPadStore.getState().setDubBus({ enabled: false });
    };
    window.addEventListener('dub-panic', onDubPanic);
    window.addEventListener('dj-panic', onDjPanic);
    return () => {
      window.removeEventListener('dub-panic', onDubPanic);
      window.removeEventListener('dj-panic', onDjPanic);
    };
  }, [engineRef, releaseAllHeld]);

  // Clean up velocity fade timers on unmount
  useEffect(() => {
    return () => {
      Object.values(velocityTimersRef.current).forEach(t => clearTimeout(t));
    };
  }, []);

  // ── External-trigger visual feedback ──
  // MIDI / keyboard / programmatic triggers call into the hook's triggerPad
  // directly and never hit handlePadTrigger. Mirror the velocity-flash
  // behavior by listening for the hook's `drumpad-trigger` event so the
  // on-screen pad lights up regardless of trigger source.
  useEffect(() => {
    const onExternalTrigger = (ev: Event) => {
      const detail = (ev as CustomEvent<{ padId: number; velocity: number }>).detail;
      if (!detail) return;
      const { padId, velocity } = detail;
      setPadVelocities(prev => ({ ...prev, [padId]: velocity }));
      if (velocityTimersRef.current[padId]) clearTimeout(velocityTimersRef.current[padId]);
      velocityTimersRef.current[padId] = setTimeout(() => {
        setPadVelocities(prev => ({ ...prev, [padId]: 0 }));
        delete velocityTimersRef.current[padId];
      }, 200);
    };
    window.addEventListener('drumpad-trigger', onExternalTrigger);
    return () => window.removeEventListener('drumpad-trigger', onExternalTrigger);
  }, []);

  // ── Pad trigger wrapper: delegates to hook + adds visual feedback ──
  const handlePadTrigger = useCallback((padId: number, velocity: number) => {
    hookTriggerPad(padId, velocity);

    // Visual feedback AFTER audio
    setPadVelocities(prev => ({ ...prev, [padId]: velocity }));
    if (velocityTimersRef.current[padId]) {
      clearTimeout(velocityTimersRef.current[padId]);
    }
    velocityTimersRef.current[padId] = setTimeout(() => {
      setPadVelocities(prev => ({ ...prev, [padId]: 0 }));
      delete velocityTimersRef.current[padId];
    }, 200);
  }, [hookTriggerPad]);

  // ── Pad release wrapper ──
  const handlePadRelease = useCallback((padId: number) => {
    hookReleasePad(padId);
  }, [hookReleasePad]);

  // Get pads for current bank (memoized for performance)
  const bankPads = useMemo(() => {
    if (!currentProgram) return [];
    return getBankPads(currentProgram.pads, currentBank);
  }, [currentProgram, currentBank]);

  // Arrange pads in rows, bottom-up (MPC layout: pad 1 = bottom-left)
  const rows = useMemo(() => {
    if (bankPads.length === 0) return [];
    const pads = bankPads.slice(0, visiblePads);
    const result: typeof bankPads[] = [];
    for (let i = 0; i < pads.length; i += gridCols) {
      result.push(pads.slice(i, i + gridCols));
    }
    result.reverse();
    return result;
  }, [bankPads, visiblePads, gridCols]);

  // Keyboard navigation (arrow keys) - bank-aware
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      const bankOffset = { A: 0, B: 8 }[currentBank];
      const bankStart = bankOffset + 1;
      const bankEnd = bankOffset + visiblePads;

      let newFocusedId = focusedPadId;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          newFocusedId = focusedPadId > bankStart ? focusedPadId - 1 : bankEnd;
          break;
        case 'ArrowRight':
          event.preventDefault();
          newFocusedId = focusedPadId < bankEnd ? focusedPadId + 1 : bankStart;
          break;
        case 'ArrowUp':
          event.preventDefault();
          newFocusedId = focusedPadId <= bankEnd - gridCols
            ? focusedPadId + gridCols
            : focusedPadId - (visiblePads - gridCols);
          break;
        case 'ArrowDown':
          event.preventDefault();
          newFocusedId = focusedPadId > bankStart + (gridCols - 1)
            ? focusedPadId - gridCols
            : focusedPadId + (visiblePads - gridCols);
          break;
        case 'Enter':
        case ' ':
          if (!event.repeat) {
            event.preventDefault();
            handlePadTrigger(focusedPadId, 100);
          }
          break;
        case 'Tab':
          if (event.shiftKey) {
            newFocusedId = focusedPadId > bankStart ? focusedPadId - 1 : bankEnd;
          } else {
            newFocusedId = focusedPadId < bankEnd ? focusedPadId + 1 : bankStart;
          }
          break;
        default:
          return;
      }

      if (newFocusedId !== focusedPadId) {
        setFocusedPadId(newFocusedId);
        const pad = currentProgram?.pads.find(p => p.id === newFocusedId);
        if (pad) {
          let liveRegion = document.getElementById('pad-navigation-announcer');
          if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'pad-navigation-announcer';
            liveRegion.setAttribute('role', 'status');
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.className = 'sr-only';
            document.body.appendChild(liveRegion);
          }
          liveRegion.textContent = `Pad ${pad.id}: ${pad.name}${pad.sample ? '' : ' (empty)'}`;
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT'
        ) {
          return;
        }
        event.preventDefault();
        handlePadRelease(focusedPadId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [focusedPadId, currentProgram, currentBank, visiblePads, gridCols, handlePadTrigger, handlePadRelease]);

  if (!currentProgram) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        No program loaded
      </div>
    );
  }

  const handleQuickAssign = useCallback((padId: number, x: number, y: number) => {
    setContextMenuPadId(padId);
    const event = { clientX: x, clientY: y, preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent;
    contextMenu.open(event);
  }, [contextMenu]);

  const contextMenuCallbacks = useMemo(() => ({
    onEdit: (id: number) => onPadSelect(id),
    onPreview: (id: number) => {
      // Use the full hook path — NOT engine.triggerPad directly — so Preview
      // honours every pad action kind (synth attack, DJ FX engage, dub
      // action, scratch, PTT) AND schedules a matching release ~300 ms later.
      // The direct engine.triggerPad(pad, 100) call previously bypassed all
      // of that, so previewing a sustain-mode synth pad or a dub-hold pad
      // from the context menu left the pad stuck.
      hookTriggerPad(id, 100);
      setTimeout(() => hookReleasePad(id), 300);
    },
    onRename: (id: number) => {
      const prog = useDrumPadStore.getState().programs.get(useDrumPadStore.getState().currentProgramId);
      const p = prog?.pads.find(pp => pp.id === id);
      const newName = window.prompt('Pad name:', p?.name || `Pad ${id}`);
      if (newName !== null) {
        useDrumPadStore.getState().updatePad(id, { name: newName });
      }
    },
    onLoadSample: (id: number) => {
      if (onLoadSample) {
        onLoadSample(id);
      } else {
        onPadSelect(id);
      }
    },
  }), [onPadSelect, onLoadSample, engineRef, hookTriggerPad, hookReleasePad]);

  const contextMenuItems = usePadContextMenu(contextMenuPadId, contextMenuCallbacks);

  const bankButtons: PadBank[] = ['A', 'B'];
  const bankLoadedCount = bankPads.slice(0, visiblePads).filter(p => p.sample !== null || p.synthConfig || p.instrumentId != null).length;
  const totalLoadedCount = currentProgram.pads.filter(p => p.sample !== null || p.synthConfig || p.instrumentId != null).length;

  return (
    <div className="flex flex-col gap-2 p-3 h-full overflow-hidden">
      {/* Program info + export/import (hidden in performance mode) */}
      {!performanceMode && (
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-bold text-text-primary">{currentProgram.name}</div>
          <div className="text-xs text-text-muted font-mono">{currentProgram.id}</div>
        </div>
        <div className="flex items-center gap-2">
          <DubBusPanel />
          <button
            onClick={() => engineRef.current?.stopAll()}
            className="px-2 py-1 text-[10px] font-mono text-text-muted hover:text-red-400 bg-dark-surface border border-dark-border rounded transition-colors"
            title="Stop all playing pads"
          >
            Stop All
          </button>
          <button
            onClick={async () => {
              const blob = await useDrumPadStore.getState().exportAllConfigs();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${currentProgram.name || 'drumpad'}.dvbpads`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-2 py-1 text-[10px] font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded transition-colors"
            title="Export all programs + samples"
          >
            Export
          </button>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.dvbpads';
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const audioContext = getAudioContext();
                  await useDrumPadStore.getState().importConfigs(file, audioContext);
                } catch (err) {
                  console.error('[PadGrid] Import failed:', err);
                }
              };
              input.click();
            }}
            className="px-2 py-1 text-[10px] font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded transition-colors"
            title="Import programs + samples (.dvbpads)"
          >
            Import
          </button>
          <div className="text-xs text-text-muted" title={`${totalLoadedCount} samples across all banks`}>
            {bankLoadedCount}/{visiblePads} ({totalLoadedCount}/16)
          </div>
        </div>
      </div>
      )}

      {/* Bank selector */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] font-mono text-text-muted mr-1">BANK</span>
        {bankButtons.map(bank => (
          <button
            key={bank}
            onClick={() => setBank(bank)}
            className={`px-3 py-1 text-xs font-bold font-mono rounded transition-colors ${
              currentBank === bank
                ? 'bg-accent-primary text-text-primary'
                : 'bg-dark-surface border border-dark-border text-text-muted hover:text-text-primary'
            }`}
          >
            {bank}
          </button>
        ))}
      </div>

      {/* Responsive Pad Grid — 8 pads (4x2 landscape, 2x4 portrait) */}
      <div
        ref={gridRef}
        className={`grid flex-1 min-h-0 ${performanceMode ? 'gap-3' : 'gap-1.5'} ${gridCols === 2 ? 'grid-cols-2' : 'grid-cols-4'}`}
        style={{ gridTemplateRows: `repeat(${gridCols === 2 ? 4 : 2}, 1fr)` }}
        role="grid"
        aria-label="Drum pad grid"
      >
        {rows.flat().map((pad) => (
          <PadButton
            key={pad.id}
            pad={pad}
            isSelected={selectedPadId === pad.id}
            isFocused={focusedPadId === pad.id}
            velocity={padVelocities[pad.id] || 0}
            onTrigger={handlePadTrigger}
            onRelease={handlePadRelease}
            onSelect={onPadSelect}
            onFocus={() => setFocusedPadId(pad.id)}
            onQuickAssign={handleQuickAssign}
          />
        ))}
      </div>

      {/* Keyboard hint (hidden in performance mode) */}
      {!performanceMode && (
        <div className="text-[10px] text-text-muted text-center font-mono shrink-0">
          Click/Enter to trigger • Shift+Click to select • Arrow keys to navigate
        </div>
      )}

      {/* Context menu */}
      <ContextMenu
        items={contextMenuItems}
        position={contextMenu.position}
        onClose={() => { contextMenu.close(); setContextMenuPadId(null); }}
      />
    </div>
  );
};
