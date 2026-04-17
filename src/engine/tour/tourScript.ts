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

function switchView(view: 'tracker' | 'dj' | 'drumpad' | 'vj'): void {
  useUIStore.getState().setActiveView(view);
}

async function loadTrackerSong(path: string): Promise<void> {
  try {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${path}`);
    const buf = await resp.arrayBuffer();
    const filename = path.split('/').pop() || 'song';
    const file = new File([buf], filename, { type: 'application/octet-stream' });

    const { detectFormat } = await import('@/lib/import/FormatRegistry');
    const fmt = detectFormat(filename);

    // Formats with a nativeParser (AHX/HVL, FC, Symphonie, etc.) must go
    // through parseModuleToSong directly — loadModuleFile would try libopenmpt
    // which doesn't support them.
    if (fmt?.nativeParser) {
      const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
      const { useTrackerStore } = await import('@/stores/useTrackerStore');
      const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
      const { useTransportStore } = await import('@/stores/useTransportStore');
      const { useProjectStore } = await import('@/stores/useProjectStore');
      const { useFormatStore } = await import('@/stores/useFormatStore');
      const { getToneEngine } = await import('@/engine/ToneEngine');

      const song = await parseModuleToSong(file);
      const { loadPatterns, setPatternOrder, setCurrentPattern } = useTrackerStore.getState();
      const { loadInstruments } = useInstrumentStore.getState();
      const { setBPM, setSpeed } = useTransportStore.getState();
      const { setMetadata } = useProjectStore.getState();
      const { applyEditorMode, setOriginalModuleData } = useFormatStore.getState();

      loadInstruments(song.instruments);
      loadPatterns(song.patterns);
      setCurrentPattern(0);
      if (song.songPositions.length > 0) setPatternOrder(song.songPositions);
      setOriginalModuleData({
        base64: '',
        format: (song.format || 'UNKNOWN') as any,
        initialBPM: song.initialBPM,
        initialSpeed: song.initialSpeed,
        songLength: song.songLength,
      } as any);
      setBPM(song.initialBPM);
      setSpeed(song.initialSpeed);
      setMetadata({ name: song.name, author: '', description: `Imported from ${filename}` });
      applyEditorMode(song);

      const engine = getToneEngine();
      const hasWasmSynths = song.instruments.some(i => i.synthType && i.synthType !== 'Sampler' && i.synthType !== 'Synth');
      if (hasWasmSynths) await engine.preloadInstruments(song.instruments);
    } else {
      // Standard formats (MOD/XM/IT/S3M) — use loadFile + importTrackerModule
      const { loadFile, importTrackerModule } = await import('@/lib/file/UnifiedFileLoader');
      const result = await loadFile(file, { requireConfirmation: false });

      if (result.success === 'pending-import') {
        const { loadModuleFile } = await import('@/lib/import/ModuleLoader');
        const info = await loadModuleFile(file);
        await importTrackerModule(info, { useLibopenmpt: true });
      } else if (!result.success) {
        console.warn('[Tour] loadFile failed:', result.error);
      }
    }

    // Give the engine a moment to finish setting up channels/instruments
    await new Promise(r => setTimeout(r, 500));
  } catch (err) {
    console.warn('[Tour] Failed to load song:', err);
  }
}

async function trackerPlay(): Promise<void> {
  const { useTransportStore } = await import('@/stores/useTransportStore');
  await useTransportStore.getState().play();
}

async function trackerStop(): Promise<void> {
  const { useTransportStore } = await import('@/stores/useTransportStore');
  useTransportStore.getState().stop();
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
    const config: Record<string, unknown> = { synthType, name };
    // TB303 needs its sub-config or the editor won't render
    if (synthType === 'TB303' || synthType === 'Buzz3o3') {
      const { DEFAULT_TB303 } = await import('@typedefs/instrument');
      config.tb303 = { ...DEFAULT_TB303 };
    }
    const id = useInstrumentStore.getState().createInstrument(config as any);
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

/** Get the best sample-type instrument from the loaded song (largest sample = most interesting) */
async function getFirstSampleInstrument(): Promise<number | null> {
  const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
  const instruments = useInstrumentStore.getState().instruments;
  // Find all instruments with actual sample data
  const sampleInsts = instruments.filter(i =>
    i.type === 'sample' && (
      (i.sample?.audioBuffer instanceof ArrayBuffer && i.sample.audioBuffer.byteLength > 0) ||
      (i.sample?.url && i.sample.url.length > 0)
    )
  );
  if (sampleInsts.length === 0) {
    const sampleTypes = instruments.filter(i => i.type === 'sample');
    console.warn(`[Tour] getFirstSampleInstrument: ${instruments.length} instruments, ${sampleTypes.length} sample-type, none with valid data`);
    return null;
  }
  // Prefer instrument ID 6 (sample 6 in the MOD — good waveform for demo)
  const preferred = sampleInsts.find(i => i.id === 6);
  const best = preferred ?? sampleInsts.reduce((a, b) => {
    const aSize = (a.sample?.audioBuffer as ArrayBuffer)?.byteLength ?? 0;
    const bSize = (b.sample?.audioBuffer as ArrayBuffer)?.byteLength ?? 0;
    return bSize > aSize ? b : a;
  });
  console.log(`[Tour] getFirstSampleInstrument: picked id=${best.id} name="${best.name}" (${(best.sample?.audioBuffer as ArrayBuffer)?.byteLength ?? 0} bytes)`);
  return best.id;
}

/**
 * Parse a WAV ArrayBuffer into an AudioBuffer WITHOUT using decodeAudioData.
 * Re-exported from shared utility for use in tour functions.
 */
async function parseWavForTour(wavData: ArrayBuffer): Promise<AudioBuffer> {
  const { parseWavToAudioBuffer } = await import('@/utils/audio/wavParser');
  return parseWavToAudioBuffer(wavData);
}

/** Apply a WaveformProcessor operation to an instrument's sample (visually updates editor) */
async function applySampleOperation(
  instrumentId: number,
  operation: 'reverse' | 'normalize' | 'fadeIn' | 'fadeOut' | 'amigaPal8Bit' | 'silence'
): Promise<void> {
  try {
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { WaveformProcessor } = await import('@/lib/audio/WaveformProcessor');
    const { getToneEngine } = await import('@/engine/ToneEngine');

    const inst = useInstrumentStore.getState().getInstrument(instrumentId);
    if (!inst?.sample?.audioBuffer) return;

    // Parse WAV manually instead of using decodeAudioData — avoids browser
    // EncodingError on low sample rate WAVs (8363 Hz MOD samples)
    const audioBuffer = await parseWavForTour(
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
      case 'silence':
        result = WaveformProcessor.silence(audioBuffer, Math.floor(audioBuffer.length * 0.3), Math.floor(audioBuffer.length * 0.6));
        break;
      default:
        return;
    }

    // Encode back to WAV and update in store — also create a blob URL so the
    // SampleEditor waveform display sees the change (it watches sample.url,
    // not sample.audioBuffer directly)
    // CRITICAL: Use WaveformProcessor.bufferToWav (proper WAV with header), NOT
    // ToneEngine.encodeAudioData (raw Float32 PCM — browser can't decode it).
    const arrayBuffer = await WaveformProcessor.bufferToWav(result);
    const blob = new Blob([arrayBuffer.slice(0)], { type: 'audio/wav' });
    const blobUrl = URL.createObjectURL(blob);
    useInstrumentStore.getState().updateInstrument(instrumentId, {
      sample: { ...inst.sample, audioBuffer: arrayBuffer, url: blobUrl },
    });
    getToneEngine().invalidateInstrument(instrumentId);
  } catch (err) {
    console.warn(`[Tour] Sample operation ${operation} failed:`, err);
  }
}

/** Apply a SampleProcessing enhancement to an instrument's sample */
async function applySampleEnhancement(
  instrumentId: number,
  enhancement: 'exciter' | 'transient' | 'denoise' | 'stereo'
): Promise<void> {
  try {
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { getToneEngine } = await import('@/engine/ToneEngine');
    const {
      applySpectralExciter,
      applyTransientSharpening,
      applyDenoise,
      applyPseudoStereo,
    } = await import('@/utils/audio/SampleProcessing');

    const inst = useInstrumentStore.getState().getInstrument(instrumentId);
    if (!inst?.sample?.audioBuffer) return;

    // Parse WAV manually (same as applySampleOperation — avoids decodeAudioData issues)
    const audioBuffer = await parseWavForTour(
      (inst.sample.audioBuffer as ArrayBuffer).slice(0)
    );

    let processed: { buffer: AudioBuffer };
    switch (enhancement) {
      case 'exciter':
        processed = await applySpectralExciter(audioBuffer, { drive: 60, mix: 50, frequency: 4000 });
        break;
      case 'transient':
        processed = await applyTransientSharpening(audioBuffer, 0.7);
        break;
      case 'denoise':
        processed = await applyDenoise(audioBuffer, -40);
        break;
      case 'stereo':
        processed = await applyPseudoStereo(audioBuffer, 0.7);
        break;
      default:
        return;
    }

    const { WaveformProcessor } = await import('@/lib/audio/WaveformProcessor');
    const arrayBuffer = await WaveformProcessor.bufferToWav(processed.buffer);
    const blob = new Blob([arrayBuffer.slice(0)], { type: 'audio/wav' });
    const blobUrl = URL.createObjectURL(blob);
    useInstrumentStore.getState().updateInstrument(instrumentId, {
      sample: { ...inst.sample, audioBuffer: arrayBuffer, url: blobUrl },
    });
    getToneEngine().invalidateInstrument(instrumentId);
  } catch (err) {
    console.warn(`[Tour] Enhancement ${enhancement} failed:`, err);
  }
}

/** Store the original sample buffer for undo during the demo */
let originalSampleBackup: ArrayBuffer | null = null;

async function backupSample(instrumentId: number): Promise<void> {
  const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
  const inst = useInstrumentStore.getState().getInstrument(instrumentId);
  if (inst?.sample?.audioBuffer) {
    originalSampleBackup = (inst.sample.audioBuffer as ArrayBuffer).slice(0);
  }
}

async function restoreSample(instrumentId: number): Promise<void> {
  if (!originalSampleBackup) return;
  const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
  const { getToneEngine } = await import('@/engine/ToneEngine');
  const inst = useInstrumentStore.getState().getInstrument(instrumentId);
  if (!inst?.sample) return;
  const buf = originalSampleBackup.slice(0);
  const blob = new Blob([buf.slice(0)], { type: 'audio/wav' });
  const blobUrl = URL.createObjectURL(blob);
  useInstrumentStore.getState().updateInstrument(instrumentId, {
    sample: { ...inst.sample, audioBuffer: buf, url: blobUrl },
  });
  getToneEngine().invalidateInstrument(instrumentId);
}

/** Play the currently selected sample instrument at its natural pitch.
 *  Uses direct Web Audio for reliable playback at the sample's native rate. */
async function playSampleInstrument(instrumentId: number, durationMs = 3000): Promise<void> {
  const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
  const Tone = await import('tone');
  const config = useInstrumentStore.getState().getInstrument(instrumentId);
  if (!config) return;

  if (Tone.getContext().state !== 'running') {
    await Tone.start();
  }

  // Direct Web Audio path: decode the WAV and play at native sample rate.
  // This avoids Tone.Sampler pitch/caching issues after sample operations.
  const rawBuf = config.sample?.audioBuffer;
  if (rawBuf && rawBuf instanceof ArrayBuffer && rawBuf.byteLength > 0) {
    try {
      const { isWavBuffer, parseWavToAudioBuffer } = await import('@/utils/audio/wavParser');
      const ctx = Tone.getContext().rawContext as AudioContext;
      let decoded: AudioBuffer;
      if (isWavBuffer(rawBuf)) {
        decoded = parseWavToAudioBuffer(rawBuf.slice(0));
      } else {
        decoded = await ctx.decodeAudioData(rawBuf.slice(0));
      }
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      // MOD samples at native rate (8363 Hz) sound one octave too low;
      // double playback rate to match the Q-key (C one octave up from Z).
      source.playbackRate.value = 2.0;
      source.connect(ctx.destination);
      source.start();
      const playDuration = Math.min(durationMs, decoded.duration * 1000);
      setTimeout(() => { try { source.stop(); } catch { /* */ } }, playDuration);
      console.log(`[Tour] playSampleInstrument: direct playback id=${instrumentId} duration=${(playDuration / 1000).toFixed(1)}s sampleRate=${decoded.sampleRate}`);
    } catch (err) {
      console.warn('[Tour] Direct Web Audio playback failed:', err);
    }
  }
}

/** Trigger a note on an instrument (for demo) */
async function playInstrumentNote(instrumentId: number, note: string, durationMs = 500): Promise<void> {
  try {
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { getToneEngine } = await import('@/engine/ToneEngine');
    const Tone = await import('tone');
    const config = useInstrumentStore.getState().getInstrument(instrumentId);
    if (!config) {
      console.warn(`[Tour] playInstrumentNote: no config for id=${instrumentId}`);
      return;
    }
    // Ensure audio context is running (may have been suspended after inactivity)
    if (Tone.getContext().state !== 'running') {
      console.log('[Tour] Audio context not running, starting...');
      await Tone.start();
    }
    // Ensure instrument is created and sample data is decoded before triggering
    await getToneEngine().ensureInstrumentReady(config);
    await getToneEngine().awaitPendingLoads(5000);
    console.log(`[Tour] playInstrumentNote: id=${instrumentId} note=${note} synthType=${config.synthType} hasAudioBuffer=${!!config.sample?.audioBuffer} hasUrl=${!!config.sample?.url}`);
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
    const Tone = await import('tone');

    // Ensure audio context is running
    if (Tone.getContext().rawContext.state === 'suspended') {
      await Tone.start();
    }

    const store = useDrumPadStore.getState();
    const program = store.programs.get(store.currentProgramId);
    const pad = program?.pads.find(p => p.id === padId);
    if (!pad?.synthConfig) {
      console.warn(`[Tour] triggerDrumPad: pad ${padId} has no synthConfig`);
      return;
    }

    const instId = PAD_INSTRUMENT_BASE + pad.id;
    const config = { ...pad.synthConfig, id: instId };
    const n = note || pad.instrumentNote || 'C4';
    const engine = getToneEngine();

    // Ensure instrument is ready (loads WASM samples etc.)
    await engine.ensureInstrumentReady(config);

    engine.triggerNoteAttack(instId, n, 0, velocity, config);
    setTimeout(() => {
      try { engine.triggerNoteRelease(instId, n, 0, config); } catch { /* */ }
    }, 500);
  } catch (err) {
    console.warn(`[Tour] Failed to trigger pad ${padId}:`, err);
  }
}


/** Load a fresh factory drum program (replaces any stale persisted state) */
async function loadDrumProgram(programId: string): Promise<void> {
  const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
  const { create808Program, create909Program, createDJFXProgram } = await import('@/types/drumpad');

  // Replace with fresh factory program so synthConfigs are guaranteed present
  const factories: Record<string, () => import('@/types/drumpad').DrumProgram> = {
    'A-01': create808Program,
    'B-01': create909Program,
    'C-01': createDJFXProgram,
  };
  const factory = factories[programId];
  if (factory) {
    useDrumPadStore.getState().saveProgram(factory());
  }
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



// ── Modland / HVSC actions ──────────────────────────────────────────────────

/** Search Modland and load the first result into the DJ deck */
async function searchAndLoadModland(query: string, deckId: 'A' | 'B'): Promise<void> {
  try {
    const { searchModland, downloadModlandFile } = await import('@/lib/modlandApi');
    const results = await searchModland({ q: query, limit: 5 });
    if (!results.results || results.results.length === 0) {
      console.warn(`[Tour] No Modland results for "${query}"`);
      return;
    }
    const file = results.results[0];
    const buffer = await downloadModlandFile(file.full_path);
    const filename = file.full_path.split('/').pop() || 'download.mod';

    const { getDJEngine } = await import('@/engine/dj/DJEngine');
    const { loadUADEToDeck } = await import('@/engine/dj/DJUADEPrerender');
    await loadUADEToDeck(getDJEngine(), deckId, buffer, filename, true);
  } catch (err) {
    console.warn(`[Tour] Modland search/load failed for "${query}":`, err);
  }
}

// ── Automation actions ──────────────────────────────────────────────────────

/** Create a demo automation curve on a channel with a preset shape */
async function createAutomationCurve(
  channelIndex: number,
  parameter: string,
  presetId: string,
): Promise<void> {
  const { useAutomationStore } = await import('@/stores/useAutomationStore');
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const { suppressFormatChecks, restoreFormatChecks } = await import('@/lib/formatCompatibility');

  const store = useAutomationStore.getState();
  const trackerState = useTrackerStore.getState();
  const pattern = trackerState.patterns[trackerState.currentPatternIndex];
  if (!pattern) return;
  const patternId = pattern.id;

  // Suppress format violation dialogs — the tour doesn't click confirm
  suppressFormatChecks();
  try {
    const curveId = store.addCurve(patternId, channelIndex, parameter);
    if (!curveId) return;

    // Apply a preset shape
    const preset = store.presets.find(p => p.id === presetId);
    if (preset) {
      store.applyPreset(curveId, preset);
    }

    // Show the automation lane for this channel
    store.setShowLane(channelIndex, true);
    store.setActiveParameter(channelIndex, parameter);
  } finally {
    restoreFormatChecks();
  }
}

/** Clear all automation curves (cleanup) */
async function clearAllAutomation(): Promise<void> {
  const { useAutomationStore } = await import('@/stores/useAutomationStore');
  useAutomationStore.getState().reset();
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
    narration: 'This is the tracker. A pattern editor for making music. Let me load an AHX chiptune.',
    action: async () => {
      switchView('tracker');
      await loadTrackerSong('/data/songs/formats/aces_high.ahx');
    },
    postDelay: 800,
  },
  {
    id: 'tracker-play',
    narration: 'Here we go.',
    action: async () => {
      await trackerPlay();
      // Give the replayer a moment to start producing audio
      await new Promise(r => setTimeout(r, 300));
    },
    spotlight: '[data-tracker-editor]',
    postDelay: 4000,
  },
  {
    id: 'tracker-explain',
    narration: 'Each column is a channel. Notes, instruments, and effects scroll as the song plays. Over 120 synth engines and 188 import formats.',
    spotlight: '[data-tracker-editor]',
    postDelay: 2000,
  },

  // ── Master FX demo (song still playing) ──────────────────────────────
  {
    id: 'masterfx-intro',
    narration: 'While it plays, let me throw on some master effects. Tape echo.',
    action: async () => {
      const { useAudioStore } = await import('@/stores/useAudioStore');
      const { FX_PRESETS } = await import('@/constants/fxPresets');
      const preset = FX_PRESETS.find(p => p.name === 'Echo Out');
      if (preset) {
        const effects = preset.effects.map((e, i) => ({
          ...e,
          id: `tour-fx-${Date.now()}-${i}`,
          parameters: { ...e.parameters },
        }));
        useAudioStore.getState().setMasterEffects(effects);
      }
    },
    spotlight: '[data-tracker-editor]',
    postDelay: 4000,
  },
  {
    id: 'masterfx-dreamy',
    narration: 'Dreamy haze.',
    action: async () => {
      const { useAudioStore } = await import('@/stores/useAudioStore');
      const { FX_PRESETS } = await import('@/constants/fxPresets');
      const preset = FX_PRESETS.find(p => p.name === 'Dreamy Haze');
      if (preset) {
        const effects = preset.effects.map((e, i) => ({
          ...e,
          id: `tour-fx-${Date.now()}-${i}`,
          parameters: { ...e.parameters },
        }));
        useAudioStore.getState().setMasterEffects(effects);
      }
    },
    spotlight: '[data-tracker-editor]',
    postDelay: 4000,
  },
  {
    id: 'masterfx-psychedelic',
    narration: 'Psychedelic.',
    action: async () => {
      const { useAudioStore } = await import('@/stores/useAudioStore');
      const { FX_PRESETS } = await import('@/constants/fxPresets');
      const preset = FX_PRESETS.find(p => p.name === 'Psychedelic');
      if (preset) {
        const effects = preset.effects.map((e, i) => ({
          ...e,
          id: `tour-fx-${Date.now()}-${i}`,
          parameters: { ...e.parameters },
        }));
        useAudioStore.getState().setMasterEffects(effects);
      }
    },
    spotlight: '[data-tracker-editor]',
    postDelay: 3000,
  },
  {
    id: 'masterfx-chainsaw',
    narration: 'And the Swedish Chainsaw. H M 2 death metal tone.',
    action: async () => {
      const { useAudioStore } = await import('@/stores/useAudioStore');
      const { FX_PRESETS } = await import('@/constants/fxPresets');
      const preset = FX_PRESETS.find(p => p.name === 'Swedish Chainsaw');
      if (preset) {
        const effects = preset.effects.map((e, i) => ({
          ...e,
          id: `tour-fx-${Date.now()}-${i}`,
          parameters: { ...e.parameters },
        }));
        useAudioStore.getState().setMasterEffects(effects);
      }
    },
    spotlight: '[data-tracker-editor]',
    postDelay: 5000,
  },
  {
    id: 'masterfx-clear',
    narration: 'Back to clean. Over 60 mastering presets. Echo, distortion, reverb, vinyl, lo-fi, dub, stereo widening.',
    action: async () => {
      const { useAudioStore } = await import('@/stores/useAudioStore');
      useAudioStore.getState().setMasterEffects([]);
    },
    spotlight: '[data-tracker-editor]',
    postDelay: 2000,
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
      await createAndSelectInstrument('DuoSynth', 'Tour Lead');
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
      // Play an ascending riff — release each note before the next
      const notes = ['C4', 'E4', 'G4', 'C5', 'G4', 'E4'];
      for (let i = 0; i < notes.length; i++) {
        setTimeout(() => playInstrumentNote(id, notes[i], 250), i * 300);
      }
    },
    postDelay: 2500,
  },
  {
    id: 'synth-close-switch',
    narration: 'Let me switch to a different synth. How about a TB-303 acid bass line.',
    action: async () => {
      await closeModals();
    },
    postDelay: 500,
  },
  {
    id: 'acid-setup',
    narration: 'Loading a 303 acid demo with TR-909 drums. The sound that started a revolution.',
    action: async () => {
      const { useTransportStore } = await import('@/stores/useTransportStore');

      // Stop anything playing
      useTransportStore.getState().stop();

      // Stop native WASM engines from previous song
      const { getTrackerReplayer } = await import('@/engine/TrackerReplayer');
      const { clearRunningEngineKeys } = await import('@/engine/replayer/NativeEngineRouting');
      getTrackerReplayer().stop(false);
      clearRunningEngineKeys();

      // Clear format-specific data from previous AHX song
      const { useFormatStore } = await import('@/stores/useFormatStore');
      useFormatStore.getState().applyEditorMode({});

      // Clear old instruments
      const { getToneEngine } = await import('@/engine/ToneEngine');
      getToneEngine().disposeAllInstruments();

      // Load the pre-made 303 demo song
      await loadTrackerSong('/data/songs/303-Demo.dbx');

      // Show accent/slide columns
      const { useEditorStore } = await import('@/stores/useEditorStore');
      useEditorStore.getState().setColumnVisibility({ flag1: true, flag2: true });
    },
    postDelay: 1500,
  },
  {
    id: 'acid-play',
    narration: 'Four on the floor kick, hi-hats, and the 303. Let it rip.',
    action: async () => {
      const { getTrackerReplayer } = await import('@/engine/TrackerReplayer');
      const { useTransportStore } = await import('@/stores/useTransportStore');
      const { useTrackerStore } = await import('@/stores/useTrackerStore');

      const replayer = getTrackerReplayer();

      // Set up onRowChange callback for UI scrolling BEFORE play()
      replayer.onRowChange = (row, patternNum, _position) => {
        const store = useTrackerStore.getState();
        if (patternNum !== store.currentPatternIndex) {
          store.setCurrentPattern(patternNum, true);
        }
        useTransportStore.getState().setCurrentRow(row);
      };
      replayer.onSongEnd = () => {};

      // Let the React usePatternPlayback effect handle loadSong + replayer.play().
      // DO NOT call replayer.play() directly — that creates a race condition with
      // the effect's own loadSong/play, causing both to abort via _playGeneration.
      await useTransportStore.getState().play();
    },
    postDelay: 4000,
  },
  {
    id: 'acid-editor-open',
    narration: 'Now watch what happens when I start turning the knobs.',
    action: async () => {
      // Expand the synth knob panel to show the 303 controls
      useUIStore.getState().setKnobPanelCollapsed(false);
      const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
      const inst = useInstrumentStore.getState().instruments.find(i => i.synthType === 'TB303');
      if (inst) await openInstrumentEditor(inst.id);
    },
    postDelay: 1500,
  },
  {
    id: 'acid-tweak-intro',
    narration: 'Cutoff. Resonance. Envelope mod. This is what makes the 303 scream.',
    postDelay: 500,
  },
  {
    id: 'acid-tweak',
    narration: '',
    action: async () => {
      const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
      const { getToneEngine } = await import('@/engine/ToneEngine');
      const { DB303Synth } = await import('@/engine/db303');

      const inst = useInstrumentStore.getState().instruments.find(i => i.synthType === 'TB303');
      if (!inst) return;
      const id = inst.id;

      // Get the live DB303Synth instance for direct parameter control
      const engine = getToneEngine();
      const key = engine.getInstrumentKey(id, -1);
      const synthInstance = engine.instruments.get(key);
      const is303 = synthInstance instanceof DB303Synth;

      // Animate knob sweeps over ~10 seconds
      const steps = 60;
      const intervalMs = 180;
      let step = 0;

      const tweakInterval = setInterval(() => {
        if (step >= steps) {
          clearInterval(tweakInterval);
          return;
        }
        const t = step / steps; // 0 → 1

        let cutoff: number, resonance: number, envMod: number, decay: number;

        if (t < 0.3) {
          // Phase 1: open the filter
          const p = t / 0.3;
          cutoff = 0.3 + p * 0.6;
          resonance = 0.5;
          envMod = 0.5;
          decay = 0.5;
        } else if (t < 0.6) {
          // Phase 2: crank resonance
          const p = (t - 0.3) / 0.3;
          cutoff = 0.9 - p * 0.4;
          resonance = 0.5 + p * 0.45;
          envMod = 0.5 + p * 0.2;
          decay = 0.5;
        } else if (t < 0.85) {
          // Phase 3: envMod and decay for the scream
          const p = (t - 0.6) / 0.25;
          cutoff = 0.5 - p * 0.2;
          resonance = 0.95;
          envMod = 0.7 + p * 0.25;
          decay = 0.5 - p * 0.35;
        } else {
          // Phase 4: full acid — everything cranked
          cutoff = 0.3;
          resonance = 0.95;
          envMod = 0.95;
          decay = 0.15;
        }

        // Set params directly on the WASM synth for instant audio response
        if (is303) {
          (synthInstance as InstanceType<typeof DB303Synth>).set('cutoff', cutoff);
          (synthInstance as InstanceType<typeof DB303Synth>).set('resonance', resonance);
          (synthInstance as InstanceType<typeof DB303Synth>).set('envMod', envMod);
          (synthInstance as InstanceType<typeof DB303Synth>).set('decay', decay);
        }

        // Update store so UI knobs reflect the changes (use full tb303 config to avoid shallow merge issues)
        const current = useInstrumentStore.getState().getInstrument(id);
        if (current?.tb303) {
          const tb = current.tb303;
          useInstrumentStore.getState().updateInstrument(id, {
            tb303: {
              ...tb,
              filter: { ...tb.filter, cutoff, resonance },
              filterEnvelope: { ...tb.filterEnvelope, envMod, decay },
            },
          });
        }
        step++;
      }, intervalMs);
    },
    postDelay: 12000,
  },
  {
    id: 'acid-stop',
    narration: 'That is the sound of acid house. Born in Chicago, 1987.',
    action: async () => {
      // Stop playback via transport (triggers React effect → replayer.stop())
      await trackerStop();
      // Clean up replayer callbacks
      const { getTrackerReplayer } = await import('@/engine/TrackerReplayer');
      const replayer = getTrackerReplayer();
      replayer.onRowChange = null;
      replayer.onSongEnd = null;
      await closeModals();
      // Collapse the synth panel back
      useUIStore.getState().setKnobPanelCollapsed(true);
      // Remove master effects added for the acid demo
      const { useAudioStore } = await import('@/stores/useAudioStore');
      const masterFx = useAudioStore.getState().masterEffects;
      masterFx.forEach(fx => useAudioStore.getState().removeMasterEffect(fx.id));
      // Reset 303 to defaults
      const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
      const inst = useInstrumentStore.getState().instruments.find(i => i.synthType === 'TB303');
      if (inst?.tb303) {
        const tb = inst.tb303;
        useInstrumentStore.getState().updateInstrument(inst.id, {
          tb303: {
            ...tb,
            filter: { ...tb.filter, cutoff: 0.5, resonance: 0.5 },
            filterEnvelope: { ...tb.filterEnvelope, envMod: 0.5, decay: 0.5 },
          },
        });
      }
    },
    postDelay: 2000,
  },

  // ── Act 3b: Sample Editor Deep Dive ─────────────────────────────────────
  {
    id: 'sample-load',
    narration: 'Now the sample editor. Let me load Break the Box — a classic ProTracker module with big samples.',
    action: async () => {
      await closeModals();
      await loadTrackerSong('/data/songs/mod/break the box.mod');
    },
    postDelay: 2000,
  },
  {
    id: 'sample-open',
    narration: 'Opening sample six — a 303 acid line with a nice waveform.',
    action: async () => {
      await closeModals();
      const id = await getFirstSampleInstrument();
      if (id != null) {
        const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
        const inst = useInstrumentStore.getState().getInstrument(id);
        // If the instrument has an audioBuffer but no URL (MOD import), create a
        // blob URL so the SampleEditor's useEffect will load and display the waveform
        if (inst?.sample?.audioBuffer && !inst.sample.url) {
          const buf = inst.sample.audioBuffer as ArrayBuffer;
          const blob = new Blob([buf.slice(0)], { type: 'audio/wav' });
          const blobUrl = URL.createObjectURL(blob);
          useInstrumentStore.getState().updateInstrument(id, {
            sample: { ...inst.sample, url: blobUrl },
          });
        }
        useInstrumentStore.getState().setCurrentInstrument(id);
        await openInstrumentEditor(id);
        await backupSample(id);
      }
    },
    postDelay: 1500,
  },
  {
    id: 'sample-play-original',
    narration: 'Here is the original sample at its native pitch.',
    postDelay: 500,
  },
  {
    id: 'sample-play-original-audio',
    narration: '',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) await playSampleInstrument(id);
    },
    postDelay: 2000,
  },

  // -- Reverse demo --
  {
    id: 'sample-reverse',
    narration: 'Reverse. Flips the waveform backwards. Watch.',
    postDelay: 500,
  },
  {
    id: 'sample-reverse-audio',
    narration: '',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) {
        await applySampleOperation(id, 'reverse');
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
      const id = await getFirstSampleInstrument();
      if (id != null) await applySampleOperation(id, 'reverse');
    },
    postDelay: 200,
  },

  // -- Normalize demo --
  {
    id: 'sample-normalize',
    narration: 'Normalize. Maximizes the volume to zero dB. See the waveform grow.',
    postDelay: 500,
  },
  {
    id: 'sample-normalize-audio',
    narration: '',
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

  // -- Fade In demo --
  {
    id: 'sample-fadein',
    narration: 'Fade in. Smoothly ramps the attack from silence.',
    postDelay: 500,
  },
  {
    id: 'sample-fadein-audio',
    narration: '',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) {
        await restoreSample(id);
        await applySampleOperation(id, 'fadeIn');
        await new Promise(r => setTimeout(r, 300));
        await playSampleInstrument(id);
      }
    },
    postDelay: 2000,
  },

  // -- Fade Out demo --
  {
    id: 'sample-fadeout',
    narration: 'Fade out. Tapers the tail to nothing.',
    postDelay: 500,
  },
  {
    id: 'sample-fadeout-audio',
    narration: '',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) {
        await restoreSample(id);
        await applySampleOperation(id, 'fadeOut');
        await new Promise(r => setTimeout(r, 300));
        await playSampleInstrument(id);
      }
    },
    postDelay: 2000,
  },

  // -- Spectral Exciter --
  {
    id: 'sample-exciter',
    narration: 'Spectral exciter. Adds harmonic overtones for brightness and presence. Listen.',
    postDelay: 500,
  },
  {
    id: 'sample-exciter-audio',
    narration: '',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) {
        await restoreSample(id);
        await applySampleEnhancement(id, 'exciter');
        await new Promise(r => setTimeout(r, 300));
        await playSampleInstrument(id);
      }
    },
    postDelay: 2500,
  },

  // -- Transient Sharpening --
  {
    id: 'sample-transient',
    narration: 'Transient sharpening. Punches up the attack for more snap and bite.',
    postDelay: 500,
  },
  {
    id: 'sample-transient-audio',
    narration: '',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) {
        await restoreSample(id);
        await applySampleEnhancement(id, 'transient');
        await new Promise(r => setTimeout(r, 300));
        await playSampleInstrument(id);
      }
    },
    postDelay: 2500,
  },

  // -- Amiga PAL 8-bit --
  {
    id: 'sample-amiga',
    narration: 'Amiga PAL 8-bit resampling. The authentic aliasing and crunch of the original hardware.',
    postDelay: 500,
  },
  {
    id: 'sample-amiga-audio',
    narration: '',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) {
        await restoreSample(id);
        await applySampleOperation(id, 'amigaPal8Bit');
        await new Promise(r => setTimeout(r, 300));
        await playSampleInstrument(id);
      }
    },
    postDelay: 2500,
  },

  // -- Restore + summary --
  {
    id: 'sample-restore',
    narration: 'Full undo. Back to the original in one click.',
    postDelay: 500,
  },
  {
    id: 'sample-restore-audio',
    narration: '',
    action: async () => {
      const id = await getFirstSampleInstrument();
      if (id != null) {
        await restoreSample(id);
        await new Promise(r => setTimeout(r, 300));
        await playSampleInstrument(id);
      }
    },
    postDelay: 2000,
  },
  {
    id: 'sample-features-summary',
    narration: 'Also available: cut, copy, paste. Loop point detection. Beat slicing. DC offset removal. MPC resampling. Granular synthesis. And a waveform drawing studio for chip music.',
    postDelay: 2000,
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
    action: async () => {
      // Trigger a few individual hits to demonstrate the pads
      await triggerDrumPad(1); // Kick
      await new Promise(r => setTimeout(r, 300));
      await triggerDrumPad(5); // Closed hat
      await new Promise(r => setTimeout(r, 300));
      await triggerDrumPad(2); // Snare
      await new Promise(r => setTimeout(r, 300));
      await triggerDrumPad(5); // Closed hat
    },
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
    narration: 'Searching Modland for a classic ProTracker module. Loading into deck A.',
    action: () => { searchAndLoadModland('jogeir liljedahl', 'A'); },
    spotlight: '[data-dj-deck-drop]',
    postDelay: 2000,
  },
  {
    id: 'dj-play-a',
    narration: 'Play.',
    action: () => djPlay('A'),
    postDelay: 4000,
  },
  {
    id: 'dj-load-b',
    narration: 'Searching for another module. Loading deck B.',
    action: () => { searchAndLoadModland('chromag', 'B'); },
    postDelay: 2000,
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
    id: 'dj-archives-intro',
    narration: 'Let me search the Modland archive. 190,000 tracker modules online.',
    postDelay: 500,
  },
  {
    id: 'dj-archives-modland',
    narration: 'Searching for Lizardking. Loading into deck A.',
    action: async () => {
      await djStopAll();
      searchAndLoadModland('lizardking', 'A');
    },
    postDelay: 1500,
  },
  {
    id: 'dj-archives-play-mod',
    narration: 'Straight from Modland.',
    action: () => djPlay('A'),
    postDelay: 4000,
  },
  {
    id: 'dj-archives-hvsc',
    narration: 'Now another classic. Searching Karsten Obarski on Modland.',
    action: () => { searchAndLoadModland('karsten obarski amegas', 'B'); },
    postDelay: 1500,
  },
  {
    id: 'dj-archives-play-sid',
    narration: 'Two classic modules. Crossfading between them.',
    action: async () => {
      await djPlay('B');
      // Crossfade from A to B over 3 seconds
      for (let i = 0; i <= 20; i++) {
        setTimeout(() => djSetCrossfader(i / 20), i * 150);
      }
    },
    postDelay: 4000,
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
    postDelay: 1500,
  },
  {
    id: 'vj-head-demo',
    narration: 'Hello. I am DEViLBOX. I can see you. Can you see me?',
    showHead: true,
    postDelay: 1000,
  },
  {
    id: 'vj-cleanup',
    narration: '',
    action: () => {
      disableHead();
      switchView('tracker');
    },
    postDelay: 500,
  },

  // ── Act 9: Automation ──────────────────────────────────────────────────
  {
    id: 'automation-intro',
    narration: 'Automation. Draw curves to control any parameter over time.',
    action: async () => {
      switchView('tracker');
      await loadTrackerSong('/data/songs/303-Demo.dbx');
    },
    spotlight: '[data-tracker-editor]',
    postDelay: 500,
  },
  {
    id: 'automation-volume',
    narration: 'A sine wave on the 303 cutoff. Watch the lane appear.',
    action: async () => {
      await createAutomationCurve(0, 'cutoff', 'sine');
    },
    spotlight: '[data-tracker-editor]',
    postDelay: 2000,
  },
  {
    id: 'automation-filter',
    narration: 'Sawtooth on the resonance.',
    action: async () => {
      await createAutomationCurve(0, 'resonance', 'saw');
    },
    spotlight: '[data-tracker-editor]',
    postDelay: 2000,
  },
  {
    id: 'automation-play',
    narration: 'Hear it in action.',
    action: trackerPlay,
    postDelay: 5000,
  },
  {
    id: 'automation-shapes',
    narration: 'Sine, triangle, sawtooth, staircase, random. 12 preset shapes. Or draw freehand with the pencil tool.',
    postDelay: 1500,
  },
  {
    id: 'automation-cleanup',
    narration: '',
    action: async () => {
      await trackerStop();
      await clearAllAutomation();
    },
    postDelay: 300,
  },

  // ── Act 10: MIDI ───────────────────────────────────────────────────────
  {
    id: 'midi-intro',
    narration: 'MIDI. Plug in any controller. Native Web MIDI, zero drivers.',
    action: async () => {
      switchView('tracker');
      // Try to init MIDI to show device detection
      const { useMIDIStore } = await import('@/stores/useMIDIStore');
      await useMIDIStore.getState().init();
    },
    postDelay: 1000,
  },
  {
    id: 'midi-features',
    narration: 'NKS2 deep integration. Auto-mapped knobs for every synth. Light guide shows playable keys. CC learn for any parameter. Drum pads. DJ mode routing.',
    postDelay: 2000,
  },
  {
    id: 'midi-knobbar',
    narration: 'The knob bar adapts to whatever synth is loaded. Page through parameter banks.',
    action: async () => {
      const { useMIDIStore } = await import('@/stores/useMIDIStore');
      useMIDIStore.getState().setShowKnobBar(true);
    },
    postDelay: 2500,
  },
  {
    id: 'midi-cleanup',
    narration: '',
    action: async () => {
      const { useMIDIStore } = await import('@/stores/useMIDIStore');
      useMIDIStore.getState().setShowKnobBar(false);
    },
    postDelay: 300,
  },

  // ── Act 11: Closing (fast) ─────────────────────────────────────────────
  {
    id: 'closing',
    narration: 'DEViLBOX. 120 synth engines. 188 formats. Two massive music archives. Automation. MIDI. All in your browser. Thanks for watching.',
    action: () => switchView('tracker'),
    postDelay: 2000,
  },
];
