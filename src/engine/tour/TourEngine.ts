/**
 * TourEngine — Orchestrates the guided DEViLBOX tour.
 *
 * Pre-renders all DECtalk audio at start, then plays steps sequentially.
 * Each step: set subtitle → execute action → play audio → wait → advance.
 */

import * as Tone from 'tone';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { useTourStore } from '@/stores/useTourStore';
import { useSpeechActivityStore } from '@/stores/useSpeechActivityStore';
import { useUIStore } from '@/stores/useUIStore';
import { suppressFormatChecks, restoreFormatChecks } from '@/lib/formatCompatibility';
import { TOUR_SCRIPT, type TourStep } from './tourScript';

// Import the DECtalk worker-based synthesizer directly
// (we don't create a full DECtalkSynth instrument — just use the worker)
let worker: Worker | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: (wav: Uint8Array) => void; reject: (err: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker('/dectalk/DECtalk.worker.js', { type: 'module' });
    worker.onerror = (e) => console.error('[Tour] DECtalk worker error:', e.message);
    worker.onmessage = (e) => {
      const { id, wav, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(wav);
    };
  }
  return worker;
}

function synthesizeWav(text: string, voice: number, rate: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, text: phonemize(text), voice, rate });
  });
}

/**
 * Phonemize text for DECtalk — improves pronunciation of technical terms.
 * DECtalk supports inline phoneme notation: [:phoneme on] ... [:phoneme off]
 * and stress markers: 1 = primary stress, 2 = secondary stress.
 * Words not in the map pass through to DECtalk's default text-to-speech.
 */
const PHONEME_MAP: Record<string, string> = {
  // App / project names
  'DEViLBOX':     'devil box',
  'devilbox':     'devil box',
  'Modland':      'modd land',
  'HVSC':         'H V S C',
  'modland':      'modd land',
  // Synth names
  'TB-303':       'T B three oh three',
  'TB303':        'T B three oh three',
  'TR-808':       'T R eight oh eight',
  'TR808':        'T R eight oh eight',
  'TR-909':       'T R nine oh nine',
  'TR909':        'T R nine oh nine',
  'DX7':          'D X seven',
  'DECtalk':      'deck talk',
  'Amsynth':      'am synth',
  'DuoSynth':     'doo oh synth',
  // Tech terms
  'WebAssembly':  'web assembly',
  'WASM':         'wasm',
  'NKS2':         'N K S two',
  'NKS':          'N K S',
  'MIDI':         'middy',
  'SID':          'sid',
  'BPM':          'B P M',
  'VJ':           'V J',
  'FX':           'effects',
  'EQ':           'E Q',
  'DJ':           'D J',
  'CC':           'C C',
  'Amiga':        'ah mee gah',
  'Commodore':    'comma door',
  // Common mispronunciations
  'music':        'myuzik',
  'Music':        'myuzik',
  'musical':      'myuzikal',
  'crossfading':  'cross fading',
  'crossfade':    'cross fade',
  'lo-fi':        'low fie',
  'Lo-Fi':        'low fie',
};

function phonemize(text: string): string {
  let result = text;
  for (const [word, replacement] of Object.entries(PHONEME_MAP)) {
    // Word-boundary-aware replacement (case-sensitive for acronyms)
    result = result.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), replacement);
  }
  return result;
}

interface PreRenderedStep {
  step: TourStep;
  buffer: AudioBuffer | null;  // null if render failed
  duration: number;            // seconds
}

const DEFAULT_VOICE = 0;   // Paul
const DEFAULT_RATE = 220;  // wpm — snappy narration pace
const DEFAULT_POST_DELAY = 1000;

class TourEngine {
  private preRendered: PreRenderedStep[] = [];
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private convolverNode: ConvolverNode | null = null;
  private delayNode: DelayNode | null = null;
  private feedbackNode: GainNode | null = null;
  private reverbSendNode: GainNode | null = null;
  private delaySendNode: GainNode | null = null;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private delayResolve: (() => void) | null = null;
  private pauseResumeResolve: (() => void) | null = null;
  private aborted = false;
  private previousView: string = 'tracker';
  private headActive = false;
  private savedDJVolume: number | null = null;
  private savedTrackerVolume: number | null = null;

