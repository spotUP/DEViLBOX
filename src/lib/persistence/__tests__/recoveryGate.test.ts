import { describe, it, expect } from 'vitest';
import {
  shouldWriteRecovery,
  hasProjectContent,
  shouldPromptRestore,
} from '../recoveryGate';

/**
 * Feature: crash-recovery autosave (closes "never saved → tab crash → all work
 * lost"). Recovery is armed ONLY while the project was never explicitly saved;
 * once explicitly saved, the existing explicit-gated auto-save owns persistence.
 */
describe('recoveryGate — shouldWriteRecovery', () => {
  it('writes only when dirty, has content, and never explicitly saved', () => {
    expect(shouldWriteRecovery({ explicitlySaved: false, isDirty: true, hasContent: true })).toBe(true);
  });

  it('does NOT write once the project has been explicitly saved (scope ends)', () => {
    // Teeth: reverting the !explicitlySaved guard makes this fail.
    expect(shouldWriteRecovery({ explicitlySaved: true, isDirty: true, hasContent: true })).toBe(false);
  });

  it('does NOT write when there are no unsaved changes', () => {
    expect(shouldWriteRecovery({ explicitlySaved: false, isDirty: false, hasContent: true })).toBe(false);
  });

  it('does NOT write for an empty/pristine project', () => {
    expect(shouldWriteRecovery({ explicitlySaved: false, isDirty: true, hasContent: false })).toBe(false);
  });
});

describe('recoveryGate — hasProjectContent', () => {
  it('is false for a single empty default pattern with no instruments', () => {
    expect(hasProjectContent({ instrumentCount: 0, patternCount: 1 })).toBe(false);
  });

  it('is true once any instrument exists', () => {
    expect(hasProjectContent({ instrumentCount: 1, patternCount: 1 })).toBe(true);
  });

  it('is true once more than one pattern exists', () => {
    expect(hasProjectContent({ instrumentCount: 0, patternCount: 2 })).toBe(true);
  });

  it('is false for a genuinely empty project', () => {
    expect(hasProjectContent({ instrumentCount: 0, patternCount: 0 })).toBe(false);
  });
});

describe('recoveryGate — shouldPromptRestore', () => {
  it('prompts when a recovery record exists and the project was never explicitly saved', () => {
    expect(shouldPromptRestore({ hasRecoveryRecord: true, everExplicitlySaved: false })).toBe(true);
  });

  it('does NOT prompt when an explicit-save record exists (it is authoritative)', () => {
    // Teeth: dropping the everExplicitlySaved guard makes this fail.
    expect(shouldPromptRestore({ hasRecoveryRecord: true, everExplicitlySaved: true })).toBe(false);
  });

  it('does NOT prompt when there is no recovery record', () => {
    expect(shouldPromptRestore({ hasRecoveryRecord: false, everExplicitlySaved: false })).toBe(false);
  });
});
