/**
 * TourEngine — Orchestrates the guided DEViLBOX tour.
 *
 * Pre-renders all DECtalk audio at start, then plays steps sequentially.
 * Each step: set subtitle → execute action → play audio → wait → advance.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { useTourStore } from '@/stores/useTourStore';
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
const DEFAULT_RATE = 170;  // wpm — measured pace for narration
const DEFAULT_POST_DELAY = 1500;

class TourEngine {
  private preRendered: PreRenderedStep[] = [];
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private delayResolve: (() => void) | null = null;
  private pauseResumeResolve: (() => void) | null = null;
  private aborted = false;
  private previousView: string = 'tracker';

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
    this.gainNode.connect(audioContext.destination);

    this.preRendered = [];
    for (let i = 0; i < TOUR_SCRIPT.length; i++) {
      if (this.aborted) return;
      const step = TOUR_SCRIPT[i];
      store.setPreRendering(true, (i + 1) / totalSteps);

      try {
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

    // Cleanup gain node
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

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

      // Update store
      store.setStep(i, step.id, step.narration);

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
}

// Singleton
let instance: TourEngine | null = null;

export function getTourEngine(): TourEngine {
  if (!instance) {
    instance = new TourEngine();
  }
  return instance;
}
