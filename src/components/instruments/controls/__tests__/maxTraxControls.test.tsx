// src/components/instruments/controls/__tests__/maxTraxControls.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MaxTraxControls } from '@/components/instruments/controls/MaxTraxControls';
import { useFormatStore } from '@/stores/useFormatStore';

it('renders a control for every DiskSample field', () => {
  useFormatStore.getState().setMaxTraxData({ tempo:0, flags:0, headerRaw:new Uint8Array(),
    scores:[{events:[]}],
    tailRaw:new Uint8Array([0,1, 0,0, 0,0, 0,10, 0,1, 0,0,0,4, 0,0,0,4, 0,0, 0,0,  0,0,0,0]) });
  render(<MaxTraxControls sampleIndex={0} />);
  // getByText throws if the label is missing, so a truthy element proves it rendered.
  // (jest-dom's toBeInTheDocument isn't wired into this project's vitest setup.)
  for (const label of ['Number','Tune','Volume','Octaves','Attack Length','Sustain Length','Attack Count','Release Count']) {
    expect(screen.getByText(label)).toBeTruthy();
  }
});
