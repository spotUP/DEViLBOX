/**
 * Tour script — defines every step of the guided DEViLBOX tour.
 *
 * Each step has narration text (spoken by DECtalk) and an optional
 * action callback that performs UI changes (view switching, etc.).
 */

import { useUIStore } from '@/stores/useUIStore';
import { useSpeechActivityStore } from '@/stores/useSpeechActivityStore';

export interface TourStep {
  id: string;
  narration: string;
  /** UI action to perform when this step starts (before speech) */
  action?: () => Promise<void> | void;
  /** Extra ms to wait after speech finishes (default 1500) */
  postDelay?: number;
  /** DECtalk voice override (default 0 = Paul) */
  voice?: number;
  /** DECtalk rate override (default 170) */
  rate?: number;
  /** CSS selector to spotlight/highlight during this step (null = no spotlight) */
  spotlight?: string;
  /** Whether to show the Kraftwerk 3D head during this step */
  showHead?: boolean;
}

function switchView(view: 'tracker' | 'dj' | 'drumpad' | 'vj' | 'mixer' | 'studio'): void {
  useUIStore.getState().setActiveView(view);
}

async function loadDemoSong(): Promise<void> {
  try {
    const resp = await fetch('/data/songs/exports/aces_high.mod');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const file = new File([buf], 'aces_high.mod');
    const { loadFile } = await import('@/lib/file/UnifiedFileLoader');
    await loadFile(file, { requireConfirmation: false });
  } catch (err) {
    console.warn('[Tour] Failed to load demo song:', err);
  }
}

function enableKraftwerkHead(): void {
  useSpeechActivityStore.getState().speechStart();
}

function disableKraftwerkHead(): void {
  useSpeechActivityStore.getState().speechStop();
}

