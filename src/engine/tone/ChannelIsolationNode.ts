/**
 * ChannelIsolationNode — A secondary libopenmpt worklet instance that plays
 * ONLY specific channels from the same module, for per-channel effect routing.
 *
 * Architecture:
 *   - Creates a new AudioWorkletNode('libopenmpt-processor') — the processor
 *     is already registered by LibopenmptEngine's init, so this is just a
 *     constructor call (no addModule needed).
 *   - Loads the same module buffer as the main engine.
 *   - Sets mute mask so only the target channels are audible.
 *   - Syncs position (order/row) with the main engine on seek/play events.
 *   - Outputs through a GainNode for routing into an effect chain.
 *
 * Resource cost:
 *   - ~2-4MB WASM heap per instance (libopenmpt is lightweight)
 *   - CPU: negligible (libopenmpt renders in microseconds per 128-sample chunk)
 *   - Memory: module data is copied to the worklet (typically 50KB-2MB)
 */

export class ChannelIsolationNode {
  private workletNode: AudioWorkletNode | null = null;
  private outputGain: GainNode;
  private _disposed = false;
  private _channelMask: number;
  private audioContext: AudioContext;
  private moduleBuffer: ArrayBuffer;

  constructor(
    audioContext: AudioContext,
    moduleBuffer: ArrayBuffer,
    channels: number[],
  ) {
    this.audioContext = audioContext;
    this.moduleBuffer = moduleBuffer;
    // Build mute mask: bit N=1 means channel N is ACTIVE
    this._channelMask = 0;
    for (const ch of channels) {
      this._channelMask |= (1 << ch);
    }

    this.outputGain = audioContext.createGain();
    this.outputGain.gain.value = 1;
  }

  /** Initialize the worklet and start playback. Must be called after constructor. */
  async init(startPosition?: { order: number; row: number }): Promise<boolean> {
    if (this._disposed) return false;

    try {
      this.workletNode = new AudioWorkletNode(this.audioContext, 'libopenmpt-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
    } catch (err) {
      console.warn('[ChannelIsolationNode] Failed to create worklet:', err);
      return false;
    }

    // Suppress position messages from isolation instances (we don't need them)
    this.workletNode.port.onmessage = () => {};

    // Configure: repeat forever, match main engine settings
    this.workletNode.port.postMessage({
      cmd: 'config',
      val: { repeatCount: -1, stereoSeparation: 100, interpolationFilter: 0 },
    });

    // Connect worklet to output gain
    this.workletNode.connect(this.outputGain);

    // Load the module
    this.workletNode.port.postMessage({ cmd: 'play', val: this.moduleBuffer });

    // Set mute mask to only play target channels
    this.workletNode.port.postMessage({ cmd: 'setMuteMask', val: this._channelMask });

    // Seek to match main engine position
    if (startPosition && (startPosition.order > 0 || startPosition.row > 0)) {
      this.workletNode.port.postMessage({
        cmd: 'setOrderRow',
        val: { o: startPosition.order, r: startPosition.row },
      });
    }

    console.log(`[ChannelIsolationNode] Started with mask 0x${this._channelMask.toString(16)} (channels: ${this.getActiveChannels().join(',')})`);
    return true;
  }

  /** The output AudioNode to connect to effects/destinations. */
  get output(): GainNode {
    return this.outputGain;
  }

  /** Get the bitmask of active channels. */
  get channelMask(): number {
    return this._channelMask;
  }

  /** Get list of active channel indices. */
  getActiveChannels(): number[] {
    const channels: number[] = [];
    for (let i = 0; i < 32; i++) {
      if (this._channelMask & (1 << i)) channels.push(i);
    }
    return channels;
  }

  /** Seek to a specific position (forward from main engine on seek events). */
  seekTo(order: number, row: number): void {
    if (this._disposed || !this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'setOrderRow', val: { o: order, r: row } });
  }

  /** Pause playback (forward from main engine). */
  pause(): void {
    if (this._disposed || !this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'pause' });
  }

  /** Resume playback (forward from main engine). */
  unpause(): void {
    if (this._disposed || !this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'unpause' });
  }

  /** Stop and clean up all resources. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ cmd: 'stop' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }

    try { this.outputGain.disconnect(); } catch { /* */ }
  }
}
