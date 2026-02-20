/**
 * BLEP Manager
 *
 * Manages the BLEP AudioWorklet for band-limited synthesis.
 * Integrates with ToneEngine to provide global BLEP processing.
 *
 * Bridges Tone.js and native Web Audio by using getNativeAudioNode()
 * to unwrap Tone.js wrappers and connect the native AudioWorkletNode.
 */

import * as Tone from 'tone';
import { getNativeAudioNode, getNativeContext } from '@/utils/audio-context';

export class BlepManager {
  private workletNode: AudioWorkletNode | null = null;
  private enabled = false;
  private initialized = false;

  // Track native nodes for clean disconnection
  private connectedNativeSource: AudioNode | null = null;
  private connectedNativeDest: AudioNode | null = null;

  /**
   * Initialize BLEP processing
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const audioContext = getNativeContext(Tone.getContext());

      // Load the worklet module
      await audioContext.audioWorklet.addModule('/blep/blep-processor.worklet.js');

      // Create the worklet node on the native context
      this.workletNode = new AudioWorkletNode(audioContext, 'blep-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers'
      });

      this.initialized = true;
      console.log('[BLEP] Initialized');
    } catch (error) {
      console.error('[BLEP] Init failed:', error);
      throw error;
    }
  }

  /**
   * Connect BLEP processing between source and destination.
   *
   * When enabled: unwraps Tone.js nodes to native AudioNodes and routes
   *   nativeSource → workletNode → nativeDestination
   * When disabled: connects via Tone.js directly (source → destination)
   */
  connect(source: Tone.ToneAudioNode, destination: Tone.ToneAudioNode): void {
    // Disconnect any previous native BLEP routing
    this.disconnectNative();

    if (!this.workletNode || !this.initialized || !this.enabled) {
      // Bypass: direct Tone.js connection
      try {
        source.connect(destination);
      } catch {
        // Ignore if already connected
      }
      return;
    }

    // Unwrap Tone.js nodes to get real native AudioNodes
    const nativeSource = getNativeAudioNode(source);
    const nativeDest = getNativeAudioNode(destination);

    if (!nativeSource || !nativeDest) {
      console.warn('[BLEP] Could not unwrap native audio nodes, bypassing');
      try {
        source.connect(destination);
      } catch {
        // Ignore if already connected
      }
      return;
    }

    // Route through BLEP: nativeSource → workletNode → nativeDestination
    try {
      nativeSource.connect(this.workletNode);
      this.workletNode.connect(nativeDest);

      // Track for later disconnection
      this.connectedNativeSource = nativeSource;
      this.connectedNativeDest = nativeDest;

      console.log('[BLEP] Audio chain connected');
    } catch (error) {
      console.warn('[BLEP] Native connection failed, falling back to bypass:', error);
      this.disconnectNative();
      try {
        source.connect(destination);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Disconnect native BLEP routing (worklet from source/destination)
   */
  private disconnectNative(): void {
    if (!this.workletNode) return;

    if (this.connectedNativeSource) {
      try {
        this.connectedNativeSource.disconnect(this.workletNode);
      } catch {
        // Not connected
      }
      this.connectedNativeSource = null;
    }

    if (this.connectedNativeDest) {
      try {
        this.workletNode.disconnect(this.connectedNativeDest);
      } catch {
        // Not connected
      }
      this.connectedNativeDest = null;
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

    console.log(`[BLEP] ${enabled ? 'Enabled' : 'Disabled'}`);
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

  isInitialized(): boolean {
    return this.initialized;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Dispose BLEP resources
   */
  dispose(): void {
    this.disconnectNative();
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.initialized = false;
    this.enabled = false;
  }
}
