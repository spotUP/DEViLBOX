/**
 * A hybrid song's first synth note is scheduled ahead of its time, not at it.
 *
 * The bug: the libopenmpt worklet stamped every row with the time of the quantum being rendered, so the
 * coordinator learned of a row when its samples were already playing. The row's synth notes were scheduled at
 * that time plus the main-thread hop and the first note's voice build (6-10 ms): the first note started late,
 * skipped its attack and clicked (measured lead of note 1: exactly 0; notes 2-7: 2.7-5.3 ms).
 *
 * The worklet now holds every output back `setLead` seconds (whole render quanta) and stamps each row that
 * far ahead, so the notes are scheduled before the row's samples are heard. All outputs lag together:
 * isolation slots and dub sends stay sample-aligned with the main mix. Lead 0 (a sample-only song) is the
 * old behaviour. The processor runs on a fake libopenmpt whose render of quantum k is the constant k + 1.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

const QUANTUM = 128;
const SAMPLE_RATE = 48000;
const LEAD_SEC = 0.03;
const LEAD_QUANTA = Math.ceil(LEAD_SEC * SAMPLE_RATE / QUANTUM); // 12 quanta = 32 ms
const SLOT_OUT = 1; // isolation slot 0 renders into output 1

/** Pointer per rendering instance: main module 1 and the fake isolation slot 2. */
const MAIN = { module: 1, left: 512, right: 1024 }; // byte offsets; 0 reads as "no buffer" in the worklet
const SLOT = { module: 2, left: 2048, right: 3072 };

let renders = 0; // quantum counter of the fake module
const fakeLibopenmpt = {
  HEAPF32: new Float32Array(4096),
  _openmpt_module_read_float_stereo(ptr: number, _sr: number, n: number, lp: number, rp: number) {
    // Quantum k of the main module renders k + 1 on both sides; the slot renders the negative.
    const sign = ptr === MAIN.module ? 1 : -1;
    if (ptr === MAIN.module) renders++;
    fakeLibopenmpt.HEAPF32.fill(sign * renders, lp / 4, lp / 4 + n);
    fakeLibopenmpt.HEAPF32.fill(sign * renders, rp / 4, rp / 4 + n);
    return n;
  },
  _openmpt_module_get_position_seconds: () => 0,
  _openmpt_module_get_current_order: () => 0,
  _openmpt_module_get_current_pattern: () => 0,
  _openmpt_module_get_current_row: () => renders,
  _openmpt_module_get_current_speed: () => 6,
  _openmpt_module_get_current_tempo: () => 125,
  _openmpt_module_destroy: () => {},
  _free: () => {},
};

vi.mock('../../../public/chiptune3/libopenmpt.worklet.js', () => ({
  default: () => Promise.resolve(fakeLibopenmpt),
}));

type Msg = { cmd: string; row?: number; audioTime?: number };
type Proc = {
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
  handleMessage_: (m: { data: { cmd: string; val?: unknown } }) => void;
  stop: () => void;
  modulePtr: number; leftPtr: number; rightPtr: number;
  isolationSlots: unknown[];
  port: { postMessage: (m: Msg) => void };
};

let Ctor!: new (o: unknown) => Proc;
const g = globalThis as Record<string, unknown>;

beforeAll(async () => {
  g.AudioWorkletProcessor = class { port = { postMessage() {}, onmessage: null }; };
  g.registerProcessor = (_n: string, c: unknown) => { Ctor = c as typeof Ctor; };
  g.sampleRate = SAMPLE_RATE;
  g.currentTime = 0;
  const workletPath: string = '../../../public/chiptune3/chiptune3.worklet.js';
  await import(/* @vite-ignore */ workletPath);
  await new Promise((r) => setTimeout(r, 0)); // the module promise resolved: libopenmpt is set
});

/** A playing processor with a fake isolation slot; `posts` collects its pos messages. */
function playingProcessor(leadSec: number): { proc: Proc; posts: Msg[] } {
  renders = 0;
  const proc = new Ctor({});
  const posts: Msg[] = [];
  proc.port.postMessage = (m) => { if (m.cmd === 'pos') posts.push(m); };
  proc.handleMessage_({ data: { cmd: 'setLead', val: leadSec } });
  proc.modulePtr = MAIN.module; proc.leftPtr = MAIN.left; proc.rightPtr = MAIN.right;
  proc.isolationSlots[0] = { modulePtr: SLOT.module, leftPtr: SLOT.left, rightPtr: SLOT.right, extPtr: 0, muteFunc: 0, volumeFunc: 0, channelMask: 1 };
  return { proc, posts };
}

/** Renders quantum k and returns the first sample of main left/right and the slot left. */
function renderQuantum(proc: Proc, k: number): { main: [number, number]; slot: number; time: number } {
  const time = k * QUANTUM / SAMPLE_RATE;
  g.currentTime = time;
  const outputs = Array.from({ length: 2 }, () => [new Float32Array(QUANTUM), new Float32Array(QUANTUM)]);
  proc.process([], outputs);
  return { main: [outputs[0][0][0], outputs[0][1][0]], slot: outputs[SLOT_OUT][0][0], time };
}

describe('a hybrid song row is announced before its audio is heard', () => {
  it(`with the hybrid lead every pos is stamped ${LEAD_QUANTA} quanta ahead and the audio lags by the same`, () => {
    const { proc, posts } = playingProcessor(LEAD_SEC);
    const lead = LEAD_QUANTA * QUANTUM / SAMPLE_RATE;
    expect(lead).toBeGreaterThanOrEqual(LEAD_SEC);
    for (let k = 0; k < LEAD_QUANTA + 6; k++) {
      const { main, slot, time } = renderQuantum(proc, k);
      const pos = posts[k];
      expect(pos.row, 'the row of the quantum the module rendered').toBe(k + 1);
      expect(pos.audioTime! - time, `pos ${k}: audioTime ahead of currentTime`).toBeCloseTo(lead, 9);
      const heard = k < LEAD_QUANTA ? 0 : k + 1 - LEAD_QUANTA;
      expect(main, `quantum ${k}: main output is the module's render from ${LEAD_QUANTA} quanta ago`).toEqual([heard, heard]);
      expect(slot, `quantum ${k}: the isolation slot lags by the same`).toBe(heard === 0 ? 0 : -heard);
    }
  });

  it('with lead 0 (a sample-only song) pos is stamped at currentTime and the audio is immediate', () => {
    const { proc, posts } = playingProcessor(0);
    for (let k = 0; k < 4; k++) {
      const { main, slot, time } = renderQuantum(proc, k);
      expect(posts[k].audioTime).toBe(time);
      expect(main).toEqual([k + 1, k + 1]);
      expect(slot).toBe(-(k + 1));
    }
  });

  it('stop() drops the held tail so the old song does not play into the next', () => {
    const { proc } = playingProcessor(LEAD_SEC);
    for (let k = 0; k < LEAD_QUANTA + 3; k++) renderQuantum(proc, k);
    proc.stop();
    proc.modulePtr = MAIN.module; proc.leftPtr = MAIN.left; proc.rightPtr = MAIN.right; // the next song
    renders = 0;
    for (let k = 0; k < LEAD_QUANTA; k++) {
      expect(renderQuantum(proc, k).main, `quantum ${k} after stop`).toEqual([0, 0]);
    }
    expect(renderQuantum(proc, LEAD_QUANTA).main).toEqual([1, 1]);
  });
});
