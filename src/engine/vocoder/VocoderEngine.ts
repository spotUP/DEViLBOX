/**
 * VocoderEngine — DJ-mode vocoder pipeline.
 *
 * Owns mic acquisition, optional FX chain (Tone.Reverb + Tone.FeedbackDelay),
 * recording, monitoring, and DJ mixer routing. Delegates the actual WASM
 * vocoder DSP, parameter routing, and preset list to VocoderCore — the
 * same core class is used by VocoderEffect on the master/instrument
 * effect chains, so any tweak to the vocoder DSP is shared automatically.
 *
 * Pipeline:
 *   Mic (getUserMedia) → preamp → VocoderCore → outputGain → [FX chain] → destination
 *
 * The worklet sends RMS amplitude back to the main thread, which is
 * stored in useVocoderStore for the Kraftwerk head to read.
 */

import * as Tone from 'tone';
import { useVocoderStore, type CarrierType, type VocoderFXParams } from '@/stores/useVocoderStore';
import { VocoderCore, CARRIER_NAME_TO_INT } from './VocoderCore';
import { AutoTuneEffect, type AutoTuneScale } from '@/engine/effects/AutoTuneEffect';

export interface RealAutoTuneOptions {
  key?: number;          // 0..11 (C..B)
  scale?: AutoTuneScale;
  strength?: number;     // 0..1
  speed?: number;        // 0..1
}

export class VocoderEngine {
  /** Cached mic stream — kept alive across toggle cycles to avoid
   *  macOS audio hardware reconfiguration glitches on re-acquire. */
  private static cachedStream: MediaStream | null = null;
  private static cachedDeviceId: string | undefined;

  /**
   * Preload worklet module + WASM binary eagerly so toggling the vocoder
   * doesn't block the audio thread. Call once when the DJ view mounts.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  static preload(): void {
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      VocoderCore.preload(ctx);
    } catch (err) {
      console.warn('[VocoderEngine] preload failed (non-fatal):', err);
    }
  }

  private audioContext: AudioContext;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private micPreamp: GainNode;
  private core: VocoderCore | null = null;
  /** Insertion point that sits between (preamp|core) and outputGain.
   *  Real autotune is spliced in here when enabled. */
  private autoTuneInsert: GainNode;
  private autoTune: AutoTuneEffect | null = null;
  private outputGain: GainNode;
  private active = false;
  private vocoderBypassed = false;

  // Effects chain: outputGain → reverb → delay → destination
  private reverb: Tone.Reverb | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private destination: AudioNode;
  private fxBridge: Tone.Gain | null = null; // raw → Tone adapter
  private fxTail: Tone.Gain | null = null;   // Tone → raw adapter

  // Recording: capture processed output (after vocoder + FX) to AudioBuffer
  private recorder: MediaRecorder | null = null;
  private recordChunks: Blob[] = [];
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private _isRecording = false;

  constructor(destination?: AudioNode) {
    this.audioContext = Tone.getContext().rawContext as AudioContext;
    this.destination = destination || this.audioContext.destination;

    // Mic preamp — built-in laptop mics are often very quiet
    this.micPreamp = this.audioContext.createGain();
    this.micPreamp.gain.value = 2.0;

    this.autoTuneInsert = this.audioContext.createGain();
    this.autoTuneInsert.gain.value = 1.0;

    this.outputGain = this.audioContext.createGain();
    this.outputGain.gain.value = 1.0;

    // Default routing: autoTuneInsert → outputGain (no autotune yet)
    this.autoTuneInsert.connect(this.outputGain);

    // Initialize effects from store
    const fx = useVocoderStore.getState().fx;
    this.buildFXChain(fx);

    console.log('[VocoderEngine] Routing through', destination ? 'DJ mixer' : 'audioContext.destination',
      'FX:', fx.enabled ? fx.preset : 'disabled');
  }

