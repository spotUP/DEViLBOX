import { describe, it, expect, beforeEach } from 'vitest';
import { migrateDubLaneEvents } from '../useProjectPersistence';
import { useAutomationStore } from '@/stores/useAutomationStore';

describe('migrateDubLaneEvents', () => {
  beforeEach(() => {
    useAutomationStore.setState((s) => ({ ...s, curves: [] }));
  });

  it('trigger move: produces a step curve with value=1 spike at fire row', () => {
    const pattern = {
      id: 'p1',
      dubLane: {
        enabled: true,
        events: [
          { id: 'e1', moveId: 'echoThrow', channelId: 2, row: 10, params: {} },
        ],
      },
    } as any;

    migrateDubLaneEvents(pattern);

    const curves = useAutomationStore.getState().getCurvesForPattern('p1', 2);
    const curve = curves.find(c => c.parameter === 'dub.echoThrow');
    expect(curve).toBeDefined();
    expect(curve!.points.some(p => p.row === 10 && p.value === 1)).toBe(true);
    expect(curve!.mode).toBe('steps');
  });

  it('hold move: produces value=1 at row, value=0 at row+durationRows', () => {
    const pattern = {
      id: 'p2',
      dubLane: {
        enabled: true,
        events: [
          { id: 'e2', moveId: 'filterDrop', channelId: 1, row: 4, durationRows: 12, params: {} },
        ],
      },
    } as any;

    migrateDubLaneEvents(pattern);

    const curves = useAutomationStore.getState().getCurvesForPattern('p2', 1);
    const curve = curves.find(c => c.parameter === 'dub.filterDrop');
    expect(curve).toBeDefined();
    expect(curve!.points.some(p => p.row === 4 && p.value === 1)).toBe(true);
    expect(curve!.points.some(p => p.row === 16 && p.value === 0)).toBe(true);
  });

  it('global move (no channelId): stored as channelIndex=-1 curve', () => {
    const pattern = {
      id: 'p3',
      dubLane: {
        enabled: true,
        events: [
          { id: 'e3', moveId: 'springSlam', row: 8, params: {} },
        ],
      },
    } as any;

    migrateDubLaneEvents(pattern);

    const globalCurves = useAutomationStore.getState().getGlobalCurves('p3');
    expect(globalCurves.some(c => c.parameter === 'dub.springSlam')).toBe(true);
  });

  it('clears dubLane.events after migration', () => {
    const pattern = {
      id: 'p4',
      dubLane: {
        enabled: true,
        events: [{ id: 'e4', moveId: 'echoThrow', channelId: 0, row: 0, params: {} }],
      },
    } as any;

    migrateDubLaneEvents(pattern);

    expect(pattern.dubLane.events).toHaveLength(0);
  });

  it('no-op for patterns without dubLane', () => {
    const pattern = { id: 'p5' } as any;
    // Should not throw
    expect(() => migrateDubLaneEvents(pattern)).not.toThrow();
    const curves = useAutomationStore.getState().curves;
    expect(curves).toHaveLength(0);
  });
});
