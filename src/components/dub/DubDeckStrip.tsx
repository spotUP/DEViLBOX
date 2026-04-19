/**
 * DubDeckStrip — the tracker's edit-mode bottom strip for dub performance.
 *
 * Scope:
 * - Header: Bus ON/OFF, REC arm, event count, KILL
 * - Globals row: 10 chip buttons for song-wide moves
 * - Per-channel rows: [M T E ✦] op buttons + sustained dub-hold toggle + dub-send knob
 * - Lane timeline: recorded events as clickable bars
 *
 * Everything routes through DubRouter.fire → audio, and DubRecorder captures
 * into the current pattern's dubLane when armed. Keyboard bindings live with
 * Full-Screen Dub Mode (spec task) since every letter in edit mode has a
 * note-entry meaning.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDubStore } from '@/stores/useDubStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useMixerStore } from '@/stores/useMixerStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { setDubBusForRouter, subscribeDubRouter, fire as fireDub } from '@/engine/dub/DubRouter';
import { startDubRecorder } from '@/engine/dub/DubRecorder';
import { dubLanePlayer } from '@/engine/dub/DubLanePlayer';
import { ensureDrumPadEngine } from '@hooks/drumpad/useMIDIPadRouting';
import { getChannelRoutedEffectsManager } from '@/engine/tone/ChannelRoutedEffects';
import { getToneEngine } from '@/engine/ToneEngine';
import { Knob } from '@components/controls/Knob';
import { DubLaneTimeline } from './DubLaneTimeline';

// ─── Per-channel ops ────────────────────────────────────────────────────────
// Each channel strip shows these 4 buttons alongside the hold-toggle + send
// knob. Label/title/moveId tuple keeps the rendering loop tight.
const CHANNEL_OPS: Array<{ label: string; title: string; moveId: string; color: string; kind: 'trigger' | 'hold' }> = [
  { label: 'M',  title: 'Mute — silence this channel while held',          moveId: 'channelMute',  color: 'accent-error',      kind: 'hold' },
  { label: 'T',  title: 'Throw — long echoThrow (4 beats + heavy tail)',   moveId: 'channelThrow', color: 'accent-primary/70', kind: 'trigger' },
  { label: 'E',  title: 'Echo Throw — open tap + feedback spike',          moveId: 'echoThrow',    color: 'accent-primary',    kind: 'trigger' },
  { label: '✦', title: 'Dub Stab — short-sharp echo kiss',                 moveId: 'dubStab',      color: 'accent-highlight',  kind: 'trigger' },
];

// ─── Global moves ──────────────────────────────────────────────────────────
const GLOBAL_MOVES: Array<{ label: string; title: string; moveId: string; color: string; kind: 'trigger' | 'hold' }> = [
  { label: 'SLAM',   title: 'Spring Slam — instant splash of spring reverb',       moveId: 'springSlam',        color: 'accent-success',       kind: 'trigger' },
  { label: 'FILT',   title: 'Filter Drop — LPF sweeps down while held',            moveId: 'filterDrop',        color: 'accent-secondary',     kind: 'hold' },
  { label: 'SIREN',  title: 'Dub Siren — echo self-oscillation while held',        moveId: 'dubSiren',          color: 'accent-warning',       kind: 'hold' },
  { label: 'WOBBLE', title: 'Tape Wobble — LFO on echo rate while held',           moveId: 'tapeWobble',        color: 'accent-warning/70',    kind: 'hold' },
  { label: 'CRACK',  title: 'Snare Crack — noise burst through bus',               moveId: 'snareCrack',        color: 'text-primary',         kind: 'trigger' },
  { label: 'DELAY',  title: 'Delay-Time Throw — echo rate sweep (pitch whoosh)',   moveId: 'delayTimeThrow',    color: 'accent-highlight/70',  kind: 'trigger' },
  { label: 'BACK',   title: 'Backward Reverb — last 0.8 s reversed through bus',   moveId: 'backwardReverb',    color: 'accent-highlight',     kind: 'trigger' },
  { label: 'DROP',   title: 'Master Drop — mute dry while held; bus tail survives', moveId: 'masterDrop',       color: 'accent-error/70',      kind: 'hold' },
  { label: 'STOP',   title: 'Tape Stop — bus LPF + echo-rate collapse',            moveId: 'tapeStop',          color: 'accent-secondary/70',  kind: 'trigger' },
  { label: 'STOP!',  title: 'Transport Tape Stop — real tempo+pitch slowdown (LibOpenMPT only)', moveId: 'transportTapeStop', color: 'accent-error', kind: 'trigger' },
  { label: 'TOAST',  title: 'Toast — route DJ mic into bus while held (DJ mic must be started)', moveId: 'toast', color: 'accent-success/70', kind: 'hold' },
];

// Map color tokens to button class fragments. Keeps Tailwind's JIT happy —
// we can't build class names dynamically with string concatenation.
const colorClasses = (token: string, active: boolean) => {
  const base = 'px-1.5 py-0.5 rounded border text-[9px] font-bold transition-all duration-150 ';
  switch (token) {
    case 'accent-primary':      return base + (active ? 'bg-accent-primary text-text-inverse border-accent-primary shadow-[0_0_6px_var(--color-accent-primary)]' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-primary hover:text-accent-primary');
    case 'accent-primary/70':   return base + (active ? 'bg-accent-primary/70 text-text-inverse border-accent-primary/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-primary/70 hover:text-accent-primary');
    case 'accent-secondary':    return base + (active ? 'bg-accent-secondary text-text-inverse border-accent-secondary' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-secondary hover:text-accent-secondary');
    case 'accent-secondary/70': return base + (active ? 'bg-accent-secondary/70 text-text-inverse border-accent-secondary/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-secondary/70 hover:text-accent-secondary');
    case 'accent-highlight':    return base + (active ? 'bg-accent-highlight text-text-inverse border-accent-highlight' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-highlight hover:text-accent-highlight');
    case 'accent-highlight/70': return base + (active ? 'bg-accent-highlight/70 text-text-inverse border-accent-highlight/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-highlight/70 hover:text-accent-highlight');
    case 'accent-warning':      return base + (active ? 'bg-accent-warning text-text-inverse border-accent-warning' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-warning hover:text-accent-warning');
    case 'accent-warning/70':   return base + (active ? 'bg-accent-warning/70 text-text-inverse border-accent-warning/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-warning/70 hover:text-accent-warning');
    case 'accent-error':        return base + (active ? 'bg-accent-error text-text-inverse border-accent-error' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-error hover:text-accent-error');
    case 'accent-error/70':     return base + (active ? 'bg-accent-error/70 text-text-inverse border-accent-error/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-error/70 hover:text-accent-error');
    case 'accent-success':      return base + (active ? 'bg-accent-success text-text-inverse border-accent-success' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-success hover:text-accent-success');
    case 'accent-success/70':   return base + (active ? 'bg-accent-success/70 text-text-inverse border-accent-success/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-success/70 hover:text-accent-success');
    case 'text-primary':        return base + (active ? 'bg-text-primary text-dark-bg border-text-primary' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-text-primary hover:text-text-primary');
    default:                    return base + 'bg-dark-bgTertiary border-dark-border text-text-muted';
  }
};

export const DubDeckStrip: React.FC = () => {
  const armed = useDubStore(s => s.armed);
  const setArmed = useDubStore(s => s.setArmed);
  const lastCapturedAt = useDubStore(s => s.lastCapturedAt);

  const busEnabled = useDrumPadStore(s => s.dubBus.enabled);
  const setDubBus = useDrumPadStore(s => s.setDubBus);
  const dubBusSettings = useDrumPadStore(s => s.dubBus);

  const channels = useMixerStore(s => s.channels);
  const setChannelDubSend = useMixerStore(s => s.setChannelDubSend);
  const patternIdx = useTrackerStore(s => s.currentPatternIndex);
  const pattern = useTrackerStore(s => s.patterns[patternIdx]);

  // Click-flash per channel (kept for visual feedback on Echo Throw fire).
  const [flashedChannel, setFlashedChannel] = useState<number | null>(null);
  useEffect(() => {
    if (flashedChannel === null) return;
    const t = setTimeout(() => setFlashedChannel(null), 400);
    return () => clearTimeout(t);
  }, [flashedChannel]);

  // Dub-hold state — sustained Echo Throw on a channel (one tap open for as
  // long as the toggle is on). Decoupled from the M/T/E/✦ row so the user
  // can leave a tap open while firing stabs.
  const [heldChannels, setHeldChannels] = useState<Set<number>>(new Set());
  const heldReleasers = useRef<Map<number, () => void>>(new Map());

  // Generic per-move "active hold" tracking — covers channel-scoped holds
  // (e.g. channelMute per channel) AND global holds (filterDrop, dubSiren,
  // tapeWobble, masterDrop, toast). Keyed by `${moveId}:${channelId ?? 'g'}`
  // so a single pointer press/release cycle maps cleanly to fire → dispose.
  const activeHolds = useRef<Map<string, () => void>>(new Map());

  const [heldMoves, setHeldMoves] = useState<Set<string>>(new Set());

  const releaseAllHeld = useCallback(() => {
    for (const release of heldReleasers.current.values()) {
      try { release(); } catch { /* ok */ }
    }
    heldReleasers.current.clear();
    setHeldChannels(new Set());
    for (const release of activeHolds.current.values()) {
      try { release(); } catch { /* ok */ }
    }
    activeHolds.current.clear();
    setHeldMoves(new Set());
  }, []);

  useEffect(() => {
    const handler = () => releaseAllHeld();
    window.addEventListener('dub-panic', handler);
    return () => window.removeEventListener('dub-panic', handler);
  }, [releaseAllHeld]);
  useEffect(() => {
    if (!busEnabled) releaseAllHeld();
  }, [busEnabled, releaseAllHeld]);
  useEffect(() => releaseAllHeld, [releaseAllHeld]);

  useEffect(() => {
    const engine = ensureDrumPadEngine();
    const bus = engine.getDubBus();
    setDubBusForRouter(bus);
    try {
      const mgr = getChannelRoutedEffectsManager(getToneEngine().masterEffectsInput);
      mgr.setupDubBusWiring(bus.inputNode);
    } catch (e) {
      console.warn('[DubDeckStrip] setupDubBusWiring failed:', e);
    }
    return () => setDubBusForRouter(null);
  }, []);

  useEffect(() => {
    try {
      ensureDrumPadEngine().setDubBusSettings(dubBusSettings);
    } catch (e) {
      console.warn('[DubDeckStrip] setDubBusSettings failed:', e);
    }
  }, [dubBusSettings]);

  useEffect(() => {
    return startDubRecorder();
  }, []);

  useEffect(() => {
    return subscribeDubRouter((ev) => {
      if (ev.moveId !== 'echoThrow') return;
      if (ev.source !== 'live') return;
      if (ev.channelId === undefined) return;
      setFlashedChannel(ev.channelId);
    });
  }, []);

  useEffect(() => {
    dubLanePlayer.setLane(pattern?.dubLane ?? null);
  }, [pattern]);

  const visibleChannelCount = pattern?.channels.length ?? 4;
  useEffect(() => {
    if (!busEnabled) return;
    const nothingConfigured = channels.slice(0, visibleChannelCount).every(c => (c?.dubSend ?? 0) === 0);
    if (!nothingConfigured) return;
    for (let i = 0; i < visibleChannelCount; i++) {
      setChannelDubSend(i, 0.4);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busEnabled, visibleChannelCount, setChannelDubSend]);

  const capturedRecently = lastCapturedAt !== null && (performance.now() - lastCapturedAt) < 300;
  const setFullScreen = useDubStore(s => s.setFullScreen);

  // Enter Full-Screen Dub Mode via backtick (`). Spec originally proposed
  // Tab but that already toggles next/prev channel in the pattern editor
  // (PatternEditorCanvas.tsx:1188). Backtick is unbound in every tracker
  // scheme and sits under the Esc row for one-finger muscle-memory.
  // Works from anywhere in the app (tracker view) as long as focus isn't
  // inside a text input.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '`') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setFullScreen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setFullScreen]);

  // Sustained-hold channel tap (Echo Throw baseline).
  const toggleHold = useCallback((channelId: number) => {
    if (!busEnabled) return;
    const engine = ensureDrumPadEngine();
    const bus = engine.getDubBus();
    const isHeld = heldReleasers.current.has(channelId);
    if (isHeld) {
      const release = heldReleasers.current.get(channelId);
      heldReleasers.current.delete(channelId);
      setHeldChannels(prev => { const n = new Set(prev); n.delete(channelId); return n; });
      try { release?.(); } catch { /* ok */ }
    } else {
      const release = bus.openChannelTap(channelId, 1.0, 0.02);
      heldReleasers.current.set(channelId, release);
      setHeldChannels(prev => new Set(prev).add(channelId));
    }
  }, [busEnabled]);

  // Generic move-button pointer handler. Works for both triggers and holds;
  // the CHANNEL_OPS/GLOBAL_MOVES `kind` field picks the right semantics.
  const fireMove = useCallback((moveId: string, kind: 'trigger' | 'hold', channelId?: number) => {
    if (!busEnabled) return;
    const key = `${moveId}:${channelId ?? 'g'}`;
    if (kind === 'trigger') {
      fireDub(moveId, channelId);
      return;
    }
    // hold — already active? treat pointerdown on an active hold as a release
    const existing = activeHolds.current.get(key);
    if (existing) {
      activeHolds.current.delete(key);
      setHeldMoves(prev => { const n = new Set(prev); n.delete(key); return n; });
      try { existing(); } catch { /* ok */ }
      return;
    }
    const disp = fireDub(moveId, channelId);
    if (disp) {
      activeHolds.current.set(key, () => disp.dispose());
      setHeldMoves(prev => new Set(prev).add(key));
    }
  }, [busEnabled]);

  return (
    <div className="flex flex-col gap-1 px-2 py-1 bg-dark-bgSecondary border-t border-dark-border font-mono">
      {/* Header row */}
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
          className="px-2 py-0.5 rounded border border-accent-primary text-accent-primary hover:bg-accent-primary/10"
          onClick={() => setFullScreen(true)}
          title="Enter Full-Screen Dub Mode (key: ` backtick)"
        >
          DUB MODE
          <kbd className="ml-1 px-1 py-0.5 text-[8px] bg-dark-bgTertiary border border-dark-borderLight rounded">`</kbd>
        </button>
        <button
          className="px-2 py-0.5 rounded bg-accent-error text-text-inverse font-semibold hover:bg-accent-error/80"
          onClick={() => window.dispatchEvent(new Event('dub-panic'))}
          title="Drain the bus + disarm recording"
        >
          KILL
        </button>
      </div>

      {/* Globals row */}
      <div className="flex items-center gap-1 text-[9px]">
        <span className="text-text-muted w-14 shrink-0">GLOBAL ▸</span>
        <div className="flex gap-1 flex-wrap">
          {GLOBAL_MOVES.map((m) => {
            const key = `${m.moveId}:g`;
            const active = heldMoves.has(key);
            return (
              <button
                key={m.moveId}
                className={colorClasses(m.color, active)}
                onClick={() => fireMove(m.moveId, m.kind)}
                title={m.title + (m.kind === 'hold' ? ' (click to toggle hold)' : '')}
                disabled={!busEnabled}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Per-channel rows — hold toggle + 4 ops + dub-send knob */}
      <div className="flex flex-col gap-0.5 text-[9px]">
        {Array.from({ length: visibleChannelCount }, (_, i) => {
          const ch = channels[i];
          const dubSend = ch?.dubSend ?? 0;
          const hasDubSend = dubSend > 0;
          const isHeld = heldChannels.has(i);
          const isFlashed = i === flashedChannel;
          return (
            <div key={i} className="flex items-center gap-1">
              <span className="text-text-muted w-14 shrink-0">CH {i + 1}</span>
              <button
                className={
                  'px-1.5 py-0.5 rounded border min-w-[28px] text-[9px] font-bold transition-all duration-150 ' +
                  (isHeld
                    ? 'bg-accent-primary border-accent-primary text-text-inverse shadow-[0_0_8px_var(--color-accent-primary)]'
                    : isFlashed
                      ? 'bg-accent-highlight/30 border-accent-highlight text-accent-highlight'
                      : hasDubSend
                        ? 'bg-dark-bgTertiary border-dark-borderLight text-text-primary hover:border-accent-primary'
                        : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
                }
                onClick={() => toggleHold(i)}
                title={`Ch ${i + 1}${ch ? ' · ' + ch.name : ''} — click to ${isHeld ? 'STOP' : 'START'} sustained dubbing. Multiple channels can dub simultaneously.`}
                disabled={!busEnabled}
              >
                HOLD
              </button>
              {CHANNEL_OPS.map((op) => {
                const key = `${op.moveId}:${i}`;
                const active = heldMoves.has(key);
                return (
                  <button
                    key={op.moveId}
                    className={colorClasses(op.color, active)}
                    onClick={() => fireMove(op.moveId, op.kind, i)}
                    title={`Ch ${i + 1} · ${op.title}${op.kind === 'hold' ? ' (click to toggle hold)' : ''}`}
                    disabled={!busEnabled}
                  >
                    {op.label}
                  </button>
                );
              })}
              <Knob
                value={dubSend}
                min={0}
                max={1}
                size="sm"
                onChange={(v) => setChannelDubSend(i, v)}
                title={`Ch ${i + 1} dub send — ${Math.round(dubSend * 100)}%`}
                disabled={!busEnabled}
                hideValue
                formatValue={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          );
        })}
      </div>

      {/* Lane timeline */}
      <DubLaneTimeline />
    </div>
  );
};