  /**
   * Build/rebuild the effects chain based on FX params.
   * Uses a Tone.Gain bridge to cross between raw AudioNode (outputGain)
   * and Tone.js effect nodes, then back to raw AudioNode (destination).
   */
  private buildFXChain(fx: VocoderFXParams): void {
    // Disconnect everything safely
    try { this.outputGain.disconnect(); } catch { /* ok */ }
    this.reverb?.dispose(); this.reverb = null;
    this.delay?.dispose(); this.delay = null;
    this.fxBridge?.dispose(); this.fxBridge = null;
    this.fxTail?.dispose(); this.fxTail = null;

    const fxActive = fx.enabled && fx.preset !== 'none';

    if (fxActive) {
      if (fx.reverbWet > 0 && fx.reverbDecay > 0) {
        this.reverb = new Tone.Reverb({ decay: fx.reverbDecay, preDelay: 0.01, wet: fx.reverbWet });
      }
      if (fx.delayWet > 0 && fx.delayTime > 0) {
        this.delay = new Tone.FeedbackDelay({ delayTime: fx.delayTime, feedback: fx.delayFeedback, wet: fx.delayWet });
      }

      const toneNodes: Tone.ToneAudioNode[] = [];
      if (this.reverb) toneNodes.push(this.reverb);
      if (this.delay) toneNodes.push(this.delay);

      if (toneNodes.length > 0) {
        this.fxBridge = new Tone.Gain(1);
        this.fxTail = new Tone.Gain(1);
        Tone.connect(this.outputGain, this.fxBridge);
        this.fxBridge.connect(toneNodes[0]);
        for (let i = 0; i < toneNodes.length - 1; i++) {
          toneNodes[i].connect(toneNodes[i + 1]);
        }
        toneNodes[toneNodes.length - 1].connect(this.fxTail);
        Tone.connect(this.fxTail, this.destination as unknown as Tone.InputNode);
      } else {
        this.outputGain.connect(this.destination);
      }
    } else {
      this.outputGain.connect(this.destination);
    }
  }

  /** Update FX from store state (call when preset changes) */
  applyFX(fx: VocoderFXParams): void {
    this.buildFXChain(fx);
  }

  /**
   * Toggle vocoder bypass. When bypassed, mic goes straight to FX chain
   * (clean voice + echo/reverb). When not bypassed, mic goes through
   * the vocoder worklet first (robot voice + echo/reverb).
   */
  setVocoderBypass(bypass: boolean): void {
    if (!this.active || this.vocoderBypassed === bypass) return;
    this.vocoderBypassed = bypass;

    this.micPreamp.disconnect();
    if (bypass) {
      this.micPreamp.connect(this.autoTuneInsert);
      console.log('[VocoderEngine] Vocoder bypassed — clean mic + FX');
    } else if (this.core?.node) {
      this.micPreamp.connect(this.core.node);
      console.log('[VocoderEngine] Vocoder active — robot voice + FX');
    }
  }

  get isBypassed(): boolean {
    return this.vocoderBypassed;
  }

  /** Start the vocoder with microphone input */
  async start(deviceId?: string): Promise<void> {
    if (this.active) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Get microphone — reuse cached stream to avoid macOS audio hardware
    // reconfiguration glitch on every toggle. Only re-acquire if device changed.
    const needNewStream = !VocoderEngine.cachedStream
      || VocoderEngine.cachedStream.getAudioTracks().every(t => t.readyState === 'ended')
      || (deviceId && deviceId !== VocoderEngine.cachedDeviceId);

    if (needNewStream) {
      VocoderEngine.cachedStream?.getTracks().forEach(t => t.stop());
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      };
      VocoderEngine.cachedStream = await navigator.mediaDevices.getUserMedia(constraints);
      VocoderEngine.cachedDeviceId = deviceId;
    }

