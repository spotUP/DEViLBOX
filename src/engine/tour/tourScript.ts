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
    const file = new File([buf], filename, { type: 'application/octet-stream' });

    // loadFile returns 'pending-import' for .mod/.xm/.it etc — it expects
    // the import dialog to handle it.  Bypass that: prepare ModuleInfo and
    // call importTrackerModule directly (the same function the dialog calls).
    const { loadModuleFile } = await import('@/lib/import/ModuleLoader');
    const { importTrackerModule } = await import('@/lib/file/UnifiedFileLoader');
    const info = await loadModuleFile(file);
    await importTrackerModule(info, { useLibopenmpt: false });
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

    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { getDJPipeline } = await import('@/engine/dj/DJPipeline');
    const { getDJEngine } = await import('@/engine/dj/DJEngine');
    const { detectBPM } = await import('@/engine/dj/DJBeatDetector');
    const { useDJStore } = await import('@/stores/useDJStore');

    const blob = new File([buf], filename, { type: 'application/octet-stream' });
    const song = await parseModuleToSong(blob);
    const bpmResult = detectBPM(song);

    useDJStore.getState().setDeckState(deckId, {
      fileName: filename,
      trackName: song.name || filename,
      detectedBPM: bpmResult.bpm,
      effectiveBPM: bpmResult.bpm,
      analysisState: 'rendering',
      isPlaying: false,
    });

    const result = await getDJPipeline().loadOrEnqueue(buf, filename, deckId, 'high');
    await getDJEngine().loadAudioToDeck(
      deckId, result.wavData, filename,
      song.name || filename, result.analysis?.bpm || bpmResult.bpm, song
    );
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

// ── Instrument & Synth editing actions ────────────────────────────────────────

/** Create a synth instrument and select it */
async function createAndSelectInstrument(
  synthType: string, name: string
): Promise<number | null> {
  try {
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const id = useInstrumentStore.getState().createInstrument({
      synthType: synthType as any,
      name,
    } as any);
    useInstrumentStore.getState().setCurrentInstrument(id);
    return id;
  } catch (err) {
    console.warn(`[Tour] Failed to create instrument ${synthType}:`, err);
    return null;
  }
}

/** Open the instrument editor modal */
async function openInstrumentEditor(instrumentId?: number): Promise<void> {
  const { useUIStore: UI } = await import('@/stores/useUIStore');
  UI.getState().openModal('instruments', instrumentId != null ? { instrumentId } : undefined);
}

/** Close any open modal */
async function closeModals(): Promise<void> {
  const { useUIStore: UI } = await import('@/stores/useUIStore');
  UI.getState().closeModal();
}

/** Get the first sample-type instrument from the loaded song */
async function getFirstSampleInstrument(): Promise<number | null> {
  const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
  const instruments = useInstrumentStore.getState().instruments;
  const sampleInst = instruments.find(i => i.type === 'sample' && i.sample?.audioBuffer);
  return sampleInst?.id ?? null;
}

/** Apply a WaveformProcessor operation to an instrument's sample (visually updates editor) */
async function applySampleOperation(
  instrumentId: number,
  operation: 'reverse' | 'normalize' | 'fadeIn' | 'fadeOut' | 'amigaPal8Bit'
): Promise<void> {
  try {
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { WaveformProcessor } = await import('@/lib/audio/WaveformProcessor');
    const { getToneEngine } = await import('@/engine/ToneEngine');

    const inst = useInstrumentStore.getState().getInstrument(instrumentId);
    if (!inst?.sample?.audioBuffer) return;

    // Decode the stored ArrayBuffer to an AudioBuffer
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const audioBuffer = await ctx.decodeAudioData(
      (inst.sample.audioBuffer as ArrayBuffer).slice(0)
    );

    let result: AudioBuffer;
    switch (operation) {
      case 'reverse':
        result = WaveformProcessor.reverse(audioBuffer);
        break;
      case 'normalize':
        result = WaveformProcessor.normalize(audioBuffer);
        break;
      case 'fadeIn':
        result = WaveformProcessor.fadeIn(audioBuffer, 0, Math.floor(audioBuffer.length * 0.3));
        break;
      case 'fadeOut':
        result = WaveformProcessor.fadeOut(audioBuffer, Math.floor(audioBuffer.length * 0.7), audioBuffer.length);
        break;
      case 'amigaPal8Bit':
        result = WaveformProcessor.amigaPal8Bit(audioBuffer);
        break;
      default:
        return;
    }

    // Encode back and update in store
    const arrayBuffer = await getToneEngine().encodeAudioData(result);
    useInstrumentStore.getState().updateInstrument(instrumentId, {
      sample: { ...inst.sample, audioBuffer: arrayBuffer },
    });
    getToneEngine().invalidateInstrument(instrumentId);
  } catch (err) {
    console.warn(`[Tour] Sample operation ${operation} failed:`, err);
  }
}

