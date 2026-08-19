/**
 * SpeechChain — sequencing guard for multi-word speech playback.
 *
 * Speech synths play an utterance one word at a time, scheduling the next word on a
 * timer sized to the previous word's duration. Cancelling that needs more than a
 * "currently speaking" flag: when a new utterance starts, the flag is immediately
 * truthy again, so a timer left over from the PREVIOUS utterance happily resumes the
 * old word list on top of the new one — two voices at once, and roughly double
 * amplitude where they overlap.
 *
 * Every step therefore carries the generation its chain began in, and runs only while
 * that generation is still current. `cancel()` bumps the generation AND clears the
 * pending timers, so a stale step can neither fire nor be believed if it does.
 */
export class SpeechChain {
  private generation = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  /**
   * Begin a new utterance. Cancels everything pending and returns the generation
   * token that this utterance's steps must carry.
   */
  begin(): number {
    this.cancel();
    return this.generation;
  }

  /** Whether `generation` is still the active utterance. */
  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  /** Schedule the next step of the chain that began in `generation`. */
  schedule(generation: number, step: () => void, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.isCurrent(generation)) return; // superseded by a newer utterance
      step();
    }, delayMs);
    this.timers.add(timer);
  }

  /** Invalidate the current utterance and drop every pending step. */
  cancel(): void {
    this.generation++;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  /** Pending step count — for tests and diagnostics. */
  get pendingCount(): number {
    return this.timers.size;
  }
}