  // ── Public API ──────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const store = useTourStore.getState();
    if (store.isActive) return;

    this.aborted = false;
    this.previousView = useUIStore.getState().activeView;

    // Suppress format compatibility warnings for the entire tour — the tour
    // creates instruments, automation etc. that may exceed native format limits
    suppressFormatChecks();

    const totalSteps = TOUR_SCRIPT.length;
    store.startTour(totalSteps);

    // Ensure Tone.js audio context is started (requires user gesture — the Tour
    // button click satisfies this). Without this, the tracker replayer won't produce audio.
    await Tone.start();

    // Pre-render all speech
    store.setPreRendering(true, 0);
    console.log(`[Tour] Pre-rendering ${totalSteps} steps...`);
    const t0 = performance.now();

    const audioContext = getDevilboxAudioContext();
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 1;

    // Route through Tone.Destination so the VJ AudioDataBus analyser picks up
    // the speech audio — this drives the Kraftwerk head mouth animation.
    const toneDestInput = this.getToneDestinationInput(audioContext);

    // Build FX chain: gainNode → [dry → dest] + [reverbSend → convolver → dest] + [delaySend → delay → feedback loop → dest]
    this.gainNode.connect(toneDestInput);

    // Convolution reverb (algorithmic impulse)
    try {
      this.convolverNode = audioContext.createConvolver();
      this.convolverNode.buffer = this.createReverbImpulse(audioContext, 2.2, 3.0);
      this.reverbSendNode = audioContext.createGain();
      this.reverbSendNode.gain.value = 0.25; // wet amount
      this.gainNode.connect(this.reverbSendNode);
      this.reverbSendNode.connect(this.convolverNode);
      this.convolverNode.connect(toneDestInput);
    } catch (err) {
      console.warn('[Tour] Reverb setup failed:', err);
    }

    // Ping-pong style echo (single tap delay with feedback)
    try {
      this.delayNode = audioContext.createDelay(1.0);
      this.delayNode.delayTime.value = 0.33; // ~330ms echo
      this.feedbackNode = audioContext.createGain();
      this.feedbackNode.gain.value = 0.3; // feedback amount (decaying repeats)
      this.delaySendNode = audioContext.createGain();
      this.delaySendNode.gain.value = 0.2; // echo send level
      // Chain: gain → delaySend → delay → feedback → delay (loop) + delay → dest
      this.gainNode.connect(this.delaySendNode);
      this.delaySendNode.connect(this.delayNode);
      this.delayNode.connect(this.feedbackNode);
      this.feedbackNode.connect(this.delayNode); // feedback loop
      this.delayNode.connect(toneDestInput);
    } catch (err) {
      console.warn('[Tour] Delay setup failed:', err);
    }

