/**
 * A Tone.js instrument on a tracker channel reaches master only through its
 * channel strip.
 *
 * connectChainOutput used to wire every Tone.js instrument's chain output
 * straight to masterInput, while triggerNoteAttack also fed the instrument
 * into a per-voice gain in the channel strip. A TR808 on channel 1 then
 * played twice: once scaled through its strip and once unscaled (+18 dB
 * normalisation offset) straight into the safety limiter, heard as
 * distortion and as the kick "sidechaining" everything (2026-10-19).
 */
import { describe, it, expect, vi } from 'vitest';

const { Gain } = vi.hoisted(() => {
  class Node {
    targets: unknown[] = [];
    connect = (d: unknown) => { this.targets.push(d); };
    disconnect = (d?: unknown) => { this.targets = d === undefined ? [] : this.targets.filter((t) => t !== d); };
    dispose = () => {};
  }
  class Gain extends Node {}
  return { Gain };
});
vi.mock('tone', () => ({ Gain }));
vi.mock('@typedefs/synth', () => ({ isDevilboxSynth: () => false }));
vi.mock('../../InstrumentFactory', () => ({ InstrumentFactory: {} }));
vi.mock('../../InstrumentAnalyser', () => ({ InstrumentAnalyser: class {} }));
vi.mock('../../ChannelFilterManager', () => ({ getChannelFilterManager: () => ({ getInput: () => ({}), getOutput: () => ({}) }) }));
vi.mock('../connectAudio', () => ({ connectAudio: (s: { connect: (d: unknown) => void }, d: unknown) => s.connect(d) }));

import { connectChainOutput, attachVoiceSource, type InstrumentEffectsContext } from '../InstrumentEffectsChain';
import type { VoiceState } from '../ChannelRouting';

const key = (id: number, ch: number) => (id << 16) | (ch < 0 ? 0xffff : ch);
const channelFromKey = (k: number) => ((k & 0xffff) === 0xffff ? -1 : k & 0xffff);

function voice(instrument: unknown): VoiceState {
  return { instrument, nodes: { gain: new Gain() } } as unknown as VoiceState;
}

function ctx(instrument: unknown, voices: VoiceState[]) {
  const masterInput = new Gain();
  const c = {
    instrumentAnalysers: new Map(),
    instruments: new Map([[key(6, 1), instrument], [key(6, -1), instrument]]),
    activeVoices: new Map([[1, voices]]),
    masterInput,
    synthBus: new Gain(),
    getInstrumentOutputDestination: () => masterInput,
    channelFromKey,
  } as unknown as InstrumentEffectsContext;
  return { c, masterInput };
}

describe('Tone.js instrument on a tracker channel', () => {
  it('feeds its sounding voices, not masterInput (no second unscaled copy)', () => {
    const instrument = {};
    const v = voice(instrument);
    const other = voice({});
    const { c, masterInput } = ctx(instrument, [v, other]);
    const output = new Gain();

    connectChainOutput(c, key(6, 1), output as never, false);

    expect(output.targets).not.toContain(masterInput);
    expect(output.targets).toContain(v.nodes.gain);
    expect(output.targets).not.toContain(other.nodes.gain);
    expect(v.nodes.source).toBe(output);
  });

  it('on the shared instance key still goes to its destination', () => {
    const { c, masterInput } = ctx({}, []);
    const output = new Gain();
    connectChainOutput(c, key(6, -1), output as never, false);
    expect(output.targets).toEqual([masterInput]);
  });

  it('keeps the open analyser as a parallel tap, never in series', () => {
    const instrument = {};
    const v = voice(instrument);
    const { c } = ctx(instrument, [v]);
    const analyser = { input: new Gain() };
    c.instrumentAnalysers.set(6, analyser as never);
    const output = new Gain();
    connectChainOutput(c, key(6, 1), output as never, false);
    expect(output.targets).toContain(v.nodes.gain);
    expect(output.targets).toContain(analyser.input);
  });
});

describe('attachVoiceSource', () => {
  it('replaces the voice node edge with the chain output so a voice never carries two copies', () => {
    const voiceNode = new Gain();
    const v = voice(voiceNode);
    attachVoiceSource(v, voiceNode as never);
    expect(voiceNode.targets).toEqual([v.nodes.gain]);

    const chainOutput = new Gain();
    attachVoiceSource(v, chainOutput as never);
    expect(voiceNode.targets).toEqual([]);
    expect(chainOutput.targets).toEqual([v.nodes.gain]);
    expect(v.nodes.source).toBe(chainOutput);
  });
});
