/**
 * The channel sound-shaping slot's data: a saved filter survives the move to
 * the slot, and a recorded slot replays exactly.
 */
import { describe, it, expect } from 'vitest';
import {
  CHANNEL_SHAPE_KINDS,
  CHANNEL_SHAPES,
  decodeChannelShapeLane,
  encodeChannelShapeLane,
  channelShapeMoveTarget,
  channelShapeEffectIndex,
} from '../channelShape';
import { migrateMixerChannelShape, migrateSavedProject } from '@/lib/persistence/migrations';
import { useMixerStore } from '@/stores/useMixerStore';

describe('a saved channel filter loads as the same shaping slot', () => {
  it('High Pass at 350 Hz stays High Pass at 350 Hz', () => {
    expect(migrateMixerChannelShape({ dubFilterMode: 'hpf', dubFilterHz: 350, dubSend: 0.4 }))
      .toEqual({ dubShape: 'hpf', dubShapeValue: 350, dubSend: 0.4 });
  });
  it('Low Pass keeps its cutoff; Off stays Off', () => {
    expect(migrateMixerChannelShape({ dubFilterMode: 'lpf', dubFilterHz: 900 })).toEqual({ dubShape: 'lpf', dubShapeValue: 900 });
    expect(migrateMixerChannelShape({ dubFilterMode: 'off', dubFilterHz: 200 })).toEqual({ dubShape: 'off', dubShapeValue: 0 });
  });
  it('is a no-op on a channel already saved with a slot', () => {
    const c = { dubShape: 'ringMod', dubShapeValue: 300 };
    expect(migrateMixerChannelShape(c)).toBe(c);
  });
  it('a schema-23 project is migrated to the slot and stamped with the current schema', () => {
    const project = { schemaVersion: 23, mixer: { channels: [{ dubFilterMode: 'hpf', dubFilterHz: 150 }] } };
    migrateSavedProject(project, 23);
    expect(project.schemaVersion).toBe(25);
    expect(project.mixer.channels[0]).toEqual({ dubShape: 'hpf', dubShapeValue: 150 });
  });
  it('a legacy snapshot loaded into the mixer store comes up with the slot', () => {
    useMixerStore.getState().loadMixerState({ channels: [{ dubFilterMode: 'lpf', dubFilterHz: 640 } as never] });
    const ch = useMixerStore.getState().channels[0];
    expect([ch.dubShape, ch.dubShapeValue]).toEqual(['lpf', 640]);
    expect((ch as unknown as Record<string, unknown>).dubFilterMode).toBeUndefined();
  });
});

describe('a recorded slot replays exactly', () => {
  for (const kind of CHANNEL_SHAPE_KINDS) {
    it(`${kind} at its default round-trips through one lane value`, () => {
      const v = CHANNEL_SHAPES[kind].defaultValue;
      const lane = encodeChannelShapeLane(kind, v);
      expect(lane).toBeGreaterThanOrEqual(0);
      expect(lane).toBeLessThanOrEqual(1);
      const back = decodeChannelShapeLane(lane);
      expect(back.kind).toBe(kind);
      expect(back.value).toBeCloseTo(v, 6);
    });
  }
  it('the range ends of a kind decode to that kind, not its neighbour', () => {
    expect(decodeChannelShapeLane(encodeChannelShapeLane('ringMod', 2000)).kind).toBe('ringMod');
    expect(decodeChannelShapeLane(encodeChannelShapeLane('lofi', 1)).kind).toBe('lofi');
  });
});

describe('the channelShape move params name the effect', () => {
  it('effect index + amount give the kind and its tapered value', () => {
    expect(channelShapeMoveTarget({ effect: channelShapeEffectIndex('lpf'), amount: 0 })).toEqual({ kind: 'lpf', value: 40 });
    expect(channelShapeMoveTarget({ effect: channelShapeEffectIndex('lofi'), amount: 1 })).toEqual({ kind: 'lofi', value: 16 });
    expect(channelShapeMoveTarget({ effect: 0 })).toBeNull();
    expect(channelShapeMoveTarget({ effect: 99 })).toBeNull();
  });
});
