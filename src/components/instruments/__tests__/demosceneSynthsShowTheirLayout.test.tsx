/**
 * Tunefish and WaveSabre opened an info panel ("XRNS WASM Synth - N parameters, loaded from an XRNS file") instead of
 * their editor, because the editor-mode table sent them to the XRNS placeholder before it looked for a layout.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { UnifiedInstrumentEditor } from '../editors/UnifiedInstrumentEditor';
import type { InstrumentConfig } from '@/types/instrument';

vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({}) }));
class FakeResizeObserver { observe() {} unobserve() {} disconnect() {} }

describe('demoscene synth editors', () => {
  it.each(['TunefishSynth', 'WaveSabreSynth', 'OidosSynth'] as const)('%s shows its layout, not the XRNS info panel', async (synthType) => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const instrument = { id: 1, name: synthType, type: 'synth', synthType, effects: [], volume: -6, pan: 0 } as unknown as InstrumentConfig;
    const { container, findAllByText } = render(<UnifiedInstrumentEditor instrument={instrument} onChange={() => {}} />);
    await findAllByText(/./, undefined, { timeout: 20000 }).catch(() => undefined);
    expect(container.textContent ?? '').not.toMatch(/XRNS WASM Synth/);
    expect(container.querySelector('.synth-editor-container'), 'a synth panel is drawn').not.toBeNull();
    vi.unstubAllGlobals();
  }, 30000);
});
