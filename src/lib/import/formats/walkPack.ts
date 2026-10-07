/**
 * Walk results as typed arrays, for the walk worker's reply.
 *
 * A structured clone of a walk is itself a main-thread cost: Music Assembler's
 * baseheads.ma walk is 22 thousand events and 155 thousand tick writes (115 ms
 * to clone in node), Future Player's hybris.fp 53 thousand events (60 ms) -
 * as much as the walk. The worker packs each list of flat records into one
 * Float64Array (transferred, not copied) and the client rebuilds the objects
 * with a plain loop (a few ms).
 */
import { hippelPlayedKey, type HippelPlayed } from './HippelTfmxWalk';
import type { MaTickWrite, MaWalk, MaWalkEvent } from './maWalk';
import type { FpWalk, FpWalkEvent } from './fpWalk';

const MA_EVENT_FIELDS = 17;
const MA_WRITE_FIELDS = 3;
const FP_EVENT_FIELDS = 13;

export interface PackedMaWalk {
  head: Omit<MaWalk, 'events' | 'writes'>;
  events: Float64Array;
  writes: Float64Array[];
}
export interface PackedFpWalk {
  head: Omit<FpWalk, 'events'>;
  events: Float64Array;
}

export function packMaWalk(w: MaWalk): PackedMaWalk {
  const { events, writes, ...head } = w;
  const e = new Float64Array(events.length * MA_EVENT_FIELDS);
  events.forEach((v, i) => {
    e.set([v.tick, v.voice, v.kind, v.a, v.played, v.setInstrument, v.instr, v.transpose, v.synth ? 1 : 0, v.pv, v.delay,
      v.envelope ? 1 : 0, v.position, v.track, v.trackOffset, v.level, v.tableIndex], i * MA_EVENT_FIELDS);
  });
  const ws = writes.map((list) => {
    const a = new Float64Array(list.length * MA_WRITE_FIELDS);
    list.forEach((v, i) => { a[i * 3] = v.tick; a[i * 3 + 1] = v.period; a[i * 3 + 2] = v.volume; });
    return a;
  });
  return { head, events: e, writes: ws };
}

export function unpackMaWalk(p: PackedMaWalk): MaWalk {
  const e = p.events;
  const events: MaWalkEvent[] = new Array(e.length / MA_EVENT_FIELDS);
  for (let i = 0, o = 0; i < events.length; i++, o += MA_EVENT_FIELDS) {
    events[i] = {
      tick: e[o], voice: e[o + 1], kind: e[o + 2], a: e[o + 3], played: e[o + 4], setInstrument: e[o + 5], instr: e[o + 6],
      transpose: e[o + 7], synth: e[o + 8] === 1, pv: e[o + 9], delay: e[o + 10], envelope: e[o + 11] === 1,
      position: e[o + 12], track: e[o + 13], trackOffset: e[o + 14], level: e[o + 15], tableIndex: e[o + 16],
    };
  }
  const writes = p.writes.map((a) => {
    const list: MaTickWrite[] = new Array(a.length / MA_WRITE_FIELDS);
    for (let i = 0, o = 0; i < list.length; i++, o += MA_WRITE_FIELDS) list[i] = { tick: a[o], period: a[o + 1], volume: a[o + 2] };
    return list;
  });
  return { ...p.head, events, writes };
}

export function packFpWalk(w: FpWalk): PackedFpWalk {
  const { events, ...head } = w;
  const e = new Float64Array(events.length * FP_EVENT_FIELDS);
  events.forEach((v, i) => {
    e.set([v.tick, v.voice, v.kind, v.a, v.b, v.period, v.off, v.dur, v.delta, v.t1, v.t2, v.arp, v.porta], i * FP_EVENT_FIELDS);
  });
  return { head, events: e };
}

export function unpackFpWalk(p: PackedFpWalk): FpWalk {
  const e = p.events;
  const events: FpWalkEvent[] = new Array(e.length / FP_EVENT_FIELDS);
  for (let i = 0, o = 0; i < events.length; i++, o += FP_EVENT_FIELDS) {
    events[i] = {
      tick: e[o], voice: e[o + 1], kind: e[o + 2], a: e[o + 3], b: e[o + 4], period: e[o + 5], off: e[o + 6], dur: e[o + 7],
      delta: e[o + 8], t1: e[o + 9], t2: e[o + 10], arp: e[o + 11], porta: e[o + 12],
    };
  }
  return { ...p.head, events };
}

/** The played-pitch map as step, voice, row, transpose quadruples. */
export function packHippelPlayed(played: HippelPlayed): Int32Array {
  const a = new Int32Array(played.size * 4);
  let o = 0;
  for (const [key, value] of played) {
    const [step, voice, row] = key.split(':').map(Number);
    a[o++] = step; a[o++] = voice; a[o++] = row; a[o++] = value;
  }
  return a;
}

export function unpackHippelPlayed(a: Int32Array): HippelPlayed {
  const out = new Map<string, number>();
  for (let o = 0; o < a.length; o += 4) out.set(hippelPlayedKey(a[o], a[o + 1], a[o + 2]), a[o + 3]);
  return out;
}
