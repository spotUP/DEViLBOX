import { describe, it, expect } from 'vitest';
import { wantsVrc6Cartridge } from '../nes/nesExport';

describe('wantsVrc6Cartridge', () => {
  it('takes 2A03 + VRC6 only', () => {
    expect(wantsVrc6Cartridge(['nes', 'vrc6'])).toBe(true);
    expect(wantsVrc6Cartridge(['vrc6'])).toBe(true);
    expect(wantsVrc6Cartridge(['nes'])).toBe(false);
    expect(wantsVrc6Cartridge(['nes', 'vrc6', 'n163'])).toBe(false);
  });
});
