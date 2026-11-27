/**
 * A key-locked deck sounds where an unlocked deck at the same position does.
 *
 * The Key Lock stretcher delays the audio by its latency (100 ms for
 * Signalsmith Stretch in DeckKeyLock's configuration; field measurement 103
 * vs 12 ms, thoughts/spot/todos.md:282): a key-locked deck played 100 ms
 * behind a plain deck at the same position - double kicks in a transition.
 *
 * DeckKeyLock reports the latency (onLatencyChange); DeckEngine hands it to
 * DeckAudioPlayer.setReadAhead, and the player reads that far ahead of the
 * position it reports. Positions, seeks, beat sync and the playhead then all
 * mean "what the listener hears, minus the output latency" on both decks.
 *
 * The real-song case drives the real DeckAudioPlayer seek maths and the exact
 * Signalsmith worklet the browser loads, offline, on a module rendered by UADE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const decks: Record<string, unknown> = {};
  return { decks, engine: { getDeck: (id: string) => decks[id] }, bends: [] as Array<{ deck: string; ratio: number; ms: number }> };
});

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));
vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  const raw = { currentTime: 0, outputLatency: 0.012 };
  return { ...actual, now: () => raw.currentTime, getContext: () => ({ rawContext: raw, state: 'running' }) };
});
vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => h.engine, getDJEngineIfActive: () => h.engine }));

import '@/engine/dj/DJEngine'; // the mock first, alone: it must be registered before the store/engine import cycle starts
import { setDJEngineHolder } from '@/engine/dj/DJPhase';
import { DeckEngine } from '../DeckEngine';
import { DeckKeyLock } from '../DeckKeyLock';
import { phaseAlign } from '../DJAutoSync';
import { useDJStore } from '@/stores/useDJStore';
import { DeckAudioPlayer } from '../DeckAudioPlayer';
import { STRETCH_CONFIG, TONALITY_HZ } from '../DeckKeyLock';
import { join } from 'node:path';
import { renderPathToSamples, PROJECT_ROOT } from '../../../../tools/uade-audit/uadeRenderCore';
import { loadWorklet, settle, streamThrough } from '../../../../tools/keylock/workletHost';
import { SR, latencySamples } from '../../../../tools/keylock/stretchMetrics';

const OUTPUT_LATENCY = 0.012;
const KEY_LOCK_LATENCY = 0.1;
const SONG = join(PROJECT_ROOT, 'public/data/songs/mod/break the box.mod');
const WORKLET_FILES = ['idleWhenBypassed.js', 'SignalsmithStretch.mjs'].map((f) => join(PROJECT_ROOT, 'public/signalsmith-stretch', f)); // what Signalsmith reports for STRETCH_CONFIG at 48 kHz, = the measured click delay

function keyLock(routed: boolean): DeckKeyLock {
  return Object.assign(Object.create(DeckKeyLock.prototype), {
    routedThroughStretch: routed, stretchLatencySec: KEY_LOCK_LATENCY, isActive: routed, stretchNode: null, pitchSemis: 0,
  }) as DeckKeyLock;
}

function audioDeck(id: 'A' | 'B', position: number, lock: DeckKeyLock): DeckEngine {
  const player = { getPosition: () => position, getPlaybackRate: () => 1 };
  return Object.assign(Object.create(DeckEngine.prototype), {
    id, _playbackMode: 'audio', _stemMode: false, audioPlayer: player, stemPlayer: player, keyLock: lock,
    isPlaying: () => true,
    bendRate: (ratio: number, ms: number) => { h.bends.push({ deck: id, ratio, ms }); },
  }) as DeckEngine;
}

const BPM = 120;
const grid = () => {
  const beats = Array.from({ length: 400 }, (_, i) => i * 0.5);
  return { beats, downbeats: beats.filter((_, i) => i % 4 === 0), bpm: BPM, timeSignature: 4 };
};

describe('a key-locked deck stays on the beat of an unlocked deck', () => {
  beforeEach(() => {
    setDJEngineHolder(h.engine as never); // DJPhase, not DJEngine, answers getDJEngineIfActive for the phase maths
    h.bends.length = 0;
    for (const id of ['A', 'B'] as const) {
      useDJStore.getState().setDeckState(id, { isPlaying: true, durationMs: 200_000, pitchOffset: 0, beatGrid: grid() });
    }
  });

  it('latencySec is the stretcher-reported latency while the signal runs through it, 0 on the bypass wire', () => {
    expect(keyLock(true).latencySec()).toBeCloseTo(KEY_LOCK_LATENCY, 9);
    expect(keyLock(false).latencySec()).toBe(0);
  });

  it('the heard position subtracts only the output latency: the player position already holds the key-lock read-ahead', () => {
    expect(audioDeck('A', 30, keyLock(true)).getHeardPosition()).toBeCloseTo(30 - OUTPUT_LATENCY, 9);
    expect(audioDeck('A', 30, keyLock(false)).getHeardPosition()).toBeCloseTo(30 - OUTPUT_LATENCY, 9);
  });

  it('a key-locked and a plain deck on the same position are left alone by phase correction', () => {
    h.decks.A = audioDeck('A', 40, keyLock(false));
    h.decks.B = audioDeck('B', 40, keyLock(true));
    phaseAlign('B', 'A', 'beat');
    expect(h.bends).toEqual([]);
  });

  it('real song: a key-locked deck and a plain deck seeked to the same position sound under 5 ms apart', async () => {
    const r = await renderPathToSamples(SONG, { sampleRate: SR, seconds: 12 });
    const mono = Float32Array.from({ length: r.frames }, (_, i) => 0.5 * (r.samples[2 * i] + r.samples[2 * i + 1]));
    const host = loadWorklet(WORKLET_FILES, SR);
    const proc = host.create('signalsmith-stretch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    for (let i = 0; i < 200 && !proc.port.received.some((m) => Array.isArray(m) && m[0] === 'ready'); i++) await settle(10);
    proc.port.send([1, 'configure', { ...STRETCH_CONFIG }]);
    proc.port.send([2, 'schedule', { active: true, semitones: 0, tonalityHz: TONALITY_HZ }]);
    proc.port.send([3, 'latency']);
    const reported = (proc.port.received.find((m) => Array.isArray(m) && m[0] === 3) as [number, number])[1];
    expect(reported, 'stretcher latency report').toBeGreaterThan(0.05);

    // Where each deck's player starts reading after seek(START): the real seek maths on a stopped player.
    const START = 1;
    const readFrom = (latencySec: number): number => {
      const p = Object.assign(Object.create(DeckAudioPlayer.prototype), {
        _loaded: true, _duration: r.frames / SR, _playbackRate: 1, _readAheadSec: 0, _pendingOffset: null,
        _rateTrackingActive: false, _seekCount: 0, _lastSeekTarget: 0, player: { state: 'stopped' },
      }) as DeckAudioPlayer;
      p.setReadAhead(latencySec);
      p.seek(START);
      expect(p.getPosition(), 'reported position').toBeCloseTo(START, 9);
      return (p as unknown as { _pendingOffset: number })._pendingOffset;
    };
    const plain = mono.subarray(Math.round(readFrom(0) * SR), Math.round((readFrom(0) + 8) * SR));
    const lockedIn = mono.subarray(Math.round(readFrom(reported) * SR), Math.round((readFrom(reported) + 8) * SR));
    const locked = streamThrough(host, proc, lockedIn, lockedIn);
    const lockedMono = Float32Array.from(locked.left, (v, i) => 0.5 * (v + locked.right[i]));
    // Skip the stretcher warm-up (its latency), then compare 6 s.
    const skip = Math.ceil(reported * SR) + SR / 10;
    const a = lockedMono.subarray(skip, skip + 6 * SR), b = plain.subarray(skip, skip + 6 * SR);
    const offsetSec = (latencySamples(a, b) - latencySamples(b, a)) / SR; // > 0: the key-locked deck is late
    expect(Math.abs(offsetSec), `key-locked deck ${(offsetSec * 1000).toFixed(1)} ms off the plain deck`).toBeLessThan(0.005);

    // Uncompensated (read from START like the plain deck), the same measurement sees the latency.
    proc.port.send([4, 'configure', { ...STRETCH_CONFIG }]); // reset: nothing of the first run may come out
    proc.port.send([5, 'schedule', { active: true, semitones: 0, tonalityHz: TONALITY_HZ }]);
    const rawOut = streamThrough(host, proc, plain, plain);
    const rawMono = Float32Array.from(rawOut.left, (v, i) => 0.5 * (v + rawOut.right[i])).subarray(skip, skip + 6 * SR);
    expect(latencySamples(rawMono, b) / SR, 'measurement blind to the stretcher latency').toBeGreaterThan(reported - 0.005);
  }, 120_000);

  it('two decks without key lock on the same beat are left alone', () => {
    h.decks.A = audioDeck('A', 40, keyLock(false));
    h.decks.B = audioDeck('B', 40, keyLock(false));
    phaseAlign('B', 'A', 'beat');
    expect(h.bends).toEqual([]);
  });
});
