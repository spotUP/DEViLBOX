/**
 * AudioInputManager — Audio input device enumeration, routing, and recording.
 *
 * Provides:
 * - Input device enumeration and selection
 * - Live monitoring (input → output with configurable gain)
 * - Audio recording to buffer (capture between arm/disarm)
 * - Input level metering
 *
 * Usage:
 *   const mgr = getAudioInputManager();
 *   await mgr.init();
 *   const devices = await mgr.getInputDevices();
 *   await mgr.selectDevice(devices[0].deviceId);
 *   mgr.setMonitoring(true);
 *   mgr.startRecording();
 *   // ... user plays along ...
 *   const buffer = mgr.stopRecording();
 *   // buffer is an AudioBuffer ready to be used as a sample instrument
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

class AudioInputManager {
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private inputGain: GainNode;
  private monitorGain: GainNode;
  private analyser: AnalyserNode;
  private isRecording = false;
  private recorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private audioContext: AudioContext;
  private effectsDestination: MediaStreamAudioDestinationNode | null = null;
  private effectsConnected = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.inputGain = this.audioContext.createGain();
    this.inputGain.gain.value = 1.0;
    this.monitorGain = this.audioContext.createGain();
    this.monitorGain.gain.value = 0; // Monitoring off by default
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;

    // Route: inputGain → analyser (for metering)
    //        inputGain → monitorGain → destination (when monitoring on)
    this.inputGain.connect(this.analyser);
    this.inputGain.connect(this.monitorGain);
  }

  /**
   * Get the input gain node for external routing (e.g., to effects chain).
   */
  getInputNode(): GainNode {
    return this.inputGain;
  }

  /**
   * Get available audio input devices.
   */
  async getInputDevices(): Promise<AudioInputDevice[]> {
    try {
      // Request permission first (needed to get labels)
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Input ${d.deviceId.slice(0, 8)}`,
          groupId: d.groupId,
        }));
    } catch (err) {
      console.error('[AudioInputManager] Failed to enumerate devices:', err);
      return [];
    }
  }

  /**
   * Select and connect an audio input device.
   */
  async selectDevice(deviceId?: string): Promise<boolean> {
    // Stop existing stream
    this.disconnect();

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false, // Disabled for music recording
          noiseSuppression: false,
          autoGainControl: false,
        },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.sourceNode.connect(this.inputGain);

      console.log('[AudioInputManager] Connected to input device');
      return true;
    } catch (err) {
      console.error('[AudioInputManager] Failed to connect device:', err);
      return false;
    }
  }

  /**
   * Set input gain level (0-2, 1.0 = unity).
   */
  setInputGain(gain: number): void {
    this.inputGain.gain.setValueAtTime(
      Math.max(0, Math.min(2, gain)),
      this.audioContext.currentTime
    );
  }

  /**
   * Enable/disable live monitoring (hear input through speakers).
   */
  setMonitoring(enabled: boolean): void {
    void enabled; // tracked via gain value
    if (enabled) {
      this.monitorGain.gain.setValueAtTime(1, this.audioContext.currentTime);
      this.monitorGain.connect(this.audioContext.destination);
    } else {
      this.monitorGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      try { this.monitorGain.disconnect(this.audioContext.destination); } catch { /* ok */ }
    }
  }

  /**
   * Get current input level (RMS, 0-1).
   */
  getInputLevel(): number {
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }

  /**
   * Route mic input through ToneEngine's master effects chain.
   * Call before startRecording() to record with effects.
   */
  async enableEffectsRouting(): Promise<void> {
    if (this.effectsConnected) return;
    try {
      const { getToneEngine } = await import('./ToneEngine');
      const engine = getToneEngine();
      // Route mic → master effects input (same path as synth audio)
      this.inputGain.connect(engine.masterEffectsInput.input as unknown as AudioNode);
      // Create a destination node after the master channel to capture processed audio
      this.effectsDestination = this.audioContext.createMediaStreamDestination();
      // Tap the master channel output for recording
      engine.masterChannel.connect(this.effectsDestination);
      this.effectsConnected = true;
      console.log('[AudioInputManager] Effects routing enabled');
    } catch (err) {
      console.error('[AudioInputManager] Failed to enable effects routing:', err);
    }
  }

  /**
   * Disconnect mic from effects chain.
   */
  async disableEffectsRouting(): Promise<void> {
    if (!this.effectsConnected) return;
    try {
      const { getToneEngine } = await import('./ToneEngine');
      const engine = getToneEngine();
      this.inputGain.disconnect(engine.masterEffectsInput.input as unknown as AudioNode);
      if (this.effectsDestination) {
        try { engine.masterChannel.disconnect(this.effectsDestination); } catch { /* ok */ }
        this.effectsDestination = null;
      }
      this.effectsConnected = false;
      console.log('[AudioInputManager] Effects routing disabled');
    } catch { /* ok */ }
  }

  /** Whether effects routing is active */
  isEffectsRouted(): boolean {
    return this.effectsConnected;
  }

  /**
   * Start recording audio input.
   * @param withEffects If true, records from the effects chain output instead of raw mic
   */
  startRecording(withEffects = false): void {
    if (!this.stream || this.isRecording) return;

    this.recordedChunks = [];

    // Choose recording source: raw mic stream or effects-processed stream
    const recordStream = (withEffects && this.effectsDestination)
      ? this.effectsDestination.stream
      : this.stream;

    this.recorder = new MediaRecorder(recordStream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.recorder.start(100); // Collect data every 100ms
    this.isRecording = true;
    console.log(`[AudioInputManager] Recording started ${withEffects ? '(with effects)' : '(dry)'}`);
  }

  /**
   * Stop recording and return the recorded audio as an AudioBuffer.
   */
  async stopRecording(): Promise<AudioBuffer | null> {
    if (!this.recorder || !this.isRecording) return null;

    return new Promise((resolve) => {
      this.recorder!.onstop = async () => {
        this.isRecording = false;

        if (this.recordedChunks.length === 0) {
          resolve(null);
          return;
        }

        try {
          const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
          console.log(`[AudioInputManager] Recorded ${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.numberOfChannels}ch`);
          resolve(audioBuffer);
        } catch (err) {
          console.error('[AudioInputManager] Failed to decode recording:', err);
          resolve(null);
        }
      };

      this.recorder!.stop();
    });
  }

  /**
   * Check if currently recording.
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Check if a device is connected.
   */
  isConnected(): boolean {
    return this.sourceNode !== null;
  }

  /**
   * Disconnect current input device.
   */
  disconnect(): void {
    if (this.recorder && this.isRecording) {
      this.recorder.stop();
      this.isRecording = false;
    }
    // Clean up effects routing
    if (this.effectsConnected) {
      this.disableEffectsRouting();
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.setMonitoring(false);
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.disconnect();
    this.inputGain.disconnect();
    this.monitorGain.disconnect();
    this.analyser.disconnect();
  }
}

// Singleton
let instance: AudioInputManager | null = null;

export function getAudioInputManager(): AudioInputManager {
  if (!instance) {
    instance = new AudioInputManager();
  }
  return instance;
}
