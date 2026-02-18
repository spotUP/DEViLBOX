/**
 * Ableton Link Sync - Tempo and transport synchronization
 *
 * Browser-based implementation of Ableton Link-like synchronization.
 * Since Web browsers don't support UDP multicast (required for real Link),
 * we use WebRTC for P2P sync or Web MIDI Clock as an alternative.
 *
 * Features:
 * - Tempo sync (BPM)
 * - Transport sync (play/stop)
 * - Phase alignment (beat/bar position)
 * - Low-latency synchronization
 *
 * Note: This is NOT the official Ableton Link protocol (which requires native UDP),
 * but provides similar functionality using web-compatible technologies.
 */

export interface LinkPeer {
  id: string;
  name: string;
  bpm: number;
  isPlaying: boolean;
  beatPosition: number;  // Current beat (0-based)
  barPosition: number;   // Current bar
  quantum: number;       // Beats per bar (usually 4)
}

export interface LinkState {
  bpm: number;
  isPlaying: boolean;
  beatPosition: number;
  barPosition: number;
  quantum: number;
  phase: number;  // 0-1 within current beat
  peers: LinkPeer[];
}

export type LinkStateCallback = (state: LinkState) => void;

/**
 * Ableton Link-like sync engine
 * Uses Web MIDI Clock for sync with DAWs
 */
export class AbletonLinkSync {
  private bpm: number = 120;
  private isPlaying: boolean = false;
  private quantum: number = 4; // 4/4 time
  private beatPosition: number = 0;
  private phase: number = 0;
  private startTime: number = 0;
  private listeners: Set<LinkStateCallback> = new Set();
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private midiAccess: MIDIAccess | null = null;
  private midiOutputs: MIDIOutput[] = [];
  private animationFrameId: number | null = null;

  constructor() {
    // Try to initialize Web MIDI for sync
    this.initializeMIDI().catch(err => {
      console.warn('[AbletonLink] Web MIDI not available:', err);
    });
  }

