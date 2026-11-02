/**
 * A song playing on nuade holds its module in nuadeFileData, and the format's own field (hippelFileData ...) is empty.
 * Readers of the format's module (the Hippel linked-copy spans, the native export) find it through moduleHeldIn.
 */
import { describe, it, expect } from 'vitest';
import { moduleHeldIn } from '../formatFileDataFields';

describe('moduleHeldIn: the module a format field holds, also on nuade', () => {
  const module = new ArrayBuffer(4);
  it('returns the format field when it holds the module', () => {
    expect(moduleHeldIn({ hippelFileData: module } as never, 'hippelFileData')).toBe(module);
  });
  it('returns nuadeFileData when playOnNuade moved the module out of that field', () => {
    expect(moduleHeldIn({ nuadeFileData: module, nuadeModuleFields: ['hippelFileData'] }, 'hippelFileData')).toBe(module);
  });
  it('returns null for a field the nuade module never came from', () => {
    expect(moduleHeldIn({ nuadeFileData: module, nuadeModuleFields: ['uadeEditableFileData'] }, 'hippelFileData')).toBeNull();
  });
});