/** Play the currently selected sample instrument */
async function playSampleInstrument(instrumentId: number): Promise<void> {
  await playInstrumentNote(instrumentId, 'C4', 1500);
}

/** Trigger a note on an instrument (for demo) */
async function playInstrumentNote(instrumentId: number, note: string, durationMs = 500): Promise<void> {
  try {
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { getToneEngine } = await import('@/engine/ToneEngine');
    const config = useInstrumentStore.getState().getInstrument(instrumentId);
    if (!config) return;
    getToneEngine().triggerNoteAttack(instrumentId, note, 0, 0.85, config);
    setTimeout(() => {
      try { getToneEngine().triggerNoteRelease(instrumentId, note, 0, config); } catch { /* */ }
    }, durationMs);
  } catch (err) {
    console.warn(`[Tour] Failed to play instrument note:`, err);
  }
}

// ── DrumPad actions ──────────────────────────────────────────────────────────

/** Trigger a synth-configured pad via ToneEngine (808/909 drum machines) */
async function triggerDrumPad(padId: number, note?: string, velocity = 0.85): Promise<void> {
  try {
    const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
    const { getToneEngine } = await import('@/engine/ToneEngine');
    const { PAD_INSTRUMENT_BASE } = await import('@/types/drumpad');

    const store = useDrumPadStore.getState();
    const program = store.programs.get(store.currentProgramId);
    const pad = program?.pads.find(p => p.id === padId);
    if (!pad?.synthConfig) return;

    const instId = PAD_INSTRUMENT_BASE + pad.id;
    const config = { ...pad.synthConfig, id: instId };
    const n = note || pad.instrumentNote || 'C4';
    getToneEngine().triggerNoteAttack(instId, n, 0, velocity, config);
    // Auto-release after short time
    setTimeout(() => {
      try { getToneEngine().triggerNoteRelease(instId, n, 0, config); } catch { /* */ }
    }, 300);
  } catch (err) {
    console.warn(`[Tour] Failed to trigger pad ${padId}:`, err);
  }
}

/** Play a rhythmic pattern on 808 pads */
async function play808Pattern(): Promise<void> {
  // Simple boom-bap pattern: kick, hat, snare, hat (repeating)
  const pattern = [
    { pad: 1, delay: 0 },      // Kick
    { pad: 5, delay: 200 },    // Closed hat
    { pad: 2, delay: 400 },    // Snare
    { pad: 5, delay: 600 },    // Closed hat
    { pad: 1, delay: 800 },    // Kick
    { pad: 5, delay: 1000 },   // Closed hat
    { pad: 2, delay: 1200 },   // Snare
    { pad: 6, delay: 1400 },   // Open hat
    // Second bar — with toms and cowbell
    { pad: 1, delay: 1600 },   // Kick
    { pad: 5, delay: 1800 },   // Closed hat
    { pad: 2, delay: 2000 },   // Snare
    { pad: 12, delay: 2100 },  // Cowbell
    { pad: 1, delay: 2400 },   // Kick
    { pad: 8, delay: 2600 },   // Mid tom
    { pad: 2, delay: 2800 },   // Snare
    { pad: 3, delay: 3000 },   // Clap
  ];
  for (const hit of pattern) {
    setTimeout(() => triggerDrumPad(hit.pad), hit.delay);
  }
}

