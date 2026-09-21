/**
 * The master insert must never be the ONLY route to the destination.
 *
 * `wireMasterInsert` cuts the direct `source -> dest` connection and puts the
 * bus in the middle. Every path that abandons that arrangement has to put the
 * direct connection back, or the mix reaches the speakers only for as long as
 * the bus keeps passing audio.
 *
 * It did not. `unwireMasterInsert` clears `masterInsertActive` and nulls its
 * source/dest fields immediately, then defers the graph work by 15 ms — and its
 * own early return read that flag as the authority on whether the graph was
 * spliced. Anything landing in that window (a second unwire, the bus being
 * disabled, dispose cancelling the pending timer) returned without restoring
 * anything, and the direct path was gone for the rest of the session.
 *
 * Measured live 2026-09-21 on jennipha.ahx and amanda.ahx:
 *
 *   dub bus ON  -> master carries only what the bus itself produces
 *                  (reported as "the dub effects but not the song")
 *   dub bus OFF -> rmsAvg 0, silent, and stop/play could not repair it
 *
 * After the fix, the same sequence measured 0.0909 with the bus off, and four
 * rapid enable/disable toggles left it at 0.1059.
 *
 * The invariant is structural, so it is asserted on the source: the graph's own
 * record (`masterInsertSplice`) is what every teardown consults, never the
 * `masterInsertActive` flag. Tone's AudioContext cannot be spun up in happy-dom
 * (no AudioWorklet registry), same reason as the G15 guard beside this file.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, '..', 'DubBus.ts'), 'utf8');

/** A method body, from its signature to the closing brace at method indent. */
function methodBody(signature: string): string {
  const at = SOURCE.indexOf(signature);
  expect(at, `${signature} not found`).toBeGreaterThan(-1);
  const end = SOURCE.indexOf('\n  }\n', at);
  return end < 0 ? SOURCE.slice(at) : SOURCE.slice(at, end);
}

describe('the direct master path is always restored', () => {
  it('keeps the splice as a record of the GRAPH, not of the active flag', () => {
    expect(SOURCE).toContain('private masterInsertSplice:');
  });

  it('has one restorer, and it reconnects source to dest', () => {
    const body = methodBody('private _restoreMasterInsertPassthrough(): void {');
    expect(body).toContain('source.connect(dest)');
    // Idempotent: nothing to do when the graph is already whole.
    expect(body).toContain('if (!splice) return;');
    // Cleared before the work, so a re-entrant call cannot double-restore.
    expect(body.indexOf('this.masterInsertSplice = null'))
      .toBeLessThan(body.indexOf('source.connect(dest)'));
  });

  it('records the splice at the moment the graph is cut over', () => {
    const body = methodBody('async wireMasterInsert(');
    expect(body).toContain('this.masterInsertSplice = { source, dest };');
    // Recorded with the connect, not somewhere after the settings writes that
    // follow it — a throw in between must still leave the graph recoverable.
    expect(body.indexOf('this.masterInsertSplice = { source, dest };'))
      .toBeLessThan(body.indexOf('this.setSettings('));
  });

  it('restores on the early return, before returning', () => {
    const body = methodBody('unwireMasterInsert(): void {');
    const guard = body.indexOf('if (!this.masterInsertActive');
    const restore = body.indexOf('this._restoreMasterInsertPassthrough()');
    expect(guard).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(guard);
    // The restore has to be inside the guard block, ahead of its `return`.
    expect(restore).toBeLessThan(body.indexOf('return;', guard));
  });

  it('restores from the deferred rewire', () => {
    const body = methodBody('unwireMasterInsert(): void {');
    const timer = body.indexOf('this.masterInsertPending = setTimeout(');
    expect(timer).toBeGreaterThan(-1);
    expect(body.indexOf('this._restoreMasterInsertPassthrough()', timer))
      .toBeGreaterThan(timer);
  });

  it('restores when a re-wire cancels a pending one', () => {
    const body = methodBody('async wireMasterInsert(');
    const cancel = body.indexOf('clearTimeout(this.masterInsertPending)');
    expect(cancel).toBeGreaterThan(-1);
    expect(body.indexOf('this._restoreMasterInsertPassthrough()', cancel))
      .toBeGreaterThan(cancel);
  });

  it('restores when wiring itself fails', () => {
    const body = methodBody('async wireMasterInsert(');
    const at = body.indexOf('wireMasterInsert failed, restoring passthrough');
    expect(at).toBeGreaterThan(-1);
    expect(body.indexOf('this._restoreMasterInsertPassthrough()', at)).toBeGreaterThan(at);
  });

  it('restores on dispose instead of only cancelling the timer', () => {
    const body = methodBody('dispose(): void {');
    const cancel = body.indexOf('clearTimeout(this.masterInsertPending)');
    expect(cancel).toBeGreaterThan(-1);
    // Cancelling alone leaves the graph spliced through a bus that is going
    // away, which is the state that produced silence nothing could repair.
    expect(body.indexOf('this._restoreMasterInsertPassthrough()', cancel))
      .toBeGreaterThan(cancel);
  });

  it('leaves no teardown reconnecting the graph by hand', () => {
    // Every path goes through the one restorer. A hand-rolled
    // disconnect/reconnect is how the paths drifted apart in the first place.
    const hand = SOURCE.match(/try \{ source\.connect\(dest\); \} catch/g) ?? [];
    expect(hand.length, 'hand-rolled passthrough restore outside the restorer').toBe(1);
  });
});
