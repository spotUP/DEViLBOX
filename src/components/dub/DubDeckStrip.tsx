/**
 * DubDeckStrip — the tracker's edit-mode bottom strip for dub performance.
 *
 * Phase 1 scope (vertical slice): REC arm, KILL, per-channel Echo Throw
 * button, lane timeline. The full 8-op-per-channel × 6-global-moves mockup
 * from the spec ships in a later polish phase once those moves exist.
 *
 * Everything routes through DubRouter.fire → audio, and DubRecorder captures
 * into the current pattern's dubLane when armed.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useDubStore } from '@/stores/useDubStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useMixerStore } from '@/stores/useMixerStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { fire, setDubBusForRouter, subscribeDubRouter } from '@/engine/dub/DubRouter';
import { startDubRecorder } from '@/engine/dub/DubRecorder';
import { dubLanePlayer } from '@/engine/dub/DubLanePlayer';
import { ensureDrumPadEngine } from '@hooks/drumpad/useMIDIPadRouting';
import { DubLaneTimeline } from './DubLaneTimeline';

export const DubDeckStrip: React.FC = () => {
  const armed = useDubStore(s => s.armed);
  const setArmed = useDubStore(s => s.setArmed);
  const lastCapturedAt = useDubStore(s => s.lastCapturedAt);

  const busEnabled = useDrumPadStore(s => s.dubBus.enabled);
  const setDubBus = useDrumPadStore(s => s.setDubBus);

  const channels = useMixerStore(s => s.channels);
  const setChannelDubSend = useMixerStore(s => s.setChannelDubSend);
  const patternIdx = useTrackerStore(s => s.currentPatternIndex);
  const pattern = useTrackerStore(s => s.patterns[patternIdx]);

  // Click-flash state — which channel button flashed most recently, driven by
  // both on-screen clicks and the W keybind. Visual-only feedback so users
  // can see which channel their last throw targeted. Fades after 400 ms.
  const [flashedChannel, setFlashedChannel] = useState<number | null>(null);
  useEffect(() => {
    if (flashedChannel === null) return;
    const t = setTimeout(() => setFlashedChannel(null), 400);
    return () => clearTimeout(t);
  }, [flashedChannel]);

  // Register the shared DubBus with the router while this view is mounted,
  // so fire() has somewhere to send events. Cleared on unmount so out-of-
  // tracker-view fire() calls fail loud (warn + no-op) instead of silently
  // routing to a bus that isn't on screen.
  //
  // ensureDrumPadEngine() — the DubBus lives inside DrumPadEngine which is
  // lazily created on first drumpad interaction. Tracker-only sessions never
  // touched the drumpad → engine was null → no bus → silent no-op on fire().
  // Ensuring it here makes the bus available the instant the tracker view
  // mounts.
  useEffect(() => {
    const engine = ensureDrumPadEngine();
    setDubBusForRouter(engine.getDubBus());
    return () => setDubBusForRouter(null);
  }, []);

  // Start the recorder for the lifetime of this component.
  useEffect(() => {
    return startDubRecorder();
  }, []);

  // Flash the button when ANY live Echo Throw fires — keyboard W, UI click,
  // MIDI (future). Lane-replayed events skipped so replay doesn't constantly
  // light up the UI.
  useEffect(() => {
    return subscribeDubRouter((ev) => {
      if (ev.moveId !== 'echoThrow') return;
      if (ev.source !== 'live') return;
      if (ev.channelId === undefined) return;
      setFlashedChannel(ev.channelId);
    });
  }, []);

  // Keep the lane player in sync with the current pattern's dubLane.
  useEffect(() => {
    dubLanePlayer.setLane(pattern?.dubLane ?? null);
  }, [pattern]);

  // Auto-apply a default send on tracker channels when the bus is enabled and
  // nothing is configured yet. Without this, toggling Bus ON and clicking a
  // channel's Echo Throw button would silently no-op (no tap registered in
  // DubBus.channelTaps). Mirrors the drumpad's applySoundSystemToBank flow
  // but targets tracker channels via useMixerStore.setChannelDubSend.
  const visibleChannelCount = pattern?.channels.length ?? 4;
  useEffect(() => {
    if (!busEnabled) return;
    const nothingConfigured = channels.slice(0, visibleChannelCount).every(c => (c?.dubSend ?? 0) === 0);
    if (!nothingConfigured) return;
    for (let i = 0; i < visibleChannelCount; i++) {
      setChannelDubSend(i, 0.4);
    }
  // We intentionally don't depend on `channels` — the effect is about the
  // transition to enabled + first-time setup. Once any channel has dubSend>0
  // this effect no-ops. Future changes are user-driven via the mini-strip.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busEnabled, visibleChannelCount, setChannelDubSend]);

  // REC indicator flash on each capture — drives a brief pulse on the REC pill.
  const capturedRecently = lastCapturedAt !== null && (performance.now() - lastCapturedAt) < 300;

  const fireEchoThrow = useCallback((channelId: number) => {
    if (!busEnabled) {
      console.warn('[DubDeckStrip] Echo Throw ignored — bus is disabled. Click the Dub Bus button.');
      return;
    }
    // Flash immediately on click — doesn't wait for router roundtrip.
    // Keyboard/MIDI paths still get the flash via the router subscription
    // in the mount effect above.
    setFlashedChannel(channelId);
    fire('echoThrow', channelId);
  }, [busEnabled]);

  return (
    <div className="flex flex-col gap-1 px-2 py-1 bg-dark-bgSecondary border-t border-dark-border font-mono">
      {/* Header row: status pills + global controls */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="px-2 py-0.5 rounded border border-dark-borderLight text-text-secondary">
          DUB DECK
        </span>
        <button
          className={
            'px-2 py-0.5 rounded border transition-colors ' +
            (busEnabled
              ? 'bg-accent-primary/10 border-accent-primary text-accent-primary'
              : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
          }
          onClick={() => setDubBus({ enabled: !busEnabled })}
          title={busEnabled ? 'Dub Bus ON — click to disable' : 'Dub Bus OFF — click to enable'}
        >
          Bus {busEnabled ? 'ON' : 'OFF'}
        </button>
        <button
          className={
            'px-2 py-0.5 rounded border transition-colors ' +
            (armed
              ? `bg-accent-error/20 border-accent-error text-accent-error ${capturedRecently ? 'animate-pulse' : ''}`
              : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
          }
          onClick={() => setArmed(!armed)}
          title={armed ? 'Recording — live moves capture to the lane' : 'Click to arm recording'}
          disabled={!busEnabled}
        >
          ● REC {armed ? 'armed' : 'off'}
        </button>
        <span className="flex-1" />
        <span className="text-text-muted">
          {pattern?.dubLane?.events.length ?? 0} events on this pattern
        </span>
        <button
          className="px-2 py-0.5 rounded bg-accent-error text-text-inverse font-semibold hover:bg-accent-error/80"
          onClick={() => window.dispatchEvent(new Event('dub-panic'))}
          title="Drain the bus + disarm recording (Esc)"
        >
          KILL
        </button>
      </div>

      {/* Channel row: Echo Throw button per channel */}
      <div className="flex items-center gap-1 text-[9px]">
        <span className="text-text-muted w-14 shrink-0">CH ▸</span>
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: visibleChannelCount }, (_, i) => {
            const ch = channels[i];
            const hasDubSend = (ch?.dubSend ?? 0) > 0;
            const isFlashed = i === flashedChannel;
            return (
              <button
                key={i}
                className={
                  'px-1.5 py-0.5 rounded border min-w-[28px] transition-all duration-150 ' +
                  (isFlashed
                    ? 'bg-accent-primary border-accent-primary text-text-inverse scale-110 shadow-[0_0_8px_var(--color-accent-primary)]'
                    : hasDubSend
                      ? 'bg-dark-bgTertiary border-dark-borderLight text-text-primary hover:border-accent-primary'
                      : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
                }
                onClick={() => fireEchoThrow(i)}
                title={
                  `Echo Throw ch ${i + 1}${ch ? ' · ' + ch.name : ''}` +
                  (hasDubSend ? ` · send ${Math.round((ch?.dubSend ?? 0) * 100)}%` : ' · no dub send')
                }
                disabled={!busEnabled}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <span className="flex-1" />
        <span className="text-text-muted">
          Press <kbd className="px-1 py-0.5 rounded bg-dark-bgTertiary border border-dark-borderLight">W</kbd> to throw selected channel
        </span>
      </div>

      {/* Lane timeline */}
      <DubLaneTimeline />
    </div>
  );
};
