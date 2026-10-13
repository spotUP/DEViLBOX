/**
 * The Three Deck Showcase control and its performance view (owner decision 2026-10-13; ledger J1-J10, X8, D1, D3-D6).
 *
 * The button starts the demo's whole three-deck render while the set holds (and ends it early). While it plays, the
 * view draws dj_viz's 50 Hz streams of that same render: each deck's platter angle (Deck C scratching, A and B
 * pushed and rewound on the juggle bursts - D5), the tonearms (D4), the channel faders and the crossfader (D3),
 * which decks are audible and the gesture on Deck C (D1), and the energy, beat, juggle level and scratch
 * intensity lanes (D6). DOM writes per frame through refs while it plays; nothing runs while it is idle.
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as Tone from 'tone';
import { Button } from '@/components/ui/Button';
import { getThreeDeckShowcase, toggleThreeDeckShowcase } from '@/engine/dj/DJActions';
import type { ShowcaseState, ThreeDeckShowcasePlayer } from '@/engine/dj/scratch/threeDeckShowcasePlayer';
import { gestureNameForId, type DjVizStreamName } from '@/engine/dj/scratch/djViz';
import { REFERENCE_GESTURE_IDS, getGesture } from '@/engine/dj/scratch/scratchGestureCatalog';
import type { ScratchGestureId } from '@/engine/dj/scratch/scratchTypes';

const IDLE: ShowcaseState = { status: 'idle', startTime: 0, durationSec: 0, held: [], reason: null };

/** The gesture's full English name for a gesture_id byte ('' for none). */
export function showcaseGestureLabel(id: number): string {
  const demo = gestureNameForId(id);
  if (demo === 'none') return '';
  const gid: ScratchGestureId | undefined = demo === 'needle_drop' ? 'needleDrop' : demo === 'needle_lift' ? 'needleLift' : REFERENCE_GESTURE_IDS[demo];
  return gid ? getGesture(gid).name : demo;
}

const STATUS_LABEL: Record<ShowcaseState['status'], string> = {
  idle: '', rendering: 'Rendering the routine', waiting: 'Waiting for the Auto DJ transition to finish', playing: 'Playing',
};

/** Reachability sentinel: frames drawn from the streams. */
export const showcaseViewStats = { frames: 0 };

function usePlayer(): ThreeDeckShowcasePlayer | null {
  const [player, setPlayer] = useState<ThreeDeckShowcasePlayer | null>(null);
  useEffect(() => { let live = true; void getThreeDeckShowcase().then((p) => { if (live) setPlayer(p); }); return () => { live = false; }; }, []);
  return player;
}

const Meter: React.FC<{ label: string; stream: DjVizStreamName; refs: React.MutableRefObject<Partial<Record<string, HTMLDivElement | null>>> }> = ({ label, stream, refs }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] font-mono text-text-muted w-28 shrink-0">{label}</span>
    <div className="relative flex-1 h-2 bg-dark-bgTertiary rounded overflow-hidden">
      <div ref={(el) => { refs.current[stream] = el; }} data-testid={`showcase-${stream}`} className="absolute top-0 left-0 h-2 bg-accent-primary" style={{ width: '0%' }} />
    </div>
  </div>
);

const DeckColumn: React.FC<{ deck: 'a' | 'b' | 'c'; refs: React.MutableRefObject<Partial<Record<string, HTMLDivElement | null>>> }> = ({ deck, refs }) => {
  const up = deck.toUpperCase();
  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
      <div className="flex items-center gap-1">
        <div ref={(el) => { refs.current[`active_${deck}`] = el; }} data-testid={`showcase-active-${deck}`} className="w-2 h-2 rounded-full bg-accent-success opacity-20" />
        <span className="text-[10px] font-mono text-text-secondary">Deck {up}</span>
      </div>
      <div className="relative w-16 h-16 rounded-full bg-dark-bgTertiary border border-dark-borderLight">
        <div ref={(el) => { refs.current[`platter_${deck}`] = el; }} data-testid={`showcase-platter-${deck}`} className="absolute inset-0" style={{ transform: 'rotate(0deg)' }}>
          <div className="absolute left-1/2 top-1 w-0.5 h-6 -ml-px bg-accent-highlight rounded" />
        </div>
        <div className="absolute left-1/2 top-1/2 w-4 h-4 -ml-2 -mt-2 rounded-full bg-dark-bgSecondary border border-dark-border" />
      </div>
      <div className="w-full flex items-center gap-1">
        <span className="text-[9px] font-mono text-text-muted w-14 shrink-0">Tonearm</span>
        <div className="relative flex-1 h-1.5 bg-dark-bgTertiary rounded">
          <div ref={(el) => { refs.current[`tonearm_${deck}`] = el; }} data-testid={`showcase-tonearm-${deck}`} className="absolute top-0 h-1.5 w-1 -ml-0.5 bg-accent-secondary rounded" style={{ left: '0%' }} />
        </div>
      </div>
      <div className="w-full flex items-center gap-1">
        <span className="text-[9px] font-mono text-text-muted w-14 shrink-0">Channel</span>
        <div className="relative flex-1 h-1.5 bg-dark-bgTertiary rounded overflow-hidden">
          <div ref={(el) => { refs.current[`upfader_${deck}`] = el; }} data-testid={`showcase-upfader-${deck}`} className="absolute top-0 left-0 h-1.5 bg-accent-primary" style={{ width: '0%' }} />
        </div>
      </div>
    </div>
  );
};

