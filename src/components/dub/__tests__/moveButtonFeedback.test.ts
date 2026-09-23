/**
 * The move buttons stayed dark while the performer worked.
 *
 * Reported 2026-09-19 with a screenshot of the CLICK / RATE / HOLD / TOGGLE
 * rows: "i see almost no action here".
 *
 * `activeFires` is keyed `moveId:channelId` (or `moveId:g` for a global move),
 * and those rows matched `moveId:g` ONLY. AutoDub fires channel-scoped moves
 * WITH a channel — the journal for that session shows `echoThrow ch2` and
 * `echoThrow ch0`, which key as `echoThrow:2` and `echoThrow:0`. Neither
 * matches `echoThrow:g`, so the Throw button never lit however hard the
 * performer worked. Only the two global moves in that take (`ghostReverb`,
 * `sonarPing`) could light anything at all.
 *
 * A button in those rows IS the move, not the move-on-one-channel, so any
 * channel counts. The per-channel grid below them is different and stays
 * exact: a button for channel 3 must not light because channel 1 fired.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const strip = readFileSync(join(__dirname, '..', 'DubDeckStrip.tsx'), 'utf8');

describe('a move button lights when its move fires on any channel', () => {
  it('has one helper that answers that question', () => {
    expect(strip).toContain('const isMoveFiring = useCallback((moveId: string): boolean =>');
  });

  it('matches on the move, delimited, so one id cannot match another', () => {
    // `echoThrow` must not be lit by a hypothetical `echoThrowLong`.
    expect(strip).toContain('const prefix = `${moveId}:`;');
    expect(strip).toContain('if (key.startsWith(prefix)) return true;');
  });

  it('uses it for all three global rows', () => {
    const uses = strip.match(/isMoveFiring\(m\.moveId\)/g) ?? [];
    expect(uses.length).toBe(3);   // click, hold, toggle
  });

  it('no global row is left matching the global key alone', () => {
    // That was the bug: `${m.moveId}:g` never matches a channel-scoped fire.
    expect(strip).not.toContain('const active = activeFires.has(key);');
    expect(strip).not.toContain('const active = toggled || heldMoves.has(key) || activeFires.has(key);');
  });

  /**
   * The per-channel op buttons went away on 2026-09-23, but the requirement
   * they carried did not: when a move fires on ONE channel, that channel and
   * no other must show it.
   *
   * It moved from the button to the STRIP. This is the risk the design names
   * as fatal if dropped — AutoDub fires per channel, and with one shared op
   * panel the performer's only clue about which channel the machine just hit
   * is the strip lighting up.
   */
  it('lights the channel a move fired on, and only that channel', () => {
    expect(strip).toContain("const channelFiring = CHANNEL_OPS.some(op => activeFires.has(`${op.moveId}:${i}`));");
  });

  it('shows which channel the shared op panel is aimed at', () => {
    // Without this the target is invisible and aiming an op is a guess.
    expect(strip).toContain('const isTarget = isDubTargetChannel(');
  });
});

describe('the feedback still comes from the router', () => {
  it('listens to every fire, whoever made it', () => {
    // The AI's moves reach the deck the same way the user's do — that is the
    // point of subscribing to the router rather than to the buttons.
    expect(strip).toContain('const unsubFire = subscribeDubRouter((ev) => {');
    expect(strip).toContain('const key = `${ev.moveId}:${ev.channelId ?? \'g\'}`;');
  });

  it('expires a one-shot flash and clears a hold on release', () => {
    expect(strip).toContain('}, 400);');
    expect(strip).toContain('const unsubRelease = subscribeDubRelease((ev) => {');
  });
});
