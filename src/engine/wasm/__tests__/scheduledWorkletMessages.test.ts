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
import { FredSynth } from '../../fred/FredSynth';
import { HippelCoSoSynth } from '../../hippelcoso/HippelCoSoSynth';
import { OctaMEDSynth } from '../../octamed/OctaMEDSynth';
import { SidMon1Synth } from '../../sidmon1/SidMon1Synth';
import { SidMonSynth } from '../../sidmon/SidMonSynth';
import { TFMXSynth } from '../../tfmx/TFMXSynth';
import { RobHubbardSynth } from '../../robhubbard/RobHubbardSynth';
import { DavidWhittakerSynth } from '../../davidwhittaker/DavidWhittakerSynth';
import { DavidWhittakerEngine } from '../../davidwhittaker/DavidWhittakerEngine';
import { DeltaMusic1Synth } from '../../deltamusic1/DeltaMusic1Synth';
import { DeltaMusic1Engine } from '../../deltamusic1/DeltaMusic1Engine';
import { DeltaMusic2Synth } from '../../deltamusic2/DeltaMusic2Synth';
import { DeltaMusic2Engine } from '../../deltamusic2/DeltaMusic2Engine';
import { DigMugSynth } from '../../digmug/DigMugSynth';
import { DigMugEngine } from '../../digmug/DigMugEngine';
import { InStereo1Synth } from '../../instereo1/InStereo1Synth';
import { InStereo1Engine } from '../../instereo1/InStereo1Engine';
import { InStereo2Synth } from '../../instereo2/InStereo2Synth';
import { InStereo2Engine } from '../../instereo2/InStereo2Engine';
import { SonicArrangerSynth } from '../../sonic-arranger/SonicArrangerSynth';
import { SonicArrangerEngine } from '../../sonic-arranger/SonicArrangerEngine';
import { StartrekkerAMSynth } from '../../startrekker-am/StartrekkerAMSynth';
import { StartrekkerAMEngine } from '../../startrekker-am/StartrekkerAMEngine';
import { FuturePlayerSynth } from '../../futureplayer/FuturePlayerSynth';
import { FuturePlayerEngine } from '../../futureplayer/FuturePlayerEngine';
import { JamCrackerSynth } from '../../jamcracker/JamCrackerSynth';
import { JamCrackerEngine } from '../../jamcracker/JamCrackerEngine';
import { SoundMonSynth } from '../../soundmon/SoundMonSynth';
import { SoundMonEngine } from '../../soundmon/SoundMonEngine';
import { MusicLineSynth } from '../../musicline/MusicLineSynth';
import { MusicLineEngine } from '../../musicline/MusicLineEngine';
import { SunVoxModularSynth } from '../../sunvox-modular/SunVoxModularSynth';
import { SunVoxEngine } from '../../sunvox/SunVoxEngine';

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
    synth.triggerAttack('C3', 12.5, 1);
    synth.triggerRelease('C3', 13.25);
    expect(sent.map((m) => [m.type, m.atTime])).toEqual([['noteOn', 12.5], ['noteOff', 13.25]]);
  });

  // One table, every adopted synth: triggerAttack(T1) / triggerRelease(T2) must put T1 / T2 on the message the engine
  // posts to its worklet, under the key the worklet layer reads (`atTime`; SunVox keeps its own `time`).
  type Row = { name: string; make: () => { synth: { triggerAttack: (n: string, t: number, v: number) => void; triggerRelease: (n: string, t: number) => void }; posted: Array<Record<string, unknown>> }; key?: string };

  // An engine whose own methods run for real and whose worklet port records what it is sent.
  const realEngine = (proto: object, posted: Array<Record<string, unknown>>) => {
    const e = Object.create(proto) as Record<string, unknown>;
    e['workletNode'] = { port: { postMessage: (m: Record<string, unknown>) => { posted.push(m); } } };
    return e;
  };
  // A synth that posts straight through engine.sendMessage (the handle-based players).
  const handleRow = (name: string, Ctor: { prototype: object }, extra: Record<string, unknown> = {}): Row => ({
    name,
    make: () => {
      const posted: Array<Record<string, unknown>> = [];
      const synth = Object.create(Ctor.prototype) as Record<string, unknown>;
      Object.assign(synth, { engine: { sendMessage: (m: Record<string, unknown>) => { posted.push(m); } }, _playerHandle: 3, _disposed: false }, extra);
      return { synth: synth as never, posted };
    },
  });
  const engineRow = (name: string, Ctor: { prototype: object }, Eng: { prototype: object }, extra: Record<string, unknown>, key = 'atTime'): Row => ({
    name,
    key,
    make: () => {
      const posted: Array<Record<string, unknown>> = [];
      const synth = Object.create(Ctor.prototype) as Record<string, unknown>;
      Object.assign(synth, { engine: realEngine(Eng.prototype, posted), _disposed: false, loadModule: () => {} }, extra);
      return { synth: synth as never, posted };
    },
  });

  const rows: Row[] = [
    handleRow('FC', FCSynth),
    handleRow('Fred', FredSynth),
    handleRow('HippelCoSo', HippelCoSoSynth),
    handleRow('OctaMED', OctaMEDSynth),
    handleRow('SidMon1', SidMon1Synth),
    handleRow('SidMon', SidMonSynth),
    handleRow('TFMX', TFMXSynth),
    handleRow('RobHubbard', RobHubbardSynth),
    engineRow('DavidWhittaker', DavidWhittakerSynth, DavidWhittakerEngine, { sampleIndex: 1 }),
    engineRow('DeltaMusic1', DeltaMusic1Synth, DeltaMusic1Engine, { instrumentIndex: 1 }),
    engineRow('DeltaMusic2', DeltaMusic2Synth, DeltaMusic2Engine, { instrumentIndex: 1 }),
    engineRow('DigMug', DigMugSynth, DigMugEngine, { sampleIndex: 1, fineTune: 0 }),
    engineRow('InStereo1', InStereo1Synth, InStereo1Engine, { instrumentNumber: 1 }),
    engineRow('InStereo2', InStereo2Synth, InStereo2Engine, { instrumentNumber: 1 }),
    engineRow('SonicArranger', SonicArrangerSynth, SonicArrangerEngine, { instrumentNumber: 1 }),
    engineRow('StartrekkerAM', StartrekkerAMSynth, StartrekkerAMEngine, { instrument: 1 }),
    engineRow('FuturePlayer', FuturePlayerSynth, FuturePlayerEngine, { _instrumentPtr: 16 }),
    engineRow('JamCracker', JamCrackerSynth, JamCrackerEngine, { _instrumentIndex: 1 }),
    engineRow('SoundMon', SoundMonSynth, SoundMonEngine, { _slot: 1 }),
    engineRow('MusicLine', MusicLineSynth, MusicLineEngine, { _instrument: { metadata: { mlInstIdx: 2 } } }),
    engineRow('SunVoxModular', SunVoxModularSynth, SunVoxEngine, { _handle: 1, _noteTargetSvId: 2 }, 'time'),
  ];

  it.each(rows)('$name hands its scheduled time to the posted note messages', ({ make, key }) => {
    const { synth, posted } = make();
    if (key === 'time') {
      // SunVox posts through sendMessage on its own engine object
      (synth as unknown as { engine: Record<string, unknown> }).engine['sendMessage'] = (m: Record<string, unknown>) => { posted.push(m); };
    }
    synth.triggerAttack('C3', 12.5, 1);
    synth.triggerRelease('C3', 13.25);
    expect(posted.map((m) => m[key ?? 'atTime']).filter((t) => t !== undefined)).toEqual([12.5, 13.25]);
  });
});
