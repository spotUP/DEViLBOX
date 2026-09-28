import { describe, it, expect } from 'vitest';
import { previewToRemoveOnSelect } from '../chainSelection';

describe('selecting a master chain effect while a preview is pending', () => {
  it('keeps the preview when its own card is clicked', () => {
    expect(previewToRemoveOnSelect('fx-preview', 'fx-preview')).toBeNull();
  });
  it('drops an unconfirmed preview when another effect is selected', () => {
    expect(previewToRemoveOnSelect('fx-preview', 'fx-other')).toBe('fx-preview');
  });
  it('removes nothing when no preview is pending', () => {
    expect(previewToRemoveOnSelect(null, 'fx-other')).toBeNull();
  });
});
