/**
 * BLEP Manager
 *
 * Manages the BLEP AudioWorklet for band-limited synthesis.
 * Integrates with ToneEngine to provide global BLEP processing.
 */

import * as Tone from 'tone';

export class BlepManager {
  private workletNode: AudioWorkletNode | null = null;
  private enabled = false;
  private initialized = false;

  /**
   * Initialize BLEP processing
   */
  async init(): Promise<void> {
    if (this.initialized) {
      console.log('BLEP already initialized');
      return;
    }

    try {
      const audioContext = Tone.getContext().rawContext as AudioContext;

      // Load the worklet module
      await audioContext.audioWorklet.addModule('/blep/blep-processor.worklet.js');

      // Create the worklet node
      this.workletNode = new AudioWorkletNode(audioContext, 'blep-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 2, // Stereo
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers'
      });

      this.initialized = true;
      console.log('BLEP Manager initialized');
    } catch (error) {
      console.error('Failed to initialize BLEP:', error);
      throw error;
    }
  }

  /**
   * Connect BLEP processing to audio chain
   * Insert BLEP between source and destination
   */
  connect(source: Tone.ToneAudioNode, destination: Tone.ToneAudioNode): void {
    if (!this.workletNode || !this.initialized) {
      console.warn('BLEP not initialized, bypassing');
      source.connect(destination);
      return;
    }

    if (this.enabled) {
      // Route through BLEP: source -> worklet -> destination
      source.disconnect(destination);
      source.connect(this.workletNode as any);
      (this.workletNode as any).connect(destination);
    } else {
      // Bypass BLEP: source -> destination directly
      if (this.workletNode) {
        try {
          source.disconnect(this.workletNode as any);
          (this.workletNode as any).disconnect(destination);
        } catch (e) {
          // Ignore disconnect errors if already disconnected
        }
      }
      source.connect(destination);
    }
  }

  /**
   * Enable/disable BLEP processing
   */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;

    this.enabled = enabled;

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setEnabled',
        value: enabled
      });
    }

    console.log(`BLEP ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Reset BLEP state (clear buffers)
   */
  reset(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'reset' });
    }
  }

  /**
   * Get the worklet node for manual connection
   */
  getNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  /**
   * Check if BLEP is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if BLEP is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Dispose BLEP resources
   */
  dispose(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.initialized = false;
    this.enabled = false;
  }
}
