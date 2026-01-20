/**
 * ToneEngine - Facade for Audio Engine Managers
 */

import * as Tone from 'tone';
import { ToneContext } from './core/ToneContext';
import { InstrumentManager } from './managers/InstrumentManager';
import { EffectChainManager } from './managers/EffectChainManager';
import { ChannelManager } from './managers/ChannelManager';
import { PlaybackManager } from './managers/PlaybackManager';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';

export class ToneEngine {
  private static instance: ToneEngine | null = null;

  // Nodes are null until _ensureGraph() is called after context init
  public masterInput: Tone.Gain | null = null;
  public masterChannel: Tone.Channel | null = null;
  public analyser: Tone.Analyser | null = null;
  public fft: Tone.FFT | null = null;

  public instrumentManager: InstrumentManager;
  private context: ToneContext;
  private effectChainManager: EffectChainManager | null = null;
  private channelManager: ChannelManager | null = null;
  private playbackManager: PlaybackManager;

  private constructor() {
    this.context = ToneContext.getInstance();
    this.instrumentManager = new InstrumentManager();
    this.playbackManager = new PlaybackManager(this.instrumentManager);
  }

  public static getInstance(): ToneEngine {
    if (!ToneEngine.instance) ToneEngine.instance = new ToneEngine();
    return ToneEngine.instance;
  }

  /**
   * BUILD THE GRAPH ON THE CORRECT CONTEXT
   * This is called automatically by any method that needs the audio graph.
   */
  private _ensureGraph() {
    if (this.masterInput) return;

    // CRITICAL: Ensure the native context is created AND bound to Tone.js
    // BEFORE we create any nodes. This prevents the "default context" trap.
    this.context.ensureContext();

    if (!ToneContext.nativeContext) {
      console.error('[ToneEngine] Failed to establish native context. Audio may not work.');
    }

    console.log('[ToneEngine] Building Master Audio Graph on established context...');
    
    this.masterInput = new Tone.Gain(1);
    this.masterChannel = new Tone.Channel({ volume: -6, pan: 0 }).toDestination();
    this.analyser = new Tone.Analyser('waveform', 1024);
    this.fft = new Tone.FFT(1024);

    this.masterChannel.connect(this.analyser);
    this.masterChannel.connect(this.fft);
    this.masterInput.connect(this.masterChannel);

    this.effectChainManager = new EffectChainManager(this.masterInput, this.masterChannel);
    this.channelManager = new ChannelManager(this.masterInput);
  }

  public async init() { 
    // 1. Establish foundation (async resume)
    await this.context.init(); 
    // 2. Build graph ON that foundation
    this._ensureGraph();
    return this.getContextState();
  }

  public getContextState() { return this.context.getContextState(); }
  public setBPM(bpm: number) { this.context.setBPM(bpm); }
  public getBPM() { return this.context.getBPM(); }
  public async start() { 
    await this.context.start(); 
    this._ensureGraph();
  }
  public stop() { this.context.stop(); }
  public pause() { this.context.pause(); }
  public getPosition() { return this.context.getPosition(); }
  public setPosition(pos: string) { this.context.setPosition(pos); }

  public getInstrument(id: number, config: InstrumentConfig, channel?: number) {
    this._ensureGraph();
    const key = this.instrumentManager.getInstrumentKey(id, channel);
    const existing = this.instrumentManager.getInstrumentInstance(key);
    if (existing) return existing;

    const inst = this.instrumentManager.createInstrument(id, config, channel);
    // channelManager is guaranteed to exist after _ensureGraph
    const destination = channel !== undefined ? this.channelManager!.getChannelOutput(channel) : this.masterInput!;
    this.effectChainManager!.buildInstrumentEffectChain(key, config.effects || [], inst, destination);
    return inst;
  }

  public invalidateInstrument(id: number) { this.instrumentManager.disposeInstrument(id); }
  public async preloadInstruments(configs: InstrumentConfig[]) { return this.instrumentManager.preloadInstruments(configs); }

  public triggerNote(id: number, note: string, dur: number, time: number, vel: number, cfg: InstrumentConfig, acc?: boolean, slide?: boolean, ch?: number) {
    this._ensureGraph();
    this.getInstrument(id, cfg, ch);
    this.playbackManager.triggerNote(id, note, dur, time, vel, cfg, acc, slide, ch);
  }

  public triggerNoteAttack(id: number, note: string, time: number, vel: number, cfg: InstrumentConfig, ch?: number) {
    this._ensureGraph();
    this.getInstrument(id, cfg, ch);
    this.playbackManager.triggerNoteAttack(id, note, time, vel, cfg, ch);
  }

