/**
 * NS-8: the engine selector in the instrument panel (WasmInfoEditor) for the loaded song's format. Full-word labels,
 * the effective choice selected, choosing an option goes through switchFormatEngine.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useFormatStore } from '@stores/useFormatStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { engineOptionsFor, engineNote, selectedEngine } from '@/engine/nuade/nuadeSelectOptions';
import { NUADE_FORMATS } from '@/engine/nuade/nuadeFormats';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const switchSpy = vi.fn(async () => ({ switched: true as const, reopened: false, stored: 'nuade' as const }));
vi.mock('@/lib/song/switchFormatEngine', () => ({ switchFormatEngine: (...a: unknown[]) => (switchSpy as (...x: unknown[]) => unknown)(...a) }));

import { WasmInfoEditor } from '../WasmInfoEditor';

afterEach(cleanup);
beforeEach(() => {
  switchSpy.mockClear();
  useSettingsStore.setState((s) => { delete (s.formatEngine as unknown as Record<string, unknown>).mmdc; });
  useFormatStore.getState().applyEditorMode({ format: 'MOD', nuadePlayerId: 'mmdc', nuadeFileData: new ArrayBuffer(4), nuadeFileName: 'a.mmdc' } as unknown as TrackerSong);
});

describe('NS-8 selector options', () => {
  it('uses full words, offers a replace row UADE and nuade, a dual row Our Engine too, and shows a measurement once there is one', () => {
    expect(engineOptionsFor(NUADE_FORMATS.mmdc!).map((o) => o.label)).toEqual(['UADE', 'nuade']);
    expect(engineOptionsFor(NUADE_FORMATS.soundmon!).map((o) => o.label)).toEqual(['Our Engine', 'UADE', 'nuade']);
    const measured = { ...NUADE_FORMATS.mmdc!, uadeEnvelopeCorrelation: 0.9961 };
    expect(engineOptionsFor(measured).map((o) => o.label)).toEqual(['UADE', 'nuade (0.996 like UADE)']);
    expect(engineNote(NUADE_FORMATS.mmdc!)).toBe('Not measured yet');
    expect(engineNote({ ...measured, heldBecause: 'ends 4 s early' })).toBe('Held on UADE: ends 4 s early');
    expect(selectedEngine(NUADE_FORMATS.earache!, 'native')).toBe('uade');
  });
});

describe('NS-8 WasmInfoEditor mounts the selector for the loaded format', () => {
  it('shows the format\'s current engine and sends a pick to switchFormatEngine', async () => {
    const { getByText, getAllByText, getAllByRole } = render(<WasmInfoEditor synthType={'NuadeSynth' as never} />);
    expect(getByText('OctaMED MMDC plays on')).toBeTruthy();
    const trigger = getAllByRole('button').find((b) => b.textContent?.includes('UADE'))!;
    fireEvent.click(trigger);
    fireEvent.click(getAllByText('nuade').pop()!);
    await waitFor(() => expect(switchSpy).toHaveBeenCalledWith('mmdc', 'nuade'));
  });

  it('shows no selector when the loaded song has no nuade player', () => {
    useFormatStore.getState().applyEditorMode({ format: 'MOD' } as unknown as TrackerSong);
    const { queryByText } = render(<WasmInfoEditor synthType={'GmeSynth' as never} />);
    expect(queryByText(/plays on/)).toBeNull();
  });
});
