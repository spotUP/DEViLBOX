/**
 * ToneContext - Manages the global Tone.js context and native BaseAudioContext
 * 
 * DIRECT NATIVE INJECTION STRATEGY:
 * We create the native context manually and hand it to Tone.js.
 * This guarantees we hold the primitive BaseAudioContext required for Worklets.
 */

import * as Tone from 'tone';

export class ToneContext {
  private static instance: ToneContext | null = null;
  public static nativeContext: BaseAudioContext | null = null;

  private constructor() {}

  public static getInstance(): ToneContext {
    if (!ToneContext.instance) {
      ToneContext.instance = new ToneContext();
    }
    return ToneContext.instance;
  }

  public ensureContext(): void {
    if (ToneContext.nativeContext) return;
    
    try {
      console.log('[ToneContext] Synchronously ensuring native context...');
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
      const native = new AudioCtx();
      ToneContext.nativeContext = native;
      
      const toneCtx = new Tone.Context(native);
      Tone.setContext(toneCtx);
    } catch (e) {
      console.error('[ToneContext] Failed to ensure context:', e);
    }
  }

  public async init(): Promise<void> {
    console.log('[ToneContext] Initializing via Direct Injection...');
    this.ensureContext();

    try {
      if (Tone.getContext().state === 'suspended') {
        await Tone.start();
      }
    } catch (e) {
      console.error('[ToneContext] Injection failed:', e);
    }
  }

  public getContextState(): string {
    return Tone.getContext().state;
  }

  public setBPM(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  public getBPM(): number {
    return Tone.getTransport().bpm.value;
  }

  public async start(): Promise<void> {
    this.ensureContext();
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
    Tone.getTransport().start();
  }

  public stop(): void {
    Tone.getTransport().stop();
  }

  public pause(): void {
    Tone.getTransport().pause();
  }

  public getPosition(): string {
    return Tone.getTransport().position.toString();
  }

  public setPosition(position: string): void {
    Tone.getTransport().position = position;
  }
}