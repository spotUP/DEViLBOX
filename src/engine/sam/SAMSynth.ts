import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
// @ts-expect-error -- SamJs is a JavaScript library without types
import SamJs from './samjs';
import type { SamConfig } from '@/types/instrument';

export class SAMSynth implements DevilboxSynth {
  public readonly name: string = 'SAMSynth';
  public readonly output: GainNode;

  private audioContext: AudioContext;
  private _sourceNode: AudioBufferSourceNode | null = null;
  private _playerGain: GainNode;
  private _sam: InstanceType<typeof SamJs>;
  private _config: SamConfig;
  private _buffer: AudioBuffer | null = null;
  private _isRendering: boolean = false;
  private _isPlaying: boolean = false;
  private _ready: boolean = false;
  private _readyPromise: Promise<void>;
  private _readyResolve!: () => void;
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;

  // Vowel sequence state
  private _vowelSequence: string[] = [];
  private _vowelLoopSingle = true;
  private _vowelIndex = 0;

  constructor(config: SamConfig) {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._playerGain = this.audioContext.createGain();
    this._playerGain.connect(this.output);
    this._config = { ...config };

    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });

    this._sam = new SamJs({
      pitch: this._config.pitch,
      speed: this._config.speed,
      mouth: this._config.mouth,
      throat: this._config.throat,
      singmode: this._config.singmode,
      phonetic: this._config.phonetic
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
    this._isPlaying = false;
  }

  private _startSource(time?: number, offset?: number): void {
    if (!this._buffer) return;
    this._stopSource();

    const source = this.audioContext.createBufferSource();
    source.buffer = this._buffer;
    source.loop = this._config.singmode;
    source.connect(this._playerGain);
    source.onended = () => {
      if (this._sourceNode === source) {
        this._isPlaying = false;
        this._sourceNode = null;
      }
    };
    this._sourceNode = source;
    source.start(time, offset ?? 0);
    this._isPlaying = true;
  }

  private async _render() {
    if (this._isRendering) return;
    this._isRendering = true;

    try {
      const buf32 = this._sam.buf32(this._config.text, this._config.phonetic);
      if (buf32) {
        const audioBuf = this.audioContext.createBuffer(1, buf32.length, 22050);
        audioBuf.getChannelData(0).set(buf32);

        const wasPlaying = this._isPlaying;
        this._buffer = audioBuf;

        if (wasPlaying && this._config.singmode) {
          this._startSource();
        }

        if (!this._ready) {
          this._ready = true;
          this._readyResolve();
        }
      }
    } catch (e) {
      console.error('[SAM] Render failed:', e);
    } finally {
      this._isRendering = false;
    }
  }

  public applyConfig(config: Partial<SamConfig>) {
    const hasTextChanged = config.text !== undefined && config.text !== this._config.text;
    const hasParamsChanged =
      (config.pitch !== undefined && config.pitch !== this._config.pitch) ||
      (config.speed !== undefined && config.speed !== this._config.speed) ||
      (config.mouth !== undefined && config.mouth !== this._config.mouth) ||
      (config.throat !== undefined && config.throat !== this._config.throat) ||
      (config.singmode !== undefined && config.singmode !== this._config.singmode) ||
      (config.phonetic !== undefined && config.phonetic !== this._config.phonetic);

    // Track vowel sequence changes
    const seqChanged = config.vowelSequence !== undefined &&
      JSON.stringify(config.vowelSequence) !== JSON.stringify(this._config.vowelSequence);

    this._config = { ...this._config, ...config };

    if (config.vowelLoopSingle !== undefined) this._vowelLoopSingle = config.vowelLoopSingle;
    if (seqChanged) {
      this._vowelSequence = config.vowelSequence ?? [];
      this._vowelIndex = 0;
    }

    if (config.singmode !== undefined && this._sourceNode) {
      this._sourceNode.loop = config.singmode;
    }

    if (hasParamsChanged || hasTextChanged) {
      if (this._renderTimer) clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => {
        this._sam = new SamJs({
          pitch: this._config.pitch,
          speed: this._config.speed,
          mouth: this._config.mouth,
          throat: this._config.throat,
          singmode: this._config.singmode,
          phonetic: this._config.phonetic
        });
        this._render();
      }, 50);
    }
  }

  /** Render a single vowel phoneme and return the buffer */
  private _renderVowel(code: string): AudioBuffer | null {
    const sam = new SamJs({
      pitch: this._config.pitch,
      speed: this._config.speed,
      mouth: this._config.mouth,
      throat: this._config.throat,
      singmode: true,
      phonetic: true,
    });
    const buf32 = sam.buf32(code, true);
    if (!buf32) return null;
    const audioBuf = this.audioContext.createBuffer(1, buf32.length, 22050);
    audioBuf.getChannelData(0).set(buf32);
    return audioBuf;
  }

  public triggerAttack(note: string | number, time?: number, velocity: number = 1) {
    if (this._config.singmode && this._vowelSequence.length > 0) {
      // Vowel sequence mode: render next vowel and play it
      const vowelCode = this._vowelSequence[this._vowelIndex % this._vowelSequence.length];
      this._vowelIndex++;

      const vowelBuf = this._renderVowel(vowelCode);
      if (!vowelBuf) return;

      this._buffer = vowelBuf;

      const midi = typeof note === 'string' ? noteToMidi(note) : note;
      const ratio = Math.pow(2, (midi - 48) / 12);

      this._playerGain.gain.cancelScheduledValues(this.audioContext.currentTime);
      this._playerGain.gain.value = velocity;

      this._stopSource();
      const source = this.audioContext.createBufferSource();
      source.buffer = vowelBuf;
      source.loop = this._vowelLoopSingle;
      source.connect(this._playerGain);
      source.onended = () => {
        if (this._sourceNode === source) {
          this._isPlaying = false;
          this._sourceNode = null;
        }
      };
      this._sourceNode = source;
      source.playbackRate.value = ratio;
      source.start(time, 0);
      this._isPlaying = true;
      return;
    }

    if (!this._buffer) {
      console.warn('[SAM] triggerAttack called before buffer ready');
      return;
    }

    if (this._config.singmode) {
      const midi = typeof note === 'string' ? noteToMidi(note) : note;
      const ratio = Math.pow(2, (midi - 48) / 12);

      // Cancel any release fade and restore gain
      this._playerGain.gain.cancelScheduledValues(this.audioContext.currentTime);
      this._playerGain.gain.value = velocity;

      if (this._isPlaying && this._sourceNode) {
        // Glide pitch smoothly (~60ms portamento for natural singing)
        this._sourceNode.playbackRate.cancelScheduledValues(this.audioContext.currentTime);
        this._sourceNode.playbackRate.setTargetAtTime(ratio, this.audioContext.currentTime, 0.06);
      } else {
        this._startSource(time);
        if (this._sourceNode) {
          this._sourceNode.playbackRate.value = ratio;
        }
      }
    } else {
      // Normal mode: restart on each trigger
      this._startSource(time);
      this._playerGain.gain.value = velocity;
    }
  }

  public triggerAttackRelease(note: string | number, _duration: number | string, time?: number, velocity: number = 1) {
    this.triggerAttack(note, time, velocity);
    // One-shot playback: ignore duration, let buffer play to completion
  }

  public triggerRelease(time?: number) {
    if (this._config.singmode && this._isPlaying) {
      // Sing mode: fade out quickly and stop
      const t = time ?? this.audioContext.currentTime;
      this._playerGain.gain.cancelScheduledValues(t);
      this._playerGain.gain.setValueAtTime(this._playerGain.gain.value, t);
      this._playerGain.gain.linearRampToValueAtTime(0, t + 0.05);
      setTimeout(() => this._stopSource(), 80);
    }
    // Non-sing mode: one-shot plays to completion
  }

  public dispose(): void {
    if (this._renderTimer) {
      clearTimeout(this._renderTimer);
      this._renderTimer = null;
    }
    this._stopSource();
    this._playerGain.disconnect();
    this.output.disconnect();
  }
}
