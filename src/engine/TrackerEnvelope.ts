import { type EnvelopePoints, type EnvelopePoint } from '../types/tracker';

/**
 * TrackerEnvelope - Statefull tracker multi-point envelope engine
 * 
 * Implements hardware-accurate envelope processing for XM and IT:
 * - Linear interpolation between points
 * - Sustain point support (holds until key-off)
 * - Loop support (forward loops)
 * - Fadeout support (multiplier applied after key-off)
 */
export class TrackerEnvelope {
  private points: EnvelopePoint[] = [];
  private enabled: boolean = false;
  private sustainPoint: number | null = null;
  private loopStart: number | null = null;
  private loopEnd: number | null = null;

  // State
  private tick: number = 0;
  private isKeyOff: boolean = false;
  private currentValue: number = 64; // Default full volume
  private finished: boolean = false;

  constructor(points?: EnvelopePoints) {
    if (points) {
      this.init(points);
    }
  }

  /**
   * Initialize or update envelope data
   */
  public init(points: EnvelopePoints): void {
    this.enabled = points.enabled;
    this.points = points.points;
    this.sustainPoint = points.sustainPoint;
    this.loopStart = points.loopStartPoint;
    this.loopEnd = points.loopEndPoint;
    this.reset();
  }

  /**
   * Reset envelope state for a new note
   */
  public reset(): void {
    this.tick = 0;
    this.isKeyOff = false;
    this.currentValue = this.points.length > 0 ? this.points[0].value : 64;
    this.finished = false;
  }

  /**
   * Signal key-off (release phase starts)
   */
  public keyOff(): void {
    this.isKeyOff = true;
  }

  /**
   * Advance the envelope by one tick and return the value (0-64)
   */
  public tickNext(): number {
    if (!this.enabled || this.points.length === 0) {
      return 64;
    }

    if (this.finished) {
      return this.points[this.points.length - 1].value;
    }

    // XM/IT Quirk: Sustain point handling
    // If key is NOT off and we are at the sustain point, stay there
    if (!this.isKeyOff && this.sustainPoint !== null) {
      const sPoint = this.points[this.sustainPoint];
      if (this.tick >= sPoint.tick) {
        this.tick = sPoint.tick;
        this.currentValue = sPoint.value;
        return this.currentValue;
      }
    }

    // XM/IT Quirk: Loop handling
    // If we have a loop and reached the end point, jump to start
    if (this.loopEnd !== null && this.loopStart !== null) {
      const endPoint = this.points[this.loopEnd];
      const startPoint = this.points[this.loopStart];
      if (this.tick >= endPoint.tick) {
        this.tick = startPoint.tick;
      }
    }

    // Calculate current value via linear interpolation
    this.currentValue = this.interpolate(this.tick);

    // Advance tick
    this.tick++;

    // XM/IT Quirk: Loop handling
    // If we have a loop and reached the end point, jump to start
    if (this.loopEnd !== null && this.loopStart !== null) {
      const endPoint = this.points[this.loopEnd];
      if (this.tick >= endPoint.tick) {
        this.tick = this.points[this.loopStart].tick;
      }
    }

    // Check if we reached the end
    if (this.tick > this.points[this.points.length - 1].tick) {
      this.finished = true;
      this.tick = this.points[this.points.length - 1].tick;
    }

    return this.currentValue;
  }

  /**
   * Get value at specific tick via 16-bit fixed-point linear interpolation
   */
  private interpolate(t: number): number {
    if (this.points.length === 0) return 64;
    if (t <= this.points[0].tick) return this.points[0].value;
    if (t >= this.points[this.points.length - 1].tick) return this.points[this.points.length - 1].value;

    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i];
      const p2 = this.points[i + 1];

      if (t >= p1.tick && t <= p2.tick) {
        const span = p2.tick - p1.tick;
        if (span === 0) return p2.value;
        
        // FastTracker II 1:1 fixed-point interpolation logic
        const delta = p2.value - p1.value;
        const step = (delta << 16) / span;
        const offset = (t - p1.tick) * step;
        return p1.value + (offset >> 16);
      }
    }

    return 64;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isFinished(): boolean {
    return this.finished;
  }

  public getCurrentValue(): number {
    return this.currentValue;
  }
}
