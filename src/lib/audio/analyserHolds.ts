/**
 * Who holds a shared tap (the master analysers). The tap connects on the
 * first hold and disconnects when the last holder lets go; one visualizer's
 * unmount used to disconnect it for every other (2026-10-05: opening the dub
 * bus mounted and unmounted strip visualizers and the scope view went flat).
 */
export class AnalyserHolds {
  private holders = new Set<object | string>();

  /** Add `owner`; true when this is the first hold (connect now). */
  acquire(owner: object | string): boolean {
    const first = this.holders.size === 0;
    this.holders.add(owner);
    return first;
  }

  /** Drop `owner`; true when nobody holds it any more (disconnect now). */
  release(owner: object | string): boolean {
    if (!this.holders.delete(owner)) return false;
    return this.holders.size === 0;
  }

  get held(): boolean { return this.holders.size > 0; }
}
