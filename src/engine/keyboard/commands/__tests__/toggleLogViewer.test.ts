import { describe, it, expect } from 'vitest';
import { useUIStore } from '@stores/useUIStore';
import { toggleLogViewer } from '../layout';

describe('toggleLogViewer', () => {
  it('opens and closes the log viewer modal', () => {
    toggleLogViewer();
    expect(useUIStore.getState().modalOpen).toBe('log-viewer');
    toggleLogViewer();
    expect(useUIStore.getState().modalOpen).toBeNull();
  });
});
