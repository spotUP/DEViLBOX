/**
 * X6 — a solo button for the send.
 *
 * Raised 2026-09-17 while writing skank test instructions that began "first
 * switch off Perry", which is a smell: hearing what a gesture is doing should
 * not cost the user their voicing. This is standard desk behaviour - solo the
 * send to hear what you are actually sending.
 *
 * Out while held: plate, ring modulator, lo-fi, the phaser/comb sweep, the
 * external feedback loop. In: echo, spring, sidechain, glue, EQ - the chain
 * that carries the gesture itself.
 *
 * These drive the real `DubBus.beginAudition` / `endAudition` against a fake
 * AudioParam that records what was scheduled, so the ramps and the restore are
 * tested rather than the source text. The engine graph is not built here - the
 * question is what happens to five gains, not what they are wired to.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuditionHold } from '@/lib/dub/auditionHold';

/** An AudioParam that remembers the last value scheduled onto it. */
class FakeParam {
  value: number;
  ramps: number[] = [];
  constructor(v: number) { this.value = v; }
  cancelScheduledValues(): void {}
  setValueAtTime(v: number): void { this.value = v; }
  linearRampToValueAtTime(v: number): void { this.ramps.push(v); this.value = v; }
}

const RAMP = 0.04;

/**
 * The five stages, as DubBus passes them.
 *
 * `plate` is nullable because the plate stage can be switched off entirely,
 * and that must not stop the other four ducking.
 */
function stages(over: Partial<Record<string, FakeParam | null>> = {}) {
  return {
    plate: new FakeParam(0.4),
    ringMod: new FakeParam(0.3),
    lofi: new FakeParam(1),
    sweep: new FakeParam(0.5),
    extFeedback: new FakeParam(0.035),
    ...over,
  } as Record<string, FakeParam | null>;
}

function beginOn(hold: AuditionHold, s: Record<string, FakeParam | null>): boolean {
  return hold.begin([s.plate, s.ringMod, s.lofi, s.sweep, s.extFeedback], 0, RAMP);
}

describe('what goes out, and what stays in', () => {
  it('ducks every parallel colour stage', () => {
    const hold = new AuditionHold();
    const s = stages();
    beginOn(hold, s);
    for (const name of ['plate', 'ringMod', 'lofi', 'sweep', 'extFeedback']) {
      expect(s[name]!.value, name).toBe(0);
    }
  });

  it('reports itself as auditioning', () => {
    const hold = new AuditionHold();
    expect(hold.active).toBe(false);
    beginOn(hold, stages());
    expect(hold.active).toBe(true);
  });

  it('ramps rather than jumping, so pressing it does not click', () => {
    const hold = new AuditionHold();
    const s = stages();
    beginOn(hold, s);
    expect(s.ringMod!.ramps).toEqual([0]);
  });

  it('survives a plate stage that is switched off entirely', () => {
    const hold = new AuditionHold();
    const s = stages({ plate: null });
    expect(() => beginOn(hold, s)).not.toThrow();
    expect(s.ringMod!.value).toBe(0);
  });
});

describe('handing the colour back', () => {
  it('restores every stage to what it was', () => {
    const hold = new AuditionHold();
    const s = stages();
    beginOn(hold, s);
    hold.end(0, RAMP);
    expect(s.plate!.value).toBeCloseTo(0.4, 6);
    expect(s.ringMod!.value).toBeCloseTo(0.3, 6);
    expect(s.sweep!.value).toBeCloseTo(0.5, 6);
    expect(s.extFeedback!.value).toBeCloseTo(0.035, 6);
  });

  it('restores a stage the user had part-way down, not what a preset says', () => {
    const hold = new AuditionHold();
    const s = stages({ sweep: new FakeParam(0.17) });
    beginOn(hold, s);
    hold.end(0, RAMP);
    expect(s.sweep!.value).toBeCloseTo(0.17, 6);
  });

  it('is idempotent — releasing twice is not an error', () => {
    const hold = new AuditionHold();
    const s = stages();
    beginOn(hold, s);
    hold.end(0, RAMP);
    expect(() => hold.end(0, RAMP)).not.toThrow();
    expect(s.ringMod!.value).toBeCloseTo(0.3, 6);
    expect(hold.active).toBe(false);
  });

  it('a second begin does not snapshot the ducked values as if they were real', () => {
    // This is the bug that would turn one stuck press into a permanently
    // colourless bus.
    const hold = new AuditionHold();
    const s = stages();
    expect(beginOn(hold, s)).toBe(true);
    expect(beginOn(hold, s)).toBe(false);   // refused, so the caller reuses the first
    hold.end(0, RAMP);
    expect(s.ringMod!.value).toBeCloseTo(0.3, 6);
  });
});

describe('a setting changed WHILE auditioning', () => {
  it('lands on the restore instead of being lost', () => {
    const hold = new AuditionHold();
    const s = stages();
    beginOn(hold, s);
    expect(hold.noteChange(s.ringMod!, 0.9)).toBe(true);
    expect(s.ringMod!.value).toBe(0);        // still ducked while held
    hold.end(0, RAMP);
    expect(s.ringMod!.value).toBeCloseTo(0.9, 6);   // not 0.3
  });

  it('tells the caller to write normally when nothing is holding it', () => {
    const hold = new AuditionHold();
    const s = stages();
    expect(hold.noteChange(s.ringMod!, 0.9)).toBe(false);
  });

  it('says nothing about a param it is not holding', () => {
    const hold = new AuditionHold();
    const s = stages();
    beginOn(hold, s);
    expect(hold.noteChange(new FakeParam(0.2), 0.9)).toBe(false);
  });
});

