import { describe, it, expect } from 'vitest';
import { instrumentDisplayName, formatInstrumentNumber } from '../instrumentDisplayName';

describe('instrumentDisplayName', () => {
  it('shows the slot number for an unnamed instrument', () => {
    expect(instrumentDisplayName({ id: 10, name: '' })).toBe('0A');
    expect(instrumentDisplayName({ id: 10, name: '   ' }, false)).toBe('10');
    expect(instrumentDisplayName({ id: 3, name: undefined })).toBe('03');
    expect(instrumentDisplayName({ id: 3, name: null })).toBe('03');
  });

  it('shows the stored name when there is one', () => {
    expect(instrumentDisplayName({ id: 10, name: 'bassdrum' })).toBe('bassdrum');
    expect(instrumentDisplayName({ id: 10, name: ' greetings ' })).toBe('greetings');
  });

  it('formats slot numbers in hex or decimal, two digits', () => {
    expect(formatInstrumentNumber(255)).toBe('FF');
    expect(formatInstrumentNumber(255, false)).toBe('255');
    expect(formatInstrumentNumber(1, false)).toBe('01');
  });
});
