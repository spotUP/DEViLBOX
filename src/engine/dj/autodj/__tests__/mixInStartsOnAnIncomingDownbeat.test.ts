import { describe, it, expect } from 'vitest';
import { chooseMixIn } from '../transitionPlanner';
import { corpusAnalysis } from '../testing/corpus';

// AUTODJ-MIX-IN-OFF-BEAT: a mix-in counted back from the incoming drop / vocal subtracted the
// transition length in the OUTGOING's seconds, so with different tempos the incoming started
// between its own beats. The start must be an incoming downbeat, the transition's bars before it.
const offDownbeatSec = (a: ReturnType<typeof corpusAnalysis>, t: number) => Math.min(...a.downbeats.bars.map((b) => Math.abs(b.start - t)));

describe('the incoming starts on its own downbeat', () => {
  const outBarSec = 4 * 60 / 126; // outgoing 'steady' at 126 BPM
  it('dropMix: the drop lands on the transition end, the start is an incoming bar', () => {
    const incoming = corpusAnalysis('drops'); // 130 BPM
    const drop = incoming.cuePoints.firstDrop ?? incoming.cuePoints.firstHook;
    expect(drop).toBeDefined();
    const bars = 8;
    const m = chooseMixIn(incoming, 'dropMix', bars * outBarSec, bars);
    expect(m.reasons[0]).toContain('drop lands');
    expect(offDownbeatSec(incoming, m.time)).toBeLessThan(0.005);
    const inBar = (t: number) => incoming.downbeats.bars.findIndex((b) => Math.abs(b.start - t) < 0.005);
    expect(inBar(drop!) - inBar(m.time)).toBe(bars);
  });
  it('vocalSwap: the start is an incoming bar', () => {
    const incoming = corpusAnalysis('vocals'); // 122 BPM
    expect(incoming.cuePoints.firstVocal).toBeDefined();
    const bars = 4;
    const m = chooseMixIn(incoming, 'vocalSwap', bars * outBarSec, bars);
    expect(offDownbeatSec(incoming, m.time)).toBeLessThan(0.005);
  });
});
