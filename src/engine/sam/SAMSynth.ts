import * as Tone from 'tone';
// @ts-ignore
import SamJs from './samjs';
import type { SamConfig } from '@/types/instrument';

export class SAMSynth extends Tone.ToneAudioNode {
  public readonly name: string = 'SAMSynth';
  public readonly input: undefined = undefined;
  public readonly output: Tone.Gain;

  private _player: Tone.Player;
  private _sam: any;
  private _config: SamConfig;
  private _buffer: AudioBuffer | null = null;
  private _isRendering: boolean = false;
  private _ready: boolean = false;
  private _readyPromise: Promise<void>;
  private _readyResolve!: () => void;

  private _renderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: SamConfig) {
    super();
    this.output = new Tone.Gain();
    this._config = { ...config };
    this._player = new Tone.Player().connect(this.output);

    // Create ready promise for async initialization
    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });

    // Initialize SAM with current config
    this._sam = new SamJs({
      pitch: this._config.pitch,
      speed: this._config.speed,
      mouth: this._config.mouth,
      throat: this._config.throat,
      singmode: this._config.singmode,
      phonetic: this._config.phonetic
    });

    // Initial render
    this._render();
  }

  /**
   * Wait for the synth to be ready (initial render complete)
   */
  public async ready(): Promise<void> {
    return this._readyPromise;
  }

  private async _render() {
    if (this._isRendering) return;
    this._isRendering = true;

    try {
      // SAM renders at 22050Hz
      const buf32 = this._sam.buf32(this._config.text, this._config.phonetic);
      if (buf32) {
        const audioBuf = Tone.getContext().createBuffer(1, buf32.length, 22050);
        audioBuf.getChannelData(0).set(buf32);
        this._buffer = audioBuf;

        // Preserve current playback state if possible
        const wasPlaying = this._player.state === 'started';

        // Dispose previous buffer before creating new one to prevent memory leak
        if (this._player.buffer) {
          this._player.buffer.dispose();
        }

        this._player.buffer = new Tone.ToneAudioBuffer(audioBuf);
        if (wasPlaying && this._config.singmode) {
          // Stop before starting to prevent double-start error
          if (this._player.state === 'started') {
            this._player.stop();
          }
          this._player.start();
        }

        // Mark as ready on first successful render
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

    this._config = { ...this._config, ...config };

    if (hasParamsChanged || hasTextChanged) {
      // Throttled re-render to prevent UI/Audio lag during knob moves
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

  public triggerAttack(note: string | number, time?: number, velocity: number = 1) {
    if (!this._buffer) {
      console.warn('[SAM] triggerAttack called before buffer ready');
      return;
    }

    // Note tracking: If we are in "Sing Mode", we can adjust playbackRate based on the note
    // MIDI 60 (C4) is our "base" pitch.
    if (note && note !== 'C4') {
      const midi = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
      const ratio = Math.pow(2, (midi - 60) / 12);
      this._player.playbackRate = ratio;
    } else {
      this._player.playbackRate = 1.0;
    }

    // Stop any current playback before starting new
    if (this._player.state === 'started') {
      this._player.stop();
    }

    this._player.start(time, 0);
    this._player.volume.value = Tone.gainToDb(velocity);
  }

  public triggerRelease() {
    // One-shot playback usually doesn't need release, 
    // but we could stop it if desired.
    // this._player.stop();
  }

  public dispose() {
    // Clear pending render timer to prevent callback on disposed synth
    if (this._renderTimer) {
      clearTimeout(this._renderTimer);
      this._renderTimer = null;
    }

    super.dispose();
    this._player.dispose();
    this.output.dispose();
    return this;
  }
}
