import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DOMSynthPanel } from '../DOMSynthPanel';
import { KLYSTRACK_LAYOUT } from '@/constants/synthLayouts/klystrack';

class FakeResizeObserver { observe() {} unobserve() {} disconnect() {} }

describe('DOMSynthPanel with curves', () => {
  it('renders the klystrack layout on a config that holds no klystrack values (the tracker side panel) without crashing', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    // The side panel hands the bare instrument as config: every layout key reads undefined.
    const { container } = render(<DOMSynthPanel layout={KLYSTRACK_LAYOUT} config={{ id: 3, name: 'lead' } as Record<string, unknown>} onChange={() => {}} />);
    expect(container.querySelectorAll('canvas').length, 'the curves are drawn').toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
