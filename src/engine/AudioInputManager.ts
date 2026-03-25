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
   * Start recording audio input.
   */
  startRecording(): void {
    if (!this.stream || this.isRecording) return;

    this.recordedChunks = [];
    this.recorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.recorder.start(100); // Collect data every 100ms
    this.isRecording = true;
    console.log('[AudioInputManager] Recording started');
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