/** Switch to the 808 program */
async function loadDrumProgram(programId: string): Promise<void> {
  const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
  useDrumPadStore.getState().loadProgram(programId);
}

/** Switch drum pad bank */
async function setDrumBank(bank: 'A' | 'B' | 'C' | 'D'): Promise<void> {
  const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
  useDrumPadStore.getState().setBank(bank);
}

/** Engage a DJ FX action (from the DJ FX program pad set) */
async function engageDjFx(actionId: string): Promise<void> {
  try {
    const { DJ_FX_ACTION_MAP } = await import('@/engine/drumpad/DjFxActions');
    const action = DJ_FX_ACTION_MAP[actionId as keyof typeof DJ_FX_ACTION_MAP];
    if (action) action.engage();
  } catch (err) {
    console.warn(`[Tour] Failed to engage DJ FX ${actionId}:`, err);
  }
}

/** Disengage a DJ FX action */
async function disengageDjFx(actionId: string): Promise<void> {
  try {
    const { DJ_FX_ACTION_MAP } = await import('@/engine/drumpad/DjFxActions');
    const action = DJ_FX_ACTION_MAP[actionId as keyof typeof DJ_FX_ACTION_MAP];
    if (action) action.disengage();
  } catch (err) {
    console.warn(`[Tour] Failed to disengage DJ FX ${actionId}:`, err);
  }
}

