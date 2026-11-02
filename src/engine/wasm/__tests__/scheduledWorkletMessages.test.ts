/**
 * SYNTH-DROP-TIME: a note scheduled for audio time T must reach the engine worklet stamped with T, and the worklet
 * must apply it at T, not on arrival. Two halves, one chain:
 *   1. a synth's triggerAttack/triggerRelease(time) puts `atTime: time` on the engine message (spy on sendMessage);
 *   2. public/worklets/scheduled-messages.js holds a message carrying `atTime` until the render quantum at that time.
 * Sentinel: the processor's own handler records the audio-clock time each message is applied at.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { FCSynth } from '../../fc/FCSynth';

type Msg = { type: string; atTime?: number };

function loadScheduler(): { Proc: new () => { port: { onmessage: ((e: { data: Msg }) => void) | null }; process: () => boolean }; setNow: (t: number) => void } {
  const src = readFileSync('public/worklets/scheduled-messages.js', 'utf8');
  const g = globalThis as Record<string, unknown>;
  delete g.__devilboxScheduledMessages;
  let registered: unknown = null;
  g.registerProcessor = (_n: string, c: unknown) => { registered = c; };
  g.currentTime = 0;
  // eslint-disable-next-line no-new-func
  new Function(src)();
  // Like the real MessagePort: onmessage is a prototype accessor; the browser delivers to the stored slot.
  class FakePort {
    slot: ((e: { data: Msg }) => void) | null = null;
    get onmessage() { return this.slot; }
    set onmessage(fn: ((e: { data: Msg }) => void) | null) { this.slot = fn; }
  }
  class Base {
    port = new FakePort();
    process(): boolean { return true; }
  }
  // The engine worklets set port.onmessage in their own constructor, as here.
  class Engine extends Base {
    applied: Array<{ type: string; at: number }> = [];
    constructor() {
      super();
      this.port.onmessage = (e) => this.applied.push({ type: e.data.type, at: g.currentTime as number });
    }
  }
  (g.registerProcessor as (n: string, c: unknown) => void)('x', Engine);
  return { Proc: registered as never, setNow: (t) => { g.currentTime = t; } };
}

describe('scheduled worklet messages', () => {
  beforeEach(() => { delete (globalThis as Record<string, unknown>).__devilboxScheduledMessages; });

  it('worklet applies a message at its atTime, in order, and passes untimed ones straight through', () => {
    const { Proc, setNow } = loadScheduler();
    const p = new Proc() as unknown as { port: { onmessage: ((e: { data: Msg }) => void) | null }; process: () => boolean; applied: Array<{ type: string; at: number }> };
    // The port delivers by calling the (wrapped) slot the processor installed.
    const post = (m: Msg) => (p.port as unknown as { slot: (e: { data: Msg }) => void }).slot({ data: m });
    post({ type: 'now' });
    post({ type: 'noteOn', atTime: 1.0 });
    post({ type: 'noteOff', atTime: 1.5 });
    post({ type: 'afterTimed' });
    expect(p.applied.map((a) => a.type)).toEqual(['now']);
    setNow(0.9); p.process();
    expect(p.applied.length).toBe(1);
    setNow(1.0); p.process();
    expect(p.applied.map((a) => a.type)).toEqual(['now', 'noteOn']);
    setNow(1.6); p.process();
    expect(p.applied.map((a) => a.type)).toEqual(['now', 'noteOn', 'noteOff', 'afterTimed']);
  });

  it('FCSynth hands its scheduled time to the engine message', () => {
    const sent: Array<Record<string, unknown>> = [];
    const synth = Object.create(FCSynth.prototype) as FCSynth;
    const priv = synth as unknown as Record<string, unknown>;
    priv['engine'] = { sendMessage: (m: Record<string, unknown>) => { sent.push(m); } };
    priv['_playerHandle'] = 3;
    priv['_disposed'] = false;
    synth.triggerAttack('C-3', 12.5, 1);
    synth.triggerRelease('C-3', 13.25);
    expect(sent.map((m) => [m.type, m.atTime])).toEqual([['noteOn', 12.5], ['noteOff', 13.25]]);
  });
});