export const TOUR_SCRIPT: TourStep[] = [
  // ── Act 1: Welcome ──────────────────────────────────────────────────────
  {
    id: 'welcome',
    narration: 'Welcome to DEViLBOX. The ultimate browser-based music production studio. Let me give you a tour.',
    postDelay: 1000,
  },
  {
    id: 'overview',
    narration: 'DEViLBOX runs entirely in your web browser. No installation required. It supports over 188 music file formats, from classic Amiga tracker modules to modern chip-tune files.',
    postDelay: 1500,
  },
  {
    id: 'overview-2',
    narration: 'It includes a tracker editor, a DJ mixer, drum pads, visualizers, and over 120 synthesizer engines. All powered by Web Audio and WebAssembly.',
    postDelay: 1500,
  },

  // ── Act 2: Tracker View ─────────────────────────────────────────────────
  {
    id: 'tracker-intro',
    narration: 'This is the tracker view. The heart of DEViLBOX. A pattern-based music editor inspired by FastTracker 2 and ProTracker.',
    action: () => switchView('tracker'),
    postDelay: 2000,
  },
  {
    id: 'tracker-pattern',
    narration: 'The pattern editor shows notes, instruments, volumes, and effects in a scrolling grid. Each column represents a channel. You navigate with the keyboard, just like the original trackers from the early 1990s.',
    spotlight: '[data-pattern-editor]',
    postDelay: 1500,
  },
  {
    id: 'tracker-demo',
    narration: 'Let me load a classic demo song to show you how it looks and sounds.',
    action: loadDemoSong,
    postDelay: 2000,
  },
  {
    id: 'tracker-playing',
    narration: 'This is Aces High, a classic ProTracker module. Notice how each channel plays its own instrument, and the pattern scrolls as the song progresses.',
    action: async () => {
      // Start playback via transport
      const { useTransportStore } = await import('@/stores/useTransportStore');
      useTransportStore.getState().play();
    },
    spotlight: '[data-pattern-editor]',
    postDelay: 3000,
  },
  {
    id: 'tracker-instruments',
    narration: 'On the right side, the instrument panel. DEViLBOX has over 120 different synthesizer engines to choose from.',
    postDelay: 1500,
  },
  {
    id: 'tracker-chips',
    narration: 'We emulate real hardware chips from the 1980s and 1990s. The Commodore 64 SID chip, Nintendo NES, Sega Genesis YM2612, Game Boy, Amiga Paula, and many more. All running as WebAssembly emulations of the original silicon.',
    postDelay: 2000,
  },
  {
    id: 'tracker-modern',
    narration: 'For modern production, there are subtractive synths, FM synthesis, the legendary TB-303 acid bass line, wavetable synthesis, physical modeling, and community plugins.',
    postDelay: 1500,
  },
  {
    id: 'tracker-effects',
    narration: 'Every instrument can have its own effects chain. Reverb, delay, distortion, chorus, phaser, EQ, vocoder, and dozens more. All running in real-time.',
    postDelay: 1500,
  },
  {
    id: 'tracker-formats',
    narration: 'DEViLBOX imports songs from over 188 formats. ProTracker MOD, FastTracker XM, Impulse Tracker IT, Scream Tracker, Furnace chip-tune files, SunVox, MIDI, and many obscure Amiga formats.',
    postDelay: 2000,
  },

  // ── Act 3: Speech Synths (Meta moment) ──────────────────────────────────
  {
    id: 'speech-intro',
    narration: 'Now, let me tell you about something special. The voice you are hearing right now? That is DECtalk. One of our built-in speech synthesizers.',
    showHead: true,
    postDelay: 1500,
  },
  {
    id: 'speech-dectalk',
    narration: 'DECtalk is the iconic speech synthesizer that Stephen Hawking used. We run it entirely in your browser as a WebAssembly module. I have 9 different voices. Right now, you are hearing Paul.',
    showHead: true,
    postDelay: 1500,
  },
  {
    id: 'speech-betty',
    narration: 'And this is Betty. Another DECtalk voice. Every voice has its own personality and character.',
    voice: 1,  // Betty
    showHead: true,
    postDelay: 1500,
  },
  {
    id: 'speech-harry',
    narration: 'And this is Harry. A deeper, more authoritative voice.',
    voice: 2,  // Harry
    showHead: true,
    postDelay: 1500,
  },
  {
    id: 'speech-back-to-paul',
    narration: 'Back to Paul. Besides DECtalk, DEViLBOX also includes SAM, the Software Automatic Mouth from the Commodore 64. Pink Trombone, a real-time vocal tract simulator. And vintage arcade speech chips like the Votrax and the TI TMS5220.',
    voice: 0,  // Paul
    showHead: true,
    postDelay: 2000,
  },

  // ── Act 4: DJ View ──────────────────────────────────────────────────────
  {
    id: 'dj-intro',
    narration: 'Now let us switch to the DJ view.',
    action: async () => {
      // Stop tracker playback before switching
      const { useTransportStore } = await import('@/stores/useTransportStore');
      useTransportStore.getState().stop();
      switchView('dj');
    },
    postDelay: 2000,
  },
  {
    id: 'dj-overview',
    narration: 'Welcome to the DJ mixer. A full dual-deck system running in your browser. Two decks, a mixer, and effects. Everything you need to mix music live.',
    postDelay: 2000,
  },
  {
    id: 'dj-decks',
    narration: 'Each deck shows a real-time waveform display with beat detection and BPM analysis. Load any supported music file and it is instantly analyzed for beats and tempo.',
    spotlight: '[data-dj-deck-drop]',
    postDelay: 1500,
  },
  {
    id: 'dj-mixer',
    narration: 'The center mixer section has 3-band EQ, high, mid, and low. A crossfader to blend between decks. Volume controls. Just like a real hardware DJ mixer.',
    postDelay: 1500,
  },
  {
    id: 'dj-fx',
    narration: 'FX pads give you instant access to filter sweeps, echo out, brake effects, and EQ band kills. Touch them to activate, release to deactivate.',
    postDelay: 1500,
  },
  {
    id: 'dj-autodj',
    narration: 'Auto DJ mode automatically beat-matches tracks and crossfades between them. Build a playlist and let the machine take over.',
    postDelay: 1500,
  },
  {
    id: 'dj-vocoder',
    narration: 'The built-in vocoder lets you use your microphone to create robotic vocal effects over the music in real-time. With auto-tune and formant shifting.',
    postDelay: 1500,
  },
  {
    id: 'dj-archives',
    narration: 'You can search and stream music from two massive online archives. Modland, with over 190,000 tracker modules from the demoscene. And the High Voltage SID Collection, with over 80,000 Commodore 64 tunes.',
    postDelay: 2000,
  },

  // ── Act 5: DrumPad View ─────────────────────────────────────────────────
  {
    id: 'drumpad-intro',
    narration: 'Next up, the drum pad view.',
    action: () => switchView('drumpad'),
    postDelay: 2000,
  },
  {
    id: 'drumpad-overview',
    narration: 'An MPC-style 16-pad drum machine controller. Each pad can hold a sample, a synthesizer, or any instrument from our 120 engine collection.',
    spotlight: '[data-pad-id]',
    postDelay: 1500,
  },
  {
    id: 'drumpad-velocity',
    narration: 'Pads respond to velocity. Hit harder for louder sounds. On touch screens, press duration controls the velocity. Works with MIDI controllers too.',
    postDelay: 1500,
  },
  {
    id: 'drumpad-banks',
    narration: 'Switch between banks for up to 128 total pads. Save and load entire drum kits. Import and export configurations.',
    postDelay: 1500,
  },
  {
    id: 'drumpad-djfx',
    narration: 'In DJ FX mode, the pads become effect triggers for the DJ mixer. Perfect for live performance.',
    postDelay: 1500,
  },

  // ── Act 6: VJ & Visualizers ─────────────────────────────────────────────
  {
    id: 'vj-intro',
    narration: 'Now, the VJ view. Real-time audio visualizations.',
    action: () => {
      enableKraftwerkHead();
      switchView('vj');
    },
    showHead: true,
    postDelay: 2500,
  },
  {
    id: 'vj-milkdrop',
    narration: 'Butterchurn brings hundreds of Milkdrop music-reactive visual presets. WebGL powered, running at full frame rate. Originally from Winamp, now in your browser.',
    showHead: true,
    postDelay: 2000,
  },
  {
    id: 'vj-kraftwerk',
    narration: 'And this is our 3D Kraftwerk head avatar. It syncs its mouth movements to speech synthesis output in real-time. Yes, it is synced to my voice right now.',
    showHead: true,
    postDelay: 2000,
  },
  {
    id: 'vj-cleanup',
    narration: '',
    action: () => disableKraftwerkHead(),
    postDelay: 100,
    rate: 300,
  },

  // ── Act 7: Mixer View ──────────────────────────────────────────────────
  {
    id: 'mixer-intro',
    narration: 'The mixer panel.',
    action: () => switchView('mixer'),
    postDelay: 2000,
  },
  {
    id: 'mixer-overview',
    narration: 'Per-channel volume faders, pan controls, mute and solo buttons, and peak level meters. Professional mixing capabilities right in your browser.',
    postDelay: 2000,
  },

  // ── Act 8: Closing ─────────────────────────────────────────────────────
  {
    id: 'closing',
    narration: 'That concludes our tour of DEViLBOX.',
    action: () => switchView('tracker'),
    postDelay: 1500,
  },
  {
    id: 'closing-summary',
    narration: 'A complete music production studio, DJ mixer, drum machine, and visualizer. Over 120 synthesizer engines, 188 format importers, and two massive online music archives. All running in your web browser, powered by WebAssembly.',
    postDelay: 1500,
  },
  {
    id: 'closing-thanks',
    narration: 'Thank you for watching. Enjoy making music with DEViLBOX.',
    postDelay: 3000,
  },
];
