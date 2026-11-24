import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '@stores/useUIStore';

describe('closing the FX editor opened over the instrument editor', () => {
  beforeEach(() => {
    useUIStore.setState({ modalOpen: null, modalData: null, modalReturn: null });
  });

  it('returns to the instrument editor', () => {
    const ui = useUIStore.getState();
    ui.openModal('instruments');
    ui.openModal('instrumentFx');
    expect(useUIStore.getState().modalOpen).toBe('instrumentFx');
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().modalOpen).toBe('instruments');
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().modalOpen).toBeNull();
  });

  it('closes to nothing when the FX editor was opened alone', () => {
    useUIStore.getState().openModal('masterFx');
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().modalOpen).toBeNull();
  });
});
