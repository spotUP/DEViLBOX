import type { TrackerEnvelope } from '@typedefs/instrument';

/**
 * EnvelopeProcessor - 1:1 Implementation of FT2 multi-breakpoint envelopes
 * Handles volume and panning envelopes with sustain and loop points
 */
export class EnvelopeProcessor {
  /**
   * Get value from envelope at a specific time (in ticks)
   * @param envelope The tracker envelope config
   * @param currentTick Current tick position in envelope (0-325+)
   * @returns Value (normalized 0-1)
   */
  public static getValueAtTick(envelope: TrackerEnvelope, currentTick: number): number {
    if (!envelope.enabled || envelope.points.length === 0) return 1.0;

    const points = envelope.points;
    const numPoints = points.length;

    // Boundary check
    if (currentTick <= points[0].x) return points[0].y / 64;
    if (currentTick >= points[numPoints - 1].x && !envelope.loopEnabled) {
      return points[numPoints - 1].y / 64;
    }

    // Find segment
    let p1Idx = 0;
    for (let i = 0; i < numPoints - 1; i++) {
      if (currentTick >= points[i].x && currentTick <= points[i+1].x) {
        p1Idx = i;
        break;
      }
    }

    const p1 = points[p1Idx];
    const p2 = points[p1Idx + 1];

    // Linear interpolation
    const dx = p2.x - p1.x;
    if (dx === 0) return p2.y / 64;

    const fraction = (currentTick - p1.x) / dx;
    const y = p1.y + (p2.y - p1.y) * fraction;

    return y / 64;
  }

  /**
   * Calculate the effective tick after accounting for sustain and loop
   */
  public static getEffectiveTick(
    envelope: TrackerEnvelope, 
    elapsedTicks: number, 
    isNoteReleased: boolean
  ): number {
    if (!envelope.enabled || envelope.points.length === 0) return 0;

    let tick = elapsedTicks;

    // 1. Handle Sustain
    if (envelope.sustainEnabled && !isNoteReleased) {
      const sustainX = envelope.points[envelope.sustainPoint]?.x || 0;
      if (tick >= sustainX) return sustainX;
    }

    // 2. Handle Looping
    if (envelope.loopEnabled) {
      const loopStartX = envelope.points[envelope.loopStart]?.x || 0;
      const loopEndX = envelope.points[envelope.loopEnd]?.x || 0;
      const loopDuration = loopEndX - loopStartX;

      if (loopDuration > 0 && tick >= loopEndX) {
        tick = loopStartX + ((tick - loopStartX) % loopDuration);
      }
    }

    return tick;
  }
}