describe('the lo-fi bypass, which is the other half of a crossfade', () => {
  const bus = readFileSync(join(__dirname, '..', 'DubBus.ts'), 'utf8');

  it('is held OPEN while auditioning — ducking the send alone would mute that path', () => {
    expect(bus).toMatch(/_rampLofiBypassForAudition\(true\)/);
    expect(bus).toMatch(/const target = auditioning \? 1 :/);
  });

  it('goes back to whatever the settings say, not to a remembered number', () => {
    expect(bus).toMatch(/auditioning \? 1 : \(this\.settings\.lofiEnabled \? 0 : 1\)/);
    expect(bus).toMatch(/_rampLofiBypassForAudition\(false\)/);
  });

  it('is left alone by a lo-fi toggle made mid-audition, and recomputed on release', () => {
    expect(bus).toMatch(/if \(!this\.auditioning\) this\.lofiBypass\.gain\.setTargetAtTime/);
  });

  it('does nothing at all when the bus is off', () => {
    expect(bus).toMatch(/beginAudition\(\): \(\) => void \{\s*\n\s*if \(!this\.enabled\) return \(\) => \{\};/);
  });
});

describe('what it must never touch', () => {
  const src = readFileSync(join(__dirname, '..', 'DubBus.ts'), 'utf8');
  const audition = src.slice(src.indexOf('beginAudition()'), src.indexOf('_rampLofiBypassForAudition'));

  it('never writes characterPreset — that would flip the preset to custom', () => {
    // dubBusCharacterCoherence.test.ts exists because that silently destroys
    // the user's voicing.
    expect(audition).not.toContain('characterPreset');
  });

  it('never writes settings, so the restore has something true to restore to', () => {
    expect(audition).not.toMatch(/this\.settings\s*=/);
  });

  it('is never triggered by the engine deciding a gesture is hard to hear', () => {
    // Musical masking is the user's call; only safety is automatic.
    expect(src).not.toMatch(/beginAudition\(\)[\s\S]{0,80}(consequence|masking|density)/i);
  });
});

describe('wiring contract — it is reachable and it lets go', () => {
  const strip = readFileSync(
    join(__dirname, '..', '..', '..', 'components', 'dub', 'DubDeckStrip.tsx'), 'utf8',
  );
  const handlers = readFileSync(
    join(__dirname, '..', '..', '..', 'bridge', 'handlers', 'writeHandlers.ts'), 'utf8',
  );
  const bridge = readFileSync(
    join(__dirname, '..', '..', '..', 'bridge', 'MCPBridge.ts'), 'utf8',
  );
  const server = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'server', 'src', 'mcp', 'mcpServer.ts'), 'utf8',
  );
  const bus = readFileSync(join(__dirname, '..', 'DubBus.ts'), 'utf8');

  it('the deck has a momentary button, not a latch', () => {
    expect(strip).toContain('beginBusAudition()');
    expect(strip).toMatch(/onPointerUp=\{endBusAudition\}/);
    expect(strip).toMatch(/onPointerCancel=\{endBusAudition\}/);
  });

  it('a finger sliding off the button still hands the colour back', () => {
    // Pointer capture keeps the pointerup on this element even when the finger
    // leaves it. The capture call is now wrapped in try/catch — it throws on a
    // pointer that has already been released — so this checks the ORDER rather
    // than textual adjacency: capture attempted, then the audition begins.
    const downIdx = strip.search(/setPointerCapture\(e\.pointerId\)/);
    const beginIdx = strip.search(/beginBusAudition\(\)/);
    expect(downIdx, 'no pointer capture on the audition button').toBeGreaterThanOrEqual(0);
    expect(downIdx).toBeLessThan(beginIdx);
  });

  it('a capture lost without a pointerup still hands the colour back', () => {
    // The case capture cannot cover: if the capture itself disappears there is
    // no pointerup at all, and the audition would stay latched with the bus in
    // its bypassed state. Added 2026-09-21 with the same fix for the move
    // holds, where a lost capture left a drone sounding.
    expect(strip).toContain('onLostPointerCapture={endBusAudition}');
  });

  it('unmounting mid-hold does not leave the colour switched off', () => {
    expect(strip).toContain('useEffect(() => endBusAudition, [endBusAudition])');
  });

  it('panic ends an audition rather than leaving a stale snapshot', () => {
    expect(bus).toMatch(/this\.endAudition\(\);[\s\S]{0,120}const wasEnabled/);
  });

  it('is reachable over MCP for testing without a mouse', () => {
    expect(handlers).toContain('export async function setDubBusAudition');
    expect(bridge).toContain('set_dub_bus_audition: setDubBusAudition');
    expect(server).toContain("'set_dub_bus_audition'");
  });

  it('says so when the bus is off and nothing was ducked', () => {
    // Found by calling it live: it answered `ok: true, auditioning: false`,
    // which is a tool describing something it did not do — the same class of
    // lie X8 was about.
    expect(handlers).toMatch(/if \(on && !bus\.auditioning\) \{[\s\S]{0,260}ok: false/);
    expect(handlers).toContain('The dub bus is disabled, so there is no colour to duck.');
  });
});