  /**
   * Initialize Web MIDI for sending/receiving MIDI Clock
   */
  private async initializeMIDI(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      console.warn('[AbletonLink] Web MIDI API not supported');
      return;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });

      // Get all MIDI outputs for sending clock
      this.midiOutputs = Array.from(this.midiAccess.outputs.values());

      // Listen to MIDI inputs for incoming clock
      this.midiAccess.inputs.forEach((input) => {
        input.onmidimessage = this.handleMIDIMessage.bind(this);
      });

      console.log('[AbletonLink] Web MIDI initialized:', {
        inputs: this.midiAccess.inputs.size,
        outputs: this.midiAccess.outputs.size,
      });
    } catch (error) {
      console.error('[AbletonLink] Failed to initialize MIDI:', error);
    }
  }

  /**
   * Handle incoming MIDI Clock messages
   */
  private handleMIDIMessage(event: MIDIMessageEvent): void {
    const [status] = event.data;

    switch (status) {
      case 0xf8: // MIDI Clock (24 ppqn)
        this.handleMIDIClock();
        break;

      case 0xfa: // Start
        this.handleMIDIStart();
        break;

      case 0xfb: // Continue
        this.handleMIDIContinue();
        break;

      case 0xfc: // Stop
        this.handleMIDIStop();
        break;
    }
  }

  private clockTicks = 0;
  private lastClockTime = 0;

  private handleMIDIClock(): void {
    const now = performance.now();

    // MIDI Clock sends 24 ticks per quarter note
    this.clockTicks++;

    if (this.clockTicks >= 24) {
      this.clockTicks = 0;
      this.beatPosition++;

      // Calculate BPM from clock interval
      if (this.lastClockTime > 0) {
        const interval = (now - this.lastClockTime) / 24; // ms per tick
        const bpm = 60000 / (interval * 24); // Convert to BPM
        this.bpm = Math.round(bpm * 10) / 10; // Round to 1 decimal
      }

      this.lastClockTime = now;
      this.notifyListeners();
    }
  }

  private handleMIDIStart(): void {
    console.log('[AbletonLink] MIDI Start received');
    this.beatPosition = 0;
    this.clockTicks = 0;
    this.start();
  }

  private handleMIDIContinue(): void {
    console.log('[AbletonLink] MIDI Continue received');
    this.start();
  }

  private handleMIDIStop(): void {
    console.log('[AbletonLink] MIDI Stop received');
    this.stop();
  }

  /**
   * Send MIDI Clock to all outputs
   */
  private sendMIDIClock(): void {
    if (this.midiOutputs.length === 0) return;

    // Send MIDI Clock (0xF8) - 24 ppqn (pulses per quarter note)
    const clockMessage = [0xf8];
    this.midiOutputs.forEach((output) => {
      output.send(clockMessage);
    });
  }

  /**
   * Send MIDI Start
   */
  private sendMIDIStart(): void {
    if (this.midiOutputs.length === 0) return;

    const startMessage = [0xfa];
    this.midiOutputs.forEach((output) => {
      output.send(startMessage);
    });
  }

  /**
   * Send MIDI Stop
   */
  private sendMIDIStop(): void {
    if (this.midiOutputs.length === 0) return;

    const stopMessage = [0xfc];
    this.midiOutputs.forEach((output) => {
      output.send(stopMessage);
    });
  }

  /**
   * Start playback and sync
   */
  start(): void {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.startTime = performance.now();

    // Send MIDI Start
    this.sendMIDIStart();

    // Send MIDI Clock at 24 ppqn
    const msPerClock = (60000 / this.bpm) / 24;
    let clockCount = 0;

    this.clockInterval = setInterval(() => {
      this.sendMIDIClock();
      clockCount++;

      // Every 24 clocks = 1 beat
      if (clockCount >= 24) {
        clockCount = 0;
        this.beatPosition++;
      }
    }, msPerClock);

    // Update phase continuously
    this.updatePhase();

    this.notifyListeners();
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (!this.isPlaying) return;

    this.isPlaying = false;

    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Send MIDI Stop
    this.sendMIDIStop();

    this.notifyListeners();
  }

  /**
   * Update phase (position within beat, 0-1)
   */
  private updatePhase = (): void => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const elapsed = now - this.startTime;
    const beatsElapsed = (elapsed / 60000) * this.bpm;
    const currentBeat = Math.floor(beatsElapsed);
    this.phase = beatsElapsed - currentBeat;

    // Update beat position if changed
    if (currentBeat !== this.beatPosition) {
      this.beatPosition = currentBeat;
      this.notifyListeners();
    }

    this.animationFrameId = requestAnimationFrame(this.updatePhase);
  };

  /**
   * Set BPM and sync with peers
   */
  setBPM(bpm: number): void {
    if (bpm < 20 || bpm > 999) {
      console.warn('[AbletonLink] Invalid BPM:', bpm);
      return;
    }

    this.bpm = bpm;

    // Restart clock interval with new tempo
    if (this.isPlaying && this.clockInterval) {
      clearInterval(this.clockInterval);
      const msPerClock = (60000 / this.bpm) / 24;
      let clockCount = 0;

      this.clockInterval = setInterval(() => {
        this.sendMIDIClock();
        clockCount++;
        if (clockCount >= 24) {
          clockCount = 0;
          this.beatPosition++;
        }
      }, msPerClock);
    }

    this.notifyListeners();
  }

  /**
   * Set quantum (beats per bar)
   */
  setQuantum(quantum: number): void {
    this.quantum = quantum;
    this.notifyListeners();
  }

  /**
   * Force sync to beat/bar boundary
   */
  forceBeatAlign(): void {
    this.startTime = performance.now();
    this.beatPosition = Math.floor(this.beatPosition);
    this.phase = 0;
    this.notifyListeners();
  }

  /**
   * Get current Link state
   */
  getState(): LinkState {
    return {
      bpm: this.bpm,
      isPlaying: this.isPlaying,
      beatPosition: this.beatPosition,
      barPosition: Math.floor(this.beatPosition / this.quantum),
      quantum: this.quantum,
      phase: this.phase,
      peers: [], // TODO: WebRTC peer discovery
    };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback: LinkStateCallback): () => void {
    this.listeners.add(callback);
    // Immediately notify with current state
    callback(this.getState());

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach((callback) => {
      callback(state);
    });
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stop();
    this.listeners.clear();

    if (this.midiAccess) {
      this.midiAccess.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
    }
  }
}

/**
 * Singleton instance for global sync
 */
let globalLinkInstance: AbletonLinkSync | null = null;

export function getAbletonLink(): AbletonLinkSync {
  if (!globalLinkInstance) {
    globalLinkInstance = new AbletonLinkSync();
  }
  return globalLinkInstance;
}
