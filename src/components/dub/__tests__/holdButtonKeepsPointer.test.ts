/**
 * The hold buttons lit for an instant and then went out under the finger.
 *
 * `holdStart` latches the button on pointerdown and `holdEnd` releases it.
 * `holdEnd` also runs on `pointercancel` and `lostpointercapture` — correctly,
 * since those are how a browser revokes a pointer. But nothing stopped the
 * browser revoking it: `.dub-move-button` carried no `touch-action` and no
 * `user-select`, so dragging across a button began a text selection and a
 * touch drag began a scroll. Either fires `pointercancel`. Result: the button
 * lit, the browser cancelled, the hold ended, and the move never sustained.
 *
 * Reported 2026-10-02 as "the echo button and similar buttons behave weird, I
 * can't hold it down and it lights up briefly when I click them".
 *
 * The release wiring itself was already correct — it was hardened on 2026-09-21
 * for the OPPOSITE fault (holds sticking on forever, when an unguarded
 * `releasePointerCapture` threw and skipped `holdEnd`). Two bugs, one pair of
 * pointer-release events, opposite directions.
 *
 * This is a CSS-contract test because the behaviour belongs to the stylesheet:
 * the release logic is not what was wrong, and a test asserting on the
 * holdButtonProps handlers would pass against the broken build.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CSS = readFileSync(resolve(ROOT, 'index.css'), 'utf8');

/** The `.dub-move-button` rule block, so assertions cannot match a neighbour. */
function ruleBody(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `no ${selector} rule in index.css`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf('}', start));
}

describe('hold move buttons keep the pointer', () => {
  it('does not let a touch drag become a scroll gesture', () => {
    // A scroll gesture makes the browser fire pointercancel, which the hold
    // wiring reads as a release — the button unlights while still held.
    expect(ruleBody('.dub-move-button')).toMatch(/touch-action:\s*none/);
  });

  it('does not let a drag become a text selection', () => {
    expect(ruleBody('.dub-move-button')).toMatch(/user-select:\s*none/);
  });

  it('suppresses the iOS long-press callout, which also steals the pointer', () => {
    expect(ruleBody('.dub-move-button')).toMatch(/-webkit-touch-callout:\s*none/);
  });

  it('still declares the rule before the hover rule that follows it', () => {
    // Guards against the block being pasted inside another rule, where the
    // declarations would silently apply to the wrong selector.
    expect(CSS.indexOf('.dub-move-button {')).toBeLessThan(CSS.indexOf('.dub-move-button:hover'));
  });
});