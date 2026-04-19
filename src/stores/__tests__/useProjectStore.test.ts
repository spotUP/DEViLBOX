import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../useProjectStore';
import { resetStore } from './_harness';

describe('useProjectStore', () => {
  beforeEach(() => resetStore(useProjectStore));

  it('starts clean, not dirty, never-saved', () => {
    const s = useProjectStore.getState();
    expect(s.isDirty).toBe(false);
    expect(s.lastSavedAt).toBeNull();
    expect(s.metadata.name).toBe('Untitled');
    expect(s.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('setMetadata merges updates and flags the project dirty', () => {
    useProjectStore.getState().setMetadata({ name: 'Regression Probe', author: 'tests' });
    const s = useProjectStore.getState();
    expect(s.metadata.name).toBe('Regression Probe');
    expect(s.metadata.author).toBe('tests');
    expect(s.isDirty).toBe(true);
  });

  it('markAsSaved clears dirty and stamps lastSavedAt', () => {
    useProjectStore.getState().setMetadata({ name: 'X' });
    useProjectStore.getState().markAsSaved();
    const s = useProjectStore.getState();
    expect(s.isDirty).toBe(false);
    expect(s.lastSavedAt).toBeTruthy();
    // ISO-ish string.
    expect(() => new Date(s.lastSavedAt!).toISOString()).not.toThrow();
  });

  it('markAsModified flags dirty and moves modifiedAt forward', async () => {
    const before = useProjectStore.getState().metadata.modifiedAt;
    await new Promise((r) => setTimeout(r, 2));
    useProjectStore.getState().markAsModified();
    const s = useProjectStore.getState();
    expect(s.isDirty).toBe(true);
    expect(s.metadata.modifiedAt >= before).toBe(true);
  });

  it('resetProject wipes back to a fresh Untitled state', () => {
    useProjectStore.getState().setMetadata({ name: 'Pre-reset', author: 'me' });
    useProjectStore.getState().markAsSaved();
    useProjectStore.getState().resetProject();
    const s = useProjectStore.getState();
    expect(s.metadata.name).toBe('Untitled');
    expect(s.metadata.author).toBe('Unknown');
    expect(s.isDirty).toBe(false);
    expect(s.lastSavedAt).toBeNull();
  });
});
