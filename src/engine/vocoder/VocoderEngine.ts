/**
 * VocoderEngine — Manages the WASM vocoder pipeline.
 *
 * Routes microphone input through voclib (channel vocoder compiled to WASM)
 * with a built-in carrier oscillator (saw/square/noise/chord).
 *
 * Pipeline:
 *   Mic (getUserMedia) → VocoderWorkletNode → GainNode → destination
 *
 * The worklet sends RMS amplitude back to the main thread,
 * which is stored in useVocoderStore for the Kraftwerk head to read.
 */

import * as Tone from 'tone';
import { useVocoderStore, type CarrierType, type VocoderFXParams } from '@/stores/useVocoderStore';

const CARRIER_TYPE_MAP: Record<CarrierType, number> = {
  saw: 0,
  square: 1,
  noise: 2,
  chord: 3,
};

export class VocoderEngine {
  private static workletLoaded = new WeakSet<AudioContext>();
  private static wasmBinary: ArrayBuffer | null = null;
  private static preloaded = false;
  private static preloadPromise: Promise<void> | null = null;
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
    if (VocoderEngine.preloaded || VocoderEngine.preloadPromise) return;
    VocoderEngine.preloadPromise = (async () => {
      try {
        const ctx = Tone.getContext().rawContext as AudioContext;
        const baseUrl = import.meta.env.BASE_URL || '/';

        // Load worklet module onto the audio thread (the expensive part)
        if (!VocoderEngine.workletLoaded.has(ctx)) {
          try {
            await ctx.audioWorklet.addModule(`${baseUrl}vocoder/Vocoder.worklet.js?v=1`);
          } catch { /* already registered */ }
          VocoderEngine.workletLoaded.add(ctx);
        }

        // Cache WASM binary
        if (!VocoderEngine.wasmBinary) {
          const resp = await fetch(`${baseUrl}vocoder/Vocoder.wasm`);
          if (resp.ok) VocoderEngine.wasmBinary = await resp.arrayBuffer();
        }

        VocoderEngine.preloaded = true;
        console.log('[VocoderEngine] Preloaded worklet + WASM');
      } catch (err) {
        console.warn('[VocoderEngine] Preload failed (non-fatal):', err);
      }
    })();
  }

  private audioContext: AudioContext;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private micPreamp: GainNode;
  private workletNode: AudioWorkletNode | null = null;
  private outputGain: GainNode;
  private ready = false;
  private active = false;
  private vocoderBypassed = false;

  // Effects chain: outputGain → reverb → delay → destination
  private reverb: Tone.Reverb | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private destination: AudioNode;

  constructor(destination?: AudioNode) {
    this.audioContext = Tone.getContext().rawContext as AudioContext;
    this.destination = destination || this.audioContext.destination;

    // Mic preamp — built-in laptop mics are often very quiet
    this.micPreamp = this.audioContext.createGain();
    this.micPreamp.gain.value = 2.0;

    this.outputGain = this.audioContext.createGain();
    this.outputGain.gain.value = 1.0;

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
  private fxBridge: Tone.Gain | null = null; // raw→Tone adapter
  private fxTail: Tone.Gain | null = null;   // Tone→raw adapter

  private buildFXChain(fx: VocoderFXParams): void {
    // Disconnect everything safely
    try { this.outputGain.disconnect(); } catch { /* ok */ }
    this.reverb?.dispose(); this.reverb = null;
    this.delay?.dispose(); this.delay = null;
    this.fxBridge?.dispose(); this.fxBridge = null;
    this.fxTail?.dispose(); this.fxTail = null;

    const fxActive = fx.enabled && fx.preset !== 'none';

    if (fxActive) {
      // Create effects
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
        // Bridge: raw GainNode → Tone.Gain → effects → Tone.Gain → raw destination
        this.fxBridge = new Tone.Gain(1);
        this.fxTail = new Tone.Gain(1);

        // raw outputGain → Tone bridge
        Tone.connect(this.outputGain, this.fxBridge);
        // bridge → effects chain
        this.fxBridge.connect(toneNodes[0]);
        for (let i = 0; i < toneNodes.length - 1; i++) {
          toneNodes[i].connect(toneNodes[i + 1]);
        }
        // last effect → tail
        toneNodes[toneNodes.length - 1].connect(this.fxTail);
        // tail → raw destination
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

    // Reconnect the preamp output
    this.micPreamp.disconnect();
    if (bypass) {
      // Clean mic: preamp → outputGain (skip vocoder worklet)
      this.micPreamp.connect(this.outputGain);
      console.log('[VocoderEngine] Vocoder bypassed — clean mic + FX');
    } else if (this.workletNode) {
      // Robot voice: preamp → worklet → outputGain
      this.micPreamp.connect(this.workletNode);
      console.log('[VocoderEngine] Vocoder active — robot voice + FX');
    }
  }

  get isBypassed(): boolean {
    return this.vocoderBypassed;
  }

  /** Load WASM binary and worklet module (cached per AudioContext) */
  private async ensureLoaded(): Promise<void> {
    // If preload is in progress, just wait for it
    if (VocoderEngine.preloadPromise) {
      await VocoderEngine.preloadPromise;
    }

    const ctx = this.audioContext;
    const baseUrl = import.meta.env.BASE_URL || '/';

    // Load worklet module (once per context) — usually already done by preload()
    if (!VocoderEngine.workletLoaded.has(ctx)) {
      try {
        await ctx.audioWorklet.addModule(`${baseUrl}vocoder/Vocoder.worklet.js?v=1`);
      } catch (err) {
        console.warn('[VocoderEngine] addModule warning (may be HMR re-register):', err);
      }
      VocoderEngine.workletLoaded.add(ctx);
    }

    // Load WASM binary — usually already done by preload()
    if (!VocoderEngine.wasmBinary) {
      const wasmResp = await fetch(`${baseUrl}vocoder/Vocoder.wasm`);
      if (!wasmResp.ok) throw new Error(`Failed to load Vocoder.wasm: ${wasmResp.status}`);
      VocoderEngine.wasmBinary = await wasmResp.arrayBuffer();
    }
  }

  /** Start the vocoder with microphone input */
  async start(deviceId?: string): Promise<void> {
    if (this.active) return;

    // Ensure AudioContext is running
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    await this.ensureLoaded();

    // Get microphone — reuse cached stream to avoid macOS audio hardware
    // reconfiguration glitch on every toggle. Only re-acquire if device changed.
    const needNewStream = !VocoderEngine.cachedStream
      || VocoderEngine.cachedStream.getAudioTracks().every(t => t.readyState === 'ended')
      || (deviceId && deviceId !== VocoderEngine.cachedDeviceId);

    if (needNewStream) {
      // Release old stream if switching devices
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
    // Re-enable tracks (they were disabled on stop)
    this.stream!.getAudioTracks().forEach(t => { t.enabled = true; });
    const tracks = this.stream!.getAudioTracks();
    console.log('[VocoderEngine] Mic acquired:', tracks.length, 'tracks,',
      tracks[0]?.label || 'unknown', 'enabled:', tracks[0]?.enabled,
      'muted:', tracks[0]?.muted);
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream!);

    // Create worklet node
    this.workletNode = new AudioWorkletNode(this.audioContext, 'vocoder-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { sampleRate: this.audioContext.sampleRate },
    });

    // Handle messages from worklet
    this.workletNode.port.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'ready') {
        console.log('[VocoderEngine] Worklet WASM ready — applying params');
        this.ready = true;
        this.applyCurrentParams();
      } else if (data.type === 'rms') {
        // Use mic peak for the level meter (vocoder RMS is too quiet to see)
        useVocoderStore.getState().setAmplitude(data.micPeak ?? data.value);
      } else if (data.type === 'error') {
        console.error('[VocoderEngine] Worklet error:', data.message);
      }
    };

    // Connect: mic → preamp(2x) → worklet → output gain
    this.sourceNode.connect(this.micPreamp);
    this.micPreamp.connect(this.workletNode);
    this.workletNode.connect(this.outputGain);
    console.log('[VocoderEngine] Audio chain connected: mic → preamp(2x) → worklet → gain → dest',
      'contextState:', this.audioContext.state);

    // Initialize WASM in worklet
    const params = useVocoderStore.getState().params;
    const wasmBin = VocoderEngine.wasmBinary!;
    console.log('[VocoderEngine] Sending WASM binary to worklet:', wasmBin.byteLength, 'bytes');
    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: wasmBin,
      sampleRate: this.audioContext.sampleRate,
      bands: params.bands,
      filtersPerBand: params.filtersPerBand,
    });

    this.active = true;
    useVocoderStore.getState().setActive(true);
  }

  /** Stop the vocoder and release mic */
  stop(): void {
    if (!this.active) return;

    // Disconnect audio graph
    this.sourceNode?.disconnect();
    this.micPreamp.disconnect();
    this.workletNode?.disconnect();
    this.outputGain.disconnect();

    // Tell worklet to dispose WASM
    this.workletNode?.port.postMessage({ type: 'dispose' });

    // Disable mic tracks (don't stop — keep stream alive for glitch-free re-enable)
    this.stream?.getAudioTracks().forEach(t => { t.enabled = false; });

    // Clean up effects
    this.reverb?.dispose(); this.reverb = null;
    this.delay?.dispose(); this.delay = null;

    this.sourceNode = null;
    this.workletNode = null;
    this.stream = null;
    this.ready = false;
    this.active = false;

    useVocoderStore.getState().setActive(false);
    useVocoderStore.getState().setAmplitude(0);
  }

  /** Apply all current params from the store to the worklet */
  private applyCurrentParams(): void {
    if (!this.workletNode || !this.ready) return;
    const p = useVocoderStore.getState().params;
    const port = this.workletNode.port;

    port.postMessage({ type: 'setCarrierType', value: CARRIER_TYPE_MAP[p.carrierType] });
    port.postMessage({ type: 'setCarrierFreq', value: p.carrierFreq });
    port.postMessage({ type: 'setWet', value: p.wet });
    port.postMessage({ type: 'setReactionTime', value: p.reactionTime });
    port.postMessage({ type: 'setFormantShift', value: p.formantShift });
  }

  // ── Individual parameter setters ──

  setCarrierType(type: CarrierType): void {
    useVocoderStore.getState().setParam('carrierType', type);
    this.workletNode?.port.postMessage({
      type: 'setCarrierType',
      value: CARRIER_TYPE_MAP[type],
    });
  }

  setCarrierFreq(freq: number): void {
    useVocoderStore.getState().setParam('carrierFreq', freq);
    this.workletNode?.port.postMessage({ type: 'setCarrierFreq', value: freq });
  }

  setWet(wet: number): void {
    useVocoderStore.getState().setParam('wet', wet);
    this.workletNode?.port.postMessage({ type: 'setWet', value: wet });
  }

  setReactionTime(time: number): void {
    useVocoderStore.getState().setParam('reactionTime', time);
    this.workletNode?.port.postMessage({ type: 'setReactionTime', value: time });
  }

  setFormantShift(shift: number): void {
    useVocoderStore.getState().setParam('formantShift', shift);
    this.workletNode?.port.postMessage({ type: 'setFormantShift', value: shift });
  }

  /** Load a preset — reinitializes the WASM vocoder if bands/filtersPerBand changed */
  loadPreset(presetName: string): void {
    useVocoderStore.getState().loadPreset(presetName);
    if (!this.workletNode || !this.ready) return;

    const p = useVocoderStore.getState().params;
    const port = this.workletNode.port;

    // Reinit WASM with new bands/filtersPerBand, then apply all params
    port.postMessage({
      type: 'reinit',
      sampleRate: this.audioContext.sampleRate,
      bands: p.bands,
      filtersPerBand: p.filtersPerBand,
    });

    // Apply runtime params (worklet applies these after reinit completes)
    port.postMessage({ type: 'setCarrierType', value: CARRIER_TYPE_MAP[p.carrierType] });
    port.postMessage({ type: 'setCarrierFreq', value: p.carrierFreq });
    port.postMessage({ type: 'setWet', value: p.wet });
    port.postMessage({ type: 'setReactionTime', value: p.reactionTime });
    port.postMessage({ type: 'setFormantShift', value: p.formantShift });
  }

  setOutputGain(gain: number): void {
    this.outputGain.gain.value = Math.max(0, Math.min(2, gain));
  }

  /** Mute/unmute the vocoder output (keeps processing so unmute is instant) */
  setMuted(muted: boolean): void {
    this.outputGain.gain.value = muted ? 0 : 1;
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
    return this.ready;
  }

  /** Full cleanup */
  dispose(): void {
    this.stop();
    this.micPreamp.disconnect();
    this.outputGain.disconnect();
  }
}