/** The view of the playing render's streams (mounted only while it plays). */
const ShowcaseStreams: React.FC<{ player: ThreeDeckShowcasePlayer }> = ({ player }) => {
  const refs = useRef<Partial<Record<string, HTMLDivElement | null>>>({});
  const gestureRef = useRef<HTMLSpanElement>(null);
  const crossRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const r = player.current;
      const t = player.tickAt(Tone.getContext().rawContext.currentTime);
      if (r && t !== null) {
        showcaseViewStats.frames++;
        const s = r.streams;
        const pct = (v: number) => `${(v / 255 * 100).toFixed(1)}%`;
        for (const d of ['a', 'b', 'c'] as const) {
          const platter = refs.current[`platter_${d}`];
          if (platter) platter.style.transform = `rotate(${(s[`platter_${d}`][t]! / 256 * 360).toFixed(1)}deg)`;
          const arm = refs.current[`tonearm_${d}`];
          if (arm) arm.style.left = pct(s[`tonearm_${d}`][t]!);
          const fader = refs.current[`upfader_${d}`];
          if (fader) fader.style.width = pct(s[`upfader_${d}`][t]!);
          const on = refs.current[`active_${d}`];
          if (on) on.style.opacity = (s.deck_active[t]! >> (d === 'a' ? 0 : d === 'b' ? 1 : 2)) & 1 ? '1' : '0.2';
        }
        if (crossRef.current) crossRef.current.style.left = pct(s.crossfader[t]!);
        if (gestureRef.current) gestureRef.current.textContent = showcaseGestureLabel(s.gesture_id[t]!) || 'None';
        for (const m of ['scratch_intensity', 'energy', 'juggle_level', 'beat_env_a', 'beat_env_b'] as const) {
          const el = refs.current[m];
          if (el) el.style.width = pct(s[m][t]!);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [player]);

  return (
    <div className="flex flex-col gap-2 p-2 bg-dark-bgSecondary border border-dark-border rounded" data-testid="three-deck-showcase-view">
      <div className="flex gap-2">
        <DeckColumn deck="a" refs={refs} />
        <DeckColumn deck="c" refs={refs} />
        <DeckColumn deck="b" refs={refs} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-text-muted w-28 shrink-0">Crossfader</span>
        <div className="relative flex-1 h-2 bg-dark-bgTertiary rounded">
          <div ref={crossRef} data-testid="showcase-crossfader" className="absolute top-0 h-2 w-1 -ml-0.5 bg-accent-highlight rounded" style={{ left: '0%' }} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-text-muted w-28 shrink-0">Deck C Gesture</span>
        <span ref={gestureRef} data-testid="showcase-gesture" className="text-[10px] font-mono text-text-primary">None</span>
      </div>
      <Meter label="Scratch Intensity" stream="scratch_intensity" refs={refs} />
      <Meter label="Energy" stream="energy" refs={refs} />
      <Meter label="Juggle Level" stream="juggle_level" refs={refs} />
      <Meter label="Beat Deck A" stream="beat_env_a" refs={refs} />
      <Meter label="Beat Deck B" stream="beat_env_b" refs={refs} />
    </div>
  );
};

export const ThreeDeckShowcasePanel: React.FC = () => {
  const player = usePlayer();
  const state = useSyncExternalStore(
    (fn) => (player ? player.subscribe(fn) : () => undefined),
    () => (player ? player.state : IDLE),
  );
  const running = state.status !== 'idle';
  return (
    <div className="flex flex-col gap-1" data-testid="three-deck-showcase">
      <div className="flex items-center gap-2">
        <Button
          variant={running ? 'danger' : 'primary'} size="sm" data-testid="three-deck-showcase-button"
          onClick={() => { void toggleThreeDeckShowcase(); }}
          title="Plays the Up Rough demo's whole three-deck routine - Deck C scratching over its own two-record beat juggle - while the set holds; the playing decks pause and resume where they stopped when it ends. The DJ mixer is not touched."
        >
          {running ? 'End Showcase' : 'Three Deck Showcase'}
        </Button>
        <span className="text-[10px] font-mono text-text-muted" data-testid="three-deck-showcase-status">
          {state.reason && !running ? `Not played: ${state.reason}` : STATUS_LABEL[state.status]}
        </span>
      </div>
      {state.status === 'playing' && player && <ShowcaseStreams player={player} />}
    </div>
  );
};