    this.stream = VocoderEngine.cachedStream;
    this.stream!.getAudioTracks().forEach(t => { t.enabled = true; });
    const tracks = this.stream!.getAudioTracks();
    console.log('[VocoderEngine] Mic acquired:', tracks.length, 'tracks,',
      tracks[0]?.label || 'unknown', 'enabled:', tracks[0]?.enabled,
      'muted:', tracks[0]?.muted);
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream!);

    // Create + init the shared vocoder core, seeded from the store params
    const params = useVocoderStore.getState().params;
    this.core = new VocoderCore(this.audioContext, {
      bands: params.bands,
      filtersPerBand: params.filtersPerBand,
      carrierType: CARRIER_NAME_TO_INT[params.carrierType],
      carrierFreq: params.carrierFreq,
      formantShift: params.formantShift,
      reactionTime: params.reactionTime,
    });
    this.core.onAmplitude = (rms, micPeak) => {
      // Use mic peak for the level meter (vocoder RMS is too quiet to see)
      useVocoderStore.getState().setAmplitude(micPeak || rms);
    };
    await this.core.init();
    // Apply the wet param from the store (core init seeds wet=1.0)
    this.core.setWet(params.wet);

    // Connect: mic → preamp(2x) → core.node → autoTuneInsert → outputGain
    this.sourceNode.connect(this.micPreamp);
    this.micPreamp.connect(this.core.node!);
    this.core.node!.connect(this.autoTuneInsert);
    console.log('[VocoderEngine] Audio chain connected: mic → preamp(2x) → core → autotune-insert → gain → dest',
      'contextState:', this.audioContext.state);

    this.active = true;
    useVocoderStore.getState().setActive(true);
  }

  /** Stop the vocoder and release mic */
  stop(): void {
    if (!this.active) return;

    // Disconnect audio graph
    this.sourceNode?.disconnect();
    this.micPreamp.disconnect();
    this.core?.dispose();
    this.autoTuneInsert.disconnect();
    this.outputGain.disconnect();
    // Re-establish the default autoTuneInsert → outputGain link so the
    // engine is ready to start() again without losing the wiring.
    this.autoTuneInsert.connect(this.outputGain);

    // Disable mic tracks (don't stop — keep stream alive for glitch-free re-enable)
    this.stream?.getAudioTracks().forEach(t => { t.enabled = false; });

    // Clean up effects
    this.reverb?.dispose(); this.reverb = null;
    this.delay?.dispose(); this.delay = null;

    this.sourceNode = null;
    this.core = null;
    this.stream = null;
    this.active = false;

    useVocoderStore.getState().setActive(false);
    useVocoderStore.getState().setAmplitude(0);
  }

  // ── Individual parameter setters (delegate to core, mirror to store) ──

  setCarrierType(type: CarrierType): void {
    useVocoderStore.getState().setParam('carrierType', type);
    this.core?.setCarrierType(CARRIER_NAME_TO_INT[type]);
  }

  setCarrierFreq(freq: number): void {
    useVocoderStore.getState().setParam('carrierFreq', freq);
    this.core?.setCarrierFreq(freq);
  }

  setWet(wet: number): void {
    useVocoderStore.getState().setParam('wet', wet);
    this.core?.setWet(wet);
  }

  setReactionTime(time: number): void {
    useVocoderStore.getState().setParam('reactionTime', time);
    this.core?.setReactionTime(time);
  }

  setFormantShift(shift: number): void {
    useVocoderStore.getState().setParam('formantShift', shift);
    this.core?.setFormantShift(shift);
  }

  /** Load a preset — delegated to core (which handles WASM reinit if needed). */
  loadPreset(presetName: string): void {
    useVocoderStore.getState().loadPreset(presetName);
    this.core?.loadPreset(presetName);
    // Apply the wet param from the store (loadPreset on core doesn't change wet)
    const wet = useVocoderStore.getState().params.wet;
    this.core?.setWet(wet);
  }

  // ── Real autotune (pitch correction on the output) ────────────────────

  /**
   * Enable or disable real pitch-correction autotune on the vocoder
   * output. When enabled, an AutoTuneEffect is spliced between the
   * autoTuneInsert tap and outputGain. When disabled, autoTuneInsert
   * connects straight to outputGain.
   *
   * Independent from the existing "follow melody" feature
   * (VocoderAutoTune), which drives the carrier oscillator from the
   * active deck's pattern data — both can be on simultaneously.
   */
  setRealAutoTuneEnabled(enabled: boolean, opts: RealAutoTuneOptions = {}): void {
    if (enabled && !this.autoTune) {
      this.autoTune = new AutoTuneEffect({
        key: opts.key ?? 0,
        scale: opts.scale ?? 'major',
        strength: opts.strength ?? 1.0,
        speed: opts.speed ?? 0.7,
        wet: 1.0,
      });
      // Re-route: autoTuneInsert → autoTune → outputGain
      try { this.autoTuneInsert.disconnect(this.outputGain); } catch { /* ok */ }
      Tone.connect(this.autoTuneInsert, this.autoTune.input as unknown as Tone.InputNode);
      Tone.connect(this.autoTune.output, this.outputGain as unknown as Tone.InputNode);
      console.log('[VocoderEngine] Real autotune ENABLED');
    } else if (!enabled && this.autoTune) {
      try { this.autoTuneInsert.disconnect(); } catch { /* ok */ }
      this.autoTune.dispose();
      this.autoTune = null;
      this.autoTuneInsert.connect(this.outputGain);
      console.log('[VocoderEngine] Real autotune DISABLED');
    }
  }

  setAutoTuneKey(key: number): void {
    this.autoTune?.setKey(key);
  }

  setAutoTuneScale(scale: AutoTuneScale): void {
    this.autoTune?.setScale(scale);
  }

  setAutoTuneStrength(s: number): void {
    this.autoTune?.setStrength(s);
  }

  setAutoTuneSpeed(s: number): void {
    this.autoTune?.setSpeed(s);
  }

  get isRealAutoTuneActive(): boolean {
    return this.autoTune !== null;
  }

  setOutputGain(gain: number): void {
    this.outputGain.gain.value = Math.max(0, Math.min(2, gain));
  }

  /** Mute/unmute the vocoder output (keeps processing so unmute is instant).
   *  Uses a short ramp to avoid clicks on press/release.
   *
   *  Also ramps fxTail to zero on mute. outputGain=0 stops feeding the FX
   *  chain, but reverb/delay nodes still play out their internal buffer —
   *  with long-tailed presets (reggae-soundsystem: 3.5s reverb, 0.45 feedback
   *  at 750ms) that ring for 6+ seconds after release. fxTail caps the tail
   *  so PTT release produces audible silence within a bounded time. */
  setMuted(muted: boolean): void {
    const now = this.audioContext.currentTime;
    const g = this.outputGain.gain;
    try { g.cancelScheduledValues(now); } catch { /* ok */ }
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(muted ? 0 : 1, now + (muted ? 0.03 : 0.015));

    if (this.fxTail) {
      const fxG = this.fxTail.gain as unknown as AudioParam;
      try { fxG.cancelScheduledValues(now); } catch { /* ok */ }
      fxG.setValueAtTime(fxG.value ?? 1, now);
      if (muted) {
        // Allow a brief natural tail, then force silence.
        fxG.linearRampToValueAtTime(1, now + 0.5);
        fxG.linearRampToValueAtTime(0, now + 2.5);
      } else {
        // Restore instantly so the next phrase's FX is heard.
        fxG.linearRampToValueAtTime(1, now + 0.015);
      }
    }
  }

  /** Enable/disable the mic AudioTrack. When disabled, the vocoder worklet
   *  receives silence — its noise gate fully closes, the carrier stops
   *  bleeding through, and the FX tails decay cleanly. Call this on PTT
   *  release to prevent ambient mic noise from sustaining the FX chain. */
  setMicActive(active: boolean): void {
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = active; });
  }

  /** Connect output to a different destination */
  connectTo(destination: AudioNode): void {
    this.outputGain.disconnect();
    this.outputGain.connect(destination);
  }

  get isActive(): boolean {
    return this.active;
  }

  get isReady(): boolean {
    return this.core?.isReady ?? false;
  }

  // ── Recording: capture processed output to AudioBuffer ──────────────────

  /**
   * Start recording the processed vocoder output (after all effects).
   * Call stopRecording() to get the AudioBuffer.
   */
  startRecording(): void {
    if (this._isRecording) return;

    this.recordDest = this.audioContext.createMediaStreamDestination();
    this.outputGain.connect(this.recordDest);

    this.recordChunks = [];
    this.recorder = new MediaRecorder(this.recordDest.stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm',
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordChunks.push(e.data);
    };

    this.recorder.start(100); // 100ms chunks
    this._isRecording = true;
    console.log('[VocoderEngine] Recording started');
  }

  /**
   * Stop recording and return the captured audio as an AudioBuffer.
   * Returns null if recording failed or was empty.
   */
  async stopRecording(): Promise<AudioBuffer | null> {
    if (!this._isRecording || !this.recorder) return null;

    return new Promise((resolve) => {
      this.recorder!.onstop = async () => {
        try { this.outputGain.disconnect(this.recordDest!); } catch { /* ok */ }
        this.recordDest = null;

        if (this.recordChunks.length === 0) {
          resolve(null);
          return;
        }

        const blob = new Blob(this.recordChunks, { type: this.recorder!.mimeType });
        this.recordChunks = [];
        this.recorder = null;
        this._isRecording = false;

        try {
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
          console.log(`[VocoderEngine] Recorded ${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.numberOfChannels}ch`);
          resolve(audioBuffer);
        } catch (err) {
          console.error('[VocoderEngine] Failed to decode recording:', err);
          resolve(null);
        }
      };

      this.recorder!.stop();
    });
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  /** Expose micPreamp for external audio routing (e.g., remote mic) */
  getMicPreamp(): GainNode {
    return this.micPreamp;
  }

  /** Full cleanup */
  dispose(): void {
    if (_activeVocoderEngine === this) _activeVocoderEngine = null;
    this.stop();
    if (this._isRecording) {
      this.recorder?.stop();
      this._isRecording = false;
    }
    this.autoTune?.dispose();
    this.autoTune = null;
    this.autoTuneInsert.disconnect();
    this.micPreamp.disconnect();
    this.outputGain.disconnect();
  }
}

// ── Global vocoder engine accessor (for joystick modulation) ──
let _activeVocoderEngine: VocoderEngine | null = null;

/** Register the active VocoderEngine instance (called by DJVocoderControl on create). */
export function setActiveVocoderEngine(engine: VocoderEngine | null): void {
  _activeVocoderEngine = engine;
}

/** Get the active VocoderEngine instance, if any. */
export function getActiveVocoderEngine(): VocoderEngine | null {
  return _activeVocoderEngine;
}