/** Set up a DECtalk speech synth on a pad and trigger it */
async function triggerSpeechPad(padId: number, text: string, voice = 0): Promise<void> {
  try {
    const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
    const { getToneEngine } = await import('@/engine/ToneEngine');
    const { PAD_INSTRUMENT_BASE } = await import('@/types/drumpad');

    // Configure the pad with DECtalk synth
    useDrumPadStore.getState().updatePad(padId, {
      name: 'DECtalk',
      color: '#8b5cf6',
      synthConfig: {
        id: PAD_INSTRUMENT_BASE + padId,
        name: `DECtalk Pad ${padId}`,
        type: 'synth',
        synthType: 'DECtalk',
        effects: [],
        volume: 0,
        pan: 0,
        parameters: { text, voice, rate: 220, pitch: 0.5 },
      },
      instrumentNote: 'C4',
    });

    // Small delay for the synth to initialize and pre-render
    await new Promise(r => setTimeout(r, 1500));

    const instId = PAD_INSTRUMENT_BASE + padId;
    const config = useDrumPadStore.getState().programs.get(
      useDrumPadStore.getState().currentProgramId
    )?.pads.find(p => p.id === padId)?.synthConfig;
    if (!config) return;
    getToneEngine().triggerNoteAttack(instId, 'C4', 0, 0.9, { ...config, id: instId });
  } catch (err) {
    console.warn(`[Tour] Failed to trigger speech pad:`, err);
  }
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

  // ── Act 3: Instrument & Synth Editing ──────────────────────────────────
  {
    id: 'synth-intro',
    narration: 'Let me show you the synth engines. Over 120 to choose from.',
    action: async () => {
      switchView('tracker');
      await createAndSelectInstrument('Amsynth', 'Tour Pad');
    },
    postDelay: 500,
  },
  {
    id: 'synth-open-editor',
    narration: 'Here is the instrument editor. Full parameter control.',
    action: async () => {
      const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
      const id = useInstrumentStore.getState().currentInstrumentId;
      if (id != null) await openInstrumentEditor(id);
    },
    postDelay: 2500,
  },
  {
    id: 'synth-play-notes',
    narration: '',
    action: async () => {
      const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
      const id = useInstrumentStore.getState().currentInstrumentId;
      if (id == null) return;
      // Play an ascending riff
      const notes = ['C4', 'E4', 'G4', 'C5', 'G4', 'E4'];
      for (let i = 0; i < notes.length; i++) {
        setTimeout(() => playInstrumentNote(id, notes[i], 350), i * 300);
      }
    },
    postDelay: 2500,
  },
  {
    id: 'synth-close-switch',
    narration: 'Let me switch to a different synth. How about a TB-303 acid bass line.',
    action: async () => {
      await closeModals();
      await createAndSelectInstrument('TB303', 'Acid Bass');
    },
    postDelay: 500,
  },
  {
    id: 'synth-303-editor',
    narration: '',
    action: async () => {
      const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
      const id = useInstrumentStore.getState().currentInstrumentId;
      if (id != null) await openInstrumentEditor(id);
    },
    postDelay: 1000,
  },
  {
    id: 'synth-303-play',
    narration: '',
    action: async () => {
      const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
      const id = useInstrumentStore.getState().currentInstrumentId;
      if (id == null) return;
      // 303-style acid sequence
      const notes = ['C2', 'C2', 'Eb2', 'F2', 'F2', 'Ab2', 'Bb2', 'C3'];
      for (let i = 0; i < notes.length; i++) {
        setTimeout(() => playInstrumentNote(id, notes[i], 180), i * 200);
      }
    },
    postDelay: 2500,
  },

  // ── Act 3b: Sample Editor Deep Dive ─────────────────────────────────────
  {
    id: 'sample-open',
    narration: 'Now the sample editor. This module has real Amiga samples. Let me open one.',
    action: async () => {
      await closeModals();
      const id = await getFirstSampleInstrument();
      if (id != null) {
        const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
        useInstrumentStore.getState().setCurrentInstrument(id);
        await openInstrumentEditor(id);
      }
    },
    postDelay: 1500,
  },
  {
    id: 'sample-play-original',
    narration: 'Here is the original sample.',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) await playSampleInstrument(id);
    },
    postDelay: 2000,
  },
  {
    id: 'sample-reverse',
    narration: 'Watch — I can reverse it live.',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) {
        await applySampleOperation(id, 'reverse');
        // Brief pause then play reversed
        await new Promise(r => setTimeout(r, 300));
        await playSampleInstrument(id);
      }
    },
    postDelay: 2000,
  },
  {
    id: 'sample-reverse-back',
    narration: '',
    action: async () => {
      // Reverse it back to original
      const id = await getFirstSampleInstrument();
      if (id != null) await applySampleOperation(id, 'reverse');
    },
    postDelay: 300,
  },
  {
    id: 'sample-normalize',
    narration: 'Normalize to maximize volume. Watch the waveform scale up.',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) {
        await applySampleOperation(id, 'normalize');
        await new Promise(r => setTimeout(r, 300));
        await playSampleInstrument(id);
      }
    },
    postDelay: 2000,
  },
  {
    id: 'sample-features',
    narration: 'Cut, copy, paste. Fade in, fade out. Loop point detection. Beat slicing. Spectral filtering. DC offset removal. All nondestructive with full undo.',
    postDelay: 1500,
  },
  {
    id: 'sample-enhancement',
    narration: 'Plus AI-powered enhancement. Spectral exciter for brightness. Transient sharpening for punch. Noise reduction. Pseudo-stereo widening.',
    postDelay: 1500,
  },
  {
    id: 'sample-amiga',
    narration: 'And Amiga PAL 8-bit resampling. Authentic hardware sound, down to the aliasing artifacts.',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) {
        await applySampleOperation(id, 'amigaPal8Bit');
        await new Promise(r => setTimeout(r, 300));
        await playSampleInstrument(id);
      }
    },
    postDelay: 2500,
  },
  {
    id: 'sample-mpc',
    narration: 'Or MPC-style resampling. SP twelve hundred, MPC sixty, MPC three thousand. The grit and color of classic samplers.',
    postDelay: 1500,
  },
  {
    id: 'sample-granular',
    narration: 'There is also a granular synth engine. Scatter clouds of tiny grains across the sample. Freeze, stretch, morph.',
    postDelay: 1500,
  },
  {
    id: 'sample-waveform-studio',
    narration: 'And a waveform drawing studio for chip music. Draw single-cycle waveforms pixel by pixel, like the Amiga days.',
    postDelay: 1500,
  },
  {
    id: 'synth-cleanup',
    narration: '',
    action: closeModals,
    postDelay: 300,
  },

  // ── Act 4: DrumPads — 808 demo, DJ FX, speech synth ────────────────────
  {
    id: 'drumpad-switch',
    narration: 'The drum pads. MPC-style, 16 pads, velocity sensitive. Let me play a beat.',
    action: async () => {
      switchView('drumpad');
      await loadDrumProgram('A-01'); // TR-808
      await setDrumBank('A');
    },
    spotlight: '[data-pad-id]',
    postDelay: 500,
  },
  {
    id: 'drumpad-808-beat',
    narration: '',
    action: play808Pattern,
    spotlight: '[data-pad-id]',
    postDelay: 3500,
  },
  {
    id: 'drumpad-808-explain',
    narration: 'Circuit-modeled 808 and 909 drum synthesis. Every parameter, just like the real hardware.',
    spotlight: '[data-pad-id]',
    postDelay: 1000,
  },
  {
    id: 'drumpad-djfx-switch',
    narration: 'The pads also work as DJ effects triggers. Hold a pad to engage.',
    action: async () => {
      await loadDrumProgram('C-01'); // DJ FX
    },
    spotlight: '[data-pad-id]',
    postDelay: 500,
  },
  {
    id: 'drumpad-djfx-demo',
    narration: '',
    action: async () => {
      // Flash through a few FX: dub siren, then air horn, then bitcrush
      await engageDjFx('fx_dub_siren');
      setTimeout(() => disengageDjFx('fx_dub_siren'), 1500);
      setTimeout(() => engageDjFx('fx_air_horn'), 2000);
      setTimeout(() => disengageDjFx('fx_air_horn'), 3000);
    },
    spotlight: '[data-pad-id]',
    postDelay: 3500,
  },
  {
    id: 'drumpad-speech-setup',
    narration: 'Now watch this. I can put a speech synth on a pad.',
    action: async () => {
      // Switch back to an editable kit and set up DECtalk on pad 1
      await loadDrumProgram('D-01'); // Empty Kit
      await triggerSpeechPad(49, 'DEViLBOX is alive. I am a drum pad now.', 0);
    },
    spotlight: '[data-pad-id]',
    postDelay: 4000,
  },
  {
    id: 'drumpad-speech-demo2',
    narration: '',
    action: async () => {
      // Trigger same pad at different pitches
      await triggerSpeechPad(50, 'Hello from Betty.', 1);
    },
    spotlight: '[data-pad-id]',
    postDelay: 3500,
  },
  {
    id: 'drumpad-banks',
    narration: 'Four banks of sixteen pads. 128 total slots per program. Drag and drop any sample or synth.',
    postDelay: 1000,
  },

  // ── Act 5: DJ View — load two tracks and mix ──────────────────────────
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

  // ── Act 6: Speech Synths (the meta moment) ──────────────────────────────
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

  // ── Act 7: VJ + Kraftwerk head ──────────────────────────────────────────
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

  // ── Act 8: Mixer ────────────────────────────────────────────────────────
  {
    id: 'mixer-switch',
    narration: 'The mixer. Per-channel faders, pan, mute, solo, and meters.',
    action: () => switchView('mixer'),
    postDelay: 1500,
  },

  // ── Act 9: Closing (fast) ───────────────────────────────────────────────
  {
    id: 'closing',
    narration: 'DEViLBOX. 120 synth engines. 188 formats. Two massive music archives. All in your browser. Thanks for watching.',
    action: () => switchView('tracker'),
    postDelay: 2000,
  },
];
