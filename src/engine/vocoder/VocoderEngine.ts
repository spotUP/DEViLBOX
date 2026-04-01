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
import { useVocoderStore, type CarrierType } from '@/stores/useVocoderStore';

const CARRIER_TYPE_MAP: Record<CarrierType, number> = {
  saw: 0,
  square: 1,
  noise: 2,
  chord: 3,
};

export class VocoderEngine {
  private static workletLoaded = new WeakSet<AudioContext>();
  private static wasmBinary: ArrayBuffer | null = null;

  private audioContext: AudioContext;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private micPreamp: GainNode;
  private workletNode: AudioWorkletNode | null = null;
  private outputGain: GainNode;
  private ready = false;
  private active = false;

  constructor(destination?: AudioNode) {
    this.audioContext = Tone.getContext().rawContext as AudioContext;

    // Mic preamp — built-in laptop mics are often very quiet
    this.micPreamp = this.audioContext.createGain();
    this.micPreamp.gain.value = 2.0;

    this.outputGain = this.audioContext.createGain();
    this.outputGain.gain.value = 1.0;

    if (destination) {
      console.log('[VocoderEngine] Routing through provided destination (DJ mixer)');
      this.outputGain.connect(destination);
    } else {
      console.log('[VocoderEngine] Routing directly to audioContext.destination');
      this.outputGain.connect(this.audioContext.destination);
    }
  }

  /** Load WASM binary and worklet module (cached per AudioContext) */
  private async ensureLoaded(): Promise<void> {
    const ctx = this.audioContext;
    const baseUrl = import.meta.env.BASE_URL || '/';

    // Load worklet module (once per context)
    // Wrapped in try/catch like DB303 — after HMR the WeakSet resets but
    // the processor name is still registered on the AudioContext.
    if (!VocoderEngine.workletLoaded.has(ctx)) {
      const workletUrl = `${baseUrl}vocoder/Vocoder.worklet.js?v=${Date.now()}`;
      try {
        await ctx.audioWorklet.addModule(workletUrl);
      } catch (err) {
        // If it's already registered (HMR reload), that's fine — continue.
        // Only re-throw if the processor genuinely doesn't exist.
        console.warn('[VocoderEngine] addModule warning (may be HMR re-register):', err);
      }
      VocoderEngine.workletLoaded.add(ctx);
    }

    // Load WASM binary (once globally — no JS glue needed, worklet instantiates directly)
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

    // Get microphone
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: false,  // We want raw signal for vocoding
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    const tracks = this.stream.getAudioTracks();
    console.log('[VocoderEngine] Mic acquired:', tracks.length, 'tracks,',
      tracks[0]?.label || 'unknown', 'enabled:', tracks[0]?.enabled,
      'muted:', tracks[0]?.muted);
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

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

    // Tell worklet to dispose WASM
    this.workletNode?.port.postMessage({ type: 'dispose' });

    // Stop mic tracks
    this.stream?.getTracks().forEach((t) => t.stop());

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
