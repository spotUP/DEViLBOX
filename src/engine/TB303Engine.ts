/**
 * TB303 - High-Performance Roland TB-303 Emulation for DEViLBOX
 * 
 * Idiomatic Tone.js Node implementation.
 * Strictly uses the injected Native Context from ToneContext.
 */

import * as Tone from 'tone';
import { ToneContext } from './core/ToneContext';
import type { DevilFishConfig } from '@typedefs/instrument';

export interface TB303Options extends Tone.ToneAudioNodeOptions {
  cutoff: number;
  resonance: number;
  envMod: number;
  decay: number;
  accent: number;
  waveform: 'sawtooth' | 'square';
}

export class TB303 extends Tone.ToneAudioNode<TB303Options> {
  readonly name: string = 'TB303';
  public readonly isTB303 = true;

  public input: undefined; 
  public output: Tone.Volume;
  
  private _panner: Tone.Panner;
  private _worklet: AudioWorkletNode | null = null;
  private _bridge: GainNode | null = null;
  private _messageQueue: any[] = [];
  private _isReady = false;
  private _currentNote: string | null = null;
  private _vizCutoff: number = 1000;
  private _vizAccent: number = 1;

  constructor(options?: Partial<TB303Options>) {
    super(options);
    const opts = Tone.defaultArg(options, {
      cutoff: 800,
      resonance: 50,
      envMod: 50,
      decay: 200,
      accent: 50,
      waveform: 'sawtooth'
    });

    this.output = new Tone.Volume({ context: this.context });
    this._panner = new Tone.Panner({ context: this.context }).connect(this.output);
    
    this._initWorklet(opts).catch(e => console.error('[TB303] Init Failed:', e));
  }

  /**
   * Directly access the manually injected native context.
   * No hunting, no unwrapping. Just the source of truth.
   */
  private _getNativeContext(): BaseAudioContext | null {
    return ToneContext.nativeContext;
  }

