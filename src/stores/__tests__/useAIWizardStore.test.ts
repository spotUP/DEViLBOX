import { describe, it, expect, beforeEach } from 'vitest';
import { useAIWizardStore } from '../useAIWizardStore';

describe('useAIWizardStore', () => {
  beforeEach(() => useAIWizardStore.setState({ isOpen: false, settled: false }));

  it('open shows the wizard; close hides it and marks it settled', () => {
    useAIWizardStore.getState().open();
    expect(useAIWizardStore.getState()).toMatchObject({ isOpen: true, settled: false });
    useAIWizardStore.getState().close();
    expect(useAIWizardStore.getState()).toMatchObject({ isOpen: false, settled: true });
  });
});
