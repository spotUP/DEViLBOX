import { describe, it, expect } from 'vitest';
import { instrumentDisplayName, formatInstrumentNumber } from '../instrumentDisplayName';

describe('instrumentDisplayName', () => {
  it('shows nothing for an unnamed slot, like ProTracker - no number, no made-up label', () => {
    expect(instrumentDisplayName({ id: 10, name: '' })).toBe('');
    expect(instrumentDisplayName({ id: 3, name: undefined })).toBe('');
    expect(instrumentDisplayName({ id: 3, name: null })).toBe('');
  });

  it('shows the stored name verbatim, spaces included (text art in name slots)', () => {
    expect(instrumentDisplayName({ id: 10, name: 'bassdrum' })).toBe('bassdrum');
    expect(instrumentDisplayName({ id: 10, name: ' greetings ' })).toBe(' greetings ');
    expect(instrumentDisplayName({ id: 10, name: '   ' })).toBe('   ');
  });

  it('formats slot numbers in hex or decimal, two digits', () => {
    expect(formatInstrumentNumber(255)).toBe('FF');
    expect(formatInstrumentNumber(255, false)).toBe('255');
    expect(formatInstrumentNumber(1, false)).toBe('01');
  });
});
