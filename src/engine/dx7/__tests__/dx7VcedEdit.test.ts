import { describe, it, expect } from 'vitest';
import { mergeVced, nameToVced, vcedDelta, vcedName } from '../dx7VcedEdit';

describe('DX7 VCED edit helpers', () => {
  it('a knob drag value between two steps is sent as the whole number the firmware takes', () => {
    expect(vcedDelta({ '135': 3 }, { '135': 3.14 })).toEqual({});
    expect(vcedDelta({ '135': 3 }, { '135': 3.6 })).toEqual({ '135': 4 });
  });
  it('a select string and a toggle boolean become numbers, unchanged keys are left out', () => {
    expect(vcedDelta({ '11': 0, '17': 0, '5': 9 }, { '11': '2', '17': true, '5': 9 })).toEqual({ '11': 2, '17': 1 });
  });
  it('edits lie over the sounding voice; no voice yet leaves just the edits', () => {
    expect(mergeVced({ '0': 1, '1': 2 }, { '1': 9 })).toEqual({ '0': 1, '1': 9 });
    expect(mergeVced(null, undefined)).toEqual({});
  });
  it('the name round-trips through the ten VCED bytes, padded with spaces and printable ASCII only', () => {
    const bytes = nameToVced('Brass');
    expect(Object.keys(bytes)).toHaveLength(10);
    expect(bytes['150']).toBe(32);
    expect(vcedName(bytes)).toBe('Brass');
    expect(vcedName({})).toBe('');
  });
});