  private async _initWorklet(opts: any) {
    let nativeCtx = this._getNativeContext();
    let attempts = 0;

    // Wait for the manual injection to complete in ToneContext.init()
    while (!nativeCtx && attempts < 40) {
      await new Promise(r => setTimeout(r, 100));
      nativeCtx = this._getNativeContext();
      attempts++;
    }
    
    if (!nativeCtx || !nativeCtx.audioWorklet) {
      throw new Error('TB303 requires a native BaseAudioContext with Worklet support.');
    }

    try {
      // 1. Create native bridge
      this._bridge = nativeCtx.createGain();
      this._bridge.channelCount = 1;
      this._bridge.channelCountMode = 'explicit';
      
      // 2. Safe Bridge: Tone.connect handles the Tone-to-Native complexity
      Tone.connect(this._bridge, this._panner);

      // 3. Load DSP
      if (!(window as any)._open303WorkletLoaded) {
        const basePath = import.meta.env.BASE_URL || '/';
        await nativeCtx.audioWorklet.addModule(`${basePath}open303.worklet.js`);
        (window as any)._open303WorkletLoaded = true;
      }

      // 4. Construct Worklet
      this._worklet = new AudioWorkletNode(nativeCtx, 'open303-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1]
      });

      this._worklet.port.onmessage = (e) => {
        if (e.data.type === 'viz') {
          this._vizCutoff = e.data.cutoff;
          this._vizAccent = e.data.accent;
        }
      };

      // 5. Connect
      this._worklet.connect(this._bridge);
      this._isReady = true;

      // 6. Initial Parameters
      setTimeout(() => {
        this.setCutoff(opts.cutoff);
        this.setResonance(opts.resonance);
        this.setEnvMod(opts.envMod);
        this.setDecay(opts.decay);
        this.setAccentAmount(opts.accent);
        this.setWaveform(opts.waveform);

        while (this._messageQueue.length > 0) {
          const msg = this._messageQueue.shift();
          this._worklet?.port.postMessage(msg);
        }
      }, 50);

    } catch (e) {
      console.error('[TB303] Path construction failed:', e);
    }
  }

  // === Standard API ===

  public triggerAttack(note: any, _time?: any, velocity: number = 1, accent: boolean = false, slide: boolean = false): this {
    const pitch = Tone.Frequency(note).toMidi();
    const msg = { type: 'noteOn', pitch, velocity: Math.floor(velocity * 127), accent, slide: slide && this._currentNote !== null };
    if (this._isReady && this._worklet) this._worklet.port.postMessage(msg);
    else this._messageQueue.push(msg);
    this._currentNote = note.toString();
    return this;
  }

  public triggerRelease(_time?: any): this {
    const msg = { type: 'noteOff' };
    if (this._isReady && this._worklet) this._worklet.port.postMessage(msg);
    else this._messageQueue.push(msg);
    this._currentNote = null;
    return this;
  }

  public triggerAttackRelease(note: any, duration: any, time?: any, velocity: number = 1, accent: boolean = false, slide: boolean = false): this {
    const now = this.toSeconds(time);
    const durSec = this.toSeconds(duration);
    this.triggerAttack(note, now, velocity, accent, slide);
    this.context.transport.schedule(() => {
      this.triggerRelease();
    }, now + durSec);
    return this;
  }

  // === Parameter Controls ===

  public setCutoff(v: number) { this._sendRawParam('cutoff', v); }
  public setResonance(v: number) { this._sendRawParam('resonance', v); }
  public setEnvMod(v: number) { this._sendRawParam('envMod', v); }
  public setDecay(v: number) { this._sendRawParam('decay', v); }
  public setAccentAmount(v: number) { this._sendRawParam('accent', v); }
  public setWaveform(v: 'sawtooth' | 'square') { this._sendRawParam('waveform', v === 'square' ? 1 : 0); }
  public setTuning(cents: number) { this._sendRawParam('tuning', 440 * Math.pow(2, cents / 1200)); }
  public setSlideTime(v: number) { this._sendRawParam('slideTime', v); }
  public setOverdrive(v: number) { this._sendRawParam('overdrive', v); }

  // Devil Fish Parameters
  public setSweepSpeed(v: string) { this._sendRawParam('sweep', v); }
  public setMuffler(v: string) { this._sendRawParam('muffler', v); }
  public setHighResonance(v: boolean) { this._sendRawParam('highResonance', v ? 1 : 0); }
  public setAccentSweepEnabled(v: boolean) { this._sendRawParam('accentSweepEnabled', v ? 1 : 0); }
  public setNormalDecay(v: number) { this._sendRawParam('decay', v); }
  public setAccentDecay(v: number) { this._sendRawParam('accentDecay', v); }
  public setVegDecay(v: number) { this._sendRawParam('ampDecay', v); }
  public setVegSustain(percent: number) { this._sendRawParam('ampSustain', percent / 100); }
  public setSoftAttack(v: number) { this._sendRawParam('softAttack', v); }
  public setFilterTracking(v: number) { this._sendRawParam('tracking', v); }
  public setFilterFM(v: number) { this._sendRawParam('filterFM', v); }

  public enableDevilFish(enabled: boolean, config?: Partial<DevilFishConfig>) {
    this._sendRawParam('dfEnabled', enabled ? 1 : 0);
    if (config) {
      this.setNormalDecay(config.normalDecay || 200);
      this.setAccentDecay(config.accentDecay || 200);
      this.setVegDecay(config.vegDecay || 3000);
      this.setVegSustain(config.vegSustain || 0);
      this.setSoftAttack(config.softAttack || 4);
      this.setFilterTracking(config.filterTracking || 0);
      this.setFilterFM(config.filterFM || 0);
      this.setSweepSpeed(config.sweepSpeed || 'normal');
      this.setAccentSweepEnabled(config.accentSweepEnabled ?? true);
      this.setHighResonance(config.highResonance || false);
      this.setMuffler(config.muffler || 'off');
    }
  }

  private _sendRawParam(name: string, value: any) {
    const msg = { type: 'param', name, value };
    if (this._isReady && this._worklet) {
      this._worklet.port.postMessage(msg);
    } else {
      this._messageQueue.push(msg);
    }
  }

  public async loadNeuralModel(name: string) {
    if (!name || name === 'none') {
      this._sendRawParam('loadModel', null);
      return;
    }
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}models/jc303/${name}.json`);
      const model = await res.json();
      if (this._worklet && model.state_dict) {
        const weights = {
          rec: {
            weight_ih_l0: model.state_dict['rec.weight_ih_l0'],
            weight_hh_l0: model.state_dict['rec.weight_hh_l0'],
            bias_ih_l0: model.state_dict['rec.bias_ih_l0'],
            bias_hh_l0: model.state_dict['rec.bias_hh_l0'],
          },
          lin: { weight: model.state_dict['lin.weight'], bias: model.state_dict['lin.bias'] }
        };
        this._worklet.port.postMessage({ type: 'loadModel', weights });
      }
    } catch (e) { console.error('[TB303] Model failed:', e); }
  }

  public connect(dest: any) { this.output.connect(dest); return this; }
  public disconnect() { this.output.disconnect(); return this; }
  public dispose() { this.output.dispose(); this._panner.dispose(); this._worklet?.disconnect(); return this; }
  
  public get volume(): Tone.Volume { return this.output; }
  public get pan(): Tone.Param<"audioRange"> { return this._panner.pan; }
  public getInstantCutoff() { return this._vizCutoff; }
  public getInstantAccent() { return this._vizAccent; }
}