  public triggerNoteRelease(id: number, note: string, time: number, cfg: InstrumentConfig, ch?: number) {
    this._ensureGraph();
    this.getInstrument(id, cfg, ch);
    this.playbackManager.triggerNoteRelease(id, note, time, cfg, ch);
  }

  public releaseNote(id: number, note: string, time?: number, ch?: number) {
    const safeTime = this.playbackManager.getSafeTime(time);
    const key = this.instrumentManager.getInstrumentKey(id, ch);
    const inst = this.instrumentManager.getInstrumentInstance(key);
    if (inst && typeof (inst as any).triggerRelease === 'function') {
      if ((inst as any).isTB303) (inst as any).triggerRelease(safeTime);
      else (inst as any).triggerRelease(note, safeTime);
    }
  }

  public releaseAll() {
    this.instrumentManager.getAllInstruments().forEach(inst => {
      if (typeof (inst as any).releaseAll === 'function') (inst as any).releaseAll();
      else if (typeof (inst as any).triggerRelease === 'function') (inst as any).triggerRelease();
    });
  }

  public applyAutomation(id: number, param: string, val: number, ch?: number) {
    const key = this.instrumentManager.getInstrumentKey(id, ch);
    const inst = this.instrumentManager.getInstrumentInstance(key);
    if (inst) this.playbackManager.applyAutomation(inst, param, val);
  }

  public updateTB303Parameters(id: number, params: any) { this.instrumentManager.updateTB303Parameters(id, params); }

  public rebuildInstrumentEffects(id: number, effects: EffectConfig[]) {
    this._ensureGraph();
    this.instrumentManager.getAllInstruments().forEach((inst, key) => {
      if (key.startsWith(`${id}-`)) {
        const channel = key.split('-')[1] !== '-1' ? Number(key.split('-')[1]) : undefined;
        const destination = channel !== undefined ? this.channelManager!.getChannelOutput(channel) : this.masterInput!;
        this.effectChainManager!.buildInstrumentEffectChain(key, effects, inst, destination);
      }
    });
  }

  public rebuildMasterEffects(fx: EffectConfig[]) { 
    this._ensureGraph();
    this.effectChainManager!.rebuildMasterEffects(fx); 
  }
  public updateMasterEffectParams(id: string, cfg: EffectConfig) { 
    this._ensureGraph();
    this.effectChainManager!.updateMasterEffectParams(id, cfg); 
  }
  public setMasterVolume(vol: number) { 
    this._ensureGraph();
    this.masterChannel!.volume.value = vol; 
  }
  public setMasterMute(mute: boolean) { 
    this._ensureGraph();
    this.masterChannel!.mute = mute; 
  }

  public getChannelOutput(idx: number) { 
    this._ensureGraph();
    return this.channelManager!.getChannelOutput(idx); 
  }
  public updateMuteStates(chs: any[]) { 
    this._ensureGraph();
    this.channelManager!.updateMuteStates(chs); 
  }
  public getChannelLevels(num: number) { 
    this._ensureGraph();
    return this.channelManager!.getChannelLevels(num); 
  }
  public getChannelTriggerLevels(num: number) { 
    this._ensureGraph();
    return this.channelManager!.getChannelTriggerLevels(num); 
  }
  public setChannelVolume(idx: number, vol: number) { 
    this._ensureGraph();
    this.channelManager!.setChannelVolume(idx, vol); 
  }
  public setChannelPan(idx: number, pan: number) { 
    this._ensureGraph();
    this.channelManager!.setChannelPan(idx, pan); 
  }
  public isChannelMuted(idx: number) { 
    this._ensureGraph();
    return this.channelManager!.isChannelMuted(idx); 
  }
  public triggerChannelMeter(idx: number, vel: number) { 
    this._ensureGraph();
    this.channelManager!.triggerChannelMeter(idx, vel); 
  }

  public isMetronomeEnabled() { return false; }
  public triggerMetronomeClick(_t: number, _d: boolean) {}

  public getInstrumentInstance(key: string) { return this.instrumentManager.getInstrumentInstance(key); }
  public getAllInstruments() { return this.instrumentManager.getAllInstruments(); }
  public get instruments() { return this.instrumentManager.instruments; }

  public resetProject() {
    this.stop();
    this.instrumentManager.disposeAll();
    if (this.effectChainManager) this.effectChainManager.disposeAll();
    if (this.channelManager) this.channelManager.disposeAll();
  }

  public getWaveform() { 
    this._ensureGraph();
    return this.analyser!.getValue() as Float32Array; 
  }
  public getFFT() { 
    this._ensureGraph();
    return this.fft!.getValue() as Float32Array; 
  }
}

export const getToneEngine = () => ToneEngine.getInstance();
