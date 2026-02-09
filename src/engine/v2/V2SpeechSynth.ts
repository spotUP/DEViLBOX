import * as Tone from 'tone';
// @ts-ignore - SamJs is a JavaScript library without types
import SamJs from '../sam/samjs';

export interface V2SpeechConfig {
  text: string;     // Phonetic text (e.g. "!kwIH_k")
  speed: number;    // 0-127
  pitch: number;    // 0-127
  formantShift: number; // 0-127
  singMode: boolean;
}

/**
 * V2 Speech Synth - Uses SAM (Software Automatic Mouth) engine
 * with pitch tracking for singing mode in tracker/keyboard playback.
 *
 * When singMode is enabled, notes from the tracker/keyboard/piano roll
 * adjust the playback rate to match the played pitch (C4 = base pitch).
 */
export class V2SpeechSynth extends Tone.ToneAudioNode {
  public readonly name: string = 'V2SpeechSynth';
  public readonly input: undefined = undefined;
  public readonly output: Tone.Gain;

  private _player: Tone.Player;
  private _sam: any;
  private _config: V2SpeechConfig;
  private _buffer: AudioBuffer | null = null;
  private _isRendering: boolean = false;
  private _ready: boolean = false;
  private _readyPromise: Promise<void>;
  private _readyResolve!: () => void;
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config?: Partial<V2SpeechConfig>) {
    super();
    this.output = new Tone.Gain();
    this._config = {
      text: '!kwIH_k !fAA_ks',
      speed: 64,
      pitch: 64,
      formantShift: 64,
      singMode: true,
      ...config
    };

    // Create ready promise for async initialization
    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });

    this._player = new Tone.Player().connect(this.output);
    this._player.loop = this._config.singMode; // Loop in sing mode for continuous playback

    // Map V2 config to SAM parameters
    // V2 uses 0-127 range, SAM uses 0-255
    const samPitch = Math.round((this._config.pitch / 127) * 255);
    const samSpeed = Math.round((this._config.speed / 127) * 255);
    // Formant shift maps to mouth/throat - use center values adjusted by formant
    const formantOffset = ((this._config.formantShift - 64) / 64) * 50;
    const mouth = Math.max(0, Math.min(255, 128 + formantOffset));
    const throat = Math.max(0, Math.min(255, 128 - formantOffset));

    this._sam = new SamJs({
      pitch: samPitch,
      speed: samSpeed,
      mouth: Math.round(mouth),
      throat: Math.round(throat),
      singmode: this._config.singMode,
      phonetic: false // Use English text, let SAM convert to phonemes
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
      // SAM renders at 22050Hz - use phonetic=false to let SAM convert English text
      const buf32 = this._sam.buf32(this._config.text, false);
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
        if (wasPlaying && this._config.singMode) {
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

    // Update loop mode when singMode changes
    if (config.singMode !== undefined) {
      this._player.loop = config.singMode;
    }

    if (hasParamsChanged || hasTextChanged) {
      // Throttled re-render to prevent UI/Audio lag during knob moves
      if (this._renderTimer) clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => {
        // Recreate SAM with new parameters
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

  /**
   * Trigger speech playback at a specific pitch.
   * In singMode, the note adjusts the playback rate to match the pitch.
   * C4 (MIDI 60) is the base pitch (playbackRate = 1.0).
   */
  public triggerAttack(note: string | number, time?: number, velocity: number = 1) {
    if (!this._buffer) {
      console.warn('[V2Speech] triggerAttack called before buffer ready');
      return;
    }

    // Pitch tracking for Sing Mode - adjust playback rate based on MIDI note
    // MIDI 60 (C4) is our "base" pitch.
    if (this._config.singMode) {
      const midi = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
      const ratio = Math.pow(2, (midi - 60) / 12);
      this._player.playbackRate = ratio;

      // In sing mode, only start if not already playing (for continuous pitch tracking)
      if (this._player.state !== 'started') {
        this._player.start(time, 0);
      }
      this._player.volume.value = Tone.gainToDb(velocity);
    } else {
      // In normal mode, restart on each note trigger
      this._player.playbackRate = 1.0;
      
      // Stop any current playback before starting new
      if (this._player.state === 'started') {
        this._player.stop();
      }
      
      this._player.start(time, 0);
      this._player.volume.value = Tone.gainToDb(velocity);
    }
  }

  public triggerRelease(_time?: number) {
    // One-shot playback usually doesn't need release,
    // but we could stop it if desired for short notes.
    // this._player.stop();
  }

  public triggerAttackRelease(note: string | number, _duration: Tone.Unit.Time, time?: number, velocity: number = 1) {
    this.triggerAttack(note, time, velocity);
    // Player will play until the buffer ends or we stop it
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
