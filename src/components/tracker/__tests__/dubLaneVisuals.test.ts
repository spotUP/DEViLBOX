/**
 * X7 — the dub lane was static, and showed on every pattern.
 *
 * Reported 2026-09-18. Three faults were found; two are fixed here and the
 * third turned out not to be a fault at all.
 *
 *  (a) NOT FOLLOWING SCROLL. One style property with two owners writing two
 *      DIFFERENT quantities. The RAF loop wrote `overlayTop` imperatively;
 *      React re-rendered the same elements declaring `top: scrollYRef.current`,
 *      which holds the CANVAS's `baseY` — a different number, and one the idle
 *      branch never updated at all. Whichever wrote last won. The dub lane lost
 *      most often because `AutomationLane` subscribes to the whole automation
 *      store and so re-renders far more than its neighbours, snapping back to a
 *      stale value each time.
 *
 *  (b) ON EVERY PATTERN. Not a scoping bug. Curves are stored per pattern id
 *      and read back with the same id; what the report describes is pattern
 *      REUSE. In "break the box.mod", loaded to check this, pattern 0 occupies
 *      order positions 0, 1, 2 and 3 — so a move recorded at position 0 plays,
 *      and draws, at all four. Cells behave the same way and always have. The
 *      ledger's suspicion (DubRecorder reading a stale `currentPatternIndex`)
 *      is wrong: playback DOES write the tracker store's index, including on
 *      libopenmpt; it is the TRANSPORT copy that stays at 0.
 *
 *  (c) A RECORDED FADER RIDE DREW AS A STAIRCASE. The lane forced every
 *      `dub.*` curve to steps mode, which is right for a move (on, then off)
 *      and wrong for a send, which replayed as the smooth curve it was.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DUB_NKS_PARAMETERS, DUB_CHANNEL_SEND_PARAM } from '@/midi/performance/synthParameterMaps';

const canvas = readFileSync(join(__dirname, '..', 'PatternEditorCanvas.tsx'), 'utf8');
const lane = readFileSync(join(__dirname, '..', 'AutomationLane.tsx'), 'utf8');
const params = readFileSync(
  join(__dirname, '..', '..', '..', 'hooks', 'useChannelAutomationParams.ts'), 'utf8',
);

describe('X7(a) — the overlays follow scroll because one value owns their top', () => {
  it('renders from the overlay top, not from the canvas baseY', () => {
    // These are different quantities: the canvas draws row r at
    // baseY + (r - vStart) * rh, while an overlay holds row r at r * rh.
    // Matched against style declarations only — the prose explaining the bug
    // names the old ref too, and a test that reads comments proves nothing.
    const styleTops = canvas.match(/^\s*top: \w+Ref\.current/gm) ?? [];
    expect(styleTops.length).toBeGreaterThan(0);
    for (const line of styleTops) expect(line).toContain('overlayTopRef');
  });

  it('positions both overlays from the same value', () => {
    // automation overlay (which also holds the GLOBAL lane) and macro overlay.
    // The separate master dub lane is gone (globalLaneEditing.test.tsx).
    const uses = canvas.match(/top: overlayTopRef\.current/g) ?? [];
    expect(uses.length).toBe(2);
  });

  it('updates that value while idle, which is when a user scrolls by hand', () => {
    // The idle branch previously wrote the DOM and left the ref stale, so
    // every re-render undid the scroll.
    expect(canvas).toMatch(/overlayTopRef\.current = overlayTop;[\s\S]{0,200}macroOverlayRef/);
  });

  it('updates it during playback too', () => {
    expect(canvas).toMatch(/scrollYRef\.current\s+= baseY;\s*\n\s*overlayTopRef\.current\s+= overlayTop;/);
  });

  it('keeps scrollYRef for the canvas, which is what it actually holds', () => {
    expect(canvas).toMatch(/scrollYRef\.current\s+= baseY;/);
  });
});

describe('X7(c) — a send ride draws the way it replays', () => {
  it('draws dub MOVES as steps: a move is on, then off', () => {
    expect(lane).toContain("const effectiveMode = isDubMove ? 'steps' : activeCurve.mode");
  });

  it('exempts the send, which is one continuous movement', () => {
    expect(lane).toContain("!activeCurve.parameter.startsWith('dub.channelSend')");
  });
});

describe('X7 — a recorded ride can actually be selected and seen', () => {
  it('offers the send as an automatable parameter', () => {
    expect(DUB_NKS_PARAMETERS.some(p => p.id === 'dub.channelSend')).toBe(true);
    expect(DUB_CHANNEL_SEND_PARAM.isAutomatable).toBe(true);
  });

  it('names it in full English, as a channel strip would', () => {
    expect(DUB_CHANNEL_SEND_PARAM.name).toBe('Dub Send');
  });

  it('spans the whole fader travel', () => {
    expect(DUB_CHANNEL_SEND_PARAM.min).toBe(0);
    expect(DUB_CHANNEL_SEND_PARAM.max).toBe(1);
  });

  it('does not collide with a bus parameter of the same index', () => {
    const effects = DUB_NKS_PARAMETERS.filter(p => p.page === 0 && p.section === DUB_CHANNEL_SEND_PARAM.section);
    const sameIndex = effects.filter(p => p.index === DUB_CHANNEL_SEND_PARAM.index);
    expect(sameIndex.map(p => p.id)).toEqual(['dub.channelSend']);
  });

  it('is kept off the global lane, where there is no channel to send', () => {
    expect(params).toContain('p.key !== DUB_CHANNEL_SEND_PARAM.id');
  });
});
