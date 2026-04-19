/**
 * DubFullScreenMode — the gig shell. Tab to enter/exit from DubDeckStrip.
 *
 * Layout (per design spec 2026-04-19-tracker-dub-studio-design.md §"Full-Screen Dub Mode"):
 *   - Left column (28rem): channel cards — card per row with HOLD + 4 ops + dub-send.
 *     Gig-sized buttons, big labels.
 *   - Center column (flex): 3×N grid of large global-move buttons + lane timeline.
 *   - Right column (14rem): huge red KILL button + REC indicator + status readouts.
 *
 * Keyboard bindings (context-aware — only active when fullScreen is true):
 *   - `           → exit (backtick)
 *   - Esc         → KILL
 *   - Number keys 1..9  → echoThrow on that tracker channel
 *   - Q/W/E/R/T/Y/U/I/O/P/Z → globals row
 *   - Shift + 1..9 → dubStab on that channel
 *
 * Pattern keeps playing across the flip — this is a pure view swap. Bus
 * state, lane events, armed flag, active holds all persist. Same
 * DubRouter, same DubBus, same DubRecorder — just a different surface.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDubStore } from '@/stores/useDubStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useMixerStore } from '@/stores/useMixerStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { fire as fireDub } from '@/engine/dub/DubRouter';
import { ensureDrumPadEngine } from '@hooks/drumpad/useMIDIPadRouting';
import { Fader } from '@components/controls/Fader';
import { DubLaneTimeline } from './DubLaneTimeline';

interface MoveDef {
  label: string;
  title: string;
  moveId: string;
  kind: 'trigger' | 'hold';
  color: string;
  keyBind?: string; // visible keyboard shortcut hint
}

const CHANNEL_OPS: MoveDef[] = [
  { label: 'MUTE',  title: 'Mute channel while held', moveId: 'channelMute',  kind: 'hold',    color: 'accent-error' },
  { label: 'THROW', title: 'Long-form echo throw',    moveId: 'channelThrow', kind: 'trigger', color: 'accent-primary/70' },
  { label: 'ECHO',  title: 'Open tap + feedback',      moveId: 'echoThrow',    kind: 'trigger', color: 'accent-primary' },
  { label: 'STAB',  title: 'Short-sharp echo kiss',    moveId: 'dubStab',      kind: 'trigger', color: 'accent-highlight' },
];

// Ordered for keyboard mapping: Q W E R T Y U I O P Z
const GLOBAL_MOVES: MoveDef[] = [
  { label: 'SLAM',          title: 'Spring splash',              moveId: 'springSlam',        kind: 'trigger', color: 'accent-success',      keyBind: 'Q' },
  { label: 'FILTER',        title: 'LPF sweep down while held',  moveId: 'filterDrop',        kind: 'hold',    color: 'accent-secondary',    keyBind: 'W' },
  { label: 'SIREN',         title: 'Feedback into self-osc',     moveId: 'dubSiren',          kind: 'hold',    color: 'accent-warning',      keyBind: 'E' },
  { label: 'WOBBLE',        title: 'LFO on echo rate',           moveId: 'tapeWobble',        kind: 'hold',    color: 'accent-warning/70',   keyBind: 'R' },
  { label: 'CRACK',         title: 'Noise burst through bus',    moveId: 'snareCrack',        kind: 'trigger', color: 'text-primary',        keyBind: 'T' },
  { label: 'DELAY\nTHROW',  title: 'Echo-rate pitch whoosh',     moveId: 'delayTimeThrow',    kind: 'trigger', color: 'accent-highlight/70', keyBind: 'Y' },
  { label: 'REVERSE',       title: 'Reversed last 0.8 s',        moveId: 'backwardReverb',    kind: 'trigger', color: 'accent-highlight',    keyBind: 'U' },
  { label: 'DROP',          title: 'Mute dry while held',        moveId: 'masterDrop',        kind: 'hold',    color: 'accent-error/70',     keyBind: 'I' },
  { label: 'TAPE\nSTOP',    title: 'Bus-only tape-stop effect',  moveId: 'tapeStop',          kind: 'trigger', color: 'accent-secondary/70', keyBind: 'O' },
  { label: 'TRANSPORT\nSTOP', title: 'Real pitch+tempo halt (LibOpenMPT)', moveId: 'transportTapeStop', kind: 'trigger', color: 'accent-error', keyBind: 'P' },
  { label: 'TOAST',         title: 'Route DJ mic into bus',      moveId: 'toast',             kind: 'hold',    color: 'accent-success/70',   keyBind: 'Z' },
];

// Explicit class map per color token — Tailwind JIT can't parse
// template-literal class names, so every token → active/idle combo is
// spelled out. Same pattern as DubDeckStrip.tsx.
const colorClasses = (token: string, active: boolean, big = false) => {
  const size = big ? 'px-4 py-3 text-base' : 'px-2 py-1 text-xs';
  const base = `${size} rounded border font-bold transition-all duration-150 flex items-center justify-center whitespace-pre-line `;
  switch (token) {
    case 'accent-primary':      return base + (active ? 'bg-accent-primary text-text-inverse border-accent-primary shadow-[0_0_8px_var(--color-accent-primary)]' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-primary hover:text-accent-primary');
    case 'accent-primary/70':   return base + (active ? 'bg-accent-primary/70 text-text-inverse border-accent-primary/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-primary/70 hover:text-accent-primary');
    case 'accent-secondary':    return base + (active ? 'bg-accent-secondary text-text-inverse border-accent-secondary' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-secondary hover:text-accent-secondary');
    case 'accent-secondary/70': return base + (active ? 'bg-accent-secondary/70 text-text-inverse border-accent-secondary/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-secondary/70 hover:text-accent-secondary');
    case 'accent-highlight':    return base + (active ? 'bg-accent-highlight text-text-inverse border-accent-highlight shadow-[0_0_8px_var(--color-accent-highlight)]' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-highlight hover:text-accent-highlight');
    case 'accent-highlight/70': return base + (active ? 'bg-accent-highlight/70 text-text-inverse border-accent-highlight/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-highlight/70 hover:text-accent-highlight');
    case 'accent-warning':      return base + (active ? 'bg-accent-warning text-text-inverse border-accent-warning' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-warning hover:text-accent-warning');
    case 'accent-warning/70':   return base + (active ? 'bg-accent-warning/70 text-text-inverse border-accent-warning/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-warning/70 hover:text-accent-warning');
    case 'accent-error':        return base + (active ? 'bg-accent-error text-text-inverse border-accent-error shadow-[0_0_8px_var(--color-accent-error)]' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-error hover:text-accent-error');
    case 'accent-error/70':     return base + (active ? 'bg-accent-error/70 text-text-inverse border-accent-error/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-error/70 hover:text-accent-error');
    case 'accent-success':      return base + (active ? 'bg-accent-success text-text-inverse border-accent-success' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-success hover:text-accent-success');
    case 'accent-success/70':   return base + (active ? 'bg-accent-success/70 text-text-inverse border-accent-success/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-success/70 hover:text-accent-success');
    case 'text-primary':        return base + (active ? 'bg-text-primary text-dark-bg border-text-primary' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-text-primary hover:text-text-primary');
    default:                    return base + 'bg-dark-bgTertiary border-dark-border text-text-muted';
  }
};

export const DubFullScreenMode: React.FC = () => {
  const fullScreen = useDubStore(s => s.fullScreen);
  const setFullScreen = useDubStore(s => s.setFullScreen);
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

  const [heldMoves, setHeldMoves] = useState<Set<string>>(new Set());
  const activeHolds = useRef<Map<string, () => void>>(new Map());

  const releaseAllHeld = useCallback(() => {
    for (const rel of activeHolds.current.values()) {
      try { rel(); } catch { /* ok */ }
    }
    activeHolds.current.clear();
    setHeldMoves(new Set());
  }, []);

  // Panic releases all holds.
  useEffect(() => {
    const handler = () => releaseAllHeld();
    window.addEventListener('dub-panic', handler);
    return () => window.removeEventListener('dub-panic', handler);
  }, [releaseAllHeld]);

  // Bus-disable or unmount releases all holds — same invariants as the strip.
  useEffect(() => {
    if (!busEnabled) releaseAllHeld();
  }, [busEnabled, releaseAllHeld]);
  useEffect(() => releaseAllHeld, [releaseAllHeld]);

  // Store→bus settings mirror so fullScreen mode keeps the bus in sync even
  // if the user jumped straight here (no DubDeckStrip mount).
  useEffect(() => {
    try {
      ensureDrumPadEngine().setDubBusSettings(dubBusSettings);
    } catch { /* ok */ }
  }, [dubBusSettings]);

  const visibleChannelCount = pattern?.channels.length ?? 4;
  const capturedRecently = lastCapturedAt !== null && (performance.now() - lastCapturedAt) < 300;

  const fireMove = useCallback((moveId: string, kind: 'trigger' | 'hold', channelId?: number) => {
    if (!busEnabled) return;
    const key = `${moveId}:${channelId ?? 'g'}`;
    if (kind === 'trigger') {
      fireDub(moveId, channelId);
      return;
    }
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

  // Map Q..Z-ish letters → global index.
  const globalByKey = useMemo(() => {
    const map: Record<string, MoveDef> = {};
    for (const m of GLOBAL_MOVES) {
      if (m.keyBind) map[m.keyBind] = m;
    }
    return map;
  }, []);

  // Keyboard bindings — scoped to fullScreen being true. Pattern editing
  // keys don't apply here; this is a performance shell.
  useEffect(() => {
    if (!fullScreen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing into an input/textarea/select.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (e.key === '`') {
        e.preventDefault();
        setFullScreen(false);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        window.dispatchEvent(new Event('dub-panic'));
        return;
      }
      if (e.repeat) return;

      // Number keys → echoThrow on that channel (1-indexed for users).
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const n = parseInt(e.key, 10);
        if (!isNaN(n) && n >= 1 && n <= visibleChannelCount) {
          e.preventDefault();
          fireMove('echoThrow', 'trigger', n - 1);
          return;
        }
      }
      // Shift + number → dubStab on that channel.
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // e.code is 'Digit1' regardless of shift — use that for the channel number.
        if (e.code?.startsWith('Digit')) {
          const n = parseInt(e.code.slice(5), 10);
          if (!isNaN(n) && n >= 1 && n <= visibleChannelCount) {
            e.preventDefault();
            fireMove('dubStab', 'trigger', n - 1);
            return;
          }
        }
      }
      // Letter keys → globals (case-insensitive).
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const letter = e.key.toUpperCase();
        const g = globalByKey[letter];
        if (g) {
          e.preventDefault();
          fireMove(g.moveId, g.kind);
          return;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      // Release any letter-bound HOLD globals on keyup.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const letter = e.key.toUpperCase();
      const g = globalByKey[letter];
      if (!g || g.kind !== 'hold') return;
      const key = `${g.moveId}:g`;
      const existing = activeHolds.current.get(key);
      if (existing) {
        activeHolds.current.delete(key);
        setHeldMoves(prev => { const n = new Set(prev); n.delete(key); return n; });
        try { existing(); } catch { /* ok */ }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [fullScreen, globalByKey, visibleChannelCount, fireMove, setFullScreen]);

  if (!fullScreen) return null;

  return (
    <div
      className="fixed inset-0 z-[9500] bg-dark-bg/95 backdrop-blur-sm flex flex-col gap-2 p-4 font-mono"
      role="dialog"
      aria-label="Full-Screen Dub Mode"
    >
      {/* Header */}
      <div className="flex items-center gap-3 text-xs">
        <span className="px-3 py-1 rounded border border-accent-primary text-accent-primary font-bold tracking-wider">
          DUB MODE
        </span>
        <button
          className={
            'px-3 py-1 rounded border transition-colors ' +
            (busEnabled
              ? 'bg-accent-primary/10 border-accent-primary text-accent-primary'
              : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
          }
          onClick={() => setDubBus({ enabled: !busEnabled })}
        >
          Bus {busEnabled ? 'ON' : 'OFF'}
        </button>
        <button
          className={
            'px-3 py-1 rounded border transition-colors ' +
            (armed
              ? `bg-accent-error/20 border-accent-error text-accent-error ${capturedRecently ? 'animate-pulse' : ''}`
              : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
          }
          onClick={() => setArmed(!armed)}
          disabled={!busEnabled}
        >
          ● REC {armed ? 'armed' : 'off'}
        </button>
        <span className="flex-1" />
        <span className="text-text-muted">
          {pattern?.dubLane?.events.length ?? 0} events · pat {patternIdx}
        </span>
        <button
          className="px-3 py-1 rounded border border-dark-borderLight text-text-secondary hover:text-text-primary hover:border-text-primary"
          onClick={() => setFullScreen(false)}
        >
          ` ← Edit mode
        </button>
      </div>

      {/* Body — 3 columns */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* LEFT — channel cards */}
        <div className="w-[28rem] flex flex-col gap-2 overflow-y-auto">
          <div className="text-[11px] text-text-muted px-1">CHANNELS</div>
          {Array.from({ length: visibleChannelCount }, (_, i) => {
            const ch = channels[i];
            const dubSend = ch?.dubSend ?? 0;
            return (
              <div
                key={i}
                className="flex flex-col gap-1 p-2 rounded border border-dark-borderLight bg-dark-bgSecondary"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-text-primary">CH {i + 1}</span>
                  <span className="text-text-muted text-[10px]">
                    {ch?.name ?? ''}
                  </span>
                  <span className="flex-1" />
                  <span className="text-text-muted text-[9px]">
                    <kbd className="px-1 py-0.5 rounded bg-dark-bgTertiary border border-dark-borderLight text-[9px]">{i + 1}</kbd> echo ·
                    <kbd className="ml-1 px-1 py-0.5 rounded bg-dark-bgTertiary border border-dark-borderLight text-[9px]">⇧{i + 1}</kbd> stab
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {CHANNEL_OPS.map((op) => {
                    const key = `${op.moveId}:${i}`;
                    const active = heldMoves.has(key);
                    return (
                      <button
                        key={op.moveId}
                        className={colorClasses(op.color, active)}
                        onClick={() => fireMove(op.moveId, op.kind, i)}
                        title={op.title + (op.kind === 'hold' ? ' (click to toggle)' : '')}
                        disabled={!busEnabled}
                      >
                        {op.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-text-muted">
                  <span className="shrink-0">SEND</span>
                  <Fader
                    value={dubSend}
                    size="md"
                    color="accent-primary"
                    onChange={(v) => setChannelDubSend(i, v)}
                    disabled={!busEnabled}
                    doubleClickValue={1}
                    paramKey={`dub.channelSend.ch${i}`}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* CENTER — globals grid + lane timeline */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="text-[11px] text-text-muted px-1">GLOBAL MOVES</div>
          <div className="grid grid-cols-4 gap-2 flex-shrink-0">
            {GLOBAL_MOVES.map((g) => {
              const key = `${g.moveId}:g`;
              const active = heldMoves.has(key);
              return (
                <button
                  key={g.moveId}
                  className={colorClasses(g.color, active, true) + ' h-20 relative'}
                  onClick={() => fireMove(g.moveId, g.kind)}
                  title={g.title + (g.kind === 'hold' ? ' (click to toggle)' : '')}
                  disabled={!busEnabled}
                >
                  <span>{g.label}</span>
                  {g.keyBind && (
                    <kbd className="absolute bottom-1 right-1 text-[9px] font-mono text-text-muted bg-dark-bg/60 px-1 py-0.5 rounded">
                      {g.keyBind}
                    </kbd>
                  )}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-text-muted px-1 mt-2">DUB LANE</div>
          <div className="h-12">
            <DubLaneTimeline />
          </div>
        </div>

        {/* RIGHT — kill + status */}
        <div className="w-56 flex flex-col gap-3">
          <button
            className="flex-1 rounded border-2 border-accent-error bg-accent-error/20 hover:bg-accent-error/40 text-accent-error font-black text-2xl tracking-widest"
            onClick={() => window.dispatchEvent(new Event('dub-panic'))}
          >
            KILL
          </button>
          <div className="p-2 rounded border border-dark-borderLight bg-dark-bgSecondary text-[10px] text-text-muted flex flex-col gap-1">
            <div><span className="text-text-secondary">Esc</span> → panic · <span className="text-text-secondary">`</span> → exit</div>
            <div><span className="text-text-secondary">1..9</span> → echo ch · <span className="text-text-secondary">⇧1..9</span> → stab</div>
            <div><span className="text-text-secondary">Q..P, Z</span> → globals</div>
          </div>
          <div className="p-2 rounded border border-dark-borderLight bg-dark-bgSecondary text-[10px]">
            <div className="text-text-muted mb-1">BUS</div>
            <div className="flex justify-between text-text-primary">
              <span>Echo intensity</span>
              <span>{Math.round((dubBusSettings.echoIntensity ?? 0) * 100)}%</span>
            </div>
            <div className="flex justify-between text-text-primary">
              <span>Spring wet</span>
              <span>{Math.round((dubBusSettings.springWet ?? 0) * 100)}%</span>
            </div>
            <div className="flex justify-between text-text-primary">
              <span>Return</span>
              <span>{Math.round((dubBusSettings.returnGain ?? 0) * 100)}%</span>
            </div>
            <div className="flex justify-between text-text-primary">
              <span>Echo rate</span>
              <span>{Math.round(dubBusSettings.echoRateMs ?? 0)} ms</span>
            </div>
          </div>
          <div className="p-2 rounded border border-dark-borderLight bg-dark-bgSecondary text-[10px]">
            <div className="text-text-muted mb-1">VOICE · {presetLabel(dubBusSettings.characterPreset)}</div>
            <div className="flex justify-between text-text-primary">
              <span>Bass shelf</span>
              <span>{dubBusSettings.bassShelfGainDb > 0 ? '+' : ''}{(dubBusSettings.bassShelfGainDb ?? 0).toFixed(1)} dB @ {Math.round(dubBusSettings.bassShelfFreqHz ?? 0)}</span>
            </div>
            <div className="flex justify-between text-text-primary">
              <span>Mid scoop</span>
              <span>{(dubBusSettings.midScoopGainDb ?? 0) > 0 ? '+' : ''}{(dubBusSettings.midScoopGainDb ?? 0).toFixed(1)} dB @ {Math.round(dubBusSettings.midScoopFreqHz ?? 0)}</span>
            </div>
            <div className="flex justify-between text-text-primary">
              <span>Stereo width</span>
              <span>{(dubBusSettings.stereoWidth ?? 1).toFixed(2)}×</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function presetLabel(p: string | undefined): string {
  switch (p) {
    case 'tubby':        return 'King Tubby';
    case 'scientist':    return 'Scientist';
    case 'perry':        return 'Lee Perry';
    case 'madProfessor': return 'Mad Professor';
    default:             return 'Custom';
  }
}
