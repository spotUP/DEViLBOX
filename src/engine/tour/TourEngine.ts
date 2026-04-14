/**
 * TourEngine — Orchestrates the guided DEViLBOX tour.
 *
 * Pre-renders all DECtalk audio at start, then plays steps sequentially.
 * Each step: set subtitle → execute action → play audio → wait → advance.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { useTourStore } from '@/stores/useTourStore';
import { useSpeechActivityStore } from '@/stores/useSpeechActivityStore';
import { useUIStore } from '@/stores/useUIStore';
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
    getWorker().postMessage({ id, text, voice, rate });
  });
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

  // ── Public API ──────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const store = useTourStore.getState();
    if (store.isActive) return;

    this.aborted = false;
    this.previousView = useUIStore.getState().activeView;

    const totalSteps = TOUR_SCRIPT.length;
    store.startTour(totalSteps);

    // Pre-render all speech
    store.setPreRendering(true, 0);
    console.log(`[Tour] Pre-rendering ${totalSteps} steps...`);
    const t0 = performance.now();

    const audioContext = getDevilboxAudioContext();
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 1;

    // Build FX chain: gainNode → [dry → dest] + [reverbSend → convolver → dest] + [delaySend → delay → feedback loop → dest]
    this.gainNode.connect(audioContext.destination);

    // Convolution reverb (algorithmic impulse)
    try {
      this.convolverNode = audioContext.createConvolver();
      this.convolverNode.buffer = this.createReverbImpulse(audioContext, 2.2, 3.0);
      this.reverbSendNode = audioContext.createGain();
      this.reverbSendNode.gain.value = 0.25; // wet amount
      this.gainNode.connect(this.reverbSendNode);
      this.reverbSendNode.connect(this.convolverNode);
      this.convolverNode.connect(audioContext.destination);
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
      this.delayNode.connect(audioContext.destination);
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

    // Restore previous view
    useUIStore.getState().setActiveView(this.previousView as never);

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

      // Play audio
      store.setSpeaking(true);
      if (buffer && this.gainNode) {
        await this.playBuffer(buffer);
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
}

// Singleton
let instance: TourEngine | null = null;

export function getTourEngine(): TourEngine {
  if (!instance) {
    instance = new TourEngine();
  }
  return instance;
}
