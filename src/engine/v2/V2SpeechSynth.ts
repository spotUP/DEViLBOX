import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
// @ts-expect-error -- SamJs is a JavaScript library without types
import SamJs from '../sam/samjs';

export interface V2SpeechConfig {
  text: string;
  speed: number;
  pitch: number;
  formantShift: number;
  singMode: boolean;
}

export class V2SpeechSynth implements DevilboxSynth {
  public readonly name: string = 'V2SpeechSynth';
  public readonly output: GainNode;

  private audioContext: AudioContext;
  private _sourceNode: AudioBufferSourceNode | null = null;
  private _playerGain: GainNode;
  private _sam: InstanceType<typeof SamJs>;
  private _config: V2SpeechConfig;
  private _buffer: AudioBuffer | null = null;
  private _isRendering: boolean = false;
  private _isPlaying: boolean = false;
  private _ready: boolean = false;
  private _readyPromise: Promise<void>;
  private _readyResolve!: () => void;
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config?: Partial<V2SpeechConfig>) {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._playerGain = this.audioContext.createGain();
    this._playerGain.connect(this.output);
    this._config = {
      text: '!kwIH_k !fAA_ks',
      speed: 64,
      pitch: 64,
      formantShift: 64,
      singMode: true,
      ...config
    };

    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });

    const samPitch = Math.round((this._config.pitch / 127) * 255);
    const samSpeed = Math.round((this._config.speed / 127) * 255);
    const formantOffset = ((this._config.formantShift - 64) / 64) * 50;
    const mouth = Math.max(0, Math.min(255, 128 + formantOffset));
    const throat = Math.max(0, Math.min(255, 128 - formantOffset));

    this._sam = new SamJs({
      pitch: samPitch,
      speed: samSpeed,
      mouth: Math.round(mouth),
      throat: Math.round(throat),
      singmode: this._config.singMode,
      phonetic: false
    });

    this._render();
  }

  public async ready(): Promise<void> {
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
    source.loop = this._config.singMode;
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
      const buf32 = this._sam.buf32(this._config.text, false);
      if (buf32) {
        const audioBuf = this.audioContext.createBuffer(1, buf32.length, 22050);
        audioBuf.getChannelData(0).set(buf32);

        const wasPlaying = this._isPlaying;
        this._buffer = audioBuf;

        if (wasPlaying && this._config.singMode) {
          this._startSource();
        }

        if (!this._ready) {
          this._ready = true;
          this._readyResolve();
        }
      }
    } catch (e) {
      console.error('[V2Speech] Render failed:', e);
    } finally {
      this._isRendering = false;
    }
  }

  public applyConfig(config: Partial<V2SpeechConfig>) {
    const hasTextChanged = config.text !== undefined && config.text !== this._config.text;
    const hasParamsChanged =
      (config.pitch !== undefined && config.pitch !== this._config.pitch) ||
      (config.speed !== undefined && config.speed !== this._config.speed) ||
      (config.formantShift !== undefined && config.formantShift !== this._config.formantShift) ||
      (config.singMode !== undefined && config.singMode !== this._config.singMode);

    this._config = { ...this._config, ...config };

    if (config.singMode !== undefined && this._sourceNode) {
      this._sourceNode.loop = config.singMode;
    }

    if (hasParamsChanged || hasTextChanged) {
      if (this._renderTimer) clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => {
        const samPitch = Math.round((this._config.pitch / 127) * 255);
        const samSpeed = Math.round((this._config.speed / 127) * 255);
        const formantOffset = ((this._config.formantShift - 64) / 64) * 50;
        const mouth = Math.max(0, Math.min(255, 128 + formantOffset));
        const throat = Math.max(0, Math.min(255, 128 - formantOffset));

        this._sam = new SamJs({
          pitch: samPitch,
          speed: samSpeed,
          mouth: Math.round(mouth),
          throat: Math.round(throat),
          singmode: this._config.singMode,
          phonetic: false
        });
        this._render();
      }, 50);
    }
  }

  public triggerAttack(note: string | number, time?: number, velocity: number = 1) {
    if (!this._buffer) {
      console.warn('[V2Speech] triggerAttack called before buffer ready');
      return;
    }

    if (this._config.singMode) {
      const midi = typeof note === 'string' ? noteToMidi(note) : note;
      const ratio = Math.pow(2, (midi - 60) / 12);

      // Cancel any release fade and restore gain
      this._playerGain.gain.cancelScheduledValues(this.audioContext.currentTime);
      this._playerGain.gain.value = velocity;

      if (this._isPlaying && this._sourceNode) {
        this._sourceNode.playbackRate.value = ratio;
      } else {
        this._startSource(time);
        if (this._sourceNode) {
          this._sourceNode.playbackRate.value = ratio;
        }
      }
    } else {
      this._startSource(time);
      this._playerGain.gain.value = velocity;
    }
  }

  public triggerRelease(time?: number) {
    if (this._config.singMode && this._isPlaying) {
      // In sing mode, fade out quickly and stop
      const t = time ?? this.audioContext.currentTime;
      this._playerGain.gain.setValueAtTime(this._playerGain.gain.value, t);
      this._playerGain.gain.linearRampToValueAtTime(0, t + 0.05);
      setTimeout(() => this._stopSource(), 80);
    }
  }

  public triggerAttackRelease(note: string | number, _duration: number | string, time?: number, velocity: number = 1) {
    this.triggerAttack(note, time, velocity);
    // Player will play until the buffer ends or we stop it
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
