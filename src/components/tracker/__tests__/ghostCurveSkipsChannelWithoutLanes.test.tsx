import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { AutomationLanes } from '../AutomationLanes';
import { useAutomationStore } from '@stores/useAutomationStore';
import type { AutomationCurve } from '@typedefs/automation';

const ghost: AutomationCurve = {
  id: 'ghost', patternId: 'prev', channelIndex: 0, parameter: 'cutoff',
  mode: 'curve', interpolation: 'linear', enabled: true,
  points: [{ row: 0, value: 0.2 }, { row: 7, value: 0.8 }],
} as AutomationCurve;

const renderLanes = () => render(
  <AutomationLanes
    patternId="cur" patternLength={16} rowHeight={16} channelCount={1}
    channelOffsets={[40]} channelWidths={[300]} rowNumWidth={40}
    prevPatternId="prev" prevPatternLength={16}
  />,
);

describe('ghost curve on a channel without automation lanes', () => {
  beforeEach(() => {
    useAutomationStore.setState({ curves: [ghost], channelLanes: new Map() });
  });

  it('draws no ghost curve into the zero-width lane slot', () => {
    const { container } = renderLanes();
    expect(container.querySelectorAll('[title^="CH 01"]').length).toBe(0);
  });

  it('still draws the ghost once the channel has a lane in use', () => {
    useAutomationStore.setState({
      channelLanes: new Map([[0, { activeParameter: 'cutoff', activeParameters: ['cutoff'] }]]) as never,
    });
    const { container } = renderLanes();
    expect(container.querySelectorAll('[title^="CH 01"]').length).toBeGreaterThan(0);
  });
});
