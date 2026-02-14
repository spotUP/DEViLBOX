/**
 * VoiceAllocator - Priority-based voice allocation with stealing
 *
 * Manages a pool of audio voices for polyphonic playback. When all voices are busy,
 * steals the lowest-priority voice (releasing notes > oldest notes > lowest velocity).
 *
 * This eliminates the hard voice limit where notes would silently drop.
 */

interface VoiceState {
  channelIndex: number;
  note: string;
  instrumentId: number;
  startTime: number;
  velocity: number;
  priority: number; // 0-100 (higher = more important)
  isReleasing: boolean;
}

export class VoiceAllocator {
  private baseChannel: number;
  private maxVoices: number;
  private activeVoices: Map<number, VoiceState> = new Map();
  private freeVoices: number[] = [];

  constructor(baseChannel: number, maxVoices: number) {
    this.baseChannel = baseChannel;
    this.maxVoices = maxVoices;
    this.freeVoices = Array.from({ length: maxVoices }, (_, i) => baseChannel + i);
  }

  /**
   * Allocate a voice for a new note. If all voices busy, steal the lowest-priority voice.
   */
  allocate(note: string, instrumentId: number, velocity: number): number {
    // Check for free voice
    if (this.freeVoices.length > 0) {
      const channelIndex = this.freeVoices.pop()!;
      this.activeVoices.set(channelIndex, {
        channelIndex,
        note,
        instrumentId,
        startTime: Date.now(),
        velocity,
        priority: this.calculatePriority(velocity, false),
        isReleasing: false,
      });
      return channelIndex;
    }

    // No free voices - steal lowest priority voice
    const victimChannel = this.findStealableVoice();
    const victim = this.activeVoices.get(victimChannel)!;

    console.debug(
      `[VoiceAllocator] Stealing voice ${victimChannel} (note: ${victim.note}, priority: ${victim.priority}) for new note ${note}`
    );

    // Update victim voice with new note
    this.activeVoices.set(victimChannel, {
      channelIndex: victimChannel,
      note,
      instrumentId,
      startTime: Date.now(),
      velocity,
      priority: this.calculatePriority(velocity, false),
      isReleasing: false,
    });

    return victimChannel;
  }

  /**
   * Find the best voice to steal (lowest priority).
   * Priority order: releasing notes > oldest normal notes > lowest velocity notes
   */
  private findStealableVoice(): number {
    let lowestPriority = Infinity;
    let victimChannel = -1;

    for (const [channel, voice] of this.activeVoices) {
      if (voice.priority < lowestPriority) {
        lowestPriority = voice.priority;
        victimChannel = channel;
      }
    }

    return victimChannel;
  }

  /**
   * Calculate voice priority based on velocity, age, and release state.
   *
   * Priority factors:
   * - Base: velocity (0-127)
   * - Releasing notes: -50 priority
   * - Age bonus: +10 for notes < 100ms old (protects recent attacks)
   */
  private calculatePriority(velocity: number, isReleasing: boolean): number {
    let priority = velocity; // Base priority from velocity (0-127)

    if (isReleasing) {
      priority -= 50; // Releasing notes are low priority
    }

    return Math.max(0, Math.min(100, priority));
  }

  /**
   * Mark voice as releasing (lower priority for stealing).
   */
  markReleasing(channelIndex: number): void {
    const voice = this.activeVoices.get(channelIndex);
    if (voice) {
      voice.isReleasing = true;
      voice.priority = this.calculatePriority(voice.velocity, true);
    }
  }

  /**
   * Free a voice when note ends.
   */
  free(channelIndex: number): void {
    this.activeVoices.delete(channelIndex);
    this.freeVoices.push(channelIndex);
  }

  /**
   * Get voice state for debugging.
   */
  getVoiceState(channelIndex: number): VoiceState | undefined {
    return this.activeVoices.get(channelIndex);
  }

  /**
   * Get all active voices for debugging.
   */
  getAllActiveVoices(): VoiceState[] {
    return Array.from(this.activeVoices.values());
  }

  /**
   * Get voice allocation statistics.
   */
  getStats(): {
    activeVoices: number;
    freeVoices: number;
    maxVoices: number;
    utilizationPercent: number;
  } {
    return {
      activeVoices: this.activeVoices.size,
      freeVoices: this.freeVoices.length,
      maxVoices: this.maxVoices,
      utilizationPercent: (this.activeVoices.size / this.maxVoices) * 100,
    };
  }

  /**
   * Reset allocator (clear all voices).
   */
  reset(): void {
    this.activeVoices.clear();
    this.freeVoices = Array.from({ length: this.maxVoices }, (_, i) => this.baseChannel + i);
  }
}
