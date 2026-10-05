/**
 * The engine side of the whole-song subsong model (lib/tracker/nativeSubsongs):
 * a worklet answers each subsong start with the subsong it started, in order,
 * and the engine reports what plays to the format store.
 */
import { useFormatStore } from '@stores/useFormatStore';
import { normalizeSubsongs, type NativeSubsongEngine } from '@/lib/tracker/nativeSubsongs';

/** A worklet that never answers (disposed mid-request) must not hang the caller. */
const ANSWER_TIMEOUT_MS = 10_000;

/** Start requests waiting for the worklet's answer, oldest first. */
export class SubsongRequests {
  private waiting: Array<(started: number) => void> = [];

  /** Send a start (`post`) and resolve with the subsong the worklet reports, or -1. */
  request(post: () => void): Promise<number> {
    return new Promise<number>((resolve) => {
      let done = false;
      const finish = (n: number): void => { if (!done) { done = true; resolve(n); } };
      this.waiting.push(finish);
      setTimeout(() => {
        const i = this.waiting.indexOf(finish);
        if (i >= 0) this.waiting.splice(i, 1);
        finish(-1);
      }, ANSWER_TIMEOUT_MS);
      post();
    });
  }

  /** The worklet's answer to the oldest request: the subsong started, or -1. */
  settle(started: number): void {
    this.waiting.shift()?.(started);
  }
}

/** The engine's report of what it plays, to the format store (the one subsong model). */
export function reportSubsongs(engine: NativeSubsongEngine, count: number, current: number, names?: string[]): void {
  useFormatStore.getState().reportNativeSubsongs(normalizeSubsongs(engine, count, current, names));
}
