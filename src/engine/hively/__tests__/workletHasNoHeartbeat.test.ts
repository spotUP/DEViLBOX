import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Hively worklet posted a 'render player=N ... max=...' debug line once a
 * second for the life of every instrument player, idle or not, and the engine
 * surfaced each as console.warn. Hundreds of lines in every log the owner
 * pasted on 2026-09-23, and nothing in them ever changed. Events (createPlayer,
 * noteOn) still announce themselves; a heartbeat is not an event.
 */
const WORKLET = readFileSync(join(process.cwd(), 'public/hively/Hively.worklet.js'), 'utf-8');

describe('the Hively worklet has no render heartbeat', () => {
  it('never posts a periodic render line', () => {
    expect(WORKLET).not.toContain("'render player='");
    expect(WORKLET).not.toContain('_playerDbgCount');
  });

  it('still announces player creation and note-on, which are events', () => {
    expect(WORKLET).toContain("'createPlayer handle='");
    expect(WORKLET).toContain("'noteOn handle='");
  });
});
