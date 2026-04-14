/**
 * Tour script — defines every step of the guided DEViLBOX tour.
 *
 * DESIGN PRINCIPLE: Show, don't tell. Every 1-2 sentences of narration
 * should be followed by a visible action in the app. Keep narration
 * SHORT and punchy. Let the demo speak for itself.
 */

import { useUIStore } from '@/stores/useUIStore';
import { useSpeechActivityStore } from '@/stores/useSpeechActivityStore';

export interface TourStep {
  id: string;
  narration: string;
  /** UI action to perform when this step starts (before speech) */
  action?: () => Promise<void> | void;
  /** Extra ms to wait after speech finishes (default 1000) */
  postDelay?: number;
  /** DECtalk voice override (default 0 = Paul) */
  voice?: number;
  /** DECtalk rate override (default 220) */
  rate?: number;
  /** CSS selector to spotlight/highlight during this step (null = no spotlight) */
  spotlight?: string;
  /** Whether to show the Kraftwerk 3D head during this step */
  showHead?: boolean;
}

function switchView(view: 'tracker' | 'dj' | 'drumpad' | 'vj' | 'mixer' | 'studio'): void {
  useUIStore.getState().setActiveView(view);
}

async function loadTrackerSong(filename: string): Promise<void> {
  try {
    const resp = await fetch(`/data/songs/exports/${filename}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const file = new File([buf], filename);
    const { loadFile } = await import('@/lib/file/UnifiedFileLoader');
    await loadFile(file, { requireConfirmation: false });
  } catch (err) {
    console.warn('[Tour] Failed to load song:', err);
  }
}

async function trackerPlay(): Promise<void> {
  const { useTransportStore } = await import('@/stores/useTransportStore');
  useTransportStore.getState().play();
}

async function trackerStop(): Promise<void> {
  const { useTransportStore } = await import('@/stores/useTransportStore');
  useTransportStore.getState().stop();
}

async function loadDJTrack(deckId: 'A' | 'B', filename: string): Promise<void> {
  try {
    const resp = await fetch(`/data/songs/exports/${filename}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const { getDJEngine } = await import('@/engine/dj/DJEngine');
    await getDJEngine().loadAudioToDeck(deckId, buf, filename, filename.replace(/\.\w+$/, ''));
  } catch (err) {
    console.warn(`[Tour] Failed to load DJ track ${filename}:`, err);
  }
}

async function djPlay(deckId: 'A' | 'B'): Promise<void> {
  const { togglePlay } = await import('@/engine/dj/DJActions');
  const { useDJStore } = await import('@/stores/useDJStore');
  if (!useDJStore.getState().decks[deckId].isPlaying) {
    await togglePlay(deckId);
  }
}

async function djSetCrossfader(pos: number): Promise<void> {
  const { setCrossfader } = await import('@/engine/dj/DJActions');
  setCrossfader(pos);
}

async function djSetFilter(deckId: 'A' | 'B', pos: number): Promise<void> {
  const { setDeckFilter } = await import('@/engine/dj/DJActions');
  setDeckFilter(deckId, pos);
}

async function djKillEQ(deckId: 'A' | 'B', band: 'low' | 'mid' | 'high', kill: boolean): Promise<void> {
  const { setDeckEQKill } = await import('@/engine/dj/DJActions');
  setDeckEQKill(deckId, band, kill);
}

async function djStopAll(): Promise<void> {
  const { killAllDecks } = await import('@/engine/dj/DJActions');
  killAllDecks();
}

function enableHead(): void {
  useSpeechActivityStore.getState().speechStart();
}

function disableHead(): void {
  useSpeechActivityStore.getState().speechStop();
}

export const TOUR_SCRIPT: TourStep[] = [
  // ── Act 1: Welcome (short!) ─────────────────────────────────────────────
  {
    id: 'welcome',
    narration: 'Welcome to DEViLBOX. Let me show you what it can do.',
    postDelay: 500,
  },

  // ── Act 2: Tracker — load a song, play it ──────────────────────────────
  {
    id: 'tracker-load',
    narration: 'This is the tracker. A pattern editor for making music. Let me load a classic Amiga module.',
    action: async () => {
      switchView('tracker');
      await loadTrackerSong('aces_high.mod');
    },
    spotlight: '[data-pattern-editor]',
    postDelay: 500,
  },
  {
    id: 'tracker-play',
    narration: 'Here we go.',
    action: trackerPlay,
    spotlight: '[data-pattern-editor]',
    postDelay: 4000,
  },
  {
    id: 'tracker-explain',
    narration: 'Each column is a channel. Notes, instruments, and effects scroll as the song plays. Over 120 synth engines and 188 import formats.',
    spotlight: '[data-pattern-editor]',
    postDelay: 3000,
  },
  {
    id: 'tracker-stop',
    narration: '',
    action: trackerStop,
    postDelay: 300,
  },

  // ── Act 3: DJ View — load two tracks and mix ──────────────────────────
  {
    id: 'dj-switch',
    narration: 'Now let us DJ. Switching to the dual deck mixer.',
    action: () => switchView('dj'),
    postDelay: 800,
  },
  {
    id: 'dj-load-a',
    narration: 'Loading a track onto deck A.',
    action: () => loadDJTrack('A', 'analogue_vibes.mod'),
    spotlight: '[data-dj-deck-drop]',
    postDelay: 1000,
  },
  {
    id: 'dj-play-a',
    narration: 'Play.',
    action: () => djPlay('A'),
    postDelay: 4000,
  },
  {
    id: 'dj-load-b',
    narration: 'Loading deck B.',
    action: () => loadDJTrack('B', 'anthrox_intro.mod'),
    postDelay: 1000,
  },
  {
    id: 'dj-play-b',
    narration: 'Starting deck B and crossfading.',
    action: async () => {
      await djPlay('B');
      // Animate crossfader from A to center over 2 seconds
      for (let i = 0; i <= 10; i++) {
        setTimeout(() => djSetCrossfader(i / 20), i * 200);
      }
    },
    postDelay: 3000,
  },
  {
    id: 'dj-fx-filter',
    narration: 'Watch the filter sweep.',
    action: async () => {
      // Sweep low-pass filter on deck A
      for (let i = 0; i <= 10; i++) {
        setTimeout(() => djSetFilter('A', i / 10), i * 150);
      }
      // Sweep back
      setTimeout(() => {
        for (let i = 10; i >= 0; i--) {
          setTimeout(() => djSetFilter('A', i / 10), (10 - i) * 150);
        }
      }, 1800);
    },
    postDelay: 2000,
  },
  {
    id: 'dj-fx-kill',
    narration: 'EQ kills. Drop the bass.',
    action: async () => {
      await djKillEQ('A', 'low', true);
      setTimeout(() => djKillEQ('A', 'low', false), 1500);
      setTimeout(() => djKillEQ('A', 'mid', true), 2000);
      setTimeout(() => djKillEQ('A', 'mid', false), 3000);
    },
    postDelay: 2000,
  },
  {
    id: 'dj-crossfade',
    narration: 'Full crossfade to deck B.',
    action: async () => {
      for (let i = 5; i <= 20; i++) {
        setTimeout(() => djSetCrossfader(i / 20), (i - 5) * 130);
      }
    },
    postDelay: 3000,
  },
  {
    id: 'dj-archives',
    narration: 'You can also stream from Modland, 190,000 tracker modules. Or the High Voltage SID Collection, 80,000 Commodore 64 tunes.',
    postDelay: 1000,
  },
  {
    id: 'dj-stop',
    narration: '',
    action: async () => {
      await djStopAll();
      // Reset crossfader and filters
      await djSetCrossfader(0.5);
      await djSetFilter('A', 0);
      await djSetFilter('B', 0);
    },
    postDelay: 300,
  },

  // ── Act 4: DrumPads ─────────────────────────────────────────────────────
  {
    id: 'drumpad-switch',
    narration: 'The drum pads. MPC-style, 16 pads, velocity sensitive.',
    action: () => switchView('drumpad'),
    spotlight: '[data-pad-id]',
    postDelay: 2000,
  },
  {
    id: 'drumpad-features',
    narration: 'Load any sample or synth engine onto each pad. Switch banks for 128 total. Or use them as DJ FX triggers.',
    postDelay: 1000,
  },

  // ── Act 5: Speech Synths (the meta moment) ──────────────────────────────
  {
    id: 'speech-meta',
    narration: 'By the way, this voice? DECtalk. Running as WebAssembly. The same voice Stephen Hawking used.',
    showHead: true,
    postDelay: 800,
  },
  {
    id: 'speech-betty',
    narration: 'And this is Betty.',
    voice: 1,
    showHead: true,
    postDelay: 500,
  },
  {
    id: 'speech-harry',
    narration: 'And Harry.',
    voice: 2,
    showHead: true,
    postDelay: 500,
  },
  {
    id: 'speech-paul-back',
    narration: 'We also have SAM from the Commodore 64, Pink Trombone, and vintage arcade speech chips.',
    voice: 0,
    showHead: true,
    postDelay: 800,
  },

  // ── Act 6: VJ + Kraftwerk head ──────────────────────────────────────────
  {
    id: 'vj-switch',
    narration: 'The VJ view. Real-time Milkdrop visualizations, and the Kraftwerk 3D head. Watch it sync to my voice.',
    action: () => {
      enableHead();
      switchView('vj');
    },
    showHead: true,
    postDelay: 3000,
  },
  {
    id: 'vj-head-demo',
    narration: 'Hello. I am DEViLBOX. I can see you. Can you see me?',
    showHead: true,
    postDelay: 2000,
  },
  {
    id: 'vj-cleanup',
    narration: '',
    action: () => disableHead(),
    postDelay: 100,
  },

  // ── Act 7: Mixer ────────────────────────────────────────────────────────
  {
    id: 'mixer-switch',
    narration: 'The mixer. Per-channel faders, pan, mute, solo, and meters.',
    action: () => switchView('mixer'),
    postDelay: 1500,
  },

  // ── Act 8: Closing (fast) ───────────────────────────────────────────────
  {
    id: 'closing',
    narration: 'DEViLBOX. 120 synth engines. 188 formats. Two massive music archives. All in your browser. Thanks for watching.',
    action: () => switchView('tracker'),
    postDelay: 2000,
  },
];
