/**
 * DeckStemControls — Per-stem mixer strip for DJ decks.
 *
 * Three states:
 * 1. Track loaded, no stems → show "✂ STEMS" button to trigger separation
 * 2. Separation in progress → show progress bar
 * 3. Stems available → full stem mixer: volume faders, mute, solo, dub ops
 *
 * Reuses the DubDeckStrip per-channel ops pattern (M/T/E/✦) adapted for stems.
 * Fires dub moves through DubRouter with the stem's tap as source.
 */

import React, { useCallback, useRef, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import * as DJActions from '@/engine/dj/DJActions';
import { fire as fireDubMove } from '@/engine/dub/DubRouter';

interface DeckStemControlsProps {
  deckId: 'A' | 'B' | 'C';
}

// ── Stem visual identity ────────────────────────────────────────────────────

export const STEM_COLORS: Record<string, string> = {
  drums: '#f97316',   // orange
  bass: '#3b82f6',    // blue
  vocals: '#ec4899',  // pink
  other: '#22c55e',   // green
  guitar: '#a855f7',  // purple
  piano: '#eab308',   // yellow
};

const STEM_LABELS: Record<string, string> = {
  drums: 'DRM',
  bass: 'BAS',
  vocals: 'VOX',
  other: 'OTH',
  guitar: 'GTR',
  piano: 'PNO',
};

// ── Per-stem dub ops — same pattern as DubDeckStrip's CHANNEL_OPS ───────────

const STEM_DUB_OPS = [
  { label: 'M',  title: 'Mute — silence this stem',           moveId: 'channelMute',  kind: 'hold' as const },
  { label: 'T',  title: 'Throw — echo throw on this stem',    moveId: 'echoThrow',    kind: 'trigger' as const },
  { label: 'E',  title: 'Echo Build — ramp echo up',          moveId: 'echoBuildUp',  kind: 'trigger' as const },
  { label: '✦', title: 'Dub Stab — short echo on this stem',  moveId: 'dubStab',      kind: 'trigger' as const },
];

// ── Mini vertical fader (inline, no Fader component — needs custom hex color) ─

const MiniFader: React.FC<{
  value: number;
  color: string;
  onChange: (v: number) => void;
  title?: string;
}> = React.memo(({ value, color, onChange, title }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const setFromY = useCallback((clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const norm = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onChange(Math.round(norm * 100) / 100);
  }, [onChange]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setFromY(e.clientY);
  }, [setFromY]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setFromY(e.clientY);
  }, [setFromY]);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const onDoubleClick = useCallback(() => {
    onChange(1.0);
  }, [onChange]);

  const pct = Math.round(value * 100);

  return (
    <div
      ref={trackRef}
      className="relative cursor-ns-resize select-none"
      style={{ width: 10, height: 40 }}
      title={title ?? `${pct}%`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      {/* Track background */}
      <div
        className="absolute inset-x-0 bottom-0 top-0 rounded-full"
        style={{ backgroundColor: `${color}15`, border: `1px solid ${color}33` }}
      />
      {/* Fill */}
      <div
        className="absolute inset-x-0 bottom-0 rounded-full"
        style={{ height: `${pct}%`, backgroundColor: `${color}66` }}
      />
      {/* Thumb line */}
      <div
        className="absolute inset-x-0"
        style={{ bottom: `${pct}%`, height: 2, backgroundColor: color, transform: 'translateY(1px)' }}
      />
    </div>
  );
});
MiniFader.displayName = 'MiniFader';

// ── Component ────────────────────────────────────────────────────────────────

