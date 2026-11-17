import { describe, it, expect } from 'vitest';
import { useEditorStore } from '@stores/useEditorStore';
import { toggleLockCursorToOrder } from '../follow';

describe('toggleLockCursorToOrder', () => {
  it('flips the editor flag', () => {
    expect(useEditorStore.getState().lockCursorToOrder).toBe(false);
    toggleLockCursorToOrder();
    expect(useEditorStore.getState().lockCursorToOrder).toBe(true);
    toggleLockCursorToOrder();
    expect(useEditorStore.getState().lockCursorToOrder).toBe(false);
  });
});
