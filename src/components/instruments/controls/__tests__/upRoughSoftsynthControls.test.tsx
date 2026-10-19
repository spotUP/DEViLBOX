// src/components/instruments/controls/__tests__/upRoughSoftsynthControls.test.tsx
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { UpRoughSoftsynthControls } from '@/components/instruments/controls/UpRoughSoftsynthControls';
import { SOFTSYNTH_VOICES } from '@/engine/uprough/voiceRegistry';
import { voiceDefaults } from '@/engine/uprough/softsynthVoice';
import type { UpRoughSoftsynthConfig } from '@/types/instrument';
import { UPROUGH_SOFTSYNTH_PRESETS } from '@/constants/synthPresets/upRoughSoftsynth';
import { getPresetsForSynthType } from '@/constants/synthPresets/allPresets';

const knobParams = (voiceId: string) =>
  SOFTSYNTH_VOICES.find((v) => v.id === voiceId)!.params.filter((p) => p.type === 'knob');

function Harness({ initial, onChange }: { initial: UpRoughSoftsynthConfig; onChange: (u: Partial<UpRoughSoftsynthConfig>) => void }) {
  const [cfg, setCfg] = useState(initial);
  return (
    <UpRoughSoftsynthControls
      config={cfg}
      instrumentId={1}
      onChange={(u) => { onChange(u); setCfg({ ...cfg, ...u }); }}
    />
  );
}

it('renders a knob per knob param of the selected voice and the knob set changes with the voice', () => {
  const [a, b] = [SOFTSYNTH_VOICES[0], SOFTSYNTH_VOICES[1]];
  const cfg = (id: string): UpRoughSoftsynthConfig => ({
    voice: id, params: voiceDefaults(SOFTSYNTH_VOICES.find((v) => v.id === id)!), seed: 0,
  });
  const first = render(<UpRoughSoftsynthControls config={cfg(a.id)} instrumentId={1} onChange={() => {}} />);
  for (const p of knobParams(a.id)) expect(screen.getAllByText(p.label).length).toBeGreaterThan(0);
  const onlyInA = knobParams(a.id).find((p) => !knobParams(b.id).some((q) => q.label === p.label))!;
  expect(screen.queryAllByText(onlyInA.label).length).toBeGreaterThan(0);
  first.unmount();
  render(<UpRoughSoftsynthControls config={cfg(b.id)} instrumentId={1} onChange={() => {}} />);
  expect(screen.queryAllByText(onlyInA.label).length).toBe(0);
  for (const p of knobParams(b.id)) expect(screen.getAllByText(p.label).length).toBeGreaterThan(0);
  cleanup();
});

it('moving a knob calls the update path with the new param value and keeps the other params', () => {
  const v = SOFTSYNTH_VOICES[0];
  const defaults = voiceDefaults(v);
  const knob = knobParams(v.id).find((p) => (p.max ?? 1) > defaults[p.key])!;
  const onChange = vi.fn();
  render(<Harness initial={{ voice: v.id, params: defaults, seed: 0 }} onChange={onChange} />);
  fireEvent.keyDown(screen.getAllByRole('slider', { name: knob.label })[0], { key: 'ArrowUp' });
  expect(onChange).toHaveBeenCalledTimes(1);
  const sent = onChange.mock.calls[0][0].params as Record<string, number>;
  expect(sent[knob.key]).toBeGreaterThan(defaults[knob.key]);
  expect({ ...sent, [knob.key]: 0 }).toEqual({ ...defaults, [knob.key]: 0 });
  cleanup();
});

it('Reset to defaults writes the voice defaults to the store update path', () => {
  const v = SOFTSYNTH_VOICES[0];
  const defaults = voiceDefaults(v);
  const key = Object.keys(defaults)[0];
  const onChange = vi.fn();
  render(<Harness initial={{ voice: v.id, params: { ...defaults, [key]: defaults[key] + 1 }, seed: 3 }} onChange={onChange} />);
  fireEvent.click(screen.getByText('Reset to defaults'));
  expect(onChange).toHaveBeenCalledWith({ params: defaults });
  cleanup();
});

it('ships one Golden Era preset per voice, registered for the synth type, with the voice defaults', () => {
  expect(UPROUGH_SOFTSYNTH_PRESETS.length).toBe(SOFTSYNTH_VOICES.length);
  expect(getPresetsForSynthType('UpRoughSoftsynth')).toBe(UPROUGH_SOFTSYNTH_PRESETS);
  for (const v of SOFTSYNTH_VOICES) {
    const p = UPROUGH_SOFTSYNTH_PRESETS.find((x) => x.config.voice === v.id)!;
    expect(p.config.params).toEqual(voiceDefaults(v));
  }
});
