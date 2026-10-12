/**
 * SCR-P5.6 (owner scratch plan sections 84, 85, 88 "tracker demo: tracker sample"): a tracker
 * deck's snare instrument is decoded at the context's rate, registered with the scratch voice
 * pool as a transient record, and a planned TRACKER_SAMPLE event fired by the real
 * `ScratchExecutor` through the one action path (`fireDjFx`) loads it into the ANSWER voice's
 * ring (ring 5 = SCRATCH_RECORD_RING_BASE + 1) with duration = sample frames / rate, and
 * strokes it. Rendered offline through the real worklet, voice, bus and pool.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';

const SR = 48000;
const holder = vi.hoisted(() => ({ ctx: null as unknown, samplerInput: null as unknown }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => (holder.ctx as BaseAudioContext).currentTime, getContext: () => ({ rawContext: holder.ctx, state: 'running' }) };
});
vi.mock('@/stores/useTransportStore', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/stores/useTransportStore']());
vi.mock('@/stores/useDJStore', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/stores/useDJStore']());
vi.mock('@/engine/dj/DJActions', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJActions']());
vi.mock('@/engine/dj/DJQuantizedFX', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJQuantizedFX']());
vi.mock('@/engine/dj/DJBeatJump', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJBeatJump']());
vi.mock('@/engine/dj/DJAutoSync', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJAutoSync']());
vi.mock('@/hooks/drumpad/useMIDIPadRouting', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/hooks/drumpad/useMIDIPadRouting']());
vi.mock('@engine/ToneEngine', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@engine/ToneEngine']());
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => null, mixer: { samplerInput: holder.samplerInput } }),
  getDJEngineIfActive: () => ({ getDeck: () => null, mixer: { samplerInput: holder.samplerInput } }),
}));

/** A 16-bit mono PCM WAV of a decaying noise burst (a snare-like one-shot), as a tracker stores it. */
function snareWav(rate: number, sec: number): ArrayBuffer {
  const n = Math.round(rate * sec);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  let seed = 7;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    v.setInt16(44 + i * 2, Math.round(((seed / 0x7fffffff) * 2 - 1) * Math.exp(-i / (rate * 0.05)) * 20000), true);
  }
  return buf;
}

describe('a tracker deck sample is a scratch record (SCR-P5.6)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('the snare instrument loads into ring 5 with duration = frames / rate, and a planned ANSWER stroke plays it', async () => {
    const ctx = new OfflineAudioContext(2, Math.round(SR * 0.6), SR);
    holder.ctx = ctx;
    const samplerInput = ctx.createGain();
    samplerInput.connect(ctx.destination);
    holder.samplerInput = samplerInput;

    const { fireDjFx, releaseDjFx } = await import('@/engine/drumpad/DjFxActions');
    const { getScratchVoicePool, resetScratchVoicePool } = await import('../scratch/scratchVoicePool');
    const { scratchVoiceStats } = await import('../scratch/ScratchRecordVoice');
    const { SCRATCH_RECORD_RING_BASE } = await import('../DeckScratchBuffer');
    const { loadTrackerSample, trackerSampleInfos, trackerSampleRecordId, trackerSampleStats } = await import('../scratch/trackerSampleSource');
    const { ScratchExecutor, scratchExecutorStats } = await import('../scratch/ScratchExecutor');
    resetScratchVoicePool();
    scratchVoiceStats.strokes = 0;

    const instruments = [
      { id: 1, name: 'Kick' },
      { id: 2, name: 'Snare', sample: { audioBuffer: snareWav(22050, 0.2) } },
    ];
    const infos = trackerSampleInfos(instruments, 'A');
    expect(infos).toEqual([{ deck: 'A', sampleId: '2', name: 'Snare', kind: 'snare' }]);

    const pool = getScratchVoicePool();
    await pool.ready;
    const loadsBefore = trackerSampleStats.loads;
    const record = (await loadTrackerSample(pool, ctx, 'A', instruments[1]!))!;
    expect(trackerSampleStats.loads - loadsBefore).toBe(1);
    expect(record.id).toBe(trackerSampleRecordId('A', '2'));
    expect(record.durationSec).toBeCloseTo(Math.round(0.2 * SR) / SR, 3); // decoded at the context's rate

    // the executor fires the planned TRACKER_SAMPLE event through the registry (sec = context time, 120 BPM)
    let sec = 0;
    const intervals: Array<() => void> = [];
    const exec = new ScratchExecutor({
      clock: { beatNow: () => sec / 0.5, beatSec: () => 0.5 }, contextTime: () => sec,
      fire: fireDjFx, release: releaseDjFx,
      probe: { capture: () => ({ rate: 1, channelGain: 1, captureFrozen: false, suppressNotes: false, crossfader: 0.5, busLevel: 1 }), restore: () => undefined },
      recueDeck: () => ({ recued: false, mode: 'unavailable', returnsToAnchor: false }),
      timers: { now: () => sec * 1000, setInterval: (fn) => { intervals.push(fn); return fn; }, clearInterval: (h) => { const i = intervals.indexOf(h as () => void); if (i >= 0) intervals.splice(i, 1); }, setTimeout: () => null, clearTimeout: () => undefined },
      tickMs: 5, lookaheadSec: 0.1,
    });
    const started = scratchExecutorStats.started;
    exec.schedule({
      executeAtBeat: 0.2, durationBeats: 0.5, role: 'ANSWER', source: { type: 'TRACKER_SAMPLE', deck: 'A', sampleId: '2', anchor: 0 },
      anchor: record.anchor, gesture: 'forwardStab', velocity: 0.8, humanizeMs: 0, intensity: 0.5, deck: 'A', returnToAnchor: false,
    });
    for (const fn of [...intervals]) fn();
    expect(scratchExecutorStats.started - started).toBe(1);
    await pool.settled();

    const voice = pool.voices[1]!;
    expect(SCRATCH_RECORD_RING_BASE + voice.index).toBe(5);
    expect(voice.record?.id).toBe(record.id);
    expect((voice.ring as unknown as { loadedFrames: number }).loadedFrames).toBe(Math.round(record.durationSec * SR));
    expect(scratchVoiceStats.strokes).toBe(1);
    exec.cancel();
  }, 60_000);
});