    this.preRendered = [];
    for (let i = 0; i < TOUR_SCRIPT.length; i++) {
      if (this.aborted) return;
      const step = TOUR_SCRIPT[i];
      store.setPreRendering(true, (i + 1) / totalSteps);

      try {
        if (step.narration.trim().length === 0) {
          this.preRendered.push({ step, buffer: null, duration: 0 });
          continue;
        }
        const voice = step.voice ?? DEFAULT_VOICE;
        const rate = step.rate ?? DEFAULT_RATE;
        const wavData = await synthesizeWav(step.narration, voice, rate);
        const buffer = await audioContext.decodeAudioData(wavData.buffer.slice(0) as ArrayBuffer);
        this.preRendered.push({ step, buffer, duration: buffer.duration });
      } catch (err) {
        console.warn(`[Tour] Failed to render step "${step.id}":`, err);
        this.preRendered.push({ step, buffer: null, duration: 0 });
      }
    }

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`[Tour] Pre-rendered ${totalSteps} steps in ${elapsed}s`);
    store.setPreRendering(false, 1);

    // Play through steps
    await this.playAllSteps();
  }

  stop(): void {
    this.aborted = true;
    const store = useTourStore.getState();

    // Stop current audio
    this.stopAudio();

    // Cancel wait timer and resolve its promise
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
    if (this.delayResolve) {
      this.delayResolve();
      this.delayResolve = null;
    }

    // Resolve any pause wait
    if (this.pauseResumeResolve) {
      this.pauseResumeResolve();
      this.pauseResumeResolve = null;
    }

    // Cleanup FX nodes
    for (const node of [this.convolverNode, this.reverbSendNode, this.delaySendNode, this.delayNode, this.feedbackNode]) {
      if (node) { try { node.disconnect(); } catch { /* */ } }
    }
    this.convolverNode = null;
    this.reverbSendNode = null;
    this.delaySendNode = null;
    this.delayNode = null;
    this.feedbackNode = null;

    // Cleanup gain node
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    // Disable Kraftwerk head if it was enabled
    if (this.headActive) {
      useSpeechActivityStore.getState().speechStop();
      this.headActive = false;
    }

    // Stop tracker playback if we started it during the tour
    import('@/stores/useTransportStore').then(({ useTransportStore }) => {
      if (useTransportStore.getState().isPlaying) {
        useTransportStore.getState().stop();
      }
    });

    // Clear any master effects the tour applied
    import('@/stores/useAudioStore').then(({ useAudioStore }) => {
      if (useAudioStore.getState().masterEffects.some(e => e.id.startsWith('tour-fx-'))) {
        useAudioStore.getState().setMasterEffects([]);
      }
    });

    // Reset mixer mute/solo state
    import('@/stores/useMixerStore').then(({ useMixerStore }) => {
      const mixer = useMixerStore.getState();
      for (let ch = 0; ch < 16; ch++) {
        mixer.setChannelMute(ch, false);
        mixer.setChannelSolo(ch, false);
      }
    });

    // Clear automation curves the tour created
    import('@/stores/useAutomationStore').then(({ useAutomationStore }) => {
      useAutomationStore.getState().reset();
    });

    // Hide MIDI knob bar if it was shown
    import('@/stores/useMIDIStore').then(({ useMIDIStore }) => {
      useMIDIStore.getState().setShowKnobBar(false);
    });

    // Restore music volume if ducked
    this.unduckMusic();

    // Restore previous view
    useUIStore.getState().setActiveView(this.previousView as never);

    // Restore format compatibility checks
    restoreFormatChecks();

    store.stopTour();
    console.log('[Tour] Stopped');
  }

  pause(): void {
    useTourStore.getState().pauseTour();
    // Pause audio by ramping gain to 0
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(0, getDevilboxAudioContext().currentTime);
    }
  }

  resume(): void {
    useTourStore.getState().resumeTour();
    // Resume audio
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(1, getDevilboxAudioContext().currentTime);
    }
    // Unblock pause wait
    if (this.pauseResumeResolve) {
      this.pauseResumeResolve();
      this.pauseResumeResolve = null;
    }
  }

  skipToNext(): void {
    // Stop current audio and timer, advance
    this.stopAudio();
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
    // Resolve any pending delay to advance the loop
    if (this.delayResolve) {
      this.delayResolve();
      this.delayResolve = null;
    }
    // Resolve any pause wait
    if (this.pauseResumeResolve) {
      this.pauseResumeResolve();
      this.pauseResumeResolve = null;
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private async playAllSteps(): Promise<void> {
    for (let i = 0; i < this.preRendered.length; i++) {
      if (this.aborted) return;
      const { step, buffer } = this.preRendered[i];
      const store = useTourStore.getState();

      // Update store (including spotlight selector)
      store.setStep(i, step.id, step.narration, step.spotlight ?? null);

      // Manage Kraftwerk head visibility
      if (step.showHead && !this.headActive) {
        useSpeechActivityStore.getState().speechStart();
        this.headActive = true;
      } else if (!step.showHead && this.headActive) {
        useSpeechActivityStore.getState().speechStop();
        this.headActive = false;
      }

      // Execute action (view switch, etc.)
      if (step.action) {
        try {
          await step.action();
        } catch (err) {
          console.warn(`[Tour] Action failed for "${step.id}":`, err);
        }
        // Small delay after action for UI to settle
        await this.delay(300);
        if (this.aborted) return;
      }

      // Wait if paused
      await this.waitIfPaused();
      if (this.aborted) return;

      // Play audio — duck music while speaking
      store.setSpeaking(true);
      if (buffer && this.gainNode) {
        this.duckMusic();
        await this.playBuffer(buffer);
        this.unduckMusic();
      }
      store.setSpeaking(false);
      if (this.aborted) return;

      // Post-delay
      const postDelay = step.postDelay ?? DEFAULT_POST_DELAY;
      await this.delay(postDelay);
      if (this.aborted) return;
    }

    // Tour complete
    if (!this.aborted) {
      console.log('[Tour] Complete!');
      // Small delay then stop
      await this.delay(1000);
      if (!this.aborted) {
        this.stop();
      }
    }
  }

  private playBuffer(buffer: AudioBuffer): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.gainNode || this.aborted) {
        resolve();
        return;
      }

      const audioContext = getDevilboxAudioContext();
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);
      source.onended = () => {
        if (this.sourceNode === source) {
          this.sourceNode = null;
        }
        resolve();
      };
      this.sourceNode = source;
      source.start();
    });
  }

  private stopAudio(): void {
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch { /* already stopped */ }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    useTourStore.getState().setSpeaking(false);
  }

  /** Duck music volume so speech is audible */
  private duckMusic(): void {
    try {
      import('@/stores/useDJStore').then(({ useDJStore }) => {
        const s = useDJStore.getState();
        if (this.savedDJVolume === null) this.savedDJVolume = s.masterVolume;
        s.setMasterVolume(Math.min(s.masterVolume, 0.25));
      });
      import('@/stores/useAudioStore').then(({ useAudioStore }) => {
        const s = useAudioStore.getState();
        if (this.savedTrackerVolume === null) this.savedTrackerVolume = s.masterVolume;
        s.setMasterVolume(Math.max(s.masterVolume - 18, -60));
      });
    } catch { /* */ }
  }

  /** Restore music volume after speech */
  private unduckMusic(): void {
    try {
      import('@/stores/useDJStore').then(({ useDJStore }) => {
        if (this.savedDJVolume !== null) {
          useDJStore.getState().setMasterVolume(this.savedDJVolume);
          this.savedDJVolume = null;
        }
      });
      import('@/stores/useAudioStore').then(({ useAudioStore }) => {
        if (this.savedTrackerVolume !== null) {
          useAudioStore.getState().setMasterVolume(this.savedTrackerVolume);
          this.savedTrackerVolume = null;
        }
      });
    } catch { /* */ }
  }

  private delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.delayResolve = resolve;
      this.waitTimer = setTimeout(() => {
        this.waitTimer = null;
        this.delayResolve = null;
        resolve();
      }, ms);
    });
  }

  private waitIfPaused(): Promise<void> {
    const store = useTourStore.getState();
    if (!store.isPaused) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.pauseResumeResolve = resolve;
    });
  }

  /** Generate a synthetic reverb impulse response */
  private createReverbImpulse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  /** Get Tone.Destination's input node so speech audio feeds the VJ analyser */
  private getToneDestinationInput(fallback: AudioContext): AudioNode {
    try {
      const dest = Tone.getDestination();
      const input: AudioNode | undefined =
        (dest as any).output?.input ??
        (dest as any)._gainNode ??
        (dest as any).input;
      if (input) return input;
    } catch { /* Tone not initialized yet */ }
    return fallback.destination;
  }
}

// Singleton
let instance: TourEngine | null = null;

export function getTourEngine(): TourEngine {
  if (!instance) {
    instance = new TourEngine();
  }
  return instance;
}