export const DeckStemControls: React.FC<DeckStemControlsProps> = ({ deckId }) => {
  const fileName = useDJStore((s) => s.decks[deckId].fileName);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const stemsAvailable = useDJStore((s) => s.decks[deckId].stemsAvailable);
  const stemMode = useDJStore((s) => s.decks[deckId].stemMode);
  const stemNames = useDJStore((s) => s.decks[deckId].stemNames);
  const stemMutes = useDJStore((s) => s.decks[deckId].stemMutes);
  const stemVolumes = useDJStore((s) => s.decks[deckId].stemVolumes);
  const stemSolos = useDJStore((s) => s.decks[deckId].stemSolos);
  const stemDubSends = useDJStore((s) => s.decks[deckId].stemDubSends);
  const stemSeparationProgress = useDJStore((s) => s.decks[deckId].stemSeparationProgress);

  const anyDeckSeparating = useDJStore((s) =>
    Object.values(s.decks).some((d) => d.stemSeparationProgress != null && d.stemSeparationProgress >= 0)
  );

  const [error, setError] = useState<string | null>(null);
  const holdDisposersRef = useRef<Map<string, () => void>>(new Map());

  const handleSeparate = useCallback(async () => {
    setError(null);
    try {
      await DJActions.separateStems(deckId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stem separation failed';
      setError(msg);
      setTimeout(() => setError(null), 5000);
    }
  }, [deckId]);

  const handleToggleStemMode = useCallback(() => {
    DJActions.setStemMode(deckId, !stemMode);
  }, [deckId, stemMode]);

  const handleStemToggle = useCallback((stemName: string) => {
    if (!stemMode) DJActions.setStemMode(deckId, true);
    DJActions.toggleStemMute(deckId, stemName);
  }, [deckId, stemMode]);

  const handleSoloToggle = useCallback((stemName: string) => {
    if (!stemMode) DJActions.setStemMode(deckId, true);
    DJActions.toggleStemSolo(deckId, stemName);
  }, [deckId, stemMode]);

  const handleVolumeChange = useCallback((stemName: string, volume: number) => {
    DJActions.setStemVolume(deckId, stemName, volume);
  }, [deckId]);

  const handleDubToggle = useCallback((stemName: string) => {
    DJActions.toggleStemDubSend(deckId, stemName);
  }, [deckId]);

  // Per-stem dub op: fire dub move targeting this stem's dub send
  const handleDubOp = useCallback((stemName: string, moveId: string, kind: 'trigger' | 'hold', pressed: boolean) => {
    // Ensure dub send is active for this stem
    const sends = useDJStore.getState().decks[deckId].stemDubSends;
    if (!sends[stemName]) {
      DJActions.toggleStemDubSend(deckId, stemName);
    }

    if (kind === 'trigger' && pressed) {
      fireDubMove(moveId, -1, {}, 'live');
    } else if (kind === 'hold') {
      const key = `${stemName}:${moveId}`;
      if (pressed) {
        const disposer = fireDubMove(moveId, -1, {}, 'live');
        if (disposer && typeof disposer.dispose === 'function') {
          holdDisposersRef.current.set(key, () => disposer.dispose());
        }
      } else {
        const disposer = holdDisposersRef.current.get(key);
        disposer?.();
        holdDisposersRef.current.delete(key);
      }
    }
  }, [deckId]);

  if (!fileName) return null;

  // ── Separation in progress ───────────────────────────────────────────────
  if (stemSeparationProgress != null && stemSeparationProgress >= 0) {
    const pct = Math.round(stemSeparationProgress * 100);
    return (
      <div className="flex items-center gap-2 px-1 py-0.5">
        <div className="flex-1 h-3 bg-dark-bgTertiary rounded-full overflow-hidden border border-dark-borderLight">
          <div
            className="h-full bg-accent-highlight transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-mono text-accent-highlight whitespace-nowrap">
          {pct < 10 ? 'Loading model…' : `${pct}%`}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-1 px-1 py-0.5">
        <span className="text-xs font-mono text-accent-error truncate">{error}</span>
      </div>
    );
  }

  // ── No stems yet — show "Separate" button ────────────────────────────────
  if (!stemsAvailable) {
    if (playbackMode !== 'audio') return null;
    const isBusy = anyDeckSeparating;
    return (
      <div className="flex items-center gap-1 px-1 py-0.5">
        <button
          onClick={handleSeparate}
          disabled={isBusy}
          title={isBusy ? 'Separation in progress on another deck' : 'Separate track into stems (drums, bass, vocals, other)'}
          className={`
            px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide
            border transition-colors duration-100 cursor-pointer select-none outline-none
            ${isBusy
              ? 'bg-dark-bgTertiary border-dark-borderLight text-text-muted opacity-50 cursor-not-allowed'
              : 'bg-accent-highlight/10 border-accent-highlight/50 text-accent-highlight hover:bg-accent-highlight/20 hover:border-accent-highlight'
            }
          `}
        >
          ✂ STEMS
        </button>
      </div>
    );
  }

  // ── Stems available — full mixer strip ───────────────────────────────────
  return (
    <div className="flex flex-col gap-1 px-1 py-1">
      {/* Row 1: STEM toggle + per-stem channel strips */}
      <div className="flex gap-1.5 items-end">
        <button
          onClick={handleToggleStemMode}
          title={stemMode ? 'Switch to full mix' : 'Switch to stem playback'}
          className={`
            px-2 py-1 rounded-full text-xs font-black uppercase tracking-wide
            border transition-colors duration-100 cursor-pointer select-none outline-none self-start
            ${stemMode
              ? 'bg-accent-highlight/20 border-accent-highlight text-accent-highlight'
              : 'bg-dark-bgTertiary border-dark-borderLight text-text-muted hover:text-text-primary hover:border-text-muted'
            }
          `}
        >
          STEM
        </button>

        {/* Per-stem strips: fader + M/S + dub ops */}
        {stemMode && stemNames.map((name) => {
          const isMuted = stemMutes[name] ?? false;
          const isSolo = stemSolos[name] ?? false;
          const volume = stemVolumes[name] ?? 1.0;
          const isDubSend = stemDubSends[name] ?? false;
          const color = STEM_COLORS[name] ?? '#888';
          const label = STEM_LABELS[name] ?? name.substring(0, 3).toUpperCase();

          return (
            <div key={name} className="flex flex-col items-center gap-1" style={{ minWidth: 36 }}>
              {/* Stem label */}
              <span
                className="text-[10px] font-black uppercase tracking-wide select-none"
                style={{ color }}
              >
                {label}
              </span>

              {/* Volume fader */}
              <MiniFader
                value={volume}
                color={color}
                onChange={(v) => handleVolumeChange(name, v)}
                title={`${name} volume: ${Math.round(volume * 100)}%`}
              />

              {/* M / S buttons row */}
              <div className="flex gap-0.5">
                <button
                  onClick={() => handleStemToggle(name)}
                  title={`${isMuted ? 'Unmute' : 'Mute'} ${name}`}
                  className="w-5 h-5 rounded text-[9px] font-black flex items-center justify-center select-none"
                  style={{
                    backgroundColor: isMuted ? `${color}44` : `${color}15`,
                    color: isMuted ? color : 'var(--text-muted, #888)',
                    border: `1px solid ${isMuted ? color : `${color}55`}`,
                  }}
                >
                  M
                </button>
                <button
                  onClick={() => handleSoloToggle(name)}
                  title={`${isSolo ? 'Un-solo' : 'Solo'} ${name}`}
                  className="w-5 h-5 rounded text-[9px] font-black flex items-center justify-center select-none"
                  style={{
                    backgroundColor: isSolo ? '#fbbf2444' : `${color}15`,
                    color: isSolo ? '#fbbf24' : 'var(--text-muted, #888)',
                    border: `1px solid ${isSolo ? '#fbbf24' : `${color}55`}`,
                  }}
                >
                  S
                </button>
              </div>

              {/* Dub send toggle */}
              <button
                onClick={() => handleDubToggle(name)}
                title={`${isDubSend ? 'Remove' : 'Send'} ${name} to dub bus`}
                className="w-full h-4 rounded text-[8px] font-black flex items-center justify-center select-none uppercase"
                style={{
                  backgroundColor: isDubSend ? `${color}33` : `${color}15`,
                  color: isDubSend ? color : 'var(--text-muted, #888)',
                  border: `1px solid ${isDubSend ? color : `${color}55`}`,
                  boxShadow: isDubSend ? `0 0 4px ${color}44` : 'none',
                }}
              >
                dub
              </button>

              {/* Dub ops: M T E ✦ — shown when dub send is active */}
              {isDubSend && (
                <div className="flex gap-0.5 flex-wrap justify-center">
                  {STEM_DUB_OPS.map((op) => (
                    <button
                      key={op.moveId}
                      title={op.title}
                      className="w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center select-none cursor-pointer hover:brightness-125"
                      style={{
                        backgroundColor: `${color}25`,
                        color,
                        border: `1px solid ${color}66`,
                      }}
                      onPointerDown={() => handleDubOp(name, op.moveId, op.kind, true)}
                      onPointerUp={() => op.kind === 'hold' && handleDubOp(name, op.moveId, op.kind, false)}
                      onPointerLeave={() => op.kind === 'hold' && handleDubOp(name, op.moveId, op.kind, false)}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
