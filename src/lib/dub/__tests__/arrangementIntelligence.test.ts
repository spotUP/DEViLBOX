import { describe, it, expect } from 'vitest';
import {
  planDrop,
  droppedChannels,
  restoreDelayMs,
} from '../arrangementIntelligence';
import { buildMusicalChannelProfile } from '../musicalChannelProfile';
import type { MusicalChannelProfile } from '../musicalChannelProfile';

function profile(
  channel: number,
  overrides: Parameters<typeof buildMusicalChannelProfile>[1],
  derived: Partial<Pick<MusicalChannelProfile, 'importance' | 'audibility'>> = {},
): MusicalChannelProfile {
  return {
    ...buildMusicalChannelProfile({ channel }, overrides),
    importance: derived.importance ?? 0.5,
    audibility: derived.audibility ?? 0.7,
  };
}

function map(...p: MusicalChannelProfile[]) {
  return new Map(p.map(x => [x.channel, x]));
}

describe('planDrop — what the arrangement can lose', () => {
  it('protects the foundation, whatever else is going on', () => {
    const plans = planDrop(map(profile(0, { musicalFunction: 'foundation' })));
    expect(plans[0].behavior).toBe('protect');
    expect(plans[0].reason).toMatch(/riddim/);
  });

  it('protects the sub register even when it is labelled a melody', () => {
    const plans = planDrop(map(profile(0, { musicalFunction: 'melody', register: 'sub' })));
    expect(plans[0].behavior).toBe('protect');
  });

  it('protects a groove that the arrangement leans on — a drop drops INTO the groove', () => {
    const plans = planDrop(map(profile(0, { musicalFunction: 'groove' }, { importance: 0.7 })));
    expect(plans[0].behavior).toBe('protect');
  });

  it('protects anything the arrangement leans on heavily, whatever its function', () => {
    const plans = planDrop(map(profile(0, { musicalFunction: 'texture' }, { importance: 0.9 })));
    expect(plans[0].behavior).toBe('protect');
    expect(plans[0].reason).toMatch(/leans on/);
  });

  it('throws an audible part into the echo before muting it', () => {
    const plans = planDrop(map(
      profile(0, { musicalFunction: 'melody' }, { importance: 0.4, audibility: 0.9 }),
    ));
    expect(plans[0].behavior).toBe('throwThenMute');
    expect(plans[0].reason).toMatch(/tail/);
  });

  it('simply mutes something nobody would hear leave', () => {
    const plans = planDrop(map(
      profile(0, { musicalFunction: 'texture' }, { importance: 0.2, audibility: 0.1 }),
    ));
    expect(plans[0].behavior).toBe('mute');
  });

  it('honours an exclusion from the caller', () => {
    const plans = planDrop(
      map(profile(0, { musicalFunction: 'melody' }, { importance: 0.2, audibility: 0.9 })),
      { exclude: new Set([0]) },
    );
    expect(plans[0].behavior).toBe('protect');
    expect(plans[0].reason).toMatch(/excluded/);
  });

  it('reports every channel, so "nothing to drop" is distinguishable from "all protected"', () => {
    const plans = planDrop(map(
      profile(0, { musicalFunction: 'foundation' }),
      profile(1, { musicalFunction: 'melody' }, { importance: 0.3 }),
    ));
    expect(plans).toHaveLength(2);
    expect(plans.filter(p => p.behavior === 'protect')).toHaveLength(1);
  });
});

describe('drop and restore order', () => {
  const profiles = map(
    profile(0, { musicalFunction: 'foundation' }),
    profile(1, { musicalFunction: 'melody' }, { importance: 0.7, audibility: 0.9 }),
    profile(2, { musicalFunction: 'harmony' }, { importance: 0.5, audibility: 0.8 }),
    profile(3, { musicalFunction: 'texture' }, { importance: 0.2, audibility: 0.6 }),
  );

  it('thins the mix from the edges inward — least important leaves first', () => {
    expect(droppedChannels(planDrop(profiles)).map(p => p.channel)).toEqual([3, 2, 1]);
  });

  it('brings the most important part back first, so the riddim re-forms under it', () => {
    const plans = planDrop(profiles).filter(p => p.behavior !== 'protect');
    const byOrder = [...plans].sort((a, b) => a.restoreOrder - b.restoreOrder);
    expect(byOrder.map(p => p.channel)).toEqual([1, 2, 3]);
  });

  it('gives protected channels no restore order, because they never left', () => {
    const protectedPlan = planDrop(profiles).find(p => p.channel === 0)!;
    expect(protectedPlan.behavior).toBe('protect');
    expect(protectedPlan.restoreOrder).toBe(0);
  });

  it('staggers the return but bounds it', () => {
    const plans = planDrop(profiles).filter(p => p.behavior !== 'protect');
    const delays = plans.map(p => restoreDelayMs(p, 200, 300));
    expect(Math.max(...delays)).toBeLessThanOrEqual(300);
    expect(new Set(delays).size).toBeGreaterThan(1);       // actually staggered
  });
});
