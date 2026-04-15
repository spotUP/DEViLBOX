import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { useSpeechActivityStore } from '@/stores/useSpeechActivityStore';

export interface DECtalkConfig {
  text: string;
  voice: number;       // 0-8: Paul, Betty, Harry, Frank, Dennis, Kit, Ursula, Rita, Wendy
  rate: number;        // words per minute (75-600, default 200)
  pitch: number;       // 0-1 normalized playback pitch (0.5 = normal)
  volume: number;      // 0-1
}

export const DECTALK_VOICES = [
  'Paul', 'Betty', 'Harry', 'Frank', 'Dennis', 'Kit', 'Ursula', 'Rita', 'Wendy',
] as const;

export const DEFAULT_DECTALK: DECtalkConfig = {
  text: 'I am DECtalk. I am a speech synthesizer.',
  voice: 0,  // Paul (the Stephen Hawking voice)
  rate: 200,
  pitch: 0.5,
  volume: 0.8,
};

// Worker-based synthesis using our single-threaded DECtalkMini WASM build
let worker: Worker | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: (wav: Uint8Array) => void; reject: (err: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    console.log('[DECtalk] Creating worker...');
    worker = new Worker('/dectalk/DECtalk.worker.js', { type: 'module' });
    worker.onerror = (e) => {
      console.error('[DECtalk] Worker error:', e.message, e);
    };
    worker.onmessage = (e) => {
      const { id, wav, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) {
        p.reject(new Error(error));
      } else {
        p.resolve(wav);
      }
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

export class DECtalkSynth implements DevilboxSynth {
  public readonly name: string = 'DECtalkSynth';
  public readonly output: GainNode;

  private audioContext: AudioContext;
  private _sourceNode: AudioBufferSourceNode | null = null;
  private _playerGain: GainNode;
  private _config: DECtalkConfig;
  private _buffer: AudioBuffer | null = null;
  private _isPlaying = false;
  private _isRendering = false;
  private _ready = false;
  private _readyPromise: Promise<void>;
  private _readyResolve!: () => void;
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config?: Partial<DECtalkConfig>) {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._playerGain = this.audioContext.createGain();
    this._playerGain.connect(this.output);
    this._config = { ...DEFAULT_DECTALK, ...config };

    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });

    this._render();
  }

  public async ready(): Promise<void> {
    return this._readyPromise;
  }

  public async ensureInitialized(): Promise<void> {
    return this._readyPromise;
  }

  private _stopSource(): void {
    if (this._sourceNode) {
      try { this._sourceNode.stop(); } catch { /* already stopped */ }
      this._sourceNode.disconnect();
      this._sourceNode = null;
    }
    if (this._isPlaying) useSpeechActivityStore.getState().speechStop();
    this._isPlaying = false;
  }

  private _startSource(time?: number): void {
    if (!this._buffer) return;
    this._stopSource();

    const source = this.audioContext.createBufferSource();
    source.buffer = this._buffer;
    source.loop = false;
    source.connect(this._playerGain);
    source.onended = () => {
      if (this._sourceNode === source) {
        if (this._isPlaying) useSpeechActivityStore.getState().speechStop();
        this._isPlaying = false;
        this._sourceNode = null;
      }
    };
    this._sourceNode = source;
    source.start(time ?? this.audioContext.currentTime);
    this._isPlaying = true;
    useSpeechActivityStore.getState().speechStart();
  }

  private async _render(): Promise<void> {
    if (this._isRendering) return;
    if (!this._config.text.trim()) return;
    this._isRendering = true;

    try {
      const t0 = performance.now();
      const wavData = await synthesizeWav(
        this._config.text,
        this._config.voice,
        this._config.rate,
      );

      // Decode WAV to AudioBuffer
      const audioBuffer = await this.audioContext.decodeAudioData(wavData.buffer.slice(0) as ArrayBuffer);
      const elapsed = (performance.now() - t0).toFixed(0);
      console.log(`[DECtalk] Rendered "${this._config.text.slice(0, 30)}..." in ${elapsed}ms (${audioBuffer.duration.toFixed(1)}s)`);

      const wasPlaying = this._isPlaying;
      this._buffer = audioBuffer;

      if (wasPlaying) {
        this._startSource();
      }

      if (!this._ready) {
        this._ready = true;
        this._readyResolve();
      }
    } catch (e) {
      console.error('[DECtalk] Render failed:', e);
      if (!this._ready) {
        this._ready = true;
        this._readyResolve();
      }
    } finally {
      this._isRendering = false;
    }
  }

  public applyConfig(config: Partial<DECtalkConfig>): void {
    const textChanged = config.text !== undefined && config.text !== this._config.text;
    const voiceChanged = config.voice !== undefined && config.voice !== this._config.voice;
    const rateChanged = config.rate !== undefined && config.rate !== this._config.rate;

    this._config = { ...this._config, ...config };

    if (config.volume !== undefined) {
      this._playerGain.gain.value = config.volume;
    }

    if (textChanged || voiceChanged || rateChanged) {
      if (this._renderTimer) clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => this._render(), 100);
    }
  }

  /** Speak the current text — re-renders and plays */
  public async speak(): Promise<void> {
    await this._render();
    if (this._buffer) {
      this._startSource();
    }
  }

  public set(param: string, value: number): void {
    if (param === 'voice') {
      this.applyConfig({ voice: Math.round(value) });
    } else if (param === 'rate') {
      this.applyConfig({ rate: Math.round(value) });
    } else if (param === 'pitch') {
      this._config.pitch = value;
    } else if (param === 'volume') {
      this.applyConfig({ volume: value });
    }
  }

  public get(param: string): number | undefined {
    const val = (this._config as unknown as Record<string, unknown>)[param];
    return typeof val === 'number' ? val : undefined;
  }

  public triggerAttack(note: string | number, time?: number, velocity: number = 1): void {
    if (!this._buffer) {
      console.log('[DECtalk] triggerAttack: buffer not ready, rendering first...');
      this._render().then(() => {
        if (this._buffer) this.triggerAttack(note, undefined, velocity);
      });
      return;
    }

    const midi = typeof note === 'string' ? noteToMidi(note) : note;
    // Map pitch: MIDI 60 = normal, higher = faster/chipmunk, lower = deeper
    const ratio = Math.pow(2, (midi - 60) / 12) * (0.5 + this._config.pitch);

    this._playerGain.gain.cancelScheduledValues(this.audioContext.currentTime);
    this._playerGain.gain.value = velocity * this._config.volume;

    this._stopSource();
    const source = this.audioContext.createBufferSource();
    source.buffer = this._buffer;
    source.loop = false;
    source.playbackRate.value = ratio;
    source.connect(this._playerGain);
    source.onended = () => {
      if (this._sourceNode === source) {
        if (this._isPlaying) useSpeechActivityStore.getState().speechStop();
        this._isPlaying = false;
        this._sourceNode = null;
      }
    };
    this._sourceNode = source;
    source.start(time ?? this.audioContext.currentTime);
    this._isPlaying = true;
    useSpeechActivityStore.getState().speechStart();
  }

  public triggerRelease(_note?: string | number, _time?: number): void {
    // One-shot — let it play to completion
  }

  public triggerAttackRelease(note: string | number, _duration: number | string, time?: number, velocity: number = 1): void {
    this.triggerAttack(note, time, velocity);
  }

  public releaseAll(): void {
    this._stopSource();
  }

  public dispose(): void {
    if (this._renderTimer) clearTimeout(this._renderTimer);
    this._stopSource();
    this._playerGain.disconnect();
    this.output.disconnect();
  }
}
