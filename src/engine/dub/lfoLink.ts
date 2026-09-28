/**
 * An LFO wired to the parameter it modulates only while its feature is on.
 *
 * An OscillatorNode cannot be paused, and one that reaches the output (here
 * through a DelayNode's delayTime) is computed every quantum along with the
 * node it drives. The dub bus had six such LFOs for features at wet 0 - master
 * chorus L/R, comb sweep, three tape-stack wows - running with the song
 * stopped (2026-09-28). Unlinked, the oscillator has no path to the output and
 * Chrome does not pull it; the parameter rests at its own value.
 */
export class LfoLink {
  private linked = false;
  private release: ReturnType<typeof setTimeout> | null = null;

  private readonly lfoOut: AudioNode;
  private readonly param: AudioParam;

  constructor(lfoOut: AudioNode, param: AudioParam) {
    this.lfoOut = lfoOut;
    this.param = param;
  }

  /**
   * Link now, or unlink `releaseMs` later (after the feature's own fade), so
   * turning off never cuts the modulation under an audible tail.
   */
  set(engaged: boolean, releaseMs = 300): void {
    if (engaged) {
      if (this.release) { clearTimeout(this.release); this.release = null; }
      if (!this.linked) { this.lfoOut.connect(this.param); this.linked = true; }
      return;
    }
    if (!this.linked || this.release) return;
    this.release = setTimeout(() => {
      this.release = null;
      try { this.lfoOut.disconnect(this.param); } catch { /* already gone */ }
      this.linked = false;
    }, releaseMs);
  }

  get isLinked(): boolean {
    return this.linked;
  }
}
