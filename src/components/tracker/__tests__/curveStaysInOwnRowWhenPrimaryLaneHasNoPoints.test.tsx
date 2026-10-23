import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { AutomationLanes } from '../AutomationLanes';
import { automationLaneReserve } from '@hooks/views/automationLaneReserve';
import { useAutomationStore } from '@stores/useAutomationStore';
import type { AutomationCurve } from '@typedefs/automation';

const curve = (id: string, parameter: string): AutomationCurve => ({
  id, patternId: 'cur', channelIndex: 0, parameter,
  mode: 'curve', interpolation: 'linear', enabled: true,
  points: [{ row: 0, value: 0.2 }, { row: 7, value: 0.8 }],
}) as AutomationCurve;

const CH_OFFSET = 40;
const CH_WIDTH = 400;

describe('curve stays in its own row when the primary lane has no points', () => {
  beforeEach(() => {
    // Lane 1 (cutoff) has no points; lane 2 (resonance) does.
    useAutomationStore.setState({
      curves: [curve('b', 'resonance')],
      channelLanes: new Map([[0, {
        activeParameter: 'cutoff',
        activeParameters: ['cutoff', 'resonance'],
      }]]) as never,
    });
  });

  it('draws resonance in slot 1 and nothing in slot 0', () => {
    const { container } = render(
      <AutomationLanes
        patternId="cur" patternLength={16} rowHeight={16} channelCount={1}
        channelOffsets={[CH_OFFSET]} channelWidths={[CH_WIDTH]} rowNumWidth={CH_OFFSET}
      />,
    );
    const lanes = Array.from(container.querySelectorAll<HTMLElement>('[title^="CH 01"]'));
    expect(lanes).toHaveLength(1);
    const autoArea = automationLaneReserve(2);
    const perLane = Math.floor(autoArea / 2);
    const areaLeft = CH_WIDTH - autoArea;
    expect(parseFloat(lanes[0].style.left)).toBe(areaLeft + perLane + 1);
    expect(parseFloat(lanes[0].style.width)).toBe(perLane - 2);
  });
});
