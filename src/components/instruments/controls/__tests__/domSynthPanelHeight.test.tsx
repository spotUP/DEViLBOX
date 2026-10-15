import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DOMSynthPanel } from '../DOMSynthPanel';
import type { SynthPanelLayout } from '@/types/synthPanel';

const layout: SynthPanelLayout = {
  name: 'Test',
  configKey: 'cfg',
  sections: [{ label: 'One', controls: [{ type: 'toggle', key: 'a', label: 'Alpha' }] }],
};

describe('DOMSynthPanel', () => {
  it('is as tall as its sections, so a fixed-height parent scrolls instead of clipping the bottom sections', () => {
    const { container } = render(
      <div style={{ height: 100 }}>
        <DOMSynthPanel layout={layout} config={{ cfg: {} }} onChange={() => {}} />
      </div>,
    );
    const panel = container.querySelector('.synth-editor-container') as HTMLElement;
    expect(panel.style.height).toBe('auto');
    expect(panel.style.flexShrink, 'a flex column must not shrink it either').toBe('0');
  });
});
