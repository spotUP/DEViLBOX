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

  constructor(config: SamConfig) {
    super();
    this.output = new Tone.Gain();
    this._config = { ...config };
    this._player = new Tone.Player().connect(this.output);
    
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
        this._player.buffer = new Tone.ToneAudioBuffer(audioBuf);
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

    if (hasParamsChanged) {
      this._sam = new SamJs({
        pitch: this._config.pitch,
        speed: this._config.speed,
        mouth: this._config.mouth,
        throat: this._config.throat,
        singmode: this._config.singmode,
        phonetic: this._config.phonetic
      });
    }

    if (hasTextChanged || hasParamsChanged) {
      this._render();
    }
  }

  public triggerAttack(_note: string | number, time?: number, velocity: number = 1) {
    if (!this._buffer) return;
    
    // SAM is usually played at a fixed pitch (the one in config)
    // but we can potentially shift it with playbackRate if needed.
    // For authentic SAM, we just play the rendered buffer.
    this._player.start(time, 0);
    this._player.volume.value = Tone.gainToDb(velocity);
  }

  public triggerRelease(time?: number) {
    // One-shot playback usually doesn't need release, 
    // but we could stop it if desired.
    // this._player.stop(time);
  }

  public dispose() {
    super.dispose();
    this._player.dispose();
    this.output.dispose();
    return this;
  }
}
