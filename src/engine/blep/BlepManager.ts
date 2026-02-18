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
   *
   * Note: This is complex because we're mixing Tone.js and native AudioNodes.
   * For now, BLEP is disabled by default to avoid connection issues.
   * A future implementation could use Tone.js's native node wrapping.
   */
  connect(source: Tone.ToneAudioNode, destination: Tone.ToneAudioNode): void {
    // For now, always bypass BLEP to avoid connection errors
    // TODO: Properly wrap AudioWorkletNode in Tone.js ToneAudioNode
    try {
      source.connect(destination);
    } catch (e) {
      // Ignore if already connected
    }

    console.warn('BLEP audio routing disabled - requires Tone.js native node wrapping');
    return;

    /* Disabled until proper Tone.js integration
    if (!this.workletNode || !this.initialized) {
      console.warn('BLEP not initialized, bypassing');
      try {
        source.connect(destination);
      } catch (e) {
        // Ignore if already connected
      }
      return;
    }

    if (this.enabled) {
      // Route through BLEP: source -> worklet -> destination
      try {
        source.disconnect(destination);
      } catch (e) {
        // Ignore if not connected
      }

      // This needs proper Tone.js node wrapping
      source.connect(this.workletNode as any);
      this.workletNode.connect(destination as any);
    } else {
      // Bypass BLEP: source -> destination directly
      try {
        source.connect(destination);
      } catch (e) {
        // Ignore if already connected
      }
    }
    */
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
