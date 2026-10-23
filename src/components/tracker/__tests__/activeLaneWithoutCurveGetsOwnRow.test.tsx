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

describe('active lane without a curve gets its own row in the multi-lane renderer', () => {
  beforeEach(() => {
    // Three lanes in use, only the first and third have points yet.
    useAutomationStore.setState({
      curves: [curve('a', 'cutoff'), curve('c', 'pan')],
      channelLanes: new Map([[0, {
        activeParameter: 'cutoff',
        activeParameters: ['cutoff', 'resonance', 'pan'],
      }]]) as never,
    });
  });

  it('sizes and places lanes by the editor reserve (three lanes), not by curve count', () => {
    const { container } = render(
      <AutomationLanes
        patternId="cur" patternLength={16} rowHeight={16} channelCount={1}
        channelOffsets={[CH_OFFSET]} channelWidths={[CH_WIDTH]} rowNumWidth={CH_OFFSET}
      />,
    );
    const lanes = Array.from(container.querySelectorAll<HTMLElement>('[title^="CH 01"]'));
    const pan = lanes.find((el) => el.title.toLowerCase().includes('pan'));
    expect(pan).toBeTruthy();
    const autoArea = automationLaneReserve(3);
    const perLane = Math.floor(autoArea / 3);
    const areaLeft = CH_WIDTH - autoArea;
    // pan is lane index 2: third slot, with the empty resonance lane in slot 1.
    expect(parseFloat(pan!.style.left)).toBe(areaLeft + 2 * perLane + 1);
    expect(parseFloat(pan!.style.width)).toBe(perLane - 2);
  });
});
