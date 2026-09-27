/**
 * The engine's dub-settings sync follows the tempo the echo actually syncs to.
 *
 * DrumPadEngine.startDubSettingsMirror pushed the store's dub settings with a
 * BPM-synced echo rate, but only re-synced on the TRACKER transport's BPM. A
 * DJ set's tempo lives in the DJ store (getActiveBpm picks the loudest playing
 * deck), so PadGrid and DJSamplerPanel each pushed the whole settings object
 * again with their own sync — skipping `isRateOverridden`, so the next deck
 * BPM change overwrote a held delay preset. The engine now follows both
 * stores through getActiveBpm and the two views push nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DrumPadEngine } from '../DrumPadEngine';
import { useDJStore } from '@/stores/useDJStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { bpmSyncedEchoRate } from '@/engine/dub/DubActions';

const ROOT = resolve(__dirname, '../../../..');

function mirror(overridden: boolean) {
  const pushed: Array<{ echoRateMs?: number }> = [];
  const engine = Object.assign(Object.create(DrumPadEngine.prototype), {
    _dubMirrorOff: null,
    _dubMirrorTimer: null,
    dubBus: { isRateOverridden: () => overridden },
    setDubBusSettings: (s: { echoRateMs?: number }) => { pushed.push(s); },
  }) as { startDubSettingsMirror(): void; _dubMirrorOff: (() => void) | null };
  engine.startDubSettingsMirror();
  return { pushed, stop: () => engine._dubMirrorOff?.() };
}

function playDeckA(bpm: number) {
  const s = useDJStore.getState();
  useDJStore.setState({
    crossfaderPosition: 0,
    decks: { ...s.decks, A: { ...s.decks.A, isPlaying: true, volume: 1, detectedBPM: bpm, effectiveBPM: bpm, beatGrid: null } },
  } as never);
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('dub settings follow the DJ deck tempo', () => {
  it('re-syncs the echo rate when the playing deck\'s BPM changes', () => {
    useDrumPadStore.getState().setDubBus({ echoSyncDivision: '1/4' });
    const { pushed, stop } = mirror(false);
    playDeckA(140);
    vi.advanceTimersByTime(150);
    const { echoRateMs, echoSyncDivision } = useDrumPadStore.getState().dubBus;
    expect(pushed.at(-1)?.echoRateMs).toBe(bpmSyncedEchoRate(140, echoSyncDivision, echoRateMs));
    stop();
  });

  it('syncs to the tempo the deck plays at, pitch included', () => {
    useDrumPadStore.getState().setDubBus({ echoSyncDivision: '1/4' });
    const { pushed, stop } = mirror(false);
    playDeckA(125);
    const s = useDJStore.getState();
    useDJStore.setState({ decks: { ...s.decks, A: { ...s.decks.A, effectiveBPM: 140.31 } } } as never);
    vi.advanceTimersByTime(150);
    const { echoRateMs, echoSyncDivision } = useDrumPadStore.getState().dubBus;
    expect(pushed.at(-1)?.echoRateMs).toBe(bpmSyncedEchoRate(140.31, echoSyncDivision, echoRateMs));
    stop();
  });

  it('leaves a held rate alone', () => {
    useDrumPadStore.getState().setDubBus({ echoSyncDivision: '1/4', echoRateMs: 333 });
    const { pushed, stop } = mirror(true);
    playDeckA(90);
    vi.advanceTimersByTime(150);
    expect(pushed.at(-1)?.echoRateMs).toBe(333);
    stop();
  });

  it('is the only thing that pushes them — the pad and sampler views do not', () => {
    for (const f of ['src/components/drumpad/PadGrid.tsx', 'src/components/dj/DJSamplerPanel.tsx']) {
      expect(readFileSync(resolve(ROOT, f), 'utf-8'), f).not.toMatch(/setDubBusSettings\s*\(/);
    }
  });
});
