/**
 * Plays the Three Deck Showcase (owner decision 2026-10-13): the demo's whole three_deck render - the routine on
 * Deck C and its own A/B juggle layer (J1-J10, X8) - while the set holds. The decks that are playing are paused
 * (the Auto DJ with them) and resumed where they stopped the moment the render ends; nothing on the DJ mixer is
 * touched, and only one beat sounds at a time. The render goes to the mixer's sampler input (Deck C's place: past
 * the crossfader). If the Auto DJ is mid-transition the showcase waits for the transition to finish.
 *
 * One player; the DJ view's button, the MCP tool and the keyboard command all call `toggle()` through DJActions.
 */

import { SHOWCASE_RATE, JUGGLE_RECORDS_URL, type ShowcaseParams, type ShowcaseRender, type ShowcaseRenderIO } from './threeDeckShowcase';

import { getDeckCMotion } from './deckCMotion';

export type DeckId = 'A' | 'B' | 'C';
/** The showcase's strokes on the Deck C motion timeline. */
const SHOWCASE_OWNER = 'threeDeckShowcase';
export type ShowcaseStatus = 'idle' | 'waiting' | 'rendering' | 'playing';

export interface ShowcaseState {
  status: ShowcaseStatus;
  /** Context time the render starts at (playing). */
  startTime: number;
  durationSec: number;
  /** The decks held for the showcase (resumed when it ends). */
  held: DeckId[];
  /** Why the last start did not play. */
  reason: string | null;
}

/** What the showcase needs from the set and the audio graph (the app's in `appShowcaseDeps`). */
export interface ShowcaseDeps {
  ctx(): BaseAudioContext;
  destination(): AudioNode;
  /** The decks playing now. */
  playingDecks(): DeckId[];
  /** Is the Auto DJ in the middle of a transition (pausing it would complete the mix on the mixer)? */
  autoDJTransitioning(): boolean;
  /** Resolves when the Auto DJ's transition has finished. */
  autoDJTransitionDone(): Promise<void>;
  /** Pause these decks now (and the Auto DJ). */
  hold(decks: readonly DeckId[]): Promise<void>;
  /** Resume these decks where they stopped (and the Auto DJ if it is on). */
  resume(decks: readonly DeckId[]): Promise<void>;
  render(params?: Partial<ShowcaseParams>): Promise<ShowcaseRender>;
}

/** Reachability sentinels: starts, holds, resumes, renders played, ends. */
export const showcasePlayerStats = { starts: 0, holds: 0, resumes: 0, played: 0, ended: 0 };

export class ThreeDeckShowcasePlayer {
  private st: ShowcaseState = { status: 'idle', startTime: 0, durationSec: 0, held: [], reason: null };
  private readonly listeners = new Set<() => void>();
  private source: AudioBufferSourceNode | null = null;
  private render: ShowcaseRender | null = null;
  private run = 0;
  private readonly deps: ShowcaseDeps;

  constructor(deps: ShowcaseDeps) { this.deps = deps; }

  get state(): ShowcaseState { return this.st; }
  /** The render playing (its 50 Hz streams feed the view). */
  get current(): ShowcaseRender | null { return this.st.status === 'playing' ? this.render : null; }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private set(patch: Partial<ShowcaseState>): void { this.st = { ...this.st, ...patch }; for (const l of [...this.listeners]) l(); }

  /** Start when idle, stop when running. */
  toggle(): Promise<ShowcaseState> {
    if (this.st.status === 'idle') return this.start();
    this.stop();
    return Promise.resolve(this.st);
  }

  /** Render (once per set of parameters), hold the set, play the render, resume the set when it ends. */
  async start(params?: Partial<ShowcaseParams>): Promise<ShowcaseState> {
    if (this.st.status !== 'idle') return this.st;
    showcasePlayerStats.starts++;
    const run = ++this.run;
    try {
      this.set({ status: 'rendering', reason: null });
      const render = await this.deps.render(params);
      if (run !== this.run) return this.st;
      this.render = render;
      if (this.deps.autoDJTransitioning()) {
        this.set({ status: 'waiting' });
        await this.deps.autoDJTransitionDone();
        if (run !== this.run) return this.st;
      }
      const held = this.deps.playingDecks();
      if (held.length) { showcasePlayerStats.holds++; await this.deps.hold(held); }
      if (run !== this.run) { if (held.length) await this.deps.resume(held); return this.st; }
      const ctx = this.deps.ctx();
      const buffer = ctx.createBuffer(1, render.mix.length, SHOWCASE_RATE);
      buffer.getChannelData(0).set(render.mix);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.deps.destination());
      const startTime = ctx.currentTime + 0.05;
      src.onended = () => { if (this.source === src) void this.finish(run); };
      src.start(startTime);
      this.source = src;
      // D1: Deck C's platter, scratch fader and slip follow this render's strokes on the one Deck C timeline
      // (bus sample = context seconds x 22,050, the clock the buffer plays on)
      const motion = getDeckCMotion();
      const base = Math.trunc(startTime * SHOWCASE_RATE);
      for (const st of render.strokes) {
        if (st.viz) motion.addStroke(base + st.start, st.viz, SHOWCASE_OWNER);
        else motion.addNeedle(base + st.start, st.length, SHOWCASE_OWNER);
      }
      showcasePlayerStats.played++;
      this.set({ status: 'playing', startTime, durationSec: render.mix.length / SHOWCASE_RATE, held });
    } catch (err) {
      console.warn('[ThreeDeckShowcase] not played:', err);
      if (run === this.run) this.set({ status: 'idle', reason: err instanceof Error ? err.message : String(err), held: [] });
    }
    return this.st;
  }

  /** End now (the set resumes at once). */
  stop(): void {
    const run = this.run;
    if (this.st.status === 'playing') { void this.finish(run); return; }
    // rendering / waiting: abandon; nothing was held yet or the start path resumes what it held
    this.run++;
    this.set({ status: 'idle', held: [] });
  }

  private async finish(run: number): Promise<void> {
    if (run !== this.run) return;
    this.run++;
    const src = this.source;
    this.source = null;
    if (src) { src.onended = null; try { src.stop(); } catch { /* ended */ } try { src.disconnect(); } catch { /* gone */ } }
    const held = this.st.held;
    getDeckCMotion().endOwner(SHOWCASE_OWNER, Math.trunc(this.deps.ctx().currentTime * SHOWCASE_RATE));
    showcasePlayerStats.ended++;
    this.set({ status: 'idle', held: [] });
    if (held.length) { showcasePlayerStats.resumes++; await this.deps.resume(held); }
  }

  /** The 50 Hz tick of the render at a context time (null when not playing or outside it). */
  tickAt(contextTime: number): number | null {
    const r = this.current;
    if (!r) return null;
    const t = Math.trunc((contextTime - this.st.startTime) * 50);
    return t >= 0 && t < r.nTicks ? t : null;
  }
}

/** The app's render inputs: the shipped records over fetch, the scratch pool's stroke renderer, an offline context. */
export async function appShowcaseRenderIO(): Promise<ShowcaseRenderIO> {
  const { getScratchVoicePool } = await import('./scratchVoicePool');
  return {
    juggleRecordBytes: async (file) => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const res = await fetch(`${base.replace(/\/$/, '')}${JUGGLE_RECORDS_URL}${file}`);
      if (!res.ok) throw new Error(`juggle record ${file}: ${res.status}`);
      return res.arrayBuffer();
    },
    strokes: getScratchVoicePool(),
    offline: (n, rate) => new OfflineAudioContext(1, n, rate),
  };
}
