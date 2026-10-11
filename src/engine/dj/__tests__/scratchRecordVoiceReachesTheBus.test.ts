/**
 * SCR-P2.R2 reachability (owner scratch plan sections 16, 42, 81, 91):
 * `fireDjFx('fx_scratch_forwardStab', {source: 'mcp', record: 'ONE'})`
 * (ONE is a COUNT record whose reference gestures include forward_stab;
 * its vowel anchor is 3300 samples, like AH_STANDARD's)
 * - the one action path - reaches the scratch record voice, not a deck: the
 * worklet receives one `load` and a needle drop at the record's vowel
 * (round(3300 / 22050 x sampleRate) frames, +-1), the voice strokes once,
 * the scratch bus carries > -40 dBFS during the stab's open window, and
 * deck A's `setScratchVelocity` is never called (section 16: the deck keeps
 * its musical role). Rendered offline through the real worklet, voice, bus
 * and pool.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';

const SR = 48000;
const holder = vi.hoisted(() => ({ ctx: null as unknown, deck: null as unknown, samplerInput: null as unknown }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => (holder.ctx as BaseAudioContext).currentTime, getContext: () => ({ rawContext: holder.ctx, state: 'running' }) };
});
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => holder.deck, mixer: { samplerInput: holder.samplerInput } }),
  getDJEngineIfActive: () => ({ getDeck: () => holder.deck, mixer: { samplerInput: holder.samplerInput } }),
}));

function fakeDeck() {
  return {
    id: 'A' as const,
    velocityCalls: 0,
    patternCalls: 0,
    setScratchVelocity() { this.velocityCalls++; },
    playPattern() { this.patternCalls++; },
    stopPattern() {},
    finishPatternCycle() {},
    getEffectiveBPM: () => 125,
  };
}

describe('a record gesture fired through the DJ FX registry reaches the scratch bus, never a deck (SCR-P2.R2)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('fx_scratch_forwardStab on ONE: load x1, needle at the vowel, one stroke, bus > -40 dBFS in the open window, deck untouched', async () => {
    const ctx = new OfflineAudioContext(2, Math.round(SR * 0.6), SR);
    holder.ctx = ctx;
    const samplerInput = ctx.createGain();
    samplerInput.connect(ctx.destination);
    holder.samplerInput = samplerInput;
    const deck = fakeDeck();
    holder.deck = deck;

    const { fireDjFx, releaseDjFx, djFxFireCounts, clearDjFxFireLog } = await import('@/engine/drumpad/DjFxActions');
    const { getScratchVoicePool, resetScratchVoicePool, scratchPoolStats } = await import('../scratch/scratchVoicePool');
    const { scratchVoiceStats } = await import('../scratch/ScratchRecordVoice');
    const { scratchRingStats } = await import('../DeckScratchBuffer');
    const { getScratchRecord } = await import('../scratch/scratchCatalogue');
    const { getGesture } = await import('../scratch/scratchGestureCatalog');
    const { cycleMs } = await import('../scratch/scratchFaderModel');
    resetScratchVoicePool();
    clearDjFxFireLog();
    scratchVoiceStats.strokes = 0;
    scratchRingStats.loads = 0; scratchRingStats.seekFrames.length = 0;
    scratchPoolStats.performs = 0;

    expect(fireDjFx('fx_scratch_forwardStab', { source: 'mcp', record: 'ONE' })).toBe(true);
    expect(djFxFireCounts.fx_scratch_forwardStab).toBe(1);
    await getScratchVoicePool().settled();

    expect(scratchPoolStats.performs).toBe(1);
    expect(scratchRingStats.loads).toBe(1);
    const vowelFrames = Math.round(3300 / 22050 * SR);
    expect(scratchRingStats.seekFrames.some((f) => Math.abs(f - vowelFrames) <= 1), `needle at ${vowelFrames} +-1 (got ${scratchRingStats.seekFrames.join(',')})`).toBe(true);
    expect(scratchVoiceStats.strokes).toBe(1);
    const voice = getScratchVoicePool().voices[0]!;
    expect(voice.record?.id).toBe('ONE');
    expect(voice.busy).toBe(true);

    // the stab's open window at 125 BPM: forwardStab opens (0, 0.42) of its cycle
    const stab = getGesture('forwardStab');
    const cycleSec = cycleMs(stab, 125) / 1000;
    const open = stab.faderWindows[0]!.open;
    const out = (await ctx.startRendering()).getChannelData(0);
    const from = Math.round((open[0] * cycleSec + 0.005) * SR);
    const to = Math.round((open[1] * cycleSec - 0.005) * SR);
    let sq = 0;
    for (let i = from; i < to; i++) sq += out[i]! * out[i]!;
    const rmsDb = 20 * Math.log10(Math.sqrt(sq / (to - from)));
    expect(rmsDb, 'scratch bus output during the open window').toBeGreaterThan(-40);

    expect(deck.velocityCalls, 'deck A setScratchVelocity').toBe(0);
    expect(deck.patternCalls, 'deck A playPattern').toBe(0);

    releaseDjFx('fx_scratch_forwardStab', { source: 'mcp' });
    expect(voice.busy).toBe(false);
    expect(getScratchRecord('ONE')!.anchors.vowel).toBeCloseTo(3300 / 22050, 9);
  }, 240_000); // heavy tier: the 0.6 s offline render takes 20-40 s on a loaded machine (open: SCR-P2 handoff)
});
